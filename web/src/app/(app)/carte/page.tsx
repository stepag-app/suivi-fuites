'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATUTS, libellesMarche, messageErreur } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import type { StatutFuite } from '@/lib/types';
import { Carte, type CarteRef } from './Carte';
import { COLONNES_CARTE, aUneAlerte, geometrieValide, jourMaroc, type Contour, type FuiteCarte } from './commun';
import type { ChoixImpression } from './impression';
import { PanneauImpression } from './PanneauImpression';

type SecteurCarte = Contour & { zone_id: string | null };

const jourFr = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR');

export default function PageCarte() {
  const { marche, peut } = useSession();
  const libelles = libellesMarche(marche);
  const [fuites, setFuites] = useState<FuiteCarte[]>([]);
  const [secteurs, setSecteurs] = useState<SecteurCarte[]>([]);
  const [zones, setZones] = useState<Contour[]>([]);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);
  const [statuts, setStatuts] = useState<StatutFuite[]>([]);
  const [secteur, setSecteur] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [alertesSeules, setAlertesSeules] = useState(false);
  const [impressionOuverte, setImpressionOuverte] = useState(false);
  const carte = useRef<CarteRef>(null);

  const marcheId = marche?.id;
  // Une réponse arrivée après un changement de marché (ou une actualisation plus récente) est ignorée.
  const derniereDemande = useRef(0);
  const charger = useCallback(async () => {
    if (!marcheId) return;
    const demande = ++derniereDemande.current;
    setErreur('');
    // Sans réseau, inutile d'attendre les nouvelles tentatives : la carte a besoin de la connexion.
    if (!navigator.onLine) {
      setErreur('Pas de réseau : la carte des fuites s\'affichera au retour de la connexion (bouton « Actualiser »).');
      setChargement(false);
      return;
    }
    setChargement(true);
    const sb = getSupabase();
    try {
      const [f, s, z] = await Promise.all([
        lireTout<FuiteCarte>((de, a) => sb.from('v_fuites').select(COLONNES_CARTE).eq('marche_id', marcheId)
          .order('numero').range(de, a) as unknown as PromiseLike<{ data: FuiteCarte[] | null; error: { message: string } | null }>),
        sb.from('secteurs').select('id, zone_id, code, libelle, geom').eq('marche_id', marcheId).eq('actif', true).order('libelle'),
        sb.from('zones').select('id, code, libelle, geom').eq('marche_id', marcheId).eq('actif', true).order('numero'),
      ]);
      if (demande !== derniereDemande.current) return;
      if (s.error) throw s.error;
      if (z.error) throw z.error;
      setFuites(f);
      setSecteurs((s.data as SecteurCarte[] | null) ?? []);
      setZones((z.data as Contour[] | null) ?? []);
    } catch (e) {
      if (demande !== derniereDemande.current) return;
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const filtrees = useMemo(
    () => fuites.filter((f) => {
      if (statuts.length && !statuts.includes(f.statut)) return false;
      if (secteur && f.secteur_id !== secteur) return false;
      if (alertesSeules && !aUneAlerte(f)) return false;
      if (du || au) {
        const j = jourMaroc(f.date_detection);
        if (du && j < du) return false;
        if (au && j > au) return false;
      }
      return true;
    }),
    [fuites, statuts, secteur, du, au, alertesSeules],
  );
  const placees = filtrees.filter((f) => f.latitude != null && f.longitude != null);
  const sansPosition = filtrees.length - placees.length;

  // Contours affichés : le secteur choisi (ou tous), et seulement s'ils sont dessinés.
  const secteursAffiches = useMemo(
    () => secteurs.filter((s) => (!secteur || s.id === secteur) && geometrieValide(s.geom)),
    [secteurs, secteur],
  );
  const zonesAffichees = useMemo(() => zones.filter((z) => geometrieValide(z.geom)), [zones]);

  const compteurs = useMemo(() => {
    const c: Partial<Record<StatutFuite, number>> = {};
    fuites.forEach((f) => (c[f.statut] = (c[f.statut] ?? 0) + 1));
    return c;
  }, [fuites]);

  // Filtres appliqués, écrits dans le PDF de la carte.
  const libelleSecteur = secteurs.find((s) => s.id === secteur)?.libelle;
  const descriptionFiltres = [
    statuts.length > 0 && `statut : ${statuts.map((s) => STATUTS[s].libelle).join(' / ')}`,
    libelleSecteur && `secteur : ${libelleSecteur}`,
    du && au ? `détectées du ${jourFr(du)} au ${jourFr(au)}` : du ? `détectées depuis le ${jourFr(du)}` : au ? `détectées jusqu'au ${jourFr(au)}` : '',
    alertesSeules && 'alertes seulement',
  ].filter(Boolean).join(' ; ');
  const filtresImpression = `Filtres : ${descriptionFiltres || 'aucun (toutes les fuites du marché)'}`;

  const imprimer = async (choix: ChoixImpression, etape: (texte: string) => void) => {
    const etat = carte.current?.etatImpression();
    if (!etat || !marcheId) throw new Error('La carte n\'est pas encore affichée : attendez la fin du chargement puis réessayez.');
    const { imprimerCarte } = await import('./impression');
    const r = await imprimerCarte(marcheId, choix, {
      etat, fuites: filtrees, zones: zonesAffichees, secteurs: secteursAffiches,
      filtres: filtresImpression, libelleReference: libelles.reference,
    }, etape);
    return `PDF téléchargé (${(r.octets / 1048576).toFixed(1).replace('.', ',')} Mo, ${Math.max(1, Math.round(r.secondes))} s).`;
  };

  const basculer = (s: StatutFuite) =>
    setStatuts((liste) => (liste.includes(s) ? liste.filter((x) => x !== s) : [...liste, s]));
  const filtresActifs = statuts.length > 0 || !!secteur || !!du || !!au || alertesSeules;

  // Après un changement de filtre, la vue se recadre sur les fuites restantes.
  const premierCadrage = useRef(true);
  const cleFiltres = `${statuts.join(',')}|${secteur}|${du}|${au}|${alertesSeules}|${fuites.length}`;
  useEffect(() => {
    if (premierCadrage.current) {
      premierCadrage.current = false;
      return;
    }
    carte.current?.recentrer();
  }, [cleFiltres]);

  return (
    <div className="page-carte">
      <div className="barre">
        <h1>
          Carte des fuites{' '}
          <span className="discret">
            ({placees.length} sur la carte{sansPosition > 0 ? `, ${sansPosition} sans position` : ''})
          </span>
        </h1>
        <div className="actions">
          <button className="gros" onClick={() => carte.current?.recentrer()}>Recentrer</button>
          <button className="gros" onClick={charger} disabled={chargement}>Actualiser</button>
          {peut('exports', 'lire') && (
            <button className="gros" onClick={() => setImpressionOuverte(true)} disabled={chargement || !!erreur}>
              Imprimer la carte
            </button>
          )}
        </div>
      </div>

      {/* Les pastilles servent aussi de légende : couleur du point = couleur du badge. */}
      <div className="pastilles legende-carte" role="group" aria-label="Statuts (légende et filtre)">
        {(Object.keys(STATUTS) as StatutFuite[]).map((s) => (
          <button
            key={s}
            className={`pastille ${STATUTS[s].classe} ${statuts.includes(s) ? 'choisie' : ''}`}
            aria-pressed={statuts.includes(s)}
            onClick={() => basculer(s)}
          >
            <span className={`point-legende pt-${s}`} aria-hidden="true" />
            {STATUTS[s].libelle} · {compteurs[s] ?? 0}
          </button>
        ))}
        <span className="pastille legende-alerte"><span className="point-legende pt-alerte" aria-hidden="true" />En alerte</span>
      </div>

      <div className="filtres">
        <label>
          Secteur
          <select value={secteur} onChange={(e) => setSecteur(e.target.value)}>
            <option value="">Tous les secteurs</option>
            {secteurs.map((s) => (
              <option key={s.id} value={s.id}>{s.libelle}</option>
            ))}
          </select>
        </label>
        <label>
          Détectées du
          <input type="date" value={du} max={au || undefined} onChange={(e) => setDu(e.target.value)} />
        </label>
        <label>
          au
          <input type="date" value={au} min={du || undefined} onChange={(e) => setAu(e.target.value)} />
        </label>
        <label className="ligne">
          <input type="checkbox" checked={alertesSeules} onChange={(e) => setAlertesSeules(e.target.checked)} />
          Alertes seulement
        </label>
        {filtresActifs && (
          <button onClick={() => { setStatuts([]); setSecteur(''); setDu(''); setAu(''); setAlertesSeules(false); }}>
            Effacer les filtres
          </button>
        )}
      </div>

      {erreur && <p className="erreur">{erreur}</p>}
      {chargement && <p className="discret">Chargement des fuites…</p>}
      {!chargement && !erreur && placees.length === 0 && (
        <p className="discret">
          {fuites.length === 0 ? 'Aucune fuite dans ce marché.' : 'Aucune fuite géolocalisée ne correspond aux filtres.'}
        </p>
      )}

      <Carte ref={carte} fuites={placees} zones={zonesAffichees} secteurs={secteursAffiches} libelles={libelles} />

      <PanneauImpression
        ouvert={impressionOuverte}
        fermer={() => setImpressionOuverte(false)}
        titreDefaut={`Carte des fuites – ${libelleSecteur ?? marche?.code ?? ''}`}
        nombreSurCarte={placees.length}
        nombreListe={filtrees.length}
        filtres={filtresImpression}
        imprimer={imprimer}
      />
    </div>
  );
}

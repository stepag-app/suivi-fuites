'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STATUTS, libellesMarche, messageErreur, nombre } from '@/lib/format';
import { compterBalayagesEnAttente, ecouterAttente, synchroniser } from '@/lib/hors-ligne';
import { preparerBalayages, type ChoixBalayage } from '@/lib/reseau/balayage';
import { annulerDernierBalayage, enregistrerBalayages, messageReseau } from '@/lib/reseau/donnees';
import {
  appliquerSelection, construireAdjacence, formaterLineaire, idsIndexDansAnneau, lineaireSelection, prolongerSelection, type ModeSelection,
} from '@/lib/reseau/selection';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import type { StatutFuite } from '@/lib/types';
import { Carte, type CarteRef, type ReseauCarteProps } from './Carte';
import { COLONNES_CARTE, aUneAlerte, geometrieValide, jourMaroc, type Contour, type FuiteCarte } from './commun';
import type { ChoixImpression } from './impression';
import { PanneauImpression } from './PanneauImpression';
import { PanneauReseau, type BalayagePanneau } from './PanneauReseau';
import styles from './reseau.module.css';
import { useReseau } from './useReseau';

type SecteurCarte = Contour & { zone_id: string | null };

const jourFr = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString('fr-FR');
// Sélection de balayage non enregistrée : gardée le temps de la session (la WebView de l'APK se recharge).
const cleSelection = (marcheId: string) => `suivi-fuites:balayage:selection:${marcheId}`;

// useSearchParams (« ?mode=balayage », ouverture par l'APK) demande une frontière Suspense.
export default function PageCarte() {
  return (
    <Suspense fallback={<p className="discret">Chargement…</p>}>
      <CarteDesFuites />
    </Suspense>
  );
}

function CarteDesFuites() {
  const { marche, peut } = useSession();
  const parametres = useSearchParams();
  const ouvertureBalayage = parametres.get('mode') === 'balayage';
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
  const [reseauOuvert, setReseauOuvert] = useState(ouvertureBalayage);
  const carte = useRef<CarteRef>(null);

  const marcheId = marche?.id;
  const peutBalayer = peut('balayage', 'creer');
  const peutAnnuler = peut('balayage', 'supprimer') || peut('balayage', 'valider');
  const reseau = useReseau(marcheId, peut('balayage', 'lire'), ouvertureBalayage);

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

  // ---- Mode balayage : sélection au doigt, enregistrement, file d'attente -----------------------------
  const [modeBalayage, setModeBalayage] = useState(ouvertureBalayage && peutBalayer);
  const [selection, setSelectionEtat] = useState<Set<string>>(new Set());
  const [occupe, setOccupe] = useState(false);
  const [messageBalayage, setMessageBalayage] = useState('');
  const [enAttente, setEnAttente] = useState(0);

  useEffect(() => {
    if (!marcheId) return;
    try {
      const m = window.sessionStorage.getItem(cleSelection(marcheId));
      const liste = m ? (JSON.parse(m) as unknown) : null;
      setSelectionEtat(new Set(Array.isArray(liste) ? liste.filter((x): x is string => typeof x === 'string') : []));
    } catch {
      setSelectionEtat(new Set());
    }
  }, [marcheId]);
  const setSelection = useCallback((s: Set<string>) => {
    setSelectionEtat(s);
    if (!marcheId) return;
    try {
      window.sessionStorage.setItem(cleSelection(marcheId), JSON.stringify([...s]));
    } catch {
      /* stockage indisponible */
    }
  }, [marcheId]);
  const surSelection = useCallback((ids: string[], mode: ModeSelection) => {
    setSelectionEtat((courante) => {
      const s = appliquerSelection(courante, ids, mode);
      if (marcheId) {
        try {
          window.sessionStorage.setItem(cleSelection(marcheId), JSON.stringify([...s]));
        } catch {
          /* stockage indisponible */
        }
      }
      return s;
    });
  }, [marcheId]);

  const longueurs = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, t] of reseau.index) m.set(id, t.longueur);
    return m;
    // L'index vit hors de l'état React : il suit les secteurs affichés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reseau.secteursAffiches]);
  const lineaire = useMemo(() => lineaireSelection(selection, longueurs), [selection, longueurs]);

  // Outils du mode balayage : toucher un par un, lasso au doigt, « Prolonger » le long de la rue.
  const [outilBalayage, setOutilBalayage] = useState<'toucher' | 'lasso'>('toucher');
  const indexReseau = reseau.index;
  const surLasso = useCallback((anneau: number[][]) => {
    const ids = idsIndexDansAnneau(indexReseau.values(), anneau);
    if (ids.length) surSelection(ids, 'ajouter');
  }, [indexReseau, surSelection]);
  const prolonger = () => {
    const ajoutes = prolongerSelection(indexReseau, construireAdjacence(indexReseau.values()), selection);
    if (ajoutes.length) {
      surSelection(ajoutes, 'ajouter');
      setMessageBalayage('');
    } else {
      setMessageBalayage('Rien à prolonger : jonction à 3 branches, bout de rue ou changement de direction (± 20°).');
    }
  };

  const rafraichirAttente = useCallback(async () => setEnAttente(await compterBalayagesEnAttente()), []);
  useEffect(() => {
    rafraichirAttente();
    const arreter = ecouterAttente(rafraichirAttente);
    const enLigne = () => { synchroniser().then(rafraichirAttente).catch(() => undefined); };
    window.addEventListener('online', enLigne);
    const minuteur = setInterval(() => {
      compterBalayagesEnAttente().then((n) => { if (n > 0 && navigator.onLine) enLigne(); });
    }, 30000);
    return () => {
      arreter();
      window.removeEventListener('online', enLigne);
      clearInterval(minuteur);
    };
  }, [rafraichirAttente]);

  const enregistrer = async (choix: Omit<ChoixBalayage, 'marcheId'>) => {
    if (!marcheId || selection.size === 0) return;
    setOccupe(true);
    setMessageBalayage('');
    try {
      const lignes = preparerBalayages(selection, { ...choix, marcheId, sourceSaisie: 'web' });
      const { restants } = await enregistrerBalayages(lignes);
      setSelection(new Set());
      setMessageBalayage(restants === 0
        ? `${lignes.length} balayage${lignes.length > 1 ? 's' : ''} enregistré${lignes.length > 1 ? 's' : ''}.`
        : `${lignes.length} balayage${lignes.length > 1 ? 's' : ''} gardé${lignes.length > 1 ? 's' : ''} sur l'appareil : envoi au retour du réseau.`);
      await rafraichirAttente();
      await reseau.recharger();
    } catch (e) {
      setMessageBalayage(`Erreur : ${messageReseau(e)}`);
    }
    setOccupe(false);
  };

  const envoyer = async () => {
    try {
      await synchroniser();
    } catch {
      /* réessayé plus tard */
    }
    await rafraichirAttente();
    await reseau.rechargerEtats();
  };

  const annuler = useCallback(async (tronconId: string) => {
    const motif = window.prompt('Motif de l\'annulation du dernier balayage de ce tronçon :');
    if (motif == null || !motif.trim()) return;
    try {
      const fait = await annulerDernierBalayage(tronconId, motif);
      setMessageBalayage(fait ? 'Balayage annulé.' : 'Aucun balayage à annuler sur ce tronçon.');
      await reseau.recharger();
    } catch (e) {
      setMessageBalayage(`Erreur : ${messageReseau(e)}`);
    }
  }, [reseau]);

  const basculerBalayage = () => {
    if (!modeBalayage) {
      reseau.setActif(true);
      setReseauOuvert(true);
    }
    setModeBalayage((v) => !v);
  };

  const balayage: BalayagePanneau = {
    peut: peutBalayer, actif: modeBalayage, basculer: basculerBalayage, selection, lineaire,
    vider: () => setSelection(new Set()), enregistrer, occupe, message: messageBalayage, enAttente, envoyer, peutAnnuler,
  };

  const reseauCarte: ReseauCarteProps | undefined = reseau.actif ? {
    secteurs: reseau.secteursAffiches, coloration: reseau.coloration, palette: reseau.palette, etats: reseau.etats,
    libelles: reseau.libelles, modeBalayage, outil: outilBalayage, selection, surSelection, surLasso, peutAnnuler, annuler, surZoom: reseau.surZoom,
  } : undefined;

  // Filtres appliqués, écrits dans le PDF de la carte.
  const libelleSecteur = secteurs.find((s) => s.id === secteur)?.libelle;
  const descriptionFiltres = [
    statuts.length > 0 && `statut : ${statuts.map((s) => STATUTS[s].libelle).join(' / ')}`,
    libelleSecteur && `secteur : ${libelleSecteur}`,
    du && au ? `détectées du ${jourFr(du)} au ${jourFr(au)}` : du ? `détectées depuis le ${jourFr(du)}` : au ? `détectées jusqu'au ${jourFr(au)}` : '',
    alertesSeules && 'alertes seulement',
  ].filter(Boolean).join(' ; ');
  const nbSecteursReseau = reseau.actif ? reseau.secteursAffiches.filter((s) => s.data).length : 0;
  const descriptionReseau = nbSecteursReseau > 0
    ? ` ; réseau : ${nbSecteursReseau} secteur${nbSecteursReseau > 1 ? 's' : ''}, coloré par ${reseau.coloration === 'balayage' ? 'état de balayage' : reseau.coloration === 'diametre' ? 'diamètre' : 'secteur'}`
    : '';
  const filtresImpression = `Filtres : ${descriptionFiltres || 'aucun (toutes les fuites du marché)'}${descriptionReseau}`;

  const imprimer = async (choix: ChoixImpression, etape: (texte: string) => void) => {
    const etat = carte.current?.etatImpression();
    if (!etat || !marcheId) throw new Error('La carte n\'est pas encore affichée : attendez la fin du chargement puis réessayez.');
    const { imprimerCarte } = await import('./impression');
    const r = await imprimerCarte(marcheId, choix, {
      etat, fuites: filtrees, zones: zonesAffichees, secteurs: secteursAffiches,
      filtres: filtresImpression, libelleReference: libelles.reference,
      reseau: reseau.actif ? { secteurs: reseau.secteursAffiches, coloration: reseau.coloration, palette: reseau.palette, etats: reseau.etats } : null,
      zonesReseau: reseau.contexte?.zones ?? [],
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
          <button className={`gros ${styles['bouton-panneau']}`} aria-pressed={reseauOuvert} onClick={() => setReseauOuvert((v) => !v)}>
            Réseau{reseau.actif && nbSecteursReseau > 0 ? ` (${nbSecteursReseau})` : ''}
          </button>
          {peutBalayer && (
            <button className={`gros ${styles['bouton-panneau']}`} aria-pressed={modeBalayage} onClick={basculerBalayage}>
              Balayage{selection.size > 0 ? ` (${selection.size})` : ''}
            </button>
          )}
          <button className="gros" onClick={() => carte.current?.recentrer()}>Recentrer</button>
          <button className="gros" onClick={() => { charger(); reseau.recharger(); }} disabled={chargement}>Actualiser</button>
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
      {modeBalayage && (
        <p className="carte attention" role="status">
          Mode balayage : touchez les tronçons balayés un par un, ou tracez un lasso au doigt autour d&apos;eux ; « Prolonger » suit la rue
          jusqu&apos;à la prochaine jonction. Puis « Enregistrer » (équipe, date, méthode) dans le panneau Réseau.
          {messageBalayage && !reseauOuvert ? ` ${messageBalayage}` : ''}
        </p>
      )}

      <div className={styles.ensemble}>
        <Carte ref={carte} fuites={placees} zones={zonesAffichees} secteurs={secteursAffiches} libelles={libelles} reseau={reseauCarte} />
        {modeBalayage && (
          <div className={`${styles.barreBalayage} ${reseauOuvert ? styles.avecPanneau : ''}`} role="toolbar" aria-label="Outils du mode balayage">
            <span className={styles.compte} aria-live="polite">
              {nombre(selection.size, 0)} tronçon{selection.size > 1 ? 's' : ''} · {formaterLineaire(lineaire)}
            </span>
            <button type="button" aria-pressed={outilBalayage === 'toucher'} onClick={() => setOutilBalayage('toucher')}>Toucher</button>
            <button type="button" aria-pressed={outilBalayage === 'lasso'} onClick={() => setOutilBalayage('lasso')}>Lasso</button>
            <button type="button" disabled={selection.size === 0} onClick={prolonger}>Prolonger</button>
            <button type="button" disabled={selection.size === 0} onClick={() => setSelection(new Set())}>Désélectionner tout</button>
            <button type="button" className="primaire" disabled={selection.size === 0 || occupe} onClick={() => setReseauOuvert(true)}>Enregistrer…</button>
          </div>
        )}
        {reseauOuvert && <PanneauReseau reseau={reseau} balayage={balayage} fermer={() => setReseauOuvert(false)} />}
      </div>

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

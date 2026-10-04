'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { quantite, type ReglesAttachement, type Unite } from '@/lib/attachements';
import { STATUTS, dateSeule, messageErreur } from '@/lib/format';
import { getSupabase, lireTout } from '@/lib/supabase';
import type { StatutFuite } from '@/lib/types';

const AFFICHAGE_MAX = 150;
const cleUnite = (u: Pick<Unite, 'fuite_id' | 'prix_id'>) => `${u.fuite_id}|${u.prix_id}`;

// Travaux exécutés et pas encore attachés (régularisations comprises), à cocher
// par fuite ou par article, puis ajoutés au brouillon.
export function AAttacher({
  marcheId, lotId, regles, zones, version, ajoute, onErreur,
}: {
  marcheId: string; lotId: string; regles: ReglesAttachement; zones: { id: string; libelle: string }[];
  version: number; ajoute: () => void; onErreur: (m: string) => void;
}) {
  const [unites, setUnites] = useState<Unite[]>([]);
  const [chargement, setChargement] = useState(true);
  const [choix, setChoix] = useState<Set<string>>(new Set());
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [zone, setZone] = useState('');
  const [secteur, setSecteur] = useState('');
  const [equipe, setEquipe] = useState('');
  const [article, setArticle] = useState('');
  const [etat, setEtat] = useState<ReglesAttachement['fuites_admissibles']>(regles.fuites_admissibles);
  const [texte, setTexte] = useState('');
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      setUnites(await lireTout<Unite>((de, a) => getSupabase().from('v_a_attacher').select('*')
        .eq('marche_id', marcheId).neq('reste', 0).order('fuite_numero').order('prix_ordre').range(de, a)));
    } catch (e) {
      onErreur(messageErreur(e));
      setUnites([]);
    }
    setChoix(new Set());
    setChargement(false);
  }, [marcheId, onErreur]);

  useEffect(() => {
    charger();
  }, [charger, version]);

  const disponibles = unites.filter((u) => u.brouillon_id !== lotId);
  const options = (cle: 'secteur' | 'equipe', id: 'secteur_id' | 'equipe_id') =>
    [...new Map(disponibles.filter((u) => u[id]).map((u) => [u[id] as string, u[cle] as string])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  const articles = [...new Map(disponibles.map((u) => [u.prix_id, u.prix_numero])).entries()];

  const filtrees = useMemo(() => {
    const t = texte.trim().toLowerCase();
    return disponibles.filter((u) => {
      const jour = u.reparee_le?.slice(0, 10) ?? '';
      return (!du || (jour && jour >= du)) && (!au || (jour && jour <= au))
        && (!zone || u.zone_id === zone) && (!secteur || u.secteur_id === secteur)
        && (!equipe || u.equipe_id === equipe) && (!article || u.prix_id === article)
        && (etat === 'toutes' || (etat === 'verrouillees' ? u.verrouillee : u.statut === 'achevee'))
        && (!t || String(u.fuite_numero) === t || (u.reference_srm ?? '').toLowerCase().includes(t)
          || (u.adresse ?? '').toLowerCase().includes(t));
    });
  }, [disponibles, du, au, zone, secteur, equipe, article, etat, texte]);

  const parFuite = useMemo(() => {
    const m = new Map<string, Unite[]>();
    filtrees.forEach((u) => m.set(u.fuite_id, [...(m.get(u.fuite_id) ?? []), u]));
    return [...m.values()];
  }, [filtrees]);

  const cochables = filtrees.filter((u) => !u.brouillon_id);
  const basculer = (cles: string[], coche: boolean) =>
    setChoix((c) => {
      const n = new Set(c);
      cles.forEach((k) => (coche ? n.add(k) : n.delete(k)));
      return n;
    });

  async function ajouter() {
    const lignes = cochables.filter((u) => choix.has(cleUnite(u))).map((u) => ({
      marche_id: marcheId, attachement_id: lotId, nature: 'solde', fuite_id: u.fuite_id, prix_id: u.prix_id,
    }));
    if (!lignes.length) return;
    setOccupe(true);
    const { error } = await getSupabase().from('attachement_lignes').insert(lignes);
    setOccupe(false);
    if (error) {
      onErreur(messageErreur(error));
      return;
    }
    ajoute();
  }

  const nbChoisies = cochables.filter((u) => choix.has(cleUnite(u))).length;

  return (
    <section className="carte">
      <div className="barre">
        <h2>À attacher <span className="discret">({parFuite.length} fuite{parFuite.length > 1 ? 's' : ''}, {filtrees.length} unité{filtrees.length > 1 ? 's' : ''})</span></h2>
        <button className="primaire" disabled={occupe || nbChoisies === 0} onClick={ajouter}>
          Ajouter au lot ({nbChoisies})
        </button>
      </div>
      <div className="filtres">
        <label>Réparées du<input type="date" value={du} onChange={(e) => setDu(e.target.value)} /></label>
        <label>au<input type="date" value={au} onChange={(e) => setAu(e.target.value)} /></label>
        <label>
          Zone
          <select value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">Toutes</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.libelle}</option>)}
          </select>
        </label>
        <label>
          Secteur
          <select value={secteur} onChange={(e) => setSecteur(e.target.value)}>
            <option value="">Tous</option>
            {options('secteur', 'secteur_id').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Équipe
          <select value={equipe} onChange={(e) => setEquipe(e.target.value)}>
            <option value="">Toutes</option>
            {options('equipe', 'equipe_id').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Article
          <select value={article} onChange={(e) => setArticle(e.target.value)}>
            <option value="">Tous</option>
            {articles.map(([k, v]) => <option key={k} value={k}>Prix {v}</option>)}
          </select>
        </label>
        <label>
          Fuites
          <select value={etat} onChange={(e) => setEtat(e.target.value as ReglesAttachement['fuites_admissibles'])}>
            <option value="toutes">Toutes</option>
            <option value="verrouillees">Verrouillées (validées)</option>
            <option value="achevees">Achevées</option>
          </select>
        </label>
        <label>Recherche<input value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="N°, référence, adresse" /></label>
      </div>
      <div className="actions">
        <button onClick={() => basculer(cochables.map(cleUnite), true)}>Tout cocher</button>
        <button onClick={() => setChoix(new Set())}>Rien</button>
      </div>
      {chargement && <p className="discret">Chargement…</p>}
      {!chargement && parFuite.length === 0 && <p className="discret">Rien à attacher avec ces filtres.</p>}
      {parFuite.slice(0, AFFICHAGE_MAX).map((g) => {
        const t = g[0];
        const cles = g.filter((u) => !u.brouillon_id).map(cleUnite);
        const toutes = cles.length > 0 && cles.every((k) => choix.has(k));
        return (
          <div key={t.fuite_id} className="bloc">
            <label className="ligne">
              <input type="checkbox" checked={toutes} disabled={cles.length === 0} onChange={(e) => basculer(cles, e.target.checked)} />
              <span>
                <strong>Fuite N° {t.fuite_numero}</strong>
                {t.reference_srm ? ` · ${t.reference_srm}` : ''}{t.secteur ? ` · ${t.secteur}` : ''}
                {' '}<span className={`badge ${STATUTS[t.statut as StatutFuite]?.classe ?? ''}`}>{STATUTS[t.statut as StatutFuite]?.libelle ?? t.statut}</span>
                {t.verrouillee && <span className="etiquette">Verrouillée</span>}
                <br />
                <span className="discret">
                  Réparée le {dateSeule(t.reparee_le)} · {t.refectionnee_le ? `réfection le ${dateSeule(t.refectionnee_le)}` : 'réfection non faite'}
                  {t.equipe ? ` · ${t.equipe}` : ''}
                </span>
              </span>
            </label>
            <div className="unites">
              {g.map((u) => (
                <label key={cleUnite(u)} className="ligne unite">
                  <input
                    type="checkbox"
                    disabled={!!u.brouillon_id}
                    checked={choix.has(cleUnite(u))}
                    onChange={(e) => basculer([cleUnite(u)], e.target.checked)}
                  />
                  <span>
                    Prix {u.prix_numero} : <strong>{quantite(u.reste, u.unite, regles.decimales)}</strong> {u.unite}
                    {u.dernier_lot != null && (
                      <span className={`etiquette ${u.reste < 0 ? 'etiquette-alerte' : ''}`}>
                        Régularisation (exécuté {quantite(u.quantite_executee, u.unite, regles.decimales)}, déjà attaché {quantite(u.quantite_attachee, u.unite, regles.decimales)})
                      </span>
                    )}
                    {u.brouillon_id && <span className="discret"> · déjà dans un autre brouillon</span>}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      {parFuite.length > AFFICHAGE_MAX && (
        <p className="discret">Seules les {AFFICHAGE_MAX} premières fuites sont affichées : affinez les filtres (période, secteur…).</p>
      )}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { quantite, type ReglesAttachement, type Unite } from '@/lib/attachements';
import { STATUTS, dateSeule, messageErreur } from '@/lib/format';
import { getSupabase, lireTout } from '@/lib/supabase';
import type { StatutFuite } from '@/lib/types';
import { BadgeControles } from '../BadgeControles';
import type { Controle } from '../controles';
import { CorrectionsFuite } from './CorrectionsFuite';
import type { ArticleChoix } from './FormsLignes';

const AFFICHAGE_MAX = 150;

// N° de fuite cliquable : la fiche (photos, réparations, réfections) s'ouvre dans un nouvel onglet,
// la sélection en cours du lot reste en place.
export function LienFuite({ id, numero }: { id: string; numero: number | null }) {
  return (
    <Link href={`/fuites/${id}`} target="_blank" rel="noopener" className="lien-fuite" title="Ouvrir la fiche de la fuite dans un nouvel onglet">
      N° {numero} ↗
    </Link>
  );
}
const cleUnite = (u: Pick<Unite, 'fuite_id' | 'prix_id'>) => `${u.fuite_id}|${u.prix_id}`;

// Travaux exécutés et pas encore attachés (régularisations comprises), à cocher
// par fuite ou par article, puis ajoutés au brouillon. Contrôles en défaut par fuite et
// corrections (requalification, ligne, pièce) : lot R.
export function AAttacher({
  marcheId, lotId, regles, zones, version, ajoute, onErreur, controles, bordereau, peutCorriger,
}: {
  marcheId: string; lotId: string; regles: ReglesAttachement; zones: { id: string; libelle: string }[];
  version: number; ajoute: () => void; onErreur: (m: string) => void;
  controles: Map<string, Controle[]>; bordereau: ArticleChoix[]; peutCorriger: boolean;
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
  const [enDefaut, setEnDefaut] = useState(false);
  const [correction, setCorrection] = useState<string | null>(null);
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
        && (!enDefaut || controles.has(u.fuite_id))
        && (!t || String(u.fuite_numero) === t || (u.reference_srm ?? '').toLowerCase().includes(t)
          || (u.adresse ?? '').toLowerCase().includes(t));
    });
  }, [disponibles, du, au, zone, secteur, equipe, article, etat, texte, enDefaut, controles]);

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
        <label className="ligne">
          <input type="checkbox" checked={enDefaut} onChange={(e) => setEnDefaut(e.target.checked)} /> Contrôles en défaut seulement
        </label>
      </div>
      <div className="actions">
        <button onClick={() => basculer(cochables.map(cleUnite), true)}>Tout cocher</button>
        <button onClick={() => setChoix(new Set())}>Rien</button>
      </div>
      {chargement && <p className="discret">Chargement…</p>}
      {!chargement && parFuite.length === 0 && <p className="discret">Rien à attacher avec ces filtres.</p>}
      {parFuite.length > 0 && (
        <div className="defilement">
          <table className="liste-compacte">
            <thead>
              <tr>
                <th aria-label="Toute la fuite" /><th>Fuite</th><th>Référence</th><th>Secteur</th><th>État</th><th>Contrôles</th>
                <th>Réparée le</th><th>Réfection</th><th>Équipe</th><th>Unités à attacher (prix, reste)</th>
                {peutCorriger && <th aria-label="Corrections" />}
              </tr>
            </thead>
            <tbody>
              {parFuite.slice(0, AFFICHAGE_MAX).map((g, i) => {
                const t = g[0];
                const cles = g.filter((u) => !u.brouillon_id).map(cleUnite);
                const toutes = cles.length > 0 && cles.every((k) => choix.has(k));
                const statut = STATUTS[t.statut as StatutFuite];
                const zebre = i % 2 === 1 ? 'zebre' : '';
                return (
                  <Fragment key={t.fuite_id}>
                    <tr className={zebre}>
                      <td>
                        <input type="checkbox" checked={toutes} disabled={cles.length === 0} aria-label={`Toute la fuite N° ${t.fuite_numero}`}
                          onChange={(e) => basculer(cles, e.target.checked)} />
                      </td>
                      <td className="nowrap"><LienFuite id={t.fuite_id} numero={t.fuite_numero} /></td>
                      <td className="nowrap">{t.reference_srm ?? '—'}</td>
                      <td>{t.secteur ?? '—'}</td>
                      <td className="nowrap">
                        <span className={`badge ${statut?.classe ?? ''}`}>{statut?.libelle ?? t.statut}</span>
                        {t.verrouillee && <span className="etiquette">Verrouillée</span>}
                      </td>
                      <td><BadgeControles liste={controles.get(t.fuite_id)} /></td>
                      <td className="nowrap">{dateSeule(t.reparee_le)}</td>
                      <td className="nowrap">{t.refectionnee_le ? dateSeule(t.refectionnee_le) : <span className="discret">non faite</span>}</td>
                      <td>{t.equipe ?? '—'}</td>
                      <td>
                        <div className="unites-ligne">
                          {g.map((u) => (
                            <label key={cleUnite(u)} className="unite-ligne">
                              <input
                                type="checkbox"
                                disabled={!!u.brouillon_id}
                                checked={choix.has(cleUnite(u))}
                                onChange={(e) => basculer([cleUnite(u)], e.target.checked)}
                              />
                              P{u.prix_numero} <strong>{quantite(u.reste, u.unite, regles.decimales)}</strong> {u.unite}
                              {u.dernier_lot != null && (
                                <span className={`etiquette ${u.reste < 0 ? 'etiquette-alerte' : ''}`}>
                                  Régul. lot {u.dernier_lot} ({quantite(u.quantite_executee, u.unite, regles.decimales)} − {quantite(u.quantite_attachee, u.unite, regles.decimales)})
                                </span>
                              )}
                              {u.brouillon_id && <span className="discret">(autre brouillon)</span>}
                            </label>
                          ))}
                        </div>
                      </td>
                      {peutCorriger && (
                        <td className="nowrap">
                          <button className="petit" onClick={() => setCorrection(correction === t.fuite_id ? null : t.fuite_id)}>
                            {correction === t.fuite_id ? 'Fermer' : 'Corriger'}
                          </button>
                        </td>
                      )}
                    </tr>
                    {correction === t.fuite_id && (
                      <tr className={zebre}>
                        <td colSpan={11}>
                          <CorrectionsFuite
                            marcheId={marcheId} fuiteId={t.fuite_id} fuiteNumero={t.fuite_numero}
                            controles={controles.get(t.fuite_id) ?? []} articles={bordereau}
                            fermer={() => setCorrection(null)} corrige={ajoute}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {parFuite.length > AFFICHAGE_MAX && (
        <p className="discret">Seules les {AFFICHAGE_MAX} premières fuites sont affichées : affinez les filtres (période, secteur…).</p>
      )}
    </section>
  );
}

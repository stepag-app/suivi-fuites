'use client';

import { Fragment, useMemo, useState } from 'react';
import { STATUTS } from '@/lib/format';
import type { StatutFuite } from '@/lib/types';
import {
  ORDRE_STATUTS, graduations, jourCourt, parGroupe, trierGroupes,
  type ColonneGroupe, type FuiteTdb, type LigneGroupe, type Periode, type Regroupement, type Semaine,
} from '@/lib/ui/tableau-de-bord';
import styles from './tableau-de-bord.module.css';

export const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? motPluriel : mot}`;
const pourcent = (n: number, total: number) => (total ? `${Math.round((100 * n) / total)} %` : '—');

export function Segments<T extends string>({ choix, valeur, onChange, libelle }: {
  choix: [T, string][]; valeur: T; onChange: (v: T) => void; libelle: string;
}) {
  return (
    <div className={styles.segments} role="group" aria-label={libelle}>
      {choix.map(([v, texte]) => (
        <button key={v} type="button" aria-pressed={v === valeur} onClick={() => onChange(v)}>{texte}</button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Répartition par statut : une barre empilée par ensemble, légende en tableau
// ---------------------------------------------------------------------------
function Pile({ repartition, libelle }: { repartition: Record<StatutFuite, number>; libelle: string }) {
  const total = ORDRE_STATUTS.reduce((s, k) => s + repartition[k], 0);
  const presents = ORDRE_STATUTS.filter((k) => repartition[k] > 0);
  return (
    <div className={styles.pileBloc}>
      <div className={styles.pileTitre}><span>{libelle}</span><span className="discret">{pluriel(total, 'fuite')}</span></div>
      <div
        className={styles.pile} role="img"
        aria-label={`${libelle} : ${presents.map((k) => `${STATUTS[k].libelle} ${repartition[k]}`).join(', ') || 'aucune fuite'}`}
      >
        {presents.map((k) => (
          <span key={k} className={`${styles.segment} ${styles[k]}`} style={{ flexGrow: repartition[k] }}
            title={`${STATUTS[k].libelle} : ${repartition[k]} (${pourcent(repartition[k], total)})`} />
        ))}
      </div>
    </div>
  );
}

export function RepartitionStatuts({ periode, tout, libellePeriode }: {
  periode: Record<StatutFuite, number>; tout: Record<StatutFuite, number>; libellePeriode: string;
}) {
  const totalPeriode = ORDRE_STATUTS.reduce((s, k) => s + periode[k], 0);
  const totalTout = ORDRE_STATUTS.reduce((s, k) => s + tout[k], 0);
  return (
    <>
      <Pile repartition={periode} libelle={`Détectées sur la période (${libellePeriode})`} />
      <Pile repartition={tout} libelle="Toutes les fuites du marché" />
      <table className={styles.legendeStatuts}>
        <thead>
          <tr><th>Statut actuel</th><th className="num">Période</th><th className="num">Marché</th></tr>
        </thead>
        <tbody>
          {ORDRE_STATUTS.map((k) => (
            <tr key={k}>
              <td><span className={`${styles.puce} ${styles[k]}`} aria-hidden="true" />{STATUTS[k].libelle}</td>
              <td className="num">{periode[k]} <span className="discret">({pourcent(periode[k], totalPeriode)})</span></td>
              <td className="num">{tout[k]} <span className="discret">({pourcent(tout[k], totalTout)})</span></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>Total</td><td className="num">{totalPeriode}</td><td className="num">{totalTout}</td></tr>
        </tfoot>
      </table>
    </>
  );
}

// ---------------------------------------------------------------------------
// Évolution par semaine : détectées et réparées, colonnes groupées sur un seul axe
// ---------------------------------------------------------------------------
export function EvolutionSemaines({ semaines }: { semaines: Semaine[] }) {
  const [choisie, setChoisie] = useState<number | null>(null);
  const max = Math.max(0, ...semaines.flatMap((s) => [s.detectees, s.reparees]));
  const grad = graduations(max);
  const haut = grad[grad.length - 1];
  const i = choisie ?? semaines.length - 1;
  const s = semaines[i];
  const total = (cle: 'detectees' | 'reparees') => semaines.reduce((t, x) => t + x[cle], 0);
  const hauteur = (v: number) => ({ height: `${(100 * v) / haut}%` });

  return (
    <>
      <ul className={styles.legende}>
        <li><span className={`${styles.puce} ${styles.serieDetectees}`} aria-hidden="true" />Détectées ({total('detectees')})</li>
        <li><span className={`${styles.puce} ${styles.serieReparees}`} aria-hidden="true" />Réparées ({total('reparees')})</li>
      </ul>
      <p className={styles.detail} aria-live="polite">
        Semaine {s.numero} (du {jourCourt(s.lundi)} au {jourCourt(s.dimanche)}) : <b>{pluriel(s.detectees, 'détectée')}</b>,{' '}
        <b>{pluriel(s.reparees, 'réparée')}</b>
        {s.delaiMoyenH != null && <>, délai moyen <b>{Math.round(s.delaiMoyenH)} h</b></>}
      </p>
      <div className={styles.graphique}>
        <div className={styles.axe} aria-hidden="true">
          {grad.map((g) => <span key={g} style={{ bottom: `${(100 * g) / haut}%` }}>{g}</span>)}
        </div>
        <div className={styles.trace} onMouseLeave={() => setChoisie(null)}>
          {grad.slice(1).map((g) => <span key={g} className={styles.grille} style={{ bottom: `${(100 * g) / haut}%` }} />)}
          {semaines.map((x, j) => (
            <button
              key={x.lundi} type="button" className={`${styles.semaine} ${j === i ? styles.semaineChoisie : ''}`}
              onMouseEnter={() => setChoisie(j)} onFocus={() => setChoisie(j)} onClick={() => setChoisie(j)}
              aria-label={`Semaine ${x.numero} : ${pluriel(x.detectees, 'détectée')}, ${pluriel(x.reparees, 'réparée')}`}
            >
              <span className={`${styles.colonne} ${styles.serieDetectees} ${x.detectees ? styles.nonNulle : ''}`} style={hauteur(x.detectees)} />
              <span className={`${styles.colonne} ${styles.serieReparees} ${x.reparees ? styles.nonNulle : ''}`} style={hauteur(x.reparees)} />
            </button>
          ))}
        </div>
        <span />
        <div className={styles.etiquettes} aria-hidden="true">
          {semaines.map((x, j) => (
            <span key={x.lundi} className={(semaines.length - 1 - j) % 2 ? styles.etiquetteSecondaire : ''}>S{x.numero}</span>
          ))}
        </div>
      </div>
      <details className={styles.chiffres}>
        <summary>Voir les chiffres</summary>
        <div className="defilement">
          <table>
            <thead>
              <tr><th>Semaine</th><th>Du … au …</th><th className="num">Détectées</th><th className="num">Réparées</th><th className="num">Délai moyen</th></tr>
            </thead>
            <tbody>
              {semaines.map((x) => (
                <tr key={x.lundi}>
                  <td>S{x.numero}</td>
                  <td>{jourCourt(x.lundi)} – {jourCourt(x.dimanche)}</td>
                  <td className="num">{x.detectees}</td>
                  <td className="num">{x.reparees}</td>
                  <td className="num">{x.delaiMoyenH == null ? '—' : `${Math.round(x.delaiMoyenH)} h`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

// ---------------------------------------------------------------------------
// Par secteur ou par zone : tableau trié, petites barres
// ---------------------------------------------------------------------------
type ColonneChiffre = Exclude<ColonneGroupe, 'libelle'>;
const COLONNES: { cle: ColonneChiffre; titre: string; aide: string; serie: string }[] = [
  { cle: 'detectees', titre: 'Détectées', aide: 'détectées sur la période', serie: styles.serieDetectees },
  { cle: 'reparees', titre: 'Réparées', aide: 'réparées sur la période', serie: styles.serieReparees },
  { cle: 'enAttente', titre: 'En attente', aide: 'non réparées à ce jour (détectées ou réparation en cours)', serie: styles.serieAttente },
  { cle: 'alertes', titre: 'Alertes', aide: 'fuites en alerte à ce jour (mêmes alertes que la liste des fuites)', serie: styles.serieAlertes },
];

export function TableauGroupes({ fuites, periode }: { fuites: FuiteTdb[]; periode: Periode }) {
  const [regroupement, setRegroupement] = useState<Regroupement>('secteur');
  const [tri, setTri] = useState<{ colonne: ColonneGroupe; decroissant: boolean }>({ colonne: 'detectees', decroissant: true });
  const lignes = useMemo(
    () => trierGroupes(parGroupe(fuites, periode, regroupement), tri.colonne, tri.decroissant),
    [fuites, periode, regroupement, tri],
  );
  const maxima = useMemo(
    () => Object.fromEntries(COLONNES.map((c) => [c.cle, Math.max(1, ...lignes.map((l) => l[c.cle]))])) as Record<ColonneChiffre, number>,
    [lignes],
  );
  const trier = (colonne: ColonneGroupe) =>
    setTri((t) => (t.colonne === colonne ? { colonne, decroissant: !t.decroissant } : { colonne, decroissant: colonne !== 'libelle' }));
  const enTete = (colonne: ColonneGroupe, titre: string, aide: string) => (
    <th title={aide}
      aria-sort={tri.colonne === colonne ? (tri.decroissant ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={styles.tri} aria-pressed={tri.colonne === colonne} onClick={() => trier(colonne)}>
        {titre}{tri.colonne === colonne ? (tri.decroissant ? ' ▼' : ' ▲') : ''}
      </button>
    </th>
  );
  const somme = (cle: ColonneChiffre) => lignes.reduce((s, l) => s + l[cle], 0);

  return (
    <section className="carte">
      <div className={styles.teteCarte}>
        <h2>Par {regroupement}</h2>
        <Segments libelle="Regrouper par" valeur={regroupement} onChange={setRegroupement}
          choix={[['secteur', 'Secteur'], ['zone', 'Zone']]} />
      </div>
      {lignes.length === 0 ? <p className="discret">Rien à afficher pour cette période.</p> : (
        <div className="defilement">
          <table className={styles.groupes}>
            <thead>
              <tr>
                {enTete('libelle', regroupement === 'secteur' ? 'Secteur' : 'Zone', 'ordre alphabétique')}
                {COLONNES.map((c) => <Fragment key={c.cle}>{enTete(c.cle, c.titre, c.aide)}</Fragment>)}
              </tr>
            </thead>
            <tbody>
              {lignes.map((l: LigneGroupe) => (
                <tr key={l.cle || 'aucun'}>
                  <td>{l.libelle}{l.zone && <span className={styles.zone}>{l.zone}</span>}</td>
                  {COLONNES.map((c) => (
                    <td key={c.cle}>
                      <span className={styles.valeurBarre}>
                        <span>{l[c.cle]}</span>
                        <span className={`${styles.jauge} ${c.serie}`} aria-hidden="true">
                          {l[c.cle] > 0 && <span style={{ width: `${(100 * l[c.cle]) / maxima[c.cle]}%` }} />}
                        </span>
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                {COLONNES.map((c) => <td key={c.cle}><span className={styles.valeurBarre}><span>{somme(c.cle)}</span><span /></span></td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className={`discret ${styles.note}`}>
        Détectées et réparées : sur la période choisie. En attente et alertes : situation à ce jour.
      </p>
    </section>
  );
}

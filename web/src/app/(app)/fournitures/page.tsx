'use client';

// Inventaire des fournitures posées (lot P3, chantier v2 X3) : inventaire réel (v_pieces_reelles : corrections du bureau
// comprises, pièces remplacées ou retirées exclues), regroupé par article Dolibarr ; lignes et colonnes au choix, filtres
// (période, fuite, zone, secteur, chef d'équipe, famille, terrain / bureau) dans l'adresse, totaux, export Excel. Responsable
// et administrateur (droit « quantités / lire »). Aucun montant : les fournitures sont comprises dans les prix.
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CarteIndicateur, GrilleIndicateurs } from '@/components/carte-indicateur';
import { messageErreur } from '@/lib/format';
import { useSession } from '@/lib/session';
import { getSupabase, lireTout } from '@/lib/supabase';
import {
  COLONNES_INVENTAIRE, LIBELLES_PROVENANCE, articlesParQuantite, formaterQuantite, resumeFournitures, unitesDe,
  type LigneInventaire,
} from '@/lib/ui/fournitures';
import { COLONNES_DETAIL, colonnesInventaireCroise, lignesInventaireCroise } from './export';
import {
  DIMENSIONS_COLONNES, DIMENSIONS_LIGNES, MOIS_MAX, appliquerFiltres, croiser, decrireFiltres, filtresRapidesActifs,
  libelleDimension, libellePeriode, libellesChoisis, lienCellule, lignesDetailExport, periodeEffective, valeursFiltre,
  type Cellule, type DimensionColonne, type DimensionLigne, type EnteteCroise, type FiltresInventaire, type ValeurFiltre,
} from './inventaire';
import styles from './fournitures.module.css';
import { useFiltresFournitures } from './useFiltresFournitures';

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? motPluriel : mot}`;

// useSearchParams demande une frontière Suspense (page rendue côté navigateur).
export default function PageFournitures() {
  return (
    <Suspense fallback={<p className="discret">Chargement…</p>}>
      <Inventaire />
    </Suspense>
  );
}

function Segments<T extends string>({ libelle, choix, valeur, onChange }: {
  libelle: string; choix: [T, string][]; valeur: T; onChange: (v: T) => void;
}) {
  return (
    <div>
      <span>{libelle}</span>
      <div className={styles.segments} role="group" aria-label={libelle}>
        {choix.map(([v, texte]) => (
          <button key={v} type="button" aria-pressed={v === valeur} onClick={() => onChange(v)}>{texte}</button>
        ))}
      </div>
    </div>
  );
}

// Une rangée de filtres rapides : chaque puce donne le nombre de pièces qu'elle laisserait.
function Puces({ titre, valeurs, onChoisir, classe }: {
  titre: string; valeurs: ValeurFiltre[]; onChoisir: (cle: string) => void; classe?: (cle: string) => string;
}) {
  if (valeurs.length === 0) return null;
  return (
    <div className={styles.rangee} role="group" aria-label={titre}>
      <span>{titre}</span>
      {valeurs.map((v) => (
        <button key={v.cle || 'aucun'} type="button" aria-pressed={v.choisie}
          className={[styles.puce, v.pieces === 0 ? styles.vide : '', classe?.(v.cle) ?? ''].filter(Boolean).join(' ')}
          title={v.pieces ? pluriel(v.pieces, 'pièce') : 'Aucune pièce avec les autres filtres'}
          onClick={() => onChoisir(v.choisie ? '' : v.cle)}>
          {v.libelle} <b>{v.pieces}</b>
        </button>
      ))}
    </div>
  );
}

function Inventaire() {
  const { marche, peut } = useSession();
  const marcheId = marche?.id;
  const lire = peut('quantites', 'lire');
  const { filtres, changer, effacerRapides } = useFiltresFournitures();
  const [lignes, setLignes] = useState<LigneInventaire[]>([]);
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [exportEnCours, setExportEnCours] = useState(false);

  // Période effective : mois en cours par défaut, 12 mois au plus (le jour de référence est celui du chargement).
  const periode = useMemo(() => periodeEffective(filtres, maintenant ?? undefined), [filtres, maintenant]);

  // Une réponse arrivée après un changement de marché ou de période est ignorée.
  const derniereDemande = useRef(0);
  const charger = useCallback(async () => {
    if (!marcheId || !lire) return;
    const demande = ++derniereDemande.current;
    setChargement(true);
    setErreur('');
    try {
      const sb = getSupabase();
      const l = await lireTout<LigneInventaire>((de, a) => sb.from('v_inventaire_fournitures').select(COLONNES_INVENTAIRE)
        .eq('marche_id', marcheId).gte('jour', periode.du).lte('jour', periode.au)
        .order('jour').order('fuite_numero').order('id').range(de, a));
      if (demande !== derniereDemande.current) return;
      setLignes(l);
      setMaintenant((m) => m ?? new Date());
    } catch (e) {
      if (demande !== derniereDemande.current) return;
      setLignes([]);
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [marcheId, lire, periode.du, periode.au]);

  useEffect(() => {
    charger();
  }, [charger]);

  const filtrees = useMemo(() => appliquerFiltres(lignes, filtres), [lignes, filtres]);
  const croisement = useMemo(() => croiser(filtrees, filtres), [filtrees, filtres]);
  const resume = useMemo(() => resumeFournitures(filtrees), [filtrees]);
  const nbArticles = useMemo(() => articlesParQuantite(filtrees).length, [filtrees]);
  const valeurs = useMemo(() => ({
    provenance: valeursFiltre(lignes, filtres, 'provenance'),
    famille: valeursFiltre(lignes, filtres, 'famille'),
    zone: valeursFiltre(lignes, filtres, 'zone'),
    secteur: valeursFiltre(lignes, filtres, 'secteur'),
    chef: valeursFiltre(lignes, filtres, 'chef'),
  }), [lignes, filtres]);
  const description = useMemo(() => decrireFiltres(filtres, periode, libellesChoisis(lignes, filtres)), [filtres, periode, lignes]);
  const titrePeriode = libellePeriode(periode);

  // Excel : le tableau croisé affiché, puis le détail par pièce (en-tête du marché, logos compris).
  async function exporterExcel() {
    if (!marcheId || !filtrees.length) return;
    setExportEnCours(true);
    setErreur('');
    try {
      const [{ exporter }, { construireSection }, { construireEntete }, { chargerContexteRapport }, { chargerMatricules }] = await Promise.all([
        import('@/lib/export/generer'), import('@/lib/export/modele'), import('@/lib/export/jeux'), import('@/lib/export/rapport-fuite'),
        import('@/lib/export/matricules'),
      ]);
      const [ctx, matricules] = await Promise.all([chargerContexteRapport(marcheId, false), chargerMatricules(marcheId)]);
      // R4 : le chef d'équipe désigné par son matricule dans le document
      const enDocument = filtrees.map((l) => ({ ...l, chef: l.chef_id ? matricules.agent(l.chef_id, l.chef) : l.chef }));
      const croisementDoc = croiser(enDocument, filtres);
      const libelleLignes = libelleDimension(filtres.lignes);
      await exporter({
        nomFichier: `fournitures-posees-${String(ctx.marche.code ?? '')}`,
        entete: construireEntete(ctx, 'Inventaire des fournitures posées', [
          ...decrireFiltres(filtres, periode, libellesChoisis(enDocument, filtres)),
          `Lignes : ${libelleLignes} · Colonnes : ${libelleDimension(filtres.colonnes)}`,
          'Inventaire réel : corrections du bureau comprises, pièces remplacées ou retirées exclues ; aucun montant',
        ]),
        sections: [
          construireSection(lignesInventaireCroise(croisementDoc), colonnesInventaireCroise(croisementDoc, libelleLignes), { titre: 'Inventaire' }),
          construireSection(lignesDetailExport(enDocument) as unknown as Record<string, unknown>[], COLONNES_DETAIL as never, { titre: 'Détail', total: false }),
        ],
        orientation: 'paysage',
        genereLe: new Date(),
      }, 'xlsx');
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setExportEnCours(false);
  }

  if (!lire) return <p className="carte">Votre compte n&apos;a pas accès à l&apos;inventaire des fournitures (responsable ou administrateur).</p>;

  const unites = unitesDe(resume.quantites);
  const avecColonnes = filtres.colonnes !== 'aucune';
  const lien = (ligne: EnteteCroise | null, colonne: EnteteCroise | null, cellule: Cellule) =>
    lienCellule(croisement, filtres, ligne, colonne, cellule);
  const infoCellule = (c: Cellule) => (c.pieces ? `${pluriel(c.pieces, 'pièce')} sur ${pluriel(c.fuites, 'fuite')}` : undefined);
  const chiffre = (c: Cellule, ligne: EnteteCroise | null, colonne: EnteteCroise | null) => {
    if (!c.pieces) return <span className={styles.vide}>—</span>;
    const l = lien(ligne, colonne, c);
    return l
      ? <Link href={l.href} prefetch={false} className={styles.lien} aria-label={`${c.texte} : ${l.libelle}`} title={infoCellule(c)}>{c.texte}</Link>
      : <span title={infoCellule(c)}>{c.texte}</span>;
  };

  return (
    <div className="ancien">
      <div className="barre">
        <h1>Fournitures posées <span className="sous-titre">{marche?.code} · {titrePeriode}</span></h1>
        <div className="actions en-tete">
          <button onClick={charger} disabled={chargement}>Actualiser</button>
          {peut('exports', 'lire') && (
            <button onClick={exporterExcel} disabled={exportEnCours || !filtrees.length}>{exportEnCours ? 'Export…' : 'Excel'}</button>
          )}
          <Link href="/fournitures/rapprochement" className="bouton">Rapprochement Dolibarr ›</Link>
        </div>
      </div>
      <p className={`discret ${styles.intro}`}>
        Inventaire réel des fournitures posées sur les réparations de la période, par article Dolibarr : saisies du terrain et
        corrections du bureau (oubli, remplacement), pièces remplacées ou retirées exclues. Les fournitures sont comprises dans
        les prix de réparation : aucun montant ici. Jours comptés à l&apos;heure du Maroc.
      </p>
      {erreur && <p className="erreur">{erreur}</p>}

      <section className={`carte ${styles.filtres}`} aria-label="Filtres">
        <div className={styles.saisies}>
          <label>
            Réparées du
            <input type="date" value={filtres.du} max={filtres.au || undefined} onChange={(e) => changer({ du: e.target.value }, true)} />
          </label>
          <label>
            au
            <input type="date" value={filtres.au} min={filtres.du || undefined} onChange={(e) => changer({ au: e.target.value }, true)} />
          </label>
          <label>
            Fuite N°
            <input className={styles.numero} inputMode="numeric" pattern="[0-9]*" placeholder="toutes" value={filtres.fuite}
              onChange={(e) => changer({ fuite: e.target.value.replace(/\D/g, '') }, true)} aria-label="Numéro de fuite" />
          </label>
          <span className="discret">{MOIS_MAX} mois au plus ; sans date, le mois en cours.</span>
          {filtresRapidesActifs(filtres) && <button type="button" className={styles.effacer} onClick={effacerRapides}>Effacer les filtres</button>}
        </div>
        <Puces titre="Saisie" valeurs={valeurs.provenance} onChoisir={(v) => changer({ provenance: v as FiltresInventaire['provenance'] })}
          classe={(cle) => (cle === 'correction' ? styles.puceCorrection : '')} />
        <Puces titre="Famille" valeurs={valeurs.famille} onChoisir={(v) => changer({ famille: v })} />
        <Puces titre="Zone" valeurs={valeurs.zone} onChoisir={(v) => changer({ zone: v, secteur: v && filtres.secteur ? '' : filtres.secteur })} />
        <Puces titre="Secteur" valeurs={valeurs.secteur} onChoisir={(v) => changer({ secteur: v })} />
        <Puces titre="Chef d'équipe" valeurs={valeurs.chef} onChoisir={(v) => changer({ chef: v })} />
      </section>

      <GrilleIndicateurs className="mb-4">
        <CarteIndicateur libelle="Quantité posée" valeur={unites.length ? resume.quantites[unites[0]] : 0} unite={unites[0] ?? 'U'}
          commentaire={unites.length > 1
            ? `et ${unites.slice(1).map((u) => formaterQuantite(resume.quantites[u], u)).join(', ')}`
            : pluriel(resume.pieces, 'pièce saisie', 'pièces saisies')} />
        <CarteIndicateur libelle="Articles distincts" valeur={nbArticles} commentaire={pluriel(resume.pieces, 'pièce saisie', 'pièces saisies')} />
        <CarteIndicateur libelle="Fuites concernées" valeur={resume.fuites} commentaire={`réparées ${titrePeriode}`} />
        <CarteIndicateur libelle="Corrections du bureau" valeur={resume.partCorrections} unite="%" ton={resume.corrections ? 'critique' : 'normal'}
          commentaire={resume.pieces ? `${pluriel(resume.corrections, 'pièce')} sur ${resume.pieces} (oubli, remplacement)` : 'aucune pièce sur la période'} />
      </GrilleIndicateurs>

      <section className="carte">
        <div className={styles.tete}>
          <h2>Inventaire croisé <span className="sous-titre">{pluriel(resume.pieces, 'pièce')}, {pluriel(resume.fuites, 'fuite')}</span></h2>
          <div className={styles.dimensions}>
            <Segments libelle="Lignes" choix={DIMENSIONS_LIGNES} valeur={filtres.lignes} onChange={(v: DimensionLigne) => changer({ lignes: v })} />
            <Segments libelle="Colonnes" choix={DIMENSIONS_COLONNES} valeur={filtres.colonnes} onChange={(v: DimensionColonne) => changer({ colonnes: v })} />
          </div>
        </div>
        {chargement && <p className="discret">Chargement…</p>}
        {!chargement && filtrees.length === 0 && (
          <p className="discret">Aucune fourniture posée {titrePeriode}{filtresRapidesActifs(filtres) ? ' avec ces filtres' : ''}.</p>
        )}
        {filtrees.length > 0 && (
          <div className={styles.defilement}>
            <table className={styles.croise}>
              <thead>
                <tr>
                  <th>{libelleDimension(filtres.lignes)}</th>
                  {croisement.entetes.map((e) => (
                    <th key={e.cle || 'quantite'} className="num" title={e.detail ?? undefined}>{e.libelle}</th>
                  ))}
                  {avecColonnes && <th className={`num ${styles.total}`}>Total</th>}
                </tr>
              </thead>
              <tbody>
                {croisement.corps.map((l) => {
                  const lienLigne = lien(l, null, l.total);
                  return (
                    <tr key={l.cle || 'aucun'}>
                      <td>
                        {lienLigne
                          ? <Link href={lienLigne.href} prefetch={false} className={styles.lien} aria-label={`${l.libelle} : ${lienLigne.libelle}`}>{l.libelle}</Link>
                          : l.libelle}
                        {l.detail && <span className={styles.detail}>{l.detail}</span>}
                      </td>
                      {l.cellules.map((c, i) => <td key={croisement.entetes[i].cle || 'quantite'} className="num">{chiffre(c, l, croisement.entetes[i])}</td>)}
                      {avecColonnes && <td className={`num ${styles.total}`}>{chiffre(l.total, l, null)}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  {croisement.totaux.map((c, i) => <td key={croisement.entetes[i].cle || 'quantite'} className="num">{chiffre(c, null, croisement.entetes[i])}</td>)}
                  {avecColonnes && <td className={`num ${styles.total}`}>{chiffre(croisement.total, null, null)}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className={`discret ${styles.note}`}>
          Quantités additionnées par unité Dolibarr ({croisement.unite ? `tout en ${croisement.unite}` : 'unités distinctes séparées par « · »'}).
          Un chiffre cliquable ouvre la fiche de la fuite, ou la liste des fuites du secteur (toutes dates). Saisie :
          {' '}{LIBELLES_PROVENANCE.terrain.toLowerCase()} = par le réparateur ; {LIBELLES_PROVENANCE.correction.toLowerCase()} = oubli
          ou remplacement avec motif.
        </p>
      </section>
    </div>
  );
}

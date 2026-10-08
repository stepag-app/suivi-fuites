// Vérification de l'inventaire des fournitures posées et du rapprochement Dolibarr (lots P3 et P4) sur des données
// fictives : filtres dans l'adresse, période, croisement, résumé, lecture du CSV des mouvements, filtres du rapprochement.
// Si les vrais exports sont présents (../data-private/dolibarr/, hors dépôt, ou dossier DOLIBARR_EXPORTS), leur lecture
// est aussi contrôlée.
// Lancement, dans web/ : node scripts/verifier-fournitures-dolibarr.mjs (Node 22.18 ou plus récent).
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Alias « @/ » vers src/ et imports sans extension vers .ts (comme Next.js).
const src = pathToFileURL(fileURLToPath(new URL('../src/', import.meta.url))).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    let s = spec.startsWith('@/') ? ${JSON.stringify(src)} + spec.slice(2) : spec;
    if ((s.startsWith('.') || s.startsWith('file:')) && !/\\.[cm]?[jt]sx?$/.test(s)) s += '.ts';
    return next(s, ctx);
  }`)}`, import.meta.url);

const inv = await import('../src/app/(app)/fournitures/inventaire.ts');
const fou = await import('../src/lib/ui/fournitures.ts');
const csv = await import('../src/lib/dolibarr/csv.ts');
const rap = await import('../src/lib/dolibarr/rapprochement.ts');

let n = 0;
const ok = (nom, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

const piece = (p) => ({
  id: `id${n}-${Math.random()}`, marche_id: 'm', reparation_id: 'r', fuite_id: 'f1', fuite_numero: 1, reference_srm: null,
  realisee_le: '2026-10-05T10:00:00Z', jour: '2026-10-05', mois: '2026-10', zone_id: 'z', zone: 'Zone A', secteur_id: 's1',
  secteur: 'Secteur 1', equipe_id: 'e1', equipe: 'Équipe 1', produit_id: 1, designation: 'MANCHON DN 25', famille: 'RAC',
  unite: 'U', quantite: 1, provenance: 'terrain', nature_correction: null, ...p,
});
const LIGNES = [
  piece({ quantite: 2 }),
  piece({ fuite_id: 'f2', fuite_numero: 2, quantite: 3, provenance: 'correction', nature_correction: 'oubli' }),
  piece({ fuite_id: 'f2', fuite_numero: 2, produit_id: 2, designation: 'TUBE PE DN 25', famille: 'CND', unite: 'm', quantite: 1.5, jour: '2026-09-20', mois: '2026-09', secteur_id: 's2', secteur: 'Secteur 2' }),
  piece({ produit_id: 3, designation: 'ROBINET 20', famille: 'ROB', quantite: 1, equipe_id: 'e2', equipe: 'Équipe 2' }),
];

ok('adresse : forme canonique, valeurs inconnues retirées, période remise dans l\'ordre', () => {
  const f = inv.lireFiltres('lignes=famille&colonnes=xx&du=2026-10-31&au=2026-10-01&provenance=bureau&fuite=N°%2012&famille=RAC');
  assert.equal(f.lignes, 'famille');
  assert.equal(f.colonnes, 'aucune');
  assert.deepEqual([f.du, f.au], ['2026-10-01', '2026-10-31']);
  assert.equal(f.provenance, '');
  assert.equal(f.fuite, '12');
  assert.equal(inv.ecrireFiltres(f), 'lignes=famille&du=2026-10-01&au=2026-10-31&famille=RAC&fuite=12');
});

ok('période : mois en cours par défaut, 12 mois au plus', () => {
  assert.deepEqual(inv.periodeEffective({ du: '', au: '' }, '2026-10-08T12:00:00Z'), { du: '2026-10-01', au: '2026-10-31' });
  assert.deepEqual(inv.periodeEffective({ du: '2025-01-01', au: '2026-10-15' }), { du: '2025-10-16', au: '2026-10-15' });
});

ok('filtres : terrain / bureau, famille, fuite', () => {
  const base = inv.normaliser({});
  assert.equal(inv.appliquerFiltres(LIGNES, { ...base, provenance: 'correction' }).length, 1);
  assert.equal(inv.appliquerFiltres(LIGNES, { ...base, famille: 'CND' }).length, 1);
  assert.equal(inv.appliquerFiltres(LIGNES, { ...base, fuite: '2' }).length, 2);
  const familles = inv.valeursFiltre(LIGNES, base, 'famille');
  assert.deepEqual(familles.map((v) => v.libelle), ['Conduites', 'Raccords', 'Robinetterie']);
});

ok('croisement article × mois : regroupement par produit Dolibarr, unités séparées', () => {
  const c = inv.croiser(LIGNES, { lignes: 'article', colonnes: 'mois' });
  assert.deepEqual(c.entetes.map((e) => e.cle), ['2026-09', '2026-10']);
  const manchon = c.corps.find((l) => l.libelle === 'MANCHON DN 25');
  assert.equal(manchon.total.quantites.U, 5);
  assert.equal(manchon.detail, 'Raccords');
  assert.equal(c.total.texte, '6 U · 1,5 m');
  assert.equal(c.unite, null);
});

ok('résumé : pièces, fuites, part des corrections, premiers articles', () => {
  const r = fou.resumeFournitures(LIGNES);
  assert.equal(r.pieces, 4);
  assert.equal(r.fuites, 2);
  assert.equal(r.partCorrections, 25);
  assert.equal(r.articles[0].designation, 'MANCHON DN 25');
  assert.equal(r.articles[0].quantite, 5);
});

// ---------------------------------------------------------------------------------------------------------------
// CSV des mouvements (format de mouvements_chantier.csv)
// ---------------------------------------------------------------------------------------------------------------
const ENTETE = 'rowid;date;produit_rowid;produit_ref;produit_label;entrepot;quantite_signee;type_mouvement;libelle;inventorycode;'
  + 'projet;origine_type;origine_id;entrepot_rowid;unite;annulation;entrepot_contrepartie;projet_rowid;projet_source;prix;pmp';
const CSV = [
  ENTETE,
  '1;2026-10-01 10:33:51;101;TST00101;MANCHON;DP-ESSAI;3.0000;0;Transfert de stock 2026-10-01 10:33;OUJDA;M;stocktransfers_transfer;6775;701;U;0;DEPOT;40;bon_de_transfert;12.5;9',
  '2;2026-10-01 10:40:00;102;TST00102;TUBE;DP-ESSAI;-1.0000;1;Transfert de stock 2026-10-01 10:40 CANCEL;OUJDA CANCEL;M;;;701;m;1;;40;entrepot;;',
  '3;2026-10-02 08:00:00;101;TST00101;MANCHON;DP-ESSAI;-2.0000;1;Consommation pour le projet M;CONSOM;M;;;701;U;0;;40;entrepot;;',
  'x;2026-10-02;101;;;;1;0;;;;;;701;U;0;;;;;',
].join('\r\n');

ok('CSV : colonnes utiles seulement, annulation, bon de transfert, ligne invalide rejetée, jamais de prix', () => {
  const l = csv.extraireMouvements(csv.lireCsv(CSV));
  assert.equal(l.mouvements.length, 3);
  assert.equal(l.rejetees.length, 1);
  assert.equal(l.mouvements[0].bon_id, 6775);
  assert.equal(l.mouvements[1].annulation, true);
  assert.ok(csv.estConsommation(l.mouvements[2]));
  const charge = csv.chargeImport(l.mouvements);
  assert.ok(charge.every((m) => !('prix' in m) && !('pmp' in m)));
  const r = csv.resumerMouvements(l.mouvements, 701);
  assert.deepEqual([r.entrees, r.annulations, r.consommations, r.horsEntrepotMarche], [1, 1, 1, 0]);
});

ok('CSV : deux fichiers fusionnés, un rowid compté une fois', () => {
  const a = csv.extraireMouvements(csv.lireCsv(CSV));
  const f = csv.fusionnerLectures([a, a]);
  assert.equal(f.mouvements.length, 3);
});

// ---------------------------------------------------------------------------------------------------------------
// Rapprochement
// ---------------------------------------------------------------------------------------------------------------
const ligneR = (p) => rap.normaliserLigne({
  produit_id: 1, designation: 'MANCHON', famille: 'RAC', unite: 'U', dans_articles: true, transfere: '10', consomme: '0', pose: '4',
  ecart: '6', pieces: 3, cumul_transfere: '10', cumul_consomme: '0', cumul_pose: '4', cumul_ecart: '6', ecart_pct: '60.0',
  seuil_pct: '10.00', au_dela_seuil: true, dernier_mouvement: null, ...p,
});
const R = [
  ligneR({}),
  ligneR({ produit_id: 2, designation: 'ESSENCE', famille: 'CRB', unite: 'L', pose: 0, cumul_pose: 0, au_dela_seuil: true, ecart_pct: '100' }),
  ligneR({ produit_id: 3, designation: 'COLLIER', famille: 'RAC', ecart: '0', cumul_ecart: '0', ecart_pct: '0', au_dela_seuil: false }),
  ligneR({ produit_id: 4, designation: 'GILET', famille: 'CON', pose: '1', cumul_pose: '1', transfere: 0, cumul_transfere: 0, ecart_pct: null }),
];

ok('rapprochement : nombres normalisés, pièces seulement par défaut (sauf article posé), seuil', () => {
  assert.equal(R[0].transfere, 10);
  const v = rap.filtrerRapprochement(R, rap.FILTRES_RAPPROCHEMENT_DEFAUT);
  assert.deepEqual(v.map((l) => l.produit_id), [1, 3, 4]);
  assert.equal(rap.filtrerRapprochement(R, { ...rap.FILTRES_RAPPROCHEMENT_DEFAUT, alertesSeulement: true }).length, 2);
  assert.equal(rap.filtrerRapprochement(R, { ...rap.FILTRES_RAPPROCHEMENT_DEFAUT, piecesSeulement: false, texte: 'essénce' }).length, 1);
});

ok('rapprochement : alertes d\'abord (posé sans transfert en tête), totaux', () => {
  const t = rap.trierRapprochement(R);
  assert.equal(t[0].produit_id, 4);
  assert.equal(t[t.length - 1].produit_id, 3);
  const tot = rap.totalRapprochement(R);
  assert.deepEqual([tot.articles, tot.alertes, tot.sansTransfert, tot.aConsomme], [4, 3, 1, false]);
});

// ---------------------------------------------------------------------------------------------------------------
// Vrais exports Dolibarr (facultatif, jamais dans le dépôt)
// ---------------------------------------------------------------------------------------------------------------
const dossier = process.env.DOLIBARR_EXPORTS
  ? pathToFileURL(`${process.env.DOLIBARR_EXPORTS.replace(/\/$/, '')}/`)
  : new URL('../../data-private/dolibarr/', import.meta.url);
const fichiers = ['mouvements_chantier.csv', 'mouvements_chantier_avant_2026-10-01.csv'].map((f) => new URL(f, dossier));
if (fichiers.every((f) => existsSync(f))) {
  ok('vrais exports : 49 + 44 mouvements lus sans rejet, tous de l\'entrepôt 76', () => {
    const lectures = fichiers.map((f) => csv.extraireMouvements(csv.lireCsv(csv.decoderTexte(readFileSync(f)))));
    assert.deepEqual(lectures.map((l) => [l.mouvements.length, l.rejetees.length, l.colonnesManquantes.length]), [[49, 0, 0], [44, 0, 0]]);
    const r = csv.resumerMouvements(csv.fusionnerLectures(lectures).mouvements, 76);
    assert.equal(r.horsEntrepotMarche, 0);
    assert.equal(r.annulations, 16);
    assert.equal(r.consommations, 0);
  });
} else {
  console.log('# vrais exports absents : contrôle sauté');
}

console.log(`1..${n}`);

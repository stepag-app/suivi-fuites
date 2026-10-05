// Vérification de la logique des contrôles d'attachement, des travaux hors bordereau et des pièces
// posées (lot R) : src/app/(app)/attachements/controles.ts, sur des données fictives, et cohérence avec
// la migration supabase/migrations/20261006100100_controles_attachement.sql (codes des contrôles et des
// natures, colonnes lues, seuil du polyéthylène par marché, phrase de l'écran « Corriger »).
// Lancement, dans web/ : node scripts/verifier-controles-attachement.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  COLONNES_EXPORT_HB, COLONNES_HORS_BORDEREAU, COLONNES_PIECES, ETATS_PIECE, GRAVITES, LIBELLES_COURTS, LONGUEUR_PE_MAX_DEFAUT_M,
  NATURES_HORS_BORDEREAU, PHRASE_PIECE_AJOUTEE, controlesParFuite, decrirePieces, excedentPe, filtrerHorsBordereau,
  groupeExportHb, libelleCourt, libellePeriodeHb, libelleProvenance, lignesExportHorsBordereau, motifValide, piecesReelles,
  resumer, syntheseControles, totauxHorsBordereau, trierControles, trierHorsBordereau,
} from '../src/app/(app)/attachements/controles.ts';
import { construireSection } from '../src/lib/export/modele.ts';

let n = 0;
const ok = (nom, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

const controle = (o) => ({
  marche_id: 'm1', fuite_id: 'f1', fuite_numero: 1, reparation_id: 'r1', ligne_id: null,
  controle: 'fouille_sans_volume', gravite: 'avertissement', libelle: 'Réparation réussie sans volume de fouille',
  detail: null, excedent: null, unite: null, ...o,
});

const CONTROLES = [
  controle({ fuite_id: 'f2', fuite_numero: 2, controle: 'pe_superieur_2m', gravite: 'information',
    libelle: 'Polyéthylène au-delà de 2 m : excédent hors bordereau, à faire valoir', detail: '3,5 m posés', excedent: 1.5, unite: 'm' }),
  controle({ fuite_id: 'f2', fuite_numero: 2, controle: 'ligne_incoherente', gravite: 'alerte', ligne_id: 'l9',
    libelle: 'Article retenu différent de celui que propose la règle pour les mesures saisies, sans motif',
    detail: 'Prix 13 retenu ; la règle propose : prix 3, prix 6' }),
  controle({ fuite_id: 'f2', fuite_numero: 2 }),
  controle({ fuite_id: 'f1', controle: 'robinet_pec_sans_piece', reparation_id: 'r1',
    libelle: 'Case « Robinet PEC changé » cochée sans robinet PEC dans les pièces posées' }),
  controle({ fuite_id: 'f1', controle: 'robinet_pec_sans_piece', reparation_id: 'r1b',
    libelle: 'Case « Robinet PEC changé » cochée sans robinet PEC dans les pièces posées' }),
  controle({ fuite_id: 'f3', fuite_numero: 3, controle: 'nouveau_controle', gravite: 'avertissement', libelle: 'Contrôle ajouté plus tard' }),
];

ok('libellés courts : connus, et libellé complet pour un contrôle inconnu', () => {
  assert.equal(libelleCourt({ controle: 'ligne_incoherente', libelle: 'x' }), 'Ligne incohérente');
  assert.equal(libelleCourt({ controle: 'nouveau_controle', libelle: 'Contrôle ajouté plus tard' }), 'Contrôle ajouté plus tard');
});

ok('tri : alerte, puis avertissement, puis information', () => {
  const tries = trierControles(CONTROLES.filter((c) => c.fuite_id === 'f2'));
  assert.deepEqual(tries.map((c) => c.gravite), ['alerte', 'avertissement', 'information']);
  assert.deepEqual(Object.values(GRAVITES).map((g) => g.ordre), [0, 1, 2]);
});

ok('regroupement par fuite, chaque fuite triée', () => {
  const m = controlesParFuite(CONTROLES);
  assert.equal(m.size, 3);
  assert.deepEqual(m.get('f2').map((c) => c.controle), ['ligne_incoherente', 'fouille_sans_volume', 'pe_superieur_2m']);
  assert.equal(m.get('f1').length, 2);
  assert.equal(m.get('f9'), undefined);
});

ok('résumé d\'une fuite : total, gravité la plus haute, puces sans doublon, infobulle détaillée', () => {
  const m = controlesParFuite(CONTROLES);
  const r2 = resumer(m.get('f2'));
  assert.equal(r2.total, 3);
  assert.equal(r2.gravite, 'alerte');
  assert.deepEqual(r2.parGravite, { alerte: 1, avertissement: 1, information: 1 });
  assert.deepEqual(r2.puces, [
    { libelle: 'Ligne incohérente', gravite: 'alerte' },
    { libelle: 'Fouille sans volume', gravite: 'avertissement' },
    { libelle: 'PE au-delà du seuil', gravite: 'information' },
  ]);
  assert.match(r2.titre, /^Alerte : Article retenu différent .* \(Prix 13 retenu ; la règle propose : prix 3, prix 6\)\n/);
  const r1 = resumer(m.get('f1'));
  assert.equal(r1.total, 2);
  assert.deepEqual(r1.puces, [{ libelle: 'Robinet PEC sans pièce', gravite: 'avertissement' }]);
  const vide = resumer(undefined);
  assert.equal(vide.total, 0);
  assert.equal(vide.gravite, null);
  assert.equal(vide.titre, '');
});

ok('synthèse de la page des lots : cas et fuites distinctes par contrôle', () => {
  const s = syntheseControles(CONTROLES);
  assert.equal(s[0].controle, 'ligne_incoherente');
  const robinet = s.find((x) => x.controle === 'robinet_pec_sans_piece');
  assert.equal(robinet.cas, 2);
  assert.equal(robinet.fuites, 1);
  assert.equal(s.at(-1).gravite, 'information');
  assert.equal(syntheseControles([]).length, 0);
});

ok('excédent de polyéthylène : longueur − seuil du marché (2 m par défaut), jamais négatif', () => {
  assert.equal(LONGUEUR_PE_MAX_DEFAUT_M, 2);
  assert.equal(excedentPe(3.5), 1.5);
  assert.equal(excedentPe(2.5), 0.5);
  assert.equal(excedentPe(2), 0);
  assert.equal(excedentPe(1.2), 0);
  assert.equal(excedentPe(null), 0);
  assert.equal(excedentPe(undefined), 0);
  assert.equal(excedentPe(2.15), 0.15);
  assert.equal(excedentPe(4, 3), 1);
  assert.equal(excedentPe(3.5, 3), 0.5);
  assert.equal(excedentPe(3.5, 4), 0);
  assert.equal(excedentPe(2.8, 2.5), 0.3);
  assert.equal(excedentPe(3.5, null), 1.5, 'seuil absent : 2 m');
  assert.equal(excedentPe(3.5, 0), 1.5, 'seuil invalide : 2 m');
});

const travail = (o) => ({
  marche_id: 'm1', nature: 'pe_au_dela_2m', libelle: 'Polyéthylène au-delà de 2 m', fuite_id: 'f1', fuite_numero: 1,
  reference_srm: '101-214-003', adresse: null, zone_id: 'z1', zone: 'Zone 1', secteur_id: 's1', secteur: 'Andalous',
  reparation_id: 'r1', realisee_le: '2026-09-25T09:00:00Z', jour: '2026-09-25', materiau: 'polyethylene', diametre_mm: 32,
  designation: 'Polyéthylène 32 mm : 2,5 m posés, excédent au-delà de 2 m', quantite: 0.5, unite: 'm',
  piece_ligne_id: null, piece_provenance: null, piece_nature_correction: null, ...o,
});
const TRAVAUX = [
  travail({ fuite_id: 'f18', fuite_numero: 18 }),
  travail({ fuite_id: 'f20', fuite_numero: 20, jour: '2026-10-02', quantite: 1.25, secteur_id: 's2', secteur: 'Qods Bas',
    designation: 'Polyéthylène 25 mm : 3,25 m posés, excédent au-delà de 2 m' }),
  travail({ fuite_id: 'f13', fuite_numero: 13, nature: 'reparation_sans_article', jour: '2026-09-30', quantite: 1, unite: 'u',
    materiau: 'amiante_ciment', diametre_mm: 400, designation: 'Réparation amiante-ciment, diamètre 400 mm' }),
  travail({ fuite_id: 'f13', fuite_numero: 13, nature: 'piece_non_couverte', jour: '2026-09-30', quantite: 2, unite: 'u',
    designation: 'Robinet vanne 400', piece_ligne_id: 'p1', piece_provenance: 'terrain' }),
  travail({ fuite_id: 'f13', fuite_numero: 13, nature: 'piece_non_couverte', jour: '2026-09-30', quantite: 1, unite: 'u',
    designation: 'Joint fonte 400', piece_ligne_id: 'p2', piece_provenance: 'correction', piece_nature_correction: 'oubli' }),
];

ok('filtres : période (bornes comprises, inversée), secteur, nature', () => {
  assert.equal(filtrerHorsBordereau(TRAVAUX, {}).length, 5);
  assert.equal(filtrerHorsBordereau(TRAVAUX, { du: '2026-09-25', au: '2026-09-30' }).length, 4);
  assert.equal(filtrerHorsBordereau(TRAVAUX, { du: '2026-09-30', au: '2026-09-25' }).length, 4);
  assert.equal(filtrerHorsBordereau(TRAVAUX, { du: '2026-10-01' }).length, 1);
  assert.equal(filtrerHorsBordereau(TRAVAUX, { au: '2026-09-25' }).length, 1);
  assert.equal(filtrerHorsBordereau(TRAVAUX, { secteur: 's2' }).length, 1);
  assert.equal(filtrerHorsBordereau(TRAVAUX, { nature: 'piece_non_couverte' }).length, 2);
});

ok('totaux par nature et par unité, fuites distinctes, ordre des natures', () => {
  const t = totauxHorsBordereau(TRAVAUX);
  assert.deepEqual(t.map((x) => [x.nature, x.unite, x.quantite, x.lignes, x.fuites]), [
    ['pe_au_dela_2m', 'm', 1.75, 2, 2],
    ['reparation_sans_article', 'u', 1, 1, 1],
    ['piece_non_couverte', 'u', 3, 2, 1],
  ]);
  assert.equal(t[0].libelle, NATURES_HORS_BORDEREAU.pe_au_dela_2m);
});

ok('tri de la liste : nature, N° de fuite, désignation', () => {
  assert.deepEqual(trierHorsBordereau(TRAVAUX).map((x) => `${x.nature}:${x.fuite_numero}:${x.designation.slice(0, 5)}`), [
    'pe_au_dela_2m:18:Polyé', 'pe_au_dela_2m:20:Polyé', 'reparation_sans_article:13:Répar',
    'piece_non_couverte:13:Joint', 'piece_non_couverte:13:Robin',
  ]);
});

ok('période de l\'en-tête d\'export', () => {
  assert.equal(libellePeriodeHb({}), 'Toutes les réparations');
  assert.equal(libellePeriodeHb({ du: '2026-09-01', au: '2026-09-30' }), 'Réparations du 01/09/2026 au 30/09/2026');
  assert.equal(libellePeriodeHb({ du: '2026-09-30', au: '2026-09-01' }), 'Réparations du 01/09/2026 au 30/09/2026');
  assert.equal(libellePeriodeHb({ du: '2026-09-01' }), 'Réparations à partir du 01/09/2026');
  assert.equal(libellePeriodeHb({ au: '2026-09-30' }), 'Réparations jusqu\'au 30/09/2026');
});

ok('préparation de l\'export : libellés, origine des pièces (terrain, correction et sa nature), colonnes présentes', () => {
  const lignes = lignesExportHorsBordereau(TRAVAUX);
  assert.equal(lignes.length, 5);
  assert.equal(lignes[0].nature_libelle, 'Polyéthylène au-delà du seuil du marché');
  assert.deepEqual(lignes.map((l) => l.origine_piece), ['', '', '', 'Correction du bureau : oubli', 'Déclarée sur le terrain']);
  COLONNES_EXPORT_HB.forEach((c) => lignes.forEach((l) => assert.ok(c.cle in l, `colonne ${c.cle} absente`)));
  assert.equal(COLONNES_EXPORT_HB.filter((c) => c.total).map((c) => c.cle).join(), 'quantite');
});

ok('document d\'export : une section par nature, sous-totaux par unité, total vide si unités mêlées', () => {
  const section = construireSection(lignesExportHorsBordereau(TRAVAUX), COLONNES_EXPORT_HB, { groupe: groupeExportHb });
  const groupes = section.lignes.filter((l) => l.type === 'groupe').map((l) => l.libelle);
  assert.deepEqual(groupes, [
    'Polyéthylène au-delà du seuil du marché (2)', 'Réparation sans article au bordereau (1)', 'Pièce non couverte par un article (2)',
  ]);
  const iQte = COLONNES_EXPORT_HB.findIndex((c) => c.cle === 'quantite');
  const sousTotaux = section.lignes.filter((l) => l.type === 'sous_total').map((l) => l.cellules[iQte]);
  assert.deepEqual(sousTotaux, [1.75, 1, 3]);
  const total = section.lignes.find((l) => l.type === 'total');
  assert.equal(total.cellules[iQte], null);
  const iDate = COLONNES_EXPORT_HB.findIndex((c) => c.cle === 'jour');
  const premiere = section.lignes.find((l) => l.type === 'donnees');
  assert.ok(premiere.cellules[iDate] instanceof Date);
});

ok('cohérence avec la migration : chaque contrôle a un libellé court et une gravité connue', () => {
  const sql = fs.readFileSync(new URL('../../supabase/migrations/20261006100100_controles_attachement.sql', import.meta.url), 'utf8');
  const vue = sql.slice(sql.indexOf('create view public.v_controles_attachement'), sql.indexOf('create view public.v_hors_bordereau'));
  const codes = [...vue.matchAll(/'([a-z0-9_]+)'(?:::text as controle)?,\s*'(alerte|avertissement|information)'/g)]
    .map((m) => [m[1], m[2]]);
  assert.equal(codes.length, 10, `10 contrôles attendus, ${codes.length} trouvés`);
  codes.forEach(([code, gravite]) => {
    assert.ok(LIBELLES_COURTS[code], `libellé court manquant : ${code}`);
    assert.ok(GRAVITES[gravite], `gravité inconnue : ${gravite}`);
  });
  assert.deepEqual(Object.keys(LIBELLES_COURTS).sort(), codes.map(([c]) => c).sort());
  const natures = [...sql.matchAll(/select rep\.marche_id, '([a-z0-9_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(natures.sort(), Object.keys(NATURES_HORS_BORDEREAU).sort());
});

// ---------------------------------------------------------------------------
// Pièces posées : déclaration du terrain et corrections du bureau
// ---------------------------------------------------------------------------
const piece = (o) => ({
  id: 'p1', reparation_id: 'r1', piece_id: 'c1', designation_libre: null, quantite: 1, provenance: 'terrain',
  nature_correction: null, remplace_piece_id: null, motif_correction: null, etat: 'posee', etat_le: null,
  motif_retrait: null, cree_le: '2026-10-01T08:00:00Z', ...o,
});
const PIECES = [
  // P7 remplace P1 (saisi avant), P9 remplace P7 : chaîne de remplacements
  piece({ id: 'p9', cree_le: '2026-10-06T10:00:00Z', provenance: 'correction', nature_correction: 'remplacement',
    remplace_piece_id: 'p7', motif_correction: 'Diamètre 32', piece_id: 'c3' }),
  piece({ id: 'p1', quantite: 2, etat: 'remplacee', etat_le: '2026-10-05T09:00:00Z' }),
  piece({ id: 'p2', cree_le: '2026-10-01T08:01:00Z', etat: 'retiree', etat_le: '2026-10-05T09:30:00Z', motif_retrait: 'Non posé' }),
  piece({ id: 'p7', cree_le: '2026-10-05T09:00:00Z', provenance: 'correction', nature_correction: 'remplacement',
    remplace_piece_id: 'p1', motif_correction: 'Un seul manchon', etat: 'remplacee', etat_le: '2026-10-06T10:00:00Z' }),
  piece({ id: 'p3', cree_le: '2026-10-05T08:00:00Z', provenance: 'correction', nature_correction: 'oubli',
    motif_correction: 'Robinet sur la photo', piece_id: 'c2' }),
  piece({ id: 'p4', reparation_id: 'r2', cree_le: '2026-10-02T08:00:00Z', piece_id: null, designation_libre: 'Joint plat' }),
];
const NOMS = { c1: 'Manchon 25', c2: 'Robinet PEC', c3: 'Manchon 32' };
const texte = (p) => `${NOMS[p.piece_id] ?? p.designation_libre} : ${p.quantite} u`;

ok('pièces : ordre de saisie, chaque remplacement juste après la pièce qu\'il remplace', () => {
  const d = decrirePieces(PIECES, texte);
  assert.deepEqual(d.map((p) => p.id), ['p1', 'p7', 'p9', 'p2', 'p4', 'p3']);
  assert.equal(decrirePieces([], texte).length, 0);
});

ok('pièces : saisie d\'origine barrée (état, date, pièce qui la remplace, motif du remplacement)', () => {
  const d = new Map(decrirePieces(PIECES, texte).map((p) => [p.id, p]));
  assert.deepEqual(
    [d.get('p1').etat, d.get('p1').remplaceePar, d.get('p1').motif, d.get('p1').le],
    ['remplacee', 'Manchon 25 : 1 u', 'Un seul manchon', '2026-10-05T09:00:00Z'],
  );
  assert.deepEqual([d.get('p7').remplace, d.get('p7').remplaceePar, d.get('p7').motif], ['Manchon 25 : 2 u', 'Manchon 32 : 1 u', 'Diamètre 32']);
  assert.deepEqual([d.get('p9').etat, d.get('p9').remplace, d.get('p9').remplaceePar, d.get('p9').motif, d.get('p9').le],
    ['posee', 'Manchon 25 : 1 u', null, 'Diamètre 32', null]);
  assert.deepEqual([d.get('p2').etat, d.get('p2').motif, d.get('p2').remplace], ['retiree', 'Non posé', null]);
  assert.deepEqual([d.get('p3').provenance, d.get('p3').nature, d.get('p3').motif], ['correction', 'oubli', 'Robinet sur la photo']);
  assert.equal(d.get('p4').texte, 'Joint plat : 1 u');
});

ok('pièces : inventaire réel = ni remplacées ni retirées', () => {
  assert.deepEqual(piecesReelles(decrirePieces(PIECES, texte)).map((p) => p.id), ['p9', 'p4', 'p3']);
});

ok('pièces : libellés de provenance et d\'état, motif obligatoire', () => {
  assert.equal(libelleProvenance('terrain', null), 'déclarée sur le terrain');
  assert.equal(libelleProvenance('correction', 'oubli'), 'correction du bureau : oubli');
  assert.equal(libelleProvenance('correction', 'remplacement'), 'correction du bureau : remplacement');
  assert.equal(libelleProvenance(null, null), 'déclarée sur le terrain');
  assert.deepEqual(ETATS_PIECE, { posee: 'posée', remplacee: 'remplacée', retiree: 'retirée' });
  assert.equal(motifValide('  '), false);
  assert.equal(motifValide(null), false);
  assert.equal(motifValide(' Constat du 05/10 '), true);
  assert.equal(PHRASE_PIECE_AJOUTEE, 'Une pièce ajoutée doit avoir été posée ; pour changer le prix, requalifier la ligne de prix.');
});

ok('cohérence avec la migration : colonnes des pièces, des travaux hors bordereau et seuil du polyéthylène', () => {
  const sql = fs.readFileSync(new URL('../../supabase/migrations/20261006100100_controles_attachement.sql', import.meta.url), 'utf8');
  const base = fs.readFileSync(new URL('../../supabase/migrations/20261004090300_fuites_interventions.sql', import.meta.url), 'utf8');
  const table = base.slice(base.indexOf('create table public.reparation_pieces'), base.indexOf('alter table public.reparation_pieces enable'));
  const ajouts = sql.slice(sql.indexOf('alter table public.reparation_pieces'), sql.indexOf('comment on column public.reparation_pieces.provenance'));
  COLONNES_PIECES.split(', ').forEach((c) => assert.ok(new RegExp(`\\b${c}\\b`).test(table + ajouts), `colonne absente : ${c}`));
  const vueHb = sql.slice(sql.indexOf('create view public.v_hors_bordereau'), sql.indexOf('create or replace view public.v_quantites'));
  const selectHb = vueHb.slice(vueHb.lastIndexOf('select t.marche_id'));
  COLONNES_HORS_BORDEREAU.split(', ').forEach((c) => assert.ok(new RegExp(`\\b${c}\\b`).test(selectHb), `colonne de v_hors_bordereau absente : ${c}`));
  assert.match(sql, /add column longueur_pe_max_m numeric\(5,2\) not null default 2\b/);
  assert.equal(Number(sql.match(/longueur_pe_max_m numeric\(5,2\) not null default (\d+)/)[1]), LONGUEUR_PE_MAX_DEFAUT_M);
  ['create view public.v_controles_attachement', 'create view public.v_hors_bordereau', 'create or replace view public.v_anomalies']
    .forEach((debut) => {
      const i = sql.indexOf(debut);
      assert.ok(i >= 0, `vue absente : ${debut}`);
      const fin = sql.indexOf('\ncreate ', i + debut.length);
      const corps = sql.slice(i, fin < 0 ? undefined : fin);
      assert.match(corps, /longueur_pe_m > rep\.longueur_pe_max_m/, `seuil du marché absent : ${debut}`);
    });
  assert.ok(!/longueur_pe_m > 2\b|longueur_pe_m - 2\b/.test(sql), 'seuil de 2 m écrit en dur dans la migration');
});

console.log(`1..${n}`);

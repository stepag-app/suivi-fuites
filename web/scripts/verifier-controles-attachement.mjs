// Vérification de la logique des contrôles d'attachement et des travaux hors bordereau (lot R) :
// src/app/(app)/attachements/controles.ts, sur des données fictives, et cohérence avec la migration
// supabase/migrations/20261006100100_controles_attachement.sql (codes des contrôles et des natures).
// Lancement, dans web/ : node scripts/verifier-controles-attachement.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  COLONNES_EXPORT_HB, GRAVITES, LIBELLES_COURTS, NATURES_HORS_BORDEREAU, controlesParFuite, excedentPe,
  filtrerHorsBordereau, groupeExportHb, libelleCourt, libellePeriodeHb, lignesExportHorsBordereau, resumer,
  syntheseControles, totauxHorsBordereau, trierControles, trierHorsBordereau,
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
    { libelle: 'PE au-delà de 2 m', gravite: 'information' },
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

ok('excédent de polyéthylène : longueur − 2 m, jamais négatif', () => {
  assert.equal(excedentPe(3.5), 1.5);
  assert.equal(excedentPe(2.5), 0.5);
  assert.equal(excedentPe(2), 0);
  assert.equal(excedentPe(1.2), 0);
  assert.equal(excedentPe(null), 0);
  assert.equal(excedentPe(undefined), 0);
  assert.equal(excedentPe(2.15), 0.15);
  assert.equal(excedentPe(4, 3), 1);
});

const travail = (o) => ({
  marche_id: 'm1', nature: 'pe_au_dela_2m', libelle: 'Polyéthylène au-delà de 2 m', fuite_id: 'f1', fuite_numero: 1,
  reference_srm: '101-214-003', adresse: null, zone_id: 'z1', zone: 'Zone 1', secteur_id: 's1', secteur: 'Andalous',
  reparation_id: 'r1', realisee_le: '2026-09-25T09:00:00Z', jour: '2026-09-25', materiau: 'polyethylene', diametre_mm: 32,
  designation: 'Polyéthylène 32 mm : 2,5 m posés, excédent au-delà de 2 m', quantite: 0.5, unite: 'm',
  piece_ligne_id: null, ajoutee_bureau: null, ...o,
});
const TRAVAUX = [
  travail({ fuite_id: 'f18', fuite_numero: 18 }),
  travail({ fuite_id: 'f20', fuite_numero: 20, jour: '2026-10-02', quantite: 1.25, secteur_id: 's2', secteur: 'Qods Bas',
    designation: 'Polyéthylène 25 mm : 3,25 m posés, excédent au-delà de 2 m' }),
  travail({ fuite_id: 'f13', fuite_numero: 13, nature: 'reparation_sans_article', jour: '2026-09-30', quantite: 1, unite: 'u',
    materiau: 'amiante_ciment', diametre_mm: 400, designation: 'Réparation amiante-ciment, diamètre 400 mm' }),
  travail({ fuite_id: 'f13', fuite_numero: 13, nature: 'piece_non_couverte', jour: '2026-09-30', quantite: 2, unite: 'u',
    designation: 'Robinet vanne 400', piece_ligne_id: 'p1', ajoutee_bureau: false }),
  travail({ fuite_id: 'f13', fuite_numero: 13, nature: 'piece_non_couverte', jour: '2026-09-30', quantite: 1, unite: 'u',
    designation: 'Joint fonte 400', piece_ligne_id: 'p2', ajoutee_bureau: true }),
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

ok('préparation de l\'export : libellés, origine des pièces, colonnes présentes', () => {
  const lignes = lignesExportHorsBordereau(TRAVAUX);
  assert.equal(lignes.length, 5);
  assert.equal(lignes[0].nature_libelle, 'Polyéthylène au-delà de 2 m');
  assert.deepEqual(lignes.map((l) => l.origine_piece), ['', '', '', 'Ajoutée au bureau', 'Déclarée sur le terrain']);
  COLONNES_EXPORT_HB.forEach((c) => lignes.forEach((l) => assert.ok(c.cle in l, `colonne ${c.cle} absente`)));
  assert.equal(COLONNES_EXPORT_HB.filter((c) => c.total).map((c) => c.cle).join(), 'quantite');
});

ok('document d\'export : une section par nature, sous-totaux par unité, total vide si unités mêlées', () => {
  const section = construireSection(lignesExportHorsBordereau(TRAVAUX), COLONNES_EXPORT_HB, { groupe: groupeExportHb });
  const groupes = section.lignes.filter((l) => l.type === 'groupe').map((l) => l.libelle);
  assert.deepEqual(groupes, [
    'Polyéthylène au-delà de 2 m (2)', 'Réparation sans article au bordereau (1)', 'Pièce non couverte par un article (2)',
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

console.log(`1..${n}`);

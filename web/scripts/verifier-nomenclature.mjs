// Vérification de l'import des articles Dolibarr sur des données fictives : lecture du CSV
// (src/lib/nomenclature/csv.ts), aperçu et idempotence de l'import.
// Lancement, dans web/ : node scripts/verifier-nomenclature.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import {
  FAMILLES_PAR_DEFAUT, appliquerImport, comparerImport, decoderTexte, detecterSeparateur, extraireProduits, filtrerFamilles,
  lireCsv, resumerFamilles,
} from '../src/lib/nomenclature/csv.ts';

let n = 0;
const ok = (nom, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

// ---------------------------------------------------------------------------------------------------------------
// Données fictives (aucune donnée réelle de Dolibarr)
// ---------------------------------------------------------------------------------------------------------------
const ENTETE = 'rowid;ref;label;description_courte;type;unite;categories;en_vente;en_achat;code_barres;date_creation;'
  + 'stock_physique_total;stock_entrepot_fuites;unite_code;prefixe_ref;prix_vente;pmp';
const CSV = [
  ENTETE,
  '101;TST00101;MANCHON PE DN 25;;produit;U;;1;1;;2024-01-01 00:00:00;12.0000;0.0000;Uni;TST;15.50;9.20',
  '102;TST00102;"COLLIER PRISE EN CHARGE 63 X 20";"collier ; fonte";produit;U;;1;1;;2024-01-01 00:00:00;3;0;Uni;TST;80;55',
  '103;TST00103;"ROBINET ""PEC"" 40X 1 1/2";;produit;U;;0;0;;2024-01-01 00:00:00;0;0;Uni;TST;;',
  '104;XYZ00001;GILET FLUO;;produit;U;;1;1;;2024-01-01 00:00:00;1;0;Uni;XYZ;5;4',
  'abc;TST00105;IDENTIFIANT INVALIDE;;produit;U;;1;1;;;;;;TST;;',
  '106;;SANS REFERENCE;;produit;U;;1;1;;;;;;TST;;',
  '101;TST00101;MANCHON PE DN 25 (doublon);;produit;U;;1;1;;;;;;TST;;',
  '107;TST00107;"TUBE PE PN16 DN 63\nsur deux lignes";;produit;m;;1;0;;;;;;TST;;',
].join('\r\n');

ok('texte du fichier : UTF-8 avec BOM, sinon Windows-1252 (CSV enregistré par Excel)', () => {
  const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('rowid;label\r\n1;Réducteur')]);
  assert.equal(decoderTexte(bom), 'rowid;label\r\n1;Réducteur');
  const cp1252 = new Uint8Array([0x52, 0xe9, 0x64, 0x75, 0x63, 0x74, 0x65, 0x75, 0x72]); // « Réducteur » en Windows-1252
  assert.equal(decoderTexte(cp1252), 'Réducteur');
});

ok('CSV : séparateur détecté, guillemets doublés, « ; » et saut de ligne dans un champ, CRLF', () => {
  assert.equal(detecterSeparateur('a;b\n1;2'), ';');
  assert.equal(detecterSeparateur('a,b\n1,2'), ',');
  const lignes = lireCsv(CSV);
  assert.equal(lignes.length, 9);
  assert.equal(lignes[2][2], 'COLLIER PRISE EN CHARGE 63 X 20');
  assert.equal(lignes[2][3], 'collier ; fonte');
  assert.equal(lignes[3][2], 'ROBINET "PEC" 40X 1 1/2');
  assert.equal(lignes[8][2], 'TUBE PE PN16 DN 63\nsur deux lignes');
  assert.deepEqual(lireCsv('a,b\r\n"x, y",2\r\n\r\n', ','), [['a', 'b'], ['x, y', '2']]);
});

const lecture = extraireProduits(lireCsv(CSV));

ok('extraction : seules les colonnes utiles, jamais le prix ni le PMP ni le stock', () => {
  assert.deepEqual(lecture.colonnesManquantes, []);
  for (const p of lecture.produits) {
    assert.deepEqual(Object.keys(p).sort(), ['actif', 'designation', 'dolibarr_id', 'famille', 'ref', 'unite']);
  }
  assert.ok(!JSON.stringify(lecture.produits).includes('15.50'));
  assert.ok(!JSON.stringify(lecture.produits).includes('55'));
});

ok('extraction : lignes rejetées, doublon d\'identifiant, état en vente / en achat, libellé sur une ligne', () => {
  assert.deepEqual(lecture.rejetees, [{ ligne: 6, motif: 'identifiant invalide' }, { ligne: 7, motif: 'référence vide ou trop longue' }]);
  assert.equal(lecture.doublons, 1);
  assert.deepEqual(lecture.produits.map((p) => p.dolibarr_id), [101, 102, 103, 104, 107]);
  assert.equal(lecture.produits.find((p) => p.dolibarr_id === 101).designation, 'MANCHON PE DN 25 (doublon)');
  assert.equal(lecture.produits.find((p) => p.dolibarr_id === 103).actif, false);
  assert.equal(lecture.produits.find((p) => p.dolibarr_id === 107).actif, true);
  assert.equal(lecture.produits.find((p) => p.dolibarr_id === 107).designation, 'TUBE PE PN16 DN 63 sur deux lignes');
  assert.equal(lecture.produits.find((p) => p.dolibarr_id === 107).unite, 'm');
});

ok('extraction : famille tirée de la référence si la colonne manque ; colonnes indispensables signalées', () => {
  const sansFamille = extraireProduits(lireCsv('rowid;ref;label\n5;ab00005;Pièce'));
  assert.equal(sansFamille.produits[0].famille, 'AB');
  assert.equal(sansFamille.produits[0].actif, true);
  assert.deepEqual(extraireProduits(lireCsv('id;nom\n1;x')).colonnesManquantes, ['ref', 'label']);
});

ok('familles : résumé (défaut d\'abord) et filtre', () => {
  const r = resumerFamilles(lecture.produits);
  assert.deepEqual(r.map((f) => [f.famille, f.total, f.actifs]), [['TST', 4, 3], ['XYZ', 1, 1]]);
  assert.deepEqual(FAMILLES_PAR_DEFAUT, ['RAC', 'CND', 'ROB', 'AEP', 'VRI']);
  assert.deepEqual(filtrerFamilles(lecture.produits, ['XYZ']).map((p) => p.ref), ['XYZ00001']);
});

ok('import : aperçu des changements et idempotence', () => {
  const lus = filtrerFamilles(lecture.produits, ['TST']);
  const apres1 = appliquerImport([], lus);
  assert.deepEqual(comparerImport([], lus), { nouveaux: 4, modifies: 0, designationsModifiees: 0, desactives: 0, inchanges: 0 });
  assert.deepEqual(comparerImport(apres1, lus), { nouveaux: 0, modifies: 0, designationsModifiees: 0, desactives: 0, inchanges: 4 });
  assert.deepEqual(appliquerImport(apres1, lus), apres1);
  const lus2 = lus.filter((p) => p.dolibarr_id !== 107).map((p) => (p.dolibarr_id === 102 ? { ...p, designation: 'COLLIER PEC 63 X 20' } : p));
  assert.deepEqual(comparerImport(apres1, lus2), { nouveaux: 0, modifies: 1, designationsModifiees: 1, desactives: 1, inchanges: 2 });
  const apres2 = appliquerImport(apres1, lus2);
  assert.equal(apres2.find((p) => p.dolibarr_id === 107).actif, false);
  assert.equal(apres2.length, 4);
  assert.deepEqual(comparerImport(apres2, lus2).desactives, 0);
});


console.log(`\n${n} vérifications réussies.`);

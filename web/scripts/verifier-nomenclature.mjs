// Vérification de la nomenclature Dolibarr sur des données fictives : lecture du CSV (src/lib/nomenclature/csv.ts),
// normalisation et rapprochement du catalogue (src/lib/nomenclature/rapprochement.ts), faux positifs à éviter,
// idempotence de l'import.
// Lancement, dans web/ : node scripts/verifier-nomenclature.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import {
  FAMILLES_PAR_DEFAUT, appliquerImport, comparerImport, decoderTexte, detecterSeparateur, extraireProduits, filtrerFamilles,
  lireCsv, resumerFamilles, uniteCatalogue,
} from '../src/lib/nomenclature/csv.ts';
import {
  analyser, analyserPiece, comparer, compterStatuts, normaliser, rapprocher, rechercherProduits,
} from '../src/lib/nomenclature/rapprochement.ts';

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

ok('unités Dolibarr → catalogue', () => {
  assert.deepEqual(['U', 'm', 'M2', 'm3', 'kg', 'Barre', null].map(uniteCatalogue), ['u', 'ml', 'm2', 'm3', 'kg', 'u', 'u']);
});

// ---------------------------------------------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------------------------------------------
const dims = (t) => analyser(t).dims;

ok('normalisation : accents, majuscules, séparateurs', () => {
  assert.equal(normaliser("Réducteur d'arrêt  (DN 40),5"), 'REDUCTEUR D ARRET DN 40 5');
  assert.equal(analyser('Bouche à clé carrée').type, 'bouche_a_cle');
});

ok('diamètres : « 32/32 » = « DN 32 » = « DN32 », séparateurs « / », « X », « * »', () => {
  assert.deepEqual(dims('Manchon droit 32/32'), ['32']);
  assert.deepEqual(dims('MANCHON PE DN32'), ['32']);
  assert.deepEqual(dims('Collier PEC 63/20'), dims('COLLIER PEC 63 X 20'));
  assert.deepEqual(dims('Joint dissymétrique 150*160'), ['150', '160']);
  assert.deepEqual(dims('BRIDE MAJOR DN63/60-65'), ['63', 'R60-65']);
  assert.deepEqual(dims('STABILISATEUR DN50-DN40'), ['R40-50']);
});

ok('filetages : « 1-1/2 » = « 1 1/2 » = « 1X1/2 », fractions seules, mâle / femelle', () => {
  assert.deepEqual(dims('Robinet PEC 40 1-1/2'), ['40', 'T1.5']);
  assert.deepEqual(dims('ROBINET PEC 40X 1 1/2'), ['40', 'T1.5']);
  assert.deepEqual(dims('RACCORD 50X1X1/2'), ['50', 'T1.5']);
  assert.deepEqual(dims('Raccord en laiton 32 3/4'), ['32', 'T0.75']);
  assert.deepEqual(analyser('RACCORD 32X3/4M').mots, ['MALE']);
  assert.deepEqual(analyser('RACCORD 32X1/2 F').mots, ['FEMELLE']);
  assert.deepEqual(dims('ROBINET PEC 20X1MALE'), ['20', 'T1']);
});

ok('synonymes : PEHD = PE = polyéthylène, PEC = prise en charge, amiante-ciment = AC', () => {
  assert.deepEqual(analyser('TUBE PEHD DN 63').materiaux, ['PE']);
  assert.deepEqual(analyser('Tube en polyéthylène DN 63').materiaux, ['PE']);
  assert.equal(analyser('COLLIER PRISE EN CHARGE 63 X 20').type, 'collier_pec');
  assert.equal(analyser('Collier PEC 63/20').type, 'collier_pec');
  assert.deepEqual(analyser('JOINT GIBAULT AMIANTE CIMENT 400').materiaux, ['AC']);
  assert.equal(analyser('monchette dn 200').type, 'manchette');
});

ok('types de pièce : le mot-clé le plus à gauche, la règle la plus précise', () => {
  const types = ['Robinet vanne 100', 'ROBINET D\'ARRET A RACCORD 15*1/2', 'Robinet PEC 20/25', 'RACCORD COMPTEUR DN15', 'CONE DE REDUCTION 160/110',
    'REDUCTEUR STABILISATEUR PN 10 DN 300', 'TE A 3 BRIDES 150/100', 'PEHD 53/63', 'Tuyau PVC D 63', 'Fillasse'].map((t) => analyser(t).type);
  assert.deepEqual(types, ['vanne', 'robinet_arret', 'robinet_pec', 'raccord', 'cone', 'stabilisateur', 'te', 'tube', 'tube', null]);
});

ok('cas particuliers : angle des coudes, diamètre intérieur / extérieur d\'un tuyau, classe de tampon, longueurs', () => {
  assert.equal(analyser('coude dn 1/8 110').angle, '1/8');
  assert.deepEqual(dims('coude dn 1/8 110'), ['110']);
  assert.equal(analyser('COUDE PVC 45° DN100').angle, '1/8');
  assert.deepEqual(dims('PEHD 53/63'), ['63']);
  assert.deepEqual(dims('Manchon réduit 75/63'), ['63', '75']);
  assert.deepEqual(analyser('TAMPON D400 850x850').classes, ['D400']);
  assert.deepEqual(dims('TAMPON D400 850x850'), ['850']);
  assert.ok(analyser('MANCHETTE DN100 700mm').mots.includes('L700MM'));
  assert.ok(analyser('TUBE ACIER 6ML DN 80').mots.includes('L6ML'));
  assert.ok(!analyser('TREILLIS 6m x 2m').mots.includes('MALE'));
});

// ---------------------------------------------------------------------------------------------------------------
// Rapprochement
// ---------------------------------------------------------------------------------------------------------------
const produit = (dolibarr_id, designation, o = {}) => ({ dolibarr_id, ref: `TST${String(dolibarr_id).padStart(5, '0')}`, designation, unite: 'U', famille: 'TST', actif: true, ...o });
const NOMENCLATURE = [
  produit(201, 'MANCHON PE DN 25'),
  produit(202, 'MANCHON PE DN 32'),
  produit(203, 'MANCHON REDUIT 32/25'),
  produit(204, 'MANCHON PVC DN 63'),
  produit(205, 'MANCHON PE DN 63'),
  produit(206, 'COLLIER PRISE EN CHARGE 63 X 20'),
  produit(207, 'COLLIER PRISE EN CHARGE 400 X 20'),
  produit(208, 'ROBINET PEC 40X 1 1/2'),
  produit(209, 'RACCORD 40X1 3/4 STANDARD'),
  produit(210, 'RACCORD 32X3/4M'),
  produit(211, 'RACCORD 32X3/4 F'),
  produit(212, 'VANNE A OPERCULE DN100'),
  produit(213, 'VANNE PAPILLON DN100'),
  produit(214, 'TUBE PE PN 10 DN 63', { unite: 'm' }),
  produit(215, 'TUBE PE PN 16 DN 63', { unite: 'm' }),
  produit(216, 'TUBE ALLONGE DN90', { unite: 'm' }),
  produit(217, 'COUDE EMB 1/4 DN 90'),
  produit(218, 'COUDE PE DN 75'),
  produit(219, 'COUDE PVC DN 75'),
  produit(220, 'BOUCHON PE DN 40'),
  produit(221, 'BRIDE MAJOR DN160/150'),
  produit(222, 'JOINT GIBAULT PVC 110'),
  produit(223, 'VENTOUSE DN 80', { actif: false }),
  produit(224, 'TABERNACLE ROND DN75'),
  produit(225, 'TABERNACLE CARRE DN90'),
];
const piece = (id, designation, famille = null, unite = 'u') => ({ id, designation, famille, unite });
const PIECES = [
  piece('p1', 'Manchon droit 25/25', 'manchon polyéthylène'),
  piece('p2', 'Manchon réduit 32/25', 'manchon polyéthylène'),
  piece('p3', 'Manchon réduit 40/32', 'manchon polyéthylène'),
  piece('p4', 'Manchon droit 63/63', 'manchon polyéthylène'),
  piece('p5', 'Collier PEC 63/20', 'collier de prise en charge'),
  piece('p6', 'Collier PEC 400/40', 'collier de prise en charge'),
  piece('p7', 'Robinet PEC 40 1-1/2 F', 'robinet de prise en charge'),
  piece('p8', 'Raccord en laiton 40 1-1/4'),
  piece('p9', 'Raccord en laiton 32 3/4'),
  piece('p10', 'Robinet vanne 100'),
  piece('p11', 'PEHD 53/63', 'tuyau polyéthylène', 'ml'),
  piece('p12', 'CONDUITE DN 90 ACIER GALVANISE'),
  piece('p13', 'coude dn 90', 'raccord, coude ou bouchon polyéthylène'),
  piece('p14', 'coude dn 75', 'raccord, coude ou bouchon polyéthylène'),
  piece('p15', 'bouchon dn 40', 'raccord, coude ou bouchon polyéthylène'),
  piece('p16', 'bouchon dn 40 ASTORE', 'raccord, coude ou bouchon polyéthylène'),
  piece('p17', 'bride major dn 160'),
  piece('p18', 'Joint Gibault 110', 'jonction ou tuyau de conduite AC/PVC'),
  piece('p19', 'ventouse DN 80'),
  piece('p20', 'Tabernacle'),
  piece('p21', 'MANCHON PE DN 32'),
];
const resultats = rapprocher(PIECES, NOMENCLATURE);
const r = (id) => resultats.find((x) => x.pieceId === id);
const propose = (id) => r(id).proposition?.produit.dolibarr_id ?? null;

ok('sûr : même type, mêmes dimensions, une seule correspondance complète', () => {
  for (const [id, attendu] of [['p1', 201], ['p2', 203], ['p5', 206], ['p14', 218], ['p15', 220], ['p18', 222], ['p21', 202]]) {
    assert.equal(r(id).statut, 'sur', id);
    assert.equal(propose(id), attendu, id);
  }
  assert.equal(r('p21').motif, 'même désignation');
});

ok('probable : plusieurs produits possibles, qualificatif absent, produit inactif, pièce sans dimension', () => {
  assert.equal(r('p9').statut, 'probable'); // mâle ou femelle ?
  assert.ok([210, 211].includes(propose('p9')));
  assert.equal(r('p10').statut, 'probable'); // opercule ou papillon ?
  assert.equal(r('p11').statut, 'probable'); // PN 10 ou PN 16 ?
  assert.ok([214, 215].includes(propose('p11')));
  assert.equal(r('p7').statut, 'probable'); // « F » absent du produit
  assert.equal(propose('p7'), 208);
  assert.equal(r('p19').statut, 'probable'); // produit inactif dans Dolibarr : jamais « sûr »
  assert.ok(r('p19').proposition.ecarts.includes('produit inactif dans Dolibarr'));
  assert.equal(r('p20').statut, 'probable'); // tabernacle sans dimension
});

ok('faux positifs évités : diamètres, filetages, matière, assemblage, type jamais confondus', () => {
  assert.equal(r('p3').statut, 'aucun'); // 40/32 ≠ 32/25, ≠ DN 32
  assert.equal(r('p6').statut, 'aucun'); // 400/40 ≠ 400 × 20
  assert.equal(r('p8').statut, 'aucun'); // 1 1/4 ≠ 1 3/4
  assert.equal(r('p12').statut, 'aucun'); // conduite acier ≠ tube de matière inconnue
  assert.equal(r('p13').statut, 'aucun'); // coude PE ≠ coude à emboîtement
  assert.equal(r('p17').statut, 'aucun'); // DN 160 ≠ 160/150
  assert.equal(propose('p4'), 205); // manchon PE, jamais le manchon PVC
  assert.notEqual(propose('p14'), 219); // coude PE, jamais le coude PVC
  const jamais = [
    ['Manchon réduit 40/32', 'MANCHON REDUIT 32/25'],
    ['Manchon réduit 40/32', 'MANCHON PE DN 40'],
    ['Collier PEC 63/20', 'COLLIER PRISE EN CHARGE 63 X 40'],
    ['Collier PEC 63/20', 'COLLIER PE DN 63/20'],
    ['Raccord 32 1/2', 'RACCORD 32X3/4M'],
    ['Robinet PEC 20/32', 'ROBINET PEC 20X25'],
    ['Joint Gibault 75/80', 'JOINT GIBAULT PVC 75'],
    ['Tuyau PVC D 63', 'TUBE PE PN 10 DN 63'],
    ['coude dn 1/8 110', 'COUDE 1/4 PE DN 110'],
    ['RACCORD 32X1/2 F', 'RACCORD 32X1/2 M'],
    ['TAMPON B125 400X400', 'TAMPON D400 400X400'],
  ];
  for (const [p, d] of jamais) {
    assert.equal(comparer(analyserPiece(piece('x', p)), analyser(d)).niveau, 'incompatible', `${p} ↔ ${d}`);
  }
});

ok('un produit n\'est proposé qu\'à une pièce : la seconde est marquée en double, jamais sûre', () => {
  assert.equal(r('p15').doublonDe, null);
  assert.equal(r('p16').doublonDe, 'p15');
  assert.equal(r('p16').statut, 'probable');
  const ids = resultats.filter((x) => x.proposition && !x.doublonDe).map((x) => x.proposition.produit.dolibarr_id);
  assert.equal(new Set(ids).size, ids.length);
});

ok('produits déjà rapprochés dans le marché : jamais reproposés comme sûrs', () => {
  const avecPris = rapprocher([piece('p1', 'Manchon droit 25/25', 'manchon polyéthylène')], NOMENCLATURE, { pris: new Map([[201, 'autre']]) });
  assert.equal(avecPris[0].statut, 'probable');
  assert.equal(avecPris[0].doublonDe, 'autre');
});

ok('autres candidats : au plus 3, sans la proposition, écarts expliqués', () => {
  for (const x of resultats) {
    assert.ok(x.autres.length <= 3);
    if (x.proposition) assert.ok(!x.autres.some((c) => c.produit.dolibarr_id === x.proposition.produit.dolibarr_id));
  }
  const p3 = r('p3');
  assert.ok(p3.autres.length > 0);
  assert.ok(p3.autres.every((c) => c.niveau === 'incompatible' && c.ecarts.length > 0));
});

ok('comptage et stabilité : même entrée, même résultat', () => {
  assert.deepEqual(compterStatuts(resultats), compterStatuts(rapprocher(PIECES, NOMENCLATURE)));
  assert.deepEqual(rapprocher(PIECES, NOMENCLATURE).map((x) => [x.pieceId, x.statut, propose(x.pieceId)]),
    resultats.map((x) => [x.pieceId, x.statut, propose(x.pieceId)]));
  const c = compterStatuts(resultats);
  assert.equal(c.sur + c.probable + c.aucun, PIECES.length);
});

ok('recherche par mots : désignation ou référence, « DN25 » = « DN 25 », actifs d\'abord', () => {
  assert.deepEqual(rechercherProduits(NOMENCLATURE, 'manchon 25').map((p) => p.dolibarr_id), [201, 203]);
  assert.deepEqual(rechercherProduits(NOMENCLATURE, 'manchon dn25').map((p) => p.dolibarr_id), [201]);
  assert.deepEqual(rechercherProduits(NOMENCLATURE, 'tst00206').map((p) => p.dolibarr_id), [206]);
  assert.deepEqual(rechercherProduits(NOMENCLATURE, 'ventouse').map((p) => p.dolibarr_id), [223]);
  assert.deepEqual(rechercherProduits(NOMENCLATURE, '   '), []);
});

console.log(`\n${n} vérifications réussies.`);

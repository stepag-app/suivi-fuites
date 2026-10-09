// Vérification des règles de saisie du panneau (chantier v2, S5 : src/lib/saisie/regles.ts) : champs exigés,
// diamètres par matériau, gardes-fous, capsules de pièces, droits par étape et sur les photos, dates.
// Lancement, dans web/ : node scripts/verifier-saisie.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import {
  CHAMPS_F1, capsulesProposees, champsExiges, champsManquants, changerQuantite, chercherArticles, dansLeFutur,
  depuisChampDate, diametresPour, differencePieces, droitsEtape, droitsPhoto, estBureau, gardesFousRefection,
  gardesFousReparation, lireNombre, longueurPoseDemandee, motifExige, pointWkt, refectionAppelee, saisieDifferee,
  versChampDate,
} from '../src/lib/saisie/regles.ts';

let n = 0;
const ok = (nom, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

const MOI = 'aaaaaaaa-0000-4000-8000-000000000001';
const AUTRE = 'aaaaaaaa-0000-4000-8000-000000000002';
// Droits : ensemble de « type/action » accordés.
const droits = (...liste) => (type, action) => liste.includes(`${type}/${action}`);
const AGENT_REP = droits('fuites/lire', 'interventions/lire', 'interventions/creer', 'interventions/modifier', 'photos/creer', 'photos/modifier', 'photos/supprimer');
const RESPONSABLE = droits(
  'fuites/modifier', 'fuites/valider', 'interventions/modifier', 'interventions/valider', 'refections/modifier', 'refections/valider',
  'photos/modifier', 'photos/supprimer', 'photos/valider', 'quantites/lire',
);

ok('nombres saisis : virgule, point, espaces, vide', () => {
  assert.equal(lireNombre('0,80'), 0.8);
  assert.equal(lireNombre(' 1.5 '), 1.5);
  assert.equal(lireNombre('1 200'), 1200);
  assert.equal(lireNombre(''), null);
  assert.equal(lireNombre('abc'), null);
  assert.equal(lireNombre(3), 3);
});

ok('champs exigés : F1 toujours, plus ceux du marché', () => {
  assert.deepEqual(champsExiges([]), CHAMPS_F1);
  assert.deepEqual(champsExiges(null), CHAMPS_F1);
  assert.deepEqual(champsExiges(['adresse', 'reference_srm']), [...CHAMPS_F1, 'adresse']);
  const manque = champsManquants({ reference_srm: '302-684-001', secteur_id: '', ouvrage: 'branchement', visibilite: null }, CHAMPS_F1);
  assert.deepEqual(manque, ['secteur_id', 'visibilite', 'nature_degradation_id']);
  assert.deepEqual(champsManquants({ reference_srm: '   ' }, ['reference_srm']), ['reference_srm']);
});

ok('diamètres selon le matériau : actifs, triés, sans doublon ; « autre » : saisie libre', () => {
  const liste = [
    { materiau: 'pvc', diametre_mm: 110, actif: true }, { materiau: 'pvc', diametre_mm: 63, actif: true },
    { materiau: 'pvc', diametre_mm: 90, actif: false }, { materiau: 'polyethylene', diametre_mm: 32, actif: true },
    { materiau: 'pvc', diametre_mm: 110, actif: true },
  ];
  assert.deepEqual(diametresPour(liste, 'pvc'), [63, 110]);
  assert.deepEqual(diametresPour(liste, 'polyethylene'), [32]);
  assert.deepEqual(diametresPour(liste, 'autre'), []);
  assert.deepEqual(diametresPour(liste, ''), []);
});

const rep = (champs) => ({
  resultat: 'reparee', materiau: 'polyethylene', tuyauRepare: true, elementRemplace: false, longueurPose: null,
  fouilleLongueur: 1.2, fouilleLargeur: 0.8, fouilleProfondeur: 1, emplacement: 'trottoir', revetementARefaire: true, ...champs,
});

ok('gardes-fous de la fouille : 10 / 3 / 3 m, unité suspecte (80 au lieu de 0,80)', () => {
  assert.deepEqual(gardesFousReparation(rep({})), []);
  const av = gardesFousReparation(rep({ fouilleLongueur: 80, fouilleLargeur: 4, fouilleProfondeur: 3 }));
  assert.deepEqual(av.map((a) => a.champ), ['fouille_longueur', 'fouille_largeur']);
  assert.match(av[0].message, /80 m.*0,8 m \?/);
  assert.equal(gardesFousReparation(rep({ fouilleProfondeur: 3.5 })).length, 1);
});

ok('fouille de plus de 2 m sans élément remplacé : avertissement', () => {
  assert.equal(gardesFousReparation(rep({ fouilleLongueur: 2.5 }))[0].champ, 'fouille_longueur');
  assert.deepEqual(gardesFousReparation(rep({ fouilleLongueur: 2.5, elementRemplace: true })), []);
});

ok('longueur de PE posée : entre la plus petite et la plus grande dimension de la fouille', () => {
  assert.equal(longueurPoseDemandee(rep({})), true);
  assert.equal(longueurPoseDemandee(rep({ materiau: 'pvc' })), false);
  assert.equal(longueurPoseDemandee(rep({ tuyauRepare: false })), false);
  assert.deepEqual(gardesFousReparation(rep({ longueurPose: 1 })), []);
  assert.match(gardesFousReparation(rep({ longueurPose: 0.5 }))[0].message, /plus courte.*0,8 m/);
  assert.match(gardesFousReparation(rep({ longueurPose: 1.5 }))[0].message, /plus longue.*1,2 m/);
  assert.deepEqual(gardesFousReparation(rep({ longueurPose: 0.8 })), []);
  assert.deepEqual(gardesFousReparation(rep({ longueurPose: 1.2 })), []);
});

ok('non réparée avec terrassement sur revêtement : réfection obligatoire annoncée (P8)', () => {
  const nr = rep({ resultat: 'non_reparee' });
  assert.equal(refectionAppelee(nr), true);
  assert.match(gardesFousReparation(nr).at(-1).message, /réfection sera obligatoire/);
  assert.equal(refectionAppelee(rep({ resultat: 'non_reparee', fouilleLongueur: null })), false);
  assert.equal(refectionAppelee(rep({ resultat: 'non_reparee', emplacement: 'terrain_naturel' })), false);
  assert.equal(refectionAppelee(rep({ revetementARefaire: false })), false);
  assert.equal(refectionAppelee(rep({ revetementARefaire: null })), true);
  assert.equal(refectionAppelee(rep({ resultat: 'en_cours' })), false);
});

ok('réfection : > 30 m², total des réfections < total des fouilles (P9)', () => {
  const base = { faite: true, longueur: 1.5, largeur: 1, autresRefections: [], fouilles: [1.2] };
  assert.deepEqual(gardesFousRefection(base), []);
  assert.match(gardesFousRefection({ ...base, longueur: 8, largeur: 4 })[0].message, /32 m².*30 m²/);
  assert.match(gardesFousRefection({ ...base, longueur: 1, largeur: 1 })[0].message, /moins que les fouilles.*1,2 m²/);
  assert.deepEqual(gardesFousRefection({ ...base, longueur: 1, largeur: 0.5, autresRefections: [0.7] }), []);
  assert.deepEqual(gardesFousRefection({ ...base, faite: false, longueur: 80 }), []);
  assert.equal(gardesFousRefection({ ...base, longueur: 15 })[0].champ, 'longueur');
});

const ARTICLES = [
  { id: 1, designation: 'Manchon PE DE 32', unite: 'U' },
  { id: 2, designation: 'Manchon PE DE 63', unite: 'U' },
  { id: 3, designation: 'Collier de prise en charge DN 63', unite: 'U' },
  { id: 4, designation: 'Joint Gibault DN 100', unite: 'U' },
  { id: 5, designation: 'Tube PE DE 32', unite: 'm' },
  { id: 6, designation: 'Bouche à clé fonte', unite: 'U' },
  { id: 7, designation: 'Raccord laiton 20/27', unite: 'U' },
  { id: 8, designation: 'Té PVC 132', unite: 'U' },
];

ok('capsules : matériau et diamètre d\'abord, puis le diamètre, puis les plus utilisés', () => {
  const pe32 = capsulesProposees(ARTICLES, { materiau: 'polyethylene', diametre: 32 }).map((a) => a.id);
  assert.deepEqual(pe32.slice(0, 2), [1, 5]);
  assert.ok(pe32.includes(2), 'PE 63 : matériau seul');
  assert.ok(!pe32.includes(8), '« 132 » ne vaut pas 32');
  const usages = new Map([[6, 9], [3, 2]]);
  const fonte100 = capsulesProposees(ARTICLES, { materiau: 'fonte_ductile', diametre: 100 }, usages).map((a) => a.id);
  assert.equal(fonte100[0], 4);
  assert.ok(fonte100.includes(6));
  const rien = capsulesProposees(ARTICLES, {}, usages).map((a) => a.id);
  assert.deepEqual(rien, [6, 3]);
  assert.equal(capsulesProposees(ARTICLES, { materiau: 'polyethylene' }, new Map(), 2).length, 2);
});

ok('recherche d\'article : tous les mots, sans accents ni casse', () => {
  assert.deepEqual(chercherArticles(ARTICLES, 'manchon 63').map((a) => a.id), [2]);
  assert.deepEqual(chercherArticles(ARTICLES, 'BOUCHE a cle').map((a) => a.id), [6]);
  assert.deepEqual(chercherArticles(ARTICLES, '  '), []);
});

ok('« − / + » des capsules et différence avec la saisie d\'origine', () => {
  let l = changerQuantite([], ARTICLES[0], 1);
  l = changerQuantite(l, ARTICLES[0], 1);
  l = changerQuantite(l, ARTICLES[2], 1);
  assert.deepEqual(l.map((x) => [x.produit_id, x.quantite]), [[1, 2], [3, 1]]);
  l = changerQuantite(l, ARTICLES[2], -1);
  assert.deepEqual(l.map((x) => x.produit_id), [1]);
  assert.deepEqual(changerQuantite(l, ARTICLES[5], -1), l);
  const avant = [{ id: 'p1', produit_id: 1, quantite: 1 }, { id: 'p2', produit_id: 4, quantite: 1 }];
  const d = differencePieces(avant, [{ produit_id: 1, designation: '', unite: null, quantite: 2 }, { produit_id: 7, designation: '', unite: null, quantite: 1 }]);
  assert.deepEqual(d.changees.map((c) => [c.id, c.ligne.quantite]), [['p1', 2]]);
  assert.deepEqual(d.ajouts.map((a) => a.produit_id), [7]);
  assert.deepEqual(d.retirees, ['p2']);
});

ok('droits par étape : auteur avant validation, ajout seulement après ; responsable toujours (V2)', () => {
  const ligne = { auteur_terrain_id: MOI, saisi_par: MOI, validee_le: null, cree_le: '2026-10-08T10:00:00Z' };
  assert.deepEqual(droitsEtape('reparation', ligne, { moi: MOI, peut: AGENT_REP }), { valider: false, modifier: true, raison: null });
  const validee = droitsEtape('reparation', { ...ligne, validee_le: '2026-10-08T12:00:00Z' }, { moi: MOI, peut: AGENT_REP });
  assert.equal(validee.modifier, false);
  assert.match(validee.raison, /ajoutez un nouvel élément/);
  assert.match(droitsEtape('reparation', { ...ligne, auteur_terrain_id: AUTRE, saisi_par: AUTRE }, { moi: MOI, peut: AGENT_REP }).raison, /autre agent/);
  assert.deepEqual(droitsEtape('reparation', { ...ligne, auteur_terrain_id: AUTRE }, { moi: MOI, peut: RESPONSABLE }), { valider: true, modifier: true, raison: null });
  assert.equal(droitsEtape('reparation', { ...ligne, validee_le: '2026-10-08T12:00:00Z' }, { moi: MOI, peut: RESPONSABLE }).valider, false);
  // Réfection : droit « refections » (et non « interventions »)
  assert.equal(droitsEtape('refection', ligne, { moi: MOI, peut: AGENT_REP }).modifier, false);
});

ok('fuite verrouillée par un lot (V6) : l\'agent modifie seulement ce qu\'il a ajouté depuis', () => {
  const verrouilleeLe = '2026-10-05T17:30:00Z';
  const avant = { auteur_terrain_id: MOI, validee_le: null, cree_le: '2026-10-04T10:00:00Z' };
  const apres = { ...avant, cree_le: '2026-10-06T10:00:00Z' };
  assert.equal(droitsEtape('reparation', avant, { moi: MOI, peut: AGENT_REP, verrouilleeLe }).modifier, false);
  assert.equal(droitsEtape('reparation', apres, { moi: MOI, peut: AGENT_REP, verrouilleeLe }).modifier, true);
  assert.equal(droitsEtape('reparation', avant, { moi: MOI, peut: RESPONSABLE, verrouilleeLe }).modifier, true);
});

ok('photos (V3) : avant la validation de l\'étape, réservées au responsable ; après, l\'auteur', () => {
  const v = '2026-10-08T12:00:00Z';
  const ancienne = { auteur_terrain_id: MOI, cree_le: '2026-10-08T11:00:00Z' };
  const recente = { auteur_terrain_id: MOI, cree_le: '2026-10-08T13:00:00Z' };
  assert.equal(droitsPhoto(ancienne, { moi: MOI, peut: AGENT_REP, validationEtape: v }).retirer, false);
  assert.deepEqual(droitsPhoto(recente, { moi: MOI, peut: AGENT_REP, validationEtape: v }), { modifier: true, retirer: true, raison: null });
  assert.deepEqual(droitsPhoto(ancienne, { moi: MOI, peut: AGENT_REP, validationEtape: null }), { modifier: true, retirer: true, raison: null });
  assert.equal(droitsPhoto({ ...recente, auteur_terrain_id: AUTRE }, { moi: MOI, peut: AGENT_REP, validationEtape: v }).modifier, false);
  assert.equal(droitsPhoto(ancienne, { moi: MOI, peut: RESPONSABLE, validationEtape: v }).retirer, true);
});

ok('bureau (R7) et motif obligatoire (V5)', () => {
  assert.equal(estBureau(RESPONSABLE), true);
  assert.equal(estBureau(AGENT_REP), false);
  const fuite = { auteur_terrain_id: AUTRE, saisi_par: AUTRE };
  assert.equal(motifExige(['adresse'], fuite, MOI), false);
  assert.equal(motifExige(['adresse', 'position'], fuite, MOI), true);
  assert.equal(motifExige(['date_detection'], { auteur_terrain_id: MOI }, MOI), false);
});

ok('saisie différée : plus de 12 h, au bureau ou à la place d\'un agent', () => {
  assert.equal(saisieDifferee('2026-10-08T06:00:00Z', '2026-10-08T19:00:00Z', true), true);
  assert.equal(saisieDifferee('2026-10-08T08:00:00Z', '2026-10-08T19:00:00Z', true), false);
  assert.equal(saisieDifferee('2026-10-07T06:00:00Z', '2026-10-08T19:00:00Z', false), false);
});

ok('dates à l\'heure du Maroc : aller-retour du champ datetime-local, futur', () => {
  const iso = '2026-10-08T21:45:00.000Z';
  const champ = versChampDate(iso);
  assert.match(champ, /^2026-10-08T2[12]:45$/);
  assert.equal(depuisChampDate(champ), iso);
  assert.equal(depuisChampDate(versChampDate('2026-01-15T08:05:00.000Z')), '2026-01-15T08:05:00.000Z');
  assert.equal(depuisChampDate(''), null);
  assert.equal(dansLeFutur('2026-10-08T12:00:00Z', new Date('2026-10-08T11:00:00Z')), true);
  assert.equal(dansLeFutur('2026-10-08T11:03:00Z', new Date('2026-10-08T11:00:00Z')), false);
  assert.equal(pointWkt(-1.9, 34.68), 'SRID=4326;POINT(-1.9 34.68)');
});

console.log(`\n${n} vérifications réussies`);

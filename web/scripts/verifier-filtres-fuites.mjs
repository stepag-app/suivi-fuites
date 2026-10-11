// Vérification des filtres de la liste des fuites dans l'adresse (src/app/(app)/fuites/filtres.ts) et des liens
// du tableau de bord vers la liste filtrée, sur des données fictives.
// Lancement, dans web/ : node scripts/verifier-filtres-fuites.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import {
  CLES_ALERTES, FILTRES_VIDES, STATUTS_EN_ATTENTE, bornesPeriode, correspondance, decrirePeriode, ecrireFiltres, filtresActifs, jourMaroc, jourValide,
  lienFuites, lireFiltres, memesFiltres,
} from '../src/app/(app)/fuites/filtres.ts';
import {
  ORDRE_STATUTS, activite, detecteesSur, parGroupe, parSemaine, repartitionStatuts, situation,
} from '../src/lib/ui/tableau-de-bord.ts';
import { nonReparees, refectionsAFaire } from '../src/lib/ui/indicateurs.ts';

let n = 0;
const ok = (nom, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

const SA = '1a2b3c4d-0000-4000-8000-00000000000a';
const SB = '1a2b3c4d-0000-4000-8000-00000000000b';
const SC = '1a2b3c4d-0000-4000-8000-00000000000c';
const Z1 = '2b3c4d5e-0000-4000-8000-000000000001';
const Z2 = '2b3c4d5e-0000-4000-8000-000000000002';
// Paramètres d'un lien produit pour la liste (« /fuites?… »).
const parametres = (lien) => {
  assert.match(lien, /^\/fuites(\?|$)/);
  return lien.slice('/fuites'.length);
};

ok('aller-retour adresse ↔ filtres (tous les filtres)', () => {
  const f = {
    statuts: ['detectee', 'en_reparation'], zone: Z1, secteur: SA, du: '2026-10-01', au: '2026-10-31', alertes: true,
    alerte: 'alerte_non_reparee', texte: 'rue Ibn Sina & 12',
  };
  const q = ecrireFiltres(f);
  assert.equal(q, `statut=detectee,en_reparation&zone=${Z1}&secteur=${SA}&du=2026-10-01&au=2026-10-31&alertes=1&alerte=alerte_non_reparee&texte=rue+Ibn+Sina+%26+12`);
  assert.deepEqual(lireFiltres(q), f);
  assert.deepEqual(lireFiltres(`?${q}`), f);
  assert.deepEqual(lireFiltres(new URLSearchParams(q)), f);
  assert.equal(ecrireFiltres(lireFiltres(q)), q);
  assert.equal(lienFuites(f), `/fuites?${q}`);
});

ok('adresse vide, filtres vides', () => {
  assert.equal(ecrireFiltres(FILTRES_VIDES), '');
  assert.equal(lienFuites(), '/fuites');
  assert.equal(lienFuites({}), '/fuites');
  assert.deepEqual(lireFiltres(''), FILTRES_VIDES);
  assert.equal(filtresActifs(FILTRES_VIDES), false);
  assert.equal(filtresActifs({ ...FILTRES_VIDES, texte: '   ' }), false);
  assert.equal(filtresActifs({ ...FILTRES_VIDES, alertes: true }), true);
});

ok('ordre fixe des paramètres, quel que soit l\'ordre de l\'adresse', () => {
  const q = `texte=A1&alerte=alerte_communication_srm&alertes=1&au=2026-10-31&du=2026-10-01&secteur=${SB}&zone=${Z2}&statut=reparee`;
  assert.equal(ecrireFiltres(lireFiltres(q)), `statut=reparee&zone=${Z2}&secteur=${SB}&du=2026-10-01&au=2026-10-31&alertes=1&alerte=alerte_communication_srm&texte=A1`);
  assert.equal(memesFiltres(lireFiltres(q), lireFiltres(ecrireFiltres(lireFiltres(q)))), true);
});

ok('valeurs inconnues ou invalides ignorées sans erreur', () => {
  assert.deepEqual(lireFiltres('statut=inconnu&secteur=12&du=2026-02-30&au=demain&alertes=0&page=3&tri=numero'), FILTRES_VIDES);
  assert.deepEqual(lireFiltres('statut=DETECTEE').statuts, []);
  assert.deepEqual(lireFiltres('statut=detectee').statuts, ['detectee']);
  assert.equal(lireFiltres(`secteur=${SA.toUpperCase()}`).secteur, SA);
  assert.equal(lireFiltres('secteur=%27%3B+drop+table').secteur, '');
  assert.equal(lireFiltres('du=2026-13-01').du, '');
  assert.equal(lireFiltres('du=2026-04-31').du, '');
  assert.equal(lireFiltres('du=2028-02-29').du, '2028-02-29');
  assert.equal(lireFiltres('du=2026-02-29').du, '');
  assert.equal(lireFiltres('du=0002-10-05').du, '');
  assert.equal(lireFiltres('du=20261005').du, '');
  assert.equal(lireFiltres('du=2026-10-5').du, '');
  for (const v of ['1', 'true', 'oui', 'TRUE']) assert.equal(lireFiltres(`alertes=${v}`).alertes, true, v);
  for (const v of ['0', 'non', '', 'false']) assert.equal(lireFiltres(`alertes=${v}`).alertes, false, v);
  assert.deepEqual(lireFiltres('statut=reparee&statut=achevee').statuts, ['reparee']);
  assert.equal(lireFiltres(`texte=${'x'.repeat(250)}`).texte.length, 100);
  assert.equal(lireFiltres('texte=++rue++').texte, 'rue');
  assert.equal(lireFiltres('%%%=&&=').texte, '');
  // Écriture : les valeurs invalides ne passent pas dans l'adresse.
  assert.equal(ecrireFiltres({ statuts: ['x'], secteur: 'y', du: '2026-02-30', au: '2026-10-31', alertes: false, texte: ' ' }), 'au=2026-10-31');
  // Période inversée : remise dans l'ordre à la lecture et à l'écriture.
  assert.deepEqual([lireFiltres('du=2026-10-20&au=2026-10-05').du, lireFiltres('du=2026-10-20&au=2026-10-05').au], ['2026-10-05', '2026-10-20']);
  assert.equal(ecrireFiltres({ du: '2026-10-20', au: '2026-10-05' }), 'du=2026-10-05&au=2026-10-20');
});

ok('jours valides', () => {
  assert.equal(jourValide('2026-10-05'), true);
  assert.equal(jourValide('2026-10-32'), false);
  assert.equal(jourValide('1999-12-31'), false);
  assert.equal(jourValide(''), false);
});

ok('période : bornes remises dans l\'ordre, description', () => {
  assert.deepEqual(bornesPeriode({ du: '2026-10-31', au: '2026-10-01' }), { du: '2026-10-01', au: '2026-10-31' });
  assert.deepEqual(bornesPeriode({ du: '2026-10-01', au: 'x' }), { du: '2026-10-01', au: '' });
  assert.equal(decrirePeriode({ du: '2026-10-01', au: '2026-10-31' }), 'détectées du 01/10/2026 au 31/10/2026');
  assert.equal(decrirePeriode({ du: '2026-10-31', au: '2026-10-01' }), 'détectées du 01/10/2026 au 31/10/2026');
  assert.equal(decrirePeriode({ du: '2026-10-05', au: '2026-10-05' }), 'détectées le 05/10/2026');
  assert.equal(decrirePeriode({ du: '2026-10-05', au: '' }), 'détectées depuis le 05/10/2026');
  assert.equal(decrirePeriode({ du: '', au: '2026-10-05' }), 'détectées jusqu\'au 05/10/2026');
  assert.equal(decrirePeriode({ du: '', au: '' }), '');
});

ok('jour de détection à l\'heure du Maroc', () => {
  assert.equal(jourMaroc('2026-09-30T23:30:00Z'), '2026-09-30', 'UTC+0 depuis le 20/09/2026');
  assert.equal(jourMaroc('2026-10-01T00:30:00Z'), '2026-10-01');
  assert.equal(jourMaroc('2026-08-31T23:30:00Z'), '2026-09-01', 'UTC+1 avant le 20/09/2026');
  assert.equal(jourMaroc(null), null);
  assert.equal(jourMaroc('pas une date'), null);
});

// Fuites fictives : champs de la liste (v_fuites) et du tableau de bord (FuiteTdb).
const SANS_ALERTE = {
  alerte_non_reparee: false, alerte_communication_srm: false, alerte_refection_chaussee: false,
  refection_chaussee_hors_delai: false, alerte_refection_trottoir: false, alerte_sans_photo: false,
};
let numero = 0;
const fuite = (o) => ({
  id: `f${++numero}`, numero, statut: 'detectee', zone_id: Z1, zone: 'Zone 1', secteur_id: SA, secteur: 'Secteur A',
  reference_srm: null, adresse: null, derniere_reparation_le: null, derniere_refection_le: null, emplacement_fouille: null,
  nb_photos: 1, ...SANS_ALERTE, ...o,
});
const FUITES = [
  fuite({ date_detection: '2026-10-01T00:30:00Z', derniere_reparation_le: '2026-10-02T00:30:00Z', statut: 'achevee', reference_srm: 'T-2026-00451', adresse: 'Rue Ibn Sina' }),
  fuite({ date_detection: '2026-10-02T08:00:00Z', derniere_reparation_le: '2026-10-04T08:00:00Z', statut: 'reparee', secteur_id: SB, secteur: 'Secteur B', adresse: 'Bd Mohammed V' }),
  fuite({ date_detection: '2026-10-03T08:00:00Z', alerte_non_reparee: true, alerte_sans_photo: true, nb_photos: 0, secteur_id: SB, secteur: 'Secteur B' }),
  fuite({ date_detection: '2026-10-04T08:00:00Z', derniere_reparation_le: '2026-10-04T12:00:00Z', statut: 'en_reparation', alerte_communication_srm: true }),
  fuite({ date_detection: '2026-09-27T09:00:00Z', derniere_reparation_le: '2026-10-01T09:00:00Z', statut: 'reparee', zone_id: Z2, zone: 'Zone 2', secteur_id: SC, secteur: 'Secteur C' }),
  fuite({ date_detection: '2026-09-01T09:00:00Z', derniere_reparation_le: '2026-09-02T09:00:00Z', statut: 'reparee', refection_chaussee_hors_delai: true, alerte_refection_chaussee: true, zone_id: Z2, zone: 'Zone 2', secteur_id: SC, secteur: 'Secteur C' }),
  fuite({ date_detection: '2026-10-02T09:00:00Z', derniere_reparation_le: '2026-10-02T15:00:00Z', statut: 'sans_reparation', secteur_id: null, secteur: null, zone_id: null, zone: null }),
  fuite({ date_detection: '2026-10-31T23:59:00Z', secteur_id: SA, alerte_refection_trottoir: true }),
  fuite({ date_detection: '2026-11-01T00:00:00Z' }),
];
const numeros = (filtres) => FUITES.filter(correspondance(filtres)).map((f) => f.numero);
// Fuites que la liste affiche pour un lien : le lien est relu comme le ferait la page.
const viaLien = (lien) => FUITES.filter(correspondance(lireFiltres(parametres(lien))));
const OCTOBRE = { du: '2026-10-01', au: '2026-10-31' };

ok('filtrage : statut, secteur, alertes, période (bornes comprises, heure du Maroc)', () => {
  assert.deepEqual(numeros(FILTRES_VIDES), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(numeros({ statuts: ['reparee'] }), [2, 5, 6]);
  assert.deepEqual(numeros({ secteur: SB }), [2, 3]);
  assert.deepEqual(numeros({ alertes: true }), [3, 4, 6, 8]);
  // Maroc = UTC+0 depuis le 20/09/2026 : 01/10 à 0 h 30, 31/10 à 23 h 59 (dans octobre) ; 01/11 à 0 h (hors d'octobre).
  assert.deepEqual(numeros(OCTOBRE), [1, 2, 3, 4, 7, 8]);
  assert.deepEqual(numeros({ du: '2026-10-01' }), [1, 2, 3, 4, 7, 8, 9]);
  assert.deepEqual(numeros({ au: '2026-09-30' }), [5, 6]);
  assert.deepEqual(numeros({ du: '2026-10-31', au: '2026-10-01' }), [1, 2, 3, 4, 7, 8]);
  assert.deepEqual(numeros({ du: '2026-10-02', au: '2026-10-02' }), [2, 7]);
  assert.deepEqual(numeros({ ...OCTOBRE, statuts: ['detectee'], secteur: SA, alertes: true }), [8]);
  // Date de détection illisible : exclue dès qu'une période est demandée, gardée sinon.
  const illisible = { ...FUITES[0], date_detection: undefined };
  assert.equal(correspondance(OCTOBRE)(illisible), false);
  assert.equal(correspondance(FILTRES_VIDES)(illisible), true);
});

ok('filtrage : recherche (N° exact, référence, chiffres de la référence, adresse)', () => {
  assert.deepEqual(numeros({ texte: '2' }), [1, 2]);
  assert.deepEqual(numeros({ texte: 't-2026' }), [1]);
  assert.deepEqual(numeros({ texte: '00451' }), [1]);
  assert.deepEqual(numeros({ texte: '26 00451' }), [1]);
  assert.deepEqual(numeros({ texte: '2026 451' }), []);
  assert.deepEqual(numeros({ texte: '  ibn  ' }), [1]);
  assert.deepEqual(numeros({ texte: 'mohammed', statuts: ['reparee'] }), [2]);
  assert.deepEqual(numeros({ texte: 'introuvable' }), []);
});

ok('adresse rechargée ou partagée : même liste', () => {
  const filtres = { statuts: ['detectee', 'reparee'], zone: Z1, secteur: SA, ...OCTOBRE, alertes: true, alerte: 'alerte_refection_trottoir', texte: '' };
  const adresse = ecrireFiltres(filtres);
  assert.deepEqual(FUITES.filter(correspondance(lireFiltres(adresse))), FUITES.filter(correspondance(filtres)));
});

// ---------------------------------------------------------------------------
// Liens du tableau de bord : la liste ouverte compte exactement le chiffre affiché.
// ---------------------------------------------------------------------------
ok('tableau de bord : fuites détectées sur la période', () => {
  const lien = lienFuites(OCTOBRE);
  assert.equal(lien, '/fuites?du=2026-10-01&au=2026-10-31');
  assert.equal(viaLien(lien).length, activite(FUITES, OCTOBRE).detectees);
  assert.equal(viaLien(lien).length, detecteesSur(FUITES, OCTOBRE).length);
});

ok('tableau de bord : réfections à faire = statut « réparée »', () => {
  const lien = lienFuites({ statuts: ['reparee'] });
  assert.equal(lien, '/fuites?statut=reparee');
  assert.equal(viaLien(lien).length, refectionsAFaire(FUITES, new Date('2026-10-05T09:00:00Z')).valeur);
});

ok('tableau de bord : répartition par statut (période et marché), totaux', () => {
  const periode = repartitionStatuts(detecteesSur(FUITES, OCTOBRE));
  const tout = repartitionStatuts(FUITES);
  for (const k of ORDRE_STATUTS) {
    assert.equal(viaLien(lienFuites({ statuts: [k], ...OCTOBRE })).length, periode[k], `période ${k}`);
    assert.equal(viaLien(lienFuites({ statuts: [k] })).length, tout[k], `marché ${k}`);
  }
  assert.equal(lienFuites({ statuts: ['en_reparation'], ...OCTOBRE }), '/fuites?statut=en_reparation&du=2026-10-01&au=2026-10-31');
  assert.equal(viaLien(lienFuites({})).length, FUITES.length);
});

ok('tableau de bord : par secteur (détectées sur la période, alertes à ce jour) et totaux', () => {
  const lignes = parGroupe(FUITES, OCTOBRE, 'secteur');
  for (const l of lignes.filter((x) => x.cle)) {
    assert.equal(viaLien(lienFuites({ secteur: l.cle, ...OCTOBRE })).length, l.detectees, `détectées ${l.libelle}`);
    assert.equal(viaLien(lienFuites({ secteur: l.cle, alertes: true })).length, l.alertes, `alertes ${l.libelle}`);
  }
  assert.equal(lienFuites({ alertes: true, secteur: SB }), `/fuites?secteur=${SB}&alertes=1`);
  const somme = (cle) => lignes.reduce((s, l) => s + l[cle], 0);
  assert.equal(viaLien(lienFuites(OCTOBRE)).length, somme('detectees'));
  assert.equal(viaLien(lienFuites({ alertes: true })).length, somme('alertes'));
  assert.equal(viaLien(lienFuites({ alertes: true })).length, situation(FUITES).alertes);
});

ok('tableau de bord : fuites détectées par semaine (lundi → dimanche)', () => {
  const semaines = parSemaine(FUITES, '2026-11-01', 12);
  for (const s of semaines) {
    const lien = lienFuites({ du: s.lundi, au: s.dimanche });
    assert.equal(viaLien(lien).length, s.detectees, `semaine ${s.numero}`);
  }
  assert.equal(lienFuites({ du: '2026-09-28', au: '2026-10-04' }), '/fuites?du=2026-09-28&au=2026-10-04');
});

// ---------------------------------------------------------------------------
// Chantier v3, U1 et U2 : plusieurs statuts, type d'alerte, zone.
// ---------------------------------------------------------------------------
ok('plusieurs statuts : ordre du cycle de vie, sans doublon, virgule lisible, tous = aucun filtre', () => {
  assert.deepEqual(lireFiltres('statut=en_reparation,detectee,detectee,xx').statuts, ['detectee', 'en_reparation']);
  assert.deepEqual(lireFiltres('statut=reparee%2Cachevee').statuts, ['reparee', 'achevee']);
  assert.deepEqual(lireFiltres('statut=,,').statuts, []);
  assert.equal(ecrireFiltres({ statuts: ['en_reparation', 'detectee'] }), 'statut=detectee,en_reparation');
  assert.equal(lienFuites({ statuts: STATUTS_EN_ATTENTE }), '/fuites?statut=detectee,en_reparation');
  assert.equal(ecrireFiltres({ statuts: ORDRE_STATUTS }), '');
  assert.equal(filtresActifs({ statuts: [] }), false);
  assert.deepEqual(numeros({ statuts: ['detectee', 'en_reparation'] }), [3, 4, 8, 9]);
  assert.deepEqual(numeros({ statuts: ['reparee', 'sans_reparation'] }), [2, 5, 6, 7]);
});

ok('type d\'alerte : un seul à la fois, valeur inconnue ignorée, cumulable avec « alertes »', () => {
  for (const k of CLES_ALERTES) assert.equal(lireFiltres(`alerte=${k}`).alerte, k);
  assert.equal(lireFiltres('alerte=alerte_sans_photo').alerte, '', 'pas une alerte de la liste');
  assert.equal(lireFiltres('alerte=ALERTE_NON_REPAREE').alerte, '');
  assert.deepEqual(numeros({ alerte: 'alerte_non_reparee' }), [3]);
  assert.deepEqual(numeros({ alerte: 'refection_chaussee_hors_delai' }), [6]);
  assert.deepEqual(numeros({ alerte: 'alerte_communication_srm', alertes: true }), [4]);
  assert.equal(filtresActifs({ alerte: 'alerte_non_reparee' }), true);
});

ok('zone : identifiant contrôlé, filtre cumulable avec le secteur', () => {
  assert.equal(lireFiltres(`zone=${Z2.toUpperCase()}`).zone, Z2);
  assert.equal(lireFiltres('zone=z1').zone, '');
  assert.deepEqual(numeros({ zone: Z2 }), [5, 6]);
  assert.deepEqual(numeros({ zone: Z1, secteur: SB }), [2, 3]);
  assert.deepEqual(numeros({ zone: Z2, secteur: SA }), []);
  assert.deepEqual(numeros({ zone: Z1, statuts: ['reparee'] }), [2]);
});

ok('tableau de bord : « Non réparées > seuil » = alerte non réparée seulement', () => {
  const lien = lienFuites({ alerte: 'alerte_non_reparee' });
  assert.equal(lien, '/fuites?alerte=alerte_non_reparee');
  assert.equal(viaLien(lien).length, nonReparees(FUITES, 48, new Date('2026-10-05T09:00:00Z')).valeur);
  assert.ok(viaLien(lienFuites({ alertes: true })).length > viaLien(lien).length, 'l\'ancien lien comptait toutes les alertes');
});

ok('tableau de bord : « En attente » (détectées ou réparation en cours), total et par groupe', () => {
  assert.equal(viaLien(lienFuites({ statuts: STATUTS_EN_ATTENTE })).length, situation(FUITES).enAttente);
  for (const regroupement of ['secteur', 'zone']) {
    const lignes = parGroupe(FUITES, OCTOBRE, regroupement);
    for (const l of lignes.filter((x) => x.cle)) {
      const groupe = { [regroupement]: l.cle };
      assert.equal(viaLien(lienFuites({ ...groupe, statuts: STATUTS_EN_ATTENTE })).length, l.enAttente, `en attente ${l.libelle}`);
      assert.equal(viaLien(lienFuites({ ...groupe, alertes: true })).length, l.alertes, `alertes ${l.libelle}`);
      assert.equal(viaLien(lienFuites({ ...groupe, ...OCTOBRE })).length, l.detectees, `détectées ${l.libelle}`);
    }
    assert.equal(viaLien(lienFuites({ statuts: STATUTS_EN_ATTENTE })).length, lignes.reduce((t, l) => t + l.enAttente, 0));
  }
});

console.log(`\n${n} vérifications réussies.`);

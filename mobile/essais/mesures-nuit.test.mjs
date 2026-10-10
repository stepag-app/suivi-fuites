// Essai SANS pile des mesures de nuit de la tablette (D8) : règles et chargement de src/mesures-donnees.ts, envoi par la
// vraie file d'attente (src/file-attente.ts, src/photos.ts) au serveur simulé (mocks/serveur-simule.js : déclencheur de
// mesures_nuit réduit, compartiment « debits »). Depuis mobile/ :
//   node --import ./essais/substituts.mjs essais/mesures-nuit.test.mjs
import fs from 'node:fs';
import { abandonner, ajouterEnvoi, dependants, lireAttente, remplacerMesure, synchroniser } from '../src/file-attente.ts';
import {
  avecAttente, campagnesOuvertes, chargerMesures, controlerSaisie, creationEnAttente, estSienne, HEURES_NUIT, jourIso, minimumReleves,
  modeDe, nuitsProposees, pointsDe, saisieDe,
} from '../src/mesures-donnees.ts';
import { simulation as sim } from './mocks/supabase-simule.js';

let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };
const uuid = () => crypto.randomUUID();
const D = `${process.env.H}/docs/attente/`;
fs.mkdirSync(D, { recursive: true });
const photo = () => {
  const id = uuid();
  const f = `${D}${id}.jpg`;
  fs.writeFileSync(f, 'jpeg');
  return { id, fichier: `file://${f}`, largeur: 10, hauteur: 10, taille: 4, prise_le: new Date().toISOString(), type: 'autre' };
};
const fichiersLocaux = () => fs.readdirSync(D).length;

console.log('1. Campagnes ouvertes, nuits proposées, mode et points');
const C = (o) => ({ id: uuid(), type: 'avant', zone_id: null, libelle: null, date_debut: '2026-10-08', date_fin: '2026-10-10', mode_saisie: null, ...o });
const enCours = C({});
const finie = C({ date_debut: '2026-10-01', date_fin: '2026-10-07' });
const ancienne = C({ date_debut: '2026-09-01', date_fin: '2026-09-03' });
const future = C({ date_debut: '2026-10-12', date_fin: '2026-10-14' });
const ouvertes = campagnesOuvertes([ancienne, future, finie, enCours], '2026-10-10');
verifier(ouvertes.map((c) => c.id).join() === [enCours.id, finie.id].join(),
  'en cours et finie depuis 3 jours au plus, la plus récente d\'abord ; ni l\'ancienne ni la future');
verifier(nuitsProposees(enCours, '2026-10-09').join() === '2026-10-09,2026-10-08', 'nuits jusqu\'à aujourd\'hui, la plus récente d\'abord');
verifier(nuitsProposees(C({ date_debut: '2026-10-30', date_fin: '2026-11-02' }), '2026-11-05').join() === '2026-11-02,2026-11-01,2026-10-31,2026-10-30',
  'changement de mois');
verifier(modeDe(C({ mode_saisie: null }), 'releves') === 'releves' && modeDe(C({ mode_saisie: 'minimum' }), 'releves') === 'minimum'
  && modeDe(C({ mode_saisie: 'import' }), 'minimum') === 'minimum' && modeDe(C({}), undefined) === 'minimum',
'mode : campagne, sinon marché ; import saisi au minimum');
const Z1 = uuid(), Z2 = uuid();
const pts = [
  { id: 'b', zone_id: Z1, code: 'B', libelle: 'B', equipement: null, ordre: 2 },
  { id: 'a', zone_id: Z1, code: 'A', libelle: 'A', equipement: null, ordre: 1 },
  { id: 'c', zone_id: Z2, code: 'C', libelle: 'C', equipement: null, ordre: 0 },
];
verifier(pointsDe(pts, C({ zone_id: Z1 })).map((p) => p.id).join() === 'a,b' && pointsDe(pts, C({})).length === 3,
  'points de la zone de la campagne (dans l\'ordre), ou de toutes les zones');
verifier(HEURES_NUIT.length === 25 && HEURES_NUIT[0] === '00:00' && HEURES_NUIT[24] === '06:00', '25 relevés de 00:00 à 06:00');

console.log('2. Contrôle de la saisie');
let c = controlerSaisie({ mode: 'minimum', minimum: ' 12,5 ', releves: {}, observation: '  ' });
verifier(c.ligne?.minimum_m3h === 12.5 && c.ligne.releves === null && c.ligne.observation === null, 'minimum avec virgule ; observation vide = nulle', c);
verifier(controlerSaisie({ mode: 'minimum', minimum: '', releves: {}, observation: '' }).erreur === 'minimum', 'minimum absent');
verifier(controlerSaisie({ mode: 'minimum', minimum: '-1', releves: {}, observation: '' }).erreur === 'negatif', 'minimum négatif');
c = controlerSaisie({ mode: 'releves', minimum: '', releves: { '06:00': '9', '00:15': '11,5', '01:00': ' ' }, observation: 'ok' });
verifier(JSON.stringify(c.ligne?.releves) === '[{"h":"00:15","q":11.5},{"h":"06:00","q":9}]' && c.ligne.minimum_m3h === null,
  'relevés : heures vides ignorées, triés ; minimum laissé à la base', c);
verifier(controlerSaisie({ mode: 'releves', minimum: '', releves: {}, observation: '' }).erreur === 'releves', 'aucun relevé');
c = controlerSaisie({ mode: 'releves', minimum: '', releves: { '00:30': 'abc' }, observation: '' });
verifier(c.erreur === 'releve_invalide' && c.heure === '00:30', 'relevé illisible : heure signalée');
verifier(minimumReleves({ '00:00': '12', '00:15': '9,5', '00:30': 'x' }) === 9.5 && minimumReleves({}) === null, 'aperçu du minimum des relevés');
const s = saisieDe({ minimum_m3h: 8.25, releves: null, observation: 'o' }, 'releves');
verifier(s.mode === 'minimum' && s.minimum === '8,25' && s.observation === 'o', 'correction : formulaire repris de la mesure (son mode)');
verifier(saisieDe({ minimum_m3h: 3, releves: [{ h: '00:15', q: 3 }] }, 'minimum').releves['00:15'] === '3' && saisieDe(null, 'releves').mode === 'releves',
  'relevés repris ; nouvelle mesure au mode de la campagne');
verifier(estSienne({ auteur_terrain_id: 'x', saisi_par: 'chef' }, 'chef') && !estSienne({ auteur_terrain_id: 'x', saisi_par: 'y' }, 'chef'),
  'portée « siennes » : auteur ou compte de saisie');

console.log('3. Saisie hors ligne avec photo de l\'afficheur, puis envoi');
sim.remettre();
sim.utilisateur = 'agent';
sim.droits = { modifier: 'siennes', supprimer: 'non' };
await sim.connecter();
const M = 'marche-essai';
const camp = C({ zone_id: Z1, date_debut: '2026-10-08', date_fin: '2026-10-10' });
sim.tables.campagnes_debit.push({ ...camp, marche_id: M, supprime_le: null });
const mesure = (o) => ({
  type: 'mesure', marche_id: M, campagne_id: camp.id, correction: false, libelle: 'A · 09/10/2026', photos: [], ...o,
});
const M1 = uuid();
const ph = photo();
await ajouterEnvoi(mesure({ id: M1, mesure_id: M1, photos: [ph], ligne: { point_id: 'a', nuit: '2026-10-09', minimum_m3h: 12.5, releves: null, observation: null } }));
sim.reseau = false;
let reste = await synchroniser();
verifier(reste === 1 && !(await lireAttente())[0].erreur && fichiersLocaux() === 1, 'sans réseau : mesure et photo gardées, aucune erreur');
sim.reseau = true;
sim.coupureDans = 1; // la photo passe, la coupure tombe sur la ligne
reste = await synchroniser();
verifier(reste === 1 && sim.fichiers.has(`debits/${M}/${camp.id}/${ph.id}.jpg`) && !sim.tables.mesures_nuit.length,
  'coupure après la photo : photo dans debits/<marché>/<campagne>/, ligne pas encore envoyée');
sim.reseau = true;
sim.coupureDans = null;
reste = await synchroniser();
const l1 = sim.tables.mesures_nuit.find((x) => x.id === M1);
verifier(reste === 0 && l1 && l1.piece_jointe === `${M}/${camp.id}/${ph.id}.jpg` && l1.source_saisie === 'tablette' && l1.marche_id === M,
  'reprise : photo déjà reçue acceptée, ligne créée avec la pièce jointe, source tablette', l1);
verifier(l1?.validee_le === null && l1.minimum_m3h === 12.5, 'saisie du terrain : à valider');
verifier(fichiersLocaux() === 0, 'photo effacée de la tablette après la ligne');

console.log('4. Même mesure renvoyée (réponse perdue) : rien en double, pas d\'erreur');
await ajouterEnvoi(mesure({ id: M1, mesure_id: M1, ligne: { point_id: 'a', nuit: '2026-10-09', minimum_m3h: 12.5, releves: null } }));
reste = await synchroniser();
verifier(reste === 0 && sim.tables.mesures_nuit.length === 1, 'clé primaire déjà prise par la même mesure : considérée envoyée');

console.log('5. Autre mesure au même point et à la même nuit : refus clair, la suite de cette mesure attend');
const M2 = uuid(), M3 = uuid();
await ajouterEnvoi(mesure({ id: M2, mesure_id: M2, ligne: { point_id: 'a', nuit: '2026-10-09', minimum_m3h: 7, releves: null } }));
await ajouterEnvoi(mesure({ id: uuid(), mesure_id: M2, correction: true, ligne: { minimum_m3h: 8, releves: null } }));
await ajouterEnvoi(mesure({ id: M3, mesure_id: M3, ligne: { point_id: 'b', nuit: '2026-10-09', minimum_m3h: 4, releves: null } }));
reste = await synchroniser();
let l = await lireAttente();
verifier(reste === 2 && /existe déjà pour ce point et cette nuit/.test(l[0].erreur ?? ''), `doublon : ${l[0].erreur}`);
verifier(/saisie précédente de cette mesure/.test(l[1].erreur ?? ''), 'sa correction attend derrière elle');
verifier(sim.tables.mesures_nuit.some((x) => x.id === M3), 'une autre mesure part quand même');
verifier((await dependants(M2)).length === 1, 'abandonner la création emporterait sa correction');
await abandonner(M2);
verifier((await lireAttente()).length === 0, 'création abandonnée : sa correction tombe avec elle');

console.log('6. Mesure corrigée sur la tablette avant l\'envoi : une seule création, dernières valeurs');
const M4 = uuid();
await ajouterEnvoi(mesure({ id: M4, mesure_id: M4, photos: [photo()], ligne: { point_id: 'a', nuit: '2026-10-08', minimum_m3h: 30, releves: null } }));
const nouvelle = photo();
const releves = [{ h: '00:15', q: 6.5 }, { h: '03:00', q: 5 }];
let fait = await remplacerMesure(M4, { minimum_m3h: null, releves, observation: 'relu' }, [nouvelle], 'A · 08/10/2026');
verifier(fait && fichiersLocaux() === 1, 'remplacée sur place ; ancienne photo effacée');
const journalAvant = sim.journal.length;
reste = await synchroniser();
const l4 = sim.tables.mesures_nuit.find((x) => x.id === M4);
verifier(reste === 0 && l4?.minimum_m3h === 5 && l4.observation === 'relu' && l4.piece_jointe.endsWith(`${nouvelle.id}.jpg`),
  'relevés envoyés, minimum calculé par la base, nouvelle photo', l4);
verifier(sim.journal.slice(journalAvant).filter((x) => x === 'mesures_nuit:update').length === 0, 'aucune correction envoyée (pas de droit « modifier » nécessaire)');

console.log('7. Remplacement pendant l\'envoi de la même mesure : refusé (l\'écran enverra une correction)');
const M5 = uuid();
await ajouterEnvoi(mesure({ id: M5, mesure_id: M5, ligne: { point_id: 'b', nuit: '2026-10-08', minimum_m3h: 2, releves: null } }));
sim.lenteur = 50;
const envoi = synchroniser();
await new Promise((ok) => setTimeout(ok, 20));
fait = await remplacerMesure(M5, { minimum_m3h: 3, releves: null, observation: null }, [], 'B');
reste = await envoi;
sim.lenteur = 0;
verifier(!fait && reste === 0 && sim.tables.mesures_nuit.find((x) => x.id === M5)?.minimum_m3h === 2,
  'refusé pendant l\'envoi ; la mesure arrive telle qu\'elle était partie');
verifier(!(await remplacerMesure(M5, {}, [], 'B')), 'mesure déjà partie : rien à remplacer');

console.log('8. Correction d\'une mesure envoyée, puis mesure validée');
await ajouterEnvoi(mesure({ id: uuid(), mesure_id: M5, correction: true, ligne: { minimum_m3h: null, releves: [{ h: '01:00', q: 1.5 }], observation: 'corrigée' } }));
reste = await synchroniser();
const l5 = sim.tables.mesures_nuit.find((x) => x.id === M5);
verifier(reste === 0 && l5.minimum_m3h === 1.5 && l5.observation === 'corrigée', 'correction : relevés à la place du minimum');
l5.validee_le = new Date().toISOString();
await ajouterEnvoi(mesure({ id: uuid(), mesure_id: M5, correction: true, ligne: { minimum_m3h: 9, releves: null } }));
reste = await synchroniser();
l = await lireAttente();
verifier(reste === 1 && /déjà validée par le responsable/.test(l[0].erreur ?? ''), `validée : ${l[0].erreur}`);
await abandonner(l[0].id);
sim.droits = { modifier: 'non', supprimer: 'non' };
await ajouterEnvoi(mesure({ id: uuid(), mesure_id: M3, correction: true, ligne: { minimum_m3h: 9, releves: null } }));
reste = await synchroniser();
l = await lireAttente();
verifier(reste === 1 && /Droit insuffisant/.test(l[0].erreur ?? ''), 'sans droit « modifier » : aucune ligne touchée, refus clair');
await abandonner(l[0].id);
sim.droits = { modifier: 'siennes', supprimer: 'non' };

console.log('9. Refus du serveur traduits');
const refus = async (r, ligne, motif, msg) => {
  const id = uuid();
  sim.refusMesure = r;
  await ajouterEnvoi(mesure({ id, mesure_id: id, ligne: { point_id: 'b', nuit: '2026-10-10', releves: null, ...ligne } }));
  await synchroniser();
  const e = (await lireAttente()).find((x) => x.id === id);
  verifier(motif.test(e?.erreur ?? ''), `${msg} : ${e?.erreur}`);
  await abandonner(id);
};
await refus({ code: '23514', message: 'Relevés de nuit : de 00:00 à 06:00 seulement' }, { minimum_m3h: 1 }, /Relevés refusés/, 'relevé hors 0 h – 6 h');
await refus({ code: '23514', message: 'Point de mesure désactivé' }, { minimum_m3h: 1 }, /Point de mesure désactivé/, 'point désactivé');
await refus(null, { minimum_m3h: null }, /débit minimum de la nuit ou au moins un relevé/, 'ni minimum ni relevés');
const hors = uuid();
await ajouterEnvoi(mesure({ id: hors, mesure_id: hors, ligne: { point_id: 'b', nuit: '2026-10-11', minimum_m3h: 1, releves: null } }));
await synchroniser();
verifier(/ne fait plus partie de la campagne/.test((await lireAttente())[0]?.erreur ?? ''), 'nuit hors de la campagne (dates changées)');
await abandonner(hors);

console.log('10. Affichage : serveur et file d\'attente réunis');
const serveur = [{ id: M5, campagne_id: camp.id, point_id: 'b', nuit: '2026-10-08', minimum_m3h: 1.5, releves: null, observation: null,
  piece_jointe: null, auteur_terrain_id: 'agent', saisi_par: 'agent', validee_le: null }];
const M6 = uuid();
const attente = [
  mesure({ id: uuid(), mesure_id: M5, correction: true, ligne: { minimum_m3h: 2.5, releves: null, observation: 'x' } }),
  mesure({ id: M6, mesure_id: M6, photos: [{ fichier: 'file://p.jpg' }], ligne: { point_id: 'a', nuit: '2026-10-10', releves: [{ h: '00:00', q: 4 }, { h: '00:15', q: 3 }] } }),
  mesure({ id: uuid(), mesure_id: uuid(), correction: true, ligne: { minimum_m3h: 1 } }),
  { ...mesure({ id: uuid(), mesure_id: uuid(), ligne: { point_id: 'a', nuit: '2026-10-10', minimum_m3h: 1 } }), marche_id: 'autre' },
];
const vues = avecAttente(serveur, attente, 'agent', M);
verifier(vues.length === 2, 'correction d\'une mesure inconnue et autre marché ignorées', vues);
verifier(vues[0].minimum_m3h === 2.5 && vues[0].observation === 'x' && vues[0].attente, 'correction en attente affichée sur la mesure');
verifier(vues[1].minimum_m3h === 3 && vues[1].auteur_terrain_id === 'agent' && vues[1].piece_jointe === 'file://p.jpg' && vues[1].attente,
  'création en attente : minimum des relevés, auteur, photo locale');
verifier(creationEnAttente(attente, M6)?.id === M6 && !creationEnAttente(attente, M5), 'création encore sur la tablette retrouvée');

console.log('11. Chargement : copie de la tablette, puis serveur ; hors ligne, la copie reste');
sim.tables.points_mesure.push({ id: 'a', marche_id: M, zone_id: Z1, code: 'A', libelle: 'A', equipement: null, ordre: 1, actif: true });
sim.tables.zones.push({ id: Z1, marche_id: M, numero: 1, libelle: 'Zone 1' });
// Le chargement lit le jour de l'horloge : campagne en cours autour d'aujourd'hui, et une campagne ancienne.
const jourRelatif = (n) => jourIso(new Date(Date.now() + n * 86400000));
const actuelle = C({ date_debut: jourRelatif(-1), date_fin: jourRelatif(1) });
sim.tables.campagnes_debit = [
  { ...actuelle, marche_id: M, supprime_le: null },
  { ...C({ date_debut: '2000-01-01', date_fin: '2000-01-03' }), marche_id: M, supprime_le: null },
  { ...C({}), marche_id: M, supprime_le: new Date().toISOString() },
];
let recu = [];
let repondu = await chargerMesures(M, false, (d) => recu.push(d));
const dernier = recu.at(-1);
verifier(repondu && recu.length === 2 && recu[0].campagnes.length === 0, 'première ouverture : copie vide, puis le serveur');
verifier(dernier.campagnes.map((x) => x.id).join() === actuelle.id, 'campagne en cours seulement : ni l\'ancienne ni la supprimée', dernier.campagnes);
verifier(dernier.points.length === 1 && dernier.zones[0]?.numero === 1, 'points et zones du marché');
sim.reseau = false;
recu = [];
repondu = await chargerMesures(M, false, (d) => recu.push(d));
verifier(!repondu && recu.length === 1 && recu[0].points.length === 1, 'hors ligne : la copie de la tablette suffit');
sim.reseau = true;
recu = [];
repondu = await chargerMesures(M, true, (d) => recu.push(d));
verifier(!repondu && recu.length === 1, 'jeton à renouveler : copie seulement, aucune requête');

console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
process.exit(ko ? 1 : 0);

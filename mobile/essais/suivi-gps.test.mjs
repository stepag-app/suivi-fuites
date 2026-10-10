// Essai SANS pile du suivi GPS (S11, X6 ; compromis du 2026-10-10) : règles du filtre (15 m / 30 s en mouvement), heures de
// travail et pauses, file d'attente hors ligne, envoi par lots sans perte ni doublon, tâche de fond (src/suivi-gps.ts) avec
// expo-location, expo-notifications et la base simulés, sur une horloge simulée.
//   node --import ./essais/substituts.mjs essais/suivi-gps.test.mjs
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ajouterPoint, borner, dansHeures, distanceM, envoyerFile, FILE_MAX, FILE_VIDE, fileAvecPause, finPrevuePause, LOT_MAX,
  nbPoints, pauseRestanteMs, pendantUnePause, pointRetenu, prochainDebut, REGLAGES_DEFAUT, reglagesSuivi, retirerAcquits,
  retirerPauses,
} from '../src/suivi-gps-regles.ts';
import { gps, notifs } from './mocks/expo.js';
import { simulation as sim, supabase } from './mocks/supabase-simule.js';
import {
  assurerSuivi, envoyerPoints, etatSuivi, mettreEnPause, reprendreSuivi, TACHE_GPS, terminerSuivi,
} from '../src/suivi-gps.ts';

let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };

const T0 = Math.floor(Date.now() / 1000) - 3600;
// 1 degré de latitude = 111,2 km : 0,0001° = 11,1 m
const mesure = (dt, dLat, precision = 5) => ({ lon: -1.91, lat: 34.68 + dLat, precision, ms: (T0 + dt) * 1000 });

console.log('1. Filtre d\'un point (pointRetenu)');
verifier(Math.abs(distanceM([0, -1.91, 34.68], [0, -1.91, 34.6801]) - 11.12) < 0.1, 'distance : 0,0001° de latitude = 11,1 m');
const p0 = pointRetenu(null, mesure(0, 0));
verifier(!!p0 && p0[0] === T0 && p0[1] === -1.91, 'premier point toujours gardé');
verifier(pointRetenu(p0, mesure(10, 0.00005)) === null, '5,5 m en 10 s : ignoré');
verifier(pointRetenu(p0, mesure(10, 0.00015)) !== null, '16,7 m en 10 s : gardé (15 m)');
verifier(pointRetenu(p0, mesure(40, 0.0001)) !== null, '11 m en 40 s : gardé (30 s en mouvement)');
verifier(pointRetenu(p0, mesure(40, 0.00003)) === null, '3 m en 40 s : à l\'arrêt (dérive du GPS), ignoré');
verifier(pointRetenu(p0, mesure(40, 0.00008, 25)) === null, '9 m en 40 s mais précision 25 m : dérive probable, ignoré');
verifier(pointRetenu(p0, mesure(20, 0.0001)) === null, '11 m en 20 s : ni 15 m ni 30 s, ignoré');
verifier(pointRetenu(p0, mesure(10, 0.0003, 80)) === null, 'précision 80 m : mesure refusée');
verifier(pointRetenu(p0, mesure(-5, 0.001)) === null, 'mesure plus ancienne que le dernier point : ignorée');
verifier(pointRetenu(p0, mesure(1, 0.01)) === null, 'saut de 1,1 km en 1 s (1 100 m/s) : ignoré');
verifier(pointRetenu(p0, { lon: NaN, lat: 34.68, precision: 5, ms: (T0 + 50) * 1000 }) === null, 'coordonnée invalide : ignorée');
verifier(pointRetenu(p0, mesure(60, 0.0001, null)) !== null, 'précision inconnue : acceptée');

console.log('2. File d\'attente (ajouterPoint, borner)');
let f = FILE_VIDE;
for (let i = 0; i < 3; i++) f = ajouterPoint(f, 'u1', 'm1', [T0 + i, -1.91, 34.68 + i * 0.0002]);
verifier(f.lots.length === 1 && nbPoints(f) === 3 && f.dernier[0] === T0 + 2, 'trois points dans un lot, dernier point retenu');
f = ajouterPoint(f, 'u1', 'm2', [T0 + 3, -1.91, 34.69]);
f = ajouterPoint(f, 'u2', 'm2', [T0 + 4, -1.91, 34.69]);
verifier(f.lots.map((l) => `${l.u}/${l.m}/${l.pts.length}`).join() === 'u1/m1/3,u1/m2/1,u2/m2/1', 'un lot par agent et par marché');
const vieux = borner([{ u: 'u1', m: 'm1', pts: [[T0 - 8 * 86400, 0, 0], [T0, 0, 0]] }], T0 + 10);
verifier(nbPoints({ lots: vieux }) === 1, 'points de plus de 7 jours abandonnés (la base les refuserait)');
const gros = [{ u: 'u1', m: 'm1', pts: Array.from({ length: FILE_MAX + 50 }, (_, i) => [T0 + i, 0, 0]) }];
const borne = borner(gros, T0 + FILE_MAX + 100);
verifier(nbPoints({ lots: borne }) === FILE_MAX && borne[0].pts[0][0] === T0 + 50, 'file bornée : les plus anciens points partent');

console.log('3. Envoi par paquets (envoyerFile, retirerAcquits)');
const gen = (u, m, n, depart = 0) => ({ u, m, pts: Array.from({ length: n }, (_, i) => [T0 + depart + i, -1.91, 34.68]) });
let file = { dernier: null, lots: [gen('u1', 'm1', LOT_MAX * 2 + 7), gen('u2', 'm1', 5)] };
const paquets = [];
let r = await envoyerFile(file, 'u1', async (m, pts) => { paquets.push(pts.length); return 'ok'; });
verifier(paquets.join() === `${LOT_MAX},${LOT_MAX},7` && r.envoyes === LOT_MAX * 2 + 7 && !r.interrompu, 'paquets de 500 points au plus, tout est envoyé');
file = retirerAcquits(file, 'u1', r.acquits);
verifier(file.lots.length === 1 && file.lots[0].u === 'u2' && nbPoints(file) === 5, 'les points d\'un autre agent restent sur la tablette');
file = { dernier: null, lots: [gen('u1', 'm1', 1200)] };
let appels = 0;
r = await envoyerFile(file, 'u1', async () => (++appels === 2 ? 'reseau' : 'ok'));
verifier(r.interrompu && r.envoyes === LOT_MAX && appels === 2, 'coupure au deuxième paquet : arrêt de l\'envoi');
file = retirerAcquits(file, 'u1', r.acquits);
verifier(nbPoints(file) === 700, 'seul le premier paquet est retiré, 700 points restent');
// points ajoutés pendant l'envoi : jamais perdus
let pendant = { dernier: null, lots: [gen('u1', 'm1', 3)] };
const instantane = pendant;
pendant = ajouterPoint(pendant, 'u1', 'm1', [T0 + 100, -1.91, 34.69]);
r = await envoyerFile(instantane, 'u1', async () => 'ok');
pendant = retirerAcquits(pendant, 'u1', r.acquits);
verifier(nbPoints(pendant) === 1 && pendant.lots[0].pts[0][0] === T0 + 100, 'le point ajouté pendant l\'envoi reste dans la file');
r = await envoyerFile({ dernier: null, lots: [gen('u1', 'm9', 4)] }, 'u1', async () => 'refus');
verifier(r.envoyes === 0 && r.acquits.length === 1 && !r.interrompu, 'refus définitif de la base : paquet abandonné, pas compté comme envoyé');

console.log('4. Heures de travail et pauses (règles)');
// Heure de la tablette : mardi 13 octobre 2026 (jour de travail), samedi 17, dimanche 18.
const le = (jour, h, min = 0, s = 0) => new Date(2026, 9, jour, h, min, s).getTime();
const R = REGLAGES_DEFAUT;
verifier(R.debut === 480 && R.fin === 1080 && R.jours.join() === '1,2,3,4,5,6' && R.pauseMin === 60 && R.pauseJourMin === 90,
  'par défaut : 08:00 à 18:00, du lundi au samedi, pause de 60 min, 90 min par jour');
const lu = reglagesSuivi({ suivi_gps_debut: '07:30:00', suivi_gps_fin: '16:00:00', suivi_gps_jours: [5, 1, 1], suivi_gps_pause_min: 45, suivi_gps_pause_jour_min: 60 });
verifier(lu.debut === 450 && lu.fin === 960 && lu.jours.join() === '1,5' && lu.pauseMin === 45 && lu.pauseJourMin === 60, 'réglages du marché lus (heures, jours triés sans doublon)');
verifier(reglagesSuivi({ suivi_gps_debut: '18:00:00', suivi_gps_fin: '08:00:00' }).debut === 480 && reglagesSuivi(null).fin === 1080,
  'fin avant le début, ou marché sans réglages (base pas à jour) : valeurs par défaut');
verifier(reglagesSuivi({ suivi_gps_debut: '00:00:00', suivi_gps_fin: '24:00:00' }).fin === 1440, 'fin à 24:00 : toute la journée');
verifier(dansHeures(R, le(13, 8)) && dansHeures(R, le(13, 17, 59)), 'mardi 08:00 et 17:59 : dans les heures');
verifier(!dansHeures(R, le(13, 7, 59)) && !dansHeures(R, le(13, 18)), 'mardi 07:59 et 18:00 : hors des heures');
verifier(!dansHeures(R, le(18, 10)), 'dimanche : hors des jours de travail');
verifier(prochainDebut(R, le(17, 18, 30)) === le(19, 8), 'samedi soir : prochain début lundi 08:00');
verifier(prochainDebut(R, le(13, 7)) === le(13, 8), 'mardi 07:00 : début le jour même');
const pauses = [{ debut: le(13, 12), finPrevue: le(13, 13), fin: le(13, 12, 25), motif: 'fuite' }];
verifier(finPrevuePause(R, [], le(13, 10)) === le(13, 11), 'première pause : reprise 60 min plus tard');
verifier(pauseRestanteMs(R, pauses, le(13, 14)) === 65 * 60000 && finPrevuePause(R, pauses, le(13, 14)) === le(13, 15),
  'après 25 min de pause : 65 min restent, la suivante reste bornée à 60');
const prises = [...pauses, { debut: le(13, 14), finPrevue: le(13, 15), fin: le(13, 15), motif: 'automatique' }];
verifier(finPrevuePause(R, prises, le(13, 16)) === le(13, 16, 5), 'après 85 min : il ne reste que 5 min');
verifier(pauseRestanteMs(R, prises, le(14, 10)) === 90 * 60000, 'le lendemain : 90 min de nouveau');
verifier(pendantUnePause(pauses, le(13, 12, 10)) && !pendantUnePause(pauses, le(13, 12, 30)), 'une mesure pendant la pause, pas après sa fin réelle');
let fp = fileAvecPause(FILE_VIDE, { u: 'u1', m: 'm1', debut: 1, fin: null, motif: null });
fp = fileAvecPause(fp, { u: 'u1', m: 'm1', debut: 1, fin: 5, motif: 'agent' });
verifier(fp.pauses.length === 1 && fp.pauses[0].fin === 5, 'file des pauses : la fin remplace le début déjà en attente');
verifier(retirerPauses(fp, [{ u: 'u1', m: 'm1', debut: 1, fin: null, motif: null }]).pauses.length === 1,
  'pause changée pendant l\'envoi (fin arrivée) : gardée pour le prochain envoi');
verifier(ajouterPoint(fp, 'u1', 'm1', [T0, 0, 0]).pauses.length === 1, 'un point ajouté ne fait pas perdre les pauses en attente');

console.log('5. Tâche de fond (src/suivi-gps.ts), sur une horloge simulée');
let horloge = le(13, 10);
Date.now = () => horloge;
sim.remettre();
sim.utilisateur = 'agent-gps';
await sim.connecter(undefined, 10 * 86400);
const uid = (await supabase.auth.getSession()).data.session.user.id;
const recu = [];
const reponses = {};
let reglagesServeur = { suivi_gps_debut: '08:00:00', suivi_gps_fin: '18:00:00', suivi_gps_jours: [1, 2, 3, 4, 5, 6], suivi_gps_pause_min: 60, suivi_gps_pause_jour_min: 90 };
supabase.rpc = async (nom, args) => {
  recu.push({ nom, ...args });
  if (nom === 'signaler_suivi_gps') return reponses.signal ?? { data: reglagesServeur, error: null };
  return reponses[nom] ?? { error: null };
};
const de = (nom) => recu.filter((x) => x.nom === nom);
const dernier = (nom) => de(nom).at(-1);
const tache = gps.taches.get(TACHE_GPS);
verifier(typeof tache === 'function', 'la tâche de fond est définie à l\'import du module');
const attendre = () => new Promise((fin) => setTimeout(fin, 60));
const loc = (ms, dLat, precision = 5) => ({ coords: { longitude: -1.91, latitude: 34.68 + dLat, accuracy: precision }, timestamp: ms });
const livrer = async (...l) => { await tache({ data: { locations: l }, error: null }); await attendre(); };

await livrer(loc(horloge, 0));
verifier((await etatSuivi()).enAttente === 0, 'sans suivi démarré (aucun contexte), la position n\'est pas gardée');

gps.premierPlan = false; gps.arrierePlan = false;
verifier(await assurerSuivi(uid, 'm1') === 'autorisation' && !gps.demarree, 'autorisations refusées : le suivi ne démarre pas');
verifier(dernier('signaler_suivi_gps')?.p_etat === 'autorisation', 'la base apprend que l\'autorisation manque');
gps.premierPlan = true; gps.arrierePlan = false;
verifier(await assurerSuivi(uid, 'm1') === 'autorisation' && !gps.demarree, 'position « seulement pendant l\'utilisation » : pas de suivi en arrière-plan');
gps.arrierePlan = true;
await AsyncStorage.setItem('suivi-fuites:gps-actif', 'non');
verifier(await assurerSuivi(uid, 'm1') === 'actif' && gps.demarree, 'heures de travail, autorisations : la tâche démarre (même « désactivée » avant le compromis)');
verifier(await AsyncStorage.getItem('suivi-fuites:gps-actif') === null, 'l\'ancien choix « Désactiver » est effacé');
verifier(gps.options.accuracy === 4 && gps.options.timeInterval === 10000 && gps.options.distanceInterval === 0 && gps.options.deferredUpdatesInterval === 60000,
  'GPS précis : une mesure toutes les 10 s, même immobile, livrées par minute écran éteint');
verifier(/08:00-18:00/.test(gps.options.foregroundService?.notificationTitle ?? '') && !/actif/.test(gps.options.foregroundService.notificationTitle)
  && /SRM/.test(gps.options.foregroundService.notificationBody), 'notification : heures de travail et motif (preuve pour la SRM)', gps.options.foregroundService);
const signal = dernier('signaler_suivi_gps');
verifier(signal?.p_etat === 'actif' && signal.p_marche === 'm1' && signal.p_decalage_min === -new Date(horloge).getTimezoneOffset(),
  'état « actif » signalé, avec le décalage UTC de l\'heure de la tablette');

// Premier lot reçu : l'envoi part aussitôt (rien n'a encore été tenté), la coupure du réseau le fait échouer.
sim.reseau = false;
reponses.ajouter_points_trace = { error: { code: '', message: 'TypeError: Network request failed' } };
const t10 = horloge;
await livrer(loc(t10, 0), loc(t10 + 10000, 0.00003), loc(t10 + 20000, 0.00018), loc(t10 + 30000, 0.00019));
let e = await etatSuivi();
verifier(e.enAttente === 2 && e.dernierePosition != null, 'quatre mesures, deux points gardés (le premier et celui à 20 m)', e.enAttente);
verifier(de('ajouter_points_trace').length === 1 && de('ajouter_points_trace')[0].p_points.length === 2, 'premier envoi tenté aussitôt, refusé par la coupure : les deux points restent');
const signaux = de('signaler_suivi_gps').length;
verifier(de('signaler_suivi_gps').filter((x) => x.p_etat === 'autorisation').length === 1, 'même état deux fois en moins de 10 min : dit une seule fois à la base');
horloge = t10 + 60000;
await livrer(loc(horloge, 0.0004));
verifier(de('ajouter_points_trace').length === 1 && (await etatSuivi()).enAttente === 3, 'un seul essai toutes les 2 minutes en arrière-plan (le point reste en file)');
let n = await envoyerPoints(true);
verifier(n === 0 && de('ajouter_points_trace').length === 2 && (await etatSuivi()).enAttente === 3, 'envoi forcé pendant la coupure : les trois points restent sur la tablette');
sim.reseau = true;
delete reponses.ajouter_points_trace;
n = await envoyerPoints(true);
const lot = dernier('ajouter_points_trace');
verifier(n === 3 && (await etatSuivi()).enAttente === 0 && lot.p_marche === 'm1' && lot.p_points.length === 3 && lot.p_points[0].length === 3,
  'réseau revenu : un lot de 3 points [t, lon, lat] envoyé, file vide');
verifier((await etatSuivi()).dernierEnvoi != null, 'dernier envoi noté');
horloge = t10 + 11 * 60000;
await livrer(loc(horloge, 0.0004));
verifier(dernier('signaler_suivi_gps').p_etat === 'actif' && de('signaler_suivi_gps').length === signaux + 1,
  'immobile : l\'état est redit au bout de 10 min (signe de vie du suivi)', de('signaler_suivi_gps').length - signaux);

console.log('6. Pause, reprise immédiate et automatique');
horloge = le(13, 10, 30);
let p = await mettreEnPause();
verifier(p.ok && p.finPrevue === le(13, 11, 30), 'pause : reprise prévue 60 min plus tard');
verifier(gps.options.accuracy === 1 && gps.options.timeInterval === 60000, 'GPS au repos pendant la pause (un réveil par minute)');
verifier(/11:30/.test(gps.options.foregroundService?.notificationTitle ?? '') && /Aucune position/.test(gps.options.foregroundService.notificationBody),
  'notification : « Pause jusqu\'à 11:30 », aucune position enregistrée');
await attendre();
verifier(dernier('signaler_suivi_gps').p_etat === 'pause', 'état « pause » signalé');
const debutPause = dernier('enregistrer_pause_gps');
verifier(debutPause && debutPause.p_debut === new Date(le(13, 10, 30)).toISOString() && debutPause.p_fin === null, 'début de la pause envoyé (sans lieu)');
horloge = le(13, 10, 40);
await livrer(loc(le(13, 10, 39), 0.002), loc(horloge, 0.003));
verifier((await etatSuivi()).enAttente === 0, 'positions reçues pendant la pause : jetées, rien gardé');
e = await etatSuivi();
verifier(e.mode === 'pause' && e.pause?.finPrevue === le(13, 11, 30), 'écran : en pause jusqu\'à 11:30');
horloge = le(13, 10, 50);
verifier(await reprendreSuivi('fuite'), 'fuite signalée : la pause prend fin');
await attendre();
const finPause = dernier('enregistrer_pause_gps');
verifier(finPause.p_fin === new Date(le(13, 10, 50)).toISOString() && finPause.p_motif === 'fuite', 'fin de la pause envoyée (10:50, fuite)');
verifier(gps.options.accuracy === 4 && /08:00-18:00/.test(gps.options.foregroundService?.notificationTitle ?? ''), 'GPS précis et notification du suivi rétablis');
verifier(!(await reprendreSuivi('balayage')), 'sans pause en cours : rien à reprendre');
await livrer(loc(le(13, 10, 51), 0.004));
verifier((await etatSuivi()).enAttente === 1, 'après la pause, les points comptent de nouveau');

// Deuxième pause (20 min déjà prises) : reprise automatique, appli fermée.
horloge = le(13, 11);
p = await mettreEnPause();
verifier(p.ok && p.finPrevue === le(13, 12), 'deuxième pause : 60 min (70 restent)');
await attendre();
horloge = le(13, 12, 1);
await livrer(loc(le(13, 11, 59), 0.005), loc(le(13, 12, 0, 30), 0.006));
verifier(!gps.options.foregroundService && gps.options.accuracy === 4,
  'fin prévue passée, appli fermée : GPS précis de nouveau, sans toucher à la notification (Android ne le permet pas)');
const auto = dernier('enregistrer_pause_gps');
verifier(auto.p_fin === new Date(le(13, 12)).toISOString() && auto.p_motif === 'automatique', 'pause close à 12:00 (automatique)');
await envoyerPoints(true);
const envoyes = de('ajouter_points_trace').flatMap((x) => x.p_points.map((pt) => pt[0] * 1000));
verifier(!envoyes.some((t) => t >= le(13, 11) && t < le(13, 12)) && envoyes.includes(le(13, 12, 0, 30)) && (await etatSuivi()).enAttente === 0,
  'aucun point pris pendant la pause, celui d\'après envoyé');
verifier(await assurerSuivi(uid, 'm1') === 'actif' && /08:00-18:00/.test(gps.options.foregroundService?.notificationTitle ?? ''),
  'appli rouverte : la notification du suivi revient');
// Ordre d'envoi : une pause en attente passe avant les points.
horloge = le(13, 12, 30);
p = await mettreEnPause();
verifier(p.ok && p.finPrevue === le(13, 12, 40), 'troisième pause : il ne reste que 10 min');
reponses.enregistrer_pause_gps = { error: { code: '', message: 'TypeError: Network request failed' } };
horloge = le(13, 12, 41);
await livrer(loc(le(13, 12, 41), 0.007));
const avantEnvoi = de('ajouter_points_trace').length;
n = await envoyerPoints(true);
verifier(n === 0 && de('ajouter_points_trace').length === avantEnvoi, 'fin de pause pas encore reçue par la base : les points attendent derrière elle');
delete reponses.enregistrer_pause_gps;
const avantReprise = recu.length;
n = await envoyerPoints(true);
const ordre = recu.slice(avantReprise).map((x) => x.nom).filter((x) => x !== 'signaler_suivi_gps');
verifier(n === 1 && ordre.join() === 'enregistrer_pause_gps,ajouter_points_trace' && dernier('enregistrer_pause_gps').p_fin === new Date(le(13, 12, 40)).toISOString(),
  'réseau revenu : la pause, puis les points', ordre);
p = await mettreEnPause();
verifier(!p.ok && p.raison === 'epuisee', '90 min prises : plus de pause aujourd\'hui');
verifier((await etatSuivi()).pauseRestanteMs === 0, 'écran : 0 min de pause restante');

console.log('7. Fin des heures, rappel du matin, jour non travaillé, réglages de la base');
horloge = le(13, 18, 0, 30);
await livrer(loc(le(13, 18, 0, 20), 0.008));
verifier(!gps.demarree, '18:00 : la tâche s\'arrête d\'elle-même (plus de notification)');
verifier((await etatSuivi()).enAttente === 0 || (await etatSuivi()).enAttente === 0, 'aucun point gardé après 18:00');
verifier(dernier('signaler_suivi_gps').p_etat === 'hors_heures', 'état « hors heures » signalé');
const rappel = notifs.planifiees.get('suivi-gps-reprise');
verifier(rappel && rappel.trigger.date === le(14, 8) && rappel.trigger.channelId === 'suivi-gps', 'rappel planifié mercredi 08:00', rappel?.trigger);
horloge = le(13, 19);
verifier(await assurerSuivi(uid, 'm1') === 'hors_heures' && !gps.demarree, 'appli ouverte le soir : pas de suivi');
verifier((await etatSuivi()).mode === 'hors_heures', 'écran : hors des heures de travail');
p = await mettreEnPause();
verifier(!p.ok, 'pas de pause hors des heures');
horloge = le(14, 8, 5);
verifier(await assurerSuivi(uid, 'm1') === 'actif' && gps.demarree && !notifs.planifiees.has('suivi-gps-reprise'),
  'mercredi 08:05, appli ouverte : le suivi repart, le rappel est retiré');
verifier((await etatSuivi()).pauseRestanteMs === 90 * 60000, 'nouveau jour : 90 min de pause');
horloge = le(18, 10);
verifier(await assurerSuivi(uid, 'm1') === 'hors_heures' && !gps.demarree, 'dimanche : pas de suivi');
horloge = le(19, 9);
await assurerSuivi(uid, 'm1');
reglagesServeur = { ...reglagesServeur, suivi_gps_fin: '20:00:00' };
horloge = le(19, 9, 15);
await livrer(loc(horloge, 0.009));
verifier((await etatSuivi()).reglages.fin === 1200, 'heures changées par le responsable : apportées par la base au signal suivant');
horloge = le(19, 19);
verifier(await assurerSuivi(uid, 'm1') === 'actif', 'lundi 19:00 : dans les nouvelles heures (jusqu\'à 20:00)');

console.log('8. « Quitter »');
p = await mettreEnPause();
verifier(p.ok, 'pause en cours');
await terminerSuivi();
verifier(!gps.demarree && (await etatSuivi()).enAttente === 0, '« Quitter » : derniers points envoyés, tâche arrêtée');
verifier(dernier('enregistrer_pause_gps').p_motif === 'quitter' && dernier('signaler_suivi_gps').p_etat === 'ferme',
  'pause close et session fermée signalées à la base');
await livrer(loc(horloge + 5000, 0.0013));
verifier((await etatSuivi()).enAttente === 0, 'après « Quitter », une position tardive n\'est pas gardée');

console.log('9. Autre compte connecté : les points d\'un agent ne partent jamais sous un autre compte');
await assurerSuivi(uid, 'm1');
await livrer(loc(horloge + 60000, 0.002));
await sim.deconnecter?.();
sim.utilisateur = 'autre-agent';
await sim.connecter(undefined, 10 * 86400);
recu.length = 0;
n = await envoyerPoints(true);
verifier(n === 0 && de('ajouter_points_trace').length === 0 && (await etatSuivi()).enAttente === 1, 'le point de l\'agent précédent attend sa reconnexion');

console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
process.exit(ko ? 1 : 0);

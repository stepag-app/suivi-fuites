// Essai SANS pile du suivi GPS (S11, X6) : règles du filtre (15 m / 30 s en mouvement), file d'attente hors ligne,
// envoi par lots sans perte ni doublon, tâche de fond (src/suivi-gps.ts) avec expo-location et la base simulés.
//   node --import ./essais/substituts.mjs essais/suivi-gps.test.mjs
import {
  ajouterPoint, borner, distanceM, envoyerFile, FILE_MAX, FILE_VIDE, LOT_MAX, nbPoints, pointRetenu, retirerAcquits,
} from '../src/suivi-gps-regles.ts';
import { gps } from './mocks/expo.js';
import { simulation as sim, supabase } from './mocks/supabase-simule.js';
import {
  assurerSuivi, autorisations, envoyerPoints, etatSuivi, TACHE_GPS, terminerSuivi, voulerSuivi,
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

console.log('4. Tâche de fond (src/suivi-gps.ts)');
sim.remettre();
sim.utilisateur = 'agent-gps';
await sim.connecter();
const uid = (await supabase.auth.getSession()).data.session.user.id;
const recu = [];
let reponse = { error: null };
supabase.rpc = async (nom, args) => { recu.push({ nom, ...args }); return reponse; };
const tache = gps.taches.get(TACHE_GPS);
verifier(typeof tache === 'function', 'la tâche de fond est définie à l\'import du module');
const loc = (dt, dLat, precision = 5) => ({ coords: { longitude: -1.91, latitude: 34.68 + dLat, accuracy: precision }, timestamp: (T0 + dt) * 1000 });
await tache({ data: { locations: [loc(0, 0)] }, error: null });
verifier((await etatSuivi()).enAttente === 0, 'sans suivi démarré (aucun contexte), la position n\'est pas gardée');

gps.premierPlan = false; gps.arrierePlan = false;
verifier(!(await assurerSuivi(uid, 'm1')) && !gps.demarree, 'autorisations refusées : le suivi ne démarre pas');
gps.premierPlan = true; gps.arrierePlan = false;
verifier(!(await assurerSuivi(uid, 'm1')) && !gps.demarree, 'position « seulement pendant l\'utilisation » : pas de suivi en arrière-plan');
gps.arrierePlan = true;
verifier(await assurerSuivi(uid, 'm1') && gps.demarree, 'toutes les autorisations : la tâche démarre');
verifier(gps.options.foregroundService?.notificationTitle && gps.options.distanceInterval === 5 && gps.options.timeInterval === 10000,
  'notification permanente (service de premier plan), mesure tous les 5 m / 10 s au plus');
await voulerSuivi(false);
gps.demarree = false;
verifier(!(await assurerSuivi(uid, 'm1')) && !gps.demarree, 'suivi désactivé par l\'agent : la tâche ne repart pas');
await voulerSuivi(true);
verifier(await assurerSuivi(uid, 'm1') && gps.demarree, 'réactivé : la tâche repart');

const attendre = () => new Promise((fin) => setTimeout(fin, 60));
// Premier lot reçu : l'envoi part aussitôt (rien n'a encore été tenté), la coupure du réseau le fait échouer.
sim.reseau = false;
reponse = { error: { code: '', message: 'TypeError: Network request failed' } };
await tache({ data: { locations: [loc(0, 0), loc(10, 0.00003), loc(20, 0.00018), loc(30, 0.00019)] }, error: null });
await attendre();
let e = await etatSuivi();
verifier(e.enAttente === 2 && e.dernierePosition != null, 'quatre mesures, deux points gardés (le premier et celui à 20 m)', e.enAttente);
verifier(recu.length === 1 && recu[0].p_points.length === 2, 'premier envoi tenté aussitôt, refusé par la coupure : les deux points restent');
await tache({ data: { locations: [loc(60, 0.0004)] }, error: null });
await attendre();
verifier(recu.length === 1 && (await etatSuivi()).enAttente === 3, 'un seul essai toutes les 2 minutes en arrière-plan (le point reste en file)');
let n = await envoyerPoints(true);
verifier(n === 0 && recu.length === 2 && (await etatSuivi()).enAttente === 3, 'envoi forcé pendant la coupure : les trois points restent sur la tablette');
sim.reseau = true;
reponse = { error: null };
n = await envoyerPoints(true);
const dernierAppel = recu[recu.length - 1];
verifier(n === 3 && (await etatSuivi()).enAttente === 0 && dernierAppel.nom === 'ajouter_points_trace' && dernierAppel.p_marche === 'm1'
  && dernierAppel.p_points.length === 3 && dernierAppel.p_points[0].length === 3, 'réseau revenu : un lot de 3 points [t, lon, lat] envoyé, file vide');
verifier((await etatSuivi()).dernierEnvoi != null, 'dernier envoi noté');

await tache({ data: { locations: [loc(90, 0.0007)] }, error: null });
await attendre();
reponse = { error: { code: '42501', message: 'Aucune affectation active sur ce marché' } };
n = await envoyerPoints(true);
verifier(n === 0 && (await etatSuivi()).enAttente === 0, 'refus définitif de la base (plus affecté) : points abandonnés');
await tache({ data: { locations: [loc(120, 0.001)] }, error: null });
await attendre();
reponse = { error: { code: 'PGRST202', message: 'Could not find the function' } };
n = await envoyerPoints(true);
verifier(n === 0 && (await etatSuivi()).enAttente === 1, 'fonction pas encore déployée : points gardés sur la tablette');

reponse = { error: null };
await terminerSuivi();
verifier(!gps.demarree && (await etatSuivi()).enAttente === 0, '« Quitter » : derniers points envoyés, tâche arrêtée');
await tache({ data: { locations: [loc(150, 0.0013)] }, error: null });
await attendre();
verifier((await etatSuivi()).enAttente === 0, 'après « Quitter », une position tardive n\'est pas gardée');

console.log('5. Autre compte connecté : les points d\'un agent ne partent jamais sous un autre compte');
await assurerSuivi(uid, 'm1');
await tache({ data: { locations: [loc(200, 0.002)] }, error: null });
await attendre();
await sim.deconnecter?.();
sim.utilisateur = 'autre-agent';
await sim.connecter();
recu.length = 0;
n = await envoyerPoints(true);
verifier(n === 0 && recu.length === 0 && (await etatSuivi()).enAttente === 1, 'le point de l\'agent précédent attend sa reconnexion');

console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
process.exit(ko ? 1 : 0);

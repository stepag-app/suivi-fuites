// Essai SANS pile Supabase du démarrage de la tablette sans réseau, avec un jeton expiré (défaut relevé le 2026-10-07 :
// écran Connexion au lieu de la liste hors ligne). Vrai client Supabase (auth-js : renouvellement, reprises,
// événements, déconnexion) et vrai code de src/session-donnees.ts et src/file-attente.ts ; serveur, stockage et réseau
// simulés (mocks/serveur-simule.js), sur une horloge simulée : les reprises d'auth-js et son minuteur de 30 s passent
// sans attendre. Depuis mobile/ :
//   node --import ./essais/substituts.mjs essais/session-hors-ligne.test.mjs
import AsyncStorage from '@react-native-async-storage/async-storage';
import { changerEtat } from './mocks/react-native.js';
import { CLE_SESSION, simulation as sim } from './mocks/serveur-simule.js';

let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };
// auth-js signale chaque renouvellement impossible par console.warn : gardé à part, l'essai le vérifie lui-même.
const avertissements = [];
console.warn = (...a) => avertissements.push(a.map(String).join(' '));

// Horloge simulée (Date.now, setTimeout, setInterval), posée avant le démarrage du client pour qu'il la prenne.
let maintenant = Date.parse('2026-10-07T07:00:00Z');
const minuteurs = new Map();
let numero = 0;
Date.now = () => maintenant;
globalThis.setTimeout = (f, ms = 0, ...a) => {
  minuteurs.set(++numero, { f: () => f(...a), echeance: maintenant + Math.max(0, ms) });
  return numero;
};
globalThis.clearTimeout = (n) => void minuteurs.delete(n);
globalThis.setInterval = (f, ms, ...a) => {
  const n = ++numero;
  const armer = () => minuteurs.set(n, { f: () => { armer(); f(...a); }, echeance: maintenant + ms });
  armer();
  return n;
};
globalThis.clearInterval = globalThis.clearTimeout;
// Les promesses avancent par microtâches seulement, comme tout cet essai.
const promesses = async () => { for (let i = 0; i < 5000; i++) await null; };
/** Fait passer `ms` : chaque minuteur part à son heure, les promesses avancent entre deux. */
async function avancer(ms) {
  const fin = maintenant + ms;
  for (;;) {
    await promesses();
    let prochain = null;
    for (const [n, m] of minuteurs) if (m.echeance <= fin && (!prochain || m.echeance < prochain[1].echeance)) prochain = [n, m];
    if (!prochain) break;
    maintenant = Math.max(maintenant, prochain[1].echeance);
    minuteurs.delete(prochain[0]);
    prochain[1].f();
  }
  maintenant = fin;
  await promesses();
}
/** Fait passer le temps jusqu'à ce que `condition` soit vraie ; renvoie la durée simulée, en secondes. */
async function attendreQue(condition, limite = 10 * 60 * 1000) {
  const debut = maintenant;
  while (!condition()) {
    if (maintenant - debut >= limite) throw new Error(`toujours en attente après ${limite / 1000} s simulées`);
    await avancer(100);
  }
  return (maintenant - debut) / 1000;
}
/** Attend une promesse sur l'horloge simulée ; renvoie [valeur, durée simulée en secondes]. */
async function attendre(p) {
  let fin = null;
  p.then((v) => { fin = { v }; }, (e) => { fin = { e }; });
  const duree = await attendreQue(() => fin);
  if ('e' in fin) throw fin.e;
  return [fin.v, duree];
}

// Tablette de l'agent : session de la veille (jeton expiré depuis 2 h), dernier contexte connu, pas de réseau.
const UID = 'agent';
const MARCHE = { id: 'marche-srm', code: 'SRM', intitule: 'Marché SRM Oriental' };
const DROIT = { marche_id: MARCHE.id, type_donnee: 'fuites', lire: true, creer: true, modifier: 'siennes', supprimer: 'non', valider: false };
const PROFIL = { id: UID, identifiant: 'agent', nom_complet: 'Agent Essai', est_admin: false, actif: true };
sim.tables.profils.push(PROFIL);
sim.tables.marches.push(MARCHE);
sim.tables.droits.push({ ...DROIT, profil_id: UID });
await AsyncStorage.setItem(`suivi-fuites:contexte:${UID}`, JSON.stringify({ profil: { ...PROFIL, nom_complet: 'Agent Essai (copie)' }, marches: [MARCHE], droits: [DROIT] }));
const veille = await sim.connecter(UID, -2 * 3600);
sim.reseau = false;

// Démarrage de l'appli : le client Supabase est créé maintenant (src/supabase.ts), comme à l'ouverture de l'APK.
const { supabase, CLE_SESSION: cleAppli } = await import('./mocks/supabase-simule.js');
const { isAuthRetryableFetchError } = await import('@supabase/supabase-js');
const { chargerContexte, fermerSession, sessionDeDepart, suivreSession } = await import('../src/session-donnees.ts');
const { lireAttente, mettreEnAttente, synchroniser } = await import('../src/file-attente.ts');
const evenements = [];
supabase.auth.onAuthStateChange((e, s) => evenements.push(`${e}:${s ? 'session' : 'aucune'}`));
const etats = [];
const arreter = suivreSession((e) => etats.push(e));
const etat = () => etats.at(-1);
const stockee = async () => JSON.parse((await AsyncStorage.getItem(CLE_SESSION)) ?? 'null');

console.log('1. Démarrage sans réseau, jeton expiré depuis 2 h');
verifier(cleAppli === CLE_SESSION, `clé de la session dans le stockage : ${cleAppli} (celle de supabase-js)`);
const depart = await attendreQue(() => etats.length > 0);
verifier(etat().session?.user.id === UID && etat().aRenouveler,
  'session gardée : la liste s\'ouvre (pas l\'écran Connexion), jeton à renouveler', etat());
verifier(depart >= 20 && depart <= 30, `ouverte après ${depart} s simulées (reprises d'auth-js sans réseau, comme avant le correctif)`);
verifier(evenements.includes('INITIAL_SESSION:aucune') && etats.length === 1,
  'événement INITIAL_SESSION sans session (auth-js) : ignoré, la session reste ouverte', { evenements, etats: etats.length });
const [seul] = await attendre(supabase.auth.getSession());
verifier(!seul.data.session && isAuthRetryableFetchError(seul.error) && (await stockee())?.refresh_token === veille.refresh_token,
  'auth-js seul : getSession() rend null alors que la session est toujours stockée (cause de l\'écran Connexion)');
const contexte = await chargerContexte(UID, !etat().aRenouveler);
verifier(contexte?.profil?.nom_complet === 'Agent Essai (copie)' && contexte.marches[0]?.id === MARCHE.id && contexte.droits.length === 1,
  'contexte de la copie de la tablette : profil, marché, droits (liste hors ligne)', contexte);
verifier(!sim.journal.length && !sim.sansJeton.length, 'aucune requête de données partie (elle partirait avec la clé anonyme)',
  { journal: sim.journal, sansJeton: sim.sansJeton });

console.log('2. File d\'attente : rien ne part sans jeton valide, tout repart après le renouvellement');
const F1 = crypto.randomUUID();
await mettreEnAttente({ id: F1, marche_id: MARCHE.id, position: null, photos: [], ligne: { adresse: 'Saisie hors ligne' } });
let [reste] = await attendre(synchroniser());
verifier(reste === 1 && !sim.journal.length && !sim.sansJeton.length, 'sans réseau : la fuite reste sur la tablette, rien n\'est envoyé');
sim.reseau = true;
[reste] = await attendre(synchroniser());
verifier(reste === 1 && !sim.journal.length && !sim.sansJeton.length && !(await lireAttente())[0].erreur,
  'réseau revenu, jeton pas encore renouvelé (pause d\'auth-js après un échec) : toujours rien, aucun message',
  { journal: sim.journal, sansJeton: sim.sansJeton });
const copie = await chargerContexte(UID, !etat().aRenouveler);
verifier(copie?.profil?.nom_complet === 'Agent Essai (copie)' && !sim.journal.length && !sim.sansJeton.length,
  'contexte : toujours la copie, aucune requête partie avec la clé anonyme', { journal: sim.journal, sansJeton: sim.sansJeton });
const jetonAvant = etat().session.access_token;
const renouvele = await attendreQue(() => etat().session?.access_token !== jetonAvant);
verifier(!etat().aRenouveler && evenements.includes('TOKEN_REFRESHED:session') && renouvele <= 90,
  `jeton renouvelé ${renouvele} s après le retour du réseau (minuteur d'auth-js : 30 s, pause de 60 s après un échec)`);
[reste] = await attendre(synchroniser());
verifier(reste === 0 && sim.tables.fuites.some((f) => f.id === F1) && !sim.sansJeton.length,
  'la file repart : la fuite est envoyée avec le nouveau jeton (synchro lancée au changement de session)');
const recharge = await chargerContexte(UID, !etat().aRenouveler);
verifier(recharge?.profil?.nom_complet === 'Agent Essai'
  && JSON.parse(await AsyncStorage.getItem(`suivi-fuites:contexte:${UID}`)).profil.nom_complet === 'Agent Essai',
  'contexte rechargé du serveur une fois le jeton renouvelé, copie de la tablette mise à jour');

console.log('3. Arrière-plan et premier plan (AppState)');
changerEtat('background');
sim.reseau = false;
const essais = sim.auth.length;
await avancer(2 * 3600 * 1000);
verifier(sim.auth.length === essais, 'en arrière-plan : aucun essai de renouvellement pendant 2 h (batterie)', sim.auth);
sim.reseau = true;
const jetonExpire = (await stockee()).access_token;
changerEtat('active');
const auPremierPlan = await attendreQue(() => etat().session?.access_token !== jetonExpire);
verifier(auPremierPlan < 1, `retour au premier plan avec le réseau : jeton renouvelé aussitôt (${auPremierPlan} s)`);

console.log('4. Jeton expiré pendant un envoi : le refus du serveur n\'est pas compté, la saisie repart');
await sim.connecter(UID, 30); // jeton valide encore 30 s
sim.authEnPanne = true; // pas de renouvellement possible, l'API répond
sim.lenteur = 20000; // réponse en 20 s : le jeton expire en route
const F2 = crypto.randomUUID();
await mettreEnAttente({ id: F2, marche_id: MARCHE.id, position: null, photos: [], ligne: { adresse: 'Envoi lent' } });
[reste] = await attendre(synchroniser());
const l4 = await lireAttente();
verifier(sim.sansJeton.join() === 'fuites:insert:expire', 'la requête est arrivée avec un jeton expiré (refus « JWT expired »)', sim.sansJeton);
verifier(reste === 1 && !l4[0].erreur, 'refus non compté comme un droit insuffisant : la fuite reste sur la tablette, sans message', l4[0]);
sim.authEnPanne = false;
sim.lenteur = 0;
const jeton4 = etat().session.access_token;
await attendreQue(() => etat().session?.access_token !== jeton4);
[reste] = await attendre(synchroniser());
verifier(reste === 0 && sim.tables.fuites.some((f) => f.id === F2), 'après le renouvellement, la fuite part');

console.log('5. Renouvellement refusé par le serveur (jeton révoqué) : écran Connexion');
const revoquee = await sim.connecter(UID, -60);
sim.renouvellements.delete(revoquee.refresh_token);
await attendreQue(() => etat().session === null, 60000);
verifier(evenements.at(-1) === 'SIGNED_OUT:aucune' && (await stockee()) === null,
  'SIGNED_OUT : session fermée (écran Connexion), effacée de la tablette');
const [apresRefus] = await attendre(sessionDeDepart());
verifier(apresRefus.session === null && !apresRefus.aRenouveler, 'démarrage suivant : écran Connexion');

console.log('6. « Quitter » sans réseau avec un jeton expiré');
const hier = await sim.connecter(UID, -3600);
sim.reseau = false;
const [redemarrage] = await attendre(sessionDeDepart());
etats.push(redemarrage); // ce que session.tsx garde au démarrage
verifier(redemarrage.session?.user.id === UID && redemarrage.aRenouveler, 'au démarrage : liste hors ligne, jeton à renouveler');
const [seulAuth] = await attendre(supabase.auth.signOut());
verifier(seulAuth.error && (await stockee())?.refresh_token === hier.refresh_token && etat().session,
  'auth-js seul : signOut() échoue sans rien effacer (« Quitter » ne fermait rien)');
const requetesAuth = sim.auth.length;
const [, quitter] = await attendre(fermerSession(etat().aRenouveler));
verifier(etat().session === null && (await stockee()) === null && sim.auth.length === requetesAuth && quitter < 1,
  `fermerSession : session retirée de la tablette en ${quitter} s, sans appel au serveur (SIGNED_OUT)`);

console.log('7. « Quitter » avec le réseau : déconnexion sur le serveur');
sim.reseau = true;
const enLigne = await sim.connecter(UID, 3600);
await attendre(fermerSession(false));
verifier(etat().session === null && (await stockee()) === null && sim.auth.at(-1) === 'logout' && !sim.renouvellements.has(enLigne.refresh_token),
  'session fermée sur la tablette et révoquée sur le serveur');

verifier(sim.sansJeton.length === 1 && avertissements.every((a) => /AuthRetryableFetchError|Network request failed|Invalid Refresh Token/.test(a)),
  'hors l\'envoi de la section 4, aucune requête de données partie sans jeton valide ; avertissements d\'auth-js attendus seulement',
  { sansJeton: sim.sansJeton, avertissements });
arreter();
console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
process.exit(ko ? 1 : 0);

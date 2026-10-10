// Essai SANS pile Supabase du démarrage de la tablette sans réseau, avec un jeton expiré (défauts relevés le 2026-10-07 :
// écran Connexion au lieu de la liste hors ligne, puis liste affichée au bout de 25 à 45 s). Vrai client Supabase
// (auth-js : renouvellement, reprises, événements, déconnexion) et vrai code de src/session-donnees.ts,
// src/liste-donnees.ts et src/file-attente.ts ; serveur, stockage et réseau simulés (mocks/serveur-simule.js), sur une
// horloge simulée : les reprises d'auth-js et son minuteur de 30 s passent sans attendre. Les durées d'ouverture
// (session, contexte, liste) sont mesurées sur cette horloge. Depuis mobile/ :
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
/** Tablette en veille `ms` : l'heure avance, les minuteurs de React Native restent en retard (horloge monotone). */
function mettreEnVeille(ms) {
  maintenant += ms;
  for (const m of minuteurs.values()) m.echeance += ms;
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

// Tablette de l'agent : session de la veille (jeton expiré depuis 2 h), dernier contexte et dernière liste connus, pas
// de réseau. Le serveur a, lui, une liste plus récente.
const UID = 'agent';
const MARCHE = { id: 'marche-srm', code: 'SRM', intitule: 'Marché SRM Oriental' };
const DROIT = { marche_id: MARCHE.id, type_donnee: 'fuites', lire: true, creer: true, modifier: 'siennes', supprimer: 'non', valider: false };
const PROFIL = { id: UID, identifiant: 'agent', nom_complet: 'Agent Essai', est_admin: false, actif: true };
const fuite = (id, numero) => ({ id, numero, marche_id: MARCHE.id, statut: 'detectee', reference_srm: null, adresse: `Rue ${numero}` });
sim.tables.profils.push(PROFIL);
sim.tables.marches.push(MARCHE);
sim.tables.droits.push({ ...DROIT, profil_id: UID });
sim.tables.v_fuites.push(fuite('f2', 2), fuite('f1', 1));
await AsyncStorage.setItem(`suivi-fuites:contexte:${UID}`, JSON.stringify({ profil: { ...PROFIL, nom_complet: 'Agent Essai (copie)' }, marches: [MARCHE], droits: [DROIT] }));
await AsyncStorage.setItem(`suivi-fuites:liste:${MARCHE.id}`, JSON.stringify([fuite('f1', 1)]));
await sim.connecter(UID, -2 * 3600);
sim.reseau = false;

// Démarrage de l'appli : le client Supabase est créé maintenant (src/supabase.ts), comme à l'ouverture de l'APK.
const debut = maintenant;
const { supabase, CLE_SESSION: cleAppli } = await import('./mocks/supabase-simule.js');
const { isAuthRetryableFetchError } = await import('@supabase/supabase-js');
const { chargerContexte, DELAI_DEPART_MS, fermerSession, sessionDeDepart, suivreSession } = await import('../src/session-donnees.ts');
const { chargerListe } = await import('../src/liste-donnees.ts');
const { lireAttente, mettreEnAttente, synchroniser } = await import('../src/file-attente.ts');
// Événements d'auth-js et leur heure simulée (s depuis le démarrage).
const evenements = [], instants = [];
supabase.auth.onAuthStateChange((e, s) => {
  evenements.push(`${e}:${s ? 'session' : 'aucune'}`);
  instants.push((maintenant - debut) / 1000);
});
const stockee = async () => JSON.parse((await AsyncStorage.getItem(CLE_SESSION)) ?? 'null');
const ids = (contenu) => JSON.parse(contenu).map((f) => f.id).join();

/**
 * Ouverture de l'appli, enchaînée comme session.tsx puis l'écran Liste : état de la session, contexte (copie de la
 * tablette, puis serveur sauf jeton à renouveler), liste du premier marché (de même). Chaque nouvel état relance
 * contexte et liste, comme les effets de session.tsx et de l'écran Liste. `vu` : heure simulée (s depuis l'ouverture)
 * du premier affichage de la session, du contexte et de la liste.
 */
function ouvrir() {
  const t0 = maintenant;
  const app = { etats: [], contextes: [], listes: [], vu: {}, repondu: null, marche: null };
  const noter = (etape) => { app.vu[etape] ??= (maintenant - t0) / 1000; };
  const liste = (aRenouveler) => chargerListe(app.marche, {
    copie: !app.listes.length, aRenouveler, delaiMs: 20000,
    afficher: (contenu) => {
      if (contenu === app.listes.at(-1)) return false;
      app.listes.push(contenu);
      noter('liste');
      return true;
    },
  }).then((r) => { app.repondu = r; });
  app.etat = () => app.etats.at(-1);
  app.arreter = suivreSession((etat) => {
    app.etats.push(etat);
    noter('session');
    if (!etat.session) return;
    if (app.marche) void liste(etat.aRenouveler);
    void chargerContexte(etat.session.user.id, etat.aRenouveler, (c) => {
      // Contexte inchangé : session.tsx garde ses objets, rien n'est redessiné.
      if (JSON.stringify(c) !== JSON.stringify(app.contextes.at(-1))) app.contextes.push(c);
      noter('contexte');
      if (app.marche || !c.marches[0]) return;
      app.marche = c.marches[0].id;
      void liste(etat.aRenouveler);
    });
  });
  return app;
}
/** « Quitter » (deconnecter de session.tsx) : écran Connexion dès que la session est retirée de la tablette. */
async function quitter(app) {
  const [, duree] = await attendre(fermerSession(app.etat().aRenouveler));
  app.etats.push({ session: null, aRenouveler: false });
  return duree;
}

console.log('1. Ouverture sans réseau, jeton expiré depuis 2 h : durée avant la liste');
verifier(cleAppli === CLE_SESSION, `clé de la session dans le stockage : ${cleAppli} (celle de supabase-js)`);
// Avant ce correctif, lancés en même temps : l'appli attendait getSession() pour la session de départ, puis l'écran
// Liste attendait sa requête au serveur, jeton compris (l'abandon à 20 s ne coupait que l'envoi, jamais parti).
const avant = {};
supabase.auth.getSession().then(() => { avant.session = (maintenant - debut) / 1000; });
const abandon = new AbortController();
setTimeout(() => abandon.abort(), 20000);
supabase.from('v_fuites').select('*').eq('marche_id', MARCHE.id).order('date_detection').limit(200).abortSignal(abandon.signal)
  .then(() => { avant.liste = (maintenant - debut) / 1000; });
const app = ouvrir();
await attendreQue(() => app.vu.liste != null);
verifier(app.etat().session?.user.id === UID && app.etat().aRenouveler,
  'session gardée : la liste s\'ouvre (pas l\'écran Connexion), jeton à renouveler', app.etat());
verifier(app.vu.session <= DELAI_DEPART_MS / 1000 + 0.1, `session de départ au bout de ${app.vu.session} s simulées (attente du renouvellement bornée à ${DELAI_DEPART_MS / 1000} s)`);
verifier(app.contextes.length === 1 && app.contextes[0].profil.nom_complet === 'Agent Essai (copie)' && app.contextes[0].marches[0].id === MARCHE.id,
  `contexte de la copie de la tablette (profil, marché, droits) au bout de ${app.vu.contexte} s`, app.contextes);
verifier(app.listes.length === 1 && ids(app.listes[0]) === 'f1' && app.vu.liste <= 3 && app.repondu === false,
  `liste de la tablette affichée au bout de ${app.vu.liste} s simulées (objectif : 3 s au plus), « Hors ligne »`, { listes: app.listes, vu: app.vu });
verifier(!sim.journal.length && !sim.sansJeton.length, 'aucune requête de données partie (elle attendrait les reprises d\'auth-js, puis partirait avec la clé anonyme)',
  { journal: sim.journal, sansJeton: sim.sansJeton });
const duree = await quitter(app);
verifier(duree < 1 && (await stockee()) === null, `« Quitter » pendant les reprises d'auth-js : session retirée en ${duree} s, écran Connexion`);
await attendreQue(() => avant.session != null && avant.liste != null && evenements.includes('SIGNED_OUT:aucune'));
verifier(avant.session >= 20 && avant.session <= 30 && avant.liste >= avant.session,
  `avant ce correctif : session au bout de ${avant.session} s, liste au bout de ${avant.liste} s simulées (reprises du renouvellement)`, avant);
const finReprises = instants[evenements.indexOf('SIGNED_OUT:aucune')];
verifier(finReprises >= 20 && app.etat().session === null && !evenements.some((e) => e.endsWith(':session')) && (await stockee()) === null,
  `SIGNED_OUT d'auth-js à la fin des reprises (${finReprises} s, l'attente de « Quitter » avant ce correctif) ; la session ne revient pas`,
  { evenements, etats: app.etats.length });
app.arreter();

console.log('2. Réouverture sans réseau (session de la veille) ; file d\'attente : rien ne part sans jeton valide');
const veille = await sim.connecter(UID, -2 * 3600);
const journal2 = [];
const { data: suivi2 } = supabase.auth.onAuthStateChange((e, s) => journal2.push(`${e}:${s ? 'session' : 'aucune'}`));
const app2 = ouvrir();
await attendreQue(() => app2.vu.liste != null);
verifier(app2.etat().aRenouveler && app2.vu.liste <= 3 && ids(app2.listes[0]) === 'f1', `liste de la tablette au bout de ${app2.vu.liste} s simulées`);
// Nouvelle fuite enregistrée aussitôt : l'écran attend la synchro avant de revenir à la liste.
const F1 = crypto.randomUUID();
await mettreEnAttente({ id: F1, marche_id: MARCHE.id, position: null, photos: [], ligne: { adresse: 'Saisie hors ligne' } });
let [reste, synchro] = await attendre(synchroniser());
verifier(reste === 1 && synchro < 1 && !sim.journal.length && !sim.sansJeton.length,
  `« Enregistrer » pendant les reprises d'auth-js : la fuite reste sur la tablette, synchro rendue en ${synchro} s (jeton expiré : rien à attendre)`);
await avancer(30000);
verifier(journal2.includes('INITIAL_SESSION:aucune') && app2.etats.length === 1,
  'événement INITIAL_SESSION sans session (fin des reprises d\'auth-js) : ignoré, la session reste ouverte', { journal2, etats: app2.etats.length });
suivi2.subscription.unsubscribe();
const [seul] = await attendre(supabase.auth.getSession());
verifier(!seul.data.session && isAuthRetryableFetchError(seul.error) && (await stockee())?.refresh_token === veille.refresh_token,
  'auth-js seul : getSession() rend null alors que la session est toujours stockée (cause de l\'écran Connexion)');
sim.reseau = true;
[reste] = await attendre(synchroniser());
verifier(reste === 1 && !sim.journal.length && !sim.sansJeton.length && !(await lireAttente())[0].erreur,
  'réseau revenu, jeton pas encore renouvelé (pause d\'auth-js après un échec) : toujours rien, aucun message',
  { journal: sim.journal, sansJeton: sim.sansJeton });
verifier(app2.contextes.length === 1 && app2.listes.length === 1, 'contexte et liste : toujours les copies, aucune requête partie avec la clé anonyme');
const jetonAvant = app2.etat().session.access_token;
const renouvele = await attendreQue(() => app2.etat().session?.access_token !== jetonAvant);
verifier(!app2.etat().aRenouveler && renouvele <= 90,
  `jeton renouvelé ${renouvele} s après le retour du réseau (minuteur d'auth-js : 30 s, pause de 60 s après un échec)`);
[reste] = await attendre(synchroniser());
verifier(reste === 0 && sim.tables.fuites.some((f) => f.id === F1) && !sim.sansJeton.length,
  'la file repart : la fuite est envoyée avec le nouveau jeton (synchro lancée au changement de session)');
await attendreQue(() => app2.listes.length === 2 && app2.contextes.length === 2);
verifier(app2.contextes[1].profil.nom_complet === 'Agent Essai' && ids(app2.listes[1]) === 'f2,f1' && app2.repondu === true
  && JSON.parse(await AsyncStorage.getItem(`suivi-fuites:contexte:${UID}`)).profil.nom_complet === 'Agent Essai'
  && ids(await AsyncStorage.getItem(`suivi-fuites:liste:${MARCHE.id}`)) === 'f2,f1',
  'contexte et liste rechargés du serveur une fois le jeton renouvelé, copies de la tablette mises à jour');

console.log('3. Arrière-plan et premier plan (AppState)');
changerEtat('background');
sim.reseau = false;
const essais = sim.auth.length;
await avancer(2 * 3600 * 1000);
verifier(sim.auth.length === essais, 'en arrière-plan : aucun essai de renouvellement pendant 2 h (batterie)', sim.auth);
sim.reseau = true;
const jetonExpire = (await stockee()).access_token;
changerEtat('active');
const auPremierPlan = await attendreQue(() => app2.etat().session?.access_token !== jetonExpire);
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
const jeton4 = app2.etat().session.access_token;
await attendreQue(() => app2.etat().session?.access_token !== jeton4);
[reste] = await attendre(synchroniser());
verifier(reste === 0 && sim.tables.fuites.some((f) => f.id === F2), 'après le renouvellement, la fuite part');

console.log('5. Renouvellement refusé par le serveur (jeton révoqué) : écran Connexion');
const revoquee = await sim.connecter(UID, -60);
sim.renouvellements.delete(revoquee.refresh_token);
await attendreQue(() => app2.etat().session === null, 60000);
verifier(evenements.at(-1) === 'SIGNED_OUT:aucune' && (await stockee()) === null,
  'SIGNED_OUT : session fermée (écran Connexion), effacée de la tablette');
const [apresRefus] = await attendre(sessionDeDepart());
verifier(apresRefus.session === null && !apresRefus.aRenouveler, 'démarrage suivant : écran Connexion');

console.log('6. « Quitter » sans réseau avec un jeton expiré');
const hier = await sim.connecter(UID, -3600);
sim.reseau = false;
const [redemarrage, demarrage6] = await attendre(sessionDeDepart());
app2.etats.push(redemarrage); // ce que session.tsx garde au démarrage
verifier(redemarrage.session?.user.id === UID && redemarrage.aRenouveler && demarrage6 <= DELAI_DEPART_MS / 1000 + 0.1,
  `au démarrage (${demarrage6} s) : liste hors ligne, jeton à renouveler`);
const [seulAuth] = await attendre(supabase.auth.signOut());
verifier(seulAuth.error && (await stockee())?.refresh_token === hier.refresh_token && app2.etat().session,
  'auth-js seul : signOut() échoue sans rien effacer (« Quitter » ne fermait rien)');
const requetesAuth = sim.auth.length;
const duree6 = await quitter(app2);
await avancer(100);
verifier(app2.etat().session === null && (await stockee()) === null && sim.auth.length === requetesAuth && duree6 < 1
  && evenements.at(-1) === 'SIGNED_OUT:aucune',
  `fermerSession : session retirée de la tablette en ${duree6} s, sans appel au serveur (SIGNED_OUT)`);

console.log('7. « Quitter » avec le réseau : déconnexion sur le serveur');
sim.reseau = true;
const enLigne = await sim.connecter(UID, 3600);
await attendre(fermerSession(false));
verifier(app2.etat().session === null && (await stockee()) === null && sim.auth.at(-1) === 'logout' && !sim.renouvellements.has(enLigne.refresh_token),
  'session fermée sur la tablette et révoquée sur le serveur');
app2.arreter();

console.log('8. Ouverture dans les autres cas : jeton valide, réseau présent, lent, refus du serveur');
const sansJetonAvant = sim.sansJeton.length;
// Fuite signalée par un autre agent : la liste du serveur diffère alors de la copie de la tablette.
let numero8 = 10;
const nouvelleAuServeur = () => {
  const f = fuite(`f${++numero8}`, numero8);
  sim.tables.v_fuites.unshift(f);
  return f.id;
};
const enTete = (app) => (app.listes.length ? JSON.parse(app.listes.at(-1))[0]?.id : null);

let attendue = nouvelleAuServeur();
await sim.connecter(UID, 3600);
const a8 = ouvrir();
await attendreQue(() => enTete(a8) === attendue);
verifier(a8.vu.session === 0 && !a8.etat().aRenouveler && a8.vu.liste === 0 && a8.listes.length === 2 && a8.repondu,
  'jeton valide : ouverture aussitôt (0 s), copie de la liste puis réponse du serveur', { vu: a8.vu });
a8.arreter();

sim.reseau = false;
nouvelleAuServeur();
const a8b = ouvrir();
await attendreQue(() => a8b.repondu === false);
verifier(a8b.vu.session === 0 && !a8b.etat().aRenouveler && a8b.vu.liste === 0 && a8b.contextes.length === 1 && a8b.listes.length === 1,
  'jeton valide sans réseau : copies affichées aussitôt (0 s), « Hors ligne » quand le serveur ne répond pas', { vu: a8b.vu });
a8b.arreter();

sim.reseau = true;
attendue = nouvelleAuServeur();
await sim.connecter(UID, -3600);
const a8c = ouvrir();
await attendreQue(() => enTete(a8c) === attendue);
verifier(a8c.vu.session === 0 && a8c.etats.every((e) => e.session && !e.aRenouveler) && a8c.repondu,
  'jeton expiré, réseau présent : renouvelé avant le délai, liste du serveur sans passer par « Hors ligne »', { vu: a8c.vu, etats: a8c.etats });
a8c.arreter();

sim.lenteurAuth = 3000;
attendue = nouvelleAuServeur();
await sim.connecter(UID, -3600);
const requetes8d = sim.journal.length;
const a8d = ouvrir();
await attendreQue(() => a8d.vu.liste != null);
const sansRequete = sim.journal.length === requetes8d;
const serveur8d = await attendreQue(() => enTete(a8d) === attendue);
verifier(a8d.vu.liste <= DELAI_DEPART_MS / 1000 + 0.1 && a8d.etats[0].aRenouveler && sansRequete && !a8d.etat().aRenouveler
  && a8d.contextes.at(-1).profil.nom_complet === 'Agent Essai',
  `réseau lent (renouvellement en 3 s) : copies au bout de ${a8d.vu.liste} s, liste du serveur ${serveur8d} s plus tard (TOKEN_REFRESHED)`,
  { vu: a8d.vu, etats: a8d.etats.length });
a8d.arreter();

const refusee = await sim.connecter(UID, -3600);
sim.renouvellements.delete(refusee.refresh_token);
const a8e = ouvrir();
await attendreQue(() => a8e.vu.liste != null);
const refus = await attendreQue(() => a8e.etat().session === null);
verifier(a8e.etats[0].aRenouveler && a8e.vu.liste <= DELAI_DEPART_MS / 1000 + 0.1 && refus <= 2 && (await stockee()) === null,
  `renouvellement refusé après le délai : liste de la tablette, puis écran Connexion ${refus} s plus tard (SIGNED_OUT)`, { vu: a8e.vu });
a8e.arreter();

sim.lenteurAuth = 0;
sim.reseau = false;
await sim.connecter(UID, 60);
const a8f = ouvrir();
await attendreQue(() => a8f.vu.liste != null);
verifier(a8f.etat().aRenouveler && a8f.vu.session <= DELAI_DEPART_MS / 1000 + 0.1,
  `jeton valide encore 60 s (marge d'auth-js : 90 s), sans réseau : ouverture au bout de ${a8f.vu.session} s, jeton à renouveler`);
a8f.arreter();
await avancer(30000); // fin des reprises d'auth-js (un seul renouvellement à la fois)
// Tablette chargée : chaque lecture de la session prend 300 ms (valeur lue à la demande, comme AsyncStorage).
// Renouvellement en 1 s : TOKEN_REFRESHED arrive (1,9 s) pendant que l'état de départ, passé le délai (1,8 s), relit
// l'ancienne session (jusqu'à 2,1 s).
sim.reseau = true;
sim.lenteurAuth = 1000;
await sim.connecter(UID, -3600);
const lire = AsyncStorage.getItem;
AsyncStorage.getItem = async (cle) => {
  const valeur = await lire(cle);
  if (cle === CLE_SESSION) await new Promise((ok) => setTimeout(ok, 300));
  return valeur;
};
const a8g = ouvrir();
await avancer(10000);
AsyncStorage.getItem = lire;
sim.lenteurAuth = 0;
verifier(a8g.etat().session && !a8g.etat().aRenouveler && a8g.etats.every((e) => !e.aRenouveler),
  'TOKEN_REFRESHED arrivé avant l\'état de départ : celui-ci (ancienne session relue) ne l\'écrase pas', a8g.etats.map((e) => e.aRenouveler));
a8g.arreter();
verifier(sim.sansJeton.length === sansJetonAvant, 'aucune requête partie sans jeton valide à ces ouvertures', sim.sansJeton);

console.log('9. Jeton qui expire pendant l\'utilisation, sans réseau');
const sansJeton9 = sim.sansJeton.length;
attendue = nouvelleAuServeur();
const s9 = await sim.connecter(UID, 600); // jeton valide encore 10 min
const a9 = ouvrir();
await attendreQue(() => enTete(a9) === attendue);
verifier(!a9.etat().aRenouveler && a9.repondu, 'ouverture avec le réseau, jeton valide : liste du serveur');
sim.reseau = false;
const requetes9 = sim.journal.length;
const perte = await attendreQue(() => a9.etat().aRenouveler, 15 * 60 * 1000).catch(() => null);
const avantEcheance = Math.round(s9.expires_at - maintenant / 1000);
verifier(a9.etat().session?.access_token === s9.access_token && avantEcheance === 90 && sim.journal.length === requetes9,
  `réseau perdu : jeton à renouveler ${perte} s plus tard, ${avantEcheance} s avant son échéance (marge d'auth-js : les requêtes attendraient les reprises), sans requête`);
// Écran Liste : mise à jour de fond (minuteur de 5 min, retour au premier plan) lancée avant que l'écran soit prévenu.
const lireAvant = () => attendre(chargerListe(MARCHE.id, { copie: false, aRenouveler: false, delaiMs: 20000, afficher: () => false }));
let [repondu9, lecture9] = await lireAvant();
verifier(repondu9 === false && lecture9 < 1 && sim.journal.length === requetes9,
  `lecture lancée avec l'état d'avant : rien ne part, « Hors ligne » en ${lecture9} s`);
const F3 = crypto.randomUUID();
await mettreEnAttente({ id: F3, marche_id: MARCHE.id, position: null, photos: [], ligne: { adresse: 'Saisie après la perte du réseau' } });
[reste, synchro] = await attendre(synchroniser());
verifier(reste === 1 && synchro < 1 && sim.journal.length === requetes9 && !(await lireAttente())[0].erreur,
  `« Enregistrer » : la fuite reste sur la tablette, synchro rendue en ${synchro} s, sans message`);
await avancer(5 * 60 * 1000);
verifier(a9.etat().aRenouveler && a9.etat().session?.access_token === s9.access_token && sim.journal.length === requetes9,
  '5 min plus tard (jeton expiré, reprises d\'auth-js) : toujours à renouveler, aucune requête');
// Réseau revenu, renouvellement pas encore passé (pause de 60 s d'auth-js après un échec ; ici, serveur
// d'authentification injoignable) : supabase-js enverrait la clé anonyme.
sim.reseau = true;
sim.authEnPanne = true;
[repondu9, lecture9] = await lireAvant();
verifier(repondu9 === false && lecture9 < 1 && sim.journal.length === requetes9 && sim.sansJeton.length === sansJeton9,
  'réseau revenu, jeton pas encore renouvelé : toujours rien ne part (pas de clé anonyme)');
const [seule9, attente9] = await attendre(supabase.from('v_fuites').select('*').eq('marche_id', MARCHE.id));
verifier(seule9.error && sim.sansJeton.at(-1) === 'v_fuites:select:anonyme',
  `auth-js seul : la même lecture part au bout de ${attente9} s avec la clé anonyme (refusée)`, sim.sansJeton);
attendue = nouvelleAuServeur(); // signalée entre-temps par un autre agent
sim.authEnPanne = false;
const renouvele9 = await attendreQue(() => !a9.etat().aRenouveler);
verifier(a9.etat().session?.access_token !== s9.access_token && renouvele9 <= 90,
  `jeton renouvelé ${renouvele9} s après le retour du serveur (TOKEN_REFRESHED) : session normale`);
[reste] = await attendre(synchroniser());
await attendreQue(() => enTete(a9) === attendue && a9.repondu === true);
verifier(reste === 0 && sim.tables.fuites.some((f) => f.id === F3) && sim.sansJeton.length === sansJeton9 + 1,
  'retour normal : la fuite saisie hors ligne part, liste rechargée du serveur, aucune autre requête sans jeton valide');

console.log('10. Jeton expiré tablette en veille, sans réseau : « Quitter » au réveil');
changerEtat('background');
sim.reseau = false;
mettreEnVeille(2 * 3600 * 1000);
const requetes10 = sim.journal.length;
changerEtat('active');
await promesses();
verifier(a9.etat().aRenouveler, 'retour au premier plan : jeton à renouveler aussitôt (minuteur en retard pendant la veille)');
[repondu9, lecture9] = await lireAvant();
verifier(repondu9 === false && lecture9 < 1 && sim.journal.length === requetes10,
  `mise à jour de la Liste au retour au premier plan : rien ne part, « Hors ligne » en ${lecture9} s`);
const [seulQuitter, attenteQuitter] = await attendre(supabase.auth.signOut());
verifier(seulQuitter.error && (await stockee())?.user.id === UID && attenteQuitter >= 10,
  `auth-js seul : signOut() rend une erreur au bout de ${attenteQuitter} s, sans rien effacer (l'attente de « Quitter » avant ce correctif)`);
const [, quitter10] = await attendre(fermerSession(false));
a9.etats.push({ session: null, aRenouveler: false });
verifier(quitter10 < 1 && (await stockee()) === null, `« Quitter » (même lancé avec l'état d'avant) : session retirée en ${quitter10} s, écran Connexion`);
await avancer(5 * 60 * 1000);
verifier(evenements.at(-1) === 'SIGNED_OUT:aucune' && a9.etat().session === null && (await stockee()) === null,
  'SIGNED_OUT ; la session ne revient pas', evenements.slice(-3));
a9.arreter();

verifier(sim.sansJeton.join() === 'fuites:insert:expire,v_fuites:select:anonyme' && avertissements.every((a) => /AuthRetryableFetchError|Network request failed|Invalid Refresh Token/.test(a)),
  'hors l\'envoi de la section 4 et la lecture « auth-js seul » de la section 9, aucune requête de données partie sans jeton valide ; avertissements d\'auth-js attendus seulement',
  { sansJeton: sim.sansJeton, avertissements });
console.log(`\n${ok} vérifications réussies, ${ko} en échec`);
process.exit(ko ? 1 : 0);

// Serveur Supabase simulé pour les essais SANS pile locale, derrière `globalThis.fetch` (le fetch de la tablette) :
//  * /auth/v1 : renouvellement du jeton (rotation ; jeton de renouvellement inconnu ou révoqué → refus 400),
//    déconnexion ;
//  * /rest/v1 et /storage/v1 : tables en mémoire. Sans jeton valide, refus comme par la base : clé anonyme (supabase-js
//    sans session) → aucun privilège (42501) ; jeton expiré → 401 « JWT expired » (PGRST303). Puis les règles de la base
//    utiles à la file d'attente (mêmes codes et messages) :
//  * identifiant déjà pris → 23505 ; réparation absente → 23503 ;
//  * droit « interventions / modifier » = 'non' → la règle RLS ne laisse voir aucune ligne (0 ligne, sans erreur) ;
//  * portée « siennes » sur une ligne saisie par un autre → « Modification non autorisée » (42501) ;
//  * retrait (supprime_le) sans droit « supprimer » → « Suppression non autorisée » (42501) ;
//  * fuite verrouillée → « Fuite verrouillée : modification réservée au responsable » (42501).
// Chargé avant le client (mocks/supabase-simule.js) : un essai peut régler le réseau et la session de la tablette
// avant le démarrage du client.
import fs from 'node:fs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TABLES = ['fuites', 'reparations', 'refections', 'reparation_pieces', 'reparation_ouvriers', 'photos', 'profils', 'marches', 'droits', 'v_fuites'];
const INTERVENTIONS = ['reparations', 'refections', 'reparation_pieces', 'reparation_ouvriers'];
// Clé de la session dans le stockage de la tablette (CLE_SESSION de src/supabase.ts, pour l'adresse de l'essai).
export const CLE_SESSION = `sb-${new URL(process.env.EXPO_PUBLIC_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
let numeroSession = 0;

export const simulation = {
  tables: Object.fromEntries(TABLES.map((t) => [t, []])),
  fichiers: new Set(),
  journal: [], // « table:operation » de chaque requête de données acceptée, dans l'ordre
  sansJeton: [], // requêtes de données arrivées sans jeton valide : « table:operation:anonyme|expire »
  auth: [], // requêtes envoyées à /auth/v1, arrivées ou non (réseau) : « token », « logout »
  reseau: true,
  coupureDans: null, // nombre de requêtes acceptées avant la coupure (coupure en plein envoi)
  sansReponseDans: null, // nombre de requêtes servies avant celle qui n'aura jamais de réponse (connexion 4G morte)
  sansReponse: 0, // requêtes en attente d'une réponse qui ne viendra pas
  lenteur: 0, // ms avant la réponse de chaque requête de données (horloge de l'essai)
  authEnPanne: false, // /auth/v1 injoignable alors que l'API répond
  lenteurAuth: 0, // ms avant la réponse de /auth/v1 (réseau lent ; horloge de l'essai)
  utilisateur: 'chef',
  droits: { modifier: 'siennes', supprimer: 'non' },
  verrouillees: new Set(),
  jetons: new Map(), // jeton d'accès → { uid, expires_at }
  renouvellements: new Map(), // jeton de renouvellement valide → uid (retiré à la rotation et à la déconnexion)
  remettre() {
    for (const t of TABLES) this.tables[t] = [];
    this.fichiers.clear();
    this.journal = [];
    this.sansJeton = [];
    this.reseau = true;
    this.coupureDans = null;
    this.sansReponseDans = null;
    this.lenteur = 0;
    this.authEnPanne = false;
    this.lenteurAuth = 0;
    this.verrouillees.clear();
  },
  /** Session ouverte par le serveur ; `duree` en secondes (négative : jeton d'accès déjà expiré). */
  session(uid = this.utilisateur, duree = 3600) {
    const n = ++numeroSession;
    const s = {
      access_token: `jeton-${n}`, token_type: 'bearer', expires_in: duree, expires_at: Math.floor(Date.now() / 1000) + duree,
      refresh_token: `renouvellement-${n}`, user: { id: uid, aud: 'authenticated', role: 'authenticated', email: `${uid}@agents.stepag.ma` },
    };
    this.jetons.set(s.access_token, { uid, expires_at: s.expires_at });
    this.renouvellements.set(s.refresh_token, uid);
    return s;
  },
  /** Agent connecté sur la tablette : session gardée par auth-js dans le stockage (`duree` comme pour `session`). */
  async connecter(uid = this.utilisateur, duree = 3600) {
    const s = this.session(uid, duree);
    await AsyncStorage.setItem(CLE_SESSION, JSON.stringify(s));
    return s;
  },
};

const refus = (message, code = '42501') => ({ data: null, error: { code, message } });

function reseauOk() {
  if (simulation.coupureDans != null) {
    if (simulation.coupureDans <= 0) simulation.reseau = false;
    else simulation.coupureDans -= 1;
  }
  return simulation.reseau;
}

function fuiteDe(table, ligne) {
  if (table === 'reparation_pieces' || table === 'reparation_ouvriers') {
    return simulation.tables.reparations.find((r) => r.id === ligne.reparation_id)?.fuite_id;
  }
  return table === 'fuites' ? ligne.id : ligne.fuite_id;
}
const verrouillee = (table, ligne) => table !== 'fuites' && simulation.verrouillees.has(fuiteDe(table, ligne));
const MSG_VERROU = 'Fuite verrouillée : modification réservée au responsable';
const permis = (portee, ligne) => portee === 'toutes' || (portee === 'siennes' && ligne.saisi_par === simulation.utilisateur);

function inserer(table, valeur) {
  const lignes = Array.isArray(valeur) ? valeur : [valeur];
  const t = simulation.tables[table];
  for (const v of lignes) {
    const ligne = { id: v.id ?? crypto.randomUUID(), saisi_par: simulation.utilisateur, supprime_le: null, ...v };
    if (t.some((x) => x.id === ligne.id)) return refus('duplicate key value violates unique constraint', '23505');
    if (table === 'reparation_ouvriers' && t.some((x) => x.reparation_id === ligne.reparation_id && x.ouvrier_id === ligne.ouvrier_id)) {
      return refus('duplicate key value violates unique constraint', '23505');
    }
    if (ligne.reparation_id && !simulation.tables.reparations.some((r) => r.id === ligne.reparation_id)) {
      return refus('insert or update violates foreign key constraint', '23503');
    }
    if (verrouillee(table, ligne)) return refus(MSG_VERROU);
    t.push(ligne);
  }
  return { data: null, error: null };
}

function modifier(table, cibles, valeur, retour) {
  if (INTERVENTIONS.includes(table) && simulation.droits.modifier === 'non' && simulation.droits.supprimer === 'non') {
    return { data: retour ? [] : null, error: null }; // règle RLS : aucune ligne visible pour la mise à jour
  }
  for (const ligne of cibles) {
    if (verrouillee(table, ligne)) return refus(MSG_VERROU);
    const { supprime_le: retrait, ...donnees } = valeur;
    if ('supprime_le' in valeur && retrait !== ligne.supprime_le && !permis(simulation.droits.supprimer, ligne)) {
      return refus('Suppression non autorisée');
    }
    const change = Object.entries(donnees).some(([k, v]) => ligne[k] !== v);
    if (change && !permis(simulation.droits.modifier, ligne)) return refus('Modification non autorisée');
  }
  for (const ligne of cibles) Object.assign(ligne, valeur);
  return { data: retour ? cibles.map((l) => ({ id: l.id })) : null, error: null };
}

function supprimer(table, cibles) {
  if (simulation.droits.modifier === 'non') return { data: null, error: null };
  for (const ligne of cibles) if (verrouillee(table, ligne)) return refus(MSG_VERROU);
  simulation.tables[table] = simulation.tables[table].filter((l) => !cibles.includes(l));
  return { data: null, error: null };
}

/** Requête de l'API (construite par mocks/supabase-simule.js : table, opération, filtres, valeur), jouée sur les tables. */
function traiter(r) {
  simulation.journal.push(`${r.table}:${r.operation}`);
  const cibles = simulation.tables[r.table].filter((l) => r.filtres.every((f) => f(l)));
  if (r.operation === 'insert') return inserer(r.table, r.valeur);
  if (r.operation === 'update') return modifier(r.table, cibles, r.valeur, r.retour);
  if (r.operation === 'delete') return supprimer(r.table, cibles);
  return { data: r.unique ? cibles[0] ?? null : cibles, error: null };
}

/** Requêtes de l'API en route vers le serveur, par numéro (en-tête x-requete). */
export const enVol = new Map();

const json = (corps, status = 200, entetes = {}) =>
  new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json', ...entetes } });

// Jeton de la requête : celui d'une session ouverte et pas encore expirée, sinon la clé anonyme ou un jeton expiré.
function jetonDe(init) {
  const s = simulation.jetons.get(new Headers(init.headers).get('authorization')?.replace(/^Bearer /, ''));
  if (!s) return 'anonyme';
  return s.expires_at * 1000 <= Date.now() ? 'expire' : 'valide';
}

// Le serveur simulé répond aussitôt, sauf à la requête « sans réponse » : rien ne revient, seul l'abandon par le délai
// de l'appli la fait tomber (même erreur que le fetch de l'APK, expo/fetch).
function sansReponse(init) {
  if (simulation.sansReponseDans == null) return Promise.resolve();
  if (simulation.sansReponseDans > 0) {
    simulation.sansReponseDans -= 1;
    return Promise.resolve();
  }
  simulation.sansReponseDans = null;
  simulation.sansReponse += 1;
  return new Promise((_, ko) => init?.signal?.addEventListener('abort', () => {
    simulation.sansReponse -= 1;
    ko(new Error('fetch failed: Fetch request has been canceled'));
  }));
}

async function serveurAuth(chemin, parametres, init) {
  simulation.auth.push(chemin.slice('/auth/v1/'.length));
  if (!simulation.reseau || simulation.authEnPanne) throw new TypeError('Network request failed');
  if (simulation.lenteurAuth) await new Promise((ok) => setTimeout(ok, simulation.lenteurAuth));
  if (chemin === '/auth/v1/token' && parametres.get('grant_type') === 'refresh_token') {
    const ancien = JSON.parse(init.body).refresh_token;
    const uid = simulation.renouvellements.get(ancien);
    if (!uid) {
      return json({ code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' }, 400,
        { 'x-supabase-api-version': '2024-01-01' });
    }
    simulation.renouvellements.delete(ancien); // rotation : l'ancien jeton de renouvellement ne sert plus
    return json(simulation.session(uid));
  }
  if (chemin === '/auth/v1/logout') {
    const uid = simulation.jetons.get(new Headers(init.headers).get('authorization')?.replace(/^Bearer /, ''))?.uid;
    for (const [r, u] of simulation.renouvellements) if (u === uid) simulation.renouvellements.delete(r);
    return new Response(null, { status: 204 });
  }
  return json({ code: 'not_found', message: `${chemin} : absent de l'essai` }, 404);
}

globalThis.fetch = async (entree, init = {}) => {
  const adresse = String(entree?.url ?? entree);
  // photos.ts lit la photo gardée sur la tablette par fetch(file://…)
  if (adresse.startsWith('file://')) return new Response(fs.readFileSync(adresse.slice('file://'.length)));
  const { pathname, searchParams } = new URL(adresse);
  if (pathname.startsWith('/auth/v1/')) return serveurAuth(pathname, searchParams, init);
  await sansReponse(init);
  if (simulation.lenteur) await new Promise((ok) => setTimeout(ok, simulation.lenteur));
  if (!reseauOk()) throw new TypeError('Network request failed');
  const jeton = jetonDe(init);
  // Fonction serveur photos-r2 sans secrets R2 : 503 « r2_non_configure » (la tablette retombe sur Supabase Storage).
  if (pathname === '/functions/v1/photos-r2') {
    if (jeton !== 'valide') {
      simulation.sansJeton.push(`fonction:photos-r2:${jeton}`);
      return json({ erreur: 'Session invalide', code: 'non_authentifie' }, 401);
    }
    simulation.journal.push('fonction:photos-r2');
    return json({ erreur: 'Stockage R2 non configuré', code: 'r2_non_configure' }, 503);
  }
  if (pathname.startsWith('/storage/v1/object/photos/')) {
    if (jeton !== 'valide') {
      simulation.sansJeton.push(`stockage:upload:${jeton}`);
      return json({ data: null, error: { statusCode: '403', message: jeton === 'expire' ? 'jwt expired' : 'new row violates row-level security policy' } });
    }
    simulation.journal.push('stockage:upload');
    const chemin = decodeURIComponent(pathname.slice('/storage/v1/object/photos/'.length));
    if (simulation.fichiers.has(chemin)) return json({ data: null, error: { statusCode: '409', message: 'The resource already exists' } });
    simulation.fichiers.add(chemin);
    return json({ data: { path: chemin }, error: null });
  }
  const requete = enVol.get(new Headers(init.headers).get('x-requete'));
  if (!requete) return json({ code: 'PGRST000', message: `${adresse} : absent de l'essai` }, 404);
  if (jeton !== 'valide') {
    simulation.sansJeton.push(`${requete.table}:${requete.operation}:${jeton}`);
    return json(jeton === 'expire' ? refus('JWT expired', 'PGRST303') : refus(`permission denied for table ${requete.table}`));
  }
  return json(traiter(requete));
};

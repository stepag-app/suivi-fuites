// Session et contexte de la tablette (session.tsx), sans dépendance d'affichage : essayés sans pile, avec le vrai
// client Supabase (essais/session-hors-ligne.test.mjs).
//
// Démarrage sans réseau avec un jeton expiré (plus d'une heure) : auth-js garde la session en stockage, mais
// `getSession()` ne la rend qu'après avoir tenté de renouveler le jeton, soit près de 25 s de reprises sans réseau (44 s
// sur l'émulateur, DNS en panne), pour rendre ensuite `null` (`__loadSession` d'auth-js) ; l'événement INITIAL_SESSION
// arrive lui aussi sans session. La session gardée est donc rendue au bout de DELAI_DEPART_MS : l'appli s'ouvre sur les
// copies de la tablette (contexte, liste) et le jeton est renouvelé au retour du réseau (minuteur d'auth-js toutes les
// 30 s, retour au premier plan : supabase.ts). Seuls « Quitter » et un renouvellement refusé par le serveur ferment la
// session.
//
// Pendant l'utilisation, de même : sans réseau, le jeton n'est plus renouvelé (le minuteur d'auth-js échoue sans
// événement). Dès qu'il entre dans la marge d'auth-js, chaque requête attendrait les reprises (près de 25 s, à chaque
// fenêtre de reprises), puis partirait avec la clé anonyme ; « Quitter » aussi attendrait. `suivreSession` le passe
// donc à renouveler à ce moment-là (minuteur, et retour au premier plan : les minuteurs ne tournent pas tablette en
// veille), jusqu'au renouvellement (TOKEN_REFRESHED).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { CLE_SESSION, supabase } from './supabase';
import type { Droit, Marche, Profil } from './types';

/**
 * `aRenouveler` : jeton expiré (ou sur le point de l'être) que le réseau n'a pas encore permis de renouveler. Aucune
 * requête ne part avec cette session : elle attendrait les reprises d'auth-js, puis supabase-js enverrait la clé
 * anonyme, sans aucun droit, jusqu'au renouvellement (TOKEN_REFRESHED).
 */
export interface EtatSession { session: Session | null; aRenouveler: boolean }

/** Attente maximale du renouvellement du jeton au démarrage ; au-delà, l'appli s'ouvre sur la session gardée. */
export const DELAI_DEPART_MS = 1500;
// Marge d'auth-js (EXPIRY_MARGIN_MS) : un jeton qui expire dans moins de 90 s est renouvelé avant d'être rendu.
const MARGE_AUTH_MS = 90 * 1000;
const aRenouvelerBientot = (s: Session) => (s.expires_at ?? 0) * 1000 - Date.now() < MARGE_AUTH_MS;

/** Session gardée par auth-js sur la tablette, telle quelle (jeton d'accès éventuellement expiré). */
export async function sessionStockee(): Promise<Session | null> {
  try {
    const s = JSON.parse((await AsyncStorage.getItem(CLE_SESSION)) ?? 'null') as Session | null;
    return s?.access_token && s.refresh_token && s.expires_at && s.user?.id ? s : null;
  } catch {
    return null;
  }
}

/** Réponse de `getSession()` (renouvellement compris). */
async function sessionLue(): Promise<EtatSession> {
  const { data, error } = await supabase.auth.getSession();
  if (data.session) return { session: data.session, aRenouveler: false };
  // Sans erreur : pas de session. Renouvellement refusé par le serveur : auth-js l'a déjà effacée.
  if (!isAuthRetryableFetchError(error)) return { session: null, aRenouveler: false };
  // Renouvellement impossible faute de réseau (ou serveur injoignable) : la session reste en stockage.
  const session = await sessionStockee();
  return { session, aRenouveler: !!session && (session.expires_at ?? 0) * 1000 <= Date.now() };
}

/**
 * Session au démarrage de l'appli. Jeton valide : rendu aussitôt. Jeton expiré ou presque : auth-js le renouvelle
 * d'abord ; passé DELAI_DEPART_MS (pas de réseau, ou réseau lent), la session gardée est rendue, jeton à renouveler.
 * La suite vient des événements d'auth-js (suivreSession) : TOKEN_REFRESHED, ou SIGNED_OUT si le serveur refuse.
 */
export async function sessionDeDepart(): Promise<EtatSession> {
  const gardee = await sessionStockee();
  const lue = sessionLue();
  if (!gardee || !aRenouvelerBientot(gardee)) return lue;
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const delai = new Promise<null>((fin) => {
    minuteur = setTimeout(() => fin(null), DELAI_DEPART_MS);
  });
  const premiere = await Promise.race([lue, delai]);
  clearTimeout(minuteur);
  if (premiere) return premiere;
  // Relue : « Quitter », un refus du serveur ou un renouvellement a pu la changer entre-temps.
  const session = await sessionStockee();
  return { session, aRenouveler: !!session && aRenouvelerBientot(session) };
}

// Dernier état rendu par suivreSession (null hors suivi).
let courant: EtatSession | null = null;

/**
 * Jeton de la session suivie à renouveler, à l'instant même. Pour une requête lancée avec un état d'écran pas encore
 * mis à jour (retour au premier plan, minuteur d'un écran) : elle ne part pas plus que si l'écran le savait déjà.
 */
export function jetonARenouveler(): boolean {
  const s = courant?.session;
  return !!s && (courant!.aRenouveler || aRenouvelerBientot(s));
}

/**
 * Suit la session de la tablette : état de départ, puis chaque changement (connexion, renouvellement, déconnexion, jeton
 * à renouveler en cours d'utilisation). Renvoie la fonction qui arrête le suivi.
 */
export function suivreSession(changer: (etat: EtatSession) => void): () => void {
  let suivi = true;
  // Un événement d'auth-js est plus récent que l'état de départ : celui-ci, s'il arrive après, ne l'écrase pas.
  let tranche = false;
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  let dernier: EtatSession | null = null;
  const publier = (etat: EtatSession) => {
    courant = dernier = etat;
    changer(etat);
    surveiller();
  };
  // Jeton qui entre dans la marge d'auth-js sans avoir été renouvelé : à renouveler. Un renouvellement réussi arrive
  // avant (le minuteur d'auth-js essaie dès 120 s de l'échéance) et réarme la surveillance sur le nouveau jeton ;
  // TOKEN_REFRESHED, s'il vient après, rend la session normale.
  function surveiller() {
    clearTimeout(minuteur);
    const s = courant?.session;
    if (!suivi || !s || courant!.aRenouveler) return;
    const reste = (s.expires_at ?? 0) * 1000 - MARGE_AUTH_MS - Date.now();
    if (reste > 0) minuteur = setTimeout(surveiller, reste);
    else publier({ session: s, aRenouveler: true });
  }
  const { data } = supabase.auth.onAuthStateChange((evenement, session) => {
    if (session) {
      tranche = true;
      publier({ session, aRenouveler: false });
    }
    // Quitter, ou renouvellement refusé par le serveur (jeton révoqué) : session vraiment fermée. INITIAL_SESSION sans
    // session n'en dit rien : auth-js l'envoie aussi quand le jeton n'a pas pu être renouvelé faute de réseau.
    else if (evenement === 'SIGNED_OUT') {
      tranche = true;
      publier({ session: null, aRenouveler: false });
    }
  });
  // Tablette en veille, les minuteurs ne tournent pas : contrôle au retour au premier plan.
  const premierPlan = AppState.addEventListener('change', (etat) => etat === 'active' && surveiller());
  sessionDeDepart()
    .catch((): EtatSession => ({ session: null, aRenouveler: false }))
    .then((etat) => suivi && !tranche && publier(etat));
  return () => {
    suivi = false;
    clearTimeout(minuteur);
    if (courant === dernier) courant = null;
    premierPlan.remove();
    data.subscription.unsubscribe();
  };
}

export const cleContexte = (id: string) => `suivi-fuites:contexte:${id}`;
export interface Contexte { profil: Profil | null; marches: Marche[]; droits: Droit[] }

/** Dernière copie du profil, des marchés et des droits gardée sur la tablette. */
export async function contexteGarde(uid: string): Promise<Contexte | null> {
  try {
    return JSON.parse((await AsyncStorage.getItem(cleContexte(uid))) ?? 'null') as Contexte | null;
  } catch {
    return null;
  }
}

/** Contexte du serveur, gardé ensuite sur la tablette ; null sans réponse. 'inactif' : compte désactivé. */
export async function contexteServeur(uid: string): Promise<Contexte | 'inactif' | null> {
  const [p, m, d] = await Promise.all([
    supabase.from('profils').select('id, identifiant, nom_complet, est_admin, actif').eq('id', uid).maybeSingle(),
    // Le marché commencé le plus récemment d'abord (un marché de démonstration passe après).
    supabase.from('marches').select('*').order('date_commencement', { ascending: false, nullsFirst: false }).order('code'),
    supabase.from('droits').select('marche_id, type_donnee, lire, creer, modifier, supprimer, valider').eq('profil_id', uid),
  ]);
  if (p.error || m.error || d.error) return null;
  const profil = p.data as Profil | null;
  if (profil && !profil.actif) return 'inactif';
  const contexte: Contexte = { profil, marches: (m.data as Marche[]) ?? [], droits: (d.data as Droit[]) ?? [] };
  await AsyncStorage.setItem(cleContexte(uid), JSON.stringify(contexte)).catch(() => undefined);
  return contexte;
}

/**
 * Profil, marchés et droits de l'agent : `afficher` reçoit d'abord la copie gardée sur la tablette (l'appli s'ouvre
 * sans attendre le réseau), puis la réponse du serveur. Jeton à renouveler : copie seulement (le contexte est rechargé
 * après le renouvellement : session.tsx). Renvoie 'inactif' si l'administrateur a désactivé le compte.
 */
export async function chargerContexte(uid: string, aRenouveler: boolean, afficher: (contexte: Contexte) => void) {
  const copie = await contexteGarde(uid);
  if (copie) afficher(copie);
  if (aRenouveler || jetonARenouveler()) return;
  const serveur = await contexteServeur(uid);
  if (serveur === 'inactif') return serveur;
  if (serveur) afficher(serveur);
}

/**
 * « Quitter ». Jeton à renouveler (hors ligne, au démarrage ou en cours d'utilisation) : `signOut` d'auth-js
 * tenterait d'abord un renouvellement (près de 25 s sans réseau), puis rendrait une erreur sans rien effacer. La session
 * est alors retirée de la tablette sans appel au serveur : son jeton de renouvellement n'est pas révoqué, mais la
 * tablette ne le garde plus. L'événement SIGNED_OUT suit, mais pas tout de suite pendant les reprises d'auth-js :
 * l'appelant ferme la session lui-même.
 */
export async function fermerSession(aRenouveler: boolean) {
  if (!aRenouveler && !jetonARenouveler() && !(await supabase.auth.signOut()).error) return;
  await AsyncStorage.removeItem(CLE_SESSION);
  // Stockage vide : auth-js ferme la session sur la tablette seulement (événement SIGNED_OUT).
  void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
}

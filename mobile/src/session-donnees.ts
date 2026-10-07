// Session et contexte de la tablette (session.tsx), sans dépendance d'affichage : essayés sans pile, avec le vrai
// client Supabase (essais/session-hors-ligne.test.mjs).
//
// Démarrage sans réseau avec un jeton expiré (plus d'une heure) : auth-js garde la session en stockage, mais
// `getSession()` ne la rend pas tant que le renouvellement échoue (`__loadSession` d'auth-js), et l'événement
// INITIAL_SESSION arrive sans session. La session est alors relue ici : l'appli s'ouvre sur le dernier contexte connu
// (liste hors ligne) et le jeton est renouvelé au retour du réseau (minuteur d'auth-js toutes les 30 s, retour au
// premier plan : supabase.ts). Seuls « Quitter » et un renouvellement refusé par le serveur ferment la session.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { CLE_SESSION, supabase } from './supabase';
import type { Droit, Marche, Profil } from './types';

/**
 * `aRenouveler` : jeton expiré que le réseau n'a pas encore permis de renouveler. Aucune requête ne part avec cette
 * session : supabase-js enverrait la clé anonyme, sans aucun droit, jusqu'au renouvellement (TOKEN_REFRESHED).
 */
export interface EtatSession { session: Session | null; aRenouveler: boolean }

/** Session gardée par auth-js sur la tablette, telle quelle (jeton d'accès éventuellement expiré). */
export async function sessionStockee(): Promise<Session | null> {
  try {
    const s = JSON.parse((await AsyncStorage.getItem(CLE_SESSION)) ?? 'null') as Session | null;
    return s?.access_token && s.refresh_token && s.expires_at && s.user?.id ? s : null;
  } catch {
    return null;
  }
}

/** Session au démarrage de l'appli. */
export async function sessionDeDepart(): Promise<EtatSession> {
  const { data, error } = await supabase.auth.getSession();
  if (data.session) return { session: data.session, aRenouveler: false };
  // Sans erreur : pas de session. Renouvellement refusé par le serveur : auth-js l'a déjà effacée.
  if (!isAuthRetryableFetchError(error)) return { session: null, aRenouveler: false };
  // Renouvellement impossible faute de réseau (ou serveur injoignable) : la session reste en stockage.
  const session = await sessionStockee();
  return { session, aRenouveler: !!session && (session.expires_at ?? 0) * 1000 <= Date.now() };
}

/**
 * Suit la session de la tablette : état de départ, puis chaque changement (connexion, renouvellement, déconnexion).
 * Renvoie la fonction qui arrête le suivi.
 */
export function suivreSession(changer: (etat: EtatSession) => void): () => void {
  let suivi = true;
  const { data } = supabase.auth.onAuthStateChange((evenement, session) => {
    if (session) changer({ session, aRenouveler: false });
    // Quitter, ou renouvellement refusé par le serveur (jeton révoqué) : session vraiment fermée. INITIAL_SESSION sans
    // session n'en dit rien : auth-js l'envoie aussi quand le jeton n'a pas pu être renouvelé faute de réseau.
    else if (evenement === 'SIGNED_OUT') changer({ session: null, aRenouveler: false });
  });
  sessionDeDepart()
    .catch((): EtatSession => ({ session: null, aRenouveler: false }))
    .then((etat) => suivi && changer(etat));
  return () => {
    suivi = false;
    data.subscription.unsubscribe();
  };
}

export const cleContexte = (id: string) => `suivi-fuites:contexte:${id}`;
export interface Contexte { profil: Profil | null; marches: Marche[]; droits: Droit[] }

/**
 * Profil, marchés et droits de l'agent : du serveur, sinon (sans réseau) la dernière copie gardée sur la tablette.
 * `serveur` faux (jeton à renouveler) : copie seulement, les requêtes partiraient sans jeton valide.
 * 'inactif' : compte désactivé par l'administrateur.
 */
export async function chargerContexte(uid: string, serveur: boolean): Promise<Contexte | 'inactif' | null> {
  if (serveur) {
    const [p, m, d] = await Promise.all([
      supabase.from('profils').select('id, identifiant, nom_complet, est_admin, actif').eq('id', uid).maybeSingle(),
      // Le marché commencé le plus récemment d'abord (un marché de démonstration passe après).
      supabase.from('marches').select('*').order('date_commencement', { ascending: false, nullsFirst: false }).order('code'),
      supabase.from('droits').select('marche_id, type_donnee, lire, creer, modifier, supprimer, valider').eq('profil_id', uid),
    ]);
    if (!p.error && !m.error && !d.error) {
      const profil = p.data as Profil | null;
      if (profil && !profil.actif) return 'inactif';
      const contexte: Contexte = { profil, marches: (m.data as Marche[]) ?? [], droits: (d.data as Droit[]) ?? [] };
      await AsyncStorage.setItem(cleContexte(uid), JSON.stringify(contexte)).catch(() => undefined);
      return contexte;
    }
  }
  try {
    return JSON.parse((await AsyncStorage.getItem(cleContexte(uid))) ?? 'null') as Contexte | null;
  } catch {
    return null;
  }
}

/**
 * « Quitter ». Jeton à renouveler (hors ligne) : `signOut` d'auth-js tenterait d'abord un renouvellement (près de 25 s
 * sans réseau), puis rendrait une erreur sans rien effacer. La session est alors retirée de la tablette sans appel au
 * serveur : son jeton de renouvellement n'est pas révoqué, mais la tablette ne le garde plus.
 */
export async function fermerSession(aRenouveler: boolean) {
  if (!aRenouveler && !(await supabase.auth.signOut()).error) return;
  await AsyncStorage.removeItem(CLE_SESSION);
  // Stockage vide : auth-js ferme la session sur la tablette seulement (événement SIGNED_OUT).
  await supabase.auth.signOut({ scope: 'local' });
}

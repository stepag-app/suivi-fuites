// « Mes chiffres » et « À faire » de l'agent (demande d'Issam du 2026-10-15), sans dépendance d'affichage
// (essais/tableau.test.mjs) : chiffres du compte et actions qui l'attendent sur le marché choisi (fonctions
// mes_chiffres et mes_actions de la base), copie gardée sur la tablette par compte et par marché, affichée sans réseau.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';

export type Periode = 'jour' | 'semaine' | 'mois';
export interface Roles { detection: boolean; reparation: boolean; refection: boolean }

export interface ChiffresPeriode {
  du: string; au: string; detectees: number; deja_reparees: number; balaye_m: number; reparees: number;
  reparees_dans_delai: number; refections: number; refections_dans_delai: number; refections_delai_connu: number;
}
export interface Chiffres {
  maj: string; roles: Roles;
  delais: { reparation_h: number; refection_chaussee_j: number; refection_trottoir_j: number };
  periodes: Record<Periode, ChiffresPeriode>;
  marche: { a_redetecter: number; a_reparer: number; a_refectionner: number };
}

export type TypeAction =
  | 'corriger_detection' | 'redetection' | 'photo' | 'corriger_reparation' | 'reparation' | 'finir_reparation'
  | 'corriger_refection' | 'refection';
export interface Action {
  type: TypeAction; fuite_id: string; numero_affiche: string | null; adresse: string | null; secteur: string | null;
  latitude: number | null; longitude: number | null; urgent: boolean; depuis: string | null; motif: string | null;
  emplacement: string | null;
}
export interface Actions { maj: string; liste: Action[] }

/** Filtres de l'écran « À faire », dans l'ordre affiché ; « corriger » regroupe les étapes renvoyées. */
export type Filtre = 'toutes' | 'corriger' | 'redetection' | 'photo' | 'reparation' | 'refection';
export const familleDe = (type: TypeAction): Exclude<Filtre, 'toutes'> =>
  type.startsWith('corriger_') ? 'corriger' : type === 'finir_reparation' ? 'reparation' : (type as Exclude<Filtre, 'toutes' | 'corriger'>);

/** Filtres des rôles du compte (« Toutes » et « À corriger » pour tous), avec le nombre d'actions de chacun. */
export function filtresDe(liste: Action[], roles: Roles): { cle: Filtre; nb: number }[] {
  const cles: Filtre[] = ['toutes', 'corriger'];
  if (roles.detection) cles.push('redetection', 'photo');
  if (roles.reparation) cles.push('reparation');
  if (roles.refection) cles.push('refection');
  return cles.map((cle) => ({ cle, nb: cle === 'toutes' ? liste.length : liste.filter((a) => familleDe(a.type) === cle).length }));
}

/** Pastille du bouton « À faire » : nombre d'actions, rouge s'il y en a une urgente. */
export const resumeActions = (liste: Action[]) => ({ total: liste.length, urgentes: liste.filter((a) => a.urgent).length });

/** « 45 min », « 20 h », « 3 j » depuis `depuis` ; unités traduites par l'écran. */
export function duree(depuis: string | null, maintenant: number): { n: number; unite: 'min' | 'h' | 'j' } | null {
  if (!depuis) return null;
  const min = Math.max(0, Math.floor((maintenant - Date.parse(depuis)) / 60000));
  if (min < 60) return { n: min, unite: 'min' };
  if (min < 48 * 60) return { n: Math.floor(min / 60), unite: 'h' };
  return { n: Math.floor(min / 1440), unite: 'j' };
}

/** « 850 m », « 12,4 km ». */
export const longueur = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

/** Part dans le délai, arrondie ; null sans dénominateur. */
export const pourcentage = (n: number, sur: number) => (sur > 0 ? Math.round((100 * n) / sur) : null);

export const cleChiffres = (uid: string, marcheId: string) => `suivi-fuites:chiffres:${uid}:${marcheId}`;
export const cleActions = (uid: string, marcheId: string) => `suivi-fuites:actions:${uid}:${marcheId}`;

/** Appel d'une fonction de la base, abandonné sans réponse dans `delaiMs` (jeton attendu par supabase-js compris). */
function appeler<T>(fonction: 'mes_chiffres' | 'mes_actions', marcheId: string, delaiMs: number): Promise<{ data: T | null } | null> {
  const controleur = new AbortController();
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const abandon = new Promise<null>((fin) => {
    minuteur = setTimeout(() => {
      controleur.abort();
      fin(null);
    }, delaiMs);
  });
  const requete = supabase.rpc(fonction, { p_marche: marcheId }).abortSignal(controleur.signal)
    .then(({ data, error }) => (error ? null : { data: (data ?? null) as T | null }));
  return Promise.race([requete, abandon]).finally(() => clearTimeout(minuteur));
}

async function chargerDonnees<T>(cle: string, lire: () => Promise<{ data: T | null } | null>, o: {
  copie: boolean; aRenouveler: boolean; afficher: (donnees: T | null) => void;
}): Promise<boolean> {
  if (o.copie) {
    const gardee = await AsyncStorage.getItem(cle).catch(() => null);
    if (gardee) o.afficher(JSON.parse(gardee) as T);
  }
  if (o.aRenouveler || jetonARenouveler()) return false;
  const reponse = await lire();
  if (!reponse) return false;
  o.afficher(reponse.data);
  await AsyncStorage.setItem(cle, JSON.stringify(reponse.data)).catch(() => undefined);
  return true;
}

/**
 * Chiffres du compte sur le marché : `copie` affiche d'abord ceux gardés sur la tablette, puis ceux du serveur.
 * Renvoie faux sans réponse (hors ligne). null : marché hors de portée du compte.
 */
export const chargerChiffres = (uid: string, marcheId: string, o: {
  copie: boolean; aRenouveler: boolean; delaiMs: number; afficher: (c: Chiffres | null) => void;
}) => chargerDonnees<Chiffres>(cleChiffres(uid, marcheId), () => appeler<Chiffres>('mes_chiffres', marcheId, o.delaiMs), o);

/** Actions du compte sur le marché, déjà triées par la base (urgentes, puis les plus anciennes). */
export const chargerActions = (uid: string, marcheId: string, o: {
  copie: boolean; aRenouveler: boolean; delaiMs: number; afficher: (a: Actions) => void;
}) => chargerDonnees<Actions>(
  cleActions(uid, marcheId),
  async () => {
    const r = await appeler<Action[]>('mes_actions', marcheId, o.delaiMs);
    return r && { data: { maj: new Date().toISOString(), liste: r.data ?? [] } };
  },
  { ...o, afficher: (a) => o.afficher(a ?? { maj: new Date().toISOString(), liste: [] }) },
);

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Domaine technique des adresses des agents : l'identifiant « agent1 » devient
// agent1@agents.stepag.ma (aucun e-mail n'y est jamais envoyé). Une autre société
// règle NEXT_PUBLIC_DOMAINE_AGENTS (même valeur que DOMAINE_AGENTS côté fonction serveur).
export const DOMAINE_AGENTS = process.env.NEXT_PUBLIC_DOMAINE_AGENTS || 'agents.stepag.ma';

// Nom affiché sur l'écran de connexion.
export const NOM_ORGANISATION = process.env.NEXT_PUBLIC_NOM_ORGANISATION || 'STEPAG';

export const emailDepuisIdentifiant = (identifiant: string) =>
  `${identifiant.trim().toLowerCase()}@${DOMAINE_AGENTS}`;

// Mode démonstration (NEXT_PUBLIC_MODE_DEMO=1) : données fictives en mémoire, aucun appel réseau.
export const MODE_DEMO = process.env.NEXT_PUBLIC_MODE_DEMO === '1';

export const configurationManquante = () =>
  !MODE_DEMO && (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

/**
 * Page ouverte dans la WebView de l'APK (route /session, lot S) : l'application de la tablette et cette
 * page partagent le même jeton de rafraîchissement ; seul l'APK le renouvelle (un jeton réutilisé hors de
 * la fenêtre de 10 s de Supabase révoquerait toute la session). L'APK se signale par `window.ReactNativeWebView`
 * et par le suffixe « SuiviFuitesAPK » de son User-Agent.
 */
export const estContexteApk = (
  userAgent: string | null | undefined = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  aReactNativeWebView: boolean = typeof window !== 'undefined' && 'ReactNativeWebView' in window,
) => aReactNativeWebView || /SuiviFuitesAPK/.test(userAgent ?? '');

export function getSupabase(): SupabaseClient {
  if (!client && MODE_DEMO) {
    // Chargé à la demande : le jeu de données ne pèse rien dans l'application réelle.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { creerClientDemo } = require('./demo/client') as typeof import('./demo/client');
    client = creerClientDemo();
  }
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !cle) {
      throw new Error('Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
    }
    client = createClient(url, cle, {
      // Dans l'APK, le rafraîchissement du jeton revient à l'application de la tablette (voir estContexteApk).
      auth: { persistSession: true, autoRefreshToken: !estContexteApk(), detectSessionInUrl: false },
    });
  }
  return client;
}

/** Lignes lues par lireTout ; `tronque` : le plafond est atteint, il reste sans doute des lignes non lues. */
export type Lignes<T> = T[] & { tronque?: boolean };

// L'API de données renvoie au plus 1 000 lignes par requête : lecture page par page.
// `requete(de, a)` fabrique une requête neuve, triée sur une clé stable, limitée à [de, a].
// Après une première page pleine, les suivantes partent `parallele` par `parallele` (3 000 fuites :
// deux allers-retours au lieu de quatre). Plafond atteint : `tronque` vaut true, à signaler à l'écran.
export async function lireTout<T>(
  requete: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  taillePage = 1000,
  maximum = 50000,
  parallele = 3,
): Promise<Lignes<T>> {
  const lire = async (de: number) => {
    const { data, error } = await requete(de, de + taillePage - 1);
    if (error) throw error;
    return data ?? [];
  };
  const tout: Lignes<T> = await lire(0);
  let de = taillePage;
  if (tout.length < taillePage) return tout;
  while (de < maximum) {
    const lots: Promise<T[]>[] = [];
    for (let i = 0; i < parallele && de < maximum; i++, de += taillePage) lots.push(lire(de));
    for (const page of await Promise.all(lots)) {
      tout.push(...page);
      if (page.length < taillePage) return tout;
    }
  }
  tout.tronque = true;
  return tout;
}

/** Fonction absente de la base (migration pas encore déployée) ou mode démonstration (rpc sans résultat). */
export const fonctionAbsente = (error: { code?: string } | null, data: unknown) =>
  (error != null && (error.code === 'PGRST202' || error.code === '42883')) || (error == null && data == null);

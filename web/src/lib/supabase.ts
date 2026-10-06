import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Domaine technique des adresses des agents : l'identifiant « agent1 » devient
// agent1@agents.stepag.ma (aucun e-mail n'y est jamais envoyé). Une autre société
// règle NEXT_PUBLIC_DOMAINE_AGENTS (même valeur que DOMAINE_AGENTS côté fonction serveur).
export const DOMAINE_AGENTS = process.env.NEXT_PUBLIC_DOMAINE_AGENTS || 'agents.stepag.ma';

// Nom affiché sur l'écran de connexion.
export const NOM_ORGANISATION = process.env.NEXT_PUBLIC_NOM_ORGANISATION || 'STEPAG';

export const emailDepuisIdentifiant = (identifiant: string) =>
  `${identifiant.trim().toLowerCase()}@${DOMAINE_AGENTS}`;

export const configurationManquante = () =>
  !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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

// L'API de données renvoie au plus 1 000 lignes par requête : lecture page par page.
// `requete(de, a)` fabrique une requête neuve, triée sur une clé stable, limitée à [de, a].
export async function lireTout<T>(
  requete: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  taillePage = 1000,
  maximum = 50000,
): Promise<T[]> {
  const tout: T[] = [];
  for (let de = 0; de < maximum; de += taillePage) {
    const { data, error } = await requete(de, de + taillePage - 1);
    if (error) throw error;
    tout.push(...(data ?? []));
    if (!data || data.length < taillePage) break;
  }
  return tout;
}

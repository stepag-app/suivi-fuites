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

export function getSupabase(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !cle) {
      throw new Error('Configuration Supabase manquante (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).');
    }
    client = createClient(url, cle, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

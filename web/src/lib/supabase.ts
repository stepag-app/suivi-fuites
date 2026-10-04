import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Domaine technique des adresses des agents : l'identifiant « agent1 » devient
// agent1@agents.stepag.ma (aucun e-mail n'y est jamais envoyé).
export const DOMAINE_AGENTS = 'agents.stepag.ma';

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

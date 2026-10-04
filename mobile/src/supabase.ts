import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Les agents se connectent avec un identifiant ; l'adresse technique n'est jamais utilisée pour écrire.
export const emailDepuisIdentifiant = (identifiant: string) =>
  `${identifiant.trim().toLowerCase()}@agents.stepag.ma`;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const cle = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const configurationManquante = !url || !cle;

export const supabase = createClient(url || 'https://exemple.supabase.co', cle || 'cle-absente', {
  auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

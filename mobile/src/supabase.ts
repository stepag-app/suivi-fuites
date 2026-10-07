import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { fetchAvecDelai } from './reseau';

// Les agents se connectent avec un identifiant ; l'adresse technique n'est jamais utilisée pour écrire.
// Domaine réglable pour une autre société (même valeur que NEXT_PUBLIC_DOMAINE_AGENTS du panneau).
const DOMAINE_AGENTS = process.env.EXPO_PUBLIC_DOMAINE_AGENTS || 'agents.stepag.ma';
export const emailDepuisIdentifiant = (identifiant: string) =>
  `${identifiant.trim().toLowerCase()}@${DOMAINE_AGENTS}`;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const cle = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const configurationManquante = !url || !cle;

const adresse = url || 'https://exemple.supabase.co';
// Session gardée sur la tablette : la clé que supabase-js choisit par défaut (« sb-<projet>-auth-token »), nommée ici
// pour la relire hors ligne (session-donnees.ts). En changer déconnecterait toutes les tablettes.
export const CLE_SESSION = `sb-${new URL(adresse).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(adresse, cle || 'cle-absente', {
  auth: { storage: AsyncStorage, storageKey: CLE_SESSION, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  // Toute requête (API, connexion, photos) abandonnée passé un délai : voir reseau.ts.
  global: { fetch: fetchAvecDelai },
});

// Renouvellement du jeton au premier plan seulement, comme Supabase le recommande pour React Native : au retour sur
// l'appli, un essai part aussitôt (jeton expiré hors ligne compris), puis toutes les 30 s ; rien en arrière-plan.
AppState.addEventListener('change', (etat) => {
  if (etat === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});

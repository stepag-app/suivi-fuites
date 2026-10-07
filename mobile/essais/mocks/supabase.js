import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
// Même clé que src/supabase.ts, dans le stockage de la tablette : session-donnees.ts relit la session gardée.
export const CLE_SESSION = `sb-${new URL(process.env.SB_URL).hostname.split('.')[0]}-auth-token`;
export const supabase = createClient(process.env.SB_URL, process.env.SB_ANON, {
  auth: { storage: AsyncStorage, storageKey: CLE_SESSION, persistSession: true, autoRefreshToken: false },
  global: { fetch: (...a) => globalThis.__fetch(...a) },
});

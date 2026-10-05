import { createClient } from '@supabase/supabase-js';
const m = new Map();
export const supabase = createClient(process.env.SB_URL, process.env.SB_ANON, {
  auth: { storage: { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k) }, persistSession: true, autoRefreshToken: false },
  global: { fetch: (...a) => globalThis.__fetch(...a) },
});

// Fonction serveur version-apk (X2) : dernière version de l'APK publiée par la CI dans le compartiment privé R2
// (workflow apk.yml : apk/derniere.json et apk/suivi-fuites-<numéro>.apk), avec une URL signée de téléchargement.
// Réservée aux comptes connectés et actifs. Les clés R2 restent ici (mêmes secrets que photos-r2).
//
// Réponse : { version_code, version, taille, sha256, publiee_le, url, expire_s } ; { aucune: true } si rien n'est
// publié ; 503 { code: 'r2_non_configure' } sans secrets R2.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const CHEMIN_APK = /^apk\/suivi-fuites-\d+\.apk$/;
// Téléchargement de 25 Mo sur une 4G lente : une heure de marge.
const DUREE_S = 3600;

const reponse = (statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse(405, { erreur: 'Méthode non autorisée' });

  const compte = Deno.env.get('R2_ACCOUNT_ID');
  const cle = Deno.env.get('R2_ACCESS_KEY_ID');
  const secret = Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (!compte || !cle || !secret) return reponse(503, { erreur: 'Stockage R2 non configuré sur le serveur', code: 'r2_non_configure' });

  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const utilisateur = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: appelant, error: erreurJeton } = await utilisateur.auth.getUser(jeton);
  if (erreurJeton || !appelant.user) return reponse(401, { erreur: 'Non connecté' });
  const { data: profil } = await utilisateur.from('profils').select('actif').eq('id', appelant.user.id).maybeSingle();
  if (!profil?.actif) return reponse(403, { erreur: 'Compte désactivé' });

  const base = `https://${compte}.r2.cloudflarestorage.com/${Deno.env.get('R2_BUCKET') || 'suivi-fuites-photos'}`;
  const client = new AwsClient({ accessKeyId: cle, secretAccessKey: secret, service: 's3', region: 'auto' });
  try {
    const manifeste = await client.fetch(`${base}/apk/derniere.json`);
    if (manifeste.status === 404) return reponse(200, { aucune: true });
    if (!manifeste.ok) return reponse(502, { erreur: `Version illisible (${manifeste.status})` });
    const v = await manifeste.json() as Record<string, unknown>;
    const chemin = String(v.chemin ?? '');
    if (!CHEMIN_APK.test(chemin) || !Number.isInteger(v.version_code)) return reponse(502, { erreur: 'Version publiée invalide' });
    const url = new URL(`${base}/${chemin}`);
    url.searchParams.set('X-Amz-Expires', String(DUREE_S));
    const signee = await client.sign(new Request(url.toString(), { method: 'GET' }), { aws: { signQuery: true } });
    return reponse(200, {
      version_code: v.version_code, version: v.version, taille: v.taille, sha256: v.sha256, publiee_le: v.publiee_le,
      url: signee.url, expire_s: DUREE_S,
    });
  } catch (e) {
    return reponse(500, { erreur: e instanceof Error ? e.message : String(e) });
  }
});

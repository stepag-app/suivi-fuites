// Fonction serveur photos-r2 : URL signées de courte durée pour le compartiment privé Cloudflare R2.
// Les clés R2 restent ici (secrets de la fonction) : jamais dans l'APK ni dans le panneau.
// Droits : ceux du compte appelant (JWT) ; le dépôt est contrôlé par la fonction SQL marches_photos
// (même règle que la RLS de la table photos), la lecture par la table photos elle-même (RLS).
//
// Actions (corps JSON, champ « action ») :
//   deposer  { marche_id, fuite_id, photo_id }   → { url, chemin, expire_s } : dépôt PUT d'un JPEG
//   lire     { chemins: string[], duree_s? }     → { urls: { [chemin]: url } } : lecture GET
// Sans secrets R2 : 503 { code: 'r2_non_configure' } ; les clients retombent sur Supabase Storage.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Chemin d'une photo : <marche_id>/<fuite_id>/<photo_id>.jpg (même forme que sur Supabase Storage)
const CHEMIN = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i;
const DUREE_DEPOT_S = 900;
const DUREE_LECTURE_S = 3600;
const DUREE_LECTURE_MAX_S = 86400;
const LECTURE_MAX = 200;

const reponse = (statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });

interface R2 { base: string; compartiment: string; client: AwsClient }

function configurationR2(): R2 | null {
  const compte = Deno.env.get('R2_ACCOUNT_ID');
  const cle = Deno.env.get('R2_ACCESS_KEY_ID');
  const secret = Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (!compte || !cle || !secret) return null;
  return {
    base: `https://${compte}.r2.cloudflarestorage.com`,
    compartiment: Deno.env.get('R2_BUCKET') || 'suivi-fuites-photos',
    client: new AwsClient({ accessKeyId: cle, secretAccessKey: secret, service: 's3', region: 'auto' }),
  };
}

// URL présignée S3 (signature V4 dans la requête) : valable dureeS secondes, pour cette méthode et ce chemin.
async function signer(r2: R2, methode: 'GET' | 'PUT', chemin: string, dureeS: number): Promise<string> {
  const url = new URL(`${r2.base}/${r2.compartiment}/${chemin}`);
  url.searchParams.set('X-Amz-Expires', String(dureeS));
  const signee = await r2.client.sign(new Request(url.toString(), { method: methode }), { aws: { signQuery: true } });
  return signee.url;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse(405, { erreur: 'Méthode non autorisée' });

  const r2 = configurationR2();
  if (!r2) return reponse(503, { erreur: 'Stockage R2 non configuré sur le serveur', code: 'r2_non_configure' });

  // Client au nom de l'appelant : la RLS et marches_photos s'appliquent à lui, jamais à service_role.
  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const utilisateur = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jeton}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: appelant, error: erreurJeton } = await utilisateur.auth.getUser(jeton);
  if (erreurJeton || !appelant.user) return reponse(401, { erreur: 'Non connecté' });

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return reponse(400, { erreur: 'Requête illisible' });
  }

  try {
    switch (corps.action) {
      case 'deposer': {
        const marcheId = String(corps.marche_id ?? '');
        const fuiteId = String(corps.fuite_id ?? '');
        const photoId = String(corps.photo_id ?? '');
        if (![marcheId, fuiteId, photoId].every((v) => UUID.test(v))) {
          return reponse(400, { erreur: 'marche_id, fuite_id et photo_id (uuid) attendus' });
        }
        const { data: marches, error: erreurDroits } = await utilisateur.rpc('marches_photos', { p_action: 'creer' });
        if (erreurDroits) return reponse(500, { erreur: `Droits illisibles : ${erreurDroits.message}` });
        if (!(marches as string[] | null)?.includes(marcheId)) {
          return reponse(403, { erreur: 'Droit « photos / créer » absent sur ce marché' });
        }
        const { data: fuite, error: erreurFuite } = await utilisateur
          .from('fuites').select('id').eq('id', fuiteId).eq('marche_id', marcheId).is('supprime_le', null).maybeSingle();
        if (erreurFuite) return reponse(500, { erreur: `Fuite illisible : ${erreurFuite.message}` });
        if (!fuite) return reponse(404, { erreur: 'Fuite introuvable dans ce marché (envoyez la fuite avant ses photos)' });
        const chemin = `${marcheId.toLowerCase()}/${fuiteId.toLowerCase()}/${photoId.toLowerCase()}.jpg`;
        return reponse(200, { url: await signer(r2, 'PUT', chemin, DUREE_DEPOT_S), chemin, expire_s: DUREE_DEPOT_S });
      }
      case 'lire': {
        const chemins = Array.isArray(corps.chemins) ? corps.chemins.filter((c): c is string => typeof c === 'string' && CHEMIN.test(c)) : [];
        if (!chemins.length) return reponse(400, { erreur: 'chemins (liste) attendus' });
        if (chemins.length > LECTURE_MAX) return reponse(400, { erreur: `${LECTURE_MAX} chemins au plus par appel` });
        const dureeS = Math.min(DUREE_LECTURE_MAX_S, Math.max(60, Number(corps.duree_s) || DUREE_LECTURE_S));
        // Seules les photos que l'appelant peut lire (RLS de la table photos) reçoivent une URL.
        const { data: lignes, error: erreurPhotos } = await utilisateur
          .from('photos').select('chemin').eq('stockage', 'r2').in('chemin', chemins).is('supprime_le', null);
        if (erreurPhotos) return reponse(500, { erreur: `Photos illisibles : ${erreurPhotos.message}` });
        const urls: Record<string, string> = {};
        for (const l of (lignes as { chemin: string }[] | null) ?? []) urls[l.chemin] = await signer(r2, 'GET', l.chemin, dureeS);
        return reponse(200, { urls, expire_s: dureeS });
      }
      default:
        return reponse(400, { erreur: 'Action inconnue' });
    }
  } catch (e) {
    return reponse(500, { erreur: e instanceof Error ? e.message : String(e) });
  }
});

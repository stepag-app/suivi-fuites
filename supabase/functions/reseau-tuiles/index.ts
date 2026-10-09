// Fonction serveur reseau-tuiles : URL signées de courte durée pour l'archive PMTiles du réseau d'un marché, rangée
// dans le compartiment privé Cloudflare R2 (`reseau/<marche_id>/reseau.pmtiles`). Le plan du réseau est une donnée
// sensible : jamais d'accès public, l'archive se lit par plages d'octets avec une URL signée délivrée ici.
// Droits : ceux du compte appelant (JWT), lus avec sa propre session (RLS), jamais avec service_role.
//
// Actions (corps JSON, champ « action ») :
//   lire     { marche_id } → { existe: false } | { existe: true, url, expire_s, etag, octets, modifie_le }
//            compte affecté au marché (la RLS de `marches` ne lui montre que les siens ; administrateur : tous)
//   deposer  { marche_id } → { url, chemin, expire_s } : dépôt PUT de l'archive régénérée
//            administrateur, ou droit « paramètres / modifier » sur ce marché (même règle que le zonage)
// Sans secrets R2 : 503 { code: 'r2_non_configure' } ; le panneau garde alors la lecture par secteur.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { AwsClient } from 'npm:aws4fetch@1.0.20';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DUREE_LECTURE_S = 6 * 3600;
const DUREE_DEPOT_S = 900;

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

// URL présignée S3 (signature V4 dans la requête). L'en-tête Range n'est pas signé : le navigateur lit les plages
// qu'il veut avec la même URL tant qu'elle est valable.
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
  const marcheId = String(corps.marche_id ?? '').toLowerCase();
  if (!UUID.test(marcheId)) return reponse(400, { erreur: 'marche_id (uuid) attendu' });
  const chemin = `reseau/${marcheId}/reseau.pmtiles`;

  try {
    // Marché visible de l'appelant (RLS) : condition commune aux deux actions.
    const { data: marche, error: erreurMarche } = await utilisateur.from('marches').select('id').eq('id', marcheId).maybeSingle();
    if (erreurMarche) return reponse(500, { erreur: `Marché illisible : ${erreurMarche.message}` });
    if (!marche) return reponse(403, { erreur: 'Marché non autorisé' });

    switch (corps.action) {
      case 'lire': {
        const tete = await r2.client.fetch(await signer(r2, 'GET', chemin, 60), { method: 'HEAD' });
        if (tete.status === 404) return reponse(200, { existe: false });
        if (!tete.ok) return reponse(502, { erreur: `Stockage injoignable (HTTP ${tete.status})` });
        return reponse(200, {
          existe: true,
          url: await signer(r2, 'GET', chemin, DUREE_LECTURE_S),
          expire_s: DUREE_LECTURE_S,
          etag: tete.headers.get('ETag'),
          octets: Number(tete.headers.get('Content-Length')) || null,
          modifie_le: tete.headers.get('Last-Modified'),
        });
      }
      case 'deposer': {
        const id = appelant.user.id;
        const [{ data: profil }, { data: droit }] = await Promise.all([
          utilisateur.from('profils').select('est_admin').eq('id', id).maybeSingle(),
          utilisateur.from('droits').select('modifier').eq('profil_id', id).eq('marche_id', marcheId).eq('type_donnee', 'parametres').maybeSingle(),
        ]);
        if (profil?.est_admin !== true && droit?.modifier !== true) {
          return reponse(403, { erreur: 'Réservé à l\'administrateur ou au droit « paramètres / modifier »' });
        }
        return reponse(200, { url: await signer(r2, 'PUT', chemin, DUREE_DEPOT_S), chemin, expire_s: DUREE_DEPOT_S });
      }
      default:
        return reponse(400, { erreur: 'Action inconnue' });
    }
  } catch (e) {
    return reponse(500, { erreur: e instanceof Error ? e.message : String(e) });
  }
});

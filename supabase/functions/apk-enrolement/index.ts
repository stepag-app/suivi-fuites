// Fonction serveur apk-enrolement (lot TP) : adresse stable de la dernière APK publiée, pour le QR code de préparation
// des tablettes (docs/lots/lot-tablette-proprietaire.md § 8.2). Au premier démarrage d'une tablette, Android télécharge
// l'APK depuis cette adresse, sans compte ni jeton : la fonction est donc ouverte (verify_jwt = false) et ne fait
// qu'une chose, rediriger vers une URL signée d'une heure de l'APK désignée par apk/derniere.json (workflow apk.yml).
// L'APK ne contient aucun secret (clé anon publique par conception) ; Android vérifie son certificat (empreinte du QR).
//
// Réponse : 302 vers l'APK ; 404 si rien n'est publié ; 503 sans secrets R2.

import { AwsClient } from 'npm:aws4fetch@1.0.20';

const CHEMIN_APK = /^apk\/suivi-fuites-\d+\.apk$/;
const DUREE_S = 600;  // 10 min (audit S20) : suffit au téléchargement d'enrôlement par QR

const texte = (statut: number, message: string) =>
  new Response(message, { status: statut, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return texte(405, 'Méthode non autorisée');

  // Fonction PUBLIQUE (verify_jwt = false) : on utilise la clé R2 LECTURE SEULE dédiée si elle est configurée
  // (R2_RO_*), sinon on retombe sur la clé lecture+écriture partagée (aucune régression). Ainsi, une exploitation
  // de cette fonction ouverte ne peut, au pire, que lire — jamais écrire ni supprimer dans R2 (H10).
  const compte = Deno.env.get('R2_ACCOUNT_ID');
  const roCle = Deno.env.get('R2_RO_ACCESS_KEY_ID');
  const roSecret = Deno.env.get('R2_RO_SECRET_ACCESS_KEY');
  const cle = roCle && roSecret ? roCle : Deno.env.get('R2_ACCESS_KEY_ID');
  const secret = roCle && roSecret ? roSecret : Deno.env.get('R2_SECRET_ACCESS_KEY');
  if (!compte || !cle || !secret) return texte(503, 'Stockage R2 non configuré sur le serveur');

  const base = `https://${compte}.r2.cloudflarestorage.com/${Deno.env.get('R2_BUCKET') || 'suivi-fuites-photos'}`;
  const client = new AwsClient({ accessKeyId: cle, secretAccessKey: secret, service: 's3', region: 'auto' });
  try {
    const manifeste = await client.fetch(`${base}/apk/derniere.json`);
    if (manifeste.status === 404) return texte(404, 'Aucune version publiée');
    if (!manifeste.ok) return texte(502, `Version illisible (${manifeste.status})`);
    const chemin = String(((await manifeste.json()) as Record<string, unknown>).chemin ?? '');
    if (!CHEMIN_APK.test(chemin)) return texte(502, 'Version publiée invalide');
    const url = new URL(`${base}/${chemin}`);
    url.searchParams.set('X-Amz-Expires', String(DUREE_S));
    const signee = await client.sign(new Request(url.toString(), { method: 'GET' }), { aws: { signQuery: true } });
    return new Response(null, { status: 302, headers: { Location: signee.url, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return texte(500, e instanceof Error ? e.message : String(e));
  }
});

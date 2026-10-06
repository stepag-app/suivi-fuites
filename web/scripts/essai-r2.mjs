// Essai du compartiment privé Cloudflare R2 avec VOS clés, lues dans l'environnement (jamais dans le
// dépôt, jamais dans le chat). Dans web/, Node 20 ou plus :
//   R2_ACCOUNT_ID=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… node scripts/essai-r2.mjs
// Dépose un petit fichier texte sous essai/, le relit par URL signée GET (comme le panneau et la tablette),
// puis le supprime. Aucune clé n'est affichée. Variable facultative : R2_BUCKET (défaut suivi-fuites-photos).
//   node scripts/essai-r2.mjs --forme   : sans clés, vérifie seulement la forme d'une URL signée (clés fictives).
import { AwsClient } from 'aws4fetch';

const forme = process.argv.includes('--forme');
const compte = process.env.R2_ACCOUNT_ID || (forme ? 'compte-fictif' : '');
const cle = process.env.R2_ACCESS_KEY_ID || (forme ? 'AKIAFICTIF' : '');
const secret = process.env.R2_SECRET_ACCESS_KEY || (forme ? 'secret-fictif' : '');
const compartiment = process.env.R2_BUCKET || 'suivi-fuites-photos';
if (!compte || !cle || !secret) {
  console.error('Variables R2_ACCOUNT_ID, R2_ACCESS_KEY_ID et R2_SECRET_ACCESS_KEY attendues (ou --forme).');
  process.exit(2);
}

const r2 = new AwsClient({ accessKeyId: cle, secretAccessKey: secret, service: 's3', region: 'auto' });
const base = `https://${compte}.r2.cloudflarestorage.com/${compartiment}`;

// Même signature que la fonction serveur photos-r2 (URL présignée, signature V4 dans la requête).
async function signer(methode, chemin, dureeS) {
  const url = new URL(`${base}/${chemin}`);
  url.searchParams.set('X-Amz-Expires', String(dureeS));
  return (await r2.sign(new Request(url.toString(), { method: methode }), { aws: { signQuery: true } })).url;
}

const chemin = `essai/${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
let ok = 0, ko = 0;
const verifier = (cond, msg, extra) => { if (cond) { ok++; console.log('  ✓', msg); } else { ko++; console.log('  ✗', msg, extra ?? ''); } };

const put = await signer('PUT', chemin, 900);
const get = await signer('GET', chemin, 60);
const q = new URL(put).searchParams;
verifier(q.get('X-Amz-Algorithm') === 'AWS4-HMAC-SHA256', 'URL signée : algorithme V4');
verifier((q.get('X-Amz-Credential') ?? '').endsWith('/auto/s3/aws4_request'), 'URL signée : région auto, service s3');
verifier(q.get('X-Amz-Expires') === '900' && /^[0-9a-f]{64}$/.test(q.get('X-Amz-Signature') ?? ''), 'URL signée : durée et signature');
verifier(!put.includes(secret), 'le secret n\'apparaît jamais dans l\'URL');

if (forme) {
  console.log(`\n${ok} vérifications réussies, ${ko} en échec (forme seulement, aucun appel réseau).`);
  process.exit(ko ? 1 : 0);
}

const contenu = `Essai R2 suivi-fuites ${new Date().toISOString()}\n`;
const depot = await fetch(put, { method: 'PUT', body: contenu, headers: { 'Content-Type': 'text/plain' } });
verifier(depot.ok, `dépôt PUT par URL signée (${depot.status})`, depot.ok ? '' : await depot.text());
const lecture = await fetch(get);
verifier(lecture.ok && (await lecture.text()) === contenu, `lecture GET par URL signée (${lecture.status})`);
const anonyme = await fetch(`${base}/${chemin}`);
verifier(!anonyme.ok, `lecture sans signature refusée (${anonyme.status}) : le compartiment est bien privé`);
const suppression = await r2.fetch(`${base}/${chemin}`, { method: 'DELETE' });
verifier(suppression.ok || suppression.status === 204, `suppression (${suppression.status})`);
console.log(`\n${ok} vérifications réussies, ${ko} en échec.`);
process.exit(ko ? 1 : 0);

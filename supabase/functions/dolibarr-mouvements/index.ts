// Fonction serveur dolibarr-mouvements (X8) : reçoit les mouvements de stock envoyés par la tâche planifiée du serveur
// Dolibarr (outils/dolibarr/envoi-mouvements.php), sans compte ni JWT : l'appel porte le jeton dédié dans l'en-tête
// x-jeton-dolibarr. Tout le reste (entrepôts suivis, nouveaux ou changés seulement, import, journal) est fait par la
// base : recevoir_envoi_dolibarr (service_role seulement), qui appelle importer_mouvements_dolibarr.
//
// Corps JSON : { action: 'etat' } → rowid reçus par entrepôt suivi ; { action: 'envoyer', mouvements: [...] } ;
// { action: 'erreur', message } (le script n'a pas pu lire Dolibarr). Toujours avec script: { version, poste }.
//
// Secret de la fonction : DOLIBARR_JETON (32 caractères au moins), posé par le workflow « Déploiement de la base »
// depuis le secret GitHub du même nom. Absent : 503 { configure: false } et rien n'est lu.

import { createClient } from 'npm:@supabase/supabase-js@2';

const TAILLE_MAX = 4 * 1024 * 1024;

const reponse = (statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

// Comparaison en temps constant (empreintes de même longueur) : la durée ne dit rien du jeton attendu.
async function memeJeton(recu: string, attendu: string): Promise<boolean> {
  const empreinte = async (t: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)));
  const [a, b] = await Promise.all([empreinte(recu), empreinte(attendu)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reponse(405, { erreur: 'Méthode non autorisée' });

  const attendu = Deno.env.get('DOLIBARR_JETON') ?? '';
  if (attendu.length < 32) return reponse(503, { erreur: 'Envoi automatique Dolibarr non configuré sur le serveur', configure: false });
  if (!(await memeJeton(req.headers.get('x-jeton-dolibarr') ?? '', attendu))) return reponse(401, { erreur: 'Jeton refusé' });

  const longueur = Number(req.headers.get('content-length') ?? '0');
  if (longueur > TAILLE_MAX) return reponse(413, { erreur: 'Envoi trop volumineux (4 Mo au plus) : réduire le lot' });
  const texte = await req.text();
  if (texte.length > TAILLE_MAX) return reponse(413, { erreur: 'Envoi trop volumineux (4 Mo au plus) : réduire le lot' });
  let envoi: unknown;
  try {
    envoi = JSON.parse(texte);
  } catch {
    return reponse(400, { erreur: 'Corps illisible (JSON attendu)' });
  }
  if (!envoi || typeof envoi !== 'object' || Array.isArray(envoi)) return reponse(400, { erreur: 'Corps illisible (objet attendu)' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc('recevoir_envoi_dolibarr', { p_envoi: envoi });
  if (error) {
    const statut = error.code === '22023' ? 400 : 500;
    return reponse(statut, { erreur: error.message, code: error.code });
  }
  const resultat = (data ?? {}) as Record<string, unknown>;
  // Envoi refusé par la base (déjà journalisé) : le script garde son point de reprise et réessaiera.
  if (resultat.statut === 'erreur') return reponse(422, resultat);
  return reponse(200, resultat);
});

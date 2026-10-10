// Fonction serveur dolibarr-mouvements (X8) : mouvements de stock Dolibarr → Supabase, sans JWT imposé (verify_jwt = false).
//
// Lecture de l'API REST de Dolibarr (corps { action: 'synchroniser', tout?: true }), deux appelants :
//  * la base, toutes les 15 minutes (pg_cron → pg_net) avec sa clé d'appel x-cle-synchro, vérifiée par la base
//    (verifier_cle_synchro_dolibarr) ; réponse 202 immédiate, la lecture continue en arrière-plan ;
//  * le bouton « Synchroniser maintenant » de la page Rapprochement, avec le jeton du compte (administrateur, ou
//    « quantités / lire » : peut_synchroniser_dolibarr) ; réponse au bout de la lecture, erreurs comprises. « tout » :
//    tout l'historique des entrepôts suivis est relu (contrôle, ou correction des lignes venues du CSV) ; rien n'est doublé.
// Une seule lecture à la fois (verrou de recevoir_envoi_dolibarr). Le détail de la lecture est dans lecture-api.ts.
// L'ancien envoi poussé par un script du serveur Dolibarr (S13, jamais installé) est retiré ; l'import CSV reste le secours.
//
// Secrets de la fonction, posés par le workflow « Déploiement de la base » depuis les secrets GitHub du même nom :
// DOLIBARR_API_URL, DOLIBARR_API_CLE, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET. Absents : 503 { configure: false }.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ErreurApi, clientDolibarr, lireEntrepot, nouveauxCaches, type ConfigApi, type MouvementEnvoye } from './lecture-api.ts';

const TAILLE_LOT = 1000;
const JOURS_RECOUVREMENT = 3;
const VERSION = 'api-1.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reponse = (statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });

const serviceRole = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function configurationApi(): ConfigApi | null {
  const url = Deno.env.get('DOLIBARR_API_URL')?.trim() ?? '';
  const cle = Deno.env.get('DOLIBARR_API_CLE')?.trim() ?? '';
  const cfId = Deno.env.get('CF_ACCESS_CLIENT_ID')?.trim() ?? '';
  const cfSecret = Deno.env.get('CF_ACCESS_CLIENT_SECRET')?.trim() ?? '';
  if (!/^https:\/\/[^/\s]+\/\S*api\/index\.php\/?$/.test(url) || !cle || !cfId || !cfSecret) return null;
  return { url, cle, cfId, cfSecret };
}

async function rpc(admin: SupabaseClient, envoi: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc('recevoir_envoi_dolibarr', { p_envoi: envoi });
  if (error) throw new Error(`Base : ${error.message}`);
  return (data ?? {}) as Record<string, unknown>;
}

interface Bilan {
  statut: 'recu' | 'rien' | 'erreur' | 'occupe';
  mouvements: number;
  nouveaux: number;
  modifies: number;
  ignores: number;
  lots: number;
  appels_dolibarr: number;
  erreur?: string;
  depuis?: unknown;
}

// Une lecture complète : verrou, entrepôts suivis, mouvements lus, envoyés par lots dans l'ordre des rowid, verrou rendu.
async function synchroniser(admin: SupabaseClient, config: ConfigApi, poste: string, tout = false): Promise<Bilan> {
  const script = { version: VERSION, poste };
  const debut = await rpc(admin, { action: 'debut', script });
  const bilan: Bilan = { statut: 'rien', mouvements: 0, nouveaux: 0, modifies: 0, ignores: 0, lots: 0, appels_dolibarr: 0 };
  if (debut.occupe) return { ...bilan, statut: 'occupe', depuis: debut.depuis };

  const client = clientDolibarr(config);
  try {
    const caches = nouveauxCaches();
    const entrepots = (Array.isArray(debut.entrepots) ? debut.entrepots : []) as { id: number; dernier_id: number | null }[];
    const lus: MouvementEnvoye[] = [];
    for (const e of entrepots) lus.push(...(await lireEntrepot(client, caches, e.id, tout ? null : e.dernier_id, JOURS_RECOUVREMENT)));
    lus.sort((a, b) => a.dolibarr_id - b.dolibarr_id);
    bilan.appels_dolibarr = client.appels();

    // Rien de lu : un envoi vide laisse quand même un signe de vie (« Dernier passage »).
    const lots = lus.length ? Array.from({ length: Math.ceil(lus.length / TAILLE_LOT) }, (_, i) => lus.slice(i * TAILLE_LOT, (i + 1) * TAILLE_LOT)) : [[]];
    for (const lot of lots) {
      const r = await rpc(admin, { action: 'envoyer', mouvements: lot, script });
      bilan.lots++;
      bilan.mouvements += Number(r.mouvements ?? 0);
      if (r.statut === 'erreur') return { ...bilan, statut: 'erreur', erreur: String(r.erreur ?? 'Envoi refusé par la base') };
      bilan.nouveaux += Number(r.nouveaux ?? 0);
      bilan.modifies += Number(r.modifies ?? 0);
      bilan.ignores += Number(r.ignores ?? 0);
    }
    bilan.statut = bilan.nouveaux || bilan.modifies ? 'recu' : 'rien';
    return bilan;
  } catch (e) {
    bilan.appels_dolibarr = client.appels();
    const message = e instanceof ErreurApi ? e.message : `Lecture interrompue : ${e instanceof Error ? e.message : String(e)}`;
    await rpc(admin, { action: 'erreur', origine: 'api', message, script }).catch(() => undefined);
    return { ...bilan, statut: 'erreur', erreur: message };
  } finally {
    await rpc(admin, { action: 'fin', script }).catch(() => undefined);
  }
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse(405, { erreur: 'Méthode non autorisée' });

  const admin = serviceRole();
  const cle = req.headers.get('x-cle-synchro');
  let poste: string;
  if (cle !== null) {
    const { data: valide, error } = await admin.rpc('verifier_cle_synchro_dolibarr', { p_cle: cle });
    if (error) return reponse(500, { erreur: `Base : ${error.message}` });
    if (valide !== true) return reponse(401, { erreur: 'Clé d\'appel refusée' });
    poste = 'lecture planifiée';
  } else {
    // Bouton du panneau : jeton du compte, droits vérifiés par la base sous son nom.
    const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jeton) return reponse(401, { erreur: 'Non connecté' });
    const compte = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${jeton}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: appelant, error: erreurJeton } = await compte.auth.getUser(jeton);
    if (erreurJeton || !appelant.user) return reponse(401, { erreur: 'Non connecté' });
    const { data: peut, error } = await compte.rpc('peut_synchroniser_dolibarr');
    if (error) return reponse(500, { erreur: `Base : ${error.message}` });
    if (peut !== true) return reponse(403, { erreur: 'Réservé à l\'administrateur et aux comptes qui voient le rapprochement' });
    const identifiant = String(appelant.user.user_metadata?.identifiant ?? appelant.user.email?.split('@')[0] ?? 'compte');
    poste = `lecture demandée par ${identifiant}`.slice(0, 100);
  }

  let corps: Record<string, unknown> = {};
  try {
    corps = await req.json();
  } catch {
    // corps vide : synchroniser
  }
  if ((corps.action ?? 'synchroniser') !== 'synchroniser') return reponse(400, { erreur: 'Action inconnue' });

  const config = configurationApi();
  if (!config) {
    return reponse(503, {
      erreur: 'Lecture de l\'API Dolibarr non configurée sur le serveur (secrets DOLIBARR_API_URL, DOLIBARR_API_CLE, CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET)',
      configure: false,
    });
  }

  const travail = synchroniser(admin, config, poste, corps.tout === true);
  if (cle !== null && typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(travail.catch((e) => console.error('lecture Dolibarr', e)));
    return reponse(202, { lancee: true });
  }
  try {
    const bilan = await travail;
    const statut = bilan.statut === 'occupe' ? 409 : bilan.statut === 'erreur' ? 502 : 200;
    return reponse(statut, { ...bilan });
  } catch (e) {
    return reponse(500, { erreur: e instanceof Error ? e.message : String(e) });
  }
});

// Envoi d'un document par e-mail (chantier v3, S18 ; contrat docs/lots/chantier-v3-email.md).
// La base décide (droit, marché actif, limites du jour) avec le jeton de l'appelant : aucune clé service_role.
// Clé du fournisseur (RESEND_API_KEY) lue ici seulement, côté serveur ; jamais NEXT_PUBLIC_.
import { createClient } from '@supabase/supabase-js';
import { TAILLE_MAX_PIECE, traiterEnvoi, type Courriel, type Demande } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPEDITEUR = process.env.EMAIL_EXPEDITEUR || 'STEPAG <contact@stepag.ma>';
const COPIE = process.env.EMAIL_COPIE || 'contact@stepag.ma';
const URL_RESEND = process.env.RESEND_API_URL || 'https://api.resend.com';

const json = (statut: number, corps: Record<string, unknown>) =>
  Response.json(corps, { status: statut, headers: { 'Cache-Control': 'no-store' } });

// Mode essai (EMAIL_FOURNISSEUR=essai) : rien ne part, le courriel est seulement résumé dans le journal du serveur.
async function envoyerEssai(c: Courriel): Promise<{ id: string }> {
  console.info('[email essai]', JSON.stringify({ to: c.to, bcc: c.bcc, subject: c.subject, piece: c.attachments[0]?.filename }));
  return { id: `essai-${crypto.randomUUID()}` };
}

async function envoyerResend(cle: string, c: Courriel, cleIdempotence: string): Promise<{ id: string } | { erreur: string }> {
  const r = await fetch(`${URL_RESEND}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json', 'Idempotency-Key': cleIdempotence },
    body: JSON.stringify(c),
    signal: AbortSignal.timeout(30_000),
  });
  const corps = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (r.ok && corps.id) return { id: corps.id };
  return { erreur: `${r.status} ${corps.message ?? corps.name ?? r.statusText}`.slice(0, 400) };
}

export async function POST(requete: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return json(503, { erreur: 'Configuration Supabase manquante sur le serveur.' });

  const jeton = /^Bearer\s+(.+)$/i.exec(requete.headers.get('authorization') ?? '')?.[1]?.trim() || null;
  // Refus avant de lire le corps : formulaire plus gros que la pièce permise (marge pour les champs texte).
  const longueur = Number(requete.headers.get('content-length') ?? 0);
  if (longueur > TAILLE_MAX_PIECE + 64 * 1024) {
    return json(413, { erreur: `Pièce jointe trop lourde : ${Math.round(TAILLE_MAX_PIECE / 1024 / 1024)} Mo au plus.` });
  }

  let form: FormData;
  try {
    form = await requete.formData();
  } catch {
    return json(400, { erreur: 'Formulaire illisible.' });
  }
  const texte = (cle: string) => {
    const v = form.get(cle);
    return typeof v === 'string' ? v : null;
  };
  const fichier = form.get('fichier');
  const piece = fichier instanceof File
    ? { nom: fichier.name, octets: fichier.size, type: fichier.type, contenu: () => fichier.arrayBuffer() }
    : null;

  const fournisseur = process.env.EMAIL_FOURNISSEUR === 'essai' ? 'essai' : 'resend';
  const cle = process.env.RESEND_API_KEY ?? '';
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jeton ?? ''}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const reponse = await traiterEnvoi(jeton, {
    marche_id: texte('marche_id'), document: texte('document'), reference: texte('reference'),
    destinataires: texte('destinataires'), objet: texte('objet'), message: texte('message'), piece,
  }, {
    configure: fournisseur === 'essai' || cle !== '',
    expediteur: EXPEDITEUR,
    copie: COPIE,
    reserver: async (d: Demande) => {
      const { data, error } = await sb.rpc('reserver_envoi_email', {
        p_marche: d.marcheId, p_document: d.document, p_reference: d.reference, p_objet: d.objet,
        p_destinataires: d.destinataires, p_piece_nom: d.piece.nom, p_piece_octets: d.piece.octets,
      });
      if (error) return { erreur: { code: error.code, message: error.message } };
      return { id: String(data) };
    },
    terminer: async (id, statut, fournisseurId, erreur) => {
      const { error } = await sb.rpc('terminer_envoi_email', {
        p_id: id, p_statut: statut, p_fournisseur_id: fournisseurId, p_erreur: erreur,
      });
      if (error) console.error('[email] journal non terminé', id, error.message);
    },
    contexte: async (d: Demande) => {
      const [m, moi] = await Promise.all([
        sb.from('marches').select('code').eq('id', d.marcheId).maybeSingle(),
        sb.auth.getUser(jeton ?? undefined),
      ]);
      const p = moi.data.user
        ? await sb.from('profils').select('nom_complet').eq('id', moi.data.user.id).maybeSingle()
        : null;
      return {
        marche: (m.data as { code?: string } | null)?.code ?? null,
        envoyePar: (p?.data as { nom_complet?: string } | null)?.nom_complet ?? null,
      };
    },
    envoyer: (c, cleIdempotence) => (fournisseur === 'essai' ? envoyerEssai(c) : envoyerResend(cle, c, cleIdempotence)),
    base64: (contenu) => Buffer.from(contenu).toString('base64'),
  });

  if ('id' in reponse) return json(200, { id: reponse.id, fournisseur_id: reponse.fournisseurId });
  return json(reponse.statut, { erreur: reponse.erreur });
}

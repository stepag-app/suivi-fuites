// Fonction serveur de gestion des comptes (Edge Function Supabase).
// Réservée aux administrateurs. La clé service_role reste ici, côté serveur :
// elle n'est jamais envoyée au navigateur ni à la tablette.
//
// Actions (corps JSON, champ « action ») :
//   creer         { identifiant, nom_complet, mot_de_passe, telephone?, affectations: [{ marche_id, roles[] }] }
//   mot_de_passe  { profil_id, mot_de_passe }
//   activer       { profil_id, actif }          (révoque ou rétablit l'accès)
//   affecter      { profil_id, marche_id, role } (applique un modèle de rôle, cumulable)

import { createClient } from 'npm:@supabase/supabase-js@2';

const DOMAINE_AGENTS = 'agents.stepag.ma';
const ROLES = ['detection', 'chef_reparation', 'responsable'];
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reponse = (statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reponse(405, { erreur: 'Méthode non autorisée' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Qui appelle ? Seul un administrateur actif peut continuer.
  const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: appelant, error: erreurJeton } = await admin.auth.getUser(jeton);
  if (erreurJeton || !appelant.user) return reponse(401, { erreur: 'Non connecté' });
  const { data: moi, error: erreurProfil } = await admin
    .from('profils').select('est_admin, actif').eq('id', appelant.user.id).maybeSingle();
  // Une erreur technique ne doit pas passer pour un refus : on la montre telle quelle.
  if (erreurProfil) return reponse(500, { erreur: `Lecture du profil impossible : ${erreurProfil.message}` });
  if (!moi) return reponse(403, { erreur: 'Aucun profil pour ce compte' });
  if (!moi.est_admin || !moi.actif) return reponse(403, { erreur: 'Réservé à l\'administrateur' });

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return reponse(400, { erreur: 'Requête illisible' });
  }

  const appliquerRoles = async (profilId: string, marcheId: string, roles: string[]) => {
    for (const role of roles) {
      if (!ROLES.includes(role)) throw new Error(`Rôle inconnu : ${role}`);
      const { error } = await admin.rpc('appliquer_modele_role', { p_profil: profilId, p_marche: marcheId, p_role: role });
      if (error) throw new Error(error.message);
    }
  };

  try {
    switch (corps.action) {
      case 'creer': {
        const identifiant = String(corps.identifiant ?? '').trim().toLowerCase();
        const nom = String(corps.nom_complet ?? '').trim();
        const motDePasse = String(corps.mot_de_passe ?? '');
        if (!/^[a-z0-9._-]{3,40}$/.test(identifiant)) {
          return reponse(400, { erreur: 'Identifiant invalide (3 à 40 caractères : lettres, chiffres, . _ -)' });
        }
        if (!nom) return reponse(400, { erreur: 'Le nom est obligatoire' });
        if (motDePasse.length < 8) return reponse(400, { erreur: 'Mot de passe : 8 caractères minimum' });

        const { data: cree, error } = await admin.auth.admin.createUser({
          email: `${identifiant}@${DOMAINE_AGENTS}`,
          password: motDePasse,
          email_confirm: true,
          user_metadata: { identifiant, nom_complet: nom },
        });
        if (error || !cree.user) {
          const deja = /already|exist|registered/i.test(error?.message ?? '');
          return reponse(deja ? 409 : 400, { erreur: deja ? 'Cet identifiant existe déjà' : (error?.message ?? 'Création impossible') });
        }
        const telephone = String(corps.telephone ?? '').trim();
        if (telephone) await admin.from('profils').update({ telephone }).eq('id', cree.user.id);
        const affectations = (corps.affectations as { marche_id: string; roles: string[] }[] | undefined) ?? [];
        for (const a of affectations) await appliquerRoles(cree.user.id, a.marche_id, a.roles);
        return reponse(200, { ok: true, profil_id: cree.user.id });
      }

      case 'mot_de_passe': {
        const motDePasse = String(corps.mot_de_passe ?? '');
        if (motDePasse.length < 8) return reponse(400, { erreur: 'Mot de passe : 8 caractères minimum' });
        const { error } = await admin.auth.admin.updateUserById(String(corps.profil_id), { password: motDePasse });
        if (error) return reponse(400, { erreur: error.message });
        return reponse(200, { ok: true });
      }

      case 'activer': {
        const actif = corps.actif === true;
        const profilId = String(corps.profil_id);
        if (profilId === appelant.user.id) return reponse(400, { erreur: 'Vous ne pouvez pas révoquer votre propre accès' });
        const { error } = await admin.from('profils').update({ actif }).eq('id', profilId);
        if (error) return reponse(400, { erreur: error.message });
        // Blocage aussi côté authentification : plus de connexion ni de renouvellement de session.
        const { error: erreurBan } = await admin.auth.admin.updateUserById(profilId, {
          ban_duration: actif ? 'none' : '876000h',
        });
        if (erreurBan) return reponse(400, { erreur: erreurBan.message });
        return reponse(200, { ok: true });
      }

      case 'affecter': {
        await appliquerRoles(String(corps.profil_id), String(corps.marche_id), [String(corps.role)]);
        return reponse(200, { ok: true });
      }

      default:
        return reponse(400, { erreur: 'Action inconnue' });
    }
  } catch (e) {
    return reponse(400, { erreur: e instanceof Error ? e.message : 'Erreur inattendue' });
  }
});

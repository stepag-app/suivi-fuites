// Fonction serveur envoyer-push (N2) : notifications push Android par Firebase Cloud Messaging (API HTTP v1).
// Appelée par la base (pg_net) à chaque nouvelle notification et toutes les 5 minutes (pg_cron), avec la clé
// d'appel que la base a tirée au hasard (migration 20261010600000) : sans elle, rien ne se passe.
//
// 1. prend les notifications récentes pas encore envoyées (prendre_notifications_push : une seule prise) ;
// 2. les envoie aux jetons de leur destinataire, texte en français ou en arabe selon profils.langue ;
// 3. retire les jetons que Firebase déclare périmés (application désinstallée, données effacées).
//
// Secret de la fonction : FIREBASE_SERVICE_ACCOUNT (fichier JSON du compte de service Firebase, transmis par le
// workflow « Déploiement de la base » depuis le secret GitHub du même nom). Absent : 200 { configure: false } et
// rien n'est pris (les notifications restent dans la cloche de l'appli).

import { createClient } from 'npm:@supabase/supabase-js@2';

const reponse = (statut: number, corps: Record<string, unknown>) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json' } });

interface CompteService { project_id: string; client_email: string; private_key: string }
interface Notification {
  id: number; destinataire_id: string; marche_id: string; evenement: string; fuite_id: string | null; titre: string;
  corps: string | null; donnees: Record<string, unknown>; langue: 'fr' | 'ar' | 'fr_ar'; non_lues: number; jetons: string[];
}

function compteService(): CompteService | null {
  const brut = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
  if (!brut) return null;
  try {
    const c = JSON.parse(brut) as CompteService;
    return c.project_id && c.client_email && c.private_key ? c : null;
  } catch {
    return null;
  }
}

const base64url = (octets: Uint8Array) =>
  btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const texte64 = (t: string) => base64url(new TextEncoder().encode(t));

// Jeton d'accès Google (OAuth 2, JWT signé RS256 par la clé du compte de service), gardé jusqu'à son échéance.
let acces: { jeton: string; expire: number } | null = null;
async function jetonGoogle(c: CompteService): Promise<string> {
  if (acces && acces.expire > Date.now() + 60_000) return acces.jeton;
  const maintenant = Math.floor(Date.now() / 1000);
  const entete = texte64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const charge = texte64(JSON.stringify({
    iss: c.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: maintenant, exp: maintenant + 3600,
  }));
  const pem = c.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const cle = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), (x) => x.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cle, new TextEncoder().encode(`${entete}.${charge}`)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${entete}.${charge}.${base64url(signature)}`,
    }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error(`Jeton Google refusé : ${JSON.stringify(j)}`);
  acces = { jeton: j.access_token, expire: Date.now() + Number(j.expires_in ?? 3600) * 1000 };
  return acces.jeton;
}

// Textes arabes : mêmes phrases que le dictionnaire de l'APK (mobile/src/traductions.ts, relu par Issam). En hybride
// (« fr_ar »), une phrase arabe ne garde en français que le mot « Réfection » (règle d'Issam).
const RESULTATS_AR: Record<string, string> = { reparee: 'تم الإصلاح', en_cours: 'جارٍ / لم يكتمل بعد', non_reparee: 'لم يتم الإصلاح' };
function texteArabe(n: Notification): { titre: string; corps: string | null } | null {
  const d = n.donnees ?? {};
  const numero = String(d.numero ?? '');
  const hyb = n.langue === 'fr_ar';
  const refection = hyb ? 'الـ Réfection' : 'إعادة الرصف';
  const adresse = (d.adresse as string | null) ?? (d.reference_srm as string | null) ?? n.corps;
  switch (n.evenement) {
    case 'fuite_detectee':
      return { titre: `تسرب جديد رقم ${numero} تم كشفه`, corps: adresse };
    case 'reparation_saisie':
      return { titre: `تم إدخال إصلاح: التسرب رقم ${numero}`, corps: RESULTATS_AR[String(d.resultat)] ?? n.corps };
    case 'reparation_validee':
      return {
        titre: d.resultat === 'non_reparee'
          ? `التسرب رقم ${numero} لم يُصلَح، الحفرة مُصادَق عليها: ${refection} متبقية`
          : `التسرب رقم ${numero} تم إصلاحه والمصادقة عليه: ${refection} متبقية`,
        corps: adresse,
      };
    case 'refection_saisie':
      return {
        titre: d.resultat === 'non_faite'
          ? `إغلاق بدون ${hyb ? 'Réfection' : 'إعادة رصف'}: التسرب رقم ${numero}`
          : `تم إدخال ${refection}: التسرب رقم ${numero}`,
        corps: adresse,
      };
    case 'alerte_reparation':
      return { titre: `التسرب رقم ${numero} لم يُصلَح منذ أكثر من ${d.delai_h ?? 48} ساعة`, corps: adresse };
    // Suivi GPS coupé (sans fuite) : même phrase que mobile/src/traductions.ts.
    case 'suivi_coupe':
      return {
        titre: `انقطع تتبع الموقع: ${String(d.agent ?? '')}`,
        corps: d.etat === 'autorisation'
          ? `إذن الموقع مرفوض على الجهاز اللوحي؛ لا يوجد أي موقع منذ ${String(d.heure ?? '')}.`
          : `لا يوجد أي موقع منذ ${String(d.heure ?? '')}: التطبيق مغلق، أو الإذن مسحوب، أو الجهاز اللوحي مطفأ أو بدون شبكة.`,
      };
    default:
      return null;
  }
}

/** Envoi à un appareil ; « perime » : jeton à retirer (Firebase ne le connaît plus). */
async function envoyer(c: CompteService, jeton: string, n: Notification): Promise<'ok' | 'perime' | 'echec'> {
  const ar = n.langue === 'fr' ? null : texteArabe(n);
  const titre = ar?.titre ?? n.titre;
  const corps = ar ? ar.corps : n.corps;
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${c.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await jetonGoogle(c)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: jeton,
        notification: { title: titre, ...(corps ? { body: corps } : {}) },
        // Lu par l'appli au toucher : ouvre la fiche, marque la notification lue, la retire du rideau.
        // FCM n'accepte que des textes : pas de fuite_id pour une alerte du suivi GPS.
        data: {
          notification_id: String(n.id), marche_id: n.marche_id, evenement: n.evenement, ...(n.fuite_id ? { fuite_id: n.fuite_id } : {}),
        },
        android: {
          priority: 'high',
          notification: { channel_id: 'notifications', tag: `notification-${n.id}`, notification_count: n.non_lues },
        },
      },
    }),
  });
  if (r.ok) return 'ok';
  const erreur = await r.text();
  if (r.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(erreur)) return 'perime';
  console.warn(`FCM ${r.status} : ${erreur.slice(0, 300)}`);
  return 'echec';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reponse(405, { erreur: 'Méthode non autorisée' });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: cleValide, error: erreurCle } = await admin.rpc('verifier_cle_push', { p_cle: req.headers.get('x-cle-push') ?? '' });
  if (erreurCle) return reponse(500, { erreur: `Clé illisible : ${erreurCle.message}` });
  if (!cleValide) return reponse(401, { erreur: 'Appel non autorisé' });

  const c = compteService();
  if (!c) return reponse(200, { configure: false });

  const { data, error } = await admin.rpc('prendre_notifications_push', { p_limite: 200 });
  if (error) return reponse(500, { erreur: error.message });
  const notifications = (data ?? []) as Notification[];
  let envoyees = 0;
  let echecs = 0;
  const perimes: string[] = [];
  for (const n of notifications) {
    for (const jeton of n.jetons ?? []) {
      try {
        const resultat = await envoyer(c, jeton, n);
        if (resultat === 'ok') envoyees += 1;
        else if (resultat === 'perime') perimes.push(jeton);
        else echecs += 1;
      } catch (e) {
        echecs += 1;
        console.warn('Envoi push impossible :', e instanceof Error ? e.message : e);
      }
    }
  }
  if (perimes.length) await admin.rpc('retirer_jetons_push', { p_jetons: perimes });
  return reponse(200, { configure: true, notifications: notifications.length, envoyees, echecs, jetons_retires: perimes.length });
});

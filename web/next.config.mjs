// Garde-fou S20 : le mode démonstration (NEXT_PUBLIC_MODE_DEMO=1) remplace Supabase par un client en
// mémoire qui accepte N'IMPORTE QUEL identifiant. Il ne doit JAMAIS être livré en production. Vercel
// expose VERCEL_ENV ('production' | 'preview' | 'development') au build ; on fait échouer le build de
// production si le mode démo y est actif (local et prévisualisations ne sont pas touchés).
if (process.env.VERCEL_ENV === 'production' && process.env.NEXT_PUBLIC_MODE_DEMO === '1') {
  throw new Error(
    'NEXT_PUBLIC_MODE_DEMO=1 est interdit en production (connexion sans mot de passe). ' +
      'Retirez cette variable de l\'environnement de production Vercel.',
  );
}

// Content-Security-Policy complète (audit S20). Avant : seul frame-ancestors/base-uri/object-src/
// form-action étaient posés, sans script-src/default-src/connect-src — une XSS unique pouvait exfiltrer
// le jeton (stocké en localStorage) vers n'importe quel hôte. On pose default-src 'self' et on
// restreint connect-src/img-src aux fournisseurs réellement appelés, dérivés de l'environnement.
// script-src/style-src gardent 'unsafe-inline' : Next (App Router) injecte des scripts de bootstrap
// inline et il n'y a pas de middleware pour poser un nonce (on évite d'alourdir). Le gain principal
// est connect-src : même en cas de XSS, l'exfiltration hors des origines listées est bloquée.
function origine(url) {
  try { return new URL(url).origin; } catch { return ''; }
}
const SUPABASE = origine(process.env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_WS = SUPABASE ? SUPABASE.replace(/^http/, 'ws') : ''; // Realtime (websocket)
// R2 (photos, tuiles réseau, fond de carte) : les Edge Functions signent toujours sur
// https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com/<compartiment>/… (jamais r2.dev). Le joker par défaut couvre ce
// compte mais aussi tout autre compte R2 ; pour le verrouiller sur le seul compte STEPAG, poser
// NEXT_PUBLIC_R2_PUBLIC_HOST = https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com (cette valeur REMPLACE le joker :
// n'y mettre que l'hôte du compte, sinon photos et tuiles R2 sont bloquées).
const R2 = process.env.NEXT_PUBLIC_R2_PUBLIC_HOST || 'https://*.r2.cloudflarestorage.com';
const ESRI = 'https://ibasemaps-api.arcgis.com';
// Fond OpenStreetMap d'OpenFreeMap (carte/commun.ts : STYLE_FOND) : style, tuiles, glyphes et icônes sur cette
// seule origine. Utilisé par le suivi GPS, le rapport de balayage, le zonage, la mini-carte et la carte sans fond local.
const OPENFREEMAP = 'https://tiles.openfreemap.org';
// Photos fictives du mode démonstration (lib/demo/client.ts) : jamais en production (garde de build ci-dessus).
const DEMO = process.env.NEXT_PUBLIC_MODE_DEMO === '1' ? 'https://picsum.photos https://fastly.picsum.photos' : '';
const liste = (...v) => v.filter(Boolean).join(' ');

const CSP = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'self'`,
  `form-action 'self'`,
  // 'unsafe-eval' en développement seulement : React Refresh (next dev) évalue du code ; le build de prod n'en a pas besoin.
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
  `style-src 'self' 'unsafe-inline'`,
  `font-src 'self'`,
  `worker-src 'self' blob:`,
  `child-src 'self' blob:`,
  `img-src 'self' data: blob: ${liste(SUPABASE, R2, ESRI, OPENFREEMAP, DEMO)}`,
  `connect-src ${liste("'self'", SUPABASE, SUPABASE_WS, R2, ESRI, OPENFREEMAP, DEMO)}`,
].join('; ');

const ENTETES_SECURITE = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
];

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: ENTETES_SECURITE }];
  },
};

export default config;

// En-têtes de sécurité posés sur toutes les réponses (audit S20). Vercel ajoute déjà Strict-Transport-Security.
// frame-ancestors 'self' : une page du panneau ne s'affiche jamais dans le cadre d'un autre site (détournement de clic) ;
// /mini-carte reste ouvrable dans un cadre du panneau lui-même, et l'APK ouvre les pages dans une WebView (pas un cadre).
const ENTETES_SECURITE = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
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

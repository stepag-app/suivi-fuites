// Lecture du fragment d'adresse de /session (contrat § 5 et § 6) : l'APK ouvre
// `/session#access_token=…&refresh_token=…&suite=/carte?mode=balayage`. Les jetons restent dans le
// fragment (jamais envoyé au serveur) et sont effacés dès la session posée. Fonctions pures.

export interface JetonsSession {
  access_token: string;
  refresh_token: string;
  suite: string;
}

export const SUITE_DEFAUT = '/carte';

/** Chemin relatif de l'application seulement : commence par « / », pas « // », pas de schéma, pas de retour arrière. */
export function suiteSure(valeur: string | null | undefined): string {
  if (!valeur) return SUITE_DEFAUT;
  const s = valeur.trim();
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return SUITE_DEFAUT;
  if (/[\s\\]/.test(s) || s.includes('://') || /^\/[a-z][a-z0-9+.-]*:/i.test(s)) return SUITE_DEFAUT;
  if (s.split(/[?#]/)[0].split('/').includes('..')) return SUITE_DEFAUT;
  if (s.startsWith('/session')) return SUITE_DEFAUT;
  return s.length > 500 ? SUITE_DEFAUT : s;
}

const JETON = /^[A-Za-z0-9._~+/=-]{10,}$/;

/** Jetons et suite, ou un message d'erreur lisible. */
export function lireFragmentSession(fragment: string): JetonsSession | { erreur: string } {
  const texte = (fragment ?? '').replace(/^#/, '');
  if (!texte) return { erreur: 'Aucun jeton de session dans l\'adresse.' };
  const p = new URLSearchParams(texte);
  const access = p.get('access_token')?.trim() ?? '';
  const refresh = p.get('refresh_token')?.trim() ?? '';
  if (!access || !refresh) return { erreur: 'Jetons de session incomplets : ouvrez la carte depuis l\'application de la tablette.' };
  if (!JETON.test(access) || !JETON.test(refresh)) return { erreur: 'Jetons de session illisibles.' };
  return { access_token: access, refresh_token: refresh, suite: suiteSure(p.get('suite')) };
}

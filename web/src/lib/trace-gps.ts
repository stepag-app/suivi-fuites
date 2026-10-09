// Suivi GPS (S11, X6) : calculs sans écran sur les tracés lus par `trace_gps` (points [longitude, latitude, horodatage Unix]).
// Vérifiés par scripts/verifier-trace-gps.mjs.

export type PointTrace = [lon: number, lat: number, t: number];

/** Ligne de la vue `v_traces_gps` : un tracé par agent et par jour. */
export interface LigneTrace {
  id: string;
  marche_id: string;
  profil_id: string;
  identifiant: string;
  nom_complet: string;
  jour: string;
  debut: string;
  fin: string;
  nb_points: number;
  distance_m: number;
}

/** Réponse de la fonction `trace_gps`. */
export interface TraceDetail {
  id: string;
  jour: string;
  profil_id: string;
  debut: string;
  fin: string;
  nb_points: number;
  distance_m: number;
  points: PointTrace[];
}

/** Au-delà de cet écart sans point (tablette éteinte, hors réseau GPS, pause), le tracé est coupé au lieu de tirer un trait droit. */
export const ECART_COUPURE_S = 10 * 60;

export function segmenter(points: PointTrace[], ecartMaxS = ECART_COUPURE_S): PointTrace[][] {
  const segments: PointTrace[][] = [];
  let courant: PointTrace[] = [];
  for (const p of points) {
    const dernier = courant[courant.length - 1];
    if (dernier && p[2] - dernier[2] > ecartMaxS) {
      segments.push(courant);
      courant = [];
    }
    courant.push(p);
  }
  if (courant.length) segments.push(courant);
  return segments;
}

/** Durée entre les deux bornes ET temps réellement suivi (sans les trous de plus de ECART_COUPURE_S). */
export function resume(points: PointTrace[]) {
  const segments = segmenter(points);
  const suivi = segments.reduce((n, s) => n + (s.length > 1 ? s[s.length - 1][2] - s[0][2] : 0), 0);
  return {
    debut: points[0]?.[2] ?? null,
    fin: points[points.length - 1]?.[2] ?? null,
    suiviS: suivi,
    coupures: Math.max(0, segments.length - 1),
  };
}

export const kilometres = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`);

export function duree(s: number): string {
  const min = Math.round(s / 60);
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

export const heureMaroc = (t: number) =>
  new Date(t * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Casablanca' });

/** Jour civil à Oujda (AAAA-MM-JJ). */
export const jourDe = (date: Date) => date.toLocaleDateString('sv-SE', { timeZone: 'Africa/Casablanca' });

/** Jour décalé de `n` jours (AAAA-MM-JJ), sans passer par un fuseau. */
export function decalerJour(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

// Une couleur par agent, distinctes entre elles et lisibles sur le fond clair de la carte.
export const COULEURS_AGENTS = ['#1d6fd8', '#e0561a', '#14956a', '#8a3fc7', '#c4268a', '#a07400', '#0f8fa8', '#6b7a1c', '#c23030', '#4a5bd6', '#2f7d32', '#7a4d2b'];
export const couleurAgent = (rang: number) => COULEURS_AGENTS[rang % COULEURS_AGENTS.length];

/** Cadre [ouest, sud, est, nord] d'un ensemble de points ; null s'il n'y en a pas. */
export function cadre(points: PointTrace[]): [number, number, number, number] | null {
  if (!points.length) return null;
  let o = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lon, lat] of points) {
    if (lon < o) o = lon;
    if (lon > e) e = lon;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [o, s, e, n];
}

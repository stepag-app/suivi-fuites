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

/**
 * Durée entre les deux bornes ET temps réellement suivi (sans les trous de plus de ECART_COUPURE_S). Un trou couvert
 * par une pause de l'agent (`pauses` : [début, fin] en secondes Unix) n'est pas une coupure.
 */
export function resume(points: PointTrace[], pauses: [number, number][] = []) {
  const segments = segmenter(points);
  const suivi = segments.reduce((n, s) => n + (s.length > 1 ? s[s.length - 1][2] - s[0][2] : 0), 0);
  let coupures = 0;
  for (let i = 1; i < segments.length; i++) {
    const de = segments[i - 1][segments[i - 1].length - 1][2];
    const a = segments[i][0][2];
    if (!pauses.some(([d, f]) => d < a && f > de)) coupures++;
  }
  return {
    debut: points[0]?.[2] ?? null,
    fin: points[points.length - 1]?.[2] ?? null,
    suiviS: suivi,
    coupures,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Heures de travail, pauses et état de la tablette (compromis du 2026-10-10)
// ---------------------------------------------------------------------------------------------------------------------

/** Ligne de `pauses_gps` : aucune position, seulement les heures. */
export interface PauseGps {
  profil_id: string;
  debut: string;
  fin_prevue: string;
  fin: string | null;
  motif_fin: 'automatique' | 'agent' | 'fuite' | 'balayage' | 'fin_journee' | 'quitter' | null;
}

/** Ligne de la vue `v_suivi_gps_etats`. */
export interface EtatGps {
  marche_id: string;
  profil_id: string;
  identifiant: string;
  nom_complet: string;
  etat: 'actif' | 'pause' | 'hors_heures' | 'autorisation' | 'ferme';
  dernier_signe: string;
  dernier_suivi: string | null;
  pause_debut: string | null;
  pause_fin_prevue: string | null;
  coupe_depuis: string | null;
}

export const secondes = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

/** Bornes d'une pause en secondes ; en cours : jusqu'à maintenant (au plus sa fin prévue). */
export function bornesPause(p: PauseGps, maintenantS = Math.floor(Date.now() / 1000)): [number, number] {
  const debut = secondes(p.debut);
  return [debut, p.fin ? secondes(p.fin) : Math.max(debut, Math.min(maintenantS, secondes(p.fin_prevue)))];
}

export const MOTIFS_FIN_PAUSE: Record<NonNullable<PauseGps['motif_fin']>, string> = {
  automatique: 'reprise automatique', agent: 'reprise par l\'agent', fuite: 'fuite signalée', balayage: 'tronçon coché',
  fin_journee: 'fin des heures', quitter: 'session fermée',
};

/** « 12:31 → 13:31 (60 min) », ou « 12:31 → en cours (jusqu'à 13:31 au plus) ». */
export function textePause(p: PauseGps, maintenantS = Math.floor(Date.now() / 1000)): string {
  const [d, f] = bornesPause(p, maintenantS);
  if (!p.fin && maintenantS < secondes(p.fin_prevue)) {
    return `${heureMaroc(d)} → en cours (jusqu'à ${heureMaroc(secondes(p.fin_prevue))} au plus)`;
  }
  return `${heureMaroc(d)} → ${heureMaroc(f)} (${duree(f - d)})`;
}

export const totalPausesS = (pauses: PauseGps[], maintenantS = Math.floor(Date.now() / 1000)) =>
  pauses.reduce((n, p) => { const [d, f] = bornesPause(p, maintenantS); return n + (f - d); }, 0);

/** État de la tablette en clair ; `alerte` : à signaler au responsable (suivi coupé, autorisation refusée). */
export function texteEtat(e: EtatGps): { texte: string; alerte: boolean } {
  if (e.coupe_depuis) return { texte: `Suivi coupé depuis ${heureMaroc(secondes(e.coupe_depuis))}`, alerte: true };
  switch (e.etat) {
    case 'actif': return { texte: 'Suivi actif', alerte: false };
    case 'pause': return {
      texte: e.pause_fin_prevue ? `En pause jusqu'à ${heureMaroc(secondes(e.pause_fin_prevue))}` : 'Pause terminée', alerte: false,
    };
    case 'hors_heures': return { texte: 'Hors des heures de travail', alerte: false };
    case 'autorisation': return { texte: 'Autorisation de position refusée sur la tablette', alerte: true };
    default: return { texte: 'Session fermée (« Quitter »)', alerte: false };
  }
}

const NOMS_JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** « du lundi au samedi », « tous les jours », ou la liste des jours (1 = lundi). */
export function texteJours(jours: number[]): string {
  const j = [...new Set(jours)].filter((x) => x >= 1 && x <= 7).sort((a, b) => a - b);
  if (j.length === 7) return 'tous les jours';
  if (j.length >= 3 && j.every((x, i) => i === 0 || x === j[i - 1] + 1)) return `du ${NOMS_JOURS[j[0] - 1]} au ${NOMS_JOURS[j[j.length - 1] - 1]}`;
  return j.map((x) => NOMS_JOURS[x - 1]).join(', ');
}

/** « 08:00 » depuis « 08:00:00 » ; « 24:00 » pour minuit en fin de journée. */
export const heureCourte = (h: string | null | undefined) => (h ?? '').slice(0, 5);

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

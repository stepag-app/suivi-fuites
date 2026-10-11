// Suivi GPS (X6), règles sans module natif (testées sans pile : essais/suivi-gps.test.mjs).
// Point = [horodatage Unix en secondes, longitude, latitude], le format de ajouter_points_trace (base).
// Décisions d'Issam (Q14) : un point tous les 15 m, ou toutes les 30 s si l'agent se déplace ; heures de travail et pauses
// (2026-10-10) en fin de fichier.

export type Point = [t: number, lon: number, lat: number];
/** Mesure brute de la tablette : position, précision annoncée (m), horodatage en millisecondes. */
export interface Mesure { lon: number; lat: number; precision: number | null; ms: number }
/** Points d'un agent dans un marché, en attente d'envoi. */
export interface Lot { u: string; m: string; pts: Point[] }
/** `pauses` : pauses à envoyer (absent dans une file écrite avant le compromis). */
export interface EtatFile { dernier: Point | null; lots: Lot[]; pauses?: PauseEnvoi[] }

export const DISTANCE_M = 15;
export const DELAI_S = 30;
/** En dessous, un écart n'est pas un déplacement (dérive du GPS à l'arrêt). */
export const MOUVEMENT_MIN_M = 8;
export const PRECISION_MAX_M = 50;
/** Vitesse au-delà de laquelle une mesure est un saut du GPS, pas un déplacement (m/s, 200 km/h). */
export const VITESSE_MAX_MS = 55;
export const LOT_MAX = 500;
/** File de la tablette : au-delà, les plus anciens points sont abandonnés (environ 4 jours de travail). */
export const FILE_MAX = 20000;
/** La base ignore les points de plus de 7 jours : inutile de les garder. */
export const AGE_MAX_S = 7 * 86400;

export const FILE_VIDE: EtatFile = { dernier: null, lots: [] };

export function distanceM(a: Point, b: Point): number {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b[2] - a[2]) * rad;
  const dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[2] * rad) * Math.cos(b[2] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const arrondi = (x: number) => Math.round(x * 1e6) / 1e6;

/** La mesure devient-elle un point du tracé ? Sinon `null`. */
export function pointRetenu(dernier: Point | null, m: Mesure): Point | null {
  if (!Number.isFinite(m.lon) || !Number.isFinite(m.lat) || !Number.isFinite(m.ms)) return null;
  if (m.precision != null && m.precision > PRECISION_MAX_M) return null;
  const p: Point = [Math.floor(m.ms / 1000), arrondi(m.lon), arrondi(m.lat)];
  if (!dernier) return p;
  const dt = p[0] - dernier[0];
  if (dt <= 0) return null;
  const d = distanceM(dernier, p);
  if (d / dt > VITESSE_MAX_MS) return null;
  if (d >= DISTANCE_M) return p;
  if (dt >= DELAI_S && d >= Math.max(MOUVEMENT_MIN_M, m.precision ?? 0)) return p;
  return null;
}

/** Ajoute un point à la file de l'agent `u` dans le marché `m` (nouvelle file : le tout dernier lot s'il est du même agent). */
export function ajouterPoint(etat: EtatFile, u: string, m: string, p: Point): EtatFile {
  const lots = etat.lots.map((l) => ({ ...l }));
  const dernierLot = lots[lots.length - 1];
  if (dernierLot && dernierLot.u === u && dernierLot.m === m && dernierLot.pts.length < LOT_MAX) {
    dernierLot.pts = [...dernierLot.pts, p];
  } else {
    lots.push({ u, m, pts: [p] });
  }
  return { ...etat, dernier: p, lots: borner(lots) };
}

/** Abandonne les points trop vieux, puis les plus anciens au-delà de FILE_MAX. */
export function borner(lots: Lot[], maintenantS = Math.floor(Date.now() / 1000)): Lot[] {
  const recents = lots
    .map((l) => ({ ...l, pts: l.pts.filter((p) => maintenantS - p[0] <= AGE_MAX_S) }))
    .filter((l) => l.pts.length);
  let total = recents.reduce((n, l) => n + l.pts.length, 0);
  while (total > FILE_MAX && recents.length) {
    const exces = total - FILE_MAX;
    const l = recents[0];
    if (l.pts.length <= exces) {
      total -= l.pts.length;
      recents.shift();
    } else {
      l.pts = l.pts.slice(exces);
      total -= exces;
    }
  }
  return recents;
}

export const nbPoints = (etat: EtatFile) => etat.lots.reduce((n, l) => n + l.pts.length, 0);

export type Reponse = 'ok' | 'refus' | 'reseau';
/** Points traités par la base (acceptés, ou refusés pour de bon) : à retirer de la file. */
export interface Acquit { m: string; ts: number[] }

/**
 * Envoie les points de l'agent connecté `u` (copie de la file prise au départ), marché par marché, par paquets de
 * LOT_MAX. `ok` : paquet acquitté ; `refus` (compte révoqué, plus affecté, marché désactivé : réponse définitive) :
 * paquet abandonné, donc acquitté aussi ; `reseau` : on s'arrête, tout le reste attend. Les points d'un autre agent
 * ne partent pas (ils partiront quand il se reconnectera). Pendant l'envoi la tablette continue d'ajouter des points :
 * l'appelant retire les acquittés de la file à jour (`retirerAcquits`), jamais d'une copie périmée.
 */
export async function envoyerFile(
  etat: EtatFile, u: string, envoyer: (marche: string, pts: Point[]) => Promise<Reponse>,
): Promise<{ acquits: Acquit[]; envoyes: number; interrompu: boolean }> {
  const acquits: Acquit[] = [];
  let envoyes = 0;
  for (const lot of etat.lots) {
    if (lot.u !== u) continue;
    for (let i = 0; i < lot.pts.length; i += LOT_MAX) {
      const paquet = lot.pts.slice(i, i + LOT_MAX);
      const reponse = await envoyer(lot.m, paquet);
      if (reponse === 'reseau') return { acquits, envoyes, interrompu: true };
      if (reponse === 'ok') envoyes += paquet.length;
      acquits.push({ m: lot.m, ts: paquet.map((p) => p[0]) });
    }
  }
  return { acquits, envoyes, interrompu: false };
}

/** Retire de la file (à jour) les points acquittés pour l'agent `u`. */
export function retirerAcquits(etat: EtatFile, u: string, acquits: Acquit[]): EtatFile {
  if (!acquits.length) return etat;
  const lots = etat.lots
    .map((l) => {
      if (l.u !== u) return l;
      const ts = new Set(acquits.filter((a) => a.m === l.m).flatMap((a) => a.ts));
      return ts.size ? { ...l, pts: l.pts.filter((p) => !ts.has(p[0])) } : l;
    })
    .filter((l) => l.pts.length);
  return { ...etat, lots };
}

// ---------------------------------------------------------------------------------------------------------------------
// Heures de travail et pauses (compromis présenté aux agents, 2026-10-10) : rien d'enregistré hors des heures du marché
// ni pendant une pause. Heure de la tablette (heure d'Oujda affichée à l'agent, réglée par le réseau).
// ---------------------------------------------------------------------------------------------------------------------

/** Réglages du marché (marches.suivi_gps_*) : heures en minutes depuis minuit, jours 1 = lundi … 7 = dimanche. */
export interface ReglagesSuivi { debut: number; fin: number; jours: number[]; pauseMin: number; pauseJourMin: number }
export const REGLAGES_DEFAUT: ReglagesSuivi = { debut: 8 * 60, fin: 18 * 60, jours: [1, 2, 3, 4, 5, 6], pauseMin: 60, pauseJourMin: 90 };

/** Colonnes du marché telles que la base les rend (« 08:00:00 »). */
export interface ColonnesSuivi {
  suivi_gps_debut?: string | null; suivi_gps_fin?: string | null; suivi_gps_jours?: number[] | null;
  suivi_gps_pause_min?: number | null; suivi_gps_pause_jour_min?: number | null;
}

function minutes(h: string | null | undefined, defaut: number): number {
  const m = typeof h === 'string' ? /^(\d{1,2}):(\d{2})/.exec(h) : null;
  const v = m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
  return Number.isInteger(v) && v >= 0 && v <= 24 * 60 ? v : defaut;
}

/** Réglages d'un marché ; base pas encore à jour (colonnes absentes) : valeurs par défaut. */
export function reglagesSuivi(m: ColonnesSuivi | null | undefined): ReglagesSuivi {
  const d = REGLAGES_DEFAUT;
  const jours = (m?.suivi_gps_jours ?? []).filter((j) => Number.isInteger(j) && j >= 1 && j <= 7);
  const r: ReglagesSuivi = {
    debut: minutes(m?.suivi_gps_debut, d.debut),
    fin: minutes(m?.suivi_gps_fin, d.fin),
    jours: jours.length ? [...new Set(jours)].sort() : d.jours,
    pauseMin: Number.isFinite(m?.suivi_gps_pause_min) ? Number(m?.suivi_gps_pause_min) : d.pauseMin,
    pauseJourMin: Number.isFinite(m?.suivi_gps_pause_jour_min) ? Number(m?.suivi_gps_pause_jour_min) : d.pauseJourMin,
  };
  return r.fin > r.debut ? r : { ...r, debut: d.debut, fin: d.fin };
}

export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Jour (AAAA-MM-JJ), jour de la semaine (1 = lundi) et minutes depuis minuit, à l'heure de la tablette. */
export function heureLocale(ms: number): { jour: string; isoJour: number; minutes: number } {
  const d = new Date(ms);
  const jour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { jour, isoJour: d.getDay() || 7, minutes: d.getHours() * 60 + d.getMinutes() };
}

export function dansHeures(r: ReglagesSuivi, ms: number): boolean {
  const l = heureLocale(ms);
  return r.jours.includes(l.isoJour) && l.minutes >= r.debut && l.minutes < r.fin;
}

/** Instant (ms) de l'heure `min` (minutes depuis minuit) du jour de `ms`, décalé de `jours`. */
export function instantDuJour(ms: number, min: number, jours = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + jours, Math.floor(min / 60), min % 60, 0, 0).getTime();
}

/** Prochain début des heures de travail après `ms` (rappel du matin) ; null si aucun jour n'est travaillé. */
export function prochainDebut(r: ReglagesSuivi, ms: number): number | null {
  for (let i = 0; i <= 7; i++) {
    const debut = instantDuJour(ms, r.debut, i);
    if (debut > ms && r.jours.includes(heureLocale(debut).isoJour)) return debut;
  }
  return null;
}

export type MotifFin = 'automatique' | 'agent' | 'fuite' | 'balayage' | 'fin_journee' | 'quitter';
/** Pause de l'agent sur la tablette (ms) ; `fin` nulle tant qu'elle dure. Jamais de position. */
export interface PauseLocale { debut: number; finPrevue: number; fin: number | null; motif: MotifFin | null }

export const pauseEnCours = (pauses: PauseLocale[]) => pauses.find((p) => p.fin == null) ?? null;

/** Durée des pauses déjà prises le jour de `ms` (une pause en cours compte jusqu'à sa fin prévue, comme la base). */
export function pausesPrisesMs(pauses: PauseLocale[], ms: number): number {
  const jour = heureLocale(ms).jour;
  return pauses
    .filter((p) => heureLocale(p.debut).jour === jour)
    .reduce((n, p) => n + Math.max(0, (p.fin ?? p.finPrevue) - p.debut), 0);
}

export const pauseRestanteMs = (r: ReglagesSuivi, pauses: PauseLocale[], ms: number) =>
  Math.max(0, r.pauseJourMin * 60000 - pausesPrisesMs(pauses, ms));

/** Reprise automatique d'une pause commencée à `debut` : durée réglée, bornée par ce qui reste du jour. */
export const finPrevuePause = (r: ReglagesSuivi, pauses: PauseLocale[], debut: number) =>
  debut + Math.min(r.pauseMin * 60000, pauseRestanteMs(r, pauses, debut));

/** Mesure prise pendant une pause (aucune position gardée). */
export const pendantUnePause = (pauses: PauseLocale[], ms: number) =>
  pauses.some((p) => ms >= p.debut && ms < (p.fin ?? p.finPrevue));

/** Pauses des deux derniers jours seulement (le quota est par jour). */
export const pausesRecentes = (pauses: PauseLocale[], ms: number) => pauses.filter((p) => ms - p.debut < 2 * 86400000);

/** Pause à envoyer à la base (enregistrer_pause_gps), par agent et par marché. */
export interface PauseEnvoi { u: string; m: string; debut: number; fin: number | null; motif: MotifFin | null }

/** Ajoute ou remplace (même agent, marché et début) une pause dans la file d'envoi. */
export function fileAvecPause(etat: EtatFile, p: PauseEnvoi): EtatFile {
  const autres = (etat.pauses ?? []).filter((x) => !(x.u === p.u && x.m === p.m && x.debut === p.debut));
  return { ...etat, pauses: [...autres, p] };
}

/** Retire de la file les pauses acquittées, sauf si elles ont changé pendant l'envoi (fin arrivée entre-temps). */
export function retirerPauses(etat: EtatFile, faites: PauseEnvoi[]): EtatFile {
  if (!faites.length) return etat;
  const restantes = (etat.pauses ?? []).filter((x) => !faites.some((f) => f.u === x.u && f.m === x.m && f.debut === x.debut && f.fin === x.fin));
  return { ...etat, pauses: restantes };
}

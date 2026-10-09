// Suivi GPS (X6), règles sans module natif (testées sans pile : essais/suivi-gps.test.mjs).
// Point = [horodatage Unix en secondes, longitude, latitude], le format de ajouter_points_trace (base).
// Décisions d'Issam (Q14) : un point tous les 15 m, ou toutes les 30 s si l'agent se déplace.

export type Point = [t: number, lon: number, lat: number];
/** Mesure brute de la tablette : position, précision annoncée (m), horodatage en millisecondes. */
export interface Mesure { lon: number; lat: number; precision: number | null; ms: number }
/** Points d'un agent dans un marché, en attente d'envoi. */
export interface Lot { u: string; m: string; pts: Point[] }
export interface EtatFile { dernier: Point | null; lots: Lot[] }

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
  return { dernier: p, lots: borner(lots) };
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

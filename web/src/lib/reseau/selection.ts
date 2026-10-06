// Sélection de tronçons sur la carte : clic, Maj+clic, rectangle, lasso. Fonctions pures (sans MapLibre),
// vérifiées par scripts/verifier-reseau.mjs. La règle est celle de la base (contrat § 3) : un tronçon est
// « dans » un polygone si son milieu l'est.
import type { MultiPolygon, Polygon } from 'geojson';
import { nombre } from '@/lib/format';
import type { FeatureTroncon } from './types';

export type Position = [number, number];
export type ModeSelection = 'remplacer' | 'ajouter' | 'basculer' | 'retirer';

const RAYON_TERRE_M = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Distance entre deux points WGS84 (mètres, formule de haversine). */
export function distanceMetres(a: Position, b: Position): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const longueurMetres = (coords: Position[] | number[][]) =>
  coords.reduce((t, p, i) => (i === 0 ? 0 : t + distanceMetres(coords[i - 1] as Position, p as Position)), 0);

/** Point à mi-longueur d'une ligne (équivalent de ST_LineInterpolatePoint(geom, 0.5)). */
export function milieuLigne(coords: Position[] | number[][]): Position {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1) return [coords[0][0], coords[0][1]];
  const total = longueurMetres(coords);
  if (total === 0) return [coords[0][0], coords[0][1]];
  let reste = total / 2;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1] as Position;
    const b = coords[i] as Position;
    const d = distanceMetres(a, b);
    if (d >= reste) {
      const t = d === 0 ? 0 : reste / d;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    reste -= d;
  }
  const dernier = coords[coords.length - 1];
  return [dernier[0], dernier[1]];
}

/** Point dans un anneau (lancer de rayon ; l'anneau peut être fermé ou non). */
export function pointDansAnneau(p: Position, anneau: number[][]): boolean {
  let dedans = false;
  const n = anneau.length;
  if (n < 3) return false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    const coupe = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (coupe) dedans = !dedans;
  }
  return dedans;
}

/** Point dans un polygone (trous respectés) ou un multipolygone. Accepte aussi un simple anneau. */
export function pointDansPolygone(p: Position, forme: Polygon | MultiPolygon | number[][] | number[][][]): boolean {
  if (Array.isArray(forme)) {
    if (forme.length === 0) return false;
    if (typeof forme[0][0] === 'number') return pointDansAnneau(p, forme as number[][]);
    return dansAnneaux(p, forme as number[][][]);
  }
  if (forme.type === 'Polygon') return dansAnneaux(p, forme.coordinates);
  return forme.coordinates.some((poly) => dansAnneaux(p, poly));
}

const dansAnneaux = (p: Position, anneaux: number[][][]) =>
  anneaux.length > 0 && pointDansAnneau(p, anneaux[0]) && !anneaux.slice(1).some((trou) => pointDansAnneau(p, trou));

/** Anneau fermé d'un rectangle défini par deux coins opposés. */
export function rectangleEnAnneau(a: Position, b: Position): number[][] {
  const x1 = Math.min(a[0], b[0]);
  const x2 = Math.max(a[0], b[0]);
  const y1 = Math.min(a[1], b[1]);
  const y2 = Math.max(a[1], b[1]);
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
}

/** Anneau fermé d'un lasso : points consécutifs identiques retirés ; null s'il y a moins de 3 points distincts. */
export function lassoEnAnneau(points: Position[]): number[][] | null {
  const propres: number[][] = [];
  for (const p of points) {
    const d = propres[propres.length - 1];
    if (!d || d[0] !== p[0] || d[1] !== p[1]) propres.push([p[0], p[1]]);
  }
  if (propres.length >= 2 && propres[0][0] === propres[propres.length - 1][0] && propres[0][1] === propres[propres.length - 1][1]) propres.pop();
  if (propres.length < 3) return null;
  return [...propres, propres[0]];
}

export const anneauEnPolygone = (anneau: number[][]): Polygon => ({ type: 'Polygon', coordinates: [anneau] });

/**
 * Bornes [[ouest, sud], [est, nord]] d'une liste de positions, par boucle : `Math.min(...liste)` dépasse la
 * pile d'appels au-delà de ~100 000 valeurs (réseau complet : ~46 000 tronçons, ~140 000 sommets). null si vide.
 */
export function bornesPositions(positions: Iterable<number[]>): [Position, Position] | null {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const p of positions) {
    if (p[0] < x1) x1 = p[0];
    if (p[0] > x2) x2 = p[0];
    if (p[1] < y1) y1 = p[1];
    if (p[1] > y2) y2 = p[1];
  }
  return Number.isFinite(x1) ? [[x1, y1], [x2, y2]] : null;
}

export function bornesAnneau(anneau: number[][]): [Position, Position] {
  return bornesPositions(anneau) ?? [[0, 0], [0, 0]];
}

/** Toutes les positions des tronçons, sans copie intermédiaire (pour bornesPositions). */
export function* sommetsTroncons(features: Iterable<FeatureTroncon>): Generator<number[]> {
  for (const f of features) if (f.geometry?.type === 'LineString') yield* f.geometry.coordinates;
}

/** Identifiants des tronçons dont le milieu est dans l'anneau. */
export function idsDansAnneau(features: FeatureTroncon[], anneau: number[][]): string[] {
  return features
    .filter((f) => f.geometry?.type === 'LineString' && pointDansAnneau(milieuLigne(f.geometry.coordinates as Position[]), anneau))
    .map((f) => f.properties.id);
}

/** Tronçon indexé : milieu, extrémités et longueur calculés une fois (50 000 tronçons : quelques dizaines de ms). */
export interface TronconIndexe {
  id: string;
  milieu: Position;
  debut: Position;
  fin: Position;
  longueur: number;        // m : propriété `l` de la base, sinon longueur calculée
  secteur: string | null;
  feature: FeatureTroncon;
}

export function indexerTroncons(features: FeatureTroncon[]): Map<string, TronconIndexe> {
  const index = new Map<string, TronconIndexe>();
  for (const f of features) {
    if (!f?.properties?.id || f.geometry?.type !== 'LineString' || f.geometry.coordinates.length < 2) continue;
    const coords = f.geometry.coordinates as Position[];
    const l = Number(f.properties.l);
    index.set(f.properties.id, {
      id: f.properties.id, milieu: milieuLigne(coords),
      debut: [coords[0][0], coords[0][1]], fin: [coords[coords.length - 1][0], coords[coords.length - 1][1]],
      longueur: Number.isFinite(l) && l > 0 ? l : longueurMetres(coords),
      secteur: f.properties.s ?? null, feature: f,
    });
  }
  return index;
}

// ---- « Prolonger » : suivre la rue depuis un tronçon sélectionné ------------------------------------------
// Les tronçons sont coupés à chaque jonction (longueur médiane 25 à 35 m) : on avance de bout en bout tant
// que le tronçon suivant est seul au sommet (pas de jonction à 3 branches ou plus) et dans l'alignement.

/** Clé d'un sommet (coordonnées à 6 décimales ≈ 0,1 m, comme la base). */
export const cleSommet = (p: Position) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

/** sommet → identifiants des tronçons qui y ont une extrémité. */
export function construireAdjacence(index: Iterable<TronconIndexe>): Map<string, string[]> {
  const adjacence = new Map<string, string[]>();
  const ajouter = (cle: string, id: string) => {
    const liste = adjacence.get(cle);
    if (!liste) adjacence.set(cle, [id]);
    else if (!liste.includes(id)) liste.push(id);
  };
  for (const t of index) {
    ajouter(cleSommet(t.debut), t.id);
    ajouter(cleSommet(t.fin), t.id);
  }
  return adjacence;
}

/** Azimut de a vers b, en degrés (0 = nord, 90 = est). */
export function azimut(a: Position, b: Position): number {
  const dLng = rad(b[0] - a[0]);
  const y = Math.sin(dLng) * Math.cos(rad(b[1]));
  const x = Math.cos(rad(a[1])) * Math.sin(rad(b[1])) - Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Écart entre deux azimuts, 0 à 180°. */
export function ecartAngle(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

const memeSommet = (a: Position, b: Position) => cleSommet(a) === cleSommet(b);

/**
 * Tronçons à ajouter en prolongeant chaque tronçon de `depart` par ses deux bouts : voisin unique au
 * sommet (une jonction à 3 branches ou plus arrête), dans l'alignement (± `angleMax`), jamais déjà choisi.
 */
export function prolongerSelection(
  index: Map<string, TronconIndexe>, adjacence: Map<string, string[]>, depart: Iterable<string>, angleMax = 20, maxPas = 500,
): string[] {
  const choisis = new Set(depart);
  const ajoutes: string[] = [];
  for (const id of [...choisis]) {
    const t = index.get(id);
    if (!t) continue;
    for (const bout of ['debut', 'fin'] as const) {
      let courant = t;
      let point = bout === 'debut' ? t.debut : t.fin;
      let arrivee = azimutArrivee(courant, point);
      for (let pas = 0; pas < maxPas; pas++) {
        const voisins = (adjacence.get(cleSommet(point)) ?? []).filter((v) => v !== courant.id);
        if (voisins.length !== 1) break;                       // cul-de-sac (0) ou jonction (≥ 2 autres)
        const suivant = index.get(voisins[0]);
        if (!suivant || choisis.has(suivant.id)) break;
        const parDebut = memeSommet(suivant.debut, point);
        const coords = suivant.feature.geometry.coordinates as Position[];
        const depart2 = parDebut ? coords[1] : coords[coords.length - 2];
        if (ecartAngle(arrivee, azimut(point, depart2)) > angleMax) break;
        choisis.add(suivant.id);
        ajoutes.push(suivant.id);
        point = parDebut ? suivant.fin : suivant.debut;
        courant = suivant;
        arrivee = azimutArrivee(courant, point);
      }
    }
  }
  return ajoutes;
}

/** Direction dans laquelle on arrive au bout `point` du tronçon (depuis l'avant-dernier sommet). */
function azimutArrivee(t: TronconIndexe, point: Position): number {
  const coords = t.feature.geometry.coordinates as Position[];
  const avant = memeSommet(point, t.fin) ? coords[coords.length - 2] : coords[1];
  return azimut(avant, point);
}

/** Identifiants des tronçons indexés dont le milieu est dans l'anneau (bornes testées d'abord). */
export function idsIndexDansAnneau(index: Iterable<TronconIndexe>, anneau: number[][]): string[] {
  const [[x1, y1], [x2, y2]] = bornesAnneau(anneau);
  const ids: string[] = [];
  for (const t of index) {
    const [x, y] = t.milieu;
    if (x < x1 || x > x2 || y < y1 || y > y2) continue;
    if (pointDansAnneau(t.milieu, anneau)) ids.push(t.id);
  }
  return ids;
}

/** Nouvelle sélection (la sélection courante n'est jamais modifiée en place). */
export function appliquerSelection(courante: Set<string>, ids: string[], mode: ModeSelection): Set<string> {
  if (mode === 'remplacer') return new Set(ids);
  const s = new Set(courante);
  for (const id of ids) {
    if (mode === 'ajouter') s.add(id);
    else if (mode === 'retirer') s.delete(id);
    else if (s.has(id)) s.delete(id);
    else s.add(id);
  }
  return s;
}

/** Linéaire (m) d'une sélection, d'après la longueur connue de chaque tronçon. */
export function lineaireSelection(ids: Iterable<string>, longueurs: Map<string, number>): number {
  let total = 0;
  for (const id of ids) total += longueurs.get(id) ?? 0;
  return total;
}

/** « 850 m », « 1,25 km », « 12,3 km », « 125 km ». */
export function formaterLineaire(metres: number | null | undefined): string {
  if (metres == null || !Number.isFinite(metres)) return '—';
  if (Math.abs(metres) < 1000) return `${nombre(Math.round(metres), 0)} m`;
  const km = metres / 1000;
  return `${nombre(km, km < 10 ? 2 : km < 100 ? 1 : 0)} km`;
}

// Import GeoJSON du réseau (tronçons puis nœuds) : lecture et contrôle du fichier dans le navigateur,
// découpage en paquets pour `importer_troncons` / `importer_noeuds` (contrat § 3 et § 4). Fonctions pures.
import type { Feature, Geometry, MultiPolygon, Polygon } from 'geojson';
import type { ResultatImportReseau } from './types';

export const TAILLE_PAQUET = 1000;
export type GenreImport = 'troncons' | 'noeuds';

const CATEGORIES = new Set(['conduite', 'branchement', 'adduction', 'autre']);
const TYPES_NOEUD = new Set(['jonction', 'extremite', 'vanne', 'bouche_incendie', 'ventouse', 'vidange', 'compteur', 'reservoir', 'autre']);

export interface LectureGeoJSON {
  genre: GenreImport;
  /** Features gardées, telles qu'elles seront envoyées (propriétés utiles seulement). */
  features: Feature[];
  rejetees: { index: number; motif: string }[];
  resume: {
    total: number;
    calques: Map<string, number>;
    secteurs: Map<string, number>;   // secteur_code → nombre ; clé '' = sans secteur
    classes: Map<string, number>;    // catégorie (tronçons) ou type (nœuds) → nombre
    longueurApprox_m: number;        // tronçons : somme des longueurs (haversine), 0 pour les nœuds
    references_doublons: number;
  };
}

const texte = (v: unknown): string | null => {
  if (v == null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

const entier = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const RAYON = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;
function longueurLigne(coords: number[][]): number {
  let t = 0;
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    const h = Math.sin(rad(y2 - y1) / 2) ** 2 + Math.cos(rad(y1)) * Math.cos(rad(y2)) * Math.sin(rad(x2 - x1) / 2) ** 2;
    t += 2 * RAYON * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  return t;
}

const coordonneeValide = (c: unknown): c is number[] =>
  Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;

function geometrieValide(g: unknown, genre: GenreImport): g is Geometry {
  if (!g || typeof g !== 'object' || !('type' in g) || !('coordinates' in g)) return false;
  const geo = g as { type: string; coordinates: unknown };
  if (genre === 'troncons') {
    return geo.type === 'LineString' && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2 && geo.coordinates.every(coordonneeValide);
  }
  return geo.type === 'Point' && coordonneeValide(geo.coordinates);
}

// Fichiers de data-private/IMPORT-RESEAU (outils/reseau/preparer_import.py), un par étape d'import.
const ETAPES_FICHIER: Record<GenreImport | 'contours', { etape: string; fichier: string; contenu: string }> = {
  contours: { etape: '1. Contours des secteurs', fichier: '1-contours-secteurs.geojson', contenu: 'des contours de secteurs' },
  troncons: { etape: '2. Tronçons', fichier: '2-troncons.geojson', contenu: 'des tronçons' },
  noeuds: { etape: '3. Nœuds', fichier: '3-noeuds.geojson', contenu: 'des nœuds' },
};
const GENRE_GEOMETRIE: Record<string, GenreImport | 'contours'> = {
  Polygon: 'contours', MultiPolygon: 'contours', LineString: 'troncons', MultiLineString: 'troncons', Point: 'noeuds', MultiPoint: 'noeuds',
};

/** JSON → features d'une FeatureCollection ; refuse un fichier d'une autre étape avec le nom du bon fichier. */
function lireCollection(contenu: string, attendu: GenreImport | 'contours'): unknown[] {
  let brut: unknown;
  try {
    brut = JSON.parse(contenu);
  } catch {
    throw new Error('Le fichier n\'est pas un JSON lisible.');
  }
  const { fichier, etape } = ETAPES_FICHIER[attendu];
  if (!brut || typeof brut !== 'object' || (brut as { type?: unknown }).type !== 'FeatureCollection'
    || !Array.isArray((brut as { features?: unknown }).features)) {
    throw new Error(`Ce fichier n'est pas un plan GeoJSON (FeatureCollection). Prenez « ${fichier} » dans le dossier data-private/IMPORT-RESEAU (outils/reseau/secteurs.json n'est qu'une table de noms).`);
  }
  const features = (brut as { features: unknown[] }).features;
  const parGenre = new Map<string, number>();
  for (const f of features) {
    const genre = GENRE_GEOMETRIE[String((f as Partial<Feature>)?.geometry?.type)];
    if (genre) parGenre.set(genre, (parGenre.get(genre) ?? 0) + 1);
  }
  const dominant = [...parGenre.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as GenreImport | 'contours' | undefined;
  if (dominant && dominant !== attendu) {
    const autre = ETAPES_FICHIER[dominant];
    throw new Error(`Ce fichier contient ${autre.contenu} : il va à l'étape « ${autre.etape} » (${autre.fichier}). Pour l'étape « ${etape} », prenez « ${fichier} ».`);
  }
  return features;
}

/** Lit un fichier GeoJSON (texte) et ne garde que les features valides, avec les propriétés du contrat. */
export function lireFeatureCollection(contenu: string, genre: GenreImport): LectureGeoJSON {
  const features = lireCollection(contenu, genre);
  const lecture: LectureGeoJSON = {
    genre, features: [], rejetees: [],
    resume: { total: 0, calques: new Map(), secteurs: new Map(), classes: new Map(), longueurApprox_m: 0, references_doublons: 0 },
  };
  const compter = (m: Map<string, number>, cle: string) => m.set(cle, (m.get(cle) ?? 0) + 1);
  const references = new Set<string>();
  features.forEach((f, index) => {
    const feature = f as Partial<Feature>;
    const p = (feature?.properties ?? {}) as Record<string, unknown>;
    const reference = texte(p.reference);
    if (feature?.type !== 'Feature') return void lecture.rejetees.push({ index, motif: 'pas une Feature' });
    if (!reference) return void lecture.rejetees.push({ index, motif: 'référence absente' });
    if (!geometrieValide(feature.geometry, genre)) {
      return void lecture.rejetees.push({ index, motif: genre === 'troncons' ? 'géométrie LineString WGS84 attendue' : 'géométrie Point WGS84 attendue' });
    }
    if (references.has(reference)) lecture.resume.references_doublons++;
    references.add(reference);
    const calque = texte(p.calque);
    const secteurCode = texte(p.secteur_code);
    let proprietes: Record<string, unknown>;
    if (genre === 'troncons') {
      const categorieLue = texte(p.categorie)?.toLowerCase() ?? null;
      const categorie = categorieLue && CATEGORIES.has(categorieLue) ? categorieLue : 'conduite';
      proprietes = {
        reference, calque, categorie, diametre_mm: entier(p.diametre_mm), materiau: texte(p.materiau), secteur_code: secteurCode,
      };
      compter(lecture.resume.classes, categorie);
      lecture.resume.longueurApprox_m += longueurLigne((feature.geometry as { coordinates: number[][] }).coordinates);
    } else {
      const typeLu = texte(p.type)?.toLowerCase() ?? null;
      const type = typeLu && TYPES_NOEUD.has(typeLu) ? typeLu : 'jonction';
      proprietes = { reference, calque, type, secteur_code: secteurCode };
      compter(lecture.resume.classes, type);
    }
    compter(lecture.resume.calques, calque ?? '(sans calque)');
    compter(lecture.resume.secteurs, secteurCode ?? '');
    lecture.features.push({ type: 'Feature', geometry: feature.geometry as Geometry, properties: proprietes });
    lecture.resume.total++;
  });
  return lecture;
}

// ---- Contours des secteurs (secteurs.geojson, facultatif) -------------------------------------------------
// Contours STEPAG relevés sur les planches PDF : une Feature par secteur, MultiPolygon WGS84, propriété
// `secteur_code`. Chaque contour est envoyé à `definir_contour_secteur` ; un code inconnu du marché est listé,
// sans bloquer les autres.

export interface ContourSecteurLu {
  secteur_id: string;
  code: string;
  geometrie: Polygon | MultiPolygon;
}

export interface LectureContours {
  contours: ContourSecteurLu[];
  inconnus: { index: number; code: string }[];
  rejetees: { index: number; motif: string }[];
  total: number;
}

const anneauValide = (a: unknown) => Array.isArray(a) && a.length >= 4 && a.every(coordonneeValide);
function polygoneValide(g: unknown): g is Polygon | MultiPolygon {
  if (!g || typeof g !== 'object') return false;
  const { type, coordinates } = g as { type?: unknown; coordinates?: unknown };
  if (!Array.isArray(coordinates) || coordinates.length === 0) return false;
  if (type === 'Polygon') return coordinates.every(anneauValide);
  if (type === 'MultiPolygon') return coordinates.every((p) => Array.isArray(p) && p.length > 0 && p.every(anneauValide));
  return false;
}

/** Lit secteurs.geojson et retrouve l'identifiant de chaque secteur par son code dans le marché courant. */
export function lireContoursSecteurs(contenu: string, secteurs: { id: string; code: string }[]): LectureContours {
  const features = lireCollection(contenu, 'contours');
  const parCode = new Map(secteurs.map((s) => [s.code.trim(), s]));
  const parCodeMinuscule = new Map(secteurs.map((s) => [s.code.trim().toLowerCase(), s]));
  const lecture: LectureContours = { contours: [], inconnus: [], rejetees: [], total: 0 };
  const vus = new Set<string>();
  features.forEach((f, index) => {
    const feature = f as Partial<Feature>;
    lecture.total++;
    if (feature?.type !== 'Feature') return void lecture.rejetees.push({ index, motif: 'pas une Feature' });
    const code = texte((feature.properties as Record<string, unknown> | null)?.secteur_code);
    if (!code) return void lecture.rejetees.push({ index, motif: 'secteur_code absent' });
    if (!polygoneValide(feature.geometry)) return void lecture.rejetees.push({ index, motif: `${code} : géométrie Polygon ou MultiPolygon WGS84 attendue` });
    const secteur = parCode.get(code) ?? parCodeMinuscule.get(code.toLowerCase());
    if (!secteur) return void lecture.inconnus.push({ index, code });
    if (vus.has(secteur.id)) return void lecture.rejetees.push({ index, motif: `${code} : secteur en double dans le fichier (premier contour gardé)` });
    vus.add(secteur.id);
    lecture.contours.push({ secteur_id: secteur.id, code: secteur.code, geometrie: feature.geometry });
  });
  return lecture;
}

/** Découpe une liste en paquets de `taille` éléments (le dernier peut être plus court). */
export function decouperEnPaquets<T>(liste: T[], taille = TAILLE_PAQUET): T[][] {
  const t = Math.max(1, Math.trunc(taille));
  const paquets: T[][] = [];
  for (let i = 0; i < liste.length; i += t) paquets.push(liste.slice(i, i + t));
  return paquets;
}

export const RESULTAT_VIDE: ResultatImportReseau = { inseres: 0, mis_a_jour: 0, ignores: 0, erreurs: [] };

/** Somme des résultats renvoyés par la base pour chaque paquet. */
export function cumulerResultats(resultats: Partial<ResultatImportReseau>[]): ResultatImportReseau {
  return resultats.reduce<ResultatImportReseau>((t, r) => ({
    inseres: t.inseres + (Number(r.inseres) || 0),
    mis_a_jour: t.mis_a_jour + (Number(r.mis_a_jour) || 0),
    ignores: t.ignores + (Number(r.ignores) || 0),
    erreurs: [...t.erreurs, ...(Array.isArray(r.erreurs) ? r.erreurs : [])],
  }), { ...RESULTAT_VIDE, erreurs: [] });
}

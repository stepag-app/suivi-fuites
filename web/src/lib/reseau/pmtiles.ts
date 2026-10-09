// Tuiles vectorielles du réseau (X5) : fabrication d'une archive PMTiles v3 à partir des tronçons et des nœuds du
// marché, sans service extérieur (dans le navigateur de l'administrateur ou sous Node pour les vérifications).
// Découpage par geojson-vt (le même que MapLibre pour une source GeoJSON : rendu identique), encodage MVT par
// vt-pbf, tuiles et répertoires compressés en gzip (fflate). Spécification :
// https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
// Fonctions pures, vérifiées par scripts/verifier-tuiles.mjs.
import { GeoJSONVT } from '@maplibre/geojson-vt';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { gzipSync } from 'fflate';
import { zxyToTileId } from 'pmtiles';
import {
  COUCHE_NOEUDS, COUCHE_TRONCONS, ZOOM_MAX_TUILES, ZOOM_MIN_NOEUDS_TUILES, ZOOM_MIN_TUILES, type IndexTroncons, type InfosTuiles,
} from './tuiles-format';
import type { CollectionNoeuds, CollectionTroncons } from './types';

export * from './tuiles-format';

const ETENDUE = 4096;
const TAILLE_ENTETE = 127;
/** L'en-tête et le répertoire racine doivent tenir dans les 16 384 premiers octets (une seule lecture). */
const TAILLE_LECTURE_INITIALE = 16384;

export interface ResultatTuiles {
  octets: Uint8Array;
  nbTuiles: number;
  bornes: [number, number, number, number];
}

type Bornes = [number, number, number, number];

function bornesCollections(...collections: { features: { geometry: { type: string; coordinates: unknown } | null }[] }[]): Bornes | null {
  let [o, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const voir = (c: unknown) => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as number[];
      if (x < o) o = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    } else if (Array.isArray(c)) {
      for (const p of c) voir(p);
    }
  };
  for (const col of collections) for (const f of col.features) if (f.geometry) voir(f.geometry.coordinates);
  return Number.isFinite(o) ? [o, s, e, n] : null;
}

const lonVersX = (lon: number, z: number) => Math.min(2 ** z - 1, Math.max(0, Math.floor(((lon + 180) / 360) * 2 ** z)));
const latVersY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.min(2 ** z - 1, Math.max(0, Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z)));
};

// ---- Écriture binaire -----------------------------------------------------------------------------------------

class Tampon {
  private morceaux: number[] = [];
  varint(v: number) {
    let n = v;
    while (n >= 0x80) {
      this.morceaux.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.morceaux.push(n);
  }
  octets() {
    return Uint8Array.from(this.morceaux);
  }
}

interface Entree { tileId: number; offset: number; length: number; runLength: number }

/** Répertoire PMTiles : nombre, écarts d'identifiants, répétitions, longueurs, décalages (0 = contigu). */
export function serialiserRepertoire(entrees: Entree[]): Uint8Array {
  const t = new Tampon();
  t.varint(entrees.length);
  let dernier = 0;
  for (const e of entrees) {
    t.varint(e.tileId - dernier);
    dernier = e.tileId;
  }
  for (const e of entrees) t.varint(e.runLength);
  for (const e of entrees) t.varint(e.length);
  entrees.forEach((e, i) => {
    const contigu = i > 0 && e.offset === entrees[i - 1].offset + entrees[i - 1].length;
    t.varint(contigu ? 0 : e.offset + 1);
  });
  return t.octets();
}

function entete(h: {
  racine: [number, number]; meta: [number, number]; donnees: [number, number]; nbTuiles: number;
  zMin: number; zMax: number; bornes: Bornes;
}): Uint8Array {
  const b = new Uint8Array(TAILLE_ENTETE);
  const v = new DataView(b.buffer);
  b.set([0x50, 0x4d, 0x54, 0x69, 0x6c, 0x65, 0x73], 0); // « PMTiles »
  b[7] = 3;
  const u64 = (pos: number, n: number) => v.setBigUint64(pos, BigInt(n), true);
  u64(8, h.racine[0]);
  u64(16, h.racine[1]);
  u64(24, h.meta[0]);
  u64(32, h.meta[1]);
  u64(40, h.donnees[0]); // pas de répertoire feuille : décalage quelconque, longueur nulle
  u64(48, 0);
  u64(56, h.donnees[0]);
  u64(64, h.donnees[1]);
  u64(72, h.nbTuiles);
  u64(80, h.nbTuiles);
  u64(88, h.nbTuiles);
  b[96] = 1; // tuiles rangées dans l'ordre des identifiants
  b[97] = 2; // répertoires et métadonnées en gzip
  b[98] = 2; // tuiles en gzip
  b[99] = 1; // MVT
  b[100] = h.zMin;
  b[101] = h.zMax;
  const e7 = (pos: number, deg: number) => v.setInt32(pos, Math.round(deg * 1e7), true);
  const [o, s, e, n] = h.bornes;
  e7(102, o);
  e7(106, s);
  e7(110, e);
  e7(114, n);
  b[118] = 13;
  e7(119, (o + e) / 2);
  e7(123, (s + n) / 2);
  return b;
}

/**
 * Archive PMTiles des tronçons (couche `troncons` : identifiant entier, propriétés s, c, d, m de `reseau_geojson`) et
 * des nœuds (couche `noeuds` : s, t), zooms 10 à 16 ; index des tronçons dans les métadonnées. Erreur si le réseau
 * est vide.
 */
export function genererPmtiles(troncons: CollectionTroncons, noeuds: CollectionNoeuds, infos: InfosTuiles): ResultatTuiles {
  const bornes = bornesCollections(troncons, noeuds);
  if (!bornes || troncons.features.length === 0) throw new Error('Aucun tronçon : rien à mettre en tuiles.');
  const options = { maxZoom: ZOOM_MAX_TUILES, indexMaxZoom: 5, tolerance: 3, extent: ETENDUE, buffer: 64 };
  const index: IndexTroncons = { ids: [], l: [], s: [], d: [], secteurs: [] };
  const rangSecteur = new Map<string, number>();
  const sansNul = (p: Record<string, unknown>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v != null));
  const tronconsTuiles = {
    type: 'FeatureCollection',
    features: troncons.features.map((f, i) => {
      index.ids.push(f.properties.id);
      index.l.push(Math.round((Number(f.properties.l) || 0) * 100) / 100);
      const { s, c, d, m } = f.properties;
      if (s && !rangSecteur.has(s)) rangSecteur.set(s, index.secteurs.push(s));
      index.s.push(s ? rangSecteur.get(s)! : 0);
      index.d.push(Number(d) > 0 ? Number(d) : 0);
      return { type: 'Feature', id: i + 1, geometry: f.geometry, properties: sansNul({ s, c, d, m }) };
    }),
  };
  const noeudsTuiles = {
    type: 'FeatureCollection',
    features: noeuds.features.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: sansNul({ s: f.properties.s, t: f.properties.t }) })),
  };
  const indexTroncons = new GeoJSONVT(tronconsTuiles as unknown as GeoJSON.GeoJSON, options);
  const indexNoeuds = noeuds.features.length ? new GeoJSONVT(noeudsTuiles as unknown as GeoJSON.GeoJSON, options) : null;

  const tuiles: { tileId: number; donnees: Uint8Array }[] = [];
  for (let z = ZOOM_MIN_TUILES; z <= ZOOM_MAX_TUILES; z++) {
    const [x0, x1] = [lonVersX(bornes[0], z), lonVersX(bornes[2], z)];
    const [y0, y1] = [latVersY(bornes[3], z), latVersY(bornes[1], z)];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const couches: Parameters<typeof fromGeojsonVt>[0] = {};
        const t = indexTroncons.getTile(z, x, y);
        if (t?.features.length) couches[COUCHE_TRONCONS] = t;
        if (indexNoeuds && z >= ZOOM_MIN_NOEUDS_TUILES) {
          const n = indexNoeuds.getTile(z, x, y);
          if (n?.features.length) couches[COUCHE_NOEUDS] = n;
        }
        if (!Object.keys(couches).length) continue;
        tuiles.push({ tileId: zxyToTileId(z, x, y), donnees: gzipSync(fromGeojsonVt(couches, { version: 2, extent: ETENDUE })) });
      }
    }
  }
  tuiles.sort((a, b) => a.tileId - b.tileId);

  const entrees: Entree[] = [];
  let decalage = 0;
  for (const t of tuiles) {
    entrees.push({ tileId: t.tileId, offset: decalage, length: t.donnees.length, runLength: 1 });
    decalage += t.donnees.length;
  }
  const racine = gzipSync(serialiserRepertoire(entrees));
  if (TAILLE_ENTETE + racine.length > TAILLE_LECTURE_INITIALE) {
    throw new Error(`Réseau trop étendu pour une archive simple (${tuiles.length} tuiles) : répertoires feuilles à prévoir.`);
  }
  const champsTroncons = { s: 'String', c: 'String', d: 'Number', m: 'String' };
  const meta = gzipSync(new TextEncoder().encode(JSON.stringify({
    name: 'Réseau AEP', format: 'pbf', type: 'overlay',
    attribution: 'Réseau : STEPAG',
    vector_layers: [
      { id: COUCHE_TRONCONS, fields: champsTroncons, minzoom: ZOOM_MIN_TUILES, maxzoom: ZOOM_MAX_TUILES },
      { id: COUCHE_NOEUDS, fields: { s: 'String', t: 'String' }, minzoom: ZOOM_MIN_NOEUDS_TUILES, maxzoom: ZOOM_MAX_TUILES },
    ],
    suivi_fuites: infos,
    index_troncons: index,
  })));

  const debutRacine = TAILLE_ENTETE;
  const debutMeta = debutRacine + racine.length;
  const debutDonnees = debutMeta + meta.length;
  const tete = entete({
    racine: [debutRacine, racine.length], meta: [debutMeta, meta.length], donnees: [debutDonnees, decalage],
    nbTuiles: tuiles.length, zMin: ZOOM_MIN_TUILES, zMax: ZOOM_MAX_TUILES, bornes,
  });
  const octets = new Uint8Array(debutDonnees + decalage);
  octets.set(tete, 0);
  octets.set(racine, debutRacine);
  octets.set(meta, debutMeta);
  let pos = debutDonnees;
  for (const t of tuiles) {
    octets.set(t.donnees, pos);
    pos += t.donnees.length;
  }
  return { octets, nbTuiles: tuiles.length, bornes };
}

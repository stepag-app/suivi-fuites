// Format des tuiles du réseau (X5) : noms des couches, zooms, métadonnées de l'application, index des tronçons et
// empreinte du réseau. Module léger (sans le générateur) : lu par la carte, la fabrication est dans pmtiles.ts.

export const COUCHE_TRONCONS = 'troncons';
export const COUCHE_NOEUDS = 'noeuds';
/** Zooms enregistrés : au-delà de 16, MapLibre agrandit les tuiles du zoom 16 (précision 15 cm). */
export const ZOOM_MIN_TUILES = 10;
export const ZOOM_MAX_TUILES = 16;
/** Nœuds : seulement à partir du zoom 14 (affichés à partir de 15, 14 pour l'impression). */
export const ZOOM_MIN_NOEUDS_TUILES = 14;

/** Métadonnées propres à l'application, rangées dans le JSON de l'archive (clé `suivi_fuites`). */
export interface InfosTuiles {
  version: 1;
  marche_id: string;
  /** Empreinte du réseau en base au moment de la génération (voir estampilleReseau). */
  estampille: string;
  genere_le: string;
  nb_troncons: number;
  nb_noeuds: number;
}

/**
 * Table de correspondance rangée dans les métadonnées : le tronçon d'identifiant entier n (identifiant MVT, de 1 à N)
 * est `ids[n - 1]` (uuid de la base), de longueur `l[n - 1]` mètres, du secteur `secteurs[s[n - 1] - 1]` (0 : non
 * zoné), de diamètre `d[n - 1]` mm (0 : inconnu). Les uuid ne sont pas répétés dans chaque tuile : l'archive est
 * 3 fois plus légère, MapLibre pose l'état de balayage et la sélection sur l'identifiant entier, et la légende
 * compte les tronçons sans lire la géométrie.
 */
export interface IndexTroncons { ids: string[]; l: number[]; s: number[]; d: number[]; secteurs: string[] }

/** Index des tronçons rangé dans les métadonnées (null si absent ou incohérent). */
export function lireIndexTroncons(meta: unknown): IndexTroncons | null {
  const i = meta && typeof meta === 'object' ? (meta as { index_troncons?: unknown }).index_troncons : null;
  if (!i || typeof i !== 'object') return null;
  const x = i as Partial<IndexTroncons>;
  const n = Array.isArray(x.ids) ? x.ids.length : -1;
  return n >= 0 && [x.l, x.s, x.d].every((t) => Array.isArray(t) && t.length === n) && Array.isArray(x.secteurs) ? (x as IndexTroncons) : null;
}

/** Lecture des infos de l'application dans les métadonnées d'une archive (null si absentes ou d'un autre format). */
export function lireInfosTuiles(meta: unknown): InfosTuiles | null {
  const i = meta && typeof meta === 'object' ? (meta as { suivi_fuites?: unknown }).suivi_fuites : null;
  if (!i || typeof i !== 'object') return null;
  const x = i as Partial<InfosTuiles>;
  return x.version === 1 && typeof x.estampille === 'string' && typeof x.marche_id === 'string' ? (x as InfosTuiles) : null;
}

// ---- Empreinte du réseau en base ------------------------------------------------------------------------------

/**
 * Empreinte du réseau d'un marché, calculée sur ce que la carte lit déjà (`v_lineaire_secteurs` et
 * `v_troncons_sans_secteur`) : nombre de tronçons, linéaire, dernière modification et nombre de nœuds par secteur,
 * nombre et linéaire des non zonés. Un import, un zonage ou une correction de tronçon la change ; un balayage non.
 * Les tuiles portent l'empreinte de leur génération : si elle diffère, la carte revient aux données de la base.
 */
export function estampilleReseau(
  lignes: { secteur_id: string; nb_troncons: number | string; lineaire_m: number | string; modifie_le: string | null; nb_noeuds?: number | string | null }[],
  sansSecteur: { nb_troncons: number | string; lineaire_m: number | string } | null,
): string {
  const texte = [...lignes]
    .sort((a, b) => (a.secteur_id < b.secteur_id ? -1 : a.secteur_id > b.secteur_id ? 1 : 0))
    .map((l) => `${l.secteur_id}:${Number(l.nb_troncons) || 0}:${Number(l.lineaire_m) || 0}:${l.modifie_le ? new Date(l.modifie_le).getTime() : 0}:${Number(l.nb_noeuds) || 0}`)
    .concat(`sans:${Number(sansSecteur?.nb_troncons) || 0}:${Number(sansSecteur?.lineaire_m) || 0}`)
    .join('|');
  // FNV-1a 64 bits (empreinte, pas de sécurité).
  let h = 0xcbf29ce484222325n;
  const masque = 0xffffffffffffffffn;
  for (const o of new TextEncoder().encode(texte)) {
    h ^= BigInt(o);
    h = (h * 0x100000001b3n) & masque;
  }
  return h.toString(16).padStart(16, '0');
}

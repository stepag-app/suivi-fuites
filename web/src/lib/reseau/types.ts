// Types propres à l'affichage du réseau (GeoJSON court du contrat § 3 et § 4, choix d'écran).
import type { Feature, FeatureCollection, LineString, MultiPolygon, Point, Polygon } from 'geojson';
import type { CategorieTroncon, StatutBalayage, TypeNoeud } from '@/lib/types';

/** Propriétés courtes d'un tronçon renvoyées par `reseau_geojson`. */
export interface ProprietesTroncon {
  id: string;
  s: string | null;   // secteur_id
  z: string | null;   // zone_id
  c: CategorieTroncon;
  d: number | null;   // diametre_mm
  m: string | null;   // materiau
  l: number;          // longueur_m
}

/** Propriétés courtes d'un nœud renvoyées par `noeuds_geojson`. */
export interface ProprietesNoeud {
  id: string;
  s: string | null;
  z: string | null;
  t: TypeNoeud;
}

export type FeatureTroncon = Feature<LineString, ProprietesTroncon>;
export type CollectionTroncons = FeatureCollection<LineString, ProprietesTroncon>;
export type FeatureNoeud = Feature<Point, ProprietesNoeud>;
export type CollectionNoeuds = FeatureCollection<Point, ProprietesNoeud>;

export type Coloration = 'secteur' | 'balayage' | 'diametre';

export interface ZoneReseau {
  id: string;
  numero: number;
  code: string;
  libelle: string;
  /** Linéaire du contrat (tableau n° 1 du CPS), en mètres ; le CPS ne le donne que par zone. */
  lineaire_m: number | null;
  geom: Polygon | MultiPolygon | null;
}

export interface SecteurReseau {
  id: string;
  zone_id: string;
  code: string;
  libelle: string;
  ordre: number;
  statut_balayage: StatutBalayage;
  geom: Polygon | MultiPolygon | null;
}

/** État d'un tronçon appliqué par `setFeatureState` (jamais mélangé à la géométrie en cache). */
export interface EtatFeature {
  balaye: boolean;
  repasse: boolean;
  passages: number;
  premier: string | null;
  dernier: string | null;
  equipe: string | null;
  agent: string | null;
}

/** Propriétés GeoJSON attendues dans les fichiers d'import (contrat § 4). */
export interface ProprietesImportTroncon {
  reference: string;
  calque?: string | null;
  categorie?: CategorieTroncon | null;
  diametre_mm?: number | null;
  materiau?: string | null;
  secteur_code?: string | null;
}

export interface ProprietesImportNoeud {
  reference: string;
  calque?: string | null;
  type?: TypeNoeud | null;
  secteur_code?: string | null;
}

export interface ResultatImportReseau {
  inseres: number;
  mis_a_jour: number;
  ignores: number;
  erreurs: unknown[];
}

/** Identifiant de secteur réservé aux tronçons sans secteur dans les sources et le cache. */
export const SANS_SECTEUR = 'sans-secteur';

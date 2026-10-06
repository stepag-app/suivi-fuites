// Sources et couches MapLibre des fuites, zones, secteurs et du réseau d'eau : les mêmes pour la carte
// à l'écran et pour la carte imprimée (capture.ts), afin que le PDF montre exactement les mêmes couleurs.
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';
import type { GeoJSONSource, Map as CarteMapLibre, StyleSpecification } from 'maplibre-gl';
import {
  COULEUR_NOEUD, COULEUR_SELECTION, expressionCouleurReseau, expressionLargeur, type PaletteReseau,
} from '@/lib/reseau/palette';
import type { CollectionNoeuds, CollectionTroncons, Coloration } from '@/lib/reseau/types';
import type { StatutFuite } from '@/lib/types';
import { COULEURS, COULEUR_ALERTE, COULEUR_CONTOURS, aUneAlerte, geometrieValide, type Contour, type FuiteCarte } from './commun';

// Fond de secours (hors ligne, fournisseur injoignable) : les fuites restent visibles sur fond uni.
export const STYLE_SECOURS: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#eef2f5' } }],
};

export const vide = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

// ---- Réseau d'eau (lot S) : une source GeoJSON par secteur, insérée sous les fuites ---------------------

/** Les couches du réseau s'insèrent sous cette couche : les fuites restent au-dessus des conduites. */
export const ANCRE_RESEAU = 'fuites-alerte';
export const idSourceReseau = (secteurId: string) => `reseau-${secteurId}`;
export const idSourceNoeuds = (secteurId: string) => `noeuds-${secteurId}`;
const ZOOM_MIN_NOEUDS = 15;

export interface OptionsCoucheReseau {
  coloration: Coloration;
  palette: PaletteReseau;
  /** Tronçons sans secteur : trait pointillé. */
  nonZone?: boolean;
  impression?: boolean;
}

/** Ajoute (ou met à jour) les tronçons d'un secteur : halo de sélection sous le trait, trait coloré. */
export function ajouterSourceReseau(m: CarteMapLibre, secteurId: string, data: CollectionTroncons, o: OptionsCoucheReseau) {
  const source = idSourceReseau(secteurId);
  const existante = m.getSource(source) as GeoJSONSource | undefined;
  if (existante) {
    existante.setData(data);
    return;
  }
  m.addSource(source, { type: 'geojson', data, promoteId: 'id' });
  const avant = m.getLayer(ANCRE_RESEAU) ? ANCRE_RESEAU : undefined;
  const facteur = o.impression ? 0.8 : 1;
  m.addLayer({
    id: `${source}-selection`, type: 'line', source,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': COULEUR_SELECTION,
      'line-width': expressionLargeur(facteur, 7),
      'line-opacity': ['case', ['boolean', ['feature-state', 'selection'], false], 0.9, 0],
    },
  }, avant);
  m.addLayer({
    id: `${source}-trait`, type: 'line', source,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': expressionCouleurReseau(o.coloration, o.palette),
      'line-width': expressionLargeur(facteur),
      'line-opacity': 0.95,
      ...(o.nonZone ? { 'line-dasharray': [2, 2] } : {}),
    },
  }, avant);
}

export function retirerSourceReseau(m: CarteMapLibre, secteurId: string) {
  const source = idSourceReseau(secteurId);
  for (const suffixe of ['-trait', '-selection']) if (m.getLayer(`${source}${suffixe}`)) m.removeLayer(`${source}${suffixe}`);
  if (m.getSource(source)) m.removeSource(source);
  const noeuds = idSourceNoeuds(secteurId);
  if (m.getLayer(`${noeuds}-points`)) m.removeLayer(`${noeuds}-points`);
  if (m.getSource(noeuds)) m.removeSource(noeuds);
}

/** Change la couleur de toutes les couches du réseau présentes (sans recréer les sources). */
export function colorerReseau(m: CarteMapLibre, coloration: Coloration, palette: PaletteReseau) {
  const couleur = expressionCouleurReseau(coloration, palette);
  for (const couche of couchesTraitReseau(m)) m.setPaintProperty(couche, 'line-color', couleur);
}

/** Identifiants des couches « trait » du réseau (pour queryRenderedFeatures). */
export const couchesTraitReseau = (m: CarteMapLibre): string[] =>
  (m.getStyle()?.layers ?? []).map((l) => l.id).filter((id) => id.startsWith('reseau-') && id.endsWith('-trait'));

/** Nœuds d'un secteur (vannes, bouches…) : petits points, visibles à partir du zoom 15. */
export function ajouterSourceNoeuds(m: CarteMapLibre, secteurId: string, data: CollectionNoeuds, impression = false) {
  const source = idSourceNoeuds(secteurId);
  const existante = m.getSource(source) as GeoJSONSource | undefined;
  if (existante) {
    existante.setData(data);
    return;
  }
  m.addSource(source, { type: 'geojson', data, promoteId: 'id' });
  const avant = m.getLayer(ANCRE_RESEAU) ? ANCRE_RESEAU : undefined;
  m.addLayer({
    id: `${source}-points`, type: 'circle', source, minzoom: impression ? ZOOM_MIN_NOEUDS - 1 : ZOOM_MIN_NOEUDS,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.5, 18, 4.5],
      'circle-color': COULEUR_NOEUD, 'circle-stroke-width': 1.2, 'circle-stroke-color': '#ffffff',
    },
  }, avant);
}

export function pointsFuites(fuites: FuiteCarte[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: fuites
      .filter((f) => f.latitude != null && f.longitude != null)
      .map((f): Feature<Point> => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.longitude as number, f.latitude as number] },
        properties: { id: f.id, numero: f.numero, statut: f.statut, alerte: aUneAlerte(f) },
      })),
  };
}

export function contours(liste: Contour[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: liste
      .filter((c) => geometrieValide(c.geom))
      .map((c) => ({ type: 'Feature', geometry: c.geom!, properties: { id: c.id, libelle: c.libelle || c.code } })),
  };
}

// Tous les sommets d'un contour (Polygon ou MultiPolygon).
export const sommets = (g: Geometry): number[][] =>
  g.type === 'Polygon' ? g.coordinates.flat() : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : [];

// Couleur par statut, lue dans COULEURS (une seule source pour la carte et la légende).
const parStatut = (cle: 'fond' | 'contour') =>
  ['match', ['get', 'statut'],
    ...(Object.keys(COULEURS) as StatutFuite[]).flatMap((s) => [s, COULEURS[s][cle]]),
    '#555'] as unknown as string;

// Écran : points regroupés tant qu'ils sont serrés. Impression : chaque fuite garde sa couleur
// (un groupe cacherait les statuts), points plus petits, numéro à côté si le fond fournit les polices.
export function ajouterCouches(m: CarteMapLibre, { avecTextes, impression = false }: { avecTextes: boolean; impression?: boolean }) {
  m.addSource('zones', { type: 'geojson', data: vide() });
  m.addSource('secteurs', { type: 'geojson', data: vide() });
  m.addLayer({ id: 'zones-fond', type: 'fill', source: 'zones', paint: { 'fill-color': COULEUR_CONTOURS, 'fill-opacity': 0.06 } });
  m.addLayer({ id: 'zones-trait', type: 'line', source: 'zones', paint: { 'line-color': COULEUR_CONTOURS, 'line-width': 2.5 } });
  m.addLayer({
    id: 'secteurs-trait', type: 'line', source: 'secteurs',
    paint: { 'line-color': COULEUR_CONTOURS, 'line-width': 1.2, 'line-dasharray': [3, 2] },
  });

  m.addSource('fuites', impression
    ? { type: 'geojson', data: vide() }
    : { type: 'geojson', data: vide(), cluster: true, clusterRadius: 45, clusterMaxZoom: 15 });
  if (!impression) {
    m.addLayer({
      id: 'groupes', type: 'circle', source: 'fuites', filter: ['has', 'point_count'],
      paint: {
        'circle-color': COULEUR_CONTOURS, 'circle-opacity': 0.85,
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 23, 50, 30],
        'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff',
      },
    });
    if (avecTextes) {
      m.addLayer({
        id: 'groupes-nombre', type: 'symbol', source: 'fuites', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 14, 'text-font': ['Noto Sans Bold'] },
        paint: { 'text-color': '#ffffff' },
      });
    }
  }
  // Halo rouge sous les fuites en alerte.
  m.addLayer({
    id: 'fuites-alerte', type: 'circle', source: 'fuites',
    filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'alerte'], true]],
    paint: {
      'circle-radius': impression ? 10 : 15, 'circle-color': COULEUR_ALERTE, 'circle-opacity': 0.25,
      'circle-stroke-width': impression ? 1.5 : 2, 'circle-stroke-color': COULEUR_ALERTE,
    },
  });
  m.addLayer({
    id: 'fuites-points', type: 'circle', source: 'fuites', filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': impression ? 6 : 9, 'circle-color': parStatut('fond'),
      'circle-stroke-width': impression ? 1.8 : 2.5, 'circle-stroke-color': parStatut('contour'),
    },
  });
  if (impression && avecTextes) {
    m.addLayer({
      id: 'fuites-numeros', type: 'symbol', source: 'fuites',
      layout: {
        'text-field': ['to-string', ['get', 'numero']], 'text-size': 10, 'text-font': ['Noto Sans Bold'],
        'text-anchor': 'left', 'text-offset': [0.9, 0], 'text-optional': true,
      },
      paint: { 'text-color': '#1d2d3e', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    });
  }
}

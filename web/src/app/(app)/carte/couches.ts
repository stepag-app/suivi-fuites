// Sources et couches MapLibre des fuites, zones, secteurs et du réseau d'eau : les mêmes pour la carte
// à l'écran et pour la carte imprimée (capture.ts), afin que le PDF montre exactement les mêmes couleurs.
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';
import type { GeoJSONSource, Map as CarteMapLibre, StyleSpecification } from 'maplibre-gl';
import type { FilterSpecification, LayerSpecification } from 'maplibre-gl';
import {
  COULEUR_SELECTION, expressionCouleurNoeud, expressionCouleurReseau, expressionEtiquetteTroncon, expressionLargeur,
  expressionRayonNoeud, expressionSigleNoeud, type PaletteReseau,
} from '@/lib/reseau/palette';
import { COUCHE_NOEUDS, COUCHE_TRONCONS } from '@/lib/reseau/tuiles-format';
import { SANS_SECTEUR } from '@/lib/reseau/types';
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
/** Diamètre et matériau écrits le long des conduites, de près seulement. */
const ZOOM_MIN_ETIQUETTES = 16;
const ZOOM_MIN_SIGLES = 17;
const POLICE = ['Noto Sans Regular'];
const POLICE_GRASSE = ['Noto Sans Bold'];

/** Couches d'un tronçon, communes aux deux lectures (GeoJSON par secteur, tuiles) : halo (satellite), sélection, trait. */
function couchesTroncons(id: string, source: string, o: OptionsCoucheReseau & { sourceLayer?: string; filtre?: FilterSpecification; pointille?: boolean; halo?: boolean }): LayerSpecification[] {
  const facteur = o.impression ? 0.8 : 1;
  const commun = { source, ...(o.sourceLayer ? { 'source-layer': o.sourceLayer } : {}), ...(o.filtre ? { filter: o.filtre } : {}) };
  return [
    // Contour clair sous le trait : le réseau reste lisible sur l'image satellite (masqué sans satellite).
    {
      id: `${id}-halo`, type: 'line', ...commun,
      layout: { 'line-cap': 'round', 'line-join': 'round', visibility: o.halo ? 'visible' : 'none' },
      paint: { 'line-color': '#ffffff', 'line-width': expressionLargeur(facteur, 3), 'line-opacity': 0.85 },
    } as LayerSpecification,
    {
      id: `${id}-selection`, type: 'line', ...commun,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': COULEUR_SELECTION,
        'line-width': expressionLargeur(facteur, 7),
        'line-opacity': ['case', ['boolean', ['feature-state', 'selection'], false], 0.9, 0],
      },
    } as LayerSpecification,
    {
      id: `${id}-trait`, type: 'line', ...commun,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': expressionCouleurReseau(o.coloration, o.palette),
        'line-width': expressionLargeur(facteur),
        'line-opacity': 0.95,
        ...(o.pointille ? { 'line-dasharray': [2, 2] } : {}),
      },
    } as LayerSpecification,
  ];
}

/** « Ø110 PVC » le long des conduites (zoom 16 et plus) ; demande les polices du fond de carte. */
function coucheEtiquettes(id: string, source: string, sourceLayer?: string, filtre?: FilterSpecification): LayerSpecification {
  return {
    id: `${id}-etiquettes`, type: 'symbol', source, minzoom: ZOOM_MIN_ETIQUETTES,
    ...(sourceLayer ? { 'source-layer': sourceLayer } : {}), ...(filtre ? { filter: filtre } : {}),
    layout: {
      'symbol-placement': 'line', 'symbol-spacing': 220, 'text-field': expressionEtiquetteTroncon(), 'text-font': POLICE,
      'text-size': ['interpolate', ['linear'], ['zoom'], 16, 11, 19, 14], 'text-max-angle': 35, 'text-padding': 4,
      'text-offset': [0, -0.9], 'text-optional': true,
    },
    paint: { 'text-color': '#102a43', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
  } as LayerSpecification;
}

/** Nœuds : équipements en couleur (vanne, bouche d'incendie…), sigle à partir du zoom 17. */
function couchesNoeuds(id: string, source: string, o: { sourceLayer?: string; filtre?: FilterSpecification; impression?: boolean; avecTextes?: boolean }): LayerSpecification[] {
  const commun = { source, ...(o.sourceLayer ? { 'source-layer': o.sourceLayer } : {}), ...(o.filtre ? { filter: o.filtre } : {}) };
  const couches: LayerSpecification[] = [{
    id: `${id}-points`, type: 'circle', ...commun, minzoom: o.impression ? ZOOM_MIN_NOEUDS - 1 : ZOOM_MIN_NOEUDS,
    paint: {
      'circle-radius': expressionRayonNoeud(o.impression ? 0.8 : 1),
      'circle-color': expressionCouleurNoeud(), 'circle-stroke-width': 1.2, 'circle-stroke-color': '#ffffff',
    },
  } as LayerSpecification];
  if (o.avecTextes) {
    couches.push({
      id: `${id}-sigles`, type: 'symbol', ...commun, minzoom: ZOOM_MIN_SIGLES,
      layout: {
        'text-field': expressionSigleNoeud(), 'text-font': POLICE_GRASSE, 'text-size': 11,
        'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-optional': true, 'text-padding': 1,
      },
      paint: { 'text-color': expressionCouleurNoeud(), 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    } as LayerSpecification);
  }
  return couches;
}

const ajouterAvant = (m: CarteMapLibre, couches: LayerSpecification[]) => {
  const avant = m.getLayer(ANCRE_RESEAU) ? ANCRE_RESEAU : undefined;
  for (const c of couches) m.addLayer(c, avant);
};

export interface OptionsCoucheReseau {
  coloration: Coloration;
  palette: PaletteReseau;
  /** Tronçons sans secteur : trait pointillé. */
  nonZone?: boolean;
  impression?: boolean;
  /** Polices du fond disponibles : diamètres et sigles écrits. */
  avecTextes?: boolean;
  /** Satellite affiché : contour clair sous le trait. */
  halo?: boolean;
}

/** Ajoute (ou met à jour) les tronçons d'un secteur : halo (satellite), sélection, trait coloré, diamètres. */
export function ajouterSourceReseau(m: CarteMapLibre, secteurId: string, data: CollectionTroncons, o: OptionsCoucheReseau) {
  const source = idSourceReseau(secteurId);
  const existante = m.getSource(source) as GeoJSONSource | undefined;
  if (existante) {
    existante.setData(data);
    return;
  }
  m.addSource(source, { type: 'geojson', data, promoteId: 'id' });
  ajouterAvant(m, [
    ...couchesTroncons(source, source, { ...o, pointille: o.nonZone }),
    ...(o.avecTextes ? [coucheEtiquettes(source, source)] : []),
  ]);
}

const SUFFIXES = ['-trait', '-selection', '-halo', '-etiquettes', '-points', '-sigles'];

export function retirerSourceReseau(m: CarteMapLibre, secteurId: string) {
  for (const source of [idSourceReseau(secteurId), idSourceNoeuds(secteurId)]) {
    for (const suffixe of SUFFIXES) if (m.getLayer(`${source}${suffixe}`)) m.removeLayer(`${source}${suffixe}`);
    if (m.getSource(source)) m.removeSource(source);
  }
}

// ---- Réseau en tuiles vectorielles (X5) : une seule source pour tout le réseau ------------------------------------

export const SOURCE_TUILES = 'reseau-tuiles';
const ID_SANS = `${SOURCE_TUILES}-sans`;
const ID_NOEUDS_TUILES = 'noeuds-tuiles';

/** Filtre « secteur coché » sur la propriété courte `s` (non zonés : SANS_SECTEUR). */
export const filtreSecteurs = (ids: Iterable<string>, avecNonZones = true): FilterSpecification =>
  ['all', ...(avecNonZones ? [] : [['has', 's']]), ['in', ['coalesce', ['get', 's'], SANS_SECTEUR], ['literal', [...ids]]]] as unknown as FilterSpecification;

export function ajouterReseauTuiles(m: CarteMapLibre, url: string, o: OptionsCoucheReseau & { secteurs: Iterable<string> }) {
  if (m.getSource(SOURCE_TUILES)) retirerReseauTuiles(m);
  m.addSource(SOURCE_TUILES, { type: 'vector', url });
  const ids = [...o.secteurs];
  const zones: FilterSpecification = filtreSecteurs(ids, false);
  const sans: FilterSpecification = ['all', ['!', ['has', 's']], ids.includes(SANS_SECTEUR)] as unknown as FilterSpecification;
  ajouterAvant(m, [
    ...couchesTroncons(SOURCE_TUILES, SOURCE_TUILES, { ...o, sourceLayer: COUCHE_TRONCONS, filtre: zones }),
    ...couchesTroncons(ID_SANS, SOURCE_TUILES, { ...o, sourceLayer: COUCHE_TRONCONS, filtre: sans, pointille: true }),
    ...(o.avecTextes ? [coucheEtiquettes(SOURCE_TUILES, SOURCE_TUILES, COUCHE_TRONCONS, filtreSecteurs(ids))] : []),
    ...couchesNoeuds(ID_NOEUDS_TUILES, SOURCE_TUILES, { sourceLayer: COUCHE_NOEUDS, filtre: filtreSecteurs(ids), impression: o.impression, avecTextes: o.avecTextes }),
  ]);
}

/** Secteurs cochés : seul le filtre change (rien n'est rechargé). */
export function filtrerReseauTuiles(m: CarteMapLibre, secteurs: Iterable<string>) {
  const ids = [...secteurs];
  const regler = (id: string, f: FilterSpecification) => { if (m.getLayer(id)) m.setFilter(id, f); };
  for (const suffixe of ['-halo', '-selection', '-trait']) {
    regler(`${SOURCE_TUILES}${suffixe}`, filtreSecteurs(ids, false));
    regler(`${ID_SANS}${suffixe}`, ['all', ['!', ['has', 's']], ids.includes(SANS_SECTEUR)] as unknown as FilterSpecification);
  }
  regler(`${SOURCE_TUILES}-etiquettes`, filtreSecteurs(ids));
  regler(`${ID_NOEUDS_TUILES}-points`, filtreSecteurs(ids));
  regler(`${ID_NOEUDS_TUILES}-sigles`, filtreSecteurs(ids));
}

export function retirerReseauTuiles(m: CarteMapLibre) {
  for (const base of [SOURCE_TUILES, ID_SANS, ID_NOEUDS_TUILES]) {
    for (const suffixe of SUFFIXES) if (m.getLayer(`${base}${suffixe}`)) m.removeLayer(`${base}${suffixe}`);
  }
  if (m.getSource(SOURCE_TUILES)) m.removeSource(SOURCE_TUILES);
}

/** Halo clair sous tout le réseau affiché (satellite activé ou non). */
export function afficherHaloReseau(m: CarteMapLibre, visible: boolean) {
  for (const l of m.getStyle()?.layers ?? []) {
    if ((l.id.startsWith('reseau-') || l.id.startsWith(`${SOURCE_TUILES}`)) && l.id.endsWith('-halo')) {
      m.setLayoutProperty(l.id, 'visibility', visible ? 'visible' : 'none');
    }
  }
}

/** Change la couleur de toutes les couches du réseau présentes (sans recréer les sources). */
export function colorerReseau(m: CarteMapLibre, coloration: Coloration, palette: PaletteReseau) {
  const couleur = expressionCouleurReseau(coloration, palette);
  for (const couche of couchesTraitReseau(m)) m.setPaintProperty(couche, 'line-color', couleur);
}

/** Identifiants des couches « trait » du réseau (pour queryRenderedFeatures), GeoJSON ou tuiles. */
export const couchesTraitReseau = (m: CarteMapLibre): string[] =>
  (m.getStyle()?.layers ?? []).map((l) => l.id).filter((id) => id.startsWith('reseau-') && id.endsWith('-trait'));

/** Nœuds d'un secteur : équipements en couleur, jonctions en petit point, visibles à partir du zoom 15. */
export function ajouterSourceNoeuds(m: CarteMapLibre, secteurId: string, data: CollectionNoeuds, impression = false, avecTextes = false) {
  const source = idSourceNoeuds(secteurId);
  const existante = m.getSource(source) as GeoJSONSource | undefined;
  if (existante) {
    existante.setData(data);
    return;
  }
  m.addSource(source, { type: 'geojson', data, promoteId: 'id' });
  ajouterAvant(m, couchesNoeuds(source, source, { impression, avecTextes }));
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

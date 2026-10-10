// Couche satellite activable (C5) : Esri World Imagery (offre gratuite ArcGIS Location Platform), tuiles en ligne
// chargées seulement quand la couche est activée, bornées à l'emprise du réseau + 1 km et aux zooms 13 à 19
// (MapLibre ne demande aucune tuile hors de ces bornes). Pas de copie locale ni dans R2 (conditions d'utilisation).
// Clé publique restreinte au domaine dans NEXT_PUBLIC_ESRI_CLE ; sans clé, le bouton n'apparaît pas.
import type { Map as CarteMapLibre } from 'maplibre-gl';
import { empriseAvecMarge } from '@/lib/reseau/tuiles';

export const CLE_ESRI = process.env.NEXT_PUBLIC_ESRI_CLE ?? '';
export const satelliteDisponible = () => CLE_ESRI.length > 0;

const SOURCE = 'satellite-esri';
const COUCHE = 'satellite-esri';
export const ZOOM_MIN_SATELLITE = 13;
const ZOOM_MAX_SATELLITE = 19;
const MARGE_M = 1000;
const URL_TUILES = 'https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ATTRIBUTION = 'Imagerie : <a href="https://www.esri.com" target="_blank" rel="noreferrer">Powered by Esri</a> · Esri, Maxar, Earthstar Geographics';

/** Première couche de textes du fond : l'image passe dessous (noms de rues lisibles), au-dessus des aplats. */
function premiereCoucheTextes(m: CarteMapLibre): string | undefined {
  return m.getStyle()?.layers?.find((l) => l.type === 'symbol' && !('source' in l && String(l.source).startsWith('reseau')) && l.id !== 'groupes-nombre')?.id;
}

/**
 * Affiche ou masque l'image satellite. Première activation : source et couche créées (aucune requête avant) ;
 * `bornes` = emprise du réseau [ouest, sud, est, nord], élargie de 1 km. Sans bornes : rien n'est affiché.
 */
export function afficherSatellite(m: CarteMapLibre, visible: boolean, bornes: [number, number, number, number] | null): boolean {
  if (!satelliteDisponible()) return false;
  if (!m.getSource(SOURCE)) {
    if (!visible || !bornes) return false;
    m.addSource(SOURCE, {
      type: 'raster',
      tiles: [`${URL_TUILES}?token=${encodeURIComponent(CLE_ESRI)}`],
      tileSize: 256,
      minzoom: ZOOM_MIN_SATELLITE,
      maxzoom: ZOOM_MAX_SATELLITE,
      bounds: empriseAvecMarge(bornes, MARGE_M),
      attribution: ATTRIBUTION,
    });
    m.addLayer({ id: COUCHE, type: 'raster', source: SOURCE, minzoom: ZOOM_MIN_SATELLITE, paint: { 'raster-fade-duration': 150 } }, premiereCoucheTextes(m));
    return true;
  }
  if (m.getLayer(COUCHE)) m.setLayoutProperty(COUCHE, 'visibility', visible ? 'visible' : 'none');
  return visible;
}

/** Une tuile Esri de la ville (zoom 16) pour l'aperçu de la vignette « Satellite ». */
export function urlApercuSatellite([lon, lat]: [number, number]): string {
  const z = 16;
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return URL_TUILES.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x)) + `?token=${encodeURIComponent(CLE_ESRI)}`;
}

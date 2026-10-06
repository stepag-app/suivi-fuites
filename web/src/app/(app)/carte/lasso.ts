// Tracé d'un lasso (forme libre) ou d'un rectangle sur une carte MapLibre, à la souris ou au doigt :
// la carte ne se déplace pas pendant le tracé (preventDefault sur mousedown / touchstart), un aperçu
// est dessiné dans une source dédiée, et l'anneau fermé est remis à l'appelant qui choisit les tronçons
// (lib/reseau/selection.ts : milieu dans le polygone). Partagé par la carte des fuites (mode balayage)
// et la carte de zonage des paramètres.
import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource, Map as CarteMapLibre, MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import { COULEUR_SELECTION } from '@/lib/reseau/palette';
import { anneauEnPolygone, lassoEnAnneau, rectangleEnAnneau, type Position } from '@/lib/reseau/selection';

export type OutilTrace = 'lasso' | 'rectangle';
const SOURCE = 'apercu-trace';
const vide = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

export interface OptionsTrace {
  /** Outil actif pour un geste simple (souris sans Maj, ou doigt) ; null : la carte se déplace normalement. */
  outil: () => OutilTrace | null;
  /** Outil pour Maj+glisser à la souris (ex. rectangle) ; null : rien. */
  outilMaj?: () => OutilTrace | null;
  /** Anneau fermé (WGS84) une fois le geste terminé ; `cumul` : Maj enfoncée. */
  surFin: (anneau: number[][], cumul: boolean) => void;
}

/** Ajoute la source d'aperçu et les gestionnaires ; à appeler une fois la carte chargée. */
export function installerTrace(m: CarteMapLibre, o: OptionsTrace): () => void {
  if (!m.getSource(SOURCE)) {
    m.addSource(SOURCE, { type: 'geojson', data: vide() });
    m.addLayer({ id: `${SOURCE}-fond`, type: 'fill', source: SOURCE, paint: { 'fill-color': COULEUR_SELECTION, 'fill-opacity': 0.12 } });
    m.addLayer({ id: `${SOURCE}-trait`, type: 'line', source: SOURCE, paint: { 'line-color': COULEUR_SELECTION, 'line-width': 2.5, 'line-dasharray': [2, 1.5] } });
  }
  let geste: { type: OutilTrace; debut: Position; points: Position[]; bouge: boolean } | null = null;
  const source = () => m.getSource(SOURCE) as GeoJSONSource | undefined;

  const debuter = (type: OutilTrace, p: Position) => {
    geste = { type, debut: p, points: [p], bouge: false };
  };
  const avancer = (p: Position) => {
    if (!geste) return;
    geste.bouge = true;
    if (geste.type === 'lasso') geste.points.push(p);
    else geste.points = [p];
    const anneau = geste.type === 'rectangle' ? rectangleEnAnneau(geste.debut, p) : lassoEnAnneau(geste.points);
    source()?.setData({
      type: 'FeatureCollection',
      features: [anneau
        ? { type: 'Feature', properties: {}, geometry: anneauEnPolygone(anneau) }
        : { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: geste.points } }],
    });
  };
  const terminer = (cumul: boolean) => {
    const g = geste;
    geste = null;
    source()?.setData(vide());
    if (!g || !g.bouge) return;
    const anneau = g.type === 'rectangle' ? rectangleEnAnneau(g.debut, g.points[0]) : lassoEnAnneau(g.points);
    if (anneau) o.surFin(anneau, cumul);
  };
  const annuler = () => {
    geste = null;
    source()?.setData(vide());
  };

  const surMousedown = (e: MapMouseEvent) => {
    if (e.originalEvent.button !== 0) return;
    const type = e.originalEvent.shiftKey ? (o.outilMaj?.() ?? o.outil()) : o.outil();
    if (!type) return;
    e.preventDefault();
    debuter(type, [e.lngLat.lng, e.lngLat.lat]);
  };
  const surMousemove = (e: MapMouseEvent) => {
    if (geste) avancer([e.lngLat.lng, e.lngLat.lat]);
  };
  const surMouseup = (e: MapMouseEvent) => terminer(e.originalEvent.shiftKey);
  const surSortie = () => { if (geste) terminer(false); };
  const surTouchstart = (e: MapTouchEvent) => {
    if (e.originalEvent.touches.length !== 1) return annuler();
    const type = o.outil();
    if (!type) return;
    e.preventDefault();
    debuter(type, [e.lngLat.lng, e.lngLat.lat]);
  };
  const surTouchmove = (e: MapTouchEvent) => {
    if (!geste) return;
    if (e.originalEvent.touches.length !== 1) return annuler();
    e.preventDefault();
    avancer([e.lngLat.lng, e.lngLat.lat]);
  };
  const surTouchend = () => terminer(false);

  m.on('mousedown', surMousedown);
  m.on('mousemove', surMousemove);
  m.on('mouseup', surMouseup);
  m.getCanvas().addEventListener('mouseleave', surSortie);
  m.on('touchstart', surTouchstart);
  m.on('touchmove', surTouchmove);
  m.on('touchend', surTouchend);
  m.on('touchcancel', annuler);
  return () => {
    m.off('mousedown', surMousedown);
    m.off('mousemove', surMousemove);
    m.off('mouseup', surMouseup);
    m.getCanvas().removeEventListener('mouseleave', surSortie);
    m.off('touchstart', surTouchstart);
    m.off('touchmove', surTouchmove);
    m.off('touchend', surTouchend);
    m.off('touchcancel', annuler);
  };
}

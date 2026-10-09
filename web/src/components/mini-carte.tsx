'use client';

// Petite carte d'une position (formulaire Nouvelle fuite, correction de la position sur la fiche) : MapLibre
// chargé à la demande comme la page Carte (module natif de public/maplibre/), fond minimal OpenStreetMap,
// zoom rapproché. Avec `surDeplacement` : épingle déplaçable (glisser, ou toucher la carte à l'endroit voulu).
// Tronçon suggéré (F4) en surbrillance.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LineString } from 'geojson';
import type { GeoJSONSource, Map as CarteMapLibre, Marker } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { CENTRE_DEFAUT, MODULE_MAPLIBRE, STYLE_FOND } from '@/app/(app)/carte/commun';
import { STYLE_SECOURS } from '@/app/(app)/carte/couches';
import { cn } from '@/lib/utils';

export interface PositionCarte { latitude: number; longitude: number }

const ZOOM = 17;
const SOURCE_TRONCON = 'troncon-suggere';

export function MiniCarte({
  position, surDeplacement, troncon, className, libelle = 'Position de la fuite',
}: {
  position: PositionCarte | null;
  surDeplacement?: (p: PositionCarte) => void;
  troncon?: LineString | null;
  className?: string;
  libelle?: string;
}) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMapLibre | null>(null);
  const epingle = useRef<Marker | null>(null);
  const deplacer = useRef(surDeplacement);
  deplacer.current = surDeplacement;
  // Incrémenté à chaque style chargé (fond, puis fond de secours) : les couches s'y reposent.
  const [styles, setStyles] = useState(0);
  const pret = styles > 0;
  const [erreur, setErreur] = useState('');
  const [fondIndisponible, setFondIndisponible] = useState(false);
  const mobile = !!surDeplacement;

  useEffect(() => {
    let annule = false;
    (async () => {
      let ml: typeof import('maplibre-gl');
      try {
        ml = (await import(/* webpackIgnore: true */ MODULE_MAPLIBRE)) as typeof import('maplibre-gl');
      } catch {
        if (!annule) setErreur('Carte indisponible (pas de réseau ?)');
        return;
      }
      if (annule || !conteneur.current) return;
      const depart: [number, number] = position ? [position.longitude, position.latitude] : CENTRE_DEFAUT;
      const c = new ml.Map({
        container: conteneur.current, style: STYLE_FOND, center: depart, zoom: position ? ZOOM : 12,
        attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
      });
      c.touchZoomRotate.disableRotation();
      c.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      carte.current = c;
      // Fond injoignable : fond uni, l'épingle reste utilisable.
      const secours = window.setTimeout(() => {
        if (!c.isStyleLoaded()) {
          setFondIndisponible(true);
          c.setStyle(STYLE_SECOURS);
        }
      }, 8000);
      c.on('load', () => window.clearTimeout(secours));
      c.on('style.load', () => {
        if (!annule) setStyles((n) => n + 1);
      });
      const marqueur = new ml.Marker({ color: '#ef4444', draggable: mobile }).setLngLat(depart);
      if (position) marqueur.addTo(c);
      marqueur.on('dragend', () => {
        const p = marqueur.getLngLat();
        deplacer.current?.({ latitude: p.lat, longitude: p.lng });
      });
      epingle.current = marqueur;
      if (mobile) {
        c.on('click', (e) => {
          marqueur.setLngLat(e.lngLat).addTo(c);
          if (c.getZoom() < ZOOM - 2) c.easeTo({ center: e.lngLat, zoom: ZOOM - 1, duration: 400 });
          deplacer.current?.({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
        });
      }
    })();
    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
      epingle.current = null;
    };
    // La carte se crée une fois ; la position et le tronçon suivent par les effets ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile]);

  // Position venue du formulaire (GPS actualisé, saisie) : l'épingle et la vue suivent.
  useEffect(() => {
    const c = carte.current;
    const m = epingle.current;
    if (!c || !m || !position) return;
    const actuelle = m.getLngLat();
    if (Math.abs(actuelle.lat - position.latitude) < 1e-7 && Math.abs(actuelle.lng - position.longitude) < 1e-7 && m.getElement().isConnected) return;
    m.setLngLat([position.longitude, position.latitude]).addTo(c);
    c.easeTo({ center: [position.longitude, position.latitude], zoom: Math.max(c.getZoom(), ZOOM - 1), duration: 400 });
  }, [position, pret]);

  // Tronçon suggéré en surbrillance (sous l'épingle).
  useEffect(() => {
    const c = carte.current;
    if (!c || !pret) return;
    const donnees = troncon
      ? { type: 'Feature' as const, geometry: troncon, properties: {} }
      : { type: 'FeatureCollection' as const, features: [] };
    const source = c.getSource(SOURCE_TRONCON) as GeoJSONSource | undefined;
    if (source) {
      source.setData(donnees);
      return;
    }
    c.addSource(SOURCE_TRONCON, { type: 'geojson', data: donnees });
    c.addLayer({ id: `${SOURCE_TRONCON}-halo`, type: 'line', source: SOURCE_TRONCON, paint: { 'line-color': '#fde047', 'line-width': 10, 'line-opacity': 0.8 } });
    c.addLayer({ id: SOURCE_TRONCON, type: 'line', source: SOURCE_TRONCON, paint: { 'line-color': '#0b5d8a', 'line-width': 4 } });
  }, [troncon, pret, styles]);

  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-muted', className ?? 'h-56')}>
      <div ref={conteneur} className="size-full" role="img" aria-label={libelle} />
      {!position && !erreur && (
        <p className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-max rounded-sm bg-background/90 px-2 py-1 text-muted-foreground text-xs">
          {mobile ? 'Touchez la carte pour placer l\'épingle' : 'Position non relevée'}
        </p>
      )}
      {mobile && position && (
        <p className="pointer-events-none absolute bottom-2 left-2 rounded-sm bg-background/90 px-2 py-1 text-muted-foreground text-xs">
          Glissez l&apos;épingle ou touchez la carte
        </p>
      )}
      {fondIndisponible && <p className="absolute top-2 left-2 rounded-sm bg-amber-100 px-2 py-1 text-amber-900 text-xs">Fond de carte indisponible</p>}
      {erreur && <p className="absolute inset-0 grid place-items-center text-muted-foreground text-sm">{erreur}</p>}
    </div>
  );
}

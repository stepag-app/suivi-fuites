'use client';

// Carte du suivi GPS (S11, X6) : tracés d'un ou plusieurs agents pour un jour, sur le même fond que la carte du panneau
// (OpenFreeMap minimal) avec le réseau en tuiles privées (S10) et l'image satellite activable. Trait coupé aux trous de
// plus de 10 minutes, points visibles de près (touchez-en un : agent et heure), début en vert, fin en rouge.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection } from 'geojson';
import type { GeoJSONSource, Map as CarteMapLibre, StyleSpecification } from 'maplibre-gl';
import { Satellite } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ouvrirTuilesReseau, enregistrerProtocole } from '@/lib/reseau/tuiles';
import { SANS_SECTEUR } from '@/lib/reseau/types';
import { cadre, heureMaroc, segmenter, type PointTrace } from '@/lib/trace-gps';
import { CENTRE_DEFAUT, MODULE_MAPLIBRE, STYLE_FOND, ZOOM_DEFAUT } from '../carte/commun';
import { STYLE_SECOURS, vide } from '../carte/couches';
import { creerGestionReseau, creerGestionTuiles, type GestionReseau } from '../carte/reseau-carte';
import { afficherSatellite, satelliteDisponible } from '../carte/satellite';

export interface TraceAffichee { id: string; nom: string; couleur: string; points: PointTrace[] }

const PALETTE_VIDE = { secteurs: new Map<string, string>(), zones: new Map<string, string>() };

function sources(traces: TraceAffichee[]) {
  const lignes: Feature[] = [];
  const points: Feature[] = [];
  const bornes: Feature[] = [];
  for (const tr of traces) {
    for (const seg of segmenter(tr.points)) {
      if (seg.length > 1) {
        lignes.push({ type: 'Feature', properties: { couleur: tr.couleur }, geometry: { type: 'LineString', coordinates: seg.map((p) => [p[0], p[1]]) } });
      }
    }
    for (const p of tr.points) {
      points.push({ type: 'Feature', properties: { couleur: tr.couleur, nom: tr.nom, heure: heureMaroc(p[2]) }, geometry: { type: 'Point', coordinates: [p[0], p[1]] } });
    }
    const debut = tr.points[0];
    const fin = tr.points[tr.points.length - 1];
    if (debut) bornes.push({ type: 'Feature', properties: { couleur: '#16a34a', nom: tr.nom, heure: `début ${heureMaroc(debut[2])}` }, geometry: { type: 'Point', coordinates: [debut[0], debut[1]] } });
    if (fin && fin !== debut) bornes.push({ type: 'Feature', properties: { couleur: '#dc2626', nom: tr.nom, heure: `fin ${heureMaroc(fin[2])}` }, geometry: { type: 'Point', coordinates: [fin[0], fin[1]] } });
  }
  const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features });
  return { lignes: fc(lignes), points: fc(points), bornes: fc(bornes) };
}

/** `legende` : encart posé sur la carte (pauses du jour, qui n'ont pas de lieu). */
export function CarteTrace({ marcheId, traces, legende }: { marcheId: string; traces: TraceAffichee[]; legende?: ReactNode }) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMapLibre | null>(null);
  const gestion = useRef<GestionReseau | null>(null);
  const tracesRef = useRef(traces);
  tracesRef.current = traces;
  const [pret, setPret] = useState(false);
  const [erreur, setErreur] = useState('');
  const [satellite, setSatellite] = useState(false);
  const [emprise, setEmprise] = useState<[number, number, number, number] | null>(null);

  useEffect(() => {
    let annule = false;
    let instance: CarteMapLibre | null = null;
    (async () => {
      let ml: typeof import('maplibre-gl');
      try {
        ml = (await import(/* webpackIgnore: true */ MODULE_MAPLIBRE)) as typeof import('maplibre-gl');
      } catch {
        if (!annule) setErreur('La carte n\'a pas pu être chargée (pas de réseau ?).');
        return;
      }
      enregistrerProtocole(ml as never);
      let style: StyleSpecification = STYLE_SECOURS;
      try {
        const c = new AbortController();
        const minuterie = setTimeout(() => c.abort(), 8000);
        const r = await fetch(STYLE_FOND, { signal: c.signal });
        clearTimeout(minuterie);
        if (r.ok) style = (await r.json()) as StyleSpecification;
      } catch {
        /* fond uni */
      }
      if (annule || !conteneur.current) return;
      try {
        instance = new ml.Map({
          container: conteneur.current, style, center: CENTRE_DEFAUT, zoom: ZOOM_DEFAUT, maxZoom: 19,
          dragRotate: false, pitchWithRotate: false, attributionControl: { compact: true },
        });
      } catch {
        setErreur('Ce navigateur ne peut pas afficher la carte (WebGL indisponible).');
        return;
      }
      const m = instance;
      carte.current = m;
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      m.addControl(new ml.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left');
      m.on('load', async () => {
        if (annule) return;
        m.addSource('traces-lignes', { type: 'geojson', data: vide() });
        m.addLayer({ id: 'traces-halo', type: 'line', source: 'traces-lignes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.85 } });
        m.addLayer({ id: 'traces-lignes', type: 'line', source: 'traces-lignes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'couleur'], 'line-width': 3.5 } });
        m.addSource('traces-points', { type: 'geojson', data: vide() });
        m.addLayer({ id: 'traces-points', type: 'circle', source: 'traces-points', minzoom: 15, paint: { 'circle-radius': 4, 'circle-color': ['get', 'couleur'], 'circle-stroke-width': 1.5, 'circle-stroke-color': '#ffffff' } });
        m.addSource('traces-bornes', { type: 'geojson', data: vide() });
        m.addLayer({ id: 'traces-bornes', type: 'circle', source: 'traces-bornes', paint: { 'circle-radius': 8, 'circle-color': ['get', 'couleur'], 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });

        for (const id of ['traces-points', 'traces-bornes']) {
          m.on('mouseenter', id, () => { m.getCanvas().style.cursor = 'pointer'; });
          m.on('mouseleave', id, () => { m.getCanvas().style.cursor = ''; });
          m.on('click', id, (e) => {
            const f = e.features?.[0];
            if (!f || f.geometry.type !== 'Point') return;
            new ml.Popup({ closeButton: false, offset: 10 })
              .setLngLat(f.geometry.coordinates as [number, number])
              .setText(`${f.properties?.nom} · ${f.properties?.heure}`)
              .addTo(m);
          });
        }

        const tuiles = await ouvrirTuilesReseau(marcheId).catch(() => null);
        if (annule) return;
        const avecTextes = !!style.glyphs;
        if (tuiles) {
          gestion.current = creerGestionTuiles(m, tuiles, { avecTextes });
          gestion.current.synchroniser([...tuiles.index.secteurs, SANS_SECTEUR].map((id) => ({ id, data: null })), 'diametre', PALETTE_VIDE);
          setEmprise(tuiles.bornes);
        } else {
          gestion.current = creerGestionReseau(m, { avecTextes });
        }
        // Les tracés passent au-dessus du réseau.
        for (const id of ['traces-halo', 'traces-lignes', 'traces-points', 'traces-bornes']) m.moveLayer(id);
        setPret(true);
      });
    })();
    return () => {
      annule = true;
      instance?.remove();
      carte.current = null;
      gestion.current = null;
      setPret(false);
    };
  }, [marcheId]);

  // Tracés affichés : sources mises à jour, vue cadrée sur l'ensemble.
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    const s = sources(traces);
    (m.getSource('traces-lignes') as GeoJSONSource).setData(s.lignes);
    (m.getSource('traces-points') as GeoJSONSource).setData(s.points);
    (m.getSource('traces-bornes') as GeoJSONSource).setData(s.bornes);
    const c = cadre(traces.flatMap((t) => t.points));
    if (c) m.fitBounds([[c[0], c[1]], [c[2], c[3]]], { padding: 70, maxZoom: 17, duration: 500 });
  }, [pret, traces]);

  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    const bornes = emprise ?? cadre(tracesRef.current.flatMap((t) => t.points));
    const visible = afficherSatellite(m, satellite, bornes);
    gestion.current?.halo(visible);
  }, [pret, satellite, emprise]);

  return (
    <div className="relative h-full min-h-96 w-full overflow-hidden rounded-xl border bg-muted">
      <div ref={conteneur} className="carte-maplibre absolute inset-0" aria-label="Carte des tracés GPS" />
      {!pret && !erreur && <p className="absolute inset-0 m-0 grid place-items-center text-muted-foreground text-sm">Chargement de la carte…</p>}
      {erreur && <p className="absolute inset-x-3 top-3 m-0 rounded-lg bg-destructive/10 p-3 text-center text-destructive text-sm">{erreur}</p>}
      {legende && <div className="absolute right-3 bottom-8 z-[3]">{legende}</div>}
      {satelliteDisponible() && (
        <div className="absolute top-3 left-3 z-[3]">
          <Button size="sm" variant={satellite ? 'default' : 'outline'} className={satellite ? 'shadow-sm' : 'bg-background shadow-sm'} aria-pressed={satellite} onClick={() => setSatellite((v) => !v)}>
            <Satellite data-icon="inline-start" />{satellite ? 'Plan' : 'Satellite'}
          </Button>
        </div>
      )}
    </div>
  );
}

'use client';

// Mini-carte de localisation d'une fuite (F4) : zoom rapproché sur la position GPS, cercle de précision, épingle
// déplaçable (glisser, ou toucher la carte), conduite la plus proche en surbrillance avec diamètre et matériau
// (`suggestions_localisation`, suggestions seulement : rien n'est pré-rempli), réseau autour (tuiles, sinon le secteur
// de la position), image satellite activable. Réutilisable : route /mini-carte (WebView de l'APK) et formulaires du
// panneau. Chaque changement de position est remonté par `surChangement`.
import { useLangueApk } from '@/lib/langue-apk';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoJSONSource, Map as CarteMapLibre, Marker, StyleSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Satellite } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { nombre } from '@/lib/format';
import { chargerNoeudsSecteur, chargerTronconsSecteur } from '@/lib/reseau/donnees';
import {
  cercle, ecartEpingle, libelleTroncon, texte, type LangueMiniCarte, type Suggestions, type TronconProche,
} from '@/lib/reseau/mini-carte';
import { COULEUR_SELECTION } from '@/lib/reseau/palette';
import { enregistrerProtocole, ouvrirTuilesReseau } from '@/lib/reseau/tuiles';
import { SANS_SECTEUR } from '@/lib/reseau/types';
import { getSupabase } from '@/lib/supabase';
import { CENTRE_DEFAUT, MODULE_MAPLIBRE, STYLE_FOND } from './commun';
import { STYLE_SECOURS, vide } from './couches';
import { creerGestionReseau, creerGestionTuiles, type GestionReseau } from './reseau-carte';
import { afficherSatellite, satelliteDisponible } from './satellite';

export interface PositionGps { latitude: number; longitude: number; precision?: number | null }

export interface ResultatMiniCarte {
  latitude: number;
  longitude: number;
  /** Précision annoncée par le GPS ; épingle déplacée à la main : celle du GPS d'origine. */
  precision_m: number | null;
  deplacee: boolean;
  distance_gps_m: number | null;
  troncon: TronconProche | null;
  suggestions: Suggestions | null;
}

interface Props {
  marcheId: string;
  /** Position GPS (point bleu) ; l'épingle part de là. Absente : centre du réseau, épingle au centre. */
  gps: PositionGps | null;
  langue?: LangueMiniCarte;
  satelliteInitial?: boolean;
  surChangement?: (r: ResultatMiniCarte) => void;
  className?: string;
}

const PALETTE_VIDE = { secteurs: new Map<string, string>(), zones: new Map<string, string>() };
const DELAI_SUGGESTIONS_MS = 350;
/** Épingle posée à la main : précision du doigt sur la carte au zoom 18 (≈ 5 m), rayon de recherche minimal. */
const PRECISION_EPINGLE_M = 5;

export function MiniCarte({ marcheId, gps, langue = 'fr', satelliteInitial = false, surChangement, className }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMapLibre | null>(null);
  const epingle = useRef<Marker | null>(null);
  const gestion = useRef<GestionReseau | null>(null);
  const [pret, setPret] = useState(false);
  const { tb } = useLangueApk();
  const [erreur, setErreur] = useState('');
  const [satellite, setSatellite] = useState(satelliteInitial && satelliteDisponible());
  const [bornes, setBornes] = useState<[number, number, number, number] | null>(null);
  const [position, setPosition] = useState<{ latitude: number; longitude: number; deplacee: boolean } | null>(
    gps ? { latitude: gps.latitude, longitude: gps.longitude, deplacee: false } : null,
  );
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [recherche, setRecherche] = useState<'attente' | 'en_cours' | 'ok' | 'erreur'>('attente');
  const gpsRef = useRef(gps);
  gpsRef.current = gps;
  const surChangementRef = useRef(surChangement);
  surChangementRef.current = surChangement;
  const secteursCharges = useRef(new Map<string, Parameters<GestionReseau['synchroniser']>[0][number]>());

  // Carte (une fois) : fond minimal, réseau en tuiles si l'archive existe, épingle déplaçable.
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
      const depart = gpsRef.current;
      try {
        instance = new ml.Map({
          container: conteneur.current, style,
          center: depart ? [depart.longitude, depart.latitude] : CENTRE_DEFAUT,
          zoom: depart ? ((depart.precision ?? 0) > 50 ? 17 : 18) : 13,
          maxZoom: 20, dragRotate: false, pitchWithRotate: false, attributionControl: { compact: true },
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
        m.addSource('precision-gps', { type: 'geojson', data: vide() });
        m.addLayer({ id: 'precision-gps', type: 'fill', source: 'precision-gps', paint: { 'fill-color': '#1d6fd8', 'fill-opacity': 0.12 } });
        m.addLayer({ id: 'precision-gps-bord', type: 'line', source: 'precision-gps', paint: { 'line-color': '#1d6fd8', 'line-width': 1.2, 'line-opacity': 0.6 } });
        m.addSource('position-gps', { type: 'geojson', data: vide() });
        m.addLayer({ id: 'position-gps', type: 'circle', source: 'position-gps', paint: { 'circle-radius': 7, 'circle-color': '#1d6fd8', 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' } });
        m.addSource('troncon-proche', { type: 'geojson', data: vide() });
        m.addLayer({ id: 'troncon-proche-halo', type: 'line', source: 'troncon-proche', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': COULEUR_SELECTION, 'line-width': 14, 'line-opacity': 0.75 } });
        m.addLayer({ id: 'troncon-proche', type: 'line', source: 'troncon-proche', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#7a3e00', 'line-width': 4 } });

        // Réseau autour : tuiles (tout le réseau) ; sinon le secteur de la position, chargé après les suggestions.
        const tuiles = await ouvrirTuilesReseau(marcheId);
        if (annule) return;
        const avecTextes = !!style.glyphs;
        if (tuiles) {
          gestion.current = creerGestionTuiles(m, tuiles, { avecTextes });
          gestion.current.synchroniser([...tuiles.index.secteurs, SANS_SECTEUR].map((id) => ({ id, data: null })), 'diametre', PALETTE_VIDE);
          setBornes(tuiles.bornes);
        } else {
          gestion.current = creerGestionReseau(m, { avecTextes });
        }
        // Le tronçon proche passe au-dessus du réseau.
        for (const id of ['troncon-proche-halo', 'troncon-proche', 'precision-gps', 'precision-gps-bord', 'position-gps']) m.moveLayer(id);

        const centre = m.getCenter();
        const el = document.createElement('div');
        el.setAttribute('aria-label', 'Épingle de la fuite (à déplacer)');
        el.style.cssText = 'width:34px;height:46px;cursor:grab;touch-action:none;';
        el.innerHTML = '<svg viewBox="0 0 34 46" width="34" height="46" aria-hidden="true"><path d="M17 45C17 45 32 27 32 16A15 15 0 0 0 2 16C2 27 17 45 17 45Z" fill="#d32f2f" stroke="#fff" stroke-width="2.5"/><circle cx="17" cy="16" r="5.5" fill="#fff"/></svg>';
        const depart2 = gpsRef.current;
        epingle.current = new ml.Marker({ element: el, draggable: true, anchor: 'bottom' })
          .setLngLat(depart2 ? [depart2.longitude, depart2.latitude] : [centre.lng, centre.lat])
          .addTo(m);
        epingle.current.on('dragend', () => {
          const p = epingle.current!.getLngLat();
          setPosition({ latitude: p.lat, longitude: p.lng, deplacee: true });
        });
        // Toucher la carte place l'épingle (plus simple au doigt que glisser).
        m.on('click', (e) => {
          epingle.current?.setLngLat(e.lngLat);
          setPosition({ latitude: e.lngLat.lat, longitude: e.lngLat.lng, deplacee: true });
        });
        if (!depart2) setPosition({ latitude: centre.lat, longitude: centre.lng, deplacee: true });
        setPret(true);
      });
    })();
    return () => {
      annule = true;
      instance?.remove();
      carte.current = null;
    };
  }, [marcheId]);

  // GPS : point bleu et cercle de précision ; l'épingle suit tant qu'elle n'a pas été déplacée à la main.
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m || !gps) return;
    (m.getSource('position-gps') as GeoJSONSource).setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [gps.longitude, gps.latitude] }, properties: {} });
    (m.getSource('precision-gps') as GeoJSONSource).setData(gps.precision
      ? { type: 'Feature', geometry: cercle(gps.longitude, gps.latitude, gps.precision), properties: {} } : vide());
    setPosition((p) => {
      if (p?.deplacee || (p && p.latitude === gps.latitude && p.longitude === gps.longitude)) return p;
      epingle.current?.setLngLat([gps.longitude, gps.latitude]);
      return { latitude: gps.latitude, longitude: gps.longitude, deplacee: false };
    });
  }, [pret, gps?.latitude, gps?.longitude, gps?.precision]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suggestions pour la position de l'épingle (après un court délai : on peut glisser plusieurs fois).
  useEffect(() => {
    if (!position) return;
    let annule = false;
    setRecherche('en_cours');
    const minuteur = setTimeout(async () => {
      const precision = position.deplacee ? PRECISION_EPINGLE_M : gpsRef.current?.precision ?? null;
      const { data, error } = await getSupabase().rpc('suggestions_localisation', {
        p_marche: marcheId, p_longitude: position.longitude, p_latitude: position.latitude, p_precision_m: precision,
      });
      if (annule) return;
      const s = error ? null : (data as Suggestions | null);
      setSuggestions(s);
      setRecherche(error ? 'erreur' : 'ok');
      const g = gpsRef.current;
      surChangementRef.current?.({
        latitude: position.latitude, longitude: position.longitude, precision_m: g?.precision ?? null,
        deplacee: position.deplacee, distance_gps_m: ecartEpingle(g, position), troncon: s?.troncon ?? null, suggestions: s,
      });
    }, DELAI_SUGGESTIONS_MS);
    return () => {
      annule = true;
      clearTimeout(minuteur);
    };
  }, [position, marcheId]);

  // Tronçon proche en surbrillance ; sans tuiles, le réseau de son secteur est chargé (cache de l'appareil).
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    const t = suggestions?.troncon;
    (m.getSource('troncon-proche') as GeoJSONSource).setData(t?.geojson ? { type: 'Feature', geometry: t.geojson, properties: {} } : vide());
    const secteur = suggestions?.secteur?.id ?? t?.secteur_id;
    const g = gestion.current;
    if (!g || g.mode !== 'geojson' || !secteur || secteursCharges.current.has(secteur)) return;
    secteursCharges.current.set(secteur, { id: secteur, data: null });
    Promise.all([chargerTronconsSecteur(marcheId, secteur, null), chargerNoeudsSecteur(marcheId, secteur, null).catch(() => null)])
      .then(([data, noeuds]) => {
        if (carte.current !== m) return;
        secteursCharges.current.set(secteur, { id: secteur, data, noeuds });
        g.synchroniser([...secteursCharges.current.values()], 'diametre', PALETTE_VIDE);
      })
      .catch(() => secteursCharges.current.delete(secteur));
  }, [pret, suggestions, marcheId]);

  // Satellite : borné à l'emprise du réseau (archive) ou, à défaut, à 2 km autour de la position.
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    const p = gpsRef.current ?? position;
    const emprise = bornes ?? (p ? [p.longitude - 0.02, p.latitude - 0.016, p.longitude + 0.02, p.latitude + 0.016] as [number, number, number, number] : null);
    const visible = afficherSatellite(m, satellite, emprise);
    gestion.current?.halo(visible);
  }, [pret, satellite, bornes]); // eslint-disable-line react-hooks/exhaustive-deps

  const recentrer = useCallback(() => {
    const g = gpsRef.current;
    const m = carte.current;
    if (!g || !m) return;
    epingle.current?.setLngLat([g.longitude, g.latitude]);
    setPosition({ latitude: g.latitude, longitude: g.longitude, deplacee: false });
    m.easeTo({ center: [g.longitude, g.latitude], zoom: Math.max(m.getZoom(), 17), duration: 400 });
  }, []);

  const t = suggestions?.troncon;
  const ecart = position ? ecartEpingle(gps, position) : null;
  return (
    <div className={className ?? 'relative h-full min-h-72 w-full overflow-hidden bg-muted'} dir={langue === 'ar' ? 'rtl' : 'ltr'}>
      <div ref={conteneur} className="carte-maplibre absolute inset-0" aria-label="Mini-carte de localisation" />
      {!pret && !erreur && <p className="absolute inset-0 m-0 grid place-items-center text-muted-foreground text-sm">{tb('Chargement de la carte…')}</p>}
      {erreur && <p className="absolute inset-x-3 top-3 m-0 rounded-lg bg-destructive/10 p-3 text-center text-destructive text-sm">{erreur}</p>}
      <div className="absolute top-3 left-3 z-[3] flex gap-2" dir="ltr">
        {gps && <Button size="sm" variant="outline" className="bg-background shadow-sm" onClick={recentrer}><Crosshair data-icon="inline-start" />{texte('maPosition', langue)}</Button>}
        {satelliteDisponible() && (
          <Button size="sm" variant={satellite ? 'default' : 'outline'} className={satellite ? 'shadow-sm' : 'bg-background shadow-sm'} aria-pressed={satellite} onClick={() => setSatellite((v) => !v)}>
            <Satellite data-icon="inline-start" />{satellite ? texte('plan', langue) : texte('satellite', langue)}
          </Button>
        )}
      </div>
      <div className="absolute inset-x-3 bottom-8 z-[3] rounded-lg border bg-background/95 p-3 text-sm shadow-sm" role="status" aria-live="polite">
        {recherche === 'en_cours' && <p className="m-0 text-muted-foreground">{texte('recherche', langue)}</p>}
        {recherche === 'erreur' && <p className="m-0 text-muted-foreground">{texte('horsReseau', langue)}</p>}
        {recherche === 'ok' && t && (
          <p className="m-0">
            <strong>{texte('proche', langue)}</strong> : {libelleTroncon(t) || texte('diametreInconnu', langue)}
            {t.distance_m != null ? ` · ${texte('a', langue)} ${nombre(t.distance_m, 1)} m` : ''}
            {suggestions?.secteur ? ` · ${texte('secteur', langue)} ${suggestions.secteur.code}` : ''}
          </p>
        )}
        {recherche === 'ok' && !t && <p className="m-0">{texte('aucune', langue)} {suggestions?.rayon_m ?? 30} m.</p>}
        <p className="m-0 mt-1 text-muted-foreground text-xs">
          {texte('aide', langue)}
          {gps?.precision != null ? ` ${texte('precisionGps', langue)} : ± ${nombre(gps.precision, 0)} m.` : ''}
          {position?.deplacee && ecart != null ? ` ${texte('deplacee', langue)} ${nombre(ecart, 0)} m.` : ''}
        </p>
      </div>
    </div>
  );
}

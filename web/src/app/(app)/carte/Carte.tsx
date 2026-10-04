'use client';

// Carte MapLibre. La bibliothèque n'est chargée qu'à l'ouverture de cette page, en module natif
// servi depuis public/maplibre/ (voir scripts/copier-maplibre.mjs) : les autres pages n'en portent
// pas le poids et le « worker » de MapLibre se trouve à côté de son module.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';
import type { GeoJSONSource, Map as CarteMapLibre, MapGeoJSONFeature, StyleSpecification } from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { STATUTS, dateHeure, libellesMarche } from '@/lib/format';
import type { StatutFuite } from '@/lib/types';
import {
  ALERTES, CENTRE_DEFAUT, COULEURS, STYLE_FOND, ZOOM_DEFAUT, aUneAlerte, geometrieValide,
  type Contour, type FuiteCarte,
} from './commun';

type Libelles = ReturnType<typeof libellesMarche>;
export type CarteRef = { recentrer: () => void };

// Fond de secours (hors ligne, fournisseur injoignable) : les fuites restent visibles sur fond uni.
const STYLE_SECOURS: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#eef2f5' } }],
};

const MODULE_MAPLIBRE = '/maplibre/maplibre-gl.mjs';

const vide = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

function pointsFuites(fuites: FuiteCarte[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: fuites
      .filter((f) => f.latitude != null && f.longitude != null)
      .map((f): Feature<Point> => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.longitude as number, f.latitude as number] },
        properties: { id: f.id, statut: f.statut, alerte: aUneAlerte(f) },
      })),
  };
}

function contours(liste: Contour[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: liste
      .filter((c) => geometrieValide(c.geom))
      .map((c) => ({ type: 'Feature', geometry: c.geom!, properties: { id: c.id, libelle: c.libelle || c.code } })),
  };
}

// Tous les sommets d'un contour (Polygon ou MultiPolygon).
const sommets = (g: Geometry): number[][] =>
  g.type === 'Polygon' ? g.coordinates.flat() : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : [];

// Couleur par statut, lue dans COULEURS (une seule source pour la carte et la légende).
const parStatut = (cle: 'fond' | 'contour') =>
  ['match', ['get', 'statut'],
    ...(Object.keys(COULEURS) as StatutFuite[]).flatMap((s) => [s, COULEURS[s][cle]]),
    '#555'] as unknown as string;

interface Props {
  fuites: FuiteCarte[];
  zones: Contour[];
  secteurs: Contour[];
  libelles: Libelles;
}

export const Carte = forwardRef<CarteRef, Props>(function Carte({ fuites, zones, secteurs, libelles }, ref) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMapLibre | null>(null);
  const [pret, setPret] = useState(false);
  const [fondIndisponible, setFondIndisponible] = useState(false);
  const [erreur, setErreur] = useState('');
  const router = useRouter();

  // Données lues par les gestionnaires de la carte (créés une seule fois).
  const fuitesRef = useRef(fuites);
  fuitesRef.current = fuites;
  const libellesRef = useRef(libelles);
  libellesRef.current = libelles;
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const secteursRef = useRef(secteurs);
  secteursRef.current = secteurs;
  const routerRef = useRef(router);
  routerRef.current = router;

  // Cadre : les fuites affichées ; sinon les contours dessinés (secteur choisi) ; sinon Oujda.
  const recentrer = () => {
    const m = carte.current;
    if (!m) return;
    let coords: number[][] = fuitesRef.current
      .filter((f) => f.latitude != null && f.longitude != null)
      .map((f) => [f.longitude as number, f.latitude as number]);
    if (coords.length === 0) {
      coords = [...secteursRef.current, ...(secteursRef.current.length ? [] : zonesRef.current)]
        .filter((c) => geometrieValide(c.geom))
        .flatMap((c) => sommets(c.geom!));
    }
    if (coords.length === 0) {
      m.easeTo({ center: CENTRE_DEFAUT, zoom: ZOOM_DEFAUT });
      return;
    }
    const lng = coords.map((c) => c[0]);
    const lat = coords.map((c) => c[1]);
    m.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], {
      padding: 60, maxZoom: 16, duration: 600,
    });
  };
  const recentrerRef = useRef(recentrer);
  recentrerRef.current = recentrer;
  useImperativeHandle(ref, () => ({ recentrer: () => recentrerRef.current() }), []);

  // Création de la carte (une fois).
  useEffect(() => {
    let annule = false;
    let instance: CarteMapLibre | null = null;
    (async () => {
      let ml: typeof import('maplibre-gl');
      try {
        ml = (await import(/* webpackIgnore: true */ MODULE_MAPLIBRE)) as typeof import('maplibre-gl');
      } catch {
        if (!annule) setErreur('La carte n\'a pas pu être chargée (pas de réseau ?). Réessayez quand la connexion revient.');
        return;
      }
      if (annule || !conteneur.current) return;

      // Le fond n'est demandé qu'une fois ; sans réponse en 8 s, fond uni.
      let style: string | StyleSpecification = STYLE_SECOURS;
      let avecTextes = false;
      try {
        const c = new AbortController();
        const minuterie = setTimeout(() => c.abort(), 8000);
        const r = await fetch(STYLE_FOND, { signal: c.signal });
        clearTimeout(minuterie);
        if (!r.ok) throw new Error(String(r.status));
        style = (await r.json()) as StyleSpecification;
        avecTextes = !!(style as StyleSpecification).glyphs;
      } catch {
        if (!annule) setFondIndisponible(true);
      }
      if (annule || !conteneur.current) return;

      try {
        instance = new ml.Map({
          container: conteneur.current,
          style,
          center: CENTRE_DEFAUT,
          zoom: ZOOM_DEFAUT,
          maxZoom: 19,
          attributionControl: style === STYLE_SECOURS
            ? { compact: false, customAttribution: 'Fond de carte indisponible' }
            : { compact: false },
          dragRotate: false,
          pitchWithRotate: false,
        });
      } catch {
        setErreur('Ce navigateur ne peut pas afficher la carte (WebGL indisponible).');
        return;
      }
      const m = instance;
      carte.current = m;
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      m.addControl(new ml.ScaleControl({ unit: 'metric', maxWidth: 140 }), 'bottom-left');

      m.on('load', () => {
        if (annule) return;
        // Zones et secteurs (seulement ceux dont le contour est dessiné).
        m.addSource('zones', { type: 'geojson', data: vide() });
        m.addSource('secteurs', { type: 'geojson', data: vide() });
        m.addLayer({ id: 'zones-fond', type: 'fill', source: 'zones', paint: { 'fill-color': '#0b5d8a', 'fill-opacity': 0.06 } });
        m.addLayer({ id: 'zones-trait', type: 'line', source: 'zones', paint: { 'line-color': '#0b5d8a', 'line-width': 2.5 } });
        m.addLayer({
          id: 'secteurs-trait', type: 'line', source: 'secteurs',
          paint: { 'line-color': '#0b5d8a', 'line-width': 1.2, 'line-dasharray': [3, 2] },
        });

        // Fuites, regroupées tant qu'elles sont serrées.
        m.addSource('fuites', { type: 'geojson', data: vide(), cluster: true, clusterRadius: 45, clusterMaxZoom: 15 });
        m.addLayer({
          id: 'groupes', type: 'circle', source: 'fuites', filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#0b5d8a', 'circle-opacity': 0.85,
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
        // Halo rouge sous les fuites en alerte.
        m.addLayer({
          id: 'fuites-alerte', type: 'circle', source: 'fuites',
          filter: ['all', ['!', ['has', 'point_count']], ['==', ['get', 'alerte'], true]],
          paint: { 'circle-radius': 15, 'circle-color': '#b3261e', 'circle-opacity': 0.25, 'circle-stroke-width': 2, 'circle-stroke-color': '#b3261e' },
        });
        m.addLayer({
          id: 'fuites-points', type: 'circle', source: 'fuites', filter: ['!', ['has', 'point_count']],
          paint: {
            'circle-radius': 9, 'circle-color': parStatut('fond'),
            'circle-stroke-width': 2.5, 'circle-stroke-color': parStatut('contour'),
          },
        });
        setPret(true);
        recentrerRef.current();
      });

      // Au doigt, on touche rarement le point exact : on cherche dans un carré de ±14 px.
      const autour = (x: number, y: number, couches: string[]): MapGeoJSONFeature[] =>
        m.queryRenderedFeatures([[x - 14, y - 14], [x + 14, y + 14]], { layers: couches.filter((c) => m.getLayer(c)) });

      m.on('click', async (e) => {
        const groupe = autour(e.point.x, e.point.y, ['groupes'])[0];
        if (groupe) {
          const source = m.getSource('fuites') as GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(groupe.properties.cluster_id as number);
          m.easeTo({ center: (groupe.geometry as Point).coordinates as [number, number], zoom: Math.min(zoom, 18) });
          return;
        }
        const point = autour(e.point.x, e.point.y, ['fuites-points'])[0];
        if (!point) return;
        const f = fuitesRef.current.find((x) => x.id === point.properties.id);
        if (!f) return;
        // Bulle au-dessus du point, placé dans le quart bas de la carte : elle reste entière à l'écran.
        const position: [number, number] = [f.longitude as number, f.latitude as number];
        m.easeTo({ center: position, offset: [0, m.getContainer().clientHeight * 0.28], duration: 300 });
        new ml.Popup({ maxWidth: '320px', focusAfterOpen: false, anchor: 'bottom', offset: 14 })
          .setLngLat(position)
          .setDOMContent(bulle(f, libellesRef.current, (href) => routerRef.current.push(href)))
          .addTo(m);
      });
      // Curseur « main » au survol (souris).
      for (const couche of ['groupes', 'fuites-points']) {
        m.on('mouseenter', couche, () => (m.getCanvas().style.cursor = 'pointer'));
        m.on('mouseleave', couche, () => (m.getCanvas().style.cursor = ''));
      }
    })();
    return () => {
      annule = true;
      instance?.remove();
      carte.current = null;
    };
  }, []);

  // Données : mises à jour à chaque changement de filtre.
  useEffect(() => {
    if (!pret || !carte.current) return;
    (carte.current.getSource('fuites') as GeoJSONSource | undefined)?.setData(pointsFuites(fuites));
  }, [pret, fuites]);
  useEffect(() => {
    if (!pret || !carte.current) return;
    (carte.current.getSource('zones') as GeoJSONSource | undefined)?.setData(contours(zones));
    (carte.current.getSource('secteurs') as GeoJSONSource | undefined)?.setData(contours(secteurs));
  }, [pret, zones, secteurs]);

  return (
    <div className="carte-cadre">
      <div ref={conteneur} className="carte-maplibre" aria-label="Carte des fuites" />
      {!pret && !erreur && <p className="carte-message">Chargement de la carte…</p>}
      {erreur && <p className="carte-message erreur">{erreur}</p>}
      {fondIndisponible && pret && (
        <p className="carte-bandeau">Fond de carte indisponible (réseau) : les fuites sont affichées sans le plan des rues.</p>
      )}
    </div>
  );
});

// Contenu de la bulle, construit en DOM (aucun HTML injecté depuis les données).
function bulle(f: FuiteCarte, l: Libelles, ouvrir: (href: string) => void): HTMLElement {
  const el = (tag: string, classe?: string, texte?: string) => {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texte != null) n.textContent = texte;
    return n;
  };
  const racine = el('div', 'bulle-fuite');
  const tete = el('div', 'fuite-tete');
  tete.append(el('strong', undefined, `N° ${f.numero}`), el('span', `badge ${STATUTS[f.statut].classe}`, STATUTS[f.statut].libelle));
  racine.append(tete);
  if (f.reference_srm) racine.append(el('div', undefined, `${l.reference} : ${f.reference_srm}`));
  racine.append(el('div', undefined, [f.zone, f.secteur ?? 'Secteur non renseigné'].filter(Boolean).join(' · ')));
  if (f.adresse) racine.append(el('div', 'discret', f.adresse));
  racine.append(el('div', 'discret', `Détectée le ${dateHeure(f.date_detection)}${f.origine === 'srm' ? ` · signalée ${l.sigle}` : ''}`));
  const alertes = ALERTES.filter((a) => f[a.cle] === true);
  if (alertes.length) {
    const bloc = el('div', 'alertes');
    alertes.forEach((a) => bloc.append(el('span', 'alerte', a.texte(l))));
    racine.append(bloc);
  }
  const lien = el('a', 'bouton primaire', 'Ouvrir la fiche') as HTMLAnchorElement;
  lien.href = `/fuites/${f.id}`;
  lien.addEventListener('click', (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    ouvrir(`/fuites/${f.id}`);
  });
  racine.append(lien);
  return racine;
}

'use client';

// Carte MapLibre. La bibliothèque n'est chargée qu'à l'ouverture de cette page, en module natif
// servi depuis public/maplibre/ (voir scripts/copier-maplibre.mjs) : les autres pages n'en portent
// pas le poids et le « worker » de MapLibre se trouve à côté de son module.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Point } from 'geojson';
import type { GeoJSONSource, Map as CarteMapLibre, MapGeoJSONFeature, StyleSpecification } from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { STATUTS, dateHeure, libellesMarche } from '@/lib/format';
import { lienItineraire } from '@/lib/itineraire';
import type { EtatCarte } from './capture';
import {
  ALERTES, CENTRE_DEFAUT, MODULE_MAPLIBRE, STYLE_FOND, ZOOM_DEFAUT, geometrieValide,
  type Contour, type FuiteCarte,
} from './commun';
import { STYLE_SECOURS, ajouterCouches, contours, pointsFuites, sommets } from './couches';

type Libelles = ReturnType<typeof libellesMarche>;
export type CarteRef = { recentrer: () => void; centrerSur: (f: FuiteCarte) => void; etatImpression: () => EtatCarte | null };

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

  // Fond et vue affichée, pour la carte imprimée (capture.ts) ; rempli une fois la carte chargée.
  const impression = useRef<Pick<EtatCarte, 'style' | 'avecTextes' | 'fondIndisponible'> | null>(null);
  const etatImpression = (): EtatCarte | null => {
    const m = carte.current;
    if (!m || !impression.current) return null;
    const b = m.getBounds();
    const c = m.getCenter();
    return {
      ...impression.current,
      bornes: [[b.getWest(), b.getSouth()], [b.getEast(), b.getNorth()]],
      centre: [c.lng, c.lat],
      zoom: m.getZoom(),
      largeurPx: m.getContainer().clientWidth,
      hauteurPx: m.getContainer().clientHeight,
    };
  };
  // Centre la carte sur une fuite et ouvre sa bulle (sélection depuis la liste).
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const centrerSur = (f: FuiteCarte) => {
    const m = carte.current;
    const ml = mlRef.current;
    if (!m || !ml || f.latitude == null || f.longitude == null) return;
    const position: [number, number] = [f.longitude, f.latitude];
    m.easeTo({ center: position, zoom: Math.max(m.getZoom(), 15), offset: [0, m.getContainer().clientHeight * 0.2], duration: 500 });
    new ml.Popup({ maxWidth: '320px', focusAfterOpen: false, anchor: 'bottom', offset: 14, className: 'ancien' })
      .setLngLat(position)
      .setDOMContent(bulle(f, libellesRef.current, (href) => routerRef.current.push(href)))
      .addTo(m);
  };
  const centrerSurRef = useRef(centrerSur);
  centrerSurRef.current = centrerSur;
  useImperativeHandle(ref, () => ({ recentrer: () => recentrerRef.current(), centrerSur: (f) => centrerSurRef.current(f), etatImpression }), []);

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
      mlRef.current = ml;

      // Le fond n'est demandé qu'une fois ; sans réponse en 8 s, fond uni.
      let style: StyleSpecification = STYLE_SECOURS;
      let avecTextes = false;
      try {
        const c = new AbortController();
        const minuterie = setTimeout(() => c.abort(), 8000);
        const r = await fetch(STYLE_FOND, { signal: c.signal });
        clearTimeout(minuterie);
        if (!r.ok) throw new Error(String(r.status));
        style = (await r.json()) as StyleSpecification;
        avecTextes = !!style.glyphs;
      } catch {
        if (!annule) setFondIndisponible(true);
      }
      // Copie intacte du style (MapLibre peut modifier l'objet qu'il reçoit).
      const styleImpression = structuredClone(style);
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
        // Zones et secteurs (seulement ceux dont le contour est dessiné), fuites regroupées tant qu'elles sont serrées.
        ajouterCouches(m, { avecTextes });
        impression.current = { style: styleImpression, avecTextes, fondIndisponible: style === STYLE_SECOURS };
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
        new ml.Popup({ maxWidth: '320px', focusAfterOpen: false, anchor: 'bottom', offset: 14, className: 'ancien' })
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
    <div className="relative h-full min-h-72 w-full overflow-hidden bg-muted">
      <div ref={conteneur} className="carte-maplibre absolute inset-0" aria-label="Carte des fuites" />
      {!pret && !erreur && <p className="absolute inset-0 m-0 grid place-items-center p-4 text-center text-muted-foreground text-sm">Chargement de la carte…</p>}
      {erreur && <p className="absolute inset-x-4 bottom-4 m-0 rounded-lg bg-destructive/10 p-3 text-center text-destructive text-sm">{erreur}</p>}
      {fondIndisponible && pret && (
        <p className="absolute top-3 right-14 left-3 m-0 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-900 text-xs dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
          Fond de carte indisponible (réseau) : les fuites sont affichées sans le plan des rues.
        </p>
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
  // « Y aller » : itinéraire dans l'appli de cartes de l'appareil (Google Maps sur Android), vers la fuite.
  const boutons = el('div', 'bulle-boutons');
  boutons.append(lien);
  const itineraire = lienItineraire(f.latitude, f.longitude);
  if (itineraire) {
    const aller = el('a', 'bouton', 'Y aller') as HTMLAnchorElement;
    aller.href = itineraire;
    aller.target = '_blank';
    aller.rel = 'noreferrer';
    boutons.append(aller);
  }
  racine.append(boutons);
  return racine;
}

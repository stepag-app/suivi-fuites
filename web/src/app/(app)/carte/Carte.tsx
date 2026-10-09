'use client';

// Carte MapLibre. La bibliothèque n'est chargée qu'à l'ouverture de cette page, en module natif
// servi depuis public/maplibre/ (voir scripts/copier-maplibre.mjs) : les autres pages n'en portent
// pas le poids et le « worker » de MapLibre se trouve à côté de son module.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Point } from 'geojson';
import type { GeoJSONSource, Map as CarteMapLibre, MapGeoJSONFeature, StyleSpecification } from 'maplibre-gl';
import { useRouter } from 'next/navigation';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { STATUTS, dateHeure, libellesMarche, nombre } from '@/lib/format';
import { lienItineraire } from '@/lib/itineraire';
import { langueApk, texteEtatTronconApk, traduire, useLangueApk } from '@/lib/langue-apk';
import type { PaletteReseau } from '@/lib/reseau/palette';
import { formaterLineaire, type ModeSelection } from '@/lib/reseau/selection';
import { enregistrerProtocole, type TuilesReseau } from '@/lib/reseau/tuiles';
import type { Coloration, EtatFeature, ProprietesTroncon } from '@/lib/reseau/types';
import type { EtatCarte } from './capture';
import {
  ALERTES, CENTRE_DEFAUT, MODULE_MAPLIBRE, STYLE_FOND, ZOOM_DEFAUT, geometrieValide,
  type Contour, type FuiteCarte,
} from './commun';
import { STYLE_SECOURS, ajouterCouches, contours, couchesTraitReseau, pointsFuites, sommets } from './couches';
import { installerTrace } from './lasso';
import { creerGestionReseau, creerGestionTuiles, type GestionReseau, type SecteurAffiche } from './reseau-carte';
import styles from './reseau.module.css';
import { afficherSatellite } from './satellite';

type Libelles = ReturnType<typeof libellesMarche>;
export type CarteRef = { recentrer: () => void; centrerSur: (f: FuiteCarte) => void; etatImpression: () => EtatCarte | null };

/** Réseau d'eau affiché sur la carte (lot S) ; absent : aucune couche du réseau. */
export interface ReseauCarteProps {
  secteurs: SecteurAffiche[];
  coloration: Coloration;
  palette: PaletteReseau;
  etats: Map<string, EtatFeature>;
  libelles: Map<string, { secteur: string; zone: string }>;
  modeBalayage: boolean;
  /** Outil du mode balayage : toucher les tronçons un par un, ou lasso au doigt (la carte ne bouge pas pendant le tracé). */
  outil: 'toucher' | 'lasso';
  selection: Set<string>;
  surSelection: (ids: string[], mode: ModeSelection) => void;
  surLasso: (anneau: number[][]) => void;
  peutAnnuler: boolean;
  annuler: (tronconId: string) => void;
  surZoom: (zoom: number) => void;
  /** Archive de tuiles à jour : tout le réseau en une source ; null : lecture par secteur. */
  tuiles: TuilesReseau | null;
}

interface Props {
  fuites: FuiteCarte[];
  zones: Contour[];
  secteurs: Contour[];
  libelles: Libelles;
  reseau?: ReseauCarteProps;
  /** Image satellite (C5) et emprise du réseau qui la borne. */
  satellite?: boolean;
  bornesReseau?: [number, number, number, number] | null;
  /** Zoom courant, pour l'avertissement « satellite à partir du zoom 13 ». */
  surZoom?: (zoom: number) => void;
}

export const Carte = forwardRef<CarteRef, Props>(function Carte({ fuites, zones, secteurs, libelles, reseau, satellite = false, bornesReseau = null, surZoom }, ref) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMapLibre | null>(null);
  const gestion = useRef<GestionReseau | null>(null);
  const avecTextesRef = useRef(false);
  const [versionGestion, setVersionGestion] = useState(0);
  const [pret, setPret] = useState(false);
  const { tb } = useLangueApk();
  const [fondIndisponible, setFondIndisponible] = useState(false);
  const [erreur, setErreur] = useState('');
  const router = useRouter();

  // Données lues par les gestionnaires de la carte (créés une seule fois).
  const fuitesRef = useRef(fuites);
  fuitesRef.current = fuites;
  const reseauRef = useRef(reseau);
  reseauRef.current = reseau;
  const libellesRef = useRef(libelles);
  libellesRef.current = libelles;
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const secteursRef = useRef(secteurs);
  secteursRef.current = secteurs;
  const routerRef = useRef(router);
  routerRef.current = router;
  const surZoomRef = useRef(surZoom);
  surZoomRef.current = surZoom;

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
      enregistrerProtocole(ml as never);

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
      // Mesure de fluidité (scripts d'essai) : jamais activée en production.
      if (process.env.NEXT_PUBLIC_MESURE_CARTE === '1') (window as unknown as { __carteFuites?: CarteMapLibre }).__carteFuites = m;
      m.touchZoomRotate.disableRotation();
      m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
      m.addControl(new ml.ScaleControl({ unit: 'metric', maxWidth: 140 }), 'bottom-left');

      m.on('load', () => {
        if (annule) return;
        // Zones et secteurs (seulement ceux dont le contour est dessiné), fuites regroupées tant qu'elles sont serrées.
        ajouterCouches(m, { avecTextes });
        avecTextesRef.current = avecTextes;
        // Lasso du mode balayage (souris ou doigt) : la sélection se fait sur les données, par le milieu des tronçons.
        installerTrace(m, {
          outil: () => (reseauRef.current?.modeBalayage && reseauRef.current.outil === 'lasso' ? 'lasso' : null),
          surFin: (anneau) => reseauRef.current?.surLasso(anneau),
        });
        impression.current = { style: styleImpression, avecTextes, fondIndisponible: style === STYLE_SECOURS };
        setPret(true);
        recentrerRef.current();
      });
      m.on('zoomend', () => {
        reseauRef.current?.surZoom(m.getZoom());
        surZoomRef.current?.(m.getZoom());
      });

      // Au doigt, on touche rarement le point exact : on cherche dans un carré de ±14 px.
      const autour = (x: number, y: number, couches: string[]): MapGeoJSONFeature[] =>
        m.queryRenderedFeatures([[x - 14, y - 14], [x + 14, y + 14]], { layers: couches.filter((c) => m.getLayer(c)) });

      m.on('click', async (e) => {
        const r = reseauRef.current;
        // Mode balayage : un appui sur un tronçon le sélectionne (ou le retire), rien d'autre ne réagit.
        if (r?.modeBalayage) {
          const troncon = autour(e.point.x, e.point.y, couchesTraitReseau(m))[0];
          const id = troncon ? gestion.current?.proprietes(troncon)?.id : null;
          if (id) r.surSelection([id], 'basculer');
          return;
        }
        const groupe = autour(e.point.x, e.point.y, ['groupes'])[0];
        if (groupe) {
          const source = m.getSource('fuites') as GeoJSONSource;
          const zoom = await source.getClusterExpansionZoom(groupe.properties.cluster_id as number);
          m.easeTo({ center: (groupe.geometry as Point).coordinates as [number, number], zoom: Math.min(zoom, 18) });
          return;
        }
        const point = autour(e.point.x, e.point.y, ['fuites-points'])[0];
        if (!point) {
          // Pas de fuite sous le doigt : un tronçon du réseau ?
          const troncon = r ? autour(e.point.x, e.point.y, couchesTraitReseau(m))[0] : undefined;
          const p: ProprietesTroncon | null | undefined = troncon ? gestion.current?.proprietes(troncon) : null;
          if (!p || !r) return;
          // Sans ancre imposée : MapLibre place la bulle du côté où elle tient entière (tronçon au bord de la carte).
          new ml.Popup({ maxWidth: '320px', focusAfterOpen: false, offset: 10 })
            .setLngLat(e.lngLat)
            .setDOMContent(bulleTroncon(p, r.libelles.get(p.s ?? ''), r.etats.get(p.id), r.peutAnnuler ? () => r.annuler(p.id) : null))
            .addTo(m);
          return;
        }
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

  // Lecture du réseau : tuiles (une source) ou GeoJSON par secteur ; changer de lecture retire l'ancienne et
  // relance la synchronisation, l'état de balayage et la sélection (versionGestion).
  const tuiles = reseau?.tuiles ?? null;
  const tuilesGestion = useRef<TuilesReseau | null>(null);
  const satelliteActif = useRef(false);
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    if (gestion.current && tuilesGestion.current === tuiles) return;
    gestion.current?.tout();
    const options = { avecTextes: avecTextesRef.current };
    gestion.current = tuiles ? creerGestionTuiles(m, tuiles, options) : creerGestionReseau(m, options);
    tuilesGestion.current = tuiles;
    gestion.current.halo(satelliteActif.current);
    setVersionGestion((v) => v + 1);
  }, [pret, tuiles]);

  // Réseau : sources, coloration, état de balayage et sélection (feature-state).
  const secteursReseau = reseau?.secteurs;
  const coloration = reseau?.coloration ?? 'secteur';
  const palette = reseau?.palette;
  useEffect(() => {
    const g = gestion.current;
    if (!pret || !g) return;
    g.synchroniser(secteursReseau ?? [], coloration, palette ?? { secteurs: new Map(), zones: new Map() });
  }, [pret, secteursReseau, coloration, palette, versionGestion]);
  useEffect(() => {
    const g = gestion.current;
    if (!pret || !g || !palette) return;
    g.colorer(coloration, palette);
  }, [pret, coloration, palette]);
  const etats = reseau?.etats;
  useEffect(() => {
    const g = gestion.current;
    if (!pret || !g || !etats) return;
    g.appliquerEtats(etats);
  }, [pret, etats, secteursReseau, versionGestion]);
  const selection = reseau?.selection;
  useEffect(() => {
    const g = gestion.current;
    if (!pret || !g) return;
    g.appliquerSelection(selection ?? new Set());
  }, [pret, selection, secteursReseau, versionGestion]);

  // Satellite (C5) : couche créée à la première activation seulement ; halo clair sous le réseau.
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    satelliteActif.current = afficherSatellite(m, satellite, bornesReseau);
    gestion.current?.halo(satelliteActif.current);
  }, [pret, satellite, bornesReseau, versionGestion]);
  const modeBalayage = reseau?.modeBalayage ?? false;
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    m.getCanvas().style.cursor = modeBalayage ? 'crosshair' : '';
  }, [pret, modeBalayage]);

  return (
    <div className="relative h-full min-h-72 w-full overflow-hidden bg-muted">
      <div ref={conteneur} className="carte-maplibre absolute inset-0" aria-label="Carte des fuites" />
      {!pret && !erreur && <p className="absolute inset-0 m-0 grid place-items-center p-4 text-center text-muted-foreground text-sm">{tb('Chargement de la carte…')}</p>}
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

const CATEGORIES_TRONCON: Record<string, string> = { conduite: 'Conduite', branchement: 'Branchement', adduction: 'Adduction', autre: 'Autre' };

// Bulle d'un tronçon du réseau : secteur, zone, diamètre, matériau, longueur, état de balayage, annulation.
function bulleTroncon(
  p: ProprietesTroncon, noms: { secteur: string; zone: string } | undefined, etat: EtatFeature | undefined, annuler: (() => void) | null,
): HTMLElement {
  const el = (tag: string, classe?: string, texte?: string) => {
    const n = document.createElement(tag);
    if (classe) n.className = classe;
    if (texte != null) n.textContent = texte;
    return n;
  };
  const racine = el('div', styles.bulleTroncon);
  racine.append(el('strong', undefined, `${CATEGORIES_TRONCON[p.c] ?? 'Tronçon'}${p.d ? ` DN ${nombre(p.d, 0)}` : ''}${p.m ? ` · ${p.m}` : ''}`));
  racine.append(el('div', undefined, noms ? `${noms.zone} · ${noms.secteur}` : 'Non zoné'));
  racine.append(el('div', 'discret', `Longueur ${formaterLineaire(p.l)}${p.d ? '' : ' · diamètre inconnu'}`));
  racine.append(el('div', `${styles.etat} ${etat?.balaye ? styles.balaye : styles.non}`, texteEtatTronconApk(etat)));
  if (annuler && etat?.balaye) {
    const b = el('button', 'danger', traduire(langueApk(), 'Annuler le balayage')) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', annuler);
    const boutons = el('div', 'bulle-boutons');
    boutons.append(b);
    racine.append(boutons);
  }
  return racine;
}

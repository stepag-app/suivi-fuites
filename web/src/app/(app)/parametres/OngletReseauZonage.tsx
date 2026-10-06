'use client';

// Carte de zonage plein écran : tous les tronçons du marché (non zonés en gris pointillé), contours des
// secteurs, sélection par clic, Maj+clic, rectangle (Maj+glisser ou outil) et lasso ; affectation à un
// secteur, retrait, recalcul du contour, contour dessiné à la main. La sélection se fait sur les données
// (milieu du tronçon dans le polygone, comme la base), jamais sur le rendu.
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import type { GeoJSONSource, Map as CarteMapLibre, MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nombre } from '@/lib/format';
import {
  affecterTronconsSecteur, chargerReseauComplet, definirContourSecteur, messageReseau, recalculerContourSecteur,
} from '@/lib/reseau/donnees';
import { COULEUR_NON_ZONE, COULEUR_SELECTION, expressionCouleurSecteur, expressionLargeur, type PaletteReseau } from '@/lib/reseau/palette';
import {
  anneauEnPolygone, appliquerSelection, bornesPositions, formaterLineaire, idsIndexDansAnneau, indexerTroncons, lassoEnAnneau,
  lineaireSelection, sommetsTroncons, type ModeSelection, type Position, type TronconIndexe,
} from '@/lib/reseau/selection';
import type { CollectionTroncons, SecteurReseau, ZoneReseau } from '@/lib/reseau/types';
import { CENTRE_DEFAUT, COULEUR_CONTOURS, MODULE_MAPLIBRE, STYLE_FOND, ZOOM_DEFAUT, geometrieValide } from '../carte/commun';
import { STYLE_SECOURS, contours, sommets } from '../carte/couches';
import { installerTrace } from '../carte/lasso';
import styles from './Reseau.module.css';

type Outil = 'clic' | 'rectangle' | 'lasso' | 'contour';
const OUTILS: [Outil, string][] = [['clic', 'Clic'], ['rectangle', 'Rectangle'], ['lasso', 'Lasso'], ['contour', 'Contour à la main']];
const SOURCE_RESEAU = 'reseau-tout';
const vide = (): FeatureCollection => ({ type: 'FeatureCollection', features: [] });

interface Props {
  marcheId: string;
  zones: ZoneReseau[];
  secteurs: SecteurReseau[];
  palette: PaletteReseau;
  fermer: () => void;
  recharger: () => Promise<void>;
}

export function OngletReseauZonage({ marcheId, zones, secteurs, palette, fermer, recharger }: Props) {
  const conteneur = useRef<HTMLDivElement>(null);
  const carte = useRef<CarteMapLibre | null>(null);
  const [pret, setPret] = useState(false);
  const [fondIndisponible, setFondIndisponible] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [collection, setCollection] = useState<CollectionTroncons | null>(null);
  const index = useRef(new Map<string, TronconIndexe>());
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const selectionPosee = useRef(new Set<string>());
  const cadre = useRef(false);
  const [outil, setOutil] = useState<Outil>('clic');
  const [ajouter, setAjouter] = useState(false);
  const [secteurCible, setSecteurCible] = useState(secteurs[0]?.id ?? '');
  const [contourPoints, setContourPoints] = useState<Position[]>([]);

  // Lus par les gestionnaires de la carte (créés une fois).
  const outilRef = useRef(outil);
  outilRef.current = outil;
  const ajouterRef = useRef(ajouter);
  ajouterRef.current = ajouter;

  const secteursParZone = useMemo(() => {
    const parZone = new Map<string, SecteurReseau[]>();
    for (const s of secteurs) parZone.set(s.zone_id, [...(parZone.get(s.zone_id) ?? []), s]);
    return [...zones].sort((a, b) => a.numero - b.numero).map((z) => ({ zone: z, secteurs: (parZone.get(z.id) ?? []).sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code, 'fr')) }));
  }, [zones, secteurs]);
  const nomSecteur = useMemo(() => new Map(secteurs.map((s) => [s.id, `${s.code} · ${s.libelle}`])), [secteurs]);

  // La page derrière ne doit pas défiler.
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = avant;
    };
  }, []);

  const chargerReseau = useCallback(async () => {
    setChargement(true);
    try {
      const c = await chargerReseauComplet(marcheId);
      index.current = indexerTroncons(c.features);
      setCollection(c);
      setErreur('');
    } catch (e) {
      setErreur(messageReseau(e));
    }
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    chargerReseau();
  }, [chargerReseau]);

  const changerSelection = useCallback((ids: string[], mode: ModeSelection) => {
    setSelection((courante) => appliquerSelection(courante, ids, mode));
  }, []);

  // Création de la carte.
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
      if (annule || !conteneur.current) return;
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
      if (annule || !conteneur.current) return;
      try {
        instance = new ml.Map({
          container: conteneur.current, style, center: CENTRE_DEFAUT, zoom: ZOOM_DEFAUT, maxZoom: 20,
          attributionControl: { compact: false }, dragRotate: false, pitchWithRotate: false,
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
        m.addSource('secteurs', { type: 'geojson', data: vide() });
        m.addLayer({ id: 'secteurs-fond', type: 'fill', source: 'secteurs', paint: { 'fill-color': ['get', 'couleur'], 'fill-opacity': 0.08 } });
        m.addLayer({ id: 'secteurs-trait', type: 'line', source: 'secteurs', paint: { 'line-color': ['get', 'couleur'], 'line-width': 2, 'line-dasharray': [3, 2] } });
        if (avecTextes) {
          m.addLayer({
            id: 'secteurs-noms', type: 'symbol', source: 'secteurs',
            layout: { 'text-field': ['get', 'libelle'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] },
            paint: { 'text-color': COULEUR_CONTOURS, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
          });
        }
        m.addSource(SOURCE_RESEAU, { type: 'geojson', data: vide(), promoteId: 'id' });
        m.addLayer({
          id: 'reseau-selection', type: 'line', source: SOURCE_RESEAU, layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': COULEUR_SELECTION, 'line-width': expressionLargeur(1, 7),
            'line-opacity': ['case', ['boolean', ['feature-state', 'selection'], false], 0.9, 0],
          },
        });
        m.addLayer({
          id: 'reseau-zones-trait', type: 'line', source: SOURCE_RESEAU, filter: ['to-boolean', ['get', 's']],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': expressionCouleurSecteur(palette), 'line-width': expressionLargeur(), 'line-opacity': 0.95 },
        });
        m.addLayer({
          id: 'reseau-sans-trait', type: 'line', source: SOURCE_RESEAU, filter: ['!', ['to-boolean', ['get', 's']]],
          paint: { 'line-color': COULEUR_NON_ZONE, 'line-width': expressionLargeur(), 'line-dasharray': [2, 2] },
        });
        m.addSource('apercu', { type: 'geojson', data: vide() });
        m.addLayer({ id: 'apercu-fond', type: 'fill', source: 'apercu', paint: { 'fill-color': COULEUR_SELECTION, 'fill-opacity': 0.12 } });
        m.addLayer({ id: 'apercu-trait', type: 'line', source: 'apercu', paint: { 'line-color': COULEUR_SELECTION, 'line-width': 2, 'line-dasharray': [2, 1.5] } });
        m.addLayer({ id: 'apercu-points', type: 'circle', source: 'apercu', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 6, 'circle-color': '#fff', 'circle-stroke-color': COULEUR_SELECTION, 'circle-stroke-width': 2.5 } });
        // Rectangle et lasso (souris ou doigt, carte immobile pendant le tracé) : même module que la carte des
        // fuites ; après le chargement du style, car il ajoute une source d'aperçu.
        installerTrace(m, {
          outil: () => {
            const o = outilRef.current;
            return o === 'rectangle' || o === 'lasso' ? o : null;
          },
          outilMaj: () => (outilRef.current === 'clic' ? 'rectangle' : null),
          surFin: (anneau, cumul) => {
            const ids = idsIndexDansAnneau(index.current.values(), anneau);
            changerSelection(ids, cumul || ajouterRef.current ? 'ajouter' : 'remplacer');
          },
        });
        setPret(true);
      });

      m.on('click', (e: MapMouseEvent) => {
        const o = outilRef.current;
        if (o === 'contour') {
          setContourPoints((pts) => [...pts, [e.lngLat.lng, e.lngLat.lat]]);
          return;
        }
        if (o !== 'clic') return;
        const couches = ['reseau-zones-trait', 'reseau-sans-trait'].filter((c) => m.getLayer(c));
        const f = m.queryRenderedFeatures([[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]], { layers: couches })[0];
        const cumul = e.originalEvent.shiftKey || ajouterRef.current;
        if (!f?.properties?.id) {
          if (!cumul) changerSelection([], 'remplacer');
          return;
        }
        changerSelection([String(f.properties.id)], cumul ? 'basculer' : 'remplacer');
      });
      for (const couche of ['reseau-zones-trait', 'reseau-sans-trait']) {
        m.on('mouseenter', couche, () => { if (outilRef.current === 'clic') m.getCanvas().style.cursor = 'pointer'; });
        m.on('mouseleave', couche, () => { if (outilRef.current === 'clic') m.getCanvas().style.cursor = ''; });
      }
    })();
    return () => {
      annule = true;
      instance?.remove();
      carte.current = null;
    };
    // La carte est créée une fois ; la palette est stable pour un marché.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Données : tronçons, contours des secteurs (avec la couleur de la palette).
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m || !collection) return;
    // L'état « selection » posé par setFeatureState survit à setData : on l'efface, l'effet suivant repose la sélection.
    m.removeFeatureState({ source: SOURCE_RESEAU });
    (m.getSource(SOURCE_RESEAU) as GeoJSONSource | undefined)?.setData(collection);
    selectionPosee.current = new Set();
    // Cadrage au premier chargement seulement : après une affectation, la vue de travail reste en place.
    if (cadre.current) return;
    const bornes = bornesPositions(sommetsTroncons(collection.features));
    if (bornes) {
      cadre.current = true;
      m.fitBounds(bornes, { padding: 40, duration: 0 });
    }
  }, [pret, collection]);
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    const fc = contours(secteurs.filter((s) => geometrieValide(s.geom)).map((s) => ({ id: s.id, code: s.code, libelle: s.libelle, geom: s.geom })));
    for (const f of fc.features) (f.properties as Record<string, unknown>).couleur = palette.secteurs.get(String(f.properties?.id)) ?? COULEUR_CONTOURS;
    (m.getSource('secteurs') as GeoJSONSource | undefined)?.setData(fc);
  }, [pret, secteurs, palette]);

  // Sélection → feature-state (différences seulement).
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m || !m.getSource(SOURCE_RESEAU)) return;
    for (const id of selectionPosee.current) if (!selection.has(id)) m.setFeatureState({ source: SOURCE_RESEAU, id }, { selection: false });
    for (const id of selection) if (!selectionPosee.current.has(id)) m.setFeatureState({ source: SOURCE_RESEAU, id }, { selection: true });
    selectionPosee.current = new Set(selection);
  }, [pret, selection, collection]);

  // Contour à la main : aperçu (points puis polygone).
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    const source = m.getSource('apercu') as GeoJSONSource | undefined;
    if (!source) return;
    if (outil !== 'contour' || contourPoints.length === 0) {
      if (outil !== 'contour') source.setData(vide());
      return;
    }
    const anneau = lassoEnAnneau(contourPoints);
    source.setData({
      type: 'FeatureCollection',
      features: [
        ...contourPoints.map((p) => ({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: p } })),
        anneau
          ? { type: 'Feature' as const, properties: {}, geometry: anneauEnPolygone(anneau) }
          : { type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: contourPoints } },
      ],
    });
  }, [pret, outil, contourPoints]);
  useEffect(() => {
    const m = carte.current;
    if (!pret || !m) return;
    m.getCanvas().style.cursor = outil === 'clic' ? '' : 'crosshair';
    if (outil !== 'contour') setContourPoints([]);
  }, [pret, outil]);
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContourPoints([]);
    };
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, []);

  const longueurs = useMemo(() => {
    const l = new Map<string, number>();
    for (const [id, t] of index.current) l.set(id, t.longueur);
    return l;
  }, [collection]);
  const lineaire = lineaireSelection(selection, longueurs);
  const repartition = useMemo(() => {
    const r = new Map<string, number>();
    for (const id of selection) {
      const s = index.current.get(id)?.secteur ?? '';
      r.set(s, (r.get(s) ?? 0) + 1);
    }
    return [...r.entries()].sort((a, b) => b[1] - a[1]);
  }, [selection]);
  const nbSans = collection ? collection.features.filter((f) => !f.properties.s).length : 0;

  async function agir(libelle: string, action: () => Promise<string>) {
    setOccupe(true);
    setMessage(`${libelle}…`);
    setErreur('');
    try {
      const texte = await action();
      await Promise.all([chargerReseau(), recharger()]);
      setMessage(texte);
    } catch (e) {
      setMessage('');
      setErreur(messageReseau(e));
    }
    setOccupe(false);
  }

  const ids = [...selection];
  const affecter = () => agir('Affectation', async () => {
    const n = await affecterTronconsSecteur(secteurCible, ids);
    setSelection(new Set());
    return `${nombre(n, 0)} tronçon(s) affecté(s) au secteur ${nomSecteur.get(secteurCible) ?? ''} ; contours recalculés.`;
  });
  const retirer = () => agir('Retrait', async () => {
    const n = await affecterTronconsSecteur(null, ids);
    setSelection(new Set());
    return `${nombre(n, 0)} tronçon(s) retiré(s) de leur secteur (non zonés).`;
  });
  const recalculer = () => agir('Recalcul du contour', async () => {
    await recalculerContourSecteur(secteurCible);
    return `Contour du secteur ${nomSecteur.get(secteurCible) ?? ''} recalculé d'après ses tronçons.`;
  });
  const terminerContour = () => agir('Enregistrement du contour', async () => {
    const anneau = lassoEnAnneau(contourPoints);
    if (!anneau) throw new Error('Au moins trois points sont nécessaires.');
    await definirContourSecteur(secteurCible, anneauEnPolygone(anneau));
    setContourPoints([]);
    setOutil('clic');
    return `Contour du secteur ${nomSecteur.get(secteurCible) ?? ''} enregistré (les tronçons ne sont pas réaffectés).`;
  });
  const voirSecteur = (id: string) => {
    const m = carte.current;
    if (!m) return;
    const s = secteurs.find((x) => x.id === id);
    const troncons = [...index.current.values()].filter((t) => t.secteur === id).map((t) => t.feature);
    const bornes = bornesPositions(sommetsTroncons(troncons)) ?? (s && geometrieValide(s.geom) ? bornesPositions(sommets(s.geom)) : null);
    if (bornes) m.fitBounds(bornes, { padding: 40, duration: 500 });
  };
  const selectionnerSecteur = (id: string | null) => {
    const liste = [...index.current.values()].filter((t) => (id ? t.secteur === id : !t.secteur)).map((t) => t.id);
    changerSelection(liste, ajouter ? 'ajouter' : 'remplacer');
  };

  return (
    <div className={styles['plein-ecran']} role="dialog" aria-label="Carte de zonage du réseau">
      <aside className={styles.lateral}>
        <div className="barre">
          <h2>Zonage du réseau</h2>
          <button onClick={fermer} disabled={occupe}>Fermer</button>
        </div>
        <p className={styles.aide}>
          {collection ? `${nombre(collection.features.length, 0)} tronçons${nbSans ? `, ${nombre(nbSans, 0)} non zonés (gris pointillé)` : ''}.` : 'Chargement du réseau…'}
          {' '}Clic : un tronçon ; Maj+clic : ajoute ; Maj+glisser : rectangle ; outil Lasso : dessinez au doigt ou à la souris.
        </p>

        <div className={styles.groupe}>
          <h3>Outil</h3>
          <div className={styles.modes} role="radiogroup" aria-label="Outil de sélection">
            {OUTILS.map(([o, texte]) => (
              <button key={o} type="button" role="radio" aria-checked={outil === o} aria-pressed={outil === o} onClick={() => setOutil(o)} disabled={occupe}>
                {texte}
              </button>
            ))}
          </div>
          {outil !== 'contour' && (
            <label className="ligne">
              <input type="checkbox" checked={ajouter} onChange={(e) => setAjouter(e.target.checked)} />
              Ajouter à la sélection (comme Maj)
            </label>
          )}
          {outil === 'contour' && (
            <>
              <p className={styles.aide}>Cliquez les sommets du contour du secteur cible ({contourPoints.length} point{contourPoints.length > 1 ? 's' : ''}) ; Échap efface.</p>
              <div className="actions">
                <button className="primaire" disabled={occupe || contourPoints.length < 3 || !secteurCible} onClick={terminerContour}>Terminer le contour</button>
                <button type="button" disabled={occupe || contourPoints.length === 0} onClick={() => setContourPoints([])}>Effacer le tracé</button>
              </div>
            </>
          )}
        </div>

        <div className={styles.groupe}>
          <h3>Sélection</h3>
          <p className={styles.selection}>
            <strong>{nombre(selection.size, 0)}</strong> tronçon{selection.size > 1 ? 's' : ''} · <strong>{formaterLineaire(lineaire)}</strong>
          </p>
          {repartition.length > 0 && (
            <p className={styles.aide}>
              {repartition.map(([s, n]) => `${nombre(n, 0)} ${s ? nomSecteur.get(s) ?? 'secteur inconnu' : 'non zoné(s)'}`).join(' · ')}
            </p>
          )}
          <div className="actions">
            <button type="button" disabled={occupe || selection.size === 0} onClick={() => setSelection(new Set())}>Vider</button>
            <button type="button" disabled={occupe || nbSans === 0} onClick={() => selectionnerSecteur(null)}>Tous les non zonés</button>
          </div>
        </div>

        <div className={styles.groupe}>
          <h3>Secteur cible</h3>
          <label>
            Secteur
            <select value={secteurCible} onChange={(e) => setSecteurCible(e.target.value)} disabled={occupe}>
              {secteursParZone.map(({ zone, secteurs: liste }) => (
                <optgroup key={zone.id} label={`Zone ${zone.numero} · ${zone.libelle}`}>
                  {liste.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.libelle}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="actions">
            <button type="button" className="petit" disabled={!secteurCible} onClick={() => voirSecteur(secteurCible)}>Voir</button>
            <button type="button" className="petit" disabled={!secteurCible || occupe} onClick={() => selectionnerSecteur(secteurCible)}>Sélectionner ses tronçons</button>
          </div>
          <div className={styles['actions-verticales']}>
            <button className="primaire" disabled={occupe || selection.size === 0 || !secteurCible} onClick={affecter}>
              Affecter au secteur {secteurCible ? (secteurs.find((s) => s.id === secteurCible)?.code ?? '') : '…'}
            </button>
            <button disabled={occupe || selection.size === 0} onClick={retirer}>Retirer du secteur</button>
            <button disabled={occupe || !secteurCible} onClick={recalculer}>Recalculer le contour</button>
            <button disabled={occupe || !secteurCible} aria-pressed={outil === 'contour'} onClick={() => setOutil(outil === 'contour' ? 'clic' : 'contour')}>
              Dessiner le contour à la main
            </button>
          </div>
        </div>

        {erreur && <p className="erreur">{erreur}</p>}
        {message && <p className="info" role="status">{message}</p>}
      </aside>

      <div className={styles.carte}>
        <div ref={conteneur} className={styles.toile} aria-label="Carte de zonage" />
        {(!pret || chargement) && !erreur && <p className={styles.message}>{!pret ? 'Chargement de la carte…' : 'Chargement du réseau…'}</p>}
        {fondIndisponible && pret && <p className={`${styles.message} ${styles.attention}`}>Fond de carte indisponible (réseau) : tronçons affichés sur fond uni.</p>}
        {erreur && pret && <p className={`${styles.message} ${styles.attention}`}>{erreur}</p>}
      </div>
    </div>
  );
}

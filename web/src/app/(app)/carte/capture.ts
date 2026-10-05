// Image de la carte pour l'impression : une seconde carte MapLibre, hors écran, aux proportions exactes
// du cadre du PDF, rendue à ~200 dpi par le pixelRatio. Même fond, mêmes couches, même vue qu'à l'écran ;
// capture après l'événement « idle » (tuiles et données chargées), toile gardée par preserveDrawingBuffer.
import type { Map as CarteMapLibre, StyleSpecification } from 'maplibre-gl';
import type { ImageCarte } from '@/lib/export/carte-pdf';
import { MODULE_MAPLIBRE, type Contour, type FuiteCarte } from './commun';
import { ajouterCouches, contours, pointsFuites } from './couches';

export interface EtatCarte {
  style: string | StyleSpecification;
  avecTextes: boolean;
  fondIndisponible: boolean;
  bornes: [[number, number], [number, number]];
  centre: [number, number];
  zoom: number;
  largeurPx: number;
  hauteurPx: number;
}

// 1 px CSS = 1/96 de pouce : textes et points imprimés à leur taille d'écran.
const PX_PAR_MM = 96 / 25.4;
// Pour garder le zoom de l'écran, on accepte jusqu'à 1,3 px par mm de plus (textes à 77 % au plus petit).
const DENSITE_MAX = 1.3;
const PX_IMAGE_PAR_MM = 200 / 25.4;
const DELAI_CHARGEMENT_MS = 20000;
const DELAI_TUILES_MS = 30000;
const QUALITE_JPEG = 0.92;

const attendre = (m: CarteMapLibre, evenement: 'load' | 'idle', ms: number) =>
  new Promise<boolean>((ok) => {
    const minuterie = setTimeout(() => ok(false), ms);
    m.once(evenement, () => {
      clearTimeout(minuterie);
      ok(true);
    });
  });

export async function capturerCarte(
  etat: EtatCarte,
  donnees: { fuites: FuiteCarte[]; zones: Contour[]; secteurs: Contour[] },
  largeurMm: number,
  hauteurMm: number,
): Promise<ImageCarte> {
  const ml = (await import(/* webpackIgnore: true */ MODULE_MAPLIBRE)) as typeof import('maplibre-gl');
  // Les noms de quartiers et de rues dépendent du niveau de zoom (ils n'existent que dans certaines tuiles) :
  // si toute la vue de l'écran tient dans le cadre, même centre et même zoom qu'à l'écran ; sinon on
  // recadre sur la vue affichée, à un zoom plus faible.
  const besoin = Math.max(etat.largeurPx / largeurMm, etat.hauteurPx / hauteurMm);
  const pxParMm = Math.min(Math.max(PX_PAR_MM, besoin), PX_PAR_MM * DENSITE_MAX);
  const memeZoom = besoin <= pxParMm;
  const largeur = Math.round(largeurMm * pxParMm);
  const hauteur = Math.round(hauteurMm * pxParMm);
  // Hors de l'écran mais affiché : MapLibre a besoin d'un conteneur mesurable.
  const boite = document.createElement('div');
  boite.setAttribute('aria-hidden', 'true');
  boite.style.cssText = `position:fixed;top:0;left:${-largeur - 2000}px;width:${largeur}px;height:${hauteur}px;pointer-events:none;`;
  document.body.append(boite);
  let m: CarteMapLibre | null = null;
  try {
    try {
      m = new ml.Map({
        container: boite,
        style: typeof etat.style === 'string' ? etat.style : structuredClone(etat.style),
        ...(memeZoom ? { center: etat.centre, zoom: etat.zoom } : { bounds: etat.bornes, fitBoundsOptions: { padding: 0 } }),
        pixelRatio: PX_IMAGE_PAR_MM / pxParMm,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
        interactive: false,
        attributionControl: false,
        fadeDuration: 0,
        maxZoom: 19,
      });
    } catch {
      throw new Error('Ce navigateur ne peut pas préparer la carte à imprimer (WebGL indisponible).');
    }
    if (!(await attendre(m, 'load', DELAI_CHARGEMENT_MS))) {
      throw new Error('La carte à imprimer ne s\'est pas chargée (réseau ?). Réessayez.');
    }
    ajouterCouches(m, { avecTextes: etat.avecTextes, impression: true });
    const source = (id: string) => m!.getSource(id) as import('maplibre-gl').GeoJSONSource;
    source('fuites').setData(pointsFuites(donnees.fuites));
    source('zones').setData(contours(donnees.zones));
    source('secteurs').setData(contours(donnees.secteurs));
    const complet = await attendre(m, 'idle', DELAI_TUILES_MS);

    const b = m.getBounds();
    const toile = m.getCanvas();
    const blob = await new Promise<Blob | null>((ok) => toile.toBlob(ok, 'image/jpeg', QUALITE_JPEG));
    if (!blob) throw new Error('La capture de la carte a échoué.');
    return {
      donnees: new Uint8Array(await blob.arrayBuffer()),
      type: 'JPEG',
      largeurPx: toile.width,
      hauteurPx: toile.height,
      ouest: b.getWest(),
      est: b.getEast(),
      sud: b.getSouth(),
      nord: b.getNorth(),
      fondIndisponible: etat.fondIndisponible,
      fondIncomplet: !complet && !etat.fondIndisponible,
      numeros: etat.avecTextes,
    };
  } finally {
    m?.remove();
    boite.remove();
  }
}

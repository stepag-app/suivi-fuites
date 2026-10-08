// Image de la carte pour l'impression : une seconde carte MapLibre, hors écran, aux proportions exactes
// du cadre du PDF, rendue à ~200 dpi par le pixelRatio. Même fond, mêmes couches ; vue de l'écran ou cadrage
// sur les fuites et le réseau affichés (EtatCarte.cadrage) ;
// capture après l'événement « idle » (tuiles et données chargées), toile gardée par preserveDrawingBuffer.
import type { Map as CarteMapLibre, StyleSpecification } from 'maplibre-gl';
import type { ImageCarte } from '@/lib/export/carte-pdf';
import type { PaletteReseau } from '@/lib/reseau/palette';
import type { Coloration, EtatFeature } from '@/lib/reseau/types';
import { MODULE_MAPLIBRE, type Contour, type FuiteCarte } from './commun';
import { ajouterCouches, contours, pointsFuites } from './couches';
import { creerGestionReseau, type SecteurAffiche } from './reseau-carte';

/** Réseau tel qu'il est affiché à l'écran, repris sur la carte imprimée. */
export interface ReseauImpression {
  secteurs: SecteurAffiche[];
  coloration: Coloration;
  palette: PaletteReseau;
  etats: Map<string, EtatFeature>;
}

export interface EtatCarte {
  style: string | StyleSpecification;
  avecTextes: boolean;
  fondIndisponible: boolean;
  bornes: [[number, number], [number, number]];
  centre: [number, number];
  zoom: number;
  largeurPx: number;
  hauteurPx: number;
  /** Cadrage sur le contenu (fuites et réseau affichés) : ces bornes remplacent la vue de l'écran. */
  cadrage?: [[number, number], [number, number]] | null;
}

// Marge autour du contenu cadré, en part de la plus petite dimension de l'image.
const MARGE_CADRAGE = 0.04;

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
  donnees: { fuites: FuiteCarte[]; zones: Contour[]; secteurs: Contour[]; reseau?: ReseauImpression | null },
  largeurMm: number,
  hauteurMm: number,
): Promise<ImageCarte> {
  const ml = (await import(/* webpackIgnore: true */ MODULE_MAPLIBRE)) as typeof import('maplibre-gl');
  // Les noms de quartiers et de rues dépendent du niveau de zoom (ils n'existent que dans certaines tuiles) :
  // si toute la vue de l'écran tient dans le cadre, même centre et même zoom qu'à l'écran ; sinon on
  // recadre sur la vue affichée, à un zoom plus faible.
  // Cadrage sur le contenu : textes à leur taille d'écran, bornes ajustées au cadre avec une marge.
  const besoin = etat.cadrage ? PX_PAR_MM : Math.max(etat.largeurPx / largeurMm, etat.hauteurPx / hauteurMm);
  const pxParMm = Math.min(Math.max(PX_PAR_MM, besoin), PX_PAR_MM * DENSITE_MAX);
  const memeZoom = !etat.cadrage && besoin <= pxParMm;
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
        ...(memeZoom ? { center: etat.centre, zoom: etat.zoom } : {
          bounds: etat.cadrage ?? etat.bornes,
          fitBoundsOptions: { padding: etat.cadrage ? Math.round(Math.min(largeur, hauteur) * MARGE_CADRAGE) : 0, maxZoom: 18 },
        }),
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
    // Réseau d'eau : mêmes secteurs, même coloration et même état de balayage qu'à l'écran.
    if (donnees.reseau && donnees.reseau.secteurs.some((s) => s.data)) {
      const g = creerGestionReseau(m, true);
      g.synchroniser(donnees.reseau.secteurs, donnees.reseau.coloration, donnees.reseau.palette);
      g.appliquerEtats(donnees.reseau.etats);
    }
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

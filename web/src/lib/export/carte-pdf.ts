// Carte des fuites en PDF (A4 ou A3, portrait ou paysage) : en-tête du marché (dessinerEntete),
// image de la carte capturée par l'appelant à la taille exacte du cadre, graduations en degrés,
// cartouche (légende, échelle et nord, coordonnées, informations et sources), liste facultative des
// fuites, pied « Page n / N ». Chargé à la demande comme les autres exports. Rien ici ne dépend du
// navigateur ni de Supabase : scripts/verifier-carte-pdf.mjs le fait tourner sous Node.
import type { ImageTexte } from './arabe';
import { texteDate, texteNombre, type EnteteDoc } from './modele';
import { BLEU, FOND_GROUPE, GRIS_TRAIT, dessinerEntete } from './pdf';

type Pdf = InstanceType<typeof import('jspdf').jsPDF>;
type AutoTable = typeof import('jspdf-autotable').default;
type Rgb = [number, number, number];

export type FormatPapier = 'a4' | 'a3';
export type OrientationPapier = 'portrait' | 'paysage';

export interface Bornes { ouest: number; est: number; sud: number; nord: number }

export interface ImageCarte extends Bornes {
  donnees: Uint8Array;
  type: 'JPEG' | 'PNG';
  largeurPx: number;
  hauteurPx: number;
  fondIndisponible: boolean;
  fondIncomplet?: boolean;   // tuiles encore attendues au bout du délai
  numeros?: boolean;         // numéros des fuites écrits à côté des points
}

export interface EntreeLegende { libelle: string; fond: string; contour: string; nombre: number }

export interface FuiteListe {
  numero: number;
  reference: string | null;
  statut: string;
  couleur: { fond: string; contour: string };
  secteur: string | null;
  adresse: string | null;
  latitude: number | null;
  longitude: number | null;
  detectee: string;
}

export interface DonneesCartePdf {
  format: FormatPapier;
  orientation: OrientationPapier;
  entete: EnteteDoc;
  imagesEntete?: Map<string, ImageTexte>;
  imagesCellules?: Map<string, ImageTexte>;
  filtres: string;
  legende: EntreeLegende[];
  alertes: { nombre: number; couleur: string };
  contours: { zones: boolean; secteurs: boolean; couleur: string };
  nombreSurCarte: number;
  sansPosition: number;
  liste: FuiteListe[] | null;
  libelleReference: string;
  genereLe: Date;
  /** Rubriques cochées (rubriques.ts : légende, échelle, coordonnées, informations, graduations) ; absent : tout. */
  rubriques?: Set<string>;
  capturer: (largeurMm: number, hauteurMm: number) => Promise<ImageCarte>;
}

// Gabarit générique (point ouvert 12 : le modèle de la SRM n'est pas connu). Tout se règle ici, en mm.
export const GABARIT = {
  marge: 12,
  pied: 10,                       // bas de page réservé au pied
  ecartEntete: 5,                 // sous l'en-tête : place des graduations du haut
  ecartCartouche: 3,
  colonneCartouche: 62,           // paysage : cartouche en colonne à droite de la carte
  bandeCartouche: 40,             // portrait : cartouche en bande sous la carte
  partsBande: [0.3, 0.23, 0.27, 0.2], // portrait : Légende, Échelle, Coordonnées, Informations
  partsBandeSansLegende: [0.32, 0.38, 0.3], // portrait, légende trop longue : elle passe en bande au-dessus
  colonneLegendeMin: 58,          // portrait, légende en bande : largeur minimale d'une colonne
  ecartBoites: 2.5,
  barreEchelleMax: 45,
  ecartGraduations: 24,           // distance minimale entre deux graduations
  hauteurMinCarte: 60,
  taille: 7,                      // points
  interligne: 3.4,
};

const TEXTE: Rgb = [20, 35, 46];
const DISCRET: Rgb = [91, 107, 119];
const BLANC: Rgb = [255, 255, 255];

interface Rect { x: number; y: number; l: number; h: number }

// ---------------------------------------------------------------------------
// Géométrie (Web Mercator, sphère de MapLibre)
// ---------------------------------------------------------------------------
const RAYON_TERRE = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
const yMercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
const latMercator = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI;

export const centreImage = (b: Bornes) => ({
  latitude: latMercator((yMercator(b.nord) + yMercator(b.sud)) / 2),
  longitude: (b.ouest + b.est) / 2,
});

// Mètres sur le terrain pour 1 mm de papier, à la latitude du centre.
export const metresParMm = (b: Bornes, largeurMm: number) =>
  (rad(b.est - b.ouest) * RAYON_TERRE * Math.cos(rad(centreImage(b).latitude))) / largeurMm;

// Barre d'échelle : 2 à 5 segments d'une longueur ronde (1, 2 ou 5 × 10ⁿ m), la plus longue
// possible sans dépasser maxMm sur le papier.
export function barreEchelle(mParMm: number, maxMm: number): { metres: number; mm: number; segments: number } {
  const max = mParMm * maxMm;
  const puissance = 10 ** Math.floor(Math.log10(max));
  let meilleur = { metres: 0, segments: 2 };
  for (const p of [puissance / 100, puissance / 10, puissance]) {
    for (const k of [1, 2, 5]) {
      for (let n = 2; n <= 5; n++) {
        if (k * p * n <= max && k * p * n > meilleur.metres) meilleur = { metres: k * p * n, segments: n };
      }
    }
  }
  return { ...meilleur, mm: meilleur.metres / mParMm };
}

// Échelle numérique arrondie à trois chiffres (12 345 → 12 300).
export const echelleNumerique = (mParMm: number) => {
  const n = mParMm * 1000;
  const pas = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 2);
  return Math.round(n / pas) * pas;
};

const PAS_DEGRES = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];

// Graduations rondes (en degrés) entre deux valeurs, au plus nombreMax.
export function graduations(min: number, max: number, nombreMax: number): { valeurs: number[]; decimales: number } {
  const pas = PAS_DEGRES.find((p) => (max - min) / p <= Math.max(1, nombreMax)) ?? 10;
  const decimales = Math.max(0, -Math.floor(Math.log10(pas) + 1e-9));
  const valeurs: number[] = [];
  for (let k = Math.ceil(min / pas - 1e-9); k * pas <= max + 1e-9; k++) valeurs.push(Number((k * pas).toFixed(decimales)));
  return { valeurs, decimales };
}

const coord = (lat: number, lon: number, decimales = 5) => `${lat.toFixed(decimales)}, ${lon.toFixed(decimales)}`;
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
// Couleur posée sur du blanc avec une opacité (jsPDF : remplissages opaques plus simples à imprimer).
const surBlanc = (c: Rgb, opacite: number): Rgb => c.map((v) => Math.round(v * opacite + 255 * (1 - opacite))) as Rgb;

function police(pdf: Pdf, gras = false, taille = GABARIT.taille, couleur: Rgb = TEXTE) {
  pdf.setFont('helvetica', gras ? 'bold' : 'normal');
  pdf.setFontSize(taille);
  pdf.setTextColor(...couleur);
}

// ---------------------------------------------------------------------------
// Carte : graduations, cadre, attribution, bandeau du fond
// ---------------------------------------------------------------------------
function graduer(pdf: Pdf, c: Rect, b: Bornes) {
  pdf.setDrawColor(...TEXTE);
  pdf.setLineWidth(0.2);
  police(pdf, false, 6);
  const lon = graduations(b.ouest, b.est, Math.floor(c.l / GABARIT.ecartGraduations));
  for (const v of lon.valeurs) {
    const x = c.x + ((v - b.ouest) / (b.est - b.ouest)) * c.l;
    if (x < c.x + 4 || x > c.x + c.l - 4) continue;
    pdf.line(x, c.y, x, c.y + 2);
    pdf.line(x, c.y + c.h, x, c.y + c.h - 2);
    pdf.text(`${v.toFixed(lon.decimales)}°`, x, c.y - 1.2, { align: 'center' });
  }
  const yNord = yMercator(b.nord);
  const ySud = yMercator(b.sud);
  const lat = graduations(b.sud, b.nord, Math.floor(c.h / GABARIT.ecartGraduations));
  for (const v of lat.valeurs) {
    const y = c.y + ((yNord - yMercator(v)) / (yNord - ySud)) * c.h;
    if (y < c.y + 4 || y > c.y + c.h - 4) continue;
    pdf.line(c.x, y, c.x + 2, y);
    pdf.line(c.x + c.l, y, c.x + c.l - 2, y);
    const t = `${v.toFixed(lat.decimales)}°`;
    pdf.text(t, c.x - 1.2, y + pdf.getTextWidth(t) / 2, { angle: 90 });
  }
}

function habillerCarte(pdf: Pdf, GState: typeof import('jspdf').GState, c: Rect, image: ImageCarte) {
  pdf.setDrawColor(...TEXTE);
  pdf.setLineWidth(0.35);
  pdf.rect(c.x, c.y, c.l, c.h);

  const attribution = `© contributeurs OpenStreetMap${image.fondIndisponible ? '' : ' · © OpenMapTiles · OpenFreeMap'}`;
  police(pdf, false, 6);
  const l = pdf.getTextWidth(attribution) + 2.4;
  pdf.saveGraphicsState();
  pdf.setGState(new GState({ opacity: 0.85 }));
  pdf.setFillColor(...BLANC);
  pdf.rect(c.x + c.l - l - 0.2, c.y + c.h - 3.6, l, 3.4, 'F');
  pdf.restoreGraphicsState();
  pdf.text(attribution, c.x + c.l - 1.4, c.y + c.h - 1.2, { align: 'right' });

  const alerte = image.fondIndisponible
    ? 'Fond de carte indisponible (réseau) : fuites imprimées sur fond uni, sans le plan des rues.'
    : image.fondIncomplet ? 'Fond de carte incomplet : certaines tuiles n\'ont pas répondu à temps.' : null;
  if (alerte) {
    police(pdf, true, 7.5, [122, 62, 0]);
    const la = pdf.getTextWidth(alerte) + 4;
    pdf.setFillColor(253, 232, 200);
    pdf.rect(c.x + 3, c.y + 3, la, 5.2, 'F');
    pdf.text(alerte, c.x + 5, c.y + 6.6);
  }
}

// ---------------------------------------------------------------------------
// Cartouche
// ---------------------------------------------------------------------------
// Cadre d'une boîte et son titre ; renvoie la ligne de base du premier texte.
function boite(pdf: Pdf, r: Rect, titre: string): number {
  pdf.setFillColor(...FOND_GROUPE);
  pdf.rect(r.x, r.y, r.l, 5, 'F');
  pdf.setDrawColor(...GRIS_TRAIT);
  pdf.setLineWidth(0.2);
  pdf.rect(r.x, r.y, r.l, r.h);
  police(pdf, true, GABARIT.taille + 0.5, BLEU);
  pdf.text(titre, r.x + 2, r.y + 3.5);
  police(pdf);
  return r.y + 5 + 3.6;
}

// Une entrée de légende : un symbole dessiné à gauche de la ligne de base, puis le texte.
type EntreeDessinee = { texte: string; symbole: (x: number, y: number) => void; gras?: boolean };

function entreesLegende(pdf: Pdf, d: DonneesCartePdf, numeros: boolean): EntreeDessinee[] {
  const e: EntreeDessinee[] = d.legende.map((l) => ({
    texte: `${l.libelle} (${l.nombre})`,
    symbole: (x, y) => {
      pdf.setLineWidth(0.35);
      pdf.setFillColor(...rgb(l.fond));
      pdf.setDrawColor(...rgb(l.contour));
      pdf.circle(x + 2.2, y - 1.1, 1.25, 'FD');
    },
  }));
  e.push({
    texte: `En alerte : halo rouge (${d.alertes.nombre})`,
    symbole: (x, y) => {
      pdf.setLineWidth(0.35);
      pdf.setFillColor(...surBlanc(rgb(d.alertes.couleur), 0.25));
      pdf.setDrawColor(...rgb(d.alertes.couleur));
      pdf.circle(x + 2.2, y - 1.1, 1.8, 'FD');
    },
  });
  if (d.contours.zones) {
    e.push({ texte: 'Contour de zone', symbole: (x, y) => {
      pdf.setDrawColor(...rgb(d.contours.couleur));
      pdf.setLineWidth(0.6);
      pdf.line(x, y - 1.1, x + 4.4, y - 1.1);
    } });
  }
  if (d.contours.secteurs) {
    e.push({ texte: 'Contour de secteur', symbole: (x, y) => {
      pdf.setDrawColor(...rgb(d.contours.couleur));
      pdf.setLineWidth(0.35);
      pdf.setLineDashPattern([0.9, 0.6], 0);
      pdf.line(x, y - 1.1, x + 4.4, y - 1.1);
      pdf.setLineDashPattern([], 0);
    } });
  }
  if (numeros) {
    e.push({ texte: 'N° de la fuite, à côté du point', symbole: (x, y) => {
      police(pdf, true);
      pdf.text('12', x + 0.4, y);
      police(pdf);
    } });
  }
  return e;
}

/** Nombre de lignes de légende qui tiennent dans une boîte de hauteur h (titre compris). */
export const capaciteLegende = (h: number) => Math.max(1, Math.floor((h - 5 - 3.6 - 1.4) / GABARIT.interligne) + 1);
/** Hauteur d'une boîte de légende de n lignes. */
export const hauteurLegende = (n: number) => 5 + 3.6 + (n - 1) * GABARIT.interligne + 2;

// Texte coupé à la largeur disponible (points de suspension), jamais hors de sa colonne.
function ajuster(pdf: Pdf, t: string, l: number): string {
  if (pdf.getTextWidth(t) <= l) return t;
  let c = t;
  while (c.length > 1 && pdf.getTextWidth(`${c}…`) > l) c = c.slice(0, -1);
  return `${c.trimEnd()}…`;
}

function legende(pdf: Pdf, r: Rect, entrees: EntreeDessinee[], colonnes = 1) {
  const y0 = boite(pdf, r, 'Légende');
  const parColonne = Math.ceil(entrees.length / colonnes);
  const largeurColonne = (r.l - 2) / colonnes;
  entrees.forEach((e, i) => {
    const x = r.x + 2 + Math.floor(i / parColonne) * largeurColonne;
    const y = y0 + (i % parColonne) * GABARIT.interligne;
    e.symbole(x, y);
    police(pdf);
    pdf.text(ajuster(pdf, e.texte, largeurColonne - 8), x + 6, y);
  });
}

function nord(pdf: Pdf, cx: number, yHaut: number, h: number) {
  police(pdf, true, 8);
  pdf.text('N', cx, yHaut + 2.6, { align: 'center' });
  const pointe = yHaut + 3.6;
  const base = yHaut + h;
  const creux = base - h * 0.2;
  const demi = h * 0.22;
  pdf.setLineWidth(0.25);
  pdf.setDrawColor(...TEXTE);
  pdf.setFillColor(...TEXTE);
  pdf.triangle(cx, pointe, cx - demi, base, cx, creux, 'FD');
  pdf.setFillColor(...BLANC);
  pdf.triangle(cx, pointe, cx + demi, base, cx, creux, 'FD');
  police(pdf);
}

function echelle(pdf: Pdf, r: Rect, image: ImageCarte, largeurCarteMm: number) {
  const y = boite(pdf, r, 'Échelle et nord');
  const mParMm = metresParMm(image, largeurCarteMm);
  const placeNord = 12;
  const barre = barreEchelle(mParMm, Math.min(GABARIT.barreEchelleMax, r.l - 6 - placeNord));
  const x = r.x + 3;
  const yb = y - 0.5;
  const segment = barre.mm / barre.segments;
  // Graduations : 0, chaque segment s'il y a la place, unité seulement au bout.
  const km = barre.metres >= 1000;
  const valeur = (m: number) => texteNombre(km ? m / 1000 : m, km && (m % 1000) ? 1 : 0);
  pdf.setLineWidth(0.2);
  pdf.setDrawColor(...TEXTE);
  police(pdf, false, 6);
  for (let i = 0; i <= barre.segments; i++) {
    if (i < barre.segments) {
      pdf.setFillColor(...(i % 2 ? BLANC : TEXTE));
      pdf.rect(x + i * segment, yb, segment, 1.6, 'FD');
    }
    const fin = i === barre.segments;
    if (i === 0 || fin || segment >= 7) {
      pdf.text(fin ? `${valeur(barre.metres)} ${km ? 'km' : 'm'}` : valeur((i * barre.metres) / barre.segments), x + i * segment, yb + 4.3, { align: 'center' });
    }
  }
  police(pdf, true);
  // Pas de « ≈ » : absent des polices standard du PDF (WinAnsi).
  pdf.text(`Échelle 1 : ${texteNombre(echelleNumerique(mParMm), 0)}`, r.x + 2, yb + 8.6);
  police(pdf, false, 6.3, DISCRET);
  pdf.text(`à la latitude du centre (${texteNombre(centreImage(image).latitude, 2)}°)`, r.x + 2, yb + 11.8);
  nord(pdf, r.x + r.l - placeNord / 2 - 1, r.y + 5.8, 12);
}

function coordonnees(pdf: Pdf, r: Rect, image: ImageCarte) {
  let y = boite(pdf, r, 'Coordonnées GPS (WGS84)');
  const c = centreImage(image);
  const lignes: [string, string][] = [
    ['Centre', coord(c.latitude, c.longitude, 6)],
    ['Nord-ouest', coord(image.nord, image.ouest)],
    ['Nord-est', coord(image.nord, image.est)],
    ['Sud-ouest', coord(image.sud, image.ouest)],
    ['Sud-est', coord(image.sud, image.est)],
  ];
  for (const [libelle, valeur] of lignes) {
    police(pdf, true);
    pdf.text(libelle, r.x + 2, y);
    police(pdf);
    pdf.text(valeur, r.x + 17, y);
    y += GABARIT.interligne;
  }
  police(pdf, false, 6.3, DISCRET);
  pdf.text('latitude, longitude en degrés décimaux', r.x + 2, y);
  police(pdf);
}

function informations(pdf: Pdf, r: Rect, d: DonneesCartePdf, image: ImageCarte) {
  let y = boite(pdf, r, 'Informations');
  const lignes = [
    `Édité le ${texteDate(d.genereLe, true)}`,
    `${d.nombreSurCarte} fuite${d.nombreSurCarte > 1 ? 's' : ''} sur la carte${d.sansPosition ? `, ${d.sansPosition} sans position GPS` : ''}`,
    image.fondIndisponible
      ? 'Fond de carte indisponible au moment de l\'impression : fuites sur fond uni.'
      : 'Fond de carte : © contributeurs OpenStreetMap, OpenMapTiles, OpenFreeMap.',
  ];
  for (const t of lignes) {
    const morceaux = pdf.splitTextToSize(t, r.l - 4) as string[];
    pdf.text(morceaux, r.x + 2, y);
    y += morceaux.length * GABARIT.interligne;
  }
}

// Lignes de légende prévues avant la capture (numéros des fuites comptés : au pire une ligne vide).
const lignesPrevues = (d: DonneesCartePdf) => d.legende.length + 1 + (d.contours.zones ? 1 : 0) + (d.contours.secteurs ? 1 : 0) + 1;

type Boite = 'legende' | 'echelle' | 'coordonnees' | 'informations';
const BOITES: Boite[] = ['legende', 'echelle', 'coordonnees', 'informations'];
const HAUTEUR_ECHELLE = 22;
const HAUTEUR_COORDONNEES = 5 + 3 + 6 * GABARIT.interligne;
const HAUTEUR_INFORMATIONS_MIN = 22;

/** Rubriques de la carte imprimée (rubriques.ts) ; sans choix : tout. */
const avecRubrique = (d: DonneesCartePdf, r: string) => !d.rubriques || d.rubriques.has(r);

export interface DispositionCarte {
  carte: { l: number; h: number };
  /** Boîtes dans la bande (portrait) ou la colonne (paysage), dans l'ordre. */
  boites: Boite[];
  /** Légende longue : bande pleine largeur sous la carte, sur plusieurs colonnes (carte réduite d'autant). */
  legendeAPart: { colonnes: number; hauteur: number } | null;
}

const legendeEnBande = (lignes: number, largeur: number) => {
  const colonnes = Math.max(2, Math.floor(largeur / GABARIT.colonneLegendeMin));
  return { colonnes, hauteur: hauteurLegende(Math.ceil(lignes / colonnes)) };
};

/**
 * Place la carte et son cartouche dans la page. Portrait : bande de boîtes sous la carte ; la légende y tient
 * sur une colonne, sinon elle passe en bande à part. Paysage : colonne à droite ; si légende, échelle,
 * coordonnées et informations n'y tiennent pas, la légende passe sous la carte. Sans aucune boîte, la carte
 * prend toute la place.
 */
export function disposerCarte(lignes: number, boitesChoisies: readonly string[], paysage: boolean, utile: number, hauteurDispo: number): DispositionCarte {
  const G = GABARIT;
  const choisies = BOITES.filter((b) => boitesChoisies.includes(b));
  const avecLegende = choisies.includes('legende');
  const autres = choisies.filter((b) => b !== 'legende');
  if (paysage) {
    if (!choisies.length) return { carte: { l: utile, h: hauteurDispo }, boites: [], legendeAPart: null };
    const hauteurs: Record<Boite, number> = {
      legende: hauteurLegende(lignes), echelle: HAUTEUR_ECHELLE, coordonnees: HAUTEUR_COORDONNEES, informations: HAUTEUR_INFORMATIONS_MIN,
    };
    const colonne = choisies.reduce((t, b) => t + hauteurs[b], 0) + (choisies.length - 1) * G.ecartBoites;
    const aPart = avecLegende && colonne > hauteurDispo;
    const boites = aPart ? autres : choisies;
    const l = boites.length ? utile - G.colonneCartouche - G.ecartCartouche : utile;
    const legendeAPart = aPart ? legendeEnBande(lignes, l) : null;
    return { carte: { l, h: hauteurDispo - (legendeAPart ? legendeAPart.hauteur + G.ecartCartouche : 0) }, boites, legendeAPart };
  }
  const aPart = avecLegende && lignes > capaciteLegende(G.bandeCartouche);
  const boites = aPart ? autres : choisies;
  const legendeAPart = aPart ? legendeEnBande(lignes, utile) : null;
  const sous = (legendeAPart ? G.ecartCartouche + legendeAPart.hauteur : 0)
    + (boites.length ? (legendeAPart ? G.ecartBoites : G.ecartCartouche) + G.bandeCartouche : 0);
  return { carte: { l: utile, h: hauteurDispo - sous }, boites, legendeAPart };
}

function cartouche(pdf: Pdf, d: DonneesCartePdf, image: ImageCarte, c: Rect, paysage: boolean, disp: DispositionCarte) {
  const G = GABARIT;
  const entrees = entreesLegende(pdf, d, !!image.numeros);
  const rects = new Map<Boite, Rect>();
  let yLegende = c.y + c.h + G.ecartCartouche;
  if (paysage) {
    // Colonne à droite : boîtes empilées, la dernière prend le reste de la hauteur (carte et légende à part comprises).
    const x = c.x + c.l + G.ecartCartouche;
    const l = G.colonneCartouche;
    const bas = disp.legendeAPart ? c.y + c.h + G.ecartCartouche + disp.legendeAPart.hauteur : c.y + c.h;
    const hauteurs: Record<Boite, number> = {
      legende: hauteurLegende(entrees.length), echelle: HAUTEUR_ECHELLE, coordonnees: HAUTEUR_COORDONNEES, informations: HAUTEUR_INFORMATIONS_MIN,
    };
    let y = c.y;
    disp.boites.forEach((b, i) => {
      const derniere = i === disp.boites.length - 1;
      const h = derniere ? Math.max(hauteurs[b], bas - y) : hauteurs[b];
      rects.set(b, { x, y, l, h });
      y += h + G.ecartBoites;
    });
  } else {
    // Bande sous la carte : légende longue d'abord (pleine largeur), puis les boîtes côte à côte.
    let y = c.y + c.h + G.ecartCartouche;
    if (disp.legendeAPart) {
      yLegende = y;
      y += disp.legendeAPart.hauteur + G.ecartBoites;
    }
    const poids: Record<Boite, number> = disp.legendeAPart
      ? { legende: 0, echelle: G.partsBandeSansLegende[0], coordonnees: G.partsBandeSansLegende[1], informations: G.partsBandeSansLegende[2] }
      : { legende: G.partsBande[0], echelle: G.partsBande[1], coordonnees: G.partsBande[2], informations: G.partsBande[3] };
    const somme = disp.boites.reduce((t, b) => t + poids[b], 0);
    const total = c.l - G.ecartBoites * (disp.boites.length - 1);
    let x = c.x;
    for (const b of disp.boites) {
      const r = { x, y, l: (total * poids[b]) / somme, h: G.bandeCartouche };
      rects.set(b, r);
      x += r.l + G.ecartBoites;
    }
  }
  if (disp.legendeAPart) legende(pdf, { x: c.x, y: yLegende, l: c.l, h: disp.legendeAPart.hauteur }, entrees, disp.legendeAPart.colonnes);
  const r = (b: Boite) => rects.get(b);
  if (r('legende')) legende(pdf, r('legende')!, entrees);
  if (r('echelle')) echelle(pdf, r('echelle')!, image, c.l);
  if (r('coordonnees')) coordonnees(pdf, r('coordonnees')!, image);
  if (r('informations')) informations(pdf, r('informations')!, d, image);
}

// ---------------------------------------------------------------------------
// Liste des fuites (pages suivantes)
// ---------------------------------------------------------------------------
function liste(pdf: Pdf, autoTable: AutoTable, d: DonneesCartePdf, fuites: FuiteListe[]) {
  const { marge } = GABARIT;
  const images = d.imagesCellules ?? new Map<string, ImageTexte>();
  pdf.addPage();
  police(pdf, true, 11, BLEU);
  pdf.text(`Fuites affichées (${fuites.length})`, marge, marge + 4);
  police(pdf, false, 7.5, DISCRET);
  const sousTitre = pdf.splitTextToSize(`${d.entete.titre} · ${d.filtres}`, pdf.internal.pageSize.getWidth() - 2 * marge) as string[];
  pdf.text(sousTitre, marge, marge + 8.5);
  autoTable(pdf, {
    startY: marge + 10 + sousTitre.length * 3.2,
    theme: 'grid',
    margin: { left: marge, right: marge, top: marge + 4, bottom: GABARIT.pied + 4 },
    head: [['N°', d.libelleReference, 'Statut', 'Secteur', 'Adresse', 'Latitude', 'Longitude', 'Détectée le']],
    body: fuites.map((f) => [
      String(f.numero), f.reference ?? '', f.statut, f.secteur ?? '', f.adresse ?? '',
      f.latitude == null ? '—' : f.latitude.toFixed(6), f.longitude == null ? '—' : f.longitude.toFixed(6),
      texteDate(new Date(f.detectee), true),
    ]),
    styles: {
      font: 'helvetica', fontSize: 7.5, cellPadding: 1.1, overflow: 'linebreak',
      lineColor: GRIS_TRAIT, lineWidth: 0.1, textColor: TEXTE, valign: 'middle',
    },
    headStyles: { fillColor: BLEU, textColor: 255, fontStyle: 'bold', halign: 'center' },
    columnStyles: {
      0: { halign: 'right', cellWidth: 'wrap' },
      2: { cellPadding: { top: 1.1, right: 1.1, bottom: 1.1, left: 4.4 } },
      5: { halign: 'right', cellWidth: 'wrap' },
      6: { halign: 'right', cellWidth: 'wrap' },
      7: { halign: 'center', cellWidth: 'wrap' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const brut = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text ?? '');
      const img = images.get(brut);
      if (!img) return;
      // Texte arabe : composé par le navigateur et posé en image (voir arabe.ts).
      (data.cell as unknown as { arabe: string }).arabe = brut;
      data.cell.text = [''];
      data.cell.styles.minCellHeight = img.hauteurMm + 1;
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const cell = data.cell;
      const arabe = (cell as unknown as { arabe?: string }).arabe;
      const img = arabe ? images.get(arabe) : undefined;
      if (img) {
        const k = Math.min(1, (cell.width - 2) / img.largeurMm);
        pdf.addImage(img.donnees, 'PNG', cell.x + cell.width - 1 - img.largeurMm * k,
          cell.y + (cell.height - img.hauteurMm * k) / 2, img.largeurMm * k, img.hauteurMm * k, img.alias, 'FAST');
      }
      if (data.column.index === 2) {
        const f = fuites[data.row.index];
        pdf.setLineWidth(0.3);
        pdf.setFillColor(...rgb(f.couleur.fond));
        pdf.setDrawColor(...rgb(f.couleur.contour));
        pdf.circle(cell.x + 2.2, cell.y + cell.height / 2, 1.1, 'FD');
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Génération
// ---------------------------------------------------------------------------
export async function genererCartePdf(d: DonneesCartePdf): Promise<ArrayBuffer> {
  const [{ jsPDF, GState }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const G = GABARIT;
  const paysage = d.orientation === 'paysage';
  const pdf: Pdf = new jsPDF({ unit: 'mm', format: d.format, orientation: paysage ? 'landscape' : 'portrait', compress: true });
  pdf.setProperties({ title: d.entete.titre, subject: 'Carte des fuites', creator: 'Suivi des fuites' });
  const largeur = pdf.internal.pageSize.getWidth();
  const hauteur = pdf.internal.pageSize.getHeight();
  const utile = largeur - 2 * G.marge;

  // En-tête du marché, puis la carte et son cartouche dans la place restante.
  const yCarte = dessinerEntete(pdf, d.entete, d.imagesEntete ?? new Map(), G.marge) + G.ecartEntete;
  const bas = hauteur - G.pied;
  const disp = disposerCarte(lignesPrevues(d), BOITES.filter((b) => avecRubrique(d, b)), paysage, utile, bas - yCarte);
  const c: Rect = { x: G.marge, y: yCarte, ...disp.carte };
  if (c.h < G.hauteurMinCarte) {
    throw new Error('L\'en-tête du marché laisse trop peu de place à la carte sur cette page : choisissez le format A3.');
  }

  const image = await d.capturer(c.l, c.h);
  pdf.addImage(image.donnees, image.type, c.x, c.y, c.l, c.h, 'carte', image.type === 'PNG' ? 'FAST' : 'NONE');
  if (avecRubrique(d, 'graduations')) graduer(pdf, c, image);
  habillerCarte(pdf, GState, c, image);
  cartouche(pdf, d, image, c, paysage, disp);
  if (d.liste?.length) liste(pdf, autoTable, d, d.liste);

  const total = pdf.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    police(pdf, false, 7.5, DISCRET);
    pdf.text(`${d.entete.titre.slice(0, 90)} · édité le ${texteDate(d.genereLe, true)}`, G.marge, hauteur - 6);
    pdf.text(`Page ${p} / ${total}`, largeur - G.marge, hauteur - 6, { align: 'right' });
  }
  return pdf.output('arraybuffer');
}

// Couleurs du réseau : une teinte par zone, des nuances par secteur, des classes de diamètre, les trois
// couleurs du balayage. Tout est déterministe (numéro de zone, ordre et code des secteurs) : la carte à
// l'écran, la légende du panneau et la légende du PDF lisent la même palette. Fonctions pures, vérifiées
// par scripts/verifier-reseau.mjs.
import type { ExpressionSpecification } from 'maplibre-gl';
import type { EntreeLegende } from '@/lib/export/carte-pdf';
import type { Coloration } from './types';

export const COULEUR_NON_ZONE = '#8a97a5';
export const COULEUR_BALAYE = '#256f3a';
export const COULEUR_NON_BALAYE = '#8a97a5';
export const COULEUR_REPASSE = '#0064d9';
export const COULEUR_SELECTION = '#f2a900';
export const COULEUR_NOEUD = '#1d2d3e';
export const COULEUR_DIAMETRE_INCONNU = '#8a97a5';

/** Classes de diamètre du contrat (§ 5) : borne haute incluse, couleurs du clair au foncé puis chaud. */
export const CLASSES_DIAMETRE: { libelle: string; max: number; couleur: string; largeur: number }[] = [
  { libelle: '≤ 63 mm', max: 63, couleur: '#7cb342', largeur: 1.2 },
  { libelle: '75 à 110 mm', max: 110, couleur: '#29a3e0', largeur: 1.7 },
  { libelle: '125 à 200 mm', max: 200, couleur: '#1e5aa8', largeur: 2.3 },
  { libelle: '250 à 400 mm', max: 400, couleur: '#ef6c00', largeur: 3 },
  { libelle: '> 400 mm', max: Infinity, couleur: '#8e24aa', largeur: 4 },
];

/** Indice de la classe de diamètre, -1 si le diamètre est inconnu ou nul. */
export function classeDiametre(d: number | null | undefined): number {
  if (d == null || !Number.isFinite(d) || d <= 0) return -1;
  return CLASSES_DIAMETRE.findIndex((c) => d <= c.max);
}

/** HSL (0-360, 0-100, 0-100) vers « #rrggbb ». */
export function hslVersHex(h: number, s: number, l: number): string {
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lum = Math.min(100, Math.max(0, l)) / 100;
  const teinte = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = c * (1 - Math.abs(((teinte / 60) % 2) - 1));
  const m = lum - c / 2;
  const [r, g, b] = teinte < 60 ? [c, x, 0] : teinte < 120 ? [x, c, 0] : teinte < 180 ? [0, c, x]
    : teinte < 240 ? [0, x, c] : teinte < 300 ? [x, 0, c] : [c, 0, x];
  const hex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** Teinte d'une zone : angle d'or depuis une teinte de base, pour des zones bien séparées quel que soit leur nombre. */
export const teinteZone = (numero: number) => Math.round((200 + (Math.max(1, Math.trunc(numero)) - 1) * 137.508) % 360);

export const couleurZone = (numero: number) => hslVersHex(teinteZone(numero), 62, 40);

/**
 * Nuance d'un secteur : i-ème secteur (sur n) de sa zone. La luminosité monte avec le rang, la teinte
 * oscille légèrement autour de celle de la zone : deux secteurs voisins restent discernables.
 */
export function couleurSecteur(numeroZone: number, rang: number, nombre: number): string {
  const n = Math.max(1, nombre);
  const i = Math.min(Math.max(0, rang), n - 1);
  const pas = n > 1 ? i / (n - 1) : 0.5;
  const decalage = ((i % 3) - 1) * 9;
  return hslVersHex(teinteZone(numeroZone) + decalage, 70 - pas * 22, 30 + pas * 30);
}

export interface PaletteReseau {
  /** secteur_id → couleur */
  secteurs: Map<string, string>;
  /** zone_id → couleur de la zone */
  zones: Map<string, string>;
}

/** Palette de tout le marché, à partir du numéro des zones et de l'ordre (puis du code) des secteurs. */
export function paletteSecteurs(
  zones: { id: string; numero: number }[],
  secteurs: { id: string; zone_id: string; ordre: number; code: string }[],
): PaletteReseau {
  const palette: PaletteReseau = { secteurs: new Map(), zones: new Map() };
  for (const z of zones) {
    palette.zones.set(z.id, couleurZone(z.numero));
    const liste = secteurs
      .filter((s) => s.zone_id === z.id)
      .sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code, 'fr'));
    liste.forEach((s, i) => palette.secteurs.set(s.id, couleurSecteur(z.numero, i, liste.length)));
  }
  return palette;
}

/** Couleur d'un tronçon par secteur (expression MapLibre sur la propriété courte `s`). */
export function expressionCouleurSecteur(palette: PaletteReseau): ExpressionSpecification | string {
  const paires = [...palette.secteurs.entries()].flat();
  if (paires.length === 0) return COULEUR_NON_ZONE;
  return ['match', ['coalesce', ['get', 's'], ''], ...paires, COULEUR_NON_ZONE] as unknown as ExpressionSpecification;
}

/** Couleur par état de balayage (feature-state posé par donnees.ts). */
export const expressionCouleurBalayage = (): ExpressionSpecification => [
  'case',
  ['boolean', ['feature-state', 'repasse'], false], COULEUR_REPASSE,
  ['boolean', ['feature-state', 'balaye'], false], COULEUR_BALAYE,
  COULEUR_NON_BALAYE,
];

/** Couleur par classe de diamètre (propriété courte `d`). */
export const expressionCouleurDiametre = (): ExpressionSpecification => [
  'case',
  ['!', ['has', 'd']], COULEUR_DIAMETRE_INCONNU,
  ['==', ['get', 'd'], null], COULEUR_DIAMETRE_INCONNU,
  ['step', ['to-number', ['get', 'd']],
    CLASSES_DIAMETRE[0].couleur,
    ...CLASSES_DIAMETRE.slice(1).flatMap((c, i) => [CLASSES_DIAMETRE[i].max + 0.5, c.couleur])],
];

export function expressionCouleurReseau(coloration: Coloration, palette: PaletteReseau): ExpressionSpecification | string {
  if (coloration === 'balayage') return expressionCouleurBalayage();
  if (coloration === 'diametre') return expressionCouleurDiametre();
  return expressionCouleurSecteur(palette);
}

/** Épaisseur de base selon le diamètre (1,2 à 4 px à l'échelle de la ville), diamètre inconnu : 1,6 px. */
export const expressionLargeurBase = (): ExpressionSpecification => [
  'case',
  ['!', ['has', 'd']], 1.6,
  ['==', ['get', 'd'], null], 1.6,
  ['step', ['to-number', ['get', 'd']],
    CLASSES_DIAMETRE[0].largeur,
    ...CLASSES_DIAMETRE.slice(1).flatMap((c, i) => [CLASSES_DIAMETRE[i].max + 0.5, c.largeur])],
];

/**
 * Épaisseur à l'écran : fine de loin, lisible de près ; le facteur sert à l'impression, `ajout` (px) au halo de
 * sélection. L'arithmétique reste dans les sorties de l'interpolation : MapLibre n'accepte « zoom » qu'en entrée
 * d'un « interpolate » ou « step » de premier niveau.
 */
export const expressionLargeur = (facteur = 1, ajout = 0): ExpressionSpecification => [
  'interpolate', ['linear'], ['zoom'],
  11, ['+', ['*', expressionLargeurBase(), 0.45 * facteur], ajout],
  14, ['+', ['*', expressionLargeurBase(), 0.9 * facteur], ajout],
  17, ['+', ['*', expressionLargeurBase(), 1.8 * facteur], ajout],
];

/**
 * Entrées de légende (panneau et PDF) pour la coloration choisie. Par secteur : une entrée par zone
 * affichée (les nuances se lisent dans l'arbre du panneau) ; par balayage : trois états ; par diamètre : les
 * classes. `nombres` donne le nombre de tronçons par clé (zone_id, état ou indice de classe) s'il est connu.
 */
export function entreesLegendeReseau(
  coloration: Coloration,
  palette: PaletteReseau,
  zones: { id: string; numero: number; libelle: string }[],
  nombres: Map<string, number> = new Map(),
): EntreeLegende[] {
  const n = (cle: string) => nombres.get(cle) ?? 0;
  if (coloration === 'balayage') {
    return [
      { libelle: 'Tronçon balayé', fond: COULEUR_BALAYE, contour: COULEUR_BALAYE, nombre: n('balaye') },
      { libelle: 'Repassé (2e passage ou plus)', fond: COULEUR_REPASSE, contour: COULEUR_REPASSE, nombre: n('repasse') },
      { libelle: 'Non balayé', fond: COULEUR_NON_BALAYE, contour: COULEUR_NON_BALAYE, nombre: n('non_balaye') },
    ];
  }
  if (coloration === 'diametre') {
    return [
      ...CLASSES_DIAMETRE.map((c, i) => ({ libelle: `Diamètre ${c.libelle}`, fond: c.couleur, contour: c.couleur, nombre: n(String(i)) })),
      { libelle: 'Diamètre inconnu', fond: COULEUR_DIAMETRE_INCONNU, contour: COULEUR_DIAMETRE_INCONNU, nombre: n('-1') },
    ];
  }
  return [...zones]
    .sort((a, b) => a.numero - b.numero)
    .map((z) => {
      const c = palette.zones.get(z.id) ?? couleurZone(z.numero);
      return { libelle: `Zone ${z.numero} · ${z.libelle}`, fond: c, contour: c, nombre: n(z.id) };
    });
}

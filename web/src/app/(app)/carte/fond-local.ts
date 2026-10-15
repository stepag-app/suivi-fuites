// Fond de carte de la ville sans réseau (lot CH) : extrait OpenStreetMap de Protomaps (zooms 0 à 15, agrandi au-delà)
// rangé dans R2 et copié sur la tablette, style « light » de @protomaps/basemaps (BSD-3) : rues, noms, bâtiments,
// eau, verdure, points d'intérêt avec leurs icônes. Polices Noto Sans (OFL, lettres latines et arabes) et icônes
// (MIT, tangrams) servies par le panneau (`public/fond/v1/`), gardées sur l'appareil par le service worker.
// Noms : français s'il existe (sinon le nom local, souvent en arabe, sur une seconde ligne) ; tablette en arabe :
// arabe d'abord. MapLibre 6 met lui-même l'arabe en forme, de droite à gauche.
import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';

export const DOSSIER_FOND = '/fond/v1';
export const POLICES_FOND = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
// Plages de caractères fournies : latin, diacritiques, ponctuation, symboles, arabe et ses formes de présentation.
export const PLAGES_FOND = [
  '0-255', '256-511', '512-767', '768-1023', '1536-1791', '1792-2047', '8192-8447', '8448-8703',
  '64256-64511', '64512-64767', '64768-65023', '65024-65279',
];
// « Noto Sans Bold » (sigles des nœuds, nombres des groupes et des fuites : couches.ts) n'existe pas chez Protomaps :
// copie de Medium pour les chiffres et lettres latines.
const PLAGES_GRAS = ['0-255', '256-511', '8192-8447'];
export const ICONES_FOND = ['light.json', 'light.png', 'light@2x.json', 'light@2x.png'];
export const ATTRIBUTION_FOND = '<a href="https://protomaps.com" target="_blank">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

/** Fichiers du fond servis par le panneau, à garder sur l'appareil (adresses relatives à l'origine). */
export function fichiersFond(): string[] {
  const chemin = (p: string, r: string) => `${DOSSIER_FOND}/polices/${encodeURIComponent(p)}/${r}.pbf`;
  const polices = POLICES_FOND.flatMap((p) => PLAGES_FOND.map((r) => chemin(p, r)));
  return [...polices, ...PLAGES_GRAS.map((r) => chemin('Noto Sans Bold', r)), ...ICONES_FOND.map((f) => `${DOSSIER_FOND}/icones/${f}`)];
}

/** Style MapLibre du fond local ; `source` : adresse `pmtiles://…` de l'archive (protocole enregistré). */
export function styleFondLocal(source: string, langue: 'fr' | 'ar', origine: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origine}${DOSSIER_FOND}/polices/{fontstack}/{range}.pbf`,
    sprite: `${origine}${DOSSIER_FOND}/icones/light`,
    sources: { protomaps: { type: 'vector', url: source, attribution: ATTRIBUTION_FOND } },
    layers: layers('protomaps', namedFlavor('light'), { lang: langue }),
  } as StyleSpecification;
}

/** Noms du fond local dans une autre langue (tablette passée du français à l'arabe, carte ouverte) : [couche, texte]. */
export function textesFondLocal(langue: 'fr' | 'ar'): [string, unknown][] {
  return layers('protomaps', namedFlavor('light'), { lang: langue })
    .filter((l) => l.type === 'symbol' && !!l.layout && 'text-field' in l.layout)
    .map((l) => [l.id, (l.layout as Record<string, unknown>)['text-field']]);
}

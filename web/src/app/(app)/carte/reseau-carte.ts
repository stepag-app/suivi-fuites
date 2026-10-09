// Réseau sur une carte MapLibre (écran et impression), en deux lectures interchangeables :
// - tuiles vectorielles (X5) : une seule source PMTiles pour tout le réseau, secteurs cochés par filtre ;
// - GeoJSON par secteur (repli : archive absente ou périmée) : une source par secteur.
// Dans les deux cas, état de balayage et sélection posés par `setFeatureState`, coloration changée sans recréer les
// sources. Sans React : utilisé par Carte.tsx (écran), capture.ts (PDF), la mini-carte et la carte de zonage.
import type { Map as CarteMapLibre, MapGeoJSONFeature } from 'maplibre-gl';
import { differencesEtats } from '@/lib/reseau/etat';
import type { PaletteReseau } from '@/lib/reseau/palette';
import { COUCHE_TRONCONS } from '@/lib/reseau/tuiles-format';
import type { TuilesReseau } from '@/lib/reseau/tuiles';
import type { CollectionNoeuds, CollectionTroncons, Coloration, EtatFeature, ProprietesTroncon } from '@/lib/reseau/types';
import { SANS_SECTEUR } from '@/lib/reseau/types';
import {
  SOURCE_TUILES, afficherHaloReseau, ajouterReseauTuiles, ajouterSourceNoeuds, ajouterSourceReseau, colorerReseau,
  filtrerReseauTuiles, idSourceReseau, retirerReseauTuiles, retirerSourceReseau,
} from './couches';

export interface SecteurAffiche {
  id: string;
  data: CollectionTroncons | null;    // null : chargement en cours (lecture GeoJSON) ou inutile (tuiles)
  noeuds?: CollectionNoeuds | null;
}

export interface GestionReseau {
  readonly mode: 'geojson' | 'tuiles';
  /** Ajoute les secteurs voulus (déjà chargés, ou tous en tuiles), retire ceux qui ne le sont plus. */
  synchroniser(secteurs: SecteurAffiche[], coloration: Coloration, palette: PaletteReseau): void;
  /** Pose l'état de balayage (différences seulement) sur tous les tronçons affichés. */
  appliquerEtats(etats: Map<string, EtatFeature>): void;
  appliquerSelection(selection: Set<string>): void;
  colorer(coloration: Coloration, palette: PaletteReseau): void;
  /** Contour clair sous le réseau (satellite affiché). */
  halo(visible: boolean): void;
  /** Propriétés d'un tronçon touché sur la carte (uuid de la base), quelle que soit la lecture. */
  proprietes(f: MapGeoJSONFeature): ProprietesTroncon | null;
  tout(): void;
}

interface OptionsGestion { impression?: boolean; avecTextes?: boolean }

export function creerGestionReseau(m: CarteMapLibre, o: OptionsGestion = {}): GestionReseau {
  const affiches = new Map<string, CollectionTroncons>();
  const noeudsAffiches = new Set<string>();
  const sourceParTroncon = new Map<string, string>();
  let etatsCourants = new Map<string, EtatFeature>();
  let selectionCourante = new Set<string>();
  let colorationCourante: Coloration = 'secteur';
  let paletteCourante: PaletteReseau = { secteurs: new Map(), zones: new Map() };
  let haloVisible = false;

  const poserEtat = (id: string, e: EtatFeature | undefined) => {
    const source = sourceParTroncon.get(id);
    if (!source || !m.getSource(source)) return;
    m.setFeatureState({ source, id }, { balaye: !!e?.balaye, repasse: !!e?.repasse });
  };
  const poserSelection = (id: string, choisie: boolean) => {
    const source = sourceParTroncon.get(id);
    if (!source || !m.getSource(source)) return;
    m.setFeatureState({ source, id }, { selection: choisie });
  };

  return {
    mode: 'geojson',
    synchroniser(secteurs, coloration, palette) {
      // Coloration changée : les couches déjà présentes sont recolorées (les nouvelles naissent à la bonne couleur).
      if (coloration !== colorationCourante || palette !== paletteCourante) {
        colorationCourante = coloration;
        paletteCourante = palette;
        colorerReseau(m, coloration, palette);
      }
      const voulus = new Set(secteurs.filter((s) => s.data).map((s) => s.id));
      for (const id of [...affiches.keys()]) {
        if (!voulus.has(id)) {
          for (const f of affiches.get(id)!.features) sourceParTroncon.delete(f.properties.id);
          affiches.delete(id);
          noeudsAffiches.delete(id);
          retirerSourceReseau(m, id);
        }
      }
      for (const s of secteurs) {
        if (!s.data) continue;
        const source = idSourceReseau(s.id);
        if (affiches.get(s.id) !== s.data) {
          ajouterSourceReseau(m, s.id, s.data, {
            coloration, palette, nonZone: s.id === SANS_SECTEUR, impression: o.impression, avecTextes: o.avecTextes, halo: haloVisible,
          });
          affiches.set(s.id, s.data);
          for (const f of s.data.features) {
            sourceParTroncon.set(f.properties.id, source);
            const e = etatsCourants.get(f.properties.id);
            if (e) poserEtat(f.properties.id, e);
            if (selectionCourante.has(f.properties.id)) poserSelection(f.properties.id, true);
          }
        }
        if (s.noeuds && !noeudsAffiches.has(s.id)) {
          ajouterSourceNoeuds(m, s.id, s.noeuds, o.impression, o.avecTextes);
          noeudsAffiches.add(s.id);
        }
      }
    },
    appliquerEtats(etats) {
      const { poser, retirer } = differencesEtats(etatsCourants, etats);
      for (const id of poser) poserEtat(id, etats.get(id));
      for (const id of retirer) poserEtat(id, undefined);
      etatsCourants = etats;
    },
    appliquerSelection(selection) {
      for (const id of selectionCourante) if (!selection.has(id)) poserSelection(id, false);
      for (const id of selection) if (!selectionCourante.has(id)) poserSelection(id, true);
      selectionCourante = new Set(selection);
    },
    colorer(coloration, palette) {
      if (coloration === colorationCourante && palette === paletteCourante) return;
      colorationCourante = coloration;
      paletteCourante = palette;
      colorerReseau(m, coloration, palette);
    },
    halo(visible) {
      haloVisible = visible;
      afficherHaloReseau(m, visible);
    },
    proprietes: (f) => (f.properties?.id ? (f.properties as unknown as ProprietesTroncon) : null),
    tout() {
      for (const id of [...affiches.keys()]) retirerSourceReseau(m, id);
      affiches.clear();
      noeudsAffiches.clear();
      sourceParTroncon.clear();
    },
  };
}

/**
 * Lecture en tuiles : une source pour tout le réseau, ajoutée une fois ; les secteurs cochés filtrent l'affichage.
 * Identifiants entiers dans les tuiles, uuid de la base partout ailleurs (index de l'archive).
 */
export function creerGestionTuiles(m: CarteMapLibre, tuiles: TuilesReseau, o: OptionsGestion = {}): GestionReseau {
  let ajoutee = false;
  let etatsCourants = new Map<string, EtatFeature>();
  let selectionCourante = new Set<string>();
  let colorationCourante: Coloration = 'secteur';
  let paletteCourante: PaletteReseau = { secteurs: new Map(), zones: new Map() };
  let haloVisible = false;
  const cible = (id: string) => {
    const n = tuiles.versEntier.get(id);
    return n == null ? null : { source: SOURCE_TUILES, sourceLayer: COUCHE_TRONCONS, id: n };
  };
  const poserEtat = (id: string, e: EtatFeature | undefined) => {
    const c = cible(id);
    if (c && m.getSource(SOURCE_TUILES)) m.setFeatureState(c, { balaye: !!e?.balaye, repasse: !!e?.repasse });
  };
  const poserSelection = (id: string, choisie: boolean) => {
    const c = cible(id);
    if (c && m.getSource(SOURCE_TUILES)) m.setFeatureState(c, { selection: choisie });
  };

  return {
    mode: 'tuiles',
    synchroniser(secteurs, coloration, palette) {
      const ids = secteurs.map((s) => s.id);
      if (!ajoutee) {
        ajouterReseauTuiles(m, tuiles.url, { coloration, palette, impression: o.impression, avecTextes: o.avecTextes, halo: haloVisible, secteurs: ids });
        ajoutee = true;
        colorationCourante = coloration;
        paletteCourante = palette;
        // L'état posé avant l'ajout de la source est repris (MapLibre le garde pour les tuiles à venir).
        for (const [id, e] of etatsCourants) poserEtat(id, e);
        for (const id of selectionCourante) poserSelection(id, true);
        return;
      }
      filtrerReseauTuiles(m, ids);
      if (coloration !== colorationCourante || palette !== paletteCourante) {
        colorationCourante = coloration;
        paletteCourante = palette;
        colorerReseau(m, coloration, palette);
      }
    },
    appliquerEtats(etats) {
      const { poser, retirer } = differencesEtats(etatsCourants, etats);
      for (const id of poser) poserEtat(id, etats.get(id));
      for (const id of retirer) poserEtat(id, undefined);
      etatsCourants = etats;
    },
    appliquerSelection(selection) {
      for (const id of selectionCourante) if (!selection.has(id)) poserSelection(id, false);
      for (const id of selection) if (!selectionCourante.has(id)) poserSelection(id, true);
      selectionCourante = new Set(selection);
    },
    colorer(coloration, palette) {
      if (coloration === colorationCourante && palette === paletteCourante) return;
      colorationCourante = coloration;
      paletteCourante = palette;
      colorerReseau(m, coloration, palette);
    },
    halo(visible) {
      haloVisible = visible;
      afficherHaloReseau(m, visible);
    },
    proprietes(f) {
      const n = typeof f.id === 'number' ? f.id : Number(f.id);
      const id = tuiles.index.ids[n - 1];
      if (!id) return null;
      const p = (f.properties ?? {}) as { s?: string; c?: ProprietesTroncon['c']; d?: number; m?: string };
      return { id, s: p.s ?? null, z: null, c: p.c ?? 'conduite', d: p.d ?? null, m: p.m ?? null, l: tuiles.index.l[n - 1] };
    },
    tout() {
      retirerReseauTuiles(m);
      ajoutee = false;
    },
  };
}

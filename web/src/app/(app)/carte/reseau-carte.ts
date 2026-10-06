// Réseau sur une carte MapLibre (écran et impression) : sources par secteur, état de balayage et sélection
// posés par `setFeatureState`, coloration changée sans recréer les sources. Sans React : utilisé par
// Carte.tsx (écran), capture.ts (PDF) et la carte de zonage des paramètres.
import type { Map as CarteMapLibre } from 'maplibre-gl';
import { differencesEtats } from '@/lib/reseau/etat';
import type { PaletteReseau } from '@/lib/reseau/palette';
import type { CollectionNoeuds, CollectionTroncons, Coloration, EtatFeature } from '@/lib/reseau/types';
import { SANS_SECTEUR } from '@/lib/reseau/types';
import { ajouterSourceNoeuds, ajouterSourceReseau, colorerReseau, idSourceReseau, retirerSourceReseau } from './couches';

export interface SecteurAffiche {
  id: string;
  data: CollectionTroncons | null;    // null : chargement en cours
  noeuds?: CollectionNoeuds | null;
}

export interface GestionReseau {
  /** Ajoute les secteurs voulus (déjà chargés), retire ceux qui ne le sont plus. */
  synchroniser(secteurs: SecteurAffiche[], coloration: Coloration, palette: PaletteReseau): void;
  /** Pose l'état de balayage (différences seulement) sur tous les tronçons affichés. */
  appliquerEtats(etats: Map<string, EtatFeature>): void;
  appliquerSelection(selection: Set<string>): void;
  colorer(coloration: Coloration, palette: PaletteReseau): void;
  /** Source MapLibre d'un tronçon affiché (pour setFeatureState). */
  sourceDe(tronconId: string): string | undefined;
  tout(): void;
}

export function creerGestionReseau(m: CarteMapLibre, impression = false): GestionReseau {
  const affiches = new Map<string, CollectionTroncons>();
  const noeudsAffiches = new Set<string>();
  const sourceParTroncon = new Map<string, string>();
  let etatsCourants = new Map<string, EtatFeature>();
  let selectionCourante = new Set<string>();
  let colorationCourante: Coloration = 'secteur';
  let paletteCourante: PaletteReseau = { secteurs: new Map(), zones: new Map() };

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
          ajouterSourceReseau(m, s.id, s.data, { coloration, palette, nonZone: s.id === SANS_SECTEUR, impression });
          affiches.set(s.id, s.data);
          for (const f of s.data.features) {
            sourceParTroncon.set(f.properties.id, source);
            const e = etatsCourants.get(f.properties.id);
            if (e) poserEtat(f.properties.id, e);
            if (selectionCourante.has(f.properties.id)) poserSelection(f.properties.id, true);
          }
        }
        if (s.noeuds && !noeudsAffiches.has(s.id)) {
          ajouterSourceNoeuds(m, s.id, s.noeuds, impression);
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
    sourceDe: (id) => sourceParTroncon.get(id),
    tout() {
      for (const id of [...affiches.keys()]) retirerSourceReseau(m, id);
      affiches.clear();
      noeudsAffiches.clear();
      sourceParTroncon.clear();
    },
  };
}

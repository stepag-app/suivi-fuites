// Arbre Zone → secteurs du panneau « Réseau » : couleurs de la palette, linéaires et % balayé de
// `v_lineaire_secteurs`, état des cases (une zone coche ses secteurs). Fonctions pures.
import type { LigneLineaireSecteur } from '@/lib/types';
import { couleurZone, type PaletteReseau } from './palette';
import type { SecteurReseau, ZoneReseau } from './types';

export interface NoeudSecteur {
  id: string;
  zone_id: string;
  code: string;
  libelle: string;
  ordre: number;
  couleur: string;
  nbTroncons: number;
  lineaire: number;
  lineaireBalaye: number;
  pct: number;
  modifieLe: string | null;
}

export interface NoeudZone {
  id: string;
  numero: number;
  code: string;
  libelle: string;
  couleur: string;
  secteurs: NoeudSecteur[];
  nbTroncons: number;
  lineaire: number;
  lineaireBalaye: number;
  pct: number;
}

export type EtatCase = 'aucun' | 'partiel' | 'tous';

const pourcent = (partie: number, total: number) => (total > 0 ? Math.round((partie / total) * 1000) / 10 : 0);

export function construireArbre(
  zones: Pick<ZoneReseau, 'id' | 'numero' | 'code' | 'libelle'>[],
  secteurs: Pick<SecteurReseau, 'id' | 'zone_id' | 'code' | 'libelle' | 'ordre'>[],
  lignes: LigneLineaireSecteur[],
  palette: PaletteReseau,
): NoeudZone[] {
  const parSecteur = new Map(lignes.map((l) => [l.secteur_id, l]));
  return [...zones]
    .sort((a, b) => a.numero - b.numero || a.code.localeCompare(b.code, 'fr'))
    .map((z) => {
      const liste = secteurs
        .filter((s) => s.zone_id === z.id)
        .sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code, 'fr'))
        .map((s): NoeudSecteur => {
          const l = parSecteur.get(s.id);
          const lineaire = Number(l?.lineaire_m) || 0;
          const balaye = Number(l?.lineaire_balaye_m) || 0;
          return {
            id: s.id, zone_id: z.id, code: s.code, libelle: s.libelle, ordre: s.ordre,
            couleur: palette.secteurs.get(s.id) ?? couleurZone(z.numero),
            nbTroncons: Number(l?.nb_troncons) || 0, lineaire, lineaireBalaye: balaye,
            pct: l?.pct_balaye != null ? Number(l.pct_balaye) : pourcent(balaye, lineaire),
            modifieLe: l?.modifie_le ?? null,
          };
        });
      const lineaire = liste.reduce((t, s) => t + s.lineaire, 0);
      const lineaireBalaye = liste.reduce((t, s) => t + s.lineaireBalaye, 0);
      return {
        id: z.id, numero: z.numero, code: z.code, libelle: z.libelle,
        couleur: palette.zones.get(z.id) ?? couleurZone(z.numero),
        secteurs: liste, nbTroncons: liste.reduce((t, s) => t + s.nbTroncons, 0),
        lineaire, lineaireBalaye, pct: pourcent(lineaireBalaye, lineaire),
      };
    });
}

export function etatCaseZone(zone: NoeudZone, choisis: Set<string>): EtatCase {
  if (zone.secteurs.length === 0) return 'aucun';
  const n = zone.secteurs.filter((s) => choisis.has(s.id)).length;
  return n === 0 ? 'aucun' : n === zone.secteurs.length ? 'tous' : 'partiel';
}

/** Cocher une zone coche tous ses secteurs ; une zone entièrement cochée se décoche. */
export function basculerZone(zone: NoeudZone, choisis: Set<string>): Set<string> {
  const s = new Set(choisis);
  const tous = etatCaseZone(zone, choisis) === 'tous';
  for (const sect of zone.secteurs) {
    if (tous) s.delete(sect.id);
    else s.add(sect.id);
  }
  return s;
}

export const tousLesSecteurs = (arbre: NoeudZone[]) => new Set(arbre.flatMap((z) => z.secteurs.map((s) => s.id)));

/** Totaux des secteurs cochés (compteur du panneau). */
export function totauxChoisis(arbre: NoeudZone[], choisis: Set<string>): { secteurs: number; nbTroncons: number; lineaire: number; lineaireBalaye: number; pct: number } {
  const liste = arbre.flatMap((z) => z.secteurs).filter((s) => choisis.has(s.id));
  const lineaire = liste.reduce((t, s) => t + s.lineaire, 0);
  const lineaireBalaye = liste.reduce((t, s) => t + s.lineaireBalaye, 0);
  return {
    secteurs: liste.length, nbTroncons: liste.reduce((t, s) => t + s.nbTroncons, 0),
    lineaire, lineaireBalaye, pct: pourcent(lineaireBalaye, lineaire),
  };
}

/** Clé de cache d'un secteur : `marche:secteur` (contrat § 5). */
export const cleCache = (marcheId: string, secteurId: string) => `${marcheId}:${secteurId}`;

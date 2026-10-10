// Modification d'une réparation déjà saisie. La tablette garde seulement les changements (champs
// modifiés, pièces ajoutées / retirées / requantifiées, ouvriers ajoutés / retirés) et non une copie
// complète : un envoi rejoué ne refait rien de plus, et ce qu'un collègue a ajouté entre-temps reste.
import type { PieceAttente } from './file-attente';

/** Champs de `reparations` modifiables depuis la tablette. */
export const CHAMPS_REPARATION = [
  'resultat', 'motif_id', 'realisee_le', 'ouvrage', 'materiau', 'diametre_mm', 'representant_srm', 'representant_srm_id',
  'tuyau_repare', 'robinet_pec_change', 'collier_pec_change', 'bouche_a_cle_mise_a_niveau', 'element_remplace',
  'longueur_pe_m', 'fouille_longueur_m', 'fouille_largeur_m', 'fouille_profondeur_m', 'emplacement',
  'nature_revetement_id', 'observation',
] as const;

export interface EtatReparation { ligne: Record<string, unknown>; pieces: PieceAttente[]; ouvriers: string[] }
export interface Changements {
  ligne: Record<string, unknown>;
  pieces_ajoutees: PieceAttente[];
  pieces_retirees: string[];
  quantites: { id: string; quantite: number }[];
  ouvriers_ajoutes: string[];
  ouvriers_retires: string[];
}

const vide = (v: unknown) => v === null || v === undefined || v === '';

export function memeValeur(champ: string, a: unknown, b: unknown): boolean {
  if (vide(a) || vide(b)) return vide(a) && vide(b);
  // Le serveur renvoie « …+00:00 », la tablette « ….000Z » : on compare des instants.
  if (champ === 'realisee_le' || champ === 'date_detection') return new Date(String(a)).getTime() === new Date(String(b)).getTime();
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return a === b;
}

/** État après une modification (affichage de la fiche, pré-remplissage d'une nouvelle modification). */
export function appliquer(etat: EtatReparation, c: Changements): EtatReparation {
  const quantites = new Map(c.quantites.map((q) => [q.id, q.quantite]));
  return {
    ligne: { ...etat.ligne, ...c.ligne },
    pieces: [
      ...etat.pieces
        .filter((p) => !c.pieces_retirees.includes(p.id))
        .map((p) => ({ ...p, quantite: quantites.get(p.id) ?? p.quantite })),
      ...c.pieces_ajoutees.filter((p) => !etat.pieces.some((x) => x.id === p.id)),
    ],
    ouvriers: [
      ...etat.ouvriers.filter((o) => !c.ouvriers_retires.includes(o)),
      ...c.ouvriers_ajoutes.filter((o) => !etat.ouvriers.includes(o)),
    ],
  };
}

/** Ce que la saisie a changé par rapport à l'état de départ. */
export function differences(avant: EtatReparation, apres: EtatReparation): Changements {
  const ligne: Record<string, unknown> = {};
  for (const k of CHAMPS_REPARATION) {
    if (!memeValeur(k, avant.ligne[k], apres.ligne[k])) ligne[k] = apres.ligne[k] ?? null;
  }
  const garde = new Set(apres.pieces.map((p) => p.id));
  const departs = new Map(avant.pieces.map((p) => [p.id, p]));
  return {
    ligne,
    pieces_ajoutees: apres.pieces.filter((p) => !departs.has(p.id)),
    pieces_retirees: avant.pieces.filter((p) => !garde.has(p.id)).map((p) => p.id),
    quantites: apres.pieces
      .filter((p) => departs.has(p.id) && Number(departs.get(p.id)?.quantite) !== Number(p.quantite))
      .map((p) => ({ id: p.id, quantite: p.quantite })),
    ouvriers_ajoutes: apres.ouvriers.filter((o) => !avant.ouvriers.includes(o)),
    ouvriers_retires: avant.ouvriers.filter((o) => !apres.ouvriers.includes(o)),
  };
}

export const aucunChangement = (c: Changements) =>
  !Object.keys(c.ligne).length && !c.pieces_ajoutees.length && !c.pieces_retirees.length && !c.quantites.length
  && !c.ouvriers_ajoutes.length && !c.ouvriers_retires.length;

/** Champs d'une ligne qui diffèrent de l'état de départ (fuite ou réfection modifiée : envoi « maj »). */
export function champsChanges(avant: Record<string, unknown>, apres: Record<string, unknown>): Record<string, unknown> {
  const champs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(apres)) if (!memeValeur(k, avant[k], v)) champs[k] = v ?? null;
  return champs;
}

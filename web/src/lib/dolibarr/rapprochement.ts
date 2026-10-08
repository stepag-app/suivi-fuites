// Rapprochement posé / transféré (lot P4) : lignes de rapprochement_fournitures (période × article Dolibarr), filtres,
// totaux et export. Calculs purs, sans navigateur ni réseau : scripts/verifier-rapprochement-dolibarr.mjs les rejoue.
//
// Vocabulaire : « transféré au chantier » (bons de transfert Dolibarr vers l'entrepôt du marché, retours déduits,
// annulations neutralisées), « consommé » (sortie déclarée dans Dolibarr), « posé » (inventaire réel des réparations),
// « écart » = transféré − consommé − posé = reste théorique au chantier (négatif : posé sans transfert enregistré).
// Jamais de prix.
import { FAMILLES_PAR_DEFAUT } from '@/lib/nomenclature/csv';
import type { Colonne } from '@/lib/export/modele';

export interface LigneRapprochement {
  produit_id: number;
  designation: string;
  famille: string | null;
  unite: string;
  /** Produit présent dans Paramètres > Articles (sinon : carburant, outillage… vus seulement dans les mouvements). */
  dans_articles: boolean;
  transfere: number;
  consomme: number;
  pose: number;
  ecart: number;
  /** Lignes de pièces posées sur la période. */
  pieces: number;
  cumul_transfere: number;
  cumul_consomme: number;
  cumul_pose: number;
  cumul_ecart: number;
  ecart_pct: number | null;
  seuil_pct: number;
  au_dela_seuil: boolean;
  dernier_mouvement: string | null;
}

export const SEUIL_PAR_DEFAUT_PCT = 10;
const NUMERIQUES = ['transfere', 'consomme', 'pose', 'ecart', 'cumul_transfere', 'cumul_consomme', 'cumul_pose', 'cumul_ecart', 'seuil_pct'] as const;

/** PostgREST renvoie les numeric en texte ou en nombre : tout en nombres. */
export function normaliserLigne(brute: Record<string, unknown>): LigneRapprochement {
  const l = { ...brute } as Record<string, unknown>;
  for (const k of NUMERIQUES) l[k] = Number(l[k] ?? 0);
  l.ecart_pct = l.ecart_pct == null ? null : Number(l.ecart_pct);
  l.pieces = Number(l.pieces ?? 0);
  return l as unknown as LigneRapprochement;
}

export interface FiltresRapprochement {
  /** '' = toutes ; sinon code de famille. */
  famille: string;
  /** Seulement les familles des pièces (RAC, CND, ROB, AEP, VRI) : écarte carburant, outillage, gilets… */
  piecesSeulement: boolean;
  /** Seulement les articles au-delà du seuil. */
  alertesSeulement: boolean;
  texte: string;
}

export const FILTRES_RAPPROCHEMENT_DEFAUT: FiltresRapprochement = { famille: '', piecesSeulement: true, alertesSeulement: false, texte: '' };

const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrerRapprochement(lignes: LigneRapprochement[], f: FiltresRapprochement): LigneRapprochement[] {
  const mots = sansAccents(f.texte).split(/\s+/).filter(Boolean);
  return lignes.filter((l) =>
    (!f.piecesSeulement || (l.famille != null && FAMILLES_PAR_DEFAUT.includes(l.famille)) || l.pose !== 0 || l.cumul_pose !== 0)
    && (!f.famille || (l.famille ?? '') === f.famille)
    && (!f.alertesSeulement || l.au_dela_seuil)
    && mots.every((m) => sansAccents(l.designation).includes(m)));
}

/** Ordre d'affichage : articles au-delà du seuil d'abord (plus gros écart relatif), puis par désignation. */
export function trierRapprochement(lignes: LigneRapprochement[]): LigneRapprochement[] {
  const poids = (l: LigneRapprochement) => (l.cumul_transfere > 0 ? Math.abs(l.cumul_ecart) / l.cumul_transfere : Math.abs(l.cumul_ecart) ? Infinity : 0);
  return [...lignes].sort((a, b) => Number(b.au_dela_seuil) - Number(a.au_dela_seuil)
    || (a.au_dela_seuil ? poids(b) - poids(a) : 0)
    || a.designation.localeCompare(b.designation, 'fr', { numeric: true }));
}

export interface TotalRapprochement {
  articles: number;
  alertes: number;
  /** Une consommation déclarée dans Dolibarr : colonne « consommé » utile. */
  aConsomme: boolean;
  posees: number;
  sansTransfert: number;
}

export function totalRapprochement(lignes: LigneRapprochement[]): TotalRapprochement {
  return {
    articles: lignes.length,
    alertes: lignes.filter((l) => l.au_dela_seuil).length,
    aConsomme: lignes.some((l) => l.consomme !== 0 || l.cumul_consomme !== 0),
    posees: lignes.filter((l) => l.pose !== 0).length,
    sansTransfert: lignes.filter((l) => l.cumul_pose > 0 && l.cumul_transfere <= 0).length,
  };
}

/** Familles présentes, pour le filtre. */
export const famillesDe = (lignes: LigneRapprochement[]) =>
  [...new Set(lignes.map((l) => l.famille).filter((f): f is string => !!f))].sort();

export function colonnesExportRapprochement(aConsomme: boolean): Colonne<LigneRapprochement>[] {
  const q = (cle: keyof LigneRapprochement & string, titre: string, groupe: string): Colonne<LigneRapprochement> =>
    ({ cle, titre, groupe, type: 'quantite', uniteCle: 'unite', largeur: 10 });
  return [
    { cle: 'designation', titre: 'Article', groupe: 'Article', largeur: 32 },
    { cle: 'famille', titre: 'Famille', groupe: 'Article', largeur: 8 },
    { cle: 'unite', titre: 'Unité', groupe: 'Article', largeur: 6 },
    q('transfere', 'Transféré', 'Période'),
    ...(aConsomme ? [q('consomme', 'Consommé', 'Période')] : []),
    q('pose', 'Posé', 'Période'),
    q('ecart', 'Écart', 'Période'),
    q('cumul_transfere', 'Transféré cumulé', 'Cumul'),
    ...(aConsomme ? [q('cumul_consomme', 'Consommé cumulé', 'Cumul')] : []),
    q('cumul_pose', 'Posé cumulé', 'Cumul'),
    q('cumul_ecart', 'Écart cumulé', 'Cumul'),
    { cle: 'ecart_pct', titre: 'Écart (%)', groupe: 'Cumul', type: 'nombre', decimales: 1, largeur: 8 },
    { cle: 'au_dela_seuil', titre: 'Au-delà du seuil', groupe: 'Cumul', largeur: 9 },
  ];
}

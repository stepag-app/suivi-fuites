// Export Excel de l'inventaire des fournitures posées : deux feuilles, le tableau croisé tel qu'il est affiché
// (lignes × colonnes, totaux) et le détail (une ligne par pièce de l'inventaire réel, filtres appliqués).
// Même moteur que les autres exports (src/lib/export/modele.ts) ; jamais de prix ni de référence Dolibarr.
import type { Colonne, Ligne } from '@/lib/export/modele';
import type { Croisement, LigneDetailExport } from './inventaire';

export const CLE_LIBELLE = 'libelle';
export const CLE_TOTAL = 'total';
const cleColonne = (i: number) => `c${i}`;

type Cellule = Croisement['total'];

/**
 * Lignes du tableau croisé : libellé, détail, une valeur par colonne, total, comptes. Unité unique : des nombres
 * (le moteur additionne) ; unités mélangées : les textes du tableau (« 12 U · 3 m ») et une ligne « Total » finale.
 */
export function lignesInventaireCroise(c: Croisement): Ligne[] {
  const valeur = (cell: Cellule) => (c.unite ? cell.quantites[c.unite] ?? 0 : cell.pieces ? cell.texte : null);
  const ligne = (libelle: string, detail: string | null, cellules: Cellule[], total: Cellule): Ligne => ({
    [CLE_LIBELLE]: libelle,
    detail,
    ...Object.fromEntries(cellules.map((cell, i) => [cleColonne(i), valeur(cell)])),
    [CLE_TOTAL]: valeur(total),
    pieces: total.pieces,
    fuites: total.fuites,
    unite: c.unite ?? '',
  });
  const corps = c.corps.map((l) => ligne(l.libelle, l.detail, l.cellules, l.total));
  return c.unite ? corps : [...corps, ligne('Total', null, c.totaux, c.total)];
}

/** Colonnes du tableau croisé : libellé de ligne, détail, une colonne par en-tête, total, pièces et fuites. */
export function colonnesInventaireCroise(c: Croisement, libelleLignes: string): Colonne[] {
  const avecTotal = !!c.unite;
  const quantite = (cle: string, titre: string): Colonne => ({
    cle, titre, groupe: 'Quantités', type: avecTotal ? 'quantite' : 'texte', uniteCle: 'unite', total: avecTotal, largeur: 12,
  });
  const suffixe = c.unite ? ` (${c.unite})` : '';
  return [
    { cle: CLE_LIBELLE, titre: libelleLignes, groupe: 'Ligne', largeur: 30 },
    { cle: 'detail', titre: 'Détail', groupe: 'Ligne', largeur: 18 },
    ...c.entetes.map((e, i) => quantite(cleColonne(i), c.colonnes === 'aucune' ? `Quantité${suffixe}` : e.libelle)),
    ...(c.colonnes === 'aucune' ? [] : [quantite(CLE_TOTAL, `Total${suffixe}`)]),
    { cle: 'pieces', titre: 'Pièces', groupe: 'Comptes', type: 'nombre', total: avecTotal, largeur: 8 },
    { cle: 'fuites', titre: 'Fuites', groupe: 'Comptes', type: 'nombre', largeur: 8 },
  ];
}

export const COLONNES_DETAIL: Colonne<LigneDetailExport>[] = [
  { cle: 'jour', titre: 'Réparée le', groupe: 'Réparation', type: 'date', largeur: 11 },
  { cle: 'fuite_numero', titre: 'N° fuite', groupe: 'Réparation', type: 'nombre', largeur: 7 },
  { cle: 'reference_srm', titre: 'Référence', groupe: 'Réparation', largeur: 13 },
  { cle: 'chef', titre: "Chef d'équipe (matricule)", groupe: 'Réparation', largeur: 15 },
  { cle: 'zone', titre: 'Zone', groupe: 'Lieu', largeur: 16 },
  { cle: 'secteur', titre: 'Secteur', groupe: 'Lieu', largeur: 16 },
  { cle: 'designation', titre: 'Désignation', groupe: 'Fourniture', largeur: 30 },
  { cle: 'famille_libelle', titre: 'Famille', groupe: 'Fourniture', largeur: 16 },
  { cle: 'unite', titre: 'Unité', groupe: 'Fourniture', largeur: 6 },
  { cle: 'quantite', titre: 'Quantité', groupe: 'Fourniture', type: 'quantite', uniteCle: 'unite', largeur: 9 },
  { cle: 'provenance_libelle', titre: 'Provenance', groupe: 'Fourniture', largeur: 24 },
];

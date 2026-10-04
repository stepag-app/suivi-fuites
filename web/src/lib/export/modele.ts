// Modèle neutre d'un document exporté : les générateurs Excel, PDF, Word et CSV
// le traduisent chacun dans leur format. Rien ici ne dépend d'une bibliothèque.

export type TypeCellule = 'texte' | 'nombre' | 'quantite' | 'montant' | 'date' | 'dateheure';

export interface Colonne<T = Ligne> {
  cle: string;
  titre: string;
  groupe: string;                       // thème (cases groupées dans le panneau)
  type?: TypeCellule;
  valeur?: (l: T) => unknown;           // par défaut : l[cle]
  decimales?: number;                   // nombres
  uniteCle?: string;                    // quantités : clé de l'unité (décimales selon le marché)
  total?: boolean;                      // sous-totaux et total
  largeur?: number;                     // largeur indicative (caractères)
}

export type Ligne = Record<string, unknown>;

export interface LigneDoc {
  type: 'donnees' | 'groupe' | 'sous_total' | 'total';
  cellules: (string | number | Date | null)[];
  libelle?: string;
}

export interface SectionDoc {
  titre?: string;
  colonnes: { titre: string; type: TypeCellule; decimales: number[]; largeur: number }[];
  lignes: LigneDoc[];
}

export interface EnteteDoc {
  titulaire: string[];
  titulaireAr?: string | null;
  client: string[];
  clientAr?: string | null;
  titre: string;
  infos: string[];
}

export interface DocumentExport {
  nomFichier: string;
  entete: EnteteDoc;
  sections: SectionDoc[];
  visas?: string[];
  pied?: string | null;
  filigrane?: string | null;
  orientation: 'portrait' | 'paysage';
  genereLe: Date;
}

export const DECIMALES_DEFAUT: Record<string, number> = { ml: 2, m2: 2, m3: 3, u: 0, forfait: 2, kg: 2 };

const enDate = (v: unknown): Date | null => {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v;
  const t = String(v);
  // Date seule (AAAA-MM-JJ) : midi local, pour ne jamais changer de jour.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T12:00:00`) : new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
};

function cellule(c: Colonne, l: Ligne, decimales: Record<string, number>): { valeur: string | number | Date | null; dec: number } {
  const brute = c.valeur ? c.valeur(l) : l[c.cle];
  const type = c.type ?? 'texte';
  if (type === 'date' || type === 'dateheure') return { valeur: enDate(brute), dec: 0 };
  if (type === 'nombre' || type === 'quantite' || type === 'montant') {
    const n = brute == null || brute === '' ? null : Number(brute);
    const dec = type === 'montant' ? 2
      : type === 'quantite' ? decimales[String(l[c.uniteCle ?? 'unite'] ?? '')] ?? c.decimales ?? 2
      : c.decimales ?? 0;
    return { valeur: n == null || Number.isNaN(n) ? null : n, dec };
  }
  if (typeof brute === 'boolean') return { valeur: brute ? 'Oui' : 'Non', dec: 0 };
  return { valeur: brute == null ? null : String(brute), dec: 0 };
}

// Tableau avec regroupement facultatif : ligne de groupe, sous-totaux des colonnes
// marquées « total », total général.
export function construireSection<T extends Ligne>(
  lignes: T[],
  colonnes: Colonne<T>[],
  options: { titre?: string; groupe?: (l: T) => string; decimales?: Record<string, number>; total?: boolean } = {},
): SectionDoc {
  const decimales = { ...DECIMALES_DEFAUT, ...(options.decimales ?? {}) };
  const cols = colonnes as unknown as Colonne[];
  const avecTotal = cols.some((c) => c.total);
  const sortie: LigneDoc[] = [];
  const decimalesParColonne: number[][] = cols.map(() => []);

  const sommes = (paquet: Ligne[]) =>
    cols.map((c) => {
      if (!c.total) return null;
      // Une somme n'a de sens que si toutes les lignes ont la même unité.
      if (c.type === 'quantite') {
        const unites = new Set(paquet.map((l) => String(l[c.uniteCle ?? 'unite'] ?? '')));
        if (unites.size > 1) return null;
      }
      return paquet.reduce((s, l) => s + (Number(cellule(c, l, decimales).valeur) || 0), 0);
    });

  const ajouterDonnees = (paquet: Ligne[]) => {
    paquet.forEach((l) => {
      const cellules = cols.map((c, i) => {
        const { valeur, dec } = cellule(c, l, decimales);
        decimalesParColonne[i].push(dec);
        return valeur;
      });
      sortie.push({ type: 'donnees', cellules });
    });
  };

  if (options.groupe) {
    const groupes = new Map<string, Ligne[]>();
    (lignes as Ligne[]).forEach((l) => {
      const g = options.groupe!(l as T) || '—';
      groupes.set(g, [...(groupes.get(g) ?? []), l]);
    });
    [...groupes.entries()].forEach(([g, paquet]) => {
      sortie.push({ type: 'groupe', cellules: cols.map(() => null), libelle: `${g} (${paquet.length})` });
      ajouterDonnees(paquet);
      if (avecTotal) sortie.push({ type: 'sous_total', cellules: sommes(paquet), libelle: 'Sous-total' });
    });
  } else {
    ajouterDonnees(lignes as Ligne[]);
  }
  if (avecTotal && options.total !== false && lignes.length > 0) {
    sortie.push({ type: 'total', cellules: sommes(lignes as Ligne[]), libelle: 'Total' });
  }

  return {
    titre: options.titre,
    colonnes: cols.map((c, i) => ({
      titre: c.titre,
      type: c.type ?? 'texte',
      decimales: decimalesParColonne[i],
      largeur: c.largeur ?? Math.min(40, Math.max(c.titre.length + 2, c.type === 'texte' || !c.type ? 14 : 10)),
    })),
    lignes: sortie,
  };
}

// Nombre de décimales d'une cellule (les quantités dépendent de l'unité de la ligne ;
// sous-totaux et totaux : le plus grand nombre de décimales de la colonne).
export function decimalesPour(section: SectionDoc, ligne: LigneDoc, i: number, indexDonnees: number): number {
  const col = section.colonnes[i];
  if (col.type === 'montant') return 2;
  if (ligne.type === 'donnees') return col.decimales[indexDonnees] ?? 0;
  return col.decimales.length ? Math.max(...col.decimales) : 0;
}

// -----------------------------------------------------------------------------
// Mise en forme commune (CSV, PDF, Word)
// -----------------------------------------------------------------------------
export const texteDate = (d: Date | null, avecHeure = false) =>
  d == null ? '' : avecHeure
    ? d.toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca' });

export const texteNombre = (n: number | null, dec: number) =>
  n == null ? '' : n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/ /g, ' ');

export function texteCellule(section: SectionDoc, ligne: LigneDoc, i: number, indexDonnees: number): string {
  const v = ligne.cellules[i];
  const col = section.colonnes[i];
  if (v == null) return '';
  if (v instanceof Date) return texteDate(v, col.type === 'dateheure');
  if (typeof v === 'number') return texteNombre(v, decimalesPour(section, ligne, i, indexDonnees));
  return String(v);
}

// Ligne de total : le libellé occupe toutes les colonnes vides de tête (au moins une).
export function etendueLibelle(ligne: LigneDoc): number {
  const k = ligne.cellules.findIndex((c) => c != null);
  return k === -1 ? ligne.cellules.length : Math.max(1, k);
}

// Parcourt les lignes en donnant l'index de chaque ligne de données (pour les décimales).
export function* parcourir(section: SectionDoc): Generator<{ ligne: LigneDoc; indexDonnees: number }> {
  let n = 0;
  for (const ligne of section.lignes) {
    yield { ligne, indexDonnees: ligne.type === 'donnees' ? n++ : -1 };
  }
}

// Nom de fichier sûr : lettres, chiffres, tirets.
export const nomFichierSur = (t: string) =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

export function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

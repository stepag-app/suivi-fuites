// Contrôles de cohérence à l'attachement (vue v_controles_attachement) et travaux hors bordereau
// à faire valoir (vue v_hors_bordereau) : logique pure, sans navigateur ni réseau. Seuls des imports
// de types : le script scripts/verifier-controles-attachement.mjs charge ce fichier avec Node.
import type { Colonne } from '@/lib/export/modele';

export type Gravite = 'alerte' | 'avertissement' | 'information';

export interface Controle {
  marche_id: string;
  fuite_id: string;
  fuite_numero: number;
  reparation_id: string | null;
  ligne_id: string | null;
  controle: string;
  gravite: Gravite;
  libelle: string;
  detail: string | null;
  excedent: number | null;
  unite: string | null;
}

export const COLONNES_CONTROLES =
  'marche_id, fuite_id, fuite_numero, reparation_id, ligne_id, controle, gravite, libelle, detail, excedent, unite';

/** Ordre d'affichage et libellé de chaque gravité (la plus grave d'abord). */
export const GRAVITES: Record<Gravite, { libelle: string; ordre: number }> = {
  alerte: { libelle: 'Alerte', ordre: 0 },
  avertissement: { libelle: 'À vérifier', ordre: 1 },
  information: { libelle: 'Hors bordereau', ordre: 2 },
};

/** Libellés courts des badges ; la vue donne le libellé complet et le détail. */
export const LIBELLES_COURTS: Record<string, string> = {
  robinet_pec_non_coche: 'Robinet PEC non coché',
  robinet_pec_sans_piece: 'Robinet PEC sans pièce',
  collier_pec_non_coche: 'Collier PEC non coché',
  collier_pec_sans_piece: 'Collier PEC sans pièce',
  fouille_sans_volume: 'Fouille sans volume',
  reparation_sans_prix: 'Sans prix de réparation',
  refection_hors_delai: 'Réfection en retard',
  ligne_incoherente: 'Ligne incohérente',
  pe_superieur_2m: 'PE au-delà de 2 m',
  reparation_hors_bordereau: 'Sans article',
};

export const libelleCourt = (c: Pick<Controle, 'controle' | 'libelle'>) => LIBELLES_COURTS[c.controle] ?? c.libelle;

const ordreGravite = (g: string) => GRAVITES[g as Gravite]?.ordre ?? 9;

/** Du plus grave au moins grave, puis par libellé (ordre stable). */
export function trierControles<T extends Pick<Controle, 'gravite' | 'libelle' | 'controle'>>(liste: T[]): T[] {
  return [...liste].sort((a, b) =>
    ordreGravite(a.gravite) - ordreGravite(b.gravite) || a.libelle.localeCompare(b.libelle, 'fr') || a.controle.localeCompare(b.controle));
}

/** Contrôles regroupés par fuite, triés. */
export function controlesParFuite(liste: Controle[]): Map<string, Controle[]> {
  const m = new Map<string, Controle[]>();
  liste.forEach((c) => m.set(c.fuite_id, [...(m.get(c.fuite_id) ?? []), c]));
  return new Map([...m.entries()].map(([k, v]) => [k, trierControles(v)]));
}

export interface ResumeControles {
  total: number;
  /** Gravité la plus haute, nulle s'il n'y a rien. */
  gravite: Gravite | null;
  parGravite: Record<Gravite, number>;
  /** Une puce par libellé court distinct, du plus grave au moins grave. */
  puces: { libelle: string; gravite: Gravite }[];
  /** Texte de l'infobulle : une ligne par contrôle, avec son détail. */
  titre: string;
}

export function resumer(liste: Controle[] | undefined): ResumeControles {
  const tries = trierControles(liste ?? []);
  const parGravite: Record<Gravite, number> = { alerte: 0, avertissement: 0, information: 0 };
  const puces = new Map<string, Gravite>();
  tries.forEach((c) => {
    if (c.gravite in parGravite) parGravite[c.gravite] += 1;
    if (!puces.has(libelleCourt(c))) puces.set(libelleCourt(c), c.gravite);
  });
  return {
    total: tries.length,
    gravite: tries[0]?.gravite ?? null,
    parGravite,
    puces: [...puces.entries()].map(([libelle, gravite]) => ({ libelle, gravite })),
    titre: tries.map((c) => `${GRAVITES[c.gravite]?.libelle ?? c.gravite} : ${c.libelle}${c.detail ? ` (${c.detail})` : ''}`).join('\n'),
  };
}

/** Synthèse par contrôle pour l'en-tête de page : nombre de cas et de fuites concernées. */
export function syntheseControles(liste: Controle[]): { controle: string; libelle: string; gravite: Gravite; cas: number; fuites: number }[] {
  const m = new Map<string, { controle: string; libelle: string; gravite: Gravite; cas: number; fuites: Set<string> }>();
  liste.forEach((c) => {
    const e = m.get(c.controle) ?? { controle: c.controle, libelle: libelleCourt(c), gravite: c.gravite, cas: 0, fuites: new Set<string>() };
    e.cas += 1;
    e.fuites.add(c.fuite_id);
    m.set(c.controle, e);
  });
  return trierControles([...m.values()].map((e) => ({ ...e, fuites: e.fuites.size })));
}

// ---------------------------------------------------------------------------
// Polyéthylène au-delà de 2 m (même calcul que la base : longueur − 2 m, jamais négatif)
// ---------------------------------------------------------------------------
export const LONGUEUR_PE_COUVERTE_M = 2;

export function excedentPe(longueur: number | null | undefined, couverte = LONGUEUR_PE_COUVERTE_M): number {
  if (longueur == null || Number.isNaN(Number(longueur))) return 0;
  return Math.max(0, Math.round((Number(longueur) - couverte) * 100) / 100);
}

// ---------------------------------------------------------------------------
// Travaux hors bordereau à faire valoir
// ---------------------------------------------------------------------------
export type NatureHorsBordereau = 'pe_au_dela_2m' | 'reparation_sans_article' | 'piece_non_couverte';

// Alias de type (et non interface) : assignable aux lignes génériques du moteur d'export.
export type TravailHorsBordereau = {
  marche_id: string;
  nature: NatureHorsBordereau;
  libelle: string;
  fuite_id: string;
  fuite_numero: number;
  reference_srm: string | null;
  adresse: string | null;
  zone_id: string | null;
  zone: string | null;
  secteur_id: string | null;
  secteur: string | null;
  reparation_id: string;
  realisee_le: string;
  /** Jour de la réparation (AAAA-MM-JJ, heure du Maroc). */
  jour: string;
  materiau: string | null;
  diametre_mm: number | null;
  designation: string;
  quantite: number;
  unite: string;
  piece_ligne_id: string | null;
  ajoutee_bureau: boolean | null;
};

// Une seule chaîne littérale : supabase-js en déduit le type des lignes lues.
export const COLONNES_HORS_BORDEREAU = 'marche_id, nature, libelle, fuite_id, fuite_numero, reference_srm, adresse, zone_id, zone, secteur_id, secteur, reparation_id, realisee_le, jour, materiau, diametre_mm, designation, quantite, unite, piece_ligne_id, ajoutee_bureau';

export const NATURES_HORS_BORDEREAU: Record<NatureHorsBordereau, string> = {
  pe_au_dela_2m: 'Polyéthylène au-delà de 2 m',
  reparation_sans_article: 'Réparation sans article au bordereau',
  piece_non_couverte: 'Pièce non couverte par un article',
};
const ORDRE_NATURES: NatureHorsBordereau[] = ['pe_au_dela_2m', 'reparation_sans_article', 'piece_non_couverte'];

export interface FiltresHorsBordereau {
  du?: string;
  au?: string;
  secteur?: string;
  nature?: string;
}

/** Filtre période (jour de réparation, bornes comprises), secteur et nature. */
export function filtrerHorsBordereau<T extends Pick<TravailHorsBordereau, 'jour' | 'secteur_id' | 'nature'>>(lignes: T[], f: FiltresHorsBordereau): T[] {
  const [du, au] = f.du && f.au && f.du > f.au ? [f.au, f.du] : [f.du, f.au];
  return lignes.filter((l) => (!du || l.jour >= du) && (!au || l.jour <= au)
    && (!f.secteur || l.secteur_id === f.secteur) && (!f.nature || l.nature === f.nature));
}

/** Totaux par nature et par unité (une somme n'a de sens que pour une même unité). */
export function totauxHorsBordereau(lignes: Pick<TravailHorsBordereau, 'nature' | 'unite' | 'quantite' | 'fuite_id'>[]) {
  const m = new Map<string, { nature: NatureHorsBordereau; libelle: string; unite: string; quantite: number; lignes: number; fuites: Set<string> }>();
  lignes.forEach((l) => {
    const cle = `${l.nature}|${l.unite}`;
    const e = m.get(cle) ?? { nature: l.nature, libelle: NATURES_HORS_BORDEREAU[l.nature] ?? l.nature, unite: l.unite, quantite: 0, lignes: 0, fuites: new Set<string>() };
    e.quantite = Math.round((e.quantite + Number(l.quantite)) * 1000) / 1000;
    e.lignes += 1;
    e.fuites.add(l.fuite_id);
    m.set(cle, e);
  });
  return [...m.values()]
    .map((e) => ({ nature: e.nature, libelle: e.libelle, unite: e.unite, quantite: e.quantite, lignes: e.lignes, fuites: e.fuites.size }))
    .sort((a, b) => ORDRE_NATURES.indexOf(a.nature) - ORDRE_NATURES.indexOf(b.nature) || a.unite.localeCompare(b.unite));
}

/** Tri de la liste et de l'export : nature, puis N° de fuite, puis désignation. */
export function trierHorsBordereau<T extends Pick<TravailHorsBordereau, 'nature' | 'fuite_numero' | 'designation'>>(lignes: T[]): T[] {
  return [...lignes].sort((a, b) => ORDRE_NATURES.indexOf(a.nature) - ORDRE_NATURES.indexOf(b.nature)
    || a.fuite_numero - b.fuite_numero || a.designation.localeCompare(b.designation, 'fr'));
}

const dateFr = (jour: string) => (/^\d{4}-\d{2}-\d{2}$/.test(jour) ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` : jour);

/** Période lisible pour l'en-tête de l'export. */
export function libellePeriodeHb(f: FiltresHorsBordereau): string {
  if (f.du && f.au) return `Réparations du ${dateFr(f.du <= f.au ? f.du : f.au)} au ${dateFr(f.du <= f.au ? f.au : f.du)}`;
  if (f.du) return `Réparations à partir du ${dateFr(f.du)}`;
  if (f.au) return `Réparations jusqu'au ${dateFr(f.au)}`;
  return 'Toutes les réparations';
}

/** Ligne prête pour le moteur d'export (Excel, PDF, Word, CSV). */
export type LigneExportHb = TravailHorsBordereau & { nature_libelle: string; origine_piece: string };

export function lignesExportHorsBordereau(lignes: TravailHorsBordereau[]): LigneExportHb[] {
  return trierHorsBordereau(lignes).map((l) => ({
    ...l,
    nature_libelle: NATURES_HORS_BORDEREAU[l.nature] ?? l.libelle,
    origine_piece: l.ajoutee_bureau == null ? '' : l.ajoutee_bureau ? 'Ajoutée au bureau' : 'Déclarée sur le terrain',
  }));
}

export const COLONNES_EXPORT_HB: Colonne<LigneExportHb>[] = [
  { cle: 'fuite_numero', titre: 'N° fuite', groupe: 'Fuite', type: 'nombre', largeur: 8 },
  { cle: 'reference_srm', titre: 'Référence', groupe: 'Fuite', largeur: 13 },
  { cle: 'secteur', titre: 'Secteur', groupe: 'Fuite', largeur: 16 },
  { cle: 'jour', titre: 'Réparée le', groupe: 'Réparation', type: 'date', largeur: 11 },
  { cle: 'designation', titre: 'Désignation', groupe: 'Travaux', largeur: 40 },
  { cle: 'quantite', titre: 'Quantité', groupe: 'Travaux', type: 'quantite', uniteCle: 'unite', total: true, largeur: 10 },
  { cle: 'unite', titre: 'Unité', groupe: 'Travaux', largeur: 6 },
  { cle: 'origine_piece', titre: 'Pièce', groupe: 'Travaux', largeur: 18 },
];

/** Libellé du groupe d'une ligne exportée (une section par nature de travaux). */
export const groupeExportHb = (l: Pick<LigneExportHb, 'nature_libelle'>) => l.nature_libelle;

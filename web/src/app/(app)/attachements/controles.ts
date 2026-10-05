// Contrôles de cohérence à l'attachement (vue v_controles_attachement), travaux hors bordereau
// à faire valoir (vue v_hors_bordereau) et pièces posées (terrain, corrections du bureau) : logique
// pure, sans navigateur ni réseau. Seuls des imports de types : le script
// scripts/verifier-controles-attachement.mjs charge ce fichier avec Node.
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
  pe_superieur_2m: 'PE au-delà du seuil',
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
// Polyéthylène au-delà du seuil du marché (marches.longueur_pe_max_m, 2 m par défaut ; même
// calcul que la base : longueur − seuil, jamais négatif)
// ---------------------------------------------------------------------------
export const LONGUEUR_PE_MAX_DEFAUT_M = 2;

export function excedentPe(longueur: number | null | undefined, seuil: number | null | undefined = LONGUEUR_PE_MAX_DEFAUT_M): number {
  if (longueur == null || Number.isNaN(Number(longueur))) return 0;
  const s = seuil == null || Number.isNaN(Number(seuil)) || Number(seuil) <= 0 ? LONGUEUR_PE_MAX_DEFAUT_M : Number(seuil);
  return Math.max(0, Math.round((Number(longueur) - s) * 100) / 100);
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
  /** Pièce non couverte : déclarée sur le terrain, ou correction du bureau (et sa nature). */
  piece_provenance: ProvenancePiece | null;
  piece_nature_correction: NatureCorrection | null;
};

// Une seule chaîne littérale : supabase-js en déduit le type des lignes lues.
export const COLONNES_HORS_BORDEREAU = 'marche_id, nature, libelle, fuite_id, fuite_numero, reference_srm, adresse, zone_id, zone, secteur_id, secteur, reparation_id, realisee_le, jour, materiau, diametre_mm, designation, quantite, unite, piece_ligne_id, piece_provenance, piece_nature_correction';

export const NATURES_HORS_BORDEREAU: Record<NatureHorsBordereau, string> = {
  pe_au_dela_2m: 'Polyéthylène au-delà du seuil du marché',
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
    origine_piece: l.piece_provenance ? majuscule(libelleProvenance(l.piece_provenance, l.piece_nature_correction)) : '',
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

// ---------------------------------------------------------------------------
// Pièces posées : déclaration du terrain et corrections du bureau (lot R)
//  * terrain : saisie par l'auteur de la réparation (à tout moment, tablette ou web) ;
//  * correction du bureau : oubli, ou remplacement d'une pièce erronée (motif obligatoire) ;
//  * une pièce remplacée ou retirée reste en base (hors inventaire réel), barrée à l'affichage.
// Les fournitures sont comprises dans les prix : une pièce ne change jamais le montant.
// ---------------------------------------------------------------------------
export type ProvenancePiece = 'terrain' | 'correction';
export type NatureCorrection = 'oubli' | 'remplacement';
export type EtatPiece = 'posee' | 'remplacee' | 'retiree';

/** Ligne de reparation_pieces telle que la lisent l'écran « Corriger » et la fiche d'une fuite. */
export interface PieceLue {
  id: string;
  reparation_id: string;
  piece_id: string | null;
  designation_libre: string | null;
  quantite: number;
  provenance: ProvenancePiece;
  nature_correction: NatureCorrection | null;
  remplace_piece_id: string | null;
  motif_correction: string | null;
  etat: EtatPiece;
  etat_le: string | null;
  motif_retrait: string | null;
  cree_le: string;
}

export const COLONNES_PIECES =
  'id, reparation_id, piece_id, designation_libre, quantite, provenance, nature_correction, remplace_piece_id, motif_correction, etat, etat_le, motif_retrait, cree_le';

export const PHRASE_PIECE_AJOUTEE = 'Une pièce ajoutée doit avoir été posée ; pour changer le prix, requalifier la ligne de prix.';

export const ETATS_PIECE: Record<EtatPiece, string> = { posee: 'posée', remplacee: 'remplacée', retiree: 'retirée' };

const majuscule = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** « déclarée sur le terrain », « correction du bureau : oubli » ou « correction du bureau : remplacement ». */
export function libelleProvenance(provenance: ProvenancePiece | null | undefined, nature: NatureCorrection | null | undefined): string {
  if (provenance !== 'correction') return 'déclarée sur le terrain';
  return nature ? `correction du bureau : ${nature}` : 'correction du bureau';
}

/** Pièce prête à afficher (fiche, écran « Corriger ») ; gardée telle quelle dans la copie hors ligne de la fiche. */
export interface PieceAffichee {
  id: string;
  reparation_id: string;
  /** « Manchon droit 25/25 : 2 u » */
  texte: string;
  provenance: ProvenancePiece;
  nature: NatureCorrection | null;
  etat: EtatPiece;
  /** Motif de la correction (oubli, remplacement), du retrait, ou du remplacement subi. */
  motif: string | null;
  /** Remplacement : pièce remplacée. */
  remplace: string | null;
  /** Pièce remplacée : pièce qui la remplace. */
  remplaceePar: string | null;
  /** Date du remplacement ou du retrait. */
  le: string | null;
}

/**
 * Pièces dans l'ordre de saisie, chaque remplacement juste après la pièce qu'il remplace (la saisie
 * d'origine reste visible, barrée).
 */
export function decrirePieces(pieces: PieceLue[], texte: (p: PieceLue) => string): PieceAffichee[] {
  const parId = new Map(pieces.map((p) => [p.id, p]));
  const remplacante = new Map<string, PieceLue>();
  pieces.forEach((p) => {
    if (p.remplace_piece_id && parId.has(p.remplace_piece_id)) remplacante.set(p.remplace_piece_id, p);
  });
  const parDate = [...pieces].sort((a, b) => a.cree_le.localeCompare(b.cree_le) || a.id.localeCompare(b.id));
  const ordre: PieceLue[] = [];
  const vues = new Set<string>();
  const suivre = (p: PieceLue | undefined) => {
    for (let x = p; x && !vues.has(x.id); x = remplacante.get(x.id)) {
      vues.add(x.id);
      ordre.push(x);
    }
  };
  parDate.filter((p) => !p.remplace_piece_id || !parId.has(p.remplace_piece_id)).forEach(suivre);
  parDate.forEach(suivre);
  return ordre.map((p) => {
    const nouvelle = remplacante.get(p.id);
    const ancienne = p.remplace_piece_id ? parId.get(p.remplace_piece_id) : undefined;
    return {
      id: p.id,
      reparation_id: p.reparation_id,
      texte: texte(p),
      provenance: p.provenance,
      nature: p.nature_correction,
      etat: p.etat,
      motif: p.etat === 'retiree' ? p.motif_retrait : p.etat === 'remplacee' ? nouvelle?.motif_correction ?? null : p.motif_correction,
      remplace: ancienne ? texte(ancienne) : null,
      remplaceePar: p.etat === 'remplacee' && nouvelle ? texte(nouvelle) : null,
      le: p.etat === 'posee' ? null : p.etat_le,
    };
  });
}

/** Inventaire réel : pièces ni remplacées ni retirées. */
export const piecesReelles = <T extends Pick<PieceAffichee, 'etat'>>(pieces: T[]) => pieces.filter((p) => p.etat === 'posee');

/** Motif saisi pour une correction : obligatoire, sans espaces superflus. */
export const motifValide = (motif: string | null | undefined) => (motif ?? '').trim().length > 0;

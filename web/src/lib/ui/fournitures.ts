// Fournitures posées (vue v_inventaire_fournitures, lot P3) : types, libellés et calculs purs partagés par
// l'inventaire croisé (/fournitures), son export et le futur widget du tableau de bord. L'inventaire reflète le réel
// posé (v_pieces_reelles : pièces remplacées ou retirées exclues, corrections du bureau comprises) ; les fournitures
// sont comprises dans les prix de réparation : jamais de prix, jamais de référence Dolibarr, la désignation seule.
import { LIBELLES_FAMILLES } from '@/lib/nomenclature/csv';

export type Provenance = 'terrain' | 'correction';
export type NatureCorrection = 'oubli' | 'remplacement';

/** Une pièce de l'inventaire réel, telle que la donne la vue. */
export interface LigneInventaire {
  id: string;
  marche_id: string;
  reparation_id: string;
  fuite_id: string;
  fuite_numero: number;
  reference_srm: string | null;
  realisee_le: string;
  /** Jour de la réparation (AAAA-MM-JJ, heure du Maroc). */
  jour: string;
  /** Mois de la réparation (AAAA-MM). */
  mois: string;
  zone_id: string | null;
  zone: string | null;
  secteur_id: string | null;
  secteur: string | null;
  /** Chef d'équipe : compte qui a saisi la réparation (S12). */
  chef_id: string | null;
  chef: string | null;
  /** Article Dolibarr (rowid). */
  produit_id: number | null;
  designation: string;
  /** Famille du produit : préfixe de sa référence (RAC, CND, ROB…). */
  famille: string | null;
  unite: string;
  quantite: number;
  provenance: Provenance;
  nature_correction: NatureCorrection | null;
}

// Une seule chaîne littérale : supabase-js en déduit le type des lignes lues.
export const COLONNES_INVENTAIRE =
  'id, marche_id, reparation_id, fuite_id, fuite_numero, reference_srm, realisee_le, jour, mois, zone_id, zone, secteur_id, secteur, chef_id, chef, produit_id, designation, famille, unite, quantite, provenance, nature_correction';

export const LIBELLES_PROVENANCE: Record<Provenance, string> = { terrain: 'Terrain', correction: 'Correction du bureau' };
export const LIBELLES_NATURE: Record<NatureCorrection, string> = { oubli: 'oubli', remplacement: 'remplacement' };
export const SANS_FAMILLE = 'Sans famille';

/** « Terrain », « Correction du bureau (oubli) », « Correction du bureau (remplacement) ». */
export function libelleProvenance(l: Pick<LigneInventaire, 'provenance' | 'nature_correction'>): string {
  if (l.provenance !== 'correction') return LIBELLES_PROVENANCE.terrain;
  const nature = l.nature_correction ? LIBELLES_NATURE[l.nature_correction] ?? l.nature_correction : null;
  return nature ? `${LIBELLES_PROVENANCE.correction} (${nature})` : LIBELLES_PROVENANCE.correction;
}

/** « Raccords », « Conduites »… ; le code tel quel pour une famille sans libellé ; « Sans famille ». */
export const libelleFamille = (code: string | null | undefined) => (code ? LIBELLES_FAMILLES[code] ?? code : SANS_FAMILLE);

// ---------------------------------------------------------------------------
// Quantités par unité : une somme n'a de sens que pour une même unité (U, m, Barre…)
// ---------------------------------------------------------------------------
/** Unité → quantité. */
export type Quantites = Record<string, number>;

const ENTIERES = new Set(['u', 'U', 'p', 'set']);
export const decimalesUnite = (unite: string) => (ENTIERES.has(unite) ? 0 : unite === 'm3' ? 3 : 2);
const arrondi = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

/** Nouvelle somme : `q` n'est pas modifié. */
export function ajouterQuantite(q: Quantites, unite: string, quantite: number): Quantites {
  const u = unite || 'u';
  return { ...q, [u]: arrondi((q[u] ?? 0) + Number(quantite || 0), 3) };
}

export function sommerQuantites(lignes: Pick<LigneInventaire, 'unite' | 'quantite'>[]): Quantites {
  return lignes.reduce<Quantites>((q, l) => ajouterQuantite(q, l.unite, l.quantite), {});
}

/** Unités présentes : « U » (ou « u ») d'abord, puis par ordre alphabétique. */
export const unitesDe = (q: Quantites) =>
  Object.keys(q).sort((a, b) => (ENTIERES.has(a) && !ENTIERES.has(b) ? -1 : ENTIERES.has(b) && !ENTIERES.has(a) ? 1 : a.localeCompare(b, 'fr')));

/** Unité unique d'un ensemble de quantités, nulle si elles se mélangent (ou s'il n'y a rien). */
export const uniteUnique = (q: Quantites): string | null => {
  const u = Object.keys(q);
  return u.length === 1 ? u[0] : null;
};

export const formaterNombre = (n: number, decimales: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: decimales });

/** « 12 U », « 3,5 m ». */
export const formaterQuantite = (n: number, unite: string) => `${formaterNombre(n, decimalesUnite(unite))} ${unite}`;

/** « 12 U », « 12 U · 3,5 m » ; « — » sans quantité. */
export function formaterQuantites(q: Quantites): string {
  const unites = unitesDe(q);
  return unites.length ? unites.map((u) => formaterQuantite(q[u], u)).join(' · ') : '—';
}

// ---------------------------------------------------------------------------
// Mois (AAAA-MM)
// ---------------------------------------------------------------------------
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const moisValide = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

/** « oct. 2026 » (court) ou « octobre 2026 ». */
export function libelleMois(mois: string, long = false): string {
  if (!moisValide(mois)) return mois;
  const i = Number(mois.slice(5, 7)) - 1;
  return `${(long ? MOIS_LONGS : MOIS_COURTS)[i]} ${mois.slice(0, 4)}`;
}

/** Mois d'un jour (AAAA-MM-JJ → AAAA-MM). */
export const moisDe = (jour: string) => jour.slice(0, 7);

/** Mois successifs entre deux mois (bornes comprises), dans l'ordre. */
export function moisEntre(du: string, au: string): string[] {
  if (!moisValide(du) || !moisValide(au) || du > au) return [];
  const liste: string[] = [];
  let [a, m] = [Number(du.slice(0, 4)), Number(du.slice(5, 7))];
  for (let i = 0; i < 1200; i++) {
    const mois = `${a}-${String(m).padStart(2, '0')}`;
    liste.push(mois);
    if (mois >= au) break;
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return liste;
}

// ---------------------------------------------------------------------------
// Résumé : quantités, pièces, fuites, part des corrections, premiers articles
// ---------------------------------------------------------------------------
export interface ArticleResume {
  cle: string;
  designation: string;
  unite: string;
  quantite: number;
  pieces: number;
  fuites: number;
  famille: string | null;
}

export interface ResumeFournitures {
  /** Nombre de pièces saisies (lignes de l'inventaire réel). */
  pieces: number;
  fuites: number;
  quantites: Quantites;
  /** Pièces issues d'une correction du bureau (oubli ou remplacement), et leur part en %. */
  corrections: number;
  partCorrections: number | null;
  articles: ArticleResume[];
}

/** Clé d'un article : le produit Dolibarr, sinon la désignation et l'unité (ligne ancienne sans produit). */
export const cleArticle = (l: Pick<LigneInventaire, 'produit_id' | 'designation' | 'unite'>) =>
  l.produit_id != null ? `p${l.produit_id}` : `libre:${l.designation.trim().toLowerCase()}|${l.unite}`;

export function articlesParQuantite(lignes: LigneInventaire[]): ArticleResume[] {
  const m = new Map<string, ArticleResume & { ids: Set<string> }>();
  for (const l of lignes) {
    const cle = cleArticle(l);
    const a = m.get(cle) ?? { cle, designation: l.designation, unite: l.unite, quantite: 0, pieces: 0, fuites: 0, famille: l.famille, ids: new Set<string>() };
    a.quantite = arrondi(a.quantite + Number(l.quantite || 0), 3);
    a.pieces += 1;
    a.ids.add(l.fuite_id);
    m.set(cle, a);
  }
  return [...m.values()]
    .map(({ ids, ...a }) => ({ ...a, fuites: ids.size }))
    .sort((a, b) => b.quantite - a.quantite || b.pieces - a.pieces || a.designation.localeCompare(b.designation, 'fr', { numeric: true }));
}

export function resumeFournitures(lignes: LigneInventaire[], nbArticles = 5): ResumeFournitures {
  const corrections = lignes.filter((l) => l.provenance === 'correction').length;
  return {
    pieces: lignes.length,
    fuites: new Set(lignes.map((l) => l.fuite_id)).size,
    quantites: sommerQuantites(lignes),
    corrections,
    partCorrections: lignes.length ? arrondi((100 * corrections) / lignes.length, 1) : null,
    articles: articlesParQuantite(lignes).slice(0, nbArticles),
  };
}

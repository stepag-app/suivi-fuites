// Inventaire croisé des fournitures posées (/fournitures) : filtres rapides et leur forme dans l'adresse,
// période (12 mois au plus), croisement lignes × colonnes avec totaux, valeurs des filtres rapides, liens
// vers les fuites quand un filtre équivalent existe. Fonctions pures, sans navigateur ni réseau :
// scripts/verifier-inventaire-fournitures.mjs charge ce fichier avec Node (alias « @/ » résolu par le script).
//   /fournitures?lignes=article&colonnes=mois&du=AAAA-MM-JJ&au=AAAA-MM-JJ&zone=<uuid>&secteur=<uuid>
//               &equipe=<uuid>&famille=<code>&provenance=terrain|correction&fuite=<N°>
import {
  LIBELLES_PROVENANCE, SANS_FAMILLE, ajouterQuantite, cleArticle, formaterQuantites, libelleFamille, libelleMois, libelleProvenance,
  moisDe, moisEntre, uniteUnique,
  type LigneInventaire, type Provenance, type Quantites,
} from '@/lib/ui/fournitures';
import { lienFuites } from '../fuites/filtres';

export type DimensionLigne = 'article' | 'famille' | 'secteur' | 'zone' | 'equipe' | 'fuite' | 'mois';
export type DimensionColonne = 'aucune' | 'mois' | 'secteur' | 'equipe' | 'provenance';
type Dimension = DimensionLigne | DimensionColonne;

export const DIMENSIONS_LIGNES: [DimensionLigne, string][] = [
  ['article', 'Article'], ['famille', 'Famille'], ['secteur', 'Secteur'], ['zone', 'Zone'], ['equipe', 'Équipe'],
  ['fuite', 'Fuite'], ['mois', 'Mois'],
];
export const DIMENSIONS_COLONNES: [DimensionColonne, string][] = [
  ['aucune', 'Aucune'], ['mois', 'Mois'], ['secteur', 'Secteur'], ['equipe', 'Équipe'], ['provenance', 'Provenance'],
];
const LIBELLE_DIMENSION = Object.fromEntries([...DIMENSIONS_LIGNES, ...DIMENSIONS_COLONNES]) as Record<Dimension, string>;
export const libelleDimension = (d: Dimension) => LIBELLE_DIMENSION[d];

/** Valeur du filtre « famille » pour les pièces sans famille. */
export const CLE_SANS_FAMILLE = '-';

export interface FiltresInventaire {
  lignes: DimensionLigne;
  colonnes: DimensionColonne;
  /** Jour de réparation (AAAA-MM-JJ, heure du Maroc), bornes comprises ; '' = période par défaut (voir `periodeEffective`). */
  du: string;
  au: string;
  /** Identifiants (uuid) ; '' = tous. */
  zone: string;
  secteur: string;
  equipe: string;
  /** Code de famille (préfixe de la référence Dolibarr), `CLE_SANS_FAMILLE`, ou ''. */
  famille: string;
  provenance: Provenance | '';
  /** Numéro de fuite ; '' = toutes. */
  fuite: string;
}

export const FILTRES_VIDES: FiltresInventaire = {
  lignes: 'article', colonnes: 'aucune', du: '', au: '', zone: '', secteur: '', equipe: '', famille: '', provenance: '', fuite: '',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FORME_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
const FAMILLE_MAX = 60;
export const MOIS_MAX = 12;

// Jour du calendrier réel (pas de 31 avril), années 2000 à 2999.
export function jourValide(v: string): boolean {
  const m = FORME_JOUR.exec(v);
  if (!m) return false;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  return a >= 2000 && a <= 2999 && d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
}

const estLigne = (v: string): v is DimensionLigne => DIMENSIONS_LIGNES.some(([d]) => d === v);
const estColonne = (v: string): v is DimensionColonne => DIMENSIONS_COLONNES.some(([d]) => d === v);
const uuidOuVide = (v: string | undefined) => {
  const t = (v ?? '').trim().toLowerCase();
  return UUID.test(t) ? t : '';
};

export type FiltresBruts = Partial<Record<keyof FiltresInventaire, string>>;

/** Forme canonique : valeurs inconnues retirées, période dans l'ordre, numéro de fuite entier. */
export function normaliser(f: FiltresBruts): FiltresInventaire {
  const lignes = (f.lignes ?? '').trim();
  const colonnes = (f.colonnes ?? '').trim();
  const [d, a] = [(f.du ?? '').trim(), (f.au ?? '').trim()].map((j) => (jourValide(j) ? j : ''));
  const [du, au] = d && a && d > a ? [a, d] : [d, a];
  const provenance = (f.provenance ?? '').trim();
  const fuite = (f.fuite ?? '').trim().replace(/^N°\s*/i, '');
  return {
    lignes: estLigne(lignes) ? lignes : 'article',
    colonnes: estColonne(colonnes) ? colonnes : 'aucune',
    du,
    au,
    zone: uuidOuVide(f.zone),
    secteur: uuidOuVide(f.secteur),
    equipe: uuidOuVide(f.equipe),
    famille: (f.famille ?? '').trim().slice(0, FAMILLE_MAX),
    provenance: provenance === 'terrain' || provenance === 'correction' ? provenance : '',
    fuite: /^\d{1,9}$/.test(fuite) && Number(fuite) > 0 ? String(Number(fuite)) : '',
  };
}

type Parametres = { get(nom: string): string | null };

/** Filtres lus dans l'adresse (chaîne « a=1&b=2 », avec ou sans « ? », ou URLSearchParams). */
export function lireFiltres(source: string | Parametres): FiltresInventaire {
  const p = typeof source === 'string' ? new URLSearchParams(source) : source;
  const v = (nom: string) => p.get(nom) ?? '';
  return normaliser({
    lignes: v('lignes'), colonnes: v('colonnes'), du: v('du'), au: v('au'), zone: v('zone'), secteur: v('secteur'),
    equipe: v('equipe'), famille: v('famille'), provenance: v('provenance'), fuite: v('fuite'),
  });
}

/** Paramètres de l'adresse, dans un ordre fixe, sans les valeurs par défaut ni les filtres vides. */
export function ecrireFiltres(f: FiltresBruts): string {
  const n = normaliser(f);
  const p = new URLSearchParams();
  if (n.lignes !== 'article') p.set('lignes', n.lignes);
  if (n.colonnes !== 'aucune') p.set('colonnes', n.colonnes);
  if (n.du) p.set('du', n.du);
  if (n.au) p.set('au', n.au);
  if (n.zone) p.set('zone', n.zone);
  if (n.secteur) p.set('secteur', n.secteur);
  if (n.equipe) p.set('equipe', n.equipe);
  if (n.famille) p.set('famille', n.famille);
  if (n.provenance) p.set('provenance', n.provenance);
  if (n.fuite) p.set('fuite', n.fuite);
  return p.toString();
}

/** Lien vers l'inventaire filtré (tableau de bord : période du tableau de bord). */
export function lienFournitures(f: FiltresBruts = {}): string {
  const q = ecrireFiltres(f);
  return q ? `/fournitures?${q}` : '/fournitures';
}

export const memesFiltres = (a: FiltresBruts, b: FiltresBruts) => ecrireFiltres(a) === ecrireFiltres(b);

/** Un filtre rapide est posé (la période et les dimensions n'en sont pas). */
export const filtresRapidesActifs = (f: FiltresInventaire) =>
  !!(f.zone || f.secteur || f.equipe || f.famille || f.provenance || f.fuite);

// ---------------------------------------------------------------------------
// Période effective : 12 mois au plus, mois en cours par défaut (jours à l'heure du Maroc)
// ---------------------------------------------------------------------------
export interface Periode { du: string; au: string }

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' });
export const jourCasa = (d: Date | string | number) => FORMAT_JOUR.format(new Date(d));

const dateUtc = (jour: string) => new Date(`${jour}T00:00:00Z`);
export function ajouterJours(jour: string, n: number): string {
  const d = dateUtc(jour);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const debutDeMois = (jour: string) => `${jour.slice(0, 7)}-01`;
export function finDeMois(jour: string): string {
  const d = dateUtc(debutDeMois(jour));
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}
/** Même jour `n` mois plus tard (ou plus tôt), ramené au dernier jour du mois s'il n'existe pas. */
export function ajouterMois(jour: string, n: number): string {
  const d = dateUtc(jour);
  const cible = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(d.getUTCDate(), dernier));
  return cible.toISOString().slice(0, 10);
}

/**
 * Bornes lues : les deux dates → telles quelles, ramenées à 12 mois au plus (le début avance) ; une seule
 * date → son mois entier ; aucune → le mois en cours.
 */
export function periodeEffective(f: Pick<FiltresInventaire, 'du' | 'au'>, maintenant: Date | string = new Date()): Periode {
  const auj = jourCasa(maintenant);
  if (!f.du && !f.au) return { du: debutDeMois(auj), au: finDeMois(auj) };
  if (f.du && !f.au) return { du: f.du, au: finDeMois(f.du) };
  if (!f.du && f.au) return { du: debutDeMois(f.au), au: f.au };
  const [du, au] = f.du <= f.au ? [f.du, f.au] : [f.au, f.du];
  const plancher = ajouterJours(ajouterMois(au, -MOIS_MAX), 1);
  return { du: du < plancher ? plancher : du, au };
}

const jourFr = (j: string) => `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}`;

/** « octobre 2026 », « le 05/10/2026 » ou « du 01/09/2026 au 15/10/2026 ». */
export function libellePeriode(p: Periode): string {
  if (p.du === debutDeMois(p.du) && p.au === finDeMois(p.du)) return libelleMois(moisDe(p.du), true);
  if (p.du === p.au) return `le ${jourFr(p.du)}`;
  return `du ${jourFr(p.du)} au ${jourFr(p.au)}`;
}

// ---------------------------------------------------------------------------
// Filtres rapides : application et valeurs disponibles
// ---------------------------------------------------------------------------
type Rapide = 'zone' | 'secteur' | 'equipe' | 'famille' | 'provenance' | 'fuite';
const RAPIDES: Rapide[] = ['zone', 'secteur', 'equipe', 'famille', 'provenance', 'fuite'];

const codeFamille = (l: Pick<LigneInventaire, 'famille'>) => l.famille ?? CLE_SANS_FAMILLE;

function correspond(l: LigneInventaire, f: FiltresInventaire, sauf?: Rapide): boolean {
  for (const r of RAPIDES) {
    if (r === sauf || !f[r]) continue;
    if (r === 'zone' && l.zone_id !== f.zone) return false;
    if (r === 'secteur' && l.secteur_id !== f.secteur) return false;
    if (r === 'equipe' && l.equipe_id !== f.equipe) return false;
    if (r === 'famille' && codeFamille(l) !== f.famille) return false;
    if (r === 'provenance' && l.provenance !== f.provenance) return false;
    if (r === 'fuite' && String(l.fuite_numero) !== f.fuite) return false;
  }
  return true;
}

/** Lignes de la période (déjà lues) qui passent les filtres rapides. */
export const appliquerFiltres = (lignes: LigneInventaire[], f: FiltresInventaire) => lignes.filter((l) => correspond(l, f));

export interface ValeurFiltre {
  cle: string;
  libelle: string;
  /** Pièces (lignes) que donnerait ce choix, les autres filtres rapides gardés. */
  pieces: number;
  quantites: Quantites;
  choisie: boolean;
}

const SANS: Record<Exclude<Rapide, 'fuite' | 'provenance'>, string> = {
  zone: 'Sans zone', secteur: 'Sans secteur', equipe: 'Sans équipe', famille: SANS_FAMILLE,
};

export interface EnteteCroise { cle: string; libelle: string; detail: string | null }

function cleEtLibelle(l: LigneInventaire, dimension: Dimension | Rapide): EnteteCroise {
  switch (dimension) {
    case 'article': return { cle: cleArticle(l), libelle: l.designation, detail: l.famille ? libelleFamille(l.famille) : null };
    case 'famille': return { cle: codeFamille(l), libelle: libelleFamille(l.famille), detail: null };
    case 'secteur': return { cle: l.secteur_id ?? '', libelle: l.secteur ?? SANS.secteur, detail: l.zone };
    case 'zone': return { cle: l.zone_id ?? '', libelle: l.zone ?? SANS.zone, detail: null };
    case 'equipe': return { cle: l.equipe_id ?? '', libelle: l.equipe ?? SANS.equipe, detail: null };
    case 'fuite': return { cle: l.fuite_id, libelle: `N° ${l.fuite_numero}`, detail: [l.reference_srm, l.secteur].filter(Boolean).join(' · ') || null };
    case 'mois': return { cle: l.mois, libelle: libelleMois(l.mois), detail: null };
    case 'provenance': return { cle: l.provenance, libelle: LIBELLES_PROVENANCE[l.provenance] ?? l.provenance, detail: null };
    default: return { cle: '', libelle: 'Quantité', detail: null };
  }
}

const parLibelle = (a: { libelle: string }, b: { libelle: string }) => a.libelle.localeCompare(b.libelle, 'fr', { numeric: true });

/**
 * Valeurs d'un filtre rapide : toutes celles présentes sur la période, avec le nombre de pièces qu'elles
 * donneraient compte tenu des autres filtres (la valeur choisie reste proposée même sans pièce).
 * Secteurs : seulement ceux de la zone choisie ; les pièces sans zone, secteur ou équipe n'ont pas de puce.
 */
export function valeursFiltre(lignes: LigneInventaire[], f: FiltresInventaire, dimension: Exclude<Rapide, 'fuite'>): ValeurFiltre[] {
  const m = new Map<string, ValeurFiltre>();
  for (const l of lignes) {
    if (dimension === 'secteur' && f.zone && l.zone_id !== f.zone) continue;
    const { cle, libelle } = cleEtLibelle(l, dimension);
    // Sans zone, secteur ou équipe : pas de filtre équivalent, pas de puce.
    if (cle === '') continue;
    const v = m.get(cle) ?? { cle, libelle, pieces: 0, quantites: {}, choisie: f[dimension] === cle };
    if (correspond(l, f, dimension)) {
      v.pieces += 1;
      v.quantites = ajouterQuantite(v.quantites, l.unite, l.quantite);
    }
    m.set(cle, v);
  }
  if (f[dimension] && !m.has(f[dimension])) {
    m.set(f[dimension], { cle: f[dimension], libelle: 'Choix hors période', pieces: 0, quantites: {}, choisie: true });
  }
  const sans = dimension === 'famille' ? CLE_SANS_FAMILLE : '';
  return [...m.values()].sort((a, b) => (a.cle === sans ? 1 : b.cle === sans ? -1 : 0) || parLibelle(a, b));
}

// ---------------------------------------------------------------------------
// Croisement lignes × colonnes
// ---------------------------------------------------------------------------
export interface Cellule {
  quantites: Quantites;
  pieces: number;
  fuites: number;
  /** « 12 u », « 12 u · 3,5 ml », « — ». */
  texte: string;
  /** Seule fuite des pièces de la cellule (lien vers sa fiche quand la fuite est imposée). */
  fuite: { id: string; numero: number } | null;
  /** Seul secteur des pièces de la cellule (lien vers la liste quand le secteur est imposé). */
  secteur: { id: string; libelle: string } | null;
}

export interface Lien { href: string; libelle: string }

export interface LigneCroisee extends EnteteCroise {
  cellules: Cellule[];
  total: Cellule;
}

export interface Croisement {
  lignes: DimensionLigne;
  colonnes: DimensionColonne;
  entetes: EnteteCroise[];
  corps: LigneCroisee[];
  totaux: Cellule[];
  total: Cellule;
  /** Unité commune à tout le tableau, nulle si les unités se mélangent (ou sans pièce). */
  unite: string | null;
}

const CELLULE_VIDE: Cellule = { quantites: {}, pieces: 0, fuites: 0, texte: '—', fuite: null, secteur: null };

function cellule(lignes: LigneInventaire[]): Cellule {
  if (!lignes.length) return CELLULE_VIDE;
  const quantites = lignes.reduce<Quantites>((q, l) => ajouterQuantite(q, l.unite, l.quantite), {});
  const fuites = new Map(lignes.map((l) => [l.fuite_id, l.fuite_numero]));
  const secteurs = new Map(lignes.filter((l) => l.secteur_id).map((l) => [l.secteur_id as string, l.secteur ?? '']));
  return {
    quantites, pieces: lignes.length, fuites: fuites.size, texte: formaterQuantites(quantites),
    fuite: fuites.size === 1 ? { id: [...fuites.keys()][0], numero: [...fuites.values()][0] } : null,
    secteur: secteurs.size === 1 && lignes.every((l) => l.secteur_id) ? { id: [...secteurs.keys()][0], libelle: [...secteurs.values()][0] } : null,
  };
}

function trierEntetes(dimension: Dimension, entetes: EnteteCroise[], lignes: LigneInventaire[]): EnteteCroise[] {
  if (dimension === 'mois') {
    // Tous les mois de la plage, même sans pièce
    const mois = lignes.map((l) => l.mois).sort();
    const tous = mois.length ? moisEntre(mois[0], mois[mois.length - 1]) : [];
    const connus = new Map(entetes.map((e) => [e.cle, e]));
    return tous.map((m) => connus.get(m) ?? { cle: m, libelle: libelleMois(m), detail: null });
  }
  if (dimension === 'provenance') return [...entetes].sort((a, b) => (a.cle === 'terrain' ? -1 : b.cle === 'terrain' ? 1 : 0));
  if (dimension === 'fuite') {
    const numero = new Map(lignes.map((l) => [l.fuite_id, l.fuite_numero]));
    return [...entetes].sort((a, b) => (numero.get(a.cle) ?? 0) - (numero.get(b.cle) ?? 0));
  }
  const sans = dimension === 'famille' ? CLE_SANS_FAMILLE : '';
  return [...entetes].sort((a, b) => (a.cle === sans ? 1 : b.cle === sans ? -1 : 0) || parLibelle(a, b));
}

const SEPARATEUR = '\u0000';

/** Croisement des lignes déjà filtrées : une ligne par valeur de `f.lignes`, une colonne par valeur de `f.colonnes`. */
export function croiser(lignes: LigneInventaire[], f: Pick<FiltresInventaire, 'lignes' | 'colonnes'>): Croisement {
  const entetesL = new Map<string, EnteteCroise>();
  const entetesC = new Map<string, EnteteCroise>();
  const paquets = new Map<string, LigneInventaire[]>();
  const parColonne = new Map<string, LigneInventaire[]>();
  for (const l of lignes) {
    const el = cleEtLibelle(l, f.lignes);
    const ec = cleEtLibelle(l, f.colonnes);
    if (!entetesL.has(el.cle)) entetesL.set(el.cle, el);
    if (!entetesC.has(ec.cle)) entetesC.set(ec.cle, ec);
    const k = `${el.cle}${SEPARATEUR}${ec.cle}`;
    paquets.set(k, [...(paquets.get(k) ?? []), l]);
    parColonne.set(ec.cle, [...(parColonne.get(ec.cle) ?? []), l]);
  }
  const entetes = f.colonnes === 'aucune'
    ? [{ cle: '', libelle: 'Quantité', detail: null }]
    : trierEntetes(f.colonnes, [...entetesC.values()], lignes);
  const corps: LigneCroisee[] = trierEntetes(f.lignes, [...entetesL.values()], lignes).map((e) => {
    const paquetsLigne = entetes.map((c) => paquets.get(`${e.cle}${SEPARATEUR}${c.cle}`) ?? []);
    return { ...e, cellules: paquetsLigne.map(cellule), total: cellule(paquetsLigne.flat()) };
  });
  const total = cellule(lignes);
  return {
    lignes: f.lignes, colonnes: f.colonnes, entetes, corps,
    totaux: entetes.map((c) => cellule(parColonne.get(c.cle) ?? [])),
    total,
    unite: uniteUnique(total.quantites),
  };
}

// ---------------------------------------------------------------------------
// Liens vers les fuites : seulement quand un filtre équivalent existe.
//  * la fuite est imposée (ligne « Fuite » ou filtre N°) et la cellule n'en a qu'une → sa fiche ;
//  * le secteur est imposé (ligne ou colonne « Secteur », filtre rapide) et la cellule n'en a qu'un → la liste
//    des fuites de ce secteur, toutes dates (la liste filtre sur la date de détection, l'inventaire sur celle
//    de la réparation : pas d'équivalent pour la période).
// ---------------------------------------------------------------------------
export function lienCellule(
  c: Pick<Croisement, 'lignes' | 'colonnes'>, f: Pick<FiltresInventaire, 'secteur' | 'fuite'>,
  ligne: Pick<EnteteCroise, 'cle'> | null, colonne: Pick<EnteteCroise, 'cle'> | null, cellule: Cellule,
): Lien | null {
  if (cellule.pieces === 0) return null;
  const imposeFuite = (ligne != null && c.lignes === 'fuite') || !!f.fuite;
  const imposeSecteur = (ligne != null && c.lignes === 'secteur' && !!ligne.cle)
    || (colonne != null && c.colonnes === 'secteur' && !!colonne.cle) || !!f.secteur;
  if (imposeFuite && cellule.fuite) {
    return { href: `/fuites/${cellule.fuite.id}`, libelle: `Ouvrir la fiche de la fuite N° ${cellule.fuite.numero}` };
  }
  if (imposeSecteur && cellule.secteur) {
    return {
      href: lienFuites({ secteur: cellule.secteur.id }),
      libelle: `Ouvrir la liste des fuites du secteur ${cellule.secteur.libelle} (toutes dates)`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Description des filtres (sous-titre de la page, en-tête de l'export)
// ---------------------------------------------------------------------------
export interface Libelles { zone?: string; secteur?: string; equipe?: string; famille?: string }

export function decrireFiltres(f: FiltresInventaire, periode: Periode, libelles: Libelles = {}): string[] {
  const lignes = [`Réparations ${libellePeriode(periode)}`];
  if (f.zone) lignes.push(`Zone : ${libelles.zone ?? f.zone}`);
  if (f.secteur) lignes.push(`Secteur : ${libelles.secteur ?? f.secteur}`);
  if (f.equipe) lignes.push(`Équipe : ${libelles.equipe ?? f.equipe}`);
  if (f.famille) lignes.push(`Famille : ${libelles.famille ?? (f.famille === CLE_SANS_FAMILLE ? SANS_FAMILLE : f.famille)}`);
  if (f.provenance) lignes.push(`Provenance : ${LIBELLES_PROVENANCE[f.provenance]}`);
  if (f.fuite) lignes.push(`Fuite N° ${f.fuite}`);
  return lignes;
}

/** Libellés des valeurs choisies, trouvés dans les lignes de la période. */
export function libellesChoisis(lignes: LigneInventaire[], f: FiltresInventaire): Libelles {
  const trouver = (pred: (l: LigneInventaire) => boolean, valeur: (l: LigneInventaire) => string | null) => {
    const l = lignes.find(pred);
    return l ? valeur(l) ?? undefined : undefined;
  };
  return {
    zone: f.zone ? trouver((l) => l.zone_id === f.zone, (l) => l.zone) : undefined,
    secteur: f.secteur ? trouver((l) => l.secteur_id === f.secteur, (l) => l.secteur) : undefined,
    equipe: f.equipe ? trouver((l) => l.equipe_id === f.equipe, (l) => l.equipe) : undefined,
    famille: f.famille ? trouver((l) => codeFamille(l) === f.famille, (l) => libelleFamille(l.famille)) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Détail pour l'export : lignes de l'inventaire avec leurs libellés lisibles
// ---------------------------------------------------------------------------
export type LigneDetailExport = LigneInventaire & { provenance_libelle: string; famille_libelle: string };

export function lignesDetailExport(lignes: LigneInventaire[]): LigneDetailExport[] {
  return [...lignes]
    .sort((a, b) => a.jour.localeCompare(b.jour) || a.fuite_numero - b.fuite_numero
      || a.designation.localeCompare(b.designation, 'fr', { numeric: true }) || a.id.localeCompare(b.id))
    .map((l) => ({ ...l, provenance_libelle: libelleProvenance(l), famille_libelle: libelleFamille(l.famille) }));
}

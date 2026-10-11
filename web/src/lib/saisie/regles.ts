// Règles de saisie du panneau (chantier v2 : V1 à V6, F1, P1 à P9, R7) : fonctions pures, sans navigateur
// ni réseau. La base reste juge (docs/lots/chantier-v2-base-s1.md et -s2.md) : ces règles grisent les
// boutons et préviennent avant l'envoi, elles ne remplacent aucun contrôle.
// Seuls des imports de types : scripts/verifier-saisie.mjs charge ce fichier directement avec Node.
import type { Action, TypeDonnee } from '@/lib/types';
import { heureMurale, instantMaroc } from '../heure-maroc.ts';

export type Peut = (type: TypeDonnee, action: Action) => boolean;
export type Etape = 'detection' | 'reparation' | 'refection';

/** Type de donnée (droits) de chaque étape. */
export const TYPE_ETAPE: Record<Etape, TypeDonnee> = {
  detection: 'fuites',
  reparation: 'interventions',
  refection: 'refections',
};

export const LIBELLE_ETAPE: Record<Etape, string> = {
  detection: 'Détection',
  reparation: 'Réparation',
  refection: 'Réfection',
};

/** Nombre saisi au clavier (« 0,80 », « 1.5 », «  2 ») ; vide ou illisible : null. */
export function lireNombre(t: string | number | null | undefined): number | null {
  if (t == null) return null;
  if (typeof t === 'number') return Number.isFinite(t) ? t : null;
  const s = t.trim().replace(/\s/g, '').replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Initiale en minuscule, sigles gardés (« Référence SRM » → « référence SRM »). */
export const minusculeInitiale = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

/** Nombre affiché dans un champ (virgule décimale) ; null : vide. */
export const texteNombre = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

// ---------------------------------------------------------------------------------------------
// Champs obligatoires de la fuite (F1)
// ---------------------------------------------------------------------------------------------

export type ChampFuite =
  | 'reference_srm' | 'secteur_id' | 'ouvrage' | 'visibilite' | 'nature_degradation_id' | 'adresse' | 'diametre_mm' | 'materiau';

/** Champs exigés par le formulaire du panneau dans tous les cas (F1, réponse 7 d'Issam). */
export const CHAMPS_F1: ChampFuite[] = ['reference_srm', 'secteur_id', 'ouvrage', 'visibilite', 'nature_degradation_id'];

export const CHAMPS_FUITE: ChampFuite[] = [...CHAMPS_F1, 'adresse', 'diametre_mm', 'materiau'];

export function libelleChampFuite(champ: ChampFuite, libelleReference = 'Référence'): string {
  switch (champ) {
    case 'reference_srm': return libelleReference;
    case 'secteur_id': return 'Secteur';
    case 'ouvrage': return 'Ouvrage';
    case 'visibilite': return 'Visibilité';
    case 'nature_degradation_id': return 'Nature de dégradation';
    case 'adresse': return 'Adresse';
    case 'diametre_mm': return 'Diamètre';
    case 'materiau': return 'Matériau';
  }
}

/**
 * Champs exigés à l'écran : le jeu F1 et ceux que le marché coche en plus (`champs_obligatoires_fuite`).
 * La liste du marché règle aussi le contrôle de la base (APK comprise) ; vide pendant la transition.
 */
export function champsExiges(duMarche: readonly string[] | null | undefined): ChampFuite[] {
  const coches = new Set<string>([...CHAMPS_F1, ...(duMarche ?? [])]);
  return CHAMPS_FUITE.filter((c) => coches.has(c));
}

/** Champs exigés laissés vides (texte blanc = vide). */
export function champsManquants(valeurs: Partial<Record<ChampFuite, unknown>>, exiges: readonly ChampFuite[]): ChampFuite[] {
  return exiges.filter((c) => {
    const v = valeurs[c];
    return v == null || (typeof v === 'string' && v.trim() === '');
  });
}

// ---------------------------------------------------------------------------------------------
// Diamètres selon le matériau (P2)
// ---------------------------------------------------------------------------------------------

export interface DiametreMateriau { materiau: string; diametre_mm: number; actif: boolean }

/** Diamètres proposés pour un matériau (actifs, croissants, sans doublon) ; « autre » ou vide : saisie libre. */
export function diametresPour(liste: readonly DiametreMateriau[], materiau: string | null | undefined): number[] {
  if (!materiau || materiau === 'autre') return [];
  return [...new Set(liste.filter((d) => d.actif && d.materiau === materiau).map((d) => d.diametre_mm))].sort((a, b) => a - b);
}

/** Unité affichée du diamètre : DE pour le PE et le PPR, DN sinon. */
export const sigleDiametre = (materiau: string | null | undefined) =>
  materiau === 'polyethylene' || materiau === 'ppr' ? 'DE' : 'DN';

// ---------------------------------------------------------------------------------------------
// Gardes-fous (P6, P9) : avertissements, jamais de blocage
// ---------------------------------------------------------------------------------------------

/** Seuils plausibles (réponse 10 d'Issam) : fouille 10 × 3 × 3 m, réfection 30 m². */
export const SEUILS = { fouilleLongueur: 10, fouilleLargeur: 3, fouilleProfondeur: 3, refectionSurface: 30, refectionCote: 10 } as const;

export interface Avertissement { champ: string; message: string }

const m = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} m`;
const m2 = (n: number) => `${String(Math.round(n * 100) / 100).replace('.', ',')} m²`;

function plausible(champ: string, libelle: string, valeur: number | null, seuil: number): Avertissement[] {
  if (valeur == null) return [];
  if (valeur < 0) return [{ champ, message: `${libelle} négative : vérifiez la saisie.` }];
  if (valeur > seuil) {
    return [{ champ, message: `${libelle} de ${m(valeur)} : au-delà de ${m(seuil)}, vérifiez l'unité (mètres : ${m(valeur / 100)} ?).` }];
  }
  return [];
}

export interface SaisieReparation {
  resultat: 'reparee' | 'en_cours' | 'non_reparee';
  materiau: string;
  tuyauRepare: boolean;
  elementRemplace: boolean;
  longueurPose: number | null;
  fouilleLongueur: number | null;
  fouilleLargeur: number | null;
  fouilleProfondeur: number | null;
  emplacement: string;
  /** Nature du revêtement à refaire : réfection nécessaire ? (null : pas de nature choisie) */
  revetementARefaire: boolean | null;
}

/** La longueur de PE posée se saisit pour le polyéthylène, quand la conduite est réparée ou un élément remplacé. */
export const longueurPoseDemandee = (s: Pick<SaisieReparation, 'materiau' | 'tuyauRepare' | 'elementRemplace'>) =>
  s.materiau === 'polyethylene' && (s.tuyauRepare || s.elementRemplace);

export const aUneFouille = (s: Pick<SaisieReparation, 'fouilleLongueur' | 'fouilleLargeur'>) =>
  (s.fouilleLongueur ?? 0) > 0 && (s.fouilleLargeur ?? 0) > 0;

/**
 * Réfection appelée par la réparation (même règle que la base, private.refection_attendue) : réparée, ou
 * non réparée avec une fouille, hors terrain naturel, sur un revêtement à refaire (nature inconnue : oui).
 */
export function refectionAppelee(s: Pick<SaisieReparation, 'resultat' | 'emplacement' | 'revetementARefaire' | 'fouilleLongueur' | 'fouilleLargeur'>): boolean {
  if (s.resultat === 'en_cours') return false;
  if (s.resultat === 'non_reparee' && !aUneFouille(s)) return false;
  return s.emplacement !== 'terrain_naturel' && s.revetementARefaire !== false;
}

export function gardesFousReparation(s: SaisieReparation): Avertissement[] {
  const av: Avertissement[] = [
    ...plausible('fouille_longueur', 'Longueur de fouille', s.fouilleLongueur, SEUILS.fouilleLongueur),
    ...plausible('fouille_largeur', 'Largeur de fouille', s.fouilleLargeur, SEUILS.fouilleLargeur),
    ...plausible('fouille_profondeur', 'Profondeur de fouille', s.fouilleProfondeur, SEUILS.fouilleProfondeur),
  ];
  if ((s.fouilleLongueur ?? 0) > 2 && (s.fouilleLongueur ?? 0) <= SEUILS.fouilleLongueur && !s.elementRemplace) {
    av.push({ champ: 'fouille_longueur', message: 'Fouille de plus de 2 m : justifiez-la par un élément de conduite remplacé.' });
  }
  if (longueurPoseDemandee(s) && s.longueurPose != null && aUneFouille(s)) {
    const dims = [s.fouilleLongueur!, s.fouilleLargeur!];
    const petite = Math.min(...dims);
    const grande = Math.max(...dims);
    if (s.longueurPose < petite) {
      av.push({ champ: 'longueur_pose', message: `Longueur posée ${m(s.longueurPose)} : plus courte que la plus petite dimension de la fouille (${m(petite)}).` });
    } else if (s.longueurPose > grande) {
      av.push({ champ: 'longueur_pose', message: `Longueur posée ${m(s.longueurPose)} : plus longue que la plus grande dimension de la fouille (${m(grande)}).` });
    }
  }
  if (s.resultat === 'non_reparee' && aUneFouille(s) && refectionAppelee(s)) {
    av.push({ champ: 'resultat', message: 'Non réparée avec une fouille sur un revêtement : la réfection sera obligatoire (la fuite entre dans la liste des réfections).' });
  }
  return av;
}

export interface SaisieRefection {
  faite: boolean;
  longueur: number | null;
  largeur: number | null;
  /** Surfaces des autres réfections de la fuite (m²), hors celle-ci. */
  autresRefections: number[];
  /** Surfaces des fouilles des réparations de la fuite (m²). */
  fouilles: number[];
}

export const surface = (l: number | null | undefined, L: number | null | undefined) =>
  l == null || L == null ? null : Math.round(l * L * 1000) / 1000;

export function gardesFousRefection(s: SaisieRefection): Avertissement[] {
  if (!s.faite) return [];
  const av: Avertissement[] = [
    ...plausible('longueur', 'Longueur de réfection', s.longueur, SEUILS.refectionCote),
    ...plausible('largeur', 'Largeur de réfection', s.largeur, SEUILS.refectionCote),
  ];
  const ici = surface(s.longueur, s.largeur);
  if (ici != null && ici > SEUILS.refectionSurface) {
    av.push({ champ: 'surface', message: `Réfection de ${m2(ici)} : au-delà de ${m2(SEUILS.refectionSurface)}, vérifiez les dimensions.` });
  }
  const totalFouilles = s.fouilles.reduce((a, b) => a + b, 0);
  const totalRefections = s.autresRefections.reduce((a, b) => a + b, 0) + (ici ?? 0);
  if (ici != null && totalFouilles > 0 && totalRefections + 1e-9 < totalFouilles) {
    av.push({ champ: 'surface', message: `Réfections ${m2(totalRefections)} : moins que les fouilles de la fuite (${m2(totalFouilles)}).` });
  }
  return av;
}

// ---------------------------------------------------------------------------------------------
// Pièces posées en capsules (P3)
// ---------------------------------------------------------------------------------------------

export interface Article { id: number; designation: string; unite: string | null }

/** Mots qui désignent un matériau dans la désignation d'un article Dolibarr. */
const MOTS_MATERIAU: Record<string, RegExp> = {
  polyethylene: /\b(PE|PEHD|PEBD|POLYETHYLENE)\b/,
  pvc: /\bPVC\b/,
  amiante_ciment: /\b(AC|AMIANTE)\b/,
  fonte_ductile: /\b(FONTE|FD|GIBAULT|BRIDE)\b/,
  fonte_grise: /\b(FONTE|FG|GIBAULT|BRIDE)\b/,
  acier_galvanise: /\b(ACIER|GALVA|GALVANISE|LAITON)\b/,
  ppr: /\b(PPR)\b/,
};

const normaliser = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Le diamètre (mm) apparaît dans la désignation comme nombre isolé (« DE 32 », « DN100 », « Ø63 »). */
function mentionneDiametre(designation: string, diametre: number): boolean {
  return new RegExp(`(^|[^0-9])${diametre}([^0-9]|$)`).test(designation);
}

/**
 * Articles proposés en capsules : d'abord ceux qui citent le matériau et le diamètre, puis le diamètre seul,
 * puis le matériau seul ; à score égal, les plus utilisés du marché ; enfin les plus utilisés tout court.
 * Les articles déjà choisis restent dans la liste (le compteur s'y affiche).
 */
export function capsulesProposees(
  articles: readonly Article[],
  contexte: { materiau?: string | null; diametre?: number | null },
  usages: ReadonlyMap<number, number> = new Map(),
  max = 12,
): Article[] {
  const motif = contexte.materiau ? MOTS_MATERIAU[contexte.materiau] : undefined;
  const d = contexte.diametre ?? null;
  const notes = articles.map((a) => {
    const texte = normaliser(a.designation);
    const mat = motif ? motif.test(texte) : false;
    const dia = d != null && mentionneDiametre(texte, d);
    const score = (dia ? 2 : 0) + (mat ? 1 : 0);
    return { a, score, usage: usages.get(a.id) ?? 0 };
  });
  return notes
    .filter((n) => n.score > 0 || n.usage > 0)
    .sort((x, y) => y.score - x.score || y.usage - x.usage || x.a.designation.localeCompare(y.a.designation, 'fr'))
    .slice(0, max)
    .map((n) => n.a);
}

/** Articles dont la désignation contient tous les mots cherchés (sans accents ni casse). */
export function chercherArticles(articles: readonly Article[], recherche: string, max = 20): Article[] {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  return articles.filter((a) => {
    const t = normaliser(a.designation);
    return mots.every((mot) => t.includes(mot));
  }).slice(0, max);
}

export interface LignePiece { produit_id: number; designation: string; unite: string | null; quantite: number }

/** « + » sur une capsule : ajoute l'article ou augmente sa quantité ; « − » : diminue, retire à zéro. */
export function changerQuantite(lignes: readonly LignePiece[], article: Article, delta: number): LignePiece[] {
  const i = lignes.findIndex((l) => l.produit_id === article.id);
  if (i < 0) {
    return delta > 0 ? [...lignes, { produit_id: article.id, designation: article.designation, unite: article.unite, quantite: delta }] : [...lignes];
  }
  const q = Math.round((lignes[i].quantite + delta) * 1000) / 1000;
  return q <= 0 ? lignes.filter((_, j) => j !== i) : lignes.map((l, j) => (j === i ? { ...l, quantite: q } : l));
}

/** Pièces modifiées par rapport à la saisie d'origine (identifiant d'article → quantité). */
export function differencePieces(
  avant: readonly { id: string; produit_id: number; quantite: number }[],
  apres: readonly LignePiece[],
): { ajouts: LignePiece[]; changees: { id: string; ligne: LignePiece }[]; retirees: string[] } {
  const ajouts: LignePiece[] = [];
  const changees: { id: string; ligne: LignePiece }[] = [];
  const vus = new Set<string>();
  for (const l of apres) {
    const ancienne = avant.find((p) => p.produit_id === l.produit_id && !vus.has(p.id));
    if (!ancienne) {
      ajouts.push(l);
      continue;
    }
    vus.add(ancienne.id);
    if (ancienne.quantite !== l.quantite) changees.push({ id: ancienne.id, ligne: l });
  }
  const retirees = avant.filter((p) => !vus.has(p.id)).map((p) => p.id);
  return { ajouts, changees, retirees };
}

// ---------------------------------------------------------------------------------------------
// Droits par étape (V1, V2, V5, V6) et sur les photos (V3)
// ---------------------------------------------------------------------------------------------

export interface LigneEtape {
  auteur_terrain_id?: string | null;
  saisi_par?: string | null;
  validee_le?: string | null;
  cree_le?: string | null;
}

export const estAuteur = (ligne: LigneEtape, moi: string | null | undefined) =>
  !!moi && (ligne.auteur_terrain_id === moi || ligne.saisi_par === moi);

export interface DroitsEtape {
  valider: boolean;
  /** Modifier la saisie (l'étape elle-même). */
  modifier: boolean;
  /** Raison du refus, à afficher en infobulle du bouton grisé. */
  raison: string | null;
}

/**
 * Ce que le compte peut faire sur une étape : valider (droit « valider », une seule fois) ; modifier tant
 * qu'elle n'est pas validée s'il en est l'auteur (droit « modifier siennes ») ; après validation, seul le
 * droit « valider » modifie (l'agent ajoute un nouvel élément). Fuite verrouillée : ce qui précède le
 * verrou est figé pour l'agent (V6 : il ajoute seulement).
 */
export function droitsEtape(
  etape: Etape,
  ligne: LigneEtape,
  contexte: { moi: string | null | undefined; peut: Peut; verrouilleeLe?: string | null },
): DroitsEtape {
  const type = TYPE_ETAPE[etape];
  const peutValider = contexte.peut(type, 'valider');
  const valide = !!ligne.validee_le;
  if (!contexte.peut(type, 'modifier')) {
    return { valider: peutValider && !valide, modifier: false, raison: 'Modification non autorisée pour votre compte' };
  }
  if (peutValider) return { valider: !valide, modifier: true, raison: null };
  if (!estAuteur(ligne, contexte.moi)) {
    return { valider: false, modifier: false, raison: 'Saisie d\'un autre agent : modification réservée au responsable' };
  }
  if (valide) {
    return { valider: false, modifier: false, raison: 'Étape validée : ajoutez un nouvel élément, il sera à valider' };
  }
  const verrou = contexte.verrouilleeLe;
  if (verrou && etape !== 'detection' && (!ligne.cree_le || ligne.cree_le <= verrou)) {
    return { valider: false, modifier: false, raison: 'Fuite verrouillée par un lot : ajoutez un nouvel élément' };
  }
  if (verrou && etape === 'detection') {
    return { valider: false, modifier: false, raison: 'Fuite verrouillée : modification réservée au responsable' };
  }
  return { valider: false, modifier: true, raison: null };
}

export interface PhotoEtape {
  auteur_terrain_id?: string | null;
  saisi_par?: string | null;
  cree_le?: string | null;
}

/**
 * Photo (V3) : changer le type, retirer. Déposée avant la validation de son étape : réservée au droit
 * « photos / valider » ; après : l'auteur selon ses droits (« siennes »), le responsable toutes.
 */
export function droitsPhoto(
  photo: PhotoEtape,
  contexte: { moi: string | null | undefined; peut: Peut; validationEtape: string | null | undefined },
): { modifier: boolean; retirer: boolean; raison: string | null } {
  if (contexte.peut('photos', 'valider')) {
    return { modifier: contexte.peut('photos', 'modifier'), retirer: contexte.peut('photos', 'supprimer'), raison: null };
  }
  const v = contexte.validationEtape;
  if (v && (!photo.cree_le || photo.cree_le <= v)) {
    return { modifier: false, retirer: false, raison: 'Photo enregistrée avant la validation : seul le responsable peut la modifier ou la retirer' };
  }
  if (!estAuteur(photo, contexte.moi)) {
    return { modifier: false, retirer: false, raison: 'Photo d\'un autre agent' };
  }
  return { modifier: contexte.peut('photos', 'modifier'), retirer: contexte.peut('photos', 'supprimer'), raison: null };
}

/** Bureau (R7) : administrateur, ou droit « interventions / valider » ou « quantités / lire » sur le marché. */
export const estBureau = (peut: Peut) => peut('interventions', 'valider') || peut('quantites', 'lire');

// ---------------------------------------------------------------------------------------------
// Corrections de la détection (V5)
// ---------------------------------------------------------------------------------------------

/** Champs dont la correction par un autre que l'auteur exige un motif (journalisé). */
export const CHAMPS_A_MOTIF = ['date_detection', 'reference_srm', 'position'] as const;

export function motifExige(
  changes: readonly string[],
  fuite: LigneEtape,
  moi: string | null | undefined,
): boolean {
  return changes.some((c) => (CHAMPS_A_MOTIF as readonly string[]).includes(c)) && !estAuteur(fuite, moi);
}

/** Saisie différée (même règle que la base) : détection antérieure de plus de 12 h à la saisie, faite au bureau ou à la place d'un agent. */
export function saisieDifferee(dateDetection: string, saisieLe: string, auBureauOuPourUnAgent: boolean): boolean {
  return auBureauOuPourUnAgent && new Date(saisieLe).getTime() - new Date(dateDetection).getTime() > 12 * 3_600_000;
}

/** Position au format attendu par la base. */
export const pointWkt = (longitude: number, latitude: number) => `SRID=4326;POINT(${longitude} ${latitude})`;

/** Distance approchée entre deux positions (m), pour annoncer un déplacement d'épingle. */
export function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.latitude * Math.PI) / 180) * Math.cos((b.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------------------------
// Dates (P5) : champ datetime-local à l'heure du Maroc
// ---------------------------------------------------------------------------------------------

/** ISO → valeur d'un champ datetime-local (AAAA-MM-JJTHH:MM) à l'heure du Maroc. */
export function versChampDate(iso: string | Date): string {
  return heureMurale(iso).toISOString().slice(0, 16);
}

/** Valeur d'un champ datetime-local (heure du Maroc) → ISO ; vide ou illisible : null. */
export function depuisChampDate(valeur: string): string | null {
  const r = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valeur);
  if (!r) return null;
  const [a, mo, j, h, mi] = r.slice(1).map(Number);
  return instantMaroc(Date.UTC(a, mo - 1, j, h, mi)).toISOString();
}

/** Date dans le futur (au-delà de 5 minutes) : avertissement. */
export const dansLeFutur = (iso: string | null, maintenant = new Date()) =>
  !!iso && new Date(iso).getTime() > maintenant.getTime() + 5 * 60_000;

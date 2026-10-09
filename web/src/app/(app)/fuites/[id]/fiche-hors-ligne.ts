// Consultation sans réseau d'une fiche déjà vue : règles pures (sans navigateur ni réseau),
// vérifiées par `node scripts/verifier-fiche-hors-ligne.mjs`. Le stockage est dans `src/lib/hors-ligne.ts`.
import type { PieceAffichee } from '@/app/(app)/attachements/controles';
import type { Action, FuiteV2, PhotoLigne, Quantite, Refection, Reparation, TypeDonnee, VFuite } from '@/lib/types';

/** Taille bornée : les 50 dernières fiches ouvertes et 400 photos au plus (≈ 40 Mo après réduction). */
export const LIMITES_HORS_LIGNE = { fiches: 50, photos: 400 } as const;

/** Copie des photos gardée sur l'appareil : réduite comme les vignettes du rapport, assez nette pour l'écran. */
export const PHOTO_HORS_LIGNE = { cote: 1024, qualite: 0.6 } as const;

/** Au-delà, une fiche qui ne répond pas s'affiche depuis la copie (4G « connectée » mais muette). */
export const DELAI_RESEAU_MS = 10000;

export type Noms = Record<string, string>;

export interface NomsFiche {
  natures: Noms;
  motifs: Noms;
  profils: Noms;
  equipes: Noms;
}

export interface LiensReparations {
  ouvriers: Record<string, string[]>;
  /** Pièces de chaque réparation (lot R : provenance, nature, état) ; texte seul dans une copie plus ancienne. */
  pieces: Record<string, (PieceAffichee | string)[]>;
}

/** Ce que la fiche affiche, tel que la RLS l'a renvoyé à l'utilisateur. */
export interface ContenuFiche {
  fuite: VFuite;
  photos: PhotoLigne[];
  reparations: Reparation[];
  refections: Refection[];
  quantites: Quantite[];
  liens: LiensReparations;
  noms: NomsFiche;
  /** Colonnes v2 de la fuite (validation, corrections, nouveaux champs) ; absentes d'une copie plus ancienne. */
  v2?: FuiteV2 | null;
}

/** En-tête d'une copie : propriétaire, ordre de purge, poids en photos. */
export interface EnteteFiche {
  id: string;
  utilisateur_id: string;
  consultee_le: string;
  nb_photos: number;
}

export interface FicheConsultee extends ContenuFiche, EnteteFiche {
  version_le: string;
}

export const NOMS_VIDES: NomsFiche = { natures: {}, motifs: {}, profils: {}, equipes: {} };

interface Listes {
  natures: { id: string; libelle_fr: string }[];
  motifs: { id: string; libelle_fr: string }[];
  profils: { id: string; nom_complet: string }[];
  equipes: { id: string; libelle: string }[];
}

const garder = <T extends { id: string }>(liste: T[], ids: (string | null | undefined)[], libelle: (x: T) => string): Noms => {
  const voulus = new Set(ids.filter((x): x is string => !!x));
  return Object.fromEntries(liste.filter((x) => voulus.has(x.id)).map((x) => [x.id, libelle(x)]));
};

/**
 * Noms affichés sur la fiche, réduits à ceux qu'elle cite : la copie ne garde ni la liste
 * des comptes (téléphones) ni les référentiels entiers du marché.
 */
export function nomsUtiles(
  reparations: Reparation[], refections: Refection[], listes: Listes,
  autres: { profils?: (string | null | undefined)[]; natures?: (string | null | undefined)[] } = {},
): NomsFiche {
  const autresProfils = autres.profils ?? [];
  return {
    natures: garder(listes.natures, [...refections.map((r) => r.nature_id), ...reparations.map((r) => r.nature_revetement_id), ...(autres.natures ?? [])], (n) => n.libelle_fr),
    motifs: garder(listes.motifs, [...reparations.map((r) => r.motif_id), ...refections.map((r) => r.motif_id)], (m) => m.libelle_fr),
    profils: garder(listes.profils, [...reparations.map((r) => r.auteur_terrain_id), ...autresProfils], (p) => p.nom_complet),
    equipes: garder(listes.equipes, reparations.map((r) => r.equipe_id), (e) => e.libelle),
  };
}

export function ficheConsultee(contenu: ContenuFiche, utilisateurId: string, maintenant: Date): FicheConsultee {
  const quand = maintenant.toISOString();
  return {
    ...contenu,
    id: contenu.fuite.id,
    utilisateur_id: utilisateurId,
    version_le: quand,
    consultee_le: quand,
    nb_photos: contenu.photos.length,
  };
}

/**
 * Copies à effacer après l'enregistrement de `courante` : celles d'un autre compte, puis les plus
 * anciennement ouvertes dès que le nombre de fiches ou de photos dépasse les limites.
 * La fiche courante est toujours gardée.
 */
export function fichesAPurger(
  entetes: EnteteFiche[],
  courante: { id: string; utilisateur_id: string },
  limites: { fiches: number; photos: number } = LIMITES_HORS_LIGNE,
): string[] {
  const aPurger = entetes.filter((e) => e.utilisateur_id !== courante.utilisateur_id).map((e) => e.id);
  const miennes = entetes.filter((e) => e.utilisateur_id === courante.utilisateur_id);
  const actuelle = miennes.find((e) => e.id === courante.id);
  let fiches = 1;
  let photos = actuelle?.nb_photos ?? 0;
  let plein = false;
  [...miennes]
    .filter((e) => e.id !== courante.id)
    .sort((a, b) => b.consultee_le.localeCompare(a.consultee_le))
    .forEach((e) => {
      plein = plein || fiches + 1 > limites.fiches || photos + e.nb_photos > limites.photos;
      if (plein) {
        aPurger.push(e.id);
        return;
      }
      fiches += 1;
      photos += e.nb_photos;
    });
  return aPurger;
}

/** Clé d'une photo gardée : son identifiant (l'URL signée change à chaque lecture et expire). */
export const clePhoto = (photo: { id: string }) => photo.id;

/** Photos de la fiche à télécharger : avec une URL, pas encore gardées. */
export function photosAMemoriser(photos: { id: string; url?: string }[], dejaGardees: Iterable<string>): { cle: string; url: string }[] {
  const deja = new Set(dejaGardees);
  return photos
    .filter((p): p is { id: string; url: string } => !!p.url && !deja.has(clePhoto(p)))
    .map((p) => ({ cle: clePhoto(p), url: p.url }));
}

/** Photos gardées qui ne sont plus sur la fiche (supprimées depuis). */
export function photosAOublier(photos: { id: string }[], dejaGardees: Iterable<string>): string[] {
  const actuelles = new Set(photos.map(clePhoto));
  return [...dejaGardees].filter((cle) => !actuelles.has(cle));
}

export type Droit = (type: TypeDonnee, action: Action) => boolean;

export interface ActionsFiche {
  rapportPdf: boolean;
  verrouiller: boolean;
  suiviClient: boolean;
  ajouterReparation: boolean;
  ajouterRefection: boolean;
  modifierQuantites: boolean;
  changerStatut: boolean;
  supprimer: boolean;
  ajouterPhoto: boolean;
}

/**
 * Actions proposées sur la fiche : selon les droits en ligne, aucune écriture sur une copie hors ligne.
 * Fuite verrouillée par un lot (V6) : l'agent ajoute encore réparation, réfection et photo (la base fige le reste).
 */
export function actionsFiche(peut: Droit, etat: { horsLigne: boolean; verrouillee: boolean }): ActionsFiche {
  const enLigne = !etat.horsLigne;
  const valider = peut('fuites', 'valider');
  return {
    rapportPdf: enLigne && peut('exports', 'lire'),
    verrouiller: enLigne && valider,
    suiviClient: enLigne && (peut('fuites', 'modifier') || valider),
    ajouterReparation: enLigne && peut('interventions', 'creer'),
    ajouterRefection: enLigne && peut('refections', 'creer'),
    modifierQuantites: enLigne && peut('quantites', 'modifier'),
    changerStatut: enLigne && valider,
    supprimer: enLigne && peut('fuites', 'supprimer'),
    ajouterPhoto: enLigne && peut('photos', 'creer'),
  };
}

export type Affichage = 'en_ligne' | 'copie' | 'indisponible' | 'attente';

/**
 * Que montrer : la lecture en ligne si elle a abouti ; sinon (pas de réseau, échec, délai dépassé)
 * la copie si elle existe ; « indisponible » seulement quand la lecture en ligne est exclue.
 */
export function choisirAffichage(etat: {
  lecture: 'ok' | 'reseau' | 'en_cours';
  copie: boolean;
}): Affichage {
  if (etat.lecture === 'ok') return 'en_ligne';
  if (etat.copie) return 'copie';
  return etat.lecture === 'reseau' ? 'indisponible' : 'attente';
}

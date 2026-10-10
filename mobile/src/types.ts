export type StatutFuite = 'detectee' | 'en_reparation' | 'reparee' | 'achevee' | 'sans_reparation';

export const STATUTS: Record<StatutFuite, string> = {
  detectee: 'Détectée, non réparée',
  en_reparation: 'Réparation en cours',
  reparee: 'Réparée, réfection à faire',
  achevee: 'Achevée',
  sans_reparation: 'Sans réparation',
};

export interface Profil { id: string; identifiant: string; nom_complet: string; est_admin: boolean; actif: boolean }
export interface Marche {
  id: string; code: string; intitule: string;
  // Libellés propres au client (absents d'une liste gardée hors ligne avant leur création)
  libelle_reference?: string; masque_reference?: string | null; delai_alerte_reparation_h?: number;
  client?: string | null; client_sigle?: string | null;
  /** Champs exigés à la création d'une fuite (F1) ; vide : règle F1 par défaut (regles.ts). */
  champs_obligatoires_fuite?: string[] | null;
  /** Saisie des débits de nuit proposée (D3), sauf réglage de la campagne. */
  debits_mode_saisie?: 'minimum' | 'releves' | 'import';
}
export interface Droit {
  marche_id: string; type_donnee: string; lire: boolean; creer: boolean;
  modifier: 'non' | 'siennes' | 'toutes'; supprimer: 'non' | 'siennes' | 'toutes'; valider: boolean;
}
export interface Secteur { id: string; zone_id: string; code: string; libelle: string }

export interface VFuite {
  id: string; numero: number; reference_srm: string | null; statut: StatutFuite;
  secteur: string | null; adresse: string | null; date_detection: string; nb_photos: number;
  alerte_non_reparee: boolean; alerte_sans_photo: boolean;
  latitude?: number | null; longitude?: number | null; // absents d'une liste gardée avant leur ajout
}

// ---------------------------------------------------------------------------
// Fiche d'une fuite, réparations et réfections (jamais de prix ni de quantités
// du bordereau : le chef de réparation n'a pas le droit « quantites »).
// ---------------------------------------------------------------------------
export type TypePhoto = 'detection' | 'avant' | 'pendant' | 'apres' | 'refection' | 'autre';
export type ResultatReparation = 'reparee' | 'en_cours' | 'non_reparee';
export type ResultatRefection = 'faite' | 'non_faite';

export const TYPES_PHOTO: Record<TypePhoto, string> = {
  detection: 'Détection', avant: 'Avant', pendant: 'Pendant', apres: 'Après', refection: 'Réfection', autre: 'Autre',
};
export const RESULTATS_REPARATION: Record<ResultatReparation, string> = {
  reparee: 'Réparée', en_cours: 'En cours / reste à finir', non_reparee: 'Non réparée',
};
export const OUVRAGES: Record<string, string> = {
  branchement: 'Branchement', conduite: 'Conduite', piece_speciale: 'Pièce spéciale', bouche_incendie: "Bouche d'incendie",
  vanne: 'Vanne', compteur: 'Compteur', branchement_clandestin: 'Branchement clandestin', autre: 'Autre',
};
export const MATERIAUX: Record<string, string> = {
  polyethylene: 'PE', amiante_ciment: 'Amiante-ciment', pvc: 'PVC', fonte_ductile: 'Fonte ductile',
  fonte_grise: 'Fonte grise', acier_galvanise: 'Acier galvanisé', ppr: 'PPR', autre: 'Autre',
};
export const EMPLACEMENTS: Record<string, string> = {
  trottoir: 'Trottoir', chaussee: 'Chaussée', terrain_naturel: 'Terrain naturel', autre: 'Autre',
};
export const VISIBILITES: Record<string, string> = { visible: 'Visible', invisible: 'Invisible' };

/** Ligne de v_fuites utile à la fiche (numero absent tant qu'une fuite saisie hors ligne n'est pas envoyée). */
export interface FicheFuite {
  id: string; numero: number | null; reference_srm: string | null; statut: StatutFuite;
  secteur: string | null; zone: string | null; adresse: string | null; ouvrage: string | null;
  latitude: number | null; longitude: number | null; date_detection: string; detectee_par: string | null;
  motif_sans_reparation: string | null; fuite_liee_id: string | null; verrouillee_le: string | null;
  observation: string | null; nb_photos: number; alerte_non_reparee: boolean;
  // Lus dans la table fuites (absents d'une fiche gardée avant le chantier v2) : modification et validation (V1, V2)
  visibilite?: string | null; nature_degradation_id?: string | null; diametre_mm?: number | null; materiau?: string | null;
  troncon_id?: string | null; secteur_id?: string | null; zone_id?: string | null; validee_le?: string | null;
  saisi_par?: string | null; auteur_terrain_id?: string | null; cree_le?: string | null;
}
export interface PhotoLigne {
  id: string; type: TypePhoto; chemin: string; stockage?: string | null; prise_le: string; reparation_id: string | null; refection_id: string | null;
  cree_le?: string; saisi_par?: string | null; auteur_terrain_id?: string | null;
}
export interface Reparation {
  id: string; resultat: ResultatReparation; motif_id: string | null; realisee_le: string;
  ouvrage: string | null; materiau: string | null; diametre_mm: number | null; representant_srm: string | null;
  tuyau_repare: boolean; robinet_pec_change: boolean; collier_pec_change: boolean;
  bouche_a_cle_mise_a_niveau: boolean; element_remplace: boolean; longueur_pe_m: number | null;
  fouille_longueur_m: number | null; fouille_largeur_m: number | null; fouille_profondeur_m: number | null;
  emplacement: string | null; nature_revetement_id: string | null; observation: string | null;
  // Portée « siennes » des droits (absents d'une fiche gardée avant le lot H)
  auteur_terrain_id?: string | null; saisi_par?: string | null;
  validee_le?: string | null; cree_le?: string | null; representant_srm_id?: string | null;
}
export interface Refection {
  id: string; resultat: ResultatRefection; motif_id: string | null; realisee_le: string; nature_id: string | null;
  longueur_m: number | null; largeur_m: number | null; observation: string | null;
  validee_le?: string | null; cree_le?: string | null; auteur_terrain_id?: string | null; saisi_par?: string | null;
  reparation_id?: string | null;
}
export interface PiecePosee {
  id: string; reparation_id: string; produit_id: number | null; designation_libre: string | null; quantite: number;
  saisi_par?: string | null;
  /** Article Dolibarr de la pièce (désignation, même s'il a été désactivé depuis). */
  produit?: { designation: string } | null;
}
export interface OuvrierPresent { reparation_id: string; ouvrier_id: string }

// Paramètres du marché (gardés sur la tablette pour la saisie hors ligne)
export interface Nature {
  id: string; code: string; libelle_fr: string; libelle_ar?: string | null; emplacement: string; necessite_refection: boolean;
}
export interface Motif { id: string; categorie: 'sans_reparation' | 'sans_refection'; libelle_fr: string; libelle_ar?: string | null }
/** Diamètre proposé pour un matériau (P2, réglable par marché). */
export interface Diametre { materiau: string; diametre_mm: number }
/** Représentant du maître d'ouvrage proposé à la réparation (P7). */
export interface Representant { id: string; nom: string }
/** Libellés français et arabes d'une liste commune (X4, table libelles_listes). */
export interface LibelleListe { liste: string; code: string; libelle_fr: string; libelle_ar: string | null }
/** Article Dolibarr activé (id : identifiant du produit dans Dolibarr), commun à tous les marchés. */
export interface Piece { id: number; designation: string; unite: string | null }
export interface Ouvrier { id: string; nom_complet: string }
export interface Proche {
  id: string; numero: number; reference_srm: string | null; statut: StatutFuite;
  date_detection: string; distance_m: number | null; meme_reference: boolean;
}

/** Réponse de suggestions_localisation (F3, F4) : à proposer, jamais à pré-remplir. */
export interface Suggestions {
  rayon_m: number; precision_insuffisante: boolean;
  rues: { nom: string; nom_fr: string | null; nom_ar: string | null; distance_m: number }[];
  secteur: { id: string; code: string; libelle: string; zone_id: string | null; source: string } | null;
  troncon: {
    id: string; reference: string | null; diametre_mm: number | null; materiau: string | null; materiau_plan: string | null;
    secteur_id: string | null; distance_m: number;
  } | null;
}

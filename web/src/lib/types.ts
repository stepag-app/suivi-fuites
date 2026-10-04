export type TypeDonnee =
  | 'fuites' | 'interventions' | 'photos' | 'quantites' | 'parametres'
  | 'ouvriers' | 'journal' | 'exports' | 'balayage' | 'mesures_debit' | 'attachements';

export type Action = 'lire' | 'creer' | 'modifier' | 'supprimer' | 'valider';

export type StatutFuite = 'detectee' | 'en_reparation' | 'reparee' | 'achevee' | 'sans_reparation';

export interface Profil {
  id: string;
  identifiant: string;
  nom_complet: string;
  telephone: string | null;
  langue: 'fr' | 'ar' | 'fr_ar';
  est_admin: boolean;
  actif: boolean;
}

export interface Marche {
  id: string;
  code: string;
  intitule: string;
  client: string;
  ville: string | null;
  taux_majoration: number;
  taux_tva: number;
  rayon_redetection_m: number;
}

export interface Droit {
  marche_id: string;
  type_donnee: TypeDonnee;
  lire: boolean;
  creer: boolean;
  modifier: 'non' | 'siennes' | 'toutes';
  supprimer: 'non' | 'siennes' | 'toutes';
  valider: boolean;
}

export interface Secteur { id: string; zone_id: string; code: string; libelle: string }
export interface Nature { id: string; code: string; libelle_fr: string; emplacement: string; necessite_refection: boolean }
export interface Motif { id: string; categorie: 'sans_reparation' | 'sans_refection'; code: string; libelle_fr: string }
export interface Piece { id: string; designation: string; unite: string }

export interface VFuite {
  id: string;
  marche_id: string;
  numero: number;
  reference_srm: string | null;
  origine: 'stepag' | 'srm';
  visibilite: 'visible' | 'invisible' | null;
  ouvrage: string | null;
  statut: StatutFuite;
  zone: string | null;
  secteur_id: string | null;
  secteur: string | null;
  adresse: string | null;
  latitude: number | null;
  longitude: number | null;
  date_detection: string;
  detectee_par: string | null;
  source_saisie: string;
  date_communication_srm: string | null;
  validation_srm_le: string | null;
  validation_srm_par: string | null;
  avis_terrassement_srm_le: string | null;
  derniere_reparation_le: string | null;
  derniere_refection_le: string | null;
  nb_photos: number;
  motif_sans_reparation: string | null;
  verrouillee_le: string | null;
  observation: string | null;
  alerte_non_reparee: boolean;
  alerte_communication_srm: boolean;
  alerte_refection_chaussee: boolean;
  refection_chaussee_hors_delai: boolean;
  alerte_refection_trottoir: boolean;
  alerte_sans_photo: boolean;
}

export interface Reparation {
  id: string;
  resultat: 'en_cours' | 'reparee' | 'non_reparee';
  realisee_le: string;
  ouvrage: string | null;
  materiau: string | null;
  diametre_mm: number | null;
  tuyau_repare: boolean;
  robinet_pec_change: boolean;
  collier_pec_change: boolean;
  bouche_a_cle_mise_a_niveau: boolean;
  element_remplace: boolean;
  longueur_pe_m: number | null;
  fouille_longueur_m: number | null;
  fouille_largeur_m: number | null;
  fouille_profondeur_m: number | null;
  volume_m3: number | null;
  emplacement: string | null;
  observation: string | null;
  source_saisie: string;
  auteur_terrain_id: string | null;
}

export interface Refection {
  id: string;
  resultat: 'faite' | 'non_faite';
  realisee_le: string;
  longueur_m: number | null;
  largeur_m: number | null;
  surface_m2: number | null;
  nature_id: string | null;
  motif_id: string | null;
  observation: string | null;
}

export interface PhotoLigne {
  id: string;
  type: string;
  chemin: string;
  prise_le: string;
}

export interface Quantite {
  id: string;
  prix_numero: string;
  prix_ordre: number;
  prix_designation: string;
  unite: string;
  quantite: number;
  pu_ht: number | null;
  montant_ht_bordereau: number | null;
  origine_ligne: 'auto' | 'manuel';
}

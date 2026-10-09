export type TypeDonnee =
  | 'fuites' | 'interventions' | 'refections' | 'photos' | 'quantites' | 'parametres'
  | 'ouvriers' | 'journal' | 'exports' | 'balayage' | 'mesures_debit' | 'attachements' | 'evenements';

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
  actif?: boolean;
  taux_majoration: number;
  taux_tva: number;
  rayon_redetection_m: number;
  // Libellés et règles propres au client (absents d'un contexte gardé hors ligne avant l'étape A)
  client_sigle?: string | null;
  libelle_reference?: string;
  masque_reference?: string | null;
  jalons_client?: boolean;
  delai_alerte_reparation_h?: number;
  devise?: string;
  // Chemins des logos (compartiment privé « logos »), repris dans les en-têtes des documents
  logo_titulaire?: string | null;
  logo_maitre_ouvrage?: string | null;
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
/** Article Dolibarr (id : identifiant du produit dans Dolibarr), commun à tous les marchés. */
export interface Piece { id: number; designation: string; unite: string | null }

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
  emplacement_fouille?: string | null;
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
  equipe_id?: string | null;
  motif_id?: string | null;
  representant_srm?: string | null;
  nature_revetement_id?: string | null;
  // Chantier v2 (S1, S2) : validation par étape, auteur, représentant choisi dans la liste du marché
  representant_srm_id?: string | null;
  validee_le?: string | null;
  validee_par?: string | null;
  saisi_par?: string | null;
  cree_le?: string | null;
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
  reparation_id?: string | null;
  auteur_terrain_id?: string | null;
  saisi_par?: string | null;
  source_saisie?: string;
  validee_le?: string | null;
  validee_par?: string | null;
  cree_le?: string | null;
}

export interface PhotoLigne {
  id: string;
  type: string;
  chemin: string;
  prise_le: string;
  stockage?: string;
  // Chantier v2 (S1) : rattachement à une étape, auteur, date de dépôt (règles V3)
  reparation_id?: string | null;
  refection_id?: string | null;
  auteur_terrain_id?: string | null;
  saisi_par?: string | null;
  cree_le?: string | null;
}

/** Colonnes de `fuites` absentes de `v_fuites` (chantier v2 : validation, corrections, nouveaux champs). */
export interface FuiteV2 {
  validee_le: string | null;
  validee_par: string | null;
  auteur_terrain_id: string | null;
  saisi_par: string | null;
  cree_le: string | null;
  saisie_differee: boolean;
  motif_correction: string | null;
  corrigee_par: string | null;
  corrigee_le: string | null;
  nature_degradation_id: string | null;
  diametre_mm: number | null;
  materiau: string | null;
  troncon_id: string | null;
  precision_gps_m: number | null;
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

// ---- Lot S : plan du réseau, zonage, balayage par tronçon (docs/lots/lot-s-reseau.md § 2 et 3) ----

export type StatutBalayage = 'a_balayer' | 'en_cours' | 'balayee';
export type CategorieTroncon = 'conduite' | 'branchement' | 'adduction' | 'autre';
export type TypeNoeud =
  | 'jonction' | 'extremite' | 'vanne' | 'bouche_incendie' | 'ventouse' | 'vidange' | 'compteur' | 'reservoir' | 'autre';
export type MethodeBalayage = 'ecoute' | 'correlation' | 'prelocalisation' | 'enregistreurs';

export interface Troncon {
  id: string;
  marche_id: string;
  reference: string;
  calque: string | null;
  categorie: CategorieTroncon;
  diametre_mm: number | null;
  materiau: string | null;
  zone_id: string | null;
  secteur_id: string | null;
  longueur_m: number;
  actif: boolean;
  modifie_le: string;
}

export interface Noeud {
  id: string;
  marche_id: string;
  reference: string;
  type: TypeNoeud;
  calque: string | null;
  zone_id: string | null;
  secteur_id: string | null;
  actif: boolean;
}

export interface Balayage {
  id: string;
  marche_id: string;
  troncon_id: string;
  date_balayage: string;
  balaye_le: string;
  equipe_id: string | null;
  agent_id: string | null;
  saisi_par: string | null;
  source_saisie: string;
  methode: MethodeBalayage | null;
  premier_passage: boolean;
  observation: string | null;
  annule_le: string | null;
  annule_par: string | null;
  motif_annulation: string | null;
}

/** Ligne de la fonction `etat_balayage` (balayages non annulés, un tronçon par ligne). */
export interface EtatBalayageTroncon {
  troncon_id: string;
  premier_le: string;
  dernier_le: string;
  nb_passages: number;
  equipe_id: string | null;
  agent_id: string | null;
}

export interface LigneLineaireSecteur {
  marche_id: string;
  zone_id: string;
  secteur_id: string;
  code: string;
  libelle: string;
  statut_balayage: StatutBalayage;
  nb_troncons: number;
  lineaire_m: number;
  nb_balayes: number;
  lineaire_balaye_m: number;
  pct_balaye: number;
  nb_noeuds: number;
  lineaire_contrat_m: number | null;
  modifie_le: string | null;
}

export interface LigneLineaireZone {
  marche_id: string;
  zone_id: string;
  numero: number;
  code: string;
  libelle: string;
  nb_secteurs: number;
  nb_troncons: number;
  lineaire_m: number;
  lineaire_balaye_m: number;
  pct_balaye: number;
  lineaire_contrat_m: number | null;
}

export interface LigneBalayageJournalier {
  marche_id: string;
  date_balayage: string;
  equipe_id: string | null;
  equipe: string | null;
  agent_id: string | null;
  agent: string | null;
  zone_id: string | null;
  zone: string | null;
  secteur_id: string | null;
  secteur: string | null;
  nb_troncons: number;
  lineaire_m: number;
  lineaire_repasse_m: number;
  nb_noeuds: number;
  nb_fuites: number;
}

export interface TronconsSansSecteur {
  marche_id: string;
  nb_troncons: number;
  lineaire_m: number;
}

export type StatutFuite = 'detectee' | 'en_reparation' | 'reparee' | 'achevee' | 'sans_reparation';

export const STATUTS: Record<StatutFuite, string> = {
  detectee: 'Détectée, non réparée',
  en_reparation: 'Réparation en cours',
  reparee: 'Réparée',
  achevee: 'Achevée',
  sans_reparation: 'Sans réparation',
};

export interface Profil { id: string; identifiant: string; nom_complet: string; est_admin: boolean; actif: boolean }
export interface Marche {
  id: string; code: string; intitule: string;
  // Libellés propres au client (absents d'une liste gardée hors ligne avant leur création)
  libelle_reference?: string; masque_reference?: string | null; delai_alerte_reparation_h?: number;
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
}

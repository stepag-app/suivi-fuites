// Colonnes de v_fuites lues par les pages qui chargent toutes les fuites d'un marché (essai de charge,
// docs/essai-charge-3000.md) : moitié moins de volume que select('*'). Le type suit la liste : un champ
// utilisé sans être lu ne compile pas.
import { getSupabase, fonctionAbsente } from '@/lib/supabase';
import type { StatutFuite, VFuite } from '@/lib/types';

const ALERTES = [
  'alerte_non_reparee', 'alerte_communication_srm', 'alerte_refection_chaussee', 'refection_chaussee_hors_delai',
  'alerte_refection_trottoir', 'alerte_sans_photo',
] as const;

const CHAMPS_LISTE = [
  'id', 'numero', 'reference_srm', 'origine', 'statut', 'zone', 'secteur_id', 'secteur', 'adresse', 'latitude', 'longitude',
  'date_detection', 'derniere_reparation_le', 'derniere_refection_le', 'emplacement_fouille', 'nb_photos', 'verrouillee_le',
  'detectee_par', ...ALERTES,
] as const;

const CHAMPS_ALERTES = [...CHAMPS_LISTE, 'date_communication_srm', 'validation_srm_le', 'avis_terrassement_srm_le', 'observation'] as const;

/** Liste des fuites, « À faire » (tableau, colonnes par statut, cartes, indicateurs, filtres). */
export const COLONNES_LISTE = CHAMPS_LISTE.join(', ');
export type FuiteListe = Pick<VFuite, (typeof CHAMPS_LISTE)[number]>;

/** Suivi des alertes : la liste plus la fiche de la fuite choisie. */
export const COLONNES_ALERTES = CHAMPS_ALERTES.join(', ');
export type FuiteAlerte = Pick<VFuite, (typeof CHAMPS_ALERTES)[number]>;

/**
 * Fuites utiles au suivi des alertes : celles en alerte, plus celles qu'il faut pour les courbes des
 * 14 derniers jours (non réparées, réparées ou refaites depuis `depuis`, réfection en attente).
 */
export function filtreAlertes(depuis: Date) {
  const d = `"${depuis.toISOString()}"`;
  return [
    ...ALERTES.map((a) => `${a}.is.true`),
    'derniere_reparation_le.is.null', `derniere_reparation_le.gte.${d}`, 'statut.eq.reparee', `derniere_refection_le.gte.${d}`,
  ].join(',');
}

/**
 * Nombre de fuites par statut calculé par la base (compter_fuites, RLS de l'appelant), indépendant du plafond
 * de lecture ; null si la fonction n'est pas disponible (migration pas encore déployée, mode démonstration).
 */
export async function compterFuites(marcheId?: string): Promise<{ marche_id: string; statut: StatutFuite; nb: number }[] | null> {
  const { data, error } = await getSupabase().rpc('compter_fuites', marcheId ? { p_marche: marcheId } : {});
  if (fonctionAbsente(error, data)) return null;
  if (error) throw error;
  return data as { marche_id: string; statut: StatutFuite; nb: number }[];
}

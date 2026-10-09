// Lecture d'une fiche (copie de la tablette, serveur, ou saisie encore sur la tablette) ; sans dépendance d'affichage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { estFuite, type Envoi } from './file-attente';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';
import type { FicheFuite, OuvrierPresent, PhotoLigne, PiecePosee, Refection, Reparation } from './types';

export interface Donnees {
  fuite: FicheFuite | null; photos: PhotoLigne[]; reparations: Reparation[]; refections: Refection[];
  pieces: PiecePosee[]; ouvriers: OuvrierPresent[];
}
export const cleFiche = (id: string) => `suivi-fuites:fiche:${id}`;
const COLONNES_FUITE = 'id, numero, reference_srm, statut, secteur, zone, adresse, ouvrage, latitude, longitude, date_detection, '
  + 'detectee_par, motif_sans_reparation, fuite_liee_id, verrouillee_le, observation, nb_photos, alerte_non_reparee';
const COLONNES_REPARATION = 'id, resultat, motif_id, realisee_le, equipe_id, ouvrage, materiau, diametre_mm, representant_srm, '
  + 'tuyau_repare, robinet_pec_change, collier_pec_change, bouche_a_cle_mise_a_niveau, element_remplace, longueur_pe_m, '
  + 'fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m, emplacement, nature_revetement_id, observation, '
  + 'auteur_terrain_id, saisi_par';

export async function chargerServeur(id: string): Promise<Donnees | null> {
  const [f, ph, rp, rf] = await Promise.all([
    supabase.from('v_fuites').select(COLONNES_FUITE).eq('id', id).maybeSingle(),
    supabase.from('photos').select('id, type, chemin, stockage, prise_le, reparation_id, refection_id').eq('fuite_id', id).is('supprime_le', null).order('prise_le'),
    supabase.from('reparations').select(COLONNES_REPARATION).eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
    supabase.from('refections').select('id, resultat, motif_id, realisee_le, nature_id, longueur_m, largeur_m, equipe_id, observation')
      .eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
  ]);
  if (f.error || ph.error || rp.error || rf.error) return null;
  const reparations = (rp.data ?? []) as unknown as Reparation[];
  const ids = reparations.map((r) => r.id);
  const [pc, ou] = ids.length
    ? await Promise.all([
      supabase.from('reparation_pieces').select('id, reparation_id, produit_id, designation_libre, quantite, saisi_par, produit:produits_dolibarr(designation)').in('reparation_id', ids).is('supprime_le', null),
      supabase.from('reparation_ouvriers').select('reparation_id, ouvrier_id').in('reparation_id', ids),
    ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (pc.error || ou.error) return null;
  return {
    fuite: (f.data as unknown as FicheFuite | null) ?? null, photos: (ph.data ?? []) as PhotoLigne[], reparations,
    refections: (rf.data ?? []) as Refection[], pieces: (pc.data ?? []) as PiecePosee[], ouvriers: (ou.data ?? []) as OuvrierPresent[],
  };
}

/**
 * Chargement de l'écran Fiche. `copie` : `afficher` reçoit d'abord la version gardée sur la tablette (fiche déjà
 * ouverte ici), sans attendre le réseau. Puis la réponse du serveur, gardée à son tour. Jeton à renouveler : aucune
 * requête (voir session-donnees.ts). Renvoie la réponse du serveur, ou null sans réponse (hors ligne).
 */
export async function chargerFiche(id: string, o: {
  copie: boolean; aRenouveler: boolean; afficher: (donnees: Donnees) => void;
}): Promise<Donnees | null> {
  if (o.copie) {
    try {
      const copie = JSON.parse((await AsyncStorage.getItem(cleFiche(id))) ?? 'null') as Donnees | null;
      if (copie) o.afficher(copie);
    } catch {
      // copie illisible : la fiche attend le serveur
    }
  }
  if (o.aRenouveler || jetonARenouveler()) return null;
  const serveur = await chargerServeur(id).catch(() => null);
  if (!serveur) return null;
  o.afficher(serveur);
  AsyncStorage.setItem(cleFiche(id), JSON.stringify(serveur)).catch(() => undefined);
  return serveur;
}

/** Fuite saisie sur la tablette et pas encore envoyée : fiche reconstituée à partir de la saisie. */
export function fuiteLocale(e: Envoi): FicheFuite | null {
  if (!estFuite(e)) return null;
  const l = e.ligne as Record<string, string | number | null>;
  const point = /POINT\(([-\d.]+) ([-\d.]+)\)/.exec(e.position ?? '');
  return {
    id: e.id, numero: null, reference_srm: (l.reference_srm as string) ?? null, statut: 'detectee', secteur: null, zone: null,
    adresse: (l.adresse as string) ?? null, ouvrage: null, latitude: point ? Number(point[2]) : null,
    longitude: point ? Number(point[1]) : null, date_detection: e.creee_le, detectee_par: null, motif_sans_reparation: null,
    fuite_liee_id: (l.fuite_liee_id as string) ?? null, verrouillee_le: null, observation: (l.observation as string) ?? null,
    nb_photos: e.photos.length, alerte_non_reparee: false,
  };
}

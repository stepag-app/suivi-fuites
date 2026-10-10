// Lecture d'une fiche (copie de la tablette, serveur, ou saisie encore sur la tablette) ; sans dépendance d'affichage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { estFuite, type Envoi } from './file-attente';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';
import type { FicheFuite, OuvrierPresent, PhotoLigne, PiecePosee, Refection, Reparation } from './types';

export interface Donnees {
  fuite: FicheFuite | null; photos: PhotoLigne[]; reparations: Reparation[]; refections: Refection[];
  pieces: PiecePosee[]; ouvriers: OuvrierPresent[];
  /** Nom des chefs d'équipe (compte qui a saisi la réparation ou la réfection) ; absent d'une copie plus ancienne. */
  chefs?: Record<string, string>;
}
export const cleFiche = (id: string) => `suivi-fuites:fiche:${id}`;
const COLONNES_FUITE = 'id, numero, reference_srm, statut, secteur, zone, adresse, ouvrage, latitude, longitude, date_detection, '
  + 'detectee_par, motif_sans_reparation, fuite_liee_id, verrouillee_le, observation, nb_photos, alerte_non_reparee';
const COLONNES_REPARATION = 'id, resultat, motif_id, realisee_le, ouvrage, materiau, diametre_mm, representant_srm, '
  + 'representant_srm_id, tuyau_repare, robinet_pec_change, collier_pec_change, bouche_a_cle_mise_a_niveau, element_remplace, '
  + 'longueur_pe_m, fouille_longueur_m, fouille_largeur_m, fouille_profondeur_m, emplacement, nature_revetement_id, observation, '
  + 'auteur_terrain_id, saisi_par, validee_le, cree_le';
const COLONNES_REFECTION = 'id, resultat, motif_id, realisee_le, nature_id, longueur_m, largeur_m, observation, '
  + 'reparation_id, auteur_terrain_id, saisi_par, validee_le, cree_le';
// Champs de la fuite absents de v_fuites : saisie du chantier v2, validation, auteur (V1, V2).
const DETAILS_FUITE = 'visibilite, nature_degradation_id, diametre_mm, materiau, troncon_id, secteur_id, zone_id, validee_le, '
  + 'saisi_par, auteur_terrain_id, cree_le';

/**
 * `bureau` (responsable, administrateur : droit « interventions / valider ») : pièces telles qu'elles sont, corrections du
 * bureau comprises. Sinon, la déclaration du terrain (v_pieces_terrain, R7) : chacun voit ce qui a été saisi sur le terrain.
 */
export async function chargerServeur(id: string, bureau = false): Promise<Donnees | null> {
  const [f, d, ph, rp, rf] = await Promise.all([
    supabase.from('v_fuites').select(COLONNES_FUITE).eq('id', id).maybeSingle(),
    supabase.from('fuites').select(DETAILS_FUITE).eq('id', id).maybeSingle(),
    supabase.from('photos').select('id, type, chemin, stockage, prise_le, reparation_id, refection_id, cree_le, saisi_par, auteur_terrain_id')
      .eq('fuite_id', id).is('supprime_le', null).order('prise_le'),
    supabase.from('reparations').select(COLONNES_REPARATION).eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
    supabase.from('refections').select(COLONNES_REFECTION).eq('fuite_id', id).is('supprime_le', null).order('realisee_le'),
  ]);
  if (f.error || d.error || ph.error || rp.error || rf.error) return null;
  const reparations = (rp.data ?? []) as unknown as Reparation[];
  const refections = (rf.data ?? []) as unknown as Refection[];
  const ids = reparations.map((r) => r.id);
  // L'équipe, c'est le compte du chef d'équipe (S12) : son nom, lu avec la RLS (vide si le compte n'est pas visible).
  const auteurs = [...new Set([...reparations, ...refections].map((x) => x.auteur_terrain_id).filter((x): x is string => !!x))];
  const noms = auteurs.length
    ? await supabase.from('profils').select('id, nom_complet').in('id', auteurs).then((r) => r, () => ({ data: null }))
    : { data: [] };
  const pieces = bureau
    ? supabase.from('reparation_pieces').select('id, reparation_id, produit_id, designation_libre, quantite, saisi_par, produit:produits_dolibarr(designation)')
      .in('reparation_id', ids).is('supprime_le', null)
    : supabase.from('v_pieces_terrain').select('id, reparation_id, produit_id, designation, quantite, saisi_par').in('reparation_id', ids);
  const [pc, ou] = ids.length
    ? await Promise.all([pieces, supabase.from('reparation_ouvriers').select('reparation_id, ouvrier_id').in('reparation_id', ids)])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (pc.error || ou.error) return null;
  const lues = (pc.data ?? []) as (PiecePosee & { designation?: string })[];
  const fuite = f.data ? ({ ...(f.data as object), ...((d.data as object | null) ?? {}) } as FicheFuite) : null;
  return {
    fuite, photos: (ph.data ?? []) as PhotoLigne[], reparations, refections,
    pieces: lues.map((p) => ({
      id: p.id, reparation_id: p.reparation_id, produit_id: p.produit_id, designation_libre: p.designation_libre ?? null,
      quantite: Number(p.quantite), saisi_par: p.saisi_par, produit: p.produit ?? (p.designation ? { designation: p.designation } : null),
    })),
    ouvriers: (ou.data ?? []) as OuvrierPresent[],
    chefs: Object.fromEntries(((noms.data ?? []) as { id: string; nom_complet: string }[]).map((p) => [p.id, p.nom_complet])),
  };
}

/**
 * Chargement de l'écran Fiche. `copie` : `afficher` reçoit d'abord la version gardée sur la tablette (fiche déjà
 * ouverte ici), sans attendre le réseau. Puis la réponse du serveur, gardée à son tour. Jeton à renouveler : aucune
 * requête (voir session-donnees.ts). Renvoie la réponse du serveur, ou null sans réponse (hors ligne).
 */
export async function chargerFiche(id: string, o: {
  copie: boolean; aRenouveler: boolean; afficher: (donnees: Donnees) => void; bureau?: boolean;
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
  const serveur = await chargerServeur(id, o.bureau).catch(() => null);
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
    adresse: (l.adresse as string) ?? null, ouvrage: (l.ouvrage as string) ?? null, latitude: point ? Number(point[2]) : null,
    visibilite: (l.visibilite as string) ?? null, nature_degradation_id: (l.nature_degradation_id as string) ?? null,
    diametre_mm: (l.diametre_mm as number) ?? null, materiau: (l.materiau as string) ?? null,
    secteur_id: (l.secteur_id as string) ?? null, zone_id: (l.zone_id as string) ?? null, troncon_id: (l.troncon_id as string) ?? null,
    longitude: point ? Number(point[1]) : null, date_detection: e.creee_le, detectee_par: null, motif_sans_reparation: null,
    fuite_liee_id: (l.fuite_liee_id as string) ?? null, verrouillee_le: null, observation: (l.observation as string) ?? null,
    nb_photos: e.photos.length, alerte_non_reparee: false,
  };
}

// Liste des fuites d'un marché (écran Liste) : copie gardée sur la tablette, puis serveur ; sans dépendance d'affichage
// (essais/session-hors-ligne.test.mjs).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';
import type { VFuite } from './types';

export const cleListe = (marcheId: string) => `suivi-fuites:liste:${marcheId}`;
const COLONNES = 'id, numero, reference_srm, statut, secteur, adresse, date_detection, nb_photos, alerte_non_reparee, '
  + 'alerte_sans_photo, latitude, longitude';

/** Dernière liste reçue du serveur, telle que gardée sur la tablette (JSON). */
export const listeGardee = (marcheId: string) => AsyncStorage.getItem(cleListe(marcheId)).catch(() => null);

/**
 * Les 200 dernières fuites du marché, ou null sans réponse dans `delaiMs`. Le délai borne toute l'attente : avant
 * d'envoyer la requête, supabase-js attend le jeton (`getSession`), parfois pendant les reprises du renouvellement.
 */
export function listeServeur(marcheId: string, delaiMs: number): Promise<VFuite[] | null> {
  const controleur = new AbortController();
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const abandon = new Promise<null>((fin) => {
    minuteur = setTimeout(() => {
      controleur.abort();
      fin(null);
    }, delaiMs);
  });
  const requete = supabase.from('v_fuites').select(COLONNES).eq('marche_id', marcheId)
    .order('date_detection', { ascending: false }).limit(200).abortSignal(controleur.signal)
    .then(({ data, error }) => (error || !data ? null : (data as unknown as VFuite[])));
  return Promise.race([requete, abandon]).finally(() => clearTimeout(minuteur));
}

/**
 * Chargement de l'écran Liste. `copie` (ouverture, autre marché) : `afficher` reçoit d'abord la liste gardée sur la
 * tablette, sans attendre le réseau. Puis la réponse du serveur ; `afficher` dit si elle a changé, et la copie n'est
 * réécrite qu'alors. Jeton à renouveler : aucune requête (voir session-donnees.ts), la liste se recharge après le
 * renouvellement. Renvoie faux sans réponse du serveur (hors ligne).
 */
export async function chargerListe(marcheId: string, o: {
  copie: boolean; aRenouveler: boolean; delaiMs: number; afficher: (contenu: string) => boolean;
}): Promise<boolean> {
  if (o.copie) o.afficher((await listeGardee(marcheId)) ?? '[]');
  if (o.aRenouveler || jetonARenouveler()) return false;
  const fuites = await listeServeur(marcheId, o.delaiMs);
  if (!fuites) return false;
  const contenu = JSON.stringify(fuites);
  if (o.afficher(contenu)) await AsyncStorage.setItem(cleListe(marcheId), contenu).catch(() => undefined);
  return true;
}

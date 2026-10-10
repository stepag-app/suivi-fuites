// Photos de la tablette (détection, avant / pendant / après, réfection) : TOUT passe par ce module.
// Règles (CLAUDE.md § 7) : 1 600 px au plus, qualité 70, copie dans le dossier privé de l'appli (jamais
// la galerie), envoi au serveur, suppression locale seulement après confirmation.
// Stockage des fichiers : compartiment privé Cloudflare R2 (URL signées par la fonction serveur photos-r2,
// les clés ne quittent jamais le serveur) quand il est configuré, sinon Supabase Storage ; la ligne
// `photos` dit où est chaque fichier (`stockage`). Lecture : `urlsPhotos`, selon le stockage de chacune.
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { t } from './langue';
import { supabase } from './supabase';
import type { TypePhoto } from './types';

export interface PhotoAttente {
  id: string; fichier: string; largeur: number; hauteur: number; taille: number; prise_le: string;
  type?: TypePhoto; // absent : photo de détection (anciennes saisies)
  position?: string | null;
}

const DOSSIER = `${FileSystem.documentDirectory}attente/`;

interface ErreurApi { code?: string; message?: string; statusCode?: string | number }
/** Déjà reçu par le serveur (renvoi après coupure) : ce n'est pas une erreur. */
export const dejaEnvoye = (e: ErreurApi) =>
  e.code === '23505' || String(e.statusCode) === '409' || /already exists|duplicate/i.test(e.message ?? '');

/** Copie une photo déjà compressée dans le dossier privé de l'appli (jamais la galerie). */
export async function garderPhoto(uriTemporaire: string, id: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(DOSSIER, { intermediates: true });
  const fichier = `${DOSSIER}${id}.jpg`;
  await FileSystem.copyAsync({ from: uriTemporaire, to: fichier });
  return fichier;
}

/** Efface des photos de la tablette (envoyées, ou saisie abandonnée). */
export const effacerPhotos = (photos: PhotoAttente[]) =>
  Promise.all(photos.map((p) => FileSystem.deleteAsync(p.fichier, { idempotent: true }))).then(() => undefined);

/** Dernière position connue (sans attendre le GPS) si la localisation est déjà autorisée. */
async function positionRapide(): Promise<string | null> {
  try {
    if ((await Location.getForegroundPermissionsAsync()).status !== 'granted') return null;
    const p = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
    return p ? `SRID=4326;POINT(${p.coords.longitude} ${p.coords.latitude})` : null;
  } catch {
    return null;
  }
}

/** Ouvre l'appareil photo ; renvoie la photo compressée et gardée sur la tablette, null si annulé, ou un message d'erreur. */
export async function prendrePhoto(type: TypePhoto, avecPosition = false): Promise<PhotoAttente | null | string> {
  const droit = await ImagePicker.requestCameraPermissionsAsync();
  if (!droit.granted) return t('Appareil photo refusé : autorisez-le dans les réglages de la tablette.');
  const r = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const echelle = Math.min(1, 1600 / Math.max(a.width, a.height));
  const reduite = await ImageManipulator.manipulateAsync(
    a.uri,
    echelle < 1 ? [{ resize: { width: Math.round(a.width * echelle), height: Math.round(a.height * echelle) } }] : [],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
  );
  const id = Crypto.randomUUID();
  const fichier = await garderPhoto(reduite.uri, id);
  const info = await FileSystem.getInfoAsync(fichier);
  return {
    id, fichier, largeur: reduite.width, hauteur: reduite.height, taille: info.exists ? info.size : 0,
    prise_le: new Date().toISOString(), type, position: avecPosition ? await positionRapide() : undefined,
  };
}

/**
 * Envoie une photo gardée sur la tablette (fichier puis ligne `photos`), sans doublon en cas de renvoi.
 * Lève une erreur si le serveur refuse ; le fichier local n'est effacé qu'après confirmation.
 */
export async function envoyerPhoto(p: PhotoAttente, lien: {
  marche_id: string; fuite_id: string; reparation_id?: string | null; refection_id?: string | null; position?: string | null;
}) {
  const { stockage, chemin } = await deposerFichier(p, lien);
  const ligne = await supabase.from('photos').insert({
    id: p.id, marche_id: lien.marche_id, fuite_id: lien.fuite_id, type: p.type ?? 'detection',
    stockage, chemin, reparation_id: lien.reparation_id ?? null, refection_id: lien.refection_id ?? null,
    position: p.position ?? lien.position ?? null, prise_le: p.prise_le,
    largeur_px: p.largeur, hauteur_px: p.hauteur, taille_octets: p.taille,
  });
  if (ligne.error && !dejaEnvoye(ligne.error)) throw ligne.error;
  await effacerPhotos([p]);
}

/**
 * Pièce jointe d'une mesure de nuit (photo de l'afficheur) : compartiment privé « debits », `<marché>/<campagne>/<fichier>`.
 * Renvoi sans doublon (fichier déjà reçu accepté) ; le fichier local est effacé par l'appelant, après la ligne.
 */
export async function deposerPieceJointe(p: PhotoAttente, chemin: string): Promise<string> {
  const octets = await (await fetch(p.fichier)).arrayBuffer();
  const r = await supabase.storage.from('debits').upload(chemin, octets, { contentType: 'image/jpeg' });
  if (r.error && !dejaEnvoye(r.error as ErreurApi)) throw r.error;
  return chemin;
}

type ReponseFonction<T> = { ok: true; data: T } | { ok: false; code?: string; message: string };

// Appel de la fonction serveur photos-r2 : le corps JSON est lu même en erreur (« r2_non_configure », refus…).
async function appelerPhotosR2<T>(corps: Record<string, unknown>): Promise<ReponseFonction<T>> {
  const { data, error } = await supabase.functions.invoke('photos-r2', { body: corps });
  if (error) {
    let detail: { erreur?: string; code?: string } = {};
    const contexte = (error as { context?: Response }).context;
    if (contexte && typeof contexte.json === 'function') {
      try {
        detail = await contexte.json();
      } catch {
        /* corps illisible */
      }
    }
    return { ok: false, code: detail.code, message: detail.erreur ?? (error as Error).message ?? String(error) };
  }
  if (data?.erreur) return { ok: false, code: data.code, message: data.erreur };
  return { ok: true, data: data as T };
}

/**
 * Dépose le fichier : R2 si la fonction serveur l'autorise et que l'envoi réussit (fichier envoyé tel quel,
 * sans passer par la mémoire), sinon Supabase Storage (R2 non configuré, refus, envoi impossible : rien n'est perdu).
 */
async function deposerFichier(p: PhotoAttente, lien: { marche_id: string; fuite_id: string }): Promise<{ stockage: 'supabase' | 'r2'; chemin: string }> {
  const chemin = `${lien.marche_id}/${lien.fuite_id}/${p.id}.jpg`;
  const r = await appelerPhotosR2<{ url: string; chemin: string }>({
    action: 'deposer', marche_id: lien.marche_id, fuite_id: lien.fuite_id, photo_id: p.id,
  });
  if (r.ok) {
    try {
      const rep = await FileSystem.uploadAsync(r.data.url, p.fichier, {
        httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': 'image/jpeg' },
      });
      if (rep.status >= 200 && rep.status < 300) return { stockage: 'r2', chemin: r.data.chemin };
      console.warn(`Dépôt R2 refusé (${rep.status}) : repli sur Supabase Storage.`);
    } catch (e) {
      console.warn('Dépôt R2 impossible : repli sur Supabase Storage.', e);
    }
  } else if (r.code !== 'r2_non_configure') {
    console.warn(`Fonction photos-r2 : ${r.message} ; repli sur Supabase Storage.`);
  }
  const octets = await (await fetch(p.fichier)).arrayBuffer();
  const tele = await supabase.storage.from('photos').upload(chemin, octets, { contentType: 'image/jpeg' });
  if (tele.error && !dejaEnvoye(tele.error as ErreurApi)) throw tele.error;
  return { stockage: 'supabase', chemin };
}

/** URL de lecture des photos d'une fiche (par identifiant), selon le stockage de chacune ; absente = indisponible. */
export async function urlsPhotos(
  photos: { id: string; chemin: string; stockage?: string | null }[],
  dureeS = 3600,
): Promise<Record<string, string>> {
  const table: Record<string, string> = {};
  const locales = photos.filter((p) => (p.stockage ?? 'supabase') === 'supabase');
  const r2 = photos.filter((p) => p.stockage === 'r2');
  if (locales.length) {
    const signees = await supabase.storage.from('photos').createSignedUrls(locales.map((p) => p.chemin), dureeS);
    for (const p of locales) {
      const u = signees.data?.find((x) => x.path === p.chemin)?.signedUrl;
      if (u) table[p.id] = u;
    }
  }
  for (let i = 0; i < r2.length; i += 200) {
    const lot = r2.slice(i, i + 200);
    const r = await appelerPhotosR2<{ urls: Record<string, string> }>({ action: 'lire', chemins: lot.map((p) => p.chemin), duree_s: dureeS });
    if (!r.ok) break;
    for (const p of lot) {
      const u = r.data.urls[p.chemin];
      if (u) table[p.id] = u;
    }
  }
  return table;
}

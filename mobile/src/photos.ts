// Photos de la tablette (détection, avant / pendant / après, réfection) : TOUT passe par ce module.
// Règles (CLAUDE.md § 7) : 1 600 px au plus, qualité 70, copie dans le dossier privé de l'appli (jamais
// la galerie), envoi au serveur, suppression locale seulement après confirmation.
// Stockage actuel : Supabase Storage (`stockage = 'supabase'`). Le passage à Cloudflare R2 ne changera
// que `envoyerPhoto` (et la colonne `stockage`).
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
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
  if (!droit.granted) return 'Appareil photo refusé : autorisez-le dans les réglages de la tablette.';
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
  const chemin = `${lien.marche_id}/${lien.fuite_id}/${p.id}.jpg`;
  const octets = await (await fetch(p.fichier)).arrayBuffer();
  const tele = await supabase.storage.from('photos').upload(chemin, octets, { contentType: 'image/jpeg' });
  if (tele.error && !dejaEnvoye(tele.error as ErreurApi)) throw tele.error;
  const ligne = await supabase.from('photos').insert({
    id: p.id, marche_id: lien.marche_id, fuite_id: lien.fuite_id, type: p.type ?? 'detection',
    stockage: 'supabase', chemin, reparation_id: lien.reparation_id ?? null, refection_id: lien.refection_id ?? null,
    position: p.position ?? lien.position ?? null, prise_le: p.prise_le,
    largeur_px: p.largeur, hauteur_px: p.hauteur, taille_octets: p.taille,
  });
  if (ligne.error && !dejaEnvoye(ligne.error)) throw ligne.error;
  await effacerPhotos([p]);
}

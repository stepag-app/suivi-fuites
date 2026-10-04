// Prise de photo commune à la détection, à la réparation et à la réfection (CLAUDE.md § 7) :
// 1 600 px au plus, qualité 70, copie dans le dossier privé de l'appli, jamais dans la galerie.
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { garderPhoto, type PhotoAttente } from './file-attente';
import type { TypePhoto } from './types';

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

/** Ouvre l'appareil photo ; renvoie la photo gardée sur la tablette, null si annulé, ou un message d'erreur. */
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

// Mode hors ligne léger (même principe que le panneau web) : la fuite et ses photos sont gardées
// sur la tablette, puis envoyées au retour du réseau. Les uuid sont créés ici : renvoyer ne
// crée jamais de doublon. Les données locales ne sont effacées qu'après confirmation du serveur.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

export interface PhotoAttente { id: string; fichier: string; largeur: number; hauteur: number; taille: number; prise_le: string }
export interface FuiteAttente {
  id: string; marche_id: string; ligne: Record<string, unknown>; position: string | null;
  photos: PhotoAttente[]; creee_le: string; erreur: string | null;
}

const CLE = 'suivi-fuites:attente';
const DOSSIER = `${FileSystem.documentDirectory}attente/`;
type Ecouteur = () => void;
const ecouteurs = new Set<Ecouteur>();
export const surChangement = (f: Ecouteur) => {
  ecouteurs.add(f);
  return () => void ecouteurs.delete(f);
};
const prevenir = () => ecouteurs.forEach((f) => f());

export async function lireAttente(): Promise<FuiteAttente[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CLE)) ?? '[]') as FuiteAttente[];
  } catch {
    return [];
  }
}
const ecrireAttente = (liste: FuiteAttente[]) => AsyncStorage.setItem(CLE, JSON.stringify(liste));

/** Copie une photo déjà compressée dans le dossier privé de l'appli (jamais la galerie). */
export async function garderPhoto(uriTemporaire: string, id: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(DOSSIER, { intermediates: true });
  const fichier = `${DOSSIER}${id}.jpg`;
  await FileSystem.copyAsync({ from: uriTemporaire, to: fichier });
  return fichier;
}

export async function mettreEnAttente(f: Omit<FuiteAttente, 'creee_le' | 'erreur'>) {
  await ecrireAttente([...(await lireAttente()), { ...f, creee_le: new Date().toISOString(), erreur: null }]);
  prevenir();
}

export async function abandonner(id: string) {
  const liste = await lireAttente();
  const f = liste.find((x) => x.id === id);
  await Promise.all((f?.photos ?? []).map((p) => FileSystem.deleteAsync(p.fichier, { idempotent: true })));
  await ecrireAttente(liste.filter((x) => x.id !== id));
  prevenir();
}

interface ErreurApi { code?: string; message?: string; statusCode?: string | number }
const dejaEnvoye = (e: ErreurApi) =>
  e.code === '23505' || String(e.statusCode) === '409' || /already exists|duplicate/i.test(e.message ?? '');
const erreurReseau = (e: unknown) => /network|fetch|timeout|internet/i.test(String((e as ErreurApi)?.message ?? e));

async function marquerErreur(id: string, message: string) {
  await ecrireAttente((await lireAttente()).map((f) => (f.id === id ? { ...f, erreur: message } : f)));
}
async function retirerPhoto(fuiteId: string, photoId: string, fichier: string) {
  await FileSystem.deleteAsync(fichier, { idempotent: true });
  await ecrireAttente(
    (await lireAttente()).map((f) => (f.id === fuiteId ? { ...f, photos: f.photos.filter((p) => p.id !== photoId) } : f)),
  );
}

let enCours: Promise<number> | null = null;

/** Envoie tout ce qui attend ; renvoie le nombre de fuites restantes. Une synchro à la fois. */
export function synchroniser(): Promise<number> {
  if (!enCours) {
    enCours = executer().finally(() => {
      enCours = null;
      prevenir();
    });
  }
  return enCours;
}

async function executer(): Promise<number> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return (await lireAttente()).length;

  for (const f of await lireAttente()) {
    try {
      const { error } = await supabase.from('fuites').insert({ ...f.ligne, id: f.id, marche_id: f.marche_id });
      if (error && !dejaEnvoye(error)) throw error;

      for (const p of f.photos) {
        const chemin = `${f.marche_id}/${f.id}/${p.id}.jpg`;
        const octets = await (await fetch(p.fichier)).arrayBuffer();
        const tele = await supabase.storage.from('photos').upload(chemin, octets, { contentType: 'image/jpeg' });
        if (tele.error && !dejaEnvoye(tele.error as ErreurApi)) throw tele.error;
        const ligne = await supabase.from('photos').insert({
          id: p.id, marche_id: f.marche_id, fuite_id: f.id, type: 'detection', chemin,
          position: f.position, prise_le: p.prise_le,
          largeur_px: p.largeur, hauteur_px: p.hauteur, taille_octets: p.taille,
        });
        if (ligne.error && !dejaEnvoye(ligne.error)) throw ligne.error;
        await retirerPhoto(f.id, p.id, p.fichier);
      }
      await ecrireAttente((await lireAttente()).filter((x) => x.id !== f.id));
    } catch (e) {
      if (erreurReseau(e)) break; // on réessaiera au retour du réseau, rien n'est perdu
      await marquerErreur(f.id, String((e as ErreurApi)?.message ?? e));
    }
  }
  return (await lireAttente()).length;
}

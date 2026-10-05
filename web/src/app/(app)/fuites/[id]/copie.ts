// Copie hors ligne d'une fiche ouverte en ligne : données, page (service worker) et photos réduites.
import {
  clesPhotosGardees, garderFiche, garderPhoto, lireFicheGardee, lirePhotosGardees, oublierPhotos, preparerFicheHorsLigne,
} from '@/lib/hors-ligne';
import { preparerPhoto } from '@/lib/photo';
import {
  PHOTO_HORS_LIGNE, ficheConsultee, fichesAPurger, photosAMemoriser, photosAOublier,
  type ContenuFiche, type FicheConsultee,
} from './fiche-hors-ligne';

// Photo lue par son URL signée (souvent déjà dans le cache HTTP : elle vient d'être affichée),
// puis réduite avant d'être gardée.
async function photoReduite(url: string): Promise<Blob | null> {
  try {
    const reponse = await fetch(url, { cache: 'force-cache' });
    if (!reponse.ok) return null;
    const brute = await reponse.blob();
    const fichier = new File([brute], 'photo.jpg', { type: brute.type || 'image/jpeg' });
    const { blob } = await preparerPhoto(fichier, PHOTO_HORS_LIGNE.cote, PHOTO_HORS_LIGNE.qualite);
    return blob.size < brute.size ? blob : brute;
  } catch {
    return null;
  }
}

/** Remplace la copie de la fiche (purge des plus anciennes comprise), puis garde les photos manquantes une à une. */
export async function garderCopie(contenu: ContenuFiche, urls: Map<string, string>, utilisateurId: string) {
  const fiche = ficheConsultee(contenu, utilisateurId, new Date());
  await garderFiche(fiche, (entetes) => fichesAPurger(entetes, fiche));
  preparerFicheHorsLigne(fiche.id);
  const deja = await clesPhotosGardees(fiche.id);
  await oublierPhotos(photosAOublier(contenu.photos, deja));
  const aGarder = photosAMemoriser(contenu.photos.map((p) => ({ id: p.id, url: urls.get(p.id) })), deja);
  for (const { cle, url } of aGarder) {
    const blob = await photoReduite(url);
    if (blob) await garderPhoto({ cle, fuite_id: fiche.id, blob });
  }
}

/** Copie gardée et adresses locales (blob:) de ses photos, à libérer par l'appelant. */
export async function lireCopie(id: string, utilisateurId: string): Promise<{ fiche: FicheConsultee; urls: Map<string, string> } | null> {
  const fiche = await lireFicheGardee<FicheConsultee>(id, utilisateurId);
  if (!fiche) return null;
  const blobs = await lirePhotosGardees(id);
  return { fiche, urls: new Map([...blobs].map(([cle, blob]) => [cle, URL.createObjectURL(blob)])) };
}

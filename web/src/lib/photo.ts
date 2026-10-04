import { getSupabase } from './supabase';

// Redimensionne et compresse une photo avant envoi (≈ 1 600 px, qualité 70 %),
// comme prévu dans CLAUDE.md § 7.
export interface PhotoPreparee {
  blob: Blob;
  largeur: number;
  hauteur: number;
}

export async function preparerPhoto(fichier: File, cote = 1600, qualite = 0.7): Promise<PhotoPreparee> {
  const bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' });
  const echelle = Math.min(1, cote / Math.max(bitmap.width, bitmap.height));
  const largeur = Math.round(bitmap.width * echelle);
  const hauteur = Math.round(bitmap.height * echelle);
  const canvas = document.createElement('canvas');
  canvas.width = largeur;
  canvas.height = hauteur;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Impossible de traiter la photo.');
  ctx.drawImage(bitmap, 0, 0, largeur, hauteur);
  bitmap.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', qualite));
  if (!blob) throw new Error('Impossible de compresser la photo.');
  return { blob, largeur, hauteur };
}

// Lecture des photos : URL signées selon le stockage de chaque photo (colonne `photos.stockage`).
// Seul point d'accès aux fichiers photos : le passage à Cloudflare R2 ne changera que cette fonction.
export interface PhotoStockee { id: string; chemin: string; stockage?: string | null }

export async function urlsPhotos(photos: PhotoStockee[], dureeS = 3600): Promise<Map<string, string>> {
  const sortie = new Map<string, string>();
  const supabase = photos.filter((p) => (p.stockage ?? 'supabase') === 'supabase');
  if (supabase.length) {
    const { data } = await getSupabase().storage.from('photos').createSignedUrls(supabase.map((p) => p.chemin), dureeS);
    const parChemin = new Map((data ?? []).map((u) => [u.path, u.signedUrl]));
    supabase.forEach((p) => {
      const url = parChemin.get(p.chemin);
      if (url) sortie.set(p.id, url);
    });
  }
  // 'r2' : pas encore branché (photos sans URL : « Indisponible » à l'écran et dans les rapports).
  return sortie;
}

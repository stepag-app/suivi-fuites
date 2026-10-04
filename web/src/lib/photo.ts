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

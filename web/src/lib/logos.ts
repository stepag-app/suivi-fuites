// Logos du titulaire et du maître d'ouvrage d'un marché (compartiment privé « logos »).
// Chemins imposés par la base : <marche_id>/titulaire.<png|jpg>, <marche_id>/maitre_ouvrage.<png|jpg>.
import type { LogoEntete } from './export/modele';
import { getSupabase } from './supabase';

export type RoleLogo = 'titulaire' | 'maitre_ouvrage';

export const COLONNES_LOGO: Record<RoleLogo, 'logo_titulaire' | 'logo_maitre_ouvrage'> = {
  titulaire: 'logo_titulaire',
  maitre_ouvrage: 'logo_maitre_ouvrage',
};

export const TYPES_LOGO = ['image/png', 'image/jpeg'];
export const POIDS_MAX_LOGO = 2 * 1024 * 1024;
const LARGEUR_MAX_PX = 600;
const QUALITE_JPEG = 0.9;
const COMPARTIMENT = 'logos';

export function controlerFichierLogo(f: File): string | null {
  if (!TYPES_LOGO.includes(f.type)) return 'Image PNG ou JPEG seulement (le SVG et les autres formats sont refusés).';
  if (f.size > POIDS_MAX_LOGO) return 'Image trop lourde : 2 Mo au plus.';
  return null;
}

// Réduit l'image à 600 px de large au plus. Le PNG reste en PNG (transparence conservée).
export async function reduireLogo(f: File): Promise<{ blob: Blob; extension: 'png' | 'jpg'; type: string }> {
  const png = f.type === 'image/png';
  const bitmap = await createImageBitmap(f).catch(() => {
    throw new Error('Image illisible : choisissez un autre fichier PNG ou JPEG.');
  });
  const k = Math.min(1, LARGEUR_MAX_PX / bitmap.width);
  const toile = document.createElement('canvas');
  toile.width = Math.max(1, Math.round(bitmap.width * k));
  toile.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = toile.getContext('2d');
  if (!ctx) throw new Error('Impossible de traiter l\'image.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, toile.width, toile.height);
  bitmap.close();
  const type = png ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((ok) => toile.toBlob(ok, type, png ? undefined : QUALITE_JPEG));
  if (!blob) throw new Error('Impossible de réduire l\'image.');
  return { blob, extension: png ? 'png' : 'jpg', type };
}

// Envoie (ou remplace) un logo, l'enregistre dans la fiche, puis efface l'ancien fichier
// s'il avait une autre extension. Renvoie le nouveau chemin.
export async function envoyerLogo(marcheId: string, role: RoleLogo, f: File, ancien: string | null): Promise<string> {
  const erreur = controlerFichierLogo(f);
  if (erreur) throw new Error(erreur);
  const { blob, extension, type } = await reduireLogo(f);
  const chemin = `${marcheId}/${role}.${extension}`;
  const sb = getSupabase();
  // Même chemin à chaque remplacement : pas de cache, pour revoir tout de suite le nouveau logo.
  const envoi = await sb.storage.from(COMPARTIMENT).upload(chemin, blob, { contentType: type, upsert: true, cacheControl: '0' });
  if (envoi.error) throw envoi.error;
  const fiche = await sb.from('marches').update({ [COLONNES_LOGO[role]]: chemin }).eq('id', marcheId).select('id');
  if (fiche.error) throw fiche.error;
  if (!fiche.data?.length) throw new Error('Fiche du marché non modifiée : droit « paramètres / modifier » nécessaire.');
  if (ancien && ancien !== chemin) await sb.storage.from(COMPARTIMENT).remove([ancien]);
  return chemin;
}

export async function retirerLogo(marcheId: string, role: RoleLogo, chemin: string): Promise<void> {
  const sb = getSupabase();
  const fiche = await sb.from('marches').update({ [COLONNES_LOGO[role]]: null }).eq('id', marcheId).select('id');
  if (fiche.error) throw fiche.error;
  if (!fiche.data?.length) throw new Error('Fiche du marché non modifiée : droit « paramètres / modifier » nécessaire.');
  const suppression = await sb.storage.from(COMPARTIMENT).remove([chemin]);
  if (suppression.error) throw suppression.error;
}

export async function telechargerLogo(chemin: string): Promise<Blob> {
  const { data, error } = await getSupabase().storage.from(COMPARTIMENT).download(chemin);
  if (error || !data) throw error ?? new Error('Logo introuvable.');
  return data;
}

async function logoEntete(chemin: string): Promise<LogoEntete> {
  const blob = await telechargerLogo(chemin);
  const bitmap = await createImageBitmap(blob);
  const dimensions = { largeur: bitmap.width, hauteur: bitmap.height };
  bitmap.close();
  const donnees = await new Promise<string>((ok, ko) => {
    const lecteur = new FileReader();
    lecteur.onload = () => ok(String(lecteur.result));
    lecteur.onerror = () => ko(lecteur.error);
    lecteur.readAsDataURL(blob);
  });
  return { donnees, format: blob.type === 'image/jpeg' || chemin.endsWith('.jpg') ? 'JPEG' : 'PNG', ...dimensions };
}

// Logos de l'en-tête des documents, à partir de la fiche du marché. Un logo illisible
// (fichier absent, compte sans droit de lecture) est ignoré : l'en-tête reste sans logo.
export async function chargerLogosEntete(
  fiche: Record<string, unknown>,
): Promise<{ titulaire: LogoEntete | null; maitreOuvrage: LogoEntete | null }> {
  const charger = (v: unknown) => (typeof v === 'string' && v ? logoEntete(v).catch(() => null) : Promise.resolve(null));
  const [titulaire, maitreOuvrage] = await Promise.all([charger(fiche.logo_titulaire), charger(fiche.logo_maitre_ouvrage)]);
  return { titulaire, maitreOuvrage };
}

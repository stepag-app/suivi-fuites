import { MODE_DEMO, getSupabase } from './supabase';

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

// ---- Fichiers des photos : seul point d'accès du panneau ------------------------------------------
// Deux stockages cohabitent (colonne photos.stockage) : le compartiment privé Cloudflare R2, servi par
// la fonction serveur photos-r2 (URL signées de courte durée ; les clés R2 ne quittent jamais le
// serveur), et Supabase Storage (anciennes photos, et repli tant que R2 n'est pas configuré).

export type StockagePhoto = 'supabase' | 'r2';
export interface PhotoStockee { id: string; chemin: string; stockage?: string | null }

interface ErreurApi { code?: string; message?: string; statusCode?: string | number }
// Renvoi après coupure : le fichier est déjà là, ce n'est pas une erreur.
const dejaEnvoye = (e: ErreurApi) =>
  e.code === '23505' || String(e.statusCode) === '409' || /already exists|duplicate/i.test(e.message ?? '');

type ReponseFonction<T> = { ok: true; data: T } | { ok: false; code?: string; message: string };

// Appel de la fonction serveur : le corps JSON est lu même en erreur (code « r2_non_configure », refus…).
async function appelerPhotosR2<T>(corps: Record<string, unknown>): Promise<ReponseFonction<T>> {
  const { data, error } = await getSupabase().functions.invoke('photos-r2', { body: corps });
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

export const cheminPhoto = (marcheId: string, fuiteId: string, photoId: string) => `${marcheId}/${fuiteId}/${photoId}.jpg`;

/**
 * Dépose le fichier d'une photo et dit où il est : R2 si la fonction serveur l'autorise et que le dépôt
 * réussit, sinon Supabase Storage (fonction non configurée, refus ou dépôt impossible : rien n'est perdu,
 * la ligne `photos` portera le bon `stockage`). Un renvoi après coupure n'est pas une erreur.
 */
export async function deposerPhoto(
  blob: Blob,
  lien: { marche_id: string; fuite_id: string; id: string },
): Promise<{ stockage: StockagePhoto; chemin: string }> {
  const chemin = cheminPhoto(lien.marche_id, lien.fuite_id, lien.id);
  if (!MODE_DEMO) {
    const r = await appelerPhotosR2<{ url: string; chemin: string }>({
      action: 'deposer', marche_id: lien.marche_id, fuite_id: lien.fuite_id, photo_id: lien.id,
    });
    if (r.ok) {
      try {
        const rep = await fetch(r.data.url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
        if (rep.ok) return { stockage: 'r2', chemin: r.data.chemin };
        console.warn(`Dépôt R2 refusé (${rep.status}) : repli sur Supabase Storage.`);
      } catch (e) {
        console.warn('Dépôt R2 impossible : repli sur Supabase Storage.', e);
      }
    } else if (r.code !== 'r2_non_configure') {
      console.warn(`Fonction photos-r2 : ${r.message} ; repli sur Supabase Storage.`);
    }
  }
  const tele = await getSupabase().storage.from('photos').upload(chemin, blob, { contentType: 'image/jpeg' });
  if (tele.error && !dejaEnvoye(tele.error as ErreurApi)) throw tele.error;
  return { stockage: 'supabase', chemin };
}

/** URL de lecture (durée dureeS) de chaque photo, selon son stockage ; une photo sans URL est « indisponible ». */
export async function urlsPhotos(photos: PhotoStockee[], dureeS = 3600): Promise<Map<string, string>> {
  const sortie = new Map<string, string>();
  const supabase = photos.filter((p) => (p.stockage ?? 'supabase') === 'supabase');
  const r2 = photos.filter((p) => p.stockage === 'r2');
  if (supabase.length) {
    const { data } = await getSupabase().storage.from('photos').createSignedUrls(supabase.map((p) => p.chemin), dureeS);
    const parChemin = new Map((data ?? []).map((u) => [u.path, u.signedUrl]));
    supabase.forEach((p) => {
      const url = parChemin.get(p.chemin);
      if (url) sortie.set(p.id, url);
    });
  }
  if (r2.length && !MODE_DEMO) {
    // 200 chemins par appel au plus (limite de la fonction serveur)
    for (let i = 0; i < r2.length; i += 200) {
      const lot = r2.slice(i, i + 200);
      const r = await appelerPhotosR2<{ urls: Record<string, string> }>({ action: 'lire', chemins: lot.map((p) => p.chemin), duree_s: dureeS });
      if (!r.ok) {
        console.warn(`Photos R2 illisibles : ${r.message}`);
        break;
      }
      lot.forEach((p) => {
        const url = r.data.urls[p.chemin];
        if (url) sortie.set(p.id, url);
      });
    }
  }
  return sortie;
}

// Copies complètes des archives PMTiles d'un marché sur l'appareil (lot CH, carte de balayage sans réseau) : le réseau
// et le fond de carte de la ville, téléchargés entiers quand il y a du réseau, puis lus ici sans réseau. Rangées dans
// Cache Storage (`suivi-fuites-carte`), une entrée par marché et par fichier, remplacée d'un coup quand la nouvelle
// version est complète : l'ancienne reste en service jusque-là. Gardées quand l'agent se déconnecte (tablette partagée
// entre agents du même marché, décision d'Issam du 2026-10-12).
import type { RangeResponse, Source } from 'pmtiles';

export type FichierCarte = 'reseau' | 'fond';

const NOM_CACHE = 'suivi-fuites-carte';
const URL_CACHE = 'https://cache.suivi-fuites.invalid/carte';

export interface CopieLocale {
  blob: Blob;
  etag: string;
  octets: number;
  /** Date ISO du téléchargement. */
  gardeLe: string;
}

const cleUrl = (marcheId: string, fichier: FichierCarte) => `${URL_CACHE}/${marcheId}/${fichier}`;

export const normaliserEtag = (e: string | null | undefined) => (e ?? '').replace(/^W\//, '').replace(/"/g, '');

/** Copie complète gardée sur l'appareil, ou null (absente, Cache Storage indisponible). */
export async function lireCopie(marcheId: string, fichier: FichierCarte): Promise<CopieLocale | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const r = await (await caches.open(NOM_CACHE)).match(cleUrl(marcheId, fichier));
    if (!r) return null;
    const etag = r.headers.get('X-Etag') ?? '';
    const blob = await r.blob();
    if (!etag || !blob.size) return null;
    return { blob, etag, octets: blob.size, gardeLe: r.headers.get('X-Garde-Le') ?? '' };
  } catch {
    return null;
  }
}

/**
 * Télécharge l'archive entière (URL signée) et la range sur l'appareil. Refuse une copie tronquée (taille annoncée
 * différente de celle reçue). `progression` reçoit les octets reçus.
 */
export async function garderCopie(o: {
  marcheId: string;
  fichier: FichierCarte;
  url: string;
  etag: string;
  octets: number | null;
  progression?: (recus: number) => void;
  signal?: AbortSignal;
  fetch?: typeof fetch;
}): Promise<CopieLocale> {
  if (typeof caches === 'undefined') throw new Error('Stockage de l\'appareil indisponible.');
  const r = await (o.fetch ?? fetch)(o.url, { signal: o.signal, cache: 'no-store' });
  if (!r.ok) throw new Error(`Téléchargement refusé (HTTP ${r.status}).`);
  const morceaux: Uint8Array[] = [];
  let recus = 0;
  if (r.body) {
    const lecteur = r.body.getReader();
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      morceaux.push(value);
      recus += value.length;
      o.progression?.(recus);
    }
  } else {
    const tout = new Uint8Array(await r.arrayBuffer());
    morceaux.push(tout);
    recus = tout.length;
  }
  const attendus = o.octets ?? (Number(r.headers.get('Content-Length')) || null);
  if (!recus || (attendus && recus !== attendus)) throw new Error(`Téléchargement incomplet (${recus} octets sur ${attendus ?? '?'}).`);
  const etag = normaliserEtag(r.headers.get('ETag')) || normaliserEtag(o.etag);
  const blob = new Blob(morceaux as BlobPart[], { type: 'application/vnd.pmtiles' });
  const gardeLe = new Date().toISOString();
  await (await caches.open(NOM_CACHE)).put(cleUrl(o.marcheId, o.fichier), new Response(blob, {
    headers: { 'Content-Type': 'application/vnd.pmtiles', 'X-Etag': etag, 'X-Garde-Le': gardeLe },
  }));
  return { blob, etag, octets: recus, gardeLe };
}

/** Source pmtiles lue dans une copie complète (aucune requête réseau). */
export function sourceCopie(cle: string, copie: Pick<CopieLocale, 'blob' | 'etag'>): Source {
  return {
    getKey: () => cle,
    async getBytes(offset: number, length: number): Promise<RangeResponse> {
      const fin = Math.min(offset + length, copie.blob.size);
      return { data: await copie.blob.slice(offset, fin).arrayBuffer(), etag: copie.etag };
    },
  };
}

/** Demande au navigateur de ne pas vider ce stockage en cas de place manquante (sans effet si refusé). */
export async function demanderStockagePersistant(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

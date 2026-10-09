// Tuiles vectorielles du réseau (X5) côté panneau : archive PMTiles privée dans R2 (`reseau/<marché>/reseau.pmtiles`),
// lue par plages d'octets avec une URL signée de courte durée que délivre la fonction serveur `reseau-tuiles` (droits
// de l'appelant vérifiés côté serveur ; le plan du réseau n'est jamais public). L'URL est renouvelée quand elle expire ;
// les plages lues sont gardées dans le cache du navigateur (Cache Storage), clé = archive + ETag : une archive
// régénérée a un autre ETag, l'ancien cache est purgé.
// Sans archive, sans stockage configuré ou avec une archive périmée (empreinte différente), la carte garde la lecture
// GeoJSON par secteur (lib/reseau/donnees.ts) : rien ne casse.
import { EtagMismatch, PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';
import { getSupabase } from '@/lib/supabase';
import { lireIndexTroncons, lireInfosTuiles, type IndexTroncons, type InfosTuiles } from './tuiles-format';

const FONCTION = 'reseau-tuiles';
const MARGE_EXPIRATION_MS = 60_000;
const NOM_CACHE = 'suivi-fuites-tuiles';
const URL_CACHE = 'https://cache.suivi-fuites.invalid/tuiles';

export interface UrlSignee { url: string; expireS: number; etag: string | null; octets: number | null }

/** Réponse de l'action `lire` de la fonction, ou null (archive absente, stockage non configuré, réponse illisible). */
export function reponseLisible(corps: unknown): UrlSignee | null {
  if (!corps || typeof corps !== 'object') return null;
  const c = corps as { existe?: unknown; url?: unknown; expire_s?: unknown; etag?: unknown; octets?: unknown };
  if (c.existe !== true || typeof c.url !== 'string' || !/^https?:\/\//.test(c.url)) return null;
  return {
    url: c.url,
    expireS: Math.max(30, Number(c.expire_s) || 600),
    etag: typeof c.etag === 'string' ? c.etag : null,
    octets: Number.isFinite(Number(c.octets)) ? Number(c.octets) : null,
  };
}

export interface CachePlages {
  lire: (cle: string) => Promise<ArrayBuffer | null>;
  ecrire: (cle: string, donnees: ArrayBuffer) => Promise<void>;
}

/** Cache Storage du navigateur (absent : aucun cache). */
export function cacheNavigateur(): CachePlages | null {
  if (typeof caches === 'undefined') return null;
  const url = (cle: string) => `${URL_CACHE}/${encodeURIComponent(cle)}`;
  return {
    lire: async (cle) => {
      try {
        const r = await (await caches.open(NOM_CACHE)).match(url(cle));
        return r ? await r.arrayBuffer() : null;
      } catch {
        return null;
      }
    },
    ecrire: async (cle, donnees) => {
      try {
        await (await caches.open(NOM_CACHE)).put(url(cle), new Response(donnees));
      } catch {
        /* quota ou stockage indisponible : sans conséquence */
      }
    },
  };
}

/** Efface du cache les plages des autres versions de l'archive de ce marché. */
async function purgerCache(prefixe: string, garder: string) {
  if (typeof caches === 'undefined') return;
  try {
    const c = await caches.open(NOM_CACHE);
    const debut = `${URL_CACHE}/${encodeURIComponent(prefixe)}`;
    const conserve = `${URL_CACHE}/${encodeURIComponent(garder)}`;
    for (const k of await c.keys()) if (k.url.startsWith(debut) && !k.url.startsWith(conserve)) await c.delete(k);
  } catch {
    /* sans conséquence */
  }
}

const normaliserEtag = (e: string | null | undefined) => (e ?? '').replace(/^W\//, '').replace(/"/g, '');

/**
 * Source pmtiles qui lit par plages avec une URL signée : redemande une URL avant l'expiration ou après un refus
 * (403, 400 : signature périmée), garde les plages dans `cache` sous `cle|etag|début-longueur`.
 */
export function creerSourceSignee(o: {
  cle: string;
  lire: () => Promise<{ existe?: boolean; url?: string; expire_s?: number; etag?: string; octets?: number } | null>;
  fetch?: typeof fetch;
  cache?: CachePlages | null;
  initiale?: UrlSignee | null;
}): Source {
  const chercher = o.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  let courante: (UrlSignee & { expireLe: number }) | null = o.initiale
    ? { ...o.initiale, expireLe: Date.now() + o.initiale.expireS * 1000 - MARGE_EXPIRATION_MS } : null;
  let enCours: Promise<UrlSignee & { expireLe: number }> | null = null;

  const signer = async (forcer: boolean) => {
    if (!forcer && courante && courante.expireLe > Date.now()) return courante;
    enCours ??= (async () => {
      const r = reponseLisible(await o.lire());
      if (!r) throw new Error('Tuiles du réseau indisponibles.');
      courante = { ...r, expireLe: Date.now() + r.expireS * 1000 - MARGE_EXPIRATION_MS };
      return courante;
    })().finally(() => { enCours = null; });
    return enCours;
  };

  return {
    getKey: () => o.cle,
    async getBytes(offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> {
      const u = await signer(false);
      const etagArchive = normaliserEtag(u.etag);
      const cleCache = `${o.cle}|${etagArchive}|${offset}-${length}`;
      if (o.cache && etagArchive) {
        const d = await o.cache.lire(cleCache);
        if (d) return { data: d, etag: etagArchive };
      }
      const demander = (url: string) => chercher(url, { headers: { Range: `bytes=${offset}-${offset + length - 1}` }, signal });
      let r = await demander(u.url);
      if (r.status === 403 || r.status === 400) r = await demander((await signer(true)).url);
      if (r.status !== 206 && r.status !== 200) throw new Error(`Lecture des tuiles refusée (HTTP ${r.status}).`);
      const etagRecu = normaliserEtag(r.headers.get('ETag')) || etagArchive;
      if (etag && etagRecu && normaliserEtag(etag) !== etagRecu) throw new EtagMismatch();
      let data = await r.arrayBuffer();
      // Serveur sans plages : il renvoie tout, on découpe.
      if (r.status === 200 && data.byteLength > length) data = data.slice(offset, offset + length);
      if (o.cache && etagRecu && etagRecu === etagArchive) await o.cache.ecrire(cleCache, data);
      return { data, etag: etagRecu || undefined };
    },
  };
}

/** Bornes [ouest, sud, est, nord] élargies de `metres` (approximation locale, assez juste à 1 km près). */
export function empriseAvecMarge(b: [number, number, number, number], metres: number): [number, number, number, number] {
  const lat = (b[1] + b[3]) / 2;
  const dLat = metres / 111320;
  const dLon = metres / (111320 * Math.cos((lat * Math.PI) / 180));
  return [b[0] - dLon, b[1] - dLat, b[2] + dLon, b[3] + dLat];
}

// ---- Accès depuis le panneau ----------------------------------------------------------------------------------

async function appeler(corps: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getSupabase().functions.invoke(FONCTION, { body: corps });
  if (error) {
    const contexte = (error as { context?: Response }).context;
    let detail: { erreur?: string; code?: string } = {};
    if (contexte && typeof contexte.json === 'function') {
      try {
        detail = await contexte.json();
      } catch {
        /* corps illisible */
      }
    }
    const e = new Error(detail.erreur ?? error.message) as Error & { code?: string };
    e.code = detail.code;
    throw e;
  }
  return data;
}

export interface TuilesReseau {
  /** Adresse de la source MapLibre (`pmtiles://…`), le protocole étant enregistré. */
  url: string;
  infos: InfosTuiles | null;
  /** Bornes du réseau [ouest, sud, est, nord] (en-tête de l'archive). */
  bornes: [number, number, number, number];
  octets: number | null;
  archive: PMTiles;
  /** Tronçons de l'archive (uuid, longueur, secteur, diamètre) et uuid → identifiant entier des tuiles. */
  index: IndexTroncons;
  versEntier: Map<string, number>;
}

const protocole = typeof window !== 'undefined' ? new Protocol({ metadata: false }) : null;
const modulesEnregistres = new WeakSet<object>();
const ouvertes = new Map<string, Promise<TuilesReseau | null>>();

/** Enregistre le protocole `pmtiles://` auprès du module MapLibre chargé (une fois). */
export function enregistrerProtocole(ml: { addProtocol: (nom: string, f: never) => void }) {
  if (!protocole || modulesEnregistres.has(ml)) return;
  ml.addProtocol('pmtiles', protocole.tile as never);
  modulesEnregistres.add(ml);
}

/**
 * Archive du réseau du marché, prête pour MapLibre, ou null (absente, stockage non configuré, lecture refusée).
 * Une seule ouverture par marché et par version de l'archive pendant la vie de la page.
 */
export async function ouvrirTuilesReseau(marcheId: string): Promise<TuilesReseau | null> {
  let premiere: UrlSignee | null;
  try {
    premiere = reponseLisible(await appeler({ action: 'lire', marche_id: marcheId }));
  } catch {
    return null;
  }
  if (!premiere || !protocole) return null;
  const version = normaliserEtag(premiere.etag).replace(/[^a-z0-9]/gi, '').slice(0, 32) || String(Date.now());
  const cle = `reseau-${marcheId}-${version}`;
  const deja = ouvertes.get(cle);
  if (deja) return deja;
  const promesse = (async () => {
    const source = creerSourceSignee({
      cle, initiale: premiere, cache: cacheNavigateur(),
      lire: async () => (await appeler({ action: 'lire', marche_id: marcheId })) as never,
    });
    const archive = new PMTiles(source);
    try {
      const h = await archive.getHeader();
      const meta = await archive.getMetadata();
      const index = lireIndexTroncons(meta);
      if (!index) throw new Error('archive sans index des tronçons');
      protocole.add(archive);
      void purgerCache(`reseau-${marcheId}-`, cle);
      return {
        url: `pmtiles://${cle}`, infos: lireInfosTuiles(meta), bornes: [h.minLon, h.minLat, h.maxLon, h.maxLat],
        octets: premiere.octets, archive, index, versEntier: new Map(index.ids.map((id, i) => [id, i + 1])),
      } as TuilesReseau;
    } catch (e) {
      // Typiquement : règle CORS du compartiment sans l'en-tête Range (voir web/README.md § Carte).
      console.warn('Tuiles du réseau illisibles, lecture par secteur :', e);
      ouvertes.delete(cle);
      return null;
    }
  })();
  ouvertes.set(cle, promesse);
  return promesse;
}

/** Dépose une archive régénérée (administrateur ou « paramètres / modifier », vérifié par la fonction). */
export async function deposerTuiles(marcheId: string, octets: Uint8Array): Promise<void> {
  const r = (await appeler({ action: 'deposer', marche_id: marcheId })) as { url?: string } | null;
  if (!r?.url) throw new Error('Dépôt des tuiles refusé.');
  const envoi = await fetch(r.url, { method: 'PUT', body: octets as unknown as BodyInit, headers: { 'Content-Type': 'application/vnd.pmtiles' } });
  if (!envoi.ok) throw new Error(`Dépôt des tuiles refusé par le stockage (HTTP ${envoi.status}).`);
  for (const k of [...ouvertes.keys()]) if (k.startsWith(`reseau-${marcheId}-`)) ouvertes.delete(k);
}

/** État de l'archive pour Paramètres > Réseau : absente, ou présente avec ses infos. */
export async function etatTuiles(marcheId: string): Promise<{ disponible: boolean; tuiles: TuilesReseau | null; erreur?: string }> {
  try {
    const corps = await appeler({ action: 'lire', marche_id: marcheId });
    if (!reponseLisible(corps)) return { disponible: true, tuiles: null };
  } catch (e) {
    const code = (e as { code?: string }).code;
    return { disponible: false, tuiles: null, erreur: code === 'r2_non_configure' ? 'Stockage R2 non configuré sur le serveur.' : (e as Error).message };
  }
  return { disponible: true, tuiles: await ouvrirTuilesReseau(marcheId) };
}

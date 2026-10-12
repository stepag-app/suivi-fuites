// Tuiles vectorielles du réseau (X5) côté panneau : archive PMTiles privée dans R2 (`reseau/<marché>/reseau.pmtiles`),
// lue par plages d'octets avec une URL signée de courte durée que délivre la fonction serveur `reseau-tuiles` (droits
// de l'appelant vérifiés côté serveur ; le plan du réseau n'est jamais public). L'URL est renouvelée quand elle expire ;
// les plages lues sont gardées dans le cache du navigateur (Cache Storage), clé = archive + ETag : une archive
// régénérée a un autre ETag, l'ancien cache est purgé.
// Copie complète sur l'appareil (lot CH, copie-carte.ts) : lue à la place de R2 quand elle a le même ETag que
// l'archive en ligne, ou sans réseau (fonction injoignable). Même mécanisme pour le fond de carte de la ville
// (`fonds/<marché>/fond.pmtiles`, fichier « fond »).
// Sans archive, sans stockage configuré ou avec une archive périmée (empreinte différente), la carte garde la lecture
// GeoJSON par secteur (lib/reseau/donnees.ts) : rien ne casse.
import { EtagMismatch, PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';
import { getSupabase } from '@/lib/supabase';
import { lireCopie, normaliserEtag, sourceCopie, type CopieLocale, type FichierCarte } from './copie-carte';
import { lireIndexTroncons, lireInfosTuiles, type IndexTroncons, type InfosTuiles } from './tuiles-format';

const FONCTION = 'reseau-tuiles';
const MARGE_EXPIRATION_MS = 60_000;
const NOM_CACHE = 'suivi-fuites-tuiles';
const URL_CACHE = 'https://cache.suivi-fuites.invalid/tuiles';
/** Au-delà, la fonction est tenue pour injoignable et la copie de l'appareil sert (réseau très lent). */
const DELAI_FONCTION_MS = 10_000;

export interface UrlSignee { url: string; expireS: number; etag: string | null; octets: number | null }

/**
 * Réponse de l'action `lire` de la fonction, ou null (archive absente, stockage non configuré, réponse illisible).
 * Fond de carte : la réponse doit nommer le fichier (une fonction d'avant le lot CH renverrait le réseau).
 */
export function reponseLisible(corps: unknown, fichier: FichierCarte = 'reseau'): UrlSignee | null {
  if (!corps || typeof corps !== 'object') return null;
  const c = corps as { existe?: unknown; url?: unknown; expire_s?: unknown; etag?: unknown; octets?: unknown; fichier?: unknown };
  if (c.existe !== true || typeof c.url !== 'string' || !/^https?:\/\//.test(c.url)) return null;
  if ((c.fichier ?? 'reseau') !== fichier) return null;
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

/** Plages lues par R2 : inutiles une fois la copie complète gardée sur l'appareil (lot CH). */
export const oublierPlages = (marcheId: string, fichier: FichierCarte) => purgerCache(`${fichier}-${marcheId}-`, '\u0000');

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

/**
 * Source pmtiles qui lit par plages avec une URL signée : redemande une URL avant l'expiration ou après un refus
 * (403, 400 : signature périmée), garde les plages dans `cache` sous `cle|etag|début-longueur`.
 */
export function creerSourceSignee(o: {
  cle: string;
  lire: () => Promise<unknown>;
  fichier?: FichierCarte;
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
      const r = reponseLisible(await o.lire(), o.fichier);
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

type ErreurFonction = Error & { code?: string; statut?: number };

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
    const e = new Error(detail.erreur ?? error.message) as ErreurFonction;
    e.code = detail.code;
    // Statut HTTP : le serveur a répondu (refus, archive absente…) ; sans statut, il n'a pas été joint.
    if (contexte && typeof contexte.status === 'number') e.statut = contexte.status;
    throw e;
  }
  return data;
}

/**
 * URL signée d'une archive, bornée dans le temps. null : absente, stockage non configuré ou accès refusé ;
 * 'injoignable' : pas de réponse (sans réseau, réseau très lent, serveur en panne).
 */
export async function lireSignee(marcheId: string, fichier: FichierCarte, delaiMs = DELAI_FONCTION_MS): Promise<UrlSignee | null | 'injoignable'> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    const corps = await Promise.race([
      appeler({ action: 'lire', marche_id: marcheId, fichier }),
      new Promise<never>((_, ko) => { minuteur = setTimeout(() => ko(new Error('délai dépassé')), delaiMs); }),
    ]);
    return reponseLisible(corps, fichier);
  } catch (e) {
    const { statut, code } = e as ErreurFonction;
    return (statut && statut < 500) || code === 'r2_non_configure' ? null : 'injoignable';
  } finally {
    clearTimeout(minuteur);
  }
}

export interface ArchiveOuverte {
  /** Adresse de la source MapLibre (`pmtiles://…`), le protocole étant enregistré. */
  url: string;
  archive: PMTiles;
  octets: number | null;
  /** Lue dans la copie complète de l'appareil (aucune requête réseau). */
  locale: boolean;
  etag: string;
}

const protocole = typeof window !== 'undefined' ? new Protocol({ metadata: false }) : null;
const modulesEnregistres = new WeakSet<object>();
const ouvertes = new Map<string, Promise<ArchiveOuverte | null>>();

/** Enregistre le protocole `pmtiles://` auprès du module MapLibre chargé (une fois). */
export function enregistrerProtocole(ml: { addProtocol: (nom: string, f: never) => void }) {
  if (!protocole || modulesEnregistres.has(ml)) return;
  ml.addProtocol('pmtiles', protocole.tile as never);
  modulesEnregistres.add(ml);
}

/**
 * Archive d'un marché prête pour MapLibre : la copie de l'appareil si elle est à jour (même ETag) ou si le serveur est
 * injoignable, sinon R2 par plages. null : absente, refusée, ou ni serveur ni copie.
 * Une seule ouverture par marché, fichier et version pendant la vie de la page.
 */
async function ouvrirArchive(marcheId: string, fichier: FichierCarte): Promise<ArchiveOuverte | null> {
  if (!protocole) return null;
  const [enLigne, copie] = await Promise.all([lireSignee(marcheId, fichier), lireCopie(marcheId, fichier)]);
  // Absente ou refusée en ligne : une copie éventuelle ne vaut plus rien.
  if (enLigne === null) return null;
  const signee = enLigne === 'injoignable' ? null : enLigne;
  const etagEnLigne = normaliserEtag(signee?.etag);
  const locale: CopieLocale | null = copie && (!signee || etagEnLigne === copie.etag) ? copie : null;
  if (!locale && !signee) return null;
  const etag = locale ? locale.etag : etagEnLigne;
  const version = etag.replace(/[^a-z0-9]/gi, '').slice(0, 32) || String(Date.now());
  const cle = `${fichier}-${marcheId}-${version}${locale ? '-local' : ''}`;
  const deja = ouvertes.get(cle);
  if (deja) return deja;
  const promesse = (async () => {
    const source = locale ? sourceCopie(cle, locale) : creerSourceSignee({
      cle, fichier, initiale: signee, cache: cacheNavigateur(),
      lire: () => appeler({ action: 'lire', marche_id: marcheId, fichier }),
    });
    const archive = new PMTiles(source);
    try {
      await archive.getHeader();
    } catch (e) {
      // Typiquement : règle CORS du compartiment sans l'en-tête Range (voir web/README.md § Carte).
      console.warn(`Archive « ${fichier} » illisible :`, e);
      ouvertes.delete(cle);
      return null;
    }
    protocole.add(archive);
    if (!locale) void purgerCache(`${fichier}-${marcheId}-`, cle);
    return { url: `pmtiles://${cle}`, archive, octets: locale ? locale.octets : signee!.octets, locale: !!locale, etag };
  })();
  ouvertes.set(cle, promesse);
  return promesse;
}

export interface TuilesReseau extends ArchiveOuverte {
  infos: InfosTuiles | null;
  /** Bornes du réseau [ouest, sud, est, nord] (en-tête de l'archive). */
  bornes: [number, number, number, number];
  /** Tronçons de l'archive (uuid, longueur, secteur, diamètre) et uuid → identifiant entier des tuiles. */
  index: IndexTroncons;
  versEntier: Map<string, number>;
}

const reseauxOuverts = new WeakMap<ArchiveOuverte, Promise<TuilesReseau | null>>();

/** Archive du réseau du marché, prête pour MapLibre, ou null (absente, stockage non configuré, lecture refusée). */
export async function ouvrirTuilesReseau(marcheId: string): Promise<TuilesReseau | null> {
  const a = await ouvrirArchive(marcheId, 'reseau');
  if (!a) return null;
  let promesse = reseauxOuverts.get(a);
  if (!promesse) {
    promesse = (async () => {
      try {
        const h = await a.archive.getHeader();
        const meta = await a.archive.getMetadata();
        const index = lireIndexTroncons(meta);
        if (!index) throw new Error('archive sans index des tronçons');
        return {
          ...a, infos: lireInfosTuiles(meta), bornes: [h.minLon, h.minLat, h.maxLon, h.maxLat], index,
          versEntier: new Map(index.ids.map((id, i) => [id, i + 1])),
        } as TuilesReseau;
      } catch (e) {
        console.warn('Tuiles du réseau illisibles, lecture par secteur :', e);
        return null;
      }
    })();
    reseauxOuverts.set(a, promesse);
  }
  return promesse;
}

export interface FondCarte extends ArchiveOuverte {
  bornes: [number, number, number, number];
  zoomMax: number;
}

/** Fond de carte hors ligne de la ville (extrait OpenStreetMap de Protomaps), ou null s'il n'a pas été déposé. */
export async function ouvrirFondCarte(marcheId: string): Promise<FondCarte | null> {
  const a = await ouvrirArchive(marcheId, 'fond');
  if (!a) return null;
  const h = await a.archive.getHeader();
  return { ...a, bornes: [h.minLon, h.minLat, h.maxLon, h.maxLat], zoomMax: h.maxZoom };
}

/** Dépose une archive (administrateur ou « paramètres / modifier », vérifié par la fonction). */
export async function deposerTuiles(marcheId: string, octets: Uint8Array | Blob, fichier: FichierCarte = 'reseau'): Promise<void> {
  const r = (await appeler({ action: 'deposer', marche_id: marcheId, fichier })) as { url?: string; chemin?: string } | null;
  if (!r?.url) throw new Error('Dépôt refusé.');
  if (fichier === 'fond' && !r.chemin?.startsWith('fonds/')) {
    throw new Error('La fonction reseau-tuiles n\'est pas encore à jour (lot CH) : dépôt du fond impossible.');
  }
  const envoi = await fetch(r.url, { method: 'PUT', body: octets as unknown as BodyInit, headers: { 'Content-Type': 'application/vnd.pmtiles' } });
  if (!envoi.ok) throw new Error(`Dépôt refusé par le stockage (HTTP ${envoi.status}).`);
  for (const k of [...ouvertes.keys()]) if (k.startsWith(`${fichier}-${marcheId}-`)) ouvertes.delete(k);
}

const messageIndisponible = (e: unknown) =>
  (e as ErreurFonction).code === 'r2_non_configure' ? 'Stockage R2 non configuré sur le serveur.' : (e as Error).message;

/** État de l'archive du réseau pour Paramètres > Réseau : absente, ou présente avec ses infos. */
export async function etatTuiles(marcheId: string): Promise<{ disponible: boolean; tuiles: TuilesReseau | null; erreur?: string }> {
  try {
    const corps = await appeler({ action: 'lire', marche_id: marcheId });
    if (!reponseLisible(corps)) return { disponible: true, tuiles: null };
  } catch (e) {
    return { disponible: false, tuiles: null, erreur: messageIndisponible(e) };
  }
  return { disponible: true, tuiles: await ouvrirTuilesReseau(marcheId) };
}

export interface EtatFond { disponible: boolean; existe: boolean; octets: number | null; modifieLe: string | null; erreur?: string }

/** État du fond de carte hors ligne pour Paramètres > Réseau. */
export async function etatFond(marcheId: string): Promise<EtatFond> {
  const vide = { existe: false, octets: null, modifieLe: null };
  try {
    const c = (await appeler({ action: 'lire', marche_id: marcheId, fichier: 'fond' })) as
      { existe?: boolean; fichier?: string; octets?: number; modifie_le?: string } | null;
    if (c?.fichier !== 'fond') return { disponible: false, ...vide, erreur: 'la fonction reseau-tuiles n\'est pas encore à jour (lot CH)' };
    return { disponible: true, existe: c.existe === true, octets: c.octets ?? null, modifieLe: c.modifie_le ?? null };
  } catch (e) {
    return { disponible: false, ...vide, erreur: messageIndisponible(e) };
  }
}

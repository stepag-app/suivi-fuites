// Mode hors ligne léger : les fuites créées sans réseau sont gardées dans IndexedDB (avec leurs
// photos déjà compressées) puis envoyées au retour du réseau. Les identifiants (uuid) sont
// créés sur l'appareil : renvoyer deux fois la même fuite est sans effet (clé déjà présente).
// Plus bas : copies des fiches déjà ouvertes, pour les consulter sans réseau (base séparée).
import { deposerPhoto } from './photo';
import { configurationManquante, getSupabase } from './supabase';

export interface FuiteEnAttente {
  id: string;
  marche_id: string;
  ligne: Record<string, unknown>; // colonnes de la table `fuites`
  creee_le: string;
  erreur: string | null;
}

export interface PhotoEnAttente {
  id: string;
  fuite_id: string;
  marche_id: string;
  blob: Blob;
  largeur: number;
  hauteur: number;
  position: string | null;
  prise_le: string;
}

/** Balayage d'un tronçon saisi sur la carte (lot S) : même mécanique que les fuites, sans photo. */
export interface BalayageEnAttente {
  id: string;
  marche_id: string;
  ligne: Record<string, unknown>; // colonnes de la table `balayages`
  creee_le: string;
  erreur: string | null;
}

/** Types d'envois gardés dans la file d'attente. */
export type TypeEnvoi = 'fuite' | 'photo' | 'balayage';

const BASE = 'suivi-fuites';
// Version 2 : magasin « balayages » (lot S). La mise à niveau ne touche pas aux magasins existants.
const VERSION = 2;
const EVENEMENT = 'attente-change';

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const requete = indexedDB.open(BASE, VERSION);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains('fuites')) db.createObjectStore('fuites', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('photos')) {
        const photos = db.createObjectStore('photos', { keyPath: 'id' });
        photos.createIndex('fuite_id', 'fuite_id');
      }
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'cle' });
      if (!db.objectStoreNames.contains('balayages')) db.createObjectStore('balayages', { keyPath: 'id' });
    };
    requete.onsuccess = () => ok(requete.result);
    requete.onerror = () => ko(requete.error);
  });
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (t: IDBTransaction) => IDBRequest<T> | void,
  base: () => Promise<IDBDatabase> = ouvrir,
): Promise<T | undefined> {
  const db = await base();
  return new Promise((ok, ko) => {
    const t = db.transaction(stores, mode);
    const requete = action(t);
    t.oncomplete = () => {
      db.close();
      ok(requete ? requete.result : undefined);
    };
    t.onerror = () => {
      db.close();
      ko(t.error);
    };
    t.onabort = () => {
      db.close();
      ko(t.error);
    };
  });
}

const prevenir = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENEMENT));
};

export const ecouterAttente = (f: () => void) => {
  window.addEventListener(EVENEMENT, f);
  return () => window.removeEventListener(EVENEMENT, f);
};

// ---- Cache des listes de référence (secteurs, etc.) --------------------------------------------

export async function mettreEnCache(cle: string, valeur: unknown) {
  try {
    await transaction(['cache'], 'readwrite', (t) => t.objectStore('cache').put({ cle, valeur }));
  } catch {
    /* stockage indisponible : sans conséquence */
  }
}

export async function lireCache<T>(cle: string): Promise<T | null> {
  try {
    const ligne = (await transaction(['cache'], 'readonly', (t) => t.objectStore('cache').get(cle))) as
      | { valeur: T }
      | undefined;
    return ligne?.valeur ?? null;
  } catch {
    return null;
  }
}

// ---- File d'attente ------------------------------------------------------------------------------

export async function mettreFuiteEnAttente(
  fuite: Omit<FuiteEnAttente, 'creee_le' | 'erreur'>,
  photos: PhotoEnAttente[],
) {
  await transaction(['fuites', 'photos'], 'readwrite', (t) => {
    t.objectStore('fuites').put({ ...fuite, creee_le: new Date().toISOString(), erreur: null });
    for (const p of photos) t.objectStore('photos').put(p);
  });
  prevenir();
}

export async function listerAttente(): Promise<{ fuites: FuiteEnAttente[]; photos: PhotoEnAttente[] }> {
  try {
    const db = await ouvrir();
    const lire = <T,>(store: string) =>
      new Promise<T[]>((ok, ko) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => ok(r.result as T[]);
        r.onerror = () => ko(r.error);
      });
    const [fuites, photos] = await Promise.all([lire<FuiteEnAttente>('fuites'), lire<PhotoEnAttente>('photos')]);
    db.close();
    fuites.sort((a, b) => a.creee_le.localeCompare(b.creee_le));
    return { fuites, photos };
  } catch {
    return { fuites: [], photos: [] };
  }
}

export async function compterAttente(): Promise<number> {
  const { fuites, photos } = await listerAttente();
  const orphelines = photos.filter((p) => !fuites.some((f) => f.id === p.fuite_id)).length;
  return fuites.length + orphelines;
}

export async function abandonnerFuite(id: string) {
  await transaction(['fuites', 'photos'], 'readwrite', (t) => {
    t.objectStore('fuites').delete(id);
    const index = t.objectStore('photos').index('fuite_id');
    index.openKeyCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
      const curseur = (e.target as IDBRequest<IDBCursor | null>).result;
      if (curseur) {
        t.objectStore('photos').delete(curseur.primaryKey);
        curseur.continue();
      }
    };
  });
  prevenir();
}

// ---- Balayages en attente (lot S) ------------------------------------------------------------------
// Les balayages cochés sur la carte sont gardés ici avant l'envoi : sans réseau, ils partent avec la
// synchronisation suivante. Comptés à part des fuites (le bandeau de l'en-tête parle de fuites).

export async function mettreBalayagesEnAttente(lignes: { id: string; marche_id: string; ligne: Record<string, unknown> }[]) {
  if (!lignes.length) return;
  const quand = new Date().toISOString();
  await transaction(['balayages'], 'readwrite', (t) => {
    const store = t.objectStore('balayages');
    for (const b of lignes) store.put({ ...b, creee_le: quand, erreur: null } satisfies BalayageEnAttente);
  });
  prevenir();
}

export async function listerBalayagesEnAttente(): Promise<BalayageEnAttente[]> {
  try {
    const lignes = (await transaction(['balayages'], 'readonly', (t) => t.objectStore('balayages').getAll())) as BalayageEnAttente[] | undefined;
    return [...(lignes ?? [])].sort((a, b) => a.creee_le.localeCompare(b.creee_le));
  } catch {
    return [];
  }
}

export const compterBalayagesEnAttente = async () => (await listerBalayagesEnAttente()).length;

export async function abandonnerBalayage(id: string) {
  await transaction(['balayages'], 'readwrite', (t) => t.objectStore('balayages').delete(id));
  prevenir();
}

async function marquerErreurBalayage(id: string, message: string) {
  try {
    await transaction(['balayages'], 'readwrite', (t) => {
      const store = t.objectStore('balayages');
      const r = store.get(id);
      r.onsuccess = () => {
        if (r.result) store.put({ ...r.result, erreur: message });
      };
    });
  } catch {
    /* sans conséquence : réessayé plus tard */
  }
}

// ---- Synchronisation -------------------------------------------------------------------------------

interface ErreurApi { code?: string; message?: string; statusCode?: string | number; status?: number }

// Réseau absent ou coupé en cours de route : on s'arrête sans rien perdre.
export const estErreurReseau = (e: unknown) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = String((e as ErreurApi)?.message ?? e).toLowerCase();
  return m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed') ||
    m.includes('network request failed') || m.includes('fetch');
};

// Déjà envoyé lors d'un essai précédent : on considère l'étape réussie.
const estDejaEnvoye = (e: ErreurApi) =>
  e.code === '23505' || String(e.statusCode) === '409' || /already exists|duplicate/i.test(e.message ?? '');

async function marquerErreur(id: string, message: string) {
  const db = await ouvrir();
  await new Promise<void>((ok) => {
    const t = db.transaction('fuites', 'readwrite');
    const store = t.objectStore('fuites');
    const r = store.get(id);
    r.onsuccess = () => {
      if (r.result) store.put({ ...r.result, erreur: message });
    };
    t.oncomplete = () => ok();
    t.onerror = () => ok();
  });
  db.close();
}

async function supprimerPhoto(id: string) {
  await transaction(['photos'], 'readwrite', (t) => t.objectStore('photos').delete(id));
}
async function supprimerFuite(id: string) {
  await transaction(['fuites'], 'readwrite', (t) => t.objectStore('fuites').delete(id));
}

let enCours: Promise<{ envoyees: number; restantes: number }> | null = null;

/** Envoie tout ce qui attend. Une seule synchronisation à la fois. */
export function synchroniser(): Promise<{ envoyees: number; restantes: number }> {
  if (!enCours) {
    enCours = executerSynchro().finally(() => {
      enCours = null;
      prevenir();
    });
  }
  return enCours;
}

async function executerSynchro() {
  let envoyees = 0;
  const sb = getSupabase();
  const { data } = await sb.auth.getSession();
  if (!data.session) return { envoyees, restantes: await compterAttente() };

  const { fuites, photos } = await listerAttente();
  const ids = new Set(fuites.map((f) => f.id));
  // Photos dont la fuite a déjà été envoyée mais pas la photo (coupure en cours de route).
  const orphelines = photos.filter((p) => !ids.has(p.fuite_id));

  const envoyerPhoto = async (p: PhotoEnAttente): Promise<'ok' | 'reseau' | string> => {
    try {
      const { stockage, chemin } = await deposerPhoto(p.blob, { marche_id: p.marche_id, fuite_id: p.fuite_id, id: p.id });
      const ligne = await sb.from('photos').insert({
        id: p.id, marche_id: p.marche_id, fuite_id: p.fuite_id, type: 'detection', stockage, chemin,
        position: p.position, prise_le: p.prise_le,
        largeur_px: p.largeur, hauteur_px: p.hauteur, taille_octets: p.blob.size,
      });
      if (ligne.error && !estDejaEnvoye(ligne.error)) throw ligne.error;
      await supprimerPhoto(p.id);
      return 'ok';
    } catch (e) {
      if (estErreurReseau(e)) return 'reseau';
      return String((e as ErreurApi)?.message ?? e);
    }
  };

  for (const f of fuites) {
    try {
      const { error } = await sb.from('fuites').insert({ ...f.ligne, id: f.id, marche_id: f.marche_id });
      if (error && !estDejaEnvoye(error)) throw error;
    } catch (e) {
      if (estErreurReseau(e)) break;
      await marquerErreur(f.id, String((e as ErreurApi)?.message ?? e));
      continue;
    }
    let toutOk = true;
    for (const p of photos.filter((x) => x.fuite_id === f.id)) {
      const r = await envoyerPhoto(p);
      if (r === 'reseau') return { envoyees, restantes: await compterAttente() };
      if (r !== 'ok') {
        toutOk = false;
        await marquerErreur(f.id, r);
      }
    }
    if (toutOk) {
      await supprimerFuite(f.id);
      envoyees++;
    }
  }
  for (const p of orphelines) {
    const r = await envoyerPhoto(p);
    if (r === 'reseau') break;
  }
  // Balayages (lot S) : une ligne par tronçon, identifiant créé sur l'appareil ; un doublon vaut succès.
  for (const b of await listerBalayagesEnAttente()) {
    try {
      const { error } = await sb.from('balayages').insert({ ...b.ligne, id: b.id, marche_id: b.marche_id });
      if (error && !estDejaEnvoye(error)) throw error;
      await transaction(['balayages'], 'readwrite', (t) => t.objectStore('balayages').delete(b.id));
    } catch (e) {
      if (estErreurReseau(e)) break;
      await marquerErreurBalayage(b.id, String((e as ErreurApi)?.message ?? e));
    }
  }
  return { envoyees, restantes: await compterAttente() };
}

// ---- Fiches consultées : copie des fiches ouvertes en ligne, lisible sans réseau -------------------
// Base à part : la purger ou la vider ne touche jamais aux envois en attente. La fiche (données déjà
// filtrées par la RLS pour ce compte) et ses photos réduites, clé = identifiant de la photo (jamais
// l'URL signée, qui change et expire). Les règles (taille, purge, actions) sont dans
// `app/(app)/fuites/[id]/fiche-hors-ligne.ts`.

export interface EnteteFicheGardee {
  id: string;
  utilisateur_id: string;
  consultee_le: string;
  nb_photos: number;
}

interface PhotoGardee {
  cle: string;
  fuite_id: string;
  blob: Blob;
}

const BASE_FICHES = 'suivi-fuites-fiches';

function ouvrirFiches(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const requete = indexedDB.open(BASE_FICHES, 1);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      db.createObjectStore('fiches', { keyPath: 'id' });
      db.createObjectStore('photos', { keyPath: 'cle' }).createIndex('fuite_id', 'fuite_id');
    };
    requete.onsuccess = () => ok(requete.result);
    requete.onerror = () => ko(requete.error);
  });
}

const dansFiches = <T,>(stores: string[], mode: IDBTransactionMode, action: (t: IDBTransaction) => IDBRequest<T> | void) =>
  transaction(stores, mode, action, ouvrirFiches);

/** Tout effacer (déconnexion, ou copies d'un autre compte). */
export async function effacerFichesGardees() {
  try {
    await dansFiches(['fiches', 'photos'], 'readwrite', (t) => {
      t.objectStore('fiches').clear();
      t.objectStore('photos').clear();
    });
  } catch {
    /* base absente ou indisponible : rien à effacer */
  }
}

/** Copie gardée de la fiche, seulement si elle appartient à ce compte. */
export async function lireFicheGardee<T extends EnteteFicheGardee>(id: string, utilisateurId: string): Promise<T | null> {
  try {
    const fiche = (await dansFiches(['fiches'], 'readonly', (t) => t.objectStore('fiches').get(id))) as T | undefined;
    if (!fiche) return null;
    if (fiche.utilisateur_id !== utilisateurId) {
      // Copies d'un autre compte (déconnexion faite sans réseau, par exemple) : jamais montrées.
      await effacerFichesGardees();
      return null;
    }
    return fiche;
  } catch {
    return null;
  }
}

/**
 * Enregistre la copie puis, dans la même transaction, efface les copies choisies par `aPurger`
 * (plus anciennes, autre compte) et les photos qui n'ont plus de fiche.
 */
export async function garderFiche<T extends EnteteFicheGardee>(fiche: T, aPurger: (entetes: EnteteFicheGardee[]) => string[]) {
  await dansFiches(['fiches', 'photos'], 'readwrite', (t) => {
    const fiches = t.objectStore('fiches');
    const photos = t.objectStore('photos');
    fiches.put(fiche);
    const tout = fiches.getAll();
    tout.onsuccess = () => {
      const entetes = (tout.result as EnteteFicheGardee[]).map(({ id, utilisateur_id, consultee_le, nb_photos }) => ({
        id, utilisateur_id, consultee_le, nb_photos,
      }));
      const effacees = new Set(aPurger(entetes));
      effacees.forEach((id) => fiches.delete(id));
      const gardees = new Set(entetes.map((e) => e.id).filter((id) => !effacees.has(id)));
      photos.index('fuite_id').openKeyCursor().onsuccess = (e) => {
        const curseur = (e.target as IDBRequest<IDBCursor | null>).result;
        if (!curseur) return;
        if (!gardees.has(String(curseur.key))) photos.delete(curseur.primaryKey);
        curseur.continue();
      };
    };
  });
}

/** Note l'ouverture d'une copie (ordre de purge : les moins récemment ouvertes partent d'abord). */
export async function noterConsultation(id: string, quand: string) {
  try {
    await dansFiches(['fiches'], 'readwrite', (t) => {
      const fiches = t.objectStore('fiches');
      const r = fiches.get(id);
      r.onsuccess = () => {
        if (r.result) fiches.put({ ...r.result, consultee_le: quand });
      };
    });
  } catch {
    /* sans conséquence */
  }
}

/** Fiche introuvable ou refusée en ligne : sa copie et ses photos sont effacées. */
export async function oublierFiche(id: string) {
  try {
    await dansFiches(['fiches', 'photos'], 'readwrite', (t) => {
      t.objectStore('fiches').delete(id);
      const photos = t.objectStore('photos');
      photos.index('fuite_id').openKeyCursor(IDBKeyRange.only(id)).onsuccess = (e) => {
        const curseur = (e.target as IDBRequest<IDBCursor | null>).result;
        if (curseur) {
          photos.delete(curseur.primaryKey);
          curseur.continue();
        }
      };
    });
  } catch {
    /* sans conséquence */
  }
}

export async function clesPhotosGardees(fuiteId: string): Promise<string[]> {
  try {
    const cles = await dansFiches(['photos'], 'readonly', (t) =>
      t.objectStore('photos').index('fuite_id').getAllKeys(IDBKeyRange.only(fuiteId)));
    return ((cles ?? []) as IDBValidKey[]).map(String);
  } catch {
    return [];
  }
}

/** Garde une photo, seulement si la copie de sa fiche existe encore (pas de photo orpheline). */
export async function garderPhoto(photo: PhotoGardee) {
  await dansFiches(['fiches', 'photos'], 'readwrite', (t) => {
    const r = t.objectStore('fiches').getKey(photo.fuite_id);
    r.onsuccess = () => {
      if (r.result !== undefined) t.objectStore('photos').put(photo);
    };
  });
}

export async function oublierPhotos(cles: string[]) {
  if (!cles.length) return;
  await dansFiches(['photos'], 'readwrite', (t) => {
    const photos = t.objectStore('photos');
    cles.forEach((cle) => photos.delete(cle));
  });
}

/** Photos gardées d'une fiche, par clé (identifiant de la photo). */
export async function lirePhotosGardees(fuiteId: string): Promise<Map<string, Blob>> {
  try {
    const lignes = (await dansFiches(['photos'], 'readonly', (t) =>
      t.objectStore('photos').index('fuite_id').getAll(IDBKeyRange.only(fuiteId)))) as PhotoGardee[] | undefined;
    return new Map((lignes ?? []).map((p) => [p.cle, p.blob]));
  } catch {
    return new Map();
  }
}

/**
 * Demande au service worker de garder la page de la fiche (sans données) pour l'ouvrir hors ligne :
 * nécessaire quand la fiche a été ouverte depuis la liste, sans chargement complet de la page.
 */
export function preparerFicheHorsLigne(id: string) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'coquille-fiche', id });
  } catch {
    /* pas de service worker (développement) */
  }
}

// Déconnexion (bouton « Quitter », ou session refusée par le serveur) : les copies sont effacées.
// Ce module est chargé sur toutes les pages de l'application (bandeau réseau de l'en-tête).
if (typeof window !== 'undefined' && !configurationManquante()) {
  getSupabase().auth.onAuthStateChange((evenement) => {
    if (evenement === 'SIGNED_OUT') void effacerFichesGardees();
  });
}

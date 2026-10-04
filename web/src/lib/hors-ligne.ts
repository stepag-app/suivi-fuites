// Mode hors ligne léger : les fuites créées sans réseau sont gardées dans IndexedDB (avec leurs
// photos déjà compressées) puis envoyées au retour du réseau. Les identifiants (uuid) sont
// créés sur l'appareil : renvoyer deux fois la même fuite est sans effet (clé déjà présente).
import { getSupabase } from './supabase';

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

const BASE = 'suivi-fuites';
const EVENEMENT = 'attente-change';

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const requete = indexedDB.open(BASE, 1);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      db.createObjectStore('fuites', { keyPath: 'id' });
      const photos = db.createObjectStore('photos', { keyPath: 'id' });
      photos.createIndex('fuite_id', 'fuite_id');
      db.createObjectStore('cache', { keyPath: 'cle' });
    };
    requete.onsuccess = () => ok(requete.result);
    requete.onerror = () => ko(requete.error);
  });
}

async function transaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (t: IDBTransaction) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await ouvrir();
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

// ---- Synchronisation -------------------------------------------------------------------------------

interface ErreurApi { code?: string; message?: string; statusCode?: string | number; status?: number }

// Réseau absent ou coupé en cours de route : on s'arrête sans rien perdre.
const estErreurReseau = (e: unknown) => {
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
      const chemin = `${p.marche_id}/${p.fuite_id}/${p.id}.jpg`;
      const tele = await sb.storage.from('photos').upload(chemin, p.blob, { contentType: 'image/jpeg' });
      if (tele.error && !estDejaEnvoye(tele.error as ErreurApi)) throw tele.error;
      const ligne = await sb.from('photos').insert({
        id: p.id, marche_id: p.marche_id, fuite_id: p.fuite_id, type: 'detection', chemin,
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
  return { envoyees, restantes: await compterAttente() };
}

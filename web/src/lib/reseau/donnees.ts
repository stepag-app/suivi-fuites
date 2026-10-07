// Accès à la base pour le réseau (contrat § 3) : fonctions RPC, vues lues par pages, cache IndexedDB
// des géométries par secteur (base `suivi-fuites-reseau`, clé `marche:secteur`, invalidée quand le
// `modifie_le` de `v_lineaire_secteurs` change). L'état de balayage n'est jamais mis en cache : il est
// relu à chaque ouverture et posé par `setFeatureState` (voir etat.ts et carte/reseau-carte.ts).
import type { MultiPolygon, Polygon } from 'geojson';
import { messageErreur } from '@/lib/format';
import { listerBalayagesEnAttente, mettreBalayagesEnAttente, synchroniser } from '@/lib/hors-ligne';
import { getSupabase, lireTout } from '@/lib/supabase';
import type {
  EtatBalayageTroncon, LigneBalayageJournalier, LigneLineaireSecteur, TronconsSansSecteur,
} from '@/lib/types';
import { cleCache } from './arbre';
import { enFileAttente, type LigneBalayageEnvoi } from './balayage';
import { cumulerResultats, decouperEnPaquets, type ContourSecteurLu, type GenreImport } from './import';
import type { FiltresJournal } from './journal';
import {
  SANS_SECTEUR, type CollectionNoeuds, type CollectionTroncons, type ResultatImportReseau, type SecteurReseau, type ZoneReseau,
} from './types';

export interface EquipeReseau { id: string; type: 'detection' | 'reparation' | 'mixte'; numero: number; libelle: string; actif: boolean }

const CODES_BASE_ABSENTE = new Set(['42883', '42P01', 'PGRST202', 'PGRST205']);
const codeDe = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code ?? '') : '');

/** Base pas encore à jour (migration du lot S2 absente) : fonctions ou vues introuvables. */
export const estBaseSansReseau = (e: unknown) => CODES_BASE_ABSENTE.has(codeDe(e));

export function messageReseau(e: unknown): string {
  const code = codeDe(e);
  if (code === '42501') return 'Action réservée à l\'administrateur ou au droit « paramètres / modifier ».';
  if (CODES_BASE_ABSENTE.has(code)) return 'La base de données n\'a pas encore le plan du réseau (migration du lot S2 à déployer).';
  return messageErreur(e);
}

// ---- Cache des géométries (IndexedDB) ---------------------------------------------------------------

const BASE_RESEAU = 'suivi-fuites-reseau';
type Magasin = 'troncons' | 'noeuds';

interface EntreeCache<T> {
  cle: string;
  modifie_le: string | null;
  enregistre_le: string;
  collection: T;
}

function ouvrirReseau(): Promise<IDBDatabase> {
  return new Promise((ok, ko) => {
    const requete = indexedDB.open(BASE_RESEAU, 1);
    requete.onupgradeneeded = () => {
      const db = requete.result;
      if (!db.objectStoreNames.contains('troncons')) db.createObjectStore('troncons', { keyPath: 'cle' });
      if (!db.objectStoreNames.contains('noeuds')) db.createObjectStore('noeuds', { keyPath: 'cle' });
    };
    requete.onsuccess = () => ok(requete.result);
    requete.onerror = () => ko(requete.error);
  });
}

async function dansReseau<T>(magasin: Magasin, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await ouvrirReseau();
  return new Promise((ok, ko) => {
    const t = db.transaction(magasin, mode);
    const r = action(t.objectStore(magasin));
    t.oncomplete = () => { db.close(); ok(r ? r.result : undefined); };
    t.onerror = () => { db.close(); ko(t.error); };
    t.onabort = () => { db.close(); ko(t.error); };
  });
}

async function lireEntree<T>(magasin: Magasin, cle: string): Promise<EntreeCache<T> | null> {
  try {
    if (typeof indexedDB === 'undefined') return null;
    return ((await dansReseau(magasin, 'readonly', (s) => s.get(cle))) as EntreeCache<T> | undefined) ?? null;
  } catch {
    return null;
  }
}

async function ecrireEntree<T>(magasin: Magasin, entree: EntreeCache<T>) {
  try {
    if (typeof indexedDB === 'undefined') return;
    await dansReseau(magasin, 'readwrite', (s) => s.put(entree));
  } catch {
    /* stockage indisponible : la carte fonctionne sans cache */
  }
}

/** Tout oublier (après un import, un zonage, ou à la demande). */
export async function viderCacheReseau() {
  try {
    if (typeof indexedDB === 'undefined') return;
    await dansReseau('troncons', 'readwrite', (s) => s.clear());
    await dansReseau('noeuds', 'readwrite', (s) => s.clear());
  } catch {
    /* sans conséquence */
  }
}

// ---- Contexte : zones, secteurs, linéaires -----------------------------------------------------------

export interface ContexteReseau {
  zones: ZoneReseau[];
  secteurs: SecteurReseau[];
  lignes: LigneLineaireSecteur[];
  sansSecteur: TronconsSansSecteur | null;
  /** false : la base n'a pas encore les vues du réseau (lot S2). */
  disponible: boolean;
}

export async function chargerContexteReseau(marcheId: string): Promise<ContexteReseau> {
  const sb = getSupabase();
  const [z, s] = await Promise.all([
    sb.from('zones').select('id, numero, code, libelle, lineaire_m, geom').eq('marche_id', marcheId).eq('actif', true).order('numero'),
    sb.from('secteurs').select('id, zone_id, code, libelle, ordre, statut_balayage, geom').eq('marche_id', marcheId).eq('actif', true).order('ordre').order('code'),
  ]);
  if (z.error) throw z.error;
  if (s.error) throw s.error;
  let lignes: LigneLineaireSecteur[] = [];
  let sansSecteur: TronconsSansSecteur | null = null;
  let disponible = true;
  try {
    lignes = await lireTout<LigneLineaireSecteur>((de, a) => sb.from('v_lineaire_secteurs').select('*').eq('marche_id', marcheId)
      .order('secteur_id').range(de, a) as unknown as PromiseLike<{ data: LigneLineaireSecteur[] | null; error: { message: string } | null }>);
    const r = await sb.from('v_troncons_sans_secteur').select('*').eq('marche_id', marcheId).maybeSingle();
    if (r.error) throw r.error;
    sansSecteur = (r.data as TronconsSansSecteur | null) ?? null;
  } catch (e) {
    if (!estBaseSansReseau(e)) throw e;
    disponible = false;
  }
  return {
    zones: (z.data as ZoneReseau[] | null) ?? [],
    secteurs: (s.data as SecteurReseau[] | null) ?? [],
    lignes, sansSecteur, disponible,
  };
}

// ---- Géométries par secteur -----------------------------------------------------------------------------

const collectionVide = <T extends { type: 'FeatureCollection'; features: unknown[] }>() => ({ type: 'FeatureCollection', features: [] } as unknown as T);

const normaliser = <T extends { type: 'FeatureCollection'; features: unknown[] }>(data: unknown): T => {
  if (data && typeof data === 'object' && (data as { type?: unknown }).type === 'FeatureCollection' && Array.isArray((data as { features?: unknown }).features)) {
    return data as T;
  }
  return collectionVide<T>();
};

/**
 * Tronçons d'un secteur (ou sans secteur : `SANS_SECTEUR`), depuis le cache si le `modifie_le` de la vue
 * n'a pas changé, sinon depuis `reseau_geojson`.
 */
export async function chargerTronconsSecteur(marcheId: string, secteurId: string, modifieLe: string | null, forcer = false): Promise<CollectionTroncons> {
  const cle = cleCache(marcheId, secteurId);
  if (!forcer) {
    const entree = await lireEntree<CollectionTroncons>('troncons', cle);
    if (entree && entree.modifie_le === modifieLe) return entree.collection;
  }
  const sansSecteur = secteurId === SANS_SECTEUR;
  const { data, error } = await getSupabase().rpc('reseau_geojson', {
    p_marche: marcheId, p_secteurs: sansSecteur ? [] : [secteurId], p_sans_secteur: sansSecteur, p_tolerance: 0,
  });
  if (error) throw error;
  const collection = normaliser<CollectionTroncons>(data);
  await ecrireEntree('troncons', { cle, modifie_le: modifieLe, enregistre_le: new Date().toISOString(), collection });
  return collection;
}

export async function chargerNoeudsSecteur(marcheId: string, secteurId: string, modifieLe: string | null): Promise<CollectionNoeuds> {
  const cle = cleCache(marcheId, secteurId);
  const entree = await lireEntree<CollectionNoeuds>('noeuds', cle);
  if (entree && entree.modifie_le === modifieLe) return entree.collection;
  const sansSecteur = secteurId === SANS_SECTEUR;
  const { data, error } = await getSupabase().rpc('noeuds_geojson', {
    p_marche: marcheId, p_secteurs: sansSecteur ? [] : [secteurId], p_sans_secteur: sansSecteur,
  });
  if (error) throw error;
  const collection = normaliser<CollectionNoeuds>(data);
  await ecrireEntree('noeuds', { cle, modifie_le: modifieLe, enregistre_le: new Date().toISOString(), collection });
  return collection;
}

/** Tout le réseau du marché, zoné ou non, légèrement simplifié (carte de zonage ; jamais en cache). */
export async function chargerReseauComplet(marcheId: string, tolerance = 0.000005): Promise<CollectionTroncons> {
  const { data, error } = await getSupabase().rpc('reseau_geojson', {
    p_marche: marcheId, p_secteurs: null, p_sans_secteur: true, p_tolerance: tolerance,
  });
  if (error) throw error;
  return normaliser<CollectionTroncons>(data);
}

// ---- État de balayage, équipes, noms --------------------------------------------------------------------

/** Relu à chaque ouverture ; sans droit `balayage / lire` la base renvoie zéro ligne. */
export async function chargerEtatBalayage(marcheId: string): Promise<EtatBalayageTroncon[]> {
  // Un seul document JSON : une réponse en lignes serait plafonnée à 1 000 tronçons par l'API (essai de charge).
  const { data, error } = await getSupabase().rpc('etat_balayage_compact', { p_marche: marcheId });
  if (error) {
    if (codeDe(error) === '42501') return [];
    if (codeDe(error) === 'PGRST202' || codeDe(error) === '42883') return chargerEtatBalayageEnLignes(marcheId);
    throw error;
  }
  return data ? deplierEtatBalayage(data as EtatBalayageCompact) : [];
}

/** Forme en colonnes de `etat_balayage_compact` (e / a : rang dans equipes / agents). */
export interface EtatBalayageCompact {
  t: string[]; p: string[]; d: string[]; n: number[]; e: (number | null)[]; a: (number | null)[];
  equipes: string[]; agents: string[];
}

export function deplierEtatBalayage(c: EtatBalayageCompact): EtatBalayageTroncon[] {
  return c.t.map((troncon_id, i) => ({
    troncon_id, premier_le: c.p[i], dernier_le: c.d[i], nb_passages: c.n[i],
    equipe_id: c.e[i] == null ? null : c.equipes[c.e[i]!], agent_id: c.a[i] == null ? null : c.agents[c.a[i]!],
  }));
}

// Base sans la migration 20261007120000 : lecture page par page de `etat_balayage`.
const chargerEtatBalayageEnLignes = (marcheId: string) =>
  lireTout<EtatBalayageTroncon>((de, a) => getSupabase().rpc('etat_balayage', { p_marche: marcheId })
    .order('troncon_id').range(de, a) as unknown as PromiseLike<{ data: EtatBalayageTroncon[] | null; error: { message: string } | null }>);

export async function chargerEquipes(marcheId: string): Promise<EquipeReseau[]> {
  const { data, error } = await getSupabase().from('equipes').select('id, type, numero, libelle, actif')
    .eq('marche_id', marcheId).order('type').order('numero');
  if (error) throw error;
  return (data as EquipeReseau[] | null) ?? [];
}

/** Noms des agents (la RLS ne montre que les profils du même marché ; les autres restent anonymes). */
export async function chargerNomsProfils(ids: Iterable<string>): Promise<Map<string, string>> {
  const liste = [...new Set(ids)].filter(Boolean);
  const noms = new Map<string, string>();
  for (const paquet of decouperEnPaquets(liste, 200)) {
    const { data, error } = await getSupabase().from('profils').select('id, nom_complet').in('id', paquet);
    if (error) break;
    for (const p of (data as { id: string; nom_complet: string }[] | null) ?? []) noms.set(p.id, p.nom_complet);
  }
  return noms;
}

// ---- Zonage (administrateur ou « paramètres / modifier ») -------------------------------------------------

export type ModePolygone = 'ajouter' | 'retirer' | 'remplacer';

export async function affecterTronconsSecteur(secteurId: string | null, troncons: string[]): Promise<number> {
  const { data, error } = await getSupabase().rpc('affecter_troncons_secteur', { p_secteur: secteurId, p_troncons: troncons });
  if (error) throw error;
  await viderCacheReseau();
  return Number(data) || 0;
}

export async function affecterTronconsPolygone(secteurId: string, polygone: Polygon | MultiPolygon, mode: ModePolygone = 'ajouter'): Promise<number> {
  const { data, error } = await getSupabase().rpc('affecter_troncons_polygone', { p_secteur: secteurId, p_polygone: polygone, p_mode: mode });
  if (error) throw error;
  await viderCacheReseau();
  return Number(data) || 0;
}

export async function recalculerContourSecteur(secteurId: string): Promise<void> {
  const { error } = await getSupabase().rpc('recalculer_contour_secteur', { p_secteur: secteurId });
  if (error) throw error;
}

export async function definirContourSecteur(secteurId: string, polygone: Polygon | MultiPolygon): Promise<void> {
  const { error } = await getSupabase().rpc('definir_contour_secteur', { p_secteur: secteurId, p_polygone: polygone });
  if (error) throw error;
}

// ---- Import (administrateur) -------------------------------------------------------------------------------

/** Envoie les features par paquets de 1 000 (contrat § 3 : 2 000 au plus par appel) et cumule les résultats. */
export async function importerFeatures(
  genre: GenreImport, marcheId: string, features: unknown[], progression: (faits: number, total: number) => void = () => undefined,
): Promise<ResultatImportReseau> {
  const fonction = genre === 'troncons' ? 'importer_troncons' : 'importer_noeuds';
  const resultats: Partial<ResultatImportReseau>[] = [];
  let faits = 0;
  progression(0, features.length);
  for (const paquet of decouperEnPaquets(features)) {
    const { data, error } = await getSupabase().rpc(fonction, { p_marche: marcheId, p_features: paquet });
    if (error) throw error;
    resultats.push((data as Partial<ResultatImportReseau> | null) ?? {});
    faits += paquet.length;
    progression(faits, features.length);
  }
  await viderCacheReseau();
  return cumulerResultats(resultats);
}

/**
 * Contours des secteurs (secteurs.geojson) : un appel `definir_contour_secteur` par secteur reconnu. Une erreur
 * sur un secteur est notée et n'arrête pas les autres. Aucun recalcul automatique ensuite : ces contours relevés
 * sur les planches priment sur l'enveloppe calculée.
 */
export async function importerContoursSecteurs(
  contours: ContourSecteurLu[], progression: (faits: number, total: number) => void = () => undefined,
): Promise<{ definis: number; erreurs: { code: string; message: string }[] }> {
  const erreurs: { code: string; message: string }[] = [];
  let definis = 0;
  progression(0, contours.length);
  for (const [i, c] of contours.entries()) {
    try {
      await definirContourSecteur(c.secteur_id, c.geometrie);
      definis++;
    } catch (e) {
      if (estBaseSansReseau(e) || codeDe(e) === '42501') throw e;
      erreurs.push({ code: c.code, message: messageReseau(e) });
    }
    progression(i + 1, contours.length);
  }
  await viderCacheReseau();
  return { definis, erreurs };
}

// ---- Balayage ---------------------------------------------------------------------------------------------------

/** Met en file d'attente puis tente l'envoi ; renvoie ce qui reste à envoyer (0 = tout est parti). */
export async function enregistrerBalayages(lignes: LigneBalayageEnvoi[]): Promise<{ restants: number }> {
  await mettreBalayagesEnAttente(enFileAttente(lignes));
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      await synchroniser();
    } catch {
      /* réessayé au retour du réseau */
    }
  }
  return { restants: (await listerBalayagesEnAttente()).length };
}

/** Annule le dernier balayage non annulé d'un tronçon (droit `balayage / supprimer` ou `valider`, jugé par la base). */
export async function annulerDernierBalayage(tronconId: string, motif: string): Promise<boolean> {
  const sb = getSupabase();
  const { data: dernier, error } = await sb.from('balayages').select('id').eq('troncon_id', tronconId).is('annule_le', null)
    .order('balaye_le', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!dernier) return false;
  const { data: session } = await sb.auth.getSession();
  const { error: e2 } = await sb.from('balayages').update({
    annule_le: new Date().toISOString(), annule_par: session.session?.user.id ?? null, motif_annulation: motif.trim(),
  }).eq('id', (dernier as { id: string }).id);
  if (e2) throw e2;
  return true;
}

// ---- Journal -------------------------------------------------------------------------------------------------------

export function chargerJournal(marcheId: string, f: Partial<FiltresJournal> = {}): Promise<LigneBalayageJournalier[]> {
  const sb = getSupabase();
  return lireTout<LigneBalayageJournalier>((de, a) => {
    let q = sb.from('v_balayage_journalier').select('*').eq('marche_id', marcheId);
    if (f.du) q = q.gte('date_balayage', f.du);
    if (f.au) q = q.lte('date_balayage', f.au);
    if (f.equipe) q = q.eq('equipe_id', f.equipe);
    if (f.secteur) q = q.eq('secteur_id', f.secteur);
    return q.order('date_balayage', { ascending: false }).order('equipe_id').order('agent_id').order('secteur_id')
      .range(de, a) as unknown as PromiseLike<{ data: LigneBalayageJournalier[] | null; error: { message: string } | null }>;
  });
}

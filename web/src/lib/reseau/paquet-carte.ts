// Paquet « carte sans réseau » d'un marché (lot CH, docs/lots/lot-ch-carte-hors-ligne.md) : quand l'appareil a du
// réseau (Wi-Fi ou 4G), la carte de balayage télécharge d'avance tout ce qu'il faut pour s'ouvrir sans réseau :
// archive du réseau et fond de la ville (copies complètes, copie-carte.ts), page de la carte, ses scripts, MapLibre,
// polices et icônes (service worker), géométrie de tous les secteurs (lasso, « Prolonger »), zones, secteurs et état
// de balayage (copies de useReseau). Ensuite, seul ce qui a changé est retéléchargé (ETag, estampilles).
// Actif dans l'APK (tablettes) ; dans un navigateur, sur demande (case « Garder la carte sur cet appareil »).
import { lireCache, mettreEnCache } from '@/lib/hors-ligne';
import { estContexteApk } from '@/lib/supabase';
import { garderCopie, lireCopie, demanderStockagePersistant, type FichierCarte } from './copie-carte';
import { chargerTronconsSecteur, estampilleSecteur, type ContexteReseau } from './donnees';
import { lireSignee, oublierPlages } from './tuiles';
import { SANS_SECTEUR } from './types';

const CLE_CHOIX = 'suivi-fuites:carte-hors-ligne';
const cleEtat = (marcheId: string) => `carte:paquet:${marcheId}`;
// Page et scripts : regardés au plus une fois par heure (une mise en ligne du panneau les change).
const PAGES_FRAICHES_MS = 60 * 60 * 1000;
const GEOMETRIES_PARALLELES = 3;
const DELAI_SERVICE_WORKER_MS = 120_000;

export interface PartiePaquet { etag: string; octets: number; gardeLe: string }

export interface EtatPaquet {
  marcheId: string;
  reseau: PartiePaquet | null;
  /** null : aucun fond déposé pour ce marché (la carte garde le fond en ligne, fond uni sans réseau). */
  fond: PartiePaquet | null;
  pagesLe: string | null;
  geometriesLe: string | null;
  /** Tout est là : la carte s'ouvre sans réseau (fond compris s'il existe en ligne). */
  pret: boolean;
  prepareLe: string;
}

/** Le paquet est-il préparé sur cet appareil ? Toujours dans l'APK ; dans un navigateur, au choix de l'utilisateur. */
export function paquetActif(): boolean {
  if (estContexteApk()) return true;
  try {
    return window.localStorage.getItem(CLE_CHOIX) === '1';
  } catch {
    return false;
  }
}

export function choisirPaquet(actif: boolean) {
  try {
    if (actif) window.localStorage.setItem(CLE_CHOIX, '1');
    else window.localStorage.removeItem(CLE_CHOIX);
  } catch {
    /* stockage indisponible */
  }
}

export const lireEtatPaquet = (marcheId: string) => lireCache<EtatPaquet>(cleEtat(marcheId));

const enMo = (octets: number) => `${(octets / 1048576).toFixed(1).replace('.', ',')} Mo`;

/** Partie du paquet (réseau ou fond) : copie à jour gardée, retéléchargée si l'archive a changé. */
async function preparerFichier(marcheId: string, fichier: FichierCarte, libelle: string, etape: (t: string) => void): Promise<PartiePaquet | null | 'injoignable'> {
  const [signee, copie] = await Promise.all([lireSignee(marcheId, fichier, 20_000), lireCopie(marcheId, fichier)]);
  if (signee === 'injoignable') return 'injoignable';
  if (!signee) return null;
  const etag = (signee.etag ?? '').replace(/^W\//, '').replace(/"/g, '');
  if (copie && copie.etag === etag) return { etag, octets: copie.octets, gardeLe: copie.gardeLe };
  const total = signee.octets ? ` / ${enMo(signee.octets)}` : '';
  etape(`${libelle} : 0 Mo${total}…`);
  const c = await garderCopie({
    marcheId, fichier, url: signee.url, etag, octets: signee.octets,
    progression: (recus) => etape(`${libelle} : ${enMo(recus)}${total}…`),
  });
  void oublierPlages(marcheId, fichier);
  return { etag: c.etag, octets: c.octets, gardeLe: c.gardeLe };
}

/** Demande au service worker de garder la page de la carte et les fichiers nommés ; réponse ou erreur. */
async function garderPages(page: string, fichiers: string[]): Promise<void> {
  const enregistrement = await navigator.serviceWorker?.getRegistration();
  const sw = enregistrement?.active;
  if (!sw) throw new Error('service worker absent (panneau en développement ?)');
  await new Promise<void>((ok, ko) => {
    const canal = new MessageChannel();
    const minuteur = setTimeout(() => ko(new Error('service worker sans réponse')), DELAI_SERVICE_WORKER_MS);
    canal.port1.onmessage = (e) => {
      clearTimeout(minuteur);
      const r = e.data as { ok?: boolean; erreur?: string; manquants?: number };
      if (r?.ok && !r.manquants) ok();
      else ko(new Error(r?.erreur ?? `${r?.manquants ?? '?'} fichiers non gardés`));
    };
    sw.postMessage({ type: 'garder-carte', page, fichiers }, [canal.port2]);
  });
}

/**
 * Prépare ou met à jour le paquet du marché. `etape` reçoit l'avancement en clair. Sans réseau, ne touche à rien et
 * rend l'état connu. Une partie en échec n'efface jamais ce qui est déjà gardé.
 */
export async function preparerPaquet(o: {
  marcheId: string;
  contexte: ContexteReseau;
  page: string;
  fichiers: string[];
  etape?: (texte: string) => void;
  forcerPages?: boolean;
}): Promise<EtatPaquet> {
  const etape = o.etape ?? (() => undefined);
  const avant = await lireEtatPaquet(o.marcheId);
  const etat: EtatPaquet = avant ?? { marcheId: o.marcheId, reseau: null, fond: null, pagesLe: null, geometriesLe: null, pret: false, prepareLe: '' };
  void demanderStockagePersistant();

  const reseau = await preparerFichier(o.marcheId, 'reseau', 'Plan du réseau', etape);
  if (reseau === 'injoignable') return etat;
  etat.reseau = reseau;
  const fond = await preparerFichier(o.marcheId, 'fond', 'Fond de carte', etape);
  if (fond !== 'injoignable') etat.fond = fond;

  if (o.forcerPages || !etat.pagesLe || Date.now() - Date.parse(etat.pagesLe) > PAGES_FRAICHES_MS) {
    etape('Page de la carte, polices et icônes…');
    await garderPages(o.page, o.fichiers);
    etat.pagesLe = new Date().toISOString();
  }

  // Géométrie de tous les secteurs (et des non zonés) : déjà gardée si son estampille n'a pas changé.
  const secteurs = [...o.contexte.secteurs.map((s) => s.id), SANS_SECTEUR];
  let faits = 0;
  const file = [...secteurs];
  const ouvrier = async () => {
    while (file.length) {
      const id = file.shift()!;
      await chargerTronconsSecteur(o.marcheId, id, estampilleSecteur(o.contexte, id));
      etape(`Tronçons pour le lasso : ${++faits} / ${secteurs.length} secteurs…`);
    }
  };
  await Promise.all(Array.from({ length: GEOMETRIES_PARALLELES }, ouvrier));
  etat.geometriesLe = new Date().toISOString();

  etat.pret = !!etat.reseau && !!etat.pagesLe && !!etat.geometriesLe;
  etat.prepareLe = new Date().toISOString();
  await mettreEnCache(cleEtat(o.marcheId), etat);
  etape('');
  return etat;
}

/** Taille du paquet sur l'appareil (archives seulement : le reste pèse peu). */
export const octetsPaquet = (e: EtatPaquet | null) => (e?.reseau?.octets ?? 0) + (e?.fond?.octets ?? 0);

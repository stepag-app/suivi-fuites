// Mesures de nuit sur la tablette (D8, contrat docs/lots/chantier-v3-debits.md § 4), sans dépendance d'affichage
// (essais/mesures-nuit.test.mjs) : campagnes en cours, points de mesure, mesures déjà saisies (copie de la tablette,
// puis serveur), nuits proposées, contrôle de la saisie, et mesures encore dans la file d'attente.
// La base reste juge (déclencheur de mesures_nuit) : ces règles évitent seulement un refus après coup.
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Envoi, EnvoiMesure } from './file-attente';
import { nombreOuNul } from './regles';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';

export type TypeCampagne = 'avant' | 'apres' | 'maintien' | 'libre';
export type ModeSaisie = 'minimum' | 'releves';

export interface Campagne {
  id: string; type: TypeCampagne; zone_id: string | null; libelle: string | null;
  date_debut: string; date_fin: string; mode_saisie: 'minimum' | 'releves' | 'import' | null;
}
export interface PointMesure { id: string; zone_id: string; code: string; libelle: string; equipement: string | null; ordre: number }
export interface ZoneMesure { id: string; numero: number; libelle: string }
export interface Releve { h: string; q: number }
export interface MesureNuit {
  id: string; campagne_id: string; point_id: string; nuit: string; minimum_m3h: number | null; releves: Releve[] | null;
  observation: string | null; piece_jointe: string | null; auteur_terrain_id: string | null; saisi_par: string | null;
  validee_le: string | null;
  /** Saisie (ou correction) encore sur la tablette. */
  attente?: boolean;
}
export interface DonneesMesures { campagnes: Campagne[]; points: PointMesure[]; zones: ZoneMesure[]; mesures: MesureNuit[] }

/** Libellés du panneau (web/src/lib/debits.ts, TYPES_CAMPAGNE), traduits par tx() à l'affichage. */
export const TYPES_CAMPAGNE: Record<TypeCampagne, string> = {
  avant: 'Avant intervention (Qi)',
  apres: 'Après balayage (Qf)',
  maintien: 'Contrôle de maintien',
  libre: 'Mesure libre',
};

/** 00:00, 00:15… 06:00 : 25 relevés au quart d'heure (R-CPS-114). */
export const HEURES_NUIT: string[] = Array.from({ length: 25 }, (_, i) =>
  `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

/** Nuits passées encore proposées après la fin d'une campagne (saisie en retard, au retour du réseau). */
export const NUITS_DE_RETARD = 3;

const deux = (n: number) => String(n).padStart(2, '0');
/** Jour local AAAA-MM-JJ. */
export const jourIso = (d: Date) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;
const decaler = (jour: string, n: number) => {
  const [a, m, j] = jour.split('-').map(Number);
  return jourIso(new Date(a, m - 1, j + n));
};

/** Campagnes dont une nuit est à saisir : commencée, et finie depuis NUITS_DE_RETARD jours au plus. */
export const campagnesOuvertes = (campagnes: Campagne[], aujourdhui: string) => campagnes
  .filter((c) => c.date_debut <= aujourdhui && c.date_fin >= decaler(aujourdhui, -NUITS_DE_RETARD))
  .sort((a, b) => b.date_debut.localeCompare(a.date_debut) || a.type.localeCompare(b.type));

/** Nuits de la campagne jusqu'à aujourd'hui (une nuit à venir ne se mesure pas), la plus récente d'abord. */
export function nuitsProposees(c: Campagne, aujourdhui: string): string[] {
  const nuits: string[] = [];
  for (let n = c.date_debut; n <= c.date_fin && n <= aujourdhui; n = decaler(n, 1)) nuits.unshift(n);
  return nuits;
}

/** Mode de saisie : celui de la campagne, sinon du marché ; l'import (bureau) se saisit au minimum sur la tablette. */
export const modeDe = (c: Campagne, modeMarche: string | null | undefined): ModeSaisie =>
  (c.mode_saisie ?? modeMarche) === 'releves' ? 'releves' : 'minimum';

/** Points actifs de la campagne (de sa zone, ou de toutes les zones), dans l'ordre du panneau. */
export const pointsDe = (points: PointMesure[], c: Campagne) => points
  .filter((p) => !c.zone_id || p.zone_id === c.zone_id)
  .sort((a, b) => a.ordre - b.ordre || a.code.localeCompare(b.code));

/** Saisie de l'écran : texte du minimum, ou texte de chaque relevé (heure → débit). */
export interface Saisie { mode: ModeSaisie; minimum: string; releves: Record<string, string>; observation: string }

export type Controle =
  | { erreur: 'minimum' | 'releves' | 'releve_invalide' | 'negatif'; heure?: string }
  | { ligne: { minimum_m3h: number | null; releves: Releve[] | null; observation: string | null } };

/** Valeurs envoyées à la base (minimum seul, ou relevés et minimum calculé par la base), ou la première erreur. */
export function controlerSaisie(s: Saisie): Controle {
  const observation = s.observation.trim() || null;
  if (s.mode === 'minimum') {
    const n = nombreOuNul(s.minimum);
    if (n == null) return { erreur: 'minimum' };
    if (n < 0) return { erreur: 'negatif' };
    return { ligne: { minimum_m3h: n, releves: null, observation } };
  }
  const releves: Releve[] = [];
  for (const h of HEURES_NUIT) {
    const texte = s.releves[h] ?? '';
    if (!texte.trim()) continue;
    const q = nombreOuNul(texte);
    if (q == null) return { erreur: 'releve_invalide', heure: h };
    if (q < 0) return { erreur: 'negatif', heure: h };
    releves.push({ h, q });
  }
  if (!releves.length) return { erreur: 'releves' };
  return { ligne: { minimum_m3h: null, releves, observation } };
}

/** Minimum des relevés saisis (aperçu de l'écran) ; null s'il n'y en a aucun de lisible. */
export function minimumReleves(releves: Record<string, string>): number | null {
  const q = Object.values(releves).map(nombreOuNul).filter((n): n is number => n != null && n >= 0);
  return q.length ? Math.min(...q) : null;
}

/** Saisie de départ de l'écran pour une mesure existante (correction), ou vide. */
export function saisieDe(m: MesureNuit | null | undefined, mode: ModeSaisie): Saisie {
  const texte = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));
  const releves = Object.fromEntries((m?.releves ?? []).map((r) => [r.h, texte(r.q)]));
  return {
    mode: m?.releves?.length ? 'releves' : m ? 'minimum' : mode,
    minimum: m && !m.releves?.length ? texte(m.minimum_m3h) : '',
    releves, observation: m?.observation ?? '',
  };
}

/** Mesure de l'auteur (portée « siennes » de la base : auteur terrain ou compte de saisie). */
export const estSienne = (m: Pick<MesureNuit, 'auteur_terrain_id' | 'saisi_par'>, uid: string | undefined) =>
  !!uid && (m.auteur_terrain_id === uid || m.saisi_par === uid);

const estMesure = (e: Envoi): e is EnvoiMesure => e.type === 'mesure';

/**
 * Mesures affichées : celles du serveur, puis la file d'attente de la tablette dans l'ordre (création pas encore
 * arrivée, corrections pas encore passées), marquées `attente`.
 */
export function avecAttente(serveur: MesureNuit[], attente: Envoi[], uid: string | undefined, marcheId: string): MesureNuit[] {
  const par = new Map(serveur.map((m) => [m.id, m]));
  for (const e of attente.filter(estMesure).filter((x) => x.marche_id === marcheId)) {
    const l = e.ligne as Partial<MesureNuit>;
    const avant = par.get(e.mesure_id);
    if (!avant && e.correction) continue;
    const base: MesureNuit = avant ?? {
      id: e.mesure_id, campagne_id: e.campagne_id, point_id: String(l.point_id), nuit: String(l.nuit), minimum_m3h: null,
      releves: null, observation: null, piece_jointe: null, auteur_terrain_id: uid ?? null, saisi_par: uid ?? null, validee_le: null,
    };
    const releves = l.releves ?? null;
    par.set(e.mesure_id, {
      ...base, releves, observation: l.observation ?? null, attente: true,
      minimum_m3h: releves?.length ? Math.min(...releves.map((r) => r.q)) : l.minimum_m3h ?? null,
      piece_jointe: e.photos.length ? e.photos[0].fichier : base.piece_jointe,
    });
  }
  return [...par.values()];
}

/** Envoi de la file qui crée cette mesure, s'il n'est pas encore parti (corrigé alors sur place). */
export const creationEnAttente = (attente: Envoi[], mesureId: string) =>
  attente.find((e): e is EnvoiMesure => estMesure(e) && !e.correction && e.mesure_id === mesureId) ?? null;

// ---------------------------------------------------------------------------
// Chargement : copie de la tablette d'abord, puis serveur
// ---------------------------------------------------------------------------

const cle = (marcheId: string) => `suivi-fuites:mesures-nuit:v1:${marcheId}`;
const VIDE: DonneesMesures = { campagnes: [], points: [], zones: [], mesures: [] };

export async function mesuresGardees(marcheId: string): Promise<DonneesMesures> {
  try {
    return { ...VIDE, ...JSON.parse((await AsyncStorage.getItem(cle(marcheId))) ?? '{}') };
  } catch {
    return VIDE;
  }
}

/**
 * Données du serveur (gardées ensuite sur la tablette), ou null sans réponse ou sans droit de lecture. Les campagnes
 * se lisent toutes (quelques dizaines par an) et se filtrent ici ; les mesures, pour les campagnes ouvertes seulement.
 */
export async function mesuresServeur(marcheId: string, aujourdhui: string): Promise<DonneesMesures | null> {
  const [c, p, z] = await Promise.all([
    supabase.from('campagnes_debit').select('id, type, zone_id, libelle, date_debut, date_fin, mode_saisie')
      .eq('marche_id', marcheId).is('supprime_le', null).order('date_debut', { ascending: false }),
    supabase.from('points_mesure').select('id, zone_id, code, libelle, equipement, ordre')
      .eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    supabase.from('zones').select('id, numero, libelle').eq('marche_id', marcheId).order('numero'),
  ]);
  if (c.error || p.error || z.error) return null;
  const campagnes = campagnesOuvertes((c.data ?? []) as Campagne[], aujourdhui);
  let mesures: MesureNuit[] = [];
  if (campagnes.length) {
    const m = await supabase.from('mesures_nuit')
      .select('id, campagne_id, point_id, nuit, minimum_m3h, releves, observation, piece_jointe, auteur_terrain_id, saisi_par, validee_le')
      .in('campagne_id', campagnes.map((x) => x.id)).is('supprime_le', null);
    if (m.error) return null;
    mesures = ((m.data ?? []) as MesureNuit[]).map((x) => ({ ...x, minimum_m3h: x.minimum_m3h == null ? null : Number(x.minimum_m3h) }));
  }
  const donnees: DonneesMesures = {
    campagnes, points: (p.data ?? []) as PointMesure[], zones: (z.data ?? []) as ZoneMesure[], mesures,
  };
  await AsyncStorage.setItem(cle(marcheId), JSON.stringify(donnees)).catch(() => undefined);
  return donnees;
}

/**
 * Écran Mesures de nuit : `afficher` reçoit la copie de la tablette, puis la réponse du serveur. Jeton à renouveler :
 * copie seulement. Renvoie faux sans réponse du serveur (hors ligne, ou droit de lecture absent).
 */
export async function chargerMesures(marcheId: string, aRenouveler: boolean, afficher: (d: DonneesMesures) => void): Promise<boolean> {
  afficher(await mesuresGardees(marcheId));
  if (aRenouveler || jetonARenouveler()) return false;
  const d = await mesuresServeur(marcheId, jourIso(new Date())).catch(() => null);
  if (!d) return false;
  afficher(d);
  return true;
}

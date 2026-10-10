// Accès à la base pour le rapprochement Dolibarr (lot P4) : mouvements importés (administrateur), réglages du marché
// (entrepôt : administrateur ; seuil : « paramètres / modifier »), rapprochement_fournitures (« quantités / lire »).
// Jamais de prix.
import { messageErreur } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';
import { chargeImport, type MouvementLu } from './csv';
import type { BilanSynchro, EnvoiDolibarr } from './envoi-auto';
import { SEUIL_PAR_DEFAUT_PCT, normaliserLigne, type LigneRapprochement } from './rapprochement';

export interface ReglagesFournitures {
  entrepot_dolibarr_id: number | null;
  seuil_ecart_fournitures_pct: number;
}

export interface DernierImportMouvements {
  importe_le: string;
  lignes_lues: number;
  nouveaux: number;
  modifies: number;
  inchanges: number;
  annulations: number;
  date_min: string | null;
  date_max: string | null;
  entrepots: number[];
}

export type ResultatImportMouvements = Omit<DernierImportMouvements, 'importe_le'>;

/** Période × article ; `du` / `au` : jours AAAA-MM-JJ (heure du Maroc), vides = sans borne. */
export async function chargerRapprochement(marcheId: string, du: string, au: string): Promise<LigneRapprochement[]> {
  const { data, error } = await getSupabase().rpc('rapprochement_fournitures', {
    p_marche_id: marcheId, p_du: du || null, p_au: au || null,
  });
  if (error) throw error;
  return ((data as Record<string, unknown>[] | null) ?? []).map(normaliserLigne);
}

export async function chargerReglagesFournitures(marcheId: string): Promise<ReglagesFournitures> {
  const { data, error } = await getSupabase().from('marches')
    .select('entrepot_dolibarr_id, seuil_ecart_fournitures_pct').eq('id', marcheId).maybeSingle();
  if (error) throw error;
  const r = data as { entrepot_dolibarr_id: number | null; seuil_ecart_fournitures_pct: number | string | null } | null;
  const seuil = Number(r?.seuil_ecart_fournitures_pct);
  return {
    entrepot_dolibarr_id: r?.entrepot_dolibarr_id ?? null,
    seuil_ecart_fournitures_pct: Number.isFinite(seuil) ? seuil : SEUIL_PAR_DEFAUT_PCT,
  };
}

export async function enregistrerReglagesFournitures(marcheId: string, maj: Partial<ReglagesFournitures>): Promise<void> {
  const { data, error } = await getSupabase().from('marches').update(maj).eq('id', marcheId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Modification refusée : droit « paramètres / modifier » nécessaire.');
}

// Dernier import CSV fait dans le panneau (un import de l'envoi automatique n'a pas d'auteur).
export async function chargerDernierImportMouvements(): Promise<DernierImportMouvements | null> {
  const { data, error } = await getSupabase().from('imports_mouvements_dolibarr')
    .select('importe_le, lignes_lues, nouveaux, modifies, inchanges, annulations, date_min, date_max, entrepots')
    .not('importe_par', 'is', null)
    .order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as DernierImportMouvements | null) ?? null;
}

// Journal de la synchronisation (X8) : derniers passages, signes de vie et erreurs. Base pas encore à jour : null.
export async function chargerEnvoisDolibarr(limite = 30): Promise<EnvoiDolibarr[] | null> {
  const { data, error } = await getSupabase().from('envois_dolibarr')
    .select('id, recu_le, dernier_le, appels, statut, origine, mouvements, nouveaux, modifies, ignores, dernier_dolibarr_id, date_max, message, poste, version_script')
    .order('dernier_le', { ascending: false }).order('id', { ascending: false }).limit(limite);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw error;
  }
  return (data as EnvoiDolibarr[] | null) ?? [];
}

// Lecture immédiate de l'API Dolibarr par la fonction serveur (droits vérifiés par la base). « tout » : tout l'historique
// relu. Une lecture déjà en cours (409) ou refusée par Dolibarr (502) renvoie aussi un bilan, affiché tel quel.
export async function synchroniserDolibarr(tout = false): Promise<BilanSynchro> {
  const { data, error } = await getSupabase().functions.invoke('dolibarr-mouvements', { body: { action: 'synchroniser', tout } });
  if (!error) return data as BilanSynchro;
  const contexte = (error as { context?: Response }).context;
  let detail: Partial<BilanSynchro> & { erreur?: string } = {};
  if (contexte && typeof contexte.json === 'function') {
    try {
      detail = await contexte.json();
    } catch {
      /* corps illisible */
    }
  }
  if (detail.statut) return detail as BilanSynchro;
  throw new Error(detail.erreur ?? error.message);
}

// Seules les colonnes utiles partent vers la base (jamais un prix ni une valeur, même si le fichier en contenait).
export async function importerMouvements(mouvements: MouvementLu[]): Promise<ResultatImportMouvements> {
  const { data, error } = await getSupabase().rpc('importer_mouvements_dolibarr', { p_mouvements: chargeImport(mouvements) });
  if (error) throw error;
  return data as ResultatImportMouvements;
}

export function messageDolibarr(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code === '42501') return 'Réservé à l\'administrateur.';
  if (code === '22023') return 'Fichier incomplet : identifiant, date, produit, entrepôt, quantité ou type manquants sur certaines lignes.';
  if (code === '23514') return 'Valeur refusée (seuil entre 0 et 999 %, entrepôt : numéro positif).';
  if (code === '54000') return 'Fichier trop volumineux : 50 000 mouvements au plus par import.';
  if (code === '42P01' || code === '42703' || code === '42883' || code === 'PGRST202') {
    return 'La base n\'est pas encore à jour pour le rapprochement Dolibarr (migration à déployer).';
  }
  return messageErreur(e);
}

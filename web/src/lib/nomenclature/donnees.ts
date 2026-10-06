// Accès à la base pour les articles Dolibarr (Paramètres > Articles, administrateur).
import { messageErreur } from '@/lib/format';
import { getSupabase, lireTout } from '@/lib/supabase';
import type { ProduitLu } from './csv';

export interface ProduitNomenclature {
  dolibarr_id: number;
  ref: string;
  designation: string;
  unite: string | null;
  famille: string;
  /** Présent dans le dernier import, en vente ou en achat dans Dolibarr. */
  actif: boolean;
  /** Activé : proposé dans la liste déroulante des pièces (tous les marchés). */
  utilisable: boolean;
  /** Arrivée dans l'application (premier import qui contenait le produit). */
  cree_le: string;
}

export interface DernierImport {
  importe_le: string;
  familles: string[];
  produits_lus: number;
  nouveaux: number;
  modifies: number;
  designations_modifiees: number;
  desactives: number;
}

export type ResultatImport = Omit<DernierImport, 'importe_le' | 'familles'>;

export const chargerProduits = () =>
  lireTout<ProduitNomenclature>((de, a) => getSupabase().from('produits_dolibarr')
    .select('dolibarr_id, ref, designation, unite, famille, actif, utilisable, cree_le').order('dolibarr_id').range(de, a));

export async function chargerDernierImport(): Promise<DernierImport | null> {
  const { data, error } = await getSupabase().from('imports_dolibarr')
    .select('importe_le, familles, produits_lus, nouveaux, modifies, designations_modifiees, desactives')
    .order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as DernierImport | null) ?? null;
}

// Seules les colonnes utiles partent vers la base (jamais un prix, même si le fichier en contenait).
export async function importerProduits(produits: ProduitLu[], familles: string[]): Promise<ResultatImport> {
  const charge = produits.map(({ dolibarr_id, ref, designation, unite, famille, actif }) => ({ dolibarr_id, ref, designation, unite, famille, actif }));
  const { data, error } = await getSupabase().rpc('importer_produits_dolibarr', { p_produits: charge, p_familles: familles });
  if (error) throw error;
  return data as ResultatImport;
}

/** Active ou désactive des articles pour tous les marchés ; rend le nombre réellement modifié. */
export async function activerProduits(ids: number[], utilisable: boolean): Promise<number> {
  const { data, error } = await getSupabase().rpc('activer_produits_dolibarr', { p_ids: ids, p_utilisable: utilisable });
  if (error) throw error;
  return Number(data ?? 0);
}

export function messageNomenclature(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  if (code === '42501') return messageErreur(e) || 'Réservé à l\'administrateur.';
  return messageErreur(e);
}

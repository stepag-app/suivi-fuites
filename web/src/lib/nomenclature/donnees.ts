// Accès à la base pour la nomenclature Dolibarr (écran d'administration seulement).
import { messageErreur } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';
import type { ProduitLu } from './csv';
import type { ProduitNomenclature } from './rapprochement';

export interface PieceNomenclature {
  id: string;
  designation: string;
  famille: string | null;
  unite: string;
  actif: boolean;
  produit_dolibarr_id: number | null;
  hors_nomenclature: boolean;
  designation_initiale: string | null;
}

export interface DernierImport {
  importe_le: string;
  familles: string[];
  produits_lus: number;
  nouveaux: number;
  modifies: number;
  designations_modifiees: number;
  desactives: number;
  pieces_renommees: number;
  conflits_designation: number;
}

export type ResultatImport = Omit<DernierImport, 'importe_le' | 'familles'>;
export interface ErreurLien { piece_id: string; code: string; contrainte: string | null; message: string }
export interface ResultatLiens { rapprochees: number; erreurs: ErreurLien[] }

const PAGE = 1000;

// L'API renvoie au plus 1 000 lignes par requête : on lit par pages.
async function toutLire<T>(requete: (de: number, a: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const lignes: T[] = [];
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await requete(de, de + PAGE - 1);
    if (error) throw error;
    const page = (data as T[] | null) ?? [];
    lignes.push(...page);
    if (page.length < PAGE) return lignes;
  }
}

export const chargerProduits = () =>
  toutLire<ProduitNomenclature>((de, a) => getSupabase().from('produits_dolibarr')
    .select('dolibarr_id, ref, designation, unite, famille, actif').order('dolibarr_id').range(de, a));

export const chargerPieces = (marcheId: string) =>
  toutLire<PieceNomenclature>((de, a) => getSupabase().from('catalogue_pieces')
    .select('id, designation, famille, unite, actif, produit_dolibarr_id, hors_nomenclature, designation_initiale')
    .eq('marche_id', marcheId).order('designation').order('id').range(de, a));

export async function chargerDernierImport(): Promise<DernierImport | null> {
  const { data, error } = await getSupabase().from('imports_dolibarr')
    .select('importe_le, familles, produits_lus, nouveaux, modifies, designations_modifiees, desactives, pieces_renommees, conflits_designation')
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

// Lier (produit) ou délier (null) des pièces ; une erreur par pièce, les autres sont faites.
export async function lierPieces(marcheId: string, liens: { piece_id: string; produit_dolibarr_id: number | null }[]): Promise<ResultatLiens> {
  const { data, error } = await getSupabase().rpc('rapprocher_pieces', { p_marche: marcheId, p_liens: liens });
  if (error) throw error;
  return data as ResultatLiens;
}

export async function modifierPiece(id: string, valeurs: Partial<Pick<PieceNomenclature, 'actif' | 'hors_nomenclature'>>): Promise<void> {
  const { error } = await getSupabase().from('catalogue_pieces').update(valeurs).eq('id', id);
  if (error) throw error;
}

export async function ajouterAuCatalogue(lignes: { marche_id: string; produit_dolibarr_id: number; designation: string; famille: string; unite: string }[]): Promise<void> {
  const { error } = await getSupabase().from('catalogue_pieces').insert(lignes);
  if (error) throw error;
}

export function messageNomenclature(e: unknown): string {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  const texte = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  const contrainte = e && typeof e === 'object' && 'contrainte' in e ? String((e as { contrainte: unknown }).contrainte ?? '') : '';
  if (code === '23505') {
    if (contrainte.includes('produit') || texte.includes('produit_unique') || texte.includes('déjà rapproché')) {
      return 'Ce produit Dolibarr est déjà rapproché d\'une autre pièce du marché (pièce en double ? la désactiver).';
    }
    return 'Une autre pièce du marché porte déjà cette désignation (libellé en double dans Dolibarr ?).';
  }
  if (code === '42501') return 'Réservé à l\'administrateur.';
  if (code === 'P0002') return 'Pièce introuvable dans ce marché.';
  return messageErreur(e);
}

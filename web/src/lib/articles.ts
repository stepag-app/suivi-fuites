// Articles Dolibarr : le référentiel des pièces posées, commun à tous les marchés.
// La liste déroulante ne propose que les articles activés et toujours présents dans Dolibarr ;
// une pièce déjà saisie garde son article même s'il est désactivé ensuite.
import { getSupabase, lireTout } from '@/lib/supabase';
import type { Piece } from '@/lib/types';

const COLONNES = 'id:dolibarr_id, designation, unite';

export const lireArticlesProposes = () =>
  lireTout<Piece>((de, a) => getSupabase().from('produits_dolibarr').select(COLONNES)
    .eq('utilisable', true).eq('actif', true).order('designation').order('dolibarr_id').range(de, a));

/** Articles des pièces déjà saisies, activés ou non (désignation et unité à l'affichage). */
export async function lireArticles(ids: (number | null)[]): Promise<Map<number, Piece>> {
  const uniques = [...new Set(ids.filter((id): id is number => id != null))];
  const articles = new Map<number, Piece>();
  for (let i = 0; i < uniques.length; i += 300) {
    const { data, error } = await getSupabase().from('produits_dolibarr').select(COLONNES)
      .in('dolibarr_id', uniques.slice(i, i + 300));
    if (error) throw error;
    ((data as Piece[] | null) ?? []).forEach((a) => articles.set(a.id, a));
  }
  return articles;
}

export const uniteArticle = (a: Pick<Piece, 'unite'> | undefined | null) => a?.unite || 'u';

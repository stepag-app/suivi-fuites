// Listes de la saisie du panneau (chantier v2, contrats S1 et S2), lues avec la RLS de l'appelant :
// natures (revêtement à refaire, nature de dégradation), motifs, diamètres par matériau, représentants du
// maître d'ouvrage, agents affectés au marché (« Détectée par », « Réalisée par »), champs exigés de la fuite,
// articles proposés et pièces les plus posées du marché (capsules).
import { lireArticlesProposes } from '@/lib/articles';
import { getSupabase } from '@/lib/supabase';
import type { Motif, Piece } from '@/lib/types';
import type { DiametreMateriau } from './regles';

export interface NatureSaisie {
  id: string;
  code: string;
  libelle_fr: string;
  libelle_ar: string | null;
  emplacement: string;
  necessite_refection: boolean;
}
export interface Representant { id: string; nom: string; ordre: number; actif: boolean }
export interface Agent { id: string; nom_complet: string; roles: string[] }

export interface ReferentielsSaisie {
  natures: NatureSaisie[];
  motifs: Motif[];
  diametres: DiametreMateriau[];
  representants: Representant[];
  agents: Agent[];
  champsObligatoires: string[];
}

type Reponse = { data: unknown; error: { code?: string; message: string } | null };
const lignes = <T,>(r: Reponse) => (r.data as T[] | null) ?? [];

/** Tables du chantier v2 absentes (base pas encore à jour) : listes vides, la saisie reste possible. */
const absente = (r: Reponse) => r.error?.code === '42P01' || r.error?.code === 'PGRST205' || r.error?.code === '42703';

export async function lireReferentielsSaisie(marcheId: string): Promise<ReferentielsSaisie> {
  const sb = getSupabase();
  const [n, m, d, rp, af, mc]: Reponse[] = await Promise.all([
    sb.from('natures_refection').select('id, code, libelle_fr, libelle_ar, emplacement, necessite_refection').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    sb.from('motifs').select('id, categorie, code, libelle_fr').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    sb.from('diametres_materiau').select('materiau, diametre_mm, actif').eq('marche_id', marcheId).eq('actif', true).order('diametre_mm'),
    sb.from('representants_srm').select('id, nom, ordre, actif').eq('marche_id', marcheId).eq('actif', true).order('ordre').order('nom'),
    sb.from('affectations').select('profil_id, roles, actif').eq('marche_id', marcheId).eq('actif', true),
    sb.from('marches').select('champs_obligatoires_fuite').eq('id', marcheId).maybeSingle(),
  ]);
  for (const r of [n, m]) if (r.error) throw r.error;
  for (const r of [d, rp, af, mc]) if (r.error && !absente(r)) throw r.error;

  const affectes = lignes<{ profil_id: string; roles: string[] }>(af);
  let agents: Agent[] = [];
  if (affectes.length) {
    const { data, error } = await sb.from('profils').select('id, nom_complet, actif').in('id', affectes.map((a) => a.profil_id)).eq('actif', true);
    if (error) throw error;
    agents = ((data as { id: string; nom_complet: string }[] | null) ?? [])
      .map((p) => ({ id: p.id, nom_complet: p.nom_complet, roles: affectes.find((a) => a.profil_id === p.id)?.roles ?? [] }))
      .sort((a, b) => a.nom_complet.localeCompare(b.nom_complet, 'fr'));
  }
  return {
    natures: lignes<NatureSaisie>(n),
    motifs: lignes<Motif>(m),
    diametres: lignes<DiametreMateriau>(d),
    representants: lignes<Representant>(rp),
    agents,
    champsObligatoires: ((mc.data as { champs_obligatoires_fuite?: string[] } | null)?.champs_obligatoires_fuite) ?? [],
  };
}

/** Articles activés (capsules et recherche) et nombre de poses de chaque article dans le marché (« les plus utilisés »). */
export async function lireArticlesEtUsages(marcheId: string): Promise<{ articles: Piece[]; usages: Map<number, number> }> {
  const sb = getSupabase();
  const [articles, poses] = await Promise.all([
    lireArticlesProposes(),
    sb.from('reparation_pieces').select('produit_id').eq('marche_id', marcheId).is('supprime_le', null)
      .order('cree_le', { ascending: false }).limit(1000),
  ]);
  const usages = new Map<number, number>();
  lignes<{ produit_id: number | null }>(poses as Reponse).forEach((p) => {
    if (p.produit_id != null) usages.set(p.produit_id, (usages.get(p.produit_id) ?? 0) + 1);
  });
  return { articles, usages };
}

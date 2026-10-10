// Paramètres utiles à la saisie (natures de réfection, motifs, ouvriers, diamètres par matériau,
// représentants du marché ; articles Dolibarr activés, communs à tous les marchés ; libellés arabes des listes ;
// articles les plus posés) : dernière copie gardée d'abord, puis serveur quand le réseau est là.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { retenirLibelles } from './listes';
import { compterUsage } from './regles';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';
import type { Diametre, LibelleListe, Motif, Nature, Ouvrier, Piece, Representant } from './types';

export interface Parametres {
  natures: Nature[]; motifs: Motif[]; pieces: Piece[]; ouvriers: Ouvrier[];
  diametres: Diametre[]; representants: Representant[]; libelles: LibelleListe[];
  /** Nombre de poses de chaque article sur le marché (pièces récentes) : capsules « les plus utilisées ». */
  usage: Record<number, number>;
}
const VIDE: Parametres = {
  natures: [], motifs: [], pieces: [], ouvriers: [], diametres: [], representants: [], libelles: [], usage: {},
};
// v2 : les pièces sont des articles Dolibarr (identifiant entier) ; l'ancienne copie (catalogue) n'est plus lue.
// Une copie v2 sans les listes du chantier v2 les reçoit vides, puis du serveur.
const cle = (marcheId: string) => `suivi-fuites:parametres:v2:${marcheId}`;

// L'API renvoie au plus 1 000 lignes par requête : articles lus par pages.
async function lireArticles(): Promise<{ data: Piece[] | null; error: unknown }> {
  const tout: Piece[] = [];
  for (let de = 0; de < 20000; de += 1000) {
    const { data, error } = await supabase.from('produits_dolibarr').select('id:dolibarr_id, designation, unite')
      .eq('utilisable', true).eq('actif', true).order('designation').order('dolibarr_id').range(de, de + 999);
    if (error) return { data: null, error };
    tout.push(...((data ?? []) as Piece[]));
    if (!data || data.length < 1000) break;
  }
  return { data: tout, error: null };
}

export async function parametresGardes(marcheId: string): Promise<Parametres> {
  try {
    return { ...VIDE, ...JSON.parse((await AsyncStorage.getItem(cle(marcheId))) ?? '{}') };
  } catch {
    return VIDE;
  }
}

export async function chargerParametres(marcheId: string): Promise<Parametres> {
  const [n, m, p, o, d, r, l, u] = await Promise.all([
    supabase.from('natures_refection').select('id, code, libelle_fr, libelle_ar, emplacement, necessite_refection')
      .eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    supabase.from('motifs').select('id, categorie, libelle_fr, libelle_ar').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    lireArticles(),
    supabase.from('ouvriers').select('id, nom_complet').eq('marche_id', marcheId).eq('actif', true).order('nom_complet'),
    supabase.from('diametres_materiau').select('materiau, diametre_mm').eq('marche_id', marcheId).eq('actif', true)
      .order('materiau').order('diametre_mm'),
    supabase.from('representants_srm').select('id, nom').eq('marche_id', marcheId).eq('actif', true).order('ordre').order('nom'),
    supabase.from('libelles_listes').select('liste, code, libelle_fr, libelle_ar').eq('actif', true).order('liste').order('ordre'),
    // Pièces récentes du marché (déclaration du terrain : R7), pour proposer d'abord les articles les plus posés.
    supabase.from('reparation_pieces').select('produit_id').eq('marche_id', marcheId).is('supprime_le', null)
      .not('produit_id', 'is', null).order('cree_le', { ascending: false }).limit(1000),
  ]);
  const garde = await parametresGardes(marcheId);
  if (n.error || m.error || p.error || o.error) return garde;
  // Listes du chantier v2 : une erreur (droit absent, base pas encore à jour) garde la copie de la tablette.
  const valeur: Parametres = {
    natures: n.data as Nature[], motifs: m.data as Motif[], pieces: p.data as Piece[],
    ouvriers: o.data as Ouvrier[],
    diametres: d.error ? garde.diametres : (d.data as Diametre[]),
    representants: r.error ? garde.representants : (r.data as Representant[]),
    libelles: l.error ? garde.libelles : (l.data as LibelleListe[]),
    usage: u.error ? garde.usage : compterUsage((u.data ?? []) as { produit_id: number | null }[]),
  };
  AsyncStorage.setItem(cle(marcheId), JSON.stringify(valeur)).catch(() => undefined);
  return valeur;
}

/** `aRenouveler` (session.tsx) : copie seulement, la requête partirait sans jeton valide après les reprises d'auth-js. */
export function useParametres(marcheId: string | undefined, aRenouveler: boolean): Parametres {
  const [p, setP] = useState<Parametres>(VIDE);
  useEffect(() => {
    if (!marcheId) return;
    let annule = false;
    const afficher = (v: Parametres) => {
      if (annule) return;
      retenirLibelles(v.libelles);
      setP(v);
    };
    (async () => {
      afficher(await parametresGardes(marcheId));
      if (aRenouveler || jetonARenouveler()) return;
      afficher(await chargerParametres(marcheId));
    })().catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [marcheId, aRenouveler]);
  return p;
}

/** Diamètres proposés pour un matériau (liste du marché, croissante). */
export const diametresDe = (p: Parametres, materiau: string | null | undefined) =>
  materiau ? p.diametres.filter((d) => d.materiau === materiau).map((d) => d.diametre_mm) : [];

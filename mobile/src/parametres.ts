// Paramètres utiles à la saisie (natures de réfection, motifs, équipes, ouvriers du marché ; articles
// Dolibarr activés, communs à tous les marchés) : dernière copie gardée d'abord, puis serveur quand le réseau est là.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Equipe, Motif, Nature, Ouvrier, Piece } from './types';

export interface Parametres { natures: Nature[]; motifs: Motif[]; pieces: Piece[]; equipes: Equipe[]; ouvriers: Ouvrier[] }
const VIDE: Parametres = { natures: [], motifs: [], pieces: [], equipes: [], ouvriers: [] };
// v2 : les pièces sont des articles Dolibarr (identifiant entier) ; l'ancienne copie (catalogue) n'est plus lue.
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

async function parametresGardes(marcheId: string): Promise<Parametres> {
  try {
    return { ...VIDE, ...JSON.parse((await AsyncStorage.getItem(cle(marcheId))) ?? '{}') };
  } catch {
    return VIDE;
  }
}

export async function chargerParametres(marcheId: string): Promise<Parametres> {
  const [n, m, p, e, o] = await Promise.all([
    supabase.from('natures_refection').select('id, code, libelle_fr, emplacement, necessite_refection')
      .eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    supabase.from('motifs').select('id, categorie, libelle_fr').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    lireArticles(),
    supabase.from('equipes').select('id, type, numero, libelle').eq('marche_id', marcheId).eq('actif', true).order('type').order('numero'),
    supabase.from('ouvriers').select('id, nom_complet').eq('marche_id', marcheId).eq('actif', true).order('nom_complet'),
  ]);
  if (n.error || m.error || p.error || e.error || o.error) return parametresGardes(marcheId);
  const valeur: Parametres = {
    natures: n.data as Nature[], motifs: m.data as Motif[], pieces: p.data as Piece[],
    equipes: e.data as Equipe[], ouvriers: o.data as Ouvrier[],
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
    (async () => {
      const copie = await parametresGardes(marcheId);
      if (annule) return;
      setP(copie);
      if (aRenouveler) return;
      const v = await chargerParametres(marcheId);
      if (!annule) setP(v);
    })().catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [marcheId, aRenouveler]);
  return p;
}

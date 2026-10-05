// Paramètres du marché utiles à la saisie (natures de réfection, motifs, catalogue des pièces,
// équipes, ouvriers) : lus au serveur quand le réseau est là, sinon dernière copie gardée.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import type { Equipe, Motif, Nature, Ouvrier, Piece } from './types';

export interface Parametres { natures: Nature[]; motifs: Motif[]; pieces: Piece[]; equipes: Equipe[]; ouvriers: Ouvrier[] }
const VIDE: Parametres = { natures: [], motifs: [], pieces: [], equipes: [], ouvriers: [] };
const cle = (marcheId: string) => `suivi-fuites:parametres:${marcheId}`;

export async function chargerParametres(marcheId: string): Promise<Parametres> {
  const [n, m, p, e, o] = await Promise.all([
    supabase.from('natures_refection').select('id, code, libelle_fr, emplacement, necessite_refection')
      .eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    supabase.from('motifs').select('id, categorie, libelle_fr').eq('marche_id', marcheId).eq('actif', true).order('ordre'),
    supabase.from('catalogue_pieces').select('id, designation, unite').eq('marche_id', marcheId).eq('actif', true).order('designation'),
    supabase.from('equipes').select('id, type, numero, libelle').eq('marche_id', marcheId).eq('actif', true).order('type').order('numero'),
    supabase.from('ouvriers').select('id, nom_complet').eq('marche_id', marcheId).eq('actif', true).order('nom_complet'),
  ]);
  if (n.error || m.error || p.error || e.error || o.error) {
    try {
      return { ...VIDE, ...JSON.parse((await AsyncStorage.getItem(cle(marcheId))) ?? '{}') };
    } catch {
      return VIDE;
    }
  }
  const valeur: Parametres = {
    natures: n.data as Nature[], motifs: m.data as Motif[], pieces: p.data as Piece[],
    equipes: e.data as Equipe[], ouvriers: o.data as Ouvrier[],
  };
  AsyncStorage.setItem(cle(marcheId), JSON.stringify(valeur)).catch(() => undefined);
  return valeur;
}

export function useParametres(marcheId: string | undefined): Parametres {
  const [p, setP] = useState<Parametres>(VIDE);
  useEffect(() => {
    if (!marcheId) return;
    let annule = false;
    chargerParametres(marcheId).then((v) => !annule && setP(v)).catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [marcheId]);
  return p;
}

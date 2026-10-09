'use client';

// A1 : fuites « Attaché par anticipation » dont l'exécution réelle manque (fonction fuites_anticipees, contrat S2 § 6).
// Badge « Anticipé » et priorité (tableau de bord, À faire, Alertes) jusqu'à l'exécution.
import { useEffect, useMemo, useState } from 'react';
import { fonctionAbsente, getSupabase } from './supabase';

export interface FuiteAnticipee {
  fuite_id: string;
  fuite_numero: number;
  premier_lot: number | null;
  /** Date d'arrêt du premier lot qui l'a attachée */
  attachee_le: string | null;
  articles: number;
}

/** Plus ancienne d'abord ; [] si la fonction n'existe pas encore (base pas à jour, mode démonstration sans données). */
export async function chargerFuitesAnticipees(marcheId: string): Promise<FuiteAnticipee[]> {
  const { data, error } = await getSupabase().rpc('fuites_anticipees', { p_marche: marcheId });
  if (fonctionAbsente(error, data)) return [];
  if (error) throw error;
  return (data as FuiteAnticipee[] | null) ?? [];
}

export function useFuitesAnticipees(marcheId: string | undefined, version = 0) {
  const [liste, setListe] = useState<FuiteAnticipee[]>([]);
  useEffect(() => {
    if (!marcheId) return;
    let annule = false;
    chargerFuitesAnticipees(marcheId).then((l) => !annule && setListe(l), () => !annule && setListe([]));
    return () => {
      annule = true;
    };
  }, [marcheId, version]);
  return useMemo(() => ({ liste, parFuite: new Map(liste.map((f) => [f.fuite_id, f])) }), [liste]);
}

/** Jours écoulés depuis l'arrêt du lot qui a attaché la fuite par anticipation. */
export const joursDepuisAttache = (f: FuiteAnticipee, maintenant = Date.now()) =>
  f.attachee_le ? Math.max(0, Math.floor((maintenant - new Date(`${f.attachee_le}T12:00:00`).getTime()) / 86_400_000)) : null;

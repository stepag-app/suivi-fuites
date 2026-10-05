// Lecture des contrôles de cohérence du marché (vue v_controles_attachement, RLS appliquée :
// droits « attachements / lire » et « quantités / lire »), regroupés par fuite.
import { useEffect, useState } from 'react';
import { messageErreur } from '@/lib/format';
import { getSupabase, lireTout } from '@/lib/supabase';
import { COLONNES_CONTROLES, controlesParFuite, type Controle } from './controles';

export function useControles(marcheId: string | undefined, version: number) {
  const [liste, setListe] = useState<Controle[]>([]);
  const [parFuite, setParFuite] = useState<Map<string, Controle[]>>(new Map());
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    if (!marcheId) return;
    let actif = true;
    lireTout<Controle>((de, a) => getSupabase().from('v_controles_attachement').select(COLONNES_CONTROLES)
      .eq('marche_id', marcheId).order('fuite_numero').order('controle').order('reparation_id').order('ligne_id').range(de, a))
      .then((l) => {
        if (!actif) return;
        setListe(l);
        setParFuite(controlesParFuite(l));
        setErreur('');
      }, (e: unknown) => {
        if (actif) setErreur(`Contrôles indisponibles : ${messageErreur(e)}`);
      });
    return () => {
      actif = false;
    };
  }, [marcheId, version]);

  return { liste, parFuite, erreur };
}

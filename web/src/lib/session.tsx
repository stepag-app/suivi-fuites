'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurationManquante, getSupabase } from './supabase';
import type { Action, Droit, Marche, Profil, TypeDonnee } from './types';

interface Etat {
  chargement: boolean;
  session: Session | null;
  profil: Profil | null;
  marches: Marche[];
  marche: Marche | null;
  choisirMarche: (id: string) => void;
  peut: (type: TypeDonnee, action: Action) => boolean;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<Etat | null>(null);
const CLE_MARCHE = 'suivi-fuites:marche';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [chargement, setChargement] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [marches, setMarches] = useState<Marche[]>([]);
  const [droits, setDroits] = useState<Droit[]>([]);
  const [marcheId, setMarcheId] = useState<string | null>(null);

  useEffect(() => {
    if (configurationManquante()) {
      setChargement(false);
      return;
    }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setChargement(false);
    });
    const { data: abonnement } = sb.auth.onAuthStateChange((_evenement, s) => {
      setSession(s);
      if (!s) {
        setProfil(null);
        setMarches([]);
        setDroits([]);
        setChargement(false);
      }
    });
    return () => abonnement.subscription.unsubscribe();
  }, []);

  const utilisateurId = session?.user.id;
  useEffect(() => {
    if (!utilisateurId) return;
    let annule = false;
    (async () => {
      const sb = getSupabase();
      const [p, m, d] = await Promise.all([
        sb.from('profils').select('*').eq('id', utilisateurId).maybeSingle(),
        sb.from('marches').select('id, code, intitule, client, ville, taux_majoration, taux_tva, rayon_redetection_m').order('code'),
        sb.from('droits').select('marche_id, type_donnee, lire, creer, modifier, supprimer, valider').eq('profil_id', utilisateurId),
      ]);
      if (annule) return;
      const profilCharge = (p.data as Profil | null) ?? null;
      if (profilCharge && !profilCharge.actif) {
        await sb.auth.signOut();
        return;
      }
      setProfil(profilCharge);
      const liste = (m.data as Marche[] | null) ?? [];
      setMarches(liste);
      setDroits((d.data as Droit[] | null) ?? []);
      const memorise = typeof window !== 'undefined' ? window.localStorage.getItem(CLE_MARCHE) : null;
      setMarcheId(liste.find((x) => x.id === memorise)?.id ?? liste[0]?.id ?? null);
      setChargement(false);
    })();
    return () => {
      annule = true;
    };
  }, [utilisateurId]);

  const choisirMarche = useCallback((id: string) => {
    setMarcheId(id);
    try {
      window.localStorage.setItem(CLE_MARCHE, id);
    } catch {
      /* stockage indisponible : sans conséquence */
    }
  }, []);

  const marche = useMemo(() => marches.find((x) => x.id === marcheId) ?? null, [marches, marcheId]);

  // L'affichage s'adapte aux droits ; la vraie protection reste la RLS côté base.
  const peut = useCallback(
    (type: TypeDonnee, action: Action) => {
      if (profil?.est_admin) return true;
      const d = droits.find((x) => x.marche_id === marcheId && x.type_donnee === type);
      if (!d) return false;
      if (action === 'modifier' || action === 'supprimer') return d[action] !== 'non';
      return d[action];
    },
    [profil, droits, marcheId],
  );

  const deconnecter = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  const valeur = useMemo(
    () => ({ chargement, session, profil, marches, marche, choisirMarche, peut, deconnecter }),
    [chargement, session, profil, marches, marche, choisirMarche, peut, deconnecter],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): Etat {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error('useSession doit être utilisé dans SessionProvider');
  return ctx;
}

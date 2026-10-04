import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configurationManquante, supabase } from './supabase';
import type { Droit, Marche, Profil } from './types';

interface Etat {
  chargement: boolean;
  session: Session | null;
  profil: Profil | null;
  marche: Marche | null;
  peut: (type: string, action: 'lire' | 'creer') => boolean;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<Etat | null>(null);
const cleContexte = (id: string) => `suivi-fuites:contexte:${id}`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [chargement, setChargement] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [marches, setMarches] = useState<Marche[]>([]);
  const [droits, setDroits] = useState<Droit[]>([]);

  useEffect(() => {
    if (configurationManquante) {
      setChargement(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setChargement(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (!s) {
        setProfil(null);
        setMarches([]);
        setDroits([]);
        setChargement(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    let annule = false;
    (async () => {
      const [p, m, d] = await Promise.all([
        supabase.from('profils').select('id, identifiant, nom_complet, est_admin, actif').eq('id', uid).maybeSingle(),
        supabase.from('marches').select('id, code, intitule').order('code'),
        supabase.from('droits').select('marche_id, type_donnee, lire, creer, modifier, supprimer, valider').eq('profil_id', uid),
      ]);
      if (annule) return;
      if (p.error || m.error || d.error) {
        // Sans réseau : dernier contexte connu (profil, marchés, droits).
        const copie = JSON.parse((await AsyncStorage.getItem(cleContexte(uid))) ?? 'null');
        if (copie) {
          setProfil(copie.profil);
          setMarches(copie.marches);
          setDroits(copie.droits);
        }
        setChargement(false);
        return;
      }
      const profilCharge = p.data as Profil | null;
      if (profilCharge && !profilCharge.actif) {
        await supabase.auth.signOut();
        return;
      }
      setProfil(profilCharge);
      setMarches((m.data as Marche[]) ?? []);
      setDroits((d.data as Droit[]) ?? []);
      await AsyncStorage.setItem(
        cleContexte(uid),
        JSON.stringify({ profil: profilCharge, marches: m.data ?? [], droits: d.data ?? [] }),
      );
      setChargement(false);
    })();
    return () => {
      annule = true;
    };
  }, [uid]);

  // Le premier marché affecté ; le choix entre plusieurs marchés viendra avec le 2e marché.
  const marche = marches[0] ?? null;

  const peut = useCallback(
    (type: string, action: 'lire' | 'creer') => {
      if (profil?.est_admin) return true;
      const d = droits.find((x) => x.marche_id === marche?.id && x.type_donnee === type);
      return !!d && d[action];
    },
    [profil, droits, marche],
  );

  const deconnecter = useCallback(async () => {
    if (uid) await AsyncStorage.removeItem(cleContexte(uid));
    await supabase.auth.signOut();
  }, [uid]);

  const valeur = useMemo(
    () => ({ chargement, session, profil, marche, peut, deconnecter }),
    [chargement, session, profil, marche, peut, deconnecter],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): Etat {
  const c = useContext(Contexte);
  if (!c) throw new Error('useSession hors SessionProvider');
  return c;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { configurationManquante, supabase } from './supabase';
import type { Droit, Marche, Profil } from './types';

type Action = 'lire' | 'creer' | 'valider' | 'modifier' | 'supprimer';

interface Etat {
  chargement: boolean;
  session: Session | null;
  profil: Profil | null;
  marche: Marche | null;
  marches: Marche[];
  choisirMarche: (id: string) => void;
  /**
   * Droit sur le marché choisi. Pour « modifier » et « supprimer », `auteurs` (auteur terrain, compte de
   * saisie) applique la portée « siennes » comme la base ; sans `auteurs`, la ligne est supposée saisie ici.
   */
  peut: (type: string, action: Action, auteurs?: (string | null | undefined)[]) => boolean;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<Etat | null>(null);
const cleContexte = (id: string) => `suivi-fuites:contexte:${id}`;
const cleMarche = (id: string) => `suivi-fuites:marche:${id}`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [chargement, setChargement] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [marches, setMarches] = useState<Marche[]>([]);
  const [droits, setDroits] = useState<Droit[]>([]);
  const [marcheChoisi, setMarcheChoisi] = useState<string | null>(null);

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
      AsyncStorage.getItem(cleMarche(uid)).then((id) => !annule && setMarcheChoisi(id)).catch(() => undefined);
      const [p, m, d] = await Promise.all([
        supabase.from('profils').select('id, identifiant, nom_complet, est_admin, actif').eq('id', uid).maybeSingle(),
        // Le marché commencé le plus récemment d'abord (un marché de démonstration passe après).
        supabase.from('marches').select('*').order('date_commencement', { ascending: false, nullsFirst: false }).order('code'),
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

  // Marché choisi sur la tablette (mémorisé), sinon le premier de la liste.
  const marche = marches.find((x) => x.id === marcheChoisi) ?? marches[0] ?? null;
  const choisirMarche = useCallback(
    (id: string) => {
      setMarcheChoisi(id);
      if (uid) AsyncStorage.setItem(cleMarche(uid), id).catch(() => undefined);
    },
    [uid],
  );

  const peut = useCallback(
    (type: string, action: Action, auteurs?: (string | null | undefined)[]) => {
      if (profil?.est_admin) return true;
      const d = droits.find((x) => x.marche_id === marche?.id && x.type_donnee === type);
      if (!d) return false;
      if (action === 'modifier' || action === 'supprimer') {
        const portee = d[action];
        return portee === 'toutes' || (portee === 'siennes' && (!auteurs || (!!uid && auteurs.includes(uid))));
      }
      return d[action];
    },
    [profil, droits, marche, uid],
  );

  const deconnecter = useCallback(async () => {
    if (uid) await AsyncStorage.removeItem(cleContexte(uid));
    await supabase.auth.signOut();
  }, [uid]);

  const valeur = useMemo(
    () => ({ chargement, session, profil, marche, marches, choisirMarche, peut, deconnecter }),
    [chargement, session, profil, marche, marches, choisirMarche, peut, deconnecter],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): Etat {
  const c = useContext(Contexte);
  if (!c) throw new Error('useSession hors SessionProvider');
  return c;
}

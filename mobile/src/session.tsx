import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { chargerContexte, cleContexte, fermerSession, suivreSession } from './session-donnees';
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
const cleMarche = (id: string) => `suivi-fuites:marche:${id}`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [chargement, setChargement] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  // Jeton expiré pas encore renouvelé (démarrage hors ligne) : contexte de la copie gardée sur la tablette.
  const [aRenouveler, setARenouveler] = useState(false);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [marches, setMarches] = useState<Marche[]>([]);
  const [droits, setDroits] = useState<Droit[]>([]);
  const [marcheChoisi, setMarcheChoisi] = useState<string | null>(null);

  useEffect(() => {
    if (configurationManquante) {
      setChargement(false);
      return;
    }
    return suivreSession((etat) => {
      setSession(etat.session);
      setARenouveler(etat.aRenouveler);
      if (!etat.session) {
        setProfil(null);
        setMarches([]);
        setDroits([]);
        setChargement(false);
      }
    });
  }, []);

  // Profil, marchés et droits ; jeton à renouveler : copie de la tablette, puis serveur une fois le jeton renouvelé.
  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    let annule = false;
    (async () => {
      AsyncStorage.getItem(cleMarche(uid)).then((id) => !annule && setMarcheChoisi(id)).catch(() => undefined);
      const contexte = await chargerContexte(uid, !aRenouveler);
      if (annule) return;
      if (contexte === 'inactif') {
        await supabase.auth.signOut();
        return;
      }
      if (contexte) {
        setProfil(contexte.profil);
        setMarches(contexte.marches);
        setDroits(contexte.droits);
      }
      setChargement(false);
    })();
    return () => {
      annule = true;
    };
  }, [uid, aRenouveler]);

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
    await fermerSession(aRenouveler);
  }, [uid, aRenouveler]);

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

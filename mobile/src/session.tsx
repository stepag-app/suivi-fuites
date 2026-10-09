import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { retirerPush } from './push';
import { chargerContexte, cleContexte, fermerSession, jetonARenouveler, suivreSession, type Contexte as ContexteAgent, type EtatSession } from './session-donnees';
import { configurationManquante, supabase } from './supabase';
import type { Droit, Marche, Profil } from './types';

type Action = 'lire' | 'creer' | 'valider' | 'modifier' | 'supprimer';

interface Etat {
  chargement: boolean;
  session: Session | null;
  /** Jeton expiré pas encore renouvelé (hors ligne) : écrans sur les copies de la tablette, aucune requête. */
  aRenouveler: boolean;
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
const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [chargement, setChargement] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [aRenouveler, setARenouveler] = useState(false);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [marches, setMarches] = useState<Marche[]>([]);
  const [droits, setDroits] = useState<Droit[]>([]);
  const [marcheChoisi, setMarcheChoisi] = useState<string | null>(null);

  const appliquer = useCallback((etat: EtatSession) => {
    setSession(etat.session);
    setARenouveler(etat.aRenouveler);
    if (!etat.session) {
      setProfil(null);
      setMarches([]);
      setDroits([]);
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (configurationManquante) {
      setChargement(false);
      return;
    }
    return suivreSession(appliquer);
  }, [appliquer]);

  // Profil, marchés et droits : copie de la tablette d'abord, puis serveur (après le renouvellement du jeton s'il est
  // à renouveler). Un contexte inchangé garde ses objets : la liste ne se recharge pas pour rien.
  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    let annule = false;
    const afficher = (c: ContexteAgent) => {
      if (annule) return;
      setProfil((x) => (memes(x, c.profil) ? x : c.profil));
      setMarches((x) => (memes(x, c.marches) ? x : c.marches));
      setDroits((x) => (memes(x, c.droits) ? x : c.droits));
      setChargement(false);
    };
    (async () => {
      const choisi = await AsyncStorage.getItem(cleMarche(uid)).catch(() => null);
      if (annule) return;
      setMarcheChoisi(choisi);
      const fin = await chargerContexte(uid, aRenouveler, afficher);
      if (annule) return;
      if (fin === 'inactif') {
        await supabase.auth.signOut();
        return;
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
    // Les push de ce compte ne doivent plus arriver sur la tablette (avec réseau ; sans, le prochain agent la reprend).
    if (!aRenouveler && !jetonARenouveler()) await Promise.race([retirerPush(), new Promise((fin) => setTimeout(fin, 5000))]);
    await fermerSession(aRenouveler);
    // Écran Connexion sans attendre SIGNED_OUT, qui suit la fin des reprises d'auth-js au démarrage hors ligne.
    appliquer({ session: null, aRenouveler: false });
  }, [uid, aRenouveler, appliquer]);

  const valeur = useMemo(
    () => ({ chargement, session, aRenouveler, profil, marche, marches, choisirMarche, peut, deconnecter }),
    [chargement, session, aRenouveler, profil, marche, marches, choisirMarche, peut, deconnecter],
  );
  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): Etat {
  const c = useContext(Contexte);
  if (!c) throw new Error('useSession hors SessionProvider');
  return c;
}

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurationManquante, getSupabase } from './supabase';
import type { Action, Droit, Marche, Profil, TypeDonnee } from './types';
// Règle d'affichage partagée avec la matrice des droits (calcul pur, vérifié par scripts/verifier-matrice-droits.mjs).
import { peutSelonDroits, verrouPose, type Verrou } from '@/app/(app)/utilisateurs/matrice';

interface Etat {
  chargement: boolean;
  session: Session | null;
  profil: Profil | null;
  marches: Marche[];
  marche: Marche | null;
  choisirMarche: (id: string) => void;
  recharger: () => void;
  peut: (type: TypeDonnee, action: Action) => boolean;
  /** Verrous de sécurité que l'administrateur a posés sur lui-même (vide pour les autres comptes). */
  verrous: Verrou[];
  /** L'administrateur a verrouillé cette action pour lui-même (bouton à masquer ou à désactiver). */
  verrouille: (objet: string, action: string) => boolean;
  deconnecter: () => Promise<void>;
}

const Contexte = createContext<Etat | null>(null);
const CLE_MARCHE = 'suivi-fuites:marche';
const COLONNES_MARCHE = 'id, code, intitule, client, ville, actif, taux_majoration, taux_tva, rayon_redetection_m';
const COLONNES_MARCHE_CLIENT = 'client_sigle, libelle_reference, masque_reference, jalons_client, delai_alerte_reparation_h, devise';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [chargement, setChargement] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profil, setProfil] = useState<Profil | null>(null);
  const [marches, setMarches] = useState<Marche[]>([]);
  const [droits, setDroits] = useState<Droit[]>([]);
  const [verrous, setVerrous] = useState<Verrou[]>([]);
  const [marcheId, setMarcheId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

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
        setVerrous([]);
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
      const [p, mComplet, d, v] = await Promise.all([
        sb.from('profils').select('*').eq('id', utilisateurId).maybeSingle(),
        sb.from('marches').select(`${COLONNES_MARCHE}, ${COLONNES_MARCHE_CLIENT}`).order('date_commencement', { ascending: false, nullsFirst: false }).order('code'),
        sb.from('droits').select('marche_id, type_donnee, lire, creer, modifier, supprimer, valider').eq('profil_id', utilisateurId),
        sb.from('verrous_admin').select('objet, action').eq('profil_id', utilisateurId),
      ]);
      // Base pas encore à jour (colonne inconnue) : colonnes d'origine, libellés par défaut.
      const m = mComplet.error?.code === '42703'
        ? await sb.from('marches').select(COLONNES_MARCHE).order('date_commencement', { ascending: false, nullsFirst: false }).order('code')
        : mComplet;
      if (annule) return;
      // Sans réseau : dernier contexte connu de cet utilisateur (profil, marchés, droits).
      const cleCache = `suivi-fuites:contexte:${utilisateurId}`;
      if (p.error || m.error || d.error) {
        try {
          const copie = JSON.parse(window.localStorage.getItem(cleCache) ?? 'null');
          if (copie) {
            setProfil(copie.profil);
            setMarches(copie.marches);
            setDroits(copie.droits);
            setVerrous(copie.verrous ?? []);
            setMarcheId(copie.marches.find((x: Marche) => x.id === window.localStorage.getItem(CLE_MARCHE))?.id ?? copie.marches[0]?.id ?? null);
            setChargement(false);
            return;
          }
        } catch {
          /* copie illisible : on continue avec ce qu'on a */
        }
      }
      const profilCharge = (p.data as Profil | null) ?? null;
      if (profilCharge && !profilCharge.actif) {
        await sb.auth.signOut({ scope: 'local' });
        return;
      }
      setProfil(profilCharge);
      // Un marché désactivé n'est plus proposé ; l'administrateur le garde (page Marchés, réactivation).
      const liste = ((m.data as Marche[] | null) ?? []).filter((x) => profilCharge?.est_admin || x.actif !== false);
      setMarches(liste);
      setDroits((d.data as Droit[] | null) ?? []);
      // Table absente (base pas encore à jour) : aucun verrou. La base reste juge dans tous les cas.
      const verrousCharges = v.error ? [] : ((v.data as Verrou[] | null) ?? []);
      setVerrous(verrousCharges);
      try {
        window.localStorage.setItem(cleCache, JSON.stringify({ profil: profilCharge, marches: liste, droits: d.data ?? [], verrous: verrousCharges }));
      } catch {
        /* stockage indisponible */
      }
      const memorise = typeof window !== 'undefined' ? window.localStorage.getItem(CLE_MARCHE) : null;
      setMarcheId(liste.find((x) => x.id === memorise)?.id ?? liste[0]?.id ?? null);
      setChargement(false);
    })();
    return () => {
      annule = true;
    };
  }, [utilisateurId, version]);

  // Relit profil, marchés et droits (après une modification de la fiche du marché).
  const recharger = useCallback(() => setVersion((v) => v + 1), []);

  const choisirMarche = useCallback((id: string) => {
    setMarcheId(id);
    try {
      window.localStorage.setItem(CLE_MARCHE, id);
    } catch {
      /* stockage indisponible : sans conséquence */
    }
  }, []);

  const marche = useMemo(() => marches.find((x) => x.id === marcheId) ?? null, [marches, marcheId]);

  // L'affichage s'adapte aux droits (l'administrateur : tout, sauf ce qu'il a verrouillé pour lui-même) ;
  // la vraie protection reste la RLS côté base.
  const peut = useCallback(
    (type: TypeDonnee, action: Action) =>
      peutSelonDroits({ estAdmin: profil?.est_admin === true, verrous, droits, marcheId }, type, action),
    [profil, verrous, droits, marcheId],
  );

  const verrouille = useCallback(
    (objet: string, action: string) => profil?.est_admin === true && verrouPose(verrous, objet, action),
    [profil, verrous],
  );

  const deconnecter = useCallback(async () => {
    try {
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('suivi-fuites:contexte:'))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* stockage indisponible */
    }
    // Cet appareil seulement : une déconnexion globale fermerait aussi la session des tablettes (APK) du même compte,
    // et celle de l'APK quand on se déconnecte dans le panneau ouvert par le Balayage (session partagée).
    await getSupabase().auth.signOut({ scope: 'local' });
  }, []);

  const valeur = useMemo(
    () => ({ chargement, session, profil, marches, marche, choisirMarche, recharger, peut, verrous, verrouille, deconnecter }),
    [chargement, session, profil, marches, marche, choisirMarche, recharger, peut, verrous, verrouille, deconnecter],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): Etat {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error('useSession doit être utilisé dans SessionProvider');
  return ctx;
}

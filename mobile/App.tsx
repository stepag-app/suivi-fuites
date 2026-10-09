import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AValiderEcran } from './src/a-valider';
import { Balayage } from './src/balayage';
import { Connexion, EnAttente, Liste } from './src/ecrans';
import { Fiche, type ContexteSaisie } from './src/fiche';
import { synchroniser } from './src/file-attente';
import { LangueProvider, useLangue } from './src/langue';
import { BandeauMiseAJour, useMiseAJour } from './src/mise-a-jour';
import { EcranNotifications, useNonLues, useToucherNotification } from './src/notifications';
import { NouvelleFuite } from './src/nouvelle-fuite';
import { enregistrerPush, retenirLangue } from './src/push';
import { SaisieRefection, SaisieReparation } from './src/saisie';
import { SessionProvider, useSession } from './src/session';
import { configurationManquante } from './src/supabase';
import type { FicheFuite } from './src/types';
import { BarreApp, COULEURS, Message, s } from './src/ui';

type Vue =
  | { nom: 'liste' } | { nom: 'nouvelle'; modification?: FicheFuite } | { nom: 'attente' } | { nom: 'balayage' }
  | { nom: 'avalider' } | { nom: 'notifications' } | { nom: 'fiche'; id: string }
  | { nom: 'reparation' | 'refection'; contexte: ContexteSaisie };
const LISTE: Vue = { nom: 'liste' };

function Racine() {
  const { chargement, session, aRenouveler, marche, marches, choisirMarche } = useSession();
  const { t, langue } = useLangue();
  const [vue, setVue] = useState<Vue>(LISTE);
  const retourListe = () => setVue(LISTE);
  // Une saisie et la modification d'une fuite reviennent à leur fiche, le reste à la liste.
  const precedente = (v: Vue): Vue => (v.nom === 'reparation' || v.nom === 'refection'
    ? { nom: 'fiche', id: v.contexte.fuiteId }
    : v.nom === 'nouvelle' && v.modification ? { nom: 'fiche', id: v.modification.id } : LISTE);
  const [nonLues, relireNonLues] = useNonLues();
  const miseAJour = useMiseAJour();
  const uid = session?.user.id;

  // Bouton retour d'Android : revenir d'un écran au lieu de quitter l'application.
  // L'écran Balayage le prend lui-même (historique de la WebView d'abord).
  useEffect(() => {
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      if (vue.nom === 'liste' || vue.nom === 'balayage') return false;
      setVue(precedente(vue));
      return true;
    });
    return () => abonnement.remove();
  }, [vue]);

  // Changement de marché : on repart de la liste, sauf pour ouvrir la fiche d'une notification d'un autre marché.
  const ficheApresMarche = useRef<string | null>(null);
  useEffect(() => {
    const id = ficheApresMarche.current;
    ficheApresMarche.current = null;
    setVue(id ? { nom: 'fiche', id } : LISTE);
  }, [marche?.id]);

  // Envoi automatique : à l'ouverture, au retour sur l'application et toutes les 30 s.
  useEffect(() => {
    if (!session) return;
    const lancer = () => void synchroniser().catch(() => undefined);
    lancer();
    const minuteur = setInterval(lancer, 30000);
    const abonnement = AppState.addEventListener('change', (e) => e === 'active' && lancer());
    return () => {
      clearInterval(minuteur);
      abonnement.remove();
    };
  }, [session]);

  // Push (N2) : jeton de la tablette pour ce compte, et langue de l'agent pour le texte des notifications.
  useEffect(() => {
    if (!uid || aRenouveler) return;
    void enregistrerPush();
  }, [uid, aRenouveler]);
  useEffect(() => {
    if (uid && !aRenouveler) void retenirLangue(uid, langue);
  }, [uid, aRenouveler, langue]);

  // Toucher une notification du rideau : fiche de la fuite (dans son marché).
  const enAttente = useRef<{ fuite: string; marche?: string } | null>(null);
  const [notificationTouchee, setNotificationTouchee] = useState(0);
  const ouvrirNotification = useCallback((fuite: string, marcheId?: string) => {
    enAttente.current = { fuite, marche: marcheId };
    setNotificationTouchee((n) => n + 1);
    relireNonLues();
  }, [relireNonLues]);
  useToucherNotification(ouvrirNotification);
  useEffect(() => {
    const d = enAttente.current;
    if (!d || !session || chargement || !marche) return;
    enAttente.current = null;
    if (d.marche && d.marche !== marche.id && marches.some((m) => m.id === d.marche)) {
      ficheApresMarche.current = d.fuite;
      choisirMarche(d.marche);
    } else setVue({ nom: 'fiche', id: d.fuite });
  }, [notificationTouchee, session, chargement, marche, marches, choisirMarche]);

  if (configurationManquante) return <Avis texte={t('Application non configurée (adresse du serveur absente).')} />;
  if (chargement) {
    return (
      <View style={s.ecran}>
        <BarreApp titre={t('Suivi des fuites')} />
        <View style={[s.contenu, { flex: 1, justifyContent: 'center' }]}><ActivityIndicator size="large" color={COULEURS.principal} /></View>
      </View>
    );
  }
  if (!session) return <Connexion />;
  if (!marche) return <Avis texte={t("Aucun marché n'est affecté à votre compte. Contactez l'administrateur.")} />;
  const ouvrir = (id: string) => setVue({ nom: 'fiche', id });
  switch (vue.nom) {
    case 'nouvelle':
      return <NouvelleFuite key={vue.modification?.id ?? 'nouvelle'} retour={() => setVue(precedente(vue))} ouvrirFiche={ouvrir} modification={vue.modification} />;
    case 'attente':
      return <EnAttente retour={retourListe} />;
    case 'balayage':
      return <Balayage retour={retourListe} />;
    case 'avalider':
      return <AValiderEcran retour={retourListe} ouvrir={ouvrir} />;
    case 'notifications':
      return <EcranNotifications retour={retourListe} ouvrir={ouvrir} lues={relireNonLues} />;
    case 'fiche':
      return (
        <Fiche
          key={vue.id} id={vue.id} retour={retourListe} saisir={(nom, contexte) => setVue({ nom, contexte })}
          modifierFuite={(f) => setVue({ nom: 'nouvelle', modification: f })}
        />
      );
    case 'reparation':
      return <SaisieReparation contexte={vue.contexte} retour={() => setVue(precedente(vue))} />;
    case 'refection':
      return <SaisieRefection contexte={vue.contexte} retour={() => setVue(precedente(vue))} />;
    default:
      return (
        <Liste
          nouvelle={() => setVue({ nom: 'nouvelle' })}
          attente={() => setVue({ nom: 'attente' })}
          balayage={() => setVue({ nom: 'balayage' })}
          aValider={() => setVue({ nom: 'avalider' })}
          notifications={() => setVue({ nom: 'notifications' })}
          nonLues={nonLues}
          miseAJour={miseAJour ? <BandeauMiseAJour version={miseAJour} /> : null}
          ouvrir={ouvrir}
        />
      );
  }
}

function Avis({ texte }: { texte: string }) {
  const { t } = useLangue();
  return (
    <View style={s.ecran}>
      <BarreApp titre={t('Suivi des fuites')} />
      <View style={s.defile}><Message ton="erreur">{texte}</Message></View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LangueProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Racine />
        </SessionProvider>
      </LangueProvider>
    </SafeAreaProvider>
  );
}

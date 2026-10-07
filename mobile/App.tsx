import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Balayage } from './src/balayage';
import { Connexion, EnAttente, Liste, NouvelleFuite } from './src/ecrans';
import { Fiche, type ContexteSaisie } from './src/fiche';
import { synchroniser } from './src/file-attente';
import { SaisieRefection, SaisieReparation } from './src/saisie';
import { SessionProvider, useSession } from './src/session';
import { configurationManquante } from './src/supabase';
import { BarreApp, COULEURS, Message, s } from './src/ui';

type Vue =
  | { nom: 'liste' } | { nom: 'nouvelle' } | { nom: 'attente' } | { nom: 'balayage' } | { nom: 'fiche'; id: string }
  | { nom: 'reparation' | 'refection'; contexte: ContexteSaisie };
const LISTE: Vue = { nom: 'liste' };

function Racine() {
  const { chargement, session, marche } = useSession();
  const [vue, setVue] = useState<Vue>(LISTE);
  const retourListe = () => setVue(LISTE);
  // Une saisie revient à sa fiche, le reste à la liste.
  const precedente = (v: Vue): Vue => (v.nom === 'reparation' || v.nom === 'refection' ? { nom: 'fiche', id: v.contexte.fuiteId } : LISTE);

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

  // Changement de marché : on repart de la liste.
  useEffect(() => setVue(LISTE), [marche?.id]);

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

  if (configurationManquante) return <Avis texte="Application non configurée (adresse du serveur absente)." />;
  if (chargement) {
    return (
      <View style={s.ecran}>
        <BarreApp titre="Suivi des fuites" />
        <View style={[s.contenu, { flex: 1, justifyContent: 'center' }]}><ActivityIndicator size="large" color={COULEURS.principal} /></View>
      </View>
    );
  }
  if (!session) return <Connexion />;
  if (!marche) return <Avis texte="Aucun marché n'est affecté à votre compte. Contactez l'administrateur." />;
  const ouvrir = (id: string) => setVue({ nom: 'fiche', id });
  switch (vue.nom) {
    case 'nouvelle':
      return <NouvelleFuite retour={retourListe} ouvrirFiche={ouvrir} />;
    case 'attente':
      return <EnAttente retour={retourListe} />;
    case 'balayage':
      return <Balayage retour={retourListe} />;
    case 'fiche':
      return <Fiche key={vue.id} id={vue.id} retour={retourListe} saisir={(nom, contexte) => setVue({ nom, contexte })} />;
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
          ouvrir={ouvrir}
        />
      );
  }
}

function Avis({ texte }: { texte: string }) {
  return (
    <View style={s.ecran}>
      <BarreApp titre="Suivi des fuites" />
      <View style={s.defile}><Message ton="erreur">{texte}</Message></View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Racine />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

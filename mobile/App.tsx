import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Text, View } from 'react-native';
import { Connexion, EnAttente, Liste, NouvelleFuite } from './src/ecrans';
import { synchroniser } from './src/file-attente';
import { SessionProvider, useSession } from './src/session';
import { configurationManquante } from './src/supabase';
import { s } from './src/ui';

function Racine() {
  const { chargement, session, marche } = useSession();
  const [ecran, setEcran] = useState<'liste' | 'nouvelle' | 'attente'>('liste');

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

  if (configurationManquante) {
    return <View style={[s.ecran, s.contenu, { paddingTop: 80 }]}><Text style={s.erreur}>Application non configurée (adresse du serveur absente).</Text></View>;
  }
  if (chargement) return <View style={[s.ecran, { justifyContent: 'center' }]}><ActivityIndicator size="large" /></View>;
  if (!session) return <Connexion />;
  if (!marche) return <View style={[s.ecran, s.contenu, { paddingTop: 80 }]}><Text style={s.erreur}>Aucun marché n&apos;est affecté à votre compte. Contactez l&apos;administrateur.</Text></View>;
  if (ecran === 'nouvelle') return <NouvelleFuite retour={() => setEcran('liste')} />;
  if (ecran === 'attente') return <EnAttente retour={() => setEcran('liste')} />;
  return <Liste nouvelle={() => setEcran('nouvelle')} attente={() => setEcran('attente')} />;
}

export default function App() {
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Racine />
    </SessionProvider>
  );
}

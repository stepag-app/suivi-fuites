import type { Session } from '@supabase/supabase-js';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { supabase } from './supabase';
import { BarreApp, Bouton, Carte, COULEURS, s } from './ui';

// Adresse publique du panneau web (aucun secret). Les jetons de session vont dans le fragment « # », que la
// WebView n'envoie jamais au serveur ; ils ne sont jamais journalisés.
const PANNEAU = (process.env.EXPO_PUBLIC_WEB_URL || 'https://suivi-fuites-web.vercel.app').replace(/\/+$/, '');
const ORIGINE = PANNEAU.match(/^https?:\/\/[^/]+/)?.[0] ?? PANNEAU;
const PAGE_SESSION = `${PANNEAU}/session`;
const SUITE = encodeURIComponent('/carte?mode=balayage');
const DELAI_SONDE_MS = 8000;
// Le panneau garde sa propre copie de la session et la renouvelle lui-même ~1,5 min avant l'échéance, avec le
// même jeton de rafraîchissement que la tablette ; un jeton réutilisé déconnecte les deux côtés (rotation
// Supabase). La tablette renouvelle donc la première, 5 min avant, puis recharge la WebView avec les nouveaux jetons.
const MARGE_RENOUVELLEMENT_MS = 5 * 60 * 1000;
const HORS_LIGNE = 'La carte du réseau a besoin de la connexion.';

const adresse = (session: Session) =>
  `${PAGE_SESSION}#access_token=${encodeURIComponent(session.access_token)}` +
  `&refresh_token=${encodeURIComponent(session.refresh_token)}&suite=${SUITE}`;
const estPanneau = (url: string) => url === ORIGINE || url.startsWith(`${ORIGINE}/`);
const estPageSession = (url: string) => url.split(/[#?]/)[0].replace(/\/$/, '') === PAGE_SESSION;

/** Le panneau répond-il ? Sans jeton : un simple HEAD sur la page de session. */
async function panneauJoignable() {
  const controleur = new AbortController();
  const delai = setTimeout(() => controleur.abort(), DELAI_SONDE_MS);
  try {
    await fetch(PAGE_SESSION, { method: 'HEAD', cache: 'no-store', signal: controleur.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(delai);
  }
}

const Chargement = () => (
  <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: COULEURS.fond }]}>
    <ActivityIndicator size="large" color={COULEURS.principal} />
    <Text style={s.discret}>Chargement de la carte…</Text>
  </View>
);

/** Carte du réseau et balayage par tronçon : le panneau web, ouvert dans une WebView avec la session de la tablette. */
export function Balayage({ retour }: { retour: () => void }) {
  const web = useRef<WebView>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [cle, setCle] = useState(0);
  const [peutReculer, setPeutReculer] = useState(false);
  const uriCourante = useRef<string | null>(null);
  // Vrai tant que la page /session demandée n'a pas redirigé vers la carte : la revoir ensuite, c'est un
  // retour arrière au-delà de la carte, donc la fin de l'écran.
  const attenteSession = useRef(true);

  const appliquer = useCallback((session: Session) => {
    const nouvelle = adresse(session);
    if (nouvelle === uriCourante.current) return;
    uriCourante.current = nouvelle;
    attenteSession.current = true;
    setUri(nouvelle);
  }, []);

  const charger = useCallback(async () => {
    setMessage('');
    if (!(await panneauJoignable())) {
      setMessage(HORS_LIGNE);
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setMessage('Session expirée : reconnectez-vous.');
      return;
    }
    appliquer(data.session);
    setCle((c) => c + 1);
  }, [appliquer]);

  useEffect(() => {
    // Position demandée avant la carte : le panneau la lit ensuite par navigator.geolocation.
    Location.requestForegroundPermissionsAsync().catch(() => undefined);
    void charger();
  }, [charger]);

  // Session renouvelée ou autre compte : la WebView repart avec les nouveaux jetons.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((evenement, session) => {
      if (!session || (evenement !== 'TOKEN_REFRESHED' && evenement !== 'SIGNED_IN' && evenement !== 'USER_UPDATED')) return;
      appliquer(session);
      setMessage('');
    });
    return () => data.subscription.unsubscribe();
  }, [appliquer]);

  useEffect(() => {
    const verifier = async () => {
      const { data } = await supabase.auth.getSession();
      const echeance = data.session?.expires_at;
      if (echeance && echeance * 1000 - Date.now() < MARGE_RENOUVELLEMENT_MS) await supabase.auth.refreshSession();
    };
    const minuteur = setInterval(() => void verifier().catch(() => undefined), 60000);
    return () => clearInterval(minuteur);
  }, []);

  // Bouton retour d'Android : d'abord l'historique de la WebView, sinon la liste.
  useEffect(() => {
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      if (peutReculer && !message && web.current) web.current.goBack();
      else retour();
      return true;
    });
    return () => abonnement.remove();
  }, [peutReculer, message, retour]);

  const surNavigation = (nav: WebViewNavigation) => {
    setPeutReculer(nav.canGoBack);
    if (!estPanneau(nav.url)) return;
    if (!estPageSession(nav.url)) attenteSession.current = false;
    else if (!attenteSession.current) retour();
  };

  // Seul le panneau se charge dans la WebView ; les autres liens (itinéraire Google Maps…) partent vers la tablette.
  const filtrer = (demande: WebViewNavigation) => {
    if (estPanneau(demande.url) || demande.url.startsWith('about:')) return true;
    Linking.openURL(demande.url).catch(() => undefined);
    return false;
  };

  return (
    <View style={s.ecran}>
      <BarreApp titre="Balayage" sousTitre="Carte du réseau" retour={retour} />
      {message ? (
        <View style={s.contenu}>
          <Carte>
            <Text style={s.erreur}>{message}</Text>
            <Bouton titre="Réessayer" primaire onPress={() => void charger()} />
            <Bouton titre="Retour à la liste" onPress={retour} />
          </Carte>
        </View>
      ) : !uri ? (
        <View style={[s.contenu, { flex: 1, justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={COULEURS.principal} />
        </View>
      ) : (
        <WebView
          key={cle}
          ref={web}
          source={{ uri }}
          style={{ flex: 1, backgroundColor: COULEURS.fond }}
          javaScriptEnabled
          domStorageEnabled
          geolocationEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          applicationNameForUserAgent="SuiviFuitesAPK"
          startInLoadingState
          renderLoading={Chargement}
          onShouldStartLoadWithRequest={filtrer}
          onNavigationStateChange={surNavigation}
          onError={() => setMessage(HORS_LIGNE)}
          onHttpError={(e) => {
            if (e.nativeEvent.statusCode >= 500) setMessage(`Le panneau web ne répond pas (erreur ${e.nativeEvent.statusCode}). Réessayez dans un instant.`);
          }}
          onRenderProcessGone={() => setMessage("La carte s'est arrêtée. Réessayez.")}
        />
      )}
    </View>
  );
}

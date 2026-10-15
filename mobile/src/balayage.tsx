import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { langueCourante, t, tx, useLangue, type Langue } from './langue';
import { useSession } from './session';
import { reprendreSuivi } from './suivi-gps';
import { supabase } from './supabase';
import { BarreApp, Bouton, Carte, COULEURS, Message, s, useBas } from './ui';

// Adresse publique du panneau web (aucun secret). Les jetons de session vont dans le fragment « # », que la
// WebView n'envoie jamais au serveur ; ils ne sont jamais journalisés.
export const PANNEAU = (process.env.EXPO_PUBLIC_WEB_URL || 'https://fuites.stepag.ma').replace(/\/+$/, '');
const ORIGINE = PANNEAU.match(/^https?:\/\/[^/]+/)?.[0] ?? PANNEAU;
const PAGE_SESSION = `${PANNEAU}/session`;
// Langue de la tablette transmise au panneau (cartes traduites : web/src/lib/langue-apk.ts), français compris : sans
// elle, la page garderait la langue d'avant pour l'onglet.
const avecLangue = (chemin: string) => `${chemin}${chemin.includes('?') ? '&' : '?'}langue=${langueCourante()}`;

/**
 * Langue changée sur la tablette, carte ouverte : la page la reçoit par l'événement `langue-apk` et se redessine sans
 * recharger (sélection de balayage, épingle de la mini-carte gardées). Un panneau plus ancien l'ignore.
 */
export const scriptLangue = (langue: Langue) =>
  `window.dispatchEvent(new CustomEvent('langue-apk', { detail: ${JSON.stringify(langue)} })); true;`;
// Large : sur un réseau lent, la première connexion à un nom d'hôte peut prendre une dizaine de secondes (DNS).
const DELAI_SONDE_MS = 15000;
// Le panneau garde sa propre copie de la session et la renouvelle lui-même ~1,5 min avant l'échéance, avec le
// même jeton de rafraîchissement que la tablette ; un jeton réutilisé déconnecte les deux côtés (rotation
// Supabase). La tablette renouvelle donc la première, 5 min avant, puis recharge la WebView avec les nouveaux jetons.
const MARGE_RENOUVELLEMENT_MS = 5 * 60 * 1000;
const HORS_LIGNE = 'La carte du réseau a besoin de la connexion.';
const PAS_ENCORE_GARDEE = "La carte n'est pas encore sur cette tablette pour ce compte : ouvrez-la une fois avec du réseau (Wi-Fi ou 4G).";
// Carte sans réseau (lot CH) : le panneau garde sur la tablette (WebView) tout ce qu'il faut et le signale ici, avec le
// compte de sa session. Sans réseau, la carte s'ouvre directement, sans passer par /session (qui a besoin du serveur),
// seulement pour ce compte : sinon les balayages partiraient au nom de l'agent précédent. La copie reste à la
// déconnexion (tablette partagée entre agents du même marché).
const CLE_CARTE_GARDEE = 'suivi-fuites:carte-hors-ligne';

async function carteGardeePour(uid: string | undefined): Promise<boolean> {
  if (!uid) return false;
  try {
    const g = JSON.parse((await AsyncStorage.getItem(CLE_CARTE_GARDEE)) ?? 'null') as { pret?: boolean; utilisateur?: string } | null;
    return g?.pret === true && g.utilisateur === uid;
  } catch {
    return false;
  }
}

function noterCarteGardee(message: string) {
  try {
    const m = JSON.parse(message) as { type?: string; pret?: unknown; utilisateur?: unknown; marche?: unknown };
    if (m.type !== 'carte-hors-ligne' || typeof m.utilisateur !== 'string') return;
    void AsyncStorage.setItem(CLE_CARTE_GARDEE, JSON.stringify({ pret: m.pret === true, utilisateur: m.utilisateur, marche: m.marche })).catch(() => undefined);
  } catch {
    /* message illisible */
  }
}

const adresse = (session: Session, chemin: string) =>
  `${PAGE_SESSION}#access_token=${encodeURIComponent(session.access_token)}` +
  `&refresh_token=${encodeURIComponent(session.refresh_token)}&suite=${encodeURIComponent(avecLangue(chemin))}`;
const estPanneau = (url: string) => url === ORIGINE || url.startsWith(`${ORIGINE}/`);
const estPageSession = (url: string) => url.split(/[#?]/)[0].replace(/\/$/, '') === PAGE_SESSION;

/**
 * Le panneau répond-il ? Sans jeton : un simple GET de la page de session. Pas de HEAD : sur la tablette, sa réponse
 * n'arrive qu'après une dizaine de secondes (constaté le 2026-10-07, aussi sur l'ancienne adresse), au-delà du délai.
 */
export async function panneauJoignable() {
  const controleur = new AbortController();
  const delai = setTimeout(() => controleur.abort(), DELAI_SONDE_MS);
  try {
    await fetch(PAGE_SESSION, { cache: 'no-store', signal: controleur.signal });
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
    <Text style={s.discret}>{t('Chargement de la carte…')}</Text>
  </View>
);

/** Carte du réseau et balayage par tronçon : le panneau web, ouvert dans une WebView avec la session de la tablette. */
export function Balayage({ retour }: { retour: () => void }) {
  const marcheId = useSession().marche?.id;
  return (
    <CartePanneau
      titre={t('Balayage')} sousTitre={t('Carte du réseau')} retour={retour}
      chemin={`/carte?mode=balayage${marcheId ? `&marche=${marcheId}` : ''}`}
    />
  );
}

/**
 * Page cartographique du panneau (Balayage, Carte) dans une WebView, ouverte avec la session de la tablette ;
 * `chemin` : page du panneau, sans la langue (ajoutée ici) ; `surMessage` : messages propres à l'écran.
 */
export function CartePanneau({ titre, sousTitre, chemin, retour, surMessage }: {
  titre: string; sousTitre: string; chemin: string; retour: () => void; surMessage?: (m: Record<string, unknown>) => void;
}) {
  const web = useRef<WebView>(null);
  const bas = useBas();
  const { langue } = useLangue();
  const uid = useSession().session?.user.id;
  // Adresse lue au moment de (re)charger la page : le chemin d'ouverture, la langue en cours.
  const cheminCourant = useRef(chemin);
  cheminCourant.current = chemin;
  const [uri, setUri] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [cle, setCle] = useState(0);
  const [peutReculer, setPeutReculer] = useState(false);
  const uriCourante = useRef<string | null>(null);
  // Vrai tant que la page /session demandée n'a pas redirigé vers la carte : la revoir ensuite, c'est un
  // retour arrière au-delà de la carte, donc la fin de l'écran.
  const attenteSession = useRef(true);

  const appliquer = useCallback((session: Session) => {
    const nouvelle = adresse(session, cheminCourant.current);
    if (nouvelle === uriCourante.current) return;
    uriCourante.current = nouvelle;
    attenteSession.current = true;
    setUri(nouvelle);
  }, []);

  // Sans réseau : la carte gardée sur la tablette, ouverte directement (session déjà gardée par le panneau).
  const ouvrirSansReseau = useCallback(async () => {
    if (!(await carteGardeePour(uid))) return false;
    const directe = `${PANNEAU}${avecLangue(cheminCourant.current)}`;
    uriCourante.current = directe;
    attenteSession.current = false;
    setUri(directe);
    setCle((c) => c + 1);
    return true;
  }, [uid]);

  const charger = useCallback(async () => {
    setMessage('');
    if (!(await panneauJoignable())) {
      if (!(await ouvrirSansReseau())) setMessage(PAS_ENCORE_GARDEE);
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    if (!data.session) {
      // Jeton expiré que le réseau n'a pas encore permis de renouveler : la session n'est pas perdue.
      if (isAuthRetryableFetchError(error) && (await ouvrirSansReseau())) return;
      setMessage(isAuthRetryableFetchError(error) ? HORS_LIGNE : 'Session expirée : reconnectez-vous.');
      return;
    }
    appliquer(data.session);
    setCle((c) => c + 1);
  }, [appliquer, ouvrirSansReseau]);

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

  // Langue changée pendant que la carte est ouverte : envoyée à la page, sans la recharger.
  const langueEnvoyee = useRef(langue);
  useEffect(() => {
    if (langueEnvoyee.current === langue) return;
    langueEnvoyee.current = langue;
    web.current?.injectJavaScript(scriptLangue(langue));
  }, [langue]);

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
    <View style={[s.ecran, { paddingBottom: bas }]}>
      <BarreApp titre={titre} sousTitre={sousTitre} retour={retour} />
      {message ? (
        <View style={s.defile}>
          <Carte>
            <Message ton="erreur" icone={message === HORS_LIGNE || message === PAS_ENCORE_GARDEE ? 'wifi-off' : undefined}>{tx(message)}</Message>
            <Bouton titre={t('Réessayer')} icone="refresh-cw" primaire grand onPress={() => void charger()} />
            <Bouton titre={t('Retour à la liste')} icone="arrow-left" onPress={retour} />
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
            if (e.nativeEvent.statusCode >= 500) {
              setMessage(t('Le panneau web ne répond pas (erreur {code}). Réessayez dans un instant.', { code: e.nativeEvent.statusCode }));
            }
          }}
          onRenderProcessGone={() => setMessage("La carte s'est arrêtée. Réessayez.")}
          // Tronçon coché ou balayage enregistré sur la carte : une pause du suivi GPS en cours prend fin.
          // Seule une page du panneau est écoutée (l'adresse de la page qui envoie le message est vérifiée).
          onMessage={(e) => {
            if (!estPanneau(e.nativeEvent.url)) return;
            if (/"activite-balayage"/.test(e.nativeEvent.data)) void reprendreSuivi('balayage').catch(() => undefined);
            if (/"carte-hors-ligne"/.test(e.nativeEvent.data)) noterCarteGardee(e.nativeEvent.data);
            if (surMessage) {
              try {
                surMessage(JSON.parse(e.nativeEvent.data) as Record<string, unknown>);
              } catch {
                /* message illisible */
              }
            }
          }}
        />
      )}
    </View>
  );
}

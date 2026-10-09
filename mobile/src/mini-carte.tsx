// Mini-carte de localisation de la Nouvelle fuite (F4) : page `/mini-carte` du panneau web (S10, contrat
// docs/lots/chantier-v2-mini-carte.md), ouverte en plein écran dans une WebView avec la session de la tablette, comme le
// Balayage (jetons dans le fragment « # », jamais journalisés). Épingle déplaçable, conduite la plus proche en
// surbrillance ; « Valider la position » renvoie la position et les suggestions, qui restent à accepter d'un toucher.
// Sans réseau, la carte ne s'ouvre pas : la fuite se saisit avec la seule position GPS.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { panneauJoignable, PANNEAU } from './balayage';
import { t, useLangue } from './langue';
import { useSession } from './session';
import { jetonARenouveler } from './session-donnees';
import type { Suggestions } from './types';
import { BarreApp, Bouton, Carte, COULEURS, Message, s, useBas } from './ui';

const ORIGINE = PANNEAU.match(/^https?:\/\/[^/]+/)?.[0] ?? PANNEAU;
// Le panneau renouvelle sa copie de la session ~1,5 min avant l'échéance, avec le même jeton de rafraîchissement que la
// tablette (rotation Supabase : un jeton réutilisé déconnecte les deux). La carte ne s'ouvre qu'avec un jeton encore
// valable longtemps ; la tablette renouvelle le jeton la première (comme le Balayage).
const MARGE_JETON_MS = 10 * 60 * 1000;

/** Position validée sur la carte (message `mini-carte:valider`, version 1). */
export interface PositionCarte {
  latitude: number; longitude: number; precision_m: number | null; deplacee: boolean; distance_gps_m: number | null;
  suggestions: Suggestions | null;
}

/** La carte peut-elle s'ouvrir (session valable, pas de jeton à renouveler) ? */
export function useCarteDisponible(): boolean {
  const { session, aRenouveler } = useSession();
  return !!session && !aRenouveler && !jetonARenouveler() && (session.expires_at ?? 0) * 1000 - Date.now() > MARGE_JETON_MS;
}

export function MiniCarte({ visible, marcheId, gps, fermer, valider }: {
  visible: boolean; marcheId: string; gps: { lat: number; lon: number; precision: number } | null;
  fermer: () => void; valider: (p: PositionCarte) => void;
}) {
  const { session } = useSession();
  const { langue } = useLangue();
  const bas = useBas();
  const [etat, setEtat] = useState<'sonde' | 'chargement' | 'prete' | 'hors_ligne' | 'erreur'>('sonde');
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    if (!visible) return;
    let annule = false;
    setEtat('sonde');
    panneauJoignable().then((ok) => !annule && setEtat(ok ? 'chargement' : 'hors_ligne'));
    return () => {
      annule = true;
    };
  }, [visible, essai]);

  if (!visible || !session) return null;
  const suite = `/mini-carte?marche=${marcheId}${gps ? `&lat=${gps.lat.toFixed(6)}&lng=${gps.lon.toFixed(6)}&precision=${Math.round(gps.precision)}` : ''}`
    + `&langue=${langue}`;
  const uri = `${PANNEAU}/session#access_token=${encodeURIComponent(session.access_token)}`
    + `&refresh_token=${encodeURIComponent(session.refresh_token)}&suite=${encodeURIComponent(suite)}`;

  const recevoir = (donnees: string) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(donnees);
    } catch {
      return;
    }
    switch (m.type) {
      case 'mini-carte:prete':
        setEtat('prete');
        break;
      case 'mini-carte:valider':
        if (typeof m.latitude === 'number' && typeof m.longitude === 'number') {
          valider({
            latitude: m.latitude, longitude: m.longitude, precision_m: (m.precision_m as number | null) ?? null,
            deplacee: m.deplacee === true, distance_gps_m: (m.distance_gps_m as number | null) ?? null,
            suggestions: (m.suggestions as Suggestions | null) ?? null,
          });
        }
        break;
      case 'mini-carte:annuler':
        fermer();
        break;
      case 'mini-carte:erreur':
        setEtat('erreur');
        break;
      default:
    }
  };

  const probleme = etat === 'hors_ligne' || etat === 'erreur';
  return (
    <Modal visible animationType="slide" statusBarTranslucent onRequestClose={fermer}>
      <View style={[s.ecran, { paddingBottom: bas }]}>
        <BarreApp titre={t('Position sur la carte')} sousTitre={t('Déplacez l\'épingle si besoin, puis « Valider la position ».')} retour={fermer} />
        {probleme ? (
          <View style={s.defile}>
            <Carte>
              <Message ton="erreur" icone={etat === 'hors_ligne' ? 'wifi-off' : undefined}>
                {etat === 'hors_ligne' ? t('La carte a besoin de la connexion : la position GPS suffit pour enregistrer la fuite.') : t('La carte ne peut pas s\'ouvrir. Réessayez.')}
              </Message>
              <Bouton titre={t('Réessayer')} icone="refresh-cw" primaire grand onPress={() => setEssai((n) => n + 1)} />
              <Bouton titre={t('Retour au formulaire')} icone="arrow-left" onPress={fermer} />
            </Carte>
          </View>
        ) : etat === 'sonde' ? (
          <View style={m.attente}><ActivityIndicator size="large" color={COULEURS.principal} /></View>
        ) : (
          <View style={{ flex: 1 }}>
            <WebView
              source={{ uri }}
              style={{ flex: 1, backgroundColor: COULEURS.sourdine }}
              javaScriptEnabled
              domStorageEnabled
              setSupportMultipleWindows={false}
              applicationNameForUserAgent="SuiviFuitesAPK"
              onShouldStartLoadWithRequest={(d) => d.url === ORIGINE || d.url.startsWith(`${ORIGINE}/`) || d.url.startsWith('about:')}
              onMessage={(e) => recevoir(e.nativeEvent.data)}
              onError={() => setEtat('hors_ligne')}
              onHttpError={(e) => e.nativeEvent.statusCode >= 500 && setEtat('erreur')}
              onRenderProcessGone={() => setEtat('erreur')}
            />
            {etat === 'chargement' && (
              <View style={[StyleSheet.absoluteFill, m.attente]}>
                <ActivityIndicator size="large" color={COULEURS.principal} />
                <Text style={s.discret}>{t('Chargement de la carte…')}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}

const m = StyleSheet.create({
  attente: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: COULEURS.fond },
});

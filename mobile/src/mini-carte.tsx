// Mini-carte de localisation de la Nouvelle fuite (F4) : page du panneau web servie à l'APK (S10), ouverte dans une
// WebView avec la session de la tablette comme le Balayage (jetons dans le fragment « # », jamais journalisés).
// Lecture seule : zoom rapproché, épingle, précision, tronçon le plus proche en surbrillance. Sans réseau ou si la page
// ne répond pas, rien n'est affiché : la saisie se fait sans carte.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { t } from './langue';
import { useSession } from './session';
import { jetonARenouveler } from './session-donnees';
import { COULEURS, s } from './ui';

const PANNEAU = (process.env.EXPO_PUBLIC_WEB_URL || 'https://fuites.stepag.ma').replace(/\/+$/, '');
const ORIGINE = PANNEAU.match(/^https?:\/\/[^/]+/)?.[0] ?? PANNEAU;
// Le panneau renouvelle sa copie de la session ~1,5 min avant l'échéance, avec le même jeton de rafraîchissement que la
// tablette (rotation Supabase : un jeton réutilisé déconnecte les deux). La carte ne s'ouvre qu'avec un jeton encore
// valable longtemps : la saisie d'une fuite ne dure pas 10 min, la tablette renouvelle le jeton la première.
const MARGE_JETON_MS = 10 * 60 * 1000;

export function MiniCarte({ latitude, longitude, precision, tronconId }: {
  latitude: number; longitude: number; precision?: number | null; tronconId?: string | null;
}) {
  const { session, aRenouveler } = useSession();
  const [etat, setEtat] = useState<'chargement' | 'prete' | 'absente'>('chargement');
  const suite = `/mini-carte?lat=${latitude.toFixed(6)}&lon=${longitude.toFixed(6)}`
    + `${precision ? `&precision=${Math.round(precision)}` : ''}${tronconId ? `&troncon=${tronconId}` : ''}`;
  useEffect(() => setEtat('chargement'), [suite]);
  if (!session || aRenouveler || jetonARenouveler() || etat === 'absente') return null;
  if ((session.expires_at ?? 0) * 1000 - Date.now() < MARGE_JETON_MS) return null;
  const uri = `${PANNEAU}/session#access_token=${encodeURIComponent(session.access_token)}`
    + `&refresh_token=${encodeURIComponent(session.refresh_token)}&suite=${encodeURIComponent(suite)}`;
  return (
    <View style={m.cadre}>
      <WebView
        source={{ uri }}
        style={{ flex: 1, backgroundColor: COULEURS.sourdine }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        applicationNameForUserAgent="SuiviFuitesAPK"
        onShouldStartLoadWithRequest={(d) => d.url === ORIGINE || d.url.startsWith(`${ORIGINE}/`) || d.url.startsWith('about:')}
        onLoadEnd={() => setEtat((e) => (e === 'chargement' ? 'prete' : e))}
        onError={() => setEtat('absente')}
        onHttpError={(e) => e.nativeEvent.statusCode >= 400 && setEtat('absente')}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data) as { type?: string };
            if (msg.type === 'erreur') setEtat('absente');
            if (msg.type === 'pret') setEtat('prete');
          } catch {
            // message d'une autre page : ignoré
          }
        }}
        onRenderProcessGone={() => setEtat('absente')}
      />
      {etat === 'chargement' && (
        <View style={[StyleSheet.absoluteFill, m.attente]}>
          <ActivityIndicator color={COULEURS.principal} />
          <Text style={s.petit}>{t('Chargement de la carte…')}</Text>
        </View>
      )}
    </View>
  );
}

const m = StyleSheet.create({
  cadre: { height: 240, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: COULEURS.bord },
  attente: { alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COULEURS.sourdine },
});

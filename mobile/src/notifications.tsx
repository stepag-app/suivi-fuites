// Notifications de la tablette (N2) : push Android (expo-notifications, Firebase Cloud Messaging), pastille dans
// l'appli, écran des notifications (comme la cloche du panneau, N1).
// - Jeton FCM enregistré à la connexion (enregistrer_appareil_push, S1), retiré à « Quitter » ; un appareil repris par
//   un autre agent change de compte. APK compilée sans Firebase (secret GOOGLE_SERVICES_JSON absent) : aucun jeton,
//   la pastille et l'écran fonctionnent quand même.
// - Envoi : fonction serveur envoyer-push, déclenchée par la base à chaque notification ; texte dans la langue de
//   l'agent (profils.langue, tenue à jour ici).
// - Toucher une notification du rideau : fiche de la fuite, notification marquée lue. Ouvrir l'écran des
//   notifications : tout est marqué lu et le rideau est vidé.
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { dateHeure } from './fiche';
import { useLangue } from './langue';
import { texteNotification, type NotificationLigne } from './regles';
import { useSession } from './session';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';
import { BarreApp, COULEURS, Message, s, useBas, Vide } from './ui';

const enLigne = (aRenouveler: boolean) => !aRenouveler && !jetonARenouveler();

/** Nombre de notifications non lues (pastille), suivi au premier plan et à chaque notification reçue. */
export function useNonLues(): [number, () => void] {
  const { session, aRenouveler } = useSession();
  const [n, setN] = useState(0);
  const lire = useCallback(() => {
    if (!session || !enLigne(aRenouveler)) return;
    supabase.rpc('compter_notifications_non_lues').then(({ data, error }) => {
      if (!error && typeof data === 'number') setN(data);
    }, () => undefined);
  }, [session, aRenouveler]);
  useEffect(() => {
    lire();
    const recue = Notifications.addNotificationReceivedListener(() => lire());
    const premierPlan = AppState.addEventListener('change', (e) => e === 'active' && lire());
    const minuteur = setInterval(lire, 5 * 60 * 1000);
    return () => {
      recue.remove();
      premierPlan.remove();
      clearInterval(minuteur);
    };
  }, [lire]);
  return [n, lire];
}

/**
 * Toucher une notification du rideau (appli ouverte, en arrière-plan ou fermée) : `ouvrir` reçoit la fuite ; la
 * notification est marquée lue et retirée du rideau.
 */
export function useToucherNotification(ouvrir: (fuiteId: string, marcheId?: string) => void) {
  useEffect(() => {
    const traiter = (r: Notifications.NotificationResponse | null) => {
      if (!r) return;
      const d = r.notification.request.content.data as Record<string, unknown> | undefined;
      const id = Number(d?.notification_id);
      if (Number.isInteger(id)) void supabase.rpc('marquer_notifications_lues', { p_ids: [id] }).then(() => undefined, () => undefined);
      void Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => undefined);
      Notifications.clearLastNotificationResponse();
      if (typeof d?.fuite_id === 'string') ouvrir(d.fuite_id, typeof d.marche_id === 'string' ? d.marche_id : undefined);
    };
    traiter(Notifications.getLastNotificationResponse());
    const abonnement = Notifications.addNotificationResponseReceivedListener(traiter);
    return () => abonnement.remove();
  }, [ouvrir]);
}

/** Écran des notifications : les 30 dernières ; à l'ouverture, tout est marqué lu et le rideau est vidé. */
export function EcranNotifications({ retour, ouvrir, lues }: { retour: () => void; ouvrir: (fuiteId: string) => void; lues: () => void }) {
  const { aRenouveler } = useSession();
  const { t } = useLangue();
  const bas = useBas();
  const [liste, setListe] = useState<NotificationLigne[] | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);

  useEffect(() => {
    if (!enLigne(aRenouveler)) {
      setHorsLigne(true);
      setListe([]);
      return;
    }
    let annule = false;
    (async () => {
      const { data, error } = await supabase.from('notifications')
        .select('id, evenement, titre, corps, donnees, fuite_id, cree_le, lue_le').order('cree_le', { ascending: false }).limit(30);
      if (annule) return;
      if (error) {
        setHorsLigne(true);
        setListe([]);
        return;
      }
      setListe((data ?? []) as NotificationLigne[]);
      await supabase.rpc('marquer_notifications_lues');
      await Notifications.dismissAllNotificationsAsync().catch(() => undefined);
      await Notifications.setBadgeCountAsync(0).catch(() => undefined);
      lues();
    })().catch(() => setHorsLigne(true));
    return () => {
      annule = true;
    };
  }, [aRenouveler, lues]);

  return (
    <View style={s.ecran}>
      <BarreApp titre={t('Notifications')} retour={retour} />
      <View style={[s.contenu, { flex: 1, paddingBottom: 0 }]}>
        {horsLigne && <Message ton="attention" icone="wifi-off">{t('Les notifications ont besoin de la connexion.')}</Message>}
        <FlatList
          data={liste ?? []}
          keyExtractor={(n) => String(n.id)}
          contentContainerStyle={{ paddingBottom: 24 + bas, width: '100%', maxWidth: 920, alignSelf: 'center' }}
          ItemSeparatorComponent={() => <View style={no.separation} />}
          ListEmptyComponent={liste && !horsLigne ? <Vide texte={t('Aucune notification.')} /> : null}
          renderItem={({ item }) => {
            const texte = texteNotification(item);
            return (
              <Pressable
                onPress={() => item.fuite_id && ouvrir(item.fuite_id)}
                style={({ pressed }) => [no.ligne, pressed && s.appuye]}
                accessibilityRole="button"
              >
                <View style={[no.point, { backgroundColor: item.lue_le ? 'transparent' : COULEURS.marque }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[item.lue_le ? s.texte : s.texteFort, item.lue_le && { color: COULEURS.discret }]}>{texte.titre}</Text>
                  {!!texte.corps && <Text style={s.discret}>{texte.corps}</Text>}
                  <Text style={s.petit}>{dateHeure(item.cree_le)}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
    </View>
  );
}

const no = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 8, minHeight: 64 },
  point: { width: 10, height: 10, borderRadius: 5, marginTop: 7 },
  separation: { height: 1, backgroundColor: COULEURS.bord },
});

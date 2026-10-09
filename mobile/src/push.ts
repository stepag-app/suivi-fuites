// Notifications push Android (N2) : jeton Firebase Cloud Messaging de la tablette, enregistré pour le compte connecté
// (enregistrer_appareil_push, S1) et retiré à « Quitter » ; langue de l'agent pour le texte des push (envoyer-push).
// APK compilée sans Firebase (secret GOOGLE_SERVICES_JSON absent) : aucun jeton, le reste de l'appli ne change pas.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Notifications from 'expo-notifications';
import type { Langue } from './langue';
import { supabase } from './supabase';

const CANAL = 'notifications';
const CLE_JETON = 'suivi-fuites:jeton-push';
const LANGUE_PROFIL: Record<Langue, string> = { fr: 'fr', hybride: 'fr_ar', ar: 'ar' };

// Notification reçue appli ouverte : affichée quand même dans le rideau (bannière), pastille à jour.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

/** Enregistre le jeton push de la tablette pour le compte connecté ; sans Firebase ou sans autorisation : rien. */
export async function enregistrerPush(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Notifications', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250],
    });
    const droit = await Notifications.getPermissionsAsync();
    const accorde = droit.granted || (droit.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
    if (!accorde) return;
    const { data: jeton } = await Notifications.getDevicePushTokenAsync();
    if (typeof jeton !== 'string' || !jeton) return;
    const { error } = await supabase.rpc('enregistrer_appareil_push', {
      p_jeton: jeton, p_version: Application.nativeApplicationVersion ?? null,
    });
    if (!error) await AsyncStorage.setItem(CLE_JETON, jeton);
  } catch (e) {
    // Firebase absent de cette APK (« Default FirebaseApp is not initialized ») : pas de push, rien d'autre ne change.
    console.warn('Notifications push indisponibles :', (e as Error).message ?? e);
  }
}

/** « Quitter » : le jeton n'appartient plus à ce compte (avec réseau ; sinon il passera au prochain agent connecté). */
export async function retirerPush(): Promise<void> {
  try {
    const jeton = await AsyncStorage.getItem(CLE_JETON);
    if (!jeton) return;
    await supabase.rpc('retirer_appareil_push', { p_jeton: jeton });
    await AsyncStorage.removeItem(CLE_JETON);
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // hors ligne : sans conséquence
  }
}

/** Langue de l'agent, pour le texte des notifications push (fonction envoyer-push). */
export async function retenirLangue(uid: string, langue: Langue) {
  await supabase.from('profils').update({ langue: LANGUE_PROFIL[langue] }).eq('id', uid).then(() => undefined, () => undefined);
}

// Suivi GPS (X6) : démarrage automatique tant que la session est ouverte (useSuiviGps) et écran d'activation clair
// (autorisations, activation, batterie Samsung, points en attente).
import * as Application from 'expo-application';
import * as IntentLauncher from 'expo-intent-launcher';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, Text, View } from 'react-native';
import { dateHeure } from './fiche';
import { useLangue } from './langue';
import {
  arreterSuivi, assurerSuivi, demanderAutorisations, envoyerPoints, etatSuivi, voulerSuivi, type EtatSuivi,
} from './suivi-gps';
import { BarreApp, Bouton, Carte, Message, s, useBas } from './ui';

const PAQUET = Application.applicationId ?? 'ma.stepag.suivifuites';

/**
 * Démarre le suivi pour le compte et le marché choisis (si les autorisations sont accordées et que l'agent ne l'a pas
 * désactivé), l'arrête quand la session se ferme, envoie les points au premier plan. Retourne l'état et de quoi le relire.
 */
export function useSuiviGps(uid: string | undefined, marcheId: string | undefined): [EtatSuivi | null, () => void] {
  const [etat, setEtat] = useState<EtatSuivi | null>(null);
  const avait = useRef(false);
  const relire = useCallback(() => {
    void etatSuivi().then(setEtat, () => undefined);
  }, []);

  useEffect(() => {
    if (!uid || !marcheId) {
      // Session fermée (et non simple chargement de départ) : la tâche s'arrête.
      if (!uid && avait.current) {
        avait.current = false;
        void arreterSuivi().then(relire);
      }
      return;
    }
    avait.current = true;
    const lancer = () => void assurerSuivi(uid, marcheId).then(relire, relire);
    lancer();
    const abonnement = AppState.addEventListener('change', (e) => {
      if (e !== 'active') return;
      lancer();
      void envoyerPoints(true).then(relire, relire);
    });
    const minuteur = setInterval(() => void envoyerPoints().then(relire, relire), 60000);
    return () => {
      abonnement.remove();
      clearInterval(minuteur);
    };
  }, [uid, marcheId, relire]);

  return [etat, relire];
}

export function SuiviGpsEcran({ retour, etat, relire, uid, marcheId }: {
  retour: () => void; etat: EtatSuivi | null; relire: () => void; uid: string; marcheId: string;
}) {
  const { t } = useLangue();
  const bas = useBas();
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    relire();
    const minuteur = setInterval(relire, 5000);
    return () => clearInterval(minuteur);
  }, [relire]);

  async function activer() {
    setOccupe(true);
    await voulerSuivi(true);
    await demanderAutorisations();
    await assurerSuivi(uid, marcheId);
    setOccupe(false);
    relire();
  }
  async function desactiver() {
    setOccupe(true);
    await voulerSuivi(false);
    await arreterSuivi();
    setOccupe(false);
    relire();
  }
  const reglages = () => void Linking.openSettings().catch(() => undefined);
  const batterie = () => {
    IntentLauncher.startActivityAsync('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS')
      .catch(() => IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: `package:${PAQUET}` }))
      .catch(() => undefined);
  };

  const complet = !!etat && etat.autorisations.premierPlan && etat.autorisations.arrierePlan;
  const incomplet = !!etat && etat.autorisations.premierPlan && !etat.autorisations.arrierePlan;

  return (
    <View style={s.ecran}>
      <BarreApp titre={t('Suivi GPS')} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]}>
        {!etat ? null : etat.actif ? (
          <Message ton="info" icone="locate-fixed">{t('Le suivi de position est actif.')}</Message>
        ) : !etat.voulu ? (
          <Message ton="attention">{t('Le suivi de position est désactivé sur cette tablette.')}</Message>
        ) : (
          <Message ton="attention">{t("Le suivi de position n'est pas encore actif.")}</Message>
        )}
        <Text style={s.texte}>
          {t("Tant que votre session est ouverte, la tablette enregistre votre parcours (un point tous les 15 m environ) et l'envoie à votre responsable. Une notification reste affichée pendant que le suivi tourne ; elle disparaît avec « Quitter ».")}
        </Text>
        <Text style={s.discret}>
          {t("Seuls votre responsable et l'administrateur voient votre tracé. Il est conservé jusqu'à la fin du marché.")}
        </Text>

        {etat && !etat.autorisations.premierPlan && (
          <Message ton="attention">{t("L'autorisation de position est refusée. Ouvrez les réglages de la tablette pour l'accorder.")}</Message>
        )}
        {incomplet && (
          <Message ton="attention">
            {t('Choisissez « Toujours autoriser » pour la position : sans cela, le suivi s\'arrête quand l\'écran s\'éteint.')}
          </Message>
        )}
        {!!etat && (!etat.actif || !complet) && (
          <Bouton titre={t('Activer le suivi')} icone="locate-fixed" primaire grand onPress={activer} occupe={occupe} />
        )}
        {etat && !complet && <Bouton titre={t('Ouvrir les réglages de la tablette')} onPress={reglages} />}
        {etat?.actif && <Bouton titre={t('Désactiver le suivi')} danger onPress={desactiver} occupe={occupe} />}

        <Carte>
          <Text style={s.texteFort}>{t('Batterie (Samsung)')}</Text>
          <Text style={s.texte}>
            {t("Pour que le suivi ne soit pas endormi par la tablette, excluez l'application de l'optimisation de la batterie : Réglages > Batterie > Limites d'utilisation en arrière-plan > Applications jamais en veille > ajoutez « Suivi des fuites ».")}
          </Text>
          <Bouton titre={t('Ouvrir les réglages de la batterie')} onPress={batterie} style={{ alignSelf: 'flex-start' }} />
        </Carte>

        {etat && (
          <Carte>
            <Text style={s.texteFort}>{t('État')}</Text>
            <Text style={s.texte}>{t("Points en attente d'envoi : {n}", { n: etat.enAttente })}</Text>
            <Text style={s.discret}>
              {etat.dernierEnvoi ? t('Dernier envoi : {date}', { date: dateHeure(new Date(etat.dernierEnvoi).toISOString()) }) : t("Aucun envoi pour le moment.")}
            </Text>
            <Text style={s.discret}>
              {etat.dernierePosition ? t('Dernière position enregistrée : {date}', { date: dateHeure(new Date(etat.dernierePosition).toISOString()) }) : t("Aucune position enregistrée pour le moment.")}
            </Text>
          </Carte>
        )}
        <Bouton titre={t('Retour')} icone="arrow-left" onPress={retour} />
      </ScrollView>
    </View>
  );
}

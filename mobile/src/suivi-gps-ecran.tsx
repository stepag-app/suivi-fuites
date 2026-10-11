// Suivi GPS (X6) : démarrage automatique tant que la session est ouverte, pendant les heures de travail du marché
// (useSuiviGps). Écran réduit (demande d'Issam du 2026-10-11 : l'agent ne fait que son travail) : état, activation si
// besoin, points en attente. La pause et les explications ont été retirées ; l'exclusion de l'optimisation de la batterie
// fait partie de la préparation de la tablette par l'administrateur (lot TP).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, Text, View } from 'react-native';
import { dateHeure } from './fiche';
import { enumerer, t, useLangue } from './langue';
import { assurerSuivi, demanderAutorisations, envoyerPoints, etatSuivi, arreterSuivi, type EtatSuivi } from './suivi-gps';
import { heureLocale, hhmm, reglagesSuivi, type ColonnesSuivi, type ReglagesSuivi } from './suivi-gps-regles';
import type { Cle } from './traductions';
import { BarreApp, Bouton, Carte, Message, s, useBas } from './ui';

const JOURS: Cle[] = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

export const heuresDeTravail = (r: ReglagesSuivi) => t('{debut} à {fin}', { debut: hhmm(r.debut), fin: hhmm(r.fin) });

/** « du lundi au samedi », « tous les jours », ou la liste des jours. */
export function joursDeTravail(r: ReglagesSuivi): string {
  const j = [...r.jours].sort();
  if (j.length === 7) return t('tous les jours');
  const suite = j.every((x, i) => i === 0 || x === j[i - 1] + 1);
  if (suite && j.length >= 3) return t('du {premier} au {dernier}', { premier: t(JOURS[j[0] - 1]), dernier: t(JOURS[j[j.length - 1] - 1]) });
  return enumerer(j.map((x) => t(JOURS[x - 1])));
}

export const heureDe = (ms: number) => hhmm(heureLocale(ms).minutes);

/**
 * Démarre le suivi pour le compte et le marché choisis (heures de travail, autorisations accordées), l'arrête quand la
 * session se ferme, envoie les points au premier plan. Retourne l'état et de quoi le relire.
 */
export function useSuiviGps(uid: string | undefined, marche: (ColonnesSuivi & { id: string }) | null | undefined): [EtatSuivi | null, () => void] {
  const [etat, setEtat] = useState<EtatSuivi | null>(null);
  const avait = useRef(false);
  const marcheId = marche?.id;
  const cleReglages = JSON.stringify(reglagesSuivi(marche));
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
    const r = JSON.parse(cleReglages) as ReglagesSuivi;
    const lancer = () => void assurerSuivi(uid, marcheId, r).then(relire, relire);
    lancer();
    const abonnement = AppState.addEventListener('change', (e) => {
      if (e !== 'active') return;
      lancer();
      void envoyerPoints(true).then(relire, relire);
    });
    // Appli ouverte : début et fin des heures, fin de pause, envois.
    const minuteur = setInterval(() => {
      lancer();
      void envoyerPoints().then(relire, relire);
    }, 60000);
    return () => {
      abonnement.remove();
      clearInterval(minuteur);
    };
  }, [uid, marcheId, cleReglages, relire]);

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
    await demanderAutorisations();
    await assurerSuivi(uid, marcheId);
    setOccupe(false);
    relire();
  }
  const reglages = () => void Linking.openSettings().catch(() => undefined);
  const incomplet = !!etat && etat.autorisations.premierPlan && !etat.autorisations.arrierePlan;

  return (
    <View style={s.ecran}>
      <BarreApp titre={t('Suivi GPS')} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]}>
        {!etat ? null : etat.mode === 'actif' || etat.mode === 'pause' ? (
          <Message ton="info" icone="locate-fixed">{t('Le suivi de position est actif.')}</Message>
        ) : etat.mode === 'hors_heures' ? (
          <Message ton="info" icone="clock">{t("Hors des heures de travail : aucune position n'est enregistrée.")}</Message>
        ) : (
          <Message ton="attention">{t("Le suivi de position n'est pas encore actif.")}</Message>
        )}
        {etat && !etat.autorisations.premierPlan && (
          <Message ton="attention">{t("L'autorisation de position est refusée. Ouvrez les réglages de la tablette pour l'accorder.")}</Message>
        )}
        {incomplet && (
          <Message ton="attention">
            {t('Choisissez « Toujours autoriser » pour la position : sans cela, le suivi s\'arrête quand l\'écran s\'éteint.')}
          </Message>
        )}
        {etat && (etat.mode === 'autorisation' || etat.mode === 'arrete') && (
          <Bouton titre={t('Activer le suivi')} icone="locate-fixed" primaire grand onPress={activer} occupe={occupe} />
        )}
        {etat?.mode === 'autorisation' && <Bouton titre={t('Ouvrir les réglages de la tablette')} onPress={reglages} />}
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

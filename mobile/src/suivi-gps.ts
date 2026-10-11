// Suivi GPS en arrière-plan (X6, décisions d'Issam Q14 ; compromis présenté aux agents le 2026-10-10) : tâche de fond
// d'expo-location (service de premier plan Android, notification permanente), points gardés sur la tablette puis
// envoyés par lots à la base (ajouter_points_trace, un tracé par agent et par jour, visible du seul responsable et de
// l'administrateur).
// - Motif : le tracé prouve à la SRM le linéaire réellement balayé, et sert à la sécurité de l'agent seul sur la voie.
// - Heures de travail du marché seulement (08:00 à 18:00, du lundi au samedi, par défaut ; heure de la tablette) : à la
//   fin des heures, la tâche s'arrête d'elle-même (la notification disparaît) ; Android n'autorise à la relancer que
//   l'appli ouverte : elle repart à l'ouverture de l'appli, et un rappel le propose au début des heures.
// - Pause (à la place de « Désactiver ») : 60 min au plus d'affilée, 90 min par jour (réglages du marché) ; le GPS passe
//   au repos et rien n'est gardé ; reprise automatique à la fin, ou dès que l'agent signale une fuite ou coche un tronçon.
// - Un point tous les 15 m, ou toutes les 30 s si l'agent se déplace (suivi-gps-regles.ts).
// - La tablette signale son état à la base (actif, pause, hors heures, autorisation refusée, « Quitter ») toutes les
//   10 min au plus : le responsable est prévenu d'un suivi coupé pendant les heures de travail.
// - La tâche est définie ici, à la racine du module : index.ts l'importe avant le composant racine, donc aussi quand
//   Android réveille l'appli sans écran pour livrer une position.
// - Hors ligne : la file reste sur la tablette (jusqu'à 20 000 points, 7 jours) et repart par paquets de 500, sans doublon
//   possible (la base ignore un point déjà reçu).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { t } from './langue';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';
import {
  ajouterPoint, borner, dansHeures, envoyerFile, FILE_VIDE, fileAvecPause, finPrevuePause, heureLocale, hhmm, nbPoints,
  pauseEnCours, pauseRestanteMs, pausesRecentes, pendantUnePause, pointRetenu, prochainDebut, REGLAGES_DEFAUT,
  reglagesSuivi, retirerAcquits, retirerPauses,
  type ColonnesSuivi, type EtatFile, type Mesure, type MotifFin, type PauseEnvoi, type PauseLocale, type Point, type ReglagesSuivi,
  type Reponse,
} from './suivi-gps-regles';

export const TACHE_GPS = 'suivi-fuites-gps';
const CLE_FILE = 'suivi-fuites:gps-file';
const CLE_CONTEXTE = 'suivi-fuites:gps-contexte';
const CLE_PAUSES = 'suivi-fuites:gps-pauses';
const CLE_BILAN = 'suivi-fuites:gps-bilan';
/** « Désactiver le suivi » d'avant le compromis : remplacé par la pause, la préférence gardée est effacée. */
const CLE_ANCIENNE_PREFERENCE = 'suivi-fuites:gps-actif';
const RAPPEL = 'suivi-gps-reprise';
const CANAL_RAPPEL = 'suivi-gps';
/** Au plus un envoi toutes les 2 minutes en arrière-plan (la radio 4G ne se réveille pas pour 3 points). */
const ENVOI_MIN_MS = 2 * 60 * 1000;
/** État redit à la base au plus toutes les 10 min (sans changement) : la base alerte après 30 min sans signe. */
const SIGNAL_MS = 10 * 60 * 1000;
const DELAI_SESSION_MS = 20000;

interface Contexte { u: string; m: string; r?: ReglagesSuivi }
interface Pauses { u: string; m: string; liste: PauseLocale[] }
interface Bilan { dernierEnvoi: number | null; dernierePosition: number | null }
export type EtatSignale = 'actif' | 'pause' | 'hors_heures' | 'autorisation' | 'ferme';

// Lectures et écritures de la file l'une après l'autre : la tâche de fond et l'écran n'écrasent jamais un point.
// Jamais d'appel à `exclusif` depuis une fonction qui le tient déjà (attente sans fin).
let verrou: Promise<unknown> = Promise.resolve();
function exclusif<T>(f: () => Promise<T>): Promise<T> {
  const r = verrou.then(f, f);
  verrou = r.then(() => undefined, () => undefined);
  return r;
}

async function lireJson<T>(cle: string): Promise<T | null> {
  try {
    const brut = await AsyncStorage.getItem(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  } catch {
    return null;
  }
}
const ecrireJson = (cle: string, valeur: unknown) => AsyncStorage.setItem(cle, JSON.stringify(valeur)).catch(() => undefined);
const lireFile = async () => (await lireJson<EtatFile>(CLE_FILE)) ?? FILE_VIDE;
const lireContexte = () => lireJson<Contexte>(CLE_CONTEXTE);
const reglages = (c: Contexte | null | undefined) => c?.r ?? REGLAGES_DEFAUT;

async function lirePauses(c: Contexte): Promise<PauseLocale[]> {
  const p = await lireJson<Pauses>(CLE_PAUSES);
  return p && p.u === c.u && p.m === c.m ? p.liste : [];
}
const ecrirePauses = (c: Contexte, liste: PauseLocale[]) =>
  ecrireJson(CLE_PAUSES, { u: c.u, m: c.m, liste: pausesRecentes(liste, Date.now()) } satisfies Pauses);

async function noter(champ: keyof Bilan) {
  const bilan = (await lireJson<Bilan>(CLE_BILAN)) ?? { dernierEnvoi: null, dernierePosition: null };
  bilan[champ] = Date.now();
  await ecrireJson(CLE_BILAN, bilan);
}

// ---------------------------------------------------------------------------------------------------------------------
// Positions livrées par Android
// ---------------------------------------------------------------------------------------------------------------------

/** Mesures qui comptent : dans la file de l'agent connecté. */
async function enregistrerMesures(c: Contexte, mesures: Mesure[]) {
  await exclusif(async () => {
    let etat = await lireFile();
    const avant = etat;
    for (const mesure of [...mesures].sort((a, b) => a.ms - b.ms)) {
      const p = pointRetenu(etat.dernier, mesure);
      if (p) etat = ajouterPoint(etat, c.u, c.m, p);
    }
    if (etat !== avant) {
      await ecrireJson(CLE_FILE, etat);
      await noter('dernierePosition');
    }
  });
}

/** Positions gardées seulement pendant les heures de travail et hors pause ; à la fin des heures, la tâche s'arrête. */
async function traiterPositions(mesures: Mesure[]) {
  const c = await lireContexte();
  if (!c) return;
  const r = reglages(c);
  const maintenant = Date.now();
  if (!dansHeures(r, maintenant)) {
    await finDesHeures(c, maintenant);
    return;
  }
  const pauses = await clorePauseEchue(c, maintenant, false);
  const gardees = mesures.filter((m) => dansHeures(r, m.ms) && !pendantUnePause(pauses, m.ms));
  if (gardees.length) await enregistrerMesures(c, gardees);
  await signaler(pauseEnCours(pauses) ? 'pause' : 'actif');
  void envoyerPoints().catch(() => undefined);
}

TaskManager.defineTask(TACHE_GPS, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  if (!locations?.length) return;
  await traiterPositions(locations.map((l) => ({
    lon: l.coords.longitude, lat: l.coords.latitude, precision: l.coords.accuracy, ms: l.timestamp,
  }))).catch(() => undefined);
});

// ---------------------------------------------------------------------------------------------------------------------
// Tâche de localisation : mode précis (heures de travail) ou repos (pause)
// ---------------------------------------------------------------------------------------------------------------------

// Mode de la tâche tel qu'appliqué ; « :arriere » : changé hors de l'écran, sans toucher à la notification (Android ne
// le permet qu'appli ouverte), à refaire au prochain passage au premier plan.
let modeApplique: string | null = null;

export async function tacheDemarree(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TACHE_GPS);
  } catch {
    return false;
  }
}

function optionsTache(r: ReglagesSuivi, pause: PauseLocale | null, premierPlan: boolean): Location.LocationTaskOptions {
  const gps: Location.LocationTaskOptions = pause
    // Pause : GPS au repos (position approximative du réseau, aussitôt jetée), un réveil par minute pour la reprise.
    ? { accuracy: Location.Accuracy.Lowest, timeInterval: 60000, distanceInterval: 0 }
    // Heures de travail : au plus une mesure toutes les 10 s (le filtre fin, 15 m / 30 s, est dans pointRetenu), livrées
    // par lots d'une minute écran éteint ; immobile, la tablette reçoit quand même ses mesures (signe de vie du suivi).
    : { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 0, deferredUpdatesInterval: 60000 };
  if (!premierPlan) return gps;
  const fin = pause ? hhmm(heureLocale(pause.finPrevue).minutes) : '';
  return {
    ...gps,
    foregroundService: pause
      ? {
        notificationTitle: t("Pause jusqu'à {heure}", { heure: fin }),
        notificationBody: t('Aucune position enregistrée pendant la pause. Le suivi reprend seul à {heure}.', { heure: fin }),
        notificationColor: '#0084d1',
        killServiceOnDestroy: false,
      }
      : {
        notificationTitle: t('Suivi GPS des heures de travail ({debut}-{fin})', { debut: hhmm(r.debut), fin: hhmm(r.fin) }),
        notificationBody: t("Preuve du linéaire balayé pour la SRM. Rien n'est enregistré hors des heures ni pendant une pause."),
        notificationColor: '#0084d1',
        killServiceOnDestroy: false,
      },
  };
}

/** Démarre la tâche ou change son mode ; hors de l'écran, seulement si elle tourne déjà (réglage du GPS seul). */
async function appliquerMode(r: ReglagesSuivi, pause: PauseLocale | null, premierPlan: boolean): Promise<boolean> {
  const cle = pause ? `pause:${pause.finPrevue}` : `actif:${r.debut}-${r.fin}`;
  const demarree = await tacheDemarree();
  if (demarree && (modeApplique === cle || (!premierPlan && modeApplique === `${cle}:arriere`))) return true;
  if (!premierPlan && !demarree) return false;
  try {
    await Location.startLocationUpdatesAsync(TACHE_GPS, optionsTache(r, pause, premierPlan));
    modeApplique = premierPlan ? cle : `${cle}:arriere`;
    return true;
  } catch (e) {
    console.warn('Suivi GPS indisponible :', (e as Error).message ?? e);
    return false;
  }
}

async function arreterTache() {
  modeApplique = null;
  try {
    if (await tacheDemarree()) await Location.stopLocationUpdatesAsync(TACHE_GPS);
  } catch {
    // déjà arrêtée
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Heures de travail, pauses, rappel du matin
// ---------------------------------------------------------------------------------------------------------------------

/** Clôt la pause en cours (fin bornée à sa fin prévue) et la met dans la file d'envoi ; null s'il n'y en a pas. */
async function clorePause(c: Contexte, quand: number, motif: MotifFin): Promise<PauseLocale | null> {
  return exclusif(async () => {
    const liste = await lirePauses(c);
    const p = pauseEnCours(liste);
    if (!p) return null;
    const fermee: PauseLocale = { ...p, fin: Math.max(p.debut, Math.min(quand, p.finPrevue)), motif: quand >= p.finPrevue ? 'automatique' : motif };
    await ecrirePauses(c, liste.map((x) => (x === p ? fermee : x)));
    await ecrireJson(CLE_FILE, fileAvecPause(await lireFile(), { u: c.u, m: c.m, debut: fermee.debut, fin: fermee.fin, motif: fermee.motif }));
    return fermee;
  });
}

/** Pause arrivée à sa fin prévue : close, GPS de nouveau précis. Retourne les pauses à jour. */
async function clorePauseEchue(c: Contexte, maintenant: number, premierPlan: boolean): Promise<PauseLocale[]> {
  const liste = await exclusif(() => lirePauses(c));
  const p = pauseEnCours(liste);
  if (!p || maintenant < p.finPrevue) return liste;
  await clorePause(c, p.finPrevue, 'automatique');
  await appliquerMode(reglages(c), null, premierPlan);
  await signaler('actif', true);
  void envoyerPoints(true).catch(() => undefined);
  return exclusif(() => lirePauses(c));
}

/** Fin des heures de travail : pause close, tâche arrêtée (plus de notification), rappel au prochain début. */
async function finDesHeures(c: Contexte, maintenant: number) {
  await clorePause(c, maintenant, 'fin_journee');
  await arreterTache();
  await signaler('hors_heures');
  await planifierRappel(reglages(c), maintenant);
  void envoyerPoints(true).catch(() => undefined);
}

let rappelPlanifie: number | null = null;
async function planifierRappel(r: ReglagesSuivi, maintenant: number) {
  const quand = prochainDebut(r, maintenant);
  if (quand == null || quand === rappelPlanifie) return;
  try {
    await Notifications.setNotificationChannelAsync(CANAL_RAPPEL, { name: t('Suivi GPS'), importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.scheduleNotificationAsync({
      identifier: RAPPEL,
      content: { title: t('Début des heures de travail'), body: t('Touchez ici pour reprendre le suivi GPS de la journée.'), data: { suivi_gps: 'reprise' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: quand, channelId: CANAL_RAPPEL },
    });
    rappelPlanifie = quand;
  } catch {
    // notifications refusées : le suivi repartira à l'ouverture de l'appli
  }
}

async function annulerRappel() {
  rappelPlanifie = null;
  await Notifications.cancelScheduledNotificationAsync(RAPPEL).catch(() => undefined);
  await Notifications.dismissNotificationAsync(RAPPEL).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------------------------------
// Envoi : état de la tablette, pauses, points
// ---------------------------------------------------------------------------------------------------------------------

/** Compte connecté, jeton renouvelé au besoin (en arrière-plan, auth-js ne le fait pas seul) ; null hors ligne. */
async function compteConnecte(): Promise<string | null> {
  if (jetonARenouveler()) return null;
  const attente = new Promise<null>((fin) => setTimeout(() => fin(null), DELAI_SESSION_MS));
  const lue = await Promise.race([supabase.auth.getSession().then((r) => r.data.session, () => null), attente]);
  return lue?.user.id ?? null;
}

let dernierSignal: { cle: string; ms: number } | null = null;

/**
 * Dit à la base l'état du suivi de l'agent (changement, ou toutes les 10 min), avec le décalage UTC de l'heure de la
 * tablette ; la réponse apporte les réglages du marché à jour. Sans réseau : rien (la base le verra au retour).
 */
async function signaler(etat: EtatSignale, force = false) {
  const c = await lireContexte();
  if (!c) return;
  const cle = `${c.u}|${c.m}|${etat}`;
  if (!force && dernierSignal?.cle === cle && Date.now() - dernierSignal.ms < SIGNAL_MS) return;
  if ((await compteConnecte()) !== c.u) return;
  try {
    const { data, error } = await supabase.rpc('signaler_suivi_gps', {
      p_marche: c.m, p_etat: etat, p_decalage_min: -new Date().getTimezoneOffset(),
    });
    if (error) return;
    dernierSignal = { cle, ms: Date.now() };
    if (data && typeof data === 'object') {
      const r = reglagesSuivi(data as ColonnesSuivi);
      if (JSON.stringify(r) !== JSON.stringify(c.r)) {
        await exclusif(async () => {
          const actuel = await lireContexte();
          if (actuel?.u === c.u && actuel.m === c.m) await ecrireJson(CLE_CONTEXTE, { ...actuel, r } satisfies Contexte);
        });
      }
    }
  } catch {
    // hors ligne
  }
}

/** Réponse définitive de la base (plus affecté, marché désactivé, valeur refusée) ou erreur passagère. */
function classer(error: { code?: string; message?: string } | null): Reponse {
  if (!error) return 'ok';
  if (error.code === '42501' && /affectation/i.test(error.message ?? '')) return 'refus';
  return error.code === '22023' ? 'refus' : 'reseau';
}

async function envoyerPaquet(marche: string, pts: Point[]): Promise<Reponse> {
  try {
    const { error } = await supabase.rpc('ajouter_points_trace', { p_marche: marche, p_points: pts });
    // Toute autre erreur (réseau, jeton expiré, fonction pas encore déployée) : les points restent sur la tablette.
    return classer(error);
  } catch {
    return 'reseau';
  }
}

async function envoyerPause(p: PauseEnvoi): Promise<Reponse> {
  try {
    const { error } = await supabase.rpc('enregistrer_pause_gps', {
      p_marche: p.m, p_debut: new Date(p.debut).toISOString(),
      p_fin: p.fin == null ? null : new Date(p.fin).toISOString(), p_motif: p.motif,
    });
    return classer(error);
  } catch {
    return 'reseau';
  }
}

let envoiEnCours: Promise<number> | null = null;
let dernierEssai = 0;

/**
 * Envoie les pauses puis la file de l'agent connecté. `maintenant` : sans attendre l'intervalle minimal (retour sur
 * l'appli, pause, « Quitter ») ; un envoi déjà en cours est attendu, puis la file repart (une pause close entre-temps).
 * Retourne le nombre de points acceptés par la base.
 */
export async function envoyerPoints(maintenant = false): Promise<number> {
  while (envoiEnCours) {
    if (!maintenant) return 0;
    await envoiEnCours.catch(() => 0);
  }
  if (!maintenant && Date.now() - dernierEssai < ENVOI_MIN_MS) return 0;
  const envoi = envoyerTout();
  envoiEnCours = envoi;
  try {
    return await envoi;
  } finally {
    if (envoiEnCours === envoi) envoiEnCours = null;
  }
}

async function envoyerTout(): Promise<number> {
  const etat = await exclusif(lireFile);
  if (!nbPoints(etat) && !etat.pauses?.length) return 0;
  dernierEssai = Date.now();
  const uid = await compteConnecte();
  if (!uid) return 0;
  // Pauses d'abord : la fin d'une pause doit arriver avant les points qui la suivent (la base ignore un point pris
  // pendant une pause pas encore finie).
  const pauses = (etat.pauses ?? []).filter((p) => p.u === uid);
  const faites: PauseEnvoi[] = [];
  for (const p of pauses) {
    if ((await envoyerPause(p)) === 'reseau') break;
    faites.push(p);
  }
  if (faites.length) await exclusif(async () => ecrireJson(CLE_FILE, retirerPauses(await lireFile(), faites)));
  if (faites.length < pauses.length) return 0;

  const { acquits, envoyes } = await envoyerFile(etat, uid, envoyerPaquet);
  if (acquits.length) {
    await exclusif(async () => {
      const frais = await lireFile();
      await ecrireJson(CLE_FILE, { ...frais, lots: borner(retirerAcquits(frais, uid, acquits).lots) });
    });
  }
  if (envoyes) {
    await noter('dernierEnvoi');
    // Points reçus : la base tient le suivi pour vivant, inutile de le redire avant 10 min.
    if (dernierSignal?.cle.endsWith('|actif')) dernierSignal.ms = Date.now();
  }
  return envoyes;
}

// ---------------------------------------------------------------------------------------------------------------------
// Démarrage, pause, reprise, arrêt, autorisations (appelés depuis l'écran, appli ouverte)
// ---------------------------------------------------------------------------------------------------------------------

export interface Autorisations { premierPlan: boolean; arrierePlan: boolean }

export async function autorisations(): Promise<Autorisations> {
  try {
    const [pp, ap] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]);
    return { premierPlan: pp.granted, arrierePlan: ap.granted };
  } catch {
    return { premierPlan: false, arrierePlan: false };
  }
}

/** Position, puis « Toujours autoriser » (Android 11 et plus : la fenêtre d'Android renvoie aux réglages de l'appli). */
export async function demanderAutorisations(): Promise<Autorisations> {
  try {
    const pp = await Location.requestForegroundPermissionsAsync();
    if (!pp.granted) return { premierPlan: false, arrierePlan: false };
    const ap = await Location.requestBackgroundPermissionsAsync();
    return { premierPlan: true, arrierePlan: ap.granted };
  } catch {
    return autorisations();
  }
}

export type ModeSuivi = 'actif' | 'pause' | 'hors_heures' | 'autorisation' | 'indisponible';

/**
 * Démarre (ou met à jour) le suivi de l'agent `uid` dans le marché `marcheId`, appli ouverte. `r` : réglages lus avec
 * le marché (ceux qu'apporte ensuite la base les remplacent). Hors des heures de travail : tâche arrêtée, rappel au
 * prochain début. Sans autorisation complète : rien.
 */
export async function assurerSuivi(uid: string, marcheId: string, r?: ReglagesSuivi): Promise<ModeSuivi> {
  await AsyncStorage.removeItem(CLE_ANCIENNE_PREFERENCE).catch(() => undefined);
  const c = await exclusif(async () => {
    const avant = await lireContexte();
    const meme = avant?.u === uid && avant.m === marcheId;
    const nouveau: Contexte = { u: uid, m: marcheId, r: (meme ? avant?.r : undefined) ?? r };
    await ecrireJson(CLE_CONTEXTE, nouveau);
    // Autre agent ou autre marché : le dernier point gardé ne sert plus de référence.
    if (avant && !meme) {
      const etat = await lireFile();
      await ecrireJson(CLE_FILE, { ...etat, dernier: null });
    }
    return nouveau;
  });
  const a = await autorisations();
  if (!a.premierPlan || !a.arrierePlan) {
    await signaler('autorisation');
    return 'autorisation';
  }
  const maintenant = Date.now();
  if (!dansHeures(reglages(c), maintenant)) {
    await finDesHeures(c, maintenant);
    return 'hors_heures';
  }
  await annulerRappel();
  const pause = pauseEnCours(await clorePauseEchue(c, maintenant, true));
  if (!(await appliquerMode(reglages(c), pause, true))) return 'indisponible';
  await signaler(pause ? 'pause' : 'actif');
  return pause ? 'pause' : 'actif';
}

export type ReponsePause = { ok: true; finPrevue: number } | { ok: false; raison: 'hors_heures' | 'epuisee' | 'inactif' };

/** « Pause » : aucune position gardée jusqu'à la reprise (automatique à la fin prévue). */
export async function mettreEnPause(): Promise<ReponsePause> {
  const c = await lireContexte();
  if (!c || !(await tacheDemarree())) return { ok: false, raison: 'inactif' };
  const r = reglages(c);
  const maintenant = Date.now();
  if (!dansHeures(r, maintenant)) return { ok: false, raison: 'hors_heures' };
  const pause = await exclusif(async () => {
    const liste = await lirePauses(c);
    const deja = pauseEnCours(liste);
    if (deja) return deja;
    if (pauseRestanteMs(r, liste, maintenant) < 60000) return null;
    const p: PauseLocale = { debut: maintenant, finPrevue: finPrevuePause(r, liste, maintenant), fin: null, motif: null };
    await ecrirePauses(c, [...liste, p]);
    await ecrireJson(CLE_FILE, fileAvecPause(await lireFile(), { u: c.u, m: c.m, debut: p.debut, fin: null, motif: null }));
    return p;
  });
  if (!pause) return { ok: false, raison: 'epuisee' };
  await appliquerMode(r, pause, true);
  await signaler('pause', true);
  void envoyerPoints(true).catch(() => undefined);
  return { ok: true, finPrevue: pause.finPrevue };
}

/** Fin de la pause en cours : bouton « Reprendre », fuite signalée, tronçon coché. Faux s'il n'y avait pas de pause. */
export async function reprendreSuivi(motif: 'agent' | 'fuite' | 'balayage'): Promise<boolean> {
  const c = await lireContexte();
  if (!c) return false;
  const fermee = await clorePause(c, Date.now(), motif);
  if (!fermee) return false;
  if (dansHeures(reglages(c), Date.now())) {
    await appliquerMode(reglages(c), null, true);
    await signaler('actif', true);
  }
  void envoyerPoints(true).catch(() => undefined);
  return true;
}

/** Arrête la tâche et oublie le contexte ; la file garde les points et les pauses pas encore envoyés. */
export async function arreterSuivi() {
  await arreterTache();
  await annulerRappel();
  await exclusif(() => AsyncStorage.removeItem(CLE_CONTEXTE).catch(() => undefined));
}

/** « Quitter » : pause close, derniers envois et état « session fermée » (5 s au plus), puis arrêt. */
export async function terminerSuivi() {
  const c = await lireContexte();
  if (c) await clorePause(c, Date.now(), 'quitter');
  const envois = (async () => {
    await envoyerPoints(true).catch(() => 0);
    await signaler('ferme', true);
  })();
  await Promise.race([envois, new Promise((fin) => setTimeout(fin, 5000))]);
  await arreterSuivi();
}

export interface EtatSuivi {
  autorisations: Autorisations;
  /** La tâche tourne (notification affichée). */
  actif: boolean;
  /** autorisation : position refusée ; arrete : heures de travail, mais la tâche ne tourne pas. */
  mode: 'actif' | 'pause' | 'hors_heures' | 'autorisation' | 'arrete';
  reglages: ReglagesSuivi;
  pause: PauseLocale | null;
  pauseRestanteMs: number;
  enAttente: number;
  dernierEnvoi: number | null;
  dernierePosition: number | null;
}

export async function etatSuivi(): Promise<EtatSuivi> {
  const [a, actif, file, bilan, c] = await Promise.all([
    autorisations(), tacheDemarree(), exclusif(lireFile), lireJson<Bilan>(CLE_BILAN), lireContexte(),
  ]);
  const r = reglages(c);
  const maintenant = Date.now();
  const pauses = c ? await exclusif(() => lirePauses(c)) : [];
  const enCours = pauseEnCours(pauses);
  const pause = enCours && maintenant < enCours.finPrevue ? enCours : null;
  const mode: EtatSuivi['mode'] = !a.premierPlan || !a.arrierePlan ? 'autorisation'
    : !dansHeures(r, maintenant) ? 'hors_heures'
      : pause ? 'pause'
        : actif ? 'actif' : 'arrete';
  return {
    autorisations: a, actif, mode, reglages: r, pause, pauseRestanteMs: pauseRestanteMs(r, pauses, maintenant),
    enAttente: nbPoints(file), dernierEnvoi: bilan?.dernierEnvoi ?? null, dernierePosition: bilan?.dernierePosition ?? null,
  };
}

// Suivi GPS en arrière-plan (X6, décisions d'Issam Q14) : tâche de fond d'expo-location (service de premier plan Android,
// notification permanente), points gardés sur la tablette puis envoyés par lots à la base (ajouter_points_trace, un
// tracé par agent et par jour, visible du responsable et de l'administrateur seulement).
// - Tant que la session de l'agent est ouverte : tâche démarrée à la connexion (autorisations accordées), arrêtée à
//   « Quitter ». Un point tous les 15 m, ou toutes les 30 s si l'agent se déplace (suivi-gps-regles.ts) ; à l'arrêt, le
//   filtre de distance d'Android n'envoie rien (pas de réveil, pas de réseau).
// - La tâche est définie ici, à la racine du module : index.ts l'importe avant le composant racine, donc aussi quand
//   Android réveille l'appli sans écran pour livrer une position.
// - Hors ligne : la file reste sur la tablette (jusqu'à 20 000 points, 7 jours) et repart par paquets de 500, sans doublon
//   possible (la base ignore un point déjà reçu).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { t } from './langue';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';
import {
  ajouterPoint, borner, envoyerFile, FILE_VIDE, nbPoints, pointRetenu, retirerAcquits,
  type EtatFile, type Mesure, type Point, type Reponse,
} from './suivi-gps-regles';

export const TACHE_GPS = 'suivi-fuites-gps';
const CLE_FILE = 'suivi-fuites:gps-file';
const CLE_CONTEXTE = 'suivi-fuites:gps-contexte';
const CLE_PREFERENCE = 'suivi-fuites:gps-actif';
const CLE_BILAN = 'suivi-fuites:gps-bilan';
/** Au plus un envoi toutes les 2 minutes en arrière-plan (la radio 4G ne se réveille pas pour 3 points). */
const ENVOI_MIN_MS = 2 * 60 * 1000;
const DELAI_SESSION_MS = 20000;

interface Contexte { u: string; m: string }
interface Bilan { dernierEnvoi: number | null; dernierePosition: number | null }

// Lectures et écritures de la file l'une après l'autre : la tâche de fond et l'écran n'écrasent jamais un point.
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

async function noter(champ: keyof Bilan) {
  const bilan = (await lireJson<Bilan>(CLE_BILAN)) ?? { dernierEnvoi: null, dernierePosition: null };
  bilan[champ] = Date.now();
  await ecrireJson(CLE_BILAN, bilan);
}

/** Mesures livrées par Android : celles qui comptent entrent dans la file de l'agent connecté. */
async function enregistrerMesures(mesures: Mesure[]) {
  await exclusif(async () => {
    const contexte = await lireJson<Contexte>(CLE_CONTEXTE);
    if (!contexte) return;
    let etat = await lireFile();
    const avant = etat;
    for (const mesure of [...mesures].sort((a, b) => a.ms - b.ms)) {
      const p = pointRetenu(etat.dernier, mesure);
      if (p) etat = ajouterPoint(etat, contexte.u, contexte.m, p);
    }
    if (etat !== avant) {
      await ecrireJson(CLE_FILE, etat);
      await noter('dernierePosition');
    }
  });
}

TaskManager.defineTask(TACHE_GPS, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations?: Location.LocationObject[] };
  if (!locations?.length) return;
  await enregistrerMesures(locations.map((l) => ({
    lon: l.coords.longitude, lat: l.coords.latitude, precision: l.coords.accuracy, ms: l.timestamp,
  })));
  void envoyerPoints().catch(() => undefined);
});

// ---------------------------------------------------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------------------------------------------------

async function envoyerPaquet(marche: string, pts: Point[]): Promise<Reponse> {
  try {
    const { error } = await supabase.rpc('ajouter_points_trace', { p_marche: marche, p_points: pts });
    if (!error) return 'ok';
    // Réponse définitive de la base : plus affecté à ce marché, marché désactivé, compte révoqué. Toute autre erreur
    // (réseau, jeton expiré, fonction pas encore déployée) : les points restent sur la tablette.
    return error.code === '42501' && /affectation/i.test(error.message ?? '') ? 'refus' : 'reseau';
  } catch {
    return 'reseau';
  }
}

/** Compte connecté, jeton renouvelé au besoin (en arrière-plan, auth-js ne le fait pas seul) ; null hors ligne. */
async function compteConnecte(): Promise<string | null> {
  if (jetonARenouveler()) return null;
  const attente = new Promise<null>((fin) => setTimeout(() => fin(null), DELAI_SESSION_MS));
  const lue = await Promise.race([supabase.auth.getSession().then((r) => r.data.session, () => null), attente]);
  return lue?.user.id ?? null;
}

let envoiEnCours = false;
let dernierEssai = 0;

/**
 * Envoie la file de l'agent connecté. `maintenant` : sans attendre l'intervalle minimal (retour sur l'appli,
 * « Quitter »). Retourne le nombre de points acceptés par la base.
 */
export async function envoyerPoints(maintenant = false): Promise<number> {
  if (envoiEnCours) return 0;
  if (!maintenant && Date.now() - dernierEssai < ENVOI_MIN_MS) return 0;
  envoiEnCours = true;
  try {
    const etat = await exclusif(lireFile);
    if (!nbPoints(etat)) return 0;
    dernierEssai = Date.now();
    const uid = await compteConnecte();
    if (!uid) return 0;
    const { acquits, envoyes } = await envoyerFile(etat, uid, envoyerPaquet);
    if (acquits.length) {
      await exclusif(async () => {
        const frais = await lireFile();
        await ecrireJson(CLE_FILE, { ...frais, lots: borner(retirerAcquits(frais, uid, acquits).lots) });
      });
    }
    if (envoyes) await noter('dernierEnvoi');
    return envoyes;
  } finally {
    envoiEnCours = false;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Démarrage, arrêt, autorisations
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

/** « Désactiver » sur la tablette : le suivi ne repart pas tout seul tant que l'agent ne l'a pas réactivé. */
export const suiviVoulu = async () => (await AsyncStorage.getItem(CLE_PREFERENCE).catch(() => null)) !== 'non';
export const voulerSuivi = (voulu: boolean) => AsyncStorage.setItem(CLE_PREFERENCE, voulu ? 'oui' : 'non').catch(() => undefined);

export async function tacheDemarree(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(TACHE_GPS);
  } catch {
    return false;
  }
}

/**
 * Démarre (ou met à jour) le suivi pour l'agent `uid` dans le marché `marcheId`. Sans autorisation complète ou si l'agent
 * l'a désactivé : rien. Retourne vrai si la tâche tourne.
 */
export async function assurerSuivi(uid: string, marcheId: string): Promise<boolean> {
  if (!(await suiviVoulu())) return false;
  const a = await autorisations();
  if (!a.premierPlan || !a.arrierePlan) return false;
  await exclusif(async () => {
    const avant = await lireJson<Contexte>(CLE_CONTEXTE);
    await ecrireJson(CLE_CONTEXTE, { u: uid, m: marcheId } satisfies Contexte);
    // Autre agent ou autre marché : le dernier point gardé ne sert plus de référence.
    if (avant && (avant.u !== uid || avant.m !== marcheId)) {
      const etat = await lireFile();
      await ecrireJson(CLE_FILE, { ...etat, dernier: null });
    }
  });
  try {
    if (!(await tacheDemarree())) {
      await Location.startLocationUpdatesAsync(TACHE_GPS, {
        accuracy: Location.Accuracy.High,
        // Android : au plus une mesure toutes les 10 s et seulement après 5 m de déplacement ; le filtre fin (15 m /
        // 30 s) est dans pointRetenu. Un appareil immobile ne livre rien.
        timeInterval: 10000,
        distanceInterval: 5,
        foregroundService: {
          notificationTitle: t('Suivi de position actif'),
          notificationBody: t('Le tracé de votre journée est transmis à votre responsable.'),
          notificationColor: '#0084d1',
          killServiceOnDestroy: false,
        },
      });
    }
    return true;
  } catch (e) {
    console.warn('Suivi GPS indisponible :', (e as Error).message ?? e);
    return false;
  }
}

/** Arrête la tâche et oublie le contexte ; la file garde les points pas encore envoyés. */
export async function arreterSuivi() {
  try {
    if (await tacheDemarree()) await Location.stopLocationUpdatesAsync(TACHE_GPS);
  } catch {
    // déjà arrêtée
  }
  await exclusif(() => AsyncStorage.removeItem(CLE_CONTEXTE).catch(() => undefined));
}

/** « Quitter » : dernier envoi (5 s au plus), puis arrêt. */
export async function terminerSuivi() {
  await Promise.race([envoyerPoints(true).catch(() => 0), new Promise((fin) => setTimeout(fin, 5000))]);
  await arreterSuivi();
}

export interface EtatSuivi {
  autorisations: Autorisations;
  voulu: boolean;
  actif: boolean;
  enAttente: number;
  dernierEnvoi: number | null;
  dernierePosition: number | null;
}

export async function etatSuivi(): Promise<EtatSuivi> {
  const [a, voulu, actif, file, bilan] = await Promise.all([
    autorisations(), suiviVoulu(), tacheDemarree(), exclusif(lireFile), lireJson<Bilan>(CLE_BILAN),
  ]);
  return {
    autorisations: a, voulu, actif, enAttente: nbPoints(file),
    dernierEnvoi: bilan?.dernierEnvoi ?? null, dernierePosition: bilan?.dernierePosition ?? null,
  };
}

// Substitut des modules natifs (appareil photo, GPS…) : jamais appelés par l'essai de la file d'attente.
export const randomUUID = () => crypto.randomUUID();
const absent = () => { throw new Error('module natif absent de l\'essai'); };
export const requestCameraPermissionsAsync = absent, launchCameraAsync = absent, manipulateAsync = absent;
export const getLastKnownPositionAsync = absent;
export const SaveFormat = { JPEG: 'jpeg' };

// Suivi GPS (S11) : autorisations, tâche de fond et gestionnaire de tâches simulés ; l'essai les pilote par `gps`.
export const gps = { premierPlan: true, arrierePlan: true, demarree: false, options: null, taches: new Map() };
export const Accuracy = { Lowest: 1, High: 4 };
export const getForegroundPermissionsAsync = async () => ({ granted: gps.premierPlan, status: gps.premierPlan ? 'granted' : 'denied' });
export const getBackgroundPermissionsAsync = async () => ({ granted: gps.arrierePlan });
export const requestForegroundPermissionsAsync = async () => ({ granted: gps.premierPlan });
export const requestBackgroundPermissionsAsync = async () => ({ granted: gps.arrierePlan });
export const hasStartedLocationUpdatesAsync = async () => gps.demarree;
export const startLocationUpdatesAsync = async (nom, options) => { gps.demarree = true; gps.options = options; };
export const stopLocationUpdatesAsync = async () => { gps.demarree = false; };
export const defineTask = (nom, f) => gps.taches.set(nom, f);

// Notifications (rappel du suivi GPS au début des heures de travail) : notifications planifiées, l'essai les lit par `notifs`.
export const notifs = { planifiees: new Map(), canaux: new Set() };
export const AndroidImportance = { DEFAULT: 3, HIGH: 4 };
export const SchedulableTriggerInputTypes = { DATE: 'date' };
export const setNotificationChannelAsync = async (id) => { notifs.canaux.add(id); return null; };
export const scheduleNotificationAsync = async (demande) => { notifs.planifiees.set(demande.identifier, demande); return demande.identifier; };
export const cancelScheduledNotificationAsync = async (id) => { notifs.planifiees.delete(id); };
export const dismissNotificationAsync = async () => undefined;

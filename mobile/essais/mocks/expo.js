// Substitut des modules natifs (appareil photo, GPS…) : jamais appelés par l'essai de la file d'attente.
export const randomUUID = () => crypto.randomUUID();
const absent = () => { throw new Error('module natif absent de l\'essai'); };
export const requestCameraPermissionsAsync = absent, launchCameraAsync = absent, manipulateAsync = absent;
export const getForegroundPermissionsAsync = absent, getLastKnownPositionAsync = absent;
export const SaveFormat = { JPEG: 'jpeg' };

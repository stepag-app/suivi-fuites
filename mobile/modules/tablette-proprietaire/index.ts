// Suivi fuites propriétaire de la tablette (lot TP, docs/lots/lot-tablette-proprietaire.md) : accès JS au module natif.
// Absent (ancienne APK, essais sans pile) ou appli non propriétaire : `proprietaire` vaut false et rien ne change.
import { requireOptionalNativeModule } from 'expo';

export interface EtatTablette {
  proprietaire: boolean;
  profil: 'agent' | 'essai';
  /** Fin du déverrouillage en cours (ms depuis 1970), null si la tablette est fermée. */
  deverrouilleeJusqua: number | null;
  cachees: string[];
  /** Applis installées pendant un déverrouillage, gardées visibles sur cette tablette. */
  gardees: string[];
  appareil: string;
  modele: string;
  android: string;
}

export interface EvenementTablette { action: string; details: Record<string, unknown>; le: number }

export interface ReseauWifi {
  ssid: string;
  /** Force du signal, 0 à 4. */
  niveau: number;
  type: 'ouvert' | 'wpa' | 'sae' | 'wep' | 'entreprise';
  /** Déjà enregistré sur la tablette (pas de mot de passe à retaper). */
  connu: boolean;
  connecte: boolean;
}
export interface EtatWifi { actif: boolean; ssidConnecte: string | null; reseaux: ReseauWifi[] }

interface ModuleNatif {
  etat(): string;
  appliquerPolitique(): Promise<string>;
  deverrouiller(minutes: number): Promise<string>;
  reverrouiller(): Promise<string>;
  installerApk(chemin: string, sha256: string): Promise<void>;
  transfererVers(paquet: string): Promise<void>;
  liberer(): Promise<void>;
  evenementsEnAttente(): string;
  acquitterEvenements(n: number): void;
  wifiEtat(): string;
  wifiActiver(actif: boolean): Promise<void>;
  wifiConnecter(ssid: string, motDePasse: string, type: string): Promise<void>;
  wifiOublier(ssid: string): Promise<void>;
}

const natif = requireOptionalNativeModule<ModuleNatif>('TabletteProprietaire');

export function etatTablette(): EtatTablette | null {
  if (!natif) return null;
  try {
    return JSON.parse(natif.etat()) as EtatTablette;
  } catch {
    return null;
  }
}

export const estProprietaire = () => etatTablette()?.proprietaire === true;

const json = (s: string) => JSON.parse(s) as Record<string, unknown>;
const requis = () => {
  if (!natif) throw new Error('Module de la tablette absent de cette version');
  return natif;
};

export const appliquerPolitique = async () => (natif ? json(await natif.appliquerPolitique()) : { proprietaire: false });
export const deverrouiller = async (minutes: number) => json(await requis().deverrouiller(minutes));
export const reverrouiller = async () => json(await requis().reverrouiller());
/** Mise à jour sans fenêtre d'Android (propriétaire) ; `chemin` peut commencer par file://. */
export const installerApk = (chemin: string, sha256: string) => requis().installerApk(chemin, sha256);
export const transfererVers = (paquet: string) => requis().transfererVers(paquet);
export const liberer = () => requis().liberer();

export function evenementsEnAttente(): EvenementTablette[] {
  if (!natif) return [];
  try {
    return JSON.parse(natif.evenementsEnAttente()) as EvenementTablette[];
  } catch {
    return [];
  }
}

export const acquitterEvenements = (n: number) => natif?.acquitterEvenements(n);

/** Wi-Fi depuis l'appli (tablette verrouillée : Paramètres cachés) ; réseaux vus par le système, triés par signal. */
export const etatWifi = (): EtatWifi => JSON.parse(requis().wifiEtat()) as EtatWifi;
export const activerWifi = (actif: boolean) => requis().wifiActiver(actif);
export const connecterWifi = (ssid: string, motDePasse: string, type: ReseauWifi['type']) => requis().wifiConnecter(ssid, motDePasse, type);
export const oublierWifi = (ssid: string) => requis().wifiOublier(ssid);

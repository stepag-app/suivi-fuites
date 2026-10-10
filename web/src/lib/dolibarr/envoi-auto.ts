// État de la synchronisation Dolibarr (X8) lu dans le journal envois_dolibarr : Supabase lit l'API REST de Dolibarr
// toutes les 15 minutes (pg_cron), ou à la demande (bouton « Synchroniser maintenant ») ; chaque passage laisse au moins
// un signe de vie (statut « rien » regroupé) ou une erreur. Logique pure, vérifiée par scripts/verifier-envoi-dolibarr.mjs
// (aucun import à l'exécution).

export type StatutEnvoi = 'recu' | 'rien' | 'erreur';
/** fonction : refus à l'import ; api : lecture de Dolibarr impossible ; script : ancien script du serveur (retiré). */
export type OrigineEnvoi = 'fonction' | 'script' | 'api';

export interface EnvoiDolibarr {
  id: number;
  recu_le: string;
  dernier_le: string;
  appels: number;
  statut: StatutEnvoi;
  origine: OrigineEnvoi;
  mouvements: number;
  nouveaux: number;
  modifies: number;
  ignores: number;
  dernier_dolibarr_id: number | null;
  date_max: string | null;
  message: string | null;
  poste: string | null;
  version_script: string | null;
}

export type EtatEnvoi = 'jamais' | 'en_service' | 'en_retard' | 'en_erreur';

export interface ResumeEnvoi {
  etat: EtatEnvoi;
  /** Dernier passage, réussi ou non. */
  dernierContact: string | null;
  /** Dernier passage réussi (mouvements reçus ou rien de neuf). */
  dernierSucces: EnvoiDolibarr | null;
  /** Dernier envoi qui a apporté des mouvements nouveaux ou changés. */
  dernierRecu: EnvoiDolibarr | null;
  /** Erreurs survenues après le dernier passage réussi (les plus récentes d'abord). */
  erreurs: EnvoiDolibarr[];
  minutesDepuisContact: number | null;
}

/** Passage toutes les 15 minutes : au-delà d'une heure sans nouvelles, la lecture planifiée est « en retard ». */
export const RETARD_MINUTES = 60;

const temps = (iso: string) => new Date(iso).getTime();

export function resumerEnvois(envois: EnvoiDolibarr[], maintenant: Date = new Date()): ResumeEnvoi {
  const tries = [...envois].sort((a, b) => temps(b.dernier_le) - temps(a.dernier_le) || b.id - a.id);
  const dernierSucces = tries.find((e) => e.statut !== 'erreur') ?? null;
  const dernierRecu = tries.find((e) => e.statut === 'recu') ?? null;
  const dernierContact = tries[0]?.dernier_le ?? null;
  const erreurs = tries.filter((e) => e.statut === 'erreur' && (!dernierSucces || temps(e.dernier_le) > temps(dernierSucces.dernier_le)));
  const minutesDepuisContact = dernierContact ? Math.max(0, Math.floor((maintenant.getTime() - temps(dernierContact)) / 60000)) : null;
  let etat: EtatEnvoi;
  if (!dernierContact) etat = 'jamais';
  else if (erreurs.length) etat = 'en_erreur';
  else if ((minutesDepuisContact ?? 0) > RETARD_MINUTES) etat = 'en_retard';
  else etat = 'en_service';
  return { etat, dernierContact, dernierSucces, dernierRecu, erreurs, minutesDepuisContact };
}

export const LIBELLES_ETAT: Record<EtatEnvoi, string> = {
  jamais: 'Jamais reçu',
  en_service: 'En service',
  en_retard: 'En retard',
  en_erreur: 'En erreur',
};

export const LIBELLES_ORIGINE: Record<OrigineEnvoi, string> = {
  api: 'lecture de Dolibarr',
  fonction: 'import',
  script: 'serveur Dolibarr',
};

export function depuis(minutes: number | null): string {
  if (minutes == null) return '—';
  if (minutes < 1) return 'à l\'instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 48) return `il y a ${h} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')}` : ''}`;
  return `il y a ${Math.floor(h / 24)} jours`;
}

export const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

export function libelleEnvoi(e: EnvoiDolibarr): string {
  if (e.statut === 'erreur') return e.message ?? 'Erreur';
  if (e.statut === 'rien') return e.mouvements ? `rien de neuf (${pluriel(e.mouvements, 'mouvement')} relu${e.mouvements > 1 ? 's' : ''})` : 'rien de neuf';
  const parts: string[] = [];
  if (e.nouveaux || !e.modifies) parts.push(pluriel(e.nouveaux, 'nouveau', 'nouveaux'));
  if (e.modifies) parts.push(`${e.modifies} mis à jour`);
  if (e.ignores) parts.push(`${e.ignores} ignoré${e.ignores > 1 ? 's' : ''} (entrepôt non suivi)`);
  return parts.join(', ');
}

/** Réponse de la fonction dolibarr-mouvements au bouton « Synchroniser maintenant ». */
export interface BilanSynchro {
  statut: 'recu' | 'rien' | 'erreur' | 'occupe';
  mouvements: number;
  nouveaux: number;
  modifies: number;
  ignores: number;
  erreur?: string;
  depuis?: string;
}

export function libelleBilan(b: BilanSynchro): string {
  if (b.statut === 'occupe') {
    const heure = b.depuis ? new Date(b.depuis).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
    return `Une lecture est déjà en cours${heure ? ` (commencée à ${heure})` : ''} : réessayez dans une minute.`;
  }
  if (b.statut === 'erreur') return `Lecture impossible : ${b.erreur ?? 'erreur sans message'}`;
  const lus = `${pluriel(b.mouvements, 'mouvement')} lu${b.mouvements > 1 ? 's' : ''}`;
  if (b.statut === 'rien') return `Synchronisé : rien de neuf (${lus}).`;
  const parts: string[] = [];
  if (b.nouveaux) parts.push(pluriel(b.nouveaux, 'nouveau', 'nouveaux'));
  if (b.modifies) parts.push(`${b.modifies} mis à jour`);
  return `Synchronisé : ${parts.join(', ')} (${lus}).`;
}

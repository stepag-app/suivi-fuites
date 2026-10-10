// État de l'envoi automatique Dolibarr (X8) lu dans le journal envois_dolibarr : la tâche planifiée du serveur Dolibarr
// passe toutes les 15 minutes ; chaque passage laisse au moins un signe de vie (statut « rien » regroupé). Logique pure,
// vérifiée par scripts/verifier-envoi-dolibarr.mjs (aucun import à l'exécution).

export type StatutEnvoi = 'recu' | 'rien' | 'erreur';

export interface EnvoiDolibarr {
  id: number;
  recu_le: string;
  dernier_le: string;
  appels: number;
  statut: StatutEnvoi;
  origine: 'fonction' | 'script';
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
  /** Dernier passage du serveur, réussi ou non. */
  dernierContact: string | null;
  /** Dernier passage réussi (mouvements reçus ou rien de neuf). */
  dernierSucces: EnvoiDolibarr | null;
  /** Dernier envoi qui a apporté des mouvements nouveaux ou changés. */
  dernierRecu: EnvoiDolibarr | null;
  /** Erreurs survenues après le dernier passage réussi (les plus récentes d'abord). */
  erreurs: EnvoiDolibarr[];
  minutesDepuisContact: number | null;
}

/** Passage toutes les 15 minutes : au-delà d'une heure sans nouvelles, la tâche est « en retard ». */
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

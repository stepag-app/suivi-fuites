// Préparation des lignes `balayages` saisies sur la carte : identifiants créés sur l'appareil, mises en
// file d'attente (hors-ligne.ts, type d'envoi « balayage ») puis envoyées. Fonctions pures.
import type { MethodeBalayage } from '@/lib/types';

export const METHODES: { valeur: MethodeBalayage; libelle: string }[] = [
  { valeur: 'ecoute', libelle: 'Écoute (sol, bouches à clé)' },
  { valeur: 'correlation', libelle: 'Corrélation acoustique' },
  { valeur: 'prelocalisation', libelle: 'Prélocalisation' },
  { valeur: 'enregistreurs', libelle: 'Enregistreurs de bruit' },
];

export type MotifRepasse = 'fuite_suspectee' | 'controle' | 'autre';
export const MOTIFS_REPASSE: { valeur: MotifRepasse; libelle: string }[] = [
  { valeur: 'fuite_suspectee', libelle: 'Fuite suspectée' },
  { valeur: 'controle', libelle: 'Contrôle' },
  { valeur: 'autre', libelle: 'Autre (voir observation)' },
];

export interface ChoixBalayage {
  marcheId: string;
  dateBalayage: string;                 // AAAA-MM-JJ
  methode: MethodeBalayage | null;
  observation: string | null;
  sourceSaisie?: 'tablette' | 'web';
  /** Motif des seconds passages (tronçons de `dejaBalayes`), confirmé par l'agent. */
  motifRepasse?: MotifRepasse | null;
}

export interface LigneBalayageEnvoi {
  id: string;
  marche_id: string;
  troncon_id: string;
  date_balayage: string;
  methode: MethodeBalayage | null;
  observation: string | null;
  source_saisie: 'tablette' | 'web';
  /** Seulement pour un second passage : absent sinon (envois en attente d'avant la colonne inchangés). */
  motif_repasse?: MotifRepasse;
}

/** Une ligne par tronçon sélectionné, identifiant uuid créé ici (renvoyer deux fois ne crée pas de doublon). */
export function preparerBalayages(
  tronconIds: Iterable<string>, choix: ChoixBalayage, uuid: () => string = () => crypto.randomUUID(), dejaBalayes: ReadonlySet<string> = new Set(),
): LigneBalayageEnvoi[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(choix.dateBalayage)) throw new Error('Date de balayage invalide.');
  const vus = new Set<string>();
  const lignes: LigneBalayageEnvoi[] = [];
  for (const troncon of tronconIds) {
    if (!troncon || vus.has(troncon)) continue;
    vus.add(troncon);
    const motif = dejaBalayes.has(troncon) ? choix.motifRepasse : null;
    lignes.push({
      id: uuid(),
      marche_id: choix.marcheId,
      troncon_id: troncon,
      date_balayage: choix.dateBalayage,
      methode: choix.methode || null,
      observation: choix.observation?.trim() || null,
      source_saisie: choix.sourceSaisie ?? 'web',
      ...(motif ? { motif_repasse: motif } : {}),
    });
  }
  return lignes;
}

/** Forme gardée dans la file d'attente (hors-ligne.ts, magasin « balayages ») : identifiant, marché, colonnes. */
export function enFileAttente(lignes: LigneBalayageEnvoi[]): { id: string; marche_id: string; ligne: Record<string, unknown> }[] {
  return lignes.map(({ id, marche_id, ...ligne }) => ({ id, marche_id, ligne }));
}

/** Jour d'aujourd'hui à l'heure du Maroc (valeur par défaut du champ date). */
export const aujourdhuiMaroc = (maintenant = new Date()) => maintenant.toLocaleDateString('sv-SE', { timeZone: 'Africa/Casablanca' });

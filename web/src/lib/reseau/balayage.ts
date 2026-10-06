// Préparation des lignes `balayages` saisies sur la carte : identifiants créés sur l'appareil, mises en
// file d'attente (hors-ligne.ts, type d'envoi « balayage ») puis envoyées. Fonctions pures.
import type { MethodeBalayage } from '@/lib/types';

export const METHODES: { valeur: MethodeBalayage; libelle: string }[] = [
  { valeur: 'ecoute', libelle: 'Écoute (sol, bouches à clé)' },
  { valeur: 'correlation', libelle: 'Corrélation acoustique' },
  { valeur: 'prelocalisation', libelle: 'Prélocalisation' },
  { valeur: 'enregistreurs', libelle: 'Enregistreurs de bruit' },
];

export interface ChoixBalayage {
  marcheId: string;
  equipeId: string | null;
  dateBalayage: string;                 // AAAA-MM-JJ
  methode: MethodeBalayage | null;
  observation: string | null;
  sourceSaisie?: 'tablette' | 'web';
}

export interface LigneBalayageEnvoi {
  id: string;
  marche_id: string;
  troncon_id: string;
  date_balayage: string;
  equipe_id: string | null;
  methode: MethodeBalayage | null;
  observation: string | null;
  source_saisie: 'tablette' | 'web';
}

export const CLE_EQUIPE_MEMORISEE = 'suivi-fuites:balayage:equipe';

/** Une ligne par tronçon sélectionné, identifiant uuid créé ici (renvoyer deux fois ne crée pas de doublon). */
export function preparerBalayages(tronconIds: Iterable<string>, choix: ChoixBalayage, uuid: () => string = () => crypto.randomUUID()): LigneBalayageEnvoi[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(choix.dateBalayage)) throw new Error('Date de balayage invalide.');
  const vus = new Set<string>();
  const lignes: LigneBalayageEnvoi[] = [];
  for (const troncon of tronconIds) {
    if (!troncon || vus.has(troncon)) continue;
    vus.add(troncon);
    lignes.push({
      id: uuid(),
      marche_id: choix.marcheId,
      troncon_id: troncon,
      date_balayage: choix.dateBalayage,
      equipe_id: choix.equipeId || null,
      methode: choix.methode || null,
      observation: choix.observation?.trim() || null,
      source_saisie: choix.sourceSaisie ?? 'web',
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

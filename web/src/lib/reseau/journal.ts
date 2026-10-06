// Journal des balayages (page /balayage) : filtres, regroupement par jour, totaux. Fonctions pures.
import type { LigneBalayageJournalier } from '@/lib/types';

export interface FiltresJournal {
  du: string;       // AAAA-MM-JJ, '' = sans borne
  au: string;
  equipe: string;   // equipe_id, '' = toutes
  secteur: string;  // secteur_id, '' = tous
}

export interface TotauxJournal {
  nb_troncons: number;
  lineaire_m: number;
  lineaire_repasse_m: number;
  nb_noeuds: number;
  nb_fuites: number;
  jours: number;
}

export const jourValide = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00`).getTime());

/** Jour (AAAA-MM-JJ) à l'heure du Maroc. */
export const jourMaroc = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Africa/Casablanca' });

/** Sept derniers jours (bornes comprises), à l'heure du Maroc. */
export function periodeParDefaut(maintenant = new Date()): { du: string; au: string } {
  const au = jourMaroc(maintenant);
  const du = jourMaroc(new Date(maintenant.getTime() - 6 * 86400000));
  return { du, au };
}

export function filtrerJournal(lignes: LigneBalayageJournalier[], f: Partial<FiltresJournal>): LigneBalayageJournalier[] {
  const du = f.du && jourValide(f.du) ? f.du : '';
  const au = f.au && jourValide(f.au) ? f.au : '';
  const [debut, fin] = du && au && du > au ? [au, du] : [du, au];
  return lignes.filter((l) => {
    if (debut && l.date_balayage < debut) return false;
    if (fin && l.date_balayage > fin) return false;
    if (f.equipe && l.equipe_id !== f.equipe) return false;
    if (f.secteur && l.secteur_id !== f.secteur) return false;
    return true;
  });
}

// `nb_fuites` de la vue est le nombre de fuites du secteur détectées ce jour, répété sur chaque ligne équipe /
// agent du même secteur : il ne compte qu'une fois par jour et par secteur.
export function totauxJournal(lignes: LigneBalayageJournalier[]): TotauxJournal {
  const t: TotauxJournal = { nb_troncons: 0, lineaire_m: 0, lineaire_repasse_m: 0, nb_noeuds: 0, nb_fuites: 0, jours: 0 };
  const jours = new Set<string>();
  const fuitesVues = new Set<string>();
  for (const l of lignes) {
    t.nb_troncons += Number(l.nb_troncons) || 0;
    t.lineaire_m += Number(l.lineaire_m) || 0;
    t.lineaire_repasse_m += Number(l.lineaire_repasse_m) || 0;
    t.nb_noeuds += Number(l.nb_noeuds) || 0;
    const cleFuites = `${l.date_balayage}|${l.secteur_id ?? ''}`;
    if (!fuitesVues.has(cleFuites)) {
      fuitesVues.add(cleFuites);
      t.nb_fuites += Number(l.nb_fuites) || 0;
    }
    jours.add(l.date_balayage);
  }
  t.jours = jours.size;
  return t;
}

/** Lignes groupées par jour, du plus récent au plus ancien ; dans un jour : équipe, agent, zone, secteur. */
export function grouperParJour(lignes: LigneBalayageJournalier[]): { jour: string; lignes: LigneBalayageJournalier[]; totaux: TotauxJournal }[] {
  const parJour = new Map<string, LigneBalayageJournalier[]>();
  for (const l of lignes) parJour.set(l.date_balayage, [...(parJour.get(l.date_balayage) ?? []), l]);
  const cmp = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'fr');
  return [...parJour.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([jour, liste]) => ({
      jour,
      lignes: [...liste].sort((a, b) => cmp(a.equipe, b.equipe) || cmp(a.agent, b.agent) || cmp(a.zone, b.zone) || cmp(a.secteur, b.secteur)),
      totaux: totauxJournal(liste),
    }));
}

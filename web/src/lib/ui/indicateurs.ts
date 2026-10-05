// Indicateurs de la liste des fuites (widgets) : calculs purs, à partir des lignes de v_fuites.
// Jours comptés en heure de Casablanca. Les séries servent aux mini-courbes (une valeur par jour
// ou par semaine, la plus récente en dernier).
import type { VFuite } from '@/lib/types';

export interface Indicateur {
  valeur: number | null;
  commentaire: string;
  serie: number[];
}

const JOUR = 86_400_000;
const jourCasa = (d: Date) => d.toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' });
const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : null);

// Fin de journée (Casablanca) pour les n derniers jours, du plus ancien au plus récent.
function finsDeJour(n: number, maintenant: Date): number[] {
  const fins: number[] = [];
  for (let i = n - 1; i >= 0; i--) fins.push(i === 0 ? maintenant.getTime() : maintenant.getTime() - i * JOUR);
  return fins;
}

export function fuitesDuMois(fuites: Pick<VFuite, 'date_detection'>[], maintenant = new Date()): Indicateur & { mois: string } {
  const mois = jourCasa(maintenant).slice(0, 7);
  const jours = Array.from({ length: 14 }, (_, i) => jourCasa(new Date(maintenant.getTime() - (13 - i) * JOUR)));
  const parJour = new Map(jours.map((j) => [j, 0]));
  let duMois = 0;
  let sept = 0;
  for (const f of fuites) {
    const j = jourCasa(new Date(f.date_detection));
    if (j.startsWith(mois)) duMois++;
    if (parJour.has(j)) parJour.set(j, parJour.get(j)! + 1);
    if (jours.indexOf(j) >= 7) sept++;
  }
  return {
    valeur: duMois,
    commentaire: `${sept} sur les 7 derniers jours`,
    serie: jours.map((j) => parJour.get(j)!),
    mois: maintenant.toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca', month: 'long' }),
  };
}

// Non réparées au-delà du seuil : valeur = alertes du jour ; série = situation à chaque fin de jour.
export function nonReparees(
  fuites: Pick<VFuite, 'date_detection' | 'derniere_reparation_le' | 'statut' | 'alerte_non_reparee'>[],
  seuilH: number, maintenant = new Date(),
): Indicateur {
  const seuil = seuilH * 3_600_000;
  const serie = finsDeJour(14, maintenant).map((fin) => fuites.filter((f) => {
    const det = t(f.date_detection)!;
    const rep = t(f.derniere_reparation_le);
    if (f.statut === 'sans_reparation') return false;
    return det + seuil < fin && (rep == null || rep > fin);
  }).length);
  return { valeur: fuites.filter((f) => f.alerte_non_reparee).length, commentaire: `seuil du marché : ${seuilH} h`, serie };
}

// Délai moyen détection → réparation (heures), sur les réparations des 30 derniers jours ;
// série : moyenne par semaine sur 8 semaines (semaines sans réparation ignorées).
export function delaiReparation(fuites: Pick<VFuite, 'date_detection' | 'derniere_reparation_le'>[], maintenant = new Date()): Indicateur {
  const now = maintenant.getTime();
  const delais = fuites
    .map((f) => ({ rep: t(f.derniere_reparation_le), det: t(f.date_detection)! }))
    .filter((d): d is { rep: number; det: number } => d.rep != null && d.rep >= d.det)
    .map((d) => ({ rep: d.rep, h: (d.rep - d.det) / 3_600_000 }));
  const moyenne = (l: { h: number }[]) => (l.length ? l.reduce((s, d) => s + d.h, 0) / l.length : null);
  const recents = delais.filter((d) => d.rep > now - 30 * JOUR);
  const avant = delais.filter((d) => d.rep <= now - 30 * JOUR && d.rep > now - 60 * JOUR);
  const m = moyenne(recents);
  const p = moyenne(avant);
  const serie: number[] = [];
  for (let s = 7; s >= 0; s--) {
    const v = moyenne(delais.filter((d) => d.rep > now - (s + 1) * 7 * JOUR && d.rep <= now - s * 7 * JOUR));
    if (v != null) serie.push(Math.round(v));
  }
  let commentaire = recents.length ? `${recents.length} réparation${recents.length > 1 ? 's' : ''} sur 30 jours` : 'aucune réparation sur 30 jours';
  if (m != null && p != null) {
    const ecart = Math.round(m - p);
    commentaire = `${ecart > 0 ? '+' : ecart < 0 ? '−' : '±'}${Math.abs(ecart)} h sur les 30 jours précédents`;
  }
  return { valeur: m == null ? null : Math.round(m), commentaire, serie };
}

// Réfections à faire : fuites réparées sans réfection ; série = situation à chaque fin de jour.
export function refectionsAFaire(
  fuites: (Pick<VFuite, 'statut' | 'derniere_reparation_le' | 'derniere_refection_le'> & { emplacement_fouille?: string | null })[],
  maintenant = new Date(),
): Indicateur {
  const aFaire = fuites.filter((f) => f.statut === 'reparee');
  const chaussee = aFaire.filter((f) => f.emplacement_fouille === 'chaussee').length;
  const autres = aFaire.length - chaussee;
  const serie = finsDeJour(14, maintenant).map((fin) => fuites.filter((f) => {
    const rep = t(f.derniere_reparation_le);
    const ref = t(f.derniere_refection_le);
    return (f.statut === 'reparee' || f.statut === 'achevee') && rep != null && rep <= fin && (ref == null || ref > fin);
  }).length);
  return {
    valeur: aFaire.length,
    commentaire: aFaire.length ? `${chaussee} chaussée, ${autres} trottoir ou autre` : 'aucune en attente',
    serie,
  };
}

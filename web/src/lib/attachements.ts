// Types et outils communs aux écrans d'attachement (lots, à attacher, exports).

export interface Lot {
  id: string;
  marche_id: string;
  numero: number | null;
  statut: 'brouillon' | 'arrete';
  intitule: string | null;
  date_arret: string | null;
  periode_debut: string | null;
  periode_fin: string | null;
  zone_id: string | null;
  lieu_travaux: string | null;
  os_id: string | null;
  observation: string | null;
  arrete_le: string | null;
  rouvert_le: string | null;
  motif_reouverture: string | null;
  accepte_le: string | null;
  accepte_par: string | null;
  reference_facture: string | null;
  facture_le: string | null;
  cree_le: string;
}

// Une unité d'œuvre : une fuite × un article du bordereau (vue v_a_attacher).
export interface Unite {
  fuite_id: string;
  fuite_numero: number;
  reference_srm: string | null;
  adresse: string | null;
  statut: string;
  verrouillee: boolean;
  zone_id: string | null;
  zone: string | null;
  secteur_id: string | null;
  secteur: string | null;
  equipe_id: string | null;
  equipe: string | null;
  reparee_le: string | null;
  refectionnee_le: string | null;
  prix_id: string;
  prix_numero: string;
  prix_ordre: number;
  prix_designation: string;
  unite: string;
  famille: string;
  quantite_executee: number;
  quantite_attachee: number;
  quantite_anticipee: number;
  en_attente_refection: boolean;
  reste: number;
  dernier_lot: number | null;
  brouillon_id: string | null;
}

export interface LigneLot {
  id: string;
  attachement_id: string;
  nature: 'solde' | 'anticipation' | 'libre' | 'forcage';
  fuite_id: string | null;
  fuite_numero: number | null;
  reference_srm: string | null;
  adresse: string | null;
  zone: string | null;
  secteur: string | null;
  equipe: string | null;
  reparee_le: string | null;
  fouille_longueur_m: number | null;
  fouille_largeur_m: number | null;
  fouille_profondeur_m: number | null;
  volume_m3: number | null;
  refectionnee_le: string | null;
  surface_refection_m2: number | null;
  prix_id: string;
  prix_numero: string;
  prix_ordre: number;
  prix_designation: string;
  unite: string;
  pu_ht: number | null;
  quantite: number;
  regularisation: boolean;
  regularisation_negative: boolean;
  lot_precedent: number | null;
  designation: string | null;
  motif: string | null;
  prix_refection_prevu: string | null;
}

export interface Recap {
  attachement_id: string;
  prix_id: string;
  prix_numero: string;
  prix_ordre: number;
  prix_designation: string;
  unite: string;
  hors_bordereau: boolean;
  quantite_marche: number | null;
  pu_ht: number | null;
  quantite_anterieure: number;
  quantite_lot: number;
  quantite_cumulee: number;
  pourcentage_marche: number | null;
}

export interface ReglesAttachement {
  periodicite: string;
  titre: string;
  regroupement: 'poste' | 'zone' | 'secteur' | 'equipe';
  fuites_admissibles: 'toutes' | 'verrouillees' | 'achevees';
  refection_anticipee: boolean;
  verrouiller_a_l_arret: boolean;
  afficher_prix: boolean;
  mentions_obligatoires: string[];
  visas: string[];
  decimales: Record<string, number>;
  texte_pied: string | null;
}

export const NATURES_LIGNE: Record<LigneLot['nature'], string> = {
  solde: 'Travaux',
  anticipation: 'Attaché par anticipation',
  libre: 'Ligne libre',
  forcage: 'Refacturation forcée',
};

// Quantité avec le nombre de décimales réglé pour l'unité (règles du marché).
export function quantite(q: number | null | undefined, unite: string, decimales?: Record<string, number>): string {
  if (q == null) return '—';
  const d = decimales?.[unite] ?? (unite === 'u' ? 0 : unite === 'm3' ? 3 : 2);
  return Number(q).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

// Titre du lot selon le modèle du marché : {numero} et {date}.
// Titre du lot ; un brouillon jamais arrêté porte le numéro qu'il prendra à l'arrêt (« prévu »).
export function titreLot(
  modele: string | undefined,
  lot: Pick<Lot, 'numero' | 'date_arret'> & { numero_prevu?: number | null },
): string {
  const numero = lot.numero != null
    ? String(lot.numero).padStart(2, '0')
    : lot.numero_prevu != null ? `${String(lot.numero_prevu).padStart(2, '0')} (prévu)` : '…';
  const date = lot.date_arret ? new Date(`${lot.date_arret}T12:00:00`).toLocaleDateString('fr-FR') : '…';
  return (modele || 'ATTACHEMENT N° {numero} des travaux exécutés au {date}')
    .replace('{numero}', numero)
    .replace('{date}', date);
}

// Dernier jour du mois courant (date « travaux exécutés au » proposée).
export function finDuMois(): string {
  const maintenant = new Date();
  const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0);
  return `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`;
}

export const moisAnnee = (d: Date = new Date()) =>
  d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Africa/Casablanca' });

// « de mars 2026 », « d'août 2026 », « d'octobre 2026 »
export const duMois = (mois = moisAnnee()) => (/^[aeiouyéh]/i.test(mois) ? `d'${mois}` : `de ${mois}`);

// Intitulé proposé pour un lot mensuel dont les travaux sont arrêtés à la date donnée (AAAA-MM-JJ).
export const intituleMensuel = (date?: string | null) =>
  `Attachement ${duMois(date ? moisAnnee(new Date(`${date}T12:00:00`)) : undefined)}`;

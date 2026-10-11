// Écran Rapports (chantier v3, J1) : états journaliers et hebdomadaires communiqués à la SRM. Pas de gabarit figé
// (réponse 15 d'Issam) : période, rubriques à cocher, filtres, colonnes à cocher par rubrique, A4 portrait ou
// paysage, PDF ou Excel. Le document est un DocumentExport ordinaire (une section par tableau) : les générateurs
// PDF et Excel des exports le fabriquent. Matricule à la place du nom dans le document (R4, posé au chargement).
// Réglages gardés en modèles par marché dans `modeles_export` (jeu « fuites », `filtres.document` = « rapports »,
// sans migration ; ignorés par le panneau « Exporter » et par les rubriques des autres documents).
// Fonctions pures, vérifiées par scripts/verifier-rapports.mjs ; chargement : rapports-donnees.ts.
import { TYPES_CAMPAGNE, type TypeCampagne } from '@/lib/debits';
import { EMPLACEMENTS, MATERIAUX, OUVRAGES, STATUTS, libellesMarche } from '@/lib/format';
import type { Marche, StatutFuite } from '@/lib/types';
import { construireEntete, type Contexte } from './jeux';
import { construireSection, parcourir, texteCellule, type Colonne, type DocumentExport, type Ligne, type SectionDoc } from './modele';
import { jourMaroc } from '@/lib/heure-maroc';

export type TypePeriode = 'jour' | 'semaine' | 'libre';
export type CleRubrique = 'synthese' | 'fuites' | 'reparations' | 'refections' | 'balayage' | 'debits' | 'pieces' | 'attente';
export type Filtre = 'zone' | 'secteur' | 'statut' | 'personne' | 'validees';
export type Orientation = 'portrait' | 'paysage';
export type FormatRapport = 'pdf' | 'xlsx';

export interface Droits { balayage?: boolean; mesures_debit?: boolean; quantites?: boolean }

export interface ColonneRapport extends Colonne {
  defaut?: boolean;
  /** Proposée seulement avec ce droit (montants des pénalités : « quantités / lire »). */
  droit?: 'quantites';
}
export interface TableauRapport { cle: string; titre: string; colonnes: ColonneRapport[] }
export interface RubriqueRapport {
  cle: CleRubrique;
  libelle: string;
  aide: string;
  droit?: 'balayage' | 'mesures_debit';
  /** Filtres qui s'appliquent à la rubrique (les autres sont sans effet sur elle). */
  filtres: Filtre[];
  tableaux: (lm: LibellesMarche) => TableauRapport[];
}

export interface FiltresRapport {
  zone?: string;
  secteur?: string;
  statut?: StatutFuite;
  /** Chef d'équipe (réparations, réfections, pièces) ou agent (détection, balayage) : le compte (S12). */
  personne?: string;
  validees?: boolean;
}

export interface ChoixRapport {
  periode: TypePeriode;
  /** Dates libres seulement (jour et semaine se recalculent à l'ouverture). */
  du?: string;
  au?: string;
  rubriques: CleRubrique[];
  colonnes: Partial<Record<CleRubrique, string[]>>;
  filtres: FiltresRapport;
  orientation: Orientation;
  format: FormatRapport;
  visas: boolean;
  titre?: string;
}

/** Lignes déjà enrichies (fuite, libellés, matricules) par rapports-donnees.ts, avant filtres. */
export interface DonneesRapport {
  fuites: Ligne[];
  reparations: Ligne[];
  refections: Ligne[];
  balayage: Ligne[];
  debitsNuits: Ligne[];
  debitsSituation: Ligne[];
  pieces: Ligne[];
  attente: Ligne[];
}

type LibellesMarche = ReturnType<typeof libellesMarche>;

// ---------------------------------------------------------------------------
// Période (jours du Maroc, AAAA-MM-JJ)
// ---------------------------------------------------------------------------
export const PERIODES: Record<TypePeriode, string> = { jour: 'Jour', semaine: 'Semaine', libre: 'Dates libres' };

export const aujourdhui = () => jourMaroc(new Date());
export const ajouterJours = (t: string, n: number) => {
  const d = new Date(`${t}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dateValide = (t: unknown): t is string => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T12:00:00Z`));
/** Jour du Maroc d'un horodatage (avant le 2026-09-20, une réparation saisie à 23 h 30 UTC appartenait au lendemain). */
export const jourCasablanca = (v: unknown) => (v ? jourMaroc(String(v)) : '');

/** Bornes de la période : jour = la date ; semaine = du lundi au dimanche de la date ; libre = du… au… (remis dans l'ordre). */
export function bornesPeriode(type: TypePeriode, reference: string, du?: string, au?: string): { du: string; au: string } {
  const ref = dateValide(reference) ? reference : aujourdhui();
  if (type === 'semaine') {
    const decalage = (new Date(`${ref}T12:00:00Z`).getUTCDay() + 6) % 7;
    const lundi = ajouterJours(ref, -decalage);
    return { du: lundi, au: ajouterJours(lundi, 6) };
  }
  if (type === 'libre') {
    const a = dateValide(du) ? du : ref;
    const b = dateValide(au) ? au : a;
    return a <= b ? { du: a, au: b } : { du: b, au: a };
  }
  return { du: ref, au: ref };
}

const dateFr = (t: string) => new Date(`${t}T12:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' });

export function titreRapport(type: TypePeriode, p: { du: string; au: string }): string {
  if (p.du === p.au) return `État journalier du ${dateFr(p.du)}`;
  if (type === 'semaine') return `État hebdomadaire du ${dateFr(p.du)} au ${dateFr(p.au)}`;
  return `État de la période du ${dateFr(p.du)} au ${dateFr(p.au)}`;
}

export const libellePeriode = (p: { du: string; au: string }) =>
  p.du === p.au ? `Journée du ${dateFr(p.du)}` : `Période du ${dateFr(p.du)} au ${dateFr(p.au)}`;

// ---------------------------------------------------------------------------
// Libellés
// ---------------------------------------------------------------------------
const RESULTATS: Record<string, string> = { reparee: 'Réparée', en_cours: 'En cours', non_reparee: 'Non réparée', faite: 'Faite', non_faite: 'Non faite' };
const ouiNon = (v: unknown) => (v ? 'Oui' : 'Non');
const de = (table: Record<string, string>, cle: string) => (l: Ligne) => {
  const v = l[cle];
  return v == null ? null : table[String(v)] ?? String(v);
};
const statut = (l: Ligne) => STATUTS[l.statut as StatutFuite]?.libelle ?? (l.statut == null ? null : String(l.statut));
// Polices standard du PDF (WinAnsi) : ni espace fine ni insécable étroite.
const nombreTexte = (n: number, dec = 0) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/[  ]/g, ' ');

function alertes(lm: LibellesMarche) {
  return (l: Ligne) => [
    ['alerte_non_reparee', `Non réparée après ${lm.delaiReparationH} h`],
    ['alerte_communication_srm', `Non communiquée à ${lm.sigle}`],
    ['refection_chaussee_hors_delai', 'Réfection chaussée hors délai'],
    ['alerte_refection_chaussee', 'Réfection chaussée à faire'],
    ['alerte_refection_trottoir', 'Réfection trottoir à faire'],
    ['alerte_sans_photo', 'Sans photo'],
  ].filter(([k]) => l[k] === true).map(([, t]) => t).join(', ');
}
export const enAlerte = (l: Ligne) =>
  ['alerte_non_reparee', 'alerte_communication_srm', 'refection_chaussee_hors_delai', 'alerte_refection_chaussee', 'alerte_refection_trottoir', 'alerte_sans_photo']
    .some((k) => l[k] === true);

function mesureNuit(l: Ligne): string {
  if (l.complete === false) return 'Incomplète';
  return l.approchee ? 'Approchée (somme des minimums)' : 'Complète';
}

function remarquesSituation(l: Ligne): string {
  return [
    l.alerte_arret && 'Arrêt de zone (Tau 1)',
    l.alerte_degradation && 'Dégradation des gains',
    l.qi_approche && 'Qi approché',
    l.qf_approche && 'Qf approché',
    l.ecart_controles_max_j != null && Number(l.ecart_controles_max_j) > 7 && `Contrôles espacés de ${l.ecart_controles_max_j} j`,
  ].filter(Boolean).join(', ');
}

// ---------------------------------------------------------------------------
// Rubriques, tableaux et colonnes (cochées par défaut : `defaut`)
// ---------------------------------------------------------------------------
const c = (o: ColonneRapport): ColonneRapport => o;

export const RUBRIQUES_RAPPORT: readonly RubriqueRapport[] = [
  {
    cle: 'synthese', libelle: 'Synthèse', aide: 'chiffres clés des rubriques cochées', filtres: ['zone', 'secteur', 'statut', 'personne', 'validees'],
    tableaux: () => [{
      cle: 'synthese', titre: 'Synthèse', colonnes: [
        c({ cle: 'rubrique', titre: 'Rubrique', groupe: 'Synthèse', largeur: 26, defaut: true }),
        c({ cle: 'nombre', titre: 'Nombre', groupe: 'Synthèse', type: 'nombre', largeur: 9, defaut: true }),
        c({ cle: 'detail', titre: 'Détail', groupe: 'Synthèse', largeur: 50, defaut: true }),
      ],
    }],
  },
  {
    cle: 'fuites', libelle: 'Fuites détectées', aide: 'détectées sur la période', filtres: ['zone', 'secteur', 'statut', 'personne', 'validees'],
    tableaux: (lm) => [{
      cle: 'fuites', titre: 'Fuites détectées', colonnes: [
        c({ cle: 'numero', titre: 'N°', groupe: 'Fuites', type: 'nombre', largeur: 6, defaut: true }),
        c({ cle: 'reference_srm', titre: lm.reference, groupe: 'Fuites', largeur: 13, defaut: true }),
        c({ cle: 'date_detection', titre: 'Détectée le', groupe: 'Fuites', type: 'dateheure', largeur: 14, defaut: true }),
        c({ cle: 'zone', titre: 'Zone', groupe: 'Fuites', largeur: 16 }),
        c({ cle: 'secteur', titre: 'Secteur', groupe: 'Fuites', largeur: 16, defaut: true }),
        c({ cle: 'adresse', titre: 'Adresse', groupe: 'Fuites', largeur: 22, defaut: true }),
        c({ cle: 'ouvrage', titre: 'Ouvrage', groupe: 'Fuites', largeur: 12, valeur: de(OUVRAGES, 'ouvrage'), defaut: true }),
        c({ cle: 'visibilite', titre: 'Visibilité', groupe: 'Fuites', largeur: 10, valeur: de({ visible: 'Visible', invisible: 'Invisible' }, 'visibilite') }),
        c({ cle: 'statut', titre: 'Statut', groupe: 'Fuites', largeur: 16, valeur: statut, defaut: true }),
        c({ cle: 'detectee_par', titre: 'Détectée par (matricule)', groupe: 'Fuites', largeur: 14, defaut: true }),
        c({ cle: 'origine', titre: 'Origine', groupe: 'Fuites', largeur: 12, valeur: (l) => (l.origine === 'srm' ? `Signalée par ${lm.sigle}` : 'Entreprise') }),
        c({ cle: 'nb_photos', titre: 'Photos', groupe: 'Fuites', type: 'nombre', largeur: 7 }),
        ...(lm.jalons ? [c({ cle: 'date_communication_srm', titre: `Communiquée à ${lm.sigle} le`, groupe: 'Fuites', type: 'dateheure', largeur: 14 })] : []),
        c({ cle: 'validee', titre: 'Validée', groupe: 'Fuites', largeur: 8, valeur: (l) => ouiNon(l.validee_le) }),
        c({ cle: 'latitude', titre: 'Latitude', groupe: 'Fuites', type: 'nombre', decimales: 6, largeur: 10 }),
        c({ cle: 'longitude', titre: 'Longitude', groupe: 'Fuites', type: 'nombre', decimales: 6, largeur: 10 }),
        c({ cle: 'observation', titre: 'Observation', groupe: 'Fuites', largeur: 24 }),
      ],
    }],
  },
  {
    cle: 'reparations', libelle: 'Réparations', aide: 'interventions faites sur la période', filtres: ['zone', 'secteur', 'statut', 'personne', 'validees'],
    tableaux: (lm) => [{
      cle: 'reparations', titre: 'Réparations', colonnes: [
        c({ cle: 'realisee_le', titre: 'Le', groupe: 'Réparations', type: 'dateheure', largeur: 14, defaut: true }),
        c({ cle: 'fuite_numero', titre: 'N° fuite', groupe: 'Réparations', type: 'nombre', largeur: 7, defaut: true }),
        c({ cle: 'reference_srm', titre: lm.reference, groupe: 'Réparations', largeur: 13, defaut: true }),
        c({ cle: 'zone', titre: 'Zone', groupe: 'Réparations', largeur: 16 }),
        c({ cle: 'secteur', titre: 'Secteur', groupe: 'Réparations', largeur: 16, defaut: true }),
        c({ cle: 'adresse', titre: 'Adresse', groupe: 'Réparations', largeur: 22 }),
        c({ cle: 'resultat', titre: 'Résultat', groupe: 'Réparations', largeur: 11, valeur: de(RESULTATS, 'resultat'), defaut: true }),
        c({ cle: 'ouvrage', titre: 'Ouvrage constaté', groupe: 'Réparations', largeur: 12, valeur: de(OUVRAGES, 'ouvrage') }),
        c({ cle: 'materiau', titre: 'Matériau', groupe: 'Réparations', largeur: 14, valeur: de(MATERIAUX, 'materiau'), defaut: true }),
        c({ cle: 'diametre_mm', titre: 'DN (mm)', groupe: 'Réparations', type: 'nombre', largeur: 7, defaut: true }),
        c({ cle: 'fouille_longueur_m', titre: 'L (m)', groupe: 'Réparations', type: 'nombre', decimales: 2, largeur: 6 }),
        c({ cle: 'fouille_largeur_m', titre: 'l (m)', groupe: 'Réparations', type: 'nombre', decimales: 2, largeur: 6 }),
        c({ cle: 'fouille_profondeur_m', titre: 'P (m)', groupe: 'Réparations', type: 'nombre', decimales: 2, largeur: 6 }),
        c({ cle: 'volume_m3', titre: 'Volume (m3)', groupe: 'Réparations', type: 'nombre', decimales: 3, total: true, largeur: 9, defaut: true }),
        c({ cle: 'longueur_pe_m', titre: 'PE (m)', groupe: 'Réparations', type: 'nombre', decimales: 2, total: true, largeur: 7 }),
        c({ cle: 'emplacement', titre: 'Emplacement', groupe: 'Réparations', largeur: 12, valeur: de(EMPLACEMENTS, 'emplacement'), defaut: true }),
        c({ cle: 'revetement', titre: 'Revêtement', groupe: 'Réparations', largeur: 14 }),
        c({ cle: 'chef', titre: "Chef d'équipe (matricule)", groupe: 'Réparations', largeur: 14, defaut: true }),
        c({ cle: 'representant_srm', titre: `Représentant ${lm.sigle}`, groupe: 'Réparations', largeur: 14 }),
        c({ cle: 'motif', titre: 'Motif (non réparée)', groupe: 'Réparations', largeur: 18 }),
        c({ cle: 'validee', titre: 'Validée', groupe: 'Réparations', largeur: 8, valeur: (l) => ouiNon(l.validee_le) }),
        c({ cle: 'observation', titre: 'Observation', groupe: 'Réparations', largeur: 22 }),
      ],
    }],
  },
  {
    cle: 'refections', libelle: 'Réfections', aide: 'réfections faites sur la période', filtres: ['zone', 'secteur', 'statut', 'personne', 'validees'],
    tableaux: (lm) => [{
      cle: 'refections', titre: 'Réfections', colonnes: [
        c({ cle: 'realisee_le', titre: 'Le', groupe: 'Réfections', type: 'dateheure', largeur: 14, defaut: true }),
        c({ cle: 'fuite_numero', titre: 'N° fuite', groupe: 'Réfections', type: 'nombre', largeur: 7, defaut: true }),
        c({ cle: 'reference_srm', titre: lm.reference, groupe: 'Réfections', largeur: 13, defaut: true }),
        c({ cle: 'zone', titre: 'Zone', groupe: 'Réfections', largeur: 16 }),
        c({ cle: 'secteur', titre: 'Secteur', groupe: 'Réfections', largeur: 16, defaut: true }),
        c({ cle: 'adresse', titre: 'Adresse', groupe: 'Réfections', largeur: 22, defaut: true }),
        c({ cle: 'resultat', titre: 'Résultat', groupe: 'Réfections', largeur: 10, valeur: de(RESULTATS, 'resultat'), defaut: true }),
        c({ cle: 'nature', titre: 'Nature', groupe: 'Réfections', largeur: 18, defaut: true }),
        c({ cle: 'longueur_m', titre: 'L (m)', groupe: 'Réfections', type: 'nombre', decimales: 2, largeur: 6 }),
        c({ cle: 'largeur_m', titre: 'l (m)', groupe: 'Réfections', type: 'nombre', decimales: 2, largeur: 6 }),
        c({ cle: 'surface_m2', titre: 'Surface (m2)', groupe: 'Réfections', type: 'nombre', decimales: 2, total: true, largeur: 9, defaut: true }),
        c({ cle: 'chef', titre: "Chef d'équipe (matricule)", groupe: 'Réfections', largeur: 14, defaut: true }),
        c({ cle: 'motif', titre: 'Motif (non faite)', groupe: 'Réfections', largeur: 18 }),
        c({ cle: 'validee', titre: 'Validée', groupe: 'Réfections', largeur: 8, valeur: (l) => ouiNon(l.validee_le) }),
        c({ cle: 'observation', titre: 'Observation', groupe: 'Réfections', largeur: 22 }),
      ],
    }],
  },
  {
    cle: 'balayage', libelle: 'Balayage', aide: 'linéaire inspecté par jour, agent et secteur', droit: 'balayage', filtres: ['zone', 'secteur', 'personne'],
    tableaux: () => [{
      cle: 'balayage', titre: 'Balayage du réseau', colonnes: [
        c({ cle: 'date_balayage', titre: 'Date', groupe: 'Balayage', type: 'date', largeur: 10, defaut: true }),
        c({ cle: 'agent', titre: 'Agent (matricule)', groupe: 'Balayage', largeur: 14, defaut: true }),
        c({ cle: 'zone', titre: 'Zone', groupe: 'Balayage', largeur: 16, defaut: true }),
        c({ cle: 'secteur', titre: 'Secteur', groupe: 'Balayage', largeur: 16, defaut: true }),
        c({ cle: 'nb_troncons', titre: 'Tronçons', groupe: 'Balayage', type: 'nombre', total: true, largeur: 8 }),
        c({ cle: 'lineaire_m', titre: 'Linéaire (m)', groupe: 'Balayage', type: 'nombre', decimales: 2, total: true, largeur: 10, defaut: true }),
        c({ cle: 'lineaire_repasse_m', titre: 'Repassé (m)', groupe: 'Balayage', type: 'nombre', decimales: 2, total: true, largeur: 10, defaut: true }),
        c({ cle: 'nb_noeuds', titre: 'Nœuds', groupe: 'Balayage', type: 'nombre', total: true, largeur: 7 }),
        c({ cle: 'nb_fuites', titre: 'Fuites', groupe: 'Balayage', type: 'nombre', total: true, largeur: 7, defaut: true }),
      ],
    }],
  },
  {
    cle: 'debits', libelle: 'Débits de nuit', aide: 'nuits de la période et situation des performances', droit: 'mesures_debit', filtres: ['zone'],
    tableaux: () => [
      {
        cle: 'nuits', titre: 'Débits de nuit : nuits de la période', colonnes: [
          c({ cle: 'nuit', titre: 'Nuit', groupe: 'Nuits de la période', type: 'date', largeur: 10, defaut: true }),
          c({ cle: 'campagne', titre: 'Campagne', groupe: 'Nuits de la période', largeur: 10, defaut: true,
            valeur: (l) => TYPES_CAMPAGNE[l.campagne_type as TypeCampagne]?.court ?? (l.campagne_type == null ? null : String(l.campagne_type)) }),
          c({ cle: 'zone', titre: 'Zone', groupe: 'Nuits de la période', largeur: 16, defaut: true, valeur: (l) => l.zone_libelle ?? l.zone }),
          c({ cle: 'q_zone_m3h', titre: 'Débit de la zone (m3/h)', groupe: 'Nuits de la période', type: 'nombre', decimales: 2, largeur: 11, defaut: true }),
          c({ cle: 'mesure', titre: 'Mesure', groupe: 'Nuits de la période', largeur: 16, valeur: mesureNuit, defaut: true }),
          c({ cle: 'points', titre: 'Points mesurés', groupe: 'Nuits de la période', largeur: 9, defaut: true,
            valeur: (l) => `${l.nb_points_mesures ?? 0} / ${l.nb_points ?? 0}` }),
          c({ cle: 'nb_a_valider', titre: 'À valider', groupe: 'Nuits de la période', type: 'nombre', largeur: 7 }),
        ],
      },
      {
        cle: 'situation', titre: 'Débits de nuit : situation des performances', colonnes: [
          c({ cle: 's_zone', titre: 'Zone', groupe: 'Situation des performances', largeur: 16, defaut: true, valeur: (l) => l.zone }),
          c({ cle: 's_q_exige', titre: 'Q exigé (m3/h)', groupe: 'Situation des performances', type: 'nombre', decimales: 2, largeur: 9, defaut: true, valeur: (l) => l.q_exige_m3h }),
          c({ cle: 's_qi', titre: 'Qi (m3/h)', groupe: 'Situation des performances', type: 'nombre', decimales: 2, largeur: 9, defaut: true, valeur: (l) => l.qi_m3h }),
          c({ cle: 's_qf', titre: 'Qf (m3/h)', groupe: 'Situation des performances', type: 'nombre', decimales: 2, largeur: 9, defaut: true, valeur: (l) => l.qf_m3h }),
          c({ cle: 's_delta', titre: 'Gain dQ (m3/h)', groupe: 'Situation des performances', type: 'nombre', decimales: 2, largeur: 9, defaut: true, valeur: (l) => l.delta_q_m3h }),
          c({ cle: 's_tau1', titre: 'Tau 1 (%)', groupe: 'Situation des performances', type: 'nombre', decimales: 2, largeur: 8, defaut: true, valeur: (l) => l.tau1_pct }),
          c({ cle: 's_pen_bal', titre: 'Pénalité balayage', groupe: 'Situation des performances', type: 'montant', largeur: 11, droit: 'quantites', valeur: (l) => l.penalite_balayage }),
          c({ cle: 's_moyenne', titre: 'Moyenne des contrôles (m3/h)', groupe: 'Situation des performances', type: 'nombre', decimales: 2, largeur: 10, valeur: (l) => l.q_maintien_moyen_m3h }),
          c({ cle: 's_dernier', titre: 'Dernier contrôle', groupe: 'Situation des performances', type: 'date', largeur: 10, valeur: (l) => l.dernier_controle }),
          c({ cle: 's_tau2', titre: 'Tau 2 (%)', groupe: 'Situation des performances', type: 'nombre', decimales: 2, largeur: 8, defaut: true, valeur: (l) => l.tau2_pct }),
          c({ cle: 's_pen_maint', titre: 'Pénalité maintien', groupe: 'Situation des performances', type: 'montant', largeur: 11, droit: 'quantites', valeur: (l) => l.penalite_maintien }),
          c({ cle: 's_remarques', titre: 'Alertes et remarques', groupe: 'Situation des performances', largeur: 24, defaut: true, valeur: remarquesSituation }),
        ],
      },
    ],
  },
  {
    cle: 'pieces', libelle: 'Pièces posées', aide: 'articles posés par les réparations de la période', filtres: ['zone', 'secteur', 'statut', 'personne', 'validees'],
    tableaux: (lm) => [{
      cle: 'pieces', titre: 'Pièces posées', colonnes: [
        c({ cle: 'jour', titre: 'Posée le', groupe: 'Pièces', type: 'date', largeur: 10, defaut: true }),
        c({ cle: 'fuite_numero', titre: 'N° fuite', groupe: 'Pièces', type: 'nombre', largeur: 7, defaut: true }),
        c({ cle: 'reference_srm', titre: lm.reference, groupe: 'Pièces', largeur: 13 }),
        c({ cle: 'zone', titre: 'Zone', groupe: 'Pièces', largeur: 16 }),
        c({ cle: 'secteur', titre: 'Secteur', groupe: 'Pièces', largeur: 16, defaut: true }),
        c({ cle: 'chef', titre: "Chef d'équipe (matricule)", groupe: 'Pièces', largeur: 14, defaut: true }),
        c({ cle: 'designation', titre: 'Pièce', groupe: 'Pièces', largeur: 30, defaut: true }),
        c({ cle: 'famille', titre: 'Famille', groupe: 'Pièces', largeur: 16 }),
        c({ cle: 'unite', titre: 'Unité', groupe: 'Pièces', largeur: 6, defaut: true }),
        c({ cle: 'quantite', titre: 'Quantité', groupe: 'Pièces', type: 'quantite', uniteCle: 'unite', total: true, largeur: 9, defaut: true }),
      ],
    }],
  },
  {
    cle: 'attente', libelle: 'Fuites en attente et alertes', aide: 'non réparées ou en alerte, à la date d\'édition', filtres: ['zone', 'secteur', 'statut', 'personne', 'validees'],
    tableaux: (lm) => [{
      cle: 'attente', titre: 'Fuites en attente et alertes', colonnes: [
        c({ cle: 'numero', titre: 'N°', groupe: 'En attente', type: 'nombre', largeur: 6, defaut: true }),
        c({ cle: 'reference_srm', titre: lm.reference, groupe: 'En attente', largeur: 13, defaut: true }),
        c({ cle: 'date_detection', titre: 'Détectée le', groupe: 'En attente', type: 'dateheure', largeur: 14, defaut: true }),
        c({ cle: 'age_jours', titre: 'Depuis (jours)', groupe: 'En attente', type: 'nombre', largeur: 8, defaut: true }),
        c({ cle: 'zone', titre: 'Zone', groupe: 'En attente', largeur: 16 }),
        c({ cle: 'secteur', titre: 'Secteur', groupe: 'En attente', largeur: 16, defaut: true }),
        c({ cle: 'adresse', titre: 'Adresse', groupe: 'En attente', largeur: 22, defaut: true }),
        c({ cle: 'statut', titre: 'Statut', groupe: 'En attente', largeur: 16, valeur: statut, defaut: true }),
        c({ cle: 'detectee_par', titre: 'Détectée par (matricule)', groupe: 'En attente', largeur: 14 }),
        c({ cle: 'alertes', titre: 'Alertes', groupe: 'En attente', largeur: 26, valeur: alertes(lm), defaut: true }),
        c({ cle: 'validee', titre: 'Validée', groupe: 'En attente', largeur: 8, valeur: (l) => ouiNon(l.validee_le) }),
        c({ cle: 'observation', titre: 'Observation', groupe: 'En attente', largeur: 22 }),
      ],
    }],
  },
];

const PAR_CLE = new Map(RUBRIQUES_RAPPORT.map((r) => [r.cle, r]));
export const rubrique = (cle: CleRubrique) => PAR_CLE.get(cle)!;
const lmDe = (marche?: unknown) => libellesMarche((marche ?? null) as Marche | null);

/** Rubriques proposées au compte (balayage et débits : selon ses droits). */
export function rubriquesVisibles(droits: Droits = {}): RubriqueRapport[] {
  return RUBRIQUES_RAPPORT.filter((r) => !r.droit || droits[r.droit]);
}

/** Colonnes d'une rubrique proposées au compte (montants des pénalités : « quantités / lire »). */
export function colonnesRubrique(cle: CleRubrique, droits: Droits = {}, marche?: unknown): { tableau: TableauRapport; colonnes: ColonneRapport[] }[] {
  return rubrique(cle).tableaux(lmDe(marche)).map((t) => ({ tableau: t, colonnes: t.colonnes.filter((x) => !x.droit || droits[x.droit]) }));
}

export function colonnesParDefaut(cle: CleRubrique): string[] {
  return rubrique(cle).tableaux(lmDe()).flatMap((t) => t.colonnes.filter((x) => x.defaut).map((x) => x.cle));
}

export function choixParDefaut(): ChoixRapport {
  return {
    periode: 'jour',
    rubriques: RUBRIQUES_RAPPORT.map((r) => r.cle),
    colonnes: Object.fromEntries(RUBRIQUES_RAPPORT.map((r) => [r.cle, colonnesParDefaut(r.cle)])),
    filtres: {},
    orientation: 'paysage',
    format: 'pdf',
    visas: true,
  };
}

// ---------------------------------------------------------------------------
// Choix gardés : lecture tolérante d'un modèle (ancien, modifié à la main, d'une autre version)
// ---------------------------------------------------------------------------
const STATUTS_CONNUS = Object.keys(STATUTS) as StatutFuite[];
const texteOuRien = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export function normaliserChoix(brut: unknown): ChoixRapport {
  const defaut = choixParDefaut();
  if (!brut || typeof brut !== 'object') return defaut;
  const b = brut as Record<string, unknown>;
  const connues = new Set<string>(RUBRIQUES_RAPPORT.map((r) => r.cle));
  const rubriques = Array.isArray(b.rubriques)
    ? RUBRIQUES_RAPPORT.map((r) => r.cle).filter((k) => (b.rubriques as unknown[]).includes(k))
    : defaut.rubriques;
  const colonnes: ChoixRapport['colonnes'] = { ...defaut.colonnes };
  if (b.colonnes && typeof b.colonnes === 'object') {
    for (const [k, v] of Object.entries(b.colonnes as Record<string, unknown>)) {
      if (!connues.has(k) || !Array.isArray(v)) continue;
      const permises = new Set(rubrique(k as CleRubrique).tableaux(lmDe()).flatMap((t) => t.colonnes.map((x) => x.cle)));
      colonnes[k as CleRubrique] = v.filter((x): x is string => typeof x === 'string' && permises.has(x));
    }
  }
  const f = (b.filtres && typeof b.filtres === 'object' ? b.filtres : {}) as Record<string, unknown>;
  const periode = (['jour', 'semaine', 'libre'] as const).includes(b.periode as TypePeriode) ? (b.periode as TypePeriode) : defaut.periode;
  return {
    periode,
    ...(periode === 'libre' && dateValide(b.du) ? { du: b.du } : {}),
    ...(periode === 'libre' && dateValide(b.au) ? { au: b.au } : {}),
    rubriques,
    colonnes,
    filtres: {
      ...(texteOuRien(f.zone) ? { zone: texteOuRien(f.zone) } : {}),
      ...(texteOuRien(f.secteur) ? { secteur: texteOuRien(f.secteur) } : {}),
      ...(STATUTS_CONNUS.includes(f.statut as StatutFuite) ? { statut: f.statut as StatutFuite } : {}),
      ...(texteOuRien(f.personne) ? { personne: texteOuRien(f.personne) } : {}),
      ...(f.validees === true ? { validees: true } : {}),
    },
    orientation: b.orientation === 'portrait' ? 'portrait' : 'paysage',
    format: b.format === 'xlsx' ? 'xlsx' : 'pdf',
    visas: b.visas !== false,
    ...(texteOuRien(b.titre) ? { titre: texteOuRien(b.titre) } : {}),
  };
}

export const DOCUMENT_RAPPORTS = 'rapports';
/** Nom réservé de la ligne qui garde le dernier choix du marché (unique par marché dans `modeles_export`). */
export const NOM_DERNIER_CHOIX = 'Rapports : dernier choix';

export interface LigneModele { id?: string; nom?: string; colonnes?: string[] | null; filtres?: unknown; format?: string | null; orientation?: string | null }

/** Colonnes d'une ligne de `modeles_export` (jeu « fuites », contrôles de la table respectés). */
export function versModele(choix: ChoixRapport, dernier = false) {
  const { rubriques, format, orientation, ...reste } = choix;
  return {
    jeu: 'fuites' as const,
    regroupement: 'aucun' as const,
    colonnes: rubriques,
    format,
    orientation,
    filtres: { document: DOCUMENT_RAPPORTS, ...(dernier ? { dernier: true } : {}), ...reste },
  };
}

export function depuisModele(l: LigneModele): ChoixRapport {
  const f = (l.filtres && typeof l.filtres === 'object' ? l.filtres : {}) as Record<string, unknown>;
  return normaliserChoix({ ...f, rubriques: l.colonnes ?? undefined, format: l.format, orientation: l.orientation });
}

export const estModeleRapport = (l: { filtres?: unknown }) =>
  !!l.filtres && typeof l.filtres === 'object' && (l.filtres as { document?: unknown }).document === DOCUMENT_RAPPORTS;
export const estDernierChoix = (l: { filtres?: unknown }) => estModeleRapport(l) && (l.filtres as { dernier?: unknown }).dernier === true;

// Repli sur l'appareil (compte sans droit d'enregistrer de modèle, base injoignable).
const cleLocale = (marcheId: string) => `suivi-fuites:rapports:${marcheId}`;
export function dernierChoixLocal(marcheId: string): ChoixRapport | null {
  try {
    const brut = typeof localStorage === 'undefined' ? null : localStorage.getItem(cleLocale(marcheId));
    return brut ? normaliserChoix(JSON.parse(brut)) : null;
  } catch {
    return null;
  }
}
export function memoriserChoixLocal(marcheId: string, choix: ChoixRapport) {
  try {
    localStorage.setItem(cleLocale(marcheId), JSON.stringify(choix));
  } catch {
    // stockage indisponible : sans effet
  }
}

// ---------------------------------------------------------------------------
// Filtres
// ---------------------------------------------------------------------------
const CHAMP_PERSONNE: Record<CleRubrique, string | null> = {
  synthese: null, fuites: 'auteur_terrain_id', reparations: 'auteur_terrain_id', refections: 'auteur_terrain_id',
  balayage: 'agent_id', debits: null, pieces: 'chef_id', attente: 'auteur_terrain_id',
};

export function filtrerLignes(cle: CleRubrique, lignes: Ligne[], f: FiltresRapport): Ligne[] {
  const r = rubrique(cle);
  const actif = (k: Filtre) => r.filtres.includes(k);
  const personne = CHAMP_PERSONNE[cle];
  return lignes.filter((l) =>
    (!f.zone || !actif('zone') || l.zone_id === f.zone)
    && (!f.secteur || !actif('secteur') || l.secteur_id === f.secteur)
    && (!f.statut || !actif('statut') || l.statut === f.statut)
    && (!f.personne || !actif('personne') || !personne || l[personne] === f.personne)
    && (!f.validees || !actif('validees') || !!l.validee_le));
}

/** Situation des débits : avec un filtre de zone, la zone seule (la ligne du marché n'a plus de sens). */
export function filtrerSituation(lignes: Ligne[], f: FiltresRapport): Ligne[] {
  return f.zone ? lignes.filter((l) => l.niveau === 'zone' && l.zone_id === f.zone) : lignes;
}

export function filtrerDonnees(d: DonneesRapport, f: FiltresRapport): DonneesRapport {
  return {
    fuites: filtrerLignes('fuites', d.fuites, f),
    reparations: filtrerLignes('reparations', d.reparations, f),
    refections: filtrerLignes('refections', d.refections, f),
    balayage: filtrerLignes('balayage', d.balayage, f),
    debitsNuits: filtrerLignes('debits', d.debitsNuits, f),
    debitsSituation: filtrerSituation(d.debitsSituation, f),
    pieces: filtrerLignes('pieces', d.pieces, f),
    attente: filtrerLignes('attente', d.attente, f),
  };
}

// ---------------------------------------------------------------------------
// Synthèse (chiffres des rubriques cochées, après filtres)
// ---------------------------------------------------------------------------
const somme = (lignes: Ligne[], cle: string) => lignes.reduce((s, l) => s + (Number(l[cle]) || 0), 0);
const compter = (lignes: Ligne[], cle: string, valeur: unknown) => lignes.filter((l) => l[cle] === valeur).length;
const pluriel = (n: number, un: string, plusieurs = `${un}s`) => `${nombreTexte(n)} ${n > 1 ? plusieurs : un}`;

export function lignesSynthese(d: DonneesRapport, rubriques: readonly CleRubrique[]): Ligne[] {
  const avec = (k: CleRubrique) => rubriques.includes(k);
  const sortie: Ligne[] = [];
  if (avec('fuites')) {
    sortie.push({ rubrique: 'Fuites détectées', nombre: d.fuites.length,
      detail: `dont ${pluriel(d.fuites.filter((l) => l.validee_le).length, 'validée')}, ${pluriel(compter(d.fuites, 'visibilite', 'invisible'), 'invisible')}` });
  }
  if (avec('reparations')) {
    sortie.push({ rubrique: 'Réparations', nombre: d.reparations.length,
      detail: `${pluriel(compter(d.reparations, 'resultat', 'reparee'), 'réparée')}, ${nombreTexte(compter(d.reparations, 'resultat', 'en_cours'))} en cours, `
        + `${pluriel(compter(d.reparations, 'resultat', 'non_reparee'), 'non réparée')} ; fouilles ${nombreTexte(somme(d.reparations, 'volume_m3'), 3)} m3` });
  }
  if (avec('refections')) {
    sortie.push({ rubrique: 'Réfections', nombre: d.refections.length,
      detail: `${pluriel(compter(d.refections, 'resultat', 'faite'), 'faite')} ; surface ${nombreTexte(somme(d.refections, 'surface_m2'), 2)} m2` });
  }
  if (avec('balayage')) {
    const jours = new Set(d.balayage.map((l) => l.date_balayage)).size;
    sortie.push({ rubrique: 'Balayage (linéaire inspecté, m)', nombre: Math.round(somme(d.balayage, 'lineaire_m')),
      detail: `${pluriel(somme(d.balayage, 'nb_troncons'), 'tronçon')} sur ${pluriel(jours, 'jour')} ; repassé ${nombreTexte(somme(d.balayage, 'lineaire_repasse_m'), 0)} m` });
  }
  if (avec('debits')) {
    const zones = d.debitsSituation.filter((l) => l.niveau === 'zone');
    sortie.push({ rubrique: 'Débits de nuit (nuits mesurées)', nombre: d.debitsNuits.length,
      detail: `${pluriel(d.debitsNuits.filter((l) => l.complete !== false).length, 'nuit complète', 'nuits complètes')} ; `
        + `${pluriel(zones.filter((l) => l.alerte_arret || l.alerte_degradation).length, 'zone en alerte', 'zones en alerte')}` });
  }
  if (avec('pieces')) {
    sortie.push({ rubrique: 'Pièces posées (lignes)', nombre: d.pieces.length,
      detail: `${pluriel(new Set(d.pieces.map((l) => l.fuite_id)).size, 'fuite')}` });
  }
  if (avec('attente')) {
    sortie.push({ rubrique: 'Fuites en attente ou en alerte', nombre: d.attente.length,
      detail: `${pluriel(d.attente.filter((l) => l.statut === 'detectee' || l.statut === 'en_reparation').length, 'non achevée')}, `
        + `${pluriel(d.attente.filter(enAlerte).length, 'en alerte', 'en alerte')}` });
  }
  return sortie;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
const TRI: Record<string, (a: Ligne, b: Ligne) => number> = {
  fuites: (a, b) => Number(a.numero) - Number(b.numero),
  reparations: (a, b) => String(a.realisee_le).localeCompare(String(b.realisee_le)) || Number(a.fuite_numero) - Number(b.fuite_numero),
  refections: (a, b) => String(a.realisee_le).localeCompare(String(b.realisee_le)) || Number(a.fuite_numero) - Number(b.fuite_numero),
  balayage: (a, b) => String(a.date_balayage).localeCompare(String(b.date_balayage)) || String(a.zone ?? '').localeCompare(String(b.zone ?? ''), 'fr', { numeric: true })
    || String(a.secteur ?? '').localeCompare(String(b.secteur ?? ''), 'fr', { numeric: true }) || String(a.agent ?? '').localeCompare(String(b.agent ?? '')),
  nuits: (a, b) => String(a.nuit).localeCompare(String(b.nuit)) || Number(a.zone_numero ?? 0) - Number(b.zone_numero ?? 0),
  situation: (a, b) => (a.niveau === b.niveau ? Number(a.zone_numero ?? 0) - Number(b.zone_numero ?? 0) : a.niveau === 'zone' ? -1 : 1),
  pieces: (a, b) => String(a.jour).localeCompare(String(b.jour)) || Number(a.fuite_numero) - Number(b.fuite_numero),
  attente: (a, b) => String(a.date_detection).localeCompare(String(b.date_detection)),
};

function lignesTableau(d: DonneesRapport, rub: CleRubrique, tableau: string, rubriques: readonly CleRubrique[]): Ligne[] {
  switch (tableau) {
    case 'synthese': return lignesSynthese(d, rubriques);
    case 'nuits': return d.debitsNuits;
    case 'situation': return d.debitsSituation.map((l) => ({ ...l, zone: l.niveau === 'marche' ? 'Ensemble du marché' : l.zone_libelle ?? l.zone }));
    default: return d[rub as Exclude<CleRubrique, 'synthese' | 'debits'>] ?? [];
  }
}

const AUCUN: SectionDoc['lignes'][number] = { type: 'groupe', cellules: [], libelle: 'Aucun élément pour cette période et ces filtres.' };

/** Sections du rapport, dans l'ordre des rubriques ; un tableau sans colonne cochée est omis. */
export function sectionsRapport(d: DonneesRapport, choix: ChoixRapport, o: { droits?: Droits; marche?: unknown; decimales?: Record<string, number> } = {}): SectionDoc[] {
  const filtrees = filtrerDonnees(d, choix.filtres);
  const visibles = new Set(rubriquesVisibles(o.droits).map((r) => r.cle));
  const cochees = RUBRIQUES_RAPPORT.map((r) => r.cle).filter((k) => visibles.has(k) && choix.rubriques.includes(k));
  const sections: SectionDoc[] = [];
  for (const k of cochees) {
    const voulues = new Set(choix.colonnes[k] ?? colonnesParDefaut(k));
    for (const { tableau, colonnes } of colonnesRubrique(k, o.droits, o.marche)) {
      const cols = colonnes.filter((x) => voulues.has(x.cle));
      if (!cols.length) continue;
      const lignes = [...lignesTableau(filtrees, k, tableau.cle, cochees)];
      const tri = TRI[tableau.cle];
      if (tri) lignes.sort(tri);
      const s = construireSection(lignes, cols, { titre: tableau.titre, decimales: o.decimales, total: tableau.cle !== 'synthese' });
      if (!lignes.length) s.lignes = [{ ...AUCUN, cellules: s.colonnes.map(() => null) }];
      sections.push(s);
    }
  }
  return sections;
}

// Lisibilité en PDF : le tableau prend toute la largeur utile (A4, marges de 12 mm) ; un mot ne se coupe jamais tant que
// chaque colonne a la place de son mot le plus long (nombres et dates : le texte entier, jamais coupé). Sinon jspdf-autotable
// tranche les mots (« Répar / ée »). Police de 8 points : environ 1,55 mm par caractère, 2,2 mm de marge par cellule.
const LARGEUR_UTILE_MM: Record<Orientation, number> = { portrait: 186, paysage: 273 };
const MM_PAR_CARACTERE = 1.55;
const MARGE_CELLULE_MM = 2.2;
const motLePlusLong = (t: string) => t.split(/\s+/).reduce((m, x) => Math.max(m, x.length), 0);

/** Largeur sous laquelle le PDF coupe des mots en deux (en-têtes et cellules du tableau). */
export function largeurSansCoupureMm(s: SectionDoc): number {
  return s.colonnes.reduce((total, col, i) => {
    const mesure = col.type === 'texte' ? motLePlusLong : (t: string) => t.length;
    let n = motLePlusLong(col.titre);
    for (const { ligne, indexDonnees } of parcourir(s)) {
      if (ligne.type === 'donnees') n = Math.max(n, mesure(texteCellule(s, ligne, i, indexDonnees)));
    }
    return total + n * MM_PAR_CARACTERE + MARGE_CELLULE_MM;
  }, 0);
}

/** Tableaux trop chargés pour l'orientation choisie (conseil à l'écran : paysage, ou moins de colonnes). */
export function tableauxTropLarges(sections: SectionDoc[], orientation: Orientation): string[] {
  return sections.filter((s) => largeurSansCoupureMm(s) > LARGEUR_UTILE_MM[orientation]).map((s) => s.titre ?? '');
}

/** Filtres appliqués, en clair (personne : son matricule, R4). */
export function texteFiltres(f: FiltresRapport, noms: { zone?: string; secteur?: string; personne?: string } = {}): string {
  const morceaux = [
    f.zone && `zone ${noms.zone ?? '?'}`,
    f.secteur && `secteur ${noms.secteur ?? '?'}`,
    f.statut && `statut « ${STATUTS[f.statut].libelle} »`,
    f.personne && `chef d'équipe ou agent ${noms.personne ?? '?'}`,
    f.validees && 'saisies validées seulement',
  ].filter(Boolean);
  return morceaux.length ? `Filtres : ${morceaux.join(', ')}` : '';
}

export function documentRapport(
  d: DonneesRapport, choix: ChoixRapport, ctx: Contexte, periode: { du: string; au: string },
  o: { droits?: Droits; noms?: { zone?: string; secteur?: string; personne?: string }; genereLe?: Date } = {},
): DocumentExport {
  const lm = lmDe(ctx.marche);
  const visas = !choix.visas ? [] : ctx.regles?.visas?.length ? ctx.regles.visas : ['Pour le titulaire', `Pour ${lm.sigle}`];
  const code = String(ctx.marche.code ?? 'marche');
  return {
    nomFichier: `rapport-${code}-${periode.du}${periode.au !== periode.du ? `-au-${periode.au}` : ''}`,
    entete: construireEntete(ctx, choix.titre?.trim() || titreRapport(choix.periode, periode), [
      libellePeriode(periode),
      texteFiltres(choix.filtres, o.noms),
    ].filter(Boolean)),
    sections: sectionsRapport(d, choix, { droits: o.droits, marche: ctx.marche, decimales: ctx.regles?.decimales }),
    visas,
    orientation: choix.orientation,
    genereLe: o.genereLe ?? new Date(),
  };
}

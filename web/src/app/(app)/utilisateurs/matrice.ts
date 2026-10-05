// Matrice des droits (Utilisateurs > Droits) et verrous de sécurité de l'administrateur : calculs purs.
// Seuls des imports de types : scripts/verifier-matrice-droits.mjs charge ce fichier directement avec Node.
import type { Action, Droit, TypeDonnee } from '@/lib/types';

export type Portee = 'non' | 'siennes' | 'toutes';
export type Role = 'detection' | 'chef_reparation' | 'responsable';
export type Valeur = boolean | Portee;

export interface ValeursDroit {
  lire: boolean;
  creer: boolean;
  modifier: Portee;
  supprimer: Portee;
  valider: boolean;
}

/** Droits d'un utilisateur dans un marché, par type de donnée (type absent = aucun droit). */
export type DroitsUtilisateur = Partial<Record<TypeDonnee, ValeursDroit>>;

export interface ModeleDroit extends ValeursDroit {
  role: Role;
  type_donnee: TypeDonnee;
}

export interface Verrou {
  objet: string;
  action: string;
}

export interface LigneDroitEnregistree extends ValeursDroit {
  profil_id: string;
  type_donnee: TypeDonnee;
}

export interface Changement {
  profil_id: string;
  type_donnee: TypeDonnee;
  colonne: Action;
  avant: Valeur;
  apres: Valeur;
}

export const COLONNES: readonly Action[] = ['lire', 'creer', 'modifier', 'supprimer', 'valider'];
export const DROIT_VIDE: ValeursDroit = { lire: false, creer: false, modifier: 'non', supprimer: 'non', valider: false };
export const ROLES: Record<Role, string> = {
  detection: 'Détection',
  chef_reparation: 'Chef d\'équipe réparation',
  responsable: 'Responsable (bureau)',
};

export const TITRES_TYPES: Record<TypeDonnee, string> = {
  fuites: 'Fuites',
  interventions: 'Interventions',
  photos: 'Photos',
  quantites: 'Quantités et prix',
  parametres: 'Paramètres',
  ouvriers: 'Ouvriers',
  journal: 'Journal des modifications',
  exports: 'Exports',
  balayage: 'Balayage',
  mesures_debit: 'Mesures de débit',
  attachements: 'Attachements',
  evenements: 'Événements',
};

/**
 * Une ligne de la matrice. Ligne de droit : `objet` = type de donnée, `action` = colonne de la table
 * `droits`. Ligne réservée à l'administrateur (`adminSeul`) : action qu'aucune colonne de `droits`
 * ne porte, seulement verrouillable. Clé = clé du verrou (`objet.action`, table `verrous_admin`).
 */
export interface LigneMatrice {
  cle: string;
  groupe: string;
  objet: string;
  action: string;
  libelle: string;
  aide?: string;
  portee?: boolean;
  adminSeul?: boolean;
  sensible?: boolean;
}

type Options = Pick<LigneMatrice, 'aide' | 'sensible'>;

const droit = (groupe: string, type: TypeDonnee, action: Action, libelle: string, options: Options = {}): LigneMatrice => ({
  cle: `${type}.${action}`, groupe, objet: type, action, libelle,
  ...(action === 'modifier' || action === 'supprimer' ? { portee: true } : {}),
  ...options,
});

const reserve = (groupe: string, objet: string, action: string, libelle: string, aide: string): LigneMatrice => ({
  cle: `${objet}.${action}`, groupe, objet, action, libelle, aide, adminSeul: true, sensible: true,
});

export const LIGNES: readonly LigneMatrice[] = [
  droit('Fuites', 'fuites', 'lire', 'Fuites : voir', { aide: 'liste, fiche, carte, tableau de bord' }),
  droit('Fuites', 'fuites', 'creer', 'Fuites : signaler une fuite'),
  droit('Fuites', 'fuites', 'modifier', 'Fuites : modifier', { aide: 'les siennes = signalées ou saisies par lui' }),
  droit('Fuites', 'fuites', 'supprimer', 'Fuites : supprimer', { sensible: true }),
  droit('Fuites', 'fuites', 'valider', 'Fuites : valider / verrouiller', { aide: 'statut, jalons du client, correction d\'une fuite verrouillée' }),

  droit('Interventions', 'interventions', 'lire', 'Interventions : voir les réparations et réfections'),
  droit('Interventions', 'interventions', 'creer', 'Interventions : saisir une réparation ou une réfection'),
  droit('Interventions', 'interventions', 'modifier', 'Interventions : modifier', { aide: 'réparations, réfections, pièces posées' }),
  droit('Interventions', 'interventions', 'supprimer', 'Interventions : supprimer'),
  droit('Interventions', 'interventions', 'valider', 'Interventions : corriger sur une fuite verrouillée'),

  droit('Photos', 'photos', 'lire', 'Photos : voir'),
  droit('Photos', 'photos', 'creer', 'Photos : ajouter'),
  droit('Photos', 'photos', 'modifier', 'Photos : modifier', { aide: 'type, légende' }),
  droit('Photos', 'photos', 'supprimer', 'Photos : supprimer'),
  droit('Photos', 'photos', 'valider', 'Photos : corriger sur une fuite verrouillée'),

  droit('Quantités et prix', 'quantites', 'lire', 'Quantités et prix : voir', { aide: 'montants du bordereau (fiche, exports, rapports)' }),
  droit('Quantités et prix', 'quantites', 'creer', 'Quantités et prix : ajouter une ligne'),
  droit('Quantités et prix', 'quantites', 'modifier', 'Quantités et prix : corriger'),
  droit('Quantités et prix', 'quantites', 'supprimer', 'Quantités et prix : supprimer une ligne'),
  droit('Quantités et prix', 'quantites', 'valider', 'Quantités et prix : corriger sur une fuite verrouillée'),

  droit('Attachements', 'attachements', 'lire', 'Attachements : voir les lots'),
  droit('Attachements', 'attachements', 'creer', 'Attachements : préparer un lot', { aide: 'nouveau brouillon, unités cochées, lignes libres' }),
  droit('Attachements', 'attachements', 'modifier', 'Attachements : modifier un brouillon et le suivi', { aide: 'en-tête, lignes, acceptation, facture' }),
  droit('Attachements', 'attachements', 'supprimer', 'Attachements : supprimer un brouillon'),
  droit('Attachements', 'attachements', 'valider', 'Attachements : arrêter un lot', { aide: 'quantités figées, numéro, fuites verrouillées', sensible: true }),
  reserve('Attachements', 'attachements', 'rouvrir', 'Attachements : rouvrir le dernier lot arrêté', 'administrateur seulement, motif obligatoire'),
  reserve('Attachements', 'attachements', 'forcer', 'Attachements : refacturation forcée', 'administrateur seulement, hors solde'),

  droit('Paramètres du marché', 'parametres', 'lire', 'Paramètres : voir', { aide: 'logos des documents ; l\'écran Paramètres demande « ajouter » ou « modifier »' }),
  droit('Paramètres du marché', 'parametres', 'creer', 'Paramètres : ajouter', { aide: 'secteurs, articles, natures, pièces, équipes, motifs, OS, avenants' }),
  droit('Paramètres du marché', 'parametres', 'modifier', 'Paramètres : modifier', { aide: 'fiche du marché, logos, bordereau, règles d\'attachement' }),

  droit('Ouvriers', 'ouvriers', 'creer', 'Ouvriers : ajouter'),
  droit('Ouvriers', 'ouvriers', 'modifier', 'Ouvriers : modifier, désactiver'),

  droit('Événements', 'evenements', 'lire', 'Événements : voir le journal des événements'),
  droit('Événements', 'evenements', 'creer', 'Événements : ajouter', { aide: 'pièces jointes comprises' }),
  droit('Événements', 'evenements', 'modifier', 'Événements : modifier'),
  droit('Événements', 'evenements', 'supprimer', 'Événements : supprimer'),

  droit('Exports', 'exports', 'lire', 'Exports : exporter', { aide: 'Excel, PDF, Word, CSV, rapports PDF, carte imprimée' }),
  droit('Exports', 'exports', 'creer', 'Exports : enregistrer un modèle d\'export'),

  droit('Journal des modifications', 'journal', 'lire', 'Journal : consulter qui a changé quoi', { aide: 'lecture en base ; pas encore d\'écran' }),

  reserve('Administration', 'marches', 'desactiver', 'Marchés : désactiver un marché', 'page Marchés'),
  reserve('Administration', 'marches', 'copier', 'Marchés : créer un marché par copie', 'page Marchés'),
  reserve('Administration', 'comptes', 'revoquer', 'Comptes : révoquer un accès', 'onglet Comptes'),
];

export const GROUPES: readonly string[] = [...new Set(LIGNES.map((l) => l.groupe))];
export const CLES_SENSIBLES: readonly string[] = LIGNES.filter((l) => l.sensible).map((l) => l.cle);

export const cleVerrou = (objet: string, action: string) => `${objet}.${action}`;

export function objetAction(cle: string): Verrou {
  const i = cle.indexOf('.');
  return { objet: cle.slice(0, i), action: cle.slice(i + 1) };
}

export function valeur(d: DroitsUtilisateur, type: TypeDonnee, colonne: Action): Valeur {
  return (d[type] ?? DROIT_VIDE)[colonne];
}

/** Copie des droits avec une case changée (rien n'est modifié sur place). */
export function avecValeur(d: DroitsUtilisateur, type: TypeDonnee, colonne: Action, v: Valeur): DroitsUtilisateur {
  return { ...d, [type]: { ...(d[type] ?? DROIT_VIDE), [colonne]: v } };
}

export function droitsDepuisLignes(lignes: readonly (ValeursDroit & { type_donnee: TypeDonnee })[]): DroitsUtilisateur {
  const d: DroitsUtilisateur = {};
  for (const l of lignes) {
    d[l.type_donnee] = { lire: l.lire, creer: l.creer, modifier: l.modifier, supprimer: l.supprimer, valider: l.valider };
  }
  return d;
}

/** Droits d'un modèle de rôle, en remplacement complet (null = aucun droit). */
export function droitsDuModele(modeles: readonly ModeleDroit[], role: Role | null): DroitsUtilisateur {
  return droitsDepuisLignes(role ? modeles.filter((m) => m.role === role) : []);
}

const RANG: Record<Portee, number> = { non: 0, siennes: 1, toutes: 2 };
const plusLarge = (a: Portee, b: Portee): Portee => (RANG[a] >= RANG[b] ? a : b);

/** Cumul des modèles des rôles (comme appliquer_modele_role : on garde toujours le plus large). */
export function droitsDesRoles(modeles: readonly ModeleDroit[], roles: readonly string[]): DroitsUtilisateur {
  const d: DroitsUtilisateur = {};
  for (const m of modeles) {
    if (!roles.includes(m.role)) continue;
    const a = d[m.type_donnee] ?? DROIT_VIDE;
    d[m.type_donnee] = {
      lire: a.lire || m.lire,
      creer: a.creer || m.creer,
      modifier: plusLarge(a.modifier, m.modifier),
      supprimer: plusLarge(a.supprimer, m.supprimer),
      valider: a.valider || m.valider,
    };
  }
  return d;
}

const typesDe = (...listes: DroitsUtilisateur[]) =>
  [...new Set(listes.flatMap((d) => Object.keys(d) as TypeDonnee[]))];

export function memesDroits(a: DroitsUtilisateur, b: DroitsUtilisateur): boolean {
  return typesDe(a, b).every((t) => COLONNES.every((c) => valeur(a, t, c) === valeur(b, t, c)));
}

/** Les droits ne sont plus ceux des rôles affichés (réglés à la main dans la matrice). */
export function estPersonnalise(d: DroitsUtilisateur, roles: readonly string[], modeles: readonly ModeleDroit[]): boolean {
  return !memesDroits(d, droitsDesRoles(modeles, roles));
}

/** Toutes les cases changées, utilisateur par utilisateur (un type absent vaut « aucun droit »). */
export function calculerChangements(
  initial: Record<string, DroitsUtilisateur>,
  courant: Record<string, DroitsUtilisateur>,
): Changement[] {
  const changements: Changement[] = [];
  for (const profil_id of Object.keys(courant)) {
    const avant = initial[profil_id] ?? {};
    const apres = courant[profil_id];
    for (const type_donnee of typesDe(avant, apres)) {
      for (const colonne of COLONNES) {
        const a = valeur(avant, type_donnee, colonne);
        const b = valeur(apres, type_donnee, colonne);
        if (a !== b) changements.push({ profil_id, type_donnee, colonne, avant: a, apres: b });
      }
    }
  }
  return changements;
}

/** Lignes complètes à envoyer à `enregistrer_droits` : une par utilisateur × type changé. */
export function lignesAEnregistrer(
  initial: Record<string, DroitsUtilisateur>,
  courant: Record<string, DroitsUtilisateur>,
): LigneDroitEnregistree[] {
  const vus = new Set<string>();
  const lignes: LigneDroitEnregistree[] = [];
  for (const c of calculerChangements(initial, courant)) {
    const cle = `${c.profil_id}|${c.type_donnee}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    lignes.push({ profil_id: c.profil_id, type_donnee: c.type_donnee, ...(courant[c.profil_id][c.type_donnee] ?? DROIT_VIDE) });
  }
  return lignes;
}

export function texteValeur(v: Valeur): string {
  if (v === true) return 'Oui';
  if (v === false || v === 'non') return 'Non';
  return v === 'siennes' ? 'Les siennes' : 'Toutes';
}

/** Case de « droits » sans ligne dans la matrice : sans effet aujourd'hui (balayage, mesures de débit…). */
export function sansEcran(type: TypeDonnee, colonne: string): boolean {
  return !LIGNES.some((l) => l.objet === type && l.action === colonne);
}

/** Libellé d'une case : celui de la matrice, sinon (case sans écran) type et colonne. */
export function libelleDroit(type: TypeDonnee, colonne: string): string {
  return LIGNES.find((l) => l.objet === type && l.action === colonne)?.libelle
    ?? `${TITRES_TYPES[type]} : ${colonne} (sans écran)`;
}

export function libelleVerrou(cle: string): string {
  const { objet, action } = objetAction(cle);
  return LIGNES.find((l) => l.cle === cle)?.libelle ?? `${objet} : ${action}`;
}

export function basculer(liste: readonly string[], cle: string): string[] {
  return liste.includes(cle) ? liste.filter((c) => c !== cle) : [...liste, cle];
}

export function changementsVerrous(initial: readonly string[], courant: readonly string[]): { poser: string[]; retirer: string[] } {
  return {
    poser: courant.filter((c) => !initial.includes(c)),
    retirer: initial.filter((c) => !courant.includes(c)),
  };
}

export function verrouPose(verrous: readonly Verrou[], objet: string, action: string): boolean {
  return verrous.some((v) => v.objet === objet && v.action === action);
}

/**
 * Ce que l'écran autorise, comme la base (private.peut) : l'administrateur a tout, sauf ce qu'il a
 * verrouillé pour lui-même ; les autres suivent leurs droits dans le marché choisi.
 */
export function peutSelonDroits(
  contexte: { estAdmin: boolean; verrous: readonly Verrou[]; droits: readonly Droit[]; marcheId: string | null },
  type: TypeDonnee,
  action: Action,
): boolean {
  if (contexte.estAdmin) return !verrouPose(contexte.verrous, type, action);
  const d = contexte.droits.find((x) => x.marche_id === contexte.marcheId && x.type_donnee === type);
  if (!d) return false;
  if (action === 'modifier' || action === 'supprimer') return d[action] !== 'non';
  return d[action];
}

import type { Marche, StatutFuite } from './types';
import { dateHeureMaroc, dateMaroc } from '@/lib/heure-maroc';

export const STATUTS: Record<StatutFuite, { libelle: string; classe: string }> = {
  detectee: { libelle: 'Détectée, non réparée', classe: 'st-detectee' },
  a_redetecter: { libelle: 'À re-détecter', classe: 'st-redetecter' },
  en_reparation: { libelle: 'Réparation en cours', classe: 'st-encours' },
  reparee: { libelle: 'Réparée, réfection à faire', classe: 'st-reparee' },
  achevee: { libelle: 'Achevée', classe: 'st-achevee' },
  sans_reparation: { libelle: 'Sans réparation', classe: 'st-sans' },
};

/** Numéro à afficher d'une fuite : « 22 » ou, pour une re-détection, « 22-bis », « 22-ter »… */
export function numeroFuite(f: { numero_affiche?: string | null; numero?: number | null } | null | undefined): string {
  if (!f) return '—';
  return f.numero_affiche || (f.numero != null ? String(f.numero) : '—');
}

/** Même chose pour une ligne de vue qui porte fuite_numero et fuite_numero_affiche. */
export function numeroFuiteLigne(l: { fuite_numero_affiche?: string | null; fuite_numero?: number | null } | null | undefined): string {
  if (!l) return '—';
  return l.fuite_numero_affiche || (l.fuite_numero != null ? String(l.fuite_numero) : '—');
}

const SUFFIXES_RANG = ['', 'bis', 'ter', 'quater', 'quinquies', 'sexies', 'septies', 'octies', 'nonies', 'decies'];

/** Numéro que prendra la re-détection d'une fuite (rang suivant) : 22 → « 22-bis », 22-bis → « 22-ter ». */
export function numeroRedetection(f: { numero?: number | null; rang?: number | null }): string {
  const rang = (f.rang ?? 1) + 1;
  return `${f.numero ?? '?'}-${SUFFIXES_RANG[rang - 1] ?? rang}`;
}

/** Rang d'une fuite d'après son numéro affiché : « 22 » → 1, « 22-bis » → 2, « 22-ter » → 3… */
export function rangDepuisAffiche(numero: number | null | undefined, affiche: string | null | undefined): number {
  if (!affiche || affiche === String(numero ?? '')) return 1;
  const i = SUFFIXES_RANG.indexOf(affiche.slice(String(numero ?? '').length + 1));
  return i > 0 ? i + 1 : 1;
}

/** Numéro pour un export : le nombre (colonne numérique) sauf pour une re-détection (« 22-bis », texte). */
export function numeroExport(numero: unknown, affiche: unknown): unknown {
  return typeof affiche === 'string' && affiche && affiche !== String(numero ?? '') ? affiche : numero;
}

/** Recherche par numéro : « 22 » trouve la 22 et ses re-détections, « 22-bis » la seule 22-bis. */
export function numeroCorrespond(f: { numero_affiche?: string | null; numero?: number | null }, texte: string): boolean {
  const t = texte.trim().toLowerCase();
  if (!t) return false;
  return String(f.numero ?? '') === t || (f.numero_affiche ?? '').toLowerCase() === t;
}

export const OUVRAGES: Record<string, string> = {
  branchement: 'Branchement',
  conduite: 'Conduite',
  piece_speciale: 'Pièce spéciale',
  bouche_incendie: 'Bouche d\'incendie',
  vanne: 'Vanne',
  compteur: 'Compteur',
  branchement_clandestin: 'Branchement clandestin',
  autre: 'Autre',
};

export const MATERIAUX: Record<string, string> = {
  polyethylene: 'Polyéthylène (PE)',
  amiante_ciment: 'Amiante-ciment (AC)',
  pvc: 'PVC',
  fonte_ductile: 'Fonte ductile',
  fonte_grise: 'Fonte grise',
  acier_galvanise: 'Acier galvanisé',
  ppr: 'PPR',
  autre: 'Autre',
};

export const EMPLACEMENTS: Record<string, string> = {
  trottoir: 'Trottoir',
  chaussee: 'Chaussée',
  terrain_naturel: 'Terrain naturel',
  autre: 'Autre',
};

export const TYPES_PHOTO: Record<string, string> = {
  detection: 'Détection',
  avant: 'Avant réparation',
  pendant: 'Pendant',
  apres: 'Après réparation',
  refection: 'Réfection',
  autre: 'Autre',
};

// Référence du client (tournée, n° d'abonné…) : le masque du marché place les séparateurs.
// « 9 » = un chiffre ; avec « 999-999-999 », « 302684001 » devient « 302-684-001 ».
// Sans masque, la saisie est libre.
export function formaterReference(saisie: string, masque: string | null | undefined): string {
  if (!masque) return saisie;
  const chiffres = saisie.replace(/\D/g, '');
  let i = 0;
  let sortie = '';
  for (const c of masque) {
    if (i >= chiffres.length) break;
    if (c === '9') sortie += chiffres[i++];
    else sortie += c;
  }
  return sortie;
}

// Motif HTML (attribut pattern) équivalent au masque.
export const motifMasque = (masque: string) =>
  masque.split('').map((c) => (c === '9' ? '[0-9]' : c.replace(/[\^$\\.*+?()[\]{}|/]/g, '\\$&'))).join('');

// Libellés du marché, avec des valeurs neutres si le marché ne les précise pas.
export function libellesMarche(m: Marche | null | undefined) {
  return {
    sigle: m?.client_sigle?.trim() || m?.client?.trim() || 'client',
    reference: m?.libelle_reference?.trim() || 'Référence client',
    masque: m?.masque_reference || null,
    jalons: m?.jalons_client ?? false,
    delaiReparationH: m?.delai_alerte_reparation_h ?? 48,
    devise: m?.devise?.trim() || 'DH',
  };
}

export const dateHeure = (iso: string | null | undefined) =>
  iso ? dateHeureMaroc(iso) : '—';

export const dateSeule = (iso: string | null | undefined) =>
  iso ? dateMaroc(iso) : '—';

export const montant = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const nombre = (n: number | null | undefined, d = 2) =>
  n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: d });

// Valeur du champ datetime-local (heure locale du navigateur) vers ISO.
export const localVersIso = (valeur: string) => (valeur ? new Date(valeur).toISOString() : undefined);

export function messageErreur(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const m = String((e as { message: unknown }).message);
    if (m.includes('row-level security')) return 'Action non autorisée pour votre compte.';
    if (m.includes('non autorisée') || m.includes('verrouillée')) return m;
    if (m.includes('Invalid login')) return 'Identifiant ou mot de passe incorrect.';
    if (m.includes('Failed to fetch') || m.includes('NetworkError')) return 'Pas de réseau. Réessayez quand la connexion revient.';
    return m;
  }
  return 'Erreur inattendue.';
}

export function telechargerCsv(nom: string, lignes: (string | number | null | undefined)[][]) {
  const echapper = (v: string | number | null | undefined) => {
    const t = v == null ? '' : String(v);
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const contenu = '﻿' + lignes.map((l) => l.map(echapper).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}

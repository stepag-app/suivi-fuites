import type { Marche, StatutFuite } from './types';

export const STATUTS: Record<StatutFuite, { libelle: string; classe: string }> = {
  detectee: { libelle: 'Détectée, non réparée', classe: 'st-detectee' },
  en_reparation: { libelle: 'Réparation en cours', classe: 'st-encours' },
  reparee: { libelle: 'Réparée, réfection à faire', classe: 'st-reparee' },
  achevee: { libelle: 'Achevée', classe: 'st-achevee' },
  sans_reparation: { libelle: 'Sans réparation', classe: 'st-sans' },
};

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

const FUSEAU = 'Africa/Casablanca';

export const dateHeure = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('fr-FR', {
        timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

export const dateSeule = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { timeZone: FUSEAU }) : '—';

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

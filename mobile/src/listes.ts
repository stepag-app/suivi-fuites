// Libellés des listes de saisie dans la langue de la tablette (X4).
// Listes communes (ouvrage, matériau, emplacement, visibilité, résultats, travaux, types de photo) : table
// libelles_listes de la base (S2), gardée sur la tablette avec les paramètres ; à défaut, dictionnaire de l'APK.
// Listes du marché (natures, motifs) : leurs colonnes libelle_fr / libelle_ar.
// Règle d'Issam : en hybride, les choix des listes restent en français ; en arabe, l'arabe de la base d'abord.
import { langueCourante, tx } from './langue';
import type { LibelleListe } from './types';

let table = new Map<string, LibelleListe>();

/** Libellés reçus de la base (ou de la copie de la tablette). */
export function retenirLibelles(liste: LibelleListe[]) {
  table = new Map(liste.map((x) => [`${x.liste}:${x.code}`, x]));
}

/** Libellé d'un code d'une liste commune ; `francais` : libellé français de l'APK (plus court que celui de la base). */
export function libelleListe(liste: string, code: string | null | undefined, francais?: string): string {
  if (!code) return '';
  const e = table.get(`${liste}:${code}`);
  const fr = francais ?? e?.libelle_fr ?? code;
  return langueCourante() === 'ar' ? e?.libelle_ar || tx(fr) : tx(fr);
}

/** Options d'une liste commune (code → libellé français de l'APK), dans la langue de la tablette. */
export const optionsListe = (liste: string, francais: Record<string, string>) =>
  Object.entries(francais).map(([valeur, fr]) => ({ valeur, libelle: libelleListe(liste, valeur, fr) }));

/** Libellé d'une ligne d'une liste du marché (nature, motif). */
export const libelleDb = (o: { libelle_fr: string; libelle_ar?: string | null } | null | undefined) =>
  !o ? '' : langueCourante() === 'ar' && o.libelle_ar ? o.libelle_ar : o.libelle_fr;

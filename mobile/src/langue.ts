import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TRADUCTIONS, type Cle, type Entree } from './traductions';

/** Langue de l'interface, choisie sur chaque tablette : français, hybride (arabe + termes techniques en français), arabe. */
export type Langue = 'fr' | 'hybride' | 'ar';

const CLE_STOCKAGE = 'suivi-fuites:langue';
// Marque « droite à gauche » : un texte qui commence par un terme français s'aligne quand même à droite.
const RLM = '‏';

// Lue aussi hors des composants (messages d'erreur de la file d'envoi).
let courante: Langue = 'fr';

type Valeurs = Record<string, string | number | null | undefined>;

/**
 * Texte dans la langue choisie ; `{repère}` remplacés par `valeurs`. `fr` : texte français déjà composé quand
 * la clé ne sert qu'aux autres langues (pluriels : « 1 fuite », « 4 fuites »).
 */
export function t(cle: Cle, valeurs?: Valeurs, fr?: string): string {
  if (courante === 'fr' && fr != null) return fr;
  const e: Entree = TRADUCTIONS[cle];
  const brut = courante === 'fr' ? cle : courante === 'hybride' ? e.hyb ?? e.ar : e.ar;
  const texte = valeurs ? brut.replace(/\{(\w+)\}/g, (m, k: string) => (k in valeurs ? String(valeurs[k] ?? '') : m)) : brut;
  return courante === 'fr' ? texte : RLM + texte;
}

/** Texte venu d'une table ou d'une variable (statut, type de photo…) : traduit s'il est au dictionnaire, sinon tel quel. */
export function tx(texte: string): string {
  return texte in TRADUCTIONS ? t(texte as Cle) : texte;
}

// Mots des noms d'équipe saisis en français dans la base (« Équipe détection 1 », « Réparation A (démo) »).
const MOTS_EQUIPE: [RegExp, string, string?][] = [
  [/\bÉquipe\b/gi, 'فريق'],
  [/\bDétection\b/gi, 'الكشف'],
  [/\bRéparation\b/gi, 'الإصلاح'],
  [/\bRéfection\b/gi, 'إعادة الرصف', 'Réfection'],
  [/\(démo\)/gi, '(تجريبي)'],
];

/** Nom d'équipe venu de la base : mots connus traduits, le reste (lettres, numéros) gardé. */
export function libelleEquipe(libelle: string | null | undefined): string | undefined {
  if (libelle == null) return undefined;
  if (courante === 'fr') return libelle;
  return MOTS_EQUIPE.reduce((t, [motif, ar, hyb]) => t.replace(motif, courante === 'hybride' ? hyb ?? ar : ar), libelle);
}

/** Langue en cours, hors des composants (libellés des listes venues de la base : listes.ts). */
export const langueCourante = (): Langue => courante;

/** « a, b, c » avec la virgule de la langue (، en arabe). */
export const enumerer = (elements: string[]) => elements.join(courante === 'fr' ? ', ' : '، ');

interface Etat { langue: Langue; choisir: (l: Langue) => void; t: typeof t; tx: typeof tx }

const Contexte = createContext<Etat | null>(null);

export function LangueProvider({ children }: { children: ReactNode }) {
  const [langue, setLangue] = useState<Langue | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(CLE_STOCKAGE)
      .catch(() => null)
      .then((v) => {
        courante = v === 'hybride' || v === 'ar' ? v : 'fr';
        setLangue(courante);
      });
  }, []);

  const choisir = useCallback((l: Langue) => {
    courante = l;
    setLangue(l);
    AsyncStorage.setItem(CLE_STOCKAGE, l).catch(() => undefined);
  }, []);

  const valeur = useMemo(() => (langue ? { langue, choisir, t, tx } : null), [langue, choisir]);
  // Langue lue avant le premier affichage : pas d'écran en français qui bascule une fraction de seconde après.
  if (!valeur) return null;
  return createElement(Contexte.Provider, { value: valeur }, children);
}

/** À appeler dans chaque écran : il se redessine quand la langue change. */
export function useLangue() {
  const c = useContext(Contexte);
  if (!c) throw new Error('useLangue hors LangueProvider');
  return c;
}

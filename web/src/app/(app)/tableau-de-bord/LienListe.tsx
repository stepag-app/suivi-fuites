'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Indicateur } from '@/lib/ui/Indicateur';
import { filtresActifs, lienFuites, type FiltresListe } from '../fuites/filtres';
import styles from './tableau-de-bord.module.css';

// Chiffres du tableau de bord qui ouvrent la liste des fuites filtrée à l'identique (mêmes fuites, même nombre).
// Seuls les chiffres qui ont un filtre exact dans la liste sont des liens ; un zéro n'en est pas un.
// Pas de préchargement : un tableau de bord compte des dizaines de liens, chacun serait une requête sur la tablette.

type Filtres = Partial<FiltresListe>;

export const nombreFuites = (n: number, accord = '') =>
  `${n.toLocaleString('fr-FR')} fuite${n > 1 ? 's' : ''}${accord ? ` ${accord}${n > 1 ? 's' : ''}` : ''}`;

// « octobre 2026 » → « en octobre 2026 » ; « du … au … » et « le … » restent tels quels.
export const surPeriode = (titre: string) => (/^(du|le) /.test(titre) ? titre : `en ${titre}`);

// Nom du lien pour les lecteurs d'écran : le chiffre seul ne dit pas ce qu'il ouvre.
const nomLien = (filtres: Filtres, description: string) =>
  `${description} : ouvrir la liste des fuites${filtresActifs(filtres) ? ' filtrée' : ''}`;

export function ChiffreLien({ n, filtres, description, children }: {
  n: number;
  filtres: Filtres | null;
  /** Ce que compte le chiffre, pour le nom du lien : « 3 fuites détectées en octobre 2026 ». */
  description: string;
  children?: ReactNode;
}) {
  const contenu = children ?? n.toLocaleString('fr-FR');
  if (!filtres || n <= 0) return <>{contenu}</>;
  return (
    <Link href={lienFuites(filtres)} prefetch={false} className={styles.lienChiffre} aria-label={nomLien(filtres, description)}>
      {contenu}
    </Link>
  );
}

export function IndicateurLien({ filtres, description, ...indicateur }: ComponentProps<typeof Indicateur> & {
  filtres: Filtres;
  description: string;
}) {
  if (!indicateur.valeur) return <Indicateur {...indicateur} />;
  return (
    <Link href={lienFuites(filtres)} prefetch={false} className={styles.lienIndicateur} aria-label={nomLien(filtres, description)}>
      <Indicateur {...indicateur} />
    </Link>
  );
}

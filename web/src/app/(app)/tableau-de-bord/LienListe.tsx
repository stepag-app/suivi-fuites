"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { filtresActifs, lienFuites, type FiltresListe } from "../fuites/filtres";

// Chiffres du tableau de bord qui ouvrent la liste des fuites filtrée à l'identique (mêmes fuites, même nombre).
// Seuls les chiffres qui ont un filtre exact dans la liste sont des liens ; un zéro n'en est pas un.
type Filtres = Partial<FiltresListe>;

export const nombreFuites = (n: number, accord = "") =>
  `${n.toLocaleString("fr-FR")} fuite${n > 1 ? "s" : ""}${accord ? ` ${accord}${n > 1 ? "s" : ""}` : ""}`;

// « octobre 2026 » → « en octobre 2026 » ; « du … au … » et « le … » restent tels quels.
export const surPeriode = (titre: string) => (/^(du|le) /.test(titre) ? titre : `en ${titre}`);

const nomLien = (filtres: Filtres, description: string) =>
  `${description} : ouvrir la liste des fuites${filtresActifs(filtres) ? " filtrée" : ""}`;

export function ChiffreLien({ n, filtres, description, children, className }: {
  n: number; filtres: Filtres | null; description: string; children?: ReactNode; className?: string;
}) {
  const contenu = children ?? n.toLocaleString("fr-FR");
  if (!filtres || n <= 0) return <span className={className}>{contenu}</span>;
  return (
    <Link href={lienFuites(filtres)} prefetch={false} aria-label={nomLien(filtres, description)}
      className={`rounded-sm underline-offset-4 hover:underline ${className ?? ""}`}>
      {contenu}
    </Link>
  );
}

export const lienOuNul = (filtres: Filtres, n: number) => (n > 0 ? lienFuites(filtres) : null);

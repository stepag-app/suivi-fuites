import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Ton = "normal" | "negatif" | "critique" | "positif";

const COULEURS: Record<Ton, string> = {
  normal: "var(--chart-2)",
  negatif: "var(--color-red-500)",
  critique: "var(--color-amber-500)",
  positif: "var(--color-green-500)",
};

/** Mini-courbe d'un indicateur (une valeur par jour ou par semaine, la plus récente en dernier). */
export function MiniCourbe({ serie, ton = "normal", titre, className }: { serie: number[]; ton?: Ton; titre?: string; className?: string }) {
  if (serie.length < 2) return null;
  const l = 100;
  const h = 36;
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const pts = serie.map((v, i) => [(i * l) / (serie.length - 1), h - 3 - ((v - min) / (max - min || 1)) * (h - 8)]);
  const trace = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const [dx, dy] = pts[pts.length - 1];
  const c = COULEURS[ton];
  return (
    <svg viewBox={`0 0 ${l} ${h}`} preserveAspectRatio="none" role="img" className={cn("h-9 w-24", className)}
      aria-label={titre ?? `Évolution : ${serie.join(", ")}`}>
      <path d={`${trace} L${l} ${h} L0 ${h} Z`} fill={c} fillOpacity={0.12} />
      <path d={trace} fill="none" stroke={c} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={dx} cy={dy} r={2.2} fill={c} />
    </svg>
  );
}

/** Grille de cartes d'indicateurs (dégradé léger du modèle « Default »). */
export function GrilleIndicateurs({ children, colonnes = 4, className }: { children: ReactNode; colonnes?: 3 | 4 | 5; className?: string }) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card",
        colonnes === 3 && "md:grid-cols-3",
        colonnes === 4 && "md:grid-cols-2 xl:grid-cols-4",
        colonnes === 5 && "md:grid-cols-2 xl:grid-cols-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CarteIndicateur({
  icone: Icone, libelle, valeur, unite, tendance, commentaire, serie, ton = "normal", titreCourbe, href, description,
}: {
  icone?: LucideIcon;
  libelle: string;
  valeur: number | string | null;
  unite?: string;
  tendance?: { texte: string; sens: "haut" | "bas" | "neutre"; bon?: boolean };
  commentaire?: ReactNode;
  serie?: number[];
  ton?: Ton;
  titreCourbe?: string;
  /** Lien vers la liste filtrée (chiffre cliquable). */
  href?: string | null;
  description?: string;
}) {
  const texte = valeur == null ? "—" : typeof valeur === "number" ? valeur.toLocaleString("fr-FR") : valeur;
  const colore = ton !== "normal" && valeur != null && valeur !== 0;
  const chiffre = (
    <div
      className={cn(
        "font-medium text-3xl tabular-nums leading-none tracking-tight",
        colore && ton === "negatif" && "text-red-600 dark:text-red-400",
        colore && ton === "critique" && "text-amber-600 dark:text-amber-400",
        colore && ton === "positif" && "text-green-600 dark:text-green-400",
      )}
    >
      {texte}
      {valeur != null && unite && <span className="ml-0.5 text-base font-normal text-muted-foreground">{unite}</span>}
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {Icone ? (
            <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
              <Icone className="size-4" />
            </div>
          ) : (
            <span className="text-sm font-normal text-muted-foreground">{libelle}</span>
          )}
        </CardTitle>
        {Icone && <CardDescription>{libelle}</CardDescription>}
        {serie && serie.length > 1 && (
          <CardAction>
            <MiniCourbe serie={serie} ton={ton} titre={titreCourbe} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          {href && valeur !== 0 && valeur != null ? (
            <Link href={href} prefetch={false} aria-label={description ?? libelle} className="rounded-md underline-offset-4 hover:underline">
              {chiffre}
            </Link>
          ) : chiffre}
          {tendance && (
            <Badge
              variant="outline"
              className={cn(
                "border",
                tendance.bon === true && "border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300",
                tendance.bon === false && "border-destructive/20 bg-destructive/10 text-destructive",
                tendance.bon == null && "text-muted-foreground",
              )}
            >
              {tendance.sens === "haut" && <TrendingUp className="size-3" />}
              {tendance.sens === "bas" && <TrendingDown className="size-3" />}
              {tendance.texte}
            </Badge>
          )}
        </div>
        {commentaire && <p className="text-muted-foreground text-sm">{commentaire}</p>}
      </CardContent>
    </Card>
  );
}

/** Bande d'indicateurs juxtaposés (modèle « Analytics ») : une carte sans bord par cellule. */
export function BandeKpi({ cellules, colonnes = 5 }: {
  cellules: { titre: string; valeur: ReactNode; badge?: ReactNode; note?: ReactNode; href?: string | null }[];
  colonnes?: 3 | 4 | 5;
}) {
  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
      <div
        className={cn(
          "grid divide-y *:data-[slot=card]:rounded-none *:data-[slot=card]:ring-0 md:grid-cols-2 md:divide-x md:divide-y-0",
          colonnes === 3 && "xl:grid-cols-3",
          colonnes === 4 && "xl:grid-cols-4",
          colonnes === 5 && "xl:grid-cols-5",
        )}
      >
        {cellules.map((c) => (
          <Card key={c.titre}>
            <CardHeader>
              <CardTitle className="font-normal text-sm">{c.titre}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-2xl leading-none tracking-tight tabular-nums">
                  {c.href ? <Link href={c.href} prefetch={false} className="underline-offset-4 hover:underline">{c.valeur}</Link> : c.valeur}
                </div>
                {c.badge}
              </div>
              {c.note && <div className="flex items-center gap-2 text-muted-foreground text-xs">{c.note}</div>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

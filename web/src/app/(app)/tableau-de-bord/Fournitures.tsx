"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { messageErreur } from "@/lib/format";
import { fonctionAbsente, getSupabase } from "@/lib/supabase";
import { libelleFamille } from "@/lib/ui/fournitures";
import type { Periode } from "@/lib/ui/tableau-de-bord";
import { lienFournitures } from "../fournitures/inventaire";

// Une ligne de resume_fournitures (contrat S9) : quantités par article sur la période, inventaire réel.
export interface ResumeFourniture {
  produit_id: number | null;
  designation: string;
  famille: string | null;
  unite: string;
  quantite: number;
  pieces: number;
  fuites: number;
  corrections: number;
}

const AFFICHES = 8;
const nombre = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** Les articles les plus posés de la période (même unité : quantités comparables), et le total par unité. */
export function syntheseFournitures(lignes: ResumeFourniture[]) {
  const tries = [...lignes].sort((a, b) => b.pieces - a.pieces || Number(b.quantite) - Number(a.quantite) || a.designation.localeCompare(b.designation, "fr"));
  const parUnite = new Map<string, number>();
  lignes.forEach((l) => parUnite.set(l.unite, (parUnite.get(l.unite) ?? 0) + Number(l.quantite)));
  return {
    premiers: tries.slice(0, AFFICHES),
    reste: Math.max(0, tries.length - AFFICHES),
    pieces: lignes.reduce((t, l) => t + l.pieces, 0),
    corrections: lignes.reduce((t, l) => t + l.corrections, 0),
    totaux: [...parUnite.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/** Widget P3 : fournitures posées sur la période du tableau de bord (droit « quantités / lire »), lien vers l'inventaire. */
export function FournituresPosees({ marcheId, periode, titrePeriode }: { marcheId: string; periode: Periode; titrePeriode: string }) {
  const [lignes, setLignes] = useState<ResumeFourniture[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [absent, setAbsent] = useState(false);

  useEffect(() => {
    let annule = false;
    setLignes(null);
    setErreur("");
    getSupabase().rpc("resume_fournitures", { p_marche_id: marcheId, p_du: periode.du, p_au: periode.au }).then(({ data, error }) => {
      if (annule) return;
      if (fonctionAbsente(error, data)) setAbsent(true);
      else if (error) setErreur(messageErreur(error));
      else setLignes((data as ResumeFourniture[] | null) ?? []);
    });
    return () => {
      annule = true;
    };
  }, [marcheId, periode.du, periode.au]);

  if (absent) return null;
  const s = lignes ? syntheseFournitures(lignes) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 leading-none"><Package className="size-4 text-muted-foreground" />Fournitures posées</CardTitle>
        <CardDescription>
          {s ? `${s.pieces.toLocaleString("fr-FR")} pièce${s.pieces > 1 ? "s" : ""} posée${s.pieces > 1 ? "s" : ""}` : "Inventaire réel"}
          {s && s.corrections > 0 ? `, dont ${s.corrections} correction${s.corrections > 1 ? "s" : ""} du bureau` : ""} · période : {titrePeriode}.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href={lienFournitures({ du: periode.du, au: periode.au })} prefetch={false}>Inventaire<ArrowRight data-icon="inline-end" /></Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {erreur ? <p className="text-destructive text-sm">{erreur}</p> : !s ? (
          <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6" />)}</div>
        ) : s.premiers.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune pièce posée sur la période.</p>
        ) : (
          <>
            <ul className="divide-y text-sm">
              {s.premiers.map((l) => (
                <li key={`${l.produit_id ?? l.designation}|${l.unite}`} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate">{l.designation}</span>
                    <span className="block truncate text-muted-foreground text-xs">{libelleFamille(l.famille)} · {l.fuites} fuite{l.fuites > 1 ? "s" : ""}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{nombre(Number(l.quantite))} <span className="font-normal text-muted-foreground text-xs">{l.unite}</span></span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground text-xs">
              {s.reste > 0 ? `Et ${s.reste} autre${s.reste > 1 ? "s" : ""} article${s.reste > 1 ? "s" : ""}. ` : ""}
              Total : {s.totaux.map(([u, q]) => `${nombre(q)} ${u}`).join(" · ")}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

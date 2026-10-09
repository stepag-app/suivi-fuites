"use client";

import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { BadgeAnticipe, BadgeStatut } from "@/components/statut";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { joursDepuisAttache, type FuiteAnticipee } from "@/lib/anticipation";
import type { StatutFuite } from "@/lib/types";

const AFFICHEES = 6;

/** A1 : fuites attachées par anticipation dont l'exécution manque, en tête du tableau de bord jusqu'à l'exécution réelle. */
export function AnticipeesPrioritaires({ liste, statuts, maintenant }: {
  liste: FuiteAnticipee[]; statuts: Map<string, StatutFuite>; maintenant: Date;
}) {
  if (!liste.length) return null;
  return (
    <Card className="border-violet-500/30 bg-violet-500/5 ring-violet-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 leading-none">
          <BadgeAnticipe />
          {liste.length} fuite{liste.length > 1 ? "s" : ""} attachée{liste.length > 1 ? "s" : ""} par anticipation, à exécuter en priorité
        </CardTitle>
        <CardDescription>Déjà présentées au maître d&apos;ouvrage : les travaux réels restent à faire. Plus anciennes d&apos;abord.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/a-faire" prefetch={false}>À faire<ArrowRight data-icon="inline-end" /></Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {liste.slice(0, AFFICHEES).map((f) => {
            const jours = joursDepuisAttache(f, maintenant.getTime());
            const statut = statuts.get(f.fuite_id);
            return (
              <li key={f.fuite_id}>
                <Link href={`/fuites/${f.fuite_id}`} prefetch={false}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm hover:border-violet-500/40">
                  <span className="min-w-0">
                    <span className="font-medium">N° {f.fuite_numero}</span>
                    <span className="block truncate text-muted-foreground text-xs">
                      Lot N° {f.premier_lot ?? "?"} · {f.articles} article{f.articles > 1 ? "s" : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {statut && <BadgeStatut statut={statut} court />}
                    {jours != null && <span className="flex items-center gap-1 text-muted-foreground text-xs tabular-nums"><Clock className="size-3" />{jours} j</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        {liste.length > AFFICHEES && <p className="mt-2 text-muted-foreground text-xs">Et {liste.length - AFFICHEES} autre{liste.length - AFFICHEES > 1 ? "s" : ""} dans « À faire ».</p>}
      </CardContent>
    </Card>
  );
}

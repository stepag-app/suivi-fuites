"use client";

// Rappel des pénalités de performance (CPS art. II-23) sur un lot qui porte les prix 1 ou 2 : ce ne sont pas des
// quantités (l'attachement reste à 100 %, 40 % ou 60 %), elles se déduisent des factures n° 1 (balayage) et n° 3
// (maintien), art. I-32. Calcul de la base (debits_resultats, écran Débits de nuit) ; la facture reste faite à la main.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { debit, pourcent, type ResultatDebits } from "@/lib/debits";
import { dateSeule, montant } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export function PerformancesLot({ marcheId, version }: { marcheId: string; version: number }) {
  const [lignes, setLignes] = useState<ResultatDebits[] | null>(null);

  useEffect(() => {
    let actif = true;
    getSupabase().rpc("debits_resultats", { p_marche: marcheId }).then(({ data, error }) => {
      if (actif) setLignes(error ? [] : ((data as ResultatDebits[] | null) ?? []));
    });
    return () => { actif = false; };
  }, [marcheId, version]);

  if (!lignes) return null;
  const zones = lignes.filter((l) => l.niveau === "zone");
  const marche = lignes.find((l) => l.niveau === "marche");
  const provisoire = !marche?.fin_maintien || marche.fin_maintien >= new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal">Pénalités de performance (rappel pour la facture)</CardTitle>
        <CardDescription>
          CPS art. II-23 : 1 % du montant par point de τ manqué, plafond 25 % ; à déduire de la facture n° 1 (balayage) et de la facture
          n° 3 (maintien), art. I-32. Les quantités de l&apos;attachement ne changent pas. Montants au prix du bordereau, hors majoration
          {marche ? ` ; assiette ${marche.assiette === "zone" ? "par zone" : "du marché"}, points ${marche.mode_points === "entiers" ? "entiers" : "proportionnels"}` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {zones.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Pas de résultat de débits lisible (droit « Débits de nuit » ou mesures absentes) :{" "}
            <Link href="/debits" prefetch={false} className="underline underline-offset-4">écran Débits de nuit</Link>.
          </p>
        ) : (
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Zone</TableHead>
                <TableHead className="text-right">Q exigé</TableHead>
                <TableHead className="text-right">Qf (fin de balayage)</TableHead>
                <TableHead className="text-right">τ1</TableHead>
                <TableHead className="text-right">Pénalité balayage</TableHead>
                <TableHead className="text-right">τ2{provisoire ? " (provisoire)" : ""}</TableHead>
                <TableHead className="text-right">Pénalité maintien</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...zones, ...(marche ? [marche] : [])].map((z) => (
                <TableRow key={z.zone_id ?? "marche"} className={cn("hover:bg-transparent", z.niveau === "marche" && "font-medium")}>
                  <TableCell>{z.niveau === "marche" ? "Marché" : <><span className="font-medium">Zone {z.zone_numero}</span> <span className="text-muted-foreground">{z.zone_libelle}</span></>}</TableCell>
                  <TableCell className="text-right tabular-nums">{debit(z.q_exige_m3h)}</TableCell>
                  <TableCell className="text-right tabular-nums">{z.qf_m3h == null ? <span className="text-muted-foreground">non mesuré</span> : debit(z.qf_m3h)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", (z.tau1_pct ?? 0) < 0 && "text-destructive")}>{pourcent(z.tau1_pct)}{z.alerte_arret ? " · arrêt" : ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{z.penalite_balayage == null ? "—" : montant(z.penalite_balayage)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", (z.tau2_pct ?? 0) < 0 && "text-destructive")}>{pourcent(z.tau2_pct)}</TableCell>
                  <TableCell className="text-right tabular-nums">{z.penalite_maintien == null ? "—" : montant(z.penalite_maintien)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {marche?.fin_maintien && (
          <p className="text-muted-foreground text-xs">Fin du maintien : {dateSeule(marche.fin_maintien)}{provisoire ? " ; pénalité de maintien provisoire jusque-là." : "."}</p>
        )}
      </CardContent>
    </Card>
  );
}

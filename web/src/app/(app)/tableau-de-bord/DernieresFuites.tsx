"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Droplets, ExternalLink } from "lucide-react";
import { BadgeStatut, BadgesAlertes } from "@/components/statut";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateHeure, type libellesMarche } from "@/lib/format";
import type { FuiteTdb } from "@/lib/ui/tableau-de-bord";

export type FuiteRecente = FuiteTdb & { reference_srm: string | null; adresse: string | null; detectee_par: string | null };

/** Dernières fuites détectées (modèle « Recent customers »). */
export function DernieresFuites({ fuites, libelles, nombre = 10 }: { fuites: FuiteRecente[]; libelles: ReturnType<typeof libellesMarche>; nombre?: number }) {
  const router = useRouter();
  const recentes = [...fuites].sort((a, b) => b.date_detection.localeCompare(a.date_detection)).slice(0, nombre);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="leading-none">{fuites.length.toLocaleString("fr-FR")} fuites</CardTitle>
        <CardDescription>Les {recentes.length} dernières détectées : référence, secteur, statut et alertes.</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/fuites" prefetch={false}>Toute la liste<ArrowRight data-icon="inline-end" /></Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        <Table className="**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4">
          <TableHeader className="[&_tr]:border-t">
            <TableRow className="hover:bg-transparent">
              <TableHead className="py-3 font-normal">Fuite</TableHead>
              <TableHead className="py-3 font-normal">Secteur</TableHead>
              <TableHead className="py-3 font-normal">Détectée</TableHead>
              <TableHead className="py-3 font-normal">Statut</TableHead>
              <TableHead className="py-3 font-normal">Alertes</TableHead>
              <TableHead className="py-3 text-right font-normal">Photos</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentes.map((f) => (
              <TableRow key={f.id} className="cursor-pointer border-border/60" onClick={() => router.push(`/fuites/${f.id}`)}>
                <TableCell className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-md border bg-muted">
                      <Droplets className="size-4 text-muted-foreground" />
                    </span>
                    <div className="grid min-w-0 gap-0.5">
                      <span className="truncate font-medium text-sm leading-none">N° {f.numero}{f.reference_srm ? ` · ${f.reference_srm}` : ""}</span>
                      <span className="truncate text-muted-foreground text-xs leading-none">{f.adresse ?? "Adresse non renseignée"}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">{f.secteur ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="py-3 tabular-nums">
                  {dateHeure(f.date_detection)}
                  {f.detectee_par && <div className="text-muted-foreground text-xs">{f.detectee_par}</div>}
                </TableCell>
                <TableCell className="py-3"><BadgeStatut statut={f.statut} court /></TableCell>
                <TableCell className="py-3"><BadgesAlertes fuite={f} libelles={libelles} /></TableCell>
                <TableCell className="py-3 text-right tabular-nums">{f.nb_photos}</TableCell>
                <TableCell className="py-3 text-right">
                  <Button variant="ghost" size="icon-sm" asChild onClick={(e) => e.stopPropagation()}>
                    <Link href={`/fuites/${f.id}`} prefetch={false} aria-label={`Ouvrir la fuite N° ${f.numero}`}><ExternalLink /></Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

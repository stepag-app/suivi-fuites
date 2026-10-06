"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Banknote, ReceiptText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { quantite } from "@/lib/attachements";
import { montant } from "@/lib/format";
import {
  jourLong, recapAttachements, resumeLots, type ArticleTdb, type LigneAttacheeTdb, type LotTdb, type UniteResteTdb,
} from "@/lib/ui/tableau-de-bord";
import { cn, pluriel } from "@/lib/utils";

export interface DonneesAttachements {
  lots: LotTdb[];
  articles: ArticleTdb[];
  lignes: LigneAttacheeTdb[];
  unites: UniteResteTdb[];
}

const pct = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR")} %`);

function Cellule({ titre, valeur, note, badge, className }: { titre: string; valeur: string; note: string; badge?: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("gap-5 overflow-hidden rounded-none border-0 border-foreground/10 ring-0", className)}>
      <CardHeader><CardTitle className="font-normal">{titre}</CardTitle></CardHeader>
      <CardContent className="flex items-end justify-between gap-2">
        <div className="space-y-1">
          <div className="text-3xl leading-none tracking-tight tabular-nums">{valeur}</div>
          <p className="text-muted-foreground text-xs">{note}</p>
        </div>
        {badge}
      </CardContent>
    </Card>
  );
}

// Cumul attaché = lots arrêtés (au prix figé à l'arrêt) ; reste à attacher = exécuté − attaché (au prix actuel),
// régularisations comprises. Montants HT au prix du bordereau, sans majoration.
export function BlocAttachements({ donnees, devise }: { donnees: DonneesAttachements; devise: string }) {
  const recap = useMemo(() => recapAttachements(donnees.articles, donnees.lignes, donnees.unites), [donnees]);
  const lots = useMemo(() => resumeLots(donnees.lots), [donnees.lots]);
  const dernier = lots.dernier;
  const vert = "bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h2 className="font-medium text-lg">Attachements</h2>
          <p className="text-muted-foreground text-sm">Montants HT au prix du bordereau, sans majoration.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/attachements" prefetch={false}><ReceiptText data-icon="inline-start" />Ouvrir les lots</Link>
          </Button>
          {dernier && (
            <Button size="sm" asChild>
              <Link href={`/attachements/${dernier.id}`} prefetch={false}>Dernier lot arrêté (N° {String(dernier.numero).padStart(2, "0")})<ArrowRight data-icon="inline-end" /></Link>
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="grid grid-cols-1 xl:grid-cols-8">
          <Cellule className="border-b xl:col-span-4 xl:border-r" titre="Lots arrêtés" valeur={String(lots.arretes)}
            note={[dernier ? `dernier : N° ${String(dernier.numero).padStart(2, "0")}${dernier.date_arret ? ` au ${jourLong(dernier.date_arret)}` : ""}` : "aucun lot arrêté",
              lots.brouillons ? pluriel(lots.brouillons, "brouillon") : ""].filter(Boolean).join(" · ")}
            badge={lots.brouillons ? <Badge variant="outline">{pluriel(lots.brouillons, "brouillon")}</Badge> : undefined} />
          <Cellule className="border-b xl:col-span-4" titre="Attaché (cumul)" valeur={`${Math.round(recap.montantAttache).toLocaleString("fr-FR")} ${devise}`}
            note={recap.avancement == null ? "montant du bordereau inconnu" : `${pct(recap.avancement)} du montant du bordereau`}
            badge={recap.avancement != null ? <Badge className={vert}>{pct(recap.avancement)}</Badge> : undefined} />
          <Cellule className="xl:col-span-4 xl:border-r" titre="Reste à attacher" valeur={`${Math.round(recap.montantReste).toLocaleString("fr-FR")} ${devise}`}
            note={recap.unitesReste ? `${pluriel(recap.unitesReste, "unité")} sur ${pluriel(recap.fuitesReste, "fuite")}${recap.unitesEnBrouillon ? `, dont ${recap.unitesEnBrouillon} dans un brouillon` : ""}` : "rien à attacher"}
            badge={recap.montantReste > 0 ? <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">à attacher</Badge> : <Badge className={vert}>à jour</Badge>} />
          <Cellule className="xl:col-span-4" titre="Montant du bordereau" valeur={recap.montantMarche ? `${Math.round(recap.montantMarche).toLocaleString("fr-FR")} ${devise}` : "—"}
            note="quantités du marché × prix actuels" badge={<Banknote className="size-5 text-muted-foreground" />} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-normal">Par article du bordereau</CardTitle>
          <CardDescription>Attaché (lots arrêtés) et reste à attacher (exécuté, régularisations comprises).</CardDescription>
          <CardAction className="flex items-center gap-3 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" />Attaché</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" />Reste</span>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0">
          {recap.articles.length === 0 ? <p className="px-4 text-muted-foreground text-sm">Aucun article lisible pour ce marché.</p> : (
            <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">N°</TableHead><TableHead>Désignation</TableHead><TableHead>Unité</TableHead>
                  <TableHead className="text-right">Qté marché</TableHead><TableHead className="text-right">Attaché</TableHead>
                  <TableHead className="text-right">Reste</TableHead><TableHead className="text-right">Montant attaché</TableHead>
                  <TableHead className="text-right">Montant restant</TableHead><TableHead className="w-40">% du marché</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recap.articles.map((l) => {
                  const p = Math.min(l.pourcentage ?? 0, 100);
                  return (
                    <TableRow key={l.article.id} className="hover:bg-transparent">
                      <TableCell className="tabular-nums">{l.article.numero}</TableCell>
                      <TableCell className="max-w-72 whitespace-normal"><span className="line-clamp-2">{l.article.designation}</span></TableCell>
                      <TableCell className="text-muted-foreground">{l.article.unite}</TableCell>
                      <TableCell className="text-right tabular-nums">{quantite(l.article.quantite_marche, l.article.unite)}</TableCell>
                      <TableCell className="text-right tabular-nums">{quantite(l.attachee, l.article.unite)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", l.reste < 0 && "text-destructive")}>{quantite(l.reste, l.article.unite)}</TableCell>
                      <TableCell className="text-right tabular-nums">{montant(l.montantAttache)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", l.montantReste < 0 && "text-destructive")}>{montant(l.montantReste)}</TableCell>
                      <TableCell>
                        {l.pourcentage == null ? <span className="text-muted-foreground">—</span> : (
                          <div className="flex items-center gap-2" title={`Attaché ${pct(l.pourcentage)}, reste à attacher ${pct(l.pourcentageReste)} de la quantité du marché`}>
                            <Progress value={p} className="h-2" />
                            <span className={cn("w-12 shrink-0 text-right text-xs tabular-nums", (l.pourcentage ?? 0) > 100 && "text-destructive")}>{pct(l.pourcentage)}</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6}>Total ({devise} HT)</TableCell>
                  <TableCell className="text-right tabular-nums">{montant(recap.montantAttache)}</TableCell>
                  <TableCell className="text-right tabular-nums">{montant(recap.montantReste)}</TableCell>
                  <TableCell>{pct(recap.avancement)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

// Linéaire des prix 1 (balayage) et 2 (maintien) à attacher dans un brouillon (migration 20261016400100).
// CPS art. I-32 : le balayage se paie à son achèvement (facture n° 1), le maintien à 40 % puis 60 % (factures 2 et 3) ;
// les attachements se prennent au fur et à mesure : ajouter le linéaire chaque mois reste une option du responsable.
import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleAlert, Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LineaireAAttacher as Ligne } from "@/lib/attachements";
import { dateSeule, messageErreur } from "@/lib/format";
import { fonctionAbsente, getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const km = (m: number | null | undefined) =>
  m == null ? "—" : `${(Number(m) / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} km`;
const metres = (m: number | null | undefined) =>
  m == null ? "—" : `${Number(m).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m`;

function Etat({ l }: { l: Ligne }) {
  if (l.dans_lot) return <Badge variant="outline" className="border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300">Dans ce lot</Badge>;
  if (l.autre_brouillon) return <Badge variant="outline" title={`Déjà dans le brouillon « ${l.autre_brouillon} »`}>Autre brouillon</Badge>;
  if (l.famille === "maintien" && !l.disponible) return <span className="text-muted-foreground text-xs">à partir du {dateSeule(l.phase_fin)}</span>;
  if (l.proposee === 0) return <span className="text-muted-foreground text-xs">rien à attacher</span>;
  return <span className="text-muted-foreground text-xs">à ajouter</span>;
}

export function LineaireAAttacher({ lotId, version, modifiable, ajoute, onErreur }: {
  lotId: string; version: number; modifiable: boolean; ajoute: () => void; onErreur: (m: string) => void;
}) {
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [absente, setAbsente] = useState(false);
  const [occupe, setOccupe] = useState(false);

  useEffect(() => {
    let actif = true;
    getSupabase().rpc("lineaire_a_attacher", { p_attachement: lotId }).then(({ data, error }) => {
      if (!actif) return;
      if (fonctionAbsente(error, data)) return setAbsente(true);
      if (error) return onErreur(messageErreur(error));
      setLignes((data as Ligne[] | null) ?? []);
    });
    return () => { actif = false; };
  }, [lotId, version, onErreur]);

  if (absente || !lignes || lignes.length === 0) return null;

  const p1 = lignes.filter((l) => l.famille === "balayage");
  const p2 = lignes.filter((l) => l.famille === "maintien");
  const au = lignes[0].au;
  const aAjouter = (liste: Ligne[]) => liste.filter((l) => !l.dans_lot && !l.autre_brouillon && l.proposee !== 0);
  const somme = (liste: Ligne[], f: (l: Ligne) => number) => liste.reduce((s, l) => s + Number(f(l) ?? 0), 0);

  async function ajouter(famille: "balayage" | "maintien") {
    setOccupe(true);
    const { data, error } = await getSupabase().rpc("ajouter_lineaire_attachement", { p_attachement: lotId, p_famille: famille });
    setOccupe(false);
    if (error) return onErreur(messageErreur(error));
    if (!data) return onErreur("Aucune ligne ajoutée : rien à attacher, ou zones déjà dans un autre brouillon.");
    ajoute();
  }

  // Prix 1 : plafond du marché (bordereau), sans plafond par zone (le tableau n° 1 donne un linéaire approximatif)
  const marche1 = p1[0];
  const resteMarche = marche1?.quantite_marche != null ? Number(marche1.quantite_marche) - Number(marche1.attachee_marche) : null;
  const horsPlafond = somme(p1.filter((l) => l.reste > 0), (l) => l.reste - l.proposee);
  const sansZone = Number(marche1?.balaye_sans_zone_m ?? 0);
  const p1AAjouter = aAjouter(p1);

  // Prix 2 : tranches par phase (40 % puis 60 %), base = prix 1 attaché de la zone
  const phases = [...new Map(p2.map((l) => [l.phase_id, l])).values()];
  const p2AAjouter = aAjouter(p2);
  const p2Visible = p2.some((l) => l.disponible || l.attachee !== 0 || l.dans_lot);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-normal">Linéaire balayé et maintien (prix 1 et 2)</CardTitle>
        <CardDescription>
          Option : le CPS paie le balayage à son achèvement (facture n° 1, art. I-32) ; vous pouvez l&apos;attacher chaque mois.
          Premiers passages datés jusqu&apos;au {dateSeule(au)} (« travaux exécutés au » du lot, à défaut aujourd&apos;hui), branchements exclus ;
          un mètre n&apos;est jamais attaché deux fois.
        </CardDescription>
        {modifiable && (
          <CardAction>
            <Button size="sm" disabled={occupe || p1AAjouter.length === 0} onClick={() => ajouter("balayage")}>
              <Plus data-icon="inline-start" />Ajouter le linéaire balayé{p1AAjouter.length ? ` (${km(somme(p1AAjouter, (l) => l.proposee))})` : ""}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Zone</TableHead>
              <TableHead className="text-right" title="Tableau n° 1 du CPS : linéaire approximatif, sans plafond par zone">Contrat (approx.)</TableHead>
              <TableHead className="text-right">Balayé au {dateSeule(au)}</TableHead>
              <TableHead className="text-right">Déjà attaché</TableHead>
              <TableHead className="text-right">À attacher</TableHead>
              <TableHead>État</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {p1.map((l) => (
              <TableRow key={l.zone_id} className="hover:bg-transparent">
                <TableCell><span className="font-medium">Zone {l.zone_numero}</span> <span className="text-muted-foreground">{l.zone}</span></TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{km(l.zone_lineaire_contrat_m)}</TableCell>
                <TableCell className={cn("text-right tabular-nums", l.zone_lineaire_contrat_m != null && l.executee > l.zone_lineaire_contrat_m && "text-amber-600 dark:text-amber-400")}
                  title={l.zone_lineaire_contrat_m != null && l.executee > l.zone_lineaire_contrat_m ? "Au-delà du linéaire approximatif de la zone (information)" : undefined}>
                  {km(l.executee)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{km(l.attachee)}</TableCell>
                <TableCell className={cn("text-right font-medium tabular-nums", l.proposee < 0 && "text-destructive")}>{km(l.proposee)}</TableCell>
                <TableCell><Etat l={l} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{km(somme(p1, (l) => l.zone_lineaire_contrat_m ?? 0))}</TableCell>
              <TableCell className="text-right tabular-nums">{km(somme(p1, (l) => l.executee))}</TableCell>
              <TableCell className="text-right tabular-nums">{km(somme(p1, (l) => l.attachee))}</TableCell>
              <TableCell className="text-right tabular-nums">{km(somme(p1, (l) => l.proposee))}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
        {marche1 && (
          <p className="text-muted-foreground text-xs">
            Prix {marche1.prix_numero} : quantité du marché {metres(marche1.quantite_marche)} (bordereau, plafond du cumul) ;
            attaché dans les lots arrêtés {metres(marche1.attachee_marche)} ; reste {metres(resteMarche)}.
          </p>
        )}
        {horsPlafond > 0.005 && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
            <CircleAlert />
            <AlertDescription className="text-amber-900/90 dark:text-amber-50/90">
              {km(horsPlafond)} balayés au-delà de la quantité du marché ne sont pas attachés (avenant ou refacturation forcée par l&apos;administrateur).
            </AlertDescription>
          </Alert>
        )}
        {sansZone > 0.005 && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
            <CircleAlert />
            <AlertDescription className="text-amber-900/90 dark:text-amber-50/90">
              {km(sansZone)} balayés sur des tronçons sans zone ne sont pas comptés :{" "}
              <Link href="/parametres?onglet=reseau" prefetch={false} className="underline underline-offset-4">affectez-les à un secteur (Paramètres › Réseau)</Link>.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-sm">
            <span className="font-medium">Maintien (prix {p2[0]?.prix_numero ?? "2"})</span>{" "}
            <span className="text-muted-foreground">
              {phases.length
                ? phases.map((ph) => `${ph.phase}${ph.phase?.includes("%") ? "" : ` (${Number(ph.part_pct)} %)`} : ${ph.disponible ? "disponible" : `à partir du ${dateSeule(ph.phase_fin)}`}`).join(" ; ")
                : "aucune phase portant une part du prix (Paramètres › Débits de nuit)"}
              {phases.length ? " ; base : linéaire balayé attaché de chaque zone." : ""}
            </span>
          </p>
          {modifiable && p2AAjouter.length > 0 && (
            <Button size="sm" variant="outline" disabled={occupe} onClick={() => ajouter("maintien")}>
              <Plus data-icon="inline-start" />Ajouter le maintien ({km(somme(p2AAjouter, (l) => l.proposee))})
            </Button>
          )}
        </div>
        {p2Visible && (
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Tranche</TableHead><TableHead>Zone</TableHead>
                <TableHead className="text-right">Base (prix 1 attaché)</TableHead>
                <TableHead className="text-right">Tranche</TableHead>
                <TableHead className="text-right">Déjà attaché</TableHead>
                <TableHead className="text-right">À attacher</TableHead>
                <TableHead>État</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p2.filter((l) => l.disponible || l.attachee !== 0 || l.dans_lot).map((l) => (
                <TableRow key={`${l.phase_id}-${l.zone_id}`} className="hover:bg-transparent">
                  <TableCell>{l.phase} ({Number(l.part_pct)} %)</TableCell>
                  <TableCell>Zone {l.zone_numero}{l.zone_arret_srm_le ? <span className="text-muted-foreground"> · arrêtée le {dateSeule(l.zone_arret_srm_le)}</span> : null}</TableCell>
                  <TableCell className="text-right tabular-nums">{km(l.base)}</TableCell>
                  <TableCell className="text-right tabular-nums">{km(l.executee)}</TableCell>
                  <TableCell className="text-right tabular-nums">{km(l.attachee)}</TableCell>
                  <TableCell className={cn("text-right font-medium tabular-nums", l.proposee < 0 && "text-destructive")}>{km(l.proposee)}</TableCell>
                  <TableCell><Etat l={l} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

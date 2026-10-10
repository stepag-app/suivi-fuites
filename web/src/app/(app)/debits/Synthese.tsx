"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { AlertTriangle, Info } from "lucide-react";
import { BandeKpi } from "@/components/carte-indicateur";
import { Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { montant } from "@/lib/format";
import { ASSIETTES, MODES_POINTS, debit, jourFr, pourcent, type ResultatDebits } from "@/lib/debits";
import { cn } from "@/lib/utils";
import type { DonneesDebits } from "./donnees";

const ton = (t: number | null) => (t == null ? "" : t < 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400");

function Approche({ oui, nuits }: { oui: boolean | null; nuits?: number | null }) {
  return (
    <>
      {oui && <span title="Somme des minimums des points : valeur approchée" className="ml-1 text-amber-600 text-xs">≈</span>}
      {nuits != null && nuits < 3 && <span title="Moins de trois nuits complètes (art. II-17 et II-22)" className="ml-1 text-muted-foreground text-xs">{nuits} n.</span>}
    </>
  );
}

function LigneZone({ r, montants }: { r: ResultatDebits; montants: boolean }) {
  const marche = r.niveau === "marche";
  return (
    <TableRow className={cn(marche && "bg-muted/50 font-medium")}>
      <TableCell className="whitespace-nowrap">{marche ? "Marché" : <><span className="font-medium">Zone {r.zone_numero}</span><span className="block max-w-56 truncate text-muted-foreground text-xs">{r.zone_libelle}</span></>}</TableCell>
      <TableCell className="text-right tabular-nums">{debit(r.q_exige_m3h, 0)}</TableCell>
      <TableCell className="text-right tabular-nums">{debit(r.qi_m3h)}<Approche oui={r.qi_approche} nuits={marche ? null : r.qi_nuits} /></TableCell>
      <TableCell className="text-right tabular-nums">{debit(r.qf_m3h)}<Approche oui={r.qf_approche} nuits={marche ? null : r.qf_nuits} /></TableCell>
      <TableCell className="text-right tabular-nums">{debit(r.delta_q_m3h)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", ton(r.tau1_pct))}>{pourcent(r.tau1_pct)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {r.points_balayage == null ? "—" : `${debit(r.points_balayage, 2)} pt`}
        {montants && r.penalite_balayage != null && <span className="block text-muted-foreground text-xs">{montant(r.penalite_balayage)}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {r.nb_controles || "—"}
        {r.ecart_controles_max_j != null && r.ecart_controles_max_j > 7 && <span title="Intervalle entre deux contrôles au-delà de 7 jours (art. II-15)" className="ml-1 text-amber-600 text-xs">{r.ecart_controles_max_j} j</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{debit(r.q_maintien_moyen_m3h)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", ton(r.tau2_pct))}>{pourcent(r.tau2_pct)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {r.points_maintien == null ? "—" : `${debit(r.points_maintien, 2)} pt`}
        {montants && r.penalite_maintien != null && <span className="block text-muted-foreground text-xs">{montant(r.penalite_maintien)}</span>}
      </TableCell>
      <TableCell className="text-right tabular-nums">{r.degradation_pct == null ? "—" : `${debit(r.degradation_pct, 1)} %`}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {r.alerte_arret && <Badge variant="destructive">Arrêt de zone</Badge>}
          {r.alerte_degradation && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">Dégradation</Badge>}
        </div>
      </TableCell>
    </TableRow>
  );
}

const COULEURS = { avant: "var(--color-sky-500)", apres: "var(--color-emerald-600)", maintien: "var(--color-violet-500)", libre: "var(--color-amber-500)" } as const;
const configCourbe = {
  avant: { label: "Avant (Qi)", color: COULEURS.avant },
  apres: { label: "Après balayage (Qf)", color: COULEURS.apres },
  maintien: { label: "Maintien", color: COULEURS.maintien },
  libre: { label: "Libre", color: COULEURS.libre },
} satisfies ChartConfig;

function Courbe({ d }: { d: DonneesDebits }) {
  const zones = d.zones.filter((z) => z.actif !== false);
  const [zoneId, setZoneId] = useState(zones[0]?.id ?? "");
  const zone = zones.find((z) => z.id === zoneId);
  const res = d.resultats.find((r) => r.zone_id === zoneId);
  const donnees = useMemo(() => {
    const parNuit = new Map<string, Record<string, number | string>>();
    for (const n of d.nuits.filter((x) => x.zone_id === zoneId && x.complete && x.q_zone_m3h != null)) {
      const l = parNuit.get(n.nuit) ?? { nuit: n.nuit, jour: jourFr(n.nuit).slice(0, 5) };
      const prec = l[n.campagne_type];
      l[n.campagne_type] = typeof prec === "number" ? Math.min(prec, n.q_zone_m3h!) : n.q_zone_m3h!;
      parNuit.set(n.nuit, l);
    }
    return [...parNuit.values()].sort((a, b) => String(a.nuit).localeCompare(String(b.nuit)));
  }, [d.nuits, zoneId]);
  const types = (["avant", "apres", "maintien", "libre"] as const).filter((t) => donnees.some((x) => x[t] != null));
  const valeurs = donnees.flatMap((x) => types.map((t) => Number(x[t])).filter(Number.isFinite));
  const bornes = [...valeurs, zone?.q_exige_m3h ?? NaN, res?.qf_m3h ?? NaN].filter(Number.isFinite);
  const min = bornes.length ? Math.floor(Math.min(...bornes) * 0.9) : 0;
  const max = bornes.length ? Math.ceil(Math.max(...bornes) * 1.05) : 10;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Débit de nuit dans le temps</CardTitle>
          <CardDescription>Nuits complètes et validées, face au Q exigé (tableau n° 1) et au Q à maintenir (Qf).</CardDescription>
        </div>
        <Select value={zoneId} onValueChange={setZoneId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Zone" /></SelectTrigger>
          <SelectContent><SelectGroup>{zones.map((z) => <SelectItem key={z.id} value={z.id}>Zone {z.numero} – {z.libelle}</SelectItem>)}</SelectGroup></SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {donnees.length === 0 ? <Vide>Aucune nuit complète mesurée pour cette zone.</Vide> : (
          <ChartContainer config={configCourbe} className="aspect-auto h-72 w-full">
            <LineChart accessibilityLayer data={donnees} margin={{ top: 8, left: 0, right: 16, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="jour" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
              <YAxis domain={[min, max]} tickLine={false} axisLine={false} width={44} unit="" />
              <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={(_v, p) => `Nuit du ${jourFr(String(p[0]?.payload.nuit))}`} />} />
              <ChartLegend verticalAlign="top" content={<ChartLegendContent className="mb-4 justify-end" />} />
              {zone?.q_exige_m3h != null && (
                <ReferenceLine y={zone.q_exige_m3h} stroke="var(--destructive)" strokeDasharray="6 4"
                  label={{ value: `Q exigé ${debit(zone.q_exige_m3h, 0)}`, position: "insideTopLeft", fontSize: 11, fill: "var(--destructive)" }} />
              )}
              {res?.qf_m3h != null && (
                <ReferenceLine y={res.qf_m3h} stroke={COULEURS.apres} strokeDasharray="2 4"
                  label={{ value: `Q à maintenir ${debit(res.qf_m3h)}`, position: "insideBottomLeft", fontSize: 11, fill: COULEURS.apres }} />
              )}
              {types.map((t) => (
                <Line key={t} dataKey={t} type="monotone" stroke={`var(--color-${t})`} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function Synthese({ d, montants }: { d: DonneesDebits; montants: boolean }) {
  const marche = d.resultats.find((r) => r.niveau === "marche");
  const zones = d.resultats.filter((r) => r.niveau === "zone");
  const arrets = zones.filter((r) => r.alerte_arret);
  const degradations = zones.filter((r) => r.alerte_degradation);
  const aujourdhui = new Date().toISOString().slice(0, 10);
  const provisoire = !marche?.fin_maintien || marche.fin_maintien >= aujourdhui;
  const ecartTrop = zones.some((r) => (r.ecart_controles_max_j ?? 0) > 7);

  if (!zones.length) return <Vide>Aucune zone active dans ce marché.</Vide>;
  return (
    <div className="flex flex-col gap-4">
      <BandeKpi colonnes={5} cellules={[
        { titre: "τ1 du marché (balayage)", valeur: <span className={ton(marche?.tau1_pct ?? null)}>{pourcent(marche?.tau1_pct)}</span>,
          note: marche?.qf_m3h != null ? `Qf ${debit(marche.qf_m3h)} m³/h pour ${debit(marche.q_exige_m3h, 0)} exigés` : "Qf pas encore mesuré sur toutes les zones" },
        { titre: "Pénalité de balayage estimée", valeur: montants && marche?.penalite_balayage != null ? montant(marche.penalite_balayage) : `${debit(marche?.points_balayage, 2)} pt`,
          note: montants ? "au prix du bordereau, hors majoration" : "montant : droit « quantités / lire »" },
        { titre: "Pénalité de maintien estimée", valeur: montants && marche?.penalite_maintien != null ? montant(marche.penalite_maintien) : `${debit(marche?.points_maintien, 2)} pt`,
          note: provisoire ? "provisoire : calculée après les 8 mois de maintien" : "période de maintien achevée" },
        { titre: "Zones en alerte", valeur: arrets.length + degradations.length,
          badge: arrets.length ? <Badge variant="destructive">{arrets.length} arrêt{arrets.length > 1 ? "s" : ""}</Badge> : undefined,
          note: degradations.length ? `${degradations.length} dégradation${degradations.length > 1 ? "s" : ""} des gains au-delà de ${d.reglages.debits_seuil_degradation_pct} %` : "aucune dégradation signalée" },
        { titre: "Dernier contrôle de maintien", valeur: marche?.dernier_controle ? jourFr(marche.dernier_controle) : "—",
          note: marche?.nb_controles ? `${marche.nb_controles} contrôle${marche.nb_controles > 1 ? "s" : ""} ; écart maximal ${marche.ecart_controles_max_j ?? "—"} j` : "aucun contrôle" },
      ]} />

      {arrets.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Alerte « arrêt de zone » (τ1 &lt; −{d.reglages.debits_seuil_arret_pct} %)</AlertTitle>
          <AlertDescription>
            {arrets.map((r) => `zone ${r.zone_numero} (τ1 ${pourcent(r.tau1_pct)})`).join(", ")} : la SRM peut arrêter la recherche et la réparation sur la zone
            à l&apos;achèvement du premier balayage (art. II-23).
          </AlertDescription>
        </Alert>
      )}
      {ecartTrop && (
        <Alert>
          <Info />
          <AlertTitle>Contrôles de maintien espacés de plus de 7 jours</AlertTitle>
          <AlertDescription>L&apos;intervalle entre deux dates de contrôle doit être constant et ne pas dépasser sept jours (art. II-15).</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Performances par zone</CardTitle>
          <CardDescription>
            τ1 = (Q exigé − Qf) / Q exigé ; τ2 = (Qf − moyenne des contrôles) / Qf ; 1 % du montant par point non atteint, plafond {d.reglages.debits_plafond_pct} %.
            Assiette : {ASSIETTES[d.reglages.debits_assiette].toLowerCase()} ; points : {MODES_POINTS[d.reglages.debits_points].toLowerCase()} (assiette à confirmer avec la SRM).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Zone</TableHead>
                <TableHead className="text-right">Q exigé</TableHead>
                <TableHead className="text-right">Qi</TableHead>
                <TableHead className="text-right">Qf</TableHead>
                <TableHead className="text-right">ΔQ</TableHead>
                <TableHead className="text-right">τ1</TableHead>
                <TableHead className="text-right">Pénalité balayage</TableHead>
                <TableHead className="text-right">Contrôles</TableHead>
                <TableHead className="text-right">Moyenne maintien</TableHead>
                <TableHead className="text-right">τ2</TableHead>
                <TableHead className="text-right">Pénalité maintien</TableHead>
                <TableHead className="text-right">Dégradation</TableHead>
                <TableHead>Alertes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.resultats.map((r) => <LigneZone key={r.zone_id ?? "marche"} r={r} montants={montants} />)}
            </TableBody>
          </Table>
          <p className="mt-3 text-muted-foreground text-xs">
            Débits en m³/h. « ≈ » : somme des minimums des points (approchée) ; « 2 n. » : moins de trois nuits complètes. Seules les mesures validées
            comptent. Dégradation : (moyenne des contrôles − Qf) en % du gain ΔQ ; alerte au-delà de {d.reglages.debits_seuil_degradation_pct} %.
          </p>
        </CardContent>
      </Card>

      <Courbe d={d} />
    </div>
  );
}

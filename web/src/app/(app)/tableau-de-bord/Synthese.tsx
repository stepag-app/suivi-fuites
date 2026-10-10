"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Camera, CircleAlert, Clock3, Droplets, Hourglass, Wrench } from "lucide-react";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Label, Line, Pie, PieChart, XAxis, YAxis } from "recharts";
import { BandeKpi, CarteIndicateur, GrilleIndicateurs } from "@/components/carte-indicateur";
import { Vide } from "@/components/en-tete-page";
import { ORDRE_STATUTS, STATUT_STYLE } from "@/components/statut";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { StatutFuite } from "@/lib/types";
import { nonReparees, refectionsAFaire } from "@/lib/ui/indicateurs";
import {
  activite, ajouterJours, detecteesSur, jourCasa, jourCourt, jourLong, parGroupe, parSemaine, repartitionStatuts, resumeAnomalies, situation,
  trierGroupes, type ColonneGroupe, type FuiteTdb, type LigneGroupe, type Periode, type Regroupement,
} from "@/lib/ui/tableau-de-bord";
import { cn, pluriel, pourcent } from "@/lib/utils";
import { STATUTS_EN_ATTENTE, lienFuites, type FiltresListe } from "../fuites/filtres";
import { ChiffreLien, lienOuNul, nombreFuites, surPeriode } from "./LienListe";

export type Anomalie = { fuite_id: string; anomalie: string };

const heures = (h: number | null) => (h == null ? null : Math.round(h));

// Période précédente de même nature : le mois d'avant pour un mois entier, sinon un décalage de même longueur.
function periodePrecedente(p: Periode): Periode {
  const veille = ajouterJours(p.du, -1);
  if (p.du.endsWith("-01") && p.au.slice(0, 7) === p.du.slice(0, 7)) return { du: `${veille.slice(0, 7)}-01`, au: veille };
  const jours = Math.round((new Date(`${p.au}T00:00:00Z`).getTime() - new Date(`${p.du}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  return { du: ajouterJours(p.du, -jours), au: veille };
}

function calculerTendance(actuel: number | null, precedent: number | null, unite = "", moinsEstMieux?: boolean) {
  if (actuel == null || precedent == null) return undefined;
  const delta = Math.round(actuel - precedent);
  const sens = delta > 0 ? "haut" : delta < 0 ? "bas" : "neutre";
  const bon = moinsEstMieux == null || delta === 0 ? undefined : moinsEstMieux ? delta < 0 : delta > 0;
  return { texte: `${delta > 0 ? "+" : ""}${delta.toLocaleString("fr-FR")}${unite}`, sens: sens as "haut" | "bas" | "neutre", bon };
}

export function Synthese({ fuites, anomalies, maintenant, periode, titrePeriode, seuilH, comparer = true }: {
  fuites: FuiteTdb[]; anomalies: Anomalie[] | null; maintenant: Date; periode: Periode; titrePeriode: string; seuilH: number;
  /** Flèches de comparaison avec la période précédente (masquées pour « Depuis le début du marché »). */
  comparer?: boolean;
}) {
  const c = useMemo(() => {
    const aujourdHui = jourCasa(maintenant);
    const prec = periodePrecedente(periode);
    return {
      act: activite(fuites, periode),
      actPrec: activite(fuites, prec),
      prec,
      sit: situation(fuites),
      retard: nonReparees(fuites, seuilH, maintenant),
      refections: refectionsAFaire(fuites, maintenant),
      statutsPeriode: repartitionStatuts(detecteesSur(fuites, periode)),
      statutsTout: repartitionStatuts(fuites),
      semaines: parSemaine(fuites, periode.au < aujourdHui ? periode.au : aujourdHui, 12),
      anomalies: anomalies ? resumeAnomalies(anomalies) : null,
    };
  }, [fuites, anomalies, maintenant, periode, seuilH]);
  const { act, sit } = c;
  const actPrec = comparer ? c.actPrec : null;
  const tendance = (actuel: number | null, precedent: number | null | undefined, unite = "", moinsEstMieux?: boolean) =>
    precedent === undefined ? undefined : calculerTendance(actuel, precedent, unite, moinsEstMieux);
  const libellePrec = `période précédente : ${act.detectees ? "" : ""}${surPeriode(jourLong(c.prec.du))} → ${jourLong(c.prec.au)}`;

  return (
    <>
      <GrilleIndicateurs>
        <CarteIndicateur icone={Droplets} libelle="Fuites détectées" valeur={act.detectees}
          tendance={tendance(act.detectees, actPrec?.detectees)}
          href={lienOuNul({ du: periode.du, au: periode.au }, act.detectees)}
          description={`${nombreFuites(act.detectees, "détectée")} ${surPeriode(titrePeriode)}`}
          commentaire={!act.detectees ? "aucune sur la période"
            : act.detecteesEnAttente ? `dont ${pluriel(act.detecteesEnAttente, "encore non réparée", "encore non réparées")}` : "toutes réparées ou closes"}
          serie={c.semaines.map((s) => s.detectees)} titreCourbe="Fuites détectées par semaine, 12 semaines" />
        <CarteIndicateur icone={Wrench} libelle="Fuites réparées" valeur={act.reparees}
          tendance={tendance(act.reparees, actPrec?.reparees, "", false)}
          commentaire={act.reparees ? `dont ${pluriel(act.repareesAchevees, "achevée")} (réfection faite ou inutile)` : "aucune sur la période"}
          serie={c.semaines.map((s) => s.reparees)} titreCourbe="Fuites réparées par semaine, 12 semaines" />
        <CarteIndicateur icone={Clock3} libelle="Délai moyen détection → réparation" valeur={heures(act.delaiMoyenH)} unite="h"
          tendance={tendance(heures(act.delaiMoyenH), actPrec && heures(actPrec.delaiMoyenH), " h", true)}
          commentaire={act.nbDelais ? `sur ${pluriel(act.nbDelais, "réparation")} de la période` : "aucune réparation sur la période"}
          serie={c.semaines.flatMap((s) => (s.delaiMoyenH == null ? [] : [Math.round(s.delaiMoyenH)]))}
          titreCourbe="Délai moyen par semaine de réparation, 12 semaines (heures)" />
        <CarteIndicateur icone={Hourglass} libelle="Délai médian détection → réparation" valeur={heures(act.delaiMedianH)} unite="h"
          tendance={tendance(heures(act.delaiMedianH), actPrec && heures(actPrec.delaiMedianH), " h", true)}
          commentaire={act.delaiMaxH != null ? `le plus long : ${Math.round(act.delaiMaxH)} h` : "aucune réparation sur la période"} />
      </GrilleIndicateurs>
      {comparer && <p className="sr-only">{libellePrec}</p>}

      <GraphiqueSemaines semaines={c.semaines} />

      <div className="space-y-1">
        <h2 className="font-medium text-lg">Situation à ce jour</h2>
        <p className="text-muted-foreground text-sm">Quelle que soit la période choisie.</p>
      </div>
      <BandeKpi
        cellules={[
          {
            titre: `Non réparées > ${seuilH} h`, valeur: c.retard.valeur ?? "—",
            badge: c.retard.valeur ? <Badge className="bg-destructive/10 text-destructive"><ArrowUpRight />alerte</Badge> : <Badge className="bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300">à jour</Badge>,
            note: <span>{c.retard.commentaire}</span>,
            href: lienOuNul({ alerte: "alerte_non_reparee" }, c.retard.valeur ?? 0),
          },
          {
            titre: "Réfections à faire", valeur: c.refections.valeur ?? "—",
            badge: <Badge variant="outline" className="text-muted-foreground"><Wrench />réparées</Badge>,
            note: <span>{c.refections.commentaire}</span>,
            href: lienOuNul({ statuts: ["reparee"] }, c.refections.valeur ?? 0),
          },
          {
            titre: "Réfections chaussée hors délai", valeur: sit.refectionsHorsDelai,
            badge: sit.refectionsHorsDelai ? <Badge className="bg-destructive/10 text-destructive"><ArrowUpRight />délai dépassé</Badge> : undefined,
            note: <span>{sit.refectionsTrottoirAlerte ? `et ${pluriel(sit.refectionsTrottoirAlerte, "réfection trottoir", "réfections trottoir")} en alerte` : "délai de réfection du marché"}</span>,
          },
          {
            titre: "Fuites sans photo", valeur: sit.sansPhoto,
            badge: <Badge variant="outline" className="text-muted-foreground"><Camera />photos</Badge>,
            note: <span>dont {pluriel(act.detecteesSansPhoto, "détectée")} sur la période</span>,
          },
          ...(c.anomalies ? [{
            titre: "Anomalies ouvertes", valeur: c.anomalies.total,
            badge: c.anomalies.total ? <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300"><CircleAlert />à vérifier</Badge> : <Badge className="bg-green-500/10 text-green-700 dark:text-green-300"><ArrowDownRight />aucune</Badge>,
            note: <span>{c.anomalies.total ? `${pluriel(c.anomalies.fuites, "fuite")} ; surtout : ${c.anomalies.types[0].libelle.toLowerCase()} (${c.anomalies.types[0].nombre})` : "aucune anomalie détectée"}</span>,
          }] : []),
        ]}
        colonnes={c.anomalies ? 5 : 4}
      />

      <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <RepartitionStatuts periode={c.statutsPeriode} tout={c.statutsTout} libellePeriode={titrePeriode} bornes={periode} />
        </div>
        <div className="xl:col-span-7">
          <TableauGroupes fuites={fuites} periode={periode} titrePeriode={titrePeriode} compact />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Évolution par semaine : aire (détectées), ligne (réparées), délai moyen en colonnes
// ---------------------------------------------------------------------------
const configSemaines = {
  detectees: { label: "Détectées", color: STATUT_STYLE.detectee.couleur },
  reparees: { label: "Réparées", color: STATUT_STYLE.achevee.couleur },
  delai: { label: "Délai moyen (h)", color: "var(--chart-2)" },
} satisfies ChartConfig;

function GraphiqueSemaines({ semaines }: { semaines: ReturnType<typeof parSemaine> }) {
  const [vue, setVue] = useState<"volumes" | "delais">("volumes");
  const donnees = semaines.map((s) => ({
    semaine: `S${s.numero}`, periode: `du ${jourCourt(s.lundi)} au ${jourCourt(s.dimanche)}`,
    detectees: s.detectees, reparees: s.reparees, delai: s.delaiMoyenH == null ? null : Math.round(s.delaiMoyenH),
  }));
  const total = (cle: "detectees" | "reparees") => semaines.reduce((t, x) => t + x[cle], 0);
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle className="leading-none">Activité par semaine</CardTitle>
        <CardDescription>
          <span className="@[540px]/card:block hidden">{pluriel(total("detectees"), "fuite détectée", "fuites détectées")} et {pluriel(total("reparees"), "réparée")} sur 12 semaines, jusqu&apos;au {jourLong(semaines[semaines.length - 1].dimanche)}</span>
          <span className="@[540px]/card:hidden">12 dernières semaines</span>
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          <Select value={vue} onValueChange={(v) => setVue(v as typeof vue)}>
            <SelectTrigger size="sm" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="volumes">Volumes</SelectItem>
                <SelectItem value="delais">Délai moyen</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={configSemaines} className="aspect-auto h-72 w-full">
          <ComposedChart data={donnees} margin={{ top: 0, left: 0, right: 0 }}>
            <defs>
              <linearGradient id="fillDetectees" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-detectees)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-detectees)" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeOpacity={0.5} />
            <XAxis dataKey="semaine" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis hide allowDecimals={false} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent className="w-52" indicator="line" labelFormatter={(_v, p) => `${p[0]?.payload.semaine} · ${p[0]?.payload.periode}`} />} />
            <ChartLegend verticalAlign="top" content={<ChartLegendContent className="mb-5 justify-end" />} />
            {vue === "volumes" ? (
              <>
                <Area dataKey="detectees" type="natural" fill="url(#fillDetectees)" stroke="var(--color-detectees)" strokeWidth={1.5} dot={false} fillOpacity={1} />
                <Line dataKey="reparees" type="natural" stroke="var(--color-reparees)" strokeWidth={1.6} dot={false} />
              </>
            ) : (
              <Bar dataKey="delai" fill="var(--color-delai)" radius={[6, 6, 0, 0]} barSize={28} fillOpacity={0.8} />
            )}
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Répartition par statut : anneau + tableau période / marché, chiffres cliquables
// ---------------------------------------------------------------------------
const configStatuts = Object.fromEntries(ORDRE_STATUTS.map((s) => [s, { label: STATUT_STYLE[s].court, color: STATUT_STYLE[s].couleur }])) as ChartConfig;

function RepartitionStatuts({ periode, tout, libellePeriode, bornes }: {
  periode: Record<StatutFuite, number>; tout: Record<StatutFuite, number>; libellePeriode: string; bornes: Periode;
}) {
  const [ensemble, setEnsemble] = useState<"periode" | "marche">("marche");
  const source = ensemble === "periode" ? periode : tout;
  const totalPeriode = ORDRE_STATUTS.reduce((s, k) => s + periode[k], 0);
  const totalTout = ORDRE_STATUTS.reduce((s, k) => s + tout[k], 0);
  const total = ensemble === "periode" ? totalPeriode : totalTout;
  const donnees = ORDRE_STATUTS.filter((k) => source[k] > 0).map((k) => ({ statut: k, nombre: source[k], fill: STATUT_STYLE[k].couleur }));
  const surLaPeriode = surPeriode(libellePeriode);
  const statut = (k: StatutFuite) => `au statut « ${STATUT_STYLE[k].libelle} »`;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="font-normal">Répartition par statut</CardTitle>
        <CardDescription>{ensemble === "periode" ? `Détectées ${surLaPeriode}` : "Toutes les fuites du marché"}</CardDescription>
        <CardAction>
          <ToggleGroup type="single" size="sm" variant="outline" spacing={0} value={ensemble} onValueChange={(v) => v && setEnsemble(v as typeof ensemble)}>
            <ToggleGroupItem value="periode">Période</ToggleGroupItem>
            <ToggleGroupItem value="marche">Marché</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ChartContainer config={configStatuts} className="mx-auto aspect-square h-48">
          <PieChart>
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey="statut" />} />
            <Pie data={donnees} dataKey="nombre" nameKey="statut" innerRadius={56} strokeWidth={4} paddingAngle={2}>
              {donnees.map((d) => <Cell key={d.statut} fill={d.fill} />)}
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !("cx" in viewBox) || !("cy" in viewBox)) return null;
                  return (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground font-medium text-3xl tabular-nums">{total.toLocaleString("fr-FR")}</tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-muted-foreground text-xs">fuite{total > 1 ? "s" : ""}</tspan>
                    </text>
                  );
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-8 font-normal">Statut actuel</TableHead>
              <TableHead className="h-8 w-24 text-right font-normal">Période</TableHead>
              <TableHead className="h-8 w-24 text-right font-normal">Marché</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ORDRE_STATUTS.map((k) => (
              <TableRow key={k} className="hover:bg-transparent">
                <TableCell className="py-2">
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2 rounded-full", STATUT_STYLE[k].point)} />
                    {STATUT_STYLE[k].libelle}
                  </span>
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums">
                  <ChiffreLien n={periode[k]} filtres={{ statuts: [k], du: bornes.du, au: bornes.au }} description={`${nombreFuites(periode[k], "détectée")} ${surLaPeriode}, ${statut(k)}`} />
                  <span className="ml-1 text-muted-foreground text-xs">({pourcent(periode[k], totalPeriode)} %)</span>
                </TableCell>
                <TableCell className="py-2 text-right tabular-nums">
                  <ChiffreLien n={tout[k]} filtres={{ statuts: [k] }} description={`${nombreFuites(tout[k])} du marché ${statut(k)}`} />
                  <span className="ml-1 text-muted-foreground text-xs">({pourcent(tout[k], totalTout)} %)</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">
                <ChiffreLien n={totalPeriode} filtres={{ du: bornes.du, au: bornes.au }} description={`${nombreFuites(totalPeriode, "détectée")} ${surLaPeriode}`} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <ChiffreLien n={totalTout} filtres={{}} description={`${nombreFuites(totalTout)} du marché`} />
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Par secteur ou par zone : tableau trié, barres de progression
// ---------------------------------------------------------------------------
type ColonneChiffre = Exclude<ColonneGroupe, "libelle">;
type Lien = { filtres: Partial<FiltresListe>; description: (n: number) => string };
const COLONNES: { cle: ColonneChiffre; titre: string; aide: string; couleur: string; lien?: (p: Periode, t: string) => Lien }[] = [
  {
    cle: "detectees", titre: "Détectées", aide: "détectées sur la période", couleur: "bg-red-500",
    lien: (p, t) => ({ filtres: { du: p.du, au: p.au }, description: (n) => `${nombreFuites(n, "détectée")} ${surPeriode(t)}` }),
  },
  { cle: "reparees", titre: "Réparées", aide: "réparées sur la période", couleur: "bg-green-500" },
  {
    cle: "enAttente", titre: "En attente", aide: "non réparées à ce jour (détectées ou réparation en cours)", couleur: "bg-amber-500",
    lien: () => ({ filtres: { statuts: STATUTS_EN_ATTENTE }, description: (n) => `${nombreFuites(n)} en attente de réparation à ce jour` }),
  },
  {
    cle: "alertes", titre: "Alertes", aide: "fuites en alerte à ce jour (mêmes alertes que la liste)", couleur: "bg-destructive",
    lien: () => ({ filtres: { alertes: true }, description: (n) => `${nombreFuites(n)} en alerte à ce jour` }),
  },
];

export function TableauGroupes({ fuites, periode, titrePeriode, compact = false }: { fuites: FuiteTdb[]; periode: Periode; titrePeriode: string; compact?: boolean }) {
  const [regroupement, setRegroupement] = useState<Regroupement>("secteur");
  const [tri, setTri] = useState<{ colonne: ColonneGroupe; decroissant: boolean }>({ colonne: "detectees", decroissant: true });
  const lignes = useMemo(() => trierGroupes(parGroupe(fuites, periode, regroupement), tri.colonne, tri.decroissant), [fuites, periode, regroupement, tri]);
  const maxima = useMemo(
    () => Object.fromEntries(COLONNES.map((c) => [c.cle, Math.max(1, ...lignes.map((l) => l[c.cle]))])) as Record<ColonneChiffre, number>,
    [lignes],
  );
  const trier = (colonne: ColonneGroupe) =>
    setTri((t) => (t.colonne === colonne ? { colonne, decroissant: !t.decroissant } : { colonne, decroissant: colonne !== "libelle" }));
  const somme = (cle: ColonneChiffre) => lignes.reduce((s, l) => s + l[cle], 0);
  const chiffre = (c: (typeof COLONNES)[number], n: number, portee: LigneGroupe | "total" | null) => {
    const lien = portee && c.lien?.(periode, titrePeriode);
    if (!lien) return n.toLocaleString("fr-FR");
    const groupe = portee === "total" ? null : portee;
    return (
      <ChiffreLien n={n} filtres={groupe ? { ...lien.filtres, [regroupement]: groupe.cle } : lien.filtres}
        description={(groupe ? `${groupe.libelle} : ` : "") + lien.description(n)} />
    );
  };
  const affichees = compact ? lignes.slice(0, 8) : lignes;

  return (
    <Card className="h-full gap-2">
      <CardHeader>
        <CardTitle className="font-normal">Par {regroupement}</CardTitle>
        <CardDescription>Détectées et réparées sur la période ; en attente et alertes à ce jour.</CardDescription>
        <CardAction>
          <ToggleGroup type="single" size="sm" variant="outline" spacing={0} value={regroupement} onValueChange={(v) => v && setRegroupement(v as Regroupement)}>
            <ToggleGroupItem value="secteur">Secteur</ToggleGroupItem>
            <ToggleGroupItem value="zone">Zone</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0">
        {lignes.length === 0 ? <Vide className="mx-4">Rien à afficher pour cette période.</Vide> : (
          <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
            <TableHeader className="[&_tr]:border-border/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 font-normal">
                  <button type="button" className="hover:text-foreground" onClick={() => trier("libelle")}>
                    {regroupement === "secteur" ? "Secteur" : "Zone"}{tri.colonne === "libelle" ? (tri.decroissant ? " ▼" : " ▲") : ""}
                  </button>
                </TableHead>
                {COLONNES.map((c) => (
                  <TableHead key={c.cle} className="h-8 w-28 text-right font-normal" title={c.aide}>
                    <button type="button" className="hover:text-foreground" onClick={() => trier(c.cle)}>
                      {c.titre}{tri.colonne === c.cle ? (tri.decroissant ? " ▼" : " ▲") : ""}
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr]:border-border/50">
              {affichees.map((l) => (
                <TableRow key={l.cle || "aucun"} className="hover:bg-transparent">
                  <TableCell className="max-w-0 truncate py-3 font-medium">
                    {l.libelle}
                    {l.zone && <span className="ml-2 text-muted-foreground text-xs font-normal">{l.zone}</span>}
                  </TableCell>
                  {COLONNES.map((c) => (
                    <TableCell key={c.cle} className="py-3 text-right tabular-nums">
                      <div className="flex flex-col items-end gap-1">
                        <span>{chiffre(c, l[c.cle], l.cle ? l : null)}</span>
                        <span className="block h-1 w-16 overflow-hidden rounded-full bg-muted">
                          {l[c.cle] > 0 && <span className={cn("block h-full rounded-full", c.couleur)} style={{ width: `${(100 * l[c.cle]) / maxima[c.cle]}%` }} />}
                        </span>
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total{compact && lignes.length > affichees.length ? ` (${lignes.length} ${regroupement}s)` : ""}</TableCell>
                {COLONNES.map((c) => <TableCell key={c.cle} className="text-right tabular-nums">{chiffre(c, somme(c.cle), "total")}</TableCell>)}
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export { lienFuites };

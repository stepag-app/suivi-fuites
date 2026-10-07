"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { BellOff, Camera, ExternalLink, FileText, MapPinned, Navigation, Network, Printer, Volume2, Wifi, WifiOff } from "lucide-react";
import { AvertissementPlafond } from "@/components/avertissement-plafond";
import { Vide } from "@/components/en-tete-page";
import { ALERTES_FUITE, BadgeStatut, STATUT_STYLE, alertesDe } from "@/components/statut";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { dateHeure, libellesMarche, messageErreur } from "@/lib/format";
import { lienItineraire } from "@/lib/itineraire";
import { useSession } from "@/lib/session";
import { COLONNES_ALERTES, filtreAlertes, type FuiteAlerte } from "@/lib/colonnes-fuites";
import { getSupabase, lireTout, type Lignes } from "@/lib/supabase";
import { nonReparees, refectionsAFaire } from "@/lib/ui/indicateurs";
import { cn, dureeDepuis } from "@/lib/utils";

const heuresDepuis = (iso: string | null | undefined, maintenant: Date) => (iso ? Math.max(0, Math.round((maintenant.getTime() - new Date(iso).getTime()) / 3_600_000)) : null);

function Horloge() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return (
    <span className="whitespace-nowrap tabular-nums">
      {t.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}&nbsp;&nbsp;{t.toLocaleTimeString("fr-FR")}
    </span>
  );
}

/** Suivi des fuites en alerte (modèle « Patient monitoring ») : surveillance, acquittement, tendances. */
export default function Alertes() {
  const { marche, peut } = useSession();
  const libelles = libellesMarche(marche);
  const [fuites, setFuites] = useState<Lignes<FuiteAlerte>>([]);
  const [chargeLe, setChargeLe] = useState(() => new Date());
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [selection, setSelection] = useState<string | null>(null);
  const [acquittees, setAcquittees] = useState<string[]>([]);
  const [maintenant, setMaintenant] = useState(() => new Date());
  const [enLigne, setEnLigne] = useState(true);
  const marcheId = marche?.id;

  useEffect(() => {
    // Durées affichées à l'heure près : la page se redessine chaque minute ; l'horloge seule chaque seconde.
    const t = setInterval(() => setMaintenant(new Date()), 60_000);
    setEnLigne(navigator.onLine);
    const on = () => setEnLigne(true);
    const off = () => setEnLigne(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { clearInterval(t); window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  const charger = useCallback(async () => {
    if (!marcheId) return;
    setChargement(true);
    setErreur("");
    try {
      const sb = getSupabase();
      // Fuites en alerte et celles des courbes des 14 derniers jours seulement (pas tout le marché).
      const depuis = new Date(Date.now() - 15 * 86_400_000);
      const utiles = await lireTout<FuiteAlerte>((de, a) => sb.from("v_fuites").select(COLONNES_ALERTES).eq("marche_id", marcheId)
        .or(filtreAlertes(depuis)).order("numero", { ascending: false })
        .range(de, a) as unknown as PromiseLike<{ data: FuiteAlerte[] | null; error: { message: string } | null }>, 1000, 10000);
      setFuites(utiles);
      setChargeLe(new Date());
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const enAlerte = useMemo(() => fuites
    .filter((f) => alertesDe(f).length > 0 || f.alerte_sans_photo)
    .sort((a, b) => Number(b.alerte_non_reparee) - Number(a.alerte_non_reparee) || a.date_detection.localeCompare(b.date_detection)), [fuites]);
  const choisie = enAlerte.find((f) => f.id === selection) ?? enAlerte[0] ?? null;
  const tendances = useMemo(() => ({
    retard: nonReparees(fuites, libelles.delaiReparationH, chargeLe),
    refections: refectionsAFaire(fuites, chargeLe),
  }), [fuites, libelles.delaiReparationH, chargeLe]);

  if (!peut("fuites", "lire")) return <Vide>Votre compte n&apos;a pas accès aux fuites de ce marché.</Vide>;

  const acquittee = !!choisie && acquittees.includes(choisie.id);
  const alertesChoisie = choisie ? alertesDe(choisie) : [];
  const alarmeActive = !!choisie && alertesChoisie.some((a) => a.ton === "rouge") && !acquittee;

  return (
    <div className="flex min-h-[calc(100svh-var(--dashboard-header-height))] min-w-0 flex-col" data-content-padding="false">
      <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-3 py-2 text-sm lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:py-0">
        <div className="truncate uppercase tracking-wide lg:overflow-visible">Suivi des alertes · {marche?.code}</div>
        <div className="whitespace-nowrap">{enAlerte.length} fuite{enAlerte.length > 1 ? "s" : ""} en alerte</div>
        <div className="col-span-2 flex items-center justify-between gap-5 text-muted-foreground lg:col-span-1 lg:justify-end">
          <Horloge />
          <Tooltip>
            <TooltipTrigger aria-label="Son des alarmes coupé" className="inline-flex" type="button"><BellOff aria-hidden="true" className="size-4" /></TooltipTrigger>
            <TooltipContent>Son des alarmes coupé (pas de notification sonore)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger aria-label={enLigne ? "Réseau connecté" : "Hors ligne"} className="inline-flex" type="button">
              {enLigne ? <Wifi aria-hidden="true" className="size-4" /> : <WifiOff aria-hidden="true" className="size-4 text-amber-500" />}
            </TooltipTrigger>
            <TooltipContent>{enLigne ? "Réseau connecté : chiffres à jour" : "Hors ligne : derniers chiffres connus"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger aria-label="Base Supabase" className="inline-flex" type="button"><Network aria-hidden="true" className="size-4" /></TooltipTrigger>
            <TooltipContent>Lecture directe de la base (vue v_fuites)</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <Separator />

      {erreur && <Alert variant="destructive" className="m-3"><AlertTitle>Erreur</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>}
      {fuites.tronque && <div className="m-3"><AvertissementPlafond lues={fuites.length} /></div>}
      {chargement && fuites.length === 0 && <p className="flex items-center gap-2 p-4 text-muted-foreground text-sm"><Spinner />Chargement…</p>}
      {!chargement && enAlerte.length === 0 && (
        <div className="p-6"><Vide>Aucune fuite en alerte : tout est à jour sur ce marché.</Vide></div>
      )}

      {choisie && (
        <div className="grid min-w-0 flex-1 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="grid grid-cols-2 content-start *:border-border *:border-r *:border-b *:even:border-r-0">
            {enAlerte.map((f) => {
              const alertes = alertesDe(f);
              const retard = f.alerte_non_reparee && !acquittees.includes(f.id);
              const h = heuresDepuis(f.date_detection, maintenant) ?? 0;
              return (
                <button key={f.id} type="button" aria-pressed={f.id === choisie.id} onClick={() => setSelection(f.id)}
                  aria-label={`Ouvrir la fuite N° ${f.numero}`}
                  className={cn("flex min-h-36 min-w-0 flex-col bg-card p-2 text-left text-card-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    f.id === choisie.id && "ring-2 ring-primary ring-inset")}>
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="truncate font-medium text-sm">
                      <span className={cn(retard && "text-amber-500 dark:text-amber-400")}>N° {f.numero}</span> {f.secteur ?? "—"}
                    </div>
                    {retard && <Badge className="h-auto shrink-0 rounded-none border-amber-500 text-[10px] text-amber-700 dark:border-amber-400 dark:text-amber-300" variant="outline">RETARD</Badge>}
                  </div>
                  <div className="flex w-full flex-1 items-center">
                    <div className="flex w-full items-end gap-0.5">
                      {Array.from({ length: 24 }, (_, i) => {
                        const actif = i < Math.min(24, Math.ceil(h / (libelles.delaiReparationH / 12)));
                        return <span key={i} className={cn("h-3 flex-1 rounded-sm", actif ? (retard ? "bg-amber-500/80" : "bg-lime-500/70") : "bg-muted")} />;
                      })}
                    </div>
                  </div>
                  <dl className="mt-auto grid grid-cols-2 divide-x divide-border tabular-nums">
                    <div className="pr-2">
                      <dt className="text-lime-500 text-xs dark:text-lime-400">Heures</dt>
                      <dd className={cn("text-right font-medium text-3xl text-lime-500 leading-none dark:text-lime-400", retard && "text-amber-500 dark:text-amber-400")}>{h}</dd>
                    </div>
                    <div className="pl-2">
                      <dt className="text-cyan-500 text-xs dark:text-cyan-400">Alertes</dt>
                      <dd className="text-right font-medium text-3xl text-cyan-500 leading-none dark:text-cyan-400">{alertes.length + (f.alerte_sans_photo ? 1 : 0)}</dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>

          <div className="flex min-w-0 flex-col border-border lg:border-l">
            <div className="flex min-h-11 flex-wrap items-center gap-4 bg-muted/50 px-3 py-1">
              <div className="flex items-center gap-3 font-medium">
                <Badge className="rounded-none" variant="outline">{choisie.secteur ?? "Secteur ?"}</Badge>
                <span className="text-lg">Fuite N° {choisie.numero}</span>
              </div>
              <div className="text-muted-foreground text-sm">{choisie.adresse ?? "Adresse non renseignée"} · <BadgeStatut statut={choisie.statut} court className="align-middle" /></div>
            </div>
            <Separator />

            {(alertesChoisie.length > 0 || choisie.alerte_sans_photo) && (
              <Alert className={cn("min-h-9 rounded-none border-x-0 border-t-0 pr-32", alarmeActive ? "border-amber-500 bg-amber-400 text-amber-950" : "border-border bg-muted text-foreground")} variant="default">
                <AlertTitle>{alertesChoisie[0]?.texte(libelles) ?? "Aucune photo"}{alertesChoisie.length > 1 ? ` (+${alertesChoisie.length - 1})` : ""}</AlertTitle>
                <AlertDescription className={cn(alarmeActive && "text-amber-950")}>Depuis la détection : {dureeDepuis(choisie.date_detection, maintenant)}</AlertDescription>
                <AlertAction className="top-1/2 -translate-y-1/2">
                  <Button className="rounded-none" disabled={acquittee} onClick={() => setAcquittees((c) => (c.includes(choisie.id) ? c : [...c, choisie.id]))} size="sm" variant="secondary">
                    {acquittee ? "Acquittée" : "Acquitter"}
                  </Button>
                </AlertAction>
              </Alert>
            )}

            <div className="grid min-w-0 xl:grid-cols-[minmax(0,1fr)_15.5rem]">
              <div className="min-w-0 border-border xl:border-r">
                {ALERTES_FUITE.map((a) => {
                  const active = choisie[a.cle] === true;
                  return (
                    <div key={a.cle} className="grid min-h-12 grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-3 border-border border-b px-3 py-2">
                      <span className={cn("font-medium text-sm", active ? (a.ton === "rouge" ? "text-red-500 dark:text-red-400" : "text-amber-500 dark:text-amber-400") : "text-muted-foreground")}>{a.texte(libelles)}</span>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
                        <span className={cn("block h-full rounded-full", active ? (a.ton === "rouge" ? "bg-red-500" : "bg-amber-500") : "bg-muted")} style={{ width: active ? "100%" : "0%" }} />
                      </span>
                      <span className="text-muted-foreground text-xs">{active ? "active" : "—"}</span>
                    </div>
                  );
                })}
                <div className="grid min-h-12 grid-cols-[9rem_minmax(0,1fr)_auto] items-center gap-3 border-border border-b px-3 py-2">
                  <span className={cn("font-medium text-sm", choisie.alerte_sans_photo ? "text-amber-500" : "text-muted-foreground")}>Aucune photo</span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full", choisie.alerte_sans_photo && "bg-amber-500")} style={{ width: choisie.alerte_sans_photo ? "100%" : "0%" }} /></span>
                  <span className="text-muted-foreground text-xs">{choisie.nb_photos} photo{choisie.nb_photos > 1 ? "s" : ""}</span>
                </div>
              </div>
              <dl className="xl:grid">
                <Vital color={alarmeActive ? "text-amber-500 dark:text-amber-400" : "text-lime-500 dark:text-lime-400"} label="Depuis détection" limits={`seuil ${libelles.delaiReparationH} h`} unit="h" value={heuresDepuis(choisie.date_detection, maintenant) ?? "—"} />
                <Vital color="text-cyan-500 dark:text-cyan-400" label="Dernière réparation" limits="date → maintenant" unit="h" value={heuresDepuis(choisie.derniere_reparation_le, maintenant) ?? "—"} />
                <Vital color="text-foreground" label="Photos" limits="≥ 1 attendue" unit="" value={choisie.nb_photos} />
                <Vital color="text-foreground" label="Statut" limits={STATUT_STYLE[choisie.statut].libelle} unit="" value={`${STATUT_STYLE[choisie.statut].progression} %`} />
              </dl>
            </div>

            <Tabs className="min-h-0 flex-1 gap-0" defaultValue="tendances">
              <TabsList className="w-full justify-start gap-0 border-b p-0 *:h-full *:max-w-36 *:rounded-none *:border-0 *:border-border *:border-r *:after:-bottom-px!" variant="line">
                <TabsTrigger value="tendances">Tendances</TabsTrigger>
                <TabsTrigger value="evenements">Événements</TabsTrigger>
                <TabsTrigger value="fiche">Fiche</TabsTrigger>
              </TabsList>
              <TabsContent className="m-0" value="tendances"><Tendances retard={tendances.retard.serie} refections={tendances.refections.serie} /></TabsContent>
              <TabsContent className="m-0" value="evenements">
                <div className="min-h-44">
                  <div className="grid grid-cols-[10rem_1fr] bg-muted/40 px-4 py-2 font-medium text-muted-foreground text-xs"><span>Date</span><span>Événement</span></div>
                  <Separator />
                  {([
                    [choisie.date_detection, `Détectée${choisie.detectee_par ? ` par ${choisie.detectee_par}` : ""}`],
                    [choisie.date_communication_srm, `Communiquée à ${libelles.sigle}`],
                    [choisie.avis_terrassement_srm_le, "Avis avant terrassement"],
                    [choisie.derniere_reparation_le, "Dernière réparation"],
                    [choisie.derniere_refection_le, "Dernière réfection"],
                    [choisie.validation_srm_le, `Validée ${libelles.sigle}`],
                    [choisie.verrouillee_le, "Verrouillée"],
                  ] as [string | null, string][]).filter((e): e is [string, string] => !!e[0]).sort((a, b) => b[0].localeCompare(a[0])).map(([d, l], i, arr) => (
                    <Fragment key={`${d}-${l}`}>
                      <div className="grid min-h-11 grid-cols-[10rem_1fr] items-center px-4 py-2 text-sm"><span className="text-muted-foreground tabular-nums">{dateHeure(d)}</span><span>{l}</span></div>
                      {i < arr.length - 1 && <Separator />}
                    </Fragment>
                  ))}
                </div>
              </TabsContent>
              <TabsContent className="m-0 p-4" value="fiche">
                <div className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  <div><div className="text-muted-foreground text-xs">{libelles.reference}</div>{choisie.reference_srm ?? "—"}</div>
                  <div><div className="text-muted-foreground text-xs">Zone · secteur</div>{[choisie.zone, choisie.secteur].filter(Boolean).join(" · ") || "—"}</div>
                  <div><div className="text-muted-foreground text-xs">Détectée</div>{dateHeure(choisie.date_detection)}</div>
                  <div><div className="text-muted-foreground text-xs">Coordonnées</div><span className="font-mono tabular-nums">{choisie.latitude != null ? `${choisie.latitude.toFixed(5)} ; ${choisie.longitude?.toFixed(5)}` : "non relevées"}</span></div>
                  {choisie.observation && <div className="sm:col-span-2"><div className="text-muted-foreground text-xs">Observation</div>{choisie.observation}</div>}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <Separator />
      <footer className="flex flex-wrap gap-2 p-2 *:data-[slot=button]:h-11 *:data-[slot=button]:min-w-32 *:data-[slot=button]:flex-1 *:data-[slot=button]:rounded-none">
        <Button variant="outline" asChild disabled={!choisie}><Link href={choisie ? `/fuites/${choisie.id}` : "/fuites"} prefetch={false}><ExternalLink data-icon="inline-start" />Ouvrir la fiche</Link></Button>
        <Button variant="outline" asChild><Link href={choisie?.latitude != null ? `/carte?fuite=${choisie.id}` : "/carte"} prefetch={false}><MapPinned data-icon="inline-start" />Carte</Link></Button>
        {choisie && lienItineraire(choisie.latitude, choisie.longitude) ? (
          <Button variant="outline" asChild><a href={lienItineraire(choisie.latitude, choisie.longitude)!} target="_blank" rel="noreferrer"><Navigation data-icon="inline-start" />Y aller</a></Button>
        ) : <Button variant="outline" disabled><Navigation data-icon="inline-start" />Y aller</Button>}
        <Button variant="outline" asChild><Link href="/fuites?alertes=1" prefetch={false}><FileText data-icon="inline-start" />Liste des alertes</Link></Button>
        <Button variant="outline" asChild><Link href="/fuites?statut=reparee" prefetch={false}><Camera data-icon="inline-start" />Réfections à faire</Link></Button>
        <Button variant="outline" onClick={() => window.print()}><Printer data-icon="inline-start" />Imprimer</Button>
        <Button variant="outline" onClick={() => choisie && setAcquittees((c) => c.filter((x) => x !== choisie.id))}><Volume2 data-icon="inline-start" />Réarmer</Button>
        <Badge className="h-11 min-w-44 flex-1 rounded-none text-muted-foreground" variant="outline">{fuites.length} fuites surveillées</Badge>
      </footer>
    </div>
  );
}

function Vital({ color, label, limits, unit, value }: { color: string; label: string; limits: string; unit: string; value: number | string }) {
  return (
    <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center border-border border-b px-3 py-1">
      <div>
        <div className={cn("font-medium text-sm", color)}>{label}</div>
        <div className="text-[10px] text-muted-foreground">{limits}</div>
      </div>
      <div className={cn("flex items-baseline gap-0.5 text-right font-medium text-4xl tabular-nums leading-none", color)}>{value} <span className="text-xs">{unit}</span></div>
    </div>
  );
}

const configTendances = {
  retard: { label: "Non réparées > seuil", color: "var(--color-amber-500)" },
  refections: { label: "Réfections à faire", color: "var(--color-cyan-500)" },
} satisfies ChartConfig;

function Tendances({ retard, refections }: { retard: number[]; refections: number[] }) {
  const donnees = retard.map((v, i) => ({ jour: `J-${retard.length - 1 - i}`, retard: v, refections: refections[i] ?? 0 }));
  return (
    <div className="grid h-full min-h-36 xl:grid-cols-[minmax(0,1fr)_13.5rem]">
      <div className="min-w-0 border-border px-3 py-2 xl:border-r">
        <div className="mb-2 font-medium text-xs">Situation à chaque fin de journée, 14 derniers jours</div>
        <ChartContainer config={configTendances} className="aspect-auto h-32 w-full">
          <LineChart accessibilityLayer data={donnees} margin={{ bottom: 0, left: 0, right: 8, top: 4 }}>
            <CartesianGrid stroke="var(--border)" strokeOpacity={0.65} vertical={false} />
            <XAxis dataKey="jour" tickLine={false} axisLine={false} tickMargin={6} minTickGap={24} />
            <YAxis hide allowDecimals={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line dataKey="retard" dot={false} isAnimationActive={false} stroke="var(--color-retard)" strokeWidth={1.5} type="monotoneX" />
            <Line dataKey="refections" dot={false} isAnimationActive={false} stroke="var(--color-refections)" strokeWidth={1.5} type="monotoneX" />
          </LineChart>
        </ChartContainer>
      </div>
      <div className="px-3 py-2">
        <div className="mb-2 font-medium text-xs">Lecture</div>
        <div className="flex flex-col gap-2 text-[11px]">
          <div className="grid grid-cols-[1rem_1fr] items-center gap-1"><span className="size-2 rounded-full bg-amber-500" /><span>Fuites non réparées au-delà du seuil</span></div>
          <div className="grid grid-cols-[1rem_1fr] items-center gap-1"><span className="size-2 rounded-full bg-cyan-500" /><span>Réparées, réfection en attente</span></div>
          <p className="text-muted-foreground">Acquitter une alerte ne change rien en base : c&apos;est un repère d&apos;écran pour la surveillance.</p>
        </div>
      </div>
    </div>
  );
}

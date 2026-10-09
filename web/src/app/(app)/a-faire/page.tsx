"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { startOfMonth, startOfToday } from "date-fns";
import { fr } from "date-fns/locale";
import {
  ArrowRight, CalendarDays, Clock3, Download, Droplets, ListChecks, MapPinned, Plus, ReceiptText, Siren, Timer, TrendingUp, Wrench,
} from "lucide-react";
import { AvertissementPlafond } from "@/components/avertissement-plafond";
import { Vide } from "@/components/en-tete-page";
import { BadgeAnticipe, BadgeStatut, alertesDe } from "@/components/statut";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useFuitesAnticipees } from "@/lib/anticipation";
import { dateHeure, libellesMarche, messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { COLONNES_LISTE, type FuiteListe } from "@/lib/colonnes-fuites";
import { getSupabase, lireTout, type Lignes } from "@/lib/supabase";
import { activite, jourCasa, lundiDe, ajouterJours } from "@/lib/ui/tableau-de-bord";
import { cn, dureeDepuis, pluriel, pourcent } from "@/lib/utils";

type Tache = {
  fuite: FuiteListe; titre: string; type: "reparation" | "refection" | "communication" | "photo"; priorite: "haute" | "normale";
  /** A1 : attachée par anticipation, exécution réelle attendue : en tête de liste */
  anticipe?: boolean;
};

/** « À faire » (modèle « Productivity ») : ce qui attend l'équipe, par priorité, avec calendrier des détections. */
export default function AFaire() {
  const { marche, peut, profil } = useSession();
  const libelles = libellesMarche(marche);
  const [fuites, setFuites] = useState<Lignes<FuiteListe>>([]);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [filtre, setFiltre] = useState<"toutes" | "anticipees" | Tache["type"]>("toutes");
  const [cochees, setCochees] = useState<string[]>([]);
  const today = startOfToday();
  const [date, setDate] = useState<Date | undefined>(today);
  const [mois, setMois] = useState<Date>(() => startOfMonth(today));
  const marcheId = marche?.id;
  const { parFuite: anticipees } = useFuitesAnticipees(peut("fuites", "lire") ? marcheId : undefined);

  const charger = useCallback(async () => {
    if (!marcheId) return;
    setChargement(true);
    try {
      const sb = getSupabase();
      setFuites(await lireTout<FuiteListe>((de, a) => sb.from("v_fuites").select(COLONNES_LISTE).eq("marche_id", marcheId).order("numero", { ascending: false })
        .range(de, a) as unknown as PromiseLike<{ data: FuiteListe[] | null; error: { message: string } | null }>, 1000, 10000));
      setErreur("");
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const maintenant = useMemo(() => new Date(), [fuites]); // eslint-disable-line react-hooks/exhaustive-deps
  const taches = useMemo<Tache[]>(() => {
    const t: Tache[] = [];
    for (const f of fuites) {
      if (f.statut === "detectee" || f.statut === "en_reparation") {
        t.push({ fuite: f, type: "reparation", priorite: f.alerte_non_reparee ? "haute" : "normale", titre: `${f.statut === "en_reparation" ? "Finir la réparation" : "Réparer la fuite"} N° ${f.numero}` });
      }
      if (f.statut === "reparee") t.push({ fuite: f, type: "refection", priorite: f.refection_chaussee_hors_delai ? "haute" : "normale", titre: `Réfection de la fuite N° ${f.numero}` });
      if (f.alerte_communication_srm) t.push({ fuite: f, type: "communication", priorite: "normale", titre: `Communiquer la fuite N° ${f.numero} à ${libelles.sigle}` });
      if (f.alerte_sans_photo && f.statut !== "achevee") t.push({ fuite: f, type: "photo", priorite: "normale", titre: `Photographier la fuite N° ${f.numero}` });
      // A1 : travaux déjà attachés par anticipation, exécution réelle attendue (réfection le plus souvent)
      if (anticipees.has(f.id)) {
        const travaux = t.filter((x) => x.fuite.id === f.id && (x.type === "reparation" || x.type === "refection"));
        if (travaux.length) travaux.forEach((x) => { x.anticipe = true; });
        else t.push({ fuite: f, type: "refection", priorite: "haute", anticipe: true, titre: `Exécuter les travaux attachés par anticipation, fuite N° ${f.numero}` });
      }
    }
    return t.sort((a, b) => Number(!!b.anticipe) - Number(!!a.anticipe) || Number(b.priorite === "haute") - Number(a.priorite === "haute")
      || a.fuite.date_detection.localeCompare(b.fuite.date_detection));
  }, [fuites, libelles.sigle, anticipees]);
  const visibles = taches.filter((t) => filtre === "toutes" || (filtre === "anticipees" ? t.anticipe : t.type === filtre));

  const auj = jourCasa(maintenant);
  const lundi = lundiDe(auj);
  const semaine = useMemo(() => activite(fuites.map((f) => ({ ...f, zone_id: null })), { du: lundi, au: ajouterJours(lundi, 6) }), [fuites, lundi]);
  const detecteesAuj = fuites.filter((f) => jourCasa(f.date_detection) === auj).length;
  const enRetard = fuites.filter((f) => f.alerte_non_reparee).length;
  const enAttente = fuites.filter((f) => f.statut === "detectee" || f.statut === "en_reparation").length;
  const joursDetection = useMemo(() => fuites.map((f) => new Date(f.date_detection)), [fuites]);
  const duJour = date ? fuites.filter((f) => jourCasa(f.date_detection) === jourCasa(date)) : [];

  const secteurs = useMemo(() => {
    const m = new Map<string, { libelle: string; total: number; achevees: number; attente: number; alertes: number }>();
    for (const f of fuites) {
      const k = f.secteur ?? "Non renseigné";
      const s = m.get(k) ?? { libelle: k, total: 0, achevees: 0, attente: 0, alertes: 0 };
      s.total++;
      if (f.statut === "achevee" || f.statut === "sans_reparation") s.achevees++;
      if (f.statut === "detectee" || f.statut === "en_reparation") s.attente++;
      if (alertesDe(f).length) s.alertes++;
      m.set(k, s);
    }
    return [...m.values()].sort((a, b) => b.attente - a.attente || b.alertes - a.alertes).slice(0, 3);
  }, [fuites]);
  const dernieres = useMemo(() => fuites.filter((f) => f.derniere_reparation_le).sort((a, b) => b.derniere_reparation_le!.localeCompare(a.derniere_reparation_le!)).slice(0, 4), [fuites]);

  if (!peut("fuites", "lire")) return <Vide>Votre compte n&apos;a pas accès aux fuites de ce marché.</Vide>;

  // « NOM Prénom » depuis le chantier v2 : le prénom saisi, sinon le premier mot du nom complet
  const prenom = profil?.prenom || (profil?.nom ? "" : profil?.nom_complet?.split(/\s+/)[0]) || "";
  const salut = maintenant.getHours() < 18 ? "Bonjour" : "Bonsoir";
  const ICONES = { reparation: Wrench, refection: Droplets, communication: ReceiptText, photo: Siren } as const;
  const TYPES: Record<Tache["type"], string> = { reparation: "Réparation", refection: "Réfection", communication: libelles.sigle, photo: "Photo" };
  const raccourcis = [
    { libelle: "Nouvelle fuite", icone: Plus, href: "/fuites/nouvelle", actif: peut("fuites", "creer") },
    { libelle: "Carte", icone: MapPinned, href: "/carte", actif: true },
    { libelle: "Liste des fuites", icone: ListChecks, href: "/fuites", actif: true },
    { libelle: "Attachements", icone: ReceiptText, href: "/attachements", actif: peut("attachements", "lire") },
    { libelle: "Exporter", icone: Download, href: "/fuites", actif: peut("exports", "lire") },
  ].filter((r) => r.actif);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="lg:col-span-9">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl text-foreground leading-none tracking-tight">{salut}{prenom ? `, ${prenom}` : ""}.</h1>
            <p className="text-lg text-muted-foreground leading-none">
              {pluriel(taches.length, "action")} attend{taches.length > 1 ? "ent" : ""} l&apos;équipe sur {marche?.code}.
            </p>
          </div>

          {erreur && <Alert variant="destructive"><AlertTitle>Erreur</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>}
          {fuites.tronque && <AvertissementPlafond lues={fuites.length} />}

          <div className="grid gap-4 md:grid-cols-3">
            {[
              { titre: "Aujourd'hui", valeur: String(detecteesAuj), description: pluriel(detecteesAuj, "fuite détectée", "fuites détectées"), icone: Clock3, href: `/fuites?du=${auj}&au=${auj}` },
              { titre: "Cette semaine", valeur: `${pourcent(semaine.reparees, semaine.detectees || semaine.reparees)} %`, description: `${semaine.reparees} réparées pour ${semaine.detectees} détectées`, icone: TrendingUp, href: `/fuites?du=${lundi}&au=${ajouterJours(lundi, 6)}` },
              { titre: "En retard", valeur: String(enRetard), description: `non réparées > ${libelles.delaiReparationH} h`, icone: Siren, href: "/fuites?alertes=1" },
            ].map((item) => (
              <Card key={item.titre} className="shadow-xs">
                <CardHeader>
                  <CardTitle>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <div className="grid size-7 place-items-center rounded-lg border bg-muted"><item.icone className="size-4" /></div>
                      {item.titre}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    <div className="text-2xl leading-none tracking-tight tabular-nums">{item.valeur}</div>
                    <Link href={item.href} prefetch={false} className="flex items-center justify-between hover:underline">
                      <p className="text-muted-foreground tabular-nums leading-none">{item.description}</p>
                      <ArrowRight className="size-4 text-muted-foreground" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl tracking-tight">Actions</h2>
              <div className="flex items-center gap-2">
                <Select value={filtre} onValueChange={(v) => setFiltre(v as typeof filtre)}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Toutes" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="toutes">Toutes</SelectItem>
                      {anticipees.size > 0 && <SelectItem value="anticipees">Attachées par anticipation</SelectItem>}
                      <SelectItem value="reparation">Réparations</SelectItem>
                      <SelectItem value="refection">Réfections</SelectItem>
                      <SelectItem value="communication">Communications {libelles.sigle}</SelectItem>
                      <SelectItem value="photo">Photos manquantes</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {peut("fuites", "creer") && <Button asChild><Link href="/fuites/nouvelle" prefetch={false}><Plus data-icon="inline-start" />Nouvelle fuite</Link></Button>}
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border bg-background shadow-xs">
              {chargement && fuites.length === 0 ? <p className="flex items-center gap-2 p-4 text-muted-foreground text-sm"><Spinner />Chargement…</p>
                : visibles.length === 0 ? <p className="p-6 text-center text-muted-foreground text-sm">Rien à faire dans cette catégorie : tout est à jour.</p> : (
                  <div className="divide-y">
                    {visibles.slice(0, 12).map((t) => {
                      const cle = `${t.type}-${t.fuite.id}`;
                      const I = ICONES[t.type];
                      return (
                        <div key={cle} className="flex items-center gap-2 p-4">
                          <Checkbox checked={cochees.includes(cle)} aria-label={t.titre} onCheckedChange={(c) => setCochees((x) => (c === true ? [...x, cle] : x.filter((k) => k !== cle)))} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                              <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:gap-4">
                                <Link href={`/fuites/${t.fuite.id}`} prefetch={false} className={cn("truncate text-sm hover:underline", cochees.includes(cle) && "text-muted-foreground line-through")}>
                                  {t.titre}{t.fuite.adresse ? <span className="text-muted-foreground"> · {t.fuite.adresse}</span> : null}
                                </Link>
                                <Badge variant="outline" className="px-3 py-1 font-normal"><I />{TYPES[t.type]}</Badge>
                                {t.anticipe && <BadgeAnticipe lot={anticipees.get(t.fuite.id)?.premier_lot} />}
                                {t.priorite === "haute" && !t.anticipe && <Badge variant="destructive" className="border-transparent">Urgent</Badge>}
                                <BadgeStatut statut={t.fuite.statut} court />
                              </div>
                              <div className="flex shrink-0 items-center gap-3 text-muted-foreground text-sm">
                                <span>depuis {dureeDepuis(t.fuite.date_detection, maintenant)}</span>
                                <CalendarDays className="size-4" />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {visibles.length > 12 && (
                      <div className="p-3 text-center text-sm">
                        <Link href="/fuites?alertes=1" prefetch={false} className="text-primary underline-offset-4 hover:underline">Voir les {visibles.length - 12} autres dans la liste</Link>
                      </div>
                    )}
                  </div>
                )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl tracking-tight">Secteurs à suivre</h2>
              <Button variant="outline" asChild><Link href="/tableau-de-bord" prefetch={false}>Tableau de bord<ArrowRight data-icon="inline-end" /></Link></Button>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {secteurs.map((s) => (
                <Card key={s.libelle} className="shadow-xs">
                  <CardHeader>
                    <CardTitle><div className="flex items-center gap-2"><MapPinned className="size-4 text-muted-foreground" /><span className="truncate">{s.libelle}</span></div></CardTitle>
                    <CardAction><Badge variant="outline">{s.alertes ? `${s.alertes} alerte${s.alertes > 1 ? "s" : ""}` : "à jour"}</Badge></CardAction>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-1">
                      <div className="text-sm leading-none">{pluriel(s.total, "fuite")}, {s.attente} en attente.</div>
                      <div className="flex items-center gap-3">
                        <Progress value={pourcent(s.achevees, s.total)} className="h-2" />
                        <span className="shrink-0 text-sm">{pourcent(s.achevees, s.total)} %</span>
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="py-2.5"><span className="text-muted-foreground">achevées ou closes</span></CardFooter>
                </Card>
              ))}
              {secteurs.length === 0 && <Vide className="md:col-span-3">Aucun secteur renseigné.</Vide>}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-xl tracking-tight">Raccourcis</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {raccourcis.map((r) => (
                <Button key={r.libelle} variant="outline" className="justify-start" asChild>
                  <Link href={r.href} prefetch={false}><r.icone data-icon="inline-start" />{r.libelle}</Link>
                </Button>
              ))}
            </div>
          </section>

          <Card className="bg-muted/40 shadow-none">
            <CardContent className="text-muted-foreground text-sm">
              « Une fuite réparée sous {libelles.delaiReparationH} h, c&apos;est une alerte en moins, de l&apos;eau économisée et un attachement sans régularisation. »
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-6 lg:col-span-3">
        <Card className="w-full" size="sm">
          <CardContent>
            <Calendar mode="single" selected={date} onSelect={setDate} month={mois} onMonthChange={setMois} fixedWeeks locale={fr}
              modifiers={{ detection: joursDetection }} modifiersClassNames={{ detection: "font-semibold underline decoration-sky-500 decoration-2 underline-offset-4" }}
              className="w-full p-0" />
            <p className="mt-2 text-muted-foreground text-xs">
              {date ? `${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} : ${pluriel(duJour.length, "fuite détectée", "fuites détectées")}` : "Choisissez un jour."}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader><CardTitle>Seuil d&apos;alerte</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-4">
                <div className="text-3xl tracking-tight tabular-nums">{libelles.delaiReparationH} h</div>
                <Button className="min-w-24" variant={enRetard ? "default" : "outline"} asChild><Link href="/alertes" prefetch={false}>{enRetard ? `${enRetard} en retard` : "Aucune"}</Link></Button>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><Timer className="size-3" /><span>Délai du marché entre détection et réparation</span></div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle>Dernières réparations</CardTitle>
            <CardAction><Button variant="ghost" size="sm" className="text-muted-foreground" asChild><Link href="/fuites?statut=reparee" prefetch={false}>Tout voir</Link></Button></CardAction>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {dernieres.length === 0 && <p className="text-muted-foreground text-sm">Aucune réparation saisie.</p>}
            {dernieres.map((f) => (
              <Link key={f.id} href={`/fuites/${f.id}`} prefetch={false} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0 hover:underline">
                <span className="text-sm">N° {f.numero} · {f.secteur ?? "—"}</span>
                <span className="text-muted-foreground text-xs tabular-nums">{dateHeure(f.derniere_reparation_le)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-xs">
          <CardHeader>
            <CardTitle>Cette semaine</CardTitle>
            <CardAction><Button variant="ghost" size="sm" className="text-muted-foreground" asChild><Link href="/tableau-de-bord" prefetch={false}>Détail</Link></Button></CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-muted-foreground">{enAttente ? `${pluriel(enAttente, "fuite")} encore en attente de réparation.` : "Aucune fuite en attente : belle semaine."}</p>
            <div className="flex flex-col gap-2">
              <div className="font-medium">{semaine.reparees} réparée{semaine.reparees > 1 ? "s" : ""} sur {semaine.detectees} détectée{semaine.detectees > 1 ? "s" : ""}</div>
              <Progress value={pourcent(semaine.reparees, Math.max(semaine.detectees, semaine.reparees))} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

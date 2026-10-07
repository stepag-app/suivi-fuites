"use client";

import Link from "next/link";
import { Crosshair, ExternalLink, Navigation, RefreshCw } from "lucide-react";
import { BadgeStatut, BadgesAlertes } from "@/components/statut";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dateHeure, type libellesMarche } from "@/lib/format";
import { lienItineraire } from "@/lib/itineraire";
import { cn } from "@/lib/utils";
import type { FuiteCarte } from "./commun";

type Libelles = ReturnType<typeof libellesMarche>;

export interface FiltresCarte { secteur: string; du: string; au: string; alertes: boolean }

export function ApercuFuite({ fuite, libelles }: { fuite: FuiteCarte | null; libelles: Libelles }) {
  if (!fuite) {
    return (
      <div className="grid min-h-40 place-items-center rounded-lg border border-dashed text-muted-foreground text-sm">
        Choisissez une fuite dans la liste ou sur la carte.
      </div>
    );
  }
  const itineraire = lienItineraire(fuite.latitude, fuite.longitude);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
          <h2 className="font-medium text-lg tabular-nums tracking-tight">Fuite N° {fuite.numero}</h2>
          {fuite.origine === "srm" && <Badge variant="secondary">Signalée {libelles.sigle}</Badge>}
          <BadgeStatut statut={fuite.statut} />
          <span className="text-foreground tabular-nums">détectée le {dateHeure(fuite.date_detection)}</span>
          <BadgesAlertes fuite={fuite} libelles={libelles} vide="aucune alerte" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" asChild><Link href={`/fuites/${fuite.id}`} prefetch={false}><ExternalLink data-icon="inline-start" />Ouvrir la fiche</Link></Button>
          {itineraire && <Button size="sm" variant="outline" asChild><a href={itineraire} target="_blank" rel="noreferrer"><Navigation data-icon="inline-start" />Y aller</a></Button>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-1"><span className="text-muted-foreground text-xs leading-none">{libelles.reference}</span><span className="text-sm leading-snug">{fuite.reference_srm ?? "—"}</span></div>
        <div className="flex flex-col gap-1"><span className="text-muted-foreground text-xs leading-none">Zone · secteur</span><span className="line-clamp-2 text-sm leading-snug" title={[fuite.zone, fuite.secteur].filter(Boolean).join(" · ")}>{[fuite.zone, fuite.secteur].filter(Boolean).join(" · ") || "—"}</span></div>
        <div className="flex flex-col gap-1"><span className="text-muted-foreground text-xs leading-none">Adresse</span><span className="line-clamp-2 text-sm leading-snug" title={fuite.adresse ?? undefined}>{fuite.adresse ?? "—"}</span></div>
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs leading-none">Coordonnées GPS</span>
          <span className="font-mono text-sm leading-snug tabular-nums">{fuite.latitude != null && fuite.longitude != null ? `${fuite.latitude.toFixed(6)} ; ${fuite.longitude.toFixed(6)}` : "non relevées"}</span>
        </div>
      </div>
    </div>
  );
}

export function FiltresCarteForm({ filtres, changer, secteurs }: { filtres: FiltresCarte; changer: (f: Partial<FiltresCarte>) => void; secteurs: { id: string; libelle: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Field className="gap-1.5">
        <FieldLabel htmlFor="secteur-carte">Secteur</FieldLabel>
        <NativeSelect id="secteur-carte" className="w-full" value={filtres.secteur} onChange={(e) => changer({ secteur: e.target.value })}>
          <NativeSelectOption value="">Tous les secteurs</NativeSelectOption>
          {secteurs.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.libelle}</NativeSelectOption>)}
        </NativeSelect>
      </Field>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="du-carte">Détectées du</FieldLabel>
        <Input id="du-carte" type="date" value={filtres.du} max={filtres.au || undefined} onChange={(e) => changer({ du: e.target.value })} />
      </Field>
      <Field className="gap-1.5">
        <FieldLabel htmlFor="au-carte">au</FieldLabel>
        <Input id="au-carte" type="date" value={filtres.au} min={filtres.du || undefined} onChange={(e) => changer({ au: e.target.value })} />
      </Field>
      <Field orientation="horizontal" className="self-end pb-1">
        <Checkbox id="alertes-carte" checked={filtres.alertes} onCheckedChange={(v) => changer({ alertes: v === true })} />
        <FieldLabel htmlFor="alertes-carte" className="font-normal">Alertes seulement</FieldLabel>
      </Field>
    </div>
  );
}

/**
 * Commandes posées sur la carte (au-dessus de l'échelle, décalées quand le panneau Réseau est ouvert) :
 * recentrer, actualiser, nombre de fuites placées ; message d'erreur en haut. Elles remplacent la bande
 * qui prenait de la hauteur à la carte.
 */
export function CommandesCarte({ placees, sansPosition, chargement, erreur, recentrer, actualiser, decalee }: {
  placees: number; sansPosition: number; chargement: boolean; erreur: string; recentrer: () => void; actualiser: () => void; decalee: boolean;
}) {
  return (
    <>
      <div
        role="group"
        aria-label="Commandes de la carte"
        className={cn(
          "absolute bottom-9 z-[3] flex items-center gap-0.5 rounded-lg border bg-background/95 p-0.5 shadow-sm",
          decalee ? "left-[calc(min(340px,92vw)+0.5rem)]" : "left-2",
        )}
      >
        <Button size="icon-sm" variant="ghost" onClick={recentrer} aria-label="Recentrer la carte" title="Recentrer"><Crosshair /></Button>
        <Button size="icon-sm" variant="ghost" onClick={actualiser} disabled={chargement} aria-label="Actualiser" title="Actualiser"><RefreshCw className={chargement ? "animate-spin" : undefined} /></Button>
        <span className="px-2 text-muted-foreground text-xs tabular-nums" aria-live="polite">
          {placees} sur la carte{sansPosition > 0 ? ` · ${sansPosition} sans position` : ""}
        </span>
      </div>
      {erreur && (
        <Alert variant="destructive" className="absolute inset-x-3 top-14 z-[4] w-auto bg-background shadow-sm"><AlertDescription>{erreur}</AlertDescription></Alert>
      )}
    </>
  );
}

export function OngletsCarte({ children, onglet, changerOnglet, impression }: { children: React.ReactNode; onglet: string; changerOnglet: (o: string) => void; impression: boolean }) {
  return (
    <Tabs value={onglet} onValueChange={changerOnglet} className="h-full gap-0">
      <TabsList className="w-full justify-start gap-2 border-b px-4 **:data-[slot=tabs-trigger]:text-xs sm:gap-4 sm:**:data-[slot=tabs-trigger]:text-sm" variant="line">
        <TabsTrigger className="flex-none" value="fuite">Fuite</TabsTrigger>
        <TabsTrigger className="flex-none" value="filtres">Filtres</TabsTrigger>
        {impression && <TabsTrigger className="flex-none" value="impression">Impression</TabsTrigger>}
      </TabsList>
      {children}
    </Tabs>
  );
}

export { TabsContent };

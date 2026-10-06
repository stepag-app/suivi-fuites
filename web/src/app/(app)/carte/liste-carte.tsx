"use client";

import { Droplets, Search, SlidersHorizontal, X } from "lucide-react";
import { ORDRE_STATUTS, STATUT_STYLE, alertesDe } from "@/components/statut";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dateSeule, type libellesMarche } from "@/lib/format";
import type { StatutFuite } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { FuiteCarte } from "./commun";

type Libelles = ReturnType<typeof libellesMarche>;

const anneauParStatut: Record<StatutFuite, string> = {
  detectee: "text-red-500", en_reparation: "text-amber-500", reparee: "text-sky-500", achevee: "text-green-600", sans_reparation: "text-muted-foreground",
};

function CarteFuite({ fuite, active, libelles, choisir }: { fuite: FuiteCarte; active: boolean; libelles: Libelles; choisir: (f: FuiteCarte) => void }) {
  const s = STATUT_STYLE[fuite.statut];
  const angle = (s.progression / 100) * 360;
  const alertes = alertesDe(fuite);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(e) => { e.currentTarget.blur(); choisir(fuite); }}
      className={cn(
        "flex w-full flex-col gap-4 rounded-xl border p-3 text-left transition-colors",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-primary bg-muted/50",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="font-medium">N° {fuite.numero}</div>
        <div className="flex items-center gap-1">
          <div style={{ "--angle": `${angle}deg` } as React.CSSProperties}
            className={cn("grid size-3 place-items-center rounded-full p-[0.5px] bg-[conic-gradient(currentColor_0deg_var(--angle),transparent_var(--angle)_360deg)]", anneauParStatut[fuite.statut])}>
            <div className="grid size-2 place-items-center rounded-full bg-card"><div className="size-1 rounded-full bg-current" /></div>
          </div>
          <div className="text-muted-foreground text-xs">{s.court}</div>
        </div>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="truncate font-medium text-xs leading-none">{fuite.secteur ?? "Secteur non renseigné"}</div>
          <div className="truncate text-muted-foreground text-xs">{fuite.adresse ?? "Adresse non renseignée"}</div>
        </div>
        {fuite.reference_srm && (
          <div className="shrink-0 text-right">
            <div className="text-muted-foreground text-[10px] leading-none">{libelles.reference}</div>
            <div className="text-xs tabular-nums">{fuite.reference_srm}</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <span className="h-px min-w-0 border-foreground border-t border-dashed" style={{ flexGrow: s.progression, flexBasis: 0 }} />
        <Droplets className={cn("size-3.5", s.texte)} />
        <span className="h-px min-w-0 border-border border-t border-dashed" style={{ flexGrow: 100 - s.progression, flexBasis: 0 }} />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-muted-foreground text-xs leading-none">Détectée</div>
          <div className="text-sm tabular-nums tracking-tight">{dateSeule(fuite.date_detection)}</div>
        </div>
        <div className="text-right">
          <div className="text-muted-foreground text-xs leading-none">Alertes</div>
          <div className={cn("text-sm tabular-nums tracking-tight", alertes.length && "text-destructive")}>
            {alertes.length ? alertes[0].texte(libelles) : "aucune"}
            {alertes.length > 1 && <span className="ml-1 text-muted-foreground text-xs">+{alertes.length - 1}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

export function ListeCarte({ fuites, total, compteurs, statut, choisirStatut, texte, changerTexte, selection, choisir, libelles, filtresActifs, effacer, ouvrirFiltres }: {
  fuites: FuiteCarte[]; total: number; compteurs: Partial<Record<StatutFuite, number>>;
  statut: StatutFuite | ""; choisirStatut: (s: StatutFuite | "") => void;
  texte: string; changerTexte: (t: string) => void;
  selection: string | null; choisir: (f: FuiteCarte) => void; libelles: Libelles;
  filtresActifs: boolean; effacer: () => void; ouvrirFiltres: () => void;
}) {
  return (
    <Card className="h-full rounded-none ring-0">
      <CardHeader>
        <CardTitle className="font-normal text-xl">Fuites <span className="text-muted-foreground text-sm">{fuites.length} / {total}</span></CardTitle>
        <CardAction className="flex items-center gap-1">
          {filtresActifs && <Button size="icon-sm" variant="ghost" aria-label="Effacer les filtres" onClick={effacer}><X /></Button>}
          <Button size="icon-sm" variant={filtresActifs ? "secondary" : "ghost"} aria-label="Filtres" onClick={ouvrirFiltres}><SlidersHorizontal /></Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden px-0">
        <Tabs value={statut || "toutes"} onValueChange={(v) => choisirStatut(v === "toutes" ? "" : (v as StatutFuite))}>
          <div className="scrollbar-none overflow-x-auto border-b px-4">
            <TabsList className="w-max" variant="line">
              <TabsTrigger className="text-xs" value="toutes">Toutes ({total})</TabsTrigger>
              {ORDRE_STATUTS.map((s) => (
                <TabsTrigger key={s} className="text-xs" value={s}>
                  <span className={cn("size-1.5 rounded-full", STATUT_STYLE[s].point)} />{STATUT_STYLE[s].court} ({compteurs[s] ?? 0})
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
        <div className="px-4">
          <InputGroup className="h-8">
            <InputGroupInput className="h-8" aria-label="Rechercher une fuite" placeholder="N°, référence, adresse…" value={texte} onChange={(e) => changerTexte(e.target.value)} />
            <InputGroupAddon><Search /></InputGroupAddon>
          </InputGroup>
        </div>
        <ScrollArea className="h-0 flex-1">
          <div className="flex flex-col gap-3 px-4 pb-4">
            {fuites.map((f) => <CarteFuite key={f.id} fuite={f} active={f.id === selection} libelles={libelles} choisir={choisir} />)}
            {fuites.length === 0 && <p className="py-8 text-center text-muted-foreground text-sm">Aucune fuite ne correspond aux filtres.</p>}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

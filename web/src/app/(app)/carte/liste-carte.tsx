"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
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

// Ligne compacte (deux lignes) : la carte garde la place.
function CarteFuite({ fuite, active, libelles, choisir }: { fuite: FuiteCarte; active: boolean; libelles: Libelles; choisir: (f: FuiteCarte) => void }) {
  const s = STATUT_STYLE[fuite.statut];
  const alertes = alertesDe(fuite);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(e) => { e.currentTarget.blur(); choisir(fuite); }}
      className={cn(
        "flex w-full flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-primary bg-muted/50",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm tabular-nums">N° {fuite.numero}</span>
        <span className="flex items-center gap-1 text-muted-foreground text-xs"><span className={cn("size-1.5 rounded-full", s.point)} />{s.court}</span>
        <span className="ml-auto text-muted-foreground text-xs tabular-nums">{dateSeule(fuite.date_detection)}</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="min-w-0 flex-1 truncate">{fuite.secteur ?? "Secteur non renseigné"}{fuite.adresse ? <span className="text-muted-foreground"> · {fuite.adresse}</span> : null}</span>
        {fuite.reference_srm && <span className="shrink-0 text-muted-foreground tabular-nums" title={libelles.reference}>{fuite.reference_srm}</span>}
      </div>
      {alertes.length > 0 && (
        <div className="truncate text-destructive text-xs">
          {alertes[0].texte(libelles)}{alertes.length > 1 && <span className="ml-1 text-muted-foreground">+{alertes.length - 1}</span>}
        </div>
      )}
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
      <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden px-0">
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
          <div className="flex flex-col gap-1.5 px-3 pb-3">
            {fuites.map((f) => <CarteFuite key={f.id} fuite={f} active={f.id === selection} libelles={libelles} choisir={choisir} />)}
            {fuites.length === 0 && <p className="py-8 text-center text-muted-foreground text-sm">Aucune fuite ne correspond aux filtres.</p>}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

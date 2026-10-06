"use client";

import type { Column, Table as TableInstance } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, RotateCcw, Settings2, X } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function IconeTri({ sens }: { sens: false | "asc" | "desc" }) {
  if (sens === "desc") return <ArrowDown data-icon="inline-end" />;
  if (sens === "asc") return <ArrowUp data-icon="inline-end" />;
  return <ArrowUpDown data-icon="inline-end" />;
}

/** En-tête de colonne triable (menu Croissant / Décroissant / Réinitialiser). */
export function EnTeteTriable<T>({ colonne, titre, className }: { colonne: Column<T, unknown>; titre: ReactNode; className?: string }) {
  if (!colonne.getCanSort()) return <span className={className}>{titre}</span>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("-ml-3 text-muted-foreground data-[state=open]:bg-accent", className)}>
          {titre}
          <IconeTri sens={colonne.getIsSorted()} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => colonne.toggleSorting(false)}><ArrowUp />Croissant</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => colonne.toggleSorting(true)}><ArrowDown />Décroissant</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => colonne.clearSorting()}><RotateCcw />Réinitialiser</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface OptionFacette { valeur: string; libelle: ReactNode; icone?: ComponentType<{ className?: string }>; nombre?: number }

/** Filtre à facettes (cases à cocher) d'une colonne, bouton en pointillé tant qu'il est vide (modèle « Tasks »). */
export function FiltreFacettes({ valeurs, changer, options, titre, icone: Icone = ListFilter, simple = false }: {
  valeurs: string[];
  changer: (valeurs: string[]) => void;
  options: OptionFacette[];
  titre: ReactNode;
  icone?: ComponentType<{ className?: string; "data-icon"?: string }>;
  /** Une seule valeur à la fois. */
  simple?: boolean;
}) {
  const choisies = new Set(valeurs);
  const basculer = (v: string) => {
    if (simple) {
      changer(choisies.has(v) ? [] : [v]);
      return;
    }
    const n = new Set(choisies);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    changer([...n]);
  };
  const libelleChoisi = valeurs.length === 1 ? options.find((o) => o.valeur === valeurs[0])?.libelle : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("border-dashed", choisies.size > 0 && "border-solid bg-muted text-foreground")}>
          <Icone data-icon="inline-start" />
          {titre}
          {choisies.size > 0 && (
            <span className="ml-1 rounded-sm bg-background px-1.5 text-xs font-normal text-muted-foreground">
              {libelleChoisi ?? choisies.size}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
        <DropdownMenuGroup>
          {options.map((o) => (
            <DropdownMenuCheckboxItem key={o.valeur} checked={choisies.has(o.valeur)} onCheckedChange={() => basculer(o.valeur)}
              onSelect={(e) => e.preventDefault()}>
              {o.icone && <o.icone className="text-muted-foreground" />}
              <span className="flex-1 truncate">{o.libelle}</span>
              {o.nombre != null && <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{o.nombre}</span>}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {choisies.size > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => changer([])} className="justify-center text-center"><X />Effacer</DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Menu « Affichage » : colonnes visibles. */
export function BasculeColonnes<T>({ table, libelles = {} }: { table: TableInstance<T>; libelles?: Record<string, string> }) {
  const colonnes = table.getAllColumns().filter((c) => typeof c.accessorFn !== "undefined" && c.getCanHide());
  const cachees = colonnes.filter((c) => !c.getIsVisible());
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={cn("ml-auto hidden lg:flex", cachees.length > 0 && "bg-muted text-foreground")}>
          <Settings2 data-icon="inline-start" />
          Affichage
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Colonnes</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {colonnes.map((c) => (
            <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)}
              onSelect={(e) => e.preventDefault()}>
              {libelles[c.id] ?? c.id}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

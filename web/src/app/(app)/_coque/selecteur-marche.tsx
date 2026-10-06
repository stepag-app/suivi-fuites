"use client";

import Link from "next/link";
import { Briefcase, Check, ChevronsUpDown, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Marche } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Marché ouvert (modèle « Account switcher ») : liste des marchés affectés, coche sur l'actuel. */
export function SelecteurMarche({ marches, marche, choisir, admin }: {
  marches: Marche[]; marche: Marche | null; choisir: (id: string) => void; admin: boolean;
}) {
  if (!marche && !admin) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-56 justify-start gap-2 font-medium">
          <Briefcase className="text-muted-foreground" />
          <span className="truncate">{marche?.code ?? "Aucun marché"}</span>
          {marche?.actif === false && <Badge variant="secondary" className="hidden sm:inline-flex">désactivé</Badge>}
          <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-64 space-y-1 rounded-lg" side="bottom" align="end" sideOffset={4}>
        <DropdownMenuLabel className="text-muted-foreground text-xs">Marchés</DropdownMenuLabel>
        {marches.map((m) => (
          <DropdownMenuItem key={m.id} className={cn("p-0", m.id === marche?.id && "bg-accent/50")} aria-current={m.id === marche?.id ? "true" : undefined} onClick={() => choisir(m.id)}>
            <div className="flex w-full items-center gap-2 px-1 py-1.5">
              <div className="flex size-9 items-center justify-center rounded-lg border bg-muted font-semibold text-xs">
                {m.code.slice(0, 3).toUpperCase()}
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{m.code}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {m.client}{m.ville ? ` · ${m.ville}` : ""}{m.actif === false ? " · désactivé" : ""}
                </span>
              </div>
              <span className={cn("mr-1 flex size-5 items-center justify-center rounded-full text-primary opacity-0", m.id === marche?.id && "opacity-100")}>
                <Check aria-hidden="true" />
              </span>
            </div>
          </DropdownMenuItem>
        ))}
        {marches.length === 0 && <DropdownMenuItem disabled>Aucun marché affecté</DropdownMenuItem>}
        {admin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/marches" prefetch={false}><Settings2 />Gérer les marchés</Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { type Table as TableInstance, flexRender } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Corps d'un tableau TanStack avec les composants shadcn (modèle « Tasks »). */
export function TableauDonnees<T>({ table, vide = "Aucun résultat.", onClicLigne, classeLigne, className }: {
  table: TableInstance<T>;
  vide?: ReactNode;
  onClicLigne?: (ligne: T) => void;
  classeLigne?: (ligne: T) => string | undefined;
  className?: string;
}) {
  const lignes = table.getRowModel().rows;
  return (
    <Table className={cn("**:data-[slot=table-cell]:px-4 **:data-[slot=table-head]:px-4", className)}>
      <TableHeader>
        {table.getHeaderGroups().map((groupe) => (
          <TableRow key={groupe.id} className="hover:bg-transparent">
            {groupe.headers.map((h) => (
              <TableHead key={h.id} colSpan={h.colSpan} className="h-11 font-medium text-muted-foreground">
                {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {lignes.length ? (
          lignes.map((ligne) => (
            <TableRow
              key={ligne.id}
              data-state={ligne.getIsSelected() ? "selected" : undefined}
              className={cn("border-border/60 hover:bg-muted/20", onClicLigne && "cursor-pointer", classeLigne?.(ligne.original))}
              onClick={onClicLigne ? () => onClicLigne(ligne.original) : undefined}
            >
              {ligne.getVisibleCells().map((cellule) => (
                <TableCell key={cellule.id} className="py-3 align-middle">
                  {flexRender(cellule.column.columnDef.cell, cellule.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={table.getVisibleLeafColumns().length} className="h-24 text-center text-muted-foreground">
              {vide}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

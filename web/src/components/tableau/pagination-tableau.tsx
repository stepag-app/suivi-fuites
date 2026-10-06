"use client";

import type { Table as TableInstance } from "@tanstack/react-table";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import type { MouseEvent } from "react";
import {
  Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const stop = (e: MouseEvent<HTMLAnchorElement>) => e.preventDefault();

function numerosPages(courante: number, total: number) {
  if (total <= 3) return Array.from({ length: total }, (_, i) => i + 1);
  if (courante <= 2) return [1, 2, 3];
  if (courante >= total - 1) return [total - 2, total - 1, total];
  return [courante - 1, courante, courante + 1];
}

/** Pied de tableau : lignes par page, « Page x sur y », navigation (modèle « Tasks »). */
export function PaginationTableau<T>({ table, selection = true, unite = "ligne" }: { table: TableInstance<T>; selection?: boolean; unite?: string }) {
  const pageIndex = table.getState().pagination.pageIndex;
  const total = Math.max(table.getPageCount(), 1);
  const courante = Math.min(pageIndex + 1, total);
  const numeros = numerosPages(courante, total);
  const precedent = table.getCanPreviousPage();
  const suivant = table.getCanNextPage();
  const nb = table.getFilteredRowModel().rows.length;
  const choisies = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="text-muted-foreground text-sm tabular-nums">
        {selection ? `${choisies} sur ${nb} ${unite}${nb > 1 ? "s" : ""} sélectionnée${choisies > 1 ? "s" : ""}.` : `${nb} ${unite}${nb > 1 ? "s" : ""}.`}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-6 lg:gap-8">
        <div className="flex items-center gap-2">
          <p className="font-medium text-muted-foreground text-sm">Par page</p>
          <Select value={`${table.getState().pagination.pageSize}`} onValueChange={(v) => table.setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-18" size="sm">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              <SelectGroup>
                {[10, 20, 30, 50, 100].map((n) => (
                  <SelectItem key={n} value={`${n}`}>{n}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-28 items-center justify-start font-medium text-sm sm:justify-center">
          Page {courante} sur {total}
        </div>
        <Pagination className="mx-0 w-auto justify-start sm:justify-end">
          <PaginationContent className="gap-1">
            <PaginationItem className="hidden lg:block">
              <PaginationLink href="#" aria-label="Première page" aria-disabled={!precedent}
                className={cn(!precedent && "pointer-events-none opacity-50")}
                onClick={(e) => { stop(e); if (precedent) table.setPageIndex(0); }}>
                <ChevronsLeft />
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationPrevious href="#" text="Préc." aria-disabled={!precedent}
                className={cn(!precedent && "pointer-events-none opacity-50")}
                onClick={(e) => { stop(e); if (precedent) table.previousPage(); }} />
            </PaginationItem>
            {numeros[0] > 1 && <PaginationItem><PaginationEllipsis /></PaginationItem>}
            {numeros.map((n) => (
              <PaginationItem key={n}>
                <PaginationLink href="#" isActive={pageIndex === n - 1} onClick={(e) => { stop(e); table.setPageIndex(n - 1); }}>
                  {n}
                </PaginationLink>
              </PaginationItem>
            ))}
            {numeros[numeros.length - 1] < total && <PaginationItem><PaginationEllipsis /></PaginationItem>}
            <PaginationItem>
              <PaginationNext href="#" text="Suiv." aria-disabled={!suivant}
                className={cn(!suivant && "pointer-events-none opacity-50")}
                onClick={(e) => { stop(e); if (suivant) table.nextPage(); }} />
            </PaginationItem>
            <PaginationItem className="hidden lg:block">
              <PaginationLink href="#" aria-label="Dernière page" aria-disabled={!suivant}
                className={cn(!suivant && "pointer-events-none opacity-50")}
                onClick={(e) => { stop(e); if (suivant) table.setPageIndex(total - 1); }}>
                <ChevronsRight />
              </PaginationLink>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

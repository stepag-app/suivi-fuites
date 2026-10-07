"use client";

import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Camera, ExternalLink, FileText, MapPinned, MoreHorizontal, Navigation } from "lucide-react";
import { BadgeStatut, BadgesAlertes } from "@/components/statut";
import { EnTeteTriable } from "@/components/tableau/outils-tableau";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dateHeure, type libellesMarche } from "@/lib/format";
import { lienItineraire } from "@/lib/itineraire";
import type { FuiteListe } from "@/lib/colonnes-fuites";

type Libelles = ReturnType<typeof libellesMarche>;

export const LIBELLES_COLONNES: Record<string, string> = {
  numero: "N°", reference_srm: "Référence", secteur: "Secteur", adresse: "Adresse", date_detection: "Détectée le",
  statut: "Statut", alertes: "Alertes", nb_photos: "Photos",
};

export function colonnesFuites(libelles: Libelles, actions: { rapport: (f: FuiteListe) => void; peutRapport: boolean }): ColumnDef<FuiteListe>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Tout sélectionner"
          className="translate-y-0.5"
        />
      ),
      cell: ({ row }) => (
        <Checkbox checked={row.getIsSelected()} onCheckedChange={(v) => row.toggleSelected(!!v)} aria-label="Sélectionner"
          className="translate-y-0.5" onClick={(e) => e.stopPropagation()} />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "numero",
      header: ({ column }) => <EnTeteTriable colonne={column} titre="N°" />,
      cell: ({ row }) => (
        <Link href={`/fuites/${row.original.id}`} prefetch={false} className="font-medium tabular-nums hover:underline" onClick={(e) => e.stopPropagation()}>
          {row.original.numero}
        </Link>
      ),
      enableHiding: false,
    },
    {
      accessorKey: "reference_srm",
      header: libelles.reference,
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {row.original.reference_srm ?? <span className="text-muted-foreground">—</span>}
          {row.original.origine === "srm" && <Badge variant="secondary" className="rounded-sm">{libelles.sigle}</Badge>}
        </span>
      ),
    },
    {
      accessorKey: "secteur",
      header: ({ column }) => <EnTeteTriable colonne={column} titre="Secteur" />,
      cell: ({ row }) => row.original.secteur ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: "adresse",
      header: "Adresse",
      cell: ({ row }) => <span className="block max-w-64 truncate" title={row.original.adresse ?? undefined}>{row.original.adresse ?? <span className="text-muted-foreground">—</span>}</span>,
    },
    {
      accessorKey: "date_detection",
      header: ({ column }) => <EnTeteTriable colonne={column} titre="Détectée le" />,
      cell: ({ row }) => (
        <span className="block whitespace-nowrap tabular-nums">
          {dateHeure(row.original.date_detection)}
          {row.original.detectee_par && <span className="block text-muted-foreground text-xs">{row.original.detectee_par}</span>}
        </span>
      ),
    },
    {
      accessorKey: "statut",
      header: "Statut",
      cell: ({ row }) => <BadgeStatut statut={row.original.statut} court />,
    },
    {
      id: "alertes",
      accessorFn: (f) => [f.alerte_non_reparee, f.alerte_communication_srm, f.refection_chaussee_hors_delai, f.alerte_refection_chaussee, f.alerte_refection_trottoir].filter(Boolean).length,
      header: "Alertes",
      cell: ({ row }) => <BadgesAlertes fuite={row.original} libelles={libelles} verrouillee={row.original.verrouillee_le} />,
    },
    {
      accessorKey: "nb_photos",
      header: ({ column }) => <div className="text-right"><EnTeteTriable colonne={column} titre="Photos" className="-mr-3 ml-0" /></div>,
      cell: ({ row }) => (
        <span className="flex items-center justify-end gap-1 text-muted-foreground tabular-nums">
          <Camera className="size-3.5" />{row.original.nb_photos}
        </span>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const f = row.original;
        const itineraire = lienItineraire(f.latitude, f.longitude);
        return (
          <div className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground data-[state=open]:bg-muted" onClick={(e) => e.stopPropagation()} aria-label="Actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem asChild><Link href={`/fuites/${f.id}`} prefetch={false}><ExternalLink />Ouvrir la fiche</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href={`/fuites/${f.id}`} target="_blank" rel="noopener"><ExternalLink />Dans un nouvel onglet</Link></DropdownMenuItem>
                <DropdownMenuSeparator />
                {itineraire && <DropdownMenuItem asChild><a href={itineraire} target="_blank" rel="noreferrer"><Navigation />Y aller</a></DropdownMenuItem>}
                {f.latitude != null && <DropdownMenuItem asChild><Link href={`/carte?fuite=${f.id}`} prefetch={false}><MapPinned />Voir sur la carte</Link></DropdownMenuItem>}
                {actions.peutRapport && <DropdownMenuItem onSelect={() => actions.rapport(f)}><FileText />Rapport PDF</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    },
  ];
}

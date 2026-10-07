"use client";

import Link from "next/link";
import type { Row } from "@tanstack/react-table";
import { Camera, ChevronRight } from "lucide-react";
import { BadgeStatut, BadgesAlertes } from "@/components/statut";
import { Badge } from "@/components/ui/badge";
import { dateHeure, type libellesMarche } from "@/lib/format";
import type { FuiteListe } from "@/lib/colonnes-fuites";

/** Écran étroit (tablette en portrait, téléphone) : une carte par fuite, mêmes lignes que le tableau. */
export function VueCartes({ lignes, libelles }: { lignes: Row<FuiteListe>[]; libelles: ReturnType<typeof libellesMarche> }) {
  if (!lignes.length) return <p className="p-6 text-center text-muted-foreground text-sm">Aucune fuite à afficher.</p>;
  return (
    <ul className="divide-y">
      {lignes.map(({ original: f }) => (
        <li key={f.id}>
          <Link href={`/fuites/${f.id}`} prefetch={false} className="flex items-center gap-3 px-4 py-3 active:bg-muted/50">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">N° {f.numero}{f.reference_srm ? <span className="text-muted-foreground font-normal"> · {f.reference_srm}</span> : null}
                  {f.origine === "srm" && <Badge variant="secondary" className="ml-1.5 rounded-sm">{libelles.sigle}</Badge>}
                </span>
                <BadgeStatut statut={f.statut} court />
              </div>
              <div className="text-sm">{f.secteur ?? "Secteur non renseigné"}{f.adresse ? <span className="text-muted-foreground"> · {f.adresse}</span> : null}</div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs tabular-nums">
                {dateHeure(f.date_detection)}{f.detectee_par ? ` · ${f.detectee_par}` : ""}
                <span className="flex items-center gap-1"><Camera className="size-3" />{f.nb_photos}</span>
              </div>
              <BadgesAlertes fuite={f} libelles={libelles} verrouillee={f.verrouillee_le} vide={null} />
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

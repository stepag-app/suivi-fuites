"use client";

import Link from "next/link";
import { Camera, CalendarDays, MapPin } from "lucide-react";
import { BadgesAlertes, ORDRE_STATUTS, STATUT_STYLE } from "@/components/statut";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { dateSeule, type libellesMarche } from "@/lib/format";
import type { VFuite } from "@/lib/types";
import { cn, pluriel } from "@/lib/utils";

/** Vue en colonnes par statut (modèle « Kanban », sans glisser-déposer : le statut se change sur la fiche). */
export function VueKanban({ fuites, libelles }: { fuites: VFuite[]; libelles: ReturnType<typeof libellesMarche> }) {
  return (
    <div className="grid auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-4 overflow-x-auto p-4">
      {ORDRE_STATUTS.map((statut) => {
        const liste = fuites.filter((f) => f.statut === statut);
        const s = STATUT_STYLE[statut];
        return (
          <section key={statut} className="flex min-h-0 flex-col rounded-t-xl border bg-muted/50">
            <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full", s.point)} />
                  <h2 className="truncate font-medium text-base leading-none">{s.libelle}</h2>
                </div>
                <p className="text-muted-foreground text-sm tabular-nums leading-none">{pluriel(liste.length, "fuite")}</p>
              </div>
            </div>
            <div className="flex max-h-[62vh] min-h-24 flex-col gap-3 overflow-y-auto px-3 pb-3">
              {liste.map((f) => (
                <Link key={f.id} href={`/fuites/${f.id}`} prefetch={false}
                  className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="min-w-0 truncate font-medium text-sm leading-none">N° {f.numero}{f.reference_srm ? ` · ${f.reference_srm}` : ""}</h3>
                      {f.origine === "srm" && <Badge variant="secondary" className="shrink-0 rounded-md">{libelles.sigle}</Badge>}
                    </div>
                    <p className="line-clamp-2 text-muted-foreground text-sm leading-5">{f.adresse ?? "Adresse non renseignée"}</p>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground text-sm">
                    <span className="flex min-w-0 items-center gap-1.5"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{f.secteur ?? "—"}</span></span>
                    <span className="flex shrink-0 items-center gap-1.5 tabular-nums">{dateSeule(f.date_detection)}<CalendarDays className="size-3" /></span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between gap-2">
                    <BadgesAlertes fuite={f} libelles={libelles} verrouillee={f.verrouillee_le} vide={<span className="text-muted-foreground text-xs">aucune alerte</span>} />
                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-sm"><Camera className="size-3.5" />{f.nb_photos}</span>
                  </div>
                </Link>
              ))}
              {liste.length === 0 && <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-xs">Aucune fuite</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

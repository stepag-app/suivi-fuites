"use client";

import Link from "next/link";
import { Camera, CalendarDays, MapPin } from "lucide-react";
import { BadgesAlertes, ORDRE_STATUTS, STATUT_STYLE } from "@/components/statut";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { dateSeule, type libellesMarche } from "@/lib/format";
import type { FuiteListe } from "@/lib/colonnes-fuites";
import { cn, pluriel } from "@/lib/utils";

/**
 * Vue en colonnes par statut (modèle « Kanban », sans glisser-déposer : le statut se change sur la fiche).
 * Les 5 colonnes se partagent la largeur (10,5 rem au moins) : défilement horizontal seulement sous ≈ 1 200 px, menu ouvert.
 */
export function VueKanban({ fuites, libelles }: { fuites: FuiteListe[]; libelles: ReturnType<typeof libellesMarche> }) {
  return (
    <div className="grid grid-cols-[repeat(5,minmax(10.5rem,1fr))] gap-2.5 overflow-x-auto p-3">
      {ORDRE_STATUTS.map((statut) => {
        const liste = fuites.filter((f) => f.statut === statut);
        const s = STATUT_STYLE[statut];
        return (
          <section key={statut} className="flex min-h-0 min-w-0 flex-col rounded-t-xl border bg-muted/50">
            <div className="min-w-0 space-y-1 px-3 pt-3 pb-2.5">
              <div className="flex items-center gap-2" title={s.libelle}>
                <span className={cn("size-2.5 shrink-0 rounded-full", s.point)} />
                <h2 className="truncate font-medium text-sm leading-none">{s.libelle}</h2>
              </div>
              <p className="text-muted-foreground text-xs tabular-nums leading-none">{pluriel(liste.length, "fuite")}</p>
            </div>
            <div className="flex max-h-[62vh] min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {liste.map((f) => (
                <Link key={f.id} href={`/fuites/${f.id}`} prefetch={false}
                  className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-2.5 text-card-foreground shadow-xs transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="min-w-0 truncate font-medium text-sm leading-tight" title={f.reference_srm ?? undefined}>
                        N° {f.numero}{f.reference_srm ? <span className="font-normal text-muted-foreground"> · {f.reference_srm}</span> : null}
                      </h3>
                      {f.origine === "srm" && <Badge variant="secondary" className="shrink-0 rounded-md px-1.5 text-[0.625rem]">{libelles.sigle}</Badge>}
                    </div>
                    <p className="line-clamp-2 text-muted-foreground text-xs leading-4">{f.adresse ?? "Adresse non renseignée"}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
                    <span className="flex min-w-0 items-center gap-1"><MapPin className="size-3 shrink-0" /><span className="truncate">{f.secteur ?? "—"}</span></span>
                    <span className="flex shrink-0 items-center gap-1 tabular-nums"><CalendarDays className="size-3" />{dateSeule(f.date_detection)}</span>
                  </div>
                  <Separator />
                  <div className="flex min-w-0 items-start justify-between gap-2 [&_[data-slot=badge]]:h-auto [&_[data-slot=badge]]:whitespace-normal [&_[data-slot=badge]]:text-[0.625rem]">
                    <BadgesAlertes fuite={f} libelles={libelles} verrouillee={f.verrouillee_le} vide={<span className="text-muted-foreground text-xs">aucune alerte</span>} />
                    <span className="flex shrink-0 items-center gap-1 text-muted-foreground text-xs"><Camera className="size-3" />{f.nb_photos}</span>
                  </div>
                </Link>
              ))}
              {liste.length === 0 && <div className="rounded-lg border border-dashed p-3 text-center text-muted-foreground text-xs">Aucune fuite</div>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

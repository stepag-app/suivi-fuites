"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { debit, jourFr, pourcent, type ResultatDebits } from "@/lib/debits";
import { messageErreur } from "@/lib/format";
import { fonctionAbsente, getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

/** Dernière valeur connue d'une zone : contrôle de maintien, sinon Qf, sinon Qi. */
export function derniereValeur(r: ResultatDebits): { q: number; libelle: string } | null {
  if (r.dernier_controle_m3h != null) return { q: r.dernier_controle_m3h, libelle: `contrôle du ${jourFr(r.dernier_controle)}` };
  if (r.qf_m3h != null) return { q: r.qf_m3h, libelle: "Qf (après balayage)" };
  if (r.qi_m3h != null) return { q: r.qi_m3h, libelle: "Qi (avant intervention)" };
  return null;
}

/** Widget S15 : débit de nuit de chaque zone face au Q exigé, τ et alertes (droit « mesures_debit / lire »). */
export function DebitsNuit({ marcheId }: { marcheId: string }) {
  const [lignes, setLignes] = useState<ResultatDebits[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [absent, setAbsent] = useState(false);

  useEffect(() => {
    let annule = false;
    setLignes(null);
    getSupabase().rpc("debits_resultats", { p_marche: marcheId }).then(({ data, error }) => {
      if (annule) return;
      if (fonctionAbsente(error, data)) setAbsent(true);
      else if (error) setErreur(messageErreur(error));
      else setLignes((data as ResultatDebits[] | null) ?? []);
    });
    return () => { annule = true; };
  }, [marcheId]);

  if (absent) return null;
  const zones = lignes?.filter((r) => r.niveau === "zone") ?? [];
  const marche = lignes?.find((r) => r.niveau === "marche");
  const alertes = zones.filter((r) => r.alerte_arret || r.alerte_degradation).length;
  const mesuree = zones.some((r) => derniereValeur(r));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 leading-none"><Gauge className="size-4 text-muted-foreground" />Débits de nuit</CardTitle>
        <CardDescription>
          {marche?.tau1_pct != null ? `τ1 du marché ${pourcent(marche.tau1_pct)}` : "Qf pas encore mesuré sur toutes les zones"}
          {marche?.tau2_pct != null ? ` · τ2 ${pourcent(marche.tau2_pct)}` : ""}
          {alertes ? ` · ${alertes} zone${alertes > 1 ? "s" : ""} en alerte` : ""}.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <Link href="/debits" prefetch={false}>Débits<ArrowRight data-icon="inline-end" /></Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {erreur ? <p className="text-destructive text-sm">{erreur}</p> : !lignes ? (
          <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-6" />)}</div>
        ) : !mesuree ? (
          <p className="text-muted-foreground text-sm">Aucune mesure de nuit validée pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y text-sm">
            {zones.map((r) => {
              const v = derniereValeur(r);
              const ecart = v && r.q_exige_m3h ? v.q - r.q_exige_m3h : null;
              return (
                <li key={r.zone_id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate">Zone {r.zone_numero} <span className="text-muted-foreground">{r.zone_libelle}</span></span>
                    <span className="block truncate text-muted-foreground text-xs">{v ? v.libelle : "non mesurée"} · Q exigé {debit(r.q_exige_m3h, 0)} m³/h</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {r.alerte_arret && <Badge variant="destructive">Arrêt</Badge>}
                    {r.alerte_degradation && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">Dégradation</Badge>}
                    <span className={cn("font-medium tabular-nums", ecart != null && (ecart > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-400"))}>
                      {v ? debit(v.q) : "—"} <span className="font-normal text-muted-foreground text-xs">m³/h</span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

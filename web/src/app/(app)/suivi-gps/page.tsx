"use client";

import { ChevronLeft, ChevronRight, Footprints, MapPinOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import {
  couleurAgent, decalerJour, duree, heureMaroc, jourDe, kilometres, resume, type LigneTrace, type TraceDetail,
} from "@/lib/trace-gps";
import { CarteTrace, type TraceAffichee } from "./CarteTrace";

/** Suivi GPS des agents (X6) : tracé d'un jour sur la carte ; responsable du marché et administrateur seulement (RLS de la base). */
export default function SuiviGps() {
  const { marche, profil, peut } = useSession();
  const marcheId = marche?.id;
  const autorise = !!profil?.est_admin || peut("fuites", "valider");
  const [jour, setJour] = useState(() => jourDe(new Date()));
  const [lignes, setLignes] = useState<LigneTrace[]>([]);
  const [details, setDetails] = useState<Record<string, TraceDetail>>({});
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    if (!marcheId || !autorise) return;
    setChargement(true);
    setErreur("");
    setLignes([]);
    setDetails({});
    setExclus(new Set());
    try {
      const sb = getSupabase();
      const { data, error } = await sb.from("v_traces_gps").select("*").eq("marche_id", marcheId).eq("jour", jour).order("nom_complet");
      if (error) throw error;
      const liste = (data ?? []) as LigneTrace[];
      setLignes(liste);
      const lus = await Promise.all(liste.map(async (l) => {
        const r = await sb.rpc("trace_gps", { p_marche: marcheId, p_profil: l.profil_id, p_jour: l.jour });
        if (r.error) throw r.error;
        return r.data as TraceDetail | null;
      }));
      setDetails(Object.fromEntries(lus.filter((d): d is TraceDetail => !!d).map((d) => [d.profil_id, d])));
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setChargement(false);
    }
  }, [marcheId, autorise, jour]);

  useEffect(() => { void charger(); }, [charger]);

  const affichees: TraceAffichee[] = useMemo(
    () => lignes
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => !exclus.has(l.profil_id) && details[l.profil_id])
      .map(({ l, i }) => ({ id: l.profil_id, nom: l.nom_complet, couleur: couleurAgent(i), points: details[l.profil_id].points })),
    [lignes, details, exclus],
  );

  function basculer(id: string) {
    setExclus((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  if (!marche) return <Vide>Aucun marché sélectionné.</Vide>;
  if (!autorise) return <Vide>Le suivi GPS est réservé au responsable du marché et à l&apos;administrateur.</Vide>;

  const aujourdhui = jourDe(new Date());
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <EnTetePage
        titre="Suivi GPS"
        description={`Parcours des agents, un tracé par agent et par jour · ${marche.code}`}
        actions={(
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Jour précédent" onClick={() => setJour(decalerJour(jour, -1))}><ChevronLeft /></Button>
            <Input type="date" aria-label="Jour" className="w-40" value={jour} max={aujourdhui} onChange={(e) => e.target.value && setJour(e.target.value)} />
            <Button variant="outline" size="icon" aria-label="Jour suivant" disabled={jour >= aujourdhui} onClick={() => setJour(decalerJour(jour, 1))}><ChevronRight /></Button>
            {jour !== aujourdhui && <Button variant="ghost" onClick={() => setJour(aujourdhui)}>Aujourd&apos;hui</Button>}
          </div>
        )}
      />
      {erreur && (
        <Alert variant="destructive"><AlertTitle>Tracés indisponibles</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>
      )}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col content-start gap-2 overflow-auto">
          {chargement && <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement des tracés…</p>}
          {!chargement && !erreur && lignes.length === 0 && (
            <Vide className="h-auto flex-col gap-2 py-10 text-center"><MapPinOff className="size-5" />Aucun tracé ce jour-là pour ce marché.</Vide>
          )}
          {lignes.map((l, i) => {
            const d = details[l.profil_id];
            const r = d ? resume(d.points) : null;
            return (
              <label key={l.id} className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-3 text-card-foreground has-[[data-state=unchecked]]:opacity-60">
                <Checkbox checked={!exclus.has(l.profil_id)} onCheckedChange={() => basculer(l.profil_id)} aria-label={`Afficher le tracé de ${l.nom_complet}`} className="mt-0.5" />
                <span className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: couleurAgent(i) }} aria-hidden="true" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{l.nom_complet}</span>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {r?.debut != null && r.fin != null ? `${heureMaroc(r.debut)} → ${heureMaroc(r.fin)}` : "—"} · {kilometres(l.distance_m)} · {l.nb_points} point{l.nb_points > 1 ? "s" : ""}
                  </span>
                  {r && r.coupures > 0 && (
                    <span className="text-muted-foreground text-xs">Suivi pendant {duree(r.suiviS)} · {r.coupures} interruption{r.coupures > 1 ? "s" : ""} (tablette éteinte ou sans signal)</span>
                  )}
                </span>
                <Footprints className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </label>
            );
          })}
        </div>
        <div className="h-[calc(100vh-13rem)] min-h-96">
          <CarteTrace marcheId={marche.id} traces={affichees} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { ChevronLeft, ChevronRight, Coffee, Footprints, MapPinOff } from "lucide-react";
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
  bornesPause, couleurAgent, decalerJour, duree, heureCourte, heureMaroc, jourDe, kilometres, MOTIFS_FIN_PAUSE, resume, texteEtat,
  texteJours, textePause, totalPausesS, type EtatGps, type LigneTrace, type PauseGps, type TraceDetail,
} from "@/lib/trace-gps";
import { cn } from "@/lib/utils";
import { CarteTrace, type TraceAffichee } from "./CarteTrace";

interface HeuresMarche { suivi_gps_debut: string; suivi_gps_fin: string; suivi_gps_jours: number[] }
/** Agent affiché : son tracé du jour s'il en a un, ses pauses (sans lieu), l'état de sa tablette (aujourd'hui). */
interface Agent { id: string; nom: string; ligne: LigneTrace | null; rang: number | null; pauses: PauseGps[]; etat: EtatGps | null }

/**
 * Suivi GPS des agents (X6) : tracé d'un jour sur la carte, pauses (début, fin, durée, jamais le lieu), état des tablettes
 * et suivi coupé ; responsable du marché et administrateur seulement (RLS de la base).
 */
export default function SuiviGps() {
  const { marche, profil, peut } = useSession();
  const marcheId = marche?.id;
  const autorise = !!profil?.est_admin || peut("fuites", "valider");
  const [jour, setJour] = useState(() => jourDe(new Date()));
  const [lignes, setLignes] = useState<LigneTrace[]>([]);
  const [details, setDetails] = useState<Record<string, TraceDetail>>({});
  const [exclus, setExclus] = useState<Set<string>>(new Set());
  const [pauses, setPauses] = useState<PauseGps[]>([]);
  const [etats, setEtats] = useState<EtatGps[]>([]);
  const [heures, setHeures] = useState<HeuresMarche | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");

  const charger = useCallback(async () => {
    if (!marcheId || !autorise) return;
    setChargement(true);
    setErreur("");
    setLignes([]);
    setDetails({});
    setExclus(new Set());
    setPauses([]);
    setEtats([]);
    try {
      const sb = getSupabase();
      // Pauses, états et heures : absents tant que la base n'est pas à jour (le tracé s'affiche quand même).
      const [p, e, m] = await Promise.all([
        sb.from("pauses_gps").select("profil_id, debut, fin_prevue, fin, motif_fin").eq("marche_id", marcheId).eq("jour", jour).order("debut"),
        sb.from("v_suivi_gps_etats").select("*").eq("marche_id", marcheId),
        sb.from("marches").select("suivi_gps_debut, suivi_gps_fin, suivi_gps_jours").eq("id", marcheId).maybeSingle(),
      ]);
      setPauses(p.error ? [] : (p.data as PauseGps[]));
      setEtats(e.error ? [] : (e.data as EtatGps[]));
      setHeures(m.error ? null : (m.data as HeuresMarche | null));
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

  const aujourdhui = jourDe(new Date());
  const agents: Agent[] = useMemo(() => {
    const liste = new Map<string, Agent>();
    lignes.forEach((l, i) => liste.set(l.profil_id, { id: l.profil_id, nom: l.nom_complet, ligne: l, rang: i, pauses: [], etat: null }));
    const nom = (id: string) => etats.find((x) => x.profil_id === id)?.nom_complet ?? "Agent";
    for (const p of pauses) {
      if (!liste.has(p.profil_id)) liste.set(p.profil_id, { id: p.profil_id, nom: nom(p.profil_id), ligne: null, rang: null, pauses: [], etat: null });
      liste.get(p.profil_id)!.pauses.push(p);
    }
    // État des tablettes : le jour même seulement ; une session fermée sans tracé ni pause n'est pas listée.
    if (jour === aujourdhui) {
      for (const e of etats) {
        const a = liste.get(e.profil_id);
        if (a) a.etat = e;
        else if (e.etat !== "ferme" || e.coupe_depuis) liste.set(e.profil_id, { id: e.profil_id, nom: e.nom_complet, ligne: null, rang: null, pauses: [], etat: e });
      }
    }
    return [...liste.values()].sort((a, b) => (a.rang ?? 1e9) - (b.rang ?? 1e9) || a.nom.localeCompare(b.nom, "fr"));
  }, [lignes, pauses, etats, jour, aujourdhui]);
  const coupes = agents.filter((a) => a.etat && texteEtat(a.etat).alerte);

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

  const pausesAffichees = agents.filter((a) => a.pauses.length && !exclus.has(a.id));
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:p-6">
      <EnTetePage
        titre="Suivi GPS"
        description={heures
          ? `Parcours des agents pendant les heures de travail (${heureCourte(heures.suivi_gps_debut)} à ${heureCourte(heures.suivi_gps_fin)}, ${texteJours(heures.suivi_gps_jours)}), hors pauses · ${marche.code}`
          : `Parcours des agents, un tracé par agent et par jour · ${marche.code}`}
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
      {coupes.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Suivi coupé pendant les heures de travail</AlertTitle>
          <AlertDescription>
            {coupes.map((a) => `${a.nom} : ${texteEtat(a.etat!).texte.toLowerCase()}`).join(" · ")}. Application fermée, autorisation retirée,
            tablette éteinte ou sans réseau : voyez avec l&apos;agent.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col content-start gap-2 overflow-auto">
          {chargement && <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement des tracés…</p>}
          {!chargement && !erreur && agents.length === 0 && (
            <Vide className="h-auto flex-col gap-2 py-10 text-center"><MapPinOff className="size-5" />Aucun tracé ce jour-là pour ce marché.</Vide>
          )}
          {agents.map((a) => {
            const l = a.ligne;
            const d = details[a.id];
            const intervalles = a.pauses.map((p) => bornesPause(p));
            const r = d ? resume(d.points, intervalles) : null;
            const etat = a.etat ? texteEtat(a.etat) : null;
            const couleur = a.rang != null ? couleurAgent(a.rang) : null;
            return (
              <label key={a.id} className={cn("flex items-start gap-3 rounded-xl border bg-card p-3 text-card-foreground has-[[data-state=unchecked]]:opacity-60", l && "cursor-pointer")}>
                <Checkbox checked={!!l && !exclus.has(a.id)} disabled={!l} onCheckedChange={() => basculer(a.id)} aria-label={`Afficher le tracé de ${a.nom}`} className="mt-0.5" />
                <span className="mt-1 size-3 shrink-0 rounded-full border" style={{ backgroundColor: couleur ?? "transparent" }} aria-hidden="true" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{a.nom}</span>
                  {l ? (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {r?.debut != null && r.fin != null ? `${heureMaroc(r.debut)} → ${heureMaroc(r.fin)}` : "—"} · {kilometres(l.distance_m)} · {l.nb_points} point{l.nb_points > 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-xs">Aucun point ce jour-là</span>
                  )}
                  {r && r.coupures > 0 && (
                    <span className="text-muted-foreground text-xs">Suivi pendant {duree(r.suiviS)} · {r.coupures} interruption{r.coupures > 1 ? "s" : ""} (tablette éteinte ou sans signal)</span>
                  )}
                  {a.pauses.length > 0 && (
                    <span className="text-muted-foreground text-xs tabular-nums">
                      Pause{a.pauses.length > 1 ? "s" : ""} ({duree(totalPausesS(a.pauses))}) : {a.pauses.map((p) => `${textePause(p)}${p.motif_fin && p.motif_fin !== "automatique" ? `, ${MOTIFS_FIN_PAUSE[p.motif_fin]}` : ""}`).join(" · ")}
                    </span>
                  )}
                  {etat && (
                    <span className={cn("text-xs", etat.alerte ? "font-medium text-destructive" : "text-muted-foreground")}>
                      {etat.texte}{a.etat?.dernier_signe ? ` · dernier signe de la tablette ${heureMaroc(Math.floor(new Date(a.etat.dernier_signe).getTime() / 1000))}` : ""}
                    </span>
                  )}
                </span>
                <Footprints className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </label>
            );
          })}
        </div>
        <div className="h-[calc(100vh-13rem)] min-h-96">
          <CarteTrace marcheId={marche.id} traces={affichees} legende={pausesAffichees.length > 0 && (
            <div className="max-w-72 rounded-lg border bg-background/95 p-2.5 text-xs shadow-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium"><Coffee className="size-3.5" aria-hidden="true" />Pauses (sans lieu)</p>
              <ul className="flex flex-col gap-1">
                {pausesAffichees.map((a) => (
                  <li key={a.id} className="flex items-start gap-1.5 tabular-nums">
                    <span className="mt-1 size-2 shrink-0 rounded-full border" style={{ backgroundColor: a.rang != null ? couleurAgent(a.rang) : "transparent" }} aria-hidden="true" />
                    <span><span className="font-medium">{a.nom}</span> : {a.pauses.map((p) => textePause(p)).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )} />
        </div>
      </div>
    </div>
  );
}

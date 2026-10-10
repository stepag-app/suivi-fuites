"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { messageErreur } from "@/lib/format";
import { fonctionAbsente, getSupabase } from "@/lib/supabase";
import type { Marche } from "@/lib/types";
import { cn } from "@/lib/utils";

// Une ligne de la table notifications (contrat S1 § 5) : une par destinataire, texte français prêt à afficher.
export interface Notification {
  id: number;
  marche_id: string;
  evenement: string;
  fuite_id: string | null;
  titre: string;
  corps: string | null;
  cree_le: string;
  lue_le: string | null;
}

const LIMITE = 30;

export const pastille = (n: number) => (n > 9 ? "9+" : String(n));

export function ilYA(iso: string, maintenant = Date.now()): string {
  const min = Math.max(0, Math.round((maintenant - new Date(iso).getTime()) / 60_000));
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j < 7) return `il y a ${j} j`;
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// N1 : cloche de la coque. Pastille rouge discrète (nombre, « 9+ ») ; à l'ouverture, la liste montre en bleu ce qui
// n'était pas lu puis tout est marqué lu ; clic → fiche de la fuite ; nouvelles notifications en direct (temps réel) ;
// « Tout voir » → page /notifications (au-delà des 30 dernières).
export function Cloche({ moi, marches }: { moi: string; marches: Marche[] }) {
  const router = useRouter();
  const [nonLues, setNonLues] = useState(0);
  const [ouverte, setOuverte] = useState(false);
  const [liste, setListe] = useState<Notification[] | null>(null);
  const [erreur, setErreur] = useState("");
  const [disponible, setDisponible] = useState(true);
  const ouverteRef = useRef(false);
  const nonLuesRef = useRef(0);
  nonLuesRef.current = nonLues;

  const compter = useCallback(async () => {
    const { data, error } = await getSupabase().rpc("compter_notifications_non_lues");
    // Base pas encore à jour : pas de cloche plutôt qu'une erreur
    if (fonctionAbsente(error, data)) {
      if (error) setDisponible(false);
      return;
    }
    if (!error) setNonLues(Number(data) || 0);
  }, []);

  // Liste telle qu'elle était avant l'ouverture (bleu = non lue), puis tout est marqué lu en base.
  const ouvrirListe = useCallback(async () => {
    const sb = getSupabase();
    setErreur("");
    const { data, error } = await sb.from("notifications")
      .select("id, marche_id, evenement, fuite_id, titre, corps, cree_le, lue_le")
      .order("cree_le", { ascending: false }).limit(LIMITE);
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    const lignes = (data as Notification[] | null) ?? [];
    setListe(lignes);
    if (lignes.some((n) => !n.lue_le) || nonLuesRef.current > 0) {
      const { error: e } = await sb.rpc("marquer_notifications_lues");
      if (!e) setNonLues(0);
    }
  }, []);

  useEffect(() => {
    compter();
    const surRetour = () => document.visibilityState === "visible" && compter();
    document.addEventListener("visibilitychange", surRetour);
    const sb = getSupabase();
    // Client de démonstration : pas de temps réel
    if (typeof sb.channel !== "function") return () => document.removeEventListener("visibilitychange", surRetour);
    const canal = sb.channel(`cloche-${moi}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `destinataire_id=eq.${moi}` }, (charge) => {
        const n = charge.new as Notification;
        if (ouverteRef.current) {
          // Liste ouverte : la nouvelle s'ajoute en tête, non lue, puis passe lue comme le reste
          setListe((l) => [n, ...(l ?? []).filter((x) => x.id !== n.id)].slice(0, LIMITE));
          getSupabase().rpc("marquer_notifications_lues", { p_ids: [n.id] });
        } else {
          setNonLues((c) => c + 1);
        }
      })
      .subscribe();
    return () => {
      document.removeEventListener("visibilitychange", surRetour);
      sb.removeChannel(canal);
    };
  }, [moi, compter]);

  if (!disponible) return null;

  const codeMarche = (id: string) => marches.find((m) => m.id === id)?.code ?? "";
  const plusieursMarches = new Set((liste ?? []).map((n) => n.marche_id)).size > 1;

  return (
    <Popover open={ouverte} onOpenChange={(o) => {
      setOuverte(o);
      ouverteRef.current = o;
      if (o) ouvrirListe();
    }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={nonLues ? `Notifications : ${nonLues} non lue${nonLues > 1 ? "s" : ""}` : "Notifications"}>
          <Bell />
          {nonLues > 0 && (
            <span className="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-600 px-1 font-semibold text-[9px] text-white leading-none tabular-nums ring-2 ring-background">
              {pastille(nonLues)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-1rem)] gap-0 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="font-medium">Notifications</span>
          {liste && liste.length > 0 && <span className="text-muted-foreground text-xs">Tout est marqué lu</span>}
        </div>
        {erreur ? <p className="p-3 text-destructive text-sm">{erreur}</p> : !liste ? (
          <p className="flex items-center gap-2 p-3 text-muted-foreground text-sm"><Spinner />Chargement…</p>
        ) : liste.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground text-sm">Aucune notification.</p>
        ) : (
          <div className="max-h-[min(28rem,70vh)] overflow-y-auto overscroll-contain">
            <ul className="divide-y">
              {liste.map((n) => {
                const nonLue = !n.lue_le;
                return (
                  <li key={n.id}>
                    <button type="button" disabled={!n.fuite_id}
                      className={cn("flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:cursor-default", !nonLue && "text-muted-foreground")}
                      onClick={() => {
                        if (!n.fuite_id) return;
                        setOuverte(false);
                        ouverteRef.current = false;
                        router.push(`/fuites/${n.fuite_id}`);
                      }}>
                      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", nonLue ? "bg-blue-600" : "bg-transparent")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm leading-snug", nonLue ? "font-medium text-foreground" : "font-normal")}>
                          {nonLue && <span className="sr-only">Non lue : </span>}{n.titre}
                        </span>
                        {n.corps && <span className="mt-0.5 block truncate text-xs">{n.corps}</span>}
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">
                          {ilYA(n.cree_le)}{plusieursMarches && codeMarche(n.marche_id) ? ` · ${codeMarche(n.marche_id)}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {liste && liste.length > 0 && (
          <div className="border-t p-1">
            <Button variant="ghost" size="sm" className="w-full" onClick={() => {
              setOuverte(false);
              ouverteRef.current = false;
              router.push("/notifications");
            }}>
              Tout voir{liste.length >= LIMITE ? ` (au-delà des ${LIMITE} dernières)` : ""}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { dateHeure, messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { ilYA, type Notification } from "../_coque/cloche";
import { formatMaroc } from "@/lib/heure-maroc";

// N1, « Tout voir » de la cloche : toutes les notifications du compte, par pages de 50, les plus récentes d'abord.
// Comme la cloche : ce qui n'était pas lu reste en bleu sur cette page, puis tout est marqué lu.
const PAGE = 50;
const COLONNES = "id, marche_id, evenement, fuite_id, titre, corps, cree_le, lue_le";

const jour = (iso: string) => formatMaroc(iso, "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function Notifications() {
  const { marches } = useSession();
  const [liste, setListe] = useState<Notification[] | null>(null);
  const [fin, setFin] = useState(false);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const derniere = useRef(0);

  const lire = useCallback(async (de: number) => {
    const demande = ++derniere.current;
    setChargement(true);
    setErreur("");
    const sb = getSupabase();
    const { data, error } = await sb.from("notifications").select(COLONNES)
      .order("cree_le", { ascending: false }).order("id", { ascending: false }).range(de, de + PAGE - 1);
    if (demande !== derniere.current) return;
    setChargement(false);
    if (error) {
      setErreur(messageErreur(error));
      return;
    }
    const lignes = (data as Notification[] | null) ?? [];
    setListe((l) => (de === 0 ? lignes : [...(l ?? []), ...lignes.filter((n) => !l?.some((x) => x.id === n.id))]));
    setFin(lignes.length < PAGE);
    if (de === 0 && lignes.some((n) => !n.lue_le)) await sb.rpc("marquer_notifications_lues");
  }, []);

  useEffect(() => {
    lire(0);
  }, [lire]);

  const codeMarche = (id: string) => marches.find((m) => m.id === id)?.code ?? "";
  const plusieursMarches = new Set((liste ?? []).map((n) => n.marche_id)).size > 1;
  const nonLues = (liste ?? []).filter((n) => !n.lue_le).length;

  // Regroupement par jour (heure du Maroc), dans l'ordre de la liste.
  const jours: { jour: string; lignes: Notification[] }[] = [];
  for (const n of liste ?? []) {
    const j = jour(n.cree_le);
    if (jours.at(-1)?.jour !== j) jours.push({ jour: j, lignes: [] });
    jours.at(-1)!.lignes.push(n);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <EnTetePage titre="Notifications"
        description={liste
          ? `${liste.length.toLocaleString("fr-FR")} notification${liste.length > 1 ? "s" : ""} affichée${liste.length > 1 ? "s" : ""}${fin ? "" : " (les plus récentes)"}${nonLues ? `, dont ${nonLues} non lue${nonLues > 1 ? "s" : ""} à l'ouverture` : ""}.`
          : "Toutes vos notifications, les plus récentes d'abord."}
        actions={
          <Button variant="outline" size="icon" onClick={() => lire(0)} disabled={chargement} aria-label="Actualiser">
            <RefreshCw className={chargement ? "animate-spin" : undefined} />
          </Button>
        } />

      {erreur && (
        <Alert variant="destructive">
          <AlertTitle>Lecture impossible</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      {!liste ? (
        !erreur && <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>
      ) : liste.length === 0 ? (
        <Vide>Aucune notification.</Vide>
      ) : (
        <div className="flex flex-col gap-4">
          {jours.map((g) => (
            <section key={g.jour} className="flex flex-col gap-1.5">
              <h2 className="px-1 font-medium text-muted-foreground text-sm first-letter:uppercase">{g.jour}</h2>
              <ul className="divide-y overflow-hidden rounded-xl border bg-background">
                {g.lignes.map((n) => {
                  const nonLue = !n.lue_le;
                  const contenu = (
                    <>
                      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", nonLue ? "bg-blue-600" : "bg-transparent")} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm leading-snug", nonLue ? "font-medium text-foreground" : "font-normal")}>
                          {nonLue && <span className="sr-only">Non lue : </span>}{n.titre}
                        </span>
                        {n.corps && <span className="mt-0.5 block truncate text-muted-foreground text-xs">{n.corps}</span>}
                      </span>
                      <span className="shrink-0 text-right text-muted-foreground text-xs" title={dateHeure(n.cree_le)}>
                        {ilYA(n.cree_le)}
                        {plusieursMarches && codeMarche(n.marche_id) && <span className="block">{codeMarche(n.marche_id)}</span>}
                      </span>
                    </>
                  );
                  const classe = cn("flex w-full items-start gap-3 px-4 py-3 text-left", !nonLue && "text-muted-foreground");
                  return (
                    <li key={n.id}>
                      {n.fuite_id ? (
                        <Link href={`/fuites/${n.fuite_id}`} prefetch={false} className={cn(classe, "transition-colors hover:bg-muted/60")}>{contenu}</Link>
                      ) : (
                        <div className={classe}>{contenu}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {!fin && (
            <Button variant="outline" className="self-center" onClick={() => lire(liste.length)} disabled={chargement}>
              {chargement ? <Spinner /> : <ChevronDown data-icon="inline-start" />}Voir les plus anciennes
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

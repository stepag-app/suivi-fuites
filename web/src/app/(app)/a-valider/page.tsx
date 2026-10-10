"use client";

// Écran « À valider » (V1) : étapes en attente du marché (détection, réparations, réfections), avec leurs photos
// et l'essentiel, cases à cocher, « Valider (n) ». Lecture : v_a_valider (seulement les étapes que le compte peut
// valider) ; validation : valider_etapes. Avertissement « aucune photo » avant de valider (V4).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, CheckCheck, CircleAlert, Clock3, RefreshCw, TriangleAlert } from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { BadgeStatut } from "@/components/statut";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dateHeure, libellesMarche, messageErreur } from "@/lib/format";
import { urlsPhotos } from "@/lib/photo";
import { LIBELLE_ETAPE, type Etape } from "@/lib/saisie/regles";
import { useSession } from "@/lib/session";
import { getSupabase, lireTout } from "@/lib/supabase";
import type { StatutFuite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { cleEtapePhoto } from "../fuites/[id]/photos";
import { RappelDebitsAValider } from "../debits/RappelAValider";
import { DialogueSansPhoto, validerEtapes, type ElementAValider } from "../fuites/[id]/validation";

interface LigneAValider {
  etape: Etape;
  id: string;
  marche_id: string;
  fuite_id: string;
  fuite_numero: number;
  reference_srm: string | null;
  adresse: string | null;
  statut: StatutFuite;
  resultat: string | null;
  date_etape: string;
  auteur: string | null;
  cree_le: string;
  saisie_differee: boolean;
  fuite_validee_le: string | null;
  nb_photos: number;
}

const RESULTATS: Record<string, string> = {
  reparee: "Réparée", en_cours: "En cours", non_reparee: "Non réparée", faite: "Réfection faite", non_faite: "Clôturée sans réfection",
};
const COULEUR_ETAPE: Record<Etape, string> = {
  detection: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
  reparation: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  refection: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
};

const cle = (l: Pick<LigneAValider, "etape" | "id">) => `${l.etape}:${l.id}`;
const clePhotos = (l: LigneAValider) => `${l.fuite_id}|${l.etape === "detection" ? "detection" : `${l.etape}:${l.id}`}`;

export default function AValider() {
  const { marche, peut } = useSession();
  const libelles = libellesMarche(marche);
  const [lignes, setLignes] = useState<LigneAValider[]>([]);
  const [vignettes, setVignettes] = useState<Map<string, { id: string; url: string }[]>>(new Map());
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [filtre, setFiltre] = useState<"toutes" | Etape>("toutes");
  const [chargement, setChargement] = useState(true);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [dialogue, setDialogue] = useState<ElementAValider[] | null>(null);
  const marcheId = marche?.id;
  const autorise = peut("fuites", "valider") || peut("interventions", "valider") || peut("refections", "valider");

  const charger = useCallback(async () => {
    if (!marcheId) return;
    setChargement(true);
    setErreur("");
    try {
      const l = await lireTout<LigneAValider>((de, a) => getSupabase().from("v_a_valider").select("*").eq("marche_id", marcheId)
        .order("date_etape").order("id").range(de, a));
      setLignes(l);
      setCoches((c) => new Set([...c].filter((k) => l.some((x) => cle(x) === k))));
      // Trois vignettes par étape, au plus
      const fuites = [...new Set(l.filter((x) => x.nb_photos > 0).map((x) => x.fuite_id))];
      const parEtape = new Map<string, { id: string; chemin: string; stockage: string | null }[]>();
      for (let i = 0; i < fuites.length; i += 200) {
        const { data, error } = await getSupabase().from("photos").select("id, fuite_id, reparation_id, refection_id, chemin, stockage")
          .in("fuite_id", fuites.slice(i, i + 200)).is("supprime_le", null).order("prise_le");
        if (error) throw error;
        ((data as { id: string; fuite_id: string; reparation_id: string | null; refection_id: string | null; chemin: string; stockage: string | null }[] | null) ?? [])
          .forEach((p) => {
            const k = `${p.fuite_id}|${cleEtapePhoto(p)}`;
            const liste = parEtape.get(k) ?? [];
            if (liste.length < 3) parEtape.set(k, [...liste, p]);
          });
      }
      const urls = await urlsPhotos([...parEtape.values()].flat()).catch(() => new Map<string, string>());
      setVignettes(new Map([...parEtape].map(([k, ps]) => [k, ps.filter((p) => urls.has(p.id)).map((p) => ({ id: p.id, url: urls.get(p.id)! }))])));
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setChargement(false);
    }
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const compte = (e: "toutes" | Etape) => (e === "toutes" ? lignes.length : lignes.filter((l) => l.etape === e).length);
  const visibles = useMemo(() => (filtre === "toutes" ? lignes : lignes.filter((l) => l.etape === filtre)), [lignes, filtre]);
  const selection = lignes.filter((l) => coches.has(cle(l)));
  const tousCoches = visibles.length > 0 && visibles.every((l) => coches.has(cle(l)));

  const element = (l: LigneAValider): ElementAValider => ({
    etape: l.etape, id: l.id, nbPhotos: l.nb_photos,
    libelle: `${LIBELLE_ETAPE[l.etape]} de la fuite N° ${l.fuite_numero}${l.etape !== "detection" ? ` (${dateHeure(l.date_etape)})` : ""}`,
  });

  function demander(elements: ElementAValider[]) {
    const sansPhoto = elements.filter((e) => e.nbPhotos === 0);
    if (sansPhoto.length) setDialogue(elements);
    else void valider(elements);
  }

  async function valider(elements: ElementAValider[]) {
    setOccupe(true);
    setErreur("");
    setMessage("");
    try {
      const n = await validerEtapes(elements);
      const ignorees = elements.length - n;
      setMessage(`${n} étape${n > 1 ? "s" : ""} validée${n > 1 ? "s" : ""}${ignorees ? ` (${ignorees} déjà validée${ignorees > 1 ? "s" : ""} entre-temps)` : ""}.`);
      setCoches((c) => new Set([...c].filter((k) => !elements.some((e) => cle(e) === k))));
      setDialogue(null);
      await charger();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  if (!autorise) return <Vide>La validation est réservée au responsable et à l&apos;administrateur.</Vide>;

  return (
    <div className="flex flex-col gap-4">
      <EnTetePage
        titre="À valider"
        description={`${marche?.code ?? ""} · détections, réparations et réfections saisies, en attente de votre validation. Une étape validée ne se modifie plus que par le responsable.`}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={charger} disabled={chargement}><RefreshCw data-icon="inline-start" />Actualiser</Button>
            <Button size="sm" disabled={!selection.length || occupe} onClick={() => demander(selection.map(element))}>
              {occupe ? <Spinner /> : <CheckCheck data-icon="inline-start" />}Valider ({selection.length})
            </Button>
          </>
        )}
      />

      {message && <Alert role="status"><CheckCheck /><AlertDescription>{message}</AlertDescription></Alert>}
      {erreur && <Alert variant="destructive"><CircleAlert /><AlertDescription>{erreur}</AlertDescription></Alert>}
      {marcheId && peut("mesures_debit", "valider") && <RappelDebitsAValider marcheId={marcheId} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filtre} onValueChange={(v) => setFiltre(v as typeof filtre)}>
          <TabsList>
            {(["toutes", "detection", "reparation", "refection"] as const).map((e) => (
              <TabsTrigger key={e} value={e}>
                {e === "toutes" ? "Toutes" : `${LIBELLE_ETAPE[e]}s`}
                <span className="ml-1 rounded-sm bg-muted px-1.5 text-muted-foreground text-xs tabular-nums">{compte(e)}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {visibles.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={tousCoches} onCheckedChange={(v) => setCoches((c) => {
              const n = new Set(c);
              visibles.forEach((l) => (v === true ? n.add(cle(l)) : n.delete(cle(l))));
              return n;
            })} />
            Tout cocher ({visibles.length})
          </label>
        )}
      </div>

      {chargement && !lignes.length ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>
      ) : visibles.length === 0 ? (
        <Vide>Rien à valider{filtre !== "toutes" ? " pour cette étape" : ""}.</Vide>
      ) : (
        <div className="flex flex-col gap-2">
          {visibles.map((l) => {
            const k = cle(l);
            const photos = vignettes.get(clePhotos(l)) ?? [];
            return (
              <Card key={k} size="sm" className={cn(coches.has(k) && "ring-2 ring-primary/40")}>
                <CardContent className="grid items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_minmax(0,1fr)_16rem_11rem_auto]">
                  <Checkbox aria-label={`Cocher ${element(l).libelle}`} checked={coches.has(k)} onCheckedChange={(v) => setCoches((c) => {
                    const n = new Set(c);
                    if (v === true) n.add(k); else n.delete(k);
                    return n;
                  })} />
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn("rounded-sm", COULEUR_ETAPE[l.etape])}>{LIBELLE_ETAPE[l.etape]}</Badge>
                      <Link href={`/fuites/${l.fuite_id}`} prefetch={false} className="font-medium underline-offset-4 hover:underline">Fuite N° {l.fuite_numero}</Link>
                      <BadgeStatut statut={l.statut} court />
                      {l.resultat && <span className="text-sm">{RESULTATS[l.resultat] ?? l.resultat}</span>}
                      {l.saisie_differee && l.etape === "detection" && (
                        <Badge variant="outline" className="rounded-sm border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300"><Clock3 data-icon="inline-start" />Saisie différée</Badge>
                      )}
                      {l.etape !== "detection" && !l.fuite_validee_le && <span className="text-muted-foreground text-xs">détection non validée</span>}
                    </div>
                    <p className="truncate text-muted-foreground text-sm">
                      {[l.reference_srm && `Réf. ${libelles.sigle} ${l.reference_srm}`, l.adresse].filter(Boolean).join(" · ") || "Sans référence ni adresse"}
                    </p>
                  </div>
                  <div className="flex flex-col text-sm sm:col-start-2 lg:col-start-auto">
                    <span className="tabular-nums">{dateHeure(l.date_etape)}</span>
                    <span className="text-muted-foreground text-xs">{l.auteur ? `par ${l.auteur}` : "auteur inconnu"} · saisie le {dateHeure(l.cree_le)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 sm:col-start-2 lg:col-start-auto">
                    {l.nb_photos === 0 ? (
                      <span className="flex items-center gap-1 text-amber-700 text-xs dark:text-amber-300"><TriangleAlert className="size-3.5" />Aucune photo</span>
                    ) : photos.length ? photos.map((p) => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block size-12 overflow-hidden rounded-md border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="" loading="lazy" className="size-full object-cover" />
                      </a>
                    )) : <span className="flex items-center gap-1 text-muted-foreground text-xs"><Camera className="size-3.5" />{l.nb_photos}</span>}
                    {l.nb_photos > photos.length && photos.length > 0 && <span className="text-muted-foreground text-xs">+{l.nb_photos - photos.length}</span>}
                  </div>
                  <Button size="sm" variant="outline" disabled={occupe} className="sm:col-start-3 sm:row-start-1 lg:col-start-auto lg:row-start-auto"
                    onClick={() => demander([element(l)])}>
                    Valider
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DialogueSansPhoto
        sansPhoto={(dialogue ?? []).filter((e) => e.nbPhotos === 0)}
        ouvert={!!dialogue}
        occupe={occupe}
        onFermer={() => setDialogue(null)}
        onValider={() => dialogue && valider(dialogue)}
        onAjouterPhoto={(e) => {
          const l = lignes.find((x) => x.etape === e.etape && x.id === e.id);
          if (l) window.location.assign(`/fuites/${l.fuite_id}?photo=${encodeURIComponent(e.etape === "detection" ? "detection" : `${e.etape}:${e.id}`)}`);
        }}
      />
    </div>
  );
}

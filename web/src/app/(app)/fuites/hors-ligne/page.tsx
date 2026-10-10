"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, CloudOff, Search, Trash2 } from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { PointStatut, STATUT_STYLE } from "@/components/statut";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { dateHeure } from "@/lib/format";
import { listerFichesGardees, oublierFiche } from "@/lib/hors-ligne";
import { useSession } from "@/lib/session";
import { LIMITES_HORS_LIGNE } from "../[id]/fiche-hors-ligne";
import { fichesDisponibles, type CopieGardee } from "./fiches-gardees";

// Lot M : fiches déjà ouvertes avec du réseau sur cet appareil, consultables sans réseau (lecture seule).
// La page elle-même est gardée par le service worker avec la coquille des fiches (public/sw.js).
export default function FichesHorsLigne() {
  const { session, marches } = useSession();
  const moi = session?.user.id;
  const [copies, setCopies] = useState<CopieGardee[] | null>(null);
  const [texte, setTexte] = useState("");
  const [enLigne, setEnLigne] = useState(true);

  const charger = useCallback(async () => setCopies(await listerFichesGardees<CopieGardee>()), []);

  useEffect(() => {
    charger();
    setEnLigne(navigator.onLine);
    const maj = () => setEnLigne(navigator.onLine);
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, [charger]);

  const toutes = useMemo(() => (copies && moi ? fichesDisponibles(copies, moi) : null), [copies, moi]);
  const liste = useMemo(() => (copies && moi ? fichesDisponibles(copies, moi, texte) : null), [copies, moi, texte]);
  const plusieursMarches = new Set((toutes ?? []).map((f) => f.marche_id)).size > 1;
  const codeMarche = (id: string) => marches.find((m) => m.id === id)?.code ?? "";
  const photos = (toutes ?? []).reduce((s, f) => s + f.nb_photos, 0);

  async function retirer(id: string) {
    await oublierFiche(id);
    charger();
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <EnTetePage titre="Fiches disponibles hors ligne"
        description={`Fiches déjà ouvertes avec du réseau sur cet appareil : elles s'ouvrent sans réseau, en lecture seule, dans leur dernière version vue. Les ${LIMITES_HORS_LIGNE.fiches} dernières ouvertes sont gardées.`} />

      {!enLigne && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <CloudOff className="size-4 shrink-0" />Hors ligne : seules les fiches ci-dessous peuvent s&apos;ouvrir.
        </p>
      )}

      {!liste || !toutes ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Lecture de l&apos;appareil…</p>
      ) : toutes.length === 0 ? (
        <Vide>Aucune fiche gardée sur cet appareil : ouvrez une fiche avec du réseau pour la retrouver ici.</Vide>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <InputGroup className="h-8 w-full sm:w-72">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput className="h-8" placeholder="N°, référence ou adresse" value={texte} aria-label="Rechercher"
                onChange={(e) => setTexte(e.target.value)} />
            </InputGroup>
            <span className="text-muted-foreground text-sm">
              {toutes.length} fiche{toutes.length > 1 ? "s" : ""}, {photos} photo{photos > 1 ? "s" : ""}
            </span>
          </div>
          {liste.length === 0 ? <Vide>Aucune fiche gardée ne correspond à la recherche.</Vide> : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-background">
              {liste.map((f) => (
                <li key={f.id} className="flex items-center gap-2 pr-2">
                  <Link href={`/fuites/${f.id}`} prefetch={false} className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
                    <PointStatut statut={f.statut} className="mt-1.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-sm">
                        N° {f.numero}
                        <span className="ml-2 font-normal text-muted-foreground">{STATUT_STYLE[f.statut].libelle}</span>
                        {plusieursMarches && codeMarche(f.marche_id) && <span className="ml-2 font-normal text-muted-foreground text-xs">{codeMarche(f.marche_id)}</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-muted-foreground text-xs">
                        {[f.adresse, f.secteur, f.reference_srm].filter(Boolean).join(" · ") || "Sans adresse"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-muted-foreground text-xs">
                      version du {dateHeure(f.version_le)}
                      <span className="mt-0.5 flex items-center justify-end gap-1"><Camera className="size-3" />{f.nb_photos}</span>
                    </span>
                  </Link>
                  <Button variant="ghost" size="icon" aria-label={`Retirer la fiche N° ${f.numero} de l'appareil`} onClick={() => retirer(f.id)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

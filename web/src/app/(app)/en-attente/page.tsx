"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, CloudUpload, Trash2 } from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { dateHeure } from "@/lib/format";
import { abandonnerFuite, ecouterAttente, listerAttente, synchroniser, type FuiteEnAttente, type PhotoEnAttente } from "@/lib/hors-ligne";

export default function EnAttente() {
  const [fuites, setFuites] = useState<FuiteEnAttente[]>([]);
  const [photos, setPhotos] = useState<PhotoEnAttente[]>([]);
  const [message, setMessage] = useState("");
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    const r = await listerAttente();
    setFuites(r.fuites);
    setPhotos(r.photos);
  }, []);

  useEffect(() => {
    charger();
    return ecouterAttente(charger);
  }, [charger]);

  async function envoyer() {
    setOccupe(true);
    setMessage("");
    try {
      const r = await synchroniser();
      setMessage(r.restantes === 0 ? "Tout est envoyé." : navigator.onLine
        ? `${r.restantes} envoi(s) restent à traiter (voir les erreurs ci-dessous).` : "Pas de réseau : réessayez plus tard.");
    } catch (e) {
      setMessage(String((e as Error).message ?? e));
    }
    setOccupe(false);
    charger();
  }

  async function abandonner(f: FuiteEnAttente) {
    if (!window.confirm("Supprimer définitivement cette fuite et ses photos de la tablette ? Elle ne sera jamais envoyée.")) return;
    await abandonnerFuite(f.id);
  }

  const vide = fuites.length === 0 && photos.length === 0;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <EnTetePage titre="Envois en attente"
        description="Fuites saisies sur cette tablette et pas encore reçues par le serveur. Elles partent toutes seules dès que le réseau revient ; ne désinstallez pas l'application avant."
        actions={<Button onClick={envoyer} disabled={occupe || vide}>{occupe ? <Spinner /> : <CloudUpload data-icon="inline-start" />}{occupe ? "Envoi en cours…" : "Envoyer maintenant"}</Button>} />
      {message && <Alert role="status"><AlertTitle>Synchronisation</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
      {vide ? <Vide>Rien en attente.</Vide> : (
        <ItemGroup>
          {fuites.map((f) => {
            const mesPhotos = photos.filter((p) => p.fuite_id === f.id).length;
            return (
              <Item key={f.id} variant="outline">
                <ItemMedia>
                  <div className="grid size-9 place-items-center rounded-md border bg-background"><CloudUpload className="size-4 text-muted-foreground" /></div>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{(f.ligne.reference_srm as string | null) || (f.ligne.adresse as string | null) || "Fuite sans référence"}</ItemTitle>
                  <ItemDescription>
                    Saisie le {dateHeure(f.creee_le)} · <Camera className="inline size-3" /> {mesPhotos} photo{mesPhotos > 1 ? "s" : ""} en attente
                  </ItemDescription>
                  {f.erreur && <Badge variant="destructive" className="mt-1 h-auto whitespace-normal">Refusée par le serveur : {f.erreur}</Badge>}
                </ItemContent>
                <ItemActions>
                  <Button variant="destructive" size="sm" onClick={() => abandonner(f)}><Trash2 data-icon="inline-start" />Supprimer</Button>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CircleAlert, Crosshair, LocateFixed, Save, TriangleAlert, X } from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { BadgeStatut } from "@/components/statut";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { OUVRAGES, dateHeure, formaterReference, libellesMarche, messageErreur, motifMasque } from "@/lib/format";
import { lireCache, mettreEnCache, mettreFuiteEnAttente, synchroniser, type PhotoEnAttente } from "@/lib/hors-ligne";
import { preparerPhoto } from "@/lib/photo";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import type { Secteur, StatutFuite } from "@/lib/types";

interface Position { latitude: number; longitude: number; precision: number }
interface Proche {
  id: string; numero: number; reference_srm: string | null; statut: StatutFuite;
  date_detection: string; distance_m: number | null; meme_reference: boolean;
}

export default function NouvelleFuite() {
  const { marche, peut } = useSession();
  const libelles = libellesMarche(marche);
  const router = useRouter();
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [secteurId, setSecteurId] = useState("");
  const [reference, setReference] = useState("");
  const [visibilite, setVisibilite] = useState<"" | "visible" | "invisible">("");
  const [ouvrage, setOuvrage] = useState("");
  const [adresse, setAdresse] = useState("");
  const [observation, setObservation] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [gpsMessage, setGpsMessage] = useState("Recherche de la position…");
  const [photos, setPhotos] = useState<File[]>([]);
  const [proches, setProches] = useState<Proche[]>([]);
  const [lierA, setLierA] = useState("");
  const [envoi, setEnvoi] = useState("");
  const [erreur, setErreur] = useState("");
  const selecteurPhoto = useRef<HTMLInputElement>(null);

  const marcheId = marche?.id;

  useEffect(() => {
    if (!marcheId) return;
    getSupabase().from("secteurs").select("id, zone_id, code, libelle").eq("marche_id", marcheId).eq("actif", true).order("libelle")
      .then(async ({ data, error }) => {
        const cle = `secteurs:${marcheId}`;
        if (!error && data) {
          setSecteurs(data as Secteur[]);
          mettreEnCache(cle, data);
        } else {
          setSecteurs((await lireCache<Secteur[]>(cle)) ?? []);
        }
      });
  }, [marcheId]);

  const localiser = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsMessage("Position indisponible sur cet appareil.");
      return;
    }
    setGpsMessage("Recherche de la position…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ latitude: p.coords.latitude, longitude: p.coords.longitude, precision: p.coords.accuracy });
        setGpsMessage("");
      },
      (e) => setGpsMessage(e.code === e.PERMISSION_DENIED
        ? "Position refusée : autorisez la localisation pour ce site dans le navigateur."
        : "Position introuvable. Sortez à l'air libre et réessayez."),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }, []);

  useEffect(() => {
    localiser();
  }, [localiser]);

  useEffect(() => {
    if (!marcheId || (!position && !reference.trim())) {
      setProches([]);
      return;
    }
    const delai = setTimeout(async () => {
      const { data } = await getSupabase().rpc("rechercher_fuites_proches", {
        p_marche: marcheId, p_latitude: position?.latitude ?? null, p_longitude: position?.longitude ?? null, p_reference: reference.trim() || null,
      });
      setProches((data as Proche[] | null) ?? []);
    }, 500);
    return () => clearTimeout(delai);
  }, [marcheId, position, reference]);

  function ajouterPhotos(fichiers: FileList | null) {
    const nouvelles = fichiers ? Array.from(fichiers) : [];
    if (nouvelles.length) setPhotos((p) => [...p, ...nouvelles]);
    if (selecteurPhoto.current) selecteurPhoto.current.value = "";
  }

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!marcheId) return;
    setErreur("");
    if (!position && !reference.trim() && !adresse.trim()) {
      setErreur(`Indiquez au moins la position GPS, la ${libelles.reference.toLowerCase()} ou l'adresse.`);
      return;
    }
    if (photos.length === 0 && !window.confirm("Aucune photo n'est jointe. Enregistrer quand même ?")) return;

    const id = crypto.randomUUID();
    try {
      setEnvoi("Préparation des photos…");
      const pos = position ? `SRID=4326;POINT(${position.longitude} ${position.latitude})` : null;
      const secteur = secteurs.find((s) => s.id === secteurId);
      const preparees: PhotoEnAttente[] = [];
      for (const fichier of photos) {
        const prete = await preparerPhoto(fichier);
        preparees.push({
          id: crypto.randomUUID(), fuite_id: id, marche_id: marcheId, blob: prete.blob,
          largeur: prete.largeur, hauteur: prete.hauteur, position: pos, prise_le: new Date().toISOString(),
        });
      }
      await mettreFuiteEnAttente(
        {
          id, marche_id: marcheId,
          ligne: {
            reference_srm: reference.trim() || null, secteur_id: secteur?.id ?? null, zone_id: secteur?.zone_id ?? null,
            visibilite: visibilite || null, ouvrage: ouvrage || null, adresse: adresse.trim() || null, observation: observation.trim() || null,
            position: pos, precision_gps_m: position ? Math.round(position.precision) : null, fuite_liee_id: lierA || null, source_saisie: "tablette",
          },
        },
        preparees,
      );
      setEnvoi(navigator.onLine ? "Envoi…" : "Enregistrement sur la tablette…");
      const { restantes } = await synchroniser();
      router.replace(restantes === 0 ? `/fuites/${id}` : "/en-attente");
    } catch (err) {
      setErreur(messageErreur(err));
      setEnvoi("");
    }
  }

  if (!peut("fuites", "creer")) return <Vide>Votre compte ne peut pas signaler de fuite.</Vide>;

  return (
    <form onSubmit={enregistrer} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <EnTetePage titre="Nouvelle fuite" description={`${marche?.code ?? ""} · position GPS, référence, secteur et photos. Sans réseau, la fuite est gardée sur la tablette puis envoyée.`} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Crosshair className="size-4 text-muted-foreground" />Position</CardTitle>
          <CardDescription>Relevée automatiquement par le GPS de l&apos;appareil.</CardDescription>
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={localiser}><LocateFixed data-icon="inline-start" />Actualiser</Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {position ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm tabular-nums">{position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}</span>
              <Badge variant="outline" className={position.precision > 30 ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300"}>
                ± {Math.round(position.precision)} m
              </Badge>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">{gpsMessage.startsWith("Recherche") && <Spinner />}{gpsMessage}</p>
          )}
        </CardContent>
      </Card>

      {proches.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
          <TriangleAlert />
          <AlertTitle>Fuite déjà signalée ici ?</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 text-amber-900/90 dark:text-amber-50/90">
            <ul className="flex flex-col gap-1.5">
              {proches.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/fuites/${p.id}`} className="font-medium underline-offset-4 hover:underline" target="_blank">N° {p.numero}</Link>
                  <BadgeStatut statut={p.statut} court />
                  <span>{dateHeure(p.date_detection)}{p.meme_reference ? " · même référence" : ""}{p.distance_m != null ? ` · à ${Math.round(p.distance_m)} m` : ""}</span>
                </li>
              ))}
            </ul>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="lier">Si c&apos;est la même fuite (re-détection), la lier à</FieldLabel>
              <NativeSelect id="lier" value={lierA} onChange={(e) => setLierA(e.target.value)} className="w-full bg-background">
                <NativeSelectOption value="">Nouvelle fuite (ne pas lier)</NativeSelectOption>
                {proches.map((p) => <NativeSelectOption key={p.id} value={p.id}>N° {p.numero}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identification</CardTitle>
          <CardDescription>Référence du client, secteur et repères sur place.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="reference">{libelles.reference}</FieldLabel>
                {libelles.masque ? (
                  <Input id="reference" value={reference} onChange={(e) => setReference(formaterReference(e.target.value, libelles.masque))}
                    placeholder={libelles.masque.replace(/9/g, "0")} inputMode="numeric" maxLength={libelles.masque.length} pattern={motifMasque(libelles.masque)}
                    title={`Format ${libelles.masque.replace(/9/g, "0")} : tapez les chiffres, les séparateurs se placent seuls`} />
                ) : (
                  <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
                )}
                {libelles.masque && <FieldDescription>Format {libelles.masque.replace(/9/g, "0")} : les séparateurs se placent seuls.</FieldDescription>}
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="secteur">Secteur</FieldLabel>
                <NativeSelect id="secteur" value={secteurId} onChange={(e) => setSecteurId(e.target.value)} className="w-full">
                  <NativeSelectOption value="">— Choisir —</NativeSelectOption>
                  {secteurs.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.libelle}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            </div>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="adresse">Adresse / repère</FieldLabel>
              <Input id="adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Rue, numéro, repère visible" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-1.5">
                <FieldLabel htmlFor="visibilite">Visibilité</FieldLabel>
                <NativeSelect id="visibilite" value={visibilite} onChange={(e) => setVisibilite(e.target.value as typeof visibilite)} className="w-full">
                  <NativeSelectOption value="">—</NativeSelectOption>
                  <NativeSelectOption value="visible">Visible</NativeSelectOption>
                  <NativeSelectOption value="invisible">Invisible</NativeSelectOption>
                </NativeSelect>
              </Field>
              <Field className="gap-1.5">
                <FieldLabel htmlFor="ouvrage">Ouvrage</FieldLabel>
                <NativeSelect id="ouvrage" value={ouvrage} onChange={(e) => setOuvrage(e.target.value)} className="w-full">
                  <NativeSelectOption value="">—</NativeSelectOption>
                  {Object.entries(OUVRAGES).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            </div>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="observation">Observation</FieldLabel>
              <Textarea id="observation" value={observation} onChange={(e) => setObservation(e.target.value)} rows={2} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {peut("photos", "creer") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Camera className="size-4 text-muted-foreground" />Photos</CardTitle>
            <CardDescription>{photos.length} photo{photos.length > 1 ? "s" : ""} jointe{photos.length > 1 ? "s" : ""}. Réduites à 1 600 px avant l&apos;envoi.</CardDescription>
            <CardAction>
              <input ref={selecteurPhoto} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => ajouterPhotos(e.target.files)} />
              <Button type="button" variant="outline" size="sm" onClick={() => selecteurPhoto.current?.click()}><Camera data-icon="inline-start" />Prendre une photo</Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <button type="button" onClick={() => selecteurPhoto.current?.click()}
                className="flex h-28 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground text-sm hover:bg-muted/50">
                <Camera className="size-6" />Prendre une photo de la fuite
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {photos.map((f, i) => (
                  <div key={i} className="group/photo relative aspect-[4/3] overflow-hidden rounded-lg border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(f)} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                    <Button type="button" variant="secondary" size="icon-xs" className="absolute top-1.5 right-1.5" aria-label="Retirer la photo"
                      onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                      <X />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {erreur && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Impossible d&apos;enregistrer</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" asChild><Link href="/fuites" prefetch={false}>Annuler</Link></Button>
        <Button type="submit" size="lg" disabled={!!envoi}>
          {envoi ? <Spinner /> : <Save data-icon="inline-start" />}{envoi || "Enregistrer la fuite"}
        </Button>
      </div>
    </form>
  );
}

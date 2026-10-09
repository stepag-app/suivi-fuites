"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LineString } from "geojson";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CircleAlert, Crosshair, Lightbulb, LocateFixed, Save, TriangleAlert, X } from "lucide-react";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { MiniCarte } from "@/components/mini-carte";
import { BadgeStatut } from "@/components/statut";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { MATERIAUX, OUVRAGES, dateHeure, formaterReference, libellesMarche, messageErreur, motifMasque } from "@/lib/format";
import { lireCache, mettreEnCache, mettreFuiteEnAttente, synchroniser, type PhotoEnAttente } from "@/lib/hors-ligne";
import { preparerPhoto } from "@/lib/photo";
import { lireReferentielsSaisie, type ReferentielsSaisie } from "@/lib/saisie/referentiels";
import {
  champsExiges, champsManquants, dansLeFutur, depuisChampDate, diametresPour, libelleChampFuite, lireNombre, pointWkt,
  minusculeInitiale, saisieDifferee, sigleDiametre, versChampDate, type ChampFuite,
} from "@/lib/saisie/regles";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import type { Secteur, StatutFuite } from "@/lib/types";

interface Position { latitude: number; longitude: number; precision: number | null }
interface Proche {
  id: string; numero: number; reference_srm: string | null; statut: StatutFuite;
  date_detection: string; distance_m: number | null; meme_reference: boolean;
}
/** Réponse de suggestions_localisation (contrat S2 § 3). */
interface Suggestions {
  precision_insuffisante: boolean;
  rayon_m: number | null;
  rues: { nom: string; nom_ar: string | null; distance_m: number }[];
  secteur: { id: string; code: string; libelle: string; source: "contour" | "troncon" } | null;
  troncon: { id: string; reference: string; diametre_mm: number | null; materiau: string | null; materiau_plan: string | null; distance_m: number; geojson: LineString } | null;
}

const VIDE: ReferentielsSaisie = { natures: [], motifs: [], diametres: [], representants: [], agents: [], champsObligatoires: [] };

export default function NouvelleFuite() {
  const { marche, peut, session } = useSession();
  const libelles = libellesMarche(marche);
  const router = useRouter();
  const responsable = peut("fuites", "valider");
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [ref, setRef] = useState<ReferentielsSaisie>(VIDE);
  const [secteurId, setSecteurId] = useState("");
  const [reference, setReference] = useState("");
  const [visibilite, setVisibilite] = useState<"" | "visible" | "invisible">("");
  const [ouvrage, setOuvrage] = useState("");
  const [natureId, setNatureId] = useState("");
  const [materiau, setMateriau] = useState("");
  const [diametre, setDiametre] = useState("");
  const [tronconId, setTronconId] = useState<string | null>(null);
  const [adresse, setAdresse] = useState("");
  const [observation, setObservation] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [gpsMessage, setGpsMessage] = useState("Recherche de la position…");
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [proches, setProches] = useState<Proche[]>([]);
  const [lierA, setLierA] = useState("");
  // Saisie au bureau (responsable) : à la place d'un agent, date réelle, source, validation immédiate
  const [detecteePar, setDetecteePar] = useState("");
  const [dateDetection, setDateDetection] = useState("");
  const [source, setSource] = useState("tablette");
  const [validerAussi, setValiderAussi] = useState(false);
  const [envoi, setEnvoi] = useState("");
  const [erreur, setErreur] = useState("");
  // Après une première tentative, les champs exigés encore vides restent signalés (recalculés à chaque saisie).
  const [tente, setTente] = useState(false);
  const selecteurPhoto = useRef<HTMLInputElement>(null);

  const marcheId = marche?.id;
  const exiges = champsExiges(ref.champsObligatoires);
  const manquants = champsManquants({
    reference_srm: reference, secteur_id: secteurId, ouvrage, visibilite, nature_degradation_id: natureId, adresse,
    diametre_mm: diametre, materiau,
  }, exiges);
  const exige = (c: ChampFuite) => exiges.includes(c);
  const libelle = (c: ChampFuite, base: string) => `${base}${exige(c) ? " *" : ""}`;
  const invalide = (c: ChampFuite) => (tente && manquants.includes(c) ? true : undefined);

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
    // Listes de la saisie (natures, diamètres, agents, champs exigés) : gardées pour la saisie sans réseau.
    const cle = `saisie:${marcheId}`;
    lireReferentielsSaisie(marcheId).then(
      (r) => { setRef(r); mettreEnCache(cle, r); },
      async () => setRef((await lireCache<ReferentielsSaisie>(cle)) ?? VIDE),
    );
  }, [marcheId]);

  const localiser = useCallback(() => {
    if (!navigator.geolocation) {
      setGpsMessage("Position indisponible sur cet appareil : placez l'épingle sur la carte.");
      return;
    }
    setGpsMessage("Recherche de la position…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({ latitude: p.coords.latitude, longitude: p.coords.longitude, precision: p.coords.accuracy });
        setGpsMessage("");
      },
      (e) => setGpsMessage(e.code === e.PERMISSION_DENIED
        ? "Position refusée : autorisez la localisation pour ce site, ou placez l'épingle sur la carte."
        : "Position introuvable. Sortez à l'air libre et réessayez, ou placez l'épingle sur la carte."),
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

  // Suggestions (F3, F4) : rue, secteur, conduite du tronçon le plus proche, dans un rayon adapté à la précision.
  // Jamais pré-remplies ; sans réseau ou rien de trouvé : aucune suggestion.
  useEffect(() => {
    setSuggestions(null);
    if (!marcheId || !position) return;
    const delai = setTimeout(async () => {
      const { data, error } = await getSupabase().rpc("suggestions_localisation", {
        p_marche: marcheId, p_longitude: position.longitude, p_latitude: position.latitude, p_precision_m: position.precision,
      });
      if (!error && data) setSuggestions(data as Suggestions);
    }, 400);
    return () => clearTimeout(delai);
  }, [marcheId, position]);

  function ajouterPhotos(fichiers: FileList | null) {
    const nouvelles = fichiers ? Array.from(fichiers) : [];
    if (nouvelles.length) setPhotos((p) => [...p, ...nouvelles]);
    if (selecteurPhoto.current) selecteurPhoto.current.value = "";
  }

  function choisirMateriau(m: string) {
    setMateriau(m);
    const d = lireNombre(diametre);
    if (d != null && !diametresPour(ref.diametres, m).includes(d)) setDiametre("");
  }

  const diametres = diametresPour(ref.diametres, materiau);
  const quandDetection = dateDetection ? depuisChampDate(dateDetection) : null;
  const differee = !!quandDetection && saisieDifferee(quandDetection, new Date().toISOString(), source !== "tablette" || (!!detecteePar && detecteePar !== session?.user.id));

  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    if (!marcheId) return;
    setErreur("");
    setTente(true);
    if (manquants.length) {
      setErreur(`Champs obligatoires à remplir : ${manquants.map((c) => minusculeInitiale(libelleChampFuite(c, libelles.reference))).join(", ")}.`);
      return;
    }
    if (!position && !adresse.trim()) {
      setErreur("Indiquez la position (GPS ou épingle sur la carte) ou l'adresse.");
      return;
    }
    if (dateDetection && !quandDetection) {
      setErreur("Date et heure de détection invalides.");
      return;
    }
    if (photos.length === 0 && !window.confirm("Aucune photo n'est jointe. Enregistrer quand même ?")) return;

    const id = crypto.randomUUID();
    try {
      setEnvoi("Préparation des photos…");
      const pos = position ? pointWkt(position.longitude, position.latitude) : null;
      const secteur = secteurs.find((s) => s.id === secteurId);
      const preparees: PhotoEnAttente[] = [];
      for (const fichier of photos) {
        const prete = await preparerPhoto(fichier);
        preparees.push({
          id: crypto.randomUUID(), fuite_id: id, marche_id: marcheId, blob: prete.blob,
          largeur: prete.largeur, hauteur: prete.hauteur, position: pos, prise_le: new Date().toISOString(),
        });
      }
      const ligne: Record<string, unknown> = {
        reference_srm: reference.trim() || null, secteur_id: secteur?.id ?? null, zone_id: secteur?.zone_id ?? null,
        visibilite: visibilite || null, ouvrage: ouvrage || null, nature_degradation_id: natureId || null,
        materiau: materiau || null, diametre_mm: lireNombre(diametre), troncon_id: tronconId,
        adresse: adresse.trim() || null, observation: observation.trim() || null,
        position: pos, precision_gps_m: position?.precision != null ? Math.round(position.precision) : null,
        fuite_liee_id: lierA || null, source_saisie: responsable ? source : "tablette",
      };
      if (responsable) {
        if (detecteePar) ligne.auteur_terrain_id = detecteePar;
        if (quandDetection) ligne.date_detection = quandDetection;
        if (validerAussi) ligne.validee_le = new Date().toISOString();
      }
      await mettreFuiteEnAttente({ id, marche_id: marcheId, ligne }, preparees);
      setEnvoi(navigator.onLine ? "Envoi…" : "Enregistrement sur la tablette…");
      const { restantes } = await synchroniser();
      router.replace(restantes === 0 ? `/fuites/${id}` : "/en-attente");
    } catch (err) {
      setErreur(messageErreur(err));
      setEnvoi("");
    }
  }

  if (!peut("fuites", "creer")) return <Vide>Votre compte ne peut pas signaler de fuite.</Vide>;

  const s = suggestions;
  const rues = (s?.rues ?? []).filter((r) => r.nom && !adresse.toLowerCase().includes(r.nom.toLowerCase()));
  const secteurPropose = s?.secteur && s.secteur.id !== secteurId && secteurs.some((x) => x.id === s.secteur!.id) ? s.secteur : null;
  const t = s?.troncon;
  const conduiteProposee = t && (t.materiau || t.diametre_mm) && (t.materiau !== (materiau || null) || t.diametre_mm !== lireNombre(diametre)) ? t : null;
  const aDesSuggestions = rues.length > 0 || !!secteurPropose || !!conduiteProposee;

  return (
    <form onSubmit={enregistrer} className="mx-auto flex w-full max-w-3xl flex-col gap-4" noValidate>
      <EnTetePage titre="Nouvelle fuite" description={`${marche?.code ?? ""} · position, ${minusculeInitiale(libelles.reference)}, secteur, ouvrage et photos. Sans réseau, la fuite est gardée sur la tablette puis envoyée.`} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Crosshair className="size-4 text-muted-foreground" />Position</CardTitle>
          <CardDescription>Relevée par le GPS de l&apos;appareil ; l&apos;épingle se déplace sur la carte si besoin.</CardDescription>
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={localiser}><LocateFixed data-icon="inline-start" />Actualiser</Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {position ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm tabular-nums">{position.latitude.toFixed(6)}, {position.longitude.toFixed(6)}</span>
              {position.precision != null ? (
                <Badge variant="outline" className={position.precision > 30 ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300"}>
                  ± {Math.round(position.precision)} m
                </Badge>
              ) : <Badge variant="outline">placée sur la carte</Badge>}
            </div>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">{gpsMessage.startsWith("Recherche") && <Spinner />}{gpsMessage}</p>
          )}
          <MiniCarte position={position} troncon={t?.geojson ?? null} className="h-52"
            surDeplacement={(p) => setPosition({ ...p, precision: null })} />
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

      {(aDesSuggestions || s?.precision_insuffisante) && (
        <Card className="border-sky-200 dark:border-sky-900">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-sky-600" />Suggestions à valider</CardTitle>
            <CardDescription>
              {s?.precision_insuffisante ? "Précision GPS insuffisante : aucune suggestion." : `Dans un rayon de ${s?.rayon_m ?? "—"} m. Un clic reprend la suggestion ; rien n'est rempli d'office.`}
            </CardDescription>
          </CardHeader>
          {aDesSuggestions && (
            <CardContent className="flex flex-col gap-3">
              {rues.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">Rue</span>
                  {rues.map((r) => (
                    <Button key={r.nom} type="button" size="sm" variant="outline" onClick={() => setAdresse(adresse.trim() ? `${adresse.trim()}, ${r.nom}` : r.nom)}
                      title={r.nom_ar ?? undefined}>
                      {r.nom} <span className="text-muted-foreground">{Math.round(r.distance_m)} m</span>
                    </Button>
                  ))}
                </div>
              )}
              {secteurPropose && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">Secteur</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => setSecteurId(secteurPropose.id)}>
                    {secteurPropose.libelle} <span className="text-muted-foreground">{secteurPropose.source === "contour" ? "(contour)" : "(conduite proche)"}</span>
                  </Button>
                </div>
              )}
              {conduiteProposee && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-xs">Conduite</span>
                  <Button type="button" size="sm" variant="outline" onClick={() => {
                    if (conduiteProposee.materiau) choisirMateriau(conduiteProposee.materiau);
                    if (conduiteProposee.diametre_mm) setDiametre(String(conduiteProposee.diametre_mm));
                    setTronconId(conduiteProposee.id);
                  }}>
                    {[conduiteProposee.materiau ? MATERIAUX[conduiteProposee.materiau] : conduiteProposee.materiau_plan, conduiteProposee.diametre_mm ? `Ø ${conduiteProposee.diametre_mm}` : null].filter(Boolean).join(" ")}
                    <span className="text-muted-foreground">à {Math.round(conduiteProposee.distance_m)} m</span>
                  </Button>
                </div>
              )}
              {rues.length > 0 && <p className="text-muted-foreground text-xs">Rues : © contributeurs OpenStreetMap (ODbL).</p>}
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Identification</CardTitle>
          <CardDescription>Les champs marqués * sont obligatoires.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-1.5" data-invalid={invalide("reference_srm")}>
                <FieldLabel htmlFor="reference">{libelle("reference_srm", libelles.reference)}</FieldLabel>
                {libelles.masque ? (
                  <Input id="reference" value={reference} onChange={(e) => setReference(formaterReference(e.target.value, libelles.masque))} aria-invalid={invalide("reference_srm")}
                    placeholder={libelles.masque.replace(/9/g, "0")} inputMode="numeric" maxLength={libelles.masque.length} pattern={motifMasque(libelles.masque)}
                    title={`Format ${libelles.masque.replace(/9/g, "0")} : tapez les chiffres, les séparateurs se placent seuls`} />
                ) : (
                  <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} aria-invalid={invalide("reference_srm")} />
                )}
                {libelles.masque && <FieldDescription>Format {libelles.masque.replace(/9/g, "0")} : les séparateurs se placent seuls.</FieldDescription>}
              </Field>
              <Field className="gap-1.5" data-invalid={invalide("secteur_id")}>
                <FieldLabel htmlFor="secteur">{libelle("secteur_id", "Secteur")}</FieldLabel>
                <NativeSelect id="secteur" value={secteurId} onChange={(e) => setSecteurId(e.target.value)} className="w-full" aria-invalid={invalide("secteur_id")}>
                  <NativeSelectOption value="">— Choisir —</NativeSelectOption>
                  {secteurs.map((x) => <NativeSelectOption key={x.id} value={x.id}>{x.libelle}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-1.5" data-invalid={invalide("ouvrage")}>
                <FieldLabel htmlFor="ouvrage">{libelle("ouvrage", "Ouvrage")}</FieldLabel>
                <NativeSelect id="ouvrage" value={ouvrage} onChange={(e) => setOuvrage(e.target.value)} className="w-full" aria-invalid={invalide("ouvrage")}>
                  <NativeSelectOption value="">—</NativeSelectOption>
                  {Object.entries(OUVRAGES).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field className="gap-1.5" data-invalid={invalide("visibilite")}>
                <FieldLabel htmlFor="visibilite">{libelle("visibilite", "Visibilité")}</FieldLabel>
                <NativeSelect id="visibilite" value={visibilite} onChange={(e) => setVisibilite(e.target.value as typeof visibilite)} className="w-full" aria-invalid={invalide("visibilite")}>
                  <NativeSelectOption value="">—</NativeSelectOption>
                  <NativeSelectOption value="visible">Visible</NativeSelectOption>
                  <NativeSelectOption value="invisible">Invisible</NativeSelectOption>
                </NativeSelect>
              </Field>
            </div>
            <Field className="gap-1.5" data-invalid={invalide("nature_degradation_id")}>
              <FieldLabel htmlFor="nature">{libelle("nature_degradation_id", "Nature de dégradation")}</FieldLabel>
              <NativeSelect id="nature" value={natureId} onChange={(e) => setNatureId(e.target.value)} className="w-full" aria-invalid={invalide("nature_degradation_id")}>
                <NativeSelectOption value="">— Revêtement à l&apos;endroit de la fuite —</NativeSelectOption>
                {ref.natures.map((n) => <NativeSelectOption key={n.id} value={n.id}>{n.libelle_fr}{n.libelle_ar ? ` · ${n.libelle_ar}` : ""}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <Field className="gap-1.5" data-invalid={invalide("adresse")}>
              <FieldLabel htmlFor="adresse">{libelle("adresse", "Adresse / repère")}</FieldLabel>
              <Input id="adresse" value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="Rue, numéro, repère visible" aria-invalid={invalide("adresse")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="gap-1.5" data-invalid={invalide("materiau")}>
                <FieldLabel htmlFor="materiau">{libelle("materiau", "Matériau de la conduite")}</FieldLabel>
                <NativeSelect id="materiau" value={materiau} onChange={(e) => { choisirMateriau(e.target.value); setTronconId(null); }} className="w-full" aria-invalid={invalide("materiau")}>
                  <NativeSelectOption value="">—</NativeSelectOption>
                  {Object.entries(MATERIAUX).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field className="gap-1.5" data-invalid={invalide("diametre_mm")}>
                <FieldLabel htmlFor="diametre">{libelle("diametre_mm", `Diamètre (${sigleDiametre(materiau)} mm)`)}</FieldLabel>
                {diametres.length ? (
                  <NativeSelect id="diametre" value={diametre} onChange={(e) => { setDiametre(e.target.value); setTronconId(null); }} className="w-full" aria-invalid={invalide("diametre_mm")}>
                    <NativeSelectOption value="">—</NativeSelectOption>
                    {diametre && !diametres.includes(Number(diametre)) && <NativeSelectOption value={diametre}>{diametre} (hors liste)</NativeSelectOption>}
                    {diametres.map((d) => <NativeSelectOption key={d} value={String(d)}>{d}</NativeSelectOption>)}
                  </NativeSelect>
                ) : (
                  <Input id="diametre" value={diametre} onChange={(e) => { setDiametre(e.target.value); setTronconId(null); }} inputMode="numeric" aria-invalid={invalide("diametre_mm")} />
                )}
              </Field>
            </div>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="observation">Observation</FieldLabel>
              <Textarea id="observation" value={observation} onChange={(e) => setObservation(e.target.value)} rows={2} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {responsable && (
        <Card>
          <CardHeader>
            <CardTitle>Saisie au bureau</CardTitle>
            <CardDescription>Fuite signalée par un agent (fiche papier, téléphone) : choisissez qui l&apos;a détectée et quand.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="detectee-par">Détectée par</FieldLabel>
                  <NativeSelect id="detectee-par" value={detecteePar} onChange={(e) => setDetecteePar(e.target.value)} className="w-full">
                    <NativeSelectOption value="">Moi-même</NativeSelectOption>
                    {ref.agents.filter((a) => a.id !== session?.user.id).map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.nom_complet}</NativeSelectOption>)}
                  </NativeSelect>
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="date-detection">Date et heure de détection</FieldLabel>
                  <Input id="date-detection" type="datetime-local" value={dateDetection} max={versChampDate(new Date())} onChange={(e) => setDateDetection(e.target.value)} />
                </Field>
                <Field className="gap-1.5">
                  <FieldLabel htmlFor="source">Source</FieldLabel>
                  <NativeSelect id="source" value={source} onChange={(e) => setSource(e.target.value)} className="w-full">
                    <NativeSelectOption value="tablette">Sur place (tablette)</NativeSelectOption>
                    <NativeSelectOption value="web">Panneau web</NativeSelectOption>
                    <NativeSelectOption value="papier">Fiche papier</NativeSelectOption>
                  </NativeSelect>
                </Field>
              </div>
              {differee && <p className="text-violet-700 text-sm dark:text-violet-300">Elle portera la marque « saisie différée » (détection plus de 12 h avant la saisie).</p>}
              {dansLeFutur(quandDetection) && <p className="text-amber-700 text-sm">Date de détection dans le futur : vérifiez.</p>}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={validerAussi} onCheckedChange={(v) => setValiderAussi(v === true)} />
                Valider la détection en même temps
              </label>
            </FieldGroup>
          </CardContent>
        </Card>
      )}

      {peut("photos", "creer") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Camera className="size-4 text-muted-foreground" />Photos</CardTitle>
            <CardDescription>{photos.length} photo{photos.length > 1 ? "s" : ""} jointe{photos.length > 1 ? "s" : ""}. Facultatives, mais conseillées. Réduites à 1 600 px avant l&apos;envoi.</CardDescription>
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

"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays, CircleCheck, Circle, Clock3, Droplets, Ellipsis, FileText, History, Lock, LockOpen, MapPin,
  Navigation, Pencil, Plus, Trash2, WifiOff, Wrench,
} from "lucide-react";
import { ETATS_PIECE, libelleProvenance, type PieceAffichee } from "@/app/(app)/attachements/controles";
import { Vide } from "@/components/en-tete-page";
import { BadgeStatut, BadgesAlertes, STATUT_STYLE, ORDRE_STATUTS } from "@/components/statut";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { BoutonEnvoyerEmail } from "@/components/envoyer-email";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  EMPLACEMENTS, MATERIAUX, OUVRAGES, dateHeure, libellesMarche, messageErreur, montant, nombre,
} from "@/lib/format";
import { estErreurReseau, noterConsultation, oublierFiche } from "@/lib/hors-ligne";
import { lienItineraire } from "@/lib/itineraire";
import { lireArticlesEtUsages, lireReferentielsSaisie, type ReferentielsSaisie } from "@/lib/saisie/referentiels";
import { droitsEtape, estBureau, sigleDiametre, type Etape } from "@/lib/saisie/regles";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import type { FuiteV2, PhotoLigne, Piece, Quantite, Refection, Reparation, Secteur, StatutFuite, VFuite } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { PieceLue } from "@/app/(app)/attachements/controles";
import { garderCopie, lireCopie } from "./copie";
import { CorrectionDetection } from "./correction-detection";
import { FormRefection } from "./form-refection";
import { FormReparation } from "./form-reparation";
import { lireFicheEnLigne, type LectureEnLigne } from "./donnees";
import { Photos, cleEtapePhoto, type EtapePhoto } from "./photos";
import { BoutonValider, EtatValidation, type ElementAValider } from "./validation";
import {
  DELAI_RESEAU_MS, NOMS_VIDES, actionsFiche, choisirAffichage, type ContenuFiche, type LiensReparations, type NomsFiche,
} from "./fiche-hors-ligne";

const nombreOuNul = (t: string) => (t.trim() === "" ? null : Number(t.replace(",", ".")));

// Ligne de prix avec le motif de sa dernière correction (lot R)
type QuantiteFiche = Quantite & { motif_correction?: string | null };

// Pièces d'une réparation (lot R) : inventaire réel, avec les corrections du bureau (nature, motif) ;
// la saisie d'origine corrigée reste visible, barrée « remplacée » ou « retirée ». Une copie gardée
// avant le lot R ne contient que le texte de chaque pièce.
function PiecesReparation({ pieces = [] }: { pieces?: (PieceAffichee | string)[] }) {
  if (!pieces.length) return null;
  return (
    <Info libelle="Pièces posées" large valeur={(
      <ul className="m-0 grid list-none gap-0.5 p-0">
        {pieces.map((p, i) => (typeof p === "string" ? <li key={i}>{p}</li> : (
          <li key={p.id} className={cn(p.etat !== "posee" && "text-muted-foreground")}>
            <span className={cn(p.etat !== "posee" && "line-through")}>{p.texte}</span>
            {p.etat !== "posee" && <Badge variant="outline" className="ml-1.5 rounded-sm border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">{ETATS_PIECE[p.etat]}</Badge>}
            {p.provenance === "correction" && <Badge variant="outline" className="ml-1.5 rounded-sm border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">{libelleProvenance(p.provenance, p.nature)}</Badge>}
            {p.remplace && <span className="text-muted-foreground"> · remplace {p.remplace}</span>}
            {p.remplaceePar && <span className="text-muted-foreground"> · remplacée par {p.remplaceePar}</span>}
            {p.motif && <span className="text-muted-foreground"> · « {p.motif} »</span>}
          </li>
        )))}
      </ul>
    )} />
  );
}

function Info({ libelle, valeur, large }: { libelle: string; valeur: React.ReactNode; large?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1", large && "sm:col-span-2 xl:col-span-3")}>
      <span className="text-muted-foreground text-xs">{libelle}</span>
      <span className="text-sm">{valeur ?? "—"}</span>
    </div>
  );
}

export default function DetailFuite() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { marche, marches, choisirMarche, peut, session } = useSession();
  const libelles = libellesMarche(marche);
  const [fuite, setFuite] = useState<VFuite | null>(null);
  // Fiche d'un autre marché (lien direct, nouvel onglet) : le marché de la fuite devient le marché ouvert,
  // pour que droits, paramètres et saisies suivent la fuite.
  useEffect(() => {
    if (fuite && marche && fuite.marche_id !== marche.id && marches.some((m) => m.id === fuite.marche_id)) {
      choisirMarche(fuite.marche_id);
    }
  }, [fuite, marche, marches, choisirMarche]);
  const [photos, setPhotos] = useState<(PhotoLigne & { url?: string })[]>([]);
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [refections, setRefections] = useState<Refection[]>([]);
  const [quantites, setQuantites] = useState<Quantite[]>([]);
  const [v2, setV2] = useState<FuiteV2 | null>(null);
  const [piecesLues, setPiecesLues] = useState<Record<string, PieceLue[]>>({});
  // Listes de la saisie, lues à l'ouverture du premier formulaire
  const [saisie, setSaisie] = useState<{ ref: ReferentielsSaisie; articles: Piece[]; usages: Map<number, number>; secteurs: Secteur[] } | null>(null);
  const [chargementSaisie, setChargementSaisie] = useState(false);
  const [etapePhoto, setEtapePhoto] = useState<string | null>(null);
  const [noms, setNoms] = useState<NomsFiche>(NOMS_VIDES);
  const [liens, setLiens] = useState<LiensReparations>({ ouvriers: {}, pieces: {} });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  // Formulaire ouvert : nouvelle réparation / réfection, modification d'une étape (id), ou de la détection
  const [formulaire, setFormulaire] = useState<{ type: Etape; id?: string } | null>(null);
  const [rapport, setRapport] = useState("");
  const [rapportEnCours, setRapportEnCours] = useState(false);
  const [horsLigne, setHorsLigne] = useState<string | null>(null);
  const [indisponible, setIndisponible] = useState(false);
  const [onglet, setOnglet] = useState("ensemble");
  const generation = useRef(0);
  const surCopie = useRef(false);
  const urlsLocales = useRef<string[]>([]);

  const marcheId = marche?.id;
  const utilisateurId = session?.user.id;
  const bureau = estBureau(peut);

  const appliquer = useCallback((c: ContenuFiche, urls: Map<string, string>) => {
    setFuite(c.fuite);
    setPhotos(c.photos.map((p) => ({ ...p, url: urls.get(p.id) })));
    setReparations(c.reparations);
    setRefections(c.refections);
    setQuantites(c.quantites);
    setLiens(c.liens);
    setNoms(c.noms);
    setV2(c.v2 ?? null);
  }, []);

  const remplacerUrlsLocales = useCallback((urls: string[]) => {
    urlsLocales.current.forEach((u) => URL.revokeObjectURL(u));
    urlsLocales.current = urls;
  }, []);
  useEffect(() => () => remplacerUrlsLocales([]), [remplacerUrlsLocales]);

  const charger = useCallback(async () => {
    if (!marcheId || !utilisateurId) return;
    const tour = ++generation.current;
    let enLigne = false;

    const afficherCopie = async (lecture: "reseau" | "en_cours") => {
      const copie = await lireCopie(id, utilisateurId);
      if (tour !== generation.current || enLigne) {
        copie?.urls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      const affichage = choisirAffichage({ lecture, copie: !!copie });
      if (affichage === "attente") return;
      surCopie.current = true;
      setFormulaire(null);
      if (copie) {
        remplacerUrlsLocales([...copie.urls.values()]);
        appliquer(copie.fiche, copie.urls);
        setHorsLigne(copie.fiche.version_le);
        setIndisponible(false);
        void noterConsultation(id, new Date().toISOString());
      } else {
        setIndisponible(true);
      }
      setChargement(false);
    };

    if (navigator.onLine === false) {
      await afficherCopie("reseau");
      return;
    }
    const minuteur = window.setTimeout(() => void afficherCopie("en_cours"), DELAI_RESEAU_MS);
    let lu: LectureEnLigne;
    try {
      lu = await lireFicheEnLigne(id, marcheId, { bureau });
    } catch (e) {
      window.clearTimeout(minuteur);
      if (tour !== generation.current) return;
      if (estErreurReseau(e)) {
        await afficherCopie("reseau");
      } else {
        setErreur(messageErreur(e));
        setChargement(false);
      }
      return;
    }
    window.clearTimeout(minuteur);
    if (tour !== generation.current) return;
    if (lu.reseau) {
      await afficherCopie("reseau");
      return;
    }
    enLigne = true;
    surCopie.current = false;
    remplacerUrlsLocales([]);
    setHorsLigne(null);
    setIndisponible(false);
    if (lu.erreur) setErreur(messageErreur(lu.erreur));
    if (lu.contenu) appliquer(lu.contenu, lu.urls);
    else setFuite(null);
    setPiecesLues(lu.piecesLues);
    setChargement(false);
    if (lu.contenu && lu.complete) void garderCopie(lu.contenu, lu.urls, utilisateurId).catch(() => undefined);
    else if (!lu.contenu && !lu.erreur) void oublierFiche(id);
  }, [id, marcheId, utilisateurId, bureau, appliquer, remplacerUrlsLocales]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Lien « Ajouter une photo » de l'écran À valider : onglet Photos, étape choisie (?photo=reparation:<id>).
  useEffect(() => {
    const etape = new URLSearchParams(window.location.search).get("photo");
    if (!etape) return;
    setEtapePhoto(etape);
    setOnglet("photos");
  }, []);

  useEffect(() => {
    const retour = () => {
      if (surCopie.current) void charger();
    };
    window.addEventListener("online", retour);
    return () => window.removeEventListener("online", retour);
  }, [charger]);

  async function executer(action: () => PromiseLike<{ error: unknown }>) {
    setErreur("");
    setOccupe(true);
    try {
      const { error } = await action();
      if (error) throw error;
      await charger();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  async function rapportPdf() {
    if (!marcheId) return;
    setErreur("");
    setRapport("Préparation…");
    setRapportEnCours(true);
    try {
      const { telechargerRapports } = await import("@/lib/export/rapport-fuite");
      const r = await telechargerRapports([id], marcheId, peut("quantites", "lire"), (fait, total, etape) =>
        setRapport(`${etape} (${Math.round((fait / Math.max(1, total)) * 100)} %)`));
      setRapport(`Rapport téléchargé (${(r.octets / 1024).toFixed(0)} Ko, ${r.secondes.toFixed(1)} s)`);
    } catch (e) {
      setRapport("");
      setErreur(messageErreur(e));
    } finally {
      setRapportEnCours(false);
    }
  }

  const modifierFuite = (champs: Record<string, unknown>) => executer(() => getSupabase().from("fuites").update(champs).eq("id", id));

  // Ouvre un formulaire après avoir lu les listes de la saisie (une fois par fiche).
  async function ouvrir(f: { type: Etape; id?: string }) {
    setErreur("");
    if (!saisie && marcheId) {
      setChargementSaisie(true);
      try {
        const [ref, art, sec] = await Promise.all([
          lireReferentielsSaisie(marcheId),
          lireArticlesEtUsages(marcheId),
          getSupabase().from("secteurs").select("id, zone_id, code, libelle").eq("marche_id", marcheId).eq("actif", true).order("libelle"),
        ]);
        setSaisie({ ref, articles: art.articles, usages: art.usages, secteurs: (sec.data as Secteur[] | null) ?? [] });
      } catch (e) {
        setErreur(messageErreur(e));
        return;
      } finally {
        setChargementSaisie(false);
      }
    }
    setFormulaire(f);
    if (f.type !== "detection") setOnglet(f.type === "reparation" ? "reparations" : "refections");
  }
  const fermer = () => setFormulaire(null);
  const apresSaisie = () => { setFormulaire(null); charger(); };
  const ajouterPhotoEtape = (e: ElementAValider) => {
    setEtapePhoto(e.etape === "detection" ? "detection" : `${e.etape}:${e.id}`);
    setOnglet("photos");
  };

  if (chargement) return <p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>;
  if (indisponible) {
    return (
      <Alert role="status" className="max-w-xl">
        <WifiOff />
        <AlertTitle>Fiche non disponible hors ligne</AlertTitle>
        <AlertDescription>Elle n&apos;a pas encore été ouverte sur cet appareil avec du réseau.</AlertDescription>
        <AlertAction><Button size="sm" variant="outline" onClick={() => charger()}>Réessayer</Button></AlertAction>
      </Alert>
    );
  }
  if (!fuite) {
    return (
      <Vide>
        <span>Fuite introuvable ou accès refusé.&nbsp;<Link href="/fuites" className="text-primary underline-offset-4 hover:underline">Retour à la liste</Link></span>
      </Vide>
    );
  }

  const verrouillee = !!fuite.verrouillee_le;
  const peutValider = peut("fuites", "valider");
  const actions = actionsFiche(peut, { horsLigne: !!horsLigne, verrouillee });
  const moi = utilisateurId ?? null;
  const contexteDroits = { moi, peut, verrouilleeLe: fuite.verrouillee_le };
  const droitsDetection = horsLigne || !v2 ? null : droitsEtape("detection", v2, contexteDroits);
  const photosDe = (cle: string) => photos.filter((p) => cleEtapePhoto(p) === cle).length;
  const etapesPhotos: EtapePhoto[] = [
    { cle: "detection", libelle: "Détection", valideeLe: v2?.validee_le ?? null },
    ...reparations.map((r, i) => ({ cle: `reparation:${r.id}`, libelle: `Réparation ${i + 1} (${dateHeure(r.realisee_le)})`, valideeLe: r.validee_le ?? null })),
    ...refections.map((r, i) => ({ cle: `refection:${r.id}`, libelle: `Réfection ${i + 1} (${dateHeure(r.realisee_le)})`, valideeLe: r.validee_le ?? null })),
  ];
  const suggestionsFuite = { materiau: v2?.materiau ?? null, diametre_mm: v2?.diametre_mm ?? null, nature_degradation_id: v2?.nature_degradation_id ?? null };
  const formulaireOuvert = (type: Etape, eid?: string) => formulaire?.type === type && formulaire.id === eid && !!saisie;
  const maintenant = () => new Date().toISOString();
  const natureLibelle = (nid: string | null | undefined) => (nid && noms.natures[nid]) || "—";
  const motifLibelle = (mid: string | null | undefined) => (mid && noms.motifs[mid]) || "—";
  const totalHt = quantites.reduce((s, l) => s + (l.montant_ht_bordereau ?? 0), 0);

  const premiereReparee = reparations.find((r) => r.resultat === "reparee");
  const jalons = libelles.jalons || !!(fuite.date_communication_srm || fuite.avis_terrassement_srm_le || fuite.validation_srm_le);
  const etapes: [string, string | null | undefined][] = fuite.statut === "sans_reparation"
    ? [["Détectée", fuite.date_detection], ["Sans réparation", fuite.verrouillee_le ?? fuite.date_detection]]
    : [
      ["Détectée", fuite.date_detection],
      ...(jalons ? [[`Communiquée ${libelles.sigle}`, fuite.date_communication_srm], ["Avis terrassement", fuite.avis_terrassement_srm_le]] as [string, string | null][] : []),
      ["Réparée", premiereReparee?.realisee_le],
      ["Réfection", fuite.derniere_refection_le],
      ...(jalons ? [[`Validée ${libelles.sigle}`, fuite.validation_srm_le]] as [string, string | null][] : []),
    ];
  const faites = etapes.filter(([, d]) => !!d).length;
  const avancement = Math.round((100 * faites) / etapes.length);
  const nomProfil = (pid: string | null | undefined) => (pid && noms.profils[pid]) || null;

  const historique: [string, string][] = ([
    [fuite.date_detection, `détectée${fuite.detectee_par ? ` par ${fuite.detectee_par}` : ""} (saisie ${fuite.source_saisie})`],
    [fuite.date_communication_srm, `communiquée à ${libelles.sigle}`],
    [fuite.avis_terrassement_srm_le, "avis préalable avant terrassement obtenu"],
    ...reparations.map((r) => [r.realisee_le, `réparation saisie (${r.resultat === "reparee" ? "réparée" : r.resultat === "en_cours" ? "en cours" : "non réparée"})${nomProfil(r.auteur_terrain_id) ? ` par ${nomProfil(r.auteur_terrain_id)}` : ""}`]),
    ...refections.map((r) => [r.realisee_le, r.resultat === "faite" ? "réfection saisie" : "clôturée sans réfection"]),
    [fuite.validation_srm_le, `validée par ${fuite.validation_srm_par || `le représentant ${libelles.sigle}`}`],
    [fuite.verrouillee_le, "verrouillée"],
    [v2?.validee_le, `détection validée${nomProfil(v2?.validee_par) ? ` par ${nomProfil(v2?.validee_par)}` : ""}`],
    ...reparations.map((r) => [r.validee_le, `réparation du ${dateHeure(r.realisee_le)} validée${nomProfil(r.validee_par) ? ` par ${nomProfil(r.validee_par)}` : ""}`]),
    ...refections.map((r) => [r.validee_le, `réfection du ${dateHeure(r.realisee_le)} validée${nomProfil(r.validee_par) ? ` par ${nomProfil(r.validee_par)}` : ""}`]),
    // R7 : les corrections du bureau ne se montrent qu'au bureau
    ...(bureau ? [[v2?.corrigee_le, `détection corrigée${nomProfil(v2?.corrigee_par) ? ` par ${nomProfil(v2?.corrigee_par)}` : ""} : « ${v2?.motif_correction ?? ""} »`]] : []),
  ] as [string | null | undefined, string][])
    .filter((e): e is [string, string] => !!e[0])
    .sort((a, b) => b[0].localeCompare(a[0]));

  const itineraire = lienItineraire(fuite.latitude, fuite.longitude);
  const s = STATUT_STYLE[fuite.statut];

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink asChild><Link href="/fuites" prefetch={false}>Fuites</Link></BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><span>{marche?.code}</span></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Fuite N° {fuite.numero}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {horsLigne && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50" role="status">
          <WifiOff />
          <AlertTitle>Hors ligne : version du {dateHeure(horsLigne)}</AlertTitle>
          <AlertDescription className="text-amber-900/80 dark:text-amber-50/80">Lecture seule : les modifications reviendront avec le réseau.</AlertDescription>
        </Alert>
      )}

      {/* En-tête (modèle « Profile ») : anneau d'avancement, titre, badges, actions */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid size-18 shrink-0 place-items-center sm:size-22">
            <span className="sr-only">Avancement {avancement} %</span>
            <svg aria-hidden="true" className="col-start-1 row-start-1 size-full -rotate-90" viewBox="0 0 100 100">
              <circle className="fill-none stroke-muted" cx="50" cy="50" pathLength="100" r="46" strokeWidth="2.5" />
              <circle className="fill-none" cx="50" cy="50" pathLength="100" r="46" strokeDasharray={`${avancement} 100`} strokeLinecap="round" strokeWidth="2.5" stroke={s.couleur} />
            </svg>
            <div className={cn("col-start-1 row-start-1 flex size-14 items-center justify-center rounded-full bg-muted sm:size-16", s.texte)}>
              <Droplets className="size-7" />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <h1 className="truncate font-heading font-semibold text-xl leading-6 tracking-tight sm:text-2xl sm:leading-7">Fuite N° {fuite.numero}</h1>
              <p className="truncate text-muted-foreground text-sm leading-5">
                {[fuite.reference_srm && `Réf. ${libelles.sigle} ${fuite.reference_srm}`, fuite.secteur, fuite.adresse].filter(Boolean).join(" · ") || "Sans référence ni adresse"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <BadgeStatut statut={fuite.statut} className="rounded-sm" />
              {fuite.origine === "srm" && <Badge className="rounded-sm" variant="secondary">Signalée par {libelles.sigle}</Badge>}
              {v2 && <EtatValidation valideeLe={v2.validee_le} par={nomProfil(v2.validee_par)} />}
              {v2?.saisie_differee && (
                <Badge className="rounded-sm border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300" variant="outline"
                  title={`Détectée le ${dateHeure(fuite.date_detection)}, saisie le ${dateHeure(v2.cree_le)}`}>
                  <Clock3 data-icon="inline-start" />Saisie différée
                </Badge>
              )}
              {verrouillee && <Badge className="rounded-sm" variant="outline"><Lock data-icon="inline-start" />Verrouillée le {dateHeure(fuite.verrouillee_le)}</Badge>}
              <BadgesAlertes fuite={fuite} libelles={libelles} sansPhoto vide={null} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {itineraire && (
            <Button size="sm" variant="outline" asChild>
              <a href={itineraire} target="_blank" rel="noreferrer"><Navigation data-icon="inline-start" />Y aller</a>
            </Button>
          )}
          {actions.rapportPdf && (
            <Button size="sm" variant="outline" disabled={rapportEnCours} onClick={rapportPdf}>
              {rapportEnCours ? <Spinner /> : <FileText data-icon="inline-start" />}Rapport PDF
            </Button>
          )}
          {actions.rapportPdf && marcheId && (
            <BoutonEnvoyerEmail size="sm" document="rapport_fuite" reference={`Fuite N° ${fuite.numero}`}
              fabriquer={async () => (await import("@/lib/export/rapport-fuite")).fabriquerRapports([id], marcheId, peut("quantites", "lire"))} />
          )}
          {actions.verrouiller && (
            <Button size="sm" variant={verrouillee ? "outline" : "default"} disabled={occupe}
              onClick={() => modifierFuite({ verrouillee_le: verrouillee ? null : maintenant() })}>
              {verrouillee ? <LockOpen data-icon="inline-start" /> : <Lock data-icon="inline-start" />}
              {verrouillee ? "Déverrouiller" : "Verrouiller"}
            </Button>
          )}
          {(actions.changerStatut || actions.supprimer) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Autres actions" size="icon-sm" variant="outline"><Ellipsis /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Responsable</DropdownMenuLabel>
                  {actions.changerStatut && (
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Changer le statut</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup value={fuite.statut} onValueChange={(v) => modifierFuite({ statut: v as StatutFuite })}>
                          {ORDRE_STATUTS.map((k) => (
                            <DropdownMenuRadioItem key={k} value={k} disabled={occupe || (k === "sans_reparation" && !fuite.motif_sans_reparation)}>
                              {STATUT_STYLE[k].libelle}
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  )}
                </DropdownMenuGroup>
                {actions.supprimer && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" disabled={occupe}
                      onSelect={async () => {
                        if (!window.confirm("Supprimer cette fuite ? (elle sera masquée, la trace reste dans le journal)")) return;
                        const { error } = await getSupabase().from("fuites").update({ supprime_le: maintenant() }).eq("id", id);
                        if (error) setErreur(messageErreur(error));
                        else router.replace("/fuites");
                      }}>
                      <Trash2 />Supprimer la fuite
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {rapport && <p className="text-muted-foreground text-sm" role="status">{rapport}</p>}
      {erreur && (
        <Alert variant="destructive">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <Tabs className="min-h-0 flex-1 gap-0" value={onglet} onValueChange={setOnglet}>
        <div className="scrollbar-none touch-pan-x overflow-x-auto overscroll-x-contain border-y">
          <TabsList className="w-max min-w-full justify-start gap-4 ps-0 *:data-[slot=tabs-trigger]:flex-none" variant="line">
            <TabsTrigger value="ensemble">Vue d&apos;ensemble</TabsTrigger>
            <TabsTrigger value="reparations">Réparations <Compteur n={reparations.length} /></TabsTrigger>
            <TabsTrigger value="refections">Réfections <Compteur n={refections.length} /></TabsTrigger>
            <TabsTrigger value="photos">Photos <Compteur n={photos.length} /></TabsTrigger>
            {quantites.length > 0 && <TabsTrigger value="quantites">Quantités</TabsTrigger>}
            <TabsTrigger value="historique">Historique</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ensemble">
          <div className="grid lg:grid-cols-[minmax(0,1fr)_auto_19rem]">
            <div className="py-4 lg:pr-6">
              {formulaireOuvert("detection") && saisie ? (
                <Card className="mb-4">
                  <CardContent>
                    <CorrectionDetection fuite={fuite} v2={v2} referentiels={saisie.ref} secteurs={saisie.secteurs} onFini={apresSaisie} onAnnuler={fermer} />
                  </CardContent>
                </Card>
              ) : null}
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-heading font-medium text-base">Identification</h2>
                  {droitsDetection && !formulaire && (
                    <div className="flex flex-wrap gap-2">
                      {droitsDetection.valider && (
                        <BoutonValider element={{ etape: "detection", id: fuite.id, libelle: `Détection de la fuite N° ${fuite.numero}`, nbPhotos: photosDe("detection") }}
                          onValide={charger} onErreur={setErreur} onAjouterPhoto={ajouterPhotoEtape} />
                      )}
                      {droitsDetection.modifier ? (
                        <Button size="sm" variant="outline" disabled={chargementSaisie} onClick={() => ouvrir({ type: "detection" })}>
                          {chargementSaisie ? <Spinner /> : <Pencil data-icon="inline-start" />}{peutValider ? "Corriger" : "Modifier"}
                        </Button>
                      ) : droitsDetection.raison && peut("fuites", "modifier") ? (
                        <span className="text-muted-foreground text-xs">{droitsDetection.raison}</span>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
                  <Info libelle="Origine" valeur={fuite.origine === "srm" ? `Signalée par ${libelles.sigle}` : "Détection de l'entreprise"} />
                  <Info libelle={libelles.reference} valeur={fuite.reference_srm} />
                  <Info libelle="Ouvrage" valeur={fuite.ouvrage ? `${OUVRAGES[fuite.ouvrage]}${fuite.visibilite ? ` (${fuite.visibilite})` : ""}` : null} />
                  <Info libelle="Nature de dégradation" valeur={v2?.nature_degradation_id ? noms.natures[v2.nature_degradation_id] ?? "—" : null} />
                  <Info libelle="Conduite" valeur={[v2?.materiau ? MATERIAUX[v2.materiau] : null, v2?.diametre_mm ? `${sigleDiametre(v2.materiau)} ${v2.diametre_mm} mm` : null].filter(Boolean).join(" · ") || null} />
                  <Info libelle="Zone" valeur={fuite.zone} />
                  <Info libelle="Secteur" valeur={fuite.secteur} />
                  <Info libelle="Détectée" valeur={`${dateHeure(fuite.date_detection)}${fuite.detectee_par ? ` par ${fuite.detectee_par}` : ""}`} />
                  <Info libelle="Adresse" valeur={fuite.adresse} large />
                  {fuite.motif_sans_reparation && <Info libelle="Motif" valeur={fuite.motif_sans_reparation} large />}
                  {fuite.observation && <Info libelle="Observation" valeur={<span className="whitespace-pre-wrap">{fuite.observation}</span>} large />}
                  {bureau && v2?.motif_correction && (
                    <Info libelle="Dernière correction du bureau" large
                      valeur={`${dateHeure(v2.corrigee_le)}${nomProfil(v2.corrigee_par) ? ` par ${nomProfil(v2.corrigee_par)}` : ""} : « ${v2.motif_correction} »`} />
                  )}
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-heading font-medium text-base">Localisation</h2>
                  {fuite.latitude != null && (
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/carte?fuite=${fuite.id}`} prefetch={false}><MapPin data-icon="inline-start" />Voir sur la carte</Link>
                    </Button>
                  )}
                </div>
                {fuite.latitude != null && fuite.longitude != null ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="font-mono tabular-nums">{fuite.latitude.toFixed(6)} ; {fuite.longitude.toFixed(6)}</span>
                    <a className="text-primary underline-offset-4 hover:underline" href={`https://www.google.com/maps?q=${fuite.latitude},${fuite.longitude}`} target="_blank" rel="noreferrer">Google Maps</a>
                    {itineraire && <a className="text-primary underline-offset-4 hover:underline" href={itineraire} target="_blank" rel="noreferrer">Itinéraire ›</a>}
                  </div>
                ) : <p className="text-muted-foreground text-sm">Coordonnées GPS non relevées.</p>}
              </div>

              {(peut("fuites", "modifier") || peutValider) && jalons && (
                <>
                  <Separator className="my-4" />
                  <div className="flex flex-col gap-2">
                    <h2 className="font-heading font-medium text-base">Suivi {libelles.sigle}</h2>
                    <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
                      <Info libelle="Communiquée" valeur={fuite.date_communication_srm ? dateHeure(fuite.date_communication_srm) : !actions.suiviClient ? "—" : (
                        <Button size="xs" variant="outline" disabled={occupe} onClick={() => modifierFuite({ date_communication_srm: maintenant() })}>Marquer communiquée</Button>
                      )} />
                      <Info libelle="Avis avant terrassement" valeur={fuite.avis_terrassement_srm_le ? dateHeure(fuite.avis_terrassement_srm_le) : !actions.suiviClient ? "—" : (
                        <Button size="xs" variant="outline" disabled={occupe} onClick={() => modifierFuite({ avis_terrassement_srm_le: maintenant() })}>Avis obtenu</Button>
                      )} />
                      <Info libelle="Validation" valeur={fuite.validation_srm_le ? `${dateHeure(fuite.validation_srm_le)}${fuite.validation_srm_par ? ` (${fuite.validation_srm_par})` : ""}` : !actions.suiviClient ? "—" : (
                        <Button size="xs" variant="outline" disabled={occupe} onClick={() => {
                          const nom = window.prompt(`Nom du représentant ${libelles.sigle} présent :`);
                          if (nom !== null) modifierFuite({ validation_srm_le: maintenant(), validation_srm_par: nom.trim() || null });
                        }}>Enregistrer la validation</Button>
                      )} />
                    </div>
                  </div>
                </>
              )}
            </div>
            <Separator className="hidden lg:block" orientation="vertical" />
            <aside className="py-4 lg:pl-6">
              <div className="flex flex-col gap-4">
                <h2 className="font-heading font-medium text-sm">État du dossier</h2>
                <div className="flex items-start gap-2">
                  {verrouillee ? <Lock aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" /> : <CircleCheck aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />}
                  <div>
                    <p className="font-medium text-sm">{s.libelle}</p>
                    <p className="text-muted-foreground text-xs">{verrouillee ? `Validée et verrouillée le ${dateHeure(fuite.verrouillee_le)}` : `${faites} étape${faites > 1 ? "s" : ""} sur ${etapes.length} franchie${faites > 1 ? "s" : ""}`}</p>
                  </div>
                </div>
                <p className="text-muted-foreground text-xs">{fuite.nb_photos} photo{fuite.nb_photos > 1 ? "s" : ""} · saisie {fuite.source_saisie}</p>
              </div>
              <Separator className="my-4" />
              <div className="flex flex-col gap-3">
                <h2 className="font-heading font-medium text-sm">Étapes</h2>
                <ol className="flex flex-col">
                  {etapes.map(([libelle, date], i) => (
                    <li key={libelle} className={cn("flex gap-3 py-2.5", i < etapes.length - 1 && "border-b")}>
                      {date ? <CircleCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-green-600 dark:text-green-400" /> : <Circle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />}
                      <div>
                        <p className={cn("font-medium text-sm", !date && "text-muted-foreground")}>{libelle}</p>
                        <p className="text-muted-foreground text-xs tabular-nums">{date ? dateHeure(date) : "à venir"}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="reparations" className="py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-heading font-medium text-base">Réparation{reparations.length > 1 ? "s" : ""}</h2>
                <p className="text-muted-foreground text-sm">Interventions saisies sur le terrain ou au bureau ; chacune est validée par le responsable.</p>
              </div>
              {actions.ajouterReparation && !formulaire && (
                <Button size="sm" disabled={chargementSaisie} onClick={() => ouvrir({ type: "reparation" })}>
                  {chargementSaisie ? <Spinner /> : <Plus data-icon="inline-start" />}Réparation
                </Button>
              )}
            </div>
            {reparations.length === 0 && !formulaireOuvert("reparation") && <Vide>Aucune réparation saisie.</Vide>}
            {reparations.map((r) => {
              if (formulaireOuvert("reparation", r.id)) {
                return (
                  <Card key={r.id}>
                    <CardContent>
                      <FormReparation marcheId={marche!.id} fuiteId={id} suggestions={suggestionsFuite} referentiels={saisie!.ref} articles={saisie!.articles}
                        usages={saisie!.usages} existante={r} piecesExistantes={piecesLues[r.id]} onFini={apresSaisie} onAnnuler={fermer} />
                    </CardContent>
                  </Card>
                );
              }
              const d = horsLigne ? null : droitsEtape("reparation", r, contexteDroits);
              return (
                <Card key={r.id}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <Wrench className="size-4 text-muted-foreground" />
                      {r.resultat === "reparee" ? "Réparée" : r.resultat === "en_cours" ? "En cours / reste à finir" : "Non réparée"}
                      <EtatValidation valideeLe={r.validee_le} par={nomProfil(r.validee_par)} />
                    </CardTitle>
                    <CardDescription>{dateHeure(r.realisee_le)}{nomProfil(r.auteur_terrain_id) ? ` · ${nomProfil(r.auteur_terrain_id)}` : ""}</CardDescription>
                    {d && !formulaire && (d.valider || d.modifier) && (
                      <CardAction className="flex flex-wrap gap-2">
                        {d.valider && (
                          <BoutonValider element={{ etape: "reparation", id: r.id, libelle: `Réparation du ${dateHeure(r.realisee_le)}`, nbPhotos: photosDe(`reparation:${r.id}`) }}
                            onValide={charger} onErreur={setErreur} onAjouterPhoto={ajouterPhotoEtape} />
                        )}
                        {d.modifier && (
                          <Button size="sm" variant="outline" disabled={chargementSaisie} onClick={() => ouvrir({ type: "reparation", id: r.id })}>
                            <Pencil data-icon="inline-start" />Modifier
                          </Button>
                        )}
                      </CardAction>
                    )}
                  </CardHeader>
                  <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Info libelle="Chef d'équipe" valeur={nomProfil(r.auteur_terrain_id)} />
                    <Info libelle="Ouvriers" valeur={liens.ouvriers[r.id]?.join(", ") || null} />
                    <Info libelle="Matériau" valeur={[r.materiau ? MATERIAUX[r.materiau] : null, r.diametre_mm ? `Ø ${r.diametre_mm} mm` : null].filter(Boolean).join(" ") || null} />
                    <Info libelle="Ouvrage" valeur={r.ouvrage ? OUVRAGES[r.ouvrage] : null} />
                    <Info libelle="Travaux" large valeur={[r.tuyau_repare && "tuyau réparé", r.robinet_pec_change && "robinet PEC changé", r.collier_pec_change && "collier PEC changé",
                      r.bouche_a_cle_mise_a_niveau && "bouche à clé mise à niveau", r.element_remplace && "élément remplacé"].filter(Boolean).join(", ") || null} />
                    {r.longueur_pe_m != null && <Info libelle="PE posé" valeur={`${nombre(r.longueur_pe_m)} m`} />}
                    <Info libelle="Fouille" valeur={r.volume_m3 != null ? <>{nombre(r.fouille_longueur_m)} × {nombre(r.fouille_largeur_m)} × {nombre(r.fouille_profondeur_m)} m = <b>{nombre(r.volume_m3, 3)} m³</b></> : null} />
                    <Info libelle="Revêtement à refaire" valeur={r.nature_revetement_id ? natureLibelle(r.nature_revetement_id) : null} />
                    <Info libelle="Emplacement" valeur={r.emplacement ? EMPLACEMENTS[r.emplacement] : null} />
                    <PiecesReparation pieces={liens.pieces[r.id]} />
                    {r.representant_srm && <Info libelle={`Représentant ${libelles.sigle}`} valeur={r.representant_srm} />}
                    {r.motif_id && <Info libelle="Motif" valeur={motifLibelle(r.motif_id)} />}
                    {r.observation && <Info libelle="Observation" large valeur={r.observation} />}
                    {d && !d.modifier && d.raison && peut("interventions", "modifier") && <p className="text-muted-foreground text-xs sm:col-span-2 xl:col-span-4">{d.raison}</p>}
                  </CardContent>
                </Card>
              );
            })}
            {formulaireOuvert("reparation") && (
              <Card>
                <CardContent>
                  <FormReparation marcheId={marche!.id} fuiteId={id} suggestions={suggestionsFuite} referentiels={saisie!.ref} articles={saisie!.articles}
                    usages={saisie!.usages} onFini={apresSaisie} onAnnuler={fermer} />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="refections" className="py-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-heading font-medium text-base">Réfection{refections.length > 1 ? "s" : ""}</h2>
                <p className="text-muted-foreground text-sm">Remise en état de la chaussée ou du trottoir après réparation.</p>
              </div>
              {actions.ajouterRefection && !formulaire && (reparations.length > 0 || refections.length > 0) && (
                <Button size="sm" disabled={chargementSaisie} onClick={() => ouvrir({ type: "refection" })}>
                  {chargementSaisie ? <Spinner /> : <Plus data-icon="inline-start" />}Réfection
                </Button>
              )}
            </div>
            {refections.length === 0 && !formulaireOuvert("refection") && <Vide>{reparations.length ? "Aucune réfection saisie." : "Une réfection se saisit après une réparation."}</Vide>}
            {refections.map((r) => {
              if (formulaireOuvert("refection", r.id)) {
                return (
                  <Card key={r.id}>
                    <CardContent>
                      <FormRefection marcheId={marche!.id} fuiteId={id} reparations={reparations} refections={refections} referentiels={saisie!.ref}
                        existante={r} onFini={apresSaisie} onAnnuler={fermer} />
                    </CardContent>
                  </Card>
                );
              }
              const d = horsLigne ? null : droitsEtape("refection", r, contexteDroits);
              return (
                <Card key={r.id}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {r.resultat === "faite" ? "Réfection faite" : "Clôturée sans réfection"}
                      <EtatValidation valideeLe={r.validee_le} par={nomProfil(r.validee_par)} />
                    </CardTitle>
                    <CardDescription>{dateHeure(r.realisee_le)}{nomProfil(r.auteur_terrain_id) ? ` · ${nomProfil(r.auteur_terrain_id)}` : ""}</CardDescription>
                    {d && !formulaire && (d.valider || d.modifier) && (
                      <CardAction className="flex flex-wrap gap-2">
                        {d.valider && (
                          <BoutonValider element={{ etape: "refection", id: r.id, libelle: `Réfection du ${dateHeure(r.realisee_le)}`, nbPhotos: photosDe(`refection:${r.id}`) }}
                            onValide={charger} onErreur={setErreur} onAjouterPhoto={ajouterPhotoEtape} />
                        )}
                        {d.modifier && (
                          <Button size="sm" variant="outline" disabled={chargementSaisie} onClick={() => ouvrir({ type: "refection", id: r.id })}>
                            <Pencil data-icon="inline-start" />Modifier
                          </Button>
                        )}
                      </CardAction>
                    )}
                  </CardHeader>
                  <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                    {r.resultat === "faite" ? (
                      <>
                        <Info libelle="Nature" valeur={natureLibelle(r.nature_id)} />
                        <Info libelle="Surface" valeur={<>{nombre(r.longueur_m)} × {nombre(r.largeur_m)} m = <b>{nombre(r.surface_m2, 3)} m²</b></>} />
                      </>
                    ) : <Info libelle="Motif" valeur={motifLibelle(r.motif_id)} />}
                    {r.observation && <Info libelle="Observation" large valeur={r.observation} />}
                    {d && !d.modifier && d.raison && peut("refections", "modifier") && <p className="text-muted-foreground text-xs sm:col-span-2 xl:col-span-4">{d.raison}</p>}
                  </CardContent>
                </Card>
              );
            })}
            {formulaireOuvert("refection") && (
              <Card>
                <CardContent>
                  <FormRefection marcheId={marche!.id} fuiteId={id} reparations={reparations} refections={refections} referentiels={saisie!.ref}
                    onFini={apresSaisie} onAnnuler={fermer} />
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="photos" className="py-4">
          <Photos photos={photos} fuiteId={id} marcheId={marche!.id} etapes={etapesPhotos} etapeInitiale={etapePhoto} peutAjouter={actions.ajouterPhoto}
            horsLigne={!!horsLigne} moi={moi} peut={peut} onChange={charger} onErreur={setErreur} />
        </TabsContent>

        {quantites.length > 0 && (
          <TabsContent value="quantites" className="py-4">
            <Card>
              <CardHeader>
                <CardTitle>Quantités du bordereau</CardTitle>
                <CardDescription>{marche?.taux_majoration ? `Hors majoration de ${marche.taux_majoration} %. ` : ""}Montants HT au prix du bordereau.</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <Table className="[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Prix</TableHead><TableHead>Désignation</TableHead><TableHead>Quantité</TableHead>
                      <TableHead className="text-right">PU HT</TableHead><TableHead className="text-right">Montant HT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quantites.map((l) => <LigneQuantite key={l.id} ligne={l} modifiable={actions.modifierQuantites} onChange={charger} onErreur={setErreur} />)}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={4}>Total HT ({libelles.devise})</TableCell>
                      <TableCell className="text-right tabular-nums">{montant(totalHt)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="historique" className="py-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History className="size-4 text-muted-foreground" />Historique</CardTitle>
              <CardDescription>Déduit des dates de la fiche, le plus récent en premier.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col">
                {historique.map(([date, texte], i) => (
                  <li key={i} className={cn("grid grid-cols-[9rem_1fr] gap-3 py-2.5 text-sm", i < historique.length - 1 && "border-b")}>
                    <span className="flex items-center gap-2 text-muted-foreground tabular-nums"><CalendarDays className="size-3.5" />{dateHeure(date)}</span>
                    <span>{texte}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Compteur({ n }: { n: number }) {
  return <span className="ml-1 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{n}</span>;
}

/* ----------------------------------------------------------------------- */

function LigneQuantite({ ligne, modifiable, onChange, onErreur }: { ligne: QuantiteFiche; modifiable: boolean; onChange: () => void; onErreur: (m: string) => void }) {
  const [valeur, setValeur] = useState(String(ligne.quantite));
  useEffect(() => setValeur(String(ligne.quantite)), [ligne.quantite]);

  // Toute correction d'une ligne exige un motif (contrôle en base, gardé dans le journal).
  async function enregistrer() {
    const q = nombreOuNul(valeur);
    if (q == null || Number.isNaN(q) || q < 0 || q === ligne.quantite) return;
    const motif = window.prompt("Motif de la correction (obligatoire, gardé dans le journal) :");
    if (!motif?.trim()) {
      setValeur(String(ligne.quantite));
      return;
    }
    const { error } = await getSupabase().from("lignes_quantites").update({ quantite: q, motif_modification: motif.trim() }).eq("id", ligne.id);
    if (error) onErreur(messageErreur(error));
    onChange();
  }

  return (
    <TableRow className="hover:bg-transparent">
      <TableCell className="tabular-nums">{ligne.prix_numero}</TableCell>
      <TableCell className="max-w-80 whitespace-normal" title={ligne.prix_designation}>
        <span className="line-clamp-2">{ligne.prix_designation}</span>
        {ligne.origine_ligne === "manuel" && <Badge variant="outline" className="mt-1 rounded-sm">saisie manuelle</Badge>}
        {ligne.motif_correction && <span className="block text-muted-foreground text-xs">Motif : {ligne.motif_correction}</span>}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {modifiable ? (
          <span className="flex items-center gap-1.5">
            <Input className="h-7 w-24 text-right" value={valeur} onChange={(e) => setValeur(e.target.value)} onBlur={enregistrer} inputMode="decimal" aria-label="Quantité" />
            {ligne.unite}
          </span>
        ) : `${nombre(ligne.quantite, 3)} ${ligne.unite}`}
      </TableCell>
      <TableCell className="text-right tabular-nums">{montant(ligne.pu_ht)}</TableCell>
      <TableCell className="text-right tabular-nums">{montant(ligne.montant_ht_bordereau)}</TableCell>
    </TableRow>
  );
}

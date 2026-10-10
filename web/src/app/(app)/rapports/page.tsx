"use client";

// Rapports (chantier v3, J1 et J2 ; responsable et administrateur) : états journaliers et hebdomadaires pour le maître
// d'ouvrage. Pas de gabarit figé : période, rubriques et colonnes à cocher, filtres, A4 portrait ou paysage, PDF ou
// Excel, aperçu avant tirage ; dernier choix gardé par marché (modeles_export). Le rapport de recherche de fuites
// (gabarit STEPAG 2026, page Balayage) est proposé tel quel comme second modèle.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, FileSpreadsheet, FileText, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { BoutonEnvoyerEmail } from "@/components/envoyer-email";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChoixRubriques } from "@/lib/export/ChoixRubriques";
import type { Contexte } from "@/lib/export/jeux";
import { parcourir, telecharger, texteCellule, type DocumentExport } from "@/lib/export/modele";
import {
  PERIODES, RUBRIQUES_RAPPORT, ajouterJours, aujourdhui, bornesPeriode, choixParDefaut, colonnesRubrique, dernierChoixLocal,
  documentRapport, libellePeriode, memoriserChoixLocal, rubriquesVisibles, sectionsRapport, tableauxTropLarges, titreRapport,
  type ChoixRapport, type CleRubrique, type DonneesRapport, type FiltresRapport, type TypePeriode,
} from "@/lib/export/rapports";
import {
  chargerDonneesRapport, chargerListes, enregistrerModeleRapport, garderDernierChoix, lireModelesRapport, retirerModeleRapport,
  type Choix, type ModeleRapport, type Personne,
} from "@/lib/export/rapports-donnees";
import { dernierChoix as dernierChoixRubriques } from "@/lib/export/rubriques";
import { STATUTS, messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { StatutFuite } from "@/lib/types";
import type { ModeRapport } from "../balayage/rapport";

type Modele = "etat" | "balayage";
const APERCU = 8;
const jourLong = (t: string) => new Date(`${t}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default function PageRapports() {
  const { marche, profil, peut } = useSession();
  const marcheId = marche?.id;
  const autorise = peut("exports", "lire") && (!!profil?.est_admin || peut("fuites", "valider"));
  const peutEnregistrer = peut("exports", "creer");
  const droits = useMemo(() => ({ balayage: peut("balayage", "lire"), mesures_debit: peut("mesures_debit", "lire"), quantites: peut("quantites", "lire") }), [peut]);

  const [modele, setModele] = useState<Modele>("etat");
  const [choix, setChoix] = useState<ChoixRapport>(choixParDefaut);
  const [reference, setReference] = useState(aujourdhui);
  const [listes, setListes] = useState<{ zones: Choix[]; secteurs: (Choix & { zone_id: string | null })[]; personnes: Personne[] } | null>(null);
  const [ctx, setCtx] = useState<Contexte | null>(null);
  const [modeles, setModeles] = useState<ModeleRapport[]>([]);
  const [modeleId, setModeleId] = useState("");
  const dernierId = useRef<string | null>(null);
  const [donnees, setDonnees] = useState<DonneesRapport | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState("");
  const [apercuPdf, setApercuPdf] = useState<string | null>(null);
  const derniere = useRef(0);

  const periode = useMemo(() => bornesPeriode(choix.periode, reference, choix.du, choix.au), [choix.periode, choix.du, choix.au, reference]);
  const changer = (partie: Partial<ChoixRapport>) => { setChoix((c) => ({ ...c, ...partie })); setModeleId(""); };
  const changerFiltres = (partie: Partial<FiltresRapport>) => setChoix((c) => {
    const filtres = { ...c.filtres, ...partie };
    (Object.keys(filtres) as (keyof FiltresRapport)[]).forEach((k) => { if (!filtres[k]) delete filtres[k]; });
    return { ...c, filtres };
  });

  // Marché ouvert : listes des filtres, en-tête du document, modèles et dernier choix (base, sinon appareil).
  useEffect(() => {
    if (!marcheId || !autorise) return;
    let annule = false;
    setListes(null);
    setCtx(null);
    (async () => {
      try {
        const [{ chargerContexteRapport }, l, m] = await Promise.all([
          import("@/lib/export/rapport-fuite"), chargerListes(marcheId), lireModelesRapport(marcheId).catch(() => ({ modeles: [], dernier: null })),
        ]);
        const contexte = await chargerContexteRapport(marcheId, droits.quantites);
        if (annule) return;
        setListes(l);
        setCtx(contexte);
        setModeles(m.modeles);
        dernierId.current = m.dernier?.id ?? null;
        setChoix(m.dernier?.choix ?? dernierChoixLocal(marcheId) ?? choixParDefaut());
        setModeleId("");
      } catch (e) {
        if (!annule) setErreur(messageErreur(e));
      }
    })();
    return () => { annule = true; };
  }, [marcheId, autorise, droits.quantites]);

  const charger = useCallback(async () => {
    if (!marcheId || !autorise) return;
    const n = ++derniere.current;
    setChargement(true);
    setErreur("");
    try {
      const d = await chargerDonneesRapport(marcheId, periode, droits);
      if (n === derniere.current) setDonnees(d);
    } catch (e) {
      if (n === derniere.current) setErreur(messageErreur(e));
    }
    if (n === derniere.current) setChargement(false);
  }, [marcheId, autorise, periode, droits]);
  useEffect(() => { setDonnees(null); charger(); }, [charger]);

  const sections = useMemo(
    () => (donnees ? sectionsRapport(donnees, choix, { droits, marche: ctx?.marche, decimales: ctx?.regles?.decimales }) : null),
    [donnees, choix, droits, ctx],
  );
  const tropLarges = useMemo(() => (sections && choix.format === "pdf" ? tableauxTropLarges(sections, choix.orientation) : []), [sections, choix.format, choix.orientation]);

  const noms = useMemo(() => {
    const p = listes?.personnes.find((x) => x.id === choix.filtres.personne);
    return {
      zone: listes?.zones.find((x) => x.id === choix.filtres.zone)?.libelle,
      secteur: listes?.secteurs.find((x) => x.id === choix.filtres.secteur)?.libelle,
      personne: p ? p.matricule ?? p.libelle : undefined, // R4 : le matricule dans le document
    };
  }, [listes, choix.filtres]);

  function document(): DocumentExport | null {
    if (!donnees || !ctx) return null;
    return documentRapport(donnees, choix, ctx, periode, { droits, noms });
  }

  async function garder() {
    if (!marcheId) return;
    memoriserChoixLocal(marcheId, choix);
    if (peutEnregistrer) dernierId.current = await garderDernierChoix(marcheId, choix, dernierId.current).catch(() => dernierId.current);
  }

  async function apercu() {
    const d = document();
    if (!d) return;
    setOccupe("Aperçu…");
    try {
      const { genererPdf } = await import("@/lib/export/pdf");
      const blob = await genererPdf(d);
      setApercuPdf(URL.createObjectURL(blob));
      garder();
    } catch (e) {
      toast.error(messageErreur(e));
    }
    setOccupe("");
  }
  useEffect(() => () => { if (apercuPdf) URL.revokeObjectURL(apercuPdf); }, [apercuPdf]);

  // Fichier du rapport, séparé du téléchargement : l'envoi par e-mail (S18, `fabriquer` de BoutonEnvoyerEmail) le reprend.
  async function fabriquer(): Promise<{ blob: Blob; nom: string }> {
    const d = document();
    if (!d) throw new Error("Rapport pas encore prêt.");
    const blob = choix.format === "pdf"
      ? await (await import("@/lib/export/pdf")).genererPdf(d)
      : await (await import("@/lib/export/xlsx")).genererXlsx(d);
    return { blob, nom: `${d.nomFichier}.${choix.format}` };
  }

  async function tirer() {
    setOccupe("Préparation du fichier…");
    try {
      const { blob, nom } = await fabriquer();
      telecharger(blob, nom);
      await garder();
    } catch (e) {
      toast.error(messageErreur(e));
    }
    setOccupe("");
  }

  async function enregistrer(remplacer: boolean) {
    if (!marcheId) return;
    const courant = modeles.find((m) => m.id === modeleId);
    const nom = remplacer && courant ? courant.nom : window.prompt("Nom du modèle (ex. « État journalier SRM ») :")?.trim();
    if (!nom) return;
    try {
      await enregistrerModeleRapport(marcheId, nom, choix, remplacer ? courant?.id : undefined);
      const m = await lireModelesRapport(marcheId);
      setModeles(m.modeles);
      setModeleId(m.modeles.find((x) => x.nom === nom)?.id ?? "");
      toast.success(remplacer ? `Modèle « ${nom} » mis à jour.` : `Modèle « ${nom} » enregistré pour ce marché.`);
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  async function retirer() {
    const courant = modeles.find((m) => m.id === modeleId);
    if (!courant || !window.confirm(`Retirer le modèle « ${courant.nom} » ?`)) return;
    try {
      await retirerModeleRapport(courant.id);
      setModeles((l) => l.filter((x) => x.id !== courant.id));
      setModeleId("");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  if (!marche) return null;
  if (!autorise) return <Vide>Les rapports sont réservés au responsable et à l&apos;administrateur (droit « Exports : voir »).</Vide>;

  const decaler = (sens: number) => setReference((r) => ajouterJours(bornesPeriode(choix.periode, r).du, sens * (choix.periode === "semaine" ? 7 : 1)));
  const visibles = rubriquesVisibles(droits);

  return (
    <div className="flex flex-col gap-4">
      <EnTetePage
        titre="Rapports"
        description="États journaliers et hebdomadaires pour le maître d'ouvrage : rubriques et colonnes à cocher, filtres, A4 portrait ou paysage, PDF ou Excel."
        actions={<Button variant="outline" onClick={charger} disabled={chargement}><RefreshCw data-icon="inline-start" className={chargement ? "animate-spin" : ""} />Actualiser</Button>}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader><CardTitle>Modèle</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ToggleGroup type="single" variant="outline" spacing={0} value={modele} onValueChange={(v) => v && setModele(v as Modele)} className="w-full *:flex-1" aria-label="Modèle de rapport">
                <ToggleGroupItem value="etat">État à composer</ToggleGroupItem>
                {droits.balayage && <ToggleGroupItem value="balayage">Recherche de fuites</ToggleGroupItem>}
              </ToggleGroup>
              {modele === "etat" ? (
                <div className="flex flex-wrap items-center gap-2">
                  {modeles.length > 0 && (
                    <NativeSelect size="sm" value={modeleId} aria-label="Modèle enregistré" onChange={(e) => {
                      const m = modeles.find((x) => x.id === e.target.value);
                      setModeleId(e.target.value);
                      if (m) setChoix(m.choix);
                    }}>
                      <NativeSelectOption value="">Modèle du marché…</NativeSelectOption>
                      {modeles.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.nom}</NativeSelectOption>)}
                    </NativeSelect>
                  )}
                  {peutEnregistrer && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => enregistrer(false)}><Save data-icon="inline-start" />Enregistrer comme modèle</Button>
                      {modeleId && <Button size="sm" variant="outline" onClick={() => enregistrer(true)}>Mettre à jour</Button>}
                      {modeleId && <Button size="sm" variant="ghost" className="text-destructive" onClick={retirer}><Trash2 data-icon="inline-start" />Retirer</Button>}
                    </>
                  )}
                  <p className="w-full text-muted-foreground text-xs">Le dernier choix est gardé pour ce marché et repris à la prochaine ouverture.</p>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">Rapport journalier de recherche de fuites, gabarit STEPAG 2026 (le même que la page Balayage) : linéaire inspecté, fuites détectées, extrait de plan.</p>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader><CardTitle>Période</CardTitle><CardDescription>{libellePeriode(periode)}</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <ToggleGroup type="single" variant="outline" spacing={0} value={choix.periode} className="w-full *:flex-1" aria-label="Période"
                onValueChange={(v) => v && changer({ periode: v as TypePeriode, ...(v === "libre" ? { du: periode.du, au: periode.au } : { du: undefined, au: undefined }) })}>
                {(Object.keys(PERIODES) as TypePeriode[]).map((k) => <ToggleGroupItem key={k} value={k}>{PERIODES[k]}</ToggleGroupItem>)}
              </ToggleGroup>
              {choix.periode === "libre" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field className="gap-1.5"><FieldLabel htmlFor="rapport-du">Du</FieldLabel>
                    <Input id="rapport-du" type="date" value={periode.du} onChange={(e) => e.target.value && changer({ du: e.target.value })} /></Field>
                  <Field className="gap-1.5"><FieldLabel htmlFor="rapport-au">Au</FieldLabel>
                    <Input id="rapport-au" type="date" value={periode.au} onChange={(e) => e.target.value && changer({ au: e.target.value })} /></Field>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" aria-label={choix.periode === "semaine" ? "Semaine précédente" : "Jour précédent"} onClick={() => decaler(-1)}><ChevronLeft /></Button>
                  <Input type="date" aria-label={choix.periode === "semaine" ? "Un jour de la semaine" : "Jour"} value={reference} onChange={(e) => e.target.value && setReference(e.target.value)} />
                  <Button size="icon" variant="outline" aria-label={choix.periode === "semaine" ? "Semaine suivante" : "Jour suivant"} onClick={() => decaler(1)}><ChevronRight /></Button>
                </div>
              )}
              {choix.periode === "semaine" && <p className="text-muted-foreground text-xs">Du {jourLong(periode.du)} au {jourLong(periode.au)}.</p>}
            </CardContent>
          </Card>

          {modele === "etat" && (
            <>
              <Card size="sm">
                <CardHeader><CardTitle>Filtres</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-3">
                  <Field className="gap-1.5"><FieldLabel htmlFor="filtre-zone">Zone</FieldLabel>
                    <NativeSelect id="filtre-zone" value={choix.filtres.zone ?? ""} onChange={(e) => changerFiltres({ zone: e.target.value || undefined, secteur: undefined })}>
                      <NativeSelectOption value="">Toutes</NativeSelectOption>
                      {listes?.zones.map((z) => <NativeSelectOption key={z.id} value={z.id}>{z.libelle}</NativeSelectOption>)}
                    </NativeSelect></Field>
                  <Field className="gap-1.5"><FieldLabel htmlFor="filtre-secteur">Secteur</FieldLabel>
                    <NativeSelect id="filtre-secteur" value={choix.filtres.secteur ?? ""} onChange={(e) => changerFiltres({ secteur: e.target.value || undefined })}>
                      <NativeSelectOption value="">Tous</NativeSelectOption>
                      {listes?.secteurs.filter((s) => !choix.filtres.zone || s.zone_id === choix.filtres.zone)
                        .map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.libelle}</NativeSelectOption>)}
                    </NativeSelect></Field>
                  <Field className="gap-1.5"><FieldLabel htmlFor="filtre-statut">Statut de la fuite</FieldLabel>
                    <NativeSelect id="filtre-statut" value={choix.filtres.statut ?? ""} onChange={(e) => changerFiltres({ statut: (e.target.value || undefined) as StatutFuite | undefined })}>
                      <NativeSelectOption value="">Tous</NativeSelectOption>
                      {(Object.keys(STATUTS) as StatutFuite[]).map((s) => <NativeSelectOption key={s} value={s}>{STATUTS[s].libelle}</NativeSelectOption>)}
                    </NativeSelect></Field>
                  <Field className="gap-1.5"><FieldLabel htmlFor="filtre-personne">Chef d&apos;équipe ou agent</FieldLabel>
                    <NativeSelect id="filtre-personne" value={choix.filtres.personne ?? ""} onChange={(e) => changerFiltres({ personne: e.target.value || undefined })}>
                      <NativeSelectOption value="">Tous</NativeSelectOption>
                      {listes?.personnes.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.libelle}{p.matricule ? ` (${p.matricule})` : ""}</NativeSelectOption>)}
                    </NativeSelect></Field>
                  <label className="col-span-2 flex items-center gap-2 text-sm">
                    <Checkbox checked={!!choix.filtres.validees} onCheckedChange={(v) => changerFiltres({ validees: v === true || undefined })} />
                    Saisies validées seulement <span className="text-muted-foreground text-xs">(détection, réparation, réfection)</span>
                  </label>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader><CardTitle>Rubriques et colonnes</CardTitle><CardDescription>Cochez les rubriques ; « Colonnes » choisit ce que chaque tableau imprime.</CardDescription></CardHeader>
                <CardContent className="flex flex-col gap-1">
                  {visibles.map((r) => (
                    <LigneRubrique key={r.cle} cle={r.cle} choix={choix} droits={droits} marche={ctx?.marche}
                      changer={(partie) => changer(partie)} />
                  ))}
                  <div className="flex gap-3 pt-1 text-xs">
                    <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => changer({ rubriques: visibles.map((r) => r.cle) })}>Tout</button>
                    <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => changer({ rubriques: [] })}>Rien</button>
                    <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => changer({ rubriques: choixParDefaut().rubriques, colonnes: choixParDefaut().colonnes })}>Colonnes par défaut</button>
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader><CardTitle>Mise en page</CardTitle></CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field className="gap-1.5"><FieldLabel>Orientation (A4)</FieldLabel>
                      <ToggleGroup type="single" variant="outline" spacing={0} value={choix.orientation} onValueChange={(v) => v && changer({ orientation: v as ChoixRapport["orientation"] })} className="w-full *:flex-1">
                        <ToggleGroupItem value="portrait">Portrait</ToggleGroupItem>
                        <ToggleGroupItem value="paysage">Paysage</ToggleGroupItem>
                      </ToggleGroup></Field>
                    <Field className="gap-1.5"><FieldLabel>Sortie</FieldLabel>
                      <ToggleGroup type="single" variant="outline" spacing={0} value={choix.format} onValueChange={(v) => v && changer({ format: v as ChoixRapport["format"] })} className="w-full *:flex-1">
                        <ToggleGroupItem value="pdf">PDF</ToggleGroupItem>
                        <ToggleGroupItem value="xlsx">Excel</ToggleGroupItem>
                      </ToggleGroup></Field>
                  </div>
                  <Field className="gap-1.5"><FieldLabel htmlFor="rapport-titre">Titre</FieldLabel>
                    <Input id="rapport-titre" maxLength={140} placeholder={titreRapport(choix.periode, periode)} value={choix.titre ?? ""}
                      onChange={(e) => changer({ titre: e.target.value || undefined })} /></Field>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={choix.visas} onCheckedChange={(v) => changer({ visas: v === true })} />
                    Cadres de visa en fin de document
                  </label>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {modele === "balayage" ? (
          <RapportBalayage marcheId={marche.id} periode={periode} secteurs={listes?.secteurs ?? []} personnes={listes?.personnes ?? []} peutEnregistrer={peutEnregistrer} />
        ) : (
          <Card size="sm" className="lg:sticky lg:top-20">
            <CardHeader>
              <CardTitle>Aperçu</CardTitle>
              <CardDescription>{choix.titre?.trim() || titreRapport(choix.periode, periode)} · A4 {choix.orientation} · {choix.format === "pdf" ? "PDF" : "Excel (une feuille par tableau)"}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={!sections || !ctx || !!occupe || !sections.length} onClick={apercu}>
                  {occupe === "Aperçu…" ? <Spinner /> : <Eye data-icon="inline-start" />}Aperçu avant tirage
                </Button>
                <Button disabled={!sections || !ctx || !!occupe || !sections.length} onClick={tirer}>
                  {occupe && occupe !== "Aperçu…" ? <Spinner /> : choix.format === "pdf" ? <FileText data-icon="inline-start" /> : <FileSpreadsheet data-icon="inline-start" />}
                  Télécharger ({choix.format === "pdf" ? "PDF" : "Excel"})
                </Button>
                <BoutonEnvoyerEmail document="rapport" reference={choix.titre?.trim() || titreRapport(choix.periode, periode)}
                  fabriquer={fabriquer} disabled={!sections || !ctx || !!occupe || !sections.length} />
              </div>
              {tropLarges.length > 0 && (
                <Alert><AlertTitle>Tableaux chargés pour une page en {choix.orientation}</AlertTitle>
                  <AlertDescription>{tropLarges.join(", ")} : passez en paysage ou décochez des colonnes, sinon le texte sera serré.</AlertDescription></Alert>
              )}
              {erreur ? (
                <Alert variant="destructive"><AlertTitle>Chargement impossible</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>
              ) : !sections ? (
                <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
              ) : sections.length === 0 ? (
                <Vide>Cochez au moins une rubrique et une colonne.</Vide>
              ) : (
                sections.map((s, k) => {
                  let vues = 0;
                  const lignes = [...parcourir(s)].filter(({ ligne }) => (ligne.type === "donnees" ? vues++ < APERCU : ligne.type !== "sous_total"));
                  const donneesN = s.lignes.filter((l) => l.type === "donnees").length;
                  return (
                    <section key={k} className="flex flex-col gap-1.5" data-slot="apercu-rubrique">
                      <h3 className="flex items-center gap-2 font-medium text-sm">{s.titre}<Badge variant="secondary">{donneesN} ligne{donneesN > 1 ? "s" : ""}</Badge></h3>
                      <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/60"><tr>{s.colonnes.map((c, i) => <th key={i} className="whitespace-nowrap px-2 py-1 text-left font-medium">{c.titre}</th>)}</tr></thead>
                          <tbody>
                            {lignes.map(({ ligne, indexDonnees }, j) => (
                                <tr key={j} className={ligne.type === "donnees" ? "border-t" : "border-t bg-muted/40 font-medium"}>
                                  {ligne.type === "groupe"
                                    ? <td colSpan={s.colonnes.length} className="px-2 py-1 text-muted-foreground">{ligne.libelle}</td>
                                    : s.colonnes.map((_, i) => <td key={i} className="whitespace-nowrap px-2 py-1">{i === 0 && ligne.libelle ? ligne.libelle : texteCellule(s, ligne, i, indexDonnees)}</td>)}
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                      {donneesN > APERCU && <p className="text-muted-foreground text-xs">{APERCU} premières lignes sur {donneesN} (toutes dans le document).</p>}
                    </section>
                  );
                })
              )}
              <p className="text-muted-foreground text-xs">Dans le document, les agents et chefs d&apos;équipe sont désignés par leur matricule.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!apercuPdf} onOpenChange={(o) => { if (!o) setApercuPdf(null); }}>
        <DialogContent className="flex h-[90vh] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Aperçu avant tirage</DialogTitle>
            <DialogDescription>Le PDF tel qu&apos;il sera imprimé (A4 {choix.orientation}). Imprimez ou téléchargez depuis la barre de l&apos;aperçu.</DialogDescription>
          </DialogHeader>
          {apercuPdf && <iframe title="Aperçu du rapport" src={`${apercuPdf}#view=FitH`} className="min-h-0 w-full flex-1 rounded-md border" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Une rubrique : case à cocher, et ses colonnes (par tableau) dans un volet repliable. */
function LigneRubrique({ cle, choix, droits, marche, changer }: {
  cle: CleRubrique; choix: ChoixRapport; droits: { quantites?: boolean; balayage?: boolean; mesures_debit?: boolean }; marche?: unknown;
  changer: (partie: Partial<ChoixRapport>) => void;
}) {
  const r = RUBRIQUES_RAPPORT.find((x) => x.cle === cle)!;
  const coche = choix.rubriques.includes(cle);
  const tableaux = colonnesRubrique(cle, droits, marche);
  const toutes = tableaux.flatMap((t) => t.colonnes.map((c) => c.cle));
  const voulues = new Set(choix.colonnes[cle] ?? []);
  const n = toutes.filter((k) => voulues.has(k)).length;
  const poser = (cles: string[], oui: boolean) => {
    const s = new Set(voulues);
    cles.forEach((k) => (oui ? s.add(k) : s.delete(k)));
    changer({ colonnes: { ...choix.colonnes, [cle]: toutes.filter((k) => s.has(k)) } });
  };
  const basculer = (oui: boolean) =>
    changer({ rubriques: RUBRIQUES_RAPPORT.map((x) => x.cle).filter((k) => (k === cle ? oui : choix.rubriques.includes(k))) });

  return (
    <Collapsible className="rounded-md px-1 py-1 hover:bg-muted/40" data-slot="rubrique-rapport">
      <div className="flex items-start gap-2">
        <Checkbox checked={coche} onCheckedChange={(v) => basculer(v === true)} className="mt-0.5" aria-label={r.libelle} />
        <div className="min-w-0 flex-1 text-sm leading-tight">
          {r.libelle}
          <span className="block text-muted-foreground text-xs">{r.aide}</span>
        </div>
        <CollapsibleTrigger asChild>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={!coche}>Colonnes ({n}/{toutes.length})</Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-2 ml-6 flex flex-col gap-2 border-l pl-3">
        {tableaux.map(({ tableau, colonnes }) => (
          <div key={tableau.cle} className="flex flex-col gap-1">
            {tableaux.length > 1 && (
              <label className="flex items-center gap-2 font-medium text-xs">
                <Checkbox checked={colonnes.every((c) => voulues.has(c.cle))} onCheckedChange={(v) => poser(colonnes.map((c) => c.cle), v === true)} />
                {colonnes[0]?.groupe ?? tableau.titre}
              </label>
            )}
            <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
              {colonnes.map((c) => (
                <label key={c.cle} className="flex items-center gap-2 text-xs">
                  <Checkbox checked={voulues.has(c.cle)} onCheckedChange={(v) => poser([c.cle], v === true)} />{c.titre}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-3 text-xs">
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => poser(toutes, true)}>Toutes</button>
          <button type="button" className="text-primary underline-offset-2 hover:underline" onClick={() => poser(toutes, false)}>Aucune</button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** J2 : rapport de recherche de fuites (gabarit STEPAG 2026), tel que la page Balayage le produit. */
function RapportBalayage({ marcheId, periode, secteurs, personnes, peutEnregistrer }: {
  marcheId: string; periode: { du: string; au: string }; secteurs: Choix[]; personnes: Personne[]; peutEnregistrer: boolean;
}) {
  const [rubriques, setRubriques] = useState<Set<string>>(() => dernierChoixRubriques("rapport_balayage", marcheId));
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [mode, setMode] = useState<ModeRapport>("jour");
  const [agent, setAgent] = useState("");
  const [secteur, setSecteur] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [info, setInfo] = useState("");
  const [erreur, setErreur] = useState("");

  async function lancer() {
    setOccupe(true);
    setErreur("");
    setInfo("");
    try {
      const { telechargerRapportBalayage } = await import("../balayage/rapport");
      const r = await telechargerRapportBalayage(marcheId, periode, format, periode.du === periode.au ? mode : "jour", rubriques, { agent: agent || undefined, secteur: secteur || undefined });
      setInfo(`${r.fichiers} fichier${r.fichiers > 1 ? "s" : ""} téléchargé${r.fichiers > 1 ? "s" : ""}.${r.nonAttribuees ? ` ${r.nonAttribuees} fuite(s) sans agent du jour, absente(s) des rapports par agent.` : ""}`);
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setOccupe(false);
  }

  return (
    <Card size="sm" className="lg:sticky lg:top-20">
      <CardHeader><CardTitle>Rapport de recherche de fuites</CardTitle><CardDescription>Gabarit STEPAG 2026, inchangé.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field className="gap-1.5"><FieldLabel htmlFor="j2-agent">Agent</FieldLabel>
            <NativeSelect id="j2-agent" value={agent} onChange={(e) => setAgent(e.target.value)}>
              <NativeSelectOption value="">Tous</NativeSelectOption>
              {personnes.map((p) => <NativeSelectOption key={p.id} value={p.id}>{p.libelle}</NativeSelectOption>)}
            </NativeSelect></Field>
          <Field className="gap-1.5"><FieldLabel htmlFor="j2-secteur">Secteur</FieldLabel>
            <NativeSelect id="j2-secteur" value={secteur} onChange={(e) => setSecteur(e.target.value)}>
              <NativeSelectOption value="">Tous</NativeSelectOption>
              {secteurs.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.libelle}</NativeSelectOption>)}
            </NativeSelect></Field>
          <Field className="gap-1.5"><FieldLabel>Sortie</FieldLabel>
            <ToggleGroup type="single" variant="outline" spacing={0} value={format} onValueChange={(v) => v && setFormat(v as "pdf" | "xlsx")} className="w-full *:flex-1">
              <ToggleGroupItem value="pdf">PDF</ToggleGroupItem>
              <ToggleGroupItem value="xlsx">Excel</ToggleGroupItem>
            </ToggleGroup></Field>
          {periode.du === periode.au && (
            <Field className="gap-1.5"><FieldLabel>Un rapport</FieldLabel>
              <ToggleGroup type="single" variant="outline" spacing={0} value={mode} onValueChange={(v) => v && setMode(v as ModeRapport)} className="w-full *:flex-1">
                <ToggleGroupItem value="jour">Pour la journée</ToggleGroupItem>
                <ToggleGroupItem value="agent">Par agent</ToggleGroupItem>
              </ToggleGroup></Field>
          )}
        </div>
        <ChoixRubriques document="rapport_balayage" marcheId={marcheId} valeur={rubriques} changer={setRubriques} peutEnregistrer={peutEnregistrer} desactive={occupe} />
        <Button disabled={occupe} onClick={lancer}>{occupe ? <Spinner /> : <FileText data-icon="inline-start" />}{occupe ? "Préparation…" : `Télécharger (${format === "pdf" ? "PDF" : "Excel"})`}</Button>
        {erreur && <Alert variant="destructive"><AlertDescription>{erreur}</AlertDescription></Alert>}
        {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
      </CardContent>
    </Card>
  );
}

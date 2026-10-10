"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCoreRowModel, getPaginationRowModel, getSortedRowModel, type PaginationState, type RowSelectionState, type SortingState,
  useReactTable, type VisibilityState,
} from "@tanstack/react-table";
import {
  CalendarDays, CircleDot, Clock3, Download, Droplets, FileText, Map as IconeZone, MapPin, Plus, RefreshCw, Rows3, Search, Siren, SquareKanban, Wrench, X,
} from "lucide-react";
import { AvertissementPlafond } from "@/components/avertissement-plafond";
import { CarteIndicateur, GrilleIndicateurs } from "@/components/carte-indicateur";
import { EnTetePage } from "@/components/en-tete-page";
import { ORDRE_STATUTS, PointStatut, STATUT_STYLE } from "@/components/statut";
import { BasculeColonnes, FiltreFacettes } from "@/components/tableau/outils-tableau";
import { PaginationTableau } from "@/components/tableau/pagination-tableau";
import { TableauDonnees } from "@/components/tableau/tableau-donnees";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { COLONNES_LISTE, compterFuites, type FuiteListe } from "@/lib/colonnes-fuites";
import { useFuitesAnticipees } from "@/lib/anticipation";
import { JEU_FUITES, JEU_PIECES, JEU_QUANTITES } from "@/lib/export/jeux";
import { ChoixRubriques } from "@/lib/export/ChoixRubriques";
import { PanneauExport } from "@/lib/export/PanneauExport";
import { dernierChoix } from "@/lib/export/rubriques";
import { libellesMarche, messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { getSupabase, lireTout, type Lignes } from "@/lib/supabase";
import type { Secteur, StatutFuite } from "@/lib/types";
import { delaiReparation, fuitesDuMois, nonReparees, refectionsAFaire } from "@/lib/ui/indicateurs";
import { LIBELLES_COLONNES, colonnesFuites } from "./colonnes";
import {
  CLES_ALERTES, LIBELLES_ALERTES, correspondance, decrirePeriode, ecrireFiltres, filtresActifs, type CleAlerte, type FuiteFiltrable,
} from "./filtres";
import { useFiltresAdresse } from "./useFiltresAdresse";
import { VueCartes } from "./vue-cartes";
import { VueKanban } from "./vue-kanban";

// useSearchParams demande une frontière Suspense (page rendue côté navigateur).
export default function PageFuites() {
  return (
    <Suspense fallback={<p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>}>
      <ListeFuites />
    </Suspense>
  );
}

function ListeFuites() {
  const { marche, peut } = useSession();
  const router = useRouter();
  const libelles = libellesMarche(marche);
  const [fuites, setFuites] = useState<Lignes<FuiteListe>>([]);
  const [comptes, setComptes] = useState<Partial<Record<StatutFuite, number>> | null>(null);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [zones, setZones] = useState<{ id: string; libelle: string }[]>([]);
  const [secteursDe, setSecteursDe] = useState<string | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const { filtres, changer, effacer } = useFiltresAdresse();
  const { statuts, zone, secteur, texte, alertes: alertesSeules, alerte } = filtres;
  const [vue, setVue] = useState<"liste" | "kanban">("liste");

  const marcheId = marche?.id;
  const derniereDemande = useRef(0);
  const charger = useCallback(async () => {
    if (!marcheId) return;
    const demande = ++derniereDemande.current;
    setChargement(true);
    setErreur("");
    const sb = getSupabase();
    const [f, s, z, c] = await Promise.all([
      lireTout<FuiteListe>((de, a) => sb.from("v_fuites").select(COLONNES_LISTE).eq("marche_id", marcheId).order("numero", { ascending: false })
        .range(de, a) as unknown as PromiseLike<{ data: FuiteListe[] | null; error: { message: string } | null }>, 1000, 10000)
        .then((data) => ({ data, error: null }), (error: { message: string }) => ({ data: null, error })),
      sb.from("secteurs").select("id, zone_id, code, libelle").eq("marche_id", marcheId).order("libelle"),
      sb.from("zones").select("id, libelle").eq("marche_id", marcheId).order("numero"),
      compterFuites(marcheId).catch(() => null),
    ]);
    if (demande !== derniereDemande.current) return;
    if (f.error) setErreur(messageErreur(f.error));
    setFuites(f.data ?? []);
    setComptes(c && Object.fromEntries(c.map((l) => [l.statut, l.nb])));
    setSecteurs((s.data as Secteur[] | null) ?? []);
    setZones((z.data as { id: string; libelle: string }[] | null) ?? []);
    setSecteursDe(s.error || z.error ? null : marcheId);
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  useEffect(() => {
    if (secteursDe !== marcheId) return;
    if (zone && !zones.some((z) => z.id === zone)) changer({ zone: "" });
    else if (secteur && !secteurs.some((s) => s.id === secteur)) changer({ secteur: "" });
  }, [secteursDe, marcheId, zone, zones, secteur, secteurs, changer]);

  const correspond = useMemo(() => correspondance(filtres), [filtres]);
  const filtrees = useMemo(() => fuites.filter(correspond), [fuites, correspond]);
  const [exportOuvert, setExportOuvert] = useState(false);
  const [rapports, setRapports] = useState<{ fait: number; total: number; etape: string; enCours: boolean } | null>(null);

  // Tableau (tri, sélection, colonnes, pages)
  const [sorting, setSorting] = useState<SortingState>([{ id: "numero", desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 20 });
  const peutRapport = peut("exports", "lire");

  // Rapports PDF : rubriques à cocher d'abord (dialogue), puis fabrication.
  const [aImprimer, setAImprimer] = useState<FuiteListe[] | null>(null);
  const [rubriques, setRubriques] = useState<Set<string>>(new Set());
  function demanderRapports(cibles: FuiteListe[]) {
    if (!marcheId || !cibles.length) return;
    setRubriques(dernierChoix("rapport_fuite", marcheId));
    setAImprimer(cibles);
  }

  async function rapportsPdf(cibles: FuiteListe[]) {
    if (!marcheId || !cibles.length) return;
    setAImprimer(null);
    setErreur("");
    setRapports({ fait: 0, total: 1, etape: "Chargement des données", enCours: true });
    try {
      const { telechargerRapports } = await import("@/lib/export/rapport-fuite");
      const r = await telechargerRapports(cibles.map((f) => f.id), marcheId, peut("quantites", "lire"),
        (fait, total, etape) => setRapports({ fait, total, etape, enCours: true }), rubriques);
      setRapports({ fait: 1, total: 1, enCours: false,
        etape: `${r.fuites} rapport${r.fuites > 1 ? "s" : ""} téléchargé${r.fuites > 1 ? "s" : ""} (${(r.octets / 1048576).toFixed(1)} Mo, ${r.secondes.toFixed(0)} s)` });
    } catch (e) {
      setRapports(null);
      setErreur(messageErreur(e));
    }
  }

  const { parFuite: anticipees } = useFuitesAnticipees(marcheId);
  const colonnes = useMemo(() => colonnesFuites(libelles, { peutRapport, rapport: (f) => demanderRapports([f]) }, anticipees),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libelles.reference, libelles.sigle, libelles.delaiReparationH, peutRapport, marcheId, anticipees]);

  const table = useReactTable({
    data: filtrees,
    columns: colonnes,
    state: { sorting, rowSelection, columnVisibility, pagination },
    getRowId: (r) => r.id,
    enableRowSelection: true,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  const cleFiltres = ecrireFiltres(filtres);
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [cleFiltres]);

  const selection = table.getSelectedRowModel().rows.map((r) => r.original);
  const ciblesRapports = selection.length ? selection : filtrees;

  const descriptionListe = [
    statuts.map((s) => STATUT_STYLE[s].libelle).join(" ou "),
    zone && zones.find((z) => z.id === zone)?.libelle,
    secteur && secteurs.find((s) => s.id === secteur)?.libelle,
    decrirePeriode(filtres),
    texte.trim() && `recherche « ${texte.trim()} »`,
    alertesSeules && "alertes seulement",
    alerte && `alerte « ${LIBELLES_ALERTES[alerte].toLowerCase()} »`,
  ].filter(Boolean).join(", ");

  // Comptes de la base (exacts même au-delà du plafond de lecture), sinon ceux des lignes chargées.
  const compteurs = useMemo(() => {
    if (comptes) return comptes;
    const c: Partial<Record<StatutFuite, number>> = {};
    fuites.forEach((f) => (c[f.statut] = (c[f.statut] ?? 0) + 1));
    return c;
  }, [fuites, comptes]);
  const total = comptes ? Object.values(comptes).reduce((t, n) => t + (n ?? 0), 0) : fuites.length;
  const incomplet = !erreur && (!!fuites.tronque || total > fuites.length);
  const compteursSecteurs = useMemo(() => {
    const c: Record<string, number> = {};
    fuites.forEach((f) => {
      if (f.secteur_id) c[f.secteur_id] = (c[f.secteur_id] ?? 0) + 1;
      if (f.zone_id) c[f.zone_id] = (c[f.zone_id] ?? 0) + 1;
      if (CLES_ALERTES.some((k) => f[k])) c.toutes = (c.toutes ?? 0) + 1;
      CLES_ALERTES.forEach((k) => { if (f[k]) c[k] = (c[k] ?? 0) + 1; });
    });
    return c;
  }, [fuites]);
  const secteursProposes = zone ? secteurs.filter((s) => s.zone_id === zone) : secteurs;
  const choixAlerte = alerte ? [alerte] : alertesSeules ? ["toutes"] : [];
  const choisirAlerte = (v: string | undefined) =>
    changer(v === "toutes" ? { alertes: true, alerte: "" } : { alertes: false, alerte: (v ?? "") as CleAlerte | "" });

  const ind = useMemo(() => ({
    mois: fuitesDuMois(fuites),
    retard: nonReparees(fuites, libelles.delaiReparationH),
    delai: delaiReparation(fuites),
    refections: refectionsAFaire(fuites),
    horsDelai: fuites.some((f) => f.refection_chaussee_hors_delai),
  }), [fuites, libelles.delaiReparationH]);

  return (
    <div className="flex flex-col gap-4">
      <EnTetePage
        titre="Fuites"
        description={`${filtrees.length.toLocaleString("fr-FR")} affichée${filtrees.length > 1 ? "s" : ""} sur ${total.toLocaleString("fr-FR")} · ${marche?.code ?? ""}${descriptionListe ? ` · ${descriptionListe}` : ""}`}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={charger} disabled={chargement} aria-label="Actualiser">
              <RefreshCw className={chargement ? "animate-spin" : undefined} />
            </Button>
            {peutRapport && (
              <Button variant="outline" onClick={() => setExportOuvert(true)}>
                <Download data-icon="inline-start" />Exporter
              </Button>
            )}
            {peutRapport && (
              <Button variant="outline" disabled={!ciblesRapports.length || !!rapports?.enCours} onClick={() => demanderRapports(ciblesRapports)}>
                <FileText data-icon="inline-start" />Rapports PDF ({ciblesRapports.length})
              </Button>
            )}
            {peut("fuites", "creer") && (
              <Button asChild>
                <Link href="/fuites/nouvelle" prefetch={false}><Plus data-icon="inline-start" />Nouvelle fuite</Link>
              </Button>
            )}
          </>
        }
      />

      {incomplet && <AvertissementPlafond lues={fuites.length} total={total} conseil="Ce sont les plus récentes. Le bouton « Exporter » lit toute la base." />}

      {fuites.length > 0 && (
        <GrilleIndicateurs>
          <CarteIndicateur icone={Droplets} libelle={`Fuites détectées (${ind.mois.mois})`} valeur={ind.mois.valeur} commentaire={ind.mois.commentaire}
            serie={ind.mois.serie} titreCourbe="Fuites détectées par jour, 14 derniers jours" />
          <CarteIndicateur icone={Siren} libelle={`Non réparées > ${libelles.delaiReparationH} h`} valeur={ind.retard.valeur} commentaire={ind.retard.commentaire}
            serie={ind.retard.serie} ton="negatif" titreCourbe="Fuites en retard à chaque fin de journée, 14 derniers jours" />
          <CarteIndicateur icone={Clock3} libelle="Délai moyen de réparation" valeur={ind.delai.valeur} unite="h" commentaire={ind.delai.commentaire}
            serie={ind.delai.serie} titreCourbe="Délai moyen par semaine, 8 dernières semaines (heures)" />
          <CarteIndicateur icone={Wrench} libelle="Réfections à faire" valeur={ind.refections.valeur} commentaire={ind.refections.commentaire}
            serie={ind.refections.serie} ton={ind.horsDelai ? "negatif" : "critique"}
            titreCourbe="Réfections en attente à chaque fin de journée, 14 derniers jours" />
        </GrilleIndicateurs>
      )}

      {rapports && (
        <Alert role="status">
          <FileText />
          <AlertTitle>Rapports PDF</AlertTitle>
          <AlertDescription>
            {rapports.etape}
            {rapports.enCours && <Progress className="mt-2 h-2 w-72" value={(100 * rapports.fait) / Math.max(1, rapports.total)} />}
          </AlertDescription>
          {!rapports.enCours && (
            <AlertAction><Button size="sm" variant="ghost" onClick={() => setRapports(null)}>Fermer</Button></AlertAction>
          )}
        </Alert>
      )}
      {erreur && (
        <Alert variant="destructive">
          <AlertTitle>Erreur</AlertTitle>
          <AlertDescription>{erreur}</AlertDescription>
        </Alert>
      )}

      <Dialog open={!!aImprimer} onOpenChange={(o) => !o && setAImprimer(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Rapports PDF</DialogTitle>
            <DialogDescription>
              {aImprimer && (() => {
                const n = aImprimer.length;
                const photos = aImprimer.reduce((s, f) => s + f.nb_photos, 0);
                return `${n} fuite${n > 1 ? "s" : ""}, une par page (${photos} photo${photos > 1 ? "s" : ""}).`
                  + (n > 40 ? " Cela peut prendre plusieurs minutes : filtrez la liste pour un fichier plus court." : "");
              })()}
            </DialogDescription>
          </DialogHeader>
          {marcheId && (
            <ChoixRubriques document="rapport_fuite" marcheId={marcheId} valeur={rubriques} changer={setRubriques}
              droits={{ quantites: peut("quantites", "lire") }} peutEnregistrer={peut("exports", "creer")} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAImprimer(null)}>Annuler</Button>
            <Button disabled={!rubriques.size} onClick={() => aImprimer && rapportsPdf(aImprimer)}><FileText data-icon="inline-start" />Fabriquer le PDF</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PanneauExport
        ouvert={exportOuvert}
        fermer={() => setExportOuvert(false)}
        jeux={[JEU_FUITES, ...(peut("quantites", "lire") ? [JEU_QUANTITES] : []), JEU_PIECES]}
        filtreListe={(l) => correspond(l as unknown as FuiteFiltrable)}
        descriptionListe={descriptionListe ? `Filtres de la liste : ${descriptionListe}` : undefined}
      />

      <Tabs value={statuts.length > 1 ? "" : statuts[0] ?? "toutes"} onValueChange={(v) => changer({ statuts: v === "toutes" ? [] : [v as StatutFuite] })}>
        <div className="scrollbar-none touch-pan-x overflow-x-auto overscroll-x-contain border-b">
          <TabsList variant="line" className="w-max min-w-full justify-start gap-2 ps-0 *:data-[slot=tabs-trigger]:flex-none">
            <TabsTrigger value="toutes">
              Toutes <span className="ml-1 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{total}</span>
            </TabsTrigger>
            {ORDRE_STATUTS.map((s) => (
              <TabsTrigger key={s} value={s}>
                <PointStatut statut={s} />
                {STATUT_STYLE[s].court}
                <span className="ml-1 rounded-sm bg-muted px-1.5 text-xs text-muted-foreground tabular-nums">{compteurs[s] ?? 0}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
        <div className="flex flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <InputGroup className="h-8 w-full sm:w-72">
              <InputGroupAddon><Search /></InputGroupAddon>
              <InputGroupInput className="h-8" placeholder="N°, référence ou adresse" value={texte} aria-label="Rechercher"
                onChange={(e) => changer({ texte: e.target.value }, true)} />
            </InputGroup>
            <FiltreFacettes titre="Statut" icone={CircleDot} valeurs={statuts} changer={(v) => changer({ statuts: v as StatutFuite[] })}
              options={ORDRE_STATUTS.map((s) => ({ valeur: s, libelle: STATUT_STYLE[s].libelle, nombre: compteurs[s] ?? 0 }))} />
            {zones.length > 1 && (
              <FiltreFacettes titre="Zone" icone={IconeZone} simple valeurs={zone ? [zone] : []}
                changer={(v) => {
                  const z = v[0] ?? "";
                  changer({ zone: z, ...(z && secteur && secteurs.find((s) => s.id === secteur)?.zone_id !== z ? { secteur: "" } : {}) });
                }}
                options={zones.map((z) => ({ valeur: z.id, libelle: z.libelle, nombre: compteursSecteurs[z.id] ?? 0 }))} />
            )}
            <FiltreFacettes titre="Secteur" icone={MapPin} simple valeurs={secteur ? [secteur] : []} changer={(v) => changer({ secteur: v[0] ?? "" })}
              options={secteursProposes.map((s) => ({ valeur: s.id, libelle: s.libelle, nombre: compteursSecteurs[s.id] ?? 0 }))} />
            <div className="flex h-8 items-center gap-1 rounded-lg border border-dashed px-2 text-sm has-[input:not(:placeholder-shown)]:border-solid" role="group" aria-label="Période de détection">
              <CalendarDays className="size-3.5 text-muted-foreground" />
              <Input type="date" aria-label="Détectées du" value={filtres.du} max={filtres.au || undefined}
                onChange={(e) => changer({ du: e.target.value }, true)} className="h-6 w-32 border-0 bg-transparent px-1 shadow-none dark:bg-transparent" />
              <span className="text-muted-foreground">→</span>
              <Input type="date" aria-label="au" value={filtres.au} min={filtres.du || undefined}
                onChange={(e) => changer({ au: e.target.value }, true)} className="h-6 w-32 border-0 bg-transparent px-1 shadow-none dark:bg-transparent" />
            </div>
            <FiltreFacettes titre="Alertes" icone={Siren} simple valeurs={choixAlerte} changer={(v) => choisirAlerte(v[0])}
              options={[
                { valeur: "toutes", libelle: "Toutes les alertes", nombre: compteursSecteurs.toutes ?? 0 },
                ...CLES_ALERTES.map((k) => ({
                  valeur: k, nombre: compteursSecteurs[k] ?? 0,
                  libelle: k === "alerte_non_reparee" ? `Non réparée > ${libelles.delaiReparationH} h` : LIBELLES_ALERTES[k],
                })),
              ]} />
            {filtresActifs(filtres) && (
              <Button variant="destructive" onClick={effacer}><X data-icon="inline-start" />Effacer</Button>
            )}
          </div>
          <div className="flex items-center justify-end gap-2">
            {vue === "liste" && <BasculeColonnes table={table} libelles={LIBELLES_COLONNES} />}
            <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={vue} onValueChange={(v) => v && setVue(v as typeof vue)} aria-label="Affichage">
              <ToggleGroupItem value="liste" aria-label="Liste"><Rows3 /></ToggleGroupItem>
              <ToggleGroupItem value="kanban" aria-label="Colonnes par statut"><SquareKanban /></ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {chargement && fuites.length === 0 ? (
          <p className="flex items-center justify-center gap-2 p-10 text-muted-foreground text-sm"><Spinner />Chargement…</p>
        ) : vue === "kanban" ? (
          <VueKanban fuites={filtrees} libelles={libelles} />
        ) : (
          <>
            <div className="hidden md:block">
              <TableauDonnees table={table} vide="Aucune fuite à afficher." onClicLigne={(f) => router.push(`/fuites/${f.id}`)}
                className="**:data-[slot=table-cell]:px-2.5 **:data-[slot=table-head]:px-2.5" />
            </div>
            <div className="md:hidden">
              <VueCartes lignes={table.getRowModel().rows} libelles={libelles} />
            </div>
            <PaginationTableau table={table} unite="fuite" />
          </>
        )}
      </div>
    </div>
  );
}

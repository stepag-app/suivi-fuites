"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Ellipsis, FileDown, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { libellesMarche, messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { getSupabase, lireTout } from "@/lib/supabase";
import {
  COLONNES_TDB, libellePeriode, periodePour,
  type ArticleTdb, type ChoixPeriode, type FuiteTdb, type LigneAttacheeTdb, type LotTdb, type Periode, type UniteResteTdb,
} from "@/lib/ui/tableau-de-bord";
import { BlocAttachements, type DonneesAttachements } from "./BlocAttachements";
import { DernieresFuites, type FuiteRecente } from "./DernieresFuites";
import { Synthese, TableauGroupes, type Anomalie } from "./Synthese";

type Reponse<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

interface Donnees {
  marcheId: string;
  maintenant: Date;
  fuites: FuiteRecente[];
  anomalies: Anomalie[] | null;
  attachements: DonneesAttachements | null;
}

const CHOIX_PERIODE: [ChoixPeriode, string][] = [
  ["mois", "Mois en cours"], ["semaine", "Semaine en cours"], ["mois_precedent", "Mois précédent"], ["libre", "Dates libres"],
];

const toutLire = <T,>(requete: (de: number, a: number) => unknown) =>
  lireTout<T>((de, a) => requete(de, a) as Reponse<T>, 1000, 50000);
async function lire<T>(requete: unknown): Promise<T[]> {
  const { data, error } = await (requete as Reponse<T>);
  if (error) throw error;
  return data ?? [];
}

export default function TableauDeBord() {
  const { marche, peut, profil } = useSession();
  const libelles = libellesMarche(marche);
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [choix, setChoix] = useState<ChoixPeriode>("mois");
  const [libre, setLibre] = useState<Partial<Periode>>({});

  const marcheId = marche?.id;
  const lireFuites = peut("fuites", "lire");
  const voirAnomalies = peut("quantites", "lire") && peut("interventions", "lire");
  const voirAttachements = peut("attachements", "lire") && peut("quantites", "lire");

  const derniereDemande = useRef(0);
  const charger = useCallback(async () => {
    if (!marcheId || !lireFuites) return;
    const demande = ++derniereDemande.current;
    setErreur("");
    setDonnees((d) => (d?.marcheId === marcheId ? d : null));
    if (!navigator.onLine) {
      setErreur("Pas de réseau : le tableau de bord s'affichera au retour de la connexion (bouton « Actualiser »).");
      setChargement(false);
      return;
    }
    setChargement(true);
    const sb = getSupabase();
    try {
      const [fuites, anomalies, lots, articles, lignes, unites] = await Promise.all([
        toutLire<FuiteRecente>((de, a) => sb.from("v_fuites").select(`${COLONNES_TDB}, reference_srm, adresse, detectee_par`)
          .eq("marche_id", marcheId).order("numero").range(de, a)),
        voirAnomalies
          ? toutLire<Anomalie>((de, a) => sb.from("v_anomalies").select("fuite_id, anomalie").eq("marche_id", marcheId)
            .order("fuite_id").order("anomalie").order("reparation_id", { nullsFirst: true }).range(de, a))
          : null,
        voirAttachements
          ? lire<LotTdb>(sb.from("attachements").select("id, numero, statut, date_arret").eq("marche_id", marcheId).is("supprime_le", null))
          : null,
        voirAttachements
          ? lire<ArticleTdb>(sb.from("prix").select("id, numero, ordre, designation, unite, quantite_marche, pu_ht, hors_bordereau, actif").eq("marche_id", marcheId))
          : null,
        voirAttachements
          ? toutLire<LigneAttacheeTdb>((de, a) => sb.from("v_attachement_lignes").select("prix_id, quantite, pu_ht")
            .eq("marche_id", marcheId).eq("attachement_statut", "arrete").order("id").range(de, a))
          : null,
        voirAttachements
          ? toutLire<UniteResteTdb>((de, a) => sb.from("v_a_attacher").select("fuite_id, prix_id, reste, brouillon_id")
            .eq("marche_id", marcheId).neq("reste", 0).order("fuite_id").order("prix_id").range(de, a))
          : null,
      ]);
      if (demande !== derniereDemande.current) return;
      setDonnees({
        marcheId, maintenant: new Date(), fuites, anomalies,
        attachements: lots && articles && lignes && unites ? { lots, articles, lignes, unites } : null,
      });
    } catch (e) {
      if (demande !== derniereDemande.current) return;
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [marcheId, lireFuites, voirAnomalies, voirAttachements]);

  useEffect(() => {
    charger();
  }, [charger]);

  const maintenant = donnees?.maintenant;
  const periode = useMemo(() => periodePour(choix, maintenant, libre), [choix, maintenant, libre]);

  function choisirPeriode(c: ChoixPeriode) {
    if (c === "libre" && !libre.du && !libre.au) setLibre(periode);
    setChoix(c);
  }

  if (!lireFuites) return <Vide>Votre compte n&apos;a pas accès aux fuites de ce marché.</Vide>;

  const titrePeriode = libellePeriode(periode);
  const prenom = profil?.nom_complet?.split(/\s+/)[0] ?? "";
  const fuites = donnees?.fuites as FuiteTdb[] | undefined;

  return (
    <div className="flex flex-col gap-4">
      <EnTetePage
        titre={prenom ? `Bonjour, ${prenom}.` : "Tableau de bord"}
        description={`${marche?.code ?? ""} · ${marche?.intitule ?? ""} · période : ${titrePeriode}, jours comptés à l'heure du Maroc.`}
      />

      <Tabs defaultValue="ensemble" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="gap-1">
            <TabsTrigger value="ensemble">Vue d&apos;ensemble</TabsTrigger>
            <TabsTrigger value="secteurs">Secteurs</TabsTrigger>
            {donnees?.attachements && <TabsTrigger value="attachements">Attachements</TabsTrigger>}
            <TabsTrigger value="recentes">Dernières fuites</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={choix} onValueChange={(v) => choisirPeriode(v as ChoixPeriode)}>
              <SelectTrigger className="w-44">
                <CalendarRange className="text-muted-foreground" />
                <SelectValue placeholder="Période" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {CHOIX_PERIODE.map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
            {choix === "libre" && (
              <>
                <Input type="date" className="w-38" aria-label="Du" value={libre.du ?? ""} max={libre.au || undefined}
                  onChange={(e) => setLibre((l) => ({ ...l, du: e.target.value }))} />
                <Input type="date" className="w-38" aria-label="Au" value={libre.au ?? ""} min={libre.du || undefined}
                  onChange={(e) => setLibre((l) => ({ ...l, au: e.target.value }))} />
              </>
            )}
            <Button size="icon" variant="outline" onClick={charger} disabled={chargement} aria-label="Actualiser">
              <RefreshCw className={chargement ? "animate-spin" : undefined} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" aria-label="Autres actions"><Ellipsis /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Tableau de bord</DropdownMenuLabel>
                  <DropdownMenuItem asChild><a href="/fuites"><FileDown />Exporter depuis la liste</a></DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => charger()}><RefreshCw />Actualiser les chiffres</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {erreur && (
          <Alert variant="destructive">
            <AlertTitle>Lecture impossible</AlertTitle>
            <AlertDescription>{erreur}</AlertDescription>
          </Alert>
        )}

        {chargement && !donnees && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
        )}

        {donnees && fuites && fuites.length === 0 && <Vide>Aucune fuite enregistrée sur ce marché pour l&apos;instant.</Vide>}

        {donnees && fuites && fuites.length > 0 && (
          <>
            <TabsContent value="ensemble" className="flex flex-col gap-4">
              <Synthese fuites={fuites} anomalies={donnees.anomalies} maintenant={donnees.maintenant}
                periode={periode} titrePeriode={titrePeriode} seuilH={libelles.delaiReparationH} />
            </TabsContent>
            <TabsContent value="secteurs">
              <TableauGroupes fuites={fuites} periode={periode} titrePeriode={titrePeriode} />
            </TabsContent>
            {donnees.attachements && (
              <TabsContent value="attachements">
                <BlocAttachements donnees={donnees.attachements} devise={libelles.devise} />
              </TabsContent>
            )}
            <TabsContent value="recentes">
              <DernieresFuites fuites={donnees.fuites} libelles={libelles} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Ellipsis, FileDown, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvertissementPlafond } from "@/components/avertissement-plafond";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { libellesMarche, messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { fonctionAbsente, getSupabase, lireTout, type Lignes } from "@/lib/supabase";
import {
  COLONNES_TDB, debutMarche, ecrirePeriodeAdresse, jourLong, libellePeriode, lirePeriodeAdresse, periodePour, resumerUnites,
  type ArticleTdb, type ChoixPeriode, type FuiteTdb, type LigneAttacheeTdb, type LotTdb, type Periode, type ResteAAttacher, type UniteResteTdb,
} from "@/lib/ui/tableau-de-bord";
import { useFuitesAnticipees } from "@/lib/anticipation";
import { AnticipeesPrioritaires } from "./Anticipees";
import { BlocAttachements, type DonneesAttachements } from "./BlocAttachements";
import { DebitsNuit } from "./Debits";
import { FournituresPosees } from "./Fournitures";
import { DernieresFuites, type FuiteRecente } from "./DernieresFuites";
import { Synthese, TableauGroupes, type Anomalie } from "./Synthese";

type Reponse<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

interface Donnees {
  marcheId: string;
  maintenant: Date;
  fuites: Lignes<FuiteTdb>;
  recentes: FuiteRecente[];
  anomalies: Anomalie[] | null;
  attachements: DonneesAttachements | null;
  debut: string | null;
}

const CHOIX_PERIODE: [ChoixPeriode, string][] = [
  ["mois", "Mois en cours"], ["semaine", "Semaine en cours"], ["mois_precedent", "Mois précédent"],
  ["debut", "Depuis le début du marché"], ["libre", "Dates libres"],
];

const toutLire = <T,>(requete: (de: number, a: number) => unknown) =>
  lireTout<T>((de, a) => requete(de, a) as Reponse<T>, 1000, 50000);

// Reste à attacher agrégé par la base ; sans la fonction (migration pas encore déployée, mode démonstration),
// lecture de v_a_attacher comme avant.
async function lireResteAAttacher(marcheId: string): Promise<ResteAAttacher> {
  const sb = getSupabase();
  const { data, error } = await sb.rpc("resume_a_attacher", { p_marche: marcheId });
  if (!fonctionAbsente(error, data)) {
    if (error) throw error;
    return data as ResteAAttacher;
  }
  return resumerUnites(await toutLire<UniteResteTdb>((de, a) => sb.from("v_a_attacher").select("fuite_id, prix_id, reste, brouillon_id")
    .eq("marche_id", marcheId).neq("reste", 0).order("fuite_id").order("prix_id").range(de, a)));
}
// Début du marché : OS de commencement (date d'effet), sinon date de commencement de la fiche ; null en cas d'échec.
async function lireCommencement(marcheId: string) {
  const sb = getSupabase();
  const { data: m } = await sb.from("marches").select("date_commencement, os_commencement_id").eq("id", marcheId).maybeSingle();
  const fiche = m as { date_commencement: string | null; os_commencement_id: string | null } | null;
  if (!fiche?.os_commencement_id) return { fiche, os: null };
  const { data: os } = await sb.from("ordres_service").select("date_os, date_effet").eq("id", fiche.os_commencement_id).maybeSingle();
  return { fiche, os: os as { date_os: string | null; date_effet: string | null } | null };
}

async function lire<T>(requete: unknown): Promise<T[]> {
  const { data, error } = await (requete as Reponse<T>);
  if (error) throw error;
  return data ?? [];
}

// Période choisie gardée dans l'adresse (?periode=…) : le retour depuis la liste filtrée la retrouve. Même mécanique
// que les filtres de la liste (fuites/useFiltresAdresse.ts) : une adresse changée d'ailleurs (menu) est relue, celles
// que la page vient de demander ne le sont pas.
function usePeriodeAdresse() {
  const router = useRouter();
  const chemin = usePathname();
  const adresse = useSearchParams().toString();
  const [etat, setEtat] = useState(() => lirePeriodeAdresse(adresse));
  const demandees = useRef<string[]>([]);
  const recue = useRef(adresse);

  useEffect(() => {
    recue.current = adresse;
    const lu = lirePeriodeAdresse(adresse);
    const q = ecrirePeriodeAdresse(lu.choix, lu.libre);
    const i = demandees.current.indexOf(q);
    if (i >= 0) {
      demandees.current = demandees.current.slice(i + 1);
      return;
    }
    demandees.current = [];
    setEtat((e) => (ecrirePeriodeAdresse(e.choix, e.libre) === q ? e : lu));
  }, [adresse]);

  useEffect(() => {
    const q = ecrirePeriodeAdresse(etat.choix, etat.libre);
    const lu = lirePeriodeAdresse(recue.current);
    if (q === (demandees.current.at(-1) ?? ecrirePeriodeAdresse(lu.choix, lu.libre))) return;
    demandees.current = [...demandees.current, q];
    router.replace(q ? `${chemin}?${q}` : chemin, { scroll: false });
  }, [etat, router, chemin]);

  const setChoix = useCallback((choix: ChoixPeriode) => setEtat((e) => ({ ...e, choix })), []);
  const setLibre = useCallback((maj: (l: Partial<Periode>) => Partial<Periode>) => setEtat((e) => ({ ...e, libre: maj(e.libre) })), []);
  return { choix: etat.choix, libre: etat.libre, setChoix, setLibre };
}

// useSearchParams demande une frontière Suspense (page rendue côté navigateur).
export default function PageTableauDeBord() {
  return (
    <Suspense fallback={<p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>}>
      <TableauDeBord />
    </Suspense>
  );
}

function TableauDeBord() {
  const { marche, peut, profil } = useSession();
  const libelles = libellesMarche(marche);
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const { choix, libre, setChoix, setLibre } = usePeriodeAdresse();

  const marcheId = marche?.id;
  const lireFuites = peut("fuites", "lire");
  const voirAnomalies = peut("quantites", "lire") && peut("interventions", "lire");
  const voirAttachements = peut("attachements", "lire") && peut("quantites", "lire");
  const voirFournitures = peut("quantites", "lire");
  const voirDebits = peut("mesures_debit", "lire");
  const [versionAnticipees, setVersionAnticipees] = useState(0);
  const { liste: anticipees } = useFuitesAnticipees(lireFuites ? marcheId : undefined, versionAnticipees);

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
      const [fuites, recentes, anomalies, lots, articles, lignes, aAttacher, commencement] = await Promise.all([
        toutLire<FuiteTdb>((de, a) => sb.from("v_fuites").select(COLONNES_TDB)
          .eq("marche_id", marcheId).order("numero", { ascending: false }).range(de, a)),
        lire<FuiteRecente>(sb.from("v_fuites").select(`${COLONNES_TDB}, reference_srm, adresse, detectee_par`)
          .eq("marche_id", marcheId).order("date_detection", { ascending: false }).limit(10)),
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
        voirAttachements ? lireResteAAttacher(marcheId) : null,
        lireCommencement(marcheId).catch(() => ({ fiche: null, os: null })),
      ]);
      if (demande !== derniereDemande.current) return;
      setDonnees({
        marcheId, maintenant: new Date(), fuites, recentes, anomalies,
        attachements: lots && articles && lignes && aAttacher ? { lots, articles, lignes, aAttacher } : null,
        debut: debutMarche(commencement.fiche, commencement.os, fuites),
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
  const actualiser = () => {
    charger();
    setVersionAnticipees((v) => v + 1);
  };

  const maintenant = donnees?.maintenant;
  const debut = donnees?.debut;
  const periode = useMemo(() => periodePour(choix, maintenant, libre, debut), [choix, maintenant, libre, debut]);

  function choisirPeriode(c: ChoixPeriode) {
    if (c === "libre" && !libre.du && !libre.au) setLibre(() => periode);
    setChoix(c);
  }

  if (!lireFuites) return <Vide>Votre compte n&apos;a pas accès aux fuites de ce marché.</Vide>;

  const titrePeriode = choix === "debut" ? `depuis le début du marché (${jourLong(periode.du)})` : libellePeriode(periode);
  // « NOM Prénom » depuis le chantier v2 : le prénom saisi, sinon le premier mot du nom complet
  const prenom = profil?.prenom || (profil?.nom ? "" : profil?.nom_complet?.split(/\s+/)[0]) || "";
  const fuites = donnees?.fuites;

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
              <SelectTrigger className="w-56">
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
            <Button size="icon" variant="outline" onClick={actualiser} disabled={chargement} aria-label="Actualiser">
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
                  <DropdownMenuItem onSelect={actualiser}><RefreshCw />Actualiser les chiffres</DropdownMenuItem>
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

        {fuites?.tronque && <AvertissementPlafond lues={fuites.length} />}

        {donnees && fuites && fuites.length === 0 && <Vide>Aucune fuite enregistrée sur ce marché pour l&apos;instant.</Vide>}

        {donnees && fuites && fuites.length > 0 && (
          <>
            <TabsContent value="ensemble" className="flex flex-col gap-4">
              <AnticipeesPrioritaires liste={anticipees} maintenant={donnees.maintenant}
                statuts={new Map(fuites.map((f) => [f.id, f.statut]))} />
              <Synthese fuites={fuites} anomalies={donnees.anomalies} maintenant={donnees.maintenant}
                periode={periode} titrePeriode={titrePeriode} seuilH={libelles.delaiReparationH} comparer={choix !== "debut"} />
              {voirFournitures && marcheId && <FournituresPosees marcheId={marcheId} periode={periode} titrePeriode={titrePeriode} />}
              {voirDebits && marcheId && <DebitsNuit marcheId={marcheId} />}
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
              <DernieresFuites fuites={donnees.recentes} total={fuites.length} libelles={libelles} />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

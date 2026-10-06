"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { STATUT_STYLE } from "@/components/statut";
import { libellesMarche, messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { getSupabase, lireTout } from "@/lib/supabase";
import type { StatutFuite } from "@/lib/types";
import { Carte, type CarteRef } from "./Carte";
import { COLONNES_CARTE, aUneAlerte, geometrieValide, jourMaroc, type Contour, type FuiteCarte } from "./commun";
import { ApercuFuite, BarreCarte, FiltresCarteForm, OngletsCarte, TabsContent, type FiltresCarte } from "./details-carte";
import type { ChoixImpression } from "./impression";
import { ListeCarte } from "./liste-carte";
import { PanneauImpression } from "./PanneauImpression";

type SecteurCarte = Contour & { zone_id: string | null };

const jourFr = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR");
const FILTRES_VIDES: FiltresCarte = { secteur: "", du: "", au: "", alertes: false };

export default function PageCarte() {
  return (
    <Suspense fallback={<p className="flex items-center gap-2 p-4 text-muted-foreground text-sm"><Spinner />Chargement…</p>}>
      <CarteDesFuites />
    </Suspense>
  );
}

function CarteDesFuites() {
  const { marche, peut } = useSession();
  const libelles = libellesMarche(marche);
  const fuiteDemandee = useSearchParams().get("fuite");
  const [fuites, setFuites] = useState<FuiteCarte[]>([]);
  const [secteurs, setSecteurs] = useState<SecteurCarte[]>([]);
  const [zones, setZones] = useState<Contour[]>([]);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(true);
  const [statut, setStatut] = useState<StatutFuite | "">("");
  const [texte, setTexte] = useState("");
  const [filtres, setFiltres] = useState<FiltresCarte>(FILTRES_VIDES);
  const [selection, setSelection] = useState<string | null>(null);
  const [onglet, setOnglet] = useState("fuite");
  const [feuille, setFeuille] = useState(false);
  const carte = useRef<CarteRef>(null);

  const marcheId = marche?.id;
  const derniereDemande = useRef(0);
  const charger = useCallback(async () => {
    if (!marcheId) return;
    const demande = ++derniereDemande.current;
    setErreur("");
    if (!navigator.onLine) {
      setErreur("Pas de réseau : la carte des fuites s'affichera au retour de la connexion (bouton « Actualiser »).");
      setChargement(false);
      return;
    }
    setChargement(true);
    const sb = getSupabase();
    try {
      const [f, s, z] = await Promise.all([
        lireTout<FuiteCarte>((de, a) => sb.from("v_fuites").select(COLONNES_CARTE).eq("marche_id", marcheId)
          .order("numero").range(de, a) as unknown as PromiseLike<{ data: FuiteCarte[] | null; error: { message: string } | null }>),
        sb.from("secteurs").select("id, zone_id, code, libelle, geom").eq("marche_id", marcheId).eq("actif", true).order("libelle"),
        sb.from("zones").select("id, code, libelle, geom").eq("marche_id", marcheId).eq("actif", true).order("numero"),
      ]);
      if (demande !== derniereDemande.current) return;
      if (s.error) throw s.error;
      if (z.error) throw z.error;
      setFuites(f);
      setSecteurs((s.data as SecteurCarte[] | null) ?? []);
      setZones((z.data as Contour[] | null) ?? []);
    } catch (e) {
      if (demande !== derniereDemande.current) return;
      setErreur(messageErreur(e));
    }
    setChargement(false);
  }, [marcheId]);

  useEffect(() => {
    charger();
  }, [charger]);

  const filtrees = useMemo(() => {
    const t = texte.trim().toLowerCase();
    return fuites.filter((f) => {
      if (statut && f.statut !== statut) return false;
      if (filtres.secteur && f.secteur_id !== filtres.secteur) return false;
      if (filtres.alertes && !aUneAlerte(f)) return false;
      if (filtres.du || filtres.au) {
        const j = jourMaroc(f.date_detection);
        if (filtres.du && j < filtres.du) return false;
        if (filtres.au && j > filtres.au) return false;
      }
      return !t || String(f.numero) === t || (f.reference_srm ?? "").toLowerCase().includes(t) || (f.adresse ?? "").toLowerCase().includes(t);
    });
  }, [fuites, statut, filtres, texte]);
  const placees = useMemo(() => filtrees.filter((f) => f.latitude != null && f.longitude != null), [filtrees]);
  const sansPosition = filtrees.length - placees.length;
  const choisie = fuites.find((f) => f.id === selection) ?? null;

  const secteursAffiches = useMemo(() => secteurs.filter((s) => (!filtres.secteur || s.id === filtres.secteur) && geometrieValide(s.geom)), [secteurs, filtres.secteur]);
  const zonesAffichees = useMemo(() => zones.filter((z) => geometrieValide(z.geom)), [zones]);

  const compteurs = useMemo(() => {
    const c: Partial<Record<StatutFuite, number>> = {};
    fuites.forEach((f) => (c[f.statut] = (c[f.statut] ?? 0) + 1));
    return c;
  }, [fuites]);

  const libelleSecteur = secteurs.find((s) => s.id === filtres.secteur)?.libelle;
  const descriptionFiltres = [
    statut && `statut : ${STATUT_STYLE[statut].libelle}`,
    libelleSecteur && `secteur : ${libelleSecteur}`,
    filtres.du && filtres.au ? `détectées du ${jourFr(filtres.du)} au ${jourFr(filtres.au)}` : filtres.du ? `détectées depuis le ${jourFr(filtres.du)}` : filtres.au ? `détectées jusqu'au ${jourFr(filtres.au)}` : "",
    filtres.alertes && "alertes seulement",
    texte.trim() && `recherche « ${texte.trim()} »`,
  ].filter(Boolean).join(" ; ");
  const filtresImpression = `Filtres : ${descriptionFiltres || "aucun (toutes les fuites du marché)"}`;

  const imprimer = async (choix: ChoixImpression, etape: (texte: string) => void) => {
    const etat = carte.current?.etatImpression();
    if (!etat || !marcheId) throw new Error("La carte n'est pas encore affichée : attendez la fin du chargement puis réessayez.");
    const { imprimerCarte } = await import("./impression");
    const r = await imprimerCarte(marcheId, choix, {
      etat, fuites: filtrees, zones: zonesAffichees, secteurs: secteursAffiches, filtres: filtresImpression, libelleReference: libelles.reference,
    }, etape);
    return `PDF téléchargé (${(r.octets / 1048576).toFixed(1).replace(".", ",")} Mo, ${Math.max(1, Math.round(r.secondes))} s).`;
  };

  const filtresActifs = !!statut || !!filtres.secteur || !!filtres.du || !!filtres.au || filtres.alertes || !!texte.trim();
  const effacer = () => { setStatut(""); setTexte(""); setFiltres(FILTRES_VIDES); };

  // Après un changement de filtre, la vue se recadre sur les fuites restantes.
  const premierCadrage = useRef(true);
  const cleFiltres = `${statut}|${filtres.secteur}|${filtres.du}|${filtres.au}|${filtres.alertes}|${fuites.length}`;
  useEffect(() => {
    if (premierCadrage.current) {
      premierCadrage.current = false;
      return;
    }
    carte.current?.recentrer();
  }, [cleFiltres]);

  const choisir = useCallback((f: FuiteCarte) => {
    setSelection(f.id);
    setOnglet("fuite");
    carte.current?.centrerSur(f);
    if (window.innerWidth < 1024) setFeuille(true);
  }, []);

  // Fuite demandée dans l'adresse (?fuite=…) : sélectionnée dès que la carte est prête.
  const demandeTraitee = useRef<string | null>(null);
  useEffect(() => {
    if (!fuiteDemandee || demandeTraitee.current === fuiteDemandee || !fuites.length) return;
    const f = fuites.find((x) => x.id === fuiteDemandee);
    if (!f) return;
    demandeTraitee.current = fuiteDemandee;
    setSelection(f.id);
    let essais = 0;
    const minuteur = setInterval(() => {
      essais++;
      if (carte.current?.etatImpression() || essais > 20) {
        clearInterval(minuteur);
        carte.current?.centrerSur(f);
      }
    }, 400);
    return () => clearInterval(minuteur);
  }, [fuiteDemandee, fuites]);

  const details = (
    <OngletsCarte onglet={onglet} changerOnglet={setOnglet} impression={peut("exports", "lire")}>
      <TabsContent className="min-h-0 overflow-auto p-4" value="fuite"><ApercuFuite fuite={choisie} libelles={libelles} /></TabsContent>
      <TabsContent className="min-h-0 overflow-auto p-4" value="filtres">
        <FiltresCarteForm filtres={filtres} changer={(f) => setFiltres((x) => ({ ...x, ...f }))} secteurs={secteurs} />
      </TabsContent>
      {peut("exports", "lire") && (
        <TabsContent className="min-h-0 overflow-auto p-4" value="impression">
          <PanneauImpression titreDefaut={`Carte des fuites – ${libelleSecteur ?? marche?.code ?? ""}`} nombreSurCarte={placees.length}
            nombreListe={filtrees.length} filtres={filtresImpression} imprimer={imprimer} />
        </TabsContent>
      )}
    </OngletsCarte>
  );

  return (
    <>
      <div data-content-padding="false" className="flex h-[calc(100dvh-var(--dashboard-header-height))] flex-col overflow-hidden lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:divide-x">
        <div className="order-2 min-h-0 flex-1 overflow-hidden lg:order-1 lg:h-full">
          <ListeCarte fuites={filtrees} total={fuites.length} compteurs={compteurs} statut={statut} choisirStatut={setStatut}
            texte={texte} changerTexte={setTexte} selection={selection} choisir={choisir} libelles={libelles}
            filtresActifs={filtresActifs} effacer={effacer} ouvrirFiltres={() => { setOnglet("filtres"); if (window.innerWidth < 1024) setFeuille(true); }} />
        </div>
        <div className="order-1 h-[44vh] shrink-0 overflow-hidden lg:order-2 lg:h-full">
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
            <div className="relative min-h-0 overflow-hidden">
              <Carte ref={carte} fuites={placees} zones={zonesAffichees} secteurs={secteursAffiches} libelles={libelles} />
              {chargement && fuites.length === 0 && (
                <div className="absolute inset-0 grid place-items-center bg-background/60 text-muted-foreground text-sm"><span className="flex items-center gap-2"><Spinner />Chargement des fuites…</span></div>
              )}
            </div>
            <div className="hidden min-h-0 border-t lg:block">
              <BarreCarte placees={placees.length} sansPosition={sansPosition} chargement={chargement} erreur={erreur} recentrer={() => carte.current?.recentrer()} actualiser={charger} />
              <div className="h-60 overflow-hidden">{details}</div>
            </div>
          </div>
        </div>
      </div>

      <Sheet open={feuille} onOpenChange={setFeuille}>
        <SheetContent side="bottom" className="h-[70vh] gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{choisie ? `Fuite N° ${choisie.numero}` : "Détails"}</SheetTitle>
            <SheetDescription>Détails de la fuite choisie, filtres et impression.</SheetDescription>
          </SheetHeader>
          <BarreCarte placees={placees.length} sansPosition={sansPosition} chargement={chargement} erreur={erreur} recentrer={() => carte.current?.recentrer()} actualiser={charger} />
          <div className="min-h-0 flex-1 overflow-hidden">{details}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

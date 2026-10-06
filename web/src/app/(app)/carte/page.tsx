"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Network, Route } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { STATUT_STYLE } from "@/components/statut";
import { libellesMarche, messageErreur, nombre } from "@/lib/format";
import { compterBalayagesEnAttente, ecouterAttente, synchroniser } from "@/lib/hors-ligne";
import { preparerBalayages, type ChoixBalayage } from "@/lib/reseau/balayage";
import { annulerDernierBalayage, enregistrerBalayages, messageReseau } from "@/lib/reseau/donnees";
import {
  appliquerSelection, construireAdjacence, formaterLineaire, idsIndexDansAnneau, lineaireSelection, prolongerSelection, type ModeSelection,
} from "@/lib/reseau/selection";
import { useSession } from "@/lib/session";
import { estContexteApk, getSupabase, lireTout } from "@/lib/supabase";
import type { StatutFuite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Carte, type CarteRef, type ReseauCarteProps } from "./Carte";
import { COLONNES_CARTE, aUneAlerte, geometrieValide, jourMaroc, type Contour, type FuiteCarte } from "./commun";
import { ApercuFuite, BarreCarte, FiltresCarteForm, OngletsCarte, TabsContent, type FiltresCarte } from "./details-carte";
import type { ChoixImpression } from "./impression";
import { ListeCarte } from "./liste-carte";
import { PanneauImpression } from "./PanneauImpression";
import { PanneauReseau, type BalayagePanneau } from "./PanneauReseau";
import styles from "./reseau.module.css";
import { useReseau } from "./useReseau";

type SecteurCarte = Contour & { zone_id: string | null };

const jourFr = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR");
const FILTRES_VIDES: FiltresCarte = { secteur: "", du: "", au: "", alertes: false };
// Sélection de balayage non enregistrée : gardée le temps de la session (la WebView de l'APK se recharge).
const cleSelection = (marcheId: string) => `suivi-fuites:balayage:selection:${marcheId}`;

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
  const parametres = useSearchParams();
  const fuiteDemandee = parametres.get("fuite");
  // « ?mode=balayage » : ouverture par l'APK (WebView), réseau affiché et mode balayage actif.
  const ouvertureBalayage = parametres.get("mode") === "balayage";
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
  const [reseauOuvert, setReseauOuvert] = useState(ouvertureBalayage);
  const carte = useRef<CarteRef>(null);

  const marcheId = marche?.id;
  const peutBalayer = peut("balayage", "creer");
  const peutAnnuler = peut("balayage", "supprimer") || peut("balayage", "valider");
  const reseau = useReseau(marcheId, peut("balayage", "lire"), ouvertureBalayage);
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

  // ---- Mode balayage : sélection au doigt, enregistrement, file d'attente -----------------------------
  const [modeBalayage, setModeBalayage] = useState(ouvertureBalayage && peutBalayer);
  const [troncons, setTronconsEtat] = useState<Set<string>>(new Set());
  const [occupe, setOccupe] = useState(false);
  const [messageBalayage, setMessageBalayage] = useState("");
  const [enAttente, setEnAttente] = useState(0);

  useEffect(() => {
    if (!marcheId) return;
    try {
      const m = window.sessionStorage.getItem(cleSelection(marcheId));
      const liste = m ? (JSON.parse(m) as unknown) : null;
      setTronconsEtat(new Set(Array.isArray(liste) ? liste.filter((x): x is string => typeof x === "string") : []));
    } catch {
      setTronconsEtat(new Set());
    }
  }, [marcheId]);
  const setTroncons = useCallback((s: Set<string>) => {
    setTronconsEtat(s);
    if (!marcheId) return;
    try {
      window.sessionStorage.setItem(cleSelection(marcheId), JSON.stringify([...s]));
    } catch {
      /* stockage indisponible */
    }
  }, [marcheId]);
  const surSelection = useCallback((ids: string[], mode: ModeSelection) => {
    setTronconsEtat((courante) => {
      const s = appliquerSelection(courante, ids, mode);
      if (marcheId) {
        try {
          window.sessionStorage.setItem(cleSelection(marcheId), JSON.stringify([...s]));
        } catch {
          /* stockage indisponible */
        }
      }
      return s;
    });
  }, [marcheId]);

  const longueurs = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, t] of reseau.index) m.set(id, t.longueur);
    return m;
    // L'index vit hors de l'état React : il suit les secteurs affichés.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reseau.secteursAffiches]);
  const lineaire = useMemo(() => lineaireSelection(troncons, longueurs), [troncons, longueurs]);

  // Outils du mode balayage : toucher un par un, lasso au doigt, « Prolonger » le long de la rue.
  const [outilBalayage, setOutilBalayage] = useState<"toucher" | "lasso">("toucher");
  const indexReseau = reseau.index;
  const surLasso = useCallback((anneau: number[][]) => {
    const ids = idsIndexDansAnneau(indexReseau.values(), anneau);
    if (ids.length) surSelection(ids, "ajouter");
  }, [indexReseau, surSelection]);
  const prolonger = () => {
    const ajoutes = prolongerSelection(indexReseau, construireAdjacence(indexReseau.values()), troncons);
    if (ajoutes.length) {
      surSelection(ajoutes, "ajouter");
      setMessageBalayage("");
    } else {
      setMessageBalayage("Rien à prolonger : jonction à 3 branches, bout de rue ou changement de direction (± 20°).");
    }
  };

  const rafraichirAttente = useCallback(async () => setEnAttente(await compterBalayagesEnAttente()), []);
  useEffect(() => {
    rafraichirAttente();
    const arreter = ecouterAttente(rafraichirAttente);
    const enLigne = () => { synchroniser().then(rafraichirAttente).catch(() => undefined); };
    window.addEventListener("online", enLigne);
    const minuteur = setInterval(() => {
      compterBalayagesEnAttente().then((n) => { if (n > 0 && navigator.onLine) enLigne(); });
    }, 30000);
    return () => {
      arreter();
      window.removeEventListener("online", enLigne);
      clearInterval(minuteur);
    };
  }, [rafraichirAttente]);

  const enregistrer = async (choix: Omit<ChoixBalayage, "marcheId">) => {
    if (!marcheId || troncons.size === 0) return;
    setOccupe(true);
    setMessageBalayage("");
    try {
      // Saisi dans l'APK (WebView) : sur la tablette ; sinon dans le panneau web.
      const lignes = preparerBalayages(troncons, { ...choix, marcheId, sourceSaisie: estContexteApk() ? "tablette" : "web" });
      const { restants } = await enregistrerBalayages(lignes);
      setTroncons(new Set());
      setMessageBalayage(restants === 0
        ? `${lignes.length} balayage${lignes.length > 1 ? "s" : ""} enregistré${lignes.length > 1 ? "s" : ""}.`
        : `${lignes.length} balayage${lignes.length > 1 ? "s" : ""} gardé${lignes.length > 1 ? "s" : ""} sur l'appareil : envoi au retour du réseau.`);
      await rafraichirAttente();
      await reseau.recharger();
    } catch (e) {
      setMessageBalayage(`Erreur : ${messageReseau(e)}`);
    }
    setOccupe(false);
  };

  const envoyer = async () => {
    try {
      await synchroniser();
    } catch {
      /* réessayé plus tard */
    }
    await rafraichirAttente();
    await reseau.rechargerEtats();
  };

  const annuler = useCallback(async (tronconId: string) => {
    const motif = window.prompt("Motif de l'annulation du dernier balayage de ce tronçon :");
    if (motif == null || !motif.trim()) return;
    try {
      const fait = await annulerDernierBalayage(tronconId, motif);
      setMessageBalayage(fait ? "Balayage annulé." : "Aucun balayage à annuler sur ce tronçon.");
      await reseau.recharger();
    } catch (e) {
      setMessageBalayage(`Erreur : ${messageReseau(e)}`);
    }
  }, [reseau]);

  // Mode balayage : la barre latérale se replie pour laisser toute la largeur à la carte (tablette),
  // puis reprend son état à la sortie du mode.
  const { open: menuOuvert, setOpen: ouvrirMenu } = useSidebar();
  const menuAvantBalayage = useRef<boolean | null>(null);
  const ouvrirMenuRef = useRef(ouvrirMenu);
  ouvrirMenuRef.current = ouvrirMenu;
  // Page quittée en plein balayage : le menu reprend aussi son état.
  useEffect(() => () => {
    if (menuAvantBalayage.current) ouvrirMenuRef.current(true);
  }, []);
  useEffect(() => {
    if (modeBalayage && menuAvantBalayage.current === null) {
      menuAvantBalayage.current = menuOuvert;
      if (menuOuvert) ouvrirMenu(false);
    } else if (!modeBalayage && menuAvantBalayage.current !== null) {
      if (menuAvantBalayage.current) ouvrirMenu(true);
      menuAvantBalayage.current = null;
    }
  }, [modeBalayage, menuOuvert, ouvrirMenu]);

  const basculerBalayage = () => {
    if (!modeBalayage) {
      reseau.setActif(true);
      setReseauOuvert(true);
    }
    setModeBalayage((v) => !v);
  };

  const balayage: BalayagePanneau = {
    peut: peutBalayer, actif: modeBalayage, basculer: basculerBalayage, selection: troncons, lineaire,
    vider: () => setTroncons(new Set()), enregistrer, occupe, message: messageBalayage, enAttente, envoyer, peutAnnuler,
  };

  const reseauCarte: ReseauCarteProps | undefined = reseau.actif ? {
    secteurs: reseau.secteursAffiches, coloration: reseau.coloration, palette: reseau.palette, etats: reseau.etats,
    libelles: reseau.libelles, modeBalayage, outil: outilBalayage, selection: troncons, surSelection, surLasso, peutAnnuler, annuler,
    surZoom: reseau.surZoom,
  } : undefined;

  // « Enregistrer… » : ouvre le panneau Réseau et amène le formulaire du balayage (équipe, date, méthode) à l'écran,
  // même si le panneau était déjà ouvert (sur la tablette, il est en bas d'une longue liste de secteurs).
  const allerAuFormulaire = () => {
    setReseauOuvert(true);
    const montrer = (essais: number) => {
      const el = document.getElementById("formulaire-balayage");
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.querySelector("select")?.focus({ preventScroll: true });
      } else if (essais > 0) {
        requestAnimationFrame(() => montrer(essais - 1));
      }
    };
    requestAnimationFrame(() => montrer(10));
  };
  const actualiser = () => { charger(); reseau.recharger(); };

  const libelleSecteur = secteurs.find((s) => s.id === filtres.secteur)?.libelle;
  const descriptionFiltres = [
    statut && `statut : ${STATUT_STYLE[statut].libelle}`,
    libelleSecteur && `secteur : ${libelleSecteur}`,
    filtres.du && filtres.au ? `détectées du ${jourFr(filtres.du)} au ${jourFr(filtres.au)}` : filtres.du ? `détectées depuis le ${jourFr(filtres.du)}` : filtres.au ? `détectées jusqu'au ${jourFr(filtres.au)}` : "",
    filtres.alertes && "alertes seulement",
    texte.trim() && `recherche « ${texte.trim()} »`,
  ].filter(Boolean).join(" ; ");
  const nbSecteursReseau = reseau.actif ? reseau.secteursAffiches.filter((s) => s.data).length : 0;
  const descriptionReseau = nbSecteursReseau > 0
    ? ` ; réseau : ${nbSecteursReseau} secteur${nbSecteursReseau > 1 ? "s" : ""}, coloré par ${reseau.coloration === "balayage" ? "état de balayage" : reseau.coloration === "diametre" ? "diamètre" : "secteur"}`
    : "";
  const filtresImpression = `Filtres : ${descriptionFiltres || "aucun (toutes les fuites du marché)"}${descriptionReseau}`;

  const imprimer = async (choix: ChoixImpression, etape: (texte: string) => void) => {
    const etat = carte.current?.etatImpression();
    if (!etat || !marcheId) throw new Error("La carte n'est pas encore affichée : attendez la fin du chargement puis réessayez.");
    const { imprimerCarte } = await import("./impression");
    const r = await imprimerCarte(marcheId, choix, {
      etat, fuites: filtrees, zones: zonesAffichees, secteurs: secteursAffiches, filtres: filtresImpression, libelleReference: libelles.reference,
      reseau: reseau.actif ? { secteurs: reseau.secteursAffiches, coloration: reseau.coloration, palette: reseau.palette, etats: reseau.etats } : null,
      zonesReseau: reseau.contexte?.zones ?? [],
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
      <div data-content-padding="false" className={cn(
        "flex h-[calc(100dvh-var(--dashboard-header-height))] flex-col overflow-hidden lg:grid lg:divide-x",
        modeBalayage ? "lg:grid-cols-1" : "lg:grid-cols-[400px_minmax(0,1fr)]",
      )}>
        {/* Mode balayage : la carte occupe tout l'écran (tablette), la liste des fuites est masquée. */}
        <div className={cn("order-2 min-h-0 flex-1 overflow-hidden lg:order-1 lg:h-full", modeBalayage && "hidden")}>
          <ListeCarte fuites={filtrees} total={fuites.length} compteurs={compteurs} statut={statut} choisirStatut={setStatut}
            texte={texte} changerTexte={setTexte} selection={selection} choisir={choisir} libelles={libelles}
            filtresActifs={filtresActifs} effacer={effacer} ouvrirFiltres={() => { setOnglet("filtres"); if (window.innerWidth < 1024) setFeuille(true); }} />
        </div>
        <div className={cn("order-1 shrink-0 overflow-hidden lg:order-2 lg:h-full", modeBalayage ? "h-full flex-1" : "h-[44vh]")}>
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
            <div className="relative min-h-0 overflow-hidden">
              <Carte ref={carte} fuites={placees} zones={zonesAffichees} secteurs={secteursAffiches} libelles={libelles} reseau={reseauCarte} />
              {/* Réseau d'eau et mode balayage (lot S) : commandes posées sur la carte, visibles aussi sur la tablette */}
              {!reseauOuvert && (
                <div className="absolute top-3 left-3 z-[3] flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="bg-background shadow-sm" onClick={() => setReseauOuvert(true)}>
                    <Network data-icon="inline-start" />Réseau{reseau.actif && nbSecteursReseau > 0 ? ` (${nbSecteursReseau})` : ""}
                  </Button>
                  {peutBalayer && (
                    <Button size="sm" variant={modeBalayage ? "default" : "outline"} className={cn(!modeBalayage && "bg-background", "shadow-sm")} onClick={basculerBalayage}>
                      <Route data-icon="inline-start" />Balayage{troncons.size > 0 ? ` (${troncons.size})` : ""}
                    </Button>
                  )}
                </div>
              )}
              {modeBalayage && (
                <div className={cn("ancien", styles.barreBalayage, reseauOuvert && styles.avecPanneau)} role="toolbar" aria-label="Outils du mode balayage">
                  <span className={styles.compte} aria-live="polite">
                    {nombre(troncons.size, 0)} tronçon{troncons.size > 1 ? "s" : ""} · {formaterLineaire(lineaire)}
                  </span>
                  <button type="button" aria-pressed={outilBalayage === "toucher"} className={outilBalayage === "toucher" ? "actif" : ""} onClick={() => setOutilBalayage("toucher")}>Toucher</button>
                  <button type="button" aria-pressed={outilBalayage === "lasso"} className={outilBalayage === "lasso" ? "actif" : ""} onClick={() => setOutilBalayage("lasso")}>Lasso</button>
                  <button type="button" disabled={troncons.size === 0} onClick={prolonger}>Prolonger</button>
                  <button type="button" disabled={troncons.size === 0} onClick={() => setTroncons(new Set())}>Désélectionner tout</button>
                  <button type="button" className="primaire" disabled={troncons.size === 0 || occupe} onClick={allerAuFormulaire}>Enregistrer…</button>
                  <button type="button" onClick={basculerBalayage}>Quitter le balayage</button>
                  {messageBalayage && !reseauOuvert && <span className="discret" role="status">{messageBalayage}</span>}
                </div>
              )}
              {reseauOuvert && (
                <div className="ancien">
                  <PanneauReseau reseau={reseau} balayage={balayage} fermer={() => setReseauOuvert(false)} />
                </div>
              )}
              {chargement && fuites.length === 0 && (
                <div className="absolute inset-0 grid place-items-center bg-background/60 text-muted-foreground text-sm"><span className="flex items-center gap-2"><Spinner />Chargement des fuites…</span></div>
              )}
            </div>
            <div className="hidden min-h-0 border-t lg:block">
              <BarreCarte placees={placees.length} sansPosition={sansPosition} chargement={chargement} erreur={erreur} recentrer={() => carte.current?.recentrer()} actualiser={actualiser} />
              {/* Hauteur du cadre : la fiche d'une fuite s'y lit entière, sans défilement */}
              {!modeBalayage && <div className="h-72 overflow-hidden">{details}</div>}
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
          <BarreCarte placees={placees.length} sansPosition={sansPosition} chargement={chargement} erreur={erreur} recentrer={() => carte.current?.recentrer()} actualiser={actualiser} />
          <div className="min-h-0 flex-1 overflow-hidden">{details}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

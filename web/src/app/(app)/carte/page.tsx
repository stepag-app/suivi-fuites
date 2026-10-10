"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Network, PanelLeftClose, PanelLeftOpen, Route } from "lucide-react";
import { langueApk, texteEtatTronconApk, traduire, useLangueApk } from "@/lib/langue-apk";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { STATUT_STYLE } from "@/components/statut";
import { libellesMarche, messageErreur, nombre } from "@/lib/format";
import { compterBalayagesEnAttente, ecouterAttente, synchroniser } from "@/lib/hors-ligne";
import { preparerBalayages, type ChoixBalayage } from "@/lib/reseau/balayage";
import { annulerDernierBalayage, enregistrerBalayages, messageReseau } from "@/lib/reseau/donnees";
import {
  appliquerSelection, construireAdjacence, formaterLineaire, idsIndexDansAnneau, lineaireSelection, prolongerSelection, type ModeSelection,
} from "@/lib/reseau/selection";
import { SANS_SECTEUR } from "@/lib/reseau/types";
import { useSession } from "@/lib/session";
import { estContexteApk, getSupabase, lireTout } from "@/lib/supabase";
import type { StatutFuite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Carte, type CarteRef, type ReseauCarteProps } from "./Carte";
import { CENTRE_DEFAUT, COLONNES_CARTE, aUneAlerte, geometrieValide, jourMaroc, type Contour, type FuiteCarte } from "./commun";
import { ApercuFuite, CommandesCarte, FiltresCarteForm, OngletsCarte, TabsContent, type FiltresCarte } from "./details-carte";
import type { ChoixImpression } from "./impression";
import { ListeCarte } from "./liste-carte";
import { PanneauImpression } from "./PanneauImpression";
import { PanneauReseau, type BalayagePanneau, type OngletReseau } from "./PanneauReseau";
import styles from "./reseau.module.css";
import { ZOOM_MIN_SATELLITE, satelliteDisponible } from "./satellite";
import { VignetteFond } from "./VignetteFond";
import { useReseau } from "./useReseau";

type SecteurCarte = Contour & { zone_id: string | null };

const jourFr = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR");
const FILTRES_VIDES: FiltresCarte = { secteur: "", du: "", au: "", alertes: false };
// Sélection de balayage non enregistrée : gardée le temps de la session (la WebView de l'APK se recharge).
const cleSelection = (marcheId: string) => `suivi-fuites:balayage:selection:${marcheId}`;
const CLE_SATELLITE = "suivi-fuites:carte:satellite";
const CLE_LISTE = "suivi-fuites:carte:liste-masquee";
// Messages du mode balayage composés hors rendu : dans la langue de la tablette (APK), sinon en français.
const tr = (cle: string, valeurs?: Record<string, string | number>, fr?: string) => traduire(langueApk(), cle, valeurs, fr);

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
  const { tb, rtl } = useLangueApk();
  // Liste des fuites repliable (bureau) : la carte prend toute la largeur ; choix mémorisé.
  const [listeMasquee, setListeMasquee] = useState(false);
  useEffect(() => {
    try {
      setListeMasquee(window.localStorage.getItem(CLE_LISTE) === "1");
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const basculerListe = (v: boolean) => {
    setListeMasquee(v);
    try {
      window.localStorage.setItem(CLE_LISTE, v ? "1" : "0");
    } catch {
      /* stockage indisponible */
    }
  };
  const [feuille, setFeuille] = useState(false);
  // C4 : en balayage, la carte occupe tout l'écran ; le panneau (secteurs, légende, enregistrement) s'ouvre au besoin.
  const [reseauOuvert, setReseauOuvert] = useState(false);
  const carte = useRef<CarteRef>(null);

  const marcheId = marche?.id;
  const peutBalayer = peut("balayage", "creer");
  const peutAnnuler = peut("balayage", "supprimer") || peut("balayage", "valider");
  // Mode balayage : la géométrie des tronçons est lue (lasso, « Prolonger ») même quand le réseau s'affiche en tuiles.
  // Lecture différée de 4 s (ou dès le premier lasso / « Prolonger ») : l'affichage en tuiles passe d'abord.
  const [modeBalayage, setModeBalayage] = useState(ouvertureBalayage && peutBalayer);
  const [geometriesDemandees, setGeometriesDemandees] = useState(false);
  useEffect(() => {
    if (!modeBalayage) return;
    const minuteur = setTimeout(() => setGeometriesDemandees(true), 4000);
    return () => clearTimeout(minuteur);
  }, [modeBalayage]);
  const reseau = useReseau(marcheId, peut("balayage", "lire"), ouvertureBalayage, modeBalayage && geometriesDemandees);
  // Ouverture en mode balayage (APK) : coloration par état de balayage, sinon les tronçons balayés ne se distinguent pas.
  const { setColoration } = reseau;
  useEffect(() => {
    if (ouvertureBalayage && peutBalayer) setColoration("balayage");
  }, [ouvertureBalayage, peutBalayer, setColoration]);
  const [ongletReseau, setOngletReseau] = useState<OngletReseau>("secteurs");

  // Satellite (C5) : choix mémorisé sur l'appareil ; bouton absent tant que la clé Esri n'est pas posée.
  const [satellite, setSatelliteEtat] = useState(false);
  const [zoom, setZoom] = useState(12);
  useEffect(() => {
    try {
      setSatelliteEtat(satelliteDisponible() && window.localStorage.getItem(CLE_SATELLITE) === "1");
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const basculerSatellite = () => {
    const v = !satellite;
    setSatelliteEtat(v);
    try {
      window.localStorage.setItem(CLE_SATELLITE, v ? "1" : "0");
    } catch {
      /* stockage indisponible */
    }
  };
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
          .order("numero", { ascending: false }).range(de, a) as unknown as PromiseLike<{ data: FuiteCarte[] | null; error: { message: string } | null }>),
        sb.from("secteurs").select("id, zone_id, code, libelle, geom").eq("marche_id", marcheId).eq("actif", true).order("libelle"),
        sb.from("zones").select("id, code, libelle, geom").eq("marche_id", marcheId).eq("actif", true).order("numero"),
      ]);
      if (demande !== derniereDemande.current) return;
      if (s.error) throw s.error;
      if (z.error) throw z.error;
      setFuites(f);
      if (f.tronque) setErreur(`Carte incomplète : seules les ${f.length.toLocaleString("fr-FR")} fuites les plus récentes sont chargées.`);
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
  // Tronçon déjà balayé : sélectionnable, avec un avertissement ; l'enregistrement demande le motif du second passage.
  const etatsBalayage = useRef(reseau.etats);
  etatsBalayage.current = reseau.etats;
  const surSelection = useCallback((ids: string[], mode: ModeSelection) => {
    const deja = mode === "retirer" ? [] : ids.filter((id) => etatsBalayage.current.get(id)?.balaye);
    if (deja.length === 1 && ids.length === 1) setMessageBalayage(tr("Déjà balayé : {etat}. Ce sera un second passage.", { etat: texteEtatTronconApk(etatsBalayage.current.get(deja[0])).replace(/^\u200f/, "") }));
    else if (deja.length) setMessageBalayage(tr("{n} tronçons déjà balayés dans la sélection : seconds passages.", { n: deja.length }));
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

  const lineaire = useMemo(() => lineaireSelection(troncons, reseau.longueurs), [troncons, reseau.longueurs]);
  const dejaBalayes = useMemo(() => new Set([...troncons].filter((id) => reseau.etats.get(id)?.balaye)), [troncons, reseau.etats]);

  // Outils du mode balayage : toucher un par un, lasso au doigt, « Prolonger » le long de la rue.
  const [outilBalayage, setOutilBalayage] = useState<"toucher" | "lasso">("toucher");
  const indexReseau = reseau.index;
  const surLasso = useCallback((anneau: number[][]) => {
    const ids = idsIndexDansAnneau(indexReseau.values(), anneau);
    if (ids.length) surSelection(ids, "ajouter");
  }, [indexReseau, surSelection]);
  const prolonger = () => {
    setGeometriesDemandees(true);
    const ajoutes = prolongerSelection(indexReseau, construireAdjacence(indexReseau.values()), troncons);
    if (ajoutes.length) {
      surSelection(ajoutes, "ajouter");
      setMessageBalayage("");
    } else {
      setMessageBalayage(tr("Rien à prolonger : jonction à 3 branches, bout de rue ou changement de direction (± 20°)."));
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
      const lignes = preparerBalayages(troncons, { ...choix, marcheId, sourceSaisie: estContexteApk() ? "tablette" : "web" }, undefined, dejaBalayes);
      const { restants } = await enregistrerBalayages(lignes);
      setTroncons(new Set());
      setMessageBalayage(restants === 0
        ? tr("{n} balayages enregistrés.", { n: lignes.length }, `${lignes.length} balayage${lignes.length > 1 ? "s" : ""} enregistré${lignes.length > 1 ? "s" : ""}.`)
        : tr("{n} balayages gardés sur l'appareil : envoi au retour du réseau.", { n: lignes.length },
          `${lignes.length} balayage${lignes.length > 1 ? "s" : ""} gardé${lignes.length > 1 ? "s" : ""} sur l'appareil : envoi au retour du réseau.`));
      await rafraichirAttente();
      await reseau.recharger();
    } catch (e) {
      setMessageBalayage(tr("Erreur : {e}", { e: messageReseau(e) }));
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
    const motif = window.prompt(tr("Motif de l'annulation du dernier balayage de ce tronçon :"));
    if (motif == null || !motif.trim()) return;
    try {
      const fait = await annulerDernierBalayage(tronconId, motif);
      setMessageBalayage(tr(fait ? "Balayage annulé." : "Aucun balayage à annuler sur ce tronçon."));
      await reseau.recharger();
    } catch (e) {
      setMessageBalayage(tr("Erreur : {e}", { e: messageReseau(e) }));
    }
  }, [reseau]);

  const basculerBalayage = () => {
    if (!modeBalayage) {
      reseau.setActif(true);
      setReseauOuvert(true);
      reseau.setColoration("balayage");
    }
    setModeBalayage((v) => !v);
  };

  const balayage: BalayagePanneau = {
    peut: peutBalayer, actif: modeBalayage, basculer: basculerBalayage, selection: troncons, lineaire, dejaBalayes,
    vider: () => setTroncons(new Set()), enregistrer, occupe, message: messageBalayage, enAttente, envoyer, peutAnnuler,
  };

  const reseauCarte: ReseauCarteProps | undefined = reseau.actif ? {
    secteurs: reseau.secteursAffiches, coloration: reseau.coloration, palette: reseau.palette, etats: reseau.etats,
    libelles: reseau.libelles, modeBalayage, outil: outilBalayage, selection: troncons, surSelection, surLasso, peutAnnuler, annuler,
    surZoom: reseau.surZoom, tuiles: reseau.tuiles,
  } : undefined;

  // « Enregistrer… » : ouvre le panneau Réseau et amène le formulaire du balayage (équipe, date, méthode) à l'écran,
  // même si le panneau était déjà ouvert (sur la tablette, il est en bas d'une longue liste de secteurs).
  const allerAuFormulaire = () => {
    setReseauOuvert(true);
    setOngletReseau("balayage");
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
  const nbSecteursReseau = reseau.actif ? (reseau.tuiles ? reseau.choisis.size : reseau.secteursAffiches.filter((s) => s.data).length) : 0;
  // Bornes des secteurs cochés (cadrage de la carte imprimée quand le réseau s'affiche en tuiles).
  const bornesChoisis = useMemo<[number, number, number, number] | null>(() => {
    const coords = (reseau.contexte?.secteurs ?? []).filter((x) => reseau.choisis.has(x.id) && x.geom)
      .flatMap((x) => (x.geom!.type === "Polygon" ? x.geom!.coordinates.flat() : x.geom!.coordinates.flat(2)));
    if (!coords.length || reseau.choisis.has(SANS_SECTEUR)) return reseau.bornes;
    const xs = coords.map((c) => c[0]);
    const ys = coords.map((c) => c[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }, [reseau.contexte, reseau.choisis, reseau.bornes]);
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
      reseau: reseau.actif ? {
        secteurs: reseau.secteursAffiches, coloration: reseau.coloration, palette: reseau.palette, etats: reseau.etats,
        tuiles: reseau.tuiles, inventaire: reseau.tuiles ? reseau.inventaire : undefined, bornes: reseau.tuiles ? bornesChoisis : null,
      } : null,
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
      <TabsContent className="min-h-0 overflow-auto px-4 py-3" value="fuite"><ApercuFuite fuite={choisie} libelles={libelles} /></TabsContent>
      <TabsContent className="min-h-0 overflow-auto px-4 py-3" value="filtres">
        <FiltresCarteForm filtres={filtres} changer={(f) => setFiltres((x) => ({ ...x, ...f }))} secteurs={secteurs} />
      </TabsContent>
      {peut("exports", "lire") && (
        <TabsContent className="min-h-0 overflow-auto px-4 py-3" value="impression">
          <PanneauImpression key={marcheId} marcheId={marcheId ?? ""} peutEnregistrer={peut("exports", "creer")}
            titreDefaut={`Carte des fuites – ${libelleSecteur ?? marche?.code ?? ""}`} nombreSurCarte={placees.length}
            nombreListe={filtrees.length} filtres={filtresImpression} imprimer={imprimer} />
        </TabsContent>
      )}
    </OngletsCarte>
  );

  return (
    <>
      <div data-content-padding="false" className={cn(
        "flex h-[calc(100dvh-var(--dashboard-header-height))] flex-col overflow-hidden lg:grid lg:divide-x",
        modeBalayage || listeMasquee ? "lg:grid-cols-1" : "lg:grid-cols-[300px_minmax(0,1fr)]",
      )}>
        {/* Mode balayage : la carte occupe tout l'écran (tablette), la liste des fuites est masquée. */}
        <div className={cn("order-2 min-h-0 flex-1 overflow-hidden lg:order-1 lg:h-full", modeBalayage && "hidden", listeMasquee && "lg:hidden")}>
          <ListeCarte fuites={filtrees} total={fuites.length} compteurs={compteurs} statut={statut} choisirStatut={setStatut}
            texte={texte} changerTexte={setTexte} selection={selection} choisir={choisir} libelles={libelles}
            filtresActifs={filtresActifs} effacer={effacer} ouvrirFiltres={() => { setOnglet("filtres"); if (window.innerWidth < 1024) setFeuille(true); }} />
        </div>
        {/* Mode balayage (C4) : la carte en plein écran, par-dessus l'en-tête et le menu (tablette comme panneau web). */}
        <div className={cn("order-1 shrink-0 overflow-hidden lg:order-2 lg:h-full", modeBalayage ? cn("h-full flex-1", styles.pleinEcran) : "h-[44vh]")}>
          <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
            <div className="relative min-h-0 overflow-hidden">
              <Carte ref={carte} fuites={placees} zones={zonesAffichees} secteurs={secteursAffiches} libelles={libelles} reseau={reseauCarte}
                satellite={satellite} bornesReseau={reseau.bornes} surZoom={setZoom} />
              {/* Réseau d'eau et mode balayage (lot S) : commandes posées sur la carte, visibles aussi sur la tablette */}
              {!reseauOuvert && !modeBalayage && (
                <div className="absolute top-3 left-3 z-[3] flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="hidden bg-background shadow-sm lg:inline-flex" onClick={() => basculerListe(!listeMasquee)}
                    aria-pressed={!listeMasquee} title={listeMasquee ? "Afficher la liste des fuites" : "Masquer la liste : carte plus large"}>
                    {listeMasquee ? <PanelLeftOpen data-icon="inline-start" /> : <PanelLeftClose data-icon="inline-start" />}Liste
                  </Button>
                  <Button size="sm" variant="outline" className="bg-background shadow-sm" onClick={() => setReseauOuvert(true)}>
                    <Network data-icon="inline-start" />{tb("Réseau")}{reseau.actif && nbSecteursReseau > 0 ? ` (${nbSecteursReseau})` : ""}
                  </Button>
                  {peutBalayer && (
                    <Button size="sm" variant={modeBalayage ? "default" : "outline"} className={cn(!modeBalayage && "bg-background", "shadow-sm")} onClick={basculerBalayage}>
                      <Route data-icon="inline-start" />Balayage{troncons.size > 0 ? ` (${troncons.size})` : ""}
                    </Button>
                  )}
                </div>
              )}
              {modeBalayage && (
                <div className={cn("ancien", styles.barreBalayage, reseauOuvert && styles.avecPanneau)} role="toolbar" aria-label="Outils du mode balayage" dir={rtl ? "rtl" : undefined}>
                  {!reseauOuvert && (
                    <button type="button" onClick={() => setReseauOuvert(true)} title={tb("Secteurs, légende et enregistrement")}>
                      <Network aria-hidden="true" className="me-1 inline size-4 align-[-3px]" />{tb("Réseau")}
                    </button>
                  )}
                  <span className={styles.compte} aria-live="polite">
                    {tb("{n} tronçons · {l}", { n: nombre(troncons.size, 0), l: formaterLineaire(lineaire) }, `${nombre(troncons.size, 0)} tronçon${troncons.size > 1 ? "s" : ""} · ${formaterLineaire(lineaire)}`)}
                    {dejaBalayes.size > 0 && <span className={styles.repasse}>{tb(" · dont {n} déjà balayés", { n: nombre(dejaBalayes.size, 0) }, ` · dont ${nombre(dejaBalayes.size, 0)} déjà balayé${dejaBalayes.size > 1 ? "s" : ""}`)}</span>}
                  </span>
                  <button type="button" aria-pressed={outilBalayage === "toucher"} className={outilBalayage === "toucher" ? "actif" : ""} onClick={() => setOutilBalayage("toucher")}>{tb("Toucher")}</button>
                  <button type="button" aria-pressed={outilBalayage === "lasso"} className={outilBalayage === "lasso" ? "actif" : ""} onClick={() => { setOutilBalayage("lasso"); setGeometriesDemandees(true); }}>{tb("Lasso")}</button>
                  <button type="button" disabled={troncons.size === 0 || (!!reseau.tuiles && reseau.nbEnChargement > 0)} onClick={prolonger}
                    title={reseau.tuiles && reseau.nbEnChargement > 0 ? tb("Préparation des tronçons…") : undefined}>{tb("Prolonger")}</button>
                  <button type="button" disabled={troncons.size === 0} onClick={() => setTroncons(new Set())}>{tb("Désélectionner tout")}</button>
                  <button type="button" className="primaire" disabled={troncons.size === 0 || occupe} onClick={allerAuFormulaire}>{tb("Enregistrer…")}</button>
                  <button type="button" onClick={basculerBalayage}>{tb("Quitter le balayage")}</button>
                  {messageBalayage && !reseauOuvert && <span className="discret" role="status">{messageBalayage}</span>}
                </div>
              )}
              {reseauOuvert && (
                <div className="ancien">
                  <PanneauReseau reseau={reseau} balayage={balayage} fermer={() => setReseauOuvert(false)} onglet={ongletReseau} changerOnglet={setOngletReseau} />
                </div>
              )}
              <CommandesCarte placees={placees.length} sansPosition={sansPosition} chargement={chargement} erreur={erreur}
                recentrer={() => carte.current?.recentrer()} actualiser={actualiser} decalee={reseauOuvert} />
              {satelliteDisponible() && (
                <VignetteFond satellite={satellite} basculer={basculerSatellite} className="absolute right-2.5 bottom-8 z-[3]"
                  centre={reseau.bornes ? [(reseau.bornes[0] + reseau.bornes[2]) / 2, (reseau.bornes[1] + reseau.bornes[3]) / 2] : CENTRE_DEFAUT}
                  libelles={{ satellite: tb("Satellite"), plan: tb("Plan") }} />
              )}
              {satellite && zoom < ZOOM_MIN_SATELLITE && (
                <p className={cn("absolute bottom-20 z-[3] m-0 rounded-lg border bg-background/95 px-3 py-1.5 text-muted-foreground text-xs shadow-sm", reseauOuvert ? "left-[calc(min(290px,92vw)+0.5rem)]" : "left-2")}>
                  Image satellite à partir du zoom {ZOOM_MIN_SATELLITE} : rapprochez-vous.
                </p>
              )}
              {chargement && fuites.length === 0 && (
                <div className="absolute inset-0 grid place-items-center bg-background/60 text-muted-foreground text-sm"><span className="flex items-center gap-2"><Spinner />Chargement des fuites…</span></div>
              )}
            </div>
            {/* Cadre sous la carte : hauteur réglée pour que la fiche d'une fuite s'y lise entière, sans défilement */}
            {!modeBalayage && <div className={cn("hidden min-h-0 overflow-hidden border-t lg:block", choisie || onglet !== "fuite" ? "h-[12.5rem]" : "h-10")}>{details}</div>}
          </div>
        </div>
      </div>

      <Sheet open={feuille} onOpenChange={setFeuille}>
        <SheetContent side="bottom" className="h-[70vh] gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{choisie ? `Fuite N° ${choisie.numero}` : "Détails"}</SheetTitle>
            <SheetDescription>Détails de la fuite choisie, filtres et impression.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden">{details}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

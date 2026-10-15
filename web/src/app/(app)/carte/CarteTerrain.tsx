"use client";

// Carte terrain : ouverte par le bouton « Carte » de l'APK (/carte?mode=terrain), pour tout agent qui lit les fuites
// (détection, réparation, réfection). Plein écran, en lecture seule : fuites, réseau, zones balayées, satellite et
// position de l'agent, en calques qu'il affiche ou masque. Un toucher sur une fuite ouvre sa bulle ; « Ouvrir la
// fiche » ouvre la fiche dans l'application de la tablette, « Y aller » l'itinéraire dans l'appli de cartes.
// Sans réseau : la copie gardée par la carte du balayage (lot CH), mêmes fichiers et même paquet.
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layers, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { dateHeure, libellesMarche } from "@/lib/format";
import { useLangueApk } from "@/lib/langue-apk";
import { useSession } from "@/lib/session";
import type { StatutFuite } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Carte, type CarteRef, type OptionsTerrain, type ReseauCarteProps } from "./Carte";
import { estPrioritaire, geometrieValide, type FuiteCarte, type PositionAgent } from "./commun";
import { CommandesCarte } from "./details-carte";
import { signalerApk, useDonneesCarte, useMarcheDemande, usePaquetCarte } from "./donnees-carte";
import { CALQUES_DEFAUT, PanneauCalques, type Calques } from "./PanneauCalques";
import styles from "./reseau.module.css";
import { ZOOM_MIN_SATELLITE, satelliteDisponible } from "./satellite";
import { useReseau } from "./useReseau";

const CLE_CALQUES = "suivi-fuites:carte-terrain:calques";

function lireCalques(): Calques {
  try {
    const c = JSON.parse(window.localStorage.getItem(CLE_CALQUES) ?? "null") as Partial<Calques> | null;
    return c && typeof c === "object" ? { ...CALQUES_DEFAUT, ...c, statuts: { ...(c.statuts ?? {}) } } : CALQUES_DEFAUT;
  } catch {
    return CALQUES_DEFAUT;
  }
}

type EtatPosition = "arret" | "recherche" | "ok" | "refusee" | "introuvable";

/**
 * Position GPS de l'agent tant que le calque est affiché et la page visible (batterie) : précision maximale, mise à
 * jour au fil des déplacements.
 */
function usePosition(actif: boolean) {
  const [position, setPosition] = useState<PositionAgent | null>(null);
  const [etat, setEtat] = useState<EtatPosition>("arret");
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const changer = () => setVisible(!document.hidden);
    changer();
    document.addEventListener("visibilitychange", changer);
    return () => document.removeEventListener("visibilitychange", changer);
  }, []);
  useEffect(() => {
    if (!actif || !visible) {
      if (!actif) setEtat("arret");
      return;
    }
    if (!("geolocation" in navigator)) {
      setEtat("introuvable");
      return;
    }
    setEtat((e) => (e === "ok" ? e : "recherche"));
    const id = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lon: p.coords.longitude, lat: p.coords.latitude, precision: p.coords.accuracy });
        setEtat("ok");
      },
      (e) => setEtat((avant) => (e.code === e.PERMISSION_DENIED ? "refusee" : avant === "ok" ? "ok" : "introuvable")),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [actif, visible]);
  return { position: actif ? position : null, etat };
}

export function CarteTerrain() {
  const { marche, peut, profil } = useSession();
  const parametres = useSearchParams();
  const { tb, rtl } = useLangueApk();
  const carte = useRef<CarteRef>(null);

  const marcheId = useMarcheDemande(parametres.get("marche"));
  const libelles = libellesMarche(marche);

  const [calques, setCalquesEtat] = useState<Calques>(CALQUES_DEFAUT);
  useEffect(() => setCalquesEtat(lireCalques()), []);
  const changerCalques = (c: Partial<Calques>) => {
    setCalquesEtat((avant) => {
      const suite = { ...avant, ...c };
      try {
        window.localStorage.setItem(CLE_CALQUES, JSON.stringify(suite));
      } catch {
        /* stockage indisponible : choix gardé pour cette ouverture */
      }
      return suite;
    });
  };
  const [panneau, setPanneau] = useState(false);

  const peutLireBalayage = peut("balayage", "lire");
  const reseau = useReseau(marcheId, peutLireBalayage, true, false, true);
  const hl = usePaquetCarte(marcheId, reseau.contexte, profil?.id);
  const { fuites, secteurs, zones, erreur, chargement, charger } = useDonneesCarte(marcheId, hl.paquet);

  // Fuites affichées : leur statut est coché, ou elles sont prioritaires et le calque « prioritaires » l'est.
  const placees = useMemo(() => fuites.filter((f) => f.latitude != null && f.longitude != null), [fuites]);
  const visibles = useMemo(() => placees.filter((f) => calques.statuts[f.statut] !== false || (calques.prioritaires && estPrioritaire(f))),
    [placees, calques.statuts, calques.prioritaires]);
  const nombres = useMemo(() => {
    const c: Partial<Record<StatutFuite, number>> = {};
    placees.forEach((f) => (c[f.statut] = (c[f.statut] ?? 0) + 1));
    return c;
  }, [placees]);
  const nbPrioritaires = useMemo(() => placees.filter(estPrioritaire).length, [placees]);
  const prioritaires = calques.prioritaires;
  const alerte = useCallback((f: FuiteCarte) => prioritaires && estPrioritaire(f), [prioritaires]);

  const secteursAffiches = useMemo(() => secteurs.filter((s) => geometrieValide(s.geom)), [secteurs]);
  const zonesAffichees = useMemo(() => zones.filter((z) => geometrieValide(z.geom)), [zones]);

  // Réseau : diamètres ; avec les zones balayées, état de balayage ; zones balayées seules : tronçons balayés seuls.
  const reseauCarte: ReseauCarteProps | undefined = (calques.reseau || (calques.zones && peutLireBalayage)) ? {
    secteurs: reseau.secteursAffiches, coloration: calques.zones && peutLireBalayage ? "balayage" : "diametre", palette: reseau.palette,
    etats: reseau.etats, libelles: reseau.libelles, modeBalayage: false, outil: "toucher", selection: VIDE,
    surSelection: rien, surLasso: rien, peutAnnuler: false, annuler: rien, surZoom: reseau.surZoom, tuiles: reseau.tuiles,
    seulementBalayes: calques.zones && !calques.reseau,
  } : undefined;

  const { position, etat: etatPosition } = usePosition(calques.position);
  const allerAMaPosition = () => {
    if (!calques.position) changerCalques({ position: true });
    if (position) carte.current?.allerA(position.lon, position.lat);
  };
  // Premier point reçu après « Aller à ma position » : la vue y va aussitôt.
  const allerDesQuePossible = useRef(false);
  useEffect(() => {
    if (allerDesQuePossible.current && position) {
      allerDesQuePossible.current = false;
      carte.current?.allerA(position.lon, position.lat);
    }
  }, [position]);

  const ouvrirFiche = useCallback((id: string) => signalerApk("carte:ouvrir-fuite", { id }), []);
  const terrain: OptionsTerrain = useMemo(() => ({
    ouvrirFiche, alerte, limites: calques.limites, statutSecteurs: calques.zones, position,
  }), [ouvrirFiche, alerte, calques.limites, calques.zones, position]);

  // Retour de la fiche (?fuite=…) : la carte revient sur la fuite et rouvre sa bulle.
  const fuiteDemandee = parametres.get("fuite");
  const demandeTraitee = useRef<string | null>(null);
  useEffect(() => {
    if (!fuiteDemandee || demandeTraitee.current === fuiteDemandee || !fuites.length) return;
    const f = fuites.find((x) => x.id === fuiteDemandee);
    if (!f) return;
    demandeTraitee.current = fuiteDemandee;
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

  const [zoom, setZoom] = useState(12);
  const satellite = satelliteDisponible() && calques.satellite;
  const messagePosition = calques.position && etatPosition === "refusee"
    ? tb("Position refusée : autorisez la localisation dans les réglages de la tablette.")
    : calques.position && etatPosition === "introuvable" ? tb("Position introuvable. Sortez à l'air libre et réessayez.") : "";
  const nbActifs = [calques.prioritaires, calques.reseau, calques.zones, calques.limites, satellite, calques.position].filter(Boolean).length;

  return (
    // data-ui : contrôles posés sur la carte (ombre légère autorisée, README § Interface épurée).
    <div data-ui="carte-terrain" className={cn("h-full", styles.pleinEcran)}>
      <div className="relative h-full overflow-hidden">
        {hl.paquet !== null && (!hl.paquet || marcheId) && (
          <Carte ref={carte} fuites={visibles} zones={zonesAffichees} secteurs={secteursAffiches} libelles={libelles} reseau={reseauCarte}
            satellite={satellite} bornesReseau={reseau.bornes} surZoom={setZoom} fond={hl.fondLocal} terrain={terrain} />
        )}

        {!panneau && (
          <div className="absolute top-3 left-3 z-[3] flex flex-wrap items-center gap-2" dir={rtl ? "rtl" : undefined}>
            <Button size="lg" variant="outline" className="h-12 bg-background px-4 text-base shadow-sm" onClick={() => setPanneau(true)}
              aria-label={tb("Afficher ou masquer les calques")}>
              <Layers data-icon="inline-start" />{tb("Calques")}
              <span className="rounded-full bg-muted px-1.5 text-muted-foreground text-xs tabular-nums">{nbActifs}</span>
            </Button>
            {reseau.copieDu && (
              <span className="rounded-lg bg-background px-3 py-1.5 text-foreground text-xs shadow-sm">
                {tb("Hors ligne · état du {date}", { date: dateHeure(reseau.copieDu) })}
              </span>
            )}
          </div>
        )}
        {panneau && (
          <PanneauCalques calques={calques} changer={changerCalques} nombres={nombres} nbPrioritaires={nbPrioritaires}
            satellite={satelliteDisponible()} peutLireBalayage={peutLireBalayage} fermer={() => setPanneau(false)} />
        )}

        {/* Ma position : au-dessus de la vignette du fond, côté droit (zoom en haut à droite). */}
        <div className="absolute right-2.5 bottom-8 z-[3] flex flex-col items-end gap-2" dir={rtl ? "rtl" : undefined}>
          {messagePosition && <p className="m-0 max-w-64 rounded-lg border bg-background/95 px-3 py-1.5 text-xs shadow-sm">{messagePosition}</p>}
          {calques.position && etatPosition === "recherche" && !position && (
            <p className="m-0 flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-1.5 text-muted-foreground text-xs shadow-sm">
              <Spinner />{tb("Recherche de la position…")}
            </p>
          )}
          {position && calques.position && (
            <p className="m-0 rounded-lg border bg-background/95 px-2 py-1 text-muted-foreground text-xs tabular-nums shadow-sm">
              {tb("Position ± {n} m", { n: Math.round(position.precision) })}
            </p>
          )}
          <Button size="icon-lg" variant="outline" className="size-14 rounded-full bg-background shadow-sm"
            onClick={() => { if (!position) allerDesQuePossible.current = true; allerAMaPosition(); }}
            aria-label={tb("Aller à ma position")} title={tb("Aller à ma position")}>
            <LocateFixed className="size-6" style={{ color: position ? "#2563eb" : undefined }} />
          </Button>
        </div>

        <CommandesCarte placees={visibles.length} sansPosition={0} chargement={chargement} erreur={erreur ? tb(erreur) : ""}
          recentrer={() => carte.current?.recentrer()} actualiser={() => { charger(); reseau.recharger(); }} decalee={panneau} />
        {satellite && zoom < ZOOM_MIN_SATELLITE && (
          <p className={cn("absolute bottom-20 z-[3] m-0 rounded-lg border bg-background/95 px-3 py-1.5 text-muted-foreground text-xs shadow-sm",
            panneau ? "left-[calc(min(280px,92vw)+1rem)]" : "left-2")}>
            {tb("Image satellite à partir du zoom {z} : rapprochez-vous.", { z: ZOOM_MIN_SATELLITE })}
          </p>
        )}
        {chargement && fuites.length === 0 && (
          <div className="absolute inset-0 grid place-items-center bg-background/60 text-muted-foreground text-sm">
            <span className="flex items-center gap-2"><Spinner />{tb("Chargement des fuites…")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const VIDE = new Set<string>();
const rien = () => undefined;

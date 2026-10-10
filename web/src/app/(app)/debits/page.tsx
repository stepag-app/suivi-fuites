"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { EnTetePage, Vide } from "@/components/en-tete-page";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { messageErreur } from "@/lib/format";
import { useSession } from "@/lib/session";
import { AValider } from "./AValider";
import { Campagnes } from "./Campagnes";
import { Saisie } from "./Saisie";
import { Synthese } from "./Synthese";
import { baseAbsente, chargerDebits, type DonneesDebits } from "./donnees";

type Onglet = "synthese" | "campagnes" | "a-valider";

export default function PageDebits() {
  return (
    <Suspense fallback={<p className="flex items-center gap-2 text-muted-foreground text-sm"><Spinner />Chargement…</p>}>
      <Debits />
    </Suspense>
  );
}

function Debits() {
  const { marche, peut } = useSession();
  const router = useRouter();
  const chemin = usePathname();
  const params = useSearchParams();
  const lire = peut("mesures_debit", "lire");
  const valider = peut("mesures_debit", "valider");
  const saisir = peut("mesures_debit", "creer");
  const exporter = peut("exports", "lire");
  const montants = peut("quantites", "lire");
  const parametres = peut("parametres", "creer") || peut("parametres", "modifier");
  const demande = params.get("onglet") as Onglet | null;
  const onglet: Onglet = demande === "campagnes" || (demande === "a-valider" && valider) ? demande : params.get("campagne") ? "campagnes" : "synthese";
  const campagneId = params.get("campagne");

  const [d, setD] = useState<DonneesDebits | null>(null);
  const [erreur, setErreur] = useState("");
  const [absente, setAbsente] = useState(false);
  const [chargement, setChargement] = useState(false);
  const derniere = useRef(0);
  const marcheId = marche?.id;

  const charger = useCallback(async () => {
    if (!marcheId || !lire) return;
    const n = ++derniere.current;
    setChargement(true);
    setErreur("");
    try {
      const donnees = await chargerDebits(marcheId, valider);
      if (n === derniere.current) { setD(donnees); setAbsente(false); }
    } catch (e) {
      if (n !== derniere.current) return;
      if (baseAbsente(e)) setAbsente(true);
      else setErreur(messageErreur(e));
    }
    if (n === derniere.current) setChargement(false);
  }, [marcheId, lire, valider]);
  useEffect(() => { setD(null); charger(); }, [charger]);

  const aller = (o: Onglet, campagne?: string | null) => {
    const q = new URLSearchParams();
    if (o !== "synthese") q.set("onglet", o);
    if (campagne) q.set("campagne", campagne);
    router.replace(`${chemin}${q.size ? `?${q}` : ""}`, { scroll: false });
  };

  async function exporterSynthese() {
    if (!d || !marcheId) return;
    try {
      const [{ documentSynthese }, { exporter: generer }, { chargerContexteRapport }] = await Promise.all([
        import("./documents"), import("@/lib/export/generer"), import("@/lib/export/rapport-fuite"),
      ]);
      await generer(documentSynthese(await chargerContexteRapport(marcheId, montants), d.resultats, d.camps, d.nuits, montants), "xlsx");
    } catch (e) {
      toast.error(messageErreur(e));
    }
  }

  if (!marche) return null;
  if (!lire) {
    return <Vide>Les débits de nuit demandent le droit « Mesures de débit : voir » (matrice des droits).</Vide>;
  }
  const campagne = campagneId ? d?.campagnes.find((c) => c.id === campagneId) : null;

  return (
    <div className="flex flex-col gap-4">
      <EnTetePage
        titre="Débits de nuit"
        description="Mesures de 0 h à 6 h aux points de comptage, Qi, Qf, contrôles de maintien et pénalités de performance (CPS art. II-17, II-22, II-23)."
        actions={<>
          {parametres && <Button variant="outline" asChild><Link href="/parametres?onglet=debits" prefetch={false}><Settings2 data-icon="inline-start" />Réglages et points</Link></Button>}
          {exporter && d && <Button variant="outline" onClick={exporterSynthese}><FileSpreadsheet data-icon="inline-start" />Excel</Button>}
          <Button variant="outline" onClick={charger} disabled={chargement}><RefreshCw data-icon="inline-start" className={chargement ? "animate-spin" : ""} />Actualiser</Button>
        </>}
      />
      {absente ? (
        <Alert><AlertTitle>Débits de nuit pas encore installés</AlertTitle><AlertDescription>La migration des débits de nuit n&apos;est pas encore déployée sur la base.</AlertDescription></Alert>
      ) : erreur ? (
        <Alert variant="destructive"><AlertTitle>Chargement impossible</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>
      ) : !d ? (
        <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <Tabs value={onglet} onValueChange={(v) => aller(v as Onglet)}>
          <TabsList>
            <TabsTrigger value="synthese">Synthèse</TabsTrigger>
            <TabsTrigger value="campagnes">Campagnes et saisie</TabsTrigger>
            {valider && <TabsTrigger value="a-valider">À valider{d.aValider > 0 && <Badge className="ml-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-300">{d.aValider}</Badge>}</TabsTrigger>}
          </TabsList>
          <TabsContent value="synthese" className="mt-2"><Synthese d={d} montants={montants} /></TabsContent>
          <TabsContent value="campagnes" className="mt-2">
            {campagneId && campagne ? (
              <Saisie key={campagne.id} d={d} campagne={campagne} peutSaisir={saisir && marche.actif !== false} peutValider={valider}
                peutExporter={exporter} retour={() => aller("campagnes")} actualiser={charger} />
            ) : campagneId ? (
              <Vide>Campagne introuvable ou supprimée.</Vide>
            ) : (
              <Campagnes d={d} peutGerer={valider && marche.actif !== false} peutExporter={exporter} ouvrir={(id) => aller("campagnes", id)} actualiser={charger} />
            )}
          </TabsContent>
          {valider && (
            <TabsContent value="a-valider" className="mt-2">
              <AValider marcheId={d.marcheId} ouvrir={(id) => aller("campagnes", id)} actualiser={charger} />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FormatPapier, OrientationPapier } from "@/lib/export/carte-pdf";
import { ChoixRubriques } from "@/lib/export/ChoixRubriques";
import { dernierChoix } from "@/lib/export/rubriques";
import { messageErreur } from "@/lib/format";
import type { ChoixImpression } from "./impression";

interface Props {
  marcheId: string;
  peutEnregistrer: boolean;
  titreDefaut: string;
  nombreSurCarte: number;
  nombreListe: number;
  filtres: string;
  imprimer: (choix: ChoixImpression, etape: (texte: string) => void) => Promise<string>;
}

/** Réglages du PDF de la carte (format, orientation, titre, liste) : panneau sous la carte. */
export function PanneauImpression({ marcheId, peutEnregistrer, titreDefaut, nombreSurCarte, nombreListe, filtres, imprimer }: Props) {
  const [format, setFormat] = useState<FormatPapier>("a4");
  const [orientation, setOrientation] = useState<OrientationPapier>("paysage");
  const [titre, setTitre] = useState(titreDefaut);
  const [titreRetouche, setTitreRetouche] = useState(false);
  const [rubriques, setRubriques] = useState<Set<string>>(() => dernierChoix("carte", marcheId));
  const avecListe = rubriques.has("liste") && nombreListe > 0;
  const [cadrage, setCadrage] = useState<ChoixImpression["cadrage"]>("contenu");
  const [etape, setEtape] = useState("");
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");

  useEffect(() => {
    if (!titreRetouche) setTitre(titreDefaut);
  }, [titreDefaut, titreRetouche]);
  const occupe = !!etape;

  async function lancer() {
    setErreur("");
    setInfo("");
    setEtape("Préparation…");
    try {
      setInfo(await imprimer({ format, orientation, titre: titre.trim() || titreDefaut, avecListe, cadrage, rubriques: avecListe ? rubriques : new Set([...rubriques].filter((r) => r !== "liste")) }, setEtape));
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setEtape("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field className="gap-1.5">
          <FieldLabel>Format</FieldLabel>
          <ToggleGroup type="single" variant="outline" spacing={0} value={format} onValueChange={(v) => v && setFormat(v as FormatPapier)} className="w-full *:flex-1">
            <ToggleGroupItem value="a4" disabled={occupe}>A4</ToggleGroupItem>
            <ToggleGroupItem value="a3" disabled={occupe}>A3</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field className="gap-1.5">
          <FieldLabel>Orientation</FieldLabel>
          <ToggleGroup type="single" variant="outline" spacing={0} value={orientation} onValueChange={(v) => v && setOrientation(v as OrientationPapier)} className="w-full *:flex-1">
            <ToggleGroupItem value="paysage" disabled={occupe}>Paysage</ToggleGroupItem>
            <ToggleGroupItem value="portrait" disabled={occupe}>Portrait</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Field className="gap-1.5 xl:col-span-2">
          <FieldLabel htmlFor="titre-carte">Titre</FieldLabel>
          <Input id="titre-carte" value={titre} maxLength={120} disabled={occupe} onChange={(e) => { setTitre(e.target.value); setTitreRetouche(true); }} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel className="font-normal text-muted-foreground">Cadrage</FieldLabel>
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} value={cadrage} onValueChange={(v) => v && setCadrage(v as ChoixImpression["cadrage"])}>
            <ToggleGroupItem value="contenu" disabled={occupe}>Fuites et réseau affichés</ToggleGroupItem>
            <ToggleGroupItem value="ecran" disabled={occupe}>Vue de l&apos;écran</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Button size="sm" disabled={occupe} onClick={lancer}>
          {occupe ? <Spinner /> : <Printer data-icon="inline-start" />}{occupe ? etape : "Télécharger le PDF"}
        </Button>
      </div>
      <ChoixRubriques document="carte" marcheId={marcheId} valeur={rubriques} changer={setRubriques} peutEnregistrer={peutEnregistrer} desactive={occupe} />
      <p className="text-muted-foreground text-xs">
        {nombreSurCarte} fuite{nombreSurCarte > 1 ? "s" : ""} sur la carte ({nombreListe} dans la liste). {filtres}. {cadrage === "contenu" ? "La carte est cadrée sur les fuites et le réseau affichés" : "La carte est imprimée comme elle est cadrée à l'écran"},
        en haute définition, avec les rubriques cochées ci-dessus.
      </p>
      {erreur && <Alert variant="destructive"><AlertDescription>{erreur}</AlertDescription></Alert>}
      {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
    </div>
  );
}

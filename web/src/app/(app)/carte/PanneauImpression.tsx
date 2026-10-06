"use client";

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { FormatPapier, OrientationPapier } from "@/lib/export/carte-pdf";
import { messageErreur } from "@/lib/format";
import type { ChoixImpression } from "./impression";

interface Props {
  titreDefaut: string;
  nombreSurCarte: number;
  nombreListe: number;
  filtres: string;
  imprimer: (choix: ChoixImpression, etape: (texte: string) => void) => Promise<string>;
}

/** Réglages du PDF de la carte (format, orientation, titre, liste) : panneau sous la carte. */
export function PanneauImpression({ titreDefaut, nombreSurCarte, nombreListe, filtres, imprimer }: Props) {
  const [format, setFormat] = useState<FormatPapier>("a4");
  const [orientation, setOrientation] = useState<OrientationPapier>("paysage");
  const [titre, setTitre] = useState(titreDefaut);
  const [titreRetouche, setTitreRetouche] = useState(false);
  const [avecListe, setAvecListe] = useState(false);
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
      setInfo(await imprimer({ format, orientation, titre: titre.trim() || titreDefaut, avecListe }, setEtape));
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setEtape("");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
      <Field orientation="horizontal">
        <Checkbox id="liste-carte" checked={avecListe} disabled={occupe || nombreListe === 0} onCheckedChange={(v) => setAvecListe(v === true)} />
        <FieldLabel htmlFor="liste-carte" className="font-normal">Ajouter la liste des fuites affichées ({nombreListe})</FieldLabel>
      </Field>
      <p className="text-muted-foreground text-xs">
        {nombreSurCarte} fuite{nombreSurCarte > 1 ? "s" : ""} sur la carte. {filtres}. La carte est imprimée comme elle est cadrée à l&apos;écran,
        en haute définition, avec légende, échelle, nord et coordonnées GPS.
      </p>
      {erreur && <Alert variant="destructive"><AlertDescription>{erreur}</AlertDescription></Alert>}
      {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
      <div>
        <Button disabled={occupe} onClick={lancer}>
          {occupe ? <Spinner /> : <Printer data-icon="inline-start" />}{occupe ? etape : "Télécharger le PDF"}
        </Button>
      </div>
    </div>
  );
}

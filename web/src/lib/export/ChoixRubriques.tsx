"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { messageErreur } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  enregistrerModele, lireModeles, memoriserChoix, retirerModele, rubriquesVisibles,
  type DocumentRubriques, type ModeleRubriques,
} from "./rubriques";

interface Props {
  document: DocumentRubriques;
  marcheId: string;
  valeur: Set<string>;
  changer: (choix: Set<string>) => void;
  droits?: { quantites?: boolean };
  /** Droit « exports / créer » : enregistrer, mettre à jour, retirer un modèle du marché. */
  peutEnregistrer?: boolean;
  desactive?: boolean;
  className?: string;
}

/** Rubriques à cocher avant un export, avec les modèles du marché (X7). Le choix est aussi gardé sur l'appareil. */
export function ChoixRubriques({ document, marcheId, valeur, changer, droits, peutEnregistrer = false, desactive = false, className }: Props) {
  const rubriques = rubriquesVisibles(document, droits);
  const [modeles, setModeles] = useState<ModeleRubriques[]>([]);
  const [modeleId, setModeleId] = useState("");
  const [message, setMessage] = useState("");

  const charger = useCallback(async () => {
    try {
      setModeles(await lireModeles(document, marcheId));
    } catch {
      setModeles([]);
    }
  }, [document, marcheId]);
  useEffect(() => {
    charger();
  }, [charger]);

  const appliquer = (choix: Set<string>) => {
    changer(choix);
    memoriserChoix(document, marcheId, choix);
  };
  const basculer = (cle: string, coche: boolean) => {
    const n = new Set(valeur);
    if (coche) n.add(cle);
    else n.delete(cle);
    setModeleId("");
    appliquer(n);
  };

  async function enregistrer(remplacer: boolean) {
    setMessage("");
    const courant = modeles.find((m) => m.id === modeleId);
    const nom = remplacer && courant ? courant.nom : window.prompt("Nom du modèle (ex. « Exigences SRM octobre ») :")?.trim();
    if (!nom) return;
    try {
      await enregistrerModele(document, marcheId, nom, valeur, remplacer ? courant?.id : undefined);
      await charger();
      setMessage(remplacer ? `Modèle « ${nom} » mis à jour.` : `Modèle « ${nom} » enregistré pour ce marché.`);
    } catch (e) {
      setMessage(messageErreur(e));
    }
  }

  async function retirer() {
    const courant = modeles.find((m) => m.id === modeleId);
    if (!courant || !window.confirm(`Retirer le modèle « ${courant.nom} » ?`)) return;
    try {
      await retirerModele(courant.id);
      setModeleId("");
      await charger();
      setMessage(`Modèle « ${courant.nom} » retiré.`);
    } catch (e) {
      setMessage(messageErreur(e));
    }
  }

  return (
    <fieldset data-slot="rubriques" className={cn("flex flex-col gap-2.5 rounded-lg border p-3", className)} disabled={desactive}>
      <legend className="px-1 font-medium text-sm">Rubriques à imprimer</legend>
      {(modeles.length > 0 || peutEnregistrer) && (
        <div className="flex flex-wrap items-center gap-2">
          {modeles.length > 0 && (
            <NativeSelect size="sm" value={modeleId} aria-label="Modèle de rubriques"
              onChange={(e) => {
                const m = modeles.find((x) => x.id === e.target.value);
                setModeleId(e.target.value);
                if (m) appliquer(new Set(m.rubriques));
              }}>
              <NativeSelectOption value="">Modèle du marché…</NativeSelectOption>
              {modeles.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.nom}</NativeSelectOption>)}
            </NativeSelect>
          )}
          {peutEnregistrer && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => enregistrer(false)}><Save data-icon="inline-start" />Enregistrer comme modèle</Button>
              {modeleId && <Button type="button" size="sm" variant="outline" onClick={() => enregistrer(true)}>Mettre à jour</Button>}
              {modeleId && <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={retirer}><Trash2 data-icon="inline-start" />Retirer</Button>}
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {rubriques.map((r) => (
          <label key={r.cle} data-slot="rubrique" className="flex items-start gap-2 text-sm leading-tight">
            <Checkbox checked={valeur.has(r.cle)} onCheckedChange={(v) => basculer(r.cle, v === true)} className="mt-0.5" />
            <span>
              {r.libelle}
              {r.aide && <span className="block text-muted-foreground text-xs">{r.aide}</span>}
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" data-slot="lien" className="text-primary underline-offset-2 hover:underline" onClick={() => { setModeleId(""); appliquer(new Set(rubriques.map((r) => r.cle))); }}>Tout</button>
        <button type="button" data-slot="lien" className="text-primary underline-offset-2 hover:underline" onClick={() => { setModeleId(""); appliquer(new Set()); }}>Rien</button>
        {message && <span className="text-muted-foreground" role="status">{message}</span>}
      </div>
    </fieldset>
  );
}

'use client';

// Validation par étape (V1) : badge d'état, bouton « Valider » avec l'avertissement « aucune photo » (V4 :
// photo facultative avec avertissement), et dialogue commun à la fiche et à l'écran « À valider ».
import { Camera, CircleCheck, Clock3 } from 'lucide-react';
import { useState } from 'react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { dateHeure, messageErreur } from '@/lib/format';
import type { Etape } from '@/lib/saisie/regles';
import { getSupabase } from '@/lib/supabase';

export function EtatValidation({ valideeLe, par }: { valideeLe: string | null | undefined; par?: string | null }) {
  if (valideeLe) {
    return (
      <Badge variant="outline" className="rounded-sm border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300" title={par ? `Validée par ${par}` : undefined}>
        <CircleCheck data-icon="inline-start" />Validée le {dateHeure(valideeLe)}{par ? ` · ${par}` : ''}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="rounded-sm border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">
      <Clock3 data-icon="inline-start" />À valider
    </Badge>
  );
}

export interface ElementAValider { etape: Etape; id: string; libelle: string; nbPhotos: number }

/** « Valider (n) » : nombre réellement validé (déjà validées ou supprimées : ignorées par la base). */
export async function validerEtapes(elements: Pick<ElementAValider, 'etape' | 'id'>[]): Promise<number> {
  const { data, error } = await getSupabase().rpc('valider_etapes', { p_elements: elements.map(({ etape, id }) => ({ etape, id })) });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * Dialogue de confirmation quand des étapes n'ont aucune photo : « Ajouter une photo » (une seule étape),
 * « Valider sans photo », « Annuler ».
 */
export function DialogueSansPhoto({
  sansPhoto, ouvert, onFermer, onValider, onAjouterPhoto, occupe,
}: {
  sansPhoto: ElementAValider[];
  ouvert: boolean;
  onFermer: () => void;
  onValider: () => void;
  onAjouterPhoto?: (e: ElementAValider) => void;
  occupe: boolean;
}) {
  const un = sansPhoto.length === 1;
  return (
    <AlertDialog open={ouvert} onOpenChange={(o) => !o && onFermer()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{un ? 'Aucune photo pour cette étape' : `${sansPhoto.length} étapes sans photo`}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2">
              <span>La photo est facultative, mais elle sert de preuve au rapport et à l&apos;attachement.</span>
              <ul className="list-disc pl-4">{sansPhoto.slice(0, 8).map((e) => <li key={`${e.etape}-${e.id}`}>{e.libelle}</li>)}</ul>
              {sansPhoto.length > 8 && <span>… et {sansPhoto.length - 8} autres.</span>}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={occupe}>Annuler</AlertDialogCancel>
          {un && onAjouterPhoto && (
            <Button variant="outline" disabled={occupe} onClick={() => onAjouterPhoto(sansPhoto[0])}><Camera data-icon="inline-start" />Ajouter une photo</Button>
          )}
          <Button disabled={occupe} onClick={onValider}>{occupe && <Spinner />}Valider sans photo</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Bouton « Valider » d'une étape de la fiche. */
export function BoutonValider({
  element, onValide, onErreur, onAjouterPhoto,
}: {
  element: ElementAValider;
  onValide: () => void;
  onErreur: (m: string) => void;
  onAjouterPhoto: (e: ElementAValider) => void;
}) {
  const [occupe, setOccupe] = useState(false);
  const [dialogue, setDialogue] = useState(false);

  async function valider() {
    setOccupe(true);
    onErreur('');
    try {
      const n = await validerEtapes([element]);
      if (n === 0) onErreur('Étape déjà validée (ou supprimée) entre-temps.');
      setDialogue(false);
      onValide();
    } catch (e) {
      onErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <Button size="sm" disabled={occupe} onClick={() => (element.nbPhotos === 0 ? setDialogue(true) : valider())}>
        {occupe ? <Spinner /> : <CircleCheck data-icon="inline-start" />}Valider
      </Button>
      <DialogueSansPhoto sansPhoto={[element]} ouvert={dialogue} occupe={occupe} onFermer={() => setDialogue(false)} onValider={valider}
        onAjouterPhoto={(e) => { setDialogue(false); onAjouterPhoto(e); }} />
    </>
  );
}

'use client';

// Validation par étape (V1) : badge d'état, bouton « Valider » avec l'avertissement « aucune photo » (V4 :
// photo facultative avec avertissement), et dialogue commun à la fiche et à l'écran « À valider ». Renvoi à l'agent
// (dévalidation) : bouton « Dévalider » / « Renvoyer » avec motif obligatoire, état « À corriger ».
import { Camera, CircleCheck, Clock3, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { dateHeure, messageErreur } from '@/lib/format';
import type { Etape } from '@/lib/saisie/regles';
import { getSupabase } from '@/lib/supabase';

export function EtatValidation({ valideeLe, par, renvoyeeLe, motif }: {
  valideeLe: string | null | undefined; par?: string | null; renvoyeeLe?: string | null; motif?: string | null;
}) {
  if (valideeLe) {
    return (
      <Badge variant="outline" className="rounded-sm border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300" title={par ? `Validée par ${par}` : undefined}>
        <CircleCheck data-icon="inline-start" />Validée le {dateHeure(valideeLe)}{par ? ` · ${par}` : ''}
      </Badge>
    );
  }
  if (renvoyeeLe) {
    return (
      <Badge variant="outline" className="rounded-sm border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300" title={motif ?? undefined}>
        <Undo2 data-icon="inline-start" />À corriger
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="rounded-sm border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300">
      <Clock3 data-icon="inline-start" />À valider
    </Badge>
  );
}

/** Renvoi en cours (étape pas encore revalidée) : ce que l'agent doit corriger. */
export function MotifRenvoi({ valideeLe, renvoyeeLe, motif, par, className }: {
  valideeLe: string | null | undefined; renvoyeeLe: string | null | undefined; motif: string | null | undefined; par?: string | null; className?: string;
}) {
  if (valideeLe || !renvoyeeLe) return null;
  return (
    <p className={`text-orange-700 text-sm dark:text-orange-300 ${className ?? ''}`}>
      Renvoyée à l&apos;agent le {dateHeure(renvoyeeLe)}{par ? ` par ${par}` : ''} : « {motif} »
    </p>
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

/** Renvoi à l'agent (dévalidation) : 1 si l'agent est prévenu, 0 sinon (saisie du bureau, compte révoqué). */
export async function renvoyerEtape(etape: Etape, id: string, motif: string): Promise<number> {
  const { data, error } = await getSupabase().rpc('renvoyer_etape', { p_etape: etape, p_id: id, p_motif: motif });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * « Dévalider » (étape validée) ou « Renvoyer » (pas encore validée) : l'étape repasse « à valider », l'agent la corrige
 * sur sa tablette et reçoit une notification avec le motif.
 */
export function BoutonRenvoyer({
  element, validee, onRenvoye, variante = 'outline',
}: {
  element: Pick<ElementAValider, 'etape' | 'id' | 'libelle'>;
  validee: boolean;
  onRenvoye: () => void;
  variante?: 'outline' | 'ghost';
}) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');

  async function renvoyer() {
    if (!motif.trim()) return setErreur('Indiquez ce que l\'agent doit corriger.');
    setOccupe(true);
    setErreur('');
    try {
      const n = await renvoyerEtape(element.etape, element.id, motif.trim());
      toast.success(n ? `${element.libelle} renvoyée : l'agent est prévenu sur sa tablette.` : `${element.libelle} renvoyée (aucun agent à prévenir).`);
      setOuvert(false);
      setMotif('');
      onRenvoye();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <Button size="sm" variant={variante} onClick={() => { setErreur(''); setOuvert(true); }}>
        <Undo2 data-icon="inline-start" />{validee ? 'Dévalider' : 'Renvoyer'}
      </Button>
      <AlertDialog open={ouvert} onOpenChange={(o) => !o && !occupe && setOuvert(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{validee ? 'Dévalider et renvoyer à l\'agent' : 'Renvoyer à l\'agent'}</AlertDialogTitle>
            <AlertDialogDescription>
              {element.libelle}. L&apos;étape repasse « à valider » ; l&apos;agent la corrige sur sa tablette (champs, pièces, photos) et
              reçoit une notification avec votre motif. Validez-la de nouveau une fois corrigée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field className="gap-1.5">
            <FieldLabel htmlFor={`motif-${element.id}`}>Ce que l&apos;agent doit corriger</FieldLabel>
            <Textarea id={`motif-${element.id}`} rows={3} maxLength={500} value={motif} autoFocus
              onChange={(e) => { setMotif(e.target.value); setErreur(''); }} aria-invalid={!!erreur && !motif.trim() ? true : undefined}
              placeholder="Ex. pièces oubliées : 2 colliers de prise en charge ; position à reprendre sur le regard" />
            <FieldDescription>Obligatoire, 500 caractères au plus. L&apos;agent le lit tel quel.</FieldDescription>
          </Field>
          {erreur && <Alert variant="destructive"><AlertDescription>{erreur}</AlertDescription></Alert>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={occupe}>Annuler</AlertDialogCancel>
            <Button disabled={occupe} onClick={renvoyer}>
              {occupe ? <Spinner /> : <Undo2 data-icon="inline-start" />}{validee ? 'Dévalider et renvoyer' : 'Renvoyer'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

'use client';

// Onglet Photos de la fiche : ajout rattaché à une étape (détection, réparation, réfection), changement du type
// et retrait logique avec motif (V3 ; le fichier est gardé). Droits : src/lib/saisie/regles.ts (droitsPhoto),
// la base reste juge.
import { Camera, ExternalLink, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Vide } from '@/components/en-tete-page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { TYPES_PHOTO, dateHeure, messageErreur } from '@/lib/format';
import { deposerPhoto, preparerPhoto } from '@/lib/photo';
import { droitsPhoto, type Peut } from '@/lib/saisie/regles';
import { getSupabase } from '@/lib/supabase';
import type { PhotoLigne } from '@/lib/types';

export interface EtapePhoto {
  /** « detection », « reparation:<id> » ou « refection:<id> ». */
  cle: string;
  libelle: string;
  valideeLe: string | null;
}

export const cleEtapePhoto = (p: Pick<PhotoLigne, 'reparation_id' | 'refection_id'>) =>
  p.refection_id ? `refection:${p.refection_id}` : p.reparation_id ? `reparation:${p.reparation_id}` : 'detection';

/** Type proposé selon l'étape : détection, après réparation, réfection. */
const typeParDefaut = (cle: string) => (cle.startsWith('refection') ? 'refection' : cle.startsWith('reparation') ? 'apres' : 'detection');

export function Photos({
  photos, fuiteId, marcheId, etapes, etapeInitiale, peutAjouter, horsLigne, moi, peut, onChange, onErreur,
}: {
  photos: (PhotoLigne & { url?: string })[];
  fuiteId: string;
  marcheId: string;
  etapes: EtapePhoto[];
  /** Étape choisie d'office (bouton « Ajouter une photo » de l'avertissement de validation). */
  etapeInitiale?: string | null;
  peutAjouter: boolean;
  horsLigne: boolean;
  moi: string | null;
  peut: Peut;
  onChange: () => void;
  onErreur: (m: string) => void;
}) {
  const [etape, setEtape] = useState(etapeInitiale ?? 'detection');
  const [type, setType] = useState(typeParDefaut(etapeInitiale ?? 'detection'));
  const [envoi, setEnvoi] = useState(false);
  const [retrait, setRetrait] = useState<PhotoLigne | null>(null);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!etapeInitiale) return;
    setEtape(etapeInitiale);
    setType(typeParDefaut(etapeInitiale));
  }, [etapeInitiale]);

  const etapeDe = (p: PhotoLigne) => etapes.find((e) => e.cle === cleEtapePhoto(p));

  async function ajouter(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    const liste = Array.from(fichiers);
    setEnvoi(true);
    onErreur('');
    const [genre, idEtape] = etape.split(':');
    try {
      const sb = getSupabase();
      for (const fichier of liste) {
        const prete = await preparerPhoto(fichier);
        const photoId = crypto.randomUUID();
        const { stockage, chemin } = await deposerPhoto(prete.blob, { marche_id: marcheId, fuite_id: fuiteId, id: photoId });
        const ligne = await sb.from('photos').insert({
          id: photoId, marche_id: marcheId, fuite_id: fuiteId, type, stockage, chemin,
          reparation_id: genre === 'reparation' ? idEtape : null, refection_id: genre === 'refection' ? idEtape : null,
          largeur_px: prete.largeur, hauteur_px: prete.hauteur, taille_octets: prete.blob.size,
        });
        if (ligne.error) throw ligne.error;
      }
      onChange();
    } catch (e) {
      onErreur(messageErreur(e));
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = '';
    }
  }

  async function changerType(p: PhotoLigne, nouveau: string) {
    onErreur('');
    const { error } = await getSupabase().from('photos').update({ type: nouveau }).eq('id', p.id);
    if (error) onErreur(messageErreur(error));
    onChange();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="font-heading font-medium text-base">Photos</h2>
          <p className="text-muted-foreground text-sm">{photos.length} photo{photos.length > 1 ? 's' : ''}, réduites à 1 600 px à l&apos;envoi. Une photo retirée reste archivée.</p>
        </div>
        {peutAjouter && (
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect value={etape} onChange={(e) => { setEtape(e.target.value); setType(typeParDefaut(e.target.value)); }} aria-label="Étape de la photo">
              {etapes.map((e) => <NativeSelectOption key={e.cle} value={e.cle}>{e.libelle}</NativeSelectOption>)}
            </NativeSelect>
            <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Type de photo">
              {Object.entries(TYPES_PHOTO).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
            </NativeSelect>
            <input ref={champ} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => ajouter(e.target.files)} />
            <Button disabled={envoi} onClick={() => champ.current?.click()}>
              {envoi ? <Spinner /> : <Camera data-icon="inline-start" />}{envoi ? 'Envoi…' : 'Ajouter une photo'}
            </Button>
          </div>
        )}
      </div>
      {photos.length === 0 ? <Vide>Aucune photo.</Vide> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {photos.map((p) => {
            const e = etapeDe(p);
            const d = horsLigne ? { modifier: false, retirer: false, raison: null } : droitsPhoto(p, { moi, peut, validationEtape: e?.valideeLe });
            return (
              <Card key={p.id} size="sm" className="group/photo">
                <CardContent>
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-muted/50">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer" className="block size-full" title={`${TYPES_PHOTO[p.type] ?? p.type} · ${dateHeure(p.prise_le)}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt={TYPES_PHOTO[p.type] ?? p.type} loading="lazy" className="size-full object-cover transition-transform group-hover/photo:scale-[1.02]" />
                      </a>
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-muted-foreground text-xs"><Camera className="size-6" />{horsLigne ? 'Pas de copie hors ligne' : 'Indisponible'}</span>
                    )}
                    <span className="absolute bottom-2 left-2 rounded-sm bg-background/85 px-1.5 py-0.5 text-xs font-medium backdrop-blur">{TYPES_PHOTO[p.type] ?? p.type}</span>
                  </div>
                </CardContent>
                <CardHeader>
                  <CardTitle className="truncate">{e?.libelle ?? 'Détection'}</CardTitle>
                  <CardDescription className="truncate">Prise le {dateHeure(p.prise_le)}</CardDescription>
                  {p.url && (
                    <Button variant="ghost" size="icon-sm" className="absolute top-2 right-2" asChild>
                      <a href={p.url} target="_blank" rel="noreferrer" aria-label="Ouvrir la photo"><ExternalLink /></a>
                    </Button>
                  )}
                </CardHeader>
                {(d.modifier || d.retirer) && (
                  <CardContent className="flex items-center gap-2">
                    {d.modifier && (
                      <NativeSelect size="sm" value={p.type} onChange={(ev) => changerType(p, ev.target.value)} aria-label="Changer le type" className="min-w-0 flex-1">
                        {Object.entries(TYPES_PHOTO).map(([k, v]) => <NativeSelectOption key={k} value={k}>{v}</NativeSelectOption>)}
                      </NativeSelect>
                    )}
                    {d.retirer && (
                      <Button size="sm" variant="outline" onClick={() => setRetrait(p)}><Trash2 data-icon="inline-start" />Retirer</Button>
                    )}
                  </CardContent>
                )}
                {!horsLigne && !d.modifier && !d.retirer && d.raison && (
                  <CardContent><p className="text-muted-foreground text-xs">{d.raison}</p></CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <DialogueRetrait photo={retrait} onFermer={() => setRetrait(null)} onFait={() => { setRetrait(null); onChange(); }} onErreur={onErreur} />
    </div>
  );
}

function DialogueRetrait({ photo, onFermer, onFait, onErreur }: {
  photo: PhotoLigne | null; onFermer: () => void; onFait: () => void; onErreur: (m: string) => void;
}) {
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  useEffect(() => setMotif(''), [photo]);

  async function retirer() {
    if (!photo) return;
    setOccupe(true);
    onErreur('');
    const { error } = await getSupabase().from('photos')
      .update({ supprime_le: new Date().toISOString(), motif_retrait: motif.trim() || null }).eq('id', photo.id);
    setOccupe(false);
    if (error) {
      onErreur(messageErreur(error));
      onFermer();
      return;
    }
    onFait();
  }

  return (
    <Dialog open={!!photo} onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retirer la photo</DialogTitle>
          <DialogDescription>Elle disparaît de la fiche et des rapports ; le fichier reste archivé.</DialogDescription>
        </DialogHeader>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground text-xs">Motif (gardé dans le journal)</span>
          <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. photo floue, mauvaise fuite" autoFocus />
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onFermer} disabled={occupe}>Annuler</Button>
          <Button variant="destructive" onClick={retirer} disabled={occupe}>{occupe && <Spinner />}Retirer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

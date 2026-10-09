'use client';

// Saisie et modification d'une réfection sur la fiche (P5, P6, P9, V2) : résultat → nature → dimensions →
// date et heure, gardes-fous (réfection de plus de 30 m², total des réfections inférieur aux fouilles),
// récapitulatif avant confirmation. Dimensions vides : la base reprend celles de la fouille.
import { ArrowLeft, Check, CheckCheck, Pencil } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { dateHeure, messageErreur, nombre } from '@/lib/format';
import type { ReferentielsSaisie } from '@/lib/saisie/referentiels';
import {
  dansLeFutur, depuisChampDate, gardesFousRefection, lireNombre, surface, texteNombre, versChampDate,
} from '@/lib/saisie/regles';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { Refection, Reparation } from '@/lib/types';
import { Avertissements, ChampMetres, Choix, Etape, Recapitulatif } from './saisie-ui';

type Resultat = Refection['resultat'];

export function FormRefection({
  marcheId, fuiteId, reparations, refections, referentiels, existante, onFini, onAnnuler,
}: {
  marcheId: string;
  fuiteId: string;
  reparations: Reparation[];
  refections: Refection[];
  referentiels: ReferentielsSaisie;
  existante?: Refection;
  onFini: () => void;
  onAnnuler: () => void;
}) {
  const { peut, session } = useSession();
  const moi = session?.user.id ?? null;
  const responsable = peut('refections', 'valider');
  // Réparation de référence : la dernière avant la réfection (fouille et revêtement prévus)
  const derniere = [...reparations].reverse().find((r) => (r.fouille_longueur_m ?? 0) > 0) ?? reparations.at(-1);

  const [resultat, setResultat] = useState<Resultat | ''>(existante?.resultat ?? '');
  const [natureId, setNatureId] = useState(existante?.nature_id ?? '');
  const [longueur, setLongueur] = useState(texteNombre(existante?.longueur_m));
  const [largeur, setLargeur] = useState(texteNombre(existante?.largeur_m));
  const [motifId, setMotifId] = useState(existante?.motif_id ?? '');
  const [dateInitiale] = useState(() => versChampDate(existante?.realisee_le ?? new Date()));
  const [date, setDate] = useState(dateInitiale);
  const [observation, setObservation] = useState(existante?.observation ?? '');
  const [realiseePar, setRealiseePar] = useState('');
  const [validerAussi, setValiderAussi] = useState(false);
  const [recap, setRecap] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');

  const faite = resultat === 'faite';
  const L = lireNombre(longueur) ?? (faite ? derniere?.fouille_longueur_m ?? null : null);
  const l = lireNombre(largeur) ?? (faite ? derniere?.fouille_largeur_m ?? null : null);
  const avertissements = gardesFousRefection({
    faite, longueur: L, largeur: l,
    autresRefections: refections.filter((r) => r.id !== existante?.id && r.resultat === 'faite').map((r) => Number(r.surface_m2 ?? 0)),
    fouilles: reparations.map((r) => surface(r.fouille_longueur_m, r.fouille_largeur_m) ?? 0).filter((x) => x > 0),
  });
  const quand = depuisChampDate(date);
  const futur = dansLeFutur(quand);
  const nature = referentiels.natures.find((n) => n.id === natureId);
  const natureReparation = referentiels.natures.find((n) => n.id === derniere?.nature_revetement_id);
  const motifs = referentiels.motifs.filter((m) => m.categorie === 'sans_refection');

  function verifier() {
    setErreur('');
    if (!resultat) return setErreur('Choisissez : réfection faite, ou clôture sans réfection.');
    if (resultat === 'non_faite' && !motifId) return setErreur('Choisissez le motif de la clôture sans réfection.');
    if (!quand) return setErreur('Date et heure de la réfection invalides.');
    setRecap(true);
  }

  async function enregistrer() {
    setErreur('');
    setOccupe(true);
    try {
      const sb = getSupabase();
      const ligne: Record<string, unknown> = {
        resultat,
        nature_id: faite ? natureId || null : null,
        motif_id: faite ? null : motifId || null,
        longueur_m: faite ? lireNombre(longueur) : null,
        largeur_m: faite ? lireNombre(largeur) : null,
        observation: observation.trim() || null,
      };
      // Date inchangée d'une réfection existante : non renvoyée (le champ arrondit à la minute).
      if (!existante || date !== dateInitiale) ligne.realisee_le = quand;
      if (responsable && realiseePar) ligne.auteur_terrain_id = realiseePar;
      if (existante) {
        const { error } = await sb.from('refections').update(ligne).eq('id', existante.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('refections').insert({
          ...ligne, marche_id: marcheId, fuite_id: fuiteId, reparation_id: derniere?.id ?? null,
          auteur_terrain_id: (responsable && realiseePar) || moi, validee_le: validerAussi ? new Date().toISOString() : null,
        });
        if (error) throw error;
      }
      onFini();
    } catch (e) {
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  const ici = surface(L, l);
  const tousAvertissements = [...avertissements, ...(futur ? [{ champ: 'date', message: 'Date dans le futur : vérifiez la date et l\'heure.' }] : [])];

  if (recap) {
    return (
      <div className="flex flex-col gap-4">
        <Recapitulatif
          titre={existante ? 'Vérifiez la modification de la réfection' : 'Vérifiez la réfection avant de l\'enregistrer'}
          lignes={[
            ['Résultat', faite ? 'Réfection faite' : `Clôturée sans réfection : ${motifs.find((m) => m.id === motifId)?.libelle_fr ?? ''}`],
            ['Nature', faite ? nature?.libelle_fr ?? `${natureReparation?.libelle_fr ?? 'celle de la réparation'} (reprise)` : ''],
            ['Dimensions', faite && L != null && l != null ? `${nombre(L)} × ${nombre(l)} m = ${nombre(ici, 3)} m²${lireNombre(longueur) == null || lireNombre(largeur) == null ? ' (fouille reprise)' : ''}` : ''],
            ['Date et heure', quand ? dateHeure(quand) : ''],
            ['Réalisée par', realiseePar ? referentiels.agents.find((a) => a.id === realiseePar)?.nom_complet ?? '' : ''],
            ['Observation', observation.trim()],
          ]}
          avertissements={tousAvertissements}
        />
        {responsable && !existante && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={validerAussi} onCheckedChange={(v) => setValiderAussi(v === true)} />
            Valider la réfection en même temps
          </label>
        )}
        {erreur && <Alert variant="destructive"><AlertTitle>Enregistrement refusé</AlertTitle><AlertDescription>{erreur}</AlertDescription></Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" onClick={() => setRecap(false)} disabled={occupe}><ArrowLeft data-icon="inline-start" />Corriger</Button>
          <Button type="button" size="lg" onClick={enregistrer} disabled={occupe}>
            {occupe ? <Spinner /> : validerAussi ? <CheckCheck data-icon="inline-start" /> : <Check data-icon="inline-start" />}
            {validerAussi ? 'Confirmer et valider' : 'Confirmer'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <h3 className="flex items-center gap-2 font-heading font-medium text-base">
        {existante ? <><Pencil className="size-4 text-muted-foreground" />Modifier la réfection du {dateHeure(existante.realisee_le)}</> : 'Nouvelle réfection'}
      </h3>
      <Etape n={1} titre="Résultat">
        <Choix libelle="Résultat" valeur={resultat} options={[['faite', 'Réfection faite'], ['non_faite', 'Clôturer sans réfection']]} onChange={setResultat} />
        {resultat === 'non_faite' && (
          <NativeSelect value={motifId} onChange={(e) => setMotifId(e.target.value)} aria-label="Motif" className="w-full sm:w-96">
            <NativeSelectOption value="">— Motif (obligatoire) —</NativeSelectOption>
            {motifs.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.libelle_fr}</NativeSelectOption>)}
          </NativeSelect>
        )}
      </Etape>
      {faite && (
        <>
          <Etape n={2} titre="Nature de la réfection" aide={natureReparation ? `Sans choix : ${natureReparation.libelle_fr} (prévue à la réparation)` : 'Sans choix : celle prévue à la réparation'}>
            <Choix libelle="Nature" valeur={natureId} options={referentiels.natures.map((n) => [n.id, n.libelle_fr])} onChange={setNatureId} effacable taille="sm" />
          </Etape>
          <Etape n={3} titre="Dimensions" aide={derniere?.fouille_longueur_m ? `Vides : fouille reprise (${nombre(derniere.fouille_longueur_m)} × ${nombre(derniere.fouille_largeur_m)} m)` : 'En mètres'}>
            <div className="flex flex-wrap gap-4">
              <ChampMetres id="r-longueur" libelle="Longueur" valeur={longueur} onChange={setLongueur} />
              <ChampMetres id="r-largeur" libelle="Largeur" valeur={largeur} onChange={setLargeur} />
            </div>
            {ici != null && <p className="text-muted-foreground text-sm">Surface : {nombre(ici, 3)} m²</p>}
          </Etape>
        </>
      )}
      <Etape n={faite ? 4 : 2} titre="Date, heure et observation">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground text-xs">Date et heure de la réfection</span>
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {responsable && !existante && (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground text-xs">Réalisée par (saisie à la place d&apos;un agent)</span>
              <NativeSelect value={realiseePar} onChange={(e) => setRealiseePar(e.target.value)} className="w-full">
                <NativeSelectOption value="">Moi-même</NativeSelectOption>
                {referentiels.agents.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.nom_complet}</NativeSelectOption>)}
              </NativeSelect>
            </label>
          )}
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground text-xs">Observation</span>
          <Textarea rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} />
        </label>
      </Etape>
      <div className="flex flex-col gap-3 pt-2">
        <Avertissements liste={tousAvertissements} />
        {erreur && <Alert variant="destructive"><AlertDescription>{erreur}</AlertDescription></Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" onClick={onAnnuler}>Annuler</Button>
          <Button type="button" size="lg" onClick={verifier}>Vérifier avant d&apos;enregistrer</Button>
        </div>
      </div>
    </div>
  );
}

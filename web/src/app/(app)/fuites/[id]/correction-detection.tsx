'use client';

// Modification de la détection (V2, V5) : l'auteur tant qu'elle n'est pas validée, le responsable toujours.
// Position déplacée sur une petite carte avec épingle, date et heure de détection au calendrier, référence,
// adresse, secteur, ouvrage, visibilité, nature de dégradation, conduite ; « Détectée par » (responsable) ;
// motif obligatoire quand un autre que l'auteur change la date, la référence ou la position (journalisé).
import { Check, Pencil } from 'lucide-react';
import { useState } from 'react';
import { MiniCarte, type PositionCarte } from '@/components/mini-carte';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { MATERIAUX, OUVRAGES, formaterReference, libellesMarche, messageErreur, motifMasque } from '@/lib/format';
import type { ReferentielsSaisie } from '@/lib/saisie/referentiels';
import {
  champsExiges, champsManquants, dansLeFutur, depuisChampDate, diametresPour, distanceM, libelleChampFuite, lireNombre,
  minusculeInitiale, motifExige, pointWkt, sigleDiametre, texteNombre, versChampDate,
} from '@/lib/saisie/regles';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { FuiteV2, Secteur, VFuite } from '@/lib/types';
import { Avertissements } from './saisie-ui';

export function CorrectionDetection({
  fuite, v2, referentiels, secteurs, onFini, onAnnuler,
}: {
  fuite: VFuite;
  v2: FuiteV2 | null;
  referentiels: ReferentielsSaisie;
  secteurs: Secteur[];
  onFini: () => void;
  onAnnuler: () => void;
}) {
  const { marche, peut, session } = useSession();
  const libelles = libellesMarche(marche);
  const moi = session?.user.id ?? null;
  const responsable = peut('fuites', 'valider');
  const depart = fuite.latitude != null && fuite.longitude != null ? { latitude: fuite.latitude, longitude: fuite.longitude } : null;
  const initial = {
    date: versChampDate(fuite.date_detection),
    reference: fuite.reference_srm ?? '',
    adresse: fuite.adresse ?? '',
    secteur: fuite.secteur_id ?? '',
    ouvrage: fuite.ouvrage ?? '',
    visibilite: fuite.visibilite ?? '',
    nature: v2?.nature_degradation_id ?? '',
    materiau: v2?.materiau ?? '',
    diametre: texteNombre(v2?.diametre_mm),
    observation: fuite.observation ?? '',
    detecteePar: v2?.auteur_terrain_id ?? '',
  };
  const [v, setV] = useState(initial);
  const [position, setPosition] = useState<PositionCarte | null>(depart);
  const [motif, setMotif] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const maj = (champ: keyof typeof initial) => (valeur: string) => setV((x) => ({ ...x, [champ]: valeur }));

  const deplace = position && (!depart || distanceM(depart, position) > 0.5);
  const changes: string[] = [
    ...(v.date !== initial.date ? ['date_detection'] : []),
    ...(v.reference.trim() !== initial.reference ? ['reference_srm'] : []),
    ...(deplace ? ['position'] : []),
    ...(['adresse', 'secteur', 'ouvrage', 'visibilite', 'nature', 'materiau', 'diametre', 'observation', 'detecteePar'] as const)
      .filter((k) => v[k].trim() !== initial[k]).map(String),
  ];
  const exigeMotif = motifExige(changes, { auteur_terrain_id: v2?.auteur_terrain_id ?? null, saisi_par: v2?.saisi_par ?? null }, moi);
  const quand = depuisChampDate(v.date);
  const diametres = diametresPour(referentiels.diametres, v.materiau);
  const exiges = champsExiges(referentiels.champsObligatoires);
  // Un champ exigé déjà rempli ne se vide plus (contrôle de la base) ; une fuite ancienne incomplète reste modifiable.
  const vides = champsManquants({
    reference_srm: v.reference, secteur_id: v.secteur, ouvrage: v.ouvrage, visibilite: v.visibilite, nature_degradation_id: v.nature,
    adresse: v.adresse, diametre_mm: v.diametre, materiau: v.materiau,
  }, exiges).filter((c) => {
    const avant = { reference_srm: initial.reference, secteur_id: initial.secteur, ouvrage: initial.ouvrage, visibilite: initial.visibilite,
      nature_degradation_id: initial.nature, adresse: initial.adresse, diametre_mm: initial.diametre, materiau: initial.materiau }[c];
    return !!avant;
  });

  async function enregistrer() {
    setErreur('');
    if (!changes.length) return onAnnuler();
    if (!quand) return setErreur('Date et heure de détection invalides.');
    if (vides.length) return setErreur(`Champs obligatoires vidés : ${vides.map((c) => minusculeInitiale(libelleChampFuite(c, libelles.reference))).join(', ')}.`);
    if (exigeMotif && !motif.trim()) return setErreur('Motif obligatoire pour corriger la date de détection, la référence ou la position.');
    const champs: Record<string, unknown> = {};
    if (changes.includes('date_detection')) champs.date_detection = quand;
    if (changes.includes('reference_srm')) champs.reference_srm = v.reference.trim() || null;
    if (changes.includes('position') && position) champs.position = pointWkt(position.longitude, position.latitude);
    if (changes.includes('adresse')) champs.adresse = v.adresse.trim() || null;
    if (changes.includes('secteur')) {
      champs.secteur_id = v.secteur || null;
      champs.zone_id = secteurs.find((s) => s.id === v.secteur)?.zone_id ?? null;
    }
    if (changes.includes('ouvrage')) champs.ouvrage = v.ouvrage || null;
    if (changes.includes('visibilite')) champs.visibilite = v.visibilite || null;
    if (changes.includes('nature')) champs.nature_degradation_id = v.nature || null;
    if (changes.includes('materiau')) champs.materiau = v.materiau || null;
    if (changes.includes('diametre')) champs.diametre_mm = lireNombre(v.diametre);
    if (changes.includes('observation')) champs.observation = v.observation.trim() || null;
    if (changes.includes('detecteePar')) champs.auteur_terrain_id = v.detecteePar || null;
    if (motif.trim()) champs.motif_modification = motif.trim();
    setOccupe(true);
    const { error } = await getSupabase().from('fuites').update(champs).eq('id', fuite.id);
    setOccupe(false);
    if (error) return setErreur(messageErreur(error));
    onFini();
  }

  const champ = (libelle: string, enfant: React.ReactNode, large = false) => (
    <label className={`flex flex-col gap-1.5 text-sm ${large ? 'sm:col-span-2' : ''}`}>
      <span className="text-muted-foreground text-xs">{libelle}</span>
      {enfant}
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <h3 className="flex items-center gap-2 font-heading font-medium text-base">
        <Pencil className="size-4 text-muted-foreground" />{responsable ? 'Corriger la détection' : 'Modifier la détection'}
      </h3>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <MiniCarte position={position} surDeplacement={setPosition} className="h-72" libelle="Position de la fuite (épingle déplaçable)" />
          <p className="text-muted-foreground text-xs tabular-nums">
            {position ? `${position.latitude.toFixed(6)} ; ${position.longitude.toFixed(6)}` : 'Aucune position'}
            {deplace && depart && ` · déplacée de ${Math.round(distanceM(depart, position!))} m`}
            {deplace && <Button type="button" size="xs" variant="link" onClick={() => setPosition(depart)}>Annuler le déplacement</Button>}
          </p>
        </div>
        <div className="grid content-start gap-4 sm:grid-cols-2">
          {champ('Date et heure de détection', <Input type="datetime-local" value={v.date} onChange={(e) => maj('date')(e.target.value)} />)}
          {champ(libelles.reference, libelles.masque ? (
            <Input value={v.reference} onChange={(e) => maj('reference')(formaterReference(e.target.value, libelles.masque))} inputMode="numeric"
              maxLength={libelles.masque.length} pattern={motifMasque(libelles.masque)} placeholder={libelles.masque.replace(/9/g, '0')} />
          ) : <Input value={v.reference} onChange={(e) => maj('reference')(e.target.value)} />)}
          {champ('Adresse / repère', <Input value={v.adresse} onChange={(e) => maj('adresse')(e.target.value)} />, true)}
          {champ('Secteur', (
            <NativeSelect value={v.secteur} onChange={(e) => maj('secteur')(e.target.value)} className="w-full">
              <NativeSelectOption value="">—</NativeSelectOption>
              {secteurs.map((s) => <NativeSelectOption key={s.id} value={s.id}>{s.libelle}</NativeSelectOption>)}
            </NativeSelect>
          ))}
          {champ('Nature de dégradation', (
            <NativeSelect value={v.nature} onChange={(e) => maj('nature')(e.target.value)} className="w-full">
              <NativeSelectOption value="">—</NativeSelectOption>
              {referentiels.natures.map((n) => <NativeSelectOption key={n.id} value={n.id}>{n.libelle_fr}</NativeSelectOption>)}
            </NativeSelect>
          ))}
          {champ('Ouvrage', (
            <NativeSelect value={v.ouvrage} onChange={(e) => maj('ouvrage')(e.target.value)} className="w-full">
              <NativeSelectOption value="">—</NativeSelectOption>
              {Object.entries(OUVRAGES).map(([k, t]) => <NativeSelectOption key={k} value={k}>{t}</NativeSelectOption>)}
            </NativeSelect>
          ))}
          {champ('Visibilité', (
            <NativeSelect value={v.visibilite} onChange={(e) => maj('visibilite')(e.target.value)} className="w-full">
              <NativeSelectOption value="">—</NativeSelectOption>
              <NativeSelectOption value="visible">Visible</NativeSelectOption>
              <NativeSelectOption value="invisible">Invisible</NativeSelectOption>
            </NativeSelect>
          ))}
          {champ('Matériau de la conduite', (
            <NativeSelect value={v.materiau} onChange={(e) => maj('materiau')(e.target.value)} className="w-full">
              <NativeSelectOption value="">—</NativeSelectOption>
              {Object.entries(MATERIAUX).map(([k, t]) => <NativeSelectOption key={k} value={k}>{t}</NativeSelectOption>)}
            </NativeSelect>
          ))}
          {champ(`Diamètre (${sigleDiametre(v.materiau)} mm)`, diametres.length ? (
            <NativeSelect value={v.diametre} onChange={(e) => maj('diametre')(e.target.value)} className="w-full">
              <NativeSelectOption value="">—</NativeSelectOption>
              {v.diametre && !diametres.includes(Number(v.diametre)) && <NativeSelectOption value={v.diametre}>{v.diametre} (hors liste)</NativeSelectOption>}
              {diametres.map((d) => <NativeSelectOption key={d} value={String(d)}>{d}</NativeSelectOption>)}
            </NativeSelect>
          ) : <Input value={v.diametre} onChange={(e) => maj('diametre')(e.target.value)} inputMode="numeric" />)}
          {responsable && champ('Détectée par', (
            <NativeSelect value={v.detecteePar} onChange={(e) => maj('detecteePar')(e.target.value)} className="w-full">
              <NativeSelectOption value="">—</NativeSelectOption>
              {referentiels.agents.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.nom_complet}</NativeSelectOption>)}
            </NativeSelect>
          ))}
          {champ('Observation', <Textarea rows={2} value={v.observation} onChange={(e) => maj('observation')(e.target.value)} />, true)}
          {(exigeMotif || responsable) && champ(exigeMotif ? 'Motif de la correction (obligatoire)' : 'Motif de la correction (facultatif)', (
            <Input value={motif} onChange={(e) => setMotif(e.target.value)} aria-invalid={exigeMotif && !motif.trim() ? true : undefined}
              placeholder="Ex. épingle replacée sur le regard, tournée corrigée d'après la SRM" />
          ), true)}
        </div>
      </div>
      <Avertissements liste={dansLeFutur(quand) ? [{ champ: 'date', message: 'Date de détection dans le futur : vérifiez.' }] : []} />
      {erreur && <Alert variant="destructive"><AlertDescription>{erreur}</AlertDescription></Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onAnnuler} disabled={occupe}>Annuler</Button>
        <Button type="button" onClick={enregistrer} disabled={occupe || !changes.length}>
          {occupe ? <Spinner /> : <Check data-icon="inline-start" />}Enregistrer {changes.length ? `(${changes.length} changement${changes.length > 1 ? 's' : ''})` : ''}
        </Button>
      </div>
    </div>
  );
}

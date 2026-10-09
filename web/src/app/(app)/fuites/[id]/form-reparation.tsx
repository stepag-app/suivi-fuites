'use client';

// Saisie et modification d'une réparation sur la fiche (P1 à P8, V2) : étapes dans l'ordre du terrain
// (résultat → ouvrage, matériau → diamètre → travaux → fouille → revêtement → emplacement → pièces), diamètres
// selon le matériau, pièces en capsules, gardes-fous, récapitulatif avant confirmation. La base reste juge
// (droits, validation, verrou) : un refus s'affiche tel quel.
import { ArrowLeft, Check, CheckCheck, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PieceLue } from '@/app/(app)/attachements/controles';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { EMPLACEMENTS, MATERIAUX, OUVRAGES, dateHeure, libellesMarche, messageErreur, nombre } from '@/lib/format';
import type { ReferentielsSaisie } from '@/lib/saisie/referentiels';
import {
  aUneFouille, dansLeFutur, depuisChampDate, diametresPour, differencePieces, estAuteur, gardesFousReparation,
  lireNombre, longueurPoseDemandee, refectionAppelee, sigleDiametre, texteNombre, versChampDate, type LignePiece,
} from '@/lib/saisie/regles';
import { useSession } from '@/lib/session';
import { getSupabase } from '@/lib/supabase';
import type { Piece, Reparation } from '@/lib/types';
import { Avertissements, Bascule, Capsules, ChampMetres, Choix, Etape, Recapitulatif } from './saisie-ui';

type Resultat = Reparation['resultat'];

const RESULTATS: [Resultat, string][] = [['reparee', 'Réparée'], ['en_cours', 'En cours / reste à finir'], ['non_reparee', 'Non réparée']];
const TRAVAUX: [keyof Pick<Reparation, 'tuyau_repare' | 'robinet_pec_change' | 'collier_pec_change' | 'bouche_a_cle_mise_a_niveau' | 'element_remplace'>, string][] = [
  ['tuyau_repare', 'Tuyau / conduite réparé(e)'],
  ['robinet_pec_change', 'Robinet PEC changé'],
  ['collier_pec_change', 'Collier PEC changé'],
  ['bouche_a_cle_mise_a_niveau', 'Bouche à clé mise à niveau'],
  ['element_remplace', 'Élément de conduite remplacé'],
];
type Travaux = Record<(typeof TRAVAUX)[number][0], boolean>;

export interface SuggestionsFuite { materiau: string | null; diametre_mm: number | null; nature_degradation_id: string | null }

export function FormReparation({
  marcheId, fuiteId, suggestions, referentiels, articles, usages, existante, piecesExistantes = [], onFini, onAnnuler,
}: {
  marcheId: string;
  fuiteId: string;
  suggestions: SuggestionsFuite;
  referentiels: ReferentielsSaisie;
  articles: Piece[];
  usages: Map<number, number>;
  existante?: Reparation;
  /** Pièces posées actives de la réparation modifiée (état « posée »). */
  piecesExistantes?: PieceLue[];
  onFini: () => void;
  onAnnuler: () => void;
}) {
  const { marche, peut, session } = useSession();
  const libelles = libellesMarche(marche);
  const moi = session?.user.id ?? null;
  const responsable = peut('interventions', 'valider');
  const auteur = !existante || estAuteur(existante, moi);
  const nomArticle = (id: number | null) => articles.find((a) => a.id === id);

  const [resultat, setResultat] = useState<Resultat | ''>(existante?.resultat ?? '');
  const [motifId, setMotifId] = useState(existante?.motif_id ?? '');
  const [ouvrage, setOuvrage] = useState(existante?.ouvrage ?? '');
  const [materiau, setMateriau] = useState(existante?.materiau ?? '');
  const [diametre, setDiametre] = useState(texteNombre(existante?.diametre_mm));
  const [travaux, setTravaux] = useState<Travaux>({
    tuyau_repare: existante?.tuyau_repare ?? false, robinet_pec_change: existante?.robinet_pec_change ?? false,
    collier_pec_change: existante?.collier_pec_change ?? false, bouche_a_cle_mise_a_niveau: existante?.bouche_a_cle_mise_a_niveau ?? false,
    element_remplace: existante?.element_remplace ?? false,
  });
  const [longueurPe, setLongueurPe] = useState(texteNombre(existante?.longueur_pe_m));
  const [fL, setFL] = useState(texteNombre(existante?.fouille_longueur_m));
  const [fl, setFl] = useState(texteNombre(existante?.fouille_largeur_m));
  const [fP, setFP] = useState(texteNombre(existante?.fouille_profondeur_m));
  const [natureId, setNatureId] = useState(existante?.nature_revetement_id ?? '');
  const [emplacement, setEmplacement] = useState(existante?.emplacement ?? '');
  const piecesDepart = useMemo<LignePiece[]>(() => piecesExistantes.filter((p) => p.produit_id != null).map((p) => ({
    produit_id: p.produit_id!, designation: nomArticle(p.produit_id)?.designation ?? `Article ${p.produit_id}`,
    unite: nomArticle(p.produit_id)?.unite ?? null, quantite: Number(p.quantite),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [piecesExistantes]);
  const [pieces, setPieces] = useState<LignePiece[]>(piecesDepart);
  const [representantId, setRepresentantId] = useState(existante?.representant_srm_id ?? '');
  const [dateInitiale] = useState(() => versChampDate(existante?.realisee_le ?? new Date()));
  const [date, setDate] = useState(dateInitiale);
  const [observation, setObservation] = useState(existante?.observation ?? '');
  const [realiseePar, setRealiseePar] = useState(existante ? existante.auteur_terrain_id ?? '' : '');
  const [source, setSource] = useState(existante?.source_saisie ?? 'tablette');
  const [validerAussi, setValiderAussi] = useState(false);
  const [motifPieces, setMotifPieces] = useState('');
  const [recap, setRecap] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');

  const nature = referentiels.natures.find((n) => n.id === natureId);
  const listeDiametres = diametresPour(referentiels.diametres, materiau);
  const diametreMm = lireNombre(diametre);
  const saisie = {
    resultat: (resultat || 'reparee') as Resultat, materiau, tuyauRepare: travaux.tuyau_repare, elementRemplace: travaux.element_remplace,
    longueurPose: lireNombre(longueurPe), fouilleLongueur: lireNombre(fL), fouilleLargeur: lireNombre(fl), fouilleProfondeur: lireNombre(fP),
    emplacement, revetementARefaire: nature ? nature.necessite_refection : null,
  };
  const avertissements = gardesFousReparation(saisie);
  const volume = saisie.fouilleLongueur != null && saisie.fouilleLargeur != null && saisie.fouilleProfondeur != null
    ? saisie.fouilleLongueur * saisie.fouilleLargeur * saisie.fouilleProfondeur : null;
  const quand = depuisChampDate(date);
  const futur = dansLeFutur(quand);
  const difference = differencePieces(piecesExistantes.filter((p) => p.produit_id != null).map((p) => ({ id: p.id, produit_id: p.produit_id!, quantite: Number(p.quantite) })), pieces);
  const piecesChangees = difference.ajouts.length + difference.changees.length + difference.retirees.length > 0;
  // Pièces d'une réparation d'un autre : corrections du bureau, motif obligatoire (journal)
  const motifPiecesExige = !!existante && !auteur && piecesChangees;
  const motifsRep = referentiels.motifs.filter((m) => m.categorie === 'sans_reparation');
  const suggestionConduite = suggestions.materiau && !materiau ? suggestions : null;
  const suggestionNature = suggestions.nature_degradation_id && !natureId ? referentiels.natures.find((n) => n.id === suggestions.nature_degradation_id) : null;

  function choisirMateriau(m: string) {
    setMateriau(m);
    if (m !== materiau && diametreMm != null && !diametresPour(referentiels.diametres, m).includes(diametreMm)) setDiametre('');
  }
  function choisirNature(nid: string) {
    setNatureId(nid);
    const n = referentiels.natures.find((x) => x.id === nid);
    if (n && n.emplacement !== 'autre') setEmplacement(n.emplacement);
  }

  function verifier() {
    setErreur('');
    if (!resultat) return setErreur('Choisissez le résultat de l\'intervention.');
    if (resultat === 'non_reparee' && !motifId) return setErreur('Choisissez le motif de la non-réparation.');
    if (!quand) return setErreur('Date et heure de la réparation invalides.');
    if (motifPiecesExige && !motifPieces.trim()) return setErreur('Indiquez le motif de la correction des pièces (gardé dans le journal).');
    setRecap(true);
  }

  async function enregistrer() {
    setErreur('');
    setOccupe(true);
    try {
      const sb = getSupabase();
      const nonReparee = resultat === 'non_reparee';
      const ligne: Record<string, unknown> = {
        resultat,
        motif_id: nonReparee ? motifId || null : null,
        ouvrage: ouvrage || null,
        materiau: materiau || null,
        diametre_mm: diametreMm,
        tuyau_repare: !nonReparee && travaux.tuyau_repare,
        robinet_pec_change: !nonReparee && travaux.robinet_pec_change,
        collier_pec_change: !nonReparee && travaux.collier_pec_change,
        bouche_a_cle_mise_a_niveau: !nonReparee && travaux.bouche_a_cle_mise_a_niveau,
        element_remplace: !nonReparee && travaux.element_remplace,
        longueur_pe_m: !nonReparee && longueurPoseDemandee(saisie) ? saisie.longueurPose : null,
        fouille_longueur_m: saisie.fouilleLongueur,
        fouille_largeur_m: saisie.fouilleLargeur,
        fouille_profondeur_m: saisie.fouilleProfondeur,
        nature_revetement_id: natureId || null,
        emplacement: emplacement || null,
        representant_srm_id: representantId || null,
        observation: observation.trim() || null,
      };
      // Date inchangée d'une étape existante : non renvoyée (le champ arrondit à la minute).
      if (!existante || date !== dateInitiale) ligne.realisee_le = quand;
      // Sans représentant choisi : le nom saisi autrefois (texte libre) reste ; un choix retiré s'efface.
      if (!representantId) ligne.representant_srm = existante && !existante.representant_srm_id ? existante.representant_srm ?? null : null;
      if (responsable) {
        ligne.source_saisie = source;
        if (realiseePar || !existante) ligne.auteur_terrain_id = realiseePar || moi;
      }
      const id = existante?.id ?? crypto.randomUUID();
      if (existante) {
        const { error } = await sb.from('reparations').update(ligne).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('reparations').insert({
          ...ligne, id, marche_id: marcheId, fuite_id: fuiteId, validee_le: validerAussi ? new Date().toISOString() : null,
        });
        if (error) throw error;
      }
      await enregistrerPieces(id);
      onFini();
    } catch (e) {
      setErreur(messageErreur(e));
      setOccupe(false);
    }
  }

  async function enregistrerPieces(reparationId: string) {
    if (!piecesChangees) return;
    const sb = getSupabase();
    const motif = motifPieces.trim() || null;
    const base = { marche_id: marcheId, reparation_id: reparationId };
    if (auteur) {
      // Saisie de l'auteur : quantités modifiées directement, pièces ajoutées comme déclarées sur le terrain.
      for (const c of difference.changees) {
        const { error } = await sb.from('reparation_pieces').update({ quantite: c.ligne.quantite }).eq('id', c.id);
        if (error) throw error;
      }
      // Retrait par l'auteur (le droit « supprimer » n'est pas celui du terrain) : hors de sa déclaration (v_pieces_terrain).
      for (const pid of difference.retirees) {
        const { error } = await sb.from('reparation_pieces')
          .update({ etat: 'retiree', motif_modification: motif ?? 'Retirée par l\'auteur avant validation' }).eq('id', pid);
        if (error) throw error;
      }
      if (difference.ajouts.length) {
        const { error } = await sb.from('reparation_pieces').insert(difference.ajouts.map((l) => ({ ...base, produit_id: l.produit_id, quantite: l.quantite })));
        if (error) throw error;
      }
      return;
    }
    // Réparation d'un autre agent : la saisie d'origine reste, barrée ; corrections du bureau avec motif.
    for (const c of difference.changees) {
      const { error } = await sb.from('reparation_pieces').insert({
        ...base, produit_id: c.ligne.produit_id, quantite: c.ligne.quantite, remplace_piece_id: c.id, motif_modification: motif,
      });
      if (error) throw error;
    }
    for (const pid of difference.retirees) {
      const { error } = await sb.from('reparation_pieces').update({ etat: 'retiree', motif_modification: motif }).eq('id', pid);
      if (error) throw error;
    }
    if (difference.ajouts.length) {
      const { error } = await sb.from('reparation_pieces').insert(difference.ajouts.map((l) => ({
        ...base, produit_id: l.produit_id, quantite: l.quantite, motif_modification: motif,
      })));
      if (error) throw error;
    }
  }

  const libelleResultat = RESULTATS.find(([k]) => k === resultat)?.[1] ?? '—';
  const travauxFaits = TRAVAUX.filter(([k]) => travaux[k]).map(([, t]) => t.charAt(0).toLowerCase() + t.slice(1));
  const representant = referentiels.representants.find((r) => r.id === representantId)?.nom ?? (representantId ? '' : existante?.representant_srm ?? '');
  const nomAgent = (pid: string) => referentiels.agents.find((a) => a.id === pid)?.nom_complet ?? '';

  if (recap) {
    return (
      <div className="flex flex-col gap-4">
        <Recapitulatif
          titre={existante ? 'Vérifiez la modification de la réparation' : 'Vérifiez la réparation avant de l\'enregistrer'}
          lignes={[
            ['Résultat', resultat === 'non_reparee' ? `${libelleResultat} : ${motifsRep.find((m) => m.id === motifId)?.libelle_fr ?? ''}` : libelleResultat],
            ['Ouvrage', ouvrage ? OUVRAGES[ouvrage] : ''],
            ['Conduite', [materiau ? MATERIAUX[materiau] : '', diametreMm != null ? `${sigleDiametre(materiau)} ${diametreMm} mm` : ''].filter(Boolean).join(' · ')],
            ['Travaux réalisés', resultat === 'non_reparee' ? '' : travauxFaits.join(', ') || 'aucun'],
            ['Longueur de PE posée', resultat !== 'non_reparee' && longueurPoseDemandee(saisie) && saisie.longueurPose != null ? `${nombre(saisie.longueurPose)} m` : ''],
            ['Fouille', aUneFouille(saisie) ? `${nombre(saisie.fouilleLongueur)} × ${nombre(saisie.fouilleLargeur)} × ${nombre(saisie.fouilleProfondeur)} m${volume != null ? ` = ${nombre(volume, 3)} m³` : ''}` : 'aucune'],
            ['Revêtement à refaire', nature?.libelle_fr ?? ''],
            ['Emplacement', emplacement ? EMPLACEMENTS[emplacement] : ''],
            ['Réfection', refectionAppelee(saisie) ? 'à faire après validation' : 'non'],
            [`Représentant ${libelles.sigle}`, representant],
            ['Date et heure', quand ? dateHeure(quand) : ''],
            ['Réalisée par', responsable && realiseePar ? nomAgent(realiseePar) : ''],
            ['Observation', observation.trim()],
            ['Motif de la correction', motifPiecesExige ? motifPieces.trim() : ''],
          ]}
          pieces={pieces}
          avertissements={[
            ...avertissements,
            ...(futur ? [{ champ: 'date', message: 'Date dans le futur : vérifiez la date et l\'heure.' }] : []),
          ]}
        />
        {responsable && !existante && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={validerAussi} onCheckedChange={(v) => setValiderAussi(v === true)} />
            Valider la réparation en même temps (une photo pourra être ajoutée ensuite)
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
        {existante ? <><Pencil className="size-4 text-muted-foreground" />Modifier la réparation du {dateHeure(existante.realisee_le)}</> : 'Nouvelle réparation'}
      </h3>
      {existante && !auteur && (
        <p className="mt-1 text-muted-foreground text-sm">Saisie d&apos;un autre agent : vos changements de pièces deviennent des corrections du bureau (motif obligatoire), invisibles du terrain.</p>
      )}

      <Etape n={1} titre="Résultat">
        <Choix libelle="Résultat" valeur={resultat} options={RESULTATS} onChange={(v) => setResultat(v)} />
        {resultat === 'non_reparee' && (
          <NativeSelect value={motifId} onChange={(e) => setMotifId(e.target.value)} aria-label="Motif de la non-réparation" className="w-full sm:w-96">
            <NativeSelectOption value="">— Motif (obligatoire) —</NativeSelectOption>
            {motifsRep.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.libelle_fr}</NativeSelectOption>)}
          </NativeSelect>
        )}
        {resultat === 'non_reparee' && <p className="text-muted-foreground text-xs">Le terrassement et les pièces posées restent à saisir : ils sont attachés.</p>}
      </Etape>

      <Etape n={2} titre="Ouvrage et matériau">
        <Choix libelle="Ouvrage" valeur={ouvrage} options={Object.entries(OUVRAGES)} onChange={setOuvrage} effacable taille="sm" />
        <Choix libelle="Matériau" valeur={materiau} options={Object.entries(MATERIAUX)} onChange={choisirMateriau} effacable taille="sm" />
        {suggestionConduite && (
          <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => {
            choisirMateriau(suggestionConduite.materiau!);
            if (suggestionConduite.diametre_mm) setDiametre(String(suggestionConduite.diametre_mm));
          }}>
            Reprendre la conduite de la détection : {MATERIAUX[suggestionConduite.materiau!] ?? suggestionConduite.materiau}{suggestionConduite.diametre_mm ? ` Ø ${suggestionConduite.diametre_mm}` : ''}
          </Button>
        )}
      </Etape>

      <Etape n={3} titre="Diamètre" aide={materiau ? `${sigleDiametre(materiau)} en mm` : 'Choisissez d\'abord le matériau'}>
        {listeDiametres.length > 0 && (
          <Choix libelle="Diamètre" valeur={listeDiametres.includes(diametreMm ?? -1) ? String(diametreMm) : ''}
            options={listeDiametres.map((d) => [String(d), String(d)])} onChange={setDiametre} effacable taille="sm" />
        )}
        {(listeDiametres.length === 0 || (diametreMm != null && !listeDiametres.includes(diametreMm))) && (
          <ChampMetres id="diametre" libelle={listeDiametres.length ? 'Diamètre hors liste' : 'Diamètre'} valeur={diametre} onChange={setDiametre} unite="mm" />
        )}
      </Etape>

      {resultat !== 'non_reparee' && (
        <Etape n={4} titre="Travaux réalisés">
          <div className="grid gap-2 sm:grid-cols-2">
            {TRAVAUX.map(([k, t]) => <Bascule key={k} actif={travaux[k]} onChange={(v) => setTravaux({ ...travaux, [k]: v })}>{t}</Bascule>)}
          </div>
          {longueurPoseDemandee(saisie) && <ChampMetres id="longueur-pe" libelle="Longueur de PE posée" valeur={longueurPe} onChange={setLongueurPe} />}
        </Etape>
      )}

      <Etape n={resultat === 'non_reparee' ? 4 : 5} titre="Fouille (terrassement)" aide="En mètres">
        <div className="flex flex-wrap gap-4">
          <ChampMetres id="f-longueur" libelle="Longueur" valeur={fL} onChange={setFL} />
          <ChampMetres id="f-largeur" libelle="Largeur" valeur={fl} onChange={setFl} />
          <ChampMetres id="f-profondeur" libelle="Profondeur" valeur={fP} onChange={setFP} />
        </div>
        {volume != null && <p className="text-muted-foreground text-sm">Volume : {nombre(volume, 3)} m³</p>}
      </Etape>

      <Etape n={resultat === 'non_reparee' ? 5 : 6} titre="Revêtement à refaire">
        <Choix libelle="Revêtement à refaire" valeur={natureId} options={referentiels.natures.map((n) => [n.id, n.libelle_fr])} onChange={choisirNature} effacable taille="sm" />
        {suggestionNature && (
          <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => choisirNature(suggestionNature.id)}>
            Reprendre la nature de dégradation : {suggestionNature.libelle_fr}
          </Button>
        )}
      </Etape>

      <Etape n={resultat === 'non_reparee' ? 6 : 7} titre="Emplacement">
        <Choix libelle="Emplacement" valeur={emplacement} options={Object.entries(EMPLACEMENTS)} onChange={setEmplacement} effacable taille="sm" />
      </Etape>

      <Etape n={resultat === 'non_reparee' ? 7 : 8} titre="Pièces posées" aide="Toucher un article l'ajoute ; « − / + » règle la quantité">
        <Capsules articles={articles} usages={usages} materiau={materiau} diametre={diametreMm} lignes={pieces} onChange={setPieces} />
        {motifPiecesExige && (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground text-xs">Motif de la correction des pièces (obligatoire)</span>
            <Input value={motifPieces} onChange={(e) => setMotifPieces(e.target.value)} placeholder="Ex. pièce oubliée par l'équipe, constatée sur photo" />
          </label>
        )}
      </Etape>

      <Etape n={resultat === 'non_reparee' ? 8 : 9} titre="Compléments">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground text-xs">Représentant {libelles.sigle} présent (facultatif)</span>
            <NativeSelect value={representantId} onChange={(e) => setRepresentantId(e.target.value)} className="w-full">
              <NativeSelectOption value="">{existante?.representant_srm && !existante.representant_srm_id ? `${existante.representant_srm} (saisi)` : '—'}</NativeSelectOption>
              {referentiels.representants.map((r) => <NativeSelectOption key={r.id} value={r.id}>{r.nom}</NativeSelectOption>)}
            </NativeSelect>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground text-xs">Date et heure de la réparation</span>
            <Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          {responsable && (
            <>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground text-xs">Réalisée par (saisie à la place d&apos;un chef d&apos;équipe)</span>
                <NativeSelect value={realiseePar} onChange={(e) => setRealiseePar(e.target.value)} className="w-full">
                  <NativeSelectOption value="">{existante ? '— Inchangé —' : 'Moi-même'}</NativeSelectOption>
                  {referentiels.agents.map((a) => <NativeSelectOption key={a.id} value={a.id}>{a.nom_complet}</NativeSelectOption>)}
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground text-xs">Source de la saisie</span>
                <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} className="w-full">
                  <NativeSelectOption value="tablette">Tablette</NativeSelectOption>
                  <NativeSelectOption value="web">Panneau web</NativeSelectOption>
                  <NativeSelectOption value="papier">Fiche papier</NativeSelectOption>
                </NativeSelect>
              </label>
            </>
          )}
        </div>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground text-xs">Observation</span>
          <Textarea rows={2} value={observation} onChange={(e) => setObservation(e.target.value)} />
        </label>
      </Etape>

      <div className="flex flex-col gap-3 pt-2">
        <Avertissements liste={[...avertissements, ...(futur ? [{ champ: 'date', message: 'Date dans le futur : vérifiez la date et l\'heure.' }] : [])]} />
        {erreur && <Alert variant="destructive"><AlertDescription>{erreur}</AlertDescription></Alert>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="lg" onClick={onAnnuler}>Annuler</Button>
          <Button type="button" size="lg" onClick={verifier}>Vérifier avant d&apos;enregistrer</Button>
        </div>
      </div>
    </div>
  );
}

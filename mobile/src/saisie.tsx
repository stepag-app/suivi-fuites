// Saisie d'une réparation (nouvelle ou modifiée) et d'une réfection (nouvelle ou modifiée), avec ou sans réseau.
// Tout est d'abord gardé sur la tablette (file d'attente), puis envoyé. Rien n'est recalculé ici :
// statut de la fuite et lignes de quantités avancent côté serveur (déclencheurs).
//
// Réparation (P1 à P8) : formulaire séquentiel (résultat → ouvrage ou matériau → diamètre → travaux → fouille →
// revêtement à refaire → emplacement → pièces posées), diamètres selon le matériau, pièces en capsules (− / +),
// représentant du maître d'ouvrage en liste, date et heure modifiables, gardes-fous, récapitulatif avant de confirmer.
import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { controlerDate, DateHeure, useDateHeure } from './date-heure';
import { ajouterEnvoi, effacerPhotos, synchroniser, type PhotoAttente, type PieceAttente } from './file-attente';
import type { ContexteSaisie } from './fiche';
import { Icone } from './icones';
import { enumerer, t, useLangue } from './langue';
import { libelleDb, libelleListe, optionsListe } from './listes';
import { aucunChangement, champsChanges, differences } from './modification';
import { diametresDe, useParametres, type Parametres } from './parametres';
import { prendrePhoto } from './photos';
import { Recapitulatif, type LigneRecap } from './recap';
import { gardeFousRefection, gardeFousReparation, nombreOuNul, piecesProposees } from './regles';
import { useSession } from './session';
import {
  EMPLACEMENTS, MATERIAUX, OUVRAGES, RESULTATS_REPARATION, TYPES_PHOTO, type Piece, type ResultatReparation, type TypePhoto,
} from './types';
import { BarreApp, Bouton, Carte, Case, Champ, COULEURS, Message, POLICE, Puces, s, Saisie, TeteCarte, useBas, Vignettes } from './ui';

const sansAccents = (texte: string) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const enTexte = (v: unknown) => (v == null ? '' : String(v).replace('.', ','));
const nombre = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }));
const libelleDate = (d: Date) => d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function ChoixEquipe({ parametres, valeur, onChange }: { parametres: Parametres; valeur: string; onChange: (v: string) => void }) {
  const reparation = parametres.equipes.filter((e) => e.type !== 'detection');
  const liste = reparation.length ? reparation : parametres.equipes;
  if (!liste.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.etiquette}>{t('Équipe')}</Text>
      <Puces facultatif options={liste.map((e) => ({ valeur: e.id, libelle: e.libelle }))} valeur={valeur} onChange={onChange} />
    </View>
  );
}

/** Photos d'une saisie : un bouton par type, vignettes ; supprimées de la tablette si la saisie est abandonnée. */
function usePhotos() {
  const [photos, setPhotos] = useState<PhotoAttente[]>([]);
  const [erreur, setErreur] = useState('');
  const gardees = useRef(false);
  const courant = useRef<PhotoAttente[]>([]);
  courant.current = photos;
  // Écran quitté sans enregistrer (Annuler, bouton retour d'Android) : on efface les fichiers.
  useEffect(() => () => {
    if (!gardees.current) void effacerPhotos(courant.current);
  }, []);
  async function prendre(type: TypePhoto) {
    setErreur('');
    try {
      const r = await prendrePhoto(type, true);
      if (typeof r === 'string') setErreur(r);
      else if (r) setPhotos((p) => [...p, r]);
    } catch (e) {
      setErreur(t('Photo impossible : {erreur}', { erreur: String((e as Error).message ?? e) }));
    }
  }
  function retirer(id: string) {
    const p = photos.find((x) => x.id === id);
    if (p) void effacerPhotos([p]);
    setPhotos(photos.filter((x) => x.id !== id));
  }
  return { photos, erreur, prendre, retirer, garder: () => { gardees.current = true; } };
}

const libellePhoto = (tp: TypePhoto) => libelleListe('type_photo', tp, TYPES_PHOTO[tp]);

function BlocPhotos({ ph, types, facultatives }: { ph: ReturnType<typeof usePhotos>; types: TypePhoto[]; facultatives?: string }) {
  return (
    <Carte>
      <TeteCarte titre={t('Photos')} compteur={ph.photos.length} description={facultatives} />
      <View style={s.ligne}>
        {types.map((tp) => (
          <Bouton
            key={tp} titre={`${libellePhoto(tp)} (${ph.photos.filter((p) => p.type === tp).length})`} icone="camera"
            onPress={() => ph.prendre(tp)} style={{ flexGrow: 1, flexBasis: 150 }}
          />
        ))}
      </View>
      {!!ph.erreur && <Message ton="erreur">{ph.erreur}</Message>}
      <Vignettes photos={ph.photos.map((p) => ({ id: p.id, uri: p.fichier, legende: libellePhoto(p.type ?? 'autre') }))} retirer={ph.retirer} />
    </Carte>
  );
}

/** Une étape numérotée du formulaire séquentiel. */
function Etape({ n, titre, aide, children }: { n: number; titre: string; aide?: string; children: ReactNode }) {
  return (
    <Carte>
      <View style={[s.ligneTitre, { gap: 12 }]}>
        <View style={e.numero}><Text style={e.texteNumero}>{n}</Text></View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.titreCarte}>{titre}</Text>
          {!!aide && <Text style={s.discret}>{aide}</Text>}
        </View>
      </View>
      {children}
    </Carte>
  );
}

/** Proposition à valider d'un toucher (jamais pré-remplie). */
export function Proposition({ texte, choisie, onPress }: { texte: string; choisie?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [e.proposition, choisie && e.propositionChoisie, pressed && s.appuye]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!choisie }}
    >
      <Icone nom={choisie ? 'check' : 'lightbulb'} taille={18} couleur={choisie ? '#016630' : COULEURS.marque} />
      <Text style={[s.texte, { flexShrink: 1 }]}>{texte}</Text>
    </Pressable>
  );
}

/** Diamètre : liste du marché pour le matériau choisi (P2), « Autre » pour une valeur hors liste. */
function ChoixDiametre({ parametres, materiau, valeur, onChange }: {
  parametres: Parametres; materiau: string; valeur: string; onChange: (v: string) => void;
}) {
  const liste = diametresDe(parametres, materiau);
  const n = nombreOuNul(valeur);
  const horsListe = valeur.trim() !== '' && (n == null || !liste.includes(n));
  const [libre, setLibre] = useState(horsListe);
  if (!liste.length) {
    return <Champ libelle={t('Diamètre (mm) : DE pour le PE, DN pour les conduites')} valeur={valeur} onChange={onChange} nombre />;
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={s.ligne}>
        {liste.map((d) => {
          const actif = !libre && n === d;
          return (
            <Pressable
              key={d}
              onPress={() => { setLibre(false); onChange(actif ? '' : String(d)); }}
              style={({ pressed }) => [s.puce, e.puceDiametre, pressed && !actif && s.appuye, actif && s.puceActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: actif }}
            >
              <Text style={[s.textePuce, actif && { color: COULEURS.principalTexte }]}>{d}</Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => { setLibre(!libre); if (!libre) onChange(''); }}
          style={({ pressed }) => [s.puce, pressed && !libre && s.appuye, libre && s.puceActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: libre }}
        >
          <Text style={[s.textePuce, libre && { color: COULEURS.principalTexte }]}>{t('Autre')}</Text>
        </Pressable>
      </View>
      {libre && <Champ libelle={t('Diamètre (mm) : DE pour le PE, DN pour les conduites')} valeur={valeur} onChange={onChange} nombre />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pièces posées en capsules (P3)
// ---------------------------------------------------------------------------
interface PieceForm extends PieceAttente { texte: string }

function CapsulePosee({ p, onChange, retirer, requantifier }: {
  p: PieceForm; onChange: (texte: string) => void; retirer?: () => void; requantifier: boolean;
}) {
  const q = nombreOuNul(p.texte) ?? 0;
  const pas = (delta: number) => {
    const suivant = Math.round((q + delta) * 100) / 100;
    if (suivant <= 0) retirer?.();
    else onChange(enTexte(suivant));
  };
  return (
    <View style={e.capsule}>
      {requantifier && (
        <Pressable
          onPress={() => pas(-1)} disabled={q <= 1 && !retirer}
          style={({ pressed }) => [e.boutonCapsule, pressed && s.appuye, q <= 1 && !retirer && s.inactif]}
          accessibilityRole="button" accessibilityLabel={t('Une de moins : {designation}', { designation: p.designation })}
        >
          <Icone nom={q <= 1 && retirer ? 'trash' : 'minus'} couleur={q <= 1 && retirer ? COULEURS.danger : COULEURS.texte} />
        </Pressable>
      )}
      <Saisie
        style={e.quantite} value={p.texte} onChangeText={onChange} keyboardType="decimal-pad" editable={requantifier}
        accessibilityLabel={t('Quantité : {designation}', { designation: p.designation })}
      />
      {requantifier && (
        <Pressable
          onPress={() => pas(1)} style={({ pressed }) => [e.boutonCapsule, pressed && s.appuye]}
          accessibilityRole="button" accessibilityLabel={t('Une de plus : {designation}', { designation: p.designation })}
        >
          <Icone nom="plus" />
        </Pressable>
      )}
      <Text style={[s.texte, { flex: 1, minWidth: 140 }]}>{p.designation}</Text>
      {!requantifier && !retirer && <Text style={s.petit}>{t('Retrait : responsable')}</Text>}
    </View>
  );
}

function CapsuleProposee({ p, ajouter }: { p: Piece; ajouter: () => void }) {
  return (
    <Pressable onPress={ajouter} style={({ pressed }) => [e.proposee, pressed && s.appuye]} accessibilityRole="button">
      <Icone nom="plus" taille={18} couleur={COULEURS.discret} />
      <Text style={[s.texte, { flexShrink: 1 }]} numberOfLines={2}>{p.designation}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Réparation (nouvelle, ou modification d'une réparation déjà saisie)
// ---------------------------------------------------------------------------
export function SaisieReparation({ contexte, retour }: { contexte: ContexteSaisie; retour: () => void }) {
  const { marche, peut, aRenouveler } = useSession();
  useLangue();
  const parametres = useParametres(marche?.id, aRenouveler);
  const bas = useBas();
  const m = contexte.modification;
  const init: Record<string, unknown> = m?.etat.ligne ?? {};
  const chaine = (k: string) => (typeof init[k] === 'string' ? (init[k] as string) : '');
  const oui = (k: string) => init[k] === true;
  const sigle = marche?.client_sigle?.trim() || marche?.client?.trim() || t("du maître d'ouvrage");
  const [resultat, setResultat] = useState<ResultatReparation | ''>((chaine('resultat') as ResultatReparation) || 'reparee');
  const [motifId, setMotifId] = useState(chaine('motif_id'));
  const quand = useDateHeure(m ? chaine('realisee_le') : undefined);
  const [equipeId, setEquipeId] = useState(chaine('equipe_id'));
  const [ouvrage, setOuvrage] = useState(chaine('ouvrage'));
  const [materiau, setMateriau] = useState(chaine('materiau'));
  const [diametre, setDiametre] = useState(enTexte(init.diametre_mm));
  const [tuyau, setTuyau] = useState(oui('tuyau_repare'));
  const [robinet, setRobinet] = useState(oui('robinet_pec_change'));
  const [collier, setCollier] = useState(oui('collier_pec_change'));
  const [boucheACle, setBoucheACle] = useState(oui('bouche_a_cle_mise_a_niveau'));
  const [elementRemplace, setElementRemplace] = useState(oui('element_remplace'));
  const [longueurPe, setLongueurPe] = useState(enTexte(init.longueur_pe_m));
  const [fL, setFL] = useState(enTexte(init.fouille_longueur_m));
  const [fl, setFl] = useState(enTexte(init.fouille_largeur_m));
  const [fP, setFP] = useState(enTexte(init.fouille_profondeur_m));
  const [emplacement, setEmplacement] = useState(chaine('emplacement'));
  const [natureId, setNatureId] = useState(chaine('nature_revetement_id'));
  const [representantId, setRepresentantId] = useState(chaine('representant_srm_id'));
  // Nom saisi librement avant la liste des représentants (P7) : gardé tant qu'aucun représentant n'est choisi.
  const representantLibre = chaine('representant_srm_id') ? '' : chaine('representant_srm');
  const [pieces, setPieces] = useState<PieceForm[]>(() => (m?.etat.pieces ?? []).map((p) => ({ ...p, texte: enTexte(p.quantite) })));
  const [recherche, setRecherche] = useState('');
  const [ouvriers, setOuvriers] = useState<string[]>(m?.etat.ouvriers ?? []);
  const [observation, setObservation] = useState(chaine('observation'));
  const [erreur, setErreur] = useState('');
  const [recap, setRecap] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const ph = usePhotos();

  // Droits sur ce qui est déjà saisi : mêmes règles que la base (portée « siennes » sur le compte de saisie).
  const dejaSaisie = (id: string) => !!m?.etat.pieces.some((p) => p.id === id);
  const auteursPiece = (id: string) => (m && id in m.saisiPar ? [m.saisiPar[id]] : undefined);
  const peutRetirer = (id: string) => !dejaSaisie(id) || peut('interventions', 'supprimer', auteursPiece(id));
  const peutRequantifier = (id: string) => !dejaSaisie(id) || peut('interventions', 'modifier', auteursPiece(id));
  const peutAjouter = !m || peut('interventions', 'creer');
  const peutPhotos = !m || peut('photos', 'creer');

  const nDiametre = nombreOuNul(diametre);
  const proposees = useMemo(
    () => piecesProposees(parametres.pieces, {
      materiau, diametre: nDiametre && Number.isInteger(nDiametre) ? nDiametre : null, usage: parametres.usage,
      exclues: pieces.map((p) => p.produit_id).filter((x): x is number => x != null),
    }),
    [parametres.pieces, parametres.usage, materiau, nDiametre, pieces],
  );
  const correspondances = useMemo(() => {
    const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    return parametres.pieces.filter((p) => mots.every((x) => sansAccents(p.designation).includes(x))).slice(0, 8);
  }, [recherche, parametres.pieces]);

  function ajouterPiece(p: Piece) {
    setErreur('');
    const deja = pieces.find((x) => x.produit_id === p.id && !dejaSaisie(x.id));
    if (deja) {
      const q = (nombreOuNul(deja.texte) ?? 0) + 1;
      setPieces(pieces.map((x) => (x.id === deja.id ? { ...x, quantite: q, texte: enTexte(q) } : x)));
    } else {
      setPieces([...pieces, { id: Crypto.randomUUID(), produit_id: p.id, designation: p.designation, quantite: 1, texte: '1' }]);
    }
    setRecherche('');
  }

  function choisirNature(id: string) {
    setNatureId(id);
    const n = parametres.natures.find((x) => x.id === id);
    if (n && n.emplacement !== 'autre') setEmplacement(n.emplacement);
  }
  function choisirMateriau(v: string) {
    setMateriau(v);
    // Diamètre d'un autre matériau : à choisir de nouveau dans la bonne liste.
    if (v !== materiau) setDiametre('');
  }

  const nonReparee = resultat === 'non_reparee';
  const posee = tuyau || elementRemplace;
  const nombres = { diametre: nDiametre, pe: nombreOuNul(longueurPe), l: nombreOuNul(fL), la: nombreOuNul(fl), p: nombreOuNul(fP) };
  const alertes = gardeFousReparation({
    fouille_longueur_m: nombres.l, fouille_largeur_m: nombres.la, fouille_profondeur_m: nombres.p,
    longueur_pe_m: posee ? nombres.pe : null, element_remplace: elementRemplace,
  });
  const representant = parametres.representants.find((r) => r.id === representantId);
  const fuite = contexte.fuite;
  const repriseDetection = fuite?.materiau || fuite?.diametre_mm
    ? [fuite.materiau ? libelleListe('materiau', fuite.materiau, MATERIAUX[fuite.materiau]) : null,
      fuite.diametre_mm ? t('Ø {d} mm', { d: fuite.diametre_mm }) : null].filter(Boolean).join(' · ')
    : '';

  /** Contrôle de la saisie ; renvoie la ligne et les pièces à enregistrer, ou affiche l'erreur. */
  function preparer() {
    setErreur('');
    if (!resultat) return setErreur(t('Choisissez le résultat.'));
    if (nonReparee && !motifId) return setErreur(t('Fuite non réparée : choisissez le motif.'));
    let realiseeLe = chaine('realisee_le');
    if (!quand.inchangee) {
      const date = controlerDate(quand.valeur);
      if ('erreur' in date) return setErreur(date.erreur);
      realiseeLe = date.iso;
    }
    const textes = { diametre, pe: longueurPe, l: fL, la: fl, p: fP };
    for (const k of Object.keys(nombres) as (keyof typeof nombres)[]) {
      if (textes[k].trim() !== '' && (nombres[k] == null || (nombres[k] ?? 0) < 0)) {
        return setErreur(t('Valeur numérique invalide : « {valeur} ».', { valeur: textes[k] }));
      }
    }
    if (nombres.diametre != null && !Number.isInteger(nombres.diametre)) return setErreur(t('Diamètre : un nombre entier de millimètres.'));
    const posees: PieceAttente[] = [];
    for (const p of pieces) {
      const q = nombreOuNul(p.texte);
      if (!q || q <= 0) return setErreur(t('Quantité de « {designation} » : un nombre supérieur à 0.', { designation: p.designation }));
      posees.push({ id: p.id, produit_id: p.produit_id, designation: p.designation, quantite: q });
    }
    const ligne: Record<string, unknown> = {
      resultat, motif_id: nonReparee ? motifId : null, realisee_le: realiseeLe,
      equipe_id: equipeId || null, ouvrage: ouvrage || null, materiau: materiau || null, diametre_mm: nombres.diametre,
      // Non réparée (P8) : travaux, fouille et pièces restent saisissables et attachés.
      tuyau_repare: tuyau, robinet_pec_change: robinet, collier_pec_change: collier,
      bouche_a_cle_mise_a_niveau: boucheACle, element_remplace: elementRemplace,
      longueur_pe_m: posee ? nombres.pe : null,
      fouille_longueur_m: nombres.l, fouille_largeur_m: nombres.la, fouille_profondeur_m: nombres.p,
      emplacement: emplacement || null, nature_revetement_id: natureId || null,
      representant_srm_id: representant?.id ?? null, representant_srm: representant?.nom ?? (representantLibre || null),
      observation: observation.trim() || null,
    };
    const changements = m ? differences(m.etat, { ligne, pieces: posees, ouvriers }) : null;
    if (changements && aucunChangement(changements) && !ph.photos.length) return setErreur(t('Aucune modification à enregistrer.'));
    return { ligne, posees, changements };
  }

  async function enregistrer() {
    const pret = preparer();
    if (!marche || !pret) {
      setRecap(false);
      return;
    }
    setOccupe(true);
    try {
      const commun = { id: Crypto.randomUUID(), marche_id: marche.id, fuite_id: contexte.fuiteId, fuite_libelle: contexte.libelle, photos: ph.photos };
      if (m && pret.changements) {
        await ajouterEnvoi({ ...commun, type: 'modification', reparation_id: m.reparationId, changements: pret.changements });
      } else {
        await ajouterEnvoi({
          ...commun, type: 'reparation', pieces: pret.posees, ouvriers,
          ligne: { ...pret.ligne, fuite_id: contexte.fuiteId, source_saisie: 'tablette' },
        });
      }
      ph.garder();
      void synchroniser().catch(() => undefined);
      retour();
    } catch (err) {
      setErreur(t('Enregistrement sur la tablette impossible : {erreur}', { erreur: String((err as Error).message ?? err) }));
      setOccupe(false);
      setRecap(false);
    }
  }

  const travaux = [
    tuyau && libelleListe('travaux_reparation', 'tuyau_repare', 'Tuyau / conduite réparé(e)'),
    robinet && libelleListe('travaux_reparation', 'robinet_pec_change', 'Robinet PEC changé'),
    collier && libelleListe('travaux_reparation', 'collier_pec_change', 'Collier PEC changé'),
    boucheACle && libelleListe('travaux_reparation', 'bouche_a_cle_mise_a_niveau', 'Bouche à clé mise à niveau'),
    elementRemplace && libelleListe('travaux_reparation', 'element_remplace', 'Élément de conduite remplacé'),
  ].filter((x): x is string => !!x);
  const lignesRecap: LigneRecap[] = [
    { libelle: t('Résultat'), valeur: resultat ? libelleListe('resultat_reparation', resultat, RESULTATS_REPARATION[resultat]) : null },
    { libelle: t('Motif'), valeur: nonReparee ? libelleDb(parametres.motifs.find((x) => x.id === motifId)) : null },
    { libelle: t('Date et heure'), valeur: libelleDate(quand.valeur) },
    { libelle: t('Équipe'), valeur: parametres.equipes.find((x) => x.id === equipeId)?.libelle },
    { libelle: t('Ouvrage'), valeur: libelleListe('ouvrage', ouvrage, OUVRAGES[ouvrage]) },
    { libelle: t('Matériau'), valeur: libelleListe('materiau', materiau, MATERIAUX[materiau]) },
    { libelle: t('Diamètre'), valeur: nombres.diametre != null ? t('Ø {d} mm', { d: nombres.diametre }) : null },
    { libelle: t('Travaux'), valeur: travaux.length ? enumerer(travaux) : null },
    { libelle: t('Longueur de conduite posée'), valeur: posee && nombres.pe != null ? t('{n} m', { n: nombre(nombres.pe) }) : null },
    {
      libelle: t('Fouille'),
      valeur: nombres.l != null || nombres.la != null || nombres.p != null
        ? t('{l} × {la} × {p} m', { l: nombre(nombres.l) || '—', la: nombre(nombres.la) || '—', p: nombre(nombres.p) || '—' }) : null,
    },
    { libelle: t('Revêtement à refaire'), valeur: libelleDb(parametres.natures.find((x) => x.id === natureId)) },
    { libelle: t('Emplacement'), valeur: libelleListe('emplacement', emplacement, EMPLACEMENTS[emplacement]) },
    { libelle: t('Représentant présent'), valeur: representant?.nom ?? representantLibre },
    { libelle: t('Ouvriers'), valeur: ouvriers.map((o) => parametres.ouvriers.find((x) => x.id === o)?.nom_complet ?? '?').join(', ') },
    { libelle: t('Photos'), valeur: ph.photos.length ? String(ph.photos.length) : t('Aucune photo') },
    { libelle: t('Observation'), valeur: observation.trim() },
  ];
  const alertesRecap = [...alertes, ...(ph.photos.length || m ? [] : [t('Aucune photo : vous pourrez en ajouter depuis la fiche.')])];

  return (
    <View style={s.ecran}>
      <BarreApp titre={m ? t('Modifier la réparation') : t('Nouvelle réparation')} sousTitre={contexte.libelle} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]} keyboardShouldPersistTaps="handled">
        {m && (
          <Text style={s.discret}>
            {t("Corrigez ce qui doit l'être, puis « Enregistrer les modifications ». Les photos prises ici s'ajoutent à celles déjà envoyées.")}
          </Text>
        )}
        <Etape n={1} titre={t('Résultat')}>
          <Puces
            options={optionsListe('resultat_reparation', RESULTATS_REPARATION) as { valeur: ResultatReparation; libelle: string }[]}
            valeur={resultat} onChange={setResultat}
          />
          {nonReparee && (
            <>
              <Text style={s.etiquette}>{t('Motif (obligatoire)')}</Text>
              <Puces
                options={parametres.motifs.filter((x) => x.categorie === 'sans_reparation').map((x) => ({ valeur: x.id, libelle: libelleDb(x) }))}
                valeur={motifId} onChange={setMotifId}
              />
              <Text style={s.discret}>{t('Fouille et pièces posées restent à saisir : elles sont attachées même sans réparation.')}</Text>
            </>
          )}
        </Etape>

        <Etape n={2} titre={t('Ouvrage ou matériau')}>
          <Text style={s.etiquette}>{t('Ouvrage')}</Text>
          <Puces facultatif options={optionsListe('ouvrage', OUVRAGES)} valeur={ouvrage} onChange={setOuvrage} />
          <Text style={s.etiquette}>{t('Matériau')}</Text>
          {!!repriseDetection && !materiau && !diametre && (
            <Proposition
              texte={t('Comme à la détection : {conduite}', { conduite: repriseDetection })}
              onPress={() => {
                if (fuite?.materiau) setMateriau(fuite.materiau);
                if (fuite?.diametre_mm) setDiametre(String(fuite.diametre_mm));
              }}
            />
          )}
          <Puces facultatif options={optionsListe('materiau', MATERIAUX)} valeur={materiau} onChange={choisirMateriau} />
        </Etape>

        <Etape n={3} titre={t('Diamètre')} aide={materiau ? undefined : t('Choisissez d\'abord le matériau : la liste des diamètres en dépend.')}>
          <ChoixDiametre key={materiau} parametres={parametres} materiau={materiau} valeur={diametre} onChange={setDiametre} />
        </Etape>

        <Etape n={4} titre={t('Travaux réalisés')}>
          <Case libelle={libelleListe('travaux_reparation', 'tuyau_repare', 'Tuyau / conduite réparé(e)')} valeur={tuyau} onChange={setTuyau} />
          <Case libelle={libelleListe('travaux_reparation', 'robinet_pec_change', 'Robinet PEC changé')} valeur={robinet} onChange={setRobinet} />
          <Case libelle={libelleListe('travaux_reparation', 'collier_pec_change', 'Collier PEC changé')} valeur={collier} onChange={setCollier} />
          <Case
            libelle={libelleListe('travaux_reparation', 'bouche_a_cle_mise_a_niveau', 'Bouche à clé mise à niveau')}
            valeur={boucheACle} onChange={setBoucheACle}
          />
          <Case
            libelle={libelleListe('travaux_reparation', 'element_remplace', 'Élément de conduite remplacé')}
            valeur={elementRemplace} onChange={setElementRemplace}
          />
          {posee && <Champ libelle={t('Longueur de conduite posée (m)')} valeur={longueurPe} onChange={setLongueurPe} nombre />}
        </Etape>

        <Etape n={5} titre={t('Fouille')} aide={t('En mètres : 0,80 pour 80 cm.')}>
          <View style={s.ligne}>
            <Champ libelle={t('Longueur (m)')} valeur={fL} onChange={setFL} nombre />
            <Champ libelle={t('Largeur (m)')} valeur={fl} onChange={setFl} nombre />
            <Champ libelle={t('Profondeur (m)')} valeur={fP} onChange={setFP} nombre />
          </View>
          {alertes.map((a) => <Message key={a} ton="attention">{a}</Message>)}
        </Etape>

        <Etape n={6} titre={t('Revêtement à refaire')}>
          <Puces facultatif options={parametres.natures.map((n) => ({ valeur: n.id, libelle: libelleDb(n) }))} valeur={natureId} onChange={choisirNature} />
        </Etape>

        <Etape n={7} titre={t('Emplacement')}>
          <Puces facultatif options={optionsListe('emplacement', EMPLACEMENTS)} valeur={emplacement} onChange={setEmplacement} />
        </Etape>

        <Etape n={8} titre={t('Pièces posées')} aide={t('Un toucher ajoute la pièce ; « − / + » règle la quantité.')}>
          {pieces.length > 0 && (
            <View style={{ gap: 8 }}>
              {pieces.map((p) => (
                <CapsulePosee
                  key={p.id} p={p} requantifier={peutRequantifier(p.id)}
                  onChange={(texte) => setPieces(pieces.map((x) => (x.id === p.id ? { ...x, texte } : x)))}
                  retirer={peutRetirer(p.id) ? () => setPieces(pieces.filter((x) => x.id !== p.id)) : undefined}
                />
              ))}
            </View>
          )}
          {peutAjouter && (
            <>
              {proposees.adaptees.length > 0 && (
                <>
                  <Text style={s.etiquette}>
                    {nDiametre ? t('Proposées pour Ø {d} mm', { d: nDiametre }) : t('Proposées pour ce matériau')}
                  </Text>
                  <View style={s.ligne}>{proposees.adaptees.map((p) => <CapsuleProposee key={p.id} p={p} ajouter={() => ajouterPiece(p)} />)}</View>
                </>
              )}
              {proposees.frequentes.length > 0 && (
                <>
                  <Text style={s.etiquette}>{t('Les plus utilisées')}</Text>
                  <View style={s.ligne}>{proposees.frequentes.map((p) => <CapsuleProposee key={p.id} p={p} ajouter={() => ajouterPiece(p)} />)}</View>
                </>
              )}
              <Champ libelle={t('Rechercher un autre article')} valeur={recherche} onChange={setRecherche} indication={t('ex. collier 63')} />
              {correspondances.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => ajouterPiece(p)}
                  style={({ pressed }) => [s.case, pressed && s.appuye]}
                  accessibilityRole="button"
                >
                  <Icone nom="plus" couleur={COULEURS.discret} />
                  <Text style={[s.texte, { flex: 1 }]}>{p.designation}</Text>
                  <Text style={s.discret}>{p.unite || 'u'}</Text>
                </Pressable>
              ))}
              {!!recherche.trim() && !correspondances.length && !!parametres.pieces.length && (
                <Text style={s.discret}>
                  {t("Aucun article ne correspond. S'il manque, notez-le en observation : le responsable demandera sa création dans Dolibarr.")}
                </Text>
              )}
              {!parametres.pieces.length && <Text style={s.discret}>{t('Liste des articles pas encore chargée sur cette tablette : connectez-la au réseau.')}</Text>}
            </>
          )}
        </Etape>

        <Carte>
          <DateHeure d={quand} />
          <ChoixEquipe parametres={parametres} valeur={equipeId} onChange={setEquipeId} />
          <View style={{ gap: 6 }}>
            <Text style={s.etiquette}>{t('Représentant {sigle} présent (facultatif)', { sigle })}</Text>
            {parametres.representants.length > 0 ? (
              <Puces
                facultatif options={parametres.representants.map((r) => ({ valeur: r.id, libelle: r.nom }))}
                valeur={representantId} onChange={setRepresentantId}
              />
            ) : <Text style={s.discret}>{t('Aucun représentant dans la liste du marché.')}</Text>}
            {!!representantLibre && !representantId && <Text style={s.petit}>{t('Saisi auparavant : {nom}', { nom: representantLibre })}</Text>}
          </View>
        </Carte>

        {parametres.ouvriers.length > 0 && (
          <Carte>
            <Text style={s.sousTitre}>{t('Ouvriers (facultatif)')}</Text>
            <View style={s.ligne}>
              {parametres.ouvriers.map((o) => {
                const actif = ouvriers.includes(o.id);
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => setOuvriers(actif ? ouvriers.filter((x) => x !== o.id) : [...ouvriers, o.id])}
                    disabled={!actif && !peutAjouter}
                    style={[s.puce, actif && s.puceActive, !actif && !peutAjouter && s.inactif]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: actif }}
                  >
                    <Text style={[s.textePuce, actif && { color: COULEURS.principalTexte }]}>{o.nom_complet}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Carte>
        )}

        {peutPhotos && <BlocPhotos ph={ph} types={['avant', 'pendant', 'apres']} facultatives={t('Facultatives, mais attendues par le responsable.')} />}

        <Carte>
          <Champ libelle={t('Observation')} valeur={observation} onChange={setObservation} multiligne />
        </Carte>

        {!!erreur && <Message ton="erreur">{erreur}</Message>}
        <Bouton titre={t('Vérifier et enregistrer')} icone="clipboard-check" primaire grand onPress={() => preparer() && setRecap(true)} />
        <Bouton titre={t('Annuler')} onPress={retour} desactive={occupe} />
      </ScrollView>
      <Recapitulatif
        visible={recap} titre={t('Récapitulatif de la réparation')} sousTitre={contexte.libelle} lignes={lignesRecap}
        pieces={pieces.map((p) => ({ quantite: p.texte, designation: p.designation }))} alertes={alertesRecap}
        corriger={() => setRecap(false)} confirmer={() => void enregistrer()} occupe={occupe}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Réfection (nouvelle, ou modification d'une réfection pas encore validée)
// ---------------------------------------------------------------------------
export function SaisieRefection({ contexte, retour }: { contexte: ContexteSaisie; retour: () => void }) {
  const { marche, aRenouveler } = useSession();
  useLangue();
  const parametres = useParametres(marche?.id, aRenouveler);
  const bas = useBas();
  const m = contexte.modificationRefection;
  const init: Record<string, unknown> = m?.ligne ?? {};
  const chaine = (k: string) => (typeof init[k] === 'string' ? (init[k] as string) : '');
  const [resultat, setResultat] = useState<'faite' | 'non_faite' | ''>((chaine('resultat') as 'faite' | 'non_faite') || 'faite');
  const [natureId, setNatureId] = useState(chaine('nature_id'));
  const [longueurT, setLongueurT] = useState(enTexte(init.longueur_m));
  const [largeurT, setLargeurT] = useState(enTexte(init.largeur_m));
  const [motifId, setMotifId] = useState(chaine('motif_id'));
  const [equipeId, setEquipeId] = useState(chaine('equipe_id'));
  const [observation, setObservation] = useState(chaine('observation'));
  const quand = useDateHeure(m ? chaine('realisee_le') : undefined);
  const [erreur, setErreur] = useState('');
  const [recap, setRecap] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const ph = usePhotos();
  const d = contexte.derniere;
  const naturePrevue = libelleDb(parametres.natures.find((n) => n.id === d?.nature_revetement_id)) || undefined;
  const fouille = (v: number | null | undefined) => (v != null ? t('{valeur} (fouille)', { valeur: String(v).replace('.', ',') }) : undefined);
  const faite = resultat === 'faite';
  const [longueur, largeur] = [nombreOuNul(longueurT), nombreOuNul(largeurT)];
  const alertes = gardeFousRefection({ longueur, largeur, faite }, {
    fouilles: contexte.fouilles ?? [], fouilleReprise: d,
    refections: (contexte.refections ?? []).filter((r) => r.id !== m?.refectionId),
  });

  function preparer() {
    setErreur('');
    if (!resultat) return setErreur(t('Indiquez si la réfection est faite.'));
    if (faite && !natureId && !d?.nature_revetement_id) {
      return setErreur(t("Choisissez la nature de la réfection (aucune n'est prévue à la réparation)."));
    }
    if (!faite && !motifId) return setErreur(t('Réfection non faite : choisissez le motif.'));
    if ((longueurT.trim() && (longueur == null || longueur < 0)) || (largeurT.trim() && (largeur == null || largeur < 0))) {
      return setErreur(t('Longueur ou largeur invalide.'));
    }
    let realiseeLe = chaine('realisee_le');
    if (!quand.inchangee) {
      const date = controlerDate(quand.valeur);
      if ('erreur' in date) return setErreur(date.erreur);
      realiseeLe = date.iso;
    }
    // Longueur, largeur et nature vides : reprises de la fouille par le serveur.
    const ligne: Record<string, unknown> = {
      resultat, realisee_le: realiseeLe, equipe_id: equipeId || null,
      nature_id: faite ? natureId || null : null, motif_id: faite ? null : motifId,
      longueur_m: faite ? longueur : null, largeur_m: faite ? largeur : null, observation: observation.trim() || null,
    };
    if (m) {
      const champs = champsChanges(init, ligne);
      if (!Object.keys(champs).length && !ph.photos.length) return setErreur(t('Aucune modification à enregistrer.'));
      return { ligne: champs };
    }
    return { ligne };
  }

  async function enregistrer() {
    const pret = preparer();
    if (!marche || !pret) {
      setRecap(false);
      return;
    }
    setOccupe(true);
    try {
      const commun = { id: Crypto.randomUUID(), marche_id: marche.id, fuite_id: contexte.fuiteId, fuite_libelle: contexte.libelle };
      if (m) {
        if (Object.keys(pret.ligne).length) {
          await ajouterEnvoi({ ...commun, type: 'maj', table: 'refections', ligne_id: m.refectionId, champs: pret.ligne, photos: [] });
        }
        if (ph.photos.length) {
          await ajouterEnvoi({ ...commun, id: Crypto.randomUUID(), type: 'photos', refection_id: m.refectionId, photos: ph.photos });
        }
      } else {
        await ajouterEnvoi({
          ...commun, type: 'refection', photos: ph.photos,
          ligne: { ...pret.ligne, fuite_id: contexte.fuiteId, source_saisie: 'tablette' },
        });
      }
      ph.garder();
      void synchroniser().catch(() => undefined);
      retour();
    } catch (err) {
      setErreur(t('Enregistrement sur la tablette impossible : {erreur}', { erreur: String((err as Error).message ?? err) }));
      setOccupe(false);
      setRecap(false);
    }
  }

  const dimensions = longueur != null || largeur != null
    ? t('{l} × {la} m', { l: nombre(longueur) || '—', la: nombre(largeur) || '—' })
    : d?.fouille_longueur_m != null ? t('Dimensions de la fouille ({l} × {la} m)', { l: nombre(d.fouille_longueur_m), la: nombre(d.fouille_largeur_m) || '—' }) : null;
  const lignesRecap: LigneRecap[] = [
    { libelle: t('Résultat'), valeur: faite ? t('Réfection faite') : t('Non faite (motif)') },
    { libelle: t('Nature'), valeur: faite ? libelleDb(parametres.natures.find((n) => n.id === natureId)) || naturePrevue : null },
    { libelle: t('Dimensions'), valeur: faite ? dimensions : null },
    { libelle: t('Motif'), valeur: faite ? null : libelleDb(parametres.motifs.find((x) => x.id === motifId)) },
    { libelle: t('Date et heure'), valeur: libelleDate(quand.valeur) },
    { libelle: t('Équipe'), valeur: parametres.equipes.find((x) => x.id === equipeId)?.libelle },
    { libelle: t('Photos'), valeur: ph.photos.length ? String(ph.photos.length) : t('Aucune photo') },
    { libelle: t('Observation'), valeur: observation.trim() },
  ];
  const alertesRecap = [...alertes, ...(ph.photos.length || m ? [] : [t('Aucune photo : vous pourrez en ajouter depuis la fiche.')])];

  return (
    <View style={s.ecran}>
      <BarreApp titre={m ? t('Modifier la réfection') : t('Nouvelle réfection')} sousTitre={contexte.libelle} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]} keyboardShouldPersistTaps="handled">
        <Carte>
          <Puces
            options={[{ valeur: 'faite' as const, libelle: t('Réfection faite') }, { valeur: 'non_faite' as const, libelle: t('Non faite (motif)') }]}
            valeur={resultat} onChange={setResultat}
          />
          {faite && (
            <>
              <Text style={s.etiquette}>
                {naturePrevue ? t('Nature (vide : {nature}, prévue à la réparation)', { nature: naturePrevue }) : t('Nature')}
              </Text>
              <Puces facultatif options={parametres.natures.map((n) => ({ valeur: n.id, libelle: libelleDb(n) }))} valeur={natureId} onChange={setNatureId} />
              <View style={s.ligne}>
                <Champ libelle={t('Longueur (m)')} valeur={longueurT} onChange={setLongueurT} nombre indication={fouille(d?.fouille_longueur_m)} />
                <Champ libelle={t('Largeur (m)')} valeur={largeurT} onChange={setLargeurT} nombre indication={fouille(d?.fouille_largeur_m)} />
              </View>
              <Text style={s.discret}>{t('Laissées vides, longueur et largeur sont reprises de la fouille.')}</Text>
              {alertes.map((a) => <Message key={a} ton="attention">{a}</Message>)}
            </>
          )}
          {!faite && (
            <>
              <Text style={s.etiquette}>{t('Motif (obligatoire)')}</Text>
              <Puces
                options={parametres.motifs.filter((x) => x.categorie === 'sans_refection').map((x) => ({ valeur: x.id, libelle: libelleDb(x) }))}
                valeur={motifId} onChange={setMotifId}
              />
            </>
          )}
          <DateHeure d={quand} />
          <ChoixEquipe parametres={parametres} valeur={equipeId} onChange={setEquipeId} />
        </Carte>
        <BlocPhotos ph={ph} types={['refection']} facultatives={t('Facultatives, mais attendues par le responsable.')} />
        <Carte>
          <Champ libelle={t('Observation')} valeur={observation} onChange={setObservation} multiligne />
        </Carte>
        {!!erreur && <Message ton="erreur">{erreur}</Message>}
        <Bouton titre={t('Vérifier et enregistrer')} icone="clipboard-check" primaire grand onPress={() => preparer() && setRecap(true)} />
        <Bouton titre={t('Annuler')} onPress={retour} desactive={occupe} />
      </ScrollView>
      <Recapitulatif
        visible={recap} titre={t('Récapitulatif de la réfection')} sousTitre={contexte.libelle} lignes={lignesRecap}
        alertes={alertesRecap} corriger={() => setRecap(false)} confirmer={() => void enregistrer()} occupe={occupe}
      />
    </View>
  );
}

const e = StyleSheet.create({
  numero: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: COULEURS.principal, alignItems: 'center', justifyContent: 'center',
  },
  texteNumero: { fontFamily: POLICE, fontSize: 15, fontWeight: '600', color: COULEURS.principalTexte },
  proposition: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderStyle: 'dashed', borderColor: COULEURS.marque, backgroundColor: 'rgba(0, 132, 209, 0.06)', alignSelf: 'flex-start',
  },
  propositionChoisie: { borderStyle: 'solid', borderColor: '#b9f8cf', backgroundColor: '#f0fdf4' },
  puceDiametre: { minWidth: 64, alignItems: 'center' },
  capsule: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 6, paddingRight: 12, borderRadius: 999,
    borderWidth: 1, borderColor: COULEURS.bord, backgroundColor: COULEURS.sourdine,
  },
  boutonCapsule: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COULEURS.fond, borderWidth: 1, borderColor: COULEURS.bord,
    alignItems: 'center', justifyContent: 'center',
  },
  quantite: { width: 72, minHeight: 48, textAlign: 'center', borderRadius: 24, paddingHorizontal: 6 },
  proposee: {
    minHeight: 48, maxWidth: 420, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 999, borderWidth: 1, borderColor: COULEURS.bord, backgroundColor: COULEURS.fond,
  },
});

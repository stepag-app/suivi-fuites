// Fiche d'une fuite : informations, statut, validation, photos, réparations et réfections (serveur + saisies
// gardées sur la tablette). Jamais de prix ni de quantités du bordereau ; jamais les corrections du bureau pour le
// terrain (R7 : pièces lues dans v_pieces_terrain).
//
// Validation par étape (V1, V2) : chaque étape (détection, réparation, réfection) montre « À valider » ou « Validée ».
// Avant validation, l'auteur la modifie ; après, il ajoute seulement (le nouvel élément est à valider). Le responsable
// valide depuis la fiche ou l'écran « À valider ». Fuite verrouillée par un lot arrêté (V6) : ajouts permis, ils
// reviennent dans « À attacher ».
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { chargerFiche, fuiteLocale, type Donnees } from './fiche-donnees';
import {
  ajouterEnvoi, estFuite, fuiteDe, lireAttente, messageClair, surChangement, synchroniser,
  type Envoi, type EnvoiMaj, type EnvoiModification, type EnvoiRefection, type EnvoiReparation,
} from './file-attente';
import { enumerer, t, tx, useLangue } from './langue';
import { libelleDb, libelleListe } from './listes';
import { appliquer, type EtatReparation } from './modification';
import { useParametres, type Parametres } from './parametres';
import { prendrePhoto, urlsPhotos } from './photos';
import { peutChangerPhoto, peutModifierEtape, type Fouille } from './regles';
import { useSession } from './session';
import { supabase } from './supabase';
import {
  EMPLACEMENTS, MATERIAUX, OUVRAGES, RESULTATS_REPARATION, TYPES_PHOTO, VISIBILITES,
  type FicheFuite, type PhotoLigne, type Refection, type Reparation, type TypePhoto,
} from './types';
import { Icone, type NomIcone } from './icones';
import {
  Alerte, AnneauStatut, Badge, BarreApp, Bouton, BoutonYAller, Carte, COULEURS, Info, LARGEUR_LARGE, Message, POLICE, s, Statut,
  TeteCarte, useBas, Vide, Vignettes,
} from './ui';

export const dateHeure = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const nombre = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

/** Ce que les écrans de saisie reçoivent de la fiche. */
export interface ContexteSaisie {
  fuiteId: string;
  libelle: string;
  /** Dernière réparation connue (serveur ou tablette) : la réfection en reprend la fouille et le revêtement. */
  derniere: Pick<Reparation, 'fouille_longueur_m' | 'fouille_largeur_m' | 'nature_revetement_id'> | null;
  /** Conduite notée à la détection (suggestion du tronçon validée) : proposée à la réparation. */
  fuite?: { materiau?: string | null; diametre_mm?: number | null };
  /** Fouilles de toutes les réparations et réfections déjà saisies : gardes-fous de la réfection (P9). */
  fouilles?: Fouille[];
  refections?: { id: string; longueur_m: number | null; largeur_m: number | null; resultat?: string }[];
  /** Modification d'une réparation déjà saisie : état de départ et compte de saisie de chaque pièce envoyée. */
  modification?: { reparationId: string; etat: EtatReparation; saisiPar: Record<string, string | null> };
  /** Modification d'une réfection pas encore validée : ligne de départ. */
  modificationRefection?: { refectionId: string; ligne: Record<string, unknown> };
}

export const libelleFuite = (f: Pick<FicheFuite, 'numero' | 'reference_srm'>) =>
  f.numero != null
    ? t('Fuite N° {numero}', { numero: f.numero })
    : f.reference_srm ? t('Fuite à envoyer ({reference})', { reference: f.reference_srm }) : t('Fuite à envoyer');

/** Réparation à afficher (serveur ou tablette), modifications encore sur la tablette appliquées. */
interface BlocRep {
  id: string; etat: EtatReparation; creation?: EnvoiReparation; modifs: EnvoiModification[];
  /** Auteur terrain et compte de saisie (portée « siennes ») ; absent : saisie faite sur cette tablette. */
  auteurs?: (string | null | undefined)[];
  saisiPar: Record<string, string | null>;
  validee_le?: string | null; cree_le?: string | null;
}
interface BlocRef { r: Refection; local?: EnvoiRefection; majs: EnvoiMaj[] }

type Etape = 'detection' | 'reparation' | 'refection';
interface VignettePhoto { id: string; uri?: string; legende: string; toucher?: () => void }

/** Changements de la tablette pas encore envoyés, appliqués à la ligne affichée. */
const avecMajs = <T extends object>(ligne: T, majs: EnvoiMaj[]): T => majs.reduce((l, m) => ({ ...l, ...m.champs }), ligne);

export function Fiche({ id, retour, saisir, modifierFuite }: {
  id: string; retour: () => void; saisir: (type: 'reparation' | 'refection', contexte: ContexteSaisie) => void;
  modifierFuite: (fuite: FicheFuite) => void;
}) {
  const { marche, peut, aRenouveler } = useSession();
  useLangue();
  const parametres = useParametres(marche?.id, aRenouveler);
  const large = useWindowDimensions().width >= LARGEUR_LARGE;
  const bas = useBas();
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [locaux, setLocaux] = useState<Envoi[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [horsLigne, setHorsLigne] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [photoEnCours, setPhotoEnCours] = useState(false);
  const [validation, setValidation] = useState('');
  const bureau = peut('interventions', 'valider');

  // Version affichée (copie de la tablette ou serveur) : la copie n'est lue qu'à l'ouverture de la fiche.
  const affichee = useRef(false);
  const charger = useCallback(async () => {
    const attente = (await lireAttente()).filter((e) => fuiteDe(e) === id);
    setLocaux(attente);
    const serveur = await chargerFiche(id, {
      copie: !affichee.current, aRenouveler, bureau,
      afficher: (d) => {
        affichee.current = true;
        setDonnees(d);
        setChargement(false);
      },
    });
    if (serveur) {
      setHorsLigne(false);
      if (serveur.photos.length) setUrls(await urlsPhotos(serveur.photos).catch(() => ({})));
    } else setHorsLigne(true);
    setChargement(false);
  }, [id, aRenouveler, bureau]);

  useEffect(() => {
    charger();
    return surChangement(() => void charger());
  }, [charger]);

  const envoiFuite = locaux.find((e) => estFuite(e) && e.id === id);
  const majs = locaux.filter((e): e is EnvoiMaj => e.type === 'maj');
  const majsDe = (table: EnvoiMaj['table'], ligneId: string) => majs.filter((m) => m.table === table && m.ligne_id === ligneId);
  const fuiteBrute = donnees?.fuite ?? (envoiFuite ? fuiteLocale(envoiFuite) : null);
  const fuite = fuiteBrute ? avecMajs(fuiteBrute, majsDe('fuites', id)) : null;

  if (chargement) {
    return (
      <View style={s.ecran}>
        <BarreApp titre={t('Fiche de la fuite')} retour={retour} />
        <View style={[s.contenu, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={COULEURS.principal} />
          <Text style={s.discret}>{t('Chargement…')}</Text>
        </View>
      </View>
    );
  }
  if (!fuite) {
    return (
      <View style={s.ecran}>
        <BarreApp titre={t('Fiche de la fuite')} retour={retour} />
        <View style={s.defile}>
          <Message ton="erreur" icone={horsLigne ? 'wifi-off' : undefined}>
            {horsLigne ? t('Fiche jamais ouverte sur cette tablette : elle sera disponible au retour du réseau.') : t('Fuite introuvable ou accès refusé.')}
          </Message>
          <Bouton titre={t('Liste des fuites')} icone="arrow-left" onPress={retour} style={{ alignSelf: 'flex-start' }} />
        </View>
      </View>
    );
  }

  const libelle = libelleFuite(fuite);
  const designation = (pieceId: number | null, libre: string | null) =>
    parametres.pieces.find((p) => p.id === pieceId)?.designation ?? libre ?? t('Pièce');
  const creations = locaux.filter((e): e is EnvoiReparation => e.type === 'reparation');
  const modifs = locaux.filter((e): e is EnvoiModification => e.type === 'modification');
  const refectionsLocales = locaux.filter((e): e is EnvoiRefection => e.type === 'refection');
  const reparations = donnees?.reparations ?? [];
  const refections = donnees?.refections ?? [];
  const piecesServeur = donnees?.pieces ?? [];

  const depuisCreation = (e: EnvoiReparation): EtatReparation => ({ ligne: e.ligne, pieces: e.pieces, ouvriers: e.ouvriers });
  const depuisServeur = (r: Reparation): EtatReparation => ({
    ligne: r as unknown as Record<string, unknown>,
    pieces: piecesServeur.filter((p) => p.reparation_id === r.id).map((p) => ({
      id: p.id, produit_id: p.produit_id, designation: p.produit?.designation ?? designation(p.produit_id, p.designation_libre), quantite: Number(p.quantite),
    })),
    ouvriers: (donnees?.ouvriers ?? []).filter((o) => o.reparation_id === r.id).map((o) => o.ouvrier_id),
  });
  const bloc = (rid: string, base: EtatReparation, creation?: EnvoiReparation, serveur?: Reparation): BlocRep => {
    const siennes = modifs.filter((m) => m.reparation_id === rid);
    return {
      id: rid, creation, modifs: siennes,
      etat: siennes.reduce((etat, m) => appliquer(etat, m.changements), base),
      auteurs: creation ? undefined : [serveur?.auteur_terrain_id, serveur?.saisi_par],
      saisiPar: Object.fromEntries(piecesServeur.filter((p) => p.reparation_id === rid).map((p) => [p.id, p.saisi_par ?? null])),
      validee_le: serveur?.validee_le, cree_le: serveur?.cree_le,
    };
  };
  // Une réparation à moitié envoyée (photos en attente) est déjà au serveur : on l'affiche une fois,
  // à partir de la saisie complète gardée sur la tablette.
  const blocs: BlocRep[] = [
    ...reparations.map((r) => {
      const creation = creations.find((e) => e.id === r.id);
      return bloc(r.id, creation ? depuisCreation(creation) : depuisServeur(r), creation, r);
    }),
    ...creations.filter((e) => !reparations.some((r) => r.id === e.id)).map((e) => bloc(e.id, depuisCreation(e), e)),
  ];
  const blocsRefection: BlocRef[] = [
    ...refections.map((r) => ({ r: avecMajs(r, majsDe('refections', r.id)), local: refectionsLocales.find((e) => e.id === r.id), majs: majsDe('refections', r.id) })),
    ...refectionsLocales.filter((e) => !refections.some((r) => r.id === e.id))
      .map((e) => ({ r: avecMajs({ ...(e.ligne as unknown as Refection), id: e.id }, majsDe('refections', e.id)), local: e, majs: majsDe('refections', e.id) })),
  ];

  const lignesRep = blocs.map((b) => b.etat.ligne as unknown as Reparation);
  const derniere = [...lignesRep].sort((a, b) => (a.realisee_le < b.realisee_le ? 1 : -1))[0] ?? null;
  const verrou = fuite.verrouillee_le;
  const verrouillee = !!verrou && !bureau;
  const peutReparer = peut('interventions', 'creer');
  // R1 : la réfection relève de son propre droit (rôle Réfection), plus de « interventions ».
  const peutRefectionner = peut('refections', 'creer');
  const peutPhoto = peut('photos', 'creer');
  const modifiable = (type: string, e: { validee_le?: string | null; cree_le?: string | null; auteurs?: (string | null | undefined)[] }) =>
    peutModifierEtape(e, { type, peut, verrouilleeLe: verrou });
  const contexte: ContexteSaisie = {
    fuiteId: id, libelle, derniere, fuite: { materiau: fuite.materiau, diametre_mm: fuite.diametre_mm },
    fouilles: lignesRep, refections: blocsRefection.map(({ r }) => ({ id: r.id, longueur_m: r.longueur_m, largeur_m: r.largeur_m, resultat: r.resultat })),
  };
  const libelleReference = tx(marche?.libelle_reference || 'Référence client');

  const ajouterPhoto = async (type: TypePhoto, lien: { reparation_id?: string; refection_id?: string } = {}) => {
    if (!marche) return;
    setPhotoEnCours(true);
    try {
      const r = await prendrePhoto(type, true);
      if (typeof r === 'string') Alert.alert(t('Photo'), r);
      else if (r) {
        await ajouterEnvoi({ type: 'photos', id: Crypto.randomUUID(), marche_id: marche.id, fuite_id: id, fuite_libelle: libelle, photos: [r], ...lien });
        void synchroniser().catch(() => undefined);
      }
    } catch (e) {
      Alert.alert(t('Photo'), t('Photo impossible : {erreur}', { erreur: String((e as Error).message ?? e) }));
    } finally {
      setPhotoEnCours(false);
    }
  };

  // Validation par le responsable, depuis la fiche (avec réseau) ; sinon l'écran « À valider ».
  const valider = (etape: Etape, eid: string, nbPhotos: number) => {
    const go = async () => {
      setValidation(eid);
      const { error } = await supabase.rpc('valider_etapes', { p_elements: [{ etape, id: eid }] });
      setValidation('');
      if (error) Alert.alert(t('Validation'), messageClair(error));
      else void charger();
    };
    if (nbPhotos > 0) return void go();
    Alert.alert(t('Aucune photo'), t('Cette étape n\'a aucune photo. Valider quand même ?'), [
      { text: t('Annuler'), style: 'cancel' },
      { text: t('Valider sans photo'), onPress: () => void go() },
    ]);
  };

  // Photos (V3) : type changé ou photo retirée, gardés sur la tablette puis envoyés (fichier gardé dans le stockage).
  const photosVisibles = (donnees?.photos ?? []).map((p) => avecMajs(p, majsDe('photos', p.id)) as PhotoLigne & { supprime_le?: string | null })
    .filter((p) => !p.supprime_le);
  const valideeDe = (p: PhotoLigne) => (p.refection_id
    ? refections.find((r) => r.id === p.refection_id)?.validee_le
    : p.reparation_id ? reparations.find((r) => r.id === p.reparation_id)?.validee_le : fuite.validee_le);
  const typesPossibles = (p: PhotoLigne): TypePhoto[] => (p.refection_id
    ? ['refection', 'autre'] : p.reparation_id ? ['avant', 'pendant', 'apres', 'autre'] : ['detection', 'autre']);
  const changerPhoto = (champs: Record<string, unknown>, photoId: string) => {
    if (!marche) return;
    void ajouterEnvoi({
      type: 'maj', id: Crypto.randomUUID(), marche_id: marche.id, fuite_id: id, fuite_libelle: libelle, photos: [],
      table: 'photos', ligne_id: photoId, champs,
    }).then(() => synchroniser().catch(() => undefined));
  };
  const actionsPhoto = (p: PhotoLigne) => {
    const o = { valideeLe: valideeDe(p), verrouilleeLe: verrou, peut };
    const type = peutChangerPhoto(p, { ...o, action: 'modifier' });
    const retrait = peutChangerPhoto(p, { ...o, action: 'supprimer' });
    if (!type && !retrait) return undefined;
    return () => {
      const boutons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
      if (type) {
        for (const tp of typesPossibles(p).filter((x) => x !== p.type)) {
          boutons.push({ text: t('Type : {type}', { type: libelleListe('type_photo', tp, TYPES_PHOTO[tp]) }), onPress: () => changerPhoto({ type: tp }, p.id) });
        }
      }
      if (retrait) {
        boutons.push({
          text: t('Retirer la photo'), style: 'destructive',
          onPress: () => Alert.alert(t('Retirer la photo ?'), t('Elle ne sera plus affichée ; le fichier est gardé et le responsable peut la rétablir.'), [
            { text: t('Annuler'), style: 'cancel' },
            { text: t('Retirer'), style: 'destructive', onPress: () => changerPhoto({ supprime_le: new Date().toISOString() }, p.id) },
          ]),
        });
      }
      boutons.push({ text: t('Annuler'), style: 'cancel' });
      Alert.alert(t('Photo'), libelleListe('type_photo', p.type, TYPES_PHOTO[p.type]), boutons, { cancelable: true });
    };
  };
  const vignette = (p: PhotoLigne) => ({
    id: p.id, uri: urls[p.id], legende: libelleListe('type_photo', p.type, TYPES_PHOTO[p.type] ?? p.type), toucher: actionsPhoto(p),
  });
  const photosFuite = photosVisibles.filter((p) => !p.reparation_id && !p.refection_id).map(vignette);
  const photosLocales = locaux.filter((e) => e.type !== 'reparation' && e.type !== 'refection')
    .flatMap((e) => e.photos.filter(() => estFuite(e) || (e.type === 'photos' && !e.reparation_id && !e.refection_id)).map((p) => ({
      id: p.id, uri: p.fichier, legende: t('{type} (à envoyer)', { type: libelleListe('type_photo', p.type ?? 'detection', TYPES_PHOTO[p.type ?? 'detection']) }),
    })));
  const photosEtape = (lien: { reparation_id?: string; refection_id?: string }) => [
    ...photosVisibles.filter((p) => (lien.reparation_id ? p.reparation_id === lien.reparation_id && !p.refection_id : p.refection_id === lien.refection_id)).map(vignette),
    ...locaux.filter((e) => (e.type === 'photos' && (lien.reparation_id ? e.reparation_id === lien.reparation_id : e.refection_id === lien.refection_id))
      || (e.type === 'modification' && !!lien.reparation_id && e.reparation_id === lien.reparation_id)
      || (e.id === (lien.reparation_id ?? lien.refection_id) && (e.type === 'reparation' || e.type === 'refection')))
      .flatMap((e) => e.photos.map((p) => ({
        id: p.id, uri: p.fichier, legende: t('{type} (à envoyer)', { type: libelleListe('type_photo', p.type ?? 'autre', TYPES_PHOTO[p.type ?? 'autre']) }),
      }))),
  ];
  const nbPhotosFuite = photosFuite.length + photosLocales.length;

  const sigle = marche?.client_sigle?.trim();
  const resume = [
    fuite.reference_srm && t('Réf. {ref}', { ref: `${sigle ? `${sigle} ` : ''}${fuite.reference_srm}` }), fuite.secteur, fuite.adresse,
  ].filter(Boolean).join(' · ') || t('Sans référence ni adresse');
  const nature = libelleDb(parametres.natures.find((n) => n.id === fuite.nature_degradation_id));
  const conduite = [
    fuite.materiau ? libelleListe('materiau', fuite.materiau, MATERIAUX[fuite.materiau]) : null,
    fuite.diametre_mm ? t('Ø {d} mm', { d: fuite.diametre_mm }) : null,
  ].filter(Boolean).join(' · ');
  const fuiteModifiable = !!envoiFuite || modifiable('fuites', {
    validee_le: fuite.validee_le, cree_le: fuite.cree_le, auteurs: [fuite.auteur_terrain_id, fuite.saisi_par],
  });

  return (
    <View style={s.ecran}>
      <BarreApp titre={libelle} sousTitre={t('Fuites · {code}', { code: marche?.code })} retour={retour} />
      <ScrollView contentContainerStyle={[f.page, { paddingBottom: 40 + bas }]}>
        {horsLigne && <Message ton="attention" icone="wifi-off">{t('Hors ligne : dernière version connue de la fiche.')}</Message>}
        {envoiFuite && <Message ton="attention" icone="clock">{t('Cette fuite est encore sur la tablette : elle partira au retour du réseau.')}</Message>}
        {!!verrou && (
          <Message ton="attention" icone="lock">
            {t("Fuite verrouillée le {date} (lot d'attachement arrêté)", { date: dateHeure(verrou) })}
            {verrouillee ? t(' : vos ajouts restent possibles (réparation, réfection, photos) ; le reste est réservé au responsable.') : '.'}
          </Message>
        )}

        {/* En-tête du modèle « Profile » du panneau : anneau d'avancement, titre, badges, « Y aller ». */}
        <Carte style={f.profil}>
          <View style={f.identite}>
            <AnneauStatut statut={fuite.statut} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={f.titre}>{libelle}</Text>
              <Text style={s.discret}>{resume}</Text>
              <View style={[s.ligne, { gap: 8, marginTop: 8 }]}>
                <Statut statut={fuite.statut} carre />
                {fuite.alerte_non_reparee && <Alerte texte={t('Non réparée > {delai} h', { delai: marche?.delai_alerte_reparation_h ?? 48 })} carre />}
                {!envoiFuite && <EtatValidation validee={fuite.validee_le} />}
              </View>
            </View>
          </View>
          <BoutonYAller latitude={fuite.latitude} longitude={fuite.longitude} libelle={libelle} grand />
        </Carte>

        <View style={large ? f.colonnes : { gap: 14 }}>
          <Carte style={large && { flex: 5 }}>
            <TeteCarte
              titre={t('Identification')}
              action={(
                <View style={[s.ligne, { justifyContent: 'flex-end' }]}>
                  {!envoiFuite && !fuite.validee_le && peut('fuites', 'valider') && (
                    <Bouton
                      titre={t('Valider')} icone="check" occupe={validation === id}
                      onPress={() => valider('detection', id, photosFuite.length)}
                    />
                  )}
                  {fuiteModifiable && <Bouton titre={t('Modifier')} icone="pencil" onPress={() => modifierFuite(fuite)} />}
                </View>
              )}
            />
            <View style={s.grille}>
              <Info libelle={libelleReference} valeur={fuite.reference_srm} />
              <Info libelle={t('Ouvrage')} valeur={fuite.ouvrage ? libelleListe('ouvrage', fuite.ouvrage, OUVRAGES[fuite.ouvrage]) : null} />
              <Info libelle={t('Visibilité')} valeur={fuite.visibilite ? libelleListe('visibilite', fuite.visibilite, VISIBILITES[fuite.visibilite]) : null} />
              <Info libelle={t('Nature de dégradation')} valeur={nature} />
              <Info libelle={t('Secteur')} valeur={fuite.secteur ? `${fuite.secteur}${fuite.zone ? ` (${fuite.zone})` : ''}` : null} />
              <Info libelle={t('Adresse / repère')} valeur={fuite.adresse} />
              {!!conduite && <Info libelle={t('Conduite')} valeur={conduite} />}
              <Info
                libelle={t('Détectée')}
                valeur={fuite.detectee_par
                  ? t('{date} par {agent}', { date: dateHeure(fuite.date_detection), agent: fuite.detectee_par })
                  : dateHeure(fuite.date_detection)}
              />
              <Info
                libelle={t('Position')}
                valeur={fuite.latitude != null && fuite.longitude != null ? `${fuite.latitude.toFixed(6)}, ${fuite.longitude.toFixed(6)}` : null}
              />
              {!!fuite.fuite_liee_id && <Info libelle={t('Re-détection')} valeur={t('liée à une fuite déjà signalée')} />}
              {!!fuite.motif_sans_reparation && <Info libelle={t('Motif')} valeur={fuite.motif_sans_reparation} large />}
              {!!fuite.observation && <Info libelle={t('Observation')} valeur={fuite.observation} large />}
            </View>
            <EtatMajs majs={majsDe('fuites', id)} />
          </Carte>

          <Carte style={large && { flex: 4 }}>
            <TeteCarte titre={t('Photos')} compteur={nbPhotosFuite} />
            {nbPhotosFuite === 0 && <Vide texte={t('Aucune photo.')} />}
            <Vignettes photos={[...photosFuite, ...photosLocales]} />
            {photosFuite.some((p) => p.toucher) && <Text style={s.petit}>{t('Touchez une photo pour changer son type ou la retirer.')}</Text>}
            {peutPhoto && (
              <Bouton titre={t('Ajouter une photo de la fuite')} icone="camera" onPress={() => void ajouterPhoto('detection')} occupe={photoEnCours} />
            )}
          </Carte>
        </View>

        <Carte>
          <TeteCarte
            titre={t('Réparations')}
            compteur={blocs.length}
            description={t('Interventions saisies sur le terrain ou au bureau.')}
            action={peutReparer ? <Bouton titre={t('Saisir une réparation')} icone="plus" primaire onPress={() => saisir('reparation', contexte)} /> : undefined}
          />
          {blocs.length === 0 && <Vide texte={t('Aucune réparation saisie.')} />}
          {blocs.map((b) => (
            <BlocReparation
              key={b.id} b={b} parametres={parametres} occupe={photoEnCours} photos={photosEtape({ reparation_id: b.id })}
              photo={peutPhoto ? (tp) => void ajouterPhoto(tp, { reparation_id: b.id }) : undefined}
              modifier={modifiable('interventions', b)
                ? () => saisir('reparation', { ...contexte, modification: { reparationId: b.id, etat: b.etat, saisiPar: b.saisiPar } })
                : undefined}
              valider={!b.creation && !b.validee_le && peut('interventions', 'valider')
                ? () => valider('reparation', b.id, photosEtape({ reparation_id: b.id }).length) : undefined}
              enValidation={validation === b.id}
            />
          ))}
        </Carte>

        {(blocs.length > 0 || blocsRefection.length > 0 || peutRefectionner) && (
          <Carte>
            <TeteCarte
              titre={t('Réfections')}
              compteur={blocsRefection.length}
              description={t('Remise en état du revêtement après la réparation.')}
              action={peutRefectionner
                ? <Bouton titre={t('Saisir une réfection')} icone="plus" primaire onPress={() => saisir('refection', contexte)} />
                : undefined}
            />
            {blocsRefection.length === 0 && <Vide texte={t('Aucune réfection saisie.')} />}
            {blocsRefection.map(({ r, local, majs: m }) => (
              <BlocRefection
                key={r.id} r={r} parametres={parametres} local={local} majs={m} occupe={photoEnCours} photos={photosEtape({ refection_id: r.id })}
                photo={peutPhoto ? () => void ajouterPhoto('refection', { refection_id: r.id }) : undefined}
                modifier={!local && modifiable('refections', { validee_le: r.validee_le, cree_le: r.cree_le, auteurs: [r.auteur_terrain_id, r.saisi_par] })
                  ? () => saisir('refection', { ...contexte, modificationRefection: { refectionId: r.id, ligne: r as unknown as Record<string, unknown> } })
                  : undefined}
                valider={!local && !r.validee_le && peut('refections', 'valider')
                  ? () => valider('refection', r.id, photosEtape({ refection_id: r.id }).length) : undefined}
                enValidation={validation === r.id}
              />
            ))}
          </Carte>
        )}
        <Bouton titre={t('Liste des fuites')} icone="arrow-left" onPress={retour} style={{ alignSelf: 'flex-start' }} />
      </ScrollView>
    </View>
  );
}

/** Badge de validation d'une étape (V1). */
function EtatValidation({ validee }: { validee?: string | null }) {
  return validee
    ? <Badge texte={t('Validée le {date}', { date: dateHeure(validee) })} icone="circle-check" carre />
    : <Badge texte={t('À valider')} ton="orange" icone="clock" carre />;
}

function EtatEnvoi({ local }: { local?: Envoi }) {
  if (!local) return null;
  return local.erreur
    ? <Message ton="erreur">{t('Pas encore envoyée : {erreur}', { erreur: tx(local.erreur) })}</Message>
    : <Message ton="attention" icone="clock">{t('Sur la tablette, envoi au retour du réseau.')}</Message>;
}

function EtatModification({ modifs }: { modifs: { erreur: string | null }[] }) {
  if (!modifs.length) return null;
  const erreur = modifs.find((m) => m.erreur)?.erreur;
  return erreur
    ? <Message ton="erreur">{t('Modification pas encore envoyée : {erreur}', { erreur: tx(erreur) })}</Message>
    : <Message ton="attention" icone="clock">{t('Modification sur la tablette, envoi au retour du réseau.')}</Message>;
}
const EtatMajs = ({ majs }: { majs: EnvoiMaj[] }) => <EtatModification modifs={majs} />;

/** Une intervention (réparation ou réfection) : carte intérieure avec icône, titre, date et détails. */
function Bloc({ icone, titre, sousTitre, action, children }: {
  icone: NomIcone; titre: string; sousTitre: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <View style={f.bloc}>
      <View style={f.teteBloc}>
        <View style={f.iconeBloc}><Icone nom={icone} taille={18} couleur={COULEURS.discret} /></View>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, gap: 2 }}>
          <Text style={s.texteFort}>{titre}</Text>
          <Text style={s.discret}>{sousTitre}</Text>
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

function Actions({ modifier, valider, enValidation, libelleModifier }: {
  modifier?: () => void; valider?: () => void; enValidation: boolean; libelleModifier: string;
}) {
  if (!modifier && !valider) return null;
  return (
    <View style={[s.ligne, { justifyContent: 'flex-end' }]}>
      {valider && <Bouton titre={t('Valider')} icone="check" onPress={valider} occupe={enValidation} />}
      {modifier && <Bouton titre={libelleModifier} icone="pencil" onPress={modifier} />}
    </View>
  );
}

function BlocReparation({ b, parametres, photo, photos, modifier, valider, enValidation, occupe }: {
  b: BlocRep; parametres: Parametres; photo?: (t: TypePhoto) => void; photos: VignettePhoto[];
  modifier?: () => void; valider?: () => void; enValidation: boolean; occupe: boolean;
}) {
  const r = b.etat.ligne as unknown as Reparation;
  const equipe = parametres.equipes.find((e) => e.id === r.equipe_id)?.libelle;
  const motif = libelleDb(parametres.motifs.find((m) => m.id === r.motif_id));
  const nature = libelleDb(parametres.natures.find((n) => n.id === r.nature_revetement_id));
  const travaux = ([
    ['tuyau_repare', 'Tuyau / conduite réparé(e)'], ['robinet_pec_change', 'Robinet PEC changé'], ['collier_pec_change', 'Collier PEC changé'],
    ['bouche_a_cle_mise_a_niveau', 'Bouche à clé mise à niveau'], ['element_remplace', 'Élément de conduite remplacé'],
  ] as const).filter(([k]) => r[k]).map(([k, fr]) => libelleListe('travaux_reparation', k, fr));
  const pieces = b.etat.pieces.map((p) => `${nombre(p.quantite)} × ${p.designation}`);
  const ouvriers = b.etat.ouvriers.map((oid) => parametres.ouvriers.find((o) => o.id === oid)?.nom_complet ?? '?');
  const fouille = r.fouille_longueur_m != null || r.fouille_largeur_m != null || r.fouille_profondeur_m != null;
  return (
    <Bloc
      icone="wrench"
      titre={libelleListe('resultat_reparation', r.resultat, RESULTATS_REPARATION[r.resultat])}
      sousTitre={`${dateHeure(r.realisee_le)}${equipe ? ` · ${equipe}` : ''}`}
      action={<Actions modifier={modifier} valider={valider} enValidation={enValidation} libelleModifier={t('Modifier la réparation')} />}
    >
      {!b.creation && <EtatValidation validee={b.validee_le} />}
      <View style={s.grille}>
        {!!motif && <Info libelle={t('Motif')} valeur={motif} />}
        <Info libelle={t('Ouvrage')} valeur={r.ouvrage ? libelleListe('ouvrage', r.ouvrage, OUVRAGES[r.ouvrage]) : null} />
        <Info
          libelle={t('Matériau')}
          valeur={[
            r.materiau ? libelleListe('materiau', r.materiau, MATERIAUX[r.materiau]) : null, r.diametre_mm ? t('Ø {d} mm', { d: r.diametre_mm }) : null,
          ].filter(Boolean).join(' · ')}
        />
        {travaux.length > 0 && <Info libelle={t('Travaux')} valeur={`${enumerer(travaux)}${r.longueur_pe_m ? t(' · conduite posée {n} m', { n: nombre(r.longueur_pe_m) }) : ''}`} />}
        {fouille && (
          <Info
            libelle={t('Fouille')}
            valeur={t('{l} × {la} × {p} m', { l: nombre(r.fouille_longueur_m), la: nombre(r.fouille_largeur_m), p: nombre(r.fouille_profondeur_m) })}
          />
        )}
        {!!r.emplacement && <Info libelle={t('Emplacement')} valeur={libelleListe('emplacement', r.emplacement, EMPLACEMENTS[r.emplacement])} />}
        {!!nature && <Info libelle={t('Revêtement à refaire')} valeur={nature} />}
        {!!r.representant_srm && <Info libelle={t('Représentant présent')} valeur={r.representant_srm} />}
        {pieces.length > 0 && <Info libelle={t('Pièces')} valeur={pieces.join(' ; ')} large />}
        {ouvriers.length > 0 && <Info libelle={t('Ouvriers')} valeur={ouvriers.join(', ')} large />}
        {!!r.observation && <Info libelle={t('Observation')} valeur={r.observation} large />}
      </View>
      <Vignettes photos={photos} />
      <EtatEnvoi local={b.creation} />
      <EtatModification modifs={b.modifs} />
      {photo && (
        <View style={{ gap: 8 }}>
          <Text style={s.petit}>{t('Ajouter une photo :')}</Text>
          <View style={s.ligne}>
            {(['avant', 'pendant', 'apres'] as const).map((tp) => (
              <Bouton
                key={tp} titre={libelleListe('type_photo', tp, TYPES_PHOTO[tp])} icone="camera" onPress={() => photo(tp)} desactive={occupe}
                style={{ flexGrow: 1, flexBasis: 130 }}
              />
            ))}
          </View>
        </View>
      )}
    </Bloc>
  );
}

function BlocRefection({ r, parametres, local, majs, photo, photos, modifier, valider, enValidation, occupe }: {
  r: Refection; parametres: Parametres; local?: EnvoiRefection; majs: EnvoiMaj[]; photo?: () => void;
  photos: VignettePhoto[];
  modifier?: () => void; valider?: () => void; enValidation: boolean; occupe: boolean;
}) {
  const nature = libelleDb(parametres.natures.find((n) => n.id === r.nature_id));
  const motif = libelleDb(parametres.motifs.find((m) => m.id === r.motif_id));
  const dimensions = r.longueur_m != null || r.largeur_m != null
    ? t('{l} × {la} m', { l: nombre(r.longueur_m), la: nombre(r.largeur_m) })
    : local ? t('dimensions de la fouille') : null;
  return (
    <Bloc
      icone="paint-roller" titre={r.resultat === 'faite' ? t('Réfection faite') : t('Clôturée sans réfection')} sousTitre={dateHeure(r.realisee_le)}
      action={<Actions modifier={modifier} valider={valider} enValidation={enValidation} libelleModifier={t('Modifier la réfection')} />}
    >
      {!local && <EtatValidation validee={r.validee_le} />}
      <View style={s.grille}>
        {r.resultat === 'faite' ? (
          <>
            <Info libelle={t('Nature')} valeur={nature || (local ? t('Revêtement prévu à la réparation') : null)} />
            <Info libelle={t('Dimensions')} valeur={dimensions} />
          </>
        ) : <Info libelle={t('Motif')} valeur={motif} />}
        {!!r.observation && <Info libelle={t('Observation')} valeur={r.observation} large />}
      </View>
      <Vignettes photos={photos} />
      <EtatEnvoi local={local} />
      <EtatMajs majs={majs} />
      {photo && (
        <Bouton titre={t('Ajouter une photo de réfection')} icone="camera" onPress={photo} desactive={occupe} style={{ alignSelf: 'flex-start' }} />
      )}
    </Bloc>
  );
}

const f = StyleSheet.create({
  page: { padding: 20, gap: 14, paddingBottom: 40 },
  profil: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  identite: { flexDirection: 'row', alignItems: 'center', gap: 18, flexGrow: 1, flexShrink: 1, flexBasis: 360 },
  titre: { fontFamily: POLICE, fontSize: 26, lineHeight: 32, fontWeight: '600', color: COULEURS.texte, letterSpacing: -0.4 },
  colonnes: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  bloc: { borderWidth: 1, borderColor: COULEURS.bord, borderRadius: 12, padding: 14, gap: 12 },
  teteBloc: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  iconeBloc: {
    width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: COULEURS.bord,
    alignItems: 'center', justifyContent: 'center',
  },
});

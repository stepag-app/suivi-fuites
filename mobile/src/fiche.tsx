// Fiche d'une fuite : informations, statut, photos, réparations et réfections (serveur + saisies
// gardées sur la tablette). Jamais de prix ni de quantités du bordereau.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { chargerServeur, cleFiche, fuiteLocale, type Donnees } from './fiche-donnees';
import {
  ajouterEnvoi, estFuite, fuiteDe, lireAttente, surChangement, synchroniser,
  type Envoi, type EnvoiModification, type EnvoiRefection, type EnvoiReparation,
} from './file-attente';
import { appliquer, type EtatReparation } from './modification';
import { useParametres, type Parametres } from './parametres';
import { prendrePhoto } from './photos';
import { useSession } from './session';
import { supabase } from './supabase';
import {
  EMPLACEMENTS, MATERIAUX, OUVRAGES, RESULTATS_REPARATION, TYPES_PHOTO,
  type FicheFuite, type Refection, type Reparation, type TypePhoto,
} from './types';
import { Icone, type NomIcone } from './icones';
import {
  Alerte, AnneauStatut, BarreApp, Bouton, BoutonYAller, Carte, COULEURS, Info, LARGEUR_LARGE, Message, POLICE, s, Statut,
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
  /** Modification d'une réparation déjà saisie : état de départ et compte de saisie de chaque pièce envoyée. */
  modification?: { reparationId: string; etat: EtatReparation; saisiPar: Record<string, string | null> };
}

export const libelleFuite = (f: Pick<FicheFuite, 'numero' | 'reference_srm'>) =>
  f.numero != null ? `Fuite N° ${f.numero}` : `Fuite à envoyer${f.reference_srm ? ` (${f.reference_srm})` : ''}`;

/** Réparation à afficher (serveur ou tablette), modifications encore sur la tablette appliquées. */
interface BlocRep {
  id: string; etat: EtatReparation; creation?: EnvoiReparation; modifs: EnvoiModification[];
  /** Auteur terrain et compte de saisie (portée « siennes ») ; absent : saisie faite sur cette tablette. */
  auteurs?: (string | null | undefined)[];
  saisiPar: Record<string, string | null>;
}

export function Fiche({ id, retour, saisir }: {
  id: string; retour: () => void; saisir: (type: 'reparation' | 'refection', contexte: ContexteSaisie) => void;
}) {
  const { marche, peut } = useSession();
  const parametres = useParametres(marche?.id);
  const large = useWindowDimensions().width >= LARGEUR_LARGE;
  const bas = useBas();
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [locaux, setLocaux] = useState<Envoi[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [horsLigne, setHorsLigne] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [photoEnCours, setPhotoEnCours] = useState(false);

  const charger = useCallback(async () => {
    const attente = (await lireAttente()).filter((e) => fuiteDe(e) === id);
    setLocaux(attente);
    const serveur = await chargerServeur(id).catch(() => null);
    if (serveur) {
      setHorsLigne(false);
      setDonnees(serveur);
      AsyncStorage.setItem(cleFiche(id), JSON.stringify(serveur)).catch(() => undefined);
      if (serveur.photos.length) {
        const signees = await supabase.storage.from('photos').createSignedUrls(serveur.photos.map((p) => p.chemin), 3600);
        const table: Record<string, string> = {};
        for (const p of serveur.photos) {
          const u = signees.data?.find((x) => x.path === p.chemin)?.signedUrl;
          if (u) table[p.id] = u;
        }
        setUrls(table);
      }
    } else {
      setHorsLigne(true);
      const copie = await AsyncStorage.getItem(cleFiche(id)).catch(() => null);
      if (copie) setDonnees(JSON.parse(copie) as Donnees);
    }
    setChargement(false);
  }, [id]);

  useEffect(() => {
    charger();
    return surChangement(() => void charger());
  }, [charger]);

  const envoiFuite = locaux.find((e) => estFuite(e) && e.id === id);
  const fuite = donnees?.fuite ?? (envoiFuite ? fuiteLocale(envoiFuite) : null);

  if (chargement) {
    return (
      <View style={s.ecran}>
        <BarreApp titre="Fiche de la fuite" retour={retour} />
        <View style={[s.contenu, { flex: 1, alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={COULEURS.principal} />
          <Text style={s.discret}>Chargement…</Text>
        </View>
      </View>
    );
  }
  if (!fuite) {
    return (
      <View style={s.ecran}>
        <BarreApp titre="Fiche de la fuite" retour={retour} />
        <View style={s.defile}>
          <Message ton="erreur" icone={horsLigne ? 'wifi-off' : undefined}>
            {horsLigne ? 'Fiche jamais ouverte sur cette tablette : elle sera disponible au retour du réseau.' : 'Fuite introuvable ou accès refusé.'}
          </Message>
          <Bouton titre="Liste des fuites" icone="arrow-left" onPress={retour} style={{ alignSelf: 'flex-start' }} />
        </View>
      </View>
    );
  }

  const libelle = libelleFuite(fuite);
  const designation = (pieceId: number | null, libre: string | null) =>
    parametres.pieces.find((p) => p.id === pieceId)?.designation ?? libre ?? 'Pièce';
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
  const blocsRefection = [
    ...refections.map((r) => ({ r, local: refectionsLocales.find((e) => e.id === r.id) })),
    ...refectionsLocales.filter((e) => !refections.some((r) => r.id === e.id))
      .map((e) => ({ r: { ...(e.ligne as unknown as Refection), id: e.id }, local: e })),
  ];

  const derniere = blocs
    .map((b) => b.etat.ligne as unknown as Reparation)
    .sort((a, b) => (a.realisee_le < b.realisee_le ? 1 : -1))[0] ?? null;
  const verrouillee = !!fuite.verrouillee_le && !peut('interventions', 'valider');
  const peutSaisir = peut('interventions', 'creer') && !verrouillee;
  const peutPhoto = peut('photos', 'creer') && !(fuite.verrouillee_le && !peut('photos', 'valider'));
  const peutModifier = (b: BlocRep) => !verrouillee && peut('interventions', 'modifier', b.auteurs);
  const contexte: ContexteSaisie = { fuiteId: id, libelle, derniere };
  const libelleReference = marche?.libelle_reference || 'Référence client';

  const ajouterPhoto = async (type: TypePhoto, lien: { reparation_id?: string; refection_id?: string } = {}) => {
    if (!marche) return;
    setPhotoEnCours(true);
    try {
      const r = await prendrePhoto(type, true);
      if (typeof r === 'string') Alert.alert('Photo', r);
      else if (r) {
        await ajouterEnvoi({ type: 'photos', id: Crypto.randomUUID(), marche_id: marche.id, fuite_id: id, fuite_libelle: libelle, photos: [r], ...lien });
        void synchroniser().catch(() => undefined);
      }
    } catch (e) {
      Alert.alert('Photo', `Photo impossible : ${String((e as Error).message ?? e)}`);
    } finally {
      setPhotoEnCours(false);
    }
  };

  const photosServeur = (donnees?.photos ?? []).map((p) => ({ id: p.id, uri: urls[p.id], legende: TYPES_PHOTO[p.type] ?? p.type }));
  const photosLocales = locaux.flatMap((e) => e.photos.map((p) => ({
    id: p.id, uri: p.fichier, legende: `${TYPES_PHOTO[p.type ?? 'detection']} (à envoyer)`,
  })));
  const nbPhotos = photosServeur.length + photosLocales.length;

  const sigle = marche?.client_sigle?.trim();
  const resume = [
    fuite.reference_srm && `Réf. ${sigle ? `${sigle} ` : ''}${fuite.reference_srm}`, fuite.secteur, fuite.adresse,
  ].filter(Boolean).join(' · ') || 'Sans référence ni adresse';

  return (
    <View style={s.ecran}>
      <BarreApp titre={libelle} sousTitre={`Fuites · ${marche?.code ?? ''}`} retour={retour} />
      <ScrollView contentContainerStyle={[f.page, { paddingBottom: 40 + bas }]}>
        {horsLigne && <Message ton="attention" icone="wifi-off">Hors ligne : dernière version connue de la fiche.</Message>}
        {envoiFuite && <Message ton="attention" icone="clock">Cette fuite est encore sur la tablette : elle partira au retour du réseau.</Message>}
        {!!fuite.verrouillee_le && (
          <Message ton="attention" icone="lock">
            Fuite verrouillée le {dateHeure(fuite.verrouillee_le)} (lot d&apos;attachement arrêté)
            {verrouillee ? ' : saisie et modification réservées au responsable.' : '.'}
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
                {fuite.alerte_non_reparee && <Alerte texte={`Non réparée > ${marche?.delai_alerte_reparation_h ?? 48} h`} carre />}
              </View>
            </View>
          </View>
          <BoutonYAller latitude={fuite.latitude} longitude={fuite.longitude} libelle={libelle} grand />
        </Carte>

        <View style={large ? f.colonnes : { gap: 14 }}>
          <Carte style={large && { flex: 5 }}>
            <TeteCarte titre="Identification" />
            <View style={s.grille}>
              <Info libelle={libelleReference} valeur={fuite.reference_srm} />
              <Info libelle="Ouvrage" valeur={fuite.ouvrage ? OUVRAGES[fuite.ouvrage] ?? fuite.ouvrage : null} />
              <Info libelle="Secteur" valeur={fuite.secteur ? `${fuite.secteur}${fuite.zone ? ` (${fuite.zone})` : ''}` : null} />
              <Info libelle="Adresse / repère" valeur={fuite.adresse} />
              <Info libelle="Détectée" valeur={`${dateHeure(fuite.date_detection)}${fuite.detectee_par ? ` par ${fuite.detectee_par}` : ''}`} />
              <Info
                libelle="Position"
                valeur={fuite.latitude != null && fuite.longitude != null ? `${fuite.latitude.toFixed(6)}, ${fuite.longitude.toFixed(6)}` : null}
              />
              {!!fuite.fuite_liee_id && <Info libelle="Re-détection" valeur="liée à une fuite déjà signalée" />}
              {!!fuite.motif_sans_reparation && <Info libelle="Motif" valeur={fuite.motif_sans_reparation} large />}
              {!!fuite.observation && <Info libelle="Observation" valeur={fuite.observation} large />}
            </View>
          </Carte>

          <Carte style={large && { flex: 4 }}>
            <TeteCarte titre="Photos" compteur={nbPhotos} />
            {nbPhotos === 0 && <Vide texte="Aucune photo." />}
            <Vignettes photos={[...photosServeur, ...photosLocales]} />
            {peutPhoto && (
              <Bouton titre="Ajouter une photo de la fuite" icone="camera" onPress={() => void ajouterPhoto('detection')} occupe={photoEnCours} />
            )}
          </Carte>
        </View>

        <Carte>
          <TeteCarte
            titre="Réparations"
            compteur={blocs.length}
            description="Interventions saisies sur le terrain ou au bureau."
            action={peutSaisir ? <Bouton titre="Saisir une réparation" icone="plus" primaire onPress={() => saisir('reparation', contexte)} /> : undefined}
          />
          {blocs.length === 0 && <Vide texte="Aucune réparation saisie." />}
          {blocs.map((b) => (
            <BlocReparation
              key={b.id} b={b} parametres={parametres} occupe={photoEnCours}
              photo={peutPhoto ? (t) => void ajouterPhoto(t, { reparation_id: b.id }) : undefined}
              modifier={peutModifier(b)
                ? () => saisir('reparation', { ...contexte, modification: { reparationId: b.id, etat: b.etat, saisiPar: b.saisiPar } })
                : undefined}
            />
          ))}
        </Carte>

        {(blocs.length > 0 || blocsRefection.length > 0) && (
          <Carte>
            <TeteCarte
              titre="Réfections"
              compteur={blocsRefection.length}
              description="Remise en état du revêtement après la réparation."
              action={peutSaisir && blocs.length > 0
                ? <Bouton titre="Saisir une réfection" icone="plus" primaire onPress={() => saisir('refection', contexte)} />
                : undefined}
            />
            {blocsRefection.length === 0 && <Vide texte="Aucune réfection saisie." />}
            {blocsRefection.map(({ r, local }) => (
              <BlocRefection
                key={r.id} r={r} parametres={parametres} local={local} occupe={photoEnCours}
                photo={peutPhoto ? () => void ajouterPhoto('refection', { refection_id: r.id }) : undefined}
              />
            ))}
          </Carte>
        )}
        <Bouton titre="Liste des fuites" icone="arrow-left" onPress={retour} style={{ alignSelf: 'flex-start' }} />
      </ScrollView>
    </View>
  );
}

function EtatEnvoi({ local }: { local?: Envoi }) {
  if (!local) return null;
  return local.erreur
    ? <Message ton="erreur">Pas encore envoyée : {local.erreur}</Message>
    : <Message ton="attention" icone="clock">Sur la tablette, envoi au retour du réseau.</Message>;
}

function EtatModification({ modifs }: { modifs: EnvoiModification[] }) {
  if (!modifs.length) return null;
  const erreur = modifs.find((m) => m.erreur)?.erreur;
  return erreur
    ? <Message ton="erreur">Modification pas encore envoyée : {erreur}</Message>
    : <Message ton="attention" icone="clock">Modification sur la tablette, envoi au retour du réseau.</Message>;
}

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

function BlocReparation({ b, parametres, photo, modifier, occupe }: {
  b: BlocRep; parametres: Parametres; photo?: (t: TypePhoto) => void; modifier?: () => void; occupe: boolean;
}) {
  const r = b.etat.ligne as unknown as Reparation;
  const equipe = parametres.equipes.find((e) => e.id === r.equipe_id)?.libelle;
  const motif = parametres.motifs.find((m) => m.id === r.motif_id)?.libelle_fr;
  const nature = parametres.natures.find((n) => n.id === r.nature_revetement_id)?.libelle_fr;
  const travaux = [
    r.tuyau_repare && 'tuyau réparé', r.robinet_pec_change && 'robinet PEC changé', r.collier_pec_change && 'collier PEC changé',
    r.bouche_a_cle_mise_a_niveau && 'bouche à clé mise à niveau', r.element_remplace && 'élément remplacé',
  ].filter(Boolean).join(', ');
  const pieces = b.etat.pieces.map((p) => `${nombre(p.quantite)} × ${p.designation}`);
  const ouvriers = b.etat.ouvriers.map((oid) => parametres.ouvriers.find((o) => o.id === oid)?.nom_complet ?? '?');
  const fouille = r.fouille_longueur_m != null || r.fouille_largeur_m != null || r.fouille_profondeur_m != null;
  return (
    <Bloc
      icone="wrench"
      titre={RESULTATS_REPARATION[r.resultat]}
      sousTitre={`${dateHeure(r.realisee_le)}${equipe ? ` · ${equipe}` : ''}`}
      action={modifier && <Bouton titre="Modifier la réparation" icone="pencil" onPress={modifier} />}
    >
      <View style={s.grille}>
        {!!motif && <Info libelle="Motif" valeur={motif} />}
        <Info libelle="Ouvrage" valeur={r.ouvrage ? OUVRAGES[r.ouvrage] : null} />
        <Info
          libelle="Matériau"
          valeur={[r.materiau ? MATERIAUX[r.materiau] : null, r.diametre_mm ? `Ø ${r.diametre_mm} mm` : null].filter(Boolean).join(' · ')}
        />
        {!!travaux && <Info libelle="Travaux" valeur={`${travaux}${r.longueur_pe_m ? ` · PE ${nombre(r.longueur_pe_m)} m` : ''}`} />}
        {fouille && (
          <Info libelle="Fouille" valeur={`${nombre(r.fouille_longueur_m)} × ${nombre(r.fouille_largeur_m)} × ${nombre(r.fouille_profondeur_m)} m`} />
        )}
        {!!r.emplacement && <Info libelle="Emplacement" valeur={EMPLACEMENTS[r.emplacement] ?? r.emplacement} />}
        {!!nature && <Info libelle="Revêtement à refaire" valeur={nature} />}
        {!!r.representant_srm && <Info libelle="Représentant présent" valeur={r.representant_srm} />}
        {pieces.length > 0 && <Info libelle="Pièces" valeur={pieces.join(' ; ')} large />}
        {ouvriers.length > 0 && <Info libelle="Ouvriers" valeur={ouvriers.join(', ')} large />}
        {!!r.observation && <Info libelle="Observation" valeur={r.observation} large />}
      </View>
      <EtatEnvoi local={b.creation} />
      <EtatModification modifs={b.modifs} />
      {photo && (
        <View style={{ gap: 8 }}>
          <Text style={s.petit}>Ajouter une photo :</Text>
          <View style={s.ligne}>
            {(['avant', 'pendant', 'apres'] as const).map((t) => (
              <Bouton key={t} titre={TYPES_PHOTO[t]} icone="camera" onPress={() => photo(t)} desactive={occupe} style={{ flexGrow: 1, flexBasis: 130 }} />
            ))}
          </View>
        </View>
      )}
    </Bloc>
  );
}

function BlocRefection({ r, parametres, local, photo, occupe }: {
  r: Refection; parametres: Parametres; local?: EnvoiRefection; photo?: () => void; occupe: boolean;
}) {
  const nature = parametres.natures.find((n) => n.id === r.nature_id)?.libelle_fr;
  const motif = parametres.motifs.find((m) => m.id === r.motif_id)?.libelle_fr;
  const dimensions = r.longueur_m != null || r.largeur_m != null
    ? `${nombre(r.longueur_m)} × ${nombre(r.largeur_m)} m`
    : local ? 'dimensions de la fouille' : null;
  return (
    <Bloc icone="paint-roller" titre={r.resultat === 'faite' ? 'Réfection faite' : 'Clôturée sans réfection'} sousTitre={dateHeure(r.realisee_le)}>
      <View style={s.grille}>
        {r.resultat === 'faite' ? (
          <>
            <Info libelle="Nature" valeur={nature ?? (local ? 'Revêtement prévu à la réparation' : null)} />
            <Info libelle="Dimensions" valeur={dimensions} />
          </>
        ) : <Info libelle="Motif" valeur={motif} />}
        {!!r.observation && <Info libelle="Observation" valeur={r.observation} large />}
      </View>
      <EtatEnvoi local={local} />
      {photo && (
        <Bouton titre="Ajouter une photo de réfection" icone="camera" onPress={photo} desactive={occupe} style={{ alignSelf: 'flex-start' }} />
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

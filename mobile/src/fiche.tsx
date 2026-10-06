// Fiche d'une fuite : informations, statut, photos, réparations et réfections (serveur + saisies
// gardées sur la tablette). Jamais de prix ni de quantités du bordereau.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { chargerServeur, cleFiche, fuiteLocale, type Donnees } from './fiche-donnees';
import {
  ajouterEnvoi, estFuite, fuiteDe, lireAttente, surChangement, synchroniser,
  type Envoi, type EnvoiModification, type EnvoiRefection, type EnvoiReparation,
} from './file-attente';
import { appliquer, type EtatReparation } from './modification';
import { useParametres, type Parametres } from './parametres';
import { prendrePhoto, urlsPhotos } from './photos';
import { useSession } from './session';
import { supabase } from './supabase';
import {
  EMPLACEMENTS, MATERIAUX, OUVRAGES, RESULTATS_REPARATION, TYPES_PHOTO,
  type FicheFuite, type Refection, type Reparation, type TypePhoto,
} from './types';
import { Alerte, BarreApp, Bouton, BoutonYAller, Carte, s, Statut, Vignettes } from './ui';

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
      if (serveur.photos.length) setUrls(await urlsPhotos(serveur.photos).catch(() => ({})));
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
        <View style={s.contenu}><Text style={s.discret}>Chargement…</Text></View>
      </View>
    );
  }
  if (!fuite) {
    return (
      <View style={s.ecran}>
        <BarreApp titre="Fiche de la fuite" retour={retour} />
        <View style={s.contenu}>
          <Text style={s.erreur}>
            {horsLigne ? 'Fiche jamais ouverte sur cette tablette : elle sera disponible au retour du réseau.' : 'Fuite introuvable ou accès refusé.'}
          </Text>
          <Bouton titre="← Liste des fuites" onPress={retour} />
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

  return (
    <View style={s.ecran}>
      <BarreApp titre={libelle} sousTitre={marche?.code} retour={retour} />
      <ScrollView contentContainerStyle={s.defile}>
        {horsLigne && <Text style={s.attention}>Hors ligne : dernière version connue de la fiche.</Text>}
        {envoiFuite && <Text style={s.attention}>Cette fuite est encore sur la tablette : elle partira au retour du réseau.</Text>}
        {!!fuite.verrouillee_le && (
          <Text style={s.attention}>
            Fuite verrouillée le {dateHeure(fuite.verrouillee_le)} (lot d&apos;attachement arrêté)
            {verrouillee ? ' : saisie et modification réservées au responsable.' : '.'}
          </Text>
        )}

        <Carte>
          <View style={[s.ligne, { justifyContent: 'space-between', alignItems: 'center' }]}>
            <Statut statut={fuite.statut} gros />
            {fuite.alerte_non_reparee && <Alerte texte={`Non réparée > ${marche?.delai_alerte_reparation_h ?? 48} h`} />}
          </View>
          <Info libelle={libelleReference} valeur={fuite.reference_srm} />
          <Info libelle="Secteur" valeur={fuite.secteur ? `${fuite.secteur}${fuite.zone ? ` (${fuite.zone})` : ''}` : null} />
          <Info libelle="Adresse / repère" valeur={fuite.adresse} />
          <Info libelle="Ouvrage" valeur={fuite.ouvrage ? OUVRAGES[fuite.ouvrage] ?? fuite.ouvrage : null} />
          <Info libelle="Détectée" valeur={`${dateHeure(fuite.date_detection)}${fuite.detectee_par ? ` par ${fuite.detectee_par}` : ''}`} />
          {fuite.latitude != null && fuite.longitude != null && (
            <Info libelle="Position" valeur={`${fuite.latitude.toFixed(6)}, ${fuite.longitude.toFixed(6)}`} />
          )}
          {!!fuite.fuite_liee_id && <Info libelle="Re-détection" valeur="liée à une fuite déjà signalée" />}
          {!!fuite.motif_sans_reparation && <Info libelle="Motif" valeur={fuite.motif_sans_reparation} />}
          {!!fuite.observation && <Info libelle="Observation" valeur={fuite.observation} />}
          <BoutonYAller latitude={fuite.latitude} longitude={fuite.longitude} libelle={libelle} />
        </Carte>

        <Carte>
          <Text style={s.sousTitre}>Photos ({nbPhotos})</Text>
          {nbPhotos === 0 && <Text style={s.discret}>Aucune photo.</Text>}
          <Vignettes photos={[...photosServeur, ...photosLocales]} />
          {peutPhoto && (
            <Bouton titre="📷 Ajouter une photo de la fuite" onPress={() => void ajouterPhoto('detection')} occupe={photoEnCours} />
          )}
        </Carte>

        <Carte>
          <Text style={s.sousTitre}>Réparations</Text>
          {blocs.length === 0 && <Text style={s.discret}>Aucune réparation saisie.</Text>}
          {blocs.map((b) => (
            <BlocReparation
              key={b.id} b={b} parametres={parametres} occupe={photoEnCours}
              photo={peutPhoto ? (t) => void ajouterPhoto(t, { reparation_id: b.id }) : undefined}
              modifier={peutModifier(b)
                ? () => saisir('reparation', { ...contexte, modification: { reparationId: b.id, etat: b.etat, saisiPar: b.saisiPar } })
                : undefined}
            />
          ))}
          {peutSaisir && <Bouton titre="+ Saisir une réparation" primaire onPress={() => saisir('reparation', contexte)} />}
        </Carte>

        {(blocs.length > 0 || blocsRefection.length > 0) && (
          <Carte>
            <Text style={s.sousTitre}>Réfections</Text>
            {blocsRefection.length === 0 && <Text style={s.discret}>Aucune réfection saisie.</Text>}
            {blocsRefection.map(({ r, local }) => (
              <BlocRefection
                key={r.id} r={r} parametres={parametres} local={local} occupe={photoEnCours}
                photo={peutPhoto ? () => void ajouterPhoto('refection', { refection_id: r.id }) : undefined}
              />
            ))}
            {peutSaisir && blocs.length > 0 && (
              <Bouton titre="+ Saisir une réfection" primaire onPress={() => saisir('refection', contexte)} />
            )}
          </Carte>
        )}
        <Bouton titre="← Liste des fuites" onPress={retour} />
      </ScrollView>
    </View>
  );
}

function Info({ libelle, valeur }: { libelle: string; valeur: string | null | undefined }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12 }}>
      <Text style={[s.discret, { width: 160, fontSize: 16 }]}>{libelle}</Text>
      <Text style={[s.texte, { flex: 1, minWidth: 180 }]}>{valeur || '—'}</Text>
    </View>
  );
}

function EtatEnvoi({ local }: { local?: Envoi }) {
  if (!local) return null;
  return local.erreur
    ? <Text style={s.erreur}>Pas encore envoyée : {local.erreur}</Text>
    : <Text style={s.attention}>Sur la tablette, envoi au retour du réseau.</Text>;
}

function EtatModification({ modifs }: { modifs: EnvoiModification[] }) {
  if (!modifs.length) return null;
  const erreur = modifs.find((m) => m.erreur)?.erreur;
  return erreur
    ? <Text style={s.erreur}>Modification pas encore envoyée : {erreur}</Text>
    : <Text style={s.attention}>Modification sur la tablette, envoi au retour du réseau.</Text>;
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
  return (
    <View style={s.separateur}>
      <Text style={s.etiquette}>{RESULTATS_REPARATION[r.resultat]} · {dateHeure(r.realisee_le)}{equipe ? ` · ${equipe}` : ''}</Text>
      {!!motif && <Text style={s.texte}>Motif : {motif}</Text>}
      <Text style={s.discret}>
        {[r.ouvrage ? OUVRAGES[r.ouvrage] : null, r.materiau ? MATERIAUX[r.materiau] : null, r.diametre_mm ? `Ø ${r.diametre_mm} mm` : null]
          .filter(Boolean).join(' · ') || '—'}
      </Text>
      {!!travaux && <Text style={s.texte}>{travaux}{r.longueur_pe_m ? ` · PE ${nombre(r.longueur_pe_m)} m` : ''}</Text>}
      {(r.fouille_longueur_m != null || r.fouille_largeur_m != null || r.fouille_profondeur_m != null) && (
        <Text style={s.texte}>
          Fouille {nombre(r.fouille_longueur_m)} × {nombre(r.fouille_largeur_m)} × {nombre(r.fouille_profondeur_m)} m
          {r.emplacement ? ` · ${EMPLACEMENTS[r.emplacement] ?? r.emplacement}` : ''}
        </Text>
      )}
      {!!nature && <Text style={s.texte}>Revêtement à refaire : {nature}</Text>}
      {!!r.representant_srm && <Text style={s.texte}>Représentant présent : {r.representant_srm}</Text>}
      {pieces.length > 0 && <Text style={s.texte}>Pièces : {pieces.join(' ; ')}</Text>}
      {ouvriers.length > 0 && <Text style={s.texte}>Ouvriers : {ouvriers.join(', ')}</Text>}
      {!!r.observation && <Text style={s.discret}>{r.observation}</Text>}
      <EtatEnvoi local={b.creation} />
      <EtatModification modifs={b.modifs} />
      {photo && (
        <>
          <Text style={s.discret}>Ajouter une photo :</Text>
          <View style={s.ligne}>
            {(['avant', 'pendant', 'apres'] as const).map((t) => (
              <View key={t} style={{ flexGrow: 1, flexBasis: 130 }}>
                <Bouton titre={`📷 ${TYPES_PHOTO[t]}`} onPress={() => photo(t)} desactive={occupe} />
              </View>
            ))}
          </View>
        </>
      )}
      {modifier && <Bouton titre="✎ Modifier la réparation" onPress={modifier} />}
    </View>
  );
}

function BlocRefection({ r, parametres, local, photo, occupe }: {
  r: Refection; parametres: Parametres; local?: EnvoiRefection; photo?: () => void; occupe: boolean;
}) {
  const nature = parametres.natures.find((n) => n.id === r.nature_id)?.libelle_fr;
  const motif = parametres.motifs.find((m) => m.id === r.motif_id)?.libelle_fr;
  return (
    <View style={s.separateur}>
      <Text style={s.etiquette}>{r.resultat === 'faite' ? 'Réfection faite' : 'Clôturée sans réfection'} · {dateHeure(r.realisee_le)}</Text>
      {r.resultat === 'faite' ? (
        <Text style={s.texte}>
          {nature ?? (local ? 'Revêtement prévu à la réparation' : '—')}
          {r.longueur_m != null || r.largeur_m != null ? ` · ${nombre(r.longueur_m)} × ${nombre(r.largeur_m)} m` : local ? ' · dimensions de la fouille' : ''}
        </Text>
      ) : <Text style={s.texte}>Motif : {motif ?? '—'}</Text>}
      {!!r.observation && <Text style={s.discret}>{r.observation}</Text>}
      <EtatEnvoi local={local} />
      {photo && <Bouton titre="📷 Ajouter une photo de réfection" onPress={photo} desactive={occupe} />}
    </View>
  );
}

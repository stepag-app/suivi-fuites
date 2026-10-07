// Fiche d'une fuite : informations, statut, photos, réparations et réfections (serveur + saisies
// gardées sur la tablette). Jamais de prix ni de quantités du bordereau.
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { chargerFiche, fuiteLocale, type Donnees } from './fiche-donnees';
import {
  ajouterEnvoi, estFuite, fuiteDe, lireAttente, surChangement, synchroniser,
  type Envoi, type EnvoiModification, type EnvoiRefection, type EnvoiReparation,
} from './file-attente';
import { enumerer, t, tx, useLangue } from './langue';
import { appliquer, type EtatReparation } from './modification';
import { useParametres, type Parametres } from './parametres';
import { prendrePhoto, urlsPhotos } from './photos';
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
  f.numero != null
    ? t('Fuite N° {numero}', { numero: f.numero })
    : f.reference_srm ? t('Fuite à envoyer ({reference})', { reference: f.reference_srm }) : t('Fuite à envoyer');

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

  // Version affichée (copie de la tablette ou serveur) : la copie n'est lue qu'à l'ouverture de la fiche.
  const affichee = useRef(false);
  const charger = useCallback(async () => {
    const attente = (await lireAttente()).filter((e) => fuiteDe(e) === id);
    setLocaux(attente);
    const serveur = await chargerFiche(id, {
      copie: !affichee.current, aRenouveler,
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
  }, [id, aRenouveler]);

  useEffect(() => {
    charger();
    return surChangement(() => void charger());
  }, [charger]);

  const envoiFuite = locaux.find((e) => estFuite(e) && e.id === id);
  const fuite = donnees?.fuite ?? (envoiFuite ? fuiteLocale(envoiFuite) : null);

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

  const photosServeur = (donnees?.photos ?? []).map((p) => ({ id: p.id, uri: urls[p.id], legende: tx(TYPES_PHOTO[p.type] ?? p.type) }));
  const photosLocales = locaux.flatMap((e) => e.photos.map((p) => ({
    id: p.id, uri: p.fichier, legende: t('{type} (à envoyer)', { type: tx(TYPES_PHOTO[p.type ?? 'detection']) }),
  })));
  const nbPhotos = photosServeur.length + photosLocales.length;

  const sigle = marche?.client_sigle?.trim();
  const resume = [
    fuite.reference_srm && t('Réf. {ref}', { ref: `${sigle ? `${sigle} ` : ''}${fuite.reference_srm}` }), fuite.secteur, fuite.adresse,
  ].filter(Boolean).join(' · ') || t('Sans référence ni adresse');

  return (
    <View style={s.ecran}>
      <BarreApp titre={libelle} sousTitre={t('Fuites · {code}', { code: marche?.code })} retour={retour} />
      <ScrollView contentContainerStyle={[f.page, { paddingBottom: 40 + bas }]}>
        {horsLigne && <Message ton="attention" icone="wifi-off">{t('Hors ligne : dernière version connue de la fiche.')}</Message>}
        {envoiFuite && <Message ton="attention" icone="clock">{t('Cette fuite est encore sur la tablette : elle partira au retour du réseau.')}</Message>}
        {!!fuite.verrouillee_le && (
          <Message ton="attention" icone="lock">
            {t("Fuite verrouillée le {date} (lot d'attachement arrêté)", { date: dateHeure(fuite.verrouillee_le) })}
            {verrouillee ? t(' : saisie et modification réservées au responsable.') : '.'}
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
              </View>
            </View>
          </View>
          <BoutonYAller latitude={fuite.latitude} longitude={fuite.longitude} libelle={libelle} grand />
        </Carte>

        <View style={large ? f.colonnes : { gap: 14 }}>
          <Carte style={large && { flex: 5 }}>
            <TeteCarte titre={t('Identification')} />
            <View style={s.grille}>
              <Info libelle={libelleReference} valeur={fuite.reference_srm} />
              <Info libelle={t('Ouvrage')} valeur={fuite.ouvrage ? tx(OUVRAGES[fuite.ouvrage] ?? fuite.ouvrage) : null} />
              <Info libelle={t('Secteur')} valeur={fuite.secteur ? `${fuite.secteur}${fuite.zone ? ` (${fuite.zone})` : ''}` : null} />
              <Info libelle={t('Adresse / repère')} valeur={fuite.adresse} />
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
          </Carte>

          <Carte style={large && { flex: 4 }}>
            <TeteCarte titre={t('Photos')} compteur={nbPhotos} />
            {nbPhotos === 0 && <Vide texte={t('Aucune photo.')} />}
            <Vignettes photos={[...photosServeur, ...photosLocales]} />
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
            action={peutSaisir ? <Bouton titre={t('Saisir une réparation')} icone="plus" primaire onPress={() => saisir('reparation', contexte)} /> : undefined}
          />
          {blocs.length === 0 && <Vide texte={t('Aucune réparation saisie.')} />}
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
              titre={t('Réfections')}
              compteur={blocsRefection.length}
              description={t('Remise en état du revêtement après la réparation.')}
              action={peutSaisir && blocs.length > 0
                ? <Bouton titre={t('Saisir une réfection')} icone="plus" primaire onPress={() => saisir('refection', contexte)} />
                : undefined}
            />
            {blocsRefection.length === 0 && <Vide texte={t('Aucune réfection saisie.')} />}
            {blocsRefection.map(({ r, local }) => (
              <BlocRefection
                key={r.id} r={r} parametres={parametres} local={local} occupe={photoEnCours}
                photo={peutPhoto ? () => void ajouterPhoto('refection', { refection_id: r.id }) : undefined}
              />
            ))}
          </Carte>
        )}
        <Bouton titre={t('Liste des fuites')} icone="arrow-left" onPress={retour} style={{ alignSelf: 'flex-start' }} />
      </ScrollView>
    </View>
  );
}

function EtatEnvoi({ local }: { local?: Envoi }) {
  if (!local) return null;
  return local.erreur
    ? <Message ton="erreur">{t('Pas encore envoyée : {erreur}', { erreur: tx(local.erreur) })}</Message>
    : <Message ton="attention" icone="clock">{t('Sur la tablette, envoi au retour du réseau.')}</Message>;
}

function EtatModification({ modifs }: { modifs: EnvoiModification[] }) {
  if (!modifs.length) return null;
  const erreur = modifs.find((m) => m.erreur)?.erreur;
  return erreur
    ? <Message ton="erreur">{t('Modification pas encore envoyée : {erreur}', { erreur: tx(erreur) })}</Message>
    : <Message ton="attention" icone="clock">{t('Modification sur la tablette, envoi au retour du réseau.')}</Message>;
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
    r.tuyau_repare && t('tuyau réparé'), r.robinet_pec_change && t('robinet PEC changé'), r.collier_pec_change && t('collier PEC changé'),
    r.bouche_a_cle_mise_a_niveau && t('bouche à clé mise à niveau'), r.element_remplace && t('élément remplacé'),
  ].filter((x): x is string => !!x);
  const pieces = b.etat.pieces.map((p) => `${nombre(p.quantite)} × ${p.designation}`);
  const ouvriers = b.etat.ouvriers.map((oid) => parametres.ouvriers.find((o) => o.id === oid)?.nom_complet ?? '?');
  const fouille = r.fouille_longueur_m != null || r.fouille_largeur_m != null || r.fouille_profondeur_m != null;
  return (
    <Bloc
      icone="wrench"
      titre={tx(RESULTATS_REPARATION[r.resultat])}
      sousTitre={`${dateHeure(r.realisee_le)}${equipe ? ` · ${equipe}` : ''}`}
      action={modifier && <Bouton titre={t('Modifier la réparation')} icone="pencil" onPress={modifier} />}
    >
      <View style={s.grille}>
        {!!motif && <Info libelle={t('Motif')} valeur={motif} />}
        <Info libelle={t('Ouvrage')} valeur={r.ouvrage ? tx(OUVRAGES[r.ouvrage] ?? r.ouvrage) : null} />
        <Info
          libelle={t('Matériau')}
          valeur={[
            r.materiau ? tx(MATERIAUX[r.materiau] ?? r.materiau) : null, r.diametre_mm ? t('Ø {d} mm', { d: r.diametre_mm }) : null,
          ].filter(Boolean).join(' · ')}
        />
        {travaux.length > 0 && <Info libelle={t('Travaux')} valeur={`${enumerer(travaux)}${r.longueur_pe_m ? t(' · PE {n} m', { n: nombre(r.longueur_pe_m) }) : ''}`} />}
        {fouille && (
          <Info
            libelle={t('Fouille')}
            valeur={t('{l} × {la} × {p} m', { l: nombre(r.fouille_longueur_m), la: nombre(r.fouille_largeur_m), p: nombre(r.fouille_profondeur_m) })}
          />
        )}
        {!!r.emplacement && <Info libelle={t('Emplacement')} valeur={tx(EMPLACEMENTS[r.emplacement] ?? r.emplacement)} />}
        {!!nature && <Info libelle={t('Revêtement à refaire')} valeur={nature} />}
        {!!r.representant_srm && <Info libelle={t('Représentant présent')} valeur={r.representant_srm} />}
        {pieces.length > 0 && <Info libelle={t('Pièces')} valeur={pieces.join(' ; ')} large />}
        {ouvriers.length > 0 && <Info libelle={t('Ouvriers')} valeur={ouvriers.join(', ')} large />}
        {!!r.observation && <Info libelle={t('Observation')} valeur={r.observation} large />}
      </View>
      <EtatEnvoi local={b.creation} />
      <EtatModification modifs={b.modifs} />
      {photo && (
        <View style={{ gap: 8 }}>
          <Text style={s.petit}>{t('Ajouter une photo :')}</Text>
          <View style={s.ligne}>
            {(['avant', 'pendant', 'apres'] as const).map((tp) => (
              <Bouton key={tp} titre={tx(TYPES_PHOTO[tp])} icone="camera" onPress={() => photo(tp)} desactive={occupe} style={{ flexGrow: 1, flexBasis: 130 }} />
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
    ? t('{l} × {la} m', { l: nombre(r.longueur_m), la: nombre(r.largeur_m) })
    : local ? t('dimensions de la fouille') : null;
  return (
    <Bloc icone="paint-roller" titre={r.resultat === 'faite' ? t('Réfection faite') : t('Clôturée sans réfection')} sousTitre={dateHeure(r.realisee_le)}>
      <View style={s.grille}>
        {r.resultat === 'faite' ? (
          <>
            <Info libelle={t('Nature')} valeur={nature ?? (local ? t('Revêtement prévu à la réparation') : null)} />
            <Info libelle={t('Dimensions')} valeur={dimensions} />
          </>
        ) : <Info libelle={t('Motif')} valeur={motif} />}
        {!!r.observation && <Info libelle={t('Observation')} valeur={r.observation} large />}
      </View>
      <EtatEnvoi local={local} />
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

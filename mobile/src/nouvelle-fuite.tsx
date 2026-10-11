// Nouvelle fuite (F1 à F5), et modification d'une fuite pas encore validée (V2), avec ou sans réseau.
// Champs exigés par le marché (règle F1 par défaut : tournée, secteur, ouvrage, visibilité, nature de dégradation) ;
// adresse et photo facultatives (avertissement sans photo). Suggestions à valider d'un toucher (rue, secteur, diamètre
// et matériau du tronçon le plus proche), jamais pré-remplies ; sans réseau, aucune suggestion. Mini-carte du panneau
// (S10) quand le réseau est là. Contrôle des doublons à la création.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dateHeure } from './fiche';
import { ajouterEnvoi, effacerPhotos, mettreEnAttente, synchroniser, type PhotoAttente } from './file-attente';
import { Icone } from './icones';
import { enumerer, t, tx, useLangue } from './langue';
import { libelleDb, libelleListe, optionsListe } from './listes';
import { MiniCarte, useCarteDisponible, type PositionCarte } from './mini-carte';
import { champsChanges } from './modification';
import { diametresDe, useParametres } from './parametres';
import { prendrePhoto as photoCamera } from './photos';
import { champsExiges, champsManquants, nombreOuNul } from './regles';
import { Proposition } from './saisie';
import { useSession } from './session';
import { jetonARenouveler } from './session-donnees';
import { reprendreSuivi } from './suivi-gps';
import { supabase } from './supabase';
import { MATERIAUX, OUVRAGES, VISIBILITES, type FicheFuite, type Proche, type Secteur, type Suggestions } from './types';
import {
  BarreApp, Bouton, Carte, COULEURS, Message, pluriel, Puces, s, Saisie, Selecteur, Statut, TeteCarte, useBas, Vignettes,
} from './ui';

// Masque du marché : « 9 » = un chiffre, les séparateurs se placent seuls ; sans masque, saisie libre.
const formaterReference = (texte: string, masque: string | null | undefined) => {
  if (!masque) return texte;
  const chiffres = texte.replace(/\D/g, '');
  let i = 0;
  let sortie = '';
  for (const c of masque) {
    if (i >= chiffres.length) break;
    sortie += c === '9' ? chiffres[i++] : c;
  }
  return sortie;
};

const Obligatoire = ({ libelle, exige }: { libelle: string; exige: boolean }) => (
  <Text style={s.etiquette}>{libelle}{exige ? <Text style={{ color: COULEURS.danger }}> *</Text> : null}</Text>
);

export function NouvelleFuite({ retour, ouvrirFiche, modification }: {
  retour: () => void; ouvrirFiche: (id: string) => void; modification?: FicheFuite;
}) {
  const { marche, aRenouveler } = useSession();
  const { langue } = useLangue();
  const parametres = useParametres(marche?.id, aRenouveler);
  const m = modification;
  const libelleReference = tx(marche?.libelle_reference || 'Référence client');
  const masque = marche?.masque_reference ?? null;
  const exiges = champsExiges(marche);
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [secteurId, setSecteurId] = useState(m?.secteur_id ?? '');
  const [choixSecteur, setChoixSecteur] = useState(false);
  const [reference, setReference] = useState(m?.reference_srm ?? '');
  const [ouvrage, setOuvrage] = useState(m?.ouvrage ?? '');
  const [visibilite, setVisibilite] = useState(m?.visibilite ?? '');
  const [natureId, setNatureId] = useState(m?.nature_degradation_id ?? '');
  const [adresse, setAdresse] = useState(m?.adresse ?? '');
  const [observation, setObservation] = useState(m?.observation ?? '');
  const [materiau, setMateriau] = useState(m?.materiau ?? '');
  const [diametre, setDiametre] = useState(m?.diametre_mm != null ? String(m.diametre_mm) : '');
  const [tronconId, setTronconId] = useState(m?.troncon_id ?? '');
  const [position, setPosition] = useState<{ lat: number; lon: number; precision: number } | null>(
    m?.latitude != null && m.longitude != null ? { lat: m.latitude, lon: m.longitude, precision: 0 } : null,
  );
  const [gps, setGps] = useState(() => t('Recherche de la position…'));
  // Mini-carte (F4) : épingle déplacée sur la carte (écart au GPS), suggestions reçues de la carte.
  const [carte, setCarte] = useState(false);
  const [ajustee, setAjustee] = useState<number | null>(null);
  const suggestionsDeLaCarte = useRef(false);
  const carteDisponible = useCarteDisponible();
  const [photos, setPhotos] = useState<PhotoAttente[]>([]);
  const [erreur, setErreur] = useState('');
  const [manquants, setManquants] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState('');
  // Suggestions (F3, F4) : '' pas encore demandées, 'hors_ligne' sans réseau.
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [etatSuggestions, setEtatSuggestions] = useState<'' | 'en_cours' | 'fait' | 'hors_ligne'>('');
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  // Contrôle des doublons : fuites proches (rayon du marché) ou de même référence.
  const [proches, setProches] = useState<Proche[]>([]);
  const [controle, setControle] = useState<'' | 'en_cours' | 'fait' | 'hors_ligne'>('');
  const [lierA, setLierA] = useState('');
  const bas = useBas();
  // Photos prises puis saisie abandonnée : effacées du dossier privé de l'appli.
  const gardees = useRef(false);
  const photosCourantes = useRef<PhotoAttente[]>([]);
  photosCourantes.current = photos;
  useEffect(() => () => {
    if (!gardees.current) void effacerPhotos(photosCourantes.current);
  }, []);

  // Secteurs : copie de la tablette d'abord, puis serveur ; jeton à renouveler : copie seulement (session-donnees.ts).
  const marcheId = marche?.id;
  useEffect(() => {
    if (!marcheId) return;
    const cle = `suivi-fuites:secteurs:${marcheId}`;
    let annule = false;
    (async () => {
      const copie = await AsyncStorage.getItem(cle).catch(() => null);
      if (copie && !annule) setSecteurs(JSON.parse(copie));
      if (aRenouveler || jetonARenouveler()) return;
      const { data, error } = await supabase.from('secteurs').select('id, zone_id, code, libelle').eq('marche_id', marcheId)
        .eq('actif', true).order('libelle');
      if (error || !data || annule) return;
      setSecteurs(data as Secteur[]);
      AsyncStorage.setItem(cle, JSON.stringify(data)).catch(() => undefined);
    })().catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [marcheId, aRenouveler]);

  const localiser = useCallback(async () => {
    setGps(t('Recherche de la position…'));
    const droit = await Location.requestForegroundPermissionsAsync();
    if (droit.status !== 'granted') {
      setGps(t('Position refusée : autorisez la localisation dans les réglages de la tablette.'));
      return;
    }
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPosition({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy ?? 0 });
      setAjustee(null);
      setGps('');
    } catch {
      setGps(t("Position introuvable. Sortez à l'air libre et réessayez."));
    }
  }, []);

  // Modification : la position de la fuite ne change pas ici (correction du responsable, panneau).
  useEffect(() => {
    if (!m) void localiser();
  }, [localiser, m]);

  // Suggestions de localisation : rues, secteur, tronçon ; rayon selon la précision annoncée (base, S2).
  useEffect(() => {
    if (!marche || !position || m) return;
    // Position validée sur la carte : ses suggestions sont déjà là (calculées pour l'épingle).
    if (suggestionsDeLaCarte.current) {
      suggestionsDeLaCarte.current = false;
      return;
    }
    if (aRenouveler || jetonARenouveler()) {
      setEtatSuggestions('hors_ligne');
      return;
    }
    let annule = false;
    setEtatSuggestions('en_cours');
    supabase.rpc('suggestions_localisation', {
      p_marche: marche.id, p_longitude: position.lon, p_latitude: position.lat, p_precision_m: Math.round(position.precision) || null,
    }).then(({ data, error }) => {
      if (annule) return;
      if (error) throw error;
      setSuggestions(data as Suggestions);
      setEtatSuggestions('fait');
    }).then(undefined, () => {
      if (annule) return;
      setSuggestions(null);
      setEtatSuggestions('hors_ligne');
    });
    return () => {
      annule = true;
    };
  }, [marche, position, aRenouveler, m]);

  useEffect(() => {
    if (m || !marche || (!position && !reference.trim())) {
      setProches([]);
      setControle('');
      return;
    }
    // Jeton à renouveler : la recherche partirait sans jeton valide après les reprises d'auth-js (session-donnees.ts).
    if (aRenouveler) {
      setProches([]);
      setControle('hors_ligne');
      return;
    }
    let annule = false;
    const delai = setTimeout(async () => {
      if (jetonARenouveler()) {
        setProches([]);
        setControle('hors_ligne');
        return;
      }
      setControle('en_cours');
      try {
        const { data, error } = await supabase.rpc('rechercher_fuites_proches', {
          p_marche: marche.id,
          p_latitude: position?.lat ?? null,
          p_longitude: position?.lon ?? null,
          p_reference: reference.trim() || null,
        });
        if (annule) return;
        if (error) throw error;
        const liste = (data as Proche[] | null) ?? [];
        setProches(liste);
        setLierA((l) => (liste.some((p) => p.id === l) ? l : ''));
        setControle('fait');
      } catch {
        if (annule) return;
        setProches([]);
        setControle('hors_ligne');
      }
    }, 600);
    return () => {
      annule = true;
      clearTimeout(delai);
    };
  }, [marche, position, reference, aRenouveler, m]);

  async function prendrePhoto() {
    setErreur('');
    try {
      const r = await photoCamera('detection');
      if (typeof r === 'string') setErreur(r);
      else if (r) setPhotos((p) => [...p, r]);
    } catch (e) {
      setErreur(t('Photo impossible : {erreur}', { erreur: String((e as Error).message ?? e) }));
    }
  }

  function retirerPhoto(id: string) {
    void effacerPhotos(photos.filter((x) => x.id === id));
    setPhotos(photos.filter((x) => x.id !== id));
  }

  function memeFuite(id: string) {
    const ouvrirLaFiche = () => {
      void effacerPhotos(photos);
      gardees.current = true;
      ouvrirFiche(id);
    };
    if (!photos.length) return ouvrirLaFiche();
    Alert.alert(t('Même fuite'), t('La saisie en cours et ses photos ne seront pas gardées. Ouvrir la fiche existante ?'), [
      { text: t('Non'), style: 'cancel' },
      { text: t('Oui, ouvrir la fiche'), onPress: ouvrirLaFiche },
    ]);
  }

  function positionCarte(p: PositionCarte) {
    setCarte(false);
    if (p.suggestions) {
      suggestionsDeLaCarte.current = true;
      setSuggestions(p.suggestions);
      setEtatSuggestions('fait');
    }
    setPosition({ lat: p.latitude, lon: p.longitude, precision: p.precision_m ?? position?.precision ?? 0 });
    setAjustee(p.deplacee ? Math.round(p.distance_gps_m ?? 0) : null);
  }

  const choisir = (cle: string, appliquer: () => void) => {
    appliquer();
    setChoisies((c) => new Set(c).add(cle));
  };

  const libellesChamps: Record<string, string> = {
    reference_srm: libelleReference, secteur_id: t('Secteur'), ouvrage: t('Ouvrage'), visibilite: t('Visibilité'),
    nature_degradation_id: t('Nature de dégradation'), adresse: t('Adresse / repère'), diametre_mm: t('Diamètre'), materiau: t('Matériau'),
  };
  const nDiametre = nombreOuNul(diametre);
  const secteur = secteurs.find((x) => x.id === secteurId);
  const valeurs: Record<string, unknown> = {
    reference_srm: reference.trim() || null, secteur_id: secteurId || null, zone_id: secteur?.zone_id ?? (m?.zone_id ?? null),
    ouvrage: ouvrage || null, visibilite: visibilite || null, nature_degradation_id: natureId || null,
    adresse: adresse.trim() || null, observation: observation.trim() || null,
    materiau: materiau || null, diametre_mm: nDiametre, troncon_id: tronconId || null,
  };

  async function enregistrer(sansPhoto = false) {
    if (!marche) return;
    setErreur('');
    const absents = champsManquants(valeurs, exiges);
    setManquants(absents);
    if (absents.length) {
      setErreur(t('Champs obligatoires : {champs}.', { champs: enumerer(absents.map((c) => libellesChamps[c] ?? c)) }));
      return;
    }
    if (diametre.trim() && (nDiametre == null || !Number.isInteger(nDiametre) || nDiametre <= 0)) {
      setErreur(t('Diamètre : un nombre entier de millimètres.'));
      return;
    }
    if (!m && !position && !reference && !adresse.trim()) {
      setErreur(t("Indiquez au moins la position GPS, la {reference} ou l'adresse.", { reference: libelleReference.toLowerCase() }));
      return;
    }
    // Photo facultative avec avertissement (V4).
    if (!m && !photos.length && !sansPhoto) {
      Alert.alert(t('Aucune photo'), t('Une photo de la fuite aide le responsable à la valider. Enregistrer sans photo ?'), [
        { text: t('Prendre une photo'), style: 'cancel', onPress: () => void prendrePhoto() },
        { text: t('Enregistrer sans photo'), onPress: () => void enregistrer(true) },
      ]);
      return;
    }
    setEnvoi(t('Enregistrement sur la tablette…'));
    try {
      if (m) {
        const avant: Record<string, unknown> = { ...m };
        const champs = champsChanges(avant, valeurs);
        if (!Object.keys(champs).length) {
          setErreur(t('Aucune modification à enregistrer.'));
          setEnvoi('');
          return;
        }
        await ajouterEnvoi({
          type: 'maj', id: Crypto.randomUUID(), marche_id: marche.id, fuite_id: m.id, fuite_libelle: m.numero != null
            ? t('Fuite N° {numero}', { numero: m.numero }) : t('Fuite à envoyer'),
          photos: [], table: 'fuites', ligne_id: m.id, champs,
        });
        void synchroniser().catch(() => undefined);
        retour();
        return;
      }
      const pos = position ? `SRID=4326;POINT(${position.lon} ${position.lat})` : null;
      await mettreEnAttente({
        id: Crypto.randomUUID(), marche_id: marche.id, position: pos, photos,
        ligne: {
          ...valeurs, position: pos, precision_gps_m: position ? Math.round(position.precision) : null, source_saisie: 'tablette',
          fuite_liee_id: lierA || null,
        },
      });
      gardees.current = true;
      // Fuite signalée : une pause du suivi GPS en cours prend fin.
      void reprendreSuivi('fuite').catch(() => undefined);
      setEnvoi(t('Envoi…'));
      await synchroniser();
      retour();
    } catch (e) {
      setErreur(String((e as Error).message ?? e));
      setEnvoi('');
    }
  }

  const manque = (c: string) => manquants.includes(c) && !valeurs[c];
  const rue = (r: Suggestions['rues'][number]) => (langue === 'ar' && r.nom_ar ? r.nom_ar : r.nom);
  const tr = suggestions?.troncon;
  const conduite = tr && (tr.materiau || tr.diametre_mm)
    ? [tr.materiau ? libelleListe('materiau', tr.materiau, MATERIAUX[tr.materiau]) : tr.materiau_plan, tr.diametre_mm ? t('Ø {d} mm', { d: tr.diametre_mm }) : null]
      .filter(Boolean).join(' · ')
    : '';
  const secteurSuggere = suggestions?.secteur && secteurs.find((x) => x.id === suggestions.secteur?.id);
  const diametres = diametresDe(parametres, materiau);

  return (
    <View style={s.ecran}>
      <BarreApp titre={m ? t('Modifier la fuite') : t('Nouvelle fuite')} sousTitre={marche?.code} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]} keyboardShouldPersistTaps="handled">
        {!m && (
          <Carte>
            <TeteCarte
              titre={t('Position')} icone="map-pin"
              action={<Bouton titre={t('Actualiser la position')} icone="locate-fixed" onPress={localiser} />}
            />
            {position ? (
              <Text style={s.texte}>{position.lat.toFixed(6)}, {position.lon.toFixed(6)} (± {Math.round(position.precision)} m)</Text>
            ) : <Text style={s.discret}>{gps}</Text>}
            {ajustee != null && <Text style={s.petit}>{t('Position ajustée sur la carte, à {n} m du GPS.', { n: ajustee })}</Text>}
            {carteDisponible && marche && (
              <Bouton titre={t('Voir et ajuster sur la carte')} icone="map" onPress={() => setCarte(true)} style={{ alignSelf: 'flex-start' }} />
            )}
          </Carte>
        )}

        {!m && position && (
          <Carte>
            <TeteCarte titre={t('Suggestions')} icone="lightbulb" description={t('À valider d\'un toucher ; rien n\'est rempli sans vous.')} />
            {etatSuggestions === 'en_cours' && <Text style={s.discret}>{t('Recherche des suggestions…')}</Text>}
            {etatSuggestions === 'hors_ligne' && (
              <Message ton="attention" icone="wifi-off">{t('Sans réseau : pas de suggestion, saisie manuelle.')}</Message>
            )}
            {etatSuggestions === 'fait' && suggestions?.precision_insuffisante && (
              <Text style={s.discret}>{t('Position trop imprécise (± {n} m) pour proposer la rue et le secteur.', { n: Math.round(position.precision) })}</Text>
            )}
            {etatSuggestions === 'fait' && suggestions && !suggestions.precision_insuffisante && (
              <>
                {!suggestions.rues.length && !secteurSuggere && !conduite && <Text style={s.discret}>{t('Aucune suggestion ici : saisie manuelle.')}</Text>}
                {suggestions.rues.length > 0 && (
                  <View style={{ gap: 8 }}>
                    <Text style={s.etiquette}>{t('Rue')}</Text>
                    <View style={s.ligne}>
                      {suggestions.rues.map((r) => (
                        <Proposition
                          key={r.nom} texte={t('{rue} (à {n} m)', { rue: rue(r), n: Math.round(r.distance_m) })}
                          choisie={adresse === r.nom} onPress={() => choisir(`rue:${r.nom}`, () => setAdresse(r.nom))}
                        />
                      ))}
                    </View>
                    <Text style={s.petit}>{t('Rues : © OpenStreetMap')}</Text>
                  </View>
                )}
                {!!secteurSuggere && (
                  <View style={{ gap: 8 }}>
                    <Text style={s.etiquette}>{t('Secteur')}</Text>
                    <Proposition
                      texte={secteurSuggere.libelle} choisie={secteurId === secteurSuggere.id}
                      onPress={() => choisir('secteur', () => setSecteurId(secteurSuggere.id))}
                    />
                  </View>
                )}
                {!!conduite && tr && (
                  <View style={{ gap: 8 }}>
                    <Text style={s.etiquette}>{t('Conduite la plus proche')}</Text>
                    <Proposition
                      texte={t('{conduite} (à {n} m)', { conduite, n: Math.round(tr.distance_m) })}
                      choisie={choisies.has('troncon') && tronconId === tr.id}
                      onPress={() => choisir('troncon', () => {
                        setTronconId(tr.id);
                        if (tr.materiau) setMateriau(tr.materiau);
                        if (tr.diametre_mm) setDiametre(String(tr.diametre_mm));
                      })}
                    />
                  </View>
                )}
              </>
            )}
          </Carte>
        )}

        {!m && controle === 'hors_ligne' && (
          <Message ton="attention" icone="wifi-off">
            {t("Sans réseau : pas de contrôle des doublons. Vérifiez sur place qu'elle n'est pas déjà signalée.")}
          </Message>
        )}
        {proches.length > 0 && (
          <Carte>
            <TeteCarte titre={t('Fuite déjà signalée ici ?')} icone="triangle-alert" />
            {proches.map((p) => (
              <View key={p.id} style={s.separateur}>
                <View style={[s.ligne, { alignItems: 'center' }]}>
                  <Text style={s.texteFort}>{t('N° {numero}', { numero: p.numero })}</Text>
                  <Statut statut={p.statut} court />
                  <Text style={s.discret}>
                    {dateHeure(p.date_detection)}
                    {p.meme_reference ? t(' · même référence') : ''}
                    {p.distance_m != null ? t(' · à {n} m', { n: Math.round(p.distance_m) }) : ''}
                  </Text>
                </View>
                <View style={s.ligne}>
                  <Bouton titre={t("C'est la même fuite")} icone="check" onPress={() => memeFuite(p.id)} style={{ flexGrow: 1, flexBasis: 200 }} />
                  <Bouton
                    titre={t('Nouvelle fuite liée')}
                    icone={lierA === p.id ? 'check' : 'link-2'}
                    primaire={lierA === p.id}
                    onPress={() => setLierA(lierA === p.id ? '' : p.id)}
                    style={{ flexGrow: 1, flexBasis: 200 }}
                  />
                </View>
              </View>
            ))}
            <Text style={s.discret}>
              {lierA
                ? t('Elle sera enregistrée comme nouvelle fuite liée au N° {numero}.', { numero: proches.find((p) => p.id === lierA)?.numero })
                : t('Sans choix, elle sera enregistrée comme une nouvelle fuite indépendante.')}
            </Text>
          </Carte>
        )}

        <Carte>
          <TeteCarte titre={t('Identification')} description={t('* champ obligatoire')} />
          <View style={{ gap: 6 }}>
            <Obligatoire libelle={libelleReference} exige={exiges.includes('reference_srm')} />
            <Saisie
              value={reference}
              onChangeText={(x) => setReference(formaterReference(x, masque))}
              keyboardType={masque ? 'number-pad' : 'default'}
              placeholder={masque ? masque.replace(/9/g, '0') : undefined}
              maxLength={masque ? masque.length : undefined}
              style={manque('reference_srm') ? n.manquant : undefined}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Obligatoire libelle={t('Secteur')} exige={exiges.includes('secteur_id')} />
            <View style={manque('secteur_id') ? n.cadreManquant : undefined}>
              <Selecteur valeur={secteur?.libelle} indication={t('Choisir le secteur')} onPress={() => setChoixSecteur(true)} />
            </View>
          </View>
          <View style={[{ gap: 6 }, manque('ouvrage') && n.cadreManquant]}>
            <Obligatoire libelle={t('Ouvrage')} exige={exiges.includes('ouvrage')} />
            <Puces facultatif options={optionsListe('ouvrage', OUVRAGES)} valeur={ouvrage} onChange={setOuvrage} />
          </View>
          <View style={[{ gap: 6 }, manque('visibilite') && n.cadreManquant]}>
            <Obligatoire libelle={t('Visibilité')} exige={exiges.includes('visibilite')} />
            <Puces facultatif options={optionsListe('visibilite', VISIBILITES)} valeur={visibilite} onChange={setVisibilite} />
          </View>
          <View style={[{ gap: 6 }, manque('nature_degradation_id') && n.cadreManquant]}>
            <Obligatoire libelle={t('Nature de dégradation')} exige={exiges.includes('nature_degradation_id')} />
            {parametres.natures.length ? (
              <Puces facultatif options={parametres.natures.map((x) => ({ valeur: x.id, libelle: libelleDb(x) }))} valeur={natureId} onChange={setNatureId} />
            ) : <Text style={s.discret}>{t('Liste des natures pas encore chargée sur cette tablette : connectez-la au réseau.')}</Text>}
          </View>
          <View style={{ gap: 6 }}>
            <Obligatoire libelle={t('Adresse / repère')} exige={exiges.includes('adresse')} />
            <Saisie value={adresse} onChangeText={setAdresse} style={manque('adresse') ? n.manquant : undefined} />
          </View>
        </Carte>

        <Carte>
          <TeteCarte titre={t('Conduite')} description={t('Facultatif : matériau et diamètre, si vous les connaissez.')} />
          <Obligatoire libelle={t('Matériau')} exige={exiges.includes('materiau')} />
          <Puces
            facultatif options={optionsListe('materiau', MATERIAUX)} valeur={materiau}
            onChange={(v) => { if (v !== materiau) setDiametre(''); setMateriau(v); }}
          />
          <Obligatoire libelle={t('Diamètre (mm)')} exige={exiges.includes('diametre_mm')} />
          {diametres.length > 0 && (
            <Puces facultatif options={diametres.map((d) => ({ valeur: String(d), libelle: String(d) }))} valeur={diametre} onChange={setDiametre} />
          )}
          <Saisie value={diametre} onChangeText={setDiametre} keyboardType="number-pad" placeholder={t('Autre diamètre')} />
        </Carte>

        <Carte>
          <View style={{ gap: 6 }}>
            <Text style={s.etiquette}>{t('Observation')}</Text>
            <Saisie style={s.multiligne} value={observation} onChangeText={setObservation} multiline />
          </View>
        </Carte>

        {!m && (
          <Carte>
            <TeteCarte
              titre={t('Photos')} compteur={photos.length}
              action={<Bouton titre={t('Prendre une photo')} icone="camera" onPress={prendrePhoto} />}
            />
            {!photos.length && <Text style={s.discret}>{t('Facultatives, mais attendues par le responsable ; un appui sur une photo la retire.')}</Text>}
            <Vignettes photos={photos.map((p) => ({ id: p.id, uri: p.fichier, legende: t('Détection') }))} retirer={retirerPhoto} />
          </Carte>
        )}
        {!!erreur && <Message ton="erreur">{erreur}</Message>}
        <Bouton
          titre={envoi || (m ? t('Enregistrer les modifications') : t('Enregistrer la fuite'))} primaire grand
          onPress={() => void enregistrer()} occupe={!!envoi}
        />
        <Bouton titre={t('Annuler')} onPress={retour} desactive={!!envoi} />
      </ScrollView>

      {marche && (
        <MiniCarte visible={carte} marcheId={marche.id} gps={position} fermer={() => setCarte(false)} valider={positionCarte} />
      )}

      <Modal visible={choixSecteur} animationType="slide" statusBarTranslucent onRequestClose={() => setChoixSecteur(false)}>
        <View style={s.ecran}>
          <BarreApp
            titre={t('Choisir le secteur')}
            sousTitre={t('{n} secteurs', { n: secteurs.length }, pluriel(secteurs.length, 'secteur'))}
            retour={() => setChoixSecteur(false)}
          />
          <FlatList
            data={[{ id: '', libelle: 'Aucun' } as Secteur, ...secteurs]}
            keyExtractor={(x) => x.id || 'aucun'}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 + bas, width: '100%', maxWidth: 920, alignSelf: 'center' }}
            ItemSeparatorComponent={() => <View style={n.separation} />}
            renderItem={({ item }) => {
              const actif = item.id === secteurId;
              return (
                <Pressable
                  style={({ pressed }) => [n.choix, actif && { backgroundColor: COULEURS.sourdine }, pressed && s.appuye]}
                  onPress={() => {
                    setSecteurId(item.id);
                    setChoixSecteur(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actif }}
                >
                  <Text style={[s.texte, { flex: 1, fontSize: 18 }, !item.id && { color: COULEURS.discret }, actif && { fontWeight: '600' }]}>
                    {item.id ? item.libelle : t('Aucun')}
                  </Text>
                  {actif && <Icone nom="check" couleur={COULEURS.texte} />}
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const n = StyleSheet.create({
  manquant: { borderColor: COULEURS.danger, borderWidth: 2, paddingHorizontal: 13 },
  cadreManquant: { borderWidth: 1, borderColor: COULEURS.dangerBord, backgroundColor: '#fef2f2', borderRadius: 10, padding: 8 },
  separation: { height: 1, backgroundColor: COULEURS.bord },
  choix: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
});

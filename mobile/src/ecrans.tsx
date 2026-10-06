import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { dateHeure } from './fiche';
import {
  abandonner, dependants, effacerPhotos, estFuite, lireAttente, mettreEnAttente, surChangement, synchroniser,
  type Envoi, type EnvoiFuite, type PhotoAttente,
} from './file-attente';
import { prendrePhoto as photoCamera } from './photos';
import { useSession } from './session';
import { emailDepuisIdentifiant, supabase } from './supabase';
import { STATUTS, type Proche, type Secteur, type VFuite } from './types';
import {
  Alerte, BarreApp, Bouton, BoutonBarre, BoutonYAller, Carte, COULEURS, Puces, s, Saisie, Statut, Vignettes,
} from './ui';
// Masque du marché : « 9 » = un chiffre, les séparateurs se placent seuls ; sans masque, saisie libre.
const formaterReference = (t: string, masque: string | null | undefined) => {
  if (!masque) return t;
  const chiffres = t.replace(/\D/g, '');
  let i = 0;
  let sortie = '';
  for (const c of masque) {
    if (i >= chiffres.length) break;
    if (c === '9') sortie += chiffres[i++];
    else sortie += c;
  }
  return sortie;
};

export function Connexion() {
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);

  async function entrer() {
    setOccupe(true);
    setErreur('');
    const { error } = await supabase.auth.signInWithPassword({
      email: emailDepuisIdentifiant(identifiant),
      password: motDePasse,
    });
    if (error) setErreur(/invalid login/i.test(error.message) ? 'Identifiant ou mot de passe incorrect.' : 'Connexion impossible : vérifiez le réseau.');
    setOccupe(false);
  }

  return (
    <View style={s.ecran}>
      <BarreApp titre="Suivi des fuites" sousTitre="Connexion" />
      <ScrollView contentContainerStyle={[s.defile, { paddingTop: 40, width: '100%', maxWidth: 520, alignSelf: 'center' }]} keyboardShouldPersistTaps="handled">
        <Carte>
          <Text style={s.sousTitre}>Se connecter</Text>
          <Text style={s.etiquette}>Identifiant</Text>
          <Saisie value={identifiant} onChangeText={setIdentifiant} autoCapitalize="none" autoCorrect={false} />
          <Text style={s.etiquette}>Mot de passe</Text>
          <Saisie value={motDePasse} onChangeText={setMotDePasse} secureTextEntry autoCapitalize="none" />
          {!!erreur && <Text style={s.erreur}>{erreur}</Text>}
          <Bouton titre="Se connecter" primaire onPress={entrer} occupe={occupe} desactive={!identifiant || !motDePasse} />
        </Carte>
      </ScrollView>
    </View>
  );
}

export function Liste({ nouvelle, attente, balayage, ouvrir }: {
  nouvelle: () => void; attente: () => void; balayage: () => void; ouvrir: (id: string) => void;
}) {
  const { marche, marches, choisirMarche, peut, profil, deconnecter } = useSession();
  const [fuites, setFuites] = useState<VFuite[]>([]);
  const [envois, setEnvois] = useState<Envoi[]>([]);
  const [message, setMessage] = useState('');
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(async () => {
    if (!marche) return;
    setRafraichit(true);
    setEnvois(await lireAttente());
    const cle = `suivi-fuites:liste:${marche.id}`;
    const { data, error } = await supabase
      .from('v_fuites')
      .select('id, numero, reference_srm, statut, secteur, adresse, date_detection, nb_photos, alerte_non_reparee, alerte_sans_photo, latitude, longitude')
      .eq('marche_id', marche.id)
      .order('date_detection', { ascending: false })
      .limit(200);
    if (error || !data) {
      const copie = await AsyncStorage.getItem(cle);
      if (copie) setFuites(JSON.parse(copie));
      setMessage('Hors ligne : dernière liste connue.');
    } else {
      setFuites(data as VFuite[]);
      setMessage('');
      AsyncStorage.setItem(cle, JSON.stringify(data)).catch(() => undefined);
    }
    setRafraichit(false);
  }, [marche]);

  useEffect(() => {
    charger();
  }, [charger]);
  // Après chaque synchro : compteur à jour, et la liste suit les statuts recalculés par le serveur.
  useEffect(() => surChangement(() => void charger()), [charger]);

  // Fuites saisies sur la tablette et pas encore arrivées au serveur : en tête, ouvrables.
  const locales = envois.filter((e): e is EnvoiFuite => estFuite(e) && e.marche_id === marche?.id && !fuites.some((f) => f.id === e.id));
  const nbAttente = envois.length;
  const delai = marche?.delai_alerte_reparation_h ?? 48;
  const styleCarte = ({ pressed }: { pressed: boolean }) => [s.carte, pressed && { borderColor: COULEURS.principal, backgroundColor: COULEURS.survol }];

  return (
    <View style={s.ecran}>
      <BarreApp
        titre={`Fuites · ${marche?.code ?? ''}`}
        sousTitre={profil?.nom_complet}
        droite={<BoutonBarre titre="Quitter" onPress={deconnecter} />}
      />
      <View style={s.contenu}>
        {marches.length > 1 && (
          <Puces options={marches.map((m) => ({ valeur: m.id, libelle: m.code }))} valeur={marche?.id ?? ''} onChange={(v) => v && choisirMarche(v)} />
        )}
        <View style={s.ligne}>
          {peut('fuites', 'creer') && (
            <View style={{ flexGrow: 1, flexBasis: 220 }}><Bouton titre="+ Nouvelle fuite" primaire onPress={nouvelle} /></View>
          )}
          {peut('balayage', 'lire') && (
            <View style={{ flexGrow: 1, flexBasis: 220 }}><Bouton titre="Balayage" onPress={balayage} /></View>
          )}
          {nbAttente > 0 && (
            <View style={{ flexGrow: 1, flexBasis: 220 }}><Bouton titre={`${nbAttente} envoi(s) en attente`} onPress={attente} /></View>
          )}
        </View>
        {!!message && <Text style={s.attention}>{message}</Text>}
      </View>
      <FlatList
        data={fuites}
        keyExtractor={(f) => f.id}
        refreshing={rafraichit}
        onRefresh={charger}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 32 }}
        ListEmptyComponent={locales.length ? null : <Text style={s.discret}>Aucune fuite.</Text>}
        ListHeaderComponent={locales.length ? (
          <View style={{ gap: 10 }}>
            {locales.map((e) => (
              <Pressable key={e.id} onPress={() => ouvrir(e.id)} accessibilityRole="button" style={styleCarte}>
                <Text style={s.sousTitre}>À envoyer{e.ligne.reference_srm ? ` · ${String(e.ligne.reference_srm)}` : ''}</Text>
                {!!e.ligne.adresse && <Text style={s.texte}>{String(e.ligne.adresse)}</Text>}
                <Text style={s.attention}>{dateHeure(e.creee_le)} · gardée sur la tablette</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        renderItem={({ item: f }) => (
          <Pressable onPress={() => ouvrir(f.id)} accessibilityRole="button" style={styleCarte}>
            <View style={[s.ligne, { justifyContent: 'space-between', alignItems: 'center' }]}>
              <Text style={s.sousTitre}>N° {f.numero}{f.reference_srm ? ` · ${f.reference_srm}` : ''}</Text>
              <Statut statut={f.statut} />
            </View>
            {!!(f.secteur || f.adresse) && <Text style={s.texte}>{[f.secteur, f.adresse].filter(Boolean).join(' · ')}</Text>}
            <Text style={s.discret}>{dateHeure(f.date_detection)} · {f.nb_photos} photo(s)</Text>
            {f.alerte_non_reparee && <Alerte texte={`Non réparée depuis plus de ${delai} h`} />}
            {f.latitude != null && f.longitude != null && (
              <BoutonYAller latitude={f.latitude} longitude={f.longitude} libelle={`Fuite N° ${f.numero}`} />
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

export function NouvelleFuite({ retour, ouvrirFiche }: { retour: () => void; ouvrirFiche: (id: string) => void }) {
  const { marche } = useSession();
  const libelleReference = marche?.libelle_reference || 'Référence client';
  const masque = marche?.masque_reference ?? null;
  const [secteurs, setSecteurs] = useState<Secteur[]>([]);
  const [secteurId, setSecteurId] = useState('');
  const [choixSecteur, setChoixSecteur] = useState(false);
  const [reference, setReference] = useState('');
  const [adresse, setAdresse] = useState('');
  const [observation, setObservation] = useState('');
  const [position, setPosition] = useState<{ lat: number; lon: number; precision: number } | null>(null);
  const [gps, setGps] = useState('Recherche de la position…');
  const [photos, setPhotos] = useState<PhotoAttente[]>([]);
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState('');
  // Contrôle des doublons : fuites proches (rayon du marché) ou de même référence.
  const [proches, setProches] = useState<Proche[]>([]);
  const [controle, setControle] = useState<'' | 'en_cours' | 'fait' | 'hors_ligne'>('');
  const [lierA, setLierA] = useState('');
  // Photos prises puis saisie abandonnée : effacées du dossier privé de l'appli.
  const gardees = useRef(false);
  const photosCourantes = useRef<PhotoAttente[]>([]);
  photosCourantes.current = photos;
  useEffect(() => () => {
    if (!gardees.current) void effacerPhotos(photosCourantes.current);
  }, []);

  useEffect(() => {
    if (!marche) return;
    const cle = `suivi-fuites:secteurs:${marche.id}`;
    supabase.from('secteurs').select('id, zone_id, code, libelle').eq('marche_id', marche.id).eq('actif', true).order('libelle')
      .then(async ({ data, error }) => {
        if (!error && data) {
          setSecteurs(data as Secteur[]);
          AsyncStorage.setItem(cle, JSON.stringify(data)).catch(() => undefined);
        } else {
          const copie = await AsyncStorage.getItem(cle);
          if (copie) setSecteurs(JSON.parse(copie));
        }
      });
  }, [marche]);

  const localiser = useCallback(async () => {
    setGps('Recherche de la position…');
    const droit = await Location.requestForegroundPermissionsAsync();
    if (droit.status !== 'granted') {
      setGps('Position refusée : autorisez la localisation dans les réglages de la tablette.');
      return;
    }
    try {
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPosition({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy ?? 0 });
      setGps('');
    } catch {
      setGps('Position introuvable. Sortez à l\'air libre et réessayez.');
    }
  }, []);

  useEffect(() => {
    localiser();
  }, [localiser]);

  useEffect(() => {
    if (!marche || (!position && !reference.trim())) {
      setProches([]);
      setControle('');
      return;
    }
    let annule = false;
    const delai = setTimeout(async () => {
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
  }, [marche, position, reference]);

  async function prendrePhoto() {
    setErreur('');
    try {
      const r = await photoCamera('detection');
      if (typeof r === 'string') setErreur(r);
      else if (r) setPhotos((p) => [...p, r]);
    } catch (e) {
      setErreur(`Photo impossible : ${String((e as Error).message ?? e)}`);
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
    Alert.alert('Même fuite', 'La saisie en cours et ses photos ne seront pas gardées. Ouvrir la fiche existante ?', [
      { text: 'Non', style: 'cancel' },
      { text: 'Oui, ouvrir la fiche', onPress: ouvrirLaFiche },
    ]);
  }

  async function enregistrer() {
    if (!marche) return;
    setErreur('');
    if (!position && !reference && !adresse.trim()) {
      setErreur(`Indiquez au moins la position GPS, la ${libelleReference.toLowerCase()} ou l'adresse.`);
      return;
    }
    const pos = position ? `SRID=4326;POINT(${position.lon} ${position.lat})` : null;
    const secteur = secteurs.find((x) => x.id === secteurId);
    const id = Crypto.randomUUID();
    setEnvoi('Enregistrement sur la tablette…');
    try {
      await mettreEnAttente({
        id, marche_id: marche.id, position: pos, photos,
        ligne: {
          reference_srm: reference || null, secteur_id: secteur?.id ?? null, zone_id: secteur?.zone_id ?? null,
          adresse: adresse.trim() || null, observation: observation.trim() || null, position: pos,
          precision_gps_m: position ? Math.round(position.precision) : null, source_saisie: 'tablette',
          fuite_liee_id: lierA || null,
        },
      });
      gardees.current = true;
      setEnvoi('Envoi…');
      await synchroniser();
      retour();
    } catch (e) {
      setErreur(String((e as Error).message ?? e));
      setEnvoi('');
    }
  }

  return (
    <View style={s.ecran}>
      <BarreApp titre="Nouvelle fuite" sousTitre={marche?.code} retour={retour} />
      <ScrollView contentContainerStyle={s.defile} keyboardShouldPersistTaps="handled">
        <Carte>
          <Text style={s.sousTitre}>Position</Text>
          {position ? (
            <Text style={s.texte}>{position.lat.toFixed(6)}, {position.lon.toFixed(6)} (± {Math.round(position.precision)} m)</Text>
          ) : <Text style={s.discret}>{gps}</Text>}
          <Bouton titre="Actualiser la position" onPress={localiser} />
        </Carte>
        {controle === 'hors_ligne' && (
          <Text style={s.attention}>Sans réseau : pas de contrôle des doublons. Vérifiez sur place qu&apos;elle n&apos;est pas déjà signalée.</Text>
        )}
        {proches.length > 0 && (
          <Carte>
            <Text style={s.sousTitre}>Fuite déjà signalée ici ?</Text>
            {proches.map((p) => (
              <View key={p.id} style={s.separateur}>
                <Text style={s.texte}>
                  N° {p.numero} · {STATUTS[p.statut]} · {dateHeure(p.date_detection)}
                  {p.meme_reference ? ' · même référence' : ''}
                  {p.distance_m != null ? ` · à ${Math.round(p.distance_m)} m` : ''}
                </Text>
                <View style={s.ligne}>
                  <View style={{ flexGrow: 1, flexBasis: 200 }}>
                    <Bouton titre="C'est la même fuite" onPress={() => memeFuite(p.id)} />
                  </View>
                  <View style={{ flexGrow: 1, flexBasis: 200 }}>
                    <Bouton
                      titre={lierA === p.id ? '✓ Nouvelle fuite liée' : 'Nouvelle fuite liée'}
                      primaire={lierA === p.id}
                      onPress={() => setLierA(lierA === p.id ? '' : p.id)}
                    />
                  </View>
                </View>
              </View>
            ))}
            <Text style={s.discret}>
              {lierA
                ? `Elle sera enregistrée comme nouvelle fuite liée au N° ${proches.find((p) => p.id === lierA)?.numero ?? ''}.`
                : 'Sans choix, elle sera enregistrée comme une nouvelle fuite indépendante.'}
            </Text>
          </Carte>
        )}
        <Carte>
          <Text style={s.etiquette}>{libelleReference}</Text>
          <Saisie
            value={reference}
            onChangeText={(t) => setReference(formaterReference(t, masque))}
            keyboardType={masque ? 'number-pad' : 'default'}
            placeholder={masque ? masque.replace(/9/g, '0') : undefined}
            maxLength={masque ? masque.length : undefined}
          />
          <Text style={s.etiquette}>Secteur</Text>
          <Bouton titre={secteurs.find((x) => x.id === secteurId)?.libelle ?? '— Choisir —'} onPress={() => setChoixSecteur(true)} />
          <Text style={s.etiquette}>Adresse / repère</Text>
          <Saisie value={adresse} onChangeText={setAdresse} />
          <Text style={s.etiquette}>Observation</Text>
          <Saisie style={s.multiligne} value={observation} onChangeText={setObservation} multiline />
        </Carte>
        <Carte>
          <Text style={s.sousTitre}>Photos ({photos.length})</Text>
          <Bouton titre="📷 Prendre une photo" onPress={prendrePhoto} />
          <Vignettes photos={photos.map((p) => ({ id: p.id, uri: p.fichier, legende: 'Détection' }))} retirer={retirerPhoto} />
        </Carte>
        {!!erreur && <Text style={s.erreur}>{erreur}</Text>}
        <Bouton titre={envoi || 'Enregistrer la fuite'} primaire onPress={enregistrer} occupe={!!envoi} />
        <Bouton titre="Annuler" onPress={retour} desactive={!!envoi} />
      </ScrollView>

      <Modal visible={choixSecteur} animationType="slide" statusBarTranslucent onRequestClose={() => setChoixSecteur(false)}>
        <View style={s.ecran}>
          <BarreApp titre="Choisir le secteur" retour={() => setChoixSecteur(false)} />
          <FlatList
            data={[{ id: '', libelle: '— Aucun —' } as Secteur, ...secteurs]}
            keyExtractor={(x) => x.id || 'aucun'}
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}
            renderItem={({ item }) => (
              <Pressable
                style={[s.puce, item.id === secteurId && s.puceActive]}
                onPress={() => {
                  setSecteurId(item.id);
                  setChoixSecteur(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: item.id === secteurId }}
              >
                <Text style={[s.textePuce, { fontSize: 18 }, item.id === secteurId && { color: '#fff' }]}>{item.libelle}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const titreEnvoi = (e: Envoi) => {
  switch (e.type) {
    case 'reparation': return `Réparation · ${e.fuite_libelle}`;
    case 'refection': return `Réfection · ${e.fuite_libelle}`;
    case 'modification': return `Modification de réparation · ${e.fuite_libelle}`;
    case 'photos': return `Photo(s) ajoutée(s) · ${e.fuite_libelle}`;
    default: return `Nouvelle fuite · ${(e.ligne.reference_srm as string) || (e.ligne.adresse as string) || 'sans référence'}`;
  }
};

export function EnAttente({ retour }: { retour: () => void }) {
  const [liste, setListe] = useState<Envoi[]>([]);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const charger = useCallback(async () => setListe(await lireAttente()), []);
  useEffect(() => {
    charger();
    return surChangement(() => void charger());
  }, [charger]);

  async function envoyer() {
    setOccupe(true);
    const restantes = await synchroniser().catch(() => -1);
    setMessage(restantes === 0 ? 'Tout est envoyé.' : restantes < 0 ? 'Envoi impossible pour le moment.' : `${restantes} envoi(s) restent à traiter.`);
    setOccupe(false);
    charger();
  }

  async function supprimer(e: Envoi) {
    const suite = await dependants(e.id);
    Alert.alert(
      'Supprimer de la tablette ?',
      `Cette saisie${suite.length ? ` et ${suite.length} saisie(s) liée(s) (réparation, réfection, modification, photos)` : ''} et ses photos seront définitivement perdues.`,
      [
        { text: 'Garder', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: async () => { await abandonner(e.id); charger(); } },
      ],
    );
  }

  return (
    <View style={s.ecran}>
      <BarreApp titre="Envois en attente" sousTitre={`${liste.length} saisie(s) sur la tablette`} retour={retour} />
      <ScrollView contentContainerStyle={s.defile}>
        <Text style={s.discret}>
          Ces saisies sont gardées sur la tablette. Elles partent dans l&apos;ordre dès que le réseau revient ;
          ne désinstallez pas l&apos;application avant.
        </Text>
        <Bouton titre="Envoyer maintenant" primaire onPress={envoyer} occupe={occupe} desactive={liste.length === 0} />
        {!!message && <Text style={s.info}>{message}</Text>}
        {liste.map((e) => (
          <Carte key={e.id}>
            <Text style={s.sousTitre}>{titreEnvoi(e)}</Text>
            <Text style={s.discret}>Saisie le {dateHeure(e.creee_le)} · {e.photos.length} photo(s) en attente</Text>
            {!!e.erreur && <Text style={s.erreur}>{e.erreur}</Text>}
            <Bouton titre="Supprimer de la tablette" danger onPress={() => supprimer(e)} />
          </Carte>
        ))}
        <Bouton titre="Retour" onPress={retour} />
      </ScrollView>
    </View>
  );
}

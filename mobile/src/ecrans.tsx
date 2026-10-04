import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { abandonner, garderPhoto, lireAttente, mettreEnAttente, synchroniser, type FuiteAttente, type PhotoAttente } from './file-attente';
import { useSession } from './session';
import { emailDepuisIdentifiant, supabase } from './supabase';
import { STATUTS, type Secteur, type VFuite } from './types';
import { Bouton, Carte, COULEURS, s } from './ui';
import AsyncStorage from '@react-native-async-storage/async-storage';

const dateHeure = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
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
    <ScrollView style={s.ecran} contentContainerStyle={[s.contenu, { paddingTop: 80 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.titre}>Suivi des fuites</Text>
      <Carte>
        <Text style={s.etiquette}>Identifiant</Text>
        <TextInput style={s.champ} value={identifiant} onChangeText={setIdentifiant} autoCapitalize="none" autoCorrect={false} />
        <Text style={s.etiquette}>Mot de passe</Text>
        <TextInput style={s.champ} value={motDePasse} onChangeText={setMotDePasse} secureTextEntry autoCapitalize="none" />
        {!!erreur && <Text style={s.erreur}>{erreur}</Text>}
        <Bouton titre="Se connecter" primaire onPress={entrer} occupe={occupe} desactive={!identifiant || !motDePasse} />
      </Carte>
    </ScrollView>
  );
}

export function Liste({ nouvelle, attente }: { nouvelle: () => void; attente: () => void }) {
  const { marche, marches, choisirMarche, peut, profil, deconnecter } = useSession();
  const [fuites, setFuites] = useState<VFuite[]>([]);
  const [nbAttente, setNbAttente] = useState(0);
  const [message, setMessage] = useState('');
  const [rafraichit, setRafraichit] = useState(false);

  const charger = useCallback(async () => {
    if (!marche) return;
    setRafraichit(true);
    setNbAttente((await lireAttente()).length);
    const cle = `suivi-fuites:liste:${marche.id}`;
    const { data, error } = await supabase
      .from('v_fuites')
      .select('id, numero, reference_srm, statut, secteur, adresse, date_detection, nb_photos, alerte_non_reparee, alerte_sans_photo')
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

  return (
    <View style={s.ecran}>
      <View style={[s.contenu, { paddingTop: 48 }]}>
        <Text style={s.titre}>Fuites · {marche?.code}</Text>
        <Text style={s.discret}>{profil?.nom_complet}</Text>
        {marches.length > 1 && (
          <View style={s.ligne}>
            {marches.map((m) => (
              <Pressable
                key={m.id}
                onPress={() => choisirMarche(m.id)}
                style={[s.puce, m.id === marche?.id && s.puceActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: m.id === marche?.id }}
              >
                <Text style={[s.etiquette, m.id === marche?.id && { color: '#fff' }]}>{m.code}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {peut('fuites', 'creer') && <Bouton titre="+ Nouvelle fuite" primaire onPress={nouvelle} />}
        {nbAttente > 0 && <Bouton titre={`${nbAttente} fuite(s) à envoyer`} onPress={attente} />}
        {!!message && <Text style={s.discret}>{message}</Text>}
      </View>
      <FlatList
        data={fuites}
        keyExtractor={(f) => f.id}
        refreshing={rafraichit}
        onRefresh={charger}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 24 }}
        ListEmptyComponent={<Text style={s.discret}>Aucune fuite.</Text>}
        renderItem={({ item: f }) => (
          <Carte>
            <Text style={s.sousTitre}>N° {f.numero}{f.reference_srm ? ` · ${f.reference_srm}` : ''}</Text>
            <Text>{STATUTS[f.statut]}{f.secteur ? ` · ${f.secteur}` : ''}</Text>
            {!!f.adresse && <Text style={s.discret}>{f.adresse}</Text>}
            <Text style={s.discret}>{dateHeure(f.date_detection)} · {f.nb_photos} photo(s)</Text>
            {f.alerte_non_reparee && (
              <Text style={{ color: COULEURS.danger, fontWeight: '700' }}>
                Non réparée depuis plus de {marche?.delai_alerte_reparation_h ?? 48} h
              </Text>
            )}
          </Carte>
        )}
      />
      <View style={[s.contenu, { paddingTop: 0 }]}>
        <Bouton titre="Quitter" onPress={deconnecter} />
      </View>
    </View>
  );
}

export function NouvelleFuite({ retour }: { retour: () => void }) {
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

  async function prendrePhoto() {
    const droit = await ImagePicker.requestCameraPermissionsAsync();
    if (!droit.granted) {
      setErreur('Appareil photo refusé : autorisez-le dans les réglages de la tablette.');
      return;
    }
    // exif et galerie : la photo n'est jamais enregistrée dans la galerie (CLAUDE.md § 7).
    const r = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    const echelle = Math.min(1, 1600 / Math.max(a.width, a.height));
    const reduite = await ImageManipulator.manipulateAsync(
      a.uri,
      echelle < 1 ? [{ resize: { width: Math.round(a.width * echelle), height: Math.round(a.height * echelle) } }] : [],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    const id = Crypto.randomUUID();
    const fichier = await garderPhoto(reduite.uri, id);
    const info = await FileSystem.getInfoAsync(fichier);
    const taille = info.exists ? info.size : 0;
    setPhotos((p) => [...p, { id, fichier, largeur: reduite.width, hauteur: reduite.height, taille, prise_le: new Date().toISOString() }]);
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
        },
      });
      setEnvoi('Envoi…');
      await synchroniser();
      retour();
    } catch (e) {
      setErreur(String((e as Error).message ?? e));
      setEnvoi('');
    }
  }

  return (
    <ScrollView style={s.ecran} contentContainerStyle={[s.contenu, { paddingTop: 48 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.titre}>Nouvelle fuite</Text>
      <Carte>
        <Text style={s.sousTitre}>Position</Text>
        {position ? (
          <Text>{position.lat.toFixed(6)}, {position.lon.toFixed(6)} (± {Math.round(position.precision)} m)</Text>
        ) : <Text style={s.discret}>{gps}</Text>}
        <Bouton titre="Actualiser la position" onPress={localiser} />
      </Carte>
      <Carte>
        <Text style={s.etiquette}>{libelleReference}</Text>
        <TextInput
          style={s.champ}
          value={reference}
          onChangeText={(t) => setReference(formaterReference(t, masque))}
          keyboardType={masque ? 'number-pad' : 'default'}
          placeholder={masque ? masque.replace(/9/g, '0') : undefined}
          maxLength={masque ? masque.length : undefined}
        />
        <Text style={s.etiquette}>Secteur</Text>
        <Bouton titre={secteurs.find((x) => x.id === secteurId)?.libelle ?? '— Choisir —'} onPress={() => setChoixSecteur(true)} />
        <Text style={s.etiquette}>Adresse / repère</Text>
        <TextInput style={s.champ} value={adresse} onChangeText={setAdresse} />
        <Text style={s.etiquette}>Observation</Text>
        <TextInput style={[s.champ, { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]} value={observation} onChangeText={setObservation} multiline />
      </Carte>
      <Carte>
        <Text style={s.sousTitre}>Photos ({photos.length})</Text>
        <Bouton titre="Prendre une photo" onPress={prendrePhoto} />
        <View style={s.ligne}>
          {photos.map((p) => (
            <Pressable key={p.id} onPress={() => setPhotos(photos.filter((x) => x.id !== p.id))}>
              <Image source={{ uri: p.fichier }} style={{ width: 96, height: 96, borderRadius: 8 }} />
              <Text style={s.discret}>Retirer</Text>
            </Pressable>
          ))}
        </View>
      </Carte>
      {!!erreur && <Text style={s.erreur}>{erreur}</Text>}
      <Bouton titre={envoi || 'Enregistrer la fuite'} primaire onPress={enregistrer} occupe={!!envoi} />
      <Bouton titre="Annuler" onPress={retour} desactive={!!envoi} />

      <Modal visible={choixSecteur} animationType="slide" onRequestClose={() => setChoixSecteur(false)}>
        <View style={[s.ecran, { paddingTop: 48 }]}>
          <FlatList
            data={[{ id: '', libelle: '— Aucun —' } as Secteur, ...secteurs]}
            keyExtractor={(x) => x.id || 'aucun'}
            contentContainerStyle={{ padding: 16, gap: 8 }}
            renderItem={({ item }) => (
              <Pressable
                style={[s.puce, item.id === secteurId && s.puceActive]}
                onPress={() => {
                  setSecteurId(item.id);
                  setChoixSecteur(false);
                }}
              >
                <Text style={{ fontSize: 18, color: item.id === secteurId ? '#fff' : '#12222d' }}>{item.libelle}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

export function EnAttente({ retour }: { retour: () => void }) {
  const [liste, setListe] = useState<FuiteAttente[]>([]);
  const [message, setMessage] = useState('');
  const [occupe, setOccupe] = useState(false);
  const charger = useCallback(async () => setListe(await lireAttente()), []);
  useEffect(() => {
    charger();
  }, [charger]);

  async function envoyer() {
    setOccupe(true);
    const restantes = await synchroniser();
    setMessage(restantes === 0 ? 'Tout est envoyé.' : `${restantes} envoi(s) restent à traiter.`);
    setOccupe(false);
    charger();
  }

  return (
    <ScrollView style={s.ecran} contentContainerStyle={[s.contenu, { paddingTop: 48 }]}>
      <Text style={s.titre}>Envois en attente</Text>
      <Text style={s.discret}>Ces fuites sont gardées sur la tablette. Elles partent dès que le réseau revient ; ne désinstallez pas l&apos;application avant.</Text>
      <Bouton titre="Envoyer maintenant" primaire onPress={envoyer} occupe={occupe} desactive={liste.length === 0} />
      {!!message && <Text style={s.info}>{message}</Text>}
      {liste.map((f) => (
        <Carte key={f.id}>
          <Text style={s.sousTitre}>{(f.ligne.reference_srm as string) || (f.ligne.adresse as string) || 'Fuite sans référence'}</Text>
          <Text style={s.discret}>{dateHeure(f.creee_le)} · {f.photos.length} photo(s) en attente</Text>
          {!!f.erreur && <Text style={s.erreur}>Refusée par le serveur : {f.erreur}</Text>}
          <Bouton titre="Supprimer de la tablette" onPress={async () => { await abandonner(f.id); charger(); }} />
        </Carte>
      ))}
      <Bouton titre="Retour" onPress={retour} />
    </ScrollView>
  );
}

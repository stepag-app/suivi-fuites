import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, AppState, FlatList, Modal, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dateHeure } from './fiche';
import {
  abandonner, dependants, effacerPhotos, estFuite, lireAttente, mettreEnAttente, surChangement, synchroniser,
  type Envoi, type EnvoiFuite, type PhotoAttente,
} from './file-attente';
import { Icone } from './icones';
import { prendrePhoto as photoCamera } from './photos';
import { useSession } from './session';
import { emailDepuisIdentifiant, supabase } from './supabase';
import type { Proche, Secteur, StatutFuite, VFuite } from './types';
import {
  Alerte, Badge, BarreApp, Bouton, BoutonBarre, BoutonYAller, Carte, COULEURS, LARGEUR_LARGE, Message, ORDRE_STATUTS, pluriel,
  POLICE, s, Saisie, Segments, Selecteur, Statut, STATUT_STYLE, TeteCarte, useBas, Vide, Vignettes,
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
  const large = useWindowDimensions().width >= LARGEUR_LARGE;
  const haut = useSafeAreaInsets().top || (StatusBar.currentHeight ?? 24);

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

  // Écran de connexion du panneau : volet noir « Bonjour » à gauche sur tablette en paysage, formulaire à droite.
  return (
    <View style={[s.ecran, l.connexion, { paddingTop: haut }]}>
      {large && (
        <View style={l.volet}>
          <Icone nom="droplets" taille={48} couleur={COULEURS.principalTexte} />
          <Text style={l.bonjour}>Bonjour</Text>
          <Text style={l.sousBonjour}>Connectez-vous pour continuer</Text>
        </View>
      )}
      <ScrollView style={{ flex: 2 }} contentContainerStyle={l.formulaire} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 440, gap: 28 }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            {!large && (
              <View style={[s.ligneTitre, { marginBottom: 8 }]}>
                <Icone nom="droplets" taille={24} couleur={COULEURS.marque} />
                <Text style={s.texteFort}>Suivi des fuites</Text>
              </View>
            )}
            <Text style={l.titreConnexion}>Connexion</Text>
            <Text style={[s.discret, { textAlign: 'center' }]}>
              Entrez l&apos;identifiant et le mot de passe remis par l&apos;administrateur.
            </Text>
          </View>
          <View style={{ gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={s.etiquette}>Identifiant</Text>
              <Saisie value={identifiant} onChangeText={setIdentifiant} autoCapitalize="none" autoCorrect={false} placeholder="ex. agent1" />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={s.etiquette}>Mot de passe</Text>
              <Saisie value={motDePasse} onChangeText={setMotDePasse} secureTextEntry autoCapitalize="none" />
              <Text style={s.petit}>La session reste ouverte sur cette tablette jusqu&apos;à « Quitter ».</Text>
            </View>
            {!!erreur && <Message ton="erreur">{erreur}</Message>}
            <Bouton
              titre={occupe ? 'Connexion…' : 'Se connecter'} primaire grand onPress={entrer} occupe={occupe}
              desactive={!identifiant || !motDePasse}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

type Onglet = 'toutes' | StatutFuite;
const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Colonnes du tableau (tablette en paysage) : mêmes rubriques que la liste du panneau.
const COL = {
  numero: { width: 56 }, reference: { width: 150 }, lieu: { flex: 1.3 }, date: { width: 168 }, statut: { width: 150 },
  alertes: { flex: 1 }, photos: { width: 64 }, aller: { width: 150 },
};
// Sans geste de l'agent, la liste suit les fuites des autres équipes à ce rythme (tirer la liste : tout de suite).
const MISE_A_JOUR_MS = 5 * 60 * 1000;
// Le fetch de React Native n'a pas de délai : passé celui-ci, connexion tenue pour bloquée, dernière liste connue.
const DELAI_LISTE_MS = 20000;
const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function Liste({ nouvelle, attente, balayage, ouvrir }: {
  nouvelle: () => void; attente: () => void; balayage: () => void; ouvrir: (id: string) => void;
}) {
  const { marche, marches, choisirMarche, peut, profil, deconnecter } = useSession();
  const [fuites, setFuites] = useState<VFuite[]>([]);
  const [envois, setEnvois] = useState<Envoi[]>([]);
  const [message, setMessage] = useState('');
  const [rafraichit, setRafraichit] = useState(true);
  const [onglet, setOnglet] = useState<Onglet>('toutes');
  const [texte, setTexte] = useState('');
  const large = useWindowDimensions().width >= LARGEUR_LARGE;
  const bas = useBas();
  const derniere = useRef('');

  // `discret` : rechargement de fond, sans le rond de rafraîchissement (réservé à l'arrivée sur la liste et au geste
  // de l'agent) et sans rien redessiner si rien n'a changé.
  const charger = useCallback(async (discret = false) => {
    if (!marche) return;
    if (!discret) setRafraichit(true);
    const controleur = new AbortController();
    const delai = setTimeout(() => controleur.abort(), DELAI_LISTE_MS);
    try {
      const attente = await lireAttente();
      setEnvois((avant) => (memes(avant, attente) ? avant : attente));
      const cle = `suivi-fuites:liste:${marche.id}`;
      const { data, error } = await supabase
        .from('v_fuites')
        .select('id, numero, reference_srm, statut, secteur, adresse, date_detection, nb_photos, alerte_non_reparee, alerte_sans_photo, latitude, longitude')
        .eq('marche_id', marche.id)
        .order('date_detection', { ascending: false })
        .limit(200)
        .abortSignal(controleur.signal);
      if (error || !data) {
        const copie = await AsyncStorage.getItem(cle);
        if (copie && copie !== derniere.current) {
          derniere.current = copie;
          setFuites(JSON.parse(copie));
        }
        setMessage('Hors ligne : dernière liste connue.');
      } else {
        const contenu = JSON.stringify(data);
        if (contenu !== derniere.current) {
          derniere.current = contenu;
          setFuites(data as VFuite[]);
          AsyncStorage.setItem(cle, contenu).catch(() => undefined);
        }
        setMessage('');
      }
    } finally {
      clearTimeout(delai);
      setRafraichit(false);
    }
  }, [marche]);

  useEffect(() => {
    charger();
  }, [charger]);
  // Après une synchro qui a changé la file : compteur à jour, et la liste suit les statuts recalculés par le serveur.
  useEffect(() => surChangement(() => void charger(true)), [charger]);
  // Mise à jour de fond : toutes les 5 min et au retour sur l'application.
  useEffect(() => {
    const minuteur = setInterval(() => void charger(true), MISE_A_JOUR_MS);
    const abonnement = AppState.addEventListener('change', (e) => e === 'active' && void charger(true));
    return () => {
      clearInterval(minuteur);
      abonnement.remove();
    };
  }, [charger]);
  // Autre marché : on repart de toutes ses fuites.
  useEffect(() => {
    setOnglet('toutes');
    setTexte('');
  }, [marche?.id]);

  // Fuites saisies sur la tablette et pas encore arrivées au serveur : en tête, ouvrables.
  const locales = envois.filter((e): e is EnvoiFuite => estFuite(e) && e.marche_id === marche?.id && !fuites.some((f) => f.id === e.id));
  const total = fuites.length + locales.length;
  const nbAttente = envois.length;
  const delai = marche?.delai_alerte_reparation_h ?? 48;
  const libelleReference = marche?.libelle_reference || 'Référence client';

  // Recherche du panneau : N° exact, référence (aussi par ses chiffres), adresse.
  const correspond = useMemo(() => {
    const t = sansAccents(texte.trim());
    const chiffres = t.replace(/\D/g, '');
    return (numero: number | null, reference: string | null, adresse: string | null) => !t ||
      (numero != null && String(numero) === t) ||
      sansAccents(reference ?? '').includes(t) ||
      (chiffres.length >= 3 && (reference ?? '').replace(/\D/g, '').includes(chiffres)) ||
      sansAccents(adresse ?? '').includes(t);
  }, [texte]);
  const compteurs = useMemo(() => {
    const c: Partial<Record<StatutFuite, number>> = {};
    fuites.forEach((f) => (c[f.statut] = (c[f.statut] ?? 0) + 1));
    return c;
  }, [fuites]);
  const affichees = fuites.filter((f) => (onglet === 'toutes' || f.statut === onglet) && correspond(f.numero, f.reference_srm, f.adresse));
  // Une fuite pas encore envoyée sera « détectée » : elle reste sous « Toutes » et « Détectée ».
  const localesAffichees = onglet === 'toutes' || onglet === 'detectee'
    ? locales.filter((e) => correspond(null, (e.ligne.reference_srm as string) ?? null, (e.ligne.adresse as string) ?? null))
    : [];
  const onglets: { cle: Onglet; libelle: string; nb: number }[] = [
    { cle: 'toutes', libelle: 'Toutes', nb: total },
    ...ORDRE_STATUTS.map((st) => ({
      cle: st, libelle: STATUT_STYLE[st].court, nb: (compteurs[st] ?? 0) + (st === 'detectee' ? locales.length : 0),
    })),
  ];
  const filtre = onglet !== 'toutes' || !!texte.trim();
  // Premier chargement (ou retour depuis une fiche) : « Chargement… » plutôt que « Aucune fuite ».
  const enChargement = rafraichit && total === 0;

  return (
    <View style={s.ecran}>
      <BarreApp
        titre="Suivi des fuites"
        sousTitre={profil?.nom_complet}
        droite={(
          <>
            {large && marches.length > 1 && (
              <Segments options={marches.map((m) => ({ valeur: m.id, libelle: m.code }))} valeur={marche?.id ?? ''} onChange={choisirMarche} />
            )}
            <BoutonBarre titre="Quitter" icone="log-out" onPress={deconnecter} />
          </>
        )}
      />
      <View style={l.page}>
        {!large && marches.length > 1 && (
          <Segments options={marches.map((m) => ({ valeur: m.id, libelle: m.code }))} valeur={marche?.id ?? ''} onChange={choisirMarche} />
        )}
        <View style={l.tetePage}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 240, gap: 2 }}>
            <Text style={s.h1}>Fuites</Text>
            <Text style={s.discret}>
              {enChargement ? 'Chargement…' : filtre ? `${pluriel(affichees.length + localesAffichees.length, 'affichée')} sur ${total}` : pluriel(total, 'fuite')}
              {marche ? ` · ${marche.code}` : ''}
            </Text>
          </View>
          <View style={[s.ligne, { alignItems: 'center' }]}>
            {nbAttente > 0 && <Bouton titre="Envois en attente" icone="cloud-upload" compteur={nbAttente} onPress={attente} />}
            {peut('balayage', 'lire') && <Bouton titre="Balayage" icone="map" onPress={balayage} />}
            {peut('fuites', 'creer') && <Bouton titre="Nouvelle fuite" icone="plus" primaire onPress={nouvelle} />}
          </View>
        </View>
        {!!message && <Message ton="attention" icone="wifi-off">{message}</Message>}

        <View style={l.onglets}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }}>
            {onglets.map((o) => {
              const actif = o.cle === onglet;
              return (
                <Pressable
                  key={o.cle}
                  onPress={() => setOnglet(o.cle)}
                  style={[l.onglet, actif && l.ongletActif]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: actif }}
                >
                  {o.cle !== 'toutes' && <View style={[s.point, { backgroundColor: STATUT_STYLE[o.cle].point }]} />}
                  <Text style={[l.texteOnglet, actif && { color: COULEURS.texte }]}>{o.libelle}</Text>
                  <Text style={s.nb}>{o.nb}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={[l.boite, { marginBottom: 16 + bas }]}>
          <View style={l.outils}>
            <View style={[l.recherche, large && { width: 400 }]}>
              <Icone nom="search" taille={18} couleur={COULEURS.discret} />
              <Saisie
                style={l.champRecherche}
                value={texte}
                onChangeText={setTexte}
                placeholder="N°, référence ou adresse"
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel="Rechercher une fuite"
              />
              {!!texte && (
                <Pressable onPress={() => setTexte('')} style={l.effacer} accessibilityRole="button" accessibilityLabel="Effacer la recherche">
                  <Icone nom="x" taille={18} couleur={COULEURS.discret} />
                </Pressable>
              )}
            </View>
          </View>
          {large && (
            <View style={[l.ligneTableau, l.enTete]}>
              <Text style={[l.titreColonne, COL.numero]}>N°</Text>
              <Text style={[l.titreColonne, COL.reference]} numberOfLines={2}>{libelleReference}</Text>
              <Text style={[l.titreColonne, COL.lieu]}>Secteur · adresse</Text>
              <Text style={[l.titreColonne, COL.date]}>Détectée le</Text>
              <Text style={[l.titreColonne, COL.statut]}>Statut</Text>
              <Text style={[l.titreColonne, COL.alertes]}>Alertes</Text>
              <Text style={[l.titreColonne, COL.photos, { textAlign: 'right' }]}>Photos</Text>
              <View style={[COL.aller, { marginRight: 32 }]} />
            </View>
          )}
          <FlatList
            data={affichees}
            keyExtractor={(f) => f.id}
            refreshing={rafraichit}
            onRefresh={charger}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={Separation}
            contentContainerStyle={{ paddingBottom: 8 }}
            ListEmptyComponent={localesAffichees.length ? null : enChargement ? (
              <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={COULEURS.principal} />
                <Text style={s.discret}>Chargement des fuites…</Text>
              </View>
            ) : (
              <View style={{ padding: 16 }}><Vide texte={filtre ? 'Aucune fuite ne correspond.' : 'Aucune fuite.'} /></View>
            )}
            ListHeaderComponent={localesAffichees.length ? (
              <View>
                {localesAffichees.map((e) => (
                  <View key={e.id}>
                    <Pressable
                      onPress={() => ouvrir(e.id)}
                      accessibilityRole="button"
                      style={({ pressed }) => [large ? l.ligneTableau : l.ligneEmpilee, l.ligneLocale, pressed && s.appuye]}
                    >
                      {large ? (
                        <>
                          <Text style={[s.discret, COL.numero]}>—</Text>
                          <Text style={[s.texte, COL.reference]} numberOfLines={1}>{String(e.ligne.reference_srm ?? '—')}</Text>
                          <Text style={[s.texte, COL.lieu]} numberOfLines={2}>{String(e.ligne.adresse ?? '—')}</Text>
                          <Text style={[s.texte, COL.date]}>{dateHeure(e.creee_le)}</Text>
                          <View style={COL.statut}><Badge texte="À envoyer" ton="orange" icone="clock" /></View>
                          <Text style={[s.petit, COL.alertes]} numberOfLines={2}>Gardée sur la tablette</Text>
                          <Photos nb={e.photos.length} />
                          <View style={COL.aller} />
                        </>
                      ) : (
                        <View style={{ flex: 1, gap: 6 }}>
                          <View style={l.entreDeux}>
                            <Text style={s.texteFort} numberOfLines={1}>{String(e.ligne.reference_srm ?? 'Nouvelle fuite')}</Text>
                            <Badge texte="À envoyer" ton="orange" icone="clock" />
                          </View>
                          {!!e.ligne.adresse && <Text style={s.texte}>{String(e.ligne.adresse)}</Text>}
                          <Text style={s.petit}>{dateHeure(e.creee_le)} · gardée sur la tablette</Text>
                        </View>
                      )}
                      <Icone nom="chevron-right" couleur={COULEURS.discret} />
                    </Pressable>
                    <Separation />
                  </View>
                ))}
              </View>
            ) : null}
            renderItem={({ item: f }) => (
              <Pressable
                onPress={() => ouvrir(f.id)}
                accessibilityRole="button"
                accessibilityLabel={`Fuite N° ${f.numero}`}
                style={({ pressed }) => [large ? l.ligneTableau : l.ligneEmpilee, pressed && s.appuye]}
              >
                {large ? (
                  <>
                    <Text style={[s.texteFort, COL.numero]}>{f.numero}</Text>
                    <Text style={[s.texte, COL.reference]} numberOfLines={1}>{f.reference_srm ?? '—'}</Text>
                    <View style={COL.lieu}>
                      <Text style={s.texte} numberOfLines={1}>{f.secteur ?? 'Secteur non renseigné'}</Text>
                      {!!f.adresse && <Text style={s.petit} numberOfLines={1}>{f.adresse}</Text>}
                    </View>
                    <Text style={[s.texte, COL.date]}>{dateHeure(f.date_detection)}</Text>
                    <View style={COL.statut}><Statut statut={f.statut} court /></View>
                    <View style={COL.alertes}>
                      {f.alerte_non_reparee ? <Alerte texte={`Non réparée > ${delai} h`} /> : <Text style={s.discret}>—</Text>}
                    </View>
                    <Photos nb={f.nb_photos} />
                    <View style={[COL.aller, { alignItems: 'flex-end' }]}>
                      {f.latitude != null && f.longitude != null && (
                        <BoutonYAller latitude={f.latitude} longitude={f.longitude} libelle={`Fuite N° ${f.numero}`} />
                      )}
                    </View>
                  </>
                ) : (
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={l.entreDeux}>
                      <Text style={[s.texteFort, { flexShrink: 1 }]} numberOfLines={1}>
                        N° {f.numero}{f.reference_srm ? <Text style={s.discret}> · {f.reference_srm}</Text> : null}
                      </Text>
                      <Statut statut={f.statut} court />
                    </View>
                    <Text style={s.texte}>
                      {f.secteur ?? 'Secteur non renseigné'}{f.adresse ? <Text style={s.discret}> · {f.adresse}</Text> : null}
                    </Text>
                    <View style={[s.ligneTitre, { gap: 6 }]}>
                      <Text style={s.petit}>{dateHeure(f.date_detection)}</Text>
                      <Icone nom="camera" taille={15} couleur={COULEURS.discret} />
                      <Text style={s.petit}>{f.nb_photos}</Text>
                    </View>
                    {f.alerte_non_reparee && <Alerte texte={`Non réparée > ${delai} h`} />}
                    {f.latitude != null && f.longitude != null && (
                      <BoutonYAller latitude={f.latitude} longitude={f.longitude} libelle={`Fuite N° ${f.numero}`} style={{ alignSelf: 'flex-start' }} />
                    )}
                  </View>
                )}
                <Icone nom="chevron-right" couleur={COULEURS.discret} />
              </Pressable>
            )}
          />
        </View>
      </View>
    </View>
  );
}

const Separation = () => <View style={l.separation} />;

function Photos({ nb }: { nb: number }) {
  return (
    <View style={[COL.photos, l.photos]}>
      <Icone nom="camera" taille={16} couleur={COULEURS.discret} />
      <Text style={s.discret}>{nb}</Text>
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
  const bas = useBas();
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
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]} keyboardShouldPersistTaps="handled">
        <Carte>
          <TeteCarte
            titre="Position" icone="map-pin"
            action={<Bouton titre="Actualiser la position" icone="locate-fixed" onPress={localiser} />}
          />
          {position ? (
            <Text style={s.texte}>{position.lat.toFixed(6)}, {position.lon.toFixed(6)} (± {Math.round(position.precision)} m)</Text>
          ) : <Text style={s.discret}>{gps}</Text>}
        </Carte>
        {controle === 'hors_ligne' && (
          <Message ton="attention" icone="wifi-off">
            Sans réseau : pas de contrôle des doublons. Vérifiez sur place qu&apos;elle n&apos;est pas déjà signalée.
          </Message>
        )}
        {proches.length > 0 && (
          <Carte>
            <TeteCarte titre="Fuite déjà signalée ici ?" icone="triangle-alert" />
            {proches.map((p) => (
              <View key={p.id} style={s.separateur}>
                <View style={[s.ligne, { alignItems: 'center' }]}>
                  <Text style={s.texteFort}>N° {p.numero}</Text>
                  <Statut statut={p.statut} court />
                  <Text style={s.discret}>
                    {dateHeure(p.date_detection)}
                    {p.meme_reference ? ' · même référence' : ''}
                    {p.distance_m != null ? ` · à ${Math.round(p.distance_m)} m` : ''}
                  </Text>
                </View>
                <View style={s.ligne}>
                  <Bouton titre="C'est la même fuite" icone="check" onPress={() => memeFuite(p.id)} style={{ flexGrow: 1, flexBasis: 200 }} />
                  <Bouton
                    titre="Nouvelle fuite liée"
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
                ? `Elle sera enregistrée comme nouvelle fuite liée au N° ${proches.find((p) => p.id === lierA)?.numero ?? ''}.`
                : 'Sans choix, elle sera enregistrée comme une nouvelle fuite indépendante.'}
            </Text>
          </Carte>
        )}
        <Carte>
          <TeteCarte titre="Identification" />
          <View style={{ gap: 6 }}>
            <Text style={s.etiquette}>{libelleReference}</Text>
            <Saisie
              value={reference}
              onChangeText={(t) => setReference(formaterReference(t, masque))}
              keyboardType={masque ? 'number-pad' : 'default'}
              placeholder={masque ? masque.replace(/9/g, '0') : undefined}
              maxLength={masque ? masque.length : undefined}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={s.etiquette}>Secteur</Text>
            <Selecteur valeur={secteurs.find((x) => x.id === secteurId)?.libelle} indication="Choisir le secteur" onPress={() => setChoixSecteur(true)} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={s.etiquette}>Adresse / repère</Text>
            <Saisie value={adresse} onChangeText={setAdresse} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={s.etiquette}>Observation</Text>
            <Saisie style={s.multiligne} value={observation} onChangeText={setObservation} multiline />
          </View>
        </Carte>
        <Carte>
          <TeteCarte
            titre="Photos" compteur={photos.length}
            action={<Bouton titre="Prendre une photo" icone="camera" onPress={prendrePhoto} />}
          />
          {!photos.length && <Text style={s.discret}>Facultatives ; un appui sur une photo la retire.</Text>}
          <Vignettes photos={photos.map((p) => ({ id: p.id, uri: p.fichier, legende: 'Détection' }))} retirer={retirerPhoto} />
        </Carte>
        {!!erreur && <Message ton="erreur">{erreur}</Message>}
        <Bouton titre={envoi || 'Enregistrer la fuite'} primaire grand onPress={enregistrer} occupe={!!envoi} />
        <Bouton titre="Annuler" onPress={retour} desactive={!!envoi} />
      </ScrollView>

      <Modal visible={choixSecteur} animationType="slide" statusBarTranslucent onRequestClose={() => setChoixSecteur(false)}>
        <View style={s.ecran}>
          <BarreApp titre="Choisir le secteur" sousTitre={pluriel(secteurs.length, 'secteur')} retour={() => setChoixSecteur(false)} />
          <FlatList
            data={[{ id: '', libelle: 'Aucun' } as Secteur, ...secteurs]}
            keyExtractor={(x) => x.id || 'aucun'}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 + bas, width: '100%', maxWidth: 920, alignSelf: 'center' }}
            ItemSeparatorComponent={Separation}
            renderItem={({ item }) => {
              const actif = item.id === secteurId;
              return (
                <Pressable
                  style={({ pressed }) => [l.choix, actif && { backgroundColor: COULEURS.sourdine }, pressed && s.appuye]}
                  onPress={() => {
                    setSecteurId(item.id);
                    setChoixSecteur(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actif }}
                >
                  <Text style={[s.texte, { flex: 1, fontSize: 18 }, !item.id && { color: COULEURS.discret }, actif && { fontWeight: '600' }]}>
                    {item.libelle}
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
  const bas = useBas();
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
      <BarreApp titre="Envois en attente" sousTitre={`${pluriel(liste.length, 'saisie')} sur la tablette`} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]}>
        <Text style={s.discret}>
          Ces saisies sont gardées sur la tablette. Elles partent dans l&apos;ordre dès que le réseau revient ;
          ne désinstallez pas l&apos;application avant.
        </Text>
        <Bouton titre="Envoyer maintenant" icone="cloud-upload" primaire grand onPress={envoyer} occupe={occupe} desactive={liste.length === 0} />
        {!!message && <Message ton={message === 'Tout est envoyé.' ? 'info' : 'attention'}>{message}</Message>}
        {liste.length === 0 && <Vide texte="Aucune saisie en attente." />}
        {liste.map((e) => (
          <Carte key={e.id}>
            <View style={[s.ligne, { alignItems: 'center', flexWrap: 'nowrap' }]}>
              <View style={l.icone}><Icone nom="cloud-upload" taille={18} couleur={COULEURS.discret} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.texteFort}>{titreEnvoi(e)}</Text>
                <Text style={s.discret}>Saisie le {dateHeure(e.creee_le)} · {e.photos.length} photo(s) en attente</Text>
              </View>
            </View>
            {!!e.erreur && <Message ton="erreur">Refusée par le serveur : {e.erreur}</Message>}
            <Bouton titre="Supprimer de la tablette" icone="trash" danger onPress={() => supprimer(e)} style={{ alignSelf: 'flex-start' }} />
          </Carte>
        ))}
        <Bouton titre="Retour" icone="arrow-left" onPress={retour} />
      </ScrollView>
    </View>
  );
}

const l = StyleSheet.create({
  connexion: { flexDirection: 'row' },
  volet: { flex: 1, backgroundColor: COULEURS.principal, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40 },
  bonjour: { fontFamily: POLICE, fontSize: 44, fontWeight: '400', color: COULEURS.principalTexte, letterSpacing: -0.5 },
  sousBonjour: { fontFamily: POLICE, fontSize: 19, color: 'rgba(250, 250, 250, 0.8)', textAlign: 'center' },
  formulaire: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  titreConnexion: { fontFamily: POLICE, fontSize: 24, fontWeight: '600', color: COULEURS.texte, letterSpacing: -0.3 },
  page: { flex: 1, paddingHorizontal: 20, paddingTop: 18, gap: 14 },
  tetePage: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 },
  onglets: { borderBottomWidth: 1, borderColor: COULEURS.bord },
  onglet: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12,
    borderBottomWidth: 2, borderColor: 'transparent', marginBottom: -1,
  },
  ongletActif: { borderColor: COULEURS.texte },
  texteOnglet: { fontFamily: POLICE, fontSize: 16, fontWeight: '500', color: COULEURS.discret },
  boite: { flex: 1, borderWidth: 1, borderColor: COULEURS.bord, borderRadius: 14, overflow: 'hidden', marginBottom: 16 },
  outils: { padding: 12, borderBottomWidth: 1, borderColor: COULEURS.bord },
  recherche: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COULEURS.bord, borderRadius: 10,
    paddingLeft: 12, minHeight: 50,
  },
  champRecherche: { flex: 1, borderWidth: 0, minHeight: 48, paddingHorizontal: 0 },
  effacer: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  ligneTableau: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 72 },
  enTete: { minHeight: 44, borderBottomWidth: 1, borderColor: COULEURS.bord },
  titreColonne: { fontFamily: POLICE, fontSize: 14, fontWeight: '500', color: COULEURS.discret },
  ligneEmpilee: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  ligneLocale: { backgroundColor: '#fffbeb' },
  entreDeux: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  photos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  separation: { height: 1, backgroundColor: COULEURS.bord },
  choix: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20 },
  icone: {
    width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: COULEURS.bord,
    alignItems: 'center', justifyContent: 'center',
  },
});

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Alert, AppState, FlatList, Pressable, ScrollView, StatusBar, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { compterAValider } from './a-valider';
import { dateHeure } from './fiche';
import {
  abandonner, dependants, estFuite, lireAttente, surChangement, synchroniser, type Envoi, type EnvoiFuite,
} from './file-attente';
import { Icone } from './icones';
import { t, tx, useLangue } from './langue';
import { chargerListe } from './liste-donnees';
import { useSession } from './session';
import type { EtatSuivi } from './suivi-gps';
import { emailDepuisIdentifiant, supabase } from './supabase';
import type { StatutFuite, VFuite } from './types';
import {
  Alerte, Badge, BarreApp, Bouton, BoutonBarre, BoutonLangue, BoutonYAller, Carte, COULEURS, LARGEUR_LARGE, Message, ORDRE_STATUTS, pluriel,
  POLICE, s, Saisie, Segments, Statut, STATUT_STYLE, useBas, Vide,
} from './ui';
export function Connexion() {
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const large = useWindowDimensions().width >= LARGEUR_LARGE;
  const haut = useSafeAreaInsets().top || (StatusBar.currentHeight ?? 24);
  useLangue();

  async function entrer() {
    setOccupe(true);
    setErreur('');
    const { error } = await supabase.auth.signInWithPassword({
      email: emailDepuisIdentifiant(identifiant),
      password: motDePasse,
    });
    if (error) setErreur(/invalid login/i.test(error.message) ? t('Identifiant ou mot de passe incorrect.') : t('Connexion impossible : vérifiez le réseau.'));
    setOccupe(false);
  }

  // Écran de connexion du panneau : volet noir « Bonjour » à gauche sur tablette en paysage, formulaire à droite.
  return (
    <View style={[s.ecran, l.connexion, { paddingTop: haut }]}>
      {large && (
        <View style={l.volet}>
          <Icone nom="droplets" taille={48} couleur={COULEURS.principalTexte} />
          <Text style={l.bonjour}>{t('Bonjour')}</Text>
          <Text style={l.sousBonjour}>{t('Connectez-vous pour continuer')}</Text>
        </View>
      )}
      <BoutonLangue style={[l.langueConnexion, { top: haut + 12 }]} />
      <ScrollView style={{ flex: 2 }} contentContainerStyle={l.formulaire} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: 440, gap: 28 }}>
          <View style={{ alignItems: 'center', gap: 10 }}>
            {!large && (
              <View style={[s.ligneTitre, { marginBottom: 8 }]}>
                <Icone nom="droplets" taille={24} couleur={COULEURS.marque} />
                <Text style={s.texteFort}>{t('Suivi des fuites')}</Text>
              </View>
            )}
            <Text style={l.titreConnexion}>{t('Connexion')}</Text>
            <Text style={[s.discret, { textAlign: 'center' }]}>
              {t("Entrez l'identifiant et le mot de passe remis par l'administrateur.")}
            </Text>
          </View>
          <View style={{ gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text style={s.etiquette}>{t('Identifiant')}</Text>
              <Saisie value={identifiant} onChangeText={setIdentifiant} autoCapitalize="none" autoCorrect={false} placeholder={t('ex. agent1')} />
            </View>
            <View style={{ gap: 6 }}>
              <Text style={s.etiquette}>{t('Mot de passe')}</Text>
              <Saisie value={motDePasse} onChangeText={setMotDePasse} secureTextEntry autoCapitalize="none" />
              <Text style={s.petit}>{t("La session reste ouverte sur cette tablette jusqu'à « Quitter ».")}</Text>
            </View>
            {!!erreur && <Message ton="erreur">{erreur}</Message>}
            <Bouton
              titre={occupe ? t('Connexion…') : t('Se connecter')} primaire grand onPress={entrer} occupe={occupe}
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
// Passé ce délai (jeton attendu par supabase-js compris), connexion tenue pour bloquée : dernière liste connue.
const DELAI_LISTE_MS = 20000;
const memes = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function Liste({ nouvelle, attente, balayage, ouvrir, aValider, notifications, nonLues, miseAJour, suiviGps, suivi }: {
  nouvelle: () => void; attente: () => void; balayage: () => void; ouvrir: (id: string) => void;
  aValider: () => void; notifications: () => void; nonLues: number; miseAJour: ReactNode;
  suiviGps: () => void; suivi: EtatSuivi | null;
}) {
  const { marche, marches, choisirMarche, peut, profil, deconnecter, aRenouveler } = useSession();
  const [fuites, setFuites] = useState<VFuite[]>([]);
  const [envois, setEnvois] = useState<Envoi[]>([]);
  const [message, setMessage] = useState('');
  const [rafraichit, setRafraichit] = useState(true);
  const [onglet, setOnglet] = useState<Onglet>('toutes');
  const [texte, setTexte] = useState('');
  const large = useWindowDimensions().width >= LARGEUR_LARGE;
  const bas = useBas();
  // Liste affichée (marché, JSON) : rien n'est redessiné si elle n'a pas changé.
  const derniere = useRef({ marche: '', contenu: '' });
  const { langue } = useLangue();
  const marcheId = marche?.id;
  // V1 : « À valider (n) » pour qui peut valider au moins une étape (responsable, administrateur).
  const valideur = peut('fuites', 'valider') || peut('interventions', 'valider') || peut('refections', 'valider');
  const [nbAValider, setNbAValider] = useState<number | null>(null);

  // `discret` : rechargement de fond, sans le rond de rafraîchissement (réservé à l'arrivée sur la liste et au geste
  // de l'agent). À l'ouverture et au changement de marché, la copie de la tablette s'affiche d'abord (liste-donnees.ts).
  const charger = useCallback(async (discret = false) => {
    if (!marcheId) return;
    if (!discret) setRafraichit(true);
    const afficher = (contenu: string) => {
      if (derniere.current.marche === marcheId && derniere.current.contenu === contenu) return false;
      derniere.current = { marche: marcheId, contenu };
      setFuites(JSON.parse(contenu) as VFuite[]);
      return true;
    };
    try {
      const attente = await lireAttente();
      setEnvois((avant) => (memes(avant, attente) ? avant : attente));
      const repondu = await chargerListe(marcheId, {
        copie: derniere.current.marche !== marcheId, aRenouveler, delaiMs: DELAI_LISTE_MS, afficher,
      });
      setMessage(repondu ? '' : t('Hors ligne : dernière liste connue.'));
      if (repondu && valideur) setNbAValider(await compterAValider(marcheId).catch(() => null));
    } finally {
      setRafraichit(false);
    }
  }, [marcheId, aRenouveler, valideur]);

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
  const libelleReference = tx(marche?.libelle_reference || 'Référence client');

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
    { cle: 'toutes', libelle: t('Toutes'), nb: total },
    ...ORDRE_STATUTS.map((st) => ({
      cle: st, libelle: tx(STATUT_STYLE[st].court), nb: (compteurs[st] ?? 0) + (st === 'detectee' ? locales.length : 0),
    })),
  ];
  const filtre = onglet !== 'toutes' || !!texte.trim();
  // Premier chargement (ou retour depuis une fiche) : « Chargement… » plutôt que « Aucune fuite ».
  const enChargement = rafraichit && total === 0;

  return (
    <View style={s.ecran}>
      <BarreApp
        titre={t('Suivi des fuites')}
        sousTitre={profil?.nom_complet}
        droite={(
          <>
            {large && marches.length > 1 && (
              <Segments options={marches.map((m) => ({ valeur: m.id, libelle: m.code }))} valeur={marche?.id ?? ''} onChange={choisirMarche} />
            )}
            <Bouton
              titre={large ? t('Notifications') : ''} icone="bell" fantome onPress={notifications}
              compteur={nonLues > 0 ? (nonLues > 9 ? '9+' : nonLues) : undefined}
            />
            <BoutonBarre titre={t('Quitter')} icone="log-out" onPress={deconnecter} />
          </>
        )}
      />
      <View style={l.page}>
        {!large && marches.length > 1 && (
          <Segments options={marches.map((m) => ({ valeur: m.id, libelle: m.code }))} valeur={marche?.id ?? ''} onChange={choisirMarche} />
        )}
        <View style={l.tetePage}>
          <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 240, gap: 2 }}>
            <Text style={s.h1}>{t('Fuites')}</Text>
            <Text style={s.discret}>
              {enChargement
                ? t('Chargement…')
                : filtre
                  ? t('{n} affichées sur {total}', { n: affichees.length + localesAffichees.length, total },
                    `${pluriel(affichees.length + localesAffichees.length, 'affichée')} sur ${total}`)
                  : t('{n} fuites', { n: total }, pluriel(total, 'fuite'))}
              {marche ? ` · ${marche.code}` : ''}
            </Text>
          </View>
          <View style={[s.ligne, { alignItems: 'center' }]}>
            {nbAttente > 0 && <Bouton titre={t('Envois en attente')} icone="cloud-upload" compteur={nbAttente} onPress={attente} />}
            {valideur && <Bouton titre={t('À valider')} icone="clipboard-check" compteur={nbAValider ?? undefined} onPress={aValider} />}
            {peut('balayage', 'lire') && <Bouton titre={t('Balayage')} icone="map" onPress={balayage} />}
            <Bouton titre={t('Suivi GPS')} icone="locate-fixed" onPress={suiviGps} />
            {peut('fuites', 'creer') && <Bouton titre={t('Nouvelle fuite')} icone="plus" primaire onPress={nouvelle} />}
          </View>
        </View>
        {!!message && <Message ton="attention" icone="wifi-off">{message}</Message>}
        {!!suivi && suivi.voulu && !suivi.actif && (
          <Pressable onPress={suiviGps} accessibilityRole="button">
            <Message ton="attention" icone="locate-fixed">{t("Le suivi de position n'est pas actif. Touchez ici pour l'activer.")}</Message>
          </Pressable>
        )}
        {miseAJour}

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
                placeholder={t('N°, référence ou adresse')}
                autoCorrect={false}
                returnKeyType="search"
                accessibilityLabel={t('Rechercher une fuite')}
              />
              {!!texte && (
                <Pressable onPress={() => setTexte('')} style={l.effacer} accessibilityRole="button" accessibilityLabel={t('Effacer la recherche')}>
                  <Icone nom="x" taille={18} couleur={COULEURS.discret} />
                </Pressable>
              )}
            </View>
          </View>
          {large && (
            <View style={[l.ligneTableau, l.enTete]}>
              <Text style={[l.titreColonne, COL.numero]}>{t('N°')}</Text>
              <Text style={[l.titreColonne, COL.reference]} numberOfLines={2}>{libelleReference}</Text>
              <Text style={[l.titreColonne, COL.lieu]}>{t('Secteur · adresse')}</Text>
              <Text style={[l.titreColonne, COL.date]}>{t('Détectée le')}</Text>
              <Text style={[l.titreColonne, COL.statut]}>{t('Statut')}</Text>
              <Text style={[l.titreColonne, COL.alertes]}>{t('Alertes')}</Text>
              <Text style={[l.titreColonne, COL.photos, { textAlign: 'right' }]}>{t('Photos')}</Text>
              <View style={[COL.aller, { marginRight: 32 }]} />
            </View>
          )}
          <FlatList
            data={affichees}
            extraData={langue}
            keyExtractor={(f) => f.id}
            refreshing={rafraichit}
            onRefresh={charger}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={Separation}
            contentContainerStyle={{ paddingBottom: 8 }}
            ListEmptyComponent={localesAffichees.length ? null : enChargement ? (
              <View style={{ padding: 32, alignItems: 'center', gap: 10 }}>
                <ActivityIndicator color={COULEURS.principal} />
                <Text style={s.discret}>{t('Chargement des fuites…')}</Text>
              </View>
            ) : (
              <View style={{ padding: 16 }}><Vide texte={filtre ? t('Aucune fuite ne correspond.') : t('Aucune fuite.')} /></View>
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
                          <View style={COL.statut}><Badge texte={t('À envoyer')} ton="orange" icone="clock" /></View>
                          <Text style={[s.petit, COL.alertes]} numberOfLines={2}>{t('Gardée sur la tablette')}</Text>
                          <Photos nb={e.photos.length} />
                          <View style={COL.aller} />
                        </>
                      ) : (
                        <View style={{ flex: 1, gap: 6 }}>
                          <View style={l.entreDeux}>
                            <Text style={s.texteFort} numberOfLines={1}>{String(e.ligne.reference_srm ?? t('Nouvelle fuite'))}</Text>
                            <Badge texte={t('À envoyer')} ton="orange" icone="clock" />
                          </View>
                          {!!e.ligne.adresse && <Text style={s.texte}>{String(e.ligne.adresse)}</Text>}
                          <Text style={s.petit}>{t('{date} · gardée sur la tablette', { date: dateHeure(e.creee_le) })}</Text>
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
                accessibilityLabel={t('Fuite N° {numero}', { numero: f.numero })}
                style={({ pressed }) => [large ? l.ligneTableau : l.ligneEmpilee, pressed && s.appuye]}
              >
                {large ? (
                  <>
                    <Text style={[s.texteFort, COL.numero]}>{f.numero}</Text>
                    <Text style={[s.texte, COL.reference]} numberOfLines={1}>{f.reference_srm ?? '—'}</Text>
                    <View style={COL.lieu}>
                      <Text style={s.texte} numberOfLines={1}>{f.secteur ?? t('Secteur non renseigné')}</Text>
                      {!!f.adresse && <Text style={s.petit} numberOfLines={1}>{f.adresse}</Text>}
                    </View>
                    <Text style={[s.texte, COL.date]}>{dateHeure(f.date_detection)}</Text>
                    <View style={COL.statut}><Statut statut={f.statut} court /></View>
                    <View style={COL.alertes}>
                      {f.alerte_non_reparee ? <Alerte texte={t('Non réparée > {delai} h', { delai })} /> : <Text style={s.discret}>—</Text>}
                    </View>
                    <Photos nb={f.nb_photos} />
                    <View style={[COL.aller, { alignItems: 'flex-end' }]}>
                      {f.latitude != null && f.longitude != null && (
                        <BoutonYAller latitude={f.latitude} longitude={f.longitude} libelle={t('Fuite N° {numero}', { numero: f.numero })} />
                      )}
                    </View>
                  </>
                ) : (
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={l.entreDeux}>
                      <Text style={[s.texteFort, { flexShrink: 1 }]} numberOfLines={1}>
                        {t('N° {numero}', { numero: f.numero })}{f.reference_srm ? <Text style={s.discret}> · {f.reference_srm}</Text> : null}
                      </Text>
                      <Statut statut={f.statut} court />
                    </View>
                    <Text style={s.texte}>
                      {f.secteur ?? t('Secteur non renseigné')}{f.adresse ? <Text style={s.discret}> · {f.adresse}</Text> : null}
                    </Text>
                    <View style={[s.ligneTitre, { gap: 6 }]}>
                      <Text style={s.petit}>{dateHeure(f.date_detection)}</Text>
                      <Icone nom="camera" taille={15} couleur={COULEURS.discret} />
                      <Text style={s.petit}>{f.nb_photos}</Text>
                    </View>
                    {f.alerte_non_reparee && <Alerte texte={t('Non réparée > {delai} h', { delai })} />}
                    {f.latitude != null && f.longitude != null && (
                      <BoutonYAller latitude={f.latitude} longitude={f.longitude} libelle={t('Fuite N° {numero}', { numero: f.numero })} style={{ alignSelf: 'flex-start' }} />
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

const titreEnvoi = (e: Envoi) => {
  switch (e.type) {
    case 'reparation': return t('Réparation · {fuite}', { fuite: e.fuite_libelle });
    case 'refection': return t('Réfection · {fuite}', { fuite: e.fuite_libelle });
    case 'modification': return t('Modification de réparation · {fuite}', { fuite: e.fuite_libelle });
    case 'photos': return t('Photo(s) ajoutée(s) · {fuite}', { fuite: e.fuite_libelle });
    case 'maj':
      return e.table === 'fuites' ? t('Modification de la fuite · {fuite}', { fuite: e.fuite_libelle })
        : e.table === 'refections' ? t('Modification de réfection · {fuite}', { fuite: e.fuite_libelle })
          : t('Modification de photo · {fuite}', { fuite: e.fuite_libelle });
    default:
      return t('Nouvelle fuite · {reference}', {
        reference: (e.ligne.reference_srm as string) || (e.ligne.adresse as string) || t('sans référence'),
      });
  }
};

export function EnAttente({ retour }: { retour: () => void }) {
  const [liste, setListe] = useState<Envoi[]>([]);
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const bas = useBas();
  useLangue();
  const charger = useCallback(async () => setListe(await lireAttente()), []);
  useEffect(() => {
    charger();
    return surChangement(() => void charger());
  }, [charger]);

  async function envoyer() {
    setOccupe(true);
    const restantes = await synchroniser().catch(() => -1);
    setMessage({
      ok: restantes === 0,
      texte: restantes === 0
        ? t('Tout est envoyé.')
        : restantes < 0 ? t('Envoi impossible pour le moment.') : t('{n} envoi(s) restent à traiter.', { n: restantes }),
    });
    setOccupe(false);
    charger();
  }

  async function supprimer(e: Envoi) {
    const suite = await dependants(e.id);
    Alert.alert(
      t('Supprimer de la tablette ?'),
      suite.length
        ? t('Cette saisie et {n} saisie(s) liée(s) (réparation, réfection, modification, photos) et ses photos seront définitivement perdues.', { n: suite.length })
        : t('Cette saisie et ses photos seront définitivement perdues.'),
      [
        { text: t('Garder'), style: 'cancel' },
        { text: t('Supprimer'), style: 'destructive', onPress: async () => { await abandonner(e.id); charger(); } },
      ],
    );
  }

  return (
    <View style={s.ecran}>
      <BarreApp
        titre={t('Envois en attente')}
        sousTitre={t('{n} saisies sur la tablette', { n: liste.length }, `${pluriel(liste.length, 'saisie')} sur la tablette`)}
        retour={retour}
      />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]}>
        <Text style={s.discret}>
          {t("Ces saisies sont gardées sur la tablette. Elles partent dans l'ordre dès que le réseau revient ; ne désinstallez pas l'application avant.")}
        </Text>
        <Bouton titre={t('Envoyer maintenant')} icone="cloud-upload" primaire grand onPress={envoyer} occupe={occupe} desactive={liste.length === 0} />
        {!!message && <Message ton={message.ok ? 'info' : 'attention'}>{message.texte}</Message>}
        {liste.length === 0 && <Vide texte={t('Aucune saisie en attente.')} />}
        {liste.map((e) => (
          <Carte key={e.id}>
            <View style={[s.ligne, { alignItems: 'center', flexWrap: 'nowrap' }]}>
              <View style={l.icone}><Icone nom="cloud-upload" taille={18} couleur={COULEURS.discret} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.texteFort}>{titreEnvoi(e)}</Text>
                <Text style={s.discret}>{t('Saisie le {date} · {n} photo(s) en attente', { date: dateHeure(e.creee_le), n: e.photos.length })}</Text>
              </View>
            </View>
            {!!e.erreur && <Message ton="erreur">{t('Refusée par le serveur : {erreur}', { erreur: tx(e.erreur) })}</Message>}
            <Bouton titre={t('Supprimer de la tablette')} icone="trash" danger onPress={() => supprimer(e)} style={{ alignSelf: 'flex-start' }} />
          </Carte>
        ))}
        <Bouton titre={t('Retour')} icone="arrow-left" onPress={retour} />
      </ScrollView>
    </View>
  );
}

const l = StyleSheet.create({
  connexion: { flexDirection: 'row' },
  langueConnexion: { position: 'absolute', right: 16, zIndex: 1, backgroundColor: COULEURS.fond },
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

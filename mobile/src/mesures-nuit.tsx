// Écran « Mesures de nuit » (D8) : campagne en cours, nuit, point de mesure, puis minimum de la nuit ou relevés de
// 0 h à 6 h selon le mode, observation et photo de l'afficheur (facultative). Tout passe par la file d'attente : la
// saisie part au retour du réseau et arrive « à valider » (sauf saisie du responsable, validée d'emblée par la base).
// Données et règles : mesures-donnees.ts.
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ajouterEnvoi, effacerPhotos, lireAttente, remplacerMesure, surChangement, synchroniser, type Envoi, type PhotoAttente } from './file-attente';
import { Icone } from './icones';
import { t, tx, useLangue } from './langue';
import {
  avecAttente, chargerMesures, controlerSaisie, creationEnAttente, estSienne, HEURES_NUIT, jourIso, minimumReleves, modeDe,
  nuitsProposees, pointsDe, saisieDe, TYPES_CAMPAGNE, type Campagne, type Controle, type DonneesMesures, type MesureNuit,
  type Saisie,
} from './mesures-donnees';
import { prendrePhoto } from './photos';
import { useSession } from './session';
import {
  Badge, BarreApp, Bouton, Carte, Champ, COULEURS, LARGEUR_LARGE, Message, POLICE, Puces, s, Saisie as ChampTexte, TeteCarte,
  useBas, Vide, Vignettes,
} from './ui';

const VIDE: DonneesMesures = { campagnes: [], points: [], zones: [], mesures: [] };
const jour = (iso: string) => iso.split('-').reverse().join('/');
const debit = (n: number | null | undefined) =>
  n == null ? '—' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m³/h`;

function messageControle(c: Extract<Controle, { erreur: string }>): string {
  switch (c.erreur) {
    case 'minimum': return t('Saisissez le débit minimum de la nuit (m³/h).');
    case 'releves': return t('Saisissez au moins un relevé.');
    case 'releve_invalide': return t('Relevé de {heure} illisible : un nombre est attendu (ex. 12,5).', { heure: c.heure });
    default: return c.heure ? t('Débit négatif refusé ({heure}).', { heure: c.heure }) : t('Débit négatif refusé.');
  }
}

export function MesuresNuit({ retour }: { retour: () => void }) {
  const { marche, peut, session, aRenouveler } = useSession();
  useLangue();
  const bas = useBas();
  const large = useWindowDimensions().width >= LARGEUR_LARGE;
  const uid = session?.user.id;
  const marcheId = marche?.id;
  const lecture = peut('mesures_debit', 'lire');
  const bureau = peut('mesures_debit', 'valider');

  const [donnees, setDonnees] = useState<DonneesMesures>(VIDE);
  const [attente, setAttente] = useState<Envoi[]>([]);
  const [horsLigne, setHorsLigne] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [campagneId, setCampagneId] = useState('');
  const [nuit, setNuit] = useState('');
  const [pointId, setPointId] = useState('');
  const [saisie, setSaisie] = useState<Saisie>({ mode: 'minimum', minimum: '', releves: {}, observation: '' });
  const [photo, setPhoto] = useState<PhotoAttente | null>(null);
  const [message, setMessage] = useState<{ texte: string; ton: 'erreur' | 'info' | 'attention' } | null>(null);
  const [occupe, setOccupe] = useState(false);

  // Photo prise puis écran quitté (ou photo remplacée) sans enregistrer : fichier effacé de la tablette.
  const photoCourante = useRef<PhotoAttente | null>(null);
  photoCourante.current = photo;
  useEffect(() => () => {
    if (photoCourante.current) void effacerPhotos([photoCourante.current]);
  }, []);

  const charger = useCallback(async () => {
    if (!marcheId || !lecture) return;
    setAttente(await lireAttente());
    const repondu = await chargerMesures(marcheId, aRenouveler, setDonnees);
    setHorsLigne(!repondu);
    setChargement(false);
  }, [marcheId, lecture, aRenouveler]);
  useEffect(() => {
    void charger();
  }, [charger]);
  // Après une synchro : mesures envoyées, refus éventuels, validation du responsable.
  useEffect(() => surChangement(() => void charger()), [charger]);

  const aujourdhui = jourIso(new Date());
  const mesures = useMemo(
    () => (marcheId ? avecAttente(donnees.mesures, attente, uid, marcheId) : []),
    [donnees.mesures, attente, uid, marcheId],
  );
  const campagne = donnees.campagnes.find((c) => c.id === campagneId) ?? donnees.campagnes[0] ?? null;
  const nuits = campagne ? nuitsProposees(campagne, aujourdhui) : [];
  const nuitChoisie = nuits.includes(nuit) ? nuit : nuits[0] ?? '';
  const points = campagne ? pointsDe(donnees.points, campagne) : [];
  const point = points.find((p) => p.id === pointId) ?? null;
  const mesureDe = (id: string) => mesures.find((m) => m.campagne_id === campagne?.id && m.point_id === id && m.nuit === nuitChoisie) ?? null;
  const mesure = point ? mesureDe(point.id) : null;
  const mode = campagne ? modeDe(campagne, marche?.debits_mode_saisie) : 'minimum';
  const creation = mesure ? creationEnAttente(attente, mesure.id) : null;
  const modifiable = !mesure || !!creation || bureau
    || (!mesure.validee_le && peut('mesures_debit', 'modifier', [mesure.auteur_terrain_id, mesure.saisi_par]));

  // Autre point, nuit ou campagne : formulaire repris de la mesure existante (ou vide).
  const cleFormulaire = `${campagne?.id}|${nuitChoisie}|${point?.id}`;
  const derniere = useRef('');
  useEffect(() => {
    if (derniere.current === cleFormulaire) return;
    derniere.current = cleFormulaire;
    setSaisie(saisieDe(mesure, mode));
    if (photoCourante.current) void effacerPhotos([photoCourante.current]);
    setPhoto(null);
    setMessage(null);
  }, [cleFormulaire, mesure, mode]);

  const libelleZone = (id: string | null) => {
    if (!id) return t('Toutes les zones');
    const z = donnees.zones.find((x) => x.id === id);
    return z ? t('Zone {numero} · {libelle}', { numero: z.numero, libelle: z.libelle }) : '—';
  };
  const libelleCampagne = (c: Campagne) =>
    `${c.libelle || tx(TYPES_CAMPAGNE[c.type])} · ${libelleZone(c.zone_id)} · ${jour(c.date_debut)} → ${jour(c.date_fin)}`;

  async function photographier() {
    setMessage(null);
    try {
      const r = await prendrePhoto('autre');
      if (typeof r === 'string') setMessage({ texte: r, ton: 'erreur' });
      else if (r) {
        if (photo) void effacerPhotos([photo]);
        setPhoto(r);
      }
    } catch (e) {
      setMessage({ texte: t('Photo impossible : {erreur}', { erreur: String((e as Error).message ?? e) }), ton: 'erreur' });
    }
  }

  async function enregistrer() {
    if (!marcheId || !campagne || !point || !nuitChoisie) return;
    const c = controlerSaisie(saisie);
    if ('erreur' in c) {
      setMessage({ texte: messageControle(c), ton: 'erreur' });
      return;
    }
    setOccupe(true);
    try {
      const libelle = `${point.code} · ${jour(nuitChoisie)}`;
      const photos = photo ? [photo] : [];
      if (!mesure) {
        const id = Crypto.randomUUID();
        await ajouterEnvoi({
          type: 'mesure', id, mesure_id: id, campagne_id: campagne.id, correction: false, libelle, marche_id: marcheId, photos,
          ligne: { point_id: point.id, nuit: nuitChoisie, ...c.ligne },
        });
      } else if (creation) {
        const fait = await remplacerMesure(creation.id, c.ligne, photo ? photos : creation.photos, libelle);
        if (!fait) {
          setMessage({ texte: t('Cette mesure part au serveur en ce moment : réessayez dans un instant.'), ton: 'attention' });
          return;
        }
      } else {
        await ajouterEnvoi({
          type: 'mesure', id: Crypto.randomUUID(), mesure_id: mesure.id, campagne_id: campagne.id, correction: true, libelle,
          marche_id: marcheId, photos, ligne: c.ligne,
        });
      }
      photoCourante.current = null;
      setPhoto(null);
      setAttente(await lireAttente());
      setMessage({
        ton: 'info',
        texte: bureau
          ? t("Mesure enregistrée sur la tablette ; envoyée dès que le réseau le permet (validée d'emblée).")
          : t('Mesure enregistrée sur la tablette ; envoyée dès que le réseau le permet, puis « à valider » par le responsable.'),
      });
      void synchroniser().catch(() => undefined);
    } finally {
      setOccupe(false);
    }
  }

  const etatMesure = (m: MesureNuit | null) => {
    if (!m) return <Badge texte={t('Non mesuré')} />;
    if (m.attente) return <Badge texte={t('À envoyer')} ton="orange" icone="clock" />;
    if (m.validee_le) return <Badge texte={t('Validée')} ton="vert" icone="circle-check" />;
    return <Badge texte={t('À valider')} ton="orange" />;
  };

  const choix = (
    <View style={{ gap: 14, flex: large ? 1 : undefined }}>
      <Carte>
        <TeteCarte titre={t('Campagne')} icone="calendar" description={t('Campagnes en cours, créées par le responsable sur le site.')} />
        {donnees.campagnes.length ? (
          <View style={{ gap: 8 }}>
            {donnees.campagnes.map((c) => {
              const actif = c.id === campagne?.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => { setCampagneId(c.id); setPointId(''); }}
                  style={({ pressed }) => [l.choix, actif && l.choixActif, pressed && !actif && s.appuye]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: actif }}
                >
                  <Icone nom={actif ? 'circle-check' : 'circle'} couleur={actif ? COULEURS.principal : COULEURS.discret} />
                  <Text style={[s.texte, { flex: 1 }]}>{libelleCampagne(c)}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Vide texte={chargement ? t('Chargement…') : t('Aucune campagne de mesure en cours sur ce marché.')} />
        )}
      </Carte>

      {!!campagne && (
        <Carte>
          <TeteCarte titre={t('Nuit')} icone="clock" description={t('Jour des relevés de 0 h à 6 h.')} />
          {nuits.length
            ? <Puces options={nuits.map((n) => ({ valeur: n, libelle: jour(n) }))} valeur={nuitChoisie} onChange={(v) => v && setNuit(v)} />
            : <Vide texte={t("La première nuit de la campagne n'est pas encore passée.")} />}
        </Carte>
      )}

      {!!campagne && !!nuitChoisie && (
        <Carte style={{ paddingHorizontal: 0, paddingBottom: 0 }}>
          <View style={{ paddingHorizontal: 18 }}>
            <TeteCarte titre={t('Points de mesure')} compteur={points.length} icone="gauge" />
          </View>
          {!points.length && <View style={{ padding: 18 }}><Vide texte={t('Aucun point de mesure actif dans cette zone.')} /></View>}
          {points.map((p) => {
            const m = mesureDe(p.id);
            const actif = p.id === point?.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPointId(p.id)}
                style={({ pressed }) => [l.point, actif && l.pointActif, pressed && !actif && s.appuye]}
                accessibilityRole="button"
                accessibilityState={{ selected: actif }}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.texteFort} numberOfLines={1}>{p.code} · {p.libelle}</Text>
                  <Text style={s.petit} numberOfLines={1}>{m ? debit(m.minimum_m3h) : p.equipement || ' '}</Text>
                </View>
                {etatMesure(m)}
                <Icone nom="chevron-right" couleur={COULEURS.discret} />
              </Pressable>
            );
          })}
        </Carte>
      )}
    </View>
  );

  const apercu = saisie.mode === 'releves' ? minimumReleves(saisie.releves) : null;
  const formulaire = point && campagne && nuitChoisie ? (
    <Carte style={large ? { flex: 1, alignSelf: 'flex-start' } : undefined}>
      <TeteCarte
        titre={t('Point {code} · nuit du {date}', { code: point.code, date: jour(nuitChoisie) })}
        description={point.libelle}
        action={etatMesure(mesure)}
      />
      {mesure && !estSienne(mesure, uid) && <Message ton="attention">{t('Mesure saisie par un autre compte.')}</Message>}
      {!modifiable ? (
        <>
          <Message ton="info" icone="lock">
            {mesure?.validee_le
              ? t('Mesure déjà validée par le responsable : elle ne se corrige plus depuis la tablette.')
              : t('Votre compte ne peut pas corriger cette mesure.')}
          </Message>
          <Text style={s.texteFort}>{t('Débit minimum de la nuit : {debit}', { debit: debit(mesure?.minimum_m3h) })}</Text>
          {!!mesure?.observation && <Text style={s.texte}>{mesure.observation}</Text>}
        </>
      ) : (
        <>
          {saisie.mode === 'minimum' ? (
            <Champ
              libelle={t('Débit minimum de la nuit (m³/h)')} nombre indication="0,0"
              valeur={saisie.minimum} onChange={(v) => setSaisie({ ...saisie, minimum: v })}
            />
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={s.etiquette}>{t("Relevés de 0 h à 6 h (m³/h), au quart d'heure")}</Text>
              <View style={l.grille}>
                {HEURES_NUIT.map((h) => (
                  <View key={h} style={l.releve}>
                    <Text style={s.petit}>{h}</Text>
                    <ChampTexte
                      value={saisie.releves[h] ?? ''}
                      onChangeText={(v) => setSaisie({ ...saisie, releves: { ...saisie.releves, [h]: v } })}
                      keyboardType="decimal-pad"
                      accessibilityLabel={t('Relevé de {heure}', { heure: h })}
                      style={l.champReleve}
                    />
                  </View>
                ))}
              </View>
              <Text style={s.discret}>
                {t('Minimum des relevés : {debit}. Les heures laissées vides ne sont pas envoyées.', { debit: debit(apercu) })}
              </Text>
            </View>
          )}
          <Champ
            libelle={t('Observation (facultative)')} multiligne
            valeur={saisie.observation} onChange={(v) => setSaisie({ ...saisie, observation: v })}
          />
          <View style={{ gap: 10 }}>
            <Text style={s.etiquette}>{t("Photo de l'afficheur (facultative)")}</Text>
            {photo ? (
              <Vignettes photos={[{ id: photo.id, uri: photo.fichier, legende: t('Afficheur') }]} retirer={() => { void effacerPhotos([photo]); setPhoto(null); }} />
            ) : mesure?.piece_jointe ? (
              <Text style={s.discret}>{t('Une photo est déjà jointe ; une nouvelle photo la remplace.')}</Text>
            ) : null}
            <Bouton titre={photo ? t('Reprendre la photo') : t("Photographier l'afficheur")} icone="camera" onPress={photographier} style={{ alignSelf: 'flex-start' }} />
          </View>
          {!!message && <Message ton={message.ton}>{message.texte}</Message>}
          <Bouton
            titre={mesure ? t('Enregistrer la correction') : t('Enregistrer la mesure')} icone="check" primaire grand
            occupe={occupe} onPress={enregistrer}
          />
        </>
      )}
    </Carte>
  ) : null;

  return (
    <View style={s.ecran}>
      <BarreApp titre={t('Mesures de nuit')} sousTitre={marche?.code} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]} keyboardShouldPersistTaps="handled">
        {!lecture ? (
          <Message ton="attention">
            {t("Votre compte n'a pas le droit de lire les débits de nuit sur ce marché : voyez avec l'administrateur.")}
          </Message>
        ) : (
          <>
            {horsLigne && !chargement && <Message ton="attention" icone="wifi-off">{t('Hors ligne : dernières données connues.')}</Message>}
            {large ? <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>{choix}{formulaire ?? <View style={{ flex: 1 }} />}</View> : (
              <>
                {choix}
                {formulaire}
              </>
            )}
            {!!message && !formulaire && <Message ton={message.ton}>{message.texte}</Message>}
          </>
        )}
        <Bouton titre={t('Retour')} icone="arrow-left" onPress={retour} style={{ alignSelf: 'flex-start' }} />
      </ScrollView>
    </View>
  );
}

const l = StyleSheet.create({
  choix: {
    minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: COULEURS.bord, borderRadius: 10,
  },
  choixActif: { borderColor: COULEURS.principal, backgroundColor: COULEURS.sourdine },
  point: {
    minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 10,
    borderTopWidth: 1, borderColor: COULEURS.bord,
  },
  pointActif: { backgroundColor: COULEURS.sourdine },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  releve: { width: 96, gap: 4 },
  champReleve: { minHeight: 48, paddingHorizontal: 10, fontFamily: POLICE },
});

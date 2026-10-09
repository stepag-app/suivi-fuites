import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Icone, type NomIcone } from './icones';
import { useLangue, type Langue } from './langue';
import { STATUTS, type StatutFuite } from './types';

// Jetons de l'interface « Studio Admin » du panneau web (web/src/app/globals.css, préréglage « default », mode clair),
// convertis en hexadécimal ; couleurs des statuts et des alertes reprises de web/src/components/statut.tsx (Tailwind v4).
export const COULEURS = {
  fond: '#ffffff',
  texte: '#0a0a0a',
  discret: '#737373',
  sourdine: '#f5f5f5',
  principal: '#171717',
  principalAppuye: '#454545',
  principalTexte: '#fafafa',
  bord: '#e5e5e5',
  anneau: '#a1a1a1',
  marque: '#0084d1',
  danger: '#e7000b',
  dangerFond: 'rgba(231, 0, 11, 0.1)',
  dangerBord: 'rgba(231, 0, 11, 0.2)',
};

/** Police du panneau (Geist), embarquée dans l'APK par le module expo-font (app.json) : graisses 400 à 700. */
export const POLICE = 'Geist';

/** Apparence de chaque statut, comme `STATUT_STYLE` du panneau : badge, point, anneau d'avancement. */
export const STATUT_STYLE: Record<StatutFuite, {
  court: string; point: string; texte: string; fond: string; bord: string; anneau: string; icone: string; progression: number;
}> = {
  detectee: {
    court: 'Détectée', point: '#fb2c36', texte: '#c10007', fond: 'rgba(251, 44, 54, 0.1)', bord: 'rgba(251, 44, 54, 0.2)',
    anneau: '#dc2626', icone: '#e7000b', progression: 15,
  },
  en_reparation: {
    court: 'En cours', point: '#fe9a00', texte: '#bb4d00', fond: 'rgba(254, 154, 0, 0.1)', bord: 'rgba(254, 154, 0, 0.2)',
    anneau: '#d97706', icone: '#e17100', progression: 45,
  },
  reparee: {
    court: 'Réparée', point: '#00a6f4', texte: '#0069a8', fond: 'rgba(0, 166, 244, 0.1)', bord: 'rgba(0, 166, 244, 0.2)',
    anneau: '#0284c7', icone: '#0084d1', progression: 75,
  },
  achevee: {
    court: 'Achevée', point: '#00c950', texte: '#008236', fond: 'rgba(0, 201, 80, 0.1)', bord: 'rgba(0, 201, 80, 0.2)',
    anneau: '#16a34a', icone: '#00a63e', progression: 100,
  },
  sans_reparation: {
    court: 'Sans réparation', point: '#90a1b9', texte: '#737373', fond: '#f5f5f5', bord: 'rgba(115, 115, 115, 0.2)',
    anneau: '#64748b', icone: '#737373', progression: 100,
  },
};

export const ORDRE_STATUTS: StatutFuite[] = ['detectee', 'en_reparation', 'reparee', 'achevee', 'sans_reparation'];

/** Largeur (dp) à partir de laquelle les écrans passent sur plusieurs colonnes (tablette en paysage). */
export const LARGEUR_LARGE = 900;

/** « 1 fuite », « 4 fuites ». */
export const pluriel = (n: number, mot: string) => `${n.toLocaleString('fr-FR')} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Hauteur de la barre de navigation d'Android : l'appli s'affiche bord à bord (Android 15), le bas de chaque écran
 * garde cette marge pour que les derniers boutons ne passent pas sous les boutons du système.
 */
export const useBas = () => useSafeAreaInsets().bottom;

/** Barre d'application blanche, comme l'en-tête du panneau : retour ou goutte, titre, sous-titre, actions à droite. */
export function BarreApp({ titre, sousTitre, retour, droite }: {
  titre: string; sousTitre?: string; retour?: () => void; droite?: ReactNode;
}) {
  const { t } = useLangue();
  const haut = useSafeAreaInsets().top || (StatusBar.currentHeight ?? 24);
  return (
    <View style={[s.barre, { paddingTop: haut + 8, minHeight: haut + 64 }]}>
      {retour ? (
        <Pressable
          onPress={retour}
          style={({ pressed }) => [s.boutonIcone, pressed && s.appuye]}
          accessibilityRole="button"
          accessibilityLabel={t('Retour')}
        >
          <Icone nom="arrow-left" taille={24} />
        </Pressable>
      ) : (
        <View style={s.boutonIcone}><Icone nom="droplets" taille={26} couleur={COULEURS.marque} /></View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.titreBarre} numberOfLines={1}>{titre}</Text>
        {!!sousTitre && <Text style={s.sousTitreBarre} numberOfLines={1}>{sousTitre}</Text>}
      </View>
      <BoutonLangue />
      {droite}
    </View>
  );
}

const LANGUES: { langue: Langue; nom: string; court: string }[] = [
  { langue: 'fr', nom: 'Français', court: 'FR' },
  { langue: 'hybride', nom: 'عربي + Français', court: 'ع + FR' },
  { langue: 'ar', nom: 'العربية', court: 'ع' },
];

/** Choix de la langue (en haut de chaque écran) : libellés écrits dans les deux langues, lisibles par tous. */
export function BoutonLangue({ style }: { style?: StyleProp<ViewStyle> }) {
  const { langue, choisir } = useLangue();
  const actuelle = LANGUES.find((l) => l.langue === langue) ?? LANGUES[0];
  const ouvrir = () => Alert.alert(
    'Langue · اللغة',
    undefined,
    LANGUES.map((l) => ({ text: l.langue === langue ? `✓ ${l.nom}` : l.nom, onPress: () => choisir(l.langue) })),
    { cancelable: true },
  );
  return (
    <Pressable
      onPress={ouvrir}
      style={({ pressed }) => [s.boutonLangue, pressed && s.appuye, style]}
      accessibilityRole="button"
      accessibilityLabel={`Langue · اللغة : ${actuelle.nom}`}
    >
      <Text style={s.texteLangue}>{actuelle.court}</Text>
    </Pressable>
  );
}

export function BoutonBarre({ titre, onPress, icone }: { titre: string; onPress: () => void; icone?: NomIcone }) {
  return <Bouton titre={titre} onPress={onPress} icone={icone} fantome />;
}

/**
 * Bouton du panneau, agrandi pour le doigt : contour par défaut ; `primaire` = action principale (noir) ;
 * `danger` = suppression (rouge) ; `fantome` = sans contour ; `compteur` = pastille chiffrée à droite.
 */
export function Bouton({ titre, onPress, primaire, danger, fantome, desactive, occupe, icone, compteur, grand, style }: {
  titre: string; onPress: () => void; primaire?: boolean; danger?: boolean; fantome?: boolean; desactive?: boolean;
  occupe?: boolean; icone?: NomIcone; compteur?: number | string; grand?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const inactif = !!(desactive || occupe);
  const couleur = primaire ? COULEURS.principalTexte : danger ? COULEURS.danger : COULEURS.texte;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactif}
      style={({ pressed }) => [
        s.bouton, primaire && s.primaire, danger && s.boutonDanger, fantome && s.fantome, grand && s.boutonGrand,
        pressed && [primaire ? s.primaireAppuye : danger ? s.dangerAppuye : s.appuye, s.enfonce],
        inactif && s.inactif, style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactif, busy: !!occupe }}
    >
      {occupe ? <ActivityIndicator color={couleur} /> : icone && <Icone nom={icone} couleur={couleur} />}
      {!!titre && <Text style={[s.texteBouton, { color: couleur }]} numberOfLines={2}>{titre}</Text>}
      {compteur != null && (
        <View style={[s.compteur, primaire && { backgroundColor: COULEURS.principalTexte }]}>
          <Text style={[s.texteCompteur, primaire && { color: COULEURS.principal }]}>{compteur}</Text>
        </View>
      )}
    </Pressable>
  );
}

export const Carte = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.carte, style]}>{children}</View>
);

/** En-tête d'une carte (CardHeader du panneau) : titre et compteur, description, action à droite. */
export function TeteCarte({ titre, compteur, description, icone, action }: {
  titre: string; compteur?: number; description?: string; icone?: NomIcone; action?: ReactNode;
}) {
  return (
    <View style={s.teteCarte}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 220, gap: 2 }}>
        <View style={s.ligneTitre}>
          {icone && <Icone nom={icone} taille={18} couleur={COULEURS.discret} />}
          <Text style={s.titreCarte}>{titre}</Text>
          {compteur != null && <Text style={s.nb}>{compteur}</Text>}
        </View>
        {!!description && <Text style={s.discret}>{description}</Text>}
      </View>
      {action}
    </View>
  );
}

/** Badge de statut du panneau : point et libellé colorés sur fond teinté ; `court` dans les listes. */
export function Statut({ statut, court, carre }: { statut: StatutFuite; court?: boolean; carre?: boolean }) {
  const { tx } = useLangue();
  const st = STATUT_STYLE[statut] ?? STATUT_STYLE.sans_reparation;
  return (
    <View style={[s.badge, carre && s.badgeCarre, { backgroundColor: st.fond, borderColor: st.bord }]}>
      <View style={[s.point, { backgroundColor: st.point }]} />
      <Text style={[s.texteBadge, { color: st.texte }]} numberOfLines={1}>{tx(court ? st.court : STATUTS[statut] ?? statut)}</Text>
    </View>
  );
}

const TONS = {
  rouge: { fond: COULEURS.dangerFond, bord: COULEURS.dangerBord, texte: COULEURS.danger },
  orange: { fond: 'rgba(254, 154, 0, 0.1)', bord: 'rgba(254, 154, 0, 0.2)', texte: '#bb4d00' },
  neutre: { fond: COULEURS.sourdine, bord: COULEURS.bord, texte: COULEURS.discret },
};

export function Badge({ texte, ton = 'neutre', icone, carre }: {
  texte: string; ton?: keyof typeof TONS; icone?: NomIcone; carre?: boolean;
}) {
  const t = TONS[ton];
  return (
    <View style={[s.badge, carre && s.badgeCarre, { backgroundColor: t.fond, borderColor: t.bord }]}>
      {icone && <Icone nom={icone} taille={14} couleur={t.texte} />}
      <Text style={[s.texteBadge, { color: t.texte }]} numberOfLines={1}>{texte}</Text>
    </View>
  );
}

export const Alerte = ({ texte, carre }: { texte: string; carre?: boolean }) => <Badge texte={texte} ton="rouge" carre={carre} />;

const MESSAGES = {
  erreur: { fond: '#fef2f2', bord: '#ffc9c9', texte: '#c10007', icone: 'circle-alert' },
  attention: { fond: '#fffbeb', bord: '#fee685', texte: '#7b3306', icone: 'triangle-alert' },
  info: { fond: '#f0fdf4', bord: '#b9f8cf', texte: '#016630', icone: 'circle-check' },
} as const;

/** Message encadré (Alert du panneau) : erreur, attention (hors ligne, verrou, envoi en attente) ou information. */
export function Message({ ton, icone, children }: { ton: keyof typeof MESSAGES; icone?: NomIcone; children: ReactNode }) {
  const m = MESSAGES[ton];
  return (
    <View style={[s.message, { backgroundColor: m.fond, borderColor: m.bord }]} accessibilityRole={ton === 'erreur' ? 'alert' : 'text'}>
      <Icone nom={icone ?? m.icone} couleur={m.texte} />
      <Text style={[s.texteMessage, { color: m.texte }]}>{children}</Text>
    </View>
  );
}

/** Zone vide en pointillés (« Aucune réparation saisie. »). */
export const Vide = ({ texte }: { texte: string }) => (
  <View style={s.vide}><Text style={[s.discret, { textAlign: 'center' }]}>{texte}</Text></View>
);

/** Libellé discret au-dessus de sa valeur ; `large` occupe toute la ligne. */
export function Info({ libelle, valeur, large }: { libelle: string; valeur: string | null | undefined; large?: boolean }) {
  return (
    <View style={[s.info, large && s.infoLarge]}>
      <Text style={s.libelleInfo}>{libelle}</Text>
      <Text style={s.valeurInfo}>{valeur || '—'}</Text>
    </View>
  );
}

const RAYON = 46;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/** Anneau d'avancement de la fiche (modèle « Profile » du panneau), couleur et progression du statut. */
export function AnneauStatut({ statut, taille = 76 }: { statut: StatutFuite; taille?: number }) {
  const { t } = useLangue();
  const st = STATUT_STYLE[statut] ?? STATUT_STYLE.sans_reparation;
  const marge = Math.round(taille * 0.145);
  return (
    <View style={{ width: taille, height: taille }} accessibilityLabel={t('Avancement {progression} %', { progression: st.progression })}>
      <Svg width={taille} height={taille} viewBox="0 0 100 100" style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx="50" cy="50" r={RAYON} fill="none" stroke={COULEURS.sourdine} strokeWidth={3} />
        <Circle
          cx="50" cy="50" r={RAYON} fill="none" stroke={st.anneau} strokeWidth={3} strokeLinecap="round"
          strokeDasharray={[(CIRCONFERENCE * st.progression) / 100, CIRCONFERENCE]}
        />
      </Svg>
      <View style={[s.centreAnneau, { top: marge, left: marge, right: marge, bottom: marge }]}>
        <Icone nom="droplets" taille={Math.round(taille * 0.34)} couleur={st.icone} />
      </View>
    </View>
  );
}

/**
 * « Y aller » : ouvre l'application de cartes de la tablette (Google Maps, Waze…) avec la fuite pour
 * destination. Repli sur le lien Google Maps si aucune application ne prend l'adresse « geo: ».
 */
export async function allerA(latitude: number, longitude: number, libelle: string) {
  const geo = `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(libelle)})`;
  try {
    await Linking.openURL(geo);
  } catch {
    await Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`).catch(() => undefined);
  }
}

export function BoutonYAller({ latitude, longitude, libelle, grand, style }: {
  latitude: number | null | undefined; longitude: number | null | undefined; libelle: string; grand?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useLangue();
  const position = latitude != null && longitude != null;
  return (
    <Bouton
      titre={position ? t('Y aller') : t('Y aller (pas de position GPS)')}
      icone="navigation"
      grand={grand}
      style={style}
      desactive={!position}
      onPress={() => position && void allerA(latitude, longitude, libelle)}
    />
  );
}

/** Choix unique par gros boutons ; un second appui sur le choix actif le désélectionne (si facultatif). */
export function Puces<T extends string>({ options, valeur, onChange, facultatif }: {
  options: { valeur: T; libelle: string }[]; valeur: T | ''; onChange: (v: T | '') => void; facultatif?: boolean;
}) {
  return (
    <View style={s.ligne}>
      {options.map((o) => {
        const actif = o.valeur === valeur;
        return (
          <Pressable
            key={o.valeur}
            onPress={() => onChange(actif && facultatif ? '' : o.valeur)}
            style={({ pressed }) => [s.puce, pressed && !actif && s.appuye, actif && s.puceActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
          >
            <Text style={[s.textePuce, actif && { color: COULEURS.principalTexte }]}>{o.libelle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Sélecteur à onglets du panneau (fond gris, choix actif en blanc) : marché ouvert. */
export function Segments<T extends string>({ options, valeur, onChange }: {
  options: { valeur: T; libelle: string }[]; valeur: T | ''; onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={s.segments}>
      {options.map((o) => {
        const actif = o.valeur === valeur;
        return (
          <Pressable
            key={o.valeur}
            onPress={() => onChange(o.valeur)}
            style={[s.segment, actif && s.segmentActif]}
            accessibilityRole="tab"
            accessibilityState={{ selected: actif }}
          >
            <Text style={[s.texteSegment, actif && { color: COULEURS.texte }]} numberOfLines={1}>{o.libelle}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Case à cocher sur toute la largeur (facile au doigt). */
export function Case({ libelle, valeur, onChange }: { libelle: string; valeur: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!valeur)}
      style={({ pressed }) => [s.case, pressed && s.appuye]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: valeur }}
    >
      <View style={[s.coche, valeur && s.cocheActive]}>
        {valeur && <Icone nom="check" taille={16} epaisseur={3} couleur={COULEURS.principalTexte} />}
      </View>
      <Text style={[s.texte, { flex: 1 }]}>{libelle}</Text>
    </Pressable>
  );
}

/** Zone de saisie du panneau : bord gris, halo gris quand elle a le curseur. */
export function Saisie(props: ComponentProps<typeof TextInput>) {
  const [actif, setActif] = useState(false);
  return (
    <TextInput
      placeholderTextColor={COULEURS.discret}
      cursorColor={COULEURS.texte}
      selectionHandleColor={COULEURS.texte}
      selectionColor="rgba(23, 23, 23, 0.2)"
      {...props}
      style={[s.champ, props.editable === false && s.champInactif, actif && s.champActif, props.style]}
      onFocus={(e) => { setActif(true); props.onFocus?.(e); }}
      onBlur={(e) => { setActif(false); props.onBlur?.(e); }}
    />
  );
}

export function Champ({ libelle, valeur, onChange, nombre, multiligne, indication }: {
  libelle: string; valeur: string; onChange: (t: string) => void; nombre?: boolean; multiligne?: boolean; indication?: string;
}) {
  return (
    <View style={{ gap: 6, flexGrow: 1, flexBasis: nombre ? 120 : 220 }}>
      <Text style={s.etiquette}>{libelle}</Text>
      <Saisie
        style={multiligne ? s.multiligne : undefined}
        value={valeur}
        onChangeText={onChange}
        keyboardType={nombre ? 'decimal-pad' : 'default'}
        multiline={multiligne}
        placeholder={indication}
      />
    </View>
  );
}

/** Choix dans une liste (ouvre un écran de choix) : présenté comme un champ, avec un chevron. */
export function Selecteur({ valeur, indication, onPress }: { valeur?: string | null; indication: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.champ, s.selecteur, pressed && s.appuye]} accessibilityRole="button">
      <Text style={[s.texteChamp, !valeur && { color: COULEURS.discret }]} numberOfLines={1}>{valeur || indication}</Text>
      <Icone nom="chevron-down" couleur={COULEURS.discret} />
    </Pressable>
  );
}

/**
 * Vignettes de photos (fichier local ou adresse signée) ; un appui retire la photo si `retirer` est fourni, ou ouvre
 * ses actions (changer le type, retirer) si la photo a `toucher`.
 */
export function Vignettes({ photos, retirer }: {
  photos: { id: string; uri?: string; legende: string; toucher?: () => void }[]; retirer?: (id: string) => void;
}) {
  const { t } = useLangue();
  if (!photos.length) return null;
  return (
    <View style={s.ligne}>
      {photos.map((p) => (
        <Pressable
          key={p.id}
          onPress={retirer ? () => retirer(p.id) : p.toucher}
          disabled={!retirer && !p.toucher}
          style={s.vignette}
          accessibilityLabel={retirer ? t('{legende} : retirer la photo', { legende: p.legende }) : p.legende}
        >
          {p.uri ? (
            <Image source={{ uri: p.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          ) : (
            <View style={s.vignetteVide}>
              <Icone nom="camera" taille={24} couleur={COULEURS.discret} />
              <Text style={[s.petit, { textAlign: 'center' }]}>{t('Visible avec le réseau')}</Text>
            </View>
          )}
          <View style={s.etiquetteVignette}><Text style={s.texteEtiquetteVignette} numberOfLines={1}>{p.legende}</Text></View>
          {retirer && <View style={s.retirerVignette}><Icone nom="x" taille={18} /></View>}
          {!retirer && p.toucher && <View style={s.retirerVignette}><Icone nom="pencil" taille={16} /></View>}
        </Pressable>
      ))}
    </View>
  );
}

export const s = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: COULEURS.fond },
  contenu: { padding: 20, gap: 14 },
  defile: { padding: 20, gap: 14, paddingBottom: 40, width: '100%', maxWidth: 920, alignSelf: 'center' },
  barre: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COULEURS.fond, borderBottomWidth: 1,
    borderColor: COULEURS.bord, paddingBottom: 8, paddingLeft: 10, paddingRight: 14,
  },
  boutonIcone: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  boutonLangue: {
    minWidth: 48, height: 40, borderRadius: 10, borderWidth: 1, borderColor: COULEURS.bord, paddingHorizontal: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  texteLangue: { fontFamily: POLICE, fontSize: 15, fontWeight: '600', color: COULEURS.texte },
  titreBarre: { fontFamily: POLICE, fontSize: 18, fontWeight: '600', color: COULEURS.texte, letterSpacing: -0.2 },
  sousTitreBarre: { fontFamily: POLICE, fontSize: 14, color: COULEURS.discret },
  h1: { fontFamily: POLICE, fontSize: 28, lineHeight: 34, fontWeight: '600', color: COULEURS.texte, letterSpacing: -0.5 },
  carte: { backgroundColor: COULEURS.fond, borderColor: COULEURS.bord, borderWidth: 1, borderRadius: 14, padding: 18, gap: 14 },
  teteCarte: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  ligneTitre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titreCarte: { fontFamily: POLICE, fontSize: 18, fontWeight: '600', color: COULEURS.texte, letterSpacing: -0.2 },
  sousTitre: { fontFamily: POLICE, fontSize: 18, fontWeight: '600', color: COULEURS.texte, letterSpacing: -0.2 },
  texte: { fontFamily: POLICE, fontSize: 16, color: COULEURS.texte },
  texteFort: { fontFamily: POLICE, fontSize: 16, fontWeight: '600', color: COULEURS.texte },
  discret: { fontFamily: POLICE, color: COULEURS.discret, fontSize: 15 },
  petit: { fontFamily: POLICE, color: COULEURS.discret, fontSize: 14 },
  etiquette: { fontFamily: POLICE, fontWeight: '500', fontSize: 15, color: COULEURS.texte },
  nb: {
    fontFamily: POLICE, fontSize: 13, fontWeight: '500', color: COULEURS.discret, backgroundColor: COULEURS.sourdine,
    borderRadius: 5, paddingHorizontal: 7, paddingVertical: 1, overflow: 'hidden',
  },
  champ: {
    minHeight: 52, borderWidth: 1, borderColor: COULEURS.bord, borderRadius: 10, paddingHorizontal: 14,
    fontFamily: POLICE, fontSize: 17, color: COULEURS.texte, backgroundColor: COULEURS.fond,
  },
  // Halo du panneau rendu par une bordure de 2 dp : un `outline` sur un champ Android lui retire sa marge intérieure.
  champActif: { borderColor: COULEURS.anneau, borderWidth: 2, paddingHorizontal: 13 },
  champInactif: { backgroundColor: COULEURS.sourdine, color: COULEURS.discret },
  texteChamp: { flex: 1, fontFamily: POLICE, fontSize: 17, color: COULEURS.texte },
  selecteur: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  multiligne: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
  bouton: {
    minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: COULEURS.bord, backgroundColor: COULEURS.fond,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18,
  },
  boutonGrand: { minHeight: 56, paddingHorizontal: 22 },
  primaire: { backgroundColor: COULEURS.principal, borderColor: COULEURS.principal },
  primaireAppuye: { backgroundColor: COULEURS.principalAppuye, borderColor: COULEURS.principalAppuye },
  boutonDanger: { backgroundColor: COULEURS.dangerFond, borderColor: 'transparent' },
  dangerAppuye: { backgroundColor: 'rgba(231, 0, 11, 0.2)' },
  fantome: { borderColor: 'transparent', backgroundColor: 'transparent' },
  appuye: { backgroundColor: COULEURS.sourdine },
  enfonce: { transform: [{ translateY: 1 }] },
  inactif: { opacity: 0.5 },
  texteBouton: { fontFamily: POLICE, fontSize: 16, fontWeight: '500', textAlign: 'center', flexShrink: 1 },
  compteur: {
    minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 7, backgroundColor: COULEURS.principal,
    alignItems: 'center', justifyContent: 'center',
  },
  texteCompteur: { fontFamily: POLICE, fontSize: 13, fontWeight: '600', color: COULEURS.principalTexte },
  ligne: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  puce: {
    minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10, borderWidth: 1,
    borderColor: COULEURS.bord, backgroundColor: COULEURS.fond,
  },
  puceActive: { backgroundColor: COULEURS.principal, borderColor: COULEURS.principal },
  textePuce: { fontFamily: POLICE, fontSize: 16, fontWeight: '500', color: COULEURS.texte },
  segments: { flexDirection: 'row', backgroundColor: COULEURS.sourdine, borderRadius: 12, padding: 4, gap: 2 },
  segment: { minHeight: 40, paddingHorizontal: 14, borderRadius: 9, justifyContent: 'center' },
  segmentActif: { backgroundColor: COULEURS.fond, boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.12)' },
  texteSegment: { fontFamily: POLICE, fontSize: 15, fontWeight: '500', color: COULEURS.discret },
  case: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 10,
    borderWidth: 1, borderColor: COULEURS.bord, backgroundColor: COULEURS.fond,
  },
  coche: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: COULEURS.anneau,
    alignItems: 'center', justifyContent: 'center',
  },
  cocheActive: { backgroundColor: COULEURS.principal, borderColor: COULEURS.principal },
  vignette: {
    width: 168, height: 126, borderRadius: 10, overflow: 'hidden', backgroundColor: COULEURS.sourdine,
    borderWidth: 1, borderColor: COULEURS.bord,
  },
  vignetteVide: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 8 },
  etiquetteVignette: {
    position: 'absolute', left: 8, bottom: 8, maxWidth: 150, backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  texteEtiquetteVignette: { fontFamily: POLICE, fontSize: 13, fontWeight: '500', color: COULEURS.texte },
  retirerVignette: {
    position: 'absolute', top: 6, right: 6, width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.9)', alignItems: 'center', justifyContent: 'center',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 28, paddingHorizontal: 10,
    borderRadius: 999, borderWidth: 1,
  },
  badgeCarre: { borderRadius: 6 },
  point: { width: 7, height: 7, borderRadius: 4 },
  texteBadge: { fontFamily: POLICE, fontSize: 14, fontWeight: '500' },
  message: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  texteMessage: { flex: 1, fontFamily: POLICE, fontSize: 16, lineHeight: 22 },
  vide: {
    minHeight: 72, borderWidth: 1, borderStyle: 'dashed', borderColor: COULEURS.bord, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  grille: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 16 },
  info: { flexGrow: 1, flexBasis: 220, gap: 3 },
  infoLarge: { flexBasis: '100%' },
  libelleInfo: { fontFamily: POLICE, fontSize: 14, color: COULEURS.discret },
  valeurInfo: { fontFamily: POLICE, fontSize: 16, fontWeight: '500', color: COULEURS.texte },
  centreAnneau: { position: 'absolute', borderRadius: 999, backgroundColor: COULEURS.sourdine, alignItems: 'center', justifyContent: 'center' },
  separateur: { borderTopWidth: 1, borderColor: COULEURS.bord, paddingTop: 14, gap: 10 },
});

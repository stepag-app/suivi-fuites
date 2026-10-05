import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { STATUTS, type StatutFuite } from './types';

// Jetons du style SAP Fiori, repris de web/src/app/globals.css : mêmes couleurs que le panneau web.
export const COULEURS = {
  fond: '#f5f6f7',
  carte: '#ffffff',
  texte: '#1d2d3e',
  discret: '#556b82',
  principal: '#0064d9',
  principalFonce: '#0054b6',
  principalClair: '#ebf3fd',
  bord: '#d9dde3',
  bordDoux: '#e5e8ec',
  bordChamp: '#8396a8',
  bordBouton: '#bcc3ca',
  survol: '#eef4fc',
  shell: '#354a5f',
  shellTexte: '#ffffff',
  danger: '#aa0808',
  dangerFond: '#ffeaf4',
  dangerBord: '#e9a0a0',
  attention: '#fff8d6',
  attentionBord: '#e9b200',
  succesFond: '#f5fae5',
  infoFond: '#e1f4ff',
  stNegatif: '#aa0808',
  stCritique: '#b44f00',
  stInfo: '#0064d9',
  stPositif: '#256f3a',
  stNeutre: '#556b82',
};

/** Couleurs sémantiques des statuts : les mêmes que le panneau web et la carte. */
export const COULEUR_STATUT: Record<StatutFuite, string> = {
  detectee: COULEURS.stNegatif,
  en_reparation: COULEURS.stCritique,
  reparee: COULEURS.stInfo,
  achevee: COULEURS.stPositif,
  sans_reparation: COULEURS.stNeutre,
};

const HAUTEUR_STATUT = StatusBar.currentHeight ?? 24;

/** Barre d'application sombre (shell Fiori) : retour ou logo, titre, sous-titre, actions à droite. */
export function BarreApp({ titre, sousTitre, retour, droite }: {
  titre: string; sousTitre?: string; retour?: () => void; droite?: ReactNode;
}) {
  return (
    <View style={s.barre}>
      {retour ? (
        <Pressable
          onPress={retour}
          style={({ pressed }) => [s.retour, pressed && s.barreAppuye]}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Text style={s.texteRetour}>←</Text>
        </Pressable>
      ) : <View style={s.goutte} />}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.titreBarre} numberOfLines={1}>{titre}</Text>
        {!!sousTitre && <Text style={s.sousTitreBarre} numberOfLines={1}>{sousTitre}</Text>}
      </View>
      {droite}
    </View>
  );
}

export function BoutonBarre({ titre, onPress }: { titre: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.boutonBarre, pressed && s.barreAppuye]} accessibilityRole="button">
      <Text style={{ color: COULEURS.shellTexte, fontSize: 16, fontWeight: '600' }}>{titre}</Text>
    </Pressable>
  );
}

/** Bouton « fantôme » par défaut ; `primaire` = action principale (bleu) ; `danger` = suppression (rouge). */
export function Bouton({ titre, onPress, primaire, danger, desactive, occupe }: {
  titre: string; onPress: () => void; primaire?: boolean; danger?: boolean; desactive?: boolean; occupe?: boolean;
}) {
  const inactif = !!(desactive || occupe);
  return (
    <Pressable
      onPress={onPress}
      disabled={inactif}
      style={({ pressed }) => [
        s.bouton, primaire && s.primaire, danger && s.boutonDanger,
        pressed && (primaire ? s.primaireAppuye : danger ? s.dangerAppuye : s.boutonAppuye),
        inactif && s.inactif,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactif, busy: !!occupe }}
    >
      {occupe ? <ActivityIndicator color={primaire ? '#fff' : COULEURS.principal} /> : (
        <Text style={[s.texteBouton, primaire && { color: '#fff' }, danger && { color: COULEURS.danger }]}>{titre}</Text>
      )}
    </Pressable>
  );
}

export const Carte = ({ children }: { children: ReactNode }) => <View style={s.carte}>{children}</View>;

/** Statut Fiori : texte coloré précédé d'un point. */
export function Statut({ statut, gros }: { statut: StatutFuite; gros?: boolean }) {
  const couleur = COULEUR_STATUT[statut] ?? COULEURS.discret;
  return (
    <View style={s.statut}>
      <View style={[s.point, { backgroundColor: couleur }, gros && { width: 12, height: 12, borderRadius: 6 }]} />
      <Text style={[s.texteStatut, { color: couleur }, gros && { fontSize: 18 }]}>{STATUTS[statut] ?? statut}</Text>
    </View>
  );
}

export const Alerte = ({ texte }: { texte: string }) => <Text style={s.alerte}>{texte}</Text>;

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

export function BoutonYAller({ latitude, longitude, libelle }: { latitude: number | null | undefined; longitude: number | null | undefined; libelle: string }) {
  const position = latitude != null && longitude != null;
  return (
    <Bouton
      titre={position ? '➜ Y aller' : 'Y aller (pas de position GPS)'}
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
            style={({ pressed }) => [s.puce, pressed && !actif && s.boutonAppuye, actif && s.puceActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: actif }}
          >
            <Text style={[s.textePuce, actif && { color: '#fff' }]}>{o.libelle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Case à cocher sur toute la largeur (facile au doigt). */
export function Case({ libelle, valeur, onChange }: { libelle: string; valeur: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!valeur)}
      style={[s.case, valeur && { borderColor: COULEURS.principal, backgroundColor: COULEURS.principalClair }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: valeur }}
    >
      <View style={[s.coche, valeur && { backgroundColor: COULEURS.principal }]}>
        {valeur && <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✓</Text>}
      </View>
      <Text style={{ fontSize: 17, color: COULEURS.texte, flex: 1 }}>{libelle}</Text>
    </Pressable>
  );
}

/** Zone de saisie au style Fiori : bord bleu quand elle a le curseur. */
export function Saisie(props: ComponentProps<typeof TextInput>) {
  const [actif, setActif] = useState(false);
  return (
    <TextInput
      placeholderTextColor={COULEURS.discret}
      {...props}
      style={[s.champ, actif && s.champActif, props.style]}
      onFocus={(e) => { setActif(true); props.onFocus?.(e); }}
      onBlur={(e) => { setActif(false); props.onBlur?.(e); }}
    />
  );
}

export function Champ({ libelle, valeur, onChange, nombre, multiligne, indication }: {
  libelle: string; valeur: string; onChange: (t: string) => void; nombre?: boolean; multiligne?: boolean; indication?: string;
}) {
  return (
    <View style={{ gap: 4, flexGrow: 1, flexBasis: nombre ? 120 : 220 }}>
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

/** Vignettes de photos (fichier local ou adresse signée) ; un appui retire la photo si `retirer` est fourni. */
export function Vignettes({ photos, retirer }: {
  photos: { id: string; uri?: string; legende: string }[]; retirer?: (id: string) => void;
}) {
  if (!photos.length) return null;
  return (
    <View style={s.ligne}>
      {photos.map((p) => (
        <Pressable key={p.id} onPress={retirer ? () => retirer(p.id) : undefined} disabled={!retirer} style={{ width: 112, gap: 2 }}>
          {p.uri ? (
            <Image source={{ uri: p.uri }} style={s.vignette} />
          ) : (
            <View style={[s.vignette, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={[s.discret, { textAlign: 'center', fontSize: 13 }]}>Visible avec le réseau</Text>
            </View>
          )}
          <Text style={[s.discret, { fontSize: 13 }]}>{p.legende}{retirer ? ' · Retirer' : ''}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const message = { padding: 10, borderRadius: 6, borderLeftWidth: 3, fontSize: 16 } as const;

export const s = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: COULEURS.fond },
  contenu: { padding: 16, gap: 12 },
  defile: { padding: 16, gap: 12, paddingBottom: 40 },
  barre: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COULEURS.shell,
    paddingTop: HAUTEUR_STATUT + 6, paddingBottom: 8, paddingHorizontal: 12, minHeight: HAUTEUR_STATUT + 62,
  },
  barreAppuye: { backgroundColor: 'rgba(255,255,255,0.12)' },
  retour: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  texteRetour: { color: COULEURS.shellTexte, fontSize: 26, fontWeight: '700' },
  goutte: {
    width: 20, height: 20, marginHorizontal: 8, backgroundColor: '#7cc3ff',
    borderTopLeftRadius: 10, borderTopRightRadius: 10, borderBottomRightRadius: 10, transform: [{ rotate: '-45deg' }],
  },
  titreBarre: { color: COULEURS.shellTexte, fontSize: 19, fontWeight: '700' },
  sousTitreBarre: { color: COULEURS.shellTexte, opacity: 0.75, fontSize: 14 },
  boutonBarre: {
    minHeight: 48, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  carte: {
    backgroundColor: COULEURS.carte, borderColor: COULEURS.bordDoux, borderWidth: 1, borderRadius: 8,
    padding: 16, gap: 10, elevation: 1,
  },
  sousTitre: { fontSize: 18, fontWeight: '700', color: COULEURS.texte },
  texte: { fontSize: 16, color: COULEURS.texte },
  discret: { color: COULEURS.discret, fontSize: 15 },
  erreur: { ...message, color: COULEURS.danger, backgroundColor: COULEURS.dangerFond, borderLeftColor: COULEURS.danger },
  info: { ...message, color: COULEURS.stPositif, backgroundColor: COULEURS.succesFond, borderLeftColor: COULEURS.stPositif },
  attention: { ...message, color: COULEURS.texte, backgroundColor: COULEURS.attention, borderLeftColor: COULEURS.attentionBord },
  etiquette: { fontWeight: '600', fontSize: 15, color: COULEURS.texte },
  champ: {
    minHeight: 52, borderWidth: 1, borderColor: COULEURS.bordChamp, borderRadius: 6, paddingHorizontal: 12,
    fontSize: 17, color: COULEURS.texte, backgroundColor: '#fff',
  },
  champActif: { borderColor: COULEURS.principal, borderWidth: 2, paddingHorizontal: 11 },
  multiligne: { minHeight: 88, textAlignVertical: 'top', paddingTop: 10 },
  bouton: {
    minHeight: 52, borderRadius: 8, borderWidth: 1, borderColor: COULEURS.bordBouton, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  boutonAppuye: { backgroundColor: COULEURS.survol, borderColor: COULEURS.principal },
  primaire: { backgroundColor: COULEURS.principal, borderColor: COULEURS.principal },
  primaireAppuye: { backgroundColor: COULEURS.principalFonce, borderColor: COULEURS.principalFonce },
  boutonDanger: { borderColor: COULEURS.dangerBord },
  dangerAppuye: { backgroundColor: COULEURS.dangerFond, borderColor: COULEURS.danger },
  inactif: { opacity: 0.45 },
  texteBouton: { fontSize: 17, fontWeight: '600', color: COULEURS.principal, textAlign: 'center' },
  ligne: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  puce: {
    minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, borderWidth: 1,
    borderColor: COULEURS.bordBouton, backgroundColor: '#fff',
  },
  puceActive: { backgroundColor: COULEURS.principal, borderColor: COULEURS.principal },
  textePuce: { fontSize: 16, fontWeight: '600', color: COULEURS.texte },
  case: {
    minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: COULEURS.bordBouton, backgroundColor: '#fff',
  },
  coche: {
    width: 26, height: 26, borderRadius: 4, borderWidth: 2, borderColor: COULEURS.principal,
    alignItems: 'center', justifyContent: 'center',
  },
  vignette: { width: 112, height: 112, borderRadius: 6, borderWidth: 1, borderColor: COULEURS.bord, backgroundColor: '#eaecee' },
  statut: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  point: { width: 10, height: 10, borderRadius: 5 },
  texteStatut: { fontSize: 16, fontWeight: '600' },
  alerte: {
    alignSelf: 'flex-start', color: COULEURS.danger, fontWeight: '600', fontSize: 15, backgroundColor: COULEURS.dangerFond,
    borderWidth: 1, borderColor: '#f4c3c3', borderRadius: 6, paddingVertical: 2, paddingHorizontal: 8,
  },
  separateur: { borderTopWidth: 1, borderColor: COULEURS.bordDoux, paddingTop: 10, gap: 4 },
});

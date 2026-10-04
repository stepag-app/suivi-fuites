import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

export const COULEURS = { principal: '#0b5d8a', fond: '#f3f6f8', carte: '#ffffff', bord: '#d5dde3', danger: '#b3261e', discret: '#5b6b77' };

export function Bouton({ titre, onPress, primaire, desactive, occupe }: {
  titre: string; onPress: () => void; primaire?: boolean; desactive?: boolean; occupe?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={desactive || occupe}
      style={[s.bouton, primaire && s.primaire, (desactive || occupe) && s.inactif]}
      accessibilityRole="button"
    >
      {occupe ? <ActivityIndicator color={primaire ? '#fff' : COULEURS.principal} /> : (
        <Text style={[s.texteBouton, primaire && { color: '#fff' }]}>{titre}</Text>
      )}
    </Pressable>
  );
}

export const Carte = ({ children }: { children: ReactNode }) => <View style={s.carte}>{children}</View>;

/** Choix unique par grosses puces ; un second appui sur la puce choisie la désélectionne (si facultatif). */
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
            style={[s.puce, actif && s.puceActive]}
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
      style={[s.case, valeur && { borderColor: COULEURS.principal, backgroundColor: '#e0effa' }]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: valeur }}
    >
      <Text style={{ fontSize: 24, color: COULEURS.principal, width: 30 }}>{valeur ? '☑' : '☐'}</Text>
      <Text style={{ fontSize: 17, color: '#12222d', flex: 1 }}>{libelle}</Text>
    </Pressable>
  );
}

export function Champ({ libelle, valeur, onChange, nombre, multiligne, indication }: {
  libelle: string; valeur: string; onChange: (t: string) => void; nombre?: boolean; multiligne?: boolean; indication?: string;
}) {
  return (
    <View style={{ gap: 4, flexGrow: 1, flexBasis: nombre ? 120 : 220 }}>
      <Text style={s.etiquette}>{libelle}</Text>
      <TextInput
        style={[s.champ, multiligne && { minHeight: 80, textAlignVertical: 'top', paddingTop: 10 }]}
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
        <Pressable key={p.id} onPress={retirer ? () => retirer(p.id) : undefined} disabled={!retirer} style={{ width: 104, gap: 2 }}>
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

export const s = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: COULEURS.fond },
  contenu: { padding: 16, gap: 12 },
  carte: { backgroundColor: COULEURS.carte, borderColor: COULEURS.bord, borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  titre: { fontSize: 24, fontWeight: '700', color: '#12222d' },
  sousTitre: { fontSize: 18, fontWeight: '700', color: '#12222d' },
  discret: { color: COULEURS.discret, fontSize: 15 },
  erreur: { color: COULEURS.danger, backgroundColor: '#fdecea', padding: 10, borderRadius: 8 },
  info: { color: '#14532d', backgroundColor: '#e6f4ea', padding: 10, borderRadius: 8 },
  etiquette: { fontWeight: '600', fontSize: 16, color: '#12222d' },
  champ: { minHeight: 52, borderWidth: 1, borderColor: '#aebcc6', borderRadius: 10, paddingHorizontal: 12, fontSize: 18, backgroundColor: '#fff' },
  bouton: { minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: COULEURS.principal, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaire: { backgroundColor: COULEURS.principal },
  inactif: { opacity: 0.5 },
  texteBouton: { fontSize: 18, fontWeight: '700', color: COULEURS.principal },
  ligne: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  puce: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: COULEURS.bord, backgroundColor: '#fff' },
  puceActive: { backgroundColor: COULEURS.principal, borderColor: COULEURS.principal },
  textePuce: { fontSize: 17, fontWeight: '600', color: '#12222d' },
  case: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: COULEURS.bord, backgroundColor: '#fff' },
  vignette: { width: 104, height: 104, borderRadius: 8, backgroundColor: '#e3e9ee' },
  attention: { color: '#7a4a00', backgroundColor: '#fff4e0', padding: 10, borderRadius: 8 },
  bandeau: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#e0effa' },
});

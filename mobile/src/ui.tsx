import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

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
  bandeau: { paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#e0effa' },
});

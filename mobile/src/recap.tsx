// Récapitulatif avant enregistrement (P4), comme une borne de commande : ce qui va être enregistré, les
// avertissements des gardes-fous (jamais bloquants), puis « Corriger » ou « Confirmer ».
import { Modal, ScrollView, Text, View } from 'react-native';
import { t } from './langue';
import { BarreApp, Bouton, Carte, Info, Message, s, TeteCarte, useBas } from './ui';

export interface LigneRecap { libelle: string; valeur: string | null | undefined }

export function Recapitulatif({ visible, titre, sousTitre, lignes, pieces, alertes, corriger, confirmer, occupe }: {
  visible: boolean; titre: string; sousTitre?: string; lignes: LigneRecap[];
  pieces?: { quantite: string; designation: string }[]; alertes: string[];
  corriger: () => void; confirmer: () => void; occupe?: boolean;
}) {
  const bas = useBas();
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={corriger}>
      <View style={s.ecran}>
        <BarreApp titre={titre} sousTitre={sousTitre} retour={corriger} />
        <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]}>
          <Text style={s.discret}>{t('Vérifiez avant d\'enregistrer. « Corriger » revient au formulaire sans rien perdre.')}</Text>
          {alertes.map((a) => <Message key={a} ton="attention">{a}</Message>)}
          <Carte>
            <View style={s.grille}>
              {lignes.filter((l) => !!l.valeur).map((l) => <Info key={l.libelle} libelle={l.libelle} valeur={l.valeur} />)}
            </View>
          </Carte>
          {!!pieces && (
            <Carte>
              <TeteCarte titre={t('Pièces posées')} compteur={pieces.length} />
              {pieces.length === 0 && <Text style={s.discret}>{t('Aucune pièce posée.')}</Text>}
              {pieces.map((p, i) => (
                <View key={`${p.designation}-${i}`} style={[s.ligne, { alignItems: 'center', flexWrap: 'nowrap' }]}>
                  <Text style={[s.texteFort, { minWidth: 56 }]}>{p.quantite} ×</Text>
                  <Text style={[s.texte, { flex: 1 }]}>{p.designation}</Text>
                </View>
              ))}
            </Carte>
          )}
          <View style={s.ligne}>
            <Bouton titre={t('Corriger')} icone="pencil" grand onPress={corriger} desactive={occupe} style={{ flexGrow: 1, flexBasis: 200 }} />
            <Bouton titre={t('Confirmer')} icone="check" primaire grand onPress={confirmer} occupe={occupe} style={{ flexGrow: 2, flexBasis: 260 }} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

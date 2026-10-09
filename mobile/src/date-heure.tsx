// Date et heure d'une saisie (P5) : proposées à l'ouverture de l'écran (maintenant), modifiables par le calendrier
// et l'horloge d'Android ; une date dans le futur est refusée.
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { t } from './langue';
import { Bouton, s } from './ui';

const deux = (n: number) => String(n).padStart(2, '0');
export const jourTexte = (d: Date) => `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
export const heureTexte = (d: Date) => `${deux(d.getHours())}:${deux(d.getMinutes())}`;

/** `iso` : date d'une saisie déjà faite (modification), gardée telle quelle (secondes comprises) si on n'y touche pas. */
export function useDateHeure(iso?: string | null) {
  const [depart] = useState(() => (iso ? new Date(iso) : new Date()));
  const [valeur, setValeur] = useState(depart);
  return {
    valeur,
    inchangee: !!iso && valeur.getTime() === depart.getTime(),
    changer: setValeur,
    remettre: () => setValeur(new Date()),
  };
}
export type DateHeureEtat = ReturnType<typeof useDateHeure>;

/** Date ISO à enregistrer, ou message si elle est dans le futur (marge de 10 min pour l'horloge de la tablette). */
export function controlerDate(d: Date): { iso: string } | { erreur: string } {
  if (d.getTime() > Date.now() + 10 * 60 * 1000) return { erreur: t('La date est dans le futur : vérifiez-la.') };
  return { iso: d.toISOString() };
}

export function DateHeure({ d, libelle }: { d: DateHeureEtat; libelle?: string }) {
  const ouvrir = (mode: 'date' | 'time') => DateTimePickerAndroid.open({
    value: d.valeur,
    mode,
    is24Hour: true,
    maximumDate: mode === 'date' ? new Date() : undefined,
    positiveButton: { label: t('OK') },
    negativeButton: { label: t('Annuler') },
    onValueChange: (_e, choisie) => {
      if (!choisie) return;
      const n = new Date(d.valeur);
      if (mode === 'date') n.setFullYear(choisie.getFullYear(), choisie.getMonth(), choisie.getDate());
      else n.setHours(choisie.getHours(), choisie.getMinutes(), 0, 0);
      d.changer(n);
    },
  });
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.etiquette}>{libelle ?? t('Date et heure des travaux')}</Text>
      <View style={s.ligne}>
        <Bouton titre={jourTexte(d.valeur)} icone="calendar" onPress={() => ouvrir('date')} style={{ flexGrow: 1, flexBasis: 170 }} />
        <Bouton titre={heureTexte(d.valeur)} icone="clock" onPress={() => ouvrir('time')} style={{ flexGrow: 1, flexBasis: 120 }} />
        <Bouton titre={t('Maintenant')} onPress={d.remettre} />
      </View>
    </View>
  );
}

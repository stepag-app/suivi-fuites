// Écran « À valider » du responsable (V1) : détections, réparations et réfections pas encore validées du marché
// (v_a_valider, seulement les étapes que le compte peut valider). Toutes cochées d'office ; « Valider (n) » les valide
// d'un coup (valider_etapes) ; avertissement « aucune photo », avec un accès à la fiche pour en ajouter. Avec réseau
// seulement : la validation se fait au serveur, rien n'est gardé sur la tablette.
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { dateHeure } from './fiche';
import { messageClair } from './file-attente';
import { Icone } from './icones';
import { t, useLangue } from './langue';
import { libelleListe } from './listes';
import { useSession } from './session';
import { jetonARenouveler } from './session-donnees';
import { supabase } from './supabase';
import { RESULTATS_REPARATION } from './types';
import { Badge, BarreApp, Bouton, COULEURS, Message, s, useBas, Vide } from './ui';

interface AValider {
  etape: 'detection' | 'reparation' | 'refection'; id: string; fuite_id: string; fuite_numero: number | null;
  reference_srm: string | null; adresse: string | null; resultat: string | null; date_etape: string; auteur: string | null;
  saisie_differee: boolean; nb_photos: number;
}

const ETAPES = { detection: 'Détection', reparation: 'Réparation', refection: 'Réfection' } as const;
const cleDe = (x: AValider) => `${x.etape}:${x.id}`;

/** Nombre d'étapes à valider (bouton de la liste), seulement pour qui peut valider. */
export async function compterAValider(marcheId: string): Promise<number | null> {
  const { count, error } = await supabase.from('v_a_valider').select('id', { count: 'exact', head: true }).eq('marche_id', marcheId);
  return error ? null : count ?? 0;
}

export function AValiderEcran({ retour, ouvrir }: { retour: () => void; ouvrir: (fuiteId: string) => void }) {
  const { marche, aRenouveler } = useSession();
  useLangue();
  const bas = useBas();
  const [liste, setListe] = useState<AValider[] | null>(null);
  const [cochees, setCochees] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ texte: string; ok: boolean } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const horsLigne = aRenouveler || jetonARenouveler();

  const charger = useCallback(async () => {
    if (!marche || horsLigne) return;
    const { data, error } = await supabase.from('v_a_valider')
      .select('etape, id, fuite_id, fuite_numero, reference_srm, adresse, resultat, date_etape, auteur, saisie_differee, nb_photos')
      .eq('marche_id', marche.id).order('date_etape');
    if (error) {
      setMessage({ texte: messageClair(error), ok: false });
      setListe([]);
      return;
    }
    const lignes = (data ?? []) as AValider[];
    setListe(lignes);
    setCochees(new Set(lignes.map(cleDe)));
  }, [marche, horsLigne]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const choisies = (liste ?? []).filter((x) => cochees.has(cleDe(x)));
  const sansPhoto = choisies.filter((x) => Number(x.nb_photos) === 0).length;

  async function valider() {
    const go = async () => {
      setOccupe(true);
      setMessage(null);
      const { data, error } = await supabase.rpc('valider_etapes', { p_elements: choisies.map((x) => ({ etape: x.etape, id: x.id })) });
      setOccupe(false);
      if (error) return setMessage({ texte: messageClair(error), ok: false });
      setMessage({ texte: t('{n} étape(s) validée(s).', { n: Number(data ?? 0) }), ok: true });
      void charger();
    };
    if (!sansPhoto) return go();
    Alert.alert(t('Aucune photo'), t('{n} étape(s) sans photo. Valider quand même ?', { n: sansPhoto }), [
      { text: t('Annuler'), style: 'cancel' },
      { text: t('Valider'), onPress: () => void go() },
    ]);
  }

  const basculer = (x: AValider) => setCochees((c) => {
    const n = new Set(c);
    if (n.has(cleDe(x))) n.delete(cleDe(x));
    else n.add(cleDe(x));
    return n;
  });

  return (
    <View style={s.ecran}>
      <BarreApp titre={t('À valider')} sousTitre={marche?.code} retour={retour} />
      <View style={[s.contenu, { flex: 1, paddingBottom: 0 }]}>
        {horsLigne && <Message ton="attention" icone="wifi-off">{t('La validation a besoin de la connexion.')}</Message>}
        {!!message && <Message ton={message.ok ? 'info' : 'erreur'}>{message.texte}</Message>}
        {!!liste?.length && (
          <View style={[s.ligne, { alignItems: 'center', justifyContent: 'space-between' }]}>
            <Bouton
              titre={cochees.size === liste.length ? t('Tout décocher') : t('Tout cocher')}
              onPress={() => setCochees(cochees.size === liste.length ? new Set() : new Set(liste.map(cleDe)))}
            />
            <Bouton
              titre={t('Valider ({n})', { n: choisies.length })} icone="check" primaire grand
              onPress={() => void valider()} occupe={occupe} desactive={!choisies.length}
            />
          </View>
        )}
        <FlatList
          data={liste ?? []}
          keyExtractor={cleDe}
          contentContainerStyle={{ paddingBottom: 24 + bas }}
          ItemSeparatorComponent={() => <View style={v.separation} />}
          refreshing={false}
          onRefresh={() => void charger()}
          ListEmptyComponent={liste && !horsLigne ? <Vide texte={t('Rien à valider.')} /> : null}
          renderItem={({ item }) => {
            const actif = cochees.has(cleDe(item));
            return (
              <View style={v.ligne}>
                <Pressable
                  onPress={() => basculer(item)} style={v.case}
                  accessibilityRole="checkbox" accessibilityState={{ checked: actif }}
                >
                  <View style={[s.coche, actif && s.cocheActive]}>
                    {actif && <Icone nom="check" taille={16} epaisseur={3} couleur={COULEURS.principalTexte} />}
                  </View>
                </Pressable>
                <Pressable onPress={() => ouvrir(item.fuite_id)} style={({ pressed }) => [{ flex: 1, gap: 4 }, pressed && s.appuye]} accessibilityRole="button">
                  <View style={[s.ligne, { alignItems: 'center', gap: 8 }]}>
                    <Badge texte={t(ETAPES[item.etape])} carre />
                    <Text style={s.texteFort}>
                      {item.fuite_numero != null ? t('Fuite N° {numero}', { numero: item.fuite_numero }) : t('Fuite à envoyer')}
                    </Text>
                    {item.etape === 'reparation' && !!item.resultat && (
                      <Text style={s.discret}>{libelleListe('resultat_reparation', item.resultat, RESULTATS_REPARATION[item.resultat as 'reparee'])}</Text>
                    )}
                    {item.etape === 'refection' && !!item.resultat && (
                      <Text style={s.discret}>{item.resultat === 'faite' ? t('Réfection faite') : t('Clôturée sans réfection')}</Text>
                    )}
                  </View>
                  <Text style={s.discret}>{[item.reference_srm, item.adresse].filter(Boolean).join(' · ') || t('Sans référence ni adresse')}</Text>
                  <Text style={s.petit}>{t('{date} par {agent}', { date: dateHeure(item.date_etape), agent: item.auteur ?? '—' })}</Text>
                  <View style={[s.ligne, { gap: 8 }]}>
                    {Number(item.nb_photos) === 0 && <Badge texte={t('Aucune photo : ouvrir la fiche pour en ajouter')} ton="orange" icone="camera" />}
                    {item.saisie_differee && <Badge texte={t('Saisie différée')} ton="neutre" icone="clock" />}
                  </View>
                </Pressable>
                <Icone nom="chevron-right" couleur={COULEURS.discret} />
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

const v = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingRight: 8 },
  case: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  separation: { height: 1, backgroundColor: COULEURS.bord },
});

// Écrans « Mes chiffres » et « À faire » de l'agent (demande d'Issam du 2026-10-15), par rôle et par marché, en
// lecture seule : chiffres du compte (aujourd'hui, semaine, mois) et chiffres du marché ; actions qui l'attendent,
// urgentes d'abord puis les plus anciennes, comme le volet « À faire » du panneau. Sans réseau : dernière copie.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { dateHeure } from './fiche';
import { Icone, type NomIcone } from './icones';
import { t, useLangue } from './langue';
import { libelleListe } from './listes';
import { useSession } from './session';
import {
  chargerActions, chargerChiffres, duree, familleDe, filtresDe, longueur, pourcentage,
  type Action, type Actions, type Chiffres, type Filtre, type Periode, type Roles, type TypeAction,
} from './tableau-donnees';
import type { Cle } from './traductions';
import { EMPLACEMENTS } from './types';
import { Badge, BarreApp, BoutonYAller, COULEURS, Message, POLICE, s, Segments, STATUT_STYLE, useBas, Vide } from './ui';

const DELAI_MS = 20000;

/** Rôles de terrain du compte sur le marché choisi, comme les boutons de l'accueil. */
export function useRoles(): Roles & { terrain: boolean } {
  const { peut } = useSession();
  const roles = { detection: peut('fuites', 'creer'), reparation: peut('interventions', 'creer'), refection: peut('refections', 'creer') };
  return { ...roles, terrain: roles.detection || roles.reparation || roles.refection };
}

const jj = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;

export function MesChiffres({ retour, ouvrirAFaire }: { retour: () => void; ouvrirAFaire: (filtre: Filtre) => void }) {
  const { marche, profil, session, aRenouveler } = useSession();
  useLangue();
  const bas = useBas();
  const roles = useRoles();
  const [chiffres, setChiffres] = useState<Chiffres | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [rafraichit, setRafraichit] = useState(true);
  const [periode, setPeriode] = useState<Periode>('jour');
  const uid = session?.user.id;
  const marcheId = marche?.id;

  const charger = useCallback(async (copie: boolean) => {
    if (!uid || !marcheId) return;
    setRafraichit(true);
    const repondu = await chargerChiffres(uid, marcheId, { copie, aRenouveler, delaiMs: DELAI_MS, afficher: setChiffres });
    setHorsLigne(!repondu);
    setRafraichit(false);
  }, [uid, marcheId, aRenouveler]);
  useEffect(() => {
    void charger(true);
  }, [charger]);

  const p = chiffres?.periodes[periode];
  const m = chiffres?.marche;
  const delaiReparation = pourcentage(p?.reparees_dans_delai ?? 0, p?.reparees ?? 0);
  const delaiRefection = pourcentage(p?.refections_dans_delai ?? 0, p?.refections_delai_connu ?? 0);

  return (
    <View style={s.ecran}>
      <BarreApp titre={t('Mes chiffres')} sousTitre={[profil?.nom_complet, marche?.code].filter(Boolean).join(' · ')} retour={retour} />
      <ScrollView
        contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={() => void charger(false)} />}
      >
        <View style={[s.ligne, { alignItems: 'center', justifyContent: 'space-between' }]}>
          <Segments
            options={[
              { valeur: 'jour' as Periode, libelle: t("Aujourd'hui") },
              { valeur: 'semaine' as Periode, libelle: t('Semaine') },
              { valeur: 'mois' as Periode, libelle: t('Mois') },
            ]}
            valeur={periode}
            onChange={setPeriode}
          />
          {!!p && <Text style={s.discret}>{periode === 'jour' ? jj(p.du) : t('Du {du} au {au}', { du: jj(p.du), au: jj(p.au) })}</Text>}
        </View>
        {horsLigne && <Message ton="attention" icone="wifi-off">{t('Hors ligne : dernières données connues.')}</Message>}
        {!chiffres && !rafraichit && <Vide texte={t('Aucun chiffre gardé sur la tablette : connectez-vous au réseau.')} />}
        {!roles.terrain && <Vide texte={t('Aucun rôle de terrain sur ce marché.')} />}

        {!!p && !!m && roles.detection && (
          <Rangee titre={t('Détection')} point={STATUT_STYLE.detectee.point}>
            <Tuile valeur={String(p.detectees)} libelle={t('Fuites détectées')} />
            <Tuile valeur={longueur(p.balaye_m)} libelle={t('Réseau balayé')} />
            <Tuile valeur={t('{n} sur {total}', { n: p.deja_reparees, total: p.detectees })} libelle={t('Déjà réparées')} />
            <Tuile marche valeur={String(m.a_redetecter)} libelle={t('À re-détecter')} onPress={() => ouvrirAFaire('redetection')} />
          </Rangee>
        )}
        {!!p && !!m && roles.reparation && (
          <Rangee titre={t('Réparation')} point={STATUT_STYLE.reparee.point}>
            <Tuile valeur={String(p.reparees)} libelle={t('Fuites réparées')} />
            <Tuile
              valeur={delaiReparation == null ? '—' : `${delaiReparation} %`} libelle={t('Dans le délai')}
              precision={t('{n} sur {total} en moins de {h}\u00a0h', { n: p.reparees_dans_delai, total: p.reparees, h: chiffres.delais.reparation_h })}
            />
            <Tuile marche valeur={String(m.a_reparer)} libelle={t('Restent à réparer')} onPress={() => ouvrirAFaire('reparation')} />
          </Rangee>
        )}
        {!!p && !!m && roles.refection && (
          <Rangee titre={t('Réfection')} point={STATUT_STYLE.achevee.point}>
            <Tuile valeur={String(p.refections)} libelle={t('Réfections faites')} />
            <Tuile
              valeur={delaiRefection == null ? '—' : `${delaiRefection} %`} libelle={t('Dans le délai')}
              precision={t('{n} sur {total} dans le délai', { n: p.refections_dans_delai, total: p.refections_delai_connu })}
            />
            <Tuile marche valeur={String(m.a_refectionner)} libelle={t('Restent à faire')} onPress={() => ouvrirAFaire('refection')} />
          </Rangee>
        )}
        {!!chiffres && (
          <View style={s.ligneTitre}>
            <Icone nom="refresh-cw" taille={14} couleur={COULEURS.discret} />
            <Text style={s.petit}>{t('À jour : {date}', { date: dateHeure(chiffres.maj) })}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Rangee({ titre, point, children }: { titre: string; point: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <View style={s.ligneTitre}>
        <View style={[s.point, { width: 9, height: 9, borderRadius: 5, backgroundColor: point }]} />
        <Text style={s.sousTitre}>{titre}</Text>
      </View>
      <View style={c.grille}>{children}</View>
    </View>
  );
}

/** Chiffre clé ; `marche` : chiffre du marché, en pointillés, qui ouvre « À faire » filtré. */
function Tuile({ valeur, libelle, precision, marche, onPress }: {
  valeur: string; libelle: string; precision?: string; marche?: boolean; onPress?: () => void;
}) {
  const contenu = (
    <>
      <Text style={c.valeur} numberOfLines={1} adjustsFontSizeToFit>{valeur}</Text>
      <Text style={c.libelle}>{libelle}</Text>
      {!!precision && <Text style={s.petit}>{precision}</Text>}
      {marche && (
        <View style={[s.ligneTitre, { gap: 2 }]}>
          <Text style={s.petit}>{t('sur le marché')}</Text>
          <Icone nom="chevron-right" taille={14} couleur={COULEURS.discret} />
        </View>
      )}
    </>
  );
  if (!onPress) return <View style={c.tuile}>{contenu}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [c.tuile, marche && c.tuileMarche, pressed && s.appuye]} accessibilityRole="button">
      {contenu}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// À faire
// ---------------------------------------------------------------------------
const FILTRES: Record<Filtre, Cle> = {
  toutes: 'Toutes', corriger: 'À corriger', redetection: 'Re-détections', photo: 'Photos manquantes',
  reparation: 'Réparations', refection: 'Réfections',
};
const ICONES: Record<Exclude<Filtre, 'toutes'>, NomIcone> = {
  corriger: 'pencil', redetection: 'scan-search', photo: 'camera', reparation: 'wrench', refection: 'paint-roller',
};

function titreAction(a: Action): string {
  const numero = a.numero_affiche ?? '—';
  const titres: Record<TypeAction, string> = {
    corriger_detection: t('Corriger ma détection N° {numero}', { numero }),
    corriger_reparation: t('Corriger ma réparation N° {numero}', { numero }),
    corriger_refection: t('Corriger ma réfection N° {numero}', { numero }),
    redetection: t('Re-détecter la fuite N° {numero}', { numero }),
    photo: t('Photographier la fuite N° {numero}', { numero }),
    reparation: t('Réparer la fuite N° {numero}', { numero }),
    finir_reparation: t('Finir la réparation N° {numero}', { numero }),
    refection: t('Réfection de la fuite N° {numero}', { numero }),
  };
  return titres[a.type];
}

function detailAction(a: Action): string {
  if (familleDe(a.type) === 'corriger') return a.motif ? `« ${a.motif} »` : '';
  const lieu = [a.secteur, a.adresse].filter(Boolean);
  if (a.type === 'refection' && a.emplacement) lieu.unshift(libelleListe('emplacement', a.emplacement, EMPLACEMENTS[a.emplacement] ?? a.emplacement));
  return lieu.join(' · ') || t('Sans adresse');
}

function badgeUrgent(a: Action): string {
  if (a.type === 'reparation' || a.type === 'finir_reparation') return t('En retard');
  if (a.type === 'refection') return t('Hors délai');
  return t('Urgent');
}

function texteDuree(a: Action, maintenant: number): string {
  const d = duree(a.depuis, maintenant);
  if (!d) return '';
  return d.unite === 'min' ? t('{n}\u00a0min', { n: d.n }) : d.unite === 'h' ? t('{n}\u00a0h', { n: d.n }) : t('{n}\u00a0j', { n: d.n });
}

/** « TAIBI Abdelali » → « Abdelali » : le nom est en capitales (« NOM Prénom », chantier v2). */
const prenomDe = (nom: string) => nom.split(/\s+/).filter((m) => m !== m.toUpperCase()).join(' ') || nom;

export function AFaire({ retour, ouvrir, filtreInitial = 'toutes' }: {
  retour: () => void; ouvrir: (fuiteId: string, filtre: Filtre) => void; filtreInitial?: Filtre;
}) {
  const { marche, profil, session, aRenouveler } = useSession();
  useLangue();
  const bas = useBas();
  const roles = useRoles();
  const [actions, setActions] = useState<Actions | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [rafraichit, setRafraichit] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>(filtreInitial);
  const uid = session?.user.id;
  const marcheId = marche?.id;

  const charger = useCallback(async (copie: boolean) => {
    if (!uid || !marcheId) return;
    setRafraichit(true);
    const repondu = await chargerActions(uid, marcheId, { copie, aRenouveler, delaiMs: DELAI_MS, afficher: setActions });
    setHorsLigne(!repondu);
    setRafraichit(false);
  }, [uid, marcheId, aRenouveler]);
  useEffect(() => {
    void charger(true);
  }, [charger]);

  const liste = useMemo(() => actions?.liste ?? [], [actions]);
  const filtres = filtresDe(liste, roles);
  const affichees = filtre === 'toutes' ? liste : liste.filter((a) => familleDe(a.type) === filtre);
  const urgentes = liste.filter((a) => a.urgent).length;
  const maintenant = Date.now();
  const code = marche?.code ?? '';
  const resume = !actions ? '' : liste.length === 0
    ? t('Rien à faire sur {marche} : tout est à jour.', { marche: code })
    : urgentes
      ? t('{n} actions vous attendent sur {marche}, dont {u} urgentes.', { n: liste.length, marche: code, u: urgentes },
        `${liste.length} action${liste.length > 1 ? 's' : ''} vous attend${liste.length > 1 ? 'ent' : ''} sur ${code}, dont ${urgentes} urgente${urgentes > 1 ? 's' : ''}.`)
      : t('{n} actions vous attendent sur {marche}.', { n: liste.length, marche: code },
        `${liste.length} action${liste.length > 1 ? 's' : ''} vous attend${liste.length > 1 ? 'ent' : ''} sur ${code}.`);

  return (
    <View style={s.ecran}>
      <BarreApp titre={t('À faire')} sousTitre={[profil?.nom_complet, code].filter(Boolean).join(' · ')} retour={retour} />
      <FlatList
        data={affichees}
        keyExtractor={(a) => `${a.type}:${a.fuite_id}`}
        contentContainerStyle={[s.defile, { paddingBottom: 40 + bas, gap: 0 }]}
        refreshControl={<RefreshControl refreshing={rafraichit} onRefresh={() => void charger(false)} />}
        ListHeaderComponent={(
          <View style={{ gap: 14, marginBottom: 14 }}>
            <View style={{ gap: 4 }}>
              {!!profil && <Text style={s.h1}>{t('Bonjour, {prenom}.', { prenom: prenomDe(profil.nom_complet) })}</Text>}
              {!!resume && <Text style={s.discret}>{resume}</Text>}
            </View>
            {horsLigne && <Message ton="attention" icone="wifi-off">{t('Hors ligne : dernières données connues.')}</Message>}
            {!actions && !rafraichit && <Vide texte={t('Aucun chiffre gardé sur la tablette : connectez-vous au réseau.')} />}
            {!!actions && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {filtres.map((f) => {
                  const actif = f.cle === filtre;
                  return (
                    <Pressable
                      key={f.cle}
                      onPress={() => setFiltre(f.cle)}
                      style={({ pressed }) => [s.puce, c.filtre, pressed && !actif && s.appuye, actif && s.puceActive]}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: actif }}
                    >
                      <Text style={[s.textePuce, actif && { color: COULEURS.principalTexte }]}>{t(FILTRES[f.cle])}</Text>
                      <Text style={[s.nb, actif && c.nbActif]}>{f.nb}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
        ListEmptyComponent={actions ? <Vide texte={t('Rien à faire dans cette catégorie : tout est à jour.')} /> : null}
        ItemSeparatorComponent={() => <View style={c.separation} />}
        ListFooterComponent={actions ? (
          <View style={[s.ligneTitre, { marginTop: 16 }]}>
            <Icone nom="refresh-cw" taille={14} couleur={COULEURS.discret} />
            <Text style={s.petit}>{t('À jour : {date}', { date: dateHeure(actions.maj) })}</Text>
          </View>
        ) : null}
        renderItem={({ item: a }) => {
          const famille = familleDe(a.type);
          return (
            <Pressable
              onPress={() => ouvrir(a.fuite_id, filtre)}
              style={({ pressed }) => [c.ligne, pressed && s.appuye]}
              accessibilityRole="button"
            >
              <View style={c.icone}><Icone nom={ICONES[famille]} taille={18} couleur={COULEURS.discret} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.texteFort}>{titreAction(a)}</Text>
                {!!detailAction(a) && <Text style={s.discret} numberOfLines={2}>{detailAction(a)}</Text>}
              </View>
              {a.urgent && <Badge texte={badgeUrgent(a)} ton="rouge" />}
              <Text style={[s.petit, c.duree]}>{texteDuree(a, maintenant)}</Text>
              {famille !== 'corriger' && a.latitude != null && a.longitude != null && (
                <BoutonYAller latitude={a.latitude} longitude={a.longitude} libelle={t('Fuite N° {numero}', { numero: a.numero_affiche ?? '' })} />
              )}
              <Icone nom="chevron-right" couleur={COULEURS.discret} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const c = StyleSheet.create({
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tuile: {
    width: '23.5%', minWidth: 150, flexGrow: 0, backgroundColor: COULEURS.carte, borderWidth: 1, borderColor: COULEURS.bord,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 2,
  },
  tuileMarche: { backgroundColor: COULEURS.fond, borderStyle: 'dashed', borderColor: COULEURS.anneau },
  valeur: { fontFamily: POLICE, fontSize: 28, lineHeight: 34, fontWeight: '600', color: COULEURS.texte },
  libelle: { fontFamily: POLICE, fontSize: 15, color: COULEURS.discret },
  filtre: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nbActif: { backgroundColor: COULEURS.principalAppuye, color: COULEURS.principalTexte },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  icone: {
    width: 40, height: 40, borderRadius: 8, borderWidth: 1, borderColor: COULEURS.bord, alignItems: 'center', justifyContent: 'center',
  },
  duree: { minWidth: 44, textAlign: 'right' },
  separation: { height: 1, backgroundColor: COULEURS.bord },
});

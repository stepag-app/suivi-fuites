// Fiche d'une fuite : informations, statut, photos, réparations et réfections (serveur + saisies
// gardées sur la tablette). Jamais de prix ni de quantités du bordereau.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { chargerServeur, cleFiche, fuiteLocale, type Donnees } from './fiche-donnees';
import { estFuite, fuiteDe, lireAttente, surChangement, type Envoi, type EnvoiReparation, type EnvoiRefection } from './file-attente';
import { useParametres, type Parametres } from './parametres';
import { useSession } from './session';
import { supabase } from './supabase';
import {
  EMPLACEMENTS, MATERIAUX, OUVRAGES, RESULTATS_REPARATION, STATUTS, TYPES_PHOTO,
  type FicheFuite, type Refection, type Reparation,
} from './types';
import { Bouton, Carte, COULEURS, s, Vignettes } from './ui';

export const dateHeure = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const nombre = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('fr-FR', { maximumFractionDigits: 2 }));

/** Ce que les écrans de saisie reçoivent de la fiche. */
export interface ContexteSaisie {
  fuiteId: string;
  libelle: string;
  /** Dernière réparation connue (serveur ou tablette) : la réfection en reprend la fouille et le revêtement. */
  derniere: Pick<Reparation, 'fouille_longueur_m' | 'fouille_largeur_m' | 'nature_revetement_id'> | null;
}

export const libelleFuite = (f: Pick<FicheFuite, 'numero' | 'reference_srm'>) =>
  f.numero != null ? `Fuite N° ${f.numero}` : `Fuite à envoyer${f.reference_srm ? ` (${f.reference_srm})` : ''}`;

export function Fiche({ id, retour, saisir }: {
  id: string; retour: () => void; saisir: (type: 'reparation' | 'refection', contexte: ContexteSaisie) => void;
}) {
  const { marche, peut } = useSession();
  const parametres = useParametres(marche?.id);
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [locaux, setLocaux] = useState<Envoi[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [horsLigne, setHorsLigne] = useState(false);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    const attente = (await lireAttente()).filter((e) => fuiteDe(e) === id);
    setLocaux(attente);
    const serveur = await chargerServeur(id).catch(() => null);
    if (serveur) {
      setHorsLigne(false);
      setDonnees(serveur);
      AsyncStorage.setItem(cleFiche(id), JSON.stringify(serveur)).catch(() => undefined);
      if (serveur.photos.length) {
        const signees = await supabase.storage.from('photos').createSignedUrls(serveur.photos.map((p) => p.chemin), 3600);
        const table: Record<string, string> = {};
        for (const p of serveur.photos) {
          const u = signees.data?.find((x) => x.path === p.chemin)?.signedUrl;
          if (u) table[p.id] = u;
        }
        setUrls(table);
      }
    } else {
      setHorsLigne(true);
      const copie = await AsyncStorage.getItem(cleFiche(id)).catch(() => null);
      if (copie) setDonnees(JSON.parse(copie) as Donnees);
    }
    setChargement(false);
  }, [id]);

  useEffect(() => {
    charger();
    return surChangement(() => void charger());
  }, [charger]);

  const envoiFuite = locaux.find((e) => estFuite(e) && e.id === id);
  const fuite = donnees?.fuite ?? (envoiFuite ? fuiteLocale(envoiFuite) : null);

  if (chargement) return <View style={[s.ecran, s.contenu, { paddingTop: 48 }]}><Text style={s.discret}>Chargement…</Text></View>;
  if (!fuite) {
    return (
      <View style={[s.ecran, s.contenu, { paddingTop: 48 }]}>
        <Text style={s.erreur}>
          {horsLigne ? 'Fiche jamais ouverte sur cette tablette : elle sera disponible au retour du réseau.' : 'Fuite introuvable ou accès refusé.'}
        </Text>
        <Bouton titre="Retour à la liste" onPress={retour} />
      </View>
    );
  }

  const reparationsLocales = locaux.filter((e): e is EnvoiReparation => e.type === 'reparation');
  const refectionsLocales = locaux.filter((e): e is EnvoiRefection => e.type === 'refection');
  const reparations = donnees?.reparations ?? [];
  const refections = donnees?.refections ?? [];
  const toutesReparations = [...reparations, ...reparationsLocales.map((e) => e.ligne as unknown as Reparation)];
  const derniere = toutesReparations
    .slice()
    .sort((a, b) => (a.realisee_le < b.realisee_le ? 1 : -1))[0] ?? null;
  const verrouillee = !!fuite.verrouillee_le && !peut('interventions', 'valider');
  const peutSaisir = peut('interventions', 'creer') && !verrouillee;
  const contexte: ContexteSaisie = { fuiteId: id, libelle: libelleFuite(fuite), derniere };
  const libelleReference = marche?.libelle_reference || 'Référence client';

  const photosServeur = (donnees?.photos ?? []).map((p) => ({ id: p.id, uri: urls[p.id], legende: TYPES_PHOTO[p.type] ?? p.type }));
  const photosLocales = locaux.flatMap((e) => e.photos.map((p) => ({
    id: p.id, uri: p.fichier, legende: `${TYPES_PHOTO[p.type ?? 'detection']} (à envoyer)`,
  })));

  return (
    <ScrollView style={s.ecran} contentContainerStyle={[s.contenu, { paddingTop: 48 }]}>
      <Bouton titre="← Liste des fuites" onPress={retour} />
      <Text style={s.titre}>{libelleFuite(fuite)}</Text>
      <Text style={[s.sousTitre, { color: COULEURS.principal }]}>{STATUTS[fuite.statut]}</Text>
      {horsLigne && <Text style={s.discret}>Hors ligne : dernière version connue de la fiche.</Text>}
      {envoiFuite && <Text style={s.attention}>Cette fuite est encore sur la tablette : elle partira au retour du réseau.</Text>}
      {!!fuite.verrouillee_le && (
        <Text style={s.attention}>
          Fuite verrouillée le {dateHeure(fuite.verrouillee_le)} (lot d&apos;attachement arrêté)
          {verrouillee ? ' : saisie réservée au responsable.' : '.'}
        </Text>
      )}
      {fuite.alerte_non_reparee && (
        <Text style={s.erreur}>Non réparée depuis plus de {marche?.delai_alerte_reparation_h ?? 48} h</Text>
      )}

      <Carte>
        <Info libelle={libelleReference} valeur={fuite.reference_srm} />
        <Info libelle="Secteur" valeur={fuite.secteur ? `${fuite.secteur}${fuite.zone ? ` (${fuite.zone})` : ''}` : null} />
        <Info libelle="Adresse / repère" valeur={fuite.adresse} />
        <Info libelle="Ouvrage" valeur={fuite.ouvrage ? OUVRAGES[fuite.ouvrage] ?? fuite.ouvrage : null} />
        <Info libelle="Détectée" valeur={`${dateHeure(fuite.date_detection)}${fuite.detectee_par ? ` par ${fuite.detectee_par}` : ''}`} />
        {fuite.latitude != null && fuite.longitude != null && (
          <>
            <Info libelle="Position" valeur={`${fuite.latitude.toFixed(6)}, ${fuite.longitude.toFixed(6)}`} />
            <Bouton
              titre="Itinéraire (Maps)"
              onPress={() => Linking.openURL(`geo:${fuite.latitude},${fuite.longitude}?q=${fuite.latitude},${fuite.longitude}`).catch(() => undefined)}
            />
          </>
        )}
        {!!fuite.fuite_liee_id && <Info libelle="Re-détection" valeur="liée à une fuite déjà signalée" />}
        {!!fuite.motif_sans_reparation && <Info libelle="Motif" valeur={fuite.motif_sans_reparation} />}
        {!!fuite.observation && <Info libelle="Observation" valeur={fuite.observation} />}
      </Carte>

      <Carte>
        <Text style={s.sousTitre}>Photos ({photosServeur.length + photosLocales.length})</Text>
        {photosServeur.length + photosLocales.length === 0 && <Text style={s.discret}>Aucune photo.</Text>}
        <Vignettes photos={[...photosServeur, ...photosLocales]} />
      </Carte>

      <Carte>
        <Text style={s.sousTitre}>Réparations</Text>
        {toutesReparations.length === 0 && <Text style={s.discret}>Aucune réparation saisie.</Text>}
        {reparations.map((r) => (
          <BlocReparation key={r.id} r={r} parametres={parametres} donnees={donnees} />
        ))}
        {reparationsLocales.map((e) => (
          <BlocReparation
            key={e.id} r={{ ...(e.ligne as unknown as Reparation), id: e.id }} parametres={parametres}
            local={e} donnees={null}
          />
        ))}
        {peutSaisir && <Bouton titre="+ Saisir une réparation" primaire onPress={() => saisir('reparation', contexte)} />}
      </Carte>

      {(toutesReparations.length > 0 || refections.length > 0 || refectionsLocales.length > 0) && (
        <Carte>
          <Text style={s.sousTitre}>Réfections</Text>
          {refections.length + refectionsLocales.length === 0 && <Text style={s.discret}>Aucune réfection saisie.</Text>}
          {refections.map((r) => <BlocRefection key={r.id} r={r} parametres={parametres} />)}
          {refectionsLocales.map((e) => (
            <BlocRefection key={e.id} r={{ ...(e.ligne as unknown as Refection), id: e.id }} parametres={parametres} local={e} />
          ))}
          {peutSaisir && toutesReparations.length > 0 && (
            <Bouton titre="+ Saisir une réfection" primaire onPress={() => saisir('refection', contexte)} />
          )}
        </Carte>
      )}
      <Bouton titre="← Liste des fuites" onPress={retour} />
    </ScrollView>
  );
}

function Info({ libelle, valeur }: { libelle: string; valeur: string | null | undefined }) {
  return (
    <Text style={{ fontSize: 16 }}>
      <Text style={s.discret}>{libelle} : </Text>
      <Text style={{ color: '#12222d' }}>{valeur || '—'}</Text>
    </Text>
  );
}

function EtatEnvoi({ local }: { local?: Envoi }) {
  if (!local) return null;
  return local.erreur
    ? <Text style={s.erreur}>Pas encore envoyée : {local.erreur}</Text>
    : <Text style={s.attention}>Sur la tablette, envoi au retour du réseau.</Text>;
}

function BlocReparation({ r, parametres, donnees, local }: {
  r: Reparation; parametres: Parametres; donnees: Donnees | null; local?: EnvoiReparation;
}) {
  const equipe = parametres.equipes.find((e) => e.id === r.equipe_id)?.libelle;
  const motif = parametres.motifs.find((m) => m.id === r.motif_id)?.libelle_fr;
  const nature = parametres.natures.find((n) => n.id === r.nature_revetement_id)?.libelle_fr;
  const travaux = [
    r.tuyau_repare && 'tuyau réparé', r.robinet_pec_change && 'robinet PEC changé', r.collier_pec_change && 'collier PEC changé',
    r.bouche_a_cle_mise_a_niveau && 'bouche à clé mise à niveau', r.element_remplace && 'élément remplacé',
  ].filter(Boolean).join(', ');
  const designation = (pieceId: string | null, libre: string | null) =>
    parametres.pieces.find((p) => p.id === pieceId)?.designation ?? libre ?? 'Pièce';
  const pieces = local
    ? local.pieces.map((p) => `${nombre(p.quantite)} × ${p.designation}`)
    : (donnees?.pieces ?? []).filter((p) => p.reparation_id === r.id).map((p) => `${nombre(p.quantite)} × ${designation(p.piece_id, p.designation_libre)}`);
  const ouvriers = (local ? local.ouvriers : (donnees?.ouvriers ?? []).filter((o) => o.reparation_id === r.id).map((o) => o.ouvrier_id))
    .map((oid) => parametres.ouvriers.find((o) => o.id === oid)?.nom_complet ?? '?');
  return (
    <View style={{ borderTopWidth: 1, borderColor: COULEURS.bord, paddingTop: 8, gap: 2 }}>
      <Text style={s.etiquette}>{RESULTATS_REPARATION[r.resultat]} · {dateHeure(r.realisee_le)}{equipe ? ` · ${equipe}` : ''}</Text>
      {!!motif && <Text>Motif : {motif}</Text>}
      <Text style={s.discret}>
        {[r.ouvrage ? OUVRAGES[r.ouvrage] : null, r.materiau ? MATERIAUX[r.materiau] : null, r.diametre_mm ? `Ø ${r.diametre_mm} mm` : null]
          .filter(Boolean).join(' · ') || '—'}
      </Text>
      {!!travaux && <Text>{travaux}{r.longueur_pe_m ? ` · PE ${nombre(r.longueur_pe_m)} m` : ''}</Text>}
      {(r.fouille_longueur_m != null || r.fouille_largeur_m != null || r.fouille_profondeur_m != null) && (
        <Text>
          Fouille {nombre(r.fouille_longueur_m)} × {nombre(r.fouille_largeur_m)} × {nombre(r.fouille_profondeur_m)} m
          {r.emplacement ? ` · ${EMPLACEMENTS[r.emplacement] ?? r.emplacement}` : ''}
        </Text>
      )}
      {!!nature && <Text>Revêtement à refaire : {nature}</Text>}
      {!!r.representant_srm && <Text>Représentant présent : {r.representant_srm}</Text>}
      {pieces.length > 0 && <Text>Pièces : {pieces.join(' ; ')}</Text>}
      {ouvriers.length > 0 && <Text>Ouvriers : {ouvriers.join(', ')}</Text>}
      {!!r.observation && <Text style={s.discret}>{r.observation}</Text>}
      <EtatEnvoi local={local} />
    </View>
  );
}

function BlocRefection({ r, parametres, local }: { r: Refection; parametres: Parametres; local?: EnvoiRefection }) {
  const nature = parametres.natures.find((n) => n.id === r.nature_id)?.libelle_fr;
  const motif = parametres.motifs.find((m) => m.id === r.motif_id)?.libelle_fr;
  return (
    <View style={{ borderTopWidth: 1, borderColor: COULEURS.bord, paddingTop: 8, gap: 2 }}>
      <Text style={s.etiquette}>{r.resultat === 'faite' ? 'Réfection faite' : 'Clôturée sans réfection'} · {dateHeure(r.realisee_le)}</Text>
      {r.resultat === 'faite' ? (
        <Text>
          {nature ?? (local ? 'Revêtement prévu à la réparation' : '—')}
          {r.longueur_m != null || r.largeur_m != null ? ` · ${nombre(r.longueur_m)} × ${nombre(r.largeur_m)} m` : local ? ' · dimensions de la fouille' : ''}
        </Text>
      ) : <Text>Motif : {motif ?? '—'}</Text>}
      {!!r.observation && <Text style={s.discret}>{r.observation}</Text>}
      <EtatEnvoi local={local} />
    </View>
  );
}

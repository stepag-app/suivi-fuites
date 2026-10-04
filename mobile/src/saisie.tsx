// Saisie d'une réparation et d'une réfection par le chef de réparation, avec ou sans réseau.
// Tout est d'abord gardé sur la tablette (file d'attente), puis envoyé. Rien n'est recalculé ici :
// statut de la fuite et lignes de quantités avancent côté serveur (déclencheurs).
import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ajouterEnvoi, effacerPhotos, synchroniser, type PhotoAttente, type PieceAttente } from './file-attente';
import type { ContexteSaisie } from './fiche';
import { useParametres, type Parametres } from './parametres';
import { prendrePhoto } from './photo';
import { useSession } from './session';
import { EMPLACEMENTS, MATERIAUX, OUVRAGES, RESULTATS_REPARATION, TYPES_PHOTO, type ResultatReparation, type TypePhoto } from './types';
import { Bouton, Carte, Case, Champ, COULEURS, Puces, s, Vignettes } from './ui';

const nombreOuNul = (t: string) => {
  const n = Number(t.trim().replace(',', '.'));
  return t.trim() === '' || Number.isNaN(n) ? null : n;
};
const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const options = (table: Record<string, string>) => Object.entries(table).map(([valeur, libelle]) => ({ valeur, libelle }));
const deux = (n: number) => String(n).padStart(2, '0');

function masquer(t: string, masque: string) {
  const chiffres = t.replace(/\D/g, '');
  let i = 0;
  let sortie = '';
  for (const c of masque) {
    if (i >= chiffres.length) break;
    sortie += c === '9' ? chiffres[i++] : c;
  }
  return sortie;
}

/** Date et heure saisies (JJ/MM/AAAA, HH:MM) ; null si invalide. */
function lireDate(jour: string, heure: string): Date | null {
  const j = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(jour);
  const h = /^(\d{2}):(\d{2})$/.exec(heure);
  if (!j || !h) return null;
  const d = new Date(Number(j[3]), Number(j[2]) - 1, Number(j[1]), Number(h[1]), Number(h[2]));
  return d.getDate() === Number(j[1]) && d.getMonth() === Number(j[2]) - 1 && d.getHours() === Number(h[1]) ? d : null;
}

function useDateHeure() {
  const maintenant = () => {
    const d = new Date();
    return { jour: `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`, heure: `${deux(d.getHours())}:${deux(d.getMinutes())}` };
  };
  const [valeur, setValeur] = useState(maintenant);
  return { ...valeur, setJour: (t: string) => setValeur((v) => ({ ...v, jour: masquer(t, '99/99/9999') })),
    setHeure: (t: string) => setValeur((v) => ({ ...v, heure: masquer(t, '99:99') })), remettre: () => setValeur(maintenant()) };
}

/** Contrôle commun : renvoie la date ISO ou un message d'erreur. */
function controlerDate(jour: string, heure: string): { iso: string } | { erreur: string } {
  const d = lireDate(jour, heure);
  if (!d) return { erreur: 'Date ou heure invalide (JJ/MM/AAAA et HH:MM).' };
  if (d.getTime() > Date.now() + 10 * 60 * 1000) return { erreur: 'La date est dans le futur : vérifiez-la.' };
  return { iso: d.toISOString() };
}

function DateHeure({ d }: { d: ReturnType<typeof useDateHeure> }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.etiquette}>Date et heure des travaux</Text>
      <View style={s.ligne}>
        <TextInput style={[s.champ, { flexGrow: 1, flexBasis: 150 }]} value={d.jour} onChangeText={d.setJour} keyboardType="number-pad" placeholder="JJ/MM/AAAA" maxLength={10} />
        <TextInput style={[s.champ, { flexGrow: 1, flexBasis: 100 }]} value={d.heure} onChangeText={d.setHeure} keyboardType="number-pad" placeholder="HH:MM" maxLength={5} />
        <Bouton titre="Maintenant" onPress={d.remettre} />
      </View>
    </View>
  );
}

function ChoixEquipe({ parametres, valeur, onChange }: { parametres: Parametres; valeur: string; onChange: (v: string) => void }) {
  const reparation = parametres.equipes.filter((e) => e.type !== 'detection');
  const liste = reparation.length ? reparation : parametres.equipes;
  if (!liste.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.etiquette}>Équipe</Text>
      <Puces facultatif options={liste.map((e) => ({ valeur: e.id, libelle: e.libelle }))} valeur={valeur} onChange={onChange} />
    </View>
  );
}

/** Photos d'une saisie : un bouton par type, vignettes ; supprimées de la tablette si la saisie est abandonnée. */
function usePhotos() {
  const [photos, setPhotos] = useState<PhotoAttente[]>([]);
  const [erreur, setErreur] = useState('');
  const gardees = useRef(false);
  const courant = useRef<PhotoAttente[]>([]);
  courant.current = photos;
  // Écran quitté sans enregistrer (Annuler, bouton retour d'Android) : on efface les fichiers.
  useEffect(() => () => {
    if (!gardees.current) void effacerPhotos(courant.current);
  }, []);
  async function prendre(type: TypePhoto) {
    setErreur('');
    try {
      const r = await prendrePhoto(type, true);
      if (typeof r === 'string') setErreur(r);
      else if (r) setPhotos((p) => [...p, r]);
    } catch (e) {
      setErreur(`Photo impossible : ${String((e as Error).message ?? e)}`);
    }
  }
  function retirer(id: string) {
    const p = photos.find((x) => x.id === id);
    if (p) void effacerPhotos([p]);
    setPhotos(photos.filter((x) => x.id !== id));
  }
  return { photos, erreur, prendre, retirer, garder: () => { gardees.current = true; } };
}

function BlocPhotos({ ph, types }: { ph: ReturnType<typeof usePhotos>; types: TypePhoto[] }) {
  return (
    <Carte>
      <Text style={s.sousTitre}>Photos ({ph.photos.length})</Text>
      <View style={s.ligne}>
        {types.map((t) => (
          <View key={t} style={{ flexGrow: 1, flexBasis: 150 }}>
            <Bouton titre={`📷 ${TYPES_PHOTO[t]} (${ph.photos.filter((p) => p.type === t).length})`} onPress={() => ph.prendre(t)} />
          </View>
        ))}
      </View>
      {!!ph.erreur && <Text style={s.erreur}>{ph.erreur}</Text>}
      <Vignettes photos={ph.photos.map((p) => ({ id: p.id, uri: p.fichier, legende: TYPES_PHOTO[p.type ?? 'autre'] }))} retirer={ph.retirer} />
    </Carte>
  );
}

// ---------------------------------------------------------------------------
// Réparation
// ---------------------------------------------------------------------------
export function SaisieReparation({ contexte, retour }: { contexte: ContexteSaisie; retour: () => void }) {
  const { marche } = useSession();
  const parametres = useParametres(marche?.id);
  const sigle = marche?.client_sigle?.trim() || marche?.client?.trim() || 'du maître d\'ouvrage';
  const [resultat, setResultat] = useState<ResultatReparation | ''>('reparee');
  const [motifId, setMotifId] = useState('');
  const quand = useDateHeure();
  const [equipeId, setEquipeId] = useState('');
  const [ouvrage, setOuvrage] = useState('');
  const [materiau, setMateriau] = useState('');
  const [diametre, setDiametre] = useState('');
  const [tuyau, setTuyau] = useState(false);
  const [robinet, setRobinet] = useState(false);
  const [collier, setCollier] = useState(false);
  const [boucheACle, setBoucheACle] = useState(false);
  const [elementRemplace, setElementRemplace] = useState(false);
  const [longueurPe, setLongueurPe] = useState('');
  const [fL, setFL] = useState('');
  const [fl, setFl] = useState('');
  const [fP, setFP] = useState('');
  const [emplacement, setEmplacement] = useState('');
  const [natureId, setNatureId] = useState('');
  const [representant, setRepresentant] = useState('');
  const [pieces, setPieces] = useState<PieceAttente[]>([]);
  const [recherche, setRecherche] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [ouvriers, setOuvriers] = useState<string[]>([]);
  const [observation, setObservation] = useState('');
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const ph = usePhotos();

  const correspondances = useMemo(() => {
    const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    return parametres.pieces.filter((p) => mots.every((m) => sansAccents(p.designation).includes(m))).slice(0, 8);
  }, [recherche, parametres.pieces]);

  function ajouterPiece(pieceId: string | null, designation: string) {
    const q = nombreOuNul(quantite);
    if (!q || q <= 0) {
      setErreur('Quantité de la pièce : un nombre supérieur à 0.');
      return;
    }
    setErreur('');
    setPieces([...pieces, { id: Crypto.randomUUID(), piece_id: pieceId, designation, quantite: q }]);
    setRecherche('');
    setQuantite('1');
  }

  function choisirNature(id: string) {
    setNatureId(id);
    const n = parametres.natures.find((x) => x.id === id);
    if (n && n.emplacement !== 'autre') setEmplacement(n.emplacement);
  }

  const longueur = nombreOuNul(fL);
  const nonReparee = resultat === 'non_reparee';

  async function enregistrer() {
    if (!marche) return;
    setErreur('');
    if (!resultat) return setErreur('Choisissez le résultat.');
    if (nonReparee && !motifId) return setErreur('Fuite non réparée : choisissez le motif.');
    const date = controlerDate(quand.jour, quand.heure);
    if ('erreur' in date) return setErreur(date.erreur);
    const nombres = { diametre: nombreOuNul(diametre), pe: nombreOuNul(longueurPe), l: longueur, la: nombreOuNul(fl), p: nombreOuNul(fP) };
    const textes = { diametre, pe: longueurPe, l: fL, la: fl, p: fP };
    for (const k of Object.keys(nombres) as (keyof typeof nombres)[]) {
      if (textes[k].trim() !== '' && (nombres[k] == null || (nombres[k] ?? 0) < 0)) return setErreur(`Valeur numérique invalide : « ${textes[k]} ».`);
    }
    if (nombres.diametre != null && !Number.isInteger(nombres.diametre)) return setErreur('Diamètre : un nombre entier de millimètres.');
    setOccupe(true);
    const travaux = !nonReparee;
    try {
      await ajouterEnvoi({
        type: 'reparation', id: Crypto.randomUUID(), marche_id: marche.id, fuite_id: contexte.fuiteId,
        fuite_libelle: contexte.libelle, photos: ph.photos, pieces, ouvriers,
        ligne: {
          fuite_id: contexte.fuiteId, resultat, motif_id: nonReparee ? motifId : null, realisee_le: date.iso,
          equipe_id: equipeId || null, ouvrage: ouvrage || null, materiau: materiau || null, diametre_mm: nombres.diametre,
          tuyau_repare: travaux && tuyau, robinet_pec_change: travaux && robinet, collier_pec_change: travaux && collier,
          bouche_a_cle_mise_a_niveau: travaux && boucheACle, element_remplace: travaux && elementRemplace,
          longueur_pe_m: travaux && tuyau && materiau === 'polyethylene' ? nombres.pe : null,
          fouille_longueur_m: nombres.l, fouille_largeur_m: nombres.la, fouille_profondeur_m: nombres.p,
          emplacement: emplacement || null, nature_revetement_id: natureId || null,
          representant_srm: representant.trim() || null, observation: observation.trim() || null, source_saisie: 'tablette',
        },
      });
      ph.garder();
      void synchroniser().catch(() => undefined);
      retour();
    } catch (e) {
      setErreur(`Enregistrement sur la tablette impossible : ${String((e as Error).message ?? e)}`);
      setOccupe(false);
    }
  }

  return (
    <ScrollView style={s.ecran} contentContainerStyle={[s.contenu, { paddingTop: 48 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.titre}>Réparation · {contexte.libelle}</Text>

      <Carte>
        <Text style={s.etiquette}>Résultat</Text>
        <Puces options={options(RESULTATS_REPARATION) as { valeur: ResultatReparation; libelle: string }[]} valeur={resultat} onChange={setResultat} />
        {nonReparee && (
          <>
            <Text style={s.etiquette}>Motif (obligatoire)</Text>
            <Puces
              options={parametres.motifs.filter((m) => m.categorie === 'sans_reparation').map((m) => ({ valeur: m.id, libelle: m.libelle_fr }))}
              valeur={motifId} onChange={setMotifId}
            />
          </>
        )}
        <DateHeure d={quand} />
        <ChoixEquipe parametres={parametres} valeur={equipeId} onChange={setEquipeId} />
      </Carte>

      <Carte>
        <Text style={s.sousTitre}>Constat</Text>
        <Text style={s.etiquette}>Ouvrage</Text>
        <Puces facultatif options={options(OUVRAGES)} valeur={ouvrage} onChange={setOuvrage} />
        <Text style={s.etiquette}>Matériau</Text>
        <Puces facultatif options={options(MATERIAUX)} valeur={materiau} onChange={setMateriau} />
        <Champ libelle="Diamètre (mm) : DE pour le PE, DN pour les conduites" valeur={diametre} onChange={setDiametre} nombre />
      </Carte>

      {!nonReparee && (
        <Carte>
          <Text style={s.sousTitre}>Travaux réalisés</Text>
          <Case libelle="Tuyau / conduite réparé(e)" valeur={tuyau} onChange={setTuyau} />
          <Case libelle="Robinet PEC changé" valeur={robinet} onChange={setRobinet} />
          <Case libelle="Collier PEC changé" valeur={collier} onChange={setCollier} />
          <Case libelle="Bouche à clé mise à niveau" valeur={boucheACle} onChange={setBoucheACle} />
          <Case libelle="Élément de conduite remplacé" valeur={elementRemplace} onChange={setElementRemplace} />
          {tuyau && materiau === 'polyethylene' && (
            <Champ libelle="Longueur de PE posée (m)" valeur={longueurPe} onChange={setLongueurPe} nombre />
          )}
        </Carte>
      )}

      <Carte>
        <Text style={s.sousTitre}>Fouille</Text>
        <View style={s.ligne}>
          <Champ libelle="Longueur (m)" valeur={fL} onChange={setFL} nombre />
          <Champ libelle="Largeur (m)" valeur={fl} onChange={setFl} nombre />
          <Champ libelle="Profondeur (m)" valeur={fP} onChange={setFP} nombre />
        </View>
        {longueur != null && longueur > 2 && !elementRemplace && (
          <Text style={s.attention}>Longueur supérieure à 2 m : à justifier par un élément de conduite remplacé.</Text>
        )}
        <Text style={s.etiquette}>Revêtement à refaire</Text>
        <Puces facultatif options={parametres.natures.map((n) => ({ valeur: n.id, libelle: n.libelle_fr }))} valeur={natureId} onChange={choisirNature} />
        <Text style={s.etiquette}>Emplacement</Text>
        <Puces facultatif options={options(EMPLACEMENTS)} valeur={emplacement} onChange={setEmplacement} />
        <Champ libelle={`Représentant ${sigle} présent (nom)`} valeur={representant} onChange={setRepresentant} />
      </Carte>

      <Carte>
        <Text style={s.sousTitre}>Pièces posées</Text>
        {pieces.map((p) => (
          <View key={p.id} style={[s.ligne, { alignItems: 'center' }]}>
            <Text style={{ flex: 1, fontSize: 16 }}>{p.quantite} × {p.designation}{p.piece_id ? '' : ' (libre)'}</Text>
            <Pressable onPress={() => setPieces(pieces.filter((x) => x.id !== p.id))} style={s.puce} accessibilityRole="button">
              <Text style={{ color: COULEURS.danger, fontWeight: '700' }}>Retirer</Text>
            </Pressable>
          </View>
        ))}
        <View style={s.ligne}>
          <View style={{ flexGrow: 3, flexBasis: 220 }}>
            <Champ libelle="Rechercher dans le catalogue" valeur={recherche} onChange={setRecherche} indication="ex. collier 63" />
          </View>
          <View style={{ flexGrow: 1, flexBasis: 90 }}>
            <Champ libelle="Quantité" valeur={quantite} onChange={setQuantite} nombre />
          </View>
        </View>
        {correspondances.map((p) => (
          <Pressable key={p.id} onPress={() => ajouterPiece(p.id, p.designation)} style={s.case} accessibilityRole="button">
            <Text style={{ fontSize: 16, flex: 1 }}>+ {p.designation}</Text>
            <Text style={s.discret}>{p.unite}</Text>
          </Pressable>
        ))}
        {!!recherche.trim() && (
          <Bouton titre={`+ « ${recherche.trim()} » (désignation libre)`} onPress={() => ajouterPiece(null, recherche.trim())} />
        )}
        {!parametres.pieces.length && <Text style={s.discret}>Catalogue pas encore chargé sur cette tablette : désignation libre seulement.</Text>}
      </Carte>

      {parametres.ouvriers.length > 0 && (
        <Carte>
          <Text style={s.sousTitre}>Ouvriers (facultatif)</Text>
          <View style={s.ligne}>
            {parametres.ouvriers.map((o) => {
              const actif = ouvriers.includes(o.id);
              return (
                <Pressable
                  key={o.id}
                  onPress={() => setOuvriers(actif ? ouvriers.filter((x) => x !== o.id) : [...ouvriers, o.id])}
                  style={[s.puce, actif && s.puceActive]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: actif }}
                >
                  <Text style={[s.textePuce, actif && { color: '#fff' }]}>{o.nom_complet}</Text>
                </Pressable>
              );
            })}
          </View>
        </Carte>
      )}

      <BlocPhotos ph={ph} types={['avant', 'pendant', 'apres']} />

      <Carte>
        <Champ libelle="Observation" valeur={observation} onChange={setObservation} multiligne />
      </Carte>

      {!!erreur && <Text style={s.erreur}>{erreur}</Text>}
      <Bouton titre="Enregistrer la réparation" primaire onPress={enregistrer} occupe={occupe} />
      <Bouton titre="Annuler" onPress={retour} desactive={occupe} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Réfection
// ---------------------------------------------------------------------------
export function SaisieRefection({ contexte, retour }: { contexte: ContexteSaisie; retour: () => void }) {
  const { marche } = useSession();
  const parametres = useParametres(marche?.id);
  const [resultat, setResultat] = useState<'faite' | 'non_faite' | ''>('faite');
  const [natureId, setNatureId] = useState('');
  const [longueurT, setLongueurT] = useState('');
  const [largeurT, setLargeurT] = useState('');
  const [motifId, setMotifId] = useState('');
  const [equipeId, setEquipeId] = useState('');
  const [observation, setObservation] = useState('');
  const quand = useDateHeure();
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const ph = usePhotos();
  const d = contexte.derniere;
  const naturePrevue = parametres.natures.find((n) => n.id === d?.nature_revetement_id)?.libelle_fr;
  const fouille = (v: number | null | undefined) => (v != null ? `${String(v).replace('.', ',')} (fouille)` : undefined);

  async function enregistrer() {
    if (!marche) return;
    setErreur('');
    if (!resultat) return setErreur('Indiquez si la réfection est faite.');
    if (resultat === 'faite' && !natureId && !d?.nature_revetement_id) {
      return setErreur('Choisissez la nature de la réfection (aucune n\'est prévue à la réparation).');
    }
    if (resultat === 'non_faite' && !motifId) return setErreur('Réfection non faite : choisissez le motif.');
    const [longueur, largeur] = [nombreOuNul(longueurT), nombreOuNul(largeurT)];
    if ((longueurT.trim() && (longueur == null || longueur < 0)) || (largeurT.trim() && (largeur == null || largeur < 0))) {
      return setErreur('Longueur ou largeur invalide.');
    }
    const date = controlerDate(quand.jour, quand.heure);
    if ('erreur' in date) return setErreur(date.erreur);
    setOccupe(true);
    const faite = resultat === 'faite';
    try {
      await ajouterEnvoi({
        type: 'refection', id: Crypto.randomUUID(), marche_id: marche.id, fuite_id: contexte.fuiteId,
        fuite_libelle: contexte.libelle, photos: ph.photos,
        // Longueur, largeur et nature vides : reprises de la fouille par le serveur.
        ligne: {
          fuite_id: contexte.fuiteId, resultat, realisee_le: date.iso, equipe_id: equipeId || null,
          nature_id: faite ? natureId || null : null, motif_id: faite ? null : motifId,
          longueur_m: faite ? longueur : null, largeur_m: faite ? largeur : null,
          observation: observation.trim() || null, source_saisie: 'tablette',
        },
      });
      ph.garder();
      void synchroniser().catch(() => undefined);
      retour();
    } catch (e) {
      setErreur(`Enregistrement sur la tablette impossible : ${String((e as Error).message ?? e)}`);
      setOccupe(false);
    }
  }

  return (
    <ScrollView style={s.ecran} contentContainerStyle={[s.contenu, { paddingTop: 48 }]} keyboardShouldPersistTaps="handled">
      <Text style={s.titre}>Réfection · {contexte.libelle}</Text>
      <Carte>
        <Puces
          options={[{ valeur: 'faite' as const, libelle: 'Réfection faite' }, { valeur: 'non_faite' as const, libelle: 'Non faite (motif)' }]}
          valeur={resultat} onChange={setResultat}
        />
        {resultat === 'faite' && (
          <>
            <Text style={s.etiquette}>Nature{naturePrevue ? ` (vide : ${naturePrevue}, prévue à la réparation)` : ''}</Text>
            <Puces facultatif options={parametres.natures.map((n) => ({ valeur: n.id, libelle: n.libelle_fr }))} valeur={natureId} onChange={setNatureId} />
            <View style={s.ligne}>
              <Champ libelle="Longueur (m)" valeur={longueurT} onChange={setLongueurT} nombre indication={fouille(d?.fouille_longueur_m)} />
              <Champ libelle="Largeur (m)" valeur={largeurT} onChange={setLargeurT} nombre indication={fouille(d?.fouille_largeur_m)} />
            </View>
            <Text style={s.discret}>Laissées vides, longueur et largeur sont reprises de la fouille.</Text>
          </>
        )}
        {resultat === 'non_faite' && (
          <>
            <Text style={s.etiquette}>Motif (obligatoire)</Text>
            <Puces
              options={parametres.motifs.filter((m) => m.categorie === 'sans_refection').map((m) => ({ valeur: m.id, libelle: m.libelle_fr }))}
              valeur={motifId} onChange={setMotifId}
            />
          </>
        )}
        <DateHeure d={quand} />
        <ChoixEquipe parametres={parametres} valeur={equipeId} onChange={setEquipeId} />
      </Carte>
      <BlocPhotos ph={ph} types={['refection']} />
      <Carte>
        <Champ libelle="Observation" valeur={observation} onChange={setObservation} multiligne />
      </Carte>
      {!!erreur && <Text style={s.erreur}>{erreur}</Text>}
      <Bouton titre="Enregistrer la réfection" primaire onPress={enregistrer} occupe={occupe} />
      <Bouton titre="Annuler" onPress={retour} desactive={occupe} />
    </ScrollView>
  );
}

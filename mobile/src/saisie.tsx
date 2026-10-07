// Saisie d'une réparation (nouvelle ou modifiée) et d'une réfection, avec ou sans réseau.
// Tout est d'abord gardé sur la tablette (file d'attente), puis envoyé. Rien n'est recalculé ici :
// statut de la fuite et lignes de quantités avancent côté serveur (déclencheurs).
import * as Crypto from 'expo-crypto';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ajouterEnvoi, effacerPhotos, synchroniser, type PhotoAttente, type PieceAttente } from './file-attente';
import { Icone } from './icones';
import type { ContexteSaisie } from './fiche';
import { t, tx, useLangue } from './langue';
import { aucunChangement, differences } from './modification';
import { useParametres, type Parametres } from './parametres';
import { prendrePhoto } from './photos';
import { useSession } from './session';
import { EMPLACEMENTS, MATERIAUX, OUVRAGES, RESULTATS_REPARATION, TYPES_PHOTO, type ResultatReparation, type TypePhoto } from './types';
import { BarreApp, Bouton, Carte, Case, Champ, COULEURS, Message, Puces, s, Saisie, TeteCarte, useBas, Vignettes } from './ui';

const nombreOuNul = (t: string) => {
  const n = Number(t.trim().replace(',', '.'));
  return t.trim() === '' || Number.isNaN(n) ? null : n;
};
const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const options = (table: Record<string, string>) => Object.entries(table).map(([valeur, libelle]) => ({ valeur, libelle: tx(libelle) }));
const deux = (n: number) => String(n).padStart(2, '0');
const enTexte = (v: unknown) => (v == null ? '' : String(v).replace('.', ','));

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

const versTextes = (d: Date) => ({
  jour: `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`, heure: `${deux(d.getHours())}:${deux(d.getMinutes())}`,
});

/** Date et heure saisies ; `iso` : date d'une saisie déjà faite (modification). */
function useDateHeure(iso?: string) {
  const [depart] = useState(() => versTextes(iso ? new Date(iso) : new Date()));
  const [valeur, setValeur] = useState(depart);
  return {
    ...valeur,
    // Date non retouchée : on garde celle du serveur (secondes comprises), pas une fausse modification.
    inchangee: !!iso && valeur.jour === depart.jour && valeur.heure === depart.heure,
    setJour: (t: string) => setValeur((v) => ({ ...v, jour: masquer(t, '99/99/9999') })),
    setHeure: (t: string) => setValeur((v) => ({ ...v, heure: masquer(t, '99:99') })),
    remettre: () => setValeur(versTextes(new Date())),
  };
}

/** Contrôle commun : renvoie la date ISO ou un message d'erreur. */
function controlerDate(jour: string, heure: string): { iso: string } | { erreur: string } {
  const d = lireDate(jour, heure);
  if (!d) return { erreur: t('Date ou heure invalide (JJ/MM/AAAA et HH:MM).') };
  if (d.getTime() > Date.now() + 10 * 60 * 1000) return { erreur: t('La date est dans le futur : vérifiez-la.') };
  return { iso: d.toISOString() };
}

function DateHeure({ d }: { d: ReturnType<typeof useDateHeure> }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.etiquette}>{t('Date et heure des travaux')}</Text>
      <View style={s.ligne}>
        <Saisie style={{ flexGrow: 1, flexBasis: 150 }} value={d.jour} onChangeText={d.setJour} keyboardType="number-pad" placeholder={t('JJ/MM/AAAA')} maxLength={10} />
        <Saisie style={{ flexGrow: 1, flexBasis: 100 }} value={d.heure} onChangeText={d.setHeure} keyboardType="number-pad" placeholder={t('HH:MM')} maxLength={5} />
        <Bouton titre={t('Maintenant')} icone="clock" onPress={d.remettre} />
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
      <Text style={s.etiquette}>{t('Équipe')}</Text>
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
      setErreur(t('Photo impossible : {erreur}', { erreur: String((e as Error).message ?? e) }));
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
      <TeteCarte titre={t('Photos')} compteur={ph.photos.length} />
      <View style={s.ligne}>
        {types.map((tp) => (
          <Bouton
            key={tp} titre={`${tx(TYPES_PHOTO[tp])} (${ph.photos.filter((p) => p.type === tp).length})`} icone="camera"
            onPress={() => ph.prendre(tp)} style={{ flexGrow: 1, flexBasis: 150 }}
          />
        ))}
      </View>
      {!!ph.erreur && <Message ton="erreur">{ph.erreur}</Message>}
      <Vignettes photos={ph.photos.map((p) => ({ id: p.id, uri: p.fichier, legende: tx(TYPES_PHOTO[p.type ?? 'autre']) }))} retirer={ph.retirer} />
    </Carte>
  );
}

// ---------------------------------------------------------------------------
// Réparation (nouvelle, ou modification d'une réparation déjà saisie)
// ---------------------------------------------------------------------------
interface PieceForm extends PieceAttente { texte: string }

export function SaisieReparation({ contexte, retour }: { contexte: ContexteSaisie; retour: () => void }) {
  const { marche, peut, aRenouveler } = useSession();
  useLangue();
  const parametres = useParametres(marche?.id, aRenouveler);
  const bas = useBas();
  const m = contexte.modification;
  const init: Record<string, unknown> = m?.etat.ligne ?? {};
  const chaine = (k: string) => (typeof init[k] === 'string' ? (init[k] as string) : '');
  const oui = (k: string) => init[k] === true;
  const sigle = marche?.client_sigle?.trim() || marche?.client?.trim() || t("du maître d'ouvrage");
  const [resultat, setResultat] = useState<ResultatReparation | ''>((chaine('resultat') as ResultatReparation) || 'reparee');
  const [motifId, setMotifId] = useState(chaine('motif_id'));
  const quand = useDateHeure(m ? chaine('realisee_le') : undefined);
  const [equipeId, setEquipeId] = useState(chaine('equipe_id'));
  const [ouvrage, setOuvrage] = useState(chaine('ouvrage'));
  const [materiau, setMateriau] = useState(chaine('materiau'));
  const [diametre, setDiametre] = useState(enTexte(init.diametre_mm));
  const [tuyau, setTuyau] = useState(oui('tuyau_repare'));
  const [robinet, setRobinet] = useState(oui('robinet_pec_change'));
  const [collier, setCollier] = useState(oui('collier_pec_change'));
  const [boucheACle, setBoucheACle] = useState(oui('bouche_a_cle_mise_a_niveau'));
  const [elementRemplace, setElementRemplace] = useState(oui('element_remplace'));
  const [longueurPe, setLongueurPe] = useState(enTexte(init.longueur_pe_m));
  const [fL, setFL] = useState(enTexte(init.fouille_longueur_m));
  const [fl, setFl] = useState(enTexte(init.fouille_largeur_m));
  const [fP, setFP] = useState(enTexte(init.fouille_profondeur_m));
  const [emplacement, setEmplacement] = useState(chaine('emplacement'));
  const [natureId, setNatureId] = useState(chaine('nature_revetement_id'));
  const [representant, setRepresentant] = useState(chaine('representant_srm'));
  const [pieces, setPieces] = useState<PieceForm[]>(() => (m?.etat.pieces ?? []).map((p) => ({ ...p, texte: enTexte(p.quantite) })));
  const [recherche, setRecherche] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [ouvriers, setOuvriers] = useState<string[]>(m?.etat.ouvriers ?? []);
  const [observation, setObservation] = useState(chaine('observation'));
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const ph = usePhotos();

  // Droits sur ce qui est déjà saisi : mêmes règles que la base (portée « siennes » sur le compte de saisie).
  const dejaSaisie = (id: string) => !!m?.etat.pieces.some((p) => p.id === id);
  const auteursPiece = (id: string) => (m && id in m.saisiPar ? [m.saisiPar[id]] : undefined);
  const peutRetirer = (id: string) => !dejaSaisie(id) || peut('interventions', 'supprimer', auteursPiece(id));
  const peutRequantifier = (id: string) => !dejaSaisie(id) || peut('interventions', 'modifier', auteursPiece(id));
  const peutAjouter = !m || peut('interventions', 'creer');
  const peutPhotos = !m || peut('photos', 'creer');

  const correspondances = useMemo(() => {
    const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    return parametres.pieces.filter((p) => mots.every((x) => sansAccents(p.designation).includes(x))).slice(0, 8);
  }, [recherche, parametres.pieces]);

  function ajouterPiece(pieceId: number, designation: string) {
    const q = nombreOuNul(quantite);
    if (!q || q <= 0) {
      setErreur(t('Quantité de la pièce : un nombre supérieur à 0.'));
      return;
    }
    setErreur('');
    setPieces([...pieces, { id: Crypto.randomUUID(), produit_id: pieceId, designation, quantite: q, texte: enTexte(q) }]);
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
    if (!resultat) return setErreur(t('Choisissez le résultat.'));
    if (nonReparee && !motifId) return setErreur(t('Fuite non réparée : choisissez le motif.'));
    let realiseeLe = chaine('realisee_le');
    if (!quand.inchangee) {
      const date = controlerDate(quand.jour, quand.heure);
      if ('erreur' in date) return setErreur(date.erreur);
      realiseeLe = date.iso;
    }
    const nombres = { diametre: nombreOuNul(diametre), pe: nombreOuNul(longueurPe), l: longueur, la: nombreOuNul(fl), p: nombreOuNul(fP) };
    const textes = { diametre, pe: longueurPe, l: fL, la: fl, p: fP };
    for (const k of Object.keys(nombres) as (keyof typeof nombres)[]) {
      if (textes[k].trim() !== '' && (nombres[k] == null || (nombres[k] ?? 0) < 0)) return setErreur(t('Valeur numérique invalide : « {valeur} ».', { valeur: textes[k] }));
    }
    if (nombres.diametre != null && !Number.isInteger(nombres.diametre)) return setErreur(t('Diamètre : un nombre entier de millimètres.'));
    const posees: PieceAttente[] = [];
    for (const p of pieces) {
      const q = nombreOuNul(p.texte);
      if (!q || q <= 0) return setErreur(t('Quantité de « {designation} » : un nombre supérieur à 0.', { designation: p.designation }));
      posees.push({ id: p.id, produit_id: p.produit_id, designation: p.designation, quantite: q });
    }
    const travaux = !nonReparee;
    const ligne: Record<string, unknown> = {
      resultat, motif_id: nonReparee ? motifId : null, realisee_le: realiseeLe,
      equipe_id: equipeId || null, ouvrage: ouvrage || null, materiau: materiau || null, diametre_mm: nombres.diametre,
      tuyau_repare: travaux && tuyau, robinet_pec_change: travaux && robinet, collier_pec_change: travaux && collier,
      bouche_a_cle_mise_a_niveau: travaux && boucheACle, element_remplace: travaux && elementRemplace,
      longueur_pe_m: travaux && tuyau && materiau === 'polyethylene' ? nombres.pe : null,
      fouille_longueur_m: nombres.l, fouille_largeur_m: nombres.la, fouille_profondeur_m: nombres.p,
      emplacement: emplacement || null, nature_revetement_id: natureId || null,
      representant_srm: representant.trim() || null, observation: observation.trim() || null,
    };
    const changements = m ? differences(m.etat, { ligne, pieces: posees, ouvriers }) : null;
    if (changements && aucunChangement(changements) && !ph.photos.length) return setErreur(t('Aucune modification à enregistrer.'));
    setOccupe(true);
    try {
      const commun = { id: Crypto.randomUUID(), marche_id: marche.id, fuite_id: contexte.fuiteId, fuite_libelle: contexte.libelle, photos: ph.photos };
      if (m && changements) {
        await ajouterEnvoi({ ...commun, type: 'modification', reparation_id: m.reparationId, changements });
      } else {
        await ajouterEnvoi({
          ...commun, type: 'reparation', pieces: posees, ouvriers,
          ligne: { ...ligne, fuite_id: contexte.fuiteId, source_saisie: 'tablette' },
        });
      }
      ph.garder();
      void synchroniser().catch(() => undefined);
      retour();
    } catch (e) {
      setErreur(t('Enregistrement sur la tablette impossible : {erreur}', { erreur: String((e as Error).message ?? e) }));
      setOccupe(false);
    }
  }

  return (
    <View style={s.ecran}>
      <BarreApp titre={m ? t('Modifier la réparation') : t('Nouvelle réparation')} sousTitre={contexte.libelle} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]} keyboardShouldPersistTaps="handled">
        {m && (
          <Text style={s.discret}>
            {t("Corrigez ce qui doit l'être, puis « Enregistrer les modifications ». Les photos prises ici s'ajoutent à celles déjà envoyées.")}
          </Text>
        )}
        <Carte>
          <Text style={s.etiquette}>{t('Résultat')}</Text>
          <Puces options={options(RESULTATS_REPARATION) as { valeur: ResultatReparation; libelle: string }[]} valeur={resultat} onChange={setResultat} />
          {nonReparee && (
            <>
              <Text style={s.etiquette}>{t('Motif (obligatoire)')}</Text>
              <Puces
                options={parametres.motifs.filter((x) => x.categorie === 'sans_reparation').map((x) => ({ valeur: x.id, libelle: x.libelle_fr }))}
                valeur={motifId} onChange={setMotifId}
              />
            </>
          )}
          <DateHeure d={quand} />
          <ChoixEquipe parametres={parametres} valeur={equipeId} onChange={setEquipeId} />
        </Carte>

        <Carte>
          <Text style={s.sousTitre}>{t('Constat')}</Text>
          <Text style={s.etiquette}>{t('Ouvrage')}</Text>
          <Puces facultatif options={options(OUVRAGES)} valeur={ouvrage} onChange={setOuvrage} />
          <Text style={s.etiquette}>{t('Matériau')}</Text>
          <Puces facultatif options={options(MATERIAUX)} valeur={materiau} onChange={setMateriau} />
          <Champ libelle={t('Diamètre (mm) : DE pour le PE, DN pour les conduites')} valeur={diametre} onChange={setDiametre} nombre />
        </Carte>

        {!nonReparee && (
          <Carte>
            <Text style={s.sousTitre}>{t('Travaux réalisés')}</Text>
            <Case libelle={t('Tuyau / conduite réparé(e)')} valeur={tuyau} onChange={setTuyau} />
            <Case libelle={t('Robinet PEC changé')} valeur={robinet} onChange={setRobinet} />
            <Case libelle={t('Collier PEC changé')} valeur={collier} onChange={setCollier} />
            <Case libelle={t('Bouche à clé mise à niveau')} valeur={boucheACle} onChange={setBoucheACle} />
            <Case libelle={t('Élément de conduite remplacé')} valeur={elementRemplace} onChange={setElementRemplace} />
            {tuyau && materiau === 'polyethylene' && (
              <Champ libelle={t('Longueur de PE posée (m)')} valeur={longueurPe} onChange={setLongueurPe} nombre />
            )}
          </Carte>
        )}

        <Carte>
          <Text style={s.sousTitre}>{t('Fouille')}</Text>
          <View style={s.ligne}>
            <Champ libelle={t('Longueur (m)')} valeur={fL} onChange={setFL} nombre />
            <Champ libelle={t('Largeur (m)')} valeur={fl} onChange={setFl} nombre />
            <Champ libelle={t('Profondeur (m)')} valeur={fP} onChange={setFP} nombre />
          </View>
          {longueur != null && longueur > 2 && !elementRemplace && (
            <Message ton="attention">{t('Longueur supérieure à 2 m : à justifier par un élément de conduite remplacé.')}</Message>
          )}
          <Text style={s.etiquette}>{t('Revêtement à refaire')}</Text>
          <Puces facultatif options={parametres.natures.map((n) => ({ valeur: n.id, libelle: n.libelle_fr }))} valeur={natureId} onChange={choisirNature} />
          <Text style={s.etiquette}>{t('Emplacement')}</Text>
          <Puces facultatif options={options(EMPLACEMENTS)} valeur={emplacement} onChange={setEmplacement} />
          <Champ libelle={t('Représentant {sigle} présent (nom)', { sigle })} valeur={representant} onChange={setRepresentant} />
        </Carte>

        <Carte>
          <Text style={s.sousTitre}>{t('Pièces posées')}</Text>
          {pieces.map((p) => (
            <View key={p.id} style={[s.ligne, { alignItems: 'center' }]}>
              <Saisie
                style={{ width: 92 }}
                value={p.texte}
                onChangeText={(texte) => setPieces(pieces.map((x) => (x.id === p.id ? { ...x, texte } : x)))}
                keyboardType="decimal-pad"
                editable={peutRequantifier(p.id)}
                accessibilityLabel={t('Quantité : {designation}', { designation: p.designation })}
              />
              <Text style={[s.texte, { flex: 1, minWidth: 160 }]}>× {p.designation}{p.produit_id != null ? '' : ` ${t('(libre)')}`}</Text>
              {peutRetirer(p.id)
                ? <Bouton titre={t('Retirer')} icone="trash" danger onPress={() => setPieces(pieces.filter((x) => x.id !== p.id))} />
                : <Text style={s.discret}>{t('Retrait : responsable')}</Text>}
            </View>
          ))}
          {peutAjouter && (
            <>
              <View style={s.ligne}>
                <View style={{ flexGrow: 3, flexBasis: 220 }}>
                  <Champ libelle={t('Rechercher un article')} valeur={recherche} onChange={setRecherche} indication={t('ex. collier 63')} />
                </View>
                <View style={{ flexGrow: 1, flexBasis: 90 }}>
                  <Champ libelle={t('Quantité')} valeur={quantite} onChange={setQuantite} nombre />
                </View>
              </View>
              {correspondances.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => ajouterPiece(p.id, p.designation)}
                  style={({ pressed }) => [s.case, pressed && s.appuye]}
                  accessibilityRole="button"
                >
                  <Icone nom="plus" couleur={COULEURS.discret} />
                  <Text style={[s.texte, { flex: 1 }]}>{p.designation}</Text>
                  <Text style={s.discret}>{p.unite || 'u'}</Text>
                </Pressable>
              ))}
              {!!recherche.trim() && !correspondances.length && !!parametres.pieces.length && (
                <Text style={s.discret}>
                  {t("Aucun article ne correspond. S'il manque, notez-le en observation : le responsable demandera sa création dans Dolibarr.")}
                </Text>
              )}
              {!parametres.pieces.length && <Text style={s.discret}>{t('Liste des articles pas encore chargée sur cette tablette : connectez-la au réseau.')}</Text>}
            </>
          )}
        </Carte>

        {parametres.ouvriers.length > 0 && (
          <Carte>
            <Text style={s.sousTitre}>{t('Ouvriers (facultatif)')}</Text>
            <View style={s.ligne}>
              {parametres.ouvriers.map((o) => {
                const actif = ouvriers.includes(o.id);
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => setOuvriers(actif ? ouvriers.filter((x) => x !== o.id) : [...ouvriers, o.id])}
                    disabled={!actif && !peutAjouter}
                    style={[s.puce, actif && s.puceActive, !actif && !peutAjouter && s.inactif]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: actif }}
                  >
                    <Text style={[s.textePuce, actif && { color: COULEURS.principalTexte }]}>{o.nom_complet}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Carte>
        )}

        {peutPhotos && <BlocPhotos ph={ph} types={['avant', 'pendant', 'apres']} />}

        <Carte>
          <Champ libelle={t('Observation')} valeur={observation} onChange={setObservation} multiligne />
        </Carte>

        {!!erreur && <Message ton="erreur">{erreur}</Message>}
        <Bouton titre={m ? t('Enregistrer les modifications') : t('Enregistrer la réparation')} primaire grand onPress={enregistrer} occupe={occupe} />
        <Bouton titre={t('Annuler')} onPress={retour} desactive={occupe} />
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Réfection
// ---------------------------------------------------------------------------
export function SaisieRefection({ contexte, retour }: { contexte: ContexteSaisie; retour: () => void }) {
  const { marche, aRenouveler } = useSession();
  useLangue();
  const parametres = useParametres(marche?.id, aRenouveler);
  const bas = useBas();
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
  const fouille = (v: number | null | undefined) => (v != null ? t('{valeur} (fouille)', { valeur: String(v).replace('.', ',') }) : undefined);

  async function enregistrer() {
    if (!marche) return;
    setErreur('');
    if (!resultat) return setErreur(t('Indiquez si la réfection est faite.'));
    if (resultat === 'faite' && !natureId && !d?.nature_revetement_id) {
      return setErreur(t("Choisissez la nature de la réfection (aucune n'est prévue à la réparation)."));
    }
    if (resultat === 'non_faite' && !motifId) return setErreur(t('Réfection non faite : choisissez le motif.'));
    const [longueur, largeur] = [nombreOuNul(longueurT), nombreOuNul(largeurT)];
    if ((longueurT.trim() && (longueur == null || longueur < 0)) || (largeurT.trim() && (largeur == null || largeur < 0))) {
      return setErreur(t('Longueur ou largeur invalide.'));
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
      setErreur(t('Enregistrement sur la tablette impossible : {erreur}', { erreur: String((e as Error).message ?? e) }));
      setOccupe(false);
    }
  }

  return (
    <View style={s.ecran}>
      <BarreApp titre={t('Nouvelle réfection')} sousTitre={contexte.libelle} retour={retour} />
      <ScrollView contentContainerStyle={[s.defile, { paddingBottom: 40 + bas }]} keyboardShouldPersistTaps="handled">
        <Carte>
          <Puces
            options={[{ valeur: 'faite' as const, libelle: t('Réfection faite') }, { valeur: 'non_faite' as const, libelle: t('Non faite (motif)') }]}
            valeur={resultat} onChange={setResultat}
          />
          {resultat === 'faite' && (
            <>
              <Text style={s.etiquette}>
                {naturePrevue ? t('Nature (vide : {nature}, prévue à la réparation)', { nature: naturePrevue }) : t('Nature')}
              </Text>
              <Puces facultatif options={parametres.natures.map((n) => ({ valeur: n.id, libelle: n.libelle_fr }))} valeur={natureId} onChange={setNatureId} />
              <View style={s.ligne}>
                <Champ libelle={t('Longueur (m)')} valeur={longueurT} onChange={setLongueurT} nombre indication={fouille(d?.fouille_longueur_m)} />
                <Champ libelle={t('Largeur (m)')} valeur={largeurT} onChange={setLargeurT} nombre indication={fouille(d?.fouille_largeur_m)} />
              </View>
              <Text style={s.discret}>{t('Laissées vides, longueur et largeur sont reprises de la fouille.')}</Text>
            </>
          )}
          {resultat === 'non_faite' && (
            <>
              <Text style={s.etiquette}>{t('Motif (obligatoire)')}</Text>
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
          <Champ libelle={t('Observation')} valeur={observation} onChange={setObservation} multiligne />
        </Carte>
        {!!erreur && <Message ton="erreur">{erreur}</Message>}
        <Bouton titre={t('Enregistrer la réfection')} primaire grand onPress={enregistrer} occupe={occupe} />
        <Bouton titre={t('Annuler')} onPress={retour} desactive={occupe} />
      </ScrollView>
    </View>
  );
}

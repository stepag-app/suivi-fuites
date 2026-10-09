// Mode hors ligne léger (même principe que le panneau web) : chaque saisie (fuite, réparation,
// réfection) et ses photos sont d'abord gardées sur la tablette, puis envoyées au retour du réseau.
// Les uuid sont créés ici : renvoyer ne crée jamais de doublon. Les données locales ne sont
// effacées qu'après confirmation du serveur.
//
// Ordre : les envois partent dans l'ordre de saisie. Pour une même fuite, un envoi refusé bloque
// les suivants (fuite → réparation → pièces / ouvriers → réfection → photos → modification ou photos
// ajoutées depuis la fiche) jusqu'à ce qu'il passe ou soit abandonné. Une modification ou des photos
// ajoutées à une saisie encore en attente partent donc toujours après elle. Les statuts et les
// quantités sont recalculés par le serveur (déclencheurs).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from './langue';
import type { Changements } from './modification';
import { dejaEnvoye, effacerPhotos, envoyerPhoto, type PhotoAttente } from './photos';
import { jetonARenouveler, sessionStockee } from './session-donnees';
import { supabase } from './supabase';

export { effacerPhotos, type PhotoAttente };
// produit_id : article Dolibarr ; absent ou nul (envoi gardé par une version précédente) : ancienne pièce libre,
// refusée par le serveur (plus de pièce libre depuis le lot T).
export interface PieceAttente { id: string; produit_id: number | null; designation: string; quantite: number }

interface Commun {
  id: string; marche_id: string; photos: PhotoAttente[]; creee_le: string; erreur: string | null;
  /** Étapes déjà confirmées par le serveur (reprise après coupure). */
  fait?: { ligne?: boolean; pieces?: string[]; ouvriers?: string[] };
}
export interface EnvoiFuite extends Commun { type?: 'fuite'; ligne: Record<string, unknown>; position: string | null }
export interface EnvoiReparation extends Commun {
  type: 'reparation'; fuite_id: string; fuite_libelle: string; ligne: Record<string, unknown>;
  pieces: PieceAttente[]; ouvriers: string[];
}
export interface EnvoiRefection extends Commun {
  type: 'refection'; fuite_id: string; fuite_libelle: string; ligne: Record<string, unknown>;
}
/** Photos ajoutées depuis la fiche, à la fuite ou à une réparation / réfection existante. */
export interface EnvoiPhotos extends Commun {
  type: 'photos'; fuite_id: string; fuite_libelle: string; reparation_id?: string | null; refection_id?: string | null;
}
/** Modification d'une réparation déjà saisie (changements seulement, voir modification.ts). */
export interface EnvoiModification extends Commun {
  type: 'modification'; fuite_id: string; fuite_libelle: string; reparation_id: string; changements: Changements;
}
/**
 * Changement de quelques champs d'une ligne déjà saisie (V2, V3) : fuite ou réfection modifiée avant validation,
 * type d'une photo changé, photo retirée (retrait logique : `supprime_le`, fichier gardé).
 */
export interface EnvoiMaj extends Commun {
  type: 'maj'; fuite_id: string; fuite_libelle: string; table: 'fuites' | 'refections' | 'photos'; ligne_id: string;
  champs: Record<string, unknown>;
}
export type Envoi = EnvoiFuite | EnvoiReparation | EnvoiRefection | EnvoiPhotos | EnvoiModification | EnvoiMaj;
/** Ancien nom, gardé pour les écrans de détection. */
export type FuiteAttente = EnvoiFuite;

export const estFuite = (e: Envoi): e is EnvoiFuite => !e.type || e.type === 'fuite';
export const fuiteDe = (e: Envoi) => (estFuite(e) ? e.id : e.fuite_id);

const CLE = 'suivi-fuites:attente';
type Ecouteur = () => void;
const ecouteurs = new Set<Ecouteur>();
export const surChangement = (f: Ecouteur) => {
  ecouteurs.add(f);
  return () => void ecouteurs.delete(f);
};
const prevenir = () => ecouteurs.forEach((f) => f());

export async function lireAttente(): Promise<Envoi[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CLE)) ?? '[]') as Envoi[];
  } catch {
    return [];
  }
}
// Toute écriture passe par cette chaîne : une saisie faite pendant une synchro n'est jamais écrasée.
// Une file inchangée n'est pas réécrite ; `version` n'avance qu'à un vrai changement (voir synchroniser).
let chaine: Promise<unknown> = Promise.resolve();
let version = 0;
function modifier(f: (liste: Envoi[]) => Envoi[]): Promise<void> {
  const suite = chaine.then(async () => {
    const liste = await lireAttente();
    const avant = JSON.stringify(liste);
    const apres = JSON.stringify(f(liste));
    if (apres === avant) return;
    await AsyncStorage.setItem(CLE, apres);
    version += 1;
  });
  chaine = suite.catch(() => undefined);
  return suite;
}
const majEnvoi = (id: string, f: (e: Envoi) => Envoi) => modifier((l) => l.map((e) => (e.id === id ? f(e) : e)));

type Nouveau<T> = T extends Envoi ? Omit<T, 'creee_le' | 'erreur' | 'fait'> : never;
export async function ajouterEnvoi(e: Nouveau<Envoi>) {
  await modifier((l) => [...l, { ...e, creee_le: new Date().toISOString(), erreur: null } as Envoi]);
  prevenir();
}
export const mettreEnAttente = (f: Omit<EnvoiFuite, 'creee_le' | 'erreur' | 'fait'>) => ajouterEnvoi(f);

/**
 * Envois qui tombent si on abandonne celui-ci : une fuite emporte tout ce qui la concerne ; une réparation
 * ou une réfection emporte ses modifications et les photos ajoutées ensuite.
 */
export async function dependants(id: string): Promise<Envoi[]> {
  const liste = await lireAttente();
  const e = liste.find((x) => x.id === id);
  if (!e) return [];
  const rattache = (x: Envoi) =>
    ((x.type === 'modification' || x.type === 'photos') && x.reparation_id === id) || (x.type === 'photos' && x.refection_id === id)
    || (x.type === 'maj' && x.ligne_id === id);
  return liste.filter((x) => x.id !== id && (estFuite(e) ? fuiteDe(x) === id : rattache(x)));
}

export async function abandonner(id: string) {
  const supprimes = [...(await dependants(id)).map((x) => x.id), id];
  const liste = await lireAttente();
  await effacerPhotos(liste.filter((x) => supprimes.includes(x.id)).flatMap((x) => x.photos));
  await modifier((l) => l.filter((x) => !supprimes.includes(x.id)));
  prevenir();
}

interface ErreurApi { code?: string; message?: string; statusCode?: string | number }
// Coupure, pas un refus : erreur du fetch de l'APK (expo/fetch : « fetch failed: … ») ou requête abandonnée par le
// délai de reseau.ts (« timeout »).
const erreurReseau = (e: unknown) =>
  /network|fetch|timeout|internet|aborted/i.test(String((e as ErreurApi)?.message ?? e));

/** Message compréhensible par l'agent ; la saisie reste sur la tablette dans tous les cas. */
export function messageClair(e: unknown): string {
  const err = (e ?? {}) as ErreurApi;
  const brut = String(err.message ?? e);
  if (/verrouill/i.test(brut)) {
    return t("Fuite verrouillée (lot d'attachement arrêté) : seul le responsable peut encore la compléter ou la modifier. Rien n'est perdu : prévenez le responsable, puis « Envoyer maintenant ».");
  }
  if (err.code === '42501' || /row-level security|non autorisée|permission denied/i.test(brut)) {
    return t("Droit insuffisant sur ce marché pour cette saisie. Rien n'est perdu : voyez avec l'administrateur.");
  }
  // Refus des règles de validation (S1) et des champs obligatoires (S2) : message de la base, traduit.
  if (/Étape validée/.test(brut)) {
    return t("Déjà validée par le responsable : elle ne se modifie plus depuis la tablette. Ajoutez un nouvel élément (il sera à valider) ou demandez la correction au responsable.");
  }
  if (/Photo enregistrée avant la validation/.test(brut)) {
    return t('Photo enregistrée avant la validation : seul le responsable peut la modifier ou la retirer.');
  }
  if (/Validation réservée/.test(brut)) return t('Validation réservée au responsable.');
  if (/pièces et ouvriers réservés/i.test(brut)) return t('Réparation validée : pièces et ouvriers réservés au responsable.');
  const manquants = /Champs obligatoires manquants : (.*)/.exec(brut);
  if (manquants) return t('Champs obligatoires manquants : {champs}. Complétez la saisie (Modifier), puis « Envoyer maintenant ».', { champs: manquants[1] });
  if (err.code === '23503') return t('Fuite ou paramètre introuvable sur le serveur (supprimé entre-temps ?).');
  if (/produit_obligatoire/.test(brut)) {
    return t('Pièce sans article de la liste (ancienne désignation libre) refusée : retirez-la et choisissez un article proposé.');
  }
  if (err.code === '23514') return t('Saisie incomplète refusée par le serveur ({detail}).', { detail: brut });
  return brut;
}

let enCours: Promise<number> | null = null;

/**
 * Envoie tout ce qui attend ; renvoie le nombre d'envois restants. Une synchro à la fois.
 * Les écrans ne sont prévenus (et ne rechargent) que si la file a changé : la synchro des 30 s, file vide ou sans
 * réseau, ne réveille ni la liste ni la fiche.
 */
export function synchroniser(): Promise<number> {
  if (!enCours) {
    const depart = version;
    enCours = executer().finally(() => {
      enCours = null;
      if (version !== depart) prevenir();
    });
  }
  return enCours;
}

async function verifier(r: PromiseLike<{ error: ErreurApi | null }>) {
  const { error } = await r;
  if (error && !dejaEnvoye(error)) throw error;
}

async function envoyerPhotos(e: Envoi, liens: { reparation_id?: string | null; refection_id?: string | null }) {
  const fuiteId = fuiteDe(e);
  for (const p of e.photos) {
    await envoyerPhoto(p, { marche_id: e.marche_id, fuite_id: fuiteId, ...liens, position: estFuite(e) ? e.position : null });
    await majEnvoi(e.id, (x) => ({ ...x, photos: x.photos.filter((y) => y.id !== p.id) }));
  }
}

const noter = (id: string, f: NonNullable<Commun['fait']>) => majEnvoi(id, (x) => ({ ...x, fait: { ...x.fait, ...f } }));

const insererPiece = (marcheId: string, reparationId: string, p: PieceAttente) => verifier(supabase.from('reparation_pieces').insert({
  id: p.id, marche_id: marcheId, reparation_id: reparationId, produit_id: p.produit_id ?? null,
  designation_libre: p.produit_id != null ? null : p.designation, quantite: p.quantite,
}));
const insererOuvrier = (marcheId: string, reparationId: string, ouvrierId: string) =>
  verifier(supabase.from('reparation_ouvriers').insert({ marche_id: marcheId, reparation_id: reparationId, ouvrier_id: ouvrierId }));

async function envoyerCreation(e: EnvoiFuite | EnvoiReparation | EnvoiRefection) {
  const fait = e.fait ?? {};
  const table = estFuite(e) ? 'fuites' : e.type === 'reparation' ? 'reparations' : 'refections';
  if (!fait.ligne) {
    await verifier(supabase.from(table).insert({ ...e.ligne, id: e.id, marche_id: e.marche_id }));
    await noter(e.id, { ligne: true });
  }
  if (e.type === 'reparation') {
    const pieces = [...(fait.pieces ?? [])];
    for (const p of e.pieces.filter((x) => !pieces.includes(x.id))) {
      await insererPiece(e.marche_id, e.id, p);
      pieces.push(p.id);
      await noter(e.id, { pieces });
    }
    const ouvriers = [...(fait.ouvriers ?? [])];
    for (const o of e.ouvriers.filter((x) => !ouvriers.includes(x))) {
      await insererOuvrier(e.marche_id, e.id, o);
      ouvriers.push(o);
      await noter(e.id, { ouvriers });
    }
  }
  await envoyerPhotos(e, e.type === 'reparation' ? { reparation_id: e.id } : e.type === 'refection' ? { refection_id: e.id } : {});
}

/** Chaque étape peut être rejouée sans effet de plus (identifiants créés sur la tablette, retraits déjà faits ignorés). */
async function envoyerModification(e: EnvoiModification) {
  const c = e.changements;
  if (!e.fait?.ligne && Object.keys(c.ligne).length) {
    const { data, error } = await supabase.from('reparations').update(c.ligne).eq('id', e.reparation_id).select('id');
    if (error) throw error;
    // Sans droit de modification sur le marché, la base ne touche aucune ligne et ne signale rien.
    if (!data?.length) throw Object.assign(new Error('Modification non autorisée'), { code: '42501' });
    await noter(e.id, { ligne: true });
  }
  for (const p of c.pieces_ajoutees) await insererPiece(e.marche_id, e.reparation_id, p);
  for (const q of c.quantites) await verifier(supabase.from('reparation_pieces').update({ quantite: q.quantite }).eq('id', q.id));
  for (const id of c.pieces_retirees) {
    await verifier(supabase.from('reparation_pieces').update({ supprime_le: new Date().toISOString() }).eq('id', id).is('supprime_le', null));
  }
  for (const o of c.ouvriers_ajoutes) await insererOuvrier(e.marche_id, e.reparation_id, o);
  if (c.ouvriers_retires.length) {
    await verifier(supabase.from('reparation_ouvriers').delete().eq('reparation_id', e.reparation_id).in('ouvrier_id', c.ouvriers_retires));
  }
  await envoyerPhotos(e, { reparation_id: e.reparation_id });
}

async function envoyerMaj(e: EnvoiMaj) {
  const { data, error } = await supabase.from(e.table).update(e.champs).eq('id', e.ligne_id).select('id');
  if (error) throw error;
  // Sans droit de modification sur le marché, la base ne touche aucune ligne et ne signale rien.
  if (!data?.length) throw Object.assign(new Error('Modification non autorisée'), { code: '42501' });
}

function envoyer(e: Envoi) {
  if (e.type === 'maj') return envoyerMaj(e);
  if (e.type === 'photos') return envoyerPhotos(e, { reparation_id: e.reparation_id, refection_id: e.refection_id });
  if (e.type === 'modification') return envoyerModification(e);
  return envoyerCreation(e);
}

const ATTENTE_PRECEDENT = "En attente : une saisie précédente de cette fuite n'est pas encore passée.";

// Jeton de la session, sans lequel rien ne part : supabase-js enverrait la clé anonyme, qui n'a aucun droit (la base
// refuserait la saisie, affichée comme un droit insuffisant). Absent : pas de session, ou jeton expiré pas encore
// renouvelé (hors ligne) ; tout repart à la synchro qui suit le renouvellement. Jeton gardé déjà expiré, ou à renouveler
// en cours d'utilisation (session-donnees.ts) : getSession() attendrait les reprises du renouvellement (près de 25 s sans
// réseau) pour ne rien rendre ; la synchro n'attend pas.
const jeton = async () => {
  const gardee = await sessionStockee();
  if (!gardee || (gardee.expires_at ?? 0) * 1000 <= Date.now() || jetonARenouveler()) return null;
  return (await supabase.auth.getSession()).data.session?.access_token ?? null;
};

async function executer(): Promise<number> {
  // Cas courant (toutes les 30 s) : rien à envoyer, rien d'autre à lire.
  if (!(await lireAttente()).length) return 0;

  const bloquees = new Set<string>();
  for (const e of await lireAttente()) {
    const fuite = fuiteDe(e);
    if (bloquees.has(fuite)) {
      await majEnvoi(e.id, (x) => ({ ...x, erreur: ATTENTE_PRECEDENT }));
      continue;
    }
    const avant = await jeton();
    if (!avant) break;
    try {
      await envoyer(e);
      await modifier((l) => l.filter((x) => x.id !== e.id));
    } catch (err) {
      if (erreurReseau(err)) break; // on réessaiera au retour du réseau, rien n'est perdu
      // Jeton expiré ou renouvelé pendant l'envoi : le refus peut venir d'une requête partie sans jeton valide, pas
      // des droits. On réessaiera à la synchro suivante.
      if ((await jeton()) !== avant) break;
      bloquees.add(fuite);
      await majEnvoi(e.id, (x) => ({ ...x, erreur: messageClair(err) }));
    }
  }
  return (await lireAttente()).length;
}

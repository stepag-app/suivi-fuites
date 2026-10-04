// Mode hors ligne léger (même principe que le panneau web) : chaque saisie (fuite, réparation,
// réfection) et ses photos sont d'abord gardées sur la tablette, puis envoyées au retour du réseau.
// Les uuid sont créés ici : renvoyer ne crée jamais de doublon. Les données locales ne sont
// effacées qu'après confirmation du serveur.
//
// Ordre : les envois partent dans l'ordre de saisie. Pour une même fuite, un envoi refusé bloque
// les suivants (fuite → réparation → pièces / ouvriers → réfection → photos) jusqu'à ce qu'il passe
// ou soit abandonné. Les statuts et les quantités sont recalculés par le serveur (déclencheurs).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dejaEnvoye, effacerPhotos, envoyerPhoto, type PhotoAttente } from './photos';
import { supabase } from './supabase';

export { effacerPhotos, type PhotoAttente };
export interface PieceAttente { id: string; piece_id: string | null; designation: string; quantite: number }

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
export type Envoi = EnvoiFuite | EnvoiReparation | EnvoiRefection;
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
const ecrireAttente = (liste: Envoi[]) => AsyncStorage.setItem(CLE, JSON.stringify(liste));
// Toute écriture passe par cette chaîne : une saisie faite pendant une synchro n'est jamais écrasée.
let chaine: Promise<unknown> = Promise.resolve();
function modifier(f: (liste: Envoi[]) => Envoi[]): Promise<void> {
  const suite = chaine.then(async () => ecrireAttente(f(await lireAttente())));
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

/** Envois qui tombent si on abandonne celui-ci (une fuite emporte ses réparations et réfections). */
export async function dependants(id: string): Promise<Envoi[]> {
  const liste = await lireAttente();
  const e = liste.find((x) => x.id === id);
  return e && estFuite(e) ? liste.filter((x) => x.id !== id && fuiteDe(x) === id) : [];
}

export async function abandonner(id: string) {
  const supprimes = [...(await dependants(id)).map((x) => x.id), id];
  const liste = await lireAttente();
  await effacerPhotos(liste.filter((x) => supprimes.includes(x.id)).flatMap((x) => x.photos));
  await modifier((l) => l.filter((x) => !supprimes.includes(x.id)));
  prevenir();
}

interface ErreurApi { code?: string; message?: string; statusCode?: string | number }
const erreurReseau = (e: unknown) =>
  /network|fetch|timeout|internet|aborted/i.test(String((e as ErreurApi)?.message ?? e));

/** Message compréhensible par l'agent ; la saisie reste sur la tablette dans tous les cas. */
export function messageClair(e: unknown): string {
  const err = (e ?? {}) as ErreurApi;
  const brut = String(err.message ?? e);
  if (/verrouill/i.test(brut)) {
    return 'Fuite verrouillée (lot d\'attachement arrêté) : seul le responsable peut encore y ajouter une saisie. '
      + 'Rien n\'est perdu : prévenez le responsable, puis « Envoyer maintenant ».';
  }
  if (err.code === '42501' || /row-level security|non autorisée|permission denied/i.test(brut)) {
    return 'Droit insuffisant sur ce marché pour cette saisie. Rien n\'est perdu : voyez avec l\'administrateur.';
  }
  if (err.code === '23503') return 'Fuite ou paramètre introuvable sur le serveur (supprimé entre-temps ?).';
  if (err.code === '23514') return `Saisie incomplète refusée par le serveur (${brut}).`;
  return brut;
}

let enCours: Promise<number> | null = null;

/** Envoie tout ce qui attend ; renvoie le nombre d'envois restants. Une synchro à la fois. */
export function synchroniser(): Promise<number> {
  if (!enCours) {
    enCours = executer().finally(() => {
      enCours = null;
      prevenir();
    });
  }
  return enCours;
}

async function verifier(r: PromiseLike<{ error: ErreurApi | null }>) {
  const { error } = await r;
  if (error && !dejaEnvoye(error)) throw error;
}

async function envoyerPhotos(e: Envoi, liens: { reparation_id?: string; refection_id?: string }) {
  const fuiteId = fuiteDe(e);
  for (const p of e.photos) {
    await envoyerPhoto(p, { marche_id: e.marche_id, fuite_id: fuiteId, ...liens, position: estFuite(e) ? e.position : null });
    await majEnvoi(e.id, (x) => ({ ...x, photos: x.photos.filter((y) => y.id !== p.id) }));
  }
}

async function envoyer(e: Envoi) {
  const fait = e.fait ?? {};
  const noter = (f: NonNullable<Commun['fait']>) => majEnvoi(e.id, (x) => ({ ...x, fait: { ...x.fait, ...f } }));
  const table = estFuite(e) ? 'fuites' : e.type === 'reparation' ? 'reparations' : 'refections';
  if (!fait.ligne) {
    await verifier(supabase.from(table).insert({ ...e.ligne, id: e.id, marche_id: e.marche_id }));
    await noter({ ligne: true });
  }
  if (e.type === 'reparation') {
    const pieces = [...(fait.pieces ?? [])];
    for (const p of e.pieces.filter((x) => !pieces.includes(x.id))) {
      await verifier(supabase.from('reparation_pieces').insert({
        id: p.id, marche_id: e.marche_id, reparation_id: e.id, piece_id: p.piece_id,
        designation_libre: p.piece_id ? null : p.designation, quantite: p.quantite,
      }));
      pieces.push(p.id);
      await noter({ pieces });
    }
    const ouvriers = [...(fait.ouvriers ?? [])];
    for (const o of e.ouvriers.filter((x) => !ouvriers.includes(x))) {
      await verifier(supabase.from('reparation_ouvriers').insert({ marche_id: e.marche_id, reparation_id: e.id, ouvrier_id: o }));
      ouvriers.push(o);
      await noter({ ouvriers });
    }
  }
  await envoyerPhotos(e, e.type === 'reparation' ? { reparation_id: e.id } : e.type === 'refection' ? { refection_id: e.id } : {});
}

const ATTENTE_PRECEDENT = 'En attente : une saisie précédente de cette fuite n\'est pas encore passée.';

async function executer(): Promise<number> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return (await lireAttente()).length;

  const bloquees = new Set<string>();
  for (const e of await lireAttente()) {
    const fuite = fuiteDe(e);
    if (bloquees.has(fuite)) {
      await majEnvoi(e.id, (x) => ({ ...x, erreur: ATTENTE_PRECEDENT }));
      continue;
    }
    try {
      await envoyer(e);
      await modifier((l) => l.filter((x) => x.id !== e.id));
    } catch (err) {
      if (erreurReseau(err)) break; // on réessaiera au retour du réseau, rien n'est perdu
      bloquees.add(fuite);
      await majEnvoi(e.id, (x) => ({ ...x, erreur: messageClair(err) }));
    }
  }
  return (await lireAttente()).length;
}

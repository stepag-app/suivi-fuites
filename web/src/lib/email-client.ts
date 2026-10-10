'use client';

// Côté navigateur : droit d'envoyer (responsable du marché, administrateur), carnet des destinataires,
// journal, et appel de la route serveur /api/email avec le jeton de la session.
import { useEffect, useState } from 'react';
import type { DocumentEmail } from './email';
import { useSession } from './session';
import { MODE_DEMO, fonctionAbsente, getSupabase } from './supabase';

export interface Destinataire {
  id: string;
  marche_id: string;
  nom: string;
  email: string;
  organisme: string | null;
  par_defaut: boolean;
  actif: boolean;
  ordre: number;
}

export interface EnvoiEmail {
  id: string;
  envoye_par: string;
  document: DocumentEmail;
  reference: string | null;
  objet: string;
  destinataires: string[];
  piece_nom: string;
  piece_octets: number;
  statut: 'en_cours' | 'envoye' | 'echec';
  erreur: string | null;
  cree_le: string;
}

// Lu une fois par compte et par marché ; la base reste juge à l'envoi.
const cacheDroit = new Map<string, boolean>();

export function usePeutEnvoyerEmail(): boolean {
  const { profil, marche } = useSession();
  const cle = profil && marche ? `${profil.id}:${marche.id}` : null;
  const [peut, setPeut] = useState(() => (profil?.est_admin ? true : cle ? cacheDroit.get(cle) ?? false : false));
  useEffect(() => {
    if (!cle || !marche) return setPeut(false);
    if (profil?.est_admin) return setPeut(true);
    const connu = cacheDroit.get(cle);
    if (connu !== undefined) return setPeut(connu);
    let annule = false;
    getSupabase().rpc('peut_envoyer_email', { p_marche: marche.id }).then(({ data, error }) => {
      const v = !fonctionAbsente(error, data) && !error && data === true;
      if (!error) cacheDroit.set(cle, v);
      if (!annule) setPeut(v);
    });
    return () => {
      annule = true;
    };
  }, [cle, marche, profil?.est_admin]);
  return peut;
}

export async function lireDestinataires(marcheId: string, actifsSeulement = false): Promise<Destinataire[]> {
  let q = getSupabase().from('destinataires_email')
    .select('id, marche_id, nom, email, organisme, par_defaut, actif, ordre').eq('marche_id', marcheId);
  if (actifsSeulement) q = q.eq('actif', true);
  const { data, error } = await q.order('ordre').order('nom');
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw error;
  }
  return (data as Destinataire[] | null) ?? [];
}

export async function lireEnvois(marcheId: string, nombre = 30): Promise<EnvoiEmail[]> {
  const { data, error } = await getSupabase().from('envois_email')
    .select('id, envoye_par, document, reference, objet, destinataires, piece_nom, piece_octets, statut, erreur, cree_le')
    .eq('marche_id', marcheId).order('cree_le', { ascending: false }).range(0, nombre - 1);
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    throw error;
  }
  return (data as EnvoiEmail[] | null) ?? [];
}

export interface EnvoiDocument {
  marcheId: string;
  document: DocumentEmail;
  reference?: string | null;
  destinataires: string[];
  objet: string;
  message: string;
  blob: Blob;
  nom: string;
}

/** Envoie le document par la route serveur ; lève une erreur avec le message à afficher en cas de refus. */
export async function envoyerDocument(e: EnvoiDocument): Promise<{ id: string }> {
  if (MODE_DEMO) {
    // Démonstration : rien ne part, l'envoi est seulement inscrit au journal en mémoire.
    const id = crypto.randomUUID();
    await getSupabase().from('envois_email').insert({
      id, marche_id: e.marcheId, envoye_par: 'demo', document: e.document, reference: e.reference ?? null, objet: e.objet,
      destinataires: e.destinataires, piece_nom: e.nom, piece_octets: e.blob.size, statut: 'envoye', erreur: null,
      cree_le: new Date().toISOString(),
    });
    return { id };
  }
  const { data } = await getSupabase().auth.getSession();
  const jeton = data.session?.access_token;
  if (!jeton) throw new Error('Session absente : reconnectez-vous.');
  const form = new FormData();
  form.set('marche_id', e.marcheId);
  form.set('document', e.document);
  form.set('reference', e.reference ?? '');
  form.set('destinataires', JSON.stringify(e.destinataires));
  form.set('objet', e.objet);
  form.set('message', e.message);
  form.set('fichier', e.blob, e.nom);
  let r: Response;
  try {
    r = await fetch('/api/email', { method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: form });
  } catch {
    throw new Error('Pas de réseau : le document n\'est pas parti.');
  }
  const corps = (await r.json().catch(() => ({}))) as { id?: string; erreur?: string };
  if (!r.ok || !corps.id) {
    throw new Error(corps.erreur || (r.status === 413 ? 'Pièce jointe trop lourde.' : `Envoi refusé (${r.status}).`));
  }
  return { id: corps.id };
}

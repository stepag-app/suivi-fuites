// Envoi des documents par e-mail (chantier v3, S18 ; contrat docs/lots/chantier-v3-email.md).
// Règles pures partagées par le dialogue (navigateur) et la route serveur (app/api/email/route.ts) :
// adresses, limites, textes proposés, courriel construit, traitement complet d'une demande avec des
// dépendances injectées (base, fournisseur). Aucun import : vérifié sous Node par scripts/verifier-email.mjs.

export type DocumentEmail = 'rapport' | 'rapport_fuite' | 'carte' | 'attachement' | 'pv_debits' | 'rapport_balayage' | 'export';

/** Titre de chaque document (objet et message proposés). Valeurs = contrôle envois_email_document_check. */
export const DOCUMENTS_EMAIL: Record<DocumentEmail, string> = {
  rapport: 'Rapport',
  rapport_fuite: 'Rapport de fuite',
  carte: 'Carte',
  attachement: 'Attachement',
  pv_debits: 'Procès-verbal de mesures de débit de nuit',
  rapport_balayage: 'Rapport de balayage',
  export: 'Document',
};

/** Plafond des fonctions Vercel : 4,5 Mo par requête, formulaire compris. */
export const TAILLE_MAX_PIECE = 4 * 1024 * 1024;
export const MAX_DESTINATAIRES = 10;
export const LONGUEUR_OBJET = 200;
export const LONGUEUR_MESSAGE = 5000;
export const LONGUEUR_REFERENCE = 120;

export const TYPES_PIECE: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
};

// Même motif que la base (destinataires_email, reserver_envoi_email).
const MOTIF_ADRESSE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

export const adresseValide = (a: string) => a.length <= 254 && MOTIF_ADRESSE.test(a.trim());

/** Adresses en minuscules, sans espaces ni doublons, dans l'ordre. */
export function normaliserAdresses(liste: readonly string[]): string[] {
  return [...new Set(liste.map((a) => a.trim().toLowerCase()).filter(Boolean))];
}

/** Adresses tapées à la main (séparées par virgule, point-virgule, espace ou retour à la ligne). */
export function decouperAdresses(texte: string): { valides: string[]; invalides: string[] } {
  const morceaux = normaliserAdresses(texte.split(/[\s,;]+/));
  return { valides: morceaux.filter(adresseValide), invalides: morceaux.filter((a) => !adresseValide(a)) };
}

export const extensionPiece = (nom: string): string | null => {
  const ext = /\.([a-z0-9]+)$/i.exec(nom.trim())?.[1]?.toLowerCase();
  return ext && ext in TYPES_PIECE ? ext : null;
};

export function texteTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

export interface ContexteTexte {
  document: DocumentEmail;
  reference?: string | null;
  marche?: string | null;
}

export function objetParDefaut({ document, reference, marche }: ContexteTexte): string {
  const titre = DOCUMENTS_EMAIL[document];
  return [reference ? `${titre} — ${reference}` : titre, marche].filter(Boolean).join(' — ').slice(0, LONGUEUR_OBJET);
}

export function messageParDefaut({ document, reference, marche }: ContexteTexte): string {
  const quoi = DOCUMENTS_EMAIL[document].toLowerCase();
  const de = reference ? ` (${reference})` : '';
  const pour = marche ? ` du marché ${marche}` : '';
  return `Bonjour,\n\nVeuillez trouver ci-joint le ${quoi}${de}${pour}.\n\nCordialement,\nSTEPAG`;
}

// -----------------------------------------------------------------------------
// Demande reçue par la route
// -----------------------------------------------------------------------------
export interface Piece {
  nom: string;
  octets: number;
  type?: string;
  contenu: () => Promise<ArrayBuffer>;
}

export interface DemandeBrute {
  marche_id?: string | null;
  document?: string | null;
  reference?: string | null;
  destinataires?: string | null; // JSON : liste d'adresses
  objet?: string | null;
  message?: string | null;
  piece?: Piece | null;
}

export interface Demande {
  marcheId: string;
  document: DocumentEmail;
  reference: string | null;
  destinataires: string[];
  objet: string;
  message: string;
  piece: Piece;
}

export interface Refus {
  statut: number;
  erreur: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function verifierDemande(b: DemandeBrute): { demande: Demande } | { refus: Refus } {
  const refus = (erreur: string, statut = 400) => ({ refus: { statut, erreur } });
  if (!b.marche_id || !UUID.test(b.marche_id)) return refus('Marché manquant.');
  if (!b.document || !(b.document in DOCUMENTS_EMAIL)) return refus('Document inconnu.');
  let liste: unknown;
  try {
    liste = JSON.parse(b.destinataires ?? '[]');
  } catch {
    return refus('Destinataires illisibles.');
  }
  if (!Array.isArray(liste) || liste.some((a) => typeof a !== 'string')) return refus('Destinataires illisibles.');
  const destinataires = normaliserAdresses(liste as string[]);
  if (!destinataires.length) return refus('Aucun destinataire.');
  if (destinataires.length > MAX_DESTINATAIRES) return refus(`${MAX_DESTINATAIRES} destinataires au plus.`);
  const invalide = destinataires.find((a) => !adresseValide(a));
  if (invalide) return refus(`Adresse invalide : ${invalide}`);
  const objet = (b.objet ?? '').trim();
  if (!objet) return refus('Objet obligatoire.');
  if (objet.length > LONGUEUR_OBJET) return refus(`Objet : ${LONGUEUR_OBJET} caractères au plus.`);
  const message = (b.message ?? '').trim();
  if (message.length > LONGUEUR_MESSAGE) return refus(`Message : ${LONGUEUR_MESSAGE} caractères au plus.`);
  const reference = (b.reference ?? '').trim().slice(0, LONGUEUR_REFERENCE) || null;
  const piece = b.piece;
  if (!piece || !piece.octets) return refus('Pièce jointe manquante.');
  if (!extensionPiece(piece.nom)) return refus('Pièce jointe : PDF, Excel, Word ou CSV seulement.');
  if (piece.octets > TAILLE_MAX_PIECE) {
    return refus(`Pièce jointe trop lourde (${texteTaille(piece.octets)}) : ${texteTaille(TAILLE_MAX_PIECE)} au plus.`, 413);
  }
  return { demande: { marcheId: b.marche_id, document: b.document as DocumentEmail, reference, destinataires, objet, message, piece } };
}

// -----------------------------------------------------------------------------
// Courriel envoyé au fournisseur (format de l'API Resend)
// -----------------------------------------------------------------------------
export interface Courriel {
  from: string;
  to: string[];
  bcc: string[];
  reply_to: string;
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: string; content_type?: string }[];
}

export const echapperHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Adresse seule d'un expéditeur « Nom <adresse> ». */
export const adresseDe = (expediteur: string) => /<([^>]+)>/.exec(expediteur)?.[1]?.trim() ?? expediteur.trim();

export function construireCourriel(p: {
  expediteur: string;
  copie: string;
  demande: Demande;
  contenuBase64: string;
  envoyePar?: string | null;
  marche?: string | null;
}): Courriel {
  const { demande: d } = p;
  const signature = [
    `Document joint : ${d.piece.nom} (${texteTaille(d.piece.octets)})`,
    `Envoyé${p.envoyePar ? ` par ${p.envoyePar}` : ''} depuis le suivi des fuites${p.marche ? ` (marché ${p.marche})` : ''}.`,
    `Pour répondre : ${adresseDe(p.copie)}`,
  ];
  const text = [d.message, '', '—', ...signature].join('\n').trim();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.5">`
    + `${echapperHtml(d.message).replace(/\r?\n/g, '<br>')}`
    + `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 12px">`
    + `<p style="font-size:12px;color:#6b7280;margin:0">${signature.map(echapperHtml).join('<br>')}</p></div>`;
  // La copie cachée garde la trace dans la boîte ; inutile si elle est déjà destinataire.
  const bcc = d.destinataires.includes(adresseDe(p.copie).toLowerCase()) ? [] : [adresseDe(p.copie)];
  const ext = extensionPiece(d.piece.nom);
  return {
    from: p.expediteur,
    to: d.destinataires,
    bcc,
    reply_to: adresseDe(p.copie),
    subject: d.objet,
    text,
    html,
    attachments: [{ filename: d.piece.nom, content: p.contenuBase64, ...(ext ? { content_type: TYPES_PIECE[ext] } : {}) }],
  };
}

// -----------------------------------------------------------------------------
// Traitement complet d'une demande (la route branche la base et le fournisseur)
// -----------------------------------------------------------------------------
export interface ErreurBase {
  code?: string;
  message: string;
}

export interface Dependances {
  /** Fournisseur prêt (clé posée, ou mode essai). */
  configure: boolean;
  expediteur: string;
  copie: string;
  reserver: (d: Demande) => Promise<{ id: string } | { erreur: ErreurBase }>;
  terminer: (id: string, statut: 'envoye' | 'echec', fournisseurId: string | null, erreur: string | null) => Promise<void>;
  contexte: (d: Demande) => Promise<{ envoyePar?: string | null; marche?: string | null }>;
  envoyer: (c: Courriel, cleIdempotence: string) => Promise<{ id: string } | { erreur: string }>;
  base64: (contenu: ArrayBuffer) => string;
}

export type Reponse = { statut: 200; id: string; fournisseurId: string } | Refus;

/** Code d'erreur de la base (PostgREST) → statut HTTP et message pour l'écran. */
export function refusDepuisBase(e: ErreurBase): Refus {
  if (e.code === 'PGRST301' || e.code === 'PGRST302' || /JWT/i.test(e.message)) return { statut: 401, erreur: 'Session expirée : reconnectez-vous.' };
  if (e.code === '42501') return { statut: 403, erreur: e.message || 'Envoi réservé au responsable du marché et à l\'administrateur.' };
  if (e.code === '23514' && /limite/i.test(e.message)) return { statut: 429, erreur: e.message };
  if (e.code === '22023' || e.code === '23514') return { statut: 400, erreur: e.message };
  if (e.code === 'PGRST202' || e.code === '42883') return { statut: 503, erreur: 'Base pas encore à jour (envoi par e-mail absent).' };
  return { statut: 500, erreur: e.message || 'Erreur de la base.' };
}

export async function traiterEnvoi(jeton: string | null, brute: DemandeBrute, deps: Dependances): Promise<Reponse> {
  if (!jeton) return { statut: 401, erreur: 'Session absente : reconnectez-vous.' };
  if (!deps.configure) return { statut: 503, erreur: 'Envoi par e-mail non configuré sur le serveur (clé du fournisseur absente).' };
  const v = verifierDemande(brute);
  if ('refus' in v) return v.refus;
  const d = v.demande;
  const r = await deps.reserver(d);
  if ('erreur' in r) return refusDepuisBase(r.erreur);
  let courriel: Courriel;
  try {
    const ctx = await deps.contexte(d).catch(() => ({}));
    courriel = construireCourriel({ expediteur: deps.expediteur, copie: deps.copie, demande: d, contenuBase64: deps.base64(await d.piece.contenu()), ...ctx });
  } catch (e) {
    await deps.terminer(r.id, 'echec', null, `Pièce illisible : ${String(e)}`).catch(() => undefined);
    return { statut: 400, erreur: 'Pièce jointe illisible.' };
  }
  let envoi: { id: string } | { erreur: string };
  try {
    envoi = await deps.envoyer(courriel, r.id);
  } catch (e) {
    envoi = { erreur: e instanceof Error ? e.message : String(e) };
  }
  if ('erreur' in envoi) {
    await deps.terminer(r.id, 'echec', null, envoi.erreur).catch(() => undefined);
    return { statut: 502, erreur: `Le fournisseur d'e-mail a refusé l'envoi : ${envoi.erreur}` };
  }
  // Le courriel est parti : un échec de l'écriture au journal ne doit pas le faire passer pour non envoyé.
  await deps.terminer(r.id, 'envoye', envoi.id, null).catch(() => undefined);
  return { statut: 200, id: r.id, fournisseurId: envoi.id };
}

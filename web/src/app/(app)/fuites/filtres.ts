// Filtres de la liste des fuites et leur forme dans l'adresse de la page :
//   /fuites?statut=detectee&secteur=<uuid>&du=AAAA-MM-JJ&au=AAAA-MM-JJ&alertes=1&texte=…
// Fonctions pures, partagées par la liste (lecture et écriture de l'adresse, filtrage) et par le
// tableau de bord (liens vers la liste filtrée). Valeur inconnue ou invalide : ignorée, sans erreur.
// Seuls des imports de types : scripts/verifier-filtres-fuites.mjs charge ce fichier directement avec Node.
import type { StatutFuite, VFuite } from '@/lib/types';

export interface FiltresListe {
  statut: StatutFuite | '';
  /** Identifiant (uuid) du secteur ; '' = tous les secteurs. */
  secteur: string;
  /** Jour de détection (AAAA-MM-JJ, heure du Maroc), bornes comprises ; '' = sans borne. */
  du: string;
  au: string;
  /** Alertes seulement (mêmes alertes que la colonne « Alertes » de la liste). */
  alertes: boolean;
  /** Recherche : N°, référence ou adresse. */
  texte: string;
}

export const FILTRES_VIDES: FiltresListe = { statut: '', secteur: '', du: '', au: '', alertes: false, texte: '' };

// Le type impose la liste complète des statuts (et rien d'autre).
const STATUTS: Record<StatutFuite, true> = { detectee: true, en_reparation: true, reparee: true, achevee: true, sans_reparation: true };
const estStatut = (v: string): v is StatutFuite => Object.hasOwn(STATUTS, v);

export const CLES_ALERTES = [
  'alerte_non_reparee', 'alerte_communication_srm', 'refection_chaussee_hors_delai',
  'alerte_refection_chaussee', 'alerte_refection_trottoir',
] as const;
export type CleAlerte = (typeof CLES_ALERTES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FORME_JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;
const TEXTE_MAX = 100;
const VRAI = new Set(['1', 'true', 'oui']);

// Jour du calendrier réel (pas de 31 avril), années 2000 à 2999 (une saisie d'année en cours, « 0002 », est ignorée).
export function jourValide(v: string): boolean {
  const m = FORME_JOUR.exec(v);
  if (!m) return false;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  return a >= 2000 && a <= 2999 && d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
}

type Brut = { statut?: string; secteur?: string; du?: string; au?: string; alertes?: boolean; texte?: string };

// Forme canonique : valeurs invalides retirées, secteur en minuscules, période dans l'ordre (« du » ≤ « au »),
// texte sans espaces autour.
export function normaliser(f: Brut): FiltresListe {
  const statut = f.statut ?? '';
  const secteur = (f.secteur ?? '').trim().toLowerCase();
  const [d, a] = [(f.du ?? '').trim(), (f.au ?? '').trim()].map((j) => (jourValide(j) ? j : ''));
  const [du, au] = d && a && d > a ? [a, d] : [d, a];
  return {
    statut: estStatut(statut) ? statut : '',
    secteur: UUID.test(secteur) ? secteur : '',
    du,
    au,
    alertes: f.alertes === true,
    texte: (f.texte ?? '').trim().slice(0, TEXTE_MAX),
  };
}

type Parametres = { get(nom: string): string | null };

/** Filtres lus dans l'adresse (chaîne « a=1&b=2 », avec ou sans « ? », ou URLSearchParams). */
export function lireFiltres(source: string | Parametres): FiltresListe {
  const p = typeof source === 'string' ? new URLSearchParams(source) : source;
  return normaliser({
    statut: p.get('statut') ?? '',
    secteur: p.get('secteur') ?? '',
    du: p.get('du') ?? '',
    au: p.get('au') ?? '',
    alertes: VRAI.has((p.get('alertes') ?? '').trim().toLowerCase()),
    texte: p.get('texte') ?? '',
  });
}

/** Paramètres de l'adresse, dans un ordre fixe, sans les filtres vides ni invalides. */
export function ecrireFiltres(f: Brut): string {
  const n = normaliser(f);
  const p = new URLSearchParams();
  if (n.statut) p.set('statut', n.statut);
  if (n.secteur) p.set('secteur', n.secteur);
  if (n.du) p.set('du', n.du);
  if (n.au) p.set('au', n.au);
  if (n.alertes) p.set('alertes', '1');
  if (n.texte) p.set('texte', n.texte);
  return p.toString();
}

/** Lien vers la liste des fuites filtrée (tableau de bord, liens partagés). */
export function lienFuites(f: Brut = {}): string {
  const q = ecrireFiltres(f);
  return q ? `/fuites?${q}` : '/fuites';
}

export const memesFiltres = (a: Brut, b: Brut) => ecrireFiltres(a) === ecrireFiltres(b);
export const filtresActifs = (f: Brut) => ecrireFiltres(f) !== '';

/** Période appliquée : dates invalides ignorées, bornes remises dans l'ordre si « du » est après « au ». */
export function bornesPeriode(f: Pick<Brut, 'du' | 'au'>): { du: string; au: string } {
  const { du, au } = normaliser(f);
  return { du, au };
}

const jourFr = (j: string) => `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}`;

/** Période en clair (export, rapports) : « détectées du 01/10/2026 au 31/10/2026 », '' sans période. */
export function decrirePeriode(f: Pick<Brut, 'du' | 'au'>): string {
  const { du, au } = bornesPeriode(f);
  if (du && au) return du === au ? `détectées le ${jourFr(du)}` : `détectées du ${jourFr(du)} au ${jourFr(au)}`;
  if (du) return `détectées depuis le ${jourFr(du)}`;
  return au ? `détectées jusqu'au ${jourFr(au)}` : '';
}

// Jour à l'heure du Maroc, comme le tableau de bord (src/lib/ui/tableau-de-bord.ts) et la carte.
const FORMAT_JOUR = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' });
export function jourMaroc(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : FORMAT_JOUR.format(d);
}

export type FuiteFiltrable = Pick<VFuite, 'statut' | 'secteur_id' | 'numero' | 'reference_srm' | 'adresse'>
  & Partial<Pick<VFuite, 'date_detection' | CleAlerte>>;

export const aUneAlerte = (f: Partial<Pick<VFuite, CleAlerte>>) => CLES_ALERTES.some((c) => f[c] === true);

/** Prédicat de la liste : mêmes règles pour l'écran, l'export (« limiter à la liste affichée ») et les rapports PDF. */
export function correspondance(filtres: Brut): (f: FuiteFiltrable) => boolean {
  const n = normaliser(filtres);
  const { du, au } = bornesPeriode(n);
  const t = n.texte.toLowerCase();
  const chiffres = t.replace(/\D/g, '');
  return (f) => {
    if (n.statut && f.statut !== n.statut) return false;
    if (n.secteur && f.secteur_id !== n.secteur) return false;
    if (n.alertes && !aUneAlerte(f)) return false;
    if (du || au) {
      const j = jourMaroc(f.date_detection);
      if (!j || (du && j < du) || (au && j > au)) return false;
    }
    return !t ||
      String(f.numero) === t ||
      (f.reference_srm ?? '').toLowerCase().includes(t) ||
      (chiffres.length >= 3 && (f.reference_srm ?? '').replace(/\D/g, '').includes(chiffres)) ||
      (f.adresse ?? '').toLowerCase().includes(t);
  };
}

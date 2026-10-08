// Tableau de bord : calculs purs (période, indicateurs, répartitions, semaines, attachements).
// Jours comptés en heure de Casablanca (AAAA-MM-JJ). Seuls des imports de types : le script
// scripts/verifier-tableau-de-bord.mjs charge ce fichier directement avec Node.
import type { StatutFuite, VFuite } from '@/lib/types';

export type FuiteTdb = Pick<
  VFuite,
  | 'id' | 'numero' | 'statut' | 'zone' | 'secteur_id' | 'secteur' | 'date_detection'
  | 'derniere_reparation_le' | 'derniere_refection_le' | 'emplacement_fouille' | 'nb_photos'
  | 'alerte_non_reparee' | 'alerte_communication_srm' | 'alerte_refection_chaussee'
  | 'refection_chaussee_hors_delai' | 'alerte_refection_trottoir' | 'alerte_sans_photo'
> & { zone_id: string | null };

export const COLONNES_TDB =
  'id, numero, statut, zone_id, zone, secteur_id, secteur, date_detection, derniere_reparation_le, derniere_refection_le, ' +
  'emplacement_fouille, nb_photos, alerte_non_reparee, alerte_communication_srm, alerte_refection_chaussee, ' +
  'refection_chaussee_hors_delai, alerte_refection_trottoir, alerte_sans_photo';

export const ORDRE_STATUTS: StatutFuite[] = ['detectee', 'en_reparation', 'reparee', 'achevee', 'sans_reparation'];

// Mêmes alertes que le filtre « Alertes seulement » de la liste des fuites.
const ALERTES = [
  'alerte_non_reparee', 'alerte_communication_srm', 'refection_chaussee_hors_delai',
  'alerte_refection_chaussee', 'alerte_refection_trottoir',
] as const;
export const aUneAlerte = (f: Pick<FuiteTdb, (typeof ALERTES)[number]>) => ALERTES.some((c) => f[c] === true);

// ---------------------------------------------------------------------------
// Jours et périodes
// ---------------------------------------------------------------------------
const H = 3_600_000;
const FORMAT_JOUR = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Africa/Casablanca', year: 'numeric', month: '2-digit', day: '2-digit' });
export const jourCasa = (d: Date | string | number) => FORMAT_JOUR.format(new Date(d));

const dateUtc = (jour: string) => new Date(`${jour}T00:00:00Z`);
export function ajouterJours(jour: string, n: number): string {
  const d = dateUtc(jour);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const lundiDe = (jour: string) => ajouterJours(jour, -((dateUtc(jour).getUTCDay() + 6) % 7));
const finDeMois = (jour: string) => {
  const d = dateUtc(`${jour.slice(0, 7)}-01`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
};

export function semaineIso(jour: string): number {
  const jeudi = dateUtc(ajouterJours(lundiDe(jour), 3));
  const debutAnnee = Date.UTC(jeudi.getUTCFullYear(), 0, 1);
  return Math.floor((jeudi.getTime() - debutAnnee) / 86_400_000 / 7) + 1;
}

export type ChoixPeriode = 'mois' | 'semaine' | 'mois_precedent' | 'debut' | 'libre';
export interface Periode { du: string; au: string }

/** `debut` : jour de commencement du marché (OS, sinon première fuite) pour le choix « Depuis le début du marché ». */
export function periodePour(choix: ChoixPeriode, maintenant = new Date(), libre?: Partial<Periode>, debut?: string | null): Periode {
  const auj = jourCasa(maintenant);
  if (choix === 'debut') return { du: debut && debut <= auj ? debut : auj, au: auj };
  if (choix === 'semaine') {
    const l = lundiDe(auj);
    return { du: l, au: ajouterJours(l, 6) };
  }
  if (choix === 'mois_precedent') {
    const du = `${ajouterJours(`${auj.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
    return { du, au: finDeMois(du) };
  }
  if (choix === 'libre' && libre?.du && libre?.au) {
    return libre.du <= libre.au ? { du: libre.du, au: libre.au } : { du: libre.au, au: libre.du };
  }
  if (choix === 'libre' && (libre?.du || libre?.au)) {
    const j = (libre.du || libre.au)!;
    return { du: j, au: j };
  }
  return { du: `${auj.slice(0, 7)}-01`, au: finDeMois(auj) };
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const jourCourt = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}`;
export const jourLong = (jour: string) => `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;

export function libellePeriode(p: Periode): string {
  if (p.du.endsWith('-01') && p.au === finDeMois(p.du)) return `${MOIS[Number(p.du.slice(5, 7)) - 1]} ${p.du.slice(0, 4)}`;
  if (p.du === p.au) return `le ${jourLong(p.du)}`;
  return `du ${jourLong(p.du)} au ${jourLong(p.au)}`;
}

/** Début du marché : date d'effet de l'OS de commencement, sinon date de commencement, sinon jour de la première fuite. */
export function debutMarche(
  marche: { date_commencement?: string | null } | null,
  os: { date_os?: string | null; date_effet?: string | null } | null,
  fuites: Pick<FuiteTdb, 'date_detection'>[],
): string | null {
  const date = os?.date_effet ?? os?.date_os ?? marche?.date_commencement;
  if (date) return date.slice(0, 10);
  let premiere: string | null = null;
  for (const f of fuites) if (premiere == null || f.date_detection < premiere) premiere = f.date_detection;
  return premiere ? jourCasa(premiere) : null;
}

const dans = (jour: string | null, p: Periode) => jour != null && jour >= p.du && jour <= p.au;
const jourOuNull = (iso: string | null) => (iso ? jourCasa(iso) : null);

// Réparée : réparation enregistrée et statut « réparée » ou « achevée » (pas « en cours », pas « sans réparation »).
export const estReparee = (f: Pick<FuiteTdb, 'statut' | 'derniere_reparation_le'>) =>
  f.derniere_reparation_le != null && (f.statut === 'reparee' || f.statut === 'achevee');
const enAttente = (f: Pick<FuiteTdb, 'statut'>) => f.statut === 'detectee' || f.statut === 'en_reparation';
const delaiH = (f: Pick<FuiteTdb, 'date_detection' | 'derniere_reparation_le'>) => {
  const d = (new Date(f.derniere_reparation_le!).getTime() - new Date(f.date_detection).getTime()) / H;
  return d >= 0 ? d : null;
};

export function mediane(valeurs: number[]): number | null {
  if (!valeurs.length) return null;
  const s = [...valeurs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const moyenne = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

// ---------------------------------------------------------------------------
// Activité de la période
// ---------------------------------------------------------------------------
export interface Activite {
  detectees: number;
  detecteesEnAttente: number;
  detecteesSansPhoto: number;
  reparees: number;
  repareesAchevees: number;
  delaiMoyenH: number | null;
  delaiMedianH: number | null;
  delaiMaxH: number | null;
  nbDelais: number;
}

export function activite(fuites: FuiteTdb[], p: Periode): Activite {
  const a: Activite = {
    detectees: 0, detecteesEnAttente: 0, detecteesSansPhoto: 0, reparees: 0, repareesAchevees: 0,
    delaiMoyenH: null, delaiMedianH: null, delaiMaxH: null, nbDelais: 0,
  };
  const delais: number[] = [];
  for (const f of fuites) {
    if (dans(jourCasa(f.date_detection), p)) {
      a.detectees++;
      if (enAttente(f)) a.detecteesEnAttente++;
      if (f.alerte_sans_photo) a.detecteesSansPhoto++;
    }
    if (estReparee(f) && dans(jourOuNull(f.derniere_reparation_le), p)) {
      a.reparees++;
      if (f.statut === 'achevee') a.repareesAchevees++;
      const d = delaiH(f);
      if (d != null) delais.push(d);
    }
  }
  a.nbDelais = delais.length;
  a.delaiMoyenH = moyenne(delais);
  a.delaiMedianH = mediane(delais);
  a.delaiMaxH = delais.length ? Math.max(...delais) : null;
  return a;
}

// ---------------------------------------------------------------------------
// Situation à ce jour
// ---------------------------------------------------------------------------
export interface Situation {
  enAttente: number;
  alertes: number;
  refectionsHorsDelai: number;
  refectionsTrottoirAlerte: number;
  sansPhoto: number;
}

export function situation(fuites: FuiteTdb[]): Situation {
  const s: Situation = { enAttente: 0, alertes: 0, refectionsHorsDelai: 0, refectionsTrottoirAlerte: 0, sansPhoto: 0 };
  for (const f of fuites) {
    if (enAttente(f)) s.enAttente++;
    if (aUneAlerte(f)) s.alertes++;
    if (f.refection_chaussee_hors_delai) s.refectionsHorsDelai++;
    if (f.alerte_refection_trottoir) s.refectionsTrottoirAlerte++;
    if (f.alerte_sans_photo) s.sansPhoto++;
  }
  return s;
}

export function repartitionStatuts(fuites: Pick<FuiteTdb, 'statut'>[]): Record<StatutFuite, number> {
  const r = Object.fromEntries(ORDRE_STATUTS.map((s) => [s, 0])) as Record<StatutFuite, number>;
  for (const f of fuites) r[f.statut]++;
  return r;
}

export const detecteesSur = (fuites: FuiteTdb[], p: Periode) => fuites.filter((f) => dans(jourCasa(f.date_detection), p));

// ---------------------------------------------------------------------------
// Par secteur ou par zone
// ---------------------------------------------------------------------------
export type Regroupement = 'secteur' | 'zone';
export type ColonneGroupe = 'libelle' | 'detectees' | 'reparees' | 'enAttente' | 'alertes';
export interface LigneGroupe {
  cle: string;
  libelle: string;
  zone: string | null;
  detectees: number;
  reparees: number;
  enAttente: number;
  alertes: number;
}

// Détectées et réparées : sur la période ; en attente et alertes : à ce jour.
// Les secteurs sans aucun chiffre sont omis.
export function parGroupe(fuites: FuiteTdb[], p: Periode, regroupement: Regroupement): LigneGroupe[] {
  const lignes = new Map<string, LigneGroupe>();
  for (const f of fuites) {
    const cle = (regroupement === 'secteur' ? f.secteur_id : f.zone_id) ?? '';
    const libelle = (regroupement === 'secteur' ? f.secteur : f.zone) ?? 'Non renseigné';
    let l = lignes.get(cle);
    if (!l) {
      l = { cle, libelle, zone: regroupement === 'secteur' && cle ? f.zone : null, detectees: 0, reparees: 0, enAttente: 0, alertes: 0 };
      lignes.set(cle, l);
    }
    if (dans(jourCasa(f.date_detection), p)) l.detectees++;
    if (estReparee(f) && dans(jourOuNull(f.derniere_reparation_le), p)) l.reparees++;
    if (enAttente(f)) l.enAttente++;
    if (aUneAlerte(f)) l.alertes++;
  }
  return [...lignes.values()].filter((l) => l.detectees || l.reparees || l.enAttente || l.alertes);
}

export function trierGroupes(lignes: LigneGroupe[], colonne: ColonneGroupe, decroissant: boolean): LigneGroupe[] {
  const sens = decroissant ? -1 : 1;
  const parLibelle = (a: LigneGroupe, b: LigneGroupe) => a.libelle.localeCompare(b.libelle, 'fr', { numeric: true });
  return [...lignes].sort((a, b) =>
    colonne === 'libelle' ? sens * parLibelle(a, b) : sens * (a[colonne] - b[colonne]) || parLibelle(a, b));
}

// ---------------------------------------------------------------------------
// Évolution par semaine (lundi à dimanche), la plus récente en dernier
// ---------------------------------------------------------------------------
export interface Semaine {
  lundi: string;
  dimanche: string;
  numero: number;
  detectees: number;
  reparees: number;
  delaiMoyenH: number | null;
}

// `n` semaines se terminant par celle de `dernierJour` (fin de la période, sans dépasser aujourd'hui).
export function parSemaine(fuites: FuiteTdb[], dernierJour: string, n = 12): Semaine[] {
  const derniere = lundiDe(dernierJour);
  const semaines: Semaine[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const lundi = ajouterJours(derniere, -7 * i);
    semaines.push({ lundi, dimanche: ajouterJours(lundi, 6), numero: semaineIso(lundi), detectees: 0, reparees: 0, delaiMoyenH: null });
  }
  const index = new Map(semaines.map((s, i) => [s.lundi, i]));
  const delais: number[][] = semaines.map(() => []);
  for (const f of fuites) {
    const iDet = index.get(lundiDe(jourCasa(f.date_detection)));
    if (iDet != null) semaines[iDet].detectees++;
    if (!estReparee(f)) continue;
    const iRep = index.get(lundiDe(jourCasa(f.derniere_reparation_le!)));
    if (iRep == null) continue;
    semaines[iRep].reparees++;
    const d = delaiH(f);
    if (d != null) delais[iRep].push(d);
  }
  semaines.forEach((s, i) => (s.delaiMoyenH = moyenne(delais[i])));
  return semaines;
}

// Graduations « rondes » d'un axe (1, 2, 5 × 10ⁿ), de 0 au-dessus du maximum.
export function graduations(max: number, cible = 4, entiers = true): number[] {
  if (!(max > 0)) return [0, 1];
  const brut = max / cible;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  let pas = [1, 2, 5, 10].map((x) => x * puissance).find((x) => x >= brut)!;
  if (entiers) pas = Math.max(1, Math.round(pas));
  const haut = Math.ceil(max / pas) * pas;
  return Array.from({ length: Math.round(haut / pas) + 1 }, (_, i) => Number((i * pas).toFixed(6)));
}

// ---------------------------------------------------------------------------
// Anomalies (vue v_anomalies)
// ---------------------------------------------------------------------------
export const LIBELLES_ANOMALIES: Record<string, string> = {
  prix_hors_bordereau: 'Réparation sans prix au bordereau',
  fouille_superieure_2m: 'Fouille > 2 m sans remplacement',
  longueur_pe_superieure_2m: 'Polyéthylène au-delà du seuil du marché',
  reparation_avant_detection: 'Réparation avant détection',
  terrassement_sans_avis_srm: 'Terrassement sans avis préalable',
  refection_avant_reparation: 'Réfection avant réparation',
  reference_srm_format: 'Référence hors format',
  reference_srm_doublon: 'Référence en double',
};

export function resumeAnomalies(lignes: { fuite_id: string; anomalie: string }[]) {
  const parType = new Map<string, number>();
  for (const l of lignes) parType.set(l.anomalie, (parType.get(l.anomalie) ?? 0) + 1);
  const types = [...parType.entries()]
    .map(([code, nombre]) => ({ code, libelle: LIBELLES_ANOMALIES[code] ?? code, nombre }))
    .sort((a, b) => b.nombre - a.nombre || a.libelle.localeCompare(b.libelle, 'fr'));
  return { total: lignes.length, fuites: new Set(lignes.map((l) => l.fuite_id)).size, types };
}

// ---------------------------------------------------------------------------
// Attachements : lots, cumul attaché (lots arrêtés) et reste à attacher par article
// ---------------------------------------------------------------------------
export interface LotTdb { id: string; numero: number | null; statut: 'brouillon' | 'arrete'; date_arret: string | null }
export interface ArticleTdb {
  id: string;
  numero: string;
  ordre: number;
  designation: string;
  unite: string;
  quantite_marche: number | null;
  pu_ht: number | null;
  hors_bordereau: boolean;
  actif: boolean;
}
// Ligne d'un lot arrêté (v_attachement_lignes) : prix figé à l'arrêt.
export interface LigneAttacheeTdb { prix_id: string; quantite: number | null; pu_ht: number | null }
// Unité fuite × article au solde non nul (v_a_attacher).
export interface UniteResteTdb { fuite_id: string; prix_id: string; reste: number; brouillon_id: string | null }
// Reste à attacher agrégé par la base (resume_a_attacher), ou par resumerUnites à partir de v_a_attacher.
export interface ResteAAttacher {
  articles: { prix_id: string; reste: number; unites: number }[];
  unites: number;
  fuites: number;
  unites_en_brouillon: number;
}

export function resumerUnites(unites: UniteResteTdb[]): ResteAAttacher {
  const parPrix = new Map<string, { prix_id: string; reste: number; unites: number }>();
  for (const u of unites) {
    const a = parPrix.get(u.prix_id) ?? { prix_id: u.prix_id, reste: 0, unites: 0 };
    a.reste += Number(u.reste);
    a.unites++;
    parPrix.set(u.prix_id, a);
  }
  return {
    articles: [...parPrix.values()],
    unites: unites.length,
    fuites: new Set(unites.map((u) => u.fuite_id)).size,
    unites_en_brouillon: unites.filter((u) => u.brouillon_id).length,
  };
}

export function resumeLots(lots: LotTdb[]) {
  const arretes = lots.filter((l) => l.statut === 'arrete' && l.numero != null)
    .sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0));
  return { arretes: arretes.length, brouillons: lots.length - arretes.length, dernier: arretes[0] ?? null };
}

export interface ArticleRecap {
  article: ArticleTdb;
  attachee: number;
  montantAttache: number;
  reste: number;
  montantReste: number;
  pourcentage: number | null;
  pourcentageReste: number | null;
}

const arrondi = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d;

export function recapAttachements(articles: ArticleTdb[], lignes: LigneAttacheeTdb[], aAttacher: ResteAAttacher) {
  const attache = new Map<string, { q: number; m: number }>();
  for (const l of lignes) {
    const a = attache.get(l.prix_id) ?? { q: 0, m: 0 };
    const q = Number(l.quantite ?? 0);
    a.q += q;
    a.m += q * Number(l.pu_ht ?? 0);
    attache.set(l.prix_id, a);
  }
  const reste = new Map<string, number>();
  for (const a of aAttacher.articles) reste.set(a.prix_id, (reste.get(a.prix_id) ?? 0) + Number(a.reste));

  const lignesArticles: ArticleRecap[] = [...articles]
    .sort((a, b) => a.ordre - b.ordre || a.numero.localeCompare(b.numero, 'fr', { numeric: true }))
    .map((article) => {
      const q = arrondi(attache.get(article.id)?.q ?? 0, 3);
      const r = arrondi(reste.get(article.id) ?? 0, 3);
      const qm = Number(article.quantite_marche ?? 0);
      return {
        article,
        attachee: q,
        montantAttache: arrondi(attache.get(article.id)?.m ?? 0, 2),
        reste: r,
        montantReste: arrondi(r * Number(article.pu_ht ?? 0), 2),
        pourcentage: qm > 0 ? arrondi((100 * q) / qm, 1) : null,
        pourcentageReste: qm > 0 ? arrondi((100 * r) / qm, 1) : null,
      };
    })
    .filter((l) => (l.article.actif && !l.article.hors_bordereau) || l.attachee !== 0 || l.reste !== 0);

  const montantAttache = arrondi(lignesArticles.reduce((s, l) => s + l.montantAttache, 0), 2);
  const montantReste = arrondi(lignesArticles.reduce((s, l) => s + l.montantReste, 0), 2);
  const montantMarche = arrondi(articles
    .filter((a) => a.actif && !a.hors_bordereau)
    .reduce((s, a) => s + Number(a.quantite_marche ?? 0) * Number(a.pu_ht ?? 0), 0), 2);
  return {
    articles: lignesArticles,
    montantAttache,
    montantReste,
    montantMarche,
    avancement: montantMarche > 0 ? arrondi((100 * montantAttache) / montantMarche, 1) : null,
    unitesReste: aAttacher.unites,
    fuitesReste: aAttacher.fuites,
    unitesEnBrouillon: aAttacher.unites_en_brouillon,
  };
}

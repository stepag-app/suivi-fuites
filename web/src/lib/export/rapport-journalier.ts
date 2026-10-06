// Rapport journalier de recherche de fuites (CPS art. II-21, règle R-CPS-139 ; gabarit STEPAG 2026,
// références § 8.1) : PDF A4 portrait et classeur Excel A4, fabriqués dans le navigateur comme les
// autres exports (jsPDF + autotable et write-excel-file chargés à la demande).
//
// Contenu : en-tête du marché (logos, titulaire, maître d'ouvrage, n° et objet du marché), titre
// « RAPPORT JOURNALIER DE RECHERCHE DE FUITES », identification (société, journée en toutes lettres à
// l'heure du Maroc, équipes, agents, zones et secteurs d'intervention, linéaire inspecté en km : premiers
// passages, seul linéaire rémunéré (CPS art. II-15) ; linéaire repassé à part ; tronçons, nœuds), détail par
// secteur s'il y en a plusieurs, tableau des fuites du gabarit (« R.A.S » sans fuite), ligne TOTAL (visibles,
// invisibles), commentaire, visas du titulaire et du client (libellés lus dans la fiche du marché, jamais
// écrits ici) ; extrait du plan A4 (bas de la page 1 si la place suffit, sinon page 2) avec légende,
// échelle, nord et coordonnées WGS84 ; pied « Page n / N ». Arabe composé par le navigateur (arabe.ts).
//
// Rien ici ne lit Supabase ni n'exige le navigateur (sauf pour composer l'arabe) :
// scripts/verifier-rapport-journalier.mjs le fait tourner sous Node.
//
// -------------------------------------------------------------------------------------------------
// Appel depuis la page /balayage (au clic, comme les autres exports ; droits « balayage / lire »
// et « exports / lire ») :
//
//   const [{ chargerContexteRapport }, rj, { telecharger }] = await Promise.all([
//     import('@/lib/export/rapport-fuite'), import('@/lib/export/rapport-journalier'), import('@/lib/export/modele'),
//   ]);
//   1. ctx = await chargerContexteRapport(marcheId, false)     // fiche du marché, OS, logos
//   2. lignes : v_balayage_journalier, .eq('marche_id', marcheId).eq('date_balayage', jour)
//      (jour = AAAA-MM-JJ à l'heure du Maroc ; toutes les colonnes de la vue)
//   3. fuites : v_fuites_export, .select('numero, reference_srm, adresse, zone, secteur_id, secteur, equipe_id,
//      visibilite, diametre_mm, materiau, revetement, latitude, longitude')
//      .eq('marche_id', marcheId).eq('jour_detection', jour).order('numero')
//      (diamètre, matériau et revêtement de la dernière réparation ; avant réparation, la page peut reprendre
//      diametre_mm et materiau du tronçon balayé le plus proche, colonnes de `troncons`)
//   4. Décision Q-34, au choix :
//      - un rapport du jour regroupé : journee = rj.syntheseJournee(lignes, { date: jour }) avec toutes les fuites ;
//      - un rapport par équipe (ou par équipe et secteur) :
//        const { rapports, fuitesNonAttribuees } = rj.regrouperParEquipe(lignes, fuites, { date: jour, parSecteur })
//        puis un fichier par élément de `rapports` (r.journee, r.fuites) ; signaler `fuitesNonAttribuees`
//        (fuite sans équipe dans un secteur balayé par plusieurs équipes) à l'utilisateur.
//   5. journee.commentaire = texte saisi (facultatif).
//   6. Extrait de plan (facultatif) : { capturer: (largeurMm, hauteurMm) => Promise<ImageCarte> } rendu hors écran
//      comme carte/capture.ts (fond OpenFreeMap ; tronçons des secteurs du jour par reseau_geojson ; balayés ce jour
//      d'après etat_balayage : premier passage en vert, repasse en bleu, autres conduites en gris ; fuites du jour ;
//      cadrage sur l'emprise des tronçons balayés et des fuites, marge de 10 %), ou une image déjà prête
//      ({ image: ImageCarte } ou { image: { dataUrl, largeurPx, hauteurPx, bornes? } }). Les fuites sont numérotées
//      ici d'après leurs coordonnées si l'image est géoréférencée (bornes) et que `fuitesDessinees` n'est pas vrai.
//      Légende par défaut : LEGENDE_PLAN_DEFAUT (mêmes couleurs que la carte), remplaçable par `legende`.
//   7. blob = await rj.genererRapportJournalierPdf(ctx, journee, fuites, { extrait })
//      telecharger(blob, `${rj.nomFichierRapportJournalier(ctx, journee)}.pdf`)
//      blob = await rj.genererRapportJournalierXlsx(ctx, journee, fuites)   // même contenu, sans l'extrait de plan
// -------------------------------------------------------------------------------------------------
import type { CellHookData, CellInput, RowInput } from 'jspdf-autotable';
import { MATERIAUX, libellesMarche } from '@/lib/format';
import type { Marche } from '@/lib/types';
import { contientArabe, imagesTextes, type ImageTexte } from './arabe';
import { barreEchelle, centreImage, echelleNumerique, metresParMm, type Bornes, type ImageCarte } from './carte-pdf';
import { construireEntete, type Contexte } from './jeux';
import { dimensionsLogo, mmEnPixels, nomFichierSur, octetsDataUrl, texteDate, texteNombre, type EnteteDoc, type LogoEntete } from './modele';
import { BLEU, FOND_GROUPE, GRIS_TRAIT, dessinerEntete } from './pdf';

type Pdf = InstanceType<typeof import('jspdf').jsPDF>;
type Rgb = [number, number, number];

// ---------------------------------------------------------------------------
// Données d'entrée
// ---------------------------------------------------------------------------
type NombreVue = number | string | null | undefined;   // numeric de PostgreSQL : nombre ou texte selon le client

// Une ligne de la vue v_balayage_journalier (contrat du lot S, § 3) : une par date, équipe, agent, zone, secteur.
// nb_fuites y compte les fuites du secteur détectées ce jour, toutes équipes confondues (répété sur chaque ligne).
export interface LigneVueJournalier {
  marche_id?: string;
  date_balayage: string;          // AAAA-MM-JJ, heure du Maroc
  equipe_id: string | null;
  equipe: string | null;
  agent_id?: string | null;
  agent: string | null;
  zone_id: string | null;
  zone: string | null;
  secteur_id: string | null;
  secteur: string | null;
  nb_troncons: NombreVue;
  lineaire_m: NombreVue;          // premiers passages (payés)
  lineaire_repasse_m: NombreVue;  // passages suivants (non payés)
  nb_noeuds: NombreVue;
  nb_fuites: NombreVue;
}

export interface EquipeJour { id: string | null; libelle: string }

// Linéaire d'une journée pour une zone et un secteur (agents et équipes additionnés).
export interface LigneSecteurJour {
  zone_id: string | null;
  zone: string | null;
  secteur_id: string | null;
  secteur: string | null;
  nb_troncons: number;
  lineaire_m: number;
  lineaire_repasse_m: number;
  nb_noeuds: number;
  nb_fuites: number;
}

export interface JourneeBalayage {
  date: string;                   // AAAA-MM-JJ
  equipes: EquipeJour[];
  agents: string[];
  lignes: LigneSecteurJour[];     // une par zone / secteur
  commentaire?: string | null;
}

export interface TotauxJournee {
  nb_troncons: number;
  lineaire_m: number;
  lineaire_repasse_m: number;
  nb_noeuds: number;
  nb_fuites: number;              // d'après la vue : fuites des secteurs balayés, toutes équipes
  lineaire_km: number;            // arrondi au mètre (3 décimales)
  lineaire_repasse_km: number;
}

export interface LineaireEquipe extends EquipeJour {
  nb_troncons: number;
  lineaire_m: number;
  lineaire_repasse_m: number;
  lineaire_km: number;
}

export interface SyntheseJournee extends JourneeBalayage {
  totaux: TotauxJournee;
  zones: string[];
  secteurs: string[];
  parEquipe: LineaireEquipe[];
}

// Une fuite détectée ce jour (colonnes de v_fuites_export).
export interface FuiteJour {
  numero: number | null;
  reference_srm: string | null;
  adresse: string | null;
  zone?: string | null;
  secteur_id?: string | null;
  secteur: string | null;
  equipe_id?: string | null;
  visibilite: 'visible' | 'invisible' | null;
  diametre_mm?: NombreVue;
  materiau?: string | null;       // code (MATERIAUX) ou texte du plan (PEHD, PVC…)
  revetement?: string | null;     // nature de la dégradation (revêtement)
  latitude: number | null;
  longitude: number | null;
}

// ---------------------------------------------------------------------------
// Extrait de plan
// ---------------------------------------------------------------------------
export interface ImageFournie { dataUrl: string; largeurPx: number; hauteurPx: number; bornes?: Bornes | null }
export type ImageExtrait = ImageCarte | ImageFournie;

export type SymboleLegende =
  | { forme: 'trait'; couleur: string; epaisseur?: number; tirets?: boolean }
  | { forme: 'point'; fond: string; contour: string }
  | { forme: 'contour'; couleur: string; tirets?: boolean };

export interface EntreeLegendePlan { libelle: string; symbole: SymboleLegende }

export interface ExtraitPlan {
  image?: ImageExtrait;
  capturer?: (largeurMm: number, hauteurMm: number) => Promise<ImageCarte>;   // rendu à la taille exacte du cadre
  legende?: EntreeLegendePlan[];
  fuitesDessinees?: boolean;      // vrai si l'image porte déjà les fuites numérotées
  attribution?: string | null;    // par défaut : OpenStreetMap pour une ImageCarte, rien pour une image fournie
  centre?: { latitude: number; longitude: number } | null;   // image non géoréférencée : centre connu
}

// Mêmes couleurs que la carte (lib/reseau/palette.ts : balayé, repassé, non balayé ; points « détectée »).
export const COULEURS_PLAN = {
  inspectee: '#256f3a',
  repassee: '#0064d9',
  autre: '#8a97a5',
  fuite: { fond: '#e26060', contour: '#aa0808' },
  secteur: '#0b5d8a',
};

export const LEGENDE_PLAN_DEFAUT: EntreeLegendePlan[] = [
  { libelle: 'Conduites inspectées ce jour (premier passage)', symbole: { forme: 'trait', couleur: COULEURS_PLAN.inspectee, epaisseur: 1 } },
  { libelle: 'Conduites repassées ce jour', symbole: { forme: 'trait', couleur: COULEURS_PLAN.repassee, epaisseur: 1 } },
  { libelle: 'Autres conduites du réseau', symbole: { forme: 'trait', couleur: COULEURS_PLAN.autre, epaisseur: 0.45 } },
  { libelle: 'Fuite détectée ce jour (n° de la fuite)', symbole: { forme: 'point', ...COULEURS_PLAN.fuite } },
  { libelle: 'Contour de secteur', symbole: { forme: 'contour', couleur: COULEURS_PLAN.secteur, tirets: true } },
];

export type ComposeurArabe = (textes: string[], taillePt: number, gras?: boolean) => Promise<Map<string, ImageTexte>>;

export interface OptionsRapportJournalier {
  extrait?: ExtraitPlan | null;
  visas?: string[];               // défaut : [nom du titulaire, sigle du client] (fiche du marché)
  titre?: string;
  genereLe?: Date;
  composerArabe?: ComposeurArabe; // défaut : composition par le navigateur (arabe.ts)
}

export const TITRE_RAPPORT_JOURNALIER = 'RAPPORT JOURNALIER DE RECHERCHE DE FUITES';
export const SANS_EQUIPE = 'Sans équipe';
export const HORS_SECTEUR = 'Hors secteur (non zoné)';
const SANS_ZONE = 'Sans zone';

// Mise en page (mm). Gabarit générique en attendant un modèle imposé par le client.
export const GABARIT_JOURNALIER = {
  marge: 12,
  pied: 14,                       // bas de page réservé au pied
  taille: 8.5,                    // points, tableaux
  hauteurCommentaire: 16,
  hauteurVisa: 26,
  hauteurMinExtraitBasDePage: 100, // l'extrait reste en page 1 s'il garde au moins cette hauteur
  bandeCartouche: 30,
  ecartCartouche: 3,
  ecartBoites: 2.5,
  partsBande: [0.42, 0.26, 0.32], // Légende, Échelle et nord, Coordonnées
  interligne: 3.4,
  barreEchelleMax: 30,
};

// ---------------------------------------------------------------------------
// Fonctions pures : synthèse, regroupement, arrondis
// ---------------------------------------------------------------------------
const nombre = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Kilomètres arrondis au mètre (3 décimales). Toujours sommer les mètres avant d'arrondir.
export const kmArrondis = (metres: number): number => Math.round(nombre(metres)) / 1000;

const comparer = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
const normaliser = (t: string | null | undefined) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
const distincts = (t: (string | null | undefined)[]) => [...new Set(t.map((x) => x?.trim()).filter((x): x is string => !!x))];

// « 2026-10-06 » → « mardi 6 octobre 2026 » (heure du Maroc ; midi UTC : jamais de changement de jour).
export function jourEnLettres(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('fr-FR', { timeZone: 'Africa/Casablanca', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/^(\S+) 1 /, '$1 1er ');
}

const jourCourt = (date: string) => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? date.split('-').reverse().join('/') : date);

function lignesDuJour(lignes: LigneVueJournalier[], date?: string): { date: string; lignes: LigneVueJournalier[] } {
  const retenues = date ? lignes.filter((l) => l.date_balayage === date) : lignes;
  const dates = distincts(retenues.map((l) => l.date_balayage)).sort();
  if (dates.length > 1) throw new Error(`Lignes de ${dates.length} journées (${dates.join(', ')}) : précisez la date du rapport.`);
  const jour = date ?? dates[0];
  if (!jour) throw new Error('Aucune ligne de balayage : précisez la date du rapport.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) throw new Error(`Date du rapport invalide : « ${jour} » (AAAA-MM-JJ attendu).`);
  return { date: jour, lignes: retenues };
}

export function totauxJournee(lignes: LigneSecteurJour[]): TotauxJournee {
  const t = { nb_troncons: 0, lineaire_m: 0, lineaire_repasse_m: 0, nb_noeuds: 0, nb_fuites: 0 };
  for (const l of lignes) {
    t.nb_troncons += nombre(l.nb_troncons);
    t.lineaire_m += nombre(l.lineaire_m);
    t.lineaire_repasse_m += nombre(l.lineaire_repasse_m);
    t.nb_noeuds += nombre(l.nb_noeuds);
    t.nb_fuites += nombre(l.nb_fuites);
  }
  const arrondi = (m: number) => Math.round(m * 100) / 100;
  return {
    ...t,
    lineaire_m: arrondi(t.lineaire_m),
    lineaire_repasse_m: arrondi(t.lineaire_repasse_m),
    lineaire_km: kmArrondis(t.lineaire_m),
    lineaire_repasse_km: kmArrondis(t.lineaire_repasse_m),
  };
}

// Regroupe les lignes de v_balayage_journalier d'une date (et d'une équipe, facultatif : `null` = sans équipe)
// par zone et secteur. Linéaires, tronçons et nœuds s'additionnent ; nb_fuites, déjà compté par secteur dans la
// vue, n'est pris qu'une fois par secteur. Un nœud au contact de tronçons balayés par deux agents peut être
// compté deux fois (la vue compte par agent).
export function syntheseJournee(lignes: LigneVueJournalier[], filtre: { date?: string; equipeId?: string | null } = {}): SyntheseJournee {
  const jour = lignesDuJour(lignes, filtre.date);
  const retenues = filtre.equipeId === undefined ? jour.lignes : jour.lignes.filter((l) => (l.equipe_id ?? null) === filtre.equipeId);

  const parSecteur = new Map<string, LigneSecteurJour>();
  const equipes = new Map<string, LineaireEquipe>();
  for (const l of retenues) {
    const cle = `${l.zone_id ?? ''}|${l.secteur_id ?? ''}|${l.secteur_id ? '' : normaliser(l.secteur)}`;
    const s = parSecteur.get(cle) ?? {
      zone_id: l.zone_id, zone: l.zone?.trim() || null, secteur_id: l.secteur_id, secteur: l.secteur?.trim() || null,
      nb_troncons: 0, lineaire_m: 0, lineaire_repasse_m: 0, nb_noeuds: 0, nb_fuites: 0,
    };
    s.nb_troncons += nombre(l.nb_troncons);
    s.lineaire_m += nombre(l.lineaire_m);
    s.lineaire_repasse_m += nombre(l.lineaire_repasse_m);
    s.nb_noeuds += nombre(l.nb_noeuds);
    s.nb_fuites = Math.max(s.nb_fuites, nombre(l.nb_fuites));
    parSecteur.set(cle, s);

    const ce = l.equipe_id ?? '';
    const e = equipes.get(ce) ?? { id: l.equipe_id ?? null, libelle: l.equipe?.trim() || SANS_EQUIPE, nb_troncons: 0, lineaire_m: 0, lineaire_repasse_m: 0, lineaire_km: 0 };
    e.nb_troncons += nombre(l.nb_troncons);
    e.lineaire_m += nombre(l.lineaire_m);
    e.lineaire_repasse_m += nombre(l.lineaire_repasse_m);
    e.lineaire_km = kmArrondis(e.lineaire_m);
    equipes.set(ce, e);
  }

  const lignesSecteurs = [...parSecteur.values()]
    .map((s) => ({ ...s, lineaire_m: Math.round(s.lineaire_m * 100) / 100, lineaire_repasse_m: Math.round(s.lineaire_repasse_m * 100) / 100 }))
    .sort((a, b) => comparer(a.zone ?? SANS_ZONE, b.zone ?? SANS_ZONE) || comparer(a.secteur ?? HORS_SECTEUR, b.secteur ?? HORS_SECTEUR));
  const parEquipe = [...equipes.values()].sort((a, b) => comparer(a.libelle, b.libelle));
  return {
    date: jour.date,
    equipes: parEquipe.map(({ id, libelle }) => ({ id, libelle })),
    agents: distincts(retenues.map((l) => l.agent)).sort(comparer),
    lignes: lignesSecteurs,
    totaux: totauxJournee(lignesSecteurs),
    zones: distincts(lignesSecteurs.map((l) => l.zone ?? SANS_ZONE)),
    secteurs: distincts(lignesSecteurs.map((l) => l.secteur ?? HORS_SECTEUR)),
    parEquipe,
  };
}

export interface RapportEquipe {
  equipe: EquipeJour;
  secteur: { id: string | null; libelle: string } | null;   // seulement avec parSecteur
  journee: SyntheseJournee;
  fuites: FuiteJour[];
}

const memeSecteur = (f: FuiteJour, l: { secteur_id: string | null; secteur: string | null }) =>
  f.secteur_id && l.secteur_id ? f.secteur_id === l.secteur_id : !!f.secteur?.trim() && normaliser(f.secteur) === normaliser(l.secteur);

export function trierFuites(fuites: FuiteJour[]): FuiteJour[] {
  return [...fuites].sort((a, b) =>
    (a.numero ?? Number.MAX_SAFE_INTEGER) - (b.numero ?? Number.MAX_SAFE_INTEGER) || comparer(a.reference_srm ?? '', b.reference_srm ?? ''));
}

// Un rapport par équipe (ou par équipe et secteur) pour une journée (décision Q-34). Une fuite va au rapport
// de son équipe de détection ; sans équipe connue (ou si l'équipe a plusieurs secteurs avec parSecteur), au
// rapport dont le secteur est le sien s'il est le seul ; sinon elle est rendue dans fuitesNonAttribuees.
export function regrouperParEquipe(
  lignes: LigneVueJournalier[],
  fuites: FuiteJour[] = [],
  options: { date?: string; parSecteur?: boolean } = {},
): { date: string; rapports: RapportEquipe[]; fuitesNonAttribuees: FuiteJour[] } {
  const jour = lignesDuJour(lignes, options.date);
  const groupes = new Map<string, LigneVueJournalier[]>();
  for (const l of jour.lignes) {
    const cle = `${l.equipe_id ?? ''}${options.parSecteur ? `|${l.zone_id ?? ''}|${l.secteur_id ?? normaliser(l.secteur)}` : ''}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), l]);
  }
  const rapports: RapportEquipe[] = [...groupes.values()].map((ls) => ({
    equipe: { id: ls[0].equipe_id ?? null, libelle: ls[0].equipe?.trim() || SANS_EQUIPE },
    secteur: options.parSecteur ? { id: ls[0].secteur_id, libelle: ls[0].secteur?.trim() || HORS_SECTEUR } : null,
    journee: syntheseJournee(ls, { date: jour.date }),
    fuites: [],
  })).sort((a, b) => comparer(a.equipe.libelle, b.equipe.libelle) || comparer(a.secteur?.libelle ?? '', b.secteur?.libelle ?? ''));

  const dansSecteur = (f: FuiteJour) => (r: RapportEquipe) => r.journee.lignes.some((l) => memeSecteur(f, l));
  const nonAttribuees: FuiteJour[] = [];
  for (const f of fuites) {
    let candidats = rapports;
    if (f.equipe_id) {
      candidats = rapports.filter((r) => r.equipe.id === f.equipe_id);
      if (candidats.length > 1) candidats = candidats.filter(dansSecteur(f));
    } else {
      candidats = rapports.filter(dansSecteur(f));
    }
    if (candidats.length === 1) candidats[0].fuites.push(f);
    else nonAttribuees.push(f);
  }
  rapports.forEach((r) => { r.fuites = trierFuites(r.fuites); });
  return { date: jour.date, rapports, fuitesNonAttribuees: trierFuites(nonAttribuees) };
}

// ---------------------------------------------------------------------------
// Contenu commun au PDF et à l'Excel
// ---------------------------------------------------------------------------
export interface LigneFuiteRapport {
  numero: string;
  secteur: string;
  adresse: string;                // référence, puis adresse à la ligne
  calibre: number | null;         // mm
  nature: string;                 // matériau de la canalisation
  visible: 0 | 1;
  invisible: 0 | 1;
  degradation: string;
  fuite: FuiteJour;
}

export interface ContenuRapportJournalier {
  entete: EnteteDoc;
  titre: string;
  societe: string;
  sigleClient: string;
  date: string;
  jour: string;                   // en toutes lettres
  jourCourt: string;              // JJ/MM/AAAA
  equipes: string;
  totaux: TotauxJournee;
  zones: string[];
  secteurs: string[];
  identification: [string, string, boolean][];   // libellé, valeur, pleine largeur
  detailSecteurs: (LigneSecteurJour & { fuites: number })[] | null;   // 2 secteurs ou plus
  fuitesHorsSecteurs: number;     // fuites dont le secteur n'est pas parmi ceux balayés (détail par secteur)
  avecSecteur: boolean;           // colonne « Secteur » dans le tableau des fuites
  libelleAdresse: string;
  fuites: LigneFuiteRapport[];
  visibles: number;
  invisibles: number;
  nonPrecisees: number;
  totalFuites: string;
  commentaire: string;
  visas: string[];
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
const minusculeInitiale = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);
export const texteKm = (metres: number) => `${texteNombre(kmArrondis(metres), 3)} km`;

export function contenuRapportJournalier(
  ctx: Contexte, journee: JourneeBalayage, fuites: FuiteJour[], options: Pick<OptionsRapportJournalier, 'visas' | 'titre'> = {},
): ContenuRapportJournalier {
  const marche = ctx.marche as unknown as Marche;
  const libelles = libellesMarche(marche);
  const titre = options.titre ?? TITRE_RAPPORT_JOURNALIER;
  const entete = construireEntete(ctx, titre, []);
  const societe = String(ctx.marche.titulaire_nom ?? '').trim() || entete.titulaire[0] || '';
  const totaux = totauxJournee(journee.lignes);
  const triees = trierFuites(fuites);

  // Zones et secteurs : ceux du balayage ; à défaut (journée sans balayage saisi), ceux des fuites.
  const zones = journee.lignes.length ? distincts(journee.lignes.map((l) => l.zone ?? SANS_ZONE)) : distincts(triees.map((f) => f.zone));
  const secteurs = journee.lignes.length ? distincts(journee.lignes.map((l) => l.secteur ?? HORS_SECTEUR)) : distincts(triees.map((f) => f.secteur));
  const equipes = journee.equipes.map((e) => e.libelle).join(', ') || '—';
  const liste = (t: string[]) => t.join(', ') || '—';

  const identification: [string, string, boolean][] = [
    ['Société', societe || '—', false],
    ['Journée du', jourEnLettres(journee.date), false],
    [journee.equipes.length > 1 ? 'Équipes' : 'Équipe N°', equipes, false],
    [journee.agents.length > 1 ? 'Agents' : 'Agent', liste(journee.agents), false],
    ['Zone d\'intervention', liste(zones), false],
    ['Secteur d\'intervention', liste(secteurs), false],
    ['Linéaire inspecté', `${texteKm(totaux.lineaire_m)} (premiers passages)`, false],
    ['Tronçons inspectés', String(totaux.nb_troncons), false],
  ];
  if (totaux.lineaire_repasse_m > 0) identification.push(['Linéaire repassé', `${texteKm(totaux.lineaire_repasse_m)} (non rémunéré)`, false]);
  identification.push(['Nœuds', String(totaux.nb_noeuds), false]);
  const parEquipe = (journee as Partial<SyntheseJournee>).parEquipe;
  if (parEquipe && parEquipe.length > 1) {
    identification.push(['Linéaire par équipe', parEquipe.map((e) => `${e.libelle} : ${texteKm(e.lineaire_m)}`).join(' ; '), true]);
  }
  identification.forEach((l) => { if (l[1].length > 44) l[2] = true; });

  const avecSecteur = journee.lignes.length > 1 || distincts(triees.map((f) => f.secteur)).length > 1;
  const detailSecteurs = journee.lignes.length > 1
    ? journee.lignes.map((l) => ({ ...l, fuites: triees.filter((f) => memeSecteur(f, l)).length }))
    : null;
  const fuitesHorsSecteurs = detailSecteurs ? triees.filter((f) => !journee.lignes.some((l) => memeSecteur(f, l))).length : 0;

  const lignes: LigneFuiteRapport[] = triees.map((f) => {
    const d = f.diametre_mm == null || f.diametre_mm === '' ? null : nombre(f.diametre_mm) || null;
    return {
      numero: f.numero == null ? '—' : String(f.numero),
      secteur: f.secteur?.trim() || '',
      adresse: [f.reference_srm?.trim(), f.adresse?.trim()].filter(Boolean).join('\n'),
      calibre: d,
      nature: f.materiau ? MATERIAUX[f.materiau] ?? f.materiau : '',
      visible: f.visibilite === 'visible' ? 1 : 0,
      invisible: f.visibilite === 'invisible' ? 1 : 0,
      degradation: f.revetement?.trim() || '',
      fuite: f,
    };
  });
  const visibles = lignes.reduce((s, l) => s + l.visible, 0);
  const invisibles = lignes.reduce((s, l) => s + l.invisible, 0);
  const nonPrecisees = lignes.length - visibles - invisibles;
  const totalFuites = lignes.length
    ? `Total des fuites détectées : ${lignes.length} (${pluriel(visibles, 'visible')}, ${pluriel(invisibles, 'invisible')}${nonPrecisees ? `, ${nonPrecisees} sans visibilité précisée` : ''})`
    : 'Total des fuites détectées : 0 (R.A.S)';

  return {
    entete,
    titre,
    societe,
    sigleClient: libelles.sigle,
    date: journee.date,
    jour: jourEnLettres(journee.date),
    jourCourt: jourCourt(journee.date),
    equipes,
    totaux,
    zones,
    secteurs,
    identification,
    detailSecteurs,
    fuitesHorsSecteurs,
    avecSecteur,
    libelleAdresse: `Adresse ou ${minusculeInitiale(libelles.reference)}`,
    fuites: lignes,
    visibles,
    invisibles,
    nonPrecisees,
    totalFuites,
    commentaire: journee.commentaire?.trim() ?? '',
    visas: (options.visas ?? [societe, libelles.sigle]).map((v) => v.trim()).filter(Boolean),
  };
}

export function nomFichierRapportJournalier(ctx: Contexte, journee: JourneeBalayage): string {
  const equipe = journee.equipes.length === 1 ? `-${journee.equipes[0].libelle}` : '';
  return nomFichierSur(`rapport-journalier-${String(ctx.marche.code ?? '')}-${journee.date}${equipe}`);
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
const TEXTE: Rgb = [20, 35, 46];
const DISCRET: Rgb = [91, 107, 119];
const BLANC: Rgb = [255, 255, 255];
const FOND_TOTAL: Rgb = [242, 242, 242];
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;

interface Rect { x: number; y: number; l: number; h: number }

function police(pdf: Pdf, gras = false, taille = GABARIT_JOURNALIER.taille, couleur: Rgb = TEXTE) {
  pdf.setFont('helvetica', gras ? 'bold' : 'normal');
  pdf.setFontSize(taille);
  pdf.setTextColor(...couleur);
}

const texteBrut = (raw: unknown): string =>
  raw && typeof raw === 'object' && 'content' in raw ? String((raw as { content: unknown }).content ?? '') : String(raw ?? '');

// Cellules contenant de l'arabe : texte vidé, image composée posée à droite de la cellule (comme pdf.ts).
function crochetsArabe(pdf: Pdf, images: Map<string, ImageTexte>) {
  return {
    didParseCell: (data: CellHookData) => {
      if (data.section !== 'body') return;
      const brut = texteBrut(data.cell.raw);
      const img = contientArabe(brut) ? images.get(brut) : undefined;
      if (!img) return;
      (data.cell as unknown as { arabe: string }).arabe = brut;
      data.cell.text = [''];
      data.cell.styles.minCellHeight = img.hauteurMm + 1;
    },
    didDrawCell: (data: CellHookData) => {
      const arabe = (data.cell as unknown as { arabe?: string }).arabe;
      const img = data.section === 'body' && arabe ? images.get(arabe) : undefined;
      if (!img) return;
      const k = Math.min(1, (data.cell.width - 2) / img.largeurMm);
      pdf.addImage(img.donnees, 'PNG', data.cell.x + data.cell.width - 1 - img.largeurMm * k,
        data.cell.y + (data.cell.height - img.hauteurMm * k) / 2, img.largeurMm * k, img.hauteurMm * k, img.alias, 'FAST');
    },
  };
}

// Tableau « libellé : valeur » sur deux paires par ligne ; une valeur longue prend toute la largeur.
function paires(champs: [string, string, boolean][]): CellInput[][] {
  const lignes: CellInput[][] = [];
  let attente: CellInput[] | null = null;
  for (const [libelle, valeur, large] of champs) {
    if (large) {
      if (attente) { lignes.push([...attente, '', '']); attente = null; }
      lignes.push([libelle, { content: valeur, colSpan: 3 }]);
    } else if (attente) {
      lignes.push([...attente, libelle, valeur]);
      attente = null;
    } else {
      attente = [libelle, valeur];
    }
  }
  if (attente) lignes.push([...attente, '', '']);
  return lignes;
}

// Web Mercator (sphère de MapLibre), comme carte-pdf.ts.
const yMercator = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
function projeter(b: Bornes, r: Rect, latitude: number, longitude: number): { x: number; y: number } | null {
  const x = r.x + ((longitude - b.ouest) / (b.est - b.ouest)) * r.l;
  const y = r.y + ((yMercator(b.nord) - yMercator(latitude)) / (yMercator(b.nord) - yMercator(b.sud))) * r.h;
  return x >= r.x && x <= r.x + r.l && y >= r.y && y <= r.y + r.h ? { x, y } : null;
}

const coordonnee = (lat: number, lon: number, decimales: number) => `${lat.toFixed(decimales)}, ${lon.toFixed(decimales)}`;

function boite(pdf: Pdf, r: Rect, titre: string): number {
  pdf.setFillColor(...FOND_GROUPE);
  pdf.rect(r.x, r.y, r.l, 5, 'F');
  pdf.setDrawColor(...GRIS_TRAIT);
  pdf.setLineWidth(0.2);
  pdf.rect(r.x, r.y, r.l, r.h);
  police(pdf, true, 7.5, BLEU);
  pdf.text(titre, r.x + 2, r.y + 3.5);
  police(pdf, false, 7);
  return r.y + 5 + 3.6;
}

function symbole(pdf: Pdf, s: SymboleLegende, x: number, y: number) {
  pdf.setLineDashPattern([], 0);
  if (s.forme === 'point') {
    pdf.setLineWidth(0.3);
    pdf.setFillColor(...rgb(s.fond));
    pdf.setDrawColor(...rgb(s.contour));
    pdf.circle(x + 2.2, y, 1.25, 'FD');
    return;
  }
  pdf.setDrawColor(...rgb(s.couleur));
  if (s.tirets) pdf.setLineDashPattern([0.9, 0.6], 0);
  if (s.forme === 'trait') {
    pdf.setLineWidth(s.epaisseur ?? 0.6);
    pdf.line(x, y, x + 5, y);
  } else {
    pdf.setLineWidth(0.3);
    pdf.rect(x + 0.3, y - 1.2, 4.4, 2.4);
  }
  pdf.setLineDashPattern([], 0);
}

function nord(pdf: Pdf, cx: number, yHaut: number, h: number) {
  police(pdf, true, 8);
  pdf.text('N', cx, yHaut + 2.6, { align: 'center' });
  const pointe = yHaut + 3.6;
  const base = yHaut + h;
  const creux = base - h * 0.2;
  const demi = h * 0.22;
  pdf.setLineWidth(0.25);
  pdf.setDrawColor(...TEXTE);
  pdf.setFillColor(...TEXTE);
  pdf.triangle(cx, pointe, cx - demi, base, cx, creux, 'FD');
  pdf.setFillColor(...BLANC);
  pdf.triangle(cx, pointe, cx + demi, base, cx, creux, 'FD');
}

function cartouche(pdf: Pdf, y: number, hauteur: number, legende: EntreeLegendePlan[], bornes: Bornes | null,
  largeurImageMm: number, centre: { latitude: number; longitude: number } | null) {
  const G = GABARIT_JOURNALIER;
  const utile = pdf.internal.pageSize.getWidth() - 2 * G.marge;
  const total = utile - G.ecartBoites * (G.partsBande.length - 1);
  let x = G.marge;
  const [r1, r2, r3] = G.partsBande.map((p) => {
    const r = { x, y, l: total * p, h: hauteur };
    x += r.l + G.ecartBoites;
    return r;
  });

  // Légende
  let yl = boite(pdf, r1, 'Légende');
  for (const e of legende) {
    symbole(pdf, e.symbole, r1.x + 2, yl - 1.1);
    police(pdf, false, 7);
    pdf.text(pdf.splitTextToSize(e.libelle, r1.l - 11)[0] as string, r1.x + 9, yl);
    yl += G.interligne;
  }

  // Échelle et nord
  const ye = boite(pdf, r2, 'Échelle et nord');
  if (bornes) {
    const mParMm = metresParMm(bornes, largeurImageMm);
    const placeNord = 10;
    const barre = barreEchelle(mParMm, Math.min(G.barreEchelleMax, r2.l - 6 - placeNord));
    const xb = r2.x + 3;
    const yb = ye - 0.5;
    const segment = barre.mm / barre.segments;
    const km = barre.metres >= 1000;
    const valeur = (m: number) => texteNombre(km ? m / 1000 : m, km && m % 1000 ? 1 : 0);
    pdf.setLineWidth(0.2);
    pdf.setDrawColor(...TEXTE);
    police(pdf, false, 6);
    for (let i = 0; i <= barre.segments; i++) {
      if (i < barre.segments) {
        pdf.setFillColor(...(i % 2 ? BLANC : TEXTE));
        pdf.rect(xb + i * segment, yb, segment, 1.6, 'FD');
      }
      const fin = i === barre.segments;
      if (i === 0 || fin || segment >= 7) {
        pdf.text(fin ? `${valeur(barre.metres)} ${km ? 'km' : 'm'}` : valeur((i * barre.metres) / barre.segments), xb + i * segment, yb + 4.3, { align: 'center' });
      }
    }
    police(pdf, true, 7);
    pdf.text(`Échelle 1 : ${texteNombre(echelleNumerique(mParMm), 0)}`, r2.x + 2, yb + 8.6);
    police(pdf, false, 6, DISCRET);
    pdf.text(`à la latitude ${texteNombre(centreImage(bornes).latitude, 2)}°`, r2.x + 2, yb + 11.6);
    nord(pdf, r2.x + r2.l - placeNord / 2 - 1, r2.y + 5.8, Math.min(12, hauteur - 8));
  } else {
    police(pdf, false, 7, DISCRET);
    pdf.text(pdf.splitTextToSize('Échelle non fournie : image non géoréférencée.', r2.l - 4), r2.x + 2, ye);
  }

  // Coordonnées
  let yc = boite(pdf, r3, 'Coordonnées GPS (WGS84)');
  const lignes: [string, string][] = [];
  const c = bornes ? centreImage(bornes) : centre;
  if (c) lignes.push(['Centre', coordonnee(c.latitude, c.longitude, 6)]);
  if (bornes) {
    lignes.push(['Nord-ouest', coordonnee(bornes.nord, bornes.ouest, 5)]);
    lignes.push(['Sud-est', coordonnee(bornes.sud, bornes.est, 5)]);
  }
  if (!lignes.length) {
    police(pdf, false, 7, DISCRET);
    pdf.text(pdf.splitTextToSize('Coordonnées non fournies : image non géoréférencée.', r3.l - 4), r3.x + 2, yc);
    return;
  }
  for (const [libelle, valeur] of lignes) {
    police(pdf, true, 7);
    pdf.text(libelle, r3.x + 2, yc);
    police(pdf, false, 7);
    pdf.text(valeur, r3.x + 17, yc);
    yc += G.interligne;
  }
  police(pdf, false, 6, DISCRET);
  pdf.text('latitude, longitude en degrés décimaux', r3.x + 2, yc);
}

export async function genererRapportJournalierPdf(
  ctx: Contexte, journee: JourneeBalayage, fuites: FuiteJour[], options: OptionsRapportJournalier = {},
): Promise<Blob> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const G = GABARIT_JOURNALIER;
  const c = contenuRapportJournalier(ctx, journee, fuites, options);
  const genereLe = options.genereLe ?? new Date();
  const composer = options.composerArabe ?? imagesTextes;

  // Textes arabes composés par le navigateur (voir arabe.ts)
  const arabesEntete = [c.entete.titulaireAr, c.entete.clientAr].filter(contientArabe);
  const arabesCellules = [
    ...c.identification.map(([, v]) => v),
    ...(c.detailSecteurs ?? []).flatMap((l) => [l.zone ?? '', l.secteur ?? '']),
    ...c.fuites.flatMap((f) => [f.secteur, f.adresse, f.nature, f.degradation]),
  ].filter(contientArabe);
  const arabesLibres = [c.commentaire, ...c.visas].filter(contientArabe);
  const vide = () => new Map<string, ImageTexte>();
  const imagesEntete = arabesEntete.length ? await composer(arabesEntete, 10, true) : vide();
  const imagesCellules = arabesCellules.length ? await composer(arabesCellules, G.taille) : vide();
  const imagesLibres = arabesLibres.length ? await composer(arabesLibres, 9, true) : vide();

  const pdf: Pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  pdf.setProperties({ title: `${c.titre} : ${c.jourCourt}`, subject: 'Rapport journalier de recherche de fuites', creator: 'Suivi des fuites' });
  const largeur = pdf.internal.pageSize.getWidth();
  const hauteur = pdf.internal.pageSize.getHeight();
  const { marge } = G;
  const utile = largeur - 2 * marge;
  const bas = hauteur - G.pied;
  const fin = () => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const arabe = crochetsArabe(pdf, imagesCellules);
  const style = {
    theme: 'grid' as const,
    margin: { left: marge, right: marge, top: marge + 4, bottom: G.pied + 2 },
    styles: {
      font: 'helvetica', fontSize: G.taille, cellPadding: 1.2, overflow: 'linebreak' as const,
      lineColor: GRIS_TRAIT, lineWidth: 0.1, textColor: TEXTE, valign: 'middle' as const,
    },
    headStyles: { fillColor: BLEU, textColor: 255, fontStyle: 'bold' as const, halign: 'center' as const, fontSize: 7.5 },
  };
  const titreSection = (titre: string, y: number, besoin = 22) => {
    if (y + besoin > bas) { pdf.addPage(); y = marge + 4; }
    police(pdf, true, 10.5, BLEU);
    pdf.text(titre, marge, y + 1);
    return y + 3.5;
  };

  let y = dessinerEntete(pdf, c.entete, imagesEntete, marge);

  // Identification (gabarit : société, journée, équipe, zone, secteur, linéaire)
  autoTable(pdf, {
    ...style,
    startY: y,
    body: paires(c.identification) as RowInput[],
    columnStyles: {
      0: { fontStyle: 'bold', fillColor: FOND_GROUPE, cellWidth: 34 },
      1: { cellWidth: utile / 2 - 34 },
      2: { fontStyle: 'bold', fillColor: FOND_GROUPE, cellWidth: 34 },
      3: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.column.index === 2 && !texteBrut(data.cell.raw)) data.cell.styles.fillColor = false as never;
      arabe.didParseCell(data);
    },
    didDrawCell: arabe.didDrawCell,
  });
  y = fin() + 5;

  // Détail par secteur (plusieurs secteurs dans la journée)
  if (c.detailSecteurs) {
    y = titreSection('Linéaire inspecté par zone et secteur', y);
    const t = c.totaux;
    const corpsSecteurs: RowInput[] = c.detailSecteurs.map((l) => [
      l.zone ?? SANS_ZONE, l.secteur ?? HORS_SECTEUR, String(l.nb_troncons), texteNombre(kmArrondis(l.lineaire_m), 3),
      texteNombre(kmArrondis(l.lineaire_repasse_m), 3), String(l.nb_noeuds), String(l.fuites),
    ]);
    if (c.fuitesHorsSecteurs) corpsSecteurs.push([{ content: 'Fuites hors des secteurs balayés ce jour', colSpan: 6 }, String(c.fuitesHorsSecteurs)]);
    corpsSecteurs.push([{ content: 'Total', colSpan: 2 }, String(t.nb_troncons), texteNombre(t.lineaire_km, 3), texteNombre(t.lineaire_repasse_km, 3),
      String(t.nb_noeuds), String(c.fuites.length)]);
    autoTable(pdf, {
      ...style,
      startY: y,
      head: [['Zone', 'Secteur', 'Tronçons', 'Linéaire (km)', 'Repasse (km)', 'Nœuds', 'Fuites']],
      body: corpsSecteurs,
      columnStyles: { 2: { halign: 'right', cellWidth: 18 }, 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 24 }, 5: { halign: 'right', cellWidth: 16 }, 6: { halign: 'right', cellWidth: 16 } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === corpsSecteurs.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = FOND_TOTAL;
        }
        arabe.didParseCell(data);
      },
      didDrawCell: arabe.didDrawCell,
    });
    y = fin() + 5;
  }

  // Tableau des fuites (gabarit 2026)
  y = titreSection(`Fuites détectées (${c.fuites.length})`, y, 30);
  const avecSecteur = c.avecSecteur;
  const iVisible = avecSecteur ? 5 : 4;
  const n = iVisible + 3;
  const corps: RowInput[] = c.fuites.map((f) => [
    f.numero, ...(avecSecteur ? [f.secteur] : []), f.adresse, f.calibre == null ? '' : texteNombre(f.calibre, 0), f.nature,
    f.visible ? '1' : '', f.invisible ? '1' : '', f.degradation,
  ]);
  if (!c.fuites.length) {
    corps.push([{ content: 'R.A.S : aucune fuite détectée ce jour', colSpan: n, styles: { halign: 'center', fontStyle: 'bold' } }]);
  }
  corps.push([{ content: 'TOTAL', colSpan: iVisible, styles: { halign: 'right' } }, String(c.visibles), String(c.invisibles), '']);
  autoTable(pdf, {
    ...style,
    startY: y,
    head: [
      [
        { content: 'N° Fuite', rowSpan: 2 },
        ...(avecSecteur ? [{ content: 'Secteur', rowSpan: 2 }] : []),
        { content: c.libelleAdresse, rowSpan: 2 },
        { content: 'Canalisation prospectée', colSpan: 2 },
        { content: 'Fuite', colSpan: 2 },
        { content: 'Nature dégradation', rowSpan: 2 },
      ],
      ['Calibre (mm)', 'Nature', 'Visibles', 'Invisibles'],
    ],
    body: corps,
    columnStyles: {
      0: { halign: 'center', cellWidth: 14 },
      ...(avecSecteur ? { 1: { cellWidth: 26 } } : {}),
      [iVisible - 2]: { halign: 'center', cellWidth: 16 },
      [iVisible - 1]: { cellWidth: 22 },
      [iVisible]: { halign: 'center', cellWidth: 15 },
      [iVisible + 1]: { halign: 'center', cellWidth: 15 },
      [iVisible + 2]: { cellWidth: 26 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.row.index === corps.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = FOND_TOTAL;
      }
      arabe.didParseCell(data);
    },
    didDrawCell: arabe.didDrawCell,
  });
  y = fin() + 4.5;
  police(pdf, true, 9);
  pdf.text(c.totalFuites, marge, y);
  y += 6;

  // Commentaire et visas, gardés ensemble
  const lignesCommentaire = c.commentaire && !imagesLibres.has(c.commentaire) ? (pdf.splitTextToSize(c.commentaire, utile - 4) as string[]) : [];
  const imgCommentaire = imagesLibres.get(c.commentaire);
  const hCommentaire = Math.max(G.hauteurCommentaire, lignesCommentaire.length * 3.8 + 4, (imgCommentaire?.hauteurMm ?? 0) + 4);
  if (y + 5 + hCommentaire + 5 + G.hauteurVisa > bas) { pdf.addPage(); y = marge + 4; }
  police(pdf, true, 9);
  pdf.text('COMMENTAIRE', marge, y + 1);
  y += 3;
  pdf.setDrawColor(...GRIS_TRAIT);
  pdf.setLineWidth(0.2);
  pdf.rect(marge, y, utile, hCommentaire);
  police(pdf, false, G.taille);
  if (lignesCommentaire.length) pdf.text(lignesCommentaire, marge + 2, y + 4);
  if (imgCommentaire) {
    const k = Math.min(1, (utile - 4) / imgCommentaire.largeurMm);
    pdf.addImage(imgCommentaire.donnees, 'PNG', marge + utile - 2 - imgCommentaire.largeurMm * k, y + 2, imgCommentaire.largeurMm * k, imgCommentaire.hauteurMm * k, imgCommentaire.alias, 'FAST');
  }
  y += hCommentaire + 5;
  if (c.visas.length) {
    const l = utile / c.visas.length;
    c.visas.forEach((v, i) => {
      const x = marge + i * l;
      pdf.setDrawColor(...GRIS_TRAIT);
      pdf.setLineWidth(0.2);
      pdf.rect(x + 1, y, l - 2, G.hauteurVisa);
      const img = imagesLibres.get(v);
      if (img) {
        const k = Math.min(1, (l - 6) / img.largeurMm);
        pdf.addImage(img.donnees, 'PNG', x + l / 2 - (img.largeurMm * k) / 2, y + 1.5, img.largeurMm * k, img.hauteurMm * k, img.alias, 'FAST');
      } else {
        police(pdf, true, 9);
        pdf.text(pdf.splitTextToSize(v, l - 6), x + l / 2, y + 5, { align: 'center' });
      }
      police(pdf, false, 6.5, DISCRET);
      pdf.text('Nom, date et signature', x + l / 2, y + G.hauteurVisa - 2, { align: 'center' });
    });
    y += G.hauteurVisa + 6;
  }

  // Extrait du plan (A4) : sous les visas si la place suffit, sinon page suivante avec l'en-tête du marché.
  const extrait = options.extrait;
  if (extrait && (extrait.image || extrait.capturer)) {
    const legende = extrait.legende ?? LEGENDE_PLAN_DEFAUT;
    const bande = Math.max(G.bandeCartouche, 5 + 3.6 + legende.length * G.interligne);
    const hTitre = 6;
    let dispo = bas - y - hTitre - G.ecartCartouche - bande;
    const pageSuivante = dispo < G.hauteurMinExtraitBasDePage;
    if (pageSuivante) {
      pdf.addPage();
      const entete = construireEntete(ctx, 'EXTRAIT DU PLAN DU RÉSEAU', [
        `Rapport journalier de recherche de fuites : journée du ${c.jour} · ${c.equipes} · Secteur(s) : ${c.secteurs.join(', ') || '—'}`,
      ]);
      y = dessinerEntete(pdf, entete, imagesEntete, marge);
      dispo = bas - y - hTitre - G.ecartCartouche - bande;
    }
    const placees = c.fuites.filter((f) => f.fuite.latitude != null && f.fuite.longitude != null);
    police(pdf, true, 10.5, BLEU);
    pdf.text(pageSuivante ? 'Conduites inspectées et fuites détectées' : 'Extrait du plan du réseau', marge, y + 1);
    police(pdf, false, 7.5, DISCRET);
    const resume = !c.fuites.length ? 'Aucune fuite détectée ce jour'
      : `${pluriel(placees.length, 'fuite')} géolocalisée${placees.length > 1 ? 's' : ''}${c.fuites.length > placees.length ? `, ${c.fuites.length - placees.length} sans position GPS` : ''}`;
    pdf.text(resume, marge + utile, y + 1, { align: 'right' });
    y += hTitre - 2;

    let cadre: Rect;
    let image: ImageExtrait;
    if (extrait.capturer) {
      cadre = { x: marge, y, l: utile, h: dispo };
      image = await extrait.capturer(cadre.l, cadre.h);
    } else {
      image = extrait.image!;
      const k = Math.min(utile / image.largeurPx, dispo / image.hauteurPx);
      cadre = { x: marge + (utile - image.largeurPx * k) / 2, y, l: image.largeurPx * k, h: image.hauteurPx * k };
    }
    const carte = 'donnees' in image ? image : null;
    const fournie = 'donnees' in image ? null : image;
    if (carte) {
      pdf.addImage(carte.donnees, carte.type, cadre.x, cadre.y, cadre.l, cadre.h, 'extrait-plan', carte.type === 'PNG' ? 'FAST' : 'NONE');
    } else if (fournie) {
      pdf.addImage(fournie.dataUrl, /^data:image\/png/i.test(fournie.dataUrl) ? 'PNG' : 'JPEG', cadre.x, cadre.y, cadre.l, cadre.h, 'extrait-plan', 'FAST');
    }
    pdf.setDrawColor(...TEXTE);
    pdf.setLineWidth(0.35);
    pdf.rect(cadre.x, cadre.y, cadre.l, cadre.h);
    const bornes: Bornes | null = carte ?? fournie?.bornes ?? null;

    // Fuites numérotées d'après leurs coordonnées (image géoréférencée)
    let horsCadre = 0;
    if (bornes && !extrait.fuitesDessinees) {
      for (const f of placees) {
        const p = projeter(bornes, cadre, f.fuite.latitude!, f.fuite.longitude!);
        if (!p) { horsCadre++; continue; }
        pdf.setLineWidth(0.3);
        pdf.setFillColor(...rgb(COULEURS_PLAN.fuite.fond));
        pdf.setDrawColor(...rgb(COULEURS_PLAN.fuite.contour));
        pdf.circle(p.x, p.y, 1.5, 'FD');
        police(pdf, true, 7);
        const l = pdf.getTextWidth(f.numero) + 1.2;
        pdf.setFillColor(...BLANC);
        pdf.rect(p.x + 1.9, p.y - 1.6, l, 3.2, 'F');
        pdf.text(f.numero, p.x + 2.5, p.y + 0.9);
      }
    }

    // Attribution du fond et mentions dans le cadre
    const attribution = extrait.attribution !== undefined
      ? extrait.attribution
      : carte ? `© contributeurs OpenStreetMap${carte.fondIndisponible ? '' : ' · © OpenMapTiles · OpenFreeMap'}` : null;
    if (attribution) {
      police(pdf, false, 6);
      const la = pdf.getTextWidth(attribution) + 2.4;
      pdf.setFillColor(...BLANC);
      pdf.rect(cadre.x + cadre.l - la - 0.2, cadre.y + cadre.h - 3.6, la, 3.4, 'F');
      pdf.text(attribution, cadre.x + cadre.l - 1.4, cadre.y + cadre.h - 1.2, { align: 'right' });
    }
    const alerte = carte?.fondIndisponible
      ? 'Fond de carte indisponible (réseau) : conduites et fuites sur fond uni.'
      : horsCadre ? `${pluriel(horsCadre, 'fuite')} hors du cadre de l'extrait.` : null;
    if (alerte) {
      police(pdf, true, 7.5, [122, 62, 0]);
      const la = pdf.getTextWidth(alerte) + 4;
      pdf.setFillColor(253, 232, 200);
      pdf.rect(cadre.x + 3, cadre.y + 3, la, 5.2, 'F');
      pdf.text(alerte, cadre.x + 5, cadre.y + 6.6);
    }

    cartouche(pdf, cadre.y + cadre.h + G.ecartCartouche, bande, legende, bornes, cadre.l, extrait.centre ?? null);
  }

  // Pied de chaque page
  const total = pdf.getNumberOfPages();
  const pied = `Rapport journalier de recherche de fuites · journée du ${c.jourCourt}${journee.equipes.length === 1 ? ` · ${c.equipes}` : ''} · édité le ${texteDate(genereLe, true)}`;
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    police(pdf, false, 7.5, DISCRET);
    pdf.text(pied, marge, hauteur - 6);
    pdf.text(`Page ${p} / ${total}`, largeur - marge, hauteur - 6, { align: 'right' });
  }
  return pdf.output('blob');
}

// ---------------------------------------------------------------------------
// Excel (même contenu, sans l'extrait de plan) : une feuille nommée par la date, A4 portrait,
// une page en largeur, titres du tableau des fuites répétés, pied « Page n / N ».
// ---------------------------------------------------------------------------
type CelluleXlsx = Record<string, unknown> | null;

const BORDURE = { borderStyle: 'thin', borderColor: '#AFBAC4' };
const PIXELS_PAR_CARACTERE = 7;   // Calibri 10, comme xlsx.ts

const echapperXml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Réglages d'impression que write-excel-file n'écrit pas (même procédé que xlsx.ts).
async function reglerImpression(fichier: Blob, nomFeuille: string, titres: [number, number]): Promise<Blob> {
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import('fflate');
  const contenu = unzipSync(new Uint8Array(await fichier.arrayBuffer()));
  const reglages = '<printOptions horizontalCentered="1"/>'
    + '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.6" header="0.2" footer="0.3"/>'
    + '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>'
    + '<headerFooter><oddFooter>&amp;C&amp;8Page &amp;P / &amp;N</oddFooter></headerFooter>';
  const chemin = 'xl/worksheets/sheet1.xml';
  let xml = strFromU8(contenu[chemin])
    .replace(/<printOptions[^>]*\/>/g, '')
    .replace(/<pageMargins[^>]*\/>/g, '')
    .replace(/<pageSetup[^>]*\/>/g, '');
  if (!xml.includes('<sheetPr')) xml = xml.replace(/(<worksheet[^>]*>)/, '$1<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
  xml = xml.replace(/(<drawing[ >]|<legacyDrawing|<tableParts|<extLst|<\/worksheet>)/, `${reglages}$1`);
  contenu[chemin] = strToU8(xml);
  const nom = echapperXml(nomFeuille.replace(/'/g, "''"));
  const defini = `<definedName name="_xlnm.Print_Titles" localSheetId="0">'${nom}'!$${titres[0]}:$${titres[1]}</definedName>`;
  let classeur = strFromU8(contenu['xl/workbook.xml']);
  classeur = classeur.includes('<definedNames>')
    ? classeur.replace('<definedNames>', `<definedNames>${defini}`)
    : classeur.replace('</sheets>', `</sheets><definedNames>${defini}</definedNames>`);
  contenu['xl/workbook.xml'] = strToU8(classeur);
  return new Blob([zipSync(contenu, { level: 6 })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Logos sur la première ligne : titulaire à gauche, maître d'ouvrage calé sur le bord droit.
function imagesLogos(entete: EnteteDoc, largeurs: number[]) {
  const pixels = largeurs.map((w) => Math.round(w * PIXELS_PAR_CARACTERE));
  const totale = pixels.reduce((a, b) => a + b, 0);
  const image = (logo: LogoEntete, x: number, titre: string) => {
    const { largeurMm, hauteurMm } = dimensionsLogo(logo);
    let colonne = 0;
    let debut = 0;
    while (colonne < pixels.length - 1 && debut + pixels[colonne] <= x) debut += pixels[colonne++];
    return {
      content: octetsDataUrl(logo.donnees).buffer as ArrayBuffer,
      contentType: logo.format === 'PNG' ? 'image/png' : 'image/jpeg',
      width: mmEnPixels(largeurMm), height: mmEnPixels(hauteurMm), dpi: 96,
      anchor: { row: 1, column: colonne + 1 }, offsetX: Math.max(0, Math.round(x - debut)), title: titre,
    };
  };
  const images = [];
  const gauche = entete.logoTitulaire;
  const droite = entete.logoMaitreOuvrage;
  const largeurGauche = gauche ? mmEnPixels(dimensionsLogo(gauche).largeurMm) : 0;
  if (gauche) images.push(image(gauche, 0, 'Logo du titulaire'));
  if (droite) {
    const x = totale - mmEnPixels(dimensionsLogo(droite).largeurMm) - 4;
    images.push(image(droite, Math.max(x, largeurGauche ? largeurGauche + 8 : 0), 'Logo du maître d\'ouvrage'));
  }
  return images;
}

export async function genererRapportJournalierXlsx(
  ctx: Contexte, journee: JourneeBalayage, fuites: FuiteJour[], options: Pick<OptionsRapportJournalier, 'visas' | 'titre'> = {},
): Promise<Blob> {
  const { default: ecrire } = await import('write-excel-file/browser');
  const c = contenuRapportJournalier(ctx, journee, fuites, options);
  // Colonnes : N° | (Secteur) | Adresse ou référence | Calibre | Nature | Visibles | Invisibles | Nature dégradation
  const largeurs = c.avecSecteur ? [8, 16, 28, 9, 14, 9, 9, 16] : [8, 36, 9, 14, 9, 9, 16];
  const n = largeurs.length;
  const iVisible = c.avecSecteur ? 5 : 4;
  const lignes: CelluleXlsx[][] = [];
  const pleine = (valeur: string, style: Record<string, unknown> = {}) => {
    const l: CelluleXlsx[] = [{ value: valeur, type: String, columnSpan: n, wrap: true, ...style }];
    for (let i = 1; i < n; i++) l.push(null);
    lignes.push(l);
  };
  const libelleValeur = (libelle: string, valeur: Record<string, unknown>) => {
    const l: CelluleXlsx[] = [
      { value: libelle, type: String, columnSpan: 2, fontWeight: 'bold', backgroundColor: '#E6EEF4', wrap: true, alignVertical: 'center', ...BORDURE },
      null,
      { columnSpan: n - 2, wrap: true, alignVertical: 'center', ...BORDURE, ...valeur },
    ];
    for (let i = 3; i < n; i++) l.push(null);
    lignes.push(l);
  };
  const vide = () => lignes.push([]);

  // En-tête du marché (comme xlsx.ts)
  const logos = [c.entete.logoTitulaire, c.entete.logoMaitreOuvrage].filter((l): l is LogoEntete => !!l);
  if (logos.length) {
    const hauteurPx = Math.max(...logos.map((l) => mmEnPixels(dimensionsLogo(l).hauteurMm)));
    pleine('', { height: Math.ceil(hauteurPx * 0.75) + 6 });
  }
  c.entete.titulaire.forEach((t, i) => pleine(t, i === 0 ? { fontWeight: 'bold', fontSize: 12 } : { textColor: '#5B6B77' }));
  if (c.entete.titulaireAr) pleine(c.entete.titulaireAr, { fontWeight: 'bold', align: 'left' });
  c.entete.client.forEach((t, i) => pleine(t, i === 0 ? { fontWeight: 'bold', fontSize: 12 } : { textColor: '#5B6B77' }));
  if (c.entete.clientAr) pleine(c.entete.clientAr, { fontWeight: 'bold', align: 'left' });
  vide();
  pleine(c.titre, { fontWeight: 'bold', fontSize: 14, align: 'center', height: 24 });
  c.entete.infos.forEach((t) => pleine(t));
  vide();

  // Identification
  for (const [libelle, valeur] of c.identification) {
    if (libelle === 'Linéaire inspecté') {
      libelleValeur('Linéaire inspecté (premiers passages)', { value: c.totaux.lineaire_km, type: Number, format: '#,##0.000" km"', align: 'left' });
    } else if (libelle === 'Linéaire repassé') {
      libelleValeur('Linéaire repassé (non rémunéré)', { value: c.totaux.lineaire_repasse_km, type: Number, format: '#,##0.000" km"', align: 'left' });
    } else if (libelle === 'Tronçons inspectés' || libelle === 'Nœuds') {
      libelleValeur(libelle, { value: Number(valeur), type: Number, format: '0', align: 'left' });
    } else {
      libelleValeur(libelle, { value: valeur, type: String });
    }
  }

  // Détail par secteur (8 colonnes : Zone sur N° et Secteur, puis une valeur par colonne)
  if (c.detailSecteurs) {
    vide();
    pleine('Linéaire inspecté par zone et secteur', { fontWeight: 'bold', fontSize: 11 });
    const titre = (v: string, span = 1): CelluleXlsx => ({
      value: v, type: String, columnSpan: span, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#0B5D8A', align: 'center', wrap: true, ...BORDURE,
    });
    lignes.push([titre('Zone', 2), null, titre('Secteur'), titre('Tronçons'), titre('Linéaire (km)'), titre('Repasse (km)'), titre('Nœuds'), titre('Fuites')]);
    const ligne = (zone: string, secteur: string, v: number[], gras: boolean) => {
      const s = { ...BORDURE, ...(gras ? { fontWeight: 'bold', backgroundColor: '#F2F2F2' } : {}) };
      const nb = (x: number, f = '0') => ({ value: x, type: Number, format: f, ...s });
      lignes.push([
        { value: zone, type: String, columnSpan: 2, wrap: true, ...s }, null, { value: secteur, type: String, wrap: true, ...s },
        nb(v[0]), nb(v[1], '#,##0.000'), nb(v[2], '#,##0.000'), nb(v[3]), nb(v[4]),
      ]);
    };
    c.detailSecteurs.forEach((l) => ligne(l.zone ?? SANS_ZONE, l.secteur ?? HORS_SECTEUR,
      [l.nb_troncons, kmArrondis(l.lineaire_m), kmArrondis(l.lineaire_repasse_m), l.nb_noeuds, l.fuites], false));
    if (c.fuitesHorsSecteurs) {
      const l: CelluleXlsx[] = [{ value: 'Fuites hors des secteurs balayés ce jour', type: String, columnSpan: n - 1, ...BORDURE }];
      for (let i = 1; i < n - 1; i++) l.push(null);
      l.push({ value: c.fuitesHorsSecteurs, type: Number, format: '0', ...BORDURE });
      lignes.push(l);
    }
    const t = c.totaux;
    ligne('Total', '', [t.nb_troncons, t.lineaire_km, t.lineaire_repasse_km, t.nb_noeuds, c.fuites.length], true);
  }

  // Tableau des fuites : deux lignes de titres (gabarit), répétées à l'impression
  vide();
  pleine(`Fuites détectées (${c.fuites.length})`, { fontWeight: 'bold', fontSize: 11 });
  const tete = (v: string, extra: Record<string, unknown> = {}): CelluleXlsx => ({
    value: v, type: String, fontWeight: 'bold', textColor: '#FFFFFF', backgroundColor: '#0B5D8A',
    align: 'center', alignVertical: 'center', wrap: true, ...BORDURE, ...extra,
  });
  const premiereTitres = lignes.length + 1;
  lignes.push([
    tete('N° Fuite', { rowSpan: 2 }), ...(c.avecSecteur ? [tete('Secteur', { rowSpan: 2 })] : []), tete(c.libelleAdresse, { rowSpan: 2 }),
    tete('Canalisation prospectée', { columnSpan: 2 }), null, tete('Fuite', { columnSpan: 2 }), null, tete('Nature dégradation', { rowSpan: 2 }),
  ]);
  lignes.push([
    null, ...(c.avecSecteur ? [null] : []), null, tete('Calibre (mm)'), tete('Nature'), tete('Visibles'), tete('Invisibles'), null,
  ]);
  const texte = (v: string, extra: Record<string, unknown> = {}): CelluleXlsx => (v ? { value: v, type: String, wrap: true, ...BORDURE, ...extra } : { ...BORDURE, ...extra });
  const entier = (v: number | null, extra: Record<string, unknown> = {}): CelluleXlsx => (v ? { value: v, type: Number, format: '0', align: 'center', ...BORDURE, ...extra } : { ...BORDURE, ...extra });
  for (const f of c.fuites) {
    lignes.push([
      f.fuite.numero == null ? texte('—', { align: 'center' }) : entier(f.fuite.numero),
      ...(c.avecSecteur ? [texte(f.secteur)] : []),
      texte(f.adresse), entier(f.calibre), texte(f.nature), entier(f.visible), entier(f.invisible), texte(f.degradation),
    ]);
  }
  if (!c.fuites.length) {
    const l: CelluleXlsx[] = [{ value: 'R.A.S : aucune fuite détectée ce jour', type: String, columnSpan: n, align: 'center', fontWeight: 'bold', ...BORDURE }];
    for (let i = 1; i < n; i++) l.push(null);
    lignes.push(l);
  }
  const gras = { fontWeight: 'bold', backgroundColor: '#F2F2F2', ...BORDURE };
  const ligneTotal: CelluleXlsx[] = [{ value: 'TOTAL', type: String, columnSpan: iVisible, align: 'right', ...gras }];
  for (let i = 1; i < iVisible; i++) ligneTotal.push(null);
  ligneTotal.push({ value: c.visibles, type: Number, format: '0', align: 'center', ...gras }, { value: c.invisibles, type: Number, format: '0', align: 'center', ...gras }, { ...gras });
  lignes.push(ligneTotal);
  pleine(c.totalFuites, { fontWeight: 'bold' });

  // Commentaire et visas
  vide();
  pleine('COMMENTAIRE', { fontWeight: 'bold' });
  pleine(c.commentaire, { height: 60, alignVertical: 'top', ...BORDURE });
  if (c.visas.length) {
    vide();
    const pas = Math.floor(n / c.visas.length);
    const titres: CelluleXlsx[] = Array.from({ length: n }, () => null);
    const cadres: CelluleXlsx[] = Array.from({ length: n }, () => null);
    c.visas.forEach((v, i) => {
      const debut = i * pas;
      const span = i === c.visas.length - 1 ? n - debut : pas;
      titres[debut] = { value: v, type: String, columnSpan: span, fontWeight: 'bold', align: 'center', ...BORDURE };
      cadres[debut] = { value: 'Nom, date et signature', type: String, columnSpan: span, height: 60, align: 'center', alignVertical: 'bottom', textColor: '#5B6B77', fontSize: 8, ...BORDURE };
    });
    lignes.push(titres, cadres);
  }

  const nomFeuille = c.jourCourt.replace(/\//g, '-');
  const images = logos.length ? imagesLogos(c.entete, largeurs) : null;
  const brut = await (ecrire as unknown as (f: unknown[], o: unknown) => { toBlob: () => Promise<Blob> })(
    [{ data: lignes, sheet: nomFeuille, columns: largeurs.map((width) => ({ width })), ...(images ? { images } : {}) }],
    { fontFamily: 'Calibri', fontSize: 10 },
  ).toBlob();
  return reglerImpression(brut, nomFeuille, [premiereTitres, premiereTitres + 1]);
}

// Jeux de données exportables : colonnes (groupées par thème), chargement filtré,
// regroupements, puis construction du document neutre (modele.ts).
import { titreLot, type LigneLot, type Lot, type Recap, type ReglesAttachement } from '@/lib/attachements';
import { EMPLACEMENTS, MATERIAUX, OUVRAGES, STATUTS, libellesMarche } from '@/lib/format';
import { LIBELLES_FAMILLES } from '@/lib/nomenclature/csv';
import { getSupabase, lireTout, NOM_ORGANISATION } from '@/lib/supabase';
import type { Marche } from '@/lib/types';
import { chargerMatricules } from './matricules';
import { construireSection, type Colonne, type DocumentExport, type EnteteDoc, type Ligne, type LogoEntete, type SectionDoc } from './modele';

export type JeuId = 'fuites' | 'quantites' | 'pieces' | 'attachement' | 'evenements';
export type Periode = 'tout' | 'jour' | 'hier' | 'semaine' | 'semaine_derniere' | 'mois' | 'mois_dernier' | 'libre';

export interface Filtres {
  periode: Periode;
  du?: string;
  au?: string;
  zone?: string;
  secteur?: string;
  /** Chef d'équipe (compte) ; l'équipe, c'est le compte du chef d'équipe (S12). */
  chef?: string;
  synthese?: boolean;
}

export interface Contexte {
  marche: Record<string, unknown>;
  osCommencement: { numero: string; date_os: string } | null;
  os: { id: string; numero: string; date_os: string }[];
  regles: ReglesAttachement | null;
  peutMontants: boolean;
  logos?: { titulaire: LogoEntete | null; maitreOuvrage: LogoEntete | null };   // chargés par chargerLogosEntete
}

export interface Jeu {
  id: JeuId;
  libelle: string;
  colonnes: (ctx: Contexte) => Colonne[];
  colonnesDefaut: string[];
  regroupements: [string, string][];
  filtres: ('periode' | 'zone' | 'secteur' | 'chef' | 'synthese')[];
  libellePeriode?: string;
  charger: (marcheId: string, f: Filtres) => Promise<Ligne[]>;
}

export const PERIODES: Record<Periode, string> = {
  tout: 'Toutes dates',
  jour: "Aujourd'hui",
  hier: 'Hier',
  semaine: 'Cette semaine',
  semaine_derniere: 'Semaine dernière',
  mois: 'Ce mois',
  mois_dernier: 'Mois dernier',
  libre: 'Du… au…',
};

export const REGROUPEMENTS: Record<string, string> = {
  aucun: 'Aucun',
  zone: 'Par zone',
  secteur: 'Par secteur',
  chef: "Par chef d'équipe",
  article: 'Par article',
  jour: 'Par jour',
  categorie: 'Par catégorie',
  piece: 'Par pièce',
};

// ---------------------------------------------------------------------------
// Période : bornes en dates de Casablanca (AAAA-MM-JJ)
// ---------------------------------------------------------------------------
const iso = (d: Date) => d.toLocaleDateString('fr-CA', { timeZone: 'Africa/Casablanca' });
const ajouterJours = (t: string, n: number) => {
  const d = new Date(`${t}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function bornes(f: Filtres): [string | null, string | null] {
  const aujourdHui = iso(new Date());
  const jourSemaine = (new Date(`${aujourdHui}T12:00:00Z`).getUTCDay() + 6) % 7; // lundi = 0
  const [a, m] = aujourdHui.split('-').map(Number);
  const debutMois = `${a}-${String(m).padStart(2, '0')}-01`;
  const finMois = ajouterJours(m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`, -1);
  switch (f.periode) {
    case 'jour': return [aujourdHui, aujourdHui];
    case 'hier': return [ajouterJours(aujourdHui, -1), ajouterJours(aujourdHui, -1)];
    case 'semaine': return [ajouterJours(aujourdHui, -jourSemaine), ajouterJours(aujourdHui, 6 - jourSemaine)];
    case 'semaine_derniere': return [ajouterJours(aujourdHui, -jourSemaine - 7), ajouterJours(aujourdHui, -jourSemaine - 1)];
    case 'mois': return [debutMois, finMois];
    case 'mois_dernier': {
      const fin = ajouterJours(debutMois, -1);
      return [`${fin.slice(0, 7)}-01`, fin];
    }
    case 'libre': return [f.du || null, f.au || null];
    default: return [null, null];
  }
}

const dateFr = (t: string) => new Date(`${t}T12:00:00`).toLocaleDateString('fr-FR');
export function libellePeriode(f: Filtres): string {
  const [du, au] = bornes(f);
  if (!du && !au) return '';
  if (du && du === au) return `Journée du ${dateFr(du)}`;
  if (du && au) return `Période du ${dateFr(du)} au ${dateFr(au)}`;
  return du ? `À partir du ${dateFr(du)}` : `Jusqu'au ${dateFr(au!)}`;
}

function filtrer<Q>(q: Q, f: Filtres, champDate: string, champs: { zone?: string; secteur?: string; chef?: string } = {}): Q {
  const [du, au] = bornes(f);
  let r = q as unknown as { gte: (c: string, v: string) => unknown; lte: (c: string, v: string) => unknown; eq: (c: string, v: string) => unknown };
  if (du) r = r.gte(champDate, du) as typeof r;
  if (au) r = r.lte(champDate, au) as typeof r;
  if (f.zone && champs.zone) r = r.eq(champs.zone, f.zone) as typeof r;
  if (f.secteur && champs.secteur) r = r.eq(champs.secteur, f.secteur) as typeof r;
  if (f.chef && champs.chef) r = r.eq(champs.chef, f.chef) as typeof r;
  return r as unknown as Q;
}

async function lire(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Ligne[]> {
  const { data, error } = await q;
  if (error) throw error;
  return (data as Ligne[] | null) ?? [];
}

type Paginable = { range: (de: number, a: number) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
// Un export tronqué serait faux sans que rien ne le signale : au plafond, on refuse.
const toutLire = async (fabrique: () => Paginable) => {
  const lignes = await lireTout<Ligne>((de, a) => fabrique().range(de, a) as PromiseLike<{ data: Ligne[] | null; error: { message: string } | null }>);
  if (lignes.tronque) throw new Error(`Export limité à ${lignes.length.toLocaleString('fr-FR')} lignes : réduisez la période ou ajoutez un filtre.`);
  return lignes;
};

// ---------------------------------------------------------------------------
// Libellés communs
// ---------------------------------------------------------------------------
const RESULTATS: Record<string, string> = { reparee: 'Réparée', en_cours: 'En cours', non_reparee: 'Non réparée', faite: 'Faite', non_faite: 'Non faite' };
const ALERTES: [string, string][] = [
  ['alerte_non_reparee', 'Non réparée hors délai'],
  ['alerte_communication_srm', 'Non communiquée'],
  ['refection_chaussee_hors_delai', 'Réfection chaussée hors délai'],
  ['alerte_refection_chaussee', 'Réfection chaussée à faire'],
  ['alerte_refection_trottoir', 'Réfection trottoir à faire'],
  ['alerte_sans_photo', 'Sans photo'],
];
const de = (table: Record<string, string>, cle: string) => (l: Ligne) => {
  const v = l[cle];
  return v == null ? null : table[String(v)] ?? String(v);
};
const jourDe = (v: unknown) => (v ? String(v).slice(0, 10) : '');
const LIBELLE_NATURE: Record<string, string> = {
  solde: 'Travaux', anticipation: 'Attaché par anticipation', libre: 'Ligne libre', forcage: 'Refacturation forcée',
};

// ---------------------------------------------------------------------------
// Jeux de données
// ---------------------------------------------------------------------------
export const JEU_FUITES: Jeu = {
  id: 'fuites',
  libelle: 'Fuites',
  colonnesDefaut: ['numero', 'reference_srm', 'adresse', 'secteur', 'statut', 'date_detection', 'detectee_par', 'reparation_le', 'refection_le'],
  regroupements: [['aucun', 'Aucun'], ['zone', 'Par zone'], ['secteur', 'Par secteur'], ['jour', 'Par jour'], ['chef', "Par chef d'équipe"]],
  filtres: ['periode', 'zone', 'secteur'],
  libellePeriode: 'date de détection',
  colonnes: (ctx) => {
    const lm = libellesMarche(ctx.marche as unknown as Marche);
    const c: Colonne[] = [
      { cle: 'numero', titre: 'N°', groupe: 'Identification', type: 'nombre', largeur: 6 },
      { cle: 'reference_srm', titre: lm.reference, groupe: 'Identification', largeur: 13 },
      { cle: 'origine', titre: 'Origine', groupe: 'Identification', largeur: 12, valeur: (l) => (l.origine === 'srm' ? `Signalée par ${lm.sigle}` : 'Entreprise') },
      { cle: 'statut', titre: 'Statut', groupe: 'Identification', largeur: 16, valeur: (l) => STATUTS[l.statut as keyof typeof STATUTS]?.libelle ?? l.statut },
      { cle: 'verrouillee_le', titre: 'Verrouillée le', groupe: 'Identification', type: 'dateheure', largeur: 14 },
      { cle: 'zone', titre: 'Zone', groupe: 'Localisation', largeur: 18 },
      { cle: 'secteur', titre: 'Secteur', groupe: 'Localisation', largeur: 18 },
      { cle: 'adresse', titre: 'Adresse', groupe: 'Localisation', largeur: 22 },
      { cle: 'latitude', titre: 'Latitude', groupe: 'Localisation', type: 'nombre', decimales: 6, largeur: 10 },
      { cle: 'longitude', titre: 'Longitude', groupe: 'Localisation', type: 'nombre', decimales: 6, largeur: 10 },
      { cle: 'date_detection', titre: 'Détectée le', groupe: 'Détection', type: 'dateheure', largeur: 14 },
      { cle: 'detectee_par', titre: 'Détectée par (matricule)', groupe: 'Détection', largeur: 16 },
      { cle: 'ouvrage', titre: 'Ouvrage', groupe: 'Détection', largeur: 13, valeur: de(OUVRAGES, 'ouvrage') },
      { cle: 'visibilite', titre: 'Visibilité', groupe: 'Détection', largeur: 10, valeur: de({ visible: 'Visible', invisible: 'Invisible' }, 'visibilite') },
      { cle: 'source_saisie', titre: 'Saisie', groupe: 'Détection', largeur: 9 },
      { cle: 'nb_photos', titre: 'Photos', groupe: 'Détection', type: 'nombre', total: true, largeur: 7 },
      { cle: 'reparation_le', titre: 'Réparée le', groupe: 'Réparation', type: 'dateheure', largeur: 14 },
      { cle: 'resultat_reparation', titre: 'Résultat', groupe: 'Réparation', largeur: 11, valeur: de(RESULTATS, 'resultat_reparation') },
      { cle: 'ouvrage_constate', titre: 'Ouvrage constaté', groupe: 'Réparation', largeur: 13, valeur: de(OUVRAGES, 'ouvrage_constate') },
      { cle: 'materiau', titre: 'Matériau', groupe: 'Réparation', largeur: 14, valeur: de(MATERIAUX, 'materiau') },
      { cle: 'diametre_mm', titre: 'DN (mm)', groupe: 'Réparation', type: 'nombre', largeur: 7 },
      { cle: 'fouille_longueur_m', titre: 'L (m)', groupe: 'Réparation', type: 'nombre', decimales: 2, largeur: 7 },
      { cle: 'fouille_largeur_m', titre: 'l (m)', groupe: 'Réparation', type: 'nombre', decimales: 2, largeur: 7 },
      { cle: 'fouille_profondeur_m', titre: 'P (m)', groupe: 'Réparation', type: 'nombre', decimales: 2, largeur: 7 },
      { cle: 'volume_m3', titre: 'Volume (m3)', groupe: 'Réparation', type: 'nombre', decimales: 3, total: true, largeur: 9 },
      { cle: 'longueur_pe_m', titre: 'PE (m)', groupe: 'Réparation', type: 'nombre', decimales: 2, largeur: 7 },
      { cle: 'emplacement_fouille', titre: 'Emplacement', groupe: 'Réparation', largeur: 12, valeur: de(EMPLACEMENTS, 'emplacement_fouille') },
      { cle: 'revetement', titre: 'Revêtement', groupe: 'Réparation', largeur: 14 },
      { cle: 'revetement_ar', titre: 'Revêtement (arabe)', groupe: 'Réparation', largeur: 14 },
      { cle: 'chef_reparation', titre: "Chef d'équipe (matricule)", groupe: 'Réparation', largeur: 15 },
      { cle: 'pieces_posees', titre: 'Pièces posées', groupe: 'Réparation', largeur: 30 },
      { cle: 'motif_sans_reparation', titre: 'Motif sans réparation', groupe: 'Réparation', largeur: 18 },
      { cle: 'motif_sans_reparation_ar', titre: 'Motif (arabe)', groupe: 'Réparation', largeur: 16 },
      { cle: 'refection_le', titre: 'Réfection le', groupe: 'Réfection', type: 'dateheure', largeur: 14 },
      { cle: 'resultat_refection', titre: 'Réfection', groupe: 'Réfection', largeur: 10, valeur: de(RESULTATS, 'resultat_refection') },
      { cle: 'nature_refection', titre: 'Nature de réfection', groupe: 'Réfection', largeur: 16 },
      { cle: 'nature_refection_ar', titre: 'Nature (arabe)', groupe: 'Réfection', largeur: 14 },
      { cle: 'surface_refection_m2', titre: 'Surface (m2)', groupe: 'Réfection', type: 'nombre', decimales: 3, total: true, largeur: 9 },
    ];
    if (ctx.peutMontants) c.push({ cle: 'quantites', titre: 'Quantités par article', groupe: 'Quantités', largeur: 28 });
    if (lm.jalons) {
      c.push(
        { cle: 'date_communication_srm', titre: `Communiquée à ${lm.sigle} le`, groupe: `Suivi ${lm.sigle}`, type: 'dateheure', largeur: 14 },
        { cle: 'avis_terrassement_srm_le', titre: 'Avis avant terrassement', groupe: `Suivi ${lm.sigle}`, type: 'dateheure', largeur: 14 },
        { cle: 'validation_srm_le', titre: `Validée par ${lm.sigle} le`, groupe: `Suivi ${lm.sigle}`, type: 'dateheure', largeur: 14 },
        { cle: 'validation_srm_par', titre: 'Validée par', groupe: `Suivi ${lm.sigle}`, largeur: 14 },
        { cle: 'representant_client', titre: `Représentant ${lm.sigle} (réparation)`, groupe: `Suivi ${lm.sigle}`, largeur: 15 },
      );
    }
    c.push(
      { cle: 'alertes', titre: 'Alertes', groupe: 'Suivi', largeur: 20, valeur: (l) => ALERTES.filter(([k]) => l[k] === true).map(([, t]) => t).join(', ') },
      { cle: 'observation', titre: 'Observation', groupe: 'Suivi', largeur: 24 },
    );
    return c;
  },
  charger: async (marcheId, f) => {
    const [lignes, m] = await Promise.all([
      toutLire(() => filtrer(getSupabase().from('v_fuites_export').select('*').eq('marche_id', marcheId), f, 'jour_detection',
        { zone: 'zone_id', secteur: 'secteur_id' }).order('numero')),
      chargerMatricules(marcheId),
    ]);
    // R4 : matricules à la place des noms
    return lignes.map((l) => ({ ...l, detectee_par: m.agent(l.auteur_terrain_id, l.detectee_par), chef_reparation: l.chef_reparation_id ? m.agent(l.chef_reparation_id, l.chef_reparation) : m.agentParNom(l.chef_reparation) }));
  },
};

export const JEU_QUANTITES: Jeu = {
  id: 'quantites',
  libelle: 'Quantités (articles du bordereau)',
  colonnesDefaut: ['date_execution', 'fuite_numero', 'reference_srm', 'secteur', 'prix_numero', 'unite', 'quantite'],
  regroupements: [['aucun', 'Aucun'], ['article', 'Par article'], ['secteur', 'Par secteur'], ['zone', 'Par zone'], ['jour', 'Par jour']],
  filtres: ['periode', 'zone', 'secteur', 'chef'],
  libellePeriode: "date d'exécution",
  colonnes: (ctx) => {
    const lm = libellesMarche(ctx.marche as unknown as Marche);
    return [
      { cle: 'date_execution', titre: 'Exécutée le', groupe: 'Identification', type: 'date', largeur: 11 },
      { cle: 'fuite_numero', titre: 'N° fuite', groupe: 'Identification', type: 'nombre', largeur: 7 },
      { cle: 'reference_srm', titre: lm.reference, groupe: 'Identification', largeur: 13 },
      { cle: 'zone', titre: 'Zone', groupe: 'Localisation', largeur: 16 },
      { cle: 'secteur', titre: 'Secteur', groupe: 'Localisation', largeur: 16 },
      { cle: 'prix_numero', titre: 'N° prix', groupe: 'Article', largeur: 7 },
      { cle: 'prix_designation', titre: 'Désignation', groupe: 'Article', largeur: 40 },
      { cle: 'unite', titre: 'Unité', groupe: 'Article', largeur: 6 },
      { cle: 'quantite', titre: 'Quantité', groupe: 'Quantités et montants', type: 'quantite', uniteCle: 'unite', total: true, largeur: 9 },
      { cle: 'pu_ht', titre: 'PU HT', groupe: 'Quantités et montants', type: 'montant', largeur: 9 },
      { cle: 'montant_ht_bordereau', titre: 'Montant HT', groupe: 'Quantités et montants', type: 'montant', total: true, largeur: 11 },
      { cle: 'origine_ligne', titre: 'Ligne', groupe: 'Suivi', largeur: 7, valeur: de({ auto: 'Auto', manuel: 'Corrigée' }, 'origine_ligne') },
      { cle: 'commentaire', titre: 'Commentaire', groupe: 'Suivi', largeur: 20 },
    ];
  },
  charger: (marcheId, f) =>
    toutLire(() => filtrer(getSupabase().from('v_quantites').select('*').eq('marche_id', marcheId), f, 'date_execution',
      { zone: 'zone_id', secteur: 'secteur_id', chef: 'chef_equipe_id' }).order('date_execution').order('fuite_numero').order('prix_ordre').order('id')),
};

export const JEU_PIECES: Jeu = {
  id: 'pieces',
  libelle: 'Pièces posées',
  colonnesDefaut: ['jour', 'fuite_numero', 'secteur', 'chef', 'designation', 'unite', 'quantite'],
  regroupements: [['aucun', 'Aucun'], ['secteur', 'Par secteur'], ['zone', 'Par zone'], ['chef', "Par chef d'équipe"], ['piece', 'Par pièce'], ['jour', 'Par jour']],
  filtres: ['periode', 'zone', 'secteur', 'chef', 'synthese'],
  libellePeriode: 'date de pose',
  colonnes: (ctx) => {
    const lm = libellesMarche(ctx.marche as unknown as Marche);
    return [
      { cle: 'jour', titre: 'Posée le', groupe: 'Identification', type: 'date', largeur: 11 },
      { cle: 'fuite_numero', titre: 'N° fuite', groupe: 'Identification', type: 'nombre', largeur: 7 },
      { cle: 'reference_srm', titre: lm.reference, groupe: 'Identification', largeur: 13 },
      { cle: 'zone', titre: 'Zone', groupe: 'Localisation', largeur: 16 },
      { cle: 'secteur', titre: 'Secteur', groupe: 'Localisation', largeur: 16 },
      { cle: 'chef', titre: "Chef d'équipe (matricule)", groupe: 'Réparation', largeur: 15 },
      { cle: 'designation', titre: 'Pièce', groupe: 'Pièce', largeur: 28 },
      { cle: 'famille', titre: 'Famille', groupe: 'Pièce', largeur: 18 },
      { cle: 'unite', titre: 'Unité', groupe: 'Pièce', largeur: 6 },
      { cle: 'quantite', titre: 'Quantité', groupe: 'Pièce', type: 'quantite', uniteCle: 'unite', total: true, largeur: 9 },
      { cle: 'nb_fuites', titre: 'Fuites', groupe: 'Synthèse', type: 'nombre', total: true, largeur: 7 },
    ];
  },
  charger: async (marcheId, f) => {
    const [lignes, m] = await Promise.all([
      toutLire(() => filtrer(getSupabase().from('v_pieces_posees').select('*').eq('marche_id', marcheId), f, 'jour',
        { zone: 'zone_id', secteur: 'secteur_id', chef: 'chef_id' }).order('jour').order('fuite_numero').order('id')),
      chargerMatricules(marcheId),
    ]);
    // Famille Dolibarr (préfixe de la référence) : son libellé, jamais le code ; chef d'équipe : son matricule (R4)
    return lignes.map((l) => ({ ...l, famille: LIBELLES_FAMILLES[String(l.famille)] ?? l.famille, chef: m.agent(l.chef_id, l.chef) }));
  },
};

export const JEU_EVENEMENTS: Jeu = {
  id: 'evenements',
  libelle: 'Journal des événements',
  colonnesDefaut: ['date_evenement', 'heure', 'categorie', 'titre', 'participants', 'lieu', 'pieces'],
  regroupements: [['aucun', 'Aucun'], ['categorie', 'Par catégorie'], ['jour', 'Par jour'], ['secteur', 'Par secteur']],
  filtres: ['periode', 'secteur'],
  libellePeriode: "date de l'événement",
  colonnes: () => [
    { cle: 'date_evenement', titre: 'Date', groupe: 'Événement', type: 'date', largeur: 11 },
    { cle: 'heure', titre: 'Heure', groupe: 'Événement', largeur: 6, valeur: (l) => (l.heure ? String(l.heure).slice(0, 5) : null) },
    { cle: 'categorie', titre: 'Catégorie', groupe: 'Événement', largeur: 18 },
    { cle: 'titre', titre: 'Titre', groupe: 'Événement', largeur: 26 },
    { cle: 'description', titre: 'Description', groupe: 'Détails', largeur: 40 },
    { cle: 'participants', titre: 'Participants', groupe: 'Détails', largeur: 26 },
    { cle: 'lieu', titre: 'Lieu', groupe: 'Détails', largeur: 18 },
    { cle: 'secteur', titre: 'Secteur', groupe: 'Détails', largeur: 16 },
    { cle: 'pieces', titre: 'Pièces jointes', groupe: 'Détails', largeur: 24 },
  ],
  charger: async (marcheId, f) => {
    const sb = getSupabase();
    const [ev, cat, sect, pj] = await Promise.all([
      toutLire(() => filtrer(sb.from('evenements').select('*').eq('marche_id', marcheId).is('supprime_le', null), f, 'date_evenement', { secteur: 'secteur_id' })
        .order('date_evenement').order('heure').order('id')),
      lire(sb.from('categories_evenement').select('id, libelle').eq('marche_id', marcheId)),
      lire(sb.from('secteurs').select('id, libelle').eq('marche_id', marcheId)),
      toutLire(() => sb.from('evenement_pieces').select('id, evenement_id, nom_fichier').eq('marche_id', marcheId).is('supprime_le', null).order('id')),
    ]);
    const nom = (liste: Ligne[], id: unknown) => liste.find((x) => x.id === id)?.libelle ?? null;
    return ev.map((e) => ({
      ...e,
      categorie: nom(cat, e.categorie_id),
      secteur: nom(sect, e.secteur_id),
      pieces: pj.filter((p) => p.evenement_id === e.id).map((p) => p.nom_fichier).join(', '),
    }));
  },
};

// Colonnes du détail d'un lot d'attachement
// Texte long ramené à n caractères (désignations du CPS dans le détail ; texte intégral au récapitulatif).
const abreger = (t: unknown, n: number) => {
  const texte = t == null ? '' : String(t).replace(/\s+/g, ' ').trim();
  return texte.length > n ? `${texte.slice(0, n - 1).trimEnd()}…` : texte;
};

export function colonnesAttachement(ctx: Contexte): Colonne[] {
  const lm = libellesMarche(ctx.marche as unknown as Marche);
  const c: Colonne[] = [
    { cle: 'fuite_numero', titre: 'N° fuite', groupe: 'Fuite', type: 'nombre', largeur: 7 },
    { cle: 'reference_srm', titre: lm.reference, groupe: 'Fuite', largeur: 13 },
    { cle: 'adresse', titre: 'Adresse', groupe: 'Fuite', largeur: 20 },
    { cle: 'zone', titre: 'Zone', groupe: 'Fuite', largeur: 16 },
    { cle: 'secteur', titre: 'Secteur', groupe: 'Fuite', largeur: 16 },
    { cle: 'chef_equipe', titre: "Chef d'équipe (matricule)", groupe: 'Fuite', largeur: 15 },
    { cle: 'reparee_le', titre: 'Réparée le', groupe: 'Travaux', type: 'date', largeur: 10 },
    { cle: 'fouille_longueur_m', titre: 'L (m)', groupe: 'Travaux', type: 'nombre', decimales: 2, largeur: 6 },
    { cle: 'fouille_largeur_m', titre: 'l (m)', groupe: 'Travaux', type: 'nombre', decimales: 2, largeur: 6 },
    { cle: 'fouille_profondeur_m', titre: 'P (m)', groupe: 'Travaux', type: 'nombre', decimales: 2, largeur: 6 },
    { cle: 'volume_m3', titre: 'Volume (m3)', groupe: 'Travaux', type: 'nombre', decimales: 3, largeur: 8 },
    { cle: 'refectionnee_le', titre: 'Réfection le', groupe: 'Travaux', type: 'date', largeur: 10 },
    { cle: 'surface_refection_m2', titre: 'Surface (m2)', groupe: 'Travaux', type: 'nombre', decimales: 3, largeur: 8 },
    { cle: 'prix_numero', titre: 'N° prix', groupe: 'Article', largeur: 6 },
    {
      cle: 'prix_designation', titre: 'Désignation (abrégée)', groupe: 'Article', largeur: 30,
      valeur: (l) => abreger(l.prix_designation, 50),
    },
    { cle: 'quantite', titre: 'Quantité', groupe: 'Article', type: 'quantite', uniteCle: 'unite', total: true, largeur: 9 },
    { cle: 'unite', titre: 'Unité', groupe: 'Article', largeur: 6 },
    {
      cle: 'nature', titre: 'Nature', groupe: 'Article', largeur: 16,
      valeur: (l) => (l.regularisation ? `Régularisation du lot ${l.lot_precedent}` : LIBELLE_NATURE[String(l.nature)] ?? l.nature),
    },
    { cle: 'designation', titre: 'Désignation / accord / motif', groupe: 'Article', largeur: 24, valeur: (l) => l.designation ?? l.motif },
  ];
  if (ctx.peutMontants) {
    c.push(
      { cle: 'pu_ht', titre: 'PU HT', groupe: 'Montants', type: 'montant', largeur: 9 },
      { cle: 'montant', titre: 'Montant HT', groupe: 'Montants', type: 'montant', total: true, largeur: 11, valeur: (l) => (l.pu_ht == null ? null : Number(l.quantite) * Number(l.pu_ht)) },
    );
  }
  return c;
}

// ---------------------------------------------------------------------------
// En-tête tiré de la fiche du marché
// ---------------------------------------------------------------------------
export function construireEntete(ctx: Contexte, titre: string, infos: string[], os?: { numero: string; date_os: string } | null): EnteteDoc {
  const m = ctx.marche;
  const t = (k: string) => (m[k] == null ? '' : String(m[k]).trim());
  const identifiants = [
    t('titulaire_ice') && `ICE ${t('titulaire_ice')}`, t('titulaire_if') && `IF ${t('titulaire_if')}`,
    t('titulaire_rc') && `RC ${t('titulaire_rc')}`, t('titulaire_patente') && `TP ${t('titulaire_patente')}`,
    t('titulaire_cnss') && `CNSS ${t('titulaire_cnss')}`,
  ].filter(Boolean).join(' · ');
  const forme = [t('titulaire_forme_juridique'), t('titulaire_capital') && `au capital de ${t('titulaire_capital')}`].filter(Boolean).join(' ');
  const ordre = os ?? ctx.osCommencement;
  return {
    titulaire: [t('titulaire_nom') || NOM_ORGANISATION, forme, t('titulaire_adresse'), identifiants].filter(Boolean),
    titulaireAr: t('titulaire_nom_ar') || null,
    client: [t('client'), t('client_direction'), t('client_service')].filter(Boolean),
    clientAr: t('client_nom_ar') || null,
    logoTitulaire: ctx.logos?.titulaire ?? null,
    logoMaitreOuvrage: ctx.logos?.maitreOuvrage ?? null,
    titre,
    infos: [
      `Marché n° ${t('numero')}${t('numero_appel_offres') ? ` (appel d'offres n° ${t('numero_appel_offres')})` : ''}`,
      t('intitule') && `Objet : ${t('intitule')}`,
      ordre && `Ordre de service n° ${ordre.numero} du ${dateFr(ordre.date_os)}`,
      ...infos,
    ].filter(Boolean) as string[],
  };
}

// ---------------------------------------------------------------------------
// Construction du document
// ---------------------------------------------------------------------------
function cleGroupe(regroupement: string): ((l: Ligne) => string) | undefined {
  switch (regroupement) {
    case 'zone': return (l) => String(l.zone ?? 'Sans zone');
    case 'secteur': return (l) => String(l.secteur ?? 'Sans secteur');
    case 'chef': return (l) => String(l.chef_reparation ?? l.chef ?? l.chef_equipe ?? "Sans chef d'équipe");
    case 'article': return (l) => `Prix ${l.prix_numero} · ${String(l.prix_designation ?? '').slice(0, 60)}`;
    case 'categorie': return (l) => String(l.categorie ?? 'Sans catégorie');
    case 'piece': return (l) => String(l.designation ?? '');
    case 'jour': return (l) => {
      const j = jourDe(l.jour_detection ?? l.date_execution ?? l.jour ?? l.date_evenement ?? l.reparee_le);
      return j ? new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Sans date';
    };
    default: return undefined;
  }
}

// Tri pour que les lignes d'un même groupe se suivent (jours dans l'ordre).
function trierPourGroupes(lignes: Ligne[], regroupement: string): Ligne[] {
  const g = cleGroupe(regroupement);
  if (!g) return lignes;
  const cle = regroupement === 'jour'
    ? (l: Ligne) => jourDe(l.jour_detection ?? l.date_execution ?? l.jour ?? l.date_evenement ?? l.reparee_le)
    : regroupement === 'article' ? (l: Ligne) => String(l.prix_ordre ?? '').padStart(5, '0') + String(l.prix_numero) : g;
  return [...lignes].sort((a, b) => cle(a).localeCompare(cle(b), 'fr', { numeric: true }));
}

// Synthèse des pièces : une ligne par groupe × pièce × unité, quantités additionnées.
function syntheseParPiece(lignes: Ligne[], regroupement: string): Ligne[] {
  const g = cleGroupe(regroupement);
  const m = new Map<string, { ligne: Ligne; fuites: Set<unknown> }>();
  lignes.forEach((l) => {
    const k = `${g ? g(l) : ''}|${l.designation}|${l.unite}`;
    const e = m.get(k) ?? { ligne: { ...l, quantite: 0 }, fuites: new Set() };
    e.ligne.quantite = Number(e.ligne.quantite) + Number(l.quantite ?? 0);
    e.fuites.add(l.fuite_id);
    m.set(k, e);
  });
  return [...m.values()].map((e): Ligne => ({ ...e.ligne, nb_fuites: e.fuites.size }))
    .sort((a, b) => String(a.designation).localeCompare(String(b.designation), 'fr', { numeric: true }));
}

export function documentJeu(
  jeu: Jeu, lignes: Ligne[], ctx: Contexte,
  o: { colonnes: string[]; regroupement: string; filtres: Filtres; orientation: 'portrait' | 'paysage'; titre?: string; infos?: string[] },
): DocumentExport {
  const toutes = jeu.colonnes(ctx);
  let choisies = toutes.filter((c) => o.colonnes.includes(c.cle));
  let donnees = lignes;
  if (jeu.id === 'pieces' && o.filtres.synthese) {
    donnees = syntheseParPiece(lignes, o.regroupement);
    const garder = new Set(['zone', 'secteur', 'chef', 'designation', 'famille', 'unite', 'quantite', 'nb_fuites']);
    choisies = toutes.filter((c) => garder.has(c.cle) && (o.colonnes.includes(c.cle) || c.cle === 'nb_fuites' || c.cle === 'quantite'));
  } else {
    choisies = choisies.filter((c) => c.cle !== 'nb_fuites');
  }
  donnees = trierPourGroupes(donnees, o.regroupement);
  const periode = libellePeriode(o.filtres);
  return {
    nomFichier: `${jeu.id}-${String(ctx.marche.code ?? 'marche')}`,
    entete: construireEntete(ctx, o.titre ?? `${jeu.libelle} : ${String(ctx.marche.code ?? '')}`, [
      periode && `${periode}${jeu.libellePeriode ? ` (${jeu.libellePeriode})` : ''}`,
      ...(o.infos ?? []),
      `${donnees.length} ligne${donnees.length > 1 ? 's' : ''}${o.filtres.synthese ? ' (synthèse)' : ''}`,
    ].filter(Boolean) as string[]),
    sections: [construireSection(donnees, choisies, { groupe: cleGroupe(o.regroupement), decimales: ctx.regles?.decimales })],
    orientation: o.orientation,
    genereLe: new Date(),
  };
}

// Attachement : récapitulatif par article puis détail, visas et mentions du marché.
export function documentAttachement(
  lot: Lot, lignes: LigneLot[], recap: Recap[], ctx: Contexte,
  o: { colonnes: string[]; regroupement: string; orientation: 'portrait' | 'paysage'; zone?: string | null },
): DocumentExport {
  const regles = ctx.regles;
  const montants = !!regles?.afficher_prix && ctx.peutMontants;
  const colonnesRecap: Colonne<Recap & Ligne>[] = [
    { cle: 'prix_numero', titre: 'N°', groupe: '', largeur: 4 },
    { cle: 'prix_designation', titre: 'Désignation des prestations', groupe: '', largeur: 52 },
    { cle: 'unite', titre: 'Unité', groupe: '', largeur: 6 },
    { cle: 'quantite_marche', titre: 'Quantité marché', groupe: '', type: 'quantite', uniteCle: 'unite', largeur: 12 },
    { cle: 'quantite_anterieure', titre: 'Antérieur', groupe: '', type: 'quantite', uniteCle: 'unite', largeur: 11 },
    { cle: 'quantite_lot', titre: 'Ce lot', groupe: '', type: 'quantite', uniteCle: 'unite', largeur: 11 },
    { cle: 'quantite_cumulee', titre: 'Cumul', groupe: '', type: 'quantite', uniteCle: 'unite', largeur: 11 },
    { cle: 'pourcentage_marche', titre: '%', groupe: '', type: 'nombre', decimales: 1, largeur: 6 },
  ];
  if (montants) {
    colonnesRecap.push(
      { cle: 'pu_ht', titre: 'PU HT', groupe: '', type: 'montant', largeur: 10 },
      { cle: 'montant_lot', titre: 'Montant du lot', groupe: '', type: 'montant', total: true, largeur: 12, valeur: (r) => (r.pu_ht == null ? null : r.quantite_lot * r.pu_ht) },
      { cle: 'montant_cumule', titre: 'Montant cumulé', groupe: '', type: 'montant', total: true, largeur: 12, valeur: (r) => (r.pu_ht == null ? null : r.quantite_cumulee * r.pu_ht) },
    );
  }
  const recapUtile = recap.filter((r) => !r.hors_bordereau || r.quantite_cumulee !== 0);
  const sections: SectionDoc[] = [
    construireSection(recapUtile as (Recap & Ligne)[], colonnesRecap, { titre: 'Récapitulatif par article', decimales: regles?.decimales }),
  ];
  const toutes = colonnesAttachement(ctx).filter((c) => montants || !['pu_ht', 'montant'].includes(c.cle));
  const choisies = toutes.filter((c) => o.colonnes.includes(c.cle));
  if (choisies.length) {
    const regroupement = o.regroupement === 'poste' ? 'article' : o.regroupement;
    sections.push(construireSection(trierPourGroupes(lignes as unknown as Ligne[], regroupement), choisies, {
      titre: 'Détail des travaux', groupe: cleGroupe(regroupement), decimales: regles?.decimales,
    }));
  }
  const os = ctx.os.find((x) => x.id === lot.os_id) ?? null;
  const fin = lot.date_arret ? dateFr(lot.date_arret) : null;
  return {
    nomFichier: `attachement-${lot.numero ?? 'projet'}-${String(ctx.marche.code ?? '')}`,
    entete: construireEntete(ctx, titreLot(regles?.titre, lot), [
      lot.lieu_travaux ? `Lieu des travaux : ${lot.lieu_travaux}` : '',
      o.zone ? `Zone : ${o.zone}` : '',
      lot.periode_debut || lot.periode_fin
        ? `Période : ${lot.periode_debut ? `du ${dateFr(lot.periode_debut)} ` : ''}${lot.periode_fin ? `au ${dateFr(lot.periode_fin)}` : ''}`
        : fin ? `Travaux exécutés au ${fin}` : '',
      lot.observation ? `Observation : ${lot.observation}` : '',
    ].filter(Boolean), os ?? ctx.osCommencement),
    sections,
    visas: regles?.visas ?? [],
    pied: regles?.texte_pied ?? null,
    filigrane: lot.statut === 'brouillon' ? 'PROJET' : null,
    orientation: o.orientation,
    genereLe: new Date(),
  };
}

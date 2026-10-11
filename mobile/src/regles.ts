// Règles de saisie de la tablette, sans dépendance d'affichage (essais/regles-saisie.test.mjs) : champs obligatoires
// d'une nouvelle fuite (F1), gardes-fous des distances et des surfaces (P6, P9), pièces proposées (P3), droit de
// modifier une étape ou une photo (V2, V3, V6), nouvelle version de l'APK (X2). La base reste juge : ces règles
// reflètent les siennes (boutons, avertissements), elles ne les remplacent pas.
import { t, tx } from './langue';

export const nombreOuNul = (texte: string) => {
  const n = Number(texte.trim().replace(',', '.'));
  return texte.trim() === '' || Number.isNaN(n) ? null : n;
};

const metres = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// F1 : champs obligatoires d'une nouvelle fuite
// ---------------------------------------------------------------------------

/** Règle F1 (réponse d'Issam, Q7) : tournée, secteur, ouvrage, visibilité et nature de dégradation. */
export const CHAMPS_FUITE_DEFAUT = ['reference_srm', 'secteur_id', 'ouvrage', 'visibilite', 'nature_degradation_id'];

/**
 * Champs exigés par le marché (marches.champs_obligatoires_fuite). Liste vide : la règle F1 par défaut. La base l'a
 * vidée pour SRM et DEMO le temps que les formulaires de la vague 2 connaissent ces champs (migration
 * 20261010200000) ; la tablette les exige quand même, comme Issam l'a décidé.
 */
export function champsExiges(marche: { champs_obligatoires_fuite?: string[] | null } | null | undefined): string[] {
  const liste = marche?.champs_obligatoires_fuite ?? [];
  return liste.length ? liste : CHAMPS_FUITE_DEFAUT;
}

/** Codes des champs exigés et vides (texte vide ou blanc = vide, comme la base). */
export const champsManquants = (valeurs: Record<string, unknown>, exiges: string[]) =>
  exiges.filter((c) => {
    const v = valeurs[c];
    return v == null || (typeof v === 'string' && !v.trim());
  });

// ---------------------------------------------------------------------------
// P6, P9 : gardes-fous (avertissements, jamais de blocage)
// ---------------------------------------------------------------------------

/** Seuils plausibles d'une fouille (Q10) : longueur 10 m, largeur 3 m, profondeur 3 m. */
export const FOUILLE_MAX = { longueur: 10, largeur: 3, profondeur: 3 };
/** Surface d'une réfection au-delà de laquelle la saisie est à vérifier (Q10). */
export const REFECTION_MAX_M2 = 30;

export interface Fouille {
  fouille_longueur_m?: number | null; fouille_largeur_m?: number | null; fouille_profondeur_m?: number | null;
}

export const surface = (longueur: number | null | undefined, largeur: number | null | undefined) =>
  longueur != null && largeur != null ? Math.round(longueur * largeur * 1000) / 1000 : 0;

/** Avertissements d'une réparation : distances en mètres, longueur de conduite posée comparée à la fouille. */
export function gardeFousReparation(r: Fouille & { longueur_pe_m?: number | null; element_remplace?: boolean }): string[] {
  const alertes: string[] = [];
  const dimensions: [number | null | undefined, number, string][] = [
    [r.fouille_longueur_m, FOUILLE_MAX.longueur, t('Longueur de la fouille')],
    [r.fouille_largeur_m, FOUILLE_MAX.largeur, t('Largeur de la fouille')],
    [r.fouille_profondeur_m, FOUILLE_MAX.profondeur, t('Profondeur de la fouille')],
  ];
  for (const [v, max, nom] of dimensions) {
    if (v != null && v > max) {
      alertes.push(t('{nom} : {valeur} m, au-delà de {max} m. Les distances sont en mètres (0,80 et non 80) : vérifiez.', {
        nom, valeur: metres(v), max: metres(max),
      }));
    }
  }
  if (r.fouille_longueur_m != null && r.fouille_longueur_m > 2 && r.fouille_longueur_m <= FOUILLE_MAX.longueur && !r.element_remplace) {
    alertes.push(t('Longueur supérieure à 2 m : à justifier par un élément de conduite remplacé.'));
  }
  const posee = r.longueur_pe_m;
  const { fouille_longueur_m: l, fouille_largeur_m: la } = r;
  if (posee != null && posee > 0 && l != null && la != null && l > 0 && la > 0) {
    const petite = Math.min(l, la);
    const grande = Math.max(l, la);
    if (posee < petite) {
      alertes.push(t('Conduite posée ({posee} m) plus courte que la plus petite dimension de la fouille ({petite} m) : vérifiez.', {
        posee: metres(posee), petite: metres(petite),
      }));
    } else if (posee > grande) {
      alertes.push(t('Conduite posée ({posee} m) plus longue que la plus grande dimension de la fouille ({grande} m) : vérifiez.', {
        posee: metres(posee), grande: metres(grande),
      }));
    }
  }
  return alertes;
}

/**
 * Avertissements d'une réfection (P9) : surface au-delà de 30 m², et total des réfections de la fuite (celle-ci
 * comprise) inférieur au total de ses fouilles. Dimensions vides : celles de la fouille (reprises par le serveur).
 */
export function gardeFousRefection(r: { longueur: number | null; largeur: number | null; faite: boolean }, fuite: {
  fouilles: Fouille[]; refections: { longueur_m: number | null; largeur_m: number | null; resultat?: string }[]; fouilleReprise?: Fouille | null;
}): string[] {
  if (!r.faite) return [];
  const alertes: string[] = [];
  const longueur = r.longueur ?? fuite.fouilleReprise?.fouille_longueur_m ?? null;
  const largeur = r.largeur ?? fuite.fouilleReprise?.fouille_largeur_m ?? null;
  const cette = surface(longueur, largeur);
  if (cette > REFECTION_MAX_M2) {
    alertes.push(t('Réfection de {surface} m², au-delà de {max} m². Les distances sont en mètres : vérifiez.', {
      surface: metres(cette), max: REFECTION_MAX_M2,
    }));
  }
  const fouilles = fuite.fouilles.reduce((s, f) => s + surface(f.fouille_longueur_m, f.fouille_largeur_m), 0);
  const refections = cette + fuite.refections
    .filter((x) => x.resultat !== 'non_faite')
    .reduce((s, x) => s + surface(x.longueur_m, x.largeur_m), 0);
  if (fouilles > 0 && refections + 1e-9 < fouilles) {
    alertes.push(t('Total des réfections de la fuite ({refections} m²) inférieur au total des fouilles ({fouilles} m²).', {
      refections: metres(refections), fouilles: metres(fouilles),
    }));
  }
  return alertes;
}

// ---------------------------------------------------------------------------
// P3 : pièces proposées selon le matériau et le diamètre, puis les plus utilisées
// ---------------------------------------------------------------------------

const normaliser = (texte: string) => texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Mots d'un article qui désignent le matériau (désignations de Dolibarr, sans accents, en minuscules).
const MOTS_MATERIAU: Record<string, RegExp> = {
  polyethylene: /\b(pe|pehd|pebd|polyethylene)\b/,
  pvc: /\bpvc\b/,
  amiante_ciment: /\b(ac|amiante)\b/,
  fonte_ductile: /\b(fonte|fd)\b/,
  fonte_grise: /\b(fonte|fg)\b/,
  acier_galvanise: /\b(acier|galva\w*)\b/,
  ppr: /\bppr\b/,
};
// Diamètres de l'acier galvanisé écrits en pouces dans les désignations.
const POUCES: Record<number, string[]> = { 15: ['1/2'], 20: ['3/4'], 40: ['1 1/2', '1"1/2'], 50: ['2"'] };

const contientDiametre = (designation: string, diametre: number) => {
  if (new RegExp(`(^|[^\\d])${diametre}([^\\d]|$)`).test(designation)) return true;
  return (POUCES[diametre] ?? []).some((p) => designation.includes(p));
};

export interface PieceProposable { id: number; designation: string; unite?: string | null }

/**
 * Capsules de la saisie des pièces : `adaptees` (diamètre dans la désignation, matériau d'abord ; matériau seul sans
 * diamètre), puis `frequentes` (les plus posées sur le marché, `usage` : nombre de poses par article). Les articles déjà
 * ajoutés sont exclus.
 */
export function piecesProposees<P extends PieceProposable>(pieces: P[], o: {
  materiau?: string | null; diametre?: number | null; usage?: Record<number, number>; exclues?: number[]; max?: number;
}): { adaptees: P[]; frequentes: P[] } {
  const max = o.max ?? 12;
  const usage = o.usage ?? {};
  const exclues = new Set(o.exclues ?? []);
  const mots = o.materiau ? MOTS_MATERIAU[o.materiau] : undefined;
  const candidates = pieces.filter((p) => !exclues.has(p.id));
  const parUsage = (a: P, b: P) => (usage[b.id] ?? 0) - (usage[a.id] ?? 0) || a.designation.localeCompare(b.designation, 'fr');
  let adaptees: P[] = [];
  if (o.diametre) {
    const d = o.diametre;
    adaptees = candidates.filter((p) => contientDiametre(normaliser(p.designation), d));
    const matiere = (p: P) => (mots?.test(normaliser(p.designation)) ? 1 : 0);
    adaptees.sort((a, b) => matiere(b) - matiere(a) || parUsage(a, b));
  } else if (mots) {
    adaptees = candidates.filter((p) => mots.test(normaliser(p.designation))).sort(parUsage);
  }
  adaptees = adaptees.slice(0, max);
  const dejaProposees = new Set(adaptees.map((p) => p.id));
  const frequentes = candidates
    .filter((p) => (usage[p.id] ?? 0) > 0 && !dejaProposees.has(p.id))
    .sort(parUsage)
    .slice(0, Math.min(8, max));
  return { adaptees, frequentes };
}

/** Nombre de poses par article, à partir des pièces récentes du marché. */
export const compterUsage = (lignes: { produit_id: number | null }[]) =>
  lignes.reduce<Record<number, number>>((c, l) => {
    if (l.produit_id != null) c[l.produit_id] = (c[l.produit_id] ?? 0) + 1;
    return c;
  }, {});

// ---------------------------------------------------------------------------
// V2, V3, V6 : modifier une étape (fuite, réparation, réfection) ou une photo
// ---------------------------------------------------------------------------

type Action = 'lire' | 'creer' | 'valider' | 'modifier' | 'supprimer';
export type Peut = (type: string, action: Action, auteurs?: (string | null | undefined)[]) => boolean;

const apres = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && Date.parse(a) > Date.parse(b);

/**
 * L'étape peut-elle être modifiée depuis la tablette ? Avant validation : l'auteur (portée « siennes ») ou un droit
 * « toutes ». Validée : seulement le droit « valider » (l'agent ajoute un nouvel élément, à valider). Fuite verrouillée
 * par un lot arrêté : l'agent modifie seulement ce qu'il a ajouté depuis le verrou (V6). `auteurs` absent : saisie faite
 * sur cette tablette, pas encore envoyée.
 */
export function peutModifierEtape(e: {
  validee_le?: string | null; cree_le?: string | null; auteurs?: (string | null | undefined)[];
}, o: { type: string; peut: Peut; verrouilleeLe?: string | null }): boolean {
  const { type, peut } = o;
  if (e.validee_le) return peut(type, 'valider') && peut(type, 'modifier');
  if (o.verrouilleeLe && !peut(type, 'valider') && e.auteurs && !apres(e.cree_le, o.verrouilleeLe)) return false;
  return peut(type, 'modifier', e.auteurs);
}

/**
 * Changer le type (`modifier`) ou retirer (`supprimer`) une photo envoyée (V3). Déposée avant la validation de son
 * étape (`valideeLe`) : réservé au droit « photos / valider » ; après : l'auteur, selon ses droits.
 */
export function peutChangerPhoto(p: { cree_le?: string | null; saisi_par?: string | null; auteur_terrain_id?: string | null }, o: {
  action: 'modifier' | 'supprimer'; valideeLe?: string | null; verrouilleeLe?: string | null; peut: Peut;
}): boolean {
  if (o.peut('photos', 'valider')) return true;
  if (o.valideeLe && !apres(p.cree_le, o.valideeLe)) return false;
  if (o.verrouilleeLe && !apres(p.cree_le, o.verrouilleeLe)) return false;
  return o.peut('photos', o.action, [p.saisi_par, p.auteur_terrain_id]);
}

// ---------------------------------------------------------------------------
// X2 : version publiée plus récente que celle installée
// ---------------------------------------------------------------------------

export const versionPlusRecente = (installee: number | null | undefined, publiee: number | null | undefined) =>
  Number.isInteger(publiee) && Number.isInteger(installee) && (publiee as number) > (installee as number);

// ---------------------------------------------------------------------------
// N1, N2 : texte d'une notification dans la langue de la tablette (la base l'écrit en français)
// ---------------------------------------------------------------------------

export interface NotificationLigne {
  id: number; evenement: string; titre: string; corps: string | null; donnees: Record<string, unknown> | null;
  /** Nulle pour une alerte du suivi GPS (suivi_coupe). */
  fuite_id: string | null; cree_le: string; lue_le: string | null;
}

const RESULTATS: Record<string, string> = { reparee: 'Réparée', en_cours: 'En cours', non_reparee: 'Non réparée' };

export function texteNotification(n: Pick<NotificationLigne, 'evenement' | 'titre' | 'corps' | 'donnees'>): { titre: string; corps: string | null } {
  const d = n.donnees ?? {};
  if (n.evenement === 'suivi_coupe') {
    const heure = String(d.heure ?? '');
    return {
      titre: t('Suivi GPS interrompu : {agent}', { agent: String(d.agent ?? '') }),
      corps: d.etat === 'autorisation'
        ? t('Autorisation de position refusée sur la tablette ; aucune position depuis {heure}.', { heure })
        : t('Aucune position depuis {heure} : application fermée, autorisation retirée, tablette éteinte ou sans réseau.', { heure }),
    };
  }
  const numero = d.numero as number | string | undefined;
  if (numero == null) return { titre: n.titre, corps: n.corps };
  const lieu = (d.adresse as string | null) ?? (d.reference_srm as string | null) ?? n.corps;
  switch (n.evenement) {
    case 'fuite_detectee':
      return { titre: t('Nouvelle fuite N° {numero} détectée', { numero }), corps: lieu };
    case 'reparation_saisie':
      return { titre: t('Réparation saisie : fuite N° {numero}', { numero }), corps: RESULTATS[String(d.resultat)] ? tx(RESULTATS[String(d.resultat)]) : n.corps };
    case 'reparation_validee':
      return {
        titre: d.resultat === 'non_reparee'
          ? t('Fuite N° {numero} non réparée, fouille validée : réfection à faire', { numero })
          : t('Fuite N° {numero} réparée et validée : réfection à faire', { numero }),
        corps: lieu,
      };
    case 'refection_saisie':
      return {
        titre: d.resultat === 'non_faite'
          ? t('Clôture sans réfection : fuite N° {numero}', { numero })
          : t('Réfection saisie : fuite N° {numero}', { numero }),
        corps: lieu,
      };
    case 'alerte_reparation':
      return { titre: t('Fuite N° {numero} non réparée depuis plus de {delai} h', { numero, delai: String(d.delai_h ?? 48) }), corps: lieu };
    default:
      return { titre: n.titre, corps: n.corps };
  }
}

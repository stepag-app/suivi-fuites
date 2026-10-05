// Rapprochement automatique du catalogue des pièces d'un marché avec la nomenclature Dolibarr.
// Règles strictes : même type de pièce, mêmes diamètres et filetages (« 40/32 » ne vaut jamais « 32/25 »),
// pas de matière, d'angle, de classe ou de sexe contradictoires. Le score départage ensuite les produits
// compatibles ; la proposition est « sûre » seulement si elle est complète et sans concurrent proche.
// Aucun import à l'exécution : le script scripts/verifier-nomenclature.mjs charge ce fichier directement avec Node.

export type Statut = 'sur' | 'probable' | 'aucun';
export type Niveau = 'strict' | 'souple' | 'incompatible';

export interface Analyse {
  texte: string;
  type: string | null;
  dims: string[];
  angle: string | null;
  classes: string[];
  materiaux: string[];
  mots: string[];
}

export interface PieceCatalogue { id: string; designation: string; famille: string | null; unite: string }
export interface ProduitNomenclature {
  dolibarr_id: number; ref: string; designation: string; unite: string | null; famille: string; actif: boolean;
}

export interface Candidat {
  produit: ProduitNomenclature;
  niveau: Niveau;
  score: number;
  rappel: number;
  ecarts: string[];
}

export interface Proposition {
  pieceId: string;
  statut: Statut;
  proposition: Candidat | null;
  autres: Candidat[];
  doublonDe: string | null;
  motif: string;
}

export const MARGE_SURE = 0.2;
const NB_AUTRES = 3;
const MAX_EGALITES_SOUPLES = 3;

// ---------------------------------------------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------------------------------------------

export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[’'`´"]/g, ' ')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[()[\]{},;:+_!?#&|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Texte pour la recherche par mots : « DN25 » et « DN 25 » se valent.
export const texteRecherche = (t: string) =>
  normaliser(t).replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2');

// Synonymes et abréviations du métier (sur le texte normalisé).
const PHRASES: [RegExp, string][] = [
  [/\bPRISE EN CHARGE\b/g, 'PEC'],
  [/\bPOLY ?ETHYLENE\b|\bPE ?HD\b|\bPEBD\b/g, 'PE'],
  [/\bAMIANTE?S? ?-?CIMENTS?\b|\bAMIANE CIMENT\b|\bAMIANTE\b|\bFIBRO ?CIMENT\b/g, 'AC'],
  [/\bFONTE DUCTILE\b|\bFONTE GRISE\b|\bTX FONTE\b|\bFD\b/g, 'FONTE'],
  [/\bACIER GALVANISE\b|\bACIER NOIR\b|\bACG\b|\bGALVANISE\b/g, 'ACIER'],
  [/\bBRANZE\b|\bBRONZE\b/g, 'LAITON'],
  [/\bEMBOITEMENTS?\b/g, 'EMB'],
  [/\bMONCHETTE\b/g, 'MANCHETTE'],
  [/\bADHERANCE\b/g, 'ADHERENCE'],
  [/\bASTORE\b/g, 'ASTOR'],
  [/\b1\/4 (?:DE )?TOUR\b/g, 'QUARTDETOUR'],
  [/\b3 (BRIDES?|EMB)\b/g, '$1'],
  [/\bBU\b/g, 'BIYOU'],
  [/\bDIAMETRE\b|\bDIAM\b|Ø/g, ' DN '],
];

const MATERIAUX = new Set(['PE', 'PVC', 'AC', 'FONTE', 'ACIER', 'LAITON', 'PPR', 'PP', 'ZINC', 'BETON', 'CUIVRE', 'INOX']);

// Types de pièce : le mot-clé le plus à gauche l'emporte ; à position égale, la règle la plus précise (la première).
// « retirer » : les mots du type ne comptent plus comme qualificatifs.
const TYPES: { motif: RegExp; type: string; retirer: boolean }[] = [
  { motif: /\bROBINET (?:DE )?PEC\b/, type: 'robinet_pec', retirer: true },
  { motif: /\bCOLLIER (?:DE )?PEC\b/, type: 'collier_pec', retirer: true },
  { motif: /\bREDUCTEUR STABILISATEUR\b|\bSTABILISATEUR\b/, type: 'stabilisateur', retirer: true },
  { motif: /\bROBINET VANNE\b|\bVANNE\b/, type: 'vanne', retirer: true },
  { motif: /\bROBINET (?:D )?ARRET\b/, type: 'robinet_arret', retirer: true },
  { motif: /\bROBINET EQUERRE\b/, type: 'robinet_equerre', retirer: true },
  { motif: /\bROBINET\b/, type: 'robinet', retirer: true },
  { motif: /\bJOINT GIBAULT\b/, type: 'joint_gibault', retirer: true },
  { motif: /\bJOINT (?:DE )?DEMONTAGE\b/, type: 'joint_demontage', retirer: true },
  { motif: /\bJOINT DISSYMETRIQUE\b/, type: 'joint_dissymetrique', retirer: true },
  { motif: /\bJOINT\b/, type: 'joint', retirer: true },
  { motif: /\bMANCHETTE\b/, type: 'manchette', retirer: true },
  { motif: /\bMANCHON\b/, type: 'manchon', retirer: true },
  { motif: /\bADAPTATEUR\b/, type: 'adaptateur_bride', retirer: true },
  { motif: /\bBRIDE MAJOR\b/, type: 'bride_major', retirer: true },
  { motif: /\bBRIDE UNIVERSELLE\b/, type: 'bride_universelle', retirer: true },
  { motif: /\bCOUDE\b/, type: 'coude', retirer: true },
  { motif: /\bTE\b/, type: 'te', retirer: true },
  { motif: /\bCONE\b|\bREDUCTION\b|\bREDUCTEUR\b/, type: 'cone', retirer: true },
  { motif: /\bBOUCHON\b/, type: 'bouchon', retirer: true },
  { motif: /\bOBTURATEUR\b/, type: 'obturateur', retirer: true },
  { motif: /\bPLAQUE PLEINE\b/, type: 'plaque_pleine', retirer: true },
  { motif: /\bVENTOUSE\b/, type: 'ventouse', retirer: true },
  { motif: /\bTABERNACLE\b/, type: 'tabernacle', retirer: true },
  { motif: /\bBOUCHE A CLE\b/, type: 'bouche_a_cle', retirer: true },
  { motif: /\bBOUCHE (?:D )?INCENDIE\b|\bPOTEAUX? (?:D )?INCENDIE\b/, type: 'incendie', retirer: true },
  { motif: /\bPORTE (?:DE )?NICHE\b/, type: 'porte_niche', retirer: true },
  { motif: /\bRACCORDS?\b/, type: 'raccord', retirer: true },
  { motif: /\bCOMPTEUR\b/, type: 'compteur', retirer: true },
  { motif: /\bCOLLIER\b/, type: 'collier', retirer: true },
  { motif: /\bBOULON\b/, type: 'boulon', retirer: true },
  { motif: /\bBIYOU\b/, type: 'bout_uni', retirer: true },
  { motif: /\bBUSE\b/, type: 'buse', retirer: true },
  { motif: /\bPLAQ(?:UE)? (?:DE )?REGARD\b|\bTAMPON\b/, type: 'tampon', retirer: true },
  { motif: /\bTUBES?\b|\bTUYAUX?\b|\bCONDUITE\b/, type: 'tube', retirer: true },
  { motif: /^(?:PE|PVC|AC|PPR|FONTE)\b/, type: 'tube', retirer: false },
];

const ANGLES: Record<string, string> = { '90': '1/4', '45': '1/8', '22.5': '1/16', '11.25': '1/32' };
const SYNONYMES: Record<string, string> = { M: 'MALE', MAL: 'MALE', F: 'FEMELLE', FEM: 'FEMELLE' };
const VIDES = new Set([
  'DE', 'DU', 'DES', 'EN', 'AU', 'AUX', 'AVEC', 'POUR', 'ET', 'OU', 'LA', 'LE', 'LES', 'SUR', 'SANS', 'DN', 'NO',
  'DROIT', 'EGAL', 'TYPE', 'ML', 'PIECE', 'MM',
]);
// Qualificatifs secondaires : leur absence chez le produit n'empêche pas une proposition « probable ».
const MINEURS = new Set(['MALE', 'FEMELLE', 'STANDARD', 'ASTOR', 'SIMPL', 'NORMAL']);
const OPPOSES: [string, string][] = [['MALE', 'FEMELLE'], ['GM', 'PM'], ['ROND', 'CARR'], ['EMB', 'COLLER']];
const ASSEMBLAGES_HORS_PE = new Set(['EMB', 'COLLER', 'BRID']);

const nombre = (v: string) => String(Number(v));
const racine = (mot: string) => {
  let m = mot.length > 3 ? mot.replace(/S$/, '') : mot;
  while (m.length > 3 && m.endsWith('E')) m = m.slice(0, -1);
  return m;
};

function trouverType(s: string): { type: string | null; reste: string } {
  let meilleur: { index: number; regle: (typeof TYPES)[number]; trouve: string } | null = null;
  for (const regle of TYPES) {
    const m = regle.motif.exec(s);
    if (m && (!meilleur || m.index < meilleur.index)) meilleur = { index: m.index, regle, trouve: m[0] };
  }
  if (!meilleur) return { type: null, reste: s };
  const reste = meilleur.regle.retirer
    ? `${s.slice(0, meilleur.index)} ${s.slice(meilleur.index + meilleur.trouve.length)}`
    : s;
  return { type: meilleur.regle.type, reste };
}

export function analyser(designation: string): Analyse {
  let s = normaliser(designation);
  for (const [motif, remplacement] of PHRASES) s = s.replace(motif, remplacement);
  const texte = s.replace(/\s+/g, ' ').trim();
  const { type, reste } = trouverType(texte);
  s = ` ${reste} `;

  const dims = new Set<string>();
  const mots: string[] = [];
  const classes: string[] = [];
  let angle: string | null = null;

  s = s.replace(/\b(A15|B125|C250|D400|E600|F900)\b/g, (m) => (classes.push(m), ' '));
  s = s.replace(/(\d+(?:\.\d+)?) ?°/g, (_, v: string) => ((angle = ANGLES[nombre(v)] ?? `${nombre(v)}°`), ' '));
  s = s.replace(/(\d+(?:\.\d+)?) ?MM\b/g, (_, v: string) => (mots.push(`L${nombre(v)}MM`), ' '));
  s = s.replace(/\b(\d+(?:\.\d+)?)ML\b/g, (_, v: string) => (mots.push(`L${nombre(v)}ML`), ' '));
  // « 6M » : longueur en mètres ; « 3/4M » reste un filetage mâle
  s = s.replace(/(?<![\d/.])(\d+(?:\.\d+)?)M\b/g, (_, v: string) => (mots.push(`L${nombre(v)}M`), ' '));
  s = s.replace(/\bPN ?(\d+)\b/g, (_, v: string) => (mots.push(`PN${nombre(v)}`), ' '));
  s = s.replace(/\bSERIE ?(\d+)\b/g, (_, v: string) => (mots.push(`SERIE${nombre(v)}`), ' '));
  s = s.replace(/(\d)([A-Z])/g, '$1 $2').replace(/([A-Z])(\d)/g, '$1 $2');
  s = s.replace(/\b(?:DN|D)\b/g, ' ').replace(/\s+/g, ' ');
  s = s.replace(/(\d) ?[X*] ?(?=\d)/g, '$1 x ');
  // Filetages en pouces : « 1-1/2 », « 1 1/2 », « 1x1/2 » après un diamètre
  s = s.replace(/(?<![\d/.])([12]) ?(?:-|x)? ?([1357])\/(2|4|8|16)(?![\d/])/g, (m, e: string, n: string, d: string) => {
    if (+n >= +d) return m;
    dims.add(`T${+e + +n / +d}`);
    return ' ';
  });
  // Coudes : 1/4, 1/8, 1/16 sont des angles
  if (type === 'coude') s = s.replace(/(?<![\d/.])1\/(4|8|16|32)(?![\d/])/g, (_, d: string) => ((angle = `1/${d}`), ' '));
  s = s.replace(/(?<![\d/.])([1357])\/(2|4|8|16)(?![\d/])/g, (m, n: string, d: string) => {
    if (+n >= +d) return m;
    dims.add(`T${+n / +d}`);
    return ' ';
  });
  s = s.replace(/\bx ([12])\b(?! ?\/)/g, (_, v: string) => (dims.add(`T${v}`), ' x '));
  // Tuyau « 53/63 » : diamètres intérieur / extérieur, seul l'extérieur compte
  if (type === 'tube') {
    s = s.replace(/(?<![\d.])(\d+) ?\/ ?(\d+)(?![\d.])/g, (m, a: string, b: string) => {
      const r = +a / +b;
      return r >= 0.7 && r <= 0.92 ? ` ${b} ` : m;
    });
  }
  // Plages : « 60-65 », « DN50-DN40 »
  s = s.replace(/(?<![\d.])(\d+(?:\.\d+)?) ?- ?(\d+(?:\.\d+)?)(?![\d.])/g, (_, a: string, b: string) => {
    if (+a >= 10 && +b >= 10) {
      const [x, y] = [+a, +b].sort((p, q) => p - q);
      dims.add(`R${x}-${y}`);
    }
    return ' ';
  });
  s = s.replace(/(?<![\d.])(\d+(?:\.\d+)?)(?![\d.])/g, (_, v: string) => {
    const x = Number(v);
    if (x >= 10 || !Number.isInteger(x)) dims.add(nombre(v));
    else mots.push(`#${x}`);
    return ' ';
  });

  const materiaux = new Set<string>();
  const qualificatifs = new Set<string>(mots);
  for (const brut of s.split(/[^A-Z0-9]+/)) {
    if (!brut) continue;
    const mot = SYNONYMES[brut] ?? brut;
    if (MATERIAUX.has(mot)) materiaux.add(mot);
    else if (mot === 'MALE' || mot === 'FEMELLE') qualificatifs.add(mot);
    else if (mot.length > 1 && !VIDES.has(mot) && !/^\d/.test(mot)) qualificatifs.add(racine(mot));
  }
  return {
    texte,
    type,
    dims: [...dims].sort((x, y) => x.localeCompare(y, "en", { numeric: true })),
    angle,
    classes: classes.sort(),
    materiaux: [...materiaux].sort(),
    mots: [...qualificatifs].sort(),
  };
}

// Matière sous-entendue par la famille du catalogue (« manchon polyéthylène », « … de conduite AC/PVC »).
export const materiauxFamille = (famille: string | null | undefined) => (famille ? analyser(famille).materiaux : []);

// ---------------------------------------------------------------------------------------------------------------
// Comparaison d'une pièce et d'un produit
// ---------------------------------------------------------------------------------------------------------------

export interface AnalysePiece extends Analyse { implicite: string[]; unite: string | null }

const memesValeurs = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const communs = (a: Iterable<string>, b: Set<string>) => [...a].filter((v) => b.has(v)).length;
const uniteCatalogue = (u: string | null | undefined) => {
  const v = (u ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'm' || v === 'ml') return 'ml';
  if (v === 'u' || v === 'p' || v === 'uni') return 'u';
  return v;
};

export function analyserPiece(p: PieceCatalogue): AnalysePiece {
  return { ...analyser(p.designation), implicite: materiauxFamille(p.famille), unite: uniteCatalogue(p.unite) };
}

// Le produit compte par son unité et son état dans Dolibarr : un produit inactif (ni en vente ni en achat,
// ou absent du dernier import) peut être proposé, mais jamais comme « sûr ».
export function comparer(
  p: AnalysePiece, d: Analyse, produit: { unite?: string | null; actif?: boolean } = {},
): Omit<Candidat, 'produit'> {
  const ecarts: string[] = [];
  let niveau: Niveau = 'strict';
  if (p.type !== d.type) {
    niveau = 'incompatible';
    ecarts.push('autre type de pièce');
  }
  if (!memesValeurs(p.dims, d.dims)) {
    if (p.dims.length === 0) {
      if (niveau === 'strict') niveau = 'souple';
      ecarts.push('dimensions non précisées dans le catalogue');
    } else {
      niveau = 'incompatible';
      ecarts.push(d.dims.length ? 'dimensions différentes' : 'produit sans dimension');
    }
  }
  let leger = false;
  if (p.angle && d.angle && p.angle !== d.angle) {
    niveau = 'incompatible';
    ecarts.push('angle différent');
  } else if (!!p.angle !== !!d.angle) {
    leger = true;
    ecarts.push('angle précisé d\'un seul côté');
  }
  if (p.classes.length && d.classes.length && !memesValeurs(p.classes, d.classes)) {
    niveau = 'incompatible';
    ecarts.push('classe de résistance différente');
  }
  const matPiece = p.materiaux.length ? p.materiaux : p.implicite;
  const matProduit = new Set(d.materiaux);
  if (matPiece.length && matProduit.size && communs(matPiece, matProduit) === 0) {
    niveau = 'incompatible';
    ecarts.push('matière différente');
  } else if (p.type === 'tube' && p.materiaux.length && !matProduit.size) {
    // Pour un tuyau, la matière fait la pièce : « conduite acier » ne vaut pas un tube de matière inconnue.
    niveau = 'incompatible';
    ecarts.push('matière non précisée par le produit');
  } else if (matPiece.length === 1 && matPiece[0] === 'PE' && !matProduit.size && d.mots.some((m) => ASSEMBLAGES_HORS_PE.has(m))) {
    // Le polyéthylène ne se colle pas et ne s'emboîte pas : un raccord à emboîtement, à coller ou à brides est d'une autre matière.
    niveau = 'incompatible';
    ecarts.push('assemblage d\'une autre matière (emboîtement, collage, brides)');
  }
  const motsProduit = new Set(d.mots);
  for (const [a, b] of OPPOSES) {
    if ((p.mots.includes(a) && motsProduit.has(b)) || (p.mots.includes(b) && motsProduit.has(a))) {
      niveau = 'incompatible';
      ecarts.push(`${a.toLowerCase()} / ${b.toLowerCase()}`);
    }
  }
  const up = p.unite;
  const ud = uniteCatalogue(produit.unite);
  if (up && ud && up !== ud) {
    leger = true;
    ecarts.push('unité différente');
  }
  if (produit.actif === false) {
    leger = true;
    ecarts.push('produit inactif dans Dolibarr');
  }

  const rappel = p.mots.length ? communs(p.mots, motsProduit) / p.mots.length : 1;
  const effPiece = new Set([...p.mots, ...matPiece]);
  const effProduit = [...d.mots, ...d.materiaux];
  const precision = (communs(effProduit, effPiece) + 1) / (effProduit.length + 1);
  const bonusMatiere = matPiece.length && communs(matPiece, matProduit) > 0 ? 0.1 : 0;
  const identique = p.texte === d.texte ? 0.05 : 0;
  const score = 0.6 * rappel + 0.25 * precision + bonusMatiere + identique - (leger ? 0.15 : 0);
  if (leger && niveau === 'strict') niveau = 'souple';
  return { niveau, score: Math.round(score * 1000) / 1000, rappel, ecarts };
}

const RANG: Record<Niveau, number> = { strict: 2, souple: 1, incompatible: 0 };
const ordreCandidats = (a: Candidat, b: Candidat) =>
  RANG[b.niveau] - RANG[a.niveau] || b.score - a.score || a.produit.designation.localeCompare(b.produit.designation, 'fr');

// Une pièce sans type reconnu n'est proposée que si tous ses mots (hors simples nombres) se retrouvent dans le produit.
const proposable = (p: AnalysePiece, c: Candidat) =>
  c.niveau !== 'incompatible'
  && (p.type !== null
    ? c.rappel >= 0.5 || p.mots.every((m) => MINEURS.has(m))
    : c.rappel === 1 && p.mots.some((m) => !m.startsWith('#')));

// Proximité de texte (mots et dimensions communs) : sert seulement à compléter la liste des autres candidats.
function proximite(a: Analyse, b: Analyse): number {
  const ea = new Set([...a.mots, ...a.dims, ...a.materiaux, a.type ?? '']);
  const eb = [...b.mots, ...b.dims, ...b.materiaux, b.type ?? ''];
  const c = communs(eb, ea);
  return c / (ea.size + eb.length - c || 1);
}

// ---------------------------------------------------------------------------------------------------------------
// Rapprochement d'un catalogue
// ---------------------------------------------------------------------------------------------------------------

export interface OptionsRapprochement {
  // Produits déjà rapprochés d'une pièce du marché : identifiant Dolibarr → identifiant de la pièce
  pris?: Map<number, string>;
  marge?: number;
}

interface ProduitAnalyse { produit: ProduitNomenclature; analyse: Analyse }

export function preparerProduits(produits: ProduitNomenclature[]): { tous: ProduitAnalyse[]; parType: Map<string | null, ProduitAnalyse[]> } {
  const tous = produits.map((produit) => ({ produit, analyse: analyser(produit.designation) }));
  const parType = new Map<string | null, ProduitAnalyse[]>();
  for (const pa of tous) {
    const l = parType.get(pa.analyse.type) ?? [];
    l.push(pa);
    parType.set(pa.analyse.type, l);
  }
  return { tous, parType };
}

export function proposerPourPiece(
  piece: PieceCatalogue,
  prep: ReturnType<typeof preparerProduits>,
  marge = MARGE_SURE,
): Omit<Proposition, 'doublonDe'> {
  const a = analyserPiece(piece);
  const memeType = (prep.parType.get(a.type) ?? []).map(({ produit, analyse }) => ({
    produit, ...comparer(a, analyse, produit),
  })).sort(ordreCandidats);
  const possibles = memeType.filter((c) => proposable(a, c));
  const meilleur = possibles[0] ?? null;
  let statut: Statut = 'aucun';
  let motif = memeType.length ? 'aucun produit compatible (type, dimensions, matière)' : 'aucun produit de ce type';

  if (meilleur) {
    const second = possibles[1];
    const ecart = second ? meilleur.score - second.score : Infinity;
    const texteIdentique = meilleur.niveau === 'strict' && a.texte === analyser(meilleur.produit.designation).texte
      && !possibles.slice(1).some((c) => analyser(c.produit.designation).texte === a.texte);
    const complet = meilleur.niveau === 'strict' && a.type !== null && meilleur.rappel === 1
      && (a.dims.length > 0 || a.mots.length > 0);
    if (texteIdentique || (complet && ecart >= marge)) {
      statut = 'sur';
      motif = texteIdentique ? 'même désignation' : 'même type, mêmes dimensions, désignation concordante';
    } else if (meilleur.niveau === 'souple'
      && possibles.filter((c) => meilleur.score - c.score < 0.01).length > MAX_EGALITES_SOUPLES) {
      motif = 'trop de produits possibles : préciser la pièce';
    } else {
      statut = 'probable';
      motif = second && ecart < marge ? 'plusieurs produits possibles' : meilleur.ecarts[0] ?? 'qualificatif absent du produit';
    }
  }

  const proposition = statut === 'aucun' ? null : meilleur;
  const autres = memeType.filter((c) => c !== proposition).slice(0, NB_AUTRES);
  if (autres.length < NB_AUTRES) {
    const deja = new Set([proposition, ...autres].filter(Boolean).map((c) => c!.produit.dolibarr_id));
    const proches = prep.tous
      .filter((pa) => !deja.has(pa.produit.dolibarr_id) && pa.analyse.type !== a.type)
      .map((pa) => ({ pa, s: proximite(a, pa.analyse) }))
      .filter((x) => x.s > 0)
      .sort((x, y) => y.s - x.s)
      .slice(0, NB_AUTRES - autres.length);
    for (const { pa } of proches) autres.push({ produit: pa.produit, ...comparer(a, pa.analyse, pa.produit) });
  }
  return { pieceId: piece.id, statut, proposition, autres, motif };
}

// Propositions pour toutes les pièces ; un produit n'est proposé qu'à une pièce (la mieux notée), les autres
// pièces qui le visent sont marquées « en double » et ne sont jamais « sûres ».
export function rapprocher(pieces: PieceCatalogue[], produits: ProduitNomenclature[], options: OptionsRapprochement = {}): Proposition[] {
  const prep = preparerProduits(produits);
  const resultats = pieces.map((p) => ({ ...proposerPourPiece(p, prep, options.marge), doublonDe: null as string | null }));
  const pris = new Map(options.pris ?? []);
  const ordre = [...resultats].sort((x, y) =>
    (y.statut === 'sur' ? 1 : 0) - (x.statut === 'sur' ? 1 : 0)
    || (y.proposition?.score ?? 0) - (x.proposition?.score ?? 0)
    || x.pieceId.localeCompare(y.pieceId));
  for (const r of ordre) {
    if (!r.proposition) continue;
    const id = r.proposition.produit.dolibarr_id;
    const titulaire = pris.get(id);
    if (titulaire && titulaire !== r.pieceId) {
      r.doublonDe = titulaire;
      r.statut = 'probable';
      r.motif = 'produit déjà proposé ou rapproché pour une autre pièce : pièce en double ?';
    } else {
      pris.set(id, r.pieceId);
    }
  }
  return resultats;
}

export function compterStatuts(propositions: Proposition[]): Record<Statut, number> {
  const n: Record<Statut, number> = { sur: 0, probable: 0, aucun: 0 };
  for (const p of propositions) n[p.statut]++;
  return n;
}

// Recherche par mots (désignation ou référence), produits actifs d'abord.
export function rechercherProduits<T extends { designation: string; ref: string; actif?: boolean }>(produits: T[], texte: string, limite = 30): T[] {
  const mots = texteRecherche(texte).split(' ').filter(Boolean);
  if (!mots.length) return [];
  return produits
    .filter((p) => {
      const t = ` ${texteRecherche(`${p.designation} ${p.ref}`)} `;
      return mots.every((m) => t.includes(m));
    })
    .sort((a, b) => Number(b.actif !== false) - Number(a.actif !== false) || a.designation.localeCompare(b.designation, 'fr', { numeric: true }))
    .slice(0, limite);
}

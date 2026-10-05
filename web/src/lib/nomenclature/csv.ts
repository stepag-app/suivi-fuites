// Lecture de l'export des produits de Dolibarr (produits.csv), entièrement dans le navigateur.
// Seules les colonnes utiles sont lues (identifiant, référence, libellé, unité, famille, en vente / en achat) :
// un prix, un PMP ou un stock présents dans le fichier ne sont jamais lus ni envoyés.
// Aucun import à l'exécution : le script scripts/verifier-nomenclature.mjs charge ce fichier directement avec Node.

export interface ProduitLu {
  dolibarr_id: number;
  ref: string;
  designation: string;
  unite: string | null;
  famille: string;
  actif: boolean;
}

export interface LectureProduits {
  produits: ProduitLu[];
  colonnesManquantes: string[];
  rejetees: { ligne: number; motif: string }[];
  doublons: number;
}

export interface ResumeFamille { famille: string; libelle: string; total: number; actifs: number }

export const FAMILLES_PAR_DEFAUT = ['RAC', 'CND', 'ROB', 'AEP', 'VRI'];
export const FAMILLES_EN_OPTION = ['CNS'];
export const LIBELLES_FAMILLES: Record<string, string> = {
  RAC: 'Raccords',
  CND: 'Conduites',
  ROB: 'Robinetterie',
  AEP: 'Eau potable',
  VRI: 'Voirie',
  CNS: 'Matériaux de construction',
};

const LONGUEUR_MAX_DESIGNATION = 255;
const LONGUEUR_MAX_REF = 64;

// Texte du fichier : UTF-8 (avec ou sans BOM), sinon Windows-1252 (CSV enregistré par Excel).
export function decoderTexte(octets: ArrayBuffer | Uint8Array): string {
  const vue = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  let texte: string;
  try {
    texte = new TextDecoder('utf-8', { fatal: true }).decode(vue);
  } catch {
    texte = new TextDecoder('windows-1252').decode(vue);
  }
  return texte.charCodeAt(0) === 0xfeff ? texte.slice(1) : texte;
}

// Séparateur de la ligne d'en-tête : point-virgule (export Dolibarr), sinon virgule ou tabulation.
export function detecterSeparateur(texte: string): string {
  const entete = texte.slice(0, Math.max(0, texte.search(/\r?\n/)) || texte.length);
  if (entete.includes(';')) return ';';
  if (entete.includes('\t')) return '\t';
  return ',';
}

// CSV au sens RFC 4180 : champs entre guillemets (guillemet doublé), séparateurs et sauts de ligne dans un champ.
export function lireCsv(texte: string, separateur = detecterSeparateur(texte)): string[][] {
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let entreGuillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (entreGuillemets) {
      if (c === '"' && texte[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') {
        entreGuillemets = false;
      } else {
        champ += c;
      }
    } else if (c === '"' && champ === '') {
      entreGuillemets = true;
    } else if (c === separateur) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else {
      champ += c;
    }
  }
  if (champ !== '' || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((v) => v.trim() !== ''));
}

const cleColonne = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/[\s-]+/g, '_');

// Noms acceptés pour chaque colonne utile (export SQL du lot ou export standard de Dolibarr).
const COLONNES: Record<'id' | 'ref' | 'libelle' | 'unite' | 'famille' | 'vente' | 'achat', string[]> = {
  id: ['rowid', 'id', 'id_produit', 'p.rowid'],
  ref: ['ref', 'reference', 'ref_produit', 'p.ref'],
  libelle: ['label', 'libelle', 'designation', 'p.label'],
  unite: ['unite', 'unit', 'unite_code'],
  famille: ['prefixe_ref', 'famille', 'prefixe'],
  vente: ['en_vente', 'tosell', 'status', 'p.tosell'],
  achat: ['en_achat', 'tobuy', 'status_buy', 'p.tobuy'],
};

const prefixe = (ref: string) => (ref.match(/^[A-Za-z]+/)?.[0] ?? '').slice(0, 10).toUpperCase();
const nettoyer = (t: string) => t.replace(/\s+/g, ' ').trim();
const actifDolibarr = (v: string | undefined) => v === undefined || v.trim() === '' || v.trim() !== '0';

export function extraireProduits(lignes: string[][]): LectureProduits {
  const [entete, ...corps] = lignes;
  const cles = (entete ?? []).map(cleColonne);
  const index = (noms: string[]) => {
    for (const n of noms) {
      const i = cles.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iId = index(COLONNES.id);
  const iRef = index(COLONNES.ref);
  const iLib = index(COLONNES.libelle);
  const iUnite = index(COLONNES.unite);
  const iFamille = index(COLONNES.famille);
  const iVente = index(COLONNES.vente);
  const iAchat = index(COLONNES.achat);
  const colonnesManquantes = [
    ...(iId < 0 ? ['rowid'] : []), ...(iRef < 0 ? ['ref'] : []), ...(iLib < 0 ? ['label'] : []),
  ];
  const resultat: LectureProduits = { produits: [], colonnesManquantes, rejetees: [], doublons: 0 };
  if (colonnesManquantes.length) return resultat;

  const vus = new Map<number, number>();
  corps.forEach((l, n) => {
    const ligne = n + 2;
    const id = Number((l[iId] ?? '').trim());
    const ref = nettoyer(l[iRef] ?? '');
    const designation = nettoyer(l[iLib] ?? '');
    if (!Number.isInteger(id) || id <= 0) return void resultat.rejetees.push({ ligne, motif: 'identifiant invalide' });
    if (!ref || ref.length > LONGUEUR_MAX_REF) return void resultat.rejetees.push({ ligne, motif: 'référence vide ou trop longue' });
    if (!designation || designation.length > LONGUEUR_MAX_DESIGNATION) {
      return void resultat.rejetees.push({ ligne, motif: 'libellé vide ou trop long' });
    }
    const famille = (iFamille >= 0 ? nettoyer(l[iFamille] ?? '').toUpperCase().slice(0, 10) : '') || prefixe(ref);
    if (!famille) return void resultat.rejetees.push({ ligne, motif: 'famille introuvable' });
    const produit: ProduitLu = {
      dolibarr_id: id,
      ref,
      designation,
      unite: iUnite >= 0 ? nettoyer(l[iUnite] ?? '').slice(0, 20) || null : null,
      famille,
      // Dolibarr : un produit ni en vente ni en achat est hors service.
      actif: (iVente < 0 && iAchat < 0) || actifDolibarr(iVente >= 0 ? l[iVente] : '0') || actifDolibarr(iAchat >= 0 ? l[iAchat] : '0'),
    };
    const deja = vus.get(id);
    if (deja !== undefined) {
      resultat.doublons++;
      resultat.produits[deja] = produit;
    } else {
      vus.set(id, resultat.produits.length);
      resultat.produits.push(produit);
    }
  });
  return resultat;
}

export function resumerFamilles(produits: ProduitLu[]): ResumeFamille[] {
  const parFamille = new Map<string, ResumeFamille>();
  for (const p of produits) {
    const r = parFamille.get(p.famille) ?? { famille: p.famille, libelle: LIBELLES_FAMILLES[p.famille] ?? p.famille, total: 0, actifs: 0 };
    r.total++;
    if (p.actif) r.actifs++;
    parFamille.set(p.famille, r);
  }
  const rang = (f: string) => {
    const i = [...FAMILLES_PAR_DEFAUT, ...FAMILLES_EN_OPTION].indexOf(f);
    return i < 0 ? 99 : i;
  };
  return [...parFamille.values()].sort((a, b) => rang(a.famille) - rang(b.famille) || b.total - a.total || a.famille.localeCompare(b.famille));
}

export const filtrerFamilles = (produits: ProduitLu[], familles: Iterable<string>) => {
  const garder = new Set(familles);
  return produits.filter((p) => garder.has(p.famille));
};

// Ce que l'import changera dans la base (aperçu ; la base applique la même règle) :
// nouveaux produits, données modifiées, produits absents du fichier rendus inactifs.
export interface ProduitBase { dolibarr_id: number; ref: string; designation: string; unite: string | null; famille: string; actif: boolean }
export interface DiffImport { nouveaux: number; modifies: number; designationsModifiees: number; desactives: number; inchanges: number }

export function comparerImport(base: ProduitBase[], lus: ProduitLu[]): DiffImport {
  const existants = new Map(base.map((p) => [p.dolibarr_id, p]));
  const presents = new Set(lus.map((p) => p.dolibarr_id));
  const diff: DiffImport = { nouveaux: 0, modifies: 0, designationsModifiees: 0, desactives: 0, inchanges: 0 };
  for (const p of lus) {
    const e = existants.get(p.dolibarr_id);
    if (!e) diff.nouveaux++;
    else if (e.ref !== p.ref || e.designation !== p.designation || (e.unite ?? null) !== (p.unite ?? null) || e.famille !== p.famille || e.actif !== p.actif) {
      diff.modifies++;
      if (e.designation !== p.designation) diff.designationsModifiees++;
    } else diff.inchanges++;
  }
  diff.desactives = base.filter((p) => p.actif && !presents.has(p.dolibarr_id)).length;
  return diff;
}

// Base après import (même règle que la fonction importer_produits_dolibarr) : sert à vérifier l'idempotence.
export function appliquerImport(base: ProduitBase[], lus: ProduitLu[]): ProduitBase[] {
  const parId = new Map(base.map((p) => [p.dolibarr_id, { ...p }]));
  const presents = new Set(lus.map((p) => p.dolibarr_id));
  for (const p of lus) parId.set(p.dolibarr_id, { ...p });
  for (const p of parId.values()) if (!presents.has(p.dolibarr_id)) p.actif = false;
  return [...parId.values()].sort((a, b) => a.dolibarr_id - b.dolibarr_id);
}

// Unité du catalogue des pièces (u, ml, m2, m3, kg) correspondant à l'unité de Dolibarr ; « u » par défaut.
export function uniteCatalogue(unite: string | null | undefined): 'u' | 'ml' | 'm2' | 'm3' | 'kg' {
  const u = (unite ?? '').trim().toLowerCase();
  if (u === 'm' || u === 'ml' || u === 'mètre' || u === 'metre') return 'ml';
  if (u === 'm2' || u === 'm²') return 'm2';
  if (u === 'm3' || u === 'm³') return 'm3';
  if (u === 'kg') return 'kg';
  return 'u';
}

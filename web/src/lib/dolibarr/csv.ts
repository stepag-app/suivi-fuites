// Lecture de l'export des mouvements de stock de Dolibarr (mouvements_chantier*.csv), entièrement dans le
// navigateur. Seules les colonnes utiles sont lues (identifiant, date, produit, entrepôt, quantité signée, type,
// libellé, code d'inventaire, annulation, projet, bon de transfert, unité) : un prix, une valeur ou un PMP
// présents dans le fichier ne sont jamais lus ni envoyés.
// Copie adaptée du lecteur de src/lib/nomenclature/csv.ts : aucun import à
// l'exécution, le script scripts/verifier-rapprochement-dolibarr.mjs charge ce fichier directement avec Node.

export interface MouvementLu {
  dolibarr_id: number;
  /** « AAAA-MM-JJ HH:MM:SS » à l'heure du Maroc (export SQL), ou ISO avec décalage (API). */
  date_mouvement: string;
  produit_dolibarr_id: number;
  produit_ref: string | null;
  produit_designation: string | null;
  entrepot_id: number;
  entrepot_libelle: string | null;
  entrepot_contrepartie_id: number | null;
  entrepot_contrepartie: string | null;
  /** Signée : positive à l'entrée dans l'entrepôt, négative à la sortie. */
  quantite: number;
  /** 0 entrée, 1 sortie (manuelles) ; 2 expédition, 3 réception. */
  type_mouvement: number;
  libelle: string | null;
  code_inventaire: string | null;
  /** Ligne inverse écrite à l'annulation d'un bon (« … CANCEL »). */
  annulation: boolean;
  projet_id: number | null;
  bon_id: number | null;
  unite: string | null;
}

export interface LectureMouvements {
  mouvements: MouvementLu[];
  colonnesManquantes: string[];
  rejetees: { ligne: number; motif: string }[];
  doublons: number;
}

export interface ResumeEntrepot { id: number; libelle: string | null; lignes: number }

export interface ResumeMouvements {
  lignes: number;
  dateMin: string | null;
  dateMax: string | null;
  entrepots: ResumeEntrepot[];
  produits: number;
  annulations: number;
  entrees: number;
  retours: number;
  consommations: number;
  /** Lignes d'un autre entrepôt que celui du marché (gardées : le rapprochement filtre par entrepôt du marché). */
  horsEntrepotMarche: number;
}

export const CLES_MOUVEMENT: (keyof MouvementLu)[] = [
  'dolibarr_id', 'date_mouvement', 'produit_dolibarr_id', 'produit_ref', 'produit_designation', 'entrepot_id',
  'entrepot_libelle', 'entrepot_contrepartie_id', 'entrepot_contrepartie', 'quantite', 'type_mouvement', 'libelle',
  'code_inventaire', 'annulation', 'projet_id', 'bon_id', 'unite',
];

const LONGUEUR_MAX_TEXTE = 255;
const LONGUEUR_MAX_REF = 64;
const LONGUEUR_MAX_CODE = 128;
const LONGUEUR_MAX_UNITE = 20;

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

// Noms acceptés pour chaque colonne utile : export SQL du lot (mouvements_chantier*.csv) ou API /stockmovements.
// Les colonnes de prix (price, prix, pmp, valeur, montant…) ne figurent nulle part ici : jamais lues.
const COLONNES = {
  id: ['rowid', 'id', 'mouvement_id'],
  date: ['date', 'datem', 'date_mouvement'],
  produit: ['produit_rowid', 'product_id', 'fk_product', 'produit_id', 'produit_dolibarr_id'],
  produit_ref: ['produit_ref', 'product_ref', 'ref_produit'],
  produit_label: ['produit_label', 'product_label', 'label_produit', 'produit_designation', 'designation'],
  entrepot: ['entrepot_rowid', 'warehouse_id', 'fk_entrepot', 'entrepot_id'],
  entrepot_libelle: ['entrepot', 'warehouse', 'entrepot_libelle', 'entrepot_label'],
  quantite: ['quantite_signee', 'qty', 'quantite'],
  type: ['type_mouvement', 'type'],
  libelle: ['libelle', 'label'],
  code: ['inventorycode', 'code_inventaire'],
  annulation: ['annulation'],
  contrepartie: ['entrepot_contrepartie', 'contrepartie'],
  contrepartie_id: ['entrepot_contrepartie_rowid', 'entrepot_contrepartie_id', 'contrepartie_rowid'],
  projet: ['projet_rowid', 'fk_project', 'fk_projet', 'projet_id'],
  origine_type: ['origine_type', 'origin_type', 'origintype'],
  origine_id: ['origine_id', 'origin_id', 'fk_origin'],
  bon: ['bon_id', 'bon_rowid', 'transfert_rowid'],
  unite: ['unite', 'unit', 'unite_code'],
} as const;

const nettoyer = (t: string) => t.replace(/\s+/g, ' ').trim();
const texteOuNul = (v: string | undefined, max: number) => {
  const t = nettoyer(v ?? '').slice(0, max);
  return t === '' ? null : t;
};
const entierOuNul = (v: string | undefined): number | null => {
  const t = (v ?? '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const VRAI = new Set(['1', 'true', 'oui', 'vrai', 'yes']);

// Date de Dolibarr : « AAAA-MM-JJ HH:MM:SS » (gardée telle quelle, heure du Maroc), ISO avec décalage (gardée),
// « JJ/MM/AAAA HH:MM[:SS] » (remise en ISO), ou horodatage Unix en secondes (API) converti en ISO UTC.
export function normaliserDate(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  if (t === '') return null;
  if (/^\d{9,11}$/.test(t)) {
    const d = new Date(Number(t) * 1000);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(t);
  if (iso) {
    const [, a, m, j, h = '00', mi = '00', s = '00', decalage] = iso;
    if (!jourValide(Number(a), Number(m), Number(j)) || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
    return decalage ? `${a}-${m}-${j}T${h}:${mi}:${s}${decalage}` : `${a}-${m}-${j} ${h}:${mi}:${s}`;
  }
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (fr) {
    const [, j, m, a, h = '00', mi = '00', s = '00'] = fr;
    if (!jourValide(Number(a), Number(m), Number(j)) || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
    return `${a}-${m}-${j} ${h}:${mi}:${s}`;
  }
  return null;
}

function jourValide(a: number, m: number, j: number): boolean {
  const d = new Date(Date.UTC(a, m - 1, j));
  return a >= 2000 && a <= 2999 && d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

// Quantité signée : point ou virgule décimale, espaces tolérés.
export function lireQuantite(v: string | undefined): number | null {
  const t = (v ?? '').replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function extraireMouvements(lignes: string[][]): LectureMouvements {
  const [entete, ...corps] = lignes;
  const cles = (entete ?? []).map(cleColonne);
  const index = (noms: readonly string[]) => {
    for (const n of noms) {
      const i = cles.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const i = {
    id: index(COLONNES.id), date: index(COLONNES.date), produit: index(COLONNES.produit), produitRef: index(COLONNES.produit_ref),
    produitLabel: index(COLONNES.produit_label), entrepot: index(COLONNES.entrepot), entrepotLibelle: index(COLONNES.entrepot_libelle),
    quantite: index(COLONNES.quantite), type: index(COLONNES.type), libelle: index(COLONNES.libelle), code: index(COLONNES.code),
    annulation: index(COLONNES.annulation), contrepartie: index(COLONNES.contrepartie), contrepartieId: index(COLONNES.contrepartie_id),
    projet: index(COLONNES.projet), origineType: index(COLONNES.origine_type), origineId: index(COLONNES.origine_id),
    bon: index(COLONNES.bon), unite: index(COLONNES.unite),
  };
  const colonnesManquantes = [
    ...(i.id < 0 ? ['rowid'] : []), ...(i.date < 0 ? ['date'] : []), ...(i.produit < 0 ? ['produit_rowid'] : []),
    ...(i.entrepot < 0 ? ['entrepot_rowid'] : []), ...(i.quantite < 0 ? ['quantite_signee'] : []), ...(i.type < 0 ? ['type_mouvement'] : []),
  ];
  const resultat: LectureMouvements = { mouvements: [], colonnesManquantes, rejetees: [], doublons: 0 };
  if (colonnesManquantes.length) return resultat;

  const vus = new Map<number, number>();
  corps.forEach((l, n) => {
    const ligne = n + 2;
    const id = entierOuNul(l[i.id]);
    if (id === null) return void resultat.rejetees.push({ ligne, motif: 'identifiant invalide' });
    const date = normaliserDate(l[i.date]);
    if (date === null) return void resultat.rejetees.push({ ligne, motif: 'date invalide' });
    const produit = entierOuNul(l[i.produit]);
    if (produit === null) return void resultat.rejetees.push({ ligne, motif: 'produit invalide' });
    const entrepot = entierOuNul(l[i.entrepot]);
    if (entrepot === null) return void resultat.rejetees.push({ ligne, motif: 'entrepôt invalide' });
    const quantite = lireQuantite(l[i.quantite]);
    if (quantite === null) return void resultat.rejetees.push({ ligne, motif: 'quantité invalide' });
    const type = Number((l[i.type] ?? '').trim());
    if (!Number.isInteger(type) || type < 0 || type > 3) return void resultat.rejetees.push({ ligne, motif: 'type de mouvement invalide' });

    const libelle = i.libelle >= 0 ? texteOuNul(l[i.libelle], LONGUEUR_MAX_TEXTE) : null;
    const code = i.code >= 0 ? texteOuNul(l[i.code], LONGUEUR_MAX_CODE) : null;
    const annulationLue = i.annulation >= 0 ? (l[i.annulation] ?? '').trim().toLowerCase() : '';
    const annulation = annulationLue !== '' ? VRAI.has(annulationLue) : / CANCEL\s*$/.test(libelle ?? '') || / CANCEL\s*$/.test(code ?? '');
    const origineType = i.origineType >= 0 ? (l[i.origineType] ?? '').trim().toLowerCase() : '';
    const bon = i.bon >= 0 ? entierOuNul(l[i.bon])
      : origineType === 'stocktransfers_transfer' ? entierOuNul(l[i.origineId]) : null;

    const mouvement: MouvementLu = {
      dolibarr_id: id,
      date_mouvement: date,
      produit_dolibarr_id: produit,
      produit_ref: i.produitRef >= 0 ? texteOuNul(l[i.produitRef], LONGUEUR_MAX_REF) : null,
      produit_designation: i.produitLabel >= 0 ? texteOuNul(l[i.produitLabel], LONGUEUR_MAX_TEXTE) : null,
      entrepot_id: entrepot,
      entrepot_libelle: i.entrepotLibelle >= 0 ? texteOuNul(l[i.entrepotLibelle], LONGUEUR_MAX_TEXTE) : null,
      entrepot_contrepartie_id: i.contrepartieId >= 0 ? entierOuNul(l[i.contrepartieId]) : null,
      entrepot_contrepartie: i.contrepartie >= 0 ? texteOuNul(l[i.contrepartie], LONGUEUR_MAX_TEXTE) : null,
      quantite,
      type_mouvement: type,
      libelle,
      code_inventaire: code,
      annulation,
      projet_id: i.projet >= 0 ? entierOuNul(l[i.projet]) : null,
      bon_id: bon,
      unite: i.unite >= 0 ? texteOuNul(l[i.unite], LONGUEUR_MAX_UNITE) : null,
    };
    const deja = vus.get(id);
    if (deja !== undefined) {
      resultat.doublons++;
      resultat.mouvements[deja] = mouvement;
    } else {
      vus.set(id, resultat.mouvements.length);
      resultat.mouvements.push(mouvement);
    }
  });
  return resultat;
}

// Plusieurs fichiers à la fois (export courant + complément) : un même rowid lu deux fois ne compte qu'une fois.
export function fusionnerLectures(lectures: LectureMouvements[]): LectureMouvements {
  const parId = new Map<number, MouvementLu>();
  let doublons = 0;
  const rejetees: { ligne: number; motif: string }[] = [];
  const colonnesManquantes = new Set<string>();
  for (const l of lectures) {
    l.colonnesManquantes.forEach((c) => colonnesManquantes.add(c));
    rejetees.push(...l.rejetees);
    doublons += l.doublons;
    for (const m of l.mouvements) {
      if (parId.has(m.dolibarr_id)) doublons++;
      parId.set(m.dolibarr_id, m);
    }
  }
  return {
    mouvements: [...parId.values()].sort((a, b) => a.dolibarr_id - b.dolibarr_id),
    colonnesManquantes: [...colonnesManquantes],
    rejetees,
    doublons,
  };
}

// Sortie définitive sans contrepartie (« Consommation pour le projet … ») : la pose déclarée dans Dolibarr.
export const estConsommation = (m: Pick<MouvementLu, 'type_mouvement' | 'annulation' | 'entrepot_contrepartie_id' | 'entrepot_contrepartie'>) =>
  m.type_mouvement === 1 && !m.annulation && m.entrepot_contrepartie_id == null && !m.entrepot_contrepartie;

// Retour vers le dépôt : sortie de l'entrepôt par bon de transfert (contrepartie connue), hors annulation.
export const estRetour = (m: Pick<MouvementLu, 'type_mouvement' | 'annulation' | 'entrepot_contrepartie_id' | 'entrepot_contrepartie'>) =>
  m.type_mouvement === 1 && !m.annulation && !estConsommation(m);

export function resumerMouvements(mouvements: MouvementLu[], entrepotMarche: number | null = null): ResumeMouvements {
  const entrepots = new Map<number, ResumeEntrepot>();
  const produits = new Set<number>();
  const r: ResumeMouvements = {
    lignes: mouvements.length, dateMin: null, dateMax: null, entrepots: [], produits: 0,
    annulations: 0, entrees: 0, retours: 0, consommations: 0, horsEntrepotMarche: 0,
  };
  for (const m of mouvements) {
    const e = entrepots.get(m.entrepot_id) ?? { id: m.entrepot_id, libelle: null, lignes: 0 };
    e.lignes++;
    if (!e.libelle && m.entrepot_libelle) e.libelle = m.entrepot_libelle;
    entrepots.set(m.entrepot_id, e);
    produits.add(m.produit_dolibarr_id);
    const cle = cleDate(m.date_mouvement);
    if (r.dateMin === null || cle < cleDate(r.dateMin)) r.dateMin = m.date_mouvement;
    if (r.dateMax === null || cle > cleDate(r.dateMax)) r.dateMax = m.date_mouvement;
    if (m.annulation) r.annulations++;
    else if (m.type_mouvement === 0 || m.type_mouvement === 3) r.entrees++;
    else if (estConsommation(m)) r.consommations++;
    else if (estRetour(m)) r.retours++;
    if (entrepotMarche != null && m.entrepot_id !== entrepotMarche) r.horsEntrepotMarche++;
  }
  r.entrepots = [...entrepots.values()].sort((a, b) => b.lignes - a.lignes || a.id - b.id);
  r.produits = produits.size;
  return r;
}

// Clé de comparaison des dates lues : les deux formes commencent par « AAAA-MM-JJ » et une heure.
const cleDate = (d: string) => d.replace('T', ' ').slice(0, 19);

// Ce qui part vers la base : les clés utiles, rien d'autre (même si un objet en portait davantage).
export function chargeImport(mouvements: MouvementLu[]): MouvementLu[] {
  return mouvements.map((m) => Object.fromEntries(CLES_MOUVEMENT.map((k) => [k, m[k]])) as unknown as MouvementLu);
}

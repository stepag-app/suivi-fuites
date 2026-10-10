// Vérification du rapport journalier de recherche de fuites (src/lib/export/rapport-journalier.ts), sans
// navigateur ni base : fonctions pures (synthèse de v_balayage_journalier, regroupement par agent, arrondis,
// contenu du rapport), puis fabrication réelle de PDF et de classeurs Excel avec des données fictives
// (fond de plan factice dessiné ici, en Web Mercator comme MapLibre), contrôle du nombre de pages, des
// textes et des réglages d'impression.
//
// Usage (dans web/) : node scripts/verifier-rapport-journalier.mjs [dossier de sortie]
// Node 22.18 ou plus (types TypeScript retirés à la volée). Si pdftoppm (poppler) est installé, les deux
// premières pages de chaque PDF sont rendues en PNG dans le dossier de sortie, pour les regarder.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, inflateSync } from 'node:zlib';

// Modules du panneau : alias « @/ », imports sans extension, fichiers .ts en module ES.
const SRC = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, suivant) {
    const alias = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : null;
    const relatif = specifier.startsWith('.') && context.parentURL?.endsWith('.ts') ? new URL(specifier, context.parentURL).href : null;
    let base = alias ?? relatif;
    if (base && !/\.[cm]?[jt]sx?$/.test(base)) {
      base = ['.ts', '.tsx', '/index.ts'].map((ext) => base + ext).find((u) => existsSync(fileURLToPath(u))) ?? base;
    }
    const r = suivant(base ?? specifier, context);
    return r.url.endsWith('.ts') && r.url.startsWith(SRC.href) ? { ...r, format: 'module-typescript' } : r;
  },
});
const rj = await import('../src/lib/export/rapport-journalier.ts');
const { unzipSync, strFromU8 } = await import('fflate');

const sortie = process.argv[2] ?? join(tmpdir(), 'verification-rapport-journalier');
mkdirSync(sortie, { recursive: true });

let echecs = 0;
let total = 0;
const verifier = (nom, ok, detail = '') => {
  total++;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok ' : '  ÉCHEC'} ${nom}${detail ? ` : ${detail}` : ''}`);
};
const lance = (f) => { try { f(); return null; } catch (e) { return e; } };

// ---------------------------------------------------------------------------
// Données fictives (aucune donnée réelle ; dates calculées à partir d'aujourd'hui)
// ---------------------------------------------------------------------------
const { jourMaroc } = await import('../src/lib/heure-maroc.ts');
const JOUR = jourMaroc(new Date());
const VEILLE = jourMaroc(new Date(Date.now() - 86400000));
const ANNEE = new Date().getFullYear();

const L = (o) => ({
  marche_id: 'm-essai', date_balayage: JOUR, agent_id: 'a1', agent: 'Agent Alpha',
  zone_id: 'z4', zone: 'Zone 4 Essai', secteur_id: 's-lh', secteur: 'Secteur Haut', nb_troncons: 0, lineaire_m: 0,
  lineaire_repasse_m: 0, nb_noeuds: 0, nb_fuites: 0, ...o,
});
const lignes = [
  // Numeric de PostgreSQL parfois reçu en texte : accepté.
  L({ nb_troncons: 12, lineaire_m: '1234.40', nb_noeuds: 10, nb_fuites: 3 }),
  L({ agent_id: 'a2', agent: 'Agent Bravo', nb_troncons: 8, lineaire_m: 1000.4, lineaire_repasse_m: '120.50', nb_noeuds: 6, nb_fuites: 3 }),
  L({ agent_id: 'a3', agent: 'Agent Charlie', secteur_id: 's-ag', secteur: 'Secteur Gare',
    nb_troncons: 15, lineaire_m: 2100.25, nb_noeuds: 14, nb_fuites: 1 }),
  L({ agent_id: 'a3', agent: 'Agent Charlie', zone_id: 'z2', zone: 'Zone 2 Essai',
    secteur_id: null, secteur: null, nb_troncons: 2, lineaire_m: 150.1, nb_noeuds: 1, nb_fuites: 0 }),
];
const veille = L({ date_balayage: VEILLE, nb_troncons: 5, lineaire_m: 800, nb_fuites: 1 });

const CENTRE = { lat: 34.6814, lon: -1.9086 };
const F = (o) => ({
  numero: null, reference_srm: null, adresse: null, zone: 'Zone 4 Essai', secteur_id: 's-lh', secteur: 'Secteur Haut', auteur_terrain_id: 'a1',
  visibilite: 'invisible', diametre_mm: null, materiau: null, revetement: null, latitude: null, longitude: null, ...o,
});
const fuites = [
  F({ numero: 101, reference_srm: '900-000-101', adresse: 'Rue d\'essai n° 12', diametre_mm: 63, materiau: 'polyethylene', revetement: 'Carrelage',
    latitude: CENTRE.lat + 0.0012, longitude: CENTRE.lon - 0.0021 }),
  F({ numero: 102, reference_srm: '900-000-102', adresse: 'Avenue fictive, angle rue B', visibilite: 'visible', diametre_mm: '110', materiau: 'PVC',
    revetement: 'Béton', latitude: CENTRE.lat - 0.0008, longitude: CENTRE.lon + 0.0015 }),
  F({ numero: 103, reference_srm: '900-000-103', auteur_terrain_id: null, secteur_id: 's-ag', secteur: 'Secteur Gare', zone: 'Zone 4 Essai',
    latitude: CENTRE.lat + 0.0025, longitude: CENTRE.lon + 0.0030 }),
  F({ numero: 104, reference_srm: '900-000-104', auteur_terrain_id: 'a3', adresse: 'Impasse d\'essai', visibilite: null,
    latitude: CENTRE.lat - 0.0022, longitude: CENTRE.lon - 0.0034 }),
  F({ numero: 105, reference_srm: '900-000-105', auteur_terrain_id: 'a2', revetement: 'Asphalte', latitude: CENTRE.lat + 0.03, longitude: CENTRE.lon }),
  F({ numero: 106, reference_srm: '900-000-106', auteur_terrain_id: null, secteur_id: null, secteur: null, zone: null }),
];

// ---------------------------------------------------------------------------
// 1. Fonctions pures
// ---------------------------------------------------------------------------
console.log('\nFonctions pures');
const s = rj.syntheseJournee(lignes, { date: JOUR });
const lh = s.lignes.find((l) => l.secteur_id === 's-lh');
verifier('synthèse : une ligne par zone et secteur', s.lignes.length === 3, s.lignes.map((l) => `${l.zone}/${l.secteur ?? '—'}`).join(' ; '));
verifier('synthèse : agents d\'un même secteur additionnés', lh.nb_troncons === 20 && Math.abs(lh.lineaire_m - 2234.8) < 1e-9 && lh.nb_noeuds === 16,
  `${lh.nb_troncons} tronçons, ${lh.lineaire_m} m, ${lh.nb_noeuds} nœuds`);
verifier('synthèse : nb_fuites pris une fois par secteur (pas une fois par agent)', lh.nb_fuites === 3 && s.totaux.nb_fuites === 4, `${lh.nb_fuites} / ${s.totaux.nb_fuites}`);
verifier('repasse exclue du linéaire payé', Math.abs(s.totaux.lineaire_m - 4485.15) < 1e-9 && s.totaux.lineaire_repasse_m === 120.5,
  `${s.totaux.lineaire_m} m payés, ${s.totaux.lineaire_repasse_m} m repassés`);
verifier('km arrondis au mètre, 3 décimales', s.totaux.lineaire_km === 4.485 && s.totaux.lineaire_repasse_km === 0.121 && rj.kmArrondis(4249.57) === 4.25,
  `${s.totaux.lineaire_km} km, repasse ${s.totaux.lineaire_repasse_km} km`);
verifier('arrondi après la somme des mètres (pas de cumul d\'arrondis)', rj.kmArrondis(lh.lineaire_m) === 2.235 && rj.kmArrondis(1234.4) + rj.kmArrondis(1000.4) === 2.234);
verifier('plusieurs secteurs : zones et secteurs distincts, ordonnés', s.zones.join('|') === 'Zone 2 Essai|Zone 4 Essai'
  && s.secteurs.join('|') === `${rj.HORS_SECTEUR}|Secteur Gare|Secteur Haut`, `${s.zones.join(', ')} · ${s.secteurs.join(', ')}`);
verifier('agents distincts, plus d\'équipe (S12)', s.agents.join('|') === 'Agent Alpha|Agent Bravo|Agent Charlie' && !('equipes' in s));
verifier('linéaire par agent', s.parAgent.map((a) => `${a.libelle}=${a.lineaire_km}`).join(' ') === 'Agent Alpha=1.234 Agent Bravo=1 Agent Charlie=2.25',
  s.parAgent.map((a) => `${a.libelle} ${a.lineaire_km} km`).join(', '));
const s1 = rj.syntheseJournee([...lignes, veille], { date: JOUR, agentId: 'a1' });
verifier('filtre par date et par agent', s1.lignes.length === 1 && s1.agents.length === 1 && Math.abs(s1.totaux.lineaire_m - 1234.4) < 1e-9);
const erreur = lance(() => rj.syntheseJournee([...lignes, veille]));
verifier('lignes de plusieurs journées sans date : refus explicite', erreur instanceof Error && /2 journées/.test(erreur.message), erreur?.message);
const sv = rj.syntheseJournee([], { date: JOUR });
verifier('journée sans balayage : synthèse vide datée', sv.date === JOUR && sv.lignes.length === 0 && sv.totaux.lineaire_km === 0 && sv.agents.length === 0);

const g = rj.regrouperParAgent(lignes, fuites, { date: JOUR });
const num = (t) => t.map((f) => f.numero).join(',');
verifier('un rapport par agent', g.rapports.length === 3 && g.rapports.map((r) => r.agent.libelle).join('|') === 'Agent Alpha|Agent Bravo|Agent Charlie');
verifier('fuites attribuées : agent qui l\'a détectée, sinon seul secteur balayé',
  num(g.rapports[0].fuites) === '101,102' && num(g.rapports[1].fuites) === '105' && num(g.rapports[2].fuites) === '103,104'
  && num(g.fuitesNonAttribuees) === '106',
  `A ${num(g.rapports[0].fuites)} · B ${num(g.rapports[1].fuites)} · C ${num(g.rapports[2].fuites)} · non attribuées ${num(g.fuitesNonAttribuees)}`);
verifier('rapport d\'agent : linéaire de l\'agent seulement', g.rapports[2].journee.totaux.lineaire_km === 2.25 && g.rapports[2].journee.lignes.length === 2);
const gs = rj.regrouperParAgent(lignes, fuites, { date: JOUR, parSecteur: true });
verifier('par agent et secteur', gs.rapports.length === 4 && num(gs.fuitesNonAttribuees) === '104,106'
  && num(gs.rapports.find((r) => r.secteur?.id === 's-ag').fuites) === '103', gs.rapports.map((r) => `${r.agent.libelle}/${r.secteur.libelle}`).join(' ; '));
const sansAuteur = rj.regrouperParAgent(lignes, [F({ numero: 107, auteur_terrain_id: null })], { date: JOUR });
verifier('fuite sans auteur dans un secteur balayé par deux agents : non attribuée', num(sansAuteur.fuitesNonAttribuees) === '107');
verifier('journée en toutes lettres (1er du mois)', rj.jourEnLettres(`${ANNEE}-03-01`).endsWith(`1er mars ${ANNEE}`) && /^[a-z]+ \d/.test(rj.jourEnLettres(JOUR)),
  `${rj.jourEnLettres(`${ANNEE}-03-01`)} ; ${rj.jourEnLettres(JOUR)}`);

// Contexte du marché fictif : libellés du titulaire, du client et de la référence lus dans la fiche.
function png(l, h, rgb, alpha = false) {
  const canaux = alpha ? 4 : 3;
  const brut = Buffer.alloc((l * canaux + 1) * h);
  for (let y = 0; y < h; y++) rgb.copy(brut, y * (l * canaux + 1) + 1, y * l * canaux, (y + 1) * l * canaux);
  const bloc = (type, data) => {
    const t = Buffer.from(type);
    const n = Buffer.alloc(4); n.writeUInt32BE(data.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0);
    return Buffer.concat([n, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloc('IHDR', ihdr), bloc('IDAT', deflateSync(brut)), bloc('IEND', Buffer.alloc(0))]);
}
const aplat = (l, h, c) => { const b = Buffer.alloc(l * h * 3); for (let i = 0; i < l * h; i++) b.set(c, i * 3); return b; };
const logo = (c) => ({ donnees: `data:image/png;base64,${png(240, 80, aplat(240, 80, c)).toString('base64')}`, format: 'PNG', largeur: 240, hauteur: 80 });

const ctx = {
  marche: {
    id: 'm-essai', code: 'ESSAI', numero: 'ESSAI-0001', intitule: 'Travaux fictifs de détection et de réparation de fuites (démonstration)',
    client: 'Régie d\'essai des eaux', client_sigle: 'R.E', client_direction: 'Direction d\'essai', titulaire_nom: 'Entreprise Essai SARL',
    titulaire_adresse: 'Adresse fictive', libelle_reference: 'Référence client essai',
  },
  osCommencement: null, os: [], regles: null, peutMontants: false,
  logos: { titulaire: logo([11, 93, 138]), maitreOuvrage: logo([37, 111, 58]) },
};

const c = rj.contenuRapportJournalier(ctx, s, fuites);
verifier('visas et société lus dans la fiche du marché', c.visas.join('|') === 'Entreprise Essai SARL|R.E' && c.societe === 'Entreprise Essai SARL');
verifier('libellé de la référence du marché', c.libelleAdresse === 'Adresse ou référence client essai', c.libelleAdresse);
verifier('plusieurs secteurs : colonne Secteur et détail par secteur', c.avecSecteur && c.detailSecteurs?.length === 3
  && c.detailSecteurs.map((l) => l.fuites).join(',') === '0,1,4' && c.fuitesHorsSecteurs === 1, c.detailSecteurs?.map((l) => `${l.secteur ?? '—'}:${l.fuites}`).join(' '));
verifier('totaux visibles / invisibles', c.visibles === 1 && c.invisibles === 4 && c.nonPrecisees === 1, c.totalFuites);
verifier('linéaire repassé affiché à part', c.identification.some(([l, v]) => l === 'Linéaire repassé' && v.startsWith('0,121 km'))
  && c.identification.some(([l, v]) => l === 'Linéaire inspecté' && v.startsWith('4,485 km')));
const c2 = rj.contenuRapportJournalier(ctx, g.rapports[2].journee, []);
verifier('journée sans fuite : R.A.S, pas de repasse affichée', c2.fuites.length === 0 && /R\.A\.S/.test(c2.totalFuites)
  && !c2.identification.some(([l]) => l === 'Linéaire repassé'), c2.totalFuites);
const c3 = rj.contenuRapportJournalier(ctx, rj.syntheseJournee(lignes, { date: JOUR, agentId: 'a1' }), g.rapports[0].fuites.slice(0, 2), { visas: ['Visa A', 'Visa B', 'Visa C'] });
verifier('un seul secteur : ni colonne Secteur ni détail ; visas remplaçables', !c3.avecSecteur && c3.detailSecteurs === null && c3.visas.length === 3);
verifier('nom de fichier sûr', rj.nomFichierRapportJournalier(ctx, g.rapports[0].journee) === `rapport-journalier-ESSAI-${JOUR}-Agent-Alpha`,
  rj.nomFichierRapportJournalier(ctx, g.rapports[0].journee));

// ---------------------------------------------------------------------------
// 2. Fabrication réelle des fichiers
// ---------------------------------------------------------------------------
const MONDE = (z) => 512 * 2 ** z;
const xPx = (lon, z) => ((lon + 180) / 360) * MONDE(z);
const yPx = (lat, z) => (0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI)) * MONDE(z);
const lonPx = (x, z) => (x / MONDE(z)) * 360 - 180;
const latPx = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / MONDE(z))))) * 180 / Math.PI;

// Plan factice : îlots, conduites grises, conduites inspectées (vert) et repassées (bleu).
function planFactice(lCss, hCss, zoom, k = 2) {
  const l = lCss * k;
  const h = hCss * k;
  const img = aplat(l, h, [244, 243, 240]);
  const poser = (x, y, c) => {
    const [px, py] = [Math.round(x), Math.round(y)];
    if (px >= 0 && py >= 0 && px < l && py < h) img.set(c, (py * l + px) * 3);
  };
  const trait = (x0, y0, x1, y1, ep, c) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) for (let e = -ep; e <= ep; e++) {
      const x = x0 + ((x1 - x0) * i) / n; const y = y0 + ((y1 - y0) * i) / n;
      poser(x + (Math.abs(y1 - y0) > Math.abs(x1 - x0) ? e : 0), y + (Math.abs(y1 - y0) > Math.abs(x1 - x0) ? 0 : e), c);
    }
  };
  for (let x = 40; x < l; x += 170) trait(x, 0, x + 60, h, 2, [138, 151, 165]);
  for (let y = 30; y < h; y += 140) trait(0, y, l, y + 40, 2, [138, 151, 165]);
  trait(40 + 170 * 2, 0, 40 + 170 * 2 + 60, h * 0.7, 4, [37, 111, 58]);
  trait(0, 30 + 140 * 2, l * 0.8, 30 + 140 * 2 + 32, 4, [37, 111, 58]);
  trait(l * 0.2, 30 + 140 * 3, l * 0.6, 30 + 140 * 3 + 16, 4, [0, 100, 217]);
  const x0 = xPx(CENTRE.lon, zoom) - lCss / 2;
  const y0 = yPx(CENTRE.lat, zoom) - hCss / 2;
  return {
    donnees: png(l, h, img), type: 'PNG', largeurPx: l, hauteurPx: h, fondIndisponible: false,
    ouest: lonPx(x0, zoom), est: lonPx(x0 + lCss, zoom), nord: latPx(y0, zoom), sud: latPx(y0 + hCss, zoom),
  };
}

function lirePdf(octets) {
  const brut = Buffer.from(octets);
  const latin = brut.toString('latin1');
  const textes = [];
  for (const m of latin.matchAll(/stream\r?\n/g)) {
    const debut = m.index + m[0].length;
    const fin = latin.indexOf('endstream', debut);
    try { textes.push(inflateSync(brut.subarray(debut, fin)).toString('latin1')); } catch { /* image ou flux non compressé */ }
  }
  const texte = textes.join('\n').replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\([()\\])/g, '$1');
  return {
    texte,
    pages: [...latin.matchAll(/\/Type \/Page\b(?!s)/g)].length,
    images: (latin.match(/\/Subtype \/Image/g) ?? []).length,
  };
}
const occurrences = (texte, t) => texte.split(`(${t}) Tj`).length - 1;
const pdftoppm = (() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const octetsDe = async (blob) => new Uint8Array(await blob.arrayBuffer());

async function fabriquer(nom, journee, liste, options = {}) {
  const debut = performance.now();
  const blob = await rj.genererRapportJournalierPdf(ctx, journee, liste, { genereLe: new Date(), ...options });
  const octets = await octetsDe(blob);
  const fichier = join(sortie, `${nom}.pdf`);
  writeFileSync(fichier, octets);
  const lu = lirePdf(octets);
  console.log(`  ${fichier} (${(octets.byteLength / 1024).toFixed(0)} Ko, ${lu.pages} page(s), ${(performance.now() - debut).toFixed(0)} ms)`);
  if (pdftoppm) execFileSync('pdftoppm', ['-r', '60', '-png', '-f', '1', '-l', '2', fichier, join(sortie, nom)]);
  return { ...lu, octets: octets.byteLength, blob };
}

console.log('\nPDF : journée regroupée (3 agents, 3 secteurs, 6 fuites, extrait capturé)');
let cadreDemande = null;
const r1 = await fabriquer('rapport-regroupe', { ...s, commentaire: 'Balayage interrompu une heure (pluie). Repasse sur le secteur Haut à la demande du client.' }, fuites, {
  extrait: { capturer: async (l, h) => { cadreDemande = { l, h }; return planFactice(Math.round((l * 96) / 25.4), Math.round((h * 96) / 25.4), 15); } },
});
verifier('PDF : 2 pages (rapport, puis extrait A4)', r1.pages === 2, `${r1.pages}`);
verifier('PDF : taille raisonnable', r1.octets > 20000 && r1.octets < 1500000, `${(r1.octets / 1024).toFixed(0)} Ko`);
verifier('PDF : cadre de l\'extrait pleine largeur et haut', cadreDemande && Math.abs(cadreDemande.l - 186) < 0.01 && cadreDemande.h > 150,
  cadreDemande && `${cadreDemande.l.toFixed(0)} × ${cadreDemande.h.toFixed(0)} mm`);
verifier('PDF : titre, société, journée en lettres', r1.texte.includes(rj.TITRE_RAPPORT_JOURNALIER) && r1.texte.includes('Entreprise Essai SARL')
  && r1.texte.includes(rj.jourEnLettres(JOUR)));
verifier('PDF : en-tête du marché, noms portés par les logos', r1.texte.includes('Marché n° ESSAI-0001') && r1.texte.includes('Direction d\'essai')
  && !r1.texte.includes('Régie d\'essai des eaux'));
verifier('PDF : linéaires en km (payé, repassé)', r1.texte.includes('4,485 km (premiers passages)') && r1.texte.includes('0,121 km (non rémunéré)'));
verifier('PDF : tableau du gabarit et TOTAL', ['Canalisation prospectée', 'Calibre', 'Invisibles', 'dégradation', 'Fuites hors des secteurs balayés ce jour', 'TOTAL', '900-000-101']
  .every((t) => r1.texte.includes(t)) && r1.texte.includes('Total des fuites détectées : 6 (1 visible, 4 invisibles, 1 sans visibilité précisée)'));
verifier('PDF : commentaire et visas du marché', r1.texte.includes('COMMENTAIRE') && r1.texte.includes('Balayage interrompu')
  && occurrences(r1.texte, 'R.E') === 1 && !r1.texte.includes('S.R.M') && !r1.texte.includes('STEPAG'));
verifier('PDF : extrait avec légende, échelle, nord, coordonnées', ['Légende', 'Conduites inspectées ce jour', 'Échelle 1 :',
  'Coordonnées GPS (WGS84)', '© contributeurs OpenStreetMap'].every((t) => r1.texte.includes(t)) && /\(N\) Tj/.test(r1.texte)
  && (r1.texte.includes('Extrait du plan du réseau') || r1.texte.includes('EXTRAIT DU PLAN DU RÉSEAU'))
  && r1.texte.includes(`${CENTRE.lat.toFixed(6)}, ${CENTRE.lon.toFixed(6)}`));
verifier('PDF : fuites numérotées sur l\'extrait, hors cadre signalée', occurrences(r1.texte, '101') === 2 && occurrences(r1.texte, '105') === 1
  && r1.texte.includes('1 fuite hors du cadre'), `101 ×${occurrences(r1.texte, '101')}, 105 ×${occurrences(r1.texte, '105')}`);
verifier('PDF : logos et plan en images', r1.images >= 3, `${r1.images} image(s)`);
verifier('PDF : pied « Page n / N »', r1.texte.includes('Page 1 / 2') && r1.texte.includes('Page 2 / 2'));

console.log('\nPDF : rapport de l\'agent Alpha (un secteur, image fournie avec bornes)');
const zoom = 15.6;
const plan = planFactice(800, 560, zoom, 1);
const r2 = await fabriquer('rapport-agent-alpha', g.rapports[0].journee, g.rapports[0].fuites, {
  extrait: { image: { dataUrl: `data:image/png;base64,${Buffer.from(plan.donnees).toString('base64')}`, largeurPx: 800, hauteurPx: 560, bornes: plan }, attribution: null },
});
verifier('PDF agent : 2 pages, pas de colonne Secteur', r2.pages === 2 && !r2.texte.includes('(Secteur) Tj'), `${r2.pages}`);
verifier('PDF agent : linéaire de l\'agent, plus d\'équipe', r2.texte.includes('1,234 km (premiers passages)') && r2.texte.includes('Agent Alpha') && !r2.texte.includes('quipe N'));
verifier('PDF agent : extrait en page 2 sous l\'en-tête du marché, sans attribution imposée', r2.texte.includes('EXTRAIT DU PLAN DU RÉSEAU')
  && r2.texte.includes('Conduites inspectées et fuites détectées') && !r2.texte.includes('© contributeurs OpenStreetMap'));

console.log('\nPDF : journée sans fuite, extrait en bas de page');
const minimum = rj.GABARIT_JOURNALIER.hauteurMinExtraitBasDePage;
rj.GABARIT_JOURNALIER.hauteurMinExtraitBasDePage = 50;
const ctxSansLogo = ctx.logos;
ctx.logos = undefined;
const r3 = await fabriquer('rapport-sans-fuite', s1, [], {
  extrait: { image: { dataUrl: `data:image/png;base64,${Buffer.from(plan.donnees).toString('base64')}`, largeurPx: 800, hauteurPx: 560 }, centre: { latitude: CENTRE.lat, longitude: CENTRE.lon } },
});
rj.GABARIT_JOURNALIER.hauteurMinExtraitBasDePage = minimum;
ctx.logos = ctxSansLogo;
verifier('PDF sans fuite : R.A.S et TOTAL à zéro', r3.texte.includes('R.A.S : aucune fuite détectée ce jour') && r3.texte.includes('Total des fuites détectées : 0 (R.A.S)'));
verifier('PDF sans logo : noms du titulaire et du client écrits', r3.texte.includes('Entreprise Essai SARL') && r3.texte.includes('Régie d\'essai des eaux'));
verifier('PDF sans fuite : une page, extrait sous les visas, image non géoréférencée', r3.pages === 1 && r3.texte.includes('Extrait du plan du réseau')
  && r3.texte.includes('Échelle non fournie') && r3.texte.includes(`${CENTRE.lat.toFixed(6)}`), `${r3.pages} page(s)`);

console.log('\nPDF : arabe (composeur factice, le vrai compose dans le navigateur)');
const composes = [];
const composer = async (textes, taille) => new Map(textes.map((t, i) => {
  composes.push(t);
  return [t, { donnees: `data:image/png;base64,${png(60, 12, aplat(60, 12, [20, 35, 46])).toString('base64')}`, alias: `essai-ar-${taille}-${i}`, largeurMm: 20, hauteurMm: 4 }];
}));
ctx.marche.client_nom_ar = 'وكالة تجريبية';
const r4a = await fabriquer('rapport-arabe-logo', g.rapports[0].journee, [{ ...fuites[0], revetement: 'زليج' }], { composerArabe: composer });
verifier('PDF arabe : nom arabe du client porté par son logo, cellule composée', !composes.includes('وكالة تجريبية') && composes.includes('زليج'),
  `${composes.length} texte(s), ${r4a.images} image(s)`);
composes.length = 0;
const logosEssai = ctx.logos;
ctx.logos = { titulaire: logosEssai.titulaire };
const r4 = await fabriquer('rapport-arabe', g.rapports[0].journee, [{ ...fuites[0], revetement: 'زليج' }], { composerArabe: composer });
ctx.logos = logosEssai;
delete ctx.marche.client_nom_ar;
verifier('PDF arabe sans logo du client : en-tête et cellule composés en images', composes.includes('وكالة تجريبية') && composes.includes('زليج') && r4.images >= 3,
  `${composes.length} texte(s), ${r4.images} image(s)`);

// Excel
console.log('\nExcel');
async function classeur(nom, journee, liste) {
  const octets = await octetsDe(await rj.genererRapportJournalierXlsx(ctx, journee, liste));
  const fichier = join(sortie, `${nom}.xlsx`);
  writeFileSync(fichier, octets);
  const zip = unzipSync(octets);
  const xml = Object.entries(zip).filter(([n]) => n.endsWith('.xml')).map(([, v]) => strFromU8(v)).join('\n');
  console.log(`  ${fichier} (${(octets.byteLength / 1024).toFixed(0)} Ko)`);
  return { octets: octets.byteLength, xml, feuille: strFromU8(zip['xl/worksheets/sheet1.xml']), classeur: strFromU8(zip['xl/workbook.xml']), zip };
}
const x1 = await classeur('rapport-regroupe', { ...s, commentaire: 'Commentaire d\'essai.' }, fuites);
verifier('Excel : taille et contenu', x1.octets > 5000 && [rj.TITRE_RAPPORT_JOURNALIER, 'Canalisation prospectée', 'TOTAL', 'Entreprise Essai SARL', 'R.E',
  '900-000-104', 'Commentaire d', 'Linéaire inspecté par zone et secteur'].every((t) => x1.xml.includes(t.replace(/'/g, '&apos;')) || x1.xml.includes(t)),
  `${(x1.octets / 1024).toFixed(0)} Ko`);
verifier('Excel : A4 portrait, une page en largeur, pied paginé', /<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"\/>/.test(x1.feuille)
  && x1.feuille.includes('fitToPage="1"') && x1.feuille.includes('Page &amp;P / &amp;N'));
verifier('Excel : titres du tableau répétés, cellules fusionnées, feuille nommée par la date', /_xlnm\.Print_Titles[^>]*>'[\d-]+'!\$\d+:\$\d+</.test(x1.classeur)
  && /<mergeCell ref=/.test(x1.feuille) && x1.classeur.includes(`name="${JOUR.split('-').reverse().join('-')}"`));
verifier('Excel : logos', Object.keys(x1.zip).filter((n) => n.startsWith('xl/media/')).length === 2);
const x2 = await classeur('rapport-sans-fuite', g.rapports[1].journee, []);
verifier('Excel sans fuite : R.A.S', x2.xml.includes('R.A.S : aucune fuite détectée ce jour'));

// ---------------------------------------------------------------------------
// 3. Période de plusieurs jours (lot C3) et rubriques à cocher (X7)
// ---------------------------------------------------------------------------
console.log('\nPériode (veille et jour)');
const toutes = [...lignes, veille];
const sp = rj.synthesePeriode(toutes, { du: VEILLE, au: JOUR });
const lhp = sp.lignes.find((l) => l.secteur_id === 's-lh');
verifier('période : un seul rapport, deux jours', rj.estPeriode(sp) && sp.date === VEILLE && sp.au === JOUR && sp.parJour?.length === 2,
  sp.parJour?.map((j) => `${j.date} ${j.nb_troncons} tronçons`).join(' ; '));
verifier('période : linéaires additionnés sur les jours', Math.abs(sp.totaux.lineaire_m - 5285.15) < 1e-9 && lhp.nb_troncons === 25,
  `${sp.totaux.lineaire_m} m, secteur Haut ${lhp.nb_troncons} tronçons`);
verifier('période : fuites de la vue additionnées jour après jour', lhp.nb_fuites === 4, `${lhp.nb_fuites}`);
verifier('période : bornes inversées acceptées', rj.synthesePeriode(toutes, { du: JOUR, au: VEILLE }).au === JOUR);
const sj = rj.synthesePeriode(toutes, { du: JOUR, au: JOUR });
verifier('Du = Au : rapport journalier identique', !rj.estPeriode(sj) && JSON.stringify(sj) === JSON.stringify(rj.syntheseJournee(toutes, { date: JOUR })));
const sansBalayage = lance(() => rj.synthesePeriode(toutes, { du: `${ANNEE - 5}-01-01`, au: `${ANNEE - 5}-01-31` }));
verifier('période sans balayage : refus explicite', sansBalayage instanceof Error && /Aucun balayage/.test(sansBalayage.message), sansBalayage?.message);
const fuitesPeriode = [...fuites.map((f) => ({ ...f, jour_detection: JOUR })), F({ numero: 99, reference_srm: '900-000-099', jour_detection: VEILLE, latitude: CENTRE.lat, longitude: CENTRE.lon })];
const cp = rj.contenuRapportJournalier(ctx, sp, fuitesPeriode);
verifier('période : identification « Période » et jours balayés, colonne de date', cp.periode && cp.avecDate
  && cp.identification.some(([l, v]) => l === 'Période' && v.includes(rj.jourEnLettres(VEILLE)) && v.includes(rj.jourEnLettres(JOUR)))
  && cp.identification.some(([l, v]) => l === 'Jours balayés' && v === '2') && cp.fuites[0].detectee === VEILLE.split('-').reverse().join('/'));
verifier('période : nom de fichier', rj.nomFichierRapportJournalier(ctx, sp) === `rapport-balayage-ESSAI-${VEILLE}-au-${JOUR}`, rj.nomFichierRapportJournalier(ctx, sp));

const rp = await fabriquer('rapport-periode', sp, fuitesPeriode, {
  extrait: { capturer: async (l, h) => planFactice(Math.round((l * 96) / 25.4), Math.round((h * 96) / 25.4), 15) },
});
verifier('PDF période : titre, linéaire par jour, colonne de date', rp.texte.includes(rj.TITRE_RAPPORT_PERIODE) && rp.texte.includes('Linéaire inspecté par jour')
  && rp.texte.includes('Détectée le') && rp.texte.includes('Total (2 jours)') && rp.texte.includes('5,285 km (premiers passages)'));
verifier('PDF période : toutes les zones, carte de la période', rp.texte.includes('Zone 2 Essai') && rp.texte.includes('Zone 4 Essai')
  && rp.texte.includes('Conduites inspectées sur la période') && rp.texte.includes('Fuites hors des secteurs balayés sur la période'));
verifier('PDF période : pied « période du … au … »', rp.texte.includes(`période du ${VEILLE.split('-').reverse().join('/')} au ${JOUR.split('-').reverse().join('/')}`));

const rr = await fabriquer('rapport-rubriques', sp, fuitesPeriode, {
  rubriques: new Set(['identification', 'detail_jours']),
  extrait: { capturer: async (l, h) => planFactice(Math.round((l * 96) / 25.4), Math.round((h * 96) / 25.4), 15) },
});
verifier('PDF rubriques : seulement identification et linéaire par jour', rr.pages === 1 && rr.texte.includes('Linéaire inspecté par jour')
  && !rr.texte.includes('Canalisation prospectée') && !rr.texte.includes('COMMENTAIRE') && !rr.texte.includes('Nom, date et signature')
  && !rr.texte.includes('Légende') && !rr.texte.includes('Linéaire inspecté par zone et secteur'), `${rr.pages} page(s)`);

const xp = await (async () => {
  const octets = await octetsDe(await rj.genererRapportJournalierXlsx(ctx, sp, fuitesPeriode));
  writeFileSync(join(sortie, 'rapport-periode.xlsx'), octets);
  const zip = unzipSync(octets);
  return { xml: Object.entries(zip).filter(([n]) => n.endsWith('.xml')).map(([, v]) => strFromU8(v)).join('\n'), classeur: strFromU8(zip['xl/workbook.xml']) };
})();
verifier('Excel période : un seul classeur, linéaire par jour, date des fuites', [rj.TITRE_RAPPORT_PERIODE, 'Linéaire inspecté par jour', 'Détectée le', 'Période']
  .every((t) => xp.xml.includes(t)) && xp.classeur.includes(`name="${VEILLE} au ${JOUR}"`));
const xr = await octetsDe(await rj.genererRapportJournalierXlsx(ctx, sp, fuitesPeriode, { rubriques: new Set(['fuites']) }));
const xrXml = Object.entries(unzipSync(xr)).filter(([n]) => n.endsWith('.xml')).map(([, v]) => strFromU8(v)).join('\n');
verifier('Excel rubriques : fuites seulement', xrXml.includes('Canalisation prospectée') && !xrXml.includes('COMMENTAIRE') && !xrXml.includes('Linéaire inspecté par jour'));

if (pdftoppm) console.log(`\nAperçus PNG (60 dpi, pages 1 et 2) : ${join(sortie, '*.png')}`);
console.log(`\nFichiers dans ${sortie}`);
console.log(echecs ? `\n${echecs} vérification(s) en échec sur ${total}.` : `\nLes ${total} vérifications sont passées.`);
process.exit(echecs ? 1 : 0);

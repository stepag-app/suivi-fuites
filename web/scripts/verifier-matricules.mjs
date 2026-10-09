// Vérification de R4 (chantier v2) : dans les documents imprimés ou exportés, le matricule remplace le nom des agents
// et des ouvriers ; le nom reste à l'écran. Sans navigateur ni base : règles de src/lib/export/matricules.ts, puis
// chargement réel des jeux d'export (liste des fuites, pièces posées) et des fiches du rapport par fuite sur le client
// de démonstration, et fabrication de vrais fichiers (CSV, Excel, Word, PDF) dont le texte est relu.
//
// Usage (dans web/) : node scripts/verifier-matricules.mjs (Node 22.18 ou plus).
import { existsSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

process.env.NEXT_PUBLIC_MODE_DEMO = '1';
const SRC = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, suivant) {
    const alias = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : null;
    const relatif = specifier.startsWith('.') && context.parentURL?.endsWith('.ts') ? new URL(specifier, context.parentURL).href : null;
    let base = alias ?? relatif;
    if (base && !/\.[cm]?[jt]sx?$/.test(base)) {
      base = ['.ts', '.tsx', '/index.ts'].map((ext) => base + ext).find((u) => existsSync(fileURLToPath(u))) ?? base;
    }
    // require (client de démonstration) : le résolveur CommonJS attend un chemin, pas une URL
    const cible = base && context.conditions?.includes('require') ? fileURLToPath(base) : base;
    const r = suivant(cible ?? specifier, context);
    return r.url.endsWith('.ts') && r.url.startsWith(SRC.href) ? { ...r, format: 'module-typescript' } : r;
  },
});
// supabase.ts charge le client de démonstration par require (comme dans Next)
globalThis.require = createRequire(new URL('lib/supabase.ts', SRC));

const m = await import('../src/lib/export/matricules.ts');
const demo = await import('../src/lib/demo/donnees.ts');
const { unzipSync, strFromU8 } = await import('fflate');

let echecs = 0;
let total = 0;
const verifier = (nom, ok, detail = '') => {
  total++;
  if (!ok) echecs++;
  console.log(`${ok ? '  ok ' : '  ÉCHEC'} ${nom}${detail ? ` : ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
// 1. Règles
// ---------------------------------------------------------------------------
const idx = m.indexMatricules(
  [
    { id: 'a1', nom_complet: 'EL AMRANI Karim', matricule: '1021' },
    { id: 'a2', nom_complet: 'RAHMOUNI Nadia', matricule: null },
    { id: 'a3', nom_complet: 'BENALI Youssef', matricule: '1022' },
    { id: 'a4', nom_complet: 'BENALI Youssef', matricule: '2040' },
  ],
  [{ id: 'o1', nom_complet: 'Rachid Bouzid', matricule: 'OUV-01' }, { id: 'o2', nom_complet: 'Omar Belkacem', matricule: null }],
);
verifier('agent : matricule à la place du nom', idx.agent('a1', 'EL AMRANI Karim') === '1021');
verifier('agent sans matricule : le nom est gardé', idx.agent('a2') === 'RAHMOUNI Nadia');
verifier('agent inconnu : nom de repli', idx.agent('zz', 'Agent X') === 'Agent X');
verifier('agent absent : rien', idx.agent(null) === null);
verifier('agent par nom : matricule', idx.agentParNom('EL AMRANI Karim') === '1021');
verifier('agent par nom, homonymes : nom gardé (pas de matricule au hasard)', idx.agentParNom('BENALI Youssef') === 'BENALI Youssef');
verifier('agent par nom inconnu : nom gardé', idx.agentParNom('Quelqu\'un') === 'Quelqu\'un');
verifier('ouvrier : matricule', idx.ouvrier('o1') === 'OUV-01');
verifier('ouvrier sans matricule : nom', idx.ouvrier('o2') === 'Omar Belkacem');

// ---------------------------------------------------------------------------
// 2. Chargement réel des exports (client de démonstration)
// ---------------------------------------------------------------------------
const jeux = await import('../src/lib/export/jeux.ts');
const MARCHE = demo.MARCHE_SRM;
const NOMS = ['EL AMRANI', 'ZEROUALI', 'BENALI', 'Karim', 'Youssef', 'Bouzid', 'Lahlou', 'Ziani', 'Mimouni'];
const contientNom = (texte) => NOMS.filter((n) => texte.includes(n));

const fuites = await jeux.JEU_FUITES.charger(MARCHE, { periode: 'tout' });
const detecteurs = new Set(fuites.map((l) => l.detectee_par));
const chefs = new Set(fuites.map((l) => l.chef_reparation).filter(Boolean));
verifier('liste des fuites : lignes lues', fuites.length > 10, `${fuites.length}`);
verifier('liste des fuites : « Détectée par » = matricules (ou nom si aucun matricule)',
  [...detecteurs].every((v) => ['1021', 'ST-07'].includes(v)), [...detecteurs].join(', '));
verifier('liste des fuites : chef d\'équipe = matricule', [...chefs].every((v) => v === '1022'), [...chefs].join(', '));
verifier('liste des fuites : titres de colonnes', jeux.JEU_FUITES.colonnes({ marche: {}, peutMontants: false }).some((c) => c.titre === 'Détectée par (matricule)'));

const pieces = await jeux.JEU_PIECES.charger(MARCHE, { periode: 'tout' });
verifier('pièces posées : chef d\'équipe = matricule', pieces.length > 0 && pieces.every((l) => l.chef === '1022'), `${pieces.length} pièces`);

// Fichiers réels : le texte des documents ne contient plus aucun nom d'agent
const ctx = { marche: { code: 'SRM-4500004453', numero: '4500004453', intitule: 'Essai' }, osCommencement: null, os: [], regles: null, peutMontants: false };
const doc = jeux.documentJeu(jeux.JEU_FUITES, fuites, ctx, {
  colonnes: ['numero', 'detectee_par', 'chef_reparation', 'equipe_reparation'], regroupement: 'aucun', filtres: { periode: 'tout' }, orientation: 'paysage',
});
const texteZip = async (blob) => Object.entries(unzipSync(new Uint8Array(await blob.arrayBuffer())))
  .filter(([n]) => n.endsWith('.xml')).map(([, v]) => strFromU8(v)).join('\n');
const { genererXlsx } = await import('../src/lib/export/xlsx.ts');
const { genererDocx } = await import('../src/lib/export/docx.ts');
const xlsx = await texteZip(await genererXlsx(doc));
verifier('Excel : matricules présents, aucun nom', xlsx.includes('1021') && contientNom(xlsx).length === 0, contientNom(xlsx).join(', '));
const docx = await texteZip(await genererDocx(doc));
verifier('Word : matricules présents, aucun nom', docx.includes('1021') && contientNom(docx).length === 0, contientNom(docx).join(', '));

// CSV : par le vrai aiguillage d'export, fichier intercepté au moment du téléchargement
const telecharges = [];
URL.createObjectURL = (blob) => { telecharges.push(blob); return 'blob:essai'; };
URL.revokeObjectURL = () => {};
globalThis.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
await (await import('../src/lib/export/generer.ts')).exporter(doc, 'csv');
const csv = await telecharges.at(-1).text();
verifier('CSV : matricules présents, aucun nom', csv.includes('1021') && contientNom(csv).length === 0, contientNom(csv).join(', '));

const { genererPdf } = await import('../src/lib/export/pdf.ts');
const pdf = Buffer.from(await (await genererPdf(doc)).arrayBuffer()).toString('latin1');
// Flux du PDF décompressés : jsPDF écrit les textes entre parenthèses
const flux = [...pdf.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map(([, f]) => {
  try { return inflateSync(Buffer.from(f, 'latin1')).toString('latin1'); } catch { return f; }
}).join('\n');
verifier('PDF : matricules présents, aucun nom', flux.includes('1021') && contientNom(flux).length === 0, contientNom(flux).join(', '));

// ---------------------------------------------------------------------------
// 3. Rapport par fuite : détection, chef d'équipe et ouvriers
// ---------------------------------------------------------------------------
const rf = await import('../src/lib/export/rapport-fuite.ts');
const avecRep = demo.vFuites.filter((f) => f.marche_id === MARCHE && f.derniere_reparation_le).slice(0, 5).map((f) => f.id);
const fiches = await rf.chargerFiches(avecRep, MARCHE, false);
const valeurs = fiches.flatMap((f) => [f.fuite.detectee_par, ...f.reparations.flatMap((r) => [r.chef, ...r.ouvriers])]);
verifier('rapport par fuite : fiches lues', fiches.length === avecRep.length, `${fiches.length}`);
verifier('rapport par fuite : aucun nom d\'agent ni d\'ouvrier ayant un matricule', contientNom(valeurs.join(' ')).length === 0, valeurs.join(', '));
verifier('rapport par fuite : ouvriers en matricules (OUV-…) ou nom faute de matricule',
  fiches.flatMap((f) => f.reparations.flatMap((r) => r.ouvriers)).every((o) => /^OUV-\d\d$/.test(o) || ['Omar Belkacem', 'Brahim Taleb'].includes(o)));

console.log(`\n${total - echecs} / ${total} vérifications réussies`);
process.exit(echecs ? 1 : 0);

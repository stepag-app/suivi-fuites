// Cartes ouvertes dans l'APK (Balayage, Carte terrain) : chaque libellé passé à tb() / tr() dans leurs fichiers a sa
// traduction arabe dans TRADUCTIONS_BALAYAGE, comme les statuts et les classes de diamètre affichés dans les calques ;
// règle des fuites prioritaires de la carte terrain.
// Lancement, dans web/ : node scripts/verifier-langue-carte.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url);
registerHooks({
  resolve(specifier, context, suivant) {
    const alias = specifier.startsWith('@/') ? new URL(specifier.slice(2), SRC).href : null;
    const relatif = specifier.startsWith('.') && context.parentURL?.endsWith('.ts') ? new URL(specifier, context.parentURL).href : null;
    const base = alias ?? relatif;
    if (base && !/\.[cm]?[jt]sx?$/.test(base)) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) if (existsSync(fileURLToPath(base + ext))) return suivant(base + ext, context);
    }
    return suivant(base ?? specifier, context);
  },
});

const { TRADUCTIONS_BALAYAGE: T, traduire } = await import('../src/lib/langue-apk.ts');
const { CLASSES_DIAMETRE } = await import('../src/lib/reseau/palette.ts');
const { estPrioritaire } = await import('../src/app/(app)/carte/commun.ts');

let n = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  n++;
};

// 1. Libellés littéraux des écrans de carte ouverts dans l'APK.
const FICHIERS = [
  'app/(app)/carte/CarteTerrain.tsx', 'app/(app)/carte/PanneauCalques.tsx', 'app/(app)/carte/Carte.tsx',
  'app/(app)/carte/details-carte.tsx', 'app/(app)/carte/PanneauReseau.tsx',
];
const manquants = [];
for (const f of FICHIERS) {
  const texte = readFileSync(new URL(f, SRC), 'utf8');
  for (const m of texte.matchAll(/\b(?:tb|tr)\(\s*(["'])((?:\\.|(?!\1).)*)\1/g)) {
    const cle = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"');
    if (!T[cle]) manquants.push(`${f} : « ${cle} »`);
  }
}
ok(manquants.length === 0, `libellés sans traduction arabe :\n${manquants.join('\n')}`);

// 2. Libellés composés : statuts (calques, bulle), classes de diamètre (légende).
const statuts = readFileSync(new URL('components/statut.tsx', SRC), 'utf8');
for (const m of statuts.matchAll(/libelle: "([^"]+)"/g)) ok(!!T[m[1]], `statut sans traduction : « ${m[1]} »`);
for (const c of CLASSES_DIAMETRE) ok(!!T[`Diamètre ${c.libelle}`], `classe sans traduction : « Diamètre ${c.libelle} »`);

// 3. Traduction : arabe, hybride (« Réfection » gardé), français inchangé, valeurs isolées en arabe.
ok(traduire('fr', 'Calques') === 'Calques', 'français : texte tel quel');
ok(traduire('ar', 'Calques') === '‏الطبقات', 'arabe : texte arabe, marque droite à gauche');
ok(traduire('hybride', 'Réfection chaussée hors délai').includes('Réfection'), 'hybride : « Réfection » gardé');
ok(traduire('ar', 'Position ± {n} m', { n: 12 }).includes('⁨12⁩'), 'arabe : valeur isolée');

// 4. Fuites prioritaires : en retard de réparation ou réfection de chaussée hors délai, rien d'autre.
const f = (x) => ({ alerte_non_reparee: false, refection_chaussee_hors_delai: false, alerte_communication_srm: false, alerte_refection_trottoir: false, ...x });
ok(estPrioritaire(f({ alerte_non_reparee: true })), 'prioritaire : non réparée au-delà du délai');
ok(estPrioritaire(f({ refection_chaussee_hors_delai: true })), 'prioritaire : réfection de chaussée hors délai');
ok(!estPrioritaire(f({ alerte_communication_srm: true, alerte_refection_trottoir: true })), 'pas prioritaire : alertes du bureau ou trottoir');

console.log(`${n} vérifications réussies.`);

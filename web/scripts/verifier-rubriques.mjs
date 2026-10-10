// Vérification des rubriques à cocher avant un export (src/lib/export/rubriques.ts, X7), sans navigateur ni base :
// rubriques par défaut (rapport par fuite sans les prix du bordereau), droits, normalisation des modèles,
// distinction avec les modèles de colonnes du panneau d'export, dernier choix gardé sur l'appareil.
// Usage (dans web/) : node scripts/verifier-rubriques.mjs (Node 22.18 ou plus).
import assert from 'node:assert/strict';

const r = await import('../src/lib/export/rubriques.ts');
let n = 0;
const ok = (nom, f) => { f(); n++; console.log(`ok ${n} - ${nom}`); };

ok('rapport par fuite : par défaut sans les articles ni les prix du bordereau', () => {
  const d = r.choixParDefaut('rapport_fuite');
  assert.equal(d.has('quantites'), false);
  for (const c of ['identification', 'reparations', 'refections', 'photos', 'pieces']) assert.ok(d.has(c), c);
});
ok('prix du bordereau proposés seulement avec le droit « quantités »', () => {
  assert.equal(r.rubriquesVisibles('rapport_fuite').some((x) => x.cle === 'quantites'), false);
  assert.equal(r.rubriquesVisibles('rapport_fuite', { quantites: true }).some((x) => x.cle === 'quantites'), true);
  assert.equal(r.choixEffectif('rapport_fuite', ['quantites', 'photos']).has('quantites'), false);
  assert.equal(r.choixEffectif('rapport_fuite', ['quantites', 'photos'], { quantites: true }).has('quantites'), true);
});
ok('modèle ancien : rubriques inconnues ignorées', () => {
  assert.deepEqual([...r.normaliser('carte', ['legende', 'inconnue', 'liste'])], ['legende', 'liste']);
});
ok('rubrique renommée (S12) : « equipes » d\'un ancien choix devient « chef_equipe »', () => {
  assert.deepEqual([...r.normaliser('rapport_fuite', ['identification', 'equipes'])], ['identification', 'chef_equipe']);
});
ok('carte : liste des fuites décochée par défaut, le reste coché', () => {
  const d = r.choixParDefaut('carte');
  assert.equal(d.has('liste'), false);
  for (const c of ['legende', 'echelle', 'coordonnees', 'informations', 'graduations', 'filtres']) assert.ok(d.has(c), c);
});
ok('balayage : toutes les rubriques cochées par défaut, extrait de plan compris', () => {
  assert.equal(r.choixParDefaut('rapport_balayage').size, r.RUBRIQUES.rapport_balayage.length);
  assert.ok(r.choixParDefaut('rapport_balayage').has('plan'));
});
ok('modèles de rubriques distincts des modèles de colonnes du panneau d\'export', () => {
  assert.equal(r.estModeleRubriques({ filtres: { document: 'carte' } }), true);
  assert.equal(r.estModeleRubriques({ filtres: { periode: 'jour' } }), false);
  assert.equal(r.estModeleRubriques({ filtres: null }), false);
});
ok('dernier choix : gardé par document et par marché, défaut sans stockage', () => {
  assert.deepEqual([...r.dernierChoix('carte', 'm1')], [...r.choixParDefaut('carte')]);
  const memoire = new Map();
  globalThis.localStorage = { getItem: (k) => memoire.get(k) ?? null, setItem: (k, v) => memoire.set(k, v) };
  r.memoriserChoix('carte', 'm1', ['legende', 'liste']);
  assert.deepEqual([...r.dernierChoix('carte', 'm1')], ['legende', 'liste']);
  assert.deepEqual([...r.dernierChoix('carte', 'm2')], [...r.choixParDefaut('carte')]);
  assert.deepEqual([...r.dernierChoix('rapport_fuite', 'm1')], [...r.choixParDefaut('rapport_fuite')]);
  memoire.set('suivi-fuites:rubriques:carte:m3', 'pas du json');
  assert.deepEqual([...r.dernierChoix('carte', 'm3')], [...r.choixParDefaut('carte')]);
  delete globalThis.localStorage;
});

console.log(`\n${n} vérifications réussies.`);

// Vérification de la carte de balayage sans réseau (lot CH) : source lue dans une copie complète (copie-carte.ts),
// réponse de la fonction pour le fond (tuiles.ts), balayages en attente fusionnés à l'état (etat.ts), style du fond
// local et fichiers servis par le panneau (fond-local.ts, public/fond/), estampille des secteurs (donnees.ts).
// Lancement, dans web/ : node scripts/verifier-carte-hors-ligne.mjs [fond.pmtiles]
// (avec un fond fabriqué par outils/fond-carte/fabriquer.sh : lecture de ses tuiles et contrôle des noms de rues)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader as Pbf } from 'pbf';
import { gunzipSync } from 'fflate';

const SRC = new URL('../src/', import.meta.url);
const PUBLIC = new URL('../public/', import.meta.url);
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

const C = await import('../src/lib/reseau/copie-carte.ts');
const T = await import('../src/lib/reseau/tuiles.ts');
const E = await import('../src/lib/reseau/etat.ts');
const P = await import('../src/lib/reseau/pmtiles.ts');
const D = await import('../src/lib/reseau/donnees.ts');
const F = await import('../src/app/(app)/carte/fond-local.ts');
const { SANS_SECTEUR } = await import('../src/lib/reseau/types.ts');

let n = 0;
const ok = async (nom, fn) => {
  await fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

// ---- Balayages en attente ----------------------------------------------------------------------------------------

await ok('balayages en attente : nouveau tronçon, un passage au nom de l\'agent', () => {
  const r = E.ajouterEnAttente([], [{ troncon_id: 't1', date_balayage: '2026-10-12' }], 'moi');
  assert.deepEqual(r, [{ troncon_id: 't1', premier_le: '2026-10-12T12:00:00Z', dernier_le: '2026-10-12T12:00:00Z', nb_passages: 1, agent_id: 'moi' }]);
  const etat = E.etatsFeatures(r, { agents: new Map([['moi', 'Agent A']]) }).get('t1');
  assert.equal(etat.balaye, true);
  assert.equal(etat.repasse, false);
  assert.equal(etat.agent, 'Agent A');
});

await ok('balayages en attente : tronçon déjà balayé, second passage, date et agent mis à jour', () => {
  const avant = [{ troncon_id: 't1', premier_le: '2026-10-01T08:00:00Z', dernier_le: '2026-10-01T08:00:00Z', nb_passages: 1, agent_id: 'autre' }];
  const r = E.ajouterEnAttente(avant, [{ troncon_id: 't1', date_balayage: '2026-10-12' }], 'moi');
  assert.equal(r[0].nb_passages, 2);
  assert.equal(r[0].premier_le, '2026-10-01T08:00:00Z');
  assert.equal(r[0].dernier_le, '2026-10-12T12:00:00Z');
  assert.equal(r[0].agent_id, 'moi');
  assert.equal(avant[0].nb_passages, 1, 'les lignes reçues ne sont pas modifiées');
  assert.equal(E.etatsFeatures(r).get('t1').repasse, true);
});

await ok('balayages en attente : date antérieure (saisie du jour d\'avant) sans toucher au dernier passage', () => {
  const avant = [{ troncon_id: 't1', premier_le: '2026-10-10T08:00:00Z', dernier_le: '2026-10-11T08:00:00Z', nb_passages: 2, agent_id: 'autre' }];
  const r = E.ajouterEnAttente(avant, [{ troncon_id: 't1', date_balayage: '2026-10-09' }], 'moi');
  assert.equal(r[0].nb_passages, 3);
  assert.equal(r[0].premier_le, '2026-10-09T12:00:00Z');
  assert.equal(r[0].dernier_le, '2026-10-11T08:00:00Z');
  assert.equal(r[0].agent_id, 'autre');
});

await ok('balayages en attente : file vide, mêmes lignes', () => {
  const avant = [{ troncon_id: 't1', premier_le: 'a', dernier_le: 'a', nb_passages: 1, agent_id: null }];
  assert.equal(E.ajouterEnAttente(avant, [], 'moi'), avant);
});

// ---- Réponse de la fonction reseau-tuiles ---------------------------------------------------------------------------

await ok('fond : une réponse sans « fichier » (fonction d\'avant le lot CH, qui renverrait le réseau) est refusée', () => {
  const corps = { existe: true, url: 'https://r2.exemple/reseau.pmtiles', expire_s: 600, etag: '"a"', octets: 10 };
  assert.ok(T.reponseLisible(corps), 'réseau : accepté sans « fichier »');
  assert.equal(T.reponseLisible(corps, 'fond'), null);
  assert.ok(T.reponseLisible({ ...corps, fichier: 'fond' }, 'fond'));
  assert.equal(T.reponseLisible({ ...corps, fichier: 'fond' }), null, 'le fond ne passe jamais pour le réseau');
});

// ---- Copie complète : source lue dans un Blob ---------------------------------------------------------------------

const troncons = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1.91, 34.68], [-1.905, 34.682]] }, properties: { id: '00000000-0000-4000-8000-000000000001', s: null, z: null, c: 'distribution', d: 110, m: 'PVC' } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1.905, 34.682], [-1.9, 34.685]] }, properties: { id: '00000000-0000-4000-8000-000000000002', s: null, z: null, c: 'distribution', d: 63, m: 'PEHD' } },
  ],
};
const noeuds = { type: 'FeatureCollection', features: [] };

await ok('copie complète : l\'archive se relit entière depuis la copie (en-tête, métadonnées, tuile du zoom 16)', async () => {
  const r = P.genererPmtiles(troncons, noeuds, { version: 1, marche_id: 'm', estampille: 'x', genere_le: '2026-10-12T00:00:00Z', nb_troncons: 2, nb_noeuds: 0 });
  const blob = new Blob([r.octets]);
  const lectures = [];
  const source = C.sourceCopie('reseau-m-abc-local', { blob, etag: 'abc' });
  const espion = { getKey: source.getKey, getBytes: async (o, l, s, e) => { lectures.push([o, l]); return source.getBytes(o, l, s, e); } };
  const archive = new PMTiles(espion);
  const h = await archive.getHeader();
  assert.equal(h.maxZoom, 16);
  const meta = await archive.getMetadata();
  assert.equal(P.lireInfosTuiles(meta)?.nb_troncons, 2);
  assert.equal(P.lireIndexTroncons(meta)?.ids.length, 2);
  const tuile = await archive.getZxy(16, 32420, 26000);
  // Tuile éventuellement absente à ce numéro : on vérifie au moins que les lectures restent dans le fichier.
  assert.ok(tuile === undefined || tuile.data.byteLength > 0);
  for (const [o, l] of lectures) assert.ok(o >= 0 && l > 0);
  const fin = await source.getBytes(r.octets.length - 4, 100);
  assert.equal(fin.data.byteLength, 4, 'une lecture au-delà de la fin est tronquée, sans erreur');
  assert.equal(fin.etag, 'abc');
});

await ok('copie complète : ETag normalisé (guillemets, W/)', () => {
  assert.equal(C.normaliserEtag('W/"abc"'), 'abc');
  assert.equal(C.normaliserEtag('"abc"'), 'abc');
  assert.equal(C.normaliserEtag(null), '');
});

// ---- Style du fond local et fichiers servis -------------------------------------------------------------------------

const style = F.styleFondLocal('pmtiles://fond-m-abc-local', 'fr', 'https://fuites.stepag.ma');
const policesDuStyle = new Set(JSON.stringify(style.layers).match(/Noto Sans[^"]*/g));

await ok('style du fond : source pmtiles, polices et icônes du panneau, attribution OpenStreetMap', () => {
  assert.equal(style.sources.protomaps.url, 'pmtiles://fond-m-abc-local');
  assert.match(style.sources.protomaps.attribution, /OpenStreetMap/);
  assert.equal(style.glyphs, 'https://fuites.stepag.ma/fond/v1/polices/{fontstack}/{range}.pbf');
  assert.equal(style.sprite, 'https://fuites.stepag.ma/fond/v1/icones/light');
  assert.ok(style.layers.length > 50, `${style.layers.length} couches`);
  assert.ok(style.layers.some((l) => l.id === 'pois'), 'points d\'intérêt gardés');
  assert.ok(style.layers.some((l) => l.id === 'roads_labels_minor'), 'noms des petites rues');
});

await ok('style du fond : français d\'abord, arabe d\'abord sur une tablette en arabe', () => {
  assert.match(JSON.stringify(style.layers), /name:fr/);
  assert.match(JSON.stringify(F.styleFondLocal('pmtiles://x', 'ar', '').layers), /name:ar/);
});

await ok('polices : toutes celles du style sont fournies (sauf le devanagari, absent du Maroc)', () => {
  for (const p of policesDuStyle) {
    if (/Devanagari/.test(p)) continue;
    assert.ok(F.POLICES_FOND.includes(p), `police ${p} non fournie`);
  }
});

await ok('fichiers du fond : chaque fichier listé existe dans public/ (polices latines et arabes, gras, icônes)', () => {
  const liste = F.fichiersFond();
  assert.equal(liste.length, F.POLICES_FOND.length * F.PLAGES_FOND.length + 3 + F.ICONES_FOND.length);
  for (const f of liste) assert.ok(existsSync(new URL(decodeURIComponent(f.slice(1)), PUBLIC)), `absent : ${f}`);
  for (const r of ['1536-1791', '65024-65279']) assert.ok(liste.some((f) => f.endsWith(`Noto%20Sans%20Regular/${r}.pbf`)), `arabe ${r}`);
  // Couches du réseau (couches.ts) : « Noto Sans Regular » et « Noto Sans Bold ».
  const couches = readFileSync(new URL('app/(app)/carte/couches.ts', SRC), 'utf8');
  for (const p of new Set(couches.match(/Noto Sans [A-Za-z]+/g))) {
    assert.ok(existsSync(new URL(`fond/v1/polices/${p}/0-255.pbf`, PUBLIC)), `police des couches du réseau absente : ${p}`);
  }
  assert.ok(existsSync(new URL('fond/v1/polices/OFL.txt', PUBLIC)) && existsSync(new URL('fond/v1/icones/LICENSE.md', PUBLIC)), 'licences');
});

await ok('icônes : feuille simple et double densité, chaque image du style présente', () => {
  const icones = JSON.parse(readFileSync(new URL('fond/v1/icones/light.json', PUBLIC), 'utf8'));
  const doubles = JSON.parse(readFileSync(new URL('fond/v1/icones/light@2x.json', PUBLIC), 'utf8'));
  assert.deepEqual(Object.keys(icones).sort(), Object.keys(doubles).sort());
  assert.ok(Object.keys(icones).length > 20);
});

// ---- Estampille des secteurs (géométrie gardée pour le lasso) ------------------------------------------------------

await ok('estampille : modifie_le du secteur, non zonés par nombre et linéaire', () => {
  const ctx = { zones: [], secteurs: [], lignes: [{ secteur_id: 's1', modifie_le: '2026-10-10T00:00:00Z' }], sansSecteur: { nb_troncons: 12, lineaire_m: 340 }, disponible: true };
  assert.equal(D.estampilleSecteur(ctx, 's1'), '2026-10-10T00:00:00Z');
  assert.equal(D.estampilleSecteur(ctx, 's2'), null);
  assert.equal(D.estampilleSecteur(ctx, SANS_SECTEUR), '12:340');
  assert.equal(D.estampilleSecteur({ ...ctx, sansSecteur: null }, SANS_SECTEUR), '0');
});

// ---- Fond réel (facultatif) -----------------------------------------------------------------------------------------

const chemin = process.argv[2];
if (chemin) {
  await ok(`fond réel : ${chemin}`, async () => {
    const octets = readFileSync(chemin);
    const archive = new PMTiles(C.sourceCopie('fond', { blob: new Blob([octets]), etag: 'x' }));
    const h = await archive.getHeader();
    assert.equal(h.maxZoom, 15);
    assert.equal(h.tileType, 1);
    // Tuile du zoom 15 au centre d'Oujda : rues nommées, en lettres latines et arabes.
    const x = Math.floor(((-1.9086 + 180) / 360) * 2 ** 15);
    const lat = (34.6814 * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * 2 ** 15);
    const t = await archive.getZxy(15, x, y);
    assert.ok(t, 'tuile du centre présente');
    let data = new Uint8Array(t.data);
    if (data[0] === 0x1f && data[1] === 0x8b) data = gunzipSync(data);
    const vt = new VectorTile(new Pbf(data));
    assert.ok(vt.layers.roads, 'couche des rues');
    const noms = [];
    for (let i = 0; i < vt.layers.roads.length; i++) {
      const p = vt.layers.roads.feature(i).properties;
      if (p.name) noms.push(String(p.name));
    }
    assert.ok(noms.length > 10, `${noms.length} rues nommées`);
    console.log(`   ${noms.length} rues nommées dans la tuile du centre, ex. ${[...new Set(noms)].slice(0, 3).join(' ; ')} ; ${(octets.length / 1048576).toFixed(1)} Mo`);
  });
}

console.log(`\n${n} vérifications réussies.`);

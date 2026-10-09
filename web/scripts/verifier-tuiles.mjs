// Vérification des tuiles vectorielles du réseau (X5) : archive PMTiles fabriquée par src/lib/reseau/pmtiles.ts, relue
// par la bibliothèque pmtiles (celle du panneau), tuiles décodées par @mapbox/vector-tile (celle de MapLibre) ;
// empreinte du réseau ; source signée (lib/reseau/tuiles.ts : renouvellement de l'URL, plages, cache).
// Lancement, dans web/ : node scripts/verifier-tuiles.mjs [troncons.geojson noeuds.geojson]
// (avec les deux fichiers, sortie de reseau_geojson / noeuds_geojson : génération du vrai réseau, taille et durée)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'fflate';
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader as Pbf } from 'pbf';

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

const P = await import('../src/lib/reseau/pmtiles.ts');
const T = await import('../src/lib/reseau/tuiles.ts');
const MC = await import('../src/lib/reseau/mini-carte.ts');
const { suiteSure } = await import('../src/app/session/fragment.ts');

let n = 0;
const ok = async (nom, fn) => {
  await fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

// Source en mémoire pour la bibliothèque pmtiles.
const sourceMemoire = (octets, cle = 'essai') => ({
  getKey: () => cle,
  getBytes: async (offset, length) => ({ data: octets.slice(offset, offset + length).buffer, etag: 'e1' }),
});
const gunzip = async (buf, compression) => (compression === 2 ? gunzipSync(new Uint8Array(buf)).buffer : buf);

// Petit réseau : une rue de 3 tronçons vers l'est, un tronçon sans diamètre, deux nœuds.
const ligne = (id, coords, p = {}) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { id, s: 'sec-a', z: 'zone-1', c: 'conduite', d: 110, m: 'PVC', l: 52.4, ...p } });
const troncons = {
  type: 'FeatureCollection',
  features: [
    ligne('t1', [[-1.9100, 34.6800], [-1.9095, 34.6800]]),
    ligne('t2', [[-1.9095, 34.6800], [-1.9090, 34.6801]], { d: 63, m: 'PEHD' }),
    ligne('t3', [[-1.9090, 34.6801], [-1.9085, 34.6801]], { s: 'sec-b', z: 'zone-2' }),
    ligne('t4', [[-1.9090, 34.6801], [-1.9090, 34.6806]], { d: null, m: null, s: null, z: null }),
  ],
};
const noeuds = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-1.9095, 34.6800] }, properties: { id: 'n1', s: 'sec-a', z: 'zone-1', t: 'vanne' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-1.9090, 34.6801] }, properties: { id: 'n2', s: 'sec-a', z: 'zone-1', t: 'jonction' } },
  ],
};
const infos = { version: 1, marche_id: 'm1', estampille: 'abc', genere_le: '2026-10-09T00:00:00Z', nb_troncons: 4, nb_noeuds: 2 };
const r = P.genererPmtiles(troncons, noeuds, infos);
const archive = new PMTiles(sourceMemoire(r.octets), undefined, gunzip);

await ok('en-tête : version 3, MVT, gzip, zooms 10 à 16, bornes du réseau', async () => {
  const h = await archive.getHeader();
  assert.equal(h.specVersion, 3);
  assert.equal(h.tileType, 1);
  assert.equal(h.tileCompression, 2);
  assert.equal(h.internalCompression, 2);
  assert.equal(h.minZoom, 10);
  assert.equal(h.maxZoom, 16);
  assert.ok(Math.abs(h.minLon - -1.91) < 1e-6 && Math.abs(h.maxLat - 34.6806) < 1e-6, JSON.stringify(h));
  assert.equal(h.numAddressedTiles, r.nbTuiles);
  assert.equal(h.clustered, true);
});

await ok('métadonnées : couches et infos de l\'application relues', async () => {
  const meta = await archive.getMetadata();
  assert.equal(P.lireIndexTroncons({ index_troncons: { ids: ['a'], l: [] } }), null);
  assert.deepEqual(meta.vector_layers.map((c) => c.id), ['troncons', 'noeuds']);
  assert.deepEqual(P.lireInfosTuiles(meta), infos);
  assert.equal(P.lireInfosTuiles({}), null);
  assert.equal(P.lireInfosTuiles({ suivi_fuites: { version: 2 } }), null);
});

const tuile = async (z, lon, lat) => {
  const x = Math.floor(((lon + 180) / 360) * 2 ** z);
  const ra = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(ra) + 1 / Math.cos(ra)) / Math.PI) / 2) * 2 ** z);
  const t = await archive.getZxy(z, x, y);
  return t ? new VectorTile(new Pbf(new Uint8Array(t.data))) : null;
};
const proprietes = (vt, couche) => {
  const c = vt.layers[couche];
  return c ? Array.from({ length: c.length }, (_, i) => ({ ...c.feature(i).properties })) : [];
};

await ok('zoom 16 : 4 tronçons, identifiant entier, propriétés du panneau (secteur, diamètre, matériau) ; index uuid + longueur', async () => {
  const vt = await tuile(16, -1.9092, 34.6802);
  const index = P.lireIndexTroncons(await archive.getMetadata());
  assert.deepEqual(index, { ids: ['t1', 't2', 't3', 't4'], l: [52.4, 52.4, 52.4, 52.4], s: [1, 1, 2, 0], d: [110, 63, 110, 0], secteurs: ['sec-a', 'sec-b'] });
  const c = vt.layers.troncons;
  const p = Array.from({ length: c.length }, (_, i) => ({ id: index.ids[c.feature(i).id - 1], ...c.feature(i).properties }))
    .sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(p.map((x) => x.id), ['t1', 't2', 't3', 't4']);
  assert.deepEqual(p[0], { id: 't1', s: 'sec-a', c: 'conduite', d: 110, m: 'PVC' });
  assert.equal(p[2].s, 'sec-b');
  // Diamètre et secteur inconnus : propriétés absentes (les expressions de couleur testent « has »).
  assert.equal('d' in p[3], false);
  assert.equal('s' in p[3], false);
});

await ok('nœuds : présents aux zooms 14 à 16, absents en dessous', async () => {
  assert.deepEqual(proprietes(await tuile(16, -1.9092, 34.6802), 'noeuds').map((x) => x.t).sort(), ['jonction', 'vanne']);
  assert.equal(proprietes(await tuile(14, -1.9092, 34.6802), 'noeuds').length, 2);
  assert.equal(proprietes(await tuile(13, -1.9092, 34.6802), 'noeuds').length, 0);
  assert.equal(proprietes(await tuile(10, -1.9092, 34.6802), 'troncons').length, 4);
});

await ok('tuile hors du réseau : absente ; zoom 17 : absente (agrandie par MapLibre)', async () => {
  assert.equal(await tuile(16, -1.80, 34.60), null);
  assert.equal(await tuile(17, -1.9092, 34.6802), null);
});

await ok('réseau vide : erreur lisible', () => {
  assert.throws(() => P.genererPmtiles({ type: 'FeatureCollection', features: [] }, noeuds, infos), /Aucun tronçon/);
});

await ok('répertoire : écarts d\'identifiants, longueurs, décalages contigus notés 0', () => {
  const o = P.serialiserRepertoire([
    { tileId: 5, offset: 0, length: 10, runLength: 1 },
    { tileId: 7, offset: 10, length: 300, runLength: 1 },
    { tileId: 9, offset: 500, length: 1, runLength: 2 },
  ]);
  assert.deepEqual([...o], [3, 5, 2, 2, 1, 1, 2, 10, 0xac, 0x02, 1, 1, 0, 501 % 128 | 0x80, 3]);
});

await ok('empreinte : stable, indépendante de l\'ordre, sensible au zonage et aux non zonés', () => {
  const l = [
    { secteur_id: 'b', nb_troncons: 10, lineaire_m: '120.50', modifie_le: '2026-10-07T10:00:00+00:00', nb_noeuds: 4 },
    { secteur_id: 'a', nb_troncons: 3, lineaire_m: 30, modifie_le: null, nb_noeuds: 0 },
  ];
  const e = P.estampilleReseau(l, { nb_troncons: 2, lineaire_m: 5 });
  assert.match(e, /^[0-9a-f]{16}$/);
  assert.equal(P.estampilleReseau([...l].reverse(), { nb_troncons: 2, lineaire_m: '5.00' }), e);
  assert.notEqual(P.estampilleReseau([{ ...l[0], nb_troncons: 11 }, l[1]], { nb_troncons: 2, lineaire_m: 5 }), e);
  assert.notEqual(P.estampilleReseau([{ ...l[0], modifie_le: '2026-10-07T10:00:01+00:00' }, l[1]], { nb_troncons: 2, lineaire_m: 5 }), e);
  assert.notEqual(P.estampilleReseau(l, { nb_troncons: 1, lineaire_m: 5 }), e);
  assert.notEqual(P.estampilleReseau(l, null), e);
});

// ---- Source signée (lib/reseau/tuiles.ts) ---------------------------------------------------------------------

await ok('source signée : plages demandées, URL renouvelée quand elle expire (403), cache par ETag', async () => {
  const demandes = [];
  let generation = 0;
  const signer = async () => ({ existe: true, url: `https://r2.example/reseau.pmtiles?sig=${++generation}`, expire_s: 3600, etag: '"e1"', octets: r.octets.length });
  const cache = new Map();
  const fetchFactice = async (url, init) => {
    demandes.push({ url, plage: init.headers.Range });
    if (url.endsWith('sig=1') && demandes.length > 2) return new Response('expirée', { status: 403 });
    const [, de, a] = /bytes=(\d+)-(\d+)/.exec(init.headers.Range);
    return new Response(r.octets.slice(Number(de), Number(a) + 1), { status: 206, headers: { ETag: '"e1"' } });
  };
  const source = T.creerSourceSignee({
    cle: 'reseau-m1', lire: signer, fetch: fetchFactice,
    cache: { lire: async (k) => cache.get(k) ?? null, ecrire: async (k, v) => void cache.set(k, v) },
  });
  const a = new PMTiles(source, undefined, gunzip);
  await a.getHeader();
  assert.equal(demandes[0].plage, 'bytes=0-16383');
  await source.getBytes(127, 5);
  // Troisième demande : l'URL n° 1 a expiré (403), la source redemande une signature et réessaie.
  await source.getBytes(200, 10);
  assert.ok(demandes.some((d) => d.url.endsWith('sig=2')), JSON.stringify(demandes));
  // Même plage relue : servie par le cache, sans requête.
  const avant = demandes.length;
  const b = await source.getBytes(200, 10);
  assert.equal(demandes.length, avant);
  assert.equal(new Uint8Array(b.data)[0], r.octets[200]);
});

await ok('source signée : archive absente ou stockage non configuré → null (la carte reste sur la base)', async () => {
  assert.equal(T.reponseLisible({ existe: false }), null);
  assert.equal(T.reponseLisible({ code: 'r2_non_configure' }), null);
  assert.equal(T.reponseLisible({ existe: true, url: 'javascript:alert(1)', expire_s: 60 }), null);
  assert.deepEqual(T.reponseLisible({ existe: true, url: 'https://x.r2.cloudflarestorage.com/a?b', expire_s: 60, etag: '"e"', octets: 3 }),
    { url: 'https://x.r2.cloudflarestorage.com/a?b', expireS: 60, etag: '"e"', octets: 3 });
});

await ok('emprise satellite : bornes du réseau + 1 km', () => {
  const [o, s, e, nn] = T.empriseAvecMarge([-1.942, 34.644, -1.8535, 34.7248], 1000);
  assert.ok(Math.abs((-1.942 - o) * 111320 * Math.cos((34.68 * Math.PI) / 180) - 1000) < 15);
  assert.ok(Math.abs((s - 34.644) * -111320 - 1000) < 15);
  assert.ok(e > -1.8535 && nn > 34.7248);
});

// ---- Mini-carte (F4) ----------------------------------------------------------------------------------------

await ok('mini-carte : adresse lue (marché, position, précision, langue, satellite), valeurs invalides écartées', () => {
  const p = MC.lireParametresMiniCarte(new URLSearchParams('marche=6251BDC4-b3d2-4a0e-a390-20d3acceddef&lat=34.68&lng=-1.90&precision=12&langue=ar&satellite=1'));
  assert.deepEqual(p, { marcheId: '6251bdc4-b3d2-4a0e-a390-20d3acceddef', latitude: 34.68, longitude: -1.9, precision: 12, langue: 'ar', satellite: true });
  const q = MC.lireParametresMiniCarte(new URLSearchParams('marche=x&lat=134&lng=-1.9&precision=-3&langue=en'));
  assert.deepEqual(q, { marcheId: null, latitude: null, longitude: null, precision: null, langue: 'fr', satellite: false });
  assert.equal(MC.lireParametresMiniCarte(new URLSearchParams('lat=34.68')).latitude, null, 'latitude sans longitude');
});

await ok('mini-carte : /session accepte la suite /mini-carte avec ses paramètres', () => {
  const suite = '/mini-carte?marche=6251bdc4-b3d2-4a0e-a390-20d3acceddef&lat=34.68145&lng=-1.90845&precision=12&langue=hybride&satellite=0';
  assert.equal(suiteSure(suite), suite);
});

await ok('mini-carte : position GPS de l\'APK (objet ou JSON), refus des messages étrangers', () => {
  assert.deepEqual(MC.lireMessageGps({ type: 'mini-carte:gps', latitude: 34.6, longitude: -1.9, precision: 8 }), { latitude: 34.6, longitude: -1.9, precision: 8 });
  assert.deepEqual(MC.lireMessageGps('{"type":"mini-carte:gps","latitude":"34.6","longitude":-1.9}'), { latitude: 34.6, longitude: -1.9, precision: null });
  assert.equal(MC.lireMessageGps({ type: 'autre', latitude: 1, longitude: 1 }), null);
  assert.equal(MC.lireMessageGps('pas du json'), null);
  assert.equal(MC.lireMessageGps({ type: 'mini-carte:gps', latitude: 95, longitude: 1 }), null);
});

await ok('mini-carte : cercle de précision (rayon en mètres), écart épingle / GPS, libellé de la conduite', () => {
  const c = MC.cercle(-1.9, 34.68, 50);
  assert.equal(c.coordinates[0].length, 49);
  assert.deepEqual(c.coordinates[0][0], c.coordinates[0][48]);
  const nord = c.coordinates[0][12];
  assert.ok(Math.abs((nord[1] - 34.68) * 111320 - 50) < 0.5);
  assert.equal(MC.ecartEpingle(null, { latitude: 34.68, longitude: -1.9 }), null);
  assert.ok(Math.abs(MC.ecartEpingle({ latitude: 34.68, longitude: -1.9 }, { latitude: 34.6809, longitude: -1.9 }) - 100) < 0.5);
  assert.equal(MC.libelleTroncon({ diametre_mm: 110, materiau: 'pvc', materiau_plan: 'PVC' }), 'Ø110 · PVC');
  assert.equal(MC.libelleTroncon({ diametre_mm: 63, materiau: null, materiau_plan: 'PEHD' }), 'Ø63 · PEHD');
  assert.equal(MC.libelleTroncon({ diametre_mm: null, materiau: null, materiau_plan: null }), '');
  assert.equal(MC.texte('valider', 'fr'), 'Valider la position');
  assert.match(MC.texte('valider', 'hybride'), /^Valider la position · .+/);
  assert.notEqual(MC.texte('valider', 'ar'), MC.texte('valider', 'fr'));
});

// ---- Vrai réseau (facultatif) ---------------------------------------------------------------------------------
const [fichierT, fichierN] = process.argv.slice(2);
if (fichierT && fichierN) {
  const t = JSON.parse(readFileSync(fichierT, 'utf8'));
  const nd = JSON.parse(readFileSync(fichierN, 'utf8'));
  const debut = performance.now();
  const reel = P.genererPmtiles(t, nd, { ...infos, nb_troncons: t.features.length, nb_noeuds: nd.features.length });
  const duree = performance.now() - debut;
  const a = new PMTiles(sourceMemoire(reel.octets), undefined, gunzip);
  const h = await a.getHeader();
  // Chaque tronçon doit se retrouver au zoom 16 (au moins un morceau).
  const vus = new Set();
  const z = 16;
  const x0 = Math.floor(((h.minLon + 180) / 360) * 2 ** z), x1 = Math.floor(((h.maxLon + 180) / 360) * 2 ** z);
  const yDe = (lat) => { const ra = (lat * Math.PI) / 180; return Math.floor(((1 - Math.log(Math.tan(ra) + 1 / Math.cos(ra)) / Math.PI) / 2) * 2 ** z); };
  let plusGrosse = 0;
  for (let x = x0; x <= x1; x++) for (let y = yDe(h.maxLat); y <= yDe(h.minLat); y++) {
    const tu = await a.getZxy(z, x, y);
    if (!tu) continue;
    const vt = new VectorTile(new Pbf(new Uint8Array(tu.data)));
    const c = vt.layers.troncons;
    for (let i = 0; c && i < c.length; i++) vus.add(c.feature(i).id);
  }
  for (let zz = 10; zz <= 16; zz++) {
    const tz = await a.getZxy(zz, Math.floor(((-1.9086 + 180) / 360) * 2 ** zz), Math.floor(((1 - Math.log(Math.tan(34.6814 * Math.PI / 180) + 1 / Math.cos(34.6814 * Math.PI / 180)) / Math.PI) / 2) * 2 ** zz));
    if (tz) plusGrosse = Math.max(plusGrosse, tz.data.byteLength);
  }
  const index = P.lireIndexTroncons(await a.getMetadata());
  assert.equal(index.ids.length, t.features.length);
  await ok(`vrai réseau : ${t.features.length} tronçons et ${nd.features.length} nœuds tous présents au zoom 16`, () => {
    assert.equal(vus.size, t.features.length);
  });
  console.log(`# ${reel.nbTuiles} tuiles, ${(reel.octets.length / 1048576).toFixed(2)} Mo, ${Math.round(duree)} ms ; tuile du centre la plus lourde ${(plusGrosse / 1024).toFixed(0)} Ko (gzip)`);
}

console.log(`1..${n}`);

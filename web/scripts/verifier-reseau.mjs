// Vérification du lot S côté panneau web (réseau d'eau, zonage, balayage), sur les fonctions pures :
// palette déterministe, classes de diamètre, point dans polygone, sélection rectangle / lasso, fusion
// état de balayage / géométrie, lecture d'une FeatureCollection, découpage en paquets, mise en file
// d'un envoi « balayage », arbre du panneau, journal, fragment de /session, contexte APK.
// Lancement, dans web/ : node scripts/verifier-reseau.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

// Les modules du panneau s'importent sans extension et avec l'alias « @/ » : on les résout ici.
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

const palette = await import('../src/lib/reseau/palette.ts');
const selection = await import('../src/lib/reseau/selection.ts');
const importReseau = await import('../src/lib/reseau/import.ts');
const etat = await import('../src/lib/reseau/etat.ts');
const arbre = await import('../src/lib/reseau/arbre.ts');
const journal = await import('../src/lib/reseau/journal.ts');
const balayage = await import('../src/lib/reseau/balayage.ts');
const fragment = await import('../src/app/session/fragment.ts');
const { estContexteApk } = await import('../src/lib/supabase.ts');

let n = 0;
const ok = (nom, fn) => {
  fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};
const HEX = /^#[0-9a-f]{6}$/;
const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
ok('hslVersHex : valeurs connues', () => {
  assert.equal(palette.hslVersHex(0, 100, 50), '#ff0000');
  assert.equal(palette.hslVersHex(120, 100, 50), '#00ff00');
  assert.equal(palette.hslVersHex(240, 100, 50), '#0000ff');
  assert.equal(palette.hslVersHex(0, 0, 100), '#ffffff');
  assert.equal(palette.hslVersHex(0, 0, 0), '#000000');
  assert.equal(palette.hslVersHex(360 + 120, 100, 50), '#00ff00');
});

const ZONES = [{ id: 'z1', numero: 1, code: 'Z1', libelle: 'Centre' }, { id: 'z2', numero: 2, code: 'Z2', libelle: 'Est' }, { id: 'z3', numero: 13, code: 'Z13', libelle: 'Sud' }];
const SECTEURS = [
  { id: 's11', zone_id: 'z1', ordre: 2, code: 'S1B', libelle: 'Centre B' },
  { id: 's10', zone_id: 'z1', ordre: 1, code: 'S1A', libelle: 'Centre A' },
  { id: 's12', zone_id: 'z1', ordre: 3, code: 'S1C', libelle: 'Centre C' },
  { id: 's20', zone_id: 'z2', ordre: 1, code: 'S2A', libelle: 'Est A' },
  { id: 's30', zone_id: 'z3', ordre: 1, code: 'S13A', libelle: 'Sud A' },
];

ok('palette déterministe : mêmes entrées, mêmes couleurs, quel que soit l\'ordre de la liste', () => {
  const a = palette.paletteSecteurs(ZONES, SECTEURS);
  const b = palette.paletteSecteurs([...ZONES].reverse(), [...SECTEURS].reverse());
  assert.deepEqual([...a.secteurs.entries()].sort(), [...b.secteurs.entries()].sort());
  assert.deepEqual([...a.zones.entries()].sort(), [...b.zones.entries()].sort());
  for (const c of [...a.secteurs.values(), ...a.zones.values()]) assert.match(c, HEX);
  assert.equal(a.secteurs.size, 5);
  assert.equal(a.zones.size, 3);
});

ok('palette : teintes des zones séparées, nuances distinctes dans une zone, zone 13 ≠ zone 1', () => {
  const t = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(palette.teinteZone);
  for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
    const d = Math.abs(t[i] - t[j]);
    assert.ok(Math.min(d, 360 - d) >= 20, `zones ${i + 1} et ${j + 1} trop proches (${t[i]} / ${t[j]})`);
  }
  const p = palette.paletteSecteurs(ZONES, SECTEURS);
  const z1 = ['s10', 's11', 's12'].map((id) => p.secteurs.get(id));
  assert.equal(new Set(z1).size, 3);
  assert.notEqual(palette.couleurZone(1), palette.couleurZone(13));
  assert.equal(palette.couleurSecteur(1, 0, 3), palette.couleurSecteur(1, 0, 3));
  assert.notEqual(palette.couleurSecteur(1, 0, 3), palette.couleurSecteur(1, 2, 3));
});

ok('classes de diamètre : bornes du contrat (≤ 63, 75-110, 125-200, 250-400, > 400), inconnu = -1', () => {
  const c = palette.classeDiametre;
  assert.equal(c(null), -1);
  assert.equal(c(undefined), -1);
  assert.equal(c(0), -1);
  assert.equal(c(50), 0);
  assert.equal(c(63), 0);
  assert.equal(c(75), 1);
  assert.equal(c(110), 1);
  assert.equal(c(125), 2);
  assert.equal(c(200), 2);
  assert.equal(c(250), 3);
  assert.equal(c(400), 3);
  assert.equal(c(401), 4);
  assert.equal(c(1200), 4);
  assert.equal(palette.CLASSES_DIAMETRE.length, 5);
});

ok('expressions MapLibre : couleur par secteur (match avec repli), balayage (feature-state), diamètre (step)', () => {
  const p = palette.paletteSecteurs(ZONES, SECTEURS);
  const e = palette.expressionCouleurSecteur(p);
  assert.equal(e[0], 'match');
  assert.ok(e.includes('s10') && e.includes(p.secteurs.get('s10')));
  assert.equal(e[e.length - 1], palette.COULEUR_NON_ZONE);
  assert.equal(palette.expressionCouleurSecteur({ secteurs: new Map(), zones: new Map() }), palette.COULEUR_NON_ZONE);
  const b = palette.expressionCouleurBalayage();
  assert.equal(b[0], 'case');
  assert.ok(JSON.stringify(b).includes('feature-state'));
  assert.ok(b.includes(palette.COULEUR_BALAYE) && b.includes(palette.COULEUR_REPASSE) && b.includes(palette.COULEUR_NON_BALAYE));
  const d = JSON.stringify(palette.expressionCouleurDiametre());
  assert.ok(d.includes('"step"') && d.includes('63.5') && d.includes('400.5'));
  assert.equal(palette.expressionCouleurReseau('diametre', p)[0], 'case');
  // « zoom » n'est accepté qu'en entrée d'un interpolate de premier niveau : le halo (+7 px) reste dans les sorties.
  const largeur = palette.expressionLargeur(1, 7);
  assert.deepEqual(largeur.slice(0, 3), ['interpolate', ['linear'], ['zoom']]);
  assert.equal(largeur[4][0], '+');
  assert.equal(largeur[4][2], 7);
  assert.equal(JSON.stringify(largeur).split('"zoom"').length, 2, 'une seule référence au zoom');
});

ok('légende : par zone affichée, par état de balayage, par classe de diamètre', () => {
  const p = palette.paletteSecteurs(ZONES, SECTEURS);
  const parSecteur = palette.entreesLegendeReseau('secteur', p, [ZONES[1], ZONES[0]], new Map([['z1', 120]]));
  assert.deepEqual(parSecteur.map((e) => e.libelle), ['Zone 1 · Centre', 'Zone 2 · Est']);
  assert.equal(parSecteur[0].nombre, 120);
  assert.equal(parSecteur[0].fond, p.zones.get('z1'));
  const parBalayage = palette.entreesLegendeReseau('balayage', p, ZONES, new Map([['balaye', 3], ['repasse', 1], ['non_balaye', 10]]));
  assert.deepEqual(parBalayage.map((e) => e.nombre), [3, 1, 10]);
  assert.equal(parBalayage[0].fond, '#256f3a');
  const parDiametre = palette.entreesLegendeReseau('diametre', p, ZONES);
  assert.equal(parDiametre.length, 6);
  assert.equal(parDiametre[5].libelle, 'Diamètre inconnu');
});

// ---------------------------------------------------------------------------
// Sélection : géométrie
// ---------------------------------------------------------------------------
const CARRE = [[-1.92, 34.68], [-1.90, 34.68], [-1.90, 34.70], [-1.92, 34.70], [-1.92, 34.68]];

ok('point dans un anneau, un polygone à trou, un multipolygone', () => {
  assert.equal(selection.pointDansAnneau([-1.91, 34.69], CARRE), true);
  assert.equal(selection.pointDansAnneau([-1.93, 34.69], CARRE), false);
  assert.equal(selection.pointDansAnneau([-1.91, 34.71], CARRE), false);
  assert.equal(selection.pointDansAnneau([-1.91, 34.69], CARRE.slice(0, 4)), true, 'anneau non fermé accepté');
  assert.equal(selection.pointDansAnneau([0, 0], [[0, 0], [1, 1]]), false, 'moins de 3 points');
  const trou = [[-1.915, 34.685], [-1.905, 34.685], [-1.905, 34.695], [-1.915, 34.695], [-1.915, 34.685]];
  const poly = { type: 'Polygon', coordinates: [CARRE, trou] };
  assert.equal(selection.pointDansPolygone([-1.91, 34.69], poly), false, 'dans le trou');
  assert.equal(selection.pointDansPolygone([-1.918, 34.69], poly), true, 'dans la couronne');
  const multi = { type: 'MultiPolygon', coordinates: [[CARRE], [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] };
  assert.equal(selection.pointDansPolygone([0.5, 0.5], multi), true);
  assert.equal(selection.pointDansPolygone([2, 2], multi), false);
  assert.equal(selection.pointDansPolygone([-1.91, 34.69], [CARRE]), true, 'tableau d\'anneaux');
});

ok('milieu d\'une ligne à mi-longueur, longueur en mètres (haversine)', () => {
  assert.deepEqual(selection.milieuLigne([[0, 0], [2, 0]]), [1, 0]);
  const m = selection.milieuLigne([[0, 0], [1, 0], [1, 3]]);
  // 1° de longitude à l'équateur ≈ 1° de latitude : longueur 4°, milieu à 2° → sur le second segment, à 1° au-dessus.
  assert.ok(Math.abs(m[0] - 1) < 1e-9 && Math.abs(m[1] - 1) < 0.02, JSON.stringify(m));
  assert.deepEqual(selection.milieuLigne([[5, 6]]), [5, 6]);
  assert.deepEqual(selection.milieuLigne([]), [0, 0]);
  const d = selection.distanceMetres([-1.9086, 34.6814], [-1.9086, 34.6904]);
  assert.ok(Math.abs(d - 1000) < 5, `1 km attendu, ${d}`);
  assert.ok(Math.abs(selection.longueurMetres([[-1.9086, 34.6814], [-1.9086, 34.6904], [-1.9086, 34.6994]]) - 2000) < 10);
});

ok('rectangle et lasso en anneau fermé ; lasso dégénéré refusé', () => {
  assert.deepEqual(selection.rectangleEnAnneau([2, 5], [1, 3]), [[1, 3], [2, 3], [2, 5], [1, 5], [1, 3]]);
  assert.deepEqual(selection.lassoEnAnneau([[0, 0], [0, 0], [1, 0], [1, 1], [1, 1], [0, 0]]), [[0, 0], [1, 0], [1, 1], [0, 0]]);
  assert.equal(selection.lassoEnAnneau([[0, 0], [1, 1]]), null);
  assert.equal(selection.lassoEnAnneau([[0, 0], [0, 0], [0, 0]]), null);
  assert.deepEqual(selection.anneauEnPolygone(CARRE), { type: 'Polygon', coordinates: [CARRE] });
  assert.deepEqual(selection.bornesAnneau(CARRE), [[-1.92, 34.68], [-1.90, 34.70]]);
});

ok('bornes d\'un très grand nombre de sommets (réseau complet) sans dépasser la pile', () => {
  // 300 000 sommets : Math.min(...liste) lèverait RangeError ; la boucle non.
  const grand = Array.from({ length: 300000 }, (_, i) => [-1.95 + (i % 1000) * 0.0001, 34.65 + Math.floor(i / 1000) * 0.0001]);
  assert.deepEqual(selection.bornesPositions(grand), [[-1.95, 34.65], [-1.95 + 999 * 0.0001, 34.65 + 299 * 0.0001]]);
  assert.equal(selection.bornesPositions([]), null);
  const features = [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] }, properties: {} },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1, 5]] }, properties: {} }];
  assert.deepEqual([...selection.sommetsTroncons(features)], [[1, 2], [3, 4], [-1, 5]]);
  assert.deepEqual(selection.bornesPositions(selection.sommetsTroncons(features)), [[-1, 2], [3, 5]]);
});

// Tronçons fictifs : propriétés courtes de reseau_geojson.
const troncon = (i, coords, s = 's10', d = 110) => ({
  type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: { id: `t${i}`, s, z: s ? 'z1' : null, c: 'conduite', d, m: 'PEHD', l: 100 + i },
});
const TRONCONS = [
  troncon(1, [[-1.919, 34.681], [-1.901, 34.681]]),                 // milieu (-1.910, 34.681) : dans le carré
  troncon(2, [[-1.919, 34.699], [-1.901, 34.699]], 's11', 63),      // milieu (-1.910, 34.699) : dans le carré
  troncon(3, [[-1.95, 34.69], [-1.93, 34.69]], null, null),         // à l'ouest, non zoné
  troncon(4, [[-1.925, 34.69], [-1.895, 34.69]], 's10', 250),       // traverse le carré, milieu dedans
  troncon(5, [[-1.90, 34.70], [-1.88, 34.72]], 's20', 500),         // part du coin : milieu dehors
];

ok('sélection par rectangle et par lasso : le milieu du tronçon décide (règle de la base)', () => {
  assert.deepEqual(selection.idsDansAnneau(TRONCONS, CARRE), ['t1', 't2', 't4']);
  const index = selection.indexerTroncons(TRONCONS);
  assert.equal(index.size, 5);
  assert.deepEqual(selection.idsIndexDansAnneau(index.values(), CARRE), ['t1', 't2', 't4']);
  // Lasso triangulaire autour du seul t1.
  const lasso = selection.lassoEnAnneau([[-1.915, 34.679], [-1.905, 34.679], [-1.910, 34.684]]);
  assert.deepEqual(selection.idsIndexDansAnneau(index.values(), lasso), ['t1']);
  assert.equal(index.get('t3').secteur, null);
  assert.equal(index.get('t1').longueur, 101, 'longueur de la base (propriété l)');
  const sansL = selection.indexerTroncons([{ ...TRONCONS[0], properties: { ...TRONCONS[0].properties, l: null } }]);
  assert.ok(sansL.get('t1').longueur > 1500 && sansL.get('t1').longueur < 1700, 'longueur calculée à défaut');
});

ok('sélection : remplacer, ajouter, basculer, retirer, sans modifier l\'ensemble d\'origine', () => {
  const base = new Set(['a', 'b']);
  assert.deepEqual([...selection.appliquerSelection(base, ['c'], 'remplacer')], ['c']);
  assert.deepEqual([...selection.appliquerSelection(base, ['b', 'c'], 'ajouter')].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...selection.appliquerSelection(base, ['b', 'c'], 'basculer')].sort(), ['a', 'c']);
  assert.deepEqual([...selection.appliquerSelection(base, ['a', 'x'], 'retirer')], ['b']);
  assert.deepEqual([...base].sort(), ['a', 'b']);
});

ok('linéaire d\'une sélection et formatage « m » / « km »', () => {
  const longueurs = new Map([['a', 120.4], ['b', 879.6], ['c', 10]]);
  assert.equal(selection.lineaireSelection(['a', 'b', 'inconnu'], longueurs), 1000);
  assert.equal(selection.formaterLineaire(850), '850 m');
  assert.equal(selection.formaterLineaire(849.6), '850 m');
  assert.equal(selection.formaterLineaire(1250), '1,25 km');
  assert.equal(selection.formaterLineaire(12345), '12,3 km');
  assert.equal(selection.formaterLineaire(125000), '125 km');
  assert.equal(selection.formaterLineaire(null), '—');
});

// « Prolonger » : une rue est-ouest coupée à chaque jonction (A B | C D), une rue nord-sud (E F) qui la
// croise entre B et C (jonction à 4 branches), un virage à 45° (G) après D, et D dessinée à l'envers.
const RUE = [
  troncon(101, [[-1.920, 34.68], [-1.919, 34.68]]),                        // A : bout de rue à l'ouest
  troncon(102, [[-1.919, 34.68], [-1.918, 34.68]]),                        // B
  troncon(103, [[-1.918, 34.68], [-1.917, 34.68]]),                        // C
  troncon(104, [[-1.916, 34.68], [-1.917, 34.68]]),                        // D (sens inverse)
  troncon(105, [[-1.918, 34.68], [-1.918, 34.681]]),                       // E : vers le nord
  troncon(106, [[-1.918, 34.68], [-1.918, 34.679]]),                       // F : vers le sud
  troncon(107, [[-1.916, 34.68], [-1.9152, 34.6808]]),                     // G : virage ≈ 45°
  troncon(108, [[-1.9152, 34.6808], [-1.9144, 34.6816]]),                  // H : dans l'axe de G
];

ok('prolonger : azimuts, écart d\'angle, adjacence par sommet', () => {
  assert.ok(Math.abs(selection.azimut([-1.92, 34.68], [-1.91, 34.68]) - 90) < 0.5, 'vers l\'est ≈ 90°');
  assert.ok(Math.abs(selection.azimut([-1.92, 34.68], [-1.92, 34.69])) < 0.01, 'vers le nord = 0°');
  assert.ok(Math.abs(selection.azimut([-1.92, 34.68], [-1.92, 34.67]) - 180) < 0.01, 'vers le sud = 180°');
  assert.equal(selection.ecartAngle(350, 10), 20);
  assert.equal(selection.ecartAngle(10, 350), 20);
  assert.equal(selection.ecartAngle(90, 270), 180);
  assert.equal(selection.ecartAngle(45, 45), 0);
  assert.equal(selection.cleSommet([-1.9180000001, 34.68]), '-1.918000,34.680000');
  const index = selection.indexerTroncons(RUE);
  const adj = selection.construireAdjacence(index.values());
  assert.deepEqual(adj.get(selection.cleSommet([-1.918, 34.68])).sort(), ['t102', 't103', 't105', 't106'], 'jonction à 4 branches');
  assert.deepEqual(adj.get(selection.cleSommet([-1.920, 34.68])), ['t101'], 'bout de rue');
  assert.deepEqual(adj.get(selection.cleSommet([-1.917, 34.68])).sort(), ['t103', 't104'], 'D à l\'envers rattachée quand même');
});

ok('prolonger : suit la rue dans l\'alignement, s\'arrête à la jonction, au bout de rue et au virage', () => {
  const index = selection.indexerTroncons(RUE);
  const adj = selection.construireAdjacence(index.values());
  assert.deepEqual(selection.prolongerSelection(index, adj, ['t102']), ['t101'], 'B : A à l\'ouest, jonction à l\'est');
  assert.deepEqual(selection.prolongerSelection(index, adj, ['t103']), ['t104'], 'C : D (sens inverse) puis virage G refusé ; jonction à l\'ouest');
  assert.deepEqual(selection.prolongerSelection(index, adj, ['t104']), ['t103'], 'D : C puis jonction ; virage refusé');
  assert.deepEqual(selection.prolongerSelection(index, adj, ['t107']), ['t108'], 'G : H dans l\'axe ; D refusée (45°)');
  assert.deepEqual(selection.prolongerSelection(index, adj, ['t104'], 60).sort(), ['t103', 't107', 't108'], 'tolérance 60° : le virage passe');
  assert.deepEqual(selection.prolongerSelection(index, adj, ['t101', 't102']), [], 'déjà choisis : rien de plus');
  assert.deepEqual(selection.prolongerSelection(index, adj, ['t105']), [], 'E : jonction d\'un côté, bout de rue de l\'autre');
  assert.deepEqual(selection.prolongerSelection(index, adj, ['inconnu']), []);
  assert.deepEqual(selection.prolongerSelection(index, adj, ['t103'], 20, 0), [], 'zéro pas : rien');
});

// ---------------------------------------------------------------------------
// État de balayage
// ---------------------------------------------------------------------------
ok('fusion état / géométrie : balayé, repassé, absent = non balayé ; noms des agents', () => {
  const lignes = [
    { troncon_id: 't1', premier_le: '2026-10-01', dernier_le: '2026-10-01', nb_passages: 1, agent_id: 'a1' },
    { troncon_id: 't2', premier_le: '2026-09-20', dernier_le: '2026-10-03', nb_passages: 2, agent_id: null },
    { troncon_id: 't9', premier_le: '2026-09-20', dernier_le: '2026-09-20', nb_passages: 0, agent_id: null },
  ];
  const etats = etat.etatsFeatures(lignes, { agents: new Map([['a1', 'Ahmed']]) });
  assert.equal(etats.size, 2, 'zéro passage = pas d\'état');
  assert.deepEqual(etats.get('t1'), { balaye: true, repasse: false, passages: 1, premier: '2026-10-01', dernier: '2026-10-01', agent: 'Ahmed' });
  assert.equal(etats.get('t2').repasse, true);
  assert.equal(etats.get('t2').agent, null);
  assert.equal(etats.get('t3'), undefined);
  assert.equal(etat.texteEtatTroncon(etats.get('t1')), 'Balayé le 01/10/2026 par Ahmed');
  assert.equal(etat.texteEtatTroncon(etats.get('t2')), 'Balayé le 03/10/2026 · 2 passages');
  assert.equal(etat.texteEtatTroncon(undefined), 'Non balayé');
  assert.deepEqual([...etat.compterEtats(['t1', 't2', 't3', 't4'], etats).entries()], [['balaye', 1], ['repasse', 1], ['non_balaye', 2]]);
});

ok('différences d\'états : poser les nouveaux et modifiés, retirer les disparus', () => {
  const avant = etat.etatsFeatures([
    { troncon_id: 't1', premier_le: '2026-10-01', dernier_le: '2026-10-01', nb_passages: 1, agent_id: null },
    { troncon_id: 't2', premier_le: '2026-10-01', dernier_le: '2026-10-01', nb_passages: 1, agent_id: null },
  ]);
  const apres = etat.etatsFeatures([
    { troncon_id: 't1', premier_le: '2026-10-01', dernier_le: '2026-10-01', nb_passages: 1, agent_id: null },
    { troncon_id: 't2', premier_le: '2026-10-01', dernier_le: '2026-10-05', nb_passages: 2, agent_id: null },
    { troncon_id: 't3', premier_le: '2026-10-05', dernier_le: '2026-10-05', nb_passages: 1, agent_id: null },
  ]);
  assert.deepEqual(etat.differencesEtats(avant, apres), { poser: ['t2', 't3'], retirer: [] });
  assert.deepEqual(etat.differencesEtats(apres, avant), { poser: ['t2'], retirer: ['t3'] });
});

// ---------------------------------------------------------------------------
// Import GeoJSON
// ---------------------------------------------------------------------------
const FICHIER = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1.91, 34.68], [-1.90, 34.68]] }, properties: { reference: 'H1', calque: 'AEP-DN110', categorie: 'conduite', diametre_mm: '110', materiau: 'PEHD', secteur_code: 'S1A' } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1.91, 34.69], [-1.90, 34.69]] }, properties: { reference: 'H2', calque: 'AEP-DN63', categorie: 'BRANCHEMENT', diametre_mm: 63, secteur_code: null } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1.91, 34.70], [-1.90, 34.70]] }, properties: { reference: 'H3', categorie: 'inconnue', diametre_mm: 0, secteur_code: 'ZZZ' } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1.91, 34.70]] }, properties: { reference: 'H4' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [-1.91, 34.70] }, properties: { reference: 'H5' } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1.91, 34.71], [-1.90, 34.71]] }, properties: { reference: '  ' } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-1.91, 34.72], [-1.90, 34.72]] }, properties: { reference: 'H1' } },
    { type: 'Truc' },
  ],
});

ok('lecture d\'une FeatureCollection de tronçons : features valides gardées, rejets motivés, résumé', () => {
  const l = importReseau.lireFeatureCollection(FICHIER, 'troncons');
  assert.equal(l.features.length, 4);
  assert.deepEqual(l.rejetees.map((r) => r.motif), [
    'géométrie LineString WGS84 attendue', 'géométrie LineString WGS84 attendue', 'référence absente', 'pas une Feature',
  ]);
  assert.deepEqual(l.features[0].properties, { reference: 'H1', calque: 'AEP-DN110', categorie: 'conduite', diametre_mm: 110, materiau: 'PEHD', secteur_code: 'S1A' });
  assert.equal(l.features[1].properties.categorie, 'branchement', 'catégorie normalisée en minuscules');
  assert.equal(l.features[2].properties.categorie, 'conduite', 'catégorie inconnue → conduite');
  assert.equal(l.features[2].properties.diametre_mm, null, 'diamètre 0 → inconnu');
  assert.equal(l.resume.total, 4);
  assert.equal(l.resume.references_doublons, 1);
  assert.deepEqual([...l.resume.calques.entries()].sort(), [['(sans calque)', 2], ['AEP-DN110', 1], ['AEP-DN63', 1]]);
  assert.deepEqual([...l.resume.secteurs.entries()].sort(), [['', 2], ['S1A', 1], ['ZZZ', 1]]);
  assert.deepEqual([...l.resume.classes.entries()].sort(), [['branchement', 1], ['conduite', 3]]);
  assert.ok(l.resume.longueurApprox_m > 3600 && l.resume.longueurApprox_m < 3700, String(l.resume.longueurApprox_m));
});

ok('lecture des nœuds, fichiers refusés (JSON invalide, pas une FeatureCollection)', () => {
  const noeuds = importReseau.lireFeatureCollection(JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-1.91, 34.68] }, properties: { reference: 'N1', type: 'VANNE', secteur_code: 'S1A' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [-1.91, 34.68] }, properties: { reference: 'N2', type: 'bizarre' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { reference: 'N3' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [200, 34.68] }, properties: { reference: 'N4' } },
    ],
  }), 'noeuds');
  assert.equal(noeuds.features.length, 2);
  assert.deepEqual(noeuds.features.map((f) => f.properties.type), ['vanne', 'jonction']);
  assert.equal(noeuds.rejetees.length, 2);
  assert.equal(noeuds.resume.longueurApprox_m, 0);
  assert.throws(() => importReseau.lireFeatureCollection('{pas du json', 'troncons'), /JSON lisible/);
  assert.throws(() => importReseau.lireFeatureCollection('{"type":"Feature"}', 'troncons'), /FeatureCollection/);
  assert.throws(() => importReseau.lireFeatureCollection('[]', 'troncons'), /FeatureCollection/);
});

ok('contours des secteurs (secteurs.geojson) : code → identifiant du secteur, codes inconnus listés, rejets', () => {
  const carre = [[[-1.92, 34.68], [-1.90, 34.68], [-1.90, 34.70], [-1.92, 34.68]]];
  const lecture = importReseau.lireContoursSecteurs(JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [carre] }, properties: { secteur_code: 'S1A' } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: carre }, properties: { secteur_code: ' s2a ' } },
      { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [carre] }, properties: { secteur_code: 'ZZZ' } },
      { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [carre] }, properties: { secteur_code: 'S1A' } },
      { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: { secteur_code: 'S1B' } },
      { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 1], [0, 0]]] }, properties: { secteur_code: 'S1B' } },
      { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [carre] }, properties: {} },
    ],
  }), SECTEURS);
  assert.equal(lecture.total, 7);
  assert.deepEqual(lecture.contours.map((c) => [c.secteur_id, c.code, c.geometrie.type]), [['s10', 'S1A', 'MultiPolygon'], ['s20', 'S2A', 'Polygon']]);
  assert.deepEqual(lecture.inconnus, [{ index: 2, code: 'ZZZ' }]);
  assert.deepEqual(lecture.rejetees.map((r) => r.index), [3, 4, 5, 6]);
  assert.match(lecture.rejetees[0].motif, /en double/);
  assert.match(lecture.rejetees[1].motif, /Polygon ou MultiPolygon/);
  assert.match(lecture.rejetees[3].motif, /secteur_code absent/);
  assert.throws(() => importReseau.lireContoursSecteurs('{"type":"Feature"}', SECTEURS), /FeatureCollection/);
});

ok('fichier d\'une autre étape refusé avec le nom du bon fichier ; table de correspondance des noms refusée', () => {
  const collection = (type, coordinates) => JSON.stringify({
    type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type, coordinates }, properties: { reference: 'R1', secteur_code: 'S1A' } }],
  });
  const lignes = collection('LineString', [[-1.91, 34.70], [-1.90, 34.70]]);
  const points = collection('Point', [-1.91, 34.70]);
  const contours = collection('MultiPolygon', [[[[-1.92, 34.68], [-1.90, 34.68], [-1.90, 34.70], [-1.92, 34.68]]]]);
  assert.throws(() => importReseau.lireContoursSecteurs(lignes, SECTEURS), /des tronçons : il va à l'étape « 2\. Tronçons » \(2-troncons\.geojson\)/);
  assert.throws(() => importReseau.lireFeatureCollection(contours, 'troncons'), /étape « 1\. Contours des secteurs ».*prenez « 2-troncons\.geojson »/);
  assert.throws(() => importReseau.lireFeatureCollection(lignes, 'noeuds'), /étape « 2\. Tronçons »/);
  assert.throws(() => importReseau.lireFeatureCollection(points, 'troncons'), /étape « 3\. Nœuds » \(3-noeuds\.geojson\)/);
  assert.throws(() => importReseau.lireContoursSecteurs('{"QODS HAUT":"QODS-H"}', SECTEURS),
    /1-contours-secteurs\.geojson.*IMPORT-RESEAU.*table de noms/);
  assert.equal(importReseau.lireFeatureCollection(lignes, 'troncons').features.length, 1, 'bon fichier : accepté');
});

ok('découpage en paquets de 1 000 et cumul des résultats de la base', () => {
  const liste = Array.from({ length: 2500 }, (_, i) => i);
  const paquets = importReseau.decouperEnPaquets(liste);
  assert.deepEqual(paquets.map((p) => p.length), [1000, 1000, 500]);
  assert.equal(paquets[2][0], 2000);
  assert.deepEqual(importReseau.decouperEnPaquets([]), []);
  assert.deepEqual(importReseau.decouperEnPaquets([1, 2, 3], 2), [[1, 2], [3]]);
  assert.deepEqual(importReseau.decouperEnPaquets([1, 2], 0), [[1], [2]], 'taille minimale 1');
  assert.equal(importReseau.TAILLE_PAQUET, 1000);
  const cumul = importReseau.cumulerResultats([
    { inseres: 1000, mis_a_jour: 0, ignores: 0, erreurs: [] },
    { inseres: 990, mis_a_jour: 5, ignores: 5, erreurs: [{ reference: 'H9', message: 'géométrie invalide' }] },
    {},
  ]);
  assert.deepEqual(cumul, { inseres: 1990, mis_a_jour: 5, ignores: 5, erreurs: [{ reference: 'H9', message: 'géométrie invalide' }] });
  assert.deepEqual(importReseau.cumulerResultats([]), { inseres: 0, mis_a_jour: 0, ignores: 0, erreurs: [] });
});

// ---------------------------------------------------------------------------
// Balayage : préparation et mise en file
// ---------------------------------------------------------------------------
ok('préparation des balayages : une ligne par tronçon, uuid créé sur l\'appareil, doublons de sélection ignorés', () => {
  let i = 0;
  const lignes = balayage.preparerBalayages(new Set(['t1', 't2', 't1']), {
    marcheId: 'm1', dateBalayage: '2026-10-06', methode: 'ecoute', observation: '  RAS  ',
  }, () => uuid(++i));
  assert.equal(lignes.length, 2);
  assert.deepEqual(lignes[0], {
    id: uuid(1), marche_id: 'm1', troncon_id: 't1', date_balayage: '2026-10-06', methode: 'ecoute', observation: 'RAS', source_saisie: 'web',
  });
  assert.equal(lignes[1].troncon_id, 't2');
  assert.notEqual(lignes[0].id, lignes[1].id);
  const sans = balayage.preparerBalayages(['t3'], { marcheId: 'm1', dateBalayage: '2026-10-06', methode: null, observation: '', sourceSaisie: 'tablette' }, () => uuid(9));
  assert.deepEqual([sans[0].methode, sans[0].observation, sans[0].source_saisie, 'equipe_id' in sans[0]], [null, null, 'tablette', false]);
  assert.throws(() => balayage.preparerBalayages(['t1'], { marcheId: 'm1', dateBalayage: '06/10/2026', methode: null, observation: null }), /Date/);
  assert.equal(balayage.preparerBalayages([], { marcheId: 'm1', dateBalayage: '2026-10-06', methode: null, observation: null }).length, 0);
  // Second passage : motif sur les seuls tronçons déjà balayés.
  const rep = balayage.preparerBalayages(['t1', 't2'], { marcheId: 'm1', dateBalayage: '2026-10-06', methode: null, observation: null, motifRepasse: 'fuite_suspectee' },
    () => uuid(++i), new Set(['t2']));
  assert.deepEqual([rep[0].motif_repasse, rep[1].motif_repasse], [undefined, 'fuite_suspectee']);
  assert.equal(balayage.MOTIFS_REPASSE.map((m) => m.valeur).join(','), 'fuite_suspectee,controle,autre');
});

ok('mise en file d\'un envoi « balayage » : identifiant et marché à part, colonnes dans `ligne`', () => {
  const lignes = balayage.preparerBalayages(['t1'], { marcheId: 'm1', dateBalayage: '2026-10-06', methode: null, observation: null }, () => uuid(7));
  const file = balayage.enFileAttente(lignes);
  assert.deepEqual(file, [{
    id: uuid(7), marche_id: 'm1',
    ligne: { troncon_id: 't1', date_balayage: '2026-10-06', methode: null, observation: null, source_saisie: 'web' },
  }]);
  assert.equal('id' in file[0].ligne, false, 'l\'identifiant est remis à l\'insertion (comme les fuites)');
  // Renvoyé tel quel à l'insertion : { ...ligne, id, marche_id } reconstitue la ligne complète.
  assert.deepEqual({ ...file[0].ligne, id: file[0].id, marche_id: file[0].marche_id }, lignes[0]);
  assert.equal(balayage.METHODES.map((m) => m.valeur).join(','), 'ecoute,correlation,prelocalisation,enregistreurs');
  assert.match(balayage.aujourdhuiMaroc(new Date('2026-10-06T23:30:00Z')), /^2026-10-07$/);
});

// ---------------------------------------------------------------------------
// Arbre du panneau et compteurs
// ---------------------------------------------------------------------------
const LIGNES_SECTEURS = [
  { marche_id: 'm1', zone_id: 'z1', secteur_id: 's10', code: 'S1A', libelle: 'Centre A', statut_balayage: 'en_cours', nb_troncons: 40, lineaire_m: 4000, nb_balayes: 10, lineaire_balaye_m: 1000, pct_balaye: 25, nb_noeuds: 12, lineaire_contrat_m: 4200, modifie_le: '2026-10-01T10:00:00Z' },
  { marche_id: 'm1', zone_id: 'z1', secteur_id: 's11', code: 'S1B', libelle: 'Centre B', statut_balayage: 'balayee', nb_troncons: 10, lineaire_m: 1000, nb_balayes: 10, lineaire_balaye_m: 1000, pct_balaye: 100, nb_noeuds: 3, lineaire_contrat_m: null, modifie_le: null },
  { marche_id: 'm1', zone_id: 'z2', secteur_id: 's20', code: 'S2A', libelle: 'Est A', statut_balayage: 'a_balayer', nb_troncons: 25, lineaire_m: 2500, nb_balayes: 0, lineaire_balaye_m: 0, pct_balaye: 0, nb_noeuds: 0, lineaire_contrat_m: 2000, modifie_le: '2026-10-02T10:00:00Z' },
];

ok('arbre Zone → secteurs : tri, couleurs, linéaires, % balayé, secteur sans ligne', () => {
  const p = palette.paletteSecteurs(ZONES, SECTEURS);
  const a = arbre.construireArbre(ZONES, SECTEURS, LIGNES_SECTEURS, p);
  assert.deepEqual(a.map((z) => z.numero), [1, 2, 13]);
  assert.deepEqual(a[0].secteurs.map((s) => s.code), ['S1A', 'S1B', 'S1C'], 'ordre puis code');
  assert.equal(a[0].lineaire, 5000);
  assert.equal(a[0].lineaireBalaye, 2000);
  assert.equal(a[0].pct, 40);
  assert.equal(a[0].nbTroncons, 50);
  assert.equal(a[0].secteurs[0].pct, 25);
  assert.equal(a[0].secteurs[2].lineaire, 0, 'secteur sans ligne de la vue');
  assert.equal(a[0].secteurs[0].couleur, p.secteurs.get('s10'));
  assert.equal(a[0].couleur, p.zones.get('z1'));
  assert.equal(a[2].pct, 0);
  assert.equal(arbre.cleCache('m1', 's10'), 'm1:s10');
});

ok('cases : état d\'une zone, bascule d\'une zone, Tout, totaux des cochés', () => {
  const a = arbre.construireArbre(ZONES, SECTEURS, LIGNES_SECTEURS, palette.paletteSecteurs(ZONES, SECTEURS));
  const z1 = a[0];
  assert.equal(arbre.etatCaseZone(z1, new Set()), 'aucun');
  assert.equal(arbre.etatCaseZone(z1, new Set(['s10'])), 'partiel');
  assert.equal(arbre.etatCaseZone(z1, new Set(['s10', 's11', 's12'])), 'tous');
  assert.deepEqual([...arbre.basculerZone(z1, new Set(['s10', 's20']))].sort(), ['s10', 's11', 's12', 's20'], 'partiel → tous');
  assert.deepEqual([...arbre.basculerZone(z1, new Set(['s10', 's11', 's12', 's20']))], ['s20'], 'tous → aucun');
  assert.deepEqual([...arbre.tousLesSecteurs(a)].sort(), ['s10', 's11', 's12', 's20', 's30']);
  const t = arbre.totauxChoisis(a, new Set(['s10', 's20']));
  assert.deepEqual(t, { secteurs: 2, nbTroncons: 65, lineaire: 6500, lineaireBalaye: 1000, pct: 15.4 });
});

// ---------------------------------------------------------------------------
// Journal des balayages
// ---------------------------------------------------------------------------
const ligneJ = (o) => ({
  marche_id: 'm1', date_balayage: '2026-10-05', agent_id: 'a1', agent: 'Ahmed', zone_id: 'z1', zone: 'Centre',
  secteur_id: 's10', secteur: 'Centre A', nb_troncons: 10, lineaire_m: 1000, lineaire_repasse_m: 0, nb_noeuds: 2, nb_fuites: 1, ...o,
});
const JOURNAL = [
  ligneJ({}),
  ligneJ({ secteur_id: 's11', secteur: 'Centre B', nb_troncons: 5, lineaire_m: 500, lineaire_repasse_m: 120, nb_fuites: 0 }),
  ligneJ({ date_balayage: '2026-10-06', agent_id: 'a2', agent: 'Brahim', nb_troncons: 8, lineaire_m: 800, nb_noeuds: 0, nb_fuites: 2 }),
  ligneJ({ date_balayage: '2026-09-30', nb_troncons: 3, lineaire_m: 300, nb_fuites: 0 }),
];

ok('journal : filtres période (bornes comprises, remises dans l\'ordre), agent, secteur', () => {
  assert.equal(journal.filtrerJournal(JOURNAL, {}).length, 4);
  assert.equal(journal.filtrerJournal(JOURNAL, { du: '2026-10-05', au: '2026-10-06' }).length, 3);
  assert.equal(journal.filtrerJournal(JOURNAL, { du: '2026-10-06', au: '2026-10-05' }).length, 3, 'période inversée');
  assert.equal(journal.filtrerJournal(JOURNAL, { au: '2026-09-30' }).length, 1);
  assert.equal(journal.filtrerJournal(JOURNAL, { du: 'n\'importe quoi' }).length, 4, 'date invalide ignorée');
  assert.equal(journal.filtrerJournal(JOURNAL, { agent: 'a2' }).length, 1);
  assert.equal(journal.filtrerJournal(JOURNAL, { secteur: 's11' }).length, 1);
  assert.equal(journal.filtrerJournal(JOURNAL, { agent: 'a1', secteur: 's10', du: '2026-10-01' }).length, 1);
});

ok('journal : totaux et regroupement par jour (du plus récent au plus ancien)', () => {
  assert.deepEqual(journal.totauxJournal(JOURNAL), { nb_troncons: 26, lineaire_m: 2600, lineaire_repasse_m: 120, nb_noeuds: 6, nb_fuites: 3, jours: 3 });
  const jours = journal.grouperParJour(JOURNAL);
  assert.deepEqual(jours.map((j) => j.jour), ['2026-10-06', '2026-10-05', '2026-09-30']);
  assert.equal(jours[1].lignes.length, 2);
  assert.deepEqual(jours[1].lignes.map((l) => l.secteur), ['Centre A', 'Centre B']);
  assert.equal(jours[1].totaux.lineaire_m, 1500);
  assert.deepEqual(journal.periodeParDefaut(new Date('2026-10-06T12:00:00Z')), { du: '2026-09-30', au: '2026-10-06' });
  assert.equal(journal.jourValide('2026-10-06'), true);
  assert.equal(journal.jourValide('2026-13-06'), false);
});

// ---------------------------------------------------------------------------
// Route /session : fragment et contexte APK
// ---------------------------------------------------------------------------
const JETON = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMifQ.signature-factice';

ok('fragment de /session : jetons et suite lus, fragment vide ou incomplet refusé', () => {
  const lu = fragment.lireFragmentSession(`#access_token=${JETON}&refresh_token=rafraichissement-123456&suite=${encodeURIComponent('/carte?mode=balayage')}`);
  assert.deepEqual(lu, { access_token: JETON, refresh_token: 'rafraichissement-123456', suite: '/carte?mode=balayage' });
  assert.deepEqual(fragment.lireFragmentSession(`access_token=${JETON}&refresh_token=rafraichissement-123456`), { access_token: JETON, refresh_token: 'rafraichissement-123456', suite: '/carte' });
  assert.ok('erreur' in fragment.lireFragmentSession(''));
  assert.ok('erreur' in fragment.lireFragmentSession('#'));
  assert.ok('erreur' in fragment.lireFragmentSession(`#access_token=${JETON}`), 'refresh_token absent');
  assert.ok('erreur' in fragment.lireFragmentSession('#access_token=court&refresh_token=x'), 'jetons illisibles');
  assert.ok('erreur' in fragment.lireFragmentSession(`#access_token=${JETON}&refresh_token=a%20b%20c%20d%20e%20f%20g%20h%20i%20j`), 'espaces refusés');
});

ok('suite : chemin relatif de l\'application seulement, sinon /carte', () => {
  assert.equal(fragment.suiteSure('/carte?mode=balayage'), '/carte?mode=balayage');
  assert.equal(fragment.suiteSure('/fuites/123'), '/fuites/123');
  assert.equal(fragment.suiteSure(null), '/carte');
  assert.equal(fragment.suiteSure(''), '/carte');
  assert.equal(fragment.suiteSure('carte'), '/carte');
  assert.equal(fragment.suiteSure('https://evil.example/x'), '/carte');
  assert.equal(fragment.suiteSure('//evil.example/x'), '/carte');
  assert.equal(fragment.suiteSure('/\\evil.example'), '/carte');
  assert.equal(fragment.suiteSure('/javascript:alert(1)'), '/carte');
  assert.equal(fragment.suiteSure('/../connexion'), '/carte');
  assert.equal(fragment.suiteSure('/session#access_token=x'), '/carte', 'pas de boucle sur /session');
  assert.equal(fragment.suiteSure(`/${'a'.repeat(600)}`), '/carte');
});

ok('contexte APK : WebView React Native ou suffixe « SuiviFuitesAPK » de l\'User-Agent', () => {
  assert.equal(estContexteApk('Mozilla/5.0 (Linux; Android 14; SM-X210) Chrome/130 Mobile Safari/537.36 SuiviFuitesAPK', false), true);
  assert.equal(estContexteApk('Mozilla/5.0 (Linux; Android 14) Chrome/130', true), true);
  assert.equal(estContexteApk('Mozilla/5.0 (Macintosh) Chrome/130 Safari/537.36', false), false);
  assert.equal(estContexteApk(null, false), false);
  assert.equal(estContexteApk(undefined, false), false, 'hors navigateur : pas d\'APK');
});

console.log(`\n${n} vérifications réussies.`);

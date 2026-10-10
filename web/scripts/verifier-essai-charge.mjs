// Vérification des correctifs de l'essai de charge (docs/essai-charge-3000.md), sur les fonctions pures :
// lecture paginée en parallèle et plafond signalé (lireTout), état de balayage compact, courbe des réfections,
// filtre des alertes, résumé du reste à attacher.
// Lancement, dans web/ : node scripts/verifier-essai-charge.mjs
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

const { lireTout, fonctionAbsente } = await import('../src/lib/supabase.ts');
const { deplierEtatBalayage } = await import('../src/lib/reseau/donnees.ts');
const { refectionsAFaire, nonReparees } = await import('../src/lib/ui/indicateurs.ts');
const { filtreAlertes, COLONNES_LISTE } = await import('../src/lib/colonnes-fuites.ts');
const { resumerUnites, recapAttachements } = await import('../src/lib/ui/tableau-de-bord.ts');

let n = 0;
const ok = async (nom, fn) => {
  await fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

// Source paginée comme l'API (1 000 lignes au plus), avec trace des appels et de leur simultanéité.
function source(total) {
  const lignes = Array.from({ length: total }, (_, i) => ({ numero: total - i }));
  const trace = { appels: [], enCours: 0, maxSimultanes: 0 };
  const requete = (de, a) => {
    trace.appels.push(de);
    trace.enCours++;
    trace.maxSimultanes = Math.max(trace.maxSimultanes, trace.enCours);
    return new Promise((r) => setTimeout(() => {
      trace.enCours--;
      r({ data: lignes.slice(de, Math.min(a + 1, de + 1000)), error: null });
    }, 5));
  };
  return { lignes, trace, requete };
}

await ok('lireTout : 3 025 lignes lues en entier, dans l\'ordre, pages 2 à 4 en parallèle', async () => {
  const s = source(3025);
  const l = await lireTout(s.requete, 1000, 10000);
  assert.equal(l.length, 3025);
  assert.deepEqual(l.map((x) => x.numero), s.lignes.map((x) => x.numero));
  assert.equal(l.tronque, undefined);
  assert.deepEqual(s.trace.appels, [0, 1000, 2000, 3000]);
  assert.equal(s.trace.maxSimultanes, 3);
});

await ok('lireTout : moins d\'une page, un seul appel', async () => {
  const s = source(25);
  const l = await lireTout(s.requete);
  assert.equal(l.length, 25);
  assert.deepEqual(s.trace.appels, [0]);
});

await ok('lireTout : multiple exact de 1 000, une page vide termine la lecture', async () => {
  const s = source(2000);
  const l = await lireTout(s.requete, 1000, 10000);
  assert.equal(l.length, 2000);
  assert.equal(l.tronque, undefined);
});

await ok('lireTout : plafond atteint signalé (tronque) au lieu d\'une troncature silencieuse', async () => {
  const s = source(12500);
  const l = await lireTout(s.requete, 1000, 10000);
  assert.equal(l.length, 10000);
  assert.equal(l.tronque, true);
  assert.ok(Math.max(...s.trace.appels) < 10000, 'aucune page au-delà du plafond');
});

await ok('lireTout : une erreur de page remonte', async () => {
  await assert.rejects(lireTout((de) => Promise.resolve(de === 0 ? { data: Array(1000).fill({}), error: null } : { data: null, error: { message: 'panne' } })),
    { message: 'panne' });
});

await ok('fonctionAbsente : fonction inconnue de l\'API ou rpc sans résultat (démonstration)', () => {
  assert.equal(fonctionAbsente({ code: 'PGRST202' }, null), true);
  assert.equal(fonctionAbsente({ code: '42883' }, null), true);
  assert.equal(fonctionAbsente(null, null), true);
  assert.equal(fonctionAbsente(null, []), false);
  assert.equal(fonctionAbsente({ code: '42501' }, null), false);
});

await ok('état de balayage compact déplié comme etat_balayage', () => {
  const l = deplierEtatBalayage({
    t: ['t1', 't2', 't3'], p: ['2026-09-01', '2026-09-02', '2026-09-03'], d: ['2026-09-20', '2026-09-02', '2026-09-03'],
    n: [2, 1, 1], a: [1, 0, null], agents: ['g1', 'g2'],
  });
  assert.deepEqual(l, [
    { troncon_id: 't1', premier_le: '2026-09-01', dernier_le: '2026-09-20', nb_passages: 2, agent_id: 'g2' },
    { troncon_id: 't2', premier_le: '2026-09-02', dernier_le: '2026-09-02', nb_passages: 1, agent_id: 'g1' },
    { troncon_id: 't3', premier_le: '2026-09-03', dernier_le: '2026-09-03', nb_passages: 1, agent_id: null },
  ]);
  assert.deepEqual(deplierEtatBalayage({ t: [], p: [], d: [], n: [], a: [], agents: [] }), []);
});

const MAINTENANT = new Date('2026-10-05T09:00:00Z');
const il = (jours) => new Date(MAINTENANT.getTime() - jours * 86_400_000).toISOString();

await ok('réfections à faire : une fuite achevée sans réfection (terrain naturel) n\'est jamais en attente', () => {
  const r = refectionsAFaire([
    { statut: 'achevee', derniere_reparation_le: il(60), derniere_refection_le: null, emplacement_fouille: 'terrain_naturel' },
    { statut: 'achevee', derniere_reparation_le: il(10), derniere_refection_le: il(3), emplacement_fouille: 'trottoir' },
    { statut: 'reparee', derniere_reparation_le: il(5), derniere_refection_le: null, emplacement_fouille: 'chaussee' },
  ], MAINTENANT);
  assert.equal(r.valeur, 1);
  assert.equal(r.serie[0], 0, 'il y a 13 jours : rien en attente (la fuite en terrain naturel n\'est pas comptée)');
  assert.equal(r.serie[7], 1, 'il y a 6 jours : la fuite refaite il y a 3 jours attendait');
  assert.equal(r.serie[13], 1, 'aujourd\'hui : la fuite réparée il y a 5 jours');
});

await ok('alertes : les lignes du filtre suffisent aux courbes des 14 jours (mêmes valeurs que sur tout le marché)', () => {
  const tout = [];
  for (let i = 0; i < 400; i++) {
    const det = il(400 - i);
    const rep = i % 7 === 0 ? null : new Date(new Date(det).getTime() + ((i % 5) + 1) * 86_400_000 * (i % 3 ? 1 : 9)).toISOString();
    const statut = rep == null ? 'detectee' : i % 4 === 0 ? 'reparee' : 'achevee';
    const ref = statut === 'achevee' && i % 6 ? new Date(new Date(rep).getTime() + (i % 20) * 86_400_000).toISOString() : null;
    tout.push({ statut, date_detection: det, derniere_reparation_le: rep && rep < MAINTENANT.toISOString() ? rep : null,
      derniere_refection_le: ref && ref < MAINTENANT.toISOString() ? ref : null, emplacement_fouille: 'trottoir',
      alerte_non_reparee: rep == null && (MAINTENANT - new Date(det)) > 48 * 3_600_000 });
  }
  const depuis = new Date(MAINTENANT.getTime() - 15 * 86_400_000).toISOString();
  // Même règle que filtreAlertes (hors drapeaux d'alerte, qui n'ajoutent que des lignes)
  const utiles = tout.filter((f) => f.alerte_non_reparee || f.derniere_reparation_le == null || f.derniere_reparation_le >= depuis
    || f.statut === 'reparee' || (f.derniere_refection_le != null && f.derniere_refection_le >= depuis));
  assert.ok(utiles.length < tout.length / 2, `${utiles.length} lignes utiles sur ${tout.length}`);
  assert.deepEqual(nonReparees(utiles, 48, MAINTENANT), nonReparees(tout, 48, MAINTENANT));
  assert.deepEqual(refectionsAFaire(utiles, MAINTENANT), refectionsAFaire(tout, MAINTENANT));
});

await ok('filtre des alertes pour l\'API : six drapeaux, puis les lignes des courbes, date entre guillemets', () => {
  const f = filtreAlertes(new Date('2026-09-20T00:00:00Z'));
  assert.equal(f.split(',').length, 10);
  assert.match(f, /^alerte_non_reparee\.is\.true,/);
  assert.match(f, /derniere_reparation_le\.gte\."2026-09-20T00:00:00\.000Z"/);
  assert.match(f, /statut\.eq\.reparee/);
  assert.ok(!COLONNES_LISTE.includes('*') && COLONNES_LISTE.split(', ').length === 25); // zone_id : filtre par zone (U2)
});

await ok('reste à attacher : même récapitulatif depuis la base (resume_a_attacher) ou depuis les unités', () => {
  const articles = [{ id: 'p3', numero: '3', ordre: 3, designation: 'T', unite: 'm3', quantite_marche: 100, pu_ht: 200, hors_bordereau: false, actif: true }];
  const unites = [
    { fuite_id: 'f1', prix_id: 'p3', reste: 2, brouillon_id: null },
    { fuite_id: 'f2', prix_id: 'p3', reste: -0.5, brouillon_id: 'x' },
  ];
  const base = { articles: [{ prix_id: 'p3', reste: 1.5, unites: 2 }], unites: 2, fuites: 2, unites_en_brouillon: 1 };
  assert.deepEqual(resumerUnites(unites), base);
  assert.deepEqual(recapAttachements(articles, [], base), recapAttachements(articles, [], resumerUnites(unites)));
});

console.log(`\n${n} vérifications réussies.`);

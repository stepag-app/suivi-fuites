// Vérification de la consultation hors ligne d'une fiche déjà vue, sur des données fictives :
// règles pures (src/app/(app)/fuites/[id]/fiche-hors-ligne.ts) et service worker (public/sw.js),
// ce dernier exécuté dans un bac à sable avec un réseau et un Cache Storage simulés.
// Lancement, dans web/ : node scripts/verifier-fiche-hors-ligne.mjs
// (Node 22.18 ou plus récent ; Node 22.6 à 22.17 : node --experimental-strip-types …)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  LIMITES_HORS_LIGNE, actionsFiche, choisirAffichage, clePhoto, ficheConsultee, fichesAPurger, nomsUtiles,
  photosAMemoriser, photosAOublier,
} from '../src/app/(app)/fuites/[id]/fiche-hors-ligne.ts';

let n = 0;
const ok = async (nom, fn) => {
  await fn();
  n++;
  console.log(`ok ${n} - ${nom}`);
};

const MOI = 'u-chef';
const AUTRE = 'u-autre';
const jour = (j) => new Date(Date.UTC(2026, 9, 1, 8, 0, j)).toISOString(); // plus j est grand, plus c'est récent
const entete = (id, j, nbPhotos = 2, utilisateur = MOI) => ({ id, utilisateur_id: utilisateur, consultee_le: jour(j), nb_photos: nbPhotos });

// ---- Clés des photos -------------------------------------------------------------------------------

await ok('clé d\'une photo = son identifiant, jamais l\'URL signée', () => {
  const lundi = { id: 'p1', url: 'https://exemple.supabase.co/storage/v1/object/sign/photos/m/f/p1.jpg?token=AAA' };
  const mardi = { id: 'p1', url: 'https://exemple.supabase.co/storage/v1/object/sign/photos/m/f/p1.jpg?token=BBB' };
  assert.equal(clePhoto(lundi), 'p1');
  assert.equal(clePhoto(lundi), clePhoto(mardi));
});

await ok('photos à télécharger : celles qui ont une URL et ne sont pas déjà gardées', () => {
  const photos = [
    { id: 'p1', url: 'https://x/p1?token=nouveau' }, // déjà gardée (avec une autre URL signée)
    { id: 'p2', url: 'https://x/p2?token=1' },
    { id: 'p3' }, // URL non obtenue (coupure)
  ];
  assert.deepEqual(photosAMemoriser(photos, ['p1']), [{ cle: 'p2', url: 'https://x/p2?token=1' }]);
  assert.deepEqual(photosAMemoriser([], ['p1']), []);
});

await ok('photos à oublier : gardées mais retirées de la fiche depuis', () => {
  assert.deepEqual(photosAOublier([{ id: 'p1' }, { id: 'p3' }], ['p1', 'p2']), ['p2']);
  assert.deepEqual(photosAOublier([], []), []);
});

// ---- Purge : 50 fiches, 400 photos, les moins récemment ouvertes d'abord -----------------------------

await ok('limites par défaut : 50 fiches et 400 photos', () => {
  assert.deepEqual({ ...LIMITES_HORS_LIGNE }, { fiches: 50, photos: 400 });
});

await ok('sous les limites : rien n\'est effacé', () => {
  const entetes = [entete('a', 1), entete('b', 2), entete('c', 3)];
  assert.deepEqual(fichesAPurger(entetes, { id: 'c', utilisateur_id: MOI }), []);
});

await ok('52 fiches : les 2 plus anciennes partent, la fiche courante reste même si elle était la plus ancienne', () => {
  const entetes = Array.from({ length: 52 }, (_, i) => entete(`f${i}`, i, 1));
  // f0 vient d'être rouverte (courante) mais son ancienne date de consultation est la plus vieille.
  const purge = fichesAPurger(entetes, { id: 'f0', utilisateur_id: MOI });
  assert.deepEqual(purge.sort(), ['f1', 'f2']);
  assert.equal(entetes.length - purge.length, 50);
});

await ok('budget de photos : dès qu\'une fiche ne tient plus, elle et les plus anciennes partent', () => {
  const limites = { fiches: 50, photos: 10 };
  const entetes = [entete('courante', 9, 4), entete('a', 8, 3), entete('b', 7, 4), entete('c', 6, 1)];
  // courante 4 + a 3 = 7 ; + b 4 = 11 > 10 : b part, et c (plus ancienne) aussi.
  assert.deepEqual(fichesAPurger(entetes, { id: 'courante', utilisateur_id: MOI }, limites), ['b', 'c']);
});

await ok('copies d\'un autre compte : toujours effacées', () => {
  const entetes = [entete('a', 1), entete('x', 5, 1, AUTRE), entete('courante', 9)];
  assert.deepEqual(fichesAPurger(entetes, { id: 'courante', utilisateur_id: MOI }), ['x']);
});

// ---- Contenu gardé ---------------------------------------------------------------------------------

await ok('noms gardés : seulement ceux cités par la fiche (ni téléphones ni référentiels entiers)', () => {
  const reparations = [{ id: 'r1', auteur_terrain_id: 'pr1', equipe_id: 'e1', motif_id: null }];
  const refections = [{ id: 'rf1', nature_id: 'n2', motif_id: 'm3' }];
  const noms = nomsUtiles(reparations, refections, {
    natures: [{ id: 'n1', libelle_fr: 'Chaussée' }, { id: 'n2', libelle_fr: 'Trottoir' }],
    motifs: [{ id: 'm3', libelle_fr: 'Refus du riverain' }, { id: 'm4', libelle_fr: 'Autre' }],
    profils: [
      { id: 'pr1', nom_complet: 'Chef Un', telephone: '0600000000' },
      { id: 'pr2', nom_complet: 'Agent Deux', telephone: '0611111111' },
    ],
    equipes: [{ id: 'e1', libelle: 'Équipe A' }, { id: 'e2', libelle: 'Équipe B' }],
  });
  assert.deepEqual(noms, {
    natures: { n2: 'Trottoir' },
    motifs: { m3: 'Refus du riverain' },
    profils: { pr1: 'Chef Un' },
    equipes: { e1: 'Équipe A' },
  });
  assert.ok(!JSON.stringify(noms).includes('06'));
});

await ok('copie datée : version et consultation à l\'heure de la lecture, propriétaire, nombre de photos', () => {
  const contenu = {
    fuite: { id: 'f1', numero: 12 }, photos: [{ id: 'p1' }, { id: 'p2' }], reparations: [], refections: [], quantites: [],
    liens: { ouvriers: {}, pieces: {} }, noms: { natures: {}, motifs: {}, profils: {}, equipes: {} },
  };
  const fiche = ficheConsultee(contenu, MOI, new Date('2026-10-05T13:32:00Z'));
  assert.equal(fiche.id, 'f1');
  assert.equal(fiche.utilisateur_id, MOI);
  assert.equal(fiche.version_le, '2026-10-05T13:32:00.000Z');
  assert.equal(fiche.consultee_le, fiche.version_le);
  assert.equal(fiche.nb_photos, 2);
});

// ---- Actions et affichage --------------------------------------------------------------------------

const tousDroits = () => true;
const detection = (type, action) => type === 'fuites' && action === 'lire';
const chef = (type, action) =>
  (type === 'fuites' && action === 'lire') || (type === 'interventions' && ['lire', 'creer'].includes(action)) ||
  (type === 'photos' && ['lire', 'creer'].includes(action));

await ok('en ligne : les actions suivent les droits', () => {
  const a = actionsFiche(tousDroits, { horsLigne: false, verrouillee: false });
  assert.ok(Object.values(a).every((v) => v === true));
  const d = actionsFiche(detection, { horsLigne: false, verrouillee: false });
  assert.ok(Object.values(d).every((v) => v === false));
  const c = actionsFiche(chef, { horsLigne: false, verrouillee: true });
  assert.equal(c.ajouterReparation, true);
  assert.equal(c.ajouterPhoto, true);
  // V6 : fuite verrouillée par un lot, l'agent ajoute encore (la base fige ce qui précède le verrou)
  assert.equal('interventionsBloquees' in c, false);
  assert.equal(c.verrouiller, false);
  assert.equal(c.rapportPdf, false);
});

await ok('hors ligne : aucune action d\'écriture, même pour l\'administrateur', () => {
  const a = actionsFiche(tousDroits, { horsLigne: true, verrouillee: false });
  for (const cle of ['rapportPdf', 'verrouiller', 'suiviClient', 'ajouterReparation', 'ajouterRefection', 'modifierQuantites',
    'changerStatut', 'supprimer', 'ajouterPhoto']) {
    assert.equal(a[cle], false, cle);
  }
});

await ok('affichage : en ligne, copie, « non disponible hors ligne » ou attente', () => {
  assert.equal(choisirAffichage({ lecture: 'ok', copie: true }), 'en_ligne');
  assert.equal(choisirAffichage({ lecture: 'reseau', copie: true }), 'copie');
  assert.equal(choisirAffichage({ lecture: 'reseau', copie: false }), 'indisponible');
  assert.equal(choisirAffichage({ lecture: 'en_cours', copie: true }), 'copie');
  assert.equal(choisirAffichage({ lecture: 'en_cours', copie: false }), 'attente');
});

// ---- Service worker (public/sw.js) dans un bac à sable ---------------------------------------------

const ORIGINE = 'https://fuites.exemple.ma';
const A = '0b0e7c1e-5a8b-4c3d-9e2f-1a2b3c4d5e6f';
const B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const C = '12345678-1234-4234-8234-123456789abc';
const coquilleHtml = (id) =>
  `<!DOCTYPE html><html><head><script src="/_next/static/chunks/app/(app)/fuites/%5Bid%5D/page-abc.js" async=""></script>` +
  `<link rel="stylesheet" href="/_next/static/css/def.css"/></head><body><p>Chargement…</p>` +
  `<script>self.__next_f.push([1,"{\\"c\\":[\\"\\",\\"fuites\\",\\"${id}\\"],\\"params\\":{\\"id\\":\\"${id}\\"}}"])</script></body></html>`;

function bacASable() {
  const magasin = new Map();
  const cle = (r) => new URL(typeof r === 'string' ? r : r.url, ORIGINE).href;
  const cache = {
    match: async (r) => magasin.get(cle(r))?.clone(),
    put: async (r, reponse) => void magasin.set(cle(r), reponse),
    keys: async () => [...magasin.keys()].map((url) => ({ url })),
    delete: async (r) => magasin.delete(cle(r)),
  };
  const caches = {
    open: async () => cache,
    match: (r) => cache.match(r),
    keys: async () => ['suivi-fuites-v1', 'ancien-cache'],
    delete: async () => true,
  };
  const etat = { enLigne: true, appels: [] };
  const fetchSimule = async (r) => {
    const url = new URL(cle(r));
    etat.appels.push(url.pathname + url.search);
    if (!etat.enLigne) throw new TypeError('Failed to fetch');
    if (/^\/fuites\/[0-9a-f-]{36}$/.test(url.pathname)) {
      return new Response(coquilleHtml(url.pathname.split('/')[2]), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    if (url.pathname.startsWith('/_next/static/')) return new Response(`/* ${url.pathname} */`, { headers: { 'Content-Type': 'text/javascript' } });
    return new Response(`<html>${url.pathname}</html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  };
  const ecouteurs = {};
  const self = {
    location: new URL(`${ORIGINE}/sw.js`),
    addEventListener: (type, f) => void (ecouteurs[type] = f),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
  };
  vm.runInNewContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), {
    self, caches, fetch: fetchSimule, Response, URL, Set, Number, String, Date, Promise, TypeError,
  });
  // Événement de requête : renvoie la réponse du service worker (ou null s'il laisse passer), après ses tâches de fond.
  const requete = async (chemin, { mode = 'cors', headers = {} } = {}) => {
    let reponse = null;
    const attentes = [];
    ecouteurs.fetch({
      request: { url: `${ORIGINE}${chemin}`, method: 'GET', mode, headers: new Headers(headers) },
      respondWith: (p) => void (reponse = p),
      waitUntil: (p) => void attentes.push(p),
    });
    const r = reponse ? await reponse : null;
    await Promise.all(attentes);
    return r;
  };
  const message = async (donnees) => {
    const attentes = [];
    ecouteurs.message({ data: donnees, waitUntil: (p) => void attentes.push(p) });
    await Promise.all(attentes);
  };
  const activer = async () => {
    const attentes = [];
    ecouteurs.activate({ waitUntil: (p) => void attentes.push(p) });
    await Promise.all(attentes);
  };
  return { magasin, etat, requete, message, activer };
}

await ok('SW : ouverture en ligne d\'une fiche, coquille gardée avec ses scripts et styles', async () => {
  const sw = bacASable();
  const r = await sw.requete(`/fuites/${A}`, { mode: 'navigate' });
  assert.ok((await r.text()).includes(A));
  const coquille = sw.magasin.get(`${ORIGINE}/__hors-ligne/fiche-fuite`);
  assert.ok(coquille, 'coquille gardée');
  assert.equal(coquille.headers.get('X-Fuite-Id'), A);
  assert.ok(sw.magasin.has(`${ORIGINE}/_next/static/chunks/app/(app)/fuites/%5Bid%5D/page-abc.js`));
  assert.ok(sw.magasin.has(`${ORIGINE}/_next/static/css/def.css`));
  assert.ok(!sw.magasin.has(`${ORIGINE}/fuites/${A}`), 'rien de gardé par fuite');
});

await ok('SW : hors ligne, toute fiche s\'ouvre avec la coquille, à son propre identifiant', async () => {
  const sw = bacASable();
  await sw.requete(`/fuites/${A}`, { mode: 'navigate' });
  sw.etat.enLigne = false;
  const r = await sw.requete(`/fuites/${B}`, { mode: 'navigate' });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('Content-Type'), /text\/html/);
  const html = await r.text();
  assert.ok(!html.includes(A), 'plus aucune trace de la fiche d\'origine');
  assert.equal(html.split(B).length - 1, 2);
  // Scripts de la page servis depuis le cache, sans réseau
  const script = await sw.requete('/_next/static/chunks/app/(app)/fuites/%5Bid%5D/page-abc.js');
  assert.equal(script.status, 200);
});

await ok('SW : hors ligne sans coquille, message « pas encore ouverte » (503)', async () => {
  const sw = bacASable();
  sw.etat.enLigne = false;
  const r = await sw.requete(`/fuites/${B}`, { mode: 'navigate' });
  assert.equal(r.status, 503);
});

await ok('SW : données de navigation (RSC) d\'une fiche jamais interceptées ni gardées', async () => {
  const sw = bacASable();
  const r = await sw.requete(`/fuites/${B}?_rsc=x1y2`, { headers: { RSC: '1' } });
  assert.equal(r, null);
  assert.equal(sw.magasin.size, 0);
});

await ok('SW : autres pages inchangées (nouvelle fuite, en attente, carte : réseau d\'abord, copie hors ligne)', async () => {
  const sw = bacASable();
  for (const page of ['/fuites/nouvelle', '/en-attente', '/carte']) await sw.requete(page, { mode: 'navigate' });
  sw.etat.enLigne = false;
  for (const page of ['/fuites/nouvelle', '/en-attente', '/carte']) {
    const r = await sw.requete(page, { mode: 'navigate' });
    assert.equal(await r.text(), `<html>${page}</html>`);
  }
  assert.equal((await sw.requete('/parametres', { mode: 'navigate' })).status, 503);
});

await ok('SW : message de la page, coquille lue au plus une fois par heure, identifiant contrôlé', async () => {
  const sw = bacASable();
  await sw.message({ type: 'coquille-fiche', id: C });
  assert.equal(sw.magasin.get(`${ORIGINE}/__hors-ligne/fiche-fuite`).headers.get('X-Fuite-Id'), C);
  const avant = sw.etat.appels.length;
  await sw.message({ type: 'coquille-fiche', id: A }); // coquille fraîche : pas de nouvelle lecture
  assert.equal(sw.etat.appels.length, avant);
  await sw.message({ type: 'coquille-fiche', id: '../parametres' });
  await sw.message({ type: 'autre', id: A });
  assert.equal(sw.etat.appels.length, avant);
});

await ok('SW : à l\'activation, les fiches gardées une par une par l\'ancienne version sont retirées', async () => {
  const sw = bacASable();
  sw.magasin.set(`${ORIGINE}/fuites/${A}`, new Response('ancienne page'));
  sw.magasin.set(`${ORIGINE}/fuites/${A}?_rsc=abc`, new Response('anciennes données'));
  sw.magasin.set(`${ORIGINE}/fuites/nouvelle`, new Response('nouvelle fuite'));
  sw.magasin.set(`${ORIGINE}/__hors-ligne/fiche-fuite`, new Response('coquille'));
  await sw.activer();
  assert.deepEqual([...sw.magasin.keys()].sort(), [`${ORIGINE}/__hors-ligne/fiche-fuite`, `${ORIGINE}/fuites/nouvelle`]);
});

console.log(`\n${n} vérifications réussies.`);

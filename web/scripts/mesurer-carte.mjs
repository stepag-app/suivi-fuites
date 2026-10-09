// Mesure de fluidité de la carte en profil tablette (Chrome sans tête piloté par le protocole DevTools, sans
// dépendance) : écran 1280 × 800 à 1,5 pixel par point, processeur bridé (×4 par défaut), carte ouverte en mode
// balayage avec tout le réseau. Mesure le temps d'affichage du réseau complet (depuis la navigation jusqu'à la
// carte au repos), puis les images par seconde pendant 8 s de déplacements et de zooms scriptés.
//
// Pré-requis : panneau construit avec NEXT_PUBLIC_MESURE_CARTE=1 (expose la carte à ce script, jamais en production)
// et servi par `next start` ; base d'essai locale (PostgREST + relais, voir web/README.md § Carte).
// Lancement : node scripts/mesurer-carte.mjs http://localhost:3110 [bridage=4] [passages=2] [chemin=/carte?mode=balayage]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:3110';
const BRIDAGE = Number(process.argv[3] ?? 4);
const PASSAGES = Number(process.argv[4] ?? 2);
const CHEMIN = process.argv[5] ?? '/carte?mode=balayage';
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9300 + Math.floor(Math.random() * 400);
const profil = mkdtempSync(join(tmpdir(), 'mesure-carte-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--no-first-run',
  '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function cible() {
  for (let i = 0; i < 50; i++) {
    try {
      const liste = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = liste.find((c) => c.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* Chrome démarre */ }
    await attendre(200);
  }
  throw new Error('Chrome ne répond pas');
}

const ws = new WebSocket(await cible());
await new Promise((ok) => ws.addEventListener('open', ok));
let id = 0;
const attentes = new Map();
const evenements = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && attentes.has(m.id)) {
    const { ok, ko } = attentes.get(m.id);
    attentes.delete(m.id);
    if (m.error) ko(new Error(m.error.message)); else ok(m.result);
  } else if (m.method) evenements.push(m);
});
const cdp = (method, params = {}) => new Promise((ok, ko) => { const n = ++id; attentes.set(n, { ok, ko }); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluer = async (expression, delai = 240000) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: delai });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const aller = async (url) => {
  evenements.length = 0;
  await cdp('Page.navigate', { url });
  for (let i = 0; i < 300 && !evenements.some((e) => e.method === 'Page.loadEventFired'); i++) await attendre(100);
};

await cdp('Page.enable');
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

// Connexion (base d'essai : n'importe quel identifiant).
await aller(`${BASE}/connexion`);
await evaluer(`(async () => {
  for (let i = 0; i < 100 && !document.querySelector('input[type=password]'); i++) await new Promise(r => setTimeout(r, 100));
  const regler = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const champs = document.querySelectorAll('input');
  regler(champs[0], 'admin'); regler(document.querySelector('input[type=password]'), 'essai-local');
  document.querySelector('button[type=submit]').click();
  for (let i = 0; i < 100 && location.pathname === '/connexion'; i++) await new Promise(r => setTimeout(r, 100));
  localStorage.setItem('suivi-fuites:reseau:actif', '1');
})()`);

const ATTENTE_RESEAU = `(async () => {
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const nb = (m) => { try { return Object.keys(m.getStyle().sources).filter(s => s.startsWith('reseau-')).length } catch { return 0 } };
  // window.__mesureReseau (useReseau, NEXT_PUBLIC_MESURE_CARTE=1) : secteurs attendus et chargés.
  let tPret = 0;
  while (performance.now() < 230000) {
    const m = window.__carteFuites, r = window.__mesureReseau;
    const pret = m && r && r.attendus > 0 && r.charges >= r.attendus && nb(m) > 0 && m.loaded() && m.areTilesLoaded();
    if (pret) { if (!tPret) tPret = performance.now(); if (performance.now() - tPret > 1000) break; } else tPret = 0;
    await pause(50);
  }
  const m = window.__carteFuites;
  if (!tPret) return { erreur: 'réseau jamais affiché en entier', mesure: window.__mesureReseau, n: nb(m) };
  return { affichage_ms: Math.round(tPret), secteurs: window.__mesureReseau.attendus, sources_reseau: nb(m), couches: m.getStyle().layers.length,
    memoire_mo: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
})()`;

const MOUVEMENTS = `(async () => {
  const m = window.__carteFuites;
  const pause = (ms) => new Promise(r => setTimeout(r, ms));
  const repos = () => new Promise(r => { if (m.loaded() && m.areTilesLoaded()) r(); else m.once('idle', r); });
  m.jumpTo({ center: [-1.9086, 34.6814], zoom: 13 });
  await repos(); await pause(500);
  const images = []; let dernier = performance.now(), encore = true;
  const boucle = (t) => { images.push(t - dernier); dernier = t; if (encore) requestAnimationFrame(boucle); };
  requestAnimationFrame((t) => { dernier = t; requestAnimationFrame(boucle); });
  const etapes = [[-1.92, 34.69, 14], [-1.90, 34.70, 15], [-1.89, 34.68, 16], [-1.91, 34.67, 15], [-1.93, 34.68, 14], [-1.90, 34.66, 13], [-1.88, 34.69, 15], [-1.9086, 34.6814, 13]];
  const t0 = performance.now();
  for (const [lng, lat, z] of etapes) { m.easeTo({ center: [lng, lat], zoom: z, duration: 1000 }); await pause(1000); }
  encore = false;
  const duree = (performance.now() - t0) / 1000;
  const tri = [...images].sort((a, b) => a - b);
  const q = (p) => Math.round(tri[Math.min(tri.length - 1, Math.floor(p * tri.length))]);
  return { ips: Math.round(images.length / duree * 10) / 10, image_mediane_ms: q(0.5), image_p95_ms: q(0.95), images_plus_50ms: images.filter(x => x > 50).length };
})()`;

await cdp('Emulation.setCPUThrottlingRate', { rate: BRIDAGE });
const resultats = [];
for (let i = 0; i < PASSAGES; i++) {
  await aller(`${BASE}${CHEMIN}`);
  const affichage = await evaluer(ATTENTE_RESEAU);
  // Déplacements tout de suite (préparation du lasso éventuellement en cours), puis au repos (20 s plus tard).
  const mouvements = await evaluer(MOUVEMENTS);
  await attendre(20000);
  const repos = await evaluer(MOUVEMENTS);
  resultats.push({
    passage: i === 0 ? 'premier (cache vide)' : `suivant (cache du navigateur)`, ...affichage,
    tout_de_suite: mouvements, au_repos: repos,
  });
}
console.log(JSON.stringify({ base: BASE, chemin: CHEMIN, bridage_cpu: BRIDAGE, ecran: '1280x800 @1,5', resultats }, null, 2));
ws.close();
chrome.kill();
await attendre(300);
rmSync(profil, { recursive: true, force: true });

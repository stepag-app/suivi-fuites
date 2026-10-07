// Essai de charge : ouvre chaque page du panneau web dans Chrome sans interface (protocole DevTools, sans
// dépendance) et mesure le temps jusqu'aux données affichées, le volume reçu, la mémoire JavaScript et,
// pour la carte avec le réseau complet, la mémoire du processus de rendu.
//
//   node outils/charge/mesurer-navigateur.mjs [bureau|tablette] [pages…]
//
// « tablette » : processeur ralenti 4 fois, réseau 4G (80 ms aller-retour, 10 Mbit/s descendant, 5 montant).
// Panneau web (next start) sur WEB_URL (défaut http://localhost:3107) relié à la base LOCALE par le relais.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WEB = process.env.WEB_URL ?? 'http://localhost:3107';
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(WEB)) throw new Error('Panneau local exigé');
const PROFIL = process.argv[2] ?? 'bureau';
const PAGES = process.argv.slice(3).length ? process.argv.slice(3) : ['fuites', 'alertes', 'a-faire', 'tableau-de-bord', 'marches', 'carte', 'carte-reseau'];
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const MARCHE = process.env.MARCHE ?? 'de000000-0000-4000-8000-000000000000';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

const dossier = mkdtempSync(join(tmpdir(), 'charge-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dossier}`, '--no-first-run',
  '--window-size=1440,900', '--enable-precise-memory-info', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
const urlWs = await new Promise((ok, ko) => {
  let tampon = '';
  chrome.stderr.on('data', (d) => { tampon += d; const m = tampon.match(/DevTools listening on (ws:\S+)/); if (m) ok(m[1]); });
  setTimeout(() => ko(new Error('Chrome ne répond pas')), 15000);
});

// Client DevTools minimal (WebSocket natif de Node)
const ws = new WebSocket(urlWs);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const attente = new Map();
const ecouteurs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && attente.has(m.id)) { const { ok, ko } = attente.get(m.id); attente.delete(m.id); m.error ? ko(new Error(m.error.message)) : ok(m.result); }
  else ecouteurs.forEach((f) => f(m));
});
const envoyer = (method, params = {}, sessionId) => new Promise((ok, ko) => {
  const n = ++id; attente.set(n, { ok, ko }); ws.send(JSON.stringify({ id: n, method, params, sessionId }));
});
const { targetId } = await envoyer('Target.createTarget', { url: 'about:blank' });
const { sessionId: s } = await envoyer('Target.attachToTarget', { targetId, flatten: true });
const cdp = (method, params) => envoyer(method, params, s);
const evaluer = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Performance.enable');
// Tâches longues (> 50 ms) relevées dès le chargement de chaque page
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__lt = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: true }); } catch {}` });
if (PROFIL === 'tablette') {
  await cdp('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 10e6 / 8, uploadThroughput: 5e6 / 8 });
}

// Requêtes en cours vers l'API (attente du réseau au repos)
const enCours = new Set();
ecouteurs.push((m) => {
  if (m.sessionId !== s) return;
  if (m.method === 'Network.requestWillBeSent' && m.params.request.url.includes('/rest/v1')) enCours.add(m.params.requestId);
  if ((m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed')) enCours.delete(m.params.requestId);
});
async function auRepos(calme = 1500, maximum = 120000) {
  const t0 = Date.now();
  let depuis = Date.now();
  while (Date.now() - t0 < maximum) {
    await attendre(100);
    if (enCours.size) depuis = Date.now();
    else if (Date.now() - depuis >= calme) return;
  }
  throw new Error('réseau jamais au repos');
}
const aller = async (chemin) => {
  enCours.clear();
  await cdp('Page.navigate', { url: `${WEB}${chemin}` });
  await new Promise((r) => { const f = (m) => { if (m.sessionId === s && m.method === 'Page.loadEventFired') { ecouteurs.splice(ecouteurs.indexOf(f), 1); r(); } }; ecouteurs.push(f); });
};

// Connexion (relais d'essai : identifiant quelconque)
await aller('/connexion');
await attendre(1500);
await evaluer(`(() => {
  const poser = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  poser(document.getElementById('identifiant'), 'essai'); poser(document.getElementById('mot-de-passe'), 'essai-local');
  document.querySelector('button[type=submit]').click(); })()`);
await attendre(3000);
await auRepos();

const MESURE = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  const api = performance.getEntriesByType('resource').filter((x) => x.name.includes('/rest/v1'));
  const geo = api.filter((x) => x.name.includes('reseau_geojson'));
  return {
    donnees: Math.round(Math.max(0, ...api.map((x) => x.responseEnd))), appels: api.length,
    recuKo: Math.round(api.reduce((t, x) => t + x.encodedBodySize, 0) / 1024), decodeKo: Math.round(api.reduce((t, x) => t + x.decodedBodySize, 0) / 1024),
    reseau: geo.length, reseauKo: Math.round(geo.reduce((t, x) => t + x.decodedBodySize, 0) / 1024),
    tachesLongues: Math.round((window.__lt || []).reduce((t, d) => t + d, 0)), tasMo: Math.round(performance.memory.usedJSHeapSize / 1048576),
    avertissement: [...document.querySelectorAll('[role=alert],[data-slot=alert]')].map((a) => a.innerText.replace(/\\s+/g, ' ')).join(' | ').slice(0, 160),
  };
})()`;

async function memoireRendu() {
  try {
    const { processInfo } = await envoyer('SystemInfo.getProcessInfo');
    const pids = processInfo.filter((p) => p.type === 'renderer' || p.type === 'GPU').map((p) => [p.type, p.id]);
    return pids.map(([t, p]) => `${t} ${Math.round(Number(execFileSync('ps', ['-o', 'rss=', '-p', String(p)]).toString().trim()) / 1024)} Mo`).join(', ');
  } catch (e) { return `inconnue (${e.message})`; }
}

console.log(`Profil ${PROFIL} — ${new Date().toISOString()}\n`);
console.log('| Page | Données reçues | Appels API | Reçu (gzip) | Décodé | Tâches longues | Tas JS | Remarque |');
console.log('|---|---:|---:|---:|---:|---:|---:|---|');
for (const p of PAGES) {
  const reseau = p === 'carte-reseau';
  await evaluer(`localStorage.setItem('suivi-fuites:reseau:actif', '${reseau ? 1 : 0}'); localStorage.setItem('suivi-fuites:reseau:coloration', 'balayage');
    localStorage.removeItem('suivi-fuites:reseau:secteurs:${MARCHE}'); new Promise((r) => { const q = indexedDB.deleteDatabase('suivi-fuites'); q.onsuccess = q.onerror = q.onblocked = () => r(); })`);
  await aller(`/${reseau ? 'carte' : p}`);
  if (reseau) {
    // Réseau : attendre les réponses de tous les secteurs (un appel reseau_geojson par secteur coché)
    const attendus = Number(process.env.SECTEURS ?? 34);
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      const nb = await evaluer(`performance.getEntriesByType('resource').filter((x) => x.name.includes('reseau_geojson') && x.responseEnd > 0).length`);
      if (nb >= attendus) break;
      await attendre(500);
    }
  }
  await auRepos(reseau ? 3000 : 1500, 300000);
  const m = await evaluer(MESURE);
  const memoire = reseau ? `; mémoire : ${await memoireRendu()}` : '';
  console.log(`| ${p} | ${(m.donnees / 1000).toFixed(1)} s | ${m.appels} | ${m.recuKo} Ko | ${m.decodeKo} Ko | ${m.tachesLongues} ms | ${m.tasMo} Mo | ${reseau ? `réseau : ${m.reseau} appels, ${m.reseauKo} Ko` : ''}${memoire}${m.avertissement ? ` ; ${m.avertissement}` : ''} |`);
}

ws.close();
chrome.kill();
await attendre(500);
rmSync(dossier, { recursive: true, force: true });

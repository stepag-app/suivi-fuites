// Essai de bout en bout de la carte de balayage sans réseau (lot CH), en Chrome sans tête piloté par le protocole
// DevTools (sans dépendance), comme dans l'APK (User-Agent « SuiviFuitesAPK » : paquet toujours actif) :
//   1. en ligne : connexion, carte en mode balayage, préparation du paquet (octets reçus par origine) ;
//   2. rechargement en ligne : réseau et fond lus dans les copies de l'appareil ;
//   3. hors ligne (navigateur hors ligne, panneau arrêté, relais coupé) : ouverture directe de la carte, réseau, fond,
//      noms de rues, zoom 17, un tronçon touché puis enregistré (file d'attente, tronçon balayé tout de suite) ;
//   4. retour du réseau : envoi de la file.
// Captures PNG dans le dossier de sortie.
//
// Pré-requis : base d'essai locale (PostgREST + relais qui imite l'authentification, la fonction reseau-tuiles et R2,
// avec un réseau et un fond déposés), panneau construit (`npm run build`) avec NEXT_PUBLIC_MESURE_CARTE=1 et
// NEXT_PUBLIC_SUPABASE_URL pointant le relais ; le script lance et arrête lui-même `next start`.
// Lancement, dans web/ : node scripts/essayer-carte-hors-ligne.mjs <url du relais> <dossier de sortie> [port=3112]
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELAIS = process.argv[2] ?? 'http://127.0.0.1:54398';
const SORTIE = process.argv[3] ?? mkdtempSync(join(tmpdir(), 'carte-hors-ligne-'));
const PORT_WEB = Number(process.argv[4] ?? 3112);
const BASE = `http://localhost:${PORT_WEB}`;
const WEB = fileURLToPath(new URL('..', import.meta.url));
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9300 + Math.floor(Math.random() * 400);
mkdirSync(SORTIE, { recursive: true });
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
const journal = [];
const noter = (t) => { journal.push(t); console.log(t); };

// ---- Panneau (next start) ------------------------------------------------------------------------------------------
let panneau = null;
async function demarrerPanneau() {
  panneau = spawn(join(WEB, 'node_modules/.bin/next'), ['start', '-p', String(PORT_WEB)], { cwd: WEB, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${BASE}/connexion`)).ok) return; } catch { /* démarre */ }
    await attendre(200);
  }
  throw new Error('panneau injoignable');
}
async function arreterPanneau() {
  panneau?.kill('SIGTERM');
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/connexion`); } catch { return; }
    await attendre(100);
  }
}
const couperRelais = (actif) => fetch(`${RELAIS}/__coupure?actif=${actif ? 1 : 0}`, { method: 'POST' });

// ---- Chrome ----------------------------------------------------------------------------------------------------------
const profil = mkdtempSync(join(tmpdir(), 'essai-ch-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profil}`, '--no-first-run',
  '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1280,800', 'about:blank',
], { stdio: 'ignore' });

async function cible() {
  for (let i = 0; i < 50; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((c) => c.type === 'page');
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
const octets = new Map();
const urls = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && attentes.has(m.id)) {
    const { ok, ko } = attentes.get(m.id);
    attentes.delete(m.id);
    if (m.error) ko(new Error(m.error.message)); else ok(m.result);
    return;
  }
  if (m.method === 'Network.responseReceived') urls.set(m.params.requestId, m.params.response.url);
  if (m.method === 'Network.loadingFinished') {
    const u = urls.get(m.params.requestId) ?? '';
    const genre = u.includes('/r2/reseau/') ? 'archive du réseau' : u.includes('/r2/fonds/') ? 'fond de la ville'
      : u.includes('/fond/v1/') ? 'polices et icônes' : u.includes('/rest/v1/') ? 'base (API)' : u.includes('/maplibre/') ? 'MapLibre'
      : u.includes('/_next/') ? 'scripts du panneau' : u.includes('openfreemap') ? 'OpenFreeMap' : 'autre';
    octets.set(genre, (octets.get(genre) ?? 0) + (m.params.encodedDataLength || 0));
  }
  if (m.method) evenements.push(m);
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
const capturer = async (nom) => {
  const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SORTIE, nom), Buffer.from(data, 'base64'));
  noter(`   capture : ${join(SORTIE, nom)}`);
};
const toucher = async (x, y) => {
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const verifier = (condition, texte) => { noter(`${condition ? 'ok' : 'ÉCHEC'} - ${texte}`); if (!condition) process.exitCode = 1; };

// Carte prête : style chargé, réseau affiché, plus de tuile en attente.
const CARTE_PRETE = `(async () => {
  for (let i = 0; i < 600; i++) {
    const m = window.__carteFuites;
    if (m && m.isStyleLoaded() && m.getStyle().layers.some((l) => l.id.startsWith('reseau-')) && m.areTilesLoaded()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
})()`;
const SOURCES = `(() => { const s = window.__carteFuites.getStyle().sources; return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.url ?? v.type])); })()`;
const ouvrirOngletBalayage = `(async () => {
  const bouton = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t));
  if (!document.querySelector('[class*=horsLigne]')) { bouton('Réseau')?.click(); await new Promise((r) => setTimeout(r, 300)); }
  [...document.querySelectorAll('[role=tab]')].find((b) => b.textContent.trim() === 'Balayage')?.click();
  await new Promise((r) => setTimeout(r, 300));
  return document.querySelector('[class*=horsLigne]')?.innerText ?? '';
})()`;

try {
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  const { userAgent } = await cdp('Browser.getVersion');
  await cdp('Network.setUserAgentOverride', { userAgent: `${userAgent} SuiviFuitesAPK` });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false });
  await demarrerPanneau();
  await couperRelais(false);

  // ---- 1. En ligne : connexion, carte, paquet ------------------------------------------------------------------------
  noter('1. En ligne');
  await aller(`${BASE}/connexion`);
  await evaluer(`(async () => {
    for (let i = 0; i < 100 && !document.querySelector('input[type=password]'); i++) await new Promise(r => setTimeout(r, 100));
    const regler = (el, v) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    regler(document.querySelectorAll('input')[0], 'essai'); regler(document.querySelector('input[type=password]'), 'essai-local-ch');
    document.querySelector('button[type=submit]').click();
    for (let i = 0; i < 100 && location.pathname === '/connexion'; i++) await new Promise(r => setTimeout(r, 100));
  })()`);
  octets.clear();
  await aller(`${BASE}/carte?mode=balayage`);
  verifier(await evaluer(CARTE_PRETE), 'carte affichée en ligne');
  const debut = Date.now();
  let etat = '';
  for (let i = 0; i < 240 && !/Prête/.test(etat); i++) {
    await attendre(1000);
    etat = await evaluer(ouvrirOngletBalayage);
  }
  verifier(/Prête/.test(etat), `paquet préparé en ${Math.round((Date.now() - debut) / 1000)} s : « ${etat.replace(/\n+/g, ' | ')} »`);
  const total = [...octets.values()].reduce((a, b) => a + b, 0);
  noter(`   octets reçus pendant l'ouverture et la préparation : ${(total / 1048576).toFixed(1)} Mo`);
  for (const [k, v] of [...octets].sort((a, b) => b[1] - a[1])) noter(`     ${k} : ${(v / 1048576).toFixed(2)} Mo`);
  noter(`   sources : ${JSON.stringify(await evaluer(SOURCES))}`);
  await capturer('1-en-ligne-premiere-ouverture.png');

  // ---- 2. Rechargement en ligne : copies de l'appareil ---------------------------------------------------------------
  noter('2. Rechargement en ligne');
  octets.clear();
  await aller(`${BASE}/carte?mode=balayage`);
  verifier(await evaluer(CARTE_PRETE), 'carte affichée');
  await attendre(1500);
  const sources2 = await evaluer(SOURCES);
  verifier(/reseau-.*-local/.test(JSON.stringify(sources2)), 'réseau lu dans la copie de l\'appareil');
  verifier(/fond-.*-local/.test(JSON.stringify(sources2)), 'fond de la ville lu dans la copie de l\'appareil');
  noter(`   octets reçus (archives) : réseau ${((octets.get('archive du réseau') ?? 0) / 1024).toFixed(0)} Ko, fond ${((octets.get('fond de la ville') ?? 0) / 1024).toFixed(0)} Ko, OpenFreeMap ${((octets.get('OpenFreeMap') ?? 0) / 1024).toFixed(0)} Ko`);

  // ---- 3. Hors ligne -----------------------------------------------------------------------------------------------
  noter('3. Hors ligne (navigateur hors ligne, panneau arrêté, relais coupé)');
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await arreterPanneau();
  await couperRelais(true);
  // Relais lancé avec des jetons courts (EXPIRE_S) : sans réseau, on attend l'expiration, comme après une longue coupure.
  const restant = await evaluer(`(async () => {
    const lire = () => { const k = Object.keys(localStorage).find((c) => /auth-token$/.test(c)); return k ? JSON.parse(localStorage.getItem(k)).expires_at * 1000 - Date.now() : null; };
    for (let i = 0; i < 130 && lire() > 0; i++) await new Promise((r) => setTimeout(r, 1000));
    return lire();
  })()`, 200000);
  noter(`   jeton de la session : ${restant == null ? 'absent' : restant <= 0 ? `expiré depuis ${Math.round(-restant / 1000)} s` : `encore ${Math.round(restant / 1000)} s`}`);
  await aller(`${BASE}/carte?mode=balayage`);
  verifier(await evaluer(CARTE_PRETE), 'carte ouverte sans réseau (page du service worker)');
  await attendre(2000);
  const sources3 = await evaluer(SOURCES);
  verifier(/reseau-.*-local/.test(JSON.stringify(sources3)) && /fond-.*-local/.test(JSON.stringify(sources3)), 'réseau et fond lus dans l\'appareil');
  const barre = await evaluer(`document.querySelector('[role=toolbar]')?.innerText ?? ''`);
  verifier(/Hors ligne · état du/.test(barre), `bandeau : « ${barre.replace(/\n+/g, ' | ')} »`);
  const nbFuites = await evaluer(`[...document.querySelectorAll('button, span, p')].map((e) => e.textContent).find((t) => /sur la carte/.test(t)) ?? ''`);
  noter(`   fuites : ${nbFuites}`);
  await capturer('2-hors-ligne-ville.png');

  // Zoom 17 au centre d'Oujda : noms de rues, diamètres et matériaux.
  await evaluer(`(async () => { const m = window.__carteFuites; m.jumpTo({ center: [-1.9086, 34.6814], zoom: 17 }); for (let i = 0; i < 200 && !(m.loaded() && m.areTilesLoaded()); i++) await new Promise(r => setTimeout(r, 100)); await new Promise(r => setTimeout(r, 800)); })()`);
  const comptes = await evaluer(`(() => {
    const m = window.__carteFuites;
    const ids = m.getStyle().layers.map((l) => l.id);
    const n = (filtre) => m.queryRenderedFeatures({ layers: ids.filter(filtre) }).length;
    return { rues: n((i) => i.startsWith('roads') && !i.includes('label')), nomsRues: n((i) => i.startsWith('roads_labels')),
      batiments: n((i) => i === 'buildings'), troncons: n((i) => i.startsWith('reseau-') && i.endsWith('-trait')),
      etiquettesReseau: n((i) => i.startsWith('reseau-') && /etiquette|texte|label/.test(i)), pois: n((i) => i === 'pois') };
  })()`);
  verifier(comptes.rues > 0 && comptes.nomsRues > 0 && comptes.troncons > 0, `zoom 17 sans réseau : ${JSON.stringify(comptes)}`);
  await capturer('3-hors-ligne-zoom-17.png');

  // Un tronçon touché puis enregistré sans réseau.
  await attendre(3000);
  const cibles = await evaluer(`(() => {
    const m = window.__carteFuites;
    const couches = m.getStyle().layers.map((l) => l.id).filter((i) => i.startsWith('reseau-') && i.endsWith('-trait'));
    const { width, height } = m.getCanvas().getBoundingClientRect();
    const liste = [];
    for (const f of m.queryRenderedFeatures([[width * 0.3, height * 0.3], [width * 0.7, height * 0.7]], { layers: couches })) {
      const c = f.geometry.type === 'LineString' ? f.geometry.coordinates : f.geometry.coordinates[0];
      const a = c[Math.floor(c.length / 2) - (c.length > 1 && c.length % 2 === 0 ? 1 : 0)], b = c[Math.floor(c.length / 2)];
      const p = m.project([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      const deja = m.getFeatureState({ source: f.source, sourceLayer: f.sourceLayer, id: f.id }).balaye;
      if (!deja && p.x > 60 && p.y > 120 && p.x < width - 60 && p.y < height - 60) liste.push({ x: p.x, y: p.y, id: f.id, source: f.source, sourceLayer: f.sourceLayer });
      if (liste.length >= 8) break;
    }
    return liste;
  })()`);
  // Un tronçon non balayé (un essai précédent a pu en balayer) : le premier qui n'annonce pas « déjà balayé ».
  let cibleTroncon = null;
  for (const c of cibles) {
    await toucher(c.x, c.y);
    await attendre(400);
    const t = await evaluer(`document.querySelector('[role=toolbar]')?.innerText ?? ''`);
    if (/1 tronçon/.test(t) && !/déjà balayé/.test(t)) { cibleTroncon = c; break; }
    if (/1 tronçon/.test(t)) { await toucher(c.x, c.y); await attendre(300); }
  }
  verifier(!!cibleTroncon, `tronçon visé : ${JSON.stringify(cibleTroncon)}`);
  if (cibleTroncon) {
    const compte = await evaluer(`document.querySelector('[role=toolbar]')?.innerText ?? ''`);
    verifier(/^1 tronçon|1 tronçon ·/m.test(compte), `sélection : « ${compte.split('\n')[1] ?? compte} »`);
    const message = await evaluer(`(async () => {
      const bouton = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(t));
      bouton('Enregistrer…').click();
      await new Promise((r) => setTimeout(r, 600));
      bouton('Enregistrer (')?.click();
      for (let i = 0; i < 50; i++) {
        const t = [...document.querySelectorAll('[role=status]')].map((e) => e.textContent).find((x) => /balayages? (gardés?|enregistrés?)/.test(x));
        if (t) return t;
        await new Promise((r) => setTimeout(r, 200));
      }
      return '';
    })()`);
    verifier(/gardé sur l'appareil/.test(message), `enregistrement sans réseau : « ${message} »`);
    const etatApres = await evaluer(`(async () => {
      const c = ${JSON.stringify({ source: cibleTroncon.source, sourceLayer: cibleTroncon.sourceLayer, id: cibleTroncon.id })};
      for (let i = 0; i < 75 && !window.__carteFuites.getFeatureState(c).balaye; i++) await new Promise((r) => setTimeout(r, 200));
      return window.__carteFuites.getFeatureState(c);
    })()`);
    verifier(etatApres.balaye === true, `tronçon balayé tout de suite sur la carte : ${JSON.stringify(etatApres)}`);
    const attente = await evaluer(ouvrirOngletBalayage.replace("return document.querySelector('[class*=horsLigne]')?.innerText ?? '';", "return [...document.querySelectorAll('[role=status]')].map((e) => e.textContent).find((x) => /à envoyer/.test(x)) ?? '';"));
    verifier(/1 balayage à envoyer/.test(attente), `file d'attente : « ${attente} »`);
    await capturer('4-hors-ligne-balayage-enregistre.png');
  }

  // ---- 4. Retour du réseau ---------------------------------------------------------------------------------------
  noter('4. Retour du réseau');
  await demarrerPanneau();
  await couperRelais(false);
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  let reste = '…';
  for (let i = 0; i < 60 && reste; i++) {
    await attendre(1000);
    reste = await evaluer(`[...document.querySelectorAll('[role=status]')].map((e) => e.textContent).find((x) => /à envoyer/.test(x)) ?? ''`);
  }
  verifier(!reste, 'file d\'attente envoyée au retour du réseau');
} catch (e) {
  noter(`ÉCHEC - ${e.stack ?? e}`);
  process.exitCode = 1;
  try { await capturer('erreur.png'); } catch { /* sans capture */ }
} finally {
  writeFileSync(join(SORTIE, 'journal.txt'), journal.join('\n') + '\n');
  ws.close();
  chrome.kill();
  await arreterPanneau();
  await couperRelais(false).catch(() => undefined);
}

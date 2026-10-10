// Service worker minimal : garde l'application ouvrable sans réseau.
// - fichiers /_next/static (noms à empreinte, donc immuables) : cache d'abord ;
// - fiche d'une fuite (/fuites/<uuid>) : une seule « coquille » (la page sans données, quelle que
//   soit la fuite) servie hors ligne pour toutes les fiches ; les données de la fiche sont gardées
//   par la page elle-même (IndexedDB). Rien n'est gardé par fuite ici : taille constante ;
// - liste « Fiches disponibles hors ligne » (/fuites/hors-ligne) : gardée avec la coquille, pour s'ouvrir
//   sans réseau même si elle n'a jamais été visitée ;
// - autres pages et données de navigation : réseau d'abord, dernière copie en secours.
// Les appels à Supabase (autre domaine) ne passent jamais par ici.
const CACHE = 'suivi-fuites-v1';
const FICHE = /^\/fuites\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COQUILLE = '/__hors-ligne/fiche-fuite';
const LISTE_HORS_LIGNE = '/fuites/hors-ligne';
// La coquille suit les mises en ligne : relue au plus une fois par heure quand une fiche s'ouvre.
const COQUILLE_FRAICHE_MS = 60 * 60 * 1000;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(oublierFichesUneParUne)
      .then(() => self.clients.claim()),
  );
});

// Les versions précédentes gardaient chaque fiche (page et données de navigation) : on les retire.
async function oublierFichesUneParUne() {
  const cache = await caches.open(CACHE);
  const cles = await cache.keys();
  await Promise.all(cles.filter((r) => FICHE.test(new URL(r.url).pathname)).map((r) => cache.delete(r)));
}

self.addEventListener('fetch', (event) => {
  const requete = event.request;
  if (requete.method !== 'GET') return;
  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname === '/icone.svg') {
    event.respondWith(
      caches.match(requete).then(
        (copie) =>
          copie ||
          fetch(requete).then((reponse) => {
            if (reponse.ok) {
              const double = reponse.clone();
              caches.open(CACHE).then((c) => c.put(requete, double));
            }
            return reponse;
          }),
      ),
    );
    return;
  }

  const fiche = url.pathname.match(FICHE);
  if (fiche) {
    // Données de navigation (RSC) d'une fiche : jamais gardées. Sans réseau, leur échec fait
    // recharger la page par Next, qui passe alors par la coquille ci-dessous.
    if (requete.mode === 'navigate') event.respondWith(ouvrirFiche(event, fiche[1]));
    return;
  }

  event.respondWith(
    fetch(requete)
      .then((reponse) => {
        if (reponse.ok) {
          const double = reponse.clone();
          caches.open(CACHE).then((c) => c.put(requete, double));
        }
        return reponse;
      })
      .catch(() => caches.match(requete).then((copie) => copie || pageHorsLigne())),
  );
});

// La page enregistre une copie de la fiche ouverte en ligne et demande la coquille (cas d'une fiche
// ouverte depuis la liste : la page complète n'a alors jamais été chargée).
self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || message.type !== 'coquille-fiche' || typeof message.id !== 'string' || !UUID.test(message.id)) return;
  event.waitUntil(rafraichirCoquille(message.id).catch(() => undefined));
});

function pageHorsLigne() {
  return new Response('Hors ligne : cette page n\'a pas encore été ouverte avec du réseau.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

const estHtml = (reponse) => (reponse.headers.get('Content-Type') || '').includes('text/html');

async function ouvrirFiche(event, id) {
  try {
    const reponse = await fetch(event.request);
    if (reponse.ok && estHtml(reponse)) event.waitUntil(garderCoquille(reponse.clone(), id).catch(() => undefined));
    return reponse;
  } catch {
    return (await servirCoquille(id)) || pageHorsLigne();
  }
}

// La page d'une fiche ne contient aucune donnée (tout est lu par le navigateur) ; seul l'identifiant
// de la fuite y figure (adresse et paramètres de la route) : il est remplacé par celui demandé.
async function servirCoquille(id) {
  const coquille = await caches.match(COQUILLE);
  if (!coquille) return null;
  const source = coquille.headers.get('X-Fuite-Id');
  const html = await coquille.text();
  return new Response(source ? html.split(source).join(id) : html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

async function garderCoquille(reponse, id) {
  const html = await reponse.text();
  const cache = await caches.open(CACHE);
  await cache.put(COQUILLE, new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Fuite-Id': id, 'X-Garde-Le': String(Date.now()) },
  }));
  await garderFichiers(cache, html);
  try {
    const liste = await fetch(LISTE_HORS_LIGNE, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
    if (liste.ok && estHtml(liste)) {
      const page = await liste.clone().text();
      await cache.put(LISTE_HORS_LIGNE, liste);
      await garderFichiers(cache, page);
    }
  } catch {
    /* réessayé à la prochaine coquille */
  }
}

// Scripts et styles d'une page : gardés tout de suite, pour qu'elle s'ouvre même s'ils n'ont
// jamais été chargés sur cet appareil (mise en ligne récente).
async function garderFichiers(cache, html) {
  const fichiers = new Set(html.match(/\/_next\/static\/[^"'\s<>\\]+/g) || []);
  for (const fichier of fichiers) {
    if (await cache.match(fichier)) continue;
    try {
      const r = await fetch(fichier);
      if (r.ok) await cache.put(fichier, r);
    } catch {
      /* réessayé à la prochaine coquille */
    }
  }
}

async function rafraichirCoquille(id) {
  const actuelle = await caches.match(COQUILLE);
  const gardeLe = Number(actuelle ? actuelle.headers.get('X-Garde-Le') : 0) || 0;
  if (actuelle && Date.now() - gardeLe < COQUILLE_FRAICHE_MS) return;
  const reponse = await fetch(`/fuites/${id}`, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
  if (reponse.ok && estHtml(reponse)) await garderCoquille(reponse, id);
}

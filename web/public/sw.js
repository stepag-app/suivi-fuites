// Service worker minimal : garde l'application ouvrable sans réseau.
// - fichiers /_next/static (noms à empreinte, donc immuables) : cache d'abord ;
// - pages et données de navigation : réseau d'abord, dernière copie en secours.
// Les appels à Supabase (autre domaine) ne passent jamais par ici.
const CACHE = 'suivi-fuites-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((noms) => Promise.all(noms.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

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

  event.respondWith(
    fetch(requete)
      .then((reponse) => {
        if (reponse.ok) {
          const double = reponse.clone();
          caches.open(CACHE).then((c) => c.put(requete, double));
        }
        return reponse;
      })
      .catch(() =>
        caches.match(requete).then(
          (copie) =>
            copie ||
            new Response('Hors ligne : cette page n\'a pas encore été ouverte avec du réseau.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            }),
        ),
      ),
  );
});

const CACHE_NAME = 'histoires-noires-v5';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js?v=5',
  './game.js?v=5',
  './data/stories.js?v=5',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './assets/sang-soie/elena.jpg',
  './assets/sang-soie/frere.jpg',
  './assets/sang-soie/ravisseur.jpg'
];

// Fichiers "coeur" de l'app : on privilégie toujours le réseau en premier,
// pour ne jamais rester bloqué sur une vieille version en cache après une
// mise à jour. Les images, elles, restent cache-first (changent rarement).
const CORE_FILES = ['.js', '.html', '.css', '.json'];
function isCoreFile(url) {
  return CORE_FILES.some(ext => url.includes(ext));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Promise.allSettled : un seul fichier manquant/en erreur ne doit
      // jamais empêcher l'installation du reste du cache.
      Promise.allSettled(ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (isCoreFile(url)) {
    // Network-first : toujours essayer la version la plus fraîche d'abord.
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first pour le reste (images, etc.)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

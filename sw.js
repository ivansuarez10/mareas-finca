/* Mareas de la Finca · service worker (09, ronda 3, 12 oct 2026)
   Caché primero con actualización en segundo plano: abre al instante aunque casi no haya señal,
   y deja listo lo más nuevo para la próxima vez. Al cambiar cualquier archivo de la app,
   subir el número de V (mareas-v6, ...) para que el celular renueve la copia completa. */
const V = 'mareas-v5';
const F = ['./', 'index.html', 'app.js', 'app.css', 'tokens.css', 'data.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(F.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x)))).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;   // nada de red externa
  const u = new URL(req.url); u.search = '';
  const llave = u.href;                                   // sin ?parámetros: una sola copia por archivo
  e.respondWith(
    caches.open(V).then(cache =>
      cache.match(req, { ignoreSearch: true }).then(hit => {
        const red = fetch(req).then(r => {
          if (r && r.ok && r.type === 'basic') cache.put(llave, r.clone());
          return r;
        }).catch(() => null);
        if (hit) { e.waitUntil(red); return hit; }
        return red.then(r => r || cache.match('index.html'));
      })
    )
  );
});

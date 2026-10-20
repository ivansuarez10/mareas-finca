/* Mareas de la Finca · service worker (09, ronda 5, 14 oct 2026)
   Cascarón primero con actualización en segundo plano: abre al instante aunque no haya señal.
   SOLO atiende archivos de este mismo origen. Las consultas a marine-api.open-meteo.com (mareas) y api.open-meteo.com (clima, ronda 7) NO pasan por aquí:
   las manejan datos-vivos.js y clima-vivo.js (con su copia en localStorage) y, sin red, falla limpio y la app sigue con lo guardado.
   Al cambiar cualquier archivo de la app, subir V (mareas-v17, ...) para que el celular renueve la copia completa. */
const V = 'mareas-v16';   // oficial: solo limpia sus propias copias (mareas-v*); la de prueba (mareas-beta-*) vive aparte en el mismo origen
const F = ['./', 'index.html', 'app.js', 'app.css', 'tokens.css', 'data.js', 'datos-vivos.js', 'mareas-cristal.css', 'mareas-cristal.js', 'clima-fondo.css', 'clima-fondo.js', 'clima-nubes.js', 'tinte-motor.js', 'tinte-estados.css', 'clima-paletas.js', 'clima-vivo.js', 'fuentes/figtree-latin.woff2', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(F.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(k => Promise.all(k.filter(x => x.startsWith('mareas-') && !x.startsWith('mareas-beta-') && x !== V).map(x => caches.delete(x)))).then(() => clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;   // red externa (Open-Meteo): ni se toca ni se guarda
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

'use strict';

importScripts('js/routing.js');

/* La shell permite arrancar sin red. Los estáticos propios usan stale-while-
   revalidate; las navegaciones y orígenes externos intentan primero la red.
   La sincronización de datos pertenece a cloud-progress, no al worker.
   Cambiar CACHE_NAME al actualizar el precache fuerza su instalación nueva
   y retira la caché anterior. tests/pwa.test.js vigila el inventario de assets. */

const BASE_PATH = new URL('./', self.location.href).pathname;
const CACHE_PREFIX = 'smr-hub:' + BASE_PATH + ':';
const CACHE_NAME = CACHE_PREFIX + 'v3';

/* El directorio del worker es también el ámbito público de la aplicación. */
const PRECACHE = [
  '',
  'index.html',
  'manifest.json',
  'favicon.png',
  'css/style.css',
  'css/app.css',
  'css/phase7.css',
  'css/print.css',
  'js/data.js',
  'js/curriculum.js',
  'js/content.js',
  'js/questions.js',
  'js/srs.js',
  'js/tools.js',
  'js/tests.js',
  'js/pdf-export.js',
  'js/dashboard.js',
  'js/profile.js',
  'js/offline-store.js',
  'js/routing.js',
  'js/app.js',
  'js/cloud-config.js',
  'js/supabase.js',
  'js/auth.js',
  'js/cloud-profile.js',
  'js/cloud-progress.js',
  'js/cloud-feedback.js',
  'assets/brand/SMR.png',
  'assets/brand/icon-192.png'
].map((path) => BASE_PATH + path);

/* La configuración pública de Supabase la sirve una Pages Function que
   inyecta las variables del despliegue: nunca se cachea, o una rotación de
   clave quedaría servida desde disco. */
const NEVER_CACHE = ['/js/cloud-config.public', BASE_PATH + 'js/cloud-config.public'];

const STATIC_DESTINATIONS = ['script', 'style', 'font', 'image', 'worker', 'manifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      /* add() por archivo: un 404 puntual no debe dejar la PWA sin caché. */
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => (key.startsWith(CACHE_PREFIX) || (BASE_PATH === '/' && /^smr-hub-v\d+$/.test(key))) && key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    })
    .catch(() => null);
  return cached || (await network) || new Response('', { status: 504, statusText: 'Offline' });
}

async function networkFirst(request, useFallbackCache) {
  try {
    const response = await fetch(request);
    if (useFallbackCache && response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    if (useFallbackCache) {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    /* Sin red ni copia: la app sigue arrancando; sus módulos de nube ya
       tratan la ausencia del SDK o del endpoint como modo local-first. */
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function navigationFallback(request) {
  try {
    return await fetch(request);
  } catch {
    if (!SMR.routing.isRoute(new URL(request.url).pathname)) {
      return new Response('Página no encontrada.', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    /* Cualquier ruta limpia (/tests, /herramientas?tool=raid) se sirve con la
       shell; el router de app.js lee location.pathname y pinta esa vista. */
    const shell = (await caches.match(BASE_PATH)) || (await caches.match(BASE_PATH + 'index.html'));
    // index.html puede haberse precacheado tras un redirect; la navegación necesita una respuesta nueva.
    return shell ? new Response(shell.body, { headers: shell.headers }) : Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (NEVER_CACHE.some((path) => url.pathname === path || url.pathname === path + '.js')) return;

  if (url.origin !== self.location.origin) {
    const cacheable = STATIC_DESTINATIONS.indexOf(request.destination) !== -1;
    event.respondWith(networkFirst(request, cacheable));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

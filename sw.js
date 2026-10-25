'use strict';

/* SMR Hub — Service Worker (PWA offline-first)
   ---------------------------------------------
   QUÉ ES: cachea el App Shell (lo que index.html carga para arrancar) y
   responde desde caché sin red. Estrategias:
     - mismo origen, estáticos ......... stale-while-revalidate
     - navegaciones ................... red primero, y si no hay red, la
                                        shell cacheada (cualquier ruta limpia
                                        /tests se pinta desde /index.html)
     - otros orígenes (Supabase, CDN) .. red primero; si falla, la copia en
                                        caché si es un estático (script,
                                        estilo, fuente, imagen) y si no una
                                        respuesta 504 controlada
   QUÉ NO ES: no sincroniza datos ni escribe en Supabase. La cola offline
   (js/offline-store.js) y la sincronización son de cloud-progress.

   Subir CACHE_NAME al cambiar los archivos precacheados: el install vuelve a
   pedirlos y el activate borra la versión anterior. tests/pwa.test.js
   comprueba que PRECACHE coincide con lo que carga index.html. */

const CACHE_NAME = 'smr-hub-v1';

/* Rutas absolutas: el SW vive en la raíz y su ámbito es todo el sitio. */
const PRECACHE = [
  '/',
  '/index.html',
  '/404.html',
  '/manifest.json',
  '/favicon.png',
  '/css/style.css',
  '/css/app.css',
  '/css/phase7.css',
  '/css/print.css',
  '/js/data.js',
  '/js/curriculum.js',
  '/js/content.js',
  '/js/questions.js',
  '/js/srs.js',
  '/js/tools.js',
  '/js/tests.js',
  '/js/pdf-export.js',
  '/js/dashboard.js',
  '/js/profile.js',
  '/js/offline-store.js',
  '/js/app.js',
  '/js/cloud-config.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/cloud-profile.js',
  '/js/cloud-progress.js',
  '/js/cloud-feedback.js',
  '/assets/brand/SMR.png',
  '/assets/brand/icon-192.png'
];

/* La configuración pública de Supabase la sirve una Pages Function que
   inyecta las variables del despliegue: nunca se cachea, o una rotación de
   clave quedaría servida desde disco. */
const NEVER_CACHE = ['/js/cloud-config.public'];

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
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
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
  /* Con caché responde ya y la red actualiza en segundo plano. */
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
    /* Cualquier ruta limpia (/tests, /herramientas?tool=raid) se sirve con la
       shell; el router de app.js lee location.pathname y pinta esa vista. */
    const shell = await caches.match('/index.html');
    if (shell) return shell;
    return (await caches.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    const cacheable = STATIC_DESTINATIONS.indexOf(request.destination) !== -1;
    event.respondWith(networkFirst(request, cacheable));
    return;
  }

  if (NEVER_CACHE.some((path) => url.pathname === path || url.pathname === path + '.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

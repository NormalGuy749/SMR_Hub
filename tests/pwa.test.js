'use strict';

/* Comprueba manifest, assets y cableado del worker en el repositorio;
   el precache se contrasta con index.html y manifest.json para detectar
   scripts o iconos omitidos. offline-store usa una IndexedDB simulada.
   Ejecuta también el worker con Cache API y red simuladas en ambas bases. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { bootRouting } = require('./helpers/routing');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
async function check(name, fn) {
  try { await fn(); record(name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ' → ' + e.message); if (process.env.TRACE === '1') console.error(e.stack); }
}

const HTML = fs.readFileSync('index.html', 'utf8');
const APP = fs.readFileSync('js/app.js', 'utf8');
const SW = fs.readFileSync('sw.js', 'utf8');
const STORE = fs.readFileSync('js/offline-store.js', 'utf8');
const PROGRESS = fs.readFileSync('js/cloud-progress.js', 'utf8');
const MANIFEST_RAW = fs.readFileSync('manifest.json', 'utf8');
const MANIFEST = JSON.parse(MANIFEST_RAW);

function pngSize(file) {
  const buf = fs.readFileSync(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function loadWorker(basePath) {
  const events = {}, entries = new Map(), added = [], deleted = [];
  const keyFor = (request) => new URL(typeof request === 'string' ? request : request.url, 'https://smr.test').href;
  function cacheFor(name) {
    if (!entries.has(name)) entries.set(name, new Map());
    const data = entries.get(name);
    return {
      async add(url) { added.push(url); data.set(keyFor(url), new Response('cached:' + url)); },
      async put(request, response) { data.set(keyFor(request), response); },
      async match(request) { const found = data.get(keyFor(request)); return found && found.clone(); }
    };
  }
  const caches = {
    async open(name) { return cacheFor(name); },
    async keys() { return [...entries.keys()]; },
    async delete(name) { deleted.push(name); return entries.delete(name); },
    async match(request) {
      for (const name of entries.keys()) {
        const found = await cacheFor(name).match(request);
        if (found) return found;
      }
    }
  };
  const self = {
    location: new URL('https://smr.test' + basePath + 'sw.js'),
    addEventListener(type, fn) { events[type] = fn; },
    skipWaiting: async () => {}, clients: { claim: async () => {} }
  };
  const ctx = { self, caches, URL, Response, fetch: async () => { throw new Error('offline'); } };
  vm.runInNewContext(SW + '\n;globalThis.state = { CACHE_NAME, PRECACHE, NEVER_CACHE };', ctx);
  return {
    ctx, events, caches, added, deleted, state: ctx.state,
    async lifecycle(type) { let pending; events[type]({ waitUntil(promise) { pending = promise; } }); await pending; },
    request(url, mode = 'navigate', destination = 'document') {
      let response;
      events.fetch({ request: { url, method: 'GET', mode, destination }, respondWith(promise) { response = promise; } });
      return response;
    }
  };
}

/* ---------- IndexedDB simulada (solo la API que usa el módulo) ---------- */

function fakeIndexedDB() {
  const databases = {};
  function makeDb(data) {
    return {
      objectStoreNames: { contains: (name) => Object.prototype.hasOwnProperty.call(data, name) },
      createObjectStore: (name) => { data[name] = new Map(); },
      transaction(storeName) {
        const tx = { error: null, oncomplete: null, onerror: null, onabort: null };
        const store = data[storeName];
        tx.objectStore = () => ({
          put(obj) { store.set(obj.type, JSON.parse(JSON.stringify(obj))); return { result: obj.type }; },
          getAll() { return { result: [...store.values()] }; },
          clear() { store.clear(); return { result: undefined }; }
        });
        setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
        return tx;
      }
    };
  }
  return {
    open(name) {
      const request = {};
      setTimeout(() => {
        if (!databases[name]) databases[name] = {};
        request.result = makeDb(databases[name]);
        if (request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      }, 0);
      return request;
    }
  };
}

function loadStore(withIndexedDB) {
  const context = { console, setTimeout, clearTimeout };
  context.window = context;
  if (withIndexedDB) context.indexedDB = fakeIndexedDB();
  vm.createContext(context);
  vm.runInContext(STORE, context);
  return context.window.SMR.offlineStore;
}

console.log('\nmanifest.json');

check('identidad y modo de presentación', () => {
  assert(MANIFEST.name === 'SMR Hub - Plataforma de Estudio CFGM SMR', MANIFEST.name);
  assert(MANIFEST.short_name === 'SMR Hub');
  assert(MANIFEST.start_url === './' && MANIFEST.scope === './', MANIFEST.start_url);
  assert(MANIFEST.display === 'standalone', MANIFEST.display);
  assert(MANIFEST.theme_color === '#0f172a' && MANIFEST.background_color === '#0f172a');
});

check('dos iconos declarados, 192 y 512, con fichero existente', () => {
  const sizes = MANIFEST.icons.map((i) => i.sizes);
  assert(sizes.includes('192x192') && sizes.includes('512x512'), sizes.join(','));
  MANIFEST.icons.forEach((icon) => {
    const file = icon.src.replace(/^\//, '');
    assert(fs.existsSync(file), 'falta ' + file);
    assert(icon.type === 'image/png', icon.src);
  });
});

check('las dimensiones del PNG coinciden con las declaradas', () => {
  MANIFEST.icons.forEach((icon) => {
    const { w, h } = pngSize(icon.src.replace(/^\//, ''));
    assert(icon.sizes === `${w}x${h}`, `${icon.src}: declarado ${icon.sizes}, real ${w}x${h}`);
  });
});

console.log('\nindex.html');

check('enlaza el manifest y declara el tema', () => {
  assert(/<link rel="manifest" href="manifest\.json">/.test(HTML));
  assert(/<meta name="theme-color" content="#0f172a">/.test(HTML));
});

check('metas de iOS y apple-touch-icon existente', () => {
  assert(/<meta name="apple-mobile-web-app-capable" content="yes">/.test(HTML));
  assert(/<meta name="apple-mobile-web-app-title" content="SMR Hub">/.test(HTML));
  const touch = HTML.match(/<link rel="apple-touch-icon" href="([^"]+)">/);
  assert(touch, 'sin apple-touch-icon');
  assert(fs.existsSync(touch[1].replace(/^\//, '')), 'falta ' + touch[1]);
});

check('la cola offline se carga antes que app.js', () => {
  const store = HTML.indexOf('js/offline-store.js');
  const app = HTML.indexOf('src="js/app.js"');
  assert(store !== -1, 'offline-store.js no está enlazado');
  assert(store < app, 'offline-store.js debe ir antes de app.js');
});

console.log('\nsw.js');

check('versión de caché esperada', () => {
  assert(loadWorker('/').state.CACHE_NAME === 'smr-hub:/:v2');
});

const PRE_CACHE = loadWorker('/').state.PRECACHE;

check('precachea justo lo que arranca la app', () => {
  /* Solo rutas locales: el SDK va por CDN y la config pública la inyecta una
     Function, así que no se precachean. */
  const scripts = [...HTML.matchAll(/<script (?:defer )?src="(js\/[^"]+)"/g)].map((m) => '/' + m[1]);
  const styles = [...HTML.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"/g)].map((m) => '/' + m[1]);
  const brand = [...HTML.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((m) => '/' + m[1]);
  const icons = MANIFEST.icons.map((i) => '/' + i.src);
  const expected = new Set(['/', '/index.html', '/manifest.json', '/favicon.png', ...scripts, ...styles, ...brand, ...icons]);
  const actual = new Set(PRE_CACHE);
  const missing = [...expected].filter((u) => !actual.has(u));
  const extra = [...actual].filter((u) => !expected.has(u));
  assert(!missing.length, 'sin precachear: ' + missing.join(', '));
  assert(!extra.length, 'precachea de más: ' + extra.join(', '));
});

check('todos los archivos precacheados existen en el repositorio', () => {
  PRE_CACHE.filter((u) => u !== '/').forEach((url) => {
    const file = url.replace(/^\//, '');
    assert(fs.existsSync(file) && fs.statSync(file).isFile(), 'falta ' + url);
  });
});

check('no cachea la configuración pública inyectada', () => {
  for (const base of ['/', '/SMR_Hub/']) {
    const h = loadWorker(base);
    for (const url of ['https://smr.test' + base + 'js/cloud-config.public', 'https://smr-hub.pages.dev/js/cloud-config.public']) {
      for (const extension of ['', '.js']) assert(h.request(url + extension, 'cors', 'script') === undefined, 'config interceptada: ' + url);
    }
  }
});

check('install precarga y activate borra versiones antiguas', () => {
  assert(/addEventListener\('install'/.test(SW));
  assert(/cache\.add\(url\)/.test(SW));
  assert(/addEventListener\('activate'/.test(SW));
  assert(/caches\.delete\(key\)/.test(SW) && /key !== CACHE_NAME/.test(SW));
  assert(/clients\.claim\(\)/.test(SW));
});

check('estrategias: SWR propio, red primero externo y shell en navegación', () => {
  assert(/function staleWhileRevalidate/.test(SW));
  assert(/function networkFirst/.test(SW));
  assert(/request\.mode === 'navigate'/.test(SW));
  assert(/caches\.match\(BASE_PATH \+ 'index\.html'\)/.test(SW));
  assert(/url\.origin !== self\.location\.origin/.test(SW));
});

console.log('\nregistro y reconexión en app.js');

check('registra el worker y scope de cada base solo en contexto seguro', () => {
  const fn = APP.slice(APP.indexOf('function registerServiceWorker'), APP.indexOf('async function flushOfflineQueue'));
  for (const entry of ['https://smr.test/', 'https://normalguy749.github.io/SMR_Hub/', 'http://127.0.0.1:8875/SMR_Hub/', 'http://localhost:8875/']) {
    const h = bootRouting(HTML, entry);
    const calls = [];
    h.ctx.navigator = { serviceWorker: { register: (url, options) => { calls.push({ url, options }); return Promise.resolve(); } } };
    vm.runInContext(fn + '\nregisterServiceWorker();', h.ctx);
    const base = new URL(entry).pathname;
    assert(calls.length === 1 && calls[0].url === base + 'sw.js', 'registro fuera de base: ' + entry);
    assert(calls[0].options.scope === base, 'scope fuera de base');
  }
  for (const entry of ['http://smr.test/', 'file:///tmp/smr/index.html']) {
    const h = bootRouting(HTML, entry);
    h.ctx.navigator = { serviceWorker: { register() { throw new Error('contexto inseguro'); } } };
    vm.runInContext(fn + '\nregisterServiceWorker();', h.ctx);
  }
});

check('init registra el worker y escucha online', () => {
  const init = APP.slice(APP.indexOf('function init()'), APP.indexOf('\ninit();'));
  assert(/registerServiceWorker\(\);/.test(init));
  assert(/addEventListener\('online', flushOfflineQueue\)/.test(init));
});

check('la cola se vacía solo con sesión y delega el envío', () => {
  const fn = APP.slice(APP.indexOf('async function flushOfflineQueue'), APP.indexOf('/* ---------- Arranque'));
  assert(/SMR\.auth\.isSignedIn\(\)/.test(fn), 'no comprueba la sesión');
  assert(/getPendingActions\(\)/.test(fn) && /clearPendingActions\(\)/.test(fn));
  assert(/cloudSession\.resumeSync/.test(fn), 'no reengancha la sincronización');
});

check('guardar progreso sin red deja la acción pendiente', () => {
  const save = APP.slice(APP.indexOf('  save() {'), APP.indexOf('  /* --- Recursos --- */'));
  assert(/navigator\.onLine === false/.test(save), 'sin comprobación de conexión');
  assert(/offlineStore\.savePendingAction\('progress'/.test(save));
});

check('cloud-progress expone resumeSync por el camino del re-login', () => {
  assert(/resumeSync: function \(\) \{ return initialSync\(runtime\.currentUser\); \}/.test(PROGRESS));
});

console.log('\njs/offline-store.js');

(async function main() {
  await check('manifest, precache y fallback offline respetan ambas bases', async () => {
    for (const base of ['/', '/SMR_Hub/']) {
      const entry = 'https://smr.test' + base;
      const manifestURL = new URL('manifest.json', entry);
      assert(new URL(MANIFEST.start_url, manifestURL).href === entry, 'start_url incorrecto');
      assert(new URL(MANIFEST.scope, manifestURL).href === entry, 'scope incorrecto');
      MANIFEST.icons.forEach((icon) => assert(new URL(icon.src, manifestURL).href.startsWith(entry + 'assets/'), 'icono fuera de base'));
      const h = loadWorker(base);
      await h.lifecycle('install');
      assert(h.added.length === PRE_CACHE.length && h.added.every((url) => url.startsWith(base)), 'precache fuera de base');
      assert(!h.added.some((url) => /404\.html|SMR_Hub\/SMR_Hub\//.test(url)), '404 o prefijo duplicado');
      for (const route of ['tests', 'herramientas', 'recursos', 'glosario', 'exportar']) {
        const response = await h.request(entry + route + '?q=1');
        assert(await response.text() === 'cached:' + base + 'index.html', 'shell offline incorrecta: ' + route);
      }
      const redirect = await h.request(entry + 'tests/?mode=srs');
      assert(redirect.status === 301 && redirect.headers.get('Location') === entry + 'tests?mode=srs', 'barra final offline incorrecta');
    }
  });
  await check('activate elimina solo cachés propias y migra la v1 de Cloudflare', async () => {
    for (const base of ['/', '/SMR_Hub/']) {
      const h = loadWorker(base);
      const stale = 'smr-hub:' + base + ':v1';
      const other = 'smr-hub:' + (base === '/' ? '/SMR_Hub/' : '/') + ':v2';
      for (const key of [h.state.CACHE_NAME, stale, other, 'smr-hub-v1', 'otra-app']) await h.caches.open(key);
      await h.lifecycle('activate');
      assert(h.deleted.includes(stale), 'no limpia su versión anterior');
      assert(h.deleted.includes('smr-hub-v1') === (base === '/'), 'migración v1 incorrecta');
      assert(!h.deleted.includes(other) && !h.deleted.includes('otra-app') && !h.deleted.includes(h.state.CACHE_NAME), 'borra cachés ajenas o actuales');
    }
  });
  await check('el worker conserva navegación online, SWR local y red externa', async () => {
    const h = loadWorker('/SMR_Hub/');
    await h.lifecycle('install');
    h.ctx.fetch = async () => new Response('online');
    assert(await (await h.request('https://smr.test/SMR_Hub/tests')).text() === 'online', 'no usa red en navegación');
    assert(await (await h.request('https://smr.test/SMR_Hub/js/app.js', 'cors', 'script')).text() === 'cached:/SMR_Hub/js/app.js', 'falló SWR local');
    assert(await (await h.request('https://cdn.test/sdk.js', 'cors', 'script')).text() === 'online', 'falló red externa');
  });
  await check('guarda, lee y limpia', async () => {
    const store = loadStore(true);
    await store.savePendingAction('progress', { a: 1 });
    await store.savePendingAction('test', { b: 2 });
    const pending = await store.getPendingActions();
    assert(pending.length === 2, 'esperaba 2 acciones, hay ' + pending.length);
    const progress = pending.find((p) => p.type === 'progress');
    assert(progress.payload.a === 1, 'payload perdido');
    assert(typeof progress.at === 'number', 'sin marca de tiempo');
    await store.clearPendingActions();
    assert((await store.getPendingActions()).length === 0, 'la cola no se vació');
  });

  await check('guardar dos veces el mismo tipo reemplaza, no acumula', async () => {
    const store = loadStore(true);
    await store.savePendingAction('progress', { n: 1 });
    await store.savePendingAction('progress', { n: 2 });
    const pending = await store.getPendingActions();
    assert(pending.length === 1, 'acciones acumuladas: ' + pending.length);
    assert(pending[0].payload.n === 2, 'se conservó la instantánea vieja');
  });

  await check('rechaza un tipo vacío sin lanzar síncronamente', async () => {
    const store = loadStore(true);
    let rejected = false;
    await store.savePendingAction('', {}).catch(() => { rejected = true; });
    assert(rejected, 'debería rechazar');
  });

  await check('sin IndexedDB rechaza y no rompe la app', async () => {
    const store = loadStore(false);
    let rejected = false;
    await store.getPendingActions().catch(() => { rejected = true; });
    assert(rejected, 'debería rechazar sin IndexedDB');
    await store.savePendingAction('progress', {}).catch(() => {});
  });

  console.log(`\n${failed ? 'FALLOS: ' + failed + ' · ' : ''}${passed} ok, ${failed} fallos`);
  process.exit(failed ? 1 : 0);
})();

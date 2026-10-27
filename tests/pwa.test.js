'use strict';

/* Comprueba manifest, assets y cableado del worker en el repositorio;
   el precache se contrasta con index.html y manifest.json para detectar
   scripts o iconos omitidos. offline-store usa una IndexedDB simulada.
   No ejecuta el ciclo de vida del worker ni una red real. */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

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
  assert(MANIFEST.start_url === '/', MANIFEST.start_url);
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
  assert(/<link rel="manifest" href="\/manifest\.json">/.test(HTML));
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
  assert(/const CACHE_NAME = 'smr-hub-v1';/.test(SW));
});

const PRE_CACHE = (() => {
  const block = SW.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert(block, 'sin lista PRECACHE');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
})();

check('precachea justo lo que arranca la app', () => {
  /* Solo rutas locales: el SDK va por CDN y la config pública la inyecta una
     Function, así que no se precachean. */
  const scripts = [...HTML.matchAll(/<script (?:defer )?src="(js\/[^"]+)"/g)].map((m) => '/' + m[1]);
  const styles = [...HTML.matchAll(/<link rel="stylesheet" href="(css\/[^"]+)"/g)].map((m) => '/' + m[1]);
  const brand = [...HTML.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map((m) => '/' + m[1]);
  const icons = MANIFEST.icons.map((i) => i.src);
  const expected = new Set(['/', '/index.html', '/404.html', '/manifest.json', '/favicon.png', ...scripts, ...styles, ...brand, ...icons]);
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
  assert(/NEVER_CACHE = \['\/js\/cloud-config\.public'\]/.test(SW));
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
  assert(/caches\.match\('\/index\.html'\)/.test(SW));
  assert(/url\.origin !== self\.location\.origin/.test(SW));
});

console.log('\nregistro y reconexión en app.js');

check('registra /sw.js solo en contexto seguro', () => {
  const fn = APP.slice(APP.indexOf('function registerServiceWorker'), APP.indexOf('async function flushOfflineQueue'));
  assert(/serviceWorker' in navigator/.test(fn), 'sin guard de serviceWorker');
  assert(/location\.protocol !== 'https:'/.test(fn), 'sin guard de https');
  assert(/localhost/.test(fn) && /127\.0\.0\.1/.test(fn), 'sin loopback');
  assert(/register\('\/sw\.js'\)/.test(fn));
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

'use strict';

/* Ejecuta configuración, cliente y bootstrap reales con origen, DOM y SDK
   simulados. La Pages Function también se ejecuta con context.env de prueba.
   Se comprueban la selección por hostname, el orden de carga y el contrato
   de ruta de Pages: /js/cloud-config.public, sin la última extensión .js.
   Las mutaciones del HTML comprueban que las aserciones detectan roturas.
   No valida credenciales ni el comportamiento de un despliegue remoto. */

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function check(name, fn) {
  try { fn(); record(name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ' → ' + e.message); if (process.env.TRACE === '1') console.error(e.stack); }
}

const SRC_CONFIG = fs.readFileSync('js/cloud-config.js', 'utf8');
const SRC_SUPABASE = fs.readFileSync('js/supabase.js', 'utf8');
const SRC_SLOT = fs.readFileSync('js/cloud-config.public.js', 'utf8');
const SRC_FN = fs.readFileSync('functions/js/cloud-config.public.js', 'utf8');
const LOCAL_URL = 'http://127.0.0.1:54321';

/* La Function de Pages es un módulo ES: se extrae su export para poder
   ejecutarlo aquí sin dependencias ni transpilador. */
function loadPagesFunction(src) {
  const cuerpo = src.replace(/^export\s+function\s+onRequestGet/m, 'function onRequestGet');
  assert(cuerpo !== src || /export\s+function\s+onRequestGet/.test(src) === false,
    'no se encontró `export function onRequestGet` en la Function de Pages');
  return new Function('Response', cuerpo + '\nreturn { onRequestGet: onRequestGet };')(FakeResponse).onRequestGet;
}

/* Response mínimo: basta con cabeceras y cuerpo como texto. */
class FakeResponse {
  constructor(body, init) {
    this.body = body;
    this.status = 200;
    this.headers = new Map(Object.entries((init && init.headers) || {}));
  }
  get(header) { return this.headers.get(header); }
}

const onRequestGet = loadPagesFunction(SRC_FN);

/* Un arranque completo: cloud-config.js y después supabase.js, como en index.html. */
function boot(o) {
  const o2 = o || {};
  const said = [];
  const calls = [];
  const g = {};
  g.window = g;
  g.location = { hostname: o2.host === undefined ? 'localhost' : o2.host, search: '', hash: '' };
  g.console = { log() {}, warn: (...a) => said.push(a.join(' ')), info() {}, error() {} };
  if ('url' in o2) g.SMR_SUPABASE_URL = o2.url;
  if ('key' in o2) g.SMR_SUPABASE_ANON_KEY = o2.key;
  if (o2.sdk !== false) {
    g.supabase = { createClient: (url, key) => { calls.push({ url, key }); return { url, key }; } };
  }
  /* Se reproduce el orden de arranque: configuración pública → local → cliente. */
  new Function('window', 'globalThis', 'slot' in o2 ? o2.slot : SRC_SLOT)(g, g);
  new Function('window', 'globalThis', SRC_CONFIG)(g, g);
  new Function('window', 'globalThis', SRC_SUPABASE)(g, g);
  return { g, said, calls };
}

function slotFrom(env) { return onRequestGet({ env }).body; }

/* ---------- 1. Local con configuración local ---------- */

check('1: origen local → el archivo fija el stack local y el cliente se inicializa con él', () => {
  ['localhost', '127.0.0.1', '[::1]', ''].forEach((host) => {
    const r = boot({ host });
    assert(r.g.SMR_SUPABASE_URL === LOCAL_URL, 'en ' + (host || 'file://') + ' no se fijó la URL local: ' + r.g.SMR_SUPABASE_URL);
    assert(typeof r.g.SMR_SUPABASE_ANON_KEY === 'string' && r.g.SMR_SUPABASE_ANON_KEY.length > 20, 'sin clave pública local en ' + (host || 'file://'));
    assert(r.g.SMR.cloudAvailable === true, 'el cliente no se inicializó en ' + (host || 'file://'));
    assert(r.calls.length === 1 && r.calls[0].url === LOCAL_URL, 'el cliente no usó la URL local');
  });
});

/* ---------- 2. Origen público con inyección previa ---------- */

check('2: origen público con configuración inyectada por la ranura → manda lo inyectado, sin tocar el stack local', () => {
  const r = boot({ host: 'smr-hub.pages.dev', slot: slotFrom({ SMR_SUPABASE_URL: 'https://proyecto.supabase.co', SMR_SUPABASE_ANON_KEY: 'sb_publishable_publica' }) });
  assert(r.g.SMR_SUPABASE_URL === 'https://proyecto.supabase.co', 'la inyección fue sobrescrita: ' + r.g.SMR_SUPABASE_URL);
  assert(r.g.SMR_SUPABASE_ANON_KEY === 'sb_publishable_publica', 'la clave inyectada fue sobrescrita');
  assert(r.g.SMR.cloudAvailable === true, 'el cliente no se inicializó con la configuración pública');
  assert(r.calls[0].url === 'https://proyecto.supabase.co', 'el cliente no usó la URL pública');
  assert(r.calls[0].url.indexOf('127.0.0.1') === -1, 'el cliente público acabó apuntando a loopback');
});

check('2b: la inyección previa no depende de la clave del stack local', () => {
  const r = boot({ host: 'smr-hub.pages.dev', slot: slotFrom({ SMR_SUPABASE_URL: 'https://proyecto.supabase.co', SMR_SUPABASE_ANON_KEY: 'sb_publishable_publica' }) });
  const serializado = String(r.g.SMR_SUPABASE_URL) + ' ' + String(r.g.SMR_SUPABASE_ANON_KEY);
  assert(serializado.indexOf('ACJWlzQHlZjBrEguHvfOxg') === -1, 'la clave pública del stack local viajó a un origen público');
});

/* ---------- 3. Origen público sin configuración ---------- */

check('3: origen público SIN configuración → no fija nada y la app queda local-first (sin peticiones)', () => {
  const r = boot({ host: 'smr-hub.pages.dev' });
  assert(r.g.SMR_SUPABASE_URL === undefined, 'se fijó una URL en un origen público: ' + r.g.SMR_SUPABASE_URL);
  assert(r.g.SMR_SUPABASE_ANON_KEY === undefined, 'se fijó una clave en un origen público');
  assert(r.g.SMR.cloudAvailable === false, 'cloudAvailable debería ser false');
  assert(r.g.SMR.cloud === null, 'SMR.cloud debería ser null');
  assert(r.calls.length === 0, 'se inicializó un cliente sin configuración');
});

/* ---------- 4. Configuración incompleta o inválida ---------- */

check('4: configuración incompleta o vacía → no se inicializa ni revienta', () => {
  const casos = [
    { host: 'smr-hub.pages.dev', url: 'https://proyecto.supabase.co' },
    { host: 'smr-hub.pages.dev', key: 'sb_publishable_publica' },
    { host: 'smr-hub.pages.dev', url: '', key: '' },
    { host: 'smr-hub.pages.dev', url: 'no-es-una-url', key: 'sb_publishable_publica' }
  ];
  casos.forEach((c, i) => {
    const r = boot(c);
    assert(r.g.SMR.cloudAvailable === false, 'caso ' + i + ': se inicializó con configuración inválida');
    assert(r.g.SMR.cloud === null, 'caso ' + i + ': SMR.cloud no es null');
  });
  /* Con SDK presente, un URL malformado llega a createClient: lo que no puede
     pasar es que la app se declare conectada si el SDK no existe. */
  const sinSdk = boot({ host: 'smr-hub.pages.dev', url: 'https://proyecto.supabase.co', key: 'k', sdk: false });
  assert(sinSdk.g.SMR.cloudAvailable === false, 'sin SDK no debe considerarse disponible');
});

/* ---------- 5. Endpoint local en origen público (configuración errónea) ---------- */

check('5: origen público con la configuración LOCAL inyectada por error → no se conecta a loopback', () => {
  /* Vector realista: la ranura (o la Function, mal configurada) trae los
     valores del stack local a un origen público. */
  const r = boot({ host: 'smr-hub.pages.dev', slot: slotFrom({ SMR_SUPABASE_URL: LOCAL_URL, SMR_SUPABASE_ANON_KEY: 'sb_publishable_del_stack_local' }) });
  assert(r.g.SMR.cloudAvailable === false, 'el cliente público se conectó al endpoint local');
  assert(r.calls.length === 0, 'se llamó al SDK con el endpoint local desde un origen público');
  assert(r.said.some((s) => /loopback/.test(s)), 'no se avisó de la configuración loopback');
});

/* ---------- 6. CDN caída ---------- */

check('6: SDK no disponible (CDN caída) → la app sigue en local, sin errores', () => {
  const r = boot({ host: 'localhost', sdk: false });
  assert(r.g.SMR.cloudAvailable === false && r.g.SMR.cloud === null, 'cloudAvailable debe ser false sin SDK');
  assert(r.said.some((s) => /no inicializado/.test(s)), 'no se registró el fallo del SDK');
  assert(r.g.SMR_SUPABASE_URL === LOCAL_URL, 'la configuración local se perdió');
});

/* ---------- 7. Sin secretos en el cliente ---------- */

check('7: el contrato sólo admite claves públicas (nunca service_role/sb_secret)', () => {
  [SRC_CONFIG, SRC_SUPABASE].forEach((src) => {
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/service_role|sb_secret/.test(codigo), 'hay una credencial privilegiada en el código del cliente');
  });
});

/* ---------- 8. Orden de carga real (index.html) ---------- */

const HTML_INDEX = fs.readFileSync('index.html', 'utf8');
const GHP_HOST = 'normalguy749.github.io';
const CFG_RELATIVA = 'js/cloud-config.public';
const CFG_GHP_ABSOLUTA = 'https://smr-hub.pages.dev/js/cloud-config.public';

function scriptSrcs(html) {
  return [...(html || HTML_INDEX).matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
}

/* El bloque inline que inyecta la configuración. No basta con BUSCAR la cadena
   `cloud-config.public` en el HTML: hay que ejecutar la selección de rama. */
function inlineBootstrap(html) {
  const bloques = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
  const conWrite = bloques.filter((m) => /document\.write/.test(m[2]));
  assert(conWrite.length === 1,
    'index.html debe tener UN bloque inline que escriba la configuración (hay ' + conWrite.length + ')');
  assert(!/\b(defer|async)\b/.test(conWrite[0][1]),
    'el bloque que inyecta la configuración no puede ser defer/async: debe ejecutarse al parsear, antes de los defer');
  return conWrite[0][2];
}

function configSrcFor(html, host) {
  const escrito = [];
  const g = { location: { hostname: host }, document: { write: (s) => escrito.push(String(s)) } };
  new Function('window', 'document', inlineBootstrap(html))(g, g.document);
  assert(escrito.length === 1,
    'el bloque debe escribir exactamente un <script> para ' + JSON.stringify(host) + ' (escribió ' + escrito.length + ')');
  const m = /^<script src="([^"]+)"><\/script>$/.exec(escrito[0].trim());
  assert(m, 'la escritura no es una etiqueta <script src=…>: ' + escrito[0]);
  return m[1];
}

/* Posiciones del arranque de Supabase: el bloque inline (que corre al parsear)
   tiene que ir ANTES de la CDN y de los defer que consumen la configuración. */
function bootPositions(html) {
  const boot = inlineBootstrap(html);
  return {
    bootstrap: html.indexOf(boot),
    cdn: html.indexOf('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'),
    config: html.indexOf('js/cloud-config.js'),
    client: html.indexOf('js/supabase.js'),
    auth: html.indexOf('js/auth.js'),
    profile: html.indexOf('js/cloud-profile.js'),
    progress: html.indexOf('js/cloud-progress.js'),
    feedback: html.indexOf('js/cloud-feedback.js')
  };
}

function checkOrder(html) {
  const p = bootPositions(html);
  const orden = ['bootstrap', 'cdn', 'config', 'client', 'auth', 'profile', 'progress', 'feedback'];
  orden.forEach((n) => assert(p[n] >= 0, 'falta ' + n + ' en index.html'));
  for (let i = 1; i < orden.length; i++) {
    assert(p[orden[i - 1]] < p[orden[i]],
      'orden de carga incorrecto: ' + orden[i - 1] + ' debería ir antes que ' + orden[i]);
  }
  return true;
}

check('8: index.html carga la configuración antes del cliente y del SDK', () => {
  checkOrder(HTML_INDEX);
  assert(scriptSrcs().some((s) => /supabase-js/.test(s)), 'la CDN del SDK no está como <script src>');
});

/* ---------- 10. Ranura de despliegue (js/cloud-config.public.js) ---------- */

check('10: la ranura con seguimiento es inerte (no fija nada, no puede conectar)', () => {
  const r = boot({ host: 'smr-hub.pages.dev' });
  assert(r.g.SMR_SUPABASE_URL === undefined && r.g.SMR_SUPABASE_ANON_KEY === undefined, 'la ranura define valores');
  assert(r.g.SMR.cloudAvailable === false, 'la ranura por sí sola habilita la nube');
  assert(!/[^\/]127\.0\.0\.1|localhost/.test(SRC_SLOT.replace(/\/\*[\s\S]*?\*\//g, ' ')), 'la ranura menciona un endpoint en código');
});

/* ---------- 11. Pages Function: variables de entorno → script público ---------- */

check('11: la Pages Function emite solo la configuración pública y solo si es válida', () => {
  const ok = onRequestGet({ env: { SMR_SUPABASE_URL: 'https://abc.supabase.co', SMR_SUPABASE_ANON_KEY: 'sb_publishable_xyz' } });
  assert(/window\.SMR_SUPABASE_URL = "https:\/\/abc\.supabase\.co"/.test(ok.body), 'no emite la URL esperada: ' + ok.body);
  assert(/window\.SMR_SUPABASE_ANON_KEY = "sb_publishable_xyz"/.test(ok.body), 'no emite la clave pública');
  assert(ok.get('Content-Type').indexOf('javascript') !== -1, 'Content-Type incorrecto: ' + ok.get('Content-Type'));
  assert(/no-store/.test(ok.get('Cache-Control')), 'la configuración se cachea: ' + ok.get('Cache-Control'));
  /* sin variables, incompletas o malformadas → script inerte, nunca parcial */
  [{}, { SMR_SUPABASE_URL: 'https://abc.supabase.co' }, { SMR_SUPABASE_ANON_KEY: 'sb_publishable_xyz' },
    { SMR_SUPABASE_URL: 'no-es-url', SMR_SUPABASE_ANON_KEY: 'sb_publishable_xyz' },
    { SMR_SUPABASE_URL: 'https://abc.supabase.co', SMR_SUPABASE_ANON_KEY: 'k' },
    { SMR_SUPABASE_URL: '   ', SMR_SUPABASE_ANON_KEY: '   ' }].forEach((env, i) => {
    const out = onRequestGet({ env }).body;
    assert(!/SMR_SUPABASE_(URL|ANON_KEY)\s*=/.test(out), 'entorno ' + i + ' emitió configuración parcial: ' + out);
  });
  /* los valores se emiten escapados: una clave con comillas no rompe el script */
  const raro = onRequestGet({ env: { SMR_SUPABASE_URL: 'https://abc.supabase.co', SMR_SUPABASE_ANON_KEY: 'k"x\\n;alert(1)//long' } });
  const g = {}; g.window = g;
  new Function('window', 'globalThis', raro.body)(g, g);
  assert(g.SMR_SUPABASE_ANON_KEY === 'k"x\\n;alert(1)//long', 'el valor no sobrevivió al escapado: ' + g.SMR_SUPABASE_ANON_KEY);
});

check('11b: la Pages Function no lee ni menciona secretos de servidor', () => {
  const codigo = SRC_FN.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  ['service_role', 'sb_secret', 'SERVICE', 'JWT_SECRET'].forEach((palabra) =>
    assert(codigo.indexOf(palabra) === -1, 'la Function menciona ' + palabra));
  /* solo los dos nombres públicos, y como texto de búsqueda en env */
  const nombres = [...new Set([...codigo.matchAll(/env\[([A-Z_]+)\]/g)].map((m) => m[1]))].sort();
  assert(nombres.length === 2 && nombres.join(',') === 'KEY_VAR,URL_VAR', 'la Function lee variables inesperadas: ' + nombres.join(', '));
  assert(/const URL_VAR = 'SMR_SUPABASE_URL'/.test(SRC_FN) && /const KEY_VAR = 'SMR_SUPABASE_ANON_KEY'/.test(SRC_FN),
    'los dos nombres leídos ya no son la URL y la clave publicable');
  const r = boot({ host: 'smr-hub.pages.dev', slot: onRequestGet({ env: {} }).body });
  assert(r.g.SMR.cloudAvailable === false, 'una Function vacía dejó la nube activa');
});

/* ---------- 12. Enrutamiento real: la ruta pedida es la que la Function implementa ---------- */

/* Regla de Cloudflare Pages: la ruta se forma quitando LA ÚLTIMA extensión al
   archivo bajo functions/ (`path.extname` + `slice`). Referencia del generador:
   https://github.com/cloudflare/workers-sdk/blob/main/packages/pages-functions/src/routing/filepath-routing.ts */
function pagesRoute(file) {
  assert(file.startsWith('functions/'), 'no es un archivo de functions/: ' + file);
  const rel = file.slice('functions/'.length);
  const ext = path.extname(rel);
  const sinExt = rel.slice(0, rel.length - ext.length);
  const ruta = path.basename(sinExt) === 'index' ? path.dirname(sinExt) : sinExt;
  return '/' + (ruta === '.' ? '' : ruta);
}

check('12: index.html pide exactamente la ruta que sirve la Pages Function', () => {
  const esperada = pagesRoute('functions/js/cloud-config.public.js');
  /* La rama relativa es la de Cloudflare Pages (y cualquier otro origen). */
  ['smr-hub.pages.dev', 'localhost', '127.0.0.1', ''].forEach((host) => {
    const pedida = configSrcFor(HTML_INDEX, host);
    assert(pedida === CFG_RELATIVA, 'en ' + (host || 'file://') + ' se pide ' + pedida + ' en vez de ' + CFG_RELATIVA);
    assert(!/\.js$/.test(pedida),
      'la ruta pedida (' + pedida + ') termina en .js: Pages le quita la última extensión al archivo de la Function, así que esa petición no la ejecutaría');
    assert('/' + pedida.replace(/^\.?\//, '') === esperada,
      'index.html pide ' + pedida + ' pero la Function de functions/js/cloud-config.public.js se sirve en ' + esperada);
    /* Sin asset estático en esa ruta, la Function no puede quedar tapada por un
       archivo inerte: la respuesta la decide siempre la Function. */
    assert(!fs.existsSync(pedida.replace(/^\.?\//, '')),
      'hay un archivo estático en la ruta de la Function (' + pedida + '): el despliegue podría servir ese archivo en vez de la configuración');
  });
});

/* ---------- 13. Selección de rama por hostname (GitHub Pages) ---------- */

check('13: la rama de GitHub Pages pide la configuración absoluta y las demás la relativa', () => {
  const ghp = configSrcFor(HTML_INDEX, GHP_HOST);
  assert(ghp === CFG_GHP_ABSOLUTA,
    'en ' + GHP_HOST + ' se pide ' + ghp + ' en vez de ' + CFG_GHP_ABSOLUTA);
  assert(ghp.endsWith('/' + CFG_RELATIVA),
    'la URL absoluta de GitHub Pages (' + ghp + ') no apunta a la ruta de la Pages Function');
  /* La comparación es EXACTA: ni un subdominio ni un host que solo la contenga
     deben recibir la configuración de otro despliegue. */
  ['www.' + GHP_HOST, 'x' + GHP_HOST, GHP_HOST + '.evil.test', 'smr-hub.pages.dev', 'localhost', ''].forEach((host) => {
    assert(configSrcFor(HTML_INDEX, host) === CFG_RELATIVA,
      'con hostname ' + JSON.stringify(host) + ' no se eligió la rama relativa');
  });
});

/* ---------- 14. Sensibilidad: las comprobaciones anteriores no son vacuas ---------- */

check('14: las comprobaciones fallan si se rompe la selección de hostname o el orden', () => {
  const condicion = "window.location.hostname === '" + GHP_HOST + "'";
  const rotoHost = HTML_INDEX.replace(condicion, "window.location.hostname !== '" + GHP_HOST + "'");
  assert(rotoHost !== HTML_INDEX, 'no se pudo mutar la condición del hostname (¿cambió el código de index.html?)');
  assert(configSrcFor(rotoHost, GHP_HOST) !== CFG_GHP_ABSOLUTA,
    'con la condición invertida la comprobación de GitHub Pages seguiría pasando');

  const boot = inlineBootstrap(HTML_INDEX);
  const movido = HTML_INDEX.replace(boot, '').replace('</body>', '<script>' + boot + '</script></body>');
  assert(movido !== HTML_INDEX, 'no se pudo mover el bloque de configuración');
  let detectado = false;
  try { checkOrder(movido); } catch (e) { detectado = true; }
  assert(detectado, 'con el bloque al final la comprobación de orden seguiría pasando');
});

/* ---------- 9. Local-first intacto sin cloud ---------- */

check('9: sin configuración, el contrato local-first se mantiene (visitante y offline)', () => {
  const r = boot({ host: 'smr-hub.pages.dev' });
  assert(r.g.SMR.cloudAvailable === false, 'cloudAvailable');
  /* supabase.js es el ÚNICO punto que decide conexión: no crea cliente ni
     promete sesión. La app arranca igual (data.js y app.js no dependen de él). */
  assert(/SMR\.cloud = null/.test(SRC_SUPABASE), 'supabase.js ya no degrada a null');
  assert(r.g.SMR.cloud === null, 'no debe existir cliente');
});

if (process.env.CLOUD_CONFIG_SELFTEST === '1') {
  try { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); record('auto-verificación (no debe llegar aquí)'); }
  catch (e) { failed++; console.error('  ✗ auto-verificación → ' + e.message); }
}

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log(`OK: ${passed}  FAIL: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
});

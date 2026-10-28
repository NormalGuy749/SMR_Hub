'use strict';

/* Ejecuta el módulo de routing y el bootstrap HTML reales en ambos montajes.
   Los metadatos usan un DOM mínimo; no valida indexación ni hosting remoto. */

const fs = require('fs');
const vm = require('vm');
const { bootRouting } = require('./helpers/routing');
const { routes, hostingResponse } = require('./helpers/hosting');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function check(name, fn) {
  try { fn(); record(name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ' → ' + e.message); if (process.env.TRACE === '1') console.error(e.stack); }
}

const HTML = fs.readFileSync('index.html', 'utf8');
const APP = fs.readFileSync('js/app.js', 'utf8');
const DOMINIO = 'https://smr-hub.pages.dev';
const ROOT = bootRouting(HTML, DOMINIO + '/');

function metas(attr, valor) {
  return [...HTML.matchAll(new RegExp('<(?:meta|link)[^>]*' + attr + '="' + valor + '"[^>]*>', 'g'))].map((m) => m[0]);
}
function contenido(tag) {
  const m = tag.match(/content="([^"]*)"/);
  return m ? m[1] : null;
}

function slice(from, to) {
  const a = APP.indexOf(from);
  const b = APP.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error('marcador no encontrado en js/app.js: ' + from);
  return APP.slice(a, b);
}

/* Núcleo de rutas: sin dependencias del DOM (pathFor, titleFor, SITE_ORIGIN). */
const CORE = slice('const SITE_ORIGIN', 'const ROUTES = {');
const METADATA = slice('function updateMetadata(', 'function canonicalizeUrl(');

const SITE = vm.runInNewContext(CORE + '\n;({ SITE_ORIGIN, pathFor, titleFor })', { SMR: ROOT.ctx.SMR });
const parsePath = ROOT.routing.parsePath;

function fakeDoc() {
  const sels = [
    'meta[name="description"]', 'meta[name="keywords"]',
    'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:url"]',
    'meta[name="twitter:title"]', 'meta[name="twitter:description"]',
    'link[rel="canonical"]'
  ];
  const els = {};
  sels.forEach((sel) => { els[sel] = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }; });
  return { title: '', els, querySelector: (sel) => els[sel] || null };
}
function runCanonicalize(loc) {
  const start = DOMINIO + (loc.pathname || '/') + (loc.search || '') + (loc.hash || '');
  const h = bootRouting(HTML, start);
  h.routing.canonicalizeUrl();
  return h.location.href === start ? [] : [h.location.pathname + h.location.search + h.location.hash];
}

check('1: un solo <title>, descriptivo y sin repetir la marca al final', () => {
  const titulos = [...HTML.matchAll(/<title>([^<]*)<\/title>/g)];
  assert(titulos.length === 1, 'hay ' + titulos.length + ' etiquetas <title>');
  const t = titulos[0][1].trim();
  assert(t.length >= 30 && t.length <= 70, 'longitud poco útil para un resultado (' + t.length + '): ' + t);
  assert(t.startsWith('SMR Hub'), 'el título no empieza por el nombre del sitio: ' + t);
  assert(/Sistemas Microinformáticos y Redes/.test(t), 'el título no dice de qué trata el sitio: ' + t);
  assert(!/SMR Hub\s*[·|-]\s*SMR Hub/.test(t), 'la marca está duplicada en el título: ' + t);
});

check('2: una sola descripción, útil, y la de keywords que escribe el router', () => {
  const d = metas('name', 'description');
  assert(d.length === 1, 'hay ' + d.length + ' meta description');
  const c = contenido(d[0]);
  assert(c && c.length >= 50 && c.length <= 160, 'descripción fuera de rango (' + (c || '').length + '): ' + c);
  assert(HTML.indexOf('id="meta-desc"') !== -1, 'la descripción perdió el id que actualiza el router');
  const k = metas('name', 'keywords');
  assert(k.length === 1, 'hay ' + k.length + ' meta keywords (updateMetadata necesita exactamente una)');
  const terms = (contenido(k[0]) || '').split(',').map((s) => s.trim()).filter(Boolean);
  assert(terms.length >= 3 && terms.length <= 8, 'keywords fuera de rango (' + terms.length + '): ' + terms.join(', '));
});

check('3: canonical y og:url absolutos, iguales y sin hash ni query', () => {
  const can = [...HTML.matchAll(/<link[^>]*rel="canonical"[^>]*>/g)].map((m) => (m[0].match(/href="([^"]*)"/) || [])[1]);
  assert(can.length === 1, 'hay ' + can.length + ' canonical');
  assert(can[0] === DOMINIO + '/', 'canonical inesperada: ' + can[0]);
  const og = metas('property', 'og:url');
  assert(og.length === 1 && contenido(og[0]) === can[0], 'og:url no coincide con la canonical: ' + (og[0] && contenido(og[0])));
  assert(!/[#?]/.test(can[0]), 'la canonical lleva hash o query: ' + can[0]);
});

check('4: Open Graph y Twitter comparten título y descripción con el documento', () => {
  const titulo = HTML.match(/<title>([^<]*)<\/title>/)[1].trim();
  const desc = contenido(metas('name', 'description')[0]);
  [['property', 'og:title'], ['name', 'twitter:title']].forEach(([a, v]) => {
    const n = metas(a, v);
    assert(n.length === 1 && contenido(n[0]) === titulo, v + ' no coincide con <title>');
  });
  [['property', 'og:description'], ['name', 'twitter:description']].forEach(([a, v]) => {
    const n = metas(a, v);
    assert(n.length === 1 && contenido(n[0]) === desc, v + ' no coincide con la meta description');
  });
  assert(metas('property', 'og:type').length === 1, 'falta og:type');
  assert(metas('property', 'og:locale')[0] && /^es(_|$)/.test(contenido(metas('property', 'og:locale')[0])), 'og:locale no declara español');
});

check('5: la imagen social existe, es absoluta y declara su tamaño real', () => {
  const img = metas('property', 'og:image');
  assert(img.length === 1, 'hay ' + img.length + ' og:image');
  const url = contenido(img[0]);
  assert(url.startsWith(DOMINIO + '/'), 'og:image no es absoluta en el dominio principal: ' + url);
  const rel = url.slice(DOMINIO.length + 1);
  assert(fs.existsSync(rel), 'og:image apunta a un archivo que no existe: ' + rel);
  const png = fs.readFileSync(rel);
  assert(png.slice(1, 4).toString() === 'PNG', rel + ' ya no es un PNG');
  const ancho = png.readUInt32BE(16), alto = png.readUInt32BE(20);
  const w = metas('property', 'og:image:width')[0], h = metas('property', 'og:image:height')[0];
  assert(w && h, 'faltan og:image:width/height');
  assert(Number(contenido(w)) === ancho && Number(contenido(h)) === alto,
    'las dimensiones declaradas (' + contenido(w) + '×' + contenido(h) + ') no son las del PNG (' + ancho + '×' + alto + ')');
  assert(metas('name', 'twitter:card').length === 1, 'falta twitter:card');
});

check('6: un JSON-LD WebSite válido que no contradice la página', () => {
  const blobs = [...HTML.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert(blobs.length === 1, 'hay ' + blobs.length + ' bloques JSON-LD');
  const j = JSON.parse(blobs[0]);
  assert(j['@context'] === 'https://schema.org', '@context inesperado: ' + j['@context']);
  assert(j['@type'] === 'WebSite', '@type inesperado: ' + j['@type']);
  assert(j.url === DOMINIO + '/', 'url del JSON-LD distinta de la canonical: ' + j.url);
  assert(j.name === 'SMR Hub' && j.inLanguage === 'es', 'nombre o idioma del sitio incorrectos');
  assert(contenido(metas('name', 'description')[0]) === j.description, 'la descripción del JSON-LD no coincide con la visible');
});

check('7: idioma declarado y un único <h1>', () => {
  assert(/<html[^>]*lang="es"/.test(HTML), 'el documento no declara lang="es"');
  const h1 = [...HTML.matchAll(/<h1[\s>]/g)];
  assert(h1.length === 1, 'hay ' + h1.length + ' <h1>');
  assert(/<meta charset="UTF-8">/i.test(HTML), 'falta la declaración de codificación');
  assert(/name="viewport"/.test(HTML), 'falta el viewport');
});

/* ---------- 8-11. Router de URLs limpias ---------- */

check('8: pathFor y parsePath resuelven rutas limpias y consultas', () => {
  assert(SITE.pathFor('inicio') === '/', 'pathFor(inicio) debe ser "/": ' + SITE.pathFor('inicio'));
  assert(SITE.pathFor('tests') === '/tests', 'pathFor(tests) mal: ' + SITE.pathFor('tests'));
  const casos = [
    ['/', 'inicio', ''],
    ['', 'inicio', ''],
    ['/inicio', 'inicio', ''],
    ['/tests', 'tests', ''],
    ['/tests/', 'tests', ''],
    ['/tests?test=redes-1&mode=examen', 'tests', 'test=redes-1&mode=examen'],
    ['/recursos?q=a%20b', 'recursos', 'q=a+b'],
    ['/no-existe', 'no-existe', '']
  ];
  casos.forEach(([url, id, query]) => {
    const r = parsePath(url);
    assert(r.id === id, 'parsePath(' + JSON.stringify(url) + ').id = ' + r.id + ', esperado ' + id);
    assert(String(r.query) === query, 'parsePath(' + JSON.stringify(url) + ').query = ' + String(r.query));
  });
  assert(parsePath('/tests?test=x').query.get('test') === 'x', 'la consulta no se decodifica');
});

check('9: updateMetadata escribe las ocho etiquetas y la canonical por ruta', () => {
  const route = { title: 'Tests', desc: 'Cuestionarios de autoevaluación por módulo.', keywords: ['tests SMR', 'cuestionarios'] };
  const doc = fakeDoc();
  const fn = vm.runInNewContext(CORE + METADATA + '\n;updateMetadata', { document: doc, SMR: ROOT.ctx.SMR });
  fn(route, 'tests');
  const a = (sel) => doc.els[sel].attrs;
  assert(doc.title === 'Tests · SMR Hub', 'title mal: ' + doc.title);
  assert(a('meta[name="description"]').content === route.desc, 'description no inyectada');
  assert(a('meta[name="keywords"]').content === 'tests SMR, cuestionarios', 'keywords no inyectadas');
  assert(a('meta[property="og:title"]').content === doc.title, 'og:title no coincide');
  assert(a('meta[property="og:description"]').content === route.desc, 'og:description no coincide');
  assert(a('meta[property="og:url"]').content === DOMINIO + '/tests', 'og:url mal: ' + a('meta[property="og:url"]').content);
  assert(a('meta[name="twitter:title"]').content === doc.title, 'twitter:title no coincide');
  assert(a('meta[name="twitter:description"]').content === route.desc, 'twitter:description no coincide');
  assert(a('link[rel="canonical"]').href === DOMINIO + '/tests', 'canonical mal: ' + a('link[rel="canonical"]').href);

  /* La portada usa el título largo y la raíz como canonical. */
  const home = fakeDoc();
  const fn2 = vm.runInNewContext(CORE + METADATA + '\n;updateMetadata', { document: home, SMR: ROOT.ctx.SMR });
  fn2({ title: 'Inicio', seoTitle: 'SMR Hub — Tests y recursos', desc: 'Panel.', keywords: ['SMR Hub'] }, 'inicio');
  assert(home.title === 'SMR Hub — Tests y recursos', 'la portada perdió su seoTitle: ' + home.title);
  assert(home.els['link[rel="canonical"]'].attrs.href === DOMINIO + '/', 'canonical de la portada mal');
});

check('10: canonicalizeUrl convierte #/vista y /inicio a la URL limpia', () => {
  assert(runCanonicalize({ hash: '#/tests?mode=srs' })[0] === '/tests?mode=srs', 'no migra #/tests?mode=srs');
  assert(runCanonicalize({ hash: '#/inicio' })[0] === '/', 'no normaliza #/inicio');
  assert(runCanonicalize({ hash: '#/recursos?q=x' })[0] === '/recursos?q=x', 'no migra #/recursos?q=x');
  assert(runCanonicalize({ pathname: '/inicio', search: '' })[0] === '/', 'no normaliza /inicio');
  assert(runCanonicalize({ pathname: '/tests', hash: '' }).length === 0, 'reescribe una URL ya limpia');
});

check('11: 404.html transporta pathname, query y hash al entrypoint de ambos hostings', () => {
  assert(fs.existsSync('404.html'), 'falta 404.html para el fallback del hosting estático');
  const html = fs.readFileSync('404.html', 'utf8');
  assert(/<meta\s+name="robots"\s+content="noindex"/.test(html), 'el 404 no declara noindex');
  for (const entry of [DOMINIO + '/', 'https://normalguy749.github.io/SMR_Hub/']) {
    const requested = entry + 'tests?mode=srs&q=a%20b#pregunta-2';
    const h = bootRouting(html, requested);
    const redirect = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
    vm.runInContext(redirect, h.ctx);
    assert(h.replacements.length === 1, 'el 404 no redirige exactamente una vez');
    assert(h.replacements[0].startsWith(entry + '#smrhub-route='), 'entrypoint incorrecto');
    const restored = bootRouting(HTML, h.replacements[0]);
    restored.routing.restorePathFrom404();
    assert(restored.location.href === requested, 'no recupera la URL completa');
    restored.routing.restorePathFrom404();
    assert(restored.location.href === requested, 'la recuperación no es de un solo uso');
    const missingEntry = bootRouting(html, entry);
    missingEntry.routing.redirectFrom404();
    assert(!missingEntry.replacements.length, 'bucle si falta el entrypoint');
  }
});

/* ---------- 12. Sin enlaces al router antiguo ---------- */

check('12: no quedan enlaces ni rutas con #/ en la aplicación', () => {
  const archivos = ['js/app.js', 'js/tools.js', 'js/tests.js', 'index.html'];
  archivos.forEach((f) => {
    const txt = fs.readFileSync(f, 'utf8');
    const hits = [...txt.matchAll(/(?:href|path)\s*[:=]\s*['"`]#\//g)].map((m) => m[0]);
    assert(hits.length === 0, f + ' conserva enlaces al router antiguo: ' + hits.slice(0, 3).join(' | '));
  });
});

check('13: toda ruta de ROUTES tiene una URL limpia y metadatos', () => {
  const ids = Object.keys(routes);
  assert(ids.length >= 14, 'se esperaban al menos 14 rutas, hay ' + ids.length);
  ids.forEach((id) => {
    assert(routes[id].title && routes[id].keywords.length, 'sin metadatos: ' + id);
    assert(parsePath(SITE.pathFor(id)).id === id, 'ruta no reversible: ' + id);
    assert(ROOT.routing.isRoute(SITE.pathFor(id)), 'ruta no reconocida por 404/SW: ' + id);
    const response = hostingResponse('cloudflare', DOMINIO + '/' + id);
    assert(response.status === 200 && !response.headers.has('Location'), 'entrada directa inestable: ' + id);
  });
  assert(SITE.SITE_ORIGIN === DOMINIO, 'SITE_ORIGIN no coincide con el dominio canónico: ' + SITE.SITE_ORIGIN);
});

check('14: ambas bases generan y parsean rutas sin duplicar el prefijo', () => {
  assert(bootRouting(HTML, DOMINIO + '/SMR_Hub/tests').routing.basePath === '/', 'Cloudflare cambió de montaje por el pathname');
  for (const entry of [DOMINIO + '/', 'https://normalguy749.github.io/SMR_Hub/', 'http://127.0.0.1:8875/SMR_Hub/']) {
    const h = bootRouting(HTML, entry + 'tests/');
    const base = new URL(entry).pathname;
    assert(h.routing.basePath === base, 'base incorrecta: ' + entry);
    for (const id of ['tests', 'herramientas', 'recursos', 'glosario', 'exportar']) {
      const path = h.routing.publicPath('/' + id + '?q=a%20b#seccion');
      assert(path === base + id + '?q=a%20b#seccion', path);
      assert(h.routing.publicPath(path) === path, 'prefijo duplicado: ' + path);
      assert(h.routing.publicPath('/' + id + '/') === base + id, 'barra final no normalizada');
      assert(h.routing.parsePath(path).id === id, 'parseo incorrecto: ' + path);
      assert(h.routing.parsePath(path).query.get('q') === 'a b', 'query mezclada con hash');
    }
    for (const home of ['/', '/inicio', '/index.html', base, base + 'index.html']) {
      assert(h.routing.publicPath(home) === base, 'Inicio sale del montaje: ' + home);
      assert(h.routing.parsePath(home).id === 'inicio', 'Inicio no reconocido: ' + home);
    }
    h.location.href = entry + '#/tests?mode=srs';
    h.routing.canonicalizeUrl();
    assert(h.location.href === entry + 'tests?mode=srs', 'legacy pierde el prefijo');
    const doc = fakeDoc();
    const metadata = vm.runInNewContext(CORE + METADATA + '\n;updateMetadata', { document: doc, SMR: h.ctx.SMR });
    metadata({ title: 'Tests', desc: 'Pruebas', keywords: [] }, 'tests');
    assert(doc.els['link[rel="canonical"]'].attrs.href === DOMINIO + '/tests', 'el mirror se convirtió en canonical');
  }
});

check('15: recuperación inválida no permite salir del origen ni del montaje', () => {
  const entry = 'https://normalguy749.github.io/SMR_Hub/';
  for (const path of ['https://evil.test/', '//evil.test/', '/fuera', '/SMR_Hub/../fuera', '/SMR_Hub/../../fuera']) {
    const h = bootRouting(HTML, entry + '#smrhub-route=' + encodeURIComponent(path));
    h.routing.restorePathFrom404();
    assert(h.location.href === entry, 'recuperación fuera del montaje: ' + path);
  }
  const malformed = bootRouting(HTML, entry + '#smrhub-route=%E0%A4%A');
  malformed.routing.restorePathFrom404();
  assert(malformed.location.href === entry, 'fragmento inválido sin consumir');
});

check('16: SMR.navigate conserva base, query, hash e Inicio con History API real simulada', () => {
  const navigate = APP.match(/SMR\.navigate\s*=\s*[\s\S]*?\n};/)[0];
  for (const entry of [DOMINIO + '/', 'https://normalguy749.github.io/SMR_Hub/']) {
    const h = bootRouting(HTML, entry);
    let renders = 0;
    h.ctx.render = () => { renders++; };
    vm.runInContext(navigate, h.ctx);
    h.ctx.SMR.navigate('/tests?mode=srs#pregunta');
    assert(h.location.href === entry + 'tests?mode=srs#pregunta', 'navigate pierde base o consulta');
    h.ctx.SMR.navigate(h.location.pathname + h.location.search + h.location.hash);
    assert(!h.location.pathname.includes('/SMR_Hub/SMR_Hub/'), 'prefijo duplicado');
    h.ctx.SMR.navigate('/inicio', true);
    assert(h.location.href === entry && renders === 3, 'no vuelve a Inicio');
  }
});

check('17: assets, enlaces, sitemap y canonical permanecen dentro de su contrato', () => {
  for (const entry of [DOMINIO + '/', 'https://normalguy749.github.io/SMR_Hub/']) {
    const h = bootRouting(HTML, entry + 'herramientas/');
    for (const match of HTML.matchAll(/(?:src|href)="((?:js|css|assets)\/[^" ]+|manifest\.json|\.\/)"/g)) {
      assert(new URL(match[1], h.document.baseURI).href.startsWith(entry), 'asset fuera del montaje: ' + match[1]);
    }
  }
  const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
  for (const route of ['', 'tests', 'herramientas', 'recursos', 'glosario', 'exportar']) {
    assert(sitemap.includes('<loc>' + DOMINIO + '/' + route + '</loc>'), 'sitemap incoherente: ' + route);
  }
  assert(fs.readFileSync('robots.txt', 'utf8').includes('Sitemap: ' + DOMINIO + '/sitemap.xml'), 'robots apunta al mirror');
});

check('18: Cloudflare normaliza cada ruta una vez y deja assets, consultas y 404 intactos', () => {
  for (const id of Object.keys(routes)) {
    for (const suffix of ['', '/']) {
      const url = new URL(DOMINIO + '/' + id + suffix + '?q=a%20b#seccion');
      let response = hostingResponse('cloudflare', url);
      if (suffix) {
        assert(response.status === 301, 'sin normalización: ' + url);
        const target = new URL(response.headers.get('Location'));
        assert(target.pathname === '/' + id && target.search === url.search && target.hash === url.hash, 'se pierde ruta/query/hash');
        response = hostingResponse('cloudflare', target);
      }
      assert(response.status === 200 && !response.headers.has('Location'), 'ruta no termina en 200: ' + url);
    }
  }
  for (const file of ['js/routing.js', 'js/app.js', 'css/app.css', 'assets/brand/SMR.png', 'manifest.json', 'js/cloud-config.public']) {
    const response = hostingResponse('cloudflare', DOMINIO + '/' + file);
    assert(response.status === 200 && !response.headers.get('Content-Type').includes('text/html'), 'asset interceptado: ' + file);
  }
  for (const hosting of ['cloudflare', 'github']) {
    const base = hosting === 'github' ? '/SMR_Hub/' : '/';
    for (const path of ['no-existe', 'tests/no-existe', 'recursos/subnetting', 'assets/no-existe.js']) {
      const url = DOMINIO + base + path + '?q=1#seccion';
      assert(hostingResponse(hosting, url).status === 404, 'ruta inexistente no es 404: ' + url);
      const h = bootRouting(fs.readFileSync('404.html', 'utf8'), url.replace(DOMINIO, hosting === 'github' ? 'https://normalguy749.github.io' : DOMINIO));
      h.routing.redirectFrom404();
      assert(h.replacements.length === 0, 'el 404 recupera una ruta inexistente: ' + path);
      assert(!h.routing.isRoute(new URL(url).pathname), 'subruta aceptada: ' + path);
    }
  }
  const old = fs.readFileSync('_redirects', 'utf8').replace(/ \/ 200/g, ' /index.html 200');
  assert(hostingResponse('cloudflare', DOMINIO + '/tests', old).status === 308, 'el simulador no reproduce el fallo original');
});

console.log('\nOK: ' + passed + ' FAIL: ' + failed);
process.exit(failed === 0 ? 0 : 1);

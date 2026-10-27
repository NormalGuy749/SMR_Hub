'use strict';

/* Comprueba el contrato estático del head de index.html. No valida
   respuestas HTTP del hosting, indexación, sitemap ni despliegues remotos. */

const fs = require('fs');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function check(name, fn) {
  try { fn(); record(name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ' → ' + e.message); if (process.env.TRACE === '1') console.error(e.stack); }
}

const HTML = fs.readFileSync('index.html', 'utf8');
const DOMINIO = 'https://smr-hub.pages.dev/';

function metas(attr, valor) {
  return [...HTML.matchAll(new RegExp('<(?:meta|link)[^>]*' + attr + '="' + valor + '"[^>]*>', 'g'))].map((m) => m[0]);
}
function contenido(tag) {
  const m = tag.match(/content="([^"]*)"/);
  return m ? m[1] : null;
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

check('2: una sola descripción, útil y no copiada de otra vista', () => {
  const d = metas('name', 'description');
  assert(d.length === 1, 'hay ' + d.length + ' meta description');
  const c = contenido(d[0]);
  assert(c && c.length >= 50 && c.length <= 160, 'descripción fuera de rango (' + (c || '').length + '): ' + c);
  assert(HTML.indexOf('id="meta-desc"') !== -1, 'la descripción perdió el id que actualiza el router');
});

check('3: canonical y og:url absolutos, iguales y sin hash ni query', () => {
  const can = [...HTML.matchAll(/<link[^>]*rel="canonical"[^>]*>/g)].map((m) => (m[0].match(/href="([^"]*)"/) || [])[1]);
  assert(can.length === 1, 'hay ' + can.length + ' canonical');
  assert(can[0] === DOMINIO, 'canonical inesperada: ' + can[0]);
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
  assert(url.startsWith(DOMINIO), 'og:image no es absoluta en el dominio principal: ' + url);
  const rel = url.slice(DOMINIO.length);
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
  assert(j.url === DOMINIO, 'url del JSON-LD distinta de la canonical: ' + j.url);
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

console.log('\nOK: ' + passed + ' FAIL: ' + failed);
process.exit(failed === 0 ? 0 : 1);

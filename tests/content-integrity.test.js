'use strict';

/* =====================================================================
   SMR Hub — Integridad del contenido educativo (auditoría de estabilización).

   QUÉ ES: carga las capas de contenido en el ORDEN REAL de index.html y
   comprueba la coherencia referencial y la identidad estable:
     - recursos duplicados, con id inválido o incompletos;
     - pasos de ruta que apuntan a un recurso inexistente;
     - relatedResource de preguntas sin destino válido;
     - referencias huérfanas de las capas de contenido (lecciones sin recurso);
     - cambios accidentales en los identificadores estables q-<16hex>;
     - regresión de los validadores derivados y de las funciones de repaso
       y navegación.

   QUÉ NO ES: no abre un navegador ni ejecuta PostgreSQL. Es una prueba
   DERIVADA (evalúa los módulos reales sin DOM): la verificación en navegador
   está documentada aparte en el informe de la fase.

   POLÍTICA DE LA LÍNEA BASE (tests/fixtures/content-baseline.json):
   las referencias que NO resuelven están registradas con su justificación.
   Esta suite falla en las DOS direcciones: si aparece una referencia rota
   nueva, y si una registrada desaparece sin actualizar la línea base. Así el
   número de avisos no se reduce ocultando referencias. Cuando se publique uno
   de los recursos pendientes, actualiza la línea base y el informe.

   Ejecutar desde la raíz:            node tests/content-integrity.test.js
   Regenerar la línea base:           node tests/content-integrity.test.js --update-baseline
   Auto-verificación del runner:      CONTENT_SELFTEST=1 node tests/content-integrity.test.js → exit 1
   ===================================================================== */

const fs = require('fs');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function check(name, fn) {
  try { fn(); record(name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ' → ' + e.message); if (process.env.TRACE === '1') console.error(e.stack); }
}

/* ---------- carga de las capas en el orden de index.html ---------- */

const ORDER = ['js/data.js', 'js/curriculum.js', 'js/topics.js', 'js/questionTopics.js',
  'js/contentTopics.js', 'js/moduleTopics.js', 'js/content.js', 'js/questions.js', 'js/srs.js'];
const SOURCES = ORDER.map((f) => fs.readFileSync(f, 'utf8'));

function load(patch) {
  const said = [];
  const console = {
    log() {}, warn: (...a) => said.push(['warn', a]), info: (...a) => said.push(['info', a]), error: (...a) => said.push(['error', a])
  };
  const g = { console };
  g.window = g;
  ORDER.forEach((f, i) => {
    const src = patch ? patch(f, SOURCES[i]) : SOURCES[i];
    new Function('window', 'globalThis', 'console', src)(g, g, console);
  });
  return { D: g.SMR_DATA, SMR: g.SMR, said };
}

const { D, SMR, said } = load();
const RES_IDS = new Set(D.resources.map((r) => r.id));
const gaps = D.contentGaps || [];
const byKind = (k) => gaps.filter((x) => x.kind === k);
const baseline = JSON.parse(fs.readFileSync('tests/fixtures/content-baseline.json', 'utf8'));

/* ---------- A. catálogo de recursos ---------- */

check('A1: el catálogo tiene recursos con identidad única, formato válido y campos completos', () => {
  assert(D.resources.length > 0, 'no hay recursos');
  const seen = new Set();
  D.resources.forEach((r) => {
    assert(r.id && /^r-[a-z0-9-]+$/.test(r.id), 'id inválido: ' + JSON.stringify(r.id));
    assert(!seen.has(r.id), 'recurso duplicado: ' + r.id);
    seen.add(r.id);
    assert(r.title && r.desc && r.category, 'recurso incompleto: ' + r.id);
    assert(Array.isArray(r.content) && r.content.length, 'recurso sin contenido: ' + r.id);
  });
});

check('A2: ningún recurso declara relatedResources que no existan', () => {
  const rotas = [];
  D.resources.forEach((r) => (r.relatedResources || []).forEach((id) => { if (!RES_IDS.has(id)) rotas.push(r.id + '→' + id); }));
  assert(rotas.length === 0, 'referencias rotas: ' + rotas.join(', '));
  assert(byKind('resource-related').length === 0, 'el registro declara resource-related pero la comprobación no lo vio');
});

/* ---------- B. rutas de aprendizaje ---------- */

check('B1: cada paso de ruta resuelve o está registrado como pendiente (y ninguna ruta queda vacía)', () => {
  const paths = D.learningPaths || [];
  assert(paths.length === 4, 'rutas esperadas 4, hay ' + paths.length);
  const registradas = new Set(byKind('route-step').map((x) => x.path + '→' + x.ref));
  paths.forEach((p) => {
    assert(Array.isArray(p.steps) && p.steps.length, 'ruta sin pasos: ' + p.id);
    const vivas = p.steps.filter((id) => RES_IDS.has(id));
    assert(vivas.length > 0, 'ruta sin ningún recurso publicado: ' + p.id);
    p.steps.forEach((id) => {
      if (RES_IDS.has(id)) { assert(!registradas.has(p.id + '→' + id), 'paso registrado como roto pero SÍ resuelve: ' + id); return; }
      assert(registradas.has(p.id + '→' + id), 'paso roto NO registrado en contentGaps: ' + p.id + '→' + id);
    });
  });
});

check('B2: los pasos pendientes no se descartan en silencio en la UI de rutas', () => {
  const src = fs.readFileSync('js/app.js', 'utf8');
  const body = src.slice(src.indexOf('function renderMapa'));
  assert(/const pendientes = all\.length - steps\.length/.test(body), 'renderMapa ya no cuenta los pasos pendientes');
  assert(/pendientes \?/.test(body), 'renderMapa no avisa de los pasos pendientes');
  const conFiltroCiego = /map\(\(id\) => D\.resources\.find\(\(r\) => r\.id === id\)\)\.filter\(Boolean\)/.test(body);
  assert(!conFiltroCiego, 'renderMapa volvió a filtrar los pasos inexistentes sin declararlos');
});

/* ---------- C. relatedResource de las preguntas ---------- */

/* Inventario CRUDO del fuente: no depende de que el merge lo anule. */
function rawQuestionRefs(src) {
  const counts = new Map();
  const re = /relatedResource:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src)) !== null) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  return counts;
}

check('C1: el inventario del fuente coincide con lo anulado en carga (refs e instancias)', () => {
  const raw = rawQuestionRefs(SOURCES[ORDER.indexOf('js/questions.js')]);
  const reg = new Map(byKind('question-relatedResource').map((x) => [x.ref, x.count]));
  raw.forEach((n, ref) => {
    if (RES_IDS.has(ref)) { assert(!reg.has(ref), 'referencia válida anulada: ' + ref); return; }
    assert(reg.get(ref) === n, 'la incidencia de ' + ref + ' no coincide: fuente ' + n + ' vs registro ' + reg.get(ref));
  });
  const fuenteOrfanas = [...raw.keys()].filter((ref) => !RES_IDS.has(ref)).sort();
  assert(fuenteOrfanas.join(',') === [...reg.keys()].sort().join(','),
    'refs sin destino distintas en fuente y registro');
  const instancias = [...raw.values()].reduce((a, b) => a + b, 0) - [...raw.keys()].filter((r) => RES_IDS.has(r)).reduce((a, r) => a + raw.get(r), 0);
  assert(instancias === [...reg.values()].reduce((a, b) => a + b, 0), 'instancias anuladas distintas');
});

check('C2: toda pregunta conserva una recomendación sólo si su recurso existe', () => {
  let vivas = 0, anuladas = 0;
  D.tests.forEach((t) => t.questions.forEach((q) => {
    if (q.relatedResource === null) { anuladas++; return; }
    if (!q.relatedResource) return;
    vivas++;
    assert(RES_IDS.has(q.relatedResource), 'relatedResource vivo sin destino: ' + t.id + ' → ' + q.relatedResource);
  }));
  assert(anuladas === 71, 'anuladas esperadas 71, hay ' + anuladas);
  assert(vivas === 83, 'vivas esperadas 83, hay ' + vivas);
});

/* ---------- D. huérfanos de las capas de contenido ---------- */

check('D1: toda lección enriquecida o se aplica a un recurso real o está registrada como huérfana', () => {
  const src = SOURCES[ORDER.indexOf('js/content.js')];
  const inicio = src.indexOf('const LESSON_UPGRADES = {');
  assert(inicio > 0, 'no se encontró LESSON_UPGRADES');
  const claves = [...src.slice(inicio).matchAll(/^    '([a-z0-9-]+)': \{/gim)].map((m) => m[1]);
  const fin = src.indexOf('LEARNING_PATHS');
  const declaradas = [...src.slice(inicio, fin).matchAll(/^    '([a-z0-9-]+)': \{/gim)].map((m) => m[1]);
  assert(claves.length === declaradas.length, 'lectura inconsistente de LESSON_UPGRADES');
  const huérfanas = new Set(byKind('lesson-orphan').map((x) => x.ref));
  let aplicadas = 0;
  declaradas.forEach((id) => {
    if (RES_IDS.has(id)) {
      const r = D.resources.find((x) => x.id === id);
      assert(r.lesson && r.lesson.summary && r.lesson.keyPoints.length, 'la lección de ' + id + ' no se aplicó al recurso');
      assert(!huérfanas.has(id), 'lección existente registrada como huérfana: ' + id);
      aplicadas++;
      return;
    }
    assert(huérfanas.has(id), 'lección huérfana NO registrada: ' + id);
  });
  assert(aplicadas + huérfanas.size === declaradas.length, 'las lecciones declaradas no cuadran: ' + declaradas.length);
});

/* ---------- E. avisos de carga (no se silencian) ---------- */

check('E1: los avisos de integridad siguen emitiéndose en carga', () => {
  const textos = said.map(([lvl, a]) => lvl + ' ' + a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' '));
  const ruta = textos.find((t) => t.indexOf('[SMR content]') !== -1);
  assert(ruta && /7 aviso\(s\) de integridad/.test(ruta), 'content.js ya no avisa de las 7 referencias de ruta sin destino');
  const refs = byKind('route-step').map((x) => x.ref);
  refs.forEach((ref) => assert(ruta.indexOf(ref) !== -1, 'el aviso de consola ya no nombra ' + ref));
  assert(textos.some((t) => /\[SMR questions\]/.test(t) && /71 relatedResource anulado/.test(t)),
    'questions.js ya no informa de las 71 referencias anuladas');
});

/* ---------- F. línea base revisada ---------- */

function gapKey(g) { return [g.kind, g.path || '', g.ref, String(g.count || '')].join('|'); }

check('F1: las incidencias registradas son EXACTAMENTE las revisadas (ni una más, ni una menos)', () => {
  const real = gaps.map(gapKey).sort();
  const esperado = baseline.gaps.map(gapKey).sort();
  const nuevas = real.filter((k) => esperado.indexOf(k) === -1);
  const desaparecidas = esperado.filter((k) => real.indexOf(k) === -1);
  assert(nuevas.length === 0 && desaparecidas.length === 0,
    (nuevas.length ? 'NUEVAS: ' + nuevas.join(' ; ') + '. ' : '') +
    (desaparecidas.length ? 'YA NO ESTÁN: ' + desaparecidas.join(' ; ') + ' (si has publicado el recurso, actualiza la línea base: node tests/content-integrity.test.js --update-baseline).' : ''));
});

/* ---------- G. identidad estable de las preguntas ---------- */

function stableIds(env) {
  const ids = [];
  env.D.tests.forEach((t) => t.questions.forEach((q, i) => ids.push(t.id + '::' + env.SMR.srs.idOf(t.id, i))));
  return ids.sort();
}

check('G1: los 154 identificadores estables q-<16hex> no han cambiado', () => {
  const ids = stableIds({ D, SMR });
  assert(ids.length === 154, 'preguntas esperadas 154, hay ' + ids.length);
  const sinId = ids.filter((x) => !/::q-[0-9a-f]{16}$/.test(x));
  assert(sinId.length === 0, 'identidad no estable: ' + sinId.slice(0, 3).join(', '));
  assert(new Set(ids).size === ids.length, 'hay identificadores repetidos');
  const nuevas = ids.filter((x) => baseline.questionIds.indexOf(x) === -1);
  const perdidas = baseline.questionIds.filter((x) => ids.indexOf(x) === -1);
  assert(nuevas.length === 0 && perdidas.length === 0,
    (nuevas.length ? 'IDENTIDAD NUEVA: ' + nuevas.join(' ; ') + ' (revisar el cambio de texto/opciones del informe). ' : '') +
    (perdidas.length ? 'IDENTIDAD PERDIDA: ' + perdidas.join(' ; ') : ''));
});

check('G2: relatedResource y difficulty NO participan en la identidad (mutación real)', () => {
  /* Se reescribe el banco: cambia el destino de las recomendaciones y la
     dificultad declarada. Los IDs deben salir IDÉNTICOS. */
  const mutado = load((f, src) => f !== 'js/questions.js' ? src
    : src.replace(/relatedResource:\s*'[^']+'/g, "relatedResource: 'r-inventado'")
      .replace(/difficulty:\s*'(Básica|Intermedia|Avanzada)'/g, "difficulty: 'Básica'"));
  assert(mutado.D.tests.some((t) => t.questions.some((q) => q.relatedResource === null)), 'la mutación no anuló ninguna referencia');
  assert(JSON.stringify(stableIds(mutado)) === JSON.stringify(stableIds({ D, SMR })),
    'la identidad estable depende de relatedResource o difficulty');
});

/* ---------- H. capas derivadas ---------- */

check('H1: los validadores de las capas derivadas siguen en verde', () => {
  const cur = SMR.validateCurriculumIndex();
  assert(cur.ok === true && cur.errors.length === 0, 'curriculumIndex: ' + JSON.stringify(cur.errors));
  assert(cur.total === 227, 'instancias de módulo esperadas 227, hay ' + cur.total);
  assert(cur.duplicates.length === 0, 'módulos duplicados: ' + cur.duplicates.length);
  const mt = SMR.validateModuleTopics();
  assert(mt.ok === true, 'moduleTopics: ' + JSON.stringify(mt.errors || mt));
  const eq = SMR.validateModuleEquivalences();
  assert(eq.ok === true && eq.errors.length === 0, 'equivalencias: ' + JSON.stringify(eq.errors));
  const ct = SMR.validateContentTopics();
  assert(ct.ok === true && ct.errors.length === 0, 'contentTopics: ' + JSON.stringify(ct.errors));
  assert(ct.resourcesMapped === D.resources.length, 'contentTopics no cubre todos los recursos');
});

/* ---------- I. navegación y repaso ---------- */

check('I1: las superficies de repaso y navegación siguen completas (estático)', () => {
  const app = fs.readFileSync('js/app.js', 'utf8');
  const tests = fs.readFileSync('js/tests.js', 'utf8');
  [['app.js', app, ['renderMapa', 'openResource', 'buildSearchIndex', 'wrongResourceIds']],
    ['tests.js', tests, ['renderQuestion', 'renderIndex', 'buildSrsSession', 'srsDropHtml', 'wireSrsDrop', 'srsRateHtml', 'searchEntries']]]
    .forEach(([file, src, fns]) => fns.forEach((fn) => assert(new RegExp('function ' + fn + '\\b').test(src), file + ' sin ' + fn)));
  assert(/\.filter\(Boolean\)\s*;/.test(app.slice(app.indexOf('function wrongResourceIds'), app.indexOf('function recommendationWithReason'))),
    'wrongResourceIds dejó de descartar las recomendaciones anuladas');
  /* La identidad estable se calcula SOLO con contenido educativo: el hash
     cubre el texto, las opciones y el índice correcto, y debe seguir sin
     mirar metadatos (destino de la recomendación, dificultad, etc.). */
  const srs = fs.readFileSync('js/srs.js', 'utf8');
  const entrada = srs.slice(srs.indexOf('function questionHashInput'), srs.indexOf('function stableIdOf'));
  ['q.q', 'q.options.join', 'q.correct'].forEach((f) => assert(entrada.indexOf(f) !== -1, 'la entrada del hash ya no usa ' + f));
  ['relatedResource', 'difficulty', 'topic', 'explain', 'wrongWhy'].forEach((f) =>
    assert(entrada.indexOf(f) === -1, 'la identidad estable ahora depende de ' + f));
  ['.filter(Boolean)', 'data-open-res'].forEach((s) => assert(app.indexOf(s) !== -1, 'app.js sin ' + s));
});

check('I2: SMR.openResource abre el recurso real y conserva el tratamiento de IDs ausentes', () => {
  const vm = require('vm');
  const storage = new Map();
  const ctx = {
    console, URLSearchParams, SMR_DATA: D,
    document: { querySelector: () => null },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: {
      getItem: (k) => storage.get(k) || null,
      setItem: (k, v) => storage.set(k, v),
      removeItem: (k) => storage.delete(k)
    }
  };
  ctx.window = ctx;
  const app = fs.readFileSync('js/app.js', 'utf8');
  const end = app.lastIndexOf('\ninit();');
  assert(end > 0, 'arranque de app.js no encontrado');
  // shortcut: DOM simulado sin init; la apertura visual completa requiere navegador.
  vm.runInNewContext(fs.readFileSync('js/profile.js', 'utf8') + '\n' + app.slice(0, end), ctx);
  assert(typeof ctx.SMR.openResource === 'function', 'falta el contrato SMR.openResource usado por js/tests.js');
  assert(ctx.SMR.openResource === ctx.openResource, 'debe reutilizar la apertura existente');
  const control = { addEventListener() {}, classList: { add() {} } };
  const box = { innerHTML: '', classList: { add() {} }, querySelector: () => control, querySelectorAll: () => [] };
  ctx.SMR.modal = { open: (build) => build(box), close() {} };
  const resource = D.resources[0];
  ctx.SMR.openResource(resource.id);
  assert(box.innerHTML.includes(ctx.SMR.esc(resource.title)), 'no se abrió el recurso solicitado');
  assert(box.innerHTML.includes('data-nav="/recursos"'), 'se conserva la navegación de vuelta');
  const saved = JSON.parse(storage.get('smrhub:progress'));
  assert(saved.resources.viewed[resource.id] > 0, 'se conserva el guardado de recurso visitado');
  ctx.SMR.openResource('r-inexistente-regresion');
  assert(box.innerHTML.includes('Recurso no disponible'), 'se conserva el fallback de recurso inexistente');
  assert(storage.get('smrhub:progress') === JSON.stringify(saved), 'un ID ausente no modifica el progreso');
});

/* ---------- línea base / auto-verificación ---------- */

if (process.argv.indexOf('--update-baseline') !== -1) {
  const out = Object.assign({}, baseline, {
    note: 'Línea base actualizada el ' + new Date().toISOString().slice(0, 10) + '. Justificar el cambio en el informe.',
    gaps: gaps.slice().sort((a, b) => gapKey(a).localeCompare(gapKey(b))),
    questionIds: stableIds({ D, SMR })
  });
  fs.writeFileSync('tests/fixtures/content-baseline.json', JSON.stringify(out, null, 2) + '\n');
  console.log('línea base actualizada: ' + out.gaps.length + ' incidencias, ' + out.questionIds.length + ' identificadores');
}

if (process.env.CONTENT_SELFTEST === '1') {
  try { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); record('auto-verificación (no debe llegar aquí)'); }
  catch (e) { failed++; console.error('  ✗ auto-verificación → ' + e.message); }
}

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log(`OK: ${passed}  FAIL: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
});

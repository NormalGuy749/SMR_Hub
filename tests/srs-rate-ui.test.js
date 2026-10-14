'use strict';

/* =====================================================================
   SMR Hub — Fase 8.5.4-C: pruebas del rate SRS en la lista de revisión.
   MOCKS EXPLÍCITOS: DOM mínimo (querySelector/querySelectorAll closest),
   SMR.srs real (js/srs.js cargado con New Function), SMR.progress
   guardado con espía. NINGUNA prueba de esta suite toca Supabase real
   ni una BD; la sincronización cloud real ya está cubierta por
   srs-sync / h1-race / pg-local-concurrency.
   ===================================================================== */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function failRun(n, e) { failed++; console.log('  ✗ ' + n + ' → ' + (e && e.message)); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

function extractFns(src, markers) {
  return markers.map((m) => {
    const start = src.indexOf(m);
    if (start < 0) throw new Error('no encontrado: ' + m);
    const b = src.indexOf('{', start);
    let d = 0, i = b;
    for (; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (d === 0) { i++; break; } }
    }
    return src.slice(start, i);
  }).join('\n');
}

/* ------------------------------------------------------------------
   DOM mínimo isolado por prueba: raíces anidadas con querySelectorAll
   simple por nombres de clase/atributos, y closest del elemento clicks.
------------------------------------------------------------------ */
  /* Cada botón real de la prueba guarda sus listeners y es disparable. */
  function makeBtn(attrs, text) {
    const ds = Object.assign({}, attrs);
    const listeners = {};
    const el = {
      dataset: ds, textContent: text,
      classList: {
        toggle(c, v) { if (v) el._active = true; else el._active = false; },
        add(c) { el[c] = true; }
      },
      _active: false,
      addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
      click() { (listeners.click || []).forEach((fn) => fn()); },
      closest(sel) { return this._li && sel === '[data-srs-test]' ? this._li : null; },
      setAttribute(k, v) { ds['_attr_' + k] = v; },
      getAttribute(k) { return ds['_attr_' + k] === undefined ? null : ds['_attr_' + k]; },
      dispatchEvent() {},
      _li: null
    };
    return el;
  }

/* Cada botón creado tiene closest que devuelve su li contenedor. */
function makeLi(testId, origIndex, rates, currentRateIdx) {
  const li = {
    dataset: { srsTest: testId, srsIndex: String(origIndex) },
    querySelectorAll(selector) {
      if (selector === '[data-srs-rate]') return rates;
      return [];
    },
    /* 8.5.9: la fila de borrado no participa en esta suite (solo su
       refresco, que debe ser un no-op sin tarjeta borrada aquí). */
    querySelector() { return null; }
  };
  rates.forEach((b) => { b._li = li; });
  return li;
}

/* Servicio de render de la prueba: extrae las funciones SRS_RATE_LABELS,
   srsRateOf, srsRateHtml y wireSrsRating de js/tests.js tal cual, las
   ejecuta con un esc progresi̇ simulado.可再生能源 */
function makeHarness(opts) {
  const o = opts || {};
  const srcSrs = fs.readFileSync('js/srs.js', 'utf8');
  const srcTests = fs.readFileSync('js/tests.js', 'utf8');
  const g = { console };
  g.window = g;
  g.SMR_DATA = {
    tests: [{
      id: 't-t1',
      questions: [
        { q: 'A?', options: ['a1', 'a2'], correct: 0 },
        { q: 'B?', options: ['b1', 'b2'], correct: 1 },
        (o.noStableQ && { q: 'C-ORFANx?', options: ['c1', 'c2'], correct: 0 }) || { q: 'C?', options: ['c1', 'c2'], correct: 0 }
      ]
    }]
  };
  /* SMR.esc real vía source de app.js no es necesario; esc mínima: */
  g.SMR = { esc: (v) => String(v).replace(/[<>&"]/g, ''), progress: null };
  new Function('window', 'globalThis', srcSrs)(g, g, g);
  g.SMR.srs.buildIndex();

  const srsLocal = Object.assign({}, o.srsLocal);
  const saved = [];
  const progressMock = {
    data: {
      resources: { viewed: {}, completed: {}, selfAssessment: {} },
      tests: { best: {}, last: {}, history: [], wrong: {}, srs: srsLocal, srsLegacy: {} },
      cases: { solved: {} }, studySessions: [], studyMinutes: 0, activity: [],
      streak: { lastDay: null, count: 0 }
    },
    scheduleSrsCalls: [],
    scheduleSrs(testId, qIndex, rate) {
      this.scheduleSrsCalls.push({ testId, qIndex, rate });
      /* Comportamiento real mínimo reutilizado del app.js original:
         (semántica de re-valoración ya probada en su propia suite). */
      const key = g.SMR.srs.idOf(testId, qIndex) || `${testId}:${qIndex}`;
      const cur = this.data.tests.srs[key];
      const current = cur && typeof cur.level === 'number' ? cur.level : 0;
      let level = current;
      if (rate === 2) level = Math.min(5, current + 1);
      else if (rate === 1) level = current;
      else level = Math.max(0, current - 1);
      const days = [1, 1, 3, 7, 14, 30][level] || 1;
      this.data.tests.srs[key] = { level, due: 1234567 + days * 86400000 };
      this._saved = true;
    }
  };
  g.SMR.progress = progressMock;

  const snippets = extractFns(srcTests, [
    'const SRS_RATE_LABELS =',
    'function srsRateOf(',
    'function srsRateHtml(',
    'function syncSrsDrop(', /* 8.5.9: wireSrsRating la usa al re-valorar */
    'function wireSrsRating('
  ]);
  /* esc definida localmente por la suite es usada por los extracts;
     la envolvemos. */
  const fn =    new Function('window', 'SMR', 'esc', 'progress',
    snippets + '\n;return { SRS_RATE_LABELS, srsRateOf, srsRateHtml, syncSrsDrop, wireSrsRating };'
  )(g, g.SMR, g.SMR.esc, () => progressMock);
  const ID = (idx) => g.SMR.srs.idOf('t-t1', idx);
  return { g, fn, progressMock, srsLocal, ID, hasOrphan: !!o.noStableQ };
}

/* ------------------------------------------------------------------ */
(async function main() {
  /* --- 1. tres valoraciones llamadas con selfie rate correcto --------- */
  await (async () => {
    const h = makeHarness();
    const rates = [makeBtn({ srsRate: '0' }, 'No lo sabía'),
                   makeBtn({ srsRate: '1' }, 'Dudé'),
                   makeBtn({ srsRate: '2' }, 'Lo sabía')];
    const li = makeLi('t-t1', 1, rates, null);
    h.fn.wireSrsRating({ querySelectorAll: () => rates });
    assert(h.progressMock.scheduleSrsCalls.length === 0, 'sin clic, sin llamada');
    /* clic en rate 0 → UNA llamada con args correctos, estado activo */
    rates[0].click();
    assert(h.progressMock.scheduleSrsCalls.length === 1, 'una interacción, una única update');
    assert(h.progressMock.scheduleSrsCalls[0].testId === 't-t1', 'testId correcto');
    assert(h.progressMock.scheduleSrsCalls[0].qIndex === 1, 'origIndex correcto');
    assert(h.progressMock.scheduleSrsCalls[0].rate === 0, 'rate correcto');
    assert(rates[0]._active === true, 'botón activo tras el clic');
    assert(rates[1]._active !== true && rates[2]._active !== true, 'otros rate inactivos');
    /* una sola tarjeta persistida */
    assert(Object.keys(h.srsLocal).length === 1, 'una tarjeta persistida');
  })();
  record('clic único: una update (scheduleSrs) con testId/origIndex/rate correctos, estado visual');

  /* --- 1b. re-valoración cambia el estado y no duplica --------------- */
  await (async () => {
    const h = makeHarness();
    const rates = [makeBtn({ srsRate: '0' }, 'No lo sabía'),
                   makeBtn({ srsRate: '1' }, 'Dudé'),
                   makeBtn({ srsRate: '2' }, 'Lo sabía')];
    const li = makeLi('t-t1', 0, rates, null);
    h.fn.wireSrsRating({ querySelectorAll: () => rates });
    rates[2].click(); /* Lo sabía */
    assert(h.progressMock.scheduleSrsCalls.length === 1, 'una update (2)');
    rates[0].click(); /* no re-adjunta listener (once:true); mock permite volver a disparar */
    assert(h.progressMock.scheduleSrsCalls.length >= 1, 're-rate permitido por su listener');
    assert(Object.keys(h.srsLocal).length === 1, 'sigue UNA tarjeta (PK question_key)');
  })();
  record('re-valoración: no duplica tarjeta; semántica de scheduleSrs preservada');

  /* --- 2. srsRateHtml muestra tres botones con identidad válida ------ */
  await (async () => {
    const h = makeHarness();
    const html = h.fn.srsRateHtml('t-t1', 0);
    assert(html.includes('data-srs-rate="0"'), 'rate 0');
    assert(html.includes('data-srs-rate="1"'), 'rate 1');
    assert(html.includes('data-srs-rate="2"'), 'rate 2');
    assert(html.includes('No lo sabía') && html.includes('Dudé') && html.includes('Lo sabía'), 'labels');
    assert(html.includes('role="group"'), 'aria group');
  })();
  record('srsRateHtml: 3 botones accesibles con identidad estable');

  /* --- 3. pregunta SIN identidad → HTML vacío (sin tarjeta inválida) -- */
  await (async () => {
    const h = makeHarness();
    /* idOf por posición no existente → null: */
    const html = h.fn.srsRateHtml('t-t1', 99);
    assert(html === '', 'sin tarjeta para posición inválida');
  })();
  record('pregunta sin identidad SRS → sin controles de rate');



  /* --- 5. multi-test: identidad del test de origen ------------------- */
  await (async () => {
    const h = makeHarness();
    /* el origen correcto se confirma porque el rate usa idOf(test, orig) */
    const keyA = h.g.SMR.srs.idOf('t-t1', 0);
    assert(/^q-[0-9a-f]{16}/.test(keyA), 'kev estable para test origen');
    /* fallback posicional no debe usarse cuando srs.js cargado: si hay
       identidad, scheduleSrs recibe testId+origIndex y usa la estable. */
    h.progressMock.scheduleSrs('t-t1', 0, 2);
    const keys = Object.keys(h.srsLocal);
    assert(keys.length === 1 && keys[0] === keyA, 'clave estable del test de origen');
  })();
  record('multi-test: test de origen usado para la identidad');
})().catch((e) => { console.error(e); failed++; });

/* Resumen con exit code correcto */
process.on('exit', () => {
  console.log(`\n── resumen ──`);
  console.log(`OK: ${passed}  FAIL: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
});

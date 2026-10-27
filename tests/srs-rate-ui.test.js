'use strict';

/* Extrae el rate SRS real de tests.js con DOM mínimo, srs.js real
   y progreso simulado con espía. No ejecuta sincronización remota. */

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
  /* EventTarget respeta once y permite detectar listeners consumidos. */
  function makeBtn(attrs, text) {
    const ds = Object.assign({}, attrs);
    const el = Object.assign(new EventTarget(), {
      dataset: ds, textContent: text,
      classList: {
        toggle(c, v) { if (v) el._active = true; else el._active = false; },
        add(c) { el[c] = true; }
      },
      _active: false,
      click() { this.dispatchEvent(new Event('click')); },
      closest(sel) { return this._li && sel === '[data-srs-test]' ? this._li : null; },
      setAttribute(k, v) { ds['_attr_' + k] = v; },
      getAttribute(k) { return ds['_attr_' + k] === undefined ? null : ds['_attr_' + k]; },
      _li: null
    });
    return el;
  }

function makeLi(testId, origIndex, rates, currentRateIdx) {
  const li = {
    dataset: { srsTest: testId, srsIndex: String(origIndex) },
    querySelectorAll(selector) {
      if (selector === '[data-srs-rate]') return rates;
      return [];
    },
    /* El borrado no se ejercita aquí; su refresco debe ser inocuo sin fila. */
    querySelector() { return null; }
  };
  rates.forEach((b) => { b._li = li; });
  return li;
}

/* Las funciones de valoración se extraen del módulo real; progreso y esc se simulan. */
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
      /* Réplica mínima de scheduleSrs para observar identidad y persistencia. */
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
    'function syncSrsDrop(', /* wireSrsRating actualiza también la acción de borrado. */
    'function wireSrsRating('
  ]);
  const fn =    new Function('window', 'SMR', 'esc', 'progress',
    snippets + '\n;return { SRS_RATE_LABELS, srsRateOf, srsRateHtml, syncSrsDrop, wireSrsRating };'
  )(g, g.SMR, g.SMR.esc, () => progressMock);
  const ID = (idx) => g.SMR.srs.idOf('t-t1', idx);
  return { g, fn, progressMock, srsLocal, ID, hasOrphan: !!o.noStableQ };
}

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
    rates[0].click();
    assert(h.progressMock.scheduleSrsCalls.length === 1, 'una interacción, una única update');
    assert(h.progressMock.scheduleSrsCalls[0].testId === 't-t1', 'testId correcto');
    assert(h.progressMock.scheduleSrsCalls[0].qIndex === 1, 'origIndex correcto');
    assert(h.progressMock.scheduleSrsCalls[0].rate === 0, 'rate correcto');
    assert(rates[0]._active === true, 'botón activo tras el clic');
    assert(rates[1]._active !== true && rates[2]._active !== true, 'otros rate inactivos');
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
    rates[2].click();
    assert(h.progressMock.scheduleSrsCalls.length === 1, 'una update (2)');
    rates[0].click();
    rates[2].click();
    assert(h.progressMock.scheduleSrsCalls.map((c) => c.rate).join(',') === '2,0,2', 'cada clic de 2 → 0 → 2 debe registrar una valoración');
    assert(h.progressMock.scheduleSrsCalls.every((c) => c.testId === 't-t1' && c.qIndex === 0), 'identidad de la pregunta');
    assert(rates[2]._active && !rates[0]._active && !rates[1]._active, 'última valoración activa');
    assert(rates[2].getAttribute('aria-pressed') === 'true' && rates[0].getAttribute('aria-pressed') === 'false', 'estado accesible actualizado');
    assert(Object.keys(h.srsLocal).length === 1, 'sigue UNA tarjeta (PK question_key)');

    const nextRates = [0, 1, 2].map((rate) => makeBtn({ srsRate: String(rate) }));
    makeLi('t-t1', 1, nextRates, null);
    h.fn.wireSrsRating({ querySelectorAll: () => nextRates });
    nextRates[2].click();
    nextRates[2].click();
    assert(h.progressMock.scheduleSrsCalls.length === 5, 'una update por clic, también en la siguiente pregunta');
    assert(h.progressMock.scheduleSrsCalls.slice(3).every((c) => c.qIndex === 1 && c.rate === 2), 'sin identidad ni guards heredados');
    assert(Object.keys(h.srsLocal).length === 2, 'una tarjeta por pregunta');
  })();
  record('re-valoración 2 → 0 → 2 y repetición en otra pregunta: un registro por clic e identidad correcta');

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
    const html = h.fn.srsRateHtml('t-t1', 99);
    assert(html === '', 'sin tarjeta para posición inválida');
  })();
  record('pregunta sin identidad SRS → sin controles de rate');



  /* --- 5. multi-test: identidad del test de origen ------------------- */
  await (async () => {
    const h = makeHarness();
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

process.on('exit', () => {
  console.log(`\n── resumen ──`);
  console.log(`OK: ${passed}  FAIL: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
});

'use strict';

/* Ejecuta dashboard.js y el motor real de sesiones con estados sintéticos
   y controles simulados. Comprueba cálculos, prioridad e identidad al avanzar;
   no valida el renderizado visual ni interacciones de un navegador. */

const fs = require('fs');
const vm = require('vm');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function check(name, fn) {
  try { fn(); record(name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ' → ' + e.message); if (process.env.TRACE === '1') console.error(e.stack); }
}

const MODULE = fs.readFileSync('js/dashboard.js', 'utf8');
const APP = fs.readFileSync('js/app.js', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');
const SW = fs.readFileSync('sw.js', 'utf8');
const TESTS_JS = fs.readFileSync('js/tests.js', 'utf8');

/* idOf determinista y legible: las claves del estado de prueba son "t1:0". */
const fakeIdOf = (testId, index) => `${testId}:${index}`;

function load(bank) {
  const context = {
    console,
    SMR: { esc: (v) => String(v), icon: () => '', srs: { idOf: fakeIdOf } },
    SMR_DATA: { tests: bank || [] }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(MODULE, context);
  return context.window.SMR.dashboard;
}

function bankOf(...tests) { return tests; }

function state(tests) {
  return { tests: Object.assign({ srs: {}, wrong: {}, history: [], best: {}, last: {} }, tests) };
}

const BANK = bankOf(
  { id: 't1', title: 'Módulo 1', category: 'Cat A', questions: [{ q: 'a' }, { q: 'b' }] },
  { id: 't2', title: 'Módulo 2', category: 'Cat B', questions: [{ q: 'c' }] },
  { id: 't3', title: 'Módulo 3', category: 'Cat B', questions: [] }
);

console.log('\nmaestría por módulo');

check('nivel 5 sin fallos = 100 %; pregunta sin tarjeta = 0', () => {
  const dash = load(BANK);
  const st = state({ srs: { 't1:0': { level: 5, due: 0 } } });
  const [m1] = dash.calculateModuleMastery(st, BANK);
  assert(m1.total === 2 && m1.mastered === 1 && m1.pending === 1, JSON.stringify(m1));
  assert(m1.pct === 50, 'esperaba 50 %, dio ' + m1.pct);
});

check('el nivel intermedio puntúa proporcional (nivel 0 = 1/6)', () => {
  const dash = load(BANK);
  const st = state({ srs: { 't2:0': { level: 0, due: 0 } } });
  const [, m2] = dash.calculateModuleMastery(st, BANK);
  assert(m2.pct === 17, '1/6 de 100 ≈ 17, dio ' + m2.pct);
});

check('un fallo pendiente deja la pregunta en la mitad aunque el nivel sea 5', () => {
  const dash = load(BANK);
  const st = state({ srs: { 't2:0': { level: 5, due: 0 } }, wrong: { t2: { 't2:0': 2 } } });
  const [, m2] = dash.calculateModuleMastery(st, BANK);
  assert(m2.pct === 50, 'esperaba 50 %, dio ' + m2.pct);
  assert(m2.mastered === 0 && m2.pending === 1, 'con fallos no cuenta como dominada');
});

check('módulo sin preguntas: 0 %, sin dominadas ni pendientes', () => {
  const dash = load(BANK);
  const [, , m3] = dash.calculateModuleMastery(state({}), BANK);
  assert(m3.total === 0 && m3.pct === 0 && m3.mastered === 0 && m3.pending === 0, JSON.stringify(m3));
});

check('un módulo devuelve una entrada por test del banco, no 19 inventadas', () => {
  const dash = load(BANK);
  const list = dash.calculateModuleMastery(state({}), BANK);
  assert(list.length === BANK.length, 'entradas: ' + list.length);
  assert(list.every((m) => m.pct >= 0 && m.pct <= 100), 'porcentaje fuera de rango');
});

check('el banco real produce una fila por módulo y porcentajes válidos', () => {
  const ctx = { console, SMR_DATA: null };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/data.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('js/questions.js', 'utf8'), ctx);
  const realBank = ctx.SMR_DATA.tests;
  const dash = load(realBank);
  const list = dash.calculateModuleMastery(state({}), realBank);
  assert(list.length === realBank.length, `${list.length} filas para ${realBank.length} módulos`);
  assert(list.every((m) => m.pct === 0), 'sin tarjetas todas deben ser 0 %');
  record(`banco real: ${list.length} módulos · ${list.reduce((n, m) => n + m.total, 0)} preguntas`);
});

console.log('\ncola de repaso inteligente');

const NOW = Date.now();
const HOUR = 3600000;

check('entra lo vencido y lo fallado; queda fuera lo que ni vence ni falla', () => {
  const dash = load(BANK);
  const st = state({
    srs: {
      't1:0': { level: 2, due: NOW - HOUR },      /* vencida */
      't1:1': { level: 3, due: NOW + 48 * HOUR }, /* futura, sin fallos */
      't2:0': { level: 1, due: NOW + 5 * HOUR }   /* futura, pero con fallos */
    },
    wrong: { t2: { 't2:0': 3 } }
  });
  const queue = dash.getSmartReviewQueue(20, st, BANK);
  assert(queue.length === 2, 'en cola: ' + queue.length);
  assert(queue[0].testId === 't1' && queue[0].origIndex === 0, 'la vencida va primero');
  assert(queue[0].overdue === true && queue[1].overdue === false, 'marca de vencida');
  assert(queue[1].wrong === 3, 'la fallada conserva su contador');
});

check('las vencidas se ordenan de más antigua a más reciente', () => {
  const dash = load(BANK);
  const st = state({
    srs: {
      't1:0': { level: 1, due: NOW - HOUR },
      't1:1': { level: 1, due: NOW - 30 * HOUR },
      't2:0': { level: 1, due: NOW - 5 * HOUR }
    }
  });
  const queue = dash.getSmartReviewQueue(20, st, BANK).map((c) => c.origIndex + '@' + c.testId);
  /* 30 h vencida → 5 h → 1 h */
  assert(queue.join(',') === '1@t1,0@t2,0@t1', queue.join(','));
});

check('entre no vencidas manda la tasa de fallos', () => {
  const dash = load(BANK);
  const st = state({ wrong: { t1: { 't1:0': 1, 't1:1': 4 }, t2: { 't2:0': 2 } } });
  const queue = dash.getSmartReviewQueue(20, st, BANK).map((c) => c.wrong);
  assert(queue.join(',') === '4,2,1', queue.join(','));
});

check('una pregunta nunca aparece dos veces', () => {
  const dash = load(BANK);
  const st = state({ srs: { 't1:0': { level: 2, due: NOW - HOUR } }, wrong: { t1: { 't1:0': 2 } } });
  const queue = dash.getSmartReviewQueue(20, st, BANK);
  assert(queue.length === 1, 'duplicada: ' + queue.length);
  assert(queue[0].overdue === true && queue[0].wrong === 2, 'una sola entrada con ambos datos');
});

check('el límite recorta la cola y 0 devuelve nada', () => {
  const dash = load(BANK);
  const st = state({ wrong: { t1: { 't1:0': 9, 't1:1': 8 }, t2: { 't2:0': 7 } } });
  assert(dash.getSmartReviewQueue(2, st, BANK).length === 2, 'límite 2');
  assert(dash.getSmartReviewQueue(0, st, BANK).length === 0, 'límite 0');
  assert(dash.getSmartReviewQueue(undefined, st, BANK).length === 3, 'por defecto entran las 3');
});

check('los candidatos tienen la forma que espera el motor de tests', () => {
  const dash = load(BANK);
  const st = state({ wrong: { t1: { 't1:0': 1 } } });
  const [c] = dash.getSmartReviewQueue(5, st, BANK);
  ['q', 'origIndex', 'testId', 'testTitle', 'category'].forEach((k) => {
    assert(Object.prototype.hasOwnProperty.call(c, k), 'falta ' + k);
  });
  assert(c.q === BANK[0].questions[0], 'no lleva la pregunta del banco');
});

console.log('\nhábitos y racha');

function at(y, m, d, h = 12, min = 0) { return new Date(y, m, d, h, min).getTime(); }

check('cuenta días locales consecutivos', () => {
  const dash = load(BANK);
  const st = {
    activity: [{ ts: at(2026, 2, 10, 20) }, { ts: at(2026, 2, 9, 8) }],
    studySessions: [{ ts: at(2026, 2, 8, 18) }],
    tests: { history: [{ date: at(2026, 2, 7, 23, 30), total: 5, correct: 4 }] }
  };
  const h = dash.calculateHabits(st, at(2026, 2, 10, 21));
  assert(h.streak === 4, 'racha: ' + h.streak);
  assert(h.daysStudied === 4, 'días: ' + h.daysStudied);
});

check('dos marcas separadas por una hora pero de días distintos cuentan como 2 días', () => {
  const dash = load(BANK);
  const st = { activity: [{ ts: at(2026, 2, 9, 23, 30) }, { ts: at(2026, 2, 10, 0, 30) }] };
  const h = dash.calculateHabits(st, at(2026, 2, 10, 12));
  assert(h.streak === 2, 'racha: ' + h.streak);
});

check('un hueco de un día corta la racha', () => {
  const dash = load(BANK);
  const st = { activity: [{ ts: at(2026, 2, 10) }, { ts: at(2026, 2, 8) }] };
  assert(dash.calculateHabits(st, at(2026, 2, 10, 20)).streak === 1, 'no debe saltar el hueco');
});

check('sin actividad hoy la racha sigue viva hasta medianoche', () => {
  const dash = load(BANK);
  const st = { activity: [{ ts: at(2026, 2, 9, 9) }, { ts: at(2026, 2, 8, 9) }] };
  assert(dash.calculateHabits(st, at(2026, 2, 10, 8)).streak === 2, 'debe contar hasta ayer');
});

check('una semana con cambio de hora no rompe la racha', () => {
  const dash = load(BANK);
  let dst = null;
  for (let m = 0; m < 12 && !dst; m++) {
    for (let d = 1; d <= 28; d++) {
      const a = new Date(2026, m, d, 12).getTime();
      const b = new Date(2026, m, d + 1, 12).getTime();
      if (b - a !== 24 * HOUR) { dst = d; break; }
    }
    if (dst) {
      const st = { activity: [at(2026, m, dst), at(2026, m, dst - 1), at(2026, m, dst - 2)].map((ts) => ({ ts })) };
      const h = dash.calculateHabits(st, at(2026, m, dst, 20));
      assert(h.streak === 3, 'racha alrededor del cambio de hora: ' + h.streak);
      record('zona con cambio de hora: día ' + dst + '/' + (m + 1));
      return;
    }
  }
  record('zona sin cambio de hora: caso DST no aplicable');
});

check('tarjetas de hoy y precisión global', () => {
  const dash = load(BANK);
  const st = {
    tests: {
      history: [
        { date: at(2026, 2, 10, 9), total: 10, correct: 7 },
        { date: at(2026, 2, 10, 19), total: 5, correct: 5 },
        { date: at(2026, 2, 9, 19), total: 5, correct: 0 }
      ]
    }
  };
  const h = dash.calculateHabits(st, at(2026, 2, 10, 21));
  assert(h.cardsToday === 15, 'tarjetas de hoy: ' + h.cardsToday);
  assert(h.accuracy === 60, 'precisión: ' + h.accuracy);
});

check('sin historial: precisión null y cero tarjetas', () => {
  const dash = load(BANK);
  const h = dash.calculateHabits({ tests: { history: [] } }, at(2026, 2, 10));
  assert(h.accuracy === null && h.cardsToday === 0 && h.streak === 0, JSON.stringify(h));
});

console.log('\ncableado en la aplicación');

check('ruta /dashboard con metadatos y render', () => {
  assert(/dashboard: \{/.test(APP), 'sin entrada en ROUTES');
  const block = APP.slice(APP.indexOf('  dashboard: {'), APP.indexOf('  glosario: {'));
  assert(/title: 'Dashboard'/.test(block));
  assert(/keywords: \[[^\]]*'repaso inteligente'/.test(block), 'sin keywords propias');
  assert(/SMR\.dashboard\.render\(root\)/.test(block));
});

check('aparece en el menú lateral', () => {
  assert(/\{ label: 'Estudio', items: \[[^\]]*'dashboard'/.test(APP), 'no está en NAV_GROUPS');
});

check('index.html carga el módulo antes de app.js', () => {
  const dash = HTML.indexOf('js/dashboard.js');
  const app = HTML.indexOf('src="js/app.js"');
  assert(dash !== -1 && dash < app, 'orden incorrecto o script ausente');
});

check('el service worker lo precachea', () => {
  for (const base of ['/', '/SMR_Hub/']) {
    const context = { URL, self: { location: new URL('https://smr.test' + base + 'sw.js'), addEventListener() {} } };
    context.location = context.self.location;
    vm.createContext(context);
    context.importScripts = (file) => vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    const precache = vm.runInContext(SW + '\n;PRECACHE', context);
    assert(precache.includes(base + 'js/dashboard.js'), 'dashboard fuera del precache: ' + base);
  }
});

check('SMR_TESTS expone startSession y lo alimenta la cola', () => {
  assert(/startSession,/.test(TESTS_JS), 'no se exporta startSession');
  const fn = TESTS_JS.slice(TESTS_JS.indexOf('function startSession('), TESTS_JS.indexOf('/* ---------- Página de tests'));
  assert(/questions\.slice\(\)/.test(fn), 'no copia el subconjunto');
  assert(/renderQuestion\(host\)/.test(fn), 'no delega en el motor');
  assert(/if \(!host \|\| !Array\.isArray\(questions\) \|\| !questions\.length\) return false;/.test(fn), 'sin guardas');
});

check('startSession rechaza una cola vacía sin tocar el DOM', () => {
  const context = { console, document: { getElementById: () => null } };
  context.window = context;
  context.SMR = { esc: (v) => String(v), icon: () => '' };
  vm.createContext(context);
  const grab = (name) => {
    const start = TESTS_JS.indexOf('  function ' + name + '(');
    let depth = 0;
    let i = TESTS_JS.indexOf('{', start);
    for (let j = i; j < TESTS_JS.length; j++) {
      if (TESTS_JS[j] === '{') depth++;
      else if (TESTS_JS[j] === '}') { depth--; if (!depth) return TESTS_JS.slice(start, j + 1); }
    }
    return '';
  };
  vm.runInContext(grab('startSession') + '\n;this.__start = startSession;', context);
  assert(context.__start([]) === false, 'cola vacía debe devolver false');
  assert(context.__start(null) === false, 'null debe devolver false');
});

check('dashboard → sesión → siguientes preguntas conserva prioridad e identidad, no el orden del banco', () => {
  const bank = BANK.map((t) => ({ ...t, questions: t.questions.map((q) => ({ ...q, options: ['sí', 'no'], correct: 0, explain: '' })) }));
  const context = {
    console,
    SMR_DATA: { tests: bank },
    SMR: { esc: String, icon: () => '', srs: { idOf: fakeIdOf }, progress: { data: state({ srs: {
      't1:0': { level: 1, due: NOW - HOUR },
      't1:1': { level: 1, due: NOW - 30 * HOUR },
      't2:0': { level: 1, due: NOW - 5 * HOUR }
    } }) } }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext('Math.random = () => 0;', context);
  vm.runInContext(MODULE, context);
  vm.runInContext(TESTS_JS, context);
  let nodes = {}, markup = '';
  const button = (i) => Object.assign(new EventTarget(), {
    dataset: { i: String(i) }, classList: { add() {} }, setAttribute() {}, focus() {}
  });
  // shortcut: controles simulados; los dos módulos y el avance de sesión son reales.
  const root = {
    set innerHTML(value) { markup = value; nodes = {}; },
    get innerHTML() { return markup; },
    querySelector(sel) { return nodes[sel] || (nodes[sel] = button()); },
    querySelectorAll(sel) {
      if (sel === '.quiz-option') return nodes.options || (nodes.options = [button(0), button(1)]);
      return [];
    }
  };
  const dash = context.SMR.dashboard;
  const queue = dash.getSmartReviewQueue();
  assert(queue.map((c) => c.origIndex + '@' + c.testId).join(',') === '1@t1,0@t2,0@t1', 'prioridad de entrada');
  const originalBank = JSON.stringify(bank);
  dash.render(root);
  root.querySelector('#dash-start').dispatchEvent(new Event('click'));
  queue.forEach((candidate, i) => {
    assert(root.innerHTML.includes('<h3 class="quiz-q">' + candidate.q.q + '</h3>'), 'pregunta fuera de orden en posición ' + i);
    assert(root.innerHTML.includes('data-srs-test="' + candidate.testId + '" data-srs-index="' + candidate.origIndex + '"'), 'identidad original perdida en posición ' + i);
    if (i + 1 < queue.length) {
      root.querySelectorAll('.quiz-option')[0].dispatchEvent(new Event('click'));
      root.querySelector('#quiz-next').dispatchEvent(new Event('click'));
    }
  });
  assert(JSON.stringify(bank) === originalBank, 'el motor no debe alterar el banco');
});

console.log(`\n${failed ? 'FALLOS: ' + failed + ' · ' : ''}${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);

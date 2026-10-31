'use strict';

/* Vistas y flujo reales sobre el banco existente; storage/reloj/DOM aislados.
   Navegación del navegador, teclado y PWA también se verifican por separado. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const { load } = require('./study-guided.test');
const APP = fs.readFileSync('js/app.js', 'utf8');
let passed = 0, failed = 0;

function check(name, fn) {
  try {
    const h = load();
    vm.runInContext('SMR.progress.data = defaultProgress();', h.g);
    vm.runInContext(APP.slice(APP.indexOf('function progressBar('), APP.indexOf('function wrongResourceIds()')), h.g);
    vm.runInContext(APP.slice(APP.indexOf('function statCard('), APP.indexOf('/* ---------- Rutas ---------- */')), h.g);
    vm.runInContext(fs.readFileSync('js/dashboard.js', 'utf8'), h.g);
    fn(h);
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.error('  ✗ ' + name + ' → ' + e.message);
    if (process.env.TRACE === '1') console.error(e.stack);
  }
}

const click = (h, id) => h.root.querySelector('#question-study-' + id).click();
function start(h, source = '') {
  h.g.SMR_TESTS.renderStudy(h.root, () => h.startStudy(10, h.root));
  h.root.querySelector('#question-study-category').value = source;
  click(h, 'start');
}

check('estadísticas: solo estudio muestra minutos, sesiones y actividad sin inventar tests', (h) => {
  h.g.SMR.progress.recordStudySession(7, 3);
  const before = JSON.stringify(h.g.SMR.progress.data.tests);
  h.g.renderEstadisticas(h.root);
  assert.ok(!h.root.innerHTML.includes('Todavía no hay datos que mostrar'));
  assert.ok(h.root.innerHTML.includes('0h 7m'));
  assert.ok(h.root.innerHTML.includes('1 sesión reciente'));
  assert.ok(h.root.innerHTML.includes('Sesión de estudio completada'));
  assert.ok(h.root.innerHTML.includes('Sin tests realizados'));
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests), before);
});

for (const kind of ['minutos', 'actividad', 'racha', 'SRS']) check('estadísticas: reconoce progreso existente de ' + kind, (h) => {
  const p = h.g.SMR.progress.data;
  if (kind === 'minutos') p.studyMinutes = 12;
  if (kind === 'actividad') p.activity.push({ type: 'estudio', label: 'Sesión de estudio completada', meta: '', ts: h.g.Date.now() });
  if (kind === 'racha') p.streak = { lastDay: '2027-01-15', count: 1 };
  if (kind === 'SRS') p.tests.srs[h.id] = { level: 1, due: 0 };
  h.g.renderEstadisticas(h.root);
  assert.ok(!h.root.innerHTML.includes('Todavía no hay datos que mostrar'));
});

check('Dashboard: etiquetas de tests y fórmulas intactas con solo estudio', (h) => {
  h.g.SMR.progress.recordStudySession(4, 2);
  const before = JSON.stringify(h.g.SMR.progress.data.tests);
  h.g.SMR.dashboard.render(h.root);
  assert.ok(h.root.innerHTML.includes('Preguntas de tests hoy'));
  assert.ok(!h.root.innerHTML.includes('Tarjetas hoy'));
  assert.equal(h.g.SMR.dashboard.calculateHabits().cardsToday, 0);
  assert.equal(h.g.SMR.dashboard.calculateHabits().accuracy, null);
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests), before);
});

check('accesibilidad: foco, revelado textual e indicador de preguntas reveladas', (h) => {
  start(h);
  assert.equal(h.root.querySelector('.quiz-q').focused, true);
  assert.ok(h.root.innerHTML.includes('aria-label="Preguntas reveladas"'));
  assert.ok(h.root.innerHTML.includes('aria-valuenow="0"'));
  click(h, 'reveal');
  assert.equal(h.root.querySelector('#question-study-answer').focused, true);
  assert.ok(h.root.innerHTML.includes('Respuesta correcta:'));
  assert.ok(h.root.innerHTML.includes('aria-valuenow="1"'));
  h.root.querySelectorAll('[data-srs-rate]')[0].click();
  assert.equal(h.root.querySelector('#question-study-next').focused, true);
  click(h, 'next');
  assert.equal(h.root.querySelector('.quiz-q').focused, true);
});

check('salir y volver descarta sesión, conserva SRS y no registra al abandonar', (h) => {
  start(h);
  click(h, 'reveal');
  h.root.querySelectorAll('[data-srs-rate]')[2].click();
  const srs = JSON.stringify(h.g.SMR.progress.data.tests.srs);
  const stale = h.root.querySelector('#question-study-finish');
  h.g.SMR_TESTS.stop();
  stale.click();
  start(h);
  assert.ok(h.root.innerHTML.includes('Pregunta 1 de 154'));
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.srs), srs);
});

for (const change of ['logout', 'login', 'A→B', 'progress', 'pendiente']) check('guiado: ' + change + ' no atribuye la sesión al nuevo propietario', (h) => {
  const state = { owner: change === 'login' ? null : 'A', generation: 1, pending: false };
  h.g.SMR.cloudSession = {
    token: () => ({ owner: state.owner, generation: state.generation }),
    isCurrent: (t) => t.owner === state.owner && t.generation === state.generation,
    transitionPending: () => state.pending
  };
  h.startStudy(10, h.root);
  if (change === 'logout') state.owner = null;
  if (change === 'login') state.owner = 'A';
  if (change === 'A→B') state.owner = 'B';
  if (change === 'progress') h.g.SMR.progress.data = JSON.parse(JSON.stringify(h.g.SMR.progress.data));
  if (change === 'pendiente') state.pending = true;
  h.root.querySelectorAll('[data-study-open-res]')[0].click();
  h.finishStudy(h.root, false);
  assert.equal(h.opened.length, 0);
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
  assert.equal(h.state.active, false);
});

for (const source of ['', 'Redes', '__errores', '__srs']) check('offline visitante: revelar, valorar y terminar ' + (source || 'Todas'), (h) => {
  const p = h.g.SMR.progress.data;
  p.tests.wrong[h.first.id] = { [h.id]: 1 };
  p.tests.srs[h.id] = { level: 1, due: 0 };
  const before = JSON.stringify({ ...p.tests, srs: null });
  const pending = [];
  h.g.SMR.offlineStore = { savePendingAction: (type) => { pending.push(type); return Promise.resolve(); } };
  start(h, source);
  click(h, 'reveal');
  h.root.querySelectorAll('[data-srs-rate]')[1].click();
  click(h, 'finish');
  assert.equal(p.studySessions.length, 1);
  assert.equal(p.studySessions[0].steps, 1);
  assert.ok(pending.includes('progress'));
  assert.equal(JSON.stringify({ ...p.tests, srs: null }), before);
});

console.log(`\n${passed} ok, ${failed} fallos`);
process.exitCode = failed ? 1 : 0;

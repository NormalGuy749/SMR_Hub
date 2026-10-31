'use strict';

/* Banco, selector, progreso y flujo guiado reales; DOM, reloj y storage
   aislados. La comprobación visual se realiza además en navegador. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const APP = fs.readFileSync('js/app.js', 'utf8');
let passed = 0, failed = 0;

function rootElement() {
  let html = '', nodes = [];
  const matches = (n, sel) => sel.startsWith('#') ? n.id === sel.slice(1)
    : sel.startsWith('.') ? n.classes.has(sel.slice(1))
      : Object.hasOwn(n.attrs, sel.slice(1, -1));
  return {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      nodes = [...value.matchAll(/<(?:button|div|p|select|h[23])\b([^>]*)>/g)].map((match) => {
        const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((a) => [a[1], a[2] || '']));
        const classes = new Set((attrs.class || '').split(' '));
        const listeners = [];
        return {
          attrs, classes, id: attrs.id, hidden: Object.hasOwn(attrs, 'hidden'),
          disabled: Object.hasOwn(attrs, 'disabled'), innerHTML: '', textContent: '', value: '',
          dataset: Object.fromEntries(Object.entries(attrs).filter(([k]) => k.startsWith('data-'))
            .map(([k, v]) => [k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v])),
          classList: { add: (c) => classes.add(c), toggle: (c, active) => active ? classes.add(c) : classes.delete(c) },
          focus() { this.focused = true; },
          setAttribute(k, v) { attrs[k] = v; },
          closest(sel) { return nodes.find((n) => matches(n, sel)) || null; },
          querySelector(sel) { return nodes.find((n) => matches(n, sel)) || null; },
          querySelectorAll(sel) { return nodes.filter((n) => matches(n, sel)); },
          addEventListener(type, fn, opts) { if (type === 'click') listeners.push({ fn, once: !!(opts && opts.once) }); },
          click() {
            if (this.disabled || this.hidden) return;
            listeners.slice().forEach((l) => {
              if (l.once) listeners.splice(listeners.indexOf(l), 1);
              l.fn();
            });
          }
        };
      });
    },
    querySelector(sel) { return nodes.find((n) => matches(n, sel)) || null; },
    querySelectorAll(sel) { return nodes.filter((n) => matches(n, sel)); }
  };
}

function load() {
  let now = 1800000000000, timerId = 0;
  const timers = new Map(), storage = new Map(), opened = [];
  const root = rootElement();
  const g = {
    console: { info() {}, warn() {} }, navigator: { onLine: false },
    Date: class extends Date { static now() { return now; } },
    setInterval(fn) { timers.set(++timerId, fn); return timerId; },
    clearInterval(id) { timers.delete(id); },
    document: { querySelector: (sel) => root.querySelector(sel) }
  };
  g.window = g;
  vm.createContext(g);
  for (const f of ['data', 'content', 'questions', 'srs', 'topics', 'questionTopics']) vm.runInContext(fs.readFileSync('js/' + f + '.js', 'utf8'), g);
  Object.assign(g.SMR, {
    esc: String, icon: () => '',
    store: {
      readBase: () => null, get: (k, fallback) => storage.get(k) || fallback,
      writeMerged(k, value) { storage.set(k, JSON.parse(JSON.stringify(value))); }
    }
  });
  vm.runInContext('const SMR = window.SMR; const D = window.SMR_DATA; const CATEGORIES = D.categories;\n'
    + APP.slice(APP.indexOf("const PROGRESS_KEY ="), APP.indexOf('/* Compatibilidad: importa')), g);
  vm.runInContext(fs.readFileSync('js/tests.js', 'utf8'), g);
  vm.runInContext(APP.slice(APP.indexOf('function wrongResourceIds()'), APP.indexOf('/* Recursos recomendados con motivo')), g);
  g.timeAgo = () => 'ahora';
  g.openResource = (id) => { opened.push(id); g.SMR.progress.markViewed(id); };
  g.SMR.openResource = g.openResource;
  vm.runInContext(APP.slice(APP.indexOf('const STUDY_DURATIONS'), APP.indexOf('/* ---------- Casos prácticos'))
    + '\nthis.study = { state: studyState, startStudy, renderStudyStep, studyQuestionHtml, finishStudy };', g);
  const first = g.SMR_DATA.tests[0];
  const id = g.SMR.srs.idOf(first.id, 0);
  Object.assign(g.SMR.progress.data.tests, {
    best: { [first.id]: 75 }, last: { [first.id]: 50 },
    history: [{ testId: first.id, title: first.title, mode: 'practica', correct: 1, total: 2, pct: 50, date: now - 1000 }],
    wrong: { [first.id]: { [id]: 2 } }, srs: { [id]: { level: 2, due: now + 86400000 } }
  });
  const baseline = JSON.stringify(g.SMR.progress.data.tests);
  return {
    g, root, timers, storage, opened, first, id, ...g.study,
    advanceTime(ms) { now += ms; },
    tick() { [...timers.values()].forEach((fn) => fn()); },
    unchanged() { assert.equal(JSON.stringify(g.SMR.progress.data.tests), baseline, 'cambió una métrica de test o SRS'); }
  };
}

function check(name, fn) {
  if (require.main !== module) return;
  try {
    const h = load();
    fn(h);
    h.unchanged();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.error('  ✗ ' + name + ' → ' + e.message);
    if (process.env.TRACE === '1') console.error(e.stack);
  }
}

function questionStep(h) {
  h.startStudy(10, h.root);
  h.root.querySelector('#study-continue').click();
  return h.state.steps[h.state.index];
}

function complete(h) {
  h.startStudy(10, h.root);
  while (!h.root.querySelector('#study-finish')) {
    const step = h.state.steps[h.state.index];
    if (step.type === 'question' && step.question) h.root.querySelectorAll('.quiz-option')[step.question.q.correct].click();
    h.root.querySelector('#study-continue').click();
  }
  h.advanceTime(2 * 60000);
  h.root.querySelector('#study-finish').click();
}

check('studyQuestion devuelve candidate.q y conserva la identidad y procedencia', (h) => {
  const candidate = h.g.SMR_TESTS.studyQuestion();
  const test = h.g.SMR_DATA.tests.find((t) => t.id === candidate.testId);
  assert.equal(candidate.q, test.questions[candidate.origIndex]);
  assert.equal(candidate.testTitle, test.title);
  assert.equal(candidate.category, test.category);
});

check('un candidato SRS conserva testTitle, category y origIndex', (h) => {
  h.g.SMR.progress.dueSrs = () => [{ testId: h.first.id, qIndex: 0 }];
  const c = h.g.SMR_TESTS.studyQuestion();
  assert.equal(c.q, h.first.questions[0]);
  assert.equal(c.origIndex, 0);
  assert.equal(c.testTitle, h.first.title);
  assert.equal(c.category, h.first.category);
});

check('render válido de candidate.q: texto y todas sus opciones, sin excepción', (h) => {
  const step = questionStep(h);
  const html = h.studyQuestionHtml(step);
  assert.ok(html.includes(step.question.q.q));
  assert.equal(h.root.querySelectorAll('.quiz-option').length, step.question.q.options.length);
  assert.equal(h.state.usedQ[0], step.question.testId + ':' + step.question.origIndex);
});

check('corregir usa candidate.q y permite avanzar sin alterar tests ni SRS', (h) => {
  const step = questionStep(h), candidate = step.question;
  h.root.querySelectorAll('.quiz-option')[candidate.q.correct].click();
  assert.equal(step.ok, true);
  assert.equal(step.answered, true);
  assert.equal(step.question, candidate);
  assert.ok(h.root.querySelector('[data-explain]').innerHTML.includes(candidate.q.explain));
  assert.equal(h.root.querySelector('#study-continue').hidden, false);
  h.root.querySelector('#study-continue').click();
  assert.equal(h.state.index, 2);
});

check('respuesta incorrecta: corrección visible y botones deshabilitados', (h) => {
  const step = questionStep(h), q = step.question.q;
  h.root.querySelectorAll('.quiz-option')[(q.correct + 1) % q.options.length].click();
  assert.equal(step.ok, false);
  assert.ok(h.root.querySelectorAll('.quiz-option').every((n) => n.disabled));
  assert.ok(h.root.querySelectorAll('.quiz-option')[q.correct].classes.has('correct'));
});

check('repintar una pregunta respondida mantiene corrección y avance', (h) => {
  const step = questionStep(h);
  h.root.querySelectorAll('.quiz-option')[step.question.q.correct].click();
  h.renderStudyStep(h.root);
  assert.ok(h.root.querySelectorAll('.quiz-option').every((n) => n.disabled));
  assert.equal(h.root.querySelector('#study-continue').hidden, false);
});

check('abrir recurso conserva el paso y marca únicamente el recurso visto', (h) => {
  h.startStudy(10, h.root);
  const step = h.state.steps[0];
  h.root.querySelectorAll('[data-study-open-res]')[0].click();
  assert.equal(h.opened[0], step.resourceId);
  assert.ok(h.g.SMR.progress.data.resources.viewed[step.resourceId]);
  assert.equal(h.state.index, 0);
});

check('banco agotado: studyQuestion devuelve null y el bloque permite continuar', (h) => {
  h.g.SMR_DATA.tests = [];
  assert.equal(h.g.SMR_TESTS.studyQuestion(), null);
  const step = questionStep(h);
  assert.equal(step.question, null);
  assert.ok(h.root.innerHTML.includes('No hay preguntas disponibles'));
  assert.equal(h.root.querySelector('#study-continue').hidden, false);
  h.root.querySelector('#study-continue').click();
  assert.equal(h.state.index, 2);
});

check('sin recursos no inicia una sesión vacía ni registra progreso', (h) => {
  h.g.SMR_DATA.resources = [];
  h.startStudy(10, h.root);
  assert.equal(h.state.active, false);
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
  assert.equal(h.timers.size, 0);
});

check('visitante offline completa varios bloques y guarda sesión, actividad y racha', (h) => {
  assert.equal(h.g.SMR.cloudSession, undefined);
  complete(h);
  const p = h.g.SMR.progress.data;
  assert.equal(p.studySessions.length, 1);
  assert.equal(p.studySessions[0].steps, h.state.steps.length - 1);
  assert.equal(p.activity[0].type, 'estudio');
  assert.equal(p.streak.count, 1);
  assert.equal(h.storage.get('progress').studySessions.length, 1);
  assert.equal(h.state.active, false);
  assert.equal(h.timers.size, 0);
});

check('finalizar dos veces solo registra una sesión', (h) => {
  complete(h);
  h.finishStudy(h.root, false);
  assert.equal(h.g.SMR.progress.data.studySessions.length, 1);
});

check('sesión de 10 minutos terminada en 2 registra 2, no 10', (h) => {
  h.startStudy(10, h.root);
  h.advanceTime(2 * 60000);
  h.finishStudy(h.root, false);
  assert.equal(h.g.SMR.progress.data.studySessions[0].minutes, 2);
  assert.equal(h.g.SMR.progress.data.studyMinutes, 2);
});

check('sesión inferior a un minuto no inventa un minuto estudiado', (h) => {
  h.startStudy(10, h.root);
  h.advanceTime(10000);
  h.finishStudy(h.root, false);
  assert.equal(h.g.SMR.progress.data.studySessions[0].minutes, 0);
});

check('tiempo agotado finaliza una vez y registra solo pasos completados', (h) => {
  h.startStudy(10, h.root);
  h.root.querySelector('#study-continue').click();
  h.advanceTime(10 * 60000);
  h.tick();
  h.tick();
  const sessions = h.g.SMR.progress.data.studySessions;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].minutes, 10);
  assert.equal(sessions[0].steps, 1);
  assert.equal(h.timers.size, 0);
});

check('abandonar detiene el reloj y no registra sesión ni actividad', (h) => {
  h.startStudy(10, h.root);
  h.root.querySelector('#study-exit').click();
  h.advanceTime(20 * 60000);
  h.tick();
  assert.equal(h.state.active, false);
  assert.equal(h.state.steps.length, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
  assert.equal(h.g.SMR.progress.data.activity.length, 0);
});

check('sesión libre guarda tiempo transcurrido y un único temporizador', (h) => {
  h.startStudy(0, h.root);
  h.root.querySelector('#study-continue').click();
  assert.equal(h.timers.size, 1);
  h.advanceTime(3 * 60000);
  h.finishStudy(h.root, false);
  assert.equal(h.g.SMR.progress.data.studySessions[0].minutes, 3);
});

module.exports = { load };
if (require.main === module) {
  console.log(`\n${passed} ok, ${failed} fallos`);
  process.exitCode = failed ? 1 : 0;
}

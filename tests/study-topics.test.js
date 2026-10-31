'use strict';

/* Banco y relaciones canónicas reales. Las pruebas negativas alteran solo
   respuestas de la API en este contexto aislado, nunca la taxonomía fuente. */
const fs = require('fs');
const assert = require('assert/strict');
const { load } = require('./study-guided.test');
let passed = 0, failed = 0;

function check(name, fn) {
  try {
    const h = load();
    const initial = JSON.stringify({ ...h.g.SMR.progress.data.tests, srs: null });
    h.calls = [];
    const schedule = h.g.SMR.progress.scheduleSrs;
    h.g.SMR.progress.scheduleSrs = function (...args) { h.calls.push(args); return schedule.apply(this, args); };
    fn(h);
    assert.equal(JSON.stringify({ ...h.g.SMR.progress.data.tests, srs: null }), initial, 'se alteraron métricas de test/errores');
    if (!h.calls.length) h.unchanged();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    failed++;
    console.error('  ✗ ' + name + ' → ' + e.message);
    if (process.env.TRACE === '1') console.error(e.stack);
  }
}

const click = (h, id) => {
  const node = h.root.querySelector('#question-study-' + id);
  assert.ok(node, 'control ausente: ' + id);
  node.click();
};
function setup(h) { h.g.SMR_TESTS.renderStudy(h.root, () => h.startStudy(10, h.root)); }
function start(h, topic = 't-subnetting') {
  setup(h);
  h.root.querySelector('#question-study-category').value = '__tema:' + topic;
  click(h, 'start');
}
function rate(h) { h.root.querySelectorAll('[data-srs-rate]')[2].click(); }

check('las cuatro entradas cargan temas tras srs y antes del motor, sin añadir dependencias curriculares', () => {
  for (const file of ['index.html', 'tests.html', 'glosario.html', 'recursos/subnetting.html']) {
    const html = fs.readFileSync(file, 'utf8');
    const scripts = [...html.matchAll(/<script src="(js\/[^"]+)" defer/g)].map((m) => m[1]);
    assert.equal(scripts.filter((s) => s === 'js/topics.js').length, 1, file);
    assert.equal(scripts.filter((s) => s === 'js/questionTopics.js').length, 1, file);
    assert.ok(scripts.indexOf('js/topics.js') > scripts.indexOf('js/srs.js'), file);
    assert.ok(scripts.indexOf('js/questionTopics.js') > scripts.indexOf('js/topics.js'), file);
    assert.ok(scripts.indexOf('js/questionTopics.js') < scripts.indexOf('js/tests.js'), file);
    assert.ok(!scripts.includes('js/moduleTopics.js'), file);
    assert.equal(scripts.filter((s) => s === 'js/curriculum.js').length, 1, 'se conserva la dependencia previa');
  }
});

check('taxonomía real: 55 temas, 54 utilizables y 154 asociaciones activas sin pérdida de confianza', (h) => {
  const s = h.g.SMR;
  assert.equal(s.topics.list.length, 55);
  assert.equal(s.topics.list.filter((t) => s.questionsOfTopic(t.id).length).length, 54);
  const m = s.validateQuestionTopics();
  assert.equal(m.ok, true);
  assert.equal(m.byStatus.active, 154);
  assert.equal(m.byConfidence.high, 141);
  assert.equal(m.byConfidence.medium, 13);
});

check('UI: solo temas utilizables, nombres canónicos y conteos exactos', (h) => {
  setup(h);
  const s = h.g.SMR;
  const group = h.root.innerHTML.match(/<optgroup label="Por tema">([\s\S]*?)<\/optgroup>/);
  assert.ok(group);
  assert.equal((group[1].match(/<option/g) || []).length, 54);
  s.topics.list.forEach((topic) => {
    const count = s.questionsOfTopic(topic.id).length;
    assert.equal(group[1].includes('value="__tema:' + topic.id + '"'), count > 0);
    if (count) assert.ok(group[1].includes(topic.name + ' (' + count + ')'));
  });
});

check('cada tema selecciona exactamente sus IDs estables y conserva procedencia', (h) => {
  const s = h.g.SMR;
  const beforeMapping = JSON.stringify(s.questionTopics());
  for (const topic of s.topics.list) {
    const ids = s.questionsOfTopic(topic.id);
    if (!ids.length) continue;
    start(h, topic.id);
    const seen = new Set();
    ids.forEach((_id, i) => {
      assert.ok(h.root.innerHTML.includes('Pregunta ' + (i + 1) + ' de ' + ids.length));
      assert.ok(h.root.innerHTML.includes(topic.name));
      click(h, 'reveal');
      const ds = h.root.querySelector('[data-srs-test]').dataset;
      const id = s.srs.idOf(ds.srsTest, Number(ds.srsIndex));
      assert.ok(ids.includes(id) && !seen.has(id));
      seen.add(id);
      const test = h.g.SMR_DATA.tests.find((t) => t.id === ds.srsTest);
      assert.ok(h.root.innerHTML.includes(test.questions[Number(ds.srsIndex)].q));
      assert.ok(h.root.innerHTML.includes(test.title));
      assert.ok(h.root.innerHTML.includes(test.category));
      if (i + 1 < ids.length) click(h, 'next');
    });
    assert.equal(seen.size, ids.length);
  }
  assert.equal(JSON.stringify(s.questionTopics()), beforeMapping);
});

check('un tema reúne varias categorías reales sin aplicar un filtro adicional', (h) => {
  start(h, 't-refrigeracion');
  const categories = new Set();
  for (let i = 0; i < 7; i++) {
    click(h, 'reveal');
    const ds = h.root.querySelector('[data-srs-test]').dataset;
    categories.add(h.g.SMR_DATA.tests.find((t) => t.id === ds.srsTest).category);
    if (i < 6) click(h, 'next');
  }
  assert.deepEqual([...categories].sort(), ['Hardware', 'Mantenimiento']);
});

check('deduplica IDs de la API y excluye los no resolubles sin modificar el mapping', (h) => {
  const s = h.g.SMR, real = s.questionsOfTopic;
  const mapping = JSON.stringify(s.questionTopics());
  s.questionsOfTopic = (id) => real(id).concat(real(id), ['q-0000000000000000']);
  start(h);
  assert.ok(h.root.innerHTML.includes('Pregunta 1 de ' + real('t-subnetting').length));
  assert.equal(JSON.stringify(s.questionTopics()), mapping);
});

check('cola fija tras iniciar aunque la API deje de devolver asociaciones', (h) => {
  start(h);
  h.g.SMR.questionsOfTopic = () => [];
  click(h, 'reveal');
  click(h, 'next');
  assert.ok(h.root.innerHTML.includes('Pregunta 2 de '));
});

for (const topic of ['t-diagnostico', 't-no-existe']) check('vacío ' + topic + ': no inicia ni registra ni recurre a Todas', (h) => {
  start(h, topic);
  assert.equal(h.root.querySelector('#question-study-reveal'), null);
  assert.match(h.root.querySelector('#question-study-status').textContent, /No hay preguntas disponibles para este tema/);
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
});

check('asociación huérfana única no aparece como tema utilizable ni se borra', (h) => {
  const real = h.g.SMR.questionsOfTopic;
  const orphan = Object.freeze(['q-0000000000000000']);
  h.g.SMR.questionsOfTopic = (id) => id === 't-subnetting' ? orphan : real(id);
  setup(h);
  assert.ok(!h.root.innerHTML.includes('value="__tema:t-subnetting"'));
  h.root.querySelector('#question-study-category').value = '__tema:t-subnetting';
  click(h, 'start');
  assert.equal(h.root.querySelector('#question-study-reveal'), null);
  assert.equal(orphan.length, 1);
});

check('visitante offline: revelar y avanzar no programan SRS; valorar sí, una vez', (h) => {
  assert.equal(h.g.navigator.onLine, false);
  assert.equal(h.g.SMR.cloudSession, undefined);
  start(h);
  click(h, 'reveal');
  const before = JSON.stringify(h.g.SMR.progress.data.tests.srs);
  click(h, 'next');click(h, 'reveal');
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.srs), before);
  const ds = h.root.querySelector('[data-srs-test]').dataset;
  const button = h.root.querySelectorAll('[data-srs-rate]')[2];
  rate(h);button.disabled = false;button.click();
  assert.deepEqual(h.calls, [[ds.srsTest, Number(ds.srsIndex), 2]]);
  click(h, 'finish');
  assert.equal(h.g.SMR.progress.data.studySessions[0].steps, 2);
});

for (const change of ['logout', 'login', 'A→B', 'generación', 'progress', 'pendiente']) {
  check('tema: ' + change + ' invalida valoración y finalización', (h) => {
    const state = { owner: change === 'login' ? null : 'A', generation: 1, pending: false };
    h.g.SMR.cloudSession = {
      token: () => ({ owner: state.owner, generation: state.generation }),
      isCurrent: (t) => t.owner === state.owner && t.generation === state.generation,
      transitionPending: () => state.pending
    };
    start(h);click(h, 'reveal');
    if (change === 'logout') state.owner = null;
    if (change === 'login') state.owner = 'A';
    if (change === 'A→B') state.owner = 'B';
    if (change === 'generación') state.generation++;
    if (change === 'progress') h.g.SMR.progress.data = JSON.parse(JSON.stringify(h.g.SMR.progress.data));
    if (change === 'pendiente') state.pending = true;
    rate(h);click(h, 'finish');
    assert.equal(h.calls.length, 0);
    assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
  });
}

console.log(`\n${passed} ok, ${failed} fallos`);
process.exitCode = failed ? 1 : 0;

'use strict';

/* Reutiliza banco, progreso, motor y harness del guiado. Las preguntas de
   las fixtures son siempre las reales; no se copia contenido educativo. */
const assert = require('assert/strict');
const { load } = require('./study-guided.test');
let passed = 0, failed = 0;

function metrics(data) {
  const { srs, ...rest } = data.tests;
  return JSON.stringify(rest);
}

function check(name, fn, setup = () => {}) {
  try {
    const h = load();
    setup(h);
    const initial = metrics(h.g.SMR.progress.data);
    const initialSrs = JSON.stringify(h.g.SMR.progress.data.tests.srs);
    h.calls = [];
    const schedule = h.g.SMR.progress.scheduleSrs;
    h.g.SMR.progress.scheduleSrs = function (...args) { h.calls.push(args); return schedule.apply(this, args); };
    h.g.SMR_TESTS.renderStudy(h.root, () => h.startStudy(10, h.root));
    fn(h);
    assert.equal(metrics(h.g.SMR.progress.data), initial, 'best/last/history/wrong cambiaron');
    if (!h.calls.length) assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.srs), initialSrs, 'SRS cambió sin valoración');
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
  return node;
};
function start(h, category = '') {
  h.root.querySelector('#question-study-category').value = category;
  click(h, 'start');
}
function rate(h, value) {
  const btn = h.root.querySelectorAll('[data-srs-rate]').find((n) => n.dataset.srsRate === String(value));
  assert.ok(btn);
  btn.click();
  return btn;
}
function single(h, predicate = () => true) {
  const test = h.g.SMR_DATA.tests.find((t) => t.questions.some(predicate));
  const q = test.questions.find(predicate);
  h.g.SMR_DATA.tests = [{ ...test, questions: [q] }];
  h.g.SMR.srs.buildIndex();
  return { test, q };
}
function owner(h) {
  const state = { owner: 'A', generation: 1, pending: false };
  h.g.SMR.cloudSession = {
    token: () => ({ owner: state.owner, generation: state.generation }),
    isCurrent: (t) => t.owner === state.owner && t.generation === state.generation,
    transitionPending: () => state.pending
  };
  return state;
}

function errors(h) {
  const id1 = h.g.SMR.srs.idOf(h.first.id, 1);
  h.g.SMR.progress.data.tests.wrong = {
    [h.first.id]: { [h.id]: 2, 0: 9, [id1]: 4, 'q-0000000000000000': 7, 9999: 10 },
    'test-no-existe': { 0: 5 }
  };
}

function due(h) {
  const now = h.g.Date.now();
  h.g.SMR.progress.data.tests.srs = {
    [h.id]: { level: 2, due: now - 1000 },
    [h.first.id + ':0']: { level: 2, due: now - 5000 },
    [h.g.SMR.srs.idOf(h.first.id, 1)]: { level: 1, due: now - 10000 },
    [h.g.SMR.srs.idOf(h.first.id, 2)]: { level: 3, due: now + 86400000 },
    'q-0000000000000000': { level: 1, due: now - 20000 },
    [h.first.id + ':9999']: { level: 1, due: now - 30000 }
  };
}

check('Todas: 154 candidatos, orden original y procedencia en la presentación', (h) => {
  start(h);
  assert.ok(h.root.innerHTML.includes('Pregunta 1 de 154'));
  assert.ok(h.root.innerHTML.includes(h.first.questions[0].q));
  assert.ok(h.root.innerHTML.includes(h.first.title));
  assert.ok(h.root.innerHTML.includes(h.first.category));
  click(h, 'reveal');
  const identity = h.root.querySelector('[data-srs-test]').dataset;
  assert.equal(identity.srsTest, h.first.id);
  assert.equal(identity.srsIndex, '0');
});

check('categorías: solo las siete editoriales con preguntas', (h) => {
  const cats = new Set(h.g.SMR_DATA.tests.filter((t) => t.questions.length).map((t) => t.category));
  assert.equal(cats.size, 7);
  cats.forEach((cat) => assert.ok(h.root.innerHTML.includes(`<option value="${cat}">`)));
  const group = h.root.innerHTML.match(/<optgroup label="Por categoría">([\s\S]*?)<\/optgroup>/)[1];
  assert.equal((group.match(/<option/g) || []).length, 7);
});

check('por categoría: solo sus preguntas y procedencia del test original', (h) => {
  const test = h.g.SMR_DATA.tests.find((t) => t.category === 'Redes');
  start(h, test.category);
  assert.ok(h.root.innerHTML.includes('Pregunta 1 de 27'));
  for (let i = 0; i < test.questions.length; i++) {
    assert.ok(h.root.innerHTML.includes(test.questions[i].q));
    click(h, 'reveal');
    const ds = h.root.querySelector('[data-srs-test]').dataset;
    assert.equal(ds.srsTest, test.id);
    assert.equal(ds.srsIndex, String(i));
    if (i + 1 < test.questions.length) click(h, 'next');
  }
});

check('IDs estables únicos: las 154 presentaciones conservan su identidad', (h) => {
  start(h);
  const ids = new Set();
  for (let i = 0; i < 154; i++) {
    click(h, 'reveal');
    const ds = h.root.querySelector('[data-srs-test]').dataset;
    const id = h.g.SMR.srs.idOf(ds.srsTest, Number(ds.srsIndex));
    assert.ok(id && !ids.has(id));
    ids.add(id);
    if (i < 153) click(h, 'next');
  }
  assert.equal(ids.size, 154);
  assert.equal(h.root.querySelector('#question-study-next'), null);
});

check('deduplica candidatos por idOf y excluye identidades no resolubles', (h) => {
  h.g.SMR.srs.idOf = (_test, i) => i < 2 ? h.id : null;
  start(h);
  assert.ok(h.root.innerHTML.includes('Pregunta 1 de 1'));
});

check('cola fija: no rellena ni vuelve a seleccionar al avanzar', (h) => {
  const second = h.first.questions[1];
  start(h);
  h.g.SMR_DATA.tests = [];
  click(h, 'reveal');
  click(h, 'next');
  assert.ok(h.root.innerHTML.includes('Pregunta 2 de 154'));
  assert.ok(h.root.innerHTML.includes(second.q));
});

check('antes del revelado no hay solución, explicación, valoración ni pistas visuales', (h) => {
  start(h);
  const html = h.root.innerHTML;
  assert.ok(!html.includes('Respuesta correcta:'));
  assert.ok(!html.includes(h.first.questions[0].explain));
  assert.ok(!html.includes('data-srs-rate'));
  assert.ok(!/class="[^"]*\b(correct|wrong|active)\b/.test(html));
  assert.equal(h.root.querySelector('#question-study-next'), null);
});

check('revela respuesta correcta, explicación y opciones originales sin guardar SRS', (h) => {
  const q = h.first.questions[0];
  start(h);
  q.options.forEach((opt) => assert.ok(h.root.innerHTML.includes(opt)));
  click(h, 'reveal');
  assert.ok(h.root.innerHTML.includes('Respuesta correcta:</strong> ' + q.options[q.correct]));
  assert.ok(h.root.innerHTML.includes(q.explain));
  assert.equal(h.calls.length, 0);
});

check('recurso válido: solo después de revelar y abre el recurso real', (h) => {
  const { q } = single(h, (q) => !!q.relatedResource);
  start(h);
  assert.equal(h.root.querySelector('#question-study-resource'), null);
  click(h, 'reveal');
  click(h, 'resource');
  assert.equal(h.opened[0], q.relatedResource);
});

check('sin recurso existente no inventa un enlace', (h) => {
  single(h, (q) => !q.relatedResource);
  start(h);
  click(h, 'reveal');
  assert.equal(h.root.querySelector('#question-study-resource'), null);
});

for (const value of [0, 1, 2]) check('valoración explícita ' + value + ': usa scheduleSrs y la identidad de origen', (h) => {
  start(h);
  click(h, 'reveal');
  rate(h, value);
  assert.deepEqual(h.calls, [[h.first.id, 0, value]]);
  const card = h.g.SMR.progress.data.tests.srs[h.id];
  assert.equal(card.level, value === 0 ? 1 : value === 1 ? 2 : 3);
  assert.ok(h.storage.get('progress').tests.srs[h.id]);
});

check('doble valoración bloqueada aunque se reactive el botón o se elija otro', (h) => {
  start(h);
  click(h, 'reveal');
  const old = rate(h, 2);
  old.disabled = false;
  old.click();
  const other = h.root.querySelectorAll('[data-srs-rate]')[0];
  other.disabled = false;
  other.click();
  assert.equal(h.calls.length, 1);
});

check('presentaciones distintas pueden valorarse; controles antiguos no escriben', (h) => {
  start(h);
  click(h, 'reveal');
  const old = rate(h, 0);
  click(h, 'next');
  click(h, 'reveal');
  old.disabled = false;
  old.click();
  rate(h, 2);
  assert.deepEqual(h.calls, [[h.first.id, 0, 0], [h.first.id, 1, 2]]);
});

check('avanzar sin valorar es válido y no cambia SRS', (h) => {
  start(h);
  click(h, 'reveal');
  click(h, 'next');
  assert.ok(h.root.innerHTML.includes('Pregunta 2 de 154'));
  assert.equal(h.calls.length, 0);
});

check('finalizar registra una única sesión y cuenta revelados, no renderizados', (h) => {
  start(h);
  const reveal = click(h, 'reveal');
  reveal.click();
  click(h, 'next');
  h.advanceTime(2 * 60000);
  const finish = click(h, 'finish');
  finish.click();
  const p = h.g.SMR.progress.data;
  assert.equal(p.studySessions.length, 1);
  assert.equal(p.studySessions[0].steps, 1);
  assert.equal(p.studySessions[0].minutes, 2);
  assert.equal(p.studyMinutes, 2);
  assert.equal(p.activity.length, 1);
  assert.equal(p.streak.count, 1);
  assert.equal(h.calls.length, 0);
});

check('duración corta no inflada y sin temporizador nuevo', (h) => {
  start(h);
  click(h, 'reveal');
  h.advanceTime(10000);
  click(h, 'finish');
  assert.equal(h.g.SMR.progress.data.studySessions[0].minutes, 0);
  assert.equal(h.timers.size, 0);
});

check('cola vacía informa sin registrar sesión', (h) => {
  h.g.SMR_DATA.tests = [];
  start(h);
  assert.match(h.root.querySelector('#question-study-status').textContent, /No hay preguntas/);
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
});

check('categoría inexistente no recurre al banco general', (h) => {
  start(h, '__sin_categoria__');
  assert.match(h.root.querySelector('#question-study-status').textContent, /No hay preguntas/);
  assert.equal(h.root.querySelector('#question-study-reveal'), null);
});

check('terminar sin revelar no registra una sesión vacía', (h) => {
  start(h);
  click(h, 'finish');
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
});

check('visitante offline termina y persiste por la infraestructura existente', (h) => {
  assert.equal(h.g.SMR.cloudSession, undefined);
  assert.equal(h.g.navigator.onLine, false);
  start(h);
  click(h, 'reveal');
  click(h, 'finish');
  assert.equal(h.storage.get('progress').studySessions.length, 1);
});

for (const [from, to] of [['A', '__guest__'], ['__guest__', 'A'], ['A', 'B'], ['A', 'A'], [null, 'A'], ['A', null]]) {
  check('cambio de propietario ' + from + ' → ' + to + ' bloquea valoración y finalización antiguas', (h) => {
    const s = owner(h);
    s.owner = from;
    start(h);
    click(h, 'reveal');
    s.owner = to;
    s.generation++;
    rate(h, 2);
    click(h, 'finish');
    assert.equal(h.calls.length, 0);
    assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
    assert.match(h.root.querySelector('#question-study-status').textContent, /cuenta cambió/);
  });
}

check('transición pendiente bloquea iniciar', (h) => {
  owner(h).pending = true;
  start(h);
  assert.equal(h.root.querySelector('#question-study-reveal'), null);
});

check('slot sin dueño confirmado impide iniciar', (h) => {
  owner(h).owner = '__unknown__';
  start(h);
  assert.equal(h.root.querySelector('#question-study-reveal'), null);
});

check('visitante con token owner:null puede valorar y terminar sin cambiar métricas de test', (h) => {
  owner(h).owner = null;
  start(h);
  click(h, 'reveal');
  rate(h, 1);
  click(h, 'finish');
  assert.equal(h.calls.length, 1);
  assert.equal(h.g.SMR.progress.data.studySessions.length, 1);
});

check('doble avance antiguo no salta una presentación', (h) => {
  start(h);
  click(h, 'reveal');
  const next = click(h, 'next');
  next.click();
  assert.ok(h.root.innerHTML.includes('Pregunta 2 de 154'));
});

check('activar el contrato cloud durante una sesión local invalida sus escrituras', (h) => {
  start(h);
  click(h, 'reveal');
  owner(h);
  rate(h, 2);
  click(h, 'finish');
  assert.equal(h.calls.length, 0);
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
});

check('transición pendiente bloquea SRS, recursos y finalizar', (h) => {
  single(h, (q) => !!q.relatedResource);
  const s = owner(h);
  start(h);
  click(h, 'reveal');
  s.pending = true;
  rate(h, 1);
  click(h, 'resource');
  click(h, 'finish');
  assert.equal(h.opened.length, 0);
  assert.equal(h.calls.length, 0);
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
});

check('sustituir el slot vivo invalida la sesión aunque el token siga vigente', (h) => {
  owner(h);
  start(h);
  click(h, 'reveal');
  h.g.SMR.progress.data = JSON.parse(JSON.stringify(h.g.SMR.progress.data));
  click(h, 'finish');
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
});

check('cloud disponible sin guard inicializado impide iniciar', (h) => {
  h.g.SMR.cloudAvailable = true;
  start(h);
  assert.equal(h.root.querySelector('#question-study-reveal'), null);
});

check('salida anticipada descarta la cola y conserva valoraciones ya guardadas', (h) => {
  start(h);
  click(h, 'reveal');
  rate(h, 2);
  const card = JSON.stringify(h.g.SMR.progress.data.tests.srs[h.id]);
  click(h, 'exit');
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.srs[h.id]), card);
  assert.ok(h.root.querySelector('#question-study-start'));
});

check('stop del router invalida controles antiguos sin guardar la sesión', (h) => {
  start(h);
  click(h, 'reveal');
  const finish = h.root.querySelector('#question-study-finish');
  h.g.SMR_TESTS.stop();
  finish.click();
  assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
});

check('la entrada secundaria abre el guiado existente', (h) => {
  click(h, 'guided');
  assert.equal(h.state.active, true);
  assert.equal(h.state.steps[0].type, 'explain');
});

check('Errores: contador de dos preguntas utilizables, no seis referencias crudas', (h) => {
  assert.ok(h.g.SMR.progress.wrongRefs().length > 2);
  assert.ok(h.root.innerHTML.includes('Errores (2)'));
}, errors);

check('Errores: resuelve, deduplica y conserva la procedencia de las dos preguntas', (h) => {
  start(h, '__errores');
  assert.ok(h.root.innerHTML.includes('Pregunta 1 de 2'));
  for (let i = 0; i < 2; i++) {
    assert.ok(h.root.innerHTML.includes(h.first.questions[i].q));
    click(h, 'reveal');
    const ds = h.root.querySelector('[data-srs-test]').dataset;
    assert.equal(ds.srsTest, h.first.id);
    assert.equal(ds.srsIndex, String(i));
    if (i === 0) click(h, 'next');
  }
  assert.equal(h.root.querySelector('#question-study-next'), null);
}, errors);

check('Errores: revelar, valorar y finalizar conservan todos los errores, incluidos los huérfanos', (h) => {
  const before = JSON.stringify(h.g.SMR.progress.data.tests.wrong);
  start(h, '__errores');
  click(h, 'reveal');
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.wrong), before);
  rate(h, 2);
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.wrong), before);
  click(h, 'finish');
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.wrong), before);
  assert.equal(h.g.SMR.progress.data.studySessions[0].steps, 1);
}, errors);

for (const unresolved of [false, true]) check('Errores: vacío' + (unresolved ? ' con referencias no resolubles conservadas' : ''), (h) => {
  const before = JSON.stringify(h.g.SMR.progress.data);
  start(h, '__errores');
  assert.match(h.root.querySelector('#question-study-status').textContent, /No tienes preguntas con errores pendientes/);
  assert.equal(h.root.querySelector('#question-study-reveal'), null);
  assert.equal(JSON.stringify(h.g.SMR.progress.data), before);
}, (h) => {
  h.g.SMR.progress.data.tests.wrong = unresolved ? { [h.first.id]: { 'q-0000000000000000': 2, 9999: 1 } } : {};
});

check('SRS: contador de dos pendientes utilizables, excluye futuras y referencias no resolubles', (h) => {
  assert.ok(h.g.SMR.progress.dueSrs().length > 2);
  assert.ok(h.root.innerHTML.includes('SRS pendientes (2)'));
}, due);

check('SRS: usa el orden de dueSrs, deduplica y conserva testId/origIndex', (h) => {
  start(h, '__srs');
  assert.ok(h.root.innerHTML.includes('Pregunta 1 de 2'));
  for (const i of [1, 0]) {
    assert.ok(h.root.innerHTML.includes(h.first.questions[i].q));
    click(h, 'reveal');
    const ds = h.root.querySelector('[data-srs-test]').dataset;
    assert.equal(ds.srsTest, h.first.id);
    assert.equal(ds.srsIndex, String(i));
    if (i === 1) click(h, 'next');
  }
  assert.equal(h.root.querySelector('#question-study-next'), null);
}, due);

check('SRS: revelar, avanzar y terminar sin valorar conservan todas las tarjetas', (h) => {
  const before = JSON.stringify(h.g.SMR.progress.data.tests.srs);
  start(h, '__srs');
  click(h, 'reveal');
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.srs), before);
  click(h, 'next');
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.srs), before);
  click(h, 'finish');
  assert.equal(JSON.stringify(h.g.SMR.progress.data.tests.srs), before);
  assert.equal(h.calls.length, 0);
}, due);

check('SRS: solo una valoración efectiva cambia la tarjeta mediante scheduleSrs', (h) => {
  const srs = h.g.SMR.progress.data.tests.srs;
  const before = JSON.parse(JSON.stringify(srs));
  start(h, '__srs');
  click(h, 'reveal');
  const old = rate(h, 2);
  old.disabled = false;
  old.click();
  assert.deepEqual(h.calls, [[h.first.id, 1, 2]]);
  const id1 = h.g.SMR.srs.idOf(h.first.id, 1);
  assert.equal(srs[id1].level, 2);
  assert.ok(srs[id1].due > h.g.Date.now());
  Object.keys(before).filter((key) => key !== id1).forEach((key) => assert.deepEqual(JSON.parse(JSON.stringify(srs[key])), before[key]));
}, due);

for (const kind of ['sin tarjetas', 'futuras', 'no resolubles']) check('SRS: vacío con ' + kind + ' no escribe progreso', (h) => {
  const before = JSON.stringify(h.g.SMR.progress.data);
  start(h, '__srs');
  assert.match(h.root.querySelector('#question-study-status').textContent, /No tienes repasos pendientes/);
  assert.equal(h.root.querySelector('#question-study-reveal'), null);
  assert.equal(JSON.stringify(h.g.SMR.progress.data), before);
}, (h) => {
  h.g.SMR.progress.data.tests.srs = kind === 'futuras' ? { [h.id]: { level: 2, due: h.g.Date.now() + 100000 } }
    : kind === 'no resolubles' ? { 'q-0000000000000000': { level: 1, due: 0 } } : {};
});

for (const [source, setup] of [['__errores', errors], ['__srs', due]]) {
  check(source + ': cola fija aunque cambie la fuente durante el estudio', (h) => {
    start(h, source);
    h.g.SMR.progress.wrongRefs = () => [];
    h.g.SMR.progress.dueSrs = () => [];
    click(h, 'reveal');
    click(h, 'next');
    assert.ok(h.root.innerHTML.includes('Pregunta 2 de 2'));
  }, setup);

  for (const change of ['logout', 'login', 'A→B', 'generación', 'progress', 'pendiente']) {
    check(source + ': ' + change + ' bloquea valoración y registro desde la cola antigua', (h) => {
      const s = owner(h);
      if (change === 'login') s.owner = null;
      start(h, source);
      click(h, 'reveal');
      if (change === 'logout') s.owner = null;
      if (change === 'login') s.owner = 'A';
      if (change === 'A→B') s.owner = 'B';
      if (change === 'generación') s.generation++;
      if (change === 'progress') h.g.SMR.progress.data = JSON.parse(JSON.stringify(h.g.SMR.progress.data));
      if (change === 'pendiente') s.pending = true;
      rate(h, 2);
      click(h, 'finish');
      assert.equal(h.calls.length, 0);
      assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
    }, setup);
  }

  check(source + ': visitante puede volver a Todas y Por categoría tras salir sin finalizar', (h) => {
    assert.equal(h.g.SMR.cloudSession, undefined);
    start(h, source);
    click(h, 'reveal');
    click(h, 'exit');
    assert.equal(h.g.SMR.progress.data.studySessions.length, 0);
    start(h);
    assert.ok(h.root.innerHTML.includes('Pregunta 1 de 154'));
    click(h, 'exit');
    start(h, 'Redes');
    assert.ok(h.root.innerHTML.includes('Pregunta 1 de 27'));
  }, setup);
}

console.log(`\n${passed} ok, ${failed} fallos`);
process.exitCode = failed ? 1 : 0;

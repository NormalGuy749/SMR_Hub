'use strict';

/* Prueba el borrado durante #/tests?mode=srs con advanceAfterSrsDrop real
   y una sesión simulada. Usa srs.js real, DOM/modal mínimos y progreso con
   espía; no ejecuta Supabase ni PostgreSQL. El borrado remoto se prueba
   en srs-delete (mock) y pg-srs-delete.sh (servidor local real). */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
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

/* ---------- DOM mínimo ---------- */

function makeEl(attrs) {
  const listeners = {};
  const el = {
    dataset: Object.assign({}, attrs),
    hidden: false, disabled: false, textContent: '',
    classList: { _active: false, toggle(c, v) { el.classList._active = !!v; }, add() {}, remove() { el.classList._active = false; } },
    addEventListener(type, fn, opts) { (listeners[type] = listeners[type] || []).push({ fn, once: !!(opts && opts.once), done: false }); },
    click() { (listeners.click || []).forEach((l) => { if (!l.done) { l.fn(); if (l.once) l.done = true; } }); },
    setAttribute(k, v) { el.dataset['_attr_' + k] = v; },
    getAttribute(k) { return el.dataset['_attr_' + k] === undefined ? null : el.dataset['_attr_' + k]; },
    closest(sel) { return sel === '[data-srs-test]' ? el._wrapper : null; }
  };
  return el;
}

/* Pantalla del repaso: un wrapper [data-srs-test] con su acción de quitar
   (como lo pinta renderQuestion en modo SRS). */
function makeScreen(testId, origIndex, opts) {
  const o = opts || {};
  const dropBtn = o.withDropBtn === false ? null : makeEl();
  const status = makeEl();
  const rates = o.withRates === false ? [] : [0, 1, 2].map((i) => makeEl({ srsRate: String(i) }));
  const wrapper = {
    dataset: { srsTest: testId, srsIndex: String(origIndex) },
    querySelector(sel) {
      if (sel === '[data-srs-drop]') return dropBtn;
      if (sel === '.srs-drop-status') return status;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-srs-rate]') return rates;
      if (sel === '[data-srs-drop]') return dropBtn ? [dropBtn] : [];
      return [];
    }
  };
  if (dropBtn) dropBtn._wrapper = wrapper;
  rates.forEach((b) => { b._wrapper = wrapper; });
  return { root: { querySelectorAll: (sel) => (sel === '[data-srs-drop]' && dropBtn ? [dropBtn] : []) }, wrapper, dropBtn, status, rates };
}

function makeBox() {
  const nodes = {};
  const box = {
    innerHTML: '',
    classList: { add() {} },
    setAttribute() {},
    querySelector(sel) {
      if (sel === '.modal-close') return nodes.close || (nodes.close = makeEl());
      if (sel === '[data-srs-cancel]') return nodes.cancel || (nodes.cancel = makeEl());
      if (sel === '[data-srs-confirm]') return nodes.confirm || (nodes.confirm = makeEl());
      return null;
    }
  };
  box._nodes = nodes;
  return box;
}

/* ---------- Harness ---------- */

function makeHarness(opts) {
  const o = opts || {};
  const srcSrs = fs.readFileSync('js/srs.js', 'utf8');
  const srcTests = fs.readFileSync('js/tests.js', 'utf8');
  const g = { console };
  g.window = g;
  g.SMR_DATA = {
    tests: [
      { id: 't-t1', title: 'Redes', questions: [{ q: 'A?', options: ['a1', 'a2'], correct: 0 }, { q: 'B?', options: ['b1', 'b2'], correct: 1 }] },
      { id: 't-t2', title: 'Sistemas', questions: [{ q: 'C?', options: ['c1', 'c2'], correct: 0 }] }
    ]
  };
  let cloudCalls = 0;
  const modalMock = (function () {
    const st = { opens: 0, closes: 0, box: null };
    return {
      get opens() { return st.opens; },
      get closes() { return st.closes; },
      get box() { return st.box; },
      open(build) { st.opens++; const box = makeBox(); st.box = box; build(box); },
      close() { st.closes++; }
    };
  })();
  g.SMR = {
    esc: (v) => String(v).replace(/[<>&"]/g, ''),
    progress: null,
    cloud: {
      from() { cloudCalls++; throw new Error('el repaso no debe usar Supabase'); },
      rpc() { cloudCalls++; throw new Error('el repaso no debe usar Supabase'); }
    },
    modal: modalMock
  };
  new Function('window', 'globalThis', srcSrs)(g, g, g);
  g.SMR.srs.buildIndex();

  const srsLocal = Object.assign({}, o.srsLocal);
  const saveThrows = !!o.saveThrows;
  const progressMock = {
    data: {
      resources: { viewed: {}, completed: {}, selfAssessment: {} },
      tests: { best: {}, last: {}, history: [], wrong: {}, srs: srsLocal, srsLegacy: {} },
      cases: { solved: {} }, studySessions: [], studyMinutes: 0, activity: [],
      streak: { lastDay: null, count: 0 }
    },
    dropCalls: [],
    dropSrs(testId, qIndex) {
      this.dropCalls.push({ testId, qIndex });
      const key = g.SMR.srs.idOf(testId, qIndex);
      if (key) delete this.data.tests.srs[key];
      delete this.data.tests.srs[`${testId}:${qIndex}`];
      if (saveThrows) throw new Error('almacenamiento lleno (simulado)');
      this._saved = true;
    }
  };
  g.SMR.progress = progressMock;

  const findTest = (id) => (g.SMR_DATA.tests || []).find((t) => t.id === id) || null;
  const snippets = extractFns(srcTests, [
    'const SRS_RATE_LABELS =',
    'function srsRateOf(',
    'function srsRateHtml(',
    'function srsDropHtml(',
    'function srsCardTitle(',
    'function srsDropConfirmHtml(',
    'function openSrsDropConfirm(',
    'function syncSrsDrop(',
    'function setSrsDropStatus(',
    'function wireSrsDrop(',
    'function advanceAfterSrsDrop('
  ]);

  /* `session` vive en el ámbito del wrapper (como en el módulo real): el
     avance la lee y la pone a null al terminar el repaso. */
  const prelude = [
    'let session = null;',
    "let srsNotice = '';",
    'const calls = [];',
    'function stop() { calls.push({ call: "stop" }); }',
    'function renderIndex(root, notice) { calls.push({ render: "renderIndex", notice: notice || "" }); }',
    'function renderResult(root) { calls.push({ render: "renderResult" }); }',
    'function renderQuestion(root) { calls.push({ render: "renderQuestion", index: session.index, total: session.questions.length }); }'
  ].join('\n');

  const api = new Function('window', 'SMR', 'esc', 'icon', 'progress', 'findTest',
    prelude + '\n' + snippets
    + '\n;return { setSession(s) { session = s; calls.length = 0; srsNotice = ""; }, session() { return session; }, notice() { return srsNotice; }, calls,'
    + ' srsDropHtml, srsRateOf, wireSrsDrop, advanceAfterSrsDrop };'
  )(g, g.SMR, g.SMR.esc, () => '', () => progressMock, findTest);

  const ID = (testId, idx) => g.SMR.srs.idOf(testId, idx);
  return { g, api, progressMock, srsLocal, ID, modal: modalMock, cloudCalls: () => cloudCalls, srcTests };
}

/* Sesión de repaso SRS como la construye buildSrsSession (questions con
   testId/origIndex/categoría, índice y respuestas). */
/* Wiring del repaso tal cual lo hace renderQuestion: el callback recibe
   (testId, origIndex) y el avance recibe la raíz del repaso. */
function srsDeletedHandler(h, root) {
  return (testId, origIndex, message) => h.api.advanceAfterSrsDrop(root, testId, origIndex, message);
}

function makeSrsSession(items) {
  return {
    testId: '__srs',
    title: 'Repasos programados',
    mode: 'srs',
    multi: true,
    index: 0,
    correct: 0,
    answers: [],
    questions: items.map((it) => ({ q: it.q, origIndex: it.origIndex, testId: it.testId, testTitle: it.title, category: 'General' })),
    cfg: { label: 'Repaso programado', questions: Infinity, timer: 0, shuffle: true, explain: true },
    intervalId: null
  };
}

const ITEMS = [
  { testId: 't-t1', origIndex: 0, title: 'Redes', q: { q: 'A?', options: ['a1', 'a2'], correct: 0, explain: '-' } },
  { testId: 't-t1', origIndex: 1, title: 'Redes', q: { q: 'B?', options: ['b1', 'b2'], correct: 1, explain: '-' } },
  { testId: 't-t2', origIndex: 0, title: 'Sistemas', q: { q: 'C?', options: ['c1', 'c2'], correct: 0, explain: '-' } }
];

/* ---------- Casos ---------- */

(async function main() {
  /* --- 1/2. la acción existe solo con tarjeta válida ------------------ */
  await (async () => {
    const h = makeHarness();
    const kA = h.ID('t-t1', 0);
    const kB = h.ID('t-t1', 1);
    const h2 = makeHarness({ srsLocal: { [kA]: { level: 2, due: 100 }, [kB]: { level: 1, due: 200 } } });
    const conTarjeta = h2.api.srsDropHtml('t-t1', 0);
    const HIDDEN = /<button[^>]*data-srs-drop[^>]*hidden/;
    assert(!HIDDEN.test(conTarjeta), 'con tarjeta válida la acción está disponible');
    assert(conTarjeta.includes('aria-label="Quitar esta pregunta del repaso espaciado"'), 'nombre accesible');
    assert(HIDDEN.test(h.api.srsDropHtml('t-t1', 0)), 'sin tarjeta la acción queda oculta');
    assert(h.api.srsDropHtml('t-t9', 0) === '', 'sin identidad estable no hay acción');
  })();
  record('A1/A2: la acción aparece en el repaso solo con tarjeta válida');

  /* --- 3. cancelar no borra ni avanza -------------------------------- */
  await (async () => {
    const h = makeHarness();
    const kA = h.ID('t-t1', 0);
    const h2 = makeHarness({ srsLocal: { [kA]: { level: 1, due: 100 } } });
    h2.api.setSession(makeSrsSession(ITEMS));
    const screen = makeScreen('t-t1', 0);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    assert(h2.modal.opens === 1, 'se abre la confirmación');
    assert(h2.modal.box.innerHTML.includes('A?'), 'la confirmación nombra la pregunta actual');
    h2.modal.box.querySelector('[data-srs-cancel]').click();
    assert(h2.modal.closes === 1, 'cancelar cierra el modal');
    assert(h2.progressMock.dropCalls.length === 0, 'cancelar no llama a dropSrs');
    assert(h2.api.calls.length === 0, 'cancelar no avanza el repaso');
    assert(h2.api.session().questions.length === 3, 'el repaso conserva sus 3 tarjetas');
    assert(h2.srsLocal[kA] !== undefined, 'la tarjeta sigue existiendo');
  })();
  record('A3: cancelar no borra ni avanza');

  /* --- 4/5/6. confirmar borra una vez, la tarjeta sale y el avance es el correcto --- */
  await (async () => {
    const h = makeHarness();
    const keys = { a: h.ID('t-t1', 0), b: h.ID('t-t1', 1), c: h.ID('t-t2', 0) };
    const h2 = makeHarness({
      srsLocal: { [keys.a]: { level: 1, due: 100 }, [keys.b]: { level: 3, due: 200 }, [keys.c]: { level: 2, due: 300 } }
    });
    h2.api.setSession(makeSrsSession(ITEMS));
    const screen = makeScreen('t-t1', 0);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    const confirm = h2.modal.box.querySelector('[data-srs-confirm]');
    confirm.click();
    assert(h2.progressMock.dropCalls.length === 1, 'un único borrado');
    assert(h2.progressMock.dropCalls[0].testId === 't-t1' && h2.progressMock.dropCalls[0].qIndex === 0, 'identificadores correctos: ' + JSON.stringify(h2.progressMock.dropCalls[0]));
    assert(h2.srsLocal[keys.a] === undefined, 'la tarjeta borrada sale del estado local');
    assert(confirm.disabled === true, 'confirmación deshabilitada tras usarla');
    assert(screen.dropBtn.hidden === true, 'la acción queda oculta para esa tarjeta');
    assert(h2.cloudCalls() === 0, 'cero llamadas a Supabase');
    const s = h2.api.session();
    assert(s.questions.length === 2, 'el repaso pasa a 2 tarjetas');
    assert(!s.questions.some((q) => q.testId === 't-t1' && q.origIndex === 0), 'la borrada no sigue en el repaso');
    assert(s.questions[0].testId === 't-t1' && s.questions[0].origIndex === 1, 'la siguiente es exactamente la que venía después (sin saltos)');
    assert(s.questions[1].testId === 't-t2' && s.questions[1].origIndex === 0, 'el orden del resto se conserva');
    assert(h2.api.calls.length === 1 && h2.api.calls[0].render === 'renderQuestion' && h2.api.calls[0].index === 0 && h2.api.calls[0].total === 2, 'se repinta la pregunta en el mismo índice: ' + JSON.stringify(h2.api.calls[0]));
    assert(h2.api.notice() === 'Quitada del repaso en este dispositivo.', 'el aviso del borrado viaja a la siguiente pantalla: ' + h2.api.notice());
    assert(!s.questions.some((q, i) => i > 0 && q.testId === s.questions[i - 1].testId && q.origIndex === s.questions[i - 1].origIndex), 'sin duplicados');
    assert(h2.srsLocal[keys.b].level === 3 && h2.srsLocal[keys.c].due === 300, 'las demás tarjetas conservan nivel y vencimiento');
  })();
  record('A4/A5/A6/A11: un borrado, la tarjeta sale y el avance no salta ni repite');

  /* --- 6b. borrar una tarjeta intermedia ----------------------------- */
  await (async () => {
    const h = makeHarness();
    const keys = { a: h.ID('t-t1', 0), b: h.ID('t-t1', 1), c: h.ID('t-t2', 0) };
    const h2 = makeHarness({ srsLocal: { [keys.a]: { level: 1, due: 1 }, [keys.b]: { level: 1, due: 2 }, [keys.c]: { level: 1, due: 3 } } });
    const session = makeSrsSession(ITEMS);
    session.index = 1;
    h2.api.setSession(session);
    const screen = makeScreen('t-t1', 1);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    h2.modal.box.querySelector('[data-srs-confirm]').click();
    const s = h2.api.session();
    assert(h2.progressMock.dropCalls[0].qIndex === 1, 'borra la intermedia');
    assert(s.questions.length === 2 && s.index === 1, 'el índice sigue en 1 con 2 preguntas');
    assert(s.questions[1].testId === 't-t2' && s.questions[1].origIndex === 0, 'la siguiente es la tercera original');
    assert(h2.api.calls.length === 1 && h2.api.calls[0].render === 'renderQuestion', 'repinta la siguiente');
  })();
  record('A6: borrar una tarjeta intermedia avanza a la siguiente sin saltos');

  /* --- 7. borrar la última (de varias) termina el repaso ------------- */
  await (async () => {
    const h = makeHarness();
    const keys = { a: h.ID('t-t1', 0), b: h.ID('t-t1', 1) };
    const h2 = makeHarness({ srsLocal: { [keys.a]: { level: 1, due: 1 }, [keys.b]: { level: 1, due: 2 } } });
    const session = makeSrsSession(ITEMS.slice(0, 2));
    session.index = 1;
    session.answers = [{ question: session.questions[0], chosen: 0, ok: true }];
    session.correct = 1;
    h2.api.setSession(session);
    const screen = makeScreen('t-t1', 1);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    h2.modal.box.querySelector('[data-srs-confirm]').click();
    assert(h2.api.calls.length === 1 && h2.api.calls[0].render === 'renderResult', 'la última tarjeta cierra el repaso en el resultado: ' + JSON.stringify(h2.api.calls[0]));
    assert(h2.api.session().questions.length === 1, 'queda la tarjeta ya revisada');
    assert(h2.api.notice() === '', 'no queda aviso pendiente al terminar el repaso');
  })();
  record('A7: borrar la última tarjeta deja un final coherente (resultado del repaso)');

  /* --- 7b. borrar la única tarjeta deja el estado vacío existente ---- */
  await (async () => {
    const h = makeHarness();
    const kA = h.ID('t-t1', 0);
    const h2 = makeHarness({ srsLocal: { [kA]: { level: 1, due: 1 } } });
    h2.api.setSession(makeSrsSession(ITEMS.slice(0, 1)));
    const screen = makeScreen('t-t1', 0);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    h2.modal.box.querySelector('[data-srs-confirm]').click();
    assert(h2.api.session() === null, 'la sesión se cierra');
    const last = h2.api.calls[h2.api.calls.length - 1];
    assert(last.render === 'renderIndex' && /No hay repasos vencidos hoy/.test(last.notice), 'estado vacío ya existente del repaso: ' + JSON.stringify(last));
    assert(h2.api.calls.some((c) => c.call === 'stop'), 'se detiene el temporizador/estado de la sesión');
  })();
  record('A7: borrar la única tarjeta deja el estado vacío del repaso');

  /* --- 7c. si ya había respondido esa pregunta, sale del repaso ------ */
  await (async () => {
    const h = makeHarness();
    const kA = h.ID('t-t1', 0);
    const kC = h.ID('t-t2', 0);
    const h2 = makeHarness({ srsLocal: { [kA]: { level: 1, due: 1 }, [kC]: { level: 1, due: 2 } } });
    const session = makeSrsSession([ITEMS[0], ITEMS[2]]);
    session.answers = [{ question: session.questions[0], chosen: 0, ok: true }];
    session.correct = 1;
    h2.api.setSession(session);
    const screen = makeScreen('t-t1', 0);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    h2.modal.box.querySelector('[data-srs-confirm]').click();
    const s = h2.api.session();
    assert(s.answers.length === 0 && s.correct === 0, 'la respuesta de la tarjeta que ya no está sale del repaso (totales cuadran)');
    assert(s.questions.length === 1, 'queda la tarjeta pendiente');
  })();
  record('A7/A11: al borrar una tarjeta ya respondida, su respuesta no descuadra el repaso');

  /* --- 8. identidad de las tarjetas restantes ------------------------ */
  await (async () => {
    const h = makeHarness();
    const keys = { a: h.ID('t-t1', 0), b: h.ID('t-t1', 1), c: h.ID('t-t2', 0) };
    const h2 = makeHarness({ srsLocal: { [keys.a]: { level: 1, due: 1 }, [keys.b]: { level: 1, due: 2 }, [keys.c]: { level: 1, due: 3 } } });
    h2.api.setSession(makeSrsSession(ITEMS));
    const screen = makeScreen('t-t1', 0);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    h2.modal.box.querySelector('[data-srs-confirm]').click();
    const s = h2.api.session();
    const laterKeys = s.questions.map((q) => h2.ID(q.testId, q.origIndex));
    assert(laterKeys.length === 2, 'quedan 2 tarjetas');
    assert(laterKeys.every((k) => h2.srsLocal[k] !== undefined), 'cada tarjeta del repaso sigue ligada a SU tarjeta');
    assert(laterKeys.every((k) => k !== keys.a), 'ninguna tarjeta apunta a la borrada');
  })();
  record('A8: las tarjetas restantes conservan su identidad (valoraciones futuras correctas)');

  /* --- 9. error: mensaje, sin avance falso --------------------------- */
  await (async () => {
    const h = makeHarness();
    const kA = h.ID('t-t1', 0);
    const h2 = makeHarness({ srsLocal: { [kA]: { level: 1, due: 1 } }, saveThrows: true });
    h2.api.setSession(makeSrsSession(ITEMS));
    const screen = makeScreen('t-t1', 0);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    h2.modal.box.querySelector('[data-srs-confirm]').click();
    assert(h2.progressMock.dropCalls.length === 1, 'se intentó una vez');
    assert(screen.status.textContent === 'No se pudo quitar del repaso. Inténtalo de nuevo.', 'mensaje de error: ' + screen.status.textContent);
    assert(h2.api.calls.length === 0, 'no avanza el repaso con un fallo');
    assert(h2.api.session().questions.length === 3, 'el repaso sigue intacto');
    assert(screen.dropBtn.disabled === false && screen.dropBtn.hidden === false, 'la acción queda reintentable');
  })();
  record('A9: el error no avanza el repaso ni simula éxito');

  /* --- 10. clics repetidos: un solo borrado y un solo avance --------- */
  await (async () => {
    const h = makeHarness();
    const kA = h.ID('t-t1', 0);
    const h2 = makeHarness({ srsLocal: { [kA]: { level: 1, due: 1 } } });
    h2.api.setSession(makeSrsSession(ITEMS));
    const screen = makeScreen('t-t1', 0);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    const confirm = h2.modal.box.querySelector('[data-srs-confirm]');
    confirm.click();
    confirm.click();
    assert(h2.progressMock.dropCalls.length === 1, 'un único dropSrs');
    assert(h2.api.calls.filter((c) => c.render).length === 1, 'un único avance');
  })();
  record('A10: los clics repetidos no duplican borrado ni avance');

  /* --- 12/13. visitante y guardas ------------------------------------- */
  await (async () => {
    const h = makeHarness();
    const kA = h.ID('t-t1', 0);
    const h2 = makeHarness({ srsLocal: { [kA]: { level: 1, due: 1 } } });
    h2.api.setSession(makeSrsSession(ITEMS));
    const screen = makeScreen('t-t1', 0);
    h2.api.wireSrsDrop(screen.root, srsDeletedHandler(h2, screen.root));
    screen.dropBtn.click();
    h2.modal.box.querySelector('[data-srs-confirm]').click();
    assert(h2.cloudCalls() === 0, 'el repaso no llama a Supabase');
    assert(screen.status.textContent === 'Quitada del repaso en este dispositivo.', 'mensaje de visitante: ' + screen.status.textContent);
    /* la UI no reimplementa el borrado ni maneja el propietario */
    assert(!/progressSyncSrsClears|deleted\s*:|deleted_at/.test(h.srcTests.slice(h.srcTests.indexOf('function srsDropHtml('), h.srcTests.indexOf('function wireSrsRating('))), 'la UI del borrado no toca tombstones');
    assert(!/user_id|uid\b/.test(h.srcTests.slice(h.srcTests.indexOf('function openSrsDropConfirm('), h.srcTests.indexOf('function wireSrsRating('))), 'la UI no maneja identidades de usuario');
  })();
  record('A12/A13: visitante sin Supabase y sin reimplementar el borrado');

  /* --- 14. integración real en el repaso y regresión de 8.5.9 ------- */
  await (async () => {
    const h = makeHarness();
    const src = h.srcTests;
    assert(src.includes("${s.mode === 'srs' ? `<div data-srs-test=\"${esc(c.testId)}\" data-srs-index=\"${c.origIndex}\">${srsDropHtml(c.testId, c.origIndex)}</div>` : ''}"), 'la acción se pinta en la pantalla de repaso');
    assert(/if \(s\.mode === 'srs'\) wireSrsDrop\(root, \(testId, origIndex, message\) => advanceAfterSrsDrop\(root, testId, origIndex, message\)\);/.test(src), 'el repaso cablea el borrado con el avance (raíz y mensaje)');
    assert(/\$\{notice \? `<p class="notice" role="status">\$\{esc\(notice\)\}<\/p>` : ''\}/.test(src), 'el aviso del borrado sobrevive al repintado (una sola vez)');
    assert(/srsNotice = message \|\| '';/.test(src), 'el aviso se pasa a la pantalla siguiente');
    assert(/wireSrsRating\(root\);\s*\n\s*wireSrsDrop\(root\);/.test(src), 'la lista de resultados de 8.5.9 sigue intacta');
    assert(src.includes("progress().dropSrs(testId, origIndex)"), 'sigue llamándose al dropSrs real');
    assert(!/duplicate-ok/.test(src) && src.indexOf('function advanceAfterSrsDrop(') > 0, 'el avance existe como función propia');
  })();
  record('A14: integración del repaso y UI de resultados de 8.5.9 sin regresión');

  if (process.env.SRS_REVIEW_SELFTEST === '1') {
    await (async () => {
      assert(1 === 2, 'auto-verificación: aserción forzada a fallar');
    })();
    record('auto-verificación (no debe llegar aquí)');
  }
})().catch((e) => { console.error('runner:', e && e.message); failed++; });

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log(`OK: ${passed}  FAIL: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
});

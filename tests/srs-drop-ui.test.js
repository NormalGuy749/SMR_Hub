'use strict';

/* Prueba los controles reales de borrado con DOM y modal simulados,
   srs.js real y un espía de progreso. No ejecuta Supabase ni PostgreSQL;
   el contrato cloud se cubre por separado en srs-delete y pg-srs-delete.sh. */

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

/* ---------- DOM mínimo ---------- */

/* Elemento disparable; emula { once: true } y classList/atributos. */
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

/* Fila del resultado: wrapper [data-srs-test] con rate, botón de quitar y
   estado. Cada botón conoce su wrapper (equivocarse de tarjeta = fallo). */
function makeRow(testId, origIndex, opts) {
  const o = opts || {};
  const rates = [0, 1, 2].map((i) => makeEl({ srsRate: String(i) }));
  const dropBtn = o.withDropBtn === false ? null : makeEl();
  const status = makeEl();
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
  return { wrapper, rates, dropBtn, status };
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
    tests: [{
      id: 't-t1',
      title: 'Redes',
      questions: [
        { q: 'A?', options: ['a1', 'a2'], correct: 0 },
        { q: 'B?', options: ['b1', 'b2'], correct: 1 },
        { q: 'C?', options: ['c1', 'c2'], correct: 0 }
      ]
    }]
  };
  let cloudCalls = 0;
  g.SMR = {
    esc: (v) => String(v).replace(/[<>&"]/g, ''),
    progress: null,
    /* Cualquier intento de hablar con Supabase desde la UI es un fallo. */
    cloud: {
      from() { cloudCalls++; throw new Error('la UI no debe usar Supabase'); },
      rpc() { cloudCalls++; throw new Error('la UI no debe usar Supabase'); }
    },
    /* SMR.modal simulado. Los contadores viven en un cierre, no en `this`:
       el modal real recibe close() como referencia suelta de listener. */
    modal: (function () {
      const st = { opens: 0, closes: 0, box: null };
      return {
        get opens() { return st.opens; },
        get closes() { return st.closes; },
        get box() { return st.box; },
        open(build) { st.opens++; const box = makeBox(); st.box = box; build(box); },
        close() { st.closes++; }
      };
    })()
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
    scheduleSrsCalls: [], dropCalls: [],
    /* Semántica real de js/app.js: delete de la clave estable + save(). */
    dropSrs(testId, qIndex) {
      this.dropCalls.push({ testId, qIndex });
      const key = g.SMR.srs.idOf(testId, qIndex);
      if (key) delete this.data.tests.srs[key];
      delete this.data.tests.srs[`${testId}:${qIndex}`];
      if (saveThrows) throw new Error('almacenamiento lleno (simulado)');
      this._saved = true;
    },
    scheduleSrs(testId, qIndex, rate) {
      this.scheduleSrsCalls.push({ testId, qIndex, rate });
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
    'function wireSrsDrop('
  ]);
  const fn = new Function('window', 'SMR', 'esc', 'icon', 'progress', 'findTest',
    snippets + '\n;return { srsRateOf, srsRateHtml, srsDropHtml, srsCardTitle, srsDropConfirmHtml, openSrsDropConfirm, syncSrsDrop, wireSrsDrop };'
  )(g, g.SMR, g.SMR.esc, () => '', () => progressMock, findTest);

  const ID = (idx) => g.SMR.srs.idOf('t-t1', idx);
  return { g, fn, progressMock, srsLocal, ID, cloudCalls: () => cloudCalls, srcTests, snippets };
}


(async function main() {
  /* --- 1. la acción aparece solo para tarjetas existentes ------------ */
  await (async () => {
    const h = makeHarness();
    const HIDDEN_DROP = /<button[^>]*data-srs-drop[^>]*hidden/;
    const sinTarjeta = h.fn.srsDropHtml('t-t1', 0);
    assert(sinTarjeta.includes('data-srs-drop'), 'la fila de quitar existe');
    assert(HIDDEN_DROP.test(sinTarjeta), 'sin tarjeta: acción oculta (nada que quitar)');
    assert(sinTarjeta.includes('aria-label="Quitar esta pregunta del repaso espaciado"'), 'nombre accesible en el botón');
    assert(sinTarjeta.includes('role="status"'), 'región de estado anunciada');

    const key = h.ID(1);
    const h2 = makeHarness({ srsLocal: { [key]: { level: 2, due: 999 } } });
    const conTarjeta = h2.fn.srsDropHtml('t-t1', 1);
    assert(!HIDDEN_DROP.test(conTarjeta), 'con tarjeta: acción visible');
    assert(conTarjeta.includes('btn-danger'), 'acción coherente con el design system');

    assert(h.fn.srsDropHtml('t-t1', 99) === '', 'sin identidad estable no hay fila de borrado');
  })();
  record('R1: acción con nombre accesible solo para tarjetas SRS existentes');

  /* --- 2. el wiring no actúa sin clic -------------------------------- */
  await (async () => {
    const h = makeHarness();
    const key = h.ID(0);
    const h2 = makeHarness({ srsLocal: { [key]: { level: 1, due: 999 } } });
    const row = makeRow('t-t1', 0);
    h2.fn.wireSrsDrop(row.wrapper);
    assert(h2.g.SMR.modal.opens === 0, 'sin clic no se abre la confirmación');
    assert(h2.progressMock.dropCalls.length === 0, 'sin clic no se borra nada');
    assert(row.dropBtn.disabled === false && row.dropBtn.hidden === false, 'estado inicial intacto');
  })();
  record('R2: sin interacción la UI no abre nada ni borra');

  /* --- 3. cancelar no toca la tarjeta -------------------------------- */
  await (async () => {
    const h = makeHarness();
    const k = h.ID(0);
    const h2 = makeHarness({ srsLocal: { [k]: { level: 1, due: 999 } } });
    const row = makeRow('t-t1', 0);
    h2.fn.wireSrsDrop(row.wrapper);
    row.dropBtn.click();
    assert(h2.g.SMR.modal.opens === 1, 'se abre una confirmación');
    assert(h2.g.SMR.modal.box.innerHTML.includes('data-srs-cancel'), 'hay Cancelar');
    assert(h2.g.SMR.modal.box.innerHTML.includes('data-srs-confirm'), 'hay confirmar');
    assert(h2.g.SMR.modal.box.innerHTML.includes('modal-title'), 'título accesible en el modal');
    assert(h2.g.SMR.modal.box.innerHTML.includes('A?'), 'la confirmación nombra la pregunta real');
    h2.g.SMR.modal.box.querySelector('[data-srs-cancel]').click();
    assert(h2.g.SMR.modal.closes === 1, 'cancelar cierra el modal');
    assert(h2.progressMock.dropCalls.length === 0, 'cancelar no llama a dropSrs');
    assert(h2.srsLocal[k] !== undefined, 'la tarjeta sigue existiendo');
    assert(row.status.textContent === '', 'cancelar no deja mensaje');
  })();
  record('R3: cancelar cierra la confirmación sin alterar la tarjeta');

  /* --- 4. confirmar borra la tarjeta correcta y refresca la vista ----- */
  await (async () => {
    const h = makeHarness();
    const k = h.ID(0);
    const h2 = makeHarness({ srsLocal: { [k]: { level: 3, due: 999 } } });
    const row = makeRow('t-t1', 0);
    h2.fn.wireSrsDrop(row.wrapper);
    row.dropBtn.click();
    const confirm = h2.g.SMR.modal.box.querySelector('[data-srs-confirm]');
    confirm.click();
    assert(h2.progressMock.dropCalls.length === 1, 'exactamente un borrado');
    assert(h2.progressMock.dropCalls[0].testId === 't-t1' && h2.progressMock.dropCalls[0].qIndex === 0, 'borra la tarjeta pedida');
    assert(h2.srsLocal[k] === undefined, 'la tarjeta sale del estado local');
    assert(confirm.disabled === true, 'confirmación deshabilitada tras usarla');
    assert(row.dropBtn.hidden === true, 'la acción desaparece (ya no hay tarjeta)');
    assert(row.rates.every((b) => b.classList._active === false), 'el rate vuelve a "sin valorar"');
    assert(row.status.textContent === 'Quitada del repaso en este dispositivo.', 'mensaje local honesto (visitante), no promete nube: ' + row.status.textContent);
    assert(h2.cloudCalls() === 0, 'cero llamadas a Supabase');
  })();
  record('R4/R6/R7: confirmar borra, refresca la vista, mensaje local y 0 llamadas a Supabase');

  /* --- 5. no daña otras tarjetas ------------------------------------- */
  await (async () => {
    const h0 = makeHarness();
    const kA = h0.ID(0);
    const kB = h0.ID(1);
    const h = makeHarness({ srsLocal: { [kA]: { level: 2, due: 100 }, [kB]: { level: 4, due: 500 } } });
    const row = makeRow('t-t1', 0);
    h.fn.wireSrsDrop(row.wrapper);
    row.dropBtn.click();
    h.g.SMR.modal.box.querySelector('[data-srs-confirm]').click();
    assert(h.srsLocal[kA] === undefined, 'la tarjeta pedida se borra');
    assert(h.srsLocal[kB] && h.srsLocal[kB].level === 4 && h.srsLocal[kB].due === 500, 'la otra tarjeta queda intacta');
    /* dos filas: cada botón actúa sobre SU tarjeta */
    const rowB = makeRow('t-t1', 1);
    h.fn.wireSrsDrop(rowB.wrapper);
    rowB.dropBtn.click();
    h.g.SMR.modal.box.querySelector('[data-srs-confirm]').click();
    assert(h.progressMock.dropCalls.length === 2, 'dos confirmaciones, dos borrados');
    assert(h.progressMock.dropCalls[1].qIndex === 1, 'segundo borrado sobre la fila correcta');
    assert(h.srsLocal[kB] === undefined, 'ahora sí se borra la segunda');
  })();
  record('R5: el borrado afecta solo a su tarjeta (y a ninguna otra)');

  /* --- 6. una actualización ordinaria no la resucita ------------------ */
  await (async () => {
    const h0 = makeHarness();
    const k = h0.ID(2);
    const h = makeHarness({ srsLocal: { [k]: { level: 1, due: 999 } } });
    const row = makeRow('t-t1', 2);
    h.fn.wireSrsDrop(row.wrapper);
    row.dropBtn.click();
    h.g.SMR.modal.box.querySelector('[data-srs-confirm]').click();
    /* refresco ordinario: se vuelve a pintar la fila como en renderResult */
    const again = h.fn.srsDropHtml('t-t1', 2);
    assert(/data-srs-drop[^>]*hidden|hidden[^>]*data-srs-drop/.test(again), 'en el refresco la acción sigue oculta');
    assert(h.srsLocal[k] === undefined, 'la tarjeta no vuelve con el refresco');
    /* y el rate sigue disponible para revivir explícitamente */
    assert(h.fn.srsRateHtml('t-t1', 2).includes('data-srs-rate="2"'), 'el rate sigue disponible');
  })();
  record('R6: la tarjeta borrada no reaparece en un refresco de la vista');

  /* --- 7. doble confirmación: un solo borrado ------------------------ */
  await (async () => {
    const h0 = makeHarness();
    const k = h0.ID(0);
    const h = makeHarness({ srsLocal: { [k]: { level: 1, due: 999 } } });
    const row = makeRow('t-t1', 0);
    h.fn.wireSrsDrop(row.wrapper);
    row.dropBtn.click();
    const confirm = h.g.SMR.modal.box.querySelector('[data-srs-confirm]');
    confirm.click();
    confirm.click();
    confirm.click();
    assert(h.progressMock.dropCalls.length === 1, 'tres clics al confirmar → un único borrado');
  })();
  record('R7: se evitan envíos duplicados al confirmar repetidamente');

  /* --- 8. error: sin éxito falso y acción reintentable --------------- */
  await (async () => {
    const h0 = makeHarness();
    const k = h0.ID(0);
    const h = makeHarness({ srsLocal: { [k]: { level: 1, due: 999 } }, saveThrows: true });
    const row = makeRow('t-t1', 0);
    h.fn.wireSrsDrop(row.wrapper);
    row.dropBtn.click();
    h.g.SMR.modal.box.querySelector('[data-srs-confirm]').click();
    assert(h.progressMock.dropCalls.length === 1, 'se intentó una vez');
    assert(row.status.textContent === 'No se pudo quitar del repaso. Inténtalo de nuevo.', 'mensaje de error real: ' + row.status.textContent);
    assert(!/sincronizará/i.test(row.status.textContent), 'no simula éxito remoto');
    assert(row.dropBtn.disabled === false, 'la acción queda reintentable');
    assert(row.dropBtn.hidden === false, 'la acción no desaparece si falló');
    assert(h.cloudCalls() === 0, 'el error no provoca llamadas a Supabase');
  })();
  record('R8: el fallo no simula éxito y deja la interfaz utilizable');

  /* --- 9. el rate sigue funcionando y revive la tarjeta -------------- */
  await (async () => {
    const h0 = makeHarness();
    const k = h0.ID(0);
    const h = makeHarness({ srsLocal: { [k]: { level: 1, due: 999 } } });
    const row = makeRow('t-t1', 0);
    h.fn.wireSrsDrop(row.wrapper);
    row.dropBtn.click();
    h.g.SMR.modal.box.querySelector('[data-srs-confirm]').click();
    assert(row.dropBtn.hidden === true, 'sin tarjeta la acción está oculta');
    /* re-valorar (revive): vuelve la tarjeta y con ella la acción */
    h.progressMock.scheduleSrs('t-t1', 0, 2);
    h.fn.syncSrsDrop(row.wrapper, 't-t1', 0);
    assert(h.srsLocal[k] && h.srsLocal[k].level === 1, 'la tarjeta revive con la valoración');
    assert(row.dropBtn.hidden === false, 'la acción vuelve a estar disponible');
    assert(row.status.textContent === '', 'el mensaje anterior se limpia');
  })();
  record('R9: valorar sigue funcionando y reactiva la acción de quitar (revive)');

  /* --- 10. la UI no reimplementa tombstones ni toca el propietario --- */
  await (async () => {
    const h = makeHarness();
    assert(!/progressSyncSrsClears/.test(h.snippets), 'la UI no toca la marca de sincronización');
    assert(!/deleted\s*:/.test(h.snippets) && !/\bdeleted_at\b/.test(h.snippets), 'la UI no manipula tombstones');
    assert(!/user_id|uid\b/i.test(h.snippets), 'la UI no maneja identidades de usuario');
    /* integración real en el render del resultado */
    const src = fs.readFileSync('js/tests.js', 'utf8');
    assert(src.includes('${srsRateHtml(srsTest, c.origIndex)}${srsDropHtml(srsTest, c.origIndex)}'), 'la fila de quitar se pinta junto al rate en la revisión');
    assert(/wireSrsRating\(root\);\s*\n\s*wireSrsDrop\(root\);/.test(src), 'el wiring del borrado se ejecuta en el resultado');
    assert(src.includes("progress().dropSrs(testId, origIndex)"), 'la UI llama al dropSrs real (sin lógica duplicada)');
  })();
  record('R10: la UI solo confirma y llama al contrato existente (sin tombstones ni propietario)');

  if (process.env.SRS_DROP_SELFTEST === '1') {
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

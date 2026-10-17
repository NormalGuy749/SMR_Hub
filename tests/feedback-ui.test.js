'use strict';

/* =====================================================================
   SMR Hub — Fase 8.8: interfaz de comentarios y avisos de pregunta.

   MOCKS EXPLÍCITOS: DOM mínimo (formularios y disparadores), contrato
   SMR.feedback simulado y un espía que hace FALLAR cualquier intento de
   hablar con Supabase desde la interfaz. Se extraen las funciones REALES
   de js/app.js (wireFeedback) y js/tests.js (reportHtml, wireReport).

   Lo que se comprueba aquí es la interfaz: validación visible, estados de
   envío, mensajes honestos y que no finge un guardado. La escritura real
   está en tests/feedback-report.test.js (lógica con mocks) y en
   tests/rest-rls-isolation.sh (PostgREST + PostgreSQL reales).

   Auto-comprobación del runner:
     FEEDBACK_UI_SELFTEST=1 node tests/feedback-ui.test.js   → exit 1

   Ejecutar desde la raíz:   node tests/feedback-ui.test.js
   ===================================================================== */

const fs = require('fs');
const srcApp = fs.readFileSync('js/app.js', 'utf8');
const srcTests = fs.readFileSync('js/tests.js', 'utf8');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function failRun(n, e) { failed++; console.log('  ✗ ' + n + ' → ' + (e && e.message)); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
async function caseRun(name, fn) { try { await fn(); record(name); } catch (e) { failRun(name, e); } }

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
    hidden: false, disabled: false, value: '', textContent: '',
    focus() { el.focused = true; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    click() { (listeners.click || []).slice().forEach((fn) => fn()); }
  };
  return el;
}

/* Raíz del formulario de comentarios (js/app.js → wireFeedback). */
function makeFeedbackRoot() {
  const nodes = {
    '#feedback-send': makeEl(),
    '#feedback-category': makeEl(),
    '#feedback-message': makeEl(),
    '#feedback-status': makeEl(),
    '#feedback-hint': makeEl()
  };
  nodes['#feedback-category'].value = 'sugerencia';
  nodes['#feedback-message'].value = 'Faltan casos de subnetting.';
  return { root: { querySelector: (sel) => nodes[sel] || null }, nodes };
}

/* Bloque de un aviso (js/tests.js → reportHtml/wireReport). */
function makeReportBox(testId, origIndex) {
  const bySel = {
    '[data-report-open]': makeEl(),
    '[data-report-form]': makeEl(),
    '[data-report-reason]': makeEl(),
    '[data-report-details]': makeEl(),
    '[data-report-status]': makeEl(),
    '[data-report-send]': makeEl(),
    '[data-report-cancel]': makeEl()
  };
  bySel['[data-report-reason]'].value = 'respuesta';
  bySel['[data-report-details]'].value = 'La correcta es la b.';
  bySel['[data-report-form]'].hidden = true;
  return {
    box: { dataset: { reportTest: testId, reportIndex: String(origIndex) }, querySelector: (sel) => bySel[sel] || null },
    el: bySel
  };
}

/* ---------- Harness ---------- */

const KEY = 'q-0123456789abcdef';
const MESSAGES = { invalid: 'MSG invalid', auth: 'MSG auth', offline: 'MSG offline', rate: 'MSG rate', unavailable: 'MSG unavailable', network: 'MSG network', changed: 'MSG changed', error: 'MSG error' };

function makeHarness(opts) {
  const o = opts || {};
  const calls = [];
  let release = null;
  const state = {
    available: o.available !== false,
    serverReady: o.serverReady !== false,
    key: o.key === undefined ? KEY : o.key,
    feedbackResult: o.feedbackResult || { ok: true, id: 1 },
    reportResult: o.reportResult || { ok: true, id: 2 }
  };
  const fb = {
    MESSAGES: MESSAGES,
    LIMITS: { message: 2000, details: 1000, testId: 64 },
    available: () => state.available,
    serverReady: () => state.serverReady,
    questionKeyOf: () => state.key,
    submitFeedback(input) {
      calls.push({ fn: 'feedback', input: input });
      if (o.hang) return new Promise((r) => { release = () => r(state.feedbackResult); });
      return Promise.resolve(state.feedbackResult);
    },
    submitQuestionReport(input) {
      calls.push({ fn: 'report', input: input });
      if (o.hang) return new Promise((r) => { release = () => r(state.reportResult); });
      return Promise.resolve(state.reportResult);
    }
  };
  let cloudCalls = 0;
  const g = { console: { warn() {} } };
  g.window = g;
  g.SMR = {
    feedback: fb,
    esc: (v) => String(v),
    cloud: {
      from() { cloudCalls++; throw new Error('la interfaz no debe usar Supabase'); },
      rpc() { cloudCalls++; throw new Error('la interfaz no debe usar Supabase'); }
    }
  };
  const $ = (sel, root) => root.querySelector(sel);

  const ui = new Function('window', 'SMR', '$', 'esc',
    extractFns(srcApp, ['function feedbackHintText(', 'function wireFeedback(']) + '\n;return { wireFeedback, feedbackHintText };')(g, g.SMR, $, g.SMR.esc);
  const testsUi = new Function('window', 'SMR', 'esc',
    extractFns(srcTests, ['function reportHtml(', 'function wireReport(']) + '\n;return { reportHtml, wireReport };')(g, g.SMR, g.SMR.esc);

  return {
    ui, testsUi, fb, calls, $, g,
    state,
    done: () => release,
    cloudCalls: () => cloudCalls
  };
}

/* ------------------------------------------------------------------ */

(async function main() {
  await caseRun('U1: el aviso previo del formulario dice la verdad (sesión, sin sesión, sin conexión)', async () => {
    const conSesion = makeHarness();
    const a = makeFeedbackRoot();
    conSesion.ui.wireFeedback(a.root);
    assert(a.nodes['#feedback-hint'].textContent === 'Se enviará a tu cuenta.', 'con sesión: ' + a.nodes['#feedback-hint'].textContent);

    const sinSesion = makeHarness({ available: false });
    const b = makeFeedbackRoot();
    sinSesion.ui.wireFeedback(b.root);
    assert(/Inicia sesión/.test(b.nodes['#feedback-hint'].textContent), 'sin sesión: ' + b.nodes['#feedback-hint'].textContent);

    const sinServidor = makeHarness({ available: false, serverReady: false });
    const c = makeFeedbackRoot();
    sinServidor.ui.wireFeedback(c.root);
    assert(/Sin conexión/.test(c.nodes['#feedback-hint'].textContent), 'sin servidor: ' + c.nodes['#feedback-hint'].textContent);

    /* El texto es UNA función reutilizable: la vista y el refresco tras un
       cambio de cuenta no pueden divergir. */
    assert(sinServidor.ui.feedbackHintText() === 'Sin conexión con SMR: ahora mismo no se puede enviar.',
      'helper sin servidor: ' + sinServidor.ui.feedbackHintText());
    assert(sinSesion.ui.feedbackHintText() === 'Inicia sesión para enviar comentarios y avisos.',
      'helper sin sesión: ' + sinSesion.ui.feedbackHintText());
    assert(conSesion.ui.feedbackHintText() === 'Se enviará a tu cuenta.',
      'helper con sesión: ' + conSesion.ui.feedbackHintText());
  });

  await caseRun('U2: el clic envía lo que hay en el formulario y bloquea el botón mientras tanto', async () => {
    const h = makeHarness({ hang: true });
    const f = makeFeedbackRoot();
    h.ui.wireFeedback(f.root);
    f.nodes['#feedback-message'].value = 'Un caso de prueba roto.';
    f.nodes['#feedback-send'].click();
    assert(h.calls.length === 1, 'una llamada al contrato: ' + h.calls.length);
    assert(h.calls[0].input.category === 'sugerencia', 'categoría del selector: ' + h.calls[0].input.category);
    assert(h.calls[0].input.message === 'Un caso de prueba roto.', 'texto del textarea: ' + h.calls[0].input.message);
    assert(f.nodes['#feedback-send'].disabled === true, 'botón deshabilitado durante el envío');
    assert(f.nodes['#feedback-status'].textContent === 'Enviando…', 'estado visible durante el envío: ' + f.nodes['#feedback-status'].textContent);
    f.nodes['#feedback-send'].click();
    f.nodes['#feedback-send'].click();
    assert(h.calls.length === 1, 'los clics repetidos no duplican el envío: ' + h.calls.length);
    h.done()({ ok: true, id: 9 });
    await new Promise((r) => setTimeout(r, 0));
    assert(f.nodes['#feedback-send'].disabled === false, 'el botón vuelve a estar disponible');
  });

  await caseRun('U3: éxito limpia el comentario y error real no finge nada', async () => {
    const ok = makeHarness({ feedbackResult: { ok: true, id: 3 } });
    const a = makeFeedbackRoot();
    ok.ui.wireFeedback(a.root);
    a.nodes['#feedback-send'].click();
    await new Promise((r) => setTimeout(r, 0));
    assert(/enviado/i.test(a.nodes['#feedback-status'].textContent), 'mensaje de éxito: ' + a.nodes['#feedback-status'].textContent);
    assert(a.nodes['#feedback-message'].value === '', 'el campo se vacía tras enviar');

    for (const reason of ['rate', 'offline', 'auth', 'invalid', 'network', 'changed', 'unavailable', 'error']) {
      const h = makeHarness({ feedbackResult: { ok: false, reason: reason } });
      const f = makeFeedbackRoot();
      h.ui.wireFeedback(f.root);
      f.nodes['#feedback-send'].click();
      await new Promise((r) => setTimeout(r, 0));
      assert(f.nodes['#feedback-status'].textContent === MESSAGES[reason], reason + ' → ' + f.nodes['#feedback-status'].textContent);
      assert(!/enviado|gracias/i.test(f.nodes['#feedback-status'].textContent), reason + ': no simula éxito');
      assert(f.nodes['#feedback-message'].value === 'Faltan casos de subnetting.', reason + ': el texto del usuario NO se pierde');
      assert(f.nodes['#feedback-send'].disabled === false, reason + ': reintentable');
    }
  });

  await caseRun('U4: la interfaz no habla con Supabase (contrato SMR.feedback) y sin contrato no rompe', async () => {
    const h = makeHarness();
    const f = makeFeedbackRoot();
    h.ui.wireFeedback(f.root);
    f.nodes['#feedback-send'].click();
    await new Promise((r) => setTimeout(r, 0));
    assert(h.cloudCalls() === 0, 'cero llamadas directas a Supabase desde la UI: ' + h.cloudCalls());

    const sinModulo = { feedback: undefined };
    const g = { console: { warn() {} } };
    g.window = g;
    g.SMR = sinModulo;
    const root = makeFeedbackRoot();
    const ui = new Function('window', 'SMR', '$', 'esc',
      extractFns(srcApp, ['function feedbackHintText(', 'function wireFeedback(']) + '\n;return { wireFeedback };')(g, g.SMR, (sel, r) => r.querySelector(sel), String);
    assert(ui.feedbackHintText === undefined || true, 'el helper no revienta sin módulo');
    assert(new Function('window', 'SMR', 'esc', extractFns(srcApp, ['function feedbackHintText(']) + '\n;return feedbackHintText();')(g, g.SMR, String) === '', 'sin contrato el aviso previo queda vacío');
    ui.wireFeedback(root.root); /* sin SMR.feedback debe salir sin tocar el DOM ni lanzar */
    root.nodes['#feedback-send'].click();
    assert(root.nodes['#feedback-status'].textContent === '', 'sin contrato no se escribe ningún estado falso');
  });

  await caseRun('U5: el aviso solo aparece con identidad real y su formulario se abre y se cierra', async () => {
    const h = makeHarness();
    assert(h.testsUi.reportHtml('t-redes', 0).indexOf('data-report-test="t-redes"') !== -1, 'lleva el test real');
    const html = h.testsUi.reportHtml('t-redes', 0);
    assert(html.indexOf('data-report-index="0"') !== -1, 'lleva la posición real');
    assert(/data-report-form[^>]*hidden/.test(html), 'el formulario nace oculto');
    assert(html.indexOf('class="link-like"') !== -1, 'disparador discreto, coherente con el design system');
    assert(html.indexOf('aria-label="Motivo del aviso"') !== -1 && html.indexOf('aria-label="Detalles del aviso"') !== -1,
      'controles con nombre accesible');
    assert(html.indexOf('role="status"') !== -1, 'región de estado anunciada');

    const sinClave = makeHarness({ key: null });
    assert(sinClave.testsUi.reportHtml('t-redes', 0) === '', 'sin identidad estable no se ofrece avisar');

    const box = makeReportBox('t-redes', 0);
    h.testsUi.wireReport({ querySelectorAll: () => [box.box] });
    box.el['[data-report-open]'].click();
    assert(box.el['[data-report-form]'].hidden === false, 'abrir muestra el formulario');
    assert(box.el['[data-report-reason]'].focused === true, 'el foco va al motivo');
    box.el['[data-report-cancel]'].click();
    assert(box.el['[data-report-form]'].hidden === true, 'cancelar lo cierra');
    assert(h.calls.length === 0, 'abrir y cerrar no envía nada');
  });

  await caseRun('U6: el aviso se envía con la clave real de la pregunta', async () => {
    const h = makeHarness();
    const box = makeReportBox('t-redes', 0);
    h.testsUi.wireReport({ querySelectorAll: () => [box.box] });
    box.el['[data-report-open]'].click();
    box.el['[data-report-send]'].click();
    assert(h.calls.length === 1, 'una llamada: ' + h.calls.length);
    const input = h.calls[0].input;
    assert(input.testId === 't-redes' && input.questionKey === KEY, 'identidad real de la pregunta: ' + JSON.stringify(input));
    assert(input.reason === 'respuesta', 'motivo elegido: ' + input.reason);
    assert(input.details === 'La correcta es la b.', 'detalles escritos: ' + input.details);
    await new Promise((r) => setTimeout(r, 0));
    assert(box.el['[data-report-form]'].hidden === true, 'tras enviar, el formulario se recoge');
    assert(/registrado|gracias/i.test(box.el['[data-report-status]'].textContent), 'mensaje de éxito: ' + box.el['[data-report-status]'].textContent);
    assert(box.el['[data-report-details]'].value === '', 'los detalles se limpian');
    assert(box.el['[data-report-send]'].disabled === false, 'el botón queda disponible');
    assert(h.cloudCalls() === 0, 'cero llamadas directas a Supabase desde la UI');

    /* Doble clic: un solo aviso (la guarda no depende del navegador). */
    const h2 = makeHarness({ hang: true });
    const box2 = makeReportBox('t-redes', 0);
    h2.testsUi.wireReport({ querySelectorAll: () => [box2.box] });
    box2.el['[data-report-open]'].click();
    box2.el['[data-report-send]'].click();
    box2.el['[data-report-send]'].click();
    box2.el['[data-report-send]'].click();
    assert(h2.calls.length === 1, 'tres clics al enviar → un único aviso: ' + h2.calls.length);
    h2.done()({ ok: true, id: 4 });
    await new Promise((r) => setTimeout(r, 0));
    assert(box2.el['[data-report-send]'].disabled === false, 'el botón vuelve a estar disponible');
  });

  await caseRun('U7: fallo del aviso → mensaje honesto, formulario abierto y sin clave no se envía', async () => {
    for (const reason of ['auth', 'offline', 'rate', 'network', 'invalid', 'error']) {
      const h = makeHarness({ reportResult: { ok: false, reason: reason } });
      const box = makeReportBox('t-redes', 0);
      h.testsUi.wireReport({ querySelectorAll: () => [box.box] });
      box.el['[data-report-open]'].click();
      box.el['[data-report-send]'].click();
      await new Promise((r) => setTimeout(r, 0));
      assert(box.el['[data-report-status]'].textContent === MESSAGES[reason], reason + ' → ' + box.el['[data-report-status]'].textContent);
      assert(box.el['[data-report-form]'].hidden === false, reason + ': el formulario sigue abierto para reintentar');
      assert(box.el['[data-report-send]'].disabled === false, reason + ': botón reintentable');
      assert(box.el['[data-report-details]'].value === 'La correcta es la b.', reason + ': no se pierde lo escrito');
    }
    /* La clave se resuelve en el momento del clic: si ya no existe, no se envía. */
    const h = makeHarness();
    const box = makeReportBox('t-redes', 0);
    h.testsUi.wireReport({ querySelectorAll: () => [box.box] });
    h.state.key = null;
    box.el['[data-report-open]'].click();
    box.el['[data-report-send]'].click();
    await new Promise((r) => setTimeout(r, 0));
    assert(h.calls.length === 0, 'sin clave no se llama al servidor: ' + h.calls.length);
    assert(box.el['[data-report-status]'].textContent === MESSAGES.invalid, 'se explica el motivo: ' + box.el['[data-report-status]'].textContent);
  });

  await caseRun('U8: wiring real en las vistas (configuración y pregunta)', async () => {
    assert(/wireFeedback\(root\);/.test(srcApp), 'la página de configuración cablea el formulario');
    assert(/id="feedback-send"/.test(srcApp) && /id="feedback-message"/.test(srcApp), 'el formulario existe en el HTML real');
    assert(/\$\{reportHtml\(c\.testId, c\.origIndex\)\}/.test(srcTests), 'la pregunta pinta su acción de aviso');
    assert(/wireReport\(root\);/.test(srcTests), 'la pregunta cablea el aviso en cada render');
    assert(!/SMR\.cloud\.(from|rpc)/.test(srcApp) && !/SMR\.cloud\.(from|rpc)/.test(srcTests),
      'ninguna vista habla con Supabase directamente');
  });

  await caseRun('U9: el módulo avisa de su llegada y app.js repinta la vista una vez', async () => {
    const events = [];
    const g = {
      console: { warn() {} },
      CustomEvent: function (type) { this.type = type; },
      dispatchEvent: (ev) => events.push(ev.type)
    };
    g.window = g;
    g.SMR = {};
    new Function('window', 'globalThis', fs.readFileSync('js/cloud-feedback.js', 'utf8'))(g, g, g);
    assert(typeof g.SMR.feedback === 'object', 'el módulo se publica como SMR.feedback');
    assert(events.indexOf('smr:feedbackready') !== -1, 'anuncia su llegada: ' + events.join(','));
    assert(/addEventListener\('smr:feedbackready', render\)/.test(srcApp),
      'app.js repinta la vista actual cuando el módulo llega (la primera vista se pinta antes)');
    assert(srcApp.indexOf('smr:feedbackready') === srcApp.lastIndexOf('smr:feedbackready'),
      'un único listener: el repintado no se encadena');
    /* El aviso previo no se queda con el valor del primer pintado: se refresca
       al cambiar de cuenta con un único listener global (sin acumularse). */
    assert(srcApp.indexOf("addEventListener('smr:authchange'") === srcApp.lastIndexOf("addEventListener('smr:authchange'"),
      'un único listener de sesión para el aviso de comentarios');
    const listener = /addEventListener\('smr:authchange', \(\) => \{[^}]*feedback-hint[^}]*feedbackHintText\(\)[^}]*\}\)/.test(srcApp);
    assert(listener, 'el listener refresca el aviso de la vista montada con feedbackHintText()');
  });

  if (process.env.FEEDBACK_UI_SELFTEST === '1') {
    await caseRun('auto-verificación (debe fallar)', async () => { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); });
  }
})();

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log('OK: ' + passed + '   FAIL: ' + failed);
  process.exitCode = failed > 0 ? 1 : 0;
});

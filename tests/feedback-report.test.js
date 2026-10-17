'use strict';

/* =====================================================================
   SMR Hub — Fase 8.8: envío de comentarios y avisos de pregunta (módulo).

   Carga el módulo REAL js/cloud-feedback.js con un mock explícito de
   Supabase y del contrato de sesión SMR.cloudSession, y comprueba lo que
   el módulo decide ANTES y DESPUÉS de hablar con el servidor: validación,
   propiedad (falla cerrado), traducción de errores y ausencia total de
   reintentos.

   Son pruebas de LÓGICA con mocks. La escritura real (RLS, RPC, límite de
   frecuencia, aislamiento entre cuentas) se prueba contra PostgreSQL y
   PostgREST reales en tests/rest-rls-isolation.sh y
   tests/pg-privileges-lockdown.sh.

   Auto-comprobación del runner:
     FEEDBACK_SELFTEST=1 node tests/feedback-report.test.js   → exit 1

   Ejecutar desde la raíz:   node tests/feedback-report.test.js
   ===================================================================== */

const fs = require('fs');
const SRC = fs.readFileSync('js/cloud-feedback.js', 'utf8');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function failRun(n, e) { failed++; console.log('  ✗ ' + n + ' → ' + (e && e.message)); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
async function caseRun(name, fn) { try { await fn(); record(name); } catch (e) { failRun(name, e); } }

const KEY_0 = 'q-0123456789abcdef';       /* clave estable del banco de prueba */
const BAD_KEY = 't-redes:0';              /* formato viejo: no es identidad estable */

function makeEnv(opts) {
  const o = opts || {};
  const calls = [];
  let owner = Object.prototype.hasOwnProperty.call(o, 'owner') ? o.owner : 'uid-a';
  let generation = 0;
  let pending = null; /* promesa controlada por el test (respuesta diferida) */

  const contract = {
    owner: () => owner,
    generation: () => generation,
    token: () => ({ owner: owner, generation: o.staleToken ? -1 : generation }),
    isCurrent: (t) => !!t && !o.staleToken && owner === t.owner && generation === t.generation,
    awaitSlot: async () => true
  };

  const g = { console: { warn() {} } };
  g.window = g;
  g.SMR = {
    cloudAvailable: o.cloudAvailable !== false,
    cloud: o.noCloud ? null : {
      rpc(fn, params) {
        calls.push({ fn: fn, params: params, ownerAtCall: owner });
        if (o.rpcThrows) throw new Error('Failed to fetch');
        if (o.onCall) o.onCall({ setOwner: (u) => { owner = u; generation += 1; } });
        if (pending) return pending;
        const r = o.responses && o.responses.length ? o.responses.shift() : { data: 42, error: null };
        return Promise.resolve(r);
      }
    },
    cloudSession: o.noContract ? undefined : contract,
    srs: o.noSrs ? undefined : {
      idOf: (testId, index) => (testId === 't-redes' && index === 0 ? KEY_0 : null)
    }
  };

  new Function('window', 'globalThis', SRC)(g, g, g);
  return {
    fb: g.SMR.feedback,
    calls: calls,
    setOwner: (u) => { owner = u; generation += 1; },
    hold: () => { let resolve; pending = new Promise((r) => { resolve = r; }); return (value) => { pending = null; resolve(value); }; }
  };
}

/* ------------------------------------------------------------------ */

(async function main() {
  await caseRun('M1: envío válido de un comentario por RPC, sin user_id en el payload', async () => {
    const env = makeEnv();
    const res = await env.fb.submitFeedback({ category: 'sugerencia', message: '  Añadid más casos de subnetting.  ' });
    assert(res.ok === true, 'debe confirmar el envío: ' + JSON.stringify(res));
    assert(res.id === 42, 'devuelve el id del servidor: ' + res.id);
    assert(env.calls.length === 1, 'exactamente una llamada, hay ' + env.calls.length);
    assert(env.calls[0].fn === 'submit_feedback', 'llama a la RPC de 00009: ' + env.calls[0].fn);
    const p = env.calls[0].params;
    assert(p.p_category === 'sugerencia', 'categoría tal cual: ' + p.p_category);
    assert(p.p_message === 'Añadid más casos de subnetting.', 'el texto va recortado: [' + p.p_message + ']');
    assert(p.p_ratings === null, 'ratings no se usan todavía: ' + JSON.stringify(p.p_ratings));
    assert(typeof p.p_client_created_at === 'number', 'marca del cliente solo como diagnóstico');
    const raw = JSON.stringify(p);
    assert(!/user_id|uid/.test(raw), 'el payload NO debe contener identidad: ' + raw);
  });

  await caseRun('M2: validación local corta el envío (vacío, espacios, demasiado largo)', async () => {
    const env = makeEnv();
    const bad = [
      { category: 'sugerencia', message: '' },
      { category: 'sugerencia', message: '    ' },
      { category: 'sugerencia', message: 'x'.repeat(2001) },
      { category: 'sugerencia' },
      { category: 'inventada', message: 'texto' },
      { message: 'texto' },
      null
    ];
    for (const input of bad) {
      const res = await env.fb.submitFeedback(input);
      assert(res.ok === false && res.reason === 'invalid', 'entrada inválida rechazada: ' + JSON.stringify(input) + ' → ' + JSON.stringify(res));
    }
    assert(env.calls.length === 0, 'ninguna entrada inválida llega al servidor: ' + env.calls.length);
  });

  await caseRun('M3: envío válido de un aviso con la identidad real de la pregunta', async () => {
    const env = makeEnv();
    const key = env.fb.questionKeyOf('t-redes', 0);
    assert(key === KEY_0, 'la clave sale del banco (SMR.srs.idOf), no se inventa: ' + key);
    const res = await env.fb.submitQuestionReport({ testId: 't-redes', questionKey: key, reason: 'respuesta', details: '  La correcta sería la b.  ' });
    assert(res.ok === true, 'confirma el envío: ' + JSON.stringify(res));
    const p = env.calls[0].params;
    assert(env.calls[0].fn === 'submit_question_report', 'RPC de reportes: ' + env.calls[0].fn);
    assert(p.p_test_id === 't-redes' && p.p_question_key === KEY_0, 'asociación exacta a la pregunta: ' + JSON.stringify(p));
    assert(p.p_reason === 'respuesta', 'motivo de la lista cerrada: ' + p.p_reason);
    assert(p.p_details === 'La correcta sería la b.', 'detalles recortados');
    assert(!/user_id|uid/.test(JSON.stringify(p)), 'sin identidad en el payload');
    /* Sin detalles: opcional de verdad (null, no cadena vacía). */
    const env2 = makeEnv();
    await env2.fb.submitQuestionReport({ testId: 't-redes', questionKey: KEY_0, reason: 'otro', details: '   ' });
    assert(env2.calls[0].params.p_details === null, 'detalles vacíos → null: ' + env2.calls[0].params.p_details);
  });

  await caseRun('M4: sin identidad estable de pregunta no se envía nada', async () => {
    const env = makeEnv();
    const bad = [
      { testId: 't-redes', questionKey: BAD_KEY, reason: 'otro' },
      { testId: 't-redes', questionKey: '', reason: 'otro' },
      { testId: 't-redes', questionKey: KEY_0, reason: 'inventado' },
      { testId: '', questionKey: KEY_0, reason: 'otro' },
      { testId: 't-redes', questionKey: KEY_0, reason: 'otro', details: 'x'.repeat(1001) }
    ];
    for (const input of bad) {
      const res = await env.fb.submitQuestionReport(input);
      assert(res.ok === false && res.reason === 'invalid', 'rechazado: ' + JSON.stringify(input) + ' → ' + JSON.stringify(res));
    }
    assert(env.calls.length === 0, 'nada llega al servidor: ' + env.calls.length);
    /* El módulo tampoco fabrica una clave si el banco no está indexado. */
    const env2 = makeEnv({ noSrs: true });
    assert(env2.fb.questionKeyOf('t-redes', 0) === null, 'sin SMR.srs no hay clave');
    assert(env2.fb.questionKeyOf('t-redes', 99) === null, 'posición inexistente: sin clave');
    const res = await env2.fb.submitQuestionReport({ testId: 't-redes', questionKey: '0', reason: 'otro' });
    assert(res.ok === false && env2.calls.length === 0, 'y no se envía con una clave posicional');
  });

  await caseRun('M5: sin servidor, sin contrato o sin sesión se falla cerrado (0 peticiones)', async () => {
    const scenarios = [
      { name: 'sin configuración cloud', env: makeEnv({ cloudAvailable: false }), reason: 'offline' },
      { name: 'cliente cloud no inicializado', env: makeEnv({ noCloud: true }), reason: 'offline' },
      { name: 'visitante (slot __guest__)', env: makeEnv({ owner: '__guest__' }), reason: 'auth' },
      { name: 'sin slot (owner null)', env: makeEnv({ owner: null }), reason: 'auth' },
      { name: 'sin contrato de sesión', env: makeEnv({ noContract: true }), reason: 'auth' },
      { name: 'token caducado (transición en curso)', env: makeEnv({ staleToken: true }), reason: 'auth' }
    ];
    for (const s of scenarios) {
      const fb = s.env.fb.submitFeedback({ category: 'problema', message: 'algo' });
      const fr = await fb;
      assert(fr.ok === false && fr.reason === s.reason, s.name + ' → ' + JSON.stringify(fr) + ' (esperado ' + s.reason + ')');
      const rr = await s.env.fb.submitQuestionReport({ testId: 't-redes', questionKey: KEY_0, reason: 'otro' });
      assert(rr.ok === false && rr.reason === s.reason, s.name + ' (aviso) → ' + JSON.stringify(rr));
      assert(s.env.calls.length === 0, s.name + ': ninguna petición al servidor');
      assert(s.env.fb.available() === false, s.name + ': available() es false (la UI avisa)');
    }
    /* Y con sesión válida sí está disponible. */
    assert(makeEnv().fb.available() === true, 'con sesión y servidor, available() es true');
  });

  await caseRun('M6: cambio de cuenta durante el envío → no confirma éxito y no reintenta', async () => {
    const env = makeEnv();
    env.fb.__noop = null;
    /* El cambio ocurre mientras el servidor trabaja. */
    const env2 = makeEnv({ onCall: (h) => h.setOwner('uid-b') });
    const res = await env2.fb.submitFeedback({ category: 'otro', message: 'hola' });
    assert(res.ok === false && res.reason === 'changed', 'resultado no atribuible: ' + JSON.stringify(res));
    assert(env2.calls.length === 1, 'una sola petición (sin reintento automático): ' + env2.calls.length);
    assert(env2.calls[0].ownerAtCall === 'uid-a', 'la petición salió con la sesión que la inició: ' + env2.calls[0].ownerAtCall);
    assert(env.calls.length === 0, 'el caso base no se ve afectado');
    /* Cambio ANTES de enviar: ni se sale a la red. */
    const env3 = makeEnv({ staleToken: true });
    const res3 = await env3.fb.submitQuestionReport({ testId: 't-redes', questionKey: KEY_0, reason: 'otro' });
    assert(res3.reason === 'auth' && env3.calls.length === 0, 'sesión no demostrable antes de enviar: ' + JSON.stringify(res3));
  });

  await caseRun('M7: errores del servidor → motivo traducido, sin reintentos ni segundo intento', async () => {
    const cases = [
      [{ data: null, error: { code: 'P0001', message: 'rate limit exceeded' } }, 'rate'],
      [{ data: null, error: { code: '22023', message: 'invalid payload: message' } }, 'invalid'],
      [{ data: null, error: { code: '42501', message: 'auth required' } }, 'auth'],
      [{ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.submit_feedback' } }, 'unavailable'],
      /* Cuenta borrada en el servidor con sesión local viva: reintentar no sirve. */
      [{ data: null, error: { code: '23503', message: 'insert or update on table "feedback" violates foreign key constraint "feedback_user_id_fkey"' } }, 'auth'],
      [{ data: null, error: { message: 'Failed to fetch' } }, 'network'],
      [{ data: null, error: { message: 'algo raro' } }, 'error']
    ];
    for (const [resp, expected] of cases) {
      const env = makeEnv({ responses: [resp] });
      const res = await env.fb.submitFeedback({ category: 'otro', message: 'hola' });
      assert(res.ok === false && res.reason === expected, JSON.stringify(resp.error) + ' → ' + JSON.stringify(res) + ' (esperado ' + expected + ')');
      assert(env.calls.length === 1, 'un único intento por envío: ' + env.calls.length);
    }
    /* Excepción del transporte (sin respuesta): no se propaga ni se reintenta. */
    const env = makeEnv({ rpcThrows: true });
    const res = await env.fb.submitFeedback({ category: 'otro', message: 'hola' });
    assert(res.ok === false && res.reason === 'network', 'excepción → network: ' + JSON.stringify(res));
    assert(env.calls.length === 1, 'una sola petición pese a la excepción: ' + env.calls.length);
  });

  await caseRun('M8: un envío en curso no se reutiliza para otra cuenta ni duplica', async () => {
    const env = makeEnv();
    const done = env.hold();
    const p1 = env.fb.submitFeedback({ category: 'problema', message: 'uno' });
    await new Promise((r) => setTimeout(r, 0));
    assert(env.calls.length === 1, 'la petición está en curso: ' + env.calls.length);
    env.setOwner('uid-b');          /* otra cuenta entra mientras tanto */
    done({ data: 5, error: null });
    const res = await p1;
    assert(res.ok === false && res.reason === 'changed', 'la respuesta tardía no se atribuye a B: ' + JSON.stringify(res));
    assert(env.calls.length === 1, 'no se ha disparado ningún envío nuevo');
  });

  await caseRun('M9: cada motivo tiene mensaje y el módulo no toca el progreso local', async () => {
    const fb = makeEnv().fb;
    ['invalid', 'auth', 'offline', 'rate', 'unavailable', 'network', 'changed', 'error'].forEach((r) => {
      assert(typeof fb.MESSAGES[r] === 'string' && fb.MESSAGES[r].length > 10, 'falta mensaje para ' + r);
    });
    assert(Object.keys(fb.MESSAGES).length === 8, 'no hay mensajes de más: ' + Object.keys(fb.MESSAGES).join(','));
    /* El módulo no escribe progreso, ni marcadores de propietario, ni tokens. */
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    assert(!/localStorage/.test(code), 'el módulo no toca localStorage');
    assert(!/SMR\.progress|SMR\.store/.test(code), 'el módulo no toca el progreso ni el almacén');
    assert(!/access_token|refresh_token|getSession/.test(code), 'el módulo no maneja tokens: la sesión es del SDK');
    assert(!/\.from\(|\.insert\(|\.upsert\(/.test(code), 'el módulo solo usa .rpc()');
    assert(/SMR\.cloudSession/.test(code), 'la propiedad sale del contrato de sesión existente (8.6.3)');
  });

  if (process.env.FEEDBACK_SELFTEST === '1') {
    await caseRun('auto-verificación (debe fallar)', async () => { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); });
  }
})();

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log('OK: ' + passed + '   FAIL: ' + failed);
  process.exitCode = failed > 0 ? 1 : 0;
});

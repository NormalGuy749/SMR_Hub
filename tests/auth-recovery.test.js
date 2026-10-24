'use strict';

/* =====================================================================
   SMR Hub — Fase 8.6.1: recuperación de contraseña (js/auth.js).

   FIDELIDAD: se carga el módulo REAL js/auth.js dentro de un entorno
   simulado (window, DOM mínimo, SMR.modal, SMR.cloud.auth). Supabase es un
   mock explícito: son pruebas de LÓGICA con mocks. No demuestran el
   comportamiento real de GoTrue ni de los correos de recuperación.

   Ejecutar desde la raíz:   node tests/auth-recovery.test.js
   Probar otra versión:      AUTH_JS=/ruta/auth.js node tests/auth-recovery.test.js
   ===================================================================== */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

const srcAuth = fs.readFileSync(process.env.AUTH_JS || 'js/auth.js', 'utf8');
const LINK_ERROR = 'El enlace no es válido, ha caducado o se abrió en otro navegador. Solicita uno nuevo.';
const sess = { user: { id: 'u1', email: 'a@x.es' } };
const flush = () => new Promise((r) => setTimeout(r, 0));

/* ---------- DOM mínimo: cada consulta crea su hijo (basta para auth.js) ---------- */

function fakeEl(name) {
  const kids = {}, listeners = {}, cls = new Set();
  return {
    name, dataset: {}, textContent: '', disabled: false, _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
    classList: {
      add(c) { cls.add(c); },
      toggle(c, on) { if (on) cls.add(c); else cls.delete(c); },
      has(c) { return cls.has(c); }
    },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    fire(t, ev) { return Promise.all((listeners[t] || []).map((f) => f(ev || { preventDefault() {} }))); },
    querySelector(s) { return kids[s] || (kids[s] = fakeEl(s)); },
    focus() {},
    reset() {}
  };
}

/* ---------- entorno: auth.js real + Supabase mock ---------- */

function makeEnv(o) {
  const opts = o || {};
  const calls = [];
  const events = [];
  const modal = {
    opens: 0, closes: 0, current: null,
    open(render) {
      const box = fakeEl('box');
      render(box);
      this.opens++;
      this.current = { box, body: box.querySelector('[data-auth-body]') };
    },
    close() { this.closes++; this.current = null; }
  };
  let authCb = null;
  const auth = {
    onAuthStateChange(cb) { authCb = cb; },
    getSession: () => (opts.getSession ? opts.getSession() : Promise.resolve({ data: { session: null }, error: null })),
    signInWithPassword: (a) => { calls.push(['signIn', a]); return (opts.signIn || (async () => ({ data: {}, error: null })))(a); },
    signUp: (a) => { calls.push(['signUp', a]); return (opts.signUp || (async () => ({ data: { session: null }, error: null })))(a); },
    resetPasswordForEmail: (email, extra) => { calls.push(['reset', email, extra]); return (opts.reset || (async () => ({ error: null })))(email, extra); },
    updateUser: (a) => { calls.push(['update', a]); return (opts.update || (async () => ({ data: {}, error: null })))(a); },
    signOut: async () => { calls.push(['signOut']); return { error: null }; },
    emit(event, session) { return authCb(event, session); }
  };
  const win = {
    location: { origin: 'https://smr.test', pathname: '/index.html', search: opts.search || '', hash: opts.hash || '' },
    dispatchEvent(e) { events.push(e); }
  };
  const doc = {
    getElementById: () => null,
    createElement: (t) => fakeEl(t),
    querySelector(sel) {
      const m = /data-auth-form="([^"]+)"/.exec(sel);
      const cur = modal.current;
      return m && cur && cur.body._html.includes('data-auth-form="' + m[1] + '"') ? fakeEl(sel) : null;
    }
  };
  win.SMR = {
    cloudAvailable: true,
    esc: (s) => String(s),
    icon: () => '',
    modal,
    cloud: { auth, from: () => ({ upsert: async () => ({ error: null }) }) }
  };
  class FakeEvent { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } }
  class FakeFormData { constructor(form) { this.v = form.__values || {}; } entries() { return Object.entries(this.v); } }
  new Function('window', 'globalThis', 'document', 'URLSearchParams', 'CustomEvent', 'FormData', srcAuth)(
    win, win, doc, URLSearchParams, FakeEvent, FakeFormData);
  return { modal, auth, calls, events, SMR: win.SMR };
}

const formOf = (env) => env.modal.current.body.querySelector('form');
const msgOf = (env) => env.modal.current.box.querySelector('[data-auth-msg]').textContent;
const countOf = (env, kind) => env.calls.filter((c) => c[0] === kind).length;
function submitForm(env, values) {
  formOf(env).__values = values;
  return formOf(env).fire('submit');
}

(async () => {
  console.log('auth-recovery: recuperación de contraseña (js/auth.js, lógica con mocks)');

  /* --- 1. PASSWORD_RECOVERY antes de que resuelva getSession -------- */
  await (async () => {
    let resolveSession;
    const env = makeEnv({ getSession: () => new Promise((r) => { resolveSession = r; }) });
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush();
    assert(env.modal.opens === 1, 'PASSWORD_RECOVERY durante getSession abre el formulario');
    assert(env.modal.current.body._html.includes('data-auth-form="update-password"'), 'se abre el formulario de nueva contraseña');
    resolveSession({ data: { session: sess }, error: null });
    await flush();
    assert(env.modal.opens === 1, 'getSession posterior no reabre ni reemplaza el formulario');
    assert(env.events.some((e) => e.type === 'smr:authchange' && e.detail.user && e.detail.user.id === 'u1'),
      'la sesión de recuperación se anuncia como sesión (decisión 8.6.1: sync no bloqueada)');
  })();
  record('PASSWORD_RECOVERY durante getSession abre el formulario una sola vez');

  /* --- 2. Eventos repetidos no reabren el formulario ---------------- */
  await (async () => {
    const env = makeEnv();
    await flush(); /* la inicialización (getSession sin sesión) termina antes del evento */
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush(); /* la inicialización (getSession sin sesión) termina antes del evento */
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush();
    assert(env.modal.opens === 1, 'un segundo PASSWORD_RECOVERY no reabre el formulario');
  })();
  record('PASSWORD_RECOVERY repetido no reabre ni reemplaza el formulario');

  /* --- 3. Éxito marca "completado"; reenvío no finge error ---------- */
  await (async () => {
    const env = makeEnv();
    await flush(); /* la inicialización (getSession sin sesión) termina antes del evento */
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush();
    await submitForm(env, { password: 'nueva123' });
    const upd = env.calls.filter((c) => c[0] === 'update');
    assert(upd.length === 1 && upd[0][1].password === 'nueva123', 'updateUser recibe la nueva contraseña una vez');
    assert(msgOf(env).includes('Contraseña actualizada'), 'mensaje de éxito');
    assert(formOf(env).dataset.busy === '', 'el botón queda liberado tras el éxito');
    assert(formOf(env).dataset.done === '1', 'el formulario queda marcado como completado');
    await submitForm(env, { password: 'otra123' });
    assert(countOf(env, 'update') === 1, 'tras el éxito no hay segunda llamada a updateUser');
    assert(msgOf(env) !== LINK_ERROR, 'el reenvío tras el éxito NO muestra el falso error de enlace');
    assert(msgOf(env).includes('ya actualizada'), 'el reenvío informa de que la contraseña ya cambió');
  })();
  record('éxito marca el flujo como completado y el reenvío no finge error');

  /* --- 4. Validación local: sin petición de red --------------------- */
  await (async () => {
    const env = makeEnv();
    await flush(); /* la inicialización (getSession sin sesión) termina antes del evento */
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush();
    await submitForm(env, { password: '123' });
    assert(countOf(env, 'update') === 0, 'contraseña corta: no se llama a updateUser');
    assert(msgOf(env).includes('demasiado corta'), 'mensaje de contraseña corta');
    assert(formOf(env).dataset.busy === '', 'el formulario queda reutilizable');
  })();
  record('contraseña corta se valida sin petición de red');

  /* --- 5. Doble envío: una sola petición ---------------------------- */
  await (async () => {
    let release;
    const env = makeEnv({ update: () => new Promise((r) => { release = r; }) });
    await flush(); /* la inicialización (getSession sin sesión) termina antes del evento */
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush();
    const p1 = submitForm(env, { password: 'nueva123' });
    const p2 = submitForm(env, { password: 'nueva123' });
    await flush();
    assert(countOf(env, 'update') === 1, 'doble envío mientras hay petición activa: una sola llamada');
    release({ data: {}, error: null });
    await p1;
    await p2;
    assert(msgOf(env).includes('Contraseña actualizada'), 'la primera respuesta gana');
  })();
  record('doble envío no duplica updateUser');

  /* --- 6. Errores recuperables (red, sesión inválida) --------------- */
  await (async () => {
    let n = 0;
    const env = makeEnv({
      update: async () => {
        n++;
        if (n === 1) throw new Error('Failed to fetch');
        if (n === 2) return { error: { message: 'Auth session missing!' } };
        return { data: {}, error: null };
      }
    });
    await flush(); /* la inicialización (getSession sin sesión) termina antes del evento */
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush();
    await submitForm(env, { password: 'nueva123' });
    assert(formOf(env).dataset.busy === '', 'fallo de red: el botón se libera');
    assert(!formOf(env).dataset.done, 'un error no marca el flujo como completado');
    await submitForm(env, { password: 'nueva123' });
    assert(msgOf(env) === LINK_ERROR, 'sesión de recuperación ausente: mensaje útil, sin texto técnico');
    await submitForm(env, { password: 'nueva123' });
    assert(n === 3 && msgOf(env).includes('Contraseña actualizada'), 'tras los errores, reintentar con éxito sigue siendo posible');
  })();
  record('errores de red y de sesión dejan el formulario recuperable');

  /* --- 7. SIGNED_OUT durante la recuperación limpia el estado ------- */
  await (async () => {
    const env = makeEnv();
    await flush(); /* la inicialización (getSession sin sesión) termina antes del evento */
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush();
    await env.auth.emit('SIGNED_OUT', null);
    await flush();
    /* 8.6.2: el logout cierra el modal de recuperación (sin sesión no hay
       formulario útil), así que ya no se puede reenviar: la aserción anterior
       (modal abierto + LINK_ERROR a posteriori) quedó obsoleta. */
    assert(env.modal.closes === 1 && env.modal.current === null, 'SIGNED_OUT cierra el modal de recuperación abierto');
    assert(countOf(env, 'update') === 0, 'tras SIGNED_OUT no se llama a updateUser');
  })();
  record('SIGNED_OUT durante la recuperación cierra el formulario');

  /* --- 7b. Abandonar a otra vista limpia el flag -------------------- */
  await (async () => {
    const env = makeEnv();
    await flush(); /* la inicialización (getSession sin sesión) termina antes del evento */
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush();
    env.SMR.auth.open('login');      /* cambio de vista: abandona el flujo */
    env.SMR.auth.open('update-password');
    await submitForm(env, { password: 'nueva123' });
    assert(countOf(env, 'update') === 0, 'abandonar a otra vista: updateUser no se llama');
    assert(msgOf(env) === LINK_ERROR, 'sin flujo activo, pide enlace nuevo en lugar de finge éxito');
  })();
  record('abandonar update-password a otra vista limpia el estado de recuperación');

  /* --- 8. Enlace roto en la URL (query y hash) ---------------------- */
  await (async () => {
    const env = makeEnv({ search: '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid' });
    await flush();
    assert(env.modal.opens === 1, 'error en la URL abre el modal');
    assert(env.modal.current.box._html.includes('Recuperar contraseña'), 'se ofrece pedir un enlace nuevo');
    assert(msgOf(env) === LINK_ERROR, 'mensaje comprensible, sin detalles del token');
    const envHash = makeEnv({ hash: '#error=access_denied&error_code=otp_expired' });
    await flush();
    assert(envHash.modal.opens === 1 && msgOf(envHash) === LINK_ERROR, 'error en el hash igual que en la query');
    const signed = makeEnv({ search: '?error=access_denied&error_code=otp_expired', getSession: async () => ({ data: { session: sess }, error: null }) });
    await flush();
    assert(signed.modal.opens === 0, 'un enlace caducado con sesión activa no muestra el aviso');
  })();
  record('enlace con error en la URL o el hash muestra salida recuperable');

  /* --- 9. Código sin sesión (PKCE sin verificador) ------------------ */
  await (async () => {
    const env = makeEnv({ search: '?code=abc' });
    await flush();
    assert(env.modal.opens === 1 && msgOf(env) === LINK_ERROR, 'code sin sesión: aviso y pedir enlace nuevo');
    const ok = makeEnv({ search: '?code=abc', getSession: async () => ({ data: { session: sess }, error: null }) });
    await flush();
    assert(ok.modal.opens === 0, 'code que sí produce sesión no muestra error');
    assert(ok.events.some((e) => e.type === 'smr:authchange' && e.detail.user), 'la sesión del código se anuncia');
  })();
  record('code sin sesión avisa; code con sesión no muestra error');

  /* --- 10. Visitante sin enlace: nada cambia ----------------------- */
  await (async () => {
    const env = makeEnv();
    await flush();
    assert(env.modal.opens === 0, 'arranque normal no abre modal');
    assert(env.events.length === 0, 'visitante no emite smr:authchange');
  })();
  record('visitante sin enlace: arranque sin modal ni evento');

  /* --- 11. Login normal (regresión) --------------------------------- */
  await (async () => {
    const bad = makeEnv({ signIn: async () => ({ data: {}, error: { message: 'Invalid login credentials' } }) });
    bad.SMR.auth.open('login');
    await submitForm(bad, { email: 'a@x.es', password: 'mal' });
    assert(msgOf(bad) === 'Email o contraseña incorrectos.', 'credenciales erróneas muestran mensaje');
    assert(formOf(bad).dataset.busy === '', 'login fallido libera el botón');

    const good = makeEnv();
    good.SMR.auth.open('login');
    await submitForm(good, { email: 'a@x.es', password: 'bien123' });
    assert(countOf(good, 'signIn') === 1 && good.modal.closes === 1, 'login correcto cierra el modal');
    await good.auth.emit('SIGNED_IN', sess);
    await flush();
    assert(good.events.some((e) => e.type === 'smr:authchange' && e.detail.user && e.detail.user.id === 'u1'),
      'SIGNED_IN normal anuncia el usuario');
  })();
  record('login normal sin regresiones (error, éxito y anuncio)');

  /* --- 12. Registro (regresión) ------------------------------------- */
  await (async () => {
    const env = makeEnv();
    env.SMR.auth.open('signup');
    await submitForm(env, { email: 'b@x.es', password: 'nueva123' });
    assert(countOf(env, 'signUp') === 1, 'registro llama a signUp una vez');
    assert(msgOf(env).includes('Cuenta creada'), 'sin sesión: aviso de confirmación por email');
  })();
  record('registro sin regresiones');

  /* --- 13. Solicitud del correo de recuperación --------------------- */
  await (async () => {
    const ok = makeEnv();
    ok.SMR.auth.open('reset');
    await submitForm(ok, { email: 'a@x.es' });
    const r = ok.calls.find((c) => c[0] === 'reset');
    assert(r && r[1] === 'a@x.es' && r[2].redirectTo === 'https://smr.test/index.html', 'redirectTo vuelve a esta misma página');
    assert(msgOf(ok).includes('Enlace enviado'), 'mensaje de envío correcto');

    const bad = makeEnv({ reset: async () => ({ error: { message: 'rate limit exceeded' } }) });
    bad.SMR.auth.open('reset');
    await submitForm(bad, { email: 'a@x.es' });
    assert(msgOf(bad).includes('Demasiados intentos'), 'error del correo: mensaje comprensible');
    assert(formOf(bad).dataset.busy === '', 'error del correo libera el botón');
  })();
  record('solicitud de recuperación: éxito y error');

  /* --- auto-verificación del runner --------------------------------- */
  if (process.env.AUTH_RECOVERY_SELFTEST === '1') {
    await (async () => { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); })();
    record('auto-verificación (no debe llegar aquí)');
  }
})().catch((e) => { console.error('runner:', e && e.message); if (process.env.AUTH_RECOVERY_TRACE === '1') console.error(e && e.stack); failed++; });

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log(`OK: ${passed}  FAIL: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
});

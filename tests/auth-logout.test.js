'use strict';

/* Ejecuta auth.js real con DOM, modal y SDK simulados. No prueba GoTrue.
   El mock reproduce SIGNED_OUT incluso tras error de red del SDK; el cambio
   de slots y el aislamiento de progreso se cubren en las suites de ownership. */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

const srcAuth = fs.readFileSync('js/auth.js', 'utf8');
const sess = { user: { id: 'uA', email: 'a@x.es' } };
const flush = () => new Promise((r) => setTimeout(r, 0));

/* ---------- DOM mínimo: cada consulta crea su hijo a demanda ---------- */

function fakeEl(name) {
  const kids = {}, listeners = {}, cls = new Set(), appended = [];
  return {
    name, dataset: {}, textContent: '', disabled: false, _html: '',
    appended,
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
    appendChild(c) { appended.push(c); return c; },
    focus() {},
    reset() {}
  };
}

/* ---------- entorno: auth.js real + widget real + Supabase mock ---------- */

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
  const soArgs = [];
  const auth = {
    onAuthStateChange(cb) { authCb = cb; },
    getSession: () => (opts.getSession ? opts.getSession() : Promise.resolve({ data: { session: null }, error: null })),
    signInWithPassword: (a) => { calls.push(['signIn', a]); return (opts.signIn || (async () => ({ data: {}, error: null })))(a); },
    signUp: (a) => { calls.push(['signUp', a]); return (opts.signUp || (async () => ({ data: { session: null }, error: null })))(a); },
    resetPasswordForEmail: (e, x) => { calls.push(['reset']); return (opts.reset || (async () => ({ error: null })))(e, x); },
    updateUser: (a) => { calls.push(['update', a]); return (opts.update || (async () => ({ data: {}, error: null })))(a); },
    signOut: (a) => { soArgs.push(a); calls.push(['signOut']); return (opts.signOut || (async () => ({ error: null })))(a); },
    emit(event, session) { return authCb(event, session); }
  };
  const win = {
    location: { origin: 'https://smr.test', pathname: '/index.html', search: '', hash: '' },
    dispatchEvent(e) { events.push(e); }
  };
  win.console = console;
  const footer = fakeEl('footer');
  const doc = {
    getElementById: (id) => (id === 'nav-footer' ? footer : null),
    createElement: (t) => fakeEl(t),
    querySelector() { return null; } /* el módulo determina si hay modal de recuperación abierto */
  };
  /* El selector de '¿hay un modal update-password abierto?' se abre con el modal vivo */
  doc.querySelector = (sel) => {
    if (sel === '.auth-nav-item') return null;
    const m = /data-auth-form="([^"]+)"/.exec(sel || '');
    return m && modal.current && modal.current.body._html.includes('data-auth-form="' + m[1] + '"') ? fakeEl(sel) : null;
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
  return { modal, auth, calls, events, soArgs, footer, SMR: win.SMR, nullAnnouncements: () => events.filter((e) => e.type === 'smr:authchange' && e.detail && !e.detail.user).length };}

const logoutBtn = (env) => env.footer.appended.length
  ? env.footer.appended[0].querySelector('[data-auth-logout]')
  : null;
const loginOpenBtn = (env) => env.footer.appended.length
  ? env.footer.appended[0].querySelector('[data-auth-open]')
  : null;

async function signIn(env) {
  await env.auth.emit('SIGNED_IN', sess);
  await flush();
}

(async () => {
  console.log('auth-logout: logout seguro y transición de sesión (js/auth.js, lógica con mocks)');

  /* --- 1. Logout normal -------------------------------------------- */
  await (async () => {
    const env = makeEnv();
    await flush();
    await signIn(env);
    const nulls1 = env.nullAnnouncements();
    assert(!!logoutBtn(env), 'el widget muestra el botón de cerrar sesión tras entrar');
    await env.SMR.auth.signOut();
    const arg = env.soArgs[env.soArgs.length - 1];
    assert(arg && arg.scope === 'local', 'signOut del SDK se invoca con { scope: local } explícito');
    await env.auth.emit('SIGNED_OUT', null); /* el SDK real limpia y emite; se simula aquí */
    await flush();
    assert(env.SMR.auth.isSignedIn() === false, 'state.user queda a null tras SIGNED_OUT');
    assert(env.nullAnnouncements() === nulls1 + 1, 'se anuncia transición a visitante una sola vez');
    assert(!!loginOpenBtn(env), 'el widget vuelve al botón de iniciar sesión');
  })();
  record('logout normal: scope local explícito, transición a visitante anunciada y widget restaurado');

  /* --- 2. Error de signOut sin evento: no hay éxito fingido --------- */
  await (async () => {
    const env = makeEnv({ signOut: async () => ({ error: { message: 'Red caída' } }) });
    await flush();
    await signIn(env);
    const nulls1 = env.nullAnnouncements();
    let threw = null;
    try { await env.SMR.auth.signOut(); } catch (e) { threw = e; }
    assert(threw && /Red caída/.test(threw.message || ''), 'SMR.auth.signOut lanza el error del SDK (no lo traga)');
    assert(env.SMR.auth.isSignedIn() === true, 'sin evento SIGNED_OUT del SDK la sesión NO cambia (no se finge éxito)');
    assert(env.nullAnnouncements() === nulls1, 'no se anuncia transición que no ocurrió');
  })();
  record('error de signOut sin SIGNED_OUT: se lanza y el estado no cambia');

  /* --- 3. Doble cierre de sesión: announce idempotente -------------- */
  await (async () => {
    const env = makeEnv();
    await flush();
    await signIn(env);
    const nulls1 = env.nullAnnouncements();
    await env.SMR.auth.signOut();
    await env.auth.emit('SIGNED_OUT', null);
    await flush();
    await env.SMR.auth.signOut();
    await env.auth.emit('SIGNED_OUT', null);
    await flush();
    assert(env.soArgs.length === 2, 'el SDK se llama las dos veces (idempotente en v2), sin estado en conflicto');
    assert(env.nullAnnouncements() === nulls1 + 1, 'solo un announce a visitante (handleSession guard)');
  })();
  record('doble logout: dos llamadas al SDK, una sola transición anunciada');

  /* --- 4. Error + SIGNED_OUT igualmente (flujo real v2.117.3) ------- */
  await (async () => {
    const env = makeEnv({ signOut: async () => ({ error: { message: 'offline' } }) });
    await flush();
    await signIn(env);
    const btn = logoutBtn(env);
    const p = btn.fire('click');
    await p;
    assert(btn.disabled === false, 'el widget re-habilita el botón si el cierre falló sin evento');
    /* el SDK real también emitiría SIGNED_OUT tras limpiar la sesión local (verificado);
       se simula para comprobar el estado final coherente */
    await env.auth.emit('SIGNED_OUT', null);
    await flush();
    assert(env.SMR.auth.isSignedIn() === false, 'tras el evento del SDK el estado sí refleja el cierre');
  })();
  record('widget: error de logout re-habilita el botón; el estado llega por el evento del SDK');

  /* --- 5. Widget con éxito: el botón queda deshabilitado y el re-render lo sustituye --- */
  await (async () => {
    const env = makeEnv();
    await flush();
    await signIn(env);
    const btn = logoutBtn(env);
    const p = btn.fire('click');
    await p; /* el mock resuelve al instante; el SIGNED_OUT llega después en el flujo real */
    await env.auth.emit('SIGNED_OUT', null);
    await flush();
    const li = env.footer.appended[0];
    assert(li._html.includes('Iniciar sesión') && !li._html.includes('data-auth-logout'),
      'el widget se repinta en modo visitante al cambiar de estado');
    assert(env.SMR.auth.isSignedIn() === false, 'cierre completo');
  })();
  record('widget: cierre correcto repinta el widget en modo visitante');

  /* --- 6. Logout durante recuperación de contraseña ----------------- */
  await (async () => {
    const env = makeEnv();
    await flush();
    await env.auth.emit('PASSWORD_RECOVERY', sess);
    await flush();
    assert(env.modal.opens === 1 && env.modal.current.body._html.includes('data-auth-form="update-password"'),
      'modal de recuperación abierto');
    await env.SMR.auth.signOut();
    await env.auth.emit('SIGNED_OUT', null);
    await flush();
    assert(env.modal.closes >= 1 && env.modal.current === null, 'el logout cierra el modal de recuperación (solo se mantiene con sesión)');
    await env.SMR.auth.open('update-password');
    const form = env.modal.current.body.querySelector('form');
    form.__values = { password: 'nueva123' };
    await form.fire('submit');
    assert(env.calls.filter((c) => c[0] === 'update').length === 0, 'sin sesión no hay updateUser (no hay estado de recuperación obsoleto)');
  })();
  record('logout durante recuperación: modal cerrado y flujo limpia sin estado obsoleto');

  /* --- 7. El cierre solo cierra el modal de recuperación, NO otros --- */
  await (async () => {
    const env = makeEnv();
    await flush();
    env.SMR.auth.open('login');
    assert(env.modal.opens === 1, 'modal de login abierto previamente');
    await env.auth.emit('SIGNED_OUT', null); /* p. ej. propagado desde otra pestaña */
    await flush();
    assert(env.modal.closes === 0, 'SIGNED_OUT sin sesión NO cierra modales que no son de recuperación');
  })();
  record('SIGNED_OUT no cierra modales no relacionados con el flujo de recuperación');

  if (process.env.AUTH_LOGOUT_SELFTEST === '1') {
    await (async () => { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); })();
    record('auto-verificación (no debe llegar aquí)');
  }
})().catch((e) => { console.error('runner:', e && e.message); if (process.env.AUTH_LOGOUT_TRACE === '1') console.error(e && e.stack); failed++; });

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log(`OK: ${passed}  FAIL: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
});

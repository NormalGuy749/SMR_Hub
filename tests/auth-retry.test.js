'use strict';

/* Prueba cloud-progress.js real con Supabase y timers simulados.
   Los errores de autenticación conservan y pausan la cola hasta re-login;
   los transitorios usan reintentos acotados. No valida un servidor real. */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

const srcProgress = fs.readFileSync('js/cloud-progress.js', 'utf8');
const user = { id: 'uA', email: 'a@x.es' };
const QUEUE_KEY = 'progressSyncQueue:uA';
const attempt = { test_id: 't1', title: 'T', mode: 'practica', correct: 1, total: 2, pct: 50, created_at: 111 };

async function flush() { for (let i = 0; i < 60; i++) await Promise.resolve(); }

function makeEnv(rpcError) {
  const ls = new Map();
  const listeners = {};
  const timers = [];
  let rpcCalls = 0;
  let currentError = rpcError;   /* mutable: simula que la sesión se recupera */
  const store = {
    get(k, fallback = null) {
      const raw = ls.get('smrhub:' + k);
      if (raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(k, v) { ls.set('smrhub:' + k, JSON.stringify(v)); return true; },
    remove(k) { ls.delete('smrhub:' + k); }
  };
  const chain = () => {
    const self = {
      select() { return self; }, eq() { return self; }, order() { return self; },
      limit() { return self; }, in() { return self; }, neq() { return self; },
      is() { return self; }, single() { return self; }, update() { return self; },
      upsert() { return Promise.resolve({ data: null, error: null }); },
      insert() { return Promise.resolve({ data: null, error: null }); },
      delete() { return Promise.resolve({ data: null, error: null }); },
      then(resolve) { resolve({ data: [], error: null }); },
      catch() { return self; }
    };
    return self;
  };
  const sb = {
    from() { return chain(); },
    rpc() { rpcCalls++; return Promise.resolve({ data: null, error: currentError }); },
    auth: { signOut: () => Promise.resolve() }
  };
  const g = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: (k) => ls.delete(k),
      get length() { return ls.size; },
      key: (i) => [...ls.keys()][i] === undefined ? null : [...ls.keys()][i]
    },
    /* La transición requiere exclusión; este arnés aporta un lock que concede siempre. */
    navigator: { locks: { request: (name, cb) => Promise.resolve().then(cb) } },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).slice().forEach((fn) => fn(ev)); return true; },
    setTimeout(fn, delay) { timers.push({ fn, delay, done: false }); return timers.length; },
    clearTimeout() {}
  };
  g.window = g;
  g.SMR = {
    store,
    progress: { data: { resources: {} }, save() {}, recordTest() {}, recordStudySession() {}, logActivity() {}, touchStreak() {} },
    cloud: sb, cloudAvailable: true, esc: (v) => String(v), icon: () => ''
  };
  /* El módulo usa setTimeout global: se sustituye por el falso para que nada corra en tiempo real. */
  globalThis.setTimeout = g.setTimeout;
  globalThis.clearTimeout = g.clearTimeout;
  new Function('window', 'globalThis', srcProgress)(g, g, g);
  store.set(QUEUE_KEY, { attempts: [attempt], sessions: [], activity: [], wrongEvents: [], streakDays: [], failed: {} });
  return {
    signIn(u) { g.dispatchEvent({ type: 'smr:authchange', detail: { user: u || user } }); },
    setError(err) { currentError = err; },
    rpcCalls: () => rpcCalls,
    pending: (delay) => timers.filter((t) => !t.done && t.delay === delay).length,
    /* ejecuta el siguiente temporizador pendiente con ese retardo; false si no hay */
    async runNext(delay) {
      const t = timers.find((x) => !x.done && x.delay === delay);
      if (!t) return false;
      t.done = true;
      t.fn();
      await flush();
      return true;
    },
    queue: () => store.get(QUEUE_KEY, null)
  };
}

(async function main() {
  console.log('auth-retry.test.js');

  /* 1. JWT caducado: se intenta, no se programa reintento, la cola queda intacta. */
  {
    const env = makeEnv({ code: 'PGRST301', message: 'JWT expired' });
    env.signIn();
    await flush();
    while (await env.runNext(0));       /* drenaje inicial (delay 0) */
    assert(env.rpcCalls() >= 1, 'se intentó el envío');
    assert(env.pending(3000) === 0, 'un 401 no programa reintentos');
    const q = env.queue();
    assert(q && q.attempts.length === 1, 'el evento sigue en la cola');
    assert(!(q.failed && q.failed.attempts && q.failed.attempts.length), 'no se aparta a dead-letter');
    record('JWT caducado: pausa sin reintentos ni dead-letter');
  }

  /* 2. Error transitorio: reintenta, y el número de envíos queda acotado. */
  {
    const env = makeEnv({ code: '', message: 'network down' });
    env.signIn();
    await flush();
    while (await env.runNext(0));
    assert(env.pending(3000) === 1, 'un error transitorio programa un reintento');
    let guard = 0;
    while (await env.runNext(3000) && guard++ < 50);
    assert(guard < 50, 'los reintentos terminan');
    assert(env.rpcCalls() >= 2 && env.rpcCalls() <= 12, 'envíos acotados (' + env.rpcCalls() + ')');
    record('transitorio: reintentos acotados (' + env.rpcCalls() + ' envíos)');
  }

  /* 3. Tras un 401, una recuperación de sesión reanuda y drena la cola. */
  {
    const env = makeEnv({ code: 'PGRST301', message: 'JWT expired' });
    env.signIn();
    await flush();
    while (await env.runNext(0));
    const callsTrasPausa = env.rpcCalls();
    assert(callsTrasPausa >= 1, 'se intentó el envío antes del 401');
    assert(env.pending(3000) === 0, 'en pausa no hay reintentos programados');

    env.setError(null);
    env.signIn({ id: 'uA', email: 'a@x.es' }); /* reautenticación: objeto nuevo, mismo uid */
    await flush();
    while (await env.runNext(0));

    assert(env.rpcCalls() > callsTrasPausa, 'la recuperación de sesión debe reanudar el envío');
    const q = env.queue();
    const quedan = (q.attempts || []).length + (q.sessions || []).length + (q.activity || []).length +
      (q.wrongEvents || []).length + (q.streakDays || []).length;
    assert(quedan === 0, 'la cola debe quedar vacía tras reanudar: quedan ' + quedan);
    record('recuperación de sesión: la cola pausada se reanuda y drena');
  }

  console.log('\n' + passed + ' ok, ' + failed + ' fallidos');
  if (failed) process.exitCode = 1;
})().catch((e) => { failed++; console.error('  ✗ ' + e.message); process.exitCode = 1; });

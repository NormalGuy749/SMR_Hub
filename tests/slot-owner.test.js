'use strict';

/* =====================================================================
   SMR Hub — Fase 8.5.11: propiedad del slot vivo (defecto D-3 de 8.5.10).

   FIDELIDAD: aquí NO se extraen funciones sueltas; se carga el módulo REAL
   js/cloud-progress.js entero dentro de un entorno simulado
   (localStorage/DOM/Supabase de mentira), de modo que la transición de
   slots y el manejador smr:authchange son el código de producción. Sin
   Web Locks el lock de transición corre síncrono (decisión del propio
   módulo), así que las transiciones son deterministas.

   Supabase es un mock explícito: NINGUNA prueba de este archivo toca la
   nube real; las suites de PostgreSQL y de navegador cubren lo demás.

   Auto-verificación del runner:
     SLOT_OWNER_SELFTEST=1 node tests/slot-owner.test.js   → exit 1
   ===================================================================== */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

const srcProgress = fs.readFileSync('js/cloud-progress.js', 'utf8');
const srcSrs = fs.readFileSync('js/srs.js', 'utf8');

const CARD = 'q-0123456789abcdef';
const CARD2 = 'q-fedcba9876543210';

function progressWith(o) {
  const p = o || {};
  return {
    resources: { viewed: {}, completed: {}, selfAssessment: {} },
    tests: { best: {}, last: {}, history: [], wrong: {}, srs: p.srs || {}, srsLegacy: {} },
    cases: { solved: {} }, studySessions: [], studyMinutes: 0, activity: [],
    streak: { lastDay: null, count: 0 }, v: 4
  };
}

/* ---------- entorno simulado ---------- */

function makeEnv(opts) {
  const o = opts || {};
  const ls = new Map(); /* claves REALES de localStorage, prefijo smrhub: incluido */
  const listeners = {};
  const held = [];
  let cloudCalls = 0;

  const store = {
    get(k, fallback = null) {
      const raw = ls.get('smrhub:' + k);
      if (raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(k, v) { ls.set('smrhub:' + k, JSON.stringify(v)); return true; },
    remove(k) { ls.delete('smrhub:' + k); }
  };

  function chain() {
    const ctx = { eq: null };
    const self = {
      select() { return self; },
      eq(col, val) { if (col === 'user_id') ctx.eq = val; return self; },
      order() { return self; }, limit() { return self; }, in() { return self; },
      neq() { return self; }, is() { return self; }, single() { return self; },
      update() { return self; },
      upsert() { return Promise.resolve({ data: null, error: null }); },
      insert() { return Promise.resolve({ data: null, error: null }); },
      delete() { return Promise.resolve({ data: null, error: null }); },
      then(resolve) {
        /* fila etiquetada con el uid de la PETICIÓN: así se distingue si
           una respuesta tardía de A se instala en el estado de B. */
        const rows = ctx.eq ? [{ test_id: 't-' + ctx.eq, title: 'attempt-' + ctx.eq, mode: 'practica', correct: 1, total: 2, pct: 50, created_at: 111 }] : [];
        const done = () => resolve({ data: rows, error: null });
        if (o.holdSelect) held.push(done); else done();
      },
      catch() { return self; }
    };
    return self;
  }

  const sb = {
    from() { cloudCalls++; return chain(); },
    rpc() { cloudCalls++; return Promise.resolve({ data: { applied: 0, invalid: 0 }, error: null }); },
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
    /* 8.6.3: la transición de slots exige EXCLUSIÓN (fail-closed). Este arnés
       es de UNA pestaña: un lock que concede siempre mantiene lo que la suite
       comprueba (la mecánica de slots), ahora por la vía CON exclusión. */
    navigator: { locks: { request: (name, cb) => Promise.resolve().then(cb) } },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).slice().forEach((fn) => fn(ev)); return true; },
    setTimeout, clearTimeout
  };
  g.window = g;
  g.SMR_DATA = { tests: [{ id: 't-t1', questions: [{ q: 'A', options: ['a1', 'a2'], correct: 0 }, { q: 'B', options: ['b1', 'b2'], correct: 1 }] }] };

  const hooks = { save: 0, dropSrs: [], scheduleSrs: [], touchStreak: 0 };
  /* La app arranca con SMR.progress.data = sanitizeProgress(store.get('progress')).
     Si el arnés lo dejara vacío, el primer save() pisaría el slot sembrado. */
  const seededProgress = o.seed && o.seed.live && o.seed.live.progress;
  const progress = {
    data: seededProgress ? JSON.parse(JSON.stringify(seededProgress)) : progressWith({}),
    save() { hooks.save++; store.set('progress', this.data); },
    recordTest() {}, recordStudySession() {}, logActivity() {},
    toggleCompleted() { return true; },
    dropSrs(testId, qIndex) { hooks.dropSrs.push([testId, qIndex]); },
    scheduleSrs(testId, qIndex, rate) { hooks.scheduleSrs.push([testId, qIndex, rate]); },
    touchStreak() { hooks.touchStreak++; return true; }
  };

  g.SMR = { store, progress, cloud: sb, cloudAvailable: true, esc: (v) => String(v), icon: () => '' };
  new Function('window', 'globalThis', srcSrs)(g, g, g);
  g.SMR.srs.buildIndex();

  /* Semilla ANTES de cargar el módulo: reproduce un arranque real
     (los snapshots y el marcador ya están en el dispositivo). */
  const seed = o.seed || {};
  Object.keys(seed.live || {}).forEach((k) => store.set(k, seed.live[k]));
  Object.keys(seed.snapshots || {}).forEach((owner) => {
    store.set('progressByOwner:' + owner, { slot: seed.snapshots[owner], savedAt: 1000, v: 1 });
  });
  if (seed.marker) store.set('liveOwner', { owner: seed.marker, v: 1 });

  new Function('window', 'globalThis', srcProgress)(g, g, g);

  const api = {
    g, ls, store, held, hooks, cloudCalls: () => cloudCalls,
    auth(user) { g.dispatchEvent({ type: 'smr:authchange', detail: { user } }); },
    marker() { const m = store.get('liveOwner', null); return m && (typeof m === 'string' ? m : m.owner); },
    live(key, fallback = null) { return store.get(key, fallback); },
    snapshot(owner) { return store.get('progressByOwner:' + owner, null); },
    hasSnapshot(owner) { return store.get('progressByOwner:' + owner, null) !== null; }
  };
  return api;
}

function user(id) { return { id, email: id + '@test' }; }
function flush(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 4); i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}

/* ---------- casos ---------- */

(async function main() {
  /* --- 1. D-3: borrar → revivir → recargar con la sesión restaurada --- */
  await (async () => {
    const env = makeEnv({
      seed: {
        marker: 'uid-X',
        /* slot vivo: la tarjeta viva y SIN marca (el revive la retiró) */
        live: { progress: progressWith({ srs: { [CARD]: { level: 1, due: 5000 } } }), progressSyncSrsClears: {} },
        /* snapshot del dueño: obsoleto, con la marca pending de antes del revive */
        snapshots: { 'uid-X': { progress: progressWith({ srs: {} }), progressSyncSrsClears: { [CARD]: 'pending' } } }
      }
    });
    env.auth(user('uid-X')); /* recarga: el primer authchange trae la sesión restaurada */
    await flush();
    assert(env.live('progress').tests.srs[CARD] !== undefined, 'la tarjeta viva sigue tras la recarga');
    assert(Object.keys(env.live('progressSyncSrsClears') || {}).length === 0, 'la marca retirada NO reaparece: ' + JSON.stringify(env.live('progressSyncSrsClears')));
    assert(!env.hasSnapshot('__guest__'), 'el estado autenticado NO se archiva como __guest__');
    assert(env.marker() === 'uid-X', 'el marcador sigue siendo el dueño');
  })();
  record('D-3: recargar con sesión restaurada no revierte el estado vivo ni reintroduce el pending');

  /* --- 2. un tombstone legítimamente pendiente no se pierde --------- */
  await (async () => {
    const env = makeEnv({
      seed: {
        marker: 'uid-X',
        live: { progress: progressWith({ srs: {} }), progressSyncSrsClears: { [CARD]: 'pending' } },
        snapshots: { 'uid-X': { progress: progressWith({ srs: {} }), progressSyncSrsClears: {} } }
      }
    });
    env.auth(user('uid-X'));
    await flush();
    assert((env.live('progressSyncSrsClears') || {})[CARD] === 'pending', 'el pending legítimo se conserva');
    assert(!env.hasSnapshot('__guest__'), 'sin archivado como visitante');
  })();
  record('recarga con un borrado pendiente legítimo: la marca se conserva');

  /* --- 3. A → B → A: sin mezcla y con etiquetas correctas ----------- */
  await (async () => {
    const env = makeEnv({
      seed: {
        marker: 'uid-A',
        live: { progress: progressWith({ srs: { [CARD]: { level: 2, due: 9 } } }), studentProfile: { from: 'A' } },
        snapshots: {
          'uid-A': { progress: progressWith({ srs: {} }), studentProfile: { from: 'A-old' } },
          'uid-B': { progress: progressWith({ srs: { [CARD2]: { level: 5, due: 7 } } }), studentProfile: { from: 'B' } }
        }
      }
    });
    env.auth(user('uid-B'));
    await flush();
    const snapA = env.snapshot('uid-A');
    assert(env.marker() === 'uid-B', 'el marcador pasa a B');
    assert(!env.hasSnapshot('__guest__'), 'el slot de A no se archiva como visitante');
    assert(snapA.slot.progress.tests.srs[CARD] !== undefined, 'el estado vivo de A queda archivado BAJO A');
    assert(snapA.slot.studentProfile.from !== undefined, 'el perfil de A se archiva con A');
    assert(env.live('studentProfile').from === 'B', 'el slot vivo pasa a ser el de B');

    env.auth(user('uid-A'));
    await flush();
    const snapB = env.snapshot('uid-B');
    assert(env.marker() === 'uid-A', 'el marcador vuelve a A');
    assert(snapB.slot.progress.tests.srs[CARD2] !== undefined, 'el estado de B queda archivado bajo B');
    assert(env.live('progress').tests.srs[CARD] !== undefined, 'A recupera su tarjeta');
    assert(env.live('progress').tests.srs[CARD2] === undefined, 'A no ve la tarjeta de B');
    assert(env.live('studentProfile').from === 'A', 'A recupera SU perfil');
  })();
  record('A→B→A: cada estado se archiva bajo su dueño, sin mezcla');

  /* --- 4. custodia del contenido de visitante (comportamiento previo) --- */
  await (async () => {
    const env = makeEnv({
      seed: {
        marker: '__guest__',
        live: { progress: progressWith({ srs: { [CARD]: { level: 1, due: 3 } } }) },
        snapshots: { 'uid-A': { progress: progressWith({ srs: {} }) } }
      }
    });
    env.auth(user('uid-A'));
    await flush();
    const guest = env.snapshot('__guest__');
    assert(guest && guest.slot.progress.tests.srs[CARD] !== undefined, 'el contenido de visitante se custodia en __guest__');
    assert(!env.hasSnapshot('__unknown__'), 'no se duplica en cuarentena (camino de visitante intacto)');
    assert(env.marker() === 'uid-A', 'el slot vivo pasa a ser el de la cuenta');
    assert(!env.live('progress').tests.srs[CARD], 'el visitante no se adopta automáticamente');
  })();
  record('visitante → cuenta: custodia en __guest__ sin adoptar ni duplicar (sin regresión)');

  /* --- 5. perfil heredado SIN marcador (compatibilidad) ------------- */
  await (async () => {
    const env = makeEnv({
      seed: {
        /* perfil antiguo: no hay marcador persistido */
        live: { progress: progressWith({ srs: { [CARD]: { level: 1, due: 3 } } }), progressSyncSrsClears: { [CARD]: 'pending' } },
        snapshots: { 'uid-A': { progress: progressWith({ srs: {} }) } }
      }
    });
    env.auth(user('uid-A'));   /* primer arranque tras actualizar el código */
    await flush();
    assert(env.marker() === 'uid-A', 'tras el primer arranque el marcador queda fijado');
    /* el primer arranque de un perfil heredado conserva la custodia previa:
       el contenido vivo queda en __guest__ (recuperable), no se pierde */
    const guest = env.snapshot('__guest__');
    assert(guest && (guest.slot.progressSyncSrsClears || {})[CARD] === 'pending', 'la marca del perfil heredado queda custodiada, no perdida');
    assert(guest.slot.progress.tests.srs[CARD] !== undefined, 'y su tarjeta también');
    /* A partir de aquí (marcador ya fijado) el estado vivo manda: la
       actividad posterior a la transición sobrevive a la siguiente recarga. */
    env.store.set('progress', progressWith({ srs: { [CARD]: { level: 1, due: 3 }, [CARD2]: { level: 2, due: 4 } } }));
    env.store.set('progressSyncSrsClears', { [CARD2]: 'pending' });
    env.auth(user('uid-A'));
    await flush();
    assert(env.live('progress').tests.srs[CARD2] !== undefined, 'el estado vivo posterior sobrevive a la recarga');
    assert((env.live('progressSyncSrsClears') || {})[CARD2] === 'pending', 'la marca viva se conserva en la recarga');
  })();
  record('perfil heredado sin marcador: primer arranque fija el dueño y el segundo ya protege el estado vivo');

  /* --- 6. primera carga como visitante: no se pierde el progreso ---- */
  await (async () => {
    const env = makeEnv({
      seed: { live: { progress: progressWith({ srs: { [CARD]: { level: 1, due: 3 } } }), studentProfile: { from: 'guest' } } }
    });
    await flush();
    assert(env.live('progress').tests.srs[CARD] !== undefined, 'el progreso de visitante sigue intacto');
    assert(env.live('studentProfile').from === 'guest', 'el perfil de visitante sigue intacto');
    assert(!env.hasSnapshot('__guest__'), 'no se archiva nada sin transición');
    assert(env.cloudCalls() === 0, 'sin sesión no se habla con Supabase');
  })();
  record('primera carga como visitante: progreso intacto y cero llamadas a la nube');

  /* --- 7. adopción del estado de visitante (primera cuenta) --------- */
  await (async () => {
    const env = makeEnv({
      seed: {
        marker: '__guest__',
        /* el snapshot del visitante es el contenido VIVO archivado en la
           última transición: ambos deben coincidir (si divergen, manda el vivo) */
        live: { progress: progressWith({ srs: { [CARD]: { level: 1, due: 3 } } }), studentProfile: { from: 'guest' } },
        snapshots: { '__guest__': { progress: progressWith({ srs: { [CARD]: { level: 1, due: 3 } } }), studentProfile: { from: 'guest' } } }
      }
    });
    env.auth(user('uid-A'));
    await flush();
    assert(env.live('progress').tests.srs[CARD] !== undefined, 'la cuenta recién llegada adopta el contenido de visitante');
    assert(env.live('studentProfile').from === 'guest', 'incluido el perfil de visitante');
    assert(env.snapshot('uid-A') && env.snapshot('uid-A').slot.progress.tests.srs[CARD] !== undefined, 'y queda custodiado como contenido del dueño');
    assert(env.marker() === 'uid-A', 'el marcador apunta a la cuenta');
  })();
  record('adopción de visitante en la primera cuenta: comportamiento previo conservado');

  /* --- 8. dos inicializaciones consecutivas: sin archivados duplicados --- */
  await (async () => {
    const env = makeEnv({
      seed: {
        marker: 'uid-X',
        live: { progress: progressWith({ srs: { [CARD]: { level: 1, due: 3 } } }) },
        snapshots: { 'uid-X': { progress: progressWith({ srs: {} }) } }
      }
    });
    const savedAtAntes = env.snapshot('uid-X').savedAt;
    env.auth(user('uid-X'));
    await flush();
    env.auth(user('uid-X'));
    await flush();
    assert(env.live('progress').tests.srs[CARD] !== undefined, 'el estado vivo sigue igual');
    assert(!env.hasSnapshot('__guest__'), 'ni un archivado de visitante');
    assert(env.snapshot('uid-X').savedAt === savedAtAntes, 'el snapshot del dueño no se re-archiva en balde');
    assert(env.marker() === 'uid-X', 'el marcador no cambia');
  })();
  record('dos inicializaciones seguidas: sin archivados ni escrituras duplicadas');

  /* --- 9. respuesta tardía de A tras activar B ---------------------- */
  await (async () => {
    const env = makeEnv({
      holdSelect: true,
      seed: {
        marker: 'uid-A',
        live: { progress: progressWith({ srs: { [CARD]: { level: 1, due: 3 } } }) },
        snapshots: { 'uid-A': { progress: progressWith({ srs: {} }) }, 'uid-B': { progress: progressWith({ srs: {} }) } }
      }
    });
    env.auth(user('uid-A'));         /* el pull de A queda EN VUELO */
    await flush();
    env.auth(user('uid-B'));         /* se activa B antes de que responda A */
    await flush();
    assert(env.marker() === 'uid-B', 'el propietario activo es B');
    const heldCount = env.held.length;
    env.held.splice(0).forEach((done) => done());  /* llega la respuesta tardía de A */
    await flush(6);
    const ids = (env.live('progress').tests.history || []).map((h) => h.testId);
    assert(env.marker() === 'uid-B', 'el propietario no cambia con la respuesta tardía');
    assert(!ids.includes('t-uid-A'), 'la respuesta tardía de A NO se instala en el estado de B: ' + JSON.stringify(ids));
    assert(!env.hasSnapshot('__guest__'), 'la respuesta tardía no provoca archivados raros');
    assert(heldCount > 0, 'hubo al menos una respuesta retenida (la prueba es real)');
  })();
  record('respuesta tardía de A con B activo: no escribe en el slot de B');

  /* --- 10. perfil y datos no SRS sobreviven a la recarga ------------- */
  await (async () => {
    const env = makeEnv({
      seed: {
        marker: 'uid-X',
        live: {
          progress: progressWith({ srs: { [CARD]: { level: 1, due: 3 } } }),
          studentProfile: { from: 'X-live' },
          progressSyncClears: { 'r-1': 1234 }
        },
        snapshots: { 'uid-X': { progress: progressWith({ srs: {} }), studentProfile: { from: 'X-old' }, progressSyncClears: {} } }
      }
    });
    env.auth(user('uid-X'));
    await flush();
    assert(env.live('studentProfile').from === 'X-live', 'el perfil vivo no se sustituye por el snapshot antiguo');
    assert((env.live('progressSyncClears') || {})['r-1'] === 1234, 'las marcas de limpieza no SRS siguen ahí');
    const snap = env.snapshot('uid-X');
    assert(snap.slot.liveOwner === undefined, 'el marcador NO se filtra dentro de los snapshots');
  })();
  record('datos no SRS (perfil, marcas de limpieza) intactos y marcador fuera de los snapshots');

  /* --- auto-verificación del runner --------------------------------- */
  if (process.env.SLOT_OWNER_SELFTEST === '1') {
    await (async () => { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); })();
    record('auto-verificación (no debe llegar aquí)');
  }
})().catch((e) => { console.error('runner:', e && e.message); if (process.env.SLOT_OWNER_TRACE === '1') console.error(e && e.stack); failed++; });

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log(`OK: ${passed}  FAIL: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
});

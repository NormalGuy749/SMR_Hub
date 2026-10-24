'use strict';

/* =====================================================================
   SMR Hub — Fase 8.6.3 (etapa 1): contrato de propiedad y aislamiento
   del perfil (slot 'studentProfile') entre cuentas del mismo dispositivo.

   Carga los módulos REALES en el ORDEN DE index.html:
       js/profile.js → js/cloud-profile.js → js/cloud-progress.js
   con un mock explícito de Supabase y un mock de Web Locks con concesión
   ASÍNCRONA (como un navegador real: el callback del lock no corre
   síncronamente).

   Antes del contrato, cloud-profile.js leía el slot vivo en el hueco
   entre su listener (se carga antes) y la transición de slots de
   cloud-progress.js, y subía el perfil de A a la fila cloud de B.
   Demostrado contra HEAD en un directorio temporal (ver informe).

   Son pruebas de LÓGICA con mocks: no sustituyen a Supabase real.

   Ejecutar desde la raíz:   node tests/profile-owner.test.js
   ===================================================================== */

const fs = require('fs');
const srcProfile = fs.readFileSync('js/profile.js', 'utf8');
const srcCloudProfile = fs.readFileSync('js/cloud-profile.js', 'utf8');
const srcCloudProgress = fs.readFileSync('js/cloud-progress.js', 'utf8');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

/* Dos comunidades distintas y válidas (id === community, como data.js). */
const CUR = [
  { id: 'aaa', community: 'aaa', name: 'AAA', academicYear: '2026-2027', modules1: [], modules2: [] },
  { id: 'bbb', community: 'bbb', name: 'BBB', academicYear: '2026-2027', modules1: [], modules2: [] }
];
const PROFILE_A = { community: 'aaa', course: 1, academicYear: '2026-2027' };
const PROFILE_B = { community: 'bbb', course: 2, academicYear: '2026-2027' };
const PROFILE_C = { community: 'bbb', course: 2, academicYear: '2026-2027' };

function user(id) { return { id: id, email: id + '@test' }; }

/* avanza microtareas y macrotareas (los locks conceden en una tarea) */
function flush(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 12); i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function makeEnv(opts) {
  const o = opts || {};
  const ls = new Map();
  const listeners = {};
  const profileWrites = [];   /* { uid, payload, via } */
  const profileReads = [];
  let heldReads = [];
  let holding = !!o.holdProfileRead;

  const store = {
    get(k, fallback = null) {
      const raw = ls.get('smrhub:' + k);
      if (raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(k, v) { ls.set('smrhub:' + k, JSON.stringify(v)); return true; },
    remove(k) { ls.delete('smrhub:' + k); }
  };

  function chain(table) {
    let mode = null, payload = null, uid = null;
    function readNow() {
      if (table === 'profiles') profileReads.push(uid);
      const result = { data: (o.cloudProfiles && o.cloudProfiles[uid]) ? o.cloudProfiles[uid] : null, error: null };
      if (holding && table === 'profiles') return new Promise((res) => { heldReads.push(() => res(result)); });
      return result;
    }
    function term() {
      if (mode === 'update') {
        profileWrites.push({ uid: uid, payload: payload, via: 'update' });
        return { data: null, error: null };
      }
      return { data: [], error: null };
    }
    const self = {
      select() { mode = mode || 'select'; return self; },
      update(p) { mode = 'update'; payload = p; return self; },
      upsert(p) { if (table === 'profiles') profileWrites.push({ uid: null, payload: p, via: 'upsert' }); return Promise.resolve({ data: null, error: null }); },
      insert() { return Promise.resolve({ data: null, error: null }); },
      delete() { return Promise.resolve({ data: null, error: null }); },
      eq(col, val) { if (col === 'user_id') uid = val; return self; },
      order() { return self; }, limit() { return self; }, in() { return self; },
      neq() { return self; }, is() { return self; },
      maybeSingle() { return Promise.resolve(readNow()); },
      single() { return Promise.resolve(readNow()); },
      then(resolve) { resolve(term()); },
      catch() { return self; }
    };
    return self;
  }

  const sb = {
    from(table) { return chain(table); },
    rpc() { return Promise.resolve({ data: { applied: 0, invalid: 0 }, error: null }); },
    auth: { signOut: () => Promise.resolve(), onAuthStateChange() {}, getSession: () => Promise.resolve({ data: { session: null }, error: null }) }
  };

  const g = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage: {
      getItem: (k) => (ls.has(k) ? ls.get(k) : null),
      setItem: (k, v) => ls.set(k, String(v)),
      removeItem: (k) => ls.delete(k),
      get length() { return ls.size; },
      key: (i) => ([...ls.keys()][i] === undefined ? null : [...ls.keys()][i])
    },
    location: { search: '', hash: '', origin: 'http://x', pathname: '/' },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).slice().forEach((fn) => fn(ev)); return true; },
    setTimeout, clearTimeout
  };
  g.window = g;
  g.SMR_DATA = { curriculums: CUR, tests: [] };

  /* Web Locks con concesión ASÍNCRONA (navegador real). */
  if (o.locks !== false) {
    g.navigator = {
      locks: {
        request(name, cb) {
          return new Promise((resolve) => {
            setTimeout(() => { Promise.resolve().then(cb).then(resolve, () => resolve()); }, 0);
          });
        }
      }
    };
  } else {
    g.navigator = {};
  }

  function freshProgress() {
    return { resources: { viewed: {}, completed: {}, selfAssessment: {} },
      tests: { best: {}, last: {}, history: [], wrong: {}, srs: {}, srsLegacy: {} },
      cases: { solved: {} }, studySessions: [], studyMinutes: 0, activity: [],
      streak: { lastDay: null, count: 0 } };
  }
  const progress = {
    data: freshProgress(),
    save() { store.set('progress', this.data); },
    recordTest() {}, recordStudySession() {}, logActivity() {},
    toggleCompleted() { return true; },
    dropSrs() {}, scheduleSrs() {}, touchStreak() { return true; },
    isCompleted() { return false; }
  };

  g.SMR = { store, progress, cloud: sb, cloudAvailable: true, esc: (v) => String(v), icon: () => '' };

  /* Orden REAL de index.html. */
  new Function('window', 'globalThis', srcProfile)(g, g, g);
  new Function('window', 'globalThis', srcCloudProfile)(g, g, g);
  new Function('window', 'globalThis', srcCloudProgress)(g, g, g);

  return {
    g, ls, store, progress,
    writes: profileWrites,
    reads: profileReads,
    writesTo(uid) { return profileWrites.filter((w) => w.uid === uid); },
    releaseReads() { holding = false; const h = heldReads; heldReads = []; h.forEach((f) => f()); },
    auth(u) { g.dispatchEvent({ type: 'smr:authchange', detail: { user: u } }); },
    live(key, fallback = null) { return store.get(key, fallback); },
    snapshot(owner) { return store.get('progressByOwner:' + owner, null); },
    marker() { const m = store.get('liveOwner', null); return m && (typeof m === 'string' ? m : m.owner); },
    profileRead() { return g.SMR.profile.read(); },
    contract() { return g.SMR.cloudSession; },
    token() { return g.SMR.cloudSession.token(); },
    isCurrent(t) { return g.SMR.cloudSession.isCurrent(t); },
    seedLive(owner, profile) {
      store.set('liveOwner', { owner: owner, v: 1 });
      store.set('studentProfile', profile);
      store.set('progress', progress.data);
    }
  };
}

/* ---------- casos (aislados: uno que falle no oculta los demás) ---------- */

const CASES = [];
function test(name, fn) { CASES.push({ name: name, fn: fn }); }

/* 1. A con perfil configurado en el slot vivo; entra B. El perfil de A NO
      puede acabar escrito en la fila cloud de B. */
test('A → B: el perfil de A no contamina la cuenta B', async () => {
  const env = makeEnv();
  env.seedLive('uid-A', PROFILE_A);

  env.auth(user('uid-A'));
  await flush();
  env.writes.length = 0;                 /* solo interesa la transición */

  env.auth(user('uid-B'));
  await flush(20);

  const leaked = env.writesTo('uid-B').filter((w) => w.payload && w.payload.community === 'aaa');
  assert(leaked.length === 0, 'el perfil de A se escribió en la fila cloud de B: ' + JSON.stringify(leaked));

  const liveNow = env.live('studentProfile');
  assert(!(liveNow && liveNow.community === 'aaa' && env.marker() === 'uid-B'),
    'el slot vivo quedó con el perfil de A estando B activo');

  const snapA = env.snapshot('uid-A');
  assert(snapA && snapA.slot && snapA.slot.studentProfile && snapA.slot.studentProfile.community === 'aaa',
    'el perfil de A debe quedar archivado bajo A (sin pérdida)');
});

/* 2. Sin Web Locks NO hay transición (fail-closed 8.6.3): el fallback ya no
      ejecuta la transición sin exclusión, y por eso tampoco puede filtrar.
      Se comprueba el MOTIVO (no se transicionó), no solo la ausencia de fuga. */
test('A → B sin Web Locks: fail-closed (no se transiciona y no se filtra)', async () => {
  const env = makeEnv({ locks: false });
  env.seedLive('uid-A', PROFILE_A);

  env.auth(user('uid-A'));
  await flush();
  env.writes.length = 0;
  env.auth(user('uid-B'));
  await flush(20);

  assert(env.marker() === 'uid-A',
    'sin exclusión la transición NO debe ejecutarse (el marcador no se mueve): ' + env.marker());
  const liveNow = env.live('studentProfile');
  assert(liveNow && liveNow.community === 'aaa',
    'el slot vivo sigue intacto (no se archivó ni se sustituyó): ' + JSON.stringify(liveNow));
  const leaked = env.writesTo('uid-B').filter((w) => w.payload && w.payload.community === 'aaa');
  assert(leaked.length === 0, 'sin locks también se filtró el perfil de A: ' + JSON.stringify(leaked));
});

/* 3. Con B activo y sin datos en cloud, solo se sube el contenido del dueño. */
test('perfil propio: solo se sube el contenido del dueño activo', async () => {
  const env = makeEnv();
  env.seedLive('uid-B', PROFILE_B);

  env.auth(user('uid-B'));
  await flush(20);
  env.g.SMR.profile.save({ course: 1 });
  await sleep(1100);                     /* debounce de schedulePush (900 ms) */
  await flush(20);

  const toB = env.writesTo('uid-B');
  const wrong = toB.filter((w) => w.payload && w.payload.community === 'aaa');
  assert(wrong.length === 0, 'se subió el perfil equivocado: ' + JSON.stringify(wrong));
  /* evidencia POSITIVA: tras la transición la cadena de perfil sigue viva
     (runtime.syncing liberado) y sube el perfil del dueño activo. */
  assert(toB.some((w) => w.payload && w.payload.community === 'bbb'),
    'el perfil del dueño activo debe subirse: ' + JSON.stringify(toB));
});

/* 4. A → B → A: la generación distingue sesiones distintas del mismo uid. */
test('A → B → A: un token viejo no vuelve a ser válido', async () => {
  const env = makeEnv();
  env.seedLive('uid-A', PROFILE_A);

  env.auth(user('uid-A'));
  await flush();
  const c = env.contract();
  assert(!!c, 'el contrato SMR.cloudSession debe existir');
  const tokenA1 = env.token();
  const gen1 = tokenA1.generation;
  assert(tokenA1.owner === 'uid-A', 'el token inicial es de A: ' + JSON.stringify(tokenA1));
  assert(env.isCurrent(tokenA1) === true, 'el token de A debe ser válido mientras A está activo');

  env.auth(user('uid-B'));
  await flush(20);
  assert(env.isCurrent(tokenA1) === false, 'tras entrar B, el token de A queda invalidado');
  assert(c.owner() === 'uid-B', 'el dueño anunciado es B');

  env.auth(user('uid-A'));
  await flush(20);
  assert(c.owner() === 'uid-A', 'al volver, el dueño anunciado es A otra vez');
  assert(env.isCurrent(tokenA1) === false,
    'el token de la PRIMERA sesión de A sigue inválido aunque el uid coincida');
  assert(c.token().generation > gen1, 'la generación avanza con cada transición');
});

/* 5. Respuesta remota tardía del perfil de A: no debe aplicarse al slot de B. */
test('respuesta tardía del perfil de A: no se aplica al slot de B', async () => {
  /* A: perfil local SIN curso (no configurado) y fila cloud con datos
     → initialSync(A) entra por el camino de PULL, que escribe en el slot. */
  const env = makeEnv({
    holdProfileRead: true,
    cloudProfiles: { 'uid-A': { community: 'aaa', course: 1, academic_year: '2026-2027', curriculum_id: 'aaa' } }
  });
  env.seedLive('uid-A', { community: 'aaa', academicYear: '2026-2027' }); /* sin course */

  env.auth(user('uid-A'));
  await flush();
  assert(env.reads.indexOf('uid-A') !== -1, 'la prueba es real: hubo lectura cloud de A en vuelo');

  env.auth(user('uid-B'));               /* se activa B mientras el pull de A espera */
  await flush(20);
  env.releaseReads();                    /* llega la respuesta tardía de A */
  await flush(30);

  const live = env.live('studentProfile');
  assert(!(live && live.course === 1 && live.community === 'aaa'),
    'el pull tardío de A escribió el perfil de A en el slot de B: ' + JSON.stringify(live));
  assert(env.marker() === 'uid-B', 'el propietario sigue siendo B');
});

/* 6. Contrato: un uid cuyo slot no está instalado NO obtiene token, y la
      espera no bloquea indefinidamente. */
test('slot no preparado: sin token y sin bloqueo indefinido', async () => {
  const env = makeEnv();
  env.seedLive('uid-A', PROFILE_A);
  env.auth(user('uid-A'));
  await flush();
  const c = env.contract();

  const timed = await Promise.race([
    c.awaitSlot('uid-Z').then((v) => ['resuelto', v]),
    sleep(500).then(() => ['timeout'])
  ]);
  assert(timed[0] === 'resuelto', 'awaitSlot no debe quedarse colgado');
  assert(timed[1] === false, 'un uid sin slot instalado no debe considerarse listo');

  const okOwn = await c.awaitSlot('uid-A');
  assert(okOwn === true, 'el uid con el slot instalado sí resuelve true');
});

/* 7. Trabajo de perfil encolado ANTES del cambio de uid: no cruza datos. */
test('push encolado antes del cambio de uid: sin escrituras cruzadas', async () => {
  const env = makeEnv();
  env.seedLive('uid-A', PROFILE_A);

  env.auth(user('uid-A'));
  await flush(20);
  env.g.SMR.profile.save({ course: 1 }); /* encola un push diferido para A */
  env.auth(user('uid-B'));               /* el uid cambia antes de que dispare */
  await flush(20);
  await sleep(1100);
  await flush(20);

  env.writesTo('uid-B').forEach((w) => {
    assert(!(w.payload && w.payload.community === 'aaa'),
      'un push de A escribió el perfil de A en la fila de B: ' + JSON.stringify(w.payload));
  });
  env.writesTo('uid-A').forEach((w) => {
    assert(!(w.payload && w.payload.community === 'bbb'),
      'un push de B escribió el perfil de B en la fila de A: ' + JSON.stringify(w.payload));
  });
  const liveA = env.snapshot('uid-A');
  assert(liveA && liveA.slot.studentProfile && liveA.slot.studentProfile.community === 'aaa',
    'el perfil de A debe conservarse archivado bajo A');
});

/* 8. Cambio rápido A → B → C sin esperar entre eventos: dos transiciones
      encoladas. C debe sincronizar SU perfil y nunca el de A. */
test('A → B → C en el mismo tick: C sincroniza su perfil sin datos de A', async () => {
  const env = makeEnv();
  env.seedLive('uid-A', PROFILE_A);
  /* C ya tiene snapshot propio en este dispositivo, con perfil configurado */
  env.store.set('progressByOwner:uid-C', { slot: { progress: env.progress.data, studentProfile: PROFILE_C }, savedAt: 1, v: 1 });

  env.auth(user('uid-A'));
  await flush();
  env.writes.length = 0;
  env.auth(user('uid-B'));
  env.auth(user('uid-C'));            /* encolada sin esperar a que termine B */
  await flush(40);

  assert(env.marker() === 'uid-C', 'el slot vivo debe quedar en manos de C: ' + env.marker());
  const live = env.live('studentProfile');
  assert(live && live.community === 'bbb', 'C debe ver SU perfil, no el de A: ' + JSON.stringify(live));

  const toC = env.writesTo('uid-C');
  assert(toC.some((w) => w.payload && w.payload.community === 'bbb'),
    'C debe sincronizar su propio perfil (su initialSync no debe saltarse): ' + JSON.stringify(toC));
  env.writes.forEach((w) => {
    assert(!(w.payload && w.payload.community === 'aaa'),
      'el perfil de A se escribió en la fila de ' + w.uid + ': ' + JSON.stringify(w.payload));
  });
});

(async function main() {
  console.log('profile-owner.test.js');
  for (const c of CASES) {
    try {
      await c.fn();
      record(c.name);
    } catch (e) {
      failed++;
      console.error('  ✗ ' + c.name + ' → ' + e.message);
      if (process.env.TRACE === '1') console.error(e.stack);
    }
  }
  console.log('\n' + passed + ' ok, ' + failed + ' fallidos');
  if (failed) process.exitCode = 1;
})();

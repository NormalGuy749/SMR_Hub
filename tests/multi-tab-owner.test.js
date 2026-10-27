'use strict';

/* Dos instancias de profile, cloud-profile y cloud-progress comparten
   localStorage simulado; storage solo se entrega a la otra pestaña.
   El gestor de locks es compartido: FIFO por nombre, concesión asíncrona
   y retención hasta terminar el callback, incluso al congelar una pestaña.
   Esto respeta el orden que requiere https://www.w3.org/TR/web-locks/.
   Supabase y Web Locks son mocks: no valida navegador ni servidor reales. */

const fs = require('fs');
const srcProfile = fs.readFileSync('js/profile.js', 'utf8');
const srcCloudProfile = fs.readFileSync('js/cloud-profile.js', 'utf8');
/* SMR_MODULE permite probar una variante aislada para comprobar sensibilidad. */
const srcProgress = fs.readFileSync(process.env.SMR_MODULE || 'js/cloud-progress.js', 'utf8');
const srcSrs = fs.readFileSync('js/srs.js', 'utf8');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

const PREFIX = 'smrhub:';
const UID_A = 'uid-A';
const UID_B = 'uid-B';
const UID_C = 'uid-C';
const CARD = 'q-0123456789abcdef';

const CUR = [
  { id: 'aaa', community: 'aaa', name: 'AAA', academicYear: '2026-2027', modules1: [], modules2: [] },
  { id: 'bbb', community: 'bbb', name: 'BBB', academicYear: '2026-2027', modules1: [], modules2: [] },
  { id: 'ccc', community: 'ccc', name: 'CCC', academicYear: '2026-2027', modules1: [], modules2: [] }
];
const PROFILE_A = { community: 'aaa', course: 1, academicYear: '2026-2027' };
const PROFILE_B = { community: 'bbb', course: 2, academicYear: '2026-2027' };
const PROFILE_C = { community: 'ccc', course: 1, academicYear: '2026-2027' };

function user(id) { return { id: id, email: id + '@test' }; }
function flush(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 10); i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function progressWith(o) {
  const p = o || {};
  return {
    resources: { viewed: {}, completed: p.completed || {}, selfAssessment: {} },
    tests: { best: {}, last: {}, history: [], wrong: {}, srs: p.srs || {}, srsLegacy: {} },
    cases: { solved: {} }, studySessions: [], studyMinutes: 0, activity: [],
    streak: { lastDay: null, count: 0 }, v: 4
  };
}

/* ---------- bus compartido: localStorage + eventos 'storage' ---------- */

function makeBus() {
  const ls = new Map();
  const tabs = [];
  const queue = [];
  let scheduled = false;
  function flushSoon() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      queue.splice(0).forEach((fn) => fn());
    }, 0);
  }
  return {
    ls, tabs,
    write(writer, fullKey, value) {
      const oldRaw = ls.has(fullKey) ? ls.get(fullKey) : null;
      if (value === null) ls.delete(fullKey); else ls.set(fullKey, value);
      tabs.forEach((t) => {
        if (t === writer) return;
        queue.push(() => t.deliver(fullKey, value, oldRaw));
      });
      flushSoon();
    },
    seed(fullKey, value) { if (value === null) ls.delete(fullKey); else ls.set(fullKey, value); }
  };
}

/* ---------- gestor de locks COMPARTIDO, fiel a la especificación ---------- */

function makeLockManager() {
  let granted = null;   /* entrada que retiene el lock (aunque su callback espere) */
  const queue = [];     /* FIFO: solo la primera es concedible */
  function finish(e) { granted = null; e.resolve(); pump(); }
  function run(e) {
    try { Promise.resolve().then(e.cb).then(() => finish(e), () => finish(e)); }
    catch (err) { finish(e); }
  }
  function pump() {
    if (granted || !queue.length) return;
    const e = queue[0];
    if (e.ctl && e.ctl.frozen) return;   /* congelada: conserva su posición y el lock */
    queue.shift();
    granted = e;
    setTimeout(() => {
      /* si la pestaña se congeló tras la concesión, el callback no corre y el
         lock SIGUE retenido (la congelación no lo libera) */
      if (e.ctl && e.ctl.frozen) return;
      run(e);
    }, 0);
  }
  return {
    request(name, cb, ctl) { return new Promise((resolve) => { queue.push({ cb, resolve, ctl }); pump(); }); },
    waiting() { return queue.length; },
    busy() { return !!granted; },
    /* al descongelar, el lock concedido puede por fin ejecutarse */
    resume() {
      const e = granted;
      if (e && !(e.ctl && e.ctl.frozen)) setTimeout(() => { if (!(e.ctl && e.ctl.frozen)) run(e); }, 0);
      else pump();
    }
  };
}

/* ---------- una pestaña = un contexto JS con los módulos reales ---------- */

function makeTab(bus, opts) {
  const o = opts || {};
  const listeners = {};
  const profileWrites = [];
  const profileReads = [];
  let heldReads = [];
  let holding = false;
  let failMarkerWrites = false;
  const cloudProfiles = Object.assign({}, o.cloudProfiles || {});
  const ctl = { frozen: false };
  const manager = o.manager || null;
  const mode = o.locks === undefined ? 'spec' : o.locks;

  const store = {
    get(k, fallback = null) {
      const raw = bus.ls.get(PREFIX + k);
      if (raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(k, v) {
      if (failMarkerWrites && k === 'liveOwner') return false;  /* simula cuota agotada */
      try { bus.write(tab, PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    remove(k) { bus.write(tab, PREFIX + k, null); }
  };

  const localStorageView = {
    getItem: (k) => (bus.ls.has(k) ? bus.ls.get(k) : null),
    setItem: (k, v) => bus.write(tab, k, String(v)),
    removeItem: (k) => bus.write(tab, k, null),
    get length() { return bus.ls.size; },
    key: (i) => ([...bus.ls.keys()][i] === undefined ? null : [...bus.ls.keys()][i])
  };

  function chain(table) {
    let mode2 = null, payload = null, uid = null;
    function readNow() {
      if (table === 'profiles') profileReads.push(uid);
      const result = { data: Object.prototype.hasOwnProperty.call(cloudProfiles, uid) ? cloudProfiles[uid] : null, error: null };
      if (holding && table === 'profiles') return new Promise((res) => { heldReads.push(() => res(result)); });
      return result;
    }
    function term() {
      if (mode2 === 'update') { profileWrites.push({ uid, payload }); return { data: null, error: null }; }
      return { data: [], error: null };
    }
    const self = {
      select() { mode2 = mode2 || 'select'; return self; },
      update(p) { mode2 = 'update'; payload = p; return self; },
      upsert(p) { if (table === 'profiles') profileWrites.push({ uid: null, payload: p }); return Promise.resolve({ data: null, error: null }); },
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

  let locks = null;
  if (mode === 'spec') locks = { request: (name, cb) => manager.request(name, cb, ctl) };
  else if (mode === 'none') locks = null;
  else if (mode === 'reject') locks = { request: () => Promise.reject(new Error('lock rechazado (mock)')) };
  else if (mode === 'throw') locks = { request: () => { throw new Error('locks roto (mock)'); } };

  const g = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage: localStorageView,
    navigator: locks ? { locks } : {},
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).slice().forEach((fn) => fn(ev)); return true; },
    setTimeout, clearTimeout
  };
  g.window = g;
  g.SMR_DATA = {
    curriculums: CUR,
    tests: [{ id: 't-t1', questions: [{ q: 'A', options: ['a1', 'a2'], correct: 0 }, { q: 'B', options: ['b1', 'b2'], correct: 1 }] }]
  };

  const progress = {
    data: progressWith({}),
    save() { store.set('progress', this.data); },
    recordTest() {}, recordStudySession() {}, logActivity() {},
    toggleCompleted() { return true; }, isCompleted() { return false; },
    dropSrs() {}, scheduleSrs() {}, touchStreak() { return true; }
  };

  g.SMR = { store, progress, cloud: sb, cloudAvailable: true, esc: (v) => String(v), icon: () => '' };
  new Function('window', 'globalThis', srcSrs)(g, g, g);
  if (g.SMR.srs && g.SMR.srs.buildIndex) g.SMR.srs.buildIndex();

  new Function('window', 'globalThis', srcProfile)(g, g, g);
  new Function('window', 'globalThis', srcCloudProfile)(g, g, g);
  new Function('window', 'globalThis', srcProgress)(g, g, g);

  progress.data = Object.assign(progressWith({}), store.get('progress', null) || {});

  const tab = {
    g, store, progress, bus, ctl,
    name: o.name || 'tab',
    writes: profileWrites,
    reads: profileReads,
    writesTo(uid) { return profileWrites.filter((w) => w.uid === uid); },
    holdReads() { holding = true; },
    releaseReads() { holding = false; const h = heldReads; heldReads = []; h.forEach((f) => f()); },
    freeze() { ctl.frozen = true; },
    thaw() { ctl.frozen = false; if (manager) manager.resume(); },
    failMarkerWrites(v) { failMarkerWrites = !!v; },
    /* la exclusión puede APARECER o DESAPARECER en tiempo de ejecución
       (navegador antiguo, extensión, bfcache): se modela explícitamente */
    enableLocks() { g.navigator.locks = { request: (name, cb) => manager.request(name, cb, ctl) }; },
    disableLocks() { delete g.navigator.locks; },
    deliver(key, newValue, oldValue) {
      (listeners.storage || []).slice().forEach((fn) => fn({ type: 'storage', key, newValue, oldValue }));
    },
    auth(u) { g.dispatchEvent({ type: 'smr:authchange', detail: { user: u } }); },
    marker() { const m = store.get('liveOwner', null); return m && (typeof m === 'string' ? m : m.owner); },
    rawMarker() { const raw = bus.ls.get(PREFIX + 'liveOwner'); return raw === undefined ? null : raw; },
    live(key, fallback = null) { return store.get(key, fallback); },
    snapshot(owner) { return store.get('progressByOwner:' + owner, null); },
    session() { return g.SMR.cloudSession || null; },
    owner() { const s = this.session(); return s ? s.owner() : null; },
    token() { const s = this.session(); return s ? s.token() : null; },
    isCurrent(t) { const s = this.session(); return s ? s.isCurrent(t) : false; }
  };
  bus.tabs.push(tab);
  return tab;
}

function twoTabs(opts) {
  const o = opts || {};
  const bus = makeBus();
  const manager = makeLockManager();
  (o.seed || []).forEach(([k, v]) => bus.seed(k, v));
  const t1 = makeTab(bus, Object.assign({ name: 't1', manager }, o.t1 || {}));
  const t2 = makeTab(bus, Object.assign({ name: 't2', manager }, o.t2 || {}));
  return { bus, t1, t2, manager };
}

function seedDevice(extra) {
  return [
    [PREFIX + 'liveOwner', JSON.stringify({ owner: UID_A, v: 1 })],
    [PREFIX + 'studentProfile', JSON.stringify(PROFILE_A)],
    [PREFIX + 'progress', JSON.stringify(progressWith({ srs: { [CARD]: { level: 1, due: 3 } } }))],
    [PREFIX + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({}), studentProfile: PROFILE_A }, savedAt: 1, v: 1 })],
    [PREFIX + 'progressByOwner:' + UID_B, JSON.stringify({ slot: { progress: progressWith({}), studentProfile: PROFILE_B }, savedAt: 2, v: 1 })],
    [PREFIX + 'progressByOwner:' + UID_C, JSON.stringify({ slot: { progress: progressWith({}), studentProfile: PROFILE_C }, savedAt: 3, v: 1 })]
  ].concat(extra || []);
}

/* Dispositivo de VISITANTE con contenido vivo: la transición a una cuenta DEBE
   archivarlo. Es el caso en el que una transición sin exclusión corrompe slots. */
function seedGuestDevice(extra) {
  return [
    [PREFIX + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 })],
    [PREFIX + 'progress', JSON.stringify(progressWith({ completed: { 'r-vis': 7 } }))],
    [PREFIX + 'studentProfile', JSON.stringify(PROFILE_A)],
    [PREFIX + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-A': 1 } }), studentProfile: PROFILE_A }, savedAt: 1, v: 1 })],
    [PREFIX + 'progressByOwner:' + UID_B, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-B': 1 } }), studentProfile: PROFILE_B }, savedAt: 2, v: 1 })]
  ].concat(extra || []);
}

const CASES = [];
function test(name, fn) { CASES.push({ name: name, fn: fn }); }

/* ---------------------------------------------------------------
   Caso A / C: operación de perfil de A EN VUELO en la pestaña 1; la
   pestaña 2 cambia el dispositivo a B; llega la respuesta tardía.
   --------------------------------------------------------------- */
test('A/C: respuesta remota tardía de A tras un cambio de cuenta en otra pestaña', async () => {
  const seed = seedDevice();
  seed[1] = [PREFIX + 'studentProfile', JSON.stringify({ community: 'aaa', academicYear: '2026-2027' })];
  const { t1, t2 } = twoTabs({
    seed: seed,
    t1: { cloudProfiles: { [UID_A]: { community: 'aaa', course: 1, academic_year: '2026-2027', curriculum_id: 'aaa' } } }
  });

  t1.holdReads();
  t1.auth(user(UID_A));
  await flush();
  await flush();
  assert(t1.reads.indexOf(UID_A) !== -1, 'la prueba es real: hay lectura cloud de A en vuelo');
  const tokenA = t1.token();
  assert(tokenA && tokenA.owner === UID_A, 'la pestaña 1 capturó un token de A');

  t2.auth(user(UID_B));
  await flush();
  assert(t2.marker() === UID_B, 'el marcador persistido pasa a B');
  assert((t2.live('studentProfile') || {}).community === 'bbb', 'el slot vivo es el de B');

  t1.writes.length = 0;
  t1.releaseReads();
  await flush(20);

  const live = t1.live('studentProfile');
  assert(live && live.community === 'bbb',
    'el slot vivo de B quedó sobrescrito por datos de A: ' + JSON.stringify(live));
  assert(t1.isCurrent(tokenA) === false, 'el token de A se invalida aunque el cambio lo hiciera otra pestaña');
  t1.writes.forEach((w) => assert(!(w.payload && w.payload.community === 'aaa'),
    'escritura con datos de A tras el cambio: ' + JSON.stringify(w)));
});

/* ---------------------------------------------------------------
   Caso A (dirección contraria): pestaña obsoleta con push diferido.
   --------------------------------------------------------------- */
test('A: push diferido de una pestaña obsoleta no escribe en la fila de la otra cuenta', async () => {
  const { t1, t2 } = twoTabs({ seed: seedDevice() });

  t1.auth(user(UID_A));
  await flush();
  assert(t1.owner() === UID_A, 'la pestaña 1 trabaja como A');

  t2.auth(user(UID_B));
  await flush();
  assert(t2.marker() === UID_B, 'el marcador es de B');

  t1.writes.length = 0;
  t1.g.SMR.profile.save({ course: 1 });
  await sleep(1100);
  await flush(20);

  const cross = t1.writes.filter((w) => w.uid === UID_A && w.payload && w.payload.community === 'bbb');
  assert(cross.length === 0, 'la pestaña obsoleta escribió el perfil de B en la fila de A: ' + JSON.stringify(cross));
  assert(t1.writes.filter((w) => w.payload).length === 0,
    'con el slot ajeno no debe escribirse el perfil: ' + JSON.stringify(t1.writes));
});

/* ---------------------------------------------------------------
   Caso B (conforme a la especificación): dos transiciones
   concurrentes desde el mismo estado. La cola FIFO de Web Locks
   aplica en orden de PETICIÓN = orden de decisión; gana la última
   solicitada, y el marcador y el slot quedan de acuerdo.
   --------------------------------------------------------------- */
test('B: dos transiciones concurrentes se aplican en orden de petición y gana la última', async () => {
  const { t1, t2 } = twoTabs({ seed: seedDevice() });

  /* Las DOS deciden cambiar de cuenta casi a la vez; la pestaña 1 primero. */
  t1.auth(user(UID_B));
  t2.auth(user(UID_C));

  await flush(20);

  assert(t1.marker() === UID_C,
    'debe ganar la última petición (C): ' + t1.marker());
  const liveEnd = t1.live('studentProfile');
  assert(liveEnd && liveEnd.community === 'ccc', 'el slot vivo debe ser el del dueño ganador: ' + JSON.stringify(liveEnd));
  assert(t1.owner() === t1.marker(), 'el contrato y el marcador deben coincidir');
  assert(t1.snapshot(UID_C) && t1.snapshot(UID_C).slot, 'el ganador tiene snapshot completo');

  /* Ninguna cuenta pierde su contenido. */
  assert(t1.snapshot(UID_A) && t1.snapshot(UID_A).slot.studentProfile
    && t1.snapshot(UID_A).slot.studentProfile.community === 'aaa',
    'el contenido de A debe quedar archivado bajo A');
});

/* ---------------------------------------------------------------
   Caso B2: una petición POSTERIOR no puede adelantar a una anterior
   mientras esa pestaña está congelada reteniendo el lock.
   --------------------------------------------------------------- */
test('B2: una transición posterior no puede adelantar a la congelada en el lock', async () => {
  const { t1, t2 } = twoTabs({ seed: seedDevice() });

  t1.auth(user(UID_B));      /* la pestaña 1 pide el lock primero… */
  t1.freeze();               /* …y se congela antes de ejecutar su transición */

  t2.auth(user(UID_C));      /* la pestaña 2 decide DESPUÉS */
  await flush(20);

  assert(t1.marker() === UID_A,
    'mientras la primera está congelada, la posterior NO debe haber transicionado: ' + t1.marker());

  t1.thaw();                 /* la pestaña 1 se reanuda: su lock se ejecuta… */
  await flush(30);           /* …y después la petición de la pestaña 2 */

  assert(t1.marker() === UID_C,
    'tras reanudar, debe acabar ganando la última petición (C): ' + t1.marker());
  const live = t1.live('studentProfile');
  assert(live && live.community === 'ccc', 'el slot vivo debe ser el de C: ' + JSON.stringify(live));
  assert(t1.owner() === t1.marker(), 'el contrato y el marcador deben coincidir');
});

/* Sin exclusión garantizada ninguna transición puede archivar ni
   restaurar el slot compartido. Los casos siguientes comprueban los motivos
   de fallo y la recuperación sin perder ni atribuir contenido a otro dueño. */

/* D1: la API no existe, la petición se rechaza o lanza. */
for (const mode of ['none', 'reject', 'throw']) {
  test('D1/' + mode + ': sin exclusión la transición NO se ejecuta y el slot queda intacto', async () => {
    const { t1 } = twoTabs({ seed: seedGuestDevice(), t1: { locks: mode } });

    t1.auth(user(UID_A));
    await flush(20);

    assert(t1.marker() === '__guest__',
      'el marcador NO debe moverse sin exclusión (' + mode + '): ' + t1.marker());
    assert(t1.snapshot('__guest__') === null, 'no se archiva NADA sin exclusión (' + mode + ')');
    const live = t1.live('progress');
    assert(live && live.resources.completed['r-vis'] === 7,
      'el contenido vivo queda exactamente como estaba (' + mode + '): ' + JSON.stringify(live));
    assert(t1.snapshot(UID_A) && t1.snapshot(UID_A).savedAt === 1,
      'el slot archivado del dueño no se reescribe (' + mode + ')');
    assert(t1.session().transitionPending() === true,
      'estado observable: la transición queda DIFERIDA (' + mode + ')');
    assert(t1.session().owner() === '__guest__',
      'el contrato sigue anunciando al dueño real (' + mode + '): ' + t1.session().owner());
  });
}

/* D2: mientras está diferida NO se escribe nada (sincronización bloqueada). */
test('D2: con la transición diferida no se escribe (sincronización bloqueada)', async () => {
  const { t1 } = twoTabs({ seed: seedGuestDevice(), t1: { locks: 'none' } });

  t1.auth(user(UID_A));
  await flush(20);
  assert(t1.session().transitionPending() === true, 'la transición está diferida');

  t1.writes.length = 0;
  t1.g.SMR.profile.save({ course: 1 });
  await sleep(1100);
  await flush(20);

  assert(t1.writes.length === 0,
    'no debe escribirse el perfil con la transición diferida: ' + JSON.stringify(t1.writes));
});

/* D3: dos pestañas sin exclusión: ninguna transiciona. */
test('D3: dos pestañas que cambian de cuenta sin exclusión: ninguna transiciona', async () => {
  const { t1, t2 } = twoTabs({ seed: seedGuestDevice(), t1: { locks: 'none' }, t2: { locks: 'none' } });

  t1.auth(user(UID_A));
  t2.auth(user(UID_B));
  await flush(30);

  assert(t1.marker() === '__guest__' && t2.marker() === '__guest__',
    'el marcador compartido no se mueve: ' + t1.marker() + ' / ' + t2.marker());
  assert(t1.snapshot('__guest__') === null, 'ninguna pestaña archiva el slot compartido');
  assert(t1.snapshot(UID_A).savedAt === 1 && t1.snapshot(UID_B).savedAt === 2,
    'los slots por dueño no se reescriben');
  const live = t1.live('progress');
  assert(live && live.resources.completed['r-vis'] === 7 && !live.resources.completed['r-A'] && !live.resources.completed['r-B'],
    'el slot vivo sigue siendo el del visitante, sin mezcla: ' + JSON.stringify(live.resources.completed));
  assert(t1.session().transitionPending() === true && t2.session().transitionPending() === true,
    'ambas quedan diferidas');
});

/* D4: la exclusión VUELVE → el reintento completa la transición sin perder nada. */
test('D4: el reintento completa la transición cuando vuelve la exclusión', async () => {
  const { t1 } = twoTabs({ seed: seedGuestDevice(), t1: { locks: 'none' } });

  t1.auth(user(UID_A));
  await flush(20);
  assert(t1.session().transitionPending() === true, 'queda diferida');

  t1.enableLocks();          /* vuelve Web Locks */
  await sleep(700);          /* backoff del primer reintento: 500 ms */
  await flush(20);

  assert(t1.marker() === UID_A, 'tras recuperar la exclusión el marcador es de A: ' + t1.marker());
  assert(t1.session().owner() === UID_A, 'el contrato anuncia A');
  assert(t1.session().transitionPending() === false, 'ya no hay transición pendiente');
  const g = t1.snapshot('__guest__');
  assert(g && g.slot && g.slot.progress && g.slot.progress.resources.completed['r-vis'] === 7,
    'el contenido del visitante quedó custodiado íntegro (no se perdió): ' + JSON.stringify(g));
  assert(t1.snapshot(UID_A) && t1.snapshot(UID_A).savedAt === 1,
    'el slot del dueño que entra no se corrompe');
});

/* D5: una decisión NUEVA cancela el trabajo antiguo (no se reactiva). */
test('D5: una decisión nueva cancela el trabajo antiguo de la transición diferida', async () => {
  const { t1 } = twoTabs({ seed: seedGuestDevice(), t1: { locks: 'none' } });

  t1.auth(user(UID_A));                 /* decisión 1: queda diferida */
  await flush(20);
  assert(t1.session().transitionPending() === true, 'la decisión de A queda diferida');

  t1.auth(null);                        /* decisión 2: logout (otra decisión) */
  await flush(20);

  t1.enableLocks();
  await sleep(700);
  await flush(20);

  assert(t1.marker() === '__guest__',
    'debe aplicarse la ÚLTIMA decisión, no la antigua: ' + t1.marker());
  assert(t1.session().owner() === '__guest__', 'el contrato anuncia la última decisión');
  assert(t1.session().transitionPending() === false, 'la última decisión ya se aplicó');
  assert(t1.snapshot(UID_A) && t1.snapshot(UID_A).savedAt === 1,
    'el trabajo antiguo NO se reactivó ni reescribió el slot de A');
});

/* D6: A → B diferida y RECUPERADA: ni A ni B pierden datos. */
test('D6: A → B diferida y recuperada sin perder datos de A ni de B', async () => {
  const seed = [
    [PREFIX + 'liveOwner', JSON.stringify({ owner: UID_A, v: 1 })],
    [PREFIX + 'progress', JSON.stringify(progressWith({ completed: { 'r-A-live': 1 } }))],
    [PREFIX + 'studentProfile', JSON.stringify(PROFILE_A)],
    [PREFIX + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-A': 1 } }), studentProfile: PROFILE_A }, savedAt: 1, v: 1 })],
    [PREFIX + 'progressByOwner:' + UID_B, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-B': 1 } }), studentProfile: PROFILE_B }, savedAt: 2, v: 1 })]
  ];
  const { t1 } = twoTabs({ seed: seed, t1: { locks: 'none' } });

  t1.auth(user(UID_B));
  await flush(20);
  assert(t1.marker() === UID_A, 'sin exclusión el dispositivo sigue en A: ' + t1.marker());
  assert((t1.live('progress').resources.completed || {})['r-A-live'] === 1,
    'el contenido vivo de A sigue intacto: ' + JSON.stringify(t1.live('progress').resources.completed));
  assert(t1.snapshot(UID_A).savedAt === 1, 'el slot archivado de A no se reescribe sin exclusión');
  assert(t1.session().transitionPending() === true, 'la transición a B queda diferida');

  t1.enableLocks();
  await sleep(700);
  await flush(20);

  assert(t1.marker() === UID_B, 'al recuperar la exclusión el dispositivo pasa a B: ' + t1.marker());
  const sA = t1.snapshot(UID_A);
  assert(sA && sA.slot.progress.resources.completed['r-A-live'] === 1,
    'lo que A tenía VIVO quedó archivado bajo A (sin pérdida): ' + JSON.stringify(sA && sA.slot.progress.resources.completed));
  const sB = t1.snapshot(UID_B);
  assert(sB && sB.slot.progress.resources.completed['r-B'] === 1 && sB.savedAt === 2,
    'el slot de B no se corrompe: ' + JSON.stringify(sB));
  const live = t1.live('progress');
  assert(live && live.resources.completed['r-B'] === 1 && !live.resources.completed['r-A-live'],
    'el slot vivo queda con el estado propio de B (sin mezcla): ' + JSON.stringify(live.resources.completed));
});

/* D7: re-login de la MISMA cuenta (p. ej. tras un 401) con la exclusión ausente. */
test('D7: re-login de la misma cuenta con la exclusión ausente: diferida, sin duplicar', async () => {
  const { t1 } = twoTabs({ seed: seedGuestDevice(), t1: { locks: 'none' } });

  t1.auth(user(UID_A));
  await flush(20);
  t1.auth(user(UID_A));
  await flush(20);

  assert(t1.marker() === '__guest__' && t1.snapshot('__guest__') === null,
    'sin exclusión no se aplica ninguna de las dos');
  assert(t1.session().transitionPending() === true, 'sigue diferida');

  t1.enableLocks();
  await sleep(700);
  await flush(20);

  assert(t1.marker() === UID_A, 'al volver la exclusión se aplica: ' + t1.marker());
  assert(t1.session().transitionPending() === false, 'y deja de estar pendiente');
  const g = t1.snapshot('__guest__');
  assert(g && g.slot.progress.resources.completed['r-vis'] === 7,
    'el visitante se archivó UNA vez y bien: ' + JSON.stringify(g && g.slot.progress.resources.completed));
});

/* ---------------------------------------------------------------
   Caso E: A → B → C concurrentes. Ningún `finally` antiguo borra
   el estado de una transición posterior.
   --------------------------------------------------------------- */
test('E: A → B → C con peticiones encoladas: ningún finally borra la siguiente', async () => {
  const { t1 } = twoTabs({ seed: seedDevice() });

  t1.auth(user(UID_A));
  await flush(20);
  assert(t1.owner() === UID_A, 'la pestaña 1 está en A');

  /* Dos decisiones seguidas en la MISMA pestaña, encoladas en el lock. */
  t1.auth(user(UID_B));
  t1.auth(user(UID_C));
  await flush(30);

  assert(t1.marker() === UID_C, 'el marcador debe quedar en la última decisión (C): ' + t1.marker());
  assert(t1.owner() === UID_C, 'el contrato debe anunciar el dueño real: ' + t1.owner());
  const live = t1.live('studentProfile');
  assert(live && live.community === 'ccc', 'el slot vivo debe ser el de C: ' + JSON.stringify(live));
  const sC = t1.snapshot(UID_C);
  assert(sC && sC.slot && sC.slot.studentProfile && sC.slot.studentProfile.community === 'ccc',
    'el slot de C debe quedar completo');
});

/* ---------------------------------------------------------------
   Compatibilidad: marcadores ANTIGUOS (uid suelto o {owner,v:1} sin
   campos nuevos) siguen funcionando. No se introduce ningún campo.
   --------------------------------------------------------------- */
test('compatibilidad: marcador antiguo (uid suelto) y {owner,v:1}', async () => {
  /* a) uid suelto (formato más antiguo) */
  {
    const bus = makeBus();
    bus.seed(PREFIX + 'liveOwner', JSON.stringify(UID_A));
    bus.seed(PREFIX + 'studentProfile', JSON.stringify(PROFILE_A));
    bus.seed(PREFIX + 'progressByOwner:' + UID_B, JSON.stringify({ slot: { studentProfile: PROFILE_B }, savedAt: 2, v: 1 }));
    const manager = makeLockManager();
    const t1 = makeTab(bus, { name: 't1', manager });
    const t2 = makeTab(bus, { name: 't2', manager });
    t1.auth(user(UID_A));
    await flush(20);
    assert(t1.owner() === UID_A, 'un marcador de uid suelto se interpreta bien');
    t2.auth(user(UID_B));
    await flush(20);
    assert(t2.marker() === UID_B, 'la transición desde un marcador antiguo funciona');
    assert(t1.owner() === UID_B, 'el contrato ve el nuevo dueño');
    assert((t2.live('studentProfile') || {}).community === 'bbb', 'el slot queda con el dueño nuevo');
  }
  /* b) {owner, v:1} sin campos nuevos: es EXACTAMENTE lo que sigue escribiendo el módulo */
  {
    const { t1 } = twoTabs({ seed: seedDevice() });
    t1.auth(user(UID_B));
    await flush(20);
    const raw = t1.rawMarker();
    assert(/^\{.*\}$/.test(raw), 'el marcador se sigue guardando como objeto: ' + raw);
    const parsed = JSON.parse(raw);
    assert(parsed.owner === UID_B, 'el marcador mantiene el campo owner');
    assert(Object.keys(parsed).sort().join(',') === 'owner,v',
      'NO se ha añadido ningún campo nuevo al marcador: ' + raw);
  }
});

/* ---------------------------------------------------------------
   Primitiva: sin exclusión, una "secuencia monotónica" NO ordena.
   Esto justifica por qué NO se ha adoptado un seq persistido.
   (Demostración de primitiva, no de comportamiento del módulo.)
   --------------------------------------------------------------- */
test('primitiva: sin exclusión dos pestañas derivan la MISMA secuencia', async () => {
  const ls = new Map();
  ls.set('m', JSON.stringify({ owner: 'uid-A', seq: 5 }));
  const nextSeq = () => JSON.parse(ls.get('m')).seq + 1;
  const write = (owner, seq) => ls.set('m', JSON.stringify({ owner, seq }));

  /* Interleaving POSIBLE entre dos pestañas: cada una lee antes de que la otra
     escriba (localStorage no tiene transacción ni compare-and-swap). */
  const t1Seq = nextSeq();
  const t2Seq = nextSeq();
  write('uid-B', t1Seq);
  write('uid-C', t2Seq);

  assert(t1Seq === t2Seq && t1Seq === 6,
    'ambas pestañas derivan la MISMA secuencia: la guarda de "soy el último" no puede distinguirlas');
});

/* ---------------------------------------------------------------
   Caso de persistencia: si falla la escritura del MARCADOR, ¿puede
   una pestaña obsoleta seguir escribiendo con datos del dueño nuevo?
   Se MIDE el comportamiento real.
   --------------------------------------------------------------- */
test('persistencia: fallo al escribir el marcador (se mide el comportamiento real)', async () => {
  const { t1, t2 } = twoTabs({
    seed: seedDevice(),
    t2: { cloudProfiles: {} }
  });

  t1.auth(user(UID_A));
  await flush(20);
  assert(t1.owner() === UID_A, 'la pestaña 1 trabaja como A');

  /* La pestaña 2 cambia a B, pero su escritura del marcador FALLA (cuota). */
  t2.failMarkerWrites(true);
  t2.auth(user(UID_B));
  await flush(20);

  const markerAfter = t1.marker();
  const liveAfter = t1.live('studentProfile');
  console.error('      [medición] marcador tras el fallo: ' + markerAfter
    + ' | slot vivo: ' + JSON.stringify(liveAfter));

  /* ¿Puede la pestaña obsoleta (cree ser A) subir el contenido de B? */
  t1.writes.length = 0;
  t1.g.SMR.profile.save({ course: 1 });
  await sleep(1100);
  await flush(20);
  const cross = t1.writes.filter((w) => w.uid === UID_A && w.payload && w.payload.community === 'bbb');
  console.error('      [medición] escrituras cruzadas detectadas: ' + JSON.stringify(cross));
  assert(cross.length === 0,
    'FALLO REAL: con el marcador sin actualizar, una pestaña obsoleta escribió el perfil de B en la fila de A');
});

/* Recuperación de colas, esperas y sincronización sin bloqueos permanentes. */

/* F1: al volver la exclusión se reanuda la SINCRONIZACIÓN y ninguna
   espera registrada durante la transición diferida se queda colgada. */
test('F1: al volver la exclusión se reanuda la sincronización sin esperas colgadas', async () => {
  const colaA = { attempts: [{ test_id: 't-t1', mode: 'test', correct: 1, total: 2, created_at: 111 }], sessions: [], activity: [], wrongEvents: [], streakDays: [], failed: {} };
  const { t1 } = twoTabs({
    seed: seedGuestDevice([[PREFIX + 'progressSyncQueue:' + UID_A, JSON.stringify(colaA)]]),
    t1: { locks: 'none' }
  });

  t1.auth(user(UID_A));
  /* La espera se registra MIENTRAS la transición está en vuelo: si el fallo de
     lock la dejara pendiente, el consumidor quedaría bloqueado para siempre. */
  const enVuelo = await Promise.race([t1.session().awaitSlot(UID_A), sleep(60).then(() => 'COLGADA')]);
  assert(enVuelo === false,
    'la espera debe resolverse en false al diferirse la transición, no colgarse: ' + enVuelo);
  await flush(20);
  assert(t1.session().transitionPending() === true, 'la transición queda diferida');
  const q1 = t1.live('progressSyncQueue:' + UID_A);
  assert(q1 && q1.attempts.length === 1,
    'no se envía NADA mientras la transición está diferida: ' + JSON.stringify(q1));

  t1.enableLocks();
  await sleep(700);
  await flush(40);

  assert(t1.marker() === UID_A, 'al recuperar la exclusión el marcador es de A: ' + t1.marker());
  assert(t1.session().transitionPending() === false, 'ya no queda transición pendiente');
  const q2 = t1.live('progressSyncQueue:' + UID_A);
  assert(!q2 || !(q2.attempts || []).length,
    'la cola debe drenarse tras recuperar la exclusión (sin bloqueo permanente): ' + JSON.stringify(q2));
  const despues = await Promise.race([t1.session().awaitSlot(UID_A), sleep(60).then(() => 'COLGADA')]);
  assert(despues === true, 'y la espera del dueño ya es válida: ' + despues);
});

/* F2: visitante/offline sigue funcionando (local intacto, sin escrituras). */
test('F2: visitante/offline sin exclusión: nada se archiva y el guardado local sigue', async () => {
  const { t1 } = twoTabs({ seed: seedGuestDevice(), t1: { locks: 'none' } });

  t1.auth(null);
  await flush(20);

  assert(t1.marker() === '__guest__', 'el marcador sigue en el visitante: ' + t1.marker());
  assert(t1.snapshot('__guest__') === null, 'no se archiva ni se restaura nada');

  t1.progress.data.resources.completed['r-offline'] = 1;
  t1.g.SMR.progress.save();
  const live = t1.live('progress');
  assert(live && live.resources.completed['r-offline'] === 1,
    'el guardado LOCAL debe seguir funcionando offline: ' + JSON.stringify(live && live.resources.completed));
  assert(t1.writes.length === 0, 'sin sesión no se escribe nada cloud: ' + JSON.stringify(t1.writes));
});

/* F3: dos pestañas con decisiones distintas y solo una con exclusión. */
test('F3: dos pestañas con decisiones distintas: solo la que tiene exclusión transiciona', async () => {
  const { t1, t2 } = twoTabs({ seed: seedGuestDevice(), t1: { locks: 'none' }, t2: {} });

  t1.auth(user(UID_A));
  t2.auth(user(UID_B));
  await flush(30);

  assert(t2.marker() === UID_B, 'la pestaña CON exclusión aplica su decisión: ' + t2.marker());
  assert((t2.live('progress').resources.completed || {})['r-B'] === 1,
    'el slot vivo es el de B: ' + JSON.stringify(t2.live('progress').resources.completed));
  const g = t2.snapshot('__guest__');
  assert(g && g.slot.progress.resources.completed['r-vis'] === 7,
    'el contenido del visitante quedó custodiado por la transición CON exclusión');
  assert(t1.marker() === UID_B, 'el marcador es compartido: ' + t1.marker());
  assert(t1.session().owner() === UID_B,
    'la pestaña diferida describe el slot real (leyendo el marcador): ' + t1.session().owner());
  assert(t1.session().transitionPending() === true, 'y sigue diferida');

  t1.writes.length = 0;
  t1.g.SMR.profile.save({ course: 1 });
  await sleep(1100);
  await flush(20);
  assert(t1.writes.length === 0,
    'la pestaña diferida no escribe con un propietario no validado: ' + JSON.stringify(t1.writes));
});

(async function main() {
  console.log('multi-tab-owner.test.js');
  for (const c of CASES) {
    try { await c.fn(); record(c.name); }
    catch (e) {
      failed++;
      console.error('  ✗ ' + c.name + ' → ' + e.message);
      if (process.env.TRACE === '1') console.error(e.stack);
    }
  }
  console.log('\n' + passed + ' ok, ' + failed + ' fallidos');
  if (failed) process.exitCode = 1;
})();

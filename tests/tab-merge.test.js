'use strict';

/* =====================================================================
   SMR Hub — Fase 8.5.13: FUSIÓN de escrituras del slot vivo entre PESTAÑAS
   y comportamiento del lock de transición.

   FIDELIDAD:
   - Las primitivas de fusión NO se reimplementan: se EXTRAEN del código real
     (js/app.js): el objeto SMR.store (get/set/remove/written/writeMerged), las
     constantes de límite y los helpers (deepEqual, slotMergeArray, slotMergeObject,
     slotMergeValue, slotApply), además
     del par `otherSlot()` + `save()` reales del objeto de progreso. Cada
     pestaña evalúa su propia copia (su propio `written`), como en el navegador.
   - Se carga una instancia REAL de js/cloud-progress.js por pestaña sobre un
     localStorage simulado compartido y un bus 'storage' que solo avisa a la
     otra pestaña. Supabase es un mock explícito: esta suite no toca la red.
   - No hay fusión con la nube en juego aquí: eso lo cubren las suites de
     PostgreSQL y la verificación en navegador real.

   LIMITACIÓN DECLARADA: este arnés es un solo proceso. Puede reproducir el
   ORDEN de las escrituras (incluida una escritura obsoleta posterior), pero no
   el interleaving real entre dos procesos del navegador a nivel de setItem.
   Las pruebas del lock verifican el orden y el estado final, no una carrera
   física entre procesos.

   Fase E: node tests/tab-merge.test.js            → 13/13
     auto-verificación del runner:  TAB_MERGE_SELFTEST=1 node tests/tab-merge.test.js → exit 1
     módulo pre-8.5.13 (demuestra que la suite detecta el defecto):
       sed 's/SMR.store.writeMerged(PROGRESS_KEY, this.data, this.otherSlot())/SMR.store.set(PROGRESS_KEY, this.data)/' \
         js/app.js > /tmp/app-prefix.js
       SMR_APP=/tmp/app-prefix.js node tests/tab-merge.test.js
   ===================================================================== */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

const APP_PATH = process.env.SMR_APP || 'js/app.js';
const MODULE_PATH = process.env.SMR_MODULE || 'js/cloud-progress.js';
const srcApp = fs.readFileSync(APP_PATH, 'utf8');
const srcCloud = fs.readFileSync(MODULE_PATH, 'utf8');
const srcSrs = fs.readFileSync('js/srs.js', 'utf8');

function slice(from, to) {
  const a = srcApp.indexOf(from);
  const b = srcApp.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error('marcador no encontrado en ' + APP_PATH + ': ' + from);
  return srcApp.slice(a, b);
}

/* código REAL de app.js, sin reescribir */
const STORE_SRC = slice("const STORE_PREFIX = 'smrhub:';", '/* ---------- Iconos (');
const MERGE_SRC = slice('const ACTIVITY_LIMIT = 40;', 'function dayKey(');
const SAVE_SRC = slice('  otherSlot() { return SMR.store.get', '  /* --- Recursos --- */');

const UID_A = 'uid-A';
const UID_B = 'uid-B';
const PREFIX = 'smrhub:';
const P = PREFIX;

function progressWith(o) {
  const p = o || {};
  return {
    resources: { viewed: {}, completed: p.completed || {}, selfAssessment: {} },
    tests: { best: p.best || {}, last: {}, history: p.history || [], wrong: {}, srs: p.srs || {}, srsLegacy: p.srsLegacy || {} },
    cases: { solved: {} }, studySessions: [], studyMinutes: 0, activity: p.activity || [],
    streak: { lastDay: null, count: 0 }, v: 4
  };
}

/* ---------- bus compartido: localStorage + eventos 'storage' ---------- */

function makeBus() {
  const ls = new Map(); /* claves COMPLETAS, con prefijo smrhub: */
  const tabs = [];
  const queue = [];
  let scheduled = false;
  function flushSoon() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; queue.splice(0).forEach((fn) => fn()); }, 0);
  }
  return {
    ls, tabs,
    write(writer, fullKey, value) {
      const oldRaw = ls.has(fullKey) ? ls.get(fullKey) : null;
      if (value === null) ls.delete(fullKey); else ls.set(fullKey, value);
      tabs.forEach((t) => { if (t !== writer) queue.push(() => t.deliver(fullKey, value, oldRaw)); });
      flushSoon();
    },
    seed(fullKey, value) { if (value === null) ls.delete(fullKey); else ls.set(fullKey, value); }
  };
}

/* ---------- lock de prueba con orden FIFO controlable ---------- */

function makeLocks(opts) {
  const o = opts || {};
  const state = { held: false, queue: [], grants: 0 };
  function release() { const next = state.queue.shift(); if (next) next(); }
  return {
    state,
    request(name, cb) {
      if (o.rejectSync) throw new Error('request() lanzó síncronamente');
      if (o.reject) return Promise.reject(new Error(o.reject));
      return new Promise((resolve, reject) => {
        const go = () => {
          state.held = true;
          state.grants++;
          Promise.resolve().then(() => cb()).then(
            (v) => { state.held = false; release(); resolve(v); },
            (e) => { state.held = false; release(); reject(e); }
          );
        };
        if (state.held) state.queue.push(go); else go();
      });
    }
  };
}

/* ---------- una pestaña = un contexto JS con el código real ---------- */

function makeTab(bus, opts) {
  const o = opts || {};
  const listeners = {};
  let cloudCalls = 0;
  let tab = null;

  const lsView = {
    getItem: (k) => (bus.ls.has(k) ? bus.ls.get(k) : null),
    setItem: (k, v) => bus.write(tab, k, String(v)),
    removeItem: (k) => bus.write(tab, k, null),
    get length() { return bus.ls.size; },
    key: (i) => ([...bus.ls.keys()][i] === undefined ? null : [...bus.ls.keys()][i])
  };

  const rpcCalls = [];
  function chain() {
    const self = {
      select() { return self; }, eq() { return self; }, order() { return self; }, limit() { return self; },
      in() { return self; }, neq() { return self; }, is() { return self; }, single() { return self; },
      update() { return self; }, upsert() { return Promise.resolve({ data: null, error: null }); },
      insert() { return Promise.resolve({ data: null, error: null }); },
      delete() { return Promise.resolve({ data: null, error: null }); },
      then(resolve) { resolve({ data: [], error: null }); }, catch() { return self; }
    };
    return self;
  }
  const sb = {
    from() { cloudCalls++; return chain(); },
    rpc(name, params) { cloudCalls++; rpcCalls.push({ name, params }); return Promise.resolve({ data: { applied: 0, invalid: 0 }, error: null }); }
  };

  const g = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage: lsView,
    navigator: o.locks ? { locks: o.locks } : {},
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).slice().forEach((fn) => fn(ev)); return true; },
    setTimeout, clearTimeout
  };
  g.window = g;
  g.SMR_DATA = { tests: [{ id: 't-t1', questions: [{ q: 'A', options: ['a1', 'a2'], correct: 0 }, { q: 'B', options: ['b1', 'b2'], correct: 1 }] }] };
  g.SMR = { cloud: sb, cloudAvailable: true, esc: (v) => String(v), icon: () => '' };

  /* primitivas reales de app.js (store + fusión) en el contexto de ESTA pestaña */
  new Function('SMR', 'localStorage', 'window', 'globalThis', STORE_SRC + '\n' + MERGE_SRC)(g.SMR, lsView, g, g);
  const store = g.SMR.store;

  /* objeto de progreso: otherSlot() y save() son el texto real de app.js */
  const progress = new Function('SMR', 'PROGRESS_KEY', 'return { ' + SAVE_SRC + ' };')(g.SMR, 'progress');

  /* resto de la API del progreso (equivalente a app.js, sin DOM).
     La lectura inicial deja la base de fusión, igual que app.js. */
  progress.data = Object.assign(progressWith({}), (store.readBase ? store.readBase('progress') : store.get('progress', null)) || {});
  /* igual que app.js: su lectura inicial deja la base de fusión de las claves
     que se guardan con writeMerged */
  ['favorites', 'settings'].forEach((k) => { if (store.readBase) store.readBase(k); });
  progress.isCompleted = function (id) { return Object.prototype.hasOwnProperty.call(this.data.resources.completed, id); };
  progress.toggleCompleted = function (id) {
    if (!id) return false;
    const done = this.isCompleted(id);
    if (done) delete this.data.resources.completed[id];
    else this.data.resources.completed[id] = Date.now();
    this.save();
    return !done;
  };
  progress.dropSrs = function (testId, qIndex) {
    const srsMod = g.SMR && g.SMR.srs;
    const key = srsMod && srsMod.idOf(testId, qIndex);
    if (key) delete this.data.tests.srs[key];
    this.save();
  };
  progress.scheduleSrs = function (testId, qIndex, rate) {
    const key = (g.SMR.srs && g.SMR.srs.idOf(testId, qIndex)) || (testId + ':' + qIndex);
    this.data.tests.srs[key] = { level: rate, due: Date.now() + 86400000 };
    this.save();
  };
  progress.touchStreak = function () { return true; };
  progress.logActivity = function (type, label, meta) {
    this.data.activity.push({ type, label, meta: meta || '', ts: Date.now() });
    this.save();
  };

  g.SMR.progress = progress;

  new Function('window', 'globalThis', srcSrs)(g, g, g);
  g.SMR.srs.buildIndex();

  if (!o.noCloud) new Function('window', 'globalThis', srcCloud)(g, g, g);

  tab = {
    g, store, progress, bus,
    get cloudCalls() { return cloudCalls; },
    deliver(key, newValue, oldValue) {
      (listeners.storage || []).slice().forEach((fn) => fn({ type: 'storage', key, newValue, oldValue }));
    },
    auth(user) { g.dispatchEvent({ type: 'smr:authchange', detail: { user } }); },
    marker() { const m = store.get('liveOwner', null); return m && (typeof m === 'string' ? m : m.owner); },
    live(key, fallback = null) { return store.get(key, fallback); },
    snapshot(owner) { return store.get('progressByOwner:' + owner, null); },
    slotCompleted() { const p = store.get('progress', null) || {}; return Object.keys(((p.resources || {}).completed) || {}); },
    slotSrs() { const p = store.get('progress', null) || {}; return Object.keys(((p.tests || {}).srs) || {}); },
    memCompleted() { return Object.keys(progress.data.resources.completed); }
  };
  bus.tabs.push(tab);
  return tab;
}

function twoTabs(opts) {
  const o = opts || {};
  const bus = makeBus();
  (o.seed || []).forEach(([k, v]) => bus.seed(k, v));
  const t1 = makeTab(bus, Object.assign({}, o.tab1, o.locks1 ? { locks: o.locks1 } : {}));
  const t2 = makeTab(bus, Object.assign({}, o.tab2, o.locks2 ? { locks: o.locks2 } : {}));
  return { bus, t1, t2 };
}
/* recarga: dos pestañas nuevas sobre el MISMO bus (arranque desde el slot) */
function reload(bus, opts) {
  const o = opts || {};
  bus.tabs.length = 0;
  const t1 = makeTab(bus, o.tab1 || {});
  const t2 = makeTab(bus, o.tab2 || {});
  return { bus, t1, t2 };
}

function user(id) { return { id, email: id + '@test' }; }
function flush(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 6); i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}
function seedAccount(bus, uid, progressObj) {
  bus.seed(P + 'liveOwner', JSON.stringify({ owner: uid, v: 1 }));
  bus.seed(P + 'progress', JSON.stringify(progressObj));
  bus.seed(P + 'progressByOwner:' + uid, JSON.stringify({ slot: { progress: progressObj }, savedAt: 1, v: 1 }));
}

/* ---------- casos ---------- */

(async function main() {
  const QA = (() => { const t = makeTab(makeBus(), { noCloud: true }); return t.g.SMR.srs.idOf('t-t1', 0); })();
  const QB = (() => { const t = makeTab(makeBus(), { noCloud: true }); return t.g.SMR.srs.idOf('t-t1', 1); })();

  /* 1. DOS RECURSOS INDEPENDIENTES: ninguno desaparece. */
  await (async () => {
    const bus = makeBus();
    seedAccount(bus, UID_A, progressWith({ completed: { 'r-1': 1 } }));
    const { t1, t2 } = reload(bus);
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    assert(t1.slotCompleted().indexOf('r-1') !== -1, 'la cuenta arranca con su slot: ' + JSON.stringify(t1.slotCompleted()));
    t1.progress.toggleCompleted('r-2');          /* pestaña 1 escribe */
    await flush();
    t2.progress.toggleCompleted('r-3');          /* pestaña 2, copia leída ANTES, escribe después */
    await flush();
    const live = bus.ls.get(P + 'progress');
    const liveIds = t1.slotCompleted();
    assert(liveIds.indexOf('r-2') !== -1, 'el recurso de la pestaña 1 sobrevive: ' + JSON.stringify(liveIds));
    assert(liveIds.indexOf('r-3') !== -1, 'el recurso de la pestaña 2 está presente: ' + JSON.stringify(liveIds));
    assert(liveIds.indexOf('r-1') !== -1, 'el recurso previo sigue: ' + JSON.stringify(liveIds));
    assert(t2.memCompleted().indexOf('r-2') !== -1, 'la pestaña 2 ve el cambio de la 1 en memoria: ' + JSON.stringify(t2.memCompleted()));
    /* la copia en memoria de la pestaña 1 no se refresca sola (no hay evento
       'storage' para 'progress'), pero su siguiente guardado debe conservar lo
       que escribió la 2: es la invariante que importa. */
    t1.progress.logActivity('recurso', 'nueva actividad');
    await flush();
    assert(t1.memCompleted().indexOf('r-3') !== -1, 'la pestaña 1 adopta el cambio de la 2 en su siguiente escritura: ' + JSON.stringify(t1.memCompleted()));
    assert(t1.slotCompleted().indexOf('r-2') !== -1, 'el cambio de la 1 sigue tras la escritura de la 1: ' + JSON.stringify(t1.slotCompleted()));
    assert(live && JSON.parse(live).resources.completed['r-2'] !== undefined, 'el slot compartido contiene los dos cambios');
  })();
  record('dos pestañas, misma cuenta: dos recursos independientes sobreviven (sin pérdida de actualización)');

  /* 2. HISTORIAL ACUMULATIVO: se une por entrada, ordenado y con el límite real. */
  await (async () => {
    const bus = makeBus();
    seedAccount(bus, UID_A, progressWith({}));
    const { t1, t2 } = reload(bus);
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    t1.progress.data.tests.history.push({ ts: 100, mode: 'test', testId: 't-t1', score: 50 });
    t1.progress.save();
    await flush();
    t2.progress.data.tests.history.push({ ts: 200, mode: 'test', testId: 't-t1', score: 80 });
    t2.progress.save();
    await flush();
    const hist = (bus.ls.get(P + 'progress') && JSON.parse(bus.ls.get(P + 'progress')).tests.history) || [];
    assert(hist.length === 2, 'las dos entradas de historial conviven: ' + JSON.stringify(hist));
    assert(hist[0].ts === 100 && hist[1].ts === 200, 'ordenado por ts');
    /* límite real (HISTORY_LIMIT = 60 extraído de app.js) */
    const many = [];
    for (let i = 1; i <= 60; i++) many.push({ ts: i, mode: 'test', testId: 't-t1', score: i });
    bus.seed(P + 'progress', JSON.stringify(progressWith({ history: many })));
    bus.seed(P + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ history: many }) }, savedAt: 2, v: 1 }));
    const r = reload(bus);
    r.t1.auth(user(UID_A));
    r.t2.auth(user(UID_A));
    await flush();
    r.t2.progress.data.tests.history.push({ ts: 61, mode: 'test', testId: 't-t1', score: 61 });
    r.t2.progress.save();
    await flush();
    r.t1.progress.data.tests.history.push({ ts: 62, mode: 'test', testId: 't-t1', score: 62 });
    r.t1.progress.save();
    await flush();
    const capped = JSON.parse(bus.ls.get(P + 'progress')).tests.history;
    assert(capped.length === 60, 'la lista se mantiene en el límite real (60): ' + capped.length);
    assert(capped[capped.length - 1].ts === 62, 'la entrada más reciente sobrevive al límite: ' + JSON.stringify(capped[capped.length - 1]));
    assert(capped[capped.length - 2].ts === 61, 'y la de la otra pestaña también: ' + JSON.stringify(capped[capped.length - 2]));
  })();
  record('historial acumulativo: se unen las entradas de las dos pestañas (orden + límite 60)');

  /* 3. BORRADO PROPIO + ALTA AJENA: el borrado no resucita ni bloquea lo demás. */
  await (async () => {
    const bus = makeBus();
    seedAccount(bus, UID_A, progressWith({ completed: { 'r-1': 1, 'r-2': 2 } }));
    const { t1, t2 } = reload(bus);
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    t1.progress.toggleCompleted('r-1');   /* la pestaña 1 DESmarca r-1 */
    await flush();
    t2.progress.toggleCompleted('r-3');   /* la pestaña 2 marca r-3 (copia antigua) */
    await flush();
    const ids = t1.slotCompleted();
    assert(ids.indexOf('r-1') === -1, 'el borrado de la pestaña 1 se conserva: ' + JSON.stringify(ids));
    assert(ids.indexOf('r-2') !== -1 && ids.indexOf('r-3') !== -1, 'lo demás intacto: ' + JSON.stringify(ids));
  })();
  record('borrado propio conservado a la vez que el alta de la otra pestaña');

  /* 4. SRS: tarjeta borrada aquí no vuelve; la tarjeta nueva de la otra pestaña llega. */
  await (async () => {
    const bus = makeBus();
    seedAccount(bus, UID_A, progressWith({ srs: { [QA]: { level: 1, due: 5 } } }));
    const { t1, t2 } = reload(bus);
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    t1.g.SMR.progress.dropSrs('t-t1', 0);                  /* borra QA (marca pending) */
    await flush();
    t2.progress.data.tests.srs[QB] = { level: 2, due: 9 }; /* tarjeta nueva en la otra pestaña */
    t2.progress.save();
    await flush();
    const keys = t1.slotSrs();
    assert(keys.indexOf(QA) === -1, 'la tarjeta borrada no reaparece por el save ajeno: ' + JSON.stringify(keys));
    assert(keys.indexOf(QB) !== -1, 'la tarjeta nueva de la otra pestaña sí está: ' + JSON.stringify(keys));
    assert(t2.store.get('progressSyncSrsClears', null)[QA] === 'pending', 'el tombstone local de la pestaña 1 sigue marcado');
  })();
  record('SRS: el tombstone local no se pierde y la tarjeta legítima de la otra pestaña no desaparece');

  /* 5. VISITANTE / sin módulo de nube: la fusión protege igual. */
  await (async () => {
    const bus = makeBus();
    bus.seed(P + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 }));
    bus.seed(P + 'progress', JSON.stringify(progressWith({ completed: { 'r-vis': 1 } })));
    const t1 = makeTab(bus, { noCloud: true });
    const t2 = makeTab(bus, { noCloud: true });
    t1.progress.toggleCompleted('r-v1');
    t2.progress.toggleCompleted('r-v2');
    await flush();
    const ids = t1.slotCompleted();
    assert(ids.indexOf('r-vis') !== -1 && ids.indexOf('r-v1') !== -1 && ids.indexOf('r-v2') !== -1,
      'sin sesión (offline) los dos cambios de visitante conviven: ' + JSON.stringify(ids));
    assert(t1.store.get('progress', null).resources.completed['r-v2'] !== undefined, 'el slot del visitante queda fusionado');
  })();
  record('modo visitante/offline (sin módulo de nube): la fusión entre pestañas también funciona');

  /* 6. PROPIETARIOS: el slot vivo de otra cuenta no se fusiona con la copia local. */
  await (async () => {
    const bus = makeBus();
    /* arranque real: el dispositivo tiene contenido de VISITANTE y una cuenta A
       con snapshot; las dos pestañas cargan con la memoria del visitante. */
    bus.seed(P + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 }));
    bus.seed(P + 'progress', JSON.stringify(progressWith({ completed: { 'r-vis': 1 } })));
    bus.seed(P + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-A': 1 } }) }, savedAt: 1, v: 1 }));
    const { t1, t2 } = reload(bus);
    t1.auth(user(UID_A));   /* la pestaña 1 entra en la cuenta A */
    await flush(10);
    assert(t1.slotCompleted().indexOf('r-A') !== -1, 'la pestaña 1 trabaja con el contenido de su cuenta');
    assert(t1.marker() === UID_A, 'el marcador persistido pasa a la cuenta');
    /* la pestaña 2 sigue con la memoria del visitante: NO debe fusionar A */
    assert(t2.progress.data.resources.completed['r-vis'] !== undefined, 'la pestaña 2 conserva SU copia de visitante');
    assert(t2.progress.otherSlot() === null, 'con otro dueño en el slot, la pestaña no fusiona');
    t2.progress.data.resources.completed['r-vis2'] = 2;
    t2.progress.save();
    await flush(10);
    const ids = t1.slotCompleted();
    assert(ids.indexOf('r-A') === -1, 'A no queda mezclado en la escritura del visitante: ' + JSON.stringify(ids));
    assert(ids.indexOf('r-vis2') !== -1, 'la escritura del visitante sí se aplica: ' + JSON.stringify(ids));
    const snapA = t1.snapshot(UID_A);
    assert(snapA && snapA.slot.progress.resources.completed['r-A'] !== undefined,
      'el contenido de A sigue custodiado en su snapshot');
    assert(Object.keys(snapA.slot.progress.resources.completed).indexOf('r-vis2') === -1,
      'el snapshot de A no se contamina con el contenido del visitante');
    assert(t2.snapshot('__guest__') && t2.snapshot('__guest__').slot.progress.resources.completed['r-vis'] !== undefined,
      'y el contenido del visitante está custodiado bajo __guest__');
    /* ahora guarda la pestaña de la CUENTA: el contenido del visitante no debe
       fusionarse dentro del slot de la cuenta (mezcla de propietarios) */
    assert(t1.progress.otherSlot() === null,
      'tras la escritura de la pestaña retrasada, la cuenta tampoco fusiona');
    t1.progress.data.resources.completed['r-A2'] = 3;
    t1.progress.save();
    await flush(10);
    const idsCuenta = t1.slotCompleted();
    assert(idsCuenta.indexOf('r-A2') !== -1, 'la escritura de la cuenta se aplica: ' + JSON.stringify(idsCuenta));
    assert(idsCuenta.indexOf('r-vis') === -1 && idsCuenta.indexOf('r-vis2') === -1,
      'la cuenta NO absorbe el contenido del visitante: ' + JSON.stringify(idsCuenta));
    assert(idsCuenta.indexOf('r-A') !== -1, 'y conserva su propio contenido: ' + JSON.stringify(idsCuenta));
  })();
  record('propietarios: no se fusionan datos de dos dueños (cada snapshot queda íntegro)');

  /* 7. ESCRITURA OBSOLETA + CASI SIMULTÁNEA + RECARGA. */
  await (async () => {
    const bus = makeBus();
    seedAccount(bus, UID_A, progressWith({ completed: { 'r-1': 1 } }));
    const { t1, t2 } = reload(bus);
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    t2.progress.toggleCompleted('r-old');  /* la pestaña 2 escribe primero */
    await flush();
    t1.progress.toggleCompleted('r-new');  /* y la 1 después, con copia ya vieja */
    await flush();
    /* casi simultánea: dos saves en el mismo tick */
    t1.progress.data.tests.best['t-t1'] = 70; t1.progress.save();
    t2.progress.data.studyMinutes = 15; t2.progress.save();
    await flush();
    const afterWrites = JSON.parse(bus.ls.get(P + 'progress'));
    assert(Object.keys(afterWrites.resources.completed).length === 3, 'las tres marcas conviven: ' + JSON.stringify(Object.keys(afterWrites.resources.completed)));
    assert(afterWrites.tests.best['t-t1'] === 70, 'la mejor puntuación de la pestaña 1 sobrevive');
    assert(afterWrites.studyMinutes === 15, 'los minutos de la pestaña 2 sobreviven');
    /* recarga de las dos pestañas */
    const r = reload(bus);
    r.t1.auth(user(UID_A));
    r.t2.auth(user(UID_A));
    await flush();
    r.t1.progress.data.resources.completed['r-reload'] = 5;
    r.t1.progress.save();
    await flush();
    const finalIds = r.t2.slotCompleted();
    assert(finalIds.length === 4 && finalIds.indexOf('r-reload') !== -1,
      'tras recargar las dos pestañas no se pierde nada: ' + JSON.stringify(finalIds));
    assert(JSON.parse(bus.ls.get(P + 'progress')).studyMinutes === 15 && JSON.parse(bus.ls.get(P + 'progress')).tests.best['t-t1'] === 70,
      'los valores independientes sobreviven a la recarga');
  })();
  record('escritura obsoleta, guardados en el mismo tick y recarga de las dos pestañas: sin pérdidas');

  /* 8. AJUSTES/FAVORITOS (fuera del slot per-owner): también se fusionan. */
  await (async () => {
    const bus = makeBus();
    const t1 = makeTab(bus, { noCloud: true });
    const t2 = makeTab(bus, { noCloud: true });
    t1.store.writeMerged('favorites', { recurso: { 'r-1': true } });
    t2.store.writeMerged('favorites', { test: { 't-t1': true } });
    await flush();
    const favs = t1.store.get('favorites', null);
    assert(favs.recurso && favs.recurso['r-1'], 'el favorito de la pestaña 1 sobrevive');
    assert(favs.test && favs.test['t-t1'], 'el favorito de la pestaña 2 está: ' + JSON.stringify(favs));
  })();
  record('favoritos (clave de dispositivo): los cambios de las dos pestañas conviven');

  /* 9. FORMATO HEREDADO: las claves existentes no se pierden. */
  await (async () => {
    const bus = makeBus();
    const legacy = progressWith({ srsLegacy: { 't-t1:0': { level: 1, due: 3 } } });
    legacy.best = { 't-t1': 40 };                 /* formato anterior */
    legacy.extraDesconocido = { a: 1 };           /* clave que este código no conoce */
    seedAccount(bus, UID_A, legacy);
    const { t1, t2 } = reload(bus);
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    t1.progress.toggleCompleted('r-1');
    await flush();
    t2.progress.toggleCompleted('r-2');
    await flush();
    const p = JSON.parse(bus.ls.get(P + 'progress'));
    assert(p.tests.srsLegacy['t-t1:0'] && p.tests.srsLegacy['t-t1:0'].level === 1, 'srsLegacy heredado intacto');
    assert(p.best['t-t1'] === 40, 'clave heredada `best` intacta');
    assert(p.extraDesconocido && p.extraDesconocido.a === 1, 'clave desconocida intacta');
    assert(Object.keys(p.resources.completed).length === 2, 'y los cambios nuevos se aplican: ' + JSON.stringify(Object.keys(p.resources.completed)));
  })();
  record('datos heredados y claves desconocidas se conservan durante la fusión');

  /* 10. LOCK ADQUIRIDO: la transición corre en exclusión y deja estado consistente. */
  await (async () => {
    const locks1 = makeLocks();
    const bus = makeBus();
    bus.seed(P + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 }));
    bus.seed(P + 'progress', JSON.stringify(progressWith({ completed: { 'r-vis': 1 } })));
    const t1 = makeTab(bus, { locks: locks1 });
    const t2 = makeTab(bus, {});
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    assert(locks1.state.grants >= 1, 'el lock se pidió y se concedió: ' + locks1.state.grants);
    assert(t1.marker() === UID_A && t2.marker() === UID_A, 'el marcador queda en la cuenta que entra');
    const snapG = t1.snapshot('__guest__');
    assert(snapG && snapG.slot.progress.resources.completed['r-vis'] !== undefined, 'el contenido del visitante queda custodiado');
    /* política 8.3 vigente: el dispositivo que inicia sesión ADOPTA el
       contenido del visitante (no se pierde ni se duplica) */
    const liveIds = t1.live('progress') ? Object.keys(t1.live('progress').resources.completed) : [];
    assert(liveIds.indexOf('r-vis') !== -1, 'el contenido del visitante se adopta en el slot vivo: ' + JSON.stringify(liveIds));
    assert(t1.snapshot('__guest__').slot.progress.resources.completed['r-vis'] !== undefined, 'y además queda custodiado');
  })();
  record('lock adquirido: la transición se ejecuta en exclusión y el slot/marcador quedan consistentes');

  /* 11. DOS TRANSICIONES CONCURRENTES (lock sano): cada una en exclusión, estado final sin mezcla. */
  await (async () => {
    const locks1 = makeLocks();
    const locks2 = makeLocks();
    const bus = makeBus();
    seedAccount(bus, UID_A, progressWith({ completed: { 'r-A': 1 } }));
    bus.seed(P + 'progressByOwner:__guest__', JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-vis': 9 } }) }, savedAt: 1, v: 1 }));
    const { t1, t2 } = reload(bus, { tab1: { locks: locks1 }, tab2: { locks: locks2 } });
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    /* a la vez, desde pestañas distintas: la 1 cambia de cuenta (A→B) y la 2 cierra sesión */
    t1.auth(user(UID_B));
    t2.auth(null);
    await flush(10);
    assert(locks1.state.grants >= 1 && locks2.state.grants >= 1,
      'cada transición pasó por su propio lock: ' + locks1.state.grants + '/' + locks2.state.grants);
    assert(locks1.state.held === false && locks2.state.held === false, 'ningún lock queda retenido al terminar');
    assert(t1.marker() === '__guest__' && t2.marker() === '__guest__',
      'el marcador final es el de la ÚLTIMA transición (serializadas), no una mezcla: ' + t1.marker());
    const snapA = t1.snapshot(UID_A);
    assert(snapA && snapA.slot.progress.resources.completed['r-A'] !== undefined, 'el contenido de A quedó custodiado en su snapshot');
    const liveIds = t1.slotCompleted();
    assert(liveIds.indexOf('r-A') === -1, 'el slot vivo no mezcla el contenido de A con el del visitante: ' + JSON.stringify(liveIds));
    const snapG = t1.snapshot('__guest__');
    assert(snapG && JSON.stringify(snapG.slot.progress.resources.completed) === JSON.stringify(t1.live('progress').resources.completed),
      'el slot vivo coincide EXACTAMENTE con el snapshot del visitante');
    const snapB = t1.snapshot(UID_B);
    assert(snapB === null || !snapB.slot.progress || Object.keys(snapB.slot.progress.resources.completed).length === 0 ||
      Object.keys(snapB.slot.progress.resources.completed).indexOf('r-A') === -1, 'B no heredó el contenido de A');
  })();
  record('dos transiciones concurrentes: serializadas por el lock, sin mezclar propietarios');

  /* 12. LOCK RECHAZADO: se ejecuta sin exclusión (8.5.12) y se observa el estado. */
  await (async () => {
    const rejected = makeLocks({ reject: 'documento no activo (bfcache)' });
    const bus = makeBus();
    bus.seed(P + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 }));
    bus.seed(P + 'progress', JSON.stringify(progressWith({ completed: { 'r-vis': 7 } })));
    const t1 = makeTab(bus, { locks: rejected });
    const t2 = makeTab(bus, {});
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    const snapG = t1.snapshot('__guest__');
    assert(snapG && snapG.slot.progress.resources.completed['r-vis'] !== undefined,
      'con el lock rechazado la transición custodia igualmente el contenido del visitante');
    assert(t1.marker() === UID_A && t2.marker() === UID_A, 'y el marcador queda en el dueño que entra');
    const liveIds12 = t1.live('progress') ? Object.keys(t1.live('progress').resources.completed) : [];
    assert(liveIds12.indexOf('r-vis') !== -1, 'el contenido del visitante no se pierde con el lock rechazado: ' + JSON.stringify(liveIds12));
  })();
  record('lock rechazado: la transición se ejecuta sin exclusión y no mezcla contenido entre dueños');

  /* 13. ERROR SÍNCRONO AL PEDIR EL LOCK: la transición no debe perderse. */
  await (async () => {
    const thrower = makeLocks({ rejectSync: true });
    const bus = makeBus();
    bus.seed(P + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 }));
    bus.seed(P + 'progress', JSON.stringify(progressWith({ completed: { 'r-vis': 3 } })));
    const t1 = makeTab(bus, { locks: thrower });
    let threw = null;
    try { t1.auth(user(UID_A)); } catch (e) { threw = e; }
    await flush();
    assert(threw === null, 'un error al PEDIR el lock no debe escapar al manejador de sesión: ' + (threw && threw.message));
    assert(t1.marker() === UID_A, 'la transición se ejecuta igual (no se pierde)');
    const snapG = t1.snapshot('__guest__');
    assert(snapG && snapG.slot.progress.resources.completed['r-vis'] !== undefined, 'y custodia el contenido del visitante');
  })();
  record('error síncrono al adquirir el lock: la transición no se pierde ni rompe el manejador');

  /* --- auto-verificación del runner --------------------------------- */
  if (process.env.TAB_MERGE_SELFTEST === '1') {
    await (async () => { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); })();
    record('auto-verificación (no debe llegar aquí)');
  }
})().catch((e) => { console.error('runner:', e && e.message); if (process.env.TAB_MERGE_TRACE === '1') console.error(e && e.stack); failed++; });

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log(`OK: ${passed}  FAIL: ${failed}  (app: ${APP_PATH}, módulo: ${MODULE_PATH})`);
  process.exitCode = failed > 0 ? 1 : 0;
});

'use strict';

/* =====================================================================
   SMR Hub — Fase 8.5.14: concurrencia de las MARCAS DE BORRADO PENDIENTES
   (smrhub:progressSyncSrsClears y smrhub:progressSyncClears).

   FIDELIDAD: se cargan DOS instancias REALES de js/cloud-progress.js (una por
   pestaña) sobre UN localStorage simulado compartido y un bus de eventos
   'storage' entregado SOLO a la otra pestaña. La RPC `merge_srs_cards` se
   PUEDE RETENER a voluntad: así el ciclo queda DENTRO del `await` (que en la
   realidad dura el viaje de red) y se puede interleaving desde la otra pestaña
   de forma determinista. Nada más se sustituye: los estados, las transiciones
   y los payloads son los del código de producción.

   LIMITACIÓN DECLARADA: un solo proceso no puede reproducir el interleaving
   FÍSICO entre dos procesos del navegador a nivel de setItem; este arnés fija
   el ORDEN (lectura → espera → escritura de la otra pestaña) que causa el
   daño. La reproducción con dos pestañas reales está en el informe de la fase.

   Fase E:
     node tests/srs-clears-race.test.js                     → 7/7, exit 0
     SRS_CLEARS_SELFTEST=1 node tests/srs-clears-race.test.js → exit 1
     SMR_MODULE=<copia pre-8.5.14> node tests/srs-clears-race.test.js → exit 1
       (la copia se genera con `node` desde js/cloud-progress.js: ver el
        informe de la fase 8.5.14)
   ===================================================================== */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

const MODULE_PATH = process.env.SMR_MODULE || 'js/cloud-progress.js';
const srcProgress = fs.readFileSync(MODULE_PATH, 'utf8');
const srcSrs = fs.readFileSync('js/srs.js', 'utf8');

const UID_A = 'uid-A';
const PREFIX = 'smrhub:';
const P = PREFIX;
const SRS_CLEARS_KEY = 'progressSyncSrsClears';
const CLEARS_KEY = 'progressSyncClears';

/* ---------- bus compartido: localStorage + eventos 'storage' ---------- */

function makeBus() {
  const ls = new Map();
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

function progressWith(o) {
  const p = o || {};
  return {
    resources: { viewed: {}, completed: p.completed || {}, selfAssessment: {} },
    tests: { best: {}, last: {}, history: [], wrong: {}, srs: p.srs || {}, srsLegacy: {} },
    cases: { solved: {} }, studySessions: [], studyMinutes: 0, activity: [],
    streak: { lastDay: null, count: 0 }, v: 4
  };
}

/* ---------- una pestaña = un contexto JS con el módulo real ---------- */

function makeTab(bus, opts) {
  const o = opts || {};
  const listeners = {};
  let tab = null;
  const rpcCalls = [];      /* log de RPC */
  const gate = { on: false, held: [] };  /* RPC retenidas: [{name, params, resolve, reject}] */
  const cloudRows = o.cloudRows || {};   /* filas que devuelve .from(tabla).select() */

  const store = {
    get(k, fallback = null) {
      const raw = bus.ls.get(PREFIX + k);
      if (raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(k, v) { try { bus.write(tab, PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    remove(k) { bus.write(tab, PREFIX + k, null); }
  };

  const lsView = {
    getItem: (k) => (bus.ls.has(k) ? bus.ls.get(k) : null),
    setItem: (k, v) => bus.write(tab, k, String(v)),
    removeItem: (k) => bus.write(tab, k, null),
    get length() { return bus.ls.size; },
    key: (i) => ([...bus.ls.keys()][i] === undefined ? null : [...bus.ls.keys()][i])
  };

  function chain(table) {
    const self = {
      select() { return self; }, eq() { return self; }, order() { return self; }, limit() { return self; },
      in() { return self; }, neq() { return self; }, is() { return self; }, single() { return self; },
      update() { return self; }, upsert() { return Promise.resolve({ data: null, error: null }); },
      insert() { return Promise.resolve({ data: null, error: null }); },
      delete() { return Promise.resolve({ data: null, error: null }); },
      then(resolve) { resolve({ data: (cloudRows[table] || []).slice(), error: null }); },
      catch() { return self; }
    };
    return self;
  }

  const sb = {
    from(table) { return chain(table); },
    rpc(name, params) {
      rpcCalls.push({ name, params });
      if (!gate.on || name !== 'merge_srs_cards') return Promise.resolve({ data: { applied: (params.p_cards || []).length, invalid: 0 }, error: null });
      return new Promise((resolve, reject) => { gate.held.push({ name, params, resolve, reject }); });
    }
  };

  const g = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage: lsView,
    /* 8.6.3: la transición exige exclusión (fail-closed); el arnés aporta un lock. */
    navigator: { locks: { request: (name, cb) => Promise.resolve().then(cb) } },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).slice().forEach((fn) => fn(ev)); return true; },
    setTimeout, clearTimeout
  };
  g.window = g;
  g.SMR_DATA = { tests: [{ id: 't-t1', questions: [
    { q: 'A', options: ['a1', 'a2'], correct: 0 },
    { q: 'B', options: ['b1', 'b2'], correct: 1 },
    { q: 'C', options: ['c1', 'c2'], correct: 0 }
  ] }] };
  g.SMR = { store, cloud: sb, cloudAvailable: true, esc: (v) => String(v), icon: () => '' };

  const progress = {
    data: progressWith({}),
    save() { store.set('progress', this.data); },
    isCompleted(id) { return Object.prototype.hasOwnProperty.call(this.data.resources.completed, id); },
    toggleCompleted(id) {
      const done = this.isCompleted(id);
      if (done) delete this.data.resources.completed[id];
      else this.data.resources.completed[id] = Date.now();
      this.save();
      return !done;
    },
    dropSrs(testId, qIndex) {
      const key = g.SMR.srs && g.SMR.srs.idOf(testId, qIndex);
      if (key) delete this.data.tests.srs[key];
      this.save();
    },
    scheduleSrs(testId, qIndex, rate) {
      const key = (g.SMR.srs && g.SMR.srs.idOf(testId, qIndex)) || (testId + ':' + qIndex);
      this.data.tests.srs[key] = { level: rate, due: Date.now() + 86400000 };
      this.save();
    },
    touchStreak() { return true; },
    logActivity() {}, recordTest() {}, recordStudySession() {}
  };
  g.SMR.progress = progress;

  new Function('window', 'globalThis', srcSrs)(g, g, g);
  g.SMR.srs.buildIndex();
  new Function('window', 'globalThis', srcProgress)(g, g, g);

  progress.data = Object.assign(progressWith({}), store.get('progress', null) || {});

  tab = {
    g, store, progress, bus, gate, rpcCalls,
    deliver(key, newValue, oldValue) {
      (listeners.storage || []).slice().forEach((fn) => fn({ type: 'storage', key, newValue, oldValue }));
    },
    auth(user) { g.dispatchEvent({ type: 'smr:authchange', detail: { user } }); },
    marker() { const m = store.get('liveOwner', null); return m && (typeof m === 'string' ? m : m.owner); },
    live(key, fallback = null) { return store.get(key, fallback); },
    snapshot(owner) { return store.get('progressByOwner:' + owner, null); },
    marks() { return store.get(SRS_CLEARS_KEY, null); },
    resourceClears() { return store.get(CLEARS_KEY, null); },
    srsLocal() { return Object.keys((this.progress.data.tests || {}).srs || {}); },
    /* RPC retenidas */
    gateOn() { gate.on = true; },
    gateOff() { gate.on = false; },
    held() { return gate.held; },
    release(i) { const h = gate.held[i || 0]; if (!h) throw new Error('no hay RPC retenida'); h.resolve({ data: { applied: (h.params.p_cards || []).length, invalid: 0 }, error: null }); gate.held.splice(gate.held.indexOf(h), 1); },
    fail(i) { const h = gate.held[i || 0]; if (!h) throw new Error('no hay RPC retenida'); h.reject(new Error('sonda: error de red')); gate.held.splice(gate.held.indexOf(h), 1); },
    srsPayloads() { return rpcCalls.filter((c) => c.name === 'merge_srs_cards').map((c) => (c.params.p_cards || []).map((x) => (x.deleted ? 'D:' : 'L:') + x.question_key)); }
  };
  bus.tabs.push(tab);
  return tab;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function flush(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 6); i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}
async function waitFor(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < (ms || 4000)) {
    if (fn()) return true;
    await sleep(40);
  }
  return false;
}
function user(id) { return { id, email: id + '@test' }; }

/* cuenta con slot: marcador + slot vivo + snapshot del dueño (con sus marcas) */
function seedAccount(bus, uid, marks, progressObj, extraSlot) {
  const slot = Object.assign({ progress: progressObj }, extraSlot || {});
  if (marks !== undefined) slot[SRS_CLEARS_KEY] = marks;
  bus.seed(P + 'liveOwner', JSON.stringify({ owner: uid, v: 1 }));
  bus.seed(P + 'progress', JSON.stringify(progressObj));
  /* las marcas viven en el slot VIVO del dispositivo (y también archivadas) */
  bus.seed(P + SRS_CLEARS_KEY, marks === undefined ? null : JSON.stringify(marks));
  Object.keys(extraSlot || {}).forEach((k) => { bus.seed(P + k, JSON.stringify(extraSlot[k])); });
  bus.seed(P + 'progressByOwner:' + uid, JSON.stringify({ slot, savedAt: 1, v: 1 }));
}

/* arranca un ciclo (un cambio real en el progreso dispara el push de estado) y
   espera a que quede DENTRO del await de la RPC de SRS */
let cycleN = 0;
async function startCycleInsideAwait(tab, ms) {
  tab.gateOn();
  tab.progress.toggleCompleted('r-ciclo-' + (++cycleN));
  const ok = await waitFor(() => tab.held().length > 0, ms || 8000);
  assert(ok, 'el ciclo no llegó a la RPC retenida (payload SRS)');
  return tab.held()[0];
}

/* ---------- casos ---------- */

(async function main() {
  const QA = (() => { const t = makeTab(makeBus(), {}); return t.g.SMR.srs.idOf('t-t1', 0); })();
  const QB = (() => { const t = makeTab(makeBus(), {}); return t.g.SMR.srs.idOf('t-t1', 1); })();
  const QC = (() => { const t = makeTab(makeBus(), {}); return t.g.SMR.srs.idOf('t-t1', 2); })();
  assert(QA && QB && QC && QA !== QB && QB !== QC && QA !== QC, 'claves SRS reales calculadas');

  /* 1. pending→known durante el await NO pierde la marca nueva de otra pestaña. */
  await (async () => {
    const bus = makeBus();
    /* QA está 'pending' y su tombstone se sube en este ciclo (→ hay RPC que
       retener); QC está 'pending' y la nube ya tiene su tombstone → el ciclo
       decide pending→known (una transición real que obligaba a reescribir el
       mapa entero). */
    seedAccount(bus, UID_A, { [QA]: 'pending', [QC]: 'pending' }, progressWith({}));
    const rows = { srs_cards: [] };             /* la nube aún no tiene el tombstone de QC */
    const t1 = makeTab(bus, { cloudRows: rows });
    const t2 = makeTab(bus, {});
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await sleep(400);

    /* el tombstone de QC aparece en la nube JUSTO antes del ciclo controlado:
       ese ciclo decidirá pending→known (y por tanto reescribía el mapa). */
    rows.srs_cards.push({ question_key: QC, deleted_at: 1, level: 1, due: 1 });
    await startCycleInsideAwait(t1);            /* t1 dentro del await con copia {QA:'pending'} */
    assert(t1.marks()[QA] === 'pending', 'la copia de t1 tiene la marca antes de esperar');

    /* la otra pestaña marca OTRA tarjeta justo durante la espera */
    t2.progress.dropSrs('t-t1', 1);             /* QB → 'pending' */
    await sleep(300);
    assert(t2.marks()[QB] === 'pending', 'la pestaña 2 dejó su marca pending');

    t1.release(0);                              /* resuelve la RPC de t1 */
    await sleep(400);

    const marks = t1.marks();
    assert(marks[QB] === 'pending', 'la marca de la pestaña 2 sobrevive a la escritura del ciclo de la 1: ' + JSON.stringify(marks));
    assert(marks[QC] === 'known', 'y la transición de la pestaña 1 (pending→known) sí se aplicó: ' + JSON.stringify(marks));
    assert(marks[QA] !== undefined, 'la marca propia de la pestaña 1 sigue presente: ' + JSON.stringify(marks));
  })();
  record('pending→known durante el await: la marca creada por la otra pestaña NO se pierde');

  /* 2. Consumir un 'revive' NO pisa un re-borrado posterior de otra pestaña. */
  await (async () => {
    const bus = makeBus();
    const cardQA = { level: 2, due: 5 };
    seedAccount(bus, UID_A, {}, progressWith({ srs: { [QA]: cardQA } }));
    const t1 = makeTab(bus, {});
    const t2 = makeTab(bus, {});
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await sleep(400);

    /* estado real producido por dropSrs y transición real pending→revive
       (scheduleSrs valora una pregunta borrada), con la RPC retenida para
       poder interleaving desde la otra pestaña */
    t1.store.set(SRS_CLEARS_KEY, { [QA]: 'pending' });
    t1.gateOn();
    t1.progress.scheduleSrs('t-t1', 0, 2);
    const ok2 = await waitFor(() => t1.held().length > 0, 8000);
    assert(ok2, 'el ciclo del revive llegó a la RPC');
    assert(t1.marks()[QA] === 'revive', 'pending → revive por el camino real (scheduleSrs): ' + JSON.stringify(t1.marks()));
    const held = t1.held()[0];
    assert(held.params.p_cards.some((c) => c.question_key === QA && c.revived === true),
      'el ciclo de la pestaña 1 sube el revive: ' + JSON.stringify(held.params.p_cards));

    /* durante la espera, la otra pestaña vuelve a borrar la MISMA tarjeta */
    t2.progress.dropSrs('t-t1', 0);
    await sleep(300);
    assert(t2.marks()[QA] === 'pending', 'la pestaña 2 re-marca pending');

    t1.release(0);
    await sleep(400);
    const marks = t1.marks();
    assert(marks[QA] === 'pending', 'el re-borrado de la pestaña 2 sobrevive al consumo del revive: ' + JSON.stringify(marks));
  })();
  record('consumo de revive: no pisa el re-borrado posterior de otra pestaña');

  /* 3. Cambio de propietario durante el await: nada de marcas ni progreso ajenos. */
  await (async () => {
    const bus = makeBus();
    bus.seed(P + 'progressByOwner:__guest__', JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-vis': 1 } }) }, savedAt: 1, v: 1 }));
    seedAccount(bus, UID_A, {}, progressWith({ completed: { 'r-A': 1 } }));
    const t1 = makeTab(bus, {});
    const t2 = makeTab(bus, {});
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await sleep(400);

    t1.progress.dropSrs('t-t1', 0);            /* QA → pending */
    await sleep(150);
    const held = await waitFor(() => t1.held().length > 0, 6000) ? t1.held()[0] : null;
    if (!held) { t1.gateOn(); await startCycleInsideAwait(t1); }

    /* las dos pestañas procesan el mismo logout durante la espera */
    t1.auth(null);
    t2.auth(null);
    await sleep(300);
    assert(t1.marker() === '__guest__', 'el slot vivo es del visitante tras el logout');

    t1.release(0);
    await sleep(400);
    const marks = t1.marks();
    const cuenta = t1.snapshot(UID_A);
    assert(marks === null || marks[QA] === undefined,
      'las marcas de la cuenta NO se escriben en la clave del visitante: ' + JSON.stringify(marks));
    assert(cuenta && (cuenta.slot[SRS_CLEARS_KEY] || {})[QA] === 'pending',
      'y la marca sigue custodiada en el snapshot de la cuenta: ' + JSON.stringify(cuenta && cuenta.slot[SRS_CLEARS_KEY]));
  })();
  record('cambio de propietario durante el await: sin contaminación cruzada (marcas archivadas con su dueño)');

  /* 4. Igual, pero la pestaña del ciclo NO procesa la transición (retrasada). */
  await (async () => {
    const bus = makeBus();
    bus.seed(P + 'progressByOwner:__guest__', JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-vis': 1 } }) }, savedAt: 1, v: 1 }));
    seedAccount(bus, UID_A, {}, progressWith({ completed: { 'r-A': 1 } }));
    const t1 = makeTab(bus, {});
    const t2 = makeTab(bus, {});
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await sleep(400);

    t1.progress.dropSrs('t-t1', 0);
    await sleep(150);
    t1.gateOn();
    if (!t1.held().length) await startCycleInsideAwait(t1);
    assert(t1.held().length > 0, 'la pestaña 1 está dentro del await');

    /* SOLO la pestaña 2 procesa el logout: la 1 queda retrasada (no lo sabe) */
    t2.auth(null);
    await sleep(300);
    assert(t1.marker() === '__guest__', 'el marcador compartido ya es del visitante');

    t1.release(0);
    await sleep(400);
    const marks = t1.marks();
    const cuenta = t1.snapshot(UID_A);
    assert(marks === null || marks[QA] === undefined,
      'la pestaña retrasada tampoco escribe sus marcas en el slot del visitante: ' + JSON.stringify(marks));
    assert(cuenta && (cuenta.slot[SRS_CLEARS_KEY] || {})[QA] === 'pending',
      'la marca sigue en el snapshot de la cuenta: ' + JSON.stringify(cuenta && cuenta.slot[SRS_CLEARS_KEY]));
  })();
  record('pestaña retrasada (no procesó la transición): tampoco contamina el slot del nuevo dueño');

  /* 5. Error de sincronización: las marcas pending se conservan y se reintentan. */
  await (async () => {
    const bus = makeBus();
    seedAccount(bus, UID_A, {}, progressWith({}));
    const t1 = makeTab(bus, {});
    t1.auth(user(UID_A));
    await sleep(400);

    t1.progress.dropSrs('t-t1', 0);             /* QA → pending (sin tarjeta local) */
    await sleep(120);
    assert(t1.marks()[QA] === 'pending', 'la marca queda pending tras el borrado: ' + JSON.stringify(t1.marks()));
    await startCycleInsideAwait(t1);            /* ciclo con la RPC retenida */
    t1.fail(0);                                 /* la RPC falla (red/backend) */
    await sleep(400);
    assert(t1.marks()[QA] === 'pending', 'la marca sigue pending tras el error: ' + JSON.stringify(t1.marks()));

    t1.gateOff();                               /* red de nuevo en pie */
    t1.progress.toggleCompleted('r-reintento'); /* cambio real → nuevo ciclo */
    const enviado = await waitFor(() => t1.srsPayloads().some((p) => p.indexOf('D:' + QA) !== -1), 6000);
    assert(enviado, 'el tombstone se reintenta y llega a la RPC: ' + JSON.stringify(t1.srsPayloads()));
    await sleep(400);
    assert(t1.marks()[QA] !== undefined, 'la marca no se consume antes de confirmar el tombstone');
  })();
  record('error de sincronización: las marcas pending se conservan y se reintentan (idempotente)');

  /* 6. Visitante/offline: sus marcas se custodian y NO se atribuyen a la cuenta
     que entra cuando el dispositivo ya tiene otra cuenta (sin adopción). */
  await (async () => {
    const bus = makeBus();
    bus.seed(P + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 }));
    bus.seed(P + 'progress', JSON.stringify(progressWith({ completed: { 'r-vis': 1 } })));
    /* el dispositivo ya tiene el slot de OTRA cuenta → no hay adopción del visitante */
    bus.seed(P + 'progressByOwner:uid-B', JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-B': 1 } }) }, savedAt: 1, v: 1 }));
    const t1 = makeTab(bus, {});
    const t2 = makeTab(bus, {});
    t2.progress.dropSrs('t-t1', 0);             /* visitante marca sin sesión (offline) */
    await sleep(200);
    assert(t2.marks()[QA] === 'pending', 'el visitante tiene su marca local: ' + JSON.stringify(t2.marks()));
    t1.auth(user(UID_A));                        /* otra pestaña entra en una cuenta */
    await sleep(400);
    const g = t1.snapshot('__guest__');
    assert(g && (g.slot[SRS_CLEARS_KEY] || {})[QA] === 'pending',
      'la marca del visitante queda custodiada bajo __guest__: ' + JSON.stringify(g && g.slot[SRS_CLEARS_KEY]));
    assert(t2.marks() === null || t2.marks()[QA] === undefined,
      'y no se atribuye a la cuenta que entra: ' + JSON.stringify(t2.marks()));
    assert(t2.srsLocal().indexOf(QA) === -1, 'la tarjeta borrada por el visitante no reaparece en la cuenta');
  })();
  record('visitante/offline: sus marcas se custodian y no se atribuyen a la cuenta que entra');

  /* 7. Caracterización: el ciclo NO reescribe el mapa no-SRS (no hay
     escritura diferida de smrhub:progressSyncClears: la marca la escribe el
     hook de toggleCompleted con lectura fresca y el ciclo solo la lee). */
  await (async () => {
    const bus = makeBus();
    seedAccount(bus, UID_A, {}, progressWith({}), { [CLEARS_KEY]: { 'r-1': 111 } });
    const t1 = makeTab(bus, {});
    t1.auth(user(UID_A));
    await sleep(400);
    t1.progress.toggleCompleted('r-2');   /* completa */
    t1.progress.toggleCompleted('r-2');   /* des-completa → marca de clear real */
    await sleep(2600);                    /* ciclo completo (push de estado) */
    const clears = t1.resourceClears();
    assert(clears && clears['r-1'] === 111, 'la marca no-SRS preexistente sigue intacta: ' + JSON.stringify(clears));
    assert(typeof clears['r-2'] === 'number', 'y la nueva marca está presente: ' + JSON.stringify(clears));
  })();
  record('caracterización: el ciclo no reescribe smrhub:progressSyncClears (sin escritura diferida)');

  /* 8. Tombstone descubierto SIN marca previa (lo borró otro dispositivo):
     el ciclo debe recordarlo como 'known' en vez de no escribir nada. La
     marca ausente NO se puede tratar como 'no hay transición': sin ella el
     dispositivo resucitaría la tarjeta en un push posterior y perdería la
     detección del revive. */
  await (async () => {
    const bus = makeBus();
    seedAccount(bus, UID_A, {}, progressWith({ srs: { [QC]: { level: 3, due: 9e7 } } }));
    const t1 = makeTab(bus, { cloudRows: { srs_cards: [
      { user_id: UID_A, question_key: QC, level: 3, due: 9e7, client_updated_at: 7, deleted_at: 111 }
    ] } });
    t1.auth(user(UID_A));
    await sleep(400);
    t1.progress.toggleCompleted('r-tombstone');   /* cambio real → ciclo de estado */
    await sleep(2600);
    assert(t1.srsLocal().indexOf(QC) === -1, 'la copia local obsoleta se retira: ' + JSON.stringify(t1.srsLocal()));
    assert(t1.marks()[QC] === 'known', 'el dispositivo recuerda el tombstone ajeno: ' + JSON.stringify(t1.marks()));
    const enviados = [].concat.apply([], t1.srsPayloads());
    assert(enviados.indexOf('L:' + QC) === -1, 'y no re-sube la tarjeta viva: ' + JSON.stringify(enviados));
  })();
  record('tombstone de otro dispositivo sin marca previa: se recuerda como known (sin resurrección)');

  /* --- auto-verificación del runner --------------------------------- */
  if (process.env.SRS_CLEARS_SELFTEST === '1') {
    await (async () => { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); })();
    record('auto-verificación (no debe llegar aquí)');
  }
})().catch((e) => { console.error('runner:', e && e.message); if (process.env.SRS_CLEARS_TRACE === '1') console.error(e && e.stack); failed++; });

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log(`OK: ${passed}  FAIL: ${failed}  (módulo: ${MODULE_PATH})`);
  process.exitCode = failed > 0 ? 1 : 0;
});

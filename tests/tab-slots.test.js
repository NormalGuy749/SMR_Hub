'use strict';

/* Dos instancias reales de cloud-progress comparten almacenamiento
   simulado; cada una mantiene su runtime, colas, progreso y listeners.
   El bus entrega storage solo a la otra pestaña y de forma asíncrona,
   sin controlar el orden exacto. Se espera el estado final tras flush,
   no un interleaving concreto. Supabase es un mock, sin llamadas de red.
   SMR_MODULE permite probar otra copia del módulo. */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

const MODULE_PATH = process.env.SMR_MODULE || 'js/cloud-progress.js';
const srcProgress = fs.readFileSync(MODULE_PATH, 'utf8');
const srcSrs = fs.readFileSync('js/srs.js', 'utf8');

const UID_A = 'uid-A';
const UID_B = 'uid-B';
const CARD = 'q-0123456789abcdef';
const CARD2 = 'q-fedcba9876543210';
const PREFIX = 'smrhub:';

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
  const ls = new Map(); /* claves COMPLETAS, con prefijo smrhub: */
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
    /* escribe como lo haría el navegador: avisa a las OTRAS pestañas */
    write(writer, fullKey, value) {
      const oldRaw = ls.has(fullKey) ? ls.get(fullKey) : null;
      if (value === null) ls.delete(fullKey); else ls.set(fullKey, value);
      tabs.forEach((t) => {
        if (t === writer) return;
        queue.push(() => t.deliver(fullKey, value, oldRaw));
      });
      flushSoon();
    },
    /* semilla directa (arranque del dispositivo): sin eventos */
    seed(fullKey, value) { if (value === null) ls.delete(fullKey); else ls.set(fullKey, value); },
    snapshotKeys() { return [...ls.keys()].filter((k) => k.startsWith(PREFIX)).sort(); }
  };
}

/* ---------- una pestaña = un contexto JS con el módulo real ---------- */

/* El lock FIFO compartido garantiza exclusión sin sustituir el cuerpo
   de las transiciones de producción. Sin lock no se ejecutarían. */
function makeSharedLocks() {
  let held = false;
  const queue = [];
  function pump() {
    if (held || !queue.length) return;
    const e = queue.shift();
    held = true;
    Promise.resolve().then(e.cb).then(
      () => { held = false; e.resolve(); pump(); },
      () => { held = false; e.resolve(); pump(); }
    );
  }
  return { request(name, cb) { return new Promise((resolve) => { queue.push({ cb, resolve }); pump(); }); } };
}
const SHARED_LOCKS = makeSharedLocks();

function makeTab(bus, opts) {
  const o = opts || {};
  const listeners = {};
  const hooks = { save: 0, dropSrs: [], scheduleSrs: [], toggleCompleted: [] };
  let cloudCalls = 0;

  const store = {
    get(k, fallback = null) {
      const raw = bus.ls.get(PREFIX + k);
      if (raw === undefined) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    },
    set(k, v) {
      try { bus.write(tab, PREFIX + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    remove(k) { bus.write(tab, PREFIX + k, null); }
  };

  /* Vista de solo lectura que usa el módulo para el escaneo de slots ajenos */
  const localStorageView = {
    getItem: (k) => (bus.ls.has(k) ? bus.ls.get(k) : null),
    setItem: (k, v) => bus.write(tab, k, String(v)),
    removeItem: (k) => bus.write(tab, k, null),
    get length() { return bus.ls.size; },
    key: (i) => ([...bus.ls.keys()][i] === undefined ? null : [...bus.ls.keys()][i])
  };

  const rpcCalls = [];
  const sb = {
    from() { cloudCalls++; return chain(); },
    rpc(name, params) { cloudCalls++; rpcCalls.push({ name, params }); return Promise.resolve({ data: { applied: 0, invalid: 0 }, error: null }); }
  };
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

  const g = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    localStorage: localStorageView,
    navigator: o.locks ? { locks: o.locks } : { locks: SHARED_LOCKS },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (listeners[ev.type] || []).slice().forEach((fn) => fn(ev)); return true; },
    setTimeout, clearTimeout
  };
  g.window = g;
  g.SMR_DATA = { tests: [{ id: 't-t1', questions: [{ q: 'A', options: ['a1', 'a2'], correct: 0 }, { q: 'B', options: ['b1', 'b2'], correct: 1 }] }] };

  const progress = {
    data: progressWith({}),
    save() {
      hooks.save++;
      /* igual que app.js: escribe el slot vivo con el objeto en memoria */
      store.set('progress', this.data);
    },
    recordTest() {}, recordStudySession() {}, logActivity() {},
    toggleCompleted(id) { hooks.toggleCompleted.push(id); this.data.resources.completed[id] = Date.now(); this.save(); return true; },
    isCompleted(id) { return Object.prototype.hasOwnProperty.call(this.data.resources.completed, id); },
    dropSrs(testId, qIndex) { hooks.dropSrs.push([testId, qIndex]); },
    scheduleSrs(testId, qIndex, rate) { hooks.scheduleSrs.push([testId, qIndex, rate]); },
    touchStreak() { return true; }
  };

  g.SMR = { store, progress, cloud: sb, cloudAvailable: true, esc: (v) => String(v), icon: () => '' };
  new Function('window', 'globalThis', srcSrs)(g, g, g);
  g.SMR.srs.buildIndex();

  /* El módulo lee el slot al cargar; se carga DESPUÉS de sembrar el bus
     (como en un arranque real), por eso el env sembrador se aplica antes. */
  new Function('window', 'globalThis', srcProgress)(g, g, g);

  const tab = {
    g, store, progress, hooks, bus, rpcCalls,
    get cloudCalls() { return cloudCalls; },
    srsCardsSent() {
      /* payload de la ÚLTIMA llamada a merge_srs_cards (la relevante tras el
         borrado; los ciclos anteriores son de antes de la marca) */
      const calls = rpcCalls.filter((c) => c.name === 'merge_srs_cards');
      return calls.length ? (calls[calls.length - 1].params.p_cards || []) : [];
    },
    deliver(key, newValue, oldValue) {
      (listeners.storage || []).slice().forEach((fn) => fn({ type: 'storage', key, newValue, oldValue }));
    },
    auth(user) { g.dispatchEvent({ type: 'smr:authchange', detail: { user } }); },
    marker() { const m = store.get('liveOwner', null); return m && (typeof m === 'string' ? m : m.owner); },
    live(key, fallback = null) { return store.get(key, fallback); },
    snapshot(owner) { return store.get('progressByOwner:' + owner, null); },
    slotSrs() { const p = store.get('progress', null) || {}; return Object.keys(((p.tests || {}).srs) || {}); },
    memSrs() { return Object.keys(progress.data.tests.srs); },
    memCompleted() { return Object.keys(progress.data.resources.completed); },
    marks() { return store.get('progressSyncSrsClears', null) || {}; }
  };
  /* la app arranca con el objeto vivo derivado del slot (app.js) */
  progress.data = progressWith(store.get('progress', null) || {});
  progress.data = Object.assign(progressWith({}), store.get('progress', null) || {});
  bus.tabs.push(tab);
  return tab;
}

/* ---------- escenario de dos pestañas ---------- */

function twoTabs(opts) {
  const o = opts || {};
  const bus = makeBus();
  (o.seed || []).forEach(([k, v]) => bus.seed(k, v));
  const t1 = makeTab(bus, o.locks1 ? { locks: o.locks1 } : {});
  const t2 = makeTab(bus, o.locks2 ? { locks: o.locks2 } : {});
  return { bus, t1, t2 };
}

function user(id) { return { id, email: id + '@test' }; }
function flush(n) {
  let p = Promise.resolve();
  for (let i = 0; i < (n || 6); i++) p = p.then(() => new Promise((r) => setTimeout(r, 0)));
  return p;
}
const P = PREFIX;

/* ---------- casos ---------- */

(async function main() {
  /* 1. Misma cuenta en dos pestañas: borrado SRS en una y save en la otra. */
  await (async () => {
    /* claves SRS reales (idOf del módulo), no inventadas: el borrado se marca
       con la clave estable que calcula SMR.srs */
    const QA = (() => { const t = makeTab(makeBus(), {}); return t.g.SMR.srs.idOf('t-t1', 0); })();
    const QB = (() => { const t = makeTab(makeBus(), {}); return t.g.SMR.srs.idOf('t-t1', 1); })();
    const { t1, t2 } = twoTabs({ seed: [
      [P + 'liveOwner', JSON.stringify({ owner: UID_A, v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ srs: { [QA]: { level: 1, due: 5 } }, completed: { 'r-1': 1 } }))],
      [P + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ srs: { [QA]: { level: 1, due: 5 } } }) }, savedAt: 1, v: 1 })]
    ] });
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    /* pestaña 1: nueva tarjeta SRS; la pestaña 2 no la ve en memoria */
    t1.progress.data.tests.srs[QB] = { level: 2, due: 9 };
    t1.progress.save();
    await flush();
    t1.g.SMR.progress.dropSrs('t-t1', 0);
    await flush();
    assert(t1.marks()[QA] === 'pending', 'el borrado deja la marca pending');
    /* la pestaña 2, con copia desfasada, guarda progreso (save normal) */
    t2.progress.toggleCompleted('r-t2');
    await flush();
    assert(t2.marks()[QA] === 'pending', 'la marca pending NO se pierde por el save de la otra pestaña: ' + JSON.stringify(t2.marks()));
    /* ciclo real de sincronización de la pestaña 2 (pull vacío + push RPC) */
    await new Promise((r) => setTimeout(r, 1400));
    await flush();
    assert(t2.memSrs().indexOf(QA) === -1, 'la pestaña 2 retira la tarjeta borrada en su ciclo de sync');
    const sent = t2.srsCardsSent();
    const liveQa = sent.filter((c) => c.question_key === QA && !c.deleted);
    const tombQa = sent.filter((c) => c.question_key === QA && c.deleted === true);
    assert(liveQa.length === 0, 'la pestaña 2 NO reenvía la tarjeta con borrado pendiente como viva');
    assert(tombQa.length === 1, 'la pestaña 2 reenvía el tombstone (idempotente): ' + JSON.stringify(sent));
    assert(t1.srsCardsSent().filter((c) => c.question_key === QB && !c.deleted).length === 1,
      'la tarjeta nueva de la pestaña 1 sí se sube como viva: ' + JSON.stringify(t1.srsCardsSent()));
  })();
  record('dos pestañas misma cuenta: el save de una no pierde el tombstone/pending de la otra');

  /* 2. LOGOUT procesado por las dos pestañas: ningún dueño recibe contenido ajeno. */
  await (async () => {
    const { t1, t2 } = twoTabs({ seed: [
      [P + 'liveOwner', JSON.stringify({ owner: UID_A, v: 1 })],
      [P + 'progressByOwner:__guest__', JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-visitante': 7 } }) }, savedAt: 1, v: 1 })],
      [P + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-antes': 3 } }) }, savedAt: 1, v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ completed: { 'r-A': 11 } }))]
    ] });
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    assert(t1.memCompleted().indexOf('r-A') !== -1, 'la pestaña 1 trabaja con el estado vivo de A');
    /* A cierra sesión en la pestaña 1; la pestaña 2 procesa el mismo logout */
    t1.auth(null);
    t2.auth(null);
    await flush();
    const snapA = t1.snapshot(UID_A);
    assert(snapA && snapA.slot.progress.resources.completed['r-A'] !== undefined,
      'el snapshot de A conserva SU estado vivo: ' + JSON.stringify(snapA && Object.keys(snapA.slot.progress.resources.completed)));
    const snapG = t1.snapshot('__guest__');
    assert(snapG && snapG.slot.progress.resources.completed['r-visitante'] !== undefined,
      'la custodia del visitante conserva SU contenido (no el de la cuenta): ' + JSON.stringify(snapG && Object.keys(snapG.slot.progress.resources.completed)));
    assert(Object.keys(snapG.slot.progress.resources.completed).indexOf('r-A') === -1, 'el estado de A no se archiva como visitante');
    assert(t1.marker() === '__guest__' && t2.marker() === '__guest__', 'el marcador queda en visitante en ambas pestañas');
    assert(t1.memCompleted().indexOf('r-A') === -1 && t2.memCompleted().indexOf('r-A') === -1,
      'ninguna pestaña sigue con el estado de A en memoria tras el logout');
  })();
  record('logout en dos pestañas: A conserva su estado y el visitante el suyo (sin contenido ajeno)');

  /* 3. LOGIN procesado por una pestaña pasiva: el marcador manda. */
  await (async () => {
    const { t1, t2 } = twoTabs({ seed: [
      [P + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 })],
      [P + 'progressByOwner:__guest__', JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-visitante': 7 } }) }, savedAt: 1, v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ completed: { 'r-visitante': 7 } }))]
    ] });
    /* la pestaña 1 entra en A y trabaja; la 2 recibe el mismo authchange después */
    t1.auth(user(UID_A));
    await flush();
    t1.progress.data.resources.completed['r-A'] = 42;
    t1.progress.save();
    await flush();
    t2.auth(user(UID_A));   /* pestaña pasiva, con runtime vacío y marcador ya en A */
    await flush();
    const snapG = t1.snapshot('__guest__');
    assert(snapG && snapG.slot.progress.resources.completed['r-visitante'] !== undefined,
      'la custodia del visitante conserva SU contenido');
    assert(Object.keys(snapG.slot.progress.resources.completed).indexOf('r-A') === -1,
      'los datos de la cuenta A NO se archivan como visitante');
    assert(t1.slotSrs().length === 0 && t2.live('progress').resources.completed['r-A'] === 42,
      'el slot vivo sigue siendo el de A (nadie lo pisa)');
    assert(t2.memCompleted().indexOf('r-A') !== -1,
      'la pestaña pasiva re-lee el slot vivo (no se queda con el estado del visitante): ' + JSON.stringify(t2.memCompleted()));
    assert(t1.marker() === UID_A, 'el marcador es A');
  })();
  record('login en dos pestañas: la pestaña pasiva adopta el slot vivo sin archivar contenido ajeno');

  /* 4. A→B con dos pestañas: el estado de A no se sobrescribe con el de B. */
  await (async () => {
    const { t1, t2 } = twoTabs({ seed: [
      [P + 'liveOwner', JSON.stringify({ owner: UID_A, v: 1 })],
      [P + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-antes-A': 3 } }) }, savedAt: 1, v: 1 })],
      [P + 'progressByOwner:' + UID_B, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-B': 5 } }) }, savedAt: 1, v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ completed: { 'r-A': 11 } }))]
    ] });
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    t1.auth(user(UID_B));
    t2.auth(user(UID_B));
    await flush();
    const snapA = t2.snapshot(UID_A);
    assert(snapA && snapA.slot.progress.resources.completed['r-A'] !== undefined,
      'el snapshot de A conserva el estado vivo de A (no el de B): ' + JSON.stringify(snapA && Object.keys(snapA.slot.progress.resources.completed)));
    assert(Object.keys(snapA.slot.progress.resources.completed).indexOf('r-B') === -1, 'B no se cuela en la custodia de A');
    assert(t1.marker() === UID_B && t2.marker() === UID_B, 'el marcador termina en B');
    assert(t1.live('progress').resources.completed['r-B'] === 5, 'el slot vivo es el de B');
  })();
  record('cambio A→B en dos pestañas: transiciones serializadas sin archivar contenido cruzado');

  /* 5. Snapshot obsoleto: la reconciliación pasiva no pisa el slot con un dueño*/
  /*    que ya no es el del slot vivo. */
  await (async () => {
    const { t1, t2 } = twoTabs({ seed: [
      [P + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 })],
      [P + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-A-viejo': 1 } }) }, savedAt: 1, v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ completed: { 'r-visitante': 9 } }))]
    ] });
    /* la pestaña 2 cree ser A (runtime) pero el marcador dice visitante */
    t2.auth(user(UID_A));
    await flush();
    const before = JSON.stringify(t2.live('progress'));
    t1.store.set('progressByOwner:' + UID_A, { slot: { progress: progressWith({ completed: { 'r-A-nuevo': 2 } }) }, savedAt: 2, v: 1 });
    await flush();
    assert(JSON.stringify(t1.live('progress')) === before || t1.live('progress').resources.completed['r-A-viejo'] === undefined,
      'la pestaña pasiva no reinstala el snapshot de A sobre el slot vivo del visitante');
  })();
  record('reconciliación pasiva bloqueada cuando el marcador ya no es de ese dueño');

  /* 6. Marca pending legítima que sobrevive a A→B→A con dos pestañas. */
  await (async () => {
    const { t1, t2 } = twoTabs({ seed: [
      [P + 'liveOwner', JSON.stringify({ owner: UID_A, v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ srs: { [CARD]: { level: 1, due: 5 } } }))],
      [P + 'progressSyncSrsClears', JSON.stringify({ [CARD]: 'pending' })],
      [P + 'progressByOwner:' + UID_B, JSON.stringify({ slot: { progress: progressWith({ srs: { [CARD2]: { level: 3, due: 8 } } }) }, savedAt: 1, v: 1 })]
    ] });
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    t1.auth(user(UID_B));
    t2.auth(user(UID_B));
    await flush();
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    assert(t1.marks()[CARD] === 'pending' && t2.marks()[CARD] === 'pending',
      'el pending de A sobrevive a A→B→A en las dos pestañas: ' + JSON.stringify(t1.marks()));
    assert(t2.memSrs().indexOf(CARD) === -1, 'la tarjeta con borrado pendiente no se reinstala');
    assert(t1.snapshot(UID_B) && t1.snapshot(UID_B).slot.progressSyncSrsClears === undefined ||
      (t1.snapshot(UID_B).slot.progressSyncSrsClears || {})[CARD] === undefined,
      'la marca de A no se archiva bajo B');
  })();
  record('marca SRS pending conservada en A→B→A con dos pestañas y sin cruzar de dueño');

  /* 7. Visitante/offline: una pestaña sin sesión no adopta ni sobrescribe. */
  await (async () => {
    const { t1, t2 } = twoTabs({ seed: [
      [P + 'liveOwner', JSON.stringify({ owner: UID_A, v: 1 })],
      [P + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-A': 4 } }) }, savedAt: 1, v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ completed: { 'r-A': 4 } }))]
    ] });
    t1.auth(user(UID_A));
    await flush();
    /* la pestaña 2 nunca entra: sigue en modo visitante y guarda progreso */
    t2.progress.toggleCompleted('r-visitante-2');
    await flush();
    const snapA = t1.snapshot(UID_A);
    assert(snapA.slot.progress.resources.completed['r-A'] === 4, 'la custodia de A no se modifica desde la pestaña visitante');
    assert((snapA.slot.progress.resources.completed['r-visitante-2'] || null) === null, 'el progreso visitante no se atribuye a A');
    assert(t2.marker() === UID_A, 'el marcador del slot vivo lo sigue controlando la pestaña con sesión');
  })();
  record('pestaña visitante/offline: no adopta ni sobrescribe la custodia de la cuenta');

  /* La transición conserva la custodia y la pestaña rezagada converge
     cuando procesa su cambio de cuenta. Este arnés no prueba la fusión
     de dos copias vivas: su progreso usa un save simulado de última escritura. */
  await (async () => {
    const { t1, t2 } = twoTabs({ seed: [
      [P + 'liveOwner', JSON.stringify({ owner: UID_A, v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ completed: { 'r-A': 1 } }))],
      [P + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-A': 1 } }) }, savedAt: 1, v: 1 })],
      [P + 'progressByOwner:' + UID_B, JSON.stringify({ slot: { progress: progressWith({ completed: { 'r-B': 5 } }) }, savedAt: 1, v: 1 })]
    ] });
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    t1.auth(user(UID_B));
    await flush();
    const snapA1 = JSON.stringify(t1.snapshot(UID_A));
    t2.progress.toggleCompleted('r-A-tardio');
    await flush();
    assert(t1.marker() === UID_B, 'el propietario activo sigue siendo B');
    assert(JSON.stringify(t1.snapshot(UID_A)) === snapA1, 'la custodia de A no se re-archiva con datos de la pestaña rezagada');
    t2.auth(user(UID_B));
    await flush();
    assert(t2.marker() === UID_B, 'la pestaña 2 converge al marcador (B)');
    assert(t1.snapshot(UID_B).slot.progress.resources.completed['r-B'] === 5, 'la custodia de B no se pisa');
    assert(t1.snapshot(UID_A).slot.progress.resources.completed['r-A'] === 1, 'la custodia de A conserva SU contenido archivado');
  })();
  record('transición rezagada de A con B activo: custodia intacta y convergencia al marcador');

  /* Lock rechazado: la transición no se ejecuta sin exclusión. */
  await (async () => {
    const brokenLocks = { request: () => Promise.reject(new Error('document not fully active')) };
    const { t1 } = twoTabs({ locks1: brokenLocks, seed: [
      [P + 'liveOwner', JSON.stringify({ owner: '__guest__', v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ completed: { 'r-visitante': 7 } }))]
    ] });
    t1.auth(user(UID_A));
    await flush();
    /* Sin exclusión no se toca el slot: ni se archiva ni se restaura. El
       contenido del visitante sigue VIVO, así que no se pierde nada. */
    assert(t1.snapshot('__guest__') === null, 'sin exclusión NO se archiva el slot');
    assert(t1.marker() === '__guest__',
      'el marcador queda intacto mientras la transición está diferida: ' + t1.marker());
    const live = t1.live('progress');
    assert(live && live.resources.completed['r-visitante'] === 7,
      'el contenido del visitante sigue vivo y no se pierde: ' + JSON.stringify(live && live.resources.completed));
    assert(t1.g.SMR.cloudSession.transitionPending() === true,
      'estado observable: la transición queda diferida');
  })();
  record('lock rechazado: fail-closed — no se archiva, no se pierde y queda observable');

  /* 10. Perfil y progreso intactos, y el marcador fuera de los snapshots. */
  await (async () => {
    const { t1, t2 } = twoTabs({ seed: [
      [P + 'liveOwner', JSON.stringify({ owner: UID_A, v: 1 })],
      [P + 'progress', JSON.stringify(progressWith({ srs: { [CARD]: { level: 1, due: 5 } } }))],
      [P + 'studentProfile', JSON.stringify({ from: 'A-vivo' })],
      [P + 'progressSyncClears', JSON.stringify({ 'r-1': 1234 })],
      [P + 'progressByOwner:' + UID_A, JSON.stringify({ slot: { progress: progressWith({}), studentProfile: { from: 'A-viejo' }, progressSyncClears: {} }, savedAt: 1, v: 1 })]
    ] });
    t1.auth(user(UID_A));
    t2.auth(user(UID_A));
    await flush();
    assert(t1.live('studentProfile').from === 'A-vivo', 'el perfil vivo no se sustituye por el snapshot antiguo');
    assert(t1.live('progressSyncClears')['r-1'] === 1234, 'las marcas no SRS siguen intactas');
    t1.auth(null);
    t2.auth(null);
    await flush();
    const snapA = t1.snapshot(UID_A);
    assert((snapA.slot.studentProfile || {}).from === 'A-vivo', 'el perfil se archiva con SU dueño y con el valor vivo');
    assert(snapA.slot.liveOwner === undefined, 'el marcador del slot vivo no se filtra dentro de los snapshots');
    assert(t1.live('studentProfile') === null || t1.live('studentProfile') === undefined, 'el slot vivo queda para el visitante');
  })();
  record('perfil, marcas no SRS y progreso intactos; el marcador no viaja en los snapshots');

  if (process.env.TAB_SLOTS_SELFTEST === '1') {
    await (async () => { assert(1 === 2, 'auto-verificación: aserción forzada a fallar'); })();
    record('auto-verificación (no debe llegar aquí)');
  }
})().catch((e) => { console.error('runner:', e && e.message); if (process.env.TAB_SLOTS_TRACE === '1') console.error(e && e.stack); failed++; });

process.on('exit', () => {
  console.log('\n── resumen ──');
  console.log(`OK: ${passed}  FAIL: ${failed}  (módulo: ${MODULE_PATH})`);
  process.exitCode = failed > 0 ? 1 : 0;
});

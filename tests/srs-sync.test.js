'use strict';

/* =====================================================================
   SMR Hub — Fase 8.5: tests del adaptador SRS cloud (standalone, sin
   dependencias). MOCKS EXPLÍCITOS:
   - localStorage/navigator/addEventListener: ambiente navegador mínimo.
   - Cliente Supabase: mock en memoria que resuelve select() con las
     filas del estado (rows) y aplica upserts idempotentes por PK.
   NINGUNA prueba de esta suite toca Supabase real.
   ===================================================================== */

const fs = require('fs');

/* ------------------------------------------------------------------
   Ambiente navegador mínimo
------------------------------------------------------------------ */
function makeEnv() {
  const storage = new Map();
  const fakeLocalStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: (k) => { storage.delete(k); }
  };
  const listeners = {};
  const g = {
    console,
    localStorage: fakeLocalStorage,
    /* 8.6.3: la transición exige exclusión (fail-closed); el arnés aporta un lock. */
    navigator: { locks: { request: (name, cb) => Promise.resolve().then(cb) } },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener: () => {},
    setTimeout: () => 0,
    clearTimeout: () => {}
  };
  return { g, storage, listeners };
}

/* ------------------------------------------------------------------
   Mock del cliente Supabase (memoria + select resuelto)
------------------------------------------------------------------ */
function makeSupabaseMock(state) {
  const calls = [];
  const keyCol = (t) => (t === 'srs_cards' ? 'question_key' : (t === 'case_solutions' ? 'case_id' : 'resource_id'));
  function from(table) {
    calls.push({ table });
    const builder = {
      select() { return builder; },
      eq() { return builder; },
      order() { return builder; },
      limit() { return builder; },
      upsert(rows) {
        calls.push({ table, upsert: rows.length });
        return new Promise((resolve) => {
          setTimeout(() => {
            const err = state.errorFor ? state.errorFor(table) : null;
            if (!err) {
              const store = (state.rows[table] = state.rows[table] || []);
              const kc = keyCol(table);
              rows.forEach((row) => {
                const k = row.user_id + '|' + row[kc];
                const idx = store.findIndex((r) => r.user_id + '|' + r[kc] === k);
                if (idx >= 0) store[idx] = row;
                else store.push(row);
              });
            }
            resolve({ data: null, error: err });
          }, 0);
        });
      },
      then(resolve, reject) {
        /* el mock devuelve las filas en memoria al hacer await select() */
        Promise.resolve().then(() => {
          const err = state.errorFor ? state.errorFor(table) : null;
          resolve({ data: (state.rows[table] || []).slice(), error: err });
        });
      }
    };
    return builder;
  }
  return {
    from,
    rpc(name, { p_cards }) {
      calls.push({ rpc: name, count: (p_cards || []).length });
      if (name !== 'merge_srs_cards') return Promise.resolve({ data: null, error: { message: 'unsupported rpc: ' + name } });
      return new Promise((resolve) => {
        setTimeout(() => {
          const err = state.errorFor ? state.errorFor('rpc:' + name) : null;
          if (err) return resolve({ data: null, error: err });
          const store = (state.rows.srs_cards = state.rows.srs_cards || []);
          let applied = 0, invalid = 0;
          p_cards.forEach((c) => {
            if (!/^q-[0-9a-f]{16}(-\d+)?$/.test(c.question_key)) return invalid++;
            /* política server-side (répïlica exacta de 00006): 1) level
               mayor; 2) mismo level → due mayor; 3) level+due iguales →
               client_updated_at mayor (coalesce -1); 4) empate total →
               conservar existente. La unidad es la tarjeta entera. */
            const k = 'uid-' + c.question_key;
            const idx = store.findIndex((r) => r.user_id === (state.uid || 'uid-A') && r.question_key === c.question_key);
            if (idx < 0) { store.push({ user_id: state.uid || 'uid-A', question_key: c.question_key, level: c.level, due: c.due, client_updated_at: c.client_updated_at }); applied++; return; }
            const e = store[idx];
            let nl = e, changed = false;
            if (c.level > e.level) { nl = { ...e, level: c.level, due: c.due, client_updated_at: c.client_updated_at }; changed = true; }
            else if (c.level === e.level && c.due > e.due) { nl = { ...e, level: c.level, due: c.due, client_updated_at: c.client_updated_at }; changed = true; }
            else if (c.level === e.level && c.due === e.due && (c.client_updated_at ?? -1) > (e.client_updated_at ?? -1)) { nl = { ...e, client_updated_at: c.client_updated_at }; changed = true; }
            if (changed) { store[idx] = { user_id: e.user_id, question_key: e.question_key, level: c.level, due: c.due, client_updated_at: c.client_updated_at }; }
            applied++;
          });
          resolve({ data: { applied, invalid }, error: null });
        }, 0);
      });
    },
    calls,
    _setRows(table, rows) { state.rows[table] = rows.slice(); },
    _rowsOf(table) { return state.rows[table] || []; }
  };
}

/* ------------------------------------------------------------------
   Suite
------------------------------------------------------------------ */
let passed = 0, failed = 0;
const failures = [];
function record(name) { passed++; console.log('  ✓ ' + name); }
function fail(name, e) { failed++; failures.push({ name, e }); console.log('  ✗ ' + name + ' → ' + (e && e.message)); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert falló'); }

async function main() {
  const srcSrs = fs.readFileSync('js/srs.js', 'utf8');
  const srcProgress = fs.readFileSync('js/cloud-progress.js', 'utf8');

  /* Extractor de funciones reales del módulo cloud-progress (IIFE). */
  function extractFn(marker) {
    const start = srcProgress.indexOf(marker);
    if (start < 0) throw new Error('no encontrado: ' + marker);
    const bodyStart = srcProgress.indexOf('{', start);
    let depth = 0, i = bodyStart;
    for (; i < srcProgress.length; i++) {
      if (srcProgress[i] === '{') depth++;
      else if (srcProgress[i] === '}') { depth--; if (depth === 0) { i++; break; } }
    }
    return srcProgress.slice(start, i);
  }

  const helpers = [
    'const SRS_KEY_OK = /^q-[0-9a-f]{16}(?:-\\d+)?$/;',
    'const SRS_CARD_LIMIT = 500;',
    'const SRS_CLEARS_KEY = \'progressSyncSrsClears\';',
    /* 8.5.14: syncSrsCards consulta el dueño persistido del slot vivo antes de
       aplicar transiciones; el harness extrae también esos helpers. */
    'const LIVE_OWNER_KEY = \'liveOwner\';',
    'const GUEST_OWNER = \'__guest__\';',
    extractFn('function readLiveOwner('),
    extractFn('function liveOwnerFor('),
    extractFn('function slotOwnerOrUnknown('),
    extractFn('function srsValidCard('),
    extractFn('function readSrsClears('),
    extractFn('function writeSrsClears('),
    extractFn('function applySrsClear('),
    extractFn('async function syncSrsCards(')
  ].join('\n');

  function makeHarness(cloudRows, opts) {
    const o = opts || {};
    const env = makeEnv();
    const g = env.g;
    g.window = g;
    g.SMR = {};
    g.SMR_DATA = {
      tests: [{ id: 't-t1', questions: [
        { q: 'A', options: ['a1', 'a2'], correct: 0 },
        { q: 'B', options: ['b1', 'b2'], correct: 1 }
      ] }]
    };
    new Function('window', 'globalThis', srcSrs)(g, g, g);
    g.SMR.srs.buildIndex();
    const ID_A_REAL = g.SMR.srs.idOf('t-t1', 0);
    const ID_B_REAL = g.SMR.srs.idOf('t-t1', 1);

    const srsLocal = {};
    Object.keys(o.srsLocal || {}).forEach((k) => { srsLocal[k] = Object.assign({}, o.srsLocal[k]); });
    const SMRp = {
      data: {
        resources: { viewed: {}, completed: {}, selfAssessment: {} },
        tests: { best: {}, last: {}, history: [], wrong: {}, srs: srsLocal, srsLegacy: {} },
        cases: { solved: {} },
        studySessions: [], studyMinutes: 0, activity: [],
        streak: { lastDay: null, count: 0 }
      },
      saved: false,
      save() { this.saved = true; }
    };

    const state = { rows: {}, errorFor: o.errorFor || null };
    const sb = makeSupabaseMock(state);
    if (cloudRows) sb._setRows('srs_cards', cloudRows.slice());

    const uid = o.uid || 'uid-A';
    const runtime = { currentUser: { id: uid }, lastSnapshot: undefined, syncing: false };
    const sessionHandle = { owner: uid, uid: uid, dataRef: SMRp.data };
    const sessionChanged = !!o.sessionChanged;

    /* Módulo mínimo: sincroniza la firma real (helpers + syncSrsCards) */
    const fn = new Function(
      'global', 'SMR', 'sb', 'runtime', 'warn',
      'sessionHandleFor', 'sessionChangedFor',
      'originalSave', 'snapshotProgress',
      helpers + '\n; return { syncSrsCards, SRS_KEY_OK, srsValidCard };'
    )(
      g, { srs: g.SMR.srs, progress: SMRp }, sb, runtime,
      () => {},
      () => sessionHandle,
      () => sessionChanged,
      SMRp.save.bind(SMRp),
      () => 'snap'
    );
    return { g, SMRp, sb, runtime, fn, sessionHandle, ID_A_REAL, ID_B_REAL, state };
  }

  async function runSync(h, now) {
    await h.fn.syncSrsCards(h.runtime.currentUser.id, now || 1000, h.sessionHandle);
  }

  /* --- grupo 1: política de merge (replica EXACTA de las reglas 1-2-3) --- */
  function mergePolicy(levelL, tsL, levelC, tsC) {
    let winner = 'local';
    if (levelC > levelL) winner = 'cloud';
    else if (levelC === levelL) {
      const a = typeof tsC === 'number' && isFinite(tsC) ? tsC : -1;
      const b = typeof tsL === 'number' && isFinite(tsL) ? tsL : -1;
      if (a > b) winner = 'cloud';
    }
    return winner;
  }

  await (async () => { assert(mergePolicy(1, 10, 3, 20) === 'cloud', 'r1a'); assert(mergePolicy(2, 99, 1, 98) === 'local', 'r1b'); })();
  record('política: nivel remoto mayor gana (regla 1)');

  await (async () => { assert(mergePolicy(2, 50, 2, 99) === 'cloud', 'r2a'); assert(mergePolicy(2, 99, 2, 50) === 'local', 'r2b'); })();
  record('política: empate de nivel → ts de cliente (regla 2)');

  await (async () => { assert(mergePolicy(2, 500, 2, 500) === 'local', 'r3a'); assert(mergePolicy(2, undefined, 2, undefined) === 'local', 'r3b'); })();
  record('política: empate total → local (regla 3)');

  await (async () => { assert(mergePolicy(2, 50, 2, undefined) === 'local', 'r4a'); assert(mergePolicy(2, 50, 2, NaN) === 'local', 'r4b'); })();
  record('política: ts ausente/NaN remoto nunca gana');

  /* --- grupo 2: integración real con syncSrsCards + mock supabase --- */
  const ID_A = 'q-1111111111111111'; /* sintético, en tests de claves */
  let h;

  h = makeHarness(null, { srsLocal: { [ID_A]: { level: 2, due: 5000 } } });
  await runSync(h, 1000); await runSync(h, 1000);
  let rows = h.sb._rowsOf('srs_cards');
  assert(rows.length === 1, 'una fila, hay ' + rows.length);
  assert(rows[0].user_id === 'uid-A' && rows[0].question_key === ID_A && rows[0].level === 2 && rows[0].due === 5000, 'fila correcta');
  record('C2+C3: push al UID correcto; upsert repetido no duplica');

  h = makeHarness(null, { srsLocal: { [ID_A]: { level: 1, due: 5000 }, 't-t1:0': { level: 1, due: 5000 }, 'no-valida!': { level: 1, due: 5000 } } });
  await runSync(h, 1000);
  rows = h.sb._rowsOf('srs_cards');
  assert(rows.length === 1 && rows[0].question_key === ID_A, 'solo estable, hay ' + rows.length);
  record('C5: legacy/posicionales/invalidas nunca se suben');

  h = makeHarness([{ user_id: 'uid-A', question_key: ID_A, level: 2, due: 5000, client_updated_at: 100 }], { srsLocal: { [ID_A]: { level: 2, due: 5000 } } });
  const before = JSON.stringify(h.SMRp.data.tests.srs);
  await runSync(h, 1000);
  assert(JSON.stringify(h.SMRp.data.tests.srs) === before, 'local cambió inesperadamente');
  record('C6: merge de estados idénticos no cambia nada');

  h = makeHarness([{ user_id: 'uid-A', question_key: h_real_id_A(), level: 3, due: 9999, client_updated_at: 1 }], { srsLocal: { [h_real_id_A()]: { level: 1, due: 7000 } } });
  await runSync(h, 1000);
  let card = h.SMRp.data.tests.srs[h_real_id_A()];
  assert(card.level === 3 && card.due === 9999, 'esperaba {3,9999}, hay ' + JSON.stringify(card));
  record('C7: nivel remoto mayor → gana cloud completo');
  function h_real_id_A() { return h.ID_A_REAL; }

  /* nota: los tests siguientes usan IDs reales declarados antes */
  function realIds() {
    const e = makeEnv();
    e.g.window = e.g;
    e.g.SMR = {};
    e.g.SMR_DATA = { tests: [{ id: 't-t1', questions: [{ q: 'A', options: ['a1', 'a2'], correct: 0 }, { q: 'B', options: ['b1', 'b2'], correct: 1 }] }] };
    new Function('window', 'globalThis', srcSrs)(e.g, e.g, e.g);
    e.g.SMR.srs.buildIndex();
    return { A: e.g.SMR.srs.idOf('t-t1', 0), B: e.g.SMR.srs.idOf('t-t1', 1) };
  }
  const R = realIds();

  h = makeHarness([{ user_id: 'uid-A', question_key: R.A, level: 3, due: 9999, client_updated_at: 1 }], { srsLocal: { [R.A]: { level: 1, due: 7000 } } });
  await runSync(h, 1000);
  card = h.SMRp.data.tests.srs[R.A];
  assert(card.level === 3 && card.due === 9999, 'esperaba {3,9999}, hay ' + JSON.stringify(card));
  record('C7-int: nivel remoto mayor → gana cloud (ID real)');

  h = makeHarness([{ user_id: 'uid-A', question_key: R.A, level: 1, due: 5000, client_updated_at: 9999 }], { srsLocal: { [R.A]: { level: 2, due: 8000 } } });
  await runSync(h, 1000);
  card = h.SMRp.data.tests.srs[R.A];
  assert(card.level === 2 && card.due === 8000, 'esperaba {2,8000}, hay ' + JSON.stringify(card));
  const rowAfter = h.sb._rowsOf('srs_cards').find((r) => r.question_key === R.A);
  assert(rowAfter.level === 2 && rowAfter.due === 8000, 'cloud debía quedar con fila local ganadora, hay ' + JSON.stringify(rowAfter));
  record('C7-int: nivel local mayor → gana local y se sube');

  h = makeHarness([{ user_id: 'uid-A', question_key: R.A, level: 2, due: 5555, client_updated_at: 2000 }], { srsLocal: { [R.A]: { level: 2, due: 1111 } } });
  await runSync(h, 1000);
  card = h.SMRp.data.tests.srs[R.A];
  assert(card.due === 5555, 'esperaba due cloud 5555, hay ' + card.due);
  record('C7-int: mismo nivel + due cloud mayor → gana cloud (regla 2)');

  h = makeHarness([{ user_id: 'uid-A', question_key: R.A, level: 2, due: 1111, client_updated_at: 500 }], { srsLocal: { [R.A]: { level: 2, due: 9999 } } });
  await runSync(h, 1000);
  card = h.SMRp.data.tests.srs[R.A];
  assert(card.due === 9999, 'esperaba due local 9999, hay ' + card.due);
  record('C7-int: mismo nivel + due local mayor → gana local (regla 2)');

  h = makeHarness([{ user_id: 'uid-A', question_key: R.B, level: 3, due: 7000, client_updated_at: 100 }], { srsLocal: { [R.A]: { level: 2, due: 5000 } } });
  await runSync(h, 1000);
  const srsAfter = h.SMRp.data.tests.srs;
  assert(srsAfter[R.A] && srsAfter[R.A].level === 2, 'A local debía quedar intacto');
  assert(srsAfter[R.B] && srsAfter[R.B].level === 3, 'B remoto debía adoptarse');
  rows = h.sb._rowsOf('srs_cards');
  assert(rows.length === 2, 'debían existir ambas, hay ' + rows.length);
  record('C8: dos dispositivos (unión sin duplicados ni pérdidas)');

  let attempts = 0;
  h = makeHarness(null, {
    srsLocal: { [R.A]: { level: 2, due: 5000 } },
    errorFor: () => (++attempts === 1 ? { message: 'fetch failed' } : null)
  });
  await runSync(h, 1000);
  assert(h.sb._rowsOf('srs_cards').length === 0, 'nada subido en el fallo 1');
  assert(h.SMRp.data.tests.srs[R.A].level === 2, 'local intacto tras fallo 1');
  await runSync(h, 1000);
  assert(h.sb._rowsOf('srs_cards').length === 1, 'subido en el reintento');
  record('C9: reintento tras error de red (transitorio) no pierde datos');

  h = makeHarness(null, {
    srsLocal: { [R.A]: { level: 2, due: 5000 } },
    errorFor: () => ({ message: 'violates check constraint', code: '23514' })
  });
  await runSync(h, 1000);
  assert(h.SMRp.data.tests.srs[R.A].level === 2, 'local intacto tras error permanente');
  assert(h.sb._rowsOf('srs_cards').length === 0, 'nada subido');
  record('C10: fallo remoto sin pérdida del estado local');

  h = makeHarness([{ user_id: 'uid-A', question_key: R.B, level: 3, due: 7000, client_updated_at: 100 }], { srsLocal: { [R.A]: { level: 2, due: 5000 } }, sessionChanged: true });
  await runSync(h, 1000);
  assert(!h.SMRp.data.tests.srs[R.B], 'B debía abortarse antes de instalarse');
  record('C11: cambio de sesión en vuelo → abort sin escribir');

  h = makeHarness([{ user_id: 'uid-A', question_key: R.A, level: 2, due: 5000, client_updated_at: 100 }], { srsLocal: {} });
  await runSync(h, 1000);
  const bad = h.sb._rowsOf('srs_cards').filter((r) => r.user_id !== 'uid-A');
  assert(bad.length === 0, 'filas de otro uid: ' + bad.length);
  record('C12: aislamiento por UID (todas las filas con user_id correcto)');

  h = makeHarness([
    { user_id: 'uid-A', question_key: 'q-abcdefabcdefabcd', level: 4, due: 8000, client_updated_at: 100 },
    { user_id: 'uid-A', question_key: R.B, level: 5, due: 9000, client_updated_at: 100 }
  ], { srsLocal: {} });
  await runSync(h, 1000);
  const srs13 = h.SMRp.data.tests.srs;
  assert(srs13[R.B], 'tarjeta resoluble (B)晖 debía instalarse');
  assert(!srs13['q-abcdefabcdefabcd'], 'tarjeta desconocida NO debía instalarse');
  const rowUnknown = h.sb._rowsOf('srs_cards').find((r) => r.question_key === 'q-abcdefabcdefabcd');
  assert(rowUnknown && rowUnknown.level === 4, 'tarjeta desconocida debía seguir en el cloud');
  record('C13: tarjeta remota desconocida: no instalar, no borrar');

  h = makeHarness([
    { user_id: 'uid-A', question_key: R.A, level: 2, due: 5000, client_updated_at: 100 },
    { user_id: 'uid-A', question_key: R.B, level: 4, due: 6000, client_updated_at: 100 }
  ], { srsLocal: {} });
  await runSync(h, 1000);
  const s1 = JSON.stringify(h.SMRp.data.tests.srs);
  const h2x = makeHarness([
    { user_id: 'uid-A', question_key: R.B, level: 4, due: 6000, client_updated_at: 100 },
    { user_id: 'uid-A', question_key: R.A, level: 2, due: 5000, client_updated_at: 100 }
  ], { srsLocal: {} });
  await runSync(h2x, 1000);
  const canon = (obj) => JSON.stringify(Object.keys(obj).sort().reduce((a, k) => { a[k] = obj[k]; return a; }, {}));
  assert(canon(h.SMRp.data.tests.srs) === canon(h2x.SMRp.data.tests.srs), 'resultados distintos según orden');
  assert(h.SMRp.data.tests.srs[R.A] && h.SMRp.data.tests.srs[R.B], 'ambas tarjetas presentes');
  record('C14: orden de sincronización distinto → resultado idéntico');

  h = makeHarness(null, { srsLocal: {} });
  const envMig = makeEnv();
  envMig.g.window = envMig.g;
  envMig.g.SMR = {};
  envMig.g.SMR_DATA = { tests: [{ id: 't-t1', questions: [{ q: 'A', options: ['a1', 'a2'], correct: 0 }] }] };
  new Function('window', 'globalThis', srcSrs)(envMig.g, envMig.g, envMig.g);
  envMig.g.SMR.srs.buildIndex();
  const dataMig = { v: 0, tests: { srs: { 't-t1:0': { level: 3, due: 12345 } }, wrong: {} } };
  const resMig = envMig.g.SMR.srs.migrateProgressData(dataMig, 111);
  const idMig = envMig.g.SMR.srs.idOf('t-t1', 0);
  assert(resMig.srsMigrated === 1, 'migró ' + resMig.srsMigrated);
  assert(dataMig.tests.srs[idMig] && dataMig.tests.srs[idMig].level === 3, 'tarjeta debía migrar al ID estable');
  record('C15: migración v3→v4 (srs.js real) deja la tarjeta bajo ID estable');

  {
    assert(srcProgress.includes('if (!SMR.cloudAvailable || !SMR.cloud || !SMR.progress) return;'), 'guard de módulo sin cloud');
    /* 8.6.3: el guard también cubre la transición diferida (fail-closed). */
    assert(srcProgress.includes('if (!runtime.currentUser || runtime.transitionPending) return;'),
      'guard de pushState sin sesión ni transición pendiente');
  }
  record('C1: contrato de visitante/offline (guards estáticos verificados)');

  console.log('\n── resumen ──');
  console.log('OK: ' + passed + '   FAIL: ' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('runner:', e); process.exit(1); });

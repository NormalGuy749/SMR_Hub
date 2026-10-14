'use strict';

/* =====================================================================
   SMR Hub — Fase 8.5.7: tests del borrado SRS (tombstones + revive).
   MOCKS EXPLÍCITOS:
   - app.js NO se carga: dropSrs/scheduleSrs se sustituyen por stubs que
     replican su contrato real ({level,due} por clave estable); el módulo
     cloud-progress envuelve esos stubs con sus hooks (texto real del
     archivo, extraído por marcador).
   - Cliente Supabase: mock en memoria. Su RPC implementa una RÉPLICA de
     la política de 00008 (tombstone pegajoso; revive explícito; el resto
     idéntico a 00007). No es PostgreSQL: la verificación real del SQL es
     tests/pg-srs-delete.sh (contenedor local, no aplica remoto).
   - store: localStorage en memoria bajo el contrato SMR.store de app.js.
   NINGUNA prueba de esta suite toca Supabase real.
   ===================================================================== */

const fs = require('fs');
const srcSrs = fs.readFileSync('js/srs.js', 'utf8');
const srcProgress = fs.readFileSync('js/cloud-progress.js', 'utf8');

/* Extractor de funciones reales del módulo cloud-progress (IIFE). */
function extractFn(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('no encontrado: ' + marker);
  const bodyStart = src.indexOf('{', start);
  let depth = 0, i = bodyStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

/* Bloque real de hooks dropSrs/scheduleSrs (texto del módulo). */
function extractHooks() {
  const start = srcProgress.indexOf('const origDropSrs = SMR.progress.dropSrs;');
  const end = srcProgress.indexOf('const origTouchStreak', start);
  if (start < 0 || end < 0) throw new Error('bloque de hooks SRS no encontrado');
  return srcProgress.slice(start, end);
}

const SRS_CLEARS_KEY = (srcProgress.match(/const SRS_CLEARS_KEY = '([^']+)';/) || [])[1];
if (!SRS_CLEARS_KEY) throw new Error('SRS_CLEARS_KEY no encontrada en cloud-progress.js');

/* Réplica de la política de 00008: {level,due,ts} igual que 00007;
   deleted_at pegajoso (solo revived=true lo limpia). */
function applyMerge(rows, uid, cards) {
  let applied = 0, invalid = 0;
  cards.forEach((c) => {
    if (!c || !/^q-[0-9a-f]{16}(-\d+)?$/.test(c.question_key || '')) return invalid++;
    const idx = rows.findIndex((r) => r.user_id === uid && r.question_key === c.question_key);
    if (c.deleted === true) {
      if (idx < 0) rows.push({ user_id: uid, question_key: c.question_key, level: 0, due: 1, client_updated_at: null, deleted_at: 1 });
      else rows[idx] = Object.assign({}, rows[idx], { deleted_at: rows[idx].deleted_at || 1 });
      return applied++;
    }
    if (c.revived === true && idx >= 0) rows[idx] = Object.assign({}, rows[idx], { deleted_at: null });
    if (idx < 0) {
      rows.push({ user_id: uid, question_key: c.question_key, level: c.level, due: c.due, client_updated_at: c.client_updated_at, deleted_at: null });
      return applied++;
    }
    const e = rows[idx];
    const wins = c.level > e.level
      || (c.level === e.level && (c.due > e.due
        || (c.due === e.due && (c.client_updated_at == null ? -1 : c.client_updated_at) > (e.client_updated_at == null ? -1 : e.client_updated_at))));
    if (wins) rows[idx] = Object.assign({}, e, { level: c.level, due: c.due, client_updated_at: c.client_updated_at });
    applied++;
  });
  return { applied, invalid };
}

function makeSb(state) {
  const calls = [];
  function from(table) {
    calls.push({ table });
    const b = {
      select() { return b; },
      eq() { return b; },
      limit() { return b; },
      then(resolve) {
        Promise.resolve().then(() => resolve({ data: (state.rows[table] || []).slice(), error: null }));
      }
    };
    return b;
  }
  return {
    from,
    calls,
    rpc(name, payload) {
      const cards = (payload && payload.p_cards) || [];
      calls.push({ rpc: name, cards });
      return new Promise((resolve) => {
        setTimeout(() => {
          if (state.rpcError) return resolve({ data: null, error: { message: state.rpcError } });
          resolve({ data: applyMerge(state.rows.srs_cards, state.uid, cards), error: null });
        }, 0);
      });
    }
  };
}

function makeHarness(opts) {
  const o = opts || {};
  const storage = new Map();
  const g = {
    console, navigator: {},
    localStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storage.set(k, String(v)); },
      removeItem: (k) => { storage.delete(k); }
    },
    setTimeout, clearTimeout
  };
  g.window = g;
  g.SMR = {};
  g.SMR_DATA = { tests: [{ id: 't-t1', questions: [
    { q: 'A', options: ['a1', 'a2'], correct: 0 },
    { q: 'B', options: ['b1', 'b2'], correct: 1 }
  ] }] };
  new Function('window', 'globalThis', srcSrs)(g, g, g);
  g.SMR.srs.buildIndex();

  const store = {
    get(k, d) { const v = storage.get('smrhub:' + k); return v === undefined ? (d === undefined ? null : d) : JSON.parse(v); },
    set(k, v) { storage.set('smrhub:' + k, JSON.stringify(v)); return true; },
    remove(k) { storage.delete('smrhub:' + k); }
  };
  const data = {
    resources: { viewed: {}, completed: {}, selfAssessment: {} },
    tests: { best: {}, last: {}, history: [], wrong: {}, srs: JSON.parse(JSON.stringify(o.srsLocal || {})), srsLegacy: {} },
    cases: { solved: {} }, studySessions: [], studyMinutes: 0, activity: [], streak: { lastDay: null, count: 0 }
  };
  /* stubs del contrato de app.js (ver cabecera) */
  const SMRp = {
    data, saved: 0,
    save() { this.saved++; },
    dropSrs(testId, qIndex) {
      const key = g.SMR.srs.idOf(testId, qIndex);
      if (key) delete this.data.tests.srs[key];
      delete this.data.tests.srs[testId + ':' + qIndex]; /* compatibilidad antigua, igual que app.js */
      this.save();
    },
    scheduleSrs(testId, qIndex, rate) {
      const key = g.SMR.srs.idOf(testId, qIndex) || (testId + ':' + qIndex);
      const cur = this.data.tests.srs[key] && typeof this.data.tests.srs[key].level === 'number' ? this.data.tests.srs[key].level : 0;
      let level = cur;
      if (rate === 2) level = Math.min(5, cur + 1);
      else if (rate === 1) level = cur;
      else level = Math.max(0, cur - 1);
      this.data.tests.srs[key] = { level, due: 8000 };
      this.save();
    }
  };
  const SMR = { srs: g.SMR.srs, progress: SMRp, store };
  if (o.clears) store.set(SRS_CLEARS_KEY, o.clears);
  const state = { rows: { srs_cards: (o.cloudRows || []).slice() }, uid: o.uid || 'uid-A', rpcError: o.rpcError || null };
  const sb = makeSb(state);
  const runtime = { currentUser: o.noSession ? null : { id: state.uid }, lastSnapshot: undefined };
  const sessionHandle = { owner: state.uid, uid: state.uid, dataRef: SMRp.data };

  const src = [
    'const SRS_KEY_OK = /^q-[0-9a-f]{16}(?:-\\d+)?$/;',
    'const SRS_CARD_LIMIT = 500;',
    'const SRS_CLEARS_KEY = ' + JSON.stringify(SRS_CLEARS_KEY) + ';',
    'const LIVE_OWNER_KEY = ' + JSON.stringify('liveOwner') + ';',
    'const GUEST_OWNER = ' + JSON.stringify('__guest__') + ';',
    extractFn(srcProgress, 'function readLiveOwner('),
    extractFn(srcProgress, 'function liveOwnerFor('),
    extractFn(srcProgress, 'function slotOwnerOrUnknown('),
    extractFn(srcProgress, 'function srsValidCard('),
    extractFn(srcProgress, 'function readSrsClears('),
    extractFn(srcProgress, 'function writeSrsClears('),
    extractFn(srcProgress, 'function applySrsClear('),
    extractFn(srcProgress, 'function markSrsDeleted('),
    extractFn(srcProgress, 'function markSrsRevive('),
    extractHooks(),
    extractFn(srcProgress, 'async function syncSrsCards(')
  ].join('\n');

  const env = new Function(
    'global', 'SMR', 'sb', 'runtime', 'warn', 'sessionChangedFor', 'originalSave', 'snapshotProgress',
    src + '\n; return { syncSrsCards, readSrsClears };'
  )(
    g, SMR, sb, runtime, () => {},
    () => !!o.sessionChanged,
    SMRp.save.bind(SMRp),
    () => 'snap'
  );

  return { g, SMR, SMRp, sb, state, env, storage, store, ID_A: g.SMR.srs.idOf('t-t1', 0), ID_B: g.SMR.srs.idOf('t-t1', 1) };
}

/* ------------------------------------------------------------------ */

let passed = 0, failed = 0;
const failures = [];
function record(name) { passed++; console.log('  ✓ ' + name); }
function fail(name, e) { failed++; failures.push({ name, e }); console.log('  ✗ ' + name + ' → ' + (e && e.message)); }
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert falló'); }
function rpcCards(h, key) {
  const all = [];
  h.sb.calls.filter((c) => c.rpc).forEach((c) => c.cards.forEach((card) => all.push(card)));
  return key ? all.filter((c) => c.question_key === key) : all;
}
const sync = (h, now) => h.env.syncSrsCards(h.state.uid, now || 1000, { owner: h.state.uid, uid: h.state.uid, dataRef: h.SMRp.data });

async function main() {
  const ID = makeHarness({}).ID_A; /* clave estable real del banco de prueba */

  /* --- 1. visitante: borrado local + marca, 0 llamadas RPC --- */
  try {
    const h = makeHarness({ noSession: true, srsLocal: { [ID]: { level: 2, due: 5000 } } });
    h.SMRp.dropSrs('t-t1', 0);
    assert(!h.SMRp.data.tests.srs[ID], 'la tarjeta local debe desaparecer');
    assert(h.env.readSrsClears()[ID] === 'pending', 'marca esperada pending, hay ' + h.env.readSrsClears()[ID]);
    assert(h.sb.calls.length === 0, 'modo visitante no debe llamar al cloud');
    record('visitante: dropSrs borra local y deja marca pending sin RPC');
  } catch (e) { fail('visitante', e); }

  /* --- 2. sin ID estable: borrado solo local, sin marca --- */
  try {
    const h = makeHarness({ srsLocal: { [ID]: { level: 1, due: 5000 } } });
    h.SMRp.dropSrs('t-inexistente', 0);
    assert(Object.keys(h.env.readSrsClears()).length === 0, 'no debe haber marcas sin clave estable');
    record('dropSrs sin ID estable: sin marca (no hay clave que subir)');
  } catch (e) { fail('sin ID estable', e); }

  /* --- 3. re-valorar una pregunta borrada marca revive --- */
  try {
    const h = makeHarness({ srsLocal: { [ID]: { level: 2, due: 5000 } } });
    h.SMRp.dropSrs('t-t1', 0);
    h.SMRp.scheduleSrs('t-t1', 0, 2);
    assert(h.env.readSrsClears()[ID] === 'revive', 'marca esperada revive, hay ' + h.env.readSrsClears()[ID]);
    assert(h.SMRp.data.tests.srs[ID].level === 1, 'tarjeta local recreada con nivel 1');
    record('scheduleSrs tras dropSrs: marca revive + tarjeta local recreada');
  } catch (e) { fail('revive', e); }

  /* --- 4. offline: el tombstone se reintenta y no resucita la fila viva --- */
  try {
    const live = { user_id: 'uid-A', question_key: ID, level: 3, due: 9000, client_updated_at: 5, deleted_at: null };
    const h = makeHarness({ srsLocal: {}, clears: { [ID]: 'pending' }, cloudRows: [live], rpcError: 'network offline' });
    await sync(h);
    assert(!h.SMRp.data.tests.srs[ID], 'la fila cloud viva NO debe reinstalarse con borrado pending');
    assert(h.env.readSrsClears()[ID] === 'pending', 'la marca pending se conserva al fallar el push');
    assert(rpcCards(h, ID).some((c) => c.deleted === true), 'el push intenta el tombstone');
    assert(!rpcCards(h, ID).some((c) => c.deleted !== true), 'no debe subirse tarjeta viva de una clave borrada');
    h.state.rpcError = null;
    await sync(h, 2000);
    const row = h.state.rows.srs_cards.find((r) => r.question_key === ID);
    assert(row && row.deleted_at, 'tras el reintento el cloud queda con tombstone');
    record('offline: reintento propaga el tombstone (sin resurrección local)');
  } catch (e) { fail('offline', e); }

  /* --- 5. dispositivo obsoleto con tombstone en cloud: no resucita --- */
  try {
    const tomb = { user_id: 'uid-A', question_key: ID, level: 3, due: 9000, client_updated_at: 7, deleted_at: 111 };
    const h = makeHarness({ srsLocal: { [ID]: { level: 3, due: 9000 } }, cloudRows: [tomb] });
    await sync(h);
    assert(!h.SMRp.data.tests.srs[ID], 'la copia local obsoleta debe retirarse');
    assert(h.env.readSrsClears()[ID] === 'known', 'marca esperada known, hay ' + h.env.readSrsClears()[ID]);
    assert(!rpcCards(h, ID).some((c) => c.deleted !== true), 'el dispositivo obsoleto no re-sube la tarjeta viva');
    assert(h.state.rows.srs_cards[0].deleted_at, 'el cloud sigue borrado tras el pull→merge→push');
    record('anti-resurrección entre dispositivos: pull→merge→push mantiene el tombstone');
  } catch (e) { fail('anti-resurrección', e); }

  /* --- 6. revive confirmado: sube revived y limpia la marca --- */
  try {
    const tomb = { user_id: 'uid-A', question_key: ID, level: 0, due: 1, client_updated_at: null, deleted_at: 111 };
    const h = makeHarness({ srsLocal: {}, clears: { [ID]: 'known' }, cloudRows: [tomb] });
    h.SMRp.scheduleSrs('t-t1', 0, 2); /* re-valoración del propietario */
    assert(h.env.readSrsClears()[ID] === 'revive', 'marca revive tras re-valorar');
    await sync(h);
    const sent = rpcCards(h, ID);
    assert(sent.length === 1 && sent[0].revived === true && sent[0].level === 1, 'push live+revived, hay ' + JSON.stringify(sent));
    const row = h.state.rows.srs_cards.find((r) => r.question_key === ID);
    assert(row && !row.deleted_at && row.level === 1, 'el cloud revive con el nivel local');
    assert(h.env.readSrsClears()[ID] === undefined, 'marca eliminada tras confirmar el push');
    record('revive: live+revived limpia el tombstone y la marca');
  } catch (e) { fail('revive confirmado', e); }

  /* --- 7. marca known + fila viva: alguien revivió en otro dispositivo --- */
  try {
    const live = { user_id: 'uid-A', question_key: ID, level: 4, due: 12000, client_updated_at: 50, deleted_at: null };
    const other = { user_id: 'uid-A', question_key: makeHarness({}).ID_B, level: 2, due: 1000, client_updated_at: 60, deleted_at: null };
    const h = makeHarness({ srsLocal: {}, clears: { [ID]: 'known' }, cloudRows: [live, other] });
    await sync(h);
    assert(h.SMRp.data.tests.srs[ID] && h.SMRp.data.tests.srs[ID].level === 4, 'la fila revivida debe aceptarse');
    assert(h.env.readSrsClears()[ID] === undefined, 'la marca known ya no es necesaria');
    assert(h.SMRp.data.tests.srs[h.ID_B] && h.SMRp.data.tests.srs[h.ID_B].level === 2, 'las demás tarjetas siguen sanas');
    record('known + fila viva: revive ajeno aceptado; otras tarjetas intactas');
  } catch (e) { fail('known + viva', e); }

  /* --- 8. cambio de sesión en vuelo: ni push ni mutación --- */
  try {
    const live = { user_id: 'uid-A', question_key: ID, level: 3, due: 9000, client_updated_at: 5, deleted_at: null };
    const h = makeHarness({ sessionChanged: true, srsLocal: { [ID]: { level: 1, due: 5000 } }, clears: { [ID]: 'pending' }, cloudRows: [live] });
    await sync(h);
    assert(!h.sb.calls.some((c) => c.rpc), 'no debe haber push con la sesión cambiada');
    assert(h.SMRp.data.tests.srs[ID] && h.SMRp.data.tests.srs[ID].level === 1, 'local intacto');
    assert(h.env.readSrsClears()[ID] === 'pending', 'marca intacta');
    record('cambio de sesión en vuelo: sin push y sin mutaciones');
  } catch (e) { fail('sesión cambiada', e); }

  /* --- 9. borrar una tarjeta no toca las demás --- */
  try {
    const h = makeHarness({ srsLocal: { [ID]: { level: 2, due: 5000 } } });
    const idB = h.ID_B;
    h.SMRp.data.tests.srs[idB] = { level: 3, due: 6000 };
    h.SMRp.dropSrs('t-t1', 0);
    await sync(h);
    assert(!h.SMRp.data.tests.srs[ID], 'la borrada se retira');
    assert(h.SMRp.data.tests.srs[idB] && h.SMRp.data.tests.srs[idB].level === 3, 'la otra tarjeta se conserva y se sube');
    record('el borrado no daña el resto del estado SRS');
  } catch (e) { fail('resto intacto', e); }

  /* --- 10. marcas corruptas se descartan, la válida se conserva --- */
  try {
    const h = makeHarness({ srsLocal: {} });
    h.store.set(SRS_CLEARS_KEY, { 'q-0000000000000000': 'raro', 'clave-mala': 'pending', [ID]: 'pending' });
    const clears = h.env.readSrsClears();
    assert(Object.keys(clears).length === 1 && clears[ID] === 'pending', 'solo la marca válida sobrevive: ' + JSON.stringify(clears));
    record('marcas corruptas se descartan (validación en la frontera)');
  } catch (e) { fail('marcas corruptas', e); }

  /* --- 11. contrato de aislamiento y de servidor (checks estáticos) --- */
  try {
    assert(/const SLOT_KEYS = \[[^\]]*'progressSyncSrsClears'[^\]]*\];/.test(srcProgress),
      'la marca debe ser clave de slot para heredar el aislamiento por propietario');
    const sql = fs.readFileSync('supabase/migrations/00008_srs_delete_tombstones.sql', 'utf8');
    assert(/add column if not exists deleted_at bigint/.test(sql), '00008 debe añadir deleted_at');
    assert(/revived/.test(sql) && /deleted_at = case when excluded\.deleted_at is not null/.test(sql),
      '00008 debe implementar revive y tombstone pegajoso');
    const sqlCode = sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    assert(!/level = -1|due = -1/.test(sqlCode), '00008 no debe usar el sentinel inválido (-1) en el código');
    record('aislamiento (SLOT_KEYS) y contrato de 00008 verificados estáticamente');
  } catch (e) { fail('checks estáticos', e); }

  console.log('\n── resumen ──');
  console.log('OK: ' + passed + '   FAIL: ' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('runner:', e); process.exit(1); });

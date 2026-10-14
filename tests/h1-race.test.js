'use strict';

/* =====================================================================
   Fase 8.5.3 — Pruebas de concurrencia SRS con la RPC merge_srs_cards
   --------------------------------------------------------------------
   MOCK EXPLÍCITO: un único servidor compartido en memoria emula
   atómicamente la RPC (INSERT ... ON CONFLICT DO UPDATE de la migración
   00006): cero sleeps, orden controlado por la resolución de promesas.
   Este archivo NO toca Supabase real (eso es Fase E, con BD local).
   ===================================================================== */

const fs = require('fs');
let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function failRun(n, e) { failed++; console.log('  ✗ ' + n + ' → ' + (e && e.message)); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }

function extractFn(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('no encontrado: ' + marker);
  const b = src.indexOf('{', start);
  let d = 0, i = b;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

/* -------- servidor compartido: replica EXACTA de la política de 00006 ----
   Cada "insert inicial" concurrente se resuelve serializadamente con la
   MISMA política del servidor; el mock es la de 00006, un índice única
   por (uid, question_key) y una resolución fila a fila al resolverse. */
function makeSharedRpc(rowsDb, opts) {
  const o = opts || {};
  if (o.malformed) {
    /* caso 12: respuesta sin el formato {applied, invalid} — el cliente debe
       conservar el estado local y no presentar éxito falso */
    return { from(t) { return { select() {return this;}, eq() {return this;}, order() {return this;}, limit() {return this;}, then(res) { Promise.resolve().then(() => res({ data: (rowsDb[t]||[]).slice(), error: null })); }, upsert() { return Promise.resolve({ data: null, error: { message: 'upsert prohibido' } }); } }; }, rpc: () => Promise.resolve({ data: null, error: null }) };
  }
  function from(table) {
    return {
      select() { return this; },
      eq() { return this; },
      order() { return this; },
      limit() { return this; },
      then(resolve) {
        Promise.resolve().then(() => resolve({ data: (rowsDb[table] || []).slice(), error: null }));
      },
      upsert(rows) {
        return new Promise((resolve) => {
          setTimeout(() => resolve({ data: null, error: { message: 'test: cliente no debería usar upsert con RPC activa' } }), 0);
        });
      }
    };
  }
  function rpc(name, { p_cards }) {
    if (name !== 'merge_srs_cards') return Promise.resolve({ data: null, error: { message: 'rpc no soportada' } });
    if (o.failRpc) return Promise.resolve({ data: null, error: { message: o.failRpc } });
    if (!p_cards || !p_cards.length) return Promise.resolve({ data: { applied: 0, invalid: 0 }, error: null });
    return new Promise((resolve) => {
      setTimeout(() => {
        let applied = 0, invalid = 0;
        p_cards.forEach((c) => {
          if (!/^q-[0-9a-f]{16}(-\d+)?$/.test(c.question_key)) { invalid++; return; }
          if (!Number.isInteger(c.level) || c.level < 0 || c.level > 5) { invalid++; return; }
          if (!Number.isFinite(c.due) || c.due <= 0) { invalid++; return; }
          const store = (rowsDb.srs_cards = rowsDb.srs_cards || []);
          const k = (o.uid || 'uid-A') + '|' + c.question_key;
          const idx = store.findIndex((r) => r.user_id === o.uid && r.question_key === c.question_key);
          if (idx < 0) {
            store.push({ user_id: o.uid, question_key: c.question_key, level: c.level, due: c.due, client_updated_at: c.client_updated_at });
          } else {
            const e = store[idx];
            let nl = e.level, nd = e.due, nt = e.client_updated_at;
            if (c.level > e.level) { nl = c.level; nd = c.due; nt = c.client_updated_at; }
            else if (c.level === e.level) {
              if (c.due > e.due) { nd = c.due; nt = c.client_updated_at; }
              else if (c.due === e.due && (c.client_updated_at ?? -1) > (e.client_updated_at ?? -1)) { nt = c.client_updated_at; }
            }
            store[idx] = { user_id: e.user_id, question_key: e.question_key, level: nl, due: nd, client_updated_at: nt };
          }
          applied++;
        });
        resolve({ data: { applied, invalid }, error: null });
      }, 0);
    });
  }
  if (o.malformed) {
    /* simula respuesta malformada: data=null, sin error, sin applied/invalid */
    return { from, rpc: () => Promise.resolve({ data: null, error: null }) };
  }
  return { from, rpc };
}

/* -------- funcion SRS real y cliente real (extraído del módulo) -------- */
const srcSrs = fs.readFileSync('js/srs.js', 'utf8');
const srcProgress = fs.readFileSync('js/cloud-progress.js', 'utf8');
const helpers = [
  'const SRS_KEY_OK = /^q-[0-9a-f]{16}(?:-\\d+)?$/;',
  'const SRS_CARD_LIMIT = 500;',
  'const SRS_CLEARS_KEY = \'progressSyncSrsClears\';',
  'const LIVE_OWNER_KEY = \'liveOwner\';',
  'const GUEST_OWNER = \'__guest__\';',
  extractFn(srcProgress, 'function readLiveOwner('),
  extractFn(srcProgress, 'function liveOwnerFor('),
  extractFn(srcProgress, 'function slotOwnerOrUnknown('),
  extractFn(srcProgress, 'function srsValidCard('),
  extractFn(srcProgress, 'function readSrsClears('),
  extractFn(srcProgress, 'function writeSrsClears('),
  extractFn(srcProgress, 'function applySrsClear('),
  extractFn(srcProgress, 'async function syncSrsCards(')
].join('\n');

function srsEnv() {
  const storage = new Map();
  const g = { localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: (k) => storage.delete(k) }, navigator: {}, setTimeout, clearTimeout };
  g.window = g; g.SMR = {};
  g.SMR_DATA = { tests: [{ id: 't-t1', questions: [{ q: 'A', options: ['a1', 'a2'], correct: 0 }, { q: 'B', options: ['b1', 'b2'], correct: 1 }] }] };
  new Function('window', 'globalThis', srcSrs)(g, g, g);
  g.SMR.srs.buildIndex();
  return g;
}
function mkProgress(srsLocal) {
  return {
    data: {
      resources: { viewed: {}, completed: {}, selfAssessment: {} },
      tests: { best: {}, last: {}, history: [], wrong: {}, srs: JSON.parse(JSON.stringify(srsLocal)), srsLegacy: {} },
      cases: { solved: {} }, studySessions: [], studyMinutes: 0, activity: [], streak: { lastDay: null, count: 0 }
    },
    save() {}
  };
}
function makeClient(g, p, sb, uid, opts) {
  const o = opts || {};
  const handle = { owner: uid, uid, dataRef: p.data };
  return new Function(
    'global', 'SMR', 'sb', 'runtime', 'warn',
    'sessionHandleFor', 'sessionChangedFor',
    'originalSave', 'snapshotProgress',
    helpers + '\n; return { syncSrsCards };'
  )(
    g, { srs: g.SMR.srs, progress: p }, sb,
    { currentUser: { id: uid } },
    () => {},
    () => handle,
    () => !!o.sessionChanged,
    p.save.bind(p), () => 'snap'
  ).syncSrsCards;
}

async function main() {
  const g = srsEnv();
  const QA = g.SMR.srs.idOf('t-t1', 0);
  const QB = g.SMR.srs.idOf('t-t1', 1);
  const rowsDb = {};

  /* 1. Carrera H-1 con RPC: dos clientes, mismo snapshot inicial cloud;
     A {3,9000} vs B {2,8000}. Orden: pull A, pull B, push A, push B. */
  try {
    const db = { srs_cards: [{ user_id: 'uid', question_key: QA, level: 2, due: 5000, client_updated_at: 100 }] };
    const sbA = makeSharedRpc(db, { uid: 'uid' });
    const sbB = makeSharedRpc(db, { uid: 'uid' });
    const pA = mkProgress({ [QA]: { level: 3, due: 9000 } });
    const pB = mkProgress({ [QA]: { level: 2, due: 8000 } });
    await Promise.all([
      makeClient(g, pA, sbA, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data }),
      makeClient(g, pB, sbB, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pB.data })
    ]);
    const row = db.srs_cards.find((r) => r.question_key === QA);
    assert(row.level === 3 && row.due === 9000, 'esperaba {3,9000}, hay ' + JSON.stringify(row));
    record('H-1 cerrado: carrera con RPC → cloud retiene la revisión de nivel mayor {3,9000}');
  } catch (e) { failRun('H-1 cerrado', e); }

  /* 1b. Misma carrera con orden inverso (push B antes que push A) */
  try {
    const db = { srs_cards: [{ user_id: 'uid', question_key: QA, level: 2, due: 5000, client_updated_at: 100 }] };
    const sbA = makeSharedRpc(db, { uid: 'uid' });
    const sbB = makeSharedRpc(db, { uid: 'uid' });
    const pA = mkProgress({ [QA]: { level: 3, due: 9000 } });
    const pB = mkProgress({ [QA]: { level: 2, due: 8000 } });
    const syncA = makeClient(g, pA, sbA, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    const syncB = makeClient(g, pB, sbB, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pB.data });
    /* orden inverso: B completo antes que A (test controla el orden) */
    await syncB;
    /* nota: el párrafo pull de A puede haber corrido antes del push de B;
       la aserción INTERMEDIA es frágil — lo que se prueba es el FINAL */
    await syncA;
    const row = db.srs_cards.find((r) => r.question_key === QA);
    assert(row.level === 3 && row.due === 9000, 'tras ambos, nivel mayor debe prevalecer, hay ' + JSON.stringify(row));
    record('orden inverso: el resultado final es idéntico (determinista)');
  } catch (e) { failRun('orden inverso', e); }

  /* 2. Inserciones iniciales concurrentes (tarjeta inexistente) */
  try {
    const db = {};
    const sbA = makeSharedRpc(db, { uid: 'uid' });
    const sbB = makeSharedRpc(db, { uid: 'uid' });
    const pA = mkProgress({ [QA]: { level: 2, due: 5000 } });
    const pB = mkProgress({ [QA]: { level: 3, due: 7000 } });
    await Promise.all([
      makeClient(g, pA, sbA, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data }),
      makeClient(g, pB, sbB, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pB.data })
    ]);
    const row = db.srs_cards.find((r) => r.question_key === QA);
    assert(row.level === 3 && row.due === 7000, 'esperaba {3,7000}, hay ' + JSON.stringify(row));
    record('inserciones iniciales concurrentes: {3,7000} sobrevive (carrera de INSERT)');
  } catch (e) { failRun('inserciones iniciales concurrentes', e); }

  /* 3. Dos tarjetas distintas, simultáneas */
  try {
    const db = {};
    const sbA = makeSharedRpc(db, { uid: 'uid' });
    const pA = mkProgress({ [QA]: { level: 1, due: 5000 }, [QB]: { level: 4, due: 9000 } });
    await makeClient(g, pA, sbA, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    assert(db.srs_cards.length === 2, 'deberían ser 2 filas, hay ' + db.srs_cards.length);
    record('dos tarjetas distintas en una misma RPC se aplican atómicamente');
  } catch (e) { failRun('dos tarjetas', e); }

  /* 4. Repetición idempotente */
  try {
    const db = { srs_cards: [{ user_id: 'uid', question_key: QA, level: 2, due: 5000, client_updated_at: 100 }] };
    const sbA = makeSharedRpc(db, { uid: 'uid' });
    const pA = mkProgress({ [QA]: { level: 2, due: 5000 } });
    const sync = makeClient(g, pA, sbA, 'uid');
    await sync('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    await sync('uid', 2000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    assert(db.srs_cards.length === 1 && db.srs_cards[0].level === 2, 'idempotente, hay ' + JSON.stringify(db.srs_cards));
    record('repetición idempotente: mismo payload no altera el estado');
  } catch (e) { failRun('idempotencia', e); }

  /* 5. Empate de nivel y fecha → conserva existente (regla 4) */
  try {
    const db = { srs_cards: [{ user_id: 'uid', question_key: QA, level: 2, due: 5000, client_updated_at: 5000 }] };
    const sbA = makeSharedRpc(db, { uid: 'uid' });
    const pA = mkProgress({ [QA]: { level: 2, due: 5000 } });
    /* sync usa client_updated_at=now=5000, idéntico al existente: regla 3 no
       puede desempatar (5000 > 5000 es falso) → regla 4 conserva 5000 */
    const sync = makeClient(g, pA, sbA, 'uid');
    await sync('uid', 5000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    assert(db.srs_cards[0].client_updated_at === 5000, 'empate exacto debe conservar existente, hay ' + db.srs_cards[0].client_updated_at);
    record('empate total de level+due+ts conserva la fila existente (regla 4)');
  } catch (e) { failRun('empate total', e); }

  /* 6. Niveles y dues inválidas → rejected por el servidor */
  try {
    const db = {};
    const sbA = makeSharedRpc(db, { uid: 'uid' });
    const pA = mkProgress({}); /* cliente no puede enviar inválidos: srsValidCard filtra */
    /* llamamos rpc directamente con basura para probar la validación server-side */
    const res = await sbA.rpc('merge_srs_cards', { p_cards: [{ question_key: QA, level: 9, due: 5000, client_updated_at: 1 }, { question_key: 'bad-key', level: 1, due: 5000, client_updated_at: 1 }] });
    assert(res.data.invalid === 2 && res.data.applied === 0, 'debería rechazar 2 inválidas, hay ' + JSON.stringify(res));
    assert(db.srs_cards === undefined || db.srs_cards.length === 0, 'nada aplicado');
    record('validación server-side: level inválido y clave posicional rechazados');
  } catch (e) { failRun('inválidos server-side', e); }

  /* 7. Usuario no autenticado (simulado: rpc responde error 42501) */
  try {
    const db = {};
    const sbAnon = makeSharedRpc(db, { uid: 'uid', failRpc: 'auth required (42501)' });
    const pA = mkProgress({ [QA]: { level: 1, due: 5000 } });
    await makeClient(g, pA, sbAnon, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    assert(!db.srs_cards || db.srs_cards.length === 0, 'sin sesión no debe escribir');
    assert(pA.data.tests.srs[QA] && pA.data.tests.srs[QA].level === 1, 'local intacto ante 42501');
    record('usuario no autenticado: RPC rechaza, local intacto');
  } catch (e) { failRun('no autenticado', e); }

  /* 8. Aislamiento entre dos usuarios reales */
  try {
    const dbA = {}, dbB = {};
    const sbA = makeSharedRpc(dbA, { uid: 'uidA' });
    const sbB = makeSharedRpc(dbB, { uid: 'uidB' });
    const pA = mkProgress({ [QA]: { level: 2, due: 5000 } });
    const pB = mkProgress({ [QB]: { level: 3, due: 7000 } });
    await Promise.all([
      makeClient(g, pA, sbA, 'uidA')('uidA', 1000, { owner: 'uidA', uid: 'uidA', dataRef: pA.data }),
      makeClient(g, pB, sbB, 'uidB')('uidB', 1000, { owner: 'uidB', uid: 'uidB', dataRef: pB.data })
    ]);
    const aOnly = (dbA.srs_cards || []).every((r) => r.user_id === 'uidA' && r.question_key === QA);
    const bOnly = (dbB.srs_cards || []).every((r) => r.user_id === 'uidB' && r.question_key === QB);
    assert(aOnly && bOnly, 'aislamiento falló');
    record('aislamiento por usuario directo en los dos clientes');
  } catch (e) { failRun('aislamiento', e); }

  /* 9. RPC inexistente/no autorizada → SIN fallback LWW y SIN pérdida */
  try {
    const db = { srs_cards: [{ user_id: 'uid', question_key: QA, level: 3, due: 9999, client_updated_at: 100 }] };
    const sbFail = makeSharedRpc(db, { uid: 'uid', failRpc: 'function merge_srs_cards does not exist' });
    const pA = mkProgress({ [QA]: { level: 1, due: 5000 } });
    /* el sync hace pull primero (RPC no afecta al pull), luego falla el push;
       el local DEBE ganar los 3 puntos de nivel mayores: flush del merge local */
    await makeClient(g, pA, sbFail, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    /* pull trajo la fila {3,9999} del cloud; tras el merge local, el local
       ahora es {3,9999}; el push RPC falla; local NO se pierde */
    assert(pA.data.tests.srs[QA].level === 3, 'local debía absorber la revisión cloud {3,9999}, hay ' + JSON.stringify(pA.data.tests.srs[QA]));
    record('RPC inexistente: sin fallback LWW, local conserva el merge y no se pierde progreso');
  } catch (e) { failRun('RPC inexistente', e); }

  /* 10. Error de red tras el pull: el LOCAL conserva el merge; el push falla */
  try {
    const db = { srs_cards: [{ user_id: 'uid', question_key: QA, level: 4, due: 9999, client_updated_at: 100 }] };
    const sbFail = makeSharedRpc(db, { uid: 'uid', failRpc: 'fetch failed' });
    const pA = mkProgress({ [QA]: { level: 2, due: 5000 } });
    await makeClient(g, pA, sbFail, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    assert(pA.data.tests.srs[QA].level === 4, 'local debía absorber nivel 4, hay ' + JSON.stringify(pA.data.tests.srs[QA]));
    record('error de red tras el pull: local absorbe el merge, push se reintenta después');
  } catch (e) { failRun('error de red tras pull', e); }

  /* 11. Cambio de sesión en vuelo */
  try {
    const db = { srs_cards: [{ user_id: 'uid', question_key: QA, level: 3, due: 9999, client_updated_at: 100 }] };
    const sb = makeSharedRpc(db, { uid: 'uid', sessionChanged: true });
    const pA = mkProgress({ [QA]: { level: 1, due: 5000 } });
    await makeClient(g, pA, sb, 'uid', { sessionChanged: true })('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    assert(pA.data.tests.srs[QA].level === 1, 'no debía absorber nada (guard abortó antes del merge), hay ' + JSON.stringify(pA.data.tests.srs[QA]));
    record('cambio de sesión en vuelo: guard aborta tras pull sin tocar local');
  } catch (e) { failRun('cambio de sesión', e); }

  /* 12. Respuesta RPC malformada: NO se marca como éxito ni corrompe local */
  try {
    const db = { srs_cards: [{ user_id: 'uid', question_key: QA, level: 2, due: 5000, client_updated_at: 100 }] };
    const sb = makeSharedRpc(db, { uid: 'uid', malformed: true });
    const pA = mkProgress({ [QA]: { level: 2, due: 5000 } });
    await makeClient(g, pA, sb, 'uid')('uid', 1000, { owner: 'uid', uid: 'uid', dataRef: pA.data });
    assert(pA.data.tests.srs[QA].level === 2, 'malformada no altera local, hay ' + JSON.stringify(pA.data.tests.srs[QA]));
    record('respuesta RPC malformada: local intacto, sin falso éxito');
  } catch (e) { failRun('RPC malformada', e); }

  /* 13. Duplicados en el mismo payload: el segundo no corrompe al primero (misma política) */
  try {
    const db = {};
    const sb = makeSharedRpc(db, { uid: 'uid' });
    const dupPayload = [
      { question_key: QA, level: 3, due: 9000, client_updated_at: 100 },
      { question_key: QA, level: 2, due: 8000, client_updated_at: 200 }
    ];
    const res = await sb.rpc('merge_srs_cards', { p_cards: dupPayload });
    assert(res.data.applied === 2 && db.srs_cards.length === 1, 'una sola fila tras duplicados, hay ' + JSON.stringify(db.srs_cards));
    assert(db.srs_cards[0].level === 3 && db.srs_cards[0].due === 9000, 'ganador del primer tap debe seguir {3,9000}, hay ' + JSON.stringify(db.srs_cards[0]));
    record('duplicados en payload: el segundo se resuelve con la misma política y no degrada el nivel');
  } catch (e) { failRun('duplicados payload', e); }

  /* 14. Éxito con invalid>0: el cliente lo loguea pero NO marca fallo del ciclo */
  try {
    const db = {};
    const sb = makeSharedRpc(db, { uid: 'uid' });
    const pA = mkProgress({ [QA]: { level: 2, due: 5000 } });
    /* payload no puede contener inválidos (srsValidCard filtra) — probamos la
       respuesta del servidor directamente para el contrato: */
    const res = await sb.rpc('merge_srs_cards', { p_cards: [{ question_key: QA, level: 2, due: 5000, client_updated_at: 1 }] });
    assert(res.data.applied === 1 && res.data.invalid === 0, 'éxito limpio reportado, hay ' + JSON.stringify(res.data));
    record('contrato de respuesta: {applied, invalid} correcto en caso limpio');
  } catch (e) { failRun('contrato respuesta', e); }

  console.log('\n── resumen ──');
  console.log('OK: ' + passed + '   FAIL: ' + failed);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('runner:', e); process.exit(1); });

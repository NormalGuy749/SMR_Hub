'use strict';
/* Caracterización del cliente actual: los checks confirman huecos existentes,
   no una corrección ni el funcionamiento de PostgreSQL/RLS. Solo transporte simulado. */
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const { load } = require('./study-guided.test');
const source = fs.readFileSync('js/cloud-progress.js', 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
let passed = 0, failed = 0;
function server() {
  const tables = {}, reads = [], writes = [];
  const keys = {
    test_attempts: ['test_id', 'mode', 'created_at'], study_sessions: ['created_at', 'minutes', 'steps'],
    activity_events: ['label', 'meta', 'created_at'], wrong_answer_events: ['test_id', 'question_key', 'event_type', 'client_created_at']
  };
  return { tables, reads, writes, keys, rows(t) { return tables[t] || (tables[t] = []); } };
}
function device(db, uid = 'A') {
  const h = load(), g = h.g;
  vm.runInContext('SMR.progress.data = defaultProgress();', g);
  const store = new Map();
  Object.assign(g.SMR.store, {
    get(k, fallback = null) { return store.has(k) ? clone(store.get(k)) : fallback; },
    writeMerged(k, v) { store.set(k, clone(v)); return v; },
    set(k, v) { store.set(k, clone(v)); return true; }, remove(k) { store.delete(k); }
  });
  g.setTimeout = () => 1; g.clearTimeout = () => {}; // El test llama explícitamente al envío/pull.
  g.SMR.cloudAvailable = true;
  const sb = {
    from(table) {
      let filters = [], ordering, max = Infinity;
      const chain = {
        select() { return chain; }, eq(k, v) { filters.push([k, v]); return chain; },
        order(k, o) { ordering = [k, o]; return chain; }, limit(n) { max = n; return chain; },
        async upsert(rows, opts) {
          rows = Array.isArray(rows) ? rows : [rows];
          for (const row of rows) {
            const pk = opts.onConflict.split(',');
            const prev = db.rows(table).find(r => pk.every(k => r[k] === row[k]));
            if (prev) Object.assign(prev, clone(row)); else db.rows(table).push(clone(row));
          }
          db.writes.push({ table, rows: clone(rows) });
          if (db.holdWrite) await db.holdWrite(table);
          return { error: null };
        },
        async then(resolve, reject) {
          try {
            db.reads.push(table);
            let rows = db.rows(table).filter(r => filters.every(([k, v]) => r[k] === v));
            if (ordering) rows = rows.slice().sort((a,b) => (a[ordering[0]] - b[ordering[0]]) * (ordering[1].ascending ? 1 : -1));
            const result = { data: clone(rows.slice(0, max)), error: null };
            if (db.holdRead) await db.holdRead(table);
            resolve(result);
          } catch(e) { reject(e); }
        }
      };
      return chain;
    },
    async rpc(name, args) {
      assert.equal(name, 'sync_progress_chunk', 'este mock no implementa merge SRS');
      if (db.fail) return { error: { message: 'network unavailable' } };
      for (const event of args.p_events) {
        const row = { ...clone(event), user_id: g.audit.runtime.currentUser.id };
        if (!db.rows(args.p_table).some(r => r.user_id === row.user_id && db.keys[args.p_table].every(k => r[k] === row[k]))) db.rows(args.p_table).push(row);
      }
      return { data: args.p_events.length, error: null };
    }
  };
  g.SMR.cloud = sb;
  // Expone funciones privadas solo en la copia en memoria; no altera el archivo productivo.
  const marker = '  wire();\n})(typeof window';
  assert(source.includes(marker));
  vm.runInContext(source.replace(marker, '  global.audit = { runtime, pullInitial, pushEvents, pushState, sessionHandleFor, syncResourceState, syncCaseSolutions, notifySlot };\n})(typeof window'), g);
  g.audit.runtime.currentUser = { id: uid };
  g.SMR.store.set('liveOwner', { owner: uid, v: 1 });
  const p = g.SMR.progress, api = g.audit;
  return { ...h, storage: store, p, api, pull: () => api.pullInitial(uid, api.sessionHandleFor()), async push() { await api.pushEvents(); for(let i=0;i<50;i++) await Promise.resolve(); },
    answer(ok) { p.recordTest({ testId: h.first.id, title: h.first.title, mode: 'practica', correct: ok ? 1 : 0, total: 1, answers: [{ origIndex: 0, ok }] }); h.advanceTime(1000); } };
}
async function check(name, fn) {
  try { await fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ': ' + e.message); }
}
(async () => {
  await check('add/add/clear via API real se envía, pero dispositivo vacío no reconstruye wrong', async () => {
    const db=server(), a=device(db); a.answer(false); a.answer(false); assert.equal(a.p.data.tests.wrong[a.first.id][a.id],2); a.answer(true);
    assert(!a.p.data.tests.wrong[a.first.id][a.id]); await a.push();
    assert.deepEqual(db.rows('wrong_answer_events').map(e=>e.event_type),['add','add','clear']);
    const b=device(db); await b.pull(); assert.deepEqual(clone(b.p.data.tests.wrong),{});
    assert(!db.reads.includes('wrong_answer_events'));
  });
  await check('fallos abiertos sí se pierden al reconstruir desde eventos en dispositivo vacío', async () => {
    const db=server(), a=device(db); a.answer(false); a.answer(false); await a.push(); const b=device(db); await b.pull();
    assert.equal(a.p.data.tests.wrong[a.first.id][a.id],2); assert.deepEqual(clone(b.p.data.tests.wrong),{});
  });
  await check('caché wrong: clear count=0 no elimina contador local; huérfana se instala sin resolver', async () => {
    const db=server(), a=device(db); a.answer(false);
    db.rows('wrong_answers').push({user_id:'A',test_id:a.first.id,question_key:a.id,count:0},{user_id:'A',test_id:'ausente',question_key:'q-0000000000000000',count:3});
    await a.pull(); assert.equal(a.p.data.tests.wrong[a.first.id][a.id],1); assert.equal(a.p.data.tests.wrong.ausente['q-0000000000000000'],3);
  });
  await check('eventos fuera de orden quedan almacenados y sin replay; A no es consultado al hacer pull de B (mock)', async () => {
    const db=server(), a=device(db); a.answer(false); a.answer(true); await a.push(); db.rows('wrong_answer_events').reverse();
    const b=device(db,'B'); await b.pull(); assert.equal(b.p.data.tests.history.length,0); assert.deepEqual(clone(b.p.data.tests.wrong),{});
  });
  await check('actividad: tipo/meta llegan al transporte, no hay pull ni reconstrucción', async () => {
    const db=server(), a=device(db); a.p.logActivity('caso','Evento','detalle'); await a.push();
    assert.equal(db.rows('activity_events')[0].event_type,'caso'); assert.equal(db.rows('activity_events')[0].meta,'detalle');
    const b=device(db); await b.pull(); assert.equal(b.p.data.activity.length,0); assert(!db.reads.includes('activity_events'));
  });
  await check('actividad: dos tipos con igual label/meta/ms colisionan en cola actual', async () => {
    const db=server(), a=device(db); a.p.logActivity('caso','Igual','meta'); a.p.logActivity('test','Igual','meta');
    assert.equal(a.p.data.activity.length,2); await a.push(); assert.equal(db.rows('activity_events').length,1);
  });
  await check('25 sesiones: cloud recibe 25; dispositivo vacío recupera 20 y solo 20/25 minutos', async () => {
    const db=server(), a=device(db); for(let i=0;i<25;i++){a.p.recordStudySession(1,1);a.advanceTime(1000);} await a.push();
    assert.equal(db.rows('study_sessions').length,25); assert.equal(a.p.data.studyMinutes,25);
    const b=device(db); await b.pull(); assert.equal(b.p.data.studySessions.length,20); assert.equal(b.p.data.studyMinutes,20);
    await b.pull(); assert.equal(b.p.data.studyMinutes,20); assert.equal(b.p.data.studySessions.length,20);
  });
  await check('dos sesiones distintas con misma tupla ts/minutes/steps se deduplican', async () => {
    const db=server(), a=device(db); a.p.recordStudySession(2,3);a.p.recordStudySession(2,3);await a.push();
    assert.equal(a.p.data.studyMinutes,4);assert.equal(db.rows('study_sessions').length,1);
  });
  await check('best remoto sin intentos recientes no vuelve al estado local', async () => {
    const db=server(); db.rows('test_scores').push({user_id:'A',test_id:'t-redes',best_pct:100,last_pct:75});
    const b=device(db); await b.pull(); await b.api.pushState(); assert.deepEqual(clone(b.p.data.tests.best),{}); assert.equal(db.rows('test_scores')[0].best_pct,100);
  });
  await check('pull de history reciente puede sobrescribir best cloud antiguo 100 con 50', async () => {
    const db=server(); db.rows('test_scores').push({user_id:'A',test_id:'t-redes',best_pct:100,last_pct:50});
    db.rows('test_attempts').push({user_id:'A',test_id:'t-redes',title:'Test de Redes',mode:'practica',correct:1,total:2,pct:50,created_at:1000});
    const b=device(db);await b.pull();assert.equal(db.rows('test_scores')[0].best_pct,50);
  });
  await check('respuesta tardía de upsert recursos A NO escribe resources sobre progreso B', async () => {
    const db=server(), a=device(db); a.p.data.resources.viewed['r-A']=1;let release;const wait=new Promise(r=>release=r);db.holdWrite=t=>t==='resource_state'?wait:undefined;
    db.rows('resource_state').push({user_id:'A',resource_id:'r-A',viewed_at:2});
    const pending=a.api.syncResourceState('A',100,a.api.sessionHandleFor()); for(let i=0;i<20;i++)await Promise.resolve();
    a.api.runtime.currentUser={id:'B'}; vm.runInContext('SMR.progress.data = defaultProgress();',a.g);a.g.SMR.store.set('liveOwner',{owner:'B',v:1});
    const before=JSON.stringify(a.p.data);release();await pending;assert.equal(JSON.stringify(a.p.data),before);
  });
  await check('pull tardío de A NO modifica racha en memoria de B', async () => {
    const db=server(), a=device(db);let release;const wait=new Promise(r=>release=r);db.holdRead=t=>t==='wrong_answers'?wait:undefined;
    db.rows('streak_days').push({user_id:'A',day:'2026-10-30'},{user_id:'A',day:'2026-10-31'});
    const pending=a.pull();for(let i=0;i<20;i++)await Promise.resolve();
    a.api.runtime.currentUser={id:'B'};vm.runInContext('SMR.progress.data = defaultProgress();',a.g);
    const before=JSON.stringify(a.p.data);release();await pending;assert.equal(JSON.stringify(a.p.data),before);
  });
  await check('control: recursos y casos sí reconstruyen el camino nominal en transporte simulado', async () => {
    const db=server(), a=device(db);a.p.data.resources={viewed:{'r-A':1},completed:{'r-A':2},selfAssessment:{'r-A':2}};
    a.p.data.cases.solved['caso-A']={option:'b',ts:3};await a.api.pushState();
    const b=device(db);await b.api.syncResourceState('A',100,b.api.sessionHandleFor());await b.api.syncCaseSolutions('A',100,b.api.sessionHandleFor());
    assert.equal(b.p.data.resources.completed['r-A'],2);assert.equal(b.p.data.resources.selfAssessment['r-A'],2);assert.equal(b.p.data.cases.solved['caso-A'].option,'b');
  });

  for (const change of ['nominal', 'refresh', 'B', 'logout', 'A-B-A', 'generación', 'pendiente', 'otra pestaña']) {
    await check('recursos retenidos: ' + change, async () => {
      const db=server(), a=device(db);a.p.data.resources.viewed['r-A']=1;
      db.rows('resource_state').push({user_id:'A',resource_id:'r-A',viewed_at:2});
      let entered,release;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
      db.holdWrite=async t=>{if(t==='resource_state'){entered();await wait;}};
      const pending=a.api.syncResourceState('A',100,a.api.sessionHandleFor());await ready;
      if(change==='A-B-A') {
        a.api.runtime.currentUser={id:'B'};
        a.g.SMR.store.set('liveOwner',{owner:'B',v:1});a.api.notifySlot('B');
      }
      if(change==='B'||change==='logout'||change==='A-B-A') {
        a.api.runtime.currentUser=change==='logout'?null:{id:change==='B'?'B':'A'};
        vm.runInContext('SMR.progress.data = defaultProgress();',a.g);
        a.g.SMR.store.set('liveOwner',{owner:change==='logout'?'__guest__':a.api.runtime.currentUser.id,v:1});
        a.api.notifySlot(change==='logout'?'__guest__':a.api.runtime.currentUser.id);
      }
      if(change==='generación')a.api.notifySlot('A');
      if(change==='refresh')a.api.runtime.currentUser={id:'A'};
      if(change==='pendiente')a.api.runtime.transitionPending=true;
      if(change==='otra pestaña') {
        const b=device(db,'B');b.g.SMR.store=a.g.SMR.store;
        b.g.SMR.store.set('liveOwner',{owner:'B',v:1});b.g.SMR.store.set('progress',clone(b.p.data));
      }
      a.api.runtime.lastSnapshot='sin cambios';
      const before=JSON.stringify(a.p.data),stored=JSON.stringify([...a.storage]);
      release();await pending;
      if(change==='nominal'||change==='refresh')assert.equal(a.p.data.resources.viewed['r-A'],2);
      else {assert.equal(JSON.stringify(a.p.data),before);assert.equal(JSON.stringify([...a.storage]),stored);assert.equal(a.api.runtime.lastSnapshot,'sin cambios');}
    });
  }
  await check('racha nominal se aplica al mismo propietario',async()=>{
    const db=server(),a=device(db);db.rows('streak_days').push({user_id:'A',day:'2026-10-30'},{user_id:'A',day:'2026-10-31'});
    await a.pull();assert.equal(a.p.data.streak.count,2);
  });
  await check('error de red en recursos no muta memoria ni guarda progreso',async()=>{
    const db=server(),a=device(db);db.rows('resource_state').push({user_id:'A',resource_id:'r-A',viewed_at:2});
    db.holdWrite=async()=>{throw Error('network');};const before=JSON.stringify(a.p.data),stored=JSON.stringify([...a.storage]);
    await assert.rejects(a.api.syncResourceState('A',100,a.api.sessionHandleFor()),/network/);
    assert.equal(JSON.stringify(a.p.data),before);assert.equal(JSON.stringify([...a.storage]),stored);
  });

  await check('casos: upsert tardío no guarda el slot nuevo ni cambia runtime',async()=>{
    const db=server(),a=device(db);a.p.data.cases.solved['local']={option:'a',ts:3};
    db.rows('case_solutions').push({user_id:'A',case_id:'remote',option:'b',client_updated_at:4});
    let entered,release;const ready=new Promise(r=>entered=r),wait=new Promise(r=>release=r);
    db.holdWrite=async t=>{if(t==='case_solutions'){entered();await wait;}};
    const pending=a.api.syncCaseSolutions('A',100,a.api.sessionHandleFor());await ready;
    a.api.runtime.currentUser={id:'B'};vm.runInContext('SMR.progress.data = defaultProgress();',a.g);a.g.SMR.store.set('liveOwner',{owner:'B',v:1});
    a.api.runtime.lastSnapshot='B';const stored=JSON.stringify([...a.storage]);release();await pending;
    assert.equal(JSON.stringify([...a.storage]),stored);assert.equal(a.api.runtime.lastSnapshot,'B');assert.deepEqual(clone(a.p.data.cases.solved),{});
  });
  await check('sin red cola persiste; reintento conserva un único evento almacenado en mock', async () => {
    const db=server(), a=device(db);a.answer(false);db.fail=true;await a.push();assert(a.g.SMR.store.get('progressSyncQueue:A').wrongEvents.length);
    db.fail=false;await a.push();await a.push();assert.equal(db.rows('wrong_answer_events').length,1);
  });
})().catch(e=>{console.error(e);failed++;}).finally(()=>{process.exitCode=failed?1:0;console.log('OK: '+passed+'  FAIL: '+failed+' (caracterización y guards; backend simulado)');});

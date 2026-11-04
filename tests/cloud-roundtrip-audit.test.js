'use strict';
/* Regresiones del cliente y límites de identidad pendientes.
   Transporte simulado: no ejecuta PostgreSQL/RLS. */
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { load } = require('./study-guided.test');
const source = fs.readFileSync('js/cloud-progress.js', 'utf8').replace(/\r\n/g, '\n');
const clone = value => JSON.parse(JSON.stringify(value));
let passed = 0, failed = 0, completed = false;
process.exitCode = 1;
process.on('exit', () => {
  if (!completed) { console.error('INCOMPLETE: auditoría sin finalizar'); process.exitCode = 1; }
});
async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timeout: ' + label)), ms);
    })]);
  } finally { clearTimeout(timer); }
}
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
      let filters = [], after = null, ordering, max = Infinity;
      const chain = {
        select() { return chain; }, eq(k, v) { filters.push([k, v]); return chain; },
        gt(k,v) { after=[k,v]; return chain; },
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
            db.rows(table).forEach((r,i)=>{ if(r.id==null)r.id=i+1; });
            let rows = db.rows(table).filter(r => filters.every(([k, v]) => r[k] === v) && (!after || r[after[0]]>after[1]));
            if (ordering) rows = rows.slice().sort((a,b) => (a[ordering[0]] - b[ordering[0]]) * (ordering[1].ascending ? 1 : -1));
            const result = { data: clone(rows.slice(0, max)), error: db.readError ? db.readError(table, after) : null };
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
  vm.runInContext(source.replace(marker, '  global.audit = { runtime, pullInitial, pushEvents, pushState, sessionHandleFor, syncResourceState, syncCaseSolutions, notifySlot, adoptUnattributedEvents };\n})(typeof window'), g);
  g.audit.runtime.currentUser = { id: uid };
  g.SMR.store.set('liveOwner', { owner: uid, v: 1 });
  const p = g.SMR.progress, api = g.audit;
  return { ...h, storage: store, p, api, pull: () => api.pullInitial(uid, api.sessionHandleFor()), async push() { await api.pushEvents(); for(let i=0;i<50;i++) await Promise.resolve(); },
    answer(ok) { p.recordTest({ testId: h.first.id, title: h.first.title, mode: 'practica', correct: ok ? 1 : 0, total: 1, answers: [{ origIndex: 0, ok }] }); h.advanceTime(1000); } };
}
async function check(name, fn) {
  try { await withTimeout(Promise.resolve().then(fn), 5000, name); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ': ' + e.message); }
}
(async () => {
  if (process.env.CLOUD_AUDIT_SELFTEST === 'blocked') {
    await check('espera artificial bloqueada', () => withTimeout(new Promise(() => {}), 50, 'espera artificial'));
    return;
  }
  if (process.env.CLOUD_AUDIT_SELFTEST === 'incomplete') return;
  for (const mode of ['blocked', 'incomplete']) await check('autoprueba del arnés: ' + mode, () => {
    const result = spawnSync(process.execPath, [__filename], {
      env: { ...process.env, CLOUD_AUDIT_SELFTEST: mode }, encoding: 'utf8', timeout: 10000
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert(result.stderr.includes('INCOMPLETE'));
    assert(result.stdout.includes('FINALIZADO: no'));
    if (mode === 'blocked') assert(result.stderr.includes('Timeout: espera artificial'));
  });
  await check('add/add/clear real se envía y el dispositivo vacío reconstruye estado limpio', async () => {
    const db=server(), a=device(db); a.answer(false); a.answer(false); assert.equal(a.p.data.tests.wrong[a.first.id][a.id],2); a.answer(true);
    assert(!a.p.data.tests.wrong[a.first.id][a.id]); await a.push();
    assert.deepEqual(db.rows('wrong_answer_events').map(e=>e.event_type),['add','add','clear']);
    const b=device(db); await b.pull(); assert.deepEqual(clone(b.p.data.tests.wrong),{});
    assert(db.reads.includes('wrong_answer_events'));
  });
  await check('add/add se reconstruye y pull repetido no duplica', async () => {
    const db=server(), a=device(db); a.answer(false); a.answer(false); await a.push(); const b=device(db); await b.pull();
    assert.equal(a.p.data.tests.wrong[a.first.id][a.id],2); assert.equal(b.p.data.tests.wrong[a.first.id][a.id],2);await b.pull();assert.equal(b.p.data.tests.wrong[a.first.id][a.id],2);
  });
  await check('wrong ignora caché sin materializador y conserva legacy local', async () => {
    const db=server(), a=device(db); a.answer(false);
    db.rows('wrong_answers').push({user_id:'A',test_id:a.first.id,question_key:a.id,count:0},{user_id:'A',test_id:'ausente',question_key:'q-0000000000000000',count:3});
    await a.pull(); assert.equal(a.p.data.tests.wrong[a.first.id][a.id],1); assert(!a.p.data.tests.wrong.ausente);
  });
  await check('eventos de A fuera de orden no se instalan al hacer pull de B (mock)', async () => {
    const db=server(), a=device(db); a.answer(false); a.answer(true); await a.push(); db.rows('wrong_answer_events').reverse();
    const b=device(db,'B'); await b.pull(); assert.equal(b.p.data.tests.history.length,0); assert.deepEqual(clone(b.p.data.tests.wrong),{});
  });

  await check('wrong: clear remoto limpia el otro dispositivo; add posterior vuelve a abrir',async()=>{
    const db=server(),a=device(db),b=device(db);a.answer(false);await a.push();await b.pull();assert.equal(b.p.data.tests.wrong[a.first.id][a.id],1);
    a.answer(true);await a.push();await b.pull();assert(!b.p.data.tests.wrong[a.first.id]?.[a.id]);a.answer(false);await a.push();await b.pull();assert.equal(b.p.data.tests.wrong[a.first.id][a.id],1);
  });
  await check('wrong: duplicados, desorden, huérfanas y paginación sin borrar eventos',async()=>{
    const db=server(),a=device(db);const events=db.rows('wrong_answer_events');
    for(let i=0;i<205;i++)events.push({user_id:'A',test_id:'ausente',question_key:'q-orphan',event_type:'add',count_delta:1,created_at:i+1,client_created_at:i+1});
    events.push({...events[0]},{user_id:'A',test_id:'ausente',question_key:'q-orphan',event_type:'clear',count_delta:0,created_at:206,client_created_at:206});events.reverse();
    await a.pull();assert(!a.p.data.tests.wrong.ausente?.['q-orphan']);assert.equal(events.length,207);
    events.push({user_id:'A',test_id:'ausente',question_key:'q-unresolved',event_type:'add',count_delta:2,created_at:207,client_created_at:207});
    await a.pull();assert.equal(a.p.data.tests.wrong.ausente['q-unresolved'],2);assert.equal(events.length,208);
  });
  await check('wrong: pending offline y failed se incluyen sin duplicar al confirmar',async()=>{
    const db=server(),a=device(db),b=device(db);a.answer(false);await a.push();b.advanceTime(5000);b.answer(false);await b.pull();assert.equal(b.p.data.tests.wrong[b.first.id][b.id],2);
    await b.push();await b.pull();assert.equal(b.p.data.tests.wrong[b.first.id][b.id],2);
    const q=b.g.SMR.store.get('progressSyncQueue:A');q.failed.wrongEvents=[{test_id:b.first.id,question_key:b.id,event_type:'clear',count_delta:0,created_at:1900000000000,client_created_at:1900000000000}];b.g.SMR.store.set('progressSyncQueue:A',q);
    await b.pull();assert(!b.p.data.tests.wrong[b.first.id]?.[b.id]);assert.equal(b.g.SMR.store.get('progressSyncQueue:A').failed.wrongEvents.length,1);
  });
  await check('wrong: empate add/clear no decide una limpieza destructiva',async()=>{
    const db=server(),a=device(db);a.p.data.tests.wrong.legacy={opaque:5};
    for(const type of ['add','clear'])db.rows('wrong_answer_events').push({user_id:'A',test_id:'legacy',question_key:'opaque',event_type:type,count_delta:type==='add'?1:0,created_at:1,client_created_at:1});
    await a.pull();assert.equal(a.p.data.tests.wrong.legacy.opaque,5);assert.equal(db.rows('wrong_answer_events').length,2);
  });

  for(const [label,initial,events,expected] of [
    ['empate histórico, clear y add',0,[['add',1],['clear',1],['clear',2],['add',3]],1],
    ['local 5, empate histórico y clear',5,[['add',1],['clear',1],['clear',2]],0],
    ['empate y add posterior conserva MAX legacy',5,[['add',1],['clear',1],['add',2]],5],
    ['empate y add posterior en vacío',0,[['add',1],['clear',1],['add',2]],1],
    ['clear anterior y empate final conserva local',5,[['clear',0],['add',1],['clear',1]],5]
  ]) await check('wrong: '+label,async()=>{
    const db=server(),a=device(db);if(initial)a.p.data.tests.wrong[a.first.id]={[a.id]:initial};
    for(const [type,ts]of events)db.rows('wrong_answer_events').push({user_id:'A',test_id:a.first.id,question_key:a.id,event_type:type,count_delta:type==='add'?1:0,created_at:ts,client_created_at:ts});
    await a.pull();assert.equal(a.p.data.tests.wrong[a.first.id]?.[a.id]||0,expected);
    await a.pull();assert.equal(a.p.data.tests.wrong[a.first.id]?.[a.id]||0,expected);assert.equal(db.rows('wrong_answer_events').length,events.length);
  });
  await check('actividad: tipo/meta se envían y reconstruyen sin duplicar al repetir pull', async () => {
    const db=server(), a=device(db); a.p.logActivity('caso','Evento','detalle'); await a.push();
    assert.equal(db.rows('activity_events')[0].event_type,'caso'); assert.equal(db.rows('activity_events')[0].meta,'detalle');
    const b=device(db); await b.pull(); await b.pull(); assert.equal(b.p.data.activity.length,1); assert.equal(b.p.data.activity[0].type,'caso');assert.equal(b.p.data.activity[0].meta,'detalle');assert(db.reads.includes('activity_events'));
  });
  await check('actividad: orden, ventana 40, duplicados y eventos locales offline',async()=>{
    const db=server(),a=device(db);for(let i=0;i<55;i++)db.rows('activity_events').push({user_id:'A',event_type:'caso',label:'Evento '+i,meta:'',created_at:i+1});
    db.rows('activity_events').push({...db.rows('activity_events')[54]});a.p.logActivity('test','Offline','meta');
    await a.pull();assert.equal(a.p.data.activity.length,40);assert.equal(a.p.data.activity[0].ts,17);assert.equal(a.p.data.activity.at(-1).label,'Offline');
    assert(a.p.data.activity.every((e,i,arr)=>!i||e.ts>=arr[i-1].ts));assert.equal(a.g.SMR.store.get('progressSyncQueue:A').activity.length,1);
  });
  await check('actividad: dos tipos con igual label/meta/ms colisionan en cola actual', async () => {
    const db=server(), a=device(db); a.p.logActivity('caso','Igual','meta'); a.p.logActivity('test','Igual','meta');
    assert.equal(a.p.data.activity.length,2); await a.push(); assert.equal(db.rows('activity_events').length,1);
  });
  await check('25 sesiones: restaura los 25 minutos conservando ventana reciente de 20', async () => {
    const db=server(), a=device(db); for(let i=0;i<25;i++){a.p.recordStudySession(1,1);a.advanceTime(1000);} await a.push();
    assert.equal(db.rows('study_sessions').length,25); assert.equal(a.p.data.studyMinutes,25);
    const b=device(db); await b.pull(); assert.equal(b.p.data.studySessions.length,20); assert.equal(b.p.data.studyMinutes,25);
    await b.pull(); assert.equal(b.p.data.studyMinutes,25); assert.equal(b.p.data.studySessions.length,20);
  });
  for(const n of [0,1,20,21,51,205])await check('sesiones '+n+': total íntegro, ventana 20 y pull repetido',async()=>{
    const db=server(),a=device(db);for(let i=0;i<n;i++)db.rows('study_sessions').push({user_id:'A',created_at:i+1,minutes:2,steps:3});
    if(n)db.rows('study_sessions').push({...db.rows('study_sessions')[0]});
    await a.pull();await a.pull();assert.equal(a.p.data.studyMinutes,n*2);assert.equal(a.p.data.studySessions.length,Math.min(20,n));
  });
  await check('sesiones: dos dispositivos y pending/failed se unen sin doble conteo',async()=>{
    const db=server(),a=device(db);for(let i=0;i<25;i++){a.p.recordStudySession(1,1);a.advanceTime(1000);}await a.push();
    const b=device(db);b.advanceTime(50000);b.p.recordStudySession(3,1);const q=b.g.SMR.store.get('progressSyncQueue:A');q.failed.sessions=[{created_at:1900000000000,minutes:2,steps:1}];b.g.SMR.store.set('progressSyncQueue:A',q);
    await b.pull();assert.equal(b.p.data.studyMinutes,30);await b.push();await b.pull();assert.equal(b.p.data.studyMinutes,30);assert.equal(b.p.data.studySessions.length,20);
    await a.pull();assert.equal(a.p.data.studyMinutes,28);
  });

  await check('identidad pendiente: dos intentos diferentes del mismo banco/modo/ms colisionan en cloud',async()=>{
    const db=server(),a=device(db);for(const ok of [false,true])a.p.recordTest({testId:a.first.id,title:a.first.title,mode:'practica',correct:ok?1:0,total:1,answers:[{origIndex:0,ok}]});
    assert.equal(a.p.data.tests.history.length,2);await a.push();assert.equal(db.rows('test_attempts').length,1);
  });
  await check('identidad pendiente: adds iguales de dos dispositivos/ms son indistinguibles',async()=>{
    const db=server(),a=device(db),b=device(db);a.answer(false);b.answer(false);await a.push();await b.push();assert.equal(db.rows('wrong_answer_events').length,1);
  });
  await check('dos sesiones distintas con misma tupla ts/minutes/steps se deduplican', async () => {
    const db=server(), a=device(db); a.p.recordStudySession(2,3);a.p.recordStudySession(2,3);await a.push();
    assert.equal(a.p.data.studyMinutes,4);assert.equal(db.rows('study_sessions').length,1);
  });
  await check('best/last remotos sin intentos se restauran sin inventar history', async () => {
    const db=server(); db.rows('test_scores').push({user_id:'A',test_id:'t-redes',best_pct:100,last_pct:75});
    const b=device(db); await b.pull(); await b.api.pushState(); assert.equal(b.p.data.tests.best['t-redes'],100); assert.equal(b.p.data.tests.last['t-redes'],75); assert.equal(b.p.data.tests.history.length,0); assert.equal(db.rows('test_scores')[0].best_pct,100);
  });
  await check('pull de history reciente conserva best cloud antiguo 100 frente a 50', async () => {
    const db=server(); db.rows('test_scores').push({user_id:'A',test_id:'t-redes',best_pct:100,last_pct:50});
    db.rows('test_attempts').push({user_id:'A',test_id:'t-redes',title:'Test de Redes',mode:'practica',correct:1,total:2,pct:50,created_at:1000});
    const b=device(db);await b.pull();assert.equal(db.rows('test_scores')[0].best_pct,100);assert.equal(b.p.data.tests.best['t-redes'],100);assert.equal(b.p.data.tests.last['t-redes'],50);assert.equal(db.writes.length,0);
  });

  await check('historial cloud truncado a 200/local 60 no rebaja best antiguo',async()=>{
    const db=server(),a=device(db);db.rows('test_scores').push({user_id:'A',test_id:'t-redes',best_pct:100,last_pct:50});
    for(let i=0;i<205;i++)db.rows('test_attempts').push({user_id:'A',test_id:'t-redes',title:'Test de Redes',mode:'practica',pct:50,correct:1,total:2,created_at:i+1});
    await a.pull();assert.equal(a.p.data.tests.history.length,60);assert.equal(a.p.data.tests.best['t-redes'],100);assert.equal(a.p.data.tests.last['t-redes'],50);assert.equal(db.rows('test_scores')[0].best_pct,100);assert.equal(db.writes.length,0);
  });
  for (const local of [30,100]) await check('best MAX con local '+local+' y remoto 80; last por intento más reciente',async()=>{
    const db=server(), a=device(db);a.p.data.tests.best['t-redes']=local;
    a.p.data.tests.history.push({testId:'t-redes',mode:'rapido',pct:25,date:2000});
    db.rows('test_scores').push({user_id:'A',test_id:'t-redes',best_pct:80,last_pct:50});
    db.rows('test_attempts').push({user_id:'A',test_id:'t-redes',mode:'practica',pct:50,created_at:1000});
    await a.pull();assert.equal(a.p.data.tests.best['t-redes'],Math.max(local,80));assert.equal(a.p.data.tests.last['t-redes'],25);
    await a.api.pushState();assert.equal(db.rows('test_scores')[0].best_pct,Math.max(local,80));assert.equal(db.rows('test_scores')[0].last_pct,25);
  });
  await check('dos dispositivos: un intento antiguo no reemplaza el last remoto reciente',async()=>{
    const db=server(), a=device(db);a.p.data.tests.best['t-redes']=100;a.p.data.tests.history.push({testId:'t-redes',mode:'practica',pct:100,date:100});
    db.rows('test_scores').push({user_id:'A',test_id:'t-redes',best_pct:100,last_pct:25});
    db.rows('test_attempts').push({user_id:'A',test_id:'t-redes',mode:'practica',pct:25,created_at:200});
    await a.api.pushState();const b=device(db);await b.pull();assert.equal(b.p.data.tests.best['t-redes'],100);assert.equal(b.p.data.tests.last['t-redes'],25);
  });
  await check('scores parciales: null no se convierte en nota ni borra marcas',async()=>{
    const db=server(), a=device(db);a.p.data.tests.best['t-redes']=90;a.p.data.tests.last['t-redes']=70;
    db.rows('test_scores').push({user_id:'A',test_id:'t-redes',best_pct:null,last_pct:null},{user_id:'A',test_id:'t-hardware',best_pct:60,last_pct:null});
    await a.pull();assert.equal(a.p.data.tests.best['t-redes'],90);assert.equal(a.p.data.tests.last['t-redes'],70);assert.equal(a.p.data.tests.best['t-hardware'],60);assert(!('t-hardware' in a.p.data.tests.last));
  });
  for(const change of ['B','logout','generation','pending']) await check('lectura tardía de scores se descarta: '+change,async()=>{
    const db=server(),a=device(db);let release;const wait=new Promise(r=>release=r);db.holdRead=t=>t==='test_scores'?wait:undefined;
    db.rows('test_scores').push({user_id:'A',test_id:'t-redes',best_pct:100,last_pct:75});
    let generation=0;a.g.SMR.cloudSession={token:()=>generation,isCurrent:t=>t===generation};generation=1;
    const pending=a.pull();for(let i=0;i<40;i++)await Promise.resolve();
    if(change==='generation')generation++;else if(change==='pending')a.api.runtime.transitionPending=true;else {a.api.runtime.currentUser=change==='B'?{id:'B'}:null;a.g.SMR.store.set('liveOwner',{owner:change==='B'?'B':'__guest__',v:1});}
    const before=JSON.stringify(a.p.data);release();await pending;assert.equal(JSON.stringify(a.p.data),before);assert.equal(db.writes.length,0);
  });

  for(const table of ['wrong_answer_events','activity_events','study_sessions']) {
    for(const change of ['B','logout','A-B-A','generation','pending','progress','otra pestaña']) await check(table+' tardío: '+change,async()=>{
      const db=server(),a=device(db);let release,entered;const wait=new Promise(r=>release=r),ready=new Promise(r=>entered=r);
      db.rows(table).push({user_id:'A',test_id:'legacy',question_key:'opaque',event_type:table==='activity_events'?'caso':'add',count_delta:1,created_at:1,client_created_at:1,label:'Remoto',meta:'',minutes:2,steps:3});
      db.holdRead=async t=>{if(t===table){entered();await wait;}};
      const pending=a.pull();await ready;
      if(change==='generation')a.api.notifySlot('A');
      else if(change==='A-B-A'){a.api.notifySlot('B');a.api.notifySlot('A');}
      else if(change==='pending')a.api.runtime.transitionPending=true;
      else if(change==='progress')vm.runInContext('SMR.progress.data = defaultProgress();',a.g);
      else if(change==='otra pestaña')a.g.SMR.store.set('liveOwner',{owner:'B',v:1});
      else {a.api.runtime.currentUser=change==='B'?{id:'B'}:null;a.g.SMR.store.set('liveOwner',{owner:change==='B'?'B':'__guest__',v:1});}
      const before=JSON.stringify(a.p.data),stored=JSON.stringify([...a.storage]);release();await pending;
      assert.equal(JSON.stringify(a.p.data),before);assert.equal(JSON.stringify([...a.storage]),stored);
    });
  }
  for(const table of ['wrong_answer_events','study_sessions'])await check(table+': error en segunda página no aplica un prefijo incompleto',async()=>{
    const db=server(),a=device(db);for(let i=0;i<205;i++)db.rows(table).push({user_id:'A',test_id:'legacy',question_key:'opaque',event_type:'add',count_delta:1,created_at:i+1,client_created_at:i+1,minutes:1,steps:1});
    db.readError=(t,after)=>t===table&&after?{message:'network unavailable'}:null;
    const before=JSON.stringify(a.p.data);await a.pull();assert.equal(JSON.stringify(a.p.data),before);
  });
  await check('respuesta tardía de upsert recursos A NO escribe resources sobre progreso B', async () => {
    const db=server(), a=device(db); a.p.data.resources.viewed['r-A']=1;let release;const wait=new Promise(r=>release=r);db.holdWrite=t=>t==='resource_state'?wait:undefined;
    db.rows('resource_state').push({user_id:'A',resource_id:'r-A',viewed_at:2});
    const pending=a.api.syncResourceState('A',100,a.api.sessionHandleFor()); for(let i=0;i<20;i++)await Promise.resolve();
    a.api.runtime.currentUser={id:'B'}; vm.runInContext('SMR.progress.data = defaultProgress();',a.g);a.g.SMR.store.set('liveOwner',{owner:'B',v:1});
    const before=JSON.stringify(a.p.data);release();await pending;assert.equal(JSON.stringify(a.p.data),before);
  });
  await check('pull tardío de A NO modifica racha en memoria de B', async () => {
    const db=server(), a=device(db);let release;const wait=new Promise(r=>release=r);db.holdRead=t=>t==='wrong_answer_events'?wait:undefined;
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

  for(const canWrite of [true,false])await check('adopción autorizada: conserva failed y fuente si escritura '+canWrite,async()=>{
    const db=server(),a=device(db),raw={sessions:[{created_at:1,minutes:2,steps:3}],failed:{sessions:[{created_at:2,minutes:4,steps:5}]},extra:{keep:true}};
    a.g.SMR.store.set('progressSyncQueue:guest',raw);const set=a.g.SMR.store.set;
    if(!canWrite)a.g.SMR.store.set=(k,v)=>k==='progressSyncQueue:A'?false:set(k,v);
    a.api.adoptUnattributedEvents('A');const guest=a.g.SMR.store.get('progressSyncQueue:guest');
    assert.deepEqual(guest.failed,raw.failed);assert.deepEqual(guest.extra,raw.extra);
    if(canWrite){assert.equal(guest.sessions.length,0);assert.equal(a.g.SMR.store.get('progressSyncQueue:A').sessions.length,1);}
    else assert.deepEqual(guest,raw);
  });
  await check('sin red cola persiste; reintento conserva un único evento almacenado en mock', async () => {
    const db=server(), a=device(db);a.answer(false);db.fail=true;await a.push();assert(a.g.SMR.store.get('progressSyncQueue:A').wrongEvents.length);
    db.fail=false;await a.push();await a.push();assert.equal(db.rows('wrong_answer_events').length,1);
  });
  completed = true;
})().catch(e=>{console.error(e);failed++;}).finally(()=>{process.exitCode=failed||!completed?1:0;console.log('OK: '+passed+'  FAIL: '+failed+' (regresión y límites; backend simulado) FINALIZADO: '+(completed?'sí':'no'));});

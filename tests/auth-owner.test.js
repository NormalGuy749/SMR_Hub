'use strict';
// Módulos reales; SDK/DOM/almacenamiento simulados. No prueba GoTrue ni RLS real.
const fs = require('fs');
const assert = require('node:assert/strict');
function harness(file, end, names) {
  const source = fs.readFileSync(file, 'utf8');
  return new Function('require', 'process', source.slice(0, source.indexOf(end)) + '\nreturn {' + names + '};')(require, process);
}
const profile = harness('tests/profile-owner.test.js', '/* ---------- casos', 'makeEnv,PROFILE_A,PROFILE_B,flush,user');
const tabs = harness('tests/tab-merge.test.js', '/* ---------- casos', 'makeBus,makeTab,seedAccount,progressWith,flush,user');
const srcAuth = fs.readFileSync('js/auth.js', 'utf8');
let passed = 0;
function attach(env, initial = null, provisioning) {
  const g = env.g;
  const observed = [], provisioned = [];
  let callback;
  g.location = { search: '', hash: '', origin: 'http://local.test', pathname: '/' };
  g.addEventListener('smr:authchange', e => observed.push(e.detail.user ? e.detail.user.id : null));
  const originalFrom = g.SMR.cloud.from;
  g.SMR.cloud.from = table => {
    const chain = originalFrom(table);
    if (table === 'profiles') chain.upsert = async payload => {
      provisioned.push(payload.user_id);
      if (provisioning) await provisioning(payload.user_id);
      return { error: null };
    };
    return chain;
  };
  g.SMR.cloud.auth = {
    onAuthStateChange(fn) { callback = fn; },
    getSession: async () => ({ data: { session: initial ? { user: initial } : null } }),
    signOut: async () => callback('SIGNED_OUT', null)
  };
  const footer = { appendChild(el) { this.widget = el; } };
  const doc = {
    getElementById: id => id === 'nav-footer' ? footer : null,
    querySelector: () => null,
    createElement: () => ({ innerHTML: '', querySelector: () => ({ addEventListener() {} }) })
  };
  class Event { constructor(type, opts) { this.type = type; this.detail = opts.detail; } }
  new Function('window', 'globalThis', 'document', 'CustomEvent', srcAuth)(g, g, doc, Event);
  return { observed, provisioned, footer, emit: (event, uid) => callback(event, uid ? { user: profile.user(uid) } : null) };
}
function seed(env) {
  for (const [uid, p] of [['A', profile.PROFILE_A], ['B', profile.PROFILE_B], ['__guest__', profile.PROFILE_A]]) {
    const data = JSON.parse(JSON.stringify(env.progress.data));
    data.resources.completed[uid] = 1;
    data.tests.srs['card-' + uid] = { level: 1, due: 100 };
    env.store.set('progressByOwner:' + uid, { slot: { progress: data, studentProfile: p }, savedAt: 1, v: 1 });
  }
}
async function check(name, fn) { await fn(); passed++; console.log('  ✓ ' + name); }
(async () => {
  await check('visitante → A → B directo → A: instala progreso, perfil, SRS y anuncia cada UID', async () => {
    const e = profile.makeEnv(); seed(e); const a = attach(e); await profile.flush();
    for (const uid of ['A', 'B', 'A']) {
      await a.emit('SIGNED_IN', uid); await profile.flush();
      assert.equal(e.g.SMR.auth.user.id, uid);
      assert(a.footer.widget.innerHTML.includes(uid + '@test'), 'widget auth desfasado');
      assert.equal(e.marker(), uid, 'liveOwner no corresponde al usuario SDK');
      assert.deepEqual(Object.keys(e.progress.data.resources.completed), [uid]);
      assert.deepEqual(Object.keys(e.progress.data.tests.srs), ['card-' + uid]);
      assert.equal(e.profileRead().community, uid === 'A' ? 'aaa' : 'bbb');
    }
    assert.deepEqual(a.observed, ['A', 'B', 'A']);
    assert.deepEqual(a.provisioned, ['A', 'B', 'A']);
  });
  await check('logout → B → visitante final; mismo UID y refresh no duplican evento ni generación', async () => {
    const e = profile.makeEnv(); seed(e); const a = attach(e); await profile.flush();
    await a.emit('SIGNED_IN', 'A'); await profile.flush(); const token = e.token();
    for (const event of ['SIGNED_IN', 'INITIAL_SESSION', 'USER_UPDATED', 'TOKEN_REFRESHED']) await a.emit(event, 'A');
    await profile.flush(); assert(e.isCurrent(token)); assert.deepEqual(a.observed, ['A']);
    await a.emit('SIGNED_OUT', null); await profile.flush();
    await a.emit('SIGNED_IN', 'B'); await profile.flush();
    await a.emit('SIGNED_OUT', null); await profile.flush();
    assert.equal(e.marker(), '__guest__'); assert.deepEqual(a.observed, ['A', null, 'B', null]);
  });
  await check('sesión restaurada al arrancar, INITIAL_SESSION repetido no vuelve a instalar slot', async () => {
    const e = profile.makeEnv(); seed(e); const a = attach(e, profile.user('A')); await profile.flush();
    const token = e.token(); await a.emit('INITIAL_SESSION', 'A'); await profile.flush();
    assert.equal(e.marker(), 'A'); assert(e.isCurrent(token)); assert.deepEqual(a.observed, ['A']);
  });
  await check('provisioning A retenido: B se instala sin esperar A y la respuesta tardía no reinstala A', async () => {
    let release; const wait = new Promise(r => { release = r; });
    const e = profile.makeEnv(); seed(e); const a = attach(e, null, uid => uid === 'A' ? wait : undefined); await profile.flush();
    const pendingA = a.emit('SIGNED_IN', 'A'); await profile.flush();
    const token = e.token(); await a.emit('SIGNED_IN', 'B'); await profile.flush();
    assert.equal(e.marker(), 'B'); assert(!e.isCurrent(token));
    release(); await pendingA; await profile.flush();
    assert.equal(e.marker(), 'B'); assert.deepEqual(a.observed, ['A', 'B']);
  });
  await check('pull de perfil de A termina con B activo: no instala ni sube perfil ajeno', async () => {
    const e = profile.makeEnv({ holdProfileRead: true, cloudProfiles: { A: profile.PROFILE_A, B: profile.PROFILE_B } });
    seed(e); const a = attach(e); await profile.flush();
    await a.emit('SIGNED_IN', 'A'); await profile.flush();
    await a.emit('SIGNED_IN', 'B'); await profile.flush(); e.releaseReads(); await profile.flush(24);
    assert.equal(e.marker(), 'B'); assert.equal(e.profileRead().community, 'bbb');
    assert(!e.writesTo('B').some(w => w.payload.community === 'aaa'));
  });
  await check('sin Web Locks: transición pendiente, no instala B ni valida token de escritura para B', async () => {
    const e = profile.makeEnv({ locks: false }); e.seedLive('A', profile.PROFILE_A);
    const a = attach(e); await profile.flush(); await a.emit('SIGNED_IN', 'B'); await profile.flush();
    assert(e.contract().transitionPending()); assert.equal(e.marker(), 'A');
    assert.notEqual(e.contract().owner(), 'B'); assert.equal(e.writesTo('B').length, 0);
  });
  await check('dos pestañas: A → B → A y logout compartido; snapshots, liveWriter y colas aislados', async () => {
    const bus = tabs.makeBus();
    const data = uid => tabs.progressWith({ completed: { [uid]: 1 }, srs: { ['card-' + uid]: { level: 1, due: 100 } } });
    tabs.seedAccount(bus, 'A', data('A'));
    bus.seed('smrhub:progressByOwner:B', JSON.stringify({ slot: { progress: data('B') }, savedAt: 1, v: 1 }));
    const x = tabs.makeTab(bus), y = tabs.makeTab(bus); const ax = attach(x), ay = attach(y); await tabs.flush();
    for (const uid of ['A', 'B', 'A']) {
      await ax.emit('SIGNED_IN', uid); await ay.emit('SIGNED_IN', uid); await tabs.flush(12);
      for (const t of [x, y]) {
        assert.equal(t.marker(), uid); assert.deepEqual(t.memCompleted(), [uid]);
        assert.equal(t.live('liveWriter').owner, uid);
        t.progress.recordTest({ testId: 't-t1', title: uid, correct: 1, total: 2 });
        assert(t.store.get('progressSyncQueue:' + uid).attempts.every(e => e.title === uid));
      }
    }
    const stale = x.g.SMR.cloudSession.token();
    await ax.emit('SIGNED_OUT', null); await ay.emit('SIGNED_OUT', null); await tabs.flush(12);
    assert(!x.g.SMR.cloudSession.isCurrent(stale));
    assert.equal(x.marker(), '__guest__'); assert.equal(y.marker(), '__guest__');
    assert(!x.memCompleted().includes('A')); assert(!y.memCompleted().includes('A'));
    assert.deepEqual(Object.keys(x.snapshot('B').slot.progress.resources.completed), ['B']);
    assert.deepEqual(ax.observed, ['A', 'B', 'A', null]); assert.deepEqual(ay.observed, ax.observed);
  });
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => console.log('OK: ' + passed + '  FAIL: ' + (process.exitCode ? 1 : 0)));

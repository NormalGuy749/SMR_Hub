'use strict';
// Motor y progreso reales; DOM/reloj aislados. Sin exportaciones de diagnóstico en producto.
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const { load } = require('./study-guided.test');
const source = fs.readFileSync('js/tests.js', 'utf8');
let passed = 0, failed = 0;
function env() {
  const h = load();
  vm.runInContext(fs.readFileSync('js/seo-content.js', 'utf8'), h.g);
  const marker = '  return { render, renderStudy, searchEntries, stop, startSession, studyQuestion, studyBlocks };';
  assert(source.includes(marker));
  vm.runInContext(source.replace(marker, `
    window.engine = { get: () => session, startAdaptive,
      start(root, mode, multi, count = 2) {
        session = multi ? buildExamSession({count}) : buildSessionForTest(getTests()[0], mode, {count});
        renderQuestion(root);
      }
    };
` + marker), h.g);
  return { ...h, api: h.g.engine };
}
function choose(h, ok) {
  const s = h.api.get(), q = s.questions[s.index].q;
  h.root.querySelectorAll('.quiz-option')[ok ? q.correct : (q.correct + 1) % q.options.length].click();
  return q;
}
function next(h) { h.root.querySelector('#quiz-next').click(); }
function check(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch(e) { failed++; console.error('  ✗ ' + name + ': ' + e.message); }
}
for (const multi of [false,true]) for (const ok of [false,true]) check('examen '+(multi?'multi':'simple')+' respuesta '+ok+': neutral hasta revisión',()=>{
  const h=env();h.api.start(h.root,'examen',multi);
  const before=h.g.SMR.progress.data.tests.history.length;
  const q=choose(h,ok);
  assert(h.root.querySelectorAll('.quiz-option').every(b=>b.disabled&&!b.classes.has('correct')&&!b.classes.has('wrong')));
  const explain=h.root.querySelector('#quiz-explain');assert.equal(explain.className,'quiz-explain');assert(!explain.innerHTML.includes(q.explain));
  assert(!h.root.querySelector('#quiz-next').hidden);assert.equal(h.g.SMR.progress.data.tests.history.length,before);
  next(h);choose(h,!ok);next(h);
  assert(h.root.innerHTML.includes('Correcta:'));assert(h.root.innerHTML.includes(q.explain));assert(h.g.SMR.progress.data.tests.history.length>before);
});
for(const ok of [false,true])check('práctica '+ok+': mantiene corrección inmediata',()=>{
  const h=env();h.api.start(h.root,'practica',false);const q=choose(h,ok);
  assert(h.root.querySelectorAll('.quiz-option')[q.correct].classes.has('correct'));
  assert.equal(h.root.querySelector('#quiz-explain').className,'quiz-explain '+(ok?'ok':'bad'));
  assert(h.root.querySelector('#quiz-explain').innerHTML.includes(q.explain));
});
check('examen abandonado no registra resultado',()=>{
  const h=env();h.api.start(h.root,'examen',true);const before=JSON.stringify(h.g.SMR.progress.data.tests);
  choose(h,true);h.root.querySelector('#quiz-exit').click();assert.equal(JSON.stringify(h.g.SMR.progress.data.tests),before);
});

for(const [label,sequence,levels,streaks] of [
  ['++',[true,true],[0,0,1],[1,0]],
  ['++--',[true,true,false,false],[0,0,1,1,0],[1,0,-1,0]],
  ['+-',[true,false],[0,0,0],[1,-1]],
  ['-+',[false,true],[0,0,0],[-1,1]],
  ['++++++',[true,true,true,true,true,true],[0,0,1,1,2,2,2],[1,0,1,0,1,0]],
  ['------',[false,false,false,false,false,false],[0,0,0,0,0,0,0],[-1,0,-1,0,-1,0]]
])check('adaptativo '+label+': racha consecutiva, umbral y límites',()=>{
  const h=env();h.api.startAdaptive(h.root);const actual=[h.api.get().adaptive.level];
  sequence.forEach((ok,i)=>{choose(h,ok);next(h);actual.push(h.api.get().adaptive.level);assert.equal(h.api.get().adaptive.streak,streaks[i]);});
  assert.deepEqual(actual,levels);
});
check('adaptativo completo: 12 preguntas sin repetir, procedencia y un registro por banco',()=>{
  const h=env();h.api.startAdaptive(h.root);const ids=new Set(),banks=new Set();
  const before=h.g.SMR.progress.data.tests.history.length;
  for(let i=0;i<12;i++){
    const s=h.api.get(),c=s.questions[s.index];const id=h.g.SMR.srs.idOf(c.testId,c.origIndex);assert(id);assert(!ids.has(id));ids.add(id);banks.add(c.testId);
    choose(h,i%3!==0);next(h);
  }
  assert(h.root.innerHTML.includes('score-big'));assert.equal(h.g.SMR.progress.data.tests.history.length,before+banks.size);
});
check('adaptativo: termina al agotar banco y usa otro bucket disponible',()=>{
  const h=env();h.api.startAdaptive(h.root);const s=h.api.get(),current=s.questions[0];
  const extra=s.adaptive.pool[2][0];assert(extra);s.adaptive.pool={0:[],1:[],2:[extra]};s.adaptive.total=12;
  choose(h,true);next(h);assert.equal(s.questions.length,2);assert.equal(s.questions[1],extra);
  choose(h,false);next(h);assert(h.root.innerHTML.includes('score-big'));assert.equal(s.answers.length,2);assert.notEqual(current,extra);
});
console.log(passed+' ok, '+failed+' fallos');process.exitCode=failed?1:0;

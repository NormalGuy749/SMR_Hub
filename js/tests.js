'use strict';

/* SMR Hub — tests de autoevaluación (fase 6)
   Modos: práctica, rápido, examen configurable (nº/cat/dificultad/timer/
   estricto), completo, repaso de errores, test adaptativo y repaso SRS.
   Resultados por categoría y por tema, revisión con enlaces a recursos,
   explicación de por qué las demás opciones son incorrectas y autoevaluación
   "No lo sabía / Dudé / Lo sabía" que alimenta la repetición espaciada.
   Se conecta a #/tests desde app.js y expone API para el Modo Estudio. */

window.SMR_TESTS = (function () {

  const esc = (v) => window.SMR.esc(v);
  const icon = (name, size = 16) => window.SMR.icon(name, size);
  const D = window.SMR_DATA || {};

  const getTests = () => D.tests || [];
  const progress = () => window.SMR.progress;
  const findTest = (testId) => getTests().find((t) => t.id === testId) || null;

  const COUNT_OPTIONS = [5, 10, 15, 20, Infinity];
  const EXAM_COUNTS = [10, 20, 30, 50, Infinity];
  const DIFFICULTIES = ['Básica', 'Intermedia', 'Avanzada'];
  const SECONDS_PER_QUESTION = 30;

  /* Configuración de cada modo. `questions` = Infinity significa todas;
     countable = la tarjeta muestra selector de nº y dificultad. */
  const MODES = {
    practica: { label: 'Práctica', desc: 'Todas las preguntas, con explicación tras cada respuesta.', questions: Infinity, timer: 0, shuffle: false, explain: true },
    rapido: { label: 'Rápido', desc: '5 preguntas al azar.', questions: 5, timer: 0, shuffle: true, explain: true },
    examen: { label: 'Examen', desc: 'Configurable: nº, categoría, dificultad y tiempo. Sin pistas hasta el final.', questions: 10, timer: 300, shuffle: true, explain: false },
    completo: { label: 'Completo', desc: 'Todas las preguntas en orden aleatorio.', questions: Infinity, timer: 0, shuffle: true, explain: true },
    errores: { label: 'Repaso de errores', desc: 'Solo las preguntas que has fallado antes.', questions: Infinity, timer: 0, shuffle: true, explain: true }
  };

  const difficultyOf = (q) => DIFFICULTIES.includes(q.difficulty) ? q.difficulty : 'Básica';
  const topicOf = (q) => q.topic || 'General';
  const resourceTitle = (id) => {
    const r = (D.resources || []).find((x) => x.id === id);
    return r ? r.title : null;
  };

  function modeConfig(mode) {
    return MODES[mode] || MODES.practica;
  }

  function shuffle(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /* ---------- Sesión ---------- */

  let session = null;
  /* 8.5.10: aviso de un solo uso del repaso SRS (se consume al pintar la
     siguiente pregunta, para que el resultado del borrado no se pierda
     con el repintado de la pantalla). */
  let srsNotice = '';
  /* { testId, title, mode, questions, index, correct, answers, cfg, remaining,
     intervalId, multi, strict, startedAt, timeSpent, examFilter } */

  function stop() {
    if (session && session.intervalId) {
      window.clearInterval(session.intervalId);
      session.intervalId = null;
    }
  }

  function startTimerIfNeeded(root) {
    stop();
    if (!session || !session.cfg.timer) return;
    session.remaining = session.cfg.timer;
    session.intervalId = window.setInterval(() => {
      if (!session) return;
      session.remaining -= 1;
      session.timeSpent = (session.timeSpent || 0) + 1;
      if (session.remaining <= 0) {
        stop();
        renderResult(root);
      } else {
        updateTimerEl();
      }
    }, 1000);
  }

  function updateTimerEl() {
    const el = document.querySelector('#quiz-timer');
    if (!el || !session) return;
    const total = Math.max(0, session.remaining);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    el.textContent = `${mm}:${ss}`;
    el.classList.toggle('is-low', total <= 30);
  }

  /* ---------- Selección de preguntas ---------- */

  function filterPool(pool, { difficulty = null, category = null } = {}) {
    let list = pool;
    if (difficulty && DIFFICULTIES.includes(difficulty)) {
      list = list.filter((c) => difficultyOf(c.q) === difficulty);
    }
    if (category && category !== 'Todas') {
      list = list.filter((c) => c.category === category);
    }
    return list;
  }

  /* Todas las preguntas del banco con metadatos */
  function allCandidates() {
    const out = [];
    getTests().forEach((t) => t.questions.forEach((q, i) => {
      out.push({
        q,
        origIndex: i,
        testId: t.id,
        testTitle: t.title,
        category: t.category || 'General'
      });
    }));
    return out;
  }

  /* Reparto equilibrado por categoría evitando saturar un solo tema */
  function balancedPick(pool, count) {
    if (count >= pool.length) return shuffle(pool);
    const byTopic = {};
    pool.forEach((c) => {
      const key = topicOf(c.q);
      (byTopic[key] = byTopic[key] || []).push(c);
    });
    const topicBags = shuffle(Object.keys(byTopic).map((k) => shuffle(byTopic[k])));
    const picked = [];
    let guard = 0;
    while (picked.length < count && guard < 500) {
      guard += 1;
      let progressMade = false;
      for (const bag of topicBags) {
        if (picked.length >= count) break;
        if (bag.length) { picked.push(bag.shift()); progressMade = true; }
      }
      if (!progressMade) break;
    }
    return picked;
  }

  function buildSessionForTest(test, mode, opts = {}) {
    const cfg = modeConfig(mode);
    let questions = test.questions.map((q, i) => ({
      q, origIndex: i, testId: test.id, testTitle: test.title, category: test.category || 'General'
    }));

    const diff = opts.difficulty && DIFFICULTIES.includes(opts.difficulty) ? opts.difficulty : null;
    if (diff) questions = questions.filter((c) => difficultyOf(c.q) === diff);
    if (opts.category && opts.category !== 'Todas') {
      questions = questions.filter((c) => (opts.category === test.category));
    }

    if (cfg.shuffle) questions = shuffle(questions);
    const wanted = Number.isInteger(opts.count) && opts.count > 0
      ? opts.count
      : (isFinite(cfg.questions) ? cfg.questions : Infinity);
    if (isFinite(wanted) && wanted < questions.length) questions = balancedPick(questions, wanted);

    const timer = cfg.timer ? Math.max(60, SECONDS_PER_QUESTION * questions.length) : 0;
    const effectiveCfg = timer !== cfg.timer ? Object.assign({}, cfg, { timer }) : cfg;

    return {
      testId: test.id,
      title: test.title,
      mode: cfg === MODES.practica ? 'practica' : mode,
      questions,
      index: 0,
      correct: 0,
      answers: [],
      cfg: effectiveCfg,
      remaining: timer,
      intervalId: null,
      multi: false,
      strict: !!opts.strict,
      startedAt: Date.now(),
      timeSpent: 0,
      examFilter: { difficulty: diff, category: opts.category || 'Todas', count: isFinite(wanted) ? wanted : 'todas' }
    };
  }

  /* Examen configurable: mezcla del banco completo con reparto equilibrado */
  function buildExamSession(opts = {}) {
    let pool = allCandidates();
    const category = opts.category && opts.category !== 'Todas' ? opts.category : null;
    const diff = opts.difficulty && DIFFICULTIES.includes(opts.difficulty) ? opts.difficulty : null;
    if (category) pool = pool.filter((c) => c.category === category);
    if (diff) pool = pool.filter((c) => difficultyOf(c.q) === diff);
    const count = Number.isInteger(opts.count) && opts.count > 0 ? Math.min(opts.count, pool.length) : pool.length;
    const questions = balancedPick(pool, count);
    const timer = opts.timer ? Math.max(60, SECONDS_PER_QUESTION * questions.length) : 0;

    return {
      testId: '__examen',
      title: category ? `Examen · ${category}` : 'Examen general',
      mode: 'examen',
      questions,
      index: 0,
      correct: 0,
      answers: [],
      cfg: { label: 'Examen', timer, explain: false, questions: Infinity, shuffle: true },
      remaining: timer,
      intervalId: null,
      multi: true,
      strict: !!opts.strict,
      startedAt: Date.now(),
      timeSpent: 0,
      examFilter: { difficulty: diff, category: opts.category || 'Todas', count }
    };
  }

  function buildErrorSession() {
    const refs = progress().wrongRefs();
    const questions = [];
    const seen = new Set();
    refs.forEach((ref) => {
      const test = findTest(ref.testId);
      const q = test && test.questions[ref.qIndex];
      if (!test || !q || seen.has(ref.testId + ':' + ref.qIndex)) return;
      seen.add(ref.testId + ':' + ref.qIndex);
      questions.push({ q, origIndex: ref.qIndex, testId: test.id, testTitle: test.title, category: test.category || 'General' });
    });
    if (!questions.length) return null;
    return {
      testId: '__errores',
      title: 'Repaso de errores',
      mode: 'errores',
      questions: shuffle(questions),
      index: 0,
      correct: 0,
      answers: [],
      cfg: MODES.errores,
      remaining: 0,
      intervalId: null,
      multi: true,
      startedAt: Date.now(),
      timeSpent: 0
    };
  }

  /* ---------- Repaso SRS ---------- */

  function buildSrsSession() {
    const due = progress().dueSrs();
    const questions = [];
    due.forEach((item) => {
      const test = findTest(item.testId);
      const q = test && test.questions[item.qIndex];
      if (!test || !q) return;
      questions.push({ q, origIndex: item.qIndex, testId: item.testId, testTitle: test.title, category: test.category || 'General' });
    });
    if (!questions.length) return null;
    return {
      testId: '__srs',
      title: 'Repasos programados',
      mode: 'srs',
      questions: shuffle(questions),
      index: 0,
      correct: 0,
      answers: [],
      cfg: { label: 'Repaso programado', questions: Infinity, timer: 0, shuffle: true, explain: true },
      remaining: 0,
      intervalId: null,
      multi: true,
      startedAt: Date.now(),
      timeSpent: 0
    };
  }

  /* ---------- Test adaptativo ---------- */

  function startAdaptive(root) {
    const total = Math.min(12, Math.max(6, allCandidates().length));
    session = {
      testId: '__adaptativo',
      title: 'Test adaptativo',
      mode: 'adaptativo',
      questions: [],
      index: 0,
      correct: 0,
      answers: [],
      cfg: { label: 'Adaptativo', timer: 0, explain: true, questions: Infinity, shuffle: true },
      remaining: 0,
      intervalId: null,
      multi: true,
      strict: false,
      startedAt: Date.now(),
      timeSpent: 0,
      adaptive: {
        total,
        level: 0,
        streak: 0,
        pool: { 0: [], 1: [], 2: [] },
        usedKeys: new Set()
      }
    };

    /* Banco repartido por dificultad, priorizando fallos y SRS vencidos */
    const pool = allCandidates();
    const wrongSet = new Set(progress().wrongRefs().map((r) => r.testId + ':' + r.qIndex));
    const dueSet = new Set(progress().dueSrs().map((s) => s.testId + ':' + s.qIndex));
    pool.forEach((c) => {
      const diff = difficultyOf(c.q);
      const level = diff === 'Básica' ? 0 : (diff === 'Intermedia' ? 1 : 2);
      const buckets = session.adaptive.pool;
      if (wrongSet.has(c.testId + ':' + c.origIndex)) buckets[level].unshift(c);
      else if (dueSet.has(c.testId + ':' + c.origIndex)) buckets[level].push(c);
      else buckets[level].push(c);
    });
    Object.keys(session.adaptive.pool).forEach((k) => {
      session.adaptive.pool[k] = shuffle(session.adaptive.pool[k]);
    });

    renderAdaptiveQuestion(root);
  }

  function nextAdaptiveCandidate(level) {
    const a = session.adaptive;
    const order = [level, 0, 1, 2];
    for (const lv of order) {
      const bucket = a.pool[lv];
      while (bucket.length) {
        const c = bucket.shift();
        const key = c.testId + ':' + c.origIndex;
        if (!a.usedKeys.has(key)) { a.usedKeys.add(key); return c; }
      }
    }
    return null;
  }

  function renderAdaptiveQuestion(root) {
    const s = session;
    const a = s.adaptive;

    if (s.index >= a.total) { renderResult(root); return; }

    /* Reglas: 2 aciertos seguidos suben nivel; 2 fallos bajan */
    let level = a.level;
    if (a.streak >= 2) level = Math.min(2, level + 1);
    else if (a.streak <= -2) level = Math.max(0, level - 1);
    a.level = level;
    a.streak = 0;

    const candidate = nextAdaptiveCandidate(level);
    if (!candidate) { renderResult(root); return; }

    s.questions.push(candidate);
    renderQuestion(root);
  }

  /* ---------- Índice ---------- */

  function renderIndex(root, notice = '') {
    stop();
    session = null;
    const tests = getTests();
    const totalQuestions = tests.reduce((n, t) => n + t.questions.length, 0);
    const wrong = progress().wrongCount();
    const due = progress().dueCount();
    const history = [...progress().data.tests.history].reverse().slice(0, 4);

    root.innerHTML = `
      <p class="count-note">${tests.length} tests · ${totalQuestions} preguntas · tu historial y mejores puntuaciones se guardan en este navegador</p>
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ''}

      ${wrong || due ? `
        <div class="home-grid">
          ${wrong ? `
          <section class="panel error-review" aria-label="Repaso de errores">
            <div>
              <p class="section-label">${icon('target', 13)} Errores pendientes</p>
              <p class="error-review-text">Tienes ${wrong} ${wrong === 1 ? 'pregunta fallada' : 'preguntas falladas'} pendiente${wrong === 1 ? '' : 's'} de repasar.</p>
            </div>
            <a class="btn btn-primary" href="#/tests?mode=errores">Repasar ahora</a>
          </section>` : '<span></span>'}
          ${due ? `
          <section class="panel error-review" aria-label="Repasos programados">
            <div>
              <p class="section-label">${icon('clock', 13)} Repasos SRS</p>
              <p class="error-review-text">${due} ${due === 1 ? 'pregunta vence' : 'preguntas vencen'} hoy en tu plan de repetición espaciada.</p>
            </div>
            <a class="btn btn-primary" href="#/tests?mode=srs">Repasar vencidos</a>
          </section>` : '<span></span>'}
        </div>` : ''}

      <section class="panel exam-launcher" aria-labelledby="exam-title">
        <h3 class="section-label" id="exam-title">${icon('clipboard', 13)} Examen configurable</h3>
        <p class="count-note">Mezcla del banco completo con reparto equilibrado entre temas. Sin pistas hasta el final.</p>
        <div class="test-options">
          <label class="test-opt">
            <span class="test-opt-label">Preguntas</span>
            <select class="input" id="exam-count" aria-label="Número de preguntas del examen">
              ${EXAM_COUNTS.map((n) => `<option value="${n === Infinity ? 'all' : n}" ${n === 20 ? 'selected' : ''}>${n === Infinity ? 'Todas' : n}</option>`).join('')}
            </select>
          </label>
          <label class="test-opt">
            <span class="test-opt-label">Categoría</span>
            <select class="input" id="exam-category" aria-label="Categoría del examen">
              <option value="Todas">Todas</option>
              ${(D.categories || []).filter((c) => getTests().some((t) => (t.category || '') === c)).map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
            </select>
          </label>
          <label class="test-opt">
            <span class="test-opt-label">Dificultad</span>
            <select class="input" id="exam-diff" aria-label="Dificultad del examen">
              <option value="">Mixta</option>
              ${DIFFICULTIES.map((d) => `<option value="${d}">${d}</option>`).join('')}
            </select>
          </label>
          <label class="test-opt">
            <span class="test-opt-label">Tiempo</span>
            <select class="input" id="exam-timer" aria-label="Temporizador del examen">
              <option value="0">Sin límite</option>
              <option value="1">Automático (30 s/pregunta)</option>
              <option value="10">10 min</option>
              <option value="20">20 min</option>
              <option value="45">45 min</option>
            </select>
          </label>
          <label class="test-opt check">
            <input type="checkbox" id="exam-strict"> Modo estricto (sin volver atrás)
          </label>
        </div>
        <div class="quiz-actions">
          <button type="button" class="btn btn-primary" id="exam-start">${icon('zap', 14)} Comenzar examen</button>
        </div>
      </section>

      <section class="panel adaptive-launcher" aria-labelledby="adaptive-title">
        <h3 class="section-label" id="adaptive-title">${icon('zap', 13)} Test adaptativo</h3>
        <p class="count-note">Ajusta la dificultad al vuelo: aciertos seguidos suben el nivel, fallos bajan y refuerzan. Prioriza tus preguntas falladas y repasos vencidos.</p>
        <div class="quiz-actions">
          <button type="button" class="btn btn-primary" id="adaptive-start">Empezar sesión adaptativa</button>
        </div>
      </section>

      <ul class="test-list">
        ${tests.map((t) => {
          const best = progress().bestScoreFor(t.id);
          const counts = {};
          t.questions.forEach((q) => { counts[difficultyOf(q)] = (counts[difficultyOf(q)] || 0) + 1; });
          const diffSummary = DIFFICULTIES.filter((d) => counts[d]).map((d) => `${counts[d]} ${d.toLowerCase()}`).join(' · ');
          return `
            <li class="test-card" data-test-card="${t.id}">
              <div class="test-card-head">
                <div class="test-card-info">
                  <h3 class="test-card-title">${icon('clipboard')} ${esc(t.title)}</h3>
                  <p class="test-card-desc">${esc(t.desc)}</p>
                </div>
                <div class="test-card-meta">
                  <span class="badge">${t.questions.length} preguntas</span>
                  ${best !== null ? `<span class="badge badge-done">Mejor ${best}%</span>` : ''}
                </div>
              </div>
              ${diffSummary ? `<p class="count-note">${diffSummary}</p>` : ''}
              <div class="test-options">
                <label class="test-opt">
                  <span class="test-opt-label">Preguntas</span>
                  <select class="input" data-count aria-label="Número de preguntas">
                    ${COUNT_OPTIONS.filter((n) => n === Infinity || n <= t.questions.length).map((n) => `<option value="${n === Infinity ? 'all' : n}" ${n === Infinity ? 'selected' : ''}>${n === Infinity ? 'Todas' : n}</option>`).join('')}
                  </select>
                </label>
                <label class="test-opt">
                  <span class="test-opt-label">Dificultad</span>
                  <select class="input" data-diff aria-label="Dificultad de las preguntas">
                    <option value="">Todas</option>
                    ${DIFFICULTIES.filter((d) => t.questions.some((q) => difficultyOf(q) === d)).map((d) => `<option value="${d}">${d}</option>`).join('')}
                  </select>
                </label>
              </div>
              <div class="mode-row">
                ${['practica', 'examen', 'completo'].map((mode) => `
                  <button type="button" class="mode-btn" data-mode="${mode}" title="${esc(MODES[mode].desc)}">
                    ${esc(MODES[mode].label)}
                  </button>`).join('')}
              </div>
              <p class="count-note test-note" data-note hidden></p>
            </li>`;
        }).join('')}
      </ul>

      ${history.length ? `
        <section class="panel" aria-label="Historial reciente">
          <h3 class="section-label">Historial reciente</h3>
          <ul class="history-list">
            ${history.map((h) => `
              <li class="history-item">
                <span class="history-info">
                  <span class="history-title">${esc(h.title)}</span>
                  <span class="history-meta">${esc(modeConfig(h.mode).label)} · ${h.pct}% · ${h.correct}/${h.total}</span>
                </span>
                <span class="history-score ${h.pct >= 50 ? 'is-ok' : 'is-bad'}">${h.pct}%</span>
              </li>`).join('')}
          </ul>
        </section>` : ''}`;

    /* Lanzador del examen configurable */
    root.querySelector('#exam-start').addEventListener('click', () => {
      const countVal = root.querySelector('#exam-count').value;
      const count = countVal === 'all' ? Infinity : Number(countVal);
      const category = root.querySelector('#exam-category').value;
      const diff = root.querySelector('#exam-diff').value;
      const timerSel = root.querySelector('#exam-timer').value;
      const strict = root.querySelector('#exam-strict').checked;
      const timerMin = timerSel === '1' ? 0 : Number(timerSel); /* 0 con modo auto */
      session = buildExamSession({
        count,
        category,
        difficulty: diff || null,
        timer: timerSel === '1' ? true : (timerMin > 0 ? timerMin * 60 : 0),
        strict
      });
      if (!session.questions.length) {
        renderIndex(root, 'No hay preguntas con esos filtros. Prueba otra combinación.');
        return;
      }
      startTimerIfNeeded(root);
      renderQuestion(root);
    });

    /* Lanzador del adaptativo */
    root.querySelector('#adaptive-start').addEventListener('click', () => startAdaptive(root));

    /* Tarjetas por test */
    root.querySelectorAll('[data-test-card]').forEach((card) => {
      const testId = card.dataset.testCard;
      const countSel = card.querySelector('[data-count]');
      const diffSel = card.querySelector('[data-diff]');
      const note = card.querySelector('[data-note]');
      card.querySelectorAll('[data-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const count = countSel.value === 'all' ? Infinity : Number(countSel.value);
          const diff = diffSel.value;
          const test = findTest(testId);
          if (!test) return;
          note.hidden = true;
          if (diff && count !== Infinity && test.questions.filter((q) => difficultyOf(q) === diff).length < count) {
            note.hidden = false;
            note.textContent = `No hay ${count} preguntas de dificultad ${diff.toLowerCase()} en este test: se usarán las disponibles.`;
          }
          session = buildSessionForTest(test, btn.dataset.mode, { count, difficulty: diff });
          startTimerIfNeeded(root);
          renderQuestion(root);
        });
      });
    });
  }

  /* ---------- Fase 8.8: aviso sobre la pregunta en pantalla ----------
     Solo se ofrece si la pregunta tiene identidad ESTABLE del banco: un
     aviso sin identidad no es accionable. La interfaz no habla con
     Supabase: llama al contrato SMR.feedback (js/cloud-feedback.js). */

  function reportHtml(testId, origIndex) {
    const fb = window.SMR.feedback;
    const key = fb && fb.questionKeyOf(testId, origIndex);
    if (!key) return '';
    return `
        <div class="quiz-report" data-report-test="${esc(testId)}" data-report-index="${origIndex}">
          <button type="button" class="link-like" data-report-open>¿Algo mal en esta pregunta? Avisar</button>
          <div class="report-form field-row" data-report-form hidden>
            <label class="field"><span class="field-label">Motivo</span>
              <select class="input" data-report-reason aria-label="Motivo del aviso">
                <option value="enunciado">El enunciado no se entiende</option>
                <option value="respuesta">La respuesta correcta no lo es</option>
                <option value="contexto">Falta información o explicación</option>
                <option value="otro">Otro</option>
              </select></label>
            <label class="field"><span class="field-label">Detalles (opcional, máximo 1000 caracteres)</span>
              <textarea class="input" data-report-details rows="3" maxlength="1000"
                        aria-label="Detalles del aviso" placeholder="Qué falla exactamente…"></textarea></label>
            <div class="report-actions">
              <button type="button" class="btn btn-sm" data-report-send>Enviar aviso</button>
              <button type="button" class="btn btn-sm" data-report-cancel>Cancelar</button>
              <span class="count-note" data-report-status role="status" aria-live="polite"></span>
            </div>
          </div>
        </div>`;
  }

  function wireReport(root) {
    const fb = window.SMR.feedback;
    if (!fb) return;
    root.querySelectorAll('[data-report-test]').forEach((box) => {
      const open = box.querySelector('[data-report-open]');
      const form = box.querySelector('[data-report-form]');
      const reason = box.querySelector('[data-report-reason]');
      const details = box.querySelector('[data-report-details]');
      const status = box.querySelector('[data-report-status]');
      const send = box.querySelector('[data-report-send]');
      const cancel = box.querySelector('[data-report-cancel]');
      if (!open || !form || !reason || !details || !status || !send || !cancel) return;
      const testId = box.dataset.reportTest;
      const origIndex = Number(box.dataset.reportIndex);

      open.addEventListener('click', () => {
        form.hidden = false;
        status.textContent = '';
        reason.focus();
      });

      cancel.addEventListener('click', () => {
        form.hidden = true;
        status.textContent = '';
      });

      send.addEventListener('click', async () => {
        if (send.disabled) return; /* un doble clic no envía dos avisos */
        const key = fb.questionKeyOf(testId, origIndex);
        if (!key) {
          status.textContent = fb.MESSAGES.invalid;
          return;
        }
        send.disabled = true;
        status.textContent = 'Enviando…';
        const result = await fb.submitQuestionReport({
          testId: testId,
          questionKey: key,
          reason: reason.value,
          details: details.value
        });
        send.disabled = false;
        if (result.ok) {
          form.hidden = true;
          details.value = '';
          status.textContent = 'Gracias: hemos registrado el aviso.';
          return;
        }
        status.textContent = fb.MESSAGES[result.reason] || fb.MESSAGES.error;
      });
    });
  }

  /* ---------- Pregunta ---------- */

  function renderQuestion(root) {
    const s = session;
    const c = s.questions[s.index];
    const notice = srsNotice;
    srsNotice = ''; /* de un solo uso */
    const q = c.q;
    const total = s.adaptive ? s.adaptive.total : s.questions.length;
    const answered = s.index;
    const pct = Math.round((answered / total) * 100);
    const showTimer = s.cfg.timer > 0;
    const isExam = s.mode === 'examen';
    const lvl = s.adaptive ? s.adaptive.level : null;

    root.innerHTML = `
      <div class="quiz">
        <div class="quiz-head">
          <button type="button" class="btn btn-sm" id="quiz-exit">Salir</button>
          <p class="quiz-counter">Pregunta ${s.index + 1} de ${total}</p>
          ${showTimer ? `<p class="quiz-timer mono" id="quiz-timer" aria-label="Tiempo restante"></p>` : ''}
          <p class="quiz-score">${isExam ? 'Sin pistas hasta el final' : `Aciertos: ${s.correct}`}</p>
        </div>
        <p class="quiz-mode">${esc(s.cfg.label)}${s.multi ? ` · ${esc(c.testTitle || '')}` : ` · ${esc(s.title)}`} · <span class="quiz-diff">${esc(difficultyOf(q))}</span>${lvl !== null ? ` · <span class="quiz-diff">nivel ${lvl + 1}/3</span>` : ''}</p>
        ${notice ? `<p class="notice" role="status">${esc(notice)}</p>` : ''}
        <div class="quiz-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progreso del test">
          <div class="quiz-progress-fill" style="width: ${pct}%"></div>
        </div>
        <h3 class="quiz-q">${esc(q.q)}</h3>
        <div class="quiz-options">
          ${q.options.map((opt, i) => `
            <button type="button" class="quiz-option" data-i="${i}">
              <span class="opt-letter mono">${String.fromCharCode(97 + i)})</span> ${esc(opt)}
            </button>`).join('')}
        </div>
        <div class="quiz-explain" id="quiz-explain" hidden aria-live="polite"></div>
        <div class="quiz-actions">
          <button type="button" class="btn btn-primary" id="quiz-next" hidden>${s.index + 1 === total ? 'Ver resultado' : 'Siguiente pregunta'}</button>
        </div>
        ${s.mode === 'srs' ? `<div data-srs-test="${esc(c.testId)}" data-srs-index="${c.origIndex}">${srsDropHtml(c.testId, c.origIndex)}</div>` : ''}
        ${reportHtml(c.testId, c.origIndex)}
      </div>`;

    if (showTimer) updateTimerEl();

    root.querySelector('#quiz-exit').addEventListener('click', () => {
      stop();
      session = null;
      renderIndex(root);
    });

    const optionBtns = [...root.querySelectorAll('.quiz-option')];
    const explainEl = root.querySelector('#quiz-explain');
    const nextBtn = root.querySelector('#quiz-next');

    optionBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = Number(btn.dataset.i);
        const ok = chosen === q.correct;
        if (ok) s.correct += 1;
        s.answers.push({ question: c, chosen, ok });

        optionBtns.forEach((b) => {
          b.disabled = true;
          if (Number(b.dataset.i) === q.correct) b.classList.add('correct');
          b.setAttribute('aria-disabled', 'true');
        });
        if (!ok) btn.classList.add('wrong');

        if (s.cfg.explain) {
          const parts = [];
          parts.push(ok
            ? `<strong>Correcto.</strong> ${esc(q.explain)}`
            : `<strong>Incorrecto.</strong> La respuesta correcta es «${esc(q.options[q.correct])}». ${esc(q.explain)}`);
          if (!ok && q.wrongWhy && q.wrongWhy[chosen]) {
            parts.push(`<span class="explain-extra">Tu opción: ${esc(q.wrongWhy[chosen])}</span>`);
          }
          const resTitle = q.relatedResource ? resourceTitle(q.relatedResource) : null;
          if (resTitle) {
            parts.push(`<button type="button" class="link-like explain-link" data-review-res="${esc(q.relatedResource)}">Repasar: ${esc(resTitle)}</button>`);
          }
          explainEl.innerHTML = parts.join(' ');
        } else {
          explainEl.innerHTML = '<strong>Respuesta registrada.</strong> El detalle se muestra al finalizar el examen.';
        }
        explainEl.className = `quiz-explain ${ok ? 'ok' : 'bad'}`;
        explainEl.hidden = false;
        nextBtn.hidden = false;
        if (!isExam) root.querySelector('.quiz-score').textContent = `Aciertos: ${s.correct}`;
        nextBtn.focus();
      }, { once: true });
    });

    explainEl.addEventListener('click', (event) => {
      const link = event.target.closest('[data-review-res]');
      if (!link) return;
      window.SMR.openResource(link.dataset.reviewRes);
    });

    /* 8.5.10: quitar del repaso la tarjeta que se está viendo (mismo
       contrato y misma confirmación que 8.5.9; el avance lo decide
       advanceAfterSrsDrop). */
    if (s.mode === 'srs') wireSrsDrop(root, (testId, origIndex, message) => advanceAfterSrsDrop(root, testId, origIndex, message));

    /* Fase 8.8: aviso sobre la pregunta en pantalla. */
    wireReport(root);

    nextBtn.addEventListener('click', () => {
      if (s.adaptive) {
        const last = s.answers[s.answers.length - 1];
        s.adaptive.streak = last && last.ok ? (s.adaptive.streak + 1) : (s.adaptive.streak - 1);
        s.index += 1;
        renderAdaptiveQuestion(root);
        return;
      }
      if (s.index + 1 < s.questions.length) {
        if (s.strict) { s.index += 1; renderQuestion(root); }
        else { s.index += 1; renderQuestion(root); }
      } else {
        renderResult(root);
      }
    });
  }

  /* ---------- Resultado ---------- */

  function resultMessage(pct) {
    if (pct >= 85) return '¡Excelente! Dominas el tema.';
    if (pct >= 50) return 'Bien. Repasa los fallos y vuelve a intentarlo.';
    return 'Repasa los recursos de la sección y repite el test.';
  }

  /* Recursos a repasar según las preguntas falladas */
  function recommendationsFor(answers) {
    const counts = {};
    answers.forEach((a) => {
      if (a.ok) return;
      const rid = a.question.q.relatedResource;
      if (!rid) return;
      counts[rid] = (counts[rid] || 0) + 1;
    });
    return Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .map((rid) => {
        const title = resourceTitle(rid);
        return title ? { id: rid, title, count: counts[rid] } : null;
      })
      .filter(Boolean);
  }

  /* Rendimiento por categoría y por tema */
  function breakdownFor(answers) {
    const byCat = {};
    const byTopic = {};
    answers.forEach((a) => {
      const cat = a.question.category || 'General';
      const topic = topicOf(a.question.q);
      byCat[cat] = byCat[cat] || { ok: 0, total: 0 };
      byTopic[cat + '::' + topic] = byTopic[cat + '::' + topic] || { cat, topic, ok: 0, total: 0 };
      byCat[cat].total += 1;
      byTopic[cat + '::' + topic].total += 1;
      if (a.ok) { byCat[cat].ok += 1; byTopic[cat + '::' + topic].ok += 1; }
    });
    const cats = Object.keys(byCat).map((k) => ({ cat: k, ok: byCat[k].ok, total: byCat[k].total, pct: Math.round((byCat[k].ok / byCat[k].total) * 100) })).sort((a, b) => a.pct - b.pct);
    const topics = Object.keys(byTopic).map((k) => byTopic[k]).map((t) => Object.assign(t, { pct: Math.round((t.ok / t.total) * 100) })).sort((a, b) => a.pct - b.pct);
    return { cats, topics };
  }

  function commitResults() {
    const s = session;
    if (s.multi) {
      const groups = {};
      s.answers.forEach((a) => {
        const testId = a.question.testId;
        if (!groups[testId]) groups[testId] = { correct: 0, total: 0, answers: [] };
        groups[testId].total += 1;
        if (a.ok) groups[testId].correct += 1;
        groups[testId].answers.push({ origIndex: a.question.origIndex, ok: a.ok });
      });
      Object.keys(groups).forEach((testId) => {
        const test = findTest(testId);
        progress().recordTest({
          testId,
          title: test ? test.title : testId,
          correct: groups[testId].correct,
          total: groups[testId].total,
          answers: groups[testId].answers,
          mode: s.mode
        });
      });
    } else {
      progress().recordTest({
        testId: s.testId,
        title: s.title,
        correct: s.correct,
        total: s.questions.length,
        answers: s.answers.map((a) => ({ origIndex: a.question.origIndex, ok: a.ok })),
        mode: s.mode
      });
    }
  }

  function renderResult(root) {
    stop();
    const s = session;
    const total = s.questions.length;
    if (!total) { renderIndex(root); return; }
    const answered = s.answers.length;
    const correct = s.answers.filter((a) => a.ok).length;
    const wrong = answered - correct;
    const pct = Math.round((correct / total) * 100);
    commitResults();

    const elapsed = s.timeSpent || Math.round((Date.now() - s.startedAt) / 1000);
    const timeText = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    const breakdown = breakdownFor(s.answers);
    const recommendations = recommendationsFor(s.answers);
    const best = s.multi ? null : progress().bestScoreFor(s.testId);

    const srsMod = window.SMR.srs || null;
    const review = s.questions.map((c) => {
      const answer = s.answers.find((a) => a.question === c);
      const q = c.q;
      /* test de ORIGEN: en sesiones multi cada pregunta lleva su test;
         en sesión simple es s.testId. origIndex es la posición en ese test. */
      const srsTest = s.multi ? (c.testId || s.testId) : s.testId;
      const ok = answer ? answer.ok : false;
      const chosenText = answer ? q.options[answer.chosen] : null;
      const wrongWhy = (!ok && answer && q.wrongWhy && q.wrongWhy[answer.chosen])
        ? `<p class="review-why">${esc(q.wrongWhy[answer.chosen])}</p>` : '';
      const resTitle = q.relatedResource ? resourceTitle(q.relatedResource) : null;
      const resLink = resTitle
        ? `<button type="button" class="link-like review-link" data-review-res="${esc(q.relatedResource)}">Repasar: ${esc(resTitle)}</button>` : '';
      return `
        <li class="${ok ? 'ok' : 'ko'}">
          ${s.multi ? `<p class="review-test">${esc(c.testTitle || '')}</p>` : ''}
          <p class="review-q">${esc(q.q)} <span class="badge badge-level">${esc(difficultyOf(q))}</span></p>
          <p class="review-a">
            ${ok
              ? `<span class="ok-text">Correcta:</span> ${esc(q.options[q.correct])}`
              : `${chosenText === null ? '<span class="ko-text">Sin responder.</span> ' : `<span class="ko-text">Tu respuesta:</span> ${esc(chosenText)} · `}<span class="ok-text">Correcta:</span> ${esc(q.options[q.correct])}`}
          </p>
          ${wrongWhy}
          <p class="review-ex">${esc(q.explain)}</p>
          ${resLink}
          ${srsRateHtml(srsTest, c.origIndex) ? `<div data-srs-test="${esc(srsTest)}" data-srs-index="${c.origIndex}">${srsRateHtml(srsTest, c.origIndex)}${srsDropHtml(srsTest, c.origIndex)}</div>` : ''}
        </li>`;
    }).join('');

    root.innerHTML = `
      <div class="quiz">
        <p class="section-label">${esc(s.title)} · ${esc(s.cfg.label)}</p>
        <p class="score-big">${correct} / ${total} <span class="score-pct">${pct}%</span></p>
        <p class="quiz-msg">${resultMessage(pct)}${best !== null ? ` Mejor puntuación guardada: ${best}%.` : ''}</p>
        <div class="stat-pills result-pills">
          <div class="stat-pill"><span class="stat-pill-icon">${icon('check', 16)}</span><span class="stat-pill-value">${correct}</span><span class="stat-pill-label">Correctas</span></div>
          <div class="stat-pill"><span class="stat-pill-icon">${icon('x', 16)}</span><span class="stat-pill-value">${wrong}</span><span class="stat-pill-label">Incorrectas</span></div>
          <div class="stat-pill"><span class="stat-pill-icon">${icon('circleCheck', 16)}</span><span class="stat-pill-value">${total - answered}</span><span class="stat-pill-label">Sin responder</span></div>
          <div class="stat-pill"><span class="stat-pill-icon">${icon('clock', 16)}</span><span class="stat-pill-value">${timeText}</span><span class="stat-pill-label">Tiempo</span></div>
        </div>

        ${breakdown.cats.length > 1 ? `
        <section class="panel result-breakdown" aria-label="Rendimiento por categoría">
          <p class="section-label">${icon('chart', 13)} Por categoría</p>
          <ul class="cat-bars">
            ${breakdown.cats.map((c) => `
              <li class="cat-bar">
                <span class="cat-bar-name">${esc(c.cat)}</span>
                <span class="cat-bar-track"><div class="pbar"><div class="pbar-fill${c.pct < 50 ? ' pbar-low' : ''}" style="width:${c.pct}%"></div></div></span>
                <span class="cat-bar-value">${c.pct}% · ${c.ok}/${c.total}</span>
              </li>`).join('')}
          </ul>
        </section>` : ''}

        ${breakdown.topics.length > 2 ? `
        <section class="panel result-breakdown" aria-label="Rendimiento por tema">
          <p class="section-label">${icon('target', 13)} Temas a reforzar</p>
          <ul class="history-list">
            ${breakdown.topics.slice(0, 6).map((t) => `
              <li class="history-item">
                <span class="history-info">
                  <span class="history-title">${esc(t.topic)}</span>
                  <span class="history-meta">${esc(t.cat)}</span>
                </span>
                <span class="history-score ${t.pct >= 70 ? 'is-ok' : (t.pct >= 50 ? 'is-mid' : 'is-bad')}">${t.pct}%</span>
              </li>`).join('')}
          </ul>
        </section>` : ''}

        ${recommendations.length ? `
          <section class="panel study-recs" aria-label="Recomendaciones de estudio">
            <p class="section-label">${icon('bookOpen', 13)} Te recomendamos repasar</p>
            <ul class="link-list compact">
              ${recommendations.map((rec) => `
                <li><button type="button" class="link-row link-row-btn" data-open-res="${rec.id}">
                  ${icon('fileText')}
                  <span class="link-row-text">
                    <span class="link-row-title">${esc(rec.title)}</span>
                    <span class="link-row-desc">${rec.count > 1 ? `${rec.count} fallos en este tema` : 'Recurso relacionado con tus fallos'}</span>
                  </span>
                  ${icon('chevronRight')}
                </button></li>`).join('')}
            </ul>
          </section>` : ''}

        <div class="quiz-actions result-actions">
          <button type="button" class="btn btn-primary" id="quiz-retry">Repetir ${esc(s.cfg.label)}</button>
          <button type="button" class="btn" id="quiz-errors">Repetir errores</button>
          <button type="button" class="btn" id="quiz-back">Volver a tests</button>
        </div>
        <h3 class="section-label review-title">Revisión</h3>
        <ul class="review-list">${review}</ul>
      </div>`;

    root.querySelectorAll('[data-open-res]').forEach((btn) => {
      btn.addEventListener('click', () => window.SMR.openResource(btn.dataset.openRes));
    });
    root.querySelectorAll('[data-review-res]').forEach((btn) => {
      btn.addEventListener('click', () => window.SMR.openResource(btn.dataset.reviewRes));
    });
    wireSrsRating(root);
    wireSrsDrop(root);

    root.querySelector('#quiz-retry').addEventListener('click', () => {
      if (s.mode === 'examen') {
        session = buildExamSession(Object.assign({}, s.examFilter, { timer: s.cfg.timer > 0 ? true : 0, strict: s.strict }));
        if (session.cfg.timer) startTimerIfNeeded(root);
        renderQuestion(root);
      } else if (s.mode === 'adaptativo') {
        startAdaptive(root);
      } else if (s.multi) {
        const rebuilt = s.mode === 'errores' ? buildErrorSession() : (s.mode === 'srs' ? buildSrsSession() : null);
        if (!rebuilt) { renderIndex(root); return; }
        session = rebuilt;
        renderQuestion(root);
      } else {
        const test = findTest(s.testId);
        if (!test) { renderIndex(root); return; }
        session = buildSessionForTest(test, s.mode, { count: s.examFilter && isFinite(s.examFilter.count) ? s.examFilter.count : undefined, difficulty: s.examFilter ? s.examFilter.difficulty : undefined });
        startTimerIfNeeded(root);
        renderQuestion(root);
      }
    });

    root.querySelector('#quiz-errors').addEventListener('click', () => {
      const rebuilt = buildErrorSession();
      if (!rebuilt) { renderIndex(root, 'No hay preguntas para repasar. ¡Buen trabajo!'); return; }
      session = rebuilt;
      renderQuestion(root);
    });
    root.querySelector('#quiz-back').addEventListener('click', () => renderIndex(root));
  }

  /* 8.5.4-C: autoevaluación SRS en la lista de revisión del resultado.
     La valoración (0 «No lo sabía» / 1 «Dudé» / 2 «Lo sabía») es la
     percepción del usuario: NUNCA se deduce de acierto/fallo. Solo se
     muestra si SMR.srs.idOf resuelve la identidad estable de la pregunta
     (con el test de ORIGEN en sesiones multi); si no hay identidad no se
     muestran controles que puedan crear claves posicionales inválidas.
     Llama a la función existente SMR.progress.scheduleSrs(testId,
     origIndex, rate), ya conectada a la sincronización cloud (push RPC
     merge_srs_cards vía snapshotProgress; fix 8.5.4-B1). */
  const SRS_RATE_LABELS = ['No lo sabía', 'Dudé', 'Lo sabía'];

  /* Rate actual de la pregunta en tests.srs (o null si no tiene). */
  function srsRateOf(testId, origIndex) {
    const srs = progress().data.tests.srs;
    const key = window.SMR.srs && SMR.srs.idOf(testId, origIndex);
    if (!key) return { key: null, level: null };
    const entry = srs[key];
    return { key, level: entry && typeof entry.level === 'number' ? entry.level : null };
  }

  /* HTML de la fila de valoración para un elemento de review.
     Sin identidad estable: hilo vacío (no se puede crear tarjeta). */
  function srsRateHtml(testId, origIndex) {
    if (!window.SMR.srs || typeof window.SMR.srs.idOf !== 'function') return '';
    const { key, level } = srsRateOf(testId, origIndex);
    if (!key) return '';
    const current = level === null ? null : Math.min(2, Math.max(0, level));
    const btns = SRS_RATE_LABELS.map((label, i) =>
      `<button type="button" class="btn btn-sm self-btn${current === i ? ' active' : ''}" data-srs-rate="${i}"`
        + ` aria-pressed="${current === i}" aria-label="${esc(label)} (valoración SRS)">${esc(label)}</button>`).join('');
    return `<div class="self-check-row review-srs-rate" role="group" aria-label="Valoración SRS">${btns}</div>`;
  }

  /* 8.5.9: quitar una tarjeta del repaso (borrado SRS).
     La UI solo confirma y llama al dropSrs real: el borrado es local e
     inmediato y la propagación remota (tombstone) la resuelve
     cloud-progress con su marca pending y la RPC; aquí no se toca ni el
     SRS ni esa marca. El mensaje nunca promete borrado remoto inmediato.
     Sin identidad estable no hay tarjeta que quitar (fila vacía). */
  function srsDropHtml(testId, origIndex) {
    const { key, level } = srsRateOf(testId, origIndex);
    if (!key) return '';
    return `<div class="srs-drop-row">
      <button type="button" class="btn btn-sm btn-danger" data-srs-drop${level === null ? ' hidden' : ''}
              aria-label="Quitar esta pregunta del repaso espaciado">${icon('x', 14)} Quitar del repaso</button>
      <p class="hint-inline srs-drop-status" role="status"></p>
    </div>`;
  }

  /* Texto de la pregunta para la confirmación: el usuario confirma sobre
     la tarjeta que ve, no sobre una posición. */
  function srsCardTitle(testId, origIndex) {
    const test = findTest(testId);
    const q = test && test.questions[origIndex];
    return q ? q.q : '';
  }

  function srsDropConfirmHtml(title) {
    return `
      <div class="modal-head">
        <div>
          <h3 class="modal-title">Quitar del repaso</h3>
          <p class="modal-meta">Repetición espaciada</p>
        </div>
        <button type="button" class="icon-btn modal-close" aria-label="Cerrar">${icon('x')}</button>
      </div>
      ${title ? `<p class="modal-desc">${esc(title)}</p>` : ''}
      <p class="hint-inline">Se quitará de tu repaso programado. La pregunta del banco y tu historial no cambian.</p>
      <div class="modal-foot">
        <button type="button" class="btn" data-srs-cancel>Cancelar</button>
        <button type="button" class="btn btn-danger" data-srs-confirm>Quitar del repaso</button>
      </div>`;
  }

  /* Confirmación con el modal del design system (foco atrapado, Escape y
     cierre por overlay ya resueltos en SMR.modal). Cancelar no toca nada. */
  function openSrsDropConfirm(testId, origIndex, onResult) {
    window.SMR.modal.open((box) => {
      box.innerHTML = srsDropConfirmHtml(srsCardTitle(testId, origIndex));
      box.querySelector('.modal-close').addEventListener('click', window.SMR.modal.close);
      box.querySelector('[data-srs-cancel]').addEventListener('click', window.SMR.modal.close);
      const confirm = box.querySelector('[data-srs-confirm]');
      confirm.addEventListener('click', () => {
        confirm.disabled = true; /* un solo borrado por confirmación */
        let error = null;
        try {
          progress().dropSrs(testId, origIndex);
        } catch (err) {
          error = err;
        }
        window.SMR.modal.close();
        onResult(error);
      }, { once: true });
    });
  }

  /* Refresco local tras el borrado: la tarjeta ya no existe, así que la
     acción se oculta y el rate vuelve a "sin valorar" (re-valorar es el
     revive explícito); si el borrado falla, la acción sigue disponible. */
  /* 8.5.10: avance determinista del repaso SRS tras quitar la tarjeta
     actual. La tarjeta sale del conjunto (y su respuesta, si ya la había
     dado, para que los totales del resultado no cuenten una pregunta que
     ya no está); el índice queda apuntando a la siguiente sin saltarse
     ninguna ni repetirla. Si era la última, el repaso termina. */
  function advanceAfterSrsDrop(root, testId, origIndex, message) {
    const s = session;
    if (!s || s.mode !== 'srs') return;
    const at = s.questions.findIndex((q) => q.testId === testId && q.origIndex === origIndex);
    if (at < 0) return; /* ya no está en el repaso: nada que avanzar */
    const card = s.questions[at];
    const ansAt = s.answers.findIndex((a) => a.question === card);
    if (ansAt >= 0) {
      if (s.answers[ansAt].ok) s.correct -= 1;
      s.answers.splice(ansAt, 1);
    }
    s.questions.splice(at, 1);
    if (!s.questions.length) { /* se quedó sin repasos: estado vacío ya existente */
      stop();
      session = null;
      renderIndex(root, 'No hay repasos vencidos hoy. Vuelve cuando venzan.');
      return;
    }
    if (at >= s.questions.length) { srsNotice = ''; renderResult(root); return; } /* era la última: el repaso acaba */
    srsNotice = message || ''; /* el aviso viaja a la siguiente pantalla */
    renderQuestion(root);
  }

  function syncSrsDrop(wrapper, testId, origIndex) {
    if (!wrapper) return;
    const drop = wrapper.querySelector('[data-srs-drop]');
    const status = wrapper.querySelector('.srs-drop-status');
    if (drop) {
      const { key, level } = srsRateOf(testId, origIndex);
      drop.hidden = !key || level === null;
      if (!drop.hidden) drop.disabled = false;
    }
    if (status) status.textContent = '';
  }

  function setSrsDropStatus(wrapper, message) {
    const status = wrapper && wrapper.querySelector('.srs-drop-status');
    if (status) status.textContent = message;
  }

  /* Wiring: un listener por render (nunca once: el botón vuelve a estar
     disponible si la tarjeta revive). El modal abierto impide un segundo
     borrado, y la confirmación se deshabilita al pulsarla una vez. */
  function wireSrsDrop(root, onDeleted) {
    root.querySelectorAll('[data-srs-drop]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const wrapper = btn.closest('[data-srs-test]');
        if (!wrapper) return;
        const testId = wrapper.dataset.srsTest;
        const origIndex = Number(wrapper.dataset.srsIndex);
        if (!testId || !Number.isInteger(origIndex)) return;
        openSrsDropConfirm(testId, origIndex, (error) => {
          if (error) {
            btn.disabled = false; /* reintentable */
            setSrsDropStatus(wrapper, 'No se pudo quitar del repaso. Inténtalo de nuevo.');
            return;
          }
          wrapper.querySelectorAll('[data-srs-rate]').forEach((b) => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
          });
          syncSrsDrop(wrapper, testId, origIndex);
          const signedIn = !!(window.SMR.auth && typeof window.SMR.auth.isSignedIn === 'function' && window.SMR.auth.isSignedIn());
          const message = signedIn
            ? 'Quitada del repaso. Se sincronizará con tu cuenta.'
            : 'Quitada del repaso en este dispositivo.';
          setSrsDropStatus(wrapper, message);
          if (typeof onDeleted === 'function') onDeleted(testId, origIndex, message);
        });
      });
    });
  }

  /* Wiring: un listener delegado por render; cada clic registra UNA
     valoración (scheduleSrs es idempotente por PK question_key) y
     actualiza el estado visual del grupo. Re-valorar sobrescribe la
     entrada { level, due } de la tarjeta (semántica real de
     scheduleSrs: el nivel se ajusta relativo al actual y la due se
     recalcula — no hay doble registro ni conflicto de persistencia). */
  function wireSrsRating(root) {
    if (!window.SMR.srs) return;
    root.querySelectorAll('[data-srs-rate]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const li = btn.closest('[data-srs-test]');
        if (!li) return;
        const rate = Number(btn.dataset.srsRate);
        if (![0, 1, 2].includes(rate)) return;
        progress().scheduleSrs(li.dataset.srsTest, Number(li.dataset.srsIndex), rate);
        li.querySelectorAll('[data-srs-rate]').forEach((b) => {
          const active = Number(b.dataset.srsRate) === rate;
          b.classList.toggle('active', active);
          b.setAttribute('aria-pressed', String(active));
        });
        /* la tarjeta ya existe (o revive): la acción de quitar vuelve */
        syncSrsDrop(li, li.dataset.srsTest, Number(li.dataset.srsIndex));
      }, { once: true });
    });
  }

  /* ---------- Página de tests ---------- */

  function render(root) {
    const query = window.SMR.activeQuery || new URLSearchParams();
    const testId = query.get('test');
    const mode = query.get('mode');
    const test = testId ? findTest(testId) : null;

    if (mode === 'errores') {
      const errorSession = buildErrorSession();
      if (errorSession) {
        session = errorSession;
        renderQuestion(root);
      } else {
        renderIndex(root, 'No hay preguntas para repasar. ¡Buen trabajo!');
      }
      return;
    }

    if (mode === 'srs') {
      const srsSession = buildSrsSession();
      if (srsSession) {
        session = srsSession;
        renderQuestion(root);
      } else {
        renderIndex(root, 'No hay repasos vencidos hoy. Vuelve cuando venzan.');
      }
      return;
    }

    if (mode === 'adaptativo') {
      startAdaptive(root);
      return;
    }

    if (mode === 'examen' && !testId) {
      session = buildExamSession({});
      startTimerIfNeeded(root);
      renderQuestion(root);
      return;
    }

    if (test) {
      const count = Number(query.get('count'));
      const diff = query.get('diff');
      session = buildSessionForTest(test, MODES[mode] ? mode : 'practica', {
        count: count > 0 ? count : undefined,
        difficulty: diff || undefined
      });
      startTimerIfNeeded(root);
      renderQuestion(root);
      return;
    }

    if (testId && !test) {
      renderIndex(root, 'El test solicitado no existe. Estos son los disponibles:');
      return;
    }

    renderIndex(root);
  }

  function searchEntries() {
    return getTests().map((t) => ({
      title: t.title,
      meta: `Test · ${t.questions.length} preguntas`,
      group: 'Tests',
      hash: `#/tests?test=${t.id}`,
      text: `${t.title} ${t.desc} test autoevaluación preguntas examen práctica`.toLowerCase()
    }));
  }

  /* ---------- API para el Modo Estudio ---------- */

  function studyQuestion({ resourceId = null, excludeKeys = [] } = {}) {
    const exclude = new Set(excludeKeys);
    const take = (pool) => pool.filter((c) => !exclude.has(`${c.testId}:${c.origIndex}`));

    /* 1. Vencidos de SRS, luego falladas */
    const srsDue = take(progress().dueSrs()
      .map((item) => {
        const test = findTest(item.testId);
        const q = test && test.questions[item.qIndex];
        return test && q ? { q, origIndex: item.qIndex, testId: item.testId } : null;
      }).filter(Boolean))
      .filter((c) => !resourceId || c.q.relatedResource === resourceId);
    if (srsDue.length) return srsDue[Math.floor(Math.random() * srsDue.length)];

    const wrongCandidates = take(progress().wrongRefs()
      .map((ref) => {
        const test = findTest(ref.testId);
        const q = test && test.questions[ref.qIndex];
        return test && q ? { q, origIndex: ref.qIndex, testId: test.id } : null;
      }).filter(Boolean));

    const fromWrong = wrongCandidates.filter((c) => !resourceId || c.q.relatedResource === resourceId);
    if (fromWrong.length) return fromWrong[Math.floor(Math.random() * fromWrong.length)];

    const anyWrong = take(wrongCandidates);
    if (anyWrong.length && Math.random() < 0.6) return anyWrong[Math.floor(Math.random() * anyWrong.length)];

    /* 2. Preguntas del recurso indicado */
    if (resourceId) {
      const pool = allCandidates().filter((c) => c.q.relatedResource === resourceId);
      const available = take(pool);
      if (available.length) return available[Math.floor(Math.random() * available.length)];
    }

    /* 3. Cualquier pregunta del banco */
    const available = take(allCandidates());
    if (!available.length) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  function studyBlocks(count = 3) {
    const recs = progress();
    const seen = new Set();
    const blocks = [];

    recs.dueSrs().slice(0, count).forEach((item) => {
      const test = findTest(item.testId);
      const q = test && test.questions[item.qIndex];
      if (!q) return;
      const key = q.relatedResource || q.q;
      if (seen.has(key)) return;
      seen.add(key);
      blocks.push({ resourceId: q.relatedResource || null, key, origin: 'srs' });
    });

    recs.wrongRefs().slice(0, count).forEach((ref) => {
      const test = findTest(ref.testId);
      const q = test && test.questions[ref.qIndex];
      if (!q) return;
      const key = q.relatedResource || q.q;
      if (seen.has(key)) return;
      seen.add(key);
      blocks.push({ resourceId: q.relatedResource || null, key, origin: 'error' });
    });

    const pending = (D.resources || [])
      .filter((r) => !recs.isCompleted(r.id))
      .filter((r) => getTests().some((t) => t.questions.some((q) => q.relatedResource === r.id)));
    shuffle(pending).forEach((r) => {
      if (blocks.length >= count) return;
      const key = r.id;
      if (seen.has(key)) return;
      seen.add(key);
      blocks.push({ resourceId: r.id, key, origin: 'pendiente' });
    });

    return blocks;
  }

  return { render, searchEntries, stop, studyQuestion, studyBlocks };
})();

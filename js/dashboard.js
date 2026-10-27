'use strict';

/* La maestría usa el nivel SRS y los fallos pendientes que guarda el motor.
   Una pregunta con fallos cuenta la mitad incluso con nivel alto: acertar
   una vez no implica dominarla. Los módulos son los que tienen preguntas
   en SMR_DATA.tests; la vista no añade módulos curriculares vacíos.
   Estos cálculos solo leen progreso; app.js conserva la responsabilidad de guardarlo. */

window.SMR = window.SMR || {};

window.SMR.dashboard = (function () {
  const MAX_LEVEL = 5;       /* espejo de SRS_MAX_LEVEL en app.js ([1,1,3,7,14,30]) */
  const WRONG_PENALTY = 0.5;
  const DEFAULT_QUEUE = 20;

  const esc = (v) => window.SMR.esc(v);
  const icon = (name, size = 16) => window.SMR.icon(name, size);

  /* ---------- Acceso a datos (inyectable para las pruebas) ---------- */

  function currentData() {
    return (window.SMR.progress && window.SMR.progress.data) || {};
  }
  function currentBank() {
    return window.SMR_DATA && Array.isArray(window.SMR_DATA.tests) ? window.SMR_DATA.tests : [];
  }
  function srsOf(state) {
    return (state.tests && state.tests.srs) || {};
  }
  function wrongOf(state, testId) {
    return (state.tests && state.tests.wrong && state.tests.wrong[testId]) || {};
  }

  /* Misma clave que usa app.js al programar: ID estable de la pregunta, o la
     posicional si srs.js no está cargado. */
  function keyOf(testId, index) {
    return (window.SMR.srs && window.SMR.srs.idOf(testId, index)) || testId + ':' + index;
  }
  function cardOf(srs, testId, index) {
    return srs[keyOf(testId, index)] || srs[testId + ':' + index] || null;
  }

  /* ---------- Maestría por módulo ---------- */

  function strengthOf(card, misses) {
    if (!card || typeof card.level !== 'number' || !isFinite(card.level)) return 0;
    const level = Math.min(MAX_LEVEL, Math.max(0, card.level));
    const base = (level + 1) / (MAX_LEVEL + 1);
    return misses > 0 ? base * WRONG_PENALTY : base;
  }

  function calculateModuleMastery(state, tests) {
    const dataRef = state || currentData();
    const list = tests || currentBank();
    const srs = srsOf(dataRef);

    return list.map((test) => {
      const questions = Array.isArray(test.questions) ? test.questions : [];
      const wrong = wrongOf(dataRef, test.id);
      let sum = 0;
      let mastered = 0;

      questions.forEach((q, i) => {
        const card = cardOf(srs, test.id, i);
        const misses = wrong[keyOf(test.id, i)] || 0;
        sum += strengthOf(card, misses);
        if (card && card.level >= MAX_LEVEL && !misses) mastered += 1;
      });

      const total = questions.length;
      return {
        id: test.id,
        title: test.title,
        category: test.category || 'General',
        total,
        mastered,
        pending: total - mastered,
        pct: total ? Math.round((sum / total) * 100) : 0
      };
    });
  }

  /* ---------- Cola de repaso inteligente ---------- */

  function getSmartReviewQueue(limit = DEFAULT_QUEUE, state, tests) {
    const dataRef = state || currentData();
    const list = tests || currentBank();
    const srs = srsOf(dataRef);
    const now = Date.now();
    const queue = [];

    list.forEach((test) => {
      const wrong = wrongOf(dataRef, test.id);
      const questions = Array.isArray(test.questions) ? test.questions : [];
      questions.forEach((q, i) => {
        const card = cardOf(srs, test.id, i);
        const misses = wrong[keyOf(test.id, i)] || 0;
        const due = card && typeof card.due === 'number' ? card.due : null;
        const overdue = due !== null && due <= now;
        if (!overdue && !misses) return;
        queue.push({
          q,
          origIndex: i,
          testId: test.id,
          testTitle: test.title,
          category: test.category || 'General',
          due,
          level: card && typeof card.level === 'number' ? card.level : null,
          wrong: misses,
          overdue
        });
      });
    });

    queue.sort((a, b) => {
      /* Primero lo vencido, de más antigua a más reciente; después lo fallado. */
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.overdue) return (a.due - b.due) || (b.wrong - a.wrong);
      return (b.wrong - a.wrong) || ((a.due === null ? Infinity : a.due) - (b.due === null ? Infinity : b.due));
    });

    const max = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : queue.length;
    return queue.slice(0, max);
  }

  /* ---------- Hábitos ---------- */

  const pad = (n) => String(n).padStart(2, '0');

  /* Clave de día en hora LOCAL: dos marcas separadas por menos de 24 h pueden
     ser días distintos, y el mismo día UTC no siempre es el mismo día local. */
  function dayKeyOf(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* Aritmética de calendario local (no sumas de 86400000): el día del cambio
     de hora dura 23 o 25 horas y aun así es un solo día. */
  function shiftDays(date, days) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
  }

  function calculateHabits(state, now = Date.now()) {
    const dataRef = state || currentData();
    const testsRef = dataRef.tests || {};
    const days = new Set();
    const stamp = (ts) => { if (typeof ts === 'number' && isFinite(ts)) days.add(dayKeyOf(ts)); };

    (dataRef.activity || []).forEach((a) => stamp(a && a.ts));
    (dataRef.studySessions || []).forEach((s) => stamp(s && s.ts));
    (testsRef.history || []).forEach((h) => stamp(h && h.date));

    const nowDate = new Date(now);
    const todayKey = dayKeyOf(now);
    let cursor = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
    /* Sin actividad todavía hoy la racha sigue viva hasta medianoche. */
    if (!days.has(todayKey)) cursor = shiftDays(cursor, -1);
    let streak = 0;
    while (days.has(dayKeyOf(cursor))) {
      streak += 1;
      cursor = shiftDays(cursor, -1);
    }

    const history = testsRef.history || [];
    /* Cada pregunta respondida es una tarjeta repasada: el motor no guarda la
       fecha de revisión de cada tarjeta, sí el total de cada test. */
    const cardsToday = history
      .filter((h) => h && typeof h.date === 'number' && dayKeyOf(h.date) === todayKey)
      .reduce((n, h) => n + (typeof h.total === 'number' ? h.total : 0), 0);
    const answered = history.reduce((n, h) => n + (typeof h.total === 'number' ? h.total : 0), 0);
    const correct = history.reduce((n, h) => n + (typeof h.correct === 'number' ? h.correct : 0), 0);

    return {
      streak,
      cardsToday,
      accuracy: answered ? Math.round((correct / answered) * 100) : null,
      daysStudied: days.size
    };
  }

  /* ---------- Vista ---------- */

  function statCard(value, label, hint) {
    return `<div class="stat-card">
      <p class="stat-card-value">${esc(value)}</p>
      <p class="stat-card-label">${esc(label)}</p>
      ${hint ? `<p class="stat-card-hint">${esc(hint)}</p>` : ''}
    </div>`;
  }

  function render(root) {
    const modules = calculateModuleMastery();
    const queue = getSmartReviewQueue();
    const pending = getSmartReviewQueue(Infinity);
    const habits = calculateHabits();
    const globalPct = modules.length
      ? Math.round(modules.reduce((n, m) => n + m.pct, 0) / modules.length)
      : 0;

    root.innerHTML = `
      <div class="stat-cards">
        ${statCard(String(habits.streak), habits.streak === 1 ? 'Día de racha' : 'Días de racha', habits.daysStudied ? `${habits.daysStudied} ${habits.daysStudied === 1 ? 'día' : 'días'} con actividad` : 'empieza hoy')}
        ${statCard(String(habits.cardsToday), 'Tarjetas hoy', habits.cardsToday ? 'preguntas respondidas' : 'ninguna todavía')}
        ${statCard(habits.accuracy === null ? '—' : `${habits.accuracy}%`, 'Precisión global', `${pending.length} en cola de repaso`)}
        ${statCard(`${globalPct}%`, 'Maestría media', `${modules.length} módulos`)}
      </div>

      <section class="panel adaptive-launcher" aria-labelledby="dash-review">
        <h3 class="section-label" id="dash-review">${icon('zap', 13)} Repaso inteligente</h3>
        <p class="count-note">${pending.length
          ? `${pending.length} ${pending.length === 1 ? 'pregunta vencida o fallada' : 'preguntas vencidas o falladas'}. La sesión empieza por lo más urgente: primero los repasos vencidos y después las de mayor tasa de fallo.`
          : 'No hay nada vencido ni fallado. Haz un test y el plan se llena solo.'}</p>
        <div class="quiz-actions">
          <button type="button" class="btn btn-primary" id="dash-start"${queue.length ? '' : ' disabled'}>
            Iniciar Repaso Inteligente${queue.length ? ` · ${queue.length}` : ''}
          </button>
        </div>
      </section>

      <section class="panel" aria-labelledby="dash-modules">
        <h3 class="section-label" id="dash-modules">${icon('chart', 13)} Maestría por módulo</h3>
        <ul class="cat-bars">
          ${modules.map((m) => `
            <li class="cat-bar">
              <span class="cat-bar-name">${esc(m.title)}</span>
              <span class="cat-bar-track">
                <div class="pbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${m.pct}" aria-label="Maestría de ${esc(m.title)}">
                  <div class="pbar-fill${m.pct < 50 ? ' pbar-low' : ''}" style="width:${m.pct}%"></div>
                </div>
              </span>
              <span class="cat-bar-value">${m.pct}% · ${m.mastered} dominadas · ${m.pending} pendientes</span>
            </li>`).join('')}
        </ul>
        <p class="count-note">Dominada: nivel máximo del SRS (5) sin fallos pendientes. El nivel sube al autoevaluar «Lo sabía» tras acertar.</p>
      </section>`;

    const startBtn = root.querySelector('#dash-start');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const queueNow = getSmartReviewQueue();
        if (!queueNow.length) return;
        if (window.SMR_TESTS && typeof window.SMR_TESTS.startSession === 'function') {
          window.SMR_TESTS.startSession(queueNow, root);
        }
      });
    }
  }

  return {
    calculateModuleMastery,
    getSmartReviewQueue,
    calculateHabits,
    render
  };
})();

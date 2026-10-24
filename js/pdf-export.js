'use strict';

/* SMR Hub — Exportación de exámenes y fichas de estudio
   -----------------------------------------------------------------
   Sin librerías ni dependencias: el «PDF» es el diálogo de impresión del
   navegador (window.print) sobre un contenedor solo-impresión
   (#exam-print-view) con hoja A4 definida en css/print.css.

   Banco de preguntas: el mismo que usan los tests, SMR_DATA.tests[].questions[]
   ya normalizado por js/questions.js (q, options, correct, topic, explain).

   API:
     SMR.pdfExport.configureExam(options)  → datos del examen (filtra el banco)
     SMR.pdfExport.renderExamDOM(exam)     → pinta #exam-print-view
     SMR.pdfExport.exportToPDF(exam?)      → renderiza y abre window.print()
     SMR.pdfExport.render(root)            → vista de configuración (/exportar)

   Sin red, sin localStorage y sin tocar el progreso del estudiante. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  const PRINT_ID = 'exam-print-view';
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const MAX_COUNT = 100;

  SMR.esc = SMR.esc || ((value) =>
    String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch])));

  const esc = (value) => SMR.esc(value);

  /* Último examen generado: permite reimprimir sin volver a configurar. */
  let lastExam = null;

  function bank() {
    const data = global.SMR_DATA;
    return data && Array.isArray(data.tests) ? data.tests : [];
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  function testsWithQuestions() {
    return bank().filter((test) => Array.isArray(test.questions) && test.questions.length);
  }

  function topicsFor(testId) {
    const topics = [];
    testsWithQuestions().forEach((test) => {
      if (testId && testId !== 'all' && test.id !== testId) return;
      (test.questions || []).forEach((q) => {
        if (q.topic && topics.indexOf(q.topic) === -1) topics.push(q.topic);
      });
    });
    return topics.sort((a, b) => a.localeCompare(b, 'es'));
  }

  /* ---------------------------------------------------------------
     configureExam: filtra por módulo (test) y tema, y recorta a la
     cantidad pedida. Devuelve TODO lo que necesita el renderizador,
     para que el examen se pueda reimprimir sin volver a consultar el banco.
     --------------------------------------------------------------- */

  function configureExam(options) {
    const opts = options || {};
    const testId = opts.testId || 'all';
    const topic = opts.topic || 'all';
    const pool = [];

    testsWithQuestions().forEach((test) => {
      if (testId !== 'all' && test.id !== testId) return;
      test.questions.forEach((question, index) => {
        if (topic !== 'all' && question.topic !== topic) return;
        pool.push(Object.assign({}, question, {
          testId: test.id,
          testTitle: test.title,
          category: test.category || '',
          index: index
        }));
      });
    });

    /* Sin cantidad válida, 20; si la piden, se respeta dentro de [1, 100]. */
    const requested = Number(opts.count);
    const valid = opts.count !== undefined && opts.count !== '' && Number.isFinite(requested);
    const wanted = valid ? Math.max(1, Math.min(Math.floor(requested), MAX_COUNT)) : 20;
    const questions = shuffle(pool.slice()).slice(0, Math.min(wanted, pool.length));
    /* Agrupadas por test: el examen impreso se lee mejor que mezclado. */
    questions.sort((a, b) => a.testTitle.localeCompare(b.testTitle, 'es') || a.index - b.index);

    const scope = testId === 'all'
      ? 'SMR'
      : ((bank().find((test) => test.id === testId) || {}).title || 'SMR');

    return {
      title: String(opts.title || '').trim() || 'Examen de ' + scope,
      student: String(opts.student || '').trim(),
      date: opts.date instanceof Date ? opts.date : new Date(),
      moduleLabel: scope,
      topicLabel: topic === 'all' ? 'Todos los temas' : topic,
      includeSolutions: !!opts.includeSolutions,
      available: pool.length,
      questions: questions
    };
  }

  /* ---------------------------------------------------------------
     renderExamDOM: marcado del examen. Todo con clases propias para que
     css/print.css mande en papel y no herede la tipografía de la SPA.
     --------------------------------------------------------------- */

  function solutionsHtml(questions) {
    return `
      <section class="exam-solutions">
        <h2>Hoja de soluciones</h2>
        <table>
          <thead><tr><th>#</th><th>Respuesta</th><th>Justificación</th></tr></thead>
          <tbody>
            ${questions.map((q, i) => `<tr>
              <td>${i + 1}</td>
              <td class="exam-key">${LETTERS[q.correct] || '?'}</td>
              <td>${esc(q.explain || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </section>`;
  }

  function renderExamDOM(exam) {
    const data = exam || lastExam;
    if (!data) return null;
    lastExam = data;

    let host = document.getElementById(PRINT_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = PRINT_ID;
      document.body.appendChild(host);
    }

    const date = data.date instanceof Date ? data.date : new Date(data.date || Date.now());
    host.innerHTML = `
      <div class="exam-head">
        <div class="exam-head-text">
          <p class="exam-brand">SMR Hub · Sistemas Microinformáticos y Redes</p>
          <h1 class="exam-title">${esc(data.title)}</h1>
          <p class="exam-meta">${esc(data.moduleLabel)} · ${esc(data.topicLabel)} · ${data.questions.length} preguntas</p>
        </div>
        <div class="exam-score"><span>Nota</span><b></b></div>
      </div>

      <dl class="exam-candidate">
        <div><dt>Alumno/a</dt><dd>${esc(data.student) || '&nbsp;'}</dd></div>
        <div><dt>Fecha</dt><dd>${date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}</dd></div>
        <div><dt>Módulo</dt><dd>${esc(data.moduleLabel)}</dd></div>
      </dl>

      <ol class="exam-questions">
        ${data.questions.map((q, i) => `
          <li class="question-block">
            <p class="exam-q"><span class="exam-num">${i + 1}.</span> ${esc(q.q)}</p>
            <ul class="exam-options">
              ${(q.options || []).map((option, j) => `
                <li><span class="exam-box" aria-hidden="true"></span>` +
                  `<span class="exam-letter">${LETTERS[j] || '?'}</span>${esc(option)}</li>`).join('')}
            </ul>
          </li>`).join('')}
      </ol>

      ${data.includeSolutions ? solutionsHtml(data.questions) : ''}`;

    return host;
  }

  /* --------------------------------------------------------------- */

  function readForm() {
    const value = (id) => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    const solutions = document.getElementById('exam-solutions');
    return {
      testId: value('exam-module') || 'all',
      topic: value('exam-topic') || 'all',
      count: value('exam-count') || 20,
      student: value('exam-student'),
      includeSolutions: !!(solutions && solutions.checked)
    };
  }

  function exportToPDF(exam) {
    const data = exam || lastExam || configureExam(readForm());
    renderExamDOM(data);
    /* El diálogo se abre cuando el navegador ya ha pintado el examen. */
    if (typeof global.requestAnimationFrame === 'function') {
      global.requestAnimationFrame(() => global.print());
    } else {
      global.print();
    }
    return data;
  }

  /* ---------------------------------------------------------------
     Vista de configuración (ruta /exportar).
     --------------------------------------------------------------- */

  function render(root) {
    const tests = testsWithQuestions();
    const total = tests.reduce((sum, test) => sum + test.questions.length, 0);

    root.innerHTML = `
      <section class="settings-group" aria-labelledby="exam-config-title">
        <h3 class="section-label" id="exam-config-title">Generar examen</h3>
        <p class="count-note">Elige el módulo y el tema y genera un documento A4 listo para imprimir
          o guardar como PDF. El banco tiene ${total} preguntas en ${tests.length} módulos.</p>
        <form id="exam-form" class="test-options exam-config" novalidate>
          <label class="test-opt"><span class="test-opt-label">Módulo</span>
            <select class="input" id="exam-module" aria-label="Módulo">
              <option value="all">Todos los módulos</option>
              ${tests.map((test) => `<option value="${esc(test.id)}">${esc(test.title)}</option>`).join('')}
            </select></label>
          <label class="test-opt"><span class="test-opt-label">Tema</span>
            <select class="input" id="exam-topic" aria-label="Tema">
              <option value="all">Todos los temas</option>
            </select></label>
          <label class="test-opt"><span class="test-opt-label">Preguntas</span>
            <input class="input" id="exam-count" type="number" min="1" max="${MAX_COUNT}" step="1" value="20" aria-label="Número de preguntas"></label>
        </form>
        <form id="exam-meta" class="test-options exam-config" novalidate>
          <label class="test-opt"><span class="test-opt-label">Alumno/a</span>
            <input class="input" id="exam-student" type="text" maxlength="80" autocomplete="name" aria-label="Nombre del alumno"></label>
          <label class="test-opt check"><input type="checkbox" id="exam-solutions" checked> Incluir hoja de soluciones</label>
        </form>
        <div class="quiz-actions">
          <button type="submit" class="btn btn-primary" id="exam-generate" form="exam-form">Generar PDF</button>
          <p class="count-note" id="exam-status" role="status" aria-live="polite"></p>
        </div>
      </section>`;

    const moduleSel = root.querySelector('#exam-module');
    const topicSel = root.querySelector('#exam-topic');
    const countInput = root.querySelector('#exam-count');
    const status = root.querySelector('#exam-status');

    function refreshTopics() {
      const keep = topicSel.value;
      const topics = topicsFor(moduleSel.value);
      topicSel.innerHTML = '<option value="all">Todos los temas</option>' +
        topics.map((topic) => `<option value="${esc(topic)}">${esc(topic)}</option>`).join('');
      if (topics.indexOf(keep) !== -1) topicSel.value = keep;
    }

    function refreshStatus() {
      const exam = configureExam({
        testId: moduleSel.value,
        topic: topicSel.value,
        count: countInput.value
      });
      const asked = Math.max(1, Number(countInput.value) || 1);
      status.textContent = exam.available === 0
        ? 'No hay preguntas con esos filtros.'
        : `${exam.available} preguntas disponibles · se generarán ${Math.min(asked, exam.available)}.`;
    }

    moduleSel.addEventListener('change', () => { refreshTopics(); refreshStatus(); });
    topicSel.addEventListener('change', refreshStatus);
    countInput.addEventListener('input', refreshStatus);

    root.querySelector('#exam-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const exam = exportToPDF();
      if (!exam.questions.length) status.textContent = 'No hay preguntas con esos filtros.';
    });

    refreshTopics();
    refreshStatus();
  }

  SMR.pdfExport = {
    configureExam: configureExam,
    renderExamDOM: renderExamDOM,
    exportToPDF: exportToPDF,
    render: render
  };
})(typeof window !== 'undefined' ? window : globalThis);

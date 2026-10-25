'use strict';

/* =====================================================================
   SMR Hub — Exportación de exámenes a PDF (js/pdf-export.js).

   QUÉ ES: carga el módulo REAL en un sandbox con un documento falso y
   comprueba el contrato de configureExam / renderExamDOM / exportToPDF,
   más el cableado de la ruta /exportar en index.html y js/app.js y las
   reglas de papel de css/print.css. Nada de reimplementar la lógica.

   QUÉ NO ES: no abre el diálogo de impresión ni genera un PDF de verdad
   (eso depende del navegador); aquí print() es un contador.

   Ejecutar desde la raíz:  node tests/pdf-export.test.js
   ===================================================================== */

const fs = require('fs');
const vm = require('vm');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function check(name, fn) {
  try { fn(); record(name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ' → ' + e.message); if (process.env.TRACE === '1') console.error(e.stack); }
}

const APP = fs.readFileSync('js/app.js', 'utf8');
const HTML = fs.readFileSync('index.html', 'utf8');
const PRINT_CSS = fs.readFileSync('css/print.css', 'utf8');
const MODULE = fs.readFileSync('js/pdf-export.js', 'utf8');

/* Documento falso: solo lo que toca el módulo (id, creación y body). */
function fakeDocument() {
  const byId = {};
  return {
    body: {
      children: [],
      appendChild(el) { this.children.push(el); if (el.id) byId[el.id] = el; }
    },
    getElementById(id) { return byId[id] || null; },
    createElement(tag) { return { tagName: tag, id: '', innerHTML: '' }; }
  };
}

/* Banco sintético + copia del real para los filtros de verdad. */
function realBank() {
  const ctx = { console, SMR_DATA: null };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('js/data.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('js/questions.js', 'utf8'), ctx);
  return ctx.SMR_DATA.tests;
}

const BANK = realBank();

function load(options) {
  const opts = options || {};
  const ctx = {
    console,
    document: opts.document || fakeDocument(),
    SMR_DATA: { tests: opts.bank || BANK },
    printCalls: 0
  };
  ctx.window = ctx;
  ctx.print = () => { ctx.printCalls++; };
  vm.createContext(ctx);
  vm.runInContext(MODULE, ctx);
  return ctx;
}

/* Preguntas reales del banco, para no inventar ids ni temas. */
const REAL_TEST = BANK.find((t) => Array.isArray(t.questions) && t.questions.length);
const REAL_TOPIC = REAL_TEST.questions.find((q) => q.topic).topic;
const BANK_SIZE = BANK.reduce((n, t) => n + ((t.questions || []).length), 0);

console.log('\nconfigureExam');

check('sin opciones: 20 preguntas por defecto', () => {
  const { SMR } = load();
  const exam = SMR.pdfExport.configureExam();
  assert(exam.questions.length === 20, 'esperaba 20, hay ' + exam.questions.length);
  assert(exam.available === BANK_SIZE, 'disponibles ' + exam.available + ' de ' + BANK_SIZE);
});

check('filtra por módulo (testId) y solo trae sus preguntas', () => {
  const { SMR } = load();
  const exam = SMR.pdfExport.configureExam({ testId: REAL_TEST.id, count: 100 });
  assert(exam.questions.length === REAL_TEST.questions.length, 'cantidad ' + exam.questions.length);
  assert(exam.questions.every((q) => q.testId === REAL_TEST.id), 'se coló otro módulo');
  assert(exam.moduleLabel === REAL_TEST.title, 'etiqueta de módulo: ' + exam.moduleLabel);
});

check('filtra por tema dentro del módulo', () => {
  const { SMR } = load();
  const exam = SMR.pdfExport.configureExam({ testId: REAL_TEST.id, topic: REAL_TOPIC, count: 100 });
  assert(exam.questions.length > 0, 'sin preguntas para el tema ' + REAL_TOPIC);
  assert(exam.questions.every((q) => q.topic === REAL_TOPIC), 'tema mezclado');
  assert(exam.topicLabel === REAL_TOPIC, 'etiqueta de tema');
});

check('recorta la cantidad y no repite preguntas', () => {
  const { SMR } = load();
  const exam = SMR.pdfExport.configureExam({ count: 7 });
  const ids = new Set(exam.questions.map((q) => q.testId + '#' + q.index));
  assert(exam.questions.length === 7, 'cantidad ' + exam.questions.length);
  assert(ids.size === 7, 'preguntas duplicadas');
});

check('count 0 → 1 y count 500 → tope del banco (máx. 100)', () => {
  const { SMR } = load();
  assert(SMR.pdfExport.configureExam({ count: 0 }).questions.length === 1, 'count 0');
  assert(SMR.pdfExport.configureExam({ count: 500 }).questions.length === Math.min(100, BANK_SIZE), 'count 500');
  assert(SMR.pdfExport.configureExam({ count: 'abc' }).questions.length === 20, 'count inválido');
});

check('filtros sin resultados: examen vacío, no una excepción', () => {
  const { SMR } = load();
  const exam = SMR.pdfExport.configureExam({ testId: 'no-existe' });
  assert(exam.questions.length === 0 && exam.available === 0, 'debería estar vacío');
});

check('propaga alumno, título y hoja de soluciones', () => {
  const { SMR } = load();
  const exam = SMR.pdfExport.configureExam({
    student: '  Ana  ', title: 'Recuperación', includeSolutions: true, count: 3
  });
  assert(exam.student === 'Ana', 'alumno: "' + exam.student + '"');
  assert(exam.title === 'Recuperación', 'título: ' + exam.title);
  assert(exam.includeSolutions === true, 'soluciones');
  assert(Object.prototype.toString.call(exam.date) === '[object Date]', 'fecha');
});

console.log('\nrenderExamDOM');

function syntheticExam(extra) {
  return Object.assign({
    title: 'Examen de prueba',
    student: 'Ana',
    date: new Date('2026-01-02'),
    moduleLabel: 'Redes',
    topicLabel: 'Subnetting',
    includeSolutions: false,
    available: 2,
    questions: [
      { q: '¿Qué máscara corresponde a /26?', options: ['/26', '255.255.255.192', '192.168.0.0', 'Ninguna'], correct: 1, explain: '27 bits de red.' },
      { q: '¿Cuántos hosts útiles hay en /30?', options: ['2', '4', '6', '0'], correct: 0, explain: '2^2 - 2 = 2.' }
    ]
  }, extra || {});
}

check('crea #exam-print-view una sola vez y la reutiliza', () => {
  const { SMR, document: doc } = load();
  const a = SMR.pdfExport.renderExamDOM(syntheticExam());
  const b = SMR.pdfExport.renderExamDOM(syntheticExam());
  assert(a === b, 'contenedores distintos');
  assert(doc.body.children.length === 1, 'contenedores: ' + doc.body.children.length);
  assert(a.id === 'exam-print-view', 'id ' + a.id);
});

check('cabecera: título, alumno, fecha, módulo y cuadro de nota', () => {
  const { SMR } = load();
  const html = SMR.pdfExport.renderExamDOM(syntheticExam()).innerHTML;
  assert(html.includes('Examen de prueba'), 'título');
  assert(html.includes('Ana'), 'alumno');
  assert(html.includes('02/01/2026'), 'fecha es-ES: falta 02/01/2026');
  assert(html.includes('Redes'), 'módulo');
  assert(/class="exam-score"/.test(html), 'cuadro de nota');
});

check('cuerpo: numeradas, opciones A-D y casilla CSS por opción', () => {
  const { SMR } = load();
  const html = SMR.pdfExport.renderExamDOM(syntheticExam()).innerHTML;
  const blocks = html.match(/class="question-block"/g) || [];
  const boxes = html.match(/class="exam-box"/g) || [];
  assert(blocks.length === 2, 'bloques ' + blocks.length);
  assert(boxes.length === 8, 'casillas ' + boxes.length);
  ['>A<', '>B<', '>C<', '>D<'].forEach((l) => assert(html.includes(l), 'falta la letra ' + l));
});

check('sin hoja de soluciones cuando includeSolutions es false', () => {
  const { SMR } = load();
  const html = SMR.pdfExport.renderExamDOM(syntheticExam()).innerHTML;
  assert(!html.includes('exam-solutions'), 'apareció la hoja de soluciones');
});

check('con soluciones: una fila por pregunta con la letra correcta', () => {
  const { SMR } = load();
  const html = SMR.pdfExport.renderExamDOM(syntheticExam({ includeSolutions: true })).innerHTML;
  const rows = html.split('<tbody>')[1].split('</tbody>')[0].match(/<tr>/g) || [];
  assert(html.includes('exam-solutions'), 'falta la sección');
  assert(rows.length === 2, 'filas ' + rows.length);
  assert(html.includes('>B</td>') && html.includes('>A</td>'), 'letras de respuesta');
  assert(html.includes('27 bits de red.'), 'justificación');
});

check('escapa el contenido del banco (sin inyección de marcado)', () => {
  const { SMR } = load();
  const html = SMR.pdfExport.renderExamDOM(syntheticExam({
    includeSolutions: true,
    questions: [{ q: '<img src=x onerror=alert(1)>', options: ['a', 'b', 'c', 'd'], correct: 0, explain: '<script>bad()</script>' }]
  })).innerHTML;
  assert(!html.includes('<img'), 'quedó un <img>');
  assert(!html.includes('<script>'), 'quedó un <script>');
  assert(html.includes('&lt;img'), 'no se escapó el enunciado');
});

check('renderExamDOM sin examen previo devuelve null', () => {
  const { SMR } = load();
  assert(SMR.pdfExport.renderExamDOM() === null, 'debería ser null');
});

console.log('\nexportToPDF');

check('exportToPDF: renderiza y llama a print una vez', () => {
  const ctx = load();
  ctx.SMR.pdfExport.exportToPDF(syntheticExam());
  const html = ctx.document.getElementById('exam-print-view').innerHTML;
  assert(html.includes('Examen de prueba'), 'no se renderizó');
  assert(ctx.printCalls === 1, 'print llamado ' + ctx.printCalls + ' veces');
});

check('exportToPDF sin argumentos usa el formulario y reimprime', () => {
  const ctx = load();
  const exam = ctx.SMR.pdfExport.exportToPDF();
  assert(exam.questions.length === 20, 'sin formulario debería generar 20');
  assert(ctx.printCalls === 1, 'print');
  ctx.SMR.pdfExport.exportToPDF();
  assert(ctx.printCalls === 2, 'el segundo print no ocurrió');
});

console.log('\nvista /exportar');

check('la vista pinta los controles y engancha el formulario', () => {
  const ctx = load();
  /* Los campos que lee readForm: basta con que existan al consultarlos. */
  const nodes = {};
  const root = {
    innerHTML: '',
    querySelector(sel) {
      if (sel === '#exam-form') return { addEventListener: (ev, fn) => { nodes.submit = fn; } };
      const id = sel.replace('#', '');
      if (!nodes[id]) nodes[id] = { value: '', addEventListener: () => {}, innerHTML: '' };
      return nodes[id];
    }
  };
  ctx.SMR.pdfExport.render(root);
  assert(root.innerHTML.includes('id="exam-module"'), 'sin selector de módulo');
  assert(root.innerHTML.includes('id="exam-form"'), 'sin formulario');
  assert(root.innerHTML.includes('id="exam-generate"'), 'sin botón');
  assert(root.innerHTML.includes('Incluir hoja de soluciones'), 'sin opción de soluciones');
  assert(typeof nodes.submit === 'function', 'submit sin listener');
  assert(root.innerHTML.includes(REAL_TEST.title), 'sin opciones de módulo');
  assert(String(nodes['exam-status'].textContent).length > 0, 'sin estado disponible');
});

console.log('\ncableado');

check('index.html carga el módulo y la hoja de impresión', () => {
  assert(/<script src="js\/pdf-export\.js" defer><\/script>/.test(HTML), 'falta el script');
  assert(/<link rel="stylesheet" href="css\/print\.css">/.test(HTML), 'falta el stylesheet');
});

check('app.js registra la ruta exportar y la navegación', () => {
  assert(/\n  exportar: \{/.test(APP), 'falta ROUTES.exportar');
  assert(/SMR\.pdfExport\.render\(root\)/.test(APP), 'la ruta no llama al módulo');
  /* Orden independiente: el grupo Estudio ha ido creciendo (dashboard). */
  assert(/items: \[[^\]]*'exportar'/.test(APP), 'falta en NAV_GROUPS');
});

check('app.js retira el examen al cambiar de vista', () => {
  /* Si se quedara en el DOM, un Ctrl+P en otra vista imprimiría el examen
     anterior con toda la SPA oculta. */
  assert(/const printView = document\.getElementById\('exam-print-view'\);\s*if \(printView\) printView\.remove\(\);/.test(APP), 'no se retira');
});

check('print.css: oculta la SPA, A4 y evita cortes', () => {
  assert(/#exam-print-view \{ display: none; \}/.test(PRINT_CSS), 'visible en pantalla');
  assert(/@media print/.test(PRINT_CSS), 'sin @media print');
  assert(/@page[\s\S]*?size: A4 portrait/.test(PRINT_CSS), 'sin hoja A4');
  assert(/\bnav,\s*header,\s*footer,\s*\.no-print\b/.test(PRINT_CSS), 'no oculta nav/header/footer');
  assert(/\.question-block \{[\s\S]*?page-break-inside: avoid;[\s\S]*?break-inside: avoid;/.test(PRINT_CSS), 'sin evitar cortes');
  assert(/#exam-print-view \{ display: block !important; \}/.test(PRINT_CSS), 'no se muestra al imprimir');
});

console.log(failed ? '\n' + failed + ' FALLOS' : '\nOK: ' + passed + ' pruebas');
process.exit(failed ? 1 : 0);

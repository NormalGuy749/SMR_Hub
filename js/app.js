'use strict';

/* SMR Hub — aplicación principal
   Dashboard, Modo Estudio, recursos con autoevaluación, glosario con fichas,
   estadísticas y router por hash. Todo en vanilla JS sin dependencias. */

const SMR = (window.SMR = window.SMR || {});
const D = window.SMR_DATA || { categories: [], resources: [], glossary: [], ports: [], tests: [], quickRefs: {} };
const CATEGORIES = D.categories;
const LEVELS = ['Básico', 'Intermedio', 'Avanzado'];

/* ---------- Utilidades ---------- */

const $ = (sel, root = document) => root.querySelector(sel);

SMR.esc = (value) =>
  String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

/* Compara ignorando acentos: 'cache' encuentra 'Caché' */
const fold = (value) => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '');

SMR.matches = (haystack, query) => {
  const raw = String(haystack).toLowerCase();
  const needle = String(query).toLowerCase();
  return raw.includes(needle) || fold(raw).includes(fold(needle));
};

const DEG_LABELS = ['Todavía no', 'Más o menos', 'Sí'];

/* ---------- Almacenamiento local ---------- */

const STORE_PREFIX = 'smrhub:';

SMR.store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(STORE_PREFIX + key); } catch { /* sin almacenamiento */ }
  }
};

/* ---------- Iconos (SVG inline, sin dependencias externas) ---------- */

const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3"/><path d="M12 12V8"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v2"/><path d="M15 2v2"/><path d="M9 20v2"/><path d="M15 20v2"/><path d="M2 9h2"/><path d="M2 15h2"/><path d="M20 9h2"/><path d="M20 15h2"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91-6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
  bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  box: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  calculator: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><line x1="16" x2="16" y1="14" y2="18"/><path d="M16 10h.01"/><path d="M12 10h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  chart: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/><rect x="12" y="8" width="3" height="10" rx="1"/><rect x="17" id="x1" y="5" width="3" height="13" rx="1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  circleCheck: '<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  flame: '<path d="M12 2c1 3 3 4.5 3 7a3 3 0 1 1-6 0c0-1 .5-2 1-2.5C9 8 8 10 8 12a4 4 0 0 0 8 0c0-3-2-5-4-10Z"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  compass: '<circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  keyboard: '<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M6 9h.01"/><path d="M10 9h.01"/><path d="M14 9h.01"/><path d="M18 9h.01"/><path d="M8 13h8"/>',
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  puzzle: '<path d="M19.4 14c.6 0 .9-.7.5-1.1l-.9-.9V8.4c0-.5-.4-.9-.9-.9h-3.6l-.9-.9c-.4-.4-1.1-.1-1.1.5v0c0 1-.8 1.8-1.8 1.8S9 8.1 9 7.1v0c0-.6-.7-.9-1.1-.5l-.9.9H3.4c-.5 0-.9.4-.9.9v3.6l-.9.9c-.4.4-.1 1.1.5 1.1 1 0 1.8.8 1.8 1.8S3.1 17.6 2.1 17.6c-.6 0-.9.7-.5 1.1l.9.9v3.6c0 .5.4.9.9.9h3.6l.9.9c.4.4 1.1.1 1.1-.5 0-1 .8-1.8 1.8-1.8s1.8.8 1.8 1.8c0 .6.7.9 1.1.5l.9-.9h3.6c.5 0 .9-.4.9-.9v-3.6l.9-.9c.4-.4.1-1.1-.5-1.1-1 0-1.8-.8-1.8-1.8s.8-1.8 1.8-1.8Z"/>',
  brain: '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M12 5v13"/>',

  /* Fase 8.2: iconos de autenticación (aditivos, no usados antes). */
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>'
};

SMR.icon = (name, size = 16, filled = false) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ---------- Referencias al DOM ---------- */

const dom = {
  sidebar: $('#sidebar'),
  scrim: $('#scrim'),
  menuBtn: $('#menu-btn'),
  navList: $('#nav-list'),
  navFooter: $('#nav-footer'),
  pageTitle: $('#page-title'),
  pageDesc: $('#page-desc'),
  content: $('#content'),
  searchWrap: $('#search'),
  searchInput: $('#search-input'),
  searchPanel: $('#search-results'),
  searchIcon: $('#search-icon'),
  paletteBtn: $('#palette-btn'),
  themeBtn: $('#theme-btn')
};

/* ---------- Preferencias ---------- */

const SETTINGS_DEFAULTS = { theme: null, textSize: 'md', animations: true };

SMR.settings = Object.assign({}, SETTINGS_DEFAULTS, SMR.store.get('settings', {}));

const mediaDark = window.matchMedia('(prefers-color-scheme: dark)');

function effectiveTheme() {
  if (SMR.settings.theme === 'light' || SMR.settings.theme === 'dark') {
    return SMR.settings.theme;
  }
  return mediaDark.matches ? 'dark' : 'light';
}

function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = effectiveTheme();
  root.dataset.textSize = SMR.settings.textSize || 'md';
  root.dataset.animations = SMR.settings.animations ? 'on' : 'off';
}

function saveSettings() {
  SMR.store.set('settings', SMR.settings);
}

function updateThemeButton() {
  const dark = effectiveTheme() === 'dark';
  dom.themeBtn.innerHTML = SMR.icon(dark ? 'sun' : 'moon');
  dom.themeBtn.title = dark ? 'Modo claro' : 'Modo oscuro';
  dom.themeBtn.setAttribute('aria-label', dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}

SMR.setTheme = (theme) => {
  SMR.settings.theme = theme;
  saveSettings();
  applySettings();
  updateThemeButton();
  if (currentRouteId() === 'configuracion') render();
};

SMR.toggleTheme = () => SMR.setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');

try {
  mediaDark.addEventListener('change', () => {
    if (!SMR.settings.theme) {
      applySettings();
      updateThemeButton();
    }
  });
} catch { /* navegador antiguo */ }

/* ---------- Favoritos ---------- */

SMR.favorites = {
  data: SMR.store.get('favorites', {}),
  has(kind, id) {
    return !!(this.data[kind] && this.data[kind][id]);
  },
  toggle(kind, id) {
    if (!this.data[kind]) this.data[kind] = {};
    if (this.data[kind][id]) delete this.data[kind][id];
    else this.data[kind][id] = true;
    SMR.store.set('favorites', this.data);
    return this.has(kind, id);
  }
};

function updateFavButtons(kind, id, active) {
  document.querySelectorAll(`[data-fav="${kind}:${id}"]`).forEach((btn) => {
    btn.setAttribute('aria-pressed', String(active));
    if (btn.classList.contains('fav-btn')) {
      btn.classList.toggle('active', active);
      btn.innerHTML = SMR.icon('star', 16, active);
      const label = active ? 'Quitar de favoritos' : 'Añadir a favoritos';
      btn.title = label;
      btn.setAttribute('aria-label', label);
    } else if (btn.classList.contains('fav-text')) {
      btn.innerHTML = `${SMR.icon('star', 15, active)}${active ? 'Quitar de favoritos' : 'Añadir a favoritos'}`;
    }
  });
}

function bindFav(container) {
  container.querySelectorAll('[data-fav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [kind, id] = btn.dataset.fav.split(':');
      const active = SMR.favorites.toggle(kind, id);
      updateFavButtons(kind, id, active);
    });
  });
}

/* ---------- Sistema de progreso ----------
   Estructura persistente y tolerante a datos corruptos. Si localStorage no
   está disponible o el contenido no es válido, se parte de cero sin fallar. */

const PROGRESS_KEY = 'progress';
const PROGRESS_VERSION = 4;

/* Niveles de repetición espaciada: días hasta el siguiente repaso.
   La autoevaluación del usuario ajusta el avance (0 baja, 1 repite, 2 sube). */
const SRS_INTERVALS = [1, 1, 3, 7, 14, 30];
const SRS_MAX_LEVEL = SRS_INTERVALS.length - 1;
const ACTIVITY_LIMIT = 40;
const HISTORY_LIMIT = 60;

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

function cleanTimestampMap(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    Object.keys(raw).forEach((key) => {
      const value = raw[key];
      if (typeof value === 'number' && isFinite(value) && value > 0) out[key] = value;
      else if (value === true) out[key] = Date.now();
    });
  }
  return out;
}

function cleanNumberMap(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    Object.keys(raw).forEach((key) => {
      const value = raw[key];
      if (typeof value === 'number' && isFinite(value)) out[key] = value;
    });
  }
  return out;
}

/* Autoevaluación "¿Qué has aprendido?": 0 = Todavía no, 1 = Más o menos, 2 = Sí */
function cleanDegreeMap(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    Object.keys(raw).forEach((key) => {
      const value = raw[key];
      if (value === 0 || value === 1 || value === 2) out[key] = value;
    });
  }
  return out;
}

function defaultProgress() {
  return {
    v: PROGRESS_VERSION,
    resources: { viewed: {}, completed: {}, selfAssessment: {} },
    tests: { best: {}, last: {}, history: [], wrong: {}, srs: {}, srsLegacy: {} },
    cases: { solved: {} },
    studySessions: [],
    studyMinutes: 0,
    activity: [],
    streak: { lastDay: null, count: 0 }
  };
}

function sanitizeProgress(raw) {
  const base = defaultProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  /* Fase 6C.5: conservar la versión almacenada (si es válida) para que la
     migración del SRS posicional sepa si debe ejecutarse. Una versión
     ausente o inválida se trata como 3: la migración es idempotente. */
  if (typeof raw.v === 'number' && isFinite(raw.v) && raw.v >= 1 && raw.v < PROGRESS_VERSION) {
    base.v = raw.v;
  } else if (raw.v !== PROGRESS_VERSION) {
    base.v = 3;
  }

  const res = raw.resources;
  if (res && typeof res === 'object') {
    base.resources.viewed = cleanTimestampMap(res.viewed);
    base.resources.completed = cleanTimestampMap(res.completed);
    base.resources.selfAssessment = cleanDegreeMap(res.selfAssessment);
  }

  const tests = raw.tests;
  if (tests && typeof tests === 'object') {
    base.tests.best = cleanNumberMap(tests.best);
    base.tests.last = cleanNumberMap(tests.last);
    if (Array.isArray(tests.history)) {
      base.tests.history = tests.history
        .filter((h) => h && typeof h === 'object' && typeof h.testId === 'string' && typeof h.pct === 'number' && isFinite(h.pct))
        .slice(-HISTORY_LIMIT);
    }
    if (tests.wrong && typeof tests.wrong === 'object' && !Array.isArray(tests.wrong)) {
      Object.keys(tests.wrong).forEach((testId) => {
        base.tests.wrong[testId] = cleanNumberMap(tests.wrong[testId]);
      });
    }
    /* SRS: { "testId:qIndex": { level, due } } con validación estricta */
    if (tests.srs && typeof tests.srs === 'object' && !Array.isArray(tests.srs)) {
      Object.keys(tests.srs).forEach((key) => {
        const item = tests.srs[key];
        if (item && typeof item === 'object' && typeof item.level === 'number' && item.level >= 0 && item.level <= SRS_MAX_LEVEL && typeof item.due === 'number' && isFinite(item.due)) {
          base.tests.srs[key] = { level: Math.floor(item.level), due: item.due };
        }
      });
    }
    /* srsLegacy (fase 6C.5): entradas SRS antiguas no resolubles en la
       migración. Se conservan intactas: nunca se descarta un dato. */
    if (tests.srsLegacy && typeof tests.srsLegacy === 'object' && !Array.isArray(tests.srsLegacy)) {
      Object.keys(tests.srsLegacy).forEach((key) => {
        const item = tests.srsLegacy[key];
        if (item && typeof item === 'object' && typeof item.level === 'number' && item.level >= 0 && item.level <= SRS_MAX_LEVEL && typeof item.due === 'number' && isFinite(item.due)) {
          base.tests.srsLegacy[key] = { level: Math.floor(item.level), due: item.due };
        }
      });
    }
  }

  /* Casos prácticos resueltos: { caseId: { option, ts } } */
  if (raw.cases && typeof raw.cases === 'object' && typeof raw.cases.solved === 'object' && !Array.isArray(raw.cases.solved)) {
    Object.keys(raw.cases.solved).forEach((cid) => {
      const s = raw.cases.solved[cid];
      if (s && typeof s === 'object' && typeof s.option === 'string') {
        base.cases.solved[cid] = { option: s.option.slice(0, 4), ts: typeof s.ts === 'number' ? s.ts : Date.now() };
      }
    });
  }

  /* Historial de sesiones de estudio: { ts, minutes, steps } */
  if (Array.isArray(raw.studySessions)) {
    base.studySessions = raw.studySessions
      .filter((s) => s && typeof s === 'object' && isFinite(s.ts))
      .slice(-20)
      .map((s) => ({ ts: s.ts, minutes: Number(s.minutes) || 0, steps: Number(s.steps) || 0 }));
  }
  base.studyMinutes = typeof raw.studyMinutes === 'number' && isFinite(raw.studyMinutes) && raw.studyMinutes >= 0
    ? Math.round(raw.studyMinutes)
    : base.studySessions.reduce((n, s) => n + (s.minutes || 0), 0);

  if (Array.isArray(raw.activity)) {
    base.activity = raw.activity
      .filter((a) => a && typeof a === 'object' && typeof a.label === 'string')
      .slice(-ACTIVITY_LIMIT);
  }

  const streak = raw.streak;
  if (streak && typeof streak === 'object' && typeof streak.count === 'number' && isFinite(streak.count) && streak.count >= 0) {
    base.streak.count = Math.floor(streak.count);
    base.streak.lastDay = typeof streak.lastDay === 'string' ? streak.lastDay : null;
  }

  return base;
}

SMR.progress = {
  data: sanitizeProgress(SMR.store.get(PROGRESS_KEY, null)),

  save() { SMR.store.set(PROGRESS_KEY, this.data); },

  /* --- Recursos --- */

  isCompleted(id) { return Object.prototype.hasOwnProperty.call(this.data.resources.completed, id); },

  completedCount() { return Object.keys(this.data.resources.completed).length; },

  markViewed(id) {
    if (!id) return;
    this.data.resources.viewed[id] = Date.now();
    this.save();
  },

  toggleCompleted(id) {
    if (!id) return false;
    const done = this.isCompleted(id);
    if (done) {
      delete this.data.resources.completed[id];
      this.logActivity('recurso', 'Recurso marcado como pendiente', resourceLabel(id));
    } else {
      this.data.resources.completed[id] = Date.now();
      this.logActivity('recurso', 'Recurso completado', resourceLabel(id));
    }
    this.save();
    return !done;
  },

  /* --- Autoevaluación "¿Qué has aprendido?" --- */

  setSelfAssessment(id, degree) {
    if (!id || ![0, 1, 2].includes(degree)) return;
    this.data.resources.selfAssessment[id] = degree;
    const names = ['marcado como «todavía no»', 'marcado como «más o menos»', 'marcado como aprendido'];
    this.logActivity('recurso', `Recurso ${names[degree]}`, resourceLabel(id));
    this.save();
  },

  selfAssessment(id) {
    const v = this.data.resources.selfAssessment[id];
    return [0, 1, 2].includes(v) ? v : null;
  },

  /* --- Actividad y racha --- */

  logActivity(type, label, meta = '') {
    this.data.activity.push({ type, label, meta, ts: Date.now() });
    if (this.data.activity.length > ACTIVITY_LIMIT) {
      this.data.activity = this.data.activity.slice(-ACTIVITY_LIMIT);
    }
    this.touchStreak();
    this.save();
  },

  touchStreak() {
    const today = dayKey();
    const streak = this.data.streak;
    if (streak.lastDay === today) return;
    streak.count = streak.lastDay === yesterdayKey() ? streak.count + 1 : 1;
    streak.lastDay = today;
  },

  recentActivity(limit = 5) {
    return this.data.activity.slice(-limit).reverse();
  },

  /* --- Tests --- */

  bestScoreFor(testId) {
    const pct = this.data.tests.best[testId];
    return typeof pct === 'number' ? pct : null;
  },

  recordTest({ testId, title, correct, total, answers = [], mode = 'practica' }) {
    const pct = total ? Math.round((correct / total) * 100) : 0;
    const tests = this.data.tests;
    /* Solo los modos completos afectan a la mejor puntuación */
    const affectsBest = mode === 'practica' || mode === 'completo' || mode === 'examen';
    if (affectsBest && (typeof tests.best[testId] !== 'number' || pct > tests.best[testId])) tests.best[testId] = pct;
    tests.last[testId] = pct;
    tests.history.push({ testId, title, correct, total, pct, mode, date: Date.now() });
    if (tests.history.length > HISTORY_LIMIT) tests.history = tests.history.slice(-HISTORY_LIMIT);

    /* Fase 6C.5: la clave de pregunta es su ID estable; si la pregunta no
       está en el registro se conserva la clave posicional tal cual. */
    if (!tests.wrong[testId]) tests.wrong[testId] = {};
    answers.forEach((a) => {
      const key = (window.SMR.srs && SMR.srs.idOf(testId, a.origIndex)) || a.origIndex;
      if (a.ok) delete tests.wrong[testId][key];
      else tests.wrong[testId][key] = (tests.wrong[testId][key] || 0) + 1;
    });

    this.logActivity('test', `Test completado: ${title}`, `${pct}% · ${correct}/${total}`);
    return pct;
  },

  wrongRefs() {
    const refs = [];
    const srsMod = window.SMR && window.SMR.srs;
    Object.keys(this.data.tests.wrong).forEach((testId) => {
      const bucket = this.data.tests.wrong[testId] || {};
      Object.keys(bucket).forEach((key) => {
        /* Fase 6C.5: claves con ID estable se resuelven a su posición
           de origen; claves numéricas antiguas siguen siendo posicionales. */
        const ref = srsMod && !srsMod.isLegacyKey(key) ? srsMod.resolveSrsKey(key) : null;
        if (ref) refs.push({ testId: ref.testId, qIndex: ref.qIndex, count: bucket[key] });
        else if (/^\d+$/.test(key)) refs.push({ testId, qIndex: Number(key), count: bucket[key] });
        else refs.push({ testId, qIndex: null, count: bucket[key] });
      });
    });
    return refs.sort((a, b) => b.count - a.count);
  },

  wrongCount() { return this.wrongRefs().length; },

  /* --- Repetición espaciada (SRS) ---
     Clave "testId:qIndex" → { level, due }.
     La autoevaluación tras responder ajusta el nivel:
     0 (No lo sabía) baja, 1 (Dudé) repite nivel, 2 (Lo sabía) sube. */

  scheduleSrs(testId, qIndex, selfRate) {
    /* Fase 6C.5: se guarda bajo el ID estable de la pregunta, no bajo su
       posición. Sin registro disponible (srs.js no cargado), fallback
       posicional para no perder la autoevaluación. */
    const key = (window.SMR.srs && SMR.srs.idOf(testId, qIndex)) || `${testId}:${qIndex}`;
    const srs = this.data.tests.srs;
    const current = srs[key] && typeof srs[key].level === 'number' ? srs[key].level : 0;
    let level = current;
    if (selfRate === 2) level = Math.min(SRS_MAX_LEVEL, current + 1);
    else if (selfRate === 1) level = current;
    else level = Math.max(0, current - 1);
    const days = SRS_INTERVALS[level] || 1;
    srs[key] = { level, due: Date.now() + days * 86400000 };
    this.save();
  },

  dropSrs(testId, qIndex) {
    const srsMod = window.SMR && window.SMR.srs;
    const key = srsMod && srsMod.idOf(testId, qIndex);
    if (key) delete this.data.tests.srs[key];
    delete this.data.tests.srs[`${testId}:${qIndex}`]; /* compatibilidad con datos antiguos */
    this.save();
  },

  dueSrs() {
    const now = Date.now();
    return Object.keys(this.data.tests.srs)
      .filter((key) => this.data.tests.srs[key].due <= now)
      .map((key) => {
        /* Fase 6C.5: clave estable (ID de pregunta) o antigua (testId:qIndex). */
        const srsMod = window.SMR && window.SMR.srs;
        const ref = srsMod && srsMod.resolveSrsKey(key);
        if (ref) return { key, testId: ref.testId, qIndex: ref.qIndex, level: this.data.tests.srs[key].level, due: this.data.tests.srs[key].due };
        const [testId, qIndex] = key.split(':');
        return { key, testId, qIndex: Number(qIndex), level: this.data.tests.srs[key].level, due: this.data.tests.srs[key].due };
      })
      .sort((a, b) => a.due - b.due);
  },

  dueCount() { return this.dueSrs().length; },

  upcomingSrsCount() {
    return Object.keys(this.data.tests.srs).length - this.dueCount();
  },

  /* --- Casos prácticos --- */

  solveCase(caseId, option) {
    if (!caseId || typeof option !== 'string') return;
    this.data.cases.solved[caseId] = { option: option.slice(0, 4), ts: Date.now() };
    this.logActivity('caso', 'Caso práctico resuelto', resourceLabel ? String(caseId) : caseId);
    this.save();
  },

  caseSolved(caseId) {
    return Object.prototype.hasOwnProperty.call(this.data.cases.solved, caseId);
  },

  /* --- Sesiones de estudio --- */

  recordStudySession(minutes, steps) {
    this.data.studySessions.push({ ts: Date.now(), minutes, steps });
    if (this.data.studySessions.length > 20) this.data.studySessions = this.data.studySessions.slice(-20);
    this.data.studyMinutes = (this.data.studyMinutes || 0) + (minutes || 0);
    this.logActivity('estudio', 'Sesión de estudio completada', `${minutes} min · ${steps} pasos`);
  },

  studyMinutes() { return this.data.studyMinutes || 0; },

  /* --- Maestría por categoría (0-100) ---
    Combina recursos completados, autoevaluación, aciertos de test
    (ponderando dificultad) y errores abiertos. No solo "he abierto la página". */

  masteryFor(cat) {
    const list = D.resources.filter((r) => r.category === cat);
    if (!list.length) return 0;
    let pts = 0;
    const max = list.length * 10;
    list.forEach((r) => {
      if (this.isCompleted(r.id)) pts += 4;
      else if (this.data.resources.viewed[r.id]) pts += 1;
      const sa = this.selfAssessment(r.id);
      if (sa === 2) pts += 3;
      else if (sa === 1) pts += 1;
    });
    /* Tests: aciertos ponderados por dificultad (1/1.5/2) menos errores abiertos */
    const catTest = (D.tests || []).find((t) => t.category === cat);
    if (catTest) {
      const wrongBucket = this.data.tests.wrong[catTest.id] || {};
      const openWrong = Object.keys(wrongBucket).length;
      let earned = 0;
      let possible = 0;
      catTest.questions.forEach((q, i) => {
        const diff = q.difficulty === 'Avanzada' ? 2 : (q.difficulty === 'Intermedia' ? 1.5 : 1);
        possible += diff * 2;
        const bestSide = this.data.tests.best[catTest.id];
        if (typeof bestSide === 'number') earned += diff * 2 * (bestSide / 100);
        const wrongKey = (window.SMR.srs && SMR.srs.idOf(catTest.id, i)) || i;
        if (wrongBucket[wrongKey]) earned -= diff * 0.5;
      });
      if (possible > 0) {
        pts += Math.max(0, (earned / possible)) * 10;
      }
    }
    return Math.max(0, Math.min(100, Math.round((pts / max) * 100)));
  },

  /* --- Métricas --- */

  categoryStats() {
    return CATEGORIES.map((cat) => {
      const list = D.resources.filter((r) => r.category === cat);
      const done = list.filter((r) => this.isCompleted(r.id)).length;
      return { cat, total: list.length, done, pct: list.length ? Math.round((done / list.length) * 100) : 0 };
    });
  },

  globalStats() {
    const total = D.resources.length;
    const done = this.completedCount();
    const scores = Object.values(this.data.tests.best).filter((v) => typeof v === 'number');
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    return {
      total,
      done,
      pct: total ? Math.round((done / total) * 100) : 0,
      viewed: Object.keys(this.data.resources.viewed).length,
      testsDone: this.data.tests.history.length,
      avg,
      best: scores.length ? Math.max(...scores) : null,
      streak: this.data.streak.count,
      wrong: this.wrongCount()
    };
  },

  clear() {
    this.data = defaultProgress();
    SMR.store.remove(PROGRESS_KEY);
  }
};

/* Compatibilidad: importa las mejores puntuaciones del formato anterior
   (clave "bestScores") al nuevo sistema de progreso, sin perder nada. */
(function migrateLegacyScores() {
  const legacy = SMR.store.get('bestScores', null);
  if (!legacy || typeof legacy !== 'object' || Array.isArray(legacy)) return;
  let changed = false;
  Object.keys(legacy).forEach((testId) => {
    const pct = legacy[testId];
    if (typeof pct === 'number' && isFinite(pct) && typeof SMR.progress.data.tests.best[testId] !== 'number') {
      SMR.progress.data.tests.best[testId] = pct;
      changed = true;
    }
  });
  if (changed) SMR.progress.save();
})();

/* Fase 6C.5: migración del SRS posicional (testId:qIndex) a ID estable.
   - Antes de tocar nada guarda una copia del progreso original
     (clave "progressBackupV3"), una sola vez.
   - Migra srs y wrong mediante SMR.srs.migrateProgressData (idempotente).
   - No toca best, last, history, recursos, profile ni curriculum. */
(function migrateSrsKeys() {
  if (!window.SMR || !window.SMR.srs) return; /* srs.js no cargado: no se toca nada */
  const data = SMR.progress.data;
  if (typeof data.v === 'number' && data.v >= SMR.srs.version) return;
  try {
    if (SMR.store.get('progressBackupV3', null) === null) {
      const raw = SMR.store.get(PROGRESS_KEY, null);
      if (raw !== null) SMR.store.set('progressBackupV3', raw);
    }
    SMR.srs.migrateProgressData(data);
    SMR.progress.save();
  } catch (err) {
    if (window.console) window.console.warn('[SMR srs] migración SRS no completada:', err);
  }
})();

function resourceLabel(id) {
  const r = D.resources.find((x) => x.id === id);
  return r ? r.title : id;
}

/* ---------- Modal ---------- */

const modalState = { overlay: null, cleanup: null };

SMR.modal = {
  open(buildContent) {
    SMR.modal.close();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(overlay);
    modalState.overlay = overlay;

    const box = overlay.firstElementChild;
    buildContent(box);

    // Nombre accesible del diálogo: si el contenido trae un título, se enlaza.
    const title = box.querySelector('.modal-title');
    if (title) {
      if (!title.id) title.id = 'modal-title-' + Date.now();
      box.setAttribute('aria-labelledby', title.id);
    }

    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) SMR.modal.close();
    });

    const onKey = (event) => trapTabKey(event, box);
    document.addEventListener('keydown', onKey);
    modalState.cleanup = () => document.removeEventListener('keydown', onKey);

    document.body.style.overflow = 'hidden';
    const closeBtn = box.querySelector('.modal-close');
    if (closeBtn) closeBtn.focus();
  },
  close() {
    if (!modalState.overlay) return;
    modalState.overlay.remove();
    modalState.overlay = null;
    document.body.style.overflow = '';
    if (modalState.cleanup) {
      modalState.cleanup();
      modalState.cleanup = null;
    }
  }
};

function trapTabKey(event, box) {
  if (event.key === 'Escape') {
    SMR.modal.close();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusables = box.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusables.length) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/* ---------- Consultas de ruta (p. ej. #/recursos?q=...) ---------- */

SMR.activeQuery = new URLSearchParams();

/* ---------- Elementos comunes ---------- */

const HOME_TOOLS = [
  { icon: 'calculator', title: 'Calculadora de subredes', desc: 'Red, broadcast, rango de hosts y máscara a partir de una IP y su prefijo.', hash: '#/herramientas?tool=subredes' },
  { icon: 'repeat', title: 'Conversor numérico', desc: 'Decimal, binario, hexadecimal y octal en vivo.', hash: '#/herramientas?tool=conversor' },
  { icon: 'network', title: 'Tabla de puertos', desc: 'Puertos TCP y UDP habituales con su servicio y descripción.', hash: '#/herramientas?tool=puertos' },
  { icon: 'star', title: 'Generador de contraseñas', desc: 'Contraseñas seguras generadas íntegramente en tu navegador.', hash: '#/herramientas?tool=contrasenas' }
];

/* Herramientas y test sugeridos según la categoría del recurso */
const CATEGORY_TOOLS = {
  Redes: [['subredes', 'Calculadora de subredes'], ['vlsm', 'Reparto VLSM'], ['puertos', 'Tabla de puertos']],
  'Sistemas Operativos': [['conversor', 'Conversor numérico']],
  Hardware: [['unidades', 'Conversor de unidades']],
  Seguridad: [['contrasenas', 'Generador de contraseñas']],
  'Ofimática': [['conversor', 'Conversor numérico']],
  'Virtualización': [['subredes', 'Calculadora de subredes']],
  Mantenimiento: [['unidades', 'Conversor de unidades']]
};

const CATEGORY_TEST = {
  Redes: 't-redes',
  'Sistemas Operativos': 't-sistemas',
  Hardware: 't-hardware',
  Seguridad: 't-seguridad',
  'Virtualización': 't-virtualizacion',
  'Mantenimiento': 't-mantenimiento',
  'Ofimática': 't-ofimatica'
};

const QUICK_ACTIONS = [
  { icon: 'brain', label: 'Modo estudio', hash: '#/estudio' },
  { icon: 'book', label: 'Recursos', hash: '#/recursos' },
  { icon: 'clipboard', label: 'Tests', hash: '#/tests' },
  { icon: 'target', label: 'Repasar errores', hash: '#/tests?mode=errores' },
  { icon: 'layers', label: 'Casos prácticos', hash: '#/casos' },
  { icon: 'compass', label: '¿Qué estudiar después?', hash: '#/mapa' },
  { icon: 'wrench', label: 'Herramientas', hash: '#/herramientas' },
  { icon: 'bookOpen', label: 'Glosario', hash: '#/glosario' }
];

/* ---------- Utilidades de presentación ---------- */

function progressBar(pct) {
  const value = Math.max(0, Math.min(100, Math.round(pct) || 0));
  return `<div class="pbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}"><div class="pbar-fill" style="width:${value}%"></div></div>`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (!isFinite(diff) || diff < 0) return 'ahora mismo';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} meses`;
  return `hace ${Math.floor(months / 12)} años`;
}

/* Recursos con preguntas falladas (vía relatedResource de cada pregunta) */
function wrongResourceIds() {
  return SMR.progress.wrongRefs()
    .map((ref) => {
      const test = (D.tests || []).find((t) => t.id === ref.testId);
      const q = test && test.questions[ref.qIndex];
      return q && q.relatedResource;
    })
    .filter(Boolean);
}

/* Recursos recomendados con motivo explicado: prioriza errores, autoevaluación
   baja, categorías débiles y pendientes recientes. */
function recommendationWithReason(count = 3) {
  const p = SMR.progress.data;
  const catPct = {};
  SMR.progress.categoryStats().forEach((c) => { catPct[c.cat] = c.pct; });
  const wrongIds = wrongResourceIds();

  const scored = D.resources
    .filter((r) => !SMR.progress.isCompleted(r.id))
    .map((r) => {
      let score = 0;
      const reasons = [];
      const failRes = wrongIds.filter((id) => id === r.id).length;
      if (failRes) { score += 30 + failRes * 5; reasons.push('tienes fallos de test relacionados'); }
      const sa = SMR.progress.selfAssessment(r.id);
      if (sa === 0) { score += 25; reasons.push('marcaste «todavía no»'); }
      else if (sa === 1) { score += 15; reasons.push('marcaste «más o menos»'); }
      const weak = (catPct[r.category] || 0) <= 34 && (p.resources.viewed[r.id] || p.resources.completed[r.id]);
      if (weak) { score += 10; reasons.push(`tu categoría más débil: ${r.category}`); }
      if (SMR.favorites.has('recurso', r.id)) { score += 8; reasons.push('está en tus favoritos'); }
      const viewedAt = p.resources.viewed[r.id];
      if (viewedAt && Date.now() - viewedAt < 7 * 86400000) { score += 6; reasons.push('lo empezaste esta semana'); }
      score += Math.max(0, 10 - (catPct[r.category] || 0) / 10);
      return { r, score, reason: reasons[0] || 'aún sin completar' };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count);

  return scored;
}

function statPill(icon, value, label) {
  return `<div class="stat-pill">
    <span class="stat-pill-icon" aria-hidden="true">${SMR.icon(icon, 16)}</span>
    <span class="stat-pill-value">${SMR.esc(value)}</span>
    <span class="stat-pill-label">${SMR.esc(label)}</span>
  </div>`;
}

/* ---------- Página de inicio (dashboard) ---------- */

function continueTarget() {
  const progress = SMR.progress.data;
  const viewed = Object.entries(progress.resources.viewed).sort((a, b) => b[1] - a[1])[0];
  const lastRes = viewed ? D.resources.find((r) => r.id === viewed[0]) : null;
  const lastTest = progress.tests.history[progress.tests.history.length - 1] || null;
  const candidates = [];
  if (lastRes) candidates.push({ ts: viewed[1], kind: 'recurso', item: lastRes });
  if (lastTest) candidates.push({ ts: lastTest.date, kind: 'test', item: lastTest });
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.ts - a.ts)[0];
}

function renderHome(root) {
  const g = SMR.progress.globalStats();
  const cats = SMR.progress.categoryStats().filter((c) => c.total > 0);
  const favorites = D.resources.filter((r) => SMR.favorites.has('recurso', r.id)).slice(0, 4);
  const favoriteTerms = D.glossary.filter((t) => SMR.favorites.has('termino', t.id)).slice(0, 5);
  const activity = SMR.progress.recentActivity(6);
  const recommended = recommendationWithReason(3);
  const next = continueTarget();
  const dueSrs = SMR.progress.dueCount();
  const studyMin = SMR.progress.studyMinutes();
  const masteryList = (D.categories || [])
    .filter((cat) => D.resources.some((r) => r.category === cat))
    .map((cat) => ({ cat, mastery: SMR.progress.masteryFor(cat) }));
  const weakest = masteryList.length ? masteryList.reduce((a, b) => (b.mastery < a.mastery ? b : a)) : null;
  const strongest = masteryList.length ? masteryList.reduce((a, b) => (b.mastery > a.mastery ? b : a)) : null;

  const studySessions = SMR.progress.data.studySessions || [];
  const hasProgress = g.viewed > 0 || g.testsDone > 0 || g.done > 0;

  root.innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <p class="hero-eyebrow">${SMR.icon('layers', 14)} Plataforma de estudio SMR</p>
        <h2>SMR Hub</h2>
        <p>Recursos, tests y herramientas para Sistemas Microinformáticos y Redes. Todo se guarda en tu navegador: no necesitas cuenta.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="#/estudio">${SMR.icon('brain', 15)} Modo estudio</a>
          <a class="btn" href="#/recursos">${SMR.icon('book', 15)} Explorar recursos</a>
          <button type="button" class="btn" data-palette>${SMR.icon('search', 15)} Buscar <kbd class="kbd">Ctrl K</kbd></button>
        </div>
      </div>
    </section>

    ${next ? `
    <section class="panel continue-panel" aria-label="Continuar estudiando">
      <div class="continue-main">
        <p class="section-label">${SMR.icon('clock', 13)} Continuar estudiando</p>
        <h3 class="continue-title">${SMR.esc(next.item.title)}</h3>
        <p class="continue-meta">${next.kind === 'recurso'
          ? `${SMR.esc(next.item.category)} · ${SMR.esc(next.item.level)} · visto ${timeAgo(next.ts)}`
          : `Test · última puntuación ${next.item.pct}% · ${timeAgo(next.ts)}`}</p>
      </div>
      ${next.kind === 'recurso'
        ? `<button type="button" class="btn btn-primary" data-open-res="${next.item.id}">Continuar</button>`
        : `<a class="btn btn-primary" href="#/tests?test=${next.item.testId}">Repetir test</a>`}
    </section>` : `
    <section class="panel continue-panel" aria-label="Primeros pasos">
      <div class="continue-main">
        <p class="section-label">${SMR.icon('compass', 13)} Primeros pasos</p>
        <h3 class="continue-title">Empieza con una sesión de estudio guiada</h3>
        <p class="continue-meta">10 minutos bastan: el Modo Estudio mezcla lecciones cortas, recursos y preguntas.</p>
      </div>
      <a class="btn btn-primary" href="#/estudio">Probar el modo estudio</a>
    </section>`}

    <div class="home-grid">
      <section class="panel" aria-labelledby="home-progress">
        <h3 class="section-label" id="home-progress">${SMR.icon('chart', 13)} Tu progreso</h3>
        <div class="progress-head">
          <span class="progress-pct">${g.pct}%</span>
          <span class="progress-sub">${g.done} de ${g.total} recursos completados</span>
        </div>
        ${progressBar(g.pct)}
        <div class="stat-pills">
          ${statPill('check', String(g.done), 'Completados')}
          ${statPill('clipboard', String(g.testsDone), 'Tests hechos')}
          ${statPill('target', g.avg === null ? '—' : `${g.avg}%`, 'Media')}
          ${statPill('flame', String(g.streak), g.streak === 1 ? 'Día de racha' : 'Días de racha')}
          ${statPill('clock', String(dueSrs), dueSrs === 1 ? 'Repaso vence hoy' : 'Repasos vencidos hoy')}
          ${statPill('book', `${Math.floor(studyMin / 60)}h ${studyMin % 60}m`, 'Tiempo estudiado')}
        </div>
        ${weakest && strongest && strongest.mastery > 0 ? `
        <p class="count-note mastery-note">
          Tema con mayor dominio: <strong>${SMR.esc(strongest.cat)}</strong> (${strongest.mastery}%).
          Más débil: <strong>${SMR.esc(weakest.cat)}</strong> (${weakest.mastery}%).
        </p>` : ''}
        <h4 class="mini-label">Progreso por categoría</h4>
        <ul class="cat-bars">
          ${cats.map((c) => `
            <li class="cat-bar">
              <span class="cat-bar-name">${SMR.esc(c.cat)}</span>
              <span class="cat-bar-track">${progressBar(c.pct)}</span>
              <span class="cat-bar-value">${c.done}/${c.total}</span>
            </li>`).join('')}
        </ul>
      </section>

      <section class="panel" aria-labelledby="home-actions">
        <h3 class="section-label" id="home-actions">Acciones rápidas</h3>
        <div class="quick-actions">
          ${QUICK_ACTIONS.map((a) => `
            <a class="quick-action" href="${a.hash}">${SMR.icon(a.icon, 18)}<span>${SMR.esc(a.label)}</span></a>`).join('')}
        </div>
        <h3 class="section-label follow-label">Herramientas destacadas</h3>
        <ul class="link-list compact">
          ${HOME_TOOLS.slice(0, 3).map((t) => `
            <li><a class="link-row" href="${t.hash}">
              ${SMR.icon(t.icon)}
              <span class="link-row-text">
                <span class="link-row-title">${SMR.esc(t.title)}</span>
                <span class="link-row-desc">${SMR.esc(t.desc)}</span>
              </span>
              ${SMR.icon('chevronRight')}
            </a></li>`).join('')}
        </ul>
      </section>
    </div>

    <section class="panel profile-panel" aria-labelledby="home-profile">
      <div class="profile-card-head">
        <div class="profile-card-info">
          <h3 class="section-label" id="home-profile">${SMR.icon('target', 13)} Tu perfil académico</h3>
          ${(() => {
            const p = SMR.profile.read();
            return p
              ? profileSummaryHtml(p, SMR.getStudentCurriculum())
              : '<p class="count-note">Todavía no has configurado tu perfil académico.</p>';
          })()}
        </div>
        <div class="profile-card-actions">
          <button type="button" class="btn btn-sm" data-edit-profile>${SMR.profile.isConfigured() ? 'Editar' : 'Configurar'}</button>
          <a class="btn btn-sm btn-primary" href="#/mi-smr">Ver mi currículo</a>
        </div>
      </div>
    </section>

    <section class="panel" aria-labelledby="home-recommended">
      <h3 class="section-label" id="home-recommended">${SMR.icon('zap', 13)} Te recomendamos estudiar ahora</h3>
      ${recommended.length ? `
      <ul class="link-list compact">
        ${recommended.map((rec) => `
          <li><button type="button" class="link-row link-row-btn" data-open-res="${rec.r.id}">
            ${SMR.icon('fileText')}
            <span class="link-row-text">
              <span class="link-row-title">${SMR.esc(rec.r.title)}</span>
              <span class="link-row-desc">${SMR.esc(rec.r.category)} · ${SMR.esc(rec.r.level)} — ${SMR.esc(rec.reason)}</span>
            </span>
            ${SMR.icon('chevronRight')}
          </button></li>`).join('')}
      </ul>` : `
      <div class="empty empty-inline">
        ${SMR.icon('circleCheck', 20)}
        <p class="empty-title">Has completado todo el catálogo</p>
        <p class="empty-text">Repasa con un test o una sesión de estudio para mantener el ritmo.</p>
        <div class="empty-actions">
          <a class="btn btn-primary" href="#/tests">Hacer un test</a>
        </div>
      </div>`}
    </section>

    <div class="home-grid">
      <section class="panel" aria-labelledby="home-favs">
        <h3 class="section-label" id="home-favs">${SMR.icon('star', 13)} Favoritos</h3>
        ${favorites.length || favoriteTerms.length ? `
          <ul class="link-list compact">
            ${favorites.map((r) => `
              <li><button type="button" class="link-row link-row-btn" data-open-res="${r.id}">
                ${SMR.icon('fileText')}
                <span class="link-row-text">
                  <span class="link-row-title">${SMR.esc(r.title)}</span>
                  <span class="link-row-desc">Recurso · ${SMR.esc(r.category)}</span>
                </span>
                ${SMR.icon('chevronRight')}
              </button></li>`).join('')}
            ${favoriteTerms.map((t) => `
              <li><a class="link-row" href="#/glosario?q=${encodeURIComponent(t.term)}">
                ${SMR.icon('bookOpen')}
                <span class="link-row-text">
                  <span class="link-row-title">${SMR.esc(t.term)}</span>
                  <span class="link-row-desc">Glosario · ${SMR.esc(t.category || 'General')}</span>
                </span>
                ${SMR.icon('chevronRight')}
              </a></li>`).join('')}
          </ul>` : `
          <div class="empty empty-inline">
            ${SMR.icon('star', 20)}
            <p class="empty-title">Todavía no tienes favoritos</p>
            <p class="empty-text">Guarda recursos o términos con la estrella para tenerlos a mano.</p>
          </div>`}
      </section>

      <section class="panel" aria-labelledby="home-activity">
        <h3 class="section-label" id="home-activity">${SMR.icon('clock', 13)} Actividad reciente</h3>
        ${activity.length ? `
          <ul class="activity-list">
            ${activity.map((a) => `
              <li class="activity-item">
                <span class="activity-dot" aria-hidden="true"></span>
                <span class="activity-text">
                  <span class="activity-label">${SMR.esc(a.label)}</span>
                  ${a.meta ? `<span class="activity-meta">${SMR.esc(a.meta)}</span>` : ''}
                </span>
                <span class="activity-time">${timeAgo(a.ts)}</span>
              </li>`).join('')}
          </ul>` : `
          <div class="empty empty-inline">
            ${SMR.icon('clock', 20)}
            <p class="empty-title">Sin actividad registrada</p>
            <p class="empty-text">Tu actividad aparecerá aquí cuando empieces a estudiar.</p>
          </div>`}
        ${studySessions.length ? `
          <h3 class="section-label follow-label">Estudio</h3>
          <p class="count-note">${studySessions.length === 1 ? '1 sesión completada' : `${studySessions.length} sesiones completadas`} en total.</p>
        ` : ''}
      </section>
    </div>`;

  root.querySelectorAll('[data-open-res]').forEach((btn) => {
    btn.addEventListener('click', () => openResource(btn.dataset.openRes));
  });
  root.querySelectorAll('[data-palette]').forEach((btn) => {
    btn.addEventListener('click', () => openPalette());
  });
  root.querySelectorAll('[data-edit-profile]').forEach((btn) => {
    btn.addEventListener('click', openProfileSetup);
  });
}

/* ---------- Página de recursos ---------- */

const resState = { q: '', cat: 'Todas', level: 'Todos', favs: false };

function chipHtml(value, active) {
  return `<button type="button" class="chip${active ? ' active' : ''}" data-value="${SMR.esc(value)}">${SMR.esc(value)}</button>`;
}

function resourceRow(r) {
  const fav = SMR.favorites.has('recurso', r.id);
  const done = SMR.progress.isCompleted(r.id);
  return `
    <li class="row-item">
      <div class="row-main">
        <div class="row-top">
          <h3 class="row-title">${SMR.esc(r.title)}</h3>
          <span class="badge">${SMR.esc(r.category)}</span>
          <span class="badge badge-level">${SMR.esc(r.level)}</span>
          ${done ? `<span class="badge badge-done">${SMR.icon('check', 11)} Completado</span>` : ''}
        </div>
        <p class="row-desc">${SMR.esc(r.desc)}</p>
      </div>
      <div class="row-actions">
        <button type="button" class="icon-btn fav-btn${fav ? ' active' : ''}" data-fav="recurso:${r.id}"
                aria-pressed="${fav}" title="${fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}"
                aria-label="${fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${SMR.icon('star', 16, fav)}</button>
        <button type="button" class="btn btn-sm" data-open="${r.id}">Abrir</button>
      </div>
    </li>`;
}

/* Términos del glosario que aparecen en el texto del recurso (derivado, sin inventar datos) */
function relatedTermsFor(resource) {
  const hay = fold(`${resource.title} ${resource.desc} ${(resource.content || []).join(' ')}`).toLowerCase();
  return D.glossary.filter((t) => hay.includes(fold(t.term).toLowerCase())).slice(0, 6);
}

/* Recursos que mencionan un término del glosario */
function resourcesForTerm(term) {
  const needle = fold(term).toLowerCase();
  return D.resources
    .filter((r) => fold(`${r.title} ${r.desc} ${(r.content || []).join(' ')}`).toLowerCase().includes(needle))
    .slice(0, 3);
}

/* Relacionados declarados + derivados del texto (máx. 3) */
function relatedResourcesFor(r) {
  const declared = (r.relatedResources || [])
    .map((id) => D.resources.find((x) => x.id === id))
    .filter(Boolean);
  if (declared.length >= 3) return declared.slice(0, 3);
  const seen = new Set(declared.map((x) => x.id));
  const derived = relatedTermsFor(r)
    .flatMap((t) => resourcesForTerm(t.term))
    .filter((x) => x.id !== r.id && !seen.has(x.id))
    .slice(0, 3 - declared.length);
  return declared.concat(derived);
}

function bindModalLinks(box, attr) {
  box.querySelectorAll(`[${attr}]`).forEach((el) => {
    el.addEventListener('click', () => {
      const target = el.getAttribute(attr);
      SMR.modal.close();
      SMR.navigate(target);
    });
  });
}

function lessonSection(title, body) {
  return body ? `<h4 class="modal-sub">${SMR.esc(title)}</h4>${body}` : '';
}

function relatedChips(items, { icon = 'chevronRight', accent = false } = {}) {
  if (!items.length) return '';
  return `
    <div class="tag-row">
      ${items.map((item) => {
        if (item.hash) {
          return `<button type="button" class="tag${accent ? ' tag-accent' : ''}" data-nav="${item.hash}">${SMR.icon(icon, 13)} ${SMR.esc(item.label)}</button>`;
        }
        return `<button type="button" class="tag${accent ? ' tag-accent' : ''}" data-open-res="${item.id}">${SMR.icon('fileText', 13)} ${SMR.esc(item.label)}</button>`;
      }).join('')}
    </div>`;
}

/* ---------- Modal de recurso: lección, autoevaluación y navegación ---------- */

function openResource(id) {
  const r = D.resources.find((x) => x.id === id);
  if (!r) {
    SMR.modal.open((box) => {
      box.innerHTML = `
        <div class="modal-head">
          <h3 class="modal-title">Recurso no disponible</h3>
          <button type="button" class="icon-btn modal-close" aria-label="Cerrar">${SMR.icon('x')}</button>
        </div>
        <div class="empty empty-inline">
          <p class="empty-title">No encontramos este recurso</p>
          <p class="empty-text">Puede que el enlace esté desactualizado. Explora el catálogo completo.</p>
          <a class="btn btn-primary" href="#/recursos">Ir a recursos</a>
        </div>`;
      box.querySelector('.modal-close').addEventListener('click', SMR.modal.close);
    });
    return;
  }

  SMR.progress.markViewed(r.id);

  const lesson = r.lesson || {};
  const terms = relatedTermsFor(r);
  const tools = CATEGORY_TOOLS[r.category] || [];
  const testId = CATEGORY_TEST[r.category];
  const test = testId ? D.tests.find((t) => t.id === testId) : null;
  const completed = SMR.progress.isCompleted(r.id);
  const sa = SMR.progress.selfAssessment(r.id);

  const siblings = D.resources.filter((x) => x.category === r.category);
  const idx = siblings.findIndex((x) => x.id === r.id);
  const prevRes = idx > 0 ? siblings[idx - 1] : null;
  const nextRes = idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const related = relatedResourcesFor(r);

  SMR.modal.open((box) => {
    box.classList.add('modal-lg');
    const fav = SMR.favorites.has('recurso', r.id);

    const selfAssessmentHtml = `
      <section class="self-check" aria-label="Autoevaluación">
        <h4 class="self-check-title">¿Has entendido este tema?</h4>
        <div class="self-check-row" role="group" aria-label="¿Has entendido este tema?">
          ${DEG_LABELS.map((label, i) => `
            <button type="button" class="btn btn-sm self-btn${sa === i ? ' active' : ''}" data-sa="${i}"
                    aria-pressed="${sa === i}">${label}</button>`).join('')}
        </div>
        <p class="hint-inline">Tu respuesta ajusta las recomendaciones de estudio.</p>
      </section>`;

    box.innerHTML = `
      <div class="modal-head">
        <div>
          <h3 class="modal-title">${SMR.esc(r.title)}</h3>
          <p class="modal-meta">
            <span class="badge">${SMR.esc(r.category)}</span>
            <span class="badge badge-level">${SMR.esc(r.level)}</span>
            ${r.minutes ? `<span class="badge">${SMR.icon('clock', 11)} ${r.minutes} min de estudio</span>` : ''}
            ${completed ? `<span class="badge badge-done">${SMR.icon('check', 11)} Completado</span>` : ''}
          </p>
          ${Array.isArray(r.tags) && r.tags.length ? `<p class="modal-tags">${r.tags.map((t) => `<span class="tag" aria-hidden="true">${SMR.esc(t)}</span>`).join('')}</p>` : ''}
        </div>
        <button type="button" class="icon-btn modal-close" aria-label="Cerrar">${SMR.icon('x')}</button>
      </div>
      <p class="modal-desc">${SMR.esc(r.desc)}</p>

      <h4 class="modal-sub">Contenido</h4>
      <ul class="modal-list">${(r.content || []).map((c) => `<li>${SMR.esc(c)}</li>`).join('')}</ul>

      ${lessonSection('¿Por qué importa?', r.whyItMatters ? `<p class="modal-summary">${SMR.esc(r.whyItMatters)}</p>` : '')}

      ${lessonSection('Puntos clave', lesson.keyPoints && lesson.keyPoints.length
        ? `<ul class="modal-list modal-list-check">${lesson.keyPoints.map((p) => `<li>${SMR.esc(p)}</li>`).join('')}</ul>` : '')}

      ${lessonSection('Ejemplo', lesson.example ? `<p class="modal-example">${SMR.esc(lesson.example)}</p>` : '')}

      ${lessonSection('Errores frecuentes', lesson.commonErrors && lesson.commonErrors.length
        ? `<ul class="modal-list modal-list-warn">${lesson.commonErrors.map((p) => `<li>${SMR.esc(p)}</li>`).join('')}</ul>` : '')}

      ${lessonSection('Practica', r.exercise
        ? `<div class="modal-example modal-exercise"><p><strong>${SMR.esc(r.exercise.prompt)}</strong></p>
           <details class="exercise-solution"><summary>Ver solución orientativa</summary><p>${SMR.esc(r.exercise.solution)}</p></details></div>` : '')}

      ${lessonSection('Resumen', lesson.summary ? `<p class="modal-summary">${SMR.esc(lesson.summary)}</p>` : '')}

      ${selfAssessmentHtml}

      ${terms.length ? lessonSection('Conceptos relacionados', `
        <div class="tag-row">
          ${terms.map((t) => `<button type="button" class="tag" data-term="${SMR.esc(t.term)}">${SMR.esc(t.term)}</button>`).join('')}
        </div>`) : ''}

      ${(related.length || tools.length || test) ? lessonSection('Relacionado con este tema', `
        ${relatedChips(related.map((x) => ({ id: x.id, label: x.title })))}
        ${relatedChips(tools.map(([tool, label]) => ({ hash: `#/herramientas?tool=${encodeURIComponent(tool)}`, label })), { icon: 'wrench', accent: true })}
        ${relatedChips(test ? [{ hash: `#/tests?test=${test.id}`, label: test.title }] : [], { icon: 'clipboard', accent: true })}`) : ''}

      <div class="modal-foot">
        <button type="button" class="btn fav-text" data-fav="recurso:${r.id}" aria-pressed="${fav}">
          ${SMR.icon('star', 15, fav)}${fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        </button>
        <button type="button" class="btn ${completed ? 'btn-ghost' : 'btn-primary'}" data-complete aria-pressed="${completed}">
          ${completed ? 'Marcar como pendiente' : 'Marcar como completado'}
        </button>
      </div>

      <nav class="res-nav" aria-label="Navegación entre recursos">
        ${prevRes ? `<button type="button" class="btn btn-sm" data-open-res="${prevRes.id}">${SMR.icon('chevronLeft', 14)} ${SMR.esc(prevRes.title)}</button>`
                  : '<span></span>'}
        <button type="button" class="btn btn-sm" data-nav="#/recursos">${SMR.icon('layers', 14)} Volver al módulo</button>
        ${nextRes ? `<button type="button" class="btn btn-sm" data-open-res="${nextRes.id}">${SMR.esc(nextRes.title)} ${SMR.icon('chevronRight', 14)}</button>`
                  : '<span></span>'}
      </nav>`;

    box.querySelector('.modal-close').addEventListener('click', SMR.modal.close);
    bindFav(box);
    bindModalLinks(box, 'data-nav');

    box.querySelectorAll('[data-open-res]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SMR.modal.close();
        window.setTimeout(() => openResource(btn.dataset.openRes), 0);
      });
    });

    box.querySelectorAll('[data-term]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SMR.modal.close();
        window.setTimeout(() => openTerm(btn.dataset.term), 0);
      });
    });

    box.querySelectorAll('[data-sa]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const degree = Number(btn.dataset.sa);
        SMR.progress.setSelfAssessment(r.id, degree);
        box.querySelectorAll('[data-sa]').forEach((b) => {
          const active = Number(b.dataset.sa) === degree;
          b.classList.toggle('active', active);
          b.setAttribute('aria-pressed', String(active));
        });
      });
    });

    const completeBtn = box.querySelector('[data-complete]');
    completeBtn.addEventListener('click', () => {
      const nowDone = SMR.progress.toggleCompleted(r.id);
      completeBtn.textContent = nowDone ? 'Marcar como pendiente' : 'Marcar como completado';
      completeBtn.classList.toggle('btn-primary', !nowDone);
      completeBtn.classList.toggle('btn-ghost', nowDone);
      completeBtn.setAttribute('aria-pressed', String(nowDone));
    });
  });
}

/* ---------- Página de recursos ---------- */

function renderRecursos(root) {
  const urlQ = SMR.activeQuery.get('q');
  if (urlQ) resState.q = urlQ;

  root.innerHTML = `
    <div class="toolbar">
      <input type="search" class="input page-search" id="res-search" placeholder="Buscar recursos"
             aria-label="Buscar recursos" value="${SMR.esc(resState.q)}">
      <select class="input" id="res-level" aria-label="Filtrar por nivel">
        <option value="Todos">Todos los niveles</option>
        ${LEVELS.map((l) => `<option value="${l}">${l}</option>`).join('')}
      </select>
    </div>
    <div class="chip-bar" role="group" aria-label="Categorías">
      ${chipHtml('Todas', resState.cat === 'Todas')}
      ${CATEGORIES.map((c) => chipHtml(c, resState.cat === c)).join('')}
      <button type="button" class="chip${resState.favs ? ' active' : ''}" data-res-favs aria-pressed="${resState.favs}">Solo favoritos</button>
    </div>
    <p class="count-note" id="res-count"></p>
    <ul class="row-list" id="res-list"></ul>`;

  const searchInput = root.querySelector('#res-search');
  const levelSel = root.querySelector('#res-level');
  const chipBar = root.querySelector('.chip-bar');
  const listEl = root.querySelector('#res-list');
  const countEl = root.querySelector('#res-count');
  levelSel.value = resState.level;

  function apply() {
    const q = resState.q.trim().toLowerCase();
    const list = D.resources.filter((r) =>
      (resState.cat === 'Todas' || r.category === resState.cat) &&
      (resState.level === 'Todos' || r.level === resState.level) &&
      (!resState.favs || SMR.favorites.has('recurso', r.id)) &&
      (!q || SMR.matches(r.title + ' ' + r.desc + ' ' + r.category, q))
    ).sort((a, b) => b.added.localeCompare(a.added));

    countEl.textContent = `${list.length} de ${D.resources.length} recursos`;

    if (!list.length) {
      listEl.innerHTML = `
        <li><div class="empty">
          <p class="empty-title">Sin resultados</p>
          <p class="empty-text">Ningún recurso coincide con los filtros aplicados.</p>
          <button type="button" class="btn" id="res-clear">Limpiar filtros</button>
        </div></li>`;
      listEl.querySelector('#res-clear').addEventListener('click', () => {
        resState.q = ''; resState.cat = 'Todas'; resState.level = 'Todos'; resState.favs = false;
        renderRecursos(root);
      });
      return;
    }

    listEl.innerHTML = list.map(resourceRow).join('');
    bindFav(listEl);
    listEl.querySelectorAll('[data-open]').forEach((btn) => {
      btn.addEventListener('click', () => openResource(btn.dataset.open));
    });
  }

  searchInput.addEventListener('input', () => {
    resState.q = searchInput.value;
    apply();
  });

  levelSel.addEventListener('change', () => {
    resState.level = levelSel.value;
    apply();
  });

  chipBar.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    if (chip.hasAttribute('data-res-favs')) {
      resState.favs = !resState.favs;
    } else {
      resState.cat = chip.dataset.value;
    }
    chipBar.querySelectorAll('.chip').forEach((ch) => {
      if (ch.hasAttribute('data-res-favs')) {
        ch.classList.toggle('active', resState.favs);
        ch.setAttribute('aria-pressed', String(resState.favs));
      } else {
        ch.classList.toggle('active', ch.dataset.value === resState.cat);
      }
    });
    apply();
  });

  apply();
}

/* ---------- Ficha de término (modal de glosario) ---------- */

function openTerm(termName) {
  const t = D.glossary.find((x) => x.term === termName);
  if (!t) return;

  const relatedTerms = D.glossary.filter((x) => x.id !== t.id && x.category === t.category).slice(0, 4);
  const related = resourcesForTerm(t.term);
  const fav = SMR.favorites.has('termino', t.id);

  SMR.modal.open((box) => {
    box.innerHTML = `
      <div class="modal-head">
        <div>
          <h3 class="modal-title">${SMR.esc(t.term)}</h3>
          <p class="modal-meta"><span class="badge">${SMR.esc(t.category || 'General')}</span></p>
        </div>
        <button type="button" class="icon-btn modal-close" aria-label="Cerrar">${SMR.icon('x')}</button>
      </div>
      <p class="modal-desc">${SMR.esc(t.definition)}</p>

      ${relatedTerms.length ? lessonSection('Otros términos', `
        <div class="tag-row">
          ${relatedTerms.map((x) => `<button type="button" class="tag" data-term="${SMR.esc(x.term)}">${SMR.esc(x.term)}</button>`).join('')}
        </div>`) : ''}

      ${related.length ? lessonSection('Recursos relacionados', `
        <div class="tag-row">
          ${related.map((x) => `<button type="button" class="tag" data-open-res="${x.id}">${SMR.icon('fileText', 13)} ${SMR.esc(x.title)}</button>`).join('')}
        </div>`) : ''}

      <div class="modal-foot">
        <button type="button" class="btn fav-text" data-fav="termino:${t.id}" aria-pressed="${fav}">
          ${SMR.icon('star', 15, fav)}${fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        </button>
      </div>`;

    box.querySelector('.modal-close').addEventListener('click', SMR.modal.close);
    bindFav(box);

    box.querySelectorAll('[data-term]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SMR.modal.close();
        window.setTimeout(() => openTerm(btn.dataset.term), 0);
      });
    });

    box.querySelectorAll('[data-open-res]').forEach((btn) => {
      btn.addEventListener('click', () => {
        SMR.modal.close();
        window.setTimeout(() => openResource(btn.dataset.openRes), 0);
      });
    });
  });
}

/* ---------- Página de glosario ---------- */

const gloState = { q: '', letter: 'Todas', cat: 'Todas', favs: false };

function renderGlosario(root) {
  const urlQ = SMR.activeQuery.get('q');
  if (urlQ) gloState.q = urlQ;

  const letters = [...new Set(D.glossary.map((t) => t.term[0].toUpperCase()))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const cats = [...new Set(D.glossary.map((t) => t.category || 'General'))].sort((a, b) => a.localeCompare(b, 'es'));

  root.innerHTML = `
    <div class="toolbar">
      <input type="search" class="input page-search" id="glo-search" placeholder="Buscar término o definición"
             aria-label="Buscar en el glosario" value="${SMR.esc(gloState.q)}">
      <select class="input" id="glo-cat" aria-label="Filtrar por categoría">
        <option value="Todas">Todas las categorías</option>
        ${cats.map((c) => `<option value="${SMR.esc(c)}">${SMR.esc(c)}</option>`).join('')}
      </select>
    </div>
    <div class="chip-bar" role="group" aria-label="Filtrar por letra inicial">
      ${chipHtml('Todas', gloState.letter === 'Todas')}
      ${letters.map((l) => chipHtml(l, gloState.letter === l)).join('')}
      <button type="button" class="chip${gloState.favs ? ' active' : ''}" data-glo-favs aria-pressed="${gloState.favs}">Solo favoritos</button>
    </div>
    <p class="count-note" id="glo-count"></p>
    <ul class="row-list" id="glo-list"></ul>`;

  const searchInput = root.querySelector('#glo-search');
  const catSel = root.querySelector('#glo-cat');
  const chipBar = root.querySelector('.chip-bar');
  const listEl = root.querySelector('#glo-list');
  const countEl = root.querySelector('#glo-count');
  catSel.value = gloState.cat;

  function apply() {
    const q = gloState.q.trim().toLowerCase();
    const list = D.glossary.filter((t) =>
      (gloState.letter === 'Todas' || t.term[0].toUpperCase() === gloState.letter) &&
      (gloState.cat === 'Todas' || (t.category || 'General') === gloState.cat) &&
      (!gloState.favs || SMR.favorites.has('termino', t.id)) &&
      (!q || SMR.matches(t.term + ' ' + t.definition, q))
    ).sort((a, b) => a.term.localeCompare(b.term, 'es'));

    countEl.textContent = `${list.length} de ${D.glossary.length} términos`;

    if (!list.length) {
      listEl.innerHTML = `
        <li><div class="empty">
          <p class="empty-title">Sin resultados</p>
          <p class="empty-text">Ningún término coincide con la búsqueda o los filtros.</p>
          <button type="button" class="btn" id="glo-clear">Limpiar filtros</button>
        </div></li>`;
      listEl.querySelector('#glo-clear').addEventListener('click', () => {
        gloState.q = ''; gloState.letter = 'Todas'; gloState.cat = 'Todas'; gloState.favs = false;
        renderGlosario(root);
      });
      return;
    }

    listEl.innerHTML = list.map((t) => {
      const fav = SMR.favorites.has('termino', t.id);
      return `
        <li class="gloss-item">
          <div class="gloss-head">
            <span class="gloss-term">${SMR.esc(t.term)}</span>
            <div class="gloss-actions">
              <span class="badge">${SMR.esc(t.category || 'General')}</span>
              <button type="button" class="icon-btn fav-btn${fav ? ' active' : ''}" data-fav="termino:${t.id}"
                      aria-pressed="${fav}" title="${fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}"
                      aria-label="${fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}">${SMR.icon('star', 15, fav)}</button>
            </div>
          </div>
          <p class="gloss-def">${SMR.esc(t.definition)}</p>
          <p class="gloss-links"><button type="button" class="link-like" data-term="${SMR.esc(t.term)}">Ver ficha completa</button></p>
        </li>`;
    }).join('');
    bindFav(listEl);

    listEl.querySelectorAll('[data-term]').forEach((btn) => {
      btn.addEventListener('click', () => openTerm(btn.dataset.term));
    });
  }

  searchInput.addEventListener('input', () => {
    gloState.q = searchInput.value;
    apply();
  });

  catSel.addEventListener('change', () => {
    gloState.cat = catSel.value;
    apply();
  });

  chipBar.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    if (chip.hasAttribute('data-glo-favs')) {
      gloState.favs = !gloState.favs;
    } else {
      gloState.letter = chip.dataset.value;
    }
    chipBar.querySelectorAll('.chip').forEach((ch) => {
      if (ch.hasAttribute('data-glo-favs')) {
        ch.classList.toggle('active', gloState.favs);
        ch.setAttribute('aria-pressed', String(gloState.favs));
      } else {
        ch.classList.toggle('active', ch.dataset.value === gloState.letter);
      }
    });
    apply();
  });

  apply();
}

/* ---------- Currículo por comunidad (fuente de verdad: SMR_DATA.curriculums) ---------- */

const CURRICULA = Array.isArray(D.curriculums) ? D.curriculums : [];

/* Solo sirve para ordenar el selector (las ciudades autónomas al final).
   Los nombres y el orden base se leen siempre de los datos. */
const AUTONOMOUS_CITIES = ['ceuta', 'melilla'];

const CURR_NOT_SPECIFIED = 'No especificado en la fuente oficial';
const CURR_NO_HOURS_FOE =
  'No consta un número de horas específico por título en la fuente curricular consultada.';

const CURR_STATUS = {
  VERIFIED: {
    label: 'Currículo verificado',
    icon: 'circleCheck',
    tone: 'ok',
    text: 'Los datos de esta ficha se han contrastado con fuentes oficiales vigentes.'
  },
  PARTIALLY_VERIFIED: {
    label: 'Currículo parcialmente verificado',
    icon: 'clock',
    tone: 'warn',
    text: 'Este currículo está parcialmente verificado. Algunos datos todavía no han podido confirmarse de forma inequívoca.'
  },
  NOT_VERIFIED: {
    label: 'Currículo no verificado',
    icon: 'x',
    tone: 'bad',
    text: 'SMR Hub todavía no dispone de suficiente evidencia oficial para mostrar el currículo vigente de esta comunidad.'
  }
};

const currYears = [...new Set(CURRICULA.map((c) => c.academicYear).filter(Boolean))].sort().reverse();

const currSaved = (() => {
  const saved = SMR.store.get('curriculum', null);
  return saved && typeof saved === 'object' ? saved : {};
})();

const currProfile = SMR.profile.read();
// Si el estudiante ya completó el perfil, es la fuente de verdad. La clave
// antigua smrhub:curriculum se conserva intacta por compatibilidad, pero solo
// sirve de valor inicial mientras no haya perfil configurado.
const currFromProfile = Boolean(currProfile && currProfile.setupCompleted);
const currState = {
  community: currFromProfile
    ? currProfile.community
    : (CURRICULA.some((c) => c.id === currSaved.community) ? currSaved.community : (currProfile ? currProfile.community : null)),
  year: currFromProfile && currYears.includes(currProfile.academicYear)
    ? currProfile.academicYear
    : (currYears.includes(currSaved.year)
      ? currSaved.year
      : (currProfile && currYears.includes(currProfile.academicYear) ? currProfile.academicYear : (currYears[0] || '')))
};

/* Lista de comunidades para el selector: la genera el motor de perfil (fuente única) */
function curriculumList() {
  return SMR.profile.sortedCurriculums();
}

function getCurriculumByCommunity(communityId) {
  return CURRICULA.find((c) => c.id === communityId) || null;
}

function currHours(value) {
  return value === null || value === undefined ? CURR_NOT_SPECIFIED : `${value} h`;
}

function currCourse(course) {
  return course === null || course === undefined ? CURR_NOT_SPECIFIED : `${course}.º SMR`;
}

/* Bloques de la ficha que no tienen datos en este registro */
function currMissingParts(cur) {
  const missing = [];
  /* 6D.8 (INT-03): la completitud de los contenedores de módulos se
     consulta a la capa curricular (curriculumIndex), no a la ficha.
     Los demás bloques (optativas, proyecto, FCT, versión) siguen
     leyéndose de la fuente: son datos de ficha, no derivables. */
  const ix = (typeof SMR.curriculumIndex === 'function') ? SMR.curriculumIndex() : null;
  const bucket = ix && ix.byCurriculum ? ix.byCurriculum[cur.id] : null;
  const hasKind = (kind) => Array.isArray(bucket) && bucket.some((m) => m.kind === kind);
  if (!hasKind('modules1')) missing.push('Los módulos de 1.º de SMR');
  if (!hasKind('modules2')) missing.push('Los módulos de 2.º de SMR');
  if (!cur.electives || !cur.electives.length) missing.push('El módulo profesional optativo');
  if (!cur.project) missing.push('El proyecto intermodular');
  if (!cur.companyTraining) missing.push('La formación en empresa u organismo equiparado');
  if (!cur.curriculumVersion) missing.push('La versión del currículo aplicable');
  return missing;
}

function renderVerificationStatus(cur) {
  const st = CURR_STATUS[cur.status] || { label: cur.status, icon: 'fileText', tone: 'na', text: '' };
  return `
    <div class="curr-status curr-status--${st.tone}" role="status">
      <span class="curr-status-icon" aria-hidden="true">${SMR.icon(st.icon, 18, true)}</span>
      <div class="curr-status-body">
        <p class="curr-status-title">${SMR.esc(st.label)}</p>
        <p class="curr-status-text">${SMR.esc(st.text)}</p>
        <p class="curr-status-meta">
          <span class="badge mono">${SMR.esc(cur.status)}</span>
          <span>${SMR.esc(cur.name)}</span>
          <span>Curso ${SMR.esc(cur.academicYear)}</span>
          ${cur.verifiedAt ? `<span>Revisado el ${SMR.esc(cur.verifiedAt)}</span>` : ''}
        </p>
      </div>
    </div>`;
}

function renderModuleTable(modules, caption) {
  const list = modules || [];
  if (!list.length) {
    return `<p class="curr-empty-line">No constan módulos en esta ficha: la fuente oficial localizada no publica la distribución de módulos del título.</p>`;
  }
  return `
    <div class="table-wrap">
      <table class="curr-table">
        <caption class="sr-only">${SMR.esc(caption)}</caption>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Módulo</th>
            <th scope="col">Horas anuales</th>
            <th scope="col">Horas semanales</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((m) => `
            <tr>
              <td data-label="Código" class="mono">${m.code ? SMR.esc(m.code) : CURR_NOT_SPECIFIED}</td>
              <td data-label="Módulo" class="curr-module-name">${SMR.esc(m.name)}</td>
              <td data-label="Horas anuales">${currHours(m.hours)}</td>
              <td data-label="Horas semanales">${m.weeklyHours === null || m.weeklyHours === undefined ? CURR_NOT_SPECIFIED : `${m.weeklyHours} h/sem`}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderKv(pairs) {
  return `
    <div class="result-grid curr-grid">
      ${pairs.map(([key, value]) => `
        <div class="kv">
          <span class="kv-key">${SMR.esc(key)}</span>
          <span class="kv-value${value === CURR_NOT_SPECIFIED || value === CURR_NO_HOURS_FOE ? ' curr-na' : ''}">${SMR.esc(value)}</span>
        </div>`).join('')}
    </div>`;
}

function renderElectives(cur) {
  const list = cur.electives || [];
  if (!list.length) {
    return `<p class="curr-empty-line">No consta un módulo profesional optativo en esta ficha.</p>`;
  }
  return list.map((e) => `
    ${renderKv([
      ['Módulo optativo', e.name || 'Módulo profesional optativo'],
      ['Código', e.code || CURR_NOT_SPECIFIED],
      ['Horas anuales', currHours(e.hours)],
      ['Curso', currCourse(e.course)],
      ['Horas semanales', e.weeklyHours === null || e.weeklyHours === undefined ? CURR_NOT_SPECIFIED : `${e.weeklyHours} h/sem`]
    ])}
    ${e.note ? `<p class="curr-note">${SMR.esc(e.note)}</p>` : ''}`).join('');
}

function renderProject(project) {
  if (!project) {
    return `<p class="curr-empty-line">No consta un proyecto intermodular en esta ficha.</p>`;
  }
  return `
    ${renderKv([
      ['Código', project.code || CURR_NOT_SPECIFIED],
      ['Nombre', project.name || CURR_NOT_SPECIFIED],
      ['Horas anuales', currHours(project.hours)],
      ['Curso', currCourse(project.course)],
      ['Horas semanales', project.weeklyHours === null || project.weeklyHours === undefined ? CURR_NOT_SPECIFIED : `${project.weeklyHours} h/sem`]
    ])}
    ${project.note ? `<p class="curr-note">${SMR.esc(project.note)}</p>` : ''}`;
}

function renderCompanyTraining(companyTraining) {
  if (!companyTraining) {
    return `<p class="curr-empty-line">No consta información de formación en empresa en esta ficha.</p>`;
  }
  const required =
    companyTraining.required === true ? 'Obligatoria'
      : companyTraining.required === false ? 'No obligatoria'
        : CURR_NOT_SPECIFIED;
  return `
    ${renderKv([
      ['Obligatoriedad', required],
      ['Horas', companyTraining.hours === null || companyTraining.hours === undefined ? CURR_NO_HOURS_FOE : currHours(companyTraining.hours)],
      ['Base normativa', companyTraining.legalBasis || CURR_NOT_SPECIFIED]
    ])}
    ${companyTraining.note ? `<p class="curr-note">${SMR.esc(companyTraining.note)}</p>` : ''}`;
}

function renderNormativa(cur) {
  const normative = cur.normative || [];
  const transition = cur.transition || {};
  if (!normative.length && !cur.sourceOfficial && !transition.plan) return '';
  return `
    <section class="curr-block">
      <h3 class="section-label">Normativa</h3>
      ${normative.length ? `<ul class="curr-list">${normative.map((n) => `<li>${SMR.esc(n)}</li>`).join('')}</ul>` : ''}
      ${cur.sourceOfficial ? `<p class="curr-meta"><strong>Fuente oficial del currículo:</strong> ${SMR.esc(cur.sourceOfficial)}</p>` : ''}
      ${transition.plan ? `<p class="curr-meta"><strong>Plan aplicable:</strong> <span class="mono">${SMR.esc(transition.plan)}</span>${transition.appliesFrom ? ` · <strong>Implantación desde:</strong> ${SMR.esc(transition.appliesFrom)}` : ''}</p>` : ''}
      <p class="curr-meta"><strong>Estado:</strong> <span class="mono">${SMR.esc(cur.status)}</span> · <strong>Versión del currículo:</strong> <span class="mono">${cur.curriculumVersion ? SMR.esc(cur.curriculumVersion) : CURR_NOT_SPECIFIED}</span>${cur.verifiedAt ? ` · <strong>Revisado:</strong> ${SMR.esc(cur.verifiedAt)}` : ''}</p>
      ${transition.note ? `<p class="curr-note">${SMR.esc(transition.note)}</p>` : ''}
    </section>`;
}

function renderSources(cur) {
  const sources = cur.sources || [];
  if (!sources.length) return '';
  return `
    <section class="curr-block">
      <h3 class="section-label">Fuentes oficiales</h3>
      <ul class="link-list">
        ${sources.map((s) => `
          <li>
            <a class="link-row" href="${SMR.esc(s.url)}" target="_blank" rel="noopener noreferrer">
              ${SMR.icon('fileText', 16)}
              <span class="link-row-text">
                <span class="link-row-title">${SMR.esc(s.title)}</span>
                <span class="link-row-desc">${SMR.esc(s.authority)}${s.date ? ` · ${SMR.esc(s.date)}` : ''}</span>
                ${s.supports ? `<span class="link-row-desc">${SMR.esc(s.supports)}</span>` : ''}
                <span class="sr-only">Se abre en una pestaña nueva.</span>
              </span>
              ${SMR.icon('chevronRight', 16)}
            </a>
          </li>`).join('')}
      </ul>
    </section>`;
}

function renderNotes(cur) {
  const notes = cur.notes || [];
  if (!notes.length) return '';
  return `
    <section class="curr-block">
      <h3 class="section-label">Notas y limitaciones</h3>
      <ul class="curr-list">${notes.map((n) => `<li>${SMR.esc(n)}</li>`).join('')}</ul>
    </section>`;
}

function renderCompareCta() {
  return `
    <div class="curr-compare">
      <button type="button" class="btn" disabled title="Comparador entre comunidades: próximamente">Comparar comunidades</button>
      <span class="badge">Próximamente</span>
      <p class="count-note">El comparador entre comunidades aún no está disponible. Esta sección es solo de información y no modifica tu progreso.</p>
    </div>`;
}

function renderCurriculum(cur) {
  const isUnverified = cur.status === 'NOT_VERIFIED';
  const isPartial = cur.status === 'PARTIALLY_VERIFIED';
  const missing = currMissingParts(cur);
  const yearMismatch = currState.year && cur.academicYear !== currState.year;

  return `
    ${renderVerificationStatus(cur)}

    ${yearMismatch ? `<div class="notice curr-alert"><strong>Aviso:</strong> no hay datos verificados para ${SMR.esc(cur.name)} en el curso ${SMR.esc(currState.year)}. La ficha disponible corresponde al curso ${SMR.esc(cur.academicYear)}.</div>` : ''}

    ${isPartial ? `<div class="notice curr-alert curr-alert--warn">
      <strong>Verificación parcial.</strong> Se muestran únicamente los datos verificados de esta ficha; el resto se indica más abajo en «Notas y limitaciones».
    </div>` : ''}

    ${isUnverified ? `
      <section class="curr-block">
        <h3 class="section-label">Qué se ha localizado</h3>
        <ul class="curr-list">
          ${cur.sourceOfficial ? `<li><strong>Documento identificado:</strong> ${SMR.esc(cur.sourceOfficial)}</li>` : ''}
          ${(cur.normative || []).map((n) => `<li>${SMR.esc(n)}</li>`).join('')}
          ${(cur.transition && cur.transition.note) ? `<li>${SMR.esc(cur.transition.note)}</li>` : ''}
          ${!cur.sourceOfficial && !(cur.normative || []).length && !(cur.transition && cur.transition.note) ? '<li>No consta ninguna norma de referencia en esta ficha.</li>' : ''}
        </ul>
      </section>
      <section class="curr-block">
        <h3 class="section-label">Qué falta por verificar</h3>
        <ul class="curr-list">
          ${(missing.length ? missing : ['Los datos curriculares del título']).map((m) => `<li>${SMR.esc(m)}</li>`).join('')}
        </ul>
        <p class="count-note">Mientras no se verifiquen, SMR Hub no muestra un plan de estudios para esta comunidad.</p>
      </section>
    ` : `
      <section class="curr-block">
        <h3 class="section-label">1.º SMR</h3>
        ${renderModuleTable(cur.modules1, `Módulos de 1.º de SMR en ${cur.name}, curso ${cur.academicYear}`)}
      </section>

      <section class="curr-block">
        <h3 class="section-label">2.º SMR</h3>
        ${renderModuleTable(cur.modules2, `Módulos de 2.º de SMR en ${cur.name}, curso ${cur.academicYear}`)}
      </section>

      <section class="curr-block">
        <h3 class="section-label">Módulo profesional optativo</h3>
        ${renderElectives(cur)}
      </section>

      <section class="curr-block">
        <h3 class="section-label">Proyecto intermodular</h3>
        ${renderProject(cur.project)}
      </section>

      <section class="curr-block">
        <h3 class="section-label">Formación en empresa u organismo equiparado</h3>
        ${renderCompanyTraining(cur.companyTraining)}
      </section>

      ${missing.length ? `
        <section class="curr-block">
          <h3 class="section-label">Datos no disponibles en esta ficha</h3>
          <ul class="curr-list">${missing.map((m) => `<li>${SMR.esc(m)}</li>`).join('')}</ul>
        </section>` : ''}
    `}

    ${renderNormativa(cur)}
    ${renderSources(cur)}
    ${renderNotes(cur)}
    ${renderCompareCta()}`;
}

function renderCurriculo(root) {
  const list = curriculumList();

  root.innerHTML = `
    <section class="curr-controls">
      <h2 class="section-label" id="curr-controls-label">Selecciona tu currículo</h2>
      <div class="field-row">
        <div class="field">
          <label class="field-label" for="curr-community">Comunidad autónoma</label>
          <select class="input" id="curr-community" aria-describedby="curr-controls-hint">
            <option value="">Selecciona tu comunidad</option>
            ${list.map((c) => `<option value="${SMR.esc(c.id)}">${SMR.esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="curr-year">Curso académico</label>
          <select class="input" id="curr-year" aria-describedby="curr-controls-hint"${currYears.length ? '' : ' disabled'}>
            ${currYears.map((y) => `<option value="${SMR.esc(y)}">${SMR.esc(y)}</option>`).join('')}
          </select>
        </div>
      </div>
      <p class="count-note" id="curr-controls-hint">Datos tomados de SMR_DATA.curriculums (${list.length} fichas). Cambiar de comunidad solo cambia el currículo mostrado: no toca progreso, tests, recursos ni favoritos.</p>
    </section>
    <div id="curr-result"></div>`;

  const communitySel = root.querySelector('#curr-community');
  const yearSel = root.querySelector('#curr-year');
  const resultEl = root.querySelector('#curr-result');
  communitySel.value = currState.community || '';
  yearSel.value = currState.year || '';

  if (!list.length) {
    resultEl.innerHTML = `
      <div class="empty">
        ${SMR.icon('bookOpen', 30)}
        <p class="empty-title">Sin datos curriculares</p>
        <p class="empty-text">No hay fichas de currículo cargadas en esta versión de SMR Hub.</p>
      </div>`;
    return;
  }

  function apply() {
    const cur = getCurriculumByCommunity(currState.community);
    if (!cur) {
      resultEl.innerHTML = `
        <div class="empty">
          ${SMR.icon('bookOpen', 30)}
          <p class="empty-title">Selecciona tu comunidad</p>
          <p class="empty-text">Elige tu comunidad autónoma o ciudad autónoma para consultar el currículo de SMR del curso ${SMR.esc(currState.year)}.</p>
        </div>`;
      return;
    }
    resultEl.innerHTML = renderCurriculum(cur);
  }

  communitySel.addEventListener('change', () => {
    currState.community = communitySel.value || null;
    SMR.store.set('curriculum', { community: currState.community, year: currState.year });
    SMR.profile.save({ community: currState.community, academicYear: currState.year });
    apply();
  });

  yearSel.addEventListener('change', () => {
    currState.year = yearSel.value;
    SMR.store.set('curriculum', { community: currState.community, year: currState.year });
    SMR.profile.save({ community: currState.community, academicYear: currState.year });
    apply();
  });

  apply();
}

/* ---------- Perfil académico del estudiante (fase 5.5) ----------
   Contexto curricular: comunidad + curso + curso académico.
   NO toca el progreso: smrhub:progress, estadísticas, historial,
   favoritos, SRS y rachas siguen siendo solo del progreso. */

const CURR_STATUS_META = {
  VERIFIED: { label: 'Currículo verificado', icon: 'circleCheck', tone: 'ok' },
  PARTIALLY_VERIFIED: { label: 'Parcialmente verificado', icon: 'clock', tone: 'warn' },
  NOT_VERIFIED: { label: 'No verificado', icon: 'x', tone: 'bad' }
};

const profileCourseLabel = (c) => (c === 1 ? '1.º SMR' : c === 2 ? '2.º SMR' : 'Sin elegir');

/* Resumen corto del perfil, reutilizado en el dashboard y en «Mi SMR». */
function profileSummaryHtml(profile, curriculum) {
  if (!profile) return '';
  const status = curriculum ? (CURR_STATUS_META[curriculum.status] || null) : null;
  // Nombre legible de la comunidad: el de la ficha curricular si existe,
  // si no el de la lista de comunidades. Nunca el slug crudo.
  const found = SMR.profile.communities().find((c) => c.id === profile.community);
  const label = (curriculum && curriculum.name) || (found && found.name) || profile.community;
  return `
    <p class="profile-line">${SMR.icon('target', 14)} <strong>${SMR.esc(label)}</strong> · ${SMR.esc(profileCourseLabel(profile.course))}</p>
    <p class="profile-line muted">${SMR.icon('clock', 14)} ${SMR.esc(profile.academicYear)}${status ? ` · ${SMR.icon(status.icon, 13)} ${SMR.esc(status.label)}` : ''}</p>`;
}

/* ---------- Configuración del perfil (modal) ---------- */

function renderProfileSetup(box) {
  const profile = SMR.profile.read();
  const communities = SMR.profile.communities();
  const years = SMR.profile.academicYears();

  box.innerHTML = `
    <div class="modal-head">
      <h2 class="modal-title">${SMR.icon('target', 16)} Personaliza SMR Hub</h2>
      <button type="button" class="icon-btn modal-close" aria-label="Cerrar">${SMR.icon('x')}</button>
    </div>
    <p class="count-note">Dinos dónde estudias y en qué curso estás. Solo se guarda en tu navegador y no cambia tu progreso.</p>
    <div class="field-row profile-fields">
      <div class="field">
        <label class="field-label" for="pf-community">¿Dónde estudias?</label>
        <select class="input" id="pf-community">
          <option value="">Selecciona tu comunidad</option>
          ${communities.map((c) => `<option value="${SMR.esc(c.id)}"${profile && profile.community === c.id ? ' selected' : ''}>${SMR.esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="pf-course">¿En qué curso estás?</label>
        <select class="input" id="pf-course">
          <option value="">Selecciona tu curso</option>
          <option value="1"${profile && profile.course === 1 ? ' selected' : ''}>1.º SMR</option>
          <option value="2"${profile && profile.course === 2 ? ' selected' : ''}>2.º SMR</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="pf-year">¿Curso académico?</label>
        <select class="input" id="pf-year">
          ${years.map((y) => `<option value="${SMR.esc(y)}"${profile && profile.academicYear === y ? ' selected' : ''}>${SMR.esc(y)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="profile-summary" id="pf-summary" aria-live="polite"></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-primary" id="pf-save" disabled>Continuar</button>
    </div>`;

  const communitySel = box.querySelector('#pf-community');
  const courseSel = box.querySelector('#pf-course');
  const yearSel = box.querySelector('#pf-year');
  const summaryEl = box.querySelector('#pf-summary');
  const saveBtn = box.querySelector('#pf-save');

  function draft() {
    return {
      community: communitySel.value || null,
      course: courseSel.value ? Number(courseSel.value) : null,
      academicYear: yearSel.value || null
    };
  }

  function refresh() {
    const d = draft();
    const ready = Boolean(d.community && d.course && d.academicYear);
    saveBtn.disabled = !ready;
    if (!ready) {
      summaryEl.innerHTML = '<p class="count-note">Completa los tres campos para continuar.</p>';
      return;
    }
    const found = (SMR.profile.curriculums() || []).find((c) => c.id === d.community && c.academicYear === d.academicYear);
    const name = found ? found.name : d.community;
    const st = found ? (CURR_STATUS_META[found.status] || null) : null;
    summaryEl.innerHTML = `
      <p class="section-label">Tu configuración</p>
      <p class="profile-line">${SMR.icon('target', 14)} Comunidad: <strong>${SMR.esc(name)}</strong></p>
      <p class="profile-line">${SMR.icon('layers', 14)} Curso: <strong>${SMR.esc(profileCourseLabel(d.course))}</strong></p>
      <p class="profile-line">${SMR.icon('clock', 14)} Curso académico: <strong>${SMR.esc(d.academicYear)}</strong></p>
      ${st ? `<p class="profile-line">${SMR.icon(st.icon, 14)} Currículo: <strong>${SMR.esc(st.label)}</strong></p>` : ''}`;
  }

  [communitySel, courseSel, yearSel].forEach((el) => el.addEventListener('change', refresh));
  refresh();

  saveBtn.addEventListener('click', () => {
    const saved = SMR.profile.save(draft());
    if (!saved) return;
    SMR.modal.close();
    // Repintar las vistas que derivan del perfil para que reflejen la selección nueva.
    const route = parseHash().id;
    if (route === 'inicio' || route === 'mi-smr' || route === 'curriculo') render();
  });

  box.querySelector('.modal-close').addEventListener('click', SMR.modal.close);
}

function openProfileSetup() {
  SMR.modal.open(renderProfileSetup);
}

function maybeAskProfileSetup() {
  SMR.profile.migrateLegacy();
  if (!SMR.profile.isConfigured()) openProfileSetup();
}

/* ---------- Sección «Mi SMR» ---------- */

function renderMiSMR(root) {
  const profile = SMR.profile.read();
  const curriculum = SMR.getStudentCurriculum();

  if (!profile) {
    root.innerHTML = `
      <div class="empty">
        ${SMR.icon('target', 30)}
        <p class="empty-title">Todavía no tienes perfil académico</p>
        <p class="empty-text">Indica tu comunidad y el curso en el que estás para ver los módulos que te corresponden.</p>
        <div class="empty-actions"><button type="button" class="btn btn-primary" data-edit-profile>Configurar mi perfil</button></div>
      </div>`;
    root.querySelector('[data-edit-profile]').addEventListener('click', openProfileSetup);
    return;
  }

  const course = profile.course;
  const modules = course ? SMR.getStudentModules(course) : [];
  const status = curriculum ? (CURR_STATUS_META[curriculum.status] || null) : null;

  let bodyHtml = '';
  if (!course) {
    bodyHtml = '<div class="notice">Selecciona tu curso para ver los módulos que te corresponden.</div>';
  } else if (!curriculum) {
    bodyHtml = '<p class="curr-empty-line">No hay una ficha curricular para tu comunidad y curso académico.</p>';
  } else if (!modules.length) {
    bodyHtml = `
      <div class="notice curr-alert">
        <strong>Este currículo todavía no está completamente verificado.</strong>
        SMR Hub no publica una distribución de módulos mientras no esté comprobada, para no mostrarte datos que puedan no corresponder a tu plan.
      </div>`;
  } else {
    bodyHtml = renderModuleTable(modules, `Módulos de ${course}.º SMR de ${curriculum.name}, curso ${curriculum.academicYear}`);
  }

  root.innerHTML = `
    <section class="curr-controls profile-card">
      <div class="profile-card-head">
        <div>
          <p class="section-label">Tu perfil académico</p>
          ${profileSummaryHtml(profile, curriculum)}
        </div>
        <div class="profile-card-actions">
          <button type="button" class="btn" data-edit-profile>Editar perfil académico</button>
          <a class="btn btn-primary" href="#/curriculo">Ver currículo</a>
        </div>
      </div>
      ${status && curriculum && curriculum.status === 'PARTIALLY_VERIFIED' ? `<div class="notice curr-alert curr-alert--warn"><strong>Verificación parcial.</strong> Se muestran solo los datos comprobados; las limitaciones están en la ficha del currículo.</div>` : ''}
    </section>

    ${curriculum && curriculum.status === 'NOT_VERIFIED' ? `
      <section class="curr-block">
        <h3 class="section-label">Fuentes oficiales</h3>
        <ul class="link-list">
          ${(curriculum.sources || []).map((s) => `<li><a class="link-row" href="${SMR.esc(s.url)}" target="_blank" rel="noopener noreferrer">
            ${SMR.icon('fileText', 16)}
            <span class="link-row-text">
              <span class="link-row-title">${SMR.esc(s.title)}</span>
              <span class="link-row-desc">${SMR.esc(s.authority)}${s.date ? ` · ${SMR.esc(s.date)}` : ''}</span>
              <span class="sr-only">Se abre en una pestaña nueva.</span>
            </span>
            ${SMR.icon('chevronRight', 16)}
          </a></li>`).join('')}
        </ul>
      </section>` : ''}

    <section class="curr-block">
      <h3 class="section-label">${course ? `Módulos de ${course}.º SMR` : 'Módulos'}</h3>
      ${bodyHtml}
    </section>

    <div class="curr-compare">
      <p class="count-note">Cambiar tu perfil no modifica tu progreso, tus tests, tus favoritos ni tu racha.</p>
    </div>`;

  root.querySelectorAll('[data-edit-profile]').forEach((btn) => btn.addEventListener('click', openProfileSetup));
}

/* ---------- Página de configuración ---------- */

function renderSettings(root) {
  const s = SMR.settings;
  const themeValue = effectiveTheme();

  root.innerHTML = `
    <section class="settings-group" aria-labelledby="settings-appearance">
      <h3 class="section-label" id="settings-appearance">Apariencia</h3>
      <div class="option-row">
        <div>
          <p class="option-label">Tema</p>
          <p class="option-hint">Claro u oscuro. Si no eliges uno, se usa la preferencia del sistema.</p>
        </div>
        <div class="segmented" role="group" aria-label="Tema">
          <button type="button" data-theme-opt="light" class="${themeValue === 'light' ? 'active' : ''}">Claro</button>
          <button type="button" data-theme-opt="dark" class="${themeValue === 'dark' ? 'active' : ''}">Oscuro</button>
        </div>
      </div>
      <div class="option-row">
        <div>
          <p class="option-label">Tamaño de texto</p>
          <p class="option-hint">Escala base de toda la interfaz.</p>
        </div>
        <select class="input" id="setting-text-size" aria-label="Tamaño de texto">
          <option value="sm">Pequeño</option>
          <option value="md">Normal</option>
          <option value="lg">Grande</option>
          <option value="xl">Muy grande</option>
        </select>
      </div>
      <div class="option-row">
        <div>
          <p class="option-label">Animaciones</p>
          <p class="option-hint">Transiciones cortas al abrir el menú y en los controles.</p>
        </div>
        <input type="checkbox" class="switch" id="setting-animations" aria-label="Activar animaciones">
      </div>
    </section>
    <section class="settings-group" aria-labelledby="settings-reset">
      <h3 class="section-label" id="settings-reset">Restablecer</h3>
      <div class="option-row">
        <div>
          <p class="option-label">Restablecer configuración</p>
          <p class="option-hint">Borra las preferencias guardadas y vuelve a los valores predeterminados.</p>
        </div>
        <button type="button" class="btn" id="setting-reset">Restablecer</button>
      </div>
      <div class="option-row">
        <div>
          <p class="option-label">Borrar progreso de estudio</p>
          <p class="option-hint">Elimina completados, autoevaluaciones, historial de tests y actividad. Las preferencias se conservan.</p>
        </div>
        <button type="button" class="btn" id="setting-clear-progress">Borrar progreso</button>
      </div>
    </section>`;

  const sizeSelect = $('#setting-text-size', root);
  const animCheck = $('#setting-animations', root);
  sizeSelect.value = s.textSize || 'md';
  animCheck.checked = !!s.animations;

  root.querySelectorAll('[data-theme-opt]').forEach((btn) => {
    btn.addEventListener('click', () => SMR.setTheme(btn.dataset.themeOpt));
  });

  sizeSelect.addEventListener('change', () => {
    SMR.settings.textSize = sizeSelect.value;
    saveSettings();
    applySettings();
  });

  animCheck.addEventListener('change', () => {
    SMR.settings.animations = animCheck.checked;
    saveSettings();
    applySettings();
  });

  $('#setting-reset', root).addEventListener('click', () => {
    SMR.settings = Object.assign({}, SETTINGS_DEFAULTS);
    SMR.store.remove('settings');
    applySettings();
    updateThemeButton();
    render();
  });

  $('#setting-clear-progress', root).addEventListener('click', () => {
    if (window.confirm('¿Borrar todo tu progreso de estudio? Esta acción no se puede deshacer.')) {
      SMR.progress.clear();
      render();
    }
  });
}

/* ---------- Secciones temáticas (Redes y Sistemas) ---------- */

function renderTopicHub(root, sectionKey) {
  const cat = sectionKey === 'redes' ? 'Redes' : 'Sistemas Operativos';
  const refs = (D.quickRefs && D.quickRefs[sectionKey]) || [];
  const list = D.resources
    .filter((r) => r.category === cat)
    .sort((a, b) => a.title.localeCompare(b.title, 'es'));

  root.innerHTML = `
    <section aria-label="Referencia rápida">
      <h3 class="section-label">Referencia rápida</h3>
      <div class="quick-grid">
        ${refs.map((ref) => `
          <div class="quick-card">
            <p class="quick-key">${SMR.esc(ref[0])}</p>
            <p class="quick-val">${SMR.esc(ref[1])}</p>
          </div>`).join('')}
      </div>
    </section>
    <section aria-label="Recursos de la sección">
      <h3 class="section-label">Recursos de la sección</h3>
      <ul class="row-list">${list.map(resourceRow).join('')}</ul>
    </section>`;

  const listEl = root.querySelector('.row-list');
  bindFav(listEl);
  listEl.querySelectorAll('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => openResource(btn.dataset.open));
  });
}

function renderRedes(root) { renderTopicHub(root, 'redes'); }

function renderSistemas(root) { renderTopicHub(root, 'sistemas'); }

/* ---------- Modo Estudio ---------- */

const STUDY_DURATIONS = [
  { minutes: 10, label: '10 min', desc: 'Sesión rápida de repaso' },
  { minutes: 20, label: '20 min', desc: 'Sesión equilibrada' },
  { minutes: 30, label: '30 min', desc: 'Sesión completa' },
  { minutes: 0, label: 'Libre', desc: 'Sin límite de tiempo, a tu ritmo' }
];

const studyState = { active: false, steps: [], index: 0, startedAt: 0, minutes: 0 };

/* Construye la sesión: alterna explicación → recurso/pregunta → práctica → resumen */
function buildStudyPlan(minutes) {
  const p = SMR.progress.data;
  const plan = [];
  const usedRes = new Set();
  const usedQ = [];

  /* Temas prioritarios: falladas → autoevaluación baja → pendientes */
  const focusResources = [];
  wrongResourceIds().forEach((id) => {
    if (!focusResources.includes(id)) focusResources.push(id);
  });
  D.resources.forEach((r) => {
    const sa = SMR.progress.selfAssessment(r.id);
    if (sa === 0 || sa === 1) focusResources.push(r.id);
  });
  D.resources
    .filter((r) => !SMR.progress.isCompleted(r.id) && !focusResources.includes(r.id))
    .sort((a, b) => (p.resources.viewed[a.id] || 0) - (p.resources.viewed[b.id] || 0))
    .forEach((r) => focusResources.push(r.id));

  const pick = () => {
    while (focusResources.length) {
      const id = focusResources.shift();
      if (!usedRes.has(id)) { usedRes.add(id); return D.resources.find((r) => r.id === id) || null; }
    }
    const rest = D.resources.filter((r) => !usedRes.has(r.id));
    return rest.length ? rest[Math.floor(Math.random() * rest.length)] : null;
  };

  /* Bloques de estudio según minutos disponibles (~4 min por bloque) */
  const blockCount = minutes === 0 ? 5 : Math.max(2, Math.min(7, Math.round(minutes / 5)));

  for (let i = 0; i < blockCount; i++) {
    const r = pick();
    if (!r) break;

    /* Explicación: mini-lección o primeros puntos del contenido */
    const lesson = r.lesson || {};
    const keyPoints = lesson.keyPoints && lesson.keyPoints.length
      ? lesson.keyPoints.slice(0, 3)
      : (r.content || []).slice(0, 3);

    plan.push({
      type: 'explain',
      title: r.title,
      category: r.category,
      resourceId: r.id,
      points: keyPoints,
      summary: lesson.summary || r.desc
    });

    plan.push({
      type: 'question',
      title: 'Pregunta rápida',
      resourceId: r.id
    });
  }

  /* Resumen final */
  plan.push({
    type: 'summary',
    title: 'Resumen de la sesión',
    resources: plan.filter((s) => s.type === 'explain').map((s) => ({ id: s.resourceId, title: s.title }))
  });

  return plan;
}

function studyQuestionHtml(step, done = false) {
  const q = step.question;
  if (!q) {
    return `<p class="empty-text">No hay preguntas disponibles para este bloque.</p>`;
  }
  return `
    <div class="study-question${done ? ' answered' : ''}">
      <p class="quiz-diff">${SMR.esc(q.difficulty || 'Básica')}</p>
      <h4 class="quiz-q">${SMR.esc(q.q)}</h4>
      <div class="quiz-options">
        ${q.options.map((opt, i) => `
          <button type="button" class="quiz-option${done ? (i === q.correct ? ' correct' : (i === step.chosen && !step.ok ? ' wrong' : '')) : ''}"
                  data-opt="${i}" ${done ? 'disabled' : ''}>
            <span class="opt-letter mono">${String.fromCharCode(97 + i)})</span> ${SMR.esc(opt)}
          </button>`).join('')}
      </div>
      ${done ? `<div class="quiz-explain ${step.ok ? 'ok' : 'bad'}" aria-live="polite">
        <strong>${step.ok ? 'Correcto.' : 'Incorrecto.'}</strong> ${SMR.esc(q.explain || '')}
      </div>` : `<div class="quiz-explain" data-explain hidden aria-live="polite"></div>`}
    </div>`;
}

/* ---------- Render del Modo Estudio ---------- */

function renderEstudio(root) {
  if (studyState.active) {
    renderStudyStep(root);
    return;
  }
  renderStudySetup(root);
}

function renderStudySetup(root) {
  const wrong = SMR.progress.wrongCount();
  const sessions = (SMR.progress.data.studySessions || []).slice(-3).reverse();

  root.innerHTML = `
    <p class="count-note">El Modo Estudio genera una sesión guiada con lo que más te conviene: primero tus fallos,
      luego temas marcados como «todavía no» y recursos pendientes. Cada bloque alterna explicación, recurso y pregunta.</p>
    ${wrong ? `
      <section class="panel error-review" aria-label="Fallos pendientes">
        <div>
          <p class="section-label">${SMR.icon('target', 13)} Tienes ${wrong} ${wrong === 1 ? 'pregunta fallada' : 'preguntas falladas'}</p>
          <p class="error-review-text">La sesión priorizará los temas de esas preguntas.</p>
        </div>
        <a class="btn" href="#/tests?mode=errores">Solo repaso de errores</a>
      </section>` : ''}

    <div class="study-durations" role="group" aria-label="Duración de la sesión">
      ${STUDY_DURATIONS.map((d) => `
        <button type="button" class="study-duration${d.minutes === 20 ? ' recommended' : ''}" data-minutes="${d.minutes}">
          <span class="study-duration-mins mono">${d.label}</span>
          <span class="study-duration-desc">${d.desc}</span>
          ${d.minutes === 20 ? '<span class="badge badge-done">Sugerida</span>' : ''}
        </button>`).join('')}
    </div>

    ${sessions.length ? `
      <section class="panel" aria-label="Últimas sesiones">
        <h3 class="section-label">${SMR.icon('clock', 13)} Tus últimas sesiones</h3>
        <ul class="history-list">
          ${sessions.map((s) => `
            <li class="history-item">
              <span class="history-info">
                <span class="history-title">Sesión de estudio</span>
                <span class="history-meta">${s.steps} pasos · ${timeAgo(s.ts)}</span>
              </span>
              <span class="history-score is-ok">${s.minutes ? `${s.minutes} min` : 'libre'}</span>
            </li>`).join('')}
        </ul>
      </section>` : `
      <div class="empty empty-inline">
        ${SMR.icon('brain', 20)}
        <p class="empty-title">Aún no has hecho ninguna sesión</p>
        <p class="empty-text">Con 10 minutos al día basta para mantener el ritmo. Elige una duración arriba.</p>
      </div>`}`;

  root.querySelectorAll('[data-minutes]').forEach((btn) => {
    btn.addEventListener('click', () => startStudy(Number(btn.dataset.minutes), root));
  });
}

function startStudy(minutes, root) {
  const plan = buildStudyPlan(minutes);
  if (!plan.length) {
    renderStudySetup(root);
    return;
  }
  studyState.active = true;
  studyState.steps = plan;
  studyState.index = 0;
  studyState.startedAt = Date.now();
  studyState.minutes = minutes;
  studyState.usedQ = [];
  studyState.finished = false;
  startStudyClock(root);
  renderStudyStep(root);
}

function startStudyClock(root) {
  stopStudyClock();
  studyState.timerId = window.setInterval(() => {
    const el = document.querySelector('#study-clock');
    if (!el) return;
    const elapsedSec = Math.floor((Date.now() - studyState.startedAt) / 1000);
    if (studyState.minutes > 0) {
      const remaining = studyState.minutes * 60 - elapsedSec;
      if (remaining <= 0) {
        stopStudyClock();
        finishStudy(root, true);
        return;
      }
      el.textContent = `Quedan ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
      el.classList.toggle('is-low', remaining <= 60);
    } else {
      el.textContent = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, '0')} transcurridos`;
    }
  }, 1000);
}

function stopStudyClock() {
  if (studyState.timerId) {
    window.clearInterval(studyState.timerId);
    studyState.timerId = null;
  }
}

function currentStudyStep() {
  return studyState.steps[studyState.index];
}

function renderStudyStep(root) {
  const step = currentStudyStep();
  if (!step) { finishStudy(root, false); return; }

  const total = studyState.steps.length;
  const pct = Math.round((studyState.index / total) * 100);
  const timed = studyState.minutes > 0;

  let body = '';
  if (step.type === 'explain') {
    body = `
      <p class="study-step-tag">${SMR.icon('bookOpen', 13)} Mini lección · ${SMR.esc(step.category)}</p>
      <h3 class="study-step-title">${SMR.esc(step.title)}</h3>
      <ul class="modal-list modal-list-check">${step.points.map((p) => `<li>${SMR.esc(p)}</li>`).join('')}</ul>
      ${step.summary ? `<p class="modal-summary">${SMR.esc(step.summary)}</p>` : ''}
      <div class="quiz-actions">
        <button type="button" class="btn" data-study-open-res="${step.resourceId}">${SMR.icon('book', 14)} Ver recurso completo</button>
        <button type="button" class="btn btn-primary" id="study-continue">Continuar ${SMR.icon('chevronRight', 14)}</button>
      </div>`;
  } else if (step.type === 'question') {
    if (!step.question) {
      step.question = window.SMR_TESTS.studyQuestion({
        resourceId: step.resourceId,
        excludeKeys: studyState.usedQ || []
      });
      if (step.question) studyState.usedQ.push(`${step.question.testId}:${step.question.origIndex}`);
    }
    body = `
      <p class="study-step-tag">${SMR.icon('zap', 13)} Pregunta rápida</p>
      ${studyQuestionHtml(step)}
      <div class="quiz-actions">
        <button type="button" class="btn" data-study-open-res="${step.resourceId}">${SMR.icon('book', 14)} Repasar el tema</button>
        <button type="button" class="btn btn-primary" id="study-continue" hidden>Continuar ${SMR.icon('chevronRight', 14)}</button>
      </div>`;
  } else {
    body = `
      <p class="study-step-tag">${SMR.icon('circleCheck', 13)} Último paso</p>
      <h3 class="study-step-title">${SMR.esc(step.title)}</h3>
      <p class="modal-summary">Has repasado ${step.resources.length} ${step.resources.length === 1 ? 'tema' : 'temas'}.
        Vuelve a abrir cualquiera desde aquí o desde tus estadísticas.</p>
      <div class="tag-row">
        ${step.resources.map((r) => `<button type="button" class="tag" data-study-open-res="${r.id}">${SMR.icon('fileText', 13)} ${SMR.esc(r.title)}</button>`).join('')}
      </div>
      <div class="quiz-actions">
        <button type="button" class="btn btn-primary" id="study-finish">Terminar sesión</button>
      </div>`;
  }

  root.innerHTML = `
    <div class="study-session">
      <div class="quiz-head">
        <button type="button" class="btn btn-sm" id="study-exit">Salir</button>
        <p class="quiz-counter">Paso ${studyState.index + 1} de ${total}</p>
        <p class="quiz-timer mono ${timed ? '' : 'is-free'}" id="study-clock" ${timed ? '' : 'aria-label="Tiempo transcurrido"'}></p>
        <p class="quiz-score">Sesión de ${timed ? `${studyState.minutes} min` : 'ritmo libre'}</p>
      </div>
      <div class="quiz-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Progreso de la sesión">
        <div class="quiz-progress-fill" style="width: ${pct}%"></div>
      </div>
      <section class="panel study-step">${body}</section>
    </div>`;

  startStudyClock(root);
  wireStudyStep(root, step);
}

function wireStudyStep(root, step) {
  root.querySelector('#study-exit').addEventListener('click', () => {
    stopStudyClock();
    studyState.active = false;
    studyState.steps = [];
    renderStudySetup(root);
  });

  const continueBtn = root.querySelector('#study-continue');
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      studyState.index += 1;
      renderStudyStep(root);
    });
  }

  const finishBtn = root.querySelector('#study-finish');
  if (finishBtn) {
    finishBtn.addEventListener('click', () => finishStudy(root, false));
  }

  root.querySelectorAll('[data-study-open-res]').forEach((btn) => {
    btn.addEventListener('click', () => openResource(btn.dataset.studyOpenRes));
  });

  if (step.type === 'question' && step.question) {
    const q = step.question;
    const optionBtns = [...root.querySelectorAll('.quiz-option')];
    optionBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const chosen = Number(btn.dataset.opt);
        const ok = chosen === q.correct;
        step.chosen = chosen;
        step.ok = ok;
        step.answered = true;
        optionBtns.forEach((b) => {
          b.disabled = true;
          const i = Number(b.dataset.opt);
          if (i === q.correct) b.classList.add('correct');
          else if (i === chosen && !ok) b.classList.add('wrong');
        });
        const explain = root.querySelector('[data-explain]');
        if (explain) {
          explain.innerHTML = `<strong>${ok ? 'Correcto.' : 'Incorrecto.'}</strong> ${SMR.esc(q.explain || '')}`;
          explain.className = `quiz-explain ${ok ? 'ok' : 'bad'}`;
          explain.hidden = false;
        }
        const next = root.querySelector('#study-continue');
        if (next) next.hidden = false;
      }, { once: true });
    });
  }
}

function finishStudy(root, auto) {
  stopStudyClock();
  if (studyState.finished) return;
  studyState.finished = true;
  const elapsedMin = Math.max(1, Math.round((Date.now() - studyState.startedAt) / 60000));
  const stepsDone = Math.max(0, studyState.index);
  SMR.progress.recordStudySession(studyState.minutes || elapsedMin, stepsDone);
  studyState.active = false;

  root.innerHTML = `
    <div class="empty">
      ${SMR.icon('circleCheck', 24)}
      <p class="empty-title">Sesión completada${auto ? ' (tiempo agotado)' : ''}</p>
      <p class="empty-text">Has repasado ${stepsDone} pasos en unos ${elapsedMin} minutos. La sesión quedó registrada en tu actividad y suma a tu racha.</p>
      <div class="empty-actions">
        <a class="btn btn-primary" href="#/estudio">Otra sesión</a>
        <a class="btn" href="#/estadisticas">Ver estadísticas</a>
      </div>
    </div>`;
}

/* ---------- Casos prácticos ---------- */

function openCase(caseId) {
  const c = (D.cases || []).find((x) => x.id === caseId);
  if (!c) return;
  const solved = SMR.progress.caseSolved(c.id);
  const chosen = solved ? SMR.progress.data.cases.solved[c.id].option : null;

  SMR.modal.open((box) => {
    box.classList.add('modal-lg');
    box.innerHTML = `
      <div class="modal-head">
        <div>
          <h3 class="modal-title">${SMR.esc(c.title)}</h3>
          <p class="modal-meta"><span class="badge">Caso práctico</span>${solved ? '<span class="badge badge-done">Resuelto</span>' : ''}</p>
        </div>
        <button type="button" class="icon-btn modal-close" aria-label="Cerrar">${SMR.icon('x')}</button>
      </div>
      <p class="modal-desc">${SMR.esc(c.intro)}</p>
      <ul class="modal-list">${(c.situation || []).map((s) => `<li>${SMR.esc(s)}</li>`).join('')}</ul>

      <h4 class="modal-sub">¿Qué solución eliges?</h4>
      <div class="case-options">
        ${(c.options || []).map((o) => `
          <button type="button" class="case-option${chosen === o.id ? (o.id === c.correct ? ' correct' : ' wrong') : ''}"
                  data-case-opt="${o.id}" ${solved ? 'disabled' : ''}>
            <span class="case-letter mono">${String.fromCharCode(97 + (c.options || []).indexOf(o))})</span>
            <span>${SMR.esc(o.text)}</span>
          </button>`).join('')}
      </div>
      <div class="case-feedback" data-case-feedback hidden aria-live="polite"></div>
      ${solved ? `
        <div class="modal-example">
          <p><strong>Solución explicada</strong> (elegiste ${esc(chosen)}):</p>
          <p>${SMR.esc(c.solution)}</p>
        </div>` : ''}`;

    box.querySelector('.modal-close').addEventListener('click', SMR.modal.close);

    box.querySelectorAll('[data-case-opt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const optId = btn.dataset.caseOpt;
        const option = (c.options || []).find((o) => o.id === optId);
        if (!option) return;
        const isRight = optId === c.correct;
        SMR.progress.solveCase(c.id, optId);
        box.querySelectorAll('.case-option').forEach((b) => {
          b.disabled = true;
          const id = b.dataset.caseOpt;
          if (id === c.correct) b.classList.add('correct');
          else if (id === optId && !isRight) b.classList.add('wrong');
        });
        const fb = box.querySelector('[data-case-feedback]');
        fb.innerHTML = `
          <div class="quiz-explain ${isRight ? 'ok' : 'bad'}">
            <strong>${isRight ? 'Buena decisión.' : 'No es la mejor opción.'}</strong> ${SMR.esc(option.why || '')}
          </div>
          <div class="modal-example case-solution">
            <p><strong>Solución explicada:</strong></p>
            <p>${SMR.esc(c.solution)}</p>
          </div>`;
        fb.hidden = false;
      });
    });
  });
}

function renderCasos(root) {
  const cases = D.cases || [];
  if (!cases.length) {
    root.innerHTML = `
      <div class="empty">
        ${SMR.icon('layers', 22)}
        <p class="empty-title">Todavía no hay casos disponibles</p>
        <p class="empty-text">Los casos prácticos proponen escenarios reales para decidir como profesional.</p>
        <div class="empty-actions"><a class="btn btn-primary" href="#/recursos">Estudiar recursos</a></div>
      </div>`;
    return;
  }
  const solvedCount = cases.filter((c) => SMR.progress.caseSolved(c.id)).length;

  root.innerHTML = `
    <p class="count-note">${cases.length} casos · ${solvedCount} resueltos · cada caso te pide una decisión de diseño o diagnóstico y te devuelve la solución explicada</p>
    <ul class="row-list">
      ${cases.map((c) => `
        <li class="row-item">
          <div class="row-main">
            <div class="row-top">
              <h3 class="row-title">${SMR.esc(c.title)}</h3>
              ${SMR.progress.caseSolved(c.id) ? `<span class="badge badge-done">${SMR.icon('check', 11)} Resuelto</span>` : ''}
            </div>
            <p class="row-desc">${SMR.esc(c.intro)}</p>
          </div>
          <div class="row-actions">
            <button type="button" class="btn btn-sm" data-open-case="${c.id}">${SMR.progress.caseSolved(c.id) ? 'Revisar' : 'Resolver'}</button>
          </div>
        </li>`).join('')}
    </ul>`;

  root.querySelectorAll('[data-open-case]').forEach((btn) => {
    btn.addEventListener('click', () => openCase(btn.dataset.openCase));
  });
}

/* ---------- ¿Qué estudiar después? (rutas de aprendizaje) ---------- */

function renderMapa(root) {
  const paths = D.learningPaths || [];
  if (!paths.length) {
    root.innerHTML = `
      <div class="empty">
        ${SMR.icon('compass', 22)}
        <p class="empty-title">No hay rutas disponibles</p>
        <p class="empty-text">Las rutas muestran qué conceptos dependen de otros y sugieren el orden de estudio.</p>
      </div>`;
    return;
  }

  root.innerHTML = `
    <p class="count-note">Cada ruta ordena los recursos de un módulo como una secuencia: mejor dominar cada peldaño antes de subir al siguiente.</p>
    ${paths.map((p) => {
      const steps = (p.steps || []).map((id) => D.resources.find((r) => r.id === id)).filter(Boolean);
      if (!steps.length) return '';
      const doneCount = steps.filter((r) => SMR.progress.isCompleted(r.id)).length;
      const pct = Math.round((doneCount / steps.length) * 100);
      return `
        <section class="panel learning-path" aria-label="${SMR.esc(p.title)}">
          <div class="path-head">
            <div>
              <h3 class="section-label">${SMR.icon('compass', 13)} ${SMR.esc(p.title)} · ${SMR.esc(p.category)}</h3>
              <p class="count-note">${SMR.esc(p.desc)}</p>
            </div>
            <span class="badge${pct === 100 ? ' badge-done' : ''}">${doneCount}/${steps.length} completados</span>
          </div>
          ${progressBar(pct)}
          <ol class="path-steps">
            ${steps.map((r, i) => {
              const done = SMR.progress.isCompleted(r.id);
              const viewed = SMR.progress.data.resources.viewed[r.id];
              const state = done ? 'done' : (viewed ? 'started' : 'todo');
              return `
                <li class="path-step ${state}">
                  <span class="path-num mono" aria-hidden="true">${done ? SMR.icon('check', 12) : i + 1}</span>
                  <div class="path-body">
                    <button type="button" class="path-title" data-open-res="${r.id}">${SMR.esc(r.title)}</button>
                    <p class="path-meta">${SMR.esc(r.category)} · ${SMR.esc(r.level)}${r.minutes ? ` · ${r.minutes} min` : ''}
                      ${state === 'done' ? ' · completado' : (state === 'started' ? ' · empezado' : '')}</p>
                  </div>
                  ${i < steps.length - 1 ? `<span class="path-arrow" aria-hidden="true">↓</span>` : ''}
                </li>`;
            }).join('')}
          </ol>
        </section>`;
    }).join('')}`;

  root.querySelectorAll('[data-open-res]').forEach((btn) => {
    btn.addEventListener('click', () => openResource(btn.dataset.openRes));
  });
}

/* ---------- Página de estadísticas ---------- */

const MODE_LABELS = {
  practica: 'Práctica',
  rapido: 'Rápido',
  examen: 'Examen',
  completo: 'Completo',
  errores: 'Repaso de errores'
};

const modeLabel = (mode) => MODE_LABELS[mode] || 'Práctica';

function statCard(value, label, hint = '') {
  return `<div class="stat-card">
    <p class="stat-card-value">${SMR.esc(value)}</p>
    <p class="stat-card-label">${SMR.esc(label)}</p>
    ${hint ? `<p class="stat-card-hint">${SMR.esc(hint)}</p>` : ''}
  </div>`;
}

/* Mini gráfico SVG de los últimos tests (sin librerías) */
function sparkline(values) {
  if (!values || values.length < 2) return '';
  const w = 220;
  const h = 44;
  const max = 100;
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`);
  const last = values[values.length - 1];
  return `
    <figure class="sparkline" aria-label="Evolución de tus últimos ${values.length} tests">
      <svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true">
        <polyline fill="none" stroke="currentColor" stroke-width="2" points="${points.join(' ')}"/>
        <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="3" fill="currentColor"/>
      </svg>
      <figcaption class="count-note">Últimos ${values.length} tests · última puntuación ${last}%</figcaption>
    </figure>`;
}

function renderEstadisticas(root) {
  const g = SMR.progress.globalStats();

  if (!g.viewed && !g.testsDone && !g.done) {
    root.innerHTML = `
      <div class="empty">
        ${SMR.icon('chart', 22)}
        <p class="empty-title">Todavía no hay datos que mostrar</p>
        <p class="empty-text">Estudia un recurso o completa un test y tus estadísticas aparecerán aquí. Todo se guarda en este navegador.</p>
        <div class="empty-actions">
          <a class="btn btn-primary" href="#/estudio">Probar el modo estudio</a>
          <a class="btn" href="#/recursos">Explorar recursos</a>
        </div>
      </div>`;
    return;
  }

  const cats = SMR.progress.categoryStats().filter((c) => c.total > 0);
  const byPct = [...cats].sort((a, b) => b.pct - a.pct);
  const most = byPct[0];
  const least = byPct[byPct.length - 1];
  const history = [...SMR.progress.data.tests.history].reverse().slice(0, 10);
  const testCat = {};
  (D.tests || []).forEach((t) => { testCat[t.id] = t.category; });
  const lastByTest = {};
  SMR.progress.data.tests.history.forEach((h) => { lastByTest[h.testId] = h; });

  const wrongItems = SMR.progress.wrongRefs().slice(0, 12).map((ref) => {
    const test = D.tests.find((t) => t.id === ref.testId);
    const q = test ? test.questions[ref.qIndex] : null;
    return q ? { testTitle: test.title, question: q.q, count: ref.count } : null;
  }).filter(Boolean);

  const studyMin = SMR.progress.studyMinutes();
  const dueSrs = SMR.progress.dueCount();
  const scheduledSrs = SMR.progress.upcomingSrsCount();

  root.innerHTML = `
    <div class="stat-cards">
      ${statCard(`${g.done}/${g.total}`, 'Recursos completados', `${g.pct}% del total`)}
      ${statCard(String(g.testsDone), 'Tests realizados', g.testsDone === 1 ? '1 intento' : `${g.testsDone} intentos`)}
      ${statCard(g.best === null ? '—' : `${g.best}%`, 'Mejor puntuación')}
      ${statCard(g.avg === null ? '—' : `${g.avg}%`, 'Puntuación media')}
      ${statCard(String(g.streak), g.streak === 1 ? 'Día de racha' : 'Días de racha')}
      ${statCard(String(g.wrong), 'Preguntas falladas')}
      ${statCard(String(dueSrs), 'Repasos vencidos', scheduledSrs ? `${scheduledSrs} programados` : 'sin programar')}
      ${statCard(`${Math.floor(studyMin / 60)}h ${studyMin % 60}m`, 'Tiempo de estudio', 'sesiones guiadas')}
    </div>

    <section class="panel" aria-labelledby="stats-cats">
      <h3 class="section-label" id="stats-cats">${SMR.icon('chart', 13)} Progreso por categoría</h3>
      <ul class="cat-bars">
        ${cats.map((c) => {
          const testId = Object.keys(testCat).find((id) => testCat[id] === c.cat);
          const last = testId && lastByTest[testId];
          return `
            <li class="cat-bar">
              <span class="cat-bar-name">${SMR.esc(c.cat)}</span>
              <span class="cat-bar-track">${progressBar(c.pct)}</span>
              <span class="cat-bar-value">${c.done}/${c.total}</span>
              ${last ? `<span class="cat-bar-test" title="Último test de la categoría: ${last.pct}%">${last.pct}% test</span>` : ''}
            </li>`;
        }).join('')}
      </ul>
      <p class="count-note">${most && least
        ? `Categoría con más avance: ${SMR.esc(most.cat)} (${most.pct}%). Con menos: ${SMR.esc(least.cat)} (${least.pct}%).`
        : ''}</p>
    </section>

    <section class="panel" aria-labelledby="stats-mastery">
      <h3 class="section-label" id="stats-mastery">${SMR.icon('target', 13)} Maestría por módulo</h3>
      <p class="count-note">Combina recursos completados, tu autoevaluación («¿Has entendido este tema?»), aciertos ponderados por dificultad y errores abiertos. No es solo «haber abierto la página».</p>
      <ul class="cat-bars">
        ${(D.categories || []).filter((cat) => D.resources.some((r) => r.category === cat)).map((cat) => {
          const m = SMR.progress.masteryFor(cat);
          const level = m >= 90 ? 'Dominado' : (m >= 75 ? 'Casi dominado' : (m >= 50 ? 'En progreso' : (m >= 25 ? 'Inicial' : 'Sin empezar')));
          return `
            <li class="cat-bar">
              <span class="cat-bar-name">${SMR.esc(cat)}</span>
              <span class="cat-bar-track">${progressBar(m)}</span>
              <span class="cat-bar-value" title="${level}">${m}%</span>
            </li>`;
        }).join('')}
      </ul>
    </section>

    <div class="home-grid">
      <section class="panel" aria-labelledby="stats-history">
        <h3 class="section-label" id="stats-history">${SMR.icon('clock', 13)} Historial de tests</h3>
        ${sparkline(history.map((h) => h.pct).reverse())}
        ${history.length ? `
          <ul class="history-list">
            ${history.map((h) => `
              <li class="history-item">
                <span class="history-info">
                  <span class="history-title">${SMR.esc(h.title)}</span>
                  <span class="history-meta">${SMR.esc(modeLabel(h.mode))} · ${timeAgo(h.date)}</span>
                </span>
                <span class="history-score ${h.pct >= 50 ? 'is-ok' : 'is-bad'}">${h.pct}%</span>
              </li>`).join('')}
          </ul>` : `
          <div class="empty empty-inline">
            ${SMR.icon('clipboard', 20)}
            <p class="empty-title">Sin tests realizados</p>
            <p class="empty-text">Completa un test para ver aquí tu historial.</p>
            <a class="btn" href="#/tests">Ir a tests</a>
          </div>`}
      </section>

      <section class="panel" aria-labelledby="stats-wrong">
        <h3 class="section-label" id="stats-wrong">${SMR.icon('target', 13)} Preguntas para repasar</h3>
        ${wrongItems.length ? `
          <ul class="wrong-list">
            ${wrongItems.map((w) => `
              <li class="wrong-item">
                <p class="wrong-q">${SMR.esc(w.question)}</p>
                <p class="wrong-meta">${SMR.esc(w.testTitle)}${w.count > 1 ? ` · fallada ${w.count} veces` : ''}</p>
              </li>`).join('')}
          </ul>
          <div class="quiz-actions">
            <a class="btn btn-primary" href="#/tests?mode=errores">Repasar errores</a>
          </div>` : `
          <div class="empty empty-inline">
            ${SMR.icon('circleCheck', 20)}
            <p class="empty-title">Sin preguntas pendientes</p>
            <p class="empty-text">Cuando falles una pregunta aparecerá aquí para repasarla.</p>
          </div>`}
      </section>
    </div>`;
}

/* ---------- Rutas ---------- */

const ROUTES = {
  inicio: {
    title: 'Inicio',
    desc: 'Tu panel de estudio de Sistemas Microinformáticos y Redes.',
    icon: 'home',
    render: renderHome
  },
  estudio: {
    title: 'Modo estudio',
    desc: 'Sesiones guiadas de 10, 20 o 30 minutos, o libres, con lo que más te conviene repasar.',
    icon: 'brain',
    render: renderEstudio
  },
  recursos: {
    title: 'Recursos',
    desc: 'Materiales de estudio organizados por módulos del ciclo.',
    icon: 'book',
    render: renderRecursos
  },
  redes: {
    title: 'Redes',
    desc: 'Modelos de referencia, direccionamiento IP y servicios de red.',
    icon: 'network',
    render: renderRedes
  },
  sistemas: {
    title: 'Sistemas',
    desc: 'Sistemas operativos, archivos, procesos, servicios y comandos.',
    icon: 'cpu',
    render: renderSistemas
  },
  herramientas: {
    title: 'Herramientas',
    desc: 'Calculadoras y conversores de uso frecuente.',
    icon: 'wrench',
    render: (root) => window.SMR_TOOLS.render(root)
  },
  tests: {
    title: 'Tests',
    desc: 'Cuestionarios de autoevaluación por módulo.',
    icon: 'clipboard',
    render: (root) => window.SMR_TESTS.render(root)
  },
  glosario: {
    title: 'Glosario',
    desc: 'Definiciones de los términos técnicos del ciclo.',
    icon: 'bookOpen',
    render: renderGlosario
  },
  casos: {
    title: 'Casos prácticos',
    desc: 'Escenarios reales: elige la solución y compara con la explicación.',
    icon: 'layers',
    render: renderCasos
  },
  mapa: {
    title: '¿Qué estudiar después?',
    desc: 'Rutas de aprendizaje: qué conceptos dependen de otros y por dónde continuar.',
    icon: 'compass',
    render: renderMapa
  },
  estadisticas: {
    title: 'Estadísticas',
    desc: 'Tu progreso, historial de tests y preguntas para repasar.',
    icon: 'chart',
    render: renderEstadisticas
  },
  curriculo: {
    title: 'Mi currículo',
    desc: 'Consulta el plan de estudios de SMR según tu comunidad.',
    icon: 'bookOpen',
    render: renderCurriculo
  },
  'mi-smr': {
    title: 'Mi SMR',
    desc: 'Tu contexto académico: comunidad, curso y módulos que te corresponden.',
    icon: 'target',
    render: renderMiSMR
  },
  configuracion: {
    title: 'Configuración',
    desc: 'Preferencias de la aplicación.',
    icon: 'settings',
    render: renderSettings
  }
};

/* FASE 7: navegacion agrupada por areas. Mismas rutas, mas jerarquia. */
const NAV_GROUPS = [
  { label: 'Personal', items: ['inicio', 'mi-smr'] },
  { label: 'Estudio', items: ['estudio', 'tests'] },
  { label: 'Contenido', items: ['recursos', 'redes', 'sistemas', 'casos', 'glosario', 'mapa'] },
  { label: 'Curriculo', items: ['curriculo'] },
  { label: 'Herramientas', items: ['herramientas', 'estadisticas'] }
];
const NAV_FOOTER = ['configuracion'];

/* ---------- Navegación lateral ---------- */

function buildNav() {
  const makeItem = (id) => {
    const route = ROUTES[id];
    const li = document.createElement('li');
    li.innerHTML =
      `<a class="nav-link" href="#/${id}" data-route="${id}">` +
      `${SMR.icon(route.icon)}<span>${route.title}</span></a>`;
    return li;
  };
  /* FASE 7: un grupo por area + su lista de enlaces (mismo router). */
  const frag = document.createDocumentFragment();
  NAV_GROUPS.forEach((group) => {
    const p = document.createElement('p');
    p.className = 'nav-group';
    p.textContent = group.label;
    frag.appendChild(p);
    const ul = document.createElement('ul');
    ul.replaceChildren(...group.items.map(makeItem));
    frag.appendChild(ul);
  });
  dom.navList.replaceChildren(frag);
  dom.navFooter.replaceChildren(...NAV_FOOTER.map(makeItem));
}

function setActiveNav(id) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    const active = link.dataset.route === id;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  setActiveMobileNav(id);
}

/* ---------- Fase 5.6: navegación inferior en móvil ----------
   Solo presentación: replica las rutas del sidebar y el botón «Más»
   abre el drawer existente. No cambia el router ni el estado. */

const MOBILE_NAV = ['inicio', 'mi-smr', 'tests', 'recursos'];

function buildMobileNav() {
  const el = document.getElementById('mobile-nav');
  if (!el) return;

  const item = (id, label) => {
    const route = ROUTES[id];
    return `<a class="mobile-nav-link" href="#/${id}" data-route="${id}">` +
      `${SMR.icon(route.icon, 20)}<span>${SMR.esc(label)}</span></a>`;
  };

  el.innerHTML =
    MOBILE_NAV.map((id) => item(id, ROUTES[id].title)).join('') +
    `<button type="button" class="mobile-nav-more" aria-label="Más secciones" aria-haspopup="true">` +
    `${SMR.icon('menu', 20)}<span>Más</span></button>`;

  const more = el.querySelector('.mobile-nav-more');
  if (more) more.addEventListener('click', openDrawer);
}

function setActiveMobileNav(id) {
  document.querySelectorAll('.mobile-nav-link').forEach((link) => {
    const active = link.dataset.route === id;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

/* ---------- Router por hash (con consulta opcional: #/recursos?q=...) ---------- */

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  return {
    id: path ? path.split('/')[0].toLowerCase() : 'inicio',
    query: new URLSearchParams(query || '')
  };
}

function currentRouteId() {
  const { id } = parseHash();
  return Object.prototype.hasOwnProperty.call(ROUTES, id) ? id : null;
}

function render() {
  const { id, query } = parseHash();
  if (!currentRouteId()) {
    location.replace('#/inicio');
    return;
  }
  SMR.activeQuery = query;
  const route = ROUTES[id];
  setActiveNav(id);
  dom.pageTitle.textContent = route.title;
  dom.pageDesc.textContent = route.desc;
  document.title = `${route.title} · SMR Hub`;
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', route.desc);
  dom.content.replaceChildren();
  if (window.SMR_TESTS && typeof window.SMR_TESTS.stop === 'function') window.SMR_TESTS.stop();
  stopStudyClock();
  studyState.active = false;
  route.render(dom.content);
  SMR.activeQuery = new URLSearchParams(); // la consulta se consume al renderizar
  closeDrawer();
  window.scrollTo(0, 0);
}

SMR.navigate = (hash) => {
  /* Si el hash es idéntico al actual no hay hashchange: re-render manual */
  if (location.hash === hash) render();
  else location.hash = hash;
};

/* ---------- Buscador global ---------- */

SMR.searchIndex = [];

SMR.registerSearchEntries = (entries) => {
  SMR.searchIndex.push(...entries);
};

function buildSearchIndex() {
  SMR.searchIndex.length = 0;

  /* Secciones */
  SMR.registerSearchEntries(
    Object.entries(ROUTES).map(([id, route]) => ({
      title: route.title,
      meta: 'Sección',
      group: 'Secciones',
      hash: `#/${id}`,
      text: `${route.title} ${route.desc}`.toLowerCase()
    }))
  );

  /* Recursos (incluye el texto del contenido para búsquedas profundas) */
  SMR.registerSearchEntries(
    D.resources.map((r) => ({
      title: r.title,
      meta: `Recurso · ${r.category}`,
      group: 'Recursos',
      hash: `#/recursos?q=${encodeURIComponent(r.title)}`,
      text: `${r.title} ${r.desc} ${r.category} ${r.level} ${(r.content || []).join(' ')}`.toLowerCase()
    }))
  );

  /* Glosario */
  SMR.registerSearchEntries(
    D.glossary.map((t) => ({
      title: t.term,
      meta: `Glosario · ${t.category || 'General'}`,
      group: 'Glosario',
      hash: `#/glosario?q=${encodeURIComponent(t.term)}`,
      text: `${t.term} ${t.definition}`.toLowerCase()
    }))
  );

  /* Herramientas y tests (sus módulos se registran a sí mismos) */
  if (window.SMR_TOOLS) SMR.registerSearchEntries(window.SMR_TOOLS.searchEntries());
  if (window.SMR_TESTS) SMR.registerSearchEntries(window.SMR_TESTS.searchEntries());
}

function wireSearch() {
  let open = false;
  const closePanel = () => {
    if (!open) return;
    dom.searchPanel.hidden = true;
    open = false;
  };

  dom.searchInput.addEventListener('input', () => {
    const q = dom.searchInput.value.trim().toLowerCase();
    if (!q) {
      closePanel();
      return;
    }
    const hits = SMR.searchIndex
      .filter((e) => SMR.matches(e.text, q))
      .slice(0, 10);

    dom.searchPanel.innerHTML = hits.length
      ? hits.map((e) =>
          `<button type="button" class="search-item" data-hash="${e.hash}">` +
          `<span class="search-item-title">${SMR.esc(e.title)}</span>` +
          `<span class="search-item-meta">${SMR.esc(e.meta)}</span></button>`
        ).join('')
      : `<p class="search-empty">Sin resultados para «${SMR.esc(dom.searchInput.value.trim())}»</p>`;

    dom.searchPanel.hidden = false;
    open = true;
  });

  /* 'click' en lugar de 'mousedown' para que también funcione con teclado (Enter) */
  dom.searchPanel.addEventListener('click', (event) => {
    const item = event.target.closest('.search-item');
    if (!item) return;
    SMR.navigate(item.dataset.hash);
    dom.searchInput.value = '';
    closePanel();
    dom.searchInput.blur();
  });

  dom.searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePanel();
      dom.searchInput.blur();
    }
  });

  document.addEventListener('click', (event) => {
    if (open && !dom.searchWrap.contains(event.target)) closePanel();
  });

  /* Atajo: la tecla "/" sitúa el foco en el buscador */
  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const target = event.target;
      const typing = target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' ||
         target.tagName === 'SELECT' || target.isContentEditable);
      if (!typing) {
        event.preventDefault();
        dom.searchInput.focus();
      }
    }
  });
}

/* ---------- Command palette (Ctrl/Cmd + K) ----------
   Búsqueda global agrupada por tipo, con navegación por teclado. */

const paletteState = { el: null, items: [], index: 0, lastFocus: null, open: false };

function paletteSearch(query) {
  const q = query.trim();
  if (!q) {
    return SMR.searchIndex
      .filter((e) => e.group === 'Secciones' || e.group === 'Herramientas')
      .slice(0, 9);
  }
  const terms = fold(q).toLowerCase().split(/\s+/).filter(Boolean);
  return SMR.searchIndex
    .filter((e) => terms.every((term) => SMR.matches(e.title, term) || SMR.matches(e.text, term)))
    .slice(0, 20);
}

function updatePaletteActive() {
  const state = paletteState;
  state.el.querySelectorAll('.palette-item').forEach((el) => {
    el.classList.toggle('active', Number(el.dataset.i) === state.index);
  });
  const activeEl = state.el.querySelector('.palette-item.active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

function renderPalette() {
  const state = paletteState;
  if (!state.el) return;
  const input = state.el.querySelector('.palette-input');
  const list = state.el.querySelector('.palette-list');
  state.items = paletteSearch(input.value);
  if (state.index >= state.items.length) state.index = 0;

  if (!state.items.length) {
    list.innerHTML = `<p class="palette-empty">Sin resultados para «${SMR.esc(input.value.trim())}». Prueba con otro término.</p>`;
    return;
  }

  /* Agrupa conservando el orden del índice */
  const groups = [];
  state.items.forEach((item, i) => {
    const name = item.group || 'Resultados';
    let bucket = groups.find((g) => g.name === name);
    if (!bucket) { bucket = { name, entries: [] }; groups.push(bucket); }
    bucket.entries.push({ item, i });
  });

  list.innerHTML = groups.map((g) => `
    <div class="palette-group">
      <p class="palette-group-title">${SMR.esc(g.name)}</p>
      ${g.entries.map(({ item, i }) => `
        <button type="button" class="palette-item${i === state.index ? ' active' : ''}" data-i="${i}"
                role="option" aria-selected="${i === state.index}">
          <span class="palette-item-title">${SMR.esc(item.title)}</span>
          <span class="palette-item-meta">${SMR.esc(item.meta || '')}</span>
        </button>`).join('')}
    </div>`).join('');

  list.querySelectorAll('.palette-item').forEach((el) => {
    el.addEventListener('click', () => paletteChoose(Number(el.dataset.i)));
    el.addEventListener('mousemove', () => {
      const idx = Number(el.dataset.i);
      if (idx === state.index) return;
      state.index = idx;
      updatePaletteActive();
    });
  });
}

function movePalette(delta) {
  const state = paletteState;
  if (!state.items.length) return;
  state.index = (state.index + delta + state.items.length) % state.items.length;
  updatePaletteActive();
}

function paletteChoose(index) {
  const item = paletteState.items[index];
  if (!item) return;
  closePalette();
  SMR.navigate(item.hash);
}

function openPalette() {
  if (paletteState.open) return;
  paletteState.lastFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'palette-overlay';
  overlay.innerHTML = `
    <div class="palette" role="dialog" aria-modal="true" aria-label="Búsqueda global">
      <div class="palette-head">
        <span class="palette-icon" aria-hidden="true">${SMR.icon('search', 16)}</span>
        <input type="search" class="palette-input" id="palette-input"
               placeholder="Buscar recursos, glosario, tests, herramientas…"
               aria-label="Buscar en SMR Hub" autocomplete="off" spellcheck="false"
               role="combobox" aria-expanded="true" aria-controls="palette-list">
        <button type="button" class="icon-btn palette-close" aria-label="Cerrar búsqueda">${SMR.icon('x', 16)}</button>
      </div>
      <div class="palette-list" id="palette-list" role="listbox" aria-label="Resultados"></div>
      <div class="palette-foot">
        <span><kbd class="kbd">↑↓</kbd> navegar</span>
        <span><kbd class="kbd">Enter</kbd> abrir</span>
        <span><kbd class="kbd">Esc</kbd> cerrar</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  paletteState.el = overlay;
  paletteState.open = true;
  paletteState.index = 0;

  const input = overlay.querySelector('.palette-input');
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) closePalette(); });
  overlay.querySelector('.palette-close').addEventListener('click', closePalette);
  input.addEventListener('input', () => { paletteState.index = 0; renderPalette(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); movePalette(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); movePalette(-1); }
    else if (event.key === 'Enter') { event.preventDefault(); paletteChoose(paletteState.index); }
    else if (event.key === 'Escape') { event.preventDefault(); closePalette(); }
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusables = overlay.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  renderPalette();
  input.focus();
}

function closePalette() {
  if (!paletteState.open) return;
  paletteState.el.remove();
  paletteState.el = null;
  paletteState.open = false;
  if (paletteState.lastFocus && typeof paletteState.lastFocus.focus === 'function') {
    paletteState.lastFocus.focus();
  }
}

function wirePalette() {
  dom.paletteBtn.innerHTML = SMR.icon('keyboard', 16);
  dom.paletteBtn.addEventListener('click', openPalette);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      if (paletteState.open) closePalette();
      else openPalette();
    }
  });
  window.addEventListener('hashchange', closePalette);
}

/* ---------- Menú desplegable en pantallas pequeñas ---------- */

function openDrawer() {
  dom.sidebar.classList.add('open');
  dom.scrim.hidden = false;
  requestAnimationFrame(() => dom.scrim.classList.add('show'));
  dom.menuBtn.setAttribute('aria-expanded', 'true');
  dom.menuBtn.setAttribute('aria-label', 'Cerrar menú');
}

function closeDrawer() {
  if (!dom.sidebar.classList.contains('open')) return;
  dom.sidebar.classList.remove('open');
  dom.scrim.classList.remove('show');
  dom.menuBtn.setAttribute('aria-expanded', 'false');
  dom.menuBtn.setAttribute('aria-label', 'Abrir menú');
  window.setTimeout(() => {
    if (!dom.sidebar.classList.contains('open')) dom.scrim.hidden = true;
  }, 200);
}

function wireDrawer() {
  dom.menuBtn.innerHTML = SMR.icon('menu');
  dom.menuBtn.addEventListener('click', () => {
    if (dom.sidebar.classList.contains('open')) closeDrawer();
    else openDrawer();
  });
  dom.scrim.addEventListener('click', closeDrawer);
}

/* ---------- Arranque ---------- */

function init() {
  applySettings();
  buildNav();
  buildMobileNav();
  buildSearchIndex();
  wireSearch();
  wirePalette();
  wireDrawer();

  dom.themeBtn.addEventListener('click', SMR.toggleTheme);
  dom.searchIcon.innerHTML = SMR.icon('search', 15);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && dom.sidebar.classList.contains('open')) {
      closeDrawer();
    }
  });

  /* El enlace "saltar al contenido" no debe chocar con el router de hash */
  $('.skip-link').addEventListener('click', (event) => {
    event.preventDefault();
    dom.content.focus();
  });

  window.addEventListener('hashchange', render);
  window.addEventListener('hashchange', () => { const h = parseHash(); document.title = (ROUTES[h.id] ? ROUTES[h.id].title + ' · ' : '') + 'SMR Hub'; });
  (() => { const h = parseHash(); document.title = (ROUTES[h.id] ? ROUTES[h.id].title + ' · ' : '') + 'SMR Hub'; })();
  updateThemeButton();
  render();

  /* Fase 5.5: contexto académico. Solo se pide si no existe perfil válido. */
  maybeAskProfileSetup();
}

init();

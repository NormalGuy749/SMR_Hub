'use strict';

/* SMR Hub — Perfil académico del estudiante (fase 5.5)
   Contexto curricular: comunidad + curso (1.º/2.º) + curso académico.
   Guarda SOLO la selección del estudiante: nunca copia datos del currículo.
   Es independiente de smrhub:progress (progreso, estadísticas, historial,
   favoritos, SRS y rachas no se tocan ni se leen desde aquí).

   No usa geolocalización: el estudiante elige explícitamente.
   No depende del DOM: se carga antes que app.js y expone window.SMR.profile. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  const D = global.SMR_DATA || {};
  const PREFIX = 'smrhub:';
  const PROFILE_KEY = 'studentProfile';
  const LEGACY_KEY = 'curriculum';
  const COURSES = [1, 2];

  /* ---------- Almacenamiento (usa SMR.store si ya existe; si no, localStorage) ---------- */

  function store() {
    if (SMR.store) return SMR.store;
    let ls = null;
    try { ls = global.localStorage; } catch { ls = null; }
    return {
      get(key, fallback = null) {
        try {
          const raw = ls ? ls.getItem(PREFIX + key) : null;
          return raw === null ? fallback : JSON.parse(raw);
        } catch {
          return fallback;
        }
      },
      set(key, value) {
        try {
          if (ls) ls.setItem(PREFIX + key, JSON.stringify(value));
          return true;
        } catch {
          return false;
        }
      }
    };
  }

  /* ---------- Catálogos derivados de SMR_DATA.curriculums (sin duplicar datos) ---------- */

  function curriculums() {
    return Array.isArray(D.curriculums) ? D.curriculums : [];
  }

  /* Lista ordenada para selectores: alfabética, con las ciudades autónomas al final.
     Es la MISMA lista que usa la sección «Mi currículo», ahora fuente única. */
  const AUTONOMOUS_CITIES = ['ceuta', 'melilla'];

  function sortedCurriculums() {
    return curriculums().slice().sort((a, b) => {
      const cityA = AUTONOMOUS_CITIES.includes(a.id) ? 1 : 0;
      const cityB = AUTONOMOUS_CITIES.includes(b.id) ? 1 : 0;
      if (cityA !== cityB) return cityA - cityB;
      return String(a.name).localeCompare(String(b.name), 'es');
    });
  }

  function communities() {
    return sortedCurriculums().map((c) => ({ id: c.id, name: c.name }));
  }

  /* Años que existen realmente en los currículos: no se inventa ninguno. */
  function academicYears() {
    return [...new Set(curriculums().map((c) => c.academicYear).filter(Boolean))]
      .sort()
      .reverse();
  }

  /* ---------- Sanitización: localStorage puede estar vacío, corrupto o editado a mano ---------- */

  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const list = curriculums();
    const community = list.some((c) => c.id === raw.community) ? raw.community : null;
    const years = academicYears();
    const academicYear = years.includes(raw.academicYear) ? raw.academicYear : (years[0] || null);
    const course = COURSES.includes(raw.course) ? raw.course : null;
    if (!community || !academicYear) return null;
    const curriculum = list.find((c) => c.id === community && c.academicYear === academicYear) || null;
    return {
      community,
      course,
      academicYear,
      curriculumId: curriculum ? curriculum.id : null,
      setupCompleted: Boolean(community && course && academicYear)
    };
  }

  /* ---------- API ---------- */

  function read() {
    return normalize(store().get(PROFILE_KEY, null));
  }

  function isConfigured() {
    const p = read();
    return Boolean(p && p.setupCompleted);
  }

  /* Guarda una selección parcial. No toca ninguna otra clave de almacenamiento. */
  function save(partial) {
    const current = read() || {};
    const next = normalize(Object.assign({}, current, partial || {}));
    if (!next) return null;
    store().set(PROFILE_KEY, next);
    return next;
  }

  function clear() {
    store().set(PROFILE_KEY, null);
  }

  /* Compatibilidad: si el estudiante ya usaba «Mi currículo» (smrhub:curriculum)
     y no tiene perfil, se arrastra comunidad y año. NO se borra la clave antigua
     y NO se inventa el curso: queda pendiente de elegir. */
  function migrateLegacy() {
    if (isConfigured()) return read();
    const legacy = store().get(LEGACY_KEY, null);
    if (!legacy || typeof legacy !== 'object') return read();
    const seeded = normalize({
      community: legacy.community,
      academicYear: legacy.academicYear,
      course: null
    });
    if (!seeded) return read();
    seeded.setupCompleted = false;
    store().set(PROFILE_KEY, seeded);
    return seeded;
  }

  /* Currículo aplicable = community + academicYear (nunca solo el código de módulo). */
  function getCurriculum(profile) {
    const p = profile ? normalize(profile) : read();
    if (!p) return null;
    return (
      curriculums().find((c) => c.id === p.community && c.academicYear === p.academicYear) || null
    );
  }

  /* Módulos del curso pedido dentro del currículo del estudiante.
     Cada módulo se devuelve como copia anotada con el contexto
     (curriculumId + community + course + academicYear) para que las fases
     siguientes puedan usar IDs estables sin volver a mirar el código suelto. */
  function getModules(course, profile) {
    const p = profile ? normalize(profile) : read();
    if (!p) return [];
    const target = COURSES.includes(course) ? course : p.course;
    if (!target) return [];
    const curriculum = getCurriculum(p);
    if (!curriculum) return [];
    const list = target === 1 ? curriculum.modules1 : curriculum.modules2;
    if (!Array.isArray(list)) return [];
    return list
      .filter((m) => m && m.code && m.name)
      .map((m) => ({
        code: m.code,
        name: m.name,
        hours: typeof m.hours === 'number' ? m.hours : null,
        weeklyHours: typeof m.weeklyHours === 'number' ? m.weeklyHours : null,
        curriculumId: curriculum.id,
        community: curriculum.community,
        course: target,
        academicYear: curriculum.academicYear
      }));
  }

  const profile = {
    KEYS: { profile: PROFILE_KEY, legacy: LEGACY_KEY },
    COURSES,
    store,
    curriculums,
    sortedCurriculums,
    communities,
    academicYears,
    read,
    isConfigured,
    save,
    clear,
    migrateLegacy,
    getCurriculum,
    getModules
  };

  SMR.profile = profile;

  /* Funciones centralizadas que pide la fase 5.5 */
  SMR.getStudentCurriculum = (p) => getCurriculum(p);
  SMR.getStudentModules = (course, p) => getModules(course, p);
})(typeof window !== 'undefined' ? window : globalThis);
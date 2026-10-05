'use strict';

/* SMR Hub — Índice curricular de módulos (fase 6D.2)
   ------------------------------------------------------------------
   Capa técnica de identidad e índice para SMR_DATA.curriculums.

   Propiedades (diseño aprobado en 6D.1):
   - Determinista y pura: no lee ni escribe localStorage; no toca
     progress, SRS, perfiles ni UI.
   - Los moduleId son identidades DERIVADAS: data.js permanece
     intacto; ningún objeto curricular se muta.
   Reglas de identidad:
   - modules1 → c1 y modules2 → c2: el curso lo fija el CONTENEDOR
     (asturias/canarias omiten el campo course por módulo).
   - electives/project → su propio campo course; si falta o no es
     entero, curso "cx" (no secuenciado; p. ej. 1713 repartido en
     asturias). Evidencia 6D.1: madrid declara dos electivas CMO en
     cursos distintos, así que el contenedor electives NO decide.
   - Electiva code:null → ":opt-" + slug determinista del nombre,
     contextual al currículo (dos currículos con electivas homónimas
     NO colisionan ni se declaran equivalentes).
   - Colisión real → sufijo determinista "-2", "-3"… según orden de
     carga. El doble registro estructural 1713 (modules2 + project)
     NO se corrige: ambas instancias coexisten con identidades
     distintas; el validador lo reporta como warning, no como error. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  const D = global.SMR_DATA || {};

  const INDEX_VERSION = 1;

  /* Slug determinista para electivas sin código. */
  function slug(s) {
    return String(s || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /* Curso canónico según la regla aprobada. Devuelve 1 | 2 | null. */
  function canonicalCourse(kind, m) {
    if (kind === 'modules1') return 1;
    if (kind === 'modules2') return 2;
    return Number.isInteger(m.course) ? m.course : null;
  }

  function courseSegment(cc) {
    return cc === null ? 'cx' : 'c' + cc;
  }

  /* Identidad base SIN desambiguación de colisiones. */
  function baseModuleId(curriculumId, cc, m) {
    const seg = courseSegment(cc);
    if (m.code) return curriculumId + ':' + seg + ':' + m.code;
    return curriculumId + ':' + seg + ':opt-' + slug(m.name);
  }

  /* ---------- Construcción del índice ---------- */

  let INDEX = null;

  function buildIndex() {
    const modules = [];
    const byId = new Map();
    const byCurriculum = new Map();
    const seenBase = new Map(); /* baseId (y sufijos) -> registro */
    const structural = [];
    const buildErrors = [];

    const curriculums = Array.isArray(D.curriculums) ? D.curriculums : [];

    curriculums.forEach((c) => {
      if (!c || typeof c !== 'object' || !c.id || !/^[a-z0-9-]+$/.test(String(c.id))) {
        buildErrors.push({
          code: 'invalid-curriculum-id',
          detail: 'currículo con id ausente o no apto para identidad: ' + JSON.stringify(c && c.id)
        });
        return;
      }
      const bucket = [];
      byCurriculum.set(c.id, bucket);

      const add = (m, kind) => {
        if (!m || typeof m !== 'object') {
          buildErrors.push({ code: 'invalid-module', detail: c.id + ': entrada ' + kind + ' no es un objeto' });
          return;
        }
        const cc = canonicalCourse(kind, m);
        const base = baseModuleId(c.id, cc, m);
        const prev = seenBase.get(base);
        let id = base;
        let collision = null;
        if (prev) {
          /* Colisión real: desambiguación determinista, jamás silenciosa. */
          let n = 2;
          while (seenBase.has(base + '-' + n)) n++;
          id = base + '-' + n;
          collision = { of: prev.moduleId };
          seenBase.set(id, { moduleId: id });
        } else {
          seenBase.set(base, { moduleId: id });
        }
        const reliability = c.status === 'VERIFIED' ? 'CONFIRMED'
          : (c.status === 'PARTIALLY_VERIFIED' ? 'PARTIAL' : 'UNKNOWN');
        const entry = Object.freeze({
          moduleId: id,
          curriculumId: c.id,
          curriculumName: c.name || null,
          course: cc, /* 1 | 2 | null */
          courseSegment: courseSegment(cc),
          courseSource: (kind === 'modules1' || kind === 'modules2')
            ? 'container'
            : (Number.isInteger(m.course) ? 'field' : 'absent'),
          kind, /* modules1 | modules2 | electives | project */
          code: m.code != null ? m.code : null,
          name: m.name != null ? m.name : null,
          hours: Number.isFinite(m.hours) ? m.hours : null,
          weeklyHours: Number.isFinite(m.weeklyHours) ? m.weeklyHours : null,
          collision: collision ? Object.freeze(collision) : null,
          reliability,
          curriculumStatus: c.status || null
        });
        modules.push(entry);
        byId.set(id, entry);
        bucket.push(entry);
      };

      (Array.isArray(c.modules1) ? c.modules1 : []).forEach((m) => add(m, 'modules1'));
      (Array.isArray(c.modules2) ? c.modules2 : []).forEach((m) => add(m, 'modules2'));
      (Array.isArray(c.electives) ? c.electives : []).forEach((m) => add(m, 'electives'));
      if (c.project && typeof c.project === 'object') add(c.project, 'project');
    });

    /* Duplicados estructurales: mismo (curriculumId, code) entre un
       contenedor de módulo y project. Hecho de los datos: aviso, no
       corrección. Se distingue mismo curso (colisión desambiguada con
       sufijo) de curso distinto (c2 vs cx, sin colisión). */
    const byCode = new Map();
    modules.forEach((e) => {
      if (e.code == null) return;
      const key = e.curriculumId + '|' + String(e.code);
      (byCode.get(key) || byCode.set(key, []).get(key)).push(e);
    });
    byCode.forEach((group) => {
      const kinds = group.map((e) => e.kind);
      const hasProject = kinds.includes('project');
      const hasModule = kinds.includes('modules1') || kinds.includes('modules2');
      if (!(hasProject && hasModule)) return;
      const sameSeg = group[0].courseSegment === group[group.length - 1].courseSegment
        && group.every((e) => e.courseSegment === group[0].courseSegment);
      structural.push({
        code: sameSeg ? 'structural-duplicate' : 'structural-duplicate-cross-course',
        moduleIds: group.map((e) => e.moduleId),
        detail: group.map((e) => e.moduleId).join(' ↔ ') + ': mismo módulo registrado en '
          + [...new Set(kinds)].join(' + ')
          + (sameSeg ? ' (desambiguado con sufijo, no se corrige)' : ' (cursos representados distintos, no se corrige)')
      });
    });

    INDEX = Object.freeze({
      version: INDEX_VERSION,
      total: modules.length,
      modules: Object.freeze(modules.slice()),
      byId: byId,
      byCurriculum: byCurriculum,
      structuralDuplicates: Object.freeze(structural),
      buildErrors: Object.freeze(buildErrors)
    });
    return INDEX;
  }

  function ensureIndex() {
    if (!INDEX) buildIndex();
    return INDEX;
  }

  /* ---------- API pública (pequeña y estable) ---------- */

  /* Índice completo. Misma estructura (invariante) en cada llamada.
     Solo lectura para consumidores; no expone funciones de mutación. */
  function curriculumIndex() {
    return ensureIndex();
  }

  /* Módulos de un currículo, en orden de declaración; [] si no existe
     o el currículo no tiene módulos verificados. */
  function getCurriculumModules(curriculumId) {
    return ensureIndex().byCurriculum.get(String(curriculumId)) || [];
  }

  /* Normaliza course al SEGMENTO 'c1' | 'c2' | 'cx' (mismo formato que
     entry.courseSegment); devuelve null si no es válido. */
  function normalizeCourse(course) {
    if (course === null || course === undefined) return 'cx'; /* curso no secuenciado */
    if (course === 1 || course === '1' || course === 'c1') return 'c1';
    if (course === 2 || course === '2' || course === 'c2') return 'c2';
    if (course === 'x' || course === 'cx') return 'cx';
    return null;
  }

  /* Busca por (curriculumId, course, code). Acepta course 1|2|'x'|'cx'|null.
     Las electivas code:null solo son alcanzables vía getModuleById(). */
  function getModule(curriculumId, course, code) {
    const c = normalizeCourse(course);
    if (!c || code == null) return null;
    const bucket = ensureIndex().byCurriculum.get(String(curriculumId));
    if (!bucket) return null;
    const codeStr = String(code);
    return bucket.find((e) => e.courseSegment === c && String(e.code) === codeStr) || null;
  }

  /* Busca por moduleId completo (única vía para electivas code:null). */
  function getModuleById(moduleId) {
    return ensureIndex().byId.get(String(moduleId)) || null;
  }

  /* ---------- Validador (solo lectura: detecta, nunca corrige) ----------
     Devuelve { ok, version, total, duplicates, warnings, errors }. */

  const MODULE_ID_RE = /^[a-z0-9-]+:c(?:1|2|x):(?!$)(?:[A-Za-z0-9]+|opt-[a-z0-9-]+)(?:-\d+)?$/;

  function validateCurriculumIndex() {
    const ix = ensureIndex();
    const errors = [];
    const warnings = [];
    const duplicates = [];

    /* 1) Errores de construcción: currículos/entradas no representables. */
    ix.buildErrors.forEach((e) => errors.push(e));

    /* 2) Identidad válida y unicidad. */
    const counts = new Map();
    ix.modules.forEach((e) => {
      if (!MODULE_ID_RE.test(e.moduleId)) {
        errors.push({ code: 'invalid-identity', moduleId: e.moduleId, detail: 'formato de moduleId no reconocido' });
      }
      counts.set(e.moduleId, (counts.get(e.moduleId) || 0) + 1);
    });
    counts.forEach((n, id) => {
      if (n > 1) {
        duplicates.push({ moduleId: id, count: n });
        errors.push({ code: 'duplicate-module-id', moduleId: id, detail: 'aparece ' + n + ' veces tras la desambiguación' });
      }
    });

    /* 3) Código ausente, curso inesperado, electiva sin identidad, colisiones. */
    ix.modules.forEach((e) => {
      if (e.code == null && (e.kind === 'modules1' || e.kind === 'modules2')) {
        errors.push({ code: 'missing-code', moduleId: e.moduleId, detail: 'módulo de contenedor sin code' });
      }
      if (e.code == null && e.kind === 'electives') {
        warnings.push({ code: 'elective-without-code', moduleId: e.moduleId, detail: 'electiva identificada por slug del nombre (diseño 6D.1)' });
      }
      if (e.code == null && e.kind === 'project') {
        warnings.push({ code: 'project-without-code', moduleId: e.moduleId, detail: 'proyecto sin code' });
      }
      if (e.code == null && (!e.name || !slug(e.name))) {
        errors.push({ code: 'elective-without-identity', moduleId: e.moduleId, detail: 'electiva sin code ni nombre utilizable para slug' });
      }
      if (e.course !== null && e.course !== 1 && e.course !== 2) {
        warnings.push({ code: 'unexpected-course', moduleId: e.moduleId, detail: 'curso fuera de 1/2: ' + e.course });
      }
      if (e.collision) {
        warnings.push({ code: 'collision-resolved', moduleId: e.moduleId, detail: 'desambiguado de ' + e.collision.of + ' con sufijo determinista' });
      }
    });

    /* 4) Duplicados estructurales modules1|modules2 ↔ project: hecho de los
       datos (p. ej. 1713). Aviso, nunca corrección. */
    ix.structuralDuplicates.forEach((s) => warnings.push(s));

    /* 5) Coherencia interna: todo moduleId pertenece a un currículo existente. */
    const known = new Set((Array.isArray(D.curriculums) ? D.curriculums : [])
      .map((c) => (c && c.id) || null).filter(Boolean));
    ix.modules.forEach((e) => {
      if (!known.has(e.curriculumId)) {
        errors.push({ code: 'unknown-curriculum', moduleId: e.moduleId, detail: 'curriculumId no presente en SMR_DATA.curriculums' });
      }
    });

    return {
      ok: errors.length === 0,
      version: ix.version,
      total: ix.total,
      duplicates,
      warnings,
      errors
    };
  }

  SMR.curriculumIndex = curriculumIndex;
  SMR.getCurriculumModules = getCurriculumModules;
  SMR.getModule = getModule;
  SMR.getModuleById = getModuleById;
  SMR.validateCurriculumIndex = validateCurriculumIndex;

  /* Utilidades internas, solo para las pruebas de la fase (no es API pública). */
  SMR.__curriculumInternals = Object.freeze({
    slug: slug,
    canonicalCourse: canonicalCourse,
    courseSegment: courseSegment,
    baseModuleId: baseModuleId,
    buildIndex: buildIndex,
    normalizeCourse: normalizeCourse
  });
})(typeof window !== 'undefined' ? window : globalThis);

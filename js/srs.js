'use strict';

/* SMR Hub — Identificación estable de preguntas y migración del SRS (fase 6C.5)
   ------------------------------------------------------------------
   Antes de esta fase, el progreso identificaba cada pregunta por su
   posición: clave "testId:qIndex" en progress.tests.srs y clave numérica
   en progress.tests.wrong[testId]. Eso rompía el vínculo con la pregunta
   si el banco se reordenaba o ampliaba.

   Este módulo:
   1. Asigna a cada pregunta un ID estable y determinista (hash de
      contenido, sin aleatoriedad ni timestamps, sin depender de datos
      curriculares ni de relatedResource).
   2. Mantiene un registro testId+qIndex <-> ID para toda la aplicación.
   3. Expone la migración de los datos antiguos (posicionales) al nuevo
      esquema, de forma idempotente y sin destruir nada:
      - Las entradas resolubles se reasignan al ID estable.
      - Las entradas NO resolubles se conservan en tests.srsLegacy
        (SRS) o con su clave numérica original (wrong): nunca se
        inventan correspondencias ni se descartan datos.
   No toca: best, last, history, progress, profile, curriculum,
   categorías, orden de preguntas ni contenido educativo. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  const D = global.SMR_DATA || {};

  /* ---------- ID estable por contenido ---------- */

  const SEED_A = 0x811c9dc5; /* offset basis FNV-1a 32 bits */
  const SEED_B = 0x01000193 ^ 0x9e3779b9; /* semilla distinta, fija */

  /* FNV-1a de 32 bits con semilla configurable. Determinista. */
  function fnv1a(str, seed) {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      /* h = (h * 16777619) mod 2^32, sin desbordamiento */
      h = (h + ((h << 1) >>> 0) + ((h << 4) >>> 0) + ((h << 7) >>> 0) + ((h << 8) >>> 0) + ((h << 24) >>> 0)) >>> 0;
      h = h >>> 0;
    }
    return h >>> 0;
  }

  /* Entrada del hash: testId + texto + opciones + índice correcto.
     NO entra: qIndex (posición), relatedResource, explain, difficulty,
     topic ni cualquier dato curricular. Cambiar el orden de las opciones
     o corregir el texto cambiaría el ID (riesgo documentado). */
  function questionHashInput(testId, q) {
    const opts = Array.isArray(q.options) ? q.options.join('\u0001') : '';
    return String(testId) + '\u0000' + String(q.q) + '\u0000' + opts + '\u0000' + String(q.correct);
  }

  function stableIdOf(testId, q) {
    const input = questionHashInput(testId, q);
    const a = fnv1a(input, SEED_A);
    const b = fnv1a(input, SEED_B);
    return 'q-' + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
  }

  /* ---------- Registro testId+qIndex <-> ID ---------- */

  const registry = {
    byPos: new Map(), /* "testId:qIndex" -> id */
    byId: new Map()   /* id -> { testId, qIndex, q } */
  };

  function buildIndex() {
    registry.byPos.clear();
    registry.byId.clear();
    const tests = Array.isArray(D.tests) ? D.tests : [];
    tests.forEach((test) => {
      if (!test || !Array.isArray(test.questions)) return;
      test.questions.forEach((q, i) => {
        if (!q || typeof q.q !== 'string') return;
        let id = stableIdOf(test.id, q);
        /* Colisión (prácticamente imposible con 64 bits): sufijo
           determinista por orden de carga, nunca aleatorio. */
        if (registry.byId.has(id)) {
          let n = 2;
          while (registry.byId.has(id + '-' + n)) n++;
          id = id + '-' + n;
        }
        if (!q.id) q.id = id;
        const posKey = test.id + ':' + i;
        registry.byPos.set(posKey, id);
        registry.byId.set(id, { testId: test.id, qIndex: i, q });
      });
    });
  }

  /* ---------- Resolución de claves ---------- */

  /* Clave SRS antigua: "testId:qIndex". Nueva: el ID estable (q-<16hex>). */
  const ID_RE = /^q-[0-9a-f]{16}(?:-\d+)?$/;
  function isLegacyKey(key) {
    return typeof key === 'string' && key.indexOf(':') !== -1;
  }
  function isStableKey(key) {
    return typeof key === 'string' && ID_RE.test(key);
  }

  /* Devuelve { testId, qIndex } para cualquier clave del SRS (nueva o
     antigua), o null si no se puede resolver con certeza. */
  function resolveSrsKey(key) {
    if (typeof key !== 'string' || !key) return null;
    if (isLegacyKey(key)) {
      const sep = key.lastIndexOf(':');
      const testId = key.slice(0, sep);
      const qIndex = Number(key.slice(sep + 1));
      if (!Number.isInteger(qIndex) || qIndex < 0) return null;
      if (!registry.byPos.has(testId + ':' + qIndex)) return null;
      return { testId, qIndex };
    }
    const entry = registry.byId.get(key);
    return entry ? { testId: entry.testId, qIndex: entry.qIndex } : null;
  }

  /* ID estable para una posición actual del banco (o null). */
  function idOf(testId, qIndex) {
    return registry.byPos.get(String(testId) + ':' + Number(qIndex)) || null;
  }

  /* ---------- Migración idempotente ---------- */

  const SRS_KEY_VERSION = 4;

  /* Reglas (requisitos fase 6C.5):
     1. Los datos antiguos no desaparecen: antes del primer cambio la app
        guarda una copia completa del progreso original (backup en
        localStorage, clave "smrhub:progressBackupV3"); lo no resoluble
        queda en srsLegacy o con su clave original.
     2. Una entrada antigua "testId:qIndex" se resuelve SOLO si ese test
        existe y ese qIndex apunta a una pregunta actual del banco; si no,
        NO se reasigna.
     3. Idempotente: dos ejecuciones no duplican ni alteran datos. */
  function migrateProgressData(data, now) {
    now = typeof now === 'number' ? now : Date.now();
    const result = { changed: false, srsMigrated: 0, srsKept: 0, wrongMigrated: 0, wrongKept: 0, srsLegacy: 0 };

    if (!data || typeof data !== 'object' || !data.tests || typeof data.tests !== 'object') return result;
    if (typeof data.v === 'number' && data.v >= SRS_KEY_VERSION) return result;

    const tests = data.tests;

    /* --- SRS: "testId:qIndex" -> ID estable --- */
    if (!tests.srs || typeof tests.srs !== 'object' || Array.isArray(tests.srs)) tests.srs = {};
    if (!tests.srsLegacy || typeof tests.srsLegacy !== 'object' || Array.isArray(tests.srsLegacy)) tests.srsLegacy = {};

    const validSrs = (item) => item && typeof item === 'object'
      && typeof item.level === 'number' && isFinite(item.level) && item.level >= 0
      && typeof item.due === 'number' && isFinite(item.due);

    Object.keys(tests.srs).forEach((key) => {
      if (isStableKey(key)) { /* clave ya estable: nada que hacer */ return; }
      if (!isLegacyKey(key)) {
        /* Ni antigua ni ID estable: basura no identificable. Se conserva
           en srsLegacy sin reasignar. */
        tests.srsLegacy[key] = tests.srs[key];
        delete tests.srs[key];
        result.srsKept++;
        result.changed = true;
        return;
      }
      const item = tests.srs[key];
      if (!validSrs(item)) { tests.srsLegacy[key] = item; delete tests.srs[key]; result.changed = true; return; }
      const sep = key.lastIndexOf(':');
      const testId = key.slice(0, sep);
      const qIndex = Number(key.slice(sep + 1));
      const id = Number.isInteger(qIndex) && qIndex >= 0 ? registry.byPos.get(testId + ':' + qIndex) : null;
      if (!id) {
        /* No resoluble con certeza: se conserva sin reasignar. */
        tests.srsLegacy[key] = { level: Math.floor(item.level), due: item.due };
        delete tests.srs[key];
        result.srsKept++;
        result.changed = true;
        return;
      }
      if (!tests.srs[id]) {
        tests.srs[id] = { level: Math.floor(item.level), due: item.due };
      }
      /* Si ya existía la entrada nueva (migración previa interrumpida),
         se conserva la existente y solo se retira la antigua. */
      delete tests.srs[key];
      result.srsMigrated++;
      result.changed = true;
    });

    /* --- wrong: clave numérica -> ID estable (por bucket de test) --- */
    if (!tests.wrong || typeof tests.wrong !== 'object' || Array.isArray(tests.wrong)) tests.wrong = {};
    Object.keys(tests.wrong).forEach((testId) => {
      const bucket = tests.wrong[testId];
      if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return;
      Object.keys(bucket).forEach((key) => {
        const count = bucket[key];
        if (typeof count !== 'number' || !isFinite(count)) return;
        if (!/^\d+$/.test(key)) { /* ya es ID estable */ return; }
        const id = registry.byPos.get(testId + ':' + Number(key));
        if (!id) {
          /* Pregunta no presente en el banco actual: se conserva la
             referencia posicional original (repaso de errores la ignora
             si la pregunta ya no existe). */
          result.wrongKept++;
          return;
        }
        if (typeof bucket[id] !== 'number') bucket[id] = count;
        delete bucket[key];
        result.wrongMigrated++;
        result.changed = true;
      });
    });

    if (result.changed || typeof data.v !== 'number' || data.v < SRS_KEY_VERSION) {
      data.v = SRS_KEY_VERSION;
      result.changed = true;
    }
    return result;
  }

  /* ---------- Arranque ---------- */

  buildIndex();

  SMR.srs = {
    version: SRS_KEY_VERSION,
    buildIndex,
    idOf,
    resolveSrsKey,
    isLegacyKey,
    isStableKey,
    migrateProgressData,
    questionHashInput
  };
})(typeof window !== 'undefined' ? window : globalThis);

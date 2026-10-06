'use strict';

/* SMR Hub — Mapping canónico de preguntas → topics (fase 6D.4)
   ------------------------------------------------------------------
   Capa DERIVADA y de solo lectura: no tabla estática de 154 filas,
   sino reconstrucción determinista en carga a partir de los datos
   reales. Ventajas: no duplica datos, sobrevive a reordenaciones,
   y cualquier cambio de contenido cambia el q-... id y queda
   detectado como huérfano por el validador.

   Cadena de resolución por pregunta (diseño aprobado 6D.1/6D.3):
   1. questionId = SMR.srs.idOf(testId, posición) → identidad estable
      q-<16hex> (6C.5). Solo se usa como IDENTIDAD: nunca como clave
      de posición a efectos educativos.
   2. raw = q.topic (sin tocar), categoría = la del TEST propietario.
   3. topicId = SMR.topics.resolveTopicId(raw, categoría).
   4. Confianza según decisiones de 6D.3:
      - alias scoped (raw dependiente de categoría)  → medium
      - alias con fusión documentada por contenido    → high
        (Limpieza, Temperaturas, SMART, Almacenamiento, Recuperación,
         Logs, Mantenimiento→refrigeración, Conceptos, renombrados)
      - alias directo 1:1                             → high
      - raw ambiguo sin contexto                      → review/ambiguous
   5. relatedResource válido como EVIDENCIA AUXILIAR: nunca decide el
      mapping; solo añade la cadena "related-resource" a evidence y
      permite detectar discrepancias documentadas (no se repara).

   Estados: active | review | ambiguous.
   Confianza: high | medium | low | review.

   NO toca: questions.js, tests.js, srs.js, curriculum.js, topics.js,
   localStorage, progress, SRS, IDs q-… */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  const D = global.SMR_DATA || {};

  const MAPPING_VERSION = 1;

  /* Raws con fusión documentada en 6D.3 (cabecera de topics.js).
     Todos convergen al mismo topic en cualquier categoría: high. */
  const FUSIONES_DOCUMENTADAS = Object.freeze(new Set([
    'Limpieza', 'Temperaturas', 'SMART', 'Almacenamiento',
    'Recuperación', 'Logs', 'Conceptos', 'Mantenimiento',
    'Routing', 'PSU', 'Backups', 'Memoria', 'Recursos', 'Casos de uso'
  ]));

  /* Raw ambiguo por excelencia (6D.3). */
  const RAWS_AMBIGUOS = Object.freeze(new Set(['Diagnóstico']));

  let INDEX = null;

  function buildMapping() {
    const entries = [];
    /* 6D.8 (INT-02): lookup interno sin prototipo; congelado al exponer. */
    const byQuestionId = Object.create(null);
    const problems = [];

    const srsMod = SMR.srs;
    const topicsMod = SMR.topics;
    if (!srsMod || !topicsMod) {
      return {
        version: MAPPING_VERSION, entries: Object.freeze([]),
        byQuestionId: Object.freeze(Object.create(null)), problems: Object.freeze([
          { code: 'missing-dependency', detail: 'srs.js o topics.js no cargados: mapping no disponible' }
        ])
      };
    }

    const validResources = new Set((Array.isArray(D.resources) ? D.resources : []).map((r) => r.id));

    (Array.isArray(D.tests) ? D.tests : []).forEach((test) => {
      if (!test || !test.id || !Array.isArray(test.questions)) return;
      const category = test.category || 'General';
      test.questions.forEach((q, position) => {
        const questionId = srsMod.idOf(test.id, position);
        if (!questionId) {
          problems.push({ code: 'no-question-id', testId: test.id, position, detail: 'no se pudo derivar el q-… de la pregunta' });
          return;
        }
        const raw = typeof q.topic === 'string' ? q.topic.trim() : '';
        if (!raw) {
          problems.push({ code: 'empty-raw-topic', questionId, testId: test.id, position });
        }
        const resolution = topicsMod.resolveTopicId(raw, category);
        const evidence = [];
        let status = 'active';
        let confidence = 'high';
        let topicId = resolution.status === 'resolved' ? resolution.topicId : null;
        let via = resolution.via;

        if (raw) evidence.push('raw-topic:' + raw);
        evidence.push('category:' + category);
        evidence.push('test:' + test.id);

        if (resolution.status === 'resolved') {
          if (via === 'alias-scoped') {
            /* Raw dependiente de la categoría: medium (6D.3, Diagnóstico/Mantenimiento). */
            confidence = 'medium';
            evidence.push('scoped-alias');
          } else if (FUSIONES_DOCUMENTADAS.has(raw)) {
            confidence = 'high';
            evidence.push('fusion-documentada-6d3');
          } else {
            confidence = 'high';
            evidence.push('alias-directo');
          }
        } else if (resolution.status === 'ambiguous') {
          /* Sin contexto suficiente: review con candidatos conservados. */
          status = 'ambiguous';
          confidence = 'review';
          topicId = null;
          evidence.push('ambiguous-without-context');
          problems.push({ code: 'ambiguous-resolution', questionId, testId: test.id, position, raw, candidates: resolution.candidates });
        } else {
          /* unknown: no inventar. */
          status = 'review';
          confidence = 'review';
          topicId = null;
          evidence.push('unknown-raw');
          problems.push({ code: 'unknown-raw-topic', questionId, testId: test.id, position, raw });
        }

        /* relatedResource: evidencia auxiliar, nunca autoridad. */
        if (q.relatedResource && validResources.has(q.relatedResource)) {
          evidence.push('related-resource:' + q.relatedResource);
        }

        const entry = Object.freeze({
          questionId,
          topicId,
          status, /* active | review | ambiguous */
          confidence, /* high | medium | review */
          evidence: Object.freeze(evidence),
          testId: test.id,
          category,
          rawTopic: raw,
          candidates: resolution.status === 'ambiguous' ? Object.freeze(resolution.candidates.slice()) : Object.freeze([]),
          position /* informativo: nunca identidad */
        });
        entries.push(entry);
        if (questionId in byQuestionId) {
          problems.push({ code: 'duplicate-question-id', questionId, detail: 'colisión de hash de contenido: revisar 6C.5' });
        }
        byQuestionId[questionId] = entry;
      });
    });

    INDEX = Object.freeze({
      version: MAPPING_VERSION,
      total: entries.length,
      entries: Object.freeze(entries),
      byQuestionId: Object.freeze(byQuestionId),
      problems: Object.freeze(problems)
    });
    return INDEX;
  }

  function ensureMapping() {
    if (!INDEX) buildMapping();
    return INDEX;
  }

  /* ---------- API pública ---------- */

  function questionTopics() {
    return ensureMapping();
  }

  function topicOf(questionId) {
    return ensureMapping().byQuestionId[String(questionId)] || null;
  }

  /* Preguntas de un topic (solo active). Orden estable por orden de datos. */
  function questionsOfTopic(topicId) {
    return ensureMapping().entries.filter((e) => e.status === 'active' && e.topicId === topicId).map((e) => e.questionId);
  }

  /* ---------- Validador (solo lectura) ---------- */

  function validateQuestionTopics() {
    const m = ensureMapping();
    const errors = [];
    const warnings = [];

    /* B/C/D/E: integridad referencial bidireccional. */
    const validTopics = new Set((SMR.topics ? SMR.topics.list : []).map((t) => t.id));
    const questions = new Set();
    (Array.isArray(D.tests) ? D.tests : []).forEach((t) => (t.questions || []).forEach((q) => {
      const id = SMR.srs ? SMR.srs.idOf(t.id, (t.questions || []).indexOf(q)) : null;
      if (id) questions.add(id);
    }));

    m.entries.forEach((e) => {
      if (!questions.has(e.questionId)) {
        errors.push({ code: 'orphan-mapping', questionId: e.questionId, detail: 'mapping para pregunta inexistente (contenido cambió o fue borrado)' });
      }
      if (e.topicId && !validTopics.has(e.topicId)) {
        errors.push({ code: 'unknown-topic', questionId: e.questionId, topicId: e.topicId, detail: 'topicId no existe en SMR.topics' });
      }
      if (e.status === 'active' && !e.topicId) {
        errors.push({ code: 'active-without-topic', questionId: e.questionId, detail: 'estado active sin topicId' });
      }
    });

    const counts = new Map();
    m.entries.forEach((e) => counts.set(e.questionId, (counts.get(e.questionId) || 0) + 1));
    counts.forEach((n, id) => {
      if (n > 1) errors.push({ code: 'duplicate-question-id', questionId: id, detail: 'aparece ' + n + ' veces' });
    });

    /* Cobertura: toda pregunta activa con raw registrado debe tener entrada. */
    if (m.total !== questions.size) {
      errors.push({ code: 'coverage-mismatch', detail: 'entradas=' + m.total + ' vs preguntas=' + questions.size });
    }

    m.problems.forEach((p) => {
      if (p.code === 'ambiguous-resolution') warnings.push(p);
      else if (p.code === 'unknown-raw-topic') errors.push(p);
      else warnings.push(p);
    });

    return {
      ok: errors.length === 0,
      version: m.version,
      total: m.total,
      byStatus: {
        active: m.entries.filter((e) => e.status === 'active').length,
        review: m.entries.filter((e) => e.status === 'review').length,
        ambiguous: m.entries.filter((e) => e.status === 'ambiguous').length
      },
      byConfidence: {
        high: m.entries.filter((e) => e.confidence === 'high').length,
        medium: m.entries.filter((e) => e.confidence === 'medium').length,
        low: m.entries.filter((e) => e.confidence === 'low').length,
        review: m.entries.filter((e) => e.confidence === 'review').length
      },
      warnings, errors
    };
  }

  SMR.questionTopics = questionTopics;
  SMR.topicOf = topicOf;
  SMR.questionsOfTopic = questionsOfTopic;
  SMR.validateQuestionTopics = validateQuestionTopics;
})(typeof window !== 'undefined' ? window : globalThis);

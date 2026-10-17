'use strict';

/* SMR Hub — Fase 8.8: comentarios y reportes de preguntas
   ------------------------------------------------------------------
   Dos envíos, una sola tubería:
     · comentario (feedback)          → qué mejorarías de SMR Hub
     · reporte de pregunta            → aviso sobre una pregunta concreta

   Se escriben SOLO por RPC (public.submit_feedback /
   public.submit_question_report, migración 00009): las tablas ya no
   aceptan INSERT directo del cliente. El uid lo pone el SERVIDOR con
   auth.uid(); este módulo no envía user_id en ninguna petición, así que no
   hay forma de atribuir un envío a otra cuenta desde el navegador.

   SIN cola y SIN reintentos automáticos: un envío es un acto explícito del
   estudiante y el mensaje que ve es el resultado real. No hay servidor o
   no hay sesión → se dice con claridad; nunca se finge que se guardó. Nada
   de esto toca el progreso local: los comentarios no son progreso.

   PROPIEDAD (contrato 8.6.3, sin duplicar infraestructura de sesión): se
   captura el token del dueño del slot vivo antes de enviar y se comprueba
   ANTES y DESPUÉS de la petición; si la cuenta cambió a mitad, el envío no
   se anuncia como éxito — el propietario válido no se puede demostrar. Sin
   contrato (build inconsistente) se falla cerrado.

   API: SMR.feedback.submitFeedback / submitQuestionReport /
        questionKeyOf / serverReady / available / CATEGORIES / REASONS /
        LIMITS / MESSAGES
*/

(function (global) {
  const SMR = (global.SMR = global.SMR || {});

  const CATEGORIES = ['problema', 'sugerencia', 'otro'];
  const REASONS = ['enunciado', 'respuesta', 'contexto', 'otro'];
  /* Mismos topes que valida el servidor (00009). El navegador solo los usa
     para dar una respuesta inmediata; la frontera real es la RPC. */
  const LIMITS = { message: 2000, details: 1000, testId: 64 };
  const GUEST_OWNER = '__guest__'; /* misma constante que cloud-progress.js */
  const KEY_RE = /^q-[0-9a-f]{16}(?:-\d+)?$/;
  const TEST_ID_RE = /^[A-Za-z0-9_.:-]+$/;

  /* Copy al usuario: única fuente, la interfaz no la reescribe. */
  const MESSAGES = {
    invalid: 'Revisa el texto: hay campos vacíos o demasiado largos.',
    auth: 'Inicia sesión para enviar comentarios y avisos: se guardan en tu cuenta.',
    offline: 'Sin conexión con SMR: esto no se ha guardado. Puedes seguir estudiando con normalidad.',
    rate: 'Has enviado varios avisos hace poco. Inténtalo dentro de un rato.',
    unavailable: 'El envío de comentarios no está disponible ahora mismo. Inténtalo más tarde.',
    network: 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.',
    changed: 'La cuenta cambió durante el envío, así que no se ha confirmado. Vuelve a enviarlo si quieres.',
    error: 'No se pudo enviar. Inténtalo de nuevo.'
  };

  function warn(context, err) {
    if (global.console && global.console.warn) {
      global.console.warn('[SMR cloud-feedback]', context + ':', err && err.message ? err.message : err);
    }
  }

  /* ---------- Contrato de propiedad de sesión (8.6.3) ----------
     Publicado por cloud-progress.js. Sin contrato no se puede demostrar el
     propietario: ninguna operación de envío se ejecuta. */
  function sessionContract() {
    const c = SMR.cloudSession;
    return (c && typeof c.owner === 'function' && typeof c.token === 'function'
      && typeof c.isCurrent === 'function') ? c : null;
  }

  /* ¿Hay servidor configurado? (la app sin credenciales sigue siendo local) */
  function serverReady() {
    return !!(SMR.cloudAvailable && SMR.cloud && typeof SMR.cloud.rpc === 'function');
  }

  /* ¿Se puede enviar AHORA? (servidor + sesión demostrable en este momento:
     con una transición de cuenta en vuelo el token no vale y el envío
     fallaría, así que la UI no debe prometer que se enviará). */
  function available() {
    if (!serverReady()) return false;
    const c = sessionContract();
    if (!c || !currentUid()) return false;
    return c.isCurrent(c.token());
  }

  function currentUid() {
    const c = sessionContract();
    if (!c) return null;
    const owner = c.owner();
    return owner && owner !== GUEST_OWNER ? owner : null;
  }

  /* ---------- Normalización (espejo del servidor, solo UX) ---------- */

  function cleanText(value, max) {
    const text = String(value == null ? '' : value).trim();
    return (text && text.length <= max) ? text : null;
  }

  function normalizeFeedback(input) {
    const i = input || {};
    const category = CATEGORIES.indexOf(i.category) !== -1 ? i.category : null;
    const message = cleanText(i.message, LIMITS.message);
    return (category && message) ? { category: category, message: message } : null;
  }

  function normalizeReport(input) {
    const i = input || {};
    const testId = cleanText(i.testId, LIMITS.testId);
    const rawKey = String(i.questionKey == null ? '' : i.questionKey).trim();
    const reason = REASONS.indexOf(i.reason) !== -1 ? i.reason : null;
    const details = cleanText(i.details, LIMITS.details);
    /* `details` es opcional: vacío no es un error, demasiado largo sí. */
    const detailsEmpty = i.details == null || String(i.details).trim() === '';
    if (!testId || !TEST_ID_RE.test(testId)) return null;
    if (!KEY_RE.test(rawKey)) return null; /* sin identidad estable no se reporta */
    if (!reason) return null;
    if (!details && !detailsEmpty) return null;
    return { testId: testId, questionKey: rawKey, reason: reason, details: details };
  }

  /* ---------- Traducción de errores del servidor ---------- */

  function reasonOf(error) {
    const code = error && error.code ? String(error.code) : '';
    const message = (error && error.message) || '';
    if (code === '42501' || /auth required|permission denied|jwt/i.test(message)) return 'auth';
    /* 23503: la fila apunta a auth.users y esa cuenta ya no existe (sesión
       local de una cuenta borrada). Reintentar no sirve: hay que entrar de
       nuevo, así que se informa como problema de sesión. */
    if (code === '23503' || /foreign key constraint/i.test(message)) return 'auth';
    if (code === 'P0001' || /rate limit/i.test(message)) return 'rate';
    if (code === '22023' || /invalid payload/i.test(message)) return 'invalid';
    if (code === 'PGRST202' || /could not find the function|does not exist/i.test(message)) return 'unavailable';
    if (/failed to fetch|networkerror|load failed|timeout|fetch failed/i.test(message)) return 'network';
    return 'error';
  }

  /* ---------- Envío ---------- */

  async function send(rpcName, params) {
    if (!serverReady()) return { ok: false, reason: 'offline' };

    const c = sessionContract();
    const uid = currentUid();
    if (!c || !uid) return { ok: false, reason: 'auth' };

    const token = c.token();
    /* La sesión pudo cambiar entre el render y el clic: no se envía nada. */
    if (!c.isCurrent(token)) return { ok: false, reason: 'auth' };

    let res;
    try {
      res = await SMR.cloud.rpc(rpcName, params);
    } catch (err) {
      warn(rpcName, err);
      return { ok: false, reason: 'network' };
    }

    /* El servidor atribuye con auth.uid() (verdad del JWT). Si la cuenta
       cambió mientras se enviaba, el resultado no es atribuible a la sesión
       actual: se informa sin confirmar éxito. */
    if (!c.isCurrent(token)) return { ok: false, reason: 'changed' };

    if (res && res.error) {
      warn(rpcName, res.error);
      return { ok: false, reason: reasonOf(res.error) };
    }
    const id = res && res.data;
    return { ok: true, id: (typeof id === 'number' ? id : null) };
  }

  function submitFeedback(input) {
    const payload = normalizeFeedback(input);
    if (!payload) return Promise.resolve({ ok: false, reason: 'invalid' });
    return send('submit_feedback', {
      p_category: payload.category,
      p_message: payload.message,
      p_ratings: null,
      p_client_created_at: typeof Date.now === 'function' ? Date.now() : null
    });
  }

  function submitQuestionReport(input) {
    const payload = normalizeReport(input);
    if (!payload) return Promise.resolve({ ok: false, reason: 'invalid' });
    return send('submit_question_report', {
      p_test_id: payload.testId,
      p_question_key: payload.questionKey,
      p_reason: payload.reason,
      p_details: payload.details,
      p_client_created_at: typeof Date.now === 'function' ? Date.now() : null
    });
  }

  /* Clave estable REAL de una pregunta del banco, o null. Sin ella no se
     ofrece reportar: un aviso sin identidad de pregunta no es accionable. */
  function questionKeyOf(testId, origIndex) {
    const srs = SMR.srs;
    if (!srs || typeof srs.idOf !== 'function' || !testId) return null;
    const key = srs.idOf(testId, origIndex);
    return KEY_RE.test(String(key || '')) ? key : null;
  }

  SMR.feedback = {
    CATEGORIES: CATEGORIES,
    REASONS: REASONS,
    LIMITS: LIMITS,
    MESSAGES: MESSAGES,
    serverReady: serverReady,
    available: available,
    questionKeyOf: questionKeyOf,
    submitFeedback: submitFeedback,
    submitQuestionReport: submitQuestionReport
  };

  /* app.js se ejecuta ANTES que este módulo (ambos `defer`, en orden): la
     primera vista puede haberse pintado sin SMR.feedback. Se avisa para que
     se repinte una vez y el formulario y la acción de aviso existan desde el
     principio (mismo patrón que 'smr:authchange' de auth.js). */
  if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
    global.dispatchEvent(new global.CustomEvent('smr:feedbackready'));
  }
})(typeof window !== 'undefined' ? window : globalThis);

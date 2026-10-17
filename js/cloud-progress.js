'use strict';

/* SMR Hub — Fase 8.4: Progress Sync (solo progreso definido en 8.0/8.4)
   ------------------------------------------------------------------
   ÚNICA capa responsable de sync de progreso. La UI sigue usando las
   APIs locales de SMR.progress sin cambios (wrapping aditivo).

   DOMINIOS sincronizados (fase 8.4; NO SRS, NO favorites, NO settings):
     - test_attempts      (historial de intentos, append-only)
     - test_scores        (best=MAX histórico, last=último attempt)
     - wrong_answer_events(append-only, fuente de verdad)
     - wrong_answers      (caché materializada, derivable)
     - streak_days        (append-only por día)
     - resource_state     (viewed / completed+clear / self-assessment)
     - study_sessions     (append-only, dedup)
     - activity_events    (append-only, dedup; límite local 40)
     - case_solutions     (estado por caso práctico)
   NO toca: srs_cards (8.5), favorites (8.6), settings, feedback, etc.

   ── DIRECCIÓN DE FLUJO ──
   PUSH (local → cloud):
     - test_attempts/study_sessions/activity_events/wrong_answer_events:
       eventos nuevos sin marcar como sincronizados → insert append-only,
       idempotente (chunk RPC o unique constraint).
     - test_scores / resource_state / case_solutions / streak_days /
       wrong_answers: MERGE determinista (no LWW ciego):
         * test_scores.best = MAX(local, cloud)
         * test_scores.last = attempt más reciente (created_at)
         * resource_state.completed: activo si local activo O cloud activo;
           si cloud tiene completed_cleared_at posterior al local completed_at,
           el clear gana (no resucitar un completed antiguo)
         * self_assessment: último por self_assessment_at
         * streak_days: unión por (user_id, day)
   PULL (cloud → local):
     - une el historial local con test_attempts del cloud (otro dispositivo)
     - actualiza el estado local respetando completed_cleared_at y los
       MERGE por campo (MAX de best, unión de días, etc.)
     - IMPORTANTE (8.4.1): wrong_answer_events y la caché wrong_answers NO
       se reimportan todavía; su reconciliación cross-device (replay de
       eventos + event-seed de datos previos) queda para 8.7. El PUSH de
       eventos de error sí está activo.

   ── ESTRATEGIA OFFLINE ──
   - Todo el estudio es 100% local; nada de la UI depende de red.
   - La cola de eventos pendientes es POR PROPIETARIO (8.4.1, A1):
       smrhub:progressSyncQueue:<uid>  → eventos creados con esa sesión
       smrhub:progressSyncQueue:guest  → eventos creados sin sesión
     Un evento creado con la sesión de A NUNCA se envía con la sesión de
     B: al cambiar de cuenta queda archivado en la cola de A y se drena
     cuando A vuelva a entrar (recuperación explícita; no se borra nada
     automáticamente).
   - Al iniciar sesión se ADOPTAN los eventos guest y los de la cola
     legada (smrhub:progressSyncQueue): la actividad sin atribuir
     pertenece a la primera cuenta que entra en el dispositivo (mismo
     criterio "el dispositivo que inicia sesión gana" de 8.3).
   - Al reconectar (smr:authchange con user o retry programado) se drena
     la cola. Reintentos con backoff; errores no bloquean nada.
   - Un evento NO se marca como enviado hasta que el cloud confirme.
   - Errores permanentes (SQLSTATE / validación) NO se reintentan para
     siempre: los eventos se apartan en la cola `failed` del propietario
     (conservados, con warn diagnóstico) para recuperación manual. Un
     dominio fallido nunca bloquea a los demás dominios.

   ── IDEMPOTENCIA ──
   - test_attempts: UNIQUE (user, test_id, mode, created_at) + on conflict do nothing
   - study_sessions / activity_events: igual con sus constraints
   - wrong_answer_events: RPC sync_progress_chunk (chunk id + anti-join)
   - test_scores/resource_state/case_solutions: upsert (estado, no evento)
   - streak_days: PK (user_id, day), insert on conflict do nothing

   ── CONCURRENCIA ──
   - Cola serializada de operaciones (syncChain): nunca dos sync a la vez.
   - Los MERGE de estado se hacen SIEMPRE sobre lectura fresca del local
     en el momento de la escritura (nunca sobre un snapshot stale).
   - Pestañas concurrentes: cada pestaña solo envía SUS eventos no
     sincronizados; el dedupe cloud evita duplicados lógicos.
   - Refresh durante sync: los eventos no confirmados siguen en la cola
     persistida en localStorage; el próximo arranque reintenta.

   ── ERRORES ──
   - Todo fallo cloud → warn controlado, el local NO se toca, la cola
     conserva los eventos para reintento. Nunca bloquear el estudio.
   - Nunca se borra progreso local por un error de red.

   NO implementado aquí (8.5–8.9): srs_cards, favorites, settings,
   feedback, reports, entitlements, analytics, pagos. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  if (!SMR.cloudAvailable || !SMR.cloud || !SMR.progress) return;

  const sb = SMR.cloud;
  const QUEUE_PREFIX = 'progressSyncQueue:';
  const LEGACY_QUEUE_KEY = 'progressSyncQueue'; /* pre-8.4.1: sin propietario */

  /* 8.4.2 (M-1): aislamiento del ESTADO DERIVADO entre cuentas del
     mismo dispositivo. Hasta ahora smrhub:progress / progressSyncClears
     eran claves GLOBALES: al cambiar de cuenta, el historial, best/last,
     recursos y demás estado derivado del usuario anterior seguía en
     vivo y el pull/push del usuario nuevo lo mezclaba (y lo subía a la
     nube del otro). Política:
       - smrhub:progress, progressSyncClears y studentProfile pasan a
         ser "slots" con dueño; el contenido real por dueño vive en
         smrhub:progressByOwner:<uid> (o <'__guest__'>).
       - Al cambiar de sesión se GUARDA el slot vivo bajo el dueño que
         lo generaba y se CARGA el snapshot del dueño que entra (o uno
         nuevo vacío). Nada se borra: un logout no pierde datos.
       - Contenido global pre-8.4.2 sin dueño identificable se conserva
         en smrhub:progressByOwner:__unknown__ y NO se adopta
         silenciosamente (política: no atribuir sin certeza). No se
         sincroniza; solo lo documenta y lo conserva el operador.
       - El progreso VISITANTE sigue funcionando tal cual: se guarda
         bajo __guest__ y se restaura al volver a modo visitante.
       - SRS vive dentro de tests.srs (misma clave smrhub:progress),
         así que hereda el aislamiento sin tocar IDs estables.
       - Con Null session (visitante) no se toca el slot de la cuenta
         previa; solo se registra para no arrastrar datos de A a B.

     8.4.4–8.4.5 (H-2, MULTI-PESTAÑA): localStorage es COMPARTIDO entre
     pestañas del mismo origen; NO existe bloqueo inter-proceso. En 8.4.5,
     con reproducción REAL en dos pestañas de navegador, se confirmó el
     interleaving de transiciones: transiciones simultáneas en 2 pestañas
     dejaban slots per-owner corruptos (A/B/__guest__ apuntando al Estado
     de B). Corrección mínima implementada en 8.4.5 (sin arquitectura
     nueva): transiciones de slots bajo Web Lock API (navigator.locks
     'smrhub:slot-transition'), y listener 'storage' en la clave 'progress'
     cuando la pestaña NO participa en la transición y su estado live NO
     debe modificarse (per-tab runtime actualizado por el dueño CORRECTO;
     las notificaciones/storage event en navegadores la entregan solo a
     las otras pestañas). Con locks no disponibles (navegador viejo, mocks
     sin navigator.locks) se ejecuta la transición sin espera, que es
     exactamente el comportamiento previo a 8.4.5; el 'storage' listener
     re-sincroniza runtime en la pestaña pasiva.
     NOTA (limitación de 'storage' event): el storage event solo informa a
     LAS OTRAS pestañas, no a la que escribe; aquí todo lo que controla el
     runtime de una transición es LOcal a la pestaña que la ejecuta (la
     que dispara el authchange), de modo que la pestaña activa siempre
     termina consistente; las pasivas re-sincronizan con su propio lock.
     La exclusión de writes/colas sigue garantizada por los guardas
     sessionHandleFor/sessionChangedFor (8.4.4 H-1) y las colas por UID. */
  const OWNER_KEY_PREFIX = 'progressByOwner:';
  const GUEST_OWNER = '__guest__';
  const UNKNOWN_OWNER = '__unknown__';
  /* claves del slot vivo que se intercambian junto al snapshot de progreso */
  const SLOT_KEYS = ['progress', 'progressSyncClears', 'progressSyncSrsClears', 'studentProfile'];
  /* 8.5.11 (D-3): DUEÑO DEL SLOT VIVO, persistido. Sin esto, cada arranque
     empezaba con runtime.currentUser = null y el primer smr:authchange no
     sabía de quién era el slot vivo: archivaba el estado autenticado como
     contenido de visitante (__guest__) y restauraba el snapshot obsoleto
     del dueño, reintroduciendo marcas pending ya revividas. NO es una
     clave de slot (es metadato de propiedad) y no entra en SLOT_KEYS. */
  const LIVE_OWNER_KEY = 'liveOwner';

  function ownerSlotKey(owner) { return OWNER_KEY_PREFIX + owner; }

  /* Lectura tolerante: { owner, v } (formato actual) o el uid suelto.
     Ausente o corrupto → null (dueño desconocido, NUNCA una autorización
     para reasignar el slot). */
  function readLiveOwner() {
    try {
      const raw = SMR.store.get(LIVE_OWNER_KEY, null);
      if (typeof raw === 'string' && raw) return raw;
      if (raw && typeof raw === 'object' && typeof raw.owner === 'string' && raw.owner) return raw.owner;
    } catch (err) { /* sin store: dueño desconocido */ }
    return null;
  }

  function writeLiveOwner(owner) {
    try { SMR.store.set(LIVE_OWNER_KEY, { owner: owner, v: 1 }); } catch (err) { warn('dueño del slot vivo', err); }
  }

  /* 8.5.13: QUIÉN escribió por última vez el slot vivo. El marcador de dueño
     solo lo escriben las transiciones de sesión: una pestaña retrasada (p.
     ej. en segundo plano) puede volcar SU contenido en el slot vivo sin
     cambiar el dueño, y entonces el marcador ya no describe el contenido.
     Sin esta marca, la pestaña de la cuenta fusionaría contenido del
     visitante dentro de su propio slot (mezcla de propietarios). Metadato
     local, aditivo, fuera de SLOT_KEYS: no se archiva ni se sincroniza. */
  const LIVE_WRITER_KEY = 'liveWriter';

  function readLiveWriter() {
    try {
      const raw = SMR.store.get(LIVE_WRITER_KEY, null);
      if (typeof raw === 'string' && raw) return raw;
      if (raw && typeof raw === 'object' && typeof raw.owner === 'string' && raw.owner) return raw.owner;
    } catch (err) { /* sin store: escritor desconocido */ }
    return null;
  }

  function writeLiveWriter(owner) {
    try { SMR.store.set(LIVE_WRITER_KEY, { owner: owner, v: 1 }); } catch (err) { warn('escritor del slot vivo', err); }
  }

  /* Dueño con la MISMA representación que el marcador y que `otherSlot`. */
  function liveOwnerFor() {
    return runtime.currentUser ? (runtime.currentUser.id || 'user') : GUEST_OWNER;
  }

  /* El manejador usa null para "contenido de visitante o sin dueño
     conocido"; el marcador guarda __guest__ cuando el slot es del
     visitante, así que se traduce a null y el camino de custodia de
     visitante (8.4.2 M-1) queda EXACTAMENTE igual. */
  function slotOwnerOrUnknown(marker) {
    return marker && marker !== GUEST_OWNER ? marker : null;
  }

  /* 8.5.13: la fusión de escrituras entre pestañas (SMR.store.writeMerged) no
     debe MEZCLAR el slot vivo de dos propietarios. Si el marcador persistido
     dice que el slot vivo es de otro dueño, esta pestaña no fusiona y su
     escritura es la única verdad. Sin marcador (perfil heredado o sin store)
     se fusiona, igual que en app.js sin este módulo. */
  SMR.progress.otherSlot = function () {
    const mine = liveOwnerFor();
    const marker = readLiveOwner();
    if (marker && marker !== mine) return null;
    const writer = readLiveWriter();
    if (writer && writer !== mine) return null;
    return SMR.store.get('progress', null);
  };

  /* Datos del slot vivo (lo que ve la app ahora mismo). */
  function captureSlot() {
    const obj = {};
    SLOT_KEYS.forEach((k) => { obj[k] = SMR.store.get(k, null); });
    return obj;
  }

  function hasContent(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return SLOT_KEYS.some((k) => {
      const v = obj[k];
      if (v === null || v === undefined) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return true;
    });
  }

  function writeSlot(obj) {
    SLOT_KEYS.forEach((k) => {
      const v = obj ? obj[k] : null;
      if (v === null || v === undefined) SMR.store.remove(k);
      else SMR.store.set(k, v);
    });
    /* 8.5.13: el slot acaba de ser instalado a lo bruto (snapshot de otro
       dueño o slot limpio). La base de fusión de ESTA pestaña pasa a ser lo
       instalado: fusionar una escritura posterior contra la copia que se
       acaba de sustituir resucitaría contenido ajeno. */
    refreshSlotBases();
  }

  /* La base de fusión es esta pestaña; se refresca cuando el slot se
     reemplaza entero, no en cada escritura normal. */
  function refreshSlotBases() {
    const written = SMR.store && SMR.store.written;
    if (!written) return;
    SLOT_KEYS.forEach((k) => { written[k] = SMR.store.get(k, null); });
  }

  /* 8.4.4 (B-1): localStorage NO es atómico entre claves (cada
     setItem es independiente; una cuota llena puede fallar a mitad).
     Antes de un writeSlot que DEJA VACÍO el slot vivo (transición a un
     estado limpio o snapshot AJENO), se respalda primero el contenido
     actual en una clave de recuperación colisión-free; si el guardado
     funciona, el respaldo se retira; si falla, el contenido queda
     custodiado y legible. Así la restauración/limpieza nunca es la
     única copia del progreso: una escritura interrumpida siempre se
     puede recuperar desde el respaldo. Formato: { backup: captureSlot(), savedAt, v: 1 }. */
  function stashSlotBeforeWipe(owner) {
    const slot = captureSlot();
    if (!hasContent(slot)) return true; /* nada que custodiar */
    const backupKey = ownerSlotKey(owner) + ':stash';
    const ok = SMR.store.set(backupKey, { backup: slot, savedAt: Date.now(), v: 1 });
    if (!ok) {
      /* cuota llena: el stash falla — PERO el contenido sigue vivo en el
         slot (todavía no fue limpiado), de modo que nunca desaparece. */
      warn('stash de slot falló (¿cuota?); el contenido vivo sigue intacto', new Error('quota'));
      return false;
    }
    return true;
  }

  function writeSlotSafely(obj, owner) {
    /* si el nuevo contenido es VACÍO o AJENO (distinto del vivo), custodiar antes */
    const willWipeOrReplace = !obj || !hasContent(obj) || !sameQuarantineContent(SLOT_KEYS.reduce((a, k) => { a[k] = obj[k] === undefined ? null : obj[k]; return a; }, {}), captureSlot());
    if (willWipeOrReplace) stashSlotBeforeWipe(owner || currentOwner());
    writeSlot(obj);
    /* si el write fue completo y no vacío, retirar el stash temprano */
    if (obj && hasContent(obj)) {
      SMR.store.remove(ownerSlotKey(owner || currentOwner()) + ':stash');
    }
  }

  /* Guarda el estado vivo bajo `owner` (snapshot completo, no merge).
     Devuelve true si quedó registrado. */
  function archiveSlotFor(owner, beforeAt) {
    if (!owner) return false;
    const slot = captureSlot();
    if (!hasContent(slot)) {
      /* sin contenido no hay nada que custodiar; deja el slot tal cual */
      return false;
    }
    const stored = { slot: slot, savedAt: beforeAt || Date.now(), v: 1 };
    SMR.store.set(ownerSlotKey(owner), stored);
    return true;
  }

  /* Carga el snapshot de `owner` en el slot vivo. Devuelve el contenido
     instalado (o null si el dueño no tenía snapshot). */
  function restoreSlotFor(owner) {
    if (!owner) return null;
    const raw = SMR.store.get(ownerSlotKey(owner), null);
    if (raw && typeof raw === 'object' && Array.isArray(raw.__slotKeys)) {
      /* formato v2 (por si acaso): { __slotKeys, entries } */
      const entries = raw.__slotKeys;
      /* formato no soportado: no se instala, se conserva y es null */
      void entries;
    }
    if (raw && typeof raw === 'object' && raw.slot && typeof raw.slot === 'object') {
      /* 8.4.4 (B-1): instalar el contenido del dueño custodiando antes
         el slot vivo (no perderlo si la cuota interrumpe la escritura). */
      writeSlotSafely(raw.slot, owner);
      return raw.slot;
    }
    /* el dueño no tiene snapshot previo en este dispositivo → slot limpio */
    writeSlotSafely(Object.fromEntries(SLOT_KEYS.map((k) => [k, null])), owner);
    return null;
  }

  /* Contenido global pre-8.4.2 sin dueño: NO se descarta. Con contenido
     se guarda bajo __unknown__ y deja el slot limpio para el nuevo
     dueño. Nunca se restaura automáticamente (no atribuir sin certeza).
     8.4.4 (H-3): la cuarentena es una LISTA: dos contenidos distintos
     sin dueño coexisten (append), el idéntico no se duplica y, si el
     almacenamiento falla o el slot previo está corrupto, se sepulca demorada en una clave colisión-free; NADA se pierde. */
  const QUARANTINE_MAX = 20; /* límite razonable de entradas por dispositivo */

  function sameQuarantineContent(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return JSON.stringify(a || {}) === JSON.stringify(b || {}); }
  }

  function quarantineUnownedContent() {
    const slot = captureSlot();
    if (!hasContent(slot)) return;
    const entry = { slot: slot, savedAt: Date.now(), v: 1 };
    const raw = SMR.store.get(ownerSlotKey(UNKNOWN_OWNER), null);
    /* dos formatos soportados: v1 (slot único, categoría anterior) y v2 (lista). */
    let list;
    if (raw && typeof raw === 'object' && Array.isArray(raw.quarantine)) {
      list = raw.quarantine;
    } else if (raw && typeof raw === 'object' && raw.slot) {
      list = [raw];           /* migración implicita v1 → v2 (el contenido previo se conserva) */
    } else if (raw) {
      /* slot __unknown__ corrupto: NO se pisa. Se respalda de inmediato
         en una clave colisión-free y se crea una lista nueva. */
      const corruptKey = ownerSlotKey(UNKNOWN_OWNER) + ':' + Date.now().toString(36);
      SMR.store.set(corruptKey, raw);
      warn('__unknown__ corrupto; contenido previo respaldado en ' + corruptKey, new Error('corrupt slot'));
      list = [];
    } else {
      list = [];
    }
    /* el contenido idéntico NO se duplica (idempotencia del push actual
       contra la misma cuarentena a mitad de ssecciones) */
    if (list.some((e) => e && typeof e === 'object' && e.slot && sameQuarantineContent(e.slot, slot))) return;
    list.push(entry);
    if (list.length > QUARANTINE_MAX) list = list.slice(-QUARANTINE_MAX); /* conserva la más reciente */
    const ok = SMR.store.set(ownerSlotKey(UNKNOWN_OWNER), { quarantine: list, v: 2 });
    if (!ok) {
      /* cuota agotada: la escritura lista falla → copia colisión-free
         (SMR.store.set devuelve false, pero no lanza) para no perderla. */
      const backupKey = ownerSlotKey(UNKNOWN_OWNER) + ':' + Date.now().toString(36);
      SMR.store.set(backupKey, entry);
      warn('cuarentena: escritura de lista fallida; entrada respaldada en ' + backupKey, new Error('quota'));
    }
  }
  const DAY_MS = 86400000;
  /* límites del modelo local (app.js): HISTORY_LIMIT=60, studySessions=20 */
  const LOCAL_HISTORY_LIMIT = 60;

  const runtime = {
    currentUser: null,
    liveOwner: readLiveOwner(), /* 8.5.11 (D-3): dueño del slot vivo al arrancar */
    syncing: false,
    initialSyncFor: null, /* uid con sync inicial ya programado (8.4.1, A2) */
    retryTimer: null,
    retryDelay: 3000,
    maxRetryDelay: 120000,
    maxRetries: 10, /* reintentos transitorios seguidos; la cola persiste y el próximo envío la retoma */
    retryCount: 0,
    authPaused: false, /* JWT/401: la cola se conserva y se reanuda al reautenticar */
    /* 8.6.3: transición de slots DIFERIDA por falta de exclusión. Mientras esté
       activo, NO se escribe nada: el estado en memoria es del dueño anterior. */
    transitionPending: false,
    deferredUser: null,
    deferredBody: null,
    transitionTimer: null
  };

  /* ---------- cola persistida (por propietario, 8.4.1) ---------- */

  function emptyQueue() {
    return { attempts: [], sessions: [], activity: [], wrongEvents: [], streakDays: [], failed: {} };
  }

  /* Propietario de la cola: uid de la sesión activa o 'guest'. El
     propietario se fija al CREAR el evento, nunca al enviarlo. */
  function currentOwner() {
    return (runtime.currentUser && runtime.currentUser.id) ? runtime.currentUser.id : 'guest';
  }

  function readQueueFor(owner) {
    const q = SMR.store.get(QUEUE_PREFIX + owner, null);
    return (q && typeof q === 'object' && !Array.isArray(q)) ? q : emptyQueue();
  }

  function writeQueueFor(owner, q) {
    SMR.store.set(QUEUE_PREFIX + owner, q);
  }

  function readQueue(owner) { return readQueueFor(owner || currentOwner()); }
  function writeQueue(q, owner) { writeQueueFor(owner || currentOwner(), q); }

  function queueFor(kind, owner) {
    const q = readQueue(owner);
    if (!Array.isArray(q[kind])) q[kind] = [];
    return q[kind];
  }

  function enqueueEvent(kind, entry, dedupeKeyFn) {
    /* Dueño fijado AHORA (momento de creación): un evento de A jamás se
       encola en la cola de B (A1). */
    const owner = currentOwner();
    const q = readQueue(owner);
    if (!Array.isArray(q[kind])) q[kind] = [];
    const key = dedupeKeyFn(entry);
    if (key && q[kind].some((e) => dedupeKeyFn(e) === key)) return false; /* ya en cola */
    q[kind].push(entry);
    writeQueue(q, owner);
    return true;
  }

  /* claves estables por tipo de evento (idempotencia de la cola; las
     entradas se comparan por clave, nunca por identidad de objeto, porque
     cada readQueue() re-parsea JSON fresco) */
  const EVENT_KEYS = {
    attempts: (e) => `${e.test_id}|${e.mode}|${e.created_at}`,
    sessions: (e) => `${e.created_at}|${e.minutes}|${e.steps}`,
    activity: (e) => `${e.label}|${e.meta}|${e.created_at}`,
    wrongEvents: (e) => `${e.test_id}|${e.question_key}|${e.event_type}|${e.created_at || e.client_created_at}`,
    streakDays: (e) => e.day
  };

  function removeQueued(kind, entries, owner) {
    const keyFn = EVENT_KEYS[kind];
    if (!keyFn) return;
    const keys = new Set(entries.map(keyFn));
    const q = readQueue(owner);
    if (!Array.isArray(q[kind])) return;
    q[kind] = q[kind].filter((e) => !keys.has(keyFn(e)));
    writeQueue(q, owner);
  }

  /* Dead-letter (8.4.1, M5): aparta eventos SIN retirarlos del
     almacenamiento (recuperación manual documentada). Solo para errores
     permanentes; los transitorios siguen reintentando con backoff. */
  function deadLetter(kind, entries, reason, owner) {
    const keyFn = EVENT_KEYS[kind];
    const own = owner || currentOwner();
    const q = readQueue(own);
    if (!Array.isArray(q[kind])) q[kind] = [];
    if (!q.failed || typeof q.failed !== 'object' || Array.isArray(q.failed)) q.failed = {};
    if (!Array.isArray(q.failed[kind])) q.failed[kind] = [];
    const keys = new Set(entries.map(keyFn));
    const moved = q[kind].filter((e) => keys.has(keyFn(e)));
    q[kind] = q[kind].filter((e) => !keys.has(keyFn(e)));
    q.failed[kind] = q.failed[kind].concat(moved);
    writeQueue(q, own);
    warn('dead-letter ' + kind + ' (' + moved.length + ' eventos conservados en cola.failed)', new Error(reason));
  }

  /* Clasificación de errores: SQLSTATE o mensajes de validación =
     permanentes (el retry exacto volverá a fallar); el resto se trata
     como transitorio (red, expiración de sesión…). */
  function isPermanentError(err) {
    const code = err && err.code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return true;
    const msg = (err && err.message) || '';
    return /violates|not-null|check constraint|unsupported table|invalid input|identidad/i.test(msg);
  }

  /* PGRST301/302 y mensajes de JWT: sesión inválida, no un fallo de datos. */
  function isAuthError(err) {
    const code = err && err.code;
    if (code === 'PGRST301' || code === 'PGRST302') return true;
    return /jwt|not authenticated|unauthori[sz]ed|401/i.test((err && err.message) || '');
  }

  /* ---------- detección de cambios locales (wrapping) ---------- */

  function snapshotProgress(data) {
    /* JSON determinista del estado local para detectar cambios de estado
       (no de eventos) entre un sync y el siguiente. */
    return JSON.stringify({
      resources: data.resources,
      tests: { best: data.tests.best, last: data.tests.last, wrong: data.tests.wrong,
        /* 8.5.4 (B1): srs en el snapshot — sin esto, un save puramente SRS
           (scheduleSrs → save) no dispara scheduleStatePush y la tarjeta
           nunca se sube por su cuenta (observable en navegador: fila local
           sin fila remota hasta el próximo ciclo por otra vía). */
        srs: data.tests.srs },
      cases: data.cases,
      streak: data.streak,
      studyMinutes: data.studyMinutes
    });
  }

  const originalSave = SMR.progress.save;
  SMR.progress.save = function () {
    const before = runtime.lastSnapshot;
    const result = originalSave.call(SMR.progress);
    /* 8.5.13: el slot vivo acaba de quedar con el contenido de ESTA pestaña */
    writeLiveWriter(liveOwnerFor());
    const after = snapshotProgress(SMR.progress.data);
    if (before !== undefined && before !== after) {
      scheduleStatePush();
    }
    runtime.lastSnapshot = after;
    /* los eventos se encolan por hooks específicos, no por save genérico */
    scheduleDrain(0);
    return result;
  };

  /* ---------- hooks de eventos (wrapping de APIs locales) ---------- */

  const origRecordTest = SMR.progress.recordTest;
  SMR.progress.recordTest = function (payload) {
    const result = origRecordTest.call(SMR.progress, payload);
    try {
      const history = SMR.progress.data.tests.history;
      const last = history[history.length - 1];
      if (last && last.date) {
        enqueueEvent('attempts', {
          test_id: last.testId, title: last.title || null, mode: last.mode,
          correct: last.correct, total: last.total, pct: last.pct,
          created_at: last.date
        }, (e) => `${e.test_id}|${e.mode}|${e.created_at}`);
      }
      /* wrong_answer_events derivados del payload de answers.
         8.4.1 (C1): cada evento lleva created_at (epoch-ms cliente, orden
         estable intra-chunk) — identidad ESTABLE del evento, requerida
         por la RPC para el anti-join de idempotencia. client_created_at
         se conserva como marca de diagnóstico. */
      if (payload && Array.isArray(payload.answers) && payload.testId) {
        const srsMod = global.SMR && global.SMR.srs;
        const baseTs = Date.now();
        payload.answers.forEach((a, idx) => {
          const stable = srsMod ? srsMod.idOf(payload.testId, a.origIndex) : null;
          const questionKey = stable || String(a.origIndex);
          const eventTs = baseTs + idx; /* orden estable intra-chunk */
          enqueueEvent('wrongEvents', {
            test_id: payload.testId, question_key: questionKey,
            event_type: a.ok ? 'clear' : 'add',
            count_delta: a.ok ? 0 : 1,
            created_at: eventTs,
            client_created_at: eventTs
          }, EVENT_KEYS.wrongEvents);
        });
      }
    } catch (err) { warn('hook recordTest', err); }
    scheduleDrain(0);
    return result;
  };

  const origRecordStudySession = SMR.progress.recordStudySession;
  SMR.progress.recordStudySession = function (minutes, steps) {
    const result = origRecordStudySession.call(SMR.progress, minutes, steps);
    try {
      const sessions = SMR.progress.data.studySessions;
      const last = sessions[sessions.length - 1];
      if (last && last.ts) {
        enqueueEvent('sessions', {
          minutes: last.minutes || 0, steps: last.steps || 0, created_at: last.ts
        }, (e) => `${e.created_at}|${e.minutes}|${e.steps}`);
      }
    } catch (err) { warn('hook recordStudySession', err); }
    scheduleDrain(0);
    return result;
  };

  const origLogActivity = SMR.progress.logActivity;
  SMR.progress.logActivity = function (type, label, meta) {
    const result = origLogActivity.call(SMR.progress, type, label, meta);
    try {
      const activity = SMR.progress.data.activity;
      const last = activity[activity.length - 1];
      if (last && last.ts) {
        enqueueEvent('activity', {
          event_type: last.type, label: last.label, meta: last.meta || '',
          created_at: last.ts
        }, (e) => `${e.label}|${e.meta}|${e.created_at}`);
      }
    } catch (err) { warn('hook logActivity', err); }
    scheduleDrain(0);
    return result;
  };

  /* hook de clear de recursos: toggleCompleted pasa de done a pendiente.
     El clear local NO se ve en resources.completed (se borra la entrada),
     así que se persiste una marca smrhub:progressSyncClears {id: ts} que
     el MERGE cloud convierte en completed_cleared_at. Sin ella, el cloud
     conservaría el completed_at antiguo y lo resucitaría en el pull. */
  const origToggleCompleted = SMR.progress.toggleCompleted;
  SMR.progress.toggleCompleted = function (id) {
    const wasDone = this.isCompleted(id);
    const result = origToggleCompleted.call(SMR.progress, id);
    try {
      if (wasDone) {
        const clears = SMR.store.get('progressSyncClears', null);
        const map = (clears && typeof clears === 'object' && !Array.isArray(clears)) ? clears : {};
        map[id] = Date.now();
        SMR.store.set('progressSyncClears', map);
      }
    } catch (err) { warn('hook toggleCompleted', err); }
    return result;
  };
  /* hooks de borrado SRS (fase 8.5.7): la tarjeta se borra local y la
     marca en progressSyncSrsClears hace que el push suba el tombstone y
     que el pull no la resucite. En modo visitante (sin sesión) la marca
     queda local igual que el borrado: cero llamadas RPC. */
  const origDropSrs = SMR.progress.dropSrs;
  SMR.progress.dropSrs = function (testId, qIndex) {
    markSrsDeleted(testId, qIndex);
    return origDropSrs.call(SMR.progress, testId, qIndex);
  };
  const origScheduleSrs = SMR.progress.scheduleSrs;
  SMR.progress.scheduleSrs = function (testId, qIndex, selfRate) {
    const result = origScheduleSrs.call(SMR.progress, testId, qIndex, selfRate);
    markSrsRevive(testId, qIndex);
    return result;
  };
  const origTouchStreak = SMR.progress.touchStreak;
  SMR.progress.touchStreak = function () {
    const before = SMR.progress.data.streak.lastDay;
    const result = origTouchStreak.call(SMR.progress);
    try {
      const after = SMR.progress.data.streak.lastDay;
      if (after && after !== before) {
        enqueueEvent('streakDays', { day: after }, (e) => e.day);
      }
    } catch (err) { warn('hook touchStreak', err); }
    return result;
  };

  /* ---------- utilidades ---------- */

  function warn(context, err) {
    if (global.console && global.console.warn) {
      global.console.warn('[SMR cloud-progress]', context + ':', err && err.message ? err.message : err);
    }
  }

  /* 8.4.1 (B3): se eliminaron las utilidades UTC muertas (dayKeyToDate /
     dateToDayKey). La única convención de días es la cadena local
     'YYYY-MM-DD' de app.js dayKey(); la derivación de racha compara esas
     cadenas como días consecutivos (UTC-midnight diffs), consistente en
     cualquier zona horaria. */

  function chunkId() {
    return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  let stateTimer = null;
  function scheduleStatePush() {
    if (stateTimer) clearTimeout(stateTimer);
    stateTimer = setTimeout(() => { pushState(); }, 1200);
  }

  let drainTimer = null;
  function scheduleDrain(delay) {
    if (!runtime.currentUser || runtime.transitionPending) return;
    if (drainTimer) clearTimeout(drainTimer);
    drainTimer = setTimeout(() => { drainQueue(); }, typeof delay === 'number' ? delay : 800);
  }

  /* ---------- cola serializada ----------
     enqueue nunca anida: si un job encolado llama a chainOrNow, el trabajo
     se ejecuta INLINE (misma iteración), evitando el auto-deadlock de la
     cadena. Los externos (hooks, timers) pasan por enqueue normal. */

  let syncChain = Promise.resolve();
  runtime.inJob = false;
  function enqueue(job) {
    syncChain = syncChain.then(async () => {
      runtime.inJob = true;
      try { await job(); } finally { runtime.inJob = false; }
    }).catch((err) => warn('chain', err));
    return syncChain;
  }
  function chainOrNow(fn) {
    return runtime.inJob ? fn() : enqueue(fn);
  }

  /* ================================================================
     PUSH: eventos append-only (por chunks idempotentes)
     ================================================================ */

  function pushEvents() {
    const ATTEMPT_LIMIT = 100;
    /* 8.4.1 (A1): se leen y se retiran eventos SIEMPRE de la cola del
       propietario capturado aquí; si la sesión cambia a mitad de envío,
       el resto de eventos queda en su cola original (no se re-atribuyen). */
    const owner = currentOwner();
    const attempts = queueFor('attempts', owner).slice(0, ATTEMPT_LIMIT);
    const sessions = queueFor('sessions', owner).slice(0, ATTEMPT_LIMIT);
    const activity = queueFor('activity', owner).slice(0, ATTEMPT_LIMIT);
    const wrongEvents = queueFor('wrongEvents', owner).slice(0, ATTEMPT_LIMIT);

    const jobs = [];
    if (attempts.length) jobs.push({ kind: 'attempts', table: 'test_attempts', events: attempts });
    if (sessions.length) jobs.push({ kind: 'sessions', table: 'study_sessions', events: sessions });
    if (activity.length) jobs.push({ kind: 'activity', table: 'activity_events', events: activity });
    if (wrongEvents.length) jobs.push({ kind: 'wrongEvents', table: 'wrong_answer_events', events: wrongEvents });
    if (!jobs.length) return Promise.resolve();

    return chainOrNow(async () => {
      for (const job of jobs) {
        /* 8.4.1 (A1): si la sesión cambió a mitad de push, abortar sin
           retirar nada — cada evento volverá a enviarse con SU cuenta. */
        if (currentOwner() !== owner) return;
        const cid = chunkId();
        const times = job.events.map((e) => e.created_at || e.client_created_at || 0);
        try {
          const { data, error } = await sb.rpc('sync_progress_chunk', {
            p_chunk_id: cid,
            p_table: job.table,
            p_events: job.events,
            p_first_created_at: Math.min.apply(null, times),
            p_last_created_at: Math.max.apply(null, times)
          });
          if (error) { const e = new Error(error.message); e.code = error.code; throw e; }
          /* éxito (insertados o ya-duplicados): quitar del queue por clave */
          removeQueued(job.kind, job.events, owner);
        } catch (err) {
          warn('push ' + job.kind, err);
          if (isAuthError(err)) { runtime.authPaused = true; return; } /* no dead-letter: se reintenta tras reautenticar */
          /* 8.4.1 (M5): un dominio fallido NO bloquea a los demás — se
             continúa con el resto de jobs en lugar de abandonar el ciclo. */
          if (isPermanentError(err)) {
            deadLetter(job.kind, job.events, err.message, owner);
          }
          /* lo transitorio queda en cola: drainQueue reintenta con backoff */
        }
      }
      if (currentOwner() !== owner) return;
      pushState(); /* tras eventos, empuja también estado derivado */
      /* Los eventos transitorios fallidos siguen en la cola: drainQueue
         detecta `still > 0` y programa el reintento con backoff. */
    });
  }

  /* ================================================================
     PUSH: estado (test_scores, resource_state, streak_days, case_solutions)
     ================================================================ */

  /* 8.4.4 (H-1): identidad de sesión para operaciones cloud de estado.
     Captura el objeto base `SMR.progress.data` con el que comenzó la
     operación; tras cada `await` relevante, `sessionChangedFor()`
     detecta (a) cambio de cuenta/owner y (b) que el objeto vivo fue
     REEMPLAZADO por un swap de cuenta (sanitizeProgressLocal cambia la
     referencia al instalar el estado de otro dueño). Si cambió, la
     operación obsoleta se ABORTA antes de cualquier escritura cloud que
     pudiera propagar datos de B como progreso de A (o viceversa). */
  function sessionHandleFor() {
    return { owner: currentOwner(), uid: runtime.currentUser && runtime.currentUser.id, dataRef: SMR.progress.data, at: Date.now() };
  }
  function sessionChangedFor(handle) {
    if (!handle) return false;
    if (currentOwner() !== handle.owner) return true;
    if ((runtime.currentUser && runtime.currentUser.id) !== handle.uid) return true;
    if (SMR.progress.data !== handle.dataRef) return true; /* swap de cuenta instaló otro estado */
    return false;
  }

  function pushState() {
    if (!runtime.currentUser || runtime.transitionPending) return;
    return chainOrNow(async () => {
      const uid = runtime.currentUser.id;
      const owner = currentOwner();
      const data = SMR.progress.data;
      const sessionHandle = sessionHandleFor();
      const now = Date.now();

      /* --- test_scores: derivar de history + best local ---
         8.4.1 (A3): best_pct se mergea con MAX(local, cloud) sobre
         lectura fresca — un dispositivo con peor marca NUNCA regresa el
         best de la caché cloud (la política documentada "best = MAX" se
         implementa de verdad). last_pct = último attempt local (que ya
         incluye el pull); si no hay historial local, se conserva el
         valor cloud en vez de pisarlo con null. */
      let cloudBest = {};
      let cloudLast = {};
      try {
        const { data: cloudRows, error } = await sb.from('test_scores')
          .select('test_id, best_pct, last_pct')
          .eq('user_id', uid);
        if (error) throw new Error(error.message);
        (cloudRows || []).forEach((r) => {
          cloudBest[r.test_id] = r.best_pct;
          cloudLast[r.test_id] = r.last_pct;
        });
      } catch (err) {
        warn('pull test_scores (pre-merge)', err);
        return; /* sin lectura fresca no hay merge seguro: se reintenta */
      }
      /* 8.4.4 (H-1): la cuenta cambió mientras se LEÍAN los test_scores
         del cloud de A: abortar ANTES de cualquier upsert. Si no, las
         filas derivadas del estado vivo (ahora de B) se enviarían con
         user_id de A. */
      if (sessionChangedFor(sessionHandle)) return;

      const scoresByTest = {};
      Object.keys(data.tests.best).forEach((testId) => {
        const lastEntry = [...data.tests.history].reverse().find((h) => h.testId === testId);
        const localBest = data.tests.best[testId];
        const best = (typeof cloudBest[testId] === 'number') ? Math.max(localBest, cloudBest[testId]) : localBest;
        const last = lastEntry ? lastEntry.pct
          : (typeof data.tests.last[testId] === 'number' ? data.tests.last[testId]
            : (typeof cloudLast[testId] === 'number' ? cloudLast[testId] : null));
        scoresByTest[testId] = {
          user_id: uid, test_id: testId,
          best_pct: best,
          last_pct: last,
          client_updated_at: now
        };
      });
      /* tests.last sin best (modo que no afecta best) también persiste */
      Object.keys(data.tests.last).forEach((testId) => {
        if (!scoresByTest[testId] && typeof data.tests.last[testId] === 'number') {
          scoresByTest[testId] = {
            user_id: uid, test_id: testId,
            best_pct: (typeof cloudBest[testId] === 'number') ? cloudBest[testId] : null,
            last_pct: data.tests.last[testId],
            client_updated_at: now
          };
        }
      });
      /* tests solo en cloud: se conservan intactos (no se regresan) */
      Object.keys(cloudBest).forEach((testId) => {
        if (!scoresByTest[testId]) {
          scoresByTest[testId] = {
            user_id: uid, test_id: testId,
            best_pct: cloudBest[testId] ?? null,
            last_pct: cloudLast[testId] ?? null,
            client_updated_at: now
          };
        }
      });
      const scoreRows = Object.values(scoresByTest);
      if (scoreRows.length) {
        const { error } = await sb.from('test_scores').upsert(scoreRows, { onConflict: 'user_id,test_id' });
        if (error) { warn('push test_scores', error); return; }
      }
      /* 8.4.4 (H-1): tras el upsert de scores, si la sesión cambió no se
         continúa con streak/resource/case (evita leer el estado de B y
         mesclarlo en las escrituras de A). */
      if (sessionChangedFor(sessionHandle)) return;

      /* --- streak_days: unión por día (los nuevos ya están en cola) --- */
      const q = readQueue(owner);
      if (Array.isArray(q.streakDays) && q.streakDays.length) {
        const rows = q.streakDays.map((e) => ({ user_id: uid, day: e.day }));
        const { error } = await sb.from('streak_days').upsert(rows, { onConflict: 'user_id,day', ignoreDuplicates: true });
        if (error) { warn('push streak_days', error); return; }
        removeQueued('streakDays', q.streakDays, owner);
      }

      /* --- resource_state: MERGE con cloud (requiere lectura fresca) --- */
      if (sessionChangedFor(sessionHandle)) return;
      await syncResourceState(uid, now, sessionHandle);

      /* 8.4.4 (H-1): guard antes de casos (la cuenta pudo cambiar durante
         el merge de resource_state) */
      if (sessionChangedFor(sessionHandle)) return;
      /* --- case_solutions --- */
      await syncCaseSolutions(uid, now, sessionHandle);

      /* 8.5: srs_cards (estado por tarjeta; hereda guards de sesión y
         serialización del mismo pushState encolado). */
      if (sessionChangedFor(sessionHandle)) return;
      await syncSrsCards(uid, now, sessionHandle);
    });
  }

  /* ================================================================
     resource_state: MERGE respetando completed_cleared_at
     ================================================================ */

  async function syncResourceState(uid, now, sessionHandle) {
    const dataRefAtStart = SMR.progress.data;
    const local = SMR.progress.data.resources;
    /* marcas de clear local (id → ts): autoridad de 'des-completado'.
       El clear borra la entrada de resources.completed, invisible para el
       MERGE; la marca permite subir completed_cleared_at al cloud. */
    const clearsRaw = SMR.store.get('progressSyncClears', null);
    const clears = (clearsRaw && typeof clearsRaw === 'object' && !Array.isArray(clearsRaw)) ? clearsRaw : {};
    let cloudRows = [];
    try {
      const { data, error } = await sb.from('resource_state')
        .select('resource_id, viewed_at, completed_at, completed_cleared_at, self_assessment, self_assessment_at')
        .eq('user_id', uid);
      if (error) throw new Error(error.message);
      cloudRows = data || [];
    } catch (err) {
      warn('pull resource_state', err);
      return; /* sin cloud accesible: no se toca nada */
    }

    const cloudById = {};
    cloudRows.forEach((r) => { cloudById[r.resource_id] = r; });

    const ids = new Set([
      ...Object.keys(local.viewed),
      ...Object.keys(local.completed),
      ...Object.keys(local.selfAssessment),
      ...Object.keys(cloudById)
    ]);

    const upserts = [];
    const mergedLocal = { viewed: Object.assign({}, local.viewed), completed: Object.assign({}, local.completed), selfAssessment: Object.assign({}, local.selfAssessment) };
    let localChanged = false;

    ids.forEach((id) => {
      const lv = local.viewed[id] || null;
      const lc = local.completed[id] || null;
      const ls = typeof local.selfAssessment[id] === 'number' ? local.selfAssessment[id] : null;
      const c = cloudById[id] || {};
      /* marca de clear local (si existe para este recurso) */
      const localClearAt = typeof clears[id] === 'number' ? clears[id] : null;

      /* viewed: MAX de ambos */
      const viewed = Math.max(lv || 0, c.viewed_at || 0) || null;

      /* completed: activo si local activo O cloud activo (completed_at > completed_cleared_at) */
      const cloudActive = c.completed_at && (!c.completed_cleared_at || c.completed_at > c.completed_cleared_at);
      const localActive = !!lc;
      /* el clear local más reciente entre marca local y cloud gana */
      const effectiveClearAt = Math.max(localClearAt || 0, c.completed_cleared_at || 0) || null;
      const localClearWins = localClearAt && (!lc || localClearAt > lc);

      let completed = null;
      if (localActive && (!effectiveClearAt || effectiveClearAt < lc)) {
        /* local activo y su clear (si lo hay) es anterior → activo */
        completed = Math.max(lc, cloudActive ? c.completed_at : 0) || lc;
      } else if (localActive) {
        /* local activo pero con clear local posterior → des-completado */
        completed = null;
      } else if (localClearWins && localClearAt >= (cloudActive ? c.completed_at : 0)) {
        /* clear local posterior al completed del cloud → des-completado */
        completed = null;
      } else if (cloudActive) {
        completed = c.completed_at;
      }
      /* completed_cleared_at a subir: el más reciente de ambos mundos */
      const completedClearedAt = effectiveClearAt;

      /* self_assessment: último por _at */
      let selfAssessment = ls;
      let selfAssessmentAt = ls !== null ? now : null;
      if (c.self_assessment !== null && c.self_assessment !== undefined) {
        const cAt = c.self_assessment_at || 0;
        const lAt = ls !== null ? (local.viewed[id] || now) : -1;
        if (cAt > lAt) { selfAssessment = c.self_assessment; selfAssessmentAt = cAt; }
      }

      if (viewed || completed || completedClearedAt) upserts.push({ user_id: uid, resource_id: id, viewed_at: viewed, completed_at: completed, completed_cleared_at: completedClearedAt, self_assessment: selfAssessment, self_assessment_at: selfAssessmentAt, client_updated_at: now });

      /* actualizar el local con lo que venga del cloud */
      if (c.viewed_at && (!lv || c.viewed_at > lv)) { mergedLocal.viewed[id] = c.viewed_at; localChanged = true; }
      if (cloudActive && (!lc || c.completed_at > lc) && (!effectiveClearAt || effectiveClearAt < c.completed_at)) { mergedLocal.completed[id] = c.completed_at; localChanged = true; }
      if (selfAssessment !== null && selfAssessment !== ls) { mergedLocal.selfAssessment[id] = selfAssessment; localChanged = true; }
      /* clear ganador aplicado también al local (des-completar) */
      if (completed === null && lc && effectiveClearAt && effectiveClearAt >= lc) {
        delete mergedLocal.completed[id];
        localChanged = true;
      }
    });

    /* 8.4.4 (H-1): si el estado vivo (obj) cambió de dueño a mitad del
       MERGE, abortar sin upsert y sin tocar el local: la lectura
       `local` puede tener datos de la cuenta nueva. */
    if (sessionChangedFor(sessionHandle) || SMR.progress.data !== dataRefAtStart) return;

    if (upserts.length) {
      const { error } = await sb.from('resource_state').upsert(upserts, { onConflict: 'user_id,resource_id' });
      if (error) { warn('push resource_state', error); return; }
    }

    if (localChanged) {
      /* escribir el merge en el local SIN disparar de nuevo el push */
      runtime.lastSnapshot = undefined; /* evita el trigger de save */
      SMR.progress.data.resources = mergedLocal;
      originalSave.call(SMR.progress);
      runtime.lastSnapshot = snapshotProgress(SMR.progress.data);
    }
  }

  /* ================================================================
     case_solutions: unión (el más reciente por ts gana la option)
     ================================================================ */

  async function syncCaseSolutions(uid, now, sessionHandle) {
    const dataRefAtStart = SMR.progress.data;
    const local = SMR.progress.data.cases.solved;
    let cloudRows = [];
    try {
      const { data, error } = await sb.from('case_solutions')
        .select('case_id, option, client_updated_at')
        .eq('user_id', uid);
      if (error) throw new Error(error.message);
      cloudRows = data || [];
    } catch (err) {
      warn('pull case_solutions', err);
      return;
    }

    /* 8.4.4 (H-1): abortar si el estado vivo cambió de dueño mientras se
       leía case_solutions del cloud de A. */
    if (sessionChangedFor(sessionHandle) || SMR.progress.data !== dataRefAtStart) return;

    const cloudById = {};
    cloudRows.forEach((r) => { cloudById[r.case_id] = r; });
    const ids = new Set([...Object.keys(local), ...Object.keys(cloudById)]);
    const upserts = [];
    let localChanged = false;

    ids.forEach((cid) => {
      const l = local[cid];
      const c = cloudById[cid];
      const lTs = l ? (l.ts || 0) : -1;
      const cTs = c ? (c.client_updated_at || 0) : -1;
      if (lTs >= cTs) {
        /* local igual o más reciente → subir (LWW por ts de cliente) */
        upserts.push({ user_id: uid, case_id: cid, option: l.option, client_updated_at: l.ts || now });
      } else {
        /* 8.4.1 (M2): cloud más reciente → se refleja en local (antes el
           local se quedaba y los dispositivos divergían para siempre).
           Determinista: gana el ts de cliente más alto; empate → local. */
        local[cid] = { option: c.option, ts: c.client_updated_at || now };
        localChanged = true;
      }
    });

    if (upserts.length) {
      const { error } = await sb.from('case_solutions').upsert(upserts, { onConflict: 'user_id,case_id' });
      if (error) { warn('push case_solutions', error); return; }
    }
    if (localChanged) {
      runtime.lastSnapshot = undefined;
      originalSave.call(SMR.progress);
      runtime.lastSnapshot = snapshotProgress(SMR.progress.data);
    }
  }

  /* ================================================================
     Fase 8.5: srs_cards — estado POR TARJETA, unión conservadora

     Tarjeta local: tests.srs[key] = { level, due }, key = q-<16hex>
     (SMR.srs.isStableKey). Política de conflicto (unidad: tarjeta entera):
       1. Gana el level más alto.
       2. Mismo level → gana la due más lejana: con el mismo intervalo,
          due = touch + intervalo[level], así que due más lejana equivale a
          "revisión más reciente". Es LWW real sin timestamps locales y
          NO retrasa repasos (el intervalo es el mismo en ambos lados).
       3. Mismo level y misma due → client_updated_at de cliente más alto
          (solo desempata dues iguales); empate o ts inválido → local.
     Nunca se mezclan campos de revisiones distintas (la invariante
     level→interval→due de scheduleSrs se conserva).

     ORDEN pull→merge→push (no push antes de pull): un push previo al
     pull sobrescribiría en el cloud una fila remota de nivel superior
     ANTES de que el merge pudiera verla (pérdida de progreso). El push
     final envía el estado local YA mezclado, idempotente por PK.

     Política de borrado (fase 8.5.7): tombstones remotos y recuperación explícita.
      La ausencia local, por sí sola, NUNCA elimina una fila remota. Los borrados se
     sincronizan mediante tombstones y la recuperación mediante `revived=true`;
     no se ejecuta un DELETE físico remoto. Una fila remota de una pregunta
     fuera del banco actual no se instala en `tests.srs` ni se reasigna.
     `tests.srsLegacy` y las claves legacy/posicionales nunca se suben.
     ================================================================ */

  /* ID estable como claves subidas/descargadas:q-<16hex>(|-[n] colisión) */
  const SRS_KEY_OK = /^q-[0-9a-f]{16}(?:-\d+)?$/;
  const SRS_CARD_LIMIT = 500;

  /* --- fase 8.5.7: borrado remoto de tarjetas SRS ---

     Marca local por clave estable en progressSyncSrsClears (clave de
     SLOT_KEYS: hereda el aislamiento por propietario del progreso).
     Estados:
       'pending' → borrado pedido; el tombstone aún no se ha observado en
                   cloud: se reintenta cada ciclo y bloquea reinstalar la
                   fila cloud viva (anti-resurrección local).
       'known'   → tombstone observado en cloud; no se reenvía. Habilita
                   el revive y detecta que la fila volvió a estar viva.
       'revive'  → el propietario re-valoró la pregunta: se sube la
                   tarjeta con revived=true y, al confirmar el push, la
                   marca se elimina.
     La marca nunca guarda {level,due}: el servidor conserva la última
     tarjeta real de la fila al marcarla como borrada. */
  const SRS_CLEARS_KEY = 'progressSyncSrsClears';

  function readSrsClears() {
    const out = {};
    try {
      const store = SMR.store;
      if (!store || typeof store.get !== 'function') return out;
      const raw = store.get(SRS_CLEARS_KEY, null);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
      Object.keys(raw).forEach((key) => {
        const state = raw[key];
        if (SRS_KEY_OK.test(key) && (state === 'pending' || state === 'known' || state === 'revive')) out[key] = state;
      });
    } catch (err) { /* store ilegible: se sigue sin marcas */ }
    return out;
  }

  function writeSrsClears(map) {
    try {
      const store = SMR.store;
      if (!store || typeof store.set !== 'function') return;
      store.set(SRS_CLEARS_KEY, map || {});
    } catch (err) { warn('marcas de borrado SRS', err); }
  }

  /* 8.5.14: la clave de marcas es COMPARTIDA entre pestañas y el ciclo de SRS
     la lee antes de un `await` (la RPC). Escribir de vuelta la copia leída
     perdía las marcas que otra pestaña crease durante la espera: el tombstone
     no llegaba nunca a la nube y el pull siguiente resucitaba la tarjeta.
     `applySrsClear` re-lee la clave y aplica SOLO la transición decidida, con
     la semántica explícita de cada estado (no es una unión indiscriminada):
       - state null + `expected`  → consume la marca solo si sigue en ESE estado
         (un 'pending' posterior significa que la tarjeta se volvió a borrar y
         debe sobrevivir; un 'revive' posterior significa lo mismo).
       - 'known'                  → pendiente o AUSENTE → known (tombstone
         observado en cloud); no pisa 'revive' ni un estado ya 'known'. El
         caso ausente importa: un dispositivo que descubre el tombstone de
         otro (nunca lo borró él) debe recordarlo para no resucitar la
         tarjeta ni perder la detección del revive.
     Ninguna transición inventa estados ni timestamps. */
  function applySrsClear(key, state, expected) {
    try {
      const fresh = readSrsClears();
      const cur = fresh[key];
      if (state === null) {
        if (cur === undefined) return;
        if (expected !== undefined && cur !== expected) return;
        delete fresh[key];
      } else {
        if (cur === state) return;
        if (state === 'known' && cur !== undefined && cur !== 'pending') return;
        fresh[key] = state;
      }
      writeSrsClears(fresh);
    } catch (err) { warn('transición de marca de borrado SRS', err); }
  }

  /* dropSrs: si la pregunta tiene ID estable, deja constancia del borrado
     para que el push lo propague (sin ID estable, borrado solo local). */
  function markSrsDeleted(testId, qIndex) {
    try {
      const srsMod = global.SMR && global.SMR.srs;
      const key = srsMod && srsMod.idOf(testId, qIndex);
      if (!key || !SRS_KEY_OK.test(key)) return;
      const clears = readSrsClears();
      clears[key] = 'pending';
      writeSrsClears(clears);
    } catch (err) { warn('marca de borrado SRS', err); }
  }

  /* scheduleSrs: valorar una pregunta borrada es la señal explícita de
     revive que el servidor exige para limpiar el tombstone. */
  function markSrsRevive(testId, qIndex) {
    try {
      const srsMod = global.SMR && global.SMR.srs;
      const key = srsMod && srsMod.idOf(testId, qIndex);
      if (!key || !SRS_KEY_OK.test(key)) return;
      const clears = readSrsClears();
      if (clears[key] && clears[key] !== 'revive') {
        clears[key] = 'revive';
        writeSrsClears(clears);
      }
    } catch (err) { warn('marca de revive SRS', err); }
  }

  function srsValidCard(c) {
    return c && typeof c === 'object'
      && typeof c.level === 'number' && isFinite(c.level) && c.level >= 0 && c.level <= 5
      && typeof c.due === 'number' && isFinite(c.due);
  }  /* subir/leer srs_cards: pull→merge→push (solo claves estables) */
  async function syncSrsCards(uid, now, sessionHandle) {
    const dataRefAtStart = SMR.progress.data;
    const local = SMR.progress.data.tests.srs;
    if (!local || typeof local !== 'object' || Array.isArray(local)) return;

    /* 1. PULL (antes de cualquier push: ver orden en la cabecera). */
    const cloudTomb = {}; /* claves con fila tombstone en cloud (8.5.7) */
    let cloudRows = [];
    try {
      const { data, error } = await sb.from('srs_cards')
        .select('question_key, level, due, client_updated_at, deleted_at')
        .eq('user_id', uid)
        .limit(SRS_CARD_LIMIT);
      if (error) { warn('pull srs_cards', error); return; }
      cloudRows = data || [];
    } catch (err) { warn('pull srs_cards', err); return; }

    if (sessionChangedFor(sessionHandle) || SMR.progress.data !== dataRefAtStart) return;

    const cloudById = {};
    cloudRows.forEach((r) => {
      if (!r || !SRS_KEY_OK.test(r.question_key)) return;
      /* tombstone (fase 8.5.7): la fila está marcada como borrada */
      if (r.deleted_at !== null && r.deleted_at !== undefined) { cloudTomb[r.question_key] = true; return; }
      if (srsValidCard(r)) cloudById[r.question_key] = r;
    });

    /* 2. MERGE determinista. Solo participan las claves locales estables
       válidas y las filas cloud cuya pregunta está en el banco actual
       (resolveSrsKey); las desconocidas se ignoran localmente y quedan
       intactas en el cloud (sin reasignar ni borrar). */
    const resolveLocal = (key) => {
      const srsMod = global.SMR && global.SMR.srs;
      return srsMod ? srsMod.resolveSrsKey(key) : null;
    };
    const keys = new Set(Object.keys(local).filter((k) => SRS_KEY_OK.test(k) && srsValidCard(local[k])));
    Object.keys(cloudById).forEach((k) => { if (resolveLocal(k)) keys.add(k); });

    /* 2a. TOMBSTONES cloud (8.5.7): retirar la copia local y recordar el
       borrado. Con marca 'revive' (el propietario re-valoró después) se
       conserva la tarjeta local: el push la subirá revived=true. */
    const clears = readSrsClears();
    /* 8.5.14: las transiciones se APUNTAN y se aplican al final sobre una
       lectura fresca de la clave (nunca escribiendo esta copia, que puede
       quedar obsoleta durante el await). `clears` sigue siendo la vista de
       ESTE ciclo para las decisiones y para construir el push. */
    const clearOps = [];
    const setClear = (key, state, expected) => {
      if (!state) {
        if (clears[key] === undefined) return;
        delete clears[key];
      } else {
        if (clears[key] === state) return;
        clears[key] = state;
      }
      clearOps.push([key, state, expected]);
    };
    let localChanged = false;
    Object.keys(cloudTomb).forEach((k) => {
      if (clears[k] === 'revive') return;
      if (local[k]) { delete local[k]; localChanged = true; }
      setClear(k, 'known');
    });
    /* Ninguna clave con borrado conocido (sin revive) mantiene tarjeta
       local viva: el push sube el tombstone y nunca una tarjeta viva. */
    Object.keys(clears).forEach((k) => {
      if (clears[k] !== 'revive' && local[k]) { delete local[k]; localChanged = true; }
    });

    keys.forEach((k) => {
      const state = clears[k];
      const l = local[k];
      const c = cloudById[k];
      /* borrado 'pending' (tombstone aún no confirmado en cloud): la fila
         viva NO se reinstala — si no, el propio dispositivo resucitaría la
         tarjeta que acaba de borrar. El push reintenta el tombstone. */
      if (state === 'pending') {
        if (l) { delete local[k]; localChanged = true; }
        return;
      }
      /* 'known' + fila viva: el cloud volvió a estar vivo DESPUÉS de haber
         observado el tombstone (revive en otro dispositivo) → se acepta la
         tarjeta y la marca deja de ser necesaria. */
      if (state === 'known' && c) setClear(k, null, 'known');
      if (!c) return; /* solo local: se subirá en el push final */
      const localValid = srsValidCard(l);
      let winner = 'local';
      if (!localValid) {
        winner = 'cloud'; /* tarjeta local corrupta: la válida remota gana */
      } else if (c.level > l.level) {
        winner = 'cloud';                       /* regla 1: level mayor */
      } else if (c.level === l.level) {
        if (c.due > l.due) {
          winner = 'cloud';                     /* regla 2: revisión más reciente */
        } else if (c.due === l.due) {
          const cAt = typeof c.client_updated_at === 'number' && isFinite(c.client_updated_at) ? c.client_updated_at : -1;
          const lAt = typeof l.client_updated_at === 'number' && isFinite(l.client_updated_at) ? l.client_updated_at : -1;
          if (cAt > lAt) winner = 'cloud';      /* regla 3: ts de cliente */
        }
      }
      /* empate total → local (determinista, independiente del orden) */
      if (winner === 'cloud' && (!localValid || local[k].level !== c.level || local[k].due !== c.due)) {
        local[k] = { level: c.level, due: c.due };
        localChanged = true;
      }
    });

    if (sessionChangedFor(sessionHandle) || SMR.progress.data !== dataRefAtStart) return;

    /* 3. PUSH post-merge vía RPC merge_srs_cards (8.5.3): el SERVIDOR
       resuelve el conflicto atómicamente por tarjeta con
       INSERT ... ON CONFLICT DO UPDATE (la política de merge corre en la
       expresión del UPDATE), cerrando la carrera H-1 entre la lectura y
       la escritura de dos dispositivos. NOTA (8.5.3): SIN fallback al
       upsert LWW antiguo — si la RPC falla (no instalada/permisos/red),
       el progreso local permanece intacto y el push se reintenta en el
       próximo ciclo; un fallback LWW reabriría la carrera. user_id nunca
       se envía: el servidor usa auth.uid().
       Copia local mostrada mientras dura el await: no marcamos
       "sync OK"; el pull del siguiente ciclo corrige si hubo divergencia. */
    const upserts = [];
    const reviveSent = [];
    Object.keys(local).forEach((k) => {
      if (!SRS_KEY_OK.test(k) || !srsValidCard(local[k])) return;
      const state = clears[k];
      if (state === 'pending' || state === 'known') return; /* con borrado conocido no se sube live */
      const card = { question_key: k, level: Math.floor(local[k].level), due: Math.round(local[k].due), client_updated_at: now };
      if (state === 'revive') { card.revived = true; reviveSent.push(k); }
      upserts.push(card);
    });
    /* tombstones pendientes: idempotentes (el servidor sella deleted_at
       con su reloj y conserva la última tarjeta real de la fila). */
    Object.keys(clears).forEach((k) => {
      if (SRS_KEY_OK.test(k) && clears[k] === 'pending') upserts.push({ question_key: k, deleted: true });
    });
    if (upserts.length) {
      const { data: mergeRes, error } = await sb.rpc('merge_srs_cards', { p_cards: upserts });
      if (error) {
        /* 8.5.3-E (H-1 de 8.5.3-R): diagnóstico permanente de "migración
           00006/00007 no aplicada en este backend". NO es un error de red
           transitorio: lo persistente requiere intervención (aplicar la
           migración) y no debe generar reintento agresivo. Orden seguro de
           despliegue futuro: PRIMERO la función SQL en el backend, DESPUÉS
           el JavaScript que solo usa la RPC. Sin fallback al upsert LWW. */
        const msg = (error && error.message) || String(error);
        if (/merge_srs_cards|does not exist|404|schema cache/i.test(msg)) {
          if (runtime.srsRpcMissing !== msg) {
            runtime.srsRpcMissing = msg; /* se limpia al éxito del push */
            warn('srs push SIN posibilidad de subir progreso: merge_srs_cards no está disponible en este backend (aplicar migración 00006/00007)', new Error(msg));
          }
        } else {
          runtime.srsRpcMissing = null;
          warn('push srs_cards (merge_srs_cards)', error); /* transitorio: reintento posterior */
        }
      } else {
        runtime.srsRpcMissing = null;
        if (mergeRes && typeof mergeRes === 'object' && typeof mergeRes.invalid === 'number' && mergeRes.invalid > 0) {
          warn('push srs_cards: ' + mergeRes.invalid + ' entradas invalidas rechazadas por merge_srs_cards');
        } else {
          /* revive confirmado por el servidor: la marca ya no hace falta
             (solo si sigue siendo 'revive': un re-borrado posterior de otra
             pestaña deja 'pending' y debe sobrevivir) */
          reviveSent.forEach((k) => setClear(k, null, 'revive'));
        }
      }
    }

    /* 8.5.14: (1) si el propietario cambió durante el await, no se escribe
       NADA — ni marcas ni progreso local: una respuesta tardía de un
       propietario anterior no puede tocar el estado del actual. La primera
       comprobación cubre el cambio procesado por ESTA pestaña; la segunda, el
       caso de pestaña retrasada: el marcador persistido (8.5.11) dice que el
       slot vivo ya es de otro dueño. (2) Si sigue siendo el mío, se aplican
       las transiciones decididas sobre una lectura FRESCA de la clave,
       preservando lo que otra pestaña haya marcado entretanto. */
    if (sessionChangedFor(sessionHandle) || SMR.progress.data !== dataRefAtStart) return;
    const liveMarker = readLiveOwner();
    if (liveMarker !== null && slotOwnerOrUnknown(liveMarker) !== slotOwnerOrUnknown(liveOwnerFor())) return;
    clearOps.forEach((op) => applySrsClear(op[0], op[1], op[2]));
    if (localChanged) {
      runtime.lastSnapshot = undefined;
      originalSave.call(SMR.progress);
      runtime.lastSnapshot = snapshotProgress(SMR.progress.data);
    }
  }

  /* ================================================================
     PULL inicial: refuerza historial/caché desde el cloud
     ================================================================ */

  async function pullInitial(uid, sessionHandle) {
    const dataRefAtStart = SMR.progress.data;
    const data = SMR.progress.data;
    let localChanged = false;

    /* --- test_attempts: union al history local (dedupe por test|mode|ts) --- */
    try {
      /* 8.4.1 (M6): se piden los 200 MÁS RECIENTES (desc) — con más de
         200 intentos cloud, el orden ascendente perdía los últimos. */
      const { data: attempts, error } = await sb.from('test_attempts')
        .select('test_id, title, mode, correct, total, pct, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      const seen = new Set(data.tests.history.map((h) => `${h.testId}|${h.mode}|${h.date}`));
      const missing = (attempts || []).filter((a) => !seen.has(`${a.test_id}|${a.mode}|${a.created_at}`));
      if (missing.length) {
        missing.forEach((a) => {
          data.tests.history.push({
            testId: a.test_id, title: a.title, correct: a.correct, total: a.total,
            pct: a.pct, mode: a.mode, date: a.created_at
          });
        });
        data.tests.history.sort((a, b) => a.date - b.date);
        if (data.tests.history.length > LOCAL_HISTORY_LIMIT) {
          data.tests.history = data.tests.history.slice(-LOCAL_HISTORY_LIMIT);
        }
        localChanged = true;
      }
    } catch (err) { warn('pull test_attempts', err); }

    /* 8.4.4 (H-1): el fetch de attempts estaba en vuelo cuando la cuenta
       cambió: los datos del cloud de A NO se instalan en el estado de B.
       (Se comprueba ANTES de derivaçar best/last y del upsert de scores.) */
    if (sessionChangedFor(sessionHandle) || SMR.progress.data !== dataRefAtStart) return localChanged;

    /* --- derivar best/last desde el historial unificado --- */
    if (localChanged) {
      data.tests.history.forEach((h) => {
        const affectsBest = h.mode === 'practica' || h.mode === 'completo' || h.mode === 'examen';
        if (affectsBest && (typeof data.tests.best[h.testId] !== 'number' || h.pct > data.tests.best[h.testId])) {
          data.tests.best[h.testId] = h.pct;
        }
        data.tests.last[h.testId] = h.pct;
      });
      /* refrescar test_scores en cloud con los valores MERGE */
      const now = Date.now();
      const rows = Object.keys(data.tests.best).map((testId) => {
        const lastEntry = [...data.tests.history].reverse().find((h) => h.testId === testId);
        return { user_id: uid, test_id: testId, best_pct: data.tests.best[testId], last_pct: lastEntry ? lastEntry.pct : (data.tests.last[testId] ?? null), client_updated_at: now };
      });
      if (rows.length) {
        const { error } = await sb.from('test_scores').upsert(rows, { onConflict: 'user_id,test_id' });
        if (error) warn('pull test_scores upsert', error);
      }
    }

    /* --- wrong_answers: caché cloud ← replay local (los events van aparte) --- */
    try {
      const { data: cache, error } = await sb.from('wrong_answers')
        .select('test_id, question_key, count')
        .eq('user_id', uid)
        .limit(500);
      if (error) throw new Error(error.message);
      (cache || []).forEach((r) => {
        const bucket = data.tests.wrong[r.test_id] || {};
        const cur = bucket[r.question_key];
        if (typeof cur !== 'number' || cur < r.count) {
          data.tests.wrong[r.test_id] = bucket;
          bucket[r.question_key] = r.count;
          localChanged = true;
        }
      });
    } catch (err) { warn('pull wrong_answers', err); }

    /* --- streak_days: unión de días --- */
    try {
      const { data: days, error } = await sb.from('streak_days')
        .select('day')
        .eq('user_id', uid)
        .order('day', { ascending: false })
        .limit(400);
      if (error) throw new Error(error.message);
      /* deriva racha cloud: días consecutivos hacia atrás desde el último */
      const sorted = (days || []).map((r) => r.day).sort().reverse();
      if (sorted.length) {
        let count = 1;
        for (let i = 1; i < sorted.length; i++) {
          const prev = new Date(sorted[i - 1] + 'T00:00:00Z').getTime();
          const cur = new Date(sorted[i] + 'T00:00:00Z').getTime();
          if (Math.round((prev - cur) / DAY_MS) === 1) count++;
          else break;
        }
        const localStreak = SMR.progress.data.streak;
        if (count > localStreak.count) {
          localStreak.count = count;
          localStreak.lastDay = sorted[0];
          localChanged = true;
        } else if (count === localStreak.count && sorted[0] > (localStreak.lastDay || '')) {
          localStreak.lastDay = sorted[0];
        }
      }
    } catch (err) { warn('pull streak_days', err); }

    /* --- study_sessions y activity_events: solo refuerzan métricas derivadas --- */
    try {
      const { data: sessions, error } = await sb.from('study_sessions')
        .select('minutes, steps, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      const seen = new Set((data.studySessions || []).map((s) => `${s.ts}|${s.minutes}|${s.steps}`));
      (sessions || []).forEach((s) => {
        if (!seen.has(`${s.created_at}|${s.minutes}|${s.steps}`)) {
          data.studySessions.push({ ts: s.created_at, minutes: s.minutes, steps: s.steps });
          localChanged = true;
        }
      });
      if (localChanged) {
        data.studySessions.sort((a, b) => a.ts - b.ts);
        if (data.studySessions.length > 20) data.studySessions = data.studySessions.slice(-20);
        data.studyMinutes = Math.max(data.studyMinutes || 0, data.studySessions.reduce((n, s) => n + (s.minutes || 0), 0));
      }
    } catch (err) { warn('pull study_sessions', err); }

    /* 8.4.4 (H-1): si el estado vivo ya es de otro dueño, NO persistir:
       escribir aqui guardaría datos de A dentro del estado de B. */
    if (sessionChangedFor(sessionHandle) || SMR.progress.data !== dataRefAtStart) return localChanged;

    /* persistir el merge en el local sin disparar push (sin bucles) */
    if (localChanged) {
      runtime.lastSnapshot = undefined;
      originalSave.call(SMR.progress);
      runtime.lastSnapshot = snapshotProgress(SMR.progress.data);
    }

    return localChanged;
  }

  /* ================================================================
     Orquestación
     ================================================================ */

  /* 8.4.1 (A1): al entrar una cuenta se ADOPTAN los eventos sin
     atribuir (guest) y los de la cola legada (pre-8.4.1): son actividad
     local de este dispositivo sin dueño conocido y pasa a la primera
     cuenta que entra (política 8.3 "el dispositivo que inicia sesión
     gana"). Nada se borra: si la adopción no puede escribirse, los
     eventos quedan donde estaban. */
  function adoptUnattributedEvents(uid) {
    const target = readQueueFor(uid);
    let targetChanged = false;
    [LEGACY_QUEUE_KEY, QUEUE_PREFIX + 'guest'].forEach((key) => {
      const raw = SMR.store.get(key, null);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      let sourceChanged = false;
      Object.keys(EVENT_KEYS).forEach((kind) => {
        const entries = Array.isArray(raw[kind]) ? raw[kind] : [];
        if (!entries.length) return;
        if (!Array.isArray(target[kind])) target[kind] = [];
        const keyFn = EVENT_KEYS[kind];
        entries.forEach((e) => {
          const k = keyFn(e);
          if (!target[kind].some((x) => keyFn(x) === k)) { target[kind].push(e); targetChanged = true; }
        });
        /* retirar SOLO los arrays adoptados; `failed` y otros restos se
           conservan en su clave original (política: no borrar nada) */
        raw[kind] = [];
        sourceChanged = true;
      });
      if (sourceChanged) {
        const leftover = Object.keys(raw).some((k) => (Array.isArray(raw[k]) ? raw[k].length > 0 : false));
        if (leftover) SMR.store.set(key, raw); else SMR.store.remove(key);
      }
    });
    if (targetChanged) writeQueueFor(uid, target);
  }

  function initialSync(user) {
    if (!user) return Promise.resolve();
    runtime.currentUser = user;
    /* 8.4.1 (A2): el guard es POR USUARIO, no global — antes, un cambio
       de cuenta a mitad de sync hacía que el sync inicial de la cuenta
       nueva se descartara para siempre (syncing seguía true). Ahora cada
       usuario tiene su propio job encolado en la cadena serializada. */
    /* 8.6.3: re-login de la MISMA cuenta —el caso típico tras un 401— no tiene
       trabajo inicial nuevo, pero la cola pudo quedar PAUSADA por el error de
       autenticación: hay que reanudarla, o los eventos no confirmados se
       quedarían sin enviar hasta que otra actividad programe un drenaje. */
    if (runtime.initialSyncFor === user.id) { scheduleDrain(0); return syncChain; }
    runtime.initialSyncFor = user.id;
    runtime.syncing = true;
    return enqueue(async () => {
      try {
        if (runtime.currentUser !== user) return; /* logout a mitad: nada que hacer */
        const uid = user.id;
        adoptUnattributedEvents(uid);
        /* 8.4.4 (H-1): el sync inicial lleva su propio handle de sesión
           para que ninguna de sus escrituras cloud consuma el estado de
           otra cuenta instalado mientras los awaits están en vuelo. */
        const sessionHandle = sessionHandleFor();
        await pullInitial(uid, sessionHandle);
        if (sessionChangedFor(sessionHandle)) return;
        await syncResourceState(uid, Date.now(), sessionHandle);
        if (sessionChangedFor(sessionHandle)) return;
        await syncCaseSolutions(uid, Date.now(), sessionHandle);
        if (sessionChangedFor(sessionHandle)) return;
        await syncSrsCards(uid, Date.now(), sessionHandle);
        if (runtime.currentUser !== user) return;
        await pushEvents();
      } catch (err) {
        warn('initialSync', err);
      } finally {
        /* 8.4.1 (A2): SIEMPRE se libera el flag. Solo el job del usuario
           actual lo limpia: si la cuenta cambió, el flag ya pertenece al
           job de la cuenta nueva. */
        if (runtime.initialSyncFor === user.id) runtime.syncing = false;
      }
      scheduleDrain(0);
    });
  }

  function drainQueue() {
    if (runtime.authPaused) return;
    if (runtime.transitionPending) return; /* 8.6.3: sin exclusión no hay sesión conmutada: no se escribe */
    if (!runtime.currentUser || runtime.syncing) return;
    const owner = currentOwner();
    const q = readQueue(owner);
    const pending = (q.attempts || []).length + (q.sessions || []).length +
      (q.activity || []).length + (q.wrongEvents || []).length + (q.streakDays || []).length;
    if (!pending) return;
    return enqueue(async () => {
      if (!runtime.currentUser || runtime.syncing || currentOwner() !== owner) return;
      await pushEvents();
      /* si la cola no se vació (fallo transitorio), reintento con backoff */
      const q2 = readQueue(owner);
      const still = (q2.attempts || []).length + (q2.sessions || []).length +
        (q2.activity || []).length + (q2.wrongEvents || []).length + (q2.streakDays || []).length;
      if (still > 0 && !runtime.authPaused) {
        scheduleRetry();
      } else {
        runtime.retryDelay = 3000;
        runtime.retryCount = 0;
      }
    });
  }

  function scheduleRetry() {
    if (runtime.retryTimer || runtime.authPaused) return;
    if (++runtime.retryCount > runtime.maxRetries) { warn('retry', new Error('límite de reintentos: la cola se conserva para el próximo envío')); return; }
    runtime.retryTimer = setTimeout(() => {
      runtime.retryTimer = null;
      runtime.retryDelay = Math.min(runtime.retryDelay * 2, runtime.maxRetryDelay);
      drainQueue();
    }, runtime.retryDelay);
  }

  /* ---------- contrato de propiedad de sesión (fase 8.6.3) ----------
     cloud-profile.js comparte el slot 'studentProfile' (está en SLOT_KEYS)
     pero se carga ANTES que este módulo, así que su listener de
     'smr:authchange' corre ANTES que la transición de slots de aquí: leía la
     clave viva cuando todavía era del dueño anterior y subía el perfil de A a
     la fila cloud de B (reproducido en tests/profile-owner.test.js). La
     transición se ANUNCIA por este contrato —no por el orden de listeners— y
     el consumidor espera a que el slot de SU uid esté instalado. */
  const session = {
    owner: runtime.liveOwner, /* dueño del slot vivo según el último anuncio */
    generation: 0,            /* se incrementa en cada transición completada */
    pendingOwners: [],        /* dueños con transición EN VUELO (puede haber varias encoladas) */
    waiters: []               /* esperas registradas por awaitSlot() */
  };

  /* Dueño del slot vivo AHORA. El marcador PERSISTIDO (compartido entre
     pestañas) es la verdad; la memoria de ESTA pestaña solo sirve de respaldo
     cuando no hay marcador (perfil heredado). Web Locks serializa las
     transiciones, pero NO comparte el estado del contrato: sin leer el
     marcador, una pestaña con la sesión antigua seguiría considerando válido su
     token —y su cola— después de que OTRA pestaña cambiara de cuenta, y
     escribiría el perfil del dueño nuevo en la fila del dueño viejo. */
  function slotOwnerNow() {
    return readLiveOwner() || session.owner;
  }

  function notifySlot(owner) {
    /* El marcador persistido es la verdad del slot vivo: si su escritura
       falló (cuota), el anuncio no coincide y el consumidor falla cerrado en
       vez de escribir atribuyendo el contenido al dueño equivocado. */
    session.owner = readLiveOwner() || owner;
    session.generation++;
    const still = [];
    session.waiters.forEach((w) => {
      if (w.owner === session.owner) w.resolve(true);
      else if (session.pendingOwners.indexOf(w.owner) !== -1) still.push(w); /* su transición sigue en vuelo */
      else w.resolve(false);                                                 /* ya no llegará: no bloquear */
    });
    session.waiters = still;
  }

  /* Resuelve true cuando el slot vivo es de `owner`. Solo ESPERA una
     transición ya en vuelo hacia ese dueño; en cualquier otro caso responde
     de inmediato, así que nunca bloquea la cadena del consumidor. */
  function awaitSlot(owner) {
    if (session.pendingOwners.indexOf(owner) !== -1) {
      return new Promise((resolve) => { session.waiters.push({ owner: owner, resolve: resolve }); });
    }
    return Promise.resolve(slotOwnerNow() === owner);
  }

  SMR.cloudSession = {
    awaitSlot: awaitSlot,
    owner: function () { return slotOwnerNow(); },
    token: function () { return { owner: slotOwnerNow(), generation: session.generation }; },
    isCurrent: function (t) { return !!t && slotOwnerNow() === t.owner && session.generation === t.generation; },
    /* 8.6.3: estado observable — la transición está diferida por falta de
       exclusión. Una UI puede avisar de que el cambio de cuenta no se ha
       aplicado y ofrecer reintentar o recargar. */
    transitionPending: function () { return !!runtime.transitionPending; }
  };

  /* ---------- intento de transición con recuperación (fase 8.6.3) ----------
     Sin exclusión la transición NO se ejecuta. Pero DESCARTARLA dejaría el slot
     sin archivar/restaurar (la razón por la que 8.5.12 la ejecutaba sin
     protección), así que se DIFIERE: no se toca el slot ni el marcador, la
     sesión en memoria no se conmuta, la sincronización queda bloqueada y se
     reintenta con backoff ACOTADO. Una decisión de sesión nueva cancela el
     reintento pendiente, de modo que un trabajo antiguo no se reactiva. */
  const MAX_TRANSITION_ATTEMPTS = 5;

  function removePendingOwner(owner) {
    const i = session.pendingOwners.indexOf(owner);
    if (i !== -1) session.pendingOwners.splice(i, 1);
  }

  /* Esperas de un dueño cuya transición NO se ejecutó: se resuelven en FALSE
     para que ningún consumidor quede bloqueado. Nada ha cambiado, así que no se
     toca `session.owner` ni la generación. */
  function failPendingOwner(owner) {
    removePendingOwner(owner);
    const still = [];
    session.waiters.forEach((w) => {
      if (w.owner === owner) w.resolve(false);
      else if (session.pendingOwners.indexOf(w.owner) !== -1) still.push(w);
      else if (w.owner === slotOwnerNow()) w.resolve(true);
      else w.resolve(false);
    });
    session.waiters = still;
  }

  function attemptSlotTransition(user, attempt, body) {
    const announcedOwner = user ? (user.id || 'user') : GUEST_OWNER;
    /* una decisión nueva cancela el reintento anterior */
    if (runtime.transitionTimer) { clearTimeout(runtime.transitionTimer); runtime.transitionTimer = null; }
    runtime.deferredUser = user;
    runtime.deferredBody = body;
    session.pendingOwners.push(announcedOwner);
    return withSlotTransitionLock(() => {
      try { body(announcedOwner); }
      finally { removePendingOwner(announcedOwner); notifySlot(announcedOwner); }
    }).then((ran) => {
      if (ran) {
        runtime.transitionPending = false;   /* la sesión y el slot ya están alineados */
        runtime.deferredUser = null;
        runtime.deferredBody = null;
        return true;
      }
      /* fail-closed: el slot, el marcador y la sesión siguen como estaban */
      failPendingOwner(announcedOwner);
      deferSlotTransition(user, attempt, body);
      return false;
    });
  }

  function deferSlotTransition(user, attempt, body) {
    /* Bloquea la sincronización: el estado en memoria es del dueño anterior y
       no debe escribirse con la sesión nueva (RLS lo rechazaría y desviaría la
       cola a dead-letter). */
    runtime.transitionPending = true;
    runtime.deferredUser = user;
    runtime.deferredBody = body;
    if (attempt >= MAX_TRANSITION_ATTEMPTS) {
      warn('transición de slots diferida: sin exclusión tras ' + attempt + ' intentos; hace falta una nueva decisión de sesión o recargar',
        new Error('Web Locks no disponible'));
      return; /* no se reintenta indefinidamente: la recuperación es explícita */
    }
    const delay = Math.min(500 * Math.pow(2, attempt), 8000);
    runtime.transitionTimer = setTimeout(() => {
      runtime.transitionTimer = null;
      if (runtime.deferredUser !== user) return; /* superada por otra decisión */
      attemptSlotTransition(user, attempt + 1, body);
    }, delay);
  }

  /* ---------- transiciones de sesión ---------- */

  /* 8.4.2: re-instalar el progreso desde el slot tras un swap de
     cuenta. sanitizeProgress NO está expuesto por app.js, así que
     re-parseamos desde el store: la app hace lo mismo en el arranque
     (SMR.progress.data = sanitizeProgress(store.get('progress'))).
     Aquí NO mutamos el objeto vivo in-place (los reducers de app.js
     pueden conservar referencias): se modifica SMR.progress.data
     apuntando a un objeto FRESH sanitizado con las mismas reglas.
     Si el store no tiene progreso, repone un defaultProgress vacío. */
  function sanitizeProgressLocal() {
    /* 8.5.13: esta pestaña acaba de leer el slot vivo: es también su base de
       fusión (una pestaña pasiva que pasa a escribir no debe pisar los
       cambios que otra hizo mientras tanto). */
    refreshSlotBases();
    const stored = SMR.store.get('progress', null);
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      /* slot vacío: arranca limpio, conservando la API del objeto */
      const fresh = Object.assign(SMR.progress.data, {
        resources: { viewed: {}, completed: {}, selfAssessment: {} },
        tests: { best: {}, last: {}, history: [], wrong: {}, srs: {}, srsLegacy: {} },
        cases: { solved: {} },
        studySessions: [], studyMinutes: 0, activity: [],
        streak: { lastDay: null, count: 0 }
      });
      return fresh;
    }
    const fresh = Object.assign({}, stored);
    /* saneado mínimo por clave (idéntico espíritu a app.js):
       una clave corrupta se descarta, el resto se conserva. */
    if (!fresh.resources || typeof fresh.resources !== 'object') fresh.resources = { viewed: {}, completed: {}, selfAssessment: {} };
    ['viewed', 'completed'].forEach((k) => {
      if (fresh.resources[k] && typeof fresh.resources[k] === 'object' && !Array.isArray(fresh.resources[k])) {
        const out = {};
        Object.keys(fresh.resources[k]).forEach((id) => { if (typeof fresh.resources[k][id] === 'number' && isFinite(fresh.resources[k][id])) out[id] = fresh.resources[k][id]; });
        fresh.resources[k] = out;
      } else fresh.resources[k] = {};
    });
    if (fresh.resources.selfAssessment && typeof fresh.resources.selfAssessment === 'object') {
      const out = {};
      Object.keys(fresh.resources.selfAssessment).forEach((id) => { const v = fresh.resources.selfAssessment[id]; if (v === 0 || v === 1 || v === 2) out[id] = v; });
      fresh.resources.selfAssessment = out;
    } else fresh.resources.selfAssessment = {};
    if (!fresh.tests || typeof fresh.tests !== 'object') fresh.tests = { best: {}, last: {}, history: [], wrong: {}, srs: {}, srsLegacy: {} };
    if (!fresh.tests.best || typeof fresh.tests.best !== 'object') fresh.tests.best = {};
    if (!fresh.tests.last || typeof fresh.tests.last !== 'object') fresh.tests.last = {};
    if (!Array.isArray(fresh.tests.history)) fresh.tests.history = [];
    if (!fresh.tests.wrong || typeof fresh.tests.wrong !== 'object') fresh.tests.wrong = {};
    if (!fresh.tests.srs || typeof fresh.tests.srs !== 'object') fresh.tests.srs = {};
    if (!fresh.tests.srsLegacy || typeof fresh.tests.srsLegacy !== 'object') fresh.tests.srsLegacy = {};
    if (!fresh.cases || typeof fresh.cases !== 'object' || !fresh.cases.solved || typeof fresh.cases.solved !== 'object') fresh.cases = { solved: {} };
    if (!Array.isArray(fresh.studySessions)) fresh.studySessions = [];
    if (typeof fresh.studyMinutes !== 'number' || !isFinite(fresh.studyMinutes) || fresh.studyMinutes < 0) fresh.studyMinutes = 0;
    if (!Array.isArray(fresh.activity)) fresh.activity = [];
    if (!fresh.streak || typeof fresh.streak !== 'object') fresh.streak = { lastDay: null, count: 0 };
    if (typeof fresh.streak.count !== 'number' || !isFinite(fresh.streak.count)) fresh.streak.count = 0;
    if (typeof fresh.streak.lastDay !== 'string') fresh.streak.lastDay = null;
    return fresh;
  }

  /* 8.4.5 (H-2): exclusión mutua de transición de slots entre pestañas.
     Web Locks API: peticiones de bloqueo de al mismo recurso se
     atienden en orden de llegada (e inter-task). Así, dos transiciones
     simultáneas de sesión en 2 pestañas SE SERIALIZAN: la segunda no
     arranca hasta que la primera haya archivado, cuarentenado y
     restaurado el slot vivo — se elimina el interleaving que en 8.4.5
     corrompía slots per-owner (A/B/__guest__ con contenido del otro).
     Sin navigator.locks (navegador antiguo, dejaras de test o mock sin
     locks) se ejecuta directamente, comportamiento previo a 8.4.5. */
  function withSlotTransitionLock(fn) {
    let locks = null;
    try { locks = global.navigator && global.navigator.locks; } catch (e) { locks = null; }
    /* 8.6.3: FAIL-CLOSED. La transición es crítica (archiva, restaura y
       modifica el slot compartido y el marcador). Sin exclusión garantizada NO
       se ejecuta: devuelve false y el llamante decide (diferir y reintentar, o
       descartar si su operación es idempotente). Ejecutarla sin exclusión es
       justo lo que el 8.4.5 reprodujo corrompiendo los slots per-owner. */
    if (!locks || typeof locks.request !== 'function') {
      warn('transición de slots sin exclusión: NO se ejecuta (Web Locks no disponible)', new Error('no-locks'));
      return Promise.resolve(false);
    }
    let req;
    try {
      req = locks.request('smrhub:slot-transition', async () => {
        try { return await fn(); } catch (err) { warn('transición de slots', err); }
      });
    } catch (err) {
      warn('lock de transición no se pudo pedir: la transición NO se ejecuta', err);
      return Promise.resolve(false);
    }
    return Promise.resolve(req).then(function () { return true; }, function (err) {
      warn('lock de transición rechazado: la transición NO se ejecuta', err);
      return false;
    });
  }

  /* 8.4.5 (H-2): reconciliación pasiva a través del evento 'storage':
     localStorage emite 'storage' SOLO a las PESTAÑAS DISTINTAS de la
     que escribe. La pestaña que escribe no lo recibe (no corre riesgo:
     su runtime fue actualizado por SU transición); las que NO
     participaban re-instalan el estado del dueño si su dueño runtime
     (runtime.currentUser) COINCIDE con el dueño del slot cambiado.
     El re-instalado se hace bajo el MISMO lock de transición (evita
     mezclarse a la mitad con una transición real de esta tab) y usa
     restoreSlotFor(owner) directamente: restaura SIEMPRE el snapshot
     del dueño que está activo AQUI, nunca adoptando contenido ajeno.
     Es idempotente: solo re-instala si el slot vivo difiere del
     snapshot del dueño (no hay bucle de eventos storage↔storage). */
  function reconcilePassiveSlot(owner) {
    if (!owner || owner === UNKNOWN_OWNER) return;
    const targetOwner = owner;
    const runtimeOwner = runtime.currentUser ? (runtime.currentUser.id || 'user') : GUEST_OWNER;
    if (runtimeOwner !== targetOwner) return; /* no es mi dueño actual */
    /* 8.5.12: además hay que confirmar con el MARCADOR PERSISTIDO que el slot
       vivo es de este dueño. Sin esta comprobación, tras un logout hecho en
       otra pestaña esta pestaña (que aún se cree la cuenta) reinstalaría su
       snapshot obsoleto sobre el slot vivo, que ya es del visitante. Sin
       marcador (perfil heredado) se conserva el comportamiento previo. */
    const persistedOwner = readLiveOwner();
    if (persistedOwner !== null && slotOwnerOrUnknown(persistedOwner) !== slotOwnerOrUnknown(targetOwner)) return;
    withSlotTransitionLock(() => {
      const runtimeOwnerNow = runtime.currentUser ? (runtime.currentUser.id || 'user') : GUEST_OWNER;
      if (runtimeOwnerNow !== targetOwner) return; /* cambió mientras esperaba el lock */
      const live = SMR.store.get('progress', null);
      const snap = SMR.store.get(ownerSlotKey(targetOwner), null);
      const snapContent = snap && typeof snap === 'object' && snap.slot && typeof snap.slot === 'object' ? (snap.slot.progress || null) : null;
      /* si el slot vivo YA coincide con el snapshot del dueño, nada que hacer */
      if (sameQuarantineContent(live, snapContent)) return;
      restoreSlotFor(targetOwner);
      runtime.liveOwner = targetOwner; /* 8.5.11 (D-3): el slot vivo es suyo */
      writeLiveOwner(targetOwner);
      writeLiveWriter(targetOwner); /* 8.5.13: el slot instalado es suyo */
      runtime.lastSnapshot = undefined;
      SMR.progress.data = sanitizeProgressLocal();
      runtime.lastSnapshot = snapshotProgress(SMR.progress.data);
      /* estado re-instalado en la tab pasiva; lastSnapshot fresco evita
         un push rebote con contenido idéntico */
    });
  }
  let storageWired = false;
  function wireStorageReconciler() {
    if (storageWired) return;
    storageWired = true;
    global.addEventListener('storage', (event) => {
      try {
        if (!event || !event.key) return;
        const k = String(event.key);
        const P = 'smrhub:' + OWNER_KEY_PREFIX;
        if (k.indexOf(P) !== 0) return;          /* solo claves per-owner */
        const rest = k.slice(P.length);
        if (!rest || rest.indexOf(':') !== -1) return; /* solo la clave EXACTA del slot (no :stash ni respaldos) */
        if (rest === UNKNOWN_OWNER) return;      /* __unknown__ nunca se restaura */
        reconcilePassiveSlot(rest);
      } catch (err) { warn('storage reconciler', err); }
    });
  }


  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    wireStorageReconciler();
    global.addEventListener('smr:authchange', (event) => {
      const authUser = event.detail && event.detail.user;
      if (authUser) { runtime.authPaused = false; runtime.retryCount = 0; }
      /* 8.6.3: la transición se intenta BAJO EXCLUSIÓN. Si no se puede
         garantizar, se difiere y se reintenta (fail-closed). */
      attemptSlotTransition(authUser, 0, (announcedOwner) => {
      const user = authUser;
      /* 8.5.11 (D-3) + 8.5.12: el dueño del slot vivo es el MARCADOR
         PERSISTIDO (lo escribe la pestaña que ejecuta cada transición), no la
         memoria de ESTA pestaña. `runtime.currentUser` puede estar desfasado
         respecto al slot compartido: otra pestaña puede haber archivado,
         restaurado o cambiado de dueño mientras tanto, y usar memoria aquí
         archivaba contenido AJENO bajo el dueño equivocado (reproducido con
         dos pestañas). Se lee fresco, dentro del lock, con las transiciones ya
         serializadas; sin marcador (perfiles heredados) se conserva el camino
         anterior basado en runtime. */
      const persistedOwner = readLiveOwner() || runtime.liveOwner;
      const prevOwner = persistedOwner
        ? slotOwnerOrUnknown(persistedOwner)
        : (runtime.currentUser ? (runtime.currentUser.id || 'user') : null);
      const nextOwner = announcedOwner; /* 8.6.3: una sola fuente para el dueño */

      /* 8.4.2 (M-1): el slot vivo SIEMPRE se archiva bajo el dueño
         actual ANTES de cualquier transición (logout o cambio de
         cuenta). Si el cambio es rápido A→B, el archivo de B solo
         se toca cuando le toque; el de A ya está custodiado aquí.
         Caso visitante→cuenta (prevOwner null con contenido de
         visitante en el slot): el contenido se custodia primero bajo
         __guest__ (nunca se adopta automáticamente a la cuenta). */
      if (prevOwner && prevOwner !== nextOwner) {
        archiveSlotFor(prevOwner, Date.now());
      } else if (!prevOwner && nextOwner !== GUEST_OWNER && hasContent(captureSlot())) {
        archiveSlotFor(GUEST_OWNER, Date.now());
      }

      if (user) {
        if (runtime.currentUser !== user) {
          if (prevOwner !== nextOwner) {
            /* 8.4.2 (M-1, política de adopción): el progreso de
               VISITANTE custodiado en __guest__ se ADOPTA solo si esta
               cuenta NUNCA ha usado este dispositivo (no tiene slot
               propio) y no existe el slot de OTRA cuenta (es la
               primera cuenta del dispositivo; 8.3 "el dispositivo que
               inicia sesión gana"). Si la cuenta tuvo slot propio aqu
               o existe el de otra cuenta, NO se adopta (prohibido
               atribuir sin certeza). El contenido visitante permanece
               archivado en __guest__ para su recuperación manual. */
            const guestStored = SMR.store.get(ownerSlotKey(GUEST_OWNER), null);
            const targetHasSlot = !!SMR.store.get(ownerSlotKey(nextOwner), null);
            const anyOtherAccountSlot = (function scan () {
              try {
                const all = global.localStorage || (global.SMR && global.SMR.store && null);
                if (global.localStorage) {
                  for (let i = 0; i < global.localStorage.length; i++) {
                    const k = global.localStorage.key(i);
                    if (k && k.indexOf('smrhub:' + OWNER_KEY_PREFIX) === 0) {
                      const o = k.slice(('smrhub:' + OWNER_KEY_PREFIX).length);
                      if (o !== GUEST_OWNER && o !== UNKNOWN_OWNER && o !== nextOwner) return true;
                    }
                  }
                }
              } catch (e) { /* sin localStorage: nadie */ }
              return false;
            })();
            const canAdoptGuest = !!guestStored && !targetHasSlot && !anyOtherAccountSlot;
            if (canAdoptGuest) {
              restoreSlotFor(GUEST_OWNER);      /* el visitante pasa a la cuenta (una única vez: al restaurar el slot se usa y el target se compone) */
              archiveSlotFor(nextOwner, Date.now());   /* custodiar lo adoptado como contenido del dueño */
            }
            /* entrada de cuenta: restablecer el slot con SU snapshot
               (o limpio si es primera vez en este dispositivo).
               8.4.4 (B-1): si NO hubo cuenta previa (visitante→cuenta),
               el contenido de visitante ya fue custodiado en __guest__
               por el guard de archivado (arriba), de modo que el wipe
               del slot para instalar el estado del dueño es siempre
               recuperable. */
            const hadPrev = !!prevOwner;
            if (hadPrev) quarantineUnownedContent(); /* contenido archivado ya bajo prevOwner: nada global con dueño incierto queda expuesto */
            /* 8.5.8 (D-1): restaurar SIEMPRE el snapshot del dueño cuando
               existe. La condición anterior (hadPrev || hasContent(...))
               dejaba sin restaurar el caso "login sobre slot vivo vacío"
               (el que deja un logout previo): el snapshot del dueño se
               ignoraba y el pull reconstruía solo el estado cloud, con
               pérdida del estado local no subido (un borrado SRS pendiente
               hacía resucitar la tarjeta). restoreSlotFor ya escribe el
               slot limpio cuando el dueño no tiene snapshot. */
            if (!canAdoptGuest) restoreSlotFor(nextOwner);
          }
          /* 8.5.12: la copia en memoria se re-lee SIEMPRE del slot vivo, tanto
             con cambio real de dueño como cuando el slot vivo YA era de este
             dueño porque la transición la hizo otra pestaña (marcador
             coincidente). Sin esto, una pestaña pasiva se quedaba con el
             estado de otro dueño y lo escribía en el slot compartido en su
             siguiente save. */
          runtime.lastSnapshot = undefined;
          SMR.progress.data = sanitizeProgressLocal();
          runtime.currentUser = user;
          runtime.lastSnapshot = snapshotProgress(SMR.progress.data);
          initialSync(user);
        }
      } else {
        /* 8.4.1 (A1): al salir NO se toca ninguna cola — los eventos
           pendientes del usuario saliente quedan en
           smrhub:progressSyncQueue:<uid> y solo se enviarán con su
           sesión (recuperación explícita al volver a entrar). */
        runtime.currentUser = null;
        runtime.syncing = false;
        runtime.initialSyncFor = null; /* re-login → sync inicial fresco */
        if (runtime.retryTimer) { clearTimeout(runtime.retryTimer); runtime.retryTimer = null; }
        runtime.retryDelay = 3000;
        if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
        if (stateTimer) { clearTimeout(stateTimer); stateTimer = null; }
        /* 8.4.2 (M-1): pasar a modo visitante → restaurar el slot del
           visitante (no el de la cuenta que acaba de salir, ya
           archivada arriba). Siendo prevOwner != GUEST_OWNER, aplica el
           restoreSlotFor encima. */
        if (prevOwner && prevOwner !== GUEST_OWNER) {
          restoreSlotFor(GUEST_OWNER);
        }
        /* 8.5.12: igual que al entrar, la copia en memoria se re-lee del slot
           vivo (que ya es el del visitante): una pestaña pasiva no puede
           seguir escribiendo con el estado de la cuenta que acaba de salir. */
        runtime.lastSnapshot = undefined;
        SMR.progress.data = sanitizeProgressLocal();
      }
      /* 8.5.11 (D-3): el slot vivo pertenece ya a nextOwner (se haya
         restaurado, adoptado o quedado igual). Persistirlo es lo que hace
         que el próximo arranque sepa de quién es. */
      runtime.liveOwner = nextOwner;
      writeLiveOwner(nextOwner);
      writeLiveWriter(nextOwner); /* 8.5.13: el slot queda con el contenido de nextOwner */
    }); /* fin del cuerpo: el anuncio y la resolución de esperas los hace attemptSlotTransition */
    });
  }

  wire();
})(typeof window !== 'undefined' ? window : globalThis);

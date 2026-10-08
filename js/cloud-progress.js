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
     - refuerza eventos históricos que el local no tenía (otro dispositivo)
     - refresca caché (wrong_answers, test_scores) con los valores MERGE
     - actualiza el estado local respetando completed_cleared_at

   ── ESTRATEGIA OFFLINE ──
   - Todo el estudio es 100% local; nada de la UI depende de red.
   - La cola de eventos pendientes vive en smrhub:progressSyncQueue.
   - Al reconectar (smr:authchange con user o retry programado) se drena
     la cola. Reintentos con backoff; errores no bloquean nada.
   - Un evento NO se marca como enviado hasta que el cloud confirme.

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
  const QUEUE_KEY = 'progressSyncQueue';
  const DAY_MS = 86400000;
  /* límites del modelo local (app.js): HISTORY_LIMIT=60, studySessions=20 */
  const LOCAL_HISTORY_LIMIT = 60;

  const runtime = {
    currentUser: null,
    syncing: false,
    retryTimer: null,
    retryDelay: 3000,
    maxRetryDelay: 120000
  };

  /* ---------- cola persistida ---------- */

  function readQueue() {
    const q = SMR.store.get(QUEUE_KEY, null);
    return (q && typeof q === 'object' && !Array.isArray(q)) ? q : { attempts: [], sessions: [], activity: [], wrongEvents: [], streakDays: [] };
  }

  function writeQueue(q) {
    SMR.store.set(QUEUE_KEY, q);
  }

  function queueFor(kind) {
    const q = readQueue();
    if (!Array.isArray(q[kind])) q[kind] = [];
    return q[kind];
  }

  function enqueueEvent(kind, entry, dedupeKeyFn) {
    const q = readQueue();
    if (!Array.isArray(q[kind])) q[kind] = [];
    const key = dedupeKeyFn(entry);
    if (key && q[kind].some((e) => dedupeKeyFn(e) === key)) return false; /* ya en cola */
    q[kind].push(entry);
    writeQueue(q);
    return true;
  }

  /* claves estables por tipo de evento (idempotencia de la cola; las
     entradas se comparan por clave, nunca por identidad de objeto, porque
     cada readQueue() re-parsea JSON fresco) */
  const EVENT_KEYS = {
    attempts: (e) => `${e.test_id}|${e.mode}|${e.created_at}`,
    sessions: (e) => `${e.created_at}|${e.minutes}|${e.steps}`,
    activity: (e) => `${e.label}|${e.meta}|${e.created_at}`,
    wrongEvents: (e) => `${e.test_id}|${e.question_key}|${e.event_type}|${e.client_created_at}`,
    streakDays: (e) => e.day
  };

  function removeQueued(kind, entries) {
    const keyFn = EVENT_KEYS[kind];
    if (!keyFn) return;
    const keys = new Set(entries.map(keyFn));
    const q = readQueue();
    if (!Array.isArray(q[kind])) return;
    q[kind] = q[kind].filter((e) => !keys.has(keyFn(e)));
    writeQueue(q);
  }

  /* ---------- detección de cambios locales (wrapping) ---------- */

  function snapshotProgress(data) {
    /* JSON determinista del estado local para detectar cambios de estado
       (no de eventos) entre un sync y el siguiente. */
    return JSON.stringify({
      resources: data.resources,
      tests: { best: data.tests.best, last: data.tests.last, wrong: data.tests.wrong },
      cases: data.cases,
      streak: data.streak,
      studyMinutes: data.studyMinutes
    });
  }

  const originalSave = SMR.progress.save;
  SMR.progress.save = function () {
    const before = runtime.lastSnapshot;
    const result = originalSave.call(SMR.progress);
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
      /* wrong_answer_events derivados del payload de answers */
      if (payload && Array.isArray(payload.answers) && payload.testId) {
        const srsMod = global.SMR && global.SMR.srs;
        payload.answers.forEach((a, idx) => {
          const stable = srsMod ? srsMod.idOf(payload.testId, a.origIndex) : null;
          const questionKey = stable || String(a.origIndex);
          enqueueEvent('wrongEvents', {
            test_id: payload.testId, question_key: questionKey,
            event_type: a.ok ? 'clear' : 'add',
            count_delta: a.ok ? 0 : 1,
            client_created_at: Date.now() + idx /* orden estable intra-chunk */
          }, (e) => `${e.test_id}|${e.question_key}|${e.event_type}|${e.client_created_at}`);
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

  function dayKeyToDate(day) {
    /* 'YYYY-MM-DD' → bigint epoch-ms del día (UTC base, determinista) */
    const [y, m, d] = String(day).split('-').map(Number);
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d);
  }

  function dateToDayKey(ms) {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

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
    if (!runtime.currentUser) return;
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
    const attempts = queueFor('attempts').slice(0, ATTEMPT_LIMIT);
    const sessions = queueFor('sessions').slice(0, ATTEMPT_LIMIT);
    const activity = queueFor('activity').slice(0, ATTEMPT_LIMIT);
    const wrongEvents = queueFor('wrongEvents').slice(0, ATTEMPT_LIMIT);

    const jobs = [];
    if (attempts.length) jobs.push({ kind: 'attempts', table: 'test_attempts', events: attempts });
    if (sessions.length) jobs.push({ kind: 'sessions', table: 'study_sessions', events: sessions });
    if (activity.length) jobs.push({ kind: 'activity', table: 'activity_events', events: activity });
    if (wrongEvents.length) jobs.push({ kind: 'wrongEvents', table: 'wrong_answer_events', events: wrongEvents });
    if (!jobs.length) return Promise.resolve();

    return chainOrNow(async () => {
      for (const job of jobs) {
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
          if (error) throw new Error(error.message);
          /* éxito (insertados o ya-duplicados): quitar del queue por clave */
          removeQueued(job.kind, job.events);
        } catch (err) {
          warn('push ' + job.kind, err);
          return; /* abandona este ciclo; reintento programado */
        }
      }
      pushState(); /* tras eventos, empuja también estado derivado */
    });
  }

  /* ================================================================
     PUSH: estado (test_scores, resource_state, streak_days, case_solutions)
     ================================================================ */

  function pushState() {
    if (!runtime.currentUser) return;
    return chainOrNow(async () => {
      const uid = runtime.currentUser.id;
      const data = SMR.progress.data;
      const now = Date.now();

      /* --- test_scores: derivar de history + best local --- */
      const scoresByTest = {};
      Object.keys(data.tests.best).forEach((testId) => {
        const lastEntry = [...data.tests.history].reverse().find((h) => h.testId === testId);
        scoresByTest[testId] = {
          user_id: uid, test_id: testId,
          best_pct: data.tests.best[testId],
          last_pct: lastEntry ? lastEntry.pct : data.tests.last[testId] || null,
          client_updated_at: now
        };
      });
      /* tests.last sin best (modo que no afecta best) también persiste */
      Object.keys(data.tests.last).forEach((testId) => {
        if (!scoresByTest[testId] && typeof data.tests.last[testId] === 'number') {
          scoresByTest[testId] = {
            user_id: uid, test_id: testId,
            best_pct: null,
            last_pct: data.tests.last[testId],
            client_updated_at: now
          };
        }
      });
      const scoreRows = Object.values(scoresByTest);
      if (scoreRows.length) {
        const { error } = await sb.from('test_scores').upsert(scoreRows, { onConflict: 'user_id,test_id' });
        if (error) { warn('push test_scores', error); return; }
      }

      /* --- streak_days: unión por día (los nuevos ya están en cola) --- */
      const q = readQueue();
      if (Array.isArray(q.streakDays) && q.streakDays.length) {
        const rows = q.streakDays.map((e) => ({ user_id: uid, day: e.day }));
        const { error } = await sb.from('streak_days').upsert(rows, { onConflict: 'user_id,day', ignoreDuplicates: true });
        if (error) { warn('push streak_days', error); return; }
        removeQueued('streakDays', q.streakDays);
      }

      /* --- resource_state: MERGE con cloud (requiere lectura fresca) --- */
      await syncResourceState(uid, now);

      /* --- case_solutions --- */
      await syncCaseSolutions(uid, now);
    });
  }

  /* ================================================================
     resource_state: MERGE respetando completed_cleared_at
     ================================================================ */

  async function syncResourceState(uid, now) {
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

  async function syncCaseSolutions(uid, now) {
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

    const cloudById = {};
    cloudRows.forEach((r) => { cloudById[r.case_id] = r; });
    const ids = new Set([...Object.keys(local), ...Object.keys(cloudById)]);
    const upserts = [];
    let localChanged = false;

    ids.forEach((cid) => {
      const l = local[cid];
      const c = cloudById[cid];
      if (l && (!c || (l.ts || 0) >= (c.client_updated_at || 0))) {
        upserts.push({ user_id: uid, case_id: cid, option: l.option, client_updated_at: l.ts || now });
      } else if (c && !l) {
        local[cid] = { option: c.option, ts: c.client_updated_at || now };
        localChanged = true;
      }
      /* si ambos existen y cloud es más reciente: el local se queda (no hay
         campo ts en cloud comparable salvo client_updated_at; se respeta) */
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
     PULL inicial: refuerza historial/caché desde el cloud
     ================================================================ */

  async function pullInitial(uid) {
    const data = SMR.progress.data;
    let localChanged = false;

    /* --- test_attempts: union al history local (dedupe por test|mode|ts) --- */
    try {
      const { data: attempts, error } = await sb.from('test_attempts')
        .select('test_id, title, mode, correct, total, pct, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: true })
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

  function initialSync(user) {
    if (!user) return Promise.resolve();
    if (runtime.syncing) return syncChain;
    runtime.syncing = true;
    runtime.currentUser = user;
    return enqueue(async () => {
      if (runtime.currentUser !== user) return;
      const uid = user.id;
      await pullInitial(uid);
      await syncResourceState(uid, Date.now());
      await syncCaseSolutions(uid, Date.now());
      await pushEvents();
      runtime.syncing = false;
      scheduleDrain(0);
    });
  }

  function drainQueue() {
    if (!runtime.currentUser || runtime.syncing) return;
    const q = readQueue();
    const pending = (q.attempts || []).length + (q.sessions || []).length +
      (q.activity || []).length + (q.wrongEvents || []).length + (q.streakDays || []).length;
    if (!pending) return;
    return enqueue(async () => {
      if (!runtime.currentUser || runtime.syncing) return;
      await pushEvents();
      /* si la cola no se vació (fallo), programa reintento con backoff */
      const q2 = readQueue();
      const still = (q2.attempts || []).length + (q2.sessions || []).length +
        (q2.activity || []).length + (q2.wrongEvents || []).length + (q2.streakDays || []).length;
      if (still > 0) {
        scheduleRetry();
      } else {
        runtime.retryDelay = 3000;
      }
    });
  }

  function scheduleRetry() {
    if (runtime.retryTimer) return;
    runtime.retryTimer = setTimeout(() => {
      runtime.retryTimer = null;
      runtime.retryDelay = Math.min(runtime.retryDelay * 2, runtime.maxRetryDelay);
      drainQueue();
    }, runtime.retryDelay);
  }

  /* ---------- transiciones de sesión ---------- */

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    global.addEventListener('smr:authchange', (event) => {
      const user = event.detail && event.detail.user;
      if (user) {
        if (runtime.currentUser !== user) {
          runtime.currentUser = user;
          runtime.lastSnapshot = snapshotProgress(SMR.progress.data);
          initialSync(user);
        }
      } else {
        runtime.currentUser = null;
        runtime.syncing = false;
        if (runtime.retryTimer) { clearTimeout(runtime.retryTimer); runtime.retryTimer = null; }
        runtime.retryDelay = 3000;
        if (drainTimer) { clearTimeout(drainTimer); drainTimer = null; }
        if (stateTimer) { clearTimeout(stateTimer); stateTimer = null; }
      }
    });
  }

  wire();
})(typeof window !== 'undefined' ? window : globalThis);

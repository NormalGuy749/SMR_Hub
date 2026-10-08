'use strict';

/* SMR Hub — Fase 8.3: Cloud Profile (solo perfil del estudiante)
   ------------------------------------------------------------------
   Sincroniza ÚNICAMENTE el perfil académico:
       local  smrhub:studentProfile (via js/profile.js, normalizado)
       ↔
       cloud  public.profiles (fila propia, user_id garantizado por RLS)

   CAMPOS sincronizados (mapeo 1:1 con la estructura REAL de profile.js):
     local.community      ↔ profiles.community      (text)
     local.course         ↔ profiles.course         (smallint 1|2)
     local.academicYear   ↔ profiles.academic_year  (text)
     local.curriculumId   ↔ profiles.curriculum_id  (text, derivado)
   - setupCompleted NO se sincroniza: es derivable (community+course+year).
   - display_name NO se sincroniza: la UI local no lo edita (identidad/
     provisionamiento; la escribirá una fase futura si hace falta).
   - updated_at es SIEMPRE server-side (trigger de 00003). El cliente
     envía client_updated_at solo como información de diagnóstico.

   ── POLÍTICA DE RESOLUCIÓN EN EL SYNC INICIAL (determinista) ──
   Al SIGNED_IN se lee local y cloud y se decide una vez:
   1. local configurado (setupCompleted)            → GANA LOCAL → push.
   2. local vacío y cloud tiene datos               → GANA CLOUD → pull.
   3. ambos vacíos                                  → no-op.
   Racional: el estudiante lleva meses trabajando local (visitante); su
   estado local es lo que ve y edita. El device que INICIA SESIÓN es el
   ganador (whole-row LWW de facto en el momento de login, sin necesitar
   timestamps del navegador como autoridad — v2 lo prohíbe). La sincro
   posterior de EDICIONES es push-on-change: cualquier edición local
   con sesión activa sube al cloud; así ambos dispositivos convergen por
   último-edición-gana a nivel de dispositivo, que es la estrategia
   WHOLE-ROW LWW aprobada para profiles en 8.0 v2.

   ── SEGURIDAD DE CARRERAS ──
   - Un único listener del evento 'smr:authchange' (guard).
   - Cola serializada de operaciones (syncChain): nunca dos sync a la vez.
   - Flag syncing: una edición local durante el sync inicial se encola.
   - Los push nunca vuelven a llamar a SMR.profile.save: sin bucles.
   - Tras un pull exitoso se registra el snapshot (lastPushed): el push
     pendiente no re-envía al cloud los valores recién traídos.

   ── ERRORES / OFFLINE ──
   - Todo el acceso cloud va en try/catch: si falla, se registra con
     console.warn controlado, el perfil local NO se toca y la app sigue.
   - SIGNED_OUT: no se borra nada local.

   NO implementado aquí (fases 8.4–8.9): progreso, SRS, favoritos,
   historial, migración general local→cloud, feedback, reports,
   entitlements, pagos. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  if (!SMR.cloudAvailable || !SMR.cloud || !SMR.profile) return;

  const sb = SMR.cloud;

  const runtime = {
    currentUser: null,
    syncing: false,
    pushTimer: null,
    lastPushed: null      /* snapshot normalizado del último estado enviado/aceptado */
  };

  /* Serialización de operaciones para evitar carreras entre auth.js,
     ediciones locales y re-syncs. */
  let syncChain = Promise.resolve();
  function enqueue(job) {
    syncChain = syncChain.then(job).catch((err) => {
      if (global.console && global.console.warn) {
        global.console.warn('[SMR cloud-profile]', err && err.message ? err.message : err);
      }
    });
    return syncChain;
  }

  /* ---------- Mapeo local ↔ cloud ---------- */

  function localToCloud(profile) {
    return {
      community: profile.community || null,
      course: profile.course || null,
      academic_year: profile.academicYear || null,
      curriculum_id: profile.curriculumId || null,
      client_updated_at: typeof Date.now === 'function' ? Date.now() : null
    };
  }

  function cloudToLocal(row) {
    return {
      community: row.community || null,
      course: row.course || null,
      academicYear: row.academic_year || null
    };
  }

  function localConfigured(profile) {
    return !!(profile && profile.setupCompleted && profile.community && profile.academicYear);
  }

  function cloudHasData(row) {
    return !!(row && (row.community || row.academic_year || row.course));
  }

  function sameAsPushed(profile) {
    if (!runtime.lastPushed) return false;
    const cur = localToCloud(profile);
    const last = runtime.lastPushed;
    return cur.community === last.community
      && cur.course === last.course
      && cur.academic_year === last.academic_year
      && cur.curriculum_id === last.curriculum_id;
  }

  /* ---------- Escrituras ---------- */

  async function pushProfile(profile) {
    if (!runtime.currentUser || !profile) return;
    const payload = localToCloud(profile);
    runtime.lastPushed = payload;
    const { error } = await sb.from('profiles')
      .update(payload)
      .eq('user_id', runtime.currentUser.id);
    if (error) {
      /* El error no bloquea: el local ya está guardado por profile.js. */
      if (global.console && global.console.warn) {
        global.console.warn('[SMR cloud-profile] push:', error.message);
      }
      runtime.lastPushed = null; /* permitir reintento en la próxima edición */
    }
  }

  async function pullProfile(row) {
    /* save() normaliza y valida contra SMR_DATA.curriculums reales:
       si el cloud trae un valor inválido, devuelve null y el local queda
       como estaba. Nunca se escribe basura en el localStorage. */
    const saved = SMR.profile.save(cloudToLocal(row));
    if (saved) {
      /* El cloud YA contiene estos valores: se registra el snapshot para
         que runPendingPush no re-envíe lo recién traído (echo write). */
      runtime.lastPushed = localToCloud(saved);
    } else if (global.console && global.console.warn) {
      global.console.warn('[SMR cloud-profile] pull descartado: valores cloud no válidos para el currículo actual');
    }
    return saved;
  }

  /* ---------- Sync inicial (SIGNED_IN) ---------- */

  async function fetchOwnProfile(userId) {
    try {
      const { data, error } = await sb.from('profiles')
        .select('community, course, academic_year, curriculum_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    } catch (err) {
      if (global.console && global.console.warn) {
        global.console.warn('[SMR cloud-profile] lectura cloud:', err && err.message ? err.message : err);
      }
      return null; /* falla → sin sync, local intacto */
    }
  }

  function initialSync(user) {
    if (!user) return Promise.resolve();
    if (runtime.syncing) return syncChain;
    runtime.syncing = true;
    runtime.currentUser = user;
    return enqueue(async () => {
      if (runtime.currentUser !== user) return;
      const local = SMR.profile.read();
      const cloud = await fetchOwnProfile(user.id);

      if (runtime.currentUser !== user) return; /* logout durante el fetch */

      /* POLÍTICA DETERMINISTA (ver cabecera del módulo). */
      if (localConfigured(local)) {
        await pushProfile(local);                 /* 1: gana LOCAL */
      } else if (cloudHasData(cloud)) {
        await pullProfile(cloud);                 /* 2: gana CLOUD */
      }                                            /* 3: no-op */

      runtime.syncing = false;
      runPendingPush();
    });
  }

  /* ---------- Edición local con sesión activa → push ---------- */

  function schedulePush() {
    if (!runtime.currentUser || runtime.syncing) return;
    if (runtime.pushTimer) clearTimeout(runtime.pushTimer);
    runtime.pushTimer = setTimeout(runPendingPush, 900);
  }

  function runPendingPush() {
    if (runtime.pushTimer) { clearTimeout(runtime.pushTimer); runtime.pushTimer = null; }
    if (!runtime.currentUser || runtime.syncing) return;
    const profile = SMR.profile.read();
    if (!localConfigured(profile) || sameAsPushed(profile)) return;
    return enqueue(async () => {
      if (runtime.currentUser && !runtime.syncing) {
        await pushProfile(SMR.profile.read());
      }
    });
  }

  /* ---------- Envoltorio aditivo de SMR.profile.save (API intacta) ---------- */

  const originalSave = SMR.profile.save;
  SMR.profile.save = function (partial) {
    const result = originalSave.call(SMR.profile, partial);
    schedulePush(); /* visitante: no-op; autenticado: push debounceado */
    return result;
  };

  /* ---------- Transiciones de sesión (listener único) ---------- */

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    global.addEventListener('smr:authchange', (event) => {
      const user = event.detail && event.detail.user;
      if (user) {
        if (runtime.currentUser !== user) {
          runtime.currentUser = user;
          runtime.lastPushed = null;
          initialSync(user);
        }
      } else {
        /* SIGNED_OUT: el local se conserva íntegro; solo se resetea el
           estado runtime de la sincronización. */
        runtime.currentUser = null;
        runtime.syncing = false;
        runtime.lastPushed = null;
        if (runtime.pushTimer) { clearTimeout(runtime.pushTimer); runtime.pushTimer = null; }
      }
    });
  }

  wire();
})(typeof window !== 'undefined' ? window : globalThis);

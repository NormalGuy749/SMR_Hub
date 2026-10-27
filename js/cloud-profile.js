'use strict';

/* Sincroniza studentProfile con la fila propia de profiles.
   Al iniciar sesión gana el perfil local configurado; si está vacío,
   se importa el remoto. El dispositivo que inicia sesión decide sin usar
   timestamps del navegador como autoridad. Las ediciones posteriores se suben.
   setupCompleted es derivable y display_name no se edita desde este perfil;
   updated_at lo sella el servidor, client_updated_at es solo diagnóstico.
   La cola serializa operaciones y las ediciones durante el sync se difieren.
   lastPushed evita reenviar un perfil recién importado; los pushes no llaman
   a profile.save. Los errores y el logout conservan el perfil local. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  if (!SMR.cloudAvailable || !SMR.cloud || !SMR.profile) return;

  const sb = SMR.cloud;

  /* studentProfile pertenece al slot que gestiona cloud-progress.js.
     Este módulo se carga antes: no puede inferir la propiedad por el orden
     de los listeners de authchange. Espera a SMR.cloudSession para leer el
     slot del usuario correcto; sin contrato no lee ni escribe el perfil. */
  function sessionContract() {
    const s = global.SMR && global.SMR.cloudSession;
    return (s && typeof s.awaitSlot === 'function' && typeof s.isCurrent === 'function') ? s : null;
  }

  /* Token del uid: espera a que su slot esté instalado. null = propiedad no
     demostrable → ninguna operación de perfil para ese uid. */
  async function slotTokenFor(uid) {
    const c = sessionContract();
    if (!c) return null;
    const ok = await c.awaitSlot(uid);
    if (!ok || c.owner() !== uid) return null;
    return c.token();
  }

  function tokenCurrent(token) {
    const c = sessionContract();
    return !!c && !!token && c.isCurrent(token);
  }

  const runtime = {
    currentUser: null,
    syncing: false,
    initialSyncFor: null, /* uid con sync inicial ya programado */
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

  async function pushProfile(profile, token) {
    if (!runtime.currentUser || !profile) return;
    /* El uid sale del token validado; runtime.currentUser puede haber cambiado. */
    if (!tokenCurrent(token)) return;
    const payload = localToCloud(profile);
    runtime.lastPushed = payload;
    const { error } = await sb.from('profiles')
      .update(payload)
      .eq('user_id', token.owner);
    if (error) {
      /* El error no bloquea: el local ya está guardado por profile.js. */
      if (global.console && global.console.warn) {
        global.console.warn('[SMR cloud-profile] push:', error.message);
      }
      runtime.lastPushed = null; /* permitir reintento en la próxima edición */
    }
  }

  async function pullProfile(row, token) {
    if (!tokenCurrent(token)) return null; /* respuesta tardía de otra cuenta */
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
      return null;
    }
  }

  function initialSync(user) {
    if (!user) return Promise.resolve();
    runtime.currentUser = user;
    /* El guard es por usuario: un sync en vuelo no debe impedir el de otra cuenta. */
    if (runtime.initialSyncFor === user.id) return syncChain;
    runtime.initialSyncFor = user.id;
    runtime.syncing = true;
    return enqueue(async () => {
      try {
        if (runtime.currentUser !== user) return;
        /* El slot de este uid debe estar instalado antes de leerlo. */
        const token = await slotTokenFor(user.id);
        if (!token) return;
        const local = SMR.profile.read();
        const cloud = await fetchOwnProfile(user.id);

        if (runtime.currentUser !== user) return;
        if (!tokenCurrent(token)) return;

        if (localConfigured(local)) {
          await pushProfile(local, token);
        } else if (cloudHasData(cloud)) {
          await pullProfile(cloud, token);
        }
      } catch (err) {
        if (global.console && global.console.warn) {
          global.console.warn('[SMR cloud-profile] initialSync:', err && err.message ? err.message : err);
        }
      } finally {
        /* Solo el job del usuario actual puede liberar syncing: el flag puede
           pertenecer ya a una cuenta nueva, incluso tras un early-return. */
        if (runtime.initialSyncFor === user.id) runtime.syncing = false;
      }
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
      if (!runtime.currentUser || runtime.syncing) return;
      /* El push diferido puede ejecutarse ya en otra sesión. */
      const token = await slotTokenFor(runtime.currentUser.id);
      if (!tokenCurrent(token)) return;
      await pushProfile(SMR.profile.read(), token);
    });
  }

  /* ---------- Envoltorio aditivo de SMR.profile.save (API intacta) ---------- */

  const originalSave = SMR.profile.save;
  SMR.profile.save = function (partial) {
    const result = originalSave.call(SMR.profile, partial);
    schedulePush();
    return result;
  };

  /* ---------- Transiciones de sesión (listener único) ---------- */

  let wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    global.addEventListener('smr:authchange', (event) => {
      const user = event.detail && event.detail.user;
      /* cloud-progress archiva/restaura studentProfile con su dueño. Aquí
         se limpia el runtime para no reutilizar lastPushed de otra cuenta. */
      if (user) {
        if (runtime.currentUser !== user) {
          runtime.currentUser = user;
          runtime.lastPushed = null;
          initialSync(user);
        }
      } else {
        /* El logout libera el runtime para el próximo sync; el local se conserva. */
        runtime.currentUser = null;
        runtime.syncing = false;
        runtime.initialSyncFor = null;
        runtime.lastPushed = null;
        if (runtime.pushTimer) { clearTimeout(runtime.pushTimer); runtime.pushTimer = null; }
      }
    });
  }

  wire();
})(typeof window !== 'undefined' ? window : globalThis);

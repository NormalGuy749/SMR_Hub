'use strict';

/* SMR Hub — Fase 8.2: Supabase Authentication (solo identidad)
   ------------------------------------------------------------------
   Qué hace:
   - Restaura sesión al arrancar (persistSession + autoRefreshToken, ya
     configurados en js/supabase.js) y escucha SIGNED_IN / SIGNED_OUT /
     PASSWORD_RECOVERY / INITIAL_SESSION.
   - Widget en el pie del sidebar: "Iniciar sesión" (visitante) o email +
     "Cerrar sesión" (autenticado).
   - Modal coherente con el design system (SMR.modal): entrar, crear
     cuenta, recuperar contraseña y establecer nueva contraseña.
   - Provisioning del perfil: al primer SIGNED_IN garantiza (de forma
     idempotente, ON CONFLICT DO NOTHING) que exista la fila en
     public.profiles. Es el fallback client-side documentado en 8.0.2;
     el trigger on_auth_user_created (migration 00002) hace lo propio en
     el servidor. RLS (profiles_insert_own) solo permite insertar la
     fila propia: el cliente jamás elige un user_id arbitrario.

   Qué NO hace (fases 8.3+): sincronización de perfil académico, progreso,
   SRS, favoritos, historial ni migración local→cloud. Solo identidad.

   Integración sin romper APIs:
   - NO toca SMR.store, SMR.progress, SMR.profile ni sus claves
     localStorage existentes.
   - Emite window event 'smr:authchange' con { user } para que fases
     posteriores reaccionen. Nada de la app actual depende de él.
   - Si Supabase no está disponible (offline / CDN caído / sin config),
     el módulo queda inerte y el visitante estudia exactamente igual. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  if (!SMR.cloudAvailable || !SMR.cloud) return; /* visitante puro */

  const auth = SMR.cloud.auth;

  const state = { user: null, profileEnsured: false };
  SMR.auth = {
    get user() { return state.user; },
    isSignedIn() { return !!state.user; },
    async signOut() { await auth.signOut(); },
    open(view) { openAuthModal(view || 'login'); }
  };

  /* ---------- Errores legibles ---------- */

  const ERROR_MAP = [
    [/invalid login credentials/i, 'Email o contraseña incorrectos.'],
    [/email not confirmed/i, 'Confirma tu email antes de entrar: te enviamos un enlace de verificación.'],
    [/user already registered/i, 'Ya existe una cuenta con ese email. Prueba a entrar.'],
    [/password should be at least/i, 'La contraseña es demasiado corta (mínimo 6 caracteres).'],
    [/same password/i, 'La nueva contraseña coincide con la actual.'],
    [/rate limit/i, 'Demasiados intentos. Espera un momento y vuelve a probarlo.'],
    [/email address .* is invalid|unable to validate email/i, 'El email no tiene un formato válido.'],
    [/signup requires a valid password/i, 'Introduce una contraseña válida.'],
    [/fake email|test email/i, 'El proyecto no permite emails de prueba: usa un email real.']
  ];

  function friendlyError(err) {
    const msg = (err && (err.message || err.msg)) || String(err || 'Error');
    for (const [re, text] of ERROR_MAP) {
      if (re.test(msg)) return text;
    }
    return msg;
  }

  /* ---------- Widget del sidebar ---------- */

  let widgetLi = null;

  function buildWidget() {
    const li = document.createElement('li');
    li.className = 'auth-nav-item';
    renderWidget(li);
    return li;
  }

  function renderWidget(li) {
    if (state.user) {
      li.innerHTML =
        '<span class="nav-link auth-nav-user" title="' + SMR.esc(state.user.email || '') + '">' +
          SMR.icon('user', 18) +
          '<span class="auth-nav-email">' + SMR.esc(state.user.email || 'Cuenta') + '</span>' +
        '</span>' +
        '<button type="button" class="icon-btn" data-auth-logout title="Cerrar sesión" aria-label="Cerrar sesión">' +
          SMR.icon('logout', 16) +
        '</button>';
      const btn = li.querySelector('[data-auth-logout]');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try { await auth.signOut(); } catch (err) { console.warn('[SMR auth] logout:', err); btn.disabled = false; }
      });
    } else {
      li.innerHTML =
        '<button type="button" class="nav-link" data-auth-open>' +
          SMR.icon('user', 18) +
          '<span>Iniciar sesión</span>' +
        '</button>';
      li.querySelector('[data-auth-open]').addEventListener('click', () => openAuthModal('login'));
    }
  }

  function refreshWidget() {
    if (widgetLi) renderWidget(widgetLi);
  }

  /* ---------- Provisioning del perfil (idempotente) ---------- */

  async function ensureProfile(user) {
    if (!user || state.profileEnsured) return;
    state.profileEnsured = true;
    try {
      /* ON CONFLICT DO NOTHING vía PostgREST (ignoreDuplicates):
         no sobrescribe nada y no puede elegir user_id ajeno — RLS
         profiles_insert_own exige user_id = auth.uid(). */
      const { error } = await SMR.cloud
        .from('profiles')
        .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
      if (error) console.warn('[SMR auth] profile provisioning:', error.message);
    } catch (err) {
      console.warn('[SMR auth] profile provisioning (excepción):', err);
    }
  }

  /* ---------- Modal de autenticación ---------- */

  function setBusy(form, busy) {
    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = busy;
      btn.dataset.label = btn.dataset.label || btn.textContent;
      btn.textContent = busy ? 'Un momento…' : btn.dataset.label;
    }
  }

  function showMessage(box, text, isError) {
    const el = box.querySelector('[data-auth-msg]');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('auth-msg-error', !!isError);
  }

  function esc(s) { return SMR.esc(s); }

  const VIEWS = {
    login: {
      title: 'Iniciar sesión',
      html:
        '<form data-auth-form="login" novalidate>' +
          '<div class="field-wrap"><label class="field-label" for="auth-email">Email</label>' +
          '<input class="input" id="auth-email" name="email" type="email" autocomplete="email" required></div>' +
          '<div class="field-wrap"><label class="field-label" for="auth-pass">Contraseña</label>' +
          '<input class="input" id="auth-pass" name="password" type="password" autocomplete="current-password" required></div>' +
          '<button type="submit" class="btn btn-primary">Entrar</button>' +
        '</form>' +
        '<p class="count-note"><button type="button" class="auth-link" data-view="reset">¿Olvidaste tu contraseña?</button></p>' +
        '<p class="count-note">¿No tienes cuenta? <button type="button" class="auth-link" data-view="signup">Crear una</button></p>',
      onSubmit: async (box, form, data) => {
        const { error } = await auth.signInWithPassword({
          email: data.email,
          password: data.password
        });
        if (error) { showMessage(box, friendlyError(error), true); setBusy(form, false); return; }
        SMR.modal.close();
      }
    },
    signup: {
      title: 'Crear cuenta',
      html:
        '<form data-auth-form="signup" novalidate>' +
          '<div class="field-wrap"><label class="field-label" for="auth-email">Email</label>' +
          '<input class="input" id="auth-email" name="email" type="email" autocomplete="email" required></div>' +
          '<div class="field-wrap"><label class="field-label" for="auth-pass">Contraseña (mínimo 6 caracteres)</label>' +
          '<input class="input" id="auth-pass" name="password" type="password" autocomplete="new-password" minlength="6" required></div>' +
          '<button type="submit" class="btn btn-primary">Crear cuenta</button>' +
        '</form>' +
        '<p class="count-note">Si el proyecto exige confirmación, te llegará un email con un enlace: ábrelo para activar la cuenta.</p>' +
        '<p class="count-note">¿Ya tienes cuenta? <button type="button" class="auth-link" data-view="login">Iniciar sesión</button></p>',
      onSubmit: async (box, form, data) => {
        const { data: res, error } = await auth.signUp({
          email: data.email,
          password: data.password
        });
        if (error) { showMessage(box, friendlyError(error), true); setBusy(form, false); return; }
        if (res && res.session) {
          SMR.modal.close();
        } else {
          setBusy(form, false);
          showMessage(box, 'Cuenta creada. Revisa tu email y abre el enlace de confirmación para poder entrar.', false);
          form.reset();
        }
      }
    },
    reset: {
      title: 'Recuperar contraseña',
      html:
        '<form data-auth-form="reset" novalidate>' +
          '<div class="field-wrap"><label class="field-label" for="auth-email">Email</label>' +
          '<input class="input" id="auth-email" name="email" type="email" autocomplete="email" required></div>' +
          '<button type="submit" class="btn btn-primary">Enviar enlace de recuperación</button>' +
        '</form>' +
        '<p class="count-note">Te enviaremos un enlace para establecer una contraseña nueva. Volverá a esta misma página.</p>' +
        '<p class="count-note"><button type="button" class="auth-link" data-view="login">Volver a iniciar sesión</button></p>',
      onSubmit: async (box, form, data) => {
        const { error } = await auth.resetPasswordForEmail(data.email, {
          redirectTo: global.location.origin + global.location.pathname
        });
        if (error) { showMessage(box, friendlyError(error), true); setBusy(form, false); return; }
        setBusy(form, false);
        showMessage(box, 'Enlace enviado. Revisa tu bandeja (y la carpeta de spam).', false);
        form.reset();
      }
    },
    'update-password': {
      title: 'Nueva contraseña',
      html:
        '<form data-auth-form="update-password" novalidate>' +
          '<div class="field-wrap"><label class="field-label" for="auth-pass">Contraseña nueva (mínimo 6 caracteres)</label>' +
          '<input class="input" id="auth-pass" name="password" type="password" autocomplete="new-password" minlength="6" required></div>' +
          '<button type="submit" class="btn btn-primary">Guardar contraseña</button>' +
        '</form>',
      onSubmit: async (box, form, data) => {
        const { error } = await auth.updateUser({ password: data.password });
        if (error) { showMessage(box, friendlyError(error), true); setBusy(form, false); return; }
        setBusy(form, false);
        showMessage(box, 'Contraseña actualizada. Ya puedes seguir estudiando.', false);
      }
    }
  };

  function openAuthModal(viewName) {
    if (!SMR.modal || typeof SMR.modal.open !== 'function') return;
    const view = VIEWS[viewName] || VIEWS.login;
    SMR.modal.open((box) => {
      box.classList.add('auth-modal');
      box.innerHTML =
        '<button type="button" class="icon-btn modal-close" aria-label="Cerrar">' + SMR.icon('close', 16) + '</button>' +
        '<h2 class="modal-title">' + esc(view.title) + '</h2>' +
        '<div data-auth-body></div>' +
        '<p class="count-note auth-msg" data-auth-msg aria-live="polite"></p>';
      const body = box.querySelector('[data-auth-body]');
      body.innerHTML = view.html;

      body.addEventListener('click', (event) => {
        const link = event.target.closest('[data-view]');
        if (link) openAuthModal(link.dataset.view);
      });

      const form = body.querySelector('form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setBusy(form, true);
        showMessage(box, '', false);
        const data = Object.fromEntries(new FormData(form).entries());
        try {
          await view.onSubmit(box, form, data);
        } catch (err) {
          showMessage(box, friendlyError(err), true);
          setBusy(form, false);
        }
      });

      const close = box.querySelector('.modal-close');
      if (close) close.addEventListener('click', SMR.modal.close);
      const firstInput = body.querySelector('input');
      if (firstInput) firstInput.focus();
    });
  }

  /* ---------- Arranque: sesión persistente + eventos ---------- */

  function announce() {
    global.dispatchEvent(new CustomEvent('smr:authchange', { detail: { user: state.user } }));
  }

  async function handleSession(session) {
    const user = session ? session.user : null;
    const wasSignedIn = !!state.user;
    state.user = user;
    if (!user) state.profileEnsured = false;
    refreshWidget();
    if (user) {
      await ensureProfile(user);
      if (!wasSignedIn) announce();
    } else if (wasSignedIn) {
      announce();
    }
  }

  async function init() {
    try {
      /* Restauración de sesión al arrancar (persistencia tras refresh). */
      const { data, error } = await auth.getSession();
      if (error) console.warn('[SMR auth] getSession:', error.message);
      await handleSession(data && data.session ? data.session : null);

      auth.onAuthStateChange(async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          await handleSession(session);
          openAuthModal('update-password');
          return;
        }
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
          await handleSession(session);
          return;
        }
        /* TOKEN_REFRESHED: supabase-js ya renovó el token; nada que hacer. */
      });
    } catch (err) {
      /* Sin red o CDN caído: modo visitante intacto. */
      console.warn('[SMR auth] init falló (¿offline?):', err);
    }
  }

  /* Inyección del widget tras el nav del footer (configuración). */
  function injectWidget() {
    const footer = document.getElementById('nav-footer');
    if (!footer || document.querySelector('.auth-nav-item')) return;
    widgetLi = buildWidget();
    footer.appendChild(widgetLi);
  }

  injectWidget();
  init();
})(typeof window !== 'undefined' ? window : globalThis);

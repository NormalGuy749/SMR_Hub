'use strict';

/* Cliente compartido, configurado mediante SMR_SUPABASE_URL y
   SMR_SUPABASE_ANON_KEY públicas. Nunca se usa service_role en el frontend.
   Sin configuración o SDK, SMR.cloud queda a null y la app funciona en local. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});

  const SUPABASE_URL = global.SMR_SUPABASE_URL || null;
  const SUPABASE_ANON_KEY = global.SMR_SUPABASE_ANON_KEY || null;

  SMR.cloudAvailable = false;
  SMR.cloud = null;

  /* La ausencia de configuración es legítima; una configuración parcial
     se avisa sin declarar la aplicación conectada. */
  const URL_OK = typeof SUPABASE_URL === 'string' && /^https?:\/\/\S+$/i.test(SUPABASE_URL);
  const KEY_OK = typeof SUPABASE_ANON_KEY === 'string' && SUPABASE_ANON_KEY.trim().length >= 8;
  if (!URL_OK || !KEY_OK) {
    if (SUPABASE_URL || SUPABASE_ANON_KEY) {
      if (global.console && global.console.warn) {
        global.console.warn('[SMR cloud] configuración pública incompleta o inválida: no se inicializa el cliente');
      }
    }
    return;
  }

  /* En un origen público se rechaza loopback: una configuración inyectada
     por error conectaría al localhost de cada visitante. La validación
     vive también aquí porque la configuración llega desde el despliegue. */
  const PAGE_HOST = (global.location && global.location.hostname) || '';
  const PAGE_IS_LOCAL = PAGE_HOST === '' || PAGE_HOST === 'localhost' || PAGE_HOST === '127.0.0.1' ||
    PAGE_HOST === '[::1]' || PAGE_HOST === '::1';
  if (!PAGE_IS_LOCAL && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::|\/|$)/i.test(SUPABASE_URL)) {
    if (global.console && global.console.warn) {
      global.console.warn('[SMR cloud] configuración loopback en un origen público: no se inicializa el cliente');
    }
    return;
  }

  const CLIENT_OPTIONS = {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce'
    },
    global: {
      headers: { 'X-SMR-Client': 'foundation-8.1' }
    }
  };

  try {
    if (!global.supabase || typeof global.supabase.createClient !== 'function') {
      throw new Error('SDK @supabase/supabase-js no disponible (CDN no cargada)');
    }
    SMR.cloud = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, CLIENT_OPTIONS);
    SMR.cloudAvailable = true;
  } catch (err) {
    /* Fallo al inicializar (CDN caída, credenciales malformadas, etc.):
       la app sigue siendo local-first. Solo se registra. */
    if (global.console && global.console.warn) {
      global.console.warn('[SMR cloud] cliente Supabase no inicializado:', err && err.message ? err.message : err);
    }
    SMR.cloud = null;
    SMR.cloudAvailable = false;
  }
})(typeof window !== 'undefined' ? window : globalThis);

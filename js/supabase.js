'use strict';

/* SMR Hub — Fase 8.1: Foundation Supabase (cliente, NO cloud-first)
   ------------------------------------------------------------------
   Solo infraestructura: expone window.SMR.cloud (si hay credenciales)
   y SMR.cloudAvailable (boolean). NO implementa Auth (fase 8.2),
   NO sincroniza datos (fases 8.3–8.6), NO lee ni escribe nada cloud.

   Credenciales (solo públicas — project URL + anon/publishable key):
     window.SMR_SUPABASE_URL
     window.SMR_SUPABASE_ANON_KEY
   (inyectadas como globals por el deploy de Cloudflare Pages o un
   config.js local; este archivo NO las hardcodea).

   SIN credenciales: SMR.cloud = null, SMR.cloudAvailable = false y la
   aplicación funciona exactamente como antes (visitante, localStorage,
   offline). NUNCA se usa service_role en el frontend.
*/

(function (global) {
  const SMR = (global.SMR = global.SMR || {});

  const SUPABASE_URL = global.SMR_SUPABASE_URL || null;
  const SUPABASE_ANON_KEY = global.SMR_SUPABASE_ANON_KEY || null;

  SMR.cloudAvailable = false;
  SMR.cloud = null;

  /* Guard: no inicializar nada sin ambas variables públicas. */
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const CLIENT_OPTIONS = {
    auth: {
      /* Fase 8.1: sin Auth. Sesión persistente estará activa en 8.2. */
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

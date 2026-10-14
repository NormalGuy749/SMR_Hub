/* SMR Hub — Fase 8.2: configuración pública de Supabase
   ------------------------------------------------------------------
   SOLO datos públicos (la publishable key está diseñada para el
   frontend). NUNCA incluir aquí service_role/sb_secret.
   La app funciona sin conexión y sin Supabase: si estas variables no
   existen o el CDN del SDK falla, js/supabase.js degrada a local. */

window.SMR_SUPABASE_URL = 'http://127.0.0.1:54321';
window.SMR_SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

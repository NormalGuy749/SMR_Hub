/* Solo configuración pública: nunca service_role ni sb_secret.
   En loopback y file:// se usa el stack local; en un origen público no se
   asigna nada y la configuración debe inyectarse antes de este archivo
   y de supabase.js. Sin configuración o SDK, la app funciona en local. */

(function (global) {
  var host = (global.location && global.location.hostname) || '';
  var isLocal = host === '' || host === 'localhost' || host === '127.0.0.1' ||
    host === '[::1]' || host === '::1';
  if (!isLocal) return;

  global.SMR_SUPABASE_URL = 'http://127.0.0.1:54321';
  global.SMR_SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
})(typeof window !== 'undefined' ? window : globalThis);

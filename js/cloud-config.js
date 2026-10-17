/* SMR Hub — Fase 8.2: configuración pública de Supabase
   ------------------------------------------------------------------
   SOLO datos públicos (la publishable key está diseñada para el
   frontend). NUNCA incluir aquí service_role/sb_secret.
   La app funciona sin conexión y sin Supabase: si estas variables no
   existen o el CDN del SDK falla, js/supabase.js degrada a local.

   FASE 8.7 — GUARDA DE LOOPBACK. Estos valores son los del stack LOCAL
   de desarrollo. Antes se aplicaban SIEMPRE, y como index.html carga
   este archivo en cualquier origen, un despliegue público enviaba a
   cada visitante a su propio 127.0.0.1:54321 (con la clave pública del
   stack local) y no había forma de inyectar los valores reales.
   Ahora, fuera de loopback este archivo NO fija nada: el despliegue
   debe definir window.SMR_SUPABASE_URL y window.SMR_SUPABASE_ANON_KEY
   en un script anterior (p. ej. uno generado con las variables del
   entorno). Si no lo hace, la app queda en modo local-first (visitante,
   offline) y lo registra en consola: nunca apunta a un servicio ajeno.

   file:// (hostname vacío) cuenta como local: no es un origen público
   y así el flujo de abrir index.html desde disco sigue funcionando.

   CONTRATO DE CONFIGURACIÓN (auditoría de estabilización):
     1. Local (localhost/127.0.0.1/[::1]/file://) → este archivo fija el
        stack local y la app puede autenticar y sincronizar contra él.
     2. Público con inyección previa → manda lo inyectado (este archivo no
        sobrescribe nada fuera de loopback). El script inyector debe
        ejecutarse ANTES de js/supabase.js y ANTES de este archivo.
     3. Público sin inyección → este archivo no fija nada y js/supabase.js
        deja la app en local-first (visitante/offline). Es el estado actual
        del despliegue: la inyección pública sigue PENDIENTE como tarea
        independiente (requiere decidir el método de publicación) y sin ella
        la nube queda desactivada en producción, nunca medio conectada.
   Pruebas de los cuatro escenarios: tests/cloud-config.test.js */

(function (global) {
  var host = (global.location && global.location.hostname) || '';
  var isLocal = host === '' || host === 'localhost' || host === '127.0.0.1' ||
    host === '[::1]' || host === '::1';
  if (!isLocal) return;

  global.SMR_SUPABASE_URL = 'http://127.0.0.1:54321';
  global.SMR_SUPABASE_ANON_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
})(typeof window !== 'undefined' ? window : globalThis);

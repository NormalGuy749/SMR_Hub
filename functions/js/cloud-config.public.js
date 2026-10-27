/* Pages elimina solo la última extensión: este archivo sirve
   /js/cloud-config.public, la ruta que pide index.html antes de supabase.js.
   No debe existir un asset estático que tape esa ruta. Regla de Pages:
   https://github.com/cloudflare/workers-sdk/blob/main/packages/pages-functions/src/routing/filepath-routing.ts
   Las variables de entorno llegan a context.env, no al sitio estático.
   Esta respuesta acaba en el navegador: solo URL y clave pública, nunca
   secretos de servidor. Sin valores válidos se devuelve un script inerte;
   supabase.js también rechaza endpoints loopback en un origen público. */

const URL_VAR = 'SMR_SUPABASE_URL';
const KEY_VAR = 'SMR_SUPABASE_ANON_KEY';

function script(body) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      /* Sin caché: una rotación de clave debe surtir efecto sin purgar nada. */
      'Cache-Control': 'no-store'
    }
  });
}

export function onRequestGet(context) {
  const env = (context && context.env) || {};
  const url = typeof env[URL_VAR] === 'string' ? env[URL_VAR].trim() : '';
  const key = typeof env[KEY_VAR] === 'string' ? env[KEY_VAR].trim() : '';
  if (!/^https?:\/\/\S+$/i.test(url) || key.length < 8) {
    return script('/* SMR Hub: este despliegue no tiene configuración pública de Supabase. */\n');
  }
  return script(
    'window.SMR_SUPABASE_URL = ' + JSON.stringify(url) + ';\n' +
    'window.SMR_SUPABASE_ANON_KEY = ' + JSON.stringify(key) + ';\n'
  );
}

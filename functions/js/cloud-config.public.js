/* SMR Hub — Cloudflare Pages Function: configuración pública de Supabase
   ----------------------------------------------------------------------
   Ruta servida: /js/cloud-config.public. Pages genera la ruta quitando la
   ÚLTIMA extensión del nombre del archivo (path.extname), así que
   functions/js/cloud-config.public.js se sirve en /js/cloud-config.public,
   sin .js. Esa es la ruta que pide index.html y no hay ningún archivo
   estático en ella: la Function responde siempre, sin depender de tapar a
   un asset. Fuente de la regla:
   https://github.com/cloudflare/workers-sdk/blob/main/packages/pages-functions/src/routing/filepath-routing.ts

   POR QUÉ ASÍ: en un sitio estático de Pages las variables de entorno del
   proyecto NO llegan al JavaScript del navegador; sí llegan a las Functions
   por `context.env`. Esta Function lee SOLO los dos nombres públicos y
   devuelve un script que el navegador carga ANTES de js/supabase.js.

   SEGURIDAD: aquí no se lee ningún secreto (service_role, claves de
   servicio, tokens). Todo lo que esta respuesta contiene acaba en el cliente,
   así que solo puede contener la URL del proyecto y la clave publicable.
   Si los valores no están o están mal formados, no se inyecta NADA y la
   aplicación arranca en modo local-first (visitante/offline); el cliente
   tiene su propia guarda para rechazar un endpoint loopback en un origen
   público (js/supabase.js).

   Configuración: DESPLIEGUE.md. Pruebas: tests/cloud-config.test.js */

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

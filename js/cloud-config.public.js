/* SMR Hub — ranura de configuración pública de Supabase (despliegue manual)
   -------------------------------------------------------------------------
   Este archivo NO define nada: es intencionadamente inerte.

   En un despliegue que use Functions (el normal, ver DESPLIEGUE.md) NO se
   carga: index.html pide /js/cloud-config.public, la ruta que Pages genera
   para `functions/js/cloud-config.public.js` quitándole la última extensión,
   y esa Function devuelve la URL del proyecto y la clave publicable leídas
   de las variables de entorno del proyecto.

   Existe para la alternativa sin Functions (subida manual del sitio): quien
   no pueda usar Functions apunta el `src` del script de configuración a este
   archivo y escribe aquí los dos valores. Vacío no rompe nada: la aplicación
   queda en modo local-first (visitante, localStorage, offline).

   NO poner valores aquí por defecto: este archivo y todo lo que llegue al
   navegador es público. NUNCA service_role ni ningún secreto de servidor. */

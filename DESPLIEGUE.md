# Despliegue de SMR Hub — configuración pública de Supabase

Procedimiento para que la SPA estática (Cloudflare Pages) reciba la URL del proyecto y la
clave publicable sin poner ningún secreto en el cliente. Lo contrario (no configurar nada)
es un estado válido: la aplicación funciona en modo local-first.

## 1. Contrato de configuración

| Escenario | Quién decide | Resultado |
|---|---|---|
| Local (`localhost`, `127.0.0.1`, `[::1]`, `file://`) | `js/cloud-config.js` | Stack local `http://127.0.0.1:54321` |
| Público **con** configuración inyectada | la Pages Function, en `/js/cloud-config.public` | Auth y sincronización contra el proyecto indicado |
| Público **sin** configuración | nadie | Local-first: visitante, `localStorage`, offline. Sin error |
| Público con un endpoint loopback inyectado por error | `js/supabase.js` (guarda) | No se inicializa el cliente: nunca apunta al `localhost` del visitante |
| Configuración incompleta o mal formada | `js/supabase.js` (guarda) | No se inicializa y se avisa por consola |

Variables que se leen (ambas **públicas**):

- `SMR_SUPABASE_URL` → `https://<project-ref>.supabase.co` (nunca `http://127.0.0.1:54321` en producción)
- `SMR_SUPABASE_ANON_KEY` → clave *publishable* / *anon* del proyecto

Nunca se lee ni se sirve `service_role`, `sb_secret` ni ninguna credencial de servidor.
La seguridad de los datos depende de las políticas RLS, no de ocultar la clave publicable.

Orden de carga (garantizado por `defer`): SDK CDN → `js/cloud-config.public` (la ruta de la
Function; sin `.js`, ver §2) → `js/cloud-config.js` → `js/supabase.js` → `js/auth.js`.

## 2. Mecanismo implementado (Cloudflare Pages con Git)

1. `functions/js/cloud-config.public.js` es una **Pages Function** que sirve
   `/js/cloud-config.public` con los valores de `context.env` (solo esos dos nombres).
   Sin valores válidos devuelve un script inerte, y `Cache-Control: no-store`.
   **La ruta no lleva `.js`**: Pages forma la ruta quitándole la ÚLTIMA extensión al
   nombre del archivo (`path.extname`), así que `functions/js/cloud-config.public.js`
   vive en `/js/cloud-config.public`. `index.html` pide exactamente esa ruta. Si pidiera
   `/js/cloud-config.public.js` la petición no llegaría a la Function y el despliegue se
   quedaría en local-first sin avisar: ese era el fallo, ya corregido, y
   `tests/cloud-config.test.js` lo vigila.
2. En esa ruta no hay ningún archivo estático, así que la Function responde siempre: no
   depende de tener prioridad sobre un asset. `js/cloud-config.public.js` (la ranura
   inerte, con seguimiento) solo se usa en la alternativa sin Functions de §3.

### Pasos manuales (una sola vez)

1. Proyecto de Pages → **Settings → Build configuration**: sin comando de build
   (sitio estático), directorio de salida la raíz del repositorio, rama de producción `main`.
   La carpeta `functions/` debe estar en la **raíz del proyecto** (no dentro del directorio
   estático); Pages la detecta al publicar.
2. Proyecto de Pages → **Settings → Environment variables** → añadir, como variables de
   **texto** (no secretos, son públicas) en **Production** y en **Preview**:
   - `SMR_SUPABASE_URL`
   - `SMR_SUPABASE_ANON_KEY`
   Usa los valores de Supabase → *Project Settings → API* (Project URL y la clave
   `anon`/`publishable`). No añadas `service_role` en ningún caso.
3. **Redesplegar**: las Functions forman parte del despliegue; un cambio de variables no
   reescribe un despliegue ya publicado.

### Comprobar

```bash
curl -s https://<tu-dominio>/js/cloud-config.public
# debe devolver:  window.SMR_SUPABASE_URL = "https://….supabase.co";  (+ la clave publicable)
# y con cabecera application/javascript; si devuelve el HTML del sitio, la Function no
# está activa y la petición cayó en el fallback SPA.
```

En la consola del navegador del sitio publicado:

```js
SMR.cloudAvailable        // true
SMR_SUPABASE_URL          // https://<project-ref>.supabase.co  (jamás 127.0.0.1)
```

Y en la pestaña Network: ninguna petición a `127.0.0.1` ni a `localhost`.

## 3. Alternativas si no se usan Functions

- **Despliegue por subida manual (drag & drop)**: Cloudflare no despliega Functions por
  esa vía, así que `/js/cloud-config.public` no existiría. Escribe las dos asignaciones a
  mano en `js/cloud-config.public.js` y apunta a ese archivo el `src` del script de
  configuración en `index.html` (una línea). La clave acaba en el navegador igualmente:
  es pública por diseño, y la frontera real es RLS.
- **Con build**: genera el mismo archivo en el comando de build a partir de las variables
  del entorno (`SMR_SUPABASE_URL`, `SMR_SUPABASE_ANON_KEY`). En Pages, las variables del
  *build* no llegan al JavaScript del navegador por sí solas: hay que escribirlas en el
  archivo generado.

## 4. Diagnóstico rápido

| Síntoma | Causa habitual |
|---|---|
| El sitio publicado queda en local-first | Variables ausentes en ese entorno (Preview y Production se configuran por separado) o la Function no se ejecuta (proyecto no conectado a Git / `functions/` mal ubicada) |
| `curl /js/cloud-config.public` devuelve el comentario | Faltan o están mal formadas las variables de ese entorno (URL sin `https://` o clave de menos de 8 caracteres) |
| `curl /js/cloud-config.public` devuelve el HTML del sitio | La Function no está activa: despliegue por subida manual, `functions/` fuera de la raíz del proyecto o proyecto no conectado a Git. El fallback SPA sirve `index.html` y el navegador rechaza ejecutarlo |
| El navegador pide `/js/cloud-config.public.js` (con `.js`) | Alguien volvió a poner la ruta con extensión en `index.html`: esa petición no llega a la Function, solo al archivo inerte |
| `cloudAvailable` es `false` con URL pública bien formada | La URL es un endpoint loopback: el cliente lo rechaza por diseño en orígenes públicos |
| Tras rotar la clave sigue la vieja | No se redesplegó, o el navegador sirvió la página desde caché (la respuesta de la config va con `no-store`) |

Pruebas automatizadas del contrato: `node tests/cloud-config.test.js` (14 comprobaciones:
la Function, el orden de carga y que la ruta pedida por `index.html` sea exactamente la que
la Function sirve) y `bash tests/run-all.sh` para la regresión completa.

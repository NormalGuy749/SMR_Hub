# SMR Hub — Roadmap y estado de fases

> Documento de orientación. Verificar el repositorio y los informes actuales antes de ejecutar cualquier fase. “Completada” significa que fue reportada como completada/aceptada; no garantiza que los tests sigan pasando en el estado actual.

## Fases anteriores reportadas como completadas

- 6D.6, 6D.7, 6D.8, 6D.9.
- 7 — UI/UX y Cloudflare/Deployment.
- 8.0 — diseño de arquitectura cloud.
- 8.1+ — foundation, auth, perfil cloud y sincronización de progreso en las fases previas.
- 8.4.4 — hardening de sincronización.
- 8.4.5 — coordinación multi-pestaña.
- 8.4.5.1 — auditoría independiente: `APROBADO CON LIMITACIONES`.
- 8.4.6 — decisión/validación de locks y compatibilidad: `APROBADO CON LIMITACIONES`.

No reabrir estas fases salvo defecto reproducible o riesgo nuevo.

## Fase 8.5

### 8.5.0 — Diseño técnico SRS cloud
- Reportada como terminada el 11-10-2026.
- Veredicto: `DISEÑO LISTO PARA IMPLEMENTAR`.
- No modificó código ni aplicó SQL/migraciones.
- Tabla `srs_cards` ya existe según la inspección de esa fase.
- Decisiones abiertas: política de borrado/remoción remota de tarjeta SRS; confirmar si `last_reviewed_at` es necesario; formalizar y probar la regla de conflictos.

### Próximo paso recomendado — inspección enfocada, antes de implementar
1. Comprobar `git status`, rama, HEAD y diffs; preservar todos los cambios existentes.
2. Inspeccionar `dropSrs()` y todos sus llamadores.
3. Proponer una semántica de sincronización de borrados con pros/contras y pedir aprobación. **RESUELTO en 8.5.7** (implementado y verificado; ver el informe de la fase).
4. Definir tabla de verdad de conflictos (local/cloud: niveles, due, timestamps, mismo UID, offline, orden cruzado) y escribir tests que demuestren la regla.
5. Confirmar si existe un requisito real para `last_reviewed_at`; por defecto no añadir campo/migración sin necesidad demostrada.
6. STOP para revisión del usuario.

### Secuencia posible tras aprobar las decisiones
- 8.5.1 — esquema, **solo si se aprueba y es necesario**. Puede omitirse si la tabla existente basta.
- 8.5.2 — adaptador SRS push/pull/merge/cola.
- 8.5.3 — integración con auth y guards de sesión.
- 8.5.4 — pruebas de dos dispositivos y sesiones cruzadas + integración UI de valoración SRS.
- 8.5.5 — regresión.
- 8.5.6 — auditoría independiente.

Una fase por vez. No ejecutar toda la secuencia en un único prompt.

### Estado real de 8.5.x (VERIFICADO en ejecuciones locales, no remote)
- **8.5.14 — Concurrencia de las marcas de borrado pendientes: D-6 CORREGIDO (13-10-2026).**
  Causa raíz demostrada: el ciclo de SRS leía `progressSyncSrsClears` ANTES del `await` de la RPC y
  al volver reescribía la copia leída, así que las marcas creadas por otra pestaña durante la espera
  desaparecían (el tombstone no llegaba a la nube y el pull resucitaba la tarjeta); además el guard
  de sesión/dueño se evaluaba antes del `await` y el consumo del `revive` no comprobaba el estado
  observado. Reproducido en navegador real con dos pestañas antes del arreglo (marca `pending`
  borrada, `deleted_at` NULL en PostgreSQL, tarjeta resucitada) y en la suite nueva contra el módulo
  previo. Corrección mínima: `applySrsClear` aplica SOLO la transición decidida sobre lectura fresca
  (`null` consume si sigue en el estado esperado; `known` desde `pending`/ausente, nunca sobre
  `revive`), guard doble tras el `await` (sesión + marcador `liveOwner` persistido) y consumo de
  `revive` con estado esperado. Suite nueva `tests/srs-clears-race.test.js` **8/8** (selftest exit 1;
  los casos 1 y 2 fallan contra el módulo pre-fix) y sin regresión: slot-owner 10/10, tab-slots
  10/10, tab-merge 13/13, srs-sync 21/21, srs-delete 11/11, srs-drop-ui 10/10, srs-rate-ui 5/5,
  srs-review-drop 12/12, h1-race 15/15, pg-srs-delete 18/18 y pg-local-concurrency 13/13
  (PostgreSQL real). Navegador real con dos pestañas (8 escenarios: copia obsoleta, ciclo cruzado,
  propietario cambiado durante el `await`, revive vs borrado, logout/login con marcas pendientes,
  respuesta tardía, visitante/offline y error de red) más la política del servidor medida por la RPC
  real; cuenta efímera borrada y `localStorage` del perfil limpio. **Decisión de producto abierta:**
  un tombstone OBSOLETO que llega después de un revive confirmado en otro dispositivo vuelve a
  borrar la fila (el servidor no ordena tombstones): opciones = descartar la marca `pending` cuando
  el pull ve la fila viva y sin cambio local, o pedir recencia en el servidor (cambio de esquema).
  Otras limitaciones: `progressSyncClears` sigue sin fusión (ventana de una sentencia);
  `applySrsClear` no tiene lock entre procesos; arnés de un solo proceso; lock retenido sin timeout.
  Sin commit/push/deploy; 00008 sigue sin aplicar en remoto.
- **8.5.13 — Fusión del slot vivo entre pestañas + seguridad del lock: D-5 CORREGIDO (13-10-2026).**
  Causa raíz demostrada: `SMR.progress.save()` escribía el objeto vivo COMPLETO en el slot
  compartido desde la memoria de una pestaña, así que descartaba lo que otra acababa de guardar
  (pérdida de actualización independiente). Reproducido con dos pestañas reales (la pestaña 2, con
  copia leída antes, borraba el `r-b1` de la pestaña 1 del slot) y con una suite nueva que falla
  contra el `app.js` pre-fix. Corrección mínima: fusión de tres vías por clave (`written` =
  última versión conocida, `readBase` al leer el slot, `writeMerged` al guardar) con la semántica
  ya establecida como desempate; listas acumulativas (historial, actividad) unidas por entrada y
  recortadas a su límite real; borrado en ambos sentidos (una copia vieja no resucita lo borrado);
  sin cruzar propietarios (marcador `liveOwner` + marca nueva `liveWriter`, leídas frescas) y
  refresco de la base cuando el slot se instala entero. Del lock: un ERROR SÍNCRONO al pedirlo
  rompía el manejador de sesión y perdía la transición (corregido); el rechazo del lock sigue
  ejecutando la transición sin exclusión (decisión de 8.5.12, sin timeout). Suite nueva
  `tests/tab-merge.test.js` **13/13** (selftest exit 1; falla con el `app.js` pre-fix y sin la marca
  `liveWriter`); resto en verde: slot-owner 10/10, h1-race 15/15, srs-sync 21/21, srs-delete 11/11,
  srs-drop-ui 10/10, srs-rate-ui 5/5, srs-review-drop 12/12, tab-slots 10/10, pg-srs-delete 18/18 y
  pg-local-concurrency 13/13 (PostgreSQL real). Navegador real con dos pestañas (cuenta efímera
  borrada, `localStorage` restaurado a su conjunto de claves previo): sin pérdida de actualización
  independiente, sin mezcla de propietarios y sin resurrección de borrados. **Limitaciones:** el
  arnés es un solo proceso (no reproduce el interleaving físico entre procesos);
  `progressSyncClears`/`progressSyncSrsClears` siguen sin fusión (ventana de una sentencia);
  `studySessions`/`minutes`/racha y el perfil siguen siendo LWW; sin perfilado formal del coste de
  leer+comparar el slot en cada guardado. Sin commit/push/deploy; 00008 sigue sin aplicar en remoto.
- **8.5.12 — Concurrencia del slot vivo entre pestañas: D-4 CORREGIDO (13-10-2026).** Causa raíz
  demostrada con DOS pestañas reales (mismo origen, `localStorage` compartido): la propiedad del
  slot se calculaba con memoria por pestaña (`runtime.currentUser` / `runtime.liveOwner` leído una
  vez al cargar) mientras el slot vivo es COMPARTIDO, así que una pestaña con el dueño desfasado
  archivaba contenido ajeno bajo el dueño equivocado y sobrescribía la custodia del otro dueño
  (medido: el snapshot de la cuenta quedaba con el contenido del visitante; `__guest__` acababa
  con datos de la cuenta y se perdió de forma irrecuperable el progreso de visitante
  `r-guest-marker`). Corrección mínima: el MARCADOR PERSISTIDO (`readLiveOwner()` fresco, dentro
  del lock) pasa a ser la autoridad de `prevOwner`, con `runtime.currentUser` solo como respaldo
  sin marcador; la copia en memoria se re-lee del slot vivo al entrar y al salir (también cuando
  el slot ya era de ese dueño); `reconcilePassiveSlot` exige que el marcador confirme el dueño; y
  un lock rechazado ya no pierde la transición. Suite nueva `tests/tab-slots.test.js` **10/10**
  (dos instancias del módulo sobre un `localStorage` compartido; selftest exit 1) que **falla**
  contra la copia pre-fix del módulo; resto en verde: slot-owner 10/10, srs-sync 21/21, srs-delete
  11/11, srs-drop-ui 10/10, srs-rate-ui 5/5, srs-review-drop 12/12, h1-race 15/15, pg-srs-delete
  18/18 y pg-local-concurrency 13/13 (PostgreSQL real), `node --check` ×7. Navegador real con dos
  pestañas (Supabase+PostgreSQL locales, cuentas efímeras borradas): antes/después del arreglo,
  login en la pestaña pasiva, A3→A4→A3 por el flujo admitido y SRS borrar/revivir cruzado con
  `deleted_at` real. **Limitaciones:** dos cuentas simultáneas en el mismo origen no son posibles
  por diseño (sesión compartida); el `save()` de una pestaña sigue siendo último-que-escribe-gana
  sobre el slot vivo (no corregido); lock retenido por pestaña congelada sin timeout; marcador
  desfasado si el proceso muere entre la escritura del slot y la del marcador (vuelve al
  comportamiento previo, sin pérdida). Sin commit/push/deploy; 00008 sigue sin aplicar en remoto.
- **8.5.11 — D-3 CORREGIDO: propiedad del slot vivo entre recargas (13-10-2026).** Causa raíz
  confirmada: `runtime.currentUser` es solo memoria, así que en el arranque el primer
  `smr:authchange` tomaba `prevOwner = null`, archivaba el slot vivo del propio usuario bajo
  `__guest__` y restauraba el snapshot obsoleto del dueño (reintroduciendo marcas `pending` ya
  revividas). Corrección mínima: marcador persistido del dueño del slot vivo
  (`smrhub:liveOwner`, metadato fuera de `SLOT_KEYS`, lectura tolerante, ausencia = dueño
  desconocido y nunca autorización para reasignar) leído en el arranque y usado como
  `prevOwner`; mientras el dueño coincida, el estado vivo manda y no se archiva ni restaura
  ningún snapshot; tras cada transición se persiste el nuevo dueño. Sin UI nueva, sin tocar
  SRS/`dropSrs`/`scheduleSrs`, sin esquema ni migraciones. Suite nueva
  `tests/slot-owner.test.js` 10/10 (auto-verificación exit 1) y resto en verde: srs-sync 21/21,
  srs-delete 11/11, srs-drop-ui 10/10, srs-rate-ui 5/5, srs-review-drop 12/12, h1-race 15/15,
  pg-srs-delete 18/18 y pg-local-concurrency 13/13 (PostgreSQL real), `node --check`. Navegador
  real: secuencia borrar→revivir→recargar con la fila viva en PostgreSQL, la forma exacta de
  D-3 con snapshot obsoleto + `pending` (no resucita, marca conservada), y A→B→A sin mezcla ni
  `__guest__`. **Sigue abierto y NO resuelto el problema multi-instancia (8.4.5/8.4.5.1)**; el
  marcador es estado compartido entre pestañas y no se probó con dos instancias. Sin
  commit/push/deploy; 00008 sigue sin aplicar en remoto.
- **8.5.10 — Auditoría de integración + borrado desde el repaso SRS (13-10-2026).**
  Auditados los 8 puntos de integración del repaso SRS (`session.questions[s.index]` con
  `testId`/`origIndex`, la sesión es posicional y borrar sí invalida el índice). Acción
  «Quitar del repaso» añadida a la pantalla del repaso reutilizando la confirmación y el
  refresco de 8.5.9, con avance determinista (`advanceAfterSrsDrop`: sin saltos ni
  repeticiones, final coherente al borrar la última o la única) y aviso de un solo uso.
  Suite nueva `tests/srs-review-drop.test.js` 12/12 (auto-verificación exit 1), resto de
  suites en verde (drop-ui 10/10, rate-ui 5/5, srs-delete 11/11, srs-sync 21/21, h1-race
  15/15, pg-srs-delete 18/18 y pg-local-concurrency 13/13 en PostgreSQL real, `node --check`).
  Navegador real visitante y autenticado (borrado desde el repaso con `deleted_at` real en
  PostgreSQL solo en la fila del uid de la sesión; cuentas efímeras eliminadas).
  **Defecto propio corregido (D-2):** el callback del avance perdía la raíz y no avanzaba.
  **Defecto P1 ABIERTO (D-3, no corregido):** al recargar con la sesión restaurada se archiva
  el slot vivo como `__guest__` y se instala el snapshot obsoleto del dueño; una marca SRS
  `pending` vieja se re-aplica y re-envía el tombstone, borrando en el cloud tarjetas
  revividas (reproducido con evidencia en `SMR_HUB_CONTEXT.md` §8.5.10). Exige fase propia
  antes de desplegar 00008 —— **atendido en 8.5.11 (corregido y verificado)**. Sin
  commit/push/deploy; 00008 sigue sin aplicar en remoto.
- **8.5.9 — Interfaz de borrado de tarjetas SRS: IMPLEMENTADA y VERIFICADA (13-10-2026).**
  Acción «Quitar del repaso» en la lista de revisión del resultado (`js/tests.js`) con
  confirmación por `SMR.modal` (nombre de la pregunta, Cancelar, Escape, foco atrapado),
  llamada al `dropSrs()` real y refresco local sin recarga; estilos en `css/app.css`. Suite
  nueva `tests/srs-drop-ui.test.js` 10/10 (con auto-verificación que sale exit 1), arnés de
  `srs-rate-ui` ampliado 5/5, `srs-delete` 11/11, `srs-sync` 21/21, `h1-race` 15/15,
  `pg-srs-delete` 18/18 y `pg-local-concurrency` 13/13 (PostgreSQL real), `node --check`.
  Navegador real: visitante (acción solo con tarjeta, cancelar sin efecto, borrado + marca
  `pending` + 0 peticiones a Supabase, no reaparece al recargar, revive al re-valorar) y
  autenticado (dos borrados desde la UI con `deleted_at` real en PostgreSQL solo en la fila
  del uid de la sesión; cuenta efímera eliminada al terminar). Sin commit/push/deploy y sin
  migraciones remotas. Pendientes: UI de Modo Estudio, paginación del pull (>500),
  `last_reviewed_at`, CI, multi-pestaña y 00008 sin aplicar en remoto (SQL antes que JS).
- **8.5.8 — Auditoría independiente de 8.5.7: APROBADA CON UN DEFECTO P1 CORREGIDO
  (13-10-2026).** Auditados los 10 puntos de 8.5.7 en código real, BD real y navegador
  autenticado (tres cuentas efímeras, RPC real + RLS real + tombstone persistido + carrera
  de cambio de sesión sin cruce). Suites: `node --check cloud-progress`, srs-rate-ui 5/5,
  srs-sync 21/21, h1-race 15/15, srs-delete 11/11, pg-srs-delete 18/18 y
  pg-local-concurrency 13/13 (PostgreSQL real), todo exit 0. **Defecto D-1 (P1,
  corregido)**: al iniciar sesión sobre un slot vivo vacío no se restauraba el snapshot del
  dueño (el que deja un logout), así que una marca de borrado SRS pendiente se perdía y la
  tarjeta resucitaba; ahora se restaura siempre. Hallazgo abierto (no corregido, ya
  conocido en 8.4.5): la segunda instancia del mismo origen puede pisar el archivado del
  slot. Pendientes sin cambio: UI de `dropSrs`, paginación del pull (>500),
  `last_reviewed_at`, Modo Estudio, CI, 00008 sin aplicar en remoto.
- **8.5.7 — Borrado SRS con tombstones: IMPLEMENTADO y VERIFICADO (13-10-2026).**
  `srs_cards.deleted_at` + tombstone pegajoso + revive explícito en `merge_srs_cards`
  (`supabase/migrations/00008_srs_delete_tombstones.sql`; aplicada SOLO a la BD local de
  staging, no remota); marcas de slot `progressSyncSrsClears` y hooks `dropSrs`/
  `scheduleSrs` en el cliente. Sentinel `level=-1`/`due=-1` descartado con evidencia real
  (CHECK `srs_cards_level_range`). Suites: `node tests/srs-delete.test.js` 11/11,
  `bash tests/pg-srs-delete.sh` 18/18 (PostgreSQL real), `srs-sync` 21/21, `h1-race`
  15/15, `srs-rate-ui` 5/5, `pg-local-concurrency` 13/13, `node --check` ×4. Decisión B
  de 8.5.0 resuelta. Pendiente: llamador UI de `dropSrs`, aplicar 00008 en remoto con
  revisión y aprobación, CI unificado.
- **8.5.2/8.5.3** (adaptador RPC `merge_srs_cards` + guards de sesión + permisos):
  código presente; migraciones 00005/00006/00007 **sin commit y sin aplicar remotas**;
  aplicadas solo a la BD local con revisión. Concurrencia 13/13 (pg-local),
  21/21 (srs-sync mock), 15/15 (h1-race mock). Fix 8.5.4-B1: `snapshotProgress`
  incluye `tests.srs` (un save SRS dispara el push RPC).
- **8.5.4-C** (nueva, implementada): valoración SRS «No lo sabía/Dudé/Lo sabía» en la
  lista de revisión final (`js/tests.js`: `srsRateOf/srsRateHtml/wireSrsRating`;
  suite `tests/srs-rate-ui.test.js` 5/5; navegador real e2e verificado en modo
  visitante: 20 tarjetas con controles, persistencia local, re-valoración
  coherente, 0 RPC sin sesión). Sin commit. Pendientes: regresión de navegador
  con sesión autenticada, rate por pregunta, Modo Estudio, `dropSrs` UI,
  decisión B de borrado remoto.
- **8.5.5 — Regresión unificada: COMPLETADA (verificada 12-10-2026).** Suites: checks de
  sintaxis ×3, srs-rate-ui 5/5, srs-sync 21/21, h1-race 15/15, pg-local-concurrency 13/13
  (PostgreSQL real del staging). Navegador real: visitante (checks 1–8, RPC=0 en red y BD)
  y autenticado (signup exclusivo → valoración → RPC HTTP 200 → fila con owner
  `auth.uid()` → aislamiento RLS verificado entre dos cuentas → limpieza 0/0).
  Sin commit/push/deploy. Defectos nuevos: ninguno. Limitaciones sin cambio.
- **8.5.5** — Regresión unificada: COMPLETADA (verificada 12-10-2026). Suites: checks de
  sintaxis ×3 (exit 0), srs-rate-ui 5/5 (exit 0), srs-sync 21/21 (exit 0), h1-race 15/15
  (exit 0), pg-local-concurrency 13/13 (exit 0, PostgreSQL real del staging local
  scratch_84val). Navegador real: e2e visitante y autenticado REPORTADOS en 8.5.5 (RPC 0
  visitante; RPC HTTP 200 + fila con owner `auth.uid()` en autenticado; aislamiento RLS
  verificado entre dos cuentas exclusivas; limpieza 0/0). Sin commit/push/deploy. Defectos
  nuevos: ninguno. Limitaciones sin cambio.
- **8.5.6 — Auditoría independiente: APROBADA (verificada 13-10-2026).** Superficies auditadas:
  identidad SRS (js/srs.js), persistencia local (js/app.js), sincronización (js/cloud-progress.js),
  conflictos/RPC/RLS (00001/00006/00007), UI de valoración (js/tests.js), esquema y políticas.
  Pruebas ejecutadas: `node --check js/tests.js/js/app.js/js/cloud-progress.js` (exit 0); `node
  tests/srs-rate-ui.test.js` 5/5 exit 0; `node tests/srs-sync.test.js` 21/21 exit 0; `node
  tests/h1-race.test.js` 15/15 exit 0; `bash tests/pg-local-concurrency.sh` 13/13 exit 0.
  E2E con navegador real NO se repitió en esta auditoría (queda como REPORTADO EN 8.5.5).
  Defectos confirmados: ninguno P0/P1. Hallazgos: A856-02 (P2, política de due como
  «revisión más reciente» documentada, coherente entre cliente y RPC), A856-03 (P3, sync SRS
  solo para sesión autenticada, implícito en código), A856-05 (P2, decisión B de borrado remoto
  sin resolver). Decisiones pendientes: dropSrs() remoto (resuelto en 8.5.7), Modo Estudio, valoración inmediata por
  pregunta, last_reviewed_at, CI unificado. Sin commit/push/deploy/migraciones remotas. No se
  inició la fase siguiente.

### Próximo paso recomendado (no iniciado)
- Con 8.5.14 cerrada, la concurrencia de las marcas de borrado pendientes ya no pierde ni reescribe
  marcas ajenas y no cruza propietarios, así que el cliente está a un paso de la revisión previa al
  despliegue de `00008`. Quedan decisiones de producto, no de código: (a) qué gana cuando una marca
  `pending` en vuelo cruza un `revive` confirmado en otro dispositivo (hoy gana el borrado tardío;
  ver 8.5.14); (b) qué hacer con un lock RETENIDO por una pestaña congelada (esperar indefinidamente
  o alguna política de caducidad anunciada al usuario); (c) si `progressSyncClears` (recursos) debe
  pasar por la fusión por clave, hoy caracterizado pero sin fusionar.
Prioridad: **D-3 corregido en 8.5.11 y la propiedad del slot entre pestañas corregida en 8.5.12**
(antes de aplicar 00008 en un backend real ya no queda un defecto conocido de propiedad del slot
vivo; dos pestañas del mismo origen ya no archivan contenido ajeno). Queda como limitación
conocida el merge de dos copias vivas (el `save()` de una pestaña escribe el objeto completo en
el slot compartido), que no se corrigió porque es una decisión de producto (¿quién gana entre dos
pestañas?); decidir si se aborda antes del despliegue o se documenta como comportamiento
admitido. Después, decidir si hace falta una lista propia de tarjetas SRS con borrado, y solo
entonces desplegar en orden 00005–00008 (SQL) y luego el JS. No iniciar fases nuevas sin encargo
explícito.

## Fases posteriores propuestas (no iniciadas)

- 8.6 — ciclo de vida de cuenta (recuperación, cierre de sesión, eliminación de cuenta; auditar primero qué existe).
- 8.7 — auditoría de seguridad cloud/RLS/privacidad.
- 8.8 — robustez y recuperación.
- 8.9 — auditoría de preparación para lanzamiento.
- 9.0 — SEO técnico y publicación: metadatos, canonical, Open Graph, robots/sitemap, crawlability, páginas públicas, Core Web Vitals y Search Console. Empezar por auditoría de solo lectura; no cambiar de framework por defecto.
- 9.1 — monetización/anuncios y privacidad.
- 9.2 — feedback/analítica.
- 9.3 — auditoría de contenido y referencias rotas sin inventar relleno.
- 9.4 — mejoras de experiencia de aprendizaje.
- 9.5 — iteración basada en uso real.

SEO puede auditarse en paralelo como tarea independiente de solo lectura, pero no mezclar sus cambios con sincronización SRS.

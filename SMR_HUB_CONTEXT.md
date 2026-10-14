# SMR Hub — Contexto permanente del proyecto

> **Objetivo de este archivo:** permitir que un asistente de programación nuevo (Cline + GLM 5.3 Flash:free, u otro modelo) continúe el proyecto sin depender del historial de otro chat.
>
> **Regla crítica:** este documento contiene contexto e informes previos. Antes de modificar código, verifica el estado real del repositorio. No trates ningún informe anterior como prueba de que el estado actual sigue idéntico.

## 1. Proyecto y objetivo

- Proyecto: **SMR Hub**, plataforma web educativa para el CFGM de Sistemas Microinformáticos y Redes (SMR).
- Repositorio: https://github.com/NormalGuy749/SMR_Hub
- Plataforma actual: SPA estática publicada/prevista para Cloudflare Pages.
- Objetivo de producto: una plataforma pública útil para estudiar, practicar tests, repasar preguntas y consultar recursos de SMR; se prevén SEO y monetización, pero no deben mezclarse con una fase de sincronización cloud.
- El usuario quiere que el proyecto continúe desde su estado real. No reiniciar arquitectura ni reabrir fases ya aceptadas sin un defecto reproducible.

## 2. Reglas no negociables

1. **Inspeccionar antes de actuar.** Leer el código real, `git status`, rama, HEAD y diffs relevantes antes de diseñar o editar.
2. **No inventar contenido educativo.** No crear currículos, módulos, equivalencias, preguntas, recursos, URLs ni relaciones sin evidencia.
3. **No romper datos locales.** Mantener el modo visitante/offline y la compatibilidad con `localStorage`; no borrar ni sobrescribir datos del usuario para simplificar una migración.
4. **No alterar la identidad SRS.** No introducir posición, índice, currículo o recurso relacionado en la identidad estable de las preguntas.
5. **No copiar `SMR_DATA` a Postgres.** El contenido educativo sigue siendo estático/client-side. Supabase guarda datos de usuario y progreso.
6. **Separación por usuario estricta.** Nunca asociar datos de un UID con otra sesión. Reutilizar guards de sesión, colas por propietario y lock de transición existentes.
7. **Fases pequeñas y auditables:** inspección → diseño → implementación → tests → regresión → auditoría → STOP.
8. **No acciones externas sin autorización:** no desplegar, no hacer commit/push, no operar en producción, no aplicar migraciones remotas, no ejecutar `supabase db reset`, no borrar archivos ni hacer `git checkout/reset/clean` sin permiso explícito.
9. **No deshacer cambios preexistentes.** Un archivo modificado o no rastreado puede ser trabajo válido de fases anteriores. Nunca “limpiar” el árbol para empezar desde cero.
10. **Reportar con honestidad.** Separar lo comprobado en esta sesión de lo que solo consta en informes anteriores. No afirmar que se ejecutaron pruebas o se inspeccionó código si no se hizo.
11. **Si falta una decisión de producto/arquitectura, detenerse y preguntar.** No resolverla mediante una migración irreversible ni inventar requisitos.
12. **No mezclar tareas.** Una fase de SRS cloud no debe incluir cambios SEO, rediseños UI ni refactors ajenos.

## 3. Arquitectura existente conocida

### Frontend

SPA estática. Orden de carga JS registrado anteriormente:

`data.js → curriculum.js → topics.js → questionTopics.js → contentTopics.js → moduleTopics.js → content.js → questions.js → srs.js → tools.js → tests.js → profile.js → app.js`

Este orden es contexto previo; verificar `index.html` actual antes de depender de él.

Capas conceptuales: datos estáticos → contenido/currículo/temas → consumidores/UI.

### Contenido educativo

Conteos de una auditoría previa (no asumir que siguen siendo actuales sin comprobar):
- 227 instancias de módulos.
- 55 temas canónicos y 56 strings `q.topic`.
- 154 preguntas con IDs estables únicos.
- 7 tests.
- 19 recursos.
- 51 términos de glosario.
- 6 casos.
- 4 rutas de aprendizaje.
- 19 currículos.

No rellenar huecos documentados inventando datos. Auditorías anteriores detectaron referencias incompletas; comprobar antes de tocar esas áreas.

### Almacenamiento local

Namespace principal: `smrhub:`.
Claves/formas conocidas (verificar código actual):
- `smrhub:progress` — progreso v4.
- `smrhub:progressByOwner:<uid>` — slots de progreso por propietario.
- `smrhub:progressSyncQueue:<uid|guest>` — cola de sincronización.
- `smrhub:settings`.
- `smrhub:favorites`.
- `smrhub:studentProfile`.
- legado `curriculum`, legado `bestScores`.
- backup de migración `smrhub:progressBackupV3`.
- `tests.srs` y `tests.srsLegacy` dentro del objeto de progreso.

El progreso incluye datos como recursos, autoevaluaciones, resultados e historial de tests, respuestas incorrectas, SRS, casos, sesiones, actividad y racha. No cambiar su forma sin una migración compatible y pruebas de regresión.

## 4. SRS — hechos reportados por la auditoría 8.5.0

**Verificar contra el código antes de implementar.** Estos datos proceden del informe de diseño de 8.5.0 del 11-10-2026, no de una inspección hecha por el asistente actual.

- En `js/srs.js`, ID estable descrito como `q-<16 hex>` con posible sufijo `-n` para colisiones. Se calcula con FNV-1a a partir de `testId + NUL + texto de pregunta + opciones + respuesta correcta`. No usa `qIndex`, currículo ni `relatedResource`.
- `SRS_KEY_VERSION=4`; migración idempotente de claves posicionales `testId:qIndex` a IDs estables, con backup `smrhub:progressBackupV3` y conservación de entradas no resolubles en `tests.srsLegacy`.
- Tarjeta local: `{ level, due }`, donde `level` está entre 0 y 5 y `due` es epoch-ms.
- Intervalos reportados: `[1, 1, 3, 7, 14, 30]`; `SRS_MAX_LEVEL=5`; `PROGRESS_VERSION=4`.
- Funciones citadas: `SMR.srs.version/buildIndex/idOf/resolveSrsKey/isLegacyKey/isStableKey/migrateProgressData`; `scheduleSrs`, `dropSrs`, `dueSrs`, `dueCount`, `upcomingSrsCount`.
- El informe afirma que la tabla `srs_cards` ya existe en `supabase/migrations/00001_foundation.sql`: `user_id`, `question_key`, `level`, `due`, `client_updated_at`, `updated_at`, `created_at`; PK `(user_id, question_key)`, índice por `(user_id, due)`, RLS de propietario.
- La migración `00004_progress_sync.sql` usa una RPC para un conjunto restringido de tablas append-only; el informe dice que `srs_cards` no está en ese conjunto.
- La migración local/no rastreada `00005_progress_sync_hardening.sql` aparece en informes previos y añade hardening/trigger; su estado y contenido deben comprobarse antes de tocarla.
- El sistema cloud 8.4.x sincroniza otros dominios, pero dejó SRS expresamente para la fase 8.5.

## 5. Estado Git/cloud reportado antes del cambio a Cline

**Este estado es histórico y puede haber cambiado. Comprueba `git status --short --branch`, `git log -1 --oneline` y `git diff` al abrir el proyecto.**

Último estado repetido en informes:
- Rama `main`.
- HEAD `1f6f2475b907ae06e4c1e148adec99f1a70f8b90`, mensaje `feat: add Supabase auth profile and progress sync`.
- Modificados: `js/cloud-config.js`, `js/cloud-profile.js`, `js/cloud-progress.js`.
- No rastreado: `supabase/migrations/00005_progress_sync_hardening.sql`.
- `js/cloud-config.js` reportado como configurado para staging local, con backup de producción conservado. **No cambiar a producción ni asumir que la configuración es publicable.**
- Informes previos indicaban que no se habían hecho commit/push/deploy ni aplicado migraciones remotas.
- `js/data.js` y `js/srs.js` fueron reportados intactos en auditorías anteriores; volver a comprobar hashes/diffs si la tarea los involucra.

**No ejecutar `git checkout`, `git reset`, `git clean`, restauraciones ni eliminaciones para “dejar limpio” el árbol.** No descartar los cambios listados. No modificar ni aplicar `00005` sin autorización y revisión.

## 6. Cloud sync 8.4.x — contexto previo

Informes anteriores describen estas protecciones ya añadidas; inspeccionarlas antes de reutilizarlas:
- `sessionHandleFor()` captura propietario/UID/referencia de datos.
- `sessionChangedFor()` detecta cambios de sesión tras operaciones asíncronas.
- Guardas anti cross-UID en push/pull y operaciones de sincronización.
- Cola persistida por UID/propietario, reintentos y recuperación.
- Stash local para recuperación ante cuota; cuarentena de entradas no resolubles.
- Web Locks con nombre `smrhub:slot-transition` alrededor de transiciones de sesión.
- Listener `storage` y reconciliación pasiva del slot por propietario.
- Pruebas previas reportadas: 8.4.4 hardening 15/15, aislamiento 30/30, sync 8.4 47/47, perfil 8.3 34/34 y 8.4.5 7/7. Son resultados de informes, no una garantía de que hoy pasen.
- La auditoría 8.4.6 aceptó con limitaciones: sin Web Locks no existe exclusión equivalente; una pestaña suspendida puede mantener UI/runtime temporalmente desfasado. No se reportó fuga de datos entre usuarios en las pruebas descritas. Antes del lanzamiento debe decidirse/documentarse la experiencia de navegadores sin Web Locks.

## 7. Fase actual: 8.5 — SRS cloud

### 8.5.4-C — Integración UI de la autoevaluación SRS (VERIFICADO en esta ejecución, 12-10-2026)

**Hecho comprobado:** la valoración SRS «No lo sabía / Dudé / Lo sabía» está integrada en la
lista de revisión final de resultados (`JS/tests.js`):

- `renderResult` añade, a cada `<li>` de revisión cuya pregunta tiene identidad estable
  (`SMR.srs.idOf(testIdOrigen, origIndex)`), un grupo de 3 botones `data-srs-rate="0|1|2"`
  con `role="group"`, `aria-pressed` y clases `self-btn`/`active` reutilizadas (CSS existente).
- Test de origen: en sesiones multi (`multi`, errores, SRS) se usa `c.testId`; en sesión
  simple, `s.testId`. `origIndex` es la posición en el test de origen.
- Sin identidad estable: NO se muestran controles (no se crean claves posicionales).
- Cada clic llama a `SMR.progress.scheduleSrs(testId, origIndex, rate)` con listener
  `{ once: true }`: una única actualización por interacción. `scheduleSrs` es idempotente
  por PK `question_key`; re-valorar sobrescribe `{ level, due }` (nivel ajustado relativo
  al actual, due recalculada). El estado visual se actualiza con `classList.toggle('active')`.
- Persistencia: `scheduleSrs` → `this.save()` → localStorage + (si hay sesión) push cloud
  vía el fix 8.5.4-B1 (`snapshotProgress` incluye `tests.srs`) → RPC `merge_srs_cards`.
  Modo visitante: persistencia local pura, cero llamadas RPC (verificado en navegador).

Funciones nuevas en `js/tests.js`: `SRS_RATE_LABELS`, `srsRateOf`, `srsRateHtml`,
`wireSrsRating`. Suite: `tests/srs-rate-ui.test.js` (5 aserciones, mocks DOM explícitos).

**Pendiente tras 8.5.4-C (no implementado):** valoración inmediata por pregunta (después
de responder en modos con explicación); integración en Modo Estudio (`studyQuestion`);
llamador UI para `dropSrs`; semántica remota de borrado (decisión B de 8.5.0, aún abierta).

### 8.5.5 — Regresión unificada SRS + cloud (COMPLETADA, VERIFICADA esta ejecución 12-10-2026)

**Alcance real de la auditoría previa:** inspección estática y ejecución de suites; no se
modificó código de producción ni SQL; no se inició la fase siguiente.

**Estado Git inicial y final (idéntico):** rama `main`, HEAD
`1f6f2475b907ae06e4c1e148adec99f1a70f8b90` (`feat: add Supabase auth profile and progress sync`).
Al inicio y al final del informe, el árbol tenía M = index.html, js/cloud-config.js,
js/cloud-profile.js, js/cloud-progress.js, js/tests.js; ?? = docs raíz, migraciones
00005–00007, tests/, .claude/. Diff real vs HEAD: 984 inserciones / 96 borrados en esos
5 archivos.

**Suites ejecutadas (exit 0 todas):**
- `node --check js/tests.js` / `js/app.js` / `js/cloud-progress.js` → 0/0/0.
- `node tests/srs-rate-ui.test.js` → 5/5 (mocks DOM: 3 rates con args correctos, identidad,
  sin tarjeta si idOf nulo, re-valoración no duplica).
- `node tests/srs-sync.test.js` → 21/21 (mocks Supabase: política merge y orden pull→push).
- `node tests/h1-race.test.js` → 15/15 (mocks: carreras y casos malformados).
- `bash tests/pg-local-concurrency.sh` → 13/13 (PostgreSQL REAL del staging scratch_84val:
  carreras de tuple-lock, idempotencia, invalidas, aislamiento). Una suite con BD real.

**E2E con navegador real (REPORTADO EN FASE ANTERIOR; no reproducido en 8.5.6):**
visitante (sin autenticación): revisión de 16/16 preguntas elegibles con controles;
«Dudé» → tarjeta nueva; re-valoración → la misma tarjeta con nivel inferior; persistencia
local coherente; 0 RPCs verificados en red y BD. Autenticado en staging local:
creación de dos cuentas exclusivas vía signup, valoración de una de ellas, HTTP 200 del RPC
y fila en `srs_cards` con owner = `auth.uid()`; aislamiento RLS verificado entre las dos
cuentas; limpieza verificada a 0/0.

**Defectos encontrados en 8.5.5:** ninguno nuevo. El único defecto histórico cerrado sigue
siendo el ya documentado de snapshot (fix 8.5.4-B1, presente y efectivo).

**Limitaciones de 8.5.5 sin cambio aquí:** Modo Estudio, valoración inmediata por pregunta,
dropSrs() UI y semántica remota de borrado (decisión B). No existe CI en el repo.

**Siguiente paso recomendado después de 8.5.5:** auditoría independiente 8.5.6 (solo lectura).

### 8.5.6 — Auditoría independiente del SRS cloud (COMPLETADA, 13-10-2026)

**Flujo auditado:** `valoración UI (review-list) → scheduleSrs → save local →
snapshotProgress (incl. tests.srs, fix B1) → pushState → RPC merge_srs_cards → fila
(owns auth.uid()).`

**Estado Git:** rama `main`, HEAD `1f6f2475b907ae06e4c1e148adec99f1a70f8b90`
(`feat: add Supabase auth profile and progress sync`), sin commit/push/deploy en la fase.
Al inicio y al fin: M= index.html, cloud-config.js, cloud-profile.js, cloud-progress.js,
tests.js; ??= docs raíz, migraciones 00005–00007, tests/, .claude/.

**Suites ejecutadas (exit 0 todas):**
- `node --check js/tests.js` / `js/app.js` / `js/cloud-progress.js` → 0/0/0.
- `node tests/srs-rate-ui.test.js` → 5/5 (mocks DOM: 3 rates con args correctos,
  identidad, sin tarjeta si idOf nulo, re-valoración no duplica).
- `node tests/srs-sync.test.js` → 21/21 (mocks Supabase: política merge y orden pull→push).
- `node tests/h1-race.test.js` → 15/15 (mocks: carreras y casos malformados).
- `bash tests/pg-local-concurrency.sh` → 13/13 (PostgreSQL REAL del staging scratch_84val:
  carreras de tuple-lock, idempotencia, invalidas, aislamiento). Alive única suite con BD real.

**Navegador real (visura, sin autenticación):** revisión con 16/16 preguntas elegibles
(48 botones), «Dudé» → visual activo y tarjeta nueva `{level:1}`; re-valoración «No lo
sabía» → LA MISMA tarjeta con `{level:0}` (PK única por pregunta); recarga → estado
persistido coherente (1 tarjeta, kke q-<16hex> válida); **0 llamadas RPC** verificadas
por performance entries Y por BD remota: `select count(*) from srs_cards = 0`.

**Navegador real (autenticado, staging local scratch_84val):** dos cuentas exclusivas
creadas vía signup de la SPA (`u-855@`, `u-855b@local.test`). u-855b valoró «Lo sabía»:
**rpcBefore 0→rpcAfter 1 (HTTP 200)** y BD: `u-855b|q-61c6d5af122c7d28|level 1` —
propiedad = auth.uid() del JWT. **Aislamiento RLS:** sesión de u-855 consulta
`srs_cards` por PostgREST → 0 filas (no puede leer la tarjeta de u-855b).
Limpieza verificada: `srs_cards=0`, usuarios de prueba=0; navegador finalizado en
modo visitante con slot limpio (0 tarjetas). Sin secretos imprimidos.

**Clasificación:** suites Node = MOCKS (DOM/Supabase en memoria), excepto
pg-local-concurrency = REAL PostgreSQL. Navegador = REAL (HTTP + BD local staging).
No se validad ninguna suite Node como prueba de BD.

**Defectos encontrados:** ninguno nuevo; el único defecto histórico cerrado sigue siendo
el ya documentado falta de llamar en snapshot (fix 8.5.4-B1, presente y efectivo).
Nota operativa: la CACHÉ HTTP del navegador sirvió una versión antigua de tests.js durante
la primera pasada de e2e de 8.5.4-C; se aisló como causa de entorno (no de producción)
con fetch cache:'reload' y recarga forzada.

**Limitaciones pendientes:** sin cambios respecto a 8.5.4-C (Modo Estudio, rate por
pregunta, dropSrs UI y semántica remota de borrado). También sigue pendiente ver que
las 5 fases previas del hardening 8.4/8.5 se re-ejecuten en una corrida única del CI
futuro — no existe CI en el repo (verificado).

**Siguiente paso recomendado:** auditoría independiente 8.5.6 (solo lectura), sin
implementar cambios de producto.

### 8.5.7 — Borrado SRS con tombstones (IMPLEMENTADO y VERIFICADO, 13-10-2026)

**Alcance:** resuelve la decisión B de 8.5.0 (propagación de `dropSrs()` al cloud). No se
añadió UI de borrado (`dropSrs` sigue sin llamador UI: pendiente declarado). Sin
commit/push/deploy. Migración 00008 aplicada SOLO a la BD local de staging.

**Sentinel `level = -1` / `due = -1`: NO VIABLE (evidencia en PostgreSQL real).**
`srs_cards.level` tiene `constraint srs_cards_level_range check (level between 0 and 5)`
(00001) y `merge_srs_cards` (00007) descarta `v_level < 0 or v_due <= 0` como `invalid`.
El CASO 1 de `tests/pg-srs-delete.sh` lo reproduce: el INSERT con level = -1 falla con
`srs_cards_level_range`. No se sortea la restricción ni se cambia la RPC en silencio.

**Diseño implementado (patrón ya existente en el proyecto: `completed_cleared_at` con
marca local en `progressSyncClears`):**
- Servidor (`supabase/migrations/00008_srs_delete_tombstones.sql`, nuevo): columna
  `srs_cards.deleted_at bigint` (NULL = viva); `merge_srs_cards` extendida con payload
  `{question_key, deleted:true}` (tombstone) y campo opcional `revived:true`. `deleted_at`
  es PEGAJOSO: ninguna tarjeta viva lo limpia (ni una con level mayor); solo un
  `revived:true` explícito del propietario (UPDATE previo al merge) lo limpia. La política
  {level,due,ts} de 00007 queda idéntica. `deleted_at` lo sella el servidor
  (`server_epoch_ms`): no se comparan relojes de dispositivos. Sin DELETE remoto, sin tabla
  nueva, RLS sin cambios (00001 ya tenía políticas select/insert/update/delete "own").
- Cliente: clave de slot `progressSyncSrsClears` (añadida a `SLOT_KEYS` → hereda
  aislamiento por propietario y cuarentena) con estados por clave estable:
  `pending` (borrado pedido, tombstone no confirmado: se reintenta y bloquea reinstalar la
  fila viva), `known` (tombstone observado: no se reenvía, habilita el revive),
  `revive` (el propietario re-valoró: push live+revived; la marca se elimina al confirmar).
  Hooks reales: `SMR.progress.dropSrs` marca `pending`; `SMR.progress.scheduleSrs` marca
  `revive`. `syncSrsCards` pide `deleted_at` en el pull, retira la copia local de los
  tombstones, no reinstala filas vivas con borrado pendiente y sube tombstones/revive en la
  misma RPC. Sin sesión (visitante) la marca queda local: cero RPC.

**Archivos:** creados `supabase/migrations/00008_srs_delete_tombstones.sql`,
`tests/srs-delete.test.js`, `tests/pg-srs-delete.sh`; modificados `js/cloud-progress.js`
(SLOT_KEYS, hooks, helpers de marcas, syncSrsCards) y los helpers de extracción de
`tests/srs-sync.test.js` y `tests/h1-race.test.js` (sus casos no cambiaron).

**Pruebas (exit 0 todas; detalle exacto en el informe de la fase):** `node --check` ×4;
`node tests/srs-rate-ui.test.js` 5/5; `node tests/srs-sync.test.js` 21/21;
`node tests/h1-race.test.js` 15/15; `node tests/srs-delete.test.js` 11/11 (mocks: RPC
replicada, no PostgreSQL); REAL PostgreSQL del staging local: `bash tests/pg-srs-delete.sh`
18/18 (CHECK del sentinel, tombstone pegajoso, revive, idempotencia, RLS, auth required) y
regresión `bash tests/pg-local-concurrency.sh` 13/13. Transporte: la caché viva de
PostgREST local ya incluye `srs_cards.deleted_at` (spec anónimo en `/rest/v1/`), sin pasos
extra en el backend tras aplicar 00008; en el spec anónimo los RPC con execute revocado a
`anon` no aparecen (esperado: el push autenticado usa el JWT del usuario).

**Limitaciones:** (1) el revive mantiene la política de nivel mayor de 00007: si el
tombstone conservaba un nivel superior, la tarjeta revive con ese nivel, no con el recién
valorado; (2) valorar una pregunta borrada ANTES de recibir el tombstone pierde esa
valoración (después de verlo, `scheduleSrs` revive); (3) los tombstones ocupan cupo del
límite de 500 del pull; (4) sigue sin existir llamador UI de `dropSrs`; (5) no hay CI en el
repo; (6) 00008 NO está aplicada en ningún backend remoto (orden obligatorio: primero SQL,
después JS; sin la migración el push falla sin pérdida local).

### 8.5.10 — Auditoría de integración + borrado desde el repaso SRS (13-10-2026)

**Estado Git:** sin cambios de rama ni de HEAD (`main`, `1f6f2475`). M = `css/app.css`,
`index.html`, `js/cloud-config.js`, `js/cloud-profile.js`, `js/cloud-progress.js`,
`js/tests.js`; ?? = docs raíz, `supabase/migrations/00005..00008`, `tests/`, `.claude/`.
Añadido en esta fase: `tests/srs-review-drop.test.js` (nuevo) y la edición de `js/tests.js`.
Sin commit, push, deploy ni migraciones remotas.

**Auditoría de integración (lo comprobado en el código real):**
1. Se entra al repaso SRS desde el panel «Repasos SRS» del índice (`href="#/tests?mode=srs"`)
   o por la ruta directa; `render()` → `buildSrsSession()` (fase previa).
2. Cada tarjeta es `session.questions[s.index]` con `{ q, origIndex, testId, testTitle,
   category }` (`session.multi = true`, modo `srs`); se pinta en `renderQuestion`.
3. Los identificadores disponibles son exactamente los del contrato: `dropSrs(testId,
   qIndex)` y `idOf(testId, origIndex)` para la clave estable.
4. La acción de 8.5.9 (`srsDropHtml` + `openSrsDropConfirm` + `wireSrsDrop`) se reutiliza
   **sin cambios**: solo hacía falta un contenedor `[data-srs-test]` en la pantalla de
   repaso y un callback para el avance.
5. Modales/confirmación/mensajes/accesibilidad: `SMR.modal` (foco atrapado, Escape, cierre por
   overlay, `aria-labelledby`), `.srs-drop-row`/`.srs-drop-status` (8.5.9) y la clase
   `.notice` del proyecto.
6. **Sí puede invalidar el índice**: la sesión es un array posicional, así que borrar la
   tarjeta actual sin tocar `session.questions`/`session.index` repetiría o saltaría tarjetas.
7. Tarjetas sin identidad estable: `buildSrsSession` construye desde `dueSrs()` (que resuelve
   la clave estable o cae a la posicional legada); `srsDropHtml` no pinta acción sin
   identidad, y `dropSrs` sin clave estable solo borra en local (comportamiento ya documentado).
   Las tarjetas con borrado pendiente no aparecen en `data.tests.srs`, por lo que no entran al
   repaso.
8. Solo puede borrarse la tarjeta mostrada: la acción se pinta desde el `testId`/`origIndex`
   de la tarjeta actual y no hay navegación con el modal abierto.

**Implementación (mínima):** en `renderQuestion`, cuando `s.mode === 'srs'` se pinta
`<div data-srs-test=… data-srs-index=…>` con `srsDropHtml(c.testId, c.origIndex)` y se cablea
`wireSrsDrop(root, (testId, origIndex, message) => advanceAfterSrsDrop(root, testId, origIndex, message))`.
`advanceAfterSrsDrop` quita la tarjeta del conjunto (y su respuesta, si ya la había dado, para
que los totales cuadren), deja el índice en la siguiente sin saltos ni repeticiones, cierra el
repaso en el resultado si era la última de varias y muestra el estado vacío ya existente
(`renderIndex` con «No hay repasos vencidos hoy» + `stop()` + `session = null`) si era la
única. El mensaje del borrado viaja como aviso de un solo uso (`srsNotice` → `.notice`,
`role="status"`) para que el repintado de la siguiente pregunta no se lo coma; se limpia al
terminar el repaso para no arrastrarlo a pantallas posteriores. `wireSrsDrop` acepta ahora un
callback opcional `onDeleted(testId, origIndex, message)`; el comportamiento de 8.5.9 sin
callback no cambia.

**Defecto encontrado por la suite nueva y corregido (D-2):** el primer cableado pasaba
`advanceAfterSrsDrop` como referencia suelta, de modo que el callback `(testId, origIndex)` se
recibía como `(root, testId)` y el avance **nunca** ocurría en producción. Se corrigió con la
lambda que pasa la raíz y el test lo reproduce (era el caso que fallaba).

**Defecto P1 encontrado en la auditoría (D-3, corregido después en 8.5.11 — se conserva el
registro original):** *al recargar con la sesión restaurada se restaura un snapshot
obsoleto del dueño y una marca SRS `pending` vieja puede volver a borrar en el cloud una
tarjeta que el usuario había revivido.*
- Causa: `runtime.currentUser` es solo memoria (`js/cloud-progress.js:297` y `:1701`), así que
  en el arranque el primer `smr:authchange` tiene `prevOwner = null`; el guard
  `!prevOwner && nextOwner !== GUEST_OWNER && hasContent(...)` archiva el **slot vivo del
  propio usuario** bajo `__guest__` (dueño equivocado) y `restoreSlotFor(nextOwner)` instala
  el snapshot del dueño. Ese snapshot solo se escribe en las transiciones de sesión
  (`archiveSlotFor` en logout/login), porque `SMR.progress.save()` escribe únicamente el slot
  vivo (`js/app.js`, `save() { SMR.store.set(PROGRESS_KEY, this.data); }`): siempre está
  obsoleto respecto a lo que hizo el usuario después.
- Reproducción medida (origen limpio, UNA sola instancia, cuenta efímera): cuenta nueva →
  2 tarjetas vencidas empujadas → borrar una desde el repaso SRS (`pending`, tombstone real
  en PostgreSQL) → cerrar sesión (el snapshot del dueño queda con `pending`) → entrar de nuevo
  (marca pasa a `known`) → revivir valorando la tarjeta (marca se limpia, el tombstone se
  borra: las 2 filas quedan vivas en PostgreSQL) → **recargar**: el slot vivo (2 tarjetas, sin
  marcas) se archiva como `__guest__` (savedAt nuevo) y el slot vivo pasa a ser el snapshot
  obsoleto (marca `pending`); el pull ve la fila viva, pero la marca `pending` la bloquea y el
  push reenvía el tombstone → **la fila revivida vuelve a nacer borrada**
  (`deleted_at = 1791901454959`, medido con psql).
- Alcance: afecta a todo el slot (son las claves de `SLOT_KEYS` las que se archivan/restauran),
  pero el daño medido es SRS: re-aplicar `pending` re-borra tarjetas vivas. Sin cambio de
  cuenta ni logout también ocurre con las marcas `pending` heredadas del visitante que la
  cuenta adopta al entrar (así se destruyeron 2 tarjetas vivas en la primera corrida
  autenticada de esta fase, `deleted_at = 1791901021608`).
- **No se corrige aquí**: no es el problema multi-pestaña (8.4.5) sino la propiedad del slot
  entre recargas, y la arregla un cambio arquitectónico (persistir el dueño del slot vivo o no
  pisar el slot vivo con un snapshot obsoleto, y decidir si una marca `pending` de un snapshot
  viejo debe honrarse). Recomendación: fase propia **antes de aplicar 00008 en remoto**.

**Pruebas de esta fase (todas exit 0):** `node --check js/tests.js`;
`node tests/srs-review-drop.test.js` **12/12** (mocks: visibilidad, cancelar sin efecto, un solo
borrado con identificadores correctos, avance sin saltos/duplicados por tarjeta intermedia,
final coherente al borrar la última y al borrar la única, respuesta ya dada que no descuadra
totales, identidad de las restantes, error sin avance falso, clics repetidos, visitante sin
Supabase y sin reimplementar tombstones, e integración estática del repaso sin regresión de
8.5.9); su auto-verificación `SRS_REVIEW_SELFTEST=1` sale **exit 1**;
`node tests/srs-drop-ui.test.js` 10/10; `node tests/srs-rate-ui.test.js` 5/5;
`node tests/srs-delete.test.js` 11/11; `node tests/srs-sync.test.js` 21/21;
`node tests/h1-race.test.js` 15/15; `bash tests/pg-srs-delete.sh` 18/18 y
`bash tests/pg-local-concurrency.sh` 13/13 (PostgreSQL real del staging local).

**Navegador real (visitante y autenticado, origen limpio, una sola instancia):** visitante →
la acción aparece solo en la tarjeta actual, la confirmación nombra la pregunta que se ve,
cancelar/Escape no cambian nada, y borrar encadena «Pregunta 1 de 4» → «1 de 3» sin saltos,
con aviso `role="status"` sobre la siguiente pregunta, marcas `pending`, **0 peticiones nuevas
a Supabase** y, al borrar la última, el estado vacío ya existente del repaso; reentrar en
`mode=srs` no las resucita. Autenticado → borrar desde el repaso deja `deleted_at` real en
PostgreSQL solo en la fila del uid de la sesión (las demás siguen vivas) y el aviso es el de  cuenta. Cuentas efímeras eliminadas al terminar; BD local de nuevo sin filas SRS y solo con
  las cuentas preexistentes `a@staging.test`/`b@staging.test`.

**Limitaciones:** (1) D-3 (arriba) **corregido en 8.5.11** (ver la sección siguiente); antes de
esa corrección la recarga podía re-aplicar borrados obsoletos; (2) el problema multi-instancia de 8.4.5/8.4.5.1 sigue abierto; (3) revive mantiene
la política de nivel mayor; (4) valorar antes de recibir el tombstone pierde esa valoración;
(5) tombstones ocupan cupo del límite de 500 y no hay paginación; (6) no hay CI;
(7) **00008 sigue sin aplicar en ningún backend remoto** (primero SQL, después JS).

### 8.5.11 — Propiedad del slot vivo entre recargas: D-3 CORREGIDO (13-10-2026)

**Alcance:** cerrar el defecto P1 D-3 de 8.5.10 (propiedad, inicialización, archivado y
restauración del estado local por usuario). Sin funciones SRS nuevas, sin UI nueva, sin
cambios de esquema ni migraciones (00008 sigue SOLO en la BD local de staging), sin
commit/push/deploy.

**Causa raíz confirmada (no hipótesis):** `runtime.currentUser` es solo memoria
(`js/cloud-progress.js`), así que en el arranque el primer `smr:authchange` calculaba
`prevOwner = null`. Con `prevOwner` null el guard `!prevOwner && nextOwner !== GUEST_OWNER &&
hasContent(...)` archivaba el **slot vivo del propio usuario** bajo `__guest__` (dueño
equivocado) y `restoreSlotFor(nextOwner)` instalaba el snapshot del dueño, escrito por última
vez en una transición anterior (obsoleto), reintroduciendo marcas `pending` ya revividas. No
era un problema de inicialización de sesión de Supabase (la sesión se restaura bien), ni una
carrera: era **una escritura del slot vivo atribuida al propietario equivocado + restauración
de un snapshot obsoleto**, determinista en cada recarga.

**Decisión de diseño (mínima, sin clave nueva de slot):** persistir el **dueño del slot
vivo** como metadato, no como contenido:
- `smrhub:liveOwner` → `{ owner, v: 1 }` (`LIVE_OWNER_KEY`). NO entra en `SLOT_KEYS`, así que
  no viaja en los snapshots ni en la cuarentena (verificado por test).
- Al arrancar, `runtime.liveOwner = readLiveOwner()`: el dueño del slot vivo se conoce **antes**
  de procesar la primera escritura. El handler usa `slotOwnerOrUnknown(runtime.liveOwner)` como
  `prevOwner` cuando aún no hay sesión en runtime, de modo que una recarga con la sesión
  restaurada ve `prevOwner === nextOwner` → **ni archiva ni restaura**: el estado vivo manda.
- Tras cada transición (login, logout, swap, reconciliación pasiva) se persiste el nuevo dueño
  (`writeLiveOwner`). El paso a modo visitante ya escribe `__guest__`, que es el valor correcto.
- Lectura tolerante (`{owner,v}` o el uid suelto) y, ante ausencia o corrupción, `null`: **el
  valor ausente nunca autoriza a reasignar el slot** (se cae al camino previo: custodia en
  `__guest__` + restauración del dueño, que es el comportamiento de los perfiles heredados).
- Precedencia: mientras el dueño persistido coincida con el que entra, el estado vivo gana al
  snapshot; solo un cambio real de propietario archiva y restaura. Sin cambio de cuenta no se
  toca ningún snapshot, así que ningún snapshot obsoleto sustituye datos vivos.
- Migración: no se introduce formato nuevo en los slots ni se borra ninguna clave; los perfiles
  antiguos sin marcador recorren una vez el camino previo y salen con el marcador fijado
  (probado).

**Invariantes:** (1) el estado autenticado no se archiva como `__guest__` por arranque;
(2) el estado vivo no se sustituye por un snapshot más antiguo mientras el dueño coincida;
(3) un tombstone retirado por revive no reaparece tras recargar; (4) un `pending` legítimo
sobrevive a la recarga y al ciclo cerrar/abrir sesión; (5) A nunca escribe el slot de B;
(6) una respuesta tardía de A no escribe con B activo; (7) visitante y adopción intactos;
(8) perfil, favoritos, progreso y marcas no SRS no se pierden; (9) claves SRS estables,
`dropSrs`/`scheduleSrs`, política de revive y esquema remoto sin cambios; (10) la solución no
asume una sola pestaña.

**Archivos:** `js/cloud-progress.js` (`LIVE_OWNER_KEY`, `readLiveOwner`, `writeLiveOwner`,
`slotOwnerOrUnknown`, `runtime.liveOwner`, uso en `smr:authchange` y `reconcilePassiveSlot`);
nuevo `tests/slot-owner.test.js` (10 casos).

**Pruebas (todas exit 0):** `node --check js/{cloud-progress,cloud-profile,cloud-config,
tests,srs,auth}.js`; `node tests/slot-owner.test.js` **10/10** y su auto-verificación
`SLOT_OWNER_SELFTEST=1` **exit 1**; resto de suites sin regresión: srs-sync 21/21, srs-delete
11/11, srs-drop-ui 10/10 (selftest exit 1), srs-rate-ui 5/5, srs-review-drop 12/12 (selftest
exit 1), h1-race 15/15; `bash tests/pg-srs-delete.sh` 18/18 y
`bash tests/pg-local-concurrency.sh` 13/13 (PostgreSQL real).

**Navegador real (127.0.0.1:8098, origen limpio, UNA instancia, Supabase local + PostgreSQL
real, dos cuentas efímeras `d3slot-*@example.test` borradas al terminar):**
- Secuencia D-3 completa: cuenta nueva → tarjeta insertada en `srs_cards` → recarga (pull
  correcto, `liveOwner` = uid, sin `__guest__`) → borrado desde el repaso SRS (tombstone real
  `deleted_at=1791902558560`, marca local `pending` → `known`) → revive valorando «Lo sabía»
  desde la revisión del resultado (`deleted_at` a NULL, fila viva, marca eliminada) →
  **recarga**: la tarjeta sigue viva, `progressSyncSrsClears` vacío, `liveOwner` = uid, sin
  snapshot `__guest__`, y en PostgreSQL la fila sigue viva.
- Reproducción con la forma exacta de D-3 (snapshot del dueño obsoleto ya presente + marca
  `pending` viva): tras recargar, la tarjeta **no** resucita, el `pending` se conserva y avanza
  a `known` (el tombstone se confirma), sin archivado `__guest__`.
- A→B→A real: al cerrar sesión el estado de A se archiva bajo **A** (con tarjeta, historial y
  cola por uid) y el slot vivo queda en visitante (`liveOwner = __guest__`, sin snapshot
  `__guest__`); al entrar B el slot es el de B (limpio, sin datos de A); al volver A recupera su
  tarjeta, historial y marcas, sin `__guest__` y sin tocar el estado de B.

**Limitaciones (declaradas):** (1) el problema **multi-instancia** de 8.4.5/8.4.5.1 sigue
abierto y **no se declara resuelto** (el marcador es también estado compartido entre pestañas;
no se ha probado aquí con dos instancias simultáneas); (2) caso ambiguo documentado: si el
arranque no puede restaurar sesión (token caducado/offline) y el usuario estudia como
visitante, esa actividad cae en el slot del dueño marcado (se atribuye al dispositivo que
inicia sesión después, misma política que 8.3/8.4.2; nunca se pierde ni se filtra a otra
cuenta); (3) siguen abiertos: revive con política de nivel mayor, valoración perdida antes del
tombstone, tombstones en el cupo de 500 sin paginación, ausencia de CI y **00008 sin aplicar
en remoto**. **Nota 8.5.12:** el punto (1) se atendió en la sección 8.5.12 (el marcador
persistido pasa a ser la autoridad de propiedad entre pestañas, con reproducción real en dos
pestañas y suite propia); el resto de esta lista sigue igual.

### 8.5.12 — Concurrencia del slot vivo entre pestañas: D-4 CORREGIDO (13-10-2026)

**Alcance:** cerrar el problema multi-instancia de 8.4.5/8.4.5.1 sobre la PROPIEDAD del slot
vivo (el marcador de 8.5.11 es estado compartido entre pestañas del mismo origen). Sin UI nueva,
sin cambios de esquema ni migraciones (00008 sigue SOLO en la BD local), sin tocar
`dropSrs`/`scheduleSrs`/política de revive/IDs estables/`SMR_DATA`, sin commit/push/deploy.

**Estado Git:** rama `main`, HEAD `1f6f2475` (`...origin/main`), sin cambios de rama ni de HEAD.
M heredados = `css/app.css`, `index.html`, `js/cloud-config.js`, `js/cloud-profile.js`,
`js/cloud-progress.js`, `js/tests.js`; ?? = docs raíz, `supabase/migrations/00005..00008`,
`tests/`, `.claude/`. Añadido en esta fase: `tests/tab-slots.test.js` (nuevo) y 5 ediciones de
`js/cloud-progress.js` marcadas `8.5.12`. Nada más se modificó; ningún archivo o cambio heredado
se eliminó.

**Mecanismos entre pestañas comprobados (Fase A, sin presuponer):** `navigator.locks` con el
nombre `smrhub:slot-transition` (exclusión mutua de transiciones; sin locks se ejecuta igual);
un listener `storage` que SOLO reacciona a claves `smrhub:progressByOwner:*` (no a
`smrhub:progress` ni a `smrhub:liveOwner`) y llama a `reconcilePassiveSlot`; colas por propietario;
y guardas `sessionHandleFor`/`sessionChangedFor` por operación. NO existía ningún mecanismo que
mantuviera al día la copia en MEMORIA de una pestaña pasiva (`runtime.currentUser`,
`runtime.liveOwner` se leía una sola vez al cargar el módulo).

**Defecto D-4 (P1), reproducido con DOS pestañas reales** (mismo origen, `localStorage`
compartido, 127.0.0.1:8099, Supabase + PostgreSQL locales, cuentas efímeras borradas al final):

1. **Logout procesado por las dos pestañas.** La pestaña 1 (cuenta A) cierra sesión: archiva A
   correctamente y restaura el slot del visitante. La pestaña 2, que aún cree ser A
   (`runtime.currentUser` desfasado), procesa el mismo logout y ejecuta `archiveSlotFor(A)` con
   `captureSlot()`, que YA es el contenido del visitante → **el snapshot de A queda sustituido
   por contenido ajeno**. Medido: la pestaña 1 archivó `{r-prueba-b1, r-A1, r-A2}` (`savedAt`
   …495) y la pestaña 2 lo sobrescribió con `{r-prueba-b1}` (`savedAt` …496); el orden se
   registró con un listener `storage` propio en cada pestaña.
2. **Login procesado por una pestaña pasiva.** La pestaña 2 (runtime vacío, `runtime.liveOwner`
   = null porque se cargó antes del login) archiva `captureSlot()` bajo `__guest__` → los datos
   de la CUENTA acaban en la custodia del VISITANTE. En el ciclo siguiente, la custodia legítima
   del visitante (escrita milisegundos antes por la pestaña activa) queda sobrescrita por el
   contenido de la cuenta y se pierde de forma irrecuperable el progreso de visitante
   `r-guest-marker` (no existía en ninguna clave de localStorage; el progreso de visitante no
   está en la nube).
3. **Reconciliación pasiva** (riesgo demostrado por lectura de código, no reproducido en esta
   corrida por el orden de entrega de los eventos): `reconcilePassiveSlot` decide con
   `runtime.currentUser` y podía reinstalar el snapshot de una cuenta sobre el slot vivo que ya
   era del visitante.
4. **Mismo usuario en dos pestañas.** El `save()` de una pestaña escribe el objeto vivo completo
   en el slot COMPARTIDO y revierte lo que la otra acaba de escribir (medido: la tarjeta SRS
   creada en la pestaña 1 desaparece del slot al guardar la pestaña 2; las tarjetas vuelven al
   slot en el ciclo de sync siguiente porque están vivas en la nube). Las marcas
   `progressSyncSrsClears` NO se pierden (clave aparte, lectura fresca) y el tombstone no se
   resucita (`pending → known`, ninguna entrada viva reenviada, `deleted_at` real en PostgreSQL).
   **Limitación declarada y NO corregida aquí**: no es propiedad del slot sino MERGE de dos copias
   vivas.

**Causa raíz (demostrada):** la propiedad del slot vivo se calculaba con MEMORIA POR PESTAÑA
(`runtime.currentUser`, `runtime.liveOwner` cargado una vez) mientras el slot vivo es COMPARTIDO,
y `archiveSlotFor`/`restoreSlotFor` capturan ese slot compartido: una pestaña con el dueño
desfasado archiva el contenido de otro dueño bajo su dueño obsoleto y sobrescribe la custodia
ajena.

**Corrección mínima (5 ediciones en `js/cloud-progress.js`):**
1. `prevOwner` en el handler `smr:authchange` = `readLiveOwner()` (lectura FRESCA, dentro del
   lock, con las transiciones ya serializadas) cuando existe marcador, traducido con
   `slotOwnerOrUnknown` (visitante → null); `runtime.currentUser` queda solo como respaldo cuando
   NO hay marcador (perfiles heredados, mismo comportamiento que antes). **El marcador persistido
   pasa a ser la autoridad de propiedad** (8.5.11 lo escribía pero nadie lo volvía a leer).
2. La copia en memoria (`SMR.progress.data = sanitizeProgressLocal()`) se re-lee del slot vivo
   SIEMPRE al entrar una cuenta, no solo cuando cambia el dueño: una pestaña pasiva ya no se queda
   con el estado de otro dueño ni lo escribe en el slot compartido en su siguiente `save()`.
3. Lo mismo al salir (paso a visitante): la copia en memoria se re-lee del slot vivo.
4. `reconcilePassiveSlot` exige que el marcador persistido confirme que el slot vivo es de ese
   dueño (bloquea reinstalar el snapshot de una sesión que ya no es la del slot; sin marcador se
   conserva el comportamiento previo).
5. `withSlotTransitionLock`: si la petición del lock RECHAZA (documento no activo, p. ej.
   bfcache), la transición se ejecuta igual sin exclusión en vez de perderse (una transición
   perdida deja el slot sin archivar/restaurar). Un lock retenido por una pestaña congelada sigue
   sin timeout: decisión pendiente, no se inventa.

**Invariantes verificadas:** (1) el estado de una cuenta no se archiva bajo otro dueño; (2) la
custodia del visitante no se contamina con datos de una cuenta ni se pierde por una transición
ajena; (3) la copia en memoria de una pestaña pasiva converge al slot vivo, nunca a otro dueño;
(4) ninguna pestaña reinstala un snapshot obsoleto cuando el marcador ya no es de ese dueño;
(5) `A→B→A` por el flujo admitido no cruza datos; (6) las marcas SRS `pending`/`known`/`revive` y
el tombstone se comportan igual en dos pestañas; (7) un lock rechazado no pierde la transición;
(8) esquema remoto, IDs estables, `dropSrs`/`scheduleSrs`, política de revive, `SMR_DATA` y modo
visitante/offline intactos; (9) ninguna clave de localStorage se borra ni migra.

**Archivos:** `js/cloud-progress.js` (líneas 1595-1609 lock, 1631-1635 gate de reconciliación,
1683-1691 `prevOwner`, 1764-1770 refresco al entrar, 1795-1799 refresco al salir) y nuevo
`tests/tab-slots.test.js` (10 casos: dos instancias REALES del módulo sobre un `localStorage`
compartido y un bus de eventos `storage` entregado solo a la otra pestaña).

**Pruebas (todas exit 0):** `node --check` ×7; `node tests/tab-slots.test.js` **10/10** y su
auto-verificación `TAB_SLOTS_SELFTEST=1` **exit 1**; la misma suite contra la copia pre-fix del
módulo (`SMR_MODULE=<copia>` generada revirtiendo las 5 ediciones) **falla** en el caso del logout
(custodia de A con contenido del visitante) → la suite detecta el defecto. Resto sin regresión:
slot-owner 10/10 (selftest exit 1), srs-sync 21/21, srs-delete 11/11, srs-drop-ui 10/10 (selftest
exit 1), srs-rate-ui 5/5, srs-review-drop 12/12 (selftest exit 1), h1-race 15/15;
`bash tests/pg-srs-delete.sh` 18/18 y `bash tests/pg-local-concurrency.sh` 13/13 (PostgreSQL real
del staging local, exit 0 ambos).

**Navegador real con DOS pestañas** (mismo origen, `localStorage` compartido, Supabase +
PostgreSQL locales, cuentas efímeras `f8512a..d@example.test` borradas al terminar; `srs_cards`
final = 0 y solo las cuentas preexistentes `a@staging.test`/`b@staging.test`):
- **Antes del arreglo** (medido con el código pre-fix, misma sesión de prueba): logout con dos
  pestañas → el snapshot de A quedó con el contenido del visitante (`r-A1`/`r-A2` fuera) y
  `__guest__` con tarjeta SRS de la cuenta; login en la pestaña pasiva → `__guest__` con contenido
  de la cuenta y pérdida definitiva del `r-guest-marker` del visitante.
- **Después del arreglo:** visitante → cuenta (adopción de la primera cuenta, comportamiento
  previo intacto) → logout con las DOS pestañas: `progressByOwner:A3 = [r-guest-marker, r-A3]`
  (estado propio) y `__guest__ = [r-guest-marker]` (sin contaminar), marcador `__guest__` y ambas
  pestañas con el estado del visitante en memoria (antes la pasiva seguía con el de la cuenta) →
  login de OTRA cuenta en la pestaña 2: sin adopción ni archivado ajeno (`__guest__` intacto, A3
  intacto, A4 sin contenido ajeno) → A3→A4→A3 por el flujo admitido (cerrar sesión + entrar):
  cada cuenta recupera SU estado y A4 no hereda nada → SRS en dos pestañas: borrado en la pestaña
  1 (`deleted_at = 1791907278474` real en PostgreSQL), el `save()` de la pestaña 2 no pierde la
  marca (`pending → known`, ninguna entrada viva reenviada, la tarjeta no se reinstala) y el
  revive desde la pestaña 2 deja `deleted_at` en NULL con la marca retirada.
- No reproducido en pestañas reales (solo con mocks): la respuesta asíncrona tardía de A con B
  activo (cubierta por `slot-owner` 9, `h1-race` 11 y `tab-slots` 8) y el lock RECHAZADO (móvil
  de `tab-slots` 9 con un `navigator.locks` de mentira; en el navegador real el lock siempre
  funciona y se ejercita en cada transición).

**Limitaciones declaradas:** (1) dos cuentas distintas SIMULTÁNEAS en el mismo origen no son
compatibles con el diseño de autenticación actual (la sesión de Supabase es compartida por
`localStorage` y el widget solo ofrece entrar/salir): el cambio de cuenta se probó de forma
secuencial, como permite la aplicación; (2) el `save()` de una pestaña sigue escribiendo el objeto
vivo completo en el slot compartido (último que escribe gana): limitación conocida, no corregida
en esta fase; (3) un lock retenido por una pestaña congelada (no destruida) puede retrasar
transiciones: no hay timeout ni decisión de producto; (4) si el proceso muere entre la escritura
del slot y la del marcador, el marcador queda un turno desfasado y la siguiente transición se
comporta como antes de 8.5.12 (sin pérdida: el contenido queda archivado bajo el dueño anterior);
(5) no se probaron dos dispositivos físicos ni la pérdida de comunicación entre pestañas (solo
existe `storage`, que no llega a la pestaña que escribe); (6) siguen abiertos: revive con política
de nivel mayor, valoración perdida antes del tombstone, tombstones en el cupo de 500 sin
paginación, ausencia de CI y **00008 sin aplicar en remoto**.

### 8.5.13 — Fusión del slot vivo entre pestañas + seguridad del lock (IMPLEMENTADO y VERIFICADO, 13-10-2026)

**Alcance:** cerrar el riesgo que 8.5.12 dejó declarado («el `save()` de una pestaña sigue siendo
último-que-escribe-gana sobre el slot compartido») y auditar el mecanismo de bloqueo. Sin UI nueva,
sin cambios de esquema, sin migraciones (00008 sigue SOLO en local), sin tocar
`dropSrs`/`scheduleSrs`/política de revive/IDs estables/`SMR_DATA`, sin borrar ni migrar ninguna
clave de localStorage, sin commit/push/deploy.

**Estado Git:** rama `main`, HEAD `1f6f247` (`...origin/main`), sin cambios de rama ni de HEAD.
M heredados = `css/app.css`, `index.html`, `js/cloud-config.js`, `js/cloud-profile.js`,
`js/cloud-progress.js`, `js/tests.js`; **`js/app.js` pasa a `M` en esta fase** (antes estaba limpio);
?? = docs raíz, `.claude/`, `supabase/migrations/00005..00008`, `tests/`. Añadido:
`tests/tab-merge.test.js`. Ningún archivo, cambio heredado ni documentación histórica se eliminó.

**Diagnóstico demostrado (D-5).** `SMR.progress.save()` escribía el objeto vivo COMPLETO en el slot
compartido desde la copia en memoria de una pestaña, así que descartaba lo que otra acababa de
guardar (pérdida de actualización independiente, no solo conflicto del mismo campo). Reproducido,
no inferido: (1) **mocks** — con dos instancias reales del módulo sobre un `localStorage`
compartido, la suite nueva falla contra el `app.js` pre-fix (`[r-1, r-3]` en el slot en vez de
`[r-1, r-2, r-3]`); (2) **navegador real, dos pestañas** — la pestaña 1 marca `r-b1`, la pestaña 2
(copia leída antes) marca `r-b2` y guarda: antes solo sobrevivía `r-b2`. Hallazgos propios durante
la construcción (todos corregidos y con prueba que los detecta): (a) sin BASE de fusión, el primer
guardado de cada pestaña seguía pisando (→ `SMR.store.readBase`); (b) `slotApply` vaciaba el array
antes de copiarlo cuando el merge devolvía la misma referencia; (c) asimetría del borrado: una copia
vieja resucitaba lo que la otra pestaña acababa de desmarcar/borrar; (d) mezcla de PROPIETARIOS: la
pestaña de la cuenta podía fusionar contenido volcado por una pestaña retrasada (→ marca
`liveWriter`).

**Política de conflicto por dominio (aplicada; sin fusión genérica).** Fusión de tres vías por
clave (`mine`, `theirs`, `base` = última versión conocida de esta pestaña); si solo cambió uno, gana
ese; si cambiaron los dos, la semántica es la ya establecida (esta pestaña); la nube sigue siendo el
árbitro por dominio.

| Dominio | Mecanismo real | Clave | Política |
| --- | --- | --- | --- |
| Recursos vistos/completados/autoevaluación | mapa id→ts dentro de `progress` | `progress.resources.*` | fusión por id; borrado gana salvo cambio local propio |
| Historial de tests y actividad | listas acumulativas | `tests.history`, `activity` | unión por entrada (ts+modo+testId+score / ts+tipo+etiqueta+meta), orden por ts, recorte al límite real (60/40) |
| Mejor/última nota, fallos | mapa por testId | `tests.best|last|wrong` | fusión por clave; conflicto al mismo id → esta pestaña |
| SRS (tarjetas) | mapa por ID estable | `tests.srs`, `tests.srsLegacy` | fusión por clave; el borrado local gana sobre copia vieja; revivir es un valor nuevo ≠ base → sobrevive. Política de revive/tombstones sin cambios (servidor) |
| Casos resueltos | mapa por caseId | `cases.solved` | fusión por clave |
| Sesiones de estudio, minutos, racha | valor único / lista sin regla | `studySessions`, `studyMinutes`, `streak` | LWW (esta pestaña); no se inventa fusión |
| Perfil académico y currículo | valor único del slot per-owner | `studentProfile`, `curriculum` | LWW; se archiva con SU dueño; nunca se fusiona entre cuentas |
| Favoritos y ajustes | clave de DISPOSITIVO (no slot) | `favorites`, `settings` | fusión por clave: los cambios de dos pestañas conviven |
| Marcas de borrado pendientes | lectura fresca + escritura | `progressSyncClears`, `progressSyncSrsClears` | NO se fusionan (siguen igual); riesgo residual declarado |
| Identidad del contenido | metadatos del slot vivo | `liveOwner`, `liveWriter` (nuevo) | si no coinciden con MI dueño → NO se fusiona (escritura directa) |

**Archivos y cambios.**

- `js/app.js` (primitivas, porque la fusión debe proteger también sin el módulo de nube: modo
  visitante/offline): `SLOT_ARRAYS` (listas acumulativas con clave estable y límite real extraído de
  sus propias constantes `ACTIVITY_LIMIT`/`HISTORY_LIMIT`), `deepEqual`, `deepCopy`, `isPlainObject`,
  `slotMergeArray`, `slotMergeValue`, `slotMergeObject` (incluye el borrado en ambos sentidos),
  `slotApply` (conserva la identidad de objetos/arrays) y en `SMR.store`: `written` (base por clave),
  `readBase(key)` y `writeMerged(key, data, other)`; `progress.save()`, `favorites` y `settings`
  pasan por `writeMerged`; `progress.clear()` invalida la base (un borrado voluntario no se fusiona).
- `js/cloud-progress.js`: `otherSlot()` — la fusión NO cruza propietarios (marcador `liveOwner` +
  marca nueva `liveWriter`, ambas leídas frescas); `refreshSlotBases()` al instalar el slot entero
  (transiciones/reconciliación) para no fusionar contra la copia que se acaba de sustituir;
  `sanitizeProgressLocal()` refresca la base (pestaña pasiva que pasa a escribir);
  `writeLiveWriter()` en el envoltorio de `save()` y en las transiciones; guarda `try/catch` en la
  PETICIÓN del lock (`Promise.resolve(req).catch(...)`) para que un error síncrono no pierda la
  transición.

**Lock (Fase C) — medido, sin timeout ni ejecución sin lock como remedio nuevo:** adquirido → la
fusión y el estado quedan consistentes; dos transiciones concurrentes desde pestañas distintas →
cada una pasa por su lock y el estado final es el de la última, sin mezcla; lock RECHAZADO → se
ejecuta sin exclusión (decisión de 8.5.12, no se cambia) y no mezcla contenido entre dueños;
lock RETENIDO por una pestaña → la otra espera (sin timeout, decisión de producto pendiente);
ERROR SÍNCRONO al pedir el lock → **antes escapaba al manejador `smr:authchange` y la transición se
perdía** (defecto demostrado por la suite), ahora se registra y se ejecuta sin exclusión, con
`runDirect` idempotente para no duplicar la transición. En un solo proceso no se puede reproducir el
interleaving real entre procesos a nivel de `setItem`: declarado como límite del arnés.

**Pruebas (todas exit 0 salvo donde se indica).** `node --check` de `js/*.js` y `tests/*.js`;
nueva `tests/tab-merge.test.js` **13/13** (dos instancias REALES del módulo + primitivas REALES de
`app.js` extraídas del fuente; auto-verificación `TAB_MERGE_SELFTEST=1` → **exit 1**; con el
`app.js` pre-fix → **exit 1**; con el módulo sin la marca `liveWriter` → **exit 1**). Sin regresión:
slot-owner 10/10, h1-race 15/15, srs-sync 21/21, srs-delete 11/11, srs-drop-ui 10/10, srs-rate-ui
5/5, srs-review-drop 12/12, tab-slots 10/10; PostgreSQL real: `bash tests/pg-srs-delete.sh` 18/18 y
`bash tests/pg-local-concurrency.sh` 13/13.

**Navegador real con DOS pestañas** (mismo origen, `localStorage` compartido, 127.0.0.1:8099,
Supabase + PostgreSQL locales; cuenta efímera `b8513-…@example.test` creada y borrada al final,
`srs_cards` = 0 y `resource_state`/`profiles` de esa cuenta = 0; el `localStorage` del perfil se
devolvió EXACTAMENTE al conjunto de claves previo a la fase):
- visitante, dos pestañas: pestaña 1 marca `r-b1`, pestaña 2 (copia desfasada) marca `r-b2` → el slot
  queda con `r-g5`, `r-b1`, `r-b2` (antes solo `r-b2`) y la pestaña 2 adopta `r-b1` en memoria;
- borrado contra copia vieja: pestaña 1 desmarca `r-b1`, la pestaña 2 guarda con `r-b1` aún en
  memoria → `r-b1` NO resucita y `r-b3` entra;
- acumulativos: dos entradas de historial y dos tarjetas SRS de pestañas distintas conviven;
- cuenta real en dos pestañas (login por `signUp` inmediato; la segunda pestaña recibe el
  `smr:authchange` por la sesión compartida): pestaña 1 marca `r-a1`, pestaña 2 con copia vacía
  marca `r-a2` → el slot tiene AMBOS y NINGÚN id del visitante (`r-g5`/`r-b2`/`r-b3` fuera): sin
  pérdida y sin mezcla de propietarios; `liveOwner` = `liveWriter` = uid; recarga de las dos
  pestañas → el estado persiste y el snapshot `__guest__` conserva todo lo suyo (3 recursos + 2
  entradas de historial); logout → la cuenta conserva `r-a1`/`r-a2` en su snapshot y el visitante
  recupera lo suyo. Consola/red sin errores (solo avisos de contenido preexistentes; sync 200/201).

**Limitaciones declaradas:** (1) el arnés es un solo proceso: el interleaving real entre dos
procesos del navegador a nivel de `setItem` no se reproduce (sí el orden, incluidas escrituras
obsoletas posteriores); (2) `progressSyncClears`/`progressSyncSrsClears` siguen con
lectura-fresca+escritura sin fusión: una pestaña puede perder una marca escrita en el mismo
intervalo (ventana de una sola sentencia; las transiciones las archivan/restauran con el slot);
(3) `studySessions`/`minutes`/`racha` y el perfil siguen siendo LWW (semántica establecida, no se
inventó fusión); (4) el parche de fusión implica leer y comparar el objeto en cada guardado (coste
proporcional al tamaño de `progress`, medido en decenas de KB como máximo) — no se hizo perfilado
formal; (5) no se probaron dispositivos físicos, ni pestaña congelada reteniendo el lock, ni
reparto real entre dos procesos; (6) siguen abiertos de fases anteriores: política de revive con
nivel mayor, valoraciones perdidas antes del tombstone, tombstones en el cupo de 500 sin paginación,
ausencia de CI y **00008 sin aplicar en remoto**.

### 8.5.14 — Concurrencia de las marcas de borrado pendientes (IMPLEMENTADO y VERIFICADO, 13-10-2026)

**Alcance:** auditar y, con la evidencia, corregir la concurrencia de
`progressSyncSrsClears` (y caracterizar `progressSyncClears`). Sin UI nueva, sin cambios de esquema,
sin migraciones (00008 sigue SOLO en local), sin tocar IDs SRS, `dropSrs()`, `scheduleSrs()`, la
política de revive ni `SMR_DATA`, sin commit/push/deploy, sin `supabase db reset` ni migraciones
remotas, sin detener Docker.

**Estado Git:** rama `main`, HEAD `1f6f247` (`...origin/main`), sin cambio de rama ni de HEAD.
M = `css/app.css`, `index.html`, `js/app.js`, `js/cloud-config.js`, `js/cloud-profile.js`,
`js/cloud-progress.js`, `js/tests.js` (los mismos que al cerrar 8.5.13); ?? = docs raíz, `.claude/`,
`supabase/migrations/00005..00008`, `tests/`. Añadido en esta fase: `tests/srs-clears-race.test.js`
(8 casos). Editados además por esta corrección: `js/cloud-progress.js` y los tres arneses que
extraen `syncSrsCards` (`tests/srs-sync.test.js`, `tests/srs-delete.test.js`, `tests/h1-race.test.js`),
que ahora incluyen los helpers que la función usa. Ninguna historia de estos documentos se borró ni
se modificó; no quedan temporales ni artefactos de prueba.

**Causa raíz demostrada (D-6).** El ciclo de SRS leía `progressSyncSrsClears` antes del `await` de la
RPC y, al volver, reescribía la copia leída; durante esa ventana, cualquier marca creada por otra
pestaña desaparecía (el tombstone no llegaba a la nube y el pull resucitaba la tarjeta). A eso se
sumaban dos comprobaciones mal situadas: el guard de sesión/dueño se evaluaba ANTES del `await` (no
después), y el consumo de la marca `revive` borraba la clave sin comprobar el estado observado.
Reproducido, no inferido: en navegador real con DOS pestañas, antes de la corrección, la pestaña 2
(con la RPC retenida) borraba la marca `pending` recién creada por la pestaña 1, la tarjeta no
quedaba borrada en PostgreSQL (`deleted_at` NULL) y resucitaba localmente y se subía como viva.

| # | Escenario | Secuencia observada | Causa demostrada | Riesgo | Solución mínima |
| --- | --- | --- | --- | --- | --- |
| 1 | Una pestaña crea una marca durante el `await` de otra | T1 lee `{QA:pending}`, espera la RPC; T2 marca QC; T1 escribe su copia → QC desaparece | `writeSrsClears(clears)` con la copia leída antes del `await` | el borrado de T2 no llega nunca a la nube | aplicar SOLO las transiciones decididas sobre lectura FRESCA (`applySrsClear`) |
| 2 | El ciclo de una pestaña consume la marca mientras otra conserva copia vieja | T1 observa el tombstone (pending→known) y escribe; T2 reescribe su mapa previo | escritura del mapa entero en cada transición | marcas consumidas que reviven o se pierden | `pending→known` solo desde `pending`/ausente; nunca pisa `revive` |
| 3 | Respuesta tardía tras cambio de propietario | T1 espera la RPC; T2 cierra sesión; T1 escribe → marcas de la cuenta en la clave del visitante | guard de sesión/dueño comprobado antes del `await` | estado de borrado de A atribuido al visitante | re-comprobar sesión y MARCADOR tras el `await` y no escribir nada si cambió |
| 4 | Consumo de `revive` pisa un re-borrado | A revive (RPC en vuelo); B vuelve a borrar → A borra la marca | `setClear(k, null)` sin estado esperado | tarjeta viva que el usuario había borrado | consumir solo si la marca sigue en el estado observado (`applySrsClear(k, null, 'revive')`) |
| 5 | Error de red con marcas pendientes | el push falla; el borrado local persiste | la marca no se consumía solo si el push confirmaba | documento perdido si se consumiera antes | el error no toca las marcas: `pending` se reintenta idempotente |
| 6 | Tombstone descubierto sin marca previa (lo borró otro dispositivo) | el pull ve el tombstone y no había marca | regla demasiado estricta (`known` solo desde `pending`) | el dispositivo no recordaría el borrado y podría resucitar la tarjeta | `known` también desde AUSENTE (nunca sobre `revive`) |
| 7 | Una pestaña con marca obsoleta `pending` cuya RPC llega después de un revive confirmado de otra | T2 lee `{QD:pending}`; T1 revive y confirma; la RPC de T2 (tombstone obsoleto) llega tarde | el servidor no ordena los tombstones (`merge_srs_cards` aplica el borrado sin comparar) | tarjeta revivida que se vuelve a borrar | **DECISIÓN DE PRODUCTO ABIERTA**: qué gana entre un borrado en vuelo y un revive confirmado en otro dispositivo |

**Archivos y cambios.**

- `js/cloud-progress.js` (8.5.14): nueva `applySrsClear(key, state, expected)` — relee la clave y
aplica SOLO la transición decidida, con semántica explícita por estado (`null` consume si sigue en el
estado esperado; `known` desde `pending` o ausente, sin pisar `revive`/`known`); el ciclo apunta sus
transiciones en `clearOps` y las aplica al final sobre lectura fresca (nunca reescribiendo la copia
leída); guard doble tras el `await` (sesión/copia de datos + marcador `liveOwner` persistido, que
también cubre la pestaña retrasada); consumo del `revive` con estado esperado. Marcas: el mapa sigue
sin fusionarse, pero ya no se reescribe entero.
- `tests/srs-clears-race.test.js` (nuevo, 8 casos): dos instancias reales del módulo sobre un
`localStorage` compartido con RPC retenida/fallida, más un caso de caracterización de
`progressSyncClears` (el ciclo no lo reescribe). Auto-verificación `SRS_CLEARS_SELFTEST=1` → exit 1.
- Arneses que extraen `syncSrsCards` de forma literal: incluyen ahora `readLiveOwner`,
`liveOwnerFor`, `slotOwnerOrUnknown`, `applySrsClear` y las constantes `LIVE_OWNER_KEY`/`GUEST_OWNER`
(sin ellos el módulo extraído no resuelve la nueva guarda).

**Pruebas (mocks, con códigos de salida).** `node tests/srs-clears-race.test.js` **8/8 exit 0**;
contra el módulo PRE-8.5.14 (`.tmp/cloud-prefix.js`) el caso 1 y el caso 2 **fallan** (exit 1) — el
resto de casos son guardas/invariantes que también pasaban antes. Contra una variante con la regla
`known` demasiado estricta, el caso 6 **falla** (exit 1): el defecto se detecta antes de corregirlo.
Sin regresión: slot-owner 10/10, tab-slots 10/10, tab-merge 13/13, srs-sync 21/21, srs-delete 11/11,
srs-drop-ui 10/10, srs-rate-ui 5/5, srs-review-drop 12/12, h1-race 15/15 (exit 0 todas),
`node --check` de `js/*.js` y `tests/*.js` exit 0. PostgreSQL real: `bash tests/pg-local-concurrency.sh`
13/13 y `bash tests/pg-srs-delete.sh` 18/18 (exit 0).

**Navegador real, dos pestañas** (mismo origen, `localStorage` compartido, 127.0.0.1:8099, Supabase y
PostgreSQL locales; cuenta efímera creada para la prueba y borrada al final —0 usuarios y 0 filas—,
`localStorage` del perfil vaciado de claves de la app y de la sesión efímera):

1. **#1 (núcleo)**: tras el arreglo, la pestaña 2 guarda una copia leída ANTES del borrado: la marca
   sobrevive (pasa de `pending` a `known`, no se pierde), la tarjeta resucitada se retira de su
   memoria y la fila sigue `deleted_at` no nulo.
2. **#2**: la pestaña 2 ejecuta un ciclo de sincronización real con la tarjeta aún en memoria →
   retira la copia local, la marca avanza a `known` y PostgreSQL conserva el tombstone (no re-sube
   ninguna tarjeta viva).
3. **#3**: la pestaña 2 (con mapa de marcas VACÍO leído antes) tenía su RPC de SRS retenida; durante
   la espera la pestaña 1 borra la tarjeta y entrega el tombstone → la marca pendiente NO se pierde y
   el upsert vivo retrasado de la pestaña 2 no revive la fila.
4. **#4**: la pestaña 1 revive (marca `revive` → fila viva, marca consumida) y la pestaña 2, con
   estado antiguo, sincroniza → la tarjeta NO se vuelve a borrar (sin tombstone nuevo).
5. **#5**: con marcas pendientes, logout real en la pestaña 2: el slot de A queda archivado con sus
   marcas, el slot del visitante queda SIN marcas de A; al volver a entrar, las marcas de A se
   restauran (el `pending` pasa a `known`) y ninguna se atribuye al visitante.
6. **#6**: respuesta asíncrona tardía (RPC de SRS de A retenida 6 s) mientras la otra pestaña cierra
   sesión → la pestaña A NO escribió NADA en el slot del visitante (marcas vacías), su snapshot
   conserva sus marcas y el tombstone ya enviado sí consta en PostgreSQL.
7. **#7**: pestaña visitante/offline creando progreso (un recurso y una marca `pending` de SRS)
   mientras la otra entra en la cuenta → el contenido del visitante queda custodiado en
   `progressByOwner:__guest__` y NO se adopta ni se atribuye a la cuenta (el slot de A solo tiene lo
   suyo y la nube no recibe nada del visitante).
8. **#8**: error de sincronización simulado con una marca pendiente → la marca se conserva
   (`pending`), el borrado local no se revierte y la nube no cambió; al volver la red, el ciclo
   siguiente entrega el tombstone (idempotente) y la marca avanza a `known`.
9. **Política del servidor medida por la RPC real** (PostgreSQL local, mismo `merge_srs_cards`):
   upsert vivo → viva; `deleted` → tombstone; `revived` → limpia el tombstone; upsert vivo SIN
   `revived` con tombstone presente → sigue borrada (anti-resurrección correcta); **un tombstone
   OBSOLETO que llega después de un revive confirmado vuelve a borrar la fila** (#7 de la tabla:
   decisión de producto abierta, no corregida en esta fase).

**Invariantes.** Aprobadas: la marca válida no desaparece por un guardado/ciclo obsoleto de otra
pestaña (#1, #2, #3); una marca consumida no revive por una copia antigua (#2, #4); el estado de
borrado de A nunca se atribuye a B/visitante (#5, #6, #7); una respuesta asíncrona de un propietario
anterior no modifica el estado del actual (#6); las transiciones `pending`/`known`/`revive` conservan
su semántica (#2, #4, #8) y las marcas `known` de un tombstone ajeno se recuerdan sin marca previa
(#6); un borrado válido no se pierde antes de llegar a la nube (#8); visitante/offline sigue sin
depender de Supabase (#7); el resto del progreso, los snapshots y las claves preexistentes se
conservan (tab-slots, tab-merge y #7). **No verificada:** «una tarjeta revivida no vuelve a borrarse
por una marca obsoleta» en el caso extremo de una marca `pending` en vuelo (#7): el servidor no
ordena los tombstones y cerrarla exige una decisión funcional (ver limitaciones).

**Limitaciones declaradas (abiertas).** (1) Decisión de producto pendiente: cuando una pestaña tiene
la marca `pending` (borrado aún no entregado) y otra/dispositivo confirma el `revive` de esa misma
tarjeta, hoy gana el borrado que llega después; opciones: descartar la marca `pending` cuando el pull
ve la fila viva y sin cambio local, o exigir en el servidor una marca de recencia para los tombstones
(cambio de esquema, fuera de esta fase). (2) `progressSyncClears` (recursos) sigue con
lectura-fresca+escritura sin fusión y sin marca de estado: la ventana residual es de una sola
sentencia (caracterizada con prueba, sin escritura diferida en el ciclo). (3) `applySrsClear` es
lectura-modifica-escritura del mapa compartido sin lock entre procesos: la ventana entre leer y
escribir sigue existiendo (varias pestañas escribiendo transiciones en el mismo microsegundo).
(4) El arnés de mocks es de un solo proceso: no reproduce el interleaving físico entre procesos del
navegador (sí el orden y las escrituras obsoletas). (5) Lock de transición retenido por pestaña
congelada: sin timeout (decisión de producto de 8.5.12/8.5.13, sin cambios aquí). (6) Las ventanas
de carrera de #3/#4/#6 se forzaron reteniendo o retrasando la RPC en la pestaña, no con dos
dispositivos físicos ni con latencia real de red. (7) Siguen abiertos de fases anteriores: política
de revive con nivel mayor, valoraciones perdidas antes del tombstone, tombstones en el cupo de 500
sin paginación, ausencia de CI y **00008 sin aplicar en remoto**.

### 8.5.9 — Interfaz de borrado de tarjetas SRS (IMPLEMENTADA y VERIFICADA, 13-10-2026)

**Alcance:** dar un llamador real a `dropSrs()` desde la interfaz existente. Sin Modo
Estudio, sin CI, sin SEO, sin cambios en `00008` ni en la lógica central de sincronización.
Sin commit/push/deploy ni migraciones remotas. Decisión de producto tomada con el código
real: la acción vive en la **lista de revisión del resultado del test**
(`renderResult` en `js/tests.js`), que es el único sitio de la app que lista las tarjetas
SRS del usuario (el índice solo muestra un contador de repasos).

**Comportamiento añadido (mínimo, sin duplicar lógica):**
- `srsDropHtml(testId, origIndex)`: fila con la acción «Quitar del repaso»
  (`btn btn-sm btn-danger`, icono + texto) y una región `role="status"`. Solo se pinta si
  la pregunta tiene identidad estable; el botón queda `hidden` cuando **no existe tarjeta**
  (nada que quitar) y aparece al crearla o revivirla.
- `openSrsDropConfirm(...)`: confirmación con el `SMR.modal` del design system (foco
  atrapado, Escape, cierre por overlay, `aria-labelledby` con el título) que **nombra la
  pregunta real** para no borrar la tarjeta equivocada. «Cancelar» no toca nada. El botón de
  confirmar se deshabilita al pulsarlo y usa `{ once: true }`: varios clics = un único
  borrado.
- Al confirmar: `progress().dropSrs(testId, origIndex)` — el contrato real, sin manipular
  tombstones ni el SRS desde la UI — y refresco local: la acción desaparece, el rate vuelve a
  «sin valorar» (re-valorar es el revive explícito) y se muestra un mensaje honesto:
  «Quitada del repaso en este dispositivo.» (visitante) o «Quitada del repaso. Se
  sincronizará con tu cuenta.» (con sesión). **Nunca promete borrado remoto inmediato.**
- Si `dropSrs` falla: mensaje de error, la acción se rehabilita (reintentable) y **no se
  simula éxito**; cero llamadas a Supabase desde la UI (la propagación sigue siendo
  responsabilidad de `cloud-progress`).

**Archivos:** modificados `js/tests.js` (`srsDropHtml`, `srsCardTitle`,
`srsDropConfirmHtml`, `openSrsDropConfirm`, `syncSrsDrop`, `setSrsDropStatus`, `wireSrsDrop`
+ integración en `renderResult` y refresco de la acción al re-valorar) y `css/app.css`
(`.srs-drop-row`, `.srs-drop-status`); nuevo `tests/srs-drop-ui.test.js`; ampliado el
arnés de `tests/srs-rate-ui.test.js` (extrae `syncSrsDrop`, que `wireSrsRating` usa ahora).

**Pruebas ejecutadas (todas exit 0):** `node --check js/tests.js`; `node
tests/srs-drop-ui.test.js` **10/10** (mocks DOM + `SMR.modal` simulado: visibilidad solo con
 tarjeta, cancelar sin efecto, borrado de la tarjeta correcta y no de otras, refresco,
 doble confirmación = un borrado, error sin falso éxito, revive, y comprobaciones estáticas
 de que la UI no toca tombstones/propietario); su auto-verificación
 `SRS_DROP_SELFTEST=1` sale **exit 1** (la suite puede fallar y propaga el código);
 `node tests/srs-rate-ui.test.js` 5/5; `node tests/srs-delete.test.js` 11/11;
 `node tests/srs-sync.test.js` 21/21; `node tests/h1-race.test.js` 15/15;
 `bash tests/pg-srs-delete.sh` 18/18 y `bash tests/pg-local-concurrency.sh` 13/13
 (PostgreSQL real del staging local).

**Navegador real (origen limpio 127.0.0.1:8097, una sola instancia):**
- Visitante: la acción se pinta `hidden` en las 5 tarjetas sin valorar; al valorar aparece
  solo en esa; confirmación con el texto real de la pregunta; Cancelar deja todo igual y
  Escape cierra el modal; al confirmar la tarjeta desaparece, la acción se oculta, el rate se
  limpia, el mensaje es el de visitante y `progressSyncSrsClears` queda en `pending` con
  **0 peticiones a Supabase**. Tras recargar: la marca sobrevive y la tarjeta no vuelve;
  re-valorar ese mismo identificador la revive (`pending` → `revive`) sin peticiones.
- Autenticado (cuenta efímera `audit859@local.test`, alta por el mismo cliente que usa la
  UI, borrada al terminar): valorar desde la UI sube las tarjetas por la RPC real; borrar
  desde la UI (dos tarjetas distintas) deja en PostgreSQL `deleted_at` no nulo **solo en esa
  fila y del uid de la sesión** (las otras tres siguen vivas), el mensaje es el de cuenta y,
  tras recargar, la marca pasa a `known`, la tarjeta no reaparece y la sesión sigue. Sin
  errores de consola atribuibles al borrado. Estado final: 0 tarjetas y solo las cuentas
  preexistentes `a@staging.test`/`b@staging.test` en la BD local.

**Limitaciones:** (1) la UI no conoce ni promete el resultado remoto: con sesión el mensaje
avisa de la sincronización, que puede quedar `pending` hasta el siguiente ciclo; (2) revive
mantiene la política de nivel mayor; (3) valorar antes de recibir el tombstone pierde esa
valoración; (4) tombstones ocupan cupo del límite de 500 y no hay paginación; (5) no hay CI;
(6) **00008 sigue sin aplicar en ningún backend remoto** (orden obligatorio: SQL primero,
JS después; sin la migración el push falla sin perder nada local); (7) el problema
multi-instancia de 8.4.5/8.4.5.1 sigue **abierto** (no se corrigió aquí); (8) el arnés de
las suites de UI es un DOM mínimo simulado, no un DOM real: el DOM real se comprobó en
navegador.

### 8.5.8 — Auditoría independiente de 8.5.7 (AUDITADA + 1 DEFECTO CORREGIDO, 13-10-2026)

**Alcance:** auditar el borrado SRS autenticado de 8.5.7. Sin UI de borrado, sin Modo
Estudio, sin CI, sin commit/push/deploy, sin migraciones remotas, sin `supabase db reset`.
Una única edición de código en esta fase (el defecto D-1, una condición en
`js/cloud-progress.js`); el resto fue verificación y documentación.

**Estado Git:** idéntico al final de 8.5.7 — rama `main`, HEAD `1f6f2475`
(`...origin/main`), M = `index.html`, `js/cloud-config.js`, `js/cloud-profile.js`,
`js/cloud-progress.js`, `js/tests.js`; ?? = docs raíz, `supabase/migrations/00005..00008`,
`tests/`, `.claude/`. `js/srs.js`, `js/questions.js` y `js/data.js` NO están modificados
vs HEAD (evidencia directa de que la identidad estable de preguntas y el algoritmo SRS
siguen intactos). Sin commit, sin push, sin deploy, sin migraciones remotas.

**Defecto D-1 (P1, CORREGIDO): al iniciar sesión sobre un slot vivo vacío se perdía el
snapshot del dueño.**
- Causa: la restauración del snapshot al entrar una cuenta estaba condicionada a
  «hubo cuenta previa» o «el slot vivo tiene contenido». El logout deja el slot vivo
  vacío (tras archivar bajo el dueño), así que al volver a entrar la condición era falsa:
  no se restauraba el snapshot y el estado local no subido (p. ej. una marca
  `progressSyncSrsClears: pending`) se perdía; el pull reconstruía solo el estado cloud y
  la tarjeta borrada RESUCITABA en local.
- Corrección (una línea, con comentario en el código):
  `if (!canAdoptGuest) restoreSlotFor(nextOwner);` — se restaura SIEMPRE el snapshot del
  dueño (o slot limpio si no tiene snapshot; `restoreSlotFor` ya lo escribe). No afecta a
  la adopción de visitante (`canAdoptGuest`) ni al archivado previo del contenido guest.
- Verificado en navegador real antes/después: antes, la marca `pending` desaparecía al
  reentrar y la tarjeta volvía; después, la marca sobrevive a la recarga y el tombstone
  llega a la BD (fila `deleted_at` no nulo del uid de esa cuenta).

**Auditoría de los 10 puntos (resultado):**
1. `dropSrs()` marca `pending` en el slot y la marca sobrevive a recarga — OK (código +
   `tests/srs-delete.test.js` + navegador real).
2. Aislamiento por propietario — OK: `progressSyncSrsClears` está en `SLOT_KEYS`, así que
   hereda slot por dueño, cuarentena y `withSlotTransitionLock`; en la carrera deliberada
   (A borra y cierra sesión sin esperar al push → entra B) la escritura no cruzó de cuenta
   y la marca se recuperó al volver A (verificado también en la BD).
3. Orden pull → merge → push — OK (`syncSrsCards`: pull con `deleted_at`, merge 2a/2b,
   push RPC al final; guardas `sessionChangedFor`/`dataRefAtStart` entre fases).
4. Un tombstone impide que la fila antigua se reinstale — OK (merge 2a retira la copia
   local; el bucle de claves con `pending`/`known` no reinstala filas vivas).
5. `deleted_at` no se limpia por una sincronización normal — OK (SQL: pegajoso; solo
   `revived:true` del propietario lo limpia; caso del suite PostgreSQL).
6. Revive explícito — OK (política documentada de nivel mayor; probado en PostgreSQL real).
7. Restricciones y RLS preservadas — OK: `00008` solo hace `add column if not exists` +
   `create or replace function`; en la BD local siguen las 4 políticas `*_own` de 00001,
   `srs_cards_level_range`, PK `(user_id, question_key)` y FK `ON DELETE CASCADE`.
8. Límites/paginación — OK: el pull usa `limit(500)` sin paginación, pero un borrado no
   puede reaparecer por eso, porque la marca local (`pending`/`known`) bloquea la
   reinstalación independientemente de la ventana; el límite ya era conocido (8.5.7) y
   sigue sin resolverse que más de 500 tarjetas no se paginen.
9. Errores de red y reintentos idempotentes — OK: con error de RPC las marcas NO se
   borran (se reintenta en el ciclo siguiente), sin fallback LWW, y el tombstone es
   idempotente server-side (sella `deleted_at` con su reloj y conserva la última tarjeta
   real). Diagnóstico permanente si `merge_srs_cards` no existe en el backend.
10. Identidad SRS y algoritmo de calificación — OK: `js/srs.js`, `js/questions.js` y
    `js/data.js` sin modificar; `js/tests.js` solo añade la UI de valoración (8.5.4-C),
    que llama al `scheduleSrs` existente sin cambiar niveles ni política.

**Limitación de «valorar antes de recibir el tombstone» — analizada:** escenario, el
dispositivo B valora la tarjeta X mientras A ya la borró (o al revés) y B todavía no ha
visto el tombstone; al sincronizar, el pull trae el tombstone y retira la copia local de B
antes del push, así que esa valoración no se propaga (a lo sumo queda el nivel en la fila
como base del revive). Impacto: bajo (carrera entre dispositivos, sin corrupción, sin
aislamiento roto, sin resurrección y sin pérdida de la intención de borrado). **No exige
corrección antes de producción**: resolverlo bien («¿una valoración más reciente gana a un
borrado?») es una decisión de producto, no un defecto de implementación, y se implementaría
como revive automático al detectar que la tarjeta local es posterior al `deleted_at`.

**Hallazgo de entorno (no es defecto de producto):** durante la auditoría, la segunda
instancia viva del mismo origen en la pestaña Preview (countdowns de `storage` entre
pestañas) pisó el archivado del slot y produjo una pérdida de estado local reproducible
solo en ese escenario multi-pestaña; en un origen limpio con una sola instancia el flujo es
correcto. La coordinación multi-pestaña ya está documentada como limitación de 8.4.5/8.4.5.1;
se registra aquí con su reproducción y no se toca en esta fase.

**Pruebas de esta auditoría (todas exit 0):** `node --check js/cloud-progress.js`;
`node tests/srs-rate-ui.test.js` 5/5; `node tests/srs-sync.test.js` 21/21;
`node tests/h1-race.test.js` 15/15; `node tests/srs-delete.test.js` 11/11 (mocks con RPC
replicada); `bash tests/pg-srs-delete.sh` 18/18 (PostgreSQL real) y
`bash tests/pg-local-concurrency.sh` 13/13 (PostgreSQL real). E2E autenticado real con
TRES cuentas de prueba efímeras en el staging local (`audit858a/b/c@local.test`, alta por el
mismo cliente que usa la UI, borradas al terminar): A crea y borra X (tombstone en BD), A
recarga y X no reaparece, A sincroniza otra tarjeta (Y) correctamente, B no ve ni puede
borrar la tarjeta de A (RLS: el borrado de B sobre la clave de A afecta solo a su propia
fila; comprobado en BD), B sincroniza su propia tarjeta, y la carrera de cambio de sesión
no cruzó datos. Comprobado también el transporte real: la caché viva de PostgREST expone
`srs_cards.deleted_at`.

**Limitaciones que permanecen:** (1) revive mantiene la política de nivel mayor;
(2) valorar antes de ver el tombstone pierde esa valoración; (3) tombstones ocupan cupo del
límite de 500 y no hay paginación; (4) sigue sin haber llamador UI de `dropSrs`;
(5) 00008 sin aplicar en remoto (orden: primero SQL, después JS); (6) la pérdida de estado
local en el caso multi-pestaña sigue abierta (documentada, no corregida).

**Recomendación:** la ruta autenticada del borrado SRS queda validada (RPC real, RLS real,
aislamiento real y persistencia real del tombstone), con las limitaciones anteriores. Puede
pasarse a implementar la UI de borrado, respetando el orden de despliegue (SQL antes que JS)
y sin mezclar esa fase con Modo Estudio, CI o SEO.

### 8.5.0 — Diseño técnico

El informe entregado declara `DISEÑO LISTO PARA IMPLEMENTAR`, con STOP respetado. No hubo cambios de código en esa fase.

Propuesta de diseño:
- Reutilizar `srs_cards` existente; no crear tabla nueva por defecto.
- Sync SRS como estado por tarjeta (no evento append-only).
- Upsert por `(user_id, question_key)`, pull por UID y mezcla determinista local/cloud.
- Reutilizar guards/colas/lock/serialización de 8.4.x.
- No usar la RPC `sync_progress_chunk` si la constraint de tablas no incluye SRS.
- Mantener la sincronización SRS desactivada para visitantes; el modo local/offline debe seguir igual.
- Añadir pruebas específicas de mezcla, órdenes cruzadas, sesiones cambiantes, desconexión, orphans y aislamiento entre UID.
- El diseño contempla tarjetas remotas cuya pregunta ya no existe localmente; no deben asignarse a otra pregunta ni borrarse sin criterio.

### Decisiones pendientes — NO inventar la respuesta

**Decisión A: `last_reviewed_at`**
- El informe lo propone solo si existe una necesidad real de UI/analítica.
- Recomendación inicial prudente: no añadirlo en la primera implementación, salvo que una inspección del código y un requisito confirmado demuestren que hace falta. No añadir migración por especulación.

**Decisión B: propagación de `dropSrs()` al cloud**
- El informe detecta un problema real: si se borra una tarjeta solo localmente, el registro remoto podría reaparecer en el siguiente pull.
- No adoptar a ciegas ni un DELETE remoto ni un flag nuevo. Primero inspeccionar semántica actual de `dropSrs()`, todos sus llamadores, si significa “borrar tarjeta” o solo “limpiar estado”, y los patrones de borrado de datos existentes.
- Después proponer opciones con consecuencias y pruebas; pedir aprobación del usuario antes de elegir el comportamiento remoto o introducir un cambio de esquema.
- No empezar una implementación completa de 8.5.2 hasta resolver esta decisión si afecta a la semántica de sincronización.
- **RESUELTA en 8.5.7 (13-10-2026):** tombstones server-side (`deleted_at` pegajoso) +
marcas de slot en el cliente + revive explícito; sin DELETE remoto y sin el sentinel
inválido. Ver la sección 8.5.7 de este archivo y el informe de esa fase.

### Plan sugerido del informe 8.5.0

- 8.5.1 — esquema solo si una decisión aprobada requiere cambio real; de lo contrario, omitir la fase de esquema.
- 8.5.2 — adaptador SRS: push/pull, cola por UID y reglas de mezcla.
- 8.5.3 — integración con ciclo de autenticación y guards.
- 8.5.4 — pruebas de conflictos entre dos dispositivos/sesiones.
- 8.5.5 — regresión de todas las suites pertinentes.
- 8.5.6 — auditoría independiente final.

Estas subfases son un plan, no autorización para ejecutar todas de golpe. Implementar solo una subfase por encargo, con STOP al final.

### Precaución sobre conflicto de datos

El informe propone mezcla por campo (nivel máximo y vencimiento según nivel/timestamp) y menciona una ventana de 60 segundos. Es una propuesta, no una verdad demostrada. Antes de implementarla, convertirla en reglas inequívocas y testables con casos de ejemplo, especialmente cuando el nivel más alto y el vencimiento más lejano procedan de dispositivos distintos. No introducir una regla que retrase injustificadamente repasos ni borrar progreso con LWW ciego.

## 8. Próximos pasos sugeridos

1. Abrir el repo en VS Code y revisar los archivos de contexto.
2. Ejecutar una fase de **inspección/diseño de decisiones pendientes**, no editar inmediatamente:
   - confirmar estado Git y diffs;
   - revisar `dropSrs()` y todos sus llamadores;
   - presentar opciones para borrar/retirar una tarjeta en la nube;
   - definir casos de conflicto local/cloud con ejemplos;
   - confirmar si `last_reviewed_at` tiene un consumidor real.
3. Con la respuesta/decisiones del usuario, iniciar 8.5.2 (o una 8.5.1 solo si de verdad se necesita esquema), en un cambio acotado.
4. Probar con datos mock/locales primero. Staging real solo si ya está configurado y autorizado; nunca producción.
5. Ejecutar regresiones pertinentes y auditar aislamiento de usuario, modo visitante/offline, migración v4 e IDs SRS.
6. STOP y reportar cambios, archivos, tests exactos, limitaciones y Git status. No encadenar la siguiente fase automáticamente.

**Actualización 13-10-2026 (8.5.7):** el punto 2 (inspección de `dropSrs()` y propuesta de
borrado) y la decisión B están resueltos e implementados en 8.5.7. Lo que queda de esa
lista: confirmar si `last_reviewed_at` tiene consumidor real (sigue sin añadirse) y abrir la
fase siguiente solo si el usuario la encarga.

**Actualización 13-10-2026 (8.5.10):** el borrado ya está también en el repaso SRS, con avance
determinista. La auditoría de integración detectó un **defecto P1 abierto (D-3)**: al recargar
con la sesión restaurada se restaura un snapshot obsoleto del dueño y una marca `pending`
vieja puede re-borrar en el cloud una tarjeta revivida (reproducción y evidencia en la
sección 8.5.10). Requiere fase propia antes de aplicar 00008 en remoto. **Atendido:** la fase
8.5.11 lo corrige con el dueño del slot vivo persistido (ver sección 8.5.11).

**Actualización 13-10-2026 (8.5.9):** la lista de `dropSrs()` (punto 2 de esta lista) ya
tiene llamador real: la acción «Quitar del repaso» de la lista de revisión, con confirmación
y refresco local. Ver la sección 8.5.9. Siguen abiertos: `last_reviewed_at`, paginación del
pull, Modo Estudio, CI, multi-pestaña y el despliegue de 00008 en remoto.

**Actualización 13-10-2026 (8.5.8):** auditados los 10 puntos del borrado SRS y verificada
la ruta autenticada real (RPC + RLS + aislamiento + persistencia del tombstone). Corregido
un defecto P1 de la sincronización de slots (D-1: al entrar sobre un slot vivo vacío no se
restauraba el snapshot del dueño y la tarjeta borrada resucitaba). Pendientes que siguen
abiertos: `last_reviewed_at`, UI de `dropSrs`, paginación del pull, Modo Estudio, CI y la
pérdida de estado local en multi-pestaña. Ver la sección 8.5.8.

**Actualización 13-10-2026 (8.5.12):** atendido el problema multi-instancia de 8.4.5/8.4.5.1
sobre la propiedad del slot vivo (D-4): el marcador persistido `smrhub:liveOwner` pasa a ser la
autoridad de propiedad entre pestañas, la copia en memoria de una pestaña pasiva converge al
slot vivo y un lock rechazado ya no pierde la transición. Reproducido y corregido con DOS
pestañas reales + Supabase/PostgreSQL locales, y suite nueva `tests/tab-slots.test.js` 10/10 que
falla contra el módulo pre-fix. Sigue abierto el merge de dos copias vivas (el `save()` de una
pestaña escribe el objeto completo en el slot compartido) y siguen pendientes `last_reviewed_at`,
paginación del pull, Modo Estudio, CI y el despliegue de 00008 en remoto. Ver la sección 8.5.12.

## 9. Formato obligatorio del informe de cada fase

- Fase y objetivo.
- Estado Git inicial y final (rama, HEAD, archivos M/??); diffs relevantes.
- Archivos realmente inspeccionados/modificados.
- Decisiones tomadas y decisiones pendientes.
- Tests ejecutados con comandos y resultados exactos; distinguir mocks de pruebas reales.
- Regresión de localStorage, visitante/offline, SRS IDs y aislamiento UID.
- Riesgos/limitaciones conocidos.
- Veredicto explícito: `APROBADO`, `APROBADO CON LIMITACIONES`, `BLOQUEADO` o `DISEÑO INCOMPLETO`.
- `STOP`: no iniciar la fase siguiente, no commit/push/deploy ni migraciones remotas sin autorización.

## 10. Nota de actualización

Este archivo es una memoria de proyecto, no una fuente de verdad superior al repositorio. Si el código contradice este documento, detenerse, informar de la discrepancia y actualizar el contexto después de confirmar la decisión. No copiar secretos, tokens, contraseñas, claves privadas ni credenciales a este archivo.

# SMR Hub — contexto para continuar el proyecto

## ESTADO CANÓNICO ACTUAL — auditado 2026-10-31 — commit b0ad8b237f970a04936f06c1177a4272bc412ee0

Esta sección y las siguientes describen la copia local auditada. Sustituyen las antiguas listas de “fase actual 8.5” y de pendientes acumulados. Código > tests actuales > ejecución > configuración > esquema > Git > documentos. Una funcionalidad presente en el cliente no demuestra que su backend esté desplegado.

### Resumen canónico A–O

| Punto | Estado actual |
| --- | --- |
| A. Commit | `b0ad8b237f970a04936f06c1177a4272bc412ee0`, `main`, mensaje `feat(study): añadir estudio por temas canónicos`. `origin/main` local coincide; no se hizo fetch ni se certificó el remoto vivo. |
| B. Arquitectura | SPA estática de scripts clásicos, globals compartidos, 17 rutas, datos educativos locales, progreso local-first y adaptadores Supabase. |
| C. Completo en el alcance del cliente | Modo Estudio v1, recursos publicados, glosario, casos, navegación/routing, exportación imprimible y SEO P1 técnico. Tests evaluados disponibles con defectos concretos abajo. |
| D. Parcial | Ciclo de cuenta, restauración cloud de algunos dominios, currículo, tabla de puertos y algunas métricas. No declarar todo “cloud completo”. |
| E. Ausente | Eliminación de cuenta, cambio de contraseña desde perfil, exportación/importación JSON en UI, reanudación/cola persistida de estudio, CI versionada, monetización y analítica de uso integrada. |
| F. Defectos reproducibles | Historial multi-pestaña pierde intentos; cambio directo de UID no anuncia la nueva cuenta; examen colorea corrección antes del final; adaptativo reinicia su racha. |
| G. Límites aceptados del diseño | localStorage sin transacción entre procesos/claves; límites de ventanas; lock sin timeout; conflictos SRS por nivel máximo y borrados tardíos. |
| H. Cloud | Nueve migraciones y 17 tablas versionadas, RPC/RLS inspeccionadas. Aplicación actual en BD local o producción: no certificada. Staging antiguo: solo evidencia histórica. |
| I. PWA | SW v5, caché por montaje, 32 entradas de precache; arranque y estudio offline después de calentamiento. Configuración pública excluida de caché. |
| J. SEO | Cuatro HTML generados, seis URLs de sitemap; metadata SPA por ruta. Sin evidencia actual de Search Console/indexación o rendimiento público. P2 SEO no iniciado aquí. |
| K. Contenido | 154 preguntas, siete tests/categorías, 19 recursos, 51 términos, 55 temas, seis casos, cuatro rutas, 19 currículos y 227 instancias de módulos. 51 incidencias de contenido registradas; cero puertos. |
| L. Validación | 29 suites versionadas/475 checks aprobados; 60 JS pasan sintaxis; generador SEO consistente. Navegador y diagnósticos históricos detallados en §9. |
| M. Prioridades | P0 no observado dentro del alcance; P1 retención/propiedad y restauración cloud de errores; P2 motor de tests/contenido/semántica; P3 documentación auxiliar/API sin uso. |
| N. Deuda | Fixtures de historial con forma equivocada, arneses históricos obsoletos, extracción literal de funciones en tests, SDK CDN sin versión exacta, ausencia de CI. |
| O. Orden recomendado | Corregir P1 → verificar/completar roundtrip cloud → corregir examen/adaptativo → automatizar regresión segura → decidir cuenta y contenido. Detalle en ROADMAP. |

### Procedencia y límites de esta auditoría

Preflight ejecutado: `git status --short --branch`, `git log -1 --oneline`, `git rev-parse HEAD`, `git rev-parse origin/main`, `git diff --stat`.

Estado inicial: `## main...origin/main`, sin diferencias rastreadas. No rastreados preservados: `.claude/`, `.playwright-cli/`, `SMR_HUB_ESTADO_2026-10-26.md`, `SMR_HUB_GRAFO.graphify.json`, `SMR_HUB_GRAFO_2026-10-26.graphify.json`, `SMR_HUB_SELECTORES_2026-10-26.md`.

Solo se actualizaron este archivo y `SMR_HUB_ROADMAP.md`. No se ejecutaron commit, push, deploy, migraciones, cambios de producción ni operaciones Git de limpieza/restauración. No se crearon usuarios ni se enviaron comentarios. Las interacciones del navegador usaron un origen HTTP local y un perfil aislado con datos de prueba.

No se certifican Supabase real, entrega de correo, sesiones reales autenticadas, RLS ejecutada en PostgreSQL, dispositivos físicos, carga, auditoría de seguridad exhaustiva ni normativa académica vigente. No se consultó producción ni Search Console.

## 1. Reglas para la siguiente tarea

- Leer `AGENTS.md`, encargo, estado Git y código afectado antes de escribir. Conservar cambios y archivos ajenos.
- No inventar preguntas, recursos, currículos, equivalencias o relaciones. Los huecos se registran, no se rellenan por inferencia.
- Mantener visitante, localStorage, PWA/offline, progreso cloud, SRS y aislamiento por propietario.
- No alterar la identidad estable de preguntas ni copiar `SMR_DATA` a Supabase.
- Reutilizar contratos existentes; no añadir tablas/migraciones sin necesidad demostrada y autorización.
- No mezclar cambios de estudio con SEO, monetización o rediseño. La promoción ya comenzó según el encargo; sus resultados no están medidos aquí.
- Una fase termina con evidencias, límites, estado Git y STOP. No encadenar implementaciones, publicaciones ni migraciones por leer este roadmap.
- No almacenar secretos, tokens o credenciales en documentación. La clave pública del cliente no sustituye RLS.

## 2. Inventario y arquitectura

107 archivos rastreados al iniciar: seis HTML, cuatro CSS, 25 scripts en `js/`, una Pages Function, un SW, un manifest, un generador, nueve migraciones y las pruebas/documentos auxiliares. No hay package.json, bundler, node_modules versionado ni flujo CI versionado. `scratch_*`, `backup_6c/` y herramientas locales ignoradas son material histórico, no entradas de la aplicación.

| Área / archivos | Responsabilidad real |
| --- | --- |
| `index.html`, `tests.html`, `glosario.html`, `recursos/subnetting.html` | Shell compartida y cuatro landings con contenido inicial generado. |
| `404.html`, `_redirects` | Fallback del mirror y reglas de Cloudflare; `404.html` sí está versionado. |
| `googlecc9830d2dfa72d57.html` | Archivo de verificación Google; no acredita indexación ni propiedad actual de Search Console. |
| `css/style.css`, `app.css`, `phase7.css`, `print.css` | Diseño, componentes, adaptación responsive e impresión A4. |
| `js/data.js` | Catálogos base, currículos y estructuras educativas. |
| `js/content.js`, `questions.js` | Publicación/enriquecimiento de recursos, glosario, casos, rutas y banco de preguntas; registro de huecos. |
| `js/srs.js` | Índice estable de preguntas, resolución y migración de progreso v4. |
| `js/curriculum.js`, `profile.js` | Índice curricular y selección académica local validada; Mi SMR. |
| `js/topics.js`, `questionTopics.js` | Taxonomía y asociación pregunta–tema, consumidas por estudio. |
| `js/contentTopics.js`, `moduleTopics.js` | Relaciones derivadas y equivalencias disponibles para diagnóstico; no cargadas en la UI actual. |
| `js/tests.js` | Selección, motor evaluado, resultados, SRS UI, estudio libre y API de repaso para dashboard. |
| `js/app.js` | Store, progreso, vistas, guiado, modales, búsqueda, paleta, navegación y arranque PWA. |
| `js/dashboard.js`, `tools.js`, `pdf-export.js` | Dashboard, nueve superficies de herramientas y generación imprimible. |
| `js/routing.js`, `seo-content.js` | Contrato de rutas compartido con SW y HTML SEO público. |
| `js/offline-store.js`, `sw.js`, `manifest.json` | Indicador de trabajo offline en IndexedDB, cachés y PWA. |
| `js/cloud-config.public.js`, `cloud-config.js`, `supabase.js` | Ranura manual de config, fallback local y cliente SDK compartido. |
| `functions/js/cloud-config.public.js` | Endpoint `/js/cloud-config.public` que inyecta dos variables públicas con no-store. |
| `js/auth.js`, `cloud-profile.js`, `cloud-progress.js`, `cloud-feedback.js` | Autenticación, perfil, slots/colas/sync y envíos explícitos por RPC. |
| `scripts/build-seo.js`, `robots.txt`, `sitemap.xml` | Generación/validación de landings y descubrimiento técnico. |
| `supabase/config.toml`, `supabase/migrations/` | Configuración de desarrollo y contrato SQL; no evidencia de despliegue. |
| `tests/` | 29 suites Node, un navegador real, dos helpers, baseline y cinco scripts shell incluido runner. |
| Assets | `assets/brand/SMR.png` (512), `icon-192.png`, `favicon.png`. Iconos restantes se generan como SVG inline. |

Carga real: primero `routing.js` mediante bloque inline; scripts defer educativos en orden `data → curriculum → content → questions → seo-content → srs → topics → questionTopics → tools → tests → pdf-export → dashboard → profile → offline-store → app`; después SDK Supabase CDN, fallback config, cliente, auth y adaptadores. Son 22 etiquetas defer, incluida la externa. La configuración pública se solicita síncronamente mediante `document.write` antes de ejecutar los defer; no es un script defer entre SDK y fallback como sugiere DESPLIEGUE.

Los globals son `SMR_DATA`, `SMR`, `SMR_TESTS` y `SMR_TOOLS`. Hay dependencias diferidas app ↔ tests/tools/profile, no imports ES entre estos scripts. Las capas enriquecen datos antes de construir el índice SRS. La Function sí usa export de módulo. No convertir este mapa en una reescritura de arquitectura.

## 3. Producto e inventario funcional

| Superficie | Estado y comportamiento comprobado |
| --- | --- |
| Inicio | COMPLETA en cliente: contenido público, accesos, recomendaciones derivadas y tarjetas de progreso; visitante no necesita cuenta. Widget auth separado. |
| Tests | PARCIAL por defectos §8: siete bancos; práctica, rápido, completo, examen simple/general multi-banco, errores, SRS y adaptativo; revisión, explicaciones, recomendaciones y resultados. |
| Modo Estudio v1 | COMPLETA en su alcance: cinco fuentes, guiado separado, revelado, recurso válido, rating opcional, finalización e integración de métricas. §4. |
| Recursos | COMPLETA para 19 publicados: búsqueda, categoría, nivel, favoritos, modal, vistos, completado y autoevaluación. Hay categorías sin recursos y relaciones pendientes declaradas. |
| Glosario | COMPLETA para 51 términos: búsqueda, categorías/letras, favoritos y relaciones heurísticas con recursos; HTML inicial y enriquecimiento SPA. Estas relaciones no son el mapping canónico contentTopics. |
| Casos prácticos | COMPLETA para seis casos: tres decisiones por caso, feedback publicado y solución local en `cases.solved[caseId]={option,ts}`; elegir una opción registra resolución, no una nota de test. Sync por case_solutions. |
| Rutas de aprendizaje | PARCIAL en contenido: cuatro secuencias, 19 pasos declarados, 12 con recurso y siete pendientes visibles. Avance derivado de recursos completados, sin tabla propia de rutas. |
| Currículo / Mi SMR | PARCIAL académico: catálogo de 19 territorios, selector comunidad/curso/año, estados/fuentes y módulos. No filtra el estudio por módulo oficial. |
| Dashboard | COMPLETA como vista derivada, con límites de métricas §5: maestría por banco, hábitos y repaso inteligente vencidas→errores; selección máxima por defecto 20, orden conservado. |
| Estadísticas | Vista disponible con tests, recursos, errores, sesiones, minutos, actividad y racha. Estudio sin tests también activa la vista. Ventanas y defecto de historial afectan sus cifras. |
| Perfil | COMPLETA selección académica local; adaptador cloud presente y protegido por token de slot. No es un gestor completo de identidad/cuenta. |
| Exportar examen | COMPLETA generación HTML imprimible A4 mediante window.print; tema raw, banco, cantidad hasta 100, nombre opcional y soluciones. No genera bytes PDF por sí misma. El usuario guarda desde el diálogo del navegador. |
| JSON | NO EXISTE exportación/importación de progreso en UI/API específica; serializar localStorage internamente no equivale a esta función. |
| Comentarios / reportes | Implementados en UI y RPC, solo cuenta y red, sin cola automática. Comentarios en configuración; reportes ligados a ID estable en tests. No hay bandeja de administración/respuesta implementada. |
| Monetización / analítica | No hay flujo de anuncios, cobros o telemetría de uso integrado; `entitlements` en SQL no es un producto de pago. |

Herramientas reales de `SMR_TOOLS`:

| Ruta query `tool=` | Función / estado |
| --- | --- |
| subredes | Calculadora IPv4/CIDR: red, broadcast, máscara, wildcard, hosts y explicación de pasos; verificada con cálculo real. |
| tabla-subredes | División de una red con nuevo prefijo; UI y lógica local presentes. |
| vlsm | Reparto por necesidades de hosts; UI y lógica local presentes. |
| chmod | Permisos octales/simbólicos, bits especiales; cubierta por tools-calc. |
| raid | Capacidad/paridad/tolerancia de RAID 0/1/5/6/10; cubierta por tools-calc. |
| conversor | Decimal/binario/hexadecimal/octal, cálculo local. |
| unidades | Bytes y múltiplos decimales/binarios, cálculo local. |
| contrasenas | Generador local y copia al portapapeles; requiere las APIs del navegador, sin envío cloud propio. |
| puertos | PARCIAL: búsqueda y filtros implementados, `SMR_DATA.ports=[]`. En navegador muestra “0 de 0 puertos / No hay datos de puertos disponibles”. |

Las ocho herramientas con entradas/datos no tienen todas una batería numérica exhaustiva; tools-calc comprueba chmod y RAID. No describir la tabla de puertos como catálogo poblado.

## 4. Modo Estudio v1: contrato vigente

### Estudiar preguntas

Entrada principal de `/estudio`: `SMR_TESTS.renderStudy`. Selector nativo único con Todas, grupos Por categoría y Por tema, Errores y SRS pendientes. No combina categoría+tema+errores. 54 temas con preguntas se ofrecen con contador; `t-diagnostico` no tiene preguntas y no se ofrece.

`studyCandidates(selection)` reutiliza `allCandidates()`: cada candidato conserva `{q,testId,origIndex,testTitle,category}`. Todas/categoría filtran ese banco; tema usa `SMR.questionsOfTopic` y `SMR.srs.idOf`; Errores usa `wrongRefs()`; SRS usa `dueSrs()`, ya ordenado por due más antiguo. Resuelve y deduplica por identidad estable. Las referencias huérfanas quedan en progreso pero no entran a la cola ni al contador utilizable.

Cola fija en memoria, sin reanudación, persistencia ni nueva tabla. Pregunta a pregunta: opciones informativas → Mostrar respuesta → respuesta correcta/explicación/recurso existente → rating SRS opcional → siguiente o finalizar. No hay respuesta evaluada ni nota. Una revelación cuenta una vez; una valoración efectiva por presentación. Solo el rating llama a `scheduleSrs`; revelar/avanzar no reprograman tarjetas.

Finalizar con al menos una revelación llama una vez a `recordStudySession(minutosRedondeados,preguntasReveladas)`; una sesión rápida puede tener cero minutos. Finalizar sin revelar no registra. Salir sin finalizar o navegar cancela la cola; los ratings ya hechos permanecen. No guarda una sesión automáticamente por abandonar o recargar.

Estudiar errores, revelar, valorar o finalizar NO elimina `tests.wrong` ni modifica `tests.best/last/history`. Limpiar errores requiere acertar en el flujo evaluado de tests. Errores/SRS vacíos muestran mensaje y no crean sesión ni escriben progreso. En ambos formatos de estudio, abrir un recurso registra viewed y sus acciones de completado/autoevaluación conservan el flujo normal del recurso.

Protecciones: `studySessionCurrent` captura contrato, token owner/generation y referencia `progress.data`; invalida handlers por sesión, índice, finalización, transición pendiente, dueño desconocido, sustitución de progreso o cambio de contrato. Visitante válido con token owner null o modo puramente local sin cloud. No reutilizar una cola entre propietarios.

Accesibilidad: labels nativos, foco al título/pregunta/respuesta/avance, status live y progressbar por revelaciones. Se comprobó móvil de 390 px sin overflow y foco en respuesta revelada. No se hizo auditoría WCAG completa ni prueba con lector de pantalla real.

### Sesión guiada

Se abre como opción secundaria y sigue en `app.js`: `buildStudyPlan/startStudy/renderStudyStep/finishStudy`. Duraciones 10/20/30/libre; prioriza recursos asociados a errores, autoevaluación baja y pendientes. Alterna mini explicación y pregunta usando `SMR_TESTS.studyQuestion`, con resumen final.

Conserva el candidato anidado `candidate.q`, evita repetir preguntas ya usadas y tiene las mismas guardas de propietario/datos. Responder aquí muestra corrección pero no registra test ni limpia errores; no ofrece rating SRS. Abrir/completar un recurso sí usa su progreso normal.

Finalizar o agotar el tiempo registra minutos reales y pasos avanzados; salir/navegar no registra sesión. “Pasos” del guiado y “preguntas reveladas” del libre comparten el campo steps; no permiten distinguir ambos formatos en cloud. No inferir métricas separadas de fuentes/temas a partir de ese campo.

## 5. Preguntas, tests, progreso y métricas

Identidad autoritativa: `SMR.srs.idOf(testId,origIndex)`, no un índice posicional persistido. `srs.js` combina dos hashes FNV-1a de 32 bits sobre testId + NUL + texto + opciones separadas por U+0001 + NUL + índice correcto. Forma `q-<16hex>`, sufijo de colisión si hace falta. No usa tema, dificultad, explicación, currículo ni relatedResource. Reordenar preguntas conserva identidad; editar enunciado/opciones/correcta la cambia y exige tratar progreso anterior.

Migración v4 idempotente: claves antiguas testId:qIndex → estables, respaldo progressBackupV3 y SRS no resoluble conservado en srsLegacy. Los errores legacy no resolubles tampoco deben eliminarse por filtrar una sesión.

En test evaluado, la elección se guarda en `session.answers`; al resultado `commitResults → recordTest` escribe porcentaje, last, historial, errores y actividad/racha. SRS requiere rating explícito. En sesiones multi agrupa por banco de origen: un examen puede generar varios intentos históricos. En simple el denominador es la cola completa, incluso preguntas sin responder; en multi el registro por banco usa las contestadas. No interpretar toda history como sesiones homogéneas.

Best cambia en práctica/completo/examen por nombre de modo, aunque el usuario haya elegido un subconjunto de preguntas o dificultad: un 1/1 puede producir best=100 para un banco de 27. Es semántica actual que requiere decisión antes de usarlo como dominio de todo el banco.

Tarjeta SRS local `{level,due}`, nivel 0–5; intervalos de días [1,1,3,7,14,30]. Rate 0 baja, 1 mantiene, 2 sube. En resultados se permite revalorar, incluida secuencia 2→0→2; en estudio libre solo una valoración por presentación. “Quitar del repaso” con confirmación existe en revisión final y repaso SRS evaluado; ajusta cola y resultado sin saltar tarjetas. No existe gestor independiente de todas las tarjetas.

Distintas métricas de “maestría”: `progress.masteryFor` combina recursos, autoevaluación, best y errores; `dashboard.calculateModuleMastery` usa fuerza SRS y penalización por errores. No son intercambiables ni acreditaciones curriculares. Dashboard llama “módulos” a los siete bancos de tests; en su nota dice “Lo sabía tras acertar”, pero el estudio libre permite ese rating sin evaluar acierto.

`calculateHabits.cardsToday` suma history.total de hoy, incluidas no contestadas en intentos simples; UI lo etiqueta “Preguntas de tests hoy / incluidas en intentos de hoy”. Accuracy suma correct/total de historial retenido. Estudio libre no entra a esas dos cifras; sí a sesiones/minutos/actividad/racha y, si valora, a maestría SRS. Estadísticas usa recursos completados para barras por categoría y distingue sesiones recientes de minutos acumulados.

## 6. Auth, cloud y almacenamiento

### Autenticación y cuentas

“COMPLETA” aquí califica el flujo del cliente respaldado por código/pruebas; correo, proveedores y backend real no fueron certificados en esta auditoría.

| Función | Clasificación | Evidencia y límite |
| --- | --- | --- |
| Registro | COMPLETA cliente | signUp, modal, validaciones básicas, errores, resultado con/sin sesión; regresión auth-recovery. Confirmación depende del proveedor. |
| Login | COMPLETA cliente | signInWithPassword, modal y errores; tests. |
| Logout | COMPLETA cliente | signOut scope local; conserva otras sesiones de dispositivos. Evento SDK decide limpieza; error libera botón y se registra en consola, sin aviso visible dedicado. |
| Restauración | COMPLETA cliente | getSession + suscripción antes de restaurar; INITIAL_SESSION; slots por propietario. No probado con JWT real hoy. |
| Perfil académico | COMPLETA cliente | UI, normalización y sync con awaitSlot/token; profile-owner. No edita email/display_name del usuario. |
| Cambio de cuenta | PARCIAL / DEFECTUOSA en A→B directo | Secuencia logout→login soportada y probada con mocks de slots; handleSession no anuncia B si A seguía en state.user. Defecto H2. |
| Protección cross-UID | PARCIAL extremo a extremo | Guards de datos/token/generación, dueño persistido, lock y RLS presentes; no asumir cobertura del evento auth que falta en H2. |
| Recuperación de contraseña | COMPLETA cliente | resetPasswordForEmail, PKCE, PASSWORD_RECOVERY, enlace fallido/caducado, updateUser y tests. Correo/redirect allowlist real sin comprobar. |
| Cambio de contraseña | PARCIAL | Existe updateUser desde recuperación y exige state.recovery; no hay acción permanente en perfil para cambiarla autenticado. |
| Eliminación de cuenta | NO EXISTE | Sin UI, endpoint o RPC de borrado de auth.users. ON DELETE CASCADE en tablas no proporciona esa función. Borrar progreso local no borra cuenta. |
| Confirmación email | PARCIAL | Mensaje al registrarse, error email not confirmed y procesamiento SDK del retorno; sin UI de reenvío/cambio de email ni prueba real de correo. |
| Expiración | PARCIAL | autoRefreshToken del SDK y pausa de cola ante 401/JWT hasta re-login; sin certificación de expiración real/reanudación en proveedor. |
| Offline | PARCIAL cuenta; estudio local disponible | Sesión persistida gestionada por SDK; red fallida no impide estudio. No se garantiza renovar JWT sin red ni autenticar por primera vez offline. |
| Multi-pestaña | PARCIAL | storage, sesión SDK compartida, slots y guards con suites; historial H1 falla con forma real. Dos cuentas simultáneas del mismo origen no son un caso soportado. |

`SMR.auth` emite `smr:authchange`; cloud-progress instala slot y publica `SMR.cloudSession`. Perfil espera ese contrato. Las suites de owner inyectan eventos de cambio y no prueban por sí solas que auth.js los produzca todos.

### Configuración, esquema y despliegue

Local: cloud-config usa 127.0.0.1:54321. Público: Pages Function en `/js/cloud-config.public` lee exclusivamente SMR_SUPABASE_URL y SMR_SUPABASE_ANON_KEY, devuelve JS no-store o inerte. Supabase rechaza config incompleta y loopback en origen público. Mirror GitHub solicita la config pública de Cloudflare; file usa la ranura .js. Sin SDK/config, modo local-first.

SDK CDN `@supabase/supabase-js@2` sin versión exacta; persistSession, autoRefreshToken, detectSessionInUrl y PKCE habilitados. No se imprimieron tokens ni se utilizó service_role.

| Migraciones versionadas y presentes localmente | Finalidad | Evidencia de aplicación |
| --- | --- | --- |
| 00001_foundation | 16 tablas iniciales, RLS de dueño, índices/constraints. | Historial de uso local; estado actual de BD y producción no certificado. |
| 00002_auth_profile_trigger | Provisioning de profiles desde auth.users. | Igual límite; presencia del SQL no prueba trigger desplegado. |
| 00003_cloud_profile | updated_at de profiles sellado por servidor. | No certificado actualmente. |
| 00004_progress_sync | progress_sync_chunks (tabla 17), RPC append-only. | No certificado actualmente. |
| 00005_progress_sync_hardening | Idempotencia/orden y triggers de updated_at. | Documentos antiguos reportan staging local; ya está en Git, no “untracked”. |
| 00006_srs_merge_rpc / 00007_srs_merge_rpc_tiebreak | Merge SRS atómico y desempate por nivel/due/timestamp. | Informes 8.5 reportan PostgreSQL local; no ejecución real hoy. |
| 00008_srs_delete_tombstones | deleted_at, tombstone y revive explícito. | Reportada aplicada SOLO al staging local de octubre; no permite afirmar ni negar despliegue remoto posterior. |
| 00009_feedback_reports_rpc | Envíos validados/rate-limited y revocación de INSERT directo. | Auditoría de estabilización reporta stack local; no certificado en BD actual o producción. |

Ninguna migración se aplicó en esta auditoría. No hay evidencia consultada que certifique una versión SQL en producción. La afirmación histórica “00008 no aplicada en remoto” no se presenta como verdad actual. Una verificación futura debe ser de solo lectura y autorizada en el entorno concreto.

Tablas: profiles, student_settings, resource_state, test_scores, test_attempts, wrong_answer_events, wrong_answers, srs_cards, case_solutions, streak_days, study_sessions, activity_events, favorites, feedback, question_reports, entitlements, progress_sync_chunks. Son datos de usuario, no copia del banco educativo.

RPC: sync_progress_chunk para test_attempts/study_sessions/activity_events/wrong_answer_events; merge_srs_cards para estado SRS; submit_feedback y submit_question_report para envíos. Las últimas usan SECURITY DEFINER, search_path vacío, auth.uid(), validación y lock por usuario; límites 5 comentarios/20 reportes por hora. No son una API de administración. RPC de progreso/SRS usa SECURITY INVOKER y RLS; provisioning tiene trigger propio. rls-static comprueba el SQL, no su despliegue.

### Qué sincroniza realmente

| Dominio | Flujo actual y límite |
| --- | --- |
| Perfil | Espera slot; local configurado gana al entrar, si vacío importa remoto; edición posterior sube. No LWW genérico por reloj. |
| Best/last | Lectura/merge/upsert test_scores; best MAX, last por intento disponible. Histórico limitado y semántica de subconjuntos afectan métricas. |
| Intentos | Cola por UID → RPC idempotente → pull últimos 200 → history local máximo 60. |
| Errores | Se envían add/clear a wrong_answer_events; pull solo lee wrong_answers y aumenta contadores. No hay replay de eventos ni mantenimiento de esa caché en SQL versionado. Roundtrip incompleto: H5. |
| Recursos | Pull/merge/upsert; vistos, completado con completed_cleared_at y autoevaluación/fecha. |
| Casos | case_solutions por propietario y resolución temporal. |
| SRS | Pull→merge→push, claves estables; RPC serializa conflicto. Nivel mayor gana; igual nivel, due mayor; empate, client_updated_at. |
| Borrado SRS | Marca pending→known, revive explícito; deleted_at pegajoso sellado por servidor. UI no promete borrado remoto inmediato. |
| Sesiones | Envío por study_sessions; pull 50, retiene 20 y refuerza studyMinutes con suma retenida. No restaura todo el total histórico en dispositivo nuevo. |
| Actividad | Se envían activity_events; no hay pull de su lista. Actividad reciente puede quedar vacía en dispositivo nuevo aunque existan eventos remotos. |
| Racha | Unión de streak_days, pull 400; dashboard recalcula además con actividad/history/sesiones disponibles. Ventanas limitan interpretación. |
| Favoritos / ajustes | Solo dispositivo; las tablas favorites/student_settings existen pero no están conectadas a sincronización del cliente. |
| Entitlements | Esquema sin consumidor UI/flujo comercial. |
| Feedback/reportes | Envío explícito autenticado sin reintento automático; validación de token antes/después. |

Límites SRS: pull 500 sin paginación, tombstones incluidos; remotas no resolubles no se asignan ni borran. Revalorar a nivel menor puede perder contra el mayor remoto. Revive conserva posible nivel alto previo; una valoración antes de conocer un tombstone puede perderse; tombstone obsoleto entregado tras revive confirmado vuelve a borrar según SQL actual. Son políticas/límites conocidos, no fallos nuevos de aislamiento.

Colas: eventos por propietario, failed/dead-letter conservado, backoff transitorio 3–120 s hasta diez reintentos; error auth pausa hasta re-login. La recuperación manual no tiene pantalla propia.

### Inventario de almacenamiento

Nombres de SMR.store llevan prefijo `smrhub:`. Estructuras JSON, salvo almacenamiento del SDK. “Owner” no implica cifrado: todos los datos locales del origen son accesibles a sus scripts.

| Clave / almacén | Propietario, forma, productor/consumidor | Migración, sync y riesgo |
| --- | --- | --- |
| progress | Slot vivo: v4; resources/tests/cases/studySessions/studyMinutes/activity/streak. app.js produce y consume; cloud-progress envuelve save. | Saneado y migración SRS. Fusión tres vías; H1. Sin almacenamiento solo memoria, sin garantía duradera. |
| progressByOwner:<uid> / :__guest__ | Snapshot {slot,savedAt,v}; cloud-progress archiva/restaura cuatro claves. | Local, no cloud; no usar snapshot viejo si dueño vivo coincide. |
| progressByOwner:__unknown__ | Cuarentena v2 {quarantine:[entradas],v}; compatibilidad v1 {slot}. | No atribuye automáticamente; lista limitada a 20, conserva copias corruptas en claves auxiliares cuando puede escribir. No recuperación UI. |
| progressByOwner:<owner>:stash | Respaldo {backup,savedAt,v} antes de reemplazo; cloud-progress. | Respaldo local, no transacción ni garantía frente a cuota totalmente agotada. No declarar “imposible perder datos”. |
| progressByOwner:__unknown__:<timestampBase36> | Copia de cuarentena corrupta/fallida; cloud-progress. | Conservación de emergencia, sin migración/sync/UI de recuperación. |
| liveOwner / liveWriter | {owner,v:1}, tolera string legado; cloud-progress. | Metadatos fuera de SLOT_KEYS; lecturas frescas evitan fusionar propietarios. Escritura separada del contenido: crash/cuota puede desfasarlos. |
| progressSyncQueue:<uid> / :guest | attempts/sessions/activity/wrongEvents/streakDays/failed; hooks y drenaje cloud-progress. | La primera cuenta elegible puede adoptar visitante/cola legada; no transferir cola de A a B. Persistencia/fusiones no son transacciones entre procesos. |
| progressSyncQueue | Cola legada sin propietario. | Se adopta por el flujo permitido; restos/failed se conservan. No es clave principal actual. |
| progressSyncClears | Mapa recurso→timestamp al descompletar; hook y merge cloud. | Dentro del slot; sin fusión atómica entre procesos. |
| progressSyncSrsClears | Mapa ID→pending/known/revive; drop/rating/sync SRS. | Dentro del slot. applySrsClear relee y exige estado esperado tras awaits; sigue existiendo ventana read/modify/write entre procesos. |
| studentProfile | {community,course,academicYear,curriculumId,setupCompleted}; profile/app/cloud-profile. | Dentro del slot; normaliza con currículos reales; sync profiles. |
| curriculum | {community,year}, selector curricular de app.js. | Preferencia legacy de dispositivo, FUERA de SLOT_KEYS; semilla de studentProfile sin inventar curso. No cloud. |
| bestScores | Mapa legacy de mejores notas. | app.js importa valores faltantes; conserva clave. No cola cloud propia. |
| progressBackupV3 | Copia original anterior a migración SRS. | Backup local fuera del slot; no se sincroniza ni se debe borrar por filtrar huérfanos. |
| favorites | Mapa tipo→id→boolean; app.js y vistas. | Dispositivo compartido entre cuentas, fusión por clave, no cloud. |
| settings | theme/textSize/animations; inline HTML y app.js. | Dispositivo, fusión por clave, no cloud. |
| SDK Supabase | persistencia de sesión y verificador PKCE bajo claves que decide el SDK/proyecto. | No hay storageKey propio. No inventariar sufijos como contrato fijo del proyecto ni copiar valores sensibles. Autenticación compartida entre pestañas. |
| sessionStorage | Ninguna clave propia utilizada por la aplicación actual. | El 404 actual transporta ruta en fragmento #smrhub-route=; informes de sessionStorage para routing están obsoletos. Claves de instrumentación de esta auditoría no son producto. |
| IndexedDB smr_offline_db v1 / pending_actions | keyPath type; {type,payload,at}, snapshot “progress”; offline-store/app.js. | Una acción por tipo, sin owner propio; es indicador, no fuente de envío. Reconexion autenticada limpia indicador y llama resumeSync; NO aplica el payload a otra cuenta. Puede retener snapshot viejo; localStorage/colas por UID son autoridad. |
| Cache Storage smr-hub:<base>:v5 | SW; base / o /SMR_Hub/, respuestas de shell/estáticos. | Descarta solo versiones de su montaje; config excluida. Datos de progreso no se guardan aquí deliberadamente. Dependencias externas requieren calentamiento. |

SLOT_KEYS real: progress, progressSyncClears, progressSyncSrsClears, studentProfile. Curriculum/favoritos/settings/backups no pertenecen a esos snapshots.

Web Lock `smrhub:slot-transition`: adquirido serializa transición; ausente/rechazado/error síncrono falla cerrado y difiere, con cinco reintentos. No hay timeout si queda retenido por pestaña congelada. La antigua afirmación “rechazo ejecuta sin lock” es incorrecta actualmente. transitionPending está expuesto, pero no hay UX general completa para recuperar una transición bloqueada. storage reconcilia slots pasivos; no convierte toda escritura de localStorage en una transacción.

## 7. Contenido, routing, PWA y SEO

### Contenido calculado en esta auditoría

| Catálogo | Conteo / integridad |
| --- | --- |
| Tests/preguntas | Virtualización 18, Mantenimiento 18, Ofimática 16, Redes 27, Sistemas Operativos 26, Hardware 24, Seguridad 25: 154 IDs estables únicos. |
| Explicaciones | 154 con explain y topic; siete con wrongWhy por distractor. |
| Recursos | 19 IDs únicos: Redes 9, Sistemas 5, Hardware 3, Seguridad 2; otras tres categorías sin recursos publicados. Relaciones resource-related rotas: cero. |
| relatedResource | 83 preguntas con destino válido; 71 referencias anuladas a null en carga por 19 IDs ausentes, conservadas en contentGaps. No inventar sustitutos. |
| Glosario / casos | 51 términos; seis casos con tres opciones. |
| Rutas | ruta-direccionamiento 3/5 publicados, ruta-servicios 2/3, ruta-sistemas 5/6, ruta-seguridad 2/5. |
| Huecos | 51 registros: siete route-step + 25 lesson-orphan + 19 question-relatedResource (estos últimos afectan 71 preguntas). Baseline los hace explícitos, no los resuelve. |
| Temas | 55 canónicos, 56 strings raw; mapping 154 active: 141 high / 13 medium, cero review/ambiguous. 54 temas con preguntas. |
| Temas transversales | refrigeración 7, almacenamiento 4, recuperación de sistema 5, registros 3 y diagnóstico de red 6 cruzan bancos/categorías. No equivalen a una asignación curricular. |
| Currículos | 19: VERIFIED 3, PARTIALLY_VERIFIED 12, NOT_VERIFIED 4; cinco sin módulos (Andalucía, Illes Balears, Cataluña, Galicia, País Vasco). Son etiquetas de datos, no una nueva validación normativa. |
| Fuentes curriculares | 64 entradas de fuentes, 37 URLs distintas; cantidad de citas no certifica vigencia ni asignación académica. |
| Módulos | 227 instancias derivadas, cero IDs duplicados; 35 warnings de electivas/códigos/duplicación estructural desambiguada. No son 227 módulos únicos de un currículo nacional. |
| moduleTopics | 905 enlaces: 139 módulos enlazados, 88 sin tema; siete temas sin módulo. Confianza high 630 / medium 248 / low 27. Capa sin UI. |
| Equivalencias | 20 grupos, 203 miembros, 1.182 pares strong, 328 partial y 12 reglas parciales; un warning por instancias aragonesas fuera de grupos. |
| contentTopics | 19 recursos y seis casos mapeados, validador sin errores; no cargado por las landings actuales. |
| Puertos | Cero entradas. |

Validadores de currículo, topics, questionTopics, contentTopics, moduleTopics y equivalencias: ok=true, sin errores. Los warnings estructurales y huecos del baseline permanecen. No se corrigió contenido ni se contrastó la vigencia de enlaces oficiales en Internet.

### Routing y PWA

17 IDs: inicio (raíz), estudio, recursos, recursos/subnetting, redes, sistemas, herramientas, tests, dashboard, exportar, glosario, casos, mapa, estadisticas, curriculo, mi-smr, configuracion.

History API, consultas y anclas; compatibilidad con hashes antiguos. Cloudflare: /tests, /glosario y /recursos/subnetting usan HTML nativo; otras vistas proxy por _redirects, barra final normalizada. Mirror /SMR_Hub/: 404 versionado transporta ruta/query/hash al entrypoint mediante fragmento y replaceState. El contrato routing.js lo comparten cliente y SW. P0 routing cerrado; no se reprodujeron bucles ni se reabre como trabajo pendiente.

SW v5: install precache por archivo tolerando fallo individual, skipWaiting; activate limpia versiones propias y clients.claim. 32 entradas, todas existen. Estáticos propios stale-while-revalidate; navegación red primero y fallback a shell solo para ruta conocida; externos estáticos red primero y copia si respuesta cacheable. Config /js/cloud-config.public y variante .js nunca se cachean. Fallback fija base antes de precarga en rutas profundas.

Tests, recursos y estudio funcionan offline tras preparar shell; no necesitan contenido en Supabase. La instalación tolerante no garantiza caché completa tras un primer arranque con cortes. El primer acceso sin red no está garantizado; auth/correo/sync necesitan red; CDN/fonts no calentadas pueden fallar. En smoke offline se observaron 504 de Google Fonts y ERR_INTERNET_DISCONNECTED de config, sin impedir estudio. No confundir esos fallos esperados con consola online limpia. No se midió actualización entre dos versiones desplegadas ni instalación en hardware real.

### SEO/GEO técnico

Generador sin dependencias nuevas: `scripts/build-seo.js`; `--check` solo verifica. Cuatro landings versionadas con HTML inicial útil: inicio, tests, glosario y subnetting; comprobadas también sin JavaScript. Metadata title/description/canonical/OG/Twitter y JSON-LD WebSite; sin Quiz ni FAQ inventados.

Sitemap: /, /tests, /glosario, /recursos, /herramientas, /recursos/subnetting. robots permite rastreo y enlaza sitemap. Recursos/herramientas están en sitemap pero su catálogo útil depende de JS; no tienen landing generada propia. La SPA actualiza index/noindex, canonical y metadata al navegar; vistas personales y estudio reciben noindex,follow tras render. Su shell inicial no proporciona noindex específico por ruta antes de JS.

Cloudflare es canonical también en el mirror. P1 técnico está integrado; las afirmaciones de publicación/promoción del encargo no prueban qué SHA o configuración sirve hoy cada hosting. Sin Search Console, analítica, posiciones, cobertura, Core Web Vitals ni métricas de promoción actuales verificadas. P2 SEO queda fuera de esta fase.

## 8. Defectos, riesgos y límites abiertos

Ningún P0 observado dentro del alcance local. Los siguientes hallazgos NO se corrigieron:

| ID / prioridad | Evidencia actual y reproducción | Consecuencia / siguiente prueba |
| --- | --- | --- |
| H1 / P1 | app.js SLOT_ARRAYS['tests.history'] usa ts/mode/testId/score y ordena ts; recordTest produce date/pct. Fusión real en Node de base + dos intentos date=2000/3000 devuelve dos entradas en vez de tres. Dos pestañas reales crean sendos intentos rápido del mismo banco: solo queda uno. tab-merge usa fixtures ts/score y por eso pasa. | Pérdida de intentos locales, orden/retención y métricas erróneas. Corregir identidad/orden con forma REAL y añadir regresión antes de afirmar merge de historial completo. |
| H2 / P1 | auth.js handleSession recuerda solo wasSignedIn booleano. Con función real en VM: sesión A → sesión B emite [A], aunque state.user=B. No emite authchange B ni reinicia profileEnsured. | Consumidores cloud/slots pueden seguir con propietario A mientras SDK/user son B. Logout→login es el flujo UI normal; no se probó fuga real ni backend con cambio directo. Añadir test auth→consumidores, no solo eventos sintéticos de owner. |
| H3 / P2 | tests.js renderQuestion añade .correct/.wrong y quiz-explain ok/bad aunque cfg.explain=false. En examen real se vio una opción .correct antes del resultado con texto “detalle al finalizar”. | Revela corrección anticipada y contradice “sin pistas”. Probar modo examen correcto/incorrecto sin colores reveladores hasta finalizar. |
| H4 / P2 | renderAdaptiveQuestion pone adaptive.streak=0 en cada pregunta. next solo suma/resta una vez. Con función real y cuatro aciertos: niveles [0,0,0,0], racha final 1. | Regla “dos aciertos suben/dos fallos bajan” no se alcanza por racha. El agotamiento de buckets aún puede mostrar otras dificultades, no es adaptación según aciertos. |
| H5 / P1 integración cloud | Código envía wrong_answer_events pero nunca los lee/reproduce; pull solo consume wrong_answers con MAX. Ninguna migración versionada mantiene esa caché al insertar eventos. Verificado por búsqueda de todos los productores/consumidores y SQL. | Un dispositivo nuevo no puede reconstruir errores a partir del contrato versionado; clears remotos no eliminan contador local por ese pull. No se presenta como incidente confirmado en producción, donde podrían existir componentes no versionados. Exige roundtrip con BD local autorizada. |
| H6 / P2 | No pull de activity_events; studyMinutes se refuerza desde las últimas 20 sesiones retenidas tras pull limitado a 50. | El dispositivo nuevo no recupera lista de actividad ni minutos de toda la vida. Es sync parcial, no copia completa del progreso. |

Límites/decisiones adicionales, separados de defectos reproducidos:

- SRS max-level/due, revival y tombstone tardío, límite 500: necesitan política explícita antes de cambiarlos; no añadir last_reviewed_at sin consumidor.
- read/merge/write no transaccional; backups y marcadores no garantizan durabilidad bajo cuota/crash; cuarentena limitada y sin UI. No se hizo una nueva prueba de agotamiento físico de cuota.
- Web Lock retenido no caduca; si no hay exclusión la transición falla cerrada. No se debe restaurar el viejo fallback inseguro para evitar esperar.
- Borrar progreso en configuración borra local, no la cuenta ni todas las filas cloud; una sincronización puede repoblar datos. No hay borrado global de datos de usuario.
- Best por subconjunto; dos maestrías diferentes; “módulo” del dashboard/PDF es banco editorial. No confundirlo con módulos oficiales o evaluación académica.
- Contenido ausente, currículo parcial y tabla de puertos vacía son deuda real de producto, no incidencias de routing ni excepciones para inventar material.
- studyBlocks sigue exportada sin consumidores encontrados; varias APIs de diagnóstico solo se usan en scratch/validadores. No eliminar por resultados de un grafo histórico.
- CDN SDK fijada solo a major 2; cambios del proveedor pueden variar sin diff del repositorio. Pruebas mock no certifican esa integración.
- No CI ni pruebas físicas de accesibilidad/rendimiento/memoria. La evaluación estática de RLS no equivale a auditoría completa de seguridad.

## 9. Pruebas de esta auditoría

### Suites versionadas: 29/29, 475 checks aprobados, cero fallidos

Todas las `tests/*.test.js` se ejecutaron con Node; no se llamó al modo --update-baseline. Clasificación: módulos reales sobre mocks/VM, integración de contratos y checks estáticos. No son pruebas de Supabase/PostgreSQL real.

| Suite .test.js | Checks | Tipo principal |
| --- | ---: | --- |
| auth-logout | 7 | Auth/DOM/SDK simulado |
| auth-recovery | 14 | Auth y recuperación simulada |
| auth-retry | 3 | Cola cloud con errores auth simulados |
| cloud-config | 16 | Config, Function y selección de origen |
| content-integrity | 14 | Datos reales, baseline, IDs y contratos |
| dashboard | 28 | Cálculos/UI con datos controlados |
| feedback-report | 9 | Cliente RPC simulado |
| feedback-ui | 9 | DOM/formularios simulados |
| h1-race | 15 | Carreras cloud/SRS controladas |
| multi-tab-owner | 20 | Instancias/slots/locks simulados |
| pdf-export | 22 | Selección/DOM/impresión simulada |
| profile-owner | 8 | Contrato de slot y perfil |
| pwa | 28 | SW/IndexedDB simulados + hosting HTTP local real |
| rls-static | 15 | Esquema/permisos estáticos |
| seo | 22 | HTML, metadata y generación |
| slot-owner | 10 | Arranque/restauración de propietario |
| srs-clears-race | 9 | Borrados concurrentes simulados |
| srs-delete | 11 | Tombstones con RPC simulada |
| srs-drop-ui | 10 | Confirmación/borrado DOM simulado |
| srs-rate-ui | 5 | Rating/EventTarget; revaloración |
| srs-review-drop | 12 | Borrado/avance de repaso |
| srs-sync | 21 | Merge/pull/push simulado |
| study-guided | 16 | Guiado, guards y reloj |
| study-integration | 17 | Store/progreso/estudio/owner/offline controlados |
| study-topics | 17 | Datos canónicos y selección |
| study | 67 | Fuentes, ratings, vacíos, progreso y propietario |
| tab-merge | 18 | Fusión local con dos instancias; hueco H1 |
| tab-slots | 10 | Transiciones entre pestañas simuladas |
| tools-calc | 22 | Cálculos chmod/RAID |

Sintaxis: `node --check` sobre los 60 archivos JS rastreados (25 app + Function + SW + generador + suites/helpers/navegador): todos pasan. `node scripts/build-seo.js --check`: cuatro HTML consistentes. `git diff --check`: sin errores al terminar.

`tests/run-all.sh` se leyó completo, NO se ejecutó: incluye sintaxis js/*.js, todas las suites Node y los cuatro harnesses shell; algunos aplican migraciones o crean/borran fixtures. Exit 2 se cuenta OMITIDO, no aprobado. Ejecutarlo entero no era compatible con la prohibición de migrar/modificar datos de esta fase.

| Harness real omitido | Requisito / razón |
| --- | --- |
| pg-local-concurrency.sh | Docker/PostgreSQL local scratch_84val; modifica fixtures para carreras. |
| pg-privileges-lockdown.sh | PostgreSQL real y usuarios/fixtures locales; no ejecutado aquí. |
| pg-srs-delete.sh | Aplica 00008 al stack local y modifica fixtures; expresamente incompatible con esta fase. |
| rest-rls-isolation.sh | GoTrue/PostgREST/PostgreSQL locales, cuentas efímeras y escrituras concurrentes; no ejecutado aquí. |

### Diagnósticos locales ignorados: resultados separados

Tras inspeccionar que no escribían archivos se ejecutaron nueve arneses históricos: seis exit 0, tres exit 1; 144 checks aprobados y seis expectativas fallidas. No pertenecen a tests/run-all.sh ni están versionados. No se modificaron para silenciar fallos.

| Archivo | Resultado actual |
| --- | --- |
| scratch_6c5/test_srs_migration.js | 12 OK / 0 fallos |
| scratch_6d2/test_curriculum_index.js | 10 OK / 2 fallos: espera campo de currículos indexados inexistente y antiguo ID valenciano en segmento c2. |
| scratch_6d3/test_topics.js | 14 OK / 0 |
| scratch_6d4/test_question_topics.js | 12 OK / 0 |
| scratch_6d5/test_content_topics.js | 7 OK / 2: espera Map.has/get, el contrato actual usa índices de objeto. |
| scratch_6d6/test_module_topics.js | 20 OK / 0 |
| scratch_6d8/test_6d8.js | 24 OK / 0, contratos endurecidos posteriores |
| scratch_fase55/test_profile.js | 15 OK / 0 |
| scratch_6d9/auditoria_6d9.js | 30 OK / 2: exige contentTopics en HTML y 13 apariciones de defer; cuenta 23 palabras, aunque hay 22 etiquetas. Esa capa no se carga. |

Los validadores actuales y 6D.8 respaldan los contratos actuales; estos seis fallos son expectativas históricas desactualizadas, no prueba de seis regresiones del producto. Deben archivarse/actualizarse en otra fase. Total ampliado: 38 arneses Node, 35 exit 0 / tres exit 1; 619 checks aprobados / seis fallidos, distinguiendo siempre ambas poblaciones.

Otros diagnósticos inventariados y no ejecutados: scratch_6c/auditoria.js, scratch_6c6/auditoria_paths.js, scratch_6d1/inventario_modulos.js, scratch_fase4/validate.js, scratch_graphify/checks.cjs/current-checks.cjs/browser.js y extractores de selectores; scratch_spacing contiene test-8.3-cloud-profile.mjs, test-8.4-progress-sync.mjs, test-8.4-vs-prefix.mjs y probes/repros; scratch_84val contiene hardening-844-tests.mjs, hardening-845-tests.mjs, isol-harness.mjs, rls-c1-a5-tests.mjs y variantes negativas. Hay también scripts de parche/backup: no ejecutarlos como una regresión de solo lectura.

### Navegador real y comprobaciones adicionales

`tests/routing-browser.js` ejecutado con Playwright ya instalado, Chrome headless y hosting helper local, sin instalar dependencias. Raíz y /SMR_Hub/, con/sin SW: PASS; 132 entradas directas, 132 recargas, 64 navegaciones internas, 128 recorridos de historial, 66 offline. También cuatro landings sin JS, móvil, metadata robots/canonical, anclas, calculadora, test Redes y búsqueda/favorito del glosario. No prueba hosting remoto.

Smoke adicional con Chromium aislado: 17 vistas a 1366×900 sin overflow ni errores JS; estados vacíos de dashboard, estadísticas, perfil, errores, SRS, búsqueda de recursos y glosario. Estudio: Todas 154, Redes 27, subnetting 7, errores/SRS utilizables 1 pese a huérfanos conservados; revelar/finalizar cinco fuentes mantiene wrong/history, abandono no aumenta sesiones y rating cambia SRS. Guiado 10 min, avance y salida; recurso abierto/completado; perfil académico guardado y restaurado tras recarga; herramientas y cálculo IPv4; rating 2→0→2 activo; H3 visible.

Móvil 390×844: entrada por Más secciones, estudio por tema, foco al revelar y ancho 390/390. Offline warm: recarga de /estudio, tema, rating/finalización, navegación a tests/recursos/herramientas/dashboard; sesión pasó a seis, perfil persistió, IndexedDB tenía indicador progress. Fuentes/config fallaron como se detalla en §7. No hubo excepción JS de la aplicación. Se descartó un error de instrumentación del auditor al intentar escribir en una variable de medición desaparecida tras recarga; no era código de SMR.

H1 confirmado con dos pestañas y recordTest reales del mismo perfil local; H2/H4 con funciones reales extraídas en VM. No se cambiaron archivos para obtener estas evidencias. Sin cuentas reales ni pruebas destructivas de producción. El PDF se verificó con suite/DOM y formulario; no se certificó un PDF descargado ni impresión física.

## 10. Documentación comparada y decisiones históricas

Leídos completos CONTEXT/ROADMAP anteriores, README, DESPLIEGUE, AGENTS, AUDITORIA_ESTABILIZACION, SMR_HUB_AUDITORIA_GRAFO y el informe local SMR_HUB_ESTADO_2026-10-26. Los anexos de selectores/grafos son snapshots históricos, no evidencia de consumidores actuales ni cobertura total.

| Documento / afirmación | Clasificación | Estado real y acción documental |
| --- | --- | --- |
| CONTEXT: fase actual 8.5, HEAD 1f6f247 y archivos M/?? | DESACTUALIZADO | Se reemplaza por SHA/preflight actual; los SHA antiguos quedan solo como hitos históricos. |
| CONTEXT/ROADMAP: Modo Estudio pendiente | INCORRECTO actualmente | v1 integrado hasta 8.X.5, documentado en §4. |
| CONTEXT/ROADMAP: dropSrs sin UI / decisión B pendiente | DESACTUALIZADO | Tombstones + confirmación + revisión/repaso ya implementados. |
| CONTEXT/ROADMAP: multi-pestaña sigue siendo objeto entero LWW / sesiones LWW | DESACTUALIZADO | Fusión tres vías y unión de studySessions presentes; H1 es un defecto concreto del historial, no ausencia de fusión. |
| CONTEXT/ROADMAP: lock rechazado ejecuta sin exclusión | INCORRECTO actualmente | Falla cerrado y difiere. Se retira la instrucción insegura. |
| CONTEXT/ROADMAP: migraciones 00005–00008 sin seguimiento / “sin aplicar remoto” actual | DESACTUALIZADO / NO VERIFICABLE | Todas 00001–00009 versionadas; despliegue actual no consultado. |
| ROADMAP: 8.6 íntegra futura, incluye logout/recuperación | INCORRECTO actualmente | Ambas implementadas; quedan eliminación, cambio desde perfil y validación real. |
| ROADMAP: 8.8 y 9.2 feedback futuro | DESACTUALIZADO | UI/RPC de feedback/reportes ya están; analítica y administración no. |
| ROADMAP: 9.0 SEO totalmente futuro | DESACTUALIZADO | P0 routing y P1 SEO integrados; P2 queda aplazado. |
| Auditoría estabilización: 71 relatedResource / siete pasos sin recurso / 25 lecciones huérfanas | VERIFICADO ACTUALMENTE | Se conservan, con conteos exactos y baseline. |
| Auditoría estabilización: inyección pública sin implementar | DESACTUALIZADO en código | Function y contrato existen; variables/deploy real siguen NO VERIFICABLES aquí. |
| Auditoría estabilización: cifras 20 suites/19 JS y 35 fuentes | DESACTUALIZADO como inventario global | 29 suites versionadas, 25 JS app; 64 entradas/37 URLs. No reutilizar sus totales como actuales. |
| Informes grafo 23/26 octubre: cuatro defectos (openResource, once SRS, segundo PDF, shuffle dashboard) | HISTÓRICO PERO VÁLIDO como hallazgos de entonces; DESACTUALIZADO como pendientes | Corregidos en 30d9c1b; código/tests actuales confirman función expuesta, revaloración, formulario nuevo y orden conservado. No reabrirlos. |
| Informe 26 octubre: 404 no rastreado / topics sin UI | DESACTUALIZADO | 404 versionado; topics/questionTopics cargados y consumidos. contentTopics/moduleTopics continúan sin UI. |
| Informes: PostgreSQL/RLS/navegador staging aprobados en octubre | HISTÓRICO PERO VÁLIDO como procedencia | Se conserva distinción de entorno/fecha; no se suma a tests ejecutados hoy ni certifica producción. |
| README: enfoque principalmente tests y tecnología genérica | DESACTUALIZADO por omisión | Recomendar inventario de estudio/PWA/dashboard/PDF y comandos reales; no editado. |
| DESPLIEGUE: landings/rutas/config sin extensión/no-store | VERIFICADO ACTUALMENTE | Mantener; orden de carga y conteo de cloud-config (16, no 14) requieren actualizarse en otra tarea. |
| DESPLIEGUE: run-all como regresión completa | PARCIAL; instrucción histórica útil | Recomendar advertencia explícita de fixtures/migraciones locales y separar regresión no mutante. No editado. |
| AGENTS | VERIFICADO ACTUALMENTE como instrucción | Vigente, sin cambios. |

### Historia útil conservada, sin tratarla como fase actual

- 6D.1–6D.9: separación contenido/currículo, IDs derivados, taxonomía y asociaciones; no inventar equivalencias. Los arneses de contratos más antiguos no reflejan todos los cambios de 6D.8.
- 8.4: progreso cloud por dominios/colas y aislamiento. 8.5: SRS cloud, RPC de merge, UI de rating y borrado. 8.5.7 resolvió decisión B con deleted_at; sentinel level=-1 era incompatible con CHECK 0–5.
- 8.5.8 D-1: restaurar snapshot al entrar sobre slot vacío. 8.5.10 D-2: callback de avance SRS corregido. 8.5.11 D-3: dueño vivo persistido evita reinstalar snapshot obsoleto. 8.5.12 D-4: propiedad entre pestañas. 8.5.13 D-5: fusión por dominio. 8.5.14 D-6: marcas SRS tras await con lectura fresca/estado esperado. Mecanismos presentes; H1/H2 limitan una afirmación global de “todo aislamiento/merge resuelto”.
- Los informes de 11–16 octubre citan HEAD 1f6f247/e19d503 y BD local scratch_84val. Son evidencia histórica, no estado Git/BD actual. Los informes 23/26 citan b2c27ba/6e0507f y grafos parciales; no son el grafo de b0ad8b2.
- Hitos Git presentes: 9718185 (SRS/tombstones), d5f7882 (feedback/hardening), 30d9c1b (cuatro regresiones), 3732a97/de7ff59 (routing), c388bad (SEO P1), a511cbf (guiado 8.X.1), a2415ab (libre 8.X.2), f99e72f (fuentes 8.X.3), 9590d59 (integración 8.X.4), b0ad8b2 (temas 8.X.5).
- last_reviewed_at nunca se añadió: sin consumidor aprobado no es deuda obligatoria. Decisión B de borrado está cerrada; la prioridad entre tombstone tardío y revive sigue abierta.

El roadmap vigente está en SMR_HUB_ROADMAP.md. Antes de la próxima implementación, volver a verificar SHA, diffs, contratos y alcance autorizado. Este documento no autoriza cambios de backend ni corrige los defectos descritos.

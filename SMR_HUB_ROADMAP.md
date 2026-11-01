# SMR Hub — roadmap

## Roadmap vigente — actualizado 2026-11-01

Base actual: `ad2eb227b5b4645ccf67f9e29a392eb1c7aeb33a` — `fix(auth): propagar cambios directos de propietario`, rama main. Auditoría maestra de base: 2026-10-31 (b0ad8b2); esta revisión recoge P1-A/H1 y clasifica H2 como CORREGIDO EN CLIENTE / PENDIENTE VALIDACIÓN BACKEND REAL. La referencia principal es SMR_HUB_CONTEXT.md, “ESTADO CANÓNICO ACTUAL”. No se certificó el estado desplegado ni se consultó producción.

Este documento propone el siguiente trabajo; no autoriza implementarlo automáticamente. Esta fase solo actualizó CONTEXT y ROADMAP. No hubo cambios funcionales, commit, push, deploy o migraciones. Antes de cada tarea: comprobar Git, preservar todos los cambios y ajustar alcance a código/tests actuales.

## 1. Completado realmente en el cliente

| Área / numeración histórica | Estado vigente | Evidencia actual / límite |
| --- | --- | --- |
| 6D.1–6D.9: índices y relaciones | Capas implementadas | 227 instancias de módulo, 55 temas, mappings de preguntas/contenido/módulos y equivalencias; validadores actuales sin errores. No todas las capas tienen UI; algunos scratch antiguos fallan por contratos obsoletos. |
| 7: interfaz | Integrada | Navegación responsive, modales, paleta/búsqueda, ajustes y superficies educativas; smoke local escritorio/móvil. No equivale a auditoría WCAG o hardware físico completa. |
| 8.1–8.4: foundation/auth/perfil/progreso | Implementado con partes incompletas | Cliente, colas y slots presentes; guards/RLS cubiertos estáticamente y con mocks. La validación backend real de H2 y H5 impiden llamarlo terminado extremo a extremo. |
| 8.5: SRS cloud | Adaptador y UI implementados | Identidad v4, merge_srs_cards, ratings, drop con confirmación, tombstones/revive y guards. SQL desplegado y conflictos de producto pendientes de evidencia/decisión. |
| 8.5.8–8.5.14: hardening | Mecanismos integrados | Snapshot al login, liveOwner/liveWriter, fusión por dominio y marcas tras await. No repetir fases completas por sus antiguos pendientes; H1 RESUELTO en 801c006; H2 corregido en cliente, pendiente validación backend real. |
| Parte de 8.6: cuenta | Login, registro, logout y recuperación implementados | Cambio de contraseña disponible desde recuperación. No siguen siendo funciones futuras; falta completar el ciclo descrito abajo. |
| Parte de 8.7: seguridad | Guardas y esquema implementados | Config loopback, dueño/slot/generación, locks fail-closed, RLS, permisos RPC y rate limits. La auditoría real de backend actual y la validación Supabase/RLS de H2 siguen pendientes. |
| Parte de 8.8 / 9.2: feedback | UI y RPC implementados | Comentarios/reportes autenticados, explícitos y validados. No hay administración de envíos ni analítica de uso. |
| Correcciones del 26 de octubre | Cerradas en código | openResource expuesto, revaloración SRS repetida, segundo PDF lee formulario nuevo y dashboard conserva orden. Commit 30d9c1b; regresiones actuales pasan. |
| P0 routing | Cerrado | 404 versionado, Cloudflare/mirror, barras, historial y SW; navegador real local: 132 entradas, 132 recargas, 66 offline. No reabrir sin defecto nuevo reproducible. |
| Parte de 9.0 / P1 SEO | Técnica integrada | Cuatro landings con HTML inicial y seis URLs sitemap; generador, metadata y tests. Publicación/indexación actual no certificada en esta auditoría. |
| 8.X.1 — guiado | Integrado en a511cbf | Candidato correcto, ciclo de vida y guards; sesión guiada accesible desde estudio. |
| 8.X.2 — estudio libre | Integrado en a2415ab | Todas/categoría, revelado, explicación/recurso, rating opcional y fin explícito; no toca notas/errores. |
| 8.X.3 — errores/SRS | Integrado en f99e72f | Resuelve referencias, deduplica por ID, conserva huérfanas, contador utilizable, due ordenado, vacíos sin sesión. |
| 8.X.4 — integración estudio | Integrado en 9590d59 | Inicio/estadísticas/dashboard, unión de sesiones/minutos y hook cloud conserva evento propio. Sin nuevas tablas. |
| 8.X.5 — temas canónicos | Integrado en b0ad8b2 | 54 temas no vacíos; questionsOfTopic + IDs SRS; cinco temas transversales. Sin capas curriculares nuevas ni combinación de filtros. |
| PWA / PDF / herramientas | Integradas con límites | SW v5 y 32 precache; impresión A4; nueve interfaces de herramientas, tabla de puertos vacía. |

“Integrado” se refiere al repositorio auditado. No usar una fecha de informe antiguo como prueba de SQL, variables de entorno o assets que hoy sirve producción.

## 2. Próximas cinco prioridades, en orden

### 1. P1 — H2: validación backend real pendiente (cliente corregido)

P1-A/H1 está RESUELTO. P1-B/H2: CORREGIDO EN CLIENTE / PENDIENTE VALIDACIÓN BACKEND REAL en ad2eb22. La implementación cliente ya no es una tarea pendiente; falta validarla contra backend real aislado:

- **H1 — RESUELTO en 801c006.** Se sustituyó la identidad ts/score incompatible por los siete campos persistidos, con fallback ts/score y orden por date. Límite de 60 conservado, sin migración ni cambio de esquema. Validación: dos pestañas reales con recarga, 29 suites versionadas, 486 checks, cero fallos.
- Regresión H1 completada: intentos reales, distintas fechas/porcentajes/tests, deduplicación de copias, orden, retención, datos parciales y aislamiento. Límites vigentes: dos intentos idénticos en todos los campos y el mismo milisegundo son indistinguibles; localStorage no es transaccional entre procesos.
- **H2 — CORREGIDO EN CLIENTE / PENDIENTE VALIDACIÓN BACKEND REAL.** Causa anterior: handleSession solo comprobaba sesión previa, sin comparar UID, y no reiniciaba profileEnsured al cambiar directamente de propietario. Solución: comparación por UID, reinicio del provisioning al cambiar propietario y anuncio de B antes de esperar red. Provisioning/perfil tardíos de A quedan protegidos por los guards existentes; repetir eventos del mismo UID no duplica transición.
- Regresión cliente completada con la nueva tests/auth-owner.test.js: 30 suites, 493 checks, cero fallos y 61 JS con sintaxis correcta; multi-pestaña simulada y operaciones async tardías verificadas. NO se validó Supabase real ni RLS real: el backend local no estaba disponible.
- Sin cambios de identidad SRS ni esquema por defecto. No afirmar fuga de producción: el fallo de anuncio está reproducido en VM; su impacto de backend real requiere un entorno autorizado.

Criterio de cierre pendiente para H2: validar contra Supabase/RLS reales en un backend aislado autorizado, con cuentas efímeras, dos pestañas, cambios directos, perfil/progreso/colas correctos y respuestas tardías sin mezcla. No presentar mocks como evidencia real ni reabrir H1. Los demás P1 siguen pendientes.

### 2. P1 — Verificar y completar el roundtrip cloud realmente disponible

Primero una fase de evidencia en stack local explícitamente autorizado, con cuentas efímeras; no conectar producción por leer este roadmap.

- **H5:** los eventos add/clear se suben a wrong_answer_events, pero el cliente no hace replay y ninguna migración versionada mantiene wrong_answers. El pull actual solo aumenta contadores de esa caché. Verificar fallo de reconstrucción en un dispositivo limpio y de limpieza entre dispositivos; decidir el mínimo cierre coherente con el modelo existente.
- **H6:** actividad se sube sin pull y minutos de estudio no se restauran de toda la vida; definir qué continuidad se promete. No inventar métricas históricas ni deducir más de las ventanas disponibles.
- Separar pruebas de SQL/RLS real, cliente mock, transporte HTTP y UI. Capturar versiones/migraciones efectivamente aplicadas sin modificar la BD durante la inspección.
- Las nueve migraciones están versionadas; no hay prueba actual de dónde están aplicadas. La vieja frase “00008 solo local” se conserva como historia, no instrucción de despliegue actual.
- Añadir regresiones de errores add→clear→nuevo dispositivo, SRS, sesiones, colas fallidas y cambio de cuenta. Mantener SMR_DATA estático.
- Cualquier cambio SQL o aplicación de migraciones requiere un encargo propio y revisión concreta. No crear tablas para estudio.

Criterio de cierre: tabla por dominio con envío/restauración/merge real y limitaciones explícitas; ningún test mock se presenta como RLS desplegada.

### 3. P2 — Corregir los dos defectos del motor de tests y aclarar métricas

- **H3:** en examen, .correct/.wrong y ok/bad revelan corrección antes de terminar, pese a explain=false. Probar respuestas correctas e incorrectas sin revelado anticipado y revisión final completa.
- **H4:** el adaptativo reinicia streak cada pregunta y no llega a dos aciertos/fallos. Probar secuencias ++/--, alternancia, bordes y buckets agotados sin repetición.
- Mantener estudio libre separado del resultado evaluado. Reejecutar todas las suites study/SRS/dashboard/owner.
- Decisión de producto separada: best por subconjunto puede ser 100 tras una pregunta; dashboard y estadísticas tienen fórmulas de maestría diferentes. Aclarar etiquetas/semántica antes de imponer una regla nueva o recalcular datos históricos.

Criterio de cierre: examen y adaptación cumplen lo que dice su UI; no se cambia una métrica persistida sin decisión y compatibilidad.

### 4. P2 — Automatizar una regresión segura y depurar la evidencia histórica

- No existe CI versionada. Separar comprobaciones no mutantes (sintaxis, suites Node, integridad, SEO --check y navegador local) de harnesses con BD/fixtures/migraciones.
- tests/run-all.sh ejecuta todos los shell, incluido pg-srs-delete que aplica 00008. No ejecutarlo a ciegas como comando de auditoría de solo lectura.
- El conjunto versionado actual pasa: 30 suites / 493 checks y 61 JS con sintaxis válida. No ocultar los seis fallos de tres scratch históricos: actualizar expectativas o archivarlos explícitamente en una tarea autorizada. El antiguo conteo de defer incluye palabras de comentarios; el HTML tiene 22 etiquetas defer.
- Priorizar fixtures que modelen datos/eventos reales y la validación backend real pendiente de H2 y las lagunas H3–H5, sin reescribir todos los arneses ni añadir dependencia por unas líneas.
- Mantener ejecución de navegador en ambas bases, con/sin SW, móvil y offline; PostgreSQL real solo en job/entorno dedicado autorizado.

Criterio de cierre: comando/CI repetible que no migra ni toca datos por sorpresa; omitidas y requisitos externos diferenciados de aprobadas.

### 5. P2 — Completar el ciclo de cuenta según decisión de producto

La antigua fase 8.6 no empieza de cero. Ya existen registro, login, logout local, restauración y recuperación.

Decidir alcance mínimo pendiente: cambio de contraseña desde perfil, eliminación de cuenta/datos, reenvío de confirmación y recuperación visible de errores/transiciones. No confundir Borrar progreso local con borrar cuenta o datos cloud.

Diseñar la operación de eliminación contra el backend existente, con garantías de propietario y consecuencias concretas para progreso local/cloud; no introducir una clave de servidor en el cliente. Verificar flujo real de correo, allowlist de redirects, expiración, offline y multi-pestaña en staging autorizado.

Criterio de cierre: matriz auth actualizada con UI, tests, ejecución backend real y límites; ninguna capacidad se da por hecha por existir en el SDK.

## 3. Pendientes posteriores y decisiones abiertas

| Área | Pendiente real / decisión |
| --- | --- |
| Contenido / histórica 9.3 | Decidir publicación o descarte editorial de 25 lecciones huérfanas, 71 recomendaciones sin destino y siete pasos de ruta pendientes. No reasignar IDs ni inventar recursos para silenciar baseline. Tabla de puertos sin datos. |
| Currículo / 6D | 12 fichas parcialmente verificadas y cuatro no verificadas, cinco sin módulos; comprobar fuentes oficiales en fase propia. Asturias (fuente general), Galicia sin tabla y duplicación del proyecto requieren criterio académico. No inferir equivalencias nuevas. |
| SRS / 8.5 residual | Prioridad entre tombstone tardío y revive; max-level que domina una rebaja; rating antes de ver tombstone; paginación del pull de 500. last_reviewed_at no tiene consumidor aprobado y no es obligatorio. |
| Locks / 8.4 residual | Espera indefinida con lock retenido, UX de transición diferida y compatibilidad sin Web Locks. Mantener fail-closed; no volver al fallback sin exclusión. |
| Recuperación local / 8.8–8.9 | Cuota/crash entre claves, cuarentena/backups y recuperación manual de failed sin UI; límites de listas y colisiones por timestamps. No prometer atomicidad entre procesos. |
| Modo Estudio posterior / 9.4 | Reanudación, persistencia de cola, combinaciones de filtros, módulos/currículo o nuevos formatos requieren encargo y evidencia de relaciones. No son pendientes del MVP v1. |
| Capas sin UI | contentTopics/moduleTopics/equivalencias existen y se validan; integrarlas solo ante objetivo de producto aprobado. |
| Exportación | JSON de progreso no existe; no añadir por interpretar “exportar” como requisito implícito. PDF actual es impresión local; sin validación de PDF físico descargado aquí. |
| SEO P2 / parte restante de 9.0 | Fuera de alcance. Recursos/herramientas dependen de JS; Search Console, indexación y CWV actuales no verificados. No iniciar otra fase SEO automáticamente. |
| Monetización / 9.1 | No implementada; entitlements es solo esquema. Sin trabajo autorizado en esta auditoría. |
| Feedback/analítica / 9.2 | Feedback ya implementado; analítica, backoffice y seguimiento de envíos no. Separar medición real de promoción de código cliente. |
| Limpieza / P3 | studyBlocks sin consumidores encontrados; APIs de diagnóstico/scratch y documentos auxiliares. No borrar por un grafo parcial o para reducir warnings. |

## 4. Evidencia que condiciona el siguiente encargo

- Pruebas de P1-B/ad2eb22: **30 suites, 493 checks, cero fallos; 61 JS con sintaxis correcta**, incluida la nueva tests/auth-owner.test.js. Multi-pestaña simulada y operaciones async tardías verificadas. Supabase real/RLS real NO validados por backend local no disponible. No se reejecutaron durante esta revisión documental. Evidencia histórica de la auditoría base: sintaxis **60/60 JS** y SEO --check con cuatro HTML correctos.
- Diagnósticos ignorados ejecutados: **nueve arneses, seis pasan/tres fallan; 144 checks OK/seis fallos por expectativas históricas**. No sumarlos a una afirmación de “todo verde”. Total ampliado histórico de aquella auditoría: 38 arneses, 619 checks aprobados/seis fallidos; no es una ejecución conjunta nueva con P1-A.
- Navegador routing: **PASS**, raíz y mirror con/sin SW; 132 entradas, 132 recargas, 64 internas, 128 historial, 66 offline. Smoke adicional en 17 vistas y estudio móvil/offline.
- Cuatro harnesses PostgreSQL/PostgREST **omitidos** por requerir escrituras/fixtures o migración. Backend real actual, correo, producción y Search Console **no verificados**.
- H1 está RESUELTO en 801c006 y validado con dos pestañas reales. H2: CORREGIDO EN CLIENTE / PENDIENTE VALIDACIÓN BACKEND REAL. Los defectos H3–H4 permanecen; H5 es una integración incompleta demostrada por productores/consumidores/SQL versionado; H6 limita la restauración. No se corrigieron en esta fase documental.
- CONTEXT contiene inventario de módulos/datos/storage y tabla de comparaciones históricas. README y DESPLIEGUE no se editaron: se recomienda actualizar inventario de funcionalidades, orden de carga, cifra de config tests y advertencia de runner mutante en otro encargo.

## 5. Historia preservada y forma de continuar

Se mantiene la numeración histórica 6D, 7, 8.0–8.9, 9.0–9.5 y 8.X.1–8.X.5; no se renumera el proyecto ni se convierte la lista anterior en un calendario autorizado.

Las decisiones antiguas de borrado SRS y la falta de UI dropSrs están cerradas. La fusión por dominio existe; la propiedad del slot ya no se basa solo en memoria de una pestaña. Los informes de staging de octubre y HEADs 1f6f247/e19d503/b2c27ba/6e0507f son históricos, no estado actual. La evidencia técnica local no sustituye la comprobación del hosting o SQL efectivamente publicado.

Para la próxima tarea: elegir una fase concreta del orden recomendado, inspeccionar sus llamadores/datos/tests, acordar solo decisiones que realmente falten, implementar el mínimo completo si se autoriza, comprobar visitante/offline/owner/SRS y terminar con STOP. No hacer commit, push, deploy ni migraciones por iniciativa propia.

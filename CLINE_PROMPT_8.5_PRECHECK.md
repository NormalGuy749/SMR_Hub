# Prompt inicial para Cline — SMR Hub

Trabaja como ingeniero senior responsable de continuar un proyecto existente. Lee primero `SMR_HUB_CONTEXT.md` y `SMR_HUB_ROADMAP.md` completos.

## Objetivo de esta primera sesión

**No implementes todavía la sincronización SRS.** Haz una revisión enfocada del estado real y de las decisiones pendientes de 8.5.0 para preparar una propuesta de implementación segura.

## Obligatorio al empezar

1. Inspecciona `git status --short --branch`, rama, HEAD y `git diff --stat`; revisa los diffs pertinentes sin modificarlos.
2. Conserva todos los cambios locales y archivos no rastreados. No uses `git checkout`, `git reset`, `git clean`, ni restaures archivos.
3. Inspecciona el código real de `js/srs.js`, `js/app.js`, `js/tests.js`, `js/cloud-progress.js` y las migraciones relevantes, especialmente `00001`, `00004` y el estado de `00005`.
4. Busca todos los llamadores de `dropSrs()` y documenta qué significa actualmente eliminar una tarjeta.
5. Verifica la estructura real de `srs_cards` y sus policies RLS leyendo los SQL locales. No ejecutes SQL ni apliques migraciones.

## Preguntas que debes resolver en el informe

A. **Borrado SRS:** ¿qué hace exactamente `dropSrs()` y cuándo se llama? ¿Qué opciones seguras existen para sincronizar el borrado: tombstone/flag, DELETE remoto, o no sincronizar borrados en la primera versión? Para cada opción, explica resurrección de tarjetas, riesgo de borrado accidental, cambios de esquema y recuperación. No elijas una política sin explicar el coste y pedir aprobación.

B. **Conflictos:** convierte la propuesta de mezcla del informe en reglas deterministas con ejemplos concretos. Examina en particular qué pasa si un dispositivo tiene `level` mayor pero `due` más lejano; si un dispositivo está offline; y si llegan operaciones fuera de orden. No uses LWW ciego. No asumas que `max(level)` es siempre correcto sin valorar su semántica de aprendizaje.

C. **`last_reviewed_at`:** localiza un consumidor real de ese dato (UI, lógica o requisito). Si no existe, recomienda no añadirlo por ahora.

D. **Integración:** identifica los puntos exactos para enganchar SRS a la cola, `SMR.progress.save()`, `initialSync`, guards `sessionHandleFor/sessionChangedFor`, `syncChain` y Web Locks existentes. No cambies esos archivos en esta fase.

E. **Pruebas:** propone pruebas deterministas para merge, idempotencia, orphans, eliminación, offline, retry, dos dispositivos, cambio de UID durante un await y multi-pestaña. Distingue pruebas mock de pruebas reales.

## Restricciones

- Solo lectura: no edites ni crees archivos, migraciones, tests ni SQL.
- No ejecutes comandos destructivos ni `supabase db reset`.
- No apliques migraciones locales/remotas, no conectes con producción.
- No cambies `js/data.js`, IDs de preguntas/SRS, formato local v4, `localStorage`, autenticación, RLS ni dominios de sync 8.4.
- No hagas commit, push ni deploy.
- No hagas refactors ajenos ni cambies SEO/UI.
- Si encuentras una discrepancia entre los documentos y el código, documéntala; no la “arregles” en silencio.

## Entregable y STOP

Devuelve:
1. estado Git inicial;
2. archivos y funciones inspeccionados;
3. hallazgos de `dropSrs()` y callers;
4. opciones de borrado con recomendación razonada, dejando la decisión al usuario;
5. tabla de conflictos con ejemplos y reglas propuestas;
6. necesidad o no de `last_reviewed_at`;
7. plan de implementación por subfases y pruebas;
8. riesgos, límites y hechos que no pudiste verificar;
9. veredicto `DISEÑO LISTO PARA REVISIÓN` o `BLOQUEADO`.

Termina con **STOP: no se ha modificado ningún archivo y no se inicia 8.5.2 hasta aprobación explícita del usuario**.

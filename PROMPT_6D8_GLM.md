# PROMPT PARA GLM 5.3 FLASH — FASE 6D.8 DE SMR HUB
# (Copiar y pegar íntegro. Texto autosuficiente, en español.)

---

# TAREA: 6D.8 — HARDENING DE CONTRATOS + INTEGRACIÓN MÍNIMA

Eres un agente de código trabajando sobre el repositorio real https://github.com/NormalGuy749/SMR_Hub (plataforma educativa vanilla JS, sin framework ni build step, para el ciclo formativo SMR). Actúas como implementador senior: inspeccionas antes de tocar, decides arquitectura con criterio, modificas lo mínimo y lo pruebas todo. Comentarios de código y el informe final en español.

## REGLA 0 — LA REALIDAD DEL REPO MANDA

Si al inspeccionar el repositorio real algo contradice lo que este prompt afirma (cifras, firmas, líneas concretas), manda el repo: documenta la discrepancia en el informe y decide contra el código real, nunca contra el prompt. Las líneas citadas (p. ej. curriculum.js:204) son orientativas.

## PASO 0 — INSPECCIÓN OBLIGATORIA (antes de modificar nada)

1. Lee e inspecciona como mínimo: index.html, js/data.js, js/curriculum.js, js/topics.js, js/questionTopics.js, js/contentTopics.js, js/moduleTopics.js, js/srs.js, js/profile.js, js/questions.js, js/content.js, js/tests.js, js/app.js.
2. Búsqueda global de consumidores de: SMR.getModule, SMR.getModuleById, SMR.curriculumIndex, SMR.getCurriculumModules, SMR.moduleTopics, SMR.questionTopics, SMR.contentTopics, SMR.topics, SMR.moduleEquivalences, SMR.equivalentModules, topicOf, topicsOfModule, modulesOfTopic. No asumas que solo los archivos del punto 1 son relevantes.
3. Comprueba qué infraestructura de tests está realmente versionada en el repo. NO asumas que los scripts históricos (scratch_*/test_*.js) siguen ahí.
4. Antes de modificar nada, escribe un resumen breve (máx. 10 líneas) de lo hallado: consumidores reales encontrados, infra de tests real, casos de colisión detectados. En el Paso 0 NO se modifica nada.

## 2. CONTEXTO TÉCNICO VERIFICADO (checkout local coherente con el repo)

- Datos fuente: js/data.js (19 currículos; D.curriculums array; cada currículo con modules1/modules2/electives/project), js/questions.js (154 preguntas), js/content.js (19 recursos, 6 casos, learning paths con 7 refs rotas conocidas — NO reparar).
- js/curriculum.js — INDEX_VERSION = 1. Identidad `curriculumId:c1|c2|cx:code`, con sufijo determinista `-2`, `-3`… solo en colisión real (ejemplo real: aragon:c2:1713 en modules2 y aragon:c2:1713-2 en project). API: SMR.curriculumIndex(), SMR.getCurriculumModules(curriculumId), SMR.getModule(curriculumId, course, code), SMR.getModuleById(moduleId), SMR.validateCurriculumIndex(). getModule() (línea ~204) usa bucket.find(): devuelve el PRIMERO en orden de declaración y oculta la ambigüedad; getModuleById() es exacto (Map por moduleId completo).
- js/topics.js — TAXONOMY_VERSION = 1. 55 topics t-<slug>. SMR.topics = { version, list, resolveTopicId, registeredRawTopics, validateTopics } (Object.freeze). resolveTopicId devuelve ALIAS_GLOBAL / ALIAS_SCOPED / AMBIGUOUS.
- js/questionTopics.js — MAPPING_VERSION = 1. 154 entradas (141 high / 13 medium). API: SMR.questionTopics(), SMR.topicOf(questionId), SMR.questionsOfTopic(topicId), SMR.validateQuestionTopics().
- js/contentTopics.js — CONTENT_TOPICS_VERSION = 1. RESOURCE_LINKS (19 recursos, 7 dual-primary) + CASE_LINKS (6 casos; 42 enlaces). API: SMR.contentTopics(), SMR.topicOfResource, SMR.topicsOfResource, SMR.topicOfCase, SMR.topicsOfCase, SMR.resourcesOfTopic, SMR.casesOfTopic, SMR.validateContentTopics().
- js/moduleTopics.js — MODULE_TOPICS_VERSION = 1. Tabla curada CODE_LINKS por CÓDIGO expandida a instancias, más EXPECTED_INSTANCES (detector de deriva por código) y EQUIV_RULES (12 reglas parciales). API: SMR.moduleTopics(), SMR.topicsOfModule(moduleId), SMR.modulesOfTopic(topicId), SMR.topicOfModule(moduleId) (devuelve el PRIMERO declarado), SMR.validateModuleTopics(), SMR.moduleEquivalences(), SMR.equivalentModules(moduleId), SMR.validateModuleEquivalences(). Internals solo para pruebas: SMR.__moduleTopicsInternals.
- js/srs.js — SRS_KEY_VERSION = 4. SMR.srs es un OBJETO { version, buildIndex, idOf, resolveSrsKey, isLegacyKey, isStableKey, migrateProgressData, questionHashInput }. NO es función. js/profile.js — SMR.profile y SMR.getStudentModules(course, p).
- Orden de carga en index.html (todos defer): data → curriculum → topics → questionTopics → contentTopics → moduleTopics → content → questions → srs → tools → tests → profile → app.
- js/app.js — app principal (13+1 rutas). js/tests.js es el módulo de quizzes de autoevaluación, NO infraestructura de tests: no lo uses como arnés.

## 3. CIFRAS ESTABLES DE REFERENCIA (no deben cambiar en 6D.8)

227 instancias de módulo (98 modules1 / 99 modules2 / 16 electives / 14 project) · 55 topics · 154 preguntas (141 high / 13 medium) · 19 recursos · 6 casos · 905 module-topic links · 139 instancias con links · 88 sin links (12 electivas + 76 de códigos sin topic) · 7 topics sin módulo · 20 grupos strong (203 instancias, 1182 pares) · 12 reglas partial (328 pares) · 16 electivas excluidas de equivalencias · 2 huérfanos (aragon:c1:A997 y aragon:c2:A996). Estas cifras solo pueden cambiar con razón explícita y justificada en el informe.

## 4. INT-01 — CONTRATO INEQUIVOCO DE getModule()

Problema real (verificado): en el currículo de Aragón coexisten la instancia de modules2 con moduleId aragon:c2:1713 y la instancia de project con moduleId aragon:c2:1713-2; AMBAS tienen code "1713" y segmento c2. getModule() usa bucket.find() y devuelve la primera declarada, ocultando la ambigüedad. getModuleById() es exacto y sigue siendo la vía de identidad exacta.

Hecho clave verificado: hoy NO existe ningún consumidor de getModule() en la UI (búsqueda global sin resultados fuera de su definición y export). Por tanto puedes endurecer el contrato sin migrar consumidores; documéntalo.

Dirección recomendada (puedes ajustarla con justificación técnica):
- getModule(curriculumId, course, code) devuelve la instancia SOLO si la búsqueda es única; si hay varias coincidencias devuelve null (o el mecanismo de señalización que elijas), JAMÁS el primero arbitrario.
- Añade la vía de enumeración que falte (p. ej. una función que devuelva TODAS las coincidencias) para que la ambigüedad sea visible y resoluble.
- Documenta en el código cuándo usar getModule() y cuándo getModuleById().
- El caso 1713 debe quedar cubierto por tests: búsqueda única normal, búsqueda ambigua (aragon, curso 2, code 1713 → 2 coincidencias), getModuleById('aragon:c2:1713') y getModuleById('aragon:c2:1713-2') devuelven instancias distintas y correctas, inexistencia devuelve null, y validateCurriculumIndex() sigue reportando el structural-duplicate como warning.
- Revisa también getCurriculumModules(): hoy devuelve el array interno mutable del bucket (cruza con INT-02).

## 5. INT-02 — SUPERFICIES DE LECTURA (READ-ONLY, SIN SOBERINGENIERÍA)

Problema real (verificado): estas estructuras internas se exponen sin protección: en curriculum.js, el INDEX de curriculumIndex() contiene los Map byId y byCurriculum, y getCurriculumModules() devuelve el array del bucket; en moduleTopics.js, el índice de moduleTopics() contiene los Map byModuleId y byTopicId; en questionTopics.js, el mapping de questionTopics() contiene byQuestionId; en contentTopics.js, el índice de contentTopics() contiene byResourceId y byCaseId. Un consumidor podría corromper el índice accidentalmente.

Estrategia recomendada (puedes elegir otra igual de simple, justifícala): congelar en construcción (Object.freeze en arrays y en el objeto expuesto; valores ya congelados) y no exponer los Map directamente: exponer instantáneas de solo lectura u objetos congelados equivalentes, manteniendo los Map como estructura interna. PROHIBIDO: deep clones por acceso, proxies, clases wrapper genéricas, recomputar índices por llamada. Requisitos: misma complejidad de consulta que hoy, invarianza estructural entre llamadas, y tests que demuestren: (1) la consulta funciona, (2) un intento de mutación no altera el estado interno, (3) los validadores siguen en verde tras los intentos de mutación, (4) sin degradación de rendimiento apreciable.

## 6. INT-03 — INTEGRACIÓN MÍNIMA Y RACIONAL

La vista de currículo en app.js (ruta de /curriculo) usa directamente D.curriculums y cur.modules1/cur.modules2. NO migres mecánicamente. La pregunta correcta para cada consumidor es: "¿este consumidor necesita realmente la capa para hacer bien su trabajo?".

Prioridad de análisis: 1) /curriculo, 2) consumidores de módulos, 3) de topics, 4) de recursos, 5) de preguntas. Pistas (verificadas, pero revalida en el repo): renderizar tablas de módulos con nombre/horas desde la fuente es legítimo; en cambio, la validación de completitud de /curriculo (avisa si falta modules1 o modules2) es exactamente la pregunta que el índice responde, y es candidata natural a usar la capa. Es un resultado VÁLIDO concluir que algún acceso permanezca en la fuente, siempre que lo justifiques en el informe consumidor por consumidor. No refactorices app.js más allá de esto.

## 7. PROHIBICIONES ABSOLUTAS (no negociables)

NO añadas topics, mappings, equivalencias, preguntas ni contenido educativo. NO repares las 7 refs rotas de learning paths ni los 71 relatedResource nulos intencionados (los avisos de consola "[SMR content] 7 aviso(s) de integridad" y "[SMR questions] 71 relatedResource anulado(s)" DEBEN seguir apareciendo tal cual). NO cambies la identidad SRS, el modelo de progreso ni el perfil. NO introduzcas Supabase, autenticación, SEO ni feedback. NO rediseñes UI ni CSS (salvo imprescindible para evitar una regresión causada directamente por un cambio funcional; justifícalo). NO refactorices app.js en general. NO toques js/data.js salvo imprescindible para 6D.8 (justifícalo). NO cambies preguntas ni contenido de js/questions.js ni js/content.js. NO toques js/srs.js ni js/profile.js salvo que el análisis demuestre una regresión directa causada por esta fase. NO crees una capa educativa/service layer genérica. NO sustituyas la arquitectura existente por otra nueva. Modifica el MENOR número de archivos posible y justifica cada archivo antes de tocarlo.

## 8. LOGO OFICIAL SMR.png

SMR.png es el LOGO OFICIAL del proyecto, asset de marca proporcionado por el propietario. NO lo rediseñes, no cambies proporciones, tipografía, composición ni símbolo, no generes variantes, no lo sustituyas por texto. Si la app aún no tiene ubicación adecuada para el asset, puedes DOCUMENTAR cómo debería integrarse en el futuro, pero NO inicies la integración visual en esta fase: corresponde a la fase posterior de UI/UX. El informe debe declarar el estado del logo (sin alterar).

## 9. TESTING (mínimo y real)

Primero inspecciona qué hay versionado; si falta infraestructura reproducible, crea SOLO los tests necesarios para esta fase (p. ej. un script Node con arnés: sandbox con stub de localStorage y consola con info(), carga en orden data → curriculum → topics → questionTopics → contentTopics → moduleTopics → content → questions → srs, patrón run() con conteo PASS/FAIL y exit code). Cobertura mínima exigida: parseo de todos los js (node --check), índice curricular, topics, questionTopics, contentTopics, moduleTopics, equivalencias, srs (objeto version 4, idOf/resolveSrsKey), profile, getModule (única/ambigua/1713/curso no válido/inexistencia), getModuleById (exacto, incluye las dos variantes 1713), mutabilidad (INT-02: los 4 requisitos del punto 5), integración (INT-03), ausencia de mutación de SMR_DATA (copia previa y comparación después de ejercitar todas las capas y validadores), y estabilidad de las cifras del punto 3. Los tests nuevos deben poder ejecutarse con Node sin navegador.

## 10. REGRESIÓN

Verifica que siguen funcionando: navegación y las 14 rutas existentes, currículo, perfil, progreso, historial, SRS, favoritos, tests de autoevaluación, casos, estadísticas, responsive, dark mode, accesibilidad, reduced motion, localStorage. Si no puedes verificar algo en navegador, dilo explícitamente en el informe. No introduzcas cambios de comportamiento no relacionados con esta fase. Los dos avisos históricos de consola deben mantenerse idénticos y no aparecer avisos nuevos.

## 11. CRITERIOS DE ACEPTACIÓN (la fase solo está completa si se cumplen TODOS)

1. getModule() tiene un contrato inequívoco, documentado en el código.
2. Los casos ambiguos (incluido 1713/1713-2 de Aragón) están cubiertos por tests.
3. getModuleById() continúa siendo la identidad exacta.
4. Las APIs públicas no permiten corromper accidentalmente el estado interno.
5. Los consumidores relevantes usan las capas 6D cuando corresponde (y los que siguen en la fuente están justificados uno a uno).
6. No se ha creado ninguna abstracción innecesaria.
7. SMR_DATA sigue siendo la fuente de verdad y no es mutado por nadie.
8. No se han alterado mappings educativos existentes.
9. No se ha alterado SRS, progreso ni perfil.
10. Las 14 rutas siguen funcionando.
11. Los validadores siguen en verde (ok: true, sin errores; los warnings históricos intactos).
12. Los tests nuevos y los existentes pasan.
13. No existen errores de sintaxis (node --check limpio en todos los js).
14. La fase NO se ha convertido en un rediseño UI/UX.
15. El logo SMR.png queda identificado como asset oficial y no ha sido alterado.

## 12. ENTREGABLE FINAL — INFORME TÉCNICO (13 puntos, breve pero técnico)

1. Qué problema resolviste. 2. Qué contrato adoptaste para getModule() y por qué. 3. Cómo resolviste la mutabilidad (estrategia exacta). 4. Qué consumidores migraste y por qué (y cuáles NO y por qué). 5. Archivos modificados (lista exacta). 6. Archivos creados (lista exacta). 7. Tests ejecutados (comandos). 8. Resultado de cada test (PASS/FAIL por suite). 9. Regresión comprobada (qué sí y qué no, y cómo). 10. Qué NO modificaste deliberadamente. 11. Estado del logo oficial SMR.png. 12. Riesgos o deuda restante. 13. Recomendación concreta para 6D.9.

No ocultes fallos. Si algo no pudo verificarse, dilo explícitamente.

## 13. REGLA FINAL

Implementa EXCLUSIVAMENTE 6D.8. NO continúes hacia 6D.9. NO hagas UI/UX, ni Supabase, ni autenticación, ni SEO, ni nuevas funcionalidades, ni limpieza general del proyecto. Cuando termines la fase y el informe 13 puntos: DETENTE.

# PROMPT PARA GLM 5.3 FLASH — SMR HUB
# FASE 6D.8 — HARDENING DE CONTRATOS + INTEGRACIÓN MÍNIMA

Eres un agente de código senior trabajando sobre el repositorio real:

https://github.com/NormalGuy749/SMR_Hub

Proyecto: SMR Hub
Stack: HTML + CSS + JavaScript vanilla, sin framework ni build step.

Tu misión es IMPLEMENTAR EXCLUSIVAMENTE LA FASE 6D.8.

No debes continuar automáticamente a 6D.9.

Actúa como implementador senior:
- inspecciona antes de modificar;
- utiliza el código real del repositorio como fuente de verdad;
- modifica lo mínimo;
- evita refactors innecesarios;
- prueba todo lo que cambies;
- documenta las decisiones;
- si el prompt contradice al repositorio real, MANDA EL REPOSITORIO.

==================================================
0. REGLA ABSOLUTA: LA REALIDAD DEL REPO MANDA
==================================================

Antes de modificar cualquier archivo, inspecciona el repositorio real.

Si alguna cifra, firma, nombre de archivo, consumidor, estructura o comportamiento descrito en este prompt difiere del checkout real:

1. no fuerces el código para adaptarlo al prompt;
2. utiliza el código real como fuente de verdad;
3. documenta la discrepancia;
4. toma la decisión arquitectónica correcta a partir del estado real.

Las referencias a líneas concretas son orientativas.

==================================================
1. PASO 0 — INSPECCIÓN OBLIGATORIA
==================================================

ANTES DE MODIFICAR CUALQUIER ARCHIVO:

Lee e inspecciona como mínimo:

- index.html
- js/data.js
- js/curriculum.js
- js/topics.js
- js/questionTopics.js
- js/contentTopics.js
- js/moduleTopics.js
- js/srs.js
- js/profile.js
- js/questions.js
- js/content.js
- js/tests.js
- js/app.js

Realiza además una búsqueda global de consumidores de:

- SMR.getModule
- SMR.getModuleById
- SMR.curriculumIndex
- SMR.getCurriculumModules
- SMR.moduleTopics
- SMR.questionTopics
- SMR.contentTopics
- SMR.topics
- SMR.moduleEquivalences
- SMR.equivalentModules
- topicOf
- topicsOfModule
- modulesOfTopic

No asumas que solo los archivos anteriores son relevantes.

Comprueba también qué infraestructura de tests está REALMENTE versionada.

NO asumas que scripts históricos de scratch_* siguen existiendo.

Antes de modificar nada, presenta un resumen breve, máximo 10 líneas, indicando:

- consumidores reales encontrados;
- infraestructura de tests disponible;
- colisiones relevantes;
- cualquier discrepancia encontrada entre este prompt y el repo.

EN ESTE PASO NO MODIFIQUES NADA.

==================================================
2. CONTEXTO TÉCNICO VERIFICADO
==================================================

El proyecto ya dispone de las siguientes capas de arquitectura.

--------------------------------------------------
js/curriculum.js
--------------------------------------------------

Índice curricular.

API existente:

- SMR.curriculumIndex()
- SMR.getCurriculumModules(curriculumId)
- SMR.getModule(curriculumId, course, code)
- SMR.getModuleById(moduleId)
- SMR.validateCurriculumIndex()

Identidad de módulo:

curriculumId:c1|c2|cx:code

Cuando existe una colisión real se genera un sufijo determinista:

- -2
- -3
- etc.

Ejemplo real:

aragon:c2:1713
aragon:c2:1713-2

IMPORTANTE:

Actualmente getModule() utiliza bucket.find() y puede devolver arbitrariamente la primera coincidencia, ocultando una ambigüedad real.

getModuleById() permite identificar una instancia concreta.

--------------------------------------------------
js/topics.js
--------------------------------------------------

Taxonomía de topics.

API:

- SMR.topics
- SMR.topics.resolveTopicId()
- SMR.topics.registeredRawTopics()
- SMR.topics.validateTopics()

55 topics canónicos.

--------------------------------------------------
js/questionTopics.js
--------------------------------------------------

API:

- SMR.questionTopics()
- SMR.topicOf(questionId)
- SMR.questionsOfTopic(topicId)
- SMR.validateQuestionTopics()

154 preguntas mapeadas.

--------------------------------------------------
js/contentTopics.js
--------------------------------------------------

API:

- SMR.contentTopics()
- SMR.topicOfResource()
- SMR.topicsOfResource()
- SMR.topicOfCase()
- SMR.topicsOfCase()
- SMR.resourcesOfTopic()
- SMR.casesOfTopic()
- SMR.validateContentTopics()

19 recursos y 6 casos.

--------------------------------------------------
js/moduleTopics.js
--------------------------------------------------

API:

- SMR.moduleTopics()
- SMR.topicsOfModule(moduleId)
- SMR.modulesOfTopic(topicId)
- SMR.topicOfModule(moduleId)
- SMR.validateModuleTopics()
- SMR.moduleEquivalences()
- SMR.equivalentModules(moduleId)
- SMR.validateModuleEquivalences()

Existe además:

- SMR.__moduleTopicsInternals

que es una superficie interna destinada a pruebas.

--------------------------------------------------
js/srs.js
--------------------------------------------------

SRS v4.

IMPORTANTE:

SMR.srs es un OBJETO, no una función.

Incluye:

- buildIndex
- idOf
- resolveSrsKey
- isLegacyKey
- isStableKey
- migrateProgressData
- questionHashInput

NO cambies la identidad estable del SRS.

--------------------------------------------------
js/profile.js
--------------------------------------------------

Incluye:

- SMR.profile
- SMR.getStudentModules(course, p)

NO cambies el modelo de perfil.

==================================================
3. CIFRAS DE REFERENCIA
==================================================

Estado actual aproximado del sistema:

- 227 instancias de módulos
- 55 topics
- 154 preguntas
- 19 recursos
- 6 casos
- 905 relaciones module-topic
- 139 instancias con links
- 88 sin links
- 7 topics sin módulo
- 20 grupos strong
- 1182 pares strong
- 12 reglas partial
- 328 pares partial
- 16 electivas excluidas de equivalencias
- 2 huérfanos conocidos

Estas cifras son DETECTORES DE REGRESIÓN.

NO deben cambiar durante 6D.8 salvo que exista una razón técnica explícita y documentada.

==================================================
4. INT-01 — ENDURECER getModule()
==================================================

Problema:

Existe un caso real como:

aragon:c2:1713
aragon:c2:1713-2

Ambas instancias comparten:

- course = c2
- code = 1713

Actualmente getModule(curriculumId, course, code) utiliza find() y devuelve la primera coincidencia.

Esto oculta la ambigüedad.

OBJETIVO:

Hacer que el contrato de getModule() sea inequívoco.

La dirección recomendada es:

- si existe exactamente una coincidencia, devolverla;
- si existen varias coincidencias, NO devolver arbitrariamente la primera;
- la ambigüedad debe ser visible para el consumidor;
- si no existe ninguna, devolver null/undefined según el contrato que determines;
- getModuleById() debe continuar siendo la vía exacta para identificar una instancia concreta.

Puedes elegir una variante técnicamente mejor si la justificas.

NO implementes una solución arbitraria solo porque aparece una recomendación en este prompt.

Además:

Si hace falta una API de enumeración de coincidencias, créala solo si realmente es necesaria y con el mínimo alcance posible.

Tests mínimos:

1. búsqueda única válida;
2. búsqueda ambigua;
3. caso Aragón 1713;
4. getModuleById('aragon:c2:1713');
5. getModuleById('aragon:c2:1713-2');
6. inexistencia;
7. curso inválido;
8. validateCurriculumIndex() continúa detectando correctamente los structural duplicates.

IMPORTANTE:

Según la auditoría previa, no existe actualmente ningún consumidor de getModule() fuera de su propia definición y exportación.

Comprueba esto nuevamente sobre el repo.

Si sigue siendo cierto, documenta que el endurecimiento del contrato no requiere migrar consumidores existentes.

==================================================
5. INT-02 — SUPERFICIES READ-ONLY
==================================================

Se han detectado estructuras internas expuestas públicamente en varias capas.

Entre ellas:

- curriculumIndex.byId
- curriculumIndex.byCurriculum
- arrays devueltos por getCurriculumModules()
- moduleTopics.byModuleId
- moduleTopics.byTopicId
- questionTopics.byQuestionId
- contentTopics.byResourceId
- contentTopics.byCaseId

El objetivo es impedir que un consumidor externo pueda corromper accidentalmente el estado interno.

PERO HAY UNA REGLA CRÍTICA:

Object.freeze(new Map()) NO HACE INMUTABLE AL MAP.

Un Map congelado mediante Object.freeze() sigue permitiendo:

- map.set()
- map.delete()
- map.clear()

Por tanto:

PROHIBIDO considerar Object.freeze(map) como protección suficiente.

Los tests DEBEN comprobar explícitamente estas operaciones cuando corresponda.

La estrategia final debe proporcionar una superficie realmente segura de solo lectura.

Puedes utilizar, según lo que justifique el código real:

- métodos de consulta;
- snapshots controlados;
- estructuras de solo lectura;
- arrays congelados;
- objetos congelados;
- otra solución sencilla y coherente.

NO hagas:

- deep clone en cada acceso;
- proxies complejos;
- wrappers genéricos innecesarios;
- clases abstractas para resolver un problema sencillo;
- recomputación completa de índices en cada llamada.

La solución debe:

1. mantener una complejidad de consulta razonable;
2. impedir la corrupción del estado interno;
3. mantener la estabilidad estructural entre llamadas;
4. no introducir una penalización innecesaria;
5. mantener los validadores funcionando.

Tests obligatorios:

A. consultar normalmente funciona;

B. intentar modificar una estructura devuelta NO modifica el estado interno;

C. probar explícitamente operaciones mutantes relevantes de Map:
   - set()
   - delete()
   - clear()

   cuando exista un Map expuesto o accesible;

D. probar mutaciones de arrays;

E. probar mutaciones de objetos;

F. volver a ejecutar los validadores después de los intentos de mutación;

G. comprobar que el índice original sigue intacto.

NO declares una API como "read-only" si un consumidor todavía puede modificar el estado interno mediante una referencia compartida.

==================================================
6. INT-03 — INTEGRACIÓN MÍNIMA
==================================================

La vista /curriculo de app.js utiliza directamente:

- D.curriculums
- cur.modules1
- cur.modules2

NO migres mecánicamente todo a las nuevas capas.

Distingue entre:

A) datos que legítimamente deben seguir viniendo de la fuente de verdad;

y

B) consultas derivadas que ya tienen una capa arquitectónica apropiada.

Por ejemplo:

Renderizar nombre, horas y datos curriculares desde la fuente de verdad puede ser perfectamente legítimo.

En cambio, una comprobación de completitud o existencia de módulos puede ser candidata natural para utilizar curriculumIndex.

Analiza los consumidores reales.

Prioridad:

1. /curriculo
2. consumidores de módulos
3. consumidores de topics
4. consumidores de recursos
5. consumidores de preguntas

Pero:

NO refactorices app.js en general.

NO migres código solo para "usar la arquitectura nueva".

Cada migración debe tener una razón concreta.

Si un acceso debe permanecer directamente sobre SMR_DATA, déjalo así y justifícalo en el informe.

==================================================
7. REGLAS DE CONSERVACIÓN
==================================================

NO hagas ninguna de estas cosas:

- no añadas topics;
- no añadas mappings educativos;
- no añadas equivalencias;
- no añadas preguntas;
- no modifiques preguntas existentes;
- no modifiques contenido educativo;
- no repares learning paths;
- no inventes relatedResource;
- no cambies SRS;
- no cambies IDs estables;
- no cambies progreso;
- no cambies profile;
- no introduzcas Supabase;
- no introduzcas autenticación;
- no introduzcas SEO;
- no introduzcas feedback;
- no introduzcas nuevas funcionalidades;
- no hagas rediseño UI;
- no hagas rediseño CSS;
- no hagas limpieza general del proyecto;
- no hagas una refactorización general de app.js;
- no crees educationalService ni una service layer genérica;
- no sustituyas la arquitectura actual por otra.

NO modifiques js/data.js salvo necesidad absoluta y justificada.

NO modifiques js/questions.js ni js/content.js para contenido educativo.

NO modifiques js/srs.js ni js/profile.js salvo que exista una regresión directa provocada por 6D.8 y quede demostrada.

Modifica el MENOR número de archivos posible.

==================================================
8. AVISOS HISTÓRICOS
==================================================

Existen avisos históricos conocidos relacionados con:

- 7 referencias rotas de learning paths;
- 71 relatedResource anulados/intencionadamente null.

NO los "arregles".

NO inventes información.

Deben seguir apareciendo exactamente los mismos avisos históricos.

No deben aparecer avisos nuevos derivados de tus cambios.

==================================================
9. LOGO OFICIAL
==================================================

El archivo:

SMR.png

es el logo oficial de SMR Hub.

NOTA VERIFICADA: en el checkout actual NO existe todavía ningún archivo PNG versionado.

Es normal: el logo pertenece al propietario del proyecto y aún no se ha integrado en el repositorio.

Durante 6D.8:

- NO generes ningún archivo de logo;
- NO crees ningún PNG ni placeholder visual;
- NO conviertas esta fase en una fase de branding o UI/UX;
- declara en el informe el estado real del asset (aún no versionado), quedando pendiente su integración para la fase posterior de rediseño UI/UX.

==================================================
10. TESTING
==================================================

Primero inspecciona qué infraestructura de tests existe realmente.

NO asumas que los tests históricos siguen versionados.

js/tests.js NO debe confundirse con un arnés de testing técnico: es el módulo de quizzes/autoevaluación.

Si falta infraestructura reproducible, crea SOLO lo estrictamente necesario para probar 6D.8.

Los tests deben poder ejecutarse con Node cuando sea posible.

Cobertura mínima:

- parseo de todos los JS;
- curriculum index;
- topics;
- questionTopics;
- contentTopics;
- moduleTopics;
- equivalencias;
- SRS;
- profile;
- getModule;
- getModuleById;
- ambigüedad 1713;
- mutabilidad;
- integración;
- ausencia de mutación de SMR_DATA;
- estabilidad de las cifras de referencia.

IMPORTANTE:

La prueba de mutabilidad debe intentar realmente mutar las estructuras, no limitarse a comprobar Object.isFrozen().

Por ejemplo, cuando corresponda, intenta:

- set()
- delete()
- clear()
- push()
- splice()
- asignaciones de propiedades

y después comprueba que el estado interno permanece intacto.

==================================================
11. AUSENCIA DE MUTACIÓN DE SMR_DATA
==================================================

Antes de dar por buena la fase:

1. crea una representación de referencia de SMR_DATA;
2. ejecuta consultas;
3. ejecuta validadores;
4. ejecuta tests de mutabilidad;
5. ejecuta las nuevas APIs;
6. compara el estado final.

Debe quedar demostrado que las capas derivadas NO mutan la fuente de verdad.

==================================================
12. REGRESIÓN
==================================================

Comprueba, hasta donde permita el entorno disponible, que siguen funcionando:

- navegación;
- las 14 rutas;
- currículo;
- perfil;
- progreso;
- historial;
- SRS;
- favoritos;
- tests de autoevaluación;
- casos;
- estadísticas;
- responsive;
- dark mode;
- accesibilidad;
- reduced motion;
- localStorage.

Si algo no puede verificarse realmente en navegador:

NO inventes que fue verificado.

Indícalo claramente en el informe.

==================================================
13. CRITERIOS DE ACEPTACIÓN
==================================================

6D.8 solo se considera completada si se cumplen TODOS estos puntos:

1. getModule() tiene un contrato inequívoco.
2. La ambigüedad 1713 está correctamente gestionada.
3. getModuleById() continúa identificando exactamente cada instancia.
4. Las APIs públicas no permiten corromper accidentalmente el estado interno.
5. Object.freeze() no se utiliza incorrectamente como supuesta protección de Map.
6. Los tests comprueban realmente set/delete/clear cuando corresponda.
7. Los consumidores relevantes utilizan las nuevas capas cuando realmente corresponde.
8. Los consumidores que permanecen sobre la fuente de verdad están justificados.
9. No se ha creado ninguna abstracción innecesaria.
10. SMR_DATA continúa siendo fuente de verdad.
11. SMR_DATA no es mutado por las capas.
12. No se han modificado mappings educativos existentes.
13. No se ha modificado SRS.
14. No se ha modificado progreso.
15. No se ha modificado profile.
16. Las 14 rutas no presentan regresiones conocidas.
17. Los validadores siguen funcionando.
18. Los warnings históricos permanecen sin alteración.
19. No existen errores de sintaxis.
20. Los tests de 6D.8 pasan.
21. No se ha convertido la fase en un rediseño UI/UX.
22. SMR.png sigue intacto (y sigue sin estar versionado, según el estado real).

==================================================
14. CONTROL DE CAMBIOS
==================================================

Antes de modificar un archivo, determina:

"¿Este archivo necesita realmente cambiar para resolver 6D.8?"

Si no:

NO lo modifiques.

Al terminar, ejecuta:

git status
git diff --stat
git diff

y revisa exactamente qué archivos han sido modificados.

No ocultes cambios.

Si has modificado un archivo fuera del alcance esperado, explica por qué.

==================================================
15. INFORME FINAL
==================================================

Cuando termines, entrega un informe técnico breve pero completo con:

1. Problema principal resuelto.
2. Contrato final de getModule().
3. Tratamiento de búsquedas ambiguas.
4. Cómo se han protegido las superficies read-only.
5. Cómo se han tratado específicamente Map.set/delete/clear.
6. Consumidores migrados.
7. Consumidores deliberadamente NO migrados.
8. Archivos modificados.
9. Archivos creados.
10. Tests ejecutados y comandos exactos.
11. Resultado PASS/FAIL de cada suite.
12. Regresión comprobada.
13. Estado de las cifras de referencia.
14. Confirmación de que SMR_DATA no fue mutado.
15. Estado de SMR.png.
16. Cambios deliberadamente NO realizados.
17. Riesgos o deuda restante.
18. Recomendación concreta para 6D.9.

Si algo falló:

DÍLO.

Si algo no pudo verificarse:

DÍLO.

No declares "completado" nada que no hayas podido verificar.

==================================================
16. REGLA FINAL — STOP
==================================================

IMPLEMENTA EXCLUSIVAMENTE 6D.8.

NO continúes automáticamente a:

- 6D.9
- UI/UX
- Supabase
- autenticación
- SEO
- comunidad
- feedback
- nuevas funcionalidades
- limpieza general

Cuando hayas terminado:

1. ejecuta los tests;
2. revisa git diff;
3. genera el informe final;
4. DETENTE.

NO hagas commit automáticamente.

NO hagas push automáticamente.

NO hagas merge automáticamente.

El repositorio está trabajando actualmente en la rama:

feature/6d8-hardening

El commit de seguridad previo existe en main (checkpoint "chore: checkpoint before 6D.8").

Preserva ese checkpoint.

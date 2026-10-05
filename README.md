# SMR Hub

## Plataforma educativa para CFGM Sistemas Microinformáticos y Redes

SMR Hub es una plataforma web educativa orientada a estudiantes del ciclo formativo de grado medio **Sistemas Microinformáticos y Redes (SMR)** en España.

El objetivo del proyecto es convertirse en una plataforma de estudio realmente útil para un estudiante de SMR, combinando:

- Contenido educativo estructurado.
- Tests y preguntas de calidad.
- Práctica y ejercicios.
- Seguimiento del progreso.
- Recomendaciones personalizadas.
- Herramientas técnicas.
- Recursos externos.
- Adaptación al currículo de la comunidad autónoma del estudiante.
- Diferenciación entre 1.º y 2.º curso.
- Información curricular basada en fuentes oficiales.

---

# 1. IMPORTANTE: INSTRUCCIONES PARA LA IA

Este proyecto ha sido trabajado anteriormente por otra IA y parte de esa implementación **no es fiable**.

Por tanto, antes de modificar el proyecto debes asumir que:

> **El código existente NO debe considerarse automáticamente correcto.**

Puede contener:

- datos inventados;
- datos de demostración;
- estructuras incompletas;
- información curricular incorrecta;
- `verified: true` sin una verificación real;
- comunidades autónomas faltantes;
- estructuras duplicadas;
- variables innecesarias;
- referencias a elementos inexistentes;
- errores de sintaxis;
- strings mal cerrados;
- arrays u objetos incompletos;
- recursos externos que no han sido comprobados;
- mezclas entre planes de estudios antiguos y actuales;
- funcionalidades aparentemente implementadas pero que realmente no funcionan.

### Regla fundamental

**No continúes simplemente añadiendo funcionalidades encima del código actual.**

Primero:

1. Inspecciona el proyecto completo.
2. Comprende su arquitectura.
3. Comprueba qué funciona realmente.
4. Detecta código roto.
5. Detecta datos falsos o no verificables.
6. Comprueba las referencias entre archivos.
7. Comprueba la lógica de persistencia.
8. Comprueba los tests.
9. Comprueba el sistema curricular.
10. Solo después decide qué debe modificarse.

---

# 2. OBJETIVO PRINCIPAL

El objetivo final es crear una plataforma de estudio de SMR que pueda adaptarse al estudiante según:

```text
Comunidad autónoma
        ↓
Curso académico
        ↓
Versión del currículo
        ↓
Curso (1.º / 2.º)
        ↓
Módulo
        ↓
Tema
        ↓
Contenido
        ↓
Práctica
        ↓
Evaluación
        ↓
Progreso
```

La plataforma debe distinguir entre:

- conocimiento técnico general de SMR;
- contenido curricular;
- distribución curricular por comunidad autónoma;
- curso académico;
- curso 1.º / 2.º;
- módulos;
- temas;
- preguntas;
- progreso individual.

---

# 3. PRINCIPIO MÁS IMPORTANTE DEL PROYECTO

## No confundir conocimiento técnico con currículo

Un tema puede ser técnicamente relevante para SMR sin pertenecer al mismo curso en todas las comunidades autónomas.

Por ejemplo:

```text
Montaje y mantenimiento de equipos
```

puede aparecer en una posición diferente dependiendo de la comunidad, curso académico o adaptación curricular.

Por tanto:

### INCORRECTO

```javascript
{
    name: "Montaje y mantenimiento",
    course: 1
}
```

### MEJOR

```javascript
{
    id: "hardware-montaje",
    title: "Montaje y mantenimiento de equipos",

    technicalContent: true,

    curriculumMappings: [
        {
            community: "EXTREMADURA",
            academicYear: "2026-2027",
            course: 2
        }
    ]
}
```

El contenido técnico debe poder existir independientemente de su ubicación curricular.

---

# 4. CURRÍCULO POR COMUNIDAD AUTÓNOMA

Una de las características principales de SMR Hub es adaptar la plataforma al currículo del estudiante.

La aplicación debe contemplar las comunidades y territorios correspondientes al ámbito educativo del proyecto, incluyendo como mínimo:

- Andalucía
- Aragón
- Asturias
- Illes Balears
- Canarias
- Cantabria
- Castilla-La Mancha
- Castilla y León
- Cataluña
- Comunidad Valenciana
- Extremadura
- Galicia
- Comunidad de Madrid
- Región de Murcia
- Navarra
- País Vasco
- La Rioja
- Ceuta
- Melilla

## IMPORTANTE

No se debe asumir que todas tienen exactamente la misma distribución.

La aplicación debe almacenar, como mínimo:

```javascript
{
    community: "...",
    academicYear: "...",
    curriculumVersion: "...",
    normative: [],
    sourceOfficial: [],
    verifiedAt: "...",

    modules1: [],
    modules2: [],

    electives: [],
    companyTraining: {},
    project: {},
    transition: {}
}
```

Los nombres exactos pueden adaptarse a la arquitectura existente, pero el concepto debe mantenerse.

---

# 5. FUENTES CURRICULARES

La información curricular debe proceder prioritariamente de fuentes oficiales.

Orden de prioridad:

1. Boletines oficiales / normativa autonómica.
2. Consejerías o departamentos oficiales de Educación.
3. Ministerio de Educación / TodoFP.
4. Portales oficiales de Formación Profesional.
5. Documentación oficial de centros públicos, únicamente como apoyo cuando sea necesario.

No utilizar una página de un centro educativo como única prueba para afirmar que un currículo autonómico es oficialmente así.

Cuando se utilice una fuente secundaria debe quedar claramente diferenciada.

---

# 6. TODOFP

TodoFP debe utilizarse como uno de los puntos de referencia principales para localizar los currículos y normativa.

Fuente de referencia:

https://todofp.es/

La página específica de currículos de SMR por comunidad autónoma puede utilizarse como índice para localizar la documentación correspondiente.

Pero:

> Encontrar una comunidad en TodoFP NO significa automáticamente que toda la información extraída de una fuente secundaria esté verificada.

Hay que consultar la normativa/documentación correspondiente cuando sea necesario.

---

# 7. EXTREMADURA

Extremadura es especialmente importante para este proyecto.

El proyecto debe permitir representar correctamente la distribución curricular de Extremadura según el curso académico correspondiente.

Como ejemplo de por qué esto es necesario, en documentación reciente se ha encontrado una distribución donde aparecen en 1.º:

- Sistemas Operativos Monopuesto.
- Aplicaciones Ofimáticas.
- Redes Locales.
- Seguridad Informática.

Y en 2.º aparecen módulos como:

- Montaje y Mantenimiento de Equipos.
- Sistemas Operativos en Red.
- Servicios en Red.
- Aplicaciones Web.

Pero **estos datos deben volver a verificarse contra la normativa vigente antes de marcarlos como definitivos**.

No asumir que esta distribución es válida para cualquier año.

---

# 8. CURSO ACADÉMICO

El sistema curricular debe distinguir entre años académicos.

Ejemplo:

```text
2024-2025
2025-2026
2026-2027
```

No mezclar automáticamente información de diferentes cursos.

Si existe una transición normativa, debe quedar explícita.

Nunca escribir algo como:

```javascript
verified: true
```

si no existe una fuente que permita justificarlo.

---

# 9. VERSIONES CURRICULARES

El proyecto debe poder representar situaciones como:

```text
Currículo anterior
        ↓
Transición
        ↓
Nuevo currículo
```

Debe ser posible saber:

- qué normativa se está utilizando;
- qué año académico representa;
- cuándo se verificó;
- qué módulos pertenecen a 1.º;
- qué módulos pertenecen a 2.º;
- qué elementos son comunes;
- qué elementos son optativos;
- qué información está pendiente de verificar.

No utilizar una variable genérica como:

```javascript
CURRICULUM_VERSIONS
```

para fingir que existen versiones verificadas si realmente no se han investigado.

---

# 10. ESTADO DE VERIFICACIÓN

Cada currículo debe tener un estado claro.

Ejemplo:

```javascript
status: "verified"
```

o:

```javascript
status: "partial"
```

o:

```javascript
status: "pending"
```

o:

```javascript
status: "secondary-source"
```

La aplicación nunca debe presentar como oficial información que solo ha sido inferida o encontrada en una fuente secundaria.

---

# 11. CONTENIDO EDUCATIVO

SMR Hub debe contener contenido educativo real, no simples listas de conceptos.

Cada módulo debería poder tener:

```text
Módulo
 ├── Tema
 │    ├── Explicación
 │    ├── Conceptos clave
 │    ├── Ejemplos
 │    ├── Errores frecuentes
 │    ├── Práctica
 │    ├── Preguntas
 │    └── Recursos externos
```

El contenido debe estar escrito para un estudiante de SMR.

Debe ser:

- claro;
- progresivo;
- técnicamente correcto;
- práctico;
- comprensible;
- suficientemente profundo;
- orientado a aprobar y, sobre todo, entender.

No convertir todo el contenido en definiciones de una línea.

---

# 12. PRIMER CURSO

El proyecto debe ofrecer una experiencia completa para 1.º SMR.

Los módulos exactos deben depender del currículo seleccionado.

Entre los módulos técnicos que pueden formar parte de 1.º según la comunidad/currículo se encuentran:

- Sistemas Operativos Monopuesto.
- Redes Locales.
- Aplicaciones Ofimáticas.
- Seguridad Informática.
- Otros módulos cuando corresponda.

No asumir que todos están en 1.º en todas las comunidades.

---

# 13. TESTS

El sistema de tests debe ser una parte central de la aplicación.

No se deben generar cientos de preguntas superficiales simplemente para aumentar el número.

Las preguntas deben incluir distintos tipos:

### Conocimiento

```text
¿Qué es DHCP?
```

### Comprensión

```text
¿Por qué un equipo necesita una dirección IP?
```

### Aplicación

```text
¿Qué configuración utilizarías para esta red?
```

### Diagnóstico

```text
Un equipo tiene conexión física pero no obtiene IP.
¿Qué comprobarías?
```

### Escenario

```text
Una pequeña empresa tiene 20 equipos...
¿Cómo configurarías la red?
```

### Procedimiento

```text
Ordena los pasos para instalar/configurar...
```

### Comparación

```text
Diferencias entre TCP y UDP.
```

### Cálculo

```text
Calcula hosts disponibles en una determinada subred.
```

### Detección de errores

```text
Esta configuración tiene un error.
¿Cuál?
```

### Casos prácticos

Situaciones similares a las que podría encontrarse un técnico.

---

# 14. EXPLICACIÓN DE LAS RESPUESTAS

Una pregunta no debería terminar simplemente con:

```text
Correcto
```

Debe explicar:

- por qué la respuesta es correcta;
- por qué las demás son incorrectas;
- qué concepto está evaluando;
- qué error conceptual podría haber cometido el estudiante.

Ejemplo:

```javascript
{
    question: "...",

    options: [],

    correctAnswer: "...",

    explanation: "...",

    optionExplanations: {},

    difficulty: "intermediate",

    type: "diagnosis",

    topics: [],

    modules: [],

    communities: ["all"]
}
```

---

# 15. DIFICULTAD

Las dificultades deben tener significado real.

Por ejemplo:

```text
basic
intermediate
advanced
```

### Básico

Reconocer y comprender conceptos fundamentales.

### Intermedio

Aplicar conocimientos.

### Avanzado

Resolver problemas, diagnosticar errores o trabajar con escenarios.

No marcar aleatoriamente las preguntas como `advanced`.

---

# 16. ADAPTACIÓN DE TESTS

Los tests deben poder filtrarse por:

- comunidad;
- curso;
- módulo;
- tema;
- dificultad;
- tipo de pregunta;
- progreso;
- errores;
- contenido pendiente.

Ejemplo:

```text
Extremadura
↓
1.º SMR
↓
Redes Locales
↓
Subredes
↓
10 preguntas
```

---

# 17. PREGUNTAS COMUNES

Una pregunta puede ser válida para todas las comunidades.

En ese caso:

```javascript
communities: ["all"]
```

Si depende de un currículo concreto:

```javascript
communities: ["EXTREMADURA"]
```

Pero no utilizar la comunidad para limitar artificialmente conocimientos técnicos que son universales.

---

# 18. RECURSOS EXTERNOS

La aplicación debe poder enlazar recursos externos de calidad.

Ejemplos de fuentes potencialmente útiles:

- Cisco Networking Academy
- Microsoft Learn
- MDN
- Ubuntu Documentation
- Wireshark
- Cloudflare Learning
- LibreOffice
- VirtualBox

Ejemplos:

https://www.netacad.com/

https://learn.microsoft.com/es-es/training/

https://developer.mozilla.org/es/

https://documentation.ubuntu.com/

https://www.wireshark.org/

https://www.cloudflare.com/learning/

https://www.libreoffice.org/

https://www.virtualbox.org/

Los enlaces deben comprobarse antes de incorporarlos.

---

# 19. NO COPIAR CONTENIDO EXTERNO

Los recursos externos deben utilizarse como referencias.

No copiar grandes cantidades de contenido protegido.

La aplicación puede almacenar:

```javascript
{
    title: "...",
    provider: "...",
    url: "...",
    description: "...",
    type: "documentation",
    language: "es",
    level: "intermediate",
    topics: [],
    free: true,
    official: true,
    lastVerified: "..."
}
```

---

# 20. FLUJO EDUCATIVO IDEAL

El contenido debería seguir este flujo:

```text
Explicación interna
        ↓
Ejemplo
        ↓
Ejercicio
        ↓
Test
        ↓
Corrección
        ↓
Repaso
        ↓
Recurso externo
        ↓
Ejercicio más avanzado
```

La plataforma no debe limitarse a ser una colección de PDFs y preguntas.

---

# 21. PROGRESO DEL USUARIO

El progreso es independiente del currículo seleccionado.

Cambiar de comunidad autónoma NO debe borrar:

- preguntas respondidas;
- estadísticas;
- favoritos;
- progreso;
- historial;
- racha;
- errores;
- contenidos completados.

Debe almacenarse separadamente:

```text
USER PROFILE
CURRICULUM
CONTENT
QUESTIONS
PROGRESS
```

No mezclar estos conceptos.

---

# 22. CAMBIO DE COMUNIDAD

El usuario debe poder cambiar:

```text
Comunidad autónoma
Curso académico
Curso
```

sin perder su progreso.

Por ejemplo:

```text
Antes:
Extremadura
1.º

Después:
Andalucía
1.º
```

El contenido mostrado cambia.

El historial personal permanece.

---

# 23. DASHBOARD

El dashboard debería mostrar información relevante para el estudiante.

Por ejemplo:

- progreso general;
- progreso por módulo;
- temas pendientes;
- preguntas falladas;
- racha;
- objetivos;
- recomendaciones;
- próximos temas;
- tiempo de estudio;
- dominio aproximado de cada módulo.

Las recomendaciones deberían tener en cuenta:

```text
Comunidad
Curso
Módulo
Progreso
Errores
Dificultad
Tiempo disponible
```

---

# 24. HERRAMIENTAS

El proyecto ya dispone o pretende disponer de herramientas técnicas como:

- calculadora de subredes;
- conversores;
- generador de contraseñas;
- tabla de puertos;
- herramientas relacionadas con redes y sistemas.

No eliminar funcionalidades existentes sin una razón técnica.

Antes de sustituir una herramienta, comprobar:

1. dónde se utiliza;
2. qué funciones llama;
3. qué datos guarda;
4. qué componentes dependen de ella.

---

# 25. COMPATIBILIDAD

La aplicación debe seguir funcionando como aplicación web sin depender obligatoriamente de un servidor.

Debe conservarse, cuando sea compatible con la arquitectura actual:

- `localStorage`;
- funcionamiento offline de las funciones internas;
- responsive design;
- modo oscuro;
- accesibilidad;
- reducción de movimiento;
- tamaños de texto;
- navegación mediante teclado.

Los recursos externos pueden requerir Internet, pero la aplicación no debe romperse si no existe conexión.

---

# 26. ARCHIVOS EXISTENTES

Antes de modificar nada, localizar y comprender los archivos principales.

Actualmente el proyecto puede contener archivos como:

```text
index.html
app.js
data.js
tools.js
tests.js
style.css
app.css
```

Puede haber otros archivos.

No asumir que estos son los únicos.

Primero inspeccionar el proyecto real.

---

# 27. REGLA SOBRE ARQUITECTURA

No reconstruir el proyecto desde cero salvo que sea técnicamente imprescindible.

Primero intentar:

```text
Auditar
↓
Corregir
↓
Refactorizar
↓
Mejorar
```

y solo después considerar una reestructuración importante.

Si se decide hacer una modificación arquitectónica grande, justificarla antes.

---

# 28. NO CREAR DATOS DE RELLENO

Evitar estructuras como:

```javascript
{
    title: "Tema 1",
    description: "Contenido..."
}
```

si se presentan como contenido real.

No crear:

- módulos ficticios;
- normativas ficticias;
- fuentes ficticias;
- URLs inventadas;
- preguntas duplicadas para inflar el banco;
- comunidades con datos falsos;
- fechas de verificación falsas.

Si un dato no ha podido verificarse:

```text
PENDING
```

es mejor que inventarlo.

---

# 29. NO USAR `verified: true` SIN EVIDENCIA

Esta regla es especialmente importante.

Incorrecto:

```javascript
{
    community: "EXTREMADURA",
    verified: true
}
```

si no existe una fuente verificable asociada.

Correcto:

```javascript
{
    community: "EXTREMADURA",

    verification: {
        status: "verified",
        verifiedAt: "2026-10-03",
        sources: [
            "..."
        ]
    }
}
```

O:

```javascript
{
    community: "EXTREMADURA",

    verification: {
        status: "pending",
        sources: []
    }
}
```

---

# 30. EVITAR CÓDIGO ARTIFICIAL

No crear cientos de variables solamente para aparentar que se ha realizado una investigación.

Por ejemplo, estructuras como:

```javascript
CURRICULUM_MONTHS
CURRICULUM_MONTHS_TO_DATE
CURRICULUM_MONTHS_TO_FULL
CURRICULUM_MONTHS_TO_DISPLAY
CURRICULUM_MONTHS_TO_DISPLAY_2
...
```

deben evitarse si no tienen una utilidad real.

El código debe ser:

- mantenible;
- comprensible;
- reutilizable;
- coherente.

---

# 31. CALIDAD DEL CÓDIGO

Antes de finalizar cualquier modificación:

### JavaScript

Comprobar:

- sintaxis;
- strings;
- arrays;
- objetos;
- llaves;
- paréntesis;
- imports;
- referencias;
- funciones;
- variables inexistentes.

### HTML

Comprobar:

- elementos cerrados;
- IDs duplicados;
- referencias inexistentes;
- estructura DOM.

### CSS

Comprobar:

- selectores;
- reglas rotas;
- estilos duplicados;
- conflictos.

---

# 32. REFERENCIAS INTERNAS

Comprobar que:

```text
ID utilizado
```

realmente existe.

Por ejemplo:

```javascript
resourceId: "wifi-security-01"
```

debe corresponder a un recurso existente.

No dejar referencias a IDs inexistentes.

---

# 33. LOCALSTORAGE

No romper la información existente almacenada por usuarios.

Si se cambia el formato de datos:

```text
versión antigua
        ↓
migración
        ↓
versión nueva
```

Preferiblemente utilizar una versión de almacenamiento:

```javascript
STORAGE_VERSION
```

y migraciones controladas.

No borrar automáticamente todos los datos del usuario simplemente porque cambió la estructura interna.

---

# 34. TESTS DEL PROYECTO

El proyecto debe comprobar al menos:

### Inicio

La aplicación carga sin errores.

### Datos

Los datos tienen la estructura esperada.

### Referencias

No existen referencias a IDs inexistentes.

### Currículo

Las comunidades tienen estructuras válidas.

### Filtros

Los filtros por comunidad y curso funcionan.

### Preguntas

Las preguntas tienen respuestas válidas.

### Progreso

El progreso se conserva.

### LocalStorage

Los datos persisten después de recargar.

### UI

Los componentes principales siguen funcionando.

---

# 35. AUDITORÍA OBLIGATORIA

Antes de afirmar que el trabajo está terminado, realizar una auditoría.

Comprobar:

```text
[ ] La aplicación inicia
[ ] No hay errores de JavaScript
[ ] No hay datos falsos presentados como reales
[ ] No hay URLs inventadas
[ ] No hay referencias rotas
[ ] Los currículos están correctamente separados
[ ] No se mezclan años académicos
[ ] Las comunidades están diferenciadas
[ ] Extremadura está correctamente tratada
[ ] Los módulos de 1.º son correctos según la fuente
[ ] Los módulos de 2.º son correctos según la fuente
[ ] Los tests funcionan
[ ] Los filtros funcionan
[ ] El progreso funciona
[ ] LocalStorage funciona
[ ] No se ha eliminado funcionalidad existente
[ ] La aplicación sigue siendo responsive
[ ] La accesibilidad no se ha degradado
```

---

# 36. INFORME FINAL OBLIGATORIO

Cuando termines una tarea importante, no respondas simplemente:

```text
Hecho.
```

Entrega un informe estructurado:

## Archivos modificados

```text
archivo1.js
archivo2.js
...
```

## Problemas encontrados

Lista de errores reales.

## Problemas corregidos

Lista de correcciones.

## Datos eliminados

Indicar cualquier dato ficticio, duplicado o no verificable que haya sido eliminado.

## Currículos verificados

```text
Andalucía       → VERIFIED / PARTIAL / PENDING
Aragón          → ...
Asturias        → ...
...
Extremadura     → ...
```

## Fuentes utilizadas

Indicar las fuentes reales utilizadas.

## Tests ejecutados

Indicar qué comprobaciones se realizaron y su resultado.

## Problemas pendientes

Si algo no pudo verificarse, decirlo explícitamente.

---

# 37. ORDEN DE TRABAJO RECOMENDADO

Cuando recibas este proyecto, sigue este orden:

## FASE 1 — INSPECCIÓN

Leer todos los archivos relevantes.

No modificar todavía.

---

## FASE 2 — DIAGNÓSTICO

Detectar:

- errores;
- arquitectura;
- datos falsos;
- duplicaciones;
- funcionalidades existentes;
- dependencias;
- problemas curriculares.

---

## FASE 3 — CORRECCIÓN

Corregir primero los errores que impidan que la aplicación funcione correctamente.

---

## FASE 4 — DATOS

Revisar:

- currículo;
- comunidades;
- módulos;
- fuentes;
- preguntas;
- recursos.

---

## FASE 5 — ARQUITECTURA

Separar correctamente:

```text
Usuario
Currículo
Contenido
Preguntas
Progreso
Recursos
Herramientas
```

---

## FASE 6 — FUNCIONALIDAD

Comprobar:

- dashboard;
- navegación;
- búsqueda;
- tests;
- estadísticas;
- favoritos;
- herramientas;
- filtros;
- recomendaciones.

---

## FASE 7 — CURRÍCULO

Implementar correctamente:

```text
Comunidad
+
Año académico
+
Versión curricular
+
Curso
+
Módulos
```

---

## FASE 8 — CONTENIDO

Mejorar el contenido educativo.

---

## FASE 9 — TESTS

Mejorar el banco de preguntas y la evaluación.

---

## FASE 10 — QA

Realizar una auditoría completa.

---

# 38. PRIORIDADES

Si existe conflicto entre tareas, utilizar esta prioridad:

### PRIORIDAD 1

La aplicación debe funcionar.

### PRIORIDAD 2

Los datos deben ser correctos.

### PRIORIDAD 3

El currículo debe ser fiable.

### PRIORIDAD 4

La arquitectura debe ser mantenible.

### PRIORIDAD 5

El contenido educativo debe ser de calidad.

### PRIORIDAD 6

Los tests deben ser útiles.

### PRIORIDAD 7

La interfaz debe mejorar.

### PRIORIDAD 8

Añadir nuevas funcionalidades.

No sacrificar las prioridades superiores por añadir más funcionalidades.

---

# 39. REGLA CONTRA EL "FAKE COMPLETION"

No considerar una tarea terminada simplemente porque:

- existe una variable;
- existe una página;
- existe un botón;
- existe un objeto;
- existe una lista;
- aparece `verified: true`;
- aparece una fuente;
- el código parece grande.

Una funcionalidad está terminada cuando:

```text
Existe
+
Funciona
+
Está conectada
+
Está probada
+
Los datos son correctos
```

---

# 40. PRINCIPIO GENERAL

SMR Hub no debe intentar parecer una plataforma educativa mediante una gran cantidad de código.

Debe **ser** una plataforma educativa funcional.

Es preferible:

```text
10 módulos bien hechos
```

que:

```text
100 módulos ficticios
```

Es preferible:

```text
100 preguntas buenas
```

que:

```text
2.000 preguntas generadas y repetitivas
```

Es preferible:

```text
5 currículos correctamente verificados
```

que:

```text
19 currículos inventados
```

Y es preferible dejar:

```text
PENDING
```

antes que proporcionar información curricular incorrecta.

---

# 41. OBJETIVO FINAL

El resultado final debería permitir que un estudiante pueda entrar en SMR Hub y hacer algo parecido a:

```text
¿Dónde estudias?
        ↓
Extremadura
        ↓
¿Qué curso?
        ↓
1.º SMR
        ↓
¿Qué quieres estudiar?
        ↓
Redes Locales
        ↓
Tema: Direccionamiento IP
        ↓
Explicación
        ↓
Ejemplo
        ↓
Ejercicio
        ↓
Test
        ↓
Corrección explicada
        ↓
Repaso de errores
        ↓
Recurso externo
        ↓
Progreso actualizado
```

Y otro estudiante de otra comunidad autónoma debería recibir una experiencia adaptada a su propio currículo sin perder las funcionalidades generales de la plataforma.

---

# 42. REGLA FINAL PARA LA IA

Antes de escribir código, entiende el proyecto.

Antes de añadir datos, verifica los datos.

Antes de afirmar que algo está verificado, demuestra la fuente.

Antes de modificar una funcionalidad, comprueba sus dependencias.

Antes de eliminar algo, comprueba si otra parte del proyecto lo utiliza.

Antes de terminar, ejecuta una auditoría.

**No intentes impresionar con cantidad de código.**

**Prioriza exactitud, funcionamiento, trazabilidad, mantenibilidad y calidad educativa.**
# SMR Hub

**Plataforma de aprendizaje para el ciclo formativo de grado medio de Sistemas Microinformáticos y Redes (SMR).**

SMR Hub es un proyecto educativo orientado a estudiantes de Formación Profesional en España. Su objetivo es facilitar el aprendizaje de los conceptos técnicos de SMR mediante una experiencia de estudio práctica, organizada y adaptada al contexto curricular de cada estudiante.

La plataforma busca ayudar a comprender los contenidos, practicar los conocimientos adquiridos y preparar las evaluaciones con preguntas útiles y explicaciones claras.

## Acceso a la plataforma

- **Web principal:** https://smr-hub.pages.dev/
- **Alternativa en GitHub Pages:** https://normalguy749.github.io/SMR_Hub/
- **Repositorio:** https://github.com/NormalGuy749/SMR_Hub

Las rutas lógicas son las mismas en ambos hostings: `/tests`, `/recursos`,
`/herramientas`, `/glosario` y `/exportar`. En GitHub Pages se publican bajo
`/SMR_Hub/`, por ejemplo `/SMR_Hub/tests`; Inicio es la raíz de cada aplicación.
Cloudflare sirve `index.html` mediante `_redirects`. En GitHub Pages, `404.html`
transporta la ruta, consulta y hash al entrypoint del proyecto y el router los
restaura sin añadir otra entrada al historial. Canonical, sitemap y metadatos
sociales mantienen Cloudflare como dominio principal. El manifest y el Service
Worker usan el directorio de la aplicación para instalación y arranque offline.

## Objetivos del proyecto

SMR Hub se desarrolla con las siguientes prioridades:

- **Aprendizaje práctico:** facilitar el estudio mediante preguntas, tests y ejercicios orientados a la comprensión.
- **Calidad educativa:** priorizar la precisión técnica y la utilidad de los contenidos frente a la cantidad.
- **Adaptación curricular:** contemplar las diferencias entre comunidades autónomas, cursos académicos y cursos de primero y segundo.
- **Información verificable:** utilizar fuentes oficiales para fundamentar la información curricular y distinguir los datos confirmados de los que todavía requieren comprobación.
- **Continuidad del progreso:** procurar que los cambios de configuración académica no impliquen perder el historial personal de estudio.
- **Desarrollo responsable:** mantener una arquitectura comprensible, comprobar las modificaciones y evitar regresiones en las funcionalidades existentes.

## Funcionalidades y enfoque

La versión actual prioriza los **tests y las preguntas** como herramientas centrales de estudio.

El desarrollo del proyecto contempla una evolución progresiva hacia una experiencia educativa más completa, con contenidos estructurados, recursos de consulta, herramientas técnicas y seguimiento del aprendizaje. La disponibilidad de cada función depende de su implementación y validación efectiva.

## Adaptación al currículo de SMR

El contenido técnico y su distribución curricular son conceptos diferentes.

Un conocimiento puede ser relevante para el ciclo formativo sin pertenecer necesariamente al mismo módulo o curso en todas las comunidades autónomas. Por ello, SMR Hub pretende diferenciar entre:

- Conocimientos técnicos generales.
- Currículos y normativa aplicables.
- Comunidad autónoma.
- Curso académico y versión curricular.
- Distribución de módulos entre primero y segundo.
- Información verificada y datos pendientes de comprobación.

El objetivo es ofrecer una experiencia coherente con la formación del estudiante sin presentar como oficial una distribución curricular que no esté suficientemente documentada.

### Fuentes de referencia

La investigación curricular prioriza la normativa educativa publicada en boletines oficiales, las administraciones educativas competentes y la documentación oficial del Ministerio de Educación y Formación Profesional.

Como punto de partida para localizar información sobre el ciclo se encuentra el portal oficial de Formación Profesional:

https://www.todofp.es/

Las fuentes deben comprobarse antes de utilizarse como evidencia de una afirmación curricular.

## Criterios de calidad

El desarrollo de SMR Hub se guía por estos principios:

1. **Exactitud antes que cantidad.** Es preferible disponer de menos contenido bien elaborado que de grandes volúmenes de información repetitiva o incorrecta.
2. **Verificación antes que suposición.** Los datos no confirmados deben identificarse como pendientes.
3. **Funcionalidad antes que apariencia.** Una característica solo debe considerarse terminada cuando está integrada, funciona y ha sido comprobada.
4. **Trazabilidad.** Las afirmaciones curriculares deben poder relacionarse con fuentes identificables.
5. **Mantenimiento responsable.** Las modificaciones deben respetar la arquitectura existente y la información de los usuarios.
6. **Mejora progresiva.** Las nuevas funciones no deben comprometer la estabilidad de las ya existentes.

## Desarrollo técnico

SMR Hub se construye como una aplicación web. El proyecto contempla el uso de tecnologías web, persistencia de información en el navegador e integración con servicios externos para las funciones que los necesitan.

Las modificaciones deben comprobarse mediante pruebas adecuadas a su alcance, incluyendo la validación de la sintaxis, las referencias entre datos, la persistencia y las funcionalidades afectadas.

La presencia de código o de una interfaz no se considera, por sí sola, evidencia de que una función esté terminada.

## Estado del proyecto

SMR Hub continúa en desarrollo. Su evolución se centra en mejorar la utilidad real para los estudiantes, reforzar la fiabilidad de la información y consolidar las funcionalidades existentes antes de ampliar su alcance.

Las características futuras deben considerarse objetivos de desarrollo, no funciones disponibles, hasta que su implementación y funcionamiento se hayan verificado.

## Participación y seguimiento

Puedes consultar el código fuente, seguir la evolución del proyecto y revisar los cambios en el repositorio de GitHub:

https://github.com/NormalGuy749/SMR_Hub

Los errores reproducibles, las mejoras concretas y las referencias documentales fiables pueden ayudar a mejorar la plataforma.

---

**SMR Hub — aprender, practicar y comprender los Sistemas Microinformáticos y Redes.**
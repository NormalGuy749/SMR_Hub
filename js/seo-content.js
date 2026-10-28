'use strict';

/* Mismo contenido público en la SPA y en el HTML generado, sin datos personales. */
window.SMR_SEO = (function () {
  const D = window.SMR_DATA;
  const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const list = (items) => items.map((text) => `<li>${esc(text)}</li>`).join('');

  function home() {
    return `<section class="hero">
      <div class="hero-main">
        <p class="hero-eyebrow">Plataforma de estudio SMR</p>
        <h2>Aprende, practica y comprueba lo que sabes</h2>
        <p>SMR Hub te ayuda a estudiar Sistemas Microinformáticos y Redes con lecciones breves, preguntas explicadas y herramientas para comprobar tus cálculos. Puedes estudiar sin cuenta y guardar el progreso en tu navegador.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="tests">Practicar con tests</a>
          <a class="btn" href="recursos">Explorar recursos</a>
          <a class="btn" href="herramientas">Usar herramientas</a>
          <a class="btn" href="glosario">Consultar el glosario</a>
        </div>
      </div>
    </section>
    <section class="panel seo-copy" aria-labelledby="home-study">
      <h2 id="home-study">Del concepto a la práctica</h2>
      <p>Lee un recurso, resuelve sus ejercicios y comprueba lo aprendido con un test. El catálogo reúne contenidos de redes, sistemas operativos, hardware, seguridad, virtualización, mantenimiento y ofimática.</p>
      <p>Empieza por <a href="recursos/subnetting">subnetting IPv4</a>: interpreta prefijos, calcula rangos y revisa el resultado con la calculadora de subredes. Para organizar el repaso, abre una <a href="estudio">sesión de estudio guiada</a>.</p>
    </section>`;
  }

  function testsIntro() {
    return `<section class="panel seo-copy" aria-labelledby="tests-practice">
      <h2 id="tests-practice">Preguntas para estudiar Sistemas Microinformáticos y Redes</h2>
      <p>Practica con ${D.tests.length} tests y ${D.tests.reduce((n, t) => n + t.questions.length, 0)} preguntas del banco actual. Encontrarás redes, sistemas operativos, hardware, seguridad, virtualización, mantenimiento y ofimática: son categorías de estudio, no una relación de exámenes oficiales.</p>
      <p>En modo Práctica puedes leer la explicación después de responder. En modo Examen revisas los resultados al terminar; también puedes elegir cantidad y dificultad. Escoge un test del catálogo o configura un examen con varias categorías.</p>
      <p>Antes de responder, consulta los <a href="recursos">recursos de estudio</a>, las <a href="glosario">definiciones del glosario</a> o los <a href="recursos/subnetting">ejercicios de subnetting</a>.</p>
    </section>`;
  }

  function testsCatalog() {
    return `<section class="panel seo-copy"><h2>Catálogo de tests SMR</h2>
      <ul>${D.tests.map((t) => `<li><h3><a href="tests?test=${encodeURIComponent(t.id)}">${esc(t.title)}</a></h3><p>${esc(t.desc)} ${t.questions.length} preguntas.</p></li>`).join('')}</ul>
      <p>Activa JavaScript para iniciar los cuestionarios y guardar tus resultados.</p></section>`;
  }

  function glossaryIntro() {
    return `<section class="panel seo-copy" aria-labelledby="glossary-use">
      <h2 id="glossary-use">Conceptos para entender los recursos de SMR</h2>
      <p>Consulta ${D.glossary.length} términos de redes, sistemas operativos, hardware y seguridad. Cada definición aparece completa en esta página; puedes buscar por término o definición y filtrar por letra o categoría.</p>
      <p>Relaciona los conceptos con los <a href="recursos">recursos de estudio</a> y comprueba su aplicación en los <a href="tests">tests SMR</a>. Para practicar direccionamiento, consulta la <a href="recursos/subnetting">guía de subnetting IPv4</a>.</p>
    </section>`;
  }

  function termDefinition(t) {
    const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const related = D.resources.find((r) => fold(r.title + ' ' + r.desc).includes(fold(t.term)));
    return `<dt class="gloss-term" id="${esc(t.id)}">${esc(t.term)}</dt><dd class="gloss-def">${esc(t.definition)}</dd>${related ? `<dd class="gloss-links"><a href="recursos?q=${encodeURIComponent(related.title)}">Estudiar: ${esc(related.title)}</a></dd>` : ''}`;
  }

  function glossary() {
    return glossaryIntro() + `<dl class="row-list">${D.glossary.slice().sort((a, b) => a.term.localeCompare(b.term, 'es')).map((t) => `<div class="gloss-item">${termDefinition(t)}</div>`).join('')}</dl>`;
  }

  function subnetting() {
    const subnet = D.resources.find((r) => r.id === 'r-red-subnet-intermedio');
    const vlsm = D.resources.find((r) => r.id === 'r-red-vlsm-avanzado');
    const test = D.tests.find((t) => t.id === 't-redes');
    const questions = test.questions.filter((q) => q.topic === 'Subnetting' || q.topic === 'VLSM');
    return `<article class="panel seo-copy">
      <nav aria-label="Ruta de contenido"><a href="./">Inicio</a> / <a href="recursos">Recursos</a> / Subnetting</nav>
      <h2>Qué es subnetting IPv4</h2>
      <p>Subnetting divide una red IPv4 en subredes. El prefijo CIDR indica cuántos de los 32 bits identifican la red; los restantes corresponden a las direcciones dentro del bloque. En una /26 quedan 6 bits: 64 direcciones totales y 62 hosts utilizables al reservar red y broadcast.</p>
      <nav aria-label="En esta guía"><a href="recursos/subnetting#prefijos">Prefijos /25–/30</a> · <a href="recursos/subnetting#procedimiento">Procedimiento</a> · <a href="recursos/subnetting#practica">Práctica</a> · <a href="recursos/subnetting#calculadora">Calculadora</a> · <a href="recursos/subnetting#vlsm">VLSM</a> · <a href="recursos/subnetting#errores">Errores frecuentes</a></nav>
      <h2 id="prefijos">Tabla de prefijos CIDR /25 a /30</h2>
      <div class="table-wrap"><table class="port-table">
        <caption>Subredes IPv4 con red y broadcast reservados</caption>
        <thead><tr><th scope="col">Prefijo</th><th scope="col">Máscara</th><th scope="col">Direcciones</th><th scope="col">Hosts utilizables</th></tr></thead>
        <tbody>${Array.from({ length: 6 }, (_, i) => {
          const p = 25 + i, size = 2 ** (32 - p);
          return `<tr><th scope="row">/${p}</th><td>255.255.255.${256 - size}</td><td>${size}</td><td>${size - 2}</td></tr>`;
        }).join('')}</tbody>
      </table></div>
      <p>Para estos prefijos, hosts utilizables = 2<sup>32 − prefijo</sup> − 2. La regla cambia en un <strong>/31 punto a punto</strong>: sus dos direcciones pueden identificar los extremos, sin broadcast dirigido, según la <a href="https://www.rfc-editor.org/rfc/rfc3021.html">RFC 3021</a>. Un /32 identifica una sola dirección.</p>
      <h2 id="procedimiento">Procedimiento básico y ejemplo /26</h2>
      <ol>${list(subnet.content.slice(1, 5))}</ol>
      <p class="modal-example">${esc(subnet.lesson.example)}</p>
      <p>Al dimensionar una subred, elige el prefijo más largo (el bloque más pequeño) que cubra los hosts necesarios.</p>
      <h2 id="practica">Ejercicios para practicar</h2>
      <p><strong>${esc(subnet.exercise.prompt)}</strong></p>
      <details class="exercise-solution"><summary>Comprobar solución</summary><p>${esc(subnet.exercise.solution)}</p></details>
      <p>El <a href="tests?test=${encodeURIComponent(test.id)}">${esc(test.title)}</a> incluye ${questions.length} preguntas de subnetting y VLSM entre sus ${test.questions.length} preguntas. Practicarás hosts, red, broadcast, wildcard y reparto de bloques.</p>
      <h2 id="calculadora">Comprobar con la calculadora IPv4</h2>
      <p>Abre la <a href="herramientas?tool=subredes">calculadora de subredes</a> e introduce la IP y el prefijo del ejercicio para comparar red, broadcast, máscara y rango de hosts. La <a href="herramientas?tool=tabla-subredes">tabla de subredes</a> divide una red en bloques iguales.</p>
      <h2 id="vlsm">VLSM: subredes de distinto tamaño</h2>
      <p>${esc(vlsm.content[0])}</p>
      <ul>${list(vlsm.content.slice(1, 8))}</ul>
      <p>${esc(vlsm.lesson.example)}</p>
      <p><strong>${esc(vlsm.exercise.prompt)}</strong></p>
      <details class="exercise-solution"><summary>Comprobar reparto VLSM</summary><p>${esc(vlsm.exercise.solution)}</p></details>
      <p>Comprueba otro reparto con la <a href="herramientas?tool=vlsm">herramienta VLSM</a>. Usa bloques alineados, sin solapamientos y dentro de la red base.</p>
      <h2 id="errores">Errores frecuentes</h2>
      <ul>${list(subnet.lesson.commonErrors.concat(vlsm.lesson.commonErrors))}</ul>
      <h2>Recursos y fuentes para continuar</h2>
      <p>Esta guía reúne «${esc(subnet.title)}» y «${esc(vlsm.title)}», disponibles en el <a href="recursos?q=subnetting">catálogo de recursos</a>. Puedes abrir sus fichas y registrar tu estudio allí. Continúa con los <a href="tests">tests SMR</a> o consulta el <a href="glosario">glosario</a>.</p>
      <p>Referencia técnica: <a href="https://www.cisco.com/c/en/us/support/docs/ip/routing-information-protocol-rip/13788-3.html">Cisco: direccionamiento, subredes y VLSM</a>; para enlaces /31, <a href="https://www.rfc-editor.org/rfc/rfc3021.html">RFC 3021</a>.</p>
    </article>`;
  }

  return { home, testsIntro, testsCatalog, glossaryIntro, termDefinition, glossary, subnetting };
})();

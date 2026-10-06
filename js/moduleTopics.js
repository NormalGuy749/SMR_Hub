'use strict';

/* SMR Hub — Mapping curricular topic → módulo + equivalencias (fase 6D.6)
   ------------------------------------------------------------------
   Capa DERIVADA y de solo lectura. Dos subcapas separadas:

   1) moduleLinks  — ¿qué módulos curriculares enseñan este topic?
   2) equivalencias — qué instancias de distintos territorios son
      educativamente comparables (NUNCA fusionan identidad técnica).

   ESTRUCTURA DE EVIDENCIA (4 niveles, prioridad descendente):
   A. Contenidos oficiales del módulo (RD 1691/2007 Anexo I y
      distribuciones autonómicas aplicables; referenciados en
      SMR_DATA.curriculums[].normative/sources de la fase 4).
   B. Denominación oficial del módulo en el título.
   C. Referencias cruzadas entre denominaciones oficiales.
   D. Capa didáctica de SMR Hub (questionTopics/contentTopics):
      AUXILIAR, nunca autoridad. La relación curricular tiene
      justificación propia (regla 6 del encargo).

   La tabla está CURADA POR CÓDIGO: un mismo código oficial (0225,
   0226…) designa el mismo módulo educativo con denominación y
   contenidos oficiales comunes; la EXPANSIÓN a instancias se hace en
   carga usando las identidades territoriales de curriculum.js
   (curriculumId:c1|c2|cx:code). La identidad sigue siendo territorial:
   NO existe "0225 universal". Regla 10: el curso de modules1/modules2
   viene del contenedor (hecho en curriculum.js); electives/project
   conservan su curso propio o cx.

   Confianza: high (el topic está claramente incluido en los
   contenidos/denominación oficiales), medium (relación razonable con
   interpretación editorial razonada), low (posible pero débil),
   review (dudosa: NO se activa y NO se tabula; la ausencia en la
   tabla es el estado review).
   Rol: core (el módulo existe para enseñar esto), support (aporta de
   forma parcial/contextual), context (contexto: optatividad y
   módulos transversales LO 3/2022).

   DECISIÓN EDITORIAL — códigos SIN links (hueco documentado, no
   mapping falso):
   - 0228 Aplicaciones web: la taxonomía real de SMR Hub (6D.3, sobre
     contenido real) no tiene topics de programación web; inventarlos
     está prohibido (6D.3). Sin mapping.
   - 1708/1708190 Sostenibilidad: ningún topic cubre sostenibilidad ni
     ahorro energético. unmappedTopicCandidate futuro.
   - 1709/1710 Itinerario de empleabilidad, 0156 Inglés, A996/A997
     Tutoría: sin topics canónicos aplicables.
   - Electivas (CMO, CVOPM190, PA02XX, opt-*): contenido libre/no
     especificado en las fuentes; sin mapping y FUERA de equivalencias.
   - Contenido curricular sin topic canónico (documentado, no
     inventado): DHCP (0225/0227), bases de datos y ERP/CRM (0223),
     servidores web/FTP/correo (0227), directory services (0224),
     programación web (0228).

   EQUIVALENCIAS (regla 8): mismo código NO implica equivalencia; se
   exige misma denominación/contenidos oficiales. Modelo:
   - GRUPOS: instancias con mismo código y mismo segmento de curso
     (c1|c2|cx) y kind modules1/modules2/project → equivalencia
     'strong' (par a par, expandida en lectura). Electivas excluidas.
   - REGLAS PARCIALES CURADAS (bidireccionales, 'partial'/medium):
     mismo módulo oficial con cambio de curso entre territorios o con
     código autonómico distinto (Valencia). NO transitivas.
   - 'exact' no se usa: no hay dos territorios con idéntico horario de
     implantación (documentado en la auditoría).

   NO toca: data.js, topics.js, questionTopics.js, contentTopics.js,
   content.js, questions.js, tests.js, srs.js, profile.js, app.js,
   localStorage, progress, SRS, moduleLinks de topics.js (sigue
   reservado; este módulo mantiene SU PROPIA capa de moduleLinks). */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  const D = global.SMR_DATA || {};

  const MODULE_TOPICS_VERSION = 1;

  /* 6D.8 (INT-02): lookup vacío compartido para el caso sin dependencia. */
  const EMPTY_LOOKUP = Object.freeze(Object.create(null));

  /* ---------- Tabla curada POR CÓDIGO: topic → módulo ----------
     [topicId, role, confidence, evidence] */

  const CODE_LINKS = [
    { code: '0225', name: 'Redes locales', links: [
      ['t-subnetting', 'core', 'high', 'Contenidos oficiales 0225: direccionamiento IP y subnetting (RD 1691/2007 Anexo I)'],
      ['t-vlsm', 'core', 'high', 'Contenidos oficiales 0225: subnetting y VLSM/CIDR'],
      ['t-ethernet', 'core', 'high', 'Contenidos oficiales 0225: equipos y tecnologías de red local, switching'],
      ['t-vlan', 'core', 'high', 'Contenidos oficiales 0225: redes locales virtuales (VLAN)'],
      ['t-nat', 'core', 'high', 'Contenidos oficiales 0225: interconexión de redes privadas y públicas, NAT/PAT'],
      ['t-enrutamiento', 'core', 'high', 'Contenidos oficiales 0225: comunicación entre redes distintas, routers y gateways'],
      ['t-dns', 'core', 'high', 'Contenidos oficiales 0225: resolución de nombres (DNS)'],
      ['t-ipv6', 'core', 'high', 'Contenidos oficiales 0225: protocolos TCP/IP actuales e IPv6'],
      ['t-medios-transmision', 'core', 'high', 'Contenidos oficiales 0225: medios de transmisión cableados e inalámbricos'],
      ['t-diagnostico-red', 'support', 'high', 'Contenidos oficiales 0225: gestión y diagnóstico de la red local']
    ] },
    { code: '0226', name: 'Seguridad informática', links: [
      ['t-ingenieria-social', 'core', 'high', 'Denominación oficial Seguridad informática; contenidos: ataques y engaños, técnicas de phishing'],
      ['t-malware', 'core', 'high', 'Denominación oficial; contenidos: malware y técnicas de protección'],
      ['t-mfa', 'support', 'medium', 'Contenidos oficiales: mecanismos de autenticación y control de acceso; el topic es la instancia moderna MFA'],
      ['t-contrasenas', 'core', 'high', 'Contenidos oficiales: políticas de contraseñas y control de acceso'],
      ['t-cifrado', 'core', 'high', 'Denominación oficial; contenidos: cifrado de la información'],
      ['t-wifi', 'core', 'high', 'Contenidos oficiales: comunicaciones inalámbricas y seguridad de redes inalámbricas'],
      ['t-buenas-practicas-seguridad', 'core', 'high', 'Denominación oficial; contenidos: buenas prácticas y medidas de protección'],
      ['t-copias-seguridad', 'core', 'high', 'Contenidos oficiales aplicables: políticas de copias de seguridad']
    ] },
    { code: '0223', name: 'Aplicaciones ofimáticas', links: [
      ['t-documentos', 'core', 'high', 'Denominación oficial Aplicaciones ofimáticas; contenidos: procesador de textos avanzado'],
      ['t-hojas-calculo', 'core', 'high', 'Contenidos oficiales 0223: hoja de cálculo avanzada'],
      ['t-presentaciones', 'core', 'high', 'Contenidos oficiales 0223: presentaciones'],
      ['t-formatos-archivo', 'support', 'high', 'Contenidos oficiales 0223: interoperabilidad entre aplicaciones y formatos de datos']
    ] },
    { code: '0222', name: 'Sistemas operativos monopuesto', links: [
      ['t-instalacion-so', 'core', 'high', 'Denominación oficial SO monopuesto; contenidos: instalación y configuración de sistemas operativos'],
      ['t-permisos', 'core', 'high', 'Contenidos oficiales 0222: sistema de archivos, permisos y usuarios'],
      ['t-servicios', 'core', 'high', 'Contenidos oficiales 0222: servicios del sistema'],
      ['t-arranque', 'core', 'high', 'Contenidos oficiales 0222: arranque del sistema y resolución de incidencias de inicio'],
      ['t-registros-sistema', 'support', 'high', 'Contenidos oficiales 0222: registros de sucesos del sistema'],
      ['t-recuperacion-sistema', 'core', 'high', 'Contenidos oficiales 0222: recuperación del sistema ante fallos'],
      ['t-terminal', 'core', 'high', 'Contenidos oficiales 0222: uso de la línea de comandos del sistema'],
      ['t-powershell', 'support', 'medium', 'Contenidos oficiales: herramientas de scripting y línea de comandos; el módulo no nombra PowerShell'],
      ['t-procesos', 'core', 'high', 'Contenidos oficiales 0222: gestión de procesos'],
      ['t-memoria-virtual', 'core', 'high', 'Contenidos oficiales 0222: gestión de memoria del sistema operativo']
    ] },
    { code: '0224', name: 'Sistemas operativos en red', links: [
      ['t-particiones', 'core', 'high', 'Contenidos oficiales 0224: sistemas de archivos, particiones y despliegue de sistemas'],
      ['t-instalacion-so', 'support', 'medium', 'Contenidos oficiales 0224: despliegue, instalación, actualización y migración de sistemas operativos'],
      ['t-powershell', 'support', 'medium', 'Contenidos oficiales 0224: despliegue automatizado mediante scripts; el módulo no nombra PowerShell']
    ] },
    { code: '0227', name: 'Servicios en red', links: [
      ['t-dns', 'core', 'high', 'Distribución oficial aplicable 0227: instalación del servicio de resolución de nombres (DNS)'],
      ['t-nat', 'support', 'high', 'Distribución oficial aplicable 0227: instalación de servicios de traducción de direcciones NAT/PAT'],
      ['t-vlan', 'support', 'high', 'Distribución oficial aplicable 0227: instalación de redes locales virtuales (VLAN)'],
      ['t-diagnostico-red', 'support', 'medium', 'Denominación oficial Servicios en red: monitorización y diagnóstico de servicios; el topic se centra en conectividad']
    ] },
    { code: '0221', name: 'Montaje y mantenimiento de equipo', links: [
      ['t-cpu', 'core', 'high', 'Denominación oficial Montaje y mantenimiento; contenidos: componentes internos, procesador'],
      ['t-ram', 'core', 'high', 'Contenidos oficiales 0221: memoria y componentes internos'],
      ['t-fuente-alimentacion', 'core', 'high', 'Contenidos oficiales 0221: fuente de alimentación y alimentación del equipo'],
      ['t-placa-base', 'core', 'high', 'Contenidos oficiales 0221: placa base, chipset, sockets'],
      ['t-gpu', 'core', 'high', 'Contenidos oficiales 0221: tarjetas controladoras y salidas de vídeo'],
      ['t-refrigeracion', 'core', 'high', 'Contenidos oficiales 0221: disipación y refrigeración de componentes'],
      ['t-almacenamiento', 'core', 'high', 'Contenidos oficiales 0221: dispositivos de almacenamiento'],
      ['t-firmware', 'core', 'high', 'Contenidos oficiales 0221: configuración y actualización del firmware BIOS/UEFI'],
      ['t-mantenimiento-preventivo', 'core', 'high', 'Denominación oficial: mantenimiento del equipo; contenidos: mantenimiento preventivo'],
      ['t-averias', 'core', 'high', 'Denominación oficial: diagnóstico y reparación de averías de componentes'],
      ['t-diagnostico-hardware', 'core', 'high', 'Contenidos oficiales 0221: diagnóstico de componentes e incidencias de hardware'],
      ['t-diagnostico-metodologia', 'support', 'medium', 'Contenidos oficiales: diagnóstico sistemático de averías; el topic es el desarrollo didáctico del método'],
      ['t-hipervisores', 'support', 'medium', 'Contenidos oficiales 0221: sistemas de máquinas virtuales (VirtualBox, VMware…); el topic es la instancia didáctica']
    ] },
    { code: '1713', name: 'Proyecto intermodular', links: [
      ['t-casos-uso-virtualizacion', 'support', 'medium', 'Contenido oficial por integración de competencias; la capa didáctica fija la práctica integradora con virtualización (auxiliar: contentTopics)'],
      ['t-laboratorios-virtuales', 'support', 'medium', 'Contenido oficial por integración; la capa didáctica fija el laboratorio como práctica integradora (auxiliar: caso vm-laboratorio)'],
      ['t-diagnostico-metodologia', 'support', 'medium', 'Contenido oficial por integración; la capa didáctica fija el método de diagnóstico integrado (auxiliar: caso pc-lento)'],
      ['t-mantenimiento-preventivo', 'support', 'medium', 'Contenido oficial por integración; la capa didáctica fija el mantenimiento como práctica integradora'],
      ['t-copias-seguridad', 'context', 'low', 'Mención contextual: documentación y seguridad de la solución; relación débil, conservada por valor editorial']
    ] },
    { code: '1713707', name: 'Proyecto intermodular (código valenciano)', links: [
      ['t-casos-uso-virtualizacion', 'support', 'medium', 'Mismo módulo oficial que 1713 con código autonómico valenciano; ver evidencia 1713'],
      ['t-laboratorios-virtuales', 'support', 'medium', 'Mismo módulo oficial que 1713 con código autonómico valenciano; ver evidencia 1713'],
      ['t-diagnostico-metodologia', 'support', 'medium', 'Mismo módulo oficial que 1713 con código autonómico valenciano; ver evidencia 1713'],
      ['t-mantenimiento-preventivo', 'support', 'medium', 'Mismo módulo oficial que 1713 con código autonómico valenciano; ver evidencia 1713'],
      ['t-copias-seguridad', 'context', 'low', 'Mismo módulo oficial que 1713 con código autonómico valenciano; ver evidencia 1713']
    ] },
    { code: '1664', name: 'Digitalización aplicada a los sectores productivos', links: [
      ['t-formatos-archivo', 'context', 'medium', 'Denominación oficial Digitalización (LO 3/2022); contenidos: almacenamiento, intercambio y formatos de datos'],
      ['t-copias-seguridad', 'context', 'medium', 'Contenidos oficiales 1664: almacenamiento y custodia segura de la información'],
      ['t-cifrado', 'context', 'medium', 'Contenidos oficiales 1664: seguridad y protección de datos (RGPD) en el intercambio de información']
    ] },
    { code: '1664190', name: 'Digitalización aplicada al sistema productivo (código valenciano)', links: [
      ['t-formatos-archivo', 'context', 'medium', 'Mismo módulo oficial que 1664 con código autonómico valenciano; ver evidencia 1664'],
      ['t-copias-seguridad', 'context', 'medium', 'Mismo módulo oficial que 1664 con código autonómico valenciano; ver evidencia 1664'],
      ['t-cifrado', 'context', 'medium', 'Mismo módulo oficial que 1664 con código autonómico valenciano; ver evidencia 1664']
    ] }
  ];

  /* Códigos oficiales de referencia (coherencia con 6D.1). Sirve para
     detectar deriva de datos: si cambia el número de instancias de un
     código, el validador avisa. */
  const EXPECTED_INSTANCES = {
    '0221': 14, '0222': 14, '0223': 14, '0224': 14, '0225': 14,
    '0226': 14, '0227': 14, '1713': 25, '1664': 13, '1664190': 1,
    '1713707': 2
  };

  /* ---------- Reglas de equivalencia parcial (curadas, bidireccionales) ----------
     a/b: { code, segment }. Ambos lados deben existir en el índice. */

  const EQUIV_RULES = [
    { a: { code: '0221', segment: 'c2' }, b: { code: '0221', segment: 'c1' }, evidence: 'Mismo módulo oficial Montaje y mantenimiento de equipo: castilla-y-leon, navarra y extremadura lo secuencian en 2º; el resto en 1º' },
    { a: { code: '0223', segment: 'c2' }, b: { code: '0223', segment: 'c1' }, evidence: 'Mismo módulo oficial Aplicaciones ofimáticas: castilla-la-mancha lo secuencia en 2º (270 h); el resto en 1º' },
    { a: { code: '0226', segment: 'c1' }, b: { code: '0226', segment: 'c2' }, evidence: 'Mismo módulo oficial Seguridad informática: extremadura lo secuencia en 1º (Instrucción 12/2024, corrección 4C); el resto en 2º' },
    { a: { code: '0228', segment: 'c1' }, b: { code: '0228', segment: 'c2' }, evidence: 'Mismo módulo oficial Aplicaciones web: castilla-y-leon, navarra y castilla-la-mancha lo secuencian en 1º; el resto en 2º' },
    { a: { code: '0156', segment: 'c2' }, b: { code: '0156', segment: 'c1' }, evidence: 'Mismo módulo oficial Inglés profesional: madrid lo secuencia en 2º; el resto en 1º' },
    { a: { code: '1664', segment: 'c1' }, b: { code: '1664', segment: 'c2' }, evidence: 'Mismo módulo oficial Digitalización aplicada: posición en 1º o 2º variable entre territorios (nueva ordenación LO 3/2022)' },
    { a: { code: '1708', segment: 'c1' }, b: { code: '1708', segment: 'c2' }, evidence: 'Mismo módulo oficial Sostenibilidad aplicada: posición en 1º o 2º variable entre territorios' },
    { a: { code: '1713', segment: 'c1' }, b: { code: '1713', segment: 'c2' }, evidence: 'Mismo módulo oficial Proyecto intermodular: asturias lo reparte en 1º+2º (25 h + 25 h); el resto en 2º' },
    { a: { code: '1713', segment: 'cx' }, b: { code: '1713', segment: 'c2' }, evidence: 'Mismo módulo oficial Proyecto intermodular sin secuenciar (asturias, castilla-la-mancha, castilla-y-leon) frente al 2º curso mayoritario' },
    { a: { code: '1708190', segment: 'c2' }, b: { code: '1708', segment: 'c2' }, evidence: 'Código autonómico valenciano 1708190 del módulo oficial Sostenibilidad aplicada al sistema productivo' },
    { a: { code: '1664190', segment: 'c2' }, b: { code: '1664', segment: 'c2' }, evidence: 'Código autonómico valenciano 1664190 del módulo oficial Digitalización aplicada' },
    { a: { code: '1713707', segment: 'c2' }, b: { code: '1713', segment: 'c2' }, evidence: 'Código autonómico valenciano 1713707 del módulo oficial Proyecto intermodular' }
  ];

  /* ---------- Construcción de índices ---------- */

  let INDEX = null;

  function buildIndex() {
    const problems = [];
    const ix = (typeof SMR.curriculumIndex === 'function') ? SMR.curriculumIndex() : null;
    if (!ix) {
      INDEX = Object.freeze({ version: MODULE_TOPICS_VERSION, links: Object.freeze([]), byModuleId: EMPTY_LOOKUP, byTopicId: EMPTY_LOOKUP, modulesLinked: 0, codesWithoutLinks: Object.freeze([]), problems: Object.freeze([{ code: 'missing-dependency', detail: 'curriculum.js no cargado: capa no disponible' }]) });
      return INDEX;
    }

    const tableByCode = new Map(CODE_LINKS.map((c) => [c.code, c]));
    const seenCodes = new Set();
    const links = [];
    /* 6D.8 (INT-02): lookups internos sin prototipo; congelados al exponer. */
    const byModuleId = Object.create(null);
    const byTopicId = Object.create(null);
    const instancesPerCode = new Map();
    const codesWithoutLinks = [];

    ix.modules.forEach((m) => {
      const def = m.code != null ? tableByCode.get(String(m.code)) : null;
      if (!def) {
        codesWithoutLinks.push(m.moduleId);
        return;
      }
      instancesPerCode.set(String(m.code), (instancesPerCode.get(String(m.code)) || 0) + 1);
      const entries = [];
      def.links.forEach((row) => {
        const topicId = row[0], role = row[1], confidence = row[2], evidence = row[3];
        if (!entries.some((e) => e.topicId === topicId)) {
          entries.push(Object.freeze({
            moduleId: m.moduleId,
            code: String(m.code),
            topicId, role, confidence, evidence,
            status: 'active',
            curriculumId: m.curriculumId,
            kind: m.kind,
            courseSegment: m.courseSegment
          }));
        } else {
          problems.push({ code: 'duplicate-topic-link', moduleId: m.moduleId, topicId, detail: 'topicId duplicado en la tabla del código ' + m.code });
        }
      });
      entries.forEach((e) => {
        links.push(e);
        if (!(e.topicId in byTopicId)) byTopicId[e.topicId] = [];
        byTopicId[e.topicId].push(e);
      });
      byModuleId[m.moduleId] = entries;
      seenCodes.add(String(m.code));
    });

    /* Códigos de la tabla sin instancias reales (deriva de datos). */
    CODE_LINKS.forEach((c) => {
      if (!seenCodes.has(c.code)) problems.push({ code: 'unused-code', code: c.code, detail: 'la tabla enlaza el código ' + c.code + ' pero no existe en el índice curricular' });
    });
    /* Deriva de instancias esperadas (6D.1). */
    Object.keys(EXPECTED_INSTANCES).forEach((code) => {
      const got = instancesPerCode.get(code) || 0;
      if (got !== EXPECTED_INSTANCES[code]) {
        problems.push({ code: 'instance-count-drift', code, detail: 'código ' + code + ': ' + got + ' instancias (esperadas ' + EXPECTED_INSTANCES[code] + ' según 6D.1)' });
      }
    });

    INDEX = Object.freeze({
      version: MODULE_TOPICS_VERSION,
      totalModules: ix.total,
      links: Object.freeze(links),
      byModuleId: Object.freeze(byModuleId),
      byTopicId: Object.freeze(byTopicId),
      modulesLinked: Object.keys(byModuleId).length,
      codesWithoutLinks: Object.freeze(codesWithoutLinks.slice().sort()),
      problems: Object.freeze(problems)
    });
    return INDEX;
  }

  function ensureIndex() {
    if (!INDEX) buildIndex();
    return INDEX;
  }

  /* ---------- API pública: moduleLinks ---------- */

  function moduleTopics() { return ensureIndex(); }

  /* Topics de un módulo, en orden editorial declarado (determinista,
     independiente del orden de datos). [] si no existe o sin mapping. */
  function topicsOfModule(moduleId) {
    const entries = ensureIndex().byModuleId[String(moduleId)];
    return entries ? entries.map((e) => e.topicId) : [];
  }

  /* Módulos que enseñan un topic, orden lexicográfico de moduleId
     (independiente del orden de declaración de currículos). */
  function modulesOfTopic(topicId) {
    const entries = ensureIndex().byTopicId[String(topicId)];
    return entries ? entries.map((e) => e.moduleId).sort() : [];
  }

  /* Topic principal = el primero declarado (determinista). */
  function topicOfModule(moduleId) {
    const entries = ensureIndex().byModuleId[String(moduleId)];
    return entries && entries.length ? entries[0].topicId : null;
  }

  /* ---------- API pública: equivalencias ---------- */

  function moduleEquivalences() {
    const ix = ensureIndex();
    const groups = [];
    const groupByKey = new Map();
    const cix = (typeof SMR.curriculumIndex === 'function') ? SMR.curriculumIndex() : null;
    if (cix) {
      cix.modules.forEach((m) => {
        if (m.code == null) return; /* electivas: fuera de equivalencias */
        if (m.kind === 'electives') return;
        const key = String(m.code) + '/' + m.courseSegment;
        if (!groupByKey.has(key)) {
          groupByKey.set(key, { key, code: String(m.code), courseSegment: m.courseSegment, moduleIds: [], level: 'strong', confidence: 'high', status: 'active' });
        }
        groupByKey.get(key).moduleIds.push(m.moduleId);
      });
      groupByKey.forEach((g) => {
        /* Un grupo con un solo miembro no es equivalencia: se excluye
           (A996/A997 aragoneses quedan documentados como huérfanos en
           el validador, no como grupo trivial). */
        if (g.moduleIds.length < 2) return;
        g.moduleIds.sort();
        groups.push(Object.freeze(g));
      });
      groups.sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
    }

    const rules = EQUIV_RULES.map((r, i) => Object.freeze({
      id: 'eq-' + String(i + 1),
      a: Object.freeze({ code: r.a.code, segment: r.a.segment }),
      b: Object.freeze({ code: r.b.code, segment: r.b.segment }),
      equivalence: 'partial',
      confidence: 'medium',
      status: 'active',
      evidence: r.evidence
    }));

    const excluded = cix
      ? cix.modules.filter((m) => m.code == null || m.kind === 'electives').map((m) => m.moduleId).sort()
      : [];

    return Object.freeze({
      version: MODULE_TOPICS_VERSION,
      groups: Object.freeze(groups),
      partialRules: Object.freeze(rules),
      excludedElectives: Object.freeze(excluded),
      /* Nota de diseño: las equivalencias parciales NO son transitivas:
         0226/c1 ≈ 0226/c2 y 1713/c1 ≈ 1713/c2 no encadenan otros pares. */
      transitive: false
    });
  }

  /* Pares equivalentes de un módulo: strong (mismo código y curso) +
     partial (reglas curadas). Simétrico por construcción. */
  function equivalentModules(moduleId) {
    const cix = (typeof SMR.curriculumIndex === 'function') ? SMR.curriculumIndex() : null;
    if (!cix) return [];
    /* 6D.8 (INT-02): el índice ya no expone el Map byId; usar la API. */
    const me = (typeof SMR.getModuleById === 'function') ? SMR.getModuleById(moduleId) : null;
    if (!me || me.code == null || me.kind === 'electives') return [];

    const out = [];
    const push = (otherId, level, confidence) => {
      if (otherId === me.moduleId) return;
      if (!out.some((x) => x.moduleId === otherId)) out.push({ moduleId: otherId, equivalence: level, confidence });
    };

    /* Grupo strong: mismo código + mismo segmento de curso. */
    cix.modules.forEach((m) => {
      if (m.moduleId === me.moduleId || m.code == null || m.kind === 'electives') return;
      if (String(m.code) === String(me.code) && m.courseSegment === me.courseSegment) {
        push(m.moduleId, 'strong', 'high');
      }
    });

    /* Reglas parciales curadas, en ambas direcciones. */
    EQUIV_RULES.forEach((r) => {
      const sideA = me.code != null && String(me.code) === String(r.a.code) && me.courseSegment === r.a.segment;
      const sideB = me.code != null && String(me.code) === String(r.b.code) && me.courseSegment === r.b.segment;
      if (!sideA && !sideB) return;
      const target = sideA ? r.b : r.a;
      cix.modules.forEach((m) => {
        if (m.code == null || m.kind === 'electives') return;
        if (String(m.code) === String(target.code) && m.courseSegment === target.segment) {
          push(m.moduleId, 'partial', 'medium');
        }
      });
    });

    out.sort((x, y) => (x.moduleId < y.moduleId ? -1 : x.moduleId > y.moduleId ? 1 : 0));
    return out;
  }

  /* ---------- Validadores (solo lectura) ---------- */

  function validateModuleTopics() {
    const ix = ensureIndex();
    const errors = [];
    const warnings = [];
    const cix = (typeof SMR.curriculumIndex === 'function') ? SMR.curriculumIndex() : null;
    const validTopics = new Set((SMR.topics ? SMR.topics.list : []).map((t) => t.id));
    const moduleIds = new Set(cix ? cix.modules.map((m) => m.moduleId) : []);
    const ROLES = new Set(['core', 'support', 'context']);
    const CONFS = new Set(['high', 'medium', 'low', 'review']);

    ix.links.forEach((l) => {
      if (!validTopics.has(l.topicId)) errors.push({ code: 'unknown-topic', moduleId: l.moduleId, topicId: l.topicId, detail: 'topicId inexistente en SMR.topics' });
      if (!moduleIds.has(l.moduleId)) errors.push({ code: 'orphan-module', moduleId: l.moduleId, topicId: l.topicId, detail: 'moduleId inexistente en curriculumIndex' });
      if (!ROLES.has(l.role)) errors.push({ code: 'invalid-role', moduleId: l.moduleId, topicId: l.topicId, role: l.role });
      if (!CONFS.has(l.confidence)) errors.push({ code: 'invalid-confidence', moduleId: l.moduleId, topicId: l.topicId, confidence: l.confidence });
      if (l.status !== 'active') errors.push({ code: 'inactive-link', moduleId: l.moduleId, topicId: l.topicId, status: l.status, detail: 'los links en review NO se tabulan' });
    });

    /* Duplicados (moduleId, topicId). */
    const seen = new Set();
    ix.links.forEach((l) => {
      const k = l.moduleId + '|' + l.topicId;
      if (seen.has(k)) errors.push({ code: 'duplicate-link', moduleId: l.moduleId, topicId: l.topicId });
      seen.add(k);
    });

    ix.problems.forEach((p) => {
      if (p.code === 'unused-code' || p.code === 'instance-count-drift' || p.code === 'duplicate-topic-link') errors.push(p);
      else warnings.push(p);
    });

    const byConfidence = { high: 0, medium: 0, low: 0, review: 0 };
    const byRole = { core: 0, support: 0, context: 0 };
    ix.links.forEach((l) => {
      byConfidence[l.confidence] = (byConfidence[l.confidence] || 0) + 1;
      byRole[l.role] = (byRole[l.role] || 0) + 1;
    });

    const topicsCovered = Object.keys(ix.byTopicId).sort();

    return {
      ok: errors.length === 0,
      version: ix.version,
      totalModules: ix.totalModules,
      totalLinks: ix.links.length,
      modulesLinked: ix.modulesLinked,
      topicsCovered,
      topicsWithoutModules: (SMR.topics ? SMR.topics.list : []).map((t) => t.id).filter((id) => !(id in ix.byTopicId)).sort(),
      modulesWithoutTopics: ix.codesWithoutLinks,
      byConfidence,
      byRole,
      warnings,
      errors
    };
  }

  function validateModuleEquivalences() {
    const errors = [];
    const warnings = [];
    const cix = (typeof SMR.curriculumIndex === 'function') ? SMR.curriculumIndex() : null;
    if (!cix) {
      return { ok: false, version: MODULE_TOPICS_VERSION, groups: 0, groupMembers: 0, pairsStrong: 0, pairsPartial: 0, partialRules: EQUIV_RULES.length, excludedElectives: 0, warnings: [], errors: [{ code: 'missing-dependency', detail: 'curriculum.js no cargado' }] };
    }
    const moduleIds = new Set(cix.modules.map((m) => m.moduleId));
    const eq = moduleEquivalences();

    let groupMembers = 0;
    const pairStrong = new Set();
    eq.groups.forEach((g) => {
      g.moduleIds.forEach((id) => {
        groupMembers++;
        if (!moduleIds.has(id)) errors.push({ code: 'unknown-module', scope: g.key, moduleId: id, detail: 'miembro de grupo inexistente' });
      });
      if (new Set(g.moduleIds).size !== g.moduleIds.length) errors.push({ code: 'duplicate-group-member', scope: g.key });
      if (g.moduleIds.length < 1) warnings.push({ code: 'empty-group', scope: g.key });
      /* Pares strong del grupo (para conteo). */
      for (let i = 0; i < g.moduleIds.length; i++) {
        for (let j = i + 1; j < g.moduleIds.length; j++) pairStrong.add(g.moduleIds[i] + '|' + g.moduleIds[j]);
      }
    });

    let pairsPartial = 0;
    eq.partialRules.forEach((r) => {
      const aMembers = cix.modules.filter((m) => m.code != null && m.kind !== 'electives' && String(m.code) === r.a.code && m.courseSegment === r.a.segment);
      const bMembers = cix.modules.filter((m) => m.code != null && m.kind !== 'electives' && String(m.code) === r.b.code && m.courseSegment === r.b.segment);
      if (!aMembers.length || !bMembers.length) {
        errors.push({ code: 'unresolvable-rule', id: r.id, detail: 'regla ' + r.id + ' sin instancias reales en alguno de los lados (' + r.a.code + '/' + r.a.segment + ' ↔ ' + r.b.code + '/' + r.b.segment + ')' });
        return;
      }
      if (r.a.code === r.b.code && r.a.segment === r.b.segment) errors.push({ code: 'self-equivalence', id: r.id, detail: 'la regla compara un grupo consigo mismo' });
      pairsPartial += aMembers.length * bMembers.length;
    });

    /* Instancias no electivas fuera de grupos y reglas (informativo;
       las electivas ya se documentan en excludedElectives). */
    const grouped = new Set();
    eq.groups.forEach((g) => g.moduleIds.forEach((id) => grouped.add(id)));
    eq.partialRules.forEach((r) => {
      cix.modules.forEach((m) => {
        if (m.code != null && m.kind !== 'electives' && String(m.code) === r.a.code && m.courseSegment === r.a.segment) grouped.add(m.moduleId);
        if (m.code != null && m.kind !== 'electives' && String(m.code) === r.b.code && m.courseSegment === r.b.segment) grouped.add(m.moduleId);
      });
    });
    const orphans = cix.modules.filter((m) => !(m.code == null || m.kind === 'electives') && !grouped.has(m.moduleId)).map((m) => m.moduleId);
    if (orphans.length) warnings.push({ code: 'modules-without-equivalence', moduleIds: orphans, detail: 'instancias fuera de grupos y reglas (documentar en auditoría)' });

    return {
      ok: errors.length === 0,
      version: MODULE_TOPICS_VERSION,
      groups: eq.groups.length,
      groupMembers,
      pairsStrong: pairStrong.size,
      pairsPartial,
      partialRules: eq.partialRules.length,
      excludedElectives: eq.excludedElectives.length,
      warnings,
      errors
    };
  }

  SMR.moduleTopics = moduleTopics;
  SMR.topicsOfModule = topicsOfModule;
  SMR.modulesOfTopic = modulesOfTopic;
  SMR.topicOfModule = topicOfModule;
  SMR.validateModuleTopics = validateModuleTopics;
  SMR.moduleEquivalences = moduleEquivalences;
  SMR.equivalentModules = equivalentModules;
  SMR.validateModuleEquivalences = validateModuleEquivalences;

  /* Internos solo para las pruebas de la fase (no es API pública). */
  SMR.__moduleTopicsInternals = Object.freeze({ CODE_LINKS: Object.freeze(CODE_LINKS), EQUIV_RULES: Object.freeze(EQUIV_RULES), buildIndex });
})(typeof window !== 'undefined' ? window : globalThis);

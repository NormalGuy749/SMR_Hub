'use strict';

/* SMR Hub — Taxonomía canónica de temas (fase 6D.3)
   ------------------------------------------------------------------
   Capa de topics estable, derivada del análisis del contenido REAL de
   las 154 preguntas (evidencia en scratch_6d3/preguntas_por_topic.txt).

   Principios (diseño aprobado en 6D.1):
   - Identidad técnica t-<slug>: determinista, legible, única, sin
     hashes, sin dependencia de arrays, localStorage, SRS, tests,
     cursos ni comunidades.
   - La taxonomía NO sustituye categorías editoriales, módulos
     oficiales ni equivalencias curriculares: es una capa propia.
   - Los topicId NO se escriben en las preguntas: q.topic queda intacto
     y se resuelve vía aliases (SMR.resolveTopicId).
   - moduleLinks queda reservado y VACÍO: el anclaje curricular es de
     fases posteriores (6D.6) y requiere revisión con evidencia.
   - Fusión de raw strings SOLO cuando el contenido real confirma el
     mismo concepto; "Subnetting" y "VLSM" permanecen separados.

   Decisiones de fusión documentadas (raw → topic, con evidencia):
   - "Limpieza" → t-mantenimiento-preventivo (la limpieza interior es
     una tarea preventiva; evidencia: t-mantenimiento#1).
   - "Temperaturas" → t-refrigeracion (pasta térmica seca y >95 °C en
     carga son gestión térmica; t-mantenimiento#2, #8).
   - "SMART" → t-almacenamiento (salud de discos; t-mantenimiento#3 es
     casi idéntica a t-hardware#7, ambas sobre sectores reasignados).
   - "Recuperación" → t-recuperacion-sistema (punto de restauración
     aparece en t-mantenimiento#10 y t-sistemas#11: mismo concepto).
   - "Almacenamiento" → t-almacenamiento (SSD/TRIM/NVMe/sectores en
     t-mantenimiento#12 y t-hardware#6/#7: mismo concepto).
   - "Logs" → t-registros-sistema (Visor de eventos, journalctl y
     "Disk error 7" son análisis de registros; t-sistemas#14/#15,
     t-mantenimiento#16).
   - "Mantenimiento" (solo en t-hardware: pasta térmica) →
     t-refrigeracion, con alias CON SCOPE de categoría (un futuro
     raw "Mantenimiento" en otra categoría no debe caer aquí).
   - "Diagnóstico" → SEPARADO en 3 topics por contenido real:
     t-diagnostico-red (ping/tracert/DNS/gateway/route + ipconfig
     /renew, esta última con relatedResource r-red-icmp-diagnostico
     como evidencia interna), t-diagnostico-hardware (HDD click,
     CPU-Z/HWiNFO) y t-diagnostico-metodologia (método profesional,
     un cambio cada vez, orden ante "no enciende"). Sin categoría de
     contexto, el raw "Diagnóstico" es AMBIGUO: 3 candidatos.
   - "Conceptos" → t-contenedores (la única pregunta con ese raw es la
     diferencia VM/contenedor; t-virtualizacion#17).
   - "Routing" → t-enrutamiento; "PSU" → t-fuente-alimentacion;
     "Backups" → t-copias-seguridad; "Memoria" → t-memoria-virtual;
     "Recursos" → t-recursos-virtualizacion (renombrados por legibilidad,
     mismo concepto, sin fusión con otros). */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});

  const TAXONOMY_VERSION = 1;

  /* ---------- Topics canónicos ----------
     order: posición editorial estable dentro de la taxonomía.
     moduleLinks: RESERVADO, vacío por diseño (fase 6D.6). */

  const TOPICS = [
    /* --- Virtualización (cat editorial: Virtualización) --- */
    { id: 't-hipervisores', name: 'Hipervisores', description: 'Hipervisores de tipo 1 y tipo 2; bare-metal frente a alojado.', parentTopic: null, aliases: ['Hipervisores'], editorialCategory: 'Virtualización', order: 1 },
    { id: 't-recursos-virtualizacion', name: 'Recursos en virtualización', description: 'Asignación y sobreasignación de RAM y vCPU a máquinas virtuales.', parentTopic: null, aliases: ['Recursos'], editorialCategory: 'Virtualización', order: 2 },
    { id: 't-snapshots', name: 'Snapshots', description: 'Snapshots, restauración y árboles de snapshots.', parentTopic: null, aliases: ['Snapshots'], editorialCategory: 'Virtualización', order: 3 },
    { id: 't-redes-virtuales', name: 'Redes virtuales', description: 'Modos de red de una VM: NAT, host-only, red interna y bridge.', parentTopic: null, aliases: ['Redes virtuales'], editorialCategory: 'Virtualización', order: 4 },
    { id: 't-laboratorios-virtuales', name: 'Laboratorios virtuales', description: 'Montaje de laboratorios: routers virtuales, redes internas y sandbox de pruebas.', parentTopic: null, aliases: ['Laboratorios'], editorialCategory: 'Virtualización', order: 5 },
    { id: 't-maquinas-virtuales', name: 'Máquinas virtuales', description: 'Gestión de VMs: Guest Additions, clonado frente a copia.', parentTopic: null, aliases: ['Máquinas virtuales'], editorialCategory: 'Virtualización', order: 6 },
    { id: 't-discos-virtuales', name: 'Discos virtuales', description: 'Discos virtuales: crecimiento dinámico y aprovisionamiento.', parentTopic: null, aliases: ['Discos virtuales'], editorialCategory: 'Virtualización', order: 7 },
    { id: 't-casos-uso-virtualizacion', name: 'Casos de uso de la virtualización', description: 'Dimensionamiento y escenarios reales: aulas, servidores y consolidación.', parentTopic: null, aliases: ['Casos de uso'], editorialCategory: 'Virtualización', order: 8 },
    { id: 't-contenedores', name: 'Contenedores', description: 'VM frente a contenedor: aislamiento y peso (raw original "Conceptos").', parentTopic: null, aliases: ['Conceptos'], editorialCategory: 'Virtualización', order: 9 },

    /* --- Mantenimiento y convergencias entre categorías --- */
    { id: 't-mantenimiento-preventivo', name: 'Mantenimiento preventivo', description: 'Rutinas preventivas: limpieza interior, periodicidades y reglas de intervención.', parentTopic: null, aliases: ['Preventivo', 'Limpieza'], editorialCategory: 'Mantenimiento', order: 10 },
    { id: 't-diagnostico-metodologia', name: 'Metodología de diagnóstico', description: 'Método profesional de diagnóstico: orden de comprobaciones y un cambio cada vez.', parentTopic: 't-diagnostico', aliases: [], editorialCategory: 'Mantenimiento', order: 11 },
    { id: 't-averias', name: 'Averías de hardware', description: 'Síntomas y primeras comprobaciones: BSOD, POST sin imagen, apagones.', parentTopic: null, aliases: ['Averías'], editorialCategory: 'Mantenimiento', order: 12 },
    { id: 't-firmware', name: 'Firmware (BIOS/UEFI)', description: 'Actualización segura de BIOS/UEFI y precauciones previas.', parentTopic: null, aliases: ['Firmware'], editorialCategory: 'Mantenimiento', order: 13 },
    { id: 't-refrigeracion', name: 'Refrigeración y térmica', description: 'Pasta térmica, throttling, temperaturas de seguridad y flujo de aire.', parentTopic: null, aliases: ['Refrigeración', 'Temperaturas'], editorialCategory: 'Hardware', order: 14 },
    { id: 't-almacenamiento', name: 'Almacenamiento (discos y SSD)', description: 'SSD/HDD, NVMe frente a SATA, TRIM y salud SMART (sectores reasignados).', parentTopic: null, aliases: ['Almacenamiento', 'SMART'], editorialCategory: 'Hardware', order: 15 },
    { id: 't-recuperacion-sistema', name: 'Recuperación del sistema', description: 'Puntos de restauración, sfc, modo seguro y recuperación tras controladores.', parentTopic: null, aliases: ['Recuperación'], editorialCategory: 'Sistemas Operativos', order: 16 },
    { id: 't-registros-sistema', name: 'Registros del sistema (logs)', description: 'Visor de eventos, journalctl y lectura de errores de disco en el registro.', parentTopic: null, aliases: ['Logs'], editorialCategory: 'Sistemas Operativos', order: 17 },

    /* --- Ofimática --- */
    { id: 't-documentos', name: 'Documentos de texto', description: 'Procesador de textos: estilos, índices, navegación y revisión final.', parentTopic: null, aliases: ['Documentos'], editorialCategory: 'Ofimática', order: 18 },
    { id: 't-hojas-calculo', name: 'Hojas de cálculo', description: 'Referencias absolutas/relativas, gráficos, validación y formato condicional.', parentTopic: null, aliases: ['Hojas de cálculo'], editorialCategory: 'Ofimática', order: 19 },
    { id: 't-formatos-archivo', name: 'Formatos de archivo', description: 'CSV, PDF, ODF frente a OOXML y límites prácticos (FAT32).', parentTopic: null, aliases: ['Formatos'], editorialCategory: 'Ofimática', order: 20 },
    { id: 't-presentaciones', name: 'Presentaciones', description: 'Diseño de presentaciones: densidad de diapositivas y patrón de diapositivas.', parentTopic: null, aliases: ['Presentaciones'], editorialCategory: 'Ofimática', order: 21 },

    /* --- Redes --- */
    { id: 't-subnetting', name: 'Subnetting', description: 'Cálculo de subredes: hosts útiles, red, broadcast, wildcard y prefijos.', parentTopic: null, aliases: ['Subnetting'], editorialCategory: 'Redes', order: 22 },
    { id: 't-vlsm', name: 'VLSM', description: 'Subredes de tamaño variable: alineación de bloques y asignación por tamaños.', parentTopic: null, aliases: ['VLSM'], editorialCategory: 'Redes', order: 23 },
    { id: 't-ethernet', name: 'Ethernet y switching', description: 'Tramas, FCS y aprendizaje de MAC en switches.', parentTopic: null, aliases: ['Ethernet'], editorialCategory: 'Redes', order: 24 },
    { id: 't-vlan', name: 'VLANs', description: 'Dominios de difusión, comunicación entre VLANs y APs con SSID aislados.', parentTopic: null, aliases: ['VLAN'], editorialCategory: 'Redes', order: 25 },
    { id: 't-nat', name: 'NAT y PAT', description: 'Traducción de direcciones y PAT multiplexando conexiones.', parentTopic: null, aliases: ['NAT'], editorialCategory: 'Redes', order: 26 },
    { id: 't-enrutamiento', name: 'Enrutamiento', description: 'Tablas de rutas y selección del prefijo más específico (raw original "Routing").', parentTopic: null, aliases: ['Routing'], editorialCategory: 'Redes', order: 27 },
    { id: 't-dns', name: 'DNS', description: 'Registros DNS y resolución: A/AAAA, transporte UDP/TCP 53.', parentTopic: null, aliases: ['DNS'], editorialCategory: 'Redes', order: 28 },
    { id: 't-ipv6', name: 'IPv6', description: 'Formato, abreviatura y tipos de dirección IPv6 (link-local, multicast).', parentTopic: null, aliases: ['IPv6'], editorialCategory: 'Redes', order: 29 },
    { id: 't-medios-transmision', name: 'Medios de transmisión', description: 'UTP, fibra y coaxial: distancias y elección de medio.', parentTopic: null, aliases: ['Medios'], editorialCategory: 'Redes', order: 30 },
    { id: 't-diagnostico-red', name: 'Diagnóstico de redes', description: 'Diagnóstico de conectividad: ping escalonado, tracert, gateway, rutas y DHCP.', parentTopic: 't-diagnostico', aliases: [], editorialCategory: 'Redes', order: 31 },

    /* --- Sistemas Operativos --- */
    { id: 't-permisos', name: 'Permisos y sistemas de archivos', description: 'Permisos POSIX, notación octal y simbólica, y soporte por sistema de archivos.', parentTopic: null, aliases: ['Permisos'], editorialCategory: 'Sistemas Operativos', order: 32 },
    { id: 't-memoria-virtual', name: 'Memoria virtual', description: 'Paginación, swap y thrashing (raw original "Memoria").', parentTopic: null, aliases: ['Memoria'], editorialCategory: 'Sistemas Operativos', order: 33 },
    { id: 't-procesos', name: 'Procesos e hilos', description: 'Proceso frente a hilo, señales y terminación de procesos.', parentTopic: null, aliases: ['Procesos'], editorialCategory: 'Sistemas Operativos', order: 34 },
    { id: 't-arranque', name: 'Arranque del sistema', description: 'POST, bootloader, Secure Boot y errores de arranque.', parentTopic: null, aliases: ['Arranque'], editorialCategory: 'Sistemas Operativos', order: 35 },
    { id: 't-servicios', name: 'Servicios del sistema', description: 'Servicios en Windows y Linux: tipos de inicio y consulta.', parentTopic: null, aliases: ['Servicios'], editorialCategory: 'Sistemas Operativos', order: 36 },
    { id: 't-powershell', name: 'PowerShell', description: 'Cmdlets, pipeline y política de ejecución de PowerShell.', parentTopic: null, aliases: ['PowerShell'], editorialCategory: 'Sistemas Operativos', order: 37 },
    { id: 't-terminal', name: 'Terminal y shell', description: 'Conceptos comunes de línea de comandos: PATH, encadenamiento con && y ||.', parentTopic: null, aliases: ['Terminal'], editorialCategory: 'Sistemas Operativos', order: 38 },
    { id: 't-instalacion-so', name: 'Instalación del sistema operativo', description: 'Requisitos de instalación (p. ej. Windows 11: TPM 2.0, UEFI).', parentTopic: null, aliases: ['Instalación'], editorialCategory: 'Sistemas Operativos', order: 39 },
    { id: 't-particiones', name: 'Particiones y discos', description: 'MBR frente a GPT, partición EFI y límites de direccionamiento.', parentTopic: null, aliases: ['Particiones'], editorialCategory: 'Sistemas Operativos', order: 40 },

    /* --- Hardware --- */
    { id: 't-cpu', name: 'Procesador (CPU)', description: 'SMT/Hyper-Threading, IPC y generación de procesadores.', parentTopic: null, aliases: ['CPU'], editorialCategory: 'Hardware', order: 41 },
    { id: 't-ram', name: 'Memoria RAM', description: 'Canales, frecuencias, generaciones DDR y memoria reservada.', parentTopic: null, aliases: ['RAM'], editorialCategory: 'Hardware', order: 42 },
    { id: 't-fuente-alimentacion', name: 'Fuente de alimentación', description: 'Potencia, conectores PCIe, eficiencia 80 PLUS y cortes bajo carga (raw "PSU").', parentTopic: null, aliases: ['PSU'], editorialCategory: 'Hardware', order: 43 },
    { id: 't-placa-base', name: 'Placa base', description: 'Chipsets, sockets, VRM y reparto de líneas PCIe.', parentTopic: null, aliases: ['Placa base'], editorialCategory: 'Hardware', order: 44 },
    { id: 't-gpu', name: 'Tarjeta gráfica', description: 'GPU: salidas de vídeo, alimentación externa y artefactos bajo carga.', parentTopic: null, aliases: ['GPU'], editorialCategory: 'Hardware', order: 45 },
    { id: 't-diagnostico-hardware', name: 'Diagnóstico de hardware', description: 'Diagnóstico de componentes: herramientas de sensores y síntomas de disco.', parentTopic: 't-diagnostico', aliases: [], editorialCategory: 'Hardware', order: 46 },

    /* --- Seguridad --- */
    { id: 't-ingenieria-social', name: 'Ingeniería social', description: 'Phishing, spear phishing, BEC, vishing y respuesta ante incidentes.', parentTopic: null, aliases: ['Ingeniería social'], editorialCategory: 'Seguridad', order: 47 },
    { id: 't-malware', name: 'Malware', description: 'Gusanos, troyanos, ransomware, antivirus heurístico y contención.', parentTopic: null, aliases: ['Malware'], editorialCategory: 'Seguridad', order: 48 },
    { id: 't-mfa', name: 'Autenticación multifactor (MFA)', description: 'MFA como mitigación frente al robo de credenciales.', parentTopic: null, aliases: ['MFA'], editorialCategory: 'Seguridad', order: 49 },
    { id: 't-contrasenas', name: 'Contraseñas', description: 'Reutilización, credential stuffing y políticas frente a filtraciones.', parentTopic: null, aliases: ['Contraseñas'], editorialCategory: 'Seguridad', order: 50 },
    { id: 't-cifrado', name: 'Cifrado y hash', description: 'Hash con sal, TLS/HTTPS, PFS y verificación de integridad.', parentTopic: null, aliases: ['Cifrado'], editorialCategory: 'Seguridad', order: 51 },
    { id: 't-wifi', name: 'Seguridad Wi-Fi', description: 'WEP/WPA2/WPA3, 802.1X y segmentación de IoT.', parentTopic: null, aliases: ['Wi-Fi'], editorialCategory: 'Seguridad', order: 52 },
    { id: 't-buenas-practicas-seguridad', name: 'Buenas prácticas de seguridad', description: 'Mínimo privilegio, spam y defensa en profundidad (raw "Buenas prácticas").', parentTopic: null, aliases: ['Buenas prácticas'], editorialCategory: 'Seguridad', order: 53 },
    { id: 't-copias-seguridad', name: 'Copias de seguridad', description: 'Regla 3-2-1 y copias fuera de línea frente a ransomware (raw "Backups").', parentTopic: null, aliases: ['Backups'], editorialCategory: 'Seguridad', order: 54 },

    /* --- Familia de diagnóstico (parent conceptual, sin contenido propio) --- */
    { id: 't-diagnostico', name: 'Diagnóstico y resolución de problemas', description: 'Familia de diagnóstico: agrupa red, hardware y metodología. Sin preguntas directas: el raw "Diagnóstico" se resuelve por categoría.', parentTopic: null, aliases: [], editorialCategory: null, order: 55 }
  ];

  /* ---------- Alias globales: raw q.topic → topicId ----------
     SOLO strings reales presentes en las preguntas (56 raws). Un raw
     global converge SIEMPRE al mismo topic sea cual sea su categoría,
     porque el contenido lo confirma (ver cabecera). */

  const ALIAS_GLOBAL = Object.freeze({
    /* Virtualización */
    'Hipervisores': 't-hipervisores',
    'Recursos': 't-recursos-virtualizacion',
    'Snapshots': 't-snapshots',
    'Redes virtuales': 't-redes-virtuales',
    'Laboratorios': 't-laboratorios-virtuales',
    'Máquinas virtuales': 't-maquinas-virtuales',
    'Discos virtuales': 't-discos-virtuales',
    'Casos de uso': 't-casos-uso-virtualizacion',
    'Conceptos': 't-contenedores',
    /* Mantenimiento */
    'Preventivo': 't-mantenimiento-preventivo',
    'Limpieza': 't-mantenimiento-preventivo',
    'Averías': 't-averias',
    'Firmware': 't-firmware',
    'Temperaturas': 't-refrigeracion',
    'SMART': 't-almacenamiento',
    'Almacenamiento': 't-almacenamiento',
    'Recuperación': 't-recuperacion-sistema',
    'Logs': 't-registros-sistema',
    /* Ofimática */
    'Documentos': 't-documentos',
    'Hojas de cálculo': 't-hojas-calculo',
    'Formatos': 't-formatos-archivo',
    'Presentaciones': 't-presentaciones',
    /* Redes */
    'Subnetting': 't-subnetting',
    'VLSM': 't-vlsm',
    'Ethernet': 't-ethernet',
    'VLAN': 't-vlan',
    'NAT': 't-nat',
    'Routing': 't-enrutamiento',
    'DNS': 't-dns',
    'IPv6': 't-ipv6',
    'Medios': 't-medios-transmision',
    /* Sistemas Operativos */
    'Permisos': 't-permisos',
    'Memoria': 't-memoria-virtual',
    'Procesos': 't-procesos',
    'Arranque': 't-arranque',
    'Servicios': 't-servicios',
    'PowerShell': 't-powershell',
    'Terminal': 't-terminal',
    'Instalación': 't-instalacion-so',
    'Particiones': 't-particiones',
    /* Hardware */
    'CPU': 't-cpu',
    'RAM': 't-ram',
    'Refrigeración': 't-refrigeracion',
    'PSU': 't-fuente-alimentacion',
    'Placa base': 't-placa-base',
    'GPU': 't-gpu',
    /* Seguridad */
    'Ingeniería social': 't-ingenieria-social',
    'Malware': 't-malware',
    'MFA': 't-mfa',
    'Contraseñas': 't-contrasenas',
    'Cifrado': 't-cifrado',
    'Wi-Fi': 't-wifi',
    'Buenas prácticas': 't-buenas-practicas-seguridad',
    'Backups': 't-copias-seguridad'
  });

  /* ---------- Alias con scope de categoría: "Categoría|raw" → topicId ----------
     Solo para raws cuyo significado DEPENDE de la categoría editorial
     (evidencia por contenido en la cabecera). */

  const ALIAS_SCOPED = Object.freeze({
    'Mantenimiento|Diagnóstico': 't-diagnostico-metodologia',
    'Redes|Diagnóstico': 't-diagnostico-red',
    'Sistemas Operativos|Diagnóstico': 't-diagnostico-red',
    'Hardware|Diagnóstico': 't-diagnostico-hardware',
    'Hardware|Mantenimiento': 't-refrigeracion'
  });

  /* ---------- Raws ambiguos sin contexto: candidatos explícitos ----------
     resolveTopicId(raw) SIN categoría devuelve 'ambiguous' con estos
      candidatos en lugar de inventar una clasificación (regla 13). */

  const AMBIGUOUS = Object.freeze({
    'Diagnóstico': Object.freeze(['t-diagnostico-metodologia', 't-diagnostico-red', 't-diagnostico-hardware'])
  });

  /* ---------- API ---------- */

  let BY_ID = null;

  function ensureIndex() {
    if (!BY_ID) {
      BY_ID = new Map();
      TOPICS.forEach((t) => BY_ID.set(t.id, t));
    }
    return BY_ID;
  }

  /* Resuelve un raw q.topic a su topicId canónico.
     - editorialCategory (opcional): categoría editorial de la pregunta
       (la del test propietario). Permite resolver raws ambiguos.
     - Determinista y de solo lectura. Nunca lanza.
     Devuelve:
       { status: 'resolved', topicId, via: 'alias-scoped' | 'alias-global' }
       { status: 'ambiguous', candidates: [...] }   (raw ambiguo sin contexto)
       { status: 'unknown' }                        (raw sin alias registrado) */
  function resolveTopicId(rawTopic, editorialCategory) {
    const raw = typeof rawTopic === 'string' ? rawTopic.trim() : '';
    if (!raw) return { rawTopic: rawTopic == null ? null : String(rawTopic), status: 'unknown', topicId: null, via: null, candidates: [] };
    const cat = typeof editorialCategory === 'string' && editorialCategory.trim() ? editorialCategory.trim() : null;
    if (cat) {
      const scoped = ALIAS_SCOPED[cat + '|' + raw];
      if (scoped) return { rawTopic: raw, category: cat, status: 'resolved', topicId: scoped, via: 'alias-scoped', candidates: [] };
    }
    const globalHit = ALIAS_GLOBAL[raw];
    if (globalHit) return { rawTopic: raw, category: cat, status: 'resolved', topicId: globalHit, via: 'alias-global', candidates: [] };
    const amb = AMBIGUOUS[raw];
    if (amb) return { rawTopic: raw, category: cat, status: 'ambiguous', topicId: null, via: null, candidates: amb.slice() };
    return { rawTopic: raw, category: cat, status: 'unknown', topicId: null, via: null, candidates: [] };
  }

  /* Lista de todos los raw strings registrados (globales + scoped + ambiguos). */
  function registeredRawTopics() {
    const set = new Set(Object.keys(ALIAS_GLOBAL));
    Object.keys(ALIAS_SCOPED).forEach((k) => set.add(k.split('|')[1]));
    Object.keys(AMBIGUOUS).forEach((k) => set.add(k));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }

  /* ---------- Validador (solo lectura) ---------- */

  const TOPIC_ID_RE = /^t-[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function validateTopics() {
    const byId = ensureIndex();
    const errors = [];
    const warnings = [];

    /* A. IDs únicos. */
    if (byId.size !== TOPICS.length) {
      errors.push({ code: 'duplicate-topic-id', detail: 'hay topicId repetidos en la declaración' });
    }

    /* B. Formato t-<slug> y campos obligatorios. */
    TOPICS.forEach((t) => {
      if (!TOPIC_ID_RE.test(t.id)) errors.push({ code: 'invalid-topic-id', topicId: t.id, detail: 'no cumple t-<slug>' });
      if (!t.name || typeof t.name !== 'string') errors.push({ code: 'invalid-topic', topicId: t.id, detail: 'sin name' });
      if (!Array.isArray(t.aliases)) errors.push({ code: 'invalid-topic', topicId: t.id, detail: 'aliases no es array' });
      if (t.moduleLinks && (!Array.isArray(t.moduleLinks) || t.moduleLinks.length)) {
        errors.push({ code: 'module-links-must-be-empty', topicId: t.id, detail: 'moduleLinks debe permanecer vacío hasta 6D.6' });
      }
    });

    /* C. parentTopic existente. */
    TOPICS.forEach((t) => {
      if (t.parentTopic && !byId.has(t.parentTopic)) {
        errors.push({ code: 'missing-parent', topicId: t.id, detail: 'parentTopic inexistente: ' + t.parentTopic });
      }
    });

    /* D. Sin ciclos en parentTopic. */
    TOPICS.forEach((t) => {
      const seen = new Set();
      let cur = t;
      while (cur && cur.parentTopic) {
        if (seen.has(cur.id)) {
          errors.push({ code: 'parent-cycle', topicId: t.id, detail: 'ciclo detectado en parentTopic' });
          break;
        }
        seen.add(cur.id);
        cur = byId.get(cur.parentTopic);
      }
    });

    /* E. Todo alias apunta a un topic existente. */
    Object.keys(ALIAS_GLOBAL).forEach((raw) => {
      if (!byId.has(ALIAS_GLOBAL[raw])) errors.push({ code: 'orphan-alias', detail: 'alias global "' + raw + '" → topic inexistente' });
    });
    Object.keys(ALIAS_SCOPED).forEach((key) => {
      if (!byId.has(ALIAS_SCOPED[key])) errors.push({ code: 'orphan-alias', detail: 'alias scoped "' + key + '" → topic inexistente' });
    });
    Object.keys(AMBIGUOUS).forEach((raw) => {
      AMBIGUOUS[raw].forEach((id) => {
        if (!byId.has(id)) errors.push({ code: 'orphan-alias', detail: 'candidato ambiguo "' + raw + '" → ' + id + ' inexistente' });
      });
    });

    /* F/G. Los raw q.topic reales se resuelven o quedan marcados:
       nunca se pierden silenciosamente. */
    const D = global.SMR_DATA || {};
    const raws = new Map(); /* raw -> Set(categorías) */
    (Array.isArray(D.tests) ? D.tests : []).forEach((t) => {
      (t.questions || []).forEach((q) => {
        if (typeof q.topic !== 'string' || !q.topic.trim()) return;
        if (!raws.has(q.topic)) raws.set(q.topic, new Set());
        raws.get(q.topic).add(t.category || 'General');
      });
    });
    let resolved = 0;
    const unresolved = [];
    raws.forEach((cats, raw) => {
      cats.forEach((cat) => {
        const r = resolveTopicId(raw, cat);
        if (r.status === 'resolved') resolved++;
        else unresolved.push({ rawTopic: raw, category: cat, status: r.status, candidates: r.candidates });
      });
    });
    unresolved.forEach((u) => {
      errors.push({ code: 'unresolved-raw-topic', rawTopic: u.rawTopic, category: u.category, status: u.status, detail: 'raw de pregunta sin resolución (candidatos: ' + u.candidates.join(', ') + ')' });
    });

    /* Aliases declarados que no corresponden a ningún raw actual: informativo. */
    const usedRaws = new Set(raws.keys());
    registeredRawTopics().forEach((raw) => {
      if (!usedRaws.has(raw)) warnings.push({ code: 'unused-alias', detail: '"' + raw + '" está registrado pero no aparece en ninguna pregunta actual' });
    });

    /* editorialCategory válida (capa distinta de topics, ya existente). */
    const cats = new Set((Array.isArray(D.categories) ? D.categories : []));
    TOPICS.forEach((t) => {
      if (t.editorialCategory !== null && !cats.has(t.editorialCategory)) {
        errors.push({ code: 'invalid-editorial-category', topicId: t.id, detail: '"' + t.editorialCategory + '" no está en SMR_DATA.categories' });
      }
    });

    return {
      ok: errors.length === 0,
      version: TAXONOMY_VERSION,
      totalTopics: TOPICS.length,
      rawTopicsTotal: raws.size,
      rawResolved: resolved,
      rawUnresolved: unresolved,
      unusedAliases: warnings.filter((w) => w.code === 'unused-alias').length,
      duplicates: [],
      warnings,
      errors
    };
  }

  /* ---------- Export ---------- */

  SMR.topics = Object.freeze({
    version: TAXONOMY_VERSION,
    list: Object.freeze(TOPICS.slice()),
    resolveTopicId: resolveTopicId,
    registeredRawTopics: registeredRawTopics,
    validateTopics: validateTopics
  });
})(typeof window !== 'undefined' ? window : globalThis);

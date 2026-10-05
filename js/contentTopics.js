'use strict';

/* SMR Hub — Mapping de recursos y casos → topics (fase 6D.5)
   ------------------------------------------------------------------
   Capa DERIVADA y de solo lectura que registra la relación editorial
   recurso→topic y caso→topic.

   A diferencia de questionTopics.js (auto-derivable de los aliases de
   6D.3), aquí la relación NO puede deducirse mecánicamente: es una
   decisión editorial. Por eso esta capa contiene una tabla CURADA de
   enlaces (no de contenido): cada enlace declara ref, topicId, role,
   confidence y evidence. El validador comprueba en carga que cada
   ref existe realmente y cada topicId pertenece a SMR.topics.

   Reglas aplicadas (diseño 6D.1/6D.3):
   - 1 topic primary por recurso/caso; secondary solo con justificación.
   - confidence: high (enseña directamente el topic), medium (lo trata
     de forma parcial/contextual), review (evidencia insuficiente).
   - NO se tocan content.js, cases, categories, topics.js,
     questionTopics.js, SRS, localStorage ni moduleLinks (vacío hasta
     6D.6).
   - NO se recrean recursos inexistentes auditados en 6C.6.
   - relatedResource de las preguntas es evidencia auxiliar (columna
     "preguntas" de la auditoría), nunca autoridad.

   Evidencia de la curación: contenido real volcado en la inspección
   de esta fase (títulos, desc, content[], keyPoints, solutions) y
   scratch_6d3/hallazgos_casos.md, scratch_6d3/preguntas_por_topic.txt. */

(function (global) {
  const SMR = (global.SMR = global.SMR || {});
  const D = global.SMR_DATA || {};

  const CONTENT_TOPICS_VERSION = 1;

  /* ---------- Enlaces curados recurso → topic ---------- */

  const RESOURCE_LINKS = [
    /* Redes */
    { ref: 'r-red-topologia', links: [{ topicId: 't-medios-transmision', role: 'primary', confidence: 'high', evidence: 'content: UTP/Cat5e/Cat6/fibra/coaxial y distancias; keyPoints sobre UTP 100 m y fibra' }] },
    { ref: 'r-red-ipv6', links: [{ topicId: 't-ipv6', role: 'primary', confidence: 'high', evidence: 'content: 128 bits, abreviatura ::, fe80::/10, multicast; keyPoints IPv6' }, { topicId: 't-nat', role: 'secondary', confidence: 'medium', evidence: 'desc y cierre: "por qué elimina la necesidad de NAT"' }] },
    { ref: 'r-red-ethernet-mac', links: [{ topicId: 't-ethernet', role: 'primary', confidence: 'high', evidence: 'content: trama, FCS, aprendizaje de MAC del switch; keyPoints MAC/switch' }] },
    { ref: 'r-red-vlan', links: [{ topicId: 't-vlan', role: 'primary', confidence: 'high', evidence: 'content: dominio de difusión, 802.1Q, trunk, comunicación entre VLANs; keyPoints' }] },
    { ref: 'r-red-nat-routing', links: [{ topicId: 't-enrutamiento', role: 'primary', confidence: 'high', evidence: 'content: tabla de rutas, ruta más específica, por defecto; keyPoints' }, { topicId: 't-nat', role: 'primary', confidence: 'high', evidence: 'content: NAT estático/dinámico, PAT, reenvío de puertos; keyPoints PAT' }] },
    { ref: 'r-red-icmp-diagnostico', links: [{ topicId: 't-diagnostico-red', role: 'primary', confidence: 'high', evidence: 'content: ping escalonado, tracert, ipconfig, nslookup; keyPoints de diagnóstico' }] },
    { ref: 'r-red-subnet-intermedio', links: [{ topicId: 't-subnetting', role: 'primary', confidence: 'high', evidence: 'content: tabla /25-/30, salto de subred, hosts→prefijo; keyPoints de hosts por prefijo' }] },
    { ref: 'r-red-vlsm-avanzado', links: [{ topicId: 't-vlsm', role: 'primary', confidence: 'high', evidence: 'content: reparto por tamaños, alineación de bloques, /30 en enlaces; keyPoints VLSM' }] },
    { ref: 'r-red-servicios-dns', links: [{ topicId: 't-dns', role: 'primary', confidence: 'high', evidence: 'content: jerarquía, A/AAAA/MX/CNAME, UDP/TCP 53, nslookup; keyPoints DNS' }] },
    /* Sistemas Operativos */
    { ref: 'r-so-fs-permisos', links: [{ topicId: 't-permisos', role: 'primary', confidence: 'high', evidence: 'content: rwx, octal, chmod, ACLs NTFS; keyPoints de notación numérica' }] },
    { ref: 'r-so-memoria', links: [{ topicId: 't-memoria-virtual', role: 'primary', confidence: 'high', evidence: 'content: paginación, swap, thrashing; keyPoints memoria virtual' }, { topicId: 't-procesos', role: 'secondary', confidence: 'medium', evidence: 'content: proceso vs hilo, estados, kill/kill -9; title "gestión de procesos"' }] },
    { ref: 'r-so-arranque', links: [{ topicId: 't-arranque', role: 'primary', confidence: 'high', evidence: 'content: POST, bootloader, UEFI/GPT/EFI, Secure Boot, WinRE; keyPoints' }, { topicId: 't-particiones', role: 'secondary', confidence: 'medium', evidence: 'content: partición EFI FAT32 y GPT frente a MBR (parcial)' }] },
    { ref: 'r-so-powershell-bash', links: [{ topicId: 't-powershell', role: 'primary', confidence: 'high', evidence: 'content: cmdlets, objetos, tuberías, política de ejecución; keyPoints PowerShell' }, { topicId: 't-terminal', role: 'primary', confidence: 'high', evidence: 'content: CMD/Bash, PATH, pipes, scripts; keyPoints de línea de comandos' }] },
    { ref: 'r-so-logs-recuperacion', links: [{ topicId: 't-recuperacion-sistema', role: 'primary', confidence: 'high', evidence: 'content: puntos de restauración, sfc/DISM/chkdsk, modo seguro, orden reparar→restaurar' }, { topicId: 't-registros-sistema', role: 'primary', confidence: 'high', evidence: 'content: Visor de eventos, syslog/journald, journalctl -xe' }] },
    /* Hardware */
    { ref: 'r-hw-cpu', links: [{ topicId: 't-cpu', role: 'primary', confidence: 'high', evidence: 'content: frecuencia, IPC, núcleos, SMT, cachés L1/L2/L3, TDP, socket; keyPoints' }] },
    { ref: 'r-hw-gpu', links: [{ topicId: 't-gpu', role: 'primary', confidence: 'high', evidence: 'content: integrada/dedicada, VRAM, HDMI/DP, conectores PCIe, artefactos; keyPoints' }] },
    { ref: 'r-hw-psu-refrigeracion', links: [{ topicId: 't-fuente-alimentacion', role: 'primary', confidence: 'high', evidence: 'content: líneas +12 V, 80 PLUS, conectores ATX/EPS/PCIe; keyPoints PSU' }, { topicId: 't-refrigeracion', role: 'primary', confidence: 'high', evidence: 'content: flujo de aire, disipadores, temperaturas de referencia; keyPoints térmicos' }] },
    /* Seguridad */
    { ref: 'r-seg-ingenieria-social', links: [{ topicId: 't-ingenieria-social', role: 'primary', confidence: 'high', evidence: 'content: phishing, smishing, vishing, spear phishing, protocolo ante clic; keyPoints' }] },
    { ref: 'r-seg-cifrado-wifi', links: [{ topicId: 't-cifrado', role: 'primary', confidence: 'high', evidence: 'content: simétrico/asimétrico, hash con sal, TLS/HTTPS; keyPoints de cifrado' }, { topicId: 't-wifi', role: 'primary', confidence: 'high', evidence: 'content: WEP roto, WPA2/WPA3, 802.1X; keyPoints Wi-Fi' }] }
  ];

  /* ---------- Enlaces curados caso → topic ---------- */

  const CASE_LINKS = [
    { ref: 'casa-wifi', links: [{ topicId: 't-wifi', role: 'primary', confidence: 'medium', evidence: 'situation/solution: señal Wi-Fi, AP en modo punto de acceso, doble NAT' }, { topicId: 't-medios-transmision', role: 'secondary', confidence: 'medium', evidence: 'solution: cableado Cat6 <100 m al despacho' }, { topicId: 't-nat', role: 'secondary', confidence: 'low', evidence: 'solution: evitar doble NAT' }] },
    { ref: 'oficina-20', links: [{ topicId: 't-vlan', role: 'primary', confidence: 'high', evidence: 'solution: VLAN 10 trabajo / 20 invitados / 30 servidores, trunk' }, { topicId: 't-nat', role: 'secondary', confidence: 'medium', evidence: 'solution: router-firewall con PAT y reglas' }, { topicId: 't-copias-seguridad', role: 'secondary', confidence: 'low', evidence: 'situation: NAS con copias diarias (mención, no decisión central)' }] },
    { ref: 'aula-informatica', links: [{ topicId: 't-vlan', role: 'primary', confidence: 'high', evidence: 'solution: VLAN del aula con DHCP propio y bloqueo de NAT por VLAN' }] },
    { ref: 'vm-laboratorio', links: [{ topicId: 't-laboratorios-virtuales', role: 'primary', confidence: 'high', evidence: 'solution: VM router con redes internas A/B, reenvío IP, snapshots tras práctica' }, { topicId: 't-redes-virtuales', role: 'primary', confidence: 'high', evidence: 'intro/solution: redes internas simuladas, adaptador puente, host-only' }, { topicId: 't-subnetting', role: 'secondary', confidence: 'low', evidence: 'intro: "practicar subnetting y routing" (mención inicial)' }] },
    { ref: 'pc-lento', links: [{ topicId: 't-diagnostico-hardware', role: 'primary', confidence: 'high', evidence: 'solution: Administrador de tareas, CrystalDiskInfo, SMART, plan de clonado HDD→SSD' }, { topicId: 't-almacenamiento', role: 'primary', confidence: 'high', evidence: 'solution: SMART sectores reasignados, clonar HDD a SSD (decisión central)' }, { topicId: 't-memoria-virtual', role: 'secondary', confidence: 'medium', evidence: 'solution: disco al 100% por swap, RAM al límite' }] },
    { ref: 'diseno-subredes', links: [{ topicId: 't-vlsm', role: 'primary', confidence: 'high', evidence: 'solution: reparto 50/25/10/2 hosts en /26 /27 /28 /30 con alineación' }, { topicId: 't-subnetting', role: 'secondary', confidence: 'medium', evidence: 'cálculo de prefijos por hosts necesario (subconcepto del diseño)' }] }
  ];

  /* ---------- Construcción del índice ---------- */

  let INDEX = null;

  function buildIndex() {
    const problems = [];
    const resById = new Map((Array.isArray(D.resources) ? D.resources : []).map((r) => [r.id, r]));
    const caseById = new Map((Array.isArray(D.cases) ? D.cases : []).map((c) => [c.id, c]));
    const validTopics = new Set((SMR.topics ? SMR.topics.list : []).map((t) => t.id));

    const mk = (def, kind) => {
      const exists = kind === 'resource' ? resById.has(def.ref) : caseById.has(def.ref);
      if (!exists) {
        problems.push({ code: 'missing-' + kind, ref: def.ref, detail: kind + ' inexistente: no se registra el enlace' });
        return null;
      }
      const seen = new Set();
      const links = (def.links || []).map((l) => {
        if (!validTopics.has(l.topicId)) {
          problems.push({ code: 'unknown-topic', ref: def.ref, topicId: l.topicId, detail: 'topicId inexistente' });
          return null;
        }
        if (seen.has(l.topicId)) {
          problems.push({ code: 'duplicate-topic-link', ref: def.ref, topicId: l.topicId, detail: 'topicId duplicado dentro del mismo enlace' });
          return null;
        }
        seen.add(l.topicId);
        return Object.freeze({ topicId: l.topicId, role: l.role, confidence: l.confidence, evidence: l.evidence });
      }).filter(Boolean);
      const primary = links.filter((l) => l.role === 'primary');
      /* Rol = valor aportado (primary: enseña directamente el topic;
         secondary: parcial/contextual). Un recurso puede tener DOS
         primaries cuando su propio título declara dos temas co-iguales
         (p. ej. "Routing y NAT", "CMD, PowerShell y Bash", "Cifrado,
         hash y seguridad Wi-Fi"). Degradar uno de los dos a secondary
         sería deshonesto. Más de 2 primaries sí es sospechoso. */
      if (primary.length === 0) {
        problems.push({ code: 'no-primary', ref: def.ref, detail: 'sin topic primary' });
      } else if (primary.length > 2) {
        problems.push({ code: 'primary-count', ref: def.ref, detail: 'primaries=' + primary.length + ' (máximo razonable: 2)' });
      }
      const meta = kind === 'resource' ? resById.get(def.ref) : caseById.get(def.ref);
      return Object.freeze({
        ref: def.ref,
        kind,
        title: meta ? (meta.title || null) : null,
        category: meta ? (meta.category || null) : null,
        links: Object.freeze(links),
        /* Determinista: el primero declarado. En recursos de doble tema
           (dual-primary) topicsOfResource() ofrece la lista completa. */
        primaryTopicId: primary.length ? primary[0].topicId : null,
        dualPrimary: primary.length === 2
      });
    };

    const resources = RESOURCE_LINKS.map((d) => mk(d, 'resource')).filter(Boolean);
    const cases = CASE_LINKS.map((d) => mk(d, 'case')).filter(Boolean);

    INDEX = Object.freeze({
      version: CONTENT_TOPICS_VERSION,
      resources: Object.freeze(resources),
      cases: Object.freeze(cases),
      byResourceId: new Map(resources.map((r) => [r.ref, r])),
      byCaseId: new Map(cases.map((c) => [c.ref, c])),
      problems: Object.freeze(problems)
    });
    return INDEX;
  }

  function ensureIndex() {
    if (!INDEX) buildIndex();
    return INDEX;
  }

  /* ---------- API pública ---------- */

  function contentTopics() { return ensureIndex(); }

  function topicOfResource(resourceId) {
    const e = ensureIndex().byResourceId.get(String(resourceId));
    return e ? e.primaryTopicId : null;
  }

  function topicsOfResource(resourceId) {
    const e = ensureIndex().byResourceId.get(String(resourceId));
    return e ? e.links.map((l) => l.topicId) : [];
  }

  function topicOfCase(caseId) {
    const e = ensureIndex().byCaseId.get(String(caseId));
    return e ? e.primaryTopicId : null;
  }

  function topicsOfCase(caseId) {
    const e = ensureIndex().byCaseId.get(String(caseId));
    return e ? e.links.map((l) => l.topicId) : [];
  }

  function resourcesOfTopic(topicId) {
    return ensureIndex().resources
      .filter((r) => r.links.some((l) => l.topicId === topicId))
      .map((r) => r.ref);
  }

  function casesOfTopic(topicId) {
    return ensureIndex().cases
      .filter((c) => c.links.some((l) => l.topicId === topicId))
      .map((c) => c.ref);
  }

  /* ---------- Validador (solo lectura) ---------- */

  function validateContentTopics() {
    const ix = ensureIndex();
    const errors = [];
    const warnings = [];

    ix.problems.forEach((p) => {
      if (p.code === 'unknown-topic' || p.code === 'missing-resource' || p.code === 'missing-case' || p.code === 'duplicate-topic-link') {
        errors.push(p);
      } else {
        warnings.push(p);
      }
    });

    const validTopics = new Set((SMR.topics ? SMR.topics.list : []).map((t) => t.id));
    const resIds = new Set((Array.isArray(D.resources) ? D.resources : []).map((r) => r.id));
    const caseIds = new Set((Array.isArray(D.cases) ? D.cases : []).map((c) => c.id));

    /* Cobertura: los 19 recursos y 6 casos reales deben estar enlazados. */
    resIds.forEach((id) => {
      if (!ix.byResourceId.has(id)) errors.push({ code: 'unmapped-resource', ref: id, detail: 'recurso real sin enlace a topic' });
    });
    caseIds.forEach((id) => {
      if (!ix.byCaseId.has(id)) errors.push({ code: 'unmapped-case', ref: id, detail: 'caso real sin enlace a topic' });
    });
    ix.resources.forEach((r) => {
      if (!resIds.has(r.ref)) errors.push({ code: 'orphan-link', ref: r.ref, detail: 'enlace a recurso inexistente' });
      if (r.primaryTopicId && !validTopics.has(r.primaryTopicId)) errors.push({ code: 'unknown-topic', ref: r.ref, topicId: r.primaryTopicId });
    });
    ix.cases.forEach((c) => {
      if (!caseIds.has(c.ref)) errors.push({ code: 'orphan-link', ref: c.ref, detail: 'enlace a caso inexistente' });
      if (c.primaryTopicId && !validTopics.has(c.primaryTopicId)) errors.push({ code: 'unknown-topic', ref: c.ref, topicId: c.primaryTopicId });
    });

    return {
      ok: errors.length === 0,
      version: ix.version,
      resourcesMapped: ix.resources.length,
      casesMapped: ix.cases.length,
      duplicates: [],
      warnings,
      errors
    };
  }

  SMR.contentTopics = contentTopics;
  SMR.topicOfResource = topicOfResource;
  SMR.topicsOfResource = topicsOfResource;
  SMR.topicOfCase = topicOfCase;
  SMR.topicsOfCase = topicsOfCase;
  SMR.resourcesOfTopic = resourcesOfTopic;
  SMR.casesOfTopic = casesOfTopic;
  SMR.validateContentTopics = validateContentTopics;
})(typeof window !== 'undefined' ? window : globalThis);

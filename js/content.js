'use strict';

/* SMR Hub — ampliación de contenido (fase 6)
   Carga tras data.js y fusiona sobre SMR_DATA:
   - recursos nuevos (con minutes, tags y whyItMatters),
   - lecciones enriquecidas de los recursos existentes,
   - glosario ampliado,
   - casos prácticos y rutas de aprendizaje.
   Todo es opcional: si un bloque no existe, la app sigue funcionando. */

(function () {
  const D = window.SMR_DATA;
  if (!D || typeof D !== 'object') return;

  /* ============================================================
     1. RECURSOS NUEVOS
     ============================================================ */

  const NEW_RESOURCES = [
    {
      id: 'r-red-topologia',
      title: 'Topologías y medios de transmisión',
      desc: 'LAN, WAN, MAN y PAN, topologías de red, cable UTP y sus categorías, fibra óptica y coaxial.',
      category: 'Redes',
      level: 'Básico',
      added: '2025-03-02',
      minutes: 9,
      tags: ['topologia', 'utp', 'fibra', 'ethernet', 'lan', 'wan'],
      content: [
        'Por alcance: PAN (personal, metros), LAN (edificio), MAN (ciudad) y WAN (países). Cuanto mayor el alcance, más intervienen operadores y costes.',
        'Topología física: en estrella (actual, un switch central), en bus (coaxial, obsoleta), en anillo (token, herencia de Token Ring y SDH) y en malla (redundancia entre nodos).',
        'La topología lógica describe cómo viajan los datos y no siempre coincide con la física: una red física en estrella puede tener lógica de bus.',
        'UTP: cuatro pares trenzados sin apantallar; el trenzado reduce la interferencia. STP añade malla apantallante para entornos con ruido (motores, industriales).',
        'Categorías UTP: Cat5e (1 Gbps), Cat6 (1 Gbps hasta 100 m y 10 Gbps hasta 55 m), Cat6a (10 Gbps a 100 m). Un tramo UTP no debe superar los 100 metros.',
        'Fibra óptica: transmite luz; inmune a interferencias electromagnéticas. Multimodo para distancias cortas (edificios, LED/VCSEL) y monomodo para largas (láser, kilómetros).',
        'Coaxial: apantallamiento concéntrico; hoy en antena y TV por cable, históricamente en LAN de bus de 10 Mbps.'
      ],
      lesson: {
        keyPoints: [
          'PAN < LAN < MAN < WAN según alcance.',
          'La topología actual dominante es la estrella con switch central.',
          'Un tramo UTP admite como máximo 100 m; Cat6a alcanza 10 Gbps a 100 m.',
          'La fibra no sufre interferencias electromagnéticas y cubre grandes distancias.'
        ],
        example: 'Un aula de 25 equipos: UTP Cat6 a un switch (estrella). Unir dos edificios separados 800 m: fibra monomodo, porque UTP no llega.',
        commonErrors: [
          'Pasar de 100 m de cable UTP: atenuación y errores, no hay conexión estable.',
          'Confundir topología física (estrella) con lógica (bus en Ethernet antiguo).',
          'Usar Cat5 en un enlace de 10 Gbps: la categoría no lo soporta.'
        ],
        summary: 'El medio condiciona velocidad y distancia: UTP hasta 100 m, fibra para largas distancias, y la topología en estrella domina las redes locales actuales.'
      },
      whyItMatters: 'Elegir bien medio y topología es la primera decisión de cualquier instalación: condiciona coste, velocidad y mantenimiento.',
      exercise: {
        prompt: 'Un almacén tiene motores eléctricos junto al cableado y necesita 1 Gbps a 90 m. ¿Qué cable justificarías?',
        solution: 'STP Cat6: la distancia entra dentro de los 100 m y el apantallamiento protege de la interferencia electromagnética de los motores.'
      }
    },
    {
      id: 'r-red-ipv6',
      title: 'Introducción a IPv6',
      desc: 'Formato de 128 bits, notación abreviada, tipos de dirección y por qué elimina la necesidad de NAT.',
      category: 'Redes',
      level: 'Intermedio',
      added: '2025-03-04',
      minutes: 8,
      tags: ['ipv6', 'direccionamiento'],
      content: [
        'IPv6 usa 128 bits: direcciones de ocho grupos hexadecimales separados por dos puntos (2001:0db8:0000:0000:0000:ff00:0042:8329).',
        'Reglas de abreviatura: se eliminan los ceros a la izquierda de cada grupo y una única secuencia de grupos a cero se sustituye por :: (2001:db8::ff00:42:8329).',
        'El prefijo típico de una subred es /64: los 64 bits bajos los genera el host, habitualmente derivados de su MAC (EUI-64) o aleatorios.',
        'Tipos: unicast global (2000::/3), link-local fe80::/10 (obligatoria en cada interfaz, no enrutable) y multicast ff00::/8 (IPv6 no usa broadcast).',
        'La autoconfiguración SLAAC permite a un equipo generar su dirección sin servidor DHCP; DHCPv6 existe para quien quiere control centralizado.',
        'Con direcciones casi infinitas, NAT deja de ser imprescindible: cada dispositivo puede tener direcciones globales y extremo a extremo directo.'
      ],
      lesson: {
        keyPoints: [
          '128 bits en ocho grupos hexadecimales; :: simplifica un solo bloque de ceros.',
          'Toda interfaz IPv6 tiene una link-local fe80::/10.',
          'Subredes casi siempre /64; multicast sustituye al broadcast.',
          'SLAAC autoconfigura direcciones sin DHCP.'
        ],
        example: '2001:0db8:0000:0000:0000:0000:0000:0001 → 2001:db8::1. La abreviatura :: solo puede aparecer una vez.',
        commonErrors: [
          'Usar :: dos veces en la misma dirección: ambigüedad no permitida.',
          'Esperar broadcast en IPv6: se usa multicast (ff02::1 = todos los nodos del enlace).',
          'Confundir la link-local fe80:: con una dirección global enrutable.'
        ],
        summary: 'IPv6 abre un espacio de direcciones prácticamente ilimitado con autoconfiguración propia; el reto pasa a ser aprender su notación y tipos.'
      },
      whyItMatters: 'El agotamiento de IPv4 ya es real: los operadores y sistemas nuevos exigen convivencia con IPv6.',
      exercise: {
        prompt: 'Abrevia 2001:0db8:0000:0000:0000:ff00:0042:8329 aplicando las reglas de notación.',
        solution: '2001:db8::ff00:42:8329 — ceros iniciales de cada grupo eliminados y el bloque central de ceros comprimido con ::.'
      }
    },
    {
      id: 'r-red-ethernet-mac',
      title: 'Ethernet, tramas y direcciones MAC',
      desc: 'Cómo es una trama Ethernet, qué codifica la MAC y cómo aprende un switch qué puerto usar.',
      category: 'Redes',
      level: 'Básico',
      added: '2025-03-06',
      minutes: 8,
      tags: ['ethernet', 'mac', 'switch'],
      content: [
        'La trama Ethernet II lleva: destino, origen (6 bytes cada MAC), tipo (qué protocolo de capa 3 va dentro), datos y FCS (secuencia de verificación con CRC).',
        'La MAC son 48 bits: los primeros 24 (OUI) identifican al fabricante y los 24 restantes al dispositivo. Se escribe en hexadecimal (aa:bb:cc:11:22:33).',
        'Un switch aprende: al recibir una trama guarda de qué puerto llegó la MAC origen; si la MAC destino no está en su tabla, difunde la trama por el resto de puertos (flooding).',
        'Un hub repite bits por todos los puertos sin entender tramas: todo el cableado es un dominio de colisiones. El switch separa dominios de colisión por puerto.',
        'El dominio de difusión lo separan los routers (o las VLAN): un broadcast de capa 2 solo llega a su dominio.',
        'CSMA/CD era el método de Ethernet con hub: escuchar antes de transmitir y detectar colisiones. Con switches a nodo completo quedó histórico.'
      ],
      lesson: {
        keyPoints: [
          'MAC: 48 bits, OUI de fabricante + identificador de dispositivo.',
          'El switch aprende MAC origen y reenvía solo al puerto destino.',
          'Switch separa dominios de colisión; router separa dominios de difusión.',
          'El FCS permite detectar tramas corruptas, no corregirlas.'
        ],
        example: 'PC-A envía a PC-B la primera vez: el switch aún no sabe dónde está B y difunde la trama; cuando B responde, el switch aprende su puerto y las siguientes van directas.',
        commonErrors: [
          'Creer que el switch limita los broadcasts: solo el router o las VLAN lo hacen.',
          'Confundir FCS (detección de error) con retransmisión (tarea de TCP).',
          'Decir que el hub aprende MACs: no procesa tramas, solo repite.'
        ],
        summary: 'Ethernet organiza los datos en tramas dirigidas por MAC; el conmutador moderno entrega cada trama solo al puerto que la necesita.'
      },
      whyItMatters: 'Sin entender MAC y tramas no se puede depurar una LAN: todo diagnóstico de capa 2 parte de aquí.',
      exercise: {
        prompt: 'Un switch recibe una trama para una MAC desconocida. ¿Qué hace y por qué?',
        solution: 'Difunde la trama por todos los puertos salvo el de origen (flooding): es la única forma de alcanzar una MAC que aún no está en su tabla.'
      }
    },
    {
      id: 'r-red-vlan',
      title: 'VLANs y enlaces trunk',
      desc: 'Segmentar un switch en redes lógicas, etiquetas 802.1Q, enlaces de acceso y trunk, y encaminamiento entre VLANs.',
      category: 'Redes',
      level: 'Intermedio',
      added: '2025-03-08',
      minutes: 10,
      tags: ['vlan', 'trunk', '802.1q'],
      content: [
        'Una VLAN es un dominio de difusión independiente: los broadcasts de una VLAN no salen de ella aunque compartan el mismo switch físico.',
        '802.1Q añade 4 bytes a la trama con el identificador de VLAN (1-4094). El enlace de acceso entrega tramas sin etiqueta; el trunk las transporta etiquetadas entre switches.',
        'La VLAN nativa es la única sin etiqueta en un trunk; debe coincidir en ambos extremos para evitar fugas de tráfico.',
        'Para que dos VLANs se comuniquen hace falta un dispositivo de capa 3: router con subinterfaces (router-on-a-stick) o un switch de capa 3 con interfaces virtuales (SVI).',
        'Ventajas: separar departamentos, contener broadcasts, aplicar políticas de seguridad por VLAN y simplificar el cableado.',
        'Cada VLAN debería tener su propia subred IP; mezclar VLANs y subredes de forma incoherente rompe el encaminamiento.'
      ],
      lesson: {
        keyPoints: [
          'VLAN = dominio de difusión lógico sobre el mismo hardware.',
          'Trunk con 802.1Q transporta varias VLANs; acceso entrega una sola.',
          'Comunicación entre VLANs exige capa 3 (router o switch L3).',
          'Una VLAN debe corresponderse con una subred IP.'
        ],
        example: 'Instituto: VLAN 10 profesores, VLAN 20 alumnos, VLAN 30 administración. El trunk entre switch de aula y switch central lleva las tres etiquetadas.',
        commonErrors: [
          'No configurar la VLAN en el puerto del switch: el equipo queda fuera de su red.',
          'VLAN nativa distinta en cada extremo del trunk.',
          'Esperar que dos VLANs se vean sin router: están aisladas a propósito.'
        ],
        summary: 'Las VLANs separan lógicamente una red física; el trunk las transporta y la capa 3 decide si se comunican entre sí.'
      },
      whyItMatters: 'Es la herramienta estándar para segmentar seguridad y tráfico broadcast sin tirar más cable.',
      exercise: {
        prompt: 'Los alumnos (VLAN 20) deben imprimir en una impresora de la VLAN 10. ¿Qué necesitas configurar?',
        solution: 'Un dispositivo de capa 3 (router con subinterfaces o switch L3) que enrute entre ambas VLANs y una regla que permita el tráfico hacia la impresora.'
      }
    },
    {
      id: 'r-red-nat-routing',
      title: 'Routing y NAT',
      desc: 'Cómo decide un router con su tabla de rutas, la ruta por defecto y las variantes de NAT y PAT.',
      category: 'Redes',
      level: 'Intermedio',
      added: '2025-03-10',
      minutes: 11,
      tags: ['routing', 'nat', 'pat', 'gateway'],
      content: [
        'El router consulta su tabla de rutas: destino, máscara, siguiente salto, interfaz y métrica. Gana la ruta más específica (prefijo más largo), no la de menor métrica.',
        'La ruta por defecto (0.0.0.0/0) captura todo lo que no encaja en otra ruta: es la puerta hacia internet del router doméstico.',
        'Rutas estáticas (configuradas a mano) frente a dinámicas (RIP, OSPF): los protocolos dinámicos aprenden y adapta rutas solos.',
        'NAT estático mapea una IP interna a una pública fija; dinámico saca un grupo de públicas; PAT (sobrecarga) comparte una sola pública distinguiendo por puertos.',
        'PAT mantiene una tabla de traducciones (IP:interno:puerto ↔ IP:pública:puerto) y por eso un router doméstico sirve a decenas de equipos con una IP pública.',
        'Limitación: nadie puede iniciar una conexión hacia dentro sin un mapeo explícito (reenvío de puertos) porque no hay traducción previa en la tabla.'
      ],
      lesson: {
        keyPoints: [
          'La ruta más específica gana; la por defecto es el comodín final.',
          'PAT comparte una IP pública usando puertos distintos por conexión.',
          'Reenvío de puertos permite servir desde dentro de una red con NAT.',
          'Router separa dominios de difusión y encamina entre subredes.'
        ],
        example: 'Dos PCs con 192.168.1.2 y 192.168.1.3 navegan a la vez: sus conexiones salen ambas por 83.44.10.1 pero con puertos origen distintos (por ejemplo 51234 y 51555).',
        commonErrors: [
          'Confundir NAT (direcciones) con PAT (puertos): el doméstico es PAT.',
          'Creer que la métrica gana al prefijo más largo en la tabla de rutas.',
          'Olvidar el reenvío de puertos al exponer un servidor interno.'
        ],
        summary: 'El routing decide el camino por prefijo más específico; NAT/PAT traduce privadas a una pública y hace viable IPv4 en internet.'
      },
      whyItMatters: 'Todo diagnóstico de conectividad a internet pasa por entender gateway, rutas y traducción.',
      exercise: {
        prompt: 'Necesitas que una cámara IP interna (192.168.1.50:80) sea accesible desde internet. ¿Qué configuras?',
        solution: 'Reenvío de puertos en el router: puerto externo (por ejemplo 8080) hacia 192.168.1.50:80, creando una entrada PAT estática.'
      }
    },
    {
      id: 'r-red-icmp-diagnostico',
      title: 'Diagnóstico de red: ICMP y herramientas',
      desc: 'Ping, tracert, ipconfig y nslookup: qué mira cada una y el orden profesional de comprobación.',
      category: 'Redes',
      level: 'Intermedio',
      added: '2025-03-12',
      minutes: 12,
      tags: ['icmp', 'ping', 'tracert', 'ipconfig', 'nslookup', 'diagnostico'],
      content: [
        'ICMP es el protocolo de señalización de IP: echo request/reply (ping), destination unreachable, time exceeded. No transporta datos de usuario.',
        'Método de ping escalonado: 127.0.0.1 (pila TCP/IP local) → propia IP (tarjeta) → gateway (red local) → IP pública conocida (8.8.8.8, internet) → nombre de dominio (DNS).',
        'Request timed out: la petición no obtiene respuesta (destino apagado, firewall que descarta o ruta rota). Destination host unreachable: algo del camino responde que no sabe llegar.',
        'tracert (Windows) / traceroute (Linux) envía paquetes con TTL creciente: cada router que decrementa el TTL a cero responde, revelando el camino y dónde se corta.',
        'ipconfig /all muestra IP, máscara, gateway, DNS y leases DHCP; ipconfig /release y /renew fuerzan renovación; /flushdns limpia la caché DNS local.',
        'nslookup consulta servidores DNS: distingue si el fallo es de resolución (no resuelve nombres) o de conectividad (resuelve pero no llega).',
        'Orden profesional: capa física y enlace (cable, luz del puerto) → IP y máscara → gateway → DNS → aplicación.'
      ],
      lesson: {
        keyPoints: [
          'Ping al gateway comprueba la red local; ping a 8.8.8.8 comprueba internet.',
          'Si la IP responde pero el nombre no, el problema es DNS.',
          'tracert localiza el salto exacto donde muere la conexión.',
          'ipconfig /all es el primer dato de cualquier incidencia de red.'
        ],
        example: 'Equipo sin internet: ping a 127.0.0.1 ok, a 192.168.1.1 ok, a 8.8.8.8 falla → el problema está más allá del router (operador o rutas).',
        commonErrors: [
          'Dar por mala la red sin comprobar el cable o el estado del puerto.',
          'Confundir un firewall que bloquea ICMP con un equipo apagado.',
          'Reiniciar sin mirar ipconfig /all: se pierde el dato del lease DHCP.'
        ],
        summary: 'Las herramientas ICMP y de configuración permiten localizar la capa rota: física, IP, gateway, DNS o aplicación.'
      },
      whyItMatters: 'El 80% de las incidencias de red se resuelven con este método escalonado y documentado.',
      exercise: {
        prompt: 'Un equipo navega por IP pero no abre nombres. ¿Qué comando usas y qué comprobarías después?',
        solution: 'nslookup para ver si la resolución falla; después los servidores DNS configurados en ipconfig /all y su accesibilidad (ping al DNS).'
      }
    },
    {
      id: 'r-red-subnet-intermedio',
      title: 'Subnetting intermedio: /25 a /30',
      desc: 'Tabla completa de prefijos, determinación de la subred de una IP y cálculo inverso desde los hosts necesarios.',
      category: 'Redes',
      level: 'Intermedio',
      added: '2025-03-14',
      minutes: 12,
      tags: ['subnetting', 'cidr', 'calculo'],
      content: [
        'Tabla esencial: /25 → 126 hosts, /26 → 62, /27 → 30, /28 → 14, /29 → 6, /30 → 2. Siempre 2^h − 2 (red y broadcast reservados).',
        'El salto de subred es 256 menos el octeto de la máscara extendida: /26 (máscara .192) salta de 64; /28 (.240) salta de 16.',
        'Para ubicar una IP: divide el último octeto entre el salto. 192.168.4.100/26 → 100 ÷ 64 = 1 bloque completo → subred 192.168.4.64, broadcast 192.168.4.127.',
        'Cálculo inverso: ¿cuántos hosts para 50 equipos? El primer prefijo con 2^h − 2 ≥ 50 es /26 (62). Redondea siempre hacia arriba.',
        '¿Cuántas subredes salen de un /24 al /26? 2^(26−24) = 4 subredes de 64 direcciones cada una.',
        'Comprobación cruzada: la suma de hosts de todas las subredes no puede superar el espacio original, y cada subred debe quedar alineada a su tamaño.'
      ],
      lesson: {
        keyPoints: [
          'Hosts: /25 126 · /26 62 · /27 30 · /28 14 · /29 6 · /30 2.',
          'Salto = 256 − octeto extendido de la máscara.',
          'Ubicar una IP: división entera del octeto relevante entre el salto.',
          'Necesidades de hosts → el prefijo más corto que las cubre.'
        ],
        example: '192.168.4.100/26: máscara 255.255.255.192, salto 64. Bloques: .0, .64, .128, .192. La .100 cae en .64; broadcast .127; hosts .65-.126.',
        commonErrors: [
          'Elegir /28 para 20 hosts: solo ofrece 14; se necesita /27.',
          'Restar el salto en vez de multiplicar bloques al ubicar la subred.',
          'Olvidar que la primera y última dirección de cada bloque no son asignables.'
        ],
        summary: 'Dominar la tabla de prefijos y el salto permite ubicar IPs, calcular rangos y elegir máscaras sin calculadora.'
      },
      whyItMatters: 'Es el cálculo que más veces aparece en exámenes y en la práctica: dimensionar subredes correctamente.',
      exercise: {
        prompt: '¿Qué subred, broadcast y rango de hosts corresponden a 10.0.0.199/28?',
        solution: 'Máscara 255.255.255.240, salto 16. Bloques: .192 → subred 10.0.0.192, broadcast 10.0.0.207, hosts de .193 a .206 (14 hosts).'
      }
    },
    {
      id: 'r-red-vlsm-avanzado',
      title: 'VLSM y diseño de redes pequeñas',
      desc: 'Reparto de una red base en subredes de distinto tamaño paso a paso, con alineación de bloques y documentación.',
      category: 'Redes',
      level: 'Avanzado',
      added: '2025-03-16',
      minutes: 14,
      tags: ['vlsm', 'subnetting', 'diseno'],
      content: [
        'VLSM reparte una red base en trozos a medida. Regla de oro: asigna siempre primero la subred mayor y continúa de mayor a menor.',
        'Ejemplo sobre 192.168.0.0/24 con necesidades 100, 50, 20, 2 y 2 hosts:',
        '— 100 hosts → /25 (126 útiles): 192.168.0.0/25, rango .1-.126, broadcast .127.',
        '— 50 hosts → /26 (62): 192.168.0.128/26, rango .129-.190, broadcast .191.',
        '— 20 hosts → /27 (30): 192.168.0.192/27, rango .193-.222, broadcast .223.',
        '— 2 hosts → /30 (2): 192.168.0.224/30, rango .225-.226, broadcast .227.',
        '— 2 hosts → /30: 192.168.0.228/30, rango .229-.230, broadcast .231.',
        'Cada bloque debe estar alineado a su tamaño: una /26 solo puede empezar en .0, .64, .128 o .192. Por eso el cursor avanza al siguiente múltiplo.',
        'Los enlaces punto a punto consumen /30 (o /31 según RFC 3021, que permite 2 hosts sin reserva de red y broadcast).',
        'Documenta siempre el reparto: subred, VLAN, uso y rango. Un plan VLSM sin tabla de referencia se vuelve inmantenible.'
      ],
      lesson: {
        keyPoints: [
          'De mayor a menor, contiguo y alineado a múltiplos del tamaño.',
          '100→/25, 50→/26, 20→/27, 6→/29, 2→/30.',
          'Los enlaces router-router se sirven con /30 o /31.',
          'El reparto debe sobrar espacio para crecer; no ajustes al milímetro.'
        ],
        example: 'El reparto del ejemplo consume hasta .231, dejando .232-.255 libres para futuras ampliaciones de la red.',
        commonErrors: [
          'Empezar por las subredes pequeñas: provoca huecos que no caben las grandes.',
          'Colocar una /26 empezando en .96 (no alineada): se solaparía con otra subred.',
          'No reservar espacio de crecimiento y tener que renumerar todo después.'
        ],
        summary: 'VLSM es un algoritmo de empaquetado: mayores primero, alineación de bloques y documentación del reparto.'
      },
      whyItMatters: 'Es el ejercicio avanzado típico de examen y el diseño real de cualquier red multi-departamento.',
      exercise: {
        prompt: 'Reparte 192.168.10.0/24 para: aula 60, secretaría 25, enlace 2. Escribe las tres subredes.',
        solution: 'Aula: 192.168.10.0/26 (.1-.62). Secretaría: 192.168.10.64/27 (.65-.94). Enlace: 192.168.10.96/30 (.97-.98). Libre desde .100.'
      }
    },
    {
      id: 'r-red-servicios-dns',
      title: 'DNS en detalle',
      desc: 'Jerarquía del sistema de nombres, resolución recursiva, tipos de registro y diagnóstico con nslookup.',
      category: 'Redes',
      level: 'Intermedio',
      added: '2025-03-18',
      minutes: 10,
      tags: ['dns', 'puertos'],
      content: [
        'DNS resuelve nombres a direcciones IP mediante una jerarquía: servidores raíz (.), TLD (.es, .com) y autoritativos del dominio.',
        'El resolvedor del operador (o 8.8.8.8, 1.1.1.1) hace la consulta recursiva por el cliente: recorre la jerarquía y cachea el resultado.',
        'Cada respuesta lleva un TTL: los segundos durante los que puede reutilizarse de caché. Un TTL largo acelera pero retrasa los cambios.',
        'Registros habituales: A (nombre → IPv4), AAAA (→ IPv6), CNAME (alias), MX (correo), NS (servidores del dominio), TXT (textos, SPF/verificación) y PTR (IP → nombre, inversa).',
        'Consultas por UDP/53 por eficiencia; TCP/53 para respuestas grandes y transferencias de zona entre servidores.',
        'Síntoma clásico de DNS caído: el ping a una IP funciona pero el nombre no se resuelve. Herramientas: nslookup (Windows) y dig (Linux).'
      ],
      lesson: {
        keyPoints: [
          'Jerarquía: raíz → TLD → autoritativo; el resolvedor cachea con TTL.',
          'A/AAAA para direcciones, MX para correo, CNAME para alias.',
          'Consultas normales en UDP/53; transferencias en TCP/53.',
          'Ping IP ok + ping nombre mal = problema de DNS.'
        ],
        example: 'nslookup www.ejemplo.es devuelve servidor → dirección y el servidor que respondió; si responde la raíz del dominio sin A, falta el registro.',
        commonErrors: [
          'Confundir CNAME con redirección web: es un alias de nombre, no de URL.',
          'Cambiar un registro y no verlo por la caché con TTL vigente.',
          'Culpar al firewall cuando el fallo es de resolución de nombres.'
        ],
        summary: 'DNS traduce nombres a IPs en una jerarquía global cacheada; su diagnóstico se separa del de conectividad con nslookup.'
      },
      whyItMatters: 'Casi todo servicio depende de DNS: es el primer sospechoso cuando "la red va lenta o nada abre".',
      exercise: {
        prompt: 'Un usuario no abre la intranet por nombre pero sí por IP 192.168.1.10. ¿Diagnóstico y dos comprobaciones?',
        solution: 'Fallo de resolución DNS. Comprueba con nslookup el nombre y los servidores DNS del equipo en ipconfig /all (¿apuntan al servidor interno?).'
      }
    },
    {
      id: 'r-so-fs-permisos',
      title: 'Permisos y sistemas de archivos: Linux y Windows',
      desc: 'Modelo rwx de Linux con notación numérica, ACLs de Windows y NTFS, y diferencias entre ambos modelos.',
      category: 'Sistemas Operativos',
      level: 'Intermedio',
      added: '2025-03-20',
      minutes: 12,
      tags: ['permisos', 'linux', 'ntfs'],
      content: [
        'Linux asigna a cada archivo tres tripletas rwx (leer, escribir, ejecutar) para propietario, grupo y otros. ls -l muestra -rwxr-x---.',
        'Notación octal: r=4, w=2, x=1. 755 = rwxr-xr-x (típico de scripts y directorios), 644 = rw-r--r-- (archivos de configuración), 600 = solo el dueño (claves).',
        'chmod cambia permisos (chmod 640 archivo o chmod g+w), chown cambia propietario y grupo, ambos suelen requerir sudo si no es tu archivo.',
        'El bit x en directorios significa "atravesar": sin él no puedes entrar aunque puedas listar nombres.',
        'Windows usa ACLs: listas por usuario y grupo con permisos granulares (lectura, modificación, control total) y herencia desde carpetas padre.',
        'Permisos efectivos NTFS: se combinan lo concedido y lo denegado; una denegación explícita siempre gana. NET USE/icacls e icacucls permiten inspeccionarlos.',
        'Ext4 aplica permisos POSIX como los descritos; FAT32 y exFAT no los soportan: por eso un USB formateado en FAT32 no guarda permisos.'
      ],
      lesson: {
        keyPoints: [
          'r=4, w=2, x=1: 755, 644 y 600 son las combinaciones típicas.',
          'x en un directorio es permiso de atravesarlo.',
          'Windows trabaja con ACLs heredables; la denegación explícita prevalece.',
          'FAT32/exFAT no almacenan permisos; NTFS y ext4 sí.'
        ],
        example: 'script.sh debe ejecutarse solo por su dueño: chmod 700 script.sh (rwx------). Con ls -l se vería -rwx------.',
        commonErrors: [
          'Dar 777 "para que funcione": abre escritura a todos y es una mala práctica.',
          'Confundir chown (dueño) con chmod (permisos).',
          'Esperar permisos NTFS en un disco exFAT: el sistema de archivos no los guarda.'
        ],
        summary: 'Los permisos expresan quién puede hacer qué: tripleta rwx en Linux, ACLs heredables en Windows; el sistema de archivos los soporta o no.'
      },
      whyItMatters: 'Los permisos mal puestos son causa de incidencias y de brechas: es seguridad y operación a la vez.',
      exercise: {
        prompt: '¿Qué significan rws como 640 sobre un archivo y quién puede leerlo y escribirlo?',
        solution: 'rw-r-----: el propietario lee y escribe; el grupo solo lee; los demás nada. (6=rw, 4=r, 0=---).'
      }
    },
    {
      id: 'r-so-memoria',
      title: 'Memoria virtual y gestión de procesos',
      desc: 'RAM, paginación, swap, procesos e hilos: qué ocurre cuando la memoria se agota y cómo se gestiona.',
      category: 'Sistemas Operativos',
      level: 'Intermedio',
      added: '2025-03-22',
      minutes: 10,
      tags: ['memoria', 'procesos', 'kernel'],
      content: [
        'El kernel da a cada proceso un espacio de direcciones virtual aislado; la MMU traduce direcciones virtuales a físicas mediante tablas de páginas.',
        'Cuando la RAM se llena, páginas poco usadas se mueven al disco (swap en Linux, pagefile.sys en Windows): la memoria "crece" a cambio de velocidad.',
        'Thrashing: si el sistema pasa más tiempo intercambiando páginas que ejecutando, todo se vuelve lentísimo. Síntoma clásico de RAM insuficiente.',
        'Proceso = programa en ejecución con su espacio de memoria; hilo = unidad de ejecución dentro de un proceso que comparte memoria con sus hermanos.',
        'Estados típicos: listo (espera CPU), en ejecución y bloqueado (espera E/S). El planificador reparte CPU por prioridades.',
        'Herramientas: Administrador de tareas y tasklist/taskkill en Windows; ps, top, htop y kill en Linux. kill -9 fuerza; TERM pide cierre limpio.',
        'Un proceso puede terminar con OOM (out of memory) si el kernel no encuentra memoria disponible: suele dejar rastro en los logs del sistema.'
      ],
      lesson: {
        keyPoints: [
          'La memoria virtual aísla procesos y permite usar más memoria que la RAM física.',
          'Swap/pagefile salvan picos, pero el abuso (thrashing) mata el rendimiento.',
          'Un hilo comparte memoria de su proceso; un proceso tiene la suya aislada.',
          'kill (TERM) pide cierre; kill -9 (KILL) lo impone.'
        ],
        example: 'Equipo con 8 GB y navegadores con 60 pestañas: el disco suena, todo va lento y el uso de disco al 100% en el Administrador de tareas es swap activo.',
        commonErrors: [
          'Confundir memoria RAM llena con disco lleno: síntomas y soluciones difieren.',
          'Finalizar con -9 sin intento previo de cierre limpio: riesgo de corrupción.',
          'Creer que más swap sustituye a más RAM: solo amortigua.'
        ],
        summary: 'La memoria virtual abstrae la RAM mediante paginación y swap; procesos e hilos son las unidades que el kernel planifica.'
      },
      whyItMatters: 'Diagnóstico de lentitudes: distinguir falta de RAM, swap excesivo y procesos desbocados cambia por completo la solución.',
      exercise: {
        prompt: 'Un equipo va lento, el disco al 100% y la RAM al 95%. ¿Qué ocurre y qué propones?',
        solution: 'Thrashing: la RAM se agota y el sistema pagina constantemente. Cerrar procesos con más consumo, y si es habitual, ampliar RAM.'
      }
    },
    {
      id: 'r-so-arranque',
      title: 'El proceso de arranque: POST, UEFI y bootloader',
      desc: 'Qué ocurre desde que se pulsa el botón hasta que aparece el escritorio, y cómo se recupera un arranque roto.',
      category: 'Sistemas Operativos',
      level: 'Intermedio',
      added: '2025-03-24',
      minutes: 11,
      tags: ['arranque', 'uefi', 'bios'],
      content: [
        'POST: el firmware (BIOS/UEFI) verifica CPU, RAM y dispositivos básicos. Un fallo emite pitidos o códigos según el fabricante.',
        'El firmware consulta el orden de arranque y busca un dispositivo arrancable: disco con MBR activo (BIOS) o partición EFI (UEFI).',
        'El bootloader carga el kernel: Windows Boot Manager (BCD) o GRUB en Linux. Doble arranque = dos bootloaders conviviendo.',
        'Con UEFI: partición EFI FAT32 con los cargadores, tabla GPT y Secure Boot que solo ejecuta cargadores firmados.',
        'El kernel monta la raíz y arranca servicios: en Windows, Session Manager y servicios; en Linux, systemd con unidades (target/services).',
        'Recuperación: WinRE (Windows) ofrece reparación de inicio, restauración y consola; Linux ofrece shells de rescate desde GRUB o Live USB.',
        'Herramientas: sfc /scannow (repara archivos del sistema), chkdsk /f (sistema de archivos), bootrec (BCD) en Windows; update-grub en Linux.'
      ],
      lesson: {
        keyPoints: [
          'POST → firmware elige dispositivo → bootloader → kernel → servicios.',
          'UEFI + GPT + partición EFI frente a BIOS + MBR activo.',
          'Secure Boot solo firma de cargadores conocidos.',
          'WinRE y GRUB son las vías de rescate de cada mundo.'
        ],
        example: 'Tras sustituir la placa, Windows no arranca: el bootloader guarda configuración del controlador anterior; reparación de inicio de WinRE la reconstruye.',
        commonErrors: [
          'Cambiar el orden de arranque para siempre en vez de usar el menú temporal (F12/F8).',
          'Desactivar Secure Boot "porque sí" sin entender qué se pierde.',
          'Confundir fallo de POST (no hay imagen) con fallo del bootloader (hay logo y luego error).'
        ],
        summary: 'Arrancar es una cadena: cada eslabón (firmware, bootloader, kernel, servicios) tiene su modo de fallo y su herramienta de reparación.'
      },
      whyItMatters: 'El mantenimiento de equipos reales pasa por distinguir dónde se rompe el arranque y usar la reparación correcta.',
      exercise: {
        prompt: 'Un equipo muestra el logo del fabricante y luego "Operating System not found". ¿Dónde está el fallo?',
        solution: 'El POST y el firmware funcionan: el bootloader o el disco no se encuentra. Comprueba orden de arranque, disco detectado y BCD/GRUB.'
      }
    },
    {
      id: 'r-so-powershell-bash',
      title: 'Línea de comandos: CMD, PowerShell y Bash',
      desc: 'Cuándo usar cada consola, cmdlets de PowerShell, tuberías de Bash y scripts de diagnóstico.',
      category: 'Sistemas Operativos',
      level: 'Intermedio',
      added: '2025-03-26',
      minutes: 12,
      tags: ['cmd', 'powershell', 'bash', 'terminal'],
      content: [
        'CMD es el intérprete histórico de Windows (dir, copy, ipconfig): aún útil, pero limitado a texto plano.',
        'PowerShell trabaja con objetos: Get-Process devuelve procesos con propiedades ordenables y filtrables. Los cmdlets se nombran verbo-sustantivo (Get-Service, Stop-Process).',
        'La tubería de PowerShell pasa objetos (Get-Service | Where-Object Status -eq Running); la de Bash pasa texto que se recorta con grep, cut, awk.',
        'Bash esencial: ls, cd, cp, mv, rm, cat, less, grep, find, |, >, >>, && (si el anterior funciona) y || (si falla).',
        'Variables: $env:PATH en PowerShell, export PATH en Bash. El PATH determina qué comandos se encuentran sin ruta completa.',
        'Scripts: .ps1 con política de ejecución controlada; .sh con shebang #!/bin/bash y permiso x. Automatizan inventarios, copias y comprobaciones.',
        'Para diagnóstico: Get-EventLog / Get-WinEvent (logs), Get-NetIPConfiguration (red), df -h y free -h (disco y memoria en Linux).'
      ],
      lesson: {
        keyPoints: [
          'PowerShell = objetos y verbos; Bash = texto y tuberías.',
          'El PATH decide qué comandos resuelven sin ruta.',
          'Pipes: Where-Object en PowerShell, grep en Bash.',
          'Los scripts de diagnóstico son la memoria operativa de un técnico.'
        ],
        example: 'Top 5 procesos por memoria en PowerShell: Get-Process | Sort-Object WS -Descending | Select-Object -First 5 Name, WS.',
        commonErrors: [
          'Usar sintaxis CMD en PowerShell (dir funciona por alias, pero no es lo mismo).',
          'Ejecutar .ps1 sin entender la política de ejecución (Restricted por defecto).',
          'rm -rf o Remove-Item con rutas mal citadas: borrados accidentales.'
        ],
        summary: 'Cada consola tiene su modelo (objetos vs texto); dominar tuberías y PATH convierte la línea de comandos en palanca de diagnóstico.'
      },
      whyItMatters: 'La administración real se automatiza en consola: GUI para descubrir, CLI para repetir.',
      exercise: {
        prompt: 'Escribe el comando PowerShell que lista los servicios en ejecución y el equivalente con systemctl en Linux.',
        solution: 'Get-Service | Where-Object Status -eq Running; y systemctl list-units --type=service --state=running.'
      }
    },
    {
      id: 'r-so-logs-recuperacion',
      title: 'Registros, restauración y recuperación del sistema',
      desc: 'Visor de eventos, syslog, puntos de restauración y decisiones de reparación: reparar, restaurar o reinstalar.',
      category: 'Sistemas Operativos',
      level: 'Intermedio',
      added: '2025-03-28',
      minutes: 10,
      tags: ['logs', 'restauracion', 'recuperacion'],
      content: [
        'Windows centraliza logs en el Visor de eventos: registros Sistema y Aplicación con niveles (Información, Advertencia, Error) e identificadores de evento.',
        'Linux usa syslog/journald: journalctl -xe muestra los últimos eventos con contexto; los logs de servicios viven en /var/log.',
        'Un punto de restauración guarda el estado del registro y de archivos del sistema: no toca documentos personales. Ideal antes de instalar controladores.',
        'Modo seguro carga lo mínimo: si el problema desaparece ahí, el sospechoso es un controlador o software de terceros.',
        'Herramientas de reparación de Windows: sfc /scannow (archivos del sistema), DISM (imagen de componentes) y chkdsk (sistema de archivos).',
        'Orden de decisión profesional: reparar (barato, preserva todo) → restaurar (deshace el cambio reciente) → reinstalar (último recurso, con copia previa).',
        'Antes de cualquier intervención: copia de seguridad de datos y nota de qué se intentó. Documentar acelera la siguiente avería.'
      ],
      lesson: {
        keyPoints: [
          'Los logs dicen qué y cuándo: Visor de eventos / journalctl.',
          'Punto de restauración = deshacer cambios de sistema sin tocar datos.',
          'sfc, DISM y chkdsk cubren archivos, imagen y disco.',
          'Reparar antes de restaurar; restaurar antes de reinstalar.'
        ],
        example: 'Tras un controlador de vídeo el equipo no arranca: modo seguro → desinstalar controlador → punto de restauración si persiste.',
        commonErrors: [
          'Reinstalar sin leer el Visor de eventos: se pierde el diagnóstico.',
          'Usar puntos de restauración como copia de seguridad de documentos: no lo son.',
          'Ejecutar chkdsk sin entender que puede tardar y marcar sectores.'
        ],
        summary: 'Logs, restauración y herramientas de reparación forman la escalera de recuperación: cada peldaño cuesta menos que el siguiente.'
      },
      whyItMatters: 'La diferencia entre un técnico y un improvisado está en leer los logs y escalar la intervención con criterio.',
      exercise: {
        prompt: 'Windows se reinicia solo desde ayer. ¿Cuál es tu secuencia de trabajo?',
        solution: 'Visor de eventos (errores críticos previos al reinicio) → cambios recientes (actualizaciones, controladores) → modo seguro → restauración al punto previo.'
      }
    },
    {
      id: 'r-hw-cpu',
      title: 'CPU: núcleos, hilos, caché y frecuencia',
      desc: 'Cómo se mide y qué limita el rendimiento de un procesador: frecuencia, IPC, núcleos, hilos y cachés.',
      category: 'Hardware',
      level: 'Intermedio',
      added: '2025-03-30',
      minutes: 11,
      tags: ['cpu', 'cache', 'rendimiento'],
      content: [
        'La frecuencia (GHz) cuenta ciclos por segundo, pero el trabajo real depende del IPC (instrucciones por ciclo): arquitecturas recientes hacen más con menos GHz.',
        'Núcleos físicos ejecutan instrucciones en paralelo; SMT (Hyper-Threading) duplica hilos por núcleo compartiendo recursos: ~20-30% extra, no el doble.',
        'Caché L1 (rápida y diminuta), L2 (por núcleo) y L3 (compartida): guardan datos reutilizados para evitar ir a RAM. Más caché ayuda en cargas repetitivas.',
        'TDP indica el calor a disipar: condiciona disipador y refrigeración. El throttling térmico reduce frecuencia al superarse la temperatura.',
        'El socket y el chipset de la placa determinan qué procesadores son compatibles; el BIOS/UEFI puede requerir actualización para CPUs nuevas.',
        'Guía de dimensionado: ofimática 4 núcleos bastan; desarrollo y virtualización premian núcleos y RAM; juegos premian frecuencia e IPC.',
        'Diagnóstico: CPU al 100% constante con lentitud puede ser un proceso desbocados (ver Administrador de tareas) y no un fallo de hardware.'
      ],
      lesson: {
        keyPoints: [
          'Rendimiento ≈ frecuencia × IPC × núcleos; no solo GHz.',
          'SMT duplica hilos, no núcleos: ganancia parcial.',
          'L1 < L2 < L3 en tamaño, y al revés en velocidad.',
          'El socket fija compatibilidad; el TDP fija refrigeración.'
        ],
        example: 'Dos CPUs a 3.5 GHz: una de arquitectura antigua y otra nueva rinden distinto; el IPC nuevo puede rendir un 30% más con la misma frecuencia.',
        commonErrors: [
          'Comparar procesadores solo por GHz entre generaciones distintas.',
          'Pensar que más hilos = doble rendimiento.',
          'Instalar una CPU potente con disipador insuficiente: throttling y pérdida de rendimiento.'
        ],
        summary: 'El rendimiento del procesador es un producto de frecuencia, IPC y núcleos, limitado por temperatura y compatibilidad de socket.'
      },
      whyItMatters: 'Es la base para asesorar compras, detectar cuellos de botella y entender el throttling en averías.',
      exercise: {
        prompt: 'Un portátil rinde bien en frío y se frena tras 10 minutos de carga. ¿Qué fenómeno buscas y cómo lo confirmas?',
        solution: 'Thermal throttling: monitoriza temperaturas y frecuencias en carga (HWMonitor/HWiNFO); si la frecuencia cae al subir la temperatura, es térmico (limpieza, pasta, base refrigerante).'
      }
    },
    {
      id: 'r-hw-gpu',
      title: 'GPU y salidas de vídeo',
      desc: 'GPU integrada frente a dedicada, VRAM, conectores HDMI y DisplayPort, y alimentación de tarjetas.',
      category: 'Hardware',
      level: 'Básico',
      added: '2025-04-01',
      minutes: 9,
      tags: ['gpu', 'hdmi', 'displayport'],
      content: [
        'La GPU paraleliza el dibujado de imágenes. Integrada: dentro del procesador, comparte RAM del sistema; dedicada: propia memoria VRAM y refrigeración.',
        'Para ofimática y salida de vídeo basta la integrada; edición, modelado y cálculo aprovechan VRAM y núcleos de una dedicada.',
        'HDMI y DisplayPort transportan vídeo y audio digital. HDMI 2.0: 4K a 60 Hz; HDMI 2.1 y DP 1.4/2.0: 4K a 120 Hz o más.',
        'VGA (analógico) y DVI (digital sin audio) son legado: calidad y resolución máximas inferiores. Adapters activos/inactivos importan.',
        'Las GPUs dedicadas medias y altas necesitan conectores PCIe de alimentación (6/8 pines) desde la fuente: comprobar potencia y conectores antes de instalar.',
        'Los drivers de GPU influyen más que en cualquier otro componente: actualizar desde el fabricante y con punto de restauración previo.',
        'Diagnóstico: artefactos visuales y pantallas negras en carga apuntan a sobrecalentamiento, alimentación insuficiente o VRAM dañada.'
      ],
      lesson: {
        keyPoints: [
          'Integrada comparte RAM; dedicada tiene VRAM propia.',
          'HDMI 2.0 → 4K60; DP 1.4 → 4K120+.',
          'Tarjetas potentes exigen conectores y potencia de PSU dedicados.',
          'Artefactos y negro en carga = térmico, alimentación o VRAM.'
        ],
        example: 'Monitor 4K a 60 Hz por HDMI 1.4 se queda en 30 Hz: la versión del conector y su certificación limitan antes que la GPU.',
        commonErrors: [
          'Comprar una GPU sin revisar la PSU (potencia y conectores).',
          'Conectar 4K120 a un puerto HDMI 1.4 y culpar a la GPU.',
          'Ignorar los drivers al diagnosticar fallos gráficos.'
        ],
        summary: 'La elección de GPU depende del uso; los conectores, la alimentación y los drivers condicionan el resultado tanto como la propia tarjeta.'
      },
      whyItMatters: 'Salidas de vídeo y alimentación son las dos trampas habituales al montar o actualizar una GPU.',
      exercise: {
        prompt: 'Quieres 4K a 120 Hz desde un portátil. ¿Qué revisas antes de comprar el cable?',
        solution: 'Que la salida del portátil sea HDMI 2.1 o DisplayPort 1.4+, que el monitor soporte esa tasa y un cable certificado para esa velocidad.'
      }
    },
    {
      id: 'r-hw-psu-refrigeracion',
      title: 'Fuente de alimentación y refrigeración',
      desc: 'Cómo dimensionar una PSU, certificaciones 80 PLUS, flujo de aire y control de temperaturas.',
      category: 'Hardware',
      level: 'Intermedio',
      added: '2025-04-03',
      minutes: 10,
      tags: ['psu', 'refrigeracion', 'temperaturas'],
      content: [
        'La PSU convierte 230 V AC en las líneas DC del equipo (+12 V es la más exigida por CPU y GPU). Dimensiona con margen del 20-30% sobre el consumo pico.',
        'Certificación 80 PLUS (Bronze, Gold, Titanium): eficiencia de conversión. Mayor eficiencia = menos calor y menos consumo, no más potencia.',
        'Conectores críticos: ATX 24 pines (placa), EPS 8 pines (CPU), PCIe 6/8 pines (GPU), SATA (discos). Nunca mezclar adaptadores dudosos.',
        'Flujo de aire: entrada frontal/inferior fría, salida trasera/superior caliente. Presión positiva (más entra que sale) acumula menos polvo por rendijas.',
        'Refrigeración por aire (disipador + ventilador) es fiable y barata; AIO líquida gana en CPUs de alto TDP y en silencio relativo.',
        'Temperaturas de referencia en carga: CPU por debajo de ~85 °C, GPU ~80 °C. Por encima, revisar disipador, pasta, ventiladores y cableado que obstruya.',
        'La pasta térmica se seca con los años: renovarla cada 2-3 años devuelve 5-10 grados en equipos veteranos.'
      ],
      lesson: {
        keyPoints: [
          'PSU con margen 20-30% y certificación 80 PLUS razonable.',
          'El +12 V alimenta lo que más consume: CPU y GPU.',
          'Entrada fría frontal, salida caliente trasera; presión positiva contra polvo.',
          'CPU < ~85 °C en carga; si no, revisar refrigeración y pasta.'
        ],
        example: 'Consumo estimado 350 W: PSU de 550 W Gold deja margen y eficiencia; una de 450 W sin conectores PCIe obligaría a adaptadores (mala idea).',
        commonErrors: [
          'Culpar a la GPU de reinicios cuando la PSU queda corta en picos.',
          'Montar ventiladores soplando uno contra otro (cero flujo).',
          'Olvidar la película protectora del disipador nuevo antes de aplicar pasta.'
        ],
        summary: 'Una PSU con margen y un flujo de aire correcto son la base de la estabilidad: las temperaturas lo confirman todo.'
      },
      whyItMatters: 'La mitad de las averías "misteriosas" (reinicios, apagados en carga) son térmicas o de alimentación.',
      exercise: {
        prompt: 'Un equipo se apaga solo al jugar. GPU nueva hace un mes. ¿Qué dos sospechosos y cómo los confirmas?',
        solution: 'PSU corta en picos (prueba con otra de mayor potencia o revisa consumos) y sobrecalentamiento de GPU (monitoriza temperaturas y ventosas/polvos).'
      }
    },
    {
      id: 'r-seg-ingenieria-social',
      title: 'Ingeniería social y phishing',
      desc: 'Cómo se manipula a las personas: señales de phishing, spear phishing y protocolo de actuación.',
      category: 'Seguridad',
      level: 'Básico',
      added: '2025-04-05',
      minutes: 11,
      tags: ['phishing', 'ingenieria-social'],
      content: [
        'La ingeniería social ataca a la persona, no al sistema: usa urgencia, autoridad, miedo o recompensa para provocar una acción inmediata.',
        'Phishing masivo: correo que suplanta a una entidad y busca credenciales o pagos. Spear phishing: mensaje dirigido con datos reales de la víctima, mucho más creíble.',
        'Variantes: smishing (SMS), vishing (llamada telefónica) y fraude del CEO/BEC (correo del jefe pidiendo transferencias urgentes).',
        'Señales típicas: dominio ligeramente alterado (banco-seguro.com), URL que no coincide con el texto del enlace, adjuntos inesperados, peticiones de credenciales o pagos urgentes.',
        'Ninguna entidad legítima pide contraseñas completas, códigos MFA ni pagos por vías informales: ese es el filtro mental básico.',
        'Protocolo ante sospecha: no pulsar ni responder; verificar por otro canal (llamar al número oficial); reportar al responsable; si se pulsó, cambiar credenciales de inmediato y avisar.',
        'La mitigación estructural es MFA (el robo de contraseña no basta) y formación periódica con simulacros controlados.'
      ],
      lesson: {
        keyPoints: [
          'Urgencia + autoridad + miedo = manipulación: frena y verifica.',
          'El enlace real se ve al pasar el cursor, no en el texto.',
          'Nadie legítimo pide contraseñas ni códigos MFA.',
          'Ante clic accidental: cambiar credenciales ya y reportar.'
        ],
        example: '«Tu cuenta se cerrará en 24 h, valida aquí»: urgencia + enlace a un dominio que no es el oficial. Filtro: abrir la app oficial, nunca el enlace.',
        commonErrors: [
          'Fiar solo del nombre del remitente: se falsifica con un campo From.',
          'Abrir adjuntos de remitentes inesperados "por curiosidad".',
          'Pensar que solo los novatos caen: los spear phishing engañan a expertos.'
        ],
        summary: 'El eslabón humano se ataca con manipulación emocional; la defensa es procedimiento: verificar por otro canal, reportar y MFA.'
      },
      whyItMatters: 'La mayoría de brechas reales empiezan por un clic: es la superficie de ataque más explotada.',
      exercise: {
        prompt: 'Recibes un SMS de tu operador con un enlace por una "factura impagada". Enumera tus tres primeras acciones.',
        solution: 'No pulsar el enlace; verificar la situación en la app o teléfono oficial; reportar/bloquear y avisar si es un entorno de trabajo.'
      }
    },
    {
      id: 'r-seg-cifrado-wifi',
      title: 'Cifrado, hash y seguridad Wi-Fi',
      desc: 'Cifrado simétrico y asimétrico, hash con sal, TLS y la evolución WEP → WPA2 → WPA3.',
      category: 'Seguridad',
      level: 'Intermedio',
      added: '2025-04-07',
      minutes: 12,
      tags: ['cifrado', 'hash', 'wpa2', 'wpa3', 'wifi'],
      content: [
        'Cifrado simétrico: una misma clave cifra y descifra (AES). Rápido, pero el problema es repartir la clave de forma segura.',
        'Cifrado asimétrico: clave pública y privada (RSA, curvas elípticas). Resuelve el reparto de claves y firma digitalmente; es más lento que el simétrico.',
        'HTTPS combina ambos: el asimétrico autentica al servidor y acuerda una clave de sesión; el simétrico cifra la conversación (TLS). El certificado lo avala una CA.',
        'Un hash (SHA-256) es un resumen de longitud fija no reversible: sirve para verificar integridad. Para guardar contraseñas se usa con sal (valor aleatorio por usuario) y funciones lentas (bcrypt, argon2).',
        'WEP: roto desde hace años (clave de 40/104 bits crackeable en minutos). WPA-TKIP: transitorio, deprecado. WPA2-AES (CCMP): el estándar de una década. WPA3 (SAE): resistencia a diccionario y confidencialidad forward.',
        'WPA2/WPA3-Personal usa passphrase compartida; -Enterprise usa autenticación 802.1X con usuario individual: ideal en organizaciones.',
        'Redes públicas: el tráfico HTTPS viaja cifrado, pero se recomienda VPN para servicios sensibles; y desactivar compartir archivos en redes públicas.'
      ],
      lesson: {
        keyPoints: [
          'Simétrico rápido (AES), asimétrico para claves y firma (RSA).',
          'Hash = integridad; con sal y función lenta = contraseñas.',
          'WEP y WPA/TKIP están rotos: usa WPA2-AES o WPA3.',
          '802.1X (Enterprise) da usuario y contraseña propios a cada persona.'
        ],
        example: 'Una clave Wi-Fi compartida de 8 caracteres sin WPA3 cae a diccionario; con WPA3-SAE y frase larga, el ataque deja de ser viable.',
        commonErrors: [
          'Confundir cifrado (reversible con clave) con hash (no reversible).',
          'Mantener WEP "por compatibilidad" con un dispositivo antiguo.',
          'Guardar contraseñas con SHA-256 plano sin sal: vulnerable a tablas precalculadas.'
        ],
        summary: 'El cifrado protege datos en tránsito y reposo; el hash con sal protege contraseñas; y la red inalámbrica exige WPA2-AES o WPA3.'
      },
      whyItMatters: 'Elegir el cifrado correcto (y descartar el roto) es la diferencia entre una red defendible y una puerta abierta.',
      exercise: {
        prompt: 'Un router solo ofrece WEP y WPA. ¿Qué recomiendas y qué alternativa da al dispositivo antiguo?',
        solution: 'No usar WEP/WPA: activar WPA2-AES en otro SSID para el resto de dispositivos y separar o actualizar el equipo antiguo; nunca degradar la red entera.'
      }
    }
  ];

  /* ============================================================
     2. LECCIONES ENRIQUECIDAS PARA LOS RECURSOS EXISTENTES
     ============================================================ */

  const LESSON_UPGRADES = {
    'r-red-ipv4': {
      keyPoints: [
        '32 bits en cuatro octetos; cada octeto 0-255.',
        'La máscara separa red de host; el prefijo CIDR la resume (/24 = 255.255.255.0).',
        'Red y broadcast: primera y última dirección del bloque; no se asignan.',
        'Rangos privados: 10/8, 172.16/12 y 192.168/16; APIPA 169.254/16 indica fallo de DHCP.'
      ],
      example: '192.168.1.10/24 → red 192.168.1.0, broadcast 192.168.1.255, hosts de .1 a .254 (254 útiles).',
      commonErrors: [
        'Asignar a un equipo la dirección de red o la de broadcast.',
        'Confundir máscara con wildcard (255.255.255.0 frente a 0.0.0.255).',
        'Suponer 254 hosts siempre: en /31 y /32 la reserva cambia.'
      ],
      summary: 'Una IPv4 identifica a un host; máscara y prefijo deciden qué parte del número es red y qué parte es host.'
    },
    'r-red-subnetting': {
      keyPoints: [
        'Bits prestados del host crean subredes: cada bit duplica el número.',
        'Salto = 256 − octeto extendido de la máscara.',
        'Hosts útiles 2^h − 2 (excepciones /31 y /32).'
      ],
      example: 'De /24 a /26: dos bits prestados → 4 subredes de 62 hosts: .0, .64, .128, .192.',
      commonErrors: [
        'Contar 64 hosts en un /26: son 62 tras restar red y broadcast.',
        'Saltar el alineamiento: una /26 solo arranca en múltiplos de 64.',
        'Reusar la misma subred en dos VLAN no enrutadas.'
      ],
      summary: 'Subnetting es préstamo de bits: subredes más pequeñas y numerosas a cambio de hosts por subred.'
    },
    'r-red-osi': {
      keyPoints: [
        '7 capas: 1 física, 2 enlace, 3 red, 4 transporte, 5-6-7 sesión/presentación/aplicación.',
        'PDU: bits, tramas, paquetes, segmentos, datos.',
        'TCP/IP colapsa a 4: enlace, internet, transporte, aplicación.'
      ],
      example: 'HTTPS sobre TCP sobre IP sobre Ethernet: cada capa envuelve a la inferior con su cabecera.',
      commonErrors: [
        'Situar el switch en capa 3 (es capa 2) o el router en capa 2.',
        'Confundir segmento (L4) con paquete (L3).',
        'Mezclar número de capas OSI (7) y TCP/IP (4).'
      ],
      summary: 'OSI es el mapa mental para diagnosticar: localiza la capa rota y sabrás qué herramientas aplicar.'
    },
    'r-red-arp-dhcp': {
      keyPoints: [
        'ARP: IP → MAC solo en el segmento local; tabla con expiración.',
        'DHCP DORA: discover, offer, request, ack.',
        'APIPA 169.254.x.x = cliente sin DHCP.'
      ],
      example: 'arp -a muestra la caché; tras cambiar de red, entradas viejas provocan fallos hasta expirar.',
      commonErrors: [
        'Esperar que ARP cruce el router: solo resuelve en el segmento.',
        'Orden DORA incorrecto en preguntas de examen.',
        'No asociar 169.254 con fallo de lease DHCP.'
      ],
      summary: 'ARP resuelve el salto final (IP→MAC) y DHCP automatiza la configuración IP completa.'
    },
    'r-red-tcpip': {
      keyPoints: [
        'TCP: conexión (SYN/SYN-ACK/ACK), orden y retransmisión.',
        'UDP: datagramas sin garantía, menor latencia.',
        'Puertos 0-1023 conocidos; el socket es IP:puerto.'
      ],
      example: 'Una página abre varias conexiones TCP al 443; una consulta DNS va por UDP/53 y cae a TCP si la respuesta es grande.',
      commonErrors: [
        'Atribuir cifrado a TCP: eso es TLS.',
        'Usar TCP para streaming en vivo cuando UDP es más adecuado.',
        'Confundir puerto origen (efímero del cliente) con destino (servicio).'
      ],
      summary: 'Elegir TCP o UDP es elegir entre garantías y latencia; los puertos dirigen el tráfico al servicio correcto.'
    },
    'r-so-windows': {
      keyPoints: [
        'Windows 11 exige TPM 2.0 y UEFI con Secure Boot.',
        'USB de instalación con la herramienta oficial (8 GB+).',
        'UEFI → GPT automático; BIOS → MBR.',
        'Documenta clave de producto y cuenta antes de formatear.'
      ],
      example: 'El asistente crea EFI (100 MB), MSR y partición de sistema en disco GPT sin intervención.',
      commonErrors: [
        'Instalar en modo UEFI sobre disco MBR sin convertir.',
        'Formatear la partición EFI creyendo que es basura.',
        'Empezar sin copia de los datos del equipo origen.'
      ],
      summary: 'Una instalación limpia se prepara: requisitos, medio de instalación, particionado coherente y datos a salvo.'
    },
    'r-so-particiones': {
      keyPoints: [
        'MBR: 4 primarias, 2 TB máximo. GPT: más particiones y tamaño, tabla redundante.',
        'NTFS: permisos, journaling, >4 GB. FAT32: límite 4 GB. exFAT: compatible y sin límite práctico.',
        'ext4: estándar Linux con journaling.'
      ],
      example: 'Disco de 4 TB en PC con BIOS legacy: invisible más allá de 2 TB; necesitas GPT + UEFI.',
      commonErrors: [
        'FAT32 para ISOs o vídeos de más de 4 GB.',
        'Convertir MBR→GPT sin verificar soporte UEFI del equipo.',
        'Borrar la partición MSR o EFI pensando que sobran.'
      ],
      summary: 'Estilo de partición (arranque y límites) y sistema de archivos (permisos y tamaños) son decisiones independientes pero encadenadas.'
    },
    'r-so-procesos': {
      keyPoints: [
        'Proceso con interfaz o no; servicio sin sesión de usuario.',
        'services.msc gestiona tipo de arranque y estado.',
        'Administrador de tareas: consumo y arranque automático.'
      ],
      example: 'Un servicio parado que debería correr: services.msc → tipo Automático → Iniciar → revisar dependencias.',
      commonErrors: [
        'Finalizar svchost.exe confundiéndolo con malware: hospeda servicios del sistema.',
        'Deshabilitar servicios sin anotarlo: imposible revertir luego.',
        'Confundir msconfig (arranque) con services.msc (servicios).'
      ],
      summary: 'Procesos y servicios son las dos caras del software en ejecución; conocer sus herramientas evita daños.'
    },
    'r-so-linux-cli': {
      keyPoints: [
        'pwd, cd, ls: moverse; cp/mv/rm: gestionar.',
        'chmod cambia permisos, chown dueño; sudo eleva.',
        'apt update refresca índices; apt install instala.',
        'man y --help documentan todo.'
      ],
      example: 'chmod +x script.sh lo hace ejecutable; ./script.sh lo corre con la ruta relativa.',
      commonErrors: [
        'rm -rf con rutas absolutas mal escritas.',
        'Confundir apt update (índices) con apt upgrade (paquetes).',
        'Usar sudo para todo: rompe permisos de archivos de usuario.'
      ],
      summary: 'La terminal de Linux es consistente y autodocumentada: pocos comandos cubren el 90% del trabajo diario.'
    },
    'r-hw-componentes': {
      keyPoints: [
        'La placa fija socket, chipset y tipo de memoria.',
        'El chipset define puertos y líneas PCIe.',
        'PSU con margen y conectores adecuados.',
        'Desconectar y descargar estática antes de tocar.'
      ],
      example: 'CPU-Z confirma placa, BIOS y RAM instaladas antes de comprar la ampliación.',
      commonErrors: [
        'Comprar RAM sin mirar generación y ranuras pareadas.',
        'Tocar componentes con la fuente conectada aunque esté apagada.',
        'Olvidar los separadores al montar la placa.'
      ],
      summary: 'Todo montaje parte de la compatibilidad que define la placa base y de un procedimiento antiestático.'
    },
    'r-hw-ram': {
      keyPoints: [
        'DDR4 ≠ DDR5: muesca y voltaje distintos.',
        'Doble canal: módulos idénticos en ranuras pareadas.',
        'MemTest86 para validar estabilidad.'
      ],
      example: '2×8 GB en A2/B4 (manual) activa doble canal; en ranuras consecutivas puede quedar en single.',
      commonErrors: [
        'Mezclar frecuencias: ambas corren a la menor.',
        'Forzar un DDR3 en ranura DDR4 por presión.',
        'Diagnosticar fallos de RAM sin pasar MemTest.'
      ],
      summary: 'La RAM exige pareja de compatibilidad (generación) y estrategia (canales); la estabilidad se prueba, no se supone.'
    },
    'r-hw-discos': {
      keyPoints: [
        'HDD mecánico; SSD NAND sin partes móviles.',
        'SATA III 600 MB/s teóricos; NVMe multiplica vía PCIe.',
        'SMART anticipa fallos; TRIM mantiene el SSD.'
      ],
      example: 'CrystalDiskInfo con sectores reasignados crecientes = copia y sustitución planificada.',
      commonErrors: [
        'Confiar el único backup a un disco con SMART degradado.',
        'Comprar NVMe sin ranura M.2 compatible (PCIe vs SATA).',
        'Desactivar TRIM "para alargar" el SSD: es lo contrario.'
      ],
      summary: 'HDD y SSD cubren necesidades distintas; el SMART decide cuándo jubilar un disco antes de que decida por ti.'
    },
    'r-seg-contrasenas': {
      keyPoints: [
        'Longitud > complejidad; frases únicas por servicio.',
        'Gestor de contraseñas cifrado localmente.',
        'MFA añade factor posesión/biometría.'
      ],
      example: 'Frase de 4 palabras aleatorias (~40+ caracteres) resiste más que P@ssw0rd!2024.',
      commonErrors: [
        'Reutilizar contraseñas entre servicios.',
        'Guardarlas en texto plano o notas sin cifrar.',
        'Sustituciones predecibles (o→0) que los diccionarios ya conocen.'
      ],
      summary: 'Contraseñas largas y únicas, un gestor y MFA forman el mínimo defendible de autenticación.'
    },
    'r-seg-malware': {
      keyPoints: [
        'Ransomware cifra y pide rescate: el backup manda.',
        'Troyano = disfraz; spyware = espía; gusano se propaga solo.',
        'Ante infección: red fuera, analizar, limpiar o restaurar.'
      ],
      example: 'Un USB encontrado en el parking con un archivo .exe "informe.pdf.exe": troyano clásico por medio físico.',
      commonErrors: [
        'Pagar el rescate: financia y no garantiza recuperación.',
        'Abrir documentos infectados para "ver si sigue ahí".',
        'Confundir adware (publicidad) con spyware (espionaje).'
      ],
      summary: 'Cada familia de malware tiene un objetivo; la respuesta cambia (aislar, restaurar, reportar) pero el backup es la base común.'
    },
    'r-seg-backup': {
      keyPoints: [
        '3 copias, 2 soportes, 1 fuera del lugar.',
        'Automatizar y verificar restauraciones.',
        'Versionado contra borrados antiguos; cifrar lo que sale.'
      ],
      example: 'Restauración trimestral de un archivo aleatorio: si falla, el esquema 3-2-1 era una ilusión.',
      commonErrors: [
        'Copiar siempre encima: un cifrado por ransomware hereda.',
        'Dejar la copia externa siempre conectada.',
        'No probar nunca la restauración.'
      ],
      summary: 'El backup es un proceso verificado, no un disco comprado: 3-2-1, automatización y pruebas periódicas.'
    },
    'r-ofi-texto': {
      keyPoints: [
        'Estilos Título 1/2 generan índices automáticos.',
        'Saltos de página, nunca párrafos vacíos.',
        'Secciones para numeración y orientaciones distintas.'
      ],
      example: 'Cambiar el estilo Título 2 actualiza el índice y los numerados con un clic; a mano, serían 40 ediciones.',
      commonErrors: [
        'Pulsar Intro hasta cambiar de página.',
        'Aplicar negrita grande como "título" en vez de estilo.',
        'Ajustar márgenes con espacios y tabulaciones.'
      ],
      summary: 'Un documento profesional separa contenido y formato mediante estilos: se mantiene solo y se navega solo.'
    },
    'r-ofi-hoja': {
      keyPoints: [
        'Absoluta $A$1 fija; relativa A1 se desplaza al copiar.',
        'SUMA, PROMEDIO, SI, BUSCARV cubren lo básico.',
        'Gráfico según pregunta: tendencia (líneas), proporción (pastel), distribución (barras).'
      ],
      example: 'Fórmula =A2*$B$1 copiada hacia abajo recalcula A3, A4… manteniendo B1 fijo.',
      commonErrors: [
        'Olvidar el $ y arrastrar fórmulas con referencias que se mueven.',
        'Fusionar celdas de datos: rompe ordenaciones y filtros.',
        'Usar el pastel para series temporales largas.'
      ],
      summary: 'La hoja de cálculo es programación visual: referencias correctas y datos separados de la presentación.'
    },
    'r-ofi-presentaciones': {
      keyPoints: [
        'Una idea por diapositiva; guion antes de diseño.',
        'El patrón unifica tipografía y colores.',
        'PDF para imprimir o compartir sin edición.'
      ],
      example: '10 minutos → 8-10 diapositivas: portada, índice, 6-7 de contenido, cierre.',
      commonErrors: [
        'Leer literalmente la diapositiva.',
        'Fuentes menores de 20 pt en sala.',
        'Efectos de transición por cada objeto.'
      ],
      summary: 'La presentación apoya al orador: estructura clara, jerarquía visual y cero ruido.'
    },
    'r-virt-virtualbox': {
      keyPoints: [
        'Recursos razonables: deja margen al anfitrión.',
        'Snapshot antes de cada prueba destructiva.',
        'NAT para salir a internet; puente para ser visible en la LAN.'
      ],
      example: 'Probar un instalador dudoso: snapshot limpio → instalar → restaurar en 20 segundos.',
      commonErrors: [
        'Asignar toda la RAM del anfitrión a la VM.',
        'Confundir instantánea con copia completa de la máquina.',
        'Olvidar las Guest Additions: resolución y portapapeles mal.'
      ],
      summary: 'La VM es un laboratorio desechable: snapshots y modos de red correctos hacen seguro experimentar.'
    },
    'r-virt-conceptos': {
      keyPoints: [
        'Tipo 1 sobre hardware (ESXi, Hyper-V); tipo 2 sobre SO anfitrión (VirtualBox).',
        'Plantillas y clonación para desplegar rápido.',
        'Aislamiento ideal para prácticas seguras.'
      ],
      example: 'Clase de redes: cada alumno con dos VMs y una red interna reproduce un mini-router sin tocar el aula.',
      commonErrors: [
        'Llamar tipo 1 a VirtualBox por "ser profesional".',
        'Sobreasignar CPUs/RAM esperando que siempre sobre.',
        'Confundir snapshot con backup exportable.'
      ],
      summary: 'El hipervisor es la capa que divide hardware de sistemas; su tipo decide rendimiento y contexto de uso.'
    },
    'r-virt-redes': {
      keyPoints: [
        'Switches virtuales conectan VMs entre sí y con el exterior.',
        'NAT, puente, host-only e interna: cuatro aislamientos distintos.',
        'Documenta la topología antes de montar el laboratorio.'
      ],
      example: 'Router-VM con dos tarjetas (interna + puente) enruta para un laboratorio de 3 redes sin hardware extra.',
      commonErrors: [
        'Usar puente esperando aislamiento: expone en la red real.',
        'Red interna sin router: las VMs no salen ni entre subredes.',
        'Montar 5 VMs sin apuntar IPs: imposible depurar.'
      ],
      summary: 'Los modos de red virtual son el mapa del laboratorio: elegir mal el modo es elegir el fallo de antemano.'
    },
    'r-man-preventivo': {
      keyPoints: [
        'Polvo = obstrucción = calor = avería.',
        'Temperaturas en carga como indicador clave.',
        'SMART y espacio libre, revisados periódicamente.',
        'Documenta cada intervención.'
      ],
      example: 'Checklist mensual: polvo, temperaturas, SMART, espacio, actualizaciones, backup verificado.',
      commonErrors: [
        'Aspirar el interior con aspiradora doméstica (estática).',
        'Actualizar firmware sin copia previa.',
        'No registrar qué se hizo ni cuándo.'
      ],
      summary: 'El preventivo es calendario + checklist: barato, predecible y evita el correctivo urgente.'
    },
    'r-man-diagnostico': {
      keyPoints: [
        'Recoge síntomas y qué cambió antes de tocar.',
        'Hipótesis simple primero; un cambio cada vez.',
        'De lo general a lo específico; documenta todo.'
      ],
      example: 'No enciende: enchufe → fuente → botón → placa. Nunca empezar por el disco.',
      commonErrors: [
        'Cambiar tres cosas a la vez y no saber qué funcionó.',
        'Dar por bueno el cable de alimentación sin probarlo.',
        'No documentar la solución: repetir el diagnóstico en el siguiente.'
      ],
      summary: 'El método (preguntar, aislar, probar, documentar) convierte la avería en proceso, no en suerte.'
    },
    'r-man-drivers': {
      keyPoints: [
        'Solo del fabricante de placa o dispositivo.',
        'Sin motivo, no actualizar: estable > novedoso.',
        'Punto de restauración antes de GPU/chipset.',
        'Nunca cortar un flasheo de firmware.'
      ],
      example: 'Actualización de BIOS solo si corrige tu problema o prepara tu CPU nueva; con SAI y medio de recuperación a mano.',
      commonErrors: [
        'Drivers de sitios de terceros "actualizadores".',
        'Flashear BIOS durante una tormenta sin SAI.',
        'Acumular puntos de restauración como backup.'
      ],
      summary: 'Drivers y firmware se actualizan con criterio: motivo, origen fiable y salida de emergencia.'
    },
    'r-man-montaje': {
      keyPoints: [
        'CPU, disipador y RAM fuera de caja: más fácil.',
        'Separadores solo en agujeros de la placa.',
        'Cableado que no bloquee el flujo de aire.',
        'POST correcto antes de cerrar.'
      ],
      example: 'Tras el montaje: un pitido o pantalla de POST confirma arranque básico antes del cierre.',
      commonErrors: [
        'Separador en agujero sin anclaje: cortocircuito trasero.',
        'Olvidar el conector EPS de 8 pines de la CPU.',
        'Cerrar el chasis sin prueba de POST.'
      ],
      summary: 'Montar es orden y verificación: cada paso tiene su prueba y el POST valida el conjunto.'
    }
  };

  /* ============================================================
     3. GLOSARIO AMPLIADO
     ============================================================ */

  const NEW_TERMS = [
    { id: 'g-osi', term: 'Modelo OSI', category: 'Redes', definition: 'Modelo de referencia de siete capas (física, enlace, red, transporte, sesión, presentación y aplicación) que describe cómo viajan los datos y sirve de mapa para diagnosticar.' },
    { id: 'g-lan', term: 'LAN', category: 'Redes', definition: 'Red local de alcance de edificio. Alta velocidad, propiedad privada y sin operadores intermedios.' },
    { id: 'g-wan', term: 'WAN', category: 'Redes', definition: 'Red de área amplia que conecta LANs entre ciudades o países, normalmente mediante servicios de operadores.' },
    { id: 'g-utp', term: 'UTP', category: 'Redes', definition: 'Cable de pares trenzados sin apantallar, el medio local más común. Máximo 100 m por tramo; Cat6a soporta 10 Gbps.' },
    { id: 'g-fibra', term: 'Fibra óptica', category: 'Redes', definition: 'Medio que transmite luz. Inmune a interferencias electromagnéticas; multimodo para cortas distancias y monomodo para kilómetros.' },
    { id: 'g-csma', term: 'CSMA/CD', category: 'Redes', definition: 'Mecanismo de Ethernet con hub: escuchar antes de transmitir y detectar colisiones. Histórico desde el switch a nodo completo.' },
    { id: 'g-dominio-difusion', term: 'Dominio de difusión', category: 'Redes', definition: 'Área de red donde llega un broadcast. Lo separan routers y VLANs; los switches solo separan dominios de colisión.' },
    { id: 'g-trunk', term: 'Trunk', category: 'Redes', definition: 'Enlace entre switches que transporta varias VLANs etiquetadas con 802.1Q.' },
    { id: 'g-8021q', term: '802.1Q', category: 'Redes', definition: 'Estándar IEEE que añade a la trama Ethernet una etiqueta de 4 bytes con el identificador de VLAN (1-4094).' },
    { id: 'g-ipv6', term: 'IPv6', category: 'Redes', definition: 'Protocolo de dirección de 128 bits en notación hexadecimal con :: como compresión. Elimina la necesidad de NAT y el broadcast.' },
    { id: 'g-link-local', term: 'Dirección link-local', category: 'Redes', definition: 'Dirección fe80::/10 que toda interfaz IPv6 se autoasigna; válida solo en el enlace local, no enrutable.' },
    { id: 'g-slaac', term: 'SLAAC', category: 'Redes', definition: 'Autoconfiguración de direcciones IPv6 sin servidor: el equipo genera su dirección a partir del anuncio del router.' },
    { id: 'g-icmp', term: 'ICMP', category: 'Redes', definition: 'Protocolo de señalización de IP: eco (ping), destino inalcanzable, tiempo excedido. Herramienta de diagnóstico, no de datos.' },
    { id: 'g-pat', term: 'PAT', category: 'Redes', definition: 'Traducción de direcciones con puertos (NAT sobrecargado): varias IPs internas comparten una pública distinguiendo cada conexión por su puerto.' },
    { id: 'g-ruta-defecto', term: 'Ruta por defecto', category: 'Redes', definition: 'Ruta 0.0.0.0/0 que captura todo destino sin ruta más específica; la puerta habitual hacia internet.' },
    { id: 'g-socket', term: 'Socket', category: 'Redes', definition: 'Punto de comunicación definido por la pareja dirección IP y puerto (192.168.1.10:443). Identifica el extremo de una conexión.' },
    { id: 'g-registro-a', term: 'Registro A', category: 'Redes', definition: 'Registro DNS que asocia un nombre de dominio con una dirección IPv4; AAAA hace lo propio con IPv6.' },
    { id: 'g-tld', term: 'TLD', category: 'Redes', definition: 'Dominio de nivel superior de la jerarquía DNS (.es, .com, .org), gestionado por el registro correspondiente.' },
    { id: 'g-tracert', term: 'Traceroute', category: 'Redes', definition: 'Herramienta que revela el camino de routers hasta un destino incrementando el TTL; en Windows se llama tracert.' },
    { id: 'g-hilo', term: 'Hilo', category: 'Sistemas Operativos', definition: 'Unidad de ejecución dentro de un proceso que comparte su memoria. SMT ejecuta dos hilos por núcleo físico.' },
    { id: 'g-memoria-virtual', term: 'Memoria virtual', category: 'Sistemas Operativos', definition: 'Abstracción que da a cada proceso su propio espacio de direcciones y permite usar disco (swap) como ampliación de la RAM.' },
    { id: 'g-swap', term: 'Swap', category: 'Sistemas Operativos', definition: 'Espacio de disco donde el kernel guarda páginas poco usadas cuando falta RAM (pagefile.sys en Windows). Abusar de él provoca lentitud.' },
    { id: 'g-acl', term: 'ACL', category: 'Sistemas Operativos', definition: 'Lista de control de acceso: entradas por usuario y grupo con permisos concedidos o denegados sobre un recurso, con herencia.' },
    { id: 'g-shell', term: 'Shell', category: 'Sistemas Operativos', definition: 'Intérprete que traduce comandos al kernel: bash y zsh en Linux, CMD y PowerShell en Windows.' },
    { id: 'g-bootloader', term: 'Bootloader', category: 'Sistemas Operativos', definition: 'Programa que carga el kernel al arrancar: Windows Boot Manager o GRUB. Un bootloader roto impide el inicio aunque el disco esté bien.' },
    { id: 'g-winre', term: 'WinRE', category: 'Sistemas Operativos', definition: 'Entorno de recuperación de Windows: reparación de inicio, restauración, consola de comandos y opciones avanzadas.' },
    { id: 'g-punto-restauracion', term: 'Punto de restauración', category: 'Sistemas Operativos', definition: 'Instantánea del registro y archivos del sistema que permite deshacer cambios recientes sin tocar los documentos personales.' },
    { id: 'g-syslog', term: 'Syslog', category: 'Sistemas Operativos', definition: 'Estándar de envío de mensajes de registro, local o a un recolector central por UDP/TCP 514.' },
    { id: 'g-ipc', term: 'IPC', category: 'Hardware', definition: 'Instrucciones por ciclo: cuánto trabajo hace el procesador en cada ciclo de reloj. El IPC crece con cada arquitectura nueva.' },
    { id: 'g-smt', term: 'SMT', category: 'Hardware', definition: 'Multihilo simultáneo (Hyper-Threading en Intel): dos hilos por núcleo compartiendo recursos, con ganancia parcial de rendimiento.' },
    { id: 'g-vrm', term: 'VRM', category: 'Hardware', definition: 'Circuito de la placa que alimenta al procesador con tensión estable; su calidad condiciona overclocking y estabilidad.' },
    { id: 'g-vram', term: 'VRAM', category: 'Hardware', definition: 'Memoria dedicada de la tarjeta gráfica; su cantidad limita resoluciones, texturas y cálculos paralelos.' },
    { id: 'g-nvme', term: 'NVMe', category: 'Hardware', definition: 'Protocolo de almacenamiento sobre PCIe con colas paralelas: multiplican la velocidad frente a SATA.' },
    { id: 'g-m2', term: 'M.2', category: 'Hardware', definition: 'Formato de conectores pequeños para SSD; puede ser SATA o NVMe según el modelo y el soporte de la placa.' },
    { id: 'g-pcie', term: 'PCIe', category: 'Hardware', definition: 'Bus de expansión serie por líneas (lanes): GPU, NVMe y tarjetas compiten por el ancho de banda disponible.' },
    { id: 'g-80plus', term: '80 PLUS', category: 'Hardware', definition: 'Certificación de eficiencia de fuentes (Bronze a Titanium): más eficiencia significa menos calor, no más potencia.' },
    { id: 'g-aio', term: 'Refrigeración líquida (AIO)', category: 'Hardware', definition: 'Disipador de circuito cerrado con bomba y radiador: más capacidad térmica que aire en CPUs de alto TDP.' },
    { id: 'g-thermal-throttling', term: 'Thermal throttling', category: 'Hardware', definition: 'Reducción automática de frecuencia al superarse la temperatura de seguridad. Síntoma: rendimiento que cae tras minutos de carga.' },
    { id: 'g-gusano', term: 'Gusano', category: 'Seguridad', definition: 'Malware que se replica a sí mismo por la red sin intervención del usuario, a diferencia del virus que necesita huésped.' },
    { id: 'g-keylogger', term: 'Keylogger', category: 'Seguridad', definition: 'Malware o dispositivo que registra las pulsaciones de teclado para capturar credenciales. MFA mitiga su daño.' },
    { id: 'g-credential-stuffing', term: 'Credential stuffing', category: 'Seguridad', definition: 'Ataque que reutiliza pares usuario-contraseña filtrados de otros sitios, aprovechando que la gente repite contraseñas.' },
    { id: 'g-minimo-privilegio', term: 'Principio de mínimo privilegio', category: 'Seguridad', definition: 'Cada usuario y proceso debe operar solo con los permisos estrictamente necesarios; limita el daño de un compromiso.' },
    { id: 'g-hash', term: 'Hash', category: 'Seguridad', definition: 'Resumen criptográfico de longitud fija no reversible (SHA-256) usado para verificar integridad y guardar contraseñas con sal.' },
    { id: 'g-sal', term: 'Sal (criptografía)', category: 'Seguridad', definition: 'Valor aleatorio único que se añade a cada contraseña antes de aplicar el hash, inutilizando tablas precalculadas.' },
    { id: 'g-wpa3', term: 'WPA3', category: 'Seguridad', definition: 'Estándar de seguridad Wi-Fi con SAE: resistente a ataques de diccionario y confidencialidad forward, sucesor de WPA2.' },
    { id: 'g-spear-phishing', term: 'Spear phishing', category: 'Seguridad', definition: 'Phishing dirigido con datos reales de la víctima (nombre, cargo, proyectos): mucho más creíble que el masivo.' },
    { id: 'g-host-only', term: 'Red host-only', category: 'Virtualización', definition: 'Modo de red virtual que conecta las VMs solo con el anfitrión, sin salida exterior: ideal para entornos de prueba aislados.' },
    { id: 'g-pasta-termica', term: 'Pasta térmica', category: 'Mantenimiento', definition: 'Compuesto que llena las microimperfecciones entre CPU y disipador. Se seca con los años: renovarla cada 2-3 años baja temperaturas.' },
    { id: 'g-bsod', term: 'BSOD', category: 'Mantenimiento', definition: 'Pantalla azul de Windows: el kernel detiene el equipo ante un error grave. El código (por ejemplo MEMORY_MANAGEMENT) orienta el diagnóstico.' },
    { id: 'g-csv', term: 'CSV', category: 'Ofimática', definition: 'Formato de texto con valores separados por comas o punto y coma: universal para intercambiar tablas, sin formatos ni fórmulas.' },
    { id: 'g-ods', term: 'ODS', category: 'Ofimática', definition: 'Formato abierto de hoja de cálculo (OpenDocument) usado por LibreOffice, compatible con las suites principales.' }
  ];

  /* ============================================================
     4. CASOS PRÁCTICOS
     ============================================================ */

  const CASES = [
    {
      id: 'casa-wifi',
      title: 'Caso 1 · Red de una casa con teletrabajo',
      intro: 'Una familia tiene fibra 600 Mbps, un portátil de teletrabajo, 3 móviles, una smart TV y una consola. El router del operador llega justo al salón y hay habitaciones sin cobertura.',
      situation: [
        'La señal Wi-Fi no llega al despacho (2 paredes).',
        'El trabajo requiere videollamadas estables.',
        'La consola se usa para juegos en línea.'
      ],
      options: [
        { id: 'a', text: 'Aumentar la potencia del router del operador y colocar la consola por Wi-Fi', why: 'La potencia no atraviesa más paredes de forma fiable y el Wi-Fi de consola añade latencia; no resuelve el despacho.' },
        { id: 'b', text: 'Cable UTP Cat6 al despacho con un switch pequeño, un punto de acceso con SSID propio y la consola por cable', why: 'Correcto: cable para lo fijo (mayor velocidad y sin latencia), un AP donde la cobertura falla y SSIDs separados para invitados o IoT.' },
        { id: 'c', text: 'Un repetidor Wi-Fi barato a mitad de camino', why: 'Los repetidores a un salto pierden hasta la mitad del ancho de banda y añaden latencia; solo es opción si no hay posibilidad de cablear.' }
      ],
      correct: 'b',
      solution: 'Solución orientativa: cableado Cat6 (menos de 100 m) al despacho → switch de 5 puertos → AP en modo punto de acceso (no router para evitar doble NAT). Consola y PC de trabajo por cable; móviles y TV al Wi-Fi principal; invitados a una red separada.'
    },
    {
      id: 'oficina-20',
      title: 'Caso 2 · Oficina de 20 equipos',
      intro: 'Una oficina pequeña con 20 puestos, 2 impresoras de red, Wi-Fi para clientes y un NAS de copias. El presupuesto debe razonarse, no maximizarse.',
      situation: [
        '20 equipos cableados en dos estancias.',
        'Wi-Fi para clientes separado de la red interna.',
        'NAS con copias diarias.'
      ],
      options: [
        { id: 'a', text: 'Un switch de 24 puertos + VLANs (trabajo, invitados, NAS) + router con firewall, impresoras en la VLAN de trabajo', why: 'Correcto: un switch por tamaño, segmentación real con VLANs para aislar invitados y proteger el NAS, y reglas de acceso entre VLANs.' },
        { id: 'b', text: 'Varios switches de 8 puertos encadenados y todo en la misma red con el NAS accesible para todos', why: 'Funciona pero es frágil: cascada de switches, sin aislamiento de invitados y el NAS expuesto a cualquier equipo conectado.' },
        { id: 'c', text: 'Todo por Wi-Fi con un router doméstico potente', why: '20 equipos concurrentes saturen el aire y el router doméstico no da para VLANs ni para carga constante.' }
      ],
      correct: 'a',
      solution: 'Solución orientativa: switch gestionado de 24-32 puertos (con margen), VLAN 10 trabajo / VLAN 20 invitados / VLAN 30 servidores, router-firewall con PAT y reglas inter-VLAN mínimas (invitados solo a internet), impresoras con IP fija por DHCP reservado, NAS en la VLAN de servidores con backup 3-2-1.'
    },
    {
      id: 'aula-informatica',
      title: 'Caso 3 · Aula informática de 30 equipos',
      intro: 'Un instituto renueva un aula: 30 equipos de sobremesa, proyector, equipo del profesor y control del acceso a internet durante exámenes.',
      situation: [
        '30 equipos + equipo del profesor.',
        'Necesidad de cortar internet al alumnado puntualmente.',
        'El software de aula funciona por red.'
      ],
      options: [
        { id: 'a', text: 'Switch de 48 puertos, VLAN del aula, y regla de firewall que bloquea la salida de esa VLAN durante exámenes', why: 'Correcto: capacidad de puertos con margen, una VLAN propia permite políticas (bloqueo centralizado) sin tocar el aula físicamente.' },
        { id: 'b', text: 'Desenchufar el switch del aula cuando se quiera cortar internet', why: 'Corta también la red interna del software de aula y las impresoras; es una interrupción total sin control.' },
        { id: 'c', text: 'Instalar software de bloqueo en cada equipo del alumnado', why: 'Requiere mantenimiento en 30 equipos y se evade fácilmente; la política debe estar en la red, no en el cliente.' }
      ],
      correct: 'a',
      solution: 'Solución orientativa: switch 48 puertos (30+1+impresora+margen), VLAN del aula con DHCP propio, política central: durante examen se bloquea el NAT de esa VLAN (regla de horario), software de aula en la VLAN interna, equipo del profesor en VLAN de docentes con acceso permanente.'
    },
    {
      id: 'vm-laboratorio',
      title: 'Caso 4 · Laboratorio virtual de redes',
      intro: 'Quieres practicar subnetting y routing en casa con un portátil de 16 GB de RAM sin comprar hardware.',
      situation: [
        'Dos redes internas simuladas + una salida a internet.',
        'Un router virtual y dos clientes.',
        'Todo recuperable tras cada práctica.'
      ],
      options: [
        { id: 'a', text: 'Tres VMs: router-Linux con dos tarjetas (interna A + interna B) y una puente; dos clientes en las redes internas; snapshot inicial', why: 'Correcto: el router virtual enruta entre redes, el modo puente solo en la tarjeta de salida, y el snapshot permite restaurar el estado limpio.' },
        { id: 'b', text: 'Todas las VMs en modo puente con IPs de la red doméstica', why: 'Los clientes "ensucian" la red real, no hay aislamiento y las pruebas de subnetting chocan con las IPs del router doméstico.' },
        { id: 'c', text: 'Una única VM con tres tarjetas de red', why: 'No hay separación real: el routing y el aislamiento entre redes son el objetivo del laboratorio.' }
      ],
      correct: 'a',
      solution: 'Solución orientativa: VM1 router (Debian sin escritorio) con eth0 puente (salida), eth1 red-interna-A, eth2 red-interna-B, reenvío IP activado. VM2 y VM3 clientes en A y B con gateway hacia la IP del router en su red. Snapshot "limpio" antes de cada práctica y exportación del appliance al terminar.'
    },
    {
      id: 'pc-lento',
      title: 'Caso 5 · Diagnóstico de un equipo lento',
      intro: 'Un equipo de oficina va lento desde hace semanas. Arranca en 4 minutos y al abrir el navegador casi se bloquea. El usuario asegura que "tiene un virus".',
      situation: [
        'Arranque muy lento.',
        'Disco al 100% en el Administrador de tareas.',
        'Equipo de hace 6 años con HDD.'
      ],
      options: [
        { id: 'a', text: 'Formatear y reinstalar Windows de inmediato', why: 'Es la última opción, no la primera: se pierde el diagnóstico y puede que el problema (HDD mecánico + swap) vuelva al mes.' },
        { id: 'b', text: 'Medir primero: Administrador de tareas (quién consume), SMART del disco y memoria en uso; con esos datos decidir', why: 'Correcto: el diagnóstico manda. Un HDD viejo con swap activo da exactamente estos síntomas y la solución es un SSD, no un formateo.' },
        { id: 'c', text: 'Instalar tres antivirus y pasarlos uno tras otro', why: 'Añaden carga a un equipo ya saturado y no abordan la causa física más probable.' }
      ],
      correct: 'b',
      solution: 'Solución orientativa: Administrador de tareas → proceso con más disco/CPU; CrystalDiskInfo → SMART (sectores reasignados); RAM al límite → swap. Plan: clonar HDD a SSD (transforma el equipo), limpiar arranque automático, comprobar antivirus real ya instalado y solo reinstalar si persiste tras datos.'
    },
    {
      id: 'diseno-subredes',
      title: 'Caso 6 · Diseño de subredes para una PYME',
      intro: 'Una empresa en 192.168.0.0/24 necesita: administración (50 hosts), ventas (25), cámaras IP (10) y dos enlaces punto a punto. El tráfico de cámaras debe aislarse.',
      situation: [
        'Administración: 50 hosts.',
        'Ventas: 25 hosts.',
        'Cámaras: 10 hosts aisladas del resto.',
        'Dos enlaces router-router.'
      ],
      options: [
        { id: 'a', text: 'Todo en una /24 con máscaras /24 y el aislamiento por "confianza"', why: 'Sin segmentación real: cualquier equipo ve las cámaras y el broadcast afecta a todos.' },
        { id: 'b', text: 'VLSM: adm /26 (62), ventas /27 (30), cámaras /28 (14), enlaces /30, y una VLAN por área con ACLs hacia las cámaras', why: 'Correcto: tamaños justos, crecimiento razonable y aislamiento efectivo de las cámaras por VLAN + ACL.' },
        { id: 'c', text: 'Cuatro /25 del rango 192.168.0.0/23 aunque solo exista una /24 asignada', why: 'Excede el espacio disponible: 192.168.0.0/24 no contiene cuatro /25 (solo dos).' }
      ],
      correct: 'b',
      solution: 'Solución orientativa: adm 192.168.0.0/26 (.1-.62), ventas 192.168.0.64/27 (.65-.94), cámaras 192.168.0.96/28 (.97-.110), enlace1 192.168.0.112/30 (.113-.114), enlace2 192.168.0.116/30 (.117-.118). VLAN por área y reglas: cámaras solo accesibles desde el servidor de vídeo.'
    }
  ];

  /* ============================================================
     5. RUTAS DE APRENDIZAJE ("¿Qué estudiar después?")
     ============================================================ */

  const LEARNING_PATHS = [
    {
      id: 'ruta-direccionamiento',
      title: 'Del IP al routing',
      category: 'Redes',
      desc: 'El camino clásico del direccionamiento: sin máscaras no hay subnetting, y sin subnetting no hay diseño de redes.',
      steps: ['r-red-ipv4', 'r-red-subnet-intermedio', 'r-red-subnetting', 'r-red-vlsm-avanzado', 'r-red-nat-routing']
    },
    {
      id: 'ruta-servicios',
      title: 'Servicios de red',
      category: 'Redes',
      desc: 'Cómo obtiene cada equipo su configuración, nombres y diagnosticamos fallos.',
      steps: ['r-red-arp-dhcp', 'r-red-servicios-dns', 'r-red-icmp-diagnostico']
    },
    {
      id: 'ruta-sistemas',
      title: 'Del arranque a la administración',
      category: 'Sistemas Operativos',
      desc: 'Qué pasa al encender, cómo se organizan procesos y permisos y cómo se administra por consola.',
      steps: ['r-so-arranque', 'r-so-particiones', 'r-so-memoria', 'r-so-fs-permisos', 'r-so-powershell-bash', 'r-so-logs-recuperacion']
    },
    {
      id: 'ruta-seguridad',
      title: 'Seguridad progresiva',
      category: 'Seguridad',
      desc: 'De la cuenta personal a la red: autenticación, amenazas y cifrado.',
      steps: ['r-seg-contrasenas', 'r-seg-ingenieria-social', 'r-seg-malware', 'r-seg-cifrado-wifi', 'r-seg-backup']
    }
  ];

  /* ============================================================
     FUSIÓN SOBRE SMR_DATA (tolerante y sin duplicados)
     ============================================================ */

  const problems = [];

  function apply() {
    /* Recursos nuevos: solo si su id no existe ya */
    const known = new Set((D.resources || []).map((r) => r.id));
    (NEW_RESOURCES || []).forEach((r) => {
      if (known.has(r.id)) return;
      if (!r.id || !r.title || !r.category || !Array.isArray(r.content)) {
        problems.push('recurso incompleto: ' + (r.id || '(sin id)'));
        return;
      }
      D.resources.push(r);
      known.add(r.id);
    });

    /* Lecciones enriquecidas: completan lo que falte, no pisan */
    (D.resources || []).forEach((r) => {
      const up = LESSON_UPGRADES[r.id];
      if (!up) return;
      const lesson = r.lesson || (r.lesson = {});
      if (!Array.isArray(lesson.keyPoints) || !lesson.keyPoints.length) lesson.keyPoints = up.keyPoints || lesson.keyPoints;
      if (!lesson.example) lesson.example = up.example;
      if (!Array.isArray(lesson.commonErrors) || !lesson.commonErrors.length) lesson.commonErrors = up.commonErrors;
      if (!lesson.summary) lesson.summary = up.summary;
    });

    /* Glosario */
    const terms = new Set((D.glossary || []).map((t) => String(t.term).toLowerCase()));
    (NEW_TERMS || []).forEach((t) => {
      if (terms.has(String(t.term).toLowerCase())) return;
      if (!t.id || !t.term || !t.definition) {
        problems.push('término incompleto: ' + (t.id || '(sin id)'));
        return;
      }
      D.glossary.push(t);
      terms.add(String(t.term).toLowerCase());
    });

    /* Casos y rutas: se publican en SMR_DATA para app.js y tests.js */
    D.cases = (D.cases || []).concat(CASES || []);
    D.learningPaths = (D.learningPaths || []).concat(LEARNING_PATHS || []);

    /* Comprobaciones de integridad referencial (aviso en consola si algo falla) */
    const resIds = new Set((D.resources || []).map((r) => r.id));
    (D.learningPaths || []).forEach((p) => {
      (p.steps || []).forEach((id) => { if (!resIds.has(id)) problems.push('ruta ' + p.id + ' → recurso inexistente: ' + id); });
    });
    (D.resources || []).forEach((r) => {
      if (r.relatedResources) r.relatedResources.forEach((id) => { if (!resIds.has(id)) problems.push('recurso ' + r.id + ' relacionado inexistente: ' + id); });
    });

    if (problems.length && window.console) {
      window.console.warn('[SMR content] ' + problems.length + ' aviso(s) de integridad:', problems);
    }
  }

  apply();
})();

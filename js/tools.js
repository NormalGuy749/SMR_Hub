'use strict';

/* SMR Hub — herramientas
   Calculadora de subredes (con explicación paso a paso), tabla de subredes,
   reparto VLSM, conversor numérico, conversor de unidades, generador de
   contraseñas y tabla de puertos. Se conecta a la ruta #/herramientas desde app.js. */

window.SMR_TOOLS = (function () {

  const esc = (v) => window.SMR.esc(v);
  const icon = (name, size = 16) => window.SMR.icon(name, size);

  /* ---------- Utilidades IPv4 ---------- */

  function parseIPv4(value) {
    const parts = String(value).trim().split('.');
    if (parts.length !== 4) return null;
    let ip = 0;
    for (const part of parts) {
      if (!/^\d{1,3}$/.test(part)) return null;
      const n = Number(part);
      if (n > 255) return null;
      ip = ((ip << 8) | n) >>> 0;
    }
    return ip;
  }

  const ipToString = (ip) => [24, 16, 8, 0].map((s) => (ip >>> s) & 255).join('.');

  const ipToBinary = (ip) =>
    [24, 16, 8, 0].map((s) => ((ip >>> s) & 255).toString(2).padStart(8, '0')).join('.');

  const maskOf = (p) => (p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0);

  function isPrivateOrReserved(ip) {
    const o1 = ip >>> 24;
    const o2 = (ip >>> 16) & 255;
    if (o1 === 127) return 'Reservada (loopback)';
    if (o1 === 10) return 'Privada';
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return 'Privada';
    if (o1 === 192 && o2 === 168) return 'Privada';
    if (o1 === 169 && o2 === 254) return 'Reservada (APIPA)';
    return 'Pública';
  }

  function classOf(ip) {
    const o1 = ip >>> 24;
    if (o1 === 127) return 'A (loopback)';
    if (o1 < 128) return 'A';
    if (o1 < 192) return 'B';
    if (o1 < 224) return 'C';
    if (o1 < 240) return 'D (multicast)';
    return 'E (experimental)';
  }

  /* ---------- Calculadora de subredes ---------- */

  function buildSubnet() {
    const section = document.createElement('section');
    section.className = 'tool';
    section.id = 'tool-subredes';
    section.innerHTML = `
      <h3 class="tool-title">${icon('calculator', 18)} Calculadora de subredes</h3>
      <p class="tool-desc">Red, broadcast, rango de hosts y máscara a partir de una IPv4 y su prefijo CIDR.</p>
      <div class="field-row">
        <label class="field">
          <span class="field-label">Dirección IP</span>
          <input type="text" class="input mono" id="sub-ip" value="192.168.1.10"
                 inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Dirección IP">
        </label>
        <label class="field">
          <span class="field-label">Prefijo CIDR (0-32)</span>
          <input type="number" class="input mono" id="sub-prefix" value="24"
                 min="0" max="32" inputmode="numeric" aria-label="Prefijo CIDR">
        </label>
      </div>
      <p class="form-error" id="sub-error" hidden>Introduce una IPv4 válida (0-255 en cada octeto) y un prefijo entre 0 y 32.</p>
      <div class="result-grid" id="sub-results"></div>
      <div class="expander">
        <button type="button" class="expander-btn" id="sub-steps-btn"
                aria-expanded="false" aria-controls="sub-steps">${icon('chevronRight', 14)} ¿Cómo se ha calculado?</button>
        <div class="calc-steps" id="sub-steps" hidden></div>
      </div>`;

    const ipInput = section.querySelector('#sub-ip');
    const prefixInput = section.querySelector('#sub-prefix');
    const results = section.querySelector('#sub-results');
    const errorEl = section.querySelector('#sub-error');
    const stepsEl = section.querySelector('#sub-steps');
    const stepsBtn = section.querySelector('#sub-steps-btn');

    stepsBtn.addEventListener('click', () => {
      const open = stepsBtn.getAttribute('aria-expanded') === 'true';
      stepsBtn.setAttribute('aria-expanded', String(!open));
      stepsBtn.classList.toggle('open', !open);
      stepsEl.hidden = open;
    });

    /* Explicación educativa: cada paso con los valores actuales */
    function updateSteps(ip, p, mask, wild, net, bcast) {
      const octets = [mask >>> 24, (mask >>> 16) & 255, (mask >>> 8) & 255, mask & 255];
      const jump = p === 0 ? 256 : 256 - octets[Math.min(3, Math.floor(p / 8))];
      const hostsText = p <= 30
        ? `es decir 2^${32 - p} − 2 = ${(2 ** (32 - p) - 2).toLocaleString('es')}.`
        : (p === 31 ? 'en /31 no se reserva nada adicional (RFC 3021): caben los 2.' : 'en /32 hay un único host.');
      stepsEl.innerHTML = `
        <ol class="steps-list">
          <li><strong>Máscara a partir del prefijo:</strong> los primeros ${p} bits a 1
            → <code class="mono">${ipToString(mask)}</code> (wildcard: <code class="mono">${ipToString(wild)}</code>).</li>
          <li><strong>AND binario entre la IP y la máscara</strong> — los 1 de la máscara conservan la parte de red y los 0 ponen a cero la parte de host:
            <code class="mono">${ipToBinary(ip)}</code> AND <code class="mono">${ipToBinary(mask)}</code>
            → red <code class="mono">${ipToString(net)}</code>.</li>
          <li><strong>Broadcast:</strong> se encienden todos los bits de host (red OR wildcard)
            → <code class="mono">${ipToString(bcast)}</code>.</li>
          <li><strong>Salto entre subredes:</strong> 256 − ${octets[Math.min(3, Math.floor(p / 8))]} = ${jump} direcciones por bloque.</li>
          <li><strong>Hosts asignables:</strong> todas las direcciones entre la red y el broadcast, ${hostsText}</li>
        </ol>`;
    }

    function compute() {
      const ip = parseIPv4(ipInput.value);
      const prefixNum = Number(prefixInput.value);
      const valid = ip !== null && Number.isInteger(prefixNum) && prefixNum >= 0 && prefixNum <= 32;
      errorEl.hidden = valid;
      if (!valid) {
        results.innerHTML = '';
        stepsEl.innerHTML = '';
        return;
      }
      const p = Math.floor(prefixNum);
      const mask = maskOf(p);
      const wild = (~mask) >>> 0;
      const net = (ip & mask) >>> 0;
      const bcast = (net | wild) >>> 0;
      let hosts, firstHost, lastHost;
      if (p <= 30) {
        hosts = (2 ** (32 - p) - 2).toLocaleString('es');
        firstHost = ipToString(net + 1);
        lastHost = ipToString(bcast - 1);
      } else if (p === 31) {
        hosts = '2 (enlace punto a punto)';
        firstHost = ipToString(net);
        lastHost = ipToString(bcast);
      } else {
        hosts = '1 (host único)';
        firstHost = ipToString(net);
        lastHost = ipToString(net);
      }

      updateSteps(ip, p, mask, wild, net, bcast);

      const rows = [
        ['Dirección de red', ipToString(net), true],
        ['Broadcast', ipToString(bcast), true],
        ['Máscara', ipToString(mask)],
        ['Wildcard', ipToString(wild)],
        ['Primer host', firstHost],
        ['Último host', lastHost],
        ['Hosts útiles', hosts],
        ['Red en binario', ipToBinary(net)],
        ['Clase', classOf(ip)],
        ['Ámbito', isPrivateOrReserved(ip)]
      ];
      results.innerHTML = rows.map(([key, value, hl]) => `
        <div class="kv${hl ? ' kv-hl' : ''}">
          <span class="kv-key">${esc(key)}</span>
          <span class="kv-value mono">${esc(value)}</span>
        </div>`).join('');
    }

    ipInput.addEventListener('input', compute);
    prefixInput.addEventListener('input', compute);
    compute();
    return section;
  }

  /* ---------- Tabla de subredes ---------- */

  function buildSubnetTable() {
    const section = document.createElement('section');
    section.className = 'tool';
    section.id = 'tool-tabla-subredes';
    section.innerHTML = `
      <h3 class="tool-title">${icon('layers', 18)} Tabla de subredes</h3>
      <p class="tool-desc">Divide una red en subredes iguales y muestra el rango útil de cada una.</p>
      <div class="field-row">
        <label class="field"><span class="field-label">Red base</span>
          <input type="text" class="input mono" id="st-net" value="192.168.1.0"
                 inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Red base"></label>
        <label class="field"><span class="field-label">Prefijo actual</span>
          <input type="number" class="input mono" id="st-prefix" value="24" min="0" max="32"
                 inputmode="numeric" aria-label="Prefijo actual"></label>
        <label class="field"><span class="field-label">Nuevo prefijo</span>
          <input type="number" class="input mono" id="st-newprefix" value="26" min="0" max="32"
                 inputmode="numeric" aria-label="Nuevo prefijo"></label>
      </div>
      <p class="form-error" id="st-error" hidden></p>
      <p class="count-note" id="st-count"></p>
      <div class="table-wrap">
        <table class="port-table">
          <thead>
            <tr><th scope="col">#</th><th scope="col">Red</th><th scope="col">Primer host</th>
            <th scope="col">Último host</th><th scope="col">Broadcast</th><th scope="col">Hosts</th></tr>
          </thead>
          <tbody id="st-body"></tbody>
        </table>
      </div>`;

    const netInput = section.querySelector('#st-net');
    const prefixInput = section.querySelector('#st-prefix');
    const newPrefixInput = section.querySelector('#st-newprefix');
    const errorEl = section.querySelector('#st-error');
    const countEl = section.querySelector('#st-count');
    const body = section.querySelector('#st-body');
    const LIMIT = 40;

    function compute() {
      const ip = parseIPv4(netInput.value);
      const p = Number(prefixInput.value);
      const np = Number(newPrefixInput.value);
      let error = '';
      if (ip === null) error = 'Introduce una IPv4 válida como red base (0-255 en cada octeto).';
      else if (!Number.isInteger(p) || p < 0 || p > 32) error = 'El prefijo actual debe estar entre 0 y 32.';
      else if (!Number.isInteger(np) || np < 0 || np > 32) error = 'El nuevo prefijo debe estar entre 0 y 32.';
      else if (np < p) error = 'El nuevo prefijo no puede ser menor que el actual.';

      errorEl.textContent = error;
      errorEl.hidden = !error;
      if (error) { body.innerHTML = ''; countEl.textContent = ''; return; }

      const baseMask = maskOf(p);
      const baseNet = (ip & baseMask) >>> 0;
      const realTotal = 2 ** (np - p);
      const size = 2 ** (32 - np);
      const shown = Math.min(realTotal, LIMIT);
      const hostsLabel = np <= 30
        ? String(2 ** (32 - np) - 2)
        : (np === 31 ? '2 (p2p)' : '1');

      const rows = [];
      for (let i = 0; i < shown; i++) {
        const net = (baseNet + i * size) >>> 0;
        const bcast = (net + size - 1) >>> 0;
        let first;
        let last;
        if (np <= 30) { first = ipToString(net + 1); last = ipToString(bcast - 1); }
        else if (np === 31) { first = ipToString(net); last = ipToString(bcast); }
        else { first = ipToString(net); last = ipToString(net); }
        rows.push(`<tr>
          <td class="mono">${i + 1}</td>
          <td class="mono">${ipToString(net)}/${np}</td>
          <td class="mono">${first}</td>
          <td class="mono">${last}</td>
          <td class="mono">${ipToString(bcast)}</td>
          <td class="mono">${hostsLabel}</td>
        </tr>`);
      }
      body.innerHTML = rows.join('');
      countEl.textContent = realTotal > LIMIT
        ? `Mostrando las primeras ${LIMIT} de ${realTotal.toLocaleString('es')} subredes.`
        : `${realTotal.toLocaleString('es')} ${realTotal === 1 ? 'subred' : 'subredes'} de ${size.toLocaleString('es')} direcciones cada una.`;
    }

    netInput.addEventListener('input', compute);
    prefixInput.addEventListener('input', compute);
    newPrefixInput.addEventListener('input', compute);
    compute();
    return section;
  }

  /* ---------- Reparto VLSM ---------- */

  function buildVlsm() {
    const section = document.createElement('section');
    section.className = 'tool';
    section.id = 'tool-vlsm';
    section.innerHTML = `
      <h3 class="tool-title">${icon('target', 18)} Reparto VLSM</h3>
      <p class="tool-desc">Reparte una red base en subredes del tamaño justo para los hosts que necesitas en cada una.</p>
      <div class="field-row">
        <label class="field"><span class="field-label">Red base (con prefijo)</span>
          <input type="text" class="input mono" id="vlsm-net" value="192.168.1.0/24"
                 inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Red base con su prefijo"></label>
        <label class="field vlsm-needs-field"><span class="field-label">Necesidades — una por línea: nombre: hosts</span>
          <textarea class="input mono" id="vlsm-needs" rows="5" spellcheck="false"
                    aria-label="Necesidades de hosts, una por línea">aula: 60
secretaría: 20
dirección: 6
enlace: 2</textarea></label>
      </div>
      <p class="form-error" id="vlsm-error" hidden></p>
      <p class="count-note" id="vlsm-count"></p>
      <div class="table-wrap">
        <table class="port-table">
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Nombre</th><th scope="col">Red</th><th scope="col">Máscara</th>
              <th scope="col">Rango útil</th><th scope="col">Broadcast</th><th scope="col">Hosts</th>
            </tr>
          </thead>
          <tbody id="vlsm-body"></tbody>
        </table>
      </div>
      <p class="hint-inline">Orden: la subred con más hosts se coloca primero; cada bloque arranca en la siguiente dirección alineada tras el broadcast del anterior.</p>`;

    const netInput = section.querySelector('#vlsm-net');
    const needsInput = section.querySelector('#vlsm-needs');
    const errorEl = section.querySelector('#vlsm-error');
    const countEl = section.querySelector('#vlsm-count');
    const body = section.querySelector('#vlsm-body');
    const LIMIT = 50;

    /* Prefijo mínimo (convención clásica: reserva red y broadcast) cuyo bloque cubre h hosts */
    function prefixForHosts(h) {
      if (h <= 1) return 32;
      for (let p = 30; p >= 0; p--) {
        if (2 ** (32 - p) - 2 >= h) return p;
      }
      return 0;
    }

    function compute() {
      const rawNet = netInput.value.trim();
      const m = rawNet.match(/^(\S+)\/(\d{1,2})$/);
      const ip = m ? parseIPv4(m[1]) : null;
      const baseP = m ? Number(m[2]) : NaN;
      let error = '';
      let rows = [];

      if (!m) {
        error = 'Formato: red con prefijo, por ejemplo 192.168.1.0/24.';
      } else if (ip === null) {
        error = 'La red base no es una IPv4 válida (0-255 en cada octeto).';
      } else if (!Number.isInteger(baseP) || baseP < 0 || baseP > 32) {
        error = 'El prefijo debe estar entre 0 y 32.';
      } else {
        const needs = needsInput.value.split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const mm = line.match(/^(.+?)[:=]\s*(\d{1,9})$/);
            if (!mm) return { line, name: null, hosts: 0, bad: true };
            const hosts = Number(mm[2]);
            return { line, name: (mm[1].trim() || 'Subred').slice(0, 40), hosts, bad: hosts < 1 || hosts > 2147483647 };
          });

        const bad = needs.find((n) => n.bad);
        if (!needs.length) {
          error = 'Añade al menos una línea con el formato nombre: hosts.';
        } else if (bad) {
          error = `La línea «${bad.line.slice(0, 30)}» no sigue el formato nombre: hosts.`;
        } else {
          const baseNet = (ip & maskOf(baseP)) >>> 0;
          const baseEnd = (baseNet + 2 ** (32 - baseP) - 1) >>> 0;

          let cursor = baseNet;
          let overflow = false;
          needs.slice().sort((a, b) => b.hosts - a.hosts).forEach((n) => {
            if (overflow) return;
            const p = prefixForHosts(n.hosts);
            const size = 2 ** (32 - p);
            let net = cursor;
            if (net % size !== 0) net = net + (size - (net % size));
            if (net + size - 1 > baseEnd) { overflow = true; return; }
            rows.push({
              name: n.name,
              net,
              p,
              mask: ipToString(maskOf(p)),
              first: p <= 30 ? net + 1 : net,
              last: p <= 30 ? net + size - 2 : net + size - 1,
              bcast: net + size - 1,
              hosts: n.hosts,
              cap: p <= 30 ? 2 ** (32 - p) - 2 : (p === 31 ? 2 : 1)
            });
            cursor = (net + size) >>> 0;
          });
          if (overflow) error = 'El reparto no cabe en la red base: reduce necesidades o usa una red mayor.';
        }
      }

      errorEl.textContent = error;
      errorEl.hidden = !error;
      if (error || !rows.length) {
        body.innerHTML = '';
        countEl.textContent = error ? '' : 'Añade necesidades para calcular el reparto.';
        return;
      }

      countEl.textContent = `${rows.length} ${rows.length === 1 ? 'subred asignada' : 'subredes asignadas'} · ordenadas de mayor a menor necesidad.`;
      body.innerHTML = rows.slice(0, LIMIT).map((r, i) => `
        <tr>
          <td class="mono">${i + 1}</td>
          <td>${esc(r.name)}</td>
          <td class="mono">${ipToString(r.net)}/${r.p}</td>
          <td class="mono">${esc(r.mask)}</td>
          <td class="mono">${esc(ipToString(r.first))} − ${esc(ipToString(r.last))}</td>
          <td class="mono">${esc(ipToString(r.bcast))}</td>
          <td class="mono">${r.hosts} pedidos · cap. ${r.cap.toLocaleString('es')}</td>
        </tr>`).join('');
    }

    netInput.addEventListener('input', compute);
    needsInput.addEventListener('input', compute);
    compute();
    return section;
  }

  /* ---------- Conversor numérico ---------- */

  function buildConverter() {
    const section = document.createElement('section');
    section.className = 'tool';
    section.id = 'tool-conversor';
    section.innerHTML = `
      <h3 class="tool-title">${icon('repeat', 18)} Conversor numérico</h3>
      <p class="tool-desc">Convierte en vivo entre decimal, binario, hexadecimal y octal.</p>
      <div class="field-row">
        <label class="field"><span class="field-label">Decimal</span>
          <input type="text" class="input mono" data-radix="10" inputmode="numeric" spellcheck="false" autocomplete="off"></label>
        <label class="field"><span class="field-label">Binario</span>
          <input type="text" class="input mono" data-radix="2" inputmode="numeric" spellcheck="false" autocomplete="off"></label>
        <label class="field"><span class="field-label">Hexadecimal</span>
          <input type="text" class="input mono" data-radix="16" spellcheck="false" autocomplete="off"></label>
        <label class="field"><span class="field-label">Octal</span>
          <input type="text" class="input mono" data-radix="8" inputmode="numeric" spellcheck="false" autocomplete="off"></label>
      </div>`;

    const inputs = [...section.querySelectorAll('input')];
    const patterns = {
      2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i
    };

    inputs.forEach((input) => {
      input.addEventListener('input', () => {
        const radix = Number(input.dataset.radix);
        const raw = input.value.trim().replace(/[\s_]/g, '');
        inputs.forEach((i) => i.classList.remove('invalid'));

        if (!raw) {
          inputs.forEach((i) => { if (i !== input) i.value = ''; });
          return;
        }
        if (!patterns[radix].test(raw)) {
          input.classList.add('invalid');
          return;
        }
        const n = parseInt(raw, radix);
        if (!Number.isSafeInteger(n) || n < 0) {
          input.classList.add('invalid');
          return;
        }
        inputs.forEach((other) => {
          if (other === input) return;
          other.value = n.toString(Number(other.dataset.radix));
        });
      });
    });

    return section;
  }

  /* ---------- Generador de contraseñas ---------- */

  const CHARSETS = {
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ',
    nums: '0123456789',
    syms: '!@#$%&*+-_?='
  };

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function randomInts(count) {
    const buf = new Uint32Array(count);
    crypto.getRandomValues(buf);
    return buf;
  }

  /* Caracteres que se confunden entre sí al leerlos */
  const AMBIGUOUS = /[Il1O0o]/g;

  /* Garantiza al menos un carácter de cada conjunto activo y mezcla el resto */
  function generatePassword(len, pools, all) {
    const ints = randomInts(len + pools.length + 8);
    const chars = [];
    pools.forEach((pool, i) => chars.push(pool[ints[i] % pool.length]));
    for (let i = pools.length; i < len; i++) {
      chars.push(all[ints[(i + 3) % ints.length] % all.length]);
    }
    for (let i = chars.length - 1; i > 0; i--) {
      const j = ints[(i * 7 + 5) % ints.length] % (i + 1);
      const tmp = chars[i];
      chars[i] = chars[j];
      chars[j] = tmp;
    }
    return chars.slice(0, len).join('');
  }

  function strengthInfo(len, poolSize) {
    const bits = Math.round(len * Math.log2(poolSize));
    let label = 'Muy fuerte';
    let cls = 'ok';
    if (bits < 40) { label = 'Muy débil'; cls = 'bad'; }
    else if (bits < 60) { label = 'Débil'; cls = 'bad'; }
    else if (bits < 80) { label = 'Media'; cls = 'mid'; }
    else if (bits < 100) { label = 'Fuerte'; cls = 'ok'; }
    return { bits, label, cls };
  }

  function buildPassword() {
    const section = document.createElement('section');
    section.className = 'tool';
    section.id = 'tool-contrasenas';
    section.innerHTML = `
      <h3 class="tool-title">${icon('star', 18)} Generador de contraseñas</h3>
      <p class="tool-desc">Contraseñas aleatorias generadas en tu navegador; nada se envía a ningún servidor.</p>
      <div class="pass-row">
        <input type="text" class="input mono" id="pass-out" readonly aria-label="Contraseña generada">
        <button type="button" class="btn" id="pass-copy">Copiar</button>
      </div>
      <p class="strength" id="pass-strength" aria-live="polite"></p>
      <div class="range-row">
        <span class="field-label">Longitud</span>
        <input type="range" id="pass-length" min="8" max="64" value="16" aria-label="Longitud de la contraseña">
        <span class="range-value mono" id="pass-length-label">16</span>
      </div>
      <div class="check-row">
        <label class="check"><input type="checkbox" data-set="lower" checked> Minúsculas</label>
        <label class="check"><input type="checkbox" data-set="upper" checked> Mayúsculas</label>
        <label class="check"><input type="checkbox" data-set="nums" checked> Números</label>
        <label class="check"><input type="checkbox" data-set="syms" checked> Símbolos</label>
        <label class="check"><input type="checkbox" id="pass-noamb"> Excluir caracteres ambiguos <span class="hint-inline">(I l 1 O 0 o)</span></label>
      </div>
      <div class="quiz-actions">
        <button type="button" class="btn" id="pass-gen">Generar otra</button>
      </div>`;

    const out = section.querySelector('#pass-out');
    const length = section.querySelector('#pass-length');
    const lengthLabel = section.querySelector('#pass-length-label');
    const strengthEl = section.querySelector('#pass-strength');
    const genBtn = section.querySelector('#pass-gen');
    const copyBtn = section.querySelector('#pass-copy');

    const noAmb = section.querySelector('#pass-noamb');

    function generate() {
      const chosen = [...section.querySelectorAll('[data-set]:checked')].map((c) => c.dataset.set);
      const active = chosen.length ? chosen : ['lower'];
      const pools = active
        .map((key) => (noAmb.checked ? CHARSETS[key].replace(AMBIGUOUS, '') : CHARSETS[key]))
        .filter((p) => p.length);
      const usable = pools.length ? pools : ['abcdefghijklmnopqrstuvwxyz'];
      const all = usable.join('');
      const len = Number(length.value);
      lengthLabel.textContent = String(len);
      out.value = generatePassword(len, usable, all);
      const { bits, label, cls } = strengthInfo(len, all.length);
      strengthEl.textContent = `Fortaleza: ${label} (≈${bits} bits de entropía)`;
      strengthEl.className = `strength ${cls}`;
    }

    copyBtn.addEventListener('click', async () => {
      if (!out.value) return;
      const ok = await copyText(out.value);
      copyBtn.textContent = ok ? '¡Copiada!' : 'No se pudo copiar';
      window.setTimeout(() => { copyBtn.textContent = 'Copiar'; }, 1200);
    });

    length.addEventListener('input', generate);
    section.querySelectorAll('[data-set]').forEach((c) => c.addEventListener('change', generate));
    noAmb.addEventListener('change', generate);
    genBtn.addEventListener('click', generate);
    generate();
    return section;
  }

  /* ---------- Conversor de unidades ---------- */

  const UNIT_FACTORS = {
    B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12,
    KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3, TiB: 1024 ** 4
  };

  function fmtUnits(n) {
    if (!isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-4)) return n.toExponential(3);
    return n.toLocaleString('es-ES', { maximumFractionDigits: 4 });
  }

  function buildUnits() {
    const section = document.createElement('section');
    section.className = 'tool';
    section.id = 'tool-unidades';
    section.innerHTML = `
      <h3 class="tool-title">${icon('box', 18)} Conversor de unidades</h3>
      <p class="tool-desc">Equivalencias entre bytes, kilobytes (base 1000) y kibibytes (base 1024).</p>
      <div class="field-row">
        <label class="field"><span class="field-label">Cantidad</span>
          <input type="text" class="input mono" id="un-value" value="1"
                 inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Cantidad a convertir"></label>
        <label class="field"><span class="field-label">Unidad</span>
          <select class="input" id="un-unit" aria-label="Unidad de origen">
            ${Object.keys(UNIT_FACTORS).map((u) => `<option value="${u}">${u}</option>`).join('')}
          </select></label>
      </div>
      <p class="form-error" id="un-error" hidden>Introduce un número válido mayor o igual que cero.</p>
      <div class="result-grid" id="un-results"></div>`;

    const valueInput = section.querySelector('#un-value');
    const unitSel = section.querySelector('#un-unit');
    const results = section.querySelector('#un-results');
    const errorEl = section.querySelector('#un-error');

    function compute() {
      const raw = valueInput.value.trim().replace(',', '.');
      const n = Number(raw);
      const valid = raw !== '' && isFinite(n) && n >= 0;
      errorEl.hidden = valid;
      if (!valid) { results.innerHTML = ''; return; }
      const bytes = n * UNIT_FACTORS[unitSel.value];
      const rows = [
        ['Bits', bytes * 8],
        ['Bytes (B)', bytes],
        ['Kilobytes (KB)', bytes / 1e3],
        ['Megabytes (MB)', bytes / 1e6],
        ['Gigabytes (GB)', bytes / 1e9],
        ['Terabytes (TB)', bytes / 1e12],
        ['Kibibytes (KiB)', bytes / 1024],
        ['Mebibytes (MiB)', bytes / 1024 ** 2],
        ['Gibibytes (GiB)', bytes / 1024 ** 3],
        ['Tebibytes (TiB)', bytes / 1024 ** 4]
      ];
      results.innerHTML = rows.map(([key, val]) => `
        <div class="kv">
          <span class="kv-key">${esc(key)}</span>
          <span class="kv-value mono">${esc(fmtUnits(val))}</span>
        </div>`).join('');
    }

    valueInput.addEventListener('input', compute);
    unitSel.addEventListener('change', compute);
    compute();
    return section;
  }

  /* ---------- Tabla de puertos ---------- */

  function buildPorts() {
    const ports = (window.SMR_DATA && window.SMR_DATA.ports) || [];
    const section = document.createElement('section');
    section.className = 'tool';
    section.id = 'tool-puertos';
    section.innerHTML = `
      <h3 class="tool-title">${icon('network', 18)} Tabla de puertos</h3>
      <p class="tool-desc">Puertos TCP y UDP habituales con su servicio y descripción.</p>
      <div class="field-row">
        <input type="search" class="input page-search" id="ports-search"
               placeholder="Buscar servicio o puerto" aria-label="Buscar en la tabla de puertos">
        <div class="chip-bar" role="group" aria-label="Filtrar por protocolo">
          <button type="button" class="chip active" data-proto="Todos">Todos</button>
          <button type="button" class="chip" data-proto="TCP">TCP</button>
          <button type="button" class="chip" data-proto="UDP">UDP</button>
        </div>
      </div>
      <p class="count-note" id="ports-count"></p>
      <div class="table-wrap">
        <table class="port-table">
          <thead>
            <tr><th scope="col">Puerto</th><th scope="col">Protocolo</th><th scope="col">Servicio</th><th scope="col">Descripción</th></tr>
          </thead>
          <tbody id="ports-body"></tbody>
        </table>
      </div>`;

    const search = section.querySelector('#ports-search');
    const chipBar = section.querySelector('.chip-bar');
    const body = section.querySelector('#ports-body');
    const count = section.querySelector('#ports-count');
    const state = { q: '', proto: 'Todos' };

    function apply() {
      const list = ports.filter((p) =>
        (state.proto === 'Todos' || p.proto.includes(state.proto)) &&
        (!state.q || window.SMR.matches(`${p.service} ${p.desc} ${p.port}`, state.q))
      );
      count.textContent = `${list.length} de ${ports.length} puertos`;
      body.innerHTML = list.length
        ? list.map((p) => `
            <tr>
              <td class="mono">${p.port}</td>
              <td>${esc(p.proto)}</td>
              <td class="port-service">${esc(p.service)}</td>
              <td class="port-desc">${esc(p.desc)}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" class="ports-empty">${ports.length ? 'Ningún puerto coincide con la búsqueda.' : 'No hay datos de puertos disponibles.'}</td></tr>`;
    }

    search.addEventListener('input', () => { state.q = search.value; apply(); });
    chipBar.addEventListener('click', (event) => {
      const chip = event.target.closest('.chip');
      if (!chip) return;
      state.proto = chip.dataset.proto;
      chipBar.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
      apply();
    });
    apply();
    return section;
  }

  /* ---------- Página de herramientas ---------- */

  function render(root) {
    root.replaceChildren(
      buildSubnet(),
      buildSubnetTable(),
      buildVlsm(),
      buildConverter(),
      buildUnits(),
      buildPassword(),
      buildPorts()
    );

    /* Enlace profundo: #/herramientas?tool=subredes|tabla-subredes|vlsm|conversor|unidades|contrasenas|puertos.
       El retardo deja que app.js termine su scrollTo(0, 0). */
    const tool = window.SMR.activeQuery && window.SMR.activeQuery.get('tool');
    if (tool) {
      window.setTimeout(() => {
        const target = root.querySelector(`#tool-${CSS.escape(tool)}`);
        if (!target) return;
        target.scrollIntoView({ block: 'start' });
        const firstInput = target.querySelector('input');
        if (firstInput) firstInput.focus({ preventScroll: true });
      }, 0);
    }
  }

  function searchEntries() {
    const group = 'Herramientas';
    return [
      { title: 'Calculadora de subredes', meta: 'Herramienta', group, hash: '#/herramientas?tool=subredes', text: 'calculadora de subredes ip máscara red broadcast hosts cidr prefijo' },
      { title: 'Tabla de subredes', meta: 'Herramienta', group, hash: '#/herramientas?tool=tabla-subredes', text: 'tabla de subredes dividir red rango vlsm máscara' },
      { title: 'Reparto VLSM', meta: 'Herramienta', group, hash: '#/herramientas?tool=vlsm', text: 'vlsm reparto subredes tamaños distintos hosts necesito red variable' },
      { title: 'Conversor numérico', meta: 'Herramienta', group, hash: '#/herramientas?tool=conversor', text: 'conversor numérico decimal binario hexadecimal octal' },
      { title: 'Conversor de unidades', meta: 'Herramienta', group, hash: '#/herramientas?tool=unidades', text: 'conversor de unidades bytes kilobytes kibibytes megabytes almacenamiento' },
      { title: 'Generador de contraseñas', meta: 'Herramienta', group, hash: '#/herramientas?tool=contrasenas', text: 'generador de contraseñas seguro aleatorio fuerte entropía' },
      { title: 'Tabla de puertos', meta: 'Herramienta', group, hash: '#/herramientas?tool=puertos', text: 'tabla de puertos tcp udp servicios ssh http dns ftp rdp' }
    ];
  }

  return { render, searchEntries };
})();

'use strict';

/* =====================================================================
   SMR Hub — calculadoras de la página de herramientas (js/tools.js).

   QUÉ ES: carga el módulo REAL en un sandbox y comprueba la aritmética de
   permisos POSIX (octal ↔ simbólico, SUID/SGID/sticky) y la de RAID
   (capacidad útil, redundancia, tolerancia, rendimiento relativo), más el
   cableado de las dos secciones nuevas en el render y en el buscador.

   QUÉ NO ES: no toca el DOM (los constructores usan createElement y
   querySelector) ni valida el aspecto visual; eso se comprobó en navegador.

   Ejecutar desde la raíz:  node tests/tools-calc.test.js
   ===================================================================== */

const fs = require('fs');
const vm = require('vm');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function check(name, fn) {
  try { fn(); record(name); }
  catch (e) { failed++; console.error('  ✗ ' + name + ' → ' + e.message); if (process.env.TRACE === '1') console.error(e.stack); }
}

const MODULE = fs.readFileSync('js/tools.js', 'utf8');
const ctx = { console, SMR: { esc: (v) => String(v), icon: () => '' } };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(MODULE, ctx);

const TOOLS = ctx.SMR_TOOLS;
const { chmodFromMode, raidLayout } = TOOLS.calc;

console.log('\npermisos POSIX');

check('644 → -rw-r--r-- y binario 110 100 100', () => {
  const r = chmodFromMode(0o644);
  assert(r.symbolic === '-rw-r--r--', r.symbolic);
  assert(r.bits === '110 100 100', r.bits);
  assert(r.octal === '644', r.octal);
});

check('755 → -rwxr-xr-x', () => {
  assert(chmodFromMode(0o755).symbolic === '-rwxr-xr-x');
});

check('777 → todos los bits, sin especiales', () => {
  const r = chmodFromMode(0o777);
  assert(r.symbolic === '-rwxrwxrwx', r.symbolic);
  assert(!r.special.suid && !r.special.sgid && !r.special.sticky);
});

check('4755 → SUID con s en el propietario', () => {
  const r = chmodFromMode(0o4755);
  assert(r.symbolic === '-rwsr-xr-x', r.symbolic);
  assert(r.special.suid === true);
  assert(r.octal === '4755', r.octal);
});

check('4644 → SUID sin ejecución se muestra S mayúscula', () => {
  assert(chmodFromMode(0o4644).symbolic === '-rwSr--r--');
});

check('2755 → SGID con s en el grupo', () => {
  const r = chmodFromMode(0o2755);
  assert(r.symbolic === '-rwxr-sr-x', r.symbolic);
  assert(r.special.sgid === true && !r.special.suid);
});

check('1777 → sticky con t en otros', () => {
  const r = chmodFromMode(0o1777);
  assert(r.symbolic === '-rwxrwxrwt', r.symbolic);
  assert(r.special.sticky === true);
});

check('1776 → sticky sin ejecución se muestra T mayúscula', () => {
  assert(chmodFromMode(0o1776).symbolic === '-rwxrwxrwT');
});

check('000 → sin permisos', () => {
  const r = chmodFromMode(0);
  assert(r.symbolic === '----------', r.symbolic);
  assert(r.bits === '000 000 000');
});

check('los tres dígitos de permisos son independientes', () => {
  const r = chmodFromMode(0o741);
  assert(r.triples.join('') === '741', r.triples.join(''));
});

console.log('\nRAID');

check('RAID 0: toda la capacidad, sin tolerancia', () => {
  const r = raidLayout('0', 4, 1000);
  assert(r.usable === 4000 && r.redundancy === 0 && r.tolerance === 0);
  assert(r.read === 4 && r.write === 4);
});

check('RAID 1 con 4 discos: la mitad útil, tolera 1 por pareja', () => {
  const r = raidLayout('1', 4, 500);
  assert(r.usable === 1000 && r.redundancy === 1000);
  assert(r.tolerance.min === 1 && r.tolerance.max === 2);
  assert(r.read === 4 && r.write === 2);
});

check('RAID 5: n−1 discos útiles, 1 de paridad, tolera 1 fallo', () => {
  const r = raidLayout('5', 4, 1000);
  assert(r.usable === 3000 && r.redundancy === 1000 && r.tolerance === 1);
  assert(r.layout.filter((k) => k === 'paridad').length === 1);
});

check('RAID 6: n−2 discos útiles, 2 de paridad, tolera 2 fallos', () => {
  const r = raidLayout('6', 6, 2000);
  assert(r.usable === 8000 && r.redundancy === 4000 && r.tolerance === 2);
  assert(r.layout.filter((k) => k === 'paridad').length === 2);
});

check('RAID 10: mitad útil y una escritura por pareja', () => {
  const r = raidLayout('10', 6, 1000);
  assert(r.usable === 3000 && r.redundancy === 3000);
  assert(r.tolerance.max === 3);
  assert(r.read === 6 && r.write === 3);
});

check('RAID 10 rechaza un número impar de discos', () => {
  assert(/par/.test(raidLayout('10', 5, 1000).error || ''));
});

check('los mínimos de discos se respetan', () => {
  assert(raidLayout('0', 1, 100).error, 'RAID 0 con 1 disco debe fallar');
  assert(raidLayout('1', 1, 100).error, 'RAID 1 con 1 disco debe fallar');
  assert(raidLayout('5', 2, 100).error, 'RAID 5 con 2 discos debe fallar');
  assert(raidLayout('6', 3, 100).error, 'RAID 6 con 3 discos debe fallar');
  assert(!raidLayout('6', 4, 100).error, 'RAID 6 con 4 discos es válido');
});

check('capacidad cero o negativa se rechaza', () => {
  assert(raidLayout('5', 3, 0).error);
  assert(raidLayout('5', 3, -10).error);
});

check('la capacidad útil nunca supera la bruta', () => {
  for (const type of ['0', '1', '5', '6', '10']) {
    for (const disks of [2, 3, 4, 6, 8]) {
      const r = raidLayout(type, disks, 500);
      if (r.error) continue;
      assert(r.usable + r.redundancy === r.total, type + '/' + disks);
      assert(r.usable <= r.total, type + '/' + disks);
    }
  }
});

console.log('\ncableado en la página');

check('render monta las dos secciones nuevas', () => {
  const render = MODULE.slice(MODULE.indexOf('function render(root)'));
  assert(/buildChmod\(\)/.test(render) && /buildRaid\(\)/.test(render));
});

check('el buscador ofrece chmod y RAID con ruta profunda', () => {
  const paths = TOOLS.searchEntries().map((e) => e.path);
  assert(paths.includes('/herramientas?tool=chmod'), paths.join(','));
  assert(paths.includes('/herramientas?tool=raid'), paths.join(','));
});

check('los ids de sección existen para el enlace ?tool=', () => {
  assert(/id = 'tool-chmod'/.test(MODULE));
  assert(/id = 'tool-raid'/.test(MODULE));
});

console.log(`\n${failed ? 'FALLOS: ' + failed + ' · ' : ''}${passed} ok, ${failed} fallos`);
process.exit(failed ? 1 : 0);

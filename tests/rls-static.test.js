'use strict';

/* Comprueba invariantes en el texto de migraciones y cliente; no ejecuta
   PostgreSQL. El aislamiento real por REST se cubre en rest-rls-isolation.sh
   y los privilegios del catálogo en pg-privileges-lockdown.sh. */

const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function record(n) { passed++; console.log('  ✓ ' + n); }
function assert(c, m) { if (!c) throw new Error(m || 'assert'); }
function check(name, fn) {
  try { fn(); record(name); }
  catch (e) {
    failed++;
    console.error('  ✗ ' + name + ' → ' + e.message);
    if (process.env.TRACE === '1') console.error(e.stack);
  }
}

/* ---------- fuentes ---------- */
const MIG_DIR = 'supabase/migrations';
const migrations = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
const sql = migrations.map((f) => fs.readFileSync(path.join(MIG_DIR, f), 'utf8')).join('\n');
const srcProgress = fs.readFileSync('js/cloud-progress.js', 'utf8');
const srcSrs = fs.readFileSync('js/srs.js', 'utf8');

/* Quita comentarios: las menciones a service_role/sb_secret en la
   documentación son legítimas; lo que no puede existir es CÓDIGO que las use. */
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}
const CLIENT_CODE = stripComments(['js/cloud-config.js', 'js/supabase.js', 'js/auth.js', 'js/cloud-profile.js', 'js/cloud-progress.js']
  .map((f) => fs.readFileSync(f, 'utf8')).join('\n'));

/* Todas las definiciones de función. El bloque va de `create or replace
   function` hasta su `$$;` final: fuera de ahí no hay cuerpo que mirar, así
   que una opción de OTRA función no se cuela en la anterior. */
const FUNCS = [];
{
  const re = /create or replace function public\.(\w+)\s*\(([^)]*)\)\s*returns([\s\S]*?)as \$\$([\s\S]*?)\$\$;/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    FUNCS.push({ name: m[1], sig: m[2].replace(/\s+/g, ' ').trim(), opts: m[3].replace(/\s+/g, ' ').trim(), body: m[4] });
  }
}
/* Última definición de una función (la efectiva: 00005 redefine la RPC de
   chunks, 00008 la de SRS). */
function fnDef(name) {
  const all = FUNCS.filter((f) => f.name === name);
  return all.length ? all[all.length - 1] : null;
}

/* ---------- superficie de policies esperada (diseño de 00001/00004) ---------- */
const EXPECTED = {
  profiles: 'S,I,U,D', student_settings: 'S,I,U,D', resource_state: 'S,I,U,D', test_scores: 'S,I,U,D',
  wrong_answers: 'S,I,U,D', srs_cards: 'S,I,U,D', case_solutions: 'S,I,U,D', favorites: 'S,I,U,D',
  test_attempts: 'S,I', wrong_answer_events: 'S,I', streak_days: 'S,I', study_sessions: 'S,I',
  activity_events: 'S,I',
  /* La RPC es la única vía de alta de feedback y avisos: valida el payload,
     sella user_id/processing_status y limita la frecuencia. */
  feedback: 'S', question_reports: 'S', entitlements: 'S',
  progress_sync_chunks: 'S,I,D'
};
const CMD = { S: 'select', I: 'insert', U: 'update', D: 'delete' };

/* Se parsea la sentencia COMPLETA de cada policy y se buscan las cláusulas
   dentro de ella: una policy de UPDATE lleva `using` Y `with check`, y
   intentar capturar las dos con una sola regex pierde una de las dos. */
const policies = [];
{
  const re = /create policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(\w+)\s+([\s\S]*?);/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const tail = m[4].replace(/\s+/g, ' ').trim();
    const roleM = /\bto\s+([a-z_,\s]+?)\s+(?:using|with check)\b/i.exec(tail);
    policies.push({
      name: m[1], table: m[2], cmd: m[3].toLowerCase(),
      roles: roleM ? roleM[1].trim() : '',
      clause: tail,
      hasUsing: /using\s*\(/i.test(tail),
      hasWithCheck: /with\s+check\s*\(/i.test(tail)
    });
  }
}

/* Una migración posterior puede RETIRAR una policy (00009 retira el INSERT
   directo de feedback/question_reports). La superficie efectiva es la de
   las policies creadas que ninguna migración posterior ha borrado. */
const dropped = new Set();
{
  const re = /drop policy (?:if exists )?(\w+) on public\.(\w+)/gi;
  let m;
  while ((m = re.exec(sql)) !== null) dropped.add(m[2] + '.' + m[1]);
}
const effective = policies.filter((p) => !dropped.has(p.table + '.' + p.name));

const TABLES = Object.keys(EXPECTED);

/* ===================== casos ===================== */

check('las migraciones 00001..00009 están presentes', () => {
  assert(migrations.length >= 9, 'faltan migraciones: ' + migrations.join(', '));
  assert(migrations[0].startsWith('00001'), 'la primera migración debe ser 00001: ' + migrations[0]);
});

check('RLS habilitado en las ' + TABLES.length + ' tablas de datos de usuario', () => {
  TABLES.forEach((t) => assert(new RegExp('alter table public\\.' + t + '\\s+enable row level security').test(sql),
    'falta enable row level security en ' + t));
});

check('superficie de policies por tabla igual a la esperada (S/I/U/D)', () => {
  TABLES.forEach((t) => {
    const got = effective.filter((p) => p.table === t).map((p) => p.cmd).sort().join(',');
    const want = EXPECTED[t].split(',').map((k) => CMD[k]).sort().join(',');
    assert(got === want, t + ': [' + got + '] ≠ [' + want + ']');
  });
});

check('las ' + effective.length + ' policies vigentes son owner-only, solo authenticated y sin condiciones permisivas', () => {
  assert(effective.length >= 48, 'se esperaban >=48 policies vigentes, hay ' + effective.length);
  effective.forEach((p) => {
    assert(!/using\s*\(\s*true\s*\)/i.test(p.clause) && !/with\s+check\s*\(\s*true\s*\)/i.test(p.clause),
      'policy permisiva (true) en ' + p.table + '.' + p.name);
    assert(p.roles === 'authenticated', p.table + '.' + p.name + ' no es solo authenticated: [' + p.roles + ']');
    assert(/user_id\s*=\s*auth\.uid\(\)/.test(p.clause),
      p.table + '.' + p.name + ' no restringe a user_id = auth.uid(): ' + p.clause);
  });
});

check('toda policy de INSERT/UPDATE lleva WITH CHECK (y la de UPDATE, USING)', () => {
  TABLES.forEach((t) => {
    ['insert', 'update'].forEach((c) => {
      const ps = effective.filter((p) => p.table === t && p.cmd === c);
      if (!ps.length) return;
      assert(ps.some((p) => p.hasWithCheck), t + ': policy de ' + c + ' sin WITH CHECK');
      if (c === 'update') assert(ps.some((p) => p.hasUsing), t + ': policy de update sin USING');
    });
  });
});

check('las tablas append-only no permiten DELETE (ni entitlements, SELECT-only)', () => {
  ['test_attempts', 'wrong_answer_events', 'streak_days', 'study_sessions', 'activity_events', 'feedback', 'question_reports', 'entitlements']
    .forEach((t) => assert(!effective.some((p) => p.table === t && p.cmd === 'delete'), t + ' no debe permitir DELETE'));
});

check('las RPC son SECURITY INVOKER, con search_path fijo, sin uid de entrada y con auth.uid()', () => {
  ['sync_progress_chunk', 'merge_srs_cards'].forEach((name) => {
    const d = fnDef(name);
    assert(d, 'no se encontró la definición de ' + name);
    assert(/security invoker/i.test(d.opts), name + ' debe ser SECURITY INVOKER: ' + d.opts);
    assert(/set search_path = public/.test(d.opts), name + ' debe fijar search_path: ' + d.opts);
    assert(!/(^|,)\s*p_?uid\b|\buser_id\s+uuid/.test(d.sig), name + ' no debe aceptar un uid: (' + d.sig + ')');
    assert(/auth\.uid\(\)/.test(d.body), name + ' debe derivar el propietario de auth.uid()');
    assert(/is null/.test(d.body) && /auth required/.test(d.body), name + ' debe fallar cerrado sin identidad');
  });
});

check('la RPC de chunks acota las tablas permitidas y rechaza el resto', () => {
  assert(/check \(table_name in \(/.test(sql), 'progress_sync_chunks debe acotar table_name con CHECK');
  const d = fnDef('sync_progress_chunk');
  assert(/raise exception 'unsupported table/.test(d.body), 'la RPC debe rechazar tablas no soportadas');
  ['test_attempts', 'study_sessions', 'activity_events', 'wrong_answer_events'].forEach((t) => {
    assert(d.body.indexOf("p_table = '" + t + "'") !== -1, 'la RPC debe tratar ' + t);
  });
});

check('SECURITY DEFINER: allow-list fija, search_path fijo y EXECUTE acotado', () => {
  /* Cualquier SECURITY DEFINER nuevo exige justificarlo en esta allow-list. */
  const ALLOWED = 'handle_new_user,submit_feedback,submit_question_report';
  const names = FUNCS.filter((f) => /security definer/i.test(f.opts));
  assert(names.map((f) => f.name).sort().join(',') === ALLOWED,
    'SECURITY DEFINER solo en la allow-list [' + ALLOWED + '], hay: ' + names.map((f) => f.name).join(', '));
  names.forEach((f) => {
    assert(/set search_path = ''/.test(f.opts), f.name + ' es SECURITY DEFINER sin search_path fijo: ' + f.opts);
    /* Nadie ejecuta estas funciones por defecto: primero se revoca. */
    ['public', 'anon'].forEach((r) => {
      assert(new RegExp('revoke execute on function public\\.' + f.name + '\\([^)]*\\) from ' + r).test(sql),
        'falta revoke execute de ' + f.name + ' a ' + r);
    });
    /* El trigger de alta NO es invocable por el cliente. */
    if (f.name === 'handle_new_user') {
      assert(new RegExp('revoke execute on function public\\.' + f.name + '\\([^)]*\\) from authenticated').test(sql),
        'falta revoke execute de handle_new_user a authenticated');
    }
  });
});

check('las RPC de 8.8 son DEFINER con controles dentro del cuerpo', () => {
  ['submit_feedback', 'submit_question_report'].forEach((name) => {
    const d = fnDef(name);
    assert(d, 'no se encontró la definición de ' + name);
    assert(/security definer/i.test(d.opts), name + ' debe ser SECURITY DEFINER (00009 lo justifica)');
    assert(/auth\.uid\(\)/.test(d.body), name + ' debe derivar el propietario de auth.uid()');
    assert(/auth required/.test(d.body) && /42501/.test(d.body), name + ' debe fallar cerrado sin identidad (42501)');
    assert(/rate limit exceeded/.test(d.body) && /P0001/.test(d.body), name + ' debe limitar la frecuencia (P0001)');
    assert(/invalid payload/.test(d.body) && /22023/.test(d.body), name + ' debe validar los datos en servidor (22023)');
    assert(/pg_advisory_xact_lock/.test(d.body), name + ' debe serializar el recuento por usuario');
    assert(!/p_user_id|p_uid/.test(d.sig), name + ' no debe aceptar un uid del cliente: (' + d.sig + ')');
    assert(!/user_id/.test(d.sig), name + ' no debe recibir user_id por parámetro: (' + d.sig + ')');
  });
  /* `processing_status` es estado de trabajo del servidor: se fija en la
     función y ninguna columna del cliente puede escribirlo. */
  assert(/'received'\)/g.test(sql) === true && !/p_processing_status/.test(sql),
    'processing_status debe sellarlo el servidor: no existe parámetro para él');
  assert(/drop policy if exists feedback_insert_own/.test(sql)
    && /drop policy if exists question_reports_insert_own/.test(sql),
    '00009 debe retirar el INSERT directo de feedback y question_reports');
});

check('los grants de las RPC se acotan a los roles documentados', () => {
  function roles(fn, sig) {
    const re = new RegExp('grant execute on function public\\.' + fn + '\\(' + sig.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\) to ([\\w, ]+);', 'g');
    const out = []; let g;
    while ((g = re.exec(sql)) !== null) g[1].split(',').forEach((r) => out.push(r.trim()));
    return Array.from(new Set(out)).sort().join(',');
  }
  assert(roles('sync_progress_chunk', 'text, text, jsonb, bigint, bigint') === 'authenticated',
    'sync_progress_chunk solo a authenticated: ' + roles('sync_progress_chunk', 'text, text, jsonb, bigint, bigint'));
  /* authenticator es deliberado SOLO en merge_srs_cards (00007 lo justifica
     con un hallazgo HTTP real, PGRST202). Se fija aquí para que nadie lo
     copie a otra función sin la misma evidencia. */
  assert(roles('merge_srs_cards', 'jsonb') === 'authenticated,authenticator',
    'merge_srs_cards: authenticated + authenticator documentado, no ' + roles('merge_srs_cards', 'jsonb'));
  /* 00009 repite el mismo grant por el mismo motivo (PostgREST resuelve la
     función a través de authenticator). El resto de roles no aparecen. */
  assert(roles('submit_feedback', 'text, text, jsonb, bigint') === 'authenticated,authenticator',
    'submit_feedback: authenticated + authenticator, no ' + roles('submit_feedback', 'text, text, jsonb, bigint'));
  assert(roles('submit_question_report', 'text, text, text, text, bigint') === 'authenticated,authenticator',
    'submit_question_report: authenticated + authenticator, no ' + roles('submit_question_report', 'text, text, text, text, bigint'));
});

check('el envío del cliente va por RPC y nunca manda un user_id (8.8)', () => {
  const src = fs.readFileSync('js/cloud-feedback.js', 'utf8');
  assert(/submit_feedback/.test(src) && /submit_question_report/.test(src),
    'el cliente debe usar las dos RPC de 00009');
  assert(!/user_id/.test(stripComments(src)), 'el cliente no debe enviar user_id en el payload');
  const code = stripComments(src);
  assert(!/\.from\(/.test(code), 'el envío no debe usar la tabla directa (solo .rpc)');
  /* La interfaz no habla con Supabase: usa el contrato SMR.feedback. */
  ['js/app.js', 'js/tests.js'].forEach((f) => {
    const ui = stripComments(fs.readFileSync(f, 'utf8'));
    assert(/SMR\.feedback/.test(ui), f + ' debe llamar a SMR.feedback');
    assert(!/SMR\.cloud\.(from|rpc)/.test(ui), f + ' no debe hablar con Supabase directamente');
  });
});

check('el cliente no contiene credenciales privilegiadas ni manipula tokens', () => {
  assert(/sb_publishable_|eyJ/.test(fs.readFileSync('js/cloud-config.js', 'utf8')),
    'cloud-config.js debe contener solo una clave pública');
  assert(!/\bservice_role\b/.test(CLIENT_CODE), 'el cliente no debe nombrar service_role en código');
  assert(!/sb_secret/.test(CLIENT_CODE), 'el cliente no debe usar sb_secret');
  assert(!/SMR_SUPABASE_SERVICE/.test(CLIENT_CODE), 'el cliente no debe leer una clave de servicio');
  assert(!/access_token|refresh_token/.test(CLIENT_CODE),
    'el cliente no debe manipular tokens: la sesión la gestiona el SDK');
});

check('cloud-config.js solo aplica el endpoint LOCAL bajo loopback (8.7)', () => {
  const src = fs.readFileSync('js/cloud-config.js', 'utf8');
  assert(!/^\s*window\.SMR_SUPABASE_URL\s*=/m.test(src),
    'las claves locales no deben fijarse de forma incondicional');
  assert(/isLocal/.test(src) && /return;/.test(src),
    'debe existir una guarda de loopback que aborte fuera de local');
  /* Comportamiento real del archivo, no solo su texto: se ejecuta con dos
     orígenes distintos y se comprueba qué globales deja puestas. */
  const load = (hostname) => {
    const w = { location: { hostname: hostname } };
    new Function('window', 'globalThis', src)(w, w);
    return w;
  };
  const local = load('127.0.0.1');
  assert(local.SMR_SUPABASE_URL === 'http://127.0.0.1:54321' && !!local.SMR_SUPABASE_ANON_KEY,
    'en loopback debe configurar el stack local');
  const localhost = load('localhost');
  assert(localhost.SMR_SUPABASE_URL === 'http://127.0.0.1:54321', 'localhost también es local');
  const disk = load('');
  assert(disk.SMR_SUPABASE_URL === 'http://127.0.0.1:54321', 'file:// (hostname vacío) sigue siendo local');
  const prod = load('smr-hub.pages.dev');
  assert(prod.SMR_SUPABASE_URL === undefined && prod.SMR_SUPABASE_ANON_KEY === undefined,
    'un origen público NO debe recibir el endpoint local: ' + JSON.stringify(prod));
  const injected = { location: { hostname: 'smr-hub.pages.dev' } };
  injected.SMR_SUPABASE_URL = 'https://ejemplo.supabase.co';
  injected.SMR_SUPABASE_ANON_KEY = 'clave-inyectada';
  new Function('window', 'globalThis', src)(injected, injected);
  assert(injected.SMR_SUPABASE_URL === 'https://ejemplo.supabase.co' && injected.SMR_SUPABASE_ANON_KEY === 'clave-inyectada',
    'los valores inyectados por el despliegue deben sobrevivir intactos');
});

check('invariantes de dominio intactos: marcador {owner,v:1}, sin seq, formato SRS, esquema sin datos locales', () => {
  assert(srcProgress.includes('SMR.store.set(LIVE_OWNER_KEY, { owner: owner, v: 1 })'),
    'el marcador debe seguir escribiéndose como { owner, v: 1 }');
  assert(!/\bseq\b/.test(srcProgress), 'no debe reintroducirse un contador seq en el marcador');
  assert(srcSrs.includes('/^q-[0-9a-f]{16}') || srcProgress.includes('/^q-[0-9a-f]{16}'),
    'el formato de clave estable de SRS debe seguir siendo q-<16 hex>');
  assert(!/studentProfile/i.test(sql), 'el esquema NO debe copiar claves locales de la app (SMR_DATA/studentProfile)');
});

if (process.env.RLS_STATIC_SELFTEST === '1') {
  check('auto-verificación (debe fallar)', () => assert(1 === 2, 'auto-verificación: aserción forzada a fallar'));
}

console.log('\n' + passed + ' ok, ' + failed + ' fallidos');
if (failed) process.exitCode = 1;

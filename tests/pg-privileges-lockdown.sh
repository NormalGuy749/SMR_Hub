#!/usr/bin/env bash
# =====================================================================
# SMR Hub — Fase 8.7: privilegios y bloqueo RLS a nivel PostgreSQL.
#
# Capa distinta a tests/rest-rls-isolation.sh:
#   - aquel prueba el aislamiento por la API REST real (como el cliente);
#   - este prueba las GARANTÍAS del esquema: RLS habilitado por tabla,
#     policies no permisivas, roles permitidos y privilegios de las
#     funciones (incluido el camino del rol authenticator).
#
# Solo contra el stack LOCAL ya en marcha. No aplica nada remoto, no
# crea ni borra datos: todo son consultas de catálogo y un SET ROLE
# dentro de una transacción que termina en ROLLBACK.
# =====================================================================
set -u
DB_CONTAINER="supabase_db_scratch_84val"
[[ "$(docker ps --format '{{.Names}}' | grep -c "^${DB_CONTAINER}$")" == "1" ]] || { echo "FALLO: contenedor $DB_CONTAINER no activo" >&2; exit 2; }

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1 → real [$2] esperado [$3]"; }
check() { if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3" "$1" "$2"; fi; }
sql() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt -c "$1"; }
sql_fail() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -qAt -c "$1" 2>&1; }
# set_config devuelve su propia fila: para esos casos vale la última línea.
sql_last() { sql_fail "$1" | grep -v '^$' | tail -1; }

TABLES="profiles student_settings resource_state test_scores test_attempts wrong_answer_events wrong_answers srs_cards case_solutions streak_days study_sessions activity_events favorites feedback question_reports entitlements progress_sync_chunks"

echo "— RLS: habilitado en TODAS las tablas de datos de usuario"
check "$(sql "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity;")" "0" "ninguna tabla de public sin row level security"

echo "— Policies: ninguna permisiva y todas restringidas a authenticated"
check "$(sql "select count(*) from pg_policies where schemaname='public' and (qual = 'true' or with_check = 'true');")" "0" "ninguna policy con USING/WITH CHECK = true"
check "$(sql "select count(*) from pg_policies where schemaname='public' and not (roles = '{authenticated}'::name[]);")" "0" "todas las policies son SOLO para el rol authenticated (ni anon ni public)"
check "$(sql "select count(*) from pg_policies where schemaname='public' and qual is not null and qual not like '%auth.uid()%';")" "0" "toda policy de SELECT/UPDATE/DELETE filtra por auth.uid()"
check "$(sql "select count(*) from pg_policies where schemaname='public' and with_check is not null and with_check not like '%auth.uid()%';")" "0" "toda policy de INSERT/UPDATE exige user_id = auth.uid() en WITH CHECK"

echo "— Cobertura mínima por tabla (SELECT/INSERT propios donde el cliente escribe)"
for t in $TABLES; do
  CMDS=$(sql "select string_agg(distinct cmd, ',' order by cmd) from pg_policies where schemaname='public' and tablename='$t';")
  case "$t" in
    # 00009 (fase 8.8): feedback y question_reports ya no tienen INSERT
    # directo; la RPC DEFINER es la única vía de alta.
    entitlements|feedback|question_reports) EXPECT="SELECT" ;;
    test_attempts|wrong_answer_events|streak_days|study_sessions|activity_events) EXPECT="INSERT,SELECT" ;;
    progress_sync_chunks) EXPECT="DELETE,INSERT,SELECT" ;;
    *) EXPECT="DELETE,INSERT,SELECT,UPDATE" ;;
  esac
  check "$CMDS" "$EXPECT" "$t: policies $EXPECT"
done

echo "— Privilegios EXECUTE: solo quien los necesita"
check "$(sql "select has_function_privilege('authenticated','public.merge_srs_cards(jsonb)','EXECUTE')::int;")" "1" "merge_srs_cards: authenticated puede (lo usa el cliente)"
check "$(sql "select has_function_privilege('anon','public.merge_srs_cards(jsonb)','EXECUTE')::int;")" "0" "merge_srs_cards: anon NO puede"
check "$(sql "select has_function_privilege('authenticated','public.sync_progress_chunk(text,text,jsonb,bigint,bigint)','EXECUTE')::int;")" "1" "sync_progress_chunk: authenticated puede"
check "$(sql "select has_function_privilege('anon','public.sync_progress_chunk(text,text,jsonb,bigint,bigint)','EXECUTE')::int;")" "0" "sync_progress_chunk: anon NO puede"
# PUBLIC se reconoce por un aclitem con el beneficiario VACÍO ({=X/postgres});
# buscar '=X/' a secas daría falso positivo con 'postgres=X/postgres'.
check "$(sql "select (proacl is not null)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_progress_chunk';")" "1" "sync_progress_chunk: proacl explícito (no queda el default abierto)"
check "$(sql "select (proacl::text !~ E'(^|[\\{,])=[^,}]*/')::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sync_progress_chunk';")" "1" "sync_progress_chunk: sin EXECUTE para PUBLIC (B1 de 00005)"
check "$(sql "select (proacl::text !~ E'(^|[\\{,])=[^,}]*/')::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='merge_srs_cards';")" "1" "merge_srs_cards: sin EXECUTE para PUBLIC aunque sí para authenticator (documentado)"
check "$(sql "select (proacl::text !~ E'(^|[\\{,])=[^,}]*/')::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='handle_new_user';")" "1" "handle_new_user: sin EXECUTE para PUBLIC"
check "$(sql "select has_function_privilege('authenticated','public.handle_new_user()','EXECUTE')::int;")" "0" "handle_new_user: authenticated NO puede invocar la función SECURITY DEFINER"
check "$(sql "select has_function_privilege('anon','public.handle_new_user()','EXECUTE')::int;")" "0" "handle_new_user: anon NO puede"

echo "— Ruta del rol authenticator (grant documentado en 00007): falla cerrada, no es una vía de acceso cruzado"
check "$(sql "select (position('authenticator=X/' in coalesce((select proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='merge_srs_cards'),'')) > 0)::int;")" "1" "grant a authenticator presente (documentado en 00007 por el hallazgo PGRST202)"
# Evidencia real: bajo el rol authenticator la RPC no llega a escribir.
BEFORE=$(sql "select count(*) from public.srs_cards;")
OUT=$(sql_fail "begin; select set_config('role','authenticator',true); select public.merge_srs_cards('[{\"question_key\":\"q-0000000000000001\",\"level\":5,\"due\":1}]'::jsonb); rollback;")
if [[ "$OUT" == *"permission denied"* || "$OUT" == *"auth required"* ]]; then ok "merge_srs_cards bajo authenticator sin claims NO puede escribir (falla cerrado)"; else bad "authenticator sin claims" "$OUT" "permission denied o auth required"; fi
check "$(sql "select count(*) from public.srs_cards;")" "$BEFORE" "y no queda ninguna fila escrita por ese intento"
OUT=$(sql_fail "begin; select set_config('role','authenticator',true); select public.sync_progress_chunk('x','test_attempts','[]'::jsonb,1,1); rollback;")
if [[ "$OUT" == *"permission denied"* || "$OUT" == *"auth required"* ]]; then ok "sync_progress_chunk bajo authenticator sin claims falla cerrado"; else bad "authenticator sin claims (chunk)" "$OUT" "permission denied o auth required"; fi

echo "— 00009: las RPC de envío (feedback y reportes) son la única vía de escritura"
for RPC in "submit_feedback|text,text,jsonb,bigint" "submit_question_report|text,text,text,text,bigint"; do
  NAME="${RPC%%|*}"; SIG="${RPC#*|}"
  check "$(sql "select prosecdef::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$NAME';")" "1" "$NAME: SECURITY DEFINER (00009 lo justifica)"
  # El array se literaliza como {"search_path=\"\""}, así que se comprueba el
  # contenido: hay search_path fijado y NO es un nombre de esquema.
  check "$(sql "select (proconfig::text ~ 'search_path=' and proconfig::text !~ 'search_path=[a-zA-Z]')::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$NAME';")" "1" "$NAME: search_path vacío (referencias cualificadas)"
  check "$(sql "select has_function_privilege('authenticated','public.$NAME($SIG)','EXECUTE')::int;")" "1" "$NAME: authenticated puede (uso real del cliente)"
  check "$(sql "select has_function_privilege('anon','public.$NAME($SIG)','EXECUTE')::int;")" "0" "$NAME: anon NO puede"
  check "$(sql "select (proacl::text !~ E'(^|[\\{,])=[^,}]*/')::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='$NAME';")" "1" "$NAME: sin EXECUTE para PUBLIC"
done

# Sin identidad demostrable la RPC falla cerrada y no escribe NADA.
FB_BEFORE=$(sql "select count(*) from public.feedback;")
OUT=$(sql_fail "begin; select set_config('role','authenticator',true); select public.submit_feedback('problema','prueba 8.7'); rollback;")
if [[ "$OUT" == *"permission denied"* || "$OUT" == *"auth required"* ]]; then ok "submit_feedback bajo authenticator sin claims falla cerrado"; else bad "submit_feedback authenticator" "$OUT" "permission denied o auth required"; fi
OUT=$(sql_fail "begin; select set_config('role','authenticated',true); select public.submit_feedback('problema','prueba 8.7'); rollback;")
if [[ "$OUT" == *"permission denied"* || "$OUT" == *"auth required"* ]]; then ok "submit_feedback bajo authenticated sin claims falla cerrado"; else bad "submit_feedback authenticated sin claims" "$OUT" "permission denied o auth required"; fi
check "$(sql "select count(*) from public.feedback;")" "$FB_BEFORE" "y no queda ninguna fila escrita por esos intentos"

# La tabla ya no acepta INSERT directo del cliente (antes de 00009 sí).
OUT=$(sql_fail "begin; select set_config('role','authenticated',true); insert into public.feedback (user_id, category, message) values ('00000000-0000-0000-0000-000000000001','problema','x'); rollback;")
if [[ "$OUT" == *"row-level security"* ]]; then ok "authenticated NO puede insertar feedback directo (RLS)"; else bad "insert directo feedback" "$OUT" "row-level security"; fi
OUT=$(sql_fail "begin; select set_config('role','authenticated',true); insert into public.question_reports (user_id, test_id, question_key, reason) values ('00000000-0000-0000-0000-000000000001','t-redes','q-0000000000000001','otro'); rollback;")
if [[ "$OUT" == *"row-level security"* ]]; then ok "authenticated NO puede insertar question_reports directo (RLS)"; else bad "insert directo question_reports" "$OUT" "row-level security"; fi

echo "— anon: privilegio de tabla sí, filas no (RLS decide)"
check "$(sql_last "begin; select set_config('role','anon',true); select count(*) from public.profiles; rollback;")" "0" "anon puede ejecutar la consulta pero RLS le devuelve 0 filas"
check "$(sql_last "begin; select set_config('role','anon',true); select count(*) from public.srs_cards; rollback;")" "0" "anon no ve ninguna tarjeta SRS"
check "$(sql_last "begin; select set_config('role','anon',true); select count(*) from public.progress_sync_chunks; rollback;")" "0" "anon no ve el libro de idempotencia"
OUT=$(sql_fail "begin; select set_config('role','anon',true); insert into public.srs_cards (user_id,question_key,level,due) values ('00000000-0000-0000-0000-000000000001','q-0000000000000001',1,1); rollback;")
if [[ "$OUT" == *"row-level security"* ]]; then ok "anon no puede insertar (RLS)"; else bad "insert anon" "$OUT" "row-level security"; fi

echo
echo "— RESUMEN: OK=$PASS FAIL=$FAIL  (PostgreSQL local real)"
[[ $FAIL -eq 0 ]] || exit 1
exit 0

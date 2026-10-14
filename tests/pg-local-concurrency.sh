#!/usr/bin/env bash
# =====================================================================
# SMR Hub — Fase 8.5.3-E: concurrencia REAL de merge_srs_cards.
# Solo contra la BD local identificada por nombre de contenedor.
# Coordinación: txn A escribe y sostiene el tuple-lock de la fila sin
# commit; la txn B debe esperar ese commit (serialización REAL, no un
# objeto JS compartido). Los here-docs entrecomillados pasan el SQL
# literal; UID_A va como variable de entorno al bash del contenedor.
# =====================================================================
set -u
DB_CONTAINER="supabase_db_scratch_84val"
[[ "$(docker ps --format '{{.Names}}' | grep -c "^${DB_CONTAINER}$")" == "1" ]] || { echo "FALLO: contenedor no activo" >&2; exit 2; }
UID_A='11111111-1111-1111-1111-111111111111'
export UID_A
K1='q-ccccccccccccccaa'; K2='q-ccccccccccccccbb'; K3=q-ccccccccccccccc4

sql() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt -c "$1"; }
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1 → $2"; }
check() { if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3" "esperado [$1] hay [$2]"; fi; }

cleanup() {
  docker exec "$DB_CONTAINER" psql -U postgres -d postgres -q -c \
    "delete from srs_cards where user_id='$UID_A' and question_key in ('$K1','$K2','$K3');" 2>/dev/null
  docker exec "$DB_CONTAINER" psql -U postgres -d postgres -q -c \
    "delete from auth.users where id='$UID_A' and email='pgtest-a@local.test';" 2>/dev/null
}
cleanup
trap cleanup EXIT
sql "insert into auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,aud,role) values ('$UID_A','pgtest-a@local.test','x',now(),now(),now(),'{}','{}','authenticated','authenticated') on conflict (id) do nothing;" >/dev/null
[[ "$(sql "select coalesce((select 1 from auth.users where id='$UID_A'),0);")" == "1" ]] || { echo "FALLO: no se pudo crear el usuario de prueba (FK/columnas)" >&2; exit 3; }

atxn() { sql "begin; select set_config('role','authenticated',true); select set_config('request.jwt.claims','{\"sub\":\"$UID_A\",\"role\":\"authenticated\"}',true); select public.merge_srs_cards('$1'::jsonb); commit;"; }
# TMPD fuera de /tmp de Git Bash (que docker no mapea): usamos el TMPDIR de Windows visible en el host solamente (stdin lo pasa el host)
TMPD=$(mktemp -d)

# Race real: A (background) sostiene el tuple-lock sin commit; B espera.
# Los SQL se escriben a ficheros en el host y se pasan por STDIN a psql
# dentro del contenedor con `docker exec -i ... < fichero`: sin docker cp
# (rutas de Git Bash) y sin here-docs anidados en el contenedor.
race() { # $1 = SQL A, $2 = SQL B
  printf '%s' "$1" > "$TMPD/raceA.sql"
  printf '%s' "$2" > "$TMPD/raceB.sql"
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -qAt < "$TMPD/raceA.sql" &
  local PA=$!
  sleep 0.15
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -qAt < "$TMPD/raceB.sql"
  wait "$PA"
  rm -f "$TMPD/raceA.sql" "$TMPD/raceB.sql"
  return 0
}

auth_begin="begin; select set_config('role','authenticated',true); select set_config('request.jwt.claims','{\"sub\":\"$UID_A\",\"role\":\"authenticated\"}',true);"

echo "— CASO 1: carrera sobre fila EXISTENTE"
atxn '[{"question_key":"q-ccccccccccccccaa","level":2,"due":5000,"client_updated_at":100}]' >/dev/null
race "$(cat <<EOF
begin;
select set_config('role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"$UID_A","role":"authenticated"}',true);
select public.merge_srs_cards('[{"question_key":"$K1","level":3,"due":9000,"client_updated_at":200}]'::jsonb);
select pg_advisory_xact_lock(984520);
select pg_sleep(0.35);
commit;
EOF
)" "$(cat <<EOF
begin;
select set_config('role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"$UID_A","role":"authenticated"}',true);
select public.merge_srs_cards('[{"question_key":"$K1","level":2,"due":8000,"client_updated_at":300}]'::jsonb);
commit;
EOF
)" > /tmp/pgcc_c1 2>&1
check "$(sql "select level||','||due from srs_cards where user_id='$UID_A' and question_key='$K1';")" "3,9000" "caso1: {3,9000} sobrevive a la carrera real"

echo "— CASO 2: inserción inicial CONCURRENTE"
race "$(cat <<EOF
begin;
select set_config('role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"$UID_A","role":"authenticated"}',true);
select public.merge_srs_cards('[{"question_key":"$K2","level":3,"due":7000,"client_updated_at":200}]'::jsonb);
select pg_advisory_xact_lock(984521);
select pg_sleep(0.35);
commit;
EOF
)" "$(cat <<EOF
begin;
select set_config('role','authenticated',true);
select set_config('request.jwt.claims','{"sub":"$UID_A","role":"authenticated"}',true);
select public.merge_srs_cards('[{"question_key":"$K2","level":2,"due":6000,"client_updated_at":300}]'::jsonb);
commit;
EOF
)" > /tmp/pgcc_c2 2>&1
check "$(sql "select level||','||due from srs_cards where user_id='$UID_A' and question_key='$K2';")" "3,7000" "caso2: la inserción secundaria espera el lock y conserva el ganador"

echo "— CASO 3: orden inverso"
atxn '[{"question_key":"q-ccccccccccccccaa","level":2,"due":8000,"client_updated_at":300}]' >/dev/null
check "$(sql "select level||','||due from srs_cards where question_key='$K1';")" "3,9000" "caso3: nivel menor posterior no retrocede"

echo "— CASO 4: varias tarjetas por payload"
atxn '[{"question_key":"q-ccccccccccccccc4","level":1,"due":2000,"client_updated_at":100},{"question_key":"q-ccccccccccccccaa","level":4,"due":9500,"client_updated_at":400}]' >/dev/null
check "$(sql "select level||','||due from srs_cards where question_key='$K3';")" "1,2000" "caso4a"
check "$(sql "select level||','||due from srs_cards where question_key='$K1';")" "4,9500" "caso4b"

echo "— CASO 5: desempates"
atxn '[{"question_key":"q-ccccccccccccccbb","level":3,"due":7000,"client_updated_at":500}]' >/dev/null
check "$(sql "select client_updated_at from srs_cards where question_key='$K2';")" "500" "caso5a: ts mayor gana"
atxn '[{"question_key":"q-ccccccccccccccbb","level":3,"due":7000,"client_updated_at":500}]' >/dev/null
check "$(sql "select client_updated_at from srs_cards where question_key='$K2';")" "500" "caso5b: empate conserva"
atxn '[{"question_key":"q-ccccccccccccccbb","level":3,"due":8000,"client_updated_at":100}]' >/dev/null
check "$(sql "select due from srs_cards where question_key='$K2';")" "8000" "caso5c: due mayor gana con ts menor"

echo "— CASO 6: idempotencia"
atxn '[{"question_key":"q-ccccccccccccccaa","level":4,"due":9500,"client_updated_at":400}]' >/dev/null
B6=$(sql "select level||','||due||','||client_updated_at from srs_cards where question_key='$K1';")
atxn '[{"question_key":"q-ccccccccccccccaa","level":4,"due":9500,"client_updated_at":400}]' >/dev/null
check "$(sql "select level||','||due||','||client_updated_at from srs_cards where question_key='$K1';")" "$B6" "caso6: estable"

echo "— CASO 7: propietario = auth.uid()"
check "$(sql "select count(*) from srs_cards where question_key like 'q-cccc%' and user_id<>'$UID_A';")" "0" "caso7"

echo "— CASO 8: lote con inválidos"
# solo se compara el JSON de la última línea (la RPC devuelve un único objeto JSON)
OUT8=$(atxn '[{"question_key":"bad-key","level":1,"due":1000,"client_updated_at":1},{"question_key":"q-ccccccccccccccc4","level":9,"due":1000,"client_updated_at":1},{"question_key":"q-ccccccccccccccaa","level":5,"due":9800,"client_updated_at":450}]' | tr -d ' ' | tail -1)
check "$OUT8" '{"applied":1,"invalid":2}' "caso8: resultado parcial documentado"
check "$(sql "select level from srs_cards where question_key='$K1';")" "5" "caso8b"
check "$(sql "select count(*) from srs_cards where question_key='bad-key';")" "0" "caso8c"

echo
echo "— RESUMEN: OK=$PASS FAIL=$FAIL"
[[ $FAIL -eq 0 ]] || exit 1
exit 0

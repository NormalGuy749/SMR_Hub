#!/usr/bin/env bash
# Prueba merge_srs_cards en PostgreSQL local, no en un mock.
# Aplica idempotentemente la migración 00008 al contenedor indicado antes
# de probar; no utiliza el proyecto remoto.
# deleted_at lo sella el servidor y solo revived=true lo limpia.
# El CHECK rechaza niveles negativos; auth.uid() y RLS atribuyen cada fila.
set -u
DB_CONTAINER="supabase_db_scratch_84val"
[[ "$(docker ps --format '{{.Names}}' | grep -c "^${DB_CONTAINER}$")" == "1" ]] || { echo "FALLO: contenedor no activo" >&2; exit 2; }

UID_A='11111111-1111-1111-1111-111111111111'
UID_B='22222222-2222-2222-2222-222222222222'
K1='q-ccccccccccccccaa'
K2='q-ccccccccccccccbb'
K3='q-ccccccccccccccc4'
PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1 → $2"; }
check() { if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3" "esperado [$1] hay [$2]"; fi; }

sql() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt -c "$1"; }
# última línea no vacía (para sentencias con set_config, que también devuelven fila)
sql_last() { sql "$1" | grep -v '^$' | tail -1; }
# sentencia que DEBE fallar (para el CHECK); devuelve stderr
sql_expect_fail() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -qAt -c "$1" 2>&1; }

cleanup() {
  docker exec "$DB_CONTAINER" psql -U postgres -d postgres -q -c \
    "delete from srs_cards where user_id in ('$UID_A','$UID_B');" 2>/dev/null
  docker exec "$DB_CONTAINER" psql -U postgres -d postgres -q -c \
    "delete from auth.users where id in ('$UID_A','$UID_B');" 2>/dev/null
}
cleanup
trap cleanup EXIT

for u in "$UID_A:pgtest-a@local.test" "$UID_B:pgtest-b@local.test"; do
  U="${u%%:*}"; E="${u##*:}"
  sql "insert into auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,aud,role) values ('$U','$E','x',now(),now(),now(),'{}','{}','authenticated','authenticated') on conflict (id) do nothing;" >/dev/null
done
[[ "$(sql "select count(*) from auth.users where id in ('$UID_A','$UID_B');")" == "2" ]] || { echo "FALLO: usuarios de prueba no creados" >&2; exit 3; }

# migración 00008 en la BD LOCAL (no remota)
docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/migrations/00008_srs_delete_tombstones.sql >/dev/null || { echo "FALLO: no se pudo aplicar 00008 local" >&2; exit 4; }
check "$(sql "select count(*) from information_schema.columns where table_name='srs_cards' and column_name='deleted_at';")" "1" "00008 aplicada local: columna deleted_at presente"

# helper: merge como usuario autenticado (RLS + auth.uid() reales)
merge() { # $1 = uid, $2 = jsonb de tarjetas
  sql "begin; select set_config('role','authenticated',true); select set_config('request.jwt.claims','{\"sub\":\"$1\",\"role\":\"authenticated\"}',true); select public.merge_srs_cards('$2'::jsonb); commit;"
}

echo "— CASO 1: el CHECK existente rechaza el sentinel level = -1 (evidencia del descarte)"
OUT="$(sql_expect_fail "insert into srs_cards (user_id, question_key, level, due) values ('$UID_A','$K3',-1,5000);")"
if [[ "$OUT" == *srs_cards_level_range* ]]; then ok "level = -1 viola srs_cards_level_range (sentinel inviable)"; else bad "CHECK level" "$OUT"; fi

echo "— CASO 2: tombstone se inserta y sobrevive a pushes vivos (pegajoso)"
merge "$UID_A" "[{\"question_key\":\"$K1\",\"deleted\":true}]" >/dev/null
check "$(sql "select (deleted_at is not null)::int from srs_cards where user_id='$UID_A' and question_key='$K1';")" "1" "tombstone en clave sin fila previa: deleted_at no nulo"
merge "$UID_A" "[{\"question_key\":\"$K1\",\"level\":5,\"due\":999999999,\"client_updated_at\":99999}]" >/dev/null
check "$(sql "select (deleted_at is not null)::int from srs_cards where user_id='$UID_A' and question_key='$K1';")" "1" "tarjeta viva entrante NO resucita (deleted_at sigue puesto)"
merge "$UID_A" "[{\"question_key\":\"$K1\",\"level\":1,\"due\":1000,\"client_updated_at\":1}]" >/dev/null
check "$(sql "select (deleted_at is not null)::int from srs_cards where user_id='$UID_A' and question_key='$K1';")" "1" "push obsoleto tampoco resucita"

echo "— CASO 3: revive explícito es lo único que limpia deleted_at"
merge "$UID_A" "[{\"question_key\":\"$K1\",\"level\":2,\"due\":800000,\"client_updated_at\":555,\"revived\":true}]" >/dev/null
check "$(sql "select coalesce((deleted_at is null)::int,0) from srs_cards where user_id='$UID_A' and question_key='$K1';")" "1" "revived=true limpia el tombstone"
# El tombstone conserva {level,due} de la última tarjeta real (los pushes
# obsoletos del CASO 2 dejaron level 5) y la política de nivel mayor de
# 00007 sigue vigente tras el revive: revive = la tarjeta vuelve a estar
# viva, no un reinicio de nivel (documentado como limitación de política).
check "$(sql "select level from srs_cards where user_id='$UID_A' and question_key='$K1';")" "5" "revive deja la fila viva con la política de nivel mayor (level 5)"
merge "$UID_A" "[{\"question_key\":\"$K1\",\"deleted\":true}]" >/dev/null
check "$(sql "select (deleted_at is not null)::int from srs_cards where user_id='$UID_A' and question_key='$K1';")" "1" "re-borrado posterior vuelve a marcar"

echo "— CASO 4: idempotencia del tombstone y sello del servidor"
D1="$(sql "select deleted_at from srs_cards where user_id='$UID_A' and question_key='$K1';")"
merge "$UID_A" "[{\"question_key\":\"$K1\",\"deleted\":true}]" >/dev/null
D2="$(sql "select deleted_at from srs_cards where user_id='$UID_A' and question_key='$K1';")"
[[ "$D2" -ge "$D1" ]] && ok "tombstone repetido no retrocede deleted_at ($D1 → $D2)" || bad "deleted_at monótono" "$D1 -> $D2"
check "$(sql "select count(*) from srs_cards where user_id='$UID_A' and question_key='$K1';")" "1" "el tombstone no duplica fila (PK user_id,question_key)"

echo "— CASO 5: validación server-side del tombstone"
R="$(merge "$UID_A" "[{\"question_key\":\"t-1:0\",\"deleted\":true},{\"question_key\":\"$K2\",\"deleted\":true}]")"
check "$(sql "select count(*) from srs_cards where user_id='$UID_A' and question_key='$K2';")" "1" "tombstone con clave válida aplicado"
check "$(sql "select count(*) from srs_cards where user_id='$UID_A' and question_key='t-1:0';")" "0" "tombstone con clave posicional rechazado (no se cuela por 'deleted')"
if [[ "$R" == *'"invalid": 1'* ]]; then ok "respuesta estructurada: invalid=1"; else bad "invalid esperado 1" "$R"; fi

echo "— CASO 6: aislamiento por propietario (RLS + auth.uid())"
merge "$UID_B" "[{\"question_key\":\"$K3\",\"level\":3,\"due\":500000,\"client_updated_at\":10}]" >/dev/null
check "$(sql "select count(*) from srs_cards where user_id='$UID_B' and question_key='$K3';")" "1" "tarjeta de B creada"
check "$(sql "select (deleted_at is not null)::int from srs_cards where user_id='$UID_B' and question_key='$K3';")" "0" "el borrado de A en la misma clave no afecta a B"
check "$(sql_last "begin; select set_config('role','authenticated',true); select set_config('request.jwt.claims','{\"sub\":\"$UID_B\",\"role\":\"authenticated\"}',true); select count(*) from srs_cards where user_id='$UID_A'; commit;")" "0" "B no ve filas de A (RLS)"

echo "— CASO 7: sin sesión no hay efecto (auth required)"
OUT="$(sql "select public.merge_srs_cards('[{\"question_key\":\"$K2\",\"deleted\":true}]'::jsonb);" 2>&1)"
if [[ "$OUT" == *"auth required"* ]]; then ok "sin JWT: auth required (42501)"; else bad "auth required" "$OUT"; fi

echo "— CASO 8: el tombstone no daña otras claves (vivas)"
check "$(sql "select count(*) from srs_cards where user_id='$UID_B' and deleted_at is null;")" "1" "la tarjeta viva de B sigue viva"

echo
echo "── resumen ──"
echo "OK: $PASS   FAIL: $FAIL"
[[ "$FAIL" == "0" ]]

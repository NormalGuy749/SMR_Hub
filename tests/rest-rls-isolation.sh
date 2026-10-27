#!/usr/bin/env bash
# Prueba aislamiento, permisos y RPC por la API real de PostgreSQL,
# PostgREST y GoTrue del stack local ya activo. Los JWT authenticated
# son reales; no hay mocks. Usa cloud-config.js de desarrollo, que debe
# apuntar al stack local; el script no valida que el destino sea loopback.
# El harness crea y borra únicamente sus usuarios *@local.test y sus filas.
# auth.uid() debe atribuir las escrituras y el servidor sellar updated_at;
# el cliente no puede elegir otro dueño ni modificar datos ajenos.
set -u

FAIL=0; PASS=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1 → $2"; }
check() { if [[ "$1" == "$2" ]]; then ok "$3"; else bad "$3" "real [$1] esperado [$2]"; fi; }

# --- localizar el stack y la configuración pública del cliente ---
CFG="js/cloud-config.js"
[[ -f "$CFG" ]] || { echo "FALLO: falta $CFG" >&2; exit 3; }
read -r BASE KEY < <(node -e '
  const fs=require("fs");
  const s=fs.readFileSync("js/cloud-config.js","utf8");
  const u=/SMR_SUPABASE_URL\s*=\s*[\x27"]([^\x27"]+)/.exec(s);
  const k=/SMR_SUPABASE_ANON_KEY\s*=\s*[\x27"]([^\x27"]+)/.exec(s);
  if(!u||!k){console.error("config sin URL/clave");process.exit(1)}
  process.stdout.write(u[1]+" "+k[1]);
')
[[ -n "$BASE" && -n "$KEY" ]] || { echo "FALLO: no se pudo leer la configuración pública" >&2; exit 3; }
echo "endpoint: $BASE  (clave pública leída de $CFG; no se imprime)"

curl -s -o /dev/null --max-time 8 "$BASE/auth/v1/health" || { echo "FALLO: el stack local no responde (¿Supabase local levantado?)" >&2; exit 2; }
command -v docker >/dev/null 2>&1 || { echo "FALLO: docker no disponible (hace falta para leer el POST de PostgREST/logs)" >&2; exit 2; }
DB_CONTAINER="supabase_db_scratch_84val"
[[ "$(docker ps --format '{{.Names}}' | grep -c "^${DB_CONTAINER}$")" == "1" ]] || { echo "FALLO: contenedor $DB_CONTAINER no activo" >&2; exit 2; }

PW='rls-probe-pw-1'
EMAIL_A='rls-probe-a@local.test'
EMAIL_B='rls-probe-b@local.test'
UID_A=''; UID_B=''; TOK_A=''; TOK_B=''
# Usuarios SOLO para los límites de frecuencia: consumen su cuota, así que
# no se reutilizan para las comprobaciones de aislamiento.
EMAIL_C='rls-probe-c@local.test'; EMAIL_D='rls-probe-d@local.test'
UID_C=''; UID_D=''; TOK_C=''; TOK_D=''
K_A='q-00000000000000a1'; K_B='q-00000000000000b1'; K_X='q-00000000000000c1'

sql() { docker exec "$DB_CONTAINER" psql -U postgres -d postgres -qAt -c "$1"; }
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j;try{j=JSON.parse(s)}catch(e){console.log("") ;return}
  const p=process.argv.slice(1);let v=j;for(const k of p){v=v==null?null:v[k]}console.log(v==null?"":(typeof v==="object"?JSON.stringify(v):String(v)))})' "$@"; }

login() { # $1 = email → imprime "uid token"
  local email="$1" resp
  resp=$(curl -s -X POST "$BASE/auth/v1/signup" -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$PW\"}" --max-time 10)
  if [[ "$(echo "$resp" | json user id)" == "" ]]; then
    resp=$(curl -s -X POST "$BASE/auth/v1/token?grant_type=password" -H "apikey: $KEY" -H "Content-Type: application/json" \
      -d "{\"email\":\"$email\",\"password\":\"$PW\"}" --max-time 10)
  fi
  echo "$(echo "$resp" | json user id) $(echo "$resp" | json access_token)"
}

# --- API helpers: devuelven "status<TAB>cuerpo" ---
req() { # $1=method $2=path $3=token(optional) $4=body(optional) $5=extra header(optional)
  # Nota: el array va en su propia sentencia; dentro de un `local` multi-asignación
  # el shell expande "$m" ANTES de asignarlo (con set -u: unbound variable).
  local m="$1" p="$2" t="${3:-}" b="${4:-}" extra="${5:-}"
  local args=(-s -o /tmp/rls_body -w '%{http_code}' -X "$m" "$BASE/rest/v1$p" -H "apikey: $KEY" --max-time 15)
  [[ -n "$t" ]] && args+=(-H "Authorization: Bearer $t")
  [[ -n "$extra" ]] && args+=(-H "$extra")
  [[ -n "$b" ]] && args+=(-H 'Content-Type: application/json' -d "$b")
  local code; code=$(curl "${args[@]}")
  printf '%s\t%s' "$code" "$(cat /tmp/rls_body)"
}
status_of() { echo "${1%%$'\t'*}"; }
body_of()   { echo "${1#*$'\t'}"; }
rows()      { body_of "$1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(Array.isArray(j)?j.length:0)}catch(e){console.log(0)}})'; }

cleanup() {
  # Solo los fixtures de este harness: filas propias por REST y luego los usuarios.
  # Las 17 tablas tienen FK user_id → auth.users ON DELETE CASCADE, así que borrar
  # los usuarios de prueba ya elimina sus filas; este barrido es cinturón y tirantes.
  for t in profiles student_settings resource_state test_scores test_attempts wrong_answer_events wrong_answers srs_cards case_solutions streak_days study_sessions activity_events favorites feedback question_reports entitlements progress_sync_chunks; do
    [[ -n "$TOK_A" ]] && curl -s -o /dev/null -X DELETE "$BASE/rest/v1/$t?user_id=eq.$UID_A" -H "apikey: $KEY" -H "Authorization: Bearer $TOK_A" --max-time 10
    [[ -n "$TOK_B" ]] && curl -s -o /dev/null -X DELETE "$BASE/rest/v1/$t?user_id=eq.$UID_B" -H "apikey: $KEY" -H "Authorization: Bearer $TOK_B" --max-time 10
  done
  # feedback/question_reports no tienen DELETE para el cliente (00009): sus
  # filas desaparecen por la FK en cascada al borrar los usuarios de prueba.
  [[ -n "$UID_A$UID_B$UID_C$UID_D" ]] && sql "delete from auth.users where email in ('$EMAIL_A','$EMAIL_B','$EMAIL_C','$EMAIL_D');" >/dev/null 2>&1
}
trap cleanup EXIT

echo "— preparación: dos usuarios reales con JWT real"
read -r UID_A TOK_A < <(login "$EMAIL_A")
read -r UID_B TOK_B < <(login "$EMAIL_B")
[[ -n "$UID_A" && -n "$TOK_A" && -n "$UID_B" && -n "$TOK_B" ]] || { echo "FALLO: no se pudieron crear/autenticar los usuarios de prueba" >&2; exit 3; }
[[ "$UID_A" != "$UID_B" ]] || { echo "FALLO: los dos usuarios son el mismo" >&2; exit 3; }
ROLE=$(node -e 'const t=process.argv[1].split(".")[1];console.log(JSON.parse(Buffer.from(t,"base64url").toString()).role)' "$TOK_A")
check "$ROLE" "authenticated" "el JWT emitido por GoTrue tiene role=authenticated"

echo "— semilla: cada usuario escribe SU propia fila por la API (sin privilegios)"
R=$(req POST "/srs_cards" "$TOK_A" "{\"user_id\":\"$UID_A\",\"question_key\":\"$K_A\",\"level\":2,\"due\":5000}")
check "$(status_of "$R")" "201" "A inserta su propia tarjeta SRS (201)"
R=$(req POST "/srs_cards" "$TOK_B" "{\"user_id\":\"$UID_B\",\"question_key\":\"$K_B\",\"level\":4,\"due\":9000}")
check "$(status_of "$R")" "201" "B inserta su propia tarjeta SRS (201)"
R=$(req POST "/profiles" "$TOK_A" "{\"user_id\":\"$UID_A\",\"community\":\"aaa\"}")
check "$(status_of "$R")" "409" "el trigger handle_new_user YA provisionó el perfil: el insert duplicado da 409 (no se puede duplicar)"
R=$(req PATCH "/profiles?user_id=eq.$UID_A" "$TOK_A" "{\"course\":1}" "Prefer: return=representation")
check "$(status_of "$R")" "200" "A actualiza SU perfil (200)"
check "$(rows "$R")" "1" "el UPDATE propio afecta exactamente a su fila"

echo "— 1. LECTURA: A no puede ver filas de B"
R=$(req GET "/srs_cards?select=user_id,question_key" "$TOK_A")
check "$(status_of "$R")" "200" "GET srs_cards como A (200)"
check "$(rows "$R")" "1" "A ve exactamente 1 tarjeta (la suya)"
check "$(body_of "$R" | json 0 user_id)" "$UID_A" "la fila visible es la de A"
R=$(req GET "/srs_cards?select=user_id&user_id=eq.$UID_B" "$TOK_A")
check "$(rows "$R")" "0" "A no puede leer la tarjeta de B ni pidiéndola explícitamente"
R=$(req GET "/profiles?select=user_id&user_id=eq.$UID_B" "$TOK_A")
check "$(rows "$R")" "0" "A no puede leer el perfil de B"
R=$(req GET "/progress_sync_chunks?select=user_id" "$TOK_B")
check "$(rows "$R")" "0" "B no ve el libro de idempotencia (vacío para ambos todavía)"

echo "— 2. INSERCIÓN con un UID ajeno: bloqueada por RLS (no un warning)"
BEFORE=$(sql "select count(*) from public.srs_cards where user_id='$UID_B';")
R=$(req POST "/srs_cards" "$TOK_A" "{\"user_id\":\"$UID_B\",\"question_key\":\"$K_X\",\"level\":5,\"due\":1}")
S=$(status_of "$R")
if [[ "$S" == "401" || "$S" == "403" ]]; then ok "A no puede insertar una fila de B (HTTP $S: RLS)"; else bad "insert cruzado" "HTTP $S cuerpo $(body_of "$R" | head -c 160)"; fi
check "$(sql "select count(*) from public.srs_cards where user_id='$UID_B';")" "$BEFORE" "B no gana ninguna fila por el intento de A"
check "$(sql "select count(*) from public.srs_cards where question_key='$K_X';")" "0" "la fila del intento no existe en la base"

echo "— 3. UPDATE de user_id: bloqueado"
R=$(req PATCH "/srs_cards?user_id=eq.$UID_A" "$TOK_A" "{\"user_id\":\"$UID_B\"}")
S=$(status_of "$R")
if [[ "$S" == "401" || "$S" == "403" ]]; then ok "A no puede reasignar su fila a B (HTTP $S: WITH CHECK)"; else bad "update user_id" "HTTP $S cuerpo $(body_of "$R" | head -c 160)"; fi
check "$(sql "select user_id from public.srs_cards where question_key='$K_A';")" "$UID_A" "la fila de A sigue siendo de A"

echo "— 4. UPDATE / DELETE de filas ajenas: sin efecto"
R=$(req PATCH "/srs_cards?user_id=eq.$UID_B" "$TOK_A" "{\"level\":0,\"due\":1}" "Prefer: return=representation")
check "$(status_of "$R")" "200" "PATCH de A sobre la fila de B no da error (RLS filtra)"
check "$(body_of "$R" | tr -d ' ')" "[]" "PATCH cruzado afecta a 0 filas (representación vacía)"
R=$(req DELETE "/srs_cards?user_id=eq.$UID_B" "$TOK_A" "" "Prefer: return=representation")
check "$(status_of "$R")" "200" "DELETE de A sobre la fila de B no da error"
check "$(body_of "$R" | tr -d ' ')" "[]" "DELETE cruzado afecta a 0 filas (representación vacía)"
check "$(sql "select level from public.srs_cards where user_id='$UID_B' and question_key='$K_B';")" "4" "la tarjeta de B conserva su nivel"

echo "— 5. anon (solo clave pública): ciego"
R=$(req GET "/srs_cards?select=user_id" "")
check "$(status_of "$R")" "200" "GET como anon (200)"
check "$(rows "$R")" "0" "anon no ve ninguna fila"
check "$(body_of "$R" | tr -d ' ')" "[]" "la respuesta de anon es el conjunto vacío (RLS, no datos)"
R=$(req POST "/srs_cards" "" "{\"user_id\":\"$UID_A\",\"question_key\":\"q-rls00000000d001\",\"level\":1,\"due\":1}")
S=$(status_of "$R")
if [[ "$S" == "401" || "$S" == "403" ]]; then ok "anon no puede insertar (HTTP $S)"; else bad "insert anon" "HTTP $S cuerpo $(body_of "$R" | head -c 160)"; fi

echo "— 6. RPC por la API real: identidad = auth.uid(), no el payload"
R=$(req POST "/rpc/merge_srs_cards" "$TOK_A" "{\"p_cards\":[{\"question_key\":\"$K_A\",\"level\":3,\"due\":9000,\"client_updated_at\":100}]}")
check "$(status_of "$R")" "200" "merge_srs_cards invocable por un JWT authenticated real (sin PGRST202)"
check "$(body_of "$R" | json applied)" "1" "merge_srs_cards aplica 1 tarjeta"
check "$(sql "select level from public.srs_cards where user_id='$UID_A' and question_key='$K_A';")" "3" "la tarjeta de A se actualiza"
R=$(req POST "/rpc/merge_srs_cards" "$TOK_A" "{\"p_cards\":[{\"question_key\":\"$K_B\",\"level\":5,\"due\":999999,\"client_updated_at\":99999}]}")
check "$(sql "select level from public.srs_cards where user_id='$UID_B' and question_key='$K_B';")" "4" "A no puede tocar la tarjeta de B enviando su clave por la RPC"
# La identidad de pregunta puede coincidir entre usuarios; sus filas no.
# El intento de A no debe modificar la copia de B.
check "$(sql "select count(*) from public.srs_cards where user_id='$UID_A' and question_key='$K_B';")" "1" "el intento de A crea SU propia tarjeta para esa clave (uid = auth.uid())"
check "$(sql "select count(*) from public.srs_cards where user_id='$UID_B' and question_key='$K_B';")" "1" "B conserva exactamente una tarjeta para esa clave"
check "$(sql "select count(distinct user_id) from public.srs_cards where question_key='$K_B';")" "2" "existen dos copias independientes (una por uid), sin mezclarse"
R=$(req POST "/rpc/merge_srs_cards" "" "{\"p_cards\":[{\"question_key\":\"$K_A\",\"level\":5}]}")
S=$(status_of "$R")
if [[ "$S" == "401" || "$S" == "403" ]]; then ok "anon no puede invocar merge_srs_cards (HTTP $S)"; else bad "rpc anon" "HTTP $S cuerpo $(body_of "$R" | head -c 160)"; fi

echo "— 7. sync_progress_chunk: escribe con auth.uid() y su libro no se puede manipular"
R=$(req POST "/rpc/sync_progress_chunk" "$TOK_A" "{\"p_chunk_id\":\"rls-probe-chunk-1\",\"p_table\":\"test_attempts\",\"p_events\":[{\"test_id\":\"t-rls\",\"mode\":\"test\",\"correct\":1,\"total\":2,\"pct\":50,\"created_at\":111,\"user_id\":\"$UID_B\"}],\"p_first_created_at\":111,\"p_last_created_at\":111}") # el user_id del payload debe ser IGNORADO
check "$(status_of "$R")" "200" "sync_progress_chunk invocable por un usuario authenticated"
check "$(sql "select count(*) from public.test_attempts where user_id='$UID_B';")" "0" "el user_id del payload se IGNORA: nada se atribuye a B"
check "$(sql "select count(*) from public.test_attempts where user_id='$UID_A' and created_at=111;")" "1" "el evento queda con el uid de A (auth.uid())"
check "$(sql "select user_id from public.progress_sync_chunks where chunk_id='rls-probe-chunk-1';")" "$UID_A" "el libro de idempotencia registra a A"
R=$(req PATCH "/progress_sync_chunks?user_id=eq.$UID_A" "$TOK_A" "{\"event_count\":9999}")
check "$(rows "$R")" "0" "A no puede editar el libro de idempotencia (sin policy UPDATE)"
R=$(req GET "/progress_sync_chunks?select=user_id" "$TOK_B")
check "$(rows "$R")" "0" "B no ve el libro de A"
R=$(req POST "/rpc/sync_progress_chunk" "" "{\"p_chunk_id\":\"rls-probe-chunk-2\",\"p_table\":\"test_attempts\",\"p_events\":[],\"p_first_created_at\":1,\"p_last_created_at\":1}")
S=$(status_of "$R")
if [[ "$S" == "401" || "$S" == "403" ]]; then ok "anon no puede invocar sync_progress_chunk (HTTP $S)"; else bad "rpc anon chunk" "HTTP $S cuerpo $(body_of "$R" | head -c 160)"; fi

echo "— 8. updated_at lo sella el servidor (el cliente no puede forjar el LWW)"
sql "update public.srs_cards set updated_at = 1 where user_id='$UID_A' and question_key='$K_A';" >/dev/null
R=$(req PATCH "/srs_cards?user_id=eq.$UID_A&question_key=eq.$K_A" "$TOK_A" "{\"level\":4,\"client_updated_at\":1,\"updated_at\":1}" "Prefer: return=representation")
check "$(status_of "$R")" "200" "A actualiza su tarjeta (200)"
check "$(rows "$R")" "1" "el UPDATE propio sí afecta a su fila (control positivo)"
UPD=$(sql "select (updated_at > 1000000000000)::int from public.srs_cards where user_id='$UID_A' and question_key='$K_A';")
check "$UPD" "1" "el trigger sobrescribe el updated_at enviado por el cliente"echo "— 9. Barrido por tabla: aislamiento de lectura en las 17 tablas de datos de usuario"
# Cuenta filas cuyo user_id no es el esperado (el control de la fuga).
count_foreign() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let j=[];try{j=JSON.parse(s)}catch(e){j=[]};if(!Array.isArray(j))j=[];console.log(j.filter(r=>r.user_id!==process.argv[1]).length)})' "$1"; }
seed_row() { # $1=tabla $2=token $3=uid ; payload con las columnas NOT NULL sin default
  local T="$1" TOK="$2" U="$3" JSON="" SHORT="${3:0:2}"
  case "$T" in
    profiles)            JSON="{\"user_id\":\"$U\"}" ;;
    student_settings)    JSON="{\"user_id\":\"$U\"}" ;;
    resource_state)      JSON="{\"user_id\":\"$U\",\"resource_id\":\"r-$SHORT\"}" ;;
    test_scores)         JSON="{\"user_id\":\"$U\",\"test_id\":\"t-$SHORT\"}" ;;
    case_solutions)      JSON="{\"user_id\":\"$U\",\"case_id\":\"c-$SHORT\",\"option\":\"a\"}" ;;
    favorites)           JSON="{\"user_id\":\"$U\",\"kind\":\"recurso\",\"item_id\":\"i-$SHORT\",\"created_at\":1}" ;;
    streak_days)         JSON="{\"user_id\":\"$U\",\"day\":\"2026-01-01\"}" ;;
    wrong_answers)       JSON="{\"user_id\":\"$U\",\"test_id\":\"t-$SHORT\",\"question_key\":\"q-00000000000000$SHORT\"}" ;;
    test_attempts)       JSON="{\"user_id\":\"$U\",\"test_id\":\"t-$SHORT\",\"mode\":\"test\",\"correct\":1,\"total\":2,\"pct\":50,\"created_at\":1}" ;;
    study_sessions)      JSON="{\"user_id\":\"$U\",\"minutes\":10,\"steps\":1,\"created_at\":1}" ;;
    activity_events)     JSON="{\"user_id\":\"$U\",\"event_type\":\"study\",\"label\":\"l-$SHORT\",\"created_at\":1}" ;;
    wrong_answer_events) JSON="{\"user_id\":\"$U\",\"test_id\":\"t-$SHORT\",\"question_key\":\"q-00000000000000$SHORT\",\"event_type\":\"add\",\"count_delta\":1}" ;;
    feedback)            JSON="{\"user_id\":\"$U\",\"category\":\"x\",\"message\":\"m\"}" ;;
    question_reports)    JSON="{\"user_id\":\"$U\",\"test_id\":\"t-$SHORT\",\"question_key\":\"q-00000000000000$SHORT\",\"reason\":\"r\"}" ;;
    *)                   JSON="" ;;
  esac
  [[ -n "$JSON" ]] || return 0
  local R S; R=$(req POST "/$T" "$TOK" "$JSON"); S=$(status_of "$R")
  # 201 = creada, 409 = ya existía (perfil auto-provisionado, semilla previa)
  [[ "$S" == "201" || "$S" == "409" ]] || bad "semilla $T" "HTTP $S $(body_of "$R" | head -c 70)" "201/409"
}

LOOP_TABLES="profiles student_settings resource_state test_scores test_attempts wrong_answer_events wrong_answers srs_cards case_solutions streak_days study_sessions activity_events favorites feedback question_reports entitlements progress_sync_chunks"
rpc() { req POST "/rpc/$1" "$2" "$3"; }
for t in $LOOP_TABLES; do
  case "$t" in
    # 00009: feedback y question_reports ya NO aceptan INSERT directo; su
    # semilla va por la RPC real, que es la única puerta de escritura.
    feedback)
      check "$(status_of "$(rpc submit_feedback "$TOK_A" "{\"p_category\":\"otro\",\"p_message\":\"semilla A\"}")")" "200" "semilla feedback de A por RPC (200)"
      check "$(status_of "$(rpc submit_feedback "$TOK_B" "{\"p_category\":\"otro\",\"p_message\":\"semilla B\"}")")" "200" "semilla feedback de B por RPC (200)" ;;
    question_reports)
      check "$(status_of "$(rpc submit_question_report "$TOK_A" "{\"p_test_id\":\"t-redes\",\"p_question_key\":\"$K_A\",\"p_reason\":\"otro\"}")")" "200" "semilla de aviso de A por RPC (200)"
      check "$(status_of "$(rpc submit_question_report "$TOK_B" "{\"p_test_id\":\"t-redes\",\"p_question_key\":\"$K_B\",\"p_reason\":\"otro\"}")")" "200" "semilla de aviso de B por RPC (200)" ;;
    *)
      seed_row "$t" "$TOK_A" "$UID_A"
      seed_row "$t" "$TOK_B" "$UID_B" ;;
  esac
done
# El libro de idempotencia no se siembra por REST (sin policy de INSERT directa
# utilizable aquí): se siembra con la RPC real de cada usuario.
R=$(req POST "/rpc/sync_progress_chunk" "$TOK_B" "{\"p_chunk_id\":\"rls-probe-b-1\",\"p_table\":\"test_attempts\",\"p_events\":[],\"p_first_created_at\":1,\"p_last_created_at\":1}")
check "$(status_of "$R")" "200" "la RPC de chunks funciona también para B (200)"

for t in $LOOP_TABLES; do
  RA=$(req GET "/$t?select=user_id" "$TOK_A")
  RB=$(req GET "/$t?select=user_id" "$TOK_B")
  check "$(count_foreign "$UID_A" <<<"$(body_of "$RA")")" "0" "$t: el SELECT de A no devuelve ninguna fila ajena"
  check "$(count_foreign "$UID_B" <<<"$(body_of "$RB")")" "0" "$t: el SELECT de B no devuelve ninguna fila de A"
  check "$(rows "$(req GET "/$t?select=user_id&user_id=eq.$UID_B" "$TOK_A")")" "0" "$t: A pidiendo explícitamente las filas de B obtiene 0"
  case "$t" in
    entitlements) EXPECT_B="0" ;;   # SELECT-only: nadie la escribe desde el cliente
    *)            EXPECT_B="1" ;;   # control positivo: B sí ve lo suyo
  esac
  check "$(rows "$RB")" "$EXPECT_B" "$t: B ve $EXPECT_B fila(s) propia(s)"
done

echo "— 10. Fase 8.8: comentarios y avisos SOLO por RPC, con validación en servidor"
# (a) comentario válido de A
# El texto va con escape \u00e1 a propósito: prueba la ruta UTF-8 real sin
# depender de la codificación de la consola (Git Bash en Windows envía el
# acento literal como bytes no válidos y PostgREST lo rechaza como JSON).
R=$(rpc submit_feedback "$TOK_A" "{\"p_category\":\"sugerencia\",\"p_message\":\"Falta un caso pr\\u00e1ctico de subnetting\"}")
check "$(status_of "$R")" "200" "A envía un comentario por la RPC (200)"
# El patrón evita el carácter acentuado (misma razón: argv no es fiable en
# Windows) pero prueba que la palabra llegó completa y con la posición correcta.
check "$(sql "select count(*) from public.feedback where user_id='$UID_A' and message like 'Falta un caso pr_ctico de subnetting';")" "1" "y el servidor guarda el texto UTF-8 íntegro (misma longitud)"
check "$(body_of "$R" | grep -cE '^[0-9]+$')" "1" "la RPC devuelve el id de la fila creada"
check "$(sql "select count(*) from public.feedback where user_id='$UID_A' and processing_status='received';")" "2" "el estado lo sella el servidor ('received') en todas las filas de A"
# La marca del cliente es solo diagnóstica: se guarda si es plausible y se
# DESCARTA si es futura (no puede envenenar el campo).
FUTURE=$(( $(date +%s) * 1000 + 3600000 ))
R=$(rpc submit_feedback "$TOK_A" "{\"p_category\":\"otro\",\"p_message\":\"con marca\",\"p_client_created_at\":1234567890}")
check "$(status_of "$R")" "200" "comentario con marca de cliente plausible (200)"
check "$(sql "select count(*) from public.feedback where user_id='$UID_A' and client_created_at=1234567890;")" "1" "la marca plausible se guarda solo como diagnóstico"
R=$(rpc submit_feedback "$TOK_A" "{\"p_category\":\"otro\",\"p_message\":\"futura\",\"p_client_created_at\":$FUTURE}")
check "$(status_of "$R")" "200" "comentario con marca futura (200)"
check "$(sql "select count(*) from public.feedback where user_id='$UID_A' and message='futura' and client_created_at is null;")" "1" "una marca futura se descarta (el diagnóstico no acepta relojes adelantados)"
check "$(rows "$(req GET "/feedback?select=id,category" "$TOK_B")")" "1" "B solo ve SU comentario, no el de A"
# (b) ni el estado de tramitación ni el uid son parámetros del cliente
R=$(rpc submit_feedback "$TOK_A" "{\"p_category\":\"otro\",\"p_message\":\"x\",\"p_processing_status\":\"processed\"}")
check "$(status_of "$R")" "404" "no existe parámetro para processing_status (404: la firma no coincide)"
R=$(rpc submit_feedback "$TOK_A" "{\"p_category\":\"otro\",\"p_message\":\"x\",\"p_user_id\":\"$UID_B\"}")
check "$(status_of "$R")" "404" "no existe parámetro user_id: no se puede atribuir a B (404)"
# (c) la tabla ya no acepta INSERT directo
BEFORE=$(sql "select count(*) from public.feedback;")
R=$(req POST "/feedback" "$TOK_A" "{\"user_id\":\"$UID_A\",\"category\":\"otro\",\"message\":\"directo\"}")
if [[ "$(status_of "$R")" == "401" || "$(status_of "$R")" == "403" ]] && [[ "$(body_of "$R")" == *"row-level security"* ]]; then
  ok "INSERT directo en feedback rechazado (RLS, $(status_of "$R"))"; else bad "INSERT directo feedback" "$(status_of "$R") $(body_of "$R" | head -c 90)" "401/403 row-level security"; fi
R=$(req POST "/question_reports" "$TOK_A" "{\"user_id\":\"$UID_A\",\"test_id\":\"t-redes\",\"question_key\":\"$K_A\",\"reason\":\"otro\"}")
if [[ "$(status_of "$R")" == "401" || "$(status_of "$R")" == "403" ]] && [[ "$(body_of "$R")" == *"row-level security"* ]]; then
  ok "INSERT directo en question_reports rechazado (RLS, $(status_of "$R"))"; else bad "INSERT directo reports" "$(status_of "$R") $(body_of "$R" | head -c 90)" "401/403 row-level security"; fi
check "$(sql "select count(*) from public.feedback;")" "$BEFORE" "y ninguno de esos intentos escribió una fila"
# (d) anon (solo clave pública) no puede ejecutar ni leer
R=$(rpc submit_feedback "" "{\"p_category\":\"otro\",\"p_message\":\"anon\"}")
if [[ "$(status_of "$R")" == "401" || "$(status_of "$R")" == "403" ]]; then ok "anon NO puede ejecutar submit_feedback ($(status_of "$R"))"; else bad "rpc anon" "$(status_of "$R") $(body_of "$R" | head -c 90)" "401 o 403"; fi
R=$(rpc submit_question_report "" "{\"p_test_id\":\"t-redes\",\"p_question_key\":\"$K_A\",\"p_reason\":\"otro\"}")
if [[ "$(status_of "$R")" == "401" || "$(status_of "$R")" == "403" ]]; then ok "anon NO puede ejecutar submit_question_report ($(status_of "$R"))"; else bad "rpc anon (reports)" "$(status_of "$R") $(body_of "$R" | head -c 90)" "401 o 403"; fi
check "$(rows "$(req GET "/feedback?select=id" "")")" "0" "anon no ve ningún comentario"
# (e) validación real en servidor (el navegador no es la frontera)
LONG=$(printf 'x%.0s' $(seq 1 2001))
for BAD in '{"p_category":"otro","p_message":""}' '{"p_category":"otro","p_message":"   "}' '{"p_category":"otro","p_message":null}' "{\"p_category\":\"otro\",\"p_message\":\"$LONG\"}"; do
  R=$(rpc submit_feedback "$TOK_A" "$BAD")
  if [[ "$(status_of "$R")" == "400" ]] && [[ "$(body_of "$R")" == *"invalid payload"* ]]; then
    ok "rechazado en servidor: $(echo "$BAD" | head -c 54)"; else bad "validación servidor" "$(status_of "$R") $(body_of "$R" | head -c 90)" "400 invalid payload"; fi
done
# (f) aviso de pregunta válido, asociado a la pregunta REAL
R=$(rpc submit_question_report "$TOK_A" "{\"p_test_id\":\"t-redes\",\"p_question_key\":\"$K_A\",\"p_reason\":\"respuesta\",\"p_details\":\"La correcta parece la b\"}")
check "$(status_of "$R")" "200" "A reporta una pregunta real por la RPC (200)"
check "$(sql "select count(*) from public.question_reports where user_id='$UID_A' and test_id='t-redes' and question_key='$K_A' and details='La correcta parece la b' and processing_status='received';")" "1" "el aviso queda asociado a (test_id, question_key) reales y sellado por el servidor"
check "$(rows "$(req GET "/question_reports?select=test_id,question_key" "$TOK_B")")" "1" "B solo ve SU aviso"
check "$(rows "$(req GET "/question_reports?select=id&user_id=eq.$UID_A" "$TOK_B")")" "0" "B no ve el aviso de A ni pidiéndolo explícitamente"
for BAD in '{"p_test_id":"t-redes","p_question_key":"t-redes:0","p_reason":"otro"}' "{\"p_test_id\":\"t-redes\",\"p_question_key\":\"$K_A\",\"p_reason\":\"\"}" '{"p_test_id":"t redes","p_question_key":"'"$K_A"'","p_reason":"otro"}' '{"p_test_id":"t-redes","p_question_key":"q-0123456789ABCDEF","p_reason":"otro"}'; do
  R=$(rpc submit_question_report "$TOK_A" "$BAD")
  if [[ "$(status_of "$R")" == "400" ]] && [[ "$(body_of "$R")" == *"invalid payload"* ]]; then
    ok "aviso inválido rechazado en servidor: $(echo "$BAD" | head -c 60)"; else bad "validación aviso" "$(status_of "$R") $(body_of "$R" | head -c 90)" "400 invalid payload"; fi
done
check "$(sql "select count(*) from public.question_reports where user_id='$UID_A';")" "2" "solo quedaron los avisos válidos de A (semilla + este)"

echo "— 11. Límite de frecuencia real (ventana de 1 h) y peticiones simultáneas"
read -r UID_C TOK_C < <(login "$EMAIL_C")
read -r UID_D TOK_D < <(login "$EMAIL_D")
[[ -n "$UID_C" && -n "$TOK_C" && -n "$UID_D" && -n "$TOK_D" ]] || { echo "FALLO: no se pudieron crear los usuarios de cuota" >&2; exit 3; }
for i in 1 2 3 4 5; do
  R=$(rpc submit_feedback "$TOK_C" "{\"p_category\":\"otro\",\"p_message\":\"comentario $i\"}")
  check "$(status_of "$R")" "200" "C: comentario $i dentro del límite (200)"
done
R=$(rpc submit_feedback "$TOK_C" "{\"p_category\":\"otro\",\"p_message\":\"sexto\"}")
check "$(status_of "$R")" "400" "C: el 6º comentario de la hora se rechaza (400)"
check "$(body_of "$R" | grep -c 'rate limit exceeded')" "1" "y el motivo es 'rate limit exceeded' (P0001, no un error genérico)"
check "$(sql "select count(*) from public.feedback where user_id='$UID_C';")" "5" "el rechazo no dejó ninguna fila escrita"
# La cuota de avisos es independiente de la de comentarios.
R=$(rpc submit_question_report "$TOK_C" "{\"p_test_id\":\"t-redes\",\"p_question_key\":\"$K_A\",\"p_reason\":\"otro\"}")
check "$(status_of "$R")" "200" "la cuota de avisos de C sigue disponible (límites independientes)"
# Concurrencia: 12 envíos simultáneos del MISMO usuario → exactamente 5 aceptados.
for i in $(seq 1 12); do
  curl -s -o /tmp/rls_conc_body_$i -w '%{http_code}' -X POST "$BASE/rest/v1/rpc/submit_feedback" \
    -H "apikey: $KEY" -H "Authorization: Bearer $TOK_D" -H 'Content-Type: application/json' \
    -d "{\"p_category\":\"otro\",\"p_message\":\"concurrente $i\"}" --max-time 20 > /tmp/rls_conc_code_$i &
done
wait
OKC=0; RATEC=0; OTHERC=0
for i in $(seq 1 12); do
  case "$(cat /tmp/rls_conc_code_$i)" in
    200) OKC=$((OKC+1)) ;;
    400) if grep -q 'rate limit exceeded' "/tmp/rls_conc_body_$i"; then RATEC=$((RATEC+1)); else OTHERC=$((OTHERC+1)); fi ;;
    *) OTHERC=$((OTHERC+1)) ;;
  esac
done
check "$OKC" "5" "de 12 peticiones simultáneas exactamente 5 se aceptan (el lock serializa el recuento)"
check "$RATEC" "7" "y las otras 7 se rechazan por límite de frecuencia"
check "$OTHERC" "0" "ninguna respuesta inesperada (ni 500 ni escrituras fuera de cuota)"
check "$(sql "select count(*) from public.feedback where user_id='$UID_D';")" "5" "y en la base quedan exactamente 5 filas de D"
rm -f /tmp/rls_conc_code_* /tmp/rls_conc_body_*

echo
echo "— RESUMEN: OK=$PASS FAIL=$FAIL  (PostgREST + GoTrue + PostgreSQL reales)"
[[ $FAIL -eq 0 ]] || exit 1
exit 0

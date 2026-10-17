/* =====================================================================
   SMR Hub — Fase 8.8: Feedback y reportes de preguntas (migration 00009)

   Qué añade (aditivo; no cambia ninguna tabla existente):
   1. public.submit_feedback(category, message, ratings, client_created_at)
   2. public.submit_question_report(test_id, question_key, reason, details,
      client_created_at)

   Por qué SECURITY DEFINER (y solo aquí):
   La escritura del cliente pasa por estas funciones, que son la ÚNICA vía
   de alta (ver punto 3). El cuerpo necesita tres cosas que el invocador no
   puede hacer por sí mismo:
     - fijar `user_id = auth.uid()` (nunca un uid del cliente),
     - fijar `processing_status = 'received'` (columna de estado de trabajo
       del servidor, no del cliente),
     - contar las filas recientes del propio usuario para limitar la
       frecuencia y, con el lock de aviso, hacerlo de forma ATÓMICA.
   Con SECURITY INVOKER + RLS, la única forma de cumplir lo segundo y lo
   tercero sin abrir un INSERT libre sería… dejar el INSERT libre (que es
   justo el agujero que se cierra). `set search_path = ''` y todas las
   referencias cualificadas: nada del cuerpo se resuelve por búsqueda
   implícita.

   Limitación de frecuencia (spam/abuso): ventana deslizante de 1 hora por
   usuario — 5 comentarios y 20 reportes. `pg_advisory_xact_lock` por
   usuario serializa las peticiones concurrentes: el recuento no puede
   rebasarse aunque lleguen en paralelo (probado en
   tests/rest-rls-isolation.sh con peticiones simultáneas).

   Códigos de error (el cliente decide con ellos, no con texto libre):
     42501  auth required            (sin sesión válida → falla cerrado)
     22023  invalid payload: <campo> (vacío, demasiado largo o mal formado)
     P0001  rate limit exceeded      (límite de frecuencia superado)

   Idempotente y no destructiva: create or replace function / if not exists.

   3. Retirada de las policies de INSERT directo de 00001
      (feedback_insert_own, question_reports_insert_own).
      Motivo demostrado (fase 8.8, probado por HTTP antes del cambio):
      con ellas, el cliente podía (a) saltarse por completo el límite de
      frecuencia insertando directo en la tabla y (b) escribir sus propios
      valores en processing_status — la columna con la que el servidor
      marca el estado de tramitación de un envío. 00001 ya documentaba que
      la escritura de estas dos tablas va "via RPC 8.8": las policies eran
      el resto de esa decisión. Se CONSERVA la policy de SELECT propio
      (el usuario sigue pudiendo leer sus envíos) y no existe ninguna otra
      vía de escritura para el cliente.
   ===================================================================== */

/* Índice para el recuento de la ventana deslizante (y para el listado
   propio por fecha). La tabla no tenía ninguno sobre user_id. */
create index if not exists feedback_user_created_idx on public.feedback (user_id, created_at);
create index if not exists question_reports_user_created_idx on public.question_reports (user_id, created_at);

/* ---------------------------------------------------------------------
   RPC: enviar un comentario sobre SMR Hub.
   Devuelve el id de la fila creada. El texto se recorta y se acota en
   SERVIDOR: la validación del navegador es solo comodidad de interfaz.
   --------------------------------------------------------------------- */
create or replace function public.submit_feedback(
  p_category          text,
  p_message           text,
  p_ratings           jsonb default null,
  p_client_created_at bigint default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_category text := btrim(coalesce(p_category, ''));
  v_message  text := btrim(coalesce(p_message, ''));
  v_recent   integer;
  v_id       bigint;
begin
  if v_user is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  if v_category = '' or char_length(v_category) > 40 then
    raise exception 'invalid payload: category' using errcode = '22023';
  end if;
  if v_message = '' or char_length(v_message) > 2000 then
    raise exception 'invalid payload: message' using errcode = '22023';
  end if;
  if p_ratings is not null
    and (jsonb_typeof(p_ratings) <> 'object' or char_length(p_ratings::text) > 2000) then
    raise exception 'invalid payload: ratings' using errcode = '22023';
  end if;

  /* Ventana deslizante de 1 hora, serializada por usuario. */
  perform pg_advisory_xact_lock(hashtextextended('smr:feedback:' || v_user::text, 0));
  select count(*) into v_recent
    from public.feedback
   where user_id = v_user
     and created_at > public.server_epoch_ms() - 3600000;
  if v_recent >= 5 then
    raise exception 'rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.feedback
    (user_id, category, message, ratings, client_created_at, processing_status)
  values
    (v_user,
     v_category,
     v_message,
     p_ratings,
     /* Marca del cliente solo como diagnóstico: nunca puede ser futura. */
     case when p_client_created_at > 0
           and p_client_created_at <= public.server_epoch_ms()
          then p_client_created_at end,
     'received')
  returning id into v_id;

  return v_id;
end;
$$;

/* ---------------------------------------------------------------------
   RPC: reportar un problema en una pregunta concreta.
   `test_id` y `question_key` identifican la pregunta REAL; el reporte no
   toca ni puede tocar el contenido educativo (solo inserta una fila).
   --------------------------------------------------------------------- */
create or replace function public.submit_question_report(
  p_test_id           text,
  p_question_key      text,
  p_reason            text,
  p_details           text default null,
  p_client_created_at bigint default null
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := auth.uid();
  v_test_id  text := btrim(coalesce(p_test_id, ''));
  v_key      text := btrim(coalesce(p_question_key, ''));
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_details  text := nullif(btrim(coalesce(p_details, '')), '');
  v_recent   integer;
  v_id       bigint;
begin
  if v_user is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  /* Identificador de test: opaco, pero acotado (ids reales: t-<nombre>;
     las sesiones sintéticas no llegan aquí porque exigen clave estable). */
  if v_test_id = '' or char_length(v_test_id) > 64 or v_test_id !~ '^[A-Za-z0-9_.:-]+$' then
    raise exception 'invalid payload: test_id' using errcode = '22023';
  end if;
  /* Clave estable de pregunta: mismo formato que valida merge_srs_cards. */
  if v_key !~ '^q-[0-9a-f]{16}(-[0-9]+)?$' then
    raise exception 'invalid payload: question_key' using errcode = '22023';
  end if;
  if v_reason = '' or char_length(v_reason) > 200 then
    raise exception 'invalid payload: reason' using errcode = '22023';
  end if;
  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'invalid payload: details' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('smr:question_reports:' || v_user::text, 0));
  select count(*) into v_recent
    from public.question_reports
   where user_id = v_user
     and created_at > public.server_epoch_ms() - 3600000;
  if v_recent >= 20 then
    raise exception 'rate limit exceeded' using errcode = 'P0001';
  end if;

  insert into public.question_reports
    (user_id, test_id, question_key, reason, details, client_created_at, processing_status)
  values
    (v_user,
     v_test_id,
     v_key,
     v_reason,
     v_details,
     case when p_client_created_at > 0
           and p_client_created_at <= public.server_epoch_ms()
          then p_client_created_at end,
     'received')
  returning id into v_id;

  return v_id;
end;
$$;

/* --- Sin vía de escritura directa: la RPC es la única puerta --------- */
drop policy if exists feedback_insert_own on public.feedback;
drop policy if exists question_reports_insert_own on public.question_reports;

/* --- EXECUTE: mínimo necesario --------------------------------------
   `authenticated` para el uso real y `authenticator` porque PostgREST
   resuelve/ejecuta la función a través de ese rol (mismo hallazgo HTTP
   PGRST202 documentado en 00007). `public` y `anon` quedan SIN permiso:
   una petición anónima no puede ni llegar al cuerpo (y, aunque llegara,
   `auth.uid()` es null y la función falla cerrada con 42501). */
grant execute on function public.submit_feedback(text, text, jsonb, bigint) to authenticated;
grant execute on function public.submit_feedback(text, text, jsonb, bigint) to authenticator;
revoke execute on function public.submit_feedback(text, text, jsonb, bigint) from public;
revoke execute on function public.submit_feedback(text, text, jsonb, bigint) from anon;

grant execute on function public.submit_question_report(text, text, text, text, bigint) to authenticated;
grant execute on function public.submit_question_report(text, text, text, text, bigint) to authenticator;
revoke execute on function public.submit_question_report(text, text, text, text, bigint) from public;
revoke execute on function public.submit_question_report(text, text, text, text, bigint) from anon;

/* =====================================================================
   FIN migration 00009.

   NO implementado aquí (fuera del alcance de 8.8):
   - Panel de administración / lectura de los envíos (8.9 o posterior).
   - Notificaciones al usuario, respuestas al feedback, retención y
     anonimización (decisión de producto/legal, no técnica).
   - entitlements y monetización.
   ===================================================================== */

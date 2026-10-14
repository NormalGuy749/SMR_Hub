/* =====================================================================
   SMR Hub — Fase 8.4.1: Progress Sync Hardening (migration 00005)
   ------------------------------------------------------------------
   Correcciones de la auditoría 8.4.1. ADITIVA e IDEMPOTENTE: create or
   replace / create table if not exists / drop trigger if exists. NO
   re-ejecuta 00001–00004 ni toca datos existentes. No usa
   CREATE POLICY IF NOT EXISTS (inválido en PostgreSQL).

   Contenido:
   C1 — sync_progress_chunk rev.4:
     - wrong_answer_events: created_at con fallback estable
       coalesce(client_created_at) — el cliente YA lo envía (8.4.1), pero
       un evento sin created_at deja de provocar 23502 en silencio y se
       deriva de su identidad estable.
     - Idempotencia del anti-join por IDENTIDAD DEL CLIENTE
       (client_created_at), nunca por comparaciones que puedan resolverse
       a NULL (t.created_at = r.created_at con NULL no deduplica).
     - Un evento sin identidad estable (sin client_created_at ni
       created_at) NO se inserta como basura: se cuenta como omitido y el
       resto del chunk se procesa igual (sin pérdida silenciosa de otros
       dominios).
   A5 — trigger touch_updated_at (server-side) para TODAS las tablas
     mutables con updated_at: student_settings, test_scores,
     resource_state, case_solutions, srs_cards, wrong_answers.
     (profiles ya lo tiene en 00003.) Sin esto, un UPDATE vía PostgREST
     conserva el updated_at del INSERT y el LWW server-side de 8.0 v2
     queda inoperante.
   B1 — revoke execute de sync_progress_chunk a public/anon (quedaba
     EXECUTE por defecto para PUBLIC); se mantiene grant a authenticated.
   ===================================================================== */

/* =====================================================================
   1. RPC sync_progress_chunk — rev.4 (C1)
   SECURITY INVOKER: la RLS del usuario es la única autoridad.
   ===================================================================== */
create or replace function public.sync_progress_chunk(
  p_chunk_id        text,
  p_table           text,
  p_events          jsonb,
  p_first_created_at bigint,
  p_last_created_at  bigint
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  if v_user is null then
    raise exception 'auth required';
  end if;

  /* 1. Idempotencia a nivel chunk: ya registrado → no-op. */
  if exists (
    select 1 from public.progress_sync_chunks
    where user_id = v_user and chunk_id = p_chunk_id
  ) then
    return 0;
  end if;

  /* 2. Dedupe fino + inserción. UNA statement por rama: la CTE vive solo
     dentro de su query (lección 42P01 de la rev.1).
     Identidad estable del evento (8.4.1): el anti-join compara SIEMPRE
     contra un valor no nulo — coalesce(client_created_at, created_at) en
     ambos lados — para que un NULL nunca anule el dedupe. */
  if p_table = 'test_attempts' then
    with incoming as (
      select
        (e->>'test_id')::text                              as test_id,
        (e->>'title')::text                                as title,
        (e->>'mode')::text                                 as mode,
        (e->>'correct')::integer                           as correct,
        (e->>'total')::integer                             as total,
        least(greatest((e->>'pct')::smallint, 0), 100)     as pct,
        (e->>'created_at')::bigint                         as created_at,
        coalesce((e->>'ordinal')::int, 0)                  as ordinal
      from jsonb_array_elements(p_events) e
      where (e->>'created_at')::bigint is not null          -- identidad mínima
    ),
    ranked as (
      select *, row_number() over (partition by test_id, mode, created_at order by ordinal) rn
      from incoming
    ),
    inserted as (
      insert into public.test_attempts (user_id, test_id, title, mode, correct, total, pct, created_at)
      select v_user, test_id, title, mode, correct, total, pct, created_at
      from ranked r
      where r.rn = 1
        and not exists (
          select 1 from public.test_attempts t
          where t.user_id = v_user
            and t.test_id = r.test_id and t.mode = r.mode and t.created_at = r.created_at
        )
      returning 1
    )
    select count(*) into v_inserted from inserted;
    select count(*) into v_skipped from jsonb_array_elements(p_events) e
      where (e->>'created_at')::bigint is null;

  elsif p_table = 'study_sessions' then
    with incoming as (
      select
        (e->>'minutes')::integer  as minutes,
        (e->>'steps')::integer    as steps,
        (e->>'created_at')::bigint as created_at
      from jsonb_array_elements(p_events) e
      where (e->>'created_at')::bigint is not null
    ),
    ranked as (
      select *, row_number() over (partition by created_at, minutes, steps order by created_at) rn
      from incoming
    ),
    inserted as (
      insert into public.study_sessions (user_id, minutes, steps, created_at)
      select v_user, minutes, steps, created_at
      from ranked r
      where r.rn = 1
        and not exists (
          select 1 from public.study_sessions t
          where t.user_id = v_user
            and t.created_at = r.created_at and t.minutes = r.minutes and t.steps = r.steps
        )
      returning 1
    )
    select count(*) into v_inserted from inserted;
    select count(*) into v_skipped from jsonb_array_elements(p_events) e
      where (e->>'created_at')::bigint is null;

  elsif p_table = 'activity_events' then
    with incoming as (
      select
        (e->>'event_type')::text  as event_type,
        (e->>'label')::text       as label,
        (e->>'meta')::text        as meta,
        (e->>'created_at')::bigint as created_at
      from jsonb_array_elements(p_events) e
      where (e->>'created_at')::bigint is not null
    ),
    ranked as (
      select *, row_number() over (partition by label, coalesce(meta,''), created_at order by created_at) rn
      from incoming
    ),
    inserted as (
      insert into public.activity_events (user_id, event_type, label, meta, created_at)
      select v_user, event_type, label, meta, created_at
      from ranked r
      where r.rn = 1
        and not exists (
          select 1 from public.activity_events t
          where t.user_id = v_user
            and t.label = r.label and coalesce(t.meta,'') = coalesce(r.meta,'') and t.created_at = r.created_at
        )
      returning 1
    )
    select count(*) into v_inserted from inserted;
    select count(*) into v_skipped from jsonb_array_elements(p_events) e
      where (e->>'created_at')::bigint is null;

  elsif p_table = 'wrong_answer_events' then
    /* 8.4.1 (C1): identidad estable = coalesce(client_created_at,
       created_at). created_at de la fila = coalesce(created_at del
       evento, identidad, server_epoch_ms) — nunca NULL, así que el
       NOT NULL deja de ser un fallo silencioso del chunk entero. El
       anti-join usa la MISMA expresión de identidad en ambos lados. */
    with incoming as (
      select
        (e->>'test_id')::text           as test_id,
        (e->>'question_key')::text      as question_key,
        (e->>'event_type')::text        as event_type,
        (e->>'count_delta')::integer    as count_delta,
        (e->>'client_created_at')::bigint as client_created_at,
        coalesce(
          (e->>'client_created_at')::bigint,
          (e->>'created_at')::bigint
        )                               as ident,
        coalesce(
          (e->>'created_at')::bigint,
          (e->>'client_created_at')::bigint,
          public.server_epoch_ms()
        )                               as created_at,
        coalesce((e->>'ordinal')::int, 0) as ordinal
      from jsonb_array_elements(p_events) e
      where coalesce((e->>'client_created_at')::bigint, (e->>'created_at')::bigint) is not null
    ),
    ranked as (
      select *, row_number() over (
        partition by test_id, question_key, event_type, ident order by ordinal, ident) rn
      from incoming
    ),
    inserted as (
      insert into public.wrong_answer_events
        (user_id, test_id, question_key, event_type, count_delta, client_created_at, created_at)
      select v_user, test_id, question_key, event_type, count_delta, client_created_at, created_at
      from ranked r
      where r.rn = 1
        and not exists (
          select 1 from public.wrong_answer_events t
          where t.user_id = v_user
            and t.test_id = r.test_id
            and t.question_key = r.question_key
            and t.event_type = r.event_type
            and coalesce(t.client_created_at, t.created_at) = r.ident
        )
      returning 1
    )
    select count(*) into v_inserted from inserted;
    select count(*) into v_skipped from jsonb_array_elements(p_events) e
      where coalesce((e->>'client_created_at')::bigint, (e->>'created_at')::bigint) is null;

  else
    raise exception 'unsupported table: %', p_table;
  end if;

  /* Eventos sin identidad estable: se omiten con diagnóstico (el
     servidor no inventa timestamps que romperían el dedupe), pero NO se
     descarta el resto del chunk. */
  if v_skipped > 0 then
    raise warning 'sync_progress_chunk: % eventos sin identidad estable omitidos (tabla %)', v_skipped, p_table;
  end if;

  /* 3. Registrar el chunk SOLO si llegamos aquí sin excepción. */
  insert into public.progress_sync_chunks
    (user_id, chunk_id, table_name, event_count, first_created_at, last_created_at)
  values
    (v_user, p_chunk_id, p_table, v_inserted, p_first_created_at, p_last_created_at)
  on conflict (user_id, chunk_id) do nothing;

  return v_inserted;
end;
$$;

grant execute on function public.sync_progress_chunk(text, text, jsonb, bigint, bigint) to authenticated;
/* B1: sin EXECUTE para public/anon (el default los incluía). */
revoke execute on function public.sync_progress_chunk(text, text, jsonb, bigint, bigint) from public;
revoke execute on function public.sync_progress_chunk(text, text, jsonb, bigint, bigint) from anon;

/* =====================================================================
   2. A5 — touch_updated_at server-side en tablas mutables
   Mismo patrón que 00003 (profiles). El cliente NUNCA puede falsificar
   el timestamp que decide el LWW: BEFORE UPDATE fuerza
   NEW.updated_at := server_epoch_ms() y descarta cualquier valor enviado.
   Idempotente: drop trigger if exists + create or replace function.
   ===================================================================== */
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := public.server_epoch_ms();
  return new;
end;
$$;

drop trigger if exists student_settings_touch_updated_at on public.student_settings;
create trigger student_settings_touch_updated_at
  before update on public.student_settings
  for each row execute function public.touch_updated_at();

drop trigger if exists test_scores_touch_updated_at on public.test_scores;
create trigger test_scores_touch_updated_at
  before update on public.test_scores
  for each row execute function public.touch_updated_at();

drop trigger if exists resource_state_touch_updated_at on public.resource_state;
create trigger resource_state_touch_updated_at
  before update on public.resource_state
  for each row execute function public.touch_updated_at();

drop trigger if exists case_solutions_touch_updated_at on public.case_solutions;
create trigger case_solutions_touch_updated_at
  before update on public.case_solutions
  for each row execute function public.touch_updated_at();

drop trigger if exists srs_cards_touch_updated_at on public.srs_cards;
create trigger srs_cards_touch_updated_at
  before update on public.srs_cards
  for each row execute function public.touch_updated_at();

drop trigger if exists wrong_answers_touch_updated_at on public.wrong_answers;
create trigger wrong_answers_touch_updated_at
  before update on public.wrong_answers
  for each row execute function public.touch_updated_at();

/* =====================================================================
   FIN migration 00005. PENDIENTE DE APLICAR en Supabase (manual).
   ===================================================================== */

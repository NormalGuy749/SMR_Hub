/* =====================================================================
   SMR Hub — Fase 8.4: Progress Sync (migration 00004) — rev.3
   ------------------------------------------------------------------
   REVISIÓN 3 (idempotencia real sobre LIVE): la rev.1 creó las policies
   de progress_sync_chunks; la rev.2 corregía el bug 42P01 de la RPC pero
   re-ejecutarla fallaba con 42710 (policy already exists), porque
   PostgreSQL no soporta CREATE POLICY IF NOT EXISTS. Fix: las policies se
   crean condicionalmente (pg_policies); la tabla, índices, RLS y la RPC
   rev.2 permanecen como create/replace if not exists. Re-ejecutable
   sobre el estado LIVE actual sin borrar ni tocar datos.

   REVISIÓN 2 (post-validación live): la rev.1 fallaba en runtime con
   42P01 "relation \"ranked\" does not exist". Causa: en cada rama, la CTE
   `ranked` se referenciaba dos veces (INSERT ... FROM ranked y el conteo
   posterior con array_length(array(select ... from ranked))). La CTE solo
   existe dentro de SU query; el conteo posterior la resolvía como tabla
   física inexistente. Fix: UNA sola statement INSERT ... WITH por rama,
   con la CTE al principio y el conteo con GET DIAGNOSTICS.

   Objetivo (sin cambios respecto a rev.1):
     - REINTENTOS IDEMPOTENTES: un retry con el mismo chunk_id NO duplica
       eventos (registro en progress_sync_chunks + anti-join por evento).
     - CHUNKS: si un POST falla a medias, el cliente reenvía el chunk.
     - ORDINAL: preserva el orden relativo intra-chunk.
   Idempotente y no destructiva: create or replace function / if not exists.
   ===================================================================== */

/* ---------- Libro de idempotencia por chunk ---------- */
create table if not exists public.progress_sync_chunks (
  user_id       uuid not null references auth.users(id) on delete cascade,
  chunk_id      text not null,          -- generado por el cliente (uuid v4), estable por reintentos
  table_name    text not null check (table_name in (
                   'test_attempts', 'study_sessions', 'activity_events', 'wrong_answer_events')),
  event_count   integer not null default 0,
  first_created_at bigint,
  last_created_at  bigint,
  created_at    bigint not null default public.server_epoch_ms(),
  primary key (user_id, chunk_id)
);

create index if not exists progress_sync_chunks_user_idx
  on public.progress_sync_chunks (user_id, table_name, created_at desc);

alter table public.progress_sync_chunks enable row level security;

/* Policies idempotentes: PostgreSQL no soporta CREATE POLICY IF NOT EXISTS,
   por lo que la rev.1 aplicada en LIVE hace que un re-run fallara con 42710
   (policy already exists). Patrón seguro: crear cada policy SOLO si no
   existe en pg_policies. Mantiene la misma seguridad/RLS; si la policy ya
   existe (correcta) se conserva tal cual, sin drop ni recreación. */
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'progress_sync_chunks'
      and policyname = 'progress_sync_chunks_select_own'
  ) then
    create policy progress_sync_chunks_select_own on public.progress_sync_chunks
      for select to authenticated using (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'progress_sync_chunks'
      and policyname = 'progress_sync_chunks_insert_own'
  ) then
    create policy progress_sync_chunks_insert_own on public.progress_sync_chunks
      for insert to authenticated with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'progress_sync_chunks'
      and policyname = 'progress_sync_chunks_delete_own'
  ) then
    create policy progress_sync_chunks_delete_own on public.progress_sync_chunks
      for delete to authenticated using (user_id = auth.uid());
  end if;
end;
$$;

/* ---------------------------------------------------------------------
   RPC: registrar un chunk de eventos de una tabla append-only.
   SECURITY INVOKER: RLS del usuario es la única autoridad.
   Idempotencia: (user, chunk_id) ya registrado → 0 sin tocar datos.
   Dedupe fino: anti-join contra filas existentes (tolera chunks
   distintos con los mismos eventos, p. ej. dos pestañas).
   --------------------------------------------------------------------- */
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
     dentro de su query (lección 42P01 de la rev.1). */
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

  elsif p_table = 'study_sessions' then
    with incoming as (
      select
        (e->>'minutes')::integer  as minutes,
        (e->>'steps')::integer    as steps,
        (e->>'created_at')::bigint as created_at
      from jsonb_array_elements(p_events) e
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

  elsif p_table = 'activity_events' then
    with incoming as (
      select
        (e->>'event_type')::text  as event_type,
        (e->>'label')::text       as label,
        (e->>'meta')::text        as meta,
        (e->>'created_at')::bigint as created_at
      from jsonb_array_elements(p_events) e
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

  elsif p_table = 'wrong_answer_events' then
    /* Sin UNIQUE en la base para esta tabla: el anti-join es la única
       defensa fina. El índice (user_id, test_id, question_key, created_at)
       hace el anti-join eficiente. */
    with incoming as (
      select
        (e->>'test_id')::text           as test_id,
        (e->>'question_key')::text      as question_key,
        (e->>'event_type')::text        as event_type,
        (e->>'count_delta')::integer    as count_delta,
        (e->>'client_created_at')::bigint as client_created_at,
        (e->>'created_at')::bigint      as created_at
      from jsonb_array_elements(p_events) e
    ),
    ranked as (
      select *, row_number() over (partition by test_id, question_key, event_type, created_at order by created_at) rn
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
            and t.created_at = r.created_at
        )
      returning 1
    )
    select count(*) into v_inserted from inserted;

  else
    raise exception 'unsupported table: %', p_table;
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

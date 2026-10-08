/* =====================================================================
   SMR Hub — Fase 8.1: Supabase Foundation (migration 00001)
   Fuente de verdad: arquitectura 8.0 v2 (sección 6, modelo de datos),
   corregida por la revisión 8.0.1 (C-01..C-05).

   Principios:
   - PostgreSQL NO contiene contenido educativo. Los IDs educativos
     (test_id, resource_id, case_id, question_key, item_id, ...) son TEXT
     opacos SIN foreign keys hacia SMR_DATA o tablas editoriales.
   - user_id es UUID y referencia auth.users(id) ON DELETE CASCADE.
   - updated_at es SERVER-SIDE (epoch-ms BIGINT generado por PostgreSQL):
     el cliente nunca puede falsificar el timestamp que resuelve el LWW.
     client_updated_at es el valor del dispositivo, solo informativo.
   - q-<16hex> y su formula (js/srs.js, doble FNV-1a) permanecen 100%
     client-side; PostgreSQL jamas recalcula ni sustituye el question hash.

   Convencion de timestamps (documentada en la cabecera de cada bloque):
   Las columnas *_at son BIGINT epoch-milisegundos — el mismo formato que
   usa el cliente (Date.now()) y localStorage. Para generarlas server-side
   existe el helper public.server_epoch_ms(): (extract(epoch from
   clock_timestamp()) * 1000)::bigint. Es epoch-ms puro, no requiere base
   externa y el valor es directamente comparable con Date.now() del
   cliente (con el desfase de relojes habitual, irrelevante porque en LWW
   solo manda el orden server-side). En triggers se usa statement-local
   clock_timestamp() y en defaults now() via la misma formula.
   ===================================================================== */

create schema if not exists public;

/* =====================================================================
   Helper: epoch-ms server-side (BIGINT)
   ===================================================================== */
create or replace function public.server_epoch_ms() returns bigint
language sql volatile
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

/* =====================================================================
   1. PROFILES (v2 seccion 6.1) — 1:1 con auth.users. Whole-row LWW.
   ===================================================================== */
create table if not exists public.profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  community          text,
  course             smallint constraint profiles_course_range check (course is null or course between 1 and 2),
  academic_year      text,
  curriculum_id      text,
  display_name       text,
  client_updated_at  bigint,                                   -- diagnostico; nunca decide LWW
  updated_at         bigint not null default public.server_epoch_ms(),  -- server-side
  created_at         bigint not null default public.server_epoch_ms()
);

/* =====================================================================
   2. STUDENT_SETTINGS (v2 6.2) — 1:1 con auth.users. Whole-row LWW.
   ===================================================================== */
create table if not exists public.student_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  theme              text constraint settings_theme_valid check (theme is null or theme in ('light','dark')),
  text_size          text not null default 'md' constraint settings_text_size_valid check (text_size in ('sm','md','lg')),
  animations         boolean not null default true,
  client_updated_at  bigint,
  updated_at         bigint not null default public.server_epoch_ms(),
  created_at         bigint not null default public.server_epoch_ms()
);

/* =====================================================================
   3. RESOURCE_STATE (v2 6.9) — tombstones por campo (C-04).
      Estados efectivos:
        completado    <=>  completed_at > completed_cleared_at
        self          <=>  el valor cuyo self_assessment_at es mayor
        viewed_at     <=>  MAX del propio valor (nunca se borra)
   ===================================================================== */
create table if not exists public.resource_state (
  user_id               uuid not null references auth.users(id) on delete cascade,
  resource_id           text not null,                         -- TEXT opaco (p. ej. r-red-vlan)
  viewed_at             bigint,
  completed_at          bigint,
  completed_cleared_at  bigint,
  self_assessment       smallint constraint resource_state_self_range check (self_assessment between 0 and 2),
  self_assessment_at    bigint,
  client_updated_at     bigint,
  updated_at            bigint not null default public.server_epoch_ms(),
  created_at            bigint not null default public.server_epoch_ms(),
  primary key (user_id, resource_id)
);

/* =====================================================================
   4. TEST_SCORES (v2 6.3) — best = MAX; last_pct = CACHE derivada de
      test_attempts (el "ultimo intento" es el attempt de mayor created_at
      para user+test, independientemente del mode).
   ===================================================================== */
create table if not exists public.test_scores (
  user_id            uuid not null references auth.users(id) on delete cascade,
  test_id            text not null,                            -- TEXT opaco (p. ej. t-redes)
  best_pct           smallint constraint test_scores_best_range check (best_pct between 0 and 100),
  last_pct           smallint constraint test_scores_last_range check (last_pct between 0 and 100),
  client_updated_at  bigint,
  updated_at         bigint not null default public.server_epoch_ms(),
  created_at         bigint not null default public.server_epoch_ms(),
  primary key (user_id, test_id)
);

/* =====================================================================
   5. TEST_ATTEMPTS (v2 6.4) — append-only.
   ===================================================================== */
create table if not exists public.test_attempts (
  id           bigint generated by default as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  test_id      text not null,
  title        text,
  mode         text not null,
  correct      integer not null constraint test_attempts_correct_min check (correct >= 0),
  total        integer not null constraint test_attempts_total_min check (total >= 0),
  pct          smallint not null constraint test_attempts_pct_range check (pct between 0 and 100),
  created_at   bigint not null,                                -- epoch-ms del cliente
  constraint test_attempts_dedup unique (user_id, test_id, mode, created_at)
);

create index if not exists test_attempts_user_created_idx on public.test_attempts (user_id, created_at desc);
create index if not exists test_attempts_user_test_idx    on public.test_attempts (user_id, test_id);

/* =====================================================================
   6. WRONG_ANSWER_EVENTS (v2 6.5) — NUEVA, append-only, FUENTE DE VERDAD.
      Cada evento representa una respuesta fallada ('add') o el clear que
      produce un acierto ('clear'). El estado efectivo se DERIVA por
      replay en orden de created_at. wrong_answers es CACHE materializada.
      El estado local previo a la Fase 8 no contiene eventos individuales;
      la migracion (8.7) generara un event-seed con el count acumulado.
      NO se inventa historico inexistente.
   ===================================================================== */
create table if not exists public.wrong_answer_events (
  id                bigint generated by default as identity primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  test_id           text not null,
  question_key      text not null,                               -- TEXT opaco: q-<16hex> estable o clave legacy
  event_type        text not null constraint wrong_answer_events_type_valid check (event_type in ('add','clear')),
  count_delta       integer not null constraint wrong_answer_events_delta check (
                      (event_type = 'add' and count_delta >= 1) or
                      (event_type = 'clear' and count_delta = 0)
                    ),
  client_created_at bigint,
  created_at        bigint not null default public.server_epoch_ms()
);

create index if not exists wrong_answer_events_user_key_idx on public.wrong_answer_events (user_id, test_id, question_key, created_at);

/* =====================================================================
   7. WRONG_ANSWERS (v2 6.5) — CACHE MATERIALIZADA (no fuente de verdad).
      Reconstruible/validable contra el replay de wrong_answer_events.
   ===================================================================== */
create table if not exists public.wrong_answers (
  user_id       uuid not null references auth.users(id) on delete cascade,
  test_id       text not null,
  question_key  text not null,
  count         integer not null default 1 constraint wrong_answers_count_min check (count >= 0),
  updated_at    bigint not null default public.server_epoch_ms(),
  primary key (user_id, test_id, question_key)
);

/* =====================================================================
   8. SRS_CARDS (v2 6.6) — question_key = q-<16hex> estable, intocable.
      PostgreSQL nunca recalcula el hash. LWW por updated_at server-side.
   ===================================================================== */
create table if not exists public.srs_cards (
  user_id            uuid not null references auth.users(id) on delete cascade,
  question_key       text not null,
  level              smallint not null constraint srs_cards_level_range check (level between 0 and 5),
  due                bigint not null,
  client_updated_at  bigint,
  updated_at         bigint not null default public.server_epoch_ms(),
  created_at         bigint not null default public.server_epoch_ms(),
  primary key (user_id, question_key)
);

create index if not exists srs_cards_user_due_idx on public.srs_cards (user_id, due asc);

/* =====================================================================
   9. CASE_SOLUTIONS (v2 6.7) — option limitada a 4 chars coincide con
      el sanitizador del cliente (option.slice(0,4)).
   ===================================================================== */
create table if not exists public.case_solutions (
  user_id            uuid not null references auth.users(id) on delete cascade,
  case_id            text not null,                             -- TEXT opaco (p. ej. casa-wifi)
  option             text not null constraint case_solutions_option_len check (char_length(option) <= 4),
  client_updated_at  bigint,
  updated_at         bigint not null default public.server_epoch_ms(),
  created_at         bigint not null default public.server_epoch_ms(),
  primary key (user_id, case_id)
);

/* =====================================================================
   10. STREAK_DAYS (v2 6.8) — append-only, un dia activo = una fila.
       La racha actual se DERIVA de los dias consecutivos.
       NUNCA se almacena count/lastDay como fuente de verdad.
   ===================================================================== */
create table if not exists public.streak_days (
  user_id     uuid not null references auth.users(id) on delete cascade,
  day         date not null,
  created_at  bigint not null default public.server_epoch_ms(),
  primary key (user_id, day)
);

create index if not exists streak_days_user_day_idx on public.streak_days (user_id, day desc);

/* =====================================================================
   11. STUDY_SESSIONS (v2 6.10) — append-only con dedup UNIQUE.
   ===================================================================== */
create table if not exists public.study_sessions (
  id          bigint generated by default as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  minutes     integer not null constraint study_sessions_minutes_min check (minutes >= 0),
  steps       integer not null constraint study_sessions_steps_min check (steps >= 0),
  created_at  bigint not null,                                  -- epoch-ms del cliente
  constraint study_sessions_dedup unique (user_id, created_at, minutes, steps)
);

create index if not exists study_sessions_user_created_idx on public.study_sessions (user_id, created_at desc);

/* =====================================================================
   12. ACTIVITY_EVENTS (v2 6.11) — append-only con dedup UNIQUE.
       Regla de importacion (8.7): ante colision legitima, serializar
       created_at con incremento determinista; nunca descartar eventos.
   ===================================================================== */
create table if not exists public.activity_events (
  id          bigint generated by default as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  event_type  text not null,                                    -- 'recurso' / 'test' / 'estudio' / 'caso'
  label       text not null,
  meta        text,
  created_at  bigint not null,                                  -- epoch-ms del cliente
  constraint activity_events_dedup unique (user_id, label, meta, created_at)
);

create index if not exists activity_events_user_created_idx on public.activity_events (user_id, created_at desc);

/* =====================================================================
   13. FAVORITES (v2 6.12) — tombstone por fila (C-03).
       activo <=> created_at > removed_at; inactivo <=> removed_at >= created_at.
       Estrategia de fusion: tombstone/LWW por fila, NO set union.
   ===================================================================== */
create table if not exists public.favorites (
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null constraint favorites_kind_valid check (kind in ('recurso','termino')),
  item_id     text not null,                                    -- TEXT opaco (id recurso o termino)
  created_at  bigint not null,
  removed_at  bigint,                                           -- tombstone persistente
  primary key (user_id, kind, item_id)
);

/* =====================================================================
   14. FEEDBACK (v2 6.13) — INSERT-only en RLS (escritura via RPC 8.8).
   ===================================================================== */
create table if not exists public.feedback (
  id                 bigint generated by default as identity primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  category           text not null,
  message            text not null,
  ratings            jsonb,
  client_created_at  bigint,
  created_at         bigint not null default public.server_epoch_ms(),
  processing_status  text not null default 'received'
);

/* =====================================================================
   15. QUESTION_REPORTS (v2 6.14) — INSERT-only en RLS.
   ===================================================================== */
create table if not exists public.question_reports (
  id                 bigint generated by default as identity primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  test_id            text not null,                             -- TEXT opaco
  question_key       text not null,                             -- TEXT opaco (q-<16hex>)
  reason             text not null,
  details            text,
  client_created_at  bigint,
  created_at         bigint not null default public.server_epoch_ms(),
  processing_status  text not null default 'received'
);

create index if not exists question_reports_key_idx on public.question_reports (test_id, question_key);

/* =====================================================================
   16. ENTITLEMENTS (v2 6.15, DECISION DEFINITIVA) — creada en 8.1, vacia.
       RLS: SELECT-only para el propio user. NINGUNA escritura desde el
       cliente. Poblacion via service_role/proveedor de pagos: solo 8.9.
   ===================================================================== */
create table if not exists public.entitlements (
  id                bigint generated by default as identity primary key,
  user_id           uuid not null references auth.users(id) on delete cascade,
  kind              text not null,
  external_provider text,
  external_ref      text,
  starts_at         bigint,
  expires_at        bigint,
  status            text not null default 'active',
  metadata          jsonb,
  created_at        bigint not null default public.server_epoch_ms(),
  updated_at        bigint not null default public.server_epoch_ms()
);

create index if not exists entitlements_user_idx on public.entitlements (user_id, status);

/* =====================================================================
   RLS — habilitacion y policies por tabla
   Regla general (v2 seccion 10): auth.uid() = user_id
   Append-only: INSERT solo propio user; UPDATE/DELETE prohibidos.
   Entitlements: SELECT-only._feedback/reports: INSERT-only (RPC 8.8).
   ===================================================================== */

alter table public.profiles            enable row level security;
alter table public.student_settings    enable row level security;
alter table public.resource_state      enable row level security;
alter table public.test_scores         enable row level security;
alter table public.test_attempts       enable row level security;
alter table public.wrong_answer_events enable row level security;
alter table public.wrong_answers       enable row level security;
alter table public.srs_cards           enable row level security;
alter table public.case_solutions      enable row level security;
alter table public.streak_days         enable row level security;
alter table public.study_sessions      enable row level security;
alter table public.activity_events     enable row level security;
alter table public.favorites           enable row level security;
alter table public.feedback            enable row level security;
alter table public.question_reports    enable row level security;
alter table public.entitlements        enable row level security;

/* --- Tablas MUTABLES (select/insert/update/delete propio user) --- */

create policy profiles_select_own  on public.profiles         for select to authenticated using (user_id = auth.uid());
create policy profiles_insert_own  on public.profiles         for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update_own  on public.profiles         for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profiles_delete_own  on public.profiles         for delete to authenticated using (user_id = auth.uid());

create policy settings_select_own  on public.student_settings for select to authenticated using (user_id = auth.uid());
create policy settings_insert_own  on public.student_settings for insert to authenticated with check (user_id = auth.uid());
create policy settings_update_own  on public.student_settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy settings_delete_own  on public.student_settings for delete to authenticated using (user_id = auth.uid());

create policy resource_state_select_own  on public.resource_state for select to authenticated using (user_id = auth.uid());
create policy resource_state_insert_own  on public.resource_state for insert to authenticated with check (user_id = auth.uid());
create policy resource_state_update_own  on public.resource_state for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy resource_state_delete_own  on public.resource_state for delete to authenticated using (user_id = auth.uid());

create policy test_scores_select_own  on public.test_scores for select to authenticated using (user_id = auth.uid());
create policy test_scores_insert_own  on public.test_scores for insert to authenticated with check (user_id = auth.uid());
create policy test_scores_update_own  on public.test_scores for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy test_scores_delete_own  on public.test_scores for delete to authenticated using (user_id = auth.uid());

create policy wrong_answers_select_own  on public.wrong_answers for select to authenticated using (user_id = auth.uid());
create policy wrong_answers_insert_own  on public.wrong_answers for insert to authenticated with check (user_id = auth.uid());
create policy wrong_answers_update_own  on public.wrong_answers for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wrong_answers_delete_own  on public.wrong_answers for delete to authenticated using (user_id = auth.uid());

create policy srs_cards_select_own  on public.srs_cards for select to authenticated using (user_id = auth.uid());
create policy srs_cards_insert_own  on public.srs_cards for insert to authenticated with check (user_id = auth.uid());
create policy srs_cards_update_own  on public.srs_cards for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy srs_cards_delete_own  on public.srs_cards for delete to authenticated using (user_id = auth.uid());

create policy case_solutions_select_own  on public.case_solutions for select to authenticated using (user_id = auth.uid());
create policy case_solutions_insert_own  on public.case_solutions for insert to authenticated with check (user_id = auth.uid());
create policy case_solutions_update_own  on public.case_solutions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy case_solutions_delete_own  on public.case_solutions for delete to authenticated using (user_id = auth.uid());

create policy favorites_select_own  on public.favorites for select to authenticated using (user_id = auth.uid());
create policy favorites_insert_own  on public.favorites for insert to authenticated with check (user_id = auth.uid());
create policy favorites_update_own  on public.favorites for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy favorites_delete_own  on public.favorites for delete to authenticated using (user_id = auth.uid());

/* --- Tablas APPEND-ONLY (INSERT propio; UPDATE/DELETE prohibidos) --- */

create policy test_attempts_select_own  on public.test_attempts for select to authenticated using (user_id = auth.uid());
create policy test_attempts_insert_own  on public.test_attempts for insert to authenticated with check (user_id = auth.uid());
/* Sin policy UPDATE/DELETE para authenticated: prohibidos por defecto. */

create policy wrong_answer_events_select_own on public.wrong_answer_events for select to authenticated using (user_id = auth.uid());
create policy wrong_answer_events_insert_own on public.wrong_answer_events for insert to authenticated with check (user_id = auth.uid());

create policy streak_days_select_own  on public.streak_days for select to authenticated using (user_id = auth.uid());
create policy streak_days_insert_own  on public.streak_days for insert to authenticated with check (user_id = auth.uid());

create policy study_sessions_select_own  on public.study_sessions for select to authenticated using (user_id = auth.uid());
create policy study_sessions_insert_own  on public.study_sessions for insert to authenticated with check (user_id = auth.uid());

create policy activity_events_select_own  on public.activity_events for select to authenticated using (user_id = auth.uid());
create policy activity_events_insert_own  on public.activity_events for insert to authenticated with check (user_id = auth.uid());

/* --- FEEDBACK / QUESTION_REPORTS: INSERT + SELECT propio; update/delete prohibidos en cliente. --- */

create policy feedback_select_own  on public.feedback for select to authenticated using (user_id = auth.uid());
create policy feedback_insert_own  on public.feedback for insert to authenticated with check (user_id = auth.uid());

create policy question_reports_select_own on public.question_reports for select to authenticated using (user_id = auth.uid());
create policy question_reports_insert_own on public.question_reports for insert to authenticated with check (user_id = auth.uid());

/* --- ENTITLEMENTS: SELECT-only para el propio user. NINGUNA escritura cliente. --- */

create policy entitlements_select_own on public.entitlements for select to authenticated using (user_id = auth.uid());

/* =====================================================================
   FIN migration 00001.
   Notas para fases posteriores:
   - 8.2 creara trigger on_auth_user_created -> public.profiles
     (SECURITY DEFINER, SET search_path fijo) y el fallback
     upsert-if-missing si fuese necesario.
   - 8.8 creara las RPC SECURITY DEFINER de rate limiting para
     feedback/question_reports.
   - 8.9 poblara entitlements via service_role.
   ===================================================================== */

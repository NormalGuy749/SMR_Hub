/* =====================================================================
   SMR Hub — Fase 8.5.3: merge atómico de srs_cards (migration 00006)
   ------------------------------------------------------------------
   Técnica (corrección de la carrera H-1):
   Un INSERT ... ON CONFLICT (user_id, question_key) DO UPDATE donde la
   expresión del UPDATE decide el ganador en el SERVIDOR, fila a fila y
   de forma atómica. PostgreSQL serializa la operación por fila física
   (tuple lock interno en el índice de la PK), incluida la carrera de
   dos INSERT iniciales sobre la misma clave ausente (el segundo
   cliente espera al primero y re-ejecuta DO UPDATE sobre la fila ya
   insertada). Se resuelve la competencia dentro de la fila; no hay
   ventana select-then-upsert.

   Política (idéntica al cliente, fuente: js/app.js scheduleSrs y
   cabecera Fase 8.5 de js/cloud-progress.js):
     1. gana level mayor
     2. mismo level  → gana due mayor (revisión "más reciente" EMPIRICA,
        no cronológica: relojes de cliente pueden diferir)
     3. mismo level y due → gana client_updated_at mayor
     4. empate total → conserva la fila existente
   La unidad es la tarjeta entera: NEW lleva el {level,due} atómicamente
   de una sola revisión; nunca se mezclan campos de revisiones distintas
   (la expresión acepta o descarta la tarjeta COMPLETA).

   Permisos:
   - SECURITY INVOKER (no uses SECURITY DEFINER): RLS sigue siendo la
     barrera; la función se ejecuta con el uid del JWT, y el propietario
     SIEMPRE es auth.uid() (nunca un user_id del cliente).
   - Las filas insertadas/actualizadas usan v_user = auth.uid(): aunque
     el JSON contenga user_id, se ignora. La RLS de srs_cards
     (00001: policies *_own, user_id = auth.uid()) valida cada fila.
   - EXECUTE solo para authenticated; revoca a anon y public (mismo
     patrón de 00001/00005 B1 para sync_progress_chunk).

   Idempotencia (COMPROBADA, no asumida): la migración re-ejecuta sin
   error (create or replace function + grant/revoke ser repeatab le).
   ===================================================================== */

create or replace function public.merge_srs_cards(p_cards jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_card jsonb;
  v_level integer;
  v_due bigint;
  v_ts bigint;
  v_invalid_count integer := 0;
  v_applied_count integer := 0;
begin
  /* 1. Sesión obligatoria: sin usuario no hay acción y sin leaks */
  if v_user is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  /* 2. Estructura JSON: array de objetos */
  if p_cards is null or jsonb_typeof(p_cards) is distinct from 'array' then
    raise exception 'invalid payload: jsonb array expected' using errcode = '22023';
  end if;

  /* 3. Validar + resolver fila a fila. La expresoión DO UPDATE decide el
     ganador atómicamente en el insert; ignoramos las entradas inválidas
     y las apartamos en el contador para el resultado estructurado. */
  for v_card in select * from jsonb_array_elements(p_cards) loop
    begin
      v_level := (v_card->>'level')::integer;
      v_due := (v_card->>'due')::bigint;
      v_ts := coalesce((v_card->>'client_updated_at')::bigint, -1);
      if v_level is null or v_due is null
        or v_level < 0 or v_level > 5
        or v_due <= 0
        or (v_card->>'question_key') is null
        or (v_card->>'question_key') !~ '^q-[0-9a-f]{16}(-[0-9]+)?$' then
        v_invalid_count := v_invalid_count + 1;
        continue;
      end if;

      insert into public.srs_cards
        (user_id, question_key, level, due, client_updated_at)
      values
        (v_user, v_card->>'question_key', v_level, v_due, v_ts)
      on conflict (user_id, question_key) do update
        set
          level = case
            when excluded.level > srs_cards.level then excluded.level
            else srs_cards.level
          end,
          due = case
            when excluded.level > srs_cards.level then excluded.due
            when excluded.level = srs_cards.level and excluded.due > srs_cards.due then excluded.due
            else srs_cards.due
          end,
          client_updated_at = case
            when excluded.level > srs_cards.level then excluded.client_updated_at
            when excluded.level = srs_cards.level and excluded.due > srs_cards.due then excluded.client_updated_at
            when excluded.level = srs_cards.level and excluded.due = srs_cards.due
                 and excluded.client_updated_at is not null
                 and coalesce(srs_cards.client_updated_at, -1) >= 0
                 and excluded.client_updated_at > coalesce(srs_cards.client_updated_at, -1)
              then excluded.client_updated_at
            else srs_cards.client_updated_at
          end,
          updated_at = public.server_epoch_ms();

      v_applied_count := v_applied_count + 1;
    exception when others then
      v_invalid_count := v_invalid_count + 1;
    end;
  end loop;

  return jsonb_build_object(
    'applied', v_applied_count,
    'invalid', v_invalid_count
  );
end;
$$;

/* 4. Permisos: solo authenticated. revoke de anon/public (mismo patrón
   que 00005 B1). Sin SECURITY DEFINER: RLS srs_cards aplica. */
grant execute on function public.merge_srs_cards(jsonb) to authenticated;
revoke execute on function public.merge_srs_cards(jsonb) from public;
revoke execute on function public.merge_srs_cards(jsonb) from anon;

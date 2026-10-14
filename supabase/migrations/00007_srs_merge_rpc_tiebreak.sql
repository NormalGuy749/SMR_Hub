/* =====================================================================
   SMR Hub — Fase 8.5.3-E: corrección del desempate temporal de
   merge_srs_cards (migration 00007, correctiva de 00006).

   Defecto (H-2 de la auditoría 8.5.3-R, verificado contra
   pg_get_functiondef instalada):
   En la expresión del DO UPDATE, la rama de desempate exigía
     coalesce(srs_cards.client_updated_at, -1) >= 0
   Con una fila existente cuyo client_updated_at es NULL, coalesce da -1
   y la condición es falsa: la fila existente NUNCA pierde el desempate,
   contradiciendo la política aprobada (el cliente trata ts ausente como
   -1 y el entrante mayor gana). Además había dos expresiones separadas
   para decidir "ganador" (level/due por un lado, ts por otro), lo que
   permitía incoherencias entre ramas.

   Corrección: una ÚNICA función de ganador reutilizada por los tres
   campos. Gana la tarjeta entrante si:
     1) level entrante > level existente, o
     2) level iguales y due entrante > due existente, o
     3) level y due iguales y
        coalesce(ts entrante,-1) > coalesce(ts existente,-1).
   Si no, se conserva la fila existente. {level, due} viajan SIEMPRE
   juntos (unidad inseparable); el ts de la fila final es el de la
   tarjeta ganadora real.

   Sin cambios de esquema, sin last_reviewed_at, sin cambia RLS.
   SECURITY INVOKER y permisos idénticos a 00006 (grant/revoke repetidos
   para ser idempotente tras un restore parcial).
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
  if v_user is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  if p_cards is null or jsonb_typeof(p_cards) is distinct from 'array' then
    raise exception 'invalid payload: jsonb array expected' using errcode = '22023';
  end if;

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
        (v_user, v_card->>'question_key', v_level, v_due, nullif(v_ts, -1))
      on conflict (user_id, question_key) do update
        set
          level = case when excluded.level > srs_cards.level
                        or (excluded.level = srs_cards.level
                            and (excluded.due > srs_cards.due
                                 or (excluded.due = srs_cards.due
                                     and coalesce(excluded.client_updated_at, -1)
                                       > coalesce(srs_cards.client_updated_at, -1))))
                      then excluded.level
                      else srs_cards.level end,
          due = case when excluded.level > srs_cards.level
                      or (excluded.level = srs_cards.level
                          and (excluded.due > srs_cards.due
                               or (excluded.due = srs_cards.due
                                   and coalesce(excluded.client_updated_at, -1)
                                     > coalesce(srs_cards.client_updated_at, -1))))
                    then excluded.due
                    else srs_cards.due end,
          client_updated_at = case when excluded.level > srs_cards.level
                                    or (excluded.level = srs_cards.level
                                        and (excluded.due > srs_cards.due
                                             or (excluded.due = srs_cards.due
                                                 and coalesce(excluded.client_updated_at, -1)
                                                   > coalesce(srs_cards.client_updated_at, -1))))
                                  then excluded.client_updated_at
                                  else srs_cards.client_updated_at end,
          updated_at = public.server_epoch_ms();

      v_applied_count := v_applied_count + 1;
    exception when others then
      v_invalid_count := v_invalid_count + 1;
    end;
  end loop;

  return jsonb_build_object('applied', v_applied_count, 'invalid', v_invalid_count);
end;
$$;

/*EXECUTE: authenticated (uso directo) y authenticator (PostgREST ejecuta
   vía authenticator→SET ROLE del JWT; sin este grant PGRST202 a un
   usuario autenticado real, hallazgo de la fase 8.5.3-E HTTP). */
grant execute on function public.merge_srs_cards(jsonb) to authenticated;
grant execute on function public.merge_srs_cards(jsonb) to authenticator;
revoke execute on function public.merge_srs_cards(jsonb) from public;
revoke execute on function public.merge_srs_cards(jsonb) from anon;

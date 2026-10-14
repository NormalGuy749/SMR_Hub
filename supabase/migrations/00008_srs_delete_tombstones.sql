/* =====================================================================
   SMR Hub — Fase 8.5.7: borrado de tarjetas SRS con tombstones.

   Problema (decisión B de 8.5.0, pendiente desde 8.5.4): dropSrs() solo
   borraba la tarjeta local. El cloud conservaba la fila y el pull
   siguiente la reinstalaba (resurrección), también desde cualquier otro
   dispositivo con copia local obsoleta.

   Sentinel level = -1 / due = -1 DESCARTADO con evidencia: la tabla
   srs_cards tiene constraint srs_cards_level_range check (level between
   0 and 5) y el RPC 00007 rechaza (v_level < 0 or v_due <= 0) contando
   la entrada como inválida: no se aplicaría y la tarjeta seguiría viva.

   Estrategia mínima elegida (misma que resource_state.completed_cleared_at,
   el patrón de borrado que ya existe en el proyecto):
     1. Columna nueva srs_cards.deleted_at (bigint, NULL = viva). El
        borrado se representa con la fila marcada (tombstone); no hay
        DELETE remoto ni tabla nueva.
     2. deleted_at es PEGAJOSO: ninguna tarjeta viva lo limpia por sí
        sola, ni siquiera una con level mayor. Solo lo limpia un revive
        EXPLÍCITO del mismo propietario (campo "revived": true), que es
        lo que envía el cliente cuando el usuario vuelve a valorar una
        pregunta borrada (hook scheduleSrs). Así un push obsoleto de otro
        dispositivo nunca resucita una tarjeta borrada.
     3. La unidad {level, due, client_updated_at} sigue la política
        aprobada de 00007 (idéntica expresión de ganador); el tombstone
        no participa en esa comparación (level/due inertes 0/1) y
        deleted_at se resuelve aparte.
     4. deleted_at lo sella el SERVIDOR (server_epoch_ms): no se comparan
        relojes de dispositivos para decidir un borrado.
     5. RLS sin cambios: la política srs_cards_*_own ya cubre select/
        insert/update/delete propios; el revive corre como invoker.

   Payload por tarjeta (jsonb): {question_key, level, due,
   client_updated_at, revived?} para vivas; {question_key, deleted: true}
   para tombstones. Compatible hacia atrás: un cliente antiguo (sin
   "deleted"/"revived") se comporta exactamente como en 00007.

   Sin commit ni aplicación remota en esta fase: el archivo se aplica
   solo a la BD local de staging tras revisión.
   ===================================================================== */

alter table public.srs_cards
  add column if not exists deleted_at bigint;

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
  v_del boolean;
  v_rev boolean;
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
      v_del := coalesce((v_card->>'deleted')::boolean, false);
      v_rev := coalesce((v_card->>'revived')::boolean, false);
      v_ts := coalesce((v_card->>'client_updated_at')::bigint, -1);

      /* Clave inválida: no se toca nada (ni tarjeta ni tombstone). */
      if (v_card->>'question_key') is null
        or (v_card->>'question_key') !~ '^q-[0-9a-f]{16}(-[0-9]+)?$' then
        v_invalid_count := v_invalid_count + 1;
        continue;
      end if;

      if v_del then
        /* TOMBSTONE: la clave es lo único obligatorio; {level,due} del
           tombstone son inertes (0/1) y satisfacen el CHECK existente.
           deleted_at lo sella el servidor al insertar/actualizar. */
        v_level := 0;
        v_due := 1;
      else
        v_level := (v_card->>'level')::integer;
        v_due := (v_card->>'due')::bigint;
        if v_level is null or v_due is null
          or v_level < 0 or v_level > 5
          or v_due <= 0 then
          v_invalid_count := v_invalid_count + 1;
          continue;
        end if;
        /* REVIVE explícito: el propietario volvió a valorar esta tarjeta
           después de borrarla. Se limpia el tombstone ANTES del merge;
           la política normal decide después {level, due, ts}. */
        if v_rev then
          update public.srs_cards
             set deleted_at = null,
                 updated_at = public.server_epoch_ms()
           where user_id = v_user
             and question_key = v_card->>'question_key'
             and deleted_at is not null;
        end if;
      end if;

      insert into public.srs_cards
        (user_id, question_key, level, due, client_updated_at, deleted_at)
      values
        (v_user, v_card->>'question_key', v_level, v_due,
         case when v_del then null else nullif(v_ts, -1) end,
         case when v_del then public.server_epoch_ms() else null end)
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
          /* Borrado PEGAJOSO: un tombstone entrante fija/renueva la marca
             con su sello servidor; ninguna tarjeta viva la limpia. */
          deleted_at = case when excluded.deleted_at is not null
                            then greatest(excluded.deleted_at,
                                          coalesce(srs_cards.deleted_at, excluded.deleted_at))
                            else srs_cards.deleted_at end,
          updated_at = public.server_epoch_ms();

      v_applied_count := v_applied_count + 1;
    exception when others then
      v_invalid_count := v_invalid_count + 1;
    end;
  end loop;

  return jsonb_build_object('applied', v_applied_count, 'invalid', v_invalid_count);
end;
$$;

/* Permisos idénticos a 00007 (repetidos para ser idempotente). */
grant execute on function public.merge_srs_cards(jsonb) to authenticated;
grant execute on function public.merge_srs_cards(jsonb) to authenticator;
revoke execute on function public.merge_srs_cards(jsonb) from public;
revoke execute on function public.merge_srs_cards(jsonb) from anon;

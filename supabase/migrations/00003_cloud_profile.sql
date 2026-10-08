/* =====================================================================
   SMR Hub — Fase 8.3: Cloud Profile (migration 00003)
   ------------------------------------------------------------------
   Un solo hueco de modelo: al ACTUALIZAR public.profiles por la vía
   cliente (PostgREST), la columna updated_at tiene default solo en
   INSERT. Sin este trigger, o la fila conservaría su updated_at
   original, o el cliente tendría que enviarlo (y podría falsificarlo),
   rompiendo la convención server-side de 8.0 v2.

   Este BEFORE UPDATE fuerza SIEMPRE:
     NEW.updated_at := public.server_epoch_ms()
   (el valor que enviara el cliente se descarta: nunca decide el LWW).

   Idempotente (drop trigger if exists), sin FKs, sin credenciales,
   compatible con el trigger on_auth_user_created de 00002 y con RLS
   owner-only intacto.
   ===================================================================== */

create or replace function public.touch_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := public.server_epoch_ms();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_profiles_updated_at();

/* =====================================================================
   SMR Hub — Fase 8.2: Supabase Authentication (migration 00002)
   ------------------------------------------------------------------
   Trigger de provisioning: auth.users -> public.profiles (v2 §9, 8.0.2).

   Características de seguridad:
   - SECURITY DEFINER: la inserción se ejecuta como propietario de la
     tabla y NO puede ser invocada por el cliente para elegir user_id
     arbitrarios: la función no acepta argumentos y solo inserta NEW.id
     (el id que acaba de crear auth.users).
   - SET search_path = '': path fijo vacío; todas las referencias son
     totalmente cualificadas (public.profiles) — patrón recomendado por
     Supabase para functions SECURITY DEFINER.
   - Idempotente: ON CONFLICT (user_id) DO NOTHING (compatible con el
     fallback client-side de ensureProfile tras SIGNED_IN).
   - Hygiene: se revoca EXECUTE a public/anon/authenticated (el trigger
     no la necesita: corre como owner).

   RLS de profiles (00001) queda intacto: el dueño sigue pudiendo leer y
   actualizar SU fila; nadie puede leer las de otros.
   ===================================================================== */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

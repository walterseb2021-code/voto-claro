-- ============================================================================
-- BSEC PROJECT PARTICIPANTS - DEVICE UPDATE RPC
--
-- Fase 1:
--   Encapsula la unica mutacion runtime directa restante sobre
--   public.project_participants: actualizacion legacy de device_id en login.
--
-- Esta migracion NO modifica:
--   - RLS de project_participants
--   - ACL de la tabla
--   - datos existentes
-- ============================================================================

do $$
declare
  v_owner text;
begin

  if pg_catalog.to_regclass(
    'public.project_participants'
  ) is null then
    raise exception
      'BSEC_PARTICIPANT_DEVICE_ABORT: table missing';
  end if;

  select pg_catalog.pg_get_userbyid(c.relowner)
    into v_owner
  from pg_catalog.pg_class as c
  where c.oid =
    'public.project_participants'::pg_catalog.regclass;

  if v_owner is distinct from 'postgres' then
    raise exception
      'BSEC_PARTICIPANT_DEVICE_ABORT: unexpected table owner';
  end if;

  if pg_catalog.to_regprocedure(
    'public.update_project_participant_device_id_secure(uuid,text)'
  ) is not null then
    raise exception
      'BSEC_PARTICIPANT_DEVICE_ABORT: RPC already exists';
  end if;

end
$$;

create function public.update_project_participant_device_id_secure(
  p_participant_id uuid,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_device_id text;
begin

  if p_participant_id is null then
    raise exception using
      errcode = '22023',
      message = 'participant_device_invalid';
  end if;

  v_device_id :=
    pg_catalog.btrim(
      coalesce(p_device_id, '')
    );

  if pg_catalog.length(v_device_id) < 1
     or pg_catalog.length(v_device_id) > 120 then
    raise exception using
      errcode = '22023',
      message = 'participant_device_invalid';
  end if;

  update public.project_participants
     set device_id = v_device_id
   where id = p_participant_id;

end;
$function$;

alter function public.update_project_participant_device_id_secure(
  uuid,
  text
)
owner to postgres;

revoke all
on function public.update_project_participant_device_id_secure(
  uuid,
  text
)
from public;

revoke all
on function public.update_project_participant_device_id_secure(
  uuid,
  text
)
from anon;

revoke all
on function public.update_project_participant_device_id_secure(
  uuid,
  text
)
from authenticated;

grant execute
on function public.update_project_participant_device_id_secure(
  uuid,
  text
)
to service_role;

do $$
declare
  v_rpc regprocedure;
begin

  v_rpc :=
    pg_catalog.to_regprocedure(
      'public.update_project_participant_device_id_secure(uuid,text)'
    );

  if v_rpc is null then
    raise exception
      'BSEC_PARTICIPANT_DEVICE_POSTFAIL: RPC missing';
  end if;

  if (
    select pg_catalog.pg_get_userbyid(p.proowner)
    from pg_catalog.pg_proc as p
    where p.oid = v_rpc
  ) is distinct from 'postgres' then
    raise exception
      'BSEC_PARTICIPANT_DEVICE_POSTFAIL: owner invalid';
  end if;

  if not (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_rpc
  ) then
    raise exception
      'BSEC_PARTICIPANT_DEVICE_POSTFAIL: not SECURITY DEFINER';
  end if;

  if not (
    select coalesce(
      'search_path=pg_catalog' = any(p.proconfig),
      false
    )
    from pg_catalog.pg_proc as p
    where p.oid = v_rpc
  ) then
    raise exception
      'BSEC_PARTICIPANT_DEVICE_POSTFAIL: unsafe search_path';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    v_rpc,
    'EXECUTE'
  ) then
    raise exception
      'BSEC_PARTICIPANT_DEVICE_POSTFAIL: service_role EXECUTE missing';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       v_rpc,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       v_rpc,
       'EXECUTE'
     ) then
    raise exception
      'BSEC_PARTICIPANT_DEVICE_POSTFAIL: client EXECUTE present';
  end if;

end
$$;
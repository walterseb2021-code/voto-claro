-- ============================================================================
-- BSEC PROJECT PARTICIPANTS - PHASE 2
-- FINAL RLS / ACL HARDENING
--
-- Objetivo:
--   1. Activar RLS en public.project_participants.
--   2. No crear policies publicas.
--   3. Eliminar todo acceso directo de anon/authenticated.
--   4. Reducir service_role a SELECT directo solamente.
--   5. Mantener mutaciones exclusivamente mediante RPC SECURITY DEFINER.
--   6. Cerrar el helper generar_codigo_acceso() al acceso directo.
--
-- Esta migracion NO:
--   - elimina participantes;
--   - modifica datos existentes;
--   - crea policies publicas;
--   - modifica FORCE ROW LEVEL SECURITY;
--   - modifica los RPC seguros de registro/device.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
  v_table_owner text;
  v_policy_count integer;
  v_register regprocedure;
  v_device regprocedure;
  v_generator regprocedure;
begin

  if pg_catalog.to_regclass(
    'public.project_participants'
  ) is null then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: table missing';
  end if;


  select
    pg_catalog.pg_get_userbyid(c.relowner)
  into
    v_table_owner
  from pg_catalog.pg_class as c
  where c.oid =
    'public.project_participants'::pg_catalog.regclass;


  if v_table_owner is distinct from 'postgres' then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: unexpected table owner';
  end if;


  if (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.project_participants'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: RLS already enabled';
  end if;


  if (
    select c.relforcerowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.project_participants'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: FORCE RLS unexpectedly enabled';
  end if;


  select count(*)::integer
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'project_participants';


  if v_policy_count <> 0 then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: unexpected policies';
  end if;


  -- service_role debe conservar su atributo BYPASSRLS.
  if not coalesce(
    (
      select r.rolbypassrls
      from pg_catalog.pg_roles as r
      where r.rolname = 'service_role'
    ),
    false
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: service_role lacks BYPASSRLS';
  end if;


  -- anon/authenticated no deben poder saltar RLS.
  if coalesce(
    (
      select r.rolbypassrls
      from pg_catalog.pg_roles as r
      where r.rolname = 'anon'
    ),
    false
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: anon has BYPASSRLS';
  end if;


  if coalesce(
    (
      select r.rolbypassrls
      from pg_catalog.pg_roles as r
      where r.rolname = 'authenticated'
    ),
    false
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: authenticated has BYPASSRLS';
  end if;


  -- --------------------------------------------------------------------------
  -- ACL actual esperado: service_role
  -- --------------------------------------------------------------------------

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_participants',
    'SELECT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_participants',
    'INSERT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_participants',
    'UPDATE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_participants',
    'DELETE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_participants',
    'TRUNCATE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_participants',
    'REFERENCES'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_participants',
    'TRIGGER'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_participants',
    'MAINTAIN'
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: unexpected service_role ACL baseline';
  end if;


  -- --------------------------------------------------------------------------
  -- ACL actual esperado: anon
  -- --------------------------------------------------------------------------

  if not pg_catalog.has_table_privilege(
    'anon',
    'public.project_participants',
    'SELECT'
  )
  or not pg_catalog.has_table_privilege(
    'anon',
    'public.project_participants',
    'INSERT'
  )
  or not pg_catalog.has_table_privilege(
    'anon',
    'public.project_participants',
    'UPDATE'
  )
  or not pg_catalog.has_table_privilege(
    'anon',
    'public.project_participants',
    'DELETE'
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: unexpected anon ACL baseline';
  end if;


  -- --------------------------------------------------------------------------
  -- ACL actual esperado: authenticated
  -- --------------------------------------------------------------------------

  if not pg_catalog.has_table_privilege(
    'authenticated',
    'public.project_participants',
    'SELECT'
  )
  or not pg_catalog.has_table_privilege(
    'authenticated',
    'public.project_participants',
    'INSERT'
  )
  or not pg_catalog.has_table_privilege(
    'authenticated',
    'public.project_participants',
    'UPDATE'
  )
  or not pg_catalog.has_table_privilege(
    'authenticated',
    'public.project_participants',
    'DELETE'
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: unexpected authenticated ACL baseline';
  end if;


  -- --------------------------------------------------------------------------
  -- RPC seguro de registro
  -- --------------------------------------------------------------------------

  v_register :=
    pg_catalog.to_regprocedure(
      'public.register_project_participant_secure(text,text,text,text,text,text,text,text,boolean,text,text,text,timestamp with time zone)'
    );


  if v_register is null then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: register RPC missing';
  end if;


  if (
    select pg_catalog.pg_get_userbyid(p.proowner)
    from pg_catalog.pg_proc as p
    where p.oid = v_register
  ) is distinct from 'postgres' then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: register RPC owner invalid';
  end if;


  if not (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_register
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: register RPC not SECURITY DEFINER';
  end if;


  if not pg_catalog.has_function_privilege(
    'service_role',
    v_register,
    'EXECUTE'
  )
  or pg_catalog.has_function_privilege(
    'anon',
    v_register,
    'EXECUTE'
  )
  or pg_catalog.has_function_privilege(
    'authenticated',
    v_register,
    'EXECUTE'
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: register RPC ACL invalid';
  end if;


  -- --------------------------------------------------------------------------
  -- RPC seguro de device_id
  -- --------------------------------------------------------------------------

  v_device :=
    pg_catalog.to_regprocedure(
      'public.update_project_participant_device_id_secure(uuid,text)'
    );


  if v_device is null then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: device RPC missing';
  end if;


  if (
    select pg_catalog.pg_get_userbyid(p.proowner)
    from pg_catalog.pg_proc as p
    where p.oid = v_device
  ) is distinct from 'postgres' then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: device RPC owner invalid';
  end if;


  if not (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_device
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: device RPC not SECURITY DEFINER';
  end if;


  if not pg_catalog.has_function_privilege(
    'service_role',
    v_device,
    'EXECUTE'
  )
  or pg_catalog.has_function_privilege(
    'anon',
    v_device,
    'EXECUTE'
  )
  or pg_catalog.has_function_privilege(
    'authenticated',
    v_device,
    'EXECUTE'
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: device RPC ACL invalid';
  end if;


  -- --------------------------------------------------------------------------
  -- Helper interno generar_codigo_acceso()
  -- --------------------------------------------------------------------------

  v_generator :=
    pg_catalog.to_regprocedure(
      'public.generar_codigo_acceso()'
    );


  if v_generator is null then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: generator missing';
  end if;


  if (
    select pg_catalog.pg_get_userbyid(p.proowner)
    from pg_catalog.pg_proc as p
    where p.oid = v_generator
  ) is distinct from 'postgres' then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: generator owner invalid';
  end if;


  if (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_generator
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: generator unexpectedly SECURITY DEFINER';
  end if;


  if not pg_catalog.has_function_privilege(
    'service_role',
    v_generator,
    'EXECUTE'
  )
  or not pg_catalog.has_function_privilege(
    'anon',
    v_generator,
    'EXECUTE'
  )
  or not pg_catalog.has_function_privilege(
    'authenticated',
    v_generator,
    'EXECUTE'
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_ABORT: generator ACL baseline changed';
  end if;

end
$$;


-- ============================================================================
-- 1. ENABLE RLS
-- ============================================================================

alter table public.project_participants
  enable row level security;


-- ============================================================================
-- 2. REMOVE DIRECT TABLE PRIVILEGES
-- ============================================================================

revoke all privileges
on table public.project_participants
from public;

revoke all privileges
on table public.project_participants
from anon;

revoke all privileges
on table public.project_participants
from authenticated;

revoke all privileges
on table public.project_participants
from service_role;


-- Backend server routes only require direct reads.
grant select
on table public.project_participants
to service_role;


-- ============================================================================
-- 3. HARDEN INTERNAL ACCESS-CODE GENERATOR
--
-- No runtime code calls this helper directly.
-- register_project_participant_secure() executes as postgres and may continue
-- invoking this helper internally.
-- ============================================================================

alter function public.generar_codigo_acceso()
  set search_path = pg_catalog;

revoke all
on function public.generar_codigo_acceso()
from public;

revoke all
on function public.generar_codigo_acceso()
from anon;

revoke all
on function public.generar_codigo_acceso()
from authenticated;

revoke all
on function public.generar_codigo_acceso()
from service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
  v_policy_count integer;
  v_register regprocedure;
  v_device regprocedure;
  v_generator regprocedure;
begin

  -- --------------------------------------------------------------------------
  -- RLS
  -- --------------------------------------------------------------------------

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.project_participants'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: RLS disabled';
  end if;


  if (
    select c.relforcerowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.project_participants'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: FORCE RLS changed';
  end if;


  select count(*)::integer
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'project_participants';


  if v_policy_count <> 0 then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: policies created unexpectedly';
  end if;


  -- --------------------------------------------------------------------------
  -- service_role = SELECT only
  -- --------------------------------------------------------------------------

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_participants',
    'SELECT'
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: service_role SELECT missing';
  end if;


  if pg_catalog.has_table_privilege(
       'service_role',
       'public.project_participants',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.project_participants',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.project_participants',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.project_participants',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.project_participants',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.project_participants',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.project_participants',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: service_role excessive privilege';
  end if;


  -- --------------------------------------------------------------------------
  -- anon = no direct access
  -- --------------------------------------------------------------------------

  if pg_catalog.has_table_privilege(
       'anon',
       'public.project_participants',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.project_participants',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.project_participants',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.project_participants',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.project_participants',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.project_participants',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.project_participants',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.project_participants',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: anon direct privilege remains';
  end if;


  -- --------------------------------------------------------------------------
  -- authenticated = no direct access
  -- --------------------------------------------------------------------------

  if pg_catalog.has_table_privilege(
       'authenticated',
       'public.project_participants',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.project_participants',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.project_participants',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.project_participants',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.project_participants',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.project_participants',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.project_participants',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.project_participants',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: authenticated direct privilege remains';
  end if;


  -- --------------------------------------------------------------------------
  -- Secure RPCs must remain unchanged.
  -- --------------------------------------------------------------------------

  v_register :=
    pg_catalog.to_regprocedure(
      'public.register_project_participant_secure(text,text,text,text,text,text,text,text,boolean,text,text,text,timestamp with time zone)'
    );

  v_device :=
    pg_catalog.to_regprocedure(
      'public.update_project_participant_device_id_secure(uuid,text)'
    );


  if v_register is null or v_device is null then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: secure RPC missing';
  end if;


  if not pg_catalog.has_function_privilege(
       'service_role',
       v_register,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       v_device,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       v_register,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       v_register,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       v_device,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       v_device,
       'EXECUTE'
     ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: secure RPC ACL changed';
  end if;


  -- --------------------------------------------------------------------------
  -- Internal helper must no longer be externally executable.
  -- --------------------------------------------------------------------------

  v_generator :=
    pg_catalog.to_regprocedure(
      'public.generar_codigo_acceso()'
    );


  if v_generator is null then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: generator missing';
  end if;


  if (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_generator
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: generator SECURITY DEFINER changed';
  end if;


  if not (
    select coalesce(
      'search_path=pg_catalog' = any(p.proconfig),
      false
    )
    from pg_catalog.pg_proc as p
    where p.oid = v_generator
  ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: generator search_path invalid';
  end if;


  if pg_catalog.has_function_privilege(
       'service_role',
       v_generator,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       v_generator,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       v_generator,
       'EXECUTE'
     ) then
    raise exception
      'BSEC_PROJECT_PARTICIPANTS_PHASE2_POSTFAIL: generator externally executable';
  end if;

end
$$;
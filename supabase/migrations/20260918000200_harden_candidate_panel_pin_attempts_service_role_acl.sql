-- ============================================================================
-- BSEC CANDIDATE PANEL PIN ATTEMPTS - ACL HARDENING
--
-- Objetivo:
--   Eliminar TODO acceso directo de service_role sobre
--   public.candidate_panel_pin_attempts.
--
-- Toda operacion runtime queda encapsulada en RPC SECURITY DEFINER
-- postgres-owned.
--
-- NO modifica datos.
-- NO elimina intentos.
-- NO modifica funciones.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PREFLIGHT
-- ---------------------------------------------------------------------------

do $$
declare
  v_owner text;
  v_rls boolean;
  v_force_rls boolean;
  v_policy_count integer;
  v_trigger_count integer;
  v_signature text;
  v_oid oid;

  v_functions constant text[] := array[
    'public.check_candidate_panel_pin_rate_limit(text,text)',
    'public.cleanup_candidate_panel_auth_state()',
    'public.disable_candidate_panel_access(text,bigint,text)',
    'public.record_candidate_panel_pin_failure(text,text)',
    'public.reset_candidate_panel_pin_rate_limit(text,text)',
    'public.rotate_candidate_access_code(text,bigint,text)'
  ];
begin

  if pg_catalog.to_regclass(
    'public.candidate_panel_pin_attempts'
  ) is null then
    raise exception
      'BSEC_PIN_ATTEMPTS_ACL_ABORT: table missing';
  end if;

  select
    pg_catalog.pg_get_userbyid(c.relowner),
    c.relrowsecurity,
    c.relforcerowsecurity
  into
    v_owner,
    v_rls,
    v_force_rls
  from pg_catalog.pg_class as c
  where c.oid =
    'public.candidate_panel_pin_attempts'::pg_catalog.regclass;

  if v_owner <> 'postgres' then
    raise exception
      'BSEC_PIN_ATTEMPTS_ACL_ABORT: unexpected owner %',
      v_owner;
  end if;

  if v_rls is not true then
    raise exception
      'BSEC_PIN_ATTEMPTS_ACL_ABORT: RLS not enabled';
  end if;

  if v_force_rls is true then
    raise exception
      'BSEC_PIN_ATTEMPTS_ACL_ABORT: FORCE RLS unexpectedly enabled';
  end if;

  select pg_catalog.count(*)::integer
    into v_policy_count
  from pg_catalog.pg_policy
  where polrelid =
    'public.candidate_panel_pin_attempts'::pg_catalog.regclass;

  if v_policy_count <> 0 then
    raise exception
      'BSEC_PIN_ATTEMPTS_ACL_ABORT: unexpected policies %',
      v_policy_count;
  end if;

  select pg_catalog.count(*)::integer
    into v_trigger_count
  from pg_catalog.pg_trigger
  where tgrelid =
    'public.candidate_panel_pin_attempts'::pg_catalog.regclass
    and not tgisinternal;

  if v_trigger_count <> 0 then
    raise exception
      'BSEC_PIN_ATTEMPTS_ACL_ABORT: unexpected user triggers %',
      v_trigger_count;
  end if;

  -- Estado esperado antes del hardening.
  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_pin_attempts',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_pin_attempts',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_pin_attempts',
       'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_pin_attempts',
       'DELETE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_pin_attempts',
       'TRUNCATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_pin_attempts',
       'REFERENCES'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_pin_attempts',
       'TRIGGER'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_pin_attempts',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_PIN_ATTEMPTS_ACL_ABORT: unexpected service_role baseline';
  end if;

  foreach v_signature in array v_functions loop

    v_oid := pg_catalog.to_regprocedure(v_signature);

    if v_oid is null then
      raise exception
        'BSEC_PIN_ATTEMPTS_ACL_ABORT: missing function %',
        v_signature;
    end if;

    if (
      select pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
      from pg_catalog.pg_proc as p
      where p.oid = v_oid
    ) then
      raise exception
        'BSEC_PIN_ATTEMPTS_ACL_ABORT: unexpected owner %',
        v_signature;
    end if;

    if not (
      select p.prosecdef
      from pg_catalog.pg_proc as p
      where p.oid = v_oid
    ) then
      raise exception
        'BSEC_PIN_ATTEMPTS_ACL_ABORT: function is not SECURITY DEFINER %',
        v_signature;
    end if;

    if not (
      select coalesce(
        'search_path=pg_catalog' = any(p.proconfig),
        false
      )
      from pg_catalog.pg_proc as p
      where p.oid = v_oid
    ) then
      raise exception
        'BSEC_PIN_ATTEMPTS_ACL_ABORT: unsafe search_path %',
        v_signature;
    end if;

    if not pg_catalog.has_function_privilege(
      'service_role',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_PIN_ATTEMPTS_ACL_ABORT: service_role EXECUTE missing %',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'anon',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_PIN_ATTEMPTS_ACL_ABORT: anon EXECUTE present %',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'authenticated',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_PIN_ATTEMPTS_ACL_ABORT: authenticated EXECUTE present %',
        v_signature;
    end if;

  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- ACL HARDENING
-- ---------------------------------------------------------------------------

revoke all privileges
on table public.candidate_panel_pin_attempts
from public;

revoke all privileges
on table public.candidate_panel_pin_attempts
from anon;

revoke all privileges
on table public.candidate_panel_pin_attempts
from authenticated;

revoke all privileges
on table public.candidate_panel_pin_attempts
from service_role;

-- ---------------------------------------------------------------------------
-- POSTFLIGHT
-- ---------------------------------------------------------------------------

do $$
declare
  v_role text;
begin

  foreach v_role in array array[
    'service_role',
    'anon',
    'authenticated'
  ] loop

    if pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_pin_attempts',
         'SELECT'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_pin_attempts',
         'INSERT'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_pin_attempts',
         'UPDATE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_pin_attempts',
         'DELETE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_pin_attempts',
         'TRUNCATE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_pin_attempts',
         'REFERENCES'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_pin_attempts',
         'TRIGGER'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_pin_attempts',
         'MAINTAIN'
       ) then
      raise exception
        'BSEC_PIN_ATTEMPTS_ACL_POSTFAIL: privilege remains for %',
        v_role;
    end if;

  end loop;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.candidate_panel_pin_attempts'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PIN_ATTEMPTS_ACL_POSTFAIL: RLS changed';
  end if;

end
$$;
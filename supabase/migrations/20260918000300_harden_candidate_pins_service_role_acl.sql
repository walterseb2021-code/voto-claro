-- ============================================================================
-- BSEC CANDIDATE PINS - SERVICE ROLE ACL HARDENING
--
-- Objetivo:
--   Mantener para service_role solamente SELECT directo sobre
--   public.votoclaro_candidate_pins.
--
-- Las mutaciones quedan encapsuladas en funciones SECURITY DEFINER
-- postgres-owned.
--
-- NO modifica datos.
-- NO elimina credenciales.
-- NO modifica triggers.
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

  v_trigger_function oid;
  v_signature text;
  v_oid oid;

  v_functions constant text[] := array[
    'public.create_candidate_panel_session_if_active(text,bigint,text,timestamp with time zone)',
    'public.disable_candidate_panel_access(text,bigint,text)',
    'public.rotate_candidate_access_code(text,bigint,text)'
  ];
begin

  if pg_catalog.to_regclass(
    'public.votoclaro_candidate_pins'
  ) is null then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: table missing';
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
    'public.votoclaro_candidate_pins'::pg_catalog.regclass;

  if v_owner <> 'postgres' then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: unexpected owner %',
      v_owner;
  end if;

  if v_rls is not true then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: RLS not enabled';
  end if;

  if v_force_rls is true then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: FORCE RLS unexpectedly enabled';
  end if;

  select pg_catalog.count(*)::integer
    into v_policy_count
  from pg_catalog.pg_policy
  where polrelid =
    'public.votoclaro_candidate_pins'::pg_catalog.regclass;

  if v_policy_count <> 0 then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: unexpected policies %',
      v_policy_count;
  end if;

  -- Debe existir exactamente el trigger conocido de updated_at.
  select pg_catalog.count(*)::integer
    into v_trigger_count
  from pg_catalog.pg_trigger
  where tgrelid =
    'public.votoclaro_candidate_pins'::pg_catalog.regclass
    and not tgisinternal;

  if v_trigger_count <> 1 then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: unexpected trigger count %',
      v_trigger_count;
  end if;

  select t.tgfoid
    into v_trigger_function
  from pg_catalog.pg_trigger as t
  where t.tgrelid =
      'public.votoclaro_candidate_pins'::pg_catalog.regclass
    and not t.tgisinternal
    and t.tgname = 'trg_votoclaro_pins_updated_at';

  if v_trigger_function is null then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: expected trigger missing';
  end if;

  if v_trigger_function <>
     pg_catalog.to_regprocedure(
       'public.votoclaro_set_updated_at()'
     ) then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: unexpected trigger function';
  end if;

  if (
    select pg_catalog.pg_get_userbyid(p.proowner)
    from pg_catalog.pg_proc as p
    where p.oid = v_trigger_function
  ) <> 'postgres' then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: unexpected trigger function owner';
  end if;

  -- Estado ACL esperado antes del hardening.
  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'DELETE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'TRUNCATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'REFERENCES'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'TRIGGER'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_ABORT: unexpected service_role baseline';
  end if;

  foreach v_signature in array v_functions loop

    v_oid := pg_catalog.to_regprocedure(v_signature);

    if v_oid is null then
      raise exception
        'BSEC_CANDIDATE_PINS_ACL_ABORT: missing function %',
        v_signature;
    end if;

    if (
      select pg_catalog.pg_get_userbyid(p.proowner)
      from pg_catalog.pg_proc as p
      where p.oid = v_oid
    ) <> 'postgres' then
      raise exception
        'BSEC_CANDIDATE_PINS_ACL_ABORT: unexpected owner %',
        v_signature;
    end if;

    if not (
      select p.prosecdef
      from pg_catalog.pg_proc as p
      where p.oid = v_oid
    ) then
      raise exception
        'BSEC_CANDIDATE_PINS_ACL_ABORT: not SECURITY DEFINER %',
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
        'BSEC_CANDIDATE_PINS_ACL_ABORT: unsafe search_path %',
        v_signature;
    end if;

    if not pg_catalog.has_function_privilege(
      'service_role',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_CANDIDATE_PINS_ACL_ABORT: service_role EXECUTE missing %',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'anon',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_CANDIDATE_PINS_ACL_ABORT: anon EXECUTE present %',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'authenticated',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_CANDIDATE_PINS_ACL_ABORT: authenticated EXECUTE present %',
        v_signature;
    end if;

  end loop;

end
$$;

-- ---------------------------------------------------------------------------
-- ACL HARDENING
-- ---------------------------------------------------------------------------

revoke all privileges
on table public.votoclaro_candidate_pins
from public;

revoke all privileges
on table public.votoclaro_candidate_pins
from anon;

revoke all privileges
on table public.votoclaro_candidate_pins
from authenticated;

revoke insert, update, delete, truncate, references, trigger, maintain
on table public.votoclaro_candidate_pins
from service_role;

grant select
on table public.votoclaro_candidate_pins
to service_role;

-- ---------------------------------------------------------------------------
-- POSTFLIGHT
-- ---------------------------------------------------------------------------

do $$
declare
  v_role text;
begin

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.votoclaro_candidate_pins',
    'SELECT'
  ) then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_POSTFAIL: SELECT missing';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_candidate_pins',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_POSTFAIL: excess service_role privilege remains';
  end if;

  foreach v_role in array array[
    'anon',
    'authenticated'
  ] loop

    if pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_candidate_pins',
         'SELECT'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_candidate_pins',
         'INSERT'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_candidate_pins',
         'UPDATE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_candidate_pins',
         'DELETE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_candidate_pins',
         'TRUNCATE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_candidate_pins',
         'REFERENCES'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_candidate_pins',
         'TRIGGER'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_candidate_pins',
         'MAINTAIN'
       ) then
      raise exception
        'BSEC_CANDIDATE_PINS_ACL_POSTFAIL: unexpected privilege for %',
        v_role;
    end if;

  end loop;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.votoclaro_candidate_pins'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_CANDIDATE_PINS_ACL_POSTFAIL: RLS changed';
  end if;

end
$$;
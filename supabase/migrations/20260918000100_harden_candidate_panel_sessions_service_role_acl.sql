-- ============================================================================
-- BSEC CANDIDATE PANEL SESSIONS - PHASE 2 ACL
--
-- Objetivo:
--   Mantener para service_role solamente SELECT directo sobre
--   public.candidate_panel_sessions.
--
-- Escrituras quedan encapsuladas en RPC SECURITY DEFINER postgres-owned.
--
-- NO modifica datos.
-- NO elimina sesiones.
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
  v_function_signatures constant text[] := array[
    'public.cleanup_candidate_panel_auth_state()',
    'public.create_candidate_panel_session_if_active(text,bigint,text,timestamp with time zone)',
    'public.disable_candidate_panel_access(text,bigint,text)',
    'public.revoke_candidate_panel_session_by_token_hash(text)',
    'public.revoke_candidate_panel_sessions_for_candidate(text)',
    'public.rotate_candidate_access_code(text,bigint,text)',
    'public.touch_candidate_panel_session(uuid)'
  ];
begin
  if pg_catalog.to_regclass('public.candidate_panel_sessions') is null then
    raise exception 'BSEC_CANDIDATE_PANEL_ACL_ABORT: table missing';
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
  where c.oid = 'public.candidate_panel_sessions'::pg_catalog.regclass;

  if v_owner <> 'postgres' then
    raise exception
      'BSEC_CANDIDATE_PANEL_ACL_ABORT: unexpected owner %',
      v_owner;
  end if;

  if v_rls is not true then
    raise exception
      'BSEC_CANDIDATE_PANEL_ACL_ABORT: RLS not enabled';
  end if;

  if v_force_rls is true then
    raise exception
      'BSEC_CANDIDATE_PANEL_ACL_ABORT: FORCE RLS unexpectedly enabled';
  end if;

  select pg_catalog.count(*)::integer
    into v_policy_count
  from pg_catalog.pg_policy
  where polrelid = 'public.candidate_panel_sessions'::pg_catalog.regclass;

  if v_policy_count <> 0 then
    raise exception
      'BSEC_CANDIDATE_PANEL_ACL_ABORT: unexpected policies %',
      v_policy_count;
  end if;

  select pg_catalog.count(*)::integer
    into v_trigger_count
  from pg_catalog.pg_trigger
  where tgrelid = 'public.candidate_panel_sessions'::pg_catalog.regclass
    and not tgisinternal;

  if v_trigger_count <> 0 then
    raise exception
      'BSEC_CANDIDATE_PANEL_ACL_ABORT: unexpected user triggers %',
      v_trigger_count;
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'SELECT'
  ) then
    raise exception
      'BSEC_CANDIDATE_PANEL_ACL_ABORT: service_role SELECT missing';
  end if;

  foreach v_signature in array v_function_signatures loop
    v_oid := pg_catalog.to_regprocedure(v_signature);

    if v_oid is null then
      raise exception
        'BSEC_CANDIDATE_PANEL_ACL_ABORT: missing function %',
        v_signature;
    end if;

    if (
      select pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
      from pg_catalog.pg_proc as p
      where p.oid = v_oid
    ) then
      raise exception
        'BSEC_CANDIDATE_PANEL_ACL_ABORT: unexpected function owner %',
        v_signature;
    end if;

    if not (
      select p.prosecdef
      from pg_catalog.pg_proc as p
      where p.oid = v_oid
    ) then
      raise exception
        'BSEC_CANDIDATE_PANEL_ACL_ABORT: function is not SECURITY DEFINER %',
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
        'BSEC_CANDIDATE_PANEL_ACL_ABORT: unsafe search_path %',
        v_signature;
    end if;

    if not pg_catalog.has_function_privilege(
      'service_role',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_CANDIDATE_PANEL_ACL_ABORT: service_role EXECUTE missing %',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'anon',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_CANDIDATE_PANEL_ACL_ABORT: anon EXECUTE present %',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'authenticated',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_CANDIDATE_PANEL_ACL_ABORT: authenticated EXECUTE present %',
        v_signature;
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- ACL HARDENING
-- ---------------------------------------------------------------------------

revoke all privileges
on table public.candidate_panel_sessions
from public;

revoke all privileges
on table public.candidate_panel_sessions
from anon;

revoke all privileges
on table public.candidate_panel_sessions
from authenticated;

revoke insert, update, delete, truncate, references, trigger, maintain
on table public.candidate_panel_sessions
from service_role;

grant select
on table public.candidate_panel_sessions
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
    'public.candidate_panel_sessions',
    'SELECT'
  ) then
    raise exception
      'BSEC_CANDIDATE_PANEL_ACL_POSTFAIL: service_role SELECT missing';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_sessions',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_sessions',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_sessions',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_sessions',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_sessions',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_sessions',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_panel_sessions',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_CANDIDATE_PANEL_ACL_POSTFAIL: service_role excess privilege remains';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_sessions',
         'SELECT'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_sessions',
         'INSERT'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_sessions',
         'UPDATE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_sessions',
         'DELETE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_sessions',
         'TRUNCATE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_sessions',
         'REFERENCES'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_sessions',
         'TRIGGER'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.candidate_panel_sessions',
         'MAINTAIN'
       ) then
      raise exception
        'BSEC_CANDIDATE_PANEL_ACL_POSTFAIL: unexpected privilege for %',
        v_role;
    end if;
  end loop;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid = 'public.candidate_panel_sessions'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_CANDIDATE_PANEL_ACL_POSTFAIL: RLS changed';
  end if;
end
$$;
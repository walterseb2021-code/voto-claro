-- ============================================================
-- B-SEC CANDIDATE PANEL SESSIONS
-- PHASE 1: HARDEN RUNTIME MUTATIONS BEHIND RPC
--
-- IMPORTANT:
-- - This phase DOES NOT reduce candidate_panel_sessions ACL.
-- - Runtime migration and ACL reduction are separate later phases.
-- - The three remaining direct UPDATE paths are encapsulated here.
-- ============================================================

begin;

-- ============================================================
-- PREFLIGHT
-- ============================================================

do $preflight$
declare
  v_owner text;
  v_rls boolean;
  v_policy_count integer;
  v_existing_rpc_count integer;
begin
  if pg_catalog.to_regclass(
    'public.candidate_panel_sessions'
  ) is null then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_PRE_TABLE_MISSING';
  end if;

  select
    pg_catalog.pg_get_userbyid(c.relowner),
    c.relrowsecurity
  into
    v_owner,
    v_rls
  from pg_catalog.pg_class c
  where c.oid =
    'public.candidate_panel_sessions'::pg_catalog.regclass;

  if v_owner <> 'postgres' then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_PRE_OWNER_INVALID';
  end if;

  if not v_rls then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_PRE_RLS_DISABLED';
  end if;

  select pg_catalog.count(*)::integer
  into v_policy_count
  from pg_catalog.pg_policy p
  where p.polrelid =
    'public.candidate_panel_sessions'::pg_catalog.regclass;

  if v_policy_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_PRE_POLICIES_UNEXPECTED';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'SELECT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'INSERT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'UPDATE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'DELETE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'TRUNCATE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'REFERENCES'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'TRIGGER'
  ) then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_PRE_SERVICE_ROLE_ACL_UNEXPECTED';
  end if;

  if pg_catalog.has_table_privilege(
    'anon',
    'public.candidate_panel_sessions',
    'SELECT'
  )
  or pg_catalog.has_table_privilege(
    'anon',
    'public.candidate_panel_sessions',
    'INSERT'
  )
  or pg_catalog.has_table_privilege(
    'anon',
    'public.candidate_panel_sessions',
    'UPDATE'
  )
  or pg_catalog.has_table_privilege(
    'anon',
    'public.candidate_panel_sessions',
    'DELETE'
  )
  or pg_catalog.has_table_privilege(
    'authenticated',
    'public.candidate_panel_sessions',
    'SELECT'
  )
  or pg_catalog.has_table_privilege(
    'authenticated',
    'public.candidate_panel_sessions',
    'INSERT'
  )
  or pg_catalog.has_table_privilege(
    'authenticated',
    'public.candidate_panel_sessions',
    'UPDATE'
  )
  or pg_catalog.has_table_privilege(
    'authenticated',
    'public.candidate_panel_sessions',
    'DELETE'
  ) then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_PRE_BROWSER_ACL_UNEXPECTED';
  end if;

  -- Existing hardened infrastructure must still exist.
  if pg_catalog.to_regprocedure(
    'public.create_candidate_panel_session_if_active(text,bigint,text,timestamp with time zone)'
  ) is null
  or pg_catalog.to_regprocedure(
    'public.cleanup_candidate_panel_auth_state()'
  ) is null
  or pg_catalog.to_regprocedure(
    'public.disable_candidate_panel_access(text,bigint,text)'
  ) is null
  or pg_catalog.to_regprocedure(
    'public.rotate_candidate_access_code(text,bigint,text)'
  ) is null then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_PRE_DEPENDENCY_MISSING';
  end if;

  -- New function names must not already exist under another
  -- definition or overload.
  select pg_catalog.count(*)::integer
  into v_existing_rpc_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'touch_candidate_panel_session',
      'revoke_candidate_panel_session_by_token_hash',
      'revoke_candidate_panel_sessions_for_candidate'
    );

  if v_existing_rpc_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_PRE_NEW_RPC_ALREADY_EXISTS';
  end if;
end
$preflight$;

-- ============================================================
-- RPC 1
-- Touch a known server-side candidate session.
-- Replaces direct UPDATE of last_seen_at.
-- ============================================================

create function public.touch_candidate_panel_session(
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_updated integer := 0;
begin
  if p_session_id is null then
    return false;
  end if;

  update public.candidate_panel_sessions
     set last_seen_at = pg_catalog.now()
   where id = p_session_id;

  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;

alter function public.touch_candidate_panel_session(uuid)
  owner to postgres;

revoke all
  on function public.touch_candidate_panel_session(uuid)
  from public;

revoke all
  on function public.touch_candidate_panel_session(uuid)
  from anon;

revoke all
  on function public.touch_candidate_panel_session(uuid)
  from authenticated;

grant execute
  on function public.touch_candidate_panel_session(uuid)
  to service_role;

-- ============================================================
-- RPC 2
-- Revoke one session by server-side SHA-256 token hash.
-- Replaces direct UPDATE during logout/unlock rotation.
-- ============================================================

create function public.revoke_candidate_panel_session_by_token_hash(
  p_token_hash text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_token_hash text := pg_catalog.btrim(p_token_hash);
  v_updated integer := 0;
begin
  if v_token_hash is null
     or pg_catalog.length(v_token_hash) = 0
     or pg_catalog.length(v_token_hash) > 256 then
    return false;
  end if;

  update public.candidate_panel_sessions
     set revoked_at = pg_catalog.now()
   where token_hash = v_token_hash
     and revoked_at is null;

  get diagnostics v_updated = row_count;

  return v_updated = 1;
end;
$$;

alter function
  public.revoke_candidate_panel_session_by_token_hash(text)
  owner to postgres;

revoke all
  on function
    public.revoke_candidate_panel_session_by_token_hash(text)
  from public;

revoke all
  on function
    public.revoke_candidate_panel_session_by_token_hash(text)
  from anon;

revoke all
  on function
    public.revoke_candidate_panel_session_by_token_hash(text)
  from authenticated;

grant execute
  on function
    public.revoke_candidate_panel_session_by_token_hash(text)
  to service_role;

-- ============================================================
-- RPC 3
-- Revoke all active sessions for one candidate.
-- Current helper has no external runtime consumer, but keeping
-- this capability behind an RPC avoids retaining direct UPDATE.
-- ============================================================

create function public.revoke_candidate_panel_sessions_for_candidate(
  p_candidate_id text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_updated integer := 0;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) = 0
     or pg_catalog.length(v_candidate_id) > 256 then
    return 0;
  end if;

  update public.candidate_panel_sessions
     set revoked_at = pg_catalog.now()
   where candidate_id = v_candidate_id
     and revoked_at is null;

  get diagnostics v_updated = row_count;

  return v_updated;
end;
$$;

alter function
  public.revoke_candidate_panel_sessions_for_candidate(text)
  owner to postgres;

revoke all
  on function
    public.revoke_candidate_panel_sessions_for_candidate(text)
  from public;

revoke all
  on function
    public.revoke_candidate_panel_sessions_for_candidate(text)
  from anon;

revoke all
  on function
    public.revoke_candidate_panel_sessions_for_candidate(text)
  from authenticated;

grant execute
  on function
    public.revoke_candidate_panel_sessions_for_candidate(text)
  to service_role;

-- ============================================================
-- POSTFLIGHT
-- ============================================================

do $postflight$
declare
  v_oid oid;
  v_owner text;
  v_security_definer boolean;
  v_safe_search_path boolean;
  v_public_execute_count integer;
  v_signature text;
  v_signatures text[] := array[
    'public.touch_candidate_panel_session(uuid)',
    'public.revoke_candidate_panel_session_by_token_hash(text)',
    'public.revoke_candidate_panel_sessions_for_candidate(text)'
  ];
begin
  foreach v_signature in array v_signatures
  loop
    v_oid :=
      pg_catalog.to_regprocedure(v_signature)::oid;

    if v_oid is null then
      raise exception using
        errcode = 'P0001',
        message =
          'CANDIDATE_PANEL_SESSION_RPC_POST_RPC_MISSING';
    end if;

    select
      pg_catalog.pg_get_userbyid(p.proowner),
      p.prosecdef,
      coalesce(
        p.proconfig @>
          array['search_path=pg_catalog'],
        false
      )
    into
      v_owner,
      v_security_definer,
      v_safe_search_path
    from pg_catalog.pg_proc p
    where p.oid = v_oid;

    if v_owner <> 'postgres' then
      raise exception using
        errcode = 'P0001',
        message =
          'CANDIDATE_PANEL_SESSION_RPC_POST_OWNER_INVALID';
    end if;

    if not v_security_definer then
      raise exception using
        errcode = 'P0001',
        message =
          'CANDIDATE_PANEL_SESSION_RPC_POST_SECURITY_DEFINER_INVALID';
    end if;

    if not v_safe_search_path then
      raise exception using
        errcode = 'P0001',
        message =
          'CANDIDATE_PANEL_SESSION_RPC_POST_SEARCH_PATH_INVALID';
    end if;

    if not pg_catalog.has_function_privilege(
      'service_role',
      v_oid,
      'EXECUTE'
    ) then
      raise exception using
        errcode = 'P0001',
        message =
          'CANDIDATE_PANEL_SESSION_RPC_POST_SERVICE_EXECUTE_MISSING';
    end if;

    if pg_catalog.has_function_privilege(
      'anon',
      v_oid,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      v_oid,
      'EXECUTE'
    ) then
      raise exception using
        errcode = 'P0001',
        message =
          'CANDIDATE_PANEL_SESSION_RPC_POST_BROWSER_EXECUTE_PRESENT';
    end if;

    select pg_catalog.count(*)::integer
    into v_public_execute_count
    from pg_catalog.aclexplode(
      (
        select p.proacl
        from pg_catalog.pg_proc p
        where p.oid = v_oid
      )
    ) acl
    where acl.grantee = 0
      and acl.privilege_type = 'EXECUTE';

    if v_public_execute_count <> 0 then
      raise exception using
        errcode = 'P0001',
        message =
          'CANDIDATE_PANEL_SESSION_RPC_POST_PUBLIC_EXECUTE_PRESENT';
    end if;
  end loop;

  -- Phase 1 must NOT change table privileges.
  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'SELECT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'INSERT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'UPDATE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'DELETE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'TRUNCATE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'REFERENCES'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.candidate_panel_sessions',
    'TRIGGER'
  ) then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_POST_TABLE_ACL_CHANGED';
  end if;

  if pg_catalog.has_table_privilege(
    'anon',
    'public.candidate_panel_sessions',
    'SELECT'
  )
  or pg_catalog.has_table_privilege(
    'anon',
    'public.candidate_panel_sessions',
    'INSERT'
  )
  or pg_catalog.has_table_privilege(
    'anon',
    'public.candidate_panel_sessions',
    'UPDATE'
  )
  or pg_catalog.has_table_privilege(
    'anon',
    'public.candidate_panel_sessions',
    'DELETE'
  )
  or pg_catalog.has_table_privilege(
    'authenticated',
    'public.candidate_panel_sessions',
    'SELECT'
  )
  or pg_catalog.has_table_privilege(
    'authenticated',
    'public.candidate_panel_sessions',
    'INSERT'
  )
  or pg_catalog.has_table_privilege(
    'authenticated',
    'public.candidate_panel_sessions',
    'UPDATE'
  )
  or pg_catalog.has_table_privilege(
    'authenticated',
    'public.candidate_panel_sessions',
    'DELETE'
  ) then
    raise exception using
      errcode = 'P0001',
      message =
        'CANDIDATE_PANEL_SESSION_RPC_POST_BROWSER_ACL_CHANGED';
  end if;
end
$postflight$;

commit;

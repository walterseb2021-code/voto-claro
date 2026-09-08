begin;

do $preflight$
declare
  v_create_rpc oid;
  v_state_rpc oid;
begin
  if to_regclass('public.votoclaro_public_links') is null then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_TABLE_MISSING';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'votoclaro_public_links'
      and c.relkind = 'r'
      and c.relrowsecurity = true
      and pg_get_userbyid(c.relowner) = 'postgres'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_TABLE_SECURITY_INVALID';
  end if;

  if exists (
    select 1
    from pg_policy p
    join pg_class c
      on c.oid = p.polrelid
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'votoclaro_public_links'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_POLICIES_UNEXPECTED';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.votoclaro_public_links',
    'SELECT'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_SERVICE_SELECT_MISSING';
  end if;

  if has_table_privilege(
    'service_role',
    'public.votoclaro_public_links',
    'INSERT'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_SERVICE_INSERT_UNEXPECTED';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.votoclaro_public_links',
    'UPDATE'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_SERVICE_UPDATE_MISSING';
  end if;

  if has_table_privilege(
    'service_role',
    'public.votoclaro_public_links',
    'DELETE'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_SERVICE_DELETE_UNEXPECTED';
  end if;

  if
    has_table_privilege(
      'anon',
      'public.votoclaro_public_links',
      'SELECT'
    )
    or has_table_privilege(
      'anon',
      'public.votoclaro_public_links',
      'INSERT'
    )
    or has_table_privilege(
      'anon',
      'public.votoclaro_public_links',
      'UPDATE'
    )
    or has_table_privilege(
      'anon',
      'public.votoclaro_public_links',
      'DELETE'
    )
    or has_table_privilege(
      'authenticated',
      'public.votoclaro_public_links',
      'SELECT'
    )
    or has_table_privilege(
      'authenticated',
      'public.votoclaro_public_links',
      'INSERT'
    )
    or has_table_privilege(
      'authenticated',
      'public.votoclaro_public_links',
      'UPDATE'
    )
    or has_table_privilege(
      'authenticated',
      'public.votoclaro_public_links',
      'DELETE'
    )
  then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_CLIENT_PRIVILEGES_UNEXPECTED';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where n.nspname = 'public'
      and c.relname = 'votoclaro_public_links'
      and a.grantee = 0
      and a.privilege_type in (
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE'
      )
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_PUBLIC_PRIVILEGES_UNEXPECTED';
  end if;

  v_create_rpc :=
    to_regprocedure(
      'public.create_pitch_access_token_admin(text,text,timestamptz,text,text,uuid)'
    );

  v_state_rpc :=
    to_regprocedure(
      'public.set_pitch_access_token_state_admin(uuid,boolean,timestamptz,text,text,uuid)'
    );

  if v_create_rpc is null or v_state_rpc is null then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_RPC_MISSING';
  end if;

  if exists (
    select 1
    from pg_proc p
    where p.oid in (v_create_rpc, v_state_rpc)
      and (
        p.prosecdef is not true
        or pg_get_userbyid(p.proowner) <> 'postgres'
        or not (
          coalesce(p.proconfig, array[]::text[])
          @> array['search_path=pg_catalog']::text[]
        )
      )
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_RPC_SECURITY_INVALID';
  end if;

  if
    not has_function_privilege(
      'service_role',
      v_create_rpc,
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      v_state_rpc,
      'EXECUTE'
    )
  then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_SERVICE_RPC_EXECUTE_MISSING';
  end if;

  if
    has_function_privilege(
      'anon',
      v_create_rpc,
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      v_state_rpc,
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      v_create_rpc,
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      v_state_rpc,
      'EXECUTE'
    )
  then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_CLIENT_RPC_EXECUTE_UNEXPECTED';
  end if;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid in (v_create_rpc, v_state_rpc)
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_PREFLIGHT_PUBLIC_RPC_EXECUTE_UNEXPECTED';
  end if;
end
$preflight$;

revoke update
on table public.votoclaro_public_links
from service_role;

do $postflight$
declare
  v_create_rpc oid;
  v_state_rpc oid;
begin
  if not has_table_privilege(
    'service_role',
    'public.votoclaro_public_links',
    'SELECT'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_SERVICE_SELECT_MISSING';
  end if;

  if
    has_table_privilege(
      'service_role',
      'public.votoclaro_public_links',
      'INSERT'
    )
    or has_table_privilege(
      'service_role',
      'public.votoclaro_public_links',
      'UPDATE'
    )
    or has_table_privilege(
      'service_role',
      'public.votoclaro_public_links',
      'DELETE'
    )
  then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_SERVICE_WRITE_REMAINS';
  end if;

  if
    has_table_privilege(
      'anon',
      'public.votoclaro_public_links',
      'SELECT'
    )
    or has_table_privilege(
      'anon',
      'public.votoclaro_public_links',
      'INSERT'
    )
    or has_table_privilege(
      'anon',
      'public.votoclaro_public_links',
      'UPDATE'
    )
    or has_table_privilege(
      'anon',
      'public.votoclaro_public_links',
      'DELETE'
    )
    or has_table_privilege(
      'authenticated',
      'public.votoclaro_public_links',
      'SELECT'
    )
    or has_table_privilege(
      'authenticated',
      'public.votoclaro_public_links',
      'INSERT'
    )
    or has_table_privilege(
      'authenticated',
      'public.votoclaro_public_links',
      'UPDATE'
    )
    or has_table_privilege(
      'authenticated',
      'public.votoclaro_public_links',
      'DELETE'
    )
  then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_CLIENT_PRIVILEGES_UNEXPECTED';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'votoclaro_public_links'
      and c.relkind = 'r'
      and c.relrowsecurity = true
      and pg_get_userbyid(c.relowner) = 'postgres'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_TABLE_SECURITY_INVALID';
  end if;

  if exists (
    select 1
    from pg_policy p
    join pg_class c
      on c.oid = p.polrelid
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'votoclaro_public_links'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_POLICIES_UNEXPECTED';
  end if;

  v_create_rpc :=
    to_regprocedure(
      'public.create_pitch_access_token_admin(text,text,timestamptz,text,text,uuid)'
    );

  v_state_rpc :=
    to_regprocedure(
      'public.set_pitch_access_token_state_admin(uuid,boolean,timestamptz,text,text,uuid)'
    );

  if v_create_rpc is null or v_state_rpc is null then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_RPC_MISSING';
  end if;

  if exists (
    select 1
    from pg_proc p
    where p.oid in (v_create_rpc, v_state_rpc)
      and (
        p.prosecdef is not true
        or pg_get_userbyid(p.proowner) <> 'postgres'
        or not (
          coalesce(p.proconfig, array[]::text[])
          @> array['search_path=pg_catalog']::text[]
        )
      )
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_RPC_SECURITY_INVALID';
  end if;

  if
    not has_function_privilege(
      'service_role',
      v_create_rpc,
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      v_state_rpc,
      'EXECUTE'
    )
  then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_SERVICE_RPC_EXECUTE_MISSING';
  end if;

  if
    has_function_privilege(
      'anon',
      v_create_rpc,
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      v_state_rpc,
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      v_create_rpc,
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      v_state_rpc,
      'EXECUTE'
    )
  then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_CLIENT_RPC_EXECUTE_UNEXPECTED';
  end if;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid in (v_create_rpc, v_state_rpc)
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PITCH_PUBLIC_LINKS_POSTFLIGHT_PUBLIC_RPC_EXECUTE_UNEXPECTED';
  end if;
end
$postflight$;

commit;
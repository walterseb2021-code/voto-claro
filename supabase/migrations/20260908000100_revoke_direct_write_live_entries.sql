-- B-SEC LIVE FASE 4
-- Revoke direct runtime write privileges from service_role on
-- public.votoclaro_live_entries after every live mutation path has
-- been migrated to narrow SECURITY DEFINER RPCs and production-tested.

begin;

do $$
declare
  v_rls_enabled boolean;
  v_owner text;
  v_signature text;
  v_proc regprocedure;
begin
  select c.relrowsecurity, pg_catalog.pg_get_userbyid(c.relowner)
    into v_rls_enabled, v_owner
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n
      on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'votoclaro_live_entries'
     and c.relkind = 'r';

  if not coalesce(v_rls_enabled, false) then
    raise exception using
      errcode = 'P0001',
      message = 'LIVE_REVOKE_PREFLIGHT_RLS_NOT_ENABLED';
  end if;

  if v_owner is distinct from 'postgres' then
    raise exception using
      errcode = 'P0001',
      message = 'LIVE_REVOKE_PREFLIGHT_UNEXPECTED_OWNER';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'SELECT'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'LIVE_REVOKE_PREFLIGHT_SERVICE_SELECT_MISSING';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'DELETE'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'LIVE_REVOKE_PREFLIGHT_SERVICE_DML_NOT_FULLY_PRESENT';
  end if;

  if pg_catalog.has_table_privilege(
       'anon',
       'public.votoclaro_live_entries',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.votoclaro_live_entries',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.votoclaro_live_entries',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.votoclaro_live_entries',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.votoclaro_live_entries',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.votoclaro_live_entries',
       'DELETE'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'LIVE_REVOKE_PREFLIGHT_CLIENT_DML_PRESENT';
  end if;

  for v_signature in
    select signature
    from (
      values
        ('public.create_candidate_live_entry(text,text,text,text)'),
        ('public.create_candidate_ended_live_entry(text,text,text,text)'),
        ('public.finish_candidate_live_entry(uuid,text)'),
        ('public.delete_candidate_live_entry(uuid,text)'),
        ('public.delete_live_entry_admin(uuid,text,uuid)'),
        ('public.delete_candidate_live_history_admin(text,text,uuid)')
    ) as required(signature)
  loop
    v_proc := pg_catalog.to_regprocedure(v_signature);

    if v_proc is null then
      raise exception using
        errcode = 'P0001',
        message = 'LIVE_REVOKE_PREFLIGHT_REQUIRED_RPC_MISSING',
        detail = v_signature;
    end if;

    if not pg_catalog.has_function_privilege(
         'service_role',
         v_proc,
         'EXECUTE'
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'LIVE_REVOKE_PREFLIGHT_SERVICE_EXECUTE_MISSING',
        detail = v_signature;
    end if;

    if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
       or pg_catalog.has_function_privilege(
         'authenticated',
         v_proc,
         'EXECUTE'
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'LIVE_REVOKE_PREFLIGHT_CLIENT_EXECUTE_PRESENT',
        detail = v_signature;
    end if;
  end loop;
end
$$;

revoke insert, update, delete
  on table public.votoclaro_live_entries
  from service_role;

grant select
  on table public.votoclaro_live_entries
  to service_role;

do $$
declare
  v_signature text;
  v_proc regprocedure;
begin
  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'SELECT'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'LIVE_REVOKE_POSTFLIGHT_SERVICE_SELECT_MISSING';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'DELETE'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'LIVE_REVOKE_POSTFLIGHT_SERVICE_DML_PRESENT';
  end if;

  if pg_catalog.has_table_privilege(
       'anon',
       'public.votoclaro_live_entries',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.votoclaro_live_entries',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.votoclaro_live_entries',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.votoclaro_live_entries',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.votoclaro_live_entries',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.votoclaro_live_entries',
       'DELETE'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'LIVE_REVOKE_POSTFLIGHT_CLIENT_DML_PRESENT';
  end if;

  for v_signature in
    select signature
    from (
      values
        ('public.create_candidate_live_entry(text,text,text,text)'),
        ('public.create_candidate_ended_live_entry(text,text,text,text)'),
        ('public.finish_candidate_live_entry(uuid,text)'),
        ('public.delete_candidate_live_entry(uuid,text)'),
        ('public.delete_live_entry_admin(uuid,text,uuid)'),
        ('public.delete_candidate_live_history_admin(text,text,uuid)')
    ) as required(signature)
  loop
    v_proc := pg_catalog.to_regprocedure(v_signature);

    if v_proc is null
       or not pg_catalog.has_function_privilege(
         'service_role',
         v_proc,
         'EXECUTE'
       )
       or pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
       or pg_catalog.has_function_privilege(
         'authenticated',
         v_proc,
         'EXECUTE'
       ) then
      raise exception using
        errcode = 'P0001',
        message = 'LIVE_REVOKE_POSTFLIGHT_RPC_PRIVILEGE_INVALID',
        detail = v_signature;
    end if;
  end loop;
end
$$;

commit;

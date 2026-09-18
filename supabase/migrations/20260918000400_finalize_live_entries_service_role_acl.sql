-- ============================================================================
-- BSEC CANDIDATE LIVE - FINAL TABLE ACL HARDENING
--
-- Objetivo:
--   public.votoclaro_live_entries:
--
--   service_role  -> SELECT solamente
--   anon          -> SELECT solamente
--   authenticated -> SELECT solamente
--
-- Las escrituras quedan encapsuladas en RPC SECURITY DEFINER.
--
-- Esta migracion NO modifica:
--   - datos
--   - RLS
--   - policy publica SELECT
--   - trigger updated_at
--   - replica identity
--   - publicaciones Realtime
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
  v_publication_count integer;

  v_signature text;
  v_oid oid;

  v_functions constant text[] := array[
    'public.create_candidate_live_entry(text,text,text,text)',
    'public.create_candidate_ended_live_entry(text,text,text,text)',
    'public.finish_candidate_live_entry(uuid,text)',
    'public.delete_candidate_live_entry(uuid,text)',
    'public.delete_live_entry_admin(uuid,text,uuid)',
    'public.delete_candidate_live_history_admin(text,text,uuid)'
  ];
begin

  if pg_catalog.to_regclass(
    'public.votoclaro_live_entries'
  ) is null then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: table missing';
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
    'public.votoclaro_live_entries'::pg_catalog.regclass;

  if v_owner <> 'postgres' then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: unexpected owner %',
      v_owner;
  end if;

  if v_rls is not true then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: RLS not enabled';
  end if;

  if v_force_rls is true then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: FORCE RLS unexpectedly enabled';
  end if;

  -- Debe permanecer exactamente la policy publica SELECT conocida.
  select pg_catalog.count(*)::integer
    into v_policy_count
  from pg_catalog.pg_policies as p
  where p.schemaname = 'public'
    and p.tablename = 'votoclaro_live_entries'
    and p.policyname = 'live_entries_public_select'
    and p.cmd = 'SELECT';

  if v_policy_count <> 1 then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: public SELECT policy unexpected';
  end if;

  -- Debe permanecer exactamente el trigger conocido.
  select pg_catalog.count(*)::integer
    into v_trigger_count
  from pg_catalog.pg_trigger as t
  where t.tgrelid =
      'public.votoclaro_live_entries'::pg_catalog.regclass
    and not t.tgisinternal
    and t.tgname = 'trg_votoclaro_live_entries_updated_at'
    and t.tgfoid =
      pg_catalog.to_regprocedure(
        'public.votoclaro_set_updated_at()'
      );

  if v_trigger_count <> 1 then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: expected trigger missing or changed';
  end if;

  -- Ambas publicaciones deben seguir presentes.
  select pg_catalog.count(*)::integer
    into v_publication_count
  from pg_catalog.pg_publication_tables as pt
  where pt.schemaname = 'public'
    and pt.tablename = 'votoclaro_live_entries'
    and pt.pubname in (
      'supabase_realtime',
      'votoclaro_realtime_pub'
    );

  if v_publication_count <> 2 then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: publication membership changed';
  end if;

  -- ----------------------------------------------------------
  -- ACL BASELINE ACTUAL
  -- ----------------------------------------------------------

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
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
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'TRUNCATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'REFERENCES'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'TRIGGER'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.votoclaro_live_entries',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: unexpected service_role baseline';
  end if;

  if not pg_catalog.has_table_privilege(
       'anon',
       'public.votoclaro_live_entries',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
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
     or not pg_catalog.has_table_privilege(
       'anon',
       'public.votoclaro_live_entries',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: unexpected anon baseline';
  end if;

  if not pg_catalog.has_table_privilege(
       'authenticated',
       'public.votoclaro_live_entries',
       'SELECT'
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
     )
     or not pg_catalog.has_table_privilege(
       'authenticated',
       'public.votoclaro_live_entries',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_LIVE_FINAL_ACL_ABORT: unexpected authenticated baseline';
  end if;

  -- ----------------------------------------------------------
  -- RPC SECURITY
  -- ----------------------------------------------------------

  foreach v_signature in array v_functions loop

    v_oid := pg_catalog.to_regprocedure(v_signature);

    if v_oid is null then
      raise exception
        'BSEC_LIVE_FINAL_ACL_ABORT: missing RPC %',
        v_signature;
    end if;

    if (
      select pg_catalog.pg_get_userbyid(p.proowner)
      from pg_catalog.pg_proc as p
      where p.oid = v_oid
    ) <> 'postgres' then
      raise exception
        'BSEC_LIVE_FINAL_ACL_ABORT: unexpected RPC owner %',
        v_signature;
    end if;

    if not (
      select p.prosecdef
      from pg_catalog.pg_proc as p
      where p.oid = v_oid
    ) then
      raise exception
        'BSEC_LIVE_FINAL_ACL_ABORT: RPC not SECURITY DEFINER %',
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
        'BSEC_LIVE_FINAL_ACL_ABORT: unsafe RPC search_path %',
        v_signature;
    end if;

    if not pg_catalog.has_function_privilege(
      'service_role',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_LIVE_FINAL_ACL_ABORT: service_role EXECUTE missing %',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'anon',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_LIVE_FINAL_ACL_ABORT: anon EXECUTE present %',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'authenticated',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_LIVE_FINAL_ACL_ABORT: authenticated EXECUTE present %',
        v_signature;
    end if;

  end loop;

end
$$;

-- ---------------------------------------------------------------------------
-- ACL HARDENING
-- ---------------------------------------------------------------------------

revoke all privileges
on table public.votoclaro_live_entries
from public;

revoke all privileges
on table public.votoclaro_live_entries
from service_role;

revoke all privileges
on table public.votoclaro_live_entries
from anon;

revoke all privileges
on table public.votoclaro_live_entries
from authenticated;

grant select
on table public.votoclaro_live_entries
to service_role;

grant select
on table public.votoclaro_live_entries
to anon;

grant select
on table public.votoclaro_live_entries
to authenticated;

-- ---------------------------------------------------------------------------
-- POSTFLIGHT
-- ---------------------------------------------------------------------------

do $$
declare
  v_role text;
  v_publication_count integer;
begin

  foreach v_role in array array[
    'service_role',
    'anon',
    'authenticated'
  ] loop

    if not pg_catalog.has_table_privilege(
      v_role,
      'public.votoclaro_live_entries',
      'SELECT'
    ) then
      raise exception
        'BSEC_LIVE_FINAL_ACL_POSTFAIL: SELECT missing for %',
        v_role;
    end if;

    if pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_live_entries',
         'INSERT'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_live_entries',
         'UPDATE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_live_entries',
         'DELETE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_live_entries',
         'TRUNCATE'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_live_entries',
         'REFERENCES'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_live_entries',
         'TRIGGER'
       )
       or pg_catalog.has_table_privilege(
         v_role,
         'public.votoclaro_live_entries',
         'MAINTAIN'
       ) then
      raise exception
        'BSEC_LIVE_FINAL_ACL_POSTFAIL: excess privilege for %',
        v_role;
    end if;

  end loop;

  -- Confirmar que RLS sigue activo.
  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.votoclaro_live_entries'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_LIVE_FINAL_ACL_POSTFAIL: RLS changed';
  end if;

  -- Confirmar que ambas publicaciones siguen intactas.
  select pg_catalog.count(*)::integer
    into v_publication_count
  from pg_catalog.pg_publication_tables as pt
  where pt.schemaname = 'public'
    and pt.tablename = 'votoclaro_live_entries'
    and pt.pubname in (
      'supabase_realtime',
      'votoclaro_realtime_pub'
    );

  if v_publication_count <> 2 then
    raise exception
      'BSEC_LIVE_FINAL_ACL_POSTFAIL: publication membership changed';
  end if;

end
$$;
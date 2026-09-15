-- B-SEC WEEKLY TOPICS
-- Close direct service_role table mutation privileges.
-- Weekly-topic mutations must go through the hardened SECURITY DEFINER RPCs.

begin;

-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $preflight$
declare
  v_rpc_count integer;
begin
  if pg_catalog.to_regclass('public.weekly_topics') is null then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: weekly_topics missing';
  end if;

  if pg_catalog.to_regclass('public.weekly_topics_queue') is null then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: weekly_topics_queue missing';
  end if;

  if (
    select pg_catalog.pg_get_userbyid(c.relowner)
      from pg_catalog.pg_class as c
     where c.oid = pg_catalog.to_regclass('public.weekly_topics')
  ) <> 'postgres' then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: unexpected weekly_topics owner';
  end if;

  if (
    select pg_catalog.pg_get_userbyid(c.relowner)
      from pg_catalog.pg_class as c
     where c.oid = pg_catalog.to_regclass('public.weekly_topics_queue')
  ) <> 'postgres' then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: unexpected weekly_topics_queue owner';
  end if;

  -- Existing state must still match the audited production baseline.
  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'DELETE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'TRUNCATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'REFERENCES'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'TRIGGER'
     ) then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: weekly_topics ACL baseline changed';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'DELETE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'TRUNCATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'REFERENCES'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'TRIGGER'
     ) then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: weekly_topics_queue ACL baseline changed';
  end if;

  -- Structural protection must still exist.
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = pg_catalog.to_regclass('public.weekly_topics')
       and conname = 'weekly_topics_status_check'
       and contype = 'c'
  ) then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: weekly_topics status check missing';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = pg_catalog.to_regclass('public.weekly_topics_queue')
       and conname = 'weekly_topics_queue_status_check'
       and contype = 'c'
  ) then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: queue status check missing';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_index
     where indexrelid =
           pg_catalog.to_regclass('public.weekly_topics_one_active_uniq')
       and indisunique
  ) then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: active unique index missing';
  end if;

  -- All six mutation RPCs must remain hardened.
  select pg_catalog.count(*)::integer
    into v_rpc_count
    from pg_catalog.pg_proc as p
   where p.oid = any (
     array[
       pg_catalog.to_regprocedure(
         'public.publish_weekly_winner_for_topic(uuid)'
       ),
       pg_catalog.to_regprocedure(
         'public.activate_next_weekly_topic()'
       ),
       pg_catalog.to_regprocedure(
         'public.advance_weekly_topics_cycle()'
       ),
       pg_catalog.to_regprocedure(
         'public.admin_create_weekly_topic(text,text,text,uuid)'
       ),
       pg_catalog.to_regprocedure(
         'public.admin_update_active_weekly_topic(uuid,text,text,text,uuid)'
       ),
       pg_catalog.to_regprocedure(
         'public.admin_run_weekly_topics_cycle(text,uuid)'
       )
     ]
   )
     and p.prosecdef
     and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
     and 'search_path=pg_catalog' = any (
       coalesce(p.proconfig, array[]::text[])
     );

  if v_rpc_count <> 6 then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: hardened RPC count mismatch %',
      v_rpc_count;
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.publish_weekly_winner_for_topic(uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.activate_next_weekly_topic()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.advance_weekly_topics_cycle()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.admin_create_weekly_topic(text,text,text,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.admin_update_active_weekly_topic(uuid,text,text,text,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.admin_run_weekly_topics_cycle(text,uuid)',
       'EXECUTE'
     ) then
    raise exception
      'BSEC_WEEKLY_ACL_ABORT: service_role RPC execute mismatch';
  end if;
end
$preflight$;

-- ============================================================================
-- PRIVILEGE HARDENING
-- ============================================================================

revoke all privileges
on table public.weekly_topics
from service_role;

revoke all privileges
on table public.weekly_topics_queue
from service_role;

grant select
on table public.weekly_topics
to service_role;

grant select
on table public.weekly_topics_queue
to service_role;

-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $postflight$
begin
  -- service_role keeps read access.
  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'SELECT'
     ) then
    raise exception
      'BSEC_WEEKLY_ACL_POSTFLIGHT: service_role SELECT missing';
  end if;

  -- No direct mutation/DDL-like table privileges remain.
  if pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.weekly_topics_queue',
       'TRIGGER'
     ) then
    raise exception
      'BSEC_WEEKLY_ACL_POSTFLIGHT: direct table privilege leak';
  end if;

  -- Browser roles must not gain mutation privileges.
  if pg_catalog.has_table_privilege(
       'anon',
       'public.weekly_topics',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.weekly_topics',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.weekly_topics',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.weekly_topics',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.weekly_topics',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.weekly_topics',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.weekly_topics_queue',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.weekly_topics_queue',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.weekly_topics_queue',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.weekly_topics_queue',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.weekly_topics_queue',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.weekly_topics_queue',
       'DELETE'
     ) then
    raise exception
      'BSEC_WEEKLY_ACL_POSTFLIGHT: browser mutation privilege leak';
  end if;

  -- RPC execution remains intact.
  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.publish_weekly_winner_for_topic(uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.activate_next_weekly_topic()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.advance_weekly_topics_cycle()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.admin_create_weekly_topic(text,text,text,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.admin_update_active_weekly_topic(uuid,text,text,text,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.admin_run_weekly_topics_cycle(text,uuid)',
       'EXECUTE'
     ) then
    raise exception
      'BSEC_WEEKLY_ACL_POSTFLIGHT: service_role RPC execute changed';
  end if;
end
$postflight$;

commit;
-- POST E4C - Phase 1.
-- Private persistent storage for /api/gate/pitch rate limiting.
-- DDL dependent on the newly created relation is executed dynamically
-- for compatibility with the Supabase SQL Editor execution model.
-- RPCs are installed in migration 20260907000300.

begin;

do $install$
begin
  if pg_catalog.to_regclass(
       'public.pitch_access_attempts'
     ) is not null then
    raise exception
      'POST_E4C_ABORT: pitch_access_attempts already exists';
  end if;

  if pg_catalog.to_regclass(
       'public.pitch_access_attempts_blocked_idx'
     ) is not null then
    raise exception
      'POST_E4C_ABORT: pitch_access_attempts_blocked_idx already exists';
  end if;

  execute $ddl$
    create table public.pitch_access_attempts (
      id uuid primary key default gen_random_uuid(),

      ip_fingerprint text not null unique
        check (ip_fingerprint ~ '^[0-9a-f]{64}$'),

      window_started_at timestamptz not null default now(),

      failed_count integer not null default 0
        check (failed_count >= 0),

      blocked_until timestamptz null,
      last_failed_at timestamptz null,
      updated_at timestamptz not null default now()
    )
  $ddl$;

  execute $ddl$
    create index pitch_access_attempts_blocked_idx
      on public.pitch_access_attempts(blocked_until)
      where blocked_until is not null
  $ddl$;

  execute $ddl$
    alter table public.pitch_access_attempts
      enable row level security
  $ddl$;

  execute $ddl$
    revoke all privileges
      on table public.pitch_access_attempts
      from public
  $ddl$;

  execute $ddl$
    revoke all privileges
      on table public.pitch_access_attempts
      from anon
  $ddl$;

  execute $ddl$
    revoke all privileges
      on table public.pitch_access_attempts
      from authenticated
  $ddl$;

  execute $ddl$
    revoke all privileges
      on table public.pitch_access_attempts
      from service_role
  $ddl$;
end
$install$;


do $postflight$
declare
  v_table oid;
  v_index oid;
  v_rls boolean;
  v_owner text;
  v_policy_count integer;
begin
  v_table :=
    pg_catalog.to_regclass(
      'public.pitch_access_attempts'
    );

  v_index :=
    pg_catalog.to_regclass(
      'public.pitch_access_attempts_blocked_idx'
    );

  if v_table is null then
    raise exception
      'POST_E4C_ABORT: pitch_access_attempts missing';
  end if;

  if v_index is null then
    raise exception
      'POST_E4C_ABORT: pitch_access_attempts_blocked_idx missing';
  end if;

  select
    c.relrowsecurity,
    pg_catalog.pg_get_userbyid(c.relowner)
  into
    v_rls,
    v_owner
  from pg_catalog.pg_class c
  where c.oid = v_table;

  if v_rls is not true then
    raise exception
      'POST_E4C_ABORT: RLS not enabled';
  end if;

  if v_owner is distinct from 'postgres' then
    raise exception
      'POST_E4C_ABORT: unexpected owner %',
      coalesce(v_owner, '<null>');
  end if;

  select pg_catalog.count(*)::integer
    into v_policy_count
    from pg_catalog.pg_policy p
   where p.polrelid = v_table;

  if v_policy_count <> 0 then
    raise exception
      'POST_E4C_ABORT: unexpected RLS policies count %',
      v_policy_count;
  end if;

  if pg_catalog.has_table_privilege(
       'anon', v_table, 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon', v_table, 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon', v_table, 'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'anon', v_table, 'DELETE'
     ) then
    raise exception
      'POST_E4C_ABORT: anon has direct table privilege';
  end if;

  if pg_catalog.has_table_privilege(
       'authenticated', v_table, 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', v_table, 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', v_table, 'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', v_table, 'DELETE'
     ) then
    raise exception
      'POST_E4C_ABORT: authenticated has direct table privilege';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role', v_table, 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role', v_table, 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role', v_table, 'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role', v_table, 'DELETE'
     ) then
    raise exception
      'POST_E4C_ABORT: service_role has direct table privilege';
  end if;
end
$postflight$;

commit;
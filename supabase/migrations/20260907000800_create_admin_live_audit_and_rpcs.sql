-- B-SEC LIVE FASE 3A
-- Create private admin audit storage and narrow SECURITY DEFINER RPCs
-- for deleting one live entry or all live history for one candidate.
-- Direct table privileges are intentionally NOT revoked here.

begin;

do $$
declare
  v_rls_enabled boolean;
  v_owner text;
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
      message = 'ADMIN_LIVE_PREFLIGHT_RLS_NOT_ENABLED';
  end if;

  if v_owner is distinct from 'postgres' then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_LIVE_PREFLIGHT_UNEXPECTED_OWNER';
  end if;
end
$$;

create table if not exists public.candidate_live_admin_audit (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_email text not null,
  request_id uuid not null,
  live_id uuid null,
  candidate_id text null,
  rows_affected integer not null,
  created_at timestamptz not null default now(),
  constraint candidate_live_admin_audit_action_check
    check (action in ('DELETE_ONE', 'DELETE_ALL')),
  constraint candidate_live_admin_audit_actor_email_check
    check (
      pg_catalog.length(pg_catalog.btrim(actor_email)) between 3 and 320
    ),
  constraint candidate_live_admin_audit_candidate_id_check
    check (
      candidate_id is null
      or pg_catalog.length(pg_catalog.btrim(candidate_id)) between 1 and 160
    ),
  constraint candidate_live_admin_audit_rows_affected_check
    check (rows_affected >= 0),
  constraint candidate_live_admin_audit_request_id_key
    unique (request_id)
);

alter table public.candidate_live_admin_audit owner to postgres;
alter table public.candidate_live_admin_audit enable row level security;

revoke all on table public.candidate_live_admin_audit from public;
revoke all on table public.candidate_live_admin_audit from anon;
revoke all on table public.candidate_live_admin_audit from authenticated;
revoke all on table public.candidate_live_admin_audit from service_role;

create index if not exists idx_candidate_live_admin_audit_candidate_time
  on public.candidate_live_admin_audit (candidate_id, created_at desc);

create index if not exists idx_candidate_live_admin_audit_actor_time
  on public.candidate_live_admin_audit (actor_email, created_at desc);

create or replace function public.delete_live_entry_admin(
  p_live_id uuid,
  p_actor_email text,
  p_request_id uuid
)
returns table(
  deleted_id uuid,
  candidate_id text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_email text := pg_catalog.lower(pg_catalog.btrim(p_actor_email));
  v_candidate_id text;
  v_deleted integer := 0;
begin
  if p_live_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_LIVE_INVALID_LIVE_ID';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_LIVE_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_LIVE_INVALID_ACTOR';
  end if;

  delete from public.votoclaro_live_entries as live
   where live.id = p_live_id
  returning live.candidate_id
       into v_candidate_id;

  get diagnostics v_deleted = row_count;

  if v_deleted <> 1 or v_candidate_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_LIVE_NOT_FOUND';
  end if;

  insert into public.candidate_live_admin_audit (
    action,
    actor_email,
    request_id,
    live_id,
    candidate_id,
    rows_affected
  )
  values (
    'DELETE_ONE',
    v_actor_email,
    p_request_id,
    p_live_id,
    v_candidate_id,
    1
  );

  return query
  select p_live_id, v_candidate_id;
end;
$$;

alter function public.delete_live_entry_admin(uuid, text, uuid)
  owner to postgres;

revoke all on function public.delete_live_entry_admin(uuid, text, uuid)
  from public;
revoke all on function public.delete_live_entry_admin(uuid, text, uuid)
  from anon;
revoke all on function public.delete_live_entry_admin(uuid, text, uuid)
  from authenticated;
grant execute on function public.delete_live_entry_admin(uuid, text, uuid)
  to service_role;

create or replace function public.delete_candidate_live_history_admin(
  p_candidate_id text,
  p_actor_email text,
  p_request_id uuid
)
returns table(
  candidate_id text,
  deleted_count integer
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_actor_email text := pg_catalog.lower(pg_catalog.btrim(p_actor_email));
  v_deleted integer := 0;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) < 1
     or pg_catalog.length(v_candidate_id) > 160 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_LIVE_INVALID_CANDIDATE_ID';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_LIVE_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_LIVE_INVALID_ACTOR';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_candidate_id, 0)
  );

  delete from public.votoclaro_live_entries as live
   where live.candidate_id = v_candidate_id;

  get diagnostics v_deleted = row_count;

  insert into public.candidate_live_admin_audit (
    action,
    actor_email,
    request_id,
    live_id,
    candidate_id,
    rows_affected
  )
  values (
    'DELETE_ALL',
    v_actor_email,
    p_request_id,
    null,
    v_candidate_id,
    v_deleted
  );

  return query
  select v_candidate_id, v_deleted;
end;
$$;

alter function public.delete_candidate_live_history_admin(text, text, uuid)
  owner to postgres;

revoke all on function public.delete_candidate_live_history_admin(text, text, uuid)
  from public;
revoke all on function public.delete_candidate_live_history_admin(text, text, uuid)
  from anon;
revoke all on function public.delete_candidate_live_history_admin(text, text, uuid)
  from authenticated;
grant execute on function public.delete_candidate_live_history_admin(text, text, uuid)
  to service_role;

do $$
declare
  v_policy_count integer;
  v_bad_functions integer;
begin
  select pg_catalog.count(*)::integer
    into v_policy_count
    from pg_catalog.pg_policy as p
   where p.polrelid = 'public.candidate_live_admin_audit'::regclass;

  if v_policy_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_LIVE_POSTFLIGHT_AUDIT_POLICY_PRESENT';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_live_admin_audit',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_live_admin_audit',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_live_admin_audit',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.candidate_live_admin_audit',
       'DELETE'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_LIVE_POSTFLIGHT_AUDIT_SERVICE_DML_PRESENT';
  end if;

  select pg_catalog.count(*)::integer
    into v_bad_functions
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n
      on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'delete_live_entry_admin',
       'delete_candidate_live_history_admin'
     )
     and (
       not p.prosecdef
       or pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
       or not coalesce(
         p.proconfig @> array['search_path=pg_catalog'],
         false
       )
     );

  if v_bad_functions <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_LIVE_POSTFLIGHT_FUNCTION_SECURITY_INVALID';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.delete_live_entry_admin(uuid,text,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.delete_candidate_live_history_admin(text,text,uuid)',
       'EXECUTE'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_LIVE_POSTFLIGHT_SERVICE_EXECUTE_MISSING';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.delete_live_entry_admin(uuid,text,uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.delete_live_entry_admin(uuid,text,uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.delete_candidate_live_history_admin(text,text,uuid)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.delete_candidate_live_history_admin(text,text,uuid)',
       'EXECUTE'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_LIVE_POSTFLIGHT_CLIENT_EXECUTE_PRESENT';
  end if;
end
$$;

commit;

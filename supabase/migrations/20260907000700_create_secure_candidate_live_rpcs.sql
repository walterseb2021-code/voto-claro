-- B-SEC: Harden candidate live mutations before revoking direct service_role writes.
-- Phase 1:
--   * enforce at most one LIVE row per candidate
--   * harden the existing LIVE creation RPC
--   * add narrow RPCs for ENDED creation, finish, and candidate-owned delete
-- Direct table write privileges are intentionally NOT revoked in this migration.
-- They will be revoked only after all runtime callers have migrated to RPCs and passed production tests.

begin;

do $$
declare
  v_duplicate_candidates integer;
  v_rls_enabled boolean;
  v_owner text;
begin
  select pg_catalog.count(*)::integer
    into v_duplicate_candidates
    from (
      select live.candidate_id
        from public.votoclaro_live_entries as live
       where live.status = 'LIVE'
       group by live.candidate_id
      having pg_catalog.count(*) > 1
    ) as duplicates;

  if v_duplicate_candidates <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_LIVE_PREFLIGHT_DUPLICATE_ACTIVE_LIVES';
  end if;

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
      message = 'CANDIDATE_LIVE_PREFLIGHT_RLS_NOT_ENABLED';
  end if;

  if v_owner is distinct from 'postgres' then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_LIVE_PREFLIGHT_UNEXPECTED_OWNER';
  end if;

  if pg_catalog.to_regprocedure(
       'public.create_candidate_live_entry(text,text,text,text)'
     ) is null then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_LIVE_PREFLIGHT_CREATE_RPC_MISSING';
  end if;
end
$$;

create unique index if not exists uq_votoclaro_live_one_live_per_candidate
  on public.votoclaro_live_entries (candidate_id)
  where status = 'LIVE';

create or replace function public.create_candidate_live_entry(
  p_candidate_id text,
  p_candidate_name text,
  p_platform text,
  p_url text
)
returns table(
  id uuid,
  candidate_id text,
  candidate_name text,
  platform text,
  url text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_candidate_name text := pg_catalog.btrim(p_candidate_name);
  v_platform text := pg_catalog.upper(pg_catalog.btrim(p_platform));
  v_url text := pg_catalog.btrim(p_url);
  v_now timestamptz := pg_catalog.now();
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) < 1
     or pg_catalog.length(v_candidate_id) > 160 then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_CANDIDATE_ID';
  end if;

  if v_candidate_name is null
     or pg_catalog.length(v_candidate_name) < 1
     or pg_catalog.length(v_candidate_name) > 200 then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_CANDIDATE_NAME';
  end if;

  if v_platform not in ('YOUTUBE', 'FACEBOOK', 'TIKTOK', 'OTRA') then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_PLATFORM';
  end if;

  if v_url is null
     or pg_catalog.length(v_url) < 1
     or pg_catalog.length(v_url) > 2048
     or pg_catalog.left(v_url, 8) <> 'https://' then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_URL';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_candidate_id, 0)
  );

  update public.votoclaro_live_entries as live
     set status = 'ENDED'
   where live.candidate_id = v_candidate_id
     and live.status = 'LIVE';

  return query
  with inserted_live as (
    insert into public.votoclaro_live_entries as new_live (
      candidate_id,
      candidate_name,
      platform,
      url,
      status,
      created_at
    )
    values (
      v_candidate_id,
      v_candidate_name,
      v_platform,
      v_url,
      'LIVE',
      v_now
    )
    returning
      new_live.id,
      new_live.candidate_id,
      new_live.candidate_name,
      new_live.platform,
      new_live.url,
      new_live.status,
      new_live.created_at
  )
  select
    inserted_live.id,
    inserted_live.candidate_id,
    inserted_live.candidate_name,
    inserted_live.platform::text,
    inserted_live.url,
    inserted_live.status::text,
    inserted_live.created_at
  from inserted_live;
end;
$$;

alter function public.create_candidate_live_entry(text, text, text, text)
  owner to postgres;

revoke all on function public.create_candidate_live_entry(text, text, text, text)
  from public;
revoke all on function public.create_candidate_live_entry(text, text, text, text)
  from anon;
revoke all on function public.create_candidate_live_entry(text, text, text, text)
  from authenticated;
grant execute on function public.create_candidate_live_entry(text, text, text, text)
  to service_role;

create or replace function public.create_candidate_ended_live_entry(
  p_candidate_id text,
  p_candidate_name text,
  p_platform text,
  p_url text
)
returns table(
  id uuid,
  candidate_id text,
  candidate_name text,
  platform text,
  url text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_candidate_name text := pg_catalog.btrim(p_candidate_name);
  v_platform text := pg_catalog.upper(pg_catalog.btrim(p_platform));
  v_url text := pg_catalog.btrim(p_url);
  v_now timestamptz := pg_catalog.now();
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) < 1
     or pg_catalog.length(v_candidate_id) > 160 then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_CANDIDATE_ID';
  end if;

  if v_candidate_name is null
     or pg_catalog.length(v_candidate_name) < 1
     or pg_catalog.length(v_candidate_name) > 200 then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_CANDIDATE_NAME';
  end if;

  if v_platform not in ('YOUTUBE', 'FACEBOOK', 'TIKTOK', 'OTRA') then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_PLATFORM';
  end if;

  if v_url is null
     or pg_catalog.length(v_url) < 1
     or pg_catalog.length(v_url) > 2048
     or pg_catalog.left(v_url, 8) <> 'https://' then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_URL';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_candidate_id, 0)
  );

  return query
  with inserted_live as (
    insert into public.votoclaro_live_entries as new_live (
      candidate_id,
      candidate_name,
      platform,
      url,
      status,
      created_at
    )
    values (
      v_candidate_id,
      v_candidate_name,
      v_platform,
      v_url,
      'ENDED',
      v_now
    )
    returning
      new_live.id,
      new_live.candidate_id,
      new_live.candidate_name,
      new_live.platform,
      new_live.url,
      new_live.status,
      new_live.created_at
  )
  select
    inserted_live.id,
    inserted_live.candidate_id,
    inserted_live.candidate_name,
    inserted_live.platform::text,
    inserted_live.url,
    inserted_live.status::text,
    inserted_live.created_at
  from inserted_live;
end;
$$;

alter function public.create_candidate_ended_live_entry(text, text, text, text)
  owner to postgres;

revoke all on function public.create_candidate_ended_live_entry(text, text, text, text)
  from public;
revoke all on function public.create_candidate_ended_live_entry(text, text, text, text)
  from anon;
revoke all on function public.create_candidate_ended_live_entry(text, text, text, text)
  from authenticated;
grant execute on function public.create_candidate_ended_live_entry(text, text, text, text)
  to service_role;

create or replace function public.finish_candidate_live_entry(
  p_live_id uuid,
  p_candidate_id text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
begin
  if p_live_id is null then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_LIVE_ID';
  end if;

  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) < 1
     or pg_catalog.length(v_candidate_id) > 160 then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_CANDIDATE_ID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_candidate_id, 0)
  );

  return query
  update public.votoclaro_live_entries as live
     set status = 'ENDED'
   where live.id = p_live_id
     and live.candidate_id = v_candidate_id
     and live.status = 'LIVE'
  returning live.id;
end;
$$;

alter function public.finish_candidate_live_entry(uuid, text)
  owner to postgres;

revoke all on function public.finish_candidate_live_entry(uuid, text)
  from public;
revoke all on function public.finish_candidate_live_entry(uuid, text)
  from anon;
revoke all on function public.finish_candidate_live_entry(uuid, text)
  from authenticated;
grant execute on function public.finish_candidate_live_entry(uuid, text)
  to service_role;

create or replace function public.delete_candidate_live_entry(
  p_live_id uuid,
  p_candidate_id text
)
returns table(id uuid)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
begin
  if p_live_id is null then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_LIVE_ID';
  end if;

  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) < 1
     or pg_catalog.length(v_candidate_id) > 160 then
    raise exception using
      errcode = '22023',
      message = 'CANDIDATE_LIVE_INVALID_CANDIDATE_ID';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_candidate_id, 0)
  );

  return query
  delete from public.votoclaro_live_entries as live
   where live.id = p_live_id
     and live.candidate_id = v_candidate_id
  returning live.id;
end;
$$;

alter function public.delete_candidate_live_entry(uuid, text)
  owner to postgres;

revoke all on function public.delete_candidate_live_entry(uuid, text)
  from public;
revoke all on function public.delete_candidate_live_entry(uuid, text)
  from anon;
revoke all on function public.delete_candidate_live_entry(uuid, text)
  from authenticated;
grant execute on function public.delete_candidate_live_entry(uuid, text)
  to service_role;

do $$
declare
  v_bad_functions integer;
begin
  select pg_catalog.count(*)::integer
    into v_bad_functions
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n
      on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'create_candidate_live_entry',
       'create_candidate_ended_live_entry',
       'finish_candidate_live_entry',
       'delete_candidate_live_entry'
     )
     and (
       not p.prosecdef
       or pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres'
       or not (p.proconfig @> array['search_path=pg_catalog'])
     );

  if v_bad_functions <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_LIVE_POSTFLIGHT_FUNCTION_SECURITY_INVALID';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.create_candidate_live_entry(text,text,text,text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.create_candidate_ended_live_entry(text,text,text,text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.finish_candidate_live_entry(uuid,text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.delete_candidate_live_entry(uuid,text)',
       'EXECUTE'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_LIVE_POSTFLIGHT_SERVICE_EXECUTE_MISSING';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.create_candidate_live_entry(text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.create_candidate_live_entry(text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.create_candidate_ended_live_entry(text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.create_candidate_ended_live_entry(text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.finish_candidate_live_entry(uuid,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.finish_candidate_live_entry(uuid,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.delete_candidate_live_entry(uuid,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.delete_candidate_live_entry(uuid,text)',
       'EXECUTE'
     ) then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_LIVE_POSTFLIGHT_CLIENT_EXECUTE_PRESENT';
  end if;
end
$$;

commit;

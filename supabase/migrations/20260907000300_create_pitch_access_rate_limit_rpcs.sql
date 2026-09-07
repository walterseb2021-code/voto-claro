-- POST E4C - Phase 2.
-- SECURITY DEFINER RPCs for /api/gate/pitch persistent rate limiting.
-- Requires pitch_access_attempts from migration 20260907000200.

begin;

create or replace function public.check_pitch_access_rate_limit(
  p_ip_fingerprint text
)
returns table(allowed boolean, blocked_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_id uuid;
  v_window_started_at timestamptz;
  v_existing_blocked_until timestamptz;
begin
  if p_ip_fingerprint is null
     or pg_catalog.length(pg_catalog.btrim(p_ip_fingerprint)) <> 64
     or p_ip_fingerprint !~ '^[0-9a-f]{64}$' then
    allowed := false;
    blocked_until := null;
    return next;
    return;
  end if;

  insert into public.pitch_access_attempts (
    ip_fingerprint,
    window_started_at,
    failed_count,
    updated_at
  )
  values (
    p_ip_fingerprint,
    v_now,
    0,
    v_now
  )
  on conflict (ip_fingerprint) do nothing;

  select
    pa.id,
    pa.window_started_at,
    pa.blocked_until
    into
      v_id,
      v_window_started_at,
      v_existing_blocked_until
    from public.pitch_access_attempts as pa
   where pa.ip_fingerprint = p_ip_fingerprint
   for update;

  if v_existing_blocked_until is not null
     and v_existing_blocked_until > v_now then
    allowed := false;
    blocked_until := v_existing_blocked_until;
    return next;
    return;
  end if;

  if v_window_started_at <= v_now - interval '10 minutes' then
    update public.pitch_access_attempts as pa
       set window_started_at = v_now,
           failed_count = 0,
           blocked_until = null,
           updated_at = v_now
     where pa.id = v_id;
  end if;

  allowed := true;
  blocked_until := null;
  return next;
end;
$$;


create or replace function public.record_pitch_access_failure(
  p_ip_fingerprint text
)
returns table(allowed boolean, blocked_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_blocked_until timestamptz;
begin
  if p_ip_fingerprint is null
     or pg_catalog.length(pg_catalog.btrim(p_ip_fingerprint)) <> 64
     or p_ip_fingerprint !~ '^[0-9a-f]{64}$' then
    allowed := false;
    blocked_until := null;
    return next;
    return;
  end if;

  insert into public.pitch_access_attempts (
    ip_fingerprint,
    window_started_at,
    failed_count,
    blocked_until,
    last_failed_at,
    updated_at
  )
  values (
    p_ip_fingerprint,
    v_now,
    1,
    null,
    v_now,
    v_now
  )
  on conflict (ip_fingerprint) do update
     set window_started_at =
           case
             when public.pitch_access_attempts.window_started_at
                    <= v_now - interval '10 minutes'
             then v_now
             else public.pitch_access_attempts.window_started_at
           end,
         failed_count =
           case
             when public.pitch_access_attempts.window_started_at
                    <= v_now - interval '10 minutes'
             then 1
             else public.pitch_access_attempts.failed_count + 1
           end,
         blocked_until =
           case
             when (
               case
                 when public.pitch_access_attempts.window_started_at
                        <= v_now - interval '10 minutes'
                 then 1
                 else public.pitch_access_attempts.failed_count + 1
               end
             ) >= 5
             then v_now + interval '15 minutes'
             else public.pitch_access_attempts.blocked_until
           end,
         last_failed_at = v_now,
         updated_at = v_now
  returning public.pitch_access_attempts.blocked_until
  into v_blocked_until;

  allowed := not (
    v_blocked_until is not null
    and v_blocked_until > v_now
  );

  blocked_until := v_blocked_until;
  return next;
end;
$$;


revoke all
  on function public.check_pitch_access_rate_limit(text)
  from public, anon, authenticated, service_role;

grant execute
  on function public.check_pitch_access_rate_limit(text)
  to service_role;

revoke all
  on function public.record_pitch_access_failure(text)
  from public, anon, authenticated, service_role;

grant execute
  on function public.record_pitch_access_failure(text)
  to service_role;


do $postflight$
declare
  v_check oid;
  v_record oid;
begin
  v_check :=
    pg_catalog.to_regprocedure(
      'public.check_pitch_access_rate_limit(text)'
    );

  v_record :=
    pg_catalog.to_regprocedure(
      'public.record_pitch_access_failure(text)'
    );

  if v_check is null or v_record is null then
    raise exception
      'POST_E4C_ABORT: pitch rate-limit RPC missing';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role', v_check, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', v_record, 'EXECUTE'
     ) then
    raise exception
      'POST_E4C_ABORT: service_role missing EXECUTE';
  end if;

  if pg_catalog.has_function_privilege(
       'anon', v_check, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', v_check, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon', v_record, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', v_record, 'EXECUTE'
     ) then
    raise exception
      'POST_E4C_ABORT: client can execute pitch RPC';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_check
      and p.prosecdef is true
      and coalesce(
            p.proconfig,
            array[]::text[]
          ) @> array['search_path=pg_catalog']::text[]
  ) then
    raise exception
      'POST_E4C_ABORT: check RPC security contract invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_record
      and p.prosecdef is true
      and coalesce(
            p.proconfig,
            array[]::text[]
          ) @> array['search_path=pg_catalog']::text[]
  ) then
    raise exception
      'POST_E4C_ABORT: record RPC security contract invalid';
  end if;
end
$postflight$;

commit;
-- Persistent private rate limit for /api/ai/answer.
-- Cost-bearing Gemini endpoint: 8 requests/minute and 120 requests/hour per HMAC IP fingerprint.
-- This migration is prepared locally first. Do not rerun after successful production application.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.ai_answer_rate_limits') is not null then
    raise exception 'BSEC_AI_RATE_LIMIT_ABORT: table already exists';
  end if;

  if pg_catalog.to_regprocedure('public.consume_ai_answer_rate_limit(text)') is not null then
    raise exception 'BSEC_AI_RATE_LIMIT_ABORT: function already exists';
  end if;
end
$preflight$;

create table public.ai_answer_rate_limits (
  ip_fingerprint text primary key,
  minute_window_started_at timestamptz not null,
  minute_count integer not null default 0,
  hour_window_started_at timestamptz not null,
  hour_count integer not null default 0,
  blocked_until timestamptz null,
  updated_at timestamptz not null default pg_catalog.now(),

  constraint ai_answer_rate_limits_fingerprint_check
    check (ip_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint ai_answer_rate_limits_minute_count_check
    check (minute_count >= 0),
  constraint ai_answer_rate_limits_hour_count_check
    check (hour_count >= 0)
);

alter table public.ai_answer_rate_limits owner to postgres;

comment on table public.ai_answer_rate_limits is
  'Private persistent cost-abuse counters for /api/ai/answer. Stores only HMAC IP fingerprints, never raw IPs.';

alter table public.ai_answer_rate_limits enable row level security;

revoke all on table public.ai_answer_rate_limits from public;
revoke all on table public.ai_answer_rate_limits from anon;
revoke all on table public.ai_answer_rate_limits from authenticated;
revoke all on table public.ai_answer_rate_limits from service_role;

create index ai_answer_rate_limits_updated_at_idx
  on public.ai_answer_rate_limits(updated_at);

create index ai_answer_rate_limits_blocked_until_idx
  on public.ai_answer_rate_limits(blocked_until)
  where blocked_until is not null;

create or replace function public.consume_ai_answer_rate_limit(
  p_ip_fingerprint text
)
returns table(
  allowed boolean,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.ai_answer_rate_limits%rowtype;
  v_minute_start timestamptz;
  v_hour_start timestamptz;
  v_minute_count integer;
  v_hour_count integer;
  v_blocked_until timestamptz;
  v_retry integer;
begin
  if p_ip_fingerprint is null
     or p_ip_fingerprint !~ '^[0-9a-f]{64}$' then
    return query select false, 60;
    return;
  end if;

  insert into public.ai_answer_rate_limits (
    ip_fingerprint,
    minute_window_started_at,
    minute_count,
    hour_window_started_at,
    hour_count,
    blocked_until,
    updated_at
  )
  values (
    p_ip_fingerprint,
    v_now,
    0,
    v_now,
    0,
    null,
    v_now
  )
  on conflict (ip_fingerprint) do nothing;

  select *
    into v_row
    from public.ai_answer_rate_limits
   where ip_fingerprint = p_ip_fingerprint
   for update;

  if not found then
    raise exception 'BSEC_AI_RATE_LIMIT_ROW_MISSING';
  end if;

  if v_row.blocked_until is not null
     and v_row.blocked_until > v_now then
    v_retry := greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from (v_row.blocked_until - v_now))
      )::integer
    );

    return query select false, v_retry;
    return;
  end if;

  if v_row.minute_window_started_at <= v_now - interval '1 minute' then
    v_minute_start := v_now;
    v_minute_count := 0;
  else
    v_minute_start := v_row.minute_window_started_at;
    v_minute_count := v_row.minute_count;
  end if;

  if v_row.hour_window_started_at <= v_now - interval '1 hour' then
    v_hour_start := v_now;
    v_hour_count := 0;
  else
    v_hour_start := v_row.hour_window_started_at;
    v_hour_count := v_row.hour_count;
  end if;

  v_minute_count := v_minute_count + 1;
  v_hour_count := v_hour_count + 1;
  v_blocked_until := null;

  if v_minute_count > 8 then
    v_blocked_until := v_minute_start + interval '1 minute';
  end if;

  if v_hour_count > 120 then
    if v_blocked_until is null
       or v_hour_start + interval '1 hour' > v_blocked_until then
      v_blocked_until := v_hour_start + interval '1 hour';
    end if;
  end if;

  update public.ai_answer_rate_limits
     set minute_window_started_at = v_minute_start,
         minute_count = v_minute_count,
         hour_window_started_at = v_hour_start,
         hour_count = v_hour_count,
         blocked_until = v_blocked_until,
         updated_at = v_now
   where ip_fingerprint = p_ip_fingerprint;

  if v_blocked_until is not null
     and v_blocked_until > v_now then
    v_retry := greatest(
      1,
      pg_catalog.ceil(
        extract(epoch from (v_blocked_until - v_now))
      )::integer
    );

    return query select false, v_retry;
    return;
  end if;

  return query select true, 0;
end
$function$;

alter function public.consume_ai_answer_rate_limit(text)
  owner to postgres;

revoke all
  on function public.consume_ai_answer_rate_limit(text)
  from public;

revoke all
  on function public.consume_ai_answer_rate_limit(text)
  from anon;

revoke all
  on function public.consume_ai_answer_rate_limit(text)
  from authenticated;

revoke all
  on function public.consume_ai_answer_rate_limit(text)
  from service_role;

grant execute
  on function public.consume_ai_answer_rate_limit(text)
  to service_role;

comment on function public.consume_ai_answer_rate_limit(text) is
  'Atomically consumes one /api/ai/answer request allowance for an HMAC IP fingerprint.';

do $postflight$
declare
  v_rls boolean;
  v_allowed boolean;
  v_retry integer;
  v_i integer;
  v_test_fp text := repeat('0', 64);
begin
  if pg_catalog.to_regclass('public.ai_answer_rate_limits') is null then
    raise exception 'BSEC_AI_RATE_LIMIT_POSTCHECK: table missing';
  end if;

  if pg_catalog.to_regprocedure('public.consume_ai_answer_rate_limit(text)') is null then
    raise exception 'BSEC_AI_RATE_LIMIT_POSTCHECK: function missing';
  end if;

  select c.relrowsecurity
    into v_rls
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n
      on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'ai_answer_rate_limits';

  if v_rls is distinct from true then
    raise exception 'BSEC_AI_RATE_LIMIT_POSTCHECK: RLS disabled';
  end if;

  if pg_catalog.has_table_privilege(
       'anon',
       'public.ai_answer_rate_limits',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.ai_answer_rate_limits',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.ai_answer_rate_limits',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.ai_answer_rate_limits',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.ai_answer_rate_limits',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.ai_answer_rate_limits',
       'INSERT'
     ) then
    raise exception 'BSEC_AI_RATE_LIMIT_POSTCHECK: unexpected direct table privilege';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.consume_ai_answer_rate_limit(text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.consume_ai_answer_rate_limit(text)',
       'EXECUTE'
     ) then
    raise exception 'BSEC_AI_RATE_LIMIT_POSTCHECK: public RPC execute privilege';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.consume_ai_answer_rate_limit(text)',
       'EXECUTE'
     ) then
    raise exception 'BSEC_AI_RATE_LIMIT_POSTCHECK: service_role execute missing';
  end if;

  -- ========================================================
  -- BSEC_AI_RATE_LIMIT_SELFTEST
  -- 8 solicitudes permitidas; la novena debe bloquearse.
  -- Después prueba el umbral horario 120 -> 121.
  -- El fingerprint de prueba se elimina antes de terminar.
  -- ========================================================

  delete from public.ai_answer_rate_limits
   where ip_fingerprint = v_test_fp;

  for v_i in 1..8 loop
    select r.allowed, r.retry_after_seconds
      into v_allowed, v_retry
      from public.consume_ai_answer_rate_limit(v_test_fp) as r;

    if v_allowed is distinct from true
       or v_retry is distinct from 0 then
      raise exception 'BSEC_AI_RATE_LIMIT_SELFTEST: minute allowance failed at request %', v_i;
    end if;
  end loop;

  select r.allowed, r.retry_after_seconds
    into v_allowed, v_retry
    from public.consume_ai_answer_rate_limit(v_test_fp) as r;

  if v_allowed is distinct from false
     or v_retry is null
     or v_retry < 1
     or v_retry > 60 then
    raise exception 'BSEC_AI_RATE_LIMIT_SELFTEST: ninth minute request was not blocked';
  end if;

  delete from public.ai_answer_rate_limits
   where ip_fingerprint = v_test_fp;

  insert into public.ai_answer_rate_limits (
    ip_fingerprint,
    minute_window_started_at,
    minute_count,
    hour_window_started_at,
    hour_count,
    blocked_until,
    updated_at
  )
  values (
    v_test_fp,
    pg_catalog.clock_timestamp(),
    0,
    pg_catalog.clock_timestamp(),
    120,
    null,
    pg_catalog.clock_timestamp()
  );

  select r.allowed, r.retry_after_seconds
    into v_allowed, v_retry
    from public.consume_ai_answer_rate_limit(v_test_fp) as r;

  if v_allowed is distinct from false
     or v_retry is null
     or v_retry < 1
     or v_retry > 3600 then
    raise exception 'BSEC_AI_RATE_LIMIT_SELFTEST: 121st hourly request was not blocked';
  end if;

  delete from public.ai_answer_rate_limits
   where ip_fingerprint = v_test_fp;

  if exists (
    select 1
      from public.ai_answer_rate_limits
     where ip_fingerprint = v_test_fp
  ) then
    raise exception 'BSEC_AI_RATE_LIMIT_SELFTEST: test fingerprint cleanup failed';
  end if;
end
$postflight$;

commit;

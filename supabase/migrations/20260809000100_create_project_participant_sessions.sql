-- B-SEC-14Q / B-SEC-14T
-- Fundacion server-side de sesiones de participante y rate limit persistente.
--
-- IMPORTANTE:
--   1. Esta migracion NO modifica public.project_participants.
--   2. NO revoca aun los accesos publicos actuales de project_participants.
--   3. NO modifica public.generar_codigo_acceso().
--   4. Se versiona localmente; este script NO la ejecuta en Supabase.

begin;

create table public.project_participant_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null
    references public.project_participants(id)
    on delete cascade,
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  constraint project_participant_sessions_expiry_check
    check (expires_at > created_at),
  constraint project_participant_sessions_revoked_check
    check (revoked_at is null or revoked_at >= created_at)
);

create index project_participant_sessions_participant_idx
  on public.project_participant_sessions(participant_id);

create index project_participant_sessions_active_expiry_idx
  on public.project_participant_sessions(expires_at)
  where revoked_at is null;

alter table public.project_participant_sessions
  enable row level security;

revoke all privileges
  on table public.project_participant_sessions
  from public;

revoke all privileges
  on table public.project_participant_sessions
  from anon;

revoke all privileges
  on table public.project_participant_sessions
  from authenticated;

revoke all privileges
  on table public.project_participant_sessions
  from service_role;

grant select, insert, update
  on table public.project_participant_sessions
  to service_role;

create table public.project_participant_login_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_fingerprint text not null unique
    check (ip_fingerprint ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  failed_count integer not null default 0
    check (failed_count >= 0),
  blocked_until timestamptz null,
  last_failed_at timestamptz null,
  updated_at timestamptz not null default now()
);

create index project_participant_login_attempts_blocked_idx
  on public.project_participant_login_attempts(blocked_until)
  where blocked_until is not null;

alter table public.project_participant_login_attempts
  enable row level security;

revoke all privileges
  on table public.project_participant_login_attempts
  from public;

revoke all privileges
  on table public.project_participant_login_attempts
  from anon;

revoke all privileges
  on table public.project_participant_login_attempts
  from authenticated;

revoke all privileges
  on table public.project_participant_login_attempts
  from service_role;

create or replace function public.check_project_participant_login_rate_limit(
  p_ip_fingerprint text
)
returns table(allowed boolean, blocked_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_row public.project_participant_login_attempts%rowtype;
begin
  if p_ip_fingerprint is null
     or pg_catalog.length(pg_catalog.btrim(p_ip_fingerprint)) <> 64
     or p_ip_fingerprint !~ '^[0-9a-f]{64}$' then
    allowed := false;
    blocked_until := null;
    return next;
    return;
  end if;

  insert into public.project_participant_login_attempts (
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

  select *
    into v_row
    from public.project_participant_login_attempts
   where ip_fingerprint = p_ip_fingerprint
   for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    allowed := false;
    blocked_until := v_row.blocked_until;
    return next;
    return;
  end if;

  if v_row.window_started_at <= v_now - interval '10 minutes' then
    update public.project_participant_login_attempts
       set window_started_at = v_now,
           failed_count = 0,
           blocked_until = null,
           updated_at = v_now
     where id = v_row.id;
  end if;

  allowed := true;
  blocked_until := null;
  return next;
end;
$$;

create or replace function public.record_project_participant_login_failure(
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

  insert into public.project_participant_login_attempts (
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
             when public.project_participant_login_attempts.window_started_at
                    <= v_now - interval '10 minutes'
             then v_now
             else public.project_participant_login_attempts.window_started_at
           end,
         failed_count =
           case
             when public.project_participant_login_attempts.window_started_at
                    <= v_now - interval '10 minutes'
             then 1
             else public.project_participant_login_attempts.failed_count + 1
           end,
         blocked_until =
           case
             when (
               case
                 when public.project_participant_login_attempts.window_started_at
                        <= v_now - interval '10 minutes'
                 then 1
                 else public.project_participant_login_attempts.failed_count + 1
               end
             ) >= 5
             then v_now + interval '15 minutes'
             else public.project_participant_login_attempts.blocked_until
           end,
         last_failed_at = v_now,
         updated_at = v_now
  returning public.project_participant_login_attempts.blocked_until
  into v_blocked_until;

  allowed := not (v_blocked_until is not null and v_blocked_until > v_now);
  blocked_until := v_blocked_until;
  return next;
end;
$$;


revoke all
  on function public.check_project_participant_login_rate_limit(text)
  from public;

revoke all
  on function public.check_project_participant_login_rate_limit(text)
  from anon;

revoke all
  on function public.check_project_participant_login_rate_limit(text)
  from authenticated;

revoke all
  on function public.check_project_participant_login_rate_limit(text)
  from service_role;

grant execute
  on function public.check_project_participant_login_rate_limit(text)
  to service_role;

revoke all
  on function public.record_project_participant_login_failure(text)
  from public;

revoke all
  on function public.record_project_participant_login_failure(text)
  from anon;

revoke all
  on function public.record_project_participant_login_failure(text)
  from authenticated;

revoke all
  on function public.record_project_participant_login_failure(text)
  from service_role;

grant execute
  on function public.record_project_participant_login_failure(text)
  to service_role;


commit;
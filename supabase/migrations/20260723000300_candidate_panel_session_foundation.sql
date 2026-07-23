-- Candidate panel session foundation.
-- Additive only: do not tighten existing public policies for PINs or live entries in this phase.

create table if not exists public.candidate_panel_sessions (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  last_seen_at timestamptz null
);

comment on table public.candidate_panel_sessions is
  'Opaque server-side sessions for candidate panels. Stores token hashes only.';

comment on column public.candidate_panel_sessions.token_hash is
  'SHA-256 hash of the opaque candidate-panel token. The raw token is stored only in an httpOnly cookie.';

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'candidate_panel_sessions_candidate_id_fkey'
      and conrelid = 'public.candidate_panel_sessions'::regclass
  ) then
    alter table public.candidate_panel_sessions
      add constraint candidate_panel_sessions_candidate_id_fkey
      foreign key (candidate_id)
      references public.votoclaro_candidate_pins(candidate_id)
      on delete cascade;
  end if;
end $$;

comment on constraint candidate_panel_sessions_candidate_id_fkey on public.candidate_panel_sessions is
  'ON DELETE CASCADE is intentional: candidate-panel sessions are ephemeral authorization state and must disappear if the candidate PIN record is removed.';

create index if not exists candidate_panel_sessions_candidate_id_idx
  on public.candidate_panel_sessions (candidate_id);

create index if not exists candidate_panel_sessions_expires_at_idx
  on public.candidate_panel_sessions (expires_at);

create index if not exists candidate_panel_sessions_active_idx
  on public.candidate_panel_sessions (candidate_id, expires_at)
  where revoked_at is null;

alter table public.candidate_panel_sessions enable row level security;

revoke all on table public.candidate_panel_sessions from public;
revoke all on table public.candidate_panel_sessions from anon;
revoke all on table public.candidate_panel_sessions from authenticated;
grant select, insert, update, delete on table public.candidate_panel_sessions to service_role;

create table if not exists public.candidate_panel_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null,
  ip_fingerprint text not null,
  window_started_at timestamptz not null default now(),
  failed_count integer not null default 0,
  blocked_until timestamptz null,
  last_failed_at timestamptz null,
  updated_at timestamptz not null default now(),
  constraint candidate_panel_pin_attempts_failed_count_check
    check (failed_count >= 0),
  constraint candidate_panel_pin_attempts_candidate_ip_unique
    unique (candidate_id, ip_fingerprint)
);

comment on table public.candidate_panel_pin_attempts is
  'Persistent candidate-panel PIN rate limit counters. IPs are stored only as HMAC fingerprints.';

create index if not exists candidate_panel_pin_attempts_blocked_until_idx
  on public.candidate_panel_pin_attempts (blocked_until)
  where blocked_until is not null;

alter table public.candidate_panel_pin_attempts enable row level security;

revoke all on table public.candidate_panel_pin_attempts from public;
revoke all on table public.candidate_panel_pin_attempts from anon;
revoke all on table public.candidate_panel_pin_attempts from authenticated;
grant select, insert, update, delete on table public.candidate_panel_pin_attempts to service_role;

create or replace function public.check_candidate_panel_pin_rate_limit(
  p_candidate_id text,
  p_ip_fingerprint text
)
returns table(allowed boolean, blocked_until timestamptz)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_row public.candidate_panel_pin_attempts%rowtype;
begin
  if pg_catalog.length(pg_catalog.btrim(p_candidate_id)) = 0
     or pg_catalog.length(pg_catalog.btrim(p_ip_fingerprint)) = 0 then
    allowed := false;
    blocked_until := null;
    return next;
    return;
  end if;

  insert into public.candidate_panel_pin_attempts (
    candidate_id,
    ip_fingerprint,
    window_started_at,
    failed_count,
    updated_at
  )
  values (
    p_candidate_id,
    p_ip_fingerprint,
    v_now,
    0,
    v_now
  )
  on conflict (candidate_id, ip_fingerprint) do nothing;

  select *
    into v_row
    from public.candidate_panel_pin_attempts
   where candidate_id = p_candidate_id
     and ip_fingerprint = p_ip_fingerprint
   for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    allowed := false;
    blocked_until := v_row.blocked_until;
    return next;
    return;
  end if;

  if v_row.window_started_at <= v_now - interval '10 minutes' then
    update public.candidate_panel_pin_attempts
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

create or replace function public.record_candidate_panel_pin_failure(
  p_candidate_id text,
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
  if pg_catalog.length(pg_catalog.btrim(p_candidate_id)) = 0
     or pg_catalog.length(pg_catalog.btrim(p_ip_fingerprint)) = 0 then
    allowed := false;
    blocked_until := null;
    return next;
    return;
  end if;

  insert into public.candidate_panel_pin_attempts (
    candidate_id,
    ip_fingerprint,
    window_started_at,
    failed_count,
    blocked_until,
    last_failed_at,
    updated_at
  )
  values (
    p_candidate_id,
    p_ip_fingerprint,
    v_now,
    1,
    null,
    v_now,
    v_now
  )
  on conflict (candidate_id, ip_fingerprint) do update
     set window_started_at =
           case
             when public.candidate_panel_pin_attempts.window_started_at <= v_now - interval '10 minutes'
             then v_now
             else public.candidate_panel_pin_attempts.window_started_at
           end,
         failed_count =
           case
             when public.candidate_panel_pin_attempts.window_started_at <= v_now - interval '10 minutes'
             then 1
             else public.candidate_panel_pin_attempts.failed_count + 1
           end,
         blocked_until =
           case
             when (
               case
                 when public.candidate_panel_pin_attempts.window_started_at <= v_now - interval '10 minutes'
                 then 1
                 else public.candidate_panel_pin_attempts.failed_count + 1
               end
             ) >= 5
             then v_now + interval '15 minutes'
             else public.candidate_panel_pin_attempts.blocked_until
           end,
         last_failed_at = v_now,
         updated_at = v_now
  returning public.candidate_panel_pin_attempts.blocked_until
  into v_blocked_until;

  allowed := not (v_blocked_until is not null and v_blocked_until > v_now);
  blocked_until := v_blocked_until;
  return next;
end;
$$;

create or replace function public.reset_candidate_panel_pin_rate_limit(
  p_candidate_id text,
  p_ip_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if pg_catalog.length(pg_catalog.btrim(p_candidate_id)) = 0
     or pg_catalog.length(pg_catalog.btrim(p_ip_fingerprint)) = 0 then
    return;
  end if;

  delete from public.candidate_panel_pin_attempts
   where candidate_id = p_candidate_id
     and ip_fingerprint = p_ip_fingerprint;
end;
$$;

create or replace function public.cleanup_candidate_panel_auth_state()
returns table(deleted_sessions integer, deleted_attempts integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_sessions integer := 0;
  v_attempts integer := 0;
begin
  delete from public.candidate_panel_sessions
   where expires_at < pg_catalog.now() - interval '1 day'
      or (
        revoked_at is not null
        and revoked_at < pg_catalog.now() - interval '1 day'
      );
  get diagnostics v_sessions = row_count;

  delete from public.candidate_panel_pin_attempts
   where updated_at < pg_catalog.now() - interval '1 day'
     and (blocked_until is null or blocked_until < pg_catalog.now());
  get diagnostics v_attempts = row_count;

  deleted_sessions := v_sessions;
  deleted_attempts := v_attempts;
  return next;
end;
$$;

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
  v_now timestamptz := pg_catalog.now();
begin
  update public.votoclaro_live_entries
     set status = 'ENDED'
   where candidate_id = p_candidate_id
     and status = 'LIVE';

  return query
  insert into public.votoclaro_live_entries (
    candidate_id,
    candidate_name,
    platform,
    url,
    status,
    created_at
  )
  values (
    p_candidate_id,
    p_candidate_name,
    p_platform,
    p_url,
    'LIVE',
    v_now
  )
  returning
    public.votoclaro_live_entries.id,
    public.votoclaro_live_entries.candidate_id,
    public.votoclaro_live_entries.candidate_name,
    public.votoclaro_live_entries.platform::text,
    public.votoclaro_live_entries.url,
    public.votoclaro_live_entries.status::text,
    public.votoclaro_live_entries.created_at;
end;
$$;

revoke all on function public.check_candidate_panel_pin_rate_limit(text, text) from public;
revoke all on function public.check_candidate_panel_pin_rate_limit(text, text) from anon;
revoke all on function public.check_candidate_panel_pin_rate_limit(text, text) from authenticated;
grant execute on function public.check_candidate_panel_pin_rate_limit(text, text) to service_role;

revoke all on function public.record_candidate_panel_pin_failure(text, text) from public;
revoke all on function public.record_candidate_panel_pin_failure(text, text) from anon;
revoke all on function public.record_candidate_panel_pin_failure(text, text) from authenticated;
grant execute on function public.record_candidate_panel_pin_failure(text, text) to service_role;

revoke all on function public.reset_candidate_panel_pin_rate_limit(text, text) from public;
revoke all on function public.reset_candidate_panel_pin_rate_limit(text, text) from anon;
revoke all on function public.reset_candidate_panel_pin_rate_limit(text, text) from authenticated;
grant execute on function public.reset_candidate_panel_pin_rate_limit(text, text) to service_role;

revoke all on function public.cleanup_candidate_panel_auth_state() from public;
revoke all on function public.cleanup_candidate_panel_auth_state() from anon;
revoke all on function public.cleanup_candidate_panel_auth_state() from authenticated;
grant execute on function public.cleanup_candidate_panel_auth_state() to service_role;

revoke all on function public.create_candidate_live_entry(text, text, text, text) from public;
revoke all on function public.create_candidate_live_entry(text, text, text, text) from anon;
revoke all on function public.create_candidate_live_entry(text, text, text, text) from authenticated;
grant execute on function public.create_candidate_live_entry(text, text, text, text) to service_role;

alter table public.votoclaro_live_entries
  add column if not exists updated_at timestamptz;

do $$
declare
  v_trigger_exists boolean;
begin
  select exists (
    select 1
      from pg_catalog.pg_trigger trigger_record
      join pg_catalog.pg_class relation_record
        on relation_record.oid = trigger_record.tgrelid
      join pg_catalog.pg_namespace namespace_record
        on namespace_record.oid = relation_record.relnamespace
     where namespace_record.nspname = 'public'
       and relation_record.relname = 'votoclaro_live_entries'
       and trigger_record.tgname = 'trg_votoclaro_live_entries_updated_at'
       and not trigger_record.tgisinternal
  )
  into v_trigger_exists;

  if v_trigger_exists then
    alter table public.votoclaro_live_entries
      disable trigger trg_votoclaro_live_entries_updated_at;
  end if;

  update public.votoclaro_live_entries
     set updated_at = coalesce(created_at, pg_catalog.now())
   where updated_at is null;

  if v_trigger_exists then
    alter table public.votoclaro_live_entries
      enable trigger trg_votoclaro_live_entries_updated_at;
  end if;
exception
  when others then
    if v_trigger_exists then
      alter table public.votoclaro_live_entries
        enable trigger trg_votoclaro_live_entries_updated_at;
    end if;
    raise;
end $$;

alter table public.votoclaro_live_entries
  alter column updated_at set default now();

alter table public.votoclaro_live_entries
  alter column updated_at set not null;

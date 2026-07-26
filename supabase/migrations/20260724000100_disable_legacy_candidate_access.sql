-- Add explicit candidate credential status and disable legacy-party candidates.
-- This migration does not delete candidates, live entries, or historical records.

begin;

alter table public.votoclaro_candidate_pins
  add column if not exists credential_status text not null default 'ACTIVE';

alter table public.votoclaro_candidate_pins
  add column if not exists credential_status_updated_at timestamptz not null default now();

alter table public.votoclaro_candidate_pins
  add column if not exists credential_status_reason text null;

alter table public.votoclaro_candidate_pins
  alter column credential_status set default 'ACTIVE';

update public.votoclaro_candidate_pins as pins
   set credential_status = 'ACTIVE'
 where pins.credential_status is null;

alter table public.votoclaro_candidate_pins
  alter column credential_status set not null;

alter table public.votoclaro_candidate_pins
  alter column credential_status_updated_at set default now();

update public.votoclaro_candidate_pins as pins
   set credential_status_updated_at = pg_catalog.now()
 where pins.credential_status_updated_at is null;

alter table public.votoclaro_candidate_pins
  alter column credential_status_updated_at set not null;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint constraint_record
     where constraint_record.conname = 'votoclaro_candidate_pins_credential_status_check'
       and constraint_record.conrelid = 'public.votoclaro_candidate_pins'::regclass
  ) then
    alter table public.votoclaro_candidate_pins
      add constraint votoclaro_candidate_pins_credential_status_check
      check (credential_status in ('ACTIVE', 'DISABLED', 'REVOKED'));
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint constraint_record
     where constraint_record.conname = 'votoclaro_candidate_pins_credential_status_reason_length_check'
       and constraint_record.conrelid = 'public.votoclaro_candidate_pins'::regclass
  ) then
    alter table public.votoclaro_candidate_pins
      add constraint votoclaro_candidate_pins_credential_status_reason_length_check
      check (
        credential_status_reason is null
        or pg_catalog.length(credential_status_reason) <= 120
      );
  end if;
end $$;

comment on column public.votoclaro_candidate_pins.credential_status is
  'Explicit candidate private-access credential status: ACTIVE, DISABLED, or REVOKED.';

comment on column public.votoclaro_candidate_pins.credential_status_updated_at is
  'Timestamp of the latest candidate credential status change.';

comment on column public.votoclaro_candidate_pins.credential_status_reason is
  'Short non-secret administrative reason for the current credential status.';

create or replace function public.disable_candidate_panel_access(
  p_candidate_id text,
  p_expected_revision bigint,
  p_reason text
)
returns table(
  candidate_id text,
  credential_status text,
  credential_revision bigint,
  credential_status_updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_reason text := pg_catalog.btrim(p_reason);
  v_now timestamptz := pg_catalog.now();
  v_current_revision bigint;
  v_next_revision bigint;
  v_status_updated_at timestamptz;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) = 0
     or pg_catalog.length(v_candidate_id) > 160
     or p_expected_revision is null
     or p_expected_revision < 0
     or v_reason is null
     or pg_catalog.length(v_reason) = 0
     or pg_catalog.length(v_reason) > 120 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_CANDIDATE_ACCESS_DISABLE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('candidate-access-code:' || v_candidate_id, 0)
  );

  select pins.credential_revision
    into v_current_revision
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = v_candidate_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_ACCESS_DISABLE_NOT_FOUND';
  end if;

  if v_current_revision <> p_expected_revision then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_ACCESS_CODE_REVISION_CONFLICT';
  end if;

  update public.votoclaro_candidate_pins as pins
     set pin = null,
         access_code_verifier = null,
         access_code_rotated_at = null,
         credential_status = 'DISABLED',
         credential_status_updated_at = v_now,
         credential_status_reason = v_reason,
         credential_revision = pins.credential_revision + 1
   where pins.candidate_id = v_candidate_id
   returning
     pins.credential_revision,
     pins.credential_status_updated_at
    into
     v_next_revision,
     v_status_updated_at;

  delete from public.candidate_panel_sessions as sessions
   where sessions.candidate_id = v_candidate_id;

  delete from public.candidate_panel_pin_attempts as attempts
   where attempts.candidate_id = v_candidate_id;

  return query
  select
    v_candidate_id,
    'DISABLED'::text,
    v_next_revision,
    v_status_updated_at;
end;
$$;

create or replace function public.rotate_candidate_access_code(
  p_candidate_id text,
  p_expected_revision bigint,
  p_access_code_verifier text
)
returns table(
  candidate_id text,
  credential_revision bigint,
  access_code_rotated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_now timestamptz := pg_catalog.now();
  v_current_revision bigint;
  v_current_status text;
  v_next_revision bigint;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) = 0
     or pg_catalog.length(v_candidate_id) > 160
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_access_code_verifier is null
     or pg_catalog.length(pg_catalog.btrim(p_access_code_verifier)) = 0
     or pg_catalog.length(pg_catalog.btrim(p_access_code_verifier)) > 300 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_CANDIDATE_ACCESS_CODE_ROTATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('candidate-access-code:' || v_candidate_id, 0)
  );

  select pins.credential_revision,
         pins.credential_status
    into v_current_revision,
         v_current_status
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = v_candidate_id
   for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'CANDIDATE_ACCESS_CODE_REVISION_CONFLICT';
    end if;

    insert into public.votoclaro_candidate_pins as pins (
      candidate_id,
      pin,
      access_code_verifier,
      access_code_rotated_at,
      credential_revision,
      credential_status,
      credential_status_updated_at,
      credential_status_reason
    )
    values (
      v_candidate_id,
      null,
      pg_catalog.btrim(p_access_code_verifier),
      v_now,
      1,
      'ACTIVE',
      v_now,
      null
    )
    returning
      pins.credential_revision,
      pins.access_code_rotated_at
    into
      v_next_revision,
      access_code_rotated_at;
  else
    if v_current_status <> 'ACTIVE' then
      raise exception using
        errcode = 'P0001',
        message = 'CANDIDATE_ACCESS_CODE_STATUS_CONFLICT';
    end if;

    if v_current_revision <> p_expected_revision then
      raise exception using
        errcode = 'P0001',
        message = 'CANDIDATE_ACCESS_CODE_REVISION_CONFLICT';
    end if;

    update public.votoclaro_candidate_pins as pins
       set pin = null,
           access_code_verifier = pg_catalog.btrim(p_access_code_verifier),
           access_code_rotated_at = v_now,
           credential_revision = pins.credential_revision + 1
     where pins.candidate_id = v_candidate_id
     returning
       pins.credential_revision,
       pins.access_code_rotated_at
    into
       v_next_revision,
       access_code_rotated_at;
  end if;

  delete from public.candidate_panel_sessions as sessions
   where sessions.candidate_id = v_candidate_id;

  delete from public.candidate_panel_pin_attempts as attempts
   where attempts.candidate_id = v_candidate_id;

  candidate_id := v_candidate_id;
  credential_revision := v_next_revision;
  return next;
end;
$$;

create or replace function public.create_candidate_panel_session_if_active(
  p_candidate_id text,
  p_expected_revision bigint,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table(
  id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_token_hash text := pg_catalog.btrim(p_token_hash);
  v_current_revision bigint;
  v_current_status text;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) = 0
     or pg_catalog.length(v_candidate_id) > 160
     or p_expected_revision is null
     or p_expected_revision < 0
     or v_token_hash is null
     or pg_catalog.length(v_token_hash) <> 64
     or v_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at <= pg_catalog.now() then
    raise exception using
      errcode = '22023',
      message = 'INVALID_CANDIDATE_PANEL_SESSION_CREATE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('candidate-access-code:' || v_candidate_id, 0)
  );

  select pins.credential_revision,
         pins.credential_status
    into v_current_revision,
         v_current_status
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = v_candidate_id
   for update;

  if not found
     or v_current_status <> 'ACTIVE'
     or v_current_revision <> p_expected_revision then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_PANEL_SESSION_CREDENTIAL_CONFLICT';
  end if;

  return query
  with inserted_session as (
    insert into public.candidate_panel_sessions as sessions (
      candidate_id,
      token_hash,
      expires_at
    )
    values (
      v_candidate_id,
      v_token_hash,
      p_expires_at
    )
    returning
      sessions.id,
      sessions.expires_at
  )
  select
    inserted_session.id,
    inserted_session.expires_at
  from inserted_session;
end;
$$;

revoke all on function public.disable_candidate_panel_access(text, bigint, text) from public;
revoke all on function public.disable_candidate_panel_access(text, bigint, text) from anon;
revoke all on function public.disable_candidate_panel_access(text, bigint, text) from authenticated;
grant execute on function public.disable_candidate_panel_access(text, bigint, text) to service_role;

revoke all on function public.rotate_candidate_access_code(text, bigint, text) from public;
revoke all on function public.rotate_candidate_access_code(text, bigint, text) from anon;
revoke all on function public.rotate_candidate_access_code(text, bigint, text) from authenticated;
grant execute on function public.rotate_candidate_access_code(text, bigint, text) to service_role;

revoke all on function public.create_candidate_panel_session_if_active(text, bigint, text, timestamptz) from public;
revoke all on function public.create_candidate_panel_session_if_active(text, bigint, text, timestamptz) from anon;
revoke all on function public.create_candidate_panel_session_if_active(text, bigint, text, timestamptz) from authenticated;
grant execute on function public.create_candidate_panel_session_if_active(text, bigint, text, timestamptz) to service_role;

select *
  from public.disable_candidate_panel_access(
    'elizabeth-alfaro-espinoza',
    0,
    'LEGACY_PARTY_INACTIVE'
  );

select *
  from public.disable_candidate_panel_access(
    'luis-bernardo-guerrero-figueroa',
    0,
    'LEGACY_PARTY_INACTIVE'
  );

select *
  from public.disable_candidate_panel_access(
    'virgilio-acuña-peralta',
    0,
    'LEGACY_PARTY_INACTIVE'
  );

commit;

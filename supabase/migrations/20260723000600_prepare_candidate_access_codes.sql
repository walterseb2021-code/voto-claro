-- Prepare candidate access-code credentials.
-- Additive and reversible before the definitive PIN-column removal phase.

alter table public.votoclaro_candidate_pins
  add column if not exists access_code_verifier text null;

alter table public.votoclaro_candidate_pins
  add column if not exists access_code_rotated_at timestamptz null;

alter table public.votoclaro_candidate_pins
  add column if not exists credential_revision bigint not null default 0;

-- Temporarily allow NULL PINs during the access-code transition.
-- Rotated candidates store only access_code_verifier; the definitive phase will remove pin.
alter table public.votoclaro_candidate_pins
  alter column pin drop not null;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint constraint_record
     where constraint_record.conname = 'votoclaro_candidate_pins_credential_revision_check'
       and constraint_record.conrelid = 'public.votoclaro_candidate_pins'::regclass
  ) then
    alter table public.votoclaro_candidate_pins
      add constraint votoclaro_candidate_pins_credential_revision_check
      check (credential_revision >= 0);
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint constraint_record
     where constraint_record.conname = 'votoclaro_candidate_pins_access_code_verifier_length_check'
       and constraint_record.conrelid = 'public.votoclaro_candidate_pins'::regclass
  ) then
    alter table public.votoclaro_candidate_pins
      add constraint votoclaro_candidate_pins_access_code_verifier_length_check
      check (
        access_code_verifier is null
        or pg_catalog.length(access_code_verifier) <= 300
      );
  end if;
end $$;

comment on column public.votoclaro_candidate_pins.access_code_verifier is
  'Versioned scrypt verifier for the candidate access code. The raw access code is never stored.';

comment on column public.votoclaro_candidate_pins.access_code_rotated_at is
  'Timestamp of the latest candidate access-code rotation.';

comment on column public.votoclaro_candidate_pins.credential_revision is
  'Optimistic concurrency counter for candidate credential rotations.';

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

  select pins.credential_revision
    into v_current_revision
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
      credential_revision
    )
    values (
      v_candidate_id,
      null,
      pg_catalog.btrim(p_access_code_verifier),
      v_now,
      1
    )
    returning
      pins.credential_revision,
      pins.access_code_rotated_at
    into
      v_next_revision,
      access_code_rotated_at;
  else
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

revoke all on function public.rotate_candidate_access_code(text, bigint, text) from public;
revoke all on function public.rotate_candidate_access_code(text, bigint, text) from anon;
revoke all on function public.rotate_candidate_access_code(text, bigint, text) from authenticated;
grant execute on function public.rotate_candidate_access_code(text, bigint, text) to service_role;

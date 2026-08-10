-- B-SEC-14AF
-- Fundacion de registro server-side seguro para project_participants.
-- Esta migracion es deliberadamente COMPATIBLE con las paginas heredadas:
-- NO revoca aun SELECT/INSERT/UPDATE/DELETE de project_participants.
-- NO revoca aun EXECUTE de generar_codigo_acceso().
-- Esos cierres se haran despues de desplegar y validar el nuevo registro.

begin;

alter table public.project_participants
  add column if not exists data_processing_accepted_at timestamptz null,
  add column if not exists data_processing_version text null,
  add column if not exists participation_rules_accepted_at timestamptz null,
  add column if not exists participation_rules_version text null;

alter table public.project_participants
  drop constraint if exists project_participants_registration_consent_check;

alter table public.project_participants
  add constraint project_participants_registration_consent_check
  check (
    (
      data_processing_accepted_at is null
      and data_processing_version is null
      and participation_rules_accepted_at is null
      and participation_rules_version is null
    )
    or
    (
      data_processing_accepted_at is not null
      and data_processing_version is not null
      and length(data_processing_version) between 1 and 80
      and participation_rules_accepted_at is not null
      and participation_rules_version is not null
      and length(participation_rules_version) between 1 and 80
    )
  );

create table public.project_participant_registration_attempts (
  id uuid primary key default gen_random_uuid(),
  ip_fingerprint text not null unique
    check (ip_fingerprint ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  blocked_until timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.project_participant_registration_attempts
  enable row level security;

revoke all privileges
  on table public.project_participant_registration_attempts
  from public, anon, authenticated, service_role;

create or replace function public.consume_project_participant_registration_attempt(
  p_ip_fingerprint text
)
returns table (
  allowed boolean,
  blocked_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.project_participant_registration_attempts%rowtype;
begin
  if p_ip_fingerprint is null
     or p_ip_fingerprint !~ '^[0-9a-f]{64}$' then
    return query select false, null::timestamptz;
    return;
  end if;

  insert into public.project_participant_registration_attempts (
    ip_fingerprint,
    window_started_at,
    attempt_count,
    blocked_until,
    updated_at
  )
  values (
    p_ip_fingerprint,
    v_now,
    0,
    null,
    v_now
  )
  on conflict (ip_fingerprint) do nothing;

  select *
  into v_row
  from public.project_participant_registration_attempts
  where ip_fingerprint = p_ip_fingerprint
  for update;

  if v_row.blocked_until is not null
     and v_row.blocked_until > v_now then
    return query select false, v_row.blocked_until;
    return;
  end if;

  if v_row.window_started_at <= v_now - interval '30 minutes' then
    update public.project_participant_registration_attempts
    set
      window_started_at = v_now,
      attempt_count = 1,
      blocked_until = null,
      updated_at = v_now
    where ip_fingerprint = p_ip_fingerprint;

    return query select true, null::timestamptz;
    return;
  end if;

  if v_row.attempt_count >= 10 then
    update public.project_participant_registration_attempts
    set
      blocked_until = v_now + interval '30 minutes',
      updated_at = v_now
    where ip_fingerprint = p_ip_fingerprint
    returning public.project_participant_registration_attempts.blocked_until
      into v_row.blocked_until;

    return query select false, v_row.blocked_until;
    return;
  end if;

  update public.project_participant_registration_attempts
  set
    attempt_count = attempt_count + 1,
    blocked_until = null,
    updated_at = v_now
  where ip_fingerprint = p_ip_fingerprint;

  return query select true, null::timestamptz;
end;
$function$;

revoke all
  on function public.consume_project_participant_registration_attempt(text)
  from public, anon, authenticated, service_role;

grant execute
  on function public.consume_project_participant_registration_attempt(text)
  to service_role;

create or replace function public.register_project_participant_secure(
  p_full_name text,
  p_dni text,
  p_email text,
  p_phone text,
  p_address text,
  p_district text,
  p_alias text,
  p_device_id text,
  p_consent_accepted boolean,
  p_data_processing_version text,
  p_participation_rules_version text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (
  participant_id uuid,
  full_name text,
  alias text,
  codigo_acceso text,
  created_at timestamp without time zone
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_participant_id uuid;
  v_codigo text;
  v_created_at timestamp without time zone;
  v_constraint_name text;
  v_inserted boolean := false;
  v_now timestamptz := clock_timestamp();
  v_attempt integer;
begin
  if p_consent_accepted is distinct from true then
    raise exception using errcode = 'P0001', message = 'consent_required';
  end if;

  if p_full_name is null or length(p_full_name) < 2 or length(p_full_name) > 120
     or p_dni is null or p_dni !~ '^[0-9]{8}$'
     or p_email is null or length(p_email) < 3 or length(p_email) > 254
     or p_phone is null or length(p_phone) < 6 or length(p_phone) > 30
     or p_address is null or length(p_address) < 3 or length(p_address) > 200
     or p_district is null or length(p_district) < 2 or length(p_district) > 120
     or p_alias is null or length(p_alias) < 2 or length(p_alias) > 80
     or p_device_id is null or length(p_device_id) < 1 or length(p_device_id) > 120
     or p_data_processing_version is null
     or length(p_data_processing_version) < 1
     or length(p_data_processing_version) > 80
     or p_participation_rules_version is null
     or length(p_participation_rules_version) < 1
     or length(p_participation_rules_version) > 80
     or p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at <= v_now then
    raise exception using errcode = 'P0001', message = 'registration_invalid';
  end if;

  if exists (
    select 1
    from public.project_participants
    where dni = p_dni
  ) then
    raise exception using errcode = 'P0001', message = 'participant_exists';
  end if;

  for v_attempt in 1..5 loop
    v_codigo := public.generar_codigo_acceso();

    begin
      insert into public.project_participants (
        full_name,
        dni,
        email,
        phone,
        address,
        district,
        alias,
        device_id,
        codigo_acceso,
        data_processing_accepted_at,
        data_processing_version,
        participation_rules_accepted_at,
        participation_rules_version
      )
      values (
        p_full_name,
        p_dni,
        p_email,
        p_phone,
        p_address,
        p_district,
        p_alias,
        p_device_id,
        v_codigo,
        v_now,
        p_data_processing_version,
        v_now,
        p_participation_rules_version
      )
      returning id, public.project_participants.created_at
      into v_participant_id, v_created_at;

      v_inserted := true;
      exit;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint_name = CONSTRAINT_NAME;

        if v_constraint_name = 'project_participants_codigo_acceso_key' then
          null;
        elsif v_constraint_name = 'project_participants_dni_key' then
          raise exception using errcode = 'P0001', message = 'participant_exists';
        else
          raise;
        end if;
    end;
  end loop;

  if not v_inserted or v_participant_id is null then
    raise exception using errcode = 'P0001', message = 'registration_unavailable';
  end if;

  insert into public.project_participant_sessions (
    participant_id,
    token_hash,
    expires_at
  )
  values (
    v_participant_id,
    p_token_hash,
    p_expires_at
  );

  return query
  select
    v_participant_id,
    p_full_name,
    p_alias,
    v_codigo,
    v_created_at;
end;
$function$;

revoke all
  on function public.register_project_participant_secure(
    text, text, text, text, text, text, text, text,
    boolean, text, text, text, timestamptz
  )
  from public, anon, authenticated, service_role;

grant execute
  on function public.register_project_participant_secure(
    text, text, text, text, text, text, text, text,
    boolean, text, text, text, timestamptz
  )
  to service_role;

commit;
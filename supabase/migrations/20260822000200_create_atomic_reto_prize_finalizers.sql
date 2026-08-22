begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if pg_catalog.to_regclass('public.reto_game_sessions') is null then
    raise exception 'BSEC14HAJB2B3_ABORT: reto_game_sessions missing';
  end if;
  if pg_catalog.to_regclass('public.reto_camino_qualifiers') is null then
    raise exception 'BSEC14HAJB2B3_ABORT: reto_camino_qualifiers missing';
  end if;
  if pg_catalog.to_regclass('public.reto_premio_winners') is null then
    raise exception 'BSEC14HAJB2B3_ABORT: reto_premio_winners missing';
  end if;
  if pg_catalog.to_regclass('public.project_participants') is null then
    raise exception 'BSEC14HAJB2B3_ABORT: project_participants missing';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reto_premio_winners'
      and column_name = 'game_session_id'
  ) then
    raise exception 'BSEC14HAJB2B3_ABORT: game_session_id already exists';
  end if;

  if pg_catalog.to_regprocedure(
    'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)'
  ) is not null then
    raise exception 'BSEC14HAJB2B3_ABORT: principal finalizer already exists';
  end if;

  if pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  ) is not null then
    raise exception 'BSEC14HAJB2B3_ABORT: camino finalizer already exists';
  end if;

  if exists (
    select 1
    from public.reto_premio_winners
    where participant_id is null
  ) then
    raise exception 'BSEC14HAJB2B3_ABORT: existing winner without participant_id';
  end if;
end
$$;

alter table public.reto_premio_winners
  add column game_session_id uuid;

alter table public.reto_premio_winners
  add constraint reto_premio_winners_session_identity_fk
  foreign key (game_session_id, participant_id, group_code)
  references public.reto_game_sessions(id, participant_id, group_code)
  on update restrict
  on delete restrict;

create unique index reto_premio_winners_game_session_uniq
  on public.reto_premio_winners(game_session_id)
  where game_session_id is not null;

create or replace function public.finalize_reto_principal_spin_atomic(
  p_session_id uuid,
  p_participant_id uuid,
  p_group_code text,
  p_expected_state_version integer,
  p_segment smallint
)
returns table (
  session_id uuid,
  state_version integer,
  segment smallint,
  is_prize boolean,
  awarded boolean,
  award_reason text,
  winner_id uuid,
  prize_locked_until timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_session public.reto_game_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next_state jsonb;
  v_is_prize boolean := false;
  v_awarded boolean := false;
  v_award_reason text := 'not_prize';
  v_winner_id uuid := null;
  v_last_win timestamptz := null;
  v_locked_until timestamptz := null;
  v_year_month text;
  v_dni text;
  v_email text;
  v_phone text;
  v_device_id text;
begin
  if p_session_id is null
     or p_participant_id is null
     or p_expected_state_version is null
     or p_expected_state_version <= 0
     or p_group_code is null
     or btrim(p_group_code) !~ '^GRUPO[A-Z]$'
     or p_segment is null
     or p_segment < 1
     or p_segment > 8 then
    raise exception 'RETO_FINALIZE_INVALID_INPUT';
  end if;

  select s.*
  into v_session
  from public.reto_game_sessions s
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = btrim(p_group_code)
    and s.game_code = 'principal'
    and s.game_mode = 'con_premio'
    and s.status = 'active'
  for update;

  if not found then
    raise exception 'RETO_FINALIZE_SESSION_NOT_ACTIVE';
  end if;

  if v_session.state_version <> p_expected_state_version then
    raise exception 'RETO_FINALIZE_STATE_CONFLICT';
  end if;

  if v_session.expires_at <= v_now then
    raise exception 'RETO_FINALIZE_SESSION_EXPIRED';
  end if;

  if v_session.state ->> 'phase' <> 'roulette'
     or v_session.state ->> 'level1_passed' <> 'true'
     or v_session.state ->> 'level2_passed' <> 'true'
     or v_session.state ->> 'roulette_used' <> 'false'
     or v_session.state ->> 'current_question_id' is not null then
    raise exception 'RETO_FINALIZE_STATE_INVALID';
  end if;

  v_is_prize := p_segment in (2, 6);

  v_next_state := jsonb_set(
    jsonb_set(
      jsonb_set(v_session.state, '{phase}', '"completed"'::jsonb, true),
      '{roulette_used}', 'true'::jsonb, true
    ),
    '{roulette_result}', to_jsonb(p_segment), true
  );

  if v_is_prize then
    select pp.dni, pp.email, pp.phone, pp.device_id
    into v_dni, v_email, v_phone, v_device_id
    from public.project_participants pp
    where pp.id = p_participant_id;

    if not found
       or btrim(coalesce(v_dni, '')) = ''
       or btrim(coalesce(v_email, '')) = ''
       or btrim(coalesce(v_phone, '')) = '' then
      raise exception 'RETO_FINALIZE_PARTICIPANT_DATA_INVALID';
    end if;

    select max(w.created_at)
    into v_last_win
    from public.reto_premio_winners w
    where w.participant_id = p_participant_id;

    if v_last_win is not null and v_last_win + interval '30 days' > v_now then
      v_award_reason := 'recent_prize_lock';
      v_locked_until := v_last_win + interval '30 days';
    else
      v_year_month := to_char(v_now at time zone 'UTC', 'YYYY-MM');

      if exists (
        select 1
        from public.reto_premio_winners w
        where w.participant_id = p_participant_id
          and w.year_month = v_year_month
      ) then
        v_award_reason := 'month_unique_lock';
      else
        insert into public.reto_premio_winners (
          group_code, dni, celular, email, device_id,
          prize_segment, prize_note, year_month, status,
          participant_id, game_session_id
        )
        values (
          btrim(p_group_code),
          btrim(v_dni),
          btrim(v_phone),
          btrim(v_email),
          nullif(btrim(coalesce(v_device_id, '')), ''),
          p_segment,
          'Premio ruleta',
          v_year_month,
          'pendiente',
          p_participant_id,
          p_session_id
        )
        on conflict do nothing
        returning id into v_winner_id;

        if v_winner_id is null then
          v_award_reason := 'unique_conflict';
        else
          v_awarded := true;
          v_award_reason := 'awarded';
          v_locked_until := v_now + interval '30 days';
        end if;
      end if;
    end if;
  end if;

  update public.reto_game_sessions s
  set state = v_next_state,
      state_version = s.state_version + 1,
      status = 'completed',
      updated_at = v_now,
      finished_at = v_now
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = btrim(p_group_code)
    and s.status = 'active'
    and s.state_version = p_expected_state_version;

  if not found then
    raise exception 'RETO_FINALIZE_STATE_CONFLICT';
  end if;

  return query
  select p_session_id, p_expected_state_version + 1, p_segment,
         v_is_prize, v_awarded, v_award_reason, v_winner_id, v_locked_until;
end
$$;

alter function public.finalize_reto_principal_spin_atomic(
  uuid, uuid, text, integer, smallint
) owner to postgres;

revoke all on function public.finalize_reto_principal_spin_atomic(
  uuid, uuid, text, integer, smallint
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.finalize_reto_principal_spin_atomic(
  uuid, uuid, text, integer, smallint
) to service_role;

create or replace function public.finalize_reto_camino_win_atomic(
  p_session_id uuid,
  p_participant_id uuid,
  p_group_code text,
  p_expected_state_version integer,
  p_next_state jsonb
)
returns table (
  session_id uuid,
  state_version integer,
  qualifier_id uuid,
  already_qualified boolean,
  award_year integer,
  award_quarter smallint
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_session public.reto_game_sessions%rowtype;
  v_now timestamptz := clock_timestamp();
  v_year integer;
  v_quarter smallint;
  v_qualifier_id uuid := null;
  v_already boolean := false;
begin
  if p_session_id is null
     or p_participant_id is null
     or p_expected_state_version is null
     or p_expected_state_version <= 0
     or p_group_code is null
     or btrim(p_group_code) !~ '^GRUPO[A-Z]$'
     or p_next_state is null
     or jsonb_typeof(p_next_state) <> 'object' then
    raise exception 'RETO_CAMINO_FINALIZE_INVALID_INPUT';
  end if;

  if p_next_state ->> 'won' <> 'true'
     or p_next_state ->> 'position' <> '30'
     or p_next_state ->> 'current_question_id' is not null
     or p_next_state ->> 'question_deadline' is not null
     or p_next_state ->> 'pending_roll' is not null then
    raise exception 'RETO_CAMINO_FINALIZE_NEXT_STATE_INVALID';
  end if;

  if coalesce(p_next_state ->> 'turns_left', '') !~ '^[0-9]+$'
     or (p_next_state ->> 'turns_left')::integer < 0
     or (p_next_state ->> 'turns_left')::integer > 10 then
    raise exception 'RETO_CAMINO_FINALIZE_TURNS_INVALID';
  end if;

  select s.*
  into v_session
  from public.reto_game_sessions s
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = btrim(p_group_code)
    and s.game_code = 'camino'
    and s.game_mode = 'con_premio'
    and s.status = 'active'
  for update;

  if not found then
    raise exception 'RETO_CAMINO_FINALIZE_SESSION_NOT_ACTIVE';
  end if;

  if v_session.state_version <> p_expected_state_version then
    raise exception 'RETO_CAMINO_FINALIZE_STATE_CONFLICT';
  end if;

  if v_session.expires_at <= v_now then
    raise exception 'RETO_CAMINO_FINALIZE_SESSION_EXPIRED';
  end if;

  if v_session.state ->> 'won' <> 'false'
     or v_session.state ->> 'current_question_id' is null
     or v_session.state ->> 'pending_roll' is null then
    raise exception 'RETO_CAMINO_FINALIZE_STATE_INVALID';
  end if;

  update public.reto_game_sessions s
  set state = p_next_state,
      state_version = s.state_version + 1,
      status = 'completed',
      updated_at = v_now,
      finished_at = v_now
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = btrim(p_group_code)
    and s.status = 'active'
    and s.state_version = p_expected_state_version;

  if not found then
    raise exception 'RETO_CAMINO_FINALIZE_STATE_CONFLICT';
  end if;

  v_year := extract(year from (v_now at time zone 'UTC'))::integer;
  v_quarter := extract(quarter from (v_now at time zone 'UTC'))::smallint;

  insert into public.reto_camino_qualifiers (
    participant_id, game_session_id, group_code,
    award_year, award_quarter, qualified_at,
    status, created_at, updated_at
  )
  values (
    p_participant_id, p_session_id, btrim(p_group_code),
    v_year, v_quarter, v_now,
    'eligible', v_now, v_now
  )
  on conflict (participant_id, award_year, award_quarter)
  do nothing
  returning id into v_qualifier_id;

  if v_qualifier_id is null then
    select q.id
    into v_qualifier_id
    from public.reto_camino_qualifiers q
    where q.participant_id = p_participant_id
      and q.award_year = v_year
      and q.award_quarter = v_quarter
    limit 1;

    if v_qualifier_id is null then
      raise exception 'RETO_CAMINO_FINALIZE_QUALIFIER_CONFLICT';
    end if;

    v_already := true;
  end if;

  return query
  select p_session_id, p_expected_state_version + 1,
         v_qualifier_id, v_already, v_year, v_quarter;
end
$$;

alter function public.finalize_reto_camino_win_atomic(
  uuid, uuid, text, integer, jsonb
) owner to postgres;

revoke all on function public.finalize_reto_camino_win_atomic(
  uuid, uuid, text, integer, jsonb
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.finalize_reto_camino_win_atomic(
  uuid, uuid, text, integer, jsonb
) to service_role;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reto_premio_winners'
      and column_name = 'game_session_id'
  ) then
    raise exception 'BSEC14HAJB2B3_ABORT: game_session_id postcheck failed';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)',
    'EXECUTE'
  ) then
    raise exception 'BSEC14HAJB2B3_ABORT: service_role principal execute missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)',
    'EXECUTE'
  ) then
    raise exception 'BSEC14HAJB2B3_ABORT: principal finalizer exposed';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'BSEC14HAJB2B3_ABORT: service_role camino execute missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'BSEC14HAJB2B3_ABORT: camino finalizer exposed';
  end if;
end
$$;

commit;

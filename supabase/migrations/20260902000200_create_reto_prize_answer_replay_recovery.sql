-- ============================================================================
-- B2C-E5F10B3
-- CREATE IDEMPOTENT ANSWER REPLAY RECOVERY RPC
-- ============================================================================
-- Purpose:
-- Recover the exact result of an answer that PostgreSQL already committed when
-- the HTTP response was lost. This RPC does not answer again, advance the game,
-- create qualifiers, or call finalizers. It only reconstructs the immediately
-- committed N -> N+1 result when all stored evidence matches the exact replay.
--
-- RETO_PRIZES_ENABLED must remain false while this migration is applied.
-- ============================================================================

begin;

-- ============================================================================
-- PREFLIGHT
-- ============================================================================
do $preflight$
declare
  v_commit regprocedure;
  v_finalizer regprocedure;
  v_commit_def text;
  v_finalizer_def text;
begin
  if pg_catalog.to_regprocedure(
       'public.recover_reto_prize_answer_replay(uuid,uuid,text,text,integer,uuid,boolean)'
     ) is not null then
    raise exception 'B2C_E5F10B3_ABORT: recovery RPC already exists';
  end if;

  v_commit := pg_catalog.to_regprocedure(
    'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)'
  );
  v_finalizer := pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  );

  if v_commit is null or v_finalizer is null then
    raise exception 'B2C_E5F10B3_ABORT: required Camino RPC missing';
  end if;

  if pg_catalog.to_regclass('public.reto_game_sessions') is null
     or pg_catalog.to_regclass('public.reto_prize_question_instances') is null
     or pg_catalog.to_regclass('public.reto_camino_qualifiers') is null then
    raise exception 'B2C_E5F10B3_ABORT: required private table missing';
  end if;

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_commit_def
  from pg_catalog.pg_proc p
  where p.oid = v_commit;

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_finalizer_def
  from pg_catalog.pg_proc p
  where p.oid = v_finalizer;

  if pg_catalog.strpos(v_commit_def, 'pg_catalog.least(') <> 0
     or pg_catalog.strpos(v_commit_def, 'pg_catalog.greatest(') <> 0
     or pg_catalog.strpos(v_commit_def, 'least(v_position + v_roll, 30)') = 0
     or pg_catalog.strpos(v_commit_def, 'greatest(v_position - v_roll, 0)') = 0
     or pg_catalog.strpos(v_commit_def, 'greatest(0, v_turns_left - 1)') = 0 then
    raise exception 'B2C_E5F10B3_ABORT: Camino answer RPC repair missing';
  end if;

  if pg_catalog.strpos(
       pg_catalog.lower(v_finalizer_def),
       'on conflict (participant_id, award_year, award_quarter)'
     ) <> 0
     or pg_catalog.strpos(
          pg_catalog.lower(v_finalizer_def),
          'on conflict on constraint reto_camino_qualifiers_participant_period_uniq'
        ) = 0 then
    raise exception 'B2C_E5F10B3_ABORT: Camino finalizer repair missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.reto_camino_qualifiers'::pg_catalog.regclass
      and c.conname = 'reto_camino_qualifiers_participant_period_uniq'
      and c.contype = 'u'
      and c.convalidated
      and pg_catalog.pg_get_constraintdef(c.oid)
          = 'UNIQUE (participant_id, award_year, award_quarter)'
  ) then
    raise exception 'B2C_E5F10B3_ABORT: qualifier uniqueness contract changed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_game_sessions'
      and c.relrowsecurity
  )
  or not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_prize_question_instances'
      and c.relrowsecurity
  )
  or not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_camino_qualifiers'
      and c.relrowsecurity
  ) then
    raise exception 'B2C_E5F10B3_ABORT: expected RLS missing';
  end if;
end
$preflight$;

-- ============================================================================
-- RECOVERY RPC
-- ============================================================================
create function public.recover_reto_prize_answer_replay(
  p_session_id uuid,
  p_participant_id uuid,
  p_group_code text,
  p_game_code text,
  p_expected_state_version integer,
  p_question_instance_id uuid,
  p_answer boolean
)
returns table (
  session_id uuid,
  instance_id uuid,
  state_version integer,
  session_status text,
  answer_outcome text,
  was_correct boolean,
  qualifier_id uuid,
  already_qualified boolean,
  award_year integer,
  award_quarter smallint,
  session_state jsonb,
  finished_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_session public.reto_game_sessions%rowtype;
  v_instance public.reto_prize_question_instances%rowtype;
  v_qualifier_id uuid := null;
  v_qualifier_session_id uuid := null;
  v_already_qualified boolean := false;
  v_award_year integer := null;
  v_award_quarter smallint := null;
begin
  if p_session_id is null
     or p_participant_id is null
     or p_group_code is null
     or pg_catalog.btrim(p_group_code) !~ '^GRUPO[A-Z]$'
     or p_game_code not in ('principal', 'camino')
     or p_expected_state_version is null
     or p_expected_state_version <= 0
     or p_question_instance_id is null then
    raise exception 'RETO_ANSWER_REPLAY_INVALID_INPUT';
  end if;

  -- Exact immediate replay only: current session must be exactly N+1.
  select s.*
  into v_session
  from public.reto_game_sessions s
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = pg_catalog.btrim(p_group_code)
    and s.game_code = p_game_code
    and s.game_mode = 'con_premio'
    and s.state_version = p_expected_state_version + 1
    and s.status in ('active', 'failed', 'completed')
  for share;

  if not found then
    raise exception 'RETO_ANSWER_REPLAY_NOT_REPLAYABLE';
  end if;

  -- Bind replay to the exact question and exact committed transition.
  select qi.*
  into v_instance
  from public.reto_prize_question_instances qi
  where qi.id = p_question_instance_id
    and qi.session_id = p_session_id
    and qi.issued_state_version = p_expected_state_version
    and qi.answered_state_version = p_expected_state_version + 1
  for share;

  if not found then
    raise exception 'RETO_ANSWER_REPLAY_NOT_REPLAYABLE';
  end if;

  if v_instance.answered_at is null
     or v_instance.was_correct is null
     or v_instance.answer_outcome is null
     or v_instance.submitted_answer is distinct from p_answer then
    raise exception 'RETO_ANSWER_REPLAY_NOT_REPLAYABLE';
  end if;

  -- The post-answer state must prove that this exact question was consumed.
  if v_session.state ->> 'schema_version' <> '1'
     or v_session.state ->> 'current_question_id' is not null
     or v_session.state ->> 'question_deadline' is not null
     or pg_catalog.jsonb_typeof(v_session.state -> 'answered_question_ids') <> 'array'
     or not (
       (v_session.state -> 'answered_question_ids')
       @> pg_catalog.jsonb_build_array(p_question_instance_id::text)
     ) then
    raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
  end if;

  if p_game_code = 'principal' then
    -- Principal answer does not directly award the prize.
    if v_instance.source not in ('principal_level1', 'principal_level2')
       or v_session.status = 'completed' then
      raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
    end if;

    if v_session.state ->> 'phase' not in ('level1','level2','roulette','failed') then
      raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
    end if;
  else
    -- Camino answer must have consumed its pending roll.
    if v_instance.source <> 'camino'
       or v_session.state ->> 'pending_roll' is not null then
      raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
    end if;

    if v_session.status = 'completed' then
      if v_session.state ->> 'won' <> 'true'
         or v_session.state ->> 'position' <> '30'
         or v_session.finished_at is null then
        raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
      end if;

      v_award_year :=
        extract(year from (v_session.finished_at at time zone 'UTC'))::integer;
      v_award_quarter :=
        extract(quarter from (v_session.finished_at at time zone 'UTC'))::smallint;

      select q.id, q.game_session_id
      into v_qualifier_id, v_qualifier_session_id
      from public.reto_camino_qualifiers q
      where q.participant_id = p_participant_id
        and q.award_year = v_award_year
        and q.award_quarter = v_award_quarter
      order by q.qualified_at asc, q.id asc
      limit 1
      for share;

      if v_qualifier_id is null or v_qualifier_session_id is null then
        raise exception 'RETO_ANSWER_REPLAY_QUALIFIER_INVALID';
      end if;

      v_already_qualified := (v_qualifier_session_id <> p_session_id);
    else
      if v_session.state ->> 'won' <> 'false' then
        raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
      end if;
    end if;
  end if;

  return query
  select
    p_session_id,
    p_question_instance_id,
    v_session.state_version,
    v_session.status,
    v_instance.answer_outcome,
    v_instance.was_correct,
    v_qualifier_id,
    v_already_qualified,
    v_award_year,
    v_award_quarter,
    v_session.state,
    v_session.finished_at;
end
$function$;

alter function public.recover_reto_prize_answer_replay(
  uuid, uuid, text, text, integer, uuid, boolean
) owner to postgres;

revoke all on function public.recover_reto_prize_answer_replay(
  uuid, uuid, text, text, integer, uuid, boolean
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.recover_reto_prize_answer_replay(
  uuid, uuid, text, text, integer, uuid, boolean
) to service_role;

-- ============================================================================
-- POSTFLIGHT
-- ============================================================================
do $postflight$
declare
  v_proc regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
  v_result text;
  v_definition text;
begin
  v_proc := pg_catalog.to_regprocedure(
    'public.recover_reto_prize_answer_replay(uuid,uuid,text,text,integer,uuid,boolean)'
  );

  if v_proc is null then
    raise exception 'B2C_E5F10B3_POSTFLIGHT: recovery RPC missing';
  end if;

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.proconfig,
    pg_catalog.pg_get_function_result(p.oid),
    pg_catalog.pg_get_functiondef(p.oid)
  into
    v_owner,
    v_security_definer,
    v_config,
    v_result,
    v_definition
  from pg_catalog.pg_proc p
  where p.oid = v_proc;

  if v_owner <> 'postgres'
     or not v_security_definer
     or coalesce(pg_catalog.array_to_string(v_config, ','), '') <> 'search_path=pg_catalog' then
    raise exception 'B2C_E5F10B3_POSTFLIGHT: security attributes invalid';
  end if;

  if v_result not ilike '%session_state jsonb%'
     or v_result not ilike '%finished_at timestamp with time zone%'
     or v_result not ilike '%award_quarter smallint%' then
    raise exception 'B2C_E5F10B3_POSTFLIGHT: return contract invalid %', v_result;
  end if;

  if pg_catalog.strpos(v_definition, 'insert into ') <> 0
     or pg_catalog.strpos(v_definition, 'update public.') <> 0
     or pg_catalog.strpos(v_definition, 'delete from ') <> 0
     or pg_catalog.strpos(v_definition, 'finalize_reto_') <> 0 then
    raise exception 'B2C_E5F10B3_POSTFLIGHT: unexpected mutation/finalizer call';
  end if;

  if pg_catalog.strpos(v_definition, 'v_instance.source not in (''principal_level1'', ''principal_level2'')') = 0
     or pg_catalog.strpos(v_definition, 'v_instance.source <> ''camino''') = 0 then
    raise exception 'B2C_E5F10B3_POSTFLIGHT: source binding missing';
  end if;

  if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F10B3_POSTFLIGHT: function ACL invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where p.oid = v_proc
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'B2C_E5F10B3_POSTFLIGHT: PUBLIC EXECUTE present';
  end if;

  raise notice 'B2C_E5F10B3_POSTFLIGHT=PASS';
end
$postflight$;

commit;

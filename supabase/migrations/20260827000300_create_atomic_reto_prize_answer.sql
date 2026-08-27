-- B2C-E5F3
-- Respuesta atomica para preguntas privadas del Reto con premio.
-- No activa premios, no inserta banco de preguntas y no modifica public.reto_questions.
-- La respuesta se verifica contra correct_answer congelado en la instancia privada.
-- Instancia, estado de sesion y eventual finalizacion de Camino comparten una sola transaccion.

begin;

-- ============================================================
-- PREFLIGHT
-- ============================================================

do $preflight$
begin
  if pg_catalog.to_regclass('public.reto_game_sessions') is null
     or pg_catalog.to_regclass('public.reto_prize_question_instances') is null
     or pg_catalog.to_regclass('public.reto_camino_qualifiers') is null then
    raise exception 'B2C_E5F3_ABORT: faltan dependencias';
  end if;

  if pg_catalog.to_regprocedure(
    'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)'
  ) is not null then
    raise exception 'B2C_E5F3_ABORT: commit_reto_prize_answer_atomic ya existe';
  end if;

  if pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  ) is null then
    raise exception 'B2C_E5F3_ABORT: falta finalizador atomico de Camino';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'B2C_E5F3_ABORT: ACL inesperada en finalizador de Camino';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_prize_question_instances',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_prize_question_instances',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_prize_question_instances',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_prize_question_instances',
       'DELETE'
     ) then
    raise exception 'B2C_E5F3_ABORT: ACL inesperada en instancias privadas';
  end if;
end
$preflight$;

-- ============================================================
-- CHANGE: RPC ATOMICA DE RESPUESTA
-- ============================================================

create function public.commit_reto_prize_answer_atomic(
  p_session_id uuid,
  p_participant_id uuid,
  p_group_code text,
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
  award_quarter smallint
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_session public.reto_game_sessions%rowtype;
  v_instance public.reto_prize_question_instances%rowtype;

  v_now timestamptz;
  v_question_deadline timestamptz;
  v_pool_deadline timestamptz;

  v_answered_ids jsonb;
  v_next_state jsonb;

  v_timed_out boolean := false;
  v_correct boolean := false;
  v_outcome text;

  v_question_index integer;
  v_good integer;
  v_bad integer;
  v_skipped integer;
  v_next_index integer;
  v_next_good integer;
  v_next_bad integer;
  v_next_skipped integer;
  v_level_finished boolean;
  v_passed boolean;
  v_next_status text := 'active';
  v_finish boolean := false;

  v_position integer;
  v_turns_left integer;
  v_roll integer;
  v_next_position integer;
  v_next_turns integer;
  v_won boolean := false;
  v_game_over boolean := false;

  v_qualifier_id uuid := null;
  v_already_qualified boolean := false;
  v_award_year integer := null;
  v_award_quarter smallint := null;
begin
  -- ----------------------------------------------------------
  -- INPUT BASICO
  -- ----------------------------------------------------------

  if p_session_id is null
     or p_participant_id is null
     or p_group_code is null
     or pg_catalog.btrim(p_group_code) !~ '^GRUPO[A-Z]$'
     or p_expected_state_version is null
     or p_expected_state_version <= 0
     or p_question_instance_id is null then
    raise exception 'RETO_ANSWER_INVALID_INPUT';
  end if;

  -- ----------------------------------------------------------
  -- SESSION MUTEX + VERSION
  -- ----------------------------------------------------------

  select s.*
  into v_session
  from public.reto_game_sessions s
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = pg_catalog.btrim(p_group_code)
    and s.game_mode = 'con_premio'
    and s.status = 'active'
  for update;

  if not found then
    raise exception 'RETO_ANSWER_SESSION_NOT_ACTIVE';
  end if;

  if v_session.state_version <> p_expected_state_version then
    raise exception 'RETO_ANSWER_STATE_CONFLICT';
  end if;

  v_now := pg_catalog.clock_timestamp();

  if v_session.expires_at <= v_now then
    raise exception 'RETO_ANSWER_SESSION_EXPIRED';
  end if;

  if v_session.state ->> 'schema_version' <> '1'
     or v_session.state ->> 'current_question_id' is null
     or v_session.state ->> 'current_question_id' <> p_question_instance_id::text
     or v_session.state ->> 'question_deadline' is null then
    raise exception 'RETO_ANSWER_STATE_INVALID';
  end if;

  v_answered_ids := v_session.state -> 'answered_question_ids';

  if v_answered_ids is null
     or pg_catalog.jsonb_typeof(v_answered_ids) <> 'array'
     or pg_catalog.jsonb_array_length(v_answered_ids) > 100 then
    raise exception 'RETO_ANSWER_STATE_INVALID';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(v_answered_ids) as e(value)
    where pg_catalog.jsonb_typeof(e.value) <> 'string'
  ) then
    raise exception 'RETO_ANSWER_STATE_INVALID';
  end if;

  begin
    v_question_deadline :=
      (v_session.state ->> 'question_deadline')::timestamptz;
  exception
    when others then
      raise exception 'RETO_ANSWER_STATE_INVALID';
  end;

  if v_question_deadline is null then
    raise exception 'RETO_ANSWER_STATE_INVALID';
  end if;

  -- ----------------------------------------------------------
  -- LOCK PRIVATE QUESTION INSTANCE
  -- ----------------------------------------------------------

  select qi.*
  into v_instance
  from public.reto_prize_question_instances qi
  where qi.id = p_question_instance_id
    and qi.session_id = p_session_id
  for update;

  if not found then
    raise exception 'RETO_ANSWER_QUESTION_NOT_FOUND';
  end if;

  if v_instance.answered_at is not null
     or v_instance.answered_state_version is not null
     or v_instance.was_correct is not null
     or v_instance.answer_outcome is not null then
    raise exception 'RETO_ANSWER_ALREADY_COMMITTED';
  end if;

  -- issued_state_version stores the post-issue session version.
  if v_instance.issued_state_version <> p_expected_state_version then
    raise exception 'RETO_ANSWER_STATE_CONFLICT';
  end if;

  if v_instance.expires_at <> v_question_deadline then
    raise exception 'RETO_ANSWER_STATE_INVALID';
  end if;

  -- ----------------------------------------------------------
  -- AUTHORITATIVE OUTCOME
  -- ----------------------------------------------------------

  if v_session.game_code = 'principal' then
    if v_session.state ->> 'phase' not in ('level1', 'level2') then
      raise exception 'RETO_ANSWER_STATE_INVALID';
    end if;

    if v_session.state ->> 'phase' = 'level1' then
      if v_instance.source <> 'principal_level1'
         or v_session.state ->> 'level' <> '1'
         or v_session.state ->> 'party_id' is not null then
        raise exception 'RETO_ANSWER_STATE_INVALID';
      end if;
    else
      if v_instance.source <> 'principal_level2'
         or v_session.state ->> 'level' <> '2'
         or v_session.state ->> 'party_id' <> 'app'
         or v_session.state ->> 'level1_passed' <> 'true' then
        raise exception 'RETO_ANSWER_STATE_INVALID';
      end if;
    end if;

    if v_session.state ->> 'question_index' is null
       or v_session.state ->> 'question_index' !~ '^[0-9]+$'
       or v_session.state ->> 'good' is null
       or v_session.state ->> 'good' !~ '^[0-9]+$'
       or v_session.state ->> 'bad' is null
       or v_session.state ->> 'bad' !~ '^[0-9]+$'
       or v_session.state ->> 'skipped' is null
       or v_session.state ->> 'skipped' !~ '^[0-9]+$' then
      raise exception 'RETO_ANSWER_STATE_INVALID';
    end if;

    v_question_index := (v_session.state ->> 'question_index')::integer;
    v_good := (v_session.state ->> 'good')::integer;
    v_bad := (v_session.state ->> 'bad')::integer;
    v_skipped := (v_session.state ->> 'skipped')::integer;

    if v_question_index < 0
       or v_question_index >= 25
       or v_good < 0
       or v_bad < 0
       or v_skipped < 0
       or v_good > 25
       or v_bad > 25
       or v_skipped > 25
       or v_good + v_bad + v_skipped <> v_question_index then
      raise exception 'RETO_ANSWER_STATE_INVALID';
    end if;

    if v_session.state ->> 'pool_deadline' is null then
      raise exception 'RETO_ANSWER_STATE_INVALID';
    end if;

    begin
      v_pool_deadline :=
        (v_session.state ->> 'pool_deadline')::timestamptz;
    exception
      when others then
        raise exception 'RETO_ANSWER_STATE_INVALID';
    end;

    if v_pool_deadline is null
       or v_question_deadline > v_pool_deadline then
      raise exception 'RETO_ANSWER_STATE_INVALID';
    end if;

    v_timed_out :=
      v_question_deadline <= v_now
      or v_pool_deadline <= v_now;

  elsif v_session.game_code = 'camino' then
    if v_instance.source <> 'camino'
       or v_session.state ->> 'won' <> 'false'
       or v_session.state ->> 'pending_roll' is null
       or v_session.state ->> 'pending_roll' !~ '^[1-6]$'
       or v_session.state ->> 'position' is null
       or v_session.state ->> 'position' !~ '^[0-9]+$'
       or v_session.state ->> 'turns_left' is null
       or v_session.state ->> 'turns_left' !~ '^[0-9]+$' then
      raise exception 'RETO_ANSWER_STATE_INVALID';
    end if;

    v_position := (v_session.state ->> 'position')::integer;
    v_turns_left := (v_session.state ->> 'turns_left')::integer;
    v_roll := (v_session.state ->> 'pending_roll')::integer;

    if v_position < 0
       or v_position > 30
       or v_turns_left <= 0
       or v_turns_left > 10
       or v_roll < 1
       or v_roll > 6 then
      raise exception 'RETO_ANSWER_STATE_INVALID';
    end if;

    v_timed_out := v_question_deadline <= v_now;

  else
    raise exception 'RETO_ANSWER_GAME_INVALID';
  end if;

  if v_timed_out then
    v_outcome := 'timed_out';
    v_correct := false;
  elsif p_answer is null then
    v_outcome := 'skipped';
    v_correct := false;
  elsif p_answer = v_instance.correct_answer then
    v_outcome := 'correct';
    v_correct := true;
  else
    v_outcome := 'wrong';
    v_correct := false;
  end if;

  -- ----------------------------------------------------------
  -- INSTANCE COMMIT
  -- ----------------------------------------------------------

  update public.reto_prize_question_instances qi
  set answered_state_version = p_expected_state_version + 1,
      answered_at = v_now,
      submitted_answer = p_answer,
      was_correct = v_correct,
      answer_outcome = v_outcome
  where qi.id = p_question_instance_id
    and qi.session_id = p_session_id
    and qi.issued_state_version = p_expected_state_version
    and qi.answered_at is null
    and qi.answered_state_version is null
    and qi.was_correct is null
    and qi.answer_outcome is null;

  if not found then
    raise exception 'RETO_ANSWER_ALREADY_COMMITTED';
  end if;

  -- Preserve uniqueness in the audit trail without trusting the caller.
  if not (v_answered_ids ? p_question_instance_id::text) then
    v_answered_ids :=
      v_answered_ids
      || pg_catalog.jsonb_build_array(p_question_instance_id::text);
  end if;

  -- ----------------------------------------------------------
  -- PRINCIPAL STATE TRANSITION
  -- ----------------------------------------------------------

  if v_session.game_code = 'principal' then
    v_next_good := v_good + case when v_correct then 1 else 0 end;
    v_next_bad :=
      v_bad + case when v_outcome = 'wrong' then 1 else 0 end;
    v_next_skipped :=
      v_skipped
      + case when v_outcome in ('skipped', 'timed_out') then 1 else 0 end;
    v_next_index := v_question_index + 1;

    v_level_finished :=
      v_next_index >= 25
      or v_pool_deadline <= v_now;

    v_passed :=
      v_level_finished
      and v_next_good >= 23;

    v_next_state := v_session.state;

    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{question_index}',
      pg_catalog.to_jsonb(v_next_index), true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{current_question_id}', 'null'::jsonb, true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{question_deadline}', 'null'::jsonb, true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{answered_question_ids}', v_answered_ids, true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{good}', pg_catalog.to_jsonb(v_next_good), true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{bad}', pg_catalog.to_jsonb(v_next_bad), true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{skipped}', pg_catalog.to_jsonb(v_next_skipped), true
    );

    v_next_status := 'active';
    v_finish := false;

    if v_level_finished
       and v_session.state ->> 'phase' = 'level1' then

      if v_passed then
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{phase}', '"level2"'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{level}', '2'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{question_index}', '0'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{pool_deadline}', 'null'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{good}', '0'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{bad}', '0'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{skipped}', '0'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{party_id}', '"app"'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{level1_passed}', 'true'::jsonb, true
        );
      else
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{phase}', '"failed"'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{pool_deadline}', 'null'::jsonb, true
        );
        v_next_status := 'failed';
        v_finish := true;
      end if;

    elsif v_level_finished
          and v_session.state ->> 'phase' = 'level2' then

      if v_passed then
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{phase}', '"roulette"'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{level}', '3'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{pool_deadline}', 'null'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{level2_passed}', 'true'::jsonb, true
        );
      else
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{phase}', '"failed"'::jsonb, true
        );
        v_next_state := pg_catalog.jsonb_set(
          v_next_state, '{pool_deadline}', 'null'::jsonb, true
        );
        v_next_status := 'failed';
        v_finish := true;
      end if;
    end if;

    update public.reto_game_sessions s
    set state = v_next_state,
        state_version = s.state_version + 1,
        status = v_next_status,
        updated_at = v_now,
        finished_at = case
          when v_finish then v_now
          else s.finished_at
        end
    where s.id = p_session_id
      and s.participant_id = p_participant_id
      and s.group_code = pg_catalog.btrim(p_group_code)
      and s.game_code = 'principal'
      and s.game_mode = 'con_premio'
      and s.status = 'active'
      and s.state_version = p_expected_state_version;

    if not found then
      raise exception 'RETO_ANSWER_STATE_CONFLICT';
    end if;

  -- ----------------------------------------------------------
  -- CAMINO STATE TRANSITION
  -- ----------------------------------------------------------
  else
    if v_correct then
      v_next_position := pg_catalog.least(v_position + v_roll, 30);
    else
      v_next_position := pg_catalog.greatest(v_position - v_roll, 0);
    end if;

    v_next_turns := pg_catalog.greatest(0, v_turns_left - 1);
    v_won := v_next_position = 30;
    v_game_over := v_won or v_next_turns = 0;

    v_next_state := v_session.state;

    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{position}',
      pg_catalog.to_jsonb(v_next_position), true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{turns_left}',
      pg_catalog.to_jsonb(v_next_turns), true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{current_question_id}', 'null'::jsonb, true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{question_deadline}', 'null'::jsonb, true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{answered_question_ids}', v_answered_ids, true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{pending_roll}', 'null'::jsonb, true
    );
    v_next_state := pg_catalog.jsonb_set(
      v_next_state, '{won}', pg_catalog.to_jsonb(v_won), true
    );

    if v_won then
      -- Same PostgreSQL transaction: if qualifier finalization fails,
      -- the instance UPDATE above is rolled back too.
      select f.qualifier_id,
             f.already_qualified,
             f.award_year,
             f.award_quarter
      into v_qualifier_id,
           v_already_qualified,
           v_award_year,
           v_award_quarter
      from public.finalize_reto_camino_win_atomic(
        p_session_id,
        p_participant_id,
        pg_catalog.btrim(p_group_code),
        p_expected_state_version,
        v_next_state
      ) as f;

      if v_qualifier_id is null then
        raise exception 'RETO_ANSWER_CAMINO_FINALIZE_FAILED';
      end if;

      v_next_status := 'completed';
    else
      v_next_status := case
        when v_game_over then 'failed'
        else 'active'
      end;

      update public.reto_game_sessions s
      set state = v_next_state,
          state_version = s.state_version + 1,
          status = v_next_status,
          updated_at = v_now,
          finished_at = case
            when v_game_over then v_now
            else s.finished_at
          end
      where s.id = p_session_id
        and s.participant_id = p_participant_id
        and s.group_code = pg_catalog.btrim(p_group_code)
        and s.game_code = 'camino'
        and s.game_mode = 'con_premio'
        and s.status = 'active'
        and s.state_version = p_expected_state_version;

      if not found then
        raise exception 'RETO_ANSWER_STATE_CONFLICT';
      end if;
    end if;
  end if;

  -- ----------------------------------------------------------
  -- RESULT
  -- ----------------------------------------------------------

  return query
  select
    p_session_id,
    p_question_instance_id,
    p_expected_state_version + 1,
    v_next_status,
    v_outcome,
    v_correct,
    v_qualifier_id,
    v_already_qualified,
    v_award_year,
    v_award_quarter;
end
$function$;

alter function public.commit_reto_prize_answer_atomic(
  uuid, uuid, text, integer, uuid, boolean
) owner to postgres;

revoke all on function public.commit_reto_prize_answer_atomic(
  uuid, uuid, text, integer, uuid, boolean
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.commit_reto_prize_answer_atomic(
  uuid, uuid, text, integer, uuid, boolean
) to service_role;

-- ============================================================
-- POSTFLIGHT
-- ============================================================

do $postflight$
declare
  v_proc regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
begin
  v_proc := pg_catalog.to_regprocedure(
    'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)'
  );

  if v_proc is null then
    raise exception 'B2C_E5F3_POSTFLIGHT: RPC no creada';
  end if;

  select r.rolname, p.prosecdef, p.proconfig
  into v_owner, v_security_definer, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid = v_proc::oid;

  if not found
     or v_owner <> 'postgres'
     or v_security_definer is not true
     or v_config is null
     or not ('search_path=pg_catalog' = any(v_config)) then
    raise exception 'B2C_E5F3_POSTFLIGHT: propiedades RPC inesperadas';
  end if;

  if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege(
       'authenticated', v_proc, 'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role', v_proc, 'EXECUTE'
     ) then
    raise exception 'B2C_E5F3_POSTFLIGHT: ACL RPC inesperada';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_prize_question_instances',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_prize_question_instances',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_prize_question_instances',
       'DELETE'
     ) then
    raise exception 'B2C_E5F3_POSTFLIGHT: mutacion directa inesperada';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'B2C_E5F3_POSTFLIGHT: ACL finalizador Camino alterada';
  end if;
end
$postflight$;

commit;

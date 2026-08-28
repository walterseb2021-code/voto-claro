-- B2C-E5F7A
-- Cierre atomico del nivel Principal cuando vence el pool de tiempo.
-- No activa premios, no inserta preguntas y no modifica public.reto_questions.
-- PostgreSQL es la autoridad temporal y de concurrencia para esta transicion.

begin;

-- ============================================================
-- PREFLIGHT
-- ============================================================

do $preflight$
begin
  if pg_catalog.to_regclass('public.reto_game_sessions') is null
     or pg_catalog.to_regclass('public.reto_prize_question_instances') is null then
    raise exception 'B2C_E5F7A_ABORT: faltan dependencias';
  end if;

  if pg_catalog.to_regprocedure(
    'public.finalize_reto_principal_pool_timeout_atomic(uuid,uuid,text,integer)'
  ) is not null then
    raise exception 'B2C_E5F7A_ABORT: RPC ya existe';
  end if;

  if pg_catalog.to_regprocedure(
    'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)'
  ) is null then
    raise exception 'B2C_E5F7A_ABORT: falta RPC atomica de emision';
  end if;

  if pg_catalog.to_regprocedure(
    'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)'
  ) is null then
    raise exception 'B2C_E5F7A_ABORT: falta RPC atomica de respuesta';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)',
       'EXECUTE'
     ) then
    raise exception 'B2C_E5F7A_ABORT: ACL inesperada en RPC de emision';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)',
       'EXECUTE'
     ) then
    raise exception 'B2C_E5F7A_ABORT: ACL inesperada en RPC de respuesta';
  end if;
end
$preflight$;

-- ============================================================
-- CHANGE: CIERRE ATOMICO DEL POOL PRINCIPAL
-- ============================================================

create function public.finalize_reto_principal_pool_timeout_atomic(
  p_session_id uuid,
  p_participant_id uuid,
  p_group_code text,
  p_expected_state_version integer
)
returns table (
  session_id uuid,
  state_version integer,
  session_status text,
  level_finished boolean,
  passed boolean,
  session_state jsonb,
  finished_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_session public.reto_game_sessions%rowtype;
  v_now timestamptz;
  v_pool_deadline timestamptz;
  v_phase text;
  v_question_index integer;
  v_good integer;
  v_bad integer;
  v_skipped integer;
  v_passed boolean;
  v_next_status text := 'active';
  v_finish boolean := false;
  v_next_state jsonb;
  v_return_state jsonb;
  v_return_finished_at timestamptz;
begin
  if p_session_id is null
     or p_participant_id is null
     or p_group_code is null
     or pg_catalog.btrim(p_group_code) !~ '^GRUPO[A-Z]$'
     or p_expected_state_version is null
     or p_expected_state_version <= 0 then
    raise exception 'RETO_POOL_TIMEOUT_INVALID_INPUT';
  end if;

  select s.*
  into v_session
  from public.reto_game_sessions s
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = pg_catalog.btrim(p_group_code)
    and s.game_code = 'principal'
    and s.game_mode = 'con_premio'
    and s.status = 'active'
  for update;

  if not found then
    raise exception 'RETO_POOL_TIMEOUT_SESSION_NOT_ACTIVE';
  end if;

  if v_session.state_version <> p_expected_state_version then
    raise exception 'RETO_POOL_TIMEOUT_STATE_CONFLICT';
  end if;

  v_now := pg_catalog.clock_timestamp();

  if v_session.expires_at <= v_now then
    raise exception 'RETO_POOL_TIMEOUT_SESSION_EXPIRED';
  end if;

  if pg_catalog.jsonb_typeof(v_session.state) is distinct from 'object'
     or v_session.state ->> 'schema_version' is distinct from '1'
     or v_session.state ->> 'current_question_id' is not null
     or v_session.state ->> 'question_deadline' is not null then
    raise exception 'RETO_POOL_TIMEOUT_STATE_INVALID';
  end if;

  v_phase := v_session.state ->> 'phase';

  if v_phase is null or v_phase not in ('level1', 'level2') then
    raise exception 'RETO_POOL_TIMEOUT_STATE_INVALID';
  end if;

  if v_phase = 'level1' then
    if v_session.state ->> 'level' is distinct from '1'
       or v_session.state ->> 'party_id' is not null
       or v_session.state ->> 'level1_passed' is distinct from 'false'
       or v_session.state ->> 'level2_passed' is distinct from 'false' then
      raise exception 'RETO_POOL_TIMEOUT_STATE_INVALID';
    end if;
  else
    if v_session.state ->> 'level' is distinct from '2'
       or v_session.state ->> 'party_id' is distinct from 'app'
       or v_session.state ->> 'level1_passed' is distinct from 'true'
       or v_session.state ->> 'level2_passed' is distinct from 'false' then
      raise exception 'RETO_POOL_TIMEOUT_STATE_INVALID';
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
    raise exception 'RETO_POOL_TIMEOUT_STATE_INVALID';
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
    raise exception 'RETO_POOL_TIMEOUT_STATE_INVALID';
  end if;

  if v_session.state ->> 'pool_deadline' is null then
    raise exception 'RETO_POOL_TIMEOUT_STATE_INVALID';
  end if;

  begin
    v_pool_deadline :=
      (v_session.state ->> 'pool_deadline')::timestamptz;
  exception
    when others then
      raise exception 'RETO_POOL_TIMEOUT_STATE_INVALID';
  end;

  if v_pool_deadline is null
     or v_pool_deadline > v_session.expires_at then
    raise exception 'RETO_POOL_TIMEOUT_STATE_INVALID';
  end if;

  if v_pool_deadline > v_now then
    raise exception 'RETO_POOL_TIMEOUT_NOT_EXPIRED';
  end if;

  if exists (
    select 1
    from public.reto_prize_question_instances i
    where i.session_id = p_session_id
      and i.answered_at is null
  ) then
    raise exception 'RETO_POOL_TIMEOUT_OPEN_QUESTION';
  end if;

  v_passed := v_good >= 23;
  v_next_state := v_session.state;

  v_next_state := pg_catalog.jsonb_set(
    v_next_state, '{current_question_id}', 'null'::jsonb, true
  );
  v_next_state := pg_catalog.jsonb_set(
    v_next_state, '{question_deadline}', 'null'::jsonb, true
  );
  v_next_state := pg_catalog.jsonb_set(
    v_next_state, '{pool_deadline}', 'null'::jsonb, true
  );

  if v_phase = 'level1' then
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
      v_next_status := 'failed';
      v_finish := true;
    end if;
  else
    if v_passed then
      v_next_state := pg_catalog.jsonb_set(
        v_next_state, '{phase}', '"roulette"'::jsonb, true
      );
      v_next_state := pg_catalog.jsonb_set(
        v_next_state, '{level}', '3'::jsonb, true
      );
      v_next_state := pg_catalog.jsonb_set(
        v_next_state, '{level2_passed}', 'true'::jsonb, true
      );
    else
      v_next_state := pg_catalog.jsonb_set(
        v_next_state, '{phase}', '"failed"'::jsonb, true
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
    raise exception 'RETO_POOL_TIMEOUT_STATE_CONFLICT';
  end if;

  select s.state,
         s.finished_at
  into v_return_state,
       v_return_finished_at
  from public.reto_game_sessions s
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = pg_catalog.btrim(p_group_code)
    and s.game_code = 'principal'
    and s.game_mode = 'con_premio'
    and s.state_version = p_expected_state_version + 1
    and s.status = v_next_status;

  if not found or v_return_state is null then
    raise exception 'RETO_POOL_TIMEOUT_RESULT_STATE_INVALID';
  end if;

  return query
  select
    p_session_id,
    p_expected_state_version + 1,
    v_next_status,
    true,
    v_passed,
    v_return_state,
    v_return_finished_at;
end
$function$;

alter function public.finalize_reto_principal_pool_timeout_atomic(
  uuid, uuid, text, integer
) owner to postgres;

revoke all on function public.finalize_reto_principal_pool_timeout_atomic(
  uuid, uuid, text, integer
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.finalize_reto_principal_pool_timeout_atomic(
  uuid, uuid, text, integer
) to service_role;

-- ============================================================
-- POSTFLIGHT
-- ============================================================

do $postflight$
declare
  v_proc regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_search_path text;
  v_result text;
begin
  v_proc :=
    pg_catalog.to_regprocedure(
      'public.finalize_reto_principal_pool_timeout_atomic(uuid,uuid,text,integer)'
    );

  if v_proc is null then
    raise exception 'B2C_E5F7A_POSTFLIGHT: RPC no existe';
  end if;

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    pg_catalog.array_to_string(p.proconfig, ','),
    pg_catalog.pg_get_function_result(p.oid)
  into
    v_owner,
    v_security_definer,
    v_search_path,
    v_result
  from pg_catalog.pg_proc p
  where p.oid = v_proc;

  if v_owner <> 'postgres' then
    raise exception 'B2C_E5F7A_POSTFLIGHT: owner inesperado %', v_owner;
  end if;

  if not v_security_definer then
    raise exception 'B2C_E5F7A_POSTFLIGHT: SECURITY DEFINER ausente';
  end if;

  if coalesce(v_search_path, '') <> 'search_path=pg_catalog' then
    raise exception 'B2C_E5F7A_POSTFLIGHT: search_path inesperado %', v_search_path;
  end if;

  if v_result not ilike '%session_state jsonb%'
     or v_result not ilike '%finished_at timestamp with time zone%'
     or v_result not ilike '%passed boolean%' then
    raise exception 'B2C_E5F7A_POSTFLIGHT: retorno autoritativo ausente %', v_result;
  end if;

  if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F7A_POSTFLIGHT: ACL de ejecucion inesperada';
  end if;
end
$postflight$;

commit;

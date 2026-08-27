-- B2C-E5F2
-- Emision atomica de preguntas privadas del Reto con premio.
-- No activa premios, no inserta datos y no modifica public.reto_questions.
-- La generacion logica permanece en TypeScript; PostgreSQL impone atomicidad e invariantes.

begin;

-- ============================================================
-- PREFLIGHT
-- ============================================================

do $preflight$
declare
  v_instance_policy_count integer;
begin
  if pg_catalog.to_regclass('public.reto_game_sessions') is null
     or pg_catalog.to_regclass('public.reto_knowledge_facts') is null
     or pg_catalog.to_regclass('public.reto_question_templates') is null
     or pg_catalog.to_regclass('public.reto_prize_question_instances') is null then
    raise exception 'B2C_E5F2_ABORT: faltan dependencias';
  end if;

  if pg_catalog.to_regprocedure(
    'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)'
  ) is not null then
    raise exception 'B2C_E5F2_ABORT: issue_reto_prize_question_atomic ya existe';
  end if;

  if pg_catalog.to_regclass(
    'public.reto_prize_question_instances_open_session_uniq'
  ) is null
     or pg_catalog.to_regclass(
       'public.reto_prize_question_instances_session_fact_uniq'
     ) is null then
    raise exception 'B2C_E5F2_ABORT: faltan indices unicos de instancias';
  end if;

  select pg_catalog.count(*)
  into v_instance_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename = 'reto_prize_question_instances';

  if v_instance_policy_count <> 0 then
    raise exception 'B2C_E5F2_ABORT: policies inesperadas en instancias';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_knowledge_facts',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_question_templates',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_prize_question_instances',
       'SELECT'
     ) then
    raise exception 'B2C_E5F2_ABORT: falta SELECT de service_role';
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
    raise exception 'B2C_E5F2_ABORT: mutacion directa inesperada en instancias';
  end if;
end
$preflight$;

-- ============================================================
-- CHANGE: RPC ATOMICA DE EMISION
-- ============================================================

create function public.issue_reto_prize_question_atomic(
  p_session_id uuid,
  p_participant_id uuid,
  p_group_code text,
  p_expected_state_version integer,
  p_source text,
  p_fact_id uuid,
  p_template_id uuid,
  p_parameters jsonb,
  p_question_text text,
  p_correct_answer boolean,
  p_question_deadline timestamptz,
  p_pool_deadline timestamptz,
  p_pending_roll smallint
)
returns table (
  instance_id uuid,
  state_version integer,
  question_deadline timestamptz,
  pool_deadline timestamptz,
  pending_roll smallint
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_session public.reto_game_sessions%rowtype;
  v_fact public.reto_knowledge_facts%rowtype;
  v_template public.reto_question_templates%rowtype;
  v_now timestamptz;
  v_instance_id uuid;
  v_next_state jsonb;
  v_effective_pool_deadline timestamptz;
  v_state_pool_text text;
  v_fact_snapshot jsonb;
  v_question_index integer;
  v_turns_left integer;
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
     or p_source is null
     or p_source not in (
       'principal_level1',
       'principal_level2',
       'camino'
     )
     or p_fact_id is null
     or p_template_id is null
     or p_parameters is null
     or pg_catalog.jsonb_typeof(p_parameters) <> 'object'
     or pg_catalog.octet_length(p_parameters::text) > 8192
     or p_question_text is null
     or pg_catalog.btrim(p_question_text) = ''
     or pg_catalog.length(p_question_text) > 5000
     or p_correct_answer is null
     or p_question_deadline is null then
    raise exception 'RETO_ISSUE_INVALID_INPUT';
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
    raise exception 'RETO_ISSUE_SESSION_NOT_ACTIVE';
  end if;

  if v_session.state_version <> p_expected_state_version then
    raise exception 'RETO_ISSUE_STATE_CONFLICT';
  end if;

  -- Refresh clock after acquiring the session lock.
  v_now := pg_catalog.clock_timestamp();

  if v_session.expires_at <= v_now then
    raise exception 'RETO_ISSUE_SESSION_EXPIRED';
  end if;

  if v_session.state ->> 'schema_version' <> '1'
     or v_session.state ->> 'current_question_id' is not null
     or v_session.state ->> 'question_deadline' is not null then
    raise exception 'RETO_ISSUE_STATE_INVALID';
  end if;

  -- The per-question rule is currently 10 seconds.
  -- The caller may provide a shorter deadline (e.g. pool nearly exhausted),
  -- but never a longer one.
  if p_question_deadline <= v_now
     or p_question_deadline > v_now + interval '10 seconds'
     or p_question_deadline > v_session.expires_at then
    raise exception 'RETO_ISSUE_DEADLINE_INVALID';
  end if;

  -- ----------------------------------------------------------
  -- GAME/SOURCE INVARIANTS
  -- ----------------------------------------------------------

  if v_session.game_code = 'principal' then
    if p_pending_roll is not null then
      raise exception 'RETO_ISSUE_ROLL_INVALID';
    end if;

    if p_source = 'principal_level1' then
      if v_session.state ->> 'phase' <> 'level1'
         or v_session.state ->> 'level' <> '1'
         or v_session.state ->> 'party_id' is not null then
        raise exception 'RETO_ISSUE_STATE_INVALID';
      end if;
    elsif p_source = 'principal_level2' then
      if v_session.state ->> 'phase' <> 'level2'
         or v_session.state ->> 'level' <> '2'
         or v_session.state ->> 'party_id' <> 'app'
         or v_session.state ->> 'level1_passed' <> 'true' then
        raise exception 'RETO_ISSUE_STATE_INVALID';
      end if;
    else
      raise exception 'RETO_ISSUE_SOURCE_MISMATCH';
    end if;

    if v_session.state ->> 'question_index' is null
       or v_session.state ->> 'question_index' !~ '^[0-9]+$' then
      raise exception 'RETO_ISSUE_STATE_INVALID';
    end if;

    v_question_index := (v_session.state ->> 'question_index')::integer;

    if v_question_index < 0 or v_question_index >= 25 then
      raise exception 'RETO_ISSUE_STATE_INVALID';
    end if;

    v_state_pool_text := v_session.state ->> 'pool_deadline';

    if v_state_pool_text is null then
      if p_pool_deadline is null
         or p_pool_deadline <= v_now
         or p_pool_deadline > v_session.expires_at
         or p_pool_deadline > v_now + interval '10 minutes' then
        raise exception 'RETO_ISSUE_POOL_DEADLINE_INVALID';
      end if;

      v_effective_pool_deadline := p_pool_deadline;
    else
      if p_pool_deadline is not null then
        raise exception 'RETO_ISSUE_POOL_DEADLINE_INVALID';
      end if;

      begin
        v_effective_pool_deadline := v_state_pool_text::timestamptz;
      exception
        when others then
          raise exception 'RETO_ISSUE_STATE_INVALID';
      end;

      if v_effective_pool_deadline <= v_now
         or v_effective_pool_deadline > v_session.expires_at then
        raise exception 'RETO_ISSUE_POOL_DEADLINE_INVALID';
      end if;
    end if;

    if p_question_deadline > v_effective_pool_deadline then
      raise exception 'RETO_ISSUE_DEADLINE_INVALID';
    end if;

  elsif v_session.game_code = 'camino' then
    if v_session.state ->> 'turns_left' is null
       or v_session.state ->> 'turns_left' !~ '^[0-9]+$' then
      raise exception 'RETO_ISSUE_STATE_INVALID';
    end if;

    v_turns_left := (v_session.state ->> 'turns_left')::integer;

    if p_source <> 'camino'
       or p_pool_deadline is not null
       or p_pending_roll is null
       or p_pending_roll < 1
       or p_pending_roll > 6
       or v_session.state ->> 'won' <> 'false'
       or v_turns_left <= 0
       or v_session.state ->> 'pending_roll' is not null then
      raise exception 'RETO_ISSUE_STATE_INVALID';
    end if;

    v_effective_pool_deadline := null;
  else
    raise exception 'RETO_ISSUE_GAME_INVALID';
  end if;

  -- ----------------------------------------------------------
  -- PRIVATE FACT + TEMPLATE ELIGIBILITY
  -- ----------------------------------------------------------

  select f.*
  into v_fact
  from public.reto_knowledge_facts f
  where f.id = p_fact_id
  for share;

  if not found then
    raise exception 'RETO_ISSUE_FACT_NOT_FOUND';
  end if;

  if v_fact.is_active is not true
     or v_fact.review_status <> 'approved'
     or v_fact.lang <> 'es'
     or v_fact.version <= 0
     or not (p_source = any(v_fact.eligible_sources))
     or (v_fact.valid_from is not null and v_fact.valid_from > v_now)
     or (v_fact.valid_until is not null and v_fact.valid_until <= v_now) then
    raise exception 'RETO_ISSUE_FACT_NOT_ELIGIBLE';
  end if;

  select t.*
  into v_template
  from public.reto_question_templates t
  where t.id = p_template_id
  for share;

  if not found then
    raise exception 'RETO_ISSUE_TEMPLATE_NOT_FOUND';
  end if;

  if v_template.is_active is not true
     or v_template.review_status <> 'approved'
     or v_template.fact_type <> v_fact.fact_type
     or not (p_source = any(v_template.allowed_sources))
     or pg_catalog.btrim(v_template.operator_code) = ''
     or v_template.renderer_version <= 0 then
    raise exception 'RETO_ISSUE_TEMPLATE_NOT_ELIGIBLE';
  end if;

  if exists (
    select 1
    from public.reto_prize_question_instances qi
    where qi.session_id = p_session_id
      and qi.answered_at is null
  ) then
    raise exception 'RETO_ISSUE_OPEN_INSTANCE_CONFLICT';
  end if;

  if exists (
    select 1
    from public.reto_prize_question_instances qi
    where qi.session_id = p_session_id
      and qi.fact_id = p_fact_id
  ) then
    raise exception 'RETO_ISSUE_FACT_ALREADY_USED';
  end if;

  -- Freeze the authoritative fact data used to render this instance.
  v_fact_snapshot := pg_catalog.jsonb_build_object(
    'fact_key', v_fact.fact_key,
    'fact_type', v_fact.fact_type,
    'lang', v_fact.lang,
    'topic', v_fact.topic,
    'fact_data', v_fact.fact_data,
    'source_reference', v_fact.source_reference,
    'valid_from', v_fact.valid_from,
    'valid_until', v_fact.valid_until,
    'version', v_fact.version
  );

  v_instance_id := pg_catalog.gen_random_uuid();

  insert into public.reto_prize_question_instances (
    id,
    session_id,
    fact_id,
    template_id,
    source,
    fact_version,
    operator_code,
    parameters,
    fact_snapshot,
    question_text,
    correct_answer,
    issued_state_version,
    issued_at,
    expires_at
  )
  values (
    v_instance_id,
    p_session_id,
    p_fact_id,
    p_template_id,
    p_source,
    v_fact.version,
    v_template.operator_code,
    p_parameters,
    v_fact_snapshot,
    pg_catalog.btrim(p_question_text),
    p_correct_answer,
    p_expected_state_version + 1,
    v_now,
    p_question_deadline
  );

  -- ----------------------------------------------------------
  -- STATE UPDATE IN THE SAME TRANSACTION
  -- ----------------------------------------------------------

  v_next_state := v_session.state;

  v_next_state := pg_catalog.jsonb_set(
    v_next_state,
    '{current_question_id}',
    pg_catalog.to_jsonb(v_instance_id::text),
    true
  );

  v_next_state := pg_catalog.jsonb_set(
    v_next_state,
    '{question_deadline}',
    pg_catalog.to_jsonb(p_question_deadline),
    true
  );

  if v_session.game_code = 'principal' then
    if v_state_pool_text is null then
      v_next_state := pg_catalog.jsonb_set(
        v_next_state,
        '{pool_deadline}',
        pg_catalog.to_jsonb(v_effective_pool_deadline),
        true
      );
    end if;
  else
    v_next_state := pg_catalog.jsonb_set(
      v_next_state,
      '{pending_roll}',
      pg_catalog.to_jsonb(p_pending_roll),
      true
    );
  end if;

  update public.reto_game_sessions s
  set state = v_next_state,
      state_version = s.state_version + 1,
      updated_at = v_now
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = pg_catalog.btrim(p_group_code)
    and s.game_mode = 'con_premio'
    and s.status = 'active'
    and s.state_version = p_expected_state_version;

  if not found then
    raise exception 'RETO_ISSUE_STATE_CONFLICT';
  end if;

  return query
  select
    v_instance_id,
    p_expected_state_version + 1,
    p_question_deadline,
    v_effective_pool_deadline,
    p_pending_roll;
end
$function$;

alter function public.issue_reto_prize_question_atomic(
  uuid, uuid, text, integer, text, uuid, uuid, jsonb, text, boolean,
  timestamptz, timestamptz, smallint
) owner to postgres;

revoke all on function public.issue_reto_prize_question_atomic(
  uuid, uuid, text, integer, text, uuid, uuid, jsonb, text, boolean,
  timestamptz, timestamptz, smallint
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.issue_reto_prize_question_atomic(
  uuid, uuid, text, integer, text, uuid, uuid, jsonb, text, boolean,
  timestamptz, timestamptz, smallint
) to service_role;

-- ============================================================
-- POSTFLIGHT
-- ============================================================

do $postflight$
declare
  v_owner text;
  v_security_definer boolean;
  v_config text[];
  v_proc regprocedure;
begin
  v_proc := pg_catalog.to_regprocedure(
    'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)'
  );

  if v_proc is null then
    raise exception 'B2C_E5F2_POSTFLIGHT: RPC no creada';
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
    raise exception 'B2C_E5F2_POSTFLIGHT: propiedades RPC inesperadas';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       v_proc,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       v_proc,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       v_proc,
       'EXECUTE'
     ) then
    raise exception 'B2C_E5F2_POSTFLIGHT: privilegios RPC inesperados';
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
    raise exception 'B2C_E5F2_POSTFLIGHT: mutacion directa inesperada en instancias';
  end if;
end
$postflight$;

commit;

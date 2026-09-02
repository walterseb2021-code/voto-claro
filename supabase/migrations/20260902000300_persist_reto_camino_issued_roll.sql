-- ============================================================================
-- B2C-E5F10B4A
-- REAL MIGRATION: persist authoritative Camino issued_roll for exact replay
-- ============================================================================
-- Purpose:
-- 1) Add issued_roll to private prize-question instances.
-- 2) Make issued_roll authoritative and immutable:
--      camino -> 1..6
--      principal_level1/principal_level2 -> NULL
-- 3) Patch issue_reto_prize_question_atomic to freeze p_pending_roll.
-- 4) Patch the existing instance-integrity trigger to protect issued_roll.
-- 5) Create recover_reto_prize_answer_replay_v2 with the same replay evidence
--    plus authoritative question source, issued_roll and session timestamps.
-- 6) Verify security/contracts, then COMMIT atomically.
--
-- This migration does NOT activate prizes.
-- RETO_PRIZES_ENABLED must remain false.
-- ============================================================================

begin;

-- ============================================================================
-- PREFLIGHT
-- ============================================================================
do $preflight$
declare
  v_issue regprocedure;
  v_integrity regprocedure;
  v_recovery regprocedure;
  v_commit regprocedure;
  v_finalizer regprocedure;
  v_issue_def text;
  v_integrity_def text;
  v_recovery_def text;
  v_commit_def text;
  v_finalizer_def text;
begin
  if pg_catalog.to_regclass('public.reto_prize_question_instances') is null
     or pg_catalog.to_regclass('public.reto_game_sessions') is null
     or pg_catalog.to_regclass('public.reto_camino_qualifiers') is null then
    raise exception 'B2C_E5F10B4A_ABORT: required tables missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.reto_prize_question_instances'::pg_catalog.regclass
      and a.attname = 'issued_roll'
      and not a.attisdropped
  ) then
    raise exception 'B2C_E5F10B4A_ABORT: issued_roll already exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.reto_prize_question_instances'::pg_catalog.regclass
      and c.conname = 'reto_prize_question_instances_issued_roll_check'
  ) then
    raise exception 'B2C_E5F10B4A_ABORT: issued_roll constraint already exists';
  end if;

  if exists (select 1 from public.reto_prize_question_instances) then
    raise exception 'B2C_E5F10B4A_ABORT: private instances are not empty';
  end if;

  if pg_catalog.to_regprocedure(
       'public.recover_reto_prize_answer_replay_v2(uuid,uuid,text,text,integer,uuid,boolean)'
     ) is not null then
    raise exception 'B2C_E5F10B4A_ABORT: recovery v2 already exists';
  end if;

  v_issue := pg_catalog.to_regprocedure(
    'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)'
  );
  v_integrity := pg_catalog.to_regprocedure(
    'public.enforce_reto_prize_question_instance_integrity()'
  );
  v_recovery := pg_catalog.to_regprocedure(
    'public.recover_reto_prize_answer_replay(uuid,uuid,text,text,integer,uuid,boolean)'
  );
  v_commit := pg_catalog.to_regprocedure(
    'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)'
  );
  v_finalizer := pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  );

  if v_issue is null
     or v_integrity is null
     or v_recovery is null
     or v_commit is null
     or v_finalizer is null then
    raise exception 'B2C_E5F10B4A_ABORT: required RPC/function missing';
  end if;

  select pg_catalog.pg_get_functiondef(v_issue::oid) into v_issue_def;
  select pg_catalog.pg_get_functiondef(v_integrity::oid) into v_integrity_def;
  select pg_catalog.pg_get_functiondef(v_recovery::oid) into v_recovery_def;
  select pg_catalog.pg_get_functiondef(v_commit::oid) into v_commit_def;
  select pg_catalog.pg_get_functiondef(v_finalizer::oid) into v_finalizer_def;

  if pg_catalog.strpos(v_issue_def, 'insert into public.reto_prize_question_instances') = 0
     or pg_catalog.strpos(v_issue_def, 'p_pending_roll') = 0
     or pg_catalog.strpos(v_issue_def, 'issued_roll') <> 0 then
    raise exception 'B2C_E5F10B4A_ABORT: issue RPC baseline changed';
  end if;

  if pg_catalog.strpos(v_integrity_def, 'RETO_INSTANCE_INTEGRITY_IMMUTABLE') = 0
     or pg_catalog.strpos(v_integrity_def, 'issued_roll') <> 0 then
    raise exception 'B2C_E5F10B4A_ABORT: integrity baseline changed';
  end if;

  if pg_catalog.strpos(v_recovery_def, 'RETO_ANSWER_REPLAY_NOT_REPLAYABLE') = 0
     or pg_catalog.strpos(v_recovery_def, 'finalize_reto_') <> 0
     or pg_catalog.strpos(v_recovery_def, 'insert into ') <> 0
     or pg_catalog.strpos(v_recovery_def, 'update public.') <> 0
     or pg_catalog.strpos(v_recovery_def, 'delete from ') <> 0 then
    raise exception 'B2C_E5F10B4A_ABORT: recovery baseline changed';
  end if;

  -- Preserve the permanent Camino repairs from B2C-E5F10B2.
  if pg_catalog.strpos(v_commit_def, 'pg_catalog.least(') <> 0
     or pg_catalog.strpos(v_commit_def, 'pg_catalog.greatest(') <> 0
     or pg_catalog.strpos(v_commit_def, 'least(v_position + v_roll, 30)') = 0
     or pg_catalog.strpos(v_commit_def, 'greatest(v_position - v_roll, 0)') = 0
     or pg_catalog.strpos(v_commit_def, 'greatest(0, v_turns_left - 1)') = 0 then
    raise exception 'B2C_E5F10B4A_ABORT: Camino answer repair missing';
  end if;

  if pg_catalog.strpos(
       pg_catalog.lower(v_finalizer_def),
       'on conflict (participant_id, award_year, award_quarter)'
     ) <> 0
     or pg_catalog.strpos(
       pg_catalog.lower(v_finalizer_def),
       'on conflict on constraint reto_camino_qualifiers_participant_period_uniq'
     ) = 0 then
    raise exception 'B2C_E5F10B4A_ABORT: Camino finalizer repair missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_prize_question_instances'
      and c.relrowsecurity
  ) then
    raise exception 'B2C_E5F10B4A_ABORT: instance RLS missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.reto_prize_question_instances'::pg_catalog.regclass
      and t.tgname = 'trg_reto_prize_question_instance_integrity'
      and not t.tgisinternal
      and t.tgenabled = 'O'
      and t.tgfoid = v_integrity::oid
  ) then
    raise exception 'B2C_E5F10B4A_ABORT: integrity trigger missing/changed';
  end if;

  if pg_catalog.has_function_privilege('anon', v_issue, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_issue, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_issue, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_recovery, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_recovery, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_recovery, 'EXECUTE') then
    raise exception 'B2C_E5F10B4A_ABORT: baseline ACL changed';
  end if;
end
$preflight$;

-- ============================================================================
-- CHANGE 1: authoritative issued_roll column + source contract
-- ============================================================================
alter table public.reto_prize_question_instances
  add column issued_roll smallint;

alter table public.reto_prize_question_instances
  add constraint reto_prize_question_instances_issued_roll_check
  check (
    (
      source = 'camino'
      and issued_roll is not null
      and issued_roll between 1 and 6
    )
    or (
      source in ('principal_level1', 'principal_level2')
      and issued_roll is null
    )
  );

-- ============================================================================
-- CHANGE 2: replace existing integrity function
-- ============================================================================
create or replace function public.enforce_reto_prize_question_instance_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_fact public.reto_knowledge_facts%rowtype;
  v_template public.reto_question_templates%rowtype;
  v_expected_snapshot jsonb;
  v_expected_question text;

  v_truth boolean;
  v_subject text;
  v_unit text;

  v_actual_bigint bigint;
  v_candidate_bigint bigint;
  v_delta_bigint bigint;
  v_min_delta bigint;
  v_max_delta bigint;

  v_actual_decimal numeric;
  v_candidate_decimal numeric;
  v_step numeric;
  v_diff numeric;
  v_steps numeric;

  v_actual_text text;
  v_actual_key text;
  v_candidate_text text;
  v_candidate_key text;
  v_alt_raw text;
  v_alt_text text;
  v_alt_key text;
  v_alt_match boolean;

  v_actual_date date;
  v_candidate_date date;
  v_day_diff integer;

  v_member text;
  v_collection text;
  v_is_member boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'RETO_INSTANCE_INTEGRITY_DELETE_FORBIDDEN';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.session_id is distinct from old.session_id
       or new.fact_id is distinct from old.fact_id
       or new.template_id is distinct from old.template_id
       or new.source is distinct from old.source
       or new.fact_version is distinct from old.fact_version
       or new.operator_code is distinct from old.operator_code
       or new.parameters is distinct from old.parameters
       or new.fact_snapshot is distinct from old.fact_snapshot
       or new.question_text is distinct from old.question_text
       or new.correct_answer is distinct from old.correct_answer
       or new.issued_state_version is distinct from old.issued_state_version
       or new.issued_at is distinct from old.issued_at
       or new.expires_at is distinct from old.expires_at
       or new.issued_roll is distinct from old.issued_roll then
      raise exception 'RETO_INSTANCE_INTEGRITY_IMMUTABLE';
    end if;

    if old.answered_at is not null then
      if new.answered_state_version is distinct from old.answered_state_version
         or new.answered_at is distinct from old.answered_at
         or new.submitted_answer is distinct from old.submitted_answer
         or new.was_correct is distinct from old.was_correct
         or new.answer_outcome is distinct from old.answer_outcome then
        raise exception 'RETO_INSTANCE_INTEGRITY_ANSWER_LOCKED';
      end if;
      return new;
    end if;

    if new.answered_state_version is not distinct from old.answered_state_version
       and new.answered_at is not distinct from old.answered_at
       and new.submitted_answer is not distinct from old.submitted_answer
       and new.was_correct is not distinct from old.was_correct
       and new.answer_outcome is not distinct from old.answer_outcome then
      return new;
    end if;

    if new.answered_state_version is distinct from (old.issued_state_version + 1)
       or new.answered_at is null
       or new.was_correct is null
       or new.answer_outcome is null then
      raise exception 'RETO_INSTANCE_INTEGRITY_ANSWER_TRANSITION';
    end if;

    if new.answer_outcome = 'correct' then
      if new.was_correct is not true
         or new.submitted_answer is null
         or new.submitted_answer is distinct from old.correct_answer then
        raise exception 'RETO_INSTANCE_INTEGRITY_ANSWER_CORRECTNESS';
      end if;
    elsif new.answer_outcome = 'wrong' then
      if new.was_correct is not false
         or new.submitted_answer is null
         or new.submitted_answer is not distinct from old.correct_answer then
        raise exception 'RETO_INSTANCE_INTEGRITY_ANSWER_CORRECTNESS';
      end if;
    elsif new.answer_outcome in ('skipped','timed_out') then
      if new.was_correct is not false then
        raise exception 'RETO_INSTANCE_INTEGRITY_ANSWER_CORRECTNESS';
      end if;
    else
      raise exception 'RETO_INSTANCE_INTEGRITY_ANSWER_OUTCOME';
    end if;

    return new;
  end if;

  if tg_op <> 'INSERT' then
    raise exception 'RETO_INSTANCE_INTEGRITY_OPERATION_INVALID';
  end if;

  if new.answered_state_version is not null
     or new.answered_at is not null
     or new.submitted_answer is not null
     or new.was_correct is not null
     or new.answer_outcome is not null then
    raise exception 'RETO_INSTANCE_INTEGRITY_INSERT_ANSWER_STATE';
  end if;

  if (
       new.source = 'camino'
       and (
         new.issued_roll is null
         or new.issued_roll < 1
         or new.issued_roll > 6
       )
     )
     or (
       new.source in ('principal_level1', 'principal_level2')
       and new.issued_roll is not null
     ) then
    raise exception 'RETO_INSTANCE_INTEGRITY_ISSUED_ROLL';
  end if;

  select f.*
    into v_fact
  from public.reto_knowledge_facts f
  where f.id = new.fact_id
  for share;

  if not found then
    raise exception 'RETO_INSTANCE_INTEGRITY_FACT_NOT_FOUND';
  end if;

  if v_fact.is_active is not true
     or v_fact.review_status <> 'approved'
     or v_fact.lang <> 'es'
     or v_fact.version <= 0
     or new.fact_version <> v_fact.version
     or not (new.source = any(v_fact.eligible_sources))
     or (v_fact.valid_from is not null and v_fact.valid_from > new.issued_at)
     or (v_fact.valid_until is not null and v_fact.valid_until <= new.issued_at) then
    raise exception 'RETO_INSTANCE_INTEGRITY_FACT_INVALID';
  end if;

  select t.*
    into v_template
  from public.reto_question_templates t
  where t.id = new.template_id
  for share;

  if not found then
    raise exception 'RETO_INSTANCE_INTEGRITY_TEMPLATE_NOT_FOUND';
  end if;

  if v_template.is_active is not true
     or v_template.review_status <> 'approved'
     or v_template.fact_type <> v_fact.fact_type
     or v_template.renderer_version <> 1
     or not (new.source = any(v_template.allowed_sources)) then
    raise exception 'RETO_INSTANCE_INTEGRITY_TEMPLATE_INVALID';
  end if;

  if new.operator_code <> v_template.operator_code
     or not (v_template.operator_code = any(v_fact.allowed_operators)) then
    raise exception 'RETO_INSTANCE_INTEGRITY_OPERATOR';
  end if;

  v_expected_snapshot := pg_catalog.jsonb_build_object(
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

  if new.fact_snapshot is distinct from v_expected_snapshot then
    raise exception 'RETO_INSTANCE_INTEGRITY_SNAPSHOT';
  end if;

  if v_template.operator_code = 'BOOL_EXPLICIT_VARIANT' then
    if pg_catalog.jsonb_typeof(new.parameters -> 'renderer_version') is distinct from 'number'
       or (new.parameters ->> 'renderer_version') <> '1'
       or pg_catalog.jsonb_typeof(new.parameters -> 'truth_target') is distinct from 'boolean' then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    v_truth := (new.parameters ->> 'truth_target')::boolean;

    if new.parameters is distinct from pg_catalog.jsonb_build_object(
      'renderer_version', 1, 'truth_target', v_truth
    ) then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    if v_truth then
      v_expected_question := pg_catalog.regexp_replace(
        v_fact.fact_data ->> 'statement_true',
        '^[[:space:]]+|[[:space:]]+$', '', 'g'
      );
    else
      v_expected_question := pg_catalog.regexp_replace(
        v_fact.fact_data ->> 'statement_false',
        '^[[:space:]]+|[[:space:]]+$', '', 'g'
      );
    end if;

    v_actual_key := pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.normalize(
            pg_catalog.regexp_replace(
              v_fact.fact_data ->> 'statement_true',
              '^[[:space:]]+|[[:space:]]+$', '', 'g'
            ),
            'NFKC'
          ),
          '^[[:space:]]+|[[:space:]]+$', '', 'g'
        ),
        '[[:space:]]+', ' ', 'g'
      )
    );

    v_candidate_key := pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.normalize(
            pg_catalog.regexp_replace(
              v_fact.fact_data ->> 'statement_false',
              '^[[:space:]]+|[[:space:]]+$', '', 'g'
            ),
            'NFKC'
          ),
          '^[[:space:]]+|[[:space:]]+$', '', 'g'
        ),
        '[[:space:]]+', ' ', 'g'
      )
    );

    if v_actual_key = v_candidate_key then
      raise exception 'RETO_INSTANCE_INTEGRITY_BOOLEAN_AMBIGUOUS';
    end if;

    if new.question_text is distinct from v_expected_question then
      raise exception 'RETO_INSTANCE_INTEGRITY_QUESTION_TEXT';
    end if;

    if new.correct_answer is distinct from v_truth then
      raise exception 'RETO_INSTANCE_INTEGRITY_CORRECT_ANSWER';
    end if;

  elsif v_template.operator_code = 'INT_EQUALS_VARIANT' then
    if pg_catalog.jsonb_typeof(new.parameters -> 'renderer_version') is distinct from 'number'
       or (new.parameters ->> 'renderer_version') <> '1'
       or pg_catalog.jsonb_typeof(new.parameters -> 'truth_target') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(new.parameters -> 'candidate') is distinct from 'number'
       or (new.parameters ->> 'candidate') !~ '^-?(0|[1-9][0-9]*)$' then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    v_truth := (new.parameters ->> 'truth_target')::boolean;
    v_actual_bigint := (v_fact.fact_data ->> 'value')::numeric::bigint;
    v_candidate_bigint := (new.parameters ->> 'candidate')::numeric::bigint;

    if pg_catalog.abs(v_candidate_bigint::numeric) > 9007199254740991::numeric then
      raise exception 'RETO_INSTANCE_INTEGRITY_INTEGER_DOMAIN';
    end if;

    if new.parameters is distinct from pg_catalog.jsonb_build_object(
      'renderer_version', 1,
      'truth_target', v_truth,
      'candidate', v_candidate_bigint
    ) then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    if v_truth then
      if v_candidate_bigint <> v_actual_bigint then
        raise exception 'RETO_INSTANCE_INTEGRITY_INTEGER_CANDIDATE';
      end if;
    else
      if v_candidate_bigint = v_actual_bigint then
        raise exception 'RETO_INSTANCE_INTEGRITY_INTEGER_CANDIDATE';
      end if;

      v_min_delta := (v_template.config ->> 'false_delta_min')::bigint;
      v_max_delta := (v_template.config ->> 'false_delta_max')::bigint;
      v_delta_bigint := pg_catalog.abs(v_candidate_bigint - v_actual_bigint);

      if v_delta_bigint < v_min_delta or v_delta_bigint > v_max_delta then
        raise exception 'RETO_INSTANCE_INTEGRITY_INTEGER_CANDIDATE';
      end if;
    end if;

    v_subject := pg_catalog.regexp_replace(
      v_fact.fact_data ->> 'subject',
      '^[[:space:]]+|[[:space:]]+$', '', 'g'
    );

    if v_fact.fact_data ? 'unit' then
      v_unit := pg_catalog.regexp_replace(
        v_fact.fact_data ->> 'unit',
        '^[[:space:]]+|[[:space:]]+$', '', 'g'
      );
    else
      v_unit := null;
    end if;

    v_expected_question :=
      pg_catalog.chr(191) || 'Es correcto que ' || v_subject || ' es ' ||
      v_candidate_bigint::text ||
      case when v_unit is null then '' else ' ' || v_unit end || '?';

    if new.question_text is distinct from v_expected_question then
      raise exception 'RETO_INSTANCE_INTEGRITY_QUESTION_TEXT';
    end if;

    if new.correct_answer is distinct from v_truth then
      raise exception 'RETO_INSTANCE_INTEGRITY_CORRECT_ANSWER';
    end if;

  elsif v_template.operator_code = 'DECIMAL_EQUALS_VARIANT' then
    if pg_catalog.jsonb_typeof(new.parameters -> 'renderer_version') is distinct from 'number'
       or (new.parameters ->> 'renderer_version') <> '1'
       or pg_catalog.jsonb_typeof(new.parameters -> 'truth_target') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(new.parameters -> 'candidate') is distinct from 'string'
       or (new.parameters ->> 'candidate') !~ '^-?(0|[1-9][0-9]{0,17})(\.[0-9]{0,7}[1-9])?$'
       or (new.parameters ->> 'candidate') = '-0' then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    v_truth := (new.parameters ->> 'truth_target')::boolean;
    v_candidate_text := new.parameters ->> 'candidate';
    v_actual_text := v_fact.fact_data ->> 'value';
    v_actual_decimal := v_actual_text::numeric;
    v_candidate_decimal := v_candidate_text::numeric;

    if new.parameters is distinct from pg_catalog.jsonb_build_object(
      'renderer_version', 1,
      'truth_target', v_truth,
      'candidate', v_candidate_text
    ) then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    if v_truth then
      if v_candidate_text <> v_actual_text then
        raise exception 'RETO_INSTANCE_INTEGRITY_DECIMAL_CANDIDATE';
      end if;
    else
      if v_candidate_text = v_actual_text then
        raise exception 'RETO_INSTANCE_INTEGRITY_DECIMAL_CANDIDATE';
      end if;

      v_step := (v_template.config ->> 'step')::numeric;
      v_diff := pg_catalog.abs(v_candidate_decimal - v_actual_decimal);

      if v_diff <= 0 then
        raise exception 'RETO_INSTANCE_INTEGRITY_DECIMAL_CANDIDATE';
      end if;

      v_steps := v_diff / v_step;

      if v_steps <> pg_catalog.trunc(v_steps)
         or v_steps < 1
         or v_steps > (v_template.config ->> 'false_steps_max')::numeric then
        raise exception 'RETO_INSTANCE_INTEGRITY_DECIMAL_CANDIDATE';
      end if;
    end if;

    v_subject := pg_catalog.regexp_replace(
      v_fact.fact_data ->> 'subject',
      '^[[:space:]]+|[[:space:]]+$', '', 'g'
    );

    if v_fact.fact_data ? 'unit' then
      v_unit := pg_catalog.regexp_replace(
        v_fact.fact_data ->> 'unit',
        '^[[:space:]]+|[[:space:]]+$', '', 'g'
      );
    else
      v_unit := null;
    end if;

    v_expected_question :=
      pg_catalog.chr(191) || 'Es correcto que ' || v_subject || ' es ' ||
      v_candidate_text ||
      case when v_unit is null then '' else ' ' || v_unit end || '?';

    if new.question_text is distinct from v_expected_question then
      raise exception 'RETO_INSTANCE_INTEGRITY_QUESTION_TEXT';
    end if;

    if new.correct_answer is distinct from v_truth then
      raise exception 'RETO_INSTANCE_INTEGRITY_CORRECT_ANSWER';
    end if;

  elsif v_template.operator_code = 'TEXT_EQUALS_VARIANT' then
    if pg_catalog.jsonb_typeof(new.parameters -> 'renderer_version') is distinct from 'number'
       or (new.parameters ->> 'renderer_version') <> '1'
       or pg_catalog.jsonb_typeof(new.parameters -> 'truth_target') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(new.parameters -> 'candidate') is distinct from 'string' then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    v_truth := (new.parameters ->> 'truth_target')::boolean;
    v_candidate_text := new.parameters ->> 'candidate';

    if new.parameters is distinct from pg_catalog.jsonb_build_object(
      'renderer_version', 1,
      'truth_target', v_truth,
      'candidate', v_candidate_text
    ) then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    v_actual_text := pg_catalog.regexp_replace(
      v_fact.fact_data ->> 'value',
      '^[[:space:]]+|[[:space:]]+$', '', 'g'
    );

    v_actual_key := pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.normalize(v_actual_text, 'NFKC'),
          '^[[:space:]]+|[[:space:]]+$', '', 'g'
        ),
        '[[:space:]]+', ' ', 'g'
      )
    );

    v_candidate_key := pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.normalize(v_candidate_text, 'NFKC'),
          '^[[:space:]]+|[[:space:]]+$', '', 'g'
        ),
        '[[:space:]]+', ' ', 'g'
      )
    );

    if v_truth then
      if v_candidate_text <> v_actual_text then
        raise exception 'RETO_INSTANCE_INTEGRITY_TEXT_CANDIDATE';
      end if;
    else
      if v_candidate_key = v_actual_key then
        raise exception 'RETO_INSTANCE_INTEGRITY_TEXT_CANDIDATE';
      end if;

      v_alt_match := false;

      for v_alt_raw in
        select a.value
        from pg_catalog.jsonb_array_elements_text(
          v_fact.fact_data -> 'false_alternatives'
        ) as a(value)
      loop
        v_alt_text := pg_catalog.regexp_replace(
          v_alt_raw,
          '^[[:space:]]+|[[:space:]]+$', '', 'g'
        );

        if pg_catalog.length(v_alt_text) between 1 and 1000 then
          v_alt_key := pg_catalog.lower(
            pg_catalog.regexp_replace(
              pg_catalog.regexp_replace(
                pg_catalog.normalize(v_alt_text, 'NFKC'),
                '^[[:space:]]+|[[:space:]]+$', '', 'g'
              ),
              '[[:space:]]+', ' ', 'g'
            )
          );

          if v_alt_key <> v_actual_key and v_candidate_text = v_alt_text then
            v_alt_match := true;
            exit;
          end if;
        end if;
      end loop;

      if v_alt_match is not true then
        raise exception 'RETO_INSTANCE_INTEGRITY_TEXT_CANDIDATE';
      end if;
    end if;

    v_subject := pg_catalog.regexp_replace(
      v_fact.fact_data ->> 'subject',
      '^[[:space:]]+|[[:space:]]+$', '', 'g'
    );

    v_expected_question :=
      pg_catalog.chr(191) || 'Es correcto afirmar que ' || v_subject ||
      ' es "' || v_candidate_text || '"?';

    if new.question_text is distinct from v_expected_question then
      raise exception 'RETO_INSTANCE_INTEGRITY_QUESTION_TEXT';
    end if;

    if new.correct_answer is distinct from v_truth then
      raise exception 'RETO_INSTANCE_INTEGRITY_CORRECT_ANSWER';
    end if;

  elsif v_template.operator_code = 'DATE_EQUALS_VARIANT' then
    if pg_catalog.jsonb_typeof(new.parameters -> 'renderer_version') is distinct from 'number'
       or (new.parameters ->> 'renderer_version') <> '1'
       or pg_catalog.jsonb_typeof(new.parameters -> 'truth_target') is distinct from 'boolean'
       or pg_catalog.jsonb_typeof(new.parameters -> 'candidate') is distinct from 'string'
       or (new.parameters ->> 'candidate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    v_truth := (new.parameters ->> 'truth_target')::boolean;
    v_candidate_text := new.parameters ->> 'candidate';

    begin
      v_candidate_date := v_candidate_text::date;
    exception
      when others then
        raise exception 'RETO_INSTANCE_INTEGRITY_DATE_CANDIDATE';
    end;

    if v_candidate_date::text <> v_candidate_text
       or v_candidate_text < '0001-01-01'
       or v_candidate_text > '9999-12-31' then
      raise exception 'RETO_INSTANCE_INTEGRITY_DATE_CANDIDATE';
    end if;

    v_actual_text := v_fact.fact_data ->> 'value';
    v_actual_date := v_actual_text::date;

    if new.parameters is distinct from pg_catalog.jsonb_build_object(
      'renderer_version', 1,
      'truth_target', v_truth,
      'candidate', v_candidate_text
    ) then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    if v_truth then
      if v_candidate_text <> v_actual_text then
        raise exception 'RETO_INSTANCE_INTEGRITY_DATE_CANDIDATE';
      end if;
    else
      v_day_diff := pg_catalog.abs(v_candidate_date - v_actual_date);
      if v_candidate_text = v_actual_text
         or v_day_diff < 1
         or v_day_diff > 30 then
        raise exception 'RETO_INSTANCE_INTEGRITY_DATE_CANDIDATE';
      end if;
    end if;

    v_subject := pg_catalog.regexp_replace(
      v_fact.fact_data ->> 'subject',
      '^[[:space:]]+|[[:space:]]+$', '', 'g'
    );

    v_expected_question :=
      pg_catalog.chr(191) || 'Es correcto que ' || v_subject ||
      ' corresponde a la fecha ' || v_candidate_text || '?';

    if new.question_text is distinct from v_expected_question then
      raise exception 'RETO_INSTANCE_INTEGRITY_QUESTION_TEXT';
    end if;

    if new.correct_answer is distinct from v_truth then
      raise exception 'RETO_INSTANCE_INTEGRITY_CORRECT_ANSWER';
    end if;

  elsif v_template.operator_code = 'MEMBERSHIP_DIRECT' then
    if pg_catalog.jsonb_typeof(new.parameters -> 'renderer_version') is distinct from 'number'
       or (new.parameters ->> 'renderer_version') <> '1'
       or pg_catalog.jsonb_typeof(new.parameters -> 'mode') is distinct from 'string'
       or (new.parameters ->> 'mode') <> 'membership_direct'
       or new.parameters is distinct from pg_catalog.jsonb_build_object(
         'renderer_version', 1, 'mode', 'membership_direct'
       ) then
      raise exception 'RETO_INSTANCE_INTEGRITY_PARAMETERS';
    end if;

    v_member := pg_catalog.regexp_replace(
      v_fact.fact_data ->> 'member',
      '^[[:space:]]+|[[:space:]]+$', '', 'g'
    );

    v_collection := pg_catalog.regexp_replace(
      v_fact.fact_data ->> 'collection',
      '^[[:space:]]+|[[:space:]]+$', '', 'g'
    );

    v_is_member := (v_fact.fact_data ->> 'is_member')::boolean;

    v_expected_question :=
      pg_catalog.chr(191) || v_member || ' pertenece a ' || v_collection || '?';

    if new.question_text is distinct from v_expected_question then
      raise exception 'RETO_INSTANCE_INTEGRITY_QUESTION_TEXT';
    end if;

    if new.correct_answer is distinct from v_is_member then
      raise exception 'RETO_INSTANCE_INTEGRITY_CORRECT_ANSWER';
    end if;

  else
    raise exception 'RETO_INSTANCE_INTEGRITY_OPERATOR_UNSUPPORTED';
  end if;

  return new;
end
$function$;

alter function public.enforce_reto_prize_question_instance_integrity()
  owner to postgres;

revoke all on function public.enforce_reto_prize_question_instance_integrity()
  from PUBLIC, anon, authenticated, service_role;

-- ============================================================================
-- CHANGE 3: freeze p_pending_roll in the private instance
-- ============================================================================
create or replace function public.issue_reto_prize_question_atomic(
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
    expires_at,
    issued_roll
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
    p_question_deadline,
    p_pending_roll
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

-- ============================================================================
-- CHANGE 4: read-only recovery v2 with exact replay metadata
-- ============================================================================
create function public.recover_reto_prize_answer_replay_v2(
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
  finished_at timestamptz,
  question_source text,
  issued_roll smallint,
  session_started_at timestamptz,
  session_expires_at timestamptz
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
    -- Principal replay proves the exact source -> post-answer phase/status
    -- transition. TypeScript can then reconstruct level_finished and passed
    -- without trusting browser state or a post-recovery read.
    if v_instance.issued_roll is not null
       or v_session.status = 'completed' then
      raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
    end if;

    if v_instance.source = 'principal_level1' then
      if v_session.state ->> 'phase' not in ('level1','level2','failed')
         or (
           v_session.state ->> 'phase' in ('level1','level2')
           and v_session.status <> 'active'
         )
         or (
           v_session.state ->> 'phase' = 'failed'
           and v_session.status <> 'failed'
         ) then
        raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
      end if;
    elsif v_instance.source = 'principal_level2' then
      if v_session.state ->> 'phase' not in ('level2','roulette','failed')
         or (
           v_session.state ->> 'phase' in ('level2','roulette')
           and v_session.status <> 'active'
         )
         or (
           v_session.state ->> 'phase' = 'failed'
           and v_session.status <> 'failed'
         ) then
        raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
      end if;
    else
      raise exception 'RETO_ANSWER_REPLAY_STATE_INVALID';
    end if;
  else
    -- Camino answer must have consumed its pending roll.
    if v_instance.source <> 'camino'
       or v_instance.issued_roll is null
       or v_instance.issued_roll < 1
       or v_instance.issued_roll > 6
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
    v_session.finished_at,
    v_instance.source,
    v_instance.issued_roll,
    v_session.started_at,
    v_session.expires_at;
end
$function$;

alter function public.recover_reto_prize_answer_replay_v2(
  uuid, uuid, text, text, integer, uuid, boolean
) owner to postgres;

revoke all on function public.recover_reto_prize_answer_replay_v2(
  uuid, uuid, text, text, integer, uuid, boolean
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.recover_reto_prize_answer_replay_v2(
  uuid, uuid, text, text, integer, uuid, boolean
) to service_role;

-- ============================================================================
-- POSTFLIGHT
-- ============================================================================
do $postflight$
declare
  v_issue regprocedure;
  v_integrity regprocedure;
  v_recovery_v1 regprocedure;
  v_recovery_v2 regprocedure;
  v_issue_def text;
  v_integrity_def text;
  v_recovery_v2_def text;
  v_recovery_v2_result text;
  v_constraint_def text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.reto_prize_question_instances'::pg_catalog.regclass
      and a.attname = 'issued_roll'
      and not a.attisdropped
      and a.atttypid = 'smallint'::pg_catalog.regtype
      and not a.attnotnull
  ) then
    raise exception 'B2C_E5F10B4A_POSTFAIL: issued_roll column invalid';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid)
  into v_constraint_def
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.reto_prize_question_instances'::pg_catalog.regclass
    and c.conname = 'reto_prize_question_instances_issued_roll_check'
    and c.contype = 'c'
    and c.convalidated;

  if v_constraint_def is null
     or pg_catalog.strpos(v_constraint_def, 'source') = 0
     or pg_catalog.strpos(v_constraint_def, 'camino') = 0
     or pg_catalog.strpos(v_constraint_def, 'issued_roll') = 0
     or pg_catalog.strpos(v_constraint_def, 'IS NOT NULL') = 0
     or pg_catalog.strpos(v_constraint_def, 'principal_level1') = 0
     or pg_catalog.strpos(v_constraint_def, 'principal_level2') = 0 then
    raise exception 'B2C_E5F10B4A_POSTFAIL: issued_roll constraint invalid %',
      v_constraint_def;
  end if;

  v_issue := pg_catalog.to_regprocedure(
    'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)'
  );
  v_integrity := pg_catalog.to_regprocedure(
    'public.enforce_reto_prize_question_instance_integrity()'
  );
  v_recovery_v1 := pg_catalog.to_regprocedure(
    'public.recover_reto_prize_answer_replay(uuid,uuid,text,text,integer,uuid,boolean)'
  );
  v_recovery_v2 := pg_catalog.to_regprocedure(
    'public.recover_reto_prize_answer_replay_v2(uuid,uuid,text,text,integer,uuid,boolean)'
  );

  if v_issue is null or v_integrity is null
     or v_recovery_v1 is null or v_recovery_v2 is null then
    raise exception 'B2C_E5F10B4A_POSTFAIL: expected function missing';
  end if;

  select pg_catalog.pg_get_functiondef(v_issue::oid) into v_issue_def;
  select pg_catalog.pg_get_functiondef(v_integrity::oid) into v_integrity_def;
  select
    pg_catalog.pg_get_functiondef(v_recovery_v2::oid),
    pg_catalog.pg_get_function_result(v_recovery_v2::oid)
  into v_recovery_v2_def, v_recovery_v2_result;

  if pg_catalog.strpos(v_issue_def, 'issued_roll') = 0
     or pg_catalog.strpos(v_issue_def, 'p_pending_roll') = 0
     or pg_catalog.strpos(
          v_issue_def,
          'insert into public.reto_prize_question_instances'
        ) = 0 then
    raise exception 'B2C_E5F10B4A_POSTFAIL: issue RPC did not freeze roll';
  end if;

  if pg_catalog.strpos(
       v_integrity_def,
       'new.issued_roll is distinct from old.issued_roll'
     ) = 0
     or pg_catalog.strpos(
       v_integrity_def,
       'RETO_INSTANCE_INTEGRITY_ISSUED_ROLL'
     ) = 0 then
    raise exception 'B2C_E5F10B4A_POSTFAIL: integrity roll guard missing';
  end if;

  if v_recovery_v2_result not ilike '%question_source text%'
     or v_recovery_v2_result not ilike '%issued_roll smallint%'
     or v_recovery_v2_result not ilike '%session_started_at timestamp with time zone%'
     or v_recovery_v2_result not ilike '%session_expires_at timestamp with time zone%'
     or v_recovery_v2_result not ilike '%session_state jsonb%'
     or v_recovery_v2_result not ilike '%finished_at timestamp with time zone%' then
    raise exception 'B2C_E5F10B4A_POSTFAIL: recovery v2 return contract invalid %',
      v_recovery_v2_result;
  end if;

  if pg_catalog.strpos(v_recovery_v2_def, 'v_instance.issued_roll') = 0
     or pg_catalog.strpos(v_recovery_v2_def, 'v_instance.source <> ''camino''') = 0
     or pg_catalog.strpos(v_recovery_v2_def, 'v_instance.source = ''principal_level1''') = 0
     or pg_catalog.strpos(v_recovery_v2_def, 'v_instance.source = ''principal_level2''') = 0
     or pg_catalog.strpos(v_recovery_v2_def, 'v_session.started_at') = 0
     or pg_catalog.strpos(v_recovery_v2_def, 'v_session.expires_at') = 0 then
    raise exception 'B2C_E5F10B4A_POSTFAIL: recovery v2 binding invalid';
  end if;

  if pg_catalog.strpos(v_recovery_v2_def, 'insert into ') <> 0
     or pg_catalog.strpos(v_recovery_v2_def, 'update public.') <> 0
     or pg_catalog.strpos(v_recovery_v2_def, 'delete from ') <> 0
     or pg_catalog.strpos(v_recovery_v2_def, 'finalize_reto_') <> 0 then
    raise exception 'B2C_E5F10B4A_POSTFAIL: recovery v2 is not read-only';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_integrity::oid
      and p.proowner = 'postgres'::pg_catalog.regrole
      and p.prosecdef
      and 'search_path=pg_catalog' = any(coalesce(p.proconfig, array[]::text[]))
  ) then
    raise exception 'B2C_E5F10B4A_POSTFAIL: integrity security invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_issue::oid
      and p.proowner = 'postgres'::pg_catalog.regrole
      and p.prosecdef
      and 'search_path=pg_catalog' = any(coalesce(p.proconfig, array[]::text[]))
  ) then
    raise exception 'B2C_E5F10B4A_POSTFAIL: issue security invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_recovery_v2::oid
      and p.proowner = 'postgres'::pg_catalog.regrole
      and p.prosecdef
      and 'search_path=pg_catalog' = any(coalesce(p.proconfig, array[]::text[]))
  ) then
    raise exception 'B2C_E5F10B4A_POSTFAIL: recovery v2 security invalid';
  end if;

  if pg_catalog.has_function_privilege('anon', v_issue, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_issue, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_issue, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_recovery_v2, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_recovery_v2, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_recovery_v2, 'EXECUTE') then
    raise exception 'B2C_E5F10B4A_POSTFAIL: RPC ACL invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where p.oid in (v_issue::oid, v_integrity::oid, v_recovery_v2::oid)
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'B2C_E5F10B4A_POSTFAIL: PUBLIC EXECUTE present';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.reto_prize_question_instances'::pg_catalog.regclass
      and t.tgname = 'trg_reto_prize_question_instance_integrity'
      and not t.tgisinternal
      and t.tgenabled = 'O'
      and t.tgfoid = v_integrity::oid
  ) then
    raise exception 'B2C_E5F10B4A_POSTFAIL: integrity trigger invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_prize_question_instances'
      and c.relrowsecurity
  ) then
    raise exception 'B2C_E5F10B4A_POSTFAIL: RLS regressed';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'reto_prize_question_instances'
  ) <> 0 then
    raise exception 'B2C_E5F10B4A_POSTFAIL: unexpected instance policy';
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
    raise exception 'B2C_E5F10B4A_POSTFAIL: direct mutation privilege regressed';
  end if;

  if exists (select 1 from public.reto_prize_question_instances) then
    raise exception 'B2C_E5F10B4A_POSTFAIL: simulation inserted instances';
  end if;

  raise notice 'B2C_E5F10B4A_POSTFLIGHT=PASS';
end
$postflight$;

commit;

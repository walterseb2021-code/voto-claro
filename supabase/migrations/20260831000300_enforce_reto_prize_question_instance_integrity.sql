-- B2C-E5F9E2 REAL MIGRATION
-- Barrera autoritativa para public.reto_prize_question_instances.
-- Derivada exactamente de la funcion/trigger validados en
-- B2C_E5F9E2_SIMULATION_ROLLBACK.sql.
-- No inserta facts, templates, sesiones ni instancias. No activa premios.

begin;

-- ============================================================
-- PREFLIGHT
-- ============================================================
do $preflight$
begin
  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'enforce_reto_prize_question_instance_integrity'
  ) then
    raise exception 'B2C_E5F9E2_ABORT: integrity function ya existe';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.reto_prize_question_instances'::pg_catalog.regclass
      and t.tgname = 'trg_reto_prize_question_instance_integrity'
      and not t.tgisinternal
  ) then
    raise exception 'B2C_E5F9E2_ABORT: integrity trigger ya existe';
  end if;

  if exists (select 1 from public.reto_prize_question_instances) then
    raise exception 'B2C_E5F9E2_ABORT: existen instancias; revisar antes de instalar';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'issue_reto_prize_question_atomic'
      and p.pronargs = 13
  ) then
    raise exception 'B2C_E5F9E2_ABORT: issue RPC ausente';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'commit_reto_prize_answer_atomic'
      and p.pronargs = 6
  ) then
    raise exception 'B2C_E5F9E2_ABORT: answer RPC ausente';
  end if;
end
$preflight$;

-- ============================================================
-- CHANGE
-- ============================================================
create function public.enforce_reto_prize_question_instance_integrity()
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
       or new.expires_at is distinct from old.expires_at then
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

create trigger trg_reto_prize_question_instance_integrity
before insert or update or delete
on public.reto_prize_question_instances
for each row
execute function public.enforce_reto_prize_question_instance_integrity();

-- ============================================================
-- POSTFLIGHT
-- ============================================================
do $postflight$
declare
  v_fn oid;
begin
  select p.oid
    into v_fn
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'enforce_reto_prize_question_instance_integrity'
    and p.pronargs = 0;

  if v_fn is null then
    raise exception 'B2C_E5F9E2_POSTFAIL: integrity function missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_fn
      and p.proowner = 'postgres'::pg_catalog.regrole
      and p.prosecdef
      and 'search_path=pg_catalog' = any(coalesce(p.proconfig, array[]::text[]))
  ) then
    raise exception 'B2C_E5F9E2_POSTFAIL: function owner/security/search_path';
  end if;

  if exists (
    select 1
    from pg_catalog.aclexplode(
      coalesce(
        (select p.proacl from pg_catalog.pg_proc p where p.oid = v_fn),
        pg_catalog.acldefault('f', 'postgres'::pg_catalog.regrole)
      )
    ) a
    where a.privilege_type = 'EXECUTE'
      and (
        a.grantee = 0
        or exists (
          select 1
          from pg_catalog.pg_roles r
          where r.oid = a.grantee
            and r.rolname in ('anon','authenticated','service_role')
        )
      )
  ) then
    raise exception 'B2C_E5F9E2_POSTFAIL: unexpected EXECUTE grant';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.reto_prize_question_instances'::pg_catalog.regclass
      and t.tgname = 'trg_reto_prize_question_instance_integrity'
      and not t.tgisinternal
      and t.tgenabled = 'O'
  ) then
    raise exception 'B2C_E5F9E2_POSTFAIL: trigger missing or disabled';
  end if;

  if exists (select 1 from public.reto_prize_question_instances) then
    raise exception 'B2C_E5F9E2_POSTFAIL: unexpected instance rows';
  end if;
end
$postflight$;

commit;

-- B2C-E5F9E1
-- Enforce missing private-bank contracts for integer/date/membership facts
-- and explicit INT_EQUALS_VARIANT template configuration.
-- Does not activate prizes. Does not change privileges.

begin;

do $preflight$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
      and conname in (
        'reto_knowledge_facts_integer_data_check',
        'reto_knowledge_facts_date_data_check',
        'reto_knowledge_facts_membership_data_check'
      )
  ) then
    raise exception 'B2C_E5F9E1_ABORT: one or more fact constraints already exist';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_question_templates'::pg_catalog.regclass
      and conname = 'reto_question_templates_integer_config_check'
  ) then
    raise exception 'B2C_E5F9E1_ABORT: integer template config constraint already exists';
  end if;

  if exists (
    select 1
    from public.reto_knowledge_facts
    where fact_type in ('integer','date','membership')
  ) then
    raise exception 'B2C_E5F9E1_ABORT: target facts are not empty';
  end if;

  if exists (
    select 1
    from public.reto_question_templates
    where fact_type = 'integer'
  ) then
    raise exception 'B2C_E5F9E1_ABORT: integer templates are not empty';
  end if;
end
$preflight$;

alter table public.reto_knowledge_facts
  add constraint reto_knowledge_facts_integer_data_check
  check (
    fact_type <> 'integer'
    or (
      fact_data ? 'subject'
      and pg_catalog.jsonb_typeof(fact_data -> 'subject') = 'string'
      and pg_catalog.btrim(fact_data ->> 'subject') <> ''
      and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'subject')) <= 3500
      and fact_data ? 'value'
      and pg_catalog.jsonb_typeof(fact_data -> 'value') = 'number'
      and (fact_data ->> 'value')::numeric = pg_catalog.trunc((fact_data ->> 'value')::numeric)
      and pg_catalog.abs((fact_data ->> 'value')::numeric) <= 9007199254740991
      and (
        not (fact_data ? 'unit')
        or (
          pg_catalog.jsonb_typeof(fact_data -> 'unit') = 'string'
          and pg_catalog.btrim(fact_data ->> 'unit') <> ''
          and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'unit')) <= 80
        )
      )
    )
  );

alter table public.reto_knowledge_facts
  add constraint reto_knowledge_facts_date_data_check
  check (
    fact_type <> 'date'
    or (
      fact_data ? 'subject'
      and pg_catalog.jsonb_typeof(fact_data -> 'subject') = 'string'
      and pg_catalog.btrim(fact_data ->> 'subject') <> ''
      and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'subject')) <= 3500
      and fact_data ? 'value'
      and pg_catalog.jsonb_typeof(fact_data -> 'value') = 'string'
      and (fact_data ->> 'value') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      and ((fact_data ->> 'value')::date)::text = (fact_data ->> 'value')
    )
  );

alter table public.reto_knowledge_facts
  add constraint reto_knowledge_facts_membership_data_check
  check (
    fact_type <> 'membership'
    or (
      fact_data ? 'member'
      and pg_catalog.jsonb_typeof(fact_data -> 'member') = 'string'
      and pg_catalog.btrim(fact_data ->> 'member') <> ''
      and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'member')) <= 1800
      and fact_data ? 'collection'
      and pg_catalog.jsonb_typeof(fact_data -> 'collection') = 'string'
      and pg_catalog.btrim(fact_data ->> 'collection') <> ''
      and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'collection')) <= 1800
      and fact_data ? 'is_member'
      and pg_catalog.jsonb_typeof(fact_data -> 'is_member') = 'boolean'
    )
  );

alter table public.reto_question_templates
  add constraint reto_question_templates_integer_config_check
  check (
    not (fact_type = 'integer' and operator_code = 'INT_EQUALS_VARIANT')
    or (
      config ? 'false_delta_min'
      and pg_catalog.jsonb_typeof(config -> 'false_delta_min') = 'number'
      and (config ->> 'false_delta_min') ~ '^[0-9]+$'
      and (config ->> 'false_delta_min')::numeric between 1 and 100000
      and config ? 'false_delta_max'
      and pg_catalog.jsonb_typeof(config -> 'false_delta_max') = 'number'
      and (config ->> 'false_delta_max') ~ '^[0-9]+$'
      and (config ->> 'false_delta_max')::numeric between 1 and 100000
      and (config ->> 'false_delta_max')::numeric >=
          (config ->> 'false_delta_min')::numeric
    )
  );

do $postflight$
declare
  v_integer_validated boolean;
  v_date_validated boolean;
  v_membership_validated boolean;
  v_integer_config_validated boolean;
begin
  select convalidated
    into v_integer_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
    and conname = 'reto_knowledge_facts_integer_data_check';

  select convalidated
    into v_date_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
    and conname = 'reto_knowledge_facts_date_data_check';

  select convalidated
    into v_membership_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
    and conname = 'reto_knowledge_facts_membership_data_check';

  select convalidated
    into v_integer_config_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_question_templates'::pg_catalog.regclass
    and conname = 'reto_question_templates_integer_config_check';

  if coalesce(v_integer_validated, false) is not true then
    raise exception 'B2C_E5F9E1_POSTFLIGHT_FAIL: integer fact constraint missing/unvalidated';
  end if;

  if coalesce(v_date_validated, false) is not true then
    raise exception 'B2C_E5F9E1_POSTFLIGHT_FAIL: date fact constraint missing/unvalidated';
  end if;

  if coalesce(v_membership_validated, false) is not true then
    raise exception 'B2C_E5F9E1_POSTFLIGHT_FAIL: membership fact constraint missing/unvalidated';
  end if;

  if coalesce(v_integer_config_validated, false) is not true then
    raise exception 'B2C_E5F9E1_POSTFLIGHT_FAIL: integer config constraint missing/unvalidated';
  end if;
end
$postflight$;

commit;

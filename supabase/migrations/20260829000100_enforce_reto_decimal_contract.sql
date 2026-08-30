-- B2C-E5F9B
-- Contrato decimal canonico para el banco privado del Reto.
-- No activa premios.

begin;
--
-- Reglas:
-- 1) reto_knowledge_facts.fact_data.value para fact_type='decimal'
--    debe ser string decimal canonico, sin notacion cientifica,
--    maximo 18 digitos enteros y 8 decimales, sin -0 ni ceros
--    no canonicos.
-- 2) reto_question_templates.config para DECIMAL_EQUALS_VARIANT
--    debe incluir step como string decimal canonico positivo <= 100000
--    y false_steps_max como entero JSON entre 1 y 1000.

do $preflight$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
      and conname = 'reto_knowledge_facts_decimal_data_check'
  ) then
    raise exception 'B2C_E5F9B_ABORT: reto_knowledge_facts_decimal_data_check ya existe';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_question_templates'::pg_catalog.regclass
      and conname = 'reto_question_templates_decimal_config_check'
  ) then
    raise exception 'B2C_E5F9B_ABORT: reto_question_templates_decimal_config_check ya existe';
  end if;

  if exists (
    select 1
    from public.reto_knowledge_facts
    where fact_type = 'decimal'
  ) then
    raise exception 'B2C_E5F9B_ABORT: existen hechos decimales; revisar/migrar antes de aplicar el contrato';
  end if;

  if exists (
    select 1
    from public.reto_question_templates
    where fact_type = 'decimal'
       or operator_code = 'DECIMAL_EQUALS_VARIANT'
  ) then
    raise exception 'B2C_E5F9B_ABORT: existen plantillas decimales; revisar/migrar antes de aplicar el contrato';
  end if;
end
$preflight$;

alter table public.reto_knowledge_facts
  add constraint reto_knowledge_facts_decimal_data_check
  check (
    fact_type <> 'decimal'
    or (
      fact_data ? 'value'
      and pg_catalog.jsonb_typeof(fact_data -> 'value') = 'string'
      and (fact_data ->> 'value') ~ '^-?(0|[1-9][0-9]{0,17})(\.[0-9]{0,7}[1-9])?$'
      and (fact_data ->> 'value') <> '-0'
    )
  );

alter table public.reto_question_templates
  add constraint reto_question_templates_decimal_config_check
  check (
    not (fact_type = 'decimal' and operator_code = 'DECIMAL_EQUALS_VARIANT')
    or (
      config ? 'step'
      and pg_catalog.jsonb_typeof(config -> 'step') = 'string'
      and (config ->> 'step') ~ '^(0\.[0-9]{0,7}[1-9]|[1-9][0-9]{0,4}(\.[0-9]{0,7}[1-9])?|100000)$'
      and config ? 'false_steps_max'
      and pg_catalog.jsonb_typeof(config -> 'false_steps_max') = 'number'
      and (config ->> 'false_steps_max') ~ '^([1-9][0-9]{0,2}|1000)$'
    )
  );

do $postflight$
declare
  v_fact_validated boolean;
  v_template_validated boolean;
begin
  select convalidated
    into v_fact_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
    and conname = 'reto_knowledge_facts_decimal_data_check';

  select convalidated
    into v_template_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_question_templates'::pg_catalog.regclass
    and conname = 'reto_question_templates_decimal_config_check';

  if coalesce(v_fact_validated, false) is not true then
    raise exception 'B2C_E5F9B_POSTFLIGHT_FAIL: constraint de facts ausente o no validado';
  end if;

  if coalesce(v_template_validated, false) is not true then
    raise exception 'B2C_E5F9B_POSTFLIGHT_FAIL: constraint de templates ausente o no validado';
  end if;
end
$postflight$;

commit;

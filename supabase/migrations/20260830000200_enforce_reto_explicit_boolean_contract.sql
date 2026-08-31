-- B2C-E5F9D
-- Contrato booleano explicito para el banco privado del Reto.
-- Elimina BOOL_DIRECT / BOOL_NEGATED y la negacion linguistica automatica.
-- No activa premios.
--
-- Nuevo contrato:
-- - fact_data.statement_true: afirmacion revisada cuya respuesta correcta es true
-- - fact_data.statement_false: afirmacion revisada cuya respuesta correcta es false
-- - se prohiben los campos legacy fact_data.statement y fact_data.value
-- - allowed_operators para boolean = ['BOOL_EXPLICIT_VARIANT']
-- - templates booleanos solo pueden usar BOOL_EXPLICIT_VARIANT

begin;

do $preflight$
begin
  if exists (
    select 1
    from public.reto_knowledge_facts
    where fact_type = 'boolean'
  ) then
    raise exception
      'B2C_E5F9D_ABORT: existen hechos booleanos; revisar/migrar antes de aplicar el contrato';
  end if;

  if exists (
    select 1
    from public.reto_question_templates
    where fact_type = 'boolean'
  ) then
    raise exception
      'B2C_E5F9D_ABORT: existen templates booleanos; revisar/migrar antes de aplicar el contrato';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
      and conname = 'reto_knowledge_facts_boolean_data_check'
  ) then
    raise exception
      'B2C_E5F9D_ABORT: reto_knowledge_facts_boolean_data_check ya existe';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_question_templates'::pg_catalog.regclass
      and conname = 'reto_question_templates_boolean_operator_check'
  ) then
    raise exception
      'B2C_E5F9D_ABORT: reto_question_templates_boolean_operator_check ya existe';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
      and conname = 'reto_knowledge_facts_allowed_operators_check'
      and convalidated
  ) then
    raise exception
      'B2C_E5F9D_ABORT: reto_knowledge_facts_allowed_operators_check base ausente/no validado';
  end if;
end
$preflight$;

alter table public.reto_knowledge_facts
  drop constraint reto_knowledge_facts_allowed_operators_check;

alter table public.reto_knowledge_facts
  add constraint reto_knowledge_facts_allowed_operators_check
  check (
    case fact_type
      when 'boolean' then
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'BOOL_EXPLICIT_VARIANT'
      when 'integer' then
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'INT_EQUALS_VARIANT'
      when 'decimal' then
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'DECIMAL_EQUALS_VARIANT'
      when 'text' then
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'TEXT_EQUALS_VARIANT'
      when 'date' then
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'DATE_EQUALS_VARIANT'
      when 'membership' then
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'MEMBERSHIP_DIRECT'
      else false
    end
  );

alter table public.reto_knowledge_facts
  add constraint reto_knowledge_facts_boolean_data_check
  check (
    fact_type <> 'boolean'
    or (
      not (fact_data ? 'statement')
      and not (fact_data ? 'value')
      and fact_data ? 'statement_true'
      and fact_data ? 'statement_false'
      and pg_catalog.jsonb_typeof(fact_data -> 'statement_true') = 'string'
      and pg_catalog.jsonb_typeof(fact_data -> 'statement_false') = 'string'
      and pg_catalog.btrim(fact_data ->> 'statement_true') <> ''
      and pg_catalog.btrim(fact_data ->> 'statement_false') <> ''
      and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'statement_true')) <= 4500
      and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'statement_false')) <= 4500
      and pg_catalog.btrim(fact_data ->> 'statement_true')
          <> pg_catalog.btrim(fact_data ->> 'statement_false')
    )
  );

alter table public.reto_question_templates
  add constraint reto_question_templates_boolean_operator_check
  check (
    fact_type <> 'boolean'
    or operator_code = 'BOOL_EXPLICIT_VARIANT'
  );

do $postflight$
declare
  v_allowed_validated boolean;
  v_data_validated boolean;
  v_template_validated boolean;
  v_allowed_def text;
begin
  select convalidated, pg_catalog.pg_get_constraintdef(oid)
    into v_allowed_validated, v_allowed_def
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
    and conname = 'reto_knowledge_facts_allowed_operators_check';

  select convalidated
    into v_data_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
    and conname = 'reto_knowledge_facts_boolean_data_check';

  select convalidated
    into v_template_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_question_templates'::pg_catalog.regclass
    and conname = 'reto_question_templates_boolean_operator_check';

  if coalesce(v_allowed_validated, false) is not true then
    raise exception
      'B2C_E5F9D_POSTFLIGHT_FAIL: allowed_operators_check ausente/no validado';
  end if;

  if pg_catalog.strpos(coalesce(v_allowed_def, ''), 'BOOL_EXPLICIT_VARIANT') = 0
     or pg_catalog.strpos(coalesce(v_allowed_def, ''), 'BOOL_DIRECT') > 0
     or pg_catalog.strpos(coalesce(v_allowed_def, ''), 'BOOL_NEGATED') > 0 then
    raise exception
      'B2C_E5F9D_POSTFLIGHT_FAIL: allowed_operators_check no contiene el contrato booleano esperado';
  end if;

  if coalesce(v_data_validated, false) is not true then
    raise exception
      'B2C_E5F9D_POSTFLIGHT_FAIL: boolean_data_check ausente/no validado';
  end if;

  if coalesce(v_template_validated, false) is not true then
    raise exception
      'B2C_E5F9D_POSTFLIGHT_FAIL: template boolean operator check ausente/no validado';
  end if;
end
$postflight$;

commit;

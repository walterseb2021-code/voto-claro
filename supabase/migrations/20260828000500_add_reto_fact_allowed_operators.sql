-- B2C-E5F8A - REAL MIGRATION
-- Add per-fact allowed_operators with deny-by-default compatibility rules.
-- Production change: reto_knowledge_facts.allowed_operators text[] NOT NULL.

begin;

do $$
declare
  v_facts bigint;
  v_templates bigint;
begin
  if pg_catalog.to_regclass('public.reto_knowledge_facts') is null then
    raise exception 'B2C_E5F8A_ABORT: reto_knowledge_facts no existe';
  end if;

  if pg_catalog.to_regclass('public.reto_question_templates') is null then
    raise exception 'B2C_E5F8A_ABORT: reto_question_templates no existe';
  end if;

  select pg_catalog.count(*) into v_facts
  from public.reto_knowledge_facts;

  select pg_catalog.count(*) into v_templates
  from public.reto_question_templates;

  if v_facts <> 0 or v_templates <> 0 then
    raise exception
      'B2C_E5F8A_ABORT: tablas privadas no estan vacias facts=% templates=%',
      v_facts,
      v_templates;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_knowledge_facts'
      and a.attname = 'allowed_operators'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B2C_E5F8A_ABORT: allowed_operators ya existe';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_knowledge_facts'
      and con.conname = 'reto_knowledge_facts_allowed_operators_check'
  ) then
    raise exception 'B2C_E5F8A_ABORT: constraint allowed_operators ya existe';
  end if;

  if pg_catalog.has_table_privilege('anon','public.reto_knowledge_facts','SELECT')
    or pg_catalog.has_table_privilege('authenticated','public.reto_knowledge_facts','SELECT')
  then
    raise exception 'B2C_E5F8A_ABORT: privilegios publicos inesperados';
  end if;

  if not pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','SELECT') then
    raise exception 'B2C_E5F8A_ABORT: service_role perdio SELECT';
  end if;

  if pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','INSERT')
    or pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','UPDATE')
    or pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','DELETE')
  then
    raise exception 'B2C_E5F8A_ABORT: service_role tiene escritura directa';
  end if;
end
$$;

alter table public.reto_knowledge_facts
  add column allowed_operators text[] not null;

alter table public.reto_knowledge_facts
  add constraint reto_knowledge_facts_allowed_operators_check
  check (
    case fact_type
      when 'boolean' then (
        (
          pg_catalog.cardinality(allowed_operators) = 1
          and allowed_operators[1] in ('BOOL_DIRECT', 'BOOL_NEGATED')
        )
        or (
          pg_catalog.cardinality(allowed_operators) = 2
          and allowed_operators @> array['BOOL_DIRECT', 'BOOL_NEGATED']::text[]
          and allowed_operators <@ array['BOOL_DIRECT', 'BOOL_NEGATED']::text[]
        )
      )
      when 'integer' then (
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'INT_EQUALS_VARIANT'
      )
      when 'decimal' then (
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'DECIMAL_EQUALS_VARIANT'
      )
      when 'text' then (
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'TEXT_EQUALS_VARIANT'
      )
      when 'date' then (
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'DATE_EQUALS_VARIANT'
      )
      when 'membership' then (
        pg_catalog.cardinality(allowed_operators) = 1
        and allowed_operators[1] = 'MEMBERSHIP_DIRECT'
      )
      else false
    end
  );

do $$
declare
  v_attnotnull boolean;
  v_type text;
  v_constraint_validated boolean;
begin
  select
    a.attnotnull,
    pg_catalog.format_type(a.atttypid, a.atttypmod)
  into
    v_attnotnull,
    v_type
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'reto_knowledge_facts'
    and a.attname = 'allowed_operators'
    and a.attnum > 0
    and not a.attisdropped;

  if v_attnotnull is distinct from true or v_type is distinct from 'text[]' then
    raise exception
      'B2C_E5F8A_ABORT: allowed_operators invalido notnull=% type=%',
      v_attnotnull,
      v_type;
  end if;

  select con.convalidated
  into v_constraint_validated
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid = con.conrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'reto_knowledge_facts'
    and con.conname = 'reto_knowledge_facts_allowed_operators_check';

  if v_constraint_validated is distinct from true then
    raise exception 'B2C_E5F8A_ABORT: constraint no validada';
  end if;

  if exists (select 1 from public.reto_knowledge_facts limit 1)
     or exists (select 1 from public.reto_question_templates limit 1)
  then
    raise exception 'B2C_E5F8A_ABORT: aparecieron datos durante migracion';
  end if;

  if pg_catalog.has_table_privilege('anon','public.reto_knowledge_facts','SELECT')
    or pg_catalog.has_table_privilege('authenticated','public.reto_knowledge_facts','SELECT')
    or not pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','SELECT')
    or pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','INSERT')
    or pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','UPDATE')
    or pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','DELETE')
  then
    raise exception 'B2C_E5F8A_ABORT: privilegios cambiaron durante migracion';
  end if;
end
$$;

commit;

select
  'B2C_E5F8A_MIGRATION_OK'::text as result,
  (select pg_catalog.count(*) from public.reto_knowledge_facts) as facts_count,
  (select pg_catalog.count(*) from public.reto_question_templates) as templates_count,
  exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_knowledge_facts'
      and a.attname = 'allowed_operators'
      and a.attnum > 0
      and not a.attisdropped
  ) as allowed_operators_exists,
  exists (
    select 1
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class c on c.oid = con.conrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_knowledge_facts'
      and con.conname = 'reto_knowledge_facts_allowed_operators_check'
      and con.convalidated
  ) as constraint_validated,
  pg_catalog.has_table_privilege('anon','public.reto_knowledge_facts','SELECT') as anon_select,
  pg_catalog.has_table_privilege('authenticated','public.reto_knowledge_facts','SELECT') as authenticated_select,
  pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','SELECT') as service_role_select;

-- B2C-E5F9E1B
-- Completa contratos renderizables para facts decimal/text.
-- No activa premios.
-- No inserta, actualiza ni elimina datos.

begin;

do $preflight$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
      and conname = 'reto_knowledge_facts_decimal_data_check'
      and convalidated
  ) then
    raise exception 'B2C_E5F9E1B_ABORT: contrato decimal base ausente o no validado';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
      and conname = 'reto_knowledge_facts_text_data_check'
      and convalidated
  ) then
    raise exception 'B2C_E5F9E1B_ABORT: contrato text base ausente o no validado';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
      and conname = 'reto_knowledge_facts_decimal_render_data_check'
  ) then
    raise exception 'B2C_E5F9E1B_ABORT: decimal render constraint ya existe';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
      and conname = 'reto_knowledge_facts_text_render_data_check'
  ) then
    raise exception 'B2C_E5F9E1B_ABORT: text render constraint ya existe';
  end if;

  if exists (
    select 1
    from public.reto_knowledge_facts
    where fact_type in ('decimal','text')
  ) then
    raise exception 'B2C_E5F9E1B_ABORT: existen facts decimal/text; revisar/migrar antes';
  end if;
end
$preflight$;

alter table public.reto_knowledge_facts
  add constraint reto_knowledge_facts_decimal_render_data_check
  check (
    fact_type <> 'decimal'
    or (
      fact_data ? 'subject'
      and pg_catalog.jsonb_typeof(fact_data -> 'subject') = 'string'
      and pg_catalog.btrim(fact_data ->> 'subject') <> ''
      and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'subject')) <= 3500
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
  add constraint reto_knowledge_facts_text_render_data_check
  check (
    fact_type <> 'text'
    or (
      fact_data ? 'subject'
      and pg_catalog.jsonb_typeof(fact_data -> 'subject') = 'string'
      and pg_catalog.btrim(fact_data ->> 'subject') <> ''
      and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'subject')) <= 3000
    )
  );

do $postflight$
declare
  v_decimal_validated boolean;
  v_text_validated boolean;
begin
  select convalidated
    into v_decimal_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
    and conname = 'reto_knowledge_facts_decimal_render_data_check';

  select convalidated
    into v_text_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
    and conname = 'reto_knowledge_facts_text_render_data_check';

  if coalesce(v_decimal_validated, false) is not true then
    raise exception 'B2C_E5F9E1B_POSTFLIGHT_FAIL: decimal render constraint ausente o no validado';
  end if;

  if coalesce(v_text_validated, false) is not true then
    raise exception 'B2C_E5F9E1B_POSTFLIGHT_FAIL: text render constraint ausente o no validado';
  end if;

  if exists (
    select 1
    from public.reto_knowledge_facts
    where fact_type in ('decimal','text')
  ) then
    raise exception 'B2C_E5F9E1B_POSTFLIGHT_FAIL: aparecieron facts decimal/text durante migracion';
  end if;
end
$postflight$;

commit;

-- B2C-E5F9C
-- Contrato explicito para hechos textuales del banco privado del Reto.
-- No activa premios.
--
-- DB:
-- - value debe ser string no vacio, maximo 1000 caracteres.
-- - se prohibe el campo legacy ambiguo "alternatives".
-- - false_alternatives debe existir como array de 1..100 strings.
-- - la respuesta verdadera no puede aparecer exactamente como alternativa falsa.
--
-- TypeScript completara el blindaje semantico con:
-- normalizacion Unicode, comparacion case-insensitive y deduplicacion defensiva.

begin;

do $preflight$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
      and conname = 'reto_knowledge_facts_text_data_check'
  ) then
    raise exception
      'B2C_E5F9C_ABORT: reto_knowledge_facts_text_data_check ya existe';
  end if;

  if exists (
    select 1
    from public.reto_knowledge_facts
    where fact_type = 'text'
  ) then
    raise exception
      'B2C_E5F9C_ABORT: existen hechos textuales; revisar/migrar antes de aplicar el contrato';
  end if;
end
$preflight$;

alter table public.reto_knowledge_facts
  add constraint reto_knowledge_facts_text_data_check
  check (
    fact_type <> 'text'
    or (
      fact_data ? 'value'
      and pg_catalog.jsonb_typeof(fact_data -> 'value') = 'string'
      and pg_catalog.btrim(fact_data ->> 'value') <> ''
      and pg_catalog.length(pg_catalog.btrim(fact_data ->> 'value')) <= 1000
      and not (fact_data ? 'alternatives')
      and fact_data ? 'false_alternatives'
      and case
        when pg_catalog.jsonb_typeof(fact_data -> 'false_alternatives') = 'array'
        then
          pg_catalog.jsonb_array_length(fact_data -> 'false_alternatives') between 1 and 100
          and not pg_catalog.jsonb_path_exists(
            fact_data -> 'false_alternatives',
            '$[*] ? (@.type() != "string")'::pg_catalog.jsonpath
          )
          and not (
            (fact_data -> 'false_alternatives')
            @> pg_catalog.jsonb_build_array(fact_data -> 'value')
          )
        else false
      end
    )
  );

do $postflight$
declare
  v_validated boolean;
begin
  select convalidated
    into v_validated
  from pg_catalog.pg_constraint
  where conrelid = 'public.reto_knowledge_facts'::pg_catalog.regclass
    and conname = 'reto_knowledge_facts_text_data_check';

  if coalesce(v_validated, false) is not true then
    raise exception
      'B2C_E5F9C_POSTFLIGHT_FAIL: constraint textual ausente o no validado';
  end if;
end
$postflight$;

commit;

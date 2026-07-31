begin;
set transaction read only;

do $$
declare
  v_missing text[] := array[]::text[];
  v_round1_expected integer;
  v_grupob_active integer;
  v_grupob_active_round1 integer;
begin
  if pg_catalog.to_regclass('public.vote_rounds') is null then
    v_missing := v_missing || 'public.vote_rounds';
  end if;

  if pg_catalog.to_regclass('public.vote_parties') is null then
    v_missing := v_missing || 'public.vote_parties';
  end if;

  if pg_catalog.to_regprocedure('public.create_vote_round_draft(text,text,text,timestamp with time zone)') is null then
    v_missing := v_missing || 'public.create_vote_round_draft(text,text,text,timestamptz)';
  end if;

  if pg_catalog.to_regprocedure('public.activate_vote_round_draft(uuid)') is null then
    v_missing := v_missing || 'public.activate_vote_round_draft(uuid)';
  end if;

  if pg_catalog.to_regprocedure('public.close_active_vote_round(uuid)') is null then
    v_missing := v_missing || 'public.close_active_vote_round(uuid)';
  end if;

  if pg_catalog.array_length(v_missing, 1) is not null then
    raise exception 'B-SEC-23D missing essential object(s): %', pg_catalog.array_to_string(v_missing, ', ');
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'id'
      and a.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23D incompatible type: public.vote_rounds.id must be uuid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'group_code'
      and a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23D incompatible type: public.vote_rounds.group_code must be text';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'is_active'
      and a.atttypid = 'pg_catalog.bool'::pg_catalog.regtype
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23D incompatible type: public.vote_rounds.is_active must be boolean';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
      and a.attname = 'round_id'
      and a.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23D incompatible type: public.vote_parties.round_id must be uuid';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(array['slug', 'name', 'group_code']::text[]) as required_column(attname)
    where not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
        and a.attname = required_column.attname
        and a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
        and not a.attisdropped
    )
  ) then
    raise exception 'B-SEC-23D incompatible type: public.vote_parties slug/name/group_code must be text';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
      and a.attname = 'enabled'
      and a.atttypid = 'pg_catalog.bool'::pg_catalog.regtype
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23D incompatible type: public.vote_parties.enabled must be boolean';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
      and a.attname = 'position'
      and a.atttypid in (
        'pg_catalog.int2'::pg_catalog.regtype,
        'pg_catalog.int4'::pg_catalog.regtype,
        'pg_catalog.int8'::pg_catalog.regtype
      )
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23D incompatible type: public.vote_parties.position must be integer-compatible';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d
      on d.adrelid = a.attrelid
     and d.adnum = a.attnum
    where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attnotnull
      and d.oid is null
      and a.attname not in (
        'slug',
        'name',
        'enabled',
        'position',
        'group_code',
        'round_id'
      )
  ) then
    raise exception 'B-SEC-23D vote_parties has non-cloned NOT NULL column(s) without default';
  end if;

  select pg_catalog.count(*)::integer
    into v_round1_expected
  from public.vote_rounds r
  where r.name = 'Ronda 1'
    and r.group_code = 'GRUPOB'
    and r.is_active = true
    and r.identity_mode = 'legacy_device'
    and r.lifecycle_state = 'legacy';

  select pg_catalog.count(*)::integer
    into v_grupob_active
  from public.vote_rounds r
  where r.group_code = 'GRUPOB'
    and r.is_active = true;

  select pg_catalog.count(*)::integer
    into v_grupob_active_round1
  from public.vote_rounds r
  where r.name = 'Ronda 1'
    and r.group_code = 'GRUPOB'
    and r.is_active = true;

  if v_round1_expected <> 1 or v_grupob_active <> 1 or v_grupob_active_round1 <> 1 then
    raise exception 'B-SEC-23D RONDA 1 NO COINCIDE CON EL ESTADO ESPERADO';
  end if;
end;
$$;

with index_columns as (
  select
    i.indexrelid,
    c.relname as index_name,
    i.indrelid,
    i.indisunique,
    i.indisvalid,
    i.indisready,
    pg_catalog.pg_get_expr(i.indpred, i.indrelid) as predicate,
    pg_catalog.array_agg(a.attname::text order by keys.ord) as columns
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c
    on c.oid = i.indexrelid
  cross join lateral pg_catalog.unnest(i.indkey) with ordinality as keys(attnum, ord)
  join pg_catalog.pg_attribute a
    on a.attrelid = i.indrelid
   and a.attnum = keys.attnum
  where i.indrelid in (
    'public.vote_rounds'::pg_catalog.regclass,
    'public.vote_parties'::pg_catalog.regclass
  )
  group by
    i.indexrelid,
    c.relname,
    i.indrelid,
    i.indisunique,
    i.indisvalid,
    i.indisready,
    i.indpred
),
required_indexes as (
  select
    exists (
      select 1
      from index_columns ic
      where ic.indrelid = 'public.vote_rounds'::pg_catalog.regclass
        and ic.indisunique
        and ic.indisvalid
        and ic.indisready
        and ic.columns = array['group_code']::text[]
        and pg_catalog.lower(coalesce(ic.predicate, '')) like '%is_active%'
        and pg_catalog.lower(coalesce(ic.predicate, '')) like '%true%'
    ) as active_round_per_group_uniqueness,
    exists (
      select 1
      from index_columns ic
      where ic.indrelid = 'public.vote_parties'::pg_catalog.regclass
        and ic.indisunique
        and ic.indisvalid
        and ic.indisready
        and (
          ic.columns = array['round_id', 'slug']::text[]
          or (
            ic.columns = array['round_id', 'group_code', 'slug']::text[]
            and pg_catalog.lower(coalesce(ic.predicate, '')) like '%round_id%'
            and pg_catalog.lower(coalesce(ic.predicate, '')) like '%is not null%'
          )
        )
    ) as round_party_slug_uniqueness_satisfied
),
party_schema as (
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'column_name', a.attname::text,
        'data_type', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'not_null', a.attnotnull,
        'default_expr', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
      )
      order by a.attnum
    ),
    '[]'::pg_catalog.jsonb
  ) as payload
  from pg_catalog.pg_attribute a
  left join pg_catalog.pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
    and a.attnum > 0
    and not a.attisdropped
),
party_round_stats as (
  select
    r.id as round_id,
    r.name as round_name,
    r.group_code,
    r.lifecycle_state,
    r.is_active,
    pg_catalog.count(p.round_id)::integer as parties_total,
    pg_catalog.count(*) filter (where p.enabled is true)::integer as enabled_parties,
    pg_catalog.count(distinct p.slug)::integer as distinct_slugs,
    pg_catalog.count(*) filter (where p.slug is null or pg_catalog.btrim(p.slug) = '')::integer as blank_slugs,
    pg_catalog.count(*) filter (where p.group_code is distinct from r.group_code)::integer as group_mismatches
  from public.vote_rounds r
  left join public.vote_parties p
    on p.round_id = r.id
  group by r.id, r.name, r.group_code, r.lifecycle_state, r.is_active
),
duplicate_round_slugs as (
  select
    p.round_id,
    pg_catalog.count(*)::integer as duplicate_slug_groups
  from (
    select p.round_id, p.slug
    from public.vote_parties p
    where p.round_id is not null
      and p.slug is not null
      and pg_catalog.btrim(p.slug) <> ''
    group by p.round_id, p.slug
    having pg_catalog.count(*) > 1
  ) p
  group by p.round_id
),
catalog_anomalies as (
  select pg_catalog.jsonb_build_object(
    'parties_with_round_id_null', (
      select pg_catalog.count(*)::integer
      from public.vote_parties p
      where p.round_id is null
    ),
    'parties_with_blank_slug', (
      select pg_catalog.count(*)::integer
      from public.vote_parties p
      where p.slug is null or pg_catalog.btrim(p.slug) = ''
    ),
    'parties_with_group_mismatch', (
      select pg_catalog.count(*)::integer
      from public.vote_parties p
      join public.vote_rounds r
        on r.id = p.round_id
      where p.group_code is distinct from r.group_code
    ),
    'duplicate_round_slug_groups', (
      select coalesce(pg_catalog.sum(d.duplicate_slug_groups), 0)::integer
      from duplicate_round_slugs d
    )
  ) as payload
),
eligible_source_rounds as (
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'round_id', s.round_id,
        'round_name', s.round_name,
        'group_code', s.group_code,
        'lifecycle_state', s.lifecycle_state,
        'is_active', s.is_active,
        'parties_total', s.parties_total,
        'enabled_parties', s.enabled_parties,
        'distinct_slugs', s.distinct_slugs
      )
      order by s.group_code, s.is_active desc, s.round_name
    ),
    '[]'::pg_catalog.jsonb
  ) as payload
  from party_round_stats s
  left join duplicate_round_slugs d
    on d.round_id = s.round_id
  where s.group_code ~ '^GRUPO[A-Z]$'
    and s.lifecycle_state in ('legacy', 'active', 'closed')
    and s.lifecycle_state <> 'draft'
    and s.parties_total > 0
    and s.enabled_parties > 0
    and s.blank_slugs = 0
    and s.group_mismatches = 0
    and coalesce(d.duplicate_slug_groups, 0) = 0
),
new_function as (
  select
    pg_catalog.to_regprocedure(
      'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)'
    ) as oid
),
function_definition as (
  select
    case
      when oid is null then null
      else pg_catalog.pg_get_functiondef(oid)
    end as definition
  from new_function
),
round1_status as (
  select (
    select pg_catalog.count(*) = 1
    from public.vote_rounds r
    where r.name = 'Ronda 1'
      and r.group_code = 'GRUPOB'
      and r.is_active = true
      and r.identity_mode = 'legacy_device'
      and r.lifecycle_state = 'legacy'
  ) and (
    select pg_catalog.count(*) = 1
    from public.vote_rounds r
    where r.group_code = 'GRUPOB'
      and r.is_active = true
  ) as ok
),
essential_objects as (
  select
    pg_catalog.to_regclass('public.vote_rounds') is not null
    and pg_catalog.to_regclass('public.vote_parties') is not null as ok
),
base_functions as (
  select
    pg_catalog.to_regprocedure('public.create_vote_round_draft(text,text,text,timestamp with time zone)') is not null
    and pg_catalog.to_regprocedure('public.activate_vote_round_draft(uuid)') is not null
    and pg_catalog.to_regprocedure('public.close_active_vote_round(uuid)') is not null as ok
),
catalog_ok as (
  select
    (catalog_anomalies.payload ->> 'parties_with_round_id_null')::integer = 0
    and (catalog_anomalies.payload ->> 'parties_with_blank_slug')::integer = 0
    and (catalog_anomalies.payload ->> 'parties_with_group_mismatch')::integer = 0
    and (catalog_anomalies.payload ->> 'duplicate_round_slug_groups')::integer = 0 as ok
  from catalog_anomalies
),
party_copy_shape as (
  select not exists (
    select 1
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d
      on d.adrelid = a.attrelid
     and d.adnum = a.attnum
    where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attnotnull
      and d.oid is null
      and a.attname not in (
        'slug',
        'name',
        'enabled',
        'position',
        'group_code',
        'round_id'
      )
  ) as ok
)
select
  'BSEC23D_PREFLIGHT_OK'::text as result,
  pg_catalog.statement_timestamp() as generated_at,
  round1_status.ok as round1_ok,
  essential_objects.ok as essential_objects_ok,
  base_functions.ok as base_functions_ok,
  (
    required_indexes.active_round_per_group_uniqueness
    and required_indexes.round_party_slug_uniqueness_satisfied
  ) as required_indexes_ok,
  party_schema.payload as party_schema,
  catalog_anomalies.payload as catalog_anomalies,
  eligible_source_rounds.payload as eligible_source_rounds,
  function_definition.definition as new_function_existing_definition,
  (
    round1_status.ok
    and essential_objects.ok
    and base_functions.ok
    and required_indexes.active_round_per_group_uniqueness
    and required_indexes.round_party_slug_uniqueness_satisfied
    and catalog_ok.ok
    and party_copy_shape.ok
    and (select oid is null from new_function)
  ) as safe_to_apply,
  true as manual_review_required,
  pg_catalog.jsonb_build_object(
    'source_policy', 'Only non-draft rounds with an associated, internally consistent party catalog are eligible.',
    'clone_columns_confirmed_locally', array['slug', 'name', 'enabled', 'position', 'group_code', 'round_id']::text[],
    'party_copy_shape_ok', party_copy_shape.ok,
    'no_party_ids_returned', true
  ) as notes
from round1_status
cross join essential_objects
cross join base_functions
cross join required_indexes
cross join party_schema
cross join catalog_anomalies
cross join eligible_source_rounds
cross join function_definition
cross join catalog_ok
cross join party_copy_shape;

rollback;

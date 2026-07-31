begin;
set transaction read only;

do $$
declare
  v_table text;
  v_column text;
begin
  foreach v_table in array array[
    'public.vote_rounds',
    'public.vote_parties',
    'public.vote_round_sessions',
    'public.vote_casts',
    'public.vote_intention_answers'
  ] loop
    if pg_catalog.to_regclass(v_table) is null then
      raise exception 'B-SEC-23C missing essential table: %', v_table;
    end if;
  end loop;

  foreach v_column in array array[
    'id',
    'name',
    'is_active',
    'created_at',
    'group_code',
    'identity_mode',
    'ends_at',
    'lifecycle_state'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23C missing essential column: public.vote_rounds.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'id',
    'slug',
    'name',
    'enabled',
    'position',
    'group_code',
    'round_id'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23C missing essential column: public.vote_parties.%', v_column;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'id'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'uuid'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23C incompatible type: public.vote_rounds.id must be uuid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'group_code'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'text'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23C incompatible type: public.vote_rounds.group_code must be text';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'is_active'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'boolean'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23C incompatible type: public.vote_rounds.is_active must be boolean';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'created_at'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23C incompatible type: public.vote_rounds.created_at must be timestamptz';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'ends_at'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23C incompatible type: public.vote_rounds.ends_at must be timestamptz';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
      and a.attname = 'round_id'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'uuid'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23C incompatible type: public.vote_parties.round_id must be uuid';
  end if;

  foreach v_column in array array['slug', 'name', 'group_code'] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
        and a.attname = v_column
        and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'text'
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23C incompatible type: public.vote_parties.% must be text', v_column;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_parties'::pg_catalog.regclass
      and a.attname = 'enabled'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'boolean'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23C incompatible type: public.vote_parties.enabled must be boolean';
  end if;

  if pg_catalog.to_regprocedure('public.activate_vote_round_draft(uuid)') is null then
    raise exception 'B-SEC-23C missing essential function: public.activate_vote_round_draft(uuid)';
  end if;
end $$;

with
duplicate_active_round_groups as (
  select
    r.group_code,
    count(*)::integer as active_rounds
  from public.vote_rounds r
  where r.is_active = true
  group by r.group_code
  having count(*) > 1
),
duplicate_party_keys as (
  select
    p.round_id,
    p.group_code,
    p.slug,
    count(*)::integer as duplicate_rows
  from public.vote_parties p
  where p.round_id is not null
  group by p.round_id, p.group_code, p.slug
  having count(*) > 1
),
null_or_blank_party_slugs as (
  select count(*)::integer as row_count
  from public.vote_parties p
  where p.round_id is not null
    and (p.slug is null or pg_catalog.btrim(p.slug) = '')
),
party_group_round_mismatches as (
  select
    p.round_id,
    p.group_code as party_group_code,
    r.group_code as round_group_code,
    count(*)::integer as mismatch_rows
  from public.vote_parties p
  join public.vote_rounds r
    on r.id = p.round_id
  where p.round_id is not null
    and p.group_code is distinct from r.group_code
  group by p.round_id, p.group_code, r.group_code
),
active_round_party_counts as (
  select
    r.id as round_id,
    r.group_code,
    r.name as round_name,
    r.identity_mode,
    r.lifecycle_state,
    count(p.id) filter (
      where p.round_id = r.id
        and p.group_code = r.group_code
        and p.enabled = true
    )::integer as enabled_parties_for_round
  from public.vote_rounds r
  left join public.vote_parties p
    on p.round_id = r.id
   and p.group_code = r.group_code
  where r.is_active = true
  group by r.id, r.group_code, r.name, r.identity_mode, r.lifecycle_state
),
round1_check as (
  select
    count(*) = 1
    and (
      select count(*)
      from public.vote_rounds active_b
      where active_b.group_code = 'GRUPOB'
        and active_b.is_active = true
    ) = 1 as round1_ok
  from public.vote_rounds r
  where r.name = 'Ronda 1'
    and r.group_code = 'GRUPOB'
    and r.is_active = true
    and r.identity_mode = 'legacy_device'
    and r.lifecycle_state = 'legacy'
),
round_index_rows as (
  select
    c.relname as index_name,
    i.indisunique as is_unique,
    pg_catalog.pg_get_indexdef(i.indexrelid) as index_definition
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c
    on c.oid = i.indexrelid
  where i.indrelid = 'public.vote_rounds'::pg_catalog.regclass
),
party_index_rows as (
  select
    c.relname as index_name,
    i.indisunique as is_unique,
    pg_catalog.pg_get_indexdef(i.indexrelid) as index_definition
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c
    on c.oid = i.indexrelid
  where i.indrelid = 'public.vote_parties'::pg_catalog.regclass
),
round_index_equivalent as (
  select exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.vote_rounds'::pg_catalog.regclass
      and i.indisunique
      and i.indpred is not null
      and (
        select array_agg(a.attname::text order by keys.ord)
        from pg_catalog.unnest(i.indkey) with ordinality as keys(attnum, ord)
        join pg_catalog.pg_attribute a
          on a.attrelid = i.indrelid
         and a.attnum = keys.attnum
      ) = array['group_code']::text[]
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) ~* 'is_active'
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) ~* 'true'
  ) as exists_equivalent
),
party_uniqueness_satisfied as (
  select exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.vote_parties'::pg_catalog.regclass
      and i.indisunique
      and (
        select array_agg(a.attname::text order by keys.ord)
        from pg_catalog.unnest(i.indkey) with ordinality as keys(attnum, ord)
        join pg_catalog.pg_attribute a
          on a.attrelid = i.indrelid
         and a.attnum = keys.attnum
      ) = array['round_id', 'slug']::text[]
      and i.indisvalid
      and i.indisready
  )
  or exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.vote_parties'::pg_catalog.regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and i.indpred is not null
      and (
        select array_agg(a.attname::text order by keys.ord)
        from pg_catalog.unnest(i.indkey) with ordinality as keys(attnum, ord)
        join pg_catalog.pg_attribute a
          on a.attrelid = i.indrelid
         and a.attnum = keys.attnum
      ) = array['round_id', 'group_code', 'slug']::text[]
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) ~* 'round_id'
      and pg_catalog.pg_get_expr(i.indpred, i.indrelid) ~* 'not null'
  ) as is_satisfied
),
summary as (
  select
    not exists (select 1 from duplicate_active_round_groups)
    and not exists (select 1 from duplicate_party_keys)
    and not exists (select 1 from party_group_round_mismatches)
    and (select row_count from null_or_blank_party_slugs) = 0
    and (select round1_ok from round1_check) as safe_to_apply
)
select
  'BSEC23C_PREFLIGHT_OK'::text as result,
  pg_catalog.statement_timestamp() as generated_at,
  (select round1_ok from round1_check) as round1_ok,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'group_code', group_code,
          'active_rounds', active_rounds
        )
        order by group_code
      )
      from duplicate_active_round_groups
    ),
    '[]'::jsonb
  ) as duplicate_active_round_groups,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'round_id', round_id,
          'group_code', group_code,
          'slug', slug,
          'duplicate_rows', duplicate_rows
        )
        order by group_code, slug
      )
      from duplicate_party_keys
    ),
    '[]'::jsonb
  ) as duplicate_party_keys,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'round_id', round_id,
          'party_group_code', party_group_code,
          'round_group_code', round_group_code,
          'mismatch_rows', mismatch_rows
        )
        order by round_group_code, party_group_code
      )
      from party_group_round_mismatches
    ),
    '[]'::jsonb
  ) as party_group_round_mismatches,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'round_id', round_id,
          'group_code', group_code,
          'round_name', round_name,
          'identity_mode', identity_mode,
          'lifecycle_state', lifecycle_state,
          'enabled_parties_for_round', enabled_parties_for_round
        )
        order by group_code, round_name
      )
      from active_round_party_counts
    ),
    '[]'::jsonb
  ) as active_round_party_counts,
  pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.activate_vote_round_draft(uuid)')
  ) as activation_function_definition,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'index_name', index_name,
          'is_unique', is_unique,
          'index_definition', index_definition
        )
        order by index_name
      )
      from round_index_rows
    ),
    '[]'::jsonb
  ) as existing_round_indexes,
  coalesce(
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'index_name', index_name,
          'is_unique', is_unique,
          'index_definition', index_definition
        )
        order by index_name
      )
      from party_index_rows
    ),
    '[]'::jsonb
  ) as existing_party_indexes,
  (select safe_to_apply from summary) as safe_to_apply,
  true as manual_review_required,
  pg_catalog.jsonb_build_object(
    'null_or_blank_party_slugs_for_rounds',
    (select row_count from null_or_blank_party_slugs),
    'one_active_round_index_exists',
    (select exists_equivalent from round_index_equivalent),
    'round_party_slug_uniqueness_satisfied',
    (select is_satisfied from party_uniqueness_satisfied),
    'messages',
    pg_catalog.jsonb_build_array(
      'No devuelve party_id, device_id, tokens, hashes ni cookies.',
      'safe_to_apply exige que no haya multiples rondas activas por grupo, claves de partido duplicadas, mismatches grupo/ronda ni slugs vacios asociados a ronda.',
      'GRUPOA, GRUPOD y GRUPOE pueden tener cero partidos habilitados porque son rondas legacy activas sin catalogo.'
    )
  ) as notes;

rollback;

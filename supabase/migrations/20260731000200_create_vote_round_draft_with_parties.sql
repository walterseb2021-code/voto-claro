begin;

do $$
declare
  v_missing text[] := array[]::text[];
  v_round_party_uniqueness_satisfied boolean;
  v_active_round_uniqueness_satisfied boolean;
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
    raise exception 'B-SEC-23D missing required object(s): %', pg_catalog.array_to_string(v_missing, ', ');
  end if;

  if pg_catalog.to_regprocedure(
    'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)'
  ) is not null then
    raise exception 'B-SEC-23D function already exists: public.create_vote_round_draft_with_parties(text,text,text,timestamptz,uuid)';
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

  if exists (
    select 1
    from pg_catalog.unnest(array['group_code', 'name', 'identity_mode', 'lifecycle_state']::text[]) as required_column(attname)
    where not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
        and a.attname = required_column.attname
        and a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
        and not a.attisdropped
    )
  ) then
    raise exception 'B-SEC-23D incompatible type: public.vote_rounds text columns are required';
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

  if exists (
    select 1
    from pg_catalog.unnest(array['created_at', 'ends_at', 'activated_at', 'closed_at']::text[]) as required_column(attname)
    where not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
        and a.attname = required_column.attname
        and a.atttypid = 'pg_catalog.timestamptz'::pg_catalog.regtype
        and not a.attisdropped
    )
  ) then
    raise exception 'B-SEC-23D incompatible type: public.vote_rounds timestamp columns must be timestamptz';
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

  with index_columns as (
    select
      i.indexrelid,
      i.indrelid,
      i.indisunique,
      i.indisvalid,
      i.indisready,
      pg_catalog.pg_get_expr(i.indpred, i.indrelid) as predicate,
      pg_catalog.array_agg(a.attname::text order by keys.ord) as columns
    from pg_catalog.pg_index i
    cross join lateral pg_catalog.unnest(i.indkey) with ordinality as keys(attnum, ord)
    join pg_catalog.pg_attribute a
      on a.attrelid = i.indrelid
     and a.attnum = keys.attnum
    where i.indrelid in (
      'public.vote_rounds'::pg_catalog.regclass,
      'public.vote_parties'::pg_catalog.regclass
    )
    group by i.indexrelid, i.indrelid, i.indisunique, i.indisvalid, i.indisready, i.indpred
  )
  select
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
    ),
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
    )
    into v_round_party_uniqueness_satisfied, v_active_round_uniqueness_satisfied;

  if not v_round_party_uniqueness_satisfied then
    raise exception 'B-SEC-23D missing required round party slug uniqueness';
  end if;

  if not v_active_round_uniqueness_satisfied then
    raise exception 'B-SEC-23D missing required active round uniqueness';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id is null
  ) then
    raise exception 'B-SEC-23D catalog anomaly: vote_parties.round_id is null';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.slug is null or pg_catalog.btrim(p.slug) = ''
  ) then
    raise exception 'B-SEC-23D catalog anomaly: vote_parties.slug is blank';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    join public.vote_rounds r
      on r.id = p.round_id
    where p.group_code is distinct from r.group_code
  ) then
    raise exception 'B-SEC-23D catalog anomaly: vote_parties.group_code mismatches vote_rounds.group_code';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id is not null
    group by p.round_id, p.slug
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'B-SEC-23D catalog anomaly: duplicate vote_parties slug per round_id';
  end if;
end;
$$;

create function public.create_vote_round_draft_with_parties(
  p_name text,
  p_group_code text,
  p_identity_mode text,
  p_ends_at timestamptz,
  p_source_round_id uuid
)
returns table (
  id uuid,
  name text,
  group_code text,
  identity_mode text,
  ends_at timestamptz,
  is_active boolean,
  lifecycle_state text,
  created_at timestamptz,
  activated_at timestamptz,
  closed_at timestamptz,
  parties_copied integer,
  enabled_parties_copied integer,
  source_round_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_group_code text := pg_catalog.btrim(p_group_code);
  v_source public.vote_rounds%rowtype;
  v_new_id uuid;
  v_new_name text;
  v_new_group_code text;
  v_new_identity_mode text;
  v_new_ends_at timestamptz;
  v_new_is_active boolean;
  v_new_lifecycle_state text;
  v_new_created_at timestamptz;
  v_new_activated_at timestamptz;
  v_new_closed_at timestamptz;
  v_source_total integer;
  v_source_enabled integer;
  v_source_distinct_slugs integer;
  v_inserted integer;
  v_copied_total integer;
  v_copied_enabled integer;
  v_copied_distinct_slugs integer;
begin
  if v_group_code is null or v_group_code !~ '^GRUPO[A-Z]$' then
    raise exception 'vote_round_group_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voto-claro:vote-round:' || v_group_code, 0)
  );

  select r.*
    into v_source
  from public.vote_rounds r
  where r.id = p_source_round_id
  for update;

  if not found then
    raise exception 'vote_round_source_not_found';
  end if;

  if v_source.group_code is distinct from v_group_code then
    raise exception 'vote_round_source_group_mismatch';
  end if;

  if v_source.lifecycle_state not in ('legacy', 'active', 'closed') then
    raise exception 'vote_round_source_state_invalid';
  end if;

  perform 1
  from public.vote_parties p
  where p.round_id = p_source_round_id
  for share;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where p.enabled is true)::integer,
    pg_catalog.count(distinct p.slug)::integer
    into v_source_total, v_source_enabled, v_source_distinct_slugs
  from public.vote_parties p
  where p.round_id = p_source_round_id;

  if v_source_total <= 0 or v_source_enabled <= 0 then
    raise exception 'vote_round_party_catalog_unavailable';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_source_round_id
      and (p.slug is null or pg_catalog.btrim(p.slug) = '')
  ) then
    raise exception 'vote_round_party_slug_invalid';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_source_round_id
      and p.group_code is distinct from v_group_code
  ) then
    raise exception 'vote_round_party_group_mismatch';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_source_round_id
    group by p.slug
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'vote_round_party_slug_duplicate';
  end if;

  if v_source_distinct_slugs <> v_source_total then
    raise exception 'vote_round_party_slug_duplicate';
  end if;

  select
    created.id,
    created.name,
    created.group_code,
    created.identity_mode,
    created.ends_at,
    created.is_active,
    created.lifecycle_state,
    created.created_at,
    created.activated_at,
    created.closed_at
    into
      v_new_id,
      v_new_name,
      v_new_group_code,
      v_new_identity_mode,
      v_new_ends_at,
      v_new_is_active,
      v_new_lifecycle_state,
      v_new_created_at,
      v_new_activated_at,
      v_new_closed_at
  from public.create_vote_round_draft(
    p_name,
    v_group_code,
    p_identity_mode,
    p_ends_at
  ) created;

  if v_new_id is null then
    raise exception 'vote_round_create_failed';
  end if;

  if v_new_group_code is distinct from v_group_code then
    raise exception 'vote_round_create_failed';
  end if;

  if v_new_lifecycle_state <> 'draft' or v_new_is_active <> false then
    raise exception 'vote_round_create_failed';
  end if;

  insert into public.vote_parties (
    slug,
    name,
    enabled,
    position,
    group_code,
    round_id
  )
  select
    p.slug,
    p.name,
    p.enabled,
    p.position,
    v_group_code,
    v_new_id
  from public.vote_parties p
  where p.round_id = p_source_round_id
  order by p.position nulls last, p.slug;

  get diagnostics v_inserted = row_count;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where p.enabled is true)::integer,
    pg_catalog.count(distinct p.slug)::integer
    into v_copied_total, v_copied_enabled, v_copied_distinct_slugs
  from public.vote_parties p
  where p.round_id = v_new_id
    and p.group_code = v_group_code;

  if
    v_inserted <> v_source_total
    or v_copied_total <> v_source_total
    or v_copied_enabled <> v_source_enabled
    or v_copied_enabled <= 0
    or v_copied_distinct_slugs <> v_source_distinct_slugs
  then
    raise exception 'vote_round_party_copy_failed';
  end if;

  return query
  select
    v_new_id,
    v_new_name,
    v_new_group_code,
    v_new_identity_mode,
    v_new_ends_at,
    v_new_is_active,
    v_new_lifecycle_state,
    v_new_created_at,
    v_new_activated_at,
    v_new_closed_at,
    v_copied_total,
    v_copied_enabled,
    p_source_round_id;
end;
$$;

revoke all privileges on function public.create_vote_round_draft_with_parties(text, text, text, timestamptz, uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.create_vote_round_draft_with_parties(text, text, text, timestamptz, uuid)
  to service_role;

do $$
declare
  v_public_execute boolean;
begin
  if pg_catalog.to_regprocedure(
    'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)'
  ) is null then
    raise exception 'B-SEC-23D missing created function: public.create_vote_round_draft_with_parties';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure(
      'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)'
    )
      and p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog']::text[]
  ) then
    raise exception 'B-SEC-23D function must be SECURITY DEFINER with search_path pg_catalog';
  end if;

  select exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = pg_catalog.to_regprocedure(
      'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)'
    )
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  )
    into v_public_execute;

  if v_public_execute then
    raise exception 'B-SEC-23D unexpected PUBLIC execute privilege on create_vote_round_draft_with_parties';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)',
    'EXECUTE'
  ) then
    raise exception 'B-SEC-23D unexpected anon execute privilege on create_vote_round_draft_with_parties';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)',
    'EXECUTE'
  ) then
    raise exception 'B-SEC-23D unexpected authenticated execute privilege on create_vote_round_draft_with_parties';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)',
    'EXECUTE'
  ) then
    raise exception 'B-SEC-23D service_role lacks execute privilege on create_vote_round_draft_with_parties';
  end if;
end;
$$;

commit;

begin;

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
      raise exception 'B-SEC-23C missing required table: %', v_table;
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
    'lifecycle_state',
    'activated_at',
    'closed_at'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23C missing required public.vote_rounds column: %', v_column;
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
      raise exception 'B-SEC-23C missing required public.vote_parties column: %', v_column;
    end if;
  end loop;

  if pg_catalog.to_regprocedure('public.activate_vote_round_draft(uuid)') is null then
    raise exception 'B-SEC-23C missing required function: public.activate_vote_round_draft(uuid)';
  end if;

  if exists (
    select 1
    from public.vote_rounds r
    where r.is_active = true
    group by r.group_code
    having count(*) > 1
  ) then
    raise exception 'B-SEC-23C active vote round invariant violation';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id is not null
    group by p.round_id, p.group_code, p.slug
    having count(*) > 1
  ) then
    raise exception 'B-SEC-23C vote party key invariant violation';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id is not null
      and (p.slug is null or pg_catalog.btrim(p.slug) = '')
    limit 1
  ) then
    raise exception 'B-SEC-23C vote party slug invariant violation';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    join public.vote_rounds r
      on r.id = p.round_id
    where p.round_id is not null
      and p.group_code is distinct from r.group_code
    limit 1
  ) then
    raise exception 'B-SEC-23C vote party group invariant violation';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vote_rounds_one_active_per_group_uniq'
  )
  and not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c
      on c.oid = i.indexrelid
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vote_rounds_one_active_per_group_uniq'
      and i.indrelid = 'public.vote_rounds'::pg_catalog.regclass
      and i.indisunique
      and i.indpred is not null
  ) then
    raise exception 'B-SEC-23C unexpected existing index name: vote_rounds_one_active_per_group_uniq';
  end if;

  if not exists (
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
  ) then
    execute
      'create unique index vote_rounds_one_active_per_group_uniq ' ||
      'on public.vote_rounds (group_code) where is_active = true';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vote_parties_round_group_slug_uniq'
  )
  and not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c
      on c.oid = i.indexrelid
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vote_parties_round_group_slug_uniq'
      and i.indrelid = 'public.vote_parties'::pg_catalog.regclass
      and i.indisunique
      and i.indpred is not null
  ) then
    raise exception 'B-SEC-23C unexpected existing index name: vote_parties_round_group_slug_uniq';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.vote_parties'::pg_catalog.regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and (
        select array_agg(a.attname::text order by keys.ord)
        from pg_catalog.unnest(i.indkey) with ordinality as keys(attnum, ord)
        join pg_catalog.pg_attribute a
          on a.attrelid = i.indrelid
         and a.attnum = keys.attnum
      ) = array['round_id', 'slug']::text[]
  )
  and not exists (
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
  ) then
    execute
      'create unique index vote_parties_round_group_slug_uniq ' ||
      'on public.vote_parties (round_id, group_code, slug) ' ||
      'where round_id is not null';
  end if;
end $$;

create or replace function public.activate_vote_round_draft(
  p_round_id uuid
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
  closed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_round public.vote_rounds%rowtype;
  v_group_code text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  select r.*
    into v_round
  from public.vote_rounds r
  where r.id = p_round_id;

  if not found then
    raise exception 'vote_round_not_found';
  end if;

  v_group_code := v_round.group_code;

  if v_group_code is null or v_group_code !~ '^GRUPO[A-Z]$' then
    raise exception 'vote_round_group_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voto-claro:vote-round:' || v_group_code, 0)
  );

  select r.*
    into v_round
  from public.vote_rounds r
  where r.id = p_round_id
  for update;

  if not found then
    raise exception 'vote_round_not_found';
  end if;

  if v_round.group_code is distinct from v_group_code then
    raise exception 'vote_round_group_invalid';
  end if;

  perform 1
  from public.vote_rounds r
  where r.group_code = v_group_code
    and r.is_active = true
  for update;

  if v_round.lifecycle_state <> 'draft' then
    raise exception 'vote_round_not_draft';
  end if;

  if v_round.is_active <> false then
    raise exception 'vote_round_state_invalid';
  end if;

  if v_round.identity_mode not in ('legacy_device', 'secure_session') then
    raise exception 'vote_round_identity_mode_invalid';
  end if;

  if v_round.identity_mode = 'legacy_device' and v_round.ends_at is not null then
    raise exception 'vote_round_ends_at_invalid';
  end if;

  if v_round.identity_mode = 'secure_session' then
    if v_round.ends_at is null or v_round.ends_at <= v_now or v_round.ends_at <= v_round.created_at then
      raise exception 'vote_round_ends_at_invalid';
    end if;
  end if;

  if exists (
    select 1
    from public.vote_round_sessions s
    where s.round_id = p_round_id
    limit 1
  ) then
    raise exception 'vote_round_has_sessions';
  end if;

  if exists (
    select 1
    from public.vote_casts c
    where c.round_id = p_round_id
    limit 1
  ) then
    raise exception 'vote_round_has_casts';
  end if;

  if exists (
    select 1
    from public.vote_intention_answers a
    where a.round_id = p_round_id
    limit 1
  ) then
    raise exception 'vote_round_has_answers';
  end if;

  if not exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_round_id
      and p.group_code = v_group_code
      and p.enabled = true
    limit 1
  ) then
    raise exception 'vote_round_party_catalog_unavailable';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_round_id
      and p.group_code is distinct from v_group_code
    limit 1
  ) then
    raise exception 'vote_round_party_catalog_invalid';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_round_id
      and (p.slug is null or pg_catalog.btrim(p.slug) = '')
    limit 1
  ) then
    raise exception 'vote_round_party_catalog_invalid';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_round_id
    group by p.round_id, p.group_code, p.slug
    having count(*) > 1
  ) then
    raise exception 'vote_round_party_catalog_invalid';
  end if;

  with deactivated as (
    update public.vote_rounds r
       set is_active = false,
           lifecycle_state = case
             when r.lifecycle_state = 'active' then 'closed'
             else r.lifecycle_state
           end,
           closed_at = case
             when r.lifecycle_state = 'active' then v_now
             else r.closed_at
           end
     where r.group_code = v_group_code
       and r.is_active = true
       and r.id <> p_round_id
     returning r.id
  )
  update public.vote_round_sessions s
     set revoked_at = v_now
    from deactivated d
   where s.round_id = d.id
     and s.revoked_at is null;

  update public.vote_rounds r
     set is_active = true,
         lifecycle_state = 'active',
         activated_at = v_now,
         closed_at = null
   where r.id = p_round_id;

  return query
  select
    r.id,
    r.name::text,
    r.group_code::text,
    r.identity_mode::text,
    r.ends_at,
    r.is_active,
    r.lifecycle_state::text,
    r.created_at,
    r.activated_at,
    r.closed_at
  from public.vote_rounds r
  where r.id = p_round_id;
end;
$$;

revoke all privileges on function public.activate_vote_round_draft(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.activate_vote_round_draft(uuid)
  to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c
      on c.oid = i.indexrelid
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vote_rounds_one_active_per_group_uniq'
      and i.indrelid = 'public.vote_rounds'::pg_catalog.regclass
      and i.indisunique
      and i.indpred is not null
  ) then
    raise exception 'B-SEC-23C expected index is missing: vote_rounds_one_active_per_group_uniq';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.vote_parties'::pg_catalog.regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and (
        select array_agg(a.attname::text order by keys.ord)
        from pg_catalog.unnest(i.indkey) with ordinality as keys(attnum, ord)
        join pg_catalog.pg_attribute a
          on a.attrelid = i.indrelid
         and a.attnum = keys.attnum
      ) = array['round_id', 'slug']::text[]
  )
  and not exists (
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
  ) then
    raise exception 'B-SEC-23C expected vote party uniqueness protection is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure('public.activate_vote_round_draft(uuid)')
      and p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog']
  ) then
    raise exception 'B-SEC-23C expected hardened activate_vote_round_draft(uuid)';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = pg_catalog.to_regprocedure('public.activate_vote_round_draft(uuid)')
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'B-SEC-23C unexpected PUBLIC execute privilege on activate_vote_round_draft(uuid)';
  end if;

  if pg_catalog.has_function_privilege('anon', 'public.activate_vote_round_draft(uuid)', 'EXECUTE') then
    raise exception 'B-SEC-23C unexpected anon execute privilege on activate_vote_round_draft(uuid)';
  end if;

  if pg_catalog.has_function_privilege('authenticated', 'public.activate_vote_round_draft(uuid)', 'EXECUTE') then
    raise exception 'B-SEC-23C unexpected authenticated execute privilege on activate_vote_round_draft(uuid)';
  end if;

  if not pg_catalog.has_function_privilege('service_role', 'public.activate_vote_round_draft(uuid)', 'EXECUTE') then
    raise exception 'B-SEC-23C service_role lacks execute privilege on activate_vote_round_draft(uuid)';
  end if;
end $$;

commit;

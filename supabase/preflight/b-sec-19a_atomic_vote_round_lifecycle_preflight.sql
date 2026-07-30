begin;

-- B-SEC-19A preflight: read-only validation for non-disruptive vote round
-- lifecycle columns and atomic RPC creation.

do $$
declare
  v_column text;
  v_table text;
  v_function text;
  v_constraint text;
  v_count bigint;
  v_relrowsecurity boolean;
  v_required_tables text[] := array[
    'public.vote_rounds',
    'public.vote_round_sessions',
    'public.vote_casts',
    'public.vote_intention_answers'
  ];
begin
  foreach v_table in array v_required_tables loop
    if pg_catalog.to_regclass(v_table) is null then
      raise exception 'Required table is missing: %', v_table;
    end if;
  end loop;

  foreach v_column in array array['id', 'name', 'is_active', 'created_at', 'group_code', 'identity_mode', 'ends_at'] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'Required public.vote_rounds column is missing: %', v_column;
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
    raise exception 'public.vote_rounds.id must be uuid';
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
    raise exception 'public.vote_rounds.is_active must be boolean';
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
    raise exception 'public.vote_rounds.created_at must be timestamptz';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'identity_mode'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'text'
      and a.attnotnull
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_rounds.identity_mode must be text not null';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'ends_at'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone'
      and not a.attnotnull
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_rounds.ends_at must be nullable timestamptz';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'starts_at'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_rounds.starts_at must not exist for B-SEC-19A';
  end if;

  foreach v_column in array array['lifecycle_state', 'activated_at', 'closed_at'] loop
    if exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'public.vote_rounds.% already exists before B-SEC-19A', v_column;
    end if;
  end loop;

  foreach v_constraint in array array[
    'vote_rounds_lifecycle_state_chk',
    'vote_rounds_lifecycle_managed_state_chk'
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.vote_rounds'::pg_catalog.regclass
        and c.conname = v_constraint
    ) then
      raise exception 'B-SEC-19A constraint already exists: %', v_constraint;
    end if;
  end loop;

  foreach v_constraint in array array[
    'vote_rounds_identity_mode_chk',
    'vote_rounds_secure_session_ends_at_chk',
    'vote_rounds_ends_at_after_created_chk'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.vote_rounds'::pg_catalog.regclass
        and c.conname = v_constraint
        and c.contype = 'c'
        and c.convalidated
    ) then
      raise exception 'Expected validated CHECK constraint on public.vote_rounds: %', v_constraint;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_class idx
    join pg_catalog.pg_index i
      on i.indexrelid = idx.oid
    where i.indrelid = 'public.vote_rounds'::pg_catalog.regclass
      and i.indisunique
      and i.indpred is not null
      and pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_indexdef(i.indexrelid)), 'group_code') > 0
      and pg_catalog.strpos(pg_catalog.lower(pg_catalog.pg_get_expr(i.indpred, i.indrelid)), 'is_active') > 0
  ) then
    raise exception 'A partial unique active-round index already exists on public.vote_rounds';
  end if;

  select count(*)
    into v_count
  from (
    select group_code
    from public.vote_rounds
    where is_active = true
    group by group_code
    having count(*) > 1
  ) active_groups;

  if v_count <> 0 then
    raise exception 'More than one active vote round exists for at least one group';
  end if;

  if exists (
    select 1
    from public.vote_rounds
    where is_active = true
      and (group_code is null or group_code !~ '^GRUPO[A-Z]$')
  ) then
    raise exception 'Active vote round has invalid group_code';
  end if;

  if exists (
    select 1
    from public.vote_rounds
    where identity_mode not in ('legacy_device', 'secure_session')
  ) then
    raise exception 'Existing vote round has invalid identity_mode';
  end if;

  if exists (
    select 1
    from public.vote_rounds
    where identity_mode = 'secure_session'
      and ends_at is null
  ) then
    raise exception 'Existing secure_session vote round is missing ends_at';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.proname = 'gen_random_uuid'
  ) then
    raise exception 'Required UUID generator gen_random_uuid() is not available';
  end if;

  foreach v_column in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (
      select 1
      from pg_catalog.pg_roles r
      where r.rolname = v_column
    ) then
      raise exception 'Required role is missing: %', v_column;
    end if;
  end loop;

  select c.relrowsecurity
    into v_relrowsecurity
  from pg_catalog.pg_class c
  where c.oid = 'public.vote_rounds'::pg_catalog.regclass;

  if not coalesce(v_relrowsecurity, false) then
    raise exception 'Expected RLS to remain enabled on public.vote_rounds';
  end if;

  foreach v_function in array array[
    'create_vote_round_draft',
    'activate_vote_round_draft',
    'close_active_vote_round'
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n
        on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = v_function
    ) then
      raise exception 'B-SEC-19A function already exists: public.%', v_function;
    end if;
  end loop;
end $$;

select 'BSEC19A_PREFLIGHT_OK'::text as result;

rollback;

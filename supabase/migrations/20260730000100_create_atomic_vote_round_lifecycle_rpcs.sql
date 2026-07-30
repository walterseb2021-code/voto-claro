begin;

-- B-SEC-19A: non-disruptive lifecycle metadata and atomic vote round RPCs.
-- Existing rows remain legacy. The current admin endpoint can continue to
-- insert active legacy rows until it is migrated to these RPCs.
--
-- Do not add a partial unique active-round index in this phase. That index
-- will be added later, after the admin endpoint exclusively uses the atomic
-- RPCs below.

do $$
declare
  v_column text;
  v_constraint text;
  v_function text;
  v_required_tables text[] := array[
    'public.vote_rounds',
    'public.vote_round_sessions',
    'public.vote_casts',
    'public.vote_intention_answers'
  ];
begin
  foreach v_column in array v_required_tables loop
    if pg_catalog.to_regclass(v_column) is null then
      raise exception 'Required table is missing: %', v_column;
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

  foreach v_column in array array['lifecycle_state', 'activated_at', 'closed_at', 'starts_at'] loop
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
      raise exception 'B-SEC-19A constraint name already exists: %', v_constraint;
    end if;
  end loop;

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
      raise exception 'B-SEC-19A function name already exists: public.%', v_function;
    end if;
  end loop;
end $$;

alter table public.vote_rounds
  add column lifecycle_state text not null default 'legacy',
  add column activated_at timestamptz null,
  add column closed_at timestamptz null,
  add constraint vote_rounds_lifecycle_state_chk
    check (lifecycle_state in ('legacy', 'draft', 'active', 'closed')),
  add constraint vote_rounds_lifecycle_managed_state_chk
    check (
      lifecycle_state = 'legacy'
      or (
        lifecycle_state = 'draft'
        and is_active = false
        and activated_at is null
        and closed_at is null
      )
      or (
        lifecycle_state = 'active'
        and is_active = true
        and activated_at is not null
        and activated_at >= created_at
        and closed_at is null
      )
      or (
        lifecycle_state = 'closed'
        and is_active = false
        and activated_at is not null
        and activated_at >= created_at
        and closed_at is not null
        and closed_at >= activated_at
      )
    );

create function public.create_vote_round_draft(
  p_name text,
  p_group_code text,
  p_identity_mode text,
  p_ends_at timestamptz
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
  v_name text := pg_catalog.btrim(p_name);
  v_group_code text := pg_catalog.btrim(p_group_code);
  v_identity_mode text := pg_catalog.btrim(p_identity_mode);
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 160 then
    raise exception 'vote_round_name_invalid';
  end if;

  if v_group_code is null or v_group_code !~ '^GRUPO[A-Z]$' then
    raise exception 'vote_round_group_invalid';
  end if;

  if v_identity_mode is null or v_identity_mode not in ('legacy_device', 'secure_session') then
    raise exception 'vote_round_identity_mode_invalid';
  end if;

  if v_identity_mode = 'legacy_device' and p_ends_at is not null then
    raise exception 'vote_round_ends_at_invalid';
  end if;

  if v_identity_mode = 'secure_session' then
    if p_ends_at is null or p_ends_at <= v_now then
      raise exception 'vote_round_ends_at_invalid';
    end if;
  end if;

  return query
  with inserted as (
    insert into public.vote_rounds (
      name,
      group_code,
      identity_mode,
      ends_at,
      is_active,
      lifecycle_state,
      activated_at,
      closed_at
    )
    values (
      v_name,
      v_group_code,
      v_identity_mode,
      p_ends_at,
      false,
      'draft',
      null,
      null
    )
    returning *
  )
  select
    i.id,
    i.name::text,
    i.group_code::text,
    i.identity_mode::text,
    i.ends_at,
    i.is_active,
    i.lifecycle_state::text,
    i.created_at,
    i.activated_at,
    i.closed_at
  from inserted i;
end;
$$;

create function public.activate_vote_round_draft(
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

create function public.close_active_vote_round(
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

  if v_round.is_active is distinct from true then
    raise exception 'vote_round_not_active';
  end if;

  if v_round.lifecycle_state = 'active' then
    update public.vote_rounds r
       set is_active = false,
           lifecycle_state = 'closed',
           closed_at = v_now
     where r.id = p_round_id;
  elsif v_round.lifecycle_state = 'legacy' then
    update public.vote_rounds r
       set is_active = false
     where r.id = p_round_id;
  else
    raise exception 'vote_round_state_invalid';
  end if;

  update public.vote_round_sessions s
     set revoked_at = v_now
   where s.round_id = p_round_id
     and s.revoked_at is null;

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

revoke all privileges on function public.create_vote_round_draft(text, text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.activate_vote_round_draft(uuid)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.close_active_vote_round(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.create_vote_round_draft(text, text, text, timestamptz)
  to service_role;
grant execute on function public.activate_vote_round_draft(uuid)
  to service_role;
grant execute on function public.close_active_vote_round(uuid)
  to service_role;

do $$
declare
  v_constraint text;
  v_role text;
  v_has_privilege boolean;
  v_signature text;
  v_checked_roles text[] := array['anon', 'authenticated'];
  v_signatures text[] := array[
    'public.create_vote_round_draft(text,text,text,timestamp with time zone)',
    'public.activate_vote_round_draft(uuid)',
    'public.close_active_vote_round(uuid)'
  ];
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'lifecycle_state'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'text'
      and a.attnotnull
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'Expected public.vote_rounds.lifecycle_state to be text not null';
  end if;

  foreach v_constraint in array array[
    'vote_rounds_lifecycle_state_chk',
    'vote_rounds_lifecycle_managed_state_chk'
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

  foreach v_signature in array v_signatures loop
    if pg_catalog.to_regprocedure(v_signature) is null then
      raise exception 'Expected function is missing: %', v_signature;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure(v_signature)
        and p.prosecdef
        and p.proconfig @> array['search_path=pg_catalog']
    ) then
      raise exception 'Expected SECURITY DEFINER function with hardened search_path: %', v_signature;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_proc p
      cross join lateral pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      where p.oid = pg_catalog.to_regprocedure(v_signature)
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'Unexpected EXECUTE privilege remains for PUBLIC on function %', v_signature;
    end if;

    foreach v_role in array v_checked_roles loop
      if pg_catalog.has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception 'Unexpected EXECUTE privilege remains for role % on function %', v_role, v_signature;
      end if;
    end loop;

    v_has_privilege := pg_catalog.has_function_privilege('service_role', v_signature, 'EXECUTE');
    if not v_has_privilege then
      raise exception 'service_role lacks required EXECUTE privilege on function %', v_signature;
    end if;
  end loop;
end $$;

commit;

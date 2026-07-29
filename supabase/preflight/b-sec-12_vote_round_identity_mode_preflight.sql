begin;

-- B-SEC-12: Add durable per-round identity mode and secure-round closing time.
-- This migration keeps every existing and newly inserted round in legacy mode
-- until a later application phase explicitly supports secure rounds.

do $$
declare
  v_column text;
  v_constraint text;
  v_policy_count integer;
  v_relrowsecurity boolean;
  v_relforcerowsecurity boolean;
  v_public_acl_details text;
  v_role text;
  v_privilege text;
  v_has_privilege boolean;
  v_should_have_privilege boolean;
  v_default_expr text;
  v_count bigint;
  v_vote_rounds_index_count_before integer;
  v_vote_rounds_index_count_after integer;
  v_vote_rounds_trigger_count_before integer;
  v_vote_rounds_trigger_count_after integer;
  v_public_function_count_before integer;
  v_public_function_count_after integer;
  v_table_privileges text[] := array[
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN'
  ];
  v_browser_roles text[] := array['anon', 'authenticated'];
begin
  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vote_rounds'
      and c.relkind = 'r'
  ) then
    raise exception 'Required ordinary table is missing: public.vote_rounds';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'vote_round_sessions'
      and c.relkind = 'r'
  ) then
    raise exception 'Required B-SEC-10 table is missing: public.vote_round_sessions';
  end if;

  foreach v_column in array array['id', 'created_at', 'is_active', 'group_code'] loop
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
      and a.attname = 'created_at'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_rounds.created_at must be timestamptz before B-SEC-12';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_casts'::pg_catalog.regclass
      and a.attname = 'cast_key'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'Required B-SEC-10 column is missing: public.vote_casts.cast_key';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_intention_answers'::pg_catalog.regclass
      and a.attname = 'answer_key'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'Required B-SEC-10 column is missing: public.vote_intention_answers.answer_key';
  end if;

  foreach v_column in array array['identity_mode', 'ends_at'] loop
    if exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'public.vote_rounds.% already exists before B-SEC-12', v_column;
    end if;
  end loop;

  foreach v_constraint in array array[
    'vote_rounds_identity_mode_chk',
    'vote_rounds_secure_session_ends_at_chk',
    'vote_rounds_ends_at_after_created_chk'
  ] loop
    if exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.vote_rounds'::pg_catalog.regclass
        and c.conname = v_constraint
    ) then
      raise exception 'B-SEC-12 constraint name already exists: %', v_constraint;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'starts_at'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_rounds.starts_at must not exist for B-SEC-12';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
    into v_relrowsecurity, v_relforcerowsecurity
  from pg_catalog.pg_class c
  where c.oid = 'public.vote_rounds'::pg_catalog.regclass;

  if not coalesce(v_relrowsecurity, false) then
    raise exception 'Expected RLS to be enabled on public.vote_rounds';
  end if;

  if coalesce(v_relforcerowsecurity, false) then
    raise exception 'Expected FORCE RLS to remain disabled on public.vote_rounds';
  end if;

  select count(*)
    into v_policy_count
  from pg_catalog.pg_policy p
  where p.polrelid = 'public.vote_rounds'::pg_catalog.regclass;

  if v_policy_count <> 0 then
    raise exception 'Expected zero RLS policies on public.vote_rounds, found %', v_policy_count;
  end if;

  select pg_catalog.string_agg(
    acl.privilege_type,
    ', ' order by acl.privilege_type
  )
    into v_public_acl_details
  from pg_catalog.pg_class c
  cross join lateral pg_catalog.aclexplode(c.relacl) acl
  where c.oid = 'public.vote_rounds'::pg_catalog.regclass
    and acl.grantee = 0
    and acl.privilege_type = any(v_table_privileges);

  if v_public_acl_details is not null then
    raise exception 'Unexpected PUBLIC privileges remain on public.vote_rounds: %', v_public_acl_details;
  end if;

  foreach v_role in array v_browser_roles loop
    foreach v_privilege in array v_table_privileges loop
      if pg_catalog.has_table_privilege(v_role, 'public.vote_rounds', v_privilege) then
        raise exception 'Unexpected % table privilege remains for role % on public.vote_rounds', v_privilege, v_role;
      end if;
    end loop;
  end loop;

  foreach v_privilege in array v_table_privileges loop
    v_should_have_privilege := v_privilege in ('SELECT', 'INSERT', 'UPDATE');
    v_has_privilege := pg_catalog.has_table_privilege('service_role', 'public.vote_rounds', v_privilege);

    if v_should_have_privilege and not v_has_privilege then
      raise exception 'service_role lacks required % privilege on public.vote_rounds', v_privilege;
    end if;

    if not v_should_have_privilege and v_has_privilege then
      raise exception 'service_role retains unauthorized % privilege on public.vote_rounds', v_privilege;
    end if;
  end loop;

  select count(*)
    into v_vote_rounds_index_count_before
  from pg_catalog.pg_index i
  where i.indrelid = 'public.vote_rounds'::pg_catalog.regclass;

  select count(*)
    into v_vote_rounds_trigger_count_before
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.vote_rounds'::pg_catalog.regclass
    and not t.tgisinternal;

  select count(*)
    into v_public_function_count_before
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public';

  alter table public.vote_rounds
    add column identity_mode text,
    add column ends_at timestamptz null;

  update public.vote_rounds
     set identity_mode = 'legacy_device'
   where identity_mode is null;

  alter table public.vote_rounds
    alter column identity_mode set not null,
    alter column identity_mode set default 'legacy_device',
    add constraint vote_rounds_identity_mode_chk
      check (identity_mode in ('legacy_device', 'secure_session')),
    add constraint vote_rounds_secure_session_ends_at_chk
      check (identity_mode = 'legacy_device' or ends_at is not null),
    add constraint vote_rounds_ends_at_after_created_chk
      check (ends_at is null or ends_at > created_at);

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
    raise exception 'Expected public.vote_rounds.identity_mode to be text NOT NULL';
  end if;

  select pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    into v_default_expr
  from pg_catalog.pg_attrdef d
  join pg_catalog.pg_attribute a
    on a.attrelid = d.adrelid
   and a.attnum = d.adnum
  where d.adrelid = 'public.vote_rounds'::pg_catalog.regclass
    and a.attname = 'identity_mode';

  if v_default_expr is distinct from '''legacy_device''::text' then
    raise exception 'Expected public.vote_rounds.identity_mode default legacy_device, found %', v_default_expr;
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
    raise exception 'Expected public.vote_rounds.ends_at to be nullable timestamptz';
  end if;

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

  select count(*)
    into v_count
  from public.vote_rounds
  where identity_mode is null;

  if v_count <> 0 then
    raise exception 'Expected zero public.vote_rounds rows with identity_mode NULL, found %', v_count;
  end if;

  select count(*)
    into v_count
  from public.vote_rounds
  where identity_mode <> 'legacy_device';

  if v_count <> 0 then
    raise exception 'Expected zero public.vote_rounds rows outside legacy_device immediately after B-SEC-12, found %', v_count;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_rounds'::pg_catalog.regclass
      and a.attname = 'starts_at'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_rounds.starts_at was unexpectedly created';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
    into v_relrowsecurity, v_relforcerowsecurity
  from pg_catalog.pg_class c
  where c.oid = 'public.vote_rounds'::pg_catalog.regclass;

  if not coalesce(v_relrowsecurity, false) then
    raise exception 'Expected RLS to remain enabled on public.vote_rounds';
  end if;

  if coalesce(v_relforcerowsecurity, false) then
    raise exception 'Expected FORCE RLS to remain disabled on public.vote_rounds';
  end if;

  select count(*)
    into v_policy_count
  from pg_catalog.pg_policy p
  where p.polrelid = 'public.vote_rounds'::pg_catalog.regclass;

  if v_policy_count <> 0 then
    raise exception 'Expected zero RLS policies on public.vote_rounds after B-SEC-12, found %', v_policy_count;
  end if;

  select pg_catalog.string_agg(
    acl.privilege_type,
    ', ' order by acl.privilege_type
  )
    into v_public_acl_details
  from pg_catalog.pg_class c
  cross join lateral pg_catalog.aclexplode(c.relacl) acl
  where c.oid = 'public.vote_rounds'::pg_catalog.regclass
    and acl.grantee = 0
    and acl.privilege_type = any(v_table_privileges);

  if v_public_acl_details is not null then
    raise exception 'Unexpected PUBLIC privileges remain on public.vote_rounds after B-SEC-12: %', v_public_acl_details;
  end if;

  foreach v_role in array v_browser_roles loop
    foreach v_privilege in array v_table_privileges loop
      if pg_catalog.has_table_privilege(v_role, 'public.vote_rounds', v_privilege) then
        raise exception 'Unexpected % table privilege remains for role % on public.vote_rounds after B-SEC-12', v_privilege, v_role;
      end if;
    end loop;
  end loop;

  foreach v_privilege in array v_table_privileges loop
    v_should_have_privilege := v_privilege in ('SELECT', 'INSERT', 'UPDATE');
    v_has_privilege := pg_catalog.has_table_privilege('service_role', 'public.vote_rounds', v_privilege);

    if v_should_have_privilege and not v_has_privilege then
      raise exception 'service_role lacks required % privilege on public.vote_rounds after B-SEC-12', v_privilege;
    end if;

    if not v_should_have_privilege and v_has_privilege then
      raise exception 'service_role retains unauthorized % privilege on public.vote_rounds after B-SEC-12', v_privilege;
    end if;
  end loop;

  if pg_catalog.to_regclass('public.vote_round_sessions') is null then
    raise exception 'public.vote_round_sessions disappeared during B-SEC-12';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_casts'::pg_catalog.regclass
      and a.attname = 'cast_key'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_casts.cast_key disappeared during B-SEC-12';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_intention_answers'::pg_catalog.regclass
      and a.attname = 'answer_key'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_intention_answers.answer_key disappeared during B-SEC-12';
  end if;

  select count(*)
    into v_vote_rounds_index_count_after
  from pg_catalog.pg_index i
  where i.indrelid = 'public.vote_rounds'::pg_catalog.regclass;

  if v_vote_rounds_index_count_after <> v_vote_rounds_index_count_before then
    raise exception 'public.vote_rounds index count changed during B-SEC-12: before %, after %',
      v_vote_rounds_index_count_before,
      v_vote_rounds_index_count_after;
  end if;

  select count(*)
    into v_vote_rounds_trigger_count_after
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.vote_rounds'::pg_catalog.regclass
    and not t.tgisinternal;

  if v_vote_rounds_trigger_count_after <> v_vote_rounds_trigger_count_before then
    raise exception 'public.vote_rounds trigger count changed during B-SEC-12: before %, after %',
      v_vote_rounds_trigger_count_before,
      v_vote_rounds_trigger_count_after;
  end if;

  select count(*)
    into v_public_function_count_after
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public';

  if v_public_function_count_after <> v_public_function_count_before then
    raise exception 'public function/RPC count changed during B-SEC-12: before %, after %',
      v_public_function_count_before,
      v_public_function_count_after;
  end if;
end $$;

select 'BSEC12_PREFLIGHT_OK'::text as result;

rollback;

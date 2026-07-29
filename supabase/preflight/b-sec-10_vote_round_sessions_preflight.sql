begin;

-- B-SEC-10: Create stateful per-round vote sessions and add independent
-- vote identity keys while preserving the legacy device_id path.

do $$
declare
  v_table text;
  v_column text;
  v_trigger_type integer;
  v_trigger_function oid;
  v_trigger_enabled text;
  v_trigger_internal boolean;
  v_trigger_def text;
  v_required_tables text[] := array[
    'public.vote_casts',
    'public.vote_intention_answers',
    'public.vote_intention_questions',
    'public.vote_parties',
    'public.vote_rounds',
    'public.vote_tally'
  ];
begin
  foreach v_table in array v_required_tables loop
    if pg_catalog.to_regclass(v_table) is null then
      raise exception 'Required vote table is missing: %', v_table;
    end if;
  end loop;

  foreach v_column in array array['device_id', 'round_id'] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_casts'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'Required public.vote_casts column is missing: %', v_column;
    end if;
  end loop;

  foreach v_column in array array['device_id', 'round_id', 'party_id', 'party_slug'] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_intention_answers'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'Required public.vote_intention_answers column is missing: %', v_column;
    end if;
  end loop;

  if pg_catalog.to_regclass('public.vote_round_sessions') is not null then
    raise exception 'public.vote_round_sessions already exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_casts'::pg_catalog.regclass
      and a.attname in ('cast_key', 'key_version')
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_casts already contains cast_key or key_version';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_intention_answers'::pg_catalog.regclass
      and a.attname in ('answer_key', 'key_version')
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_intention_answers already contains answer_key or key_version';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.vote_casts'::pg_catalog.regclass
      and c.conname = 'vote_casts_device_round_uniq'
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by k.ordinality)
        from unnest(c.conkey) with ordinality as k(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = k.attnum
      ) = array['device_id', 'round_id']
  ) then
    raise exception 'Required legacy constraint is missing or drifted: vote_casts_device_round_uniq must be UNIQUE (device_id, round_id)';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.vote_intention_answers'::pg_catalog.regclass
      and c.conname = 'unique_response_per_round'
      and c.contype = 'u'
      and (
        select array_agg(a.attname::text order by k.ordinality)
        from unnest(c.conkey) with ordinality as k(attnum, ordinality)
        join pg_catalog.pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = k.attnum
      ) = array['device_id', 'round_id']
  ) then
    raise exception 'Required legacy constraint is missing or drifted: unique_response_per_round must be UNIQUE (device_id, round_id)';
  end if;

  select
    pg_catalog.lower(pg_catalog.pg_get_triggerdef(t.oid, true)),
    t.tgtype::integer,
    t.tgfoid,
    t.tgenabled::text,
    t.tgisinternal
  into
    v_trigger_def,
    v_trigger_type,
    v_trigger_function,
    v_trigger_enabled,
    v_trigger_internal
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.vote_casts'::pg_catalog.regclass
    and t.tgname = 'trg_vote_casts_tally';

  if v_trigger_type is null then
    raise exception 'Required trigger is missing: trg_vote_casts_tally';
  end if;

  if v_trigger_internal then
    raise exception 'trg_vote_casts_tally unexpectedly became an internal trigger';
  end if;

  if v_trigger_enabled <> 'O' then
    raise exception 'trg_vote_casts_tally is not enabled normally';
  end if;

  if (v_trigger_type & 1) = 0 then
    raise exception 'trg_vote_casts_tally is not FOR EACH ROW';
  end if;

  if (v_trigger_type & 2) <> 0 then
    raise exception 'trg_vote_casts_tally unexpectedly became BEFORE trigger';
  end if;

  if (v_trigger_type & 64) <> 0 then
    raise exception 'trg_vote_casts_tally unexpectedly became INSTEAD OF trigger';
  end if;

  if (v_trigger_type & 4) = 0 then
    raise exception 'trg_vote_casts_tally no longer handles INSERT';
  end if;

  if (v_trigger_type & 8) = 0 then
    raise exception 'trg_vote_casts_tally no longer handles DELETE';
  end if;

  if (v_trigger_type & 16) = 0 then
    raise exception 'trg_vote_casts_tally no longer handles UPDATE';
  end if;

  if v_trigger_function is distinct from pg_catalog.to_regprocedure('public.vote_tally_apply()') then
    raise exception 'trg_vote_casts_tally no longer points to public.vote_tally_apply()';
  end if;

  if pg_catalog.strpos(
    v_trigger_def,
    'after insert or delete or update of round_id, party_id, group_code'
  ) = 0 then
    raise exception 'trg_vote_casts_tally UPDATE columns drifted: expected round_id, party_id, group_code';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_casts'::pg_catalog.regclass
      and a.attname = 'device_id'
      and a.attnotnull = true
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'public.vote_casts.device_id must be NOT NULL before B-SEC-10';
  end if;

  foreach v_column in array array['device_id', 'party_id', 'party_slug'] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_intention_answers'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnotnull = true
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'public.vote_intention_answers.% must be NOT NULL before B-SEC-10', v_column;
    end if;
  end loop;
end $$;

create table public.vote_round_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null,
  round_id uuid not null references public.vote_rounds(id),
  group_code text not null,
  key_version smallint not null default 1,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  constraint vote_round_sessions_token_hash_uniq unique (token_hash),
  constraint vote_round_sessions_token_hash_hex_chk
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint vote_round_sessions_group_code_not_blank_chk
    check (length(btrim(group_code)) > 0),
  constraint vote_round_sessions_key_version_positive_chk
    check (key_version > 0),
  constraint vote_round_sessions_expires_after_created_chk
    check (expires_at > created_at),
  constraint vote_round_sessions_revoked_after_created_chk
    check (revoked_at is null or revoked_at >= created_at)
);

create index vote_round_sessions_round_id_idx
  on public.vote_round_sessions (round_id);

create index vote_round_sessions_group_code_idx
  on public.vote_round_sessions (group_code);

create index vote_round_sessions_expires_at_idx
  on public.vote_round_sessions (expires_at);

create index vote_round_sessions_revoked_at_idx
  on public.vote_round_sessions (revoked_at)
  where revoked_at is not null;

alter table public.vote_casts
  add column cast_key text null,
  add column key_version smallint null,
  alter column device_id drop not null,
  add constraint vote_casts_cast_key_hex_chk
    check (cast_key is null or cast_key ~ '^[0-9a-f]{64}$'),
  add constraint vote_casts_session_identity_mode_chk
    check (
      (
        device_id is not null
        and cast_key is null
        and key_version is null
      )
      or
      (
        device_id is null
        and cast_key is not null
        and key_version is not null
        and key_version > 0
      )
    );

create unique index vote_casts_round_group_cast_key_uniq
  on public.vote_casts (round_id, group_code, cast_key)
  where cast_key is not null;

alter table public.vote_intention_answers
  add column answer_key text null,
  add column key_version smallint null,
  alter column device_id drop not null,
  alter column party_id drop not null,
  alter column party_slug drop not null,
  add constraint vote_intention_answers_answer_key_hex_chk
    check (answer_key is null or answer_key ~ '^[0-9a-f]{64}$'),
  add constraint vote_intention_answers_session_identity_mode_chk
    check (
      (
        device_id is not null
        and party_id is not null
        and party_slug is not null
        and answer_key is null
        and key_version is null
      )
      or
      (
        device_id is null
        and party_id is null
        and party_slug is null
        and answer_key is not null
        and key_version is not null
        and key_version > 0
      )
    );

create unique index vote_intention_answers_round_answer_key_uniq
  on public.vote_intention_answers (round_id, answer_key)
  where answer_key is not null;

alter table public.vote_round_sessions enable row level security;

revoke all privileges on table public.vote_round_sessions from public, anon, authenticated, service_role;
grant select, insert, update on table public.vote_round_sessions to service_role;

do $$
declare
  v_policy_count integer;
  v_relrowsecurity boolean;
  v_relforcerowsecurity boolean;
  v_role text;
  v_privilege text;
  v_has_privilege boolean;
  v_should_have_privilege boolean;
  v_public_acl_details text;
  v_column text;
  v_constraint text;
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
  if pg_catalog.to_regclass('public.vote_round_sessions') is null then
    raise exception 'public.vote_round_sessions was not created';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
    into v_relrowsecurity, v_relforcerowsecurity
  from pg_catalog.pg_class c
  where c.oid = 'public.vote_round_sessions'::pg_catalog.regclass;

  if not coalesce(v_relrowsecurity, false) then
    raise exception 'Expected RLS to be enabled on public.vote_round_sessions';
  end if;

  if coalesce(v_relforcerowsecurity, false) then
    raise exception 'Expected FORCE RLS to remain disabled on public.vote_round_sessions';
  end if;

  select count(*)
    into v_policy_count
  from pg_catalog.pg_policy p
  where p.polrelid = 'public.vote_round_sessions'::pg_catalog.regclass;

  if v_policy_count <> 0 then
    raise exception 'Expected zero RLS policies on public.vote_round_sessions, found %', v_policy_count;
  end if;

  foreach v_column in array array['cast_key', 'key_version'] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_casts'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'Expected public.vote_casts.% to exist', v_column;
    end if;
  end loop;

  foreach v_column in array array['answer_key', 'key_version'] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_intention_answers'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'Expected public.vote_intention_answers.% to exist', v_column;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_casts'::pg_catalog.regclass
      and a.attname = 'device_id'
      and a.attnotnull
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'Expected public.vote_casts.device_id to be nullable';
  end if;

  foreach v_column in array array['device_id', 'party_id', 'party_slug'] loop
    if exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_intention_answers'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnotnull
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'Expected public.vote_intention_answers.% to be nullable', v_column;
    end if;
  end loop;

  foreach v_constraint in array array[
    'vote_casts_cast_key_hex_chk',
    'vote_casts_session_identity_mode_chk'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.vote_casts'::pg_catalog.regclass
        and c.conname = v_constraint
        and c.contype = 'c'
        and c.convalidated
    ) then
      raise exception 'Expected validated CHECK constraint on public.vote_casts: %', v_constraint;
    end if;
  end loop;

  foreach v_constraint in array array[
    'vote_intention_answers_answer_key_hex_chk',
    'vote_intention_answers_session_identity_mode_chk'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.vote_intention_answers'::pg_catalog.regclass
        and c.conname = v_constraint
        and c.contype = 'c'
        and c.convalidated
    ) then
      raise exception 'Expected validated CHECK constraint on public.vote_intention_answers: %', v_constraint;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_class idx
    join pg_catalog.pg_index i
      on i.indexrelid = idx.oid
    where idx.relname = 'vote_casts_round_group_cast_key_uniq'
      and i.indrelid = 'public.vote_casts'::pg_catalog.regclass
      and i.indisunique
      and i.indpred is not null
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(i.indpred, i.indrelid)),
        'cast_key is not null'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_indexdef(i.indexrelid)),
        'on public.vote_casts using btree (round_id, group_code, cast_key)'
      ) > 0
  ) then
    raise exception 'Expected unique partial index is missing or drifted: vote_casts_round_group_cast_key_uniq';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class idx
    join pg_catalog.pg_index i
      on i.indexrelid = idx.oid
    where idx.relname = 'vote_intention_answers_round_answer_key_uniq'
      and i.indrelid = 'public.vote_intention_answers'::pg_catalog.regclass
      and i.indisunique
      and i.indpred is not null
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(i.indpred, i.indrelid)),
        'answer_key is not null'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_indexdef(i.indexrelid)),
        'on public.vote_intention_answers using btree (round_id, answer_key)'
      ) > 0
  ) then
    raise exception 'Expected unique partial index is missing or drifted: vote_intention_answers_round_answer_key_uniq';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class idx
    join pg_catalog.pg_index i
      on i.indexrelid = idx.oid
    where idx.relname = 'vote_round_sessions_revoked_at_idx'
      and i.indrelid = 'public.vote_round_sessions'::pg_catalog.regclass
      and i.indpred is not null
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_expr(i.indpred, i.indrelid)),
        'revoked_at is not null'
      ) > 0
      and pg_catalog.strpos(
        pg_catalog.lower(pg_catalog.pg_get_indexdef(i.indexrelid)),
        'on public.vote_round_sessions using btree (revoked_at)'
      ) > 0
  ) then
    raise exception 'Expected partial index is missing or drifted: vote_round_sessions_revoked_at_idx';
  end if;

  select pg_catalog.string_agg(
    acl.privilege_type,
    ', ' order by acl.privilege_type
  )
    into v_public_acl_details
  from pg_catalog.pg_class c
  cross join lateral pg_catalog.aclexplode(c.relacl) acl
  where c.oid = 'public.vote_round_sessions'::pg_catalog.regclass
    and acl.grantee = 0
    and acl.privilege_type = any(v_table_privileges);

  if v_public_acl_details is not null then
    raise exception 'Unexpected PUBLIC privileges remain on public.vote_round_sessions: %', v_public_acl_details;
  end if;

  foreach v_role in array v_browser_roles loop
    foreach v_privilege in array v_table_privileges loop
      if pg_catalog.has_table_privilege(v_role, 'public.vote_round_sessions', v_privilege) then
        raise exception 'Unexpected % table privilege remains for role % on public.vote_round_sessions', v_privilege, v_role;
      end if;
    end loop;
  end loop;

  foreach v_privilege in array v_table_privileges loop
    v_should_have_privilege := v_privilege in ('SELECT', 'INSERT', 'UPDATE');
    v_has_privilege := pg_catalog.has_table_privilege('service_role', 'public.vote_round_sessions', v_privilege);

    if v_should_have_privilege and not v_has_privilege then
      raise exception 'service_role lacks required % privilege on public.vote_round_sessions', v_privilege;
    end if;

    if not v_should_have_privilege and v_has_privilege then
      raise exception 'service_role retains unauthorized % privilege on public.vote_round_sessions', v_privilege;
    end if;
  end loop;
end $$;

select 'BSEC10_PREFLIGHT_OK'::text as result;

rollback;

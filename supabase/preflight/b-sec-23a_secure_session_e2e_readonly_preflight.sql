begin;
set transaction read only;

do $$
declare
  v_table text;
  v_column text;
  v_constraint text;
  v_missing text[];
  v_round1_count integer;
  v_groupb_active_count integer;
  v_trigger_count integer;
  v_trigger_function oid;
  v_trigger_type integer;
  v_trigger_enabled "char";
  v_trigger_internal boolean;
begin
  foreach v_table in array array[
    'public.vote_rounds',
    'public.vote_round_sessions',
    'public.vote_casts',
    'public.vote_intention_answers',
    'public.vote_intention_questions',
    'public.vote_parties',
    'public.vote_tally',
    'public.votoclaro_public_links'
  ] loop
    if pg_catalog.to_regclass(v_table) is null then
      raise exception 'B-SEC-23A missing essential table: %', v_table;
    end if;
  end loop;

  foreach v_table in array array[
    'public.vote_rounds',
    'public.vote_round_sessions',
    'public.vote_casts',
    'public.vote_intention_answers',
    'public.vote_intention_questions',
    'public.vote_parties',
    'public.vote_tally',
    'public.votoclaro_public_links'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_class c
      where c.oid = v_table::pg_catalog.regclass
        and c.relrowsecurity
    ) then
      raise exception 'B-SEC-23A RLS is not enabled on %', v_table;
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
    raise exception 'B-SEC-23A incompatible type: public.vote_rounds.id must be uuid';
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
    raise exception 'B-SEC-23A incompatible type: public.vote_rounds.group_code must be text';
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
    raise exception 'B-SEC-23A incompatible type: public.vote_rounds.is_active must be boolean';
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
    raise exception 'B-SEC-23A incompatible type: public.vote_rounds.ends_at must be timestamptz';
  end if;

  foreach v_table in array array[
    'public.vote_round_sessions',
    'public.vote_casts',
    'public.vote_intention_answers',
    'public.vote_parties',
    'public.vote_tally'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = v_table::pg_catalog.regclass
        and a.attname = 'round_id'
        and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'uuid'
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23A incompatible type: %.round_id must be uuid', v_table;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_tally'::pg_catalog.regclass
      and a.attname = 'total_votes'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) in ('smallint', 'integer', 'bigint')
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23A incompatible type: public.vote_tally.total_votes must be integer-compatible';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.vote_round_sessions'::pg_catalog.regclass
      and a.attname = 'expires_at'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23A incompatible type: public.vote_round_sessions.expires_at must be timestamptz';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid = 'public.votoclaro_public_links'::pg_catalog.regclass
      and a.attname = 'expires_at'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'timestamp with time zone'
      and a.attnum > 0
      and not a.attisdropped
  ) then
    raise exception 'B-SEC-23A incompatible type: public.votoclaro_public_links.expires_at must be timestamptz';
  end if;

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
      raise exception 'B-SEC-23A missing essential column: public.vote_rounds.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'id',
    'token_hash',
    'round_id',
    'group_code',
    'key_version',
    'created_at',
    'expires_at',
    'revoked_at'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_round_sessions'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23A missing essential column: public.vote_round_sessions.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'id',
    'round_id',
    'party_id',
    'device_id',
    'group_code',
    'cast_key',
    'key_version'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_casts'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23A missing essential column: public.vote_casts.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'id',
    'device_id',
    'round_id',
    'party_id',
    'party_slug',
    'questions_id',
    'answer_1',
    'answer_2',
    'answer_3',
    'user_agent',
    'answer_key',
    'key_version'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_intention_answers'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23A missing essential column: public.vote_intention_answers.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'id',
    'question_1',
    'question_2',
    'question_3',
    'is_active',
    'created_at'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_intention_questions'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23A missing essential column: public.vote_intention_questions.%', v_column;
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
      raise exception 'B-SEC-23A missing essential column: public.vote_parties.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'round_id',
    'party_id',
    'group_code',
    'total_votes'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_tally'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23A missing essential column: public.vote_tally.%', v_column;
    end if;
  end loop;

  foreach v_column in array array[
    'id',
    'token',
    'route',
    'is_active',
    'expires_at',
    'created_at'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.votoclaro_public_links'::pg_catalog.regclass
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'B-SEC-23A missing essential column: public.votoclaro_public_links.%', v_column;
    end if;
  end loop;

  for v_constraint, v_table in
    select expected.constraint_name, expected.table_name
    from (
      values
        ('vote_rounds_identity_mode_chk', 'public.vote_rounds'),
        ('vote_rounds_secure_session_ends_at_chk', 'public.vote_rounds'),
        ('vote_rounds_ends_at_after_created_chk', 'public.vote_rounds'),
        ('vote_rounds_lifecycle_state_chk', 'public.vote_rounds'),
        ('vote_rounds_lifecycle_managed_state_chk', 'public.vote_rounds'),
        ('vote_round_sessions_token_hash_uniq', 'public.vote_round_sessions'),
        ('vote_round_sessions_token_hash_hex_chk', 'public.vote_round_sessions'),
        ('vote_round_sessions_group_code_not_blank_chk', 'public.vote_round_sessions'),
        ('vote_round_sessions_key_version_positive_chk', 'public.vote_round_sessions'),
        ('vote_round_sessions_expires_after_created_chk', 'public.vote_round_sessions'),
        ('vote_round_sessions_revoked_after_created_chk', 'public.vote_round_sessions'),
        ('vote_casts_device_round_uniq', 'public.vote_casts'),
        ('vote_casts_cast_key_hex_chk', 'public.vote_casts'),
        ('vote_casts_session_identity_mode_chk', 'public.vote_casts'),
        ('unique_response_per_round', 'public.vote_intention_answers'),
        ('vote_intention_answers_answer_key_hex_chk', 'public.vote_intention_answers'),
        ('vote_intention_answers_session_identity_mode_chk', 'public.vote_intention_answers')
    ) as expected(constraint_name, table_name)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conname = v_constraint
        and c.connamespace = 'public'::pg_catalog.regnamespace
        and c.conrelid = v_table::pg_catalog.regclass
    ) then
      raise exception 'B-SEC-23A missing essential constraint on expected table: %.%', v_table, v_constraint;
    end if;
  end loop;

  v_missing := array[]::text[];

  if pg_catalog.to_regprocedure('public.vote_tally_apply()') is null then
    v_missing := v_missing || 'public.vote_tally_apply()';
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
    raise exception 'B-SEC-23A missing essential function(s): %', pg_catalog.array_to_string(v_missing, ', ');
  end if;

  select count(*)
    into v_trigger_count
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.vote_casts'::pg_catalog.regclass
    and t.tgname = 'trg_vote_casts_tally';

  if v_trigger_count <> 1 then
    raise exception 'B-SEC-23A expected exactly one trg_vote_casts_tally trigger, found %', v_trigger_count;
  end if;

  select
    t.tgfoid,
    t.tgtype,
    t.tgenabled,
    t.tgisinternal
  into
    v_trigger_function,
    v_trigger_type,
    v_trigger_enabled,
    v_trigger_internal
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.vote_casts'::pg_catalog.regclass
    and t.tgname = 'trg_vote_casts_tally';

  if v_trigger_function is distinct from pg_catalog.to_regprocedure('public.vote_tally_apply()') then
    raise exception 'B-SEC-23A trg_vote_casts_tally does not point to public.vote_tally_apply()';
  end if;

  if v_trigger_internal then
    raise exception 'B-SEC-23A trg_vote_casts_tally is internal';
  end if;

  if v_trigger_enabled <> 'O' then
    raise exception 'B-SEC-23A trg_vote_casts_tally is not enabled normally';
  end if;

  if (v_trigger_type & 1) = 0
     or (v_trigger_type & 2) <> 0
     or (v_trigger_type & 64) <> 0
     or (v_trigger_type & 4) = 0
     or (v_trigger_type & 8) = 0
     or (v_trigger_type & 16) = 0 then
    raise exception 'B-SEC-23A trg_vote_casts_tally trigger events are not the expected row-level after i/u/d set';
  end if;

  select count(*)
    into v_round1_count
  from public.vote_rounds r
  where r.name = 'Ronda 1'
    and r.group_code = 'GRUPOB'
    and r.is_active = true
    and r.identity_mode = 'legacy_device'
    and r.lifecycle_state = 'legacy';

  select count(*)
    into v_groupb_active_count
  from public.vote_rounds r
  where r.group_code = 'GRUPOB'
    and r.is_active = true;

  if v_round1_count <> 1 or v_groupb_active_count <> 1 then
    raise exception 'B-SEC-23A RONDA 1 NO COINCIDE CON EL ESTADO ESPERADO';
  end if;
end $$;

with
groups(group_code) as (
  values
    ('GRUPOA'),
    ('GRUPOB'),
    ('GRUPOC'),
    ('GRUPOD'),
    ('GRUPOE')
),
tally_function as (
  select
    p.oid,
    pg_catalog.pg_get_functiondef(p.oid) as definition,
    r.rolname as owner_name,
    p.prosecdef,
    p.proconfig,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
      ) acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_execute,
    case
      when pg_catalog.to_regrole('anon') is null then null
      else pg_catalog.has_function_privilege(
        pg_catalog.to_regrole('anon'),
        p.oid,
        'EXECUTE'
      )
    end as anon_execute,
    case
      when pg_catalog.to_regrole('authenticated') is null then null
      else pg_catalog.has_function_privilege(
        pg_catalog.to_regrole('authenticated'),
        p.oid,
        'EXECUTE'
      )
    end as authenticated_execute,
    case
      when pg_catalog.to_regrole('service_role') is null then null
      else pg_catalog.has_function_privilege(
        pg_catalog.to_regrole('service_role'),
        p.oid,
        'EXECUTE'
      )
    end as service_role_execute
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles r
    on r.oid = p.proowner
  where p.oid = pg_catalog.to_regprocedure('public.vote_tally_apply()')
),
tally_trigger as (
  select
    pg_catalog.pg_get_triggerdef(t.oid, true) as definition,
    t.tgtype,
    t.tgenabled,
    t.tgfoid
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.vote_casts'::pg_catalog.regclass
    and t.tgname = 'trg_vote_casts_tally'
),
tally_details as (
  select
    tf.definition as function_definition,
    tt.definition as trigger_definition,
    pg_catalog.jsonb_build_object(
      'events',
      to_jsonb(array_remove(array[
        case when (tt.tgtype & 4) <> 0 then 'insert' end,
        case when (tt.tgtype & 16) <> 0 then 'update' end,
        case when (tt.tgtype & 8) <> 0 then 'delete' end
      ], null)),
      'enabled',
      tt.tgenabled,
      'owner',
      tf.owner_name,
      'security_mode',
      case when tf.prosecdef then 'security_definer' else 'security_invoker' end,
      'search_path',
      (
        select split_part(config, '=', 2)
        from pg_catalog.unnest(coalesce(tf.proconfig, array[]::text[])) config
        where split_part(config, '=', 1) = 'search_path'
        order by config
        limit 1
      ),
      'execute_privileges',
      pg_catalog.jsonb_build_object(
        'PUBLIC',
        tf.public_execute,
        'anon',
        tf.anon_execute,
        'authenticated',
        tf.authenticated_execute,
        'service_role',
        tf.service_role_execute
      )
    ) as metadata,
    pg_catalog.jsonb_build_object(
      'tally_mentions_insert',
      pg_catalog.strpos(pg_catalog.lower(tf.definition), 'insert') > 0,
      'tally_mentions_update',
      pg_catalog.strpos(pg_catalog.lower(tf.definition), 'update') > 0,
      'tally_mentions_delete',
      pg_catalog.strpos(pg_catalog.lower(tf.definition), 'delete') > 0,
      'tally_mentions_tg_op',
      pg_catalog.strpos(pg_catalog.lower(tf.definition), 'tg_op') > 0,
      'tally_mentions_vote_tally',
      pg_catalog.strpos(pg_catalog.lower(tf.definition), 'vote_tally') > 0,
      'note',
      'Indicadores orientativos; no prueban por si solos que el borrado revierta el tally.'
    ) as indicators
  from tally_function tf
  cross join tally_trigger tt
),
fk_rows as (
  select
    src.relname as source_table,
    c.conname as constraint_name,
    (
      select pg_catalog.jsonb_agg(sa.attname order by key_cols.ord)
      from pg_catalog.unnest(c.conkey) with ordinality as key_cols(attnum, ord)
      join pg_catalog.pg_attribute sa
        on sa.attrelid = c.conrelid
       and sa.attnum = key_cols.attnum
    ) as source_columns,
    dst.relname as target_table,
    (
      select pg_catalog.jsonb_agg(ta.attname order by key_cols.ord)
      from pg_catalog.unnest(c.confkey) with ordinality as key_cols(attnum, ord)
      join pg_catalog.pg_attribute ta
        on ta.attrelid = c.confrelid
       and ta.attnum = key_cols.attnum
    ) as target_columns,
    case c.confdeltype
      when 'a' then 'NO ACTION'
      when 'r' then 'RESTRICT'
      when 'c' then 'CASCADE'
      when 'n' then 'SET NULL'
      when 'd' then 'SET DEFAULT'
      else 'UNKNOWN'
    end as on_delete
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class src
    on src.oid = c.conrelid
  join pg_catalog.pg_namespace srcn
    on srcn.oid = src.relnamespace
  join pg_catalog.pg_class dst
    on dst.oid = c.confrelid
  join pg_catalog.pg_namespace dstn
    on dstn.oid = dst.relnamespace
  where c.contype = 'f'
    and srcn.nspname = 'public'
    and dstn.nspname = 'public'
    and src.relname in (
      'vote_round_sessions',
      'vote_casts',
      'vote_intention_answers',
      'vote_tally'
    )
),
foreign_keys_json as (
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'source_table', source_table,
        'constraint', constraint_name,
        'source_columns', source_columns,
        'target_table', target_table,
        'target_columns', target_columns,
        'on_delete', on_delete
      )
      order by source_table, constraint_name
    ),
    '[]'::jsonb
  ) as data
  from fk_rows
),
round_metrics as (
  select
    r.group_code,
    count(*)::integer as rounds_total,
    count(*) filter (where r.is_active = true)::integer as rounds_active,
    count(*) filter (where r.lifecycle_state = 'draft')::integer as rounds_draft,
    count(*) filter (where r.identity_mode = 'secure_session')::integer as rounds_secure
  from public.vote_rounds r
  where r.group_code in (select g.group_code from groups g)
  group by r.group_code
),
session_metrics as (
  select
    s.group_code,
    count(*)::integer as sessions_total,
    count(*) filter (
      where s.revoked_at is null
        and s.expires_at > pg_catalog.statement_timestamp()
    )::integer as sessions_open
  from public.vote_round_sessions s
  where s.group_code in (select g.group_code from groups g)
  group by s.group_code
),
cast_metrics as (
  select
    c.group_code,
    count(*)::integer as casts_total
  from public.vote_casts c
  where c.group_code in (select g.group_code from groups g)
  group by c.group_code
),
answer_metrics as (
  select
    r.group_code,
    count(*)::integer as answers_total
  from public.vote_intention_answers a
  join public.vote_rounds r
    on r.id = a.round_id
  where r.group_code in (select g.group_code from groups g)
  group by r.group_code
),
tally_metrics as (
  select
    t.group_code,
    count(*)::integer as tally_rows,
    coalesce(sum(t.total_votes), 0)::bigint as tally_votes_sum
  from public.vote_tally t
  where t.group_code in (select g.group_code from groups g)
  group by t.group_code
),
party_metrics as (
  select
    p.group_code,
    count(*) filter (where p.enabled = true)::integer as enabled_parties_total
  from public.vote_parties p
  where p.group_code in (select g.group_code from groups g)
  group by p.group_code
),
question_schema as (
  select
    exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_intention_questions'::pg_catalog.regclass
        and a.attname = 'round_id'
        and a.attnum > 0
        and not a.attisdropped
    ) as has_round_id,
    exists (
      select 1
      from pg_catalog.pg_attribute a
      where a.attrelid = 'public.vote_intention_questions'::pg_catalog.regclass
        and a.attname = 'group_code'
        and a.attnum > 0
        and not a.attisdropped
    ) as has_group_code
),
question_metrics as (
  select
    g.group_code,
    count(*) filter (
      where not (to_jsonb(q) ? 'group_code')
         or to_jsonb(q)->>'group_code' is null
         or to_jsonb(q)->>'group_code' = g.group_code
    )::integer as questions_total,
    count(*) filter (
      where q.is_active = true
        and (
          not (to_jsonb(q) ? 'group_code')
          or to_jsonb(q)->>'group_code' is null
          or to_jsonb(q)->>'group_code' = g.group_code
        )
    )::integer as questions_active,
    count(*) filter (
      where (to_jsonb(q) ? 'round_id')
        and to_jsonb(q)->>'round_id' is not null
        and exists (
          select 1
          from public.vote_rounds r
          where r.group_code = g.group_code
            and r.id::text = to_jsonb(q)->>'round_id'
        )
    )::integer as questions_linked_to_round,
    count(*) filter (
      where not (to_jsonb(q) ? 'round_id')
         or to_jsonb(q)->>'round_id' is null
    )::integer as questions_global
  from groups g
  cross join public.vote_intention_questions q
  group by g.group_code
),
public_link_metrics as (
  select
    g.group_code,
    count(pl.id) filter (
      where pl.route = '/pitch'
        and pl.token ~ ('^' || g.group_code || '-')
    )::integer as public_links_total,
    count(pl.id) filter (
      where pl.route = '/pitch'
        and pl.token ~ ('^' || g.group_code || '-')
        and pl.is_active = true
        and (pl.expires_at is null or pl.expires_at > pg_catalog.statement_timestamp())
    )::integer as public_links_currently_usable,
    null::text as public_links_observation
  from groups g
  left join public.votoclaro_public_links pl
    on pl.route = '/pitch'
   and pl.token ~ ('^' || g.group_code || '-')
  group by g.group_code
),
party_provisioning_metrics as (
  select
    p.group_code,
    count(*) filter (where p.enabled = true and p.round_id is not null)::integer as enabled_parties_with_round_id,
    count(*) filter (where p.enabled = true and p.round_id is null)::integer as enabled_parties_without_round_id,
    count(distinct p.round_id) filter (
      where p.enabled = true
        and p.round_id is not null
    )::integer as source_rounds_with_enabled_parties,
    count(distinct p.slug) filter (where p.enabled = true)::integer as distinct_enabled_slugs
  from public.vote_parties p
  where p.group_code in (select g.group_code from groups g)
  group by p.group_code
),
group_summary_rows as (
  select
    g.group_code,
    coalesce(rm.rounds_total, 0) as rounds_total,
    coalesce(rm.rounds_active, 0) as rounds_active,
    coalesce(rm.rounds_draft, 0) as rounds_draft,
    coalesce(rm.rounds_secure, 0) as rounds_secure,
    coalesce(sm.sessions_total, 0) as sessions_total,
    coalesce(sm.sessions_open, 0) as sessions_open,
    coalesce(cm.casts_total, 0) as casts_total,
    coalesce(am.answers_total, 0) as answers_total,
    coalesce(tm.tally_rows, 0) as tally_rows,
    coalesce(tm.tally_votes_sum, 0) as tally_votes_sum,
    coalesce(pm.enabled_parties_total, 0) as enabled_parties_total,
    coalesce(ppm.enabled_parties_with_round_id, 0) as enabled_parties_with_round_id,
    coalesce(ppm.enabled_parties_without_round_id, 0) as enabled_parties_without_round_id,
    coalesce(ppm.source_rounds_with_enabled_parties, 0) as source_rounds_with_enabled_parties,
    coalesce(ppm.distinct_enabled_slugs, 0) as distinct_enabled_slugs,
    coalesce(qm.questions_total, 0) as questions_total,
    coalesce(qm.questions_active, 0) as questions_active,
    coalesce(plm.public_links_total, 0) as public_links_total,
    coalesce(plm.public_links_currently_usable, 0) as public_links_currently_usable,
    plm.public_links_observation
  from groups g
  left join round_metrics rm
    on rm.group_code = g.group_code
  left join session_metrics sm
    on sm.group_code = g.group_code
  left join cast_metrics cm
    on cm.group_code = g.group_code
  left join answer_metrics am
    on am.group_code = g.group_code
  left join tally_metrics tm
    on tm.group_code = g.group_code
  left join party_metrics pm
    on pm.group_code = g.group_code
  left join party_provisioning_metrics ppm
    on ppm.group_code = g.group_code
  left join question_metrics qm
    on qm.group_code = g.group_code
  left join public_link_metrics plm
    on plm.group_code = g.group_code
),
group_summary_json as (
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'group_code', group_code,
      'rounds_total', rounds_total,
      'rounds_active', rounds_active,
      'rounds_draft', rounds_draft,
      'rounds_secure', rounds_secure,
      'sessions_total', sessions_total,
      'sessions_open', sessions_open,
      'casts_total', casts_total,
      'answers_total', answers_total,
      'tally_rows', tally_rows,
      'tally_votes_sum', tally_votes_sum,
      'enabled_parties_total', enabled_parties_total,
      'enabled_parties_with_round_id', enabled_parties_with_round_id,
      'enabled_parties_without_round_id', enabled_parties_without_round_id,
      'source_rounds_with_enabled_parties', source_rounds_with_enabled_parties,
      'distinct_enabled_slugs', distinct_enabled_slugs,
      'questions_total', questions_total,
      'questions_active', questions_active,
      'public_links_total', public_links_total,
      'public_links_currently_usable', public_links_currently_usable,
      'public_links_observation', public_links_observation
    )
    order by group_code
  ) as data
  from group_summary_rows
),
relevant_rounds as (
  select
    r.id,
    r.group_code,
    r.name,
    r.is_active,
    r.lifecycle_state,
    r.identity_mode,
    r.ends_at
  from public.vote_rounds r
  where r.group_code in (select g.group_code from groups g)
    and (
      r.is_active = true
      or r.lifecycle_state = 'draft'
    )
),
round_party_rows as (
  select
    r.id as round_id,
    r.group_code,
    r.name as round_name,
    r.is_active,
    r.lifecycle_state,
    r.identity_mode,
    r.ends_at,
    (
      select count(*)::integer
      from public.vote_parties p
      where p.group_code = r.group_code
        and p.enabled = true
    ) as enabled_parties_by_group,
    (
      select count(*)::integer
      from public.vote_parties p
      where p.group_code = r.group_code
        and p.round_id = r.id
        and p.enabled = true
    ) as enabled_parties_for_round,
    (
      select count(*)::integer
      from public.vote_parties visible
      where visible.group_code = r.group_code
        and visible.enabled = true
        and not exists (
          select 1
          from public.vote_parties castable
          where castable.group_code = r.group_code
            and castable.round_id = r.id
            and castable.enabled = true
            and castable.slug = visible.slug
        )
    ) as parties_visible_but_not_castable,
    (
      select count(*)::integer
      from public.vote_parties castable
      where castable.group_code = r.group_code
        and castable.round_id = r.id
        and castable.enabled = true
        and not exists (
          select 1
          from public.vote_parties visible
          where visible.group_code = r.group_code
            and visible.enabled = true
            and visible.slug = castable.slug
        )
    ) as parties_castable_but_not_visible
  from relevant_rounds r
),
round_party_json as (
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'round_id', round_id,
        'group_code', group_code,
        'round_name', round_name,
        'is_active', is_active,
        'lifecycle_state', lifecycle_state,
        'identity_mode', identity_mode,
        'ends_at', ends_at,
        'enabled_parties_by_group', enabled_parties_by_group,
        'enabled_parties_for_round', enabled_parties_for_round,
        'parties_visible_but_not_castable', parties_visible_but_not_castable,
        'parties_castable_but_not_visible', parties_castable_but_not_visible
      )
      order by group_code, is_active desc, round_name, round_id
    ),
    '[]'::jsonb
  ) as data
  from round_party_rows
),
question_summary_rows as (
  select
    r.id as round_id,
    r.group_code,
    r.name as round_name,
    coalesce(qm.questions_total, 0) as questions_total,
    coalesce(qm.questions_active, 0) as questions_active,
    (
      select count(*)::integer
      from public.vote_intention_questions q
      where (to_jsonb(q) ? 'round_id')
        and to_jsonb(q)->>'round_id' = r.id::text
    ) as questions_linked_to_round,
    coalesce(qm.questions_global, 0) as questions_global
  from relevant_rounds r
  left join question_metrics qm
    on qm.group_code = r.group_code
),
question_summary_json as (
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'round_id', round_id,
        'group_code', group_code,
        'round_name', round_name,
        'questions_total', questions_total,
        'questions_active', questions_active,
        'questions_linked_to_round', questions_linked_to_round,
        'questions_global', questions_global
      )
      order by group_code, round_name, round_id
    ),
    '[]'::jsonb
  ) || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'endpoint_observation',
      'El endpoint /api/vote/questions usa DB mediante get_active_questions y fallback a public.vote_intention_questions; el frontend tambien tiene fallback local. Este SQL solo verifica DB.',
      'schema_has_round_id',
      (select has_round_id from question_schema),
      'schema_has_group_code',
      (select has_group_code from question_schema)
    )
  ) as data
  from question_summary_rows
),
round_party_incoherence_by_group as (
  select
    group_code,
    coalesce(sum(parties_visible_but_not_castable), 0)::integer as visible_not_castable,
    coalesce(sum(parties_castable_but_not_visible), 0)::integer as castable_not_visible
  from round_party_rows
  group by group_code
),
isolated_rows as (
  select
    gsr.group_code,
    gsr.enabled_parties_total,
    gsr.enabled_parties_with_round_id,
    gsr.enabled_parties_without_round_id,
    gsr.source_rounds_with_enabled_parties,
    gsr.distinct_enabled_slugs,
    (
      gsr.rounds_active = 0
      and gsr.rounds_draft = 0
      and gsr.sessions_total = 0
      and gsr.casts_total = 0
      and gsr.answers_total = 0
      and gsr.tally_rows = 0
      and gsr.tally_votes_sum = 0
      and gsr.public_links_currently_usable > 0
      and gsr.questions_active > 0
      and gsr.group_code <> 'GRUPOB'
    ) as isolation_candidate,
    true as party_provisioning_required,
    false as e2e_ready_candidate,
    array_remove(array[
      case when gsr.group_code = 'GRUPOB' then 'reserved_round1_group' end,
      case when gsr.rounds_active > 0 then 'active_round_present' end,
      case when gsr.rounds_draft > 0 then 'draft_present' end,
      case when gsr.sessions_total > 0 then 'sessions_present' end,
      case when gsr.casts_total > 0 then 'casts_present' end,
      case when gsr.answers_total > 0 then 'answers_present' end,
      case when gsr.tally_rows > 0 or gsr.tally_votes_sum <> 0 then 'tally_present' end,
      case when gsr.public_links_currently_usable <= 0 then 'no_usable_pitch_link' end,
      case when gsr.questions_active <= 0 then 'no_questions' end,
      'party_catalog_requires_round_provisioning',
      case
        when coalesce(rpig.visible_not_castable, 0) <> 0
          or coalesce(rpig.castable_not_visible, 0) <> 0
        then 'party_catalog_incoherent'
      end
    ], null) as rejection_reasons
  from group_summary_rows gsr
  left join round_party_incoherence_by_group rpig
    on rpig.group_code = gsr.group_code
),
isolated_json as (
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'group_code', group_code,
      'isolation_candidate', isolation_candidate,
      'party_provisioning_required', party_provisioning_required,
      'e2e_ready_candidate', e2e_ready_candidate,
      'enabled_parties_total', enabled_parties_total,
      'enabled_parties_with_round_id', enabled_parties_with_round_id,
      'enabled_parties_without_round_id', enabled_parties_without_round_id,
      'source_rounds_with_enabled_parties', source_rounds_with_enabled_parties,
      'distinct_enabled_slugs', distinct_enabled_slugs,
      'rejection_reasons', to_jsonb(rejection_reasons)
    )
    order by group_code
  ) as data
  from isolated_rows
),
round1_check as (
  select count(*) = 1 as round1_ok
  from public.vote_rounds r
  where r.name = 'Ronda 1'
    and r.group_code = 'GRUPOB'
    and r.is_active = true
    and r.identity_mode = 'legacy_device'
    and r.lifecycle_state = 'legacy'
),
rls_summary as (
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'table', c.relname,
      'rls_enabled', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity
    )
    order by c.relname
  ) as data
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'vote_rounds',
      'vote_round_sessions',
      'vote_casts',
      'vote_intention_answers',
      'vote_intention_questions',
      'vote_parties',
      'vote_tally',
      'votoclaro_public_links'
    )
)
select
  'BSEC23A_PREFLIGHT_DATA_READY'::text as result,
  pg_catalog.statement_timestamp() as generated_at,
  (select round1_ok from round1_check) as round1_ok,
  true as essential_objects_ok,
  (select function_definition from tally_details) as tally_function_definition,
  (select trigger_definition from tally_details) as tally_trigger_definition,
  (
    select indicators || pg_catalog.jsonb_build_object('metadata', metadata)
    from tally_details
  ) as tally_indicators,
  (select data from foreign_keys_json) as foreign_keys,
  (select data from group_summary_json) as group_summary,
  (select data from round_party_json) as round_party_consistency,
  (select data from question_summary_json) as question_summary,
  (select data from isolated_json) as isolated_candidates,
  true as manual_review_required,
  pg_catalog.jsonb_build_object(
    'messages',
    pg_catalog.jsonb_build_array(
      'No devuelve token_hash, cast_key, answer_key, device_id, user_agent, cookies, secretos ni tokens pitch.',
      'La coherencia de partidos compara el filtro real de /api/vote/active por group_code contra el filtro real de /api/vote/cast por round_id, group_code y slug.',
      'Los indicadores de tally son orientativos; ChatGPT debe revisar manualmente pg_get_functiondef antes de autorizar escrituras.',
      'GRUPOB no se considera candidato mientras Ronda 1 siga activa.',
      'Una futura ronda secure_session requiere provisionar partidos asociados a su nuevo round_id antes de estar lista para E2E.'
    ),
    'rls_summary',
    (select data from rls_summary)
  ) as notes;

rollback;

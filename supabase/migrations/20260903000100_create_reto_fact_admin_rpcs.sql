-- B2C-E5F22B
-- Secure admin RPCs for private Reto knowledge facts.
-- No fact/template data is loaded by this migration.

begin;

-- ============================================================
-- PREFLIGHT
-- ============================================================

do $preflight$
declare
  v_policy_count integer;
begin
  if pg_catalog.to_regclass('public.reto_knowledge_facts') is null
     or pg_catalog.to_regclass('public.reto_question_bank_audit') is null then
    raise exception 'B2C_E5F22B_ABORT: required private tables are missing';
  end if;

  if pg_catalog.to_regprocedure(
       'public.create_reto_knowledge_fact_admin(text,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.update_reto_knowledge_fact_admin(uuid,integer,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.approve_reto_knowledge_fact_admin(uuid,integer,text,boolean,text,uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.retire_reto_knowledge_fact_admin(uuid,integer,text,uuid)'
     ) is not null then
    raise exception 'B2C_E5F22B_ABORT: one or more target RPCs already exist';
  end if;

  if exists (select 1 from public.reto_knowledge_facts limit 1) then
    raise exception 'B2C_E5F22B_ABORT: facts table must still be empty';
  end if;

  if exists (select 1 from public.reto_question_bank_audit limit 1) then
    raise exception 'B2C_E5F22B_ABORT: audit table must still be empty';
  end if;

  select pg_catalog.count(*)
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in ('reto_knowledge_facts', 'reto_question_bank_audit');

  if v_policy_count <> 0 then
    raise exception 'B2C_E5F22B_ABORT: unexpected RLS policies';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role','public.reto_knowledge_facts','SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role','public.reto_question_bank_audit','SELECT'
     ) then
    raise exception 'B2C_E5F22B_ABORT: required service_role SELECT privilege missing';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role','public.reto_knowledge_facts','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_knowledge_facts','UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_knowledge_facts','DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_bank_audit','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_bank_audit','UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_bank_audit','DELETE'
     ) then
    raise exception 'B2C_E5F22B_ABORT: unexpected direct service_role mutation privilege';
  end if;
end
$preflight$;

-- ============================================================
-- CREATE FACT
-- ============================================================

create function public.create_reto_knowledge_fact_admin(
  p_fact_key text,
  p_fact_type text,
  p_lang text,
  p_topic text,
  p_fact_data jsonb,
  p_eligible_sources text[],
  p_difficulty smallint,
  p_source_reference text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_allowed_operators text[],
  p_actor_email text,
  p_request_id uuid
)
returns table (
  result_fact_id uuid,
  result_version integer,
  result_review_status text,
  result_is_active boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_actor_email, '')));
  v_source_reference text := nullif(pg_catalog.btrim(coalesce(p_source_reference, '')), '');
  v_after public.reto_knowledge_facts%rowtype;
begin
  if p_request_id is null
     or v_actor = ''
     or pg_catalog.length(v_actor) > 320
     or p_fact_key is null
     or p_fact_type is null
     or p_lang is null
     or p_topic is null
     or p_fact_data is null
     or pg_catalog.jsonb_typeof(p_fact_data) <> 'object'
     or pg_catalog.octet_length(p_fact_data::text) > 262144
     or p_eligible_sources is null
     or p_difficulty is null
     or p_allowed_operators is null then
    raise exception 'RETO_FACT_ADMIN_INVALID_INPUT';
  end if;

  begin
    insert into public.reto_knowledge_facts (
      fact_key,
      fact_type,
      lang,
      topic,
      fact_data,
      eligible_sources,
      difficulty,
      source_reference,
      valid_from,
      valid_until,
      review_status,
      reviewed_at,
      is_active,
      version,
      created_at,
      updated_at,
      allowed_operators
    )
    values (
      pg_catalog.btrim(p_fact_key),
      pg_catalog.btrim(p_fact_type),
      pg_catalog.btrim(p_lang),
      pg_catalog.btrim(p_topic),
      p_fact_data,
      p_eligible_sources,
      p_difficulty,
      v_source_reference,
      p_valid_from,
      p_valid_until,
      'draft',
      null,
      false,
      1,
      pg_catalog.now(),
      pg_catalog.now(),
      p_allowed_operators
    )
    returning *
      into v_after;
  exception
    when unique_violation then
      raise exception 'RETO_FACT_ADMIN_CREATE_CONFLICT';
  end;

  insert into public.reto_question_bank_audit (
    request_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_snapshot,
    after_snapshot
  )
  values (
    p_request_id,
    v_actor,
    'fact.create',
    'fact',
    v_after.id,
    null,
    pg_catalog.to_jsonb(v_after)
  );

  return query
  select
    v_after.id,
    v_after.version,
    v_after.review_status,
    v_after.is_active;
end
$function$;

alter function public.create_reto_knowledge_fact_admin(
  text,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid
) owner to postgres;

revoke all on function public.create_reto_knowledge_fact_admin(
  text,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.create_reto_knowledge_fact_admin(
  text,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid
) to service_role;

-- ============================================================
-- UPDATE FACT CONTENT
-- fact_key remains immutable.
-- Any content edit returns the record to draft and inactive.
-- ============================================================

create function public.update_reto_knowledge_fact_admin(
  p_fact_id uuid,
  p_expected_version integer,
  p_fact_type text,
  p_lang text,
  p_topic text,
  p_fact_data jsonb,
  p_eligible_sources text[],
  p_difficulty smallint,
  p_source_reference text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_allowed_operators text[],
  p_actor_email text,
  p_request_id uuid
)
returns table (
  result_fact_id uuid,
  result_version integer,
  result_review_status text,
  result_is_active boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_actor_email, '')));
  v_source_reference text := nullif(pg_catalog.btrim(coalesce(p_source_reference, '')), '');
  v_before public.reto_knowledge_facts%rowtype;
  v_after public.reto_knowledge_facts%rowtype;
begin
  if p_fact_id is null
     or p_expected_version is null
     or p_expected_version <= 0
     or p_request_id is null
     or v_actor = ''
     or pg_catalog.length(v_actor) > 320
     or p_fact_type is null
     or p_lang is null
     or p_topic is null
     or p_fact_data is null
     or pg_catalog.jsonb_typeof(p_fact_data) <> 'object'
     or pg_catalog.octet_length(p_fact_data::text) > 262144
     or p_eligible_sources is null
     or p_difficulty is null
     or p_allowed_operators is null then
    raise exception 'RETO_FACT_ADMIN_INVALID_INPUT';
  end if;

  select f.*
    into v_before
  from public.reto_knowledge_facts f
  where f.id = p_fact_id
  for update;

  if not found then
    raise exception 'RETO_FACT_ADMIN_NOT_FOUND';
  end if;

  if v_before.version <> p_expected_version then
    raise exception 'RETO_FACT_ADMIN_VERSION_CONFLICT';
  end if;

  update public.reto_knowledge_facts f
  set fact_type = pg_catalog.btrim(p_fact_type),
      lang = pg_catalog.btrim(p_lang),
      topic = pg_catalog.btrim(p_topic),
      fact_data = p_fact_data,
      eligible_sources = p_eligible_sources,
      difficulty = p_difficulty,
      source_reference = v_source_reference,
      valid_from = p_valid_from,
      valid_until = p_valid_until,
      review_status = 'draft',
      reviewed_at = null,
      is_active = false,
      version = f.version + 1,
      updated_at = pg_catalog.now(),
      allowed_operators = p_allowed_operators
  where f.id = p_fact_id
    and f.version = p_expected_version
  returning *
    into v_after;

  if not found then
    raise exception 'RETO_FACT_ADMIN_VERSION_CONFLICT';
  end if;

  insert into public.reto_question_bank_audit (
    request_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_snapshot,
    after_snapshot
  )
  values (
    p_request_id,
    v_actor,
    'fact.update',
    'fact',
    v_after.id,
    pg_catalog.to_jsonb(v_before),
    pg_catalog.to_jsonb(v_after)
  );

  return query
  select
    v_after.id,
    v_after.version,
    v_after.review_status,
    v_after.is_active;
end
$function$;

alter function public.update_reto_knowledge_fact_admin(
  uuid,integer,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid
) owner to postgres;

revoke all on function public.update_reto_knowledge_fact_admin(
  uuid,integer,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.update_reto_knowledge_fact_admin(
  uuid,integer,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid
) to service_role;

-- ============================================================
-- APPROVE FACT
-- Only draft facts can be approved.
-- Every state mutation increments version.
-- ============================================================

create function public.approve_reto_knowledge_fact_admin(
  p_fact_id uuid,
  p_expected_version integer,
  p_source_reference text,
  p_activate boolean,
  p_actor_email text,
  p_request_id uuid
)
returns table (
  result_fact_id uuid,
  result_version integer,
  result_review_status text,
  result_is_active boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_actor_email, '')));
  v_source_reference text := pg_catalog.btrim(coalesce(p_source_reference, ''));
  v_before public.reto_knowledge_facts%rowtype;
  v_after public.reto_knowledge_facts%rowtype;
begin
  if p_fact_id is null
     or p_expected_version is null
     or p_expected_version <= 0
     or p_activate is null
     or p_request_id is null
     or v_actor = ''
     or pg_catalog.length(v_actor) > 320
     or v_source_reference = ''
     or pg_catalog.length(v_source_reference) > 4000 then
    raise exception 'RETO_FACT_ADMIN_INVALID_INPUT';
  end if;

  select f.*
    into v_before
  from public.reto_knowledge_facts f
  where f.id = p_fact_id
  for update;

  if not found then
    raise exception 'RETO_FACT_ADMIN_NOT_FOUND';
  end if;

  if v_before.version <> p_expected_version then
    raise exception 'RETO_FACT_ADMIN_VERSION_CONFLICT';
  end if;

  if v_before.review_status <> 'draft' then
    raise exception 'RETO_FACT_ADMIN_STATE_INVALID';
  end if;

  update public.reto_knowledge_facts f
  set source_reference = v_source_reference,
      review_status = 'approved',
      reviewed_at = pg_catalog.now(),
      is_active = p_activate,
      version = f.version + 1,
      updated_at = pg_catalog.now()
  where f.id = p_fact_id
    and f.version = p_expected_version
    and f.review_status = 'draft'
  returning *
    into v_after;

  if not found then
    raise exception 'RETO_FACT_ADMIN_VERSION_CONFLICT';
  end if;

  insert into public.reto_question_bank_audit (
    request_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_snapshot,
    after_snapshot
  )
  values (
    p_request_id,
    v_actor,
    'fact.approve',
    'fact',
    v_after.id,
    pg_catalog.to_jsonb(v_before),
    pg_catalog.to_jsonb(v_after)
  );

  return query
  select
    v_after.id,
    v_after.version,
    v_after.review_status,
    v_after.is_active;
end
$function$;

alter function public.approve_reto_knowledge_fact_admin(
  uuid,integer,text,boolean,text,uuid
) owner to postgres;

revoke all on function public.approve_reto_knowledge_fact_admin(
  uuid,integer,text,boolean,text,uuid
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.approve_reto_knowledge_fact_admin(
  uuid,integer,text,boolean,text,uuid
) to service_role;

-- ============================================================
-- RETIRE FACT
-- No physical DELETE RPC is created.
-- ============================================================

create function public.retire_reto_knowledge_fact_admin(
  p_fact_id uuid,
  p_expected_version integer,
  p_actor_email text,
  p_request_id uuid
)
returns table (
  result_fact_id uuid,
  result_version integer,
  result_review_status text,
  result_is_active boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_actor_email, '')));
  v_before public.reto_knowledge_facts%rowtype;
  v_after public.reto_knowledge_facts%rowtype;
begin
  if p_fact_id is null
     or p_expected_version is null
     or p_expected_version <= 0
     or p_request_id is null
     or v_actor = ''
     or pg_catalog.length(v_actor) > 320 then
    raise exception 'RETO_FACT_ADMIN_INVALID_INPUT';
  end if;

  select f.*
    into v_before
  from public.reto_knowledge_facts f
  where f.id = p_fact_id
  for update;

  if not found then
    raise exception 'RETO_FACT_ADMIN_NOT_FOUND';
  end if;

  if v_before.version <> p_expected_version then
    raise exception 'RETO_FACT_ADMIN_VERSION_CONFLICT';
  end if;

  if v_before.review_status = 'retired' then
    raise exception 'RETO_FACT_ADMIN_STATE_INVALID';
  end if;

  update public.reto_knowledge_facts f
  set review_status = 'retired',
      is_active = false,
      version = f.version + 1,
      updated_at = pg_catalog.now()
  where f.id = p_fact_id
    and f.version = p_expected_version
    and f.review_status <> 'retired'
  returning *
    into v_after;

  if not found then
    raise exception 'RETO_FACT_ADMIN_VERSION_CONFLICT';
  end if;

  insert into public.reto_question_bank_audit (
    request_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_snapshot,
    after_snapshot
  )
  values (
    p_request_id,
    v_actor,
    'fact.retire',
    'fact',
    v_after.id,
    pg_catalog.to_jsonb(v_before),
    pg_catalog.to_jsonb(v_after)
  );

  return query
  select
    v_after.id,
    v_after.version,
    v_after.review_status,
    v_after.is_active;
end
$function$;

alter function public.retire_reto_knowledge_fact_admin(
  uuid,integer,text,uuid
) owner to postgres;

revoke all on function public.retire_reto_knowledge_fact_admin(
  uuid,integer,text,uuid
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.retire_reto_knowledge_fact_admin(
  uuid,integer,text,uuid
) to service_role;

-- ============================================================
-- POSTFLIGHT
-- ============================================================

do $postflight$
declare
  v_proc regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
  v_name text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.create_reto_knowledge_fact_admin(text,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid)',
    'public.update_reto_knowledge_fact_admin(uuid,integer,text,text,text,jsonb,text[],smallint,text,timestamptz,timestamptz,text[],text,uuid)',
    'public.approve_reto_knowledge_fact_admin(uuid,integer,text,boolean,text,uuid)',
    'public.retire_reto_knowledge_fact_admin(uuid,integer,text,uuid)'
  ]
  loop
    v_proc := pg_catalog.to_regprocedure(v_signature);

    if v_proc is null then
      raise exception 'B2C_E5F22B_POSTFLIGHT: RPC missing: %', v_signature;
    end if;

    select p.proname, r.rolname, p.prosecdef, p.proconfig
      into v_name, v_owner, v_security_definer, v_config
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r
      on r.oid = p.proowner
    where p.oid = v_proc::oid;

    if not found
       or v_owner <> 'postgres'
       or v_security_definer is not true
       or v_config is null
       or not ('search_path=pg_catalog' = any(v_config)) then
      raise exception 'B2C_E5F22B_POSTFLIGHT: unexpected RPC properties: %', v_signature;
    end if;

    if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE') then
      raise exception 'B2C_E5F22B_POSTFLIGHT: unexpected RPC privileges: %', v_signature;
    end if;
  end loop;

  if pg_catalog.has_table_privilege(
       'service_role','public.reto_knowledge_facts','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_knowledge_facts','UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_knowledge_facts','DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_bank_audit','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_bank_audit','UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_bank_audit','DELETE'
     ) then
    raise exception 'B2C_E5F22B_POSTFLIGHT: direct service_role mutation privilege drifted';
  end if;

  if exists (select 1 from public.reto_knowledge_facts limit 1) then
    raise exception 'B2C_E5F22B_POSTFLIGHT: migration must not load facts';
  end if;

  if exists (select 1 from public.reto_question_bank_audit limit 1) then
    raise exception 'B2C_E5F22B_POSTFLIGHT: migration must not create audit rows';
  end if;
end
$postflight$;

commit;

-- B2C-E5F22C2
-- Secure admin RPCs for private Reto question templates.
-- No template/audit data is loaded by this migration.

begin;

do $preflight$
declare
  v_policy_count integer;
  v_rls_count integer;
begin
  if pg_catalog.to_regclass('public.reto_question_templates') is null
     or pg_catalog.to_regclass('public.reto_question_bank_audit') is null then
    raise exception 'B2C_E5F22C2_ABORT: required private tables are missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reto_question_templates'
      and column_name = 'version'
      and data_type = 'integer'
      and is_nullable = 'NO'
  ) then
    raise exception 'B2C_E5F22C2_ABORT: template versioning foundation missing';
  end if;

  if pg_catalog.to_regprocedure(
       'public.create_reto_question_template_admin(text,text,text,text[],jsonb,smallint,integer,text,uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.update_reto_question_template_admin(uuid,integer,text,text,text[],jsonb,smallint,integer,text,uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.approve_reto_question_template_admin(uuid,integer,boolean,text,uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.retire_reto_question_template_admin(uuid,integer,text,uuid)'
     ) is not null then
    raise exception 'B2C_E5F22C2_ABORT: one or more target RPCs already exist';
  end if;

  if exists (select 1 from public.reto_question_templates limit 1) then
    raise exception 'B2C_E5F22C2_ABORT: templates table must still be empty';
  end if;

  if exists (select 1 from public.reto_question_bank_audit limit 1) then
    raise exception 'B2C_E5F22C2_ABORT: audit table must still be empty';
  end if;

  select pg_catalog.count(*)
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in ('reto_question_templates', 'reto_question_bank_audit');

  if v_policy_count <> 0 then
    raise exception 'B2C_E5F22C2_ABORT: unexpected RLS policies';
  end if;

  select pg_catalog.count(*)
    into v_rls_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('reto_question_templates', 'reto_question_bank_audit')
    and c.relrowsecurity is true;

  if v_rls_count <> 2 then
    raise exception 'B2C_E5F22C2_ABORT: RLS must remain enabled';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role','public.reto_question_bank_audit','SELECT'
     ) then
    raise exception 'B2C_E5F22C2_ABORT: required service_role SELECT privilege missing';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','DELETE'
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
    raise exception 'B2C_E5F22C2_ABORT: unexpected direct service_role mutation privilege';
  end if;
end
$preflight$;

create function public.create_reto_question_template_admin(
  p_code text,
  p_fact_type text,
  p_operator_code text,
  p_allowed_sources text[],
  p_config jsonb,
  p_difficulty smallint,
  p_renderer_version integer,
  p_actor_email text,
  p_request_id uuid
)
returns table (
  result_template_id uuid,
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
  v_code text := pg_catalog.btrim(coalesce(p_code, ''));
  v_fact_type text := pg_catalog.btrim(coalesce(p_fact_type, ''));
  v_operator_code text := pg_catalog.btrim(coalesce(p_operator_code, ''));
  v_after public.reto_question_templates%rowtype;
begin
  if p_request_id is null
     or v_actor = ''
     or pg_catalog.length(v_actor) > 320
     or v_code = ''
     or v_fact_type = ''
     or v_operator_code = ''
     or p_allowed_sources is null
     or pg_catalog.cardinality(p_allowed_sources) < 1
     or pg_catalog.cardinality(p_allowed_sources) > 3
     or pg_catalog.array_position(p_allowed_sources, null) is not null
     or p_config is null
     or pg_catalog.jsonb_typeof(p_config) <> 'object'
     or pg_catalog.octet_length(p_config::text) > 262144
     or p_difficulty is null
     or p_renderer_version is null
     or p_renderer_version <> 1
     or not (
       (v_fact_type = 'boolean' and v_operator_code = 'BOOL_EXPLICIT_VARIANT')
       or (v_fact_type = 'integer' and v_operator_code = 'INT_EQUALS_VARIANT')
       or (v_fact_type = 'decimal' and v_operator_code = 'DECIMAL_EQUALS_VARIANT')
       or (v_fact_type = 'text' and v_operator_code = 'TEXT_EQUALS_VARIANT')
       or (v_fact_type = 'date' and v_operator_code = 'DATE_EQUALS_VARIANT')
       or (v_fact_type = 'membership' and v_operator_code = 'MEMBERSHIP_DIRECT')
     ) then
    raise exception 'RETO_TEMPLATE_ADMIN_INVALID_INPUT';
  end if;

  begin
    insert into public.reto_question_templates (
      code,
      fact_type,
      operator_code,
      allowed_sources,
      config,
      difficulty,
      renderer_version,
      review_status,
      reviewed_at,
      is_active,
      version,
      created_at,
      updated_at
    )
    values (
      v_code,
      v_fact_type,
      v_operator_code,
      p_allowed_sources,
      p_config,
      p_difficulty,
      p_renderer_version,
      'draft',
      null,
      false,
      1,
      pg_catalog.now(),
      pg_catalog.now()
    )
    returning *
      into v_after;
  exception
    when unique_violation then
      raise exception 'RETO_TEMPLATE_ADMIN_CREATE_CONFLICT';
    when check_violation then
      raise exception 'RETO_TEMPLATE_ADMIN_INVALID_INPUT';
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
    'template.create',
    'template',
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

alter function public.create_reto_question_template_admin(
  text,text,text,text[],jsonb,smallint,integer,text,uuid
) owner to postgres;

revoke all on function public.create_reto_question_template_admin(
  text,text,text,text[],jsonb,smallint,integer,text,uuid
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.create_reto_question_template_admin(
  text,text,text,text[],jsonb,smallint,integer,text,uuid
) to service_role;

create function public.update_reto_question_template_admin(
  p_template_id uuid,
  p_expected_version integer,
  p_fact_type text,
  p_operator_code text,
  p_allowed_sources text[],
  p_config jsonb,
  p_difficulty smallint,
  p_renderer_version integer,
  p_actor_email text,
  p_request_id uuid
)
returns table (
  result_template_id uuid,
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
  v_fact_type text := pg_catalog.btrim(coalesce(p_fact_type, ''));
  v_operator_code text := pg_catalog.btrim(coalesce(p_operator_code, ''));
  v_before public.reto_question_templates%rowtype;
  v_after public.reto_question_templates%rowtype;
begin
  if p_template_id is null
     or p_expected_version is null
     or p_expected_version <= 0
     or p_request_id is null
     or v_actor = ''
     or pg_catalog.length(v_actor) > 320
     or v_fact_type = ''
     or v_operator_code = ''
     or p_allowed_sources is null
     or pg_catalog.cardinality(p_allowed_sources) < 1
     or pg_catalog.cardinality(p_allowed_sources) > 3
     or pg_catalog.array_position(p_allowed_sources, null) is not null
     or p_config is null
     or pg_catalog.jsonb_typeof(p_config) <> 'object'
     or pg_catalog.octet_length(p_config::text) > 262144
     or p_difficulty is null
     or p_renderer_version is null
     or p_renderer_version <> 1
     or not (
       (v_fact_type = 'boolean' and v_operator_code = 'BOOL_EXPLICIT_VARIANT')
       or (v_fact_type = 'integer' and v_operator_code = 'INT_EQUALS_VARIANT')
       or (v_fact_type = 'decimal' and v_operator_code = 'DECIMAL_EQUALS_VARIANT')
       or (v_fact_type = 'text' and v_operator_code = 'TEXT_EQUALS_VARIANT')
       or (v_fact_type = 'date' and v_operator_code = 'DATE_EQUALS_VARIANT')
       or (v_fact_type = 'membership' and v_operator_code = 'MEMBERSHIP_DIRECT')
     ) then
    raise exception 'RETO_TEMPLATE_ADMIN_INVALID_INPUT';
  end if;

  select t.*
    into v_before
  from public.reto_question_templates t
  where t.id = p_template_id
  for update;

  if not found then
    raise exception 'RETO_TEMPLATE_ADMIN_NOT_FOUND';
  end if;

  if v_before.version <> p_expected_version then
    raise exception 'RETO_TEMPLATE_ADMIN_VERSION_CONFLICT';
  end if;

  begin
    update public.reto_question_templates t
    set fact_type = v_fact_type,
        operator_code = v_operator_code,
        allowed_sources = p_allowed_sources,
        config = p_config,
        difficulty = p_difficulty,
        renderer_version = p_renderer_version,
        review_status = 'draft',
        reviewed_at = null,
        is_active = false,
        version = t.version + 1,
        updated_at = pg_catalog.now()
    where t.id = p_template_id
      and t.version = p_expected_version
    returning *
      into v_after;
  exception
    when check_violation then
      raise exception 'RETO_TEMPLATE_ADMIN_INVALID_INPUT';
  end;

  if not found then
    raise exception 'RETO_TEMPLATE_ADMIN_VERSION_CONFLICT';
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
    'template.update',
    'template',
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

alter function public.update_reto_question_template_admin(
  uuid,integer,text,text,text[],jsonb,smallint,integer,text,uuid
) owner to postgres;

revoke all on function public.update_reto_question_template_admin(
  uuid,integer,text,text,text[],jsonb,smallint,integer,text,uuid
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.update_reto_question_template_admin(
  uuid,integer,text,text,text[],jsonb,smallint,integer,text,uuid
) to service_role;

create function public.approve_reto_question_template_admin(
  p_template_id uuid,
  p_expected_version integer,
  p_activate boolean,
  p_actor_email text,
  p_request_id uuid
)
returns table (
  result_template_id uuid,
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
  v_before public.reto_question_templates%rowtype;
  v_after public.reto_question_templates%rowtype;
begin
  if p_template_id is null
     or p_expected_version is null
     or p_expected_version <= 0
     or p_activate is null
     or p_request_id is null
     or v_actor = ''
     or pg_catalog.length(v_actor) > 320 then
    raise exception 'RETO_TEMPLATE_ADMIN_INVALID_INPUT';
  end if;

  select t.*
    into v_before
  from public.reto_question_templates t
  where t.id = p_template_id
  for update;

  if not found then
    raise exception 'RETO_TEMPLATE_ADMIN_NOT_FOUND';
  end if;

  if v_before.version <> p_expected_version then
    raise exception 'RETO_TEMPLATE_ADMIN_VERSION_CONFLICT';
  end if;

  if v_before.review_status <> 'draft' then
    raise exception 'RETO_TEMPLATE_ADMIN_STATE_INVALID';
  end if;

  if v_before.renderer_version <> 1
     or not (
       (v_before.fact_type = 'boolean' and v_before.operator_code = 'BOOL_EXPLICIT_VARIANT')
       or (v_before.fact_type = 'integer' and v_before.operator_code = 'INT_EQUALS_VARIANT')
       or (v_before.fact_type = 'decimal' and v_before.operator_code = 'DECIMAL_EQUALS_VARIANT')
       or (v_before.fact_type = 'text' and v_before.operator_code = 'TEXT_EQUALS_VARIANT')
       or (v_before.fact_type = 'date' and v_before.operator_code = 'DATE_EQUALS_VARIANT')
       or (v_before.fact_type = 'membership' and v_before.operator_code = 'MEMBERSHIP_DIRECT')
     ) then
    raise exception 'RETO_TEMPLATE_ADMIN_RUNTIME_CONTRACT_INVALID';
  end if;

  update public.reto_question_templates t
  set review_status = 'approved',
      reviewed_at = pg_catalog.now(),
      is_active = p_activate,
      version = t.version + 1,
      updated_at = pg_catalog.now()
  where t.id = p_template_id
    and t.version = p_expected_version
    and t.review_status = 'draft'
  returning *
    into v_after;

  if not found then
    raise exception 'RETO_TEMPLATE_ADMIN_VERSION_CONFLICT';
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
    'template.approve',
    'template',
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

alter function public.approve_reto_question_template_admin(
  uuid,integer,boolean,text,uuid
) owner to postgres;

revoke all on function public.approve_reto_question_template_admin(
  uuid,integer,boolean,text,uuid
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.approve_reto_question_template_admin(
  uuid,integer,boolean,text,uuid
) to service_role;

create function public.retire_reto_question_template_admin(
  p_template_id uuid,
  p_expected_version integer,
  p_actor_email text,
  p_request_id uuid
)
returns table (
  result_template_id uuid,
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
  v_before public.reto_question_templates%rowtype;
  v_after public.reto_question_templates%rowtype;
begin
  if p_template_id is null
     or p_expected_version is null
     or p_expected_version <= 0
     or p_request_id is null
     or v_actor = ''
     or pg_catalog.length(v_actor) > 320 then
    raise exception 'RETO_TEMPLATE_ADMIN_INVALID_INPUT';
  end if;

  select t.*
    into v_before
  from public.reto_question_templates t
  where t.id = p_template_id
  for update;

  if not found then
    raise exception 'RETO_TEMPLATE_ADMIN_NOT_FOUND';
  end if;

  if v_before.version <> p_expected_version then
    raise exception 'RETO_TEMPLATE_ADMIN_VERSION_CONFLICT';
  end if;

  if v_before.review_status = 'retired' then
    raise exception 'RETO_TEMPLATE_ADMIN_STATE_INVALID';
  end if;

  update public.reto_question_templates t
  set review_status = 'retired',
      is_active = false,
      version = t.version + 1,
      updated_at = pg_catalog.now()
  where t.id = p_template_id
    and t.version = p_expected_version
    and t.review_status <> 'retired'
  returning *
    into v_after;

  if not found then
    raise exception 'RETO_TEMPLATE_ADMIN_VERSION_CONFLICT';
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
    'template.retire',
    'template',
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

alter function public.retire_reto_question_template_admin(
  uuid,integer,text,uuid
) owner to postgres;

revoke all on function public.retire_reto_question_template_admin(
  uuid,integer,text,uuid
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.retire_reto_question_template_admin(
  uuid,integer,text,uuid
) to service_role;

do $postflight$
declare
  v_proc regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
  v_name text;
  v_signature text;
  v_policy_count integer;
  v_rls_count integer;
begin
  foreach v_signature in array array[
    'public.create_reto_question_template_admin(text,text,text,text[],jsonb,smallint,integer,text,uuid)',
    'public.update_reto_question_template_admin(uuid,integer,text,text,text[],jsonb,smallint,integer,text,uuid)',
    'public.approve_reto_question_template_admin(uuid,integer,boolean,text,uuid)',
    'public.retire_reto_question_template_admin(uuid,integer,text,uuid)'
  ]
  loop
    v_proc := pg_catalog.to_regprocedure(v_signature);

    if v_proc is null then
      raise exception 'B2C_E5F22C2_POSTFLIGHT: RPC missing: %', v_signature;
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
      raise exception 'B2C_E5F22C2_POSTFLIGHT: unexpected RPC properties: %', v_signature;
    end if;

    if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE') then
      raise exception 'B2C_E5F22C2_POSTFLIGHT: unexpected RPC privileges: %', v_signature;
    end if;
  end loop;

  select pg_catalog.count(*)
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename in ('reto_question_templates', 'reto_question_bank_audit');

  if v_policy_count <> 0 then
    raise exception 'B2C_E5F22C2_POSTFLIGHT: unexpected RLS policies';
  end if;

  select pg_catalog.count(*)
    into v_rls_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('reto_question_templates', 'reto_question_bank_audit')
    and c.relrowsecurity is true;

  if v_rls_count <> 2 then
    raise exception 'B2C_E5F22C2_POSTFLIGHT: RLS drifted';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role','public.reto_question_bank_audit','SELECT'
     ) then
    raise exception 'B2C_E5F22C2_POSTFLIGHT: required service_role SELECT privilege missing';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','DELETE'
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
    raise exception 'B2C_E5F22C2_POSTFLIGHT: direct service_role mutation privilege drifted';
  end if;

  if exists (select 1 from public.reto_question_templates limit 1) then
    raise exception 'B2C_E5F22C2_POSTFLIGHT: migration must not load templates';
  end if;

  if exists (select 1 from public.reto_question_bank_audit limit 1) then
    raise exception 'B2C_E5F22C2_POSTFLIGHT: migration must not create audit rows';
  end if;
end
$postflight$;

commit;

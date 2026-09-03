-- B2C-E5F22C1
-- Add administrative template versioning without rewriting the existing
-- prize-question issue RPC or the main instance-integrity trigger.

begin;

do $preflight$
declare
  v_policy_count integer;
  v_integrity_trigger_count integer;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
  v_proc regprocedure;
begin
  if pg_catalog.to_regclass('public.reto_question_templates') is null
     or pg_catalog.to_regclass('public.reto_prize_question_instances') is null
     or pg_catalog.to_regclass('public.reto_knowledge_facts') is null then
    raise exception 'B2C_E5F22C1_ABORT: required private tables are missing';
  end if;

  if pg_catalog.to_regprocedure(
       'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)'
     ) is null
     or pg_catalog.to_regprocedure(
       'public.enforce_reto_prize_question_instance_integrity()'
     ) is null then
    raise exception 'B2C_E5F22C1_ABORT: required prize functions are missing';
  end if;

  if pg_catalog.to_regprocedure(
       'public.enforce_reto_prize_question_instance_template_version()'
     ) is not null then
    raise exception 'B2C_E5F22C1_ABORT: template-version function already exists';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reto_question_templates'
      and column_name = 'version'
  ) then
    raise exception 'B2C_E5F22C1_ABORT: template version column already exists';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reto_prize_question_instances'
      and column_name = 'template_version'
  ) then
    raise exception 'B2C_E5F22C1_ABORT: instance template_version column already exists';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.reto_prize_question_instances'::regclass
      and t.tgname = 'trg_reto_prize_question_instance_template_version'
      and not t.tgisinternal
  ) then
    raise exception 'B2C_E5F22C1_ABORT: template-version trigger already exists';
  end if;

  if exists (select 1 from public.reto_question_templates limit 1)
     or exists (select 1 from public.reto_prize_question_instances limit 1)
     or exists (select 1 from public.reto_knowledge_facts limit 1) then
    raise exception 'B2C_E5F22C1_ABORT: private question bank must still be empty';
  end if;

  select pg_catalog.count(*)
    into v_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (
      'reto_question_templates',
      'reto_prize_question_instances'
    );

  if v_policy_count <> 0 then
    raise exception 'B2C_E5F22C1_ABORT: unexpected RLS policies';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role','public.reto_prize_question_instances','SELECT'
     ) then
    raise exception 'B2C_E5F22C1_ABORT: required service_role SELECT privilege missing';
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
       'service_role','public.reto_prize_question_instances','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_prize_question_instances','UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_prize_question_instances','DELETE'
     ) then
    raise exception 'B2C_E5F22C1_ABORT: unexpected direct service_role mutation privilege';
  end if;

  select pg_catalog.count(*)
    into v_integrity_trigger_count
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.reto_prize_question_instances'::regclass
    and t.tgname = 'trg_reto_prize_question_instance_integrity'
    and not t.tgisinternal;

  if v_integrity_trigger_count <> 1 then
    raise exception 'B2C_E5F22C1_ABORT: main integrity trigger missing or duplicated';
  end if;

  v_proc := pg_catalog.to_regprocedure(
    'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)'
  );

  select r.rolname, p.prosecdef, p.proconfig
    into v_owner, v_security_definer, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid = v_proc::oid;

  if not found
     or v_owner <> 'postgres'
     or v_security_definer is not true
     or v_config is null
     or not ('search_path=pg_catalog' = any(v_config))
     or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F22C1_ABORT: issue RPC security contract drifted';
  end if;

  v_proc := pg_catalog.to_regprocedure(
    'public.enforce_reto_prize_question_instance_integrity()'
  );

  select r.rolname, p.prosecdef, p.proconfig
    into v_owner, v_security_definer, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid = v_proc::oid;

  if not found
     or v_owner <> 'postgres'
     or v_security_definer is not true
     or v_config is null
     or not ('search_path=pg_catalog' = any(v_config))
     or pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F22C1_ABORT: main integrity function security contract drifted';
  end if;
end
$preflight$;

alter table public.reto_question_templates
  add column version integer not null default 1;

alter table public.reto_question_templates
  add constraint reto_question_templates_version_check
  check (version > 0);

alter table public.reto_prize_question_instances
  add column template_version integer not null;

alter table public.reto_prize_question_instances
  add constraint reto_prize_question_instances_template_version_check
  check (template_version > 0);

create function public.enforce_reto_prize_question_instance_template_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_template_version integer;
begin
  if tg_op = 'INSERT' then
    if new.template_id is null then
      raise exception 'RETO_INSTANCE_TEMPLATE_VERSION_TEMPLATE_NOT_FOUND';
    end if;

    select t.version
      into v_template_version
    from public.reto_question_templates t
    where t.id = new.template_id
    for share;

    if not found then
      raise exception 'RETO_INSTANCE_TEMPLATE_VERSION_TEMPLATE_NOT_FOUND';
    end if;

    if v_template_version is null or v_template_version <= 0 then
      raise exception 'RETO_INSTANCE_TEMPLATE_VERSION_INVALID';
    end if;

    new.template_version := v_template_version;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.template_version is distinct from old.template_version then
      raise exception 'RETO_INSTANCE_TEMPLATE_VERSION_IMMUTABLE';
    end if;

    return new;
  end if;

  raise exception 'RETO_INSTANCE_TEMPLATE_VERSION_OPERATION_INVALID';
end
$function$;

alter function public.enforce_reto_prize_question_instance_template_version()
  owner to postgres;

revoke all on function public.enforce_reto_prize_question_instance_template_version()
  from PUBLIC, anon, authenticated, service_role;

create trigger trg_reto_prize_question_instance_template_version
before insert or update
on public.reto_prize_question_instances
for each row
execute function public.enforce_reto_prize_question_instance_template_version();

do $postflight$
declare
  v_policy_count integer;
  v_integrity_trigger_count integer;
  v_version_trigger_count integer;
  v_owner text;
  v_security_definer boolean;
  v_config text[];
  v_proc regprocedure;
  v_default text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reto_question_templates'
      and column_name = 'version'
      and data_type = 'integer'
      and is_nullable = 'NO'
  ) then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: template version column invalid';
  end if;

  select c.column_default
    into v_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'reto_question_templates'
    and c.column_name = 'version';

  if not found or v_default is null or pg_catalog.btrim(v_default) not in ('1', '1::integer') then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: template version default invalid';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reto_prize_question_instances'
      and column_name = 'template_version'
      and data_type = 'integer'
      and is_nullable = 'NO'
      and column_default is null
  ) then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: instance template_version column invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.reto_question_templates'::regclass
      and c.conname = 'reto_question_templates_version_check'
      and c.contype = 'c'
      and c.convalidated is true
      and pg_catalog.strpos(
        pg_catalog.pg_get_constraintdef(c.oid, true),
        'version > 0'
      ) > 0
  ) then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: template version constraint invalid';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.reto_prize_question_instances'::regclass
      and c.conname = 'reto_prize_question_instances_template_version_check'
      and c.contype = 'c'
      and c.convalidated is true
      and pg_catalog.strpos(
        pg_catalog.pg_get_constraintdef(c.oid, true),
        'template_version > 0'
      ) > 0
  ) then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: instance template_version constraint invalid';
  end if;

  v_proc := pg_catalog.to_regprocedure(
    'public.enforce_reto_prize_question_instance_template_version()'
  );

  if v_proc is null then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: template-version function missing';
  end if;

  select r.rolname, p.prosecdef, p.proconfig
    into v_owner, v_security_definer, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid = v_proc::oid;

  if not found
     or v_owner <> 'postgres'
     or v_security_definer is not true
     or v_config is null
     or not ('search_path=pg_catalog' = any(v_config))
     or pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: template-version function security invalid';
  end if;

  select pg_catalog.count(*)
    into v_version_trigger_count
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.reto_prize_question_instances'::regclass
    and t.tgname = 'trg_reto_prize_question_instance_template_version'
    and not t.tgisinternal
    and t.tgenabled = 'O';

  if v_version_trigger_count <> 1 then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: template-version trigger invalid';
  end if;

  select pg_catalog.count(*)
    into v_integrity_trigger_count
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.reto_prize_question_instances'::regclass
    and t.tgname = 'trg_reto_prize_question_instance_integrity'
    and not t.tgisinternal
    and t.tgenabled = 'O';

  if v_integrity_trigger_count <> 1 then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: main integrity trigger drifted';
  end if;

  select pg_catalog.count(*)
    into v_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('reto_question_templates','reto_prize_question_instances');

  if v_policy_count <> 0 then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: unexpected RLS policies';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role','public.reto_question_templates','SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role','public.reto_prize_question_instances','SELECT'
     ) then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: required service_role SELECT privilege missing';
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
       'service_role','public.reto_prize_question_instances','INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_prize_question_instances','UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role','public.reto_prize_question_instances','DELETE'
     ) then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: direct service_role mutation privilege drifted';
  end if;

  v_proc := pg_catalog.to_regprocedure(
    'public.issue_reto_prize_question_atomic(uuid,uuid,text,integer,text,uuid,uuid,jsonb,text,boolean,timestamptz,timestamptz,smallint)'
  );

  select r.rolname, p.prosecdef, p.proconfig
    into v_owner, v_security_definer, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid = v_proc::oid;

  if not found
     or v_owner <> 'postgres'
     or v_security_definer is not true
     or v_config is null
     or not ('search_path=pg_catalog' = any(v_config))
     or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: issue RPC security contract drifted';
  end if;

  v_proc := pg_catalog.to_regprocedure(
    'public.enforce_reto_prize_question_instance_integrity()'
  );

  select r.rolname, p.prosecdef, p.proconfig
    into v_owner, v_security_definer, v_config
  from pg_catalog.pg_proc p
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where p.oid = v_proc::oid;

  if not found
     or v_owner <> 'postgres'
     or v_security_definer is not true
     or v_config is null
     or not ('search_path=pg_catalog' = any(v_config))
     or pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: main integrity function security contract drifted';
  end if;

  if exists (select 1 from public.reto_question_templates limit 1)
     or exists (select 1 from public.reto_prize_question_instances limit 1)
     or exists (select 1 from public.reto_knowledge_facts limit 1) then
    raise exception 'B2C_E5F22C1_POSTFLIGHT: migration must not load private bank data';
  end if;
end
$postflight$;

commit;

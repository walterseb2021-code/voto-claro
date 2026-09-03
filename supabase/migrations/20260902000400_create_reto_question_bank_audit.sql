-- B2C-E5F22A
-- Private append-only audit foundation for the Reto question bank.
-- This migration does not populate or mutate facts/templates.

begin;

do $preflight$
begin
  if pg_catalog.to_regclass('public.reto_question_bank_audit') is not null then
    raise exception 'B2C_E5F22A_ABORT: public.reto_question_bank_audit already exists';
  end if;

  if pg_catalog.to_regprocedure('public.enforce_reto_question_bank_audit_append_only()') is not null then
    raise exception 'B2C_E5F22A_ABORT: append-only trigger function already exists';
  end if;

  if pg_catalog.to_regclass('public.reto_knowledge_facts') is null
     or pg_catalog.to_regclass('public.reto_question_templates') is null then
    raise exception 'B2C_E5F22A_ABORT: private question-bank foundation is missing';
  end if;

  if exists (select 1 from public.reto_knowledge_facts limit 1)
     or exists (select 1 from public.reto_question_templates limit 1) then
    raise exception 'B2C_E5F22A_ABORT: facts/templates must still be empty before audit foundation';
  end if;

  if pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','INSERT')
     or pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','UPDATE')
     or pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','DELETE')
     or pg_catalog.has_table_privilege('service_role','public.reto_question_templates','INSERT')
     or pg_catalog.has_table_privilege('service_role','public.reto_question_templates','UPDATE')
     or pg_catalog.has_table_privilege('service_role','public.reto_question_templates','DELETE') then
    raise exception 'B2C_E5F22A_ABORT: unexpected direct service_role mutation privilege';
  end if;
end
$preflight$;

create table public.reto_question_bank_audit (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  created_at timestamptz not null default pg_catalog.now(),
  request_id uuid not null,
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  before_snapshot jsonb,
  after_snapshot jsonb,

  constraint reto_question_bank_audit_actor_check
    check (
      pg_catalog.btrim(actor_email) <> ''
      and pg_catalog.length(pg_catalog.btrim(actor_email)) <= 320
      and actor_email = pg_catalog.lower(pg_catalog.btrim(actor_email))
    ),

  constraint reto_question_bank_audit_action_check
    check (pg_catalog.btrim(action) ~ '^[a-z][a-z0-9_.:-]{2,79}$'),

  constraint reto_question_bank_audit_entity_type_check
    check (entity_type in ('fact', 'template')),

  constraint reto_question_bank_audit_snapshot_check
    check (
      (before_snapshot is null or pg_catalog.jsonb_typeof(before_snapshot) = 'object')
      and (after_snapshot is null or pg_catalog.jsonb_typeof(after_snapshot) = 'object')
      and (before_snapshot is not null or after_snapshot is not null)
    )
);

alter table public.reto_question_bank_audit owner to postgres;
alter table public.reto_question_bank_audit enable row level security;

create index reto_question_bank_audit_entity_idx
  on public.reto_question_bank_audit(entity_type, entity_id, created_at desc);

create index reto_question_bank_audit_request_idx
  on public.reto_question_bank_audit(request_id);

create index reto_question_bank_audit_created_idx
  on public.reto_question_bank_audit(created_at desc);

create function public.enforce_reto_question_bank_audit_append_only()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception using
    errcode = '42501',
    message = 'RETO_QUESTION_BANK_AUDIT_APPEND_ONLY';
end;
$function$;

alter function public.enforce_reto_question_bank_audit_append_only()
  owner to postgres;

create trigger trg_reto_question_bank_audit_append_only
before update or delete
on public.reto_question_bank_audit
for each row
execute function public.enforce_reto_question_bank_audit_append_only();

revoke all privileges
on table public.reto_question_bank_audit
from PUBLIC, anon, authenticated, service_role;

grant select
on table public.reto_question_bank_audit
to service_role;

revoke all privileges
on function public.enforce_reto_question_bank_audit_append_only()
from PUBLIC, anon, authenticated, service_role;

do $postflight$
declare
  v_policy_count integer;
  v_table_owner text;
  v_function_owner text;
  v_rls boolean;
  v_trigger_count integer;
begin
  if pg_catalog.to_regclass('public.reto_question_bank_audit') is null then
    raise exception 'B2C_E5F22A_POSTFLIGHT: audit table missing';
  end if;

  select r.rolname, c.relrowsecurity
    into v_table_owner, v_rls
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'public'
    and c.relname = 'reto_question_bank_audit';

  if v_table_owner <> 'postgres' then
    raise exception 'B2C_E5F22A_POSTFLIGHT: unexpected table owner';
  end if;

  if v_rls is not true then
    raise exception 'B2C_E5F22A_POSTFLIGHT: RLS is not enabled';
  end if;

  select pg_catalog.count(*)
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'reto_question_bank_audit';

  if v_policy_count <> 0 then
    raise exception 'B2C_E5F22A_POSTFLIGHT: unexpected RLS policies';
  end if;

  if pg_catalog.has_table_privilege('anon','public.reto_question_bank_audit','SELECT')
     or pg_catalog.has_table_privilege('authenticated','public.reto_question_bank_audit','SELECT') then
    raise exception 'B2C_E5F22A_POSTFLIGHT: unexpected public read privilege';
  end if;

  if not pg_catalog.has_table_privilege('service_role','public.reto_question_bank_audit','SELECT') then
    raise exception 'B2C_E5F22A_POSTFLIGHT: service_role SELECT missing';
  end if;

  if pg_catalog.has_table_privilege('service_role','public.reto_question_bank_audit','INSERT')
     or pg_catalog.has_table_privilege('service_role','public.reto_question_bank_audit','UPDATE')
     or pg_catalog.has_table_privilege('service_role','public.reto_question_bank_audit','DELETE') then
    raise exception 'B2C_E5F22A_POSTFLIGHT: direct service_role mutation privilege found';
  end if;

  select r.rolname
    into v_function_owner
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_roles r on r.oid = p.proowner
  where n.nspname = 'public'
    and p.proname = 'enforce_reto_question_bank_audit_append_only'
    and p.pronargs = 0;

  if v_function_owner <> 'postgres' then
    raise exception 'B2C_E5F22A_POSTFLIGHT: unexpected trigger function owner';
  end if;

  if pg_catalog.has_function_privilege('anon','public.enforce_reto_question_bank_audit_append_only()','EXECUTE')
     or pg_catalog.has_function_privilege('authenticated','public.enforce_reto_question_bank_audit_append_only()','EXECUTE')
     or pg_catalog.has_function_privilege('service_role','public.enforce_reto_question_bank_audit_append_only()','EXECUTE') then
    raise exception 'B2C_E5F22A_POSTFLIGHT: unexpected trigger function EXECUTE privilege';
  end if;

  select pg_catalog.count(*)
    into v_trigger_count
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'reto_question_bank_audit'
    and t.tgname = 'trg_reto_question_bank_audit_append_only'
    and not t.tgisinternal;

  if v_trigger_count <> 1 then
    raise exception 'B2C_E5F22A_POSTFLIGHT: append-only trigger missing';
  end if;

  if exists (select 1 from public.reto_question_bank_audit limit 1) then
    raise exception 'B2C_E5F22A_POSTFLIGHT: audit table must start empty';
  end if;

  if pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','INSERT')
     or pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','UPDATE')
     or pg_catalog.has_table_privilege('service_role','public.reto_knowledge_facts','DELETE')
     or pg_catalog.has_table_privilege('service_role','public.reto_question_templates','INSERT')
     or pg_catalog.has_table_privilege('service_role','public.reto_question_templates','UPDATE')
     or pg_catalog.has_table_privilege('service_role','public.reto_question_templates','DELETE') then
    raise exception 'B2C_E5F22A_POSTFLIGHT: private bank mutation privileges drifted';
  end if;
end
$postflight$;

commit;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- ============================================================
-- B-SEC-14HAI
-- HARDEN public.espacio_proyectos
--
-- Objetivo:
-- - RLS habilitado, FORCE RLS deshabilitado
-- - eliminar las 3 policies legacy permisivas
-- - PUBLIC / anon / authenticated sin privilegios de tabla
-- - service_role con SELECT solamente
-- - conservar finalize_espacio_project_secure como unica via
--   de escritura de proyectos, ejecutable solo por service_role
-- - preservar datos existentes
-- ============================================================

do $$
declare
  v_rls boolean;
  v_force boolean;
  v_owner text;
  v_policy_count integer;
  v_total bigint;
  v_active bigint;
  v_null_owner bigint;
  v_distinct_owners bigint;
  v_duplicates bigint;
  v_realtime bigint;
  v_trigger_count bigint;
  v_rpc oid;
begin
  if to_regclass('public.espacio_proyectos') is null then
    raise exception 'BSEC14HAI: missing public.espacio_proyectos';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner)
  into v_rls, v_force, v_owner
  from pg_class c
  where c.oid = 'public.espacio_proyectos'::regclass;

  if v_owner is distinct from 'postgres' then
    raise exception 'BSEC14HAI: unexpected owner: %', v_owner;
  end if;

  if v_rls is distinct from false then
    raise exception 'BSEC14HAI: preflight expected RLS=false';
  end if;

  if v_force is distinct from false then
    raise exception 'BSEC14HAI: preflight expected FORCE_RLS=false';
  end if;

  select count(*)
  into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'espacio_proyectos';

  if v_policy_count <> 3 then
    raise exception
      'BSEC14HAI: expected 3 legacy policies, found %',
      v_policy_count;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'espacio_proyectos'
      and policyname = 'Propietarios pueden actualizar sus proyectos'
      and permissive = 'PERMISSIVE'
      and roles::text = '{public}'
      and cmd = 'UPDATE'
      and coalesce(qual, '') = 'true'
      and coalesce(with_check, '') = ''
  ) then
    raise exception 'BSEC14HAI: legacy UPDATE policy mismatch';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'espacio_proyectos'
      and policyname = 'Todos pueden ver proyectos activos'
      and permissive = 'PERMISSIVE'
      and roles::text = '{public}'
      and cmd = 'SELECT'
      and coalesce(qual, '') = '(status = ''active''::text)'
      and coalesce(with_check, '') = ''
  ) then
    raise exception 'BSEC14HAI: legacy SELECT policy mismatch';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'espacio_proyectos'
      and policyname = 'Usuarios pueden insertar proyectos'
      and permissive = 'PERMISSIVE'
      and roles::text = '{public}'
      and cmd = 'INSERT'
      and coalesce(qual, '') = ''
      and coalesce(with_check, '') = 'true'
  ) then
    raise exception 'BSEC14HAI: legacy INSERT policy mismatch';
  end if;

  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) x
    where c.oid = 'public.espacio_proyectos'::regclass
      and x.grantee = 0
  ) then
    raise exception 'BSEC14HAI: unexpected PUBLIC ACL before hardening';
  end if;

  if not (
    has_table_privilege('anon', 'public.espacio_proyectos', 'SELECT')
    and has_table_privilege('anon', 'public.espacio_proyectos', 'INSERT')
    and has_table_privilege('anon', 'public.espacio_proyectos', 'UPDATE')
    and has_table_privilege('anon', 'public.espacio_proyectos', 'DELETE')
    and has_table_privilege('anon', 'public.espacio_proyectos', 'TRUNCATE')
    and has_table_privilege('anon', 'public.espacio_proyectos', 'REFERENCES')
    and has_table_privilege('anon', 'public.espacio_proyectos', 'TRIGGER')
    and has_table_privilege('anon', 'public.espacio_proyectos', 'MAINTAIN')
  ) then
    raise exception 'BSEC14HAI: unexpected anon privileges';
  end if;

  if not (
    has_table_privilege('authenticated', 'public.espacio_proyectos', 'SELECT')
    and has_table_privilege('authenticated', 'public.espacio_proyectos', 'INSERT')
    and has_table_privilege('authenticated', 'public.espacio_proyectos', 'UPDATE')
    and has_table_privilege('authenticated', 'public.espacio_proyectos', 'DELETE')
    and has_table_privilege('authenticated', 'public.espacio_proyectos', 'TRUNCATE')
    and has_table_privilege('authenticated', 'public.espacio_proyectos', 'REFERENCES')
    and has_table_privilege('authenticated', 'public.espacio_proyectos', 'TRIGGER')
    and has_table_privilege('authenticated', 'public.espacio_proyectos', 'MAINTAIN')
  ) then
    raise exception 'BSEC14HAI: unexpected authenticated privileges';
  end if;

  if not (
    has_table_privilege('service_role', 'public.espacio_proyectos', 'SELECT')
    and has_table_privilege('service_role', 'public.espacio_proyectos', 'INSERT')
    and has_table_privilege('service_role', 'public.espacio_proyectos', 'UPDATE')
    and has_table_privilege('service_role', 'public.espacio_proyectos', 'DELETE')
    and has_table_privilege('service_role', 'public.espacio_proyectos', 'TRUNCATE')
    and has_table_privilege('service_role', 'public.espacio_proyectos', 'REFERENCES')
    and has_table_privilege('service_role', 'public.espacio_proyectos', 'TRIGGER')
    and has_table_privilege('service_role', 'public.espacio_proyectos', 'MAINTAIN')
  ) then
    raise exception 'BSEC14HAI: unexpected service_role privileges';
  end if;

  if not (select rolbypassrls from pg_roles where rolname = 'service_role') then
    raise exception 'BSEC14HAI: service_role must BYPASSRLS';
  end if;

  select count(*)
  into v_realtime
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'espacio_proyectos';

  if v_realtime <> 0 then
    raise exception 'BSEC14HAI: espacio_proyectos unexpectedly in realtime';
  end if;

  select count(*)
  into v_trigger_count
  from pg_trigger t
  where t.tgrelid = 'public.espacio_proyectos'::regclass
    and not t.tgisinternal;

  if v_trigger_count <> 0 then
    raise exception 'BSEC14HAI: unexpected user triggers: %', v_trigger_count;
  end if;

  v_rpc := to_regprocedure(
    'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)'
  );

  if v_rpc is null then
    raise exception 'BSEC14HAI: finalize RPC missing';
  end if;

  if not exists (
    select 1
    from pg_proc p
    where p.oid = v_rpc
      and p.prokind = 'f'
      and pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef is true
      and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=pg_catalog%'
      and p.prosrc ilike '%insert into public.espacio_proyectos%'
  ) then
    raise exception 'BSEC14HAI: finalize RPC security/body mismatch';
  end if;

  if not has_function_privilege('service_role', v_rpc, 'EXECUTE') then
    raise exception 'BSEC14HAI: service_role lacks finalize RPC EXECUTE';
  end if;

  if has_function_privilege('anon', v_rpc, 'EXECUTE')
     or has_function_privilege('authenticated', v_rpc, 'EXECUTE')
  then
    raise exception 'BSEC14HAI: client role can execute finalize RPC';
  end if;

  select
    count(*),
    count(*) filter (where status = 'active'),
    count(*) filter (where owner_id is null),
    count(distinct owner_id) filter (where owner_id is not null)
  into v_total, v_active, v_null_owner, v_distinct_owners
  from public.espacio_proyectos;

  select count(*)
  into v_duplicates
  from (
    select id
    from public.espacio_proyectos
    group by id
    having count(*) > 1
  ) d;

  if v_total <> 5
     or v_active <> 5
     or v_null_owner <> 0
     or v_distinct_owners <> 4
     or v_duplicates <> 0
  then
    raise exception
      'BSEC14HAI: unexpected data state total=% active=% null_owner=% owners=% dup=%',
      v_total, v_active, v_null_owner, v_distinct_owners, v_duplicates;
  end if;
end
$$;

alter table public.espacio_proyectos
  enable row level security;

drop policy "Propietarios pueden actualizar sus proyectos"
  on public.espacio_proyectos;

drop policy "Todos pueden ver proyectos activos"
  on public.espacio_proyectos;

drop policy "Usuarios pueden insertar proyectos"
  on public.espacio_proyectos;

revoke all privileges
on table public.espacio_proyectos
from PUBLIC, anon, authenticated, service_role;

grant select
on table public.espacio_proyectos
to service_role;

do $$
declare
  v_total bigint;
  v_active bigint;
  v_null_owner bigint;
  v_distinct_owners bigint;
  v_duplicates bigint;
  v_rpc oid;
  v_realtime bigint;
  v_trigger_count bigint;
begin
  if not (
    select c.relrowsecurity
    from pg_class c
    where c.oid = 'public.espacio_proyectos'::regclass
  ) then
    raise exception 'BSEC14HAI: RLS not enabled';
  end if;

  if (
    select c.relforcerowsecurity
    from pg_class c
    where c.oid = 'public.espacio_proyectos'::regclass
  ) then
    raise exception 'BSEC14HAI: FORCE RLS unexpectedly enabled';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'espacio_proyectos'
  ) then
    raise exception 'BSEC14HAI: policies remain after hardening';
  end if;

  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) x
    where c.oid = 'public.espacio_proyectos'::regclass
      and x.grantee = 0
  ) then
    raise exception 'BSEC14HAI: PUBLIC retains ACL privileges';
  end if;

  if has_table_privilege('anon', 'public.espacio_proyectos', 'SELECT')
     or has_table_privilege('anon', 'public.espacio_proyectos', 'INSERT')
     or has_table_privilege('anon', 'public.espacio_proyectos', 'UPDATE')
     or has_table_privilege('anon', 'public.espacio_proyectos', 'DELETE')
     or has_table_privilege('anon', 'public.espacio_proyectos', 'TRUNCATE')
     or has_table_privilege('anon', 'public.espacio_proyectos', 'REFERENCES')
     or has_table_privilege('anon', 'public.espacio_proyectos', 'TRIGGER')
     or has_table_privilege('anon', 'public.espacio_proyectos', 'MAINTAIN')
  then
    raise exception 'BSEC14HAI: anon retains privileges';
  end if;

  if has_table_privilege('authenticated', 'public.espacio_proyectos', 'SELECT')
     or has_table_privilege('authenticated', 'public.espacio_proyectos', 'INSERT')
     or has_table_privilege('authenticated', 'public.espacio_proyectos', 'UPDATE')
     or has_table_privilege('authenticated', 'public.espacio_proyectos', 'DELETE')
     or has_table_privilege('authenticated', 'public.espacio_proyectos', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.espacio_proyectos', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.espacio_proyectos', 'TRIGGER')
     or has_table_privilege('authenticated', 'public.espacio_proyectos', 'MAINTAIN')
  then
    raise exception 'BSEC14HAI: authenticated retains privileges';
  end if;

  if not has_table_privilege('service_role', 'public.espacio_proyectos', 'SELECT') then
    raise exception 'BSEC14HAI: service_role lost SELECT';
  end if;

  if has_table_privilege('service_role', 'public.espacio_proyectos', 'INSERT')
     or has_table_privilege('service_role', 'public.espacio_proyectos', 'UPDATE')
     or has_table_privilege('service_role', 'public.espacio_proyectos', 'DELETE')
     or has_table_privilege('service_role', 'public.espacio_proyectos', 'TRUNCATE')
     or has_table_privilege('service_role', 'public.espacio_proyectos', 'REFERENCES')
     or has_table_privilege('service_role', 'public.espacio_proyectos', 'TRIGGER')
     or has_table_privilege('service_role', 'public.espacio_proyectos', 'MAINTAIN')
  then
    raise exception 'BSEC14HAI: service_role retains excessive privileges';
  end if;

  if not (select rolbypassrls from pg_roles where rolname = 'service_role') then
    raise exception 'BSEC14HAI: service_role BYPASSRLS changed';
  end if;

  select count(*)
  into v_realtime
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'espacio_proyectos';

  if v_realtime <> 0 then
    raise exception 'BSEC14HAI: realtime state changed';
  end if;

  select count(*)
  into v_trigger_count
  from pg_trigger t
  where t.tgrelid = 'public.espacio_proyectos'::regclass
    and not t.tgisinternal;

  if v_trigger_count <> 0 then
    raise exception 'BSEC14HAI: trigger state changed';
  end if;

  v_rpc := to_regprocedure(
    'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)'
  );

  if v_rpc is null then
    raise exception 'BSEC14HAI: finalize RPC missing after hardening';
  end if;

  if not exists (
    select 1
    from pg_proc p
    where p.oid = v_rpc
      and p.prokind = 'f'
      and pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef is true
      and coalesce(array_to_string(p.proconfig, ','), '') ilike '%search_path=pg_catalog%'
      and p.prosrc ilike '%insert into public.espacio_proyectos%'
  ) then
    raise exception 'BSEC14HAI: finalize RPC changed';
  end if;

  if not has_function_privilege('service_role', v_rpc, 'EXECUTE')
     or has_function_privilege('anon', v_rpc, 'EXECUTE')
     or has_function_privilege('authenticated', v_rpc, 'EXECUTE')
  then
    raise exception 'BSEC14HAI: finalize RPC privileges changed';
  end if;

  select
    count(*),
    count(*) filter (where status = 'active'),
    count(*) filter (where owner_id is null),
    count(distinct owner_id) filter (where owner_id is not null)
  into v_total, v_active, v_null_owner, v_distinct_owners
  from public.espacio_proyectos;

  select count(*)
  into v_duplicates
  from (
    select id
    from public.espacio_proyectos
    group by id
    having count(*) > 1
  ) d;

  if v_total <> 5
     or v_active <> 5
     or v_null_owner <> 0
     or v_distinct_owners <> 4
     or v_duplicates <> 0
  then
    raise exception 'BSEC14HAI: data changed during hardening';
  end if;
end
$$;

commit;

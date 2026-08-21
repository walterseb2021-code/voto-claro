-- B-SEC-14HAG
-- Blindaje permanente de public.espacio_inversionistas

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_rls boolean;
  v_force_rls boolean;
  v_bypass boolean;
  v_policy_count integer;
  v_realtime_count integer;
begin
  select c.relrowsecurity, c.relforcerowsecurity
  into v_rls, v_force_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'espacio_inversionistas'
    and c.relkind = 'r';

  if not found then
    raise exception 'BSEC14HAG_ABORT: public.espacio_inversionistas no existe';
  end if;

  if v_rls is distinct from false then
    raise exception 'BSEC14HAG_ABORT: RLS ya no esta desactivado';
  end if;

  if v_force_rls is distinct from false then
    raise exception 'BSEC14HAG_ABORT: FORCE RLS inesperado';
  end if;

  select rolbypassrls
  into v_bypass
  from pg_roles
  where rolname = 'service_role';

  if v_bypass is distinct from true then
    raise exception 'BSEC14HAG_ABORT: service_role no tiene BYPASSRLS';
  end if;

  select count(*)
  into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'espacio_inversionistas';

  if v_policy_count <> 0 then
    raise exception 'BSEC14HAG_ABORT: existen % policies inesperadas', v_policy_count;
  end if;

  select count(*)
  into v_realtime_count
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'espacio_inversionistas';

  if v_realtime_count <> 0 then
    raise exception 'BSEC14HAG_ABORT: espacio_inversionistas esta en supabase_realtime';
  end if;

  if not has_table_privilege('service_role','public.espacio_inversionistas','SELECT') then
    raise exception 'BSEC14HAG_ABORT: service_role no tiene SELECT';
  end if;

  if not has_table_privilege('service_role','public.espacio_inversionistas','INSERT') then
    raise exception 'BSEC14HAG_ABORT: service_role no tiene INSERT';
  end if;

  if not has_table_privilege('service_role','public.espacio_inversionistas','UPDATE') then
    raise exception 'BSEC14HAG_ABORT: service_role no tiene UPDATE';
  end if;

  if not exists (
    select 1
    from public.espacio_inversionistas
    where id = '1fb0dbb4-f983-4016-98a5-c2901416860f'::uuid
      and participant_id = '7dc57a8d-1b53-412e-ace5-ee799c755a3d'::uuid
      and company = 'Prueba BSEC14HAF ACTUALIZADO'
  ) then
    raise exception 'BSEC14HAG_ABORT: perfil de prueba esperado no esta presente';
  end if;
end
$$;

alter table public.espacio_inversionistas
enable row level security;

revoke all privileges
on table public.espacio_inversionistas
from public;

revoke all privileges
on table public.espacio_inversionistas
from anon;

revoke all privileges
on table public.espacio_inversionistas
from authenticated;

revoke all privileges
on table public.espacio_inversionistas
from service_role;

grant select, insert, update
on table public.espacio_inversionistas
to service_role;

do $$
declare
  v_rls boolean;
  v_policy_count integer;
  v_public_acl_count integer;
begin
  select relrowsecurity
  into v_rls
  from pg_class
  where oid = 'public.espacio_inversionistas'::regclass;

  if v_rls is distinct from true then
    raise exception 'BSEC14HAG_FAIL: RLS no quedo habilitado';
  end if;

  select count(*)
  into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'espacio_inversionistas';

  if v_policy_count <> 0 then
    raise exception 'BSEC14HAG_FAIL: aparecieron policies inesperadas';
  end if;

  select count(*)
  into v_public_acl_count
  from pg_class c
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  where c.oid = 'public.espacio_inversionistas'::regclass
    and x.grantee = 0;

  if v_public_acl_count <> 0 then
    raise exception 'BSEC14HAG_FAIL: PUBLIC conserva ACL';
  end if;

  if
    has_table_privilege('anon','public.espacio_inversionistas','SELECT')
    or has_table_privilege('anon','public.espacio_inversionistas','INSERT')
    or has_table_privilege('anon','public.espacio_inversionistas','UPDATE')
    or has_table_privilege('anon','public.espacio_inversionistas','DELETE')
    or has_table_privilege('anon','public.espacio_inversionistas','TRUNCATE')
    or has_table_privilege('anon','public.espacio_inversionistas','REFERENCES')
    or has_table_privilege('anon','public.espacio_inversionistas','TRIGGER')
    or has_table_privilege('anon','public.espacio_inversionistas','MAINTAIN')
  then
    raise exception 'BSEC14HAG_FAIL: anon conserva privilegios';
  end if;

  if
    has_table_privilege('authenticated','public.espacio_inversionistas','SELECT')
    or has_table_privilege('authenticated','public.espacio_inversionistas','INSERT')
    or has_table_privilege('authenticated','public.espacio_inversionistas','UPDATE')
    or has_table_privilege('authenticated','public.espacio_inversionistas','DELETE')
    or has_table_privilege('authenticated','public.espacio_inversionistas','TRUNCATE')
    or has_table_privilege('authenticated','public.espacio_inversionistas','REFERENCES')
    or has_table_privilege('authenticated','public.espacio_inversionistas','TRIGGER')
    or has_table_privilege('authenticated','public.espacio_inversionistas','MAINTAIN')
  then
    raise exception 'BSEC14HAG_FAIL: authenticated conserva privilegios';
  end if;

  if not has_table_privilege('service_role','public.espacio_inversionistas','SELECT') then
    raise exception 'BSEC14HAG_FAIL: service_role perdio SELECT';
  end if;

  if not has_table_privilege('service_role','public.espacio_inversionistas','INSERT') then
    raise exception 'BSEC14HAG_FAIL: service_role perdio INSERT';
  end if;

  if not has_table_privilege('service_role','public.espacio_inversionistas','UPDATE') then
    raise exception 'BSEC14HAG_FAIL: service_role perdio UPDATE';
  end if;

  if
    has_table_privilege('service_role','public.espacio_inversionistas','DELETE')
    or has_table_privilege('service_role','public.espacio_inversionistas','TRUNCATE')
    or has_table_privilege('service_role','public.espacio_inversionistas','REFERENCES')
    or has_table_privilege('service_role','public.espacio_inversionistas','TRIGGER')
    or has_table_privilege('service_role','public.espacio_inversionistas','MAINTAIN')
  then
    raise exception 'BSEC14HAG_FAIL: service_role conserva privilegios excesivos';
  end if;

  if not exists (
    select 1
    from pg_roles
    where rolname = 'service_role'
      and rolbypassrls is true
  ) then
    raise exception 'BSEC14HAG_FAIL: service_role perdio BYPASSRLS';
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'espacio_inversionistas'
  ) then
    raise exception 'BSEC14HAG_FAIL: tabla aparecio en Realtime';
  end if;

  if not exists (
    select 1
    from public.espacio_inversionistas
    where id = '1fb0dbb4-f983-4016-98a5-c2901416860f'::uuid
      and participant_id = '7dc57a8d-1b53-412e-ace5-ee799c755a3d'::uuid
      and company = 'Prueba BSEC14HAF ACTUALIZADO'
  ) then
    raise exception 'BSEC14HAG_FAIL: perfil de prueba no fue preservado';
  end if;
end
$$;

commit;

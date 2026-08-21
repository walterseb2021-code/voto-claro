-- B-SEC-14HAE
-- Blindaje permanente de public.espacio_afiliados
-- Objetivo:
--   1) habilitar RLS;
--   2) retirar acceso directo a PUBLIC, anon y authenticated;
--   3) limitar service_role a SELECT, INSERT y UPDATE;
--   4) mantener cero policies cliente;
--   5) no modificar RPCs SECURITY DEFINER existentes.

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
    and c.relname = 'espacio_afiliados'
    and c.relkind = 'r';

  if not found then
    raise exception 'BSEC14HAE_ABORT: public.espacio_afiliados no existe';
  end if;

  if v_rls is distinct from false then
    raise exception 'BSEC14HAE_ABORT: RLS ya no esta desactivado';
  end if;

  if v_force_rls is distinct from false then
    raise exception 'BSEC14HAE_ABORT: FORCE RLS inesperado';
  end if;

  select rolbypassrls
  into v_bypass
  from pg_roles
  where rolname = 'service_role';

  if v_bypass is distinct from true then
    raise exception 'BSEC14HAE_ABORT: service_role no tiene BYPASSRLS';
  end if;

  select count(*)
  into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'espacio_afiliados';

  if v_policy_count <> 0 then
    raise exception 'BSEC14HAE_ABORT: existen % policies inesperadas', v_policy_count;
  end if;

  select count(*)
  into v_realtime_count
  from pg_publication_tables
  where pubname = 'supabase_realtime'
    and schemaname = 'public'
    and tablename = 'espacio_afiliados';

  if v_realtime_count <> 0 then
    raise exception 'BSEC14HAE_ABORT: espacio_afiliados esta en supabase_realtime';
  end if;

  if not has_table_privilege('service_role','public.espacio_afiliados','SELECT') then
    raise exception 'BSEC14HAE_ABORT: service_role no tiene SELECT';
  end if;

  if not has_table_privilege('service_role','public.espacio_afiliados','INSERT') then
    raise exception 'BSEC14HAE_ABORT: service_role no tiene INSERT';
  end if;

  if not has_table_privilege('service_role','public.espacio_afiliados','UPDATE') then
    raise exception 'BSEC14HAE_ABORT: service_role no tiene UPDATE';
  end if;
end
$$;

alter table public.espacio_afiliados
enable row level security;

revoke all privileges
on table public.espacio_afiliados
from public;

revoke all privileges
on table public.espacio_afiliados
from anon;

revoke all privileges
on table public.espacio_afiliados
from authenticated;

revoke all privileges
on table public.espacio_afiliados
from service_role;

grant select, insert, update
on table public.espacio_afiliados
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
  where oid = 'public.espacio_afiliados'::regclass;

  if v_rls is distinct from true then
    raise exception 'BSEC14HAE_FAIL: RLS no quedo habilitado';
  end if;

  select count(*)
  into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'espacio_afiliados';

  if v_policy_count <> 0 then
    raise exception 'BSEC14HAE_FAIL: aparecieron policies inesperadas';
  end if;

  select count(*)
  into v_public_acl_count
  from pg_class c
  cross join lateral aclexplode(
    coalesce(c.relacl, acldefault('r', c.relowner))
  ) x
  where c.oid = 'public.espacio_afiliados'::regclass
    and x.grantee = 0;

  if v_public_acl_count <> 0 then
    raise exception 'BSEC14HAE_FAIL: PUBLIC conserva ACL';
  end if;

  if
    has_table_privilege('anon','public.espacio_afiliados','SELECT')
    or has_table_privilege('anon','public.espacio_afiliados','INSERT')
    or has_table_privilege('anon','public.espacio_afiliados','UPDATE')
    or has_table_privilege('anon','public.espacio_afiliados','DELETE')
    or has_table_privilege('anon','public.espacio_afiliados','TRUNCATE')
    or has_table_privilege('anon','public.espacio_afiliados','REFERENCES')
    or has_table_privilege('anon','public.espacio_afiliados','TRIGGER')
    or has_table_privilege('anon','public.espacio_afiliados','MAINTAIN')
  then
    raise exception 'BSEC14HAE_FAIL: anon conserva privilegios';
  end if;

  if
    has_table_privilege('authenticated','public.espacio_afiliados','SELECT')
    or has_table_privilege('authenticated','public.espacio_afiliados','INSERT')
    or has_table_privilege('authenticated','public.espacio_afiliados','UPDATE')
    or has_table_privilege('authenticated','public.espacio_afiliados','DELETE')
    or has_table_privilege('authenticated','public.espacio_afiliados','TRUNCATE')
    or has_table_privilege('authenticated','public.espacio_afiliados','REFERENCES')
    or has_table_privilege('authenticated','public.espacio_afiliados','TRIGGER')
    or has_table_privilege('authenticated','public.espacio_afiliados','MAINTAIN')
  then
    raise exception 'BSEC14HAE_FAIL: authenticated conserva privilegios';
  end if;

  if not has_table_privilege('service_role','public.espacio_afiliados','SELECT') then
    raise exception 'BSEC14HAE_FAIL: service_role perdio SELECT';
  end if;

  if not has_table_privilege('service_role','public.espacio_afiliados','INSERT') then
    raise exception 'BSEC14HAE_FAIL: service_role perdio INSERT';
  end if;

  if not has_table_privilege('service_role','public.espacio_afiliados','UPDATE') then
    raise exception 'BSEC14HAE_FAIL: service_role perdio UPDATE';
  end if;

  if
    has_table_privilege('service_role','public.espacio_afiliados','DELETE')
    or has_table_privilege('service_role','public.espacio_afiliados','TRUNCATE')
    or has_table_privilege('service_role','public.espacio_afiliados','REFERENCES')
    or has_table_privilege('service_role','public.espacio_afiliados','TRIGGER')
    or has_table_privilege('service_role','public.espacio_afiliados','MAINTAIN')
  then
    raise exception 'BSEC14HAE_FAIL: service_role conserva privilegios excesivos';
  end if;

  if not exists (
    select 1
    from pg_roles
    where rolname = 'service_role'
      and rolbypassrls is true
  ) then
    raise exception 'BSEC14HAE_FAIL: service_role perdio BYPASSRLS';
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'espacio_afiliados'
  ) then
    raise exception 'BSEC14HAE_FAIL: tabla aparecio en Realtime';
  end if;
end
$$;

commit;

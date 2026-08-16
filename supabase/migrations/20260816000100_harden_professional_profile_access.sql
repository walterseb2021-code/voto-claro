-- VOTO CLARO
-- B-SEC-14DW
-- Migracion real: endurecer ficha profesional y retirar el prefijo
-- profesionales de la policy publica temporal de project_pdfs.

begin;

do $guard$
declare
  v_table_oid oid;
  v_function_oid oid;
  v_owner text;
  v_rls boolean;
  v_force_rls boolean;
  v_security_definer boolean;
  v_volatility "char";
  v_proconfig text[];
  v_function_md5 text;
  v_policy_count integer;
  v_with_check text;
begin
  v_table_oid := pg_catalog.to_regclass('public.espacio_profesionales');

  if v_table_oid is null then
    raise exception 'B_SEC_14DW_ABORT: falta public.espacio_profesionales';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
    into v_rls, v_force_rls
  from pg_catalog.pg_class c
  where c.oid = v_table_oid;

  if v_rls is distinct from true then
    raise exception 'B_SEC_14DW_ABORT: RLS de espacio_profesionales no esta ON';
  end if;

  if v_force_rls is distinct from false then
    raise exception 'B_SEC_14DW_ABORT: FORCE RLS cambio desde B-SEC-14DU';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'espacio_profesionales'
  ) then
    raise exception 'B_SEC_14DW_ABORT: aparecio policy inesperada en espacio_profesionales';
  end if;

  if not (
    pg_catalog.has_table_privilege('anon','public.espacio_profesionales','SELECT')
    and pg_catalog.has_table_privilege('anon','public.espacio_profesionales','INSERT')
    and pg_catalog.has_table_privilege('anon','public.espacio_profesionales','UPDATE')
    and pg_catalog.has_table_privilege('anon','public.espacio_profesionales','DELETE')
  ) then
    raise exception 'B_SEC_14DW_ABORT: privilegios anon cambiaron desde B-SEC-14DU';
  end if;

  if not (
    pg_catalog.has_table_privilege('authenticated','public.espacio_profesionales','SELECT')
    and pg_catalog.has_table_privilege('authenticated','public.espacio_profesionales','INSERT')
    and pg_catalog.has_table_privilege('authenticated','public.espacio_profesionales','UPDATE')
    and pg_catalog.has_table_privilege('authenticated','public.espacio_profesionales','DELETE')
  ) then
    raise exception 'B_SEC_14DW_ABORT: privilegios authenticated cambiaron desde B-SEC-14DU';
  end if;

  if not (
    pg_catalog.has_table_privilege('service_role','public.espacio_profesionales','SELECT')
    and pg_catalog.has_table_privilege('service_role','public.espacio_profesionales','INSERT')
    and pg_catalog.has_table_privilege('service_role','public.espacio_profesionales','UPDATE')
    and pg_catalog.has_table_privilege('service_role','public.espacio_profesionales','DELETE')
  ) then
    raise exception 'B_SEC_14DW_ABORT: privilegios service_role cambiaron desde B-SEC-14DU';
  end if;

  v_function_oid := pg_catalog.to_regprocedure('public.generar_codigo_profesional()');

  if v_function_oid is null then
    raise exception 'B_SEC_14DW_ABORT: falta generar_codigo_profesional()';
  end if;

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.provolatile,
    p.proconfig,
    pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
  into
    v_owner,
    v_security_definer,
    v_volatility,
    v_proconfig,
    v_function_md5
  from pg_catalog.pg_proc p
  where p.oid = v_function_oid;

  if v_owner <> 'postgres' then
    raise exception 'B_SEC_14DW_ABORT: owner de generar_codigo_profesional cambio';
  end if;

  if v_security_definer is distinct from false then
    raise exception 'B_SEC_14DW_ABORT: generar_codigo_profesional cambio a SECURITY DEFINER';
  end if;

  if v_volatility <> 'v' then
    raise exception 'B_SEC_14DW_ABORT: volatilidad de generar_codigo_profesional cambio';
  end if;

  if v_proconfig is not null then
    raise exception 'B_SEC_14DW_ABORT: proconfig de generar_codigo_profesional cambio';
  end if;

  if v_function_md5 <> 'ac46c1a301f935500956bedb8d1959fb' then
    raise exception 'B_SEC_14DW_ABORT: cuerpo de generar_codigo_profesional cambio';
  end if;

  if not pg_catalog.has_function_privilege(
    'anon',
    'public.generar_codigo_profesional()',
    'EXECUTE'
  ) then
    raise exception 'B_SEC_14DW_ABORT: EXECUTE anon cambio desde B-SEC-14DU';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated',
    'public.generar_codigo_profesional()',
    'EXECUTE'
  ) then
    raise exception 'B_SEC_14DW_ABORT: EXECUTE authenticated cambio desde B-SEC-14DU';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.generar_codigo_profesional()',
    'EXECUTE'
  ) then
    raise exception 'B_SEC_14DW_ABORT: service_role perdio EXECUTE';
  end if;

  if not exists (
    select 1
    from storage.buckets b
    where b.id = 'project_pdfs'
      and b.name = 'project_pdfs'
      and b.public = true
  ) then
    raise exception 'B_SEC_14DW_ABORT: bucket project_pdfs cambio';
  end if;

  select count(*), max(p.with_check)
    into v_policy_count, v_with_check
  from pg_catalog.pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.policyname = 'project_pdfs_legacy_public_insert_scoped'
    and p.cmd = 'INSERT'
    and p.roles = array['public'::name]
    and p.qual is null;

  if v_policy_count <> 1 then
    raise exception 'B_SEC_14DW_ABORT: policy temporal no coincide con B-SEC-14DU';
  end if;

  if v_with_check is null
     or v_with_check not like '%project_pdfs%'
     or v_with_check not like '%profesionales%'
     or v_with_check not like '%espacio-emprendedor%'
     or v_with_check not like '%extension%'
     or v_with_check not like '%pdf%' then
    raise exception 'B_SEC_14DW_ABORT: WITH CHECK temporal cambio inesperadamente';
  end if;
end
$guard$;

revoke all privileges
  on table public.espacio_profesionales
  from PUBLIC, anon, authenticated, service_role;

grant select, insert, update
  on table public.espacio_profesionales
  to service_role;

revoke all privileges
  on function public.generar_codigo_profesional()
  from PUBLIC, anon, authenticated, service_role;

grant execute
  on function public.generar_codigo_profesional()
  to service_role;

drop policy "project_pdfs_legacy_public_insert_scoped"
  on storage.objects;

create policy "project_pdfs_legacy_public_insert_scoped"
on storage.objects
for insert
to public
with check (
  bucket_id = 'project_pdfs'
  and pg_catalog.lower(storage.extension(name)) = 'pdf'
  and (storage.foldername(name))[1] = 'espacio-emprendedor'
);

do $verify$
declare
  v_function_oid oid;
  v_policy_count integer;
  v_with_check text;
begin
  if
    pg_catalog.has_table_privilege('anon','public.espacio_profesionales','SELECT')
    or pg_catalog.has_table_privilege('anon','public.espacio_profesionales','INSERT')
    or pg_catalog.has_table_privilege('anon','public.espacio_profesionales','UPDATE')
    or pg_catalog.has_table_privilege('anon','public.espacio_profesionales','DELETE')
  then
    raise exception 'B_SEC_14DW_VERIFY: anon conserva privilegios de tabla';
  end if;

  if
    pg_catalog.has_table_privilege('authenticated','public.espacio_profesionales','SELECT')
    or pg_catalog.has_table_privilege('authenticated','public.espacio_profesionales','INSERT')
    or pg_catalog.has_table_privilege('authenticated','public.espacio_profesionales','UPDATE')
    or pg_catalog.has_table_privilege('authenticated','public.espacio_profesionales','DELETE')
  then
    raise exception 'B_SEC_14DW_VERIFY: authenticated conserva privilegios de tabla';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.espacio_profesionales',
    'SELECT'
  ) then
    raise exception 'B_SEC_14DW_VERIFY: falta SELECT service_role';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.espacio_profesionales',
    'INSERT'
  ) then
    raise exception 'B_SEC_14DW_VERIFY: falta INSERT service_role';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.espacio_profesionales',
    'UPDATE'
  ) then
    raise exception 'B_SEC_14DW_VERIFY: falta UPDATE service_role';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'public.espacio_profesionales',
    'DELETE'
  ) then
    raise exception 'B_SEC_14DW_VERIFY: service_role conserva DELETE';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies p
    where p.schemaname = 'public'
      and p.tablename = 'espacio_profesionales'
  ) then
    raise exception 'B_SEC_14DW_VERIFY: aparecio policy de tabla';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.generar_codigo_profesional()',
    'EXECUTE'
  ) then
    raise exception 'B_SEC_14DW_VERIFY: anon conserva EXECUTE';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.generar_codigo_profesional()',
    'EXECUTE'
  ) then
    raise exception 'B_SEC_14DW_VERIFY: authenticated conserva EXECUTE';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.generar_codigo_profesional()',
    'EXECUTE'
  ) then
    raise exception 'B_SEC_14DW_VERIFY: service_role perdio EXECUTE';
  end if;

  v_function_oid := pg_catalog.to_regprocedure('public.generar_codigo_profesional()');

  if pg_catalog.md5(
       pg_catalog.pg_get_functiondef(v_function_oid)
     ) <> 'ac46c1a301f935500956bedb8d1959fb' then
    raise exception 'B_SEC_14DW_VERIFY: cuerpo de funcion fue modificado';
  end if;

  select count(*), max(p.with_check)
    into v_policy_count, v_with_check
  from pg_catalog.pg_policies p
  where p.schemaname = 'storage'
    and p.tablename = 'objects'
    and p.policyname = 'project_pdfs_legacy_public_insert_scoped'
    and p.cmd = 'INSERT'
    and p.roles = array['public'::name]
    and p.qual is null;

  if v_policy_count <> 1 then
    raise exception 'B_SEC_14DW_VERIFY: policy Storage final ausente';
  end if;

  if v_with_check not like '%project_pdfs%'
     or v_with_check not like '%espacio-emprendedor%'
     or v_with_check like '%profesionales%' then
    raise exception 'B_SEC_14DW_VERIFY: scope Storage final incorrecto';
  end if;

  if not exists (
    select 1
    from storage.buckets b
    where b.id = 'project_pdfs'
      and b.public = true
  ) then
    raise exception 'B_SEC_14DW_VERIFY: bucket dejo de ser publico';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid = 'public.espacio_profesionales'::pg_catalog.regclass
      and c.relrowsecurity = true
      and c.relforcerowsecurity = false
  ) then
    raise exception 'B_SEC_14DW_VERIFY: estado RLS cambio';
  end if;
end
$verify$;

commit;

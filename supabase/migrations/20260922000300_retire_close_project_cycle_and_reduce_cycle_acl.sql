begin;

do $guard$
declare
  v_oid oid;
begin
  v_oid := pg_catalog.to_regprocedure('public.close_project_cycle()');

  if v_oid is null then
    raise exception 'BSEC_PROJECT_CYCLES_ABORT: falta close_project_cycle()';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    v_oid,
    'EXECUTE'
  ) then
    raise exception 'BSEC_PROJECT_CYCLES_ABORT: service_role ya no tiene EXECUTE';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'SELECT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'INSERT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'UPDATE'
  ) then
    raise exception 'BSEC_PROJECT_CYCLES_ABORT: ACL inicial inesperado';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'DELETE'
  ) then
    raise exception 'BSEC_PROJECT_CYCLES_ABORT: DELETE inesperado';
  end if;
end
$guard$;

revoke execute
on function public.close_project_cycle()
from service_role;

revoke insert, update
on table public.project_cycles
from service_role;

do $verify$
declare
  v_oid oid;
begin
  v_oid := pg_catalog.to_regprocedure('public.close_project_cycle()');

  if pg_catalog.has_function_privilege(
    'service_role',
    v_oid,
    'EXECUTE'
  ) then
    raise exception 'BSEC_PROJECT_CYCLES_VERIFY: service_role conserva EXECUTE';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'SELECT'
  ) then
    raise exception 'BSEC_PROJECT_CYCLES_VERIFY: service_role perdio SELECT';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'INSERT'
  )
  or pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'UPDATE'
  )
  or pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'DELETE'
  )
  or pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'TRUNCATE'
  )
  or pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'REFERENCES'
  )
  or pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'TRIGGER'
  )
  or pg_catalog.has_table_privilege(
    'service_role',
    'public.project_cycles',
    'MAINTAIN'
  ) then
    raise exception 'BSEC_PROJECT_CYCLES_VERIFY: privilegio excesivo';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    v_oid,
    'EXECUTE'
  )
  or pg_catalog.has_function_privilege(
    'authenticated',
    v_oid,
    'EXECUTE'
  ) then
    raise exception 'BSEC_PROJECT_CYCLES_VERIFY: cliente puede ejecutar funcion';
  end if;
end
$verify$;

commit;
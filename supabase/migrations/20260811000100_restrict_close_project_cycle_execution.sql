-- B-SEC-14BH
-- Restringe la ejecucion directa de close_project_cycle().
-- No modifica datos ni la definicion de la funcion.
-- Preserva EXECUTE para service_role.
-- Guardas basadas en el preflight B-SEC-14BG.

begin;

do $$
declare
  v_oid oid;
  v_owner text;
  v_security_definer boolean;
  v_definition_md5 text;
begin
  select
    p.oid,
    pg_get_userbyid(p.proowner),
    p.prosecdef,
    md5(pg_get_functiondef(p.oid))
  into
    v_oid,
    v_owner,
    v_security_definer,
    v_definition_md5
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'close_project_cycle'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null then
    raise exception 'B_SEC_14BH_ABORT: close_project_cycle() no existe con firma esperada';
  end if;

  if (
    select count(*)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'close_project_cycle'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) <> 1 then
    raise exception 'B_SEC_14BH_ABORT: cantidad inesperada de close_project_cycle()';
  end if;

  if v_owner <> 'postgres' then
    raise exception 'B_SEC_14BH_ABORT: owner inesperado: %', v_owner;
  end if;

  if v_security_definer is distinct from false then
    raise exception 'B_SEC_14BH_ABORT: security_definer cambio respecto al preflight';
  end if;

  if v_definition_md5 <> '004ea3fc1d2f1dd89dac7d24d06c516d' then
    raise exception 'B_SEC_14BH_ABORT: definicion de close_project_cycle() cambio respecto al preflight';
  end if;
end
$$;

revoke execute on function public.close_project_cycle() from public;
revoke execute on function public.close_project_cycle() from anon;
revoke execute on function public.close_project_cycle() from authenticated;

grant execute on function public.close_project_cycle() to service_role;

commit;
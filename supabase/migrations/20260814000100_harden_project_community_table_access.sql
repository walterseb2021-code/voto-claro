-- VOTO CLARO
-- B-SEC-14CA
-- Correccion y cierre de acceso directo a las tablas de Proyecto Ciudadano.
--
-- Sustituye localmente la version B-SEC-14BZ, que NUNCA fue ejecutada.
--
-- Basado en:
-- - B-SEC-14BT: inventario de referencias del repositorio.
-- - B-SEC-14BU/BW: diagnostico live de RLS, ACL, funcion y trigger.
-- - B-SEC-14BX/BY: compatibilidad exacta de close_project_cycle().
-- - Revision B-SEC-14CA: minimo cambio, verificacion explicita de PUBLIC
--   y conservacion de EXECUTE de service_role sobre la funcion de trigger.
--
-- OBJETIVO:
-- 1. Activar RLS sin policies publicas en las cuatro tablas.
-- 2. Revocar acceso directo de PUBLIC/anon/authenticated.
-- 3. Reducir service_role a los privilegios usados por el codigo actual.
-- 4. Mantener escrituras sensibles mediante RPC SECURITY DEFINER existentes.
-- 5. Quitar EXECUTE publico/cliente de update_project_beneficiary_count().
-- 6. Fijar search_path de la funcion legacy del trigger.
--
-- NO BORRA NI MODIFICA FILAS DE NEGOCIO.
-- NO cambia el cuerpo de close_project_cycle().

begin;

do $guard$
declare
  v_close_oid oid;
begin
  if exists (
    select 1
    from (
      values
        ('projects'::text),
        ('project_cycles'::text),
        ('project_supports'::text),
        ('project_forum_posts'::text)
    ) as expected(table_name)
    where pg_catalog.to_regclass(
      pg_catalog.format('public.%I', expected.table_name)
    ) is null
  ) then
    raise exception 'B_SEC_14CA_ABORT: falta una tabla objetivo esperada';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'projects',
        'project_cycles',
        'project_supports',
        'project_forum_posts'
      )
      and c.relrowsecurity = true
  ) then
    raise exception 'B_SEC_14CA_ABORT: RLS cambio desde el diagnostico';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'projects',
        'project_cycles',
        'project_supports',
        'project_forum_posts'
      )
  ) then
    raise exception 'B_SEC_14CA_ABORT: aparecieron policies desde el diagnostico';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
      and rolbypassrls = true
  ) then
    raise exception 'B_SEC_14CA_ABORT: service_role no tiene BYPASSRLS';
  end if;

  if pg_catalog.to_regprocedure('public.support_project_secure(uuid,uuid)') is null
     or not coalesce(
       (
         select p.prosecdef
         from pg_catalog.pg_proc p
         where p.oid = pg_catalog.to_regprocedure(
           'public.support_project_secure(uuid,uuid)'
         )
       ),
       false
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.support_project_secure(uuid,uuid)',
       'EXECUTE'
     )
  then
    raise exception 'B_SEC_14CA_ABORT: support_project_secure no coincide con la arquitectura segura';
  end if;

  if pg_catalog.to_regprocedure(
       'public.create_project_forum_post_secure(uuid,uuid,text)'
     ) is null
     or not coalesce(
       (
         select p.prosecdef
         from pg_catalog.pg_proc p
         where p.oid = pg_catalog.to_regprocedure(
           'public.create_project_forum_post_secure(uuid,uuid,text)'
         )
       ),
       false
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.create_project_forum_post_secure(uuid,uuid,text)',
       'EXECUTE'
     )
  then
    raise exception 'B_SEC_14CA_ABORT: create_project_forum_post_secure no coincide con la arquitectura segura';
  end if;

  if pg_catalog.to_regprocedure(
       'public.finalize_project_submission_secure(uuid,uuid,text,text,text,text,text,text,numeric,text,text,boolean)'
     ) is null
     or not coalesce(
       (
         select p.prosecdef
         from pg_catalog.pg_proc p
         where p.oid = pg_catalog.to_regprocedure(
           'public.finalize_project_submission_secure(uuid,uuid,text,text,text,text,text,text,numeric,text,text,boolean)'
         )
       ),
       false
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.finalize_project_submission_secure(uuid,uuid,text,text,text,text,text,text,numeric,text,text,boolean)',
       'EXECUTE'
     )
  then
    raise exception 'B_SEC_14CA_ABORT: finalize_project_submission_secure no coincide con la arquitectura segura';
  end if;

  v_close_oid := pg_catalog.to_regprocedure('public.close_project_cycle()');

  if v_close_oid is null then
    raise exception 'B_SEC_14CA_ABORT: falta close_project_cycle()';
  end if;

  if (
    select p.prosecdef
    from pg_catalog.pg_proc p
    where p.oid = v_close_oid
  ) then
    raise exception 'B_SEC_14CA_ABORT: close_project_cycle cambio a SECURITY DEFINER';
  end if;

  if pg_catalog.md5(pg_catalog.pg_get_functiondef(v_close_oid))
     <> '004ea3fc1d2f1dd89dac7d24d06c516d'
  then
    raise exception 'B_SEC_14CA_ABORT: close_project_cycle cambio desde B-SEC-14BY';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.close_project_cycle()',
    'EXECUTE'
  ) then
    raise exception 'B_SEC_14CA_ABORT: service_role perdio EXECUTE sobre close_project_cycle';
  end if;

  if pg_catalog.to_regprocedure(
       'public.update_project_beneficiary_count()'
     ) is null
  then
    raise exception 'B_SEC_14CA_ABORT: falta update_project_beneficiary_count()';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = pg_catalog.to_regprocedure(
      'public.update_project_beneficiary_count()'
    )
      and pg_catalog.pg_get_function_result(p.oid) = 'trigger'
      and p.prosecdef = false
  ) then
    raise exception 'B_SEC_14CA_ABORT: update_project_beneficiary_count cambio desde el diagnostico';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'project_supports'
      and t.tgname = 'trg_project_supports_count'
      and t.tgfoid = pg_catalog.to_regprocedure(
        'public.update_project_beneficiary_count()'
      )
      and not t.tgisinternal
  ) then
    raise exception 'B_SEC_14CA_ABORT: falta el trigger esperado de apoyos';
  end if;
end
$guard$;

alter table public.projects enable row level security;
alter table public.project_cycles enable row level security;
alter table public.project_supports enable row level security;
alter table public.project_forum_posts enable row level security;

revoke all privileges
  on table
    public.projects,
    public.project_cycles,
    public.project_supports,
    public.project_forum_posts
  from PUBLIC, anon, authenticated, service_role;

grant select, update
  on table public.projects
  to service_role;

grant select, insert, update
  on table public.project_cycles
  to service_role;

grant select
  on table public.project_supports
  to service_role;

grant select
  on table public.project_forum_posts
  to service_role;

alter function public.update_project_beneficiary_count()
  set search_path = pg_catalog, public, pg_temp;

revoke all
  on function public.update_project_beneficiary_count()
  from PUBLIC, anon, authenticated;

grant execute
  on function public.update_project_beneficiary_count()
  to service_role;

do $verify$
declare
  v_table text;
  v_role text;
begin
  foreach v_table in array array[
    'projects',
    'project_cycles',
    'project_supports',
    'project_forum_posts'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = v_table
        and c.relrowsecurity = true
    ) then
      raise exception 'B_SEC_14CA_VERIFY: RLS no activo en %', v_table;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'projects',
        'project_cycles',
        'project_supports',
        'project_forum_posts'
      )
  ) then
    raise exception 'B_SEC_14CA_VERIFY: no se esperaban policies en tablas objetivo';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) as x
    where n.nspname = 'public'
      and c.relname in (
        'projects',
        'project_cycles',
        'project_supports',
        'project_forum_posts'
      )
      and x.grantee = 0
  ) then
    raise exception 'B_SEC_14CA_VERIFY: PUBLIC conserva privilegios en tablas objetivo';
  end if;

  foreach v_role in array array['anon', 'authenticated']
  loop
    foreach v_table in array array[
      'projects',
      'project_cycles',
      'project_supports',
      'project_forum_posts'
    ]
    loop
      if pg_catalog.has_table_privilege(
        v_role,
        pg_catalog.format('public.%I', v_table),
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
      ) then
        raise exception 'B_SEC_14CA_VERIFY: % conserva privilegios en %', v_role, v_table;
      end if;
    end loop;
  end loop;

  if not pg_catalog.has_table_privilege(
       'service_role', 'public.projects', 'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.projects', 'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.projects',
       'INSERT,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  then
    raise exception 'B_SEC_14CA_VERIFY: ACL inesperado en projects';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role', 'public.project_cycles', 'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.project_cycles', 'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.project_cycles', 'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.project_cycles',
       'DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  then
    raise exception 'B_SEC_14CA_VERIFY: ACL inesperado en project_cycles';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role', 'public.project_supports', 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.project_supports',
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  then
    raise exception 'B_SEC_14CA_VERIFY: ACL inesperado en project_supports';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role', 'public.project_forum_posts', 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.project_forum_posts',
       'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  then
    raise exception 'B_SEC_14CA_VERIFY: ACL inesperado en project_forum_posts';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) as x
    where p.oid = pg_catalog.to_regprocedure(
      'public.update_project_beneficiary_count()'
    )
      and x.grantee = 0
      and x.privilege_type = 'EXECUTE'
  ) then
    raise exception 'B_SEC_14CA_VERIFY: PUBLIC conserva EXECUTE en update_project_beneficiary_count';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.update_project_beneficiary_count()',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.update_project_beneficiary_count()',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.update_project_beneficiary_count()',
       'EXECUTE'
     )
  then
    raise exception 'B_SEC_14CA_VERIFY: ACL inesperado en update_project_beneficiary_count';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.support_project_secure(uuid,uuid)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.create_project_forum_post_secure(uuid,uuid,text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.finalize_project_submission_secure(uuid,uuid,text,text,text,text,text,text,numeric,text,text,boolean)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.close_project_cycle()',
       'EXECUTE'
     )
  then
    raise exception 'B_SEC_14CA_VERIFY: se rompio EXECUTE requerido por service_role';
  end if;

  if pg_catalog.md5(
       pg_catalog.pg_get_functiondef(
         pg_catalog.to_regprocedure('public.close_project_cycle()')
       )
     ) <> '004ea3fc1d2f1dd89dac7d24d06c516d'
  then
    raise exception 'B_SEC_14CA_VERIFY: close_project_cycle fue modificada inesperadamente';
  end if;
end
$verify$;

commit;

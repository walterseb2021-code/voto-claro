-- B-SEC-14HAJ-B2B3-B2B-B
-- Blindaje permanente de public.reto_questions
-- Objetivo:
--   1) RLS habilitado, sin policies publicas.
--   2) anon/authenticated sin privilegios directos.
--   3) service_role conserva solo SELECT.
--   4) trigger de limpieza permanece instalado.
--   5) la funcion trigger deja de ser ejecutable directamente por roles publicos/runtime.
-- No modifica filas de reto_questions.

begin;

-- ============================================================
-- 00. PREFLIGHT FAIL-CLOSED
-- ============================================================

do $$
declare
  v_owner text;
  v_rls boolean;
  v_force boolean;
  v_policies integer;
  v_trigger_count integer;
  v_func_count integer;
  v_public_func_exec boolean;
begin
  select pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity
    into v_owner, v_rls, v_force
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'reto_questions'
    and c.relkind in ('r','p');

  if v_owner is null then
    raise exception 'B2B_MIGRATION_ABORT: public.reto_questions no existe';
  end if;

  if v_owner <> 'postgres' then
    raise exception 'B2B_MIGRATION_ABORT: owner inesperado: %', v_owner;
  end if;

  if v_rls is distinct from false then
    raise exception 'B2B_MIGRATION_ABORT: RLS ya no coincide con preflight';
  end if;

  if v_force is distinct from false then
    raise exception 'B2B_MIGRATION_ABORT: FORCE RLS ya no coincide con preflight';
  end if;

  select count(*)
    into v_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'reto_questions';

  if v_policies <> 0 then
    raise exception 'B2B_MIGRATION_ABORT: policies inesperadas: %', v_policies;
  end if;

  select count(*)
    into v_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'reto_questions'
    and t.tgname = 'trg_reto_questions_clean'
    and not t.tgisinternal;

  if v_trigger_count <> 1 then
    raise exception 'B2B_MIGRATION_ABORT: trigger trg_reto_questions_clean inesperado';
  end if;

  select count(*)
    into v_func_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'reto_questions_clean_trigger'
    and pg_get_function_identity_arguments(p.oid) = ''
    and p.prosecdef = false
    and pg_get_userbyid(p.proowner) = 'postgres';

  if v_func_count <> 1 then
    raise exception 'B2B_MIGRATION_ABORT: funcion reto_questions_clean_trigger inesperada';
  end if;

  if not has_table_privilege('anon', 'public.reto_questions', 'SELECT') then
    raise exception 'B2B_MIGRATION_ABORT: anon SELECT ya no coincide con preflight';
  end if;

  if not has_table_privilege('authenticated', 'public.reto_questions', 'SELECT') then
    raise exception 'B2B_MIGRATION_ABORT: authenticated SELECT ya no coincide con preflight';
  end if;

  if not has_table_privilege('service_role', 'public.reto_questions', 'SELECT') then
    raise exception 'B2B_MIGRATION_ABORT: service_role SELECT ausente';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid = 'public.reto_questions_clean_trigger()'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  )
  into v_public_func_exec;

  if v_public_func_exec is distinct from true then
    raise exception 'B2B_MIGRATION_ABORT: PUBLIC EXECUTE de trigger function ya no coincide con preflight';
  end if;

  if not has_function_privilege(
    'anon',
    'public.reto_questions_clean_trigger()',
    'EXECUTE'
  ) then
    raise exception 'B2B_MIGRATION_ABORT: anon EXECUTE ya no coincide con preflight';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.reto_questions_clean_trigger()',
    'EXECUTE'
  ) then
    raise exception 'B2B_MIGRATION_ABORT: authenticated EXECUTE ya no coincide con preflight';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.reto_questions_clean_trigger()',
    'EXECUTE'
  ) then
    raise exception 'B2B_MIGRATION_ABORT: service_role EXECUTE ya no coincide con preflight';
  end if;

  raise notice 'B2B_PREFLIGHT_OK';
end
$$;

-- ============================================================
-- 10. CHANGE
-- ============================================================

alter table public.reto_questions enable row level security;

revoke all privileges on table public.reto_questions
  from public, anon, authenticated, service_role;

grant select on table public.reto_questions
  to service_role;

revoke all privileges on function public.reto_questions_clean_trigger()
  from public, anon, authenticated, service_role;

-- ============================================================
-- 20. POSTCONDITIONS FAIL-CLOSED, TODAVIA DENTRO DE TRANSACCION
-- ============================================================

do $$
declare
  v_rls boolean;
  v_force boolean;
  v_policies integer;
  v_trigger_count integer;
  v_public_table_privs integer;
  v_public_func_exec boolean;
begin
  select c.relrowsecurity, c.relforcerowsecurity
    into v_rls, v_force
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'reto_questions'
    and c.relkind in ('r','p');

  if v_rls is distinct from true then
    raise exception 'B2B_POST_ABORT: RLS no quedo habilitado';
  end if;

  if v_force is distinct from false then
    raise exception 'B2B_POST_ABORT: FORCE RLS cambio inesperadamente';
  end if;

  select count(*)
    into v_policies
  from pg_policies
  where schemaname = 'public'
    and tablename = 'reto_questions';

  if v_policies <> 0 then
    raise exception 'B2B_POST_ABORT: policies inesperadas: %', v_policies;
  end if;

  if has_table_privilege('anon', 'public.reto_questions', 'SELECT')
     or has_table_privilege('anon', 'public.reto_questions', 'INSERT')
     or has_table_privilege('anon', 'public.reto_questions', 'UPDATE')
     or has_table_privilege('anon', 'public.reto_questions', 'DELETE')
     or has_table_privilege('anon', 'public.reto_questions', 'TRUNCATE')
     or has_table_privilege('anon', 'public.reto_questions', 'REFERENCES')
     or has_table_privilege('anon', 'public.reto_questions', 'TRIGGER') then
    raise exception 'B2B_POST_ABORT: anon conserva privilegios';
  end if;

  if has_table_privilege('authenticated', 'public.reto_questions', 'SELECT')
     or has_table_privilege('authenticated', 'public.reto_questions', 'INSERT')
     or has_table_privilege('authenticated', 'public.reto_questions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.reto_questions', 'DELETE')
     or has_table_privilege('authenticated', 'public.reto_questions', 'TRUNCATE')
     or has_table_privilege('authenticated', 'public.reto_questions', 'REFERENCES')
     or has_table_privilege('authenticated', 'public.reto_questions', 'TRIGGER') then
    raise exception 'B2B_POST_ABORT: authenticated conserva privilegios';
  end if;

  if not has_table_privilege('service_role', 'public.reto_questions', 'SELECT') then
    raise exception 'B2B_POST_ABORT: service_role perdio SELECT';
  end if;

  if has_table_privilege('service_role', 'public.reto_questions', 'INSERT')
     or has_table_privilege('service_role', 'public.reto_questions', 'UPDATE')
     or has_table_privilege('service_role', 'public.reto_questions', 'DELETE')
     or has_table_privilege('service_role', 'public.reto_questions', 'TRUNCATE')
     or has_table_privilege('service_role', 'public.reto_questions', 'REFERENCES')
     or has_table_privilege('service_role', 'public.reto_questions', 'TRIGGER') then
    raise exception 'B2B_POST_ABORT: service_role conserva privilegios distintos de SELECT';
  end if;

  select count(*)
    into v_public_table_privs
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(
    coalesce(c.relacl, acldefault('r', c.relowner))
  ) a
  where n.nspname = 'public'
    and c.relname = 'reto_questions'
    and a.grantee = 0;

  if v_public_table_privs <> 0 then
    raise exception 'B2B_POST_ABORT: PUBLIC conserva privilegios de tabla';
  end if;

  select exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where p.oid = 'public.reto_questions_clean_trigger()'::regprocedure
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  )
  into v_public_func_exec;

  if v_public_func_exec then
    raise exception 'B2B_POST_ABORT: PUBLIC conserva EXECUTE de trigger function';
  end if;

  if has_function_privilege(
       'anon',
       'public.reto_questions_clean_trigger()',
       'EXECUTE'
     ) then
    raise exception 'B2B_POST_ABORT: anon conserva EXECUTE de trigger function';
  end if;

  if has_function_privilege(
       'authenticated',
       'public.reto_questions_clean_trigger()',
       'EXECUTE'
     ) then
    raise exception 'B2B_POST_ABORT: authenticated conserva EXECUTE de trigger function';
  end if;

  if has_function_privilege(
       'service_role',
       'public.reto_questions_clean_trigger()',
       'EXECUTE'
     ) then
    raise exception 'B2B_POST_ABORT: service_role conserva EXECUTE de trigger function';
  end if;

  if not has_function_privilege(
       'postgres',
       'public.reto_questions_clean_trigger()',
       'EXECUTE'
     ) then
    raise exception 'B2B_POST_ABORT: owner postgres perdio capacidad de ejecutar trigger function';
  end if;

  select count(*)
    into v_trigger_count
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'reto_questions'
    and t.tgname = 'trg_reto_questions_clean'
    and not t.tgisinternal;

  if v_trigger_count <> 1 then
    raise exception 'B2B_POST_ABORT: trigger fue alterado o eliminado';
  end if;

  raise notice 'B2B_POSTCONDITIONS_OK';
end
$$;

commit;

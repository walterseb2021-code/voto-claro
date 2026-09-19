-- ============================================================================
-- BSEC EMPTY RELATIONAL TABLES
-- RLS / ACL HARDENING
--
-- Targets:
--   public.espacio_contactos
--   public.project_committee
--   public.project_reports
--
-- Estado final:
--   - RLS ON.
--   - FORCE RLS OFF.
--   - Sin policies publicas.
--   - anon: sin acceso.
--   - authenticated: sin acceso.
--   - service_role: SELECT solamente.
--   - 0 filas preservadas.
--   - foreign keys preservadas.
--
-- NO elimina tablas.
-- NO elimina foreign keys.
-- NO elimina registros.
-- NO modifica estructura funcional.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
  v_table text;
  v_owner text;
  v_count bigint;
  v_policy_count integer;
  v_dependency_count integer;
begin

  foreach v_table in array array[
    'espacio_contactos',
    'project_committee',
    'project_reports'
  ]
  loop

    if pg_catalog.to_regclass(
      pg_catalog.format(
        'public.%I',
        v_table
      )
    ) is null then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: table % missing',
        v_table;
    end if;


    select
      pg_catalog.pg_get_userbyid(c.relowner)
    into
      v_owner
    from pg_catalog.pg_class as c
    where c.oid =
      pg_catalog.to_regclass(
        pg_catalog.format(
          'public.%I',
          v_table
        )
      );


    if v_owner is distinct from 'postgres' then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: unexpected owner on %',
        v_table;
    end if;


    if (
      select c.relrowsecurity
      from pg_catalog.pg_class as c
      where c.oid =
        pg_catalog.to_regclass(
          pg_catalog.format(
            'public.%I',
            v_table
          )
        )
    ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: RLS already enabled on %',
        v_table;
    end if;


    if (
      select c.relforcerowsecurity
      from pg_catalog.pg_class as c
      where c.oid =
        pg_catalog.to_regclass(
          pg_catalog.format(
            'public.%I',
            v_table
          )
        )
    ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: FORCE RLS enabled on %',
        v_table;
    end if;


    execute pg_catalog.format(
      'select count(*)::bigint from public.%I',
      v_table
    )
    into v_count;


    if v_count <> 0 then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: expected 0 rows on %, found %',
        v_table,
        v_count;
    end if;


    select count(*)::integer
      into v_policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = v_table;


    if v_policy_count <> 0 then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: unexpected policies on %',
        v_table;
    end if;


    -- No non-internal triggers.

    select count(*)::integer
      into v_dependency_count
    from pg_catalog.pg_trigger as t
    where t.tgrelid =
        pg_catalog.to_regclass(
          pg_catalog.format(
            'public.%I',
            v_table
          )
        )
      and not t.tgisinternal;


    if v_dependency_count <> 0 then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: unexpected trigger on %',
        v_table;
    end if;


    -- No SQL functions referencing target.

    select count(*)::integer
      into v_dependency_count
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_catalog.pg_get_functiondef(p.oid)
            ilike '%' || v_table || '%';


    if v_dependency_count <> 0 then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: unexpected function dependency on %',
        v_table;
    end if;


    -- No publication.

    select count(*)::integer
      into v_dependency_count
    from pg_catalog.pg_publication_tables as pt
    where pt.schemaname = 'public'
      and pt.tablename = v_table;


    if v_dependency_count <> 0 then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: unexpected publication on %',
        v_table;
    end if;


    -- ACL baseline must still be broad before hardening.

    if not pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'SELECT'
       )
       or not pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'INSERT'
       )
       or not pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'UPDATE'
       )
       or not pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'DELETE'
       ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: service_role ACL baseline changed on %',
        v_table;
    end if;


    if not pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'SELECT'
       )
       or not pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'INSERT'
       )
       or not pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'UPDATE'
       )
       or not pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'DELETE'
       ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: anon ACL baseline changed on %',
        v_table;
    end if;


    if not pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'SELECT'
       )
       or not pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'INSERT'
       )
       or not pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'UPDATE'
       )
       or not pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'DELETE'
       ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_ABORT: authenticated ACL baseline changed on %',
        v_table;
    end if;

  end loop;

end
$$;


-- ============================================================================
-- 1. ENABLE RLS
-- ============================================================================

alter table public.espacio_contactos
  enable row level security;

alter table public.project_committee
  enable row level security;

alter table public.project_reports
  enable row level security;


-- ============================================================================
-- 2. TABLE ACL
-- ============================================================================

revoke all privileges
on table public.espacio_contactos
from public;

revoke all privileges
on table public.espacio_contactos
from anon;

revoke all privileges
on table public.espacio_contactos
from authenticated;

revoke all privileges
on table public.espacio_contactos
from service_role;

grant select
on table public.espacio_contactos
to service_role;


revoke all privileges
on table public.project_committee
from public;

revoke all privileges
on table public.project_committee
from anon;

revoke all privileges
on table public.project_committee
from authenticated;

revoke all privileges
on table public.project_committee
from service_role;

grant select
on table public.project_committee
to service_role;


revoke all privileges
on table public.project_reports
from public;

revoke all privileges
on table public.project_reports
from anon;

revoke all privileges
on table public.project_reports
from authenticated;

revoke all privileges
on table public.project_reports
from service_role;

grant select
on table public.project_reports
to service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
  v_table text;
  v_count bigint;
  v_policy_count integer;
begin

  foreach v_table in array array[
    'espacio_contactos',
    'project_committee',
    'project_reports'
  ]
  loop

    if not (
      select c.relrowsecurity
      from pg_catalog.pg_class as c
      where c.oid =
        pg_catalog.to_regclass(
          pg_catalog.format(
            'public.%I',
            v_table
          )
        )
    ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_POSTFAIL: RLS disabled on %',
        v_table;
    end if;


    if (
      select c.relforcerowsecurity
      from pg_catalog.pg_class as c
      where c.oid =
        pg_catalog.to_regclass(
          pg_catalog.format(
            'public.%I',
            v_table
          )
        )
    ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_POSTFAIL: FORCE RLS changed on %',
        v_table;
    end if;


    select count(*)::integer
      into v_policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = v_table;


    if v_policy_count <> 0 then
      raise exception
        'BSEC_EMPTY_RELATIONAL_POSTFAIL: policy exists on %',
        v_table;
    end if;


    execute pg_catalog.format(
      'select count(*)::bigint from public.%I',
      v_table
    )
    into v_count;


    if v_count <> 0 then
      raise exception
        'BSEC_EMPTY_RELATIONAL_POSTFAIL: rows changed on %',
        v_table;
    end if;


    -- service_role = SELECT only

    if not pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'SELECT'
       ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_POSTFAIL: service SELECT missing on %',
        v_table;
    end if;


    if pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'INSERT'
       )
       or pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'UPDATE'
       )
       or pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'DELETE'
       )
       or pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'TRUNCATE'
       )
       or pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'REFERENCES'
       )
       or pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'TRIGGER'
       )
       or pg_catalog.has_table_privilege(
         'service_role',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'MAINTAIN'
       ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_POSTFAIL: excessive service privilege on %',
        v_table;
    end if;


    -- anon = NONE

    if pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'SELECT'
       )
       or pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'INSERT'
       )
       or pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'UPDATE'
       )
       or pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'DELETE'
       )
       or pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'MAINTAIN'
       ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_POSTFAIL: anon privilege remains on %',
        v_table;
    end if;


    -- authenticated = NONE

    if pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'SELECT'
       )
       or pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'INSERT'
       )
       or pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'UPDATE'
       )
       or pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'DELETE'
       )
       or pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'MAINTAIN'
       ) then
      raise exception
        'BSEC_EMPTY_RELATIONAL_POSTFAIL: authenticated privilege remains on %',
        v_table;
    end if;

  end loop;

end
$$;
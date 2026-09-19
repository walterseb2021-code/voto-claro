-- ============================================================================
-- BSEC LEGACY BACKUP TABLES
-- RLS / ACL HARDENING
--
-- Targets:
--   public.espacio_mensajes_backup
--   public.reto_questions_backup
--   public.reto_questions_backup_20260315
--
-- Objetivo:
--   1. Preservar todas las filas.
--   2. Activar RLS.
--   3. No crear policies publicas.
--   4. Eliminar acceso directo de anon/authenticated.
--   5. Reducir service_role a SELECT.
--   6. Eliminar acceso a secuencias asociadas para roles no propietarios.
--
-- NO elimina tablas.
-- NO elimina registros.
-- NO modifica contenido.
-- NO activa FORCE RLS.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
  v_table text;
  v_expected_count bigint;
  v_actual_count bigint;
  v_owner text;
  v_rls boolean;
  v_force_rls boolean;
  v_policy_count integer;
begin

  for v_table, v_expected_count in

    select *
    from (
      values
        ('espacio_mensajes_backup'::text, 0::bigint),
        ('reto_questions_backup'::text, 50::bigint),
        ('reto_questions_backup_20260315'::text, 50::bigint)
    ) as expected(table_name, expected_count)

  loop

    if pg_catalog.to_regclass(
      pg_catalog.format(
        'public.%I',
        v_table
      )
    ) is null then
      raise exception
        'BSEC_BACKUP_ABORT: table % missing',
        v_table;
    end if;


    select
      pg_catalog.pg_get_userbyid(c.relowner),
      c.relrowsecurity,
      c.relforcerowsecurity
    into
      v_owner,
      v_rls,
      v_force_rls
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
        'BSEC_BACKUP_ABORT: unexpected owner for %',
        v_table;
    end if;


    if v_rls then
      raise exception
        'BSEC_BACKUP_ABORT: RLS already enabled on %',
        v_table;
    end if;


    if v_force_rls then
      raise exception
        'BSEC_BACKUP_ABORT: FORCE RLS unexpectedly enabled on %',
        v_table;
    end if;


    select count(*)::integer
      into v_policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = v_table;


    if v_policy_count <> 0 then
      raise exception
        'BSEC_BACKUP_ABORT: unexpected policies on %',
        v_table;
    end if;


    execute pg_catalog.format(
      'select count(*)::bigint from public.%I',
      v_table
    )
    into v_actual_count;


    if v_actual_count <> v_expected_count then
      raise exception
        'BSEC_BACKUP_ABORT: row count changed on %. Expected %, found %',
        v_table,
        v_expected_count,
        v_actual_count;
    end if;


    -- service_role baseline

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
        'BSEC_BACKUP_ABORT: unexpected service_role baseline on %',
        v_table;
    end if;


    -- anon baseline

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
        'BSEC_BACKUP_ABORT: unexpected anon baseline on %',
        v_table;
    end if;


    -- authenticated baseline

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
        'BSEC_BACKUP_ABORT: unexpected authenticated baseline on %',
        v_table;
    end if;

  end loop;

end
$$;


-- ============================================================================
-- 1. ENABLE RLS
-- ============================================================================

alter table public.espacio_mensajes_backup
  enable row level security;

alter table public.reto_questions_backup
  enable row level security;

alter table public.reto_questions_backup_20260315
  enable row level security;


-- ============================================================================
-- 2. TABLE ACL
-- ============================================================================

revoke all privileges
on table public.espacio_mensajes_backup
from public;

revoke all privileges
on table public.espacio_mensajes_backup
from anon;

revoke all privileges
on table public.espacio_mensajes_backup
from authenticated;

revoke all privileges
on table public.espacio_mensajes_backup
from service_role;

grant select
on table public.espacio_mensajes_backup
to service_role;


revoke all privileges
on table public.reto_questions_backup
from public;

revoke all privileges
on table public.reto_questions_backup
from anon;

revoke all privileges
on table public.reto_questions_backup
from authenticated;

revoke all privileges
on table public.reto_questions_backup
from service_role;

grant select
on table public.reto_questions_backup
to service_role;


revoke all privileges
on table public.reto_questions_backup_20260315
from public;

revoke all privileges
on table public.reto_questions_backup_20260315
from anon;

revoke all privileges
on table public.reto_questions_backup_20260315
from authenticated;

revoke all privileges
on table public.reto_questions_backup_20260315
from service_role;

grant select
on table public.reto_questions_backup_20260315
to service_role;


-- ============================================================================
-- 3. OWNED SEQUENCES
--
-- Si cualquiera de estas tablas posee una secuencia serial/identity,
-- se retiran sus privilegios de los roles no propietarios.
-- ============================================================================

do $$
declare
  r record;
begin

  for r in

    select distinct
      ns.nspname as schema_name,
      seq.relname as sequence_name

    from pg_catalog.pg_class as seq

    join pg_catalog.pg_namespace as ns
      on ns.oid = seq.relnamespace

    join pg_catalog.pg_depend as d
      on d.objid = seq.oid
     and d.deptype in ('a', 'i')

    join pg_catalog.pg_class as tbl
      on tbl.oid = d.refobjid

    join pg_catalog.pg_namespace as tns
      on tns.oid = tbl.relnamespace

    where seq.relkind = 'S'
      and tns.nspname = 'public'
      and tbl.relname in (
        'espacio_mensajes_backup',
        'reto_questions_backup',
        'reto_questions_backup_20260315'
      )

  loop

    execute pg_catalog.format(
      'revoke all privileges on sequence %I.%I from public',
      r.schema_name,
      r.sequence_name
    );

    execute pg_catalog.format(
      'revoke all privileges on sequence %I.%I from anon',
      r.schema_name,
      r.sequence_name
    );

    execute pg_catalog.format(
      'revoke all privileges on sequence %I.%I from authenticated',
      r.schema_name,
      r.sequence_name
    );

    execute pg_catalog.format(
      'revoke all privileges on sequence %I.%I from service_role',
      r.schema_name,
      r.sequence_name
    );

  end loop;

end
$$;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
  v_table text;
  v_expected_count bigint;
  v_actual_count bigint;
  v_policy_count integer;
  r record;
begin

  for v_table, v_expected_count in

    select *
    from (
      values
        ('espacio_mensajes_backup'::text, 0::bigint),
        ('reto_questions_backup'::text, 50::bigint),
        ('reto_questions_backup_20260315'::text, 50::bigint)
    ) as expected(table_name, expected_count)

  loop

    -- RLS must be ON.

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
        'BSEC_BACKUP_POSTFAIL: RLS disabled on %',
        v_table;
    end if;


    -- FORCE RLS must remain OFF.

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
        'BSEC_BACKUP_POSTFAIL: FORCE RLS changed on %',
        v_table;
    end if;


    -- No policies.

    select count(*)::integer
      into v_policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = v_table;


    if v_policy_count <> 0 then
      raise exception
        'BSEC_BACKUP_POSTFAIL: unexpected policy on %',
        v_table;
    end if;


    -- Preserve exact row count.

    execute pg_catalog.format(
      'select count(*)::bigint from public.%I',
      v_table
    )
    into v_actual_count;


    if v_actual_count <> v_expected_count then
      raise exception
        'BSEC_BACKUP_POSTFAIL: row count changed on %. Expected %, found %',
        v_table,
        v_expected_count,
        v_actual_count;
    end if;


    -- service_role must have SELECT only.

    if not pg_catalog.has_table_privilege(
      'service_role',
      pg_catalog.format(
        'public.%I',
        v_table
      ),
      'SELECT'
    ) then
      raise exception
        'BSEC_BACKUP_POSTFAIL: service_role SELECT missing on %',
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
        'BSEC_BACKUP_POSTFAIL: excessive service_role privilege on %',
        v_table;
    end if;


    -- anon must have no direct table privilege.

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
         'TRUNCATE'
       )
       or pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'REFERENCES'
       )
       or pg_catalog.has_table_privilege(
         'anon',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'TRIGGER'
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
        'BSEC_BACKUP_POSTFAIL: anon privilege remains on %',
        v_table;
    end if;


    -- authenticated must have no direct table privilege.

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
         'TRUNCATE'
       )
       or pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'REFERENCES'
       )
       or pg_catalog.has_table_privilege(
         'authenticated',
         pg_catalog.format(
           'public.%I',
           v_table
         ),
         'TRIGGER'
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
        'BSEC_BACKUP_POSTFAIL: authenticated privilege remains on %',
        v_table;
    end if;

  end loop;


  -- Verify any owned sequences are inaccessible to application roles.

  for r in

    select distinct
      ns.nspname as schema_name,
      seq.relname as sequence_name,
      seq.oid as sequence_oid

    from pg_catalog.pg_class as seq

    join pg_catalog.pg_namespace as ns
      on ns.oid = seq.relnamespace

    join pg_catalog.pg_depend as d
      on d.objid = seq.oid
     and d.deptype in ('a', 'i')

    join pg_catalog.pg_class as tbl
      on tbl.oid = d.refobjid

    join pg_catalog.pg_namespace as tns
      on tns.oid = tbl.relnamespace

    where seq.relkind = 'S'
      and tns.nspname = 'public'
      and tbl.relname in (
        'espacio_mensajes_backup',
        'reto_questions_backup',
        'reto_questions_backup_20260315'
      )

  loop

    if pg_catalog.has_sequence_privilege(
         'service_role',
         r.sequence_oid,
         'USAGE'
       )
       or pg_catalog.has_sequence_privilege(
         'service_role',
         r.sequence_oid,
         'SELECT'
       )
       or pg_catalog.has_sequence_privilege(
         'service_role',
         r.sequence_oid,
         'UPDATE'
       )
       or pg_catalog.has_sequence_privilege(
         'anon',
         r.sequence_oid,
         'USAGE'
       )
       or pg_catalog.has_sequence_privilege(
         'anon',
         r.sequence_oid,
         'SELECT'
       )
       or pg_catalog.has_sequence_privilege(
         'anon',
         r.sequence_oid,
         'UPDATE'
       )
       or pg_catalog.has_sequence_privilege(
         'authenticated',
         r.sequence_oid,
         'USAGE'
       )
       or pg_catalog.has_sequence_privilege(
         'authenticated',
         r.sequence_oid,
         'SELECT'
       )
       or pg_catalog.has_sequence_privilege(
         'authenticated',
         r.sequence_oid,
         'UPDATE'
       ) then
      raise exception
        'BSEC_BACKUP_POSTFAIL: sequence privilege remains on %.%',
        r.schema_name,
        r.sequence_name;
    end if;

  end loop;

end
$$;
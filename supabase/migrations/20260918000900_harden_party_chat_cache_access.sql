-- ============================================================================
-- BSEC PARTY CHAT CACHE
-- ISOLATION / RLS / ACL HARDENING
--
-- Target:
--   public.party_chat_cache
--   public.party_chat_cache_id_seq
--
-- Estado esperado antes:
--   - tabla vacia;
--   - RLS desactivado;
--   - sin policies;
--   - sin funciones consumidoras;
--   - sin triggers;
--   - sin vistas dependientes;
--   - sin publicaciones;
--   - sin foreign keys;
--   - privilegios amplios para anon/authenticated/service_role.
--
-- Estado final:
--   - RLS activado;
--   - FORCE RLS desactivado;
--   - ninguna policy;
--   - anon sin acceso;
--   - authenticated sin acceso;
--   - service_role sin acceso;
--   - secuencia sin acceso para roles de aplicacion;
--   - postgres conserva ownership/control.
--
-- NO elimina la tabla.
-- NO elimina la secuencia.
-- NO modifica datos.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
  v_owner text;
  v_sequence_owner text;
  v_policy_count integer;
  v_dependency_count integer;
  v_row_count bigint;
begin

  -- --------------------------------------------------------------------------
  -- Table existence / ownership
  -- --------------------------------------------------------------------------

  if pg_catalog.to_regclass(
    'public.party_chat_cache'
  ) is null then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: table missing';
  end if;


  select
    pg_catalog.pg_get_userbyid(c.relowner)
  into
    v_owner
  from pg_catalog.pg_class as c
  where c.oid =
    'public.party_chat_cache'::pg_catalog.regclass;


  if v_owner is distinct from 'postgres' then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: unexpected table owner';
  end if;


  -- --------------------------------------------------------------------------
  -- RLS baseline
  -- --------------------------------------------------------------------------

  if (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.party_chat_cache'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: RLS already enabled';
  end if;


  if (
    select c.relforcerowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.party_chat_cache'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: FORCE RLS unexpectedly enabled';
  end if;


  -- --------------------------------------------------------------------------
  -- Must remain empty.
  -- --------------------------------------------------------------------------

  select count(*)::bigint
    into v_row_count
  from public.party_chat_cache;


  if v_row_count <> 0 then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: expected 0 rows, found %',
      v_row_count;
  end if;


  -- --------------------------------------------------------------------------
  -- No policies.
  -- --------------------------------------------------------------------------

  select count(*)::integer
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'party_chat_cache';


  if v_policy_count <> 0 then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: unexpected policies';
  end if;


  -- --------------------------------------------------------------------------
  -- No non-internal triggers.
  -- --------------------------------------------------------------------------

  select count(*)::integer
    into v_dependency_count
  from pg_catalog.pg_trigger as t
  where t.tgrelid =
      'public.party_chat_cache'::pg_catalog.regclass
    and not t.tgisinternal;


  if v_dependency_count <> 0 then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: unexpected triggers';
  end if;


  -- --------------------------------------------------------------------------
  -- No SQL functions referencing table.
  -- --------------------------------------------------------------------------

  select count(*)::integer
    into v_dependency_count
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_catalog.pg_get_functiondef(p.oid)
          ilike '%party_chat_cache%';


  if v_dependency_count <> 0 then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: unexpected function dependency';
  end if;


  -- --------------------------------------------------------------------------
  -- No dependent views.
  -- --------------------------------------------------------------------------

  select count(distinct vc.oid)::integer
    into v_dependency_count

  from pg_catalog.pg_depend as d

  join pg_catalog.pg_rewrite as rw
    on rw.oid = d.objid

  join pg_catalog.pg_class as vc
    on vc.oid = rw.ev_class

  where d.refobjid =
      'public.party_chat_cache'::pg_catalog.regclass
    and d.classid =
      'pg_catalog.pg_rewrite'::pg_catalog.regclass
    and vc.oid <>
      'public.party_chat_cache'::pg_catalog.regclass;


  if v_dependency_count <> 0 then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: unexpected dependent views';
  end if;


  -- --------------------------------------------------------------------------
  -- No publications.
  -- --------------------------------------------------------------------------

  select count(*)::integer
    into v_dependency_count
  from pg_catalog.pg_publication_tables as pt
  where pt.schemaname = 'public'
    and pt.tablename = 'party_chat_cache';


  if v_dependency_count <> 0 then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: unexpected publication';
  end if;


  -- --------------------------------------------------------------------------
  -- No foreign keys in either direction.
  -- --------------------------------------------------------------------------

  select count(*)::integer
    into v_dependency_count
  from pg_catalog.pg_constraint as con
  where con.contype = 'f'
    and (
      con.conrelid =
        'public.party_chat_cache'::pg_catalog.regclass
      or
      con.confrelid =
        'public.party_chat_cache'::pg_catalog.regclass
    );


  if v_dependency_count <> 0 then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: unexpected foreign keys';
  end if;


  -- --------------------------------------------------------------------------
  -- Expected table ACL baseline.
  -- --------------------------------------------------------------------------

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'DELETE'
     ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: service_role ACL baseline changed';
  end if;


  if not pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'DELETE'
     ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: anon ACL baseline changed';
  end if;


  if not pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'DELETE'
     ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: authenticated ACL baseline changed';
  end if;


  -- --------------------------------------------------------------------------
  -- Sequence baseline.
  -- --------------------------------------------------------------------------

  if pg_catalog.to_regclass(
    'public.party_chat_cache_id_seq'
  ) is null then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: sequence missing';
  end if;


  select
    pg_catalog.pg_get_userbyid(c.relowner)
  into
    v_sequence_owner
  from pg_catalog.pg_class as c
  where c.oid =
    'public.party_chat_cache_id_seq'::pg_catalog.regclass;


  if v_sequence_owner is distinct from 'postgres' then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: unexpected sequence owner';
  end if;


  if not pg_catalog.has_sequence_privilege(
       'service_role',
       'public.party_chat_cache_id_seq',
       'USAGE'
     )
     or not pg_catalog.has_sequence_privilege(
       'anon',
       'public.party_chat_cache_id_seq',
       'USAGE'
     )
     or not pg_catalog.has_sequence_privilege(
       'authenticated',
       'public.party_chat_cache_id_seq',
       'USAGE'
     ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_ABORT: sequence ACL baseline changed';
  end if;

end
$$;


-- ============================================================================
-- 1. ENABLE RLS
-- ============================================================================

alter table public.party_chat_cache
  enable row level security;


-- ============================================================================
-- 2. TABLE ACL - COMPLETE APPLICATION ISOLATION
-- ============================================================================

revoke all privileges
on table public.party_chat_cache
from public;

revoke all privileges
on table public.party_chat_cache
from anon;

revoke all privileges
on table public.party_chat_cache
from authenticated;

revoke all privileges
on table public.party_chat_cache
from service_role;


-- ============================================================================
-- 3. SEQUENCE ACL - COMPLETE APPLICATION ISOLATION
-- ============================================================================

revoke all privileges
on sequence public.party_chat_cache_id_seq
from public;

revoke all privileges
on sequence public.party_chat_cache_id_seq
from anon;

revoke all privileges
on sequence public.party_chat_cache_id_seq
from authenticated;

revoke all privileges
on sequence public.party_chat_cache_id_seq
from service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
  v_row_count bigint;
  v_policy_count integer;
begin

  -- --------------------------------------------------------------------------
  -- RLS ON / FORCE RLS OFF
  -- --------------------------------------------------------------------------

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.party_chat_cache'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_POSTFAIL: RLS disabled';
  end if;


  if (
    select c.relforcerowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.party_chat_cache'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_POSTFAIL: FORCE RLS changed';
  end if;


  -- --------------------------------------------------------------------------
  -- No policies.
  -- --------------------------------------------------------------------------

  select count(*)::integer
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'party_chat_cache';


  if v_policy_count <> 0 then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_POSTFAIL: unexpected policy';
  end if;


  -- --------------------------------------------------------------------------
  -- Still empty.
  -- --------------------------------------------------------------------------

  select count(*)::bigint
    into v_row_count
  from public.party_chat_cache;


  if v_row_count <> 0 then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_POSTFAIL: row count changed';
  end if;


  -- --------------------------------------------------------------------------
  -- No direct table privileges for service_role.
  -- --------------------------------------------------------------------------

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_chat_cache',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_POSTFAIL: service_role table privilege remains';
  end if;


  -- --------------------------------------------------------------------------
  -- No direct table privileges for anon.
  -- --------------------------------------------------------------------------

  if pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_chat_cache',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_POSTFAIL: anon table privilege remains';
  end if;


  -- --------------------------------------------------------------------------
  -- No direct table privileges for authenticated.
  -- --------------------------------------------------------------------------

  if pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_chat_cache',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_POSTFAIL: authenticated table privilege remains';
  end if;


  -- --------------------------------------------------------------------------
  -- No sequence privileges for application roles.
  -- --------------------------------------------------------------------------

  if pg_catalog.has_sequence_privilege(
       'service_role',
       'public.party_chat_cache_id_seq',
       'USAGE'
     )
     or pg_catalog.has_sequence_privilege(
       'service_role',
       'public.party_chat_cache_id_seq',
       'SELECT'
     )
     or pg_catalog.has_sequence_privilege(
       'service_role',
       'public.party_chat_cache_id_seq',
       'UPDATE'
     )
     or pg_catalog.has_sequence_privilege(
       'anon',
       'public.party_chat_cache_id_seq',
       'USAGE'
     )
     or pg_catalog.has_sequence_privilege(
       'anon',
       'public.party_chat_cache_id_seq',
       'SELECT'
     )
     or pg_catalog.has_sequence_privilege(
       'anon',
       'public.party_chat_cache_id_seq',
       'UPDATE'
     )
     or pg_catalog.has_sequence_privilege(
       'authenticated',
       'public.party_chat_cache_id_seq',
       'USAGE'
     )
     or pg_catalog.has_sequence_privilege(
       'authenticated',
       'public.party_chat_cache_id_seq',
       'SELECT'
     )
     or pg_catalog.has_sequence_privilege(
       'authenticated',
       'public.party_chat_cache_id_seq',
       'UPDATE'
     ) then
    raise exception
      'BSEC_PARTY_CHAT_CACHE_POSTFAIL: sequence privilege remains';
  end if;

end
$$;
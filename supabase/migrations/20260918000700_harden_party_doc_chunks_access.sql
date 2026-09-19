-- ============================================================================
-- BSEC PARTY DOC CHUNKS
-- RLS / TABLE / SEQUENCE / FUNCTION ACL HARDENING
-- ============================================================================

do $$
declare
  v_owner text;
  v_policy_count integer;
  v_rows integer;
  v_match regprocedure;
  v_fragment regprocedure;
begin

  if pg_catalog.to_regclass(
    'public.party_doc_chunks'
  ) is null then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: table missing';
  end if;

  select pg_catalog.pg_get_userbyid(c.relowner)
    into v_owner
  from pg_catalog.pg_class as c
  where c.oid =
    'public.party_doc_chunks'::pg_catalog.regclass;

  if v_owner is distinct from 'postgres' then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: unexpected table owner';
  end if;

  if (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.party_doc_chunks'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: RLS already enabled';
  end if;

  if (
    select c.relforcerowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.party_doc_chunks'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: FORCE RLS unexpectedly enabled';
  end if;

  select count(*)::integer
    into v_policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public'
    and tablename = 'party_doc_chunks';

  if v_policy_count <> 0 then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: unexpected policies';
  end if;

  select count(*)::integer
    into v_rows
  from public.party_doc_chunks;

  if v_rows <> 152 then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: unexpected row count %',
      v_rows;
  end if;

  if exists (
    select 1
    from public.party_doc_chunks
    where embedding is null
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: unexpected null embeddings';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.party_doc_chunks',
    'SELECT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.party_doc_chunks',
    'INSERT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.party_doc_chunks',
    'UPDATE'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.party_doc_chunks',
    'DELETE'
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: service_role ACL baseline changed';
  end if;

  if not pg_catalog.has_table_privilege(
    'anon',
    'public.party_doc_chunks',
    'SELECT'
  )
  or not pg_catalog.has_table_privilege(
    'authenticated',
    'public.party_doc_chunks',
    'SELECT'
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: public ACL baseline changed';
  end if;

  if pg_catalog.to_regclass(
    'public.party_doc_chunks_id_seq'
  ) is null then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: sequence missing';
  end if;

  select pg_catalog.pg_get_userbyid(c.relowner)
    into v_owner
  from pg_catalog.pg_class as c
  where c.oid =
    'public.party_doc_chunks_id_seq'::pg_catalog.regclass;

  if v_owner is distinct from 'postgres' then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: unexpected sequence owner';
  end if;

  v_match :=
    pg_catalog.to_regprocedure(
      'public.match_party_chunks(text,public.vector,integer)'
    );

  v_fragment :=
    pg_catalog.to_regprocedure(
      'public.fragmentos_de_partido_de_coincidencia(integer,text,public.vector)'
    );

  if v_match is null or v_fragment is null then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: expected functions missing';
  end if;

  if (
    select pg_catalog.pg_get_userbyid(p.proowner)
    from pg_catalog.pg_proc as p
    where p.oid = v_match
  ) is distinct from 'postgres'
  or (
    select pg_catalog.pg_get_userbyid(p.proowner)
    from pg_catalog.pg_proc as p
    where p.oid = v_fragment
  ) is distinct from 'postgres' then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: function owner invalid';
  end if;

  if (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_match
  )
  or (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_fragment
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_ABORT: function security mode changed';
  end if;

end
$$;


-- ============================================================================
-- 1. ENABLE RLS
-- ============================================================================

alter table public.party_doc_chunks
  enable row level security;


-- ============================================================================
-- 2. TABLE ACL
-- ============================================================================

revoke all privileges
on table public.party_doc_chunks
from public;

revoke all privileges
on table public.party_doc_chunks
from anon;

revoke all privileges
on table public.party_doc_chunks
from authenticated;

revoke all privileges
on table public.party_doc_chunks
from service_role;

grant select
on table public.party_doc_chunks
to service_role;


-- ============================================================================
-- 3. SEQUENCE ACL
-- ============================================================================

revoke all privileges
on sequence public.party_doc_chunks_id_seq
from public;

revoke all privileges
on sequence public.party_doc_chunks_id_seq
from anon;

revoke all privileges
on sequence public.party_doc_chunks_id_seq
from authenticated;

revoke all privileges
on sequence public.party_doc_chunks_id_seq
from service_role;


-- ============================================================================
-- 4. FUNCTION ACL
--
-- Se conservan como SECURITY INVOKER.
-- service_role conserva EXECUTE porque puede existir un consumidor externo
-- server-side no presente en el repositorio.
-- ============================================================================

alter function public.match_party_chunks(
  text,
  public.vector,
  integer
)
set search_path = pg_catalog, public;

alter function public.fragmentos_de_partido_de_coincidencia(
  integer,
  text,
  public.vector
)
set search_path = pg_catalog, public;


revoke all
on function public.match_party_chunks(
  text,
  public.vector,
  integer
)
from public;

revoke all
on function public.match_party_chunks(
  text,
  public.vector,
  integer
)
from anon;

revoke all
on function public.match_party_chunks(
  text,
  public.vector,
  integer
)
from authenticated;

revoke all
on function public.match_party_chunks(
  text,
  public.vector,
  integer
)
from service_role;

grant execute
on function public.match_party_chunks(
  text,
  public.vector,
  integer
)
to service_role;


revoke all
on function public.fragmentos_de_partido_de_coincidencia(
  integer,
  text,
  public.vector
)
from public;

revoke all
on function public.fragmentos_de_partido_de_coincidencia(
  integer,
  text,
  public.vector
)
from anon;

revoke all
on function public.fragmentos_de_partido_de_coincidencia(
  integer,
  text,
  public.vector
)
from authenticated;

revoke all
on function public.fragmentos_de_partido_de_coincidencia(
  integer,
  text,
  public.vector
)
from service_role;

grant execute
on function public.fragmentos_de_partido_de_coincidencia(
  integer,
  text,
  public.vector
)
to service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
  v_match regprocedure;
  v_fragment regprocedure;
begin

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.party_doc_chunks'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: RLS disabled';
  end if;

  if (
    select c.relforcerowsecurity
    from pg_catalog.pg_class as c
    where c.oid =
      'public.party_doc_chunks'::pg_catalog.regclass
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: FORCE RLS changed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'party_doc_chunks'
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: unexpected policy';
  end if;

  if (
    select count(*)::integer
    from public.party_doc_chunks
  ) <> 152 then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: row count changed';
  end if;

  if (
    select count(*)::integer
    from public.party_doc_chunks
    where embedding is not null
  ) <> 152 then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: embedding count changed';
  end if;


  -- service_role = SELECT only

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.party_doc_chunks',
    'SELECT'
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: service SELECT missing';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.party_doc_chunks',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_doc_chunks',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_doc_chunks',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_doc_chunks',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_doc_chunks',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_doc_chunks',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.party_doc_chunks',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: excessive service privilege';
  end if;


  -- anon/authenticated = no table privilege

  if pg_catalog.has_table_privilege(
       'anon',
       'public.party_doc_chunks',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_doc_chunks',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_doc_chunks',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'anon',
       'public.party_doc_chunks',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_doc_chunks',
       'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_doc_chunks',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_doc_chunks',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'authenticated',
       'public.party_doc_chunks',
       'DELETE'
     ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: public table access remains';
  end if;


  -- no sequence access

  if pg_catalog.has_sequence_privilege(
       'service_role',
       'public.party_doc_chunks_id_seq',
       'USAGE'
     )
     or pg_catalog.has_sequence_privilege(
       'service_role',
       'public.party_doc_chunks_id_seq',
       'SELECT'
     )
     or pg_catalog.has_sequence_privilege(
       'service_role',
       'public.party_doc_chunks_id_seq',
       'UPDATE'
     )
     or pg_catalog.has_sequence_privilege(
       'anon',
       'public.party_doc_chunks_id_seq',
       'USAGE'
     )
     or pg_catalog.has_sequence_privilege(
       'authenticated',
       'public.party_doc_chunks_id_seq',
       'USAGE'
     ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: sequence access remains';
  end if;


  v_match :=
    pg_catalog.to_regprocedure(
      'public.match_party_chunks(text,public.vector,integer)'
    );

  v_fragment :=
    pg_catalog.to_regprocedure(
      'public.fragmentos_de_partido_de_coincidencia(integer,text,public.vector)'
    );


  -- service_role EXECUTE only

  if not pg_catalog.has_function_privilege(
       'service_role',
       v_match,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       v_fragment,
       'EXECUTE'
     ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: service function execute missing';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       v_match,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       v_match,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       v_fragment,
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       v_fragment,
       'EXECUTE'
     ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: public function execute remains';
  end if;


  -- Functions stay SECURITY INVOKER.

  if (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_match
  )
  or (
    select p.prosecdef
    from pg_catalog.pg_proc as p
    where p.oid = v_fragment
  ) then
    raise exception
      'BSEC_PARTY_DOC_CHUNKS_POSTFAIL: security mode changed';
  end if;

end
$$;
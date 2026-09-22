-- ============================================================================
-- BSEC COMMENT AWARDS
-- REMOVE RESIDUAL SERVICE_ROLE MAINTAIN PRIVILEGE
--
-- Current architecture:
--   - Direct runtime access requires SELECT only.
--   - Administrative INSERT/UPDATE operations use hardened SECURITY DEFINER RPCs.
--   - service_role currently retains an unnecessary MAINTAIN privilege.
--
-- Final ACL:
--   service_role = SELECT only
--   anon          = no direct access
--   authenticated = no direct access
--
-- This migration DOES NOT:
--   - modify data
--   - modify RLS
--   - modify policies
--   - modify triggers
--   - modify foreign keys
--   - modify RPC definitions or EXECUTE privileges
--   - modify publications
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
    v_rows bigint;
    v_create_oid oid;
    v_update_oid oid;
begin

    if pg_catalog.to_regclass(
        'public.comment_awards'
    ) is null then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: table missing';
    end if;


    -- ------------------------------------------------------------------------
    -- Exact production baseline.
    -- ------------------------------------------------------------------------

    select count(*)::bigint
    into v_rows
    from public.comment_awards;

    if v_rows <> 0 then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: expected 0 rows, found %',
            v_rows;
    end if;


    -- ------------------------------------------------------------------------
    -- RLS baseline.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'comment_awards'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: unexpected RLS state';
    end if;


    -- ------------------------------------------------------------------------
    -- No policies expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'public'
          and tablename = 'comment_awards'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: unexpected policy';
    end if;


    -- ------------------------------------------------------------------------
    -- No publication expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where schemaname = 'public'
          and tablename = 'comment_awards'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: unexpected publication';
    end if;


    -- ------------------------------------------------------------------------
    -- Exact current service_role ACL:
    -- SELECT + MAINTAIN only.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_awards',
        'SELECT'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: SELECT missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_awards',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: MAINTAIN baseline missing';
    end if;


    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_awards',
        'INSERT'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: unexpected INSERT';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_awards',
        'UPDATE'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: unexpected UPDATE';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_awards',
        'DELETE'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: unexpected DELETE';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_awards',
        'TRUNCATE'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: unexpected TRUNCATE';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_awards',
        'REFERENCES'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: unexpected REFERENCES';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_awards',
        'TRIGGER'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: unexpected TRIGGER';
    end if;


    -- ------------------------------------------------------------------------
    -- Browser roles must remain blocked.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_awards',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_awards',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_awards',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_awards',
            'DELETE'
        )
    then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: anon access changed';
    end if;


    if
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'DELETE'
        )
    then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: authenticated access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Identity trigger must remain.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid =
            'public.comment_awards'::regclass
          and tgname =
            'trg_vc_comment_award_identity'
          and not tgisinternal
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: identity trigger missing';
    end if;


    -- ------------------------------------------------------------------------
    -- Hardened administrative RPCs must remain SECURITY DEFINER,
    -- postgres-owned and executable by service_role.
    -- ------------------------------------------------------------------------

    v_create_oid :=
        pg_catalog.to_regprocedure(
            'public.admin_create_comment_award(uuid,integer,integer,text,text,text,text,boolean,boolean,text,uuid)'
        );

    v_update_oid :=
        pg_catalog.to_regprocedure(
            'public.admin_update_comment_award(uuid,text,text,text,text,boolean,boolean,text,uuid)'
        );

    if v_create_oid is null then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: create RPC missing';
    end if;

    if v_update_oid is null then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: update RPC missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_create_oid
          and p.prosecdef = true
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: create RPC security changed';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_update_oid
          and p.prosecdef = true
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: update RPC security changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_create_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: create RPC EXECUTE missing';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_update_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_ABORT: update RPC EXECUTE missing';
    end if;

end
$$;


-- ============================================================================
-- HARDEN ACL
-- ============================================================================

revoke maintain
on table public.comment_awards
from service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
    v_rows bigint;
    v_create_oid oid;
    v_update_oid oid;
begin

    -- ------------------------------------------------------------------------
    -- Final table ACL must be SELECT only.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_awards',
        'SELECT'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: SELECT missing';
    end if;


    if
        pg_catalog.has_table_privilege(
            'service_role',
            'public.comment_awards',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.comment_awards',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.comment_awards',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.comment_awards',
            'TRUNCATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.comment_awards',
            'REFERENCES'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.comment_awards',
            'TRIGGER'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.comment_awards',
            'MAINTAIN'
        )
    then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: residual non-SELECT privilege';
    end if;


    -- ------------------------------------------------------------------------
    -- Data preserved.
    -- ------------------------------------------------------------------------

    select count(*)::bigint
    into v_rows
    from public.comment_awards;

    if v_rows <> 0 then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: rows changed';
    end if;


    -- ------------------------------------------------------------------------
    -- RLS preserved.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'comment_awards'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: RLS changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Browser roles remain blocked.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_awards',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_awards',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_awards',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_awards',
            'DELETE'
        )
    then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: anon access changed';
    end if;


    if
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'DELETE'
        )
    then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: authenticated access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Trigger preserved.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid =
            'public.comment_awards'::regclass
          and tgname =
            'trg_vc_comment_award_identity'
          and not tgisinternal
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: trigger changed';
    end if;


    -- ------------------------------------------------------------------------
    -- RPC execution path preserved.
    -- ------------------------------------------------------------------------

    v_create_oid :=
        pg_catalog.to_regprocedure(
            'public.admin_create_comment_award(uuid,integer,integer,text,text,text,text,boolean,boolean,text,uuid)'
        );

    v_update_oid :=
        pg_catalog.to_regprocedure(
            'public.admin_update_comment_award(uuid,text,text,text,text,boolean,boolean,text,uuid)'
        );

    if
        v_create_oid is null
        or
        v_update_oid is null
    then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: RPC missing';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_create_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: create RPC EXECUTE changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_update_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_COMMENT_AWARDS_POSTFAIL: update RPC EXECUTE changed';
    end if;

end
$$;
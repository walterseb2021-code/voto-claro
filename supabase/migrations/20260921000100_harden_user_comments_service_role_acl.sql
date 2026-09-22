-- ============================================================================
-- BSEC USER COMMENTS
-- REMOVE RESIDUAL SERVICE_ROLE MAINTAIN PRIVILEGE
--
-- Required runtime ACL:
--   service_role = SELECT + INSERT
--
-- INSERT remains required by the active comments endpoint.
-- SELECT remains required by reads and by secure trigger/function logic.
--
-- MAINTAIN is not required by application runtime.
--
-- This migration DOES NOT:
--   - modify data
--   - revoke SELECT
--   - revoke INSERT
--   - modify RLS
--   - modify policies
--   - modify triggers
--   - modify functions
--   - modify foreign keys
--   - modify publications
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
    v_secure_insert_oid oid;
    v_admin_status_oid oid;
begin

    if pg_catalog.to_regclass(
        'public.user_comments'
    ) is null then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: table missing';
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
          and c.relname = 'user_comments'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: unexpected RLS state';
    end if;


    -- ------------------------------------------------------------------------
    -- No policies expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'public'
          and tablename = 'user_comments'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: unexpected policy';
    end if;


    -- ------------------------------------------------------------------------
    -- No publication expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where schemaname = 'public'
          and tablename = 'user_comments'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: unexpected publication';
    end if;


    -- ------------------------------------------------------------------------
    -- Exact service_role privilege model before hardening:
    -- SELECT + INSERT + MAINTAIN.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'SELECT'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: SELECT missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'INSERT'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: INSERT missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: MAINTAIN baseline missing';
    end if;


    if pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'UPDATE'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: unexpected UPDATE';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'DELETE'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: unexpected DELETE';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'TRUNCATE'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: unexpected TRUNCATE';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'REFERENCES'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: unexpected REFERENCES';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'TRIGGER'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: unexpected TRIGGER';
    end if;


    -- ------------------------------------------------------------------------
    -- Browser roles remain blocked.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.user_comments',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.user_comments',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.user_comments',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.user_comments',
            'DELETE'
        )
    then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: anon access changed';
    end if;


    if
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.user_comments',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.user_comments',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.user_comments',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.user_comments',
            'DELETE'
        )
    then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: authenticated access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Secure INSERT trigger must remain.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid =
            'public.user_comments'::regclass
          and tgname =
            'trg_vc_user_comments_secure_insert'
          and not tgisinternal
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: secure insert trigger missing';
    end if;


    -- ------------------------------------------------------------------------
    -- Secure INSERT trigger function.
    -- ------------------------------------------------------------------------

    v_secure_insert_oid :=
        pg_catalog.to_regprocedure(
            'public.vc_secure_user_comments_insert()'
        );

    if v_secure_insert_oid is null then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: secure insert function missing';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        v_secure_insert_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: secure insert EXECUTE missing';
    end if;


    -- ------------------------------------------------------------------------
    -- Administrative status mutations must continue through hardened RPC.
    -- ------------------------------------------------------------------------

    v_admin_status_oid :=
        pg_catalog.to_regprocedure(
            'public.admin_set_comment_content_status(text,uuid,text,text,uuid)'
        );

    if v_admin_status_oid is null then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: admin status RPC missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_admin_status_oid
          and p.prosecdef = true
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: admin status RPC security changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_admin_status_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_ABORT: admin status RPC EXECUTE missing';
    end if;

end
$$;


-- ============================================================================
-- HARDEN SERVICE_ROLE ACL
-- ============================================================================

revoke maintain
on table public.user_comments
from service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
    v_secure_insert_oid oid;
    v_admin_status_oid oid;
begin

    -- ------------------------------------------------------------------------
    -- Required direct runtime privileges must remain.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'SELECT'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_POSTFAIL: SELECT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.user_comments',
        'INSERT'
    ) then
        raise exception
            'BSEC_USER_COMMENTS_POSTFAIL: INSERT missing';
    end if;


    -- ------------------------------------------------------------------------
    -- All unnecessary privileges must be absent.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'service_role',
            'public.user_comments',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.user_comments',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.user_comments',
            'TRUNCATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.user_comments',
            'REFERENCES'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.user_comments',
            'TRIGGER'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.user_comments',
            'MAINTAIN'
        )
    then
        raise exception
            'BSEC_USER_COMMENTS_POSTFAIL: residual privilege';
    end if;


    -- ------------------------------------------------------------------------
    -- RLS remains unchanged.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'user_comments'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_USER_COMMENTS_POSTFAIL: RLS changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Browser roles remain blocked.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.user_comments',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.user_comments',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.user_comments',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.user_comments',
            'DELETE'
        )
    then
        raise exception
            'BSEC_USER_COMMENTS_POSTFAIL: anon access changed';
    end if;


    if
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.user_comments',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.user_comments',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.user_comments',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.user_comments',
            'DELETE'
        )
    then
        raise exception
            'BSEC_USER_COMMENTS_POSTFAIL: authenticated access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Secure insert path preserved.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid =
            'public.user_comments'::regclass
          and tgname =
            'trg_vc_user_comments_secure_insert'
          and not tgisinternal
    ) then
        raise exception
            'BSEC_USER_COMMENTS_POSTFAIL: secure trigger changed';
    end if;


    v_secure_insert_oid :=
        pg_catalog.to_regprocedure(
            'public.vc_secure_user_comments_insert()'
        );

    if
        v_secure_insert_oid is null
        or not pg_catalog.has_function_privilege(
            'service_role',
            v_secure_insert_oid,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_USER_COMMENTS_POSTFAIL: secure insert function changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Administrative RPC preserved.
    -- ------------------------------------------------------------------------

    v_admin_status_oid :=
        pg_catalog.to_regprocedure(
            'public.admin_set_comment_content_status(text,uuid,text,text,uuid)'
        );

    if
        v_admin_status_oid is null
        or not pg_catalog.has_function_privilege(
            'service_role',
            v_admin_status_oid,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_USER_COMMENTS_POSTFAIL: admin status RPC changed';
    end if;

end
$$;
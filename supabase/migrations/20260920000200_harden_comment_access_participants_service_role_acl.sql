-- ============================================================================
-- BSEC COMMENT ACCESS PARTICIPANTS
-- HARDEN SERVICE_ROLE TO SELECT ONLY
--
-- Current architecture:
--   - Historical/admin lookup table.
--   - Active runtime uses SELECT only.
--   - Stable participant identity lives in project_participants.
--
-- Final ACL:
--   service_role = SELECT only
--   anon         = no direct access
--   authenticated= no direct access
--
-- This migration DOES NOT:
--   - modify data
--   - remove the historical trigger
--   - modify functions
--   - modify foreign keys
--   - modify RLS
--   - modify publications
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
    v_rows bigint;
begin

    if to_regclass(
        'public.comment_access_participants'
    ) is null then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: table missing';
    end if;


    -- ------------------------------------------------------------------------
    -- Exact production baseline.
    -- ------------------------------------------------------------------------

    select count(*)::bigint
    into v_rows
    from public.comment_access_participants;

    if v_rows <> 13 then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: expected 13 rows, found %',
            v_rows;
    end if;


    -- ------------------------------------------------------------------------
    -- RLS state.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'comment_access_participants'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: unexpected RLS state';
    end if;


    -- ------------------------------------------------------------------------
    -- Current service_role baseline must be SELECT + INSERT + UPDATE.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'SELECT'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: SELECT missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'INSERT'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: INSERT missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'UPDATE'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: UPDATE missing';
    end if;


    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'DELETE'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: unexpected DELETE privilege';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'TRUNCATE'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: unexpected TRUNCATE privilege';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'REFERENCES'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: unexpected REFERENCES privilege';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'TRIGGER'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: unexpected TRIGGER privilege';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: unexpected MAINTAIN privilege';
    end if;


    -- ------------------------------------------------------------------------
    -- Browser roles remain fully blocked.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_access_participants',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_access_participants',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_access_participants',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_access_participants',
            'DELETE'
        )
    then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: anon access changed';
    end if;


    if
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_access_participants',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_access_participants',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_access_participants',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_access_participants',
            'DELETE'
        )
    then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: authenticated access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Historical validation trigger must remain.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid =
            'public.comment_access_participants'::regclass
          and tgname = 'trg_validate_forum_alias'
          and not tgisinternal
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: historical trigger missing';
    end if;


    -- ------------------------------------------------------------------------
    -- No publication is expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where schemaname = 'public'
          and tablename = 'comment_access_participants'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: unexpected publication';
    end if;


    -- ------------------------------------------------------------------------
    -- Moderation function must remain executable by service_role.
    -- It only reads this table.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_function_privilege(
        'service_role',
        'public.vc_comments_moderate_insert()',
        'EXECUTE'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_ABORT: moderation function EXECUTE missing';
    end if;

end
$$;


-- ============================================================================
-- MINIMIZE DIRECT SERVICE_ROLE ACCESS
-- ============================================================================

revoke insert
on table public.comment_access_participants
from service_role;

revoke update
on table public.comment_access_participants
from service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
    v_rows bigint;
begin

    -- ------------------------------------------------------------------------
    -- SELECT must remain.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'SELECT'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: SELECT missing';
    end if;


    -- ------------------------------------------------------------------------
    -- All service_role mutation/DDL privileges must now be absent.
    -- ------------------------------------------------------------------------

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'INSERT'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: INSERT remains';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'UPDATE'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: UPDATE remains';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'DELETE'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: DELETE present';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'TRUNCATE'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: TRUNCATE present';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'REFERENCES'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: REFERENCES present';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'TRIGGER'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: TRIGGER present';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.comment_access_participants',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: MAINTAIN present';
    end if;


    -- ------------------------------------------------------------------------
    -- Data preserved.
    -- ------------------------------------------------------------------------

    select count(*)::bigint
    into v_rows
    from public.comment_access_participants;

    if v_rows <> 13 then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: rows changed';
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
          and c.relname = 'comment_access_participants'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: RLS changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Historical trigger preserved.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid =
            'public.comment_access_participants'::regclass
          and tgname = 'trg_validate_forum_alias'
          and not tgisinternal
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: trigger changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Browser roles remain blocked.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_access_participants',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_access_participants',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_access_participants',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.comment_access_participants',
            'DELETE'
        )
    then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: anon access changed';
    end if;


    if
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_access_participants',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_access_participants',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_access_participants',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.comment_access_participants',
            'DELETE'
        )
    then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: authenticated access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Moderation function preserved.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_function_privilege(
        'service_role',
        'public.vc_comments_moderate_insert()',
        'EXECUTE'
    ) then
        raise exception
            'BSEC_COMMENT_ACCESS_POSTFAIL: moderation function changed';
    end if;

end
$$;
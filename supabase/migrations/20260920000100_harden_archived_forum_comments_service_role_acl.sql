-- ============================================================================
-- BSEC ARCHIVED TOPIC FORUM COMMENTS
-- HARDEN SERVICE_ROLE TABLE ACL
--
-- Runtime requirements already verified:
--   SELECT = required
--   INSERT = required
--   DELETE = required
--
-- Not required directly on this table:
--   UPDATE
--   TRUNCATE
--   REFERENCES
--   TRIGGER
--   MAINTAIN
--
-- This migration DOES NOT:
--   - change data
--   - change RLS
--   - change triggers
--   - change functions
--   - change foreign keys
--   - change publication membership
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
    v_rows bigint;
begin

    if to_regclass(
        'public.archived_topic_forum_comments'
    ) is null then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: table missing';
    end if;


    select count(*)::bigint
    into v_rows
    from public.archived_topic_forum_comments;

    if v_rows <> 8 then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: expected 8 rows, found %',
            v_rows;
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'archived_topic_forum_comments'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: unexpected RLS state';
    end if;


    -- service_role must currently have all expected privileges.

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'SELECT'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: service_role SELECT missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'INSERT'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: service_role INSERT missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'UPDATE'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: service_role UPDATE missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'DELETE'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: service_role DELETE missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'TRUNCATE'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: service_role TRUNCATE missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'REFERENCES'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: service_role REFERENCES missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'TRIGGER'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: service_role TRIGGER missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: service_role MAINTAIN missing';
    end if;


    -- anon/authenticated must remain without direct table access.

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'DELETE'
        )
    then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: anon access changed';
    end if;


    if
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'DELETE'
        )
    then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: authenticated access changed';
    end if;


    -- Trigger must still exist.

    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid =
            'public.archived_topic_forum_comments'::regclass
          and tgname = 'trg_vc_forum_secure_insert'
          and not tgisinternal
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: secure insert trigger missing';
    end if;


    -- Publication membership is preserved in this phase.

    if not exists (
        select 1
        from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'archived_topic_forum_comments'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_ABORT: realtime publication state changed';
    end if;

end
$$;


-- ============================================================================
-- MINIMIZE SERVICE_ROLE ACL
-- ============================================================================

revoke update
on table public.archived_topic_forum_comments
from service_role;

revoke truncate
on table public.archived_topic_forum_comments
from service_role;

revoke references
on table public.archived_topic_forum_comments
from service_role;

revoke trigger
on table public.archived_topic_forum_comments
from service_role;

revoke maintain
on table public.archived_topic_forum_comments
from service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
    v_rows bigint;
begin

    -- Required runtime privileges remain.

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'SELECT'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: SELECT missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'INSERT'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: INSERT missing';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'DELETE'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: DELETE missing';
    end if;


    -- Unneeded privileges must be gone.

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'UPDATE'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: UPDATE remains';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'TRUNCATE'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: TRUNCATE remains';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'REFERENCES'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: REFERENCES remains';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'TRIGGER'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: TRIGGER remains';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: MAINTAIN remains';
    end if;


    -- Data preserved.

    select count(*)::bigint
    into v_rows
    from public.archived_topic_forum_comments;

    if v_rows <> 8 then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: rows changed';
    end if;


    -- RLS preserved.

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'archived_topic_forum_comments'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: RLS changed';
    end if;


    -- Trigger preserved.

    if not exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid =
            'public.archived_topic_forum_comments'::regclass
          and tgname = 'trg_vc_forum_secure_insert'
          and not tgisinternal
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: trigger changed';
    end if;


    -- Realtime publication preserved.

    if not exists (
        select 1
        from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'archived_topic_forum_comments'
    ) then
        raise exception
            'BSEC_ARCHIVED_FORUM_POSTFAIL: publication changed';
    end if;

end
$$;
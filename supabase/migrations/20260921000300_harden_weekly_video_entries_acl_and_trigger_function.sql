-- ============================================================================
-- BSEC WEEKLY VIDEO ENTRIES
--
-- TABLE:
--   service_role minimum runtime ACL = SELECT + INSERT
--   revoke residual MAINTAIN
--
-- TRIGGER FUNCTION:
--   public.limit_weekly_videos_per_topic()
--
-- The function is an internal trigger implementation.
-- It is not an application RPC.
--
-- Hardenings:
--   - preserve SECURITY INVOKER
--   - preserve owner postgres
--   - set controlled search_path
--   - revoke direct EXECUTE from PUBLIC
--   - revoke direct EXECUTE from anon
--   - revoke direct EXECUTE from authenticated
--   - revoke direct EXECUTE from service_role
--   - preserve postgres EXECUTE
--   - preserve existing trigger
--
-- No row/data mutation is performed.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
    v_fn_oid oid;
begin

    if pg_catalog.to_regclass(
        'public.weekly_video_entries'
    ) is null then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: table missing';
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
          and c.relname = 'weekly_video_entries'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: unexpected RLS state';
    end if;


    -- No policies expected.

    if exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'public'
          and tablename = 'weekly_video_entries'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: unexpected policy';
    end if;


    -- No publication expected.

    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where schemaname = 'public'
          and tablename = 'weekly_video_entries'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: unexpected publication';
    end if;


    -- ------------------------------------------------------------------------
    -- Expected service_role table ACL:
    -- SELECT + INSERT + MAINTAIN.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_entries',
        'SELECT'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: SELECT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_entries',
        'INSERT'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: INSERT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_entries',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: MAINTAIN baseline missing';
    end if;


    if
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'TRUNCATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'REFERENCES'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'TRIGGER'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: unexpected table privilege';
    end if;


    -- Browser roles must remain blocked on table.

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_entries',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_entries',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_entries',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_entries',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_entries',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_entries',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_entries',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_entries',
            'DELETE'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: browser table access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Trigger function baseline.
    -- ------------------------------------------------------------------------

    v_fn_oid :=
        pg_catalog.to_regprocedure(
            'public.limit_weekly_videos_per_topic()'
        );

    if v_fn_oid is null then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: trigger function missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_fn_oid
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = false
          and p.proconfig is null
          and p.prorettype = 'trigger'::pg_catalog.regtype
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: unexpected function baseline';
    end if;


    -- PUBLIC currently has EXECUTE.
    -- grantee = 0 represents PUBLIC in ACLs.

    if not exists (
        select 1
        from pg_catalog.pg_proc p
        cross join lateral
            pg_catalog.aclexplode(
                coalesce(
                    p.proacl,
                    pg_catalog.acldefault(
                        'f',
                        p.proowner
                    )
                )
            ) acl
        where p.oid = v_fn_oid
          and acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: PUBLIC EXECUTE baseline changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'anon',
        v_fn_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: anon EXECUTE baseline changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'authenticated',
        v_fn_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: authenticated EXECUTE baseline changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_fn_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: service_role EXECUTE baseline changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'postgres',
        v_fn_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: postgres EXECUTE missing';
    end if;


    -- ------------------------------------------------------------------------
    -- Existing trigger must point exactly to target function.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_trigger tg
        where tg.tgrelid =
                'public.weekly_video_entries'::regclass
          and tg.tgname =
                'trg_limit_weekly_videos_per_topic'
          and tg.tgfoid = v_fn_oid
          and tg.tgenabled = 'O'
          and not tg.tgisinternal
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: trigger baseline changed';
    end if;


    if (
        select count(*)
        from pg_catalog.pg_trigger tg
        where tg.tgrelid =
                'public.weekly_video_entries'::regclass
          and not tg.tgisinternal
    ) <> 1 then
        raise exception
            'BSEC_WEEKLY_VIDEO_ABORT: unexpected trigger count';
    end if;

end
$$;


-- ============================================================================
-- HARDEN TABLE ACL
-- ============================================================================

revoke maintain
on table public.weekly_video_entries
from service_role;


-- ============================================================================
-- HARDEN TRIGGER FUNCTION
-- ============================================================================

alter function public.limit_weekly_videos_per_topic()
set search_path to pg_catalog, public, pg_temp;


revoke execute
on function public.limit_weekly_videos_per_topic()
from public, anon, authenticated, service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
    v_fn_oid oid;
begin

    -- ------------------------------------------------------------------------
    -- Minimum table ACL remains SELECT + INSERT.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_entries',
        'SELECT'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: SELECT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_entries',
        'INSERT'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: INSERT missing';
    end if;


    if
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'TRUNCATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'REFERENCES'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'TRIGGER'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_entries',
            'MAINTAIN'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: residual table privilege';
    end if;


    -- ------------------------------------------------------------------------
    -- Trigger function hardened.
    -- ------------------------------------------------------------------------

    v_fn_oid :=
        pg_catalog.to_regprocedure(
            'public.limit_weekly_videos_per_topic()'
        );

    if v_fn_oid is null then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: trigger function missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_fn_oid
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = false
          and p.proconfig @>
              array[
                  'search_path=pg_catalog, public, pg_temp'
              ]::text[]
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: function security state changed';
    end if;


    -- PUBLIC must no longer have EXECUTE.

    if exists (
        select 1
        from pg_catalog.pg_proc p
        cross join lateral
            pg_catalog.aclexplode(
                coalesce(
                    p.proacl,
                    pg_catalog.acldefault(
                        'f',
                        p.proowner
                    )
                )
            ) acl
        where p.oid = v_fn_oid
          and acl.grantee = 0
          and acl.privilege_type = 'EXECUTE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: PUBLIC EXECUTE remains';
    end if;


    if
        pg_catalog.has_function_privilege(
            'anon',
            v_fn_oid,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'authenticated',
            v_fn_oid,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'service_role',
            v_fn_oid,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: direct function EXECUTE remains';
    end if;


    if not pg_catalog.has_function_privilege(
        'postgres',
        v_fn_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: postgres EXECUTE lost';
    end if;


    -- ------------------------------------------------------------------------
    -- Existing trigger remains attached and enabled.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_trigger tg
        where tg.tgrelid =
                'public.weekly_video_entries'::regclass
          and tg.tgname =
                'trg_limit_weekly_videos_per_topic'
          and tg.tgfoid = v_fn_oid
          and tg.tgenabled = 'O'
          and not tg.tgisinternal
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: trigger changed';
    end if;


    -- RLS preserved.

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'weekly_video_entries'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: RLS changed';
    end if;


    -- Browser table access remains blocked.

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_entries',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_entries',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_entries',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_entries',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_entries',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_entries',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_entries',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_entries',
            'DELETE'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_POSTFAIL: browser table access changed';
    end if;

end
$$;
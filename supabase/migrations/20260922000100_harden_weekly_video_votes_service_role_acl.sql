-- ============================================================================
-- BSEC WEEKLY VIDEO VOTES
--
-- Runtime direct table requirements:
--   service_role SELECT
--   service_role INSERT
--
-- Residual privileges removed:
--   UPDATE
--   DELETE
--   TRUNCATE
--   REFERENCES
--   TRIGGER
--   MAINTAIN
--
-- Preserved:
--   RLS
--   no browser table access
--   no policies
--   no publications
--   vote eligibility trigger
--   trigger function
--   foreign keys
--   table data
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
    v_trigger_fn oid;
    v_publish_fn oid;
begin

    -- ------------------------------------------------------------------------
    -- Table must exist.
    -- ------------------------------------------------------------------------

    if pg_catalog.to_regclass(
        'public.weekly_video_votes'
    ) is null then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: table missing';
    end if;


    -- ------------------------------------------------------------------------
    -- Expected RLS state.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'weekly_video_votes'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: unexpected RLS state';
    end if;


    -- ------------------------------------------------------------------------
    -- No policies expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'public'
          and tablename = 'weekly_video_votes'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: unexpected policy';
    end if;


    -- ------------------------------------------------------------------------
    -- No publication expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where schemaname = 'public'
          and tablename = 'weekly_video_votes'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: unexpected publication';
    end if;


    -- ------------------------------------------------------------------------
    -- Current service_role baseline:
    -- full table ACL.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'SELECT'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: SELECT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'INSERT'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: INSERT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'UPDATE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: UPDATE baseline changed';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'DELETE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: DELETE baseline changed';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'TRUNCATE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: TRUNCATE baseline changed';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'REFERENCES'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: REFERENCES baseline changed';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'TRIGGER'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: TRIGGER baseline changed';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: MAINTAIN baseline changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Browser roles must remain blocked.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_votes',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_votes',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_votes',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_votes',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_votes',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_votes',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_votes',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_votes',
            'DELETE'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: browser table access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Eligibility trigger/function must exist.
    -- ------------------------------------------------------------------------

    v_trigger_fn :=
        pg_catalog.to_regprocedure(
            'public.enforce_weekly_video_vote_eligibility()'
        );

    if v_trigger_fn is null then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: eligibility function missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_trigger_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and p.proconfig @>
                array[
                    'search_path=pg_catalog'
                ]::text[]
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: eligibility function state changed';
    end if;


    if
        pg_catalog.has_function_privilege(
            'anon',
            v_trigger_fn,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'authenticated',
            v_trigger_fn,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'service_role',
            v_trigger_fn,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: eligibility function ACL changed';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_trigger tg
        where tg.tgrelid =
                'public.weekly_video_votes'::regclass
          and tg.tgname =
                'trg_weekly_video_vote_eligibility'
          and tg.tgfoid = v_trigger_fn
          and tg.tgenabled = 'O'
          and not tg.tgisinternal
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: eligibility trigger changed';
    end if;


    if (
        select count(*)
        from pg_catalog.pg_trigger tg
        where tg.tgrelid =
                'public.weekly_video_votes'::regclass
          and not tg.tgisinternal
    ) <> 1 then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: unexpected trigger count';
    end if;


    -- ------------------------------------------------------------------------
    -- Winner publication function is a protected SECURITY DEFINER RPC.
    -- Preserve it exactly.
    -- ------------------------------------------------------------------------

    v_publish_fn :=
        pg_catalog.to_regprocedure(
            'public.publish_weekly_winner_for_topic(uuid)'
        );

    if v_publish_fn is null then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: winner function missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_publish_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and p.proconfig @>
                array[
                    'search_path=pg_catalog'
                ]::text[]
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: winner function state changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_publish_fn,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: winner RPC service_role EXECUTE missing';
    end if;


    if
        pg_catalog.has_function_privilege(
            'anon',
            v_publish_fn,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'authenticated',
            v_publish_fn,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: winner RPC browser EXECUTE changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Required foreign keys.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_video_votes'::regclass
          and conname =
                'weekly_video_votes_project_participant_fk'
          and contype = 'f'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: participant FK missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_video_votes'::regclass
          and conname =
                'weekly_video_votes_weekly_topic_id_fkey'
          and contype = 'f'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: topic FK missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_video_votes'::regclass
          and conname =
                'weekly_video_votes_weekly_video_entry_id_fkey'
          and contype = 'f'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_ABORT: video FK missing';
    end if;

end
$$;


-- ============================================================================
-- HARDEN SERVICE_ROLE TABLE ACL
-- ============================================================================

revoke
    update,
    delete,
    truncate,
    references,
    trigger,
    maintain
on table public.weekly_video_votes
from service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
    v_trigger_fn oid;
    v_publish_fn oid;
begin

    -- ------------------------------------------------------------------------
    -- Minimum direct runtime ACL = SELECT + INSERT.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'SELECT'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: SELECT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_video_votes',
        'INSERT'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: INSERT missing';
    end if;


    if
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_votes',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_votes',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_votes',
            'TRUNCATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_votes',
            'REFERENCES'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_votes',
            'TRIGGER'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_video_votes',
            'MAINTAIN'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: residual privilege remains';
    end if;


    -- ------------------------------------------------------------------------
    -- RLS / policies / publications preserved.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'weekly_video_votes'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: RLS changed';
    end if;


    if exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'public'
          and tablename = 'weekly_video_votes'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: policy appeared';
    end if;


    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where schemaname = 'public'
          and tablename = 'weekly_video_votes'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: publication appeared';
    end if;


    -- ------------------------------------------------------------------------
    -- Browser roles remain blocked.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_votes',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_votes',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_votes',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_video_votes',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_votes',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_votes',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_votes',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_video_votes',
            'DELETE'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: browser access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Eligibility trigger/function preserved.
    -- ------------------------------------------------------------------------

    v_trigger_fn :=
        pg_catalog.to_regprocedure(
            'public.enforce_weekly_video_vote_eligibility()'
        );

    if v_trigger_fn is null then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: eligibility function missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_trigger tg
        where tg.tgrelid =
                'public.weekly_video_votes'::regclass
          and tg.tgname =
                'trg_weekly_video_vote_eligibility'
          and tg.tgfoid = v_trigger_fn
          and tg.tgenabled = 'O'
          and not tg.tgisinternal
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: trigger changed';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_trigger_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and p.proconfig @>
                array[
                    'search_path=pg_catalog'
                ]::text[]
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: eligibility function changed';
    end if;


    if
        pg_catalog.has_function_privilege(
            'anon',
            v_trigger_fn,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'authenticated',
            v_trigger_fn,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'service_role',
            v_trigger_fn,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: eligibility ACL changed';
    end if;


    -- ------------------------------------------------------------------------
    -- Winner RPC preserved.
    -- ------------------------------------------------------------------------

    v_publish_fn :=
        pg_catalog.to_regprocedure(
            'public.publish_weekly_winner_for_topic(uuid)'
        );

    if v_publish_fn is null then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: winner function missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_publish_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and p.proconfig @>
                array[
                    'search_path=pg_catalog'
                ]::text[]
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: winner function changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_publish_fn,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: winner RPC lost';
    end if;


    if
        pg_catalog.has_function_privilege(
            'anon',
            v_publish_fn,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'authenticated',
            v_publish_fn,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: winner RPC exposed';
    end if;


    -- ------------------------------------------------------------------------
    -- Foreign keys preserved.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_video_votes'::regclass
          and conname =
                'weekly_video_votes_project_participant_fk'
          and contype = 'f'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: participant FK missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_video_votes'::regclass
          and conname =
                'weekly_video_votes_weekly_topic_id_fkey'
          and contype = 'f'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: topic FK missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_video_votes'::regclass
          and conname =
                'weekly_video_votes_weekly_video_entry_id_fkey'
          and contype = 'f'
    ) then
        raise exception
            'BSEC_WEEKLY_VIDEO_VOTES_POSTFAIL: video FK missing';
    end if;

end
$$;
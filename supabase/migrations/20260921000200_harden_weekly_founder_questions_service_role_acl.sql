-- ============================================================================
-- BSEC WEEKLY FOUNDER QUESTIONS
-- REMOVE RESIDUAL SERVICE_ROLE MAINTAIN PRIVILEGE
--
-- Required runtime ACL:
--   service_role = SELECT + INSERT
--
-- Direct INSERT remains required by the founder-question endpoint.
-- Administrative UPDATE operations remain behind SECURITY DEFINER RPCs.
--
-- This migration only revokes MAINTAIN.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
    v_answer_rpc oid;
    v_publish_rpc oid;
begin

    if pg_catalog.to_regclass(
        'public.weekly_founder_questions'
    ) is null then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: table missing';
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
          and c.relname = 'weekly_founder_questions'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: unexpected RLS state';
    end if;


    -- ------------------------------------------------------------------------
    -- No policies expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'public'
          and tablename = 'weekly_founder_questions'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: unexpected policy';
    end if;


    -- ------------------------------------------------------------------------
    -- No publication expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where schemaname = 'public'
          and tablename = 'weekly_founder_questions'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: unexpected publication';
    end if;


    -- ------------------------------------------------------------------------
    -- Expected service_role baseline:
    -- SELECT + INSERT + MAINTAIN.
    -- ------------------------------------------------------------------------

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_founder_questions',
        'SELECT'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: SELECT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_founder_questions',
        'INSERT'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: INSERT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_founder_questions',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: MAINTAIN baseline missing';
    end if;


    if
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'TRUNCATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'REFERENCES'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'TRIGGER'
        )
    then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: unexpected service_role privilege';
    end if;


    -- ------------------------------------------------------------------------
    -- Browser roles must remain blocked.
    -- ------------------------------------------------------------------------

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_founder_questions',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_founder_questions',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_founder_questions',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_founder_questions',
            'DELETE'
        )
    then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: anon access changed';
    end if;


    if
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_founder_questions',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_founder_questions',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_founder_questions',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_founder_questions',
            'DELETE'
        )
    then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: authenticated access changed';
    end if;


    -- ------------------------------------------------------------------------
    -- No non-internal triggers expected.
    -- ------------------------------------------------------------------------

    if exists (
        select 1
        from pg_catalog.pg_trigger
        where tgrelid =
            'public.weekly_founder_questions'::regclass
          and not tgisinternal
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: unexpected trigger';
    end if;


    -- ------------------------------------------------------------------------
    -- Administrative RPC: answer question.
    -- ------------------------------------------------------------------------

    v_answer_rpc :=
        pg_catalog.to_regprocedure(
            'public.admin_answer_founder_question(uuid,text,text,boolean,text,uuid)'
        );

    if v_answer_rpc is null then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: answer RPC missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_answer_rpc
          and p.prosecdef = true
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.proconfig @> array['search_path=pg_catalog']::text[]
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: answer RPC security changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_answer_rpc,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: answer RPC EXECUTE missing';
    end if;


    if
        pg_catalog.has_function_privilege(
            'anon',
            v_answer_rpc,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'authenticated',
            v_answer_rpc,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: answer RPC browser EXECUTE';
    end if;


    -- ------------------------------------------------------------------------
    -- Administrative RPC: publish question.
    -- ------------------------------------------------------------------------

    v_publish_rpc :=
        pg_catalog.to_regprocedure(
            'public.admin_set_founder_question_publish(uuid,boolean,text,uuid)'
        );

    if v_publish_rpc is null then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: publish RPC missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_publish_rpc
          and p.prosecdef = true
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.proconfig @> array['search_path=pg_catalog']::text[]
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: publish RPC security changed';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_publish_rpc,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: publish RPC EXECUTE missing';
    end if;


    if
        pg_catalog.has_function_privilege(
            'anon',
            v_publish_rpc,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'authenticated',
            v_publish_rpc,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: publish RPC browser EXECUTE';
    end if;


    -- ------------------------------------------------------------------------
    -- Foreign keys preserved.
    -- ------------------------------------------------------------------------

    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_founder_questions'::regclass
          and contype = 'f'
          and conname =
                'weekly_founder_questions_weekly_topic_id_fkey'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: topic FK missing';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_founder_questions'::regclass
          and contype = 'f'
          and conname =
                'weekly_founder_questions_weekly_video_entry_id_fkey'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_ABORT: video FK missing';
    end if;

end
$$;


-- ============================================================================
-- HARDEN ACL
-- ============================================================================

revoke maintain
on table public.weekly_founder_questions
from service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
    v_answer_rpc oid;
    v_publish_rpc oid;
begin

    -- Required runtime ACL.

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_founder_questions',
        'SELECT'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_POSTFAIL: SELECT missing';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.weekly_founder_questions',
        'INSERT'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_POSTFAIL: INSERT missing';
    end if;


    -- Residual privileges must be absent.

    if
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'TRUNCATE'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'REFERENCES'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'TRIGGER'
        )
        or
        pg_catalog.has_table_privilege(
            'service_role',
            'public.weekly_founder_questions',
            'MAINTAIN'
        )
    then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_POSTFAIL: residual privilege';
    end if;


    -- RLS preserved.

    if not exists (
        select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n
          on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname = 'weekly_founder_questions'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_POSTFAIL: RLS changed';
    end if;


    -- Browser roles remain blocked.

    if
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_founder_questions',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_founder_questions',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_founder_questions',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'anon',
            'public.weekly_founder_questions',
            'DELETE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_founder_questions',
            'SELECT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_founder_questions',
            'INSERT'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_founder_questions',
            'UPDATE'
        )
        or
        pg_catalog.has_table_privilege(
            'authenticated',
            'public.weekly_founder_questions',
            'DELETE'
        )
    then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_POSTFAIL: browser access changed';
    end if;


    -- RPCs preserved.

    v_answer_rpc :=
        pg_catalog.to_regprocedure(
            'public.admin_answer_founder_question(uuid,text,text,boolean,text,uuid)'
        );

    v_publish_rpc :=
        pg_catalog.to_regprocedure(
            'public.admin_set_founder_question_publish(uuid,boolean,text,uuid)'
        );


    if
        v_answer_rpc is null
        or not pg_catalog.has_function_privilege(
            'service_role',
            v_answer_rpc,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_POSTFAIL: answer RPC changed';
    end if;


    if
        v_publish_rpc is null
        or not pg_catalog.has_function_privilege(
            'service_role',
            v_publish_rpc,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_POSTFAIL: publish RPC changed';
    end if;


    -- Foreign keys preserved.

    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_founder_questions'::regclass
          and contype = 'f'
          and conname =
                'weekly_founder_questions_weekly_topic_id_fkey'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_POSTFAIL: topic FK changed';
    end if;


    if not exists (
        select 1
        from pg_catalog.pg_constraint
        where conrelid =
                'public.weekly_founder_questions'::regclass
          and contype = 'f'
          and conname =
                'weekly_founder_questions_weekly_video_entry_id_fkey'
    ) then
        raise exception
            'BSEC_FOUNDER_QUESTIONS_POSTFAIL: video FK changed';
    end if;

end
$$;
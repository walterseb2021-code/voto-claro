begin;

do $guard$
declare
    v_publication_exists boolean;
    v_archived_membership integer;
    v_live_membership integer;
    v_archived_rows bigint;
begin
    select exists (
        select 1
        from pg_catalog.pg_publication
        where pubname = 'supabase_realtime'
    )
    into v_publication_exists;

    if not v_publication_exists then
        raise exception
            'BSEC_REALTIME_ABORT: supabase_realtime publication missing';
    end if;

    select count(*)::integer
    into v_archived_membership
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'archived_topic_forum_comments';

    if v_archived_membership <> 1 then
        raise exception
            'BSEC_REALTIME_ABORT: archived forum membership expected 1, got %',
            v_archived_membership;
    end if;

    select count(*)::integer
    into v_live_membership
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'votoclaro_live_entries';

    if v_live_membership <> 1 then
        raise exception
            'BSEC_REALTIME_ABORT: live entries membership expected 1, got %',
            v_live_membership;
    end if;

    if pg_catalog.has_table_privilege(
        'anon',
        'public.archived_topic_forum_comments',
        'SELECT'
    )
    or pg_catalog.has_table_privilege(
        'authenticated',
        'public.archived_topic_forum_comments',
        'SELECT'
    ) then
        raise exception
            'BSEC_REALTIME_ABORT: client SELECT unexpectedly enabled';
    end if;

    select count(*)
    into v_archived_rows
    from public.archived_topic_forum_comments;

    if v_archived_rows < 0 then
        raise exception
            'BSEC_REALTIME_ABORT: impossible row count';
    end if;
end
$guard$;


alter publication supabase_realtime
drop table public.archived_topic_forum_comments;


do $verify$
declare
    v_archived_membership integer;
    v_live_membership integer;
begin
    select count(*)::integer
    into v_archived_membership
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'archived_topic_forum_comments';

    if v_archived_membership <> 0 then
        raise exception
            'BSEC_REALTIME_VERIFY: archived forum still published';
    end if;

    select count(*)::integer
    into v_live_membership
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'votoclaro_live_entries';

    if v_live_membership <> 1 then
        raise exception
            'BSEC_REALTIME_VERIFY: live entries membership changed';
    end if;

    if pg_catalog.has_table_privilege(
        'anon',
        'public.archived_topic_forum_comments',
        'SELECT'
    )
    or pg_catalog.has_table_privilege(
        'authenticated',
        'public.archived_topic_forum_comments',
        'SELECT'
    ) then
        raise exception
            'BSEC_REALTIME_VERIFY: client SELECT changed';
    end if;
end
$verify$;

commit;
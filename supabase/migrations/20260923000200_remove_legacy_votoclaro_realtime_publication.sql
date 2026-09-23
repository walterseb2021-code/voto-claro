begin;

do $guard$
declare
    v_custom_oid oid;
    v_custom_owner text;
    v_custom_table_count integer;
    v_custom_live_count integer;
    v_supabase_live_count integer;
    v_archived_count integer;
    v_slot_count integer;
    v_subscription_count integer;
    v_replication_connection_count integer;
begin
    select
        p.oid,
        pg_catalog.pg_get_userbyid(p.pubowner)
    into
        v_custom_oid,
        v_custom_owner
    from pg_catalog.pg_publication p
    where p.pubname = 'votoclaro_realtime_pub';

    if v_custom_oid is null then
        raise exception
            'BSEC_CUSTOM_REALTIME_ABORT: votoclaro_realtime_pub missing';
    end if;

    if v_custom_owner <> 'postgres' then
        raise exception
            'BSEC_CUSTOM_REALTIME_ABORT: unexpected owner %',
            v_custom_owner;
    end if;

    select count(*)::integer
    into v_custom_table_count
    from pg_catalog.pg_publication_tables
    where pubname = 'votoclaro_realtime_pub';

    if v_custom_table_count <> 1 then
        raise exception
            'BSEC_CUSTOM_REALTIME_ABORT: custom publication table count expected 1, got %',
            v_custom_table_count;
    end if;

    select count(*)::integer
    into v_custom_live_count
    from pg_catalog.pg_publication_tables
    where pubname = 'votoclaro_realtime_pub'
      and schemaname = 'public'
      and tablename = 'votoclaro_live_entries';

    if v_custom_live_count <> 1 then
        raise exception
            'BSEC_CUSTOM_REALTIME_ABORT: live entries membership missing in custom publication';
    end if;

    select count(*)::integer
    into v_supabase_live_count
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'votoclaro_live_entries';

    if v_supabase_live_count <> 1 then
        raise exception
            'BSEC_CUSTOM_REALTIME_ABORT: live entries not safely present in supabase_realtime';
    end if;

    select count(*)::integer
    into v_archived_count
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'archived_topic_forum_comments';

    if v_archived_count <> 0 then
        raise exception
            'BSEC_CUSTOM_REALTIME_ABORT: archived forum unexpectedly returned to supabase_realtime';
    end if;

    select count(*)::integer
    into v_slot_count
    from pg_catalog.pg_replication_slots
    where database is null
       or database = pg_catalog.current_database();

    if v_slot_count <> 0 then
        raise exception
            'BSEC_CUSTOM_REALTIME_ABORT: replication slots detected: %',
            v_slot_count;
    end if;

    select count(*)::integer
    into v_subscription_count
    from pg_catalog.pg_subscription;

    if v_subscription_count <> 0 then
        raise exception
            'BSEC_CUSTOM_REALTIME_ABORT: database subscriptions detected: %',
            v_subscription_count;
    end if;

    select count(*)::integer
    into v_replication_connection_count
    from pg_catalog.pg_stat_replication;

    if v_replication_connection_count <> 0 then
        raise exception
            'BSEC_CUSTOM_REALTIME_ABORT: active replication connections detected: %',
            v_replication_connection_count;
    end if;
end
$guard$;


drop publication votoclaro_realtime_pub;


do $verify$
declare
    v_supabase_live_count integer;
    v_archived_count integer;
begin
    if exists (
        select 1
        from pg_catalog.pg_publication
        where pubname = 'votoclaro_realtime_pub'
    ) then
        raise exception
            'BSEC_CUSTOM_REALTIME_VERIFY: custom publication still exists';
    end if;

    select count(*)::integer
    into v_supabase_live_count
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'votoclaro_live_entries';

    if v_supabase_live_count <> 1 then
        raise exception
            'BSEC_CUSTOM_REALTIME_VERIFY: live entries membership in supabase_realtime changed';
    end if;

    select count(*)::integer
    into v_archived_count
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'archived_topic_forum_comments';

    if v_archived_count <> 0 then
        raise exception
            'BSEC_CUSTOM_REALTIME_VERIFY: archived forum membership changed';
    end if;

    if pg_catalog.to_regclass(
        'public.votoclaro_live_entries'
    ) is null then
        raise exception
            'BSEC_CUSTOM_REALTIME_VERIFY: live entries table missing';
    end if;
end
$verify$;

commit;
do $migration$
declare
  v_sessions_before bigint;
  v_duplicate_count bigint;
  v_service_bypass boolean;
begin
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  perform pg_catalog.set_config('statement_timeout', '60s', true);

  -- ============================================================
  -- PREFLIGHT
  -- ============================================================

  if pg_catalog.to_regclass('public.reto_game_sessions') is null then
    raise exception 'BSEC_E2_MISSING_TABLE: reto_game_sessions';
  end if;

  if pg_catalog.to_regclass('public.project_participants') is null then
    raise exception 'BSEC_E2_MISSING_TABLE: project_participants';
  end if;

  if pg_catalog.to_regprocedure(
    'public.start_reto_prize_session_atomic(uuid,text,text,jsonb)'
  ) is not null then
    raise exception 'BSEC_E2_RPC_ALREADY_EXISTS';
  end if;

  select r.rolbypassrls
  into v_service_bypass
  from pg_catalog.pg_roles r
  where r.rolname = 'service_role';

  if v_service_bypass is distinct from true then
    raise exception 'BSEC_E2_SERVICE_ROLE_NOT_BYPASSRLS';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.reto_game_sessions',
    'SELECT'
  ) or not pg_catalog.has_table_privilege(
    'service_role',
    'public.reto_game_sessions',
    'INSERT'
  ) or not pg_catalog.has_table_privilege(
    'service_role',
    'public.reto_game_sessions',
    'UPDATE'
  ) then
    raise exception 'BSEC_E2_UNEXPECTED_SESSION_PRIVILEGES';
  end if;

  if pg_catalog.has_table_privilege(
    'anon','public.reto_game_sessions','SELECT'
  ) or pg_catalog.has_table_privilege(
    'anon','public.reto_game_sessions','INSERT'
  ) or pg_catalog.has_table_privilege(
    'anon','public.reto_game_sessions','UPDATE'
  ) or pg_catalog.has_table_privilege(
    'anon','public.reto_game_sessions','DELETE'
  ) or pg_catalog.has_table_privilege(
    'authenticated','public.reto_game_sessions','SELECT'
  ) or pg_catalog.has_table_privilege(
    'authenticated','public.reto_game_sessions','INSERT'
  ) or pg_catalog.has_table_privilege(
    'authenticated','public.reto_game_sessions','UPDATE'
  ) or pg_catalog.has_table_privilege(
    'authenticated','public.reto_game_sessions','DELETE'
  ) then
    raise exception 'BSEC_E2_PUBLIC_SESSION_PRIVILEGE_PRESENT';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_game_sessions'
      and c.relrowsecurity
  ) then
    raise exception 'BSEC_E2_SESSION_RLS_DISABLED';
  end if;

  select count(*)
  into v_sessions_before
  from public.reto_game_sessions;

  select count(*)
  into v_duplicate_count
  from (
    select participant_id, game_code
    from public.reto_game_sessions
    where status = 'active'
    group by participant_id, game_code
    having count(*) > 1
  ) d;

  if v_duplicate_count <> 0 then
    raise exception 'BSEC_E2_ACTIVE_DUPLICATES_PRESENT';
  end if;

  -- ============================================================
  -- CHANGE: ATOMIC START RPC
  -- ============================================================

  execute $ddl$
    create function public.start_reto_prize_session_atomic(
      p_participant_id uuid,
      p_group_code text,
      p_game_code text,
      p_initial_state jsonb
    )
    returns table (
      outcome text,
      session_id uuid,
      locked_until timestamptz
    )
    language plpgsql
    security definer
    set search_path = pg_catalog
    as $function$
    declare
      v_now timestamptz;
      v_participant uuid;
      v_active public.reto_game_sessions%rowtype;
      v_recent_start timestamptz;
      v_new_id uuid;
    begin
      if p_participant_id is null
         or p_group_code is null
         or pg_catalog.btrim(p_group_code) !~ '^GRUPO[A-Z]$'
         or p_game_code is null
         or p_game_code not in ('principal','camino')
         or p_initial_state is null
         or pg_catalog.jsonb_typeof(p_initial_state) <> 'object' then
        raise exception 'RETO_START_INVALID_INPUT';
      end if;

      -- Participant row is the mutex for concurrent start requests.
      select pp.id
      into v_participant
      from public.project_participants pp
      where pp.id = p_participant_id
      for update;

      if not found then
        raise exception 'RETO_START_PARTICIPANT_NOT_FOUND';
      end if;

      -- Refresh the clock after waiting for the participant lock.
      v_now := pg_catalog.clock_timestamp();

      select s.*
      into v_active
      from public.reto_game_sessions s
      where s.participant_id = p_participant_id
        and s.game_code = p_game_code
        and s.game_mode = 'con_premio'
        and s.status = 'active'
      order by s.started_at desc
      limit 1
      for update;

      if found then
        if v_active.expires_at <= v_now then
          update public.reto_game_sessions s
          set status = 'expired',
              state_version = s.state_version + 1,
              updated_at = v_now,
              finished_at = v_now
          where s.id = v_active.id
            and s.status = 'active'
            and s.state_version = v_active.state_version;

          if not found then
            raise exception 'RETO_START_STATE_CONFLICT';
          end if;
        else
          if v_active.group_code <> pg_catalog.btrim(p_group_code) then
            return query
            select
              'group_mismatch'::text,
              v_active.id,
              null::timestamptz;
            return;
          end if;

          return query
          select
            'resumed'::text,
            v_active.id,
            null::timestamptz;
          return;
        end if;
      end if;

      -- Principal: one prize attempt per rolling 24 hours.
      if p_game_code = 'principal' then
        select max(s.started_at)
        into v_recent_start
        from public.reto_game_sessions s
        where s.participant_id = p_participant_id
          and s.game_code = 'principal'
          and s.game_mode = 'con_premio'
          and s.status <> 'revoked'
          and s.started_at >= v_now - interval '24 hours';

        if v_recent_start is not null then
          return query
          select
            'locked'::text,
            null::uuid,
            v_recent_start + interval '24 hours';
          return;
        end if;
      end if;

      insert into public.reto_game_sessions (
        participant_id,
        group_code,
        game_code,
        game_mode,
        status,
        state_version,
        state,
        started_at,
        updated_at,
        expires_at,
        finished_at
      )
      values (
        p_participant_id,
        pg_catalog.btrim(p_group_code),
        p_game_code,
        'con_premio',
        'active',
        1,
        p_initial_state,
        v_now,
        v_now,
        v_now + interval '1 hour',
        null
      )
      returning id into v_new_id;

      return query
      select
        'created'::text,
        v_new_id,
        null::timestamptz;
    end
    $function$;
  $ddl$;

  execute '
    alter function public.start_reto_prize_session_atomic(
      uuid,text,text,jsonb
    ) owner to postgres
  ';

  execute '
    revoke all on function public.start_reto_prize_session_atomic(
      uuid,text,text,jsonb
    ) from PUBLIC, anon, authenticated, service_role
  ';

  execute '
    grant execute on function public.start_reto_prize_session_atomic(
      uuid,text,text,jsonb
    ) to service_role
  ';

  -- Session creation must now occur only through the atomic RPC.
  execute '
    revoke insert on table public.reto_game_sessions
    from service_role
  ';

  -- ============================================================
  -- POSTFLIGHT
  -- ============================================================

  if pg_catalog.to_regprocedure(
    'public.start_reto_prize_session_atomic(uuid,text,text,jsonb)'
  ) is null then
    raise exception 'BSEC_E2_POSTFAIL_RPC_MISSING';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'start_reto_prize_session_atomic'
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef = true
      and p.proconfig @> array['search_path=pg_catalog']::text[]
  ) then
    raise exception 'BSEC_E2_POSTFAIL_RPC_SECURITY';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.start_reto_prize_session_atomic(uuid,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'BSEC_E2_POSTFAIL_SERVICE_EXECUTE';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.start_reto_prize_session_atomic(uuid,text,text,jsonb)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.start_reto_prize_session_atomic(uuid,text,text,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'BSEC_E2_POSTFAIL_PUBLIC_EXECUTE';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'public.reto_game_sessions',
    'INSERT'
  ) then
    raise exception 'BSEC_E2_POSTFAIL_DIRECT_INSERT_REMAINS';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.reto_game_sessions',
    'SELECT'
  ) or not pg_catalog.has_table_privilege(
    'service_role',
    'public.reto_game_sessions',
    'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'service_role',
    'public.reto_game_sessions',
    'DELETE'
  ) then
    raise exception 'BSEC_E2_POSTFAIL_RUNTIME_PRIVILEGES';
  end if;

  if (
    select count(*)
    from public.reto_game_sessions
  ) <> v_sessions_before then
    raise exception 'BSEC_E2_POSTFAIL_SESSION_COUNT_CHANGED';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'reto_game_sessions'
      and c.relrowsecurity
  ) then
    raise exception 'BSEC_E2_POSTFAIL_RLS_DISABLED';
  end if;
end
$migration$;

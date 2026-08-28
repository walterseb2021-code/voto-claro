-- ============================================================
-- B2C-E5F7C
-- EXTENDER RESULTADO AUTORITATIVO DEL START ATOMICO DEL RETO
-- ============================================================
--
-- Objetivo:
--   Evitar que /secure/start necesite una lectura posterior al COMMIT.
--   Para outcomes created/resumed, la RPC devuelve desde la misma
--   transaccion el snapshot completo necesario para reconstruir la sesion.
--
-- RETO_PRIZES_ENABLED debe permanecer false durante este bloque.
--
begin;

do $preflight$
declare
  v_proc regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_search_path text;
  v_result text;
begin
  v_proc := pg_catalog.to_regprocedure(
    'public.start_reto_prize_session_atomic(uuid,text,text,jsonb)'
  );

  if v_proc is null then
    raise exception 'B2C_E5F7C_ABORT: RPC base no existe';
  end if;

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    pg_catalog.array_to_string(p.proconfig, ','),
    pg_catalog.pg_get_function_result(p.oid)
  into
    v_owner,
    v_security_definer,
    v_search_path,
    v_result
  from pg_catalog.pg_proc p
  where p.oid = v_proc;

  if v_owner <> 'postgres' then
    raise exception 'B2C_E5F7C_ABORT: owner inesperado %', v_owner;
  end if;

  if not v_security_definer then
    raise exception 'B2C_E5F7C_ABORT: SECURITY DEFINER ausente';
  end if;

  if coalesce(v_search_path, '') <> 'search_path=pg_catalog' then
    raise exception 'B2C_E5F7C_ABORT: search_path inesperado %', v_search_path;
  end if;

  if v_result not ilike '%outcome text%'
     or v_result not ilike '%session_id uuid%'
     or v_result not ilike '%locked_until timestamp with time zone%'
     or v_result ilike '%session_state jsonb%'
     or v_result ilike '%state_version integer%' then
    raise exception 'B2C_E5F7C_ABORT: firma de retorno base inesperada %', v_result;
  end if;

  if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F7C_ABORT: ACL de ejecucion inesperada';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_game_sessions',
       'INSERT'
     ) then
    raise exception 'B2C_E5F7C_ABORT: service_role conserva INSERT directo en sesiones';
  end if;
end
$preflight$;

drop function public.start_reto_prize_session_atomic(
  uuid, text, text, jsonb
);

create function public.start_reto_prize_session_atomic(
  p_participant_id uuid,
  p_group_code text,
  p_game_code text,
  p_initial_state jsonb
)
returns table (
  outcome text,
  session_id uuid,
  locked_until timestamptz,
  session_status text,
  state_version integer,
  session_state jsonb,
  started_at timestamptz,
  updated_at timestamptz,
  expires_at timestamptz,
  finished_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz;
  v_participant uuid;
  v_active public.reto_game_sessions%rowtype;
  v_created public.reto_game_sessions%rowtype;
  v_recent_start timestamptz;
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

  select pp.id
  into v_participant
  from public.project_participants pp
  where pp.id = p_participant_id
  for update;

  if not found then
    raise exception 'RETO_START_PARTICIPANT_NOT_FOUND';
  end if;

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
          null::timestamptz,
          null::text,
          null::integer,
          null::jsonb,
          null::timestamptz,
          null::timestamptz,
          null::timestamptz,
          null::timestamptz;
        return;
      end if;

      return query
      select
        'resumed'::text,
        v_active.id,
        null::timestamptz,
        v_active.status,
        v_active.state_version,
        v_active.state,
        v_active.started_at,
        v_active.updated_at,
        v_active.expires_at,
        v_active.finished_at;
      return;
    end if;
  end if;

  if p_game_code = 'principal' then
    select pg_catalog.max(s.started_at)
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
        v_recent_start + interval '24 hours',
        null::text,
        null::integer,
        null::jsonb,
        null::timestamptz,
        null::timestamptz,
        null::timestamptz,
        null::timestamptz;
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
  returning * into v_created;

  if v_created.id is null
     or v_created.status <> 'active'
     or v_created.state_version <> 1
     or v_created.state is null
     or v_created.started_at is null
     or v_created.updated_at is null
     or v_created.expires_at is null
     or v_created.finished_at is not null then
    raise exception 'RETO_START_RESULT_STATE_INVALID';
  end if;

  return query
  select
    'created'::text,
    v_created.id,
    null::timestamptz,
    v_created.status,
    v_created.state_version,
    v_created.state,
    v_created.started_at,
    v_created.updated_at,
    v_created.expires_at,
    v_created.finished_at;
end
$function$;

alter function public.start_reto_prize_session_atomic(
  uuid, text, text, jsonb
) owner to postgres;

revoke all on function public.start_reto_prize_session_atomic(
  uuid, text, text, jsonb
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.start_reto_prize_session_atomic(
  uuid, text, text, jsonb
) to service_role;

revoke insert on table public.reto_game_sessions
from service_role;

do $postflight$
declare
  v_proc regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_search_path text;
  v_result text;
begin
  v_proc := pg_catalog.to_regprocedure(
    'public.start_reto_prize_session_atomic(uuid,text,text,jsonb)'
  );

  if v_proc is null then
    raise exception 'B2C_E5F7C_POSTFLIGHT: RPC no existe';
  end if;

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    pg_catalog.array_to_string(p.proconfig, ','),
    pg_catalog.pg_get_function_result(p.oid)
  into
    v_owner,
    v_security_definer,
    v_search_path,
    v_result
  from pg_catalog.pg_proc p
  where p.oid = v_proc;

  if v_owner <> 'postgres' then
    raise exception 'B2C_E5F7C_POSTFLIGHT: owner inesperado %', v_owner;
  end if;

  if not v_security_definer then
    raise exception 'B2C_E5F7C_POSTFLIGHT: SECURITY DEFINER ausente';
  end if;

  if coalesce(v_search_path, '') <> 'search_path=pg_catalog' then
    raise exception 'B2C_E5F7C_POSTFLIGHT: search_path inesperado %', v_search_path;
  end if;

  if v_result not ilike '%outcome text%'
     or v_result not ilike '%session_id uuid%'
     or v_result not ilike '%locked_until timestamp with time zone%'
     or v_result not ilike '%session_status text%'
     or v_result not ilike '%state_version integer%'
     or v_result not ilike '%session_state jsonb%'
     or v_result not ilike '%started_at timestamp with time zone%'
     or v_result not ilike '%updated_at timestamp with time zone%'
     or v_result not ilike '%expires_at timestamp with time zone%'
     or v_result not ilike '%finished_at timestamp with time zone%' then
    raise exception 'B2C_E5F7C_POSTFLIGHT: retorno extendido incompleto %', v_result;
  end if;

  if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F7C_POSTFLIGHT: ACL de ejecucion inesperada';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.reto_game_sessions',
       'INSERT'
     ) then
    raise exception 'B2C_E5F7C_POSTFLIGHT: service_role recupero INSERT directo en sesiones';
  end if;
end
$postflight$;

commit;

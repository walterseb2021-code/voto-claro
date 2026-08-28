-- ============================================================
-- B2C-E5F7B
-- EXTENDER RESULTADO AUTORITATIVO DEL SPIN ATOMICO DEL RETO
-- ============================================================
--
-- Objetivo:
--   Mantener toda la decision y persistencia del giro dentro de PostgreSQL
--   y devolver, desde la misma transaccion, el status, state y finished_at
--   finales. Asi /secure/spin no necesita una lectura posterior al COMMIT.
--
-- RETO_PRIZES_ENABLED debe permanecer false durante este bloque.
-- ============================================================

begin;

-- ============================================================
-- PREFLIGHT
-- ============================================================

do $preflight$
declare
  v_proc regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_search_path text;
  v_result text;
begin
  v_proc :=
    pg_catalog.to_regprocedure(
      'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)'
    );

  if v_proc is null then
    raise exception 'B2C_E5F7B_ABORT: RPC base no existe';
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
    raise exception 'B2C_E5F7B_ABORT: owner inesperado %', v_owner;
  end if;

  if not v_security_definer then
    raise exception 'B2C_E5F7B_ABORT: SECURITY DEFINER ausente';
  end if;

  if coalesce(v_search_path, '') <> 'search_path=pg_catalog' then
    raise exception 'B2C_E5F7B_ABORT: search_path inesperado %', v_search_path;
  end if;

  if v_result not ilike '%prize_locked_until timestamp with time zone%'
     or v_result ilike '%session_status text%'
     or v_result ilike '%session_state jsonb%'
     or v_result ilike '%finished_at timestamp with time zone%' then
    raise exception 'B2C_E5F7B_ABORT: firma de retorno base inesperada %', v_result;
  end if;

  if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F7B_ABORT: ACL de ejecucion inesperada';
  end if;
end
$preflight$;

-- ============================================================
-- CHANGE
-- PostgreSQL no permite CREATE OR REPLACE al cambiar columnas OUT.
-- La funcion se reemplaza con la misma firma de entrada.
-- ============================================================

drop function public.finalize_reto_principal_spin_atomic(
  uuid, uuid, text, integer, smallint
);

create function public.finalize_reto_principal_spin_atomic(
  p_session_id uuid,
  p_participant_id uuid,
  p_group_code text,
  p_expected_state_version integer,
  p_segment smallint
)
returns table (
  session_id uuid,
  state_version integer,
  segment smallint,
  is_prize boolean,
  awarded boolean,
  award_reason text,
  winner_id uuid,
  prize_locked_until timestamptz,
  session_status text,
  session_state jsonb,
  finished_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_session public.reto_game_sessions%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_next_state jsonb;
  v_is_prize boolean := false;
  v_awarded boolean := false;
  v_award_reason text := 'not_prize';
  v_winner_id uuid := null;
  v_last_win timestamptz := null;
  v_locked_until timestamptz := null;
  v_year_month text;
  v_dni text;
  v_email text;
  v_phone text;
  v_device_id text;
  v_return_status text;
  v_return_state jsonb;
  v_return_finished_at timestamptz;
begin
  if p_session_id is null
     or p_participant_id is null
     or p_expected_state_version is null
     or p_expected_state_version <= 0
     or p_group_code is null
     or pg_catalog.btrim(p_group_code) !~ '^GRUPO[A-Z]$'
     or p_segment is null
     or p_segment < 1
     or p_segment > 8 then
    raise exception 'RETO_FINALIZE_INVALID_INPUT';
  end if;

  select s.*
  into v_session
  from public.reto_game_sessions s
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = pg_catalog.btrim(p_group_code)
    and s.game_code = 'principal'
    and s.game_mode = 'con_premio'
    and s.status = 'active'
  for update;

  if not found then
    raise exception 'RETO_FINALIZE_SESSION_NOT_ACTIVE';
  end if;

  if v_session.state_version <> p_expected_state_version then
    raise exception 'RETO_FINALIZE_STATE_CONFLICT';
  end if;

  if v_session.expires_at <= v_now then
    raise exception 'RETO_FINALIZE_SESSION_EXPIRED';
  end if;

  if v_session.state ->> 'phase' is distinct from 'roulette'
     or v_session.state ->> 'level1_passed' is distinct from 'true'
     or v_session.state ->> 'level2_passed' is distinct from 'true'
     or v_session.state ->> 'roulette_used' is distinct from 'false'
     or v_session.state ->> 'current_question_id' is not null then
    raise exception 'RETO_FINALIZE_STATE_INVALID';
  end if;

  v_is_prize := p_segment in (2, 6);

  v_next_state := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(v_session.state, '{phase}', '"completed"'::jsonb, true),
      '{roulette_used}', 'true'::jsonb, true
    ),
    '{roulette_result}', pg_catalog.to_jsonb(p_segment), true
  );

  if v_is_prize then
    select pp.dni, pp.email, pp.phone, pp.device_id
    into v_dni, v_email, v_phone, v_device_id
    from public.project_participants pp
    where pp.id = p_participant_id;

    if not found
       or pg_catalog.btrim(coalesce(v_dni, '')) = ''
       or pg_catalog.btrim(coalesce(v_email, '')) = ''
       or pg_catalog.btrim(coalesce(v_phone, '')) = '' then
      raise exception 'RETO_FINALIZE_PARTICIPANT_DATA_INVALID';
    end if;

    select pg_catalog.max(w.created_at)
    into v_last_win
    from public.reto_premio_winners w
    where w.participant_id = p_participant_id;

    if v_last_win is not null and v_last_win + interval '30 days' > v_now then
      v_award_reason := 'recent_prize_lock';
      v_locked_until := v_last_win + interval '30 days';
    else
      v_year_month := pg_catalog.to_char(v_now at time zone 'UTC', 'YYYY-MM');

      if exists (
        select 1
        from public.reto_premio_winners w
        where w.participant_id = p_participant_id
          and w.year_month = v_year_month
      ) then
        v_award_reason := 'month_unique_lock';
      else
        insert into public.reto_premio_winners (
          group_code, dni, celular, email, device_id,
          prize_segment, prize_note, year_month, status,
          participant_id, game_session_id
        )
        values (
          pg_catalog.btrim(p_group_code),
          pg_catalog.btrim(v_dni),
          pg_catalog.btrim(v_phone),
          pg_catalog.btrim(v_email),
          nullif(pg_catalog.btrim(coalesce(v_device_id, '')), ''),
          p_segment,
          'Premio ruleta',
          v_year_month,
          'pendiente',
          p_participant_id,
          p_session_id
        )
        on conflict do nothing
        returning id into v_winner_id;

        if v_winner_id is null then
          v_award_reason := 'unique_conflict';
        else
          v_awarded := true;
          v_award_reason := 'awarded';
          v_locked_until := v_now + interval '30 days';
        end if;
      end if;
    end if;
  end if;

  update public.reto_game_sessions s
  set state = v_next_state,
      state_version = s.state_version + 1,
      status = 'completed',
      updated_at = v_now,
      finished_at = v_now
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = pg_catalog.btrim(p_group_code)
    and s.status = 'active'
    and s.state_version = p_expected_state_version;

  if not found then
    raise exception 'RETO_FINALIZE_STATE_CONFLICT';
  end if;

  -- Snapshot autoritativo dentro de la misma transaccion.
  select s.status, s.state, s.finished_at
  into v_return_status, v_return_state, v_return_finished_at
  from public.reto_game_sessions s
  where s.id = p_session_id
    and s.participant_id = p_participant_id
    and s.group_code = pg_catalog.btrim(p_group_code)
    and s.game_code = 'principal'
    and s.game_mode = 'con_premio'
    and s.state_version = p_expected_state_version + 1
    and s.status = 'completed';

  if not found
     or v_return_status <> 'completed'
     or v_return_state is null
     or v_return_finished_at is null then
    raise exception 'RETO_FINALIZE_RESULT_STATE_INVALID';
  end if;

  return query
  select
    p_session_id,
    p_expected_state_version + 1,
    p_segment,
    v_is_prize,
    v_awarded,
    v_award_reason,
    v_winner_id,
    v_locked_until,
    v_return_status,
    v_return_state,
    v_return_finished_at;
end
$function$;

alter function public.finalize_reto_principal_spin_atomic(
  uuid, uuid, text, integer, smallint
) owner to postgres;

revoke all on function public.finalize_reto_principal_spin_atomic(
  uuid, uuid, text, integer, smallint
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.finalize_reto_principal_spin_atomic(
  uuid, uuid, text, integer, smallint
) to service_role;

-- ============================================================
-- POSTFLIGHT
-- ============================================================

do $postflight$
declare
  v_proc regprocedure;
  v_owner text;
  v_security_definer boolean;
  v_search_path text;
  v_result text;
begin
  v_proc :=
    pg_catalog.to_regprocedure(
      'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)'
    );

  if v_proc is null then
    raise exception 'B2C_E5F7B_POSTFLIGHT: RPC no existe';
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
    raise exception 'B2C_E5F7B_POSTFLIGHT: owner inesperado %', v_owner;
  end if;

  if not v_security_definer then
    raise exception 'B2C_E5F7B_POSTFLIGHT: SECURITY DEFINER ausente';
  end if;

  if coalesce(v_search_path, '') <> 'search_path=pg_catalog' then
    raise exception 'B2C_E5F7B_POSTFLIGHT: search_path inesperado %', v_search_path;
  end if;

  if v_result not ilike '%session_status text%'
     or v_result not ilike '%session_state jsonb%'
     or v_result not ilike '%finished_at timestamp with time zone%' then
    raise exception 'B2C_E5F7B_POSTFLIGHT: retorno extendido ausente %', v_result;
  end if;

  if pg_catalog.has_function_privilege('anon', v_proc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_proc, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_proc, 'EXECUTE') then
    raise exception 'B2C_E5F7B_POSTFLIGHT: ACL de ejecucion inesperada';
  end if;
end
$postflight$;

commit;

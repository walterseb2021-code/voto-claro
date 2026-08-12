-- B-SEC-14BK2
-- Fundacion server-side para apoyos y foro de Proyecto Ciudadano.
--
-- Esta migracion es deliberadamente NO destructiva:
-- 1. No borra datos.
-- 2. No revoca aun permisos de tablas heredadas.
-- 3. No activa aun RLS en project_supports/project_forum_posts.
-- 4. Crea RPC SECURITY DEFINER invocables solo por service_role.
-- 5. Conserva el trigger existente que mantiene beneficiary_count.
-- El cierre de privilegios de tablas se hara despues de migrar y probar los clientes.

begin;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'support_project_secure',
        'create_project_forum_post_secure'
      )
  ) then
    raise exception 'B_SEC_14BK2_ABORT: RPC destino ya existe';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.project_supports'::regclass
      and c.contype = 'u'
      and pg_get_constraintdef(c.oid, true) = 'UNIQUE (participant_id, cycle_id)'
  ) then
    raise exception 'B_SEC_14BK2_ABORT: falta UNIQUE participant_id,cycle_id en project_supports';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and t.tgrelid = 'public.project_supports'::regclass
      and t.tgname = 'trg_project_supports_count'
      and p.proname = 'update_project_beneficiary_count'
  ) then
    raise exception 'B_SEC_14BK2_ABORT: falta trigger esperado de conteo de apoyos';
  end if;
end
$$;


create function public.support_project_secure(
  p_project_id uuid,
  p_participant_id uuid
)
returns table (
  result_project_id uuid,
  result_beneficiary_count integer,
  result_minimum_supports_required integer,
  result_eligible_for_final_review boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_project public.projects%rowtype;
  v_existing public.project_supports%rowtype;
  v_now timestamp without time zone := clock_timestamp()::timestamp without time zone;
  v_beneficiary_count integer;
  v_minimum_supports_required integer;
  v_eligible boolean;
  v_participant_id uuid;
begin
  if p_project_id is null or p_participant_id is null then
    raise exception using errcode = 'P0001', message = 'support_invalid';
  end if;

  select pp.id
  into v_participant_id
  from public.project_participants pp
  where pp.id = p_participant_id
    and coalesce(pp.disqualified, false) = false
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'participant_not_available';
  end if;

  select p.*
  into v_project
  from public.projects p
  where p.id = p_project_id
    and p.status = 'active'
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'project_not_available';
  end if;

  if v_project.cycle_id is null
     or v_project.minimum_supports_required is null
     or v_project.minimum_supports_required < 1 then
    raise exception using errcode = 'P0001', message = 'project_configuration_invalid';
  end if;

  perform 1
  from public.project_cycles c
  where c.id = v_project.cycle_id
    and c.is_active = true
    and c.starts_at <= v_now
    and c.ends_at > v_now
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'support_closed';
  end if;

  select ps.*
  into v_existing
  from public.project_supports ps
  where ps.participant_id = p_participant_id
    and ps.cycle_id = v_project.cycle_id
  limit 1
  for update;

  if found then
    if v_existing.project_id = v_project.id then
      raise exception using errcode = 'P0001', message = 'support_already_exists';
    end if;

    raise exception using errcode = 'P0001', message = 'participant_has_cycle_support';
  end if;

  begin
    insert into public.project_supports (
      project_id,
      participant_id,
      cycle_id,
      approved_by
    )
    values (
      v_project.id,
      p_participant_id,
      v_project.cycle_id,
      v_project.leader_id
    );
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'participant_has_cycle_support';
  end;

  -- El trigger trg_project_supports_count ya actualizo beneficiary_count
  -- antes de que esta sentencia se ejecute.
  update public.projects p
  set eligible_for_final_review =
    coalesce(p.beneficiary_count, 0) >= p.minimum_supports_required
  where p.id = v_project.id
  returning
    p.beneficiary_count,
    p.minimum_supports_required,
    p.eligible_for_final_review
  into
    v_beneficiary_count,
    v_minimum_supports_required,
    v_eligible;

  return query
  select
    v_project.id,
    coalesce(v_beneficiary_count, 0),
    v_minimum_supports_required,
    coalesce(v_eligible, false);
end;
$function$;

revoke all
  on function public.support_project_secure(uuid, uuid)
  from PUBLIC, anon, authenticated, service_role;

grant execute
  on function public.support_project_secure(uuid, uuid)
  to service_role;


create function public.create_project_forum_post_secure(
  p_project_id uuid,
  p_participant_id uuid,
  p_content text
)
returns table (
  result_post_id uuid,
  result_content text,
  result_created_at timestamp without time zone
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_content text := btrim(coalesce(p_content, ''));
  v_lower text;
  v_word text;
  v_post_id uuid;
  v_created_at timestamp without time zone;
  v_now timestamp without time zone := clock_timestamp()::timestamp without time zone;
  v_daily_count integer;
  v_last_post_at timestamp without time zone;
  v_participant_id uuid;
begin
  if p_project_id is null or p_participant_id is null then
    raise exception using errcode = 'P0001', message = 'forum_post_invalid';
  end if;

  if char_length(v_content) < 5 or char_length(v_content) > 800 then
    raise exception using errcode = 'P0001', message = 'forum_post_invalid';
  end if;

  if v_content ~* '(https?://|www\.)' then
    raise exception using errcode = 'P0001', message = 'forum_links_not_allowed';
  end if;

  v_lower := lower(v_content);

  foreach v_word in array array[
    'mierda',
    'carajo',
    'puta',
    'puto',
    'imbecil',
    'idiota',
    'cojudo',
    'cojuda',
    'pendejo',
    'pendeja',
    'verga',
    'cabron',
    'cabrona'
  ]
  loop
    if position(v_word in v_lower) > 0 then
      raise exception using errcode = 'P0001', message = 'forum_content_not_allowed';
    end if;
  end loop;

  -- La fila del participante funciona tambien como bloqueo transaccional
  -- para serializar publicaciones concurrentes del mismo participante.
  select pp.id
  into v_participant_id
  from public.project_participants pp
  where pp.id = p_participant_id
    and coalesce(pp.disqualified, false) = false
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'participant_not_available';
  end if;

  perform 1
  from public.projects p
  where p.id = p_project_id
    and p.status = 'active';

  if not found then
    raise exception using errcode = 'P0001', message = 'project_not_available';
  end if;

  select max(f.created_at)
  into v_last_post_at
  from public.project_forum_posts f
  where f.participant_id = p_participant_id;

  if v_last_post_at is not null
     and v_last_post_at > v_now - interval '20 seconds' then
    raise exception using errcode = 'P0001', message = 'forum_flood_blocked';
  end if;

  select count(*)::integer
  into v_daily_count
  from public.project_forum_posts f
  where f.participant_id = p_participant_id
    and f.created_at >= date_trunc('day', v_now);

  if v_daily_count >= 20 then
    raise exception using errcode = 'P0001', message = 'forum_daily_limit_reached';
  end if;

  insert into public.project_forum_posts (
    project_id,
    participant_id,
    content
  )
  values (
    p_project_id,
    p_participant_id,
    v_content
  )
  returning id, created_at
  into v_post_id, v_created_at;

  return query
  select v_post_id, v_content, v_created_at;
end;
$function$;

revoke all
  on function public.create_project_forum_post_secure(uuid, uuid, text)
  from PUBLIC, anon, authenticated, service_role;

grant execute
  on function public.create_project_forum_post_secure(uuid, uuid, text)
  to service_role;

commit;
-- FASE 3.64-B1
-- Conecta event_id en RPC administrativas de Solo para Ganadores.
-- Esta migracion no modifica TypeScript, assets, cleanup, Storage ni datos existentes.

begin;

create or replace function public.create_solo_ganadores_post(
  p_data jsonb,
  p_photo_asset_id uuid default null,
  p_video_asset_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_data public.solo_ganadores_posts%rowtype;
  v_photo public.solo_ganadores_assets%rowtype;
  v_video public.solo_ganadores_assets%rowtype;
  v_event_id uuid;
  v_event_id_text text;
  v_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_row_count integer;
begin
  if p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if not (p_data ? 'event_id') or p_data->'event_id' = 'null'::jsonb then
    raise exception using
      errcode = 'P0001',
      message = 'EVENT_REQUIRED';
  end if;

  if pg_catalog.jsonb_typeof(p_data->'event_id') <> 'string' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  v_event_id_text := pg_catalog.btrim(p_data->>'event_id');
  if v_event_id_text = '' then
    raise exception using
      errcode = 'P0001',
      message = 'EVENT_REQUIRED';
  end if;

  if v_event_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  v_event_id := v_event_id_text::uuid;

  if not exists (
    select 1
    from public.solo_ganadores_events
    where id = v_event_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'EVENT_NOT_FOUND';
  end if;

  if (
    p_photo_asset_id is not null
    and p_video_asset_id is not null
    and p_photo_asset_id = p_video_asset_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_DUPLICATE';
  end if;

  begin
    v_data := pg_catalog.jsonb_populate_record(
      null::public.solo_ganadores_posts,
      p_data
    );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_PAYLOAD';
  end;

  if v_data.title is null or pg_catalog.btrim(v_data.title) = '' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if (
    v_data.source_module is null
    or v_data.source_module not in (
      'manual',
      'reto_ciudadano',
      'comentarios_ciudadanos',
      'proyecto_ciudadano',
      'espacio_emprendedor',
      'intencion_de_voto'
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if p_photo_asset_id is not null then
    v_photo := public._solo_ganadores_require_pending_asset(
      p_photo_asset_id,
      'post_photo',
      'image'
    );
  end if;

  if p_video_asset_id is not null then
    v_video := public._solo_ganadores_require_pending_asset(
      p_video_asset_id,
      'post_video',
      'video'
    );
  end if;

  begin
    insert into public.solo_ganadores_posts (
      event_id,
      source_module,
      source_winner_id,
      winner_name,
      winner_alias,
      title,
      prize_name,
      description,
      photo_url,
      video_url,
      interview_url,
      event_date,
      published,
      featured,
      updated_at
    )
    values (
      v_event_id,
      v_data.source_module,
      v_data.source_winner_id,
      v_data.winner_name,
      v_data.winner_alias,
      v_data.title,
      v_data.prize_name,
      v_data.description,
      case
        when p_photo_asset_id is null then v_data.photo_url
        else v_photo.public_url
      end,
      case
        when p_video_asset_id is null then v_data.video_url
        else v_video.public_url
      end,
      v_data.interview_url,
      v_data.event_date,
      v_data.published,
      v_data.featured,
      v_now
    )
    returning id into v_id;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'CREATE_FAILED';
  end;

  if p_photo_asset_id is not null then
    update public.solo_ganadores_assets
    set
      status = 'confirmed',
      resource_type = 'post',
      resource_id = v_id,
      resource_field = 'photo_url',
      confirmed_at = v_now,
      expires_at = null,
      last_error = null
    where id = p_photo_asset_id
      and status = 'pending'
      and resource_type is null
      and resource_id is null
      and resource_field is null;

    get diagnostics v_row_count = row_count;
    if v_row_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'ASSET_CONFIRM_FAILED';
    end if;
  end if;

  if p_video_asset_id is not null then
    update public.solo_ganadores_assets
    set
      status = 'confirmed',
      resource_type = 'post',
      resource_id = v_id,
      resource_field = 'video_url',
      confirmed_at = v_now,
      expires_at = null,
      last_error = null
    where id = p_video_asset_id
      and status = 'pending'
      and resource_type is null
      and resource_id is null
      and resource_field is null;

    get diagnostics v_row_count = row_count;
    if v_row_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'ASSET_CONFIRM_FAILED';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.create_solo_ganadores_media(
  p_data jsonb,
  p_media_asset_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_data public.solo_ganadores_media%rowtype;
  v_media public.solo_ganadores_assets%rowtype;
  v_expected_purpose text;
  v_expected_kind text;
  v_event_id uuid;
  v_event_id_text text;
  v_winner_event_id uuid;
  v_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_row_count integer;
begin
  if p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if not (p_data ? 'event_id') or p_data->'event_id' = 'null'::jsonb then
    raise exception using
      errcode = 'P0001',
      message = 'EVENT_REQUIRED';
  end if;

  if pg_catalog.jsonb_typeof(p_data->'event_id') <> 'string' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  v_event_id_text := pg_catalog.btrim(p_data->>'event_id');
  if v_event_id_text = '' then
    raise exception using
      errcode = 'P0001',
      message = 'EVENT_REQUIRED';
  end if;

  if v_event_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  v_event_id := v_event_id_text::uuid;

  if not exists (
    select 1
    from public.solo_ganadores_events
    where id = v_event_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'EVENT_NOT_FOUND';
  end if;

  begin
    v_data := pg_catalog.jsonb_populate_record(
      null::public.solo_ganadores_media,
      p_data
    );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_PAYLOAD';
  end;

  if v_data.related_winner_id is not null then
    select event_id
      into v_winner_event_id
    from public.solo_ganadores_posts
    where id = v_data.related_winner_id
    for share;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'WINNER_NOT_FOUND';
    end if;

    if v_winner_event_id is null or v_winner_event_id <> v_event_id then
      raise exception using
        errcode = 'P0001',
        message = 'WINNER_EVENT_MISMATCH';
    end if;
  end if;

  if v_data.title is null or pg_catalog.btrim(v_data.title) = '' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if (
    v_data.media_type is null
    or v_data.media_type not in (
      'foto',
      'video',
      'entrevista',
      'ambiente',
      'entrega',
      'reconocimiento'
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if p_media_asset_id is null then
    if v_data.media_url is null or pg_catalog.btrim(v_data.media_url) = '' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_PAYLOAD';
    end if;
  else
    if v_data.media_type = 'video' then
      v_expected_purpose := 'media_video';
      v_expected_kind := 'video';
    elsif v_data.media_type in ('foto', 'ambiente', 'entrega', 'reconocimiento') then
      v_expected_purpose := 'media_image';
      v_expected_kind := 'image';
    else
      raise exception using
        errcode = 'P0001',
        message = 'ASSET_PURPOSE_MISMATCH';
    end if;

    v_media := public._solo_ganadores_require_pending_asset(
      p_media_asset_id,
      v_expected_purpose,
      v_expected_kind
    );
  end if;

  begin
    insert into public.solo_ganadores_media (
      event_id,
      title,
      media_type,
      media_url,
      description,
      related_winner_id,
      published,
      featured,
      updated_at
    )
    values (
      v_event_id,
      v_data.title,
      v_data.media_type,
      case
        when p_media_asset_id is null then v_data.media_url
        else v_media.public_url
      end,
      v_data.description,
      v_data.related_winner_id,
      v_data.published,
      v_data.featured,
      v_now
    )
    returning id into v_id;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'CREATE_FAILED';
  end;

  if p_media_asset_id is not null then
    update public.solo_ganadores_assets
    set
      status = 'confirmed',
      resource_type = 'media',
      resource_id = v_id,
      resource_field = 'media_url',
      confirmed_at = v_now,
      expires_at = null,
      last_error = null
    where id = p_media_asset_id
      and status = 'pending'
      and resource_type is null
      and resource_id is null
      and resource_field is null;

    get diagnostics v_row_count = row_count;
    if v_row_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'ASSET_CONFIRM_FAILED';
    end if;
  end if;

  return v_id;
end;
$$;

create or replace function public.update_solo_ganadores_post(
  p_id uuid,
  p_data jsonb,
  p_expected_updated_at timestamptz,
  p_photo_action text,
  p_photo_current_asset_id uuid,
  p_photo_new_asset_id uuid,
  p_video_action text,
  p_video_current_asset_id uuid,
  p_video_new_asset_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current public.solo_ganadores_posts%rowtype;
  v_data public.solo_ganadores_posts%rowtype;
  v_photo_current_id uuid;
  v_video_current_id uuid;
  v_photo_current public.solo_ganadores_assets%rowtype;
  v_video_current public.solo_ganadores_assets%rowtype;
  v_photo_new public.solo_ganadores_assets%rowtype;
  v_video_new public.solo_ganadores_assets%rowtype;
  v_photo_action text;
  v_video_action text;
  v_photo_url text;
  v_video_url text;
  v_source_module text;
  v_source_winner_id text;
  v_winner_name text;
  v_winner_alias text;
  v_title text;
  v_prize_name text;
  v_description text;
  v_interview_url text;
  v_event_id_text text;
  v_final_event_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  if p_expected_updated_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if p_data ? 'event_id' then
    if p_data->'event_id' = 'null'::jsonb then
      raise exception using
        errcode = 'P0001',
        message = 'EVENT_REQUIRED';
    end if;

    if pg_catalog.jsonb_typeof(p_data->'event_id') <> 'string' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_PAYLOAD';
    end if;

    v_event_id_text := pg_catalog.btrim(p_data->>'event_id');
    if v_event_id_text = '' then
      raise exception using
        errcode = 'P0001',
        message = 'EVENT_REQUIRED';
    end if;

    if v_event_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_PAYLOAD';
    end if;
  end if;

  if not public._solo_ganadores_jsonb_has_exact_keys(
    p_data,
    case
      when p_data ? 'event_id' then
        array[
          'event_id',
          'source_module',
          'source_winner_id',
          'winner_name',
          'winner_alias',
          'title',
          'prize_name',
          'description',
          'photo_url',
          'video_url',
          'interview_url',
          'event_date',
          'published',
          'featured'
        ]
      else
        array[
          'source_module',
          'source_winner_id',
          'winner_name',
          'winner_alias',
          'title',
          'prize_name',
          'description',
          'photo_url',
          'video_url',
          'interview_url',
          'event_date',
          'published',
          'featured'
        ]
    end
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if (
    not public._solo_ganadores_jsonb_string(p_data, 'source_module')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'source_winner_id')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'winner_name')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'winner_alias')
    or not public._solo_ganadores_jsonb_string(p_data, 'title')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'prize_name')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'description')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'photo_url')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'video_url')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'interview_url')
    or not public._solo_ganadores_jsonb_optional_date(p_data, 'event_date')
    or not public._solo_ganadores_jsonb_boolean(p_data, 'published')
    or not public._solo_ganadores_jsonb_boolean(p_data, 'featured')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  begin
    v_data := pg_catalog.jsonb_populate_record(
      null::public.solo_ganadores_posts,
      p_data
    );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end;

  v_source_module := public._solo_ganadores_require_text(v_data.source_module, 100);
  v_source_winner_id := public._solo_ganadores_clean_optional_text(v_data.source_winner_id, 300);
  v_winner_name := public._solo_ganadores_clean_optional_text(v_data.winner_name, 200);
  v_winner_alias := public._solo_ganadores_clean_optional_text(v_data.winner_alias, 200);
  v_title := public._solo_ganadores_require_text(v_data.title, 300);
  v_prize_name := public._solo_ganadores_clean_optional_text(v_data.prize_name, 300);
  v_description := public._solo_ganadores_clean_optional_text(v_data.description, 10000);
  v_interview_url := public._solo_ganadores_clean_optional_url(v_data.interview_url);

  if (
    v_source_module not in (
      'manual',
      'reto_ciudadano',
      'comentarios_ciudadanos',
      'proyecto_ciudadano',
      'espacio_emprendedor',
      'intencion_de_voto'
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if v_data.published is null or v_data.featured is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  v_photo_action := public._solo_ganadores_validate_action(
    p_photo_action,
    p_photo_current_asset_id,
    p_photo_new_asset_id,
    true
  );
  v_video_action := public._solo_ganadores_validate_action(
    p_video_action,
    p_video_current_asset_id,
    p_video_new_asset_id,
    true
  );

  if (
    p_photo_new_asset_id is not null
    and p_video_new_asset_id is not null
    and p_photo_new_asset_id = p_video_new_asset_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_DUPLICATE';
  end if;

  select *
    into v_current
  from public.solo_ganadores_posts
  where id = p_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'RESOURCE_NOT_FOUND';
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_RESOURCE';
  end if;

  if p_data ? 'event_id' then
    v_final_event_id := v_event_id_text::uuid;

    if not exists (
      select 1
      from public.solo_ganadores_events
      where id = v_final_event_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'EVENT_NOT_FOUND';
    end if;
  else
    v_final_event_id := v_current.event_id;
  end if;

  if v_final_event_id is distinct from v_current.event_id then
    if exists (
      select 1
      from public.solo_ganadores_media
      where related_winner_id = p_id
        and event_id is not null
        and event_id <> v_final_event_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'WINNER_EVENT_MISMATCH';
    end if;
  end if;

  select id
    into v_photo_current_id
  from public.solo_ganadores_assets
  where resource_type = 'post'
    and resource_id = p_id
    and resource_field = 'photo_url'
    and status = 'confirmed';

  select id
    into v_video_current_id
  from public.solo_ganadores_assets
  where resource_type = 'post'
    and resource_id = p_id
    and resource_field = 'video_url'
    and status = 'confirmed';

  perform public._solo_ganadores_lock_assets(
    pg_catalog.array_remove(
      array[
        v_photo_current_id,
        v_video_current_id,
        p_photo_new_asset_id,
        p_video_new_asset_id
      ],
      null
    )
  );

  v_photo_current := public._solo_ganadores_require_current_asset(
    v_photo_current_id,
    p_photo_current_asset_id,
    'post',
    p_id,
    'photo_url',
    'post_photo',
    'image',
    v_current.photo_url
  );
  v_video_current := public._solo_ganadores_require_current_asset(
    v_video_current_id,
    p_video_current_asset_id,
    'post',
    p_id,
    'video_url',
    'post_video',
    'video',
    v_current.video_url
  );

  if v_photo_action = 'replace' then
    v_photo_new := public._solo_ganadores_require_pending_asset_for_update(
      p_photo_new_asset_id,
      'post_photo',
      'image'
    );
    v_photo_url := v_photo_new.public_url;
  elsif v_photo_action = 'manual' then
    v_photo_url := public._solo_ganadores_require_url(v_data.photo_url);
    if v_photo_current.id is not null and v_photo_url = v_current.photo_url then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_ACTION';
    end if;
  elsif v_photo_action = 'clear' then
    v_photo_url := null;
  else
    v_photo_url := v_current.photo_url;
  end if;

  if v_video_action = 'replace' then
    v_video_new := public._solo_ganadores_require_pending_asset_for_update(
      p_video_new_asset_id,
      'post_video',
      'video'
    );
    v_video_url := v_video_new.public_url;
  elsif v_video_action = 'manual' then
    v_video_url := public._solo_ganadores_require_url(v_data.video_url);
    if v_video_current.id is not null and v_video_url = v_current.video_url then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_ACTION';
    end if;
  elsif v_video_action = 'clear' then
    v_video_url := null;
  else
    v_video_url := v_current.video_url;
  end if;

  if v_photo_action in ('replace', 'manual', 'clear') and v_photo_current.id is not null then
    perform public._solo_ganadores_release_asset(v_photo_current.id, v_now);
  end if;

  if v_video_action in ('replace', 'manual', 'clear') and v_video_current.id is not null then
    perform public._solo_ganadores_release_asset(v_video_current.id, v_now);
  end if;

  if v_photo_action = 'replace' then
    perform public._solo_ganadores_confirm_asset(
      p_photo_new_asset_id,
      'post',
      p_id,
      'photo_url',
      v_now
    );
  end if;

  if v_video_action = 'replace' then
    perform public._solo_ganadores_confirm_asset(
      p_video_new_asset_id,
      'post',
      p_id,
      'video_url',
      v_now
    );
  end if;

  begin
    update public.solo_ganadores_posts
    set
      event_id = v_final_event_id,
      source_module = v_source_module,
      source_winner_id = v_source_winner_id,
      winner_name = v_winner_name,
      winner_alias = v_winner_alias,
      title = v_title,
      prize_name = v_prize_name,
      description = v_description,
      photo_url = v_photo_url,
      video_url = v_video_url,
      interview_url = v_interview_url,
      event_date = v_data.event_date,
      published = v_data.published,
      featured = v_data.featured,
      updated_at = v_now
    where id = p_id;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'UPDATE_FAILED';
  end;

  return p_id;
end;
$$;

create or replace function public.update_solo_ganadores_media(
  p_id uuid,
  p_data jsonb,
  p_expected_updated_at timestamptz,
  p_media_action text,
  p_media_current_asset_id uuid,
  p_media_new_asset_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current public.solo_ganadores_media%rowtype;
  v_data public.solo_ganadores_media%rowtype;
  v_current_expected text[];
  v_new_expected text[];
  v_media_current_id uuid;
  v_media_current public.solo_ganadores_assets%rowtype;
  v_media_new public.solo_ganadores_assets%rowtype;
  v_media_action text;
  v_media_url text;
  v_title text;
  v_media_type text;
  v_description text;
  v_event_id_text text;
  v_final_event_id uuid;
  v_winner_event_id uuid;
  v_now timestamptz := pg_catalog.now();
begin
  if p_expected_updated_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if p_data ? 'event_id' then
    if p_data->'event_id' = 'null'::jsonb then
      raise exception using
        errcode = 'P0001',
        message = 'EVENT_REQUIRED';
    end if;

    if pg_catalog.jsonb_typeof(p_data->'event_id') <> 'string' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_PAYLOAD';
    end if;

    v_event_id_text := pg_catalog.btrim(p_data->>'event_id');
    if v_event_id_text = '' then
      raise exception using
        errcode = 'P0001',
        message = 'EVENT_REQUIRED';
    end if;

    if v_event_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_PAYLOAD';
    end if;
  end if;

  if not public._solo_ganadores_jsonb_has_exact_keys(
    p_data,
    case
      when p_data ? 'event_id' then
        array[
          'event_id',
          'title',
          'media_type',
          'media_url',
          'description',
          'related_winner_id',
          'published',
          'featured'
        ]
      else
        array[
          'title',
          'media_type',
          'media_url',
          'description',
          'related_winner_id',
          'published',
          'featured'
        ]
    end
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if (
    not public._solo_ganadores_jsonb_string(p_data, 'title')
    or not public._solo_ganadores_jsonb_string(p_data, 'media_type')
    or not public._solo_ganadores_jsonb_string(p_data, 'media_url')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'description')
    or not public._solo_ganadores_jsonb_optional_uuid(p_data, 'related_winner_id')
    or not public._solo_ganadores_jsonb_boolean(p_data, 'published')
    or not public._solo_ganadores_jsonb_boolean(p_data, 'featured')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  begin
    v_data := pg_catalog.jsonb_populate_record(
      null::public.solo_ganadores_media,
      p_data
    );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end;

  v_title := public._solo_ganadores_require_text(v_data.title, 300);
  v_media_type := public._solo_ganadores_require_text(v_data.media_type, 100);
  v_description := public._solo_ganadores_clean_optional_text(v_data.description, 10000);

  if (
    v_media_type not in (
      'foto',
      'video',
      'entrevista',
      'ambiente',
      'entrega',
      'reconocimiento'
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if v_data.published is null or v_data.featured is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  v_media_action := public._solo_ganadores_validate_action(
    p_media_action,
    p_media_current_asset_id,
    p_media_new_asset_id,
    false
  );

  if v_data.related_winner_id is not null then
    select event_id
      into v_winner_event_id
    from public.solo_ganadores_posts
    where id = v_data.related_winner_id
    for share;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'WINNER_NOT_FOUND';
    end if;
  end if;

  select *
    into v_current
  from public.solo_ganadores_media
  where id = p_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'RESOURCE_NOT_FOUND';
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_RESOURCE';
  end if;

  if p_data ? 'event_id' then
    v_final_event_id := v_event_id_text::uuid;

    if not exists (
      select 1
      from public.solo_ganadores_events
      where id = v_final_event_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'EVENT_NOT_FOUND';
    end if;
  else
    v_final_event_id := v_current.event_id;
  end if;

  if v_final_event_id is null then
    if p_data ? 'event_id' or v_data.related_winner_id is distinct from v_current.related_winner_id then
      raise exception using
        errcode = 'P0001',
        message = 'EVENT_REQUIRED';
    end if;
  elsif v_data.related_winner_id is not null then
    if v_winner_event_id is null or v_winner_event_id <> v_final_event_id then
      raise exception using
        errcode = 'P0001',
        message = 'WINNER_EVENT_MISMATCH';
    end if;
  end if;

  v_current_expected := public._solo_ganadores_media_expected_asset(v_current.media_type);
  v_new_expected := public._solo_ganadores_media_expected_asset(v_media_type);

  if v_media_action = 'replace' and v_new_expected is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_ASSET_ACTION';
  end if;

  select id
    into v_media_current_id
  from public.solo_ganadores_assets
  where resource_type = 'media'
    and resource_id = p_id
    and resource_field = 'media_url'
    and status = 'confirmed';

  perform public._solo_ganadores_lock_assets(
    pg_catalog.array_remove(
      array[
        v_media_current_id,
        p_media_new_asset_id
      ],
      null
    )
  );

  if v_media_current_id is not null then
    if v_current_expected is null then
      raise exception using
        errcode = 'P0001',
        message = 'ASSET_PURPOSE_MISMATCH';
    end if;

    v_media_current := public._solo_ganadores_require_current_asset(
      v_media_current_id,
      p_media_current_asset_id,
      'media',
      p_id,
      'media_url',
      v_current_expected[1],
      v_current_expected[2],
      v_current.media_url
    );
  else
    v_media_current := public._solo_ganadores_require_current_asset(
      null,
      p_media_current_asset_id,
      'media',
      p_id,
      'media_url',
      coalesce(v_new_expected[1], 'media_image'),
      coalesce(v_new_expected[2], 'image'),
      v_current.media_url
    );
  end if;

  if (
    v_media_action = 'keep'
    and v_media_current.id is not null
    and (
      v_new_expected is null
      or v_current_expected is null
      or v_new_expected[1] <> v_current_expected[1]
      or v_new_expected[2] <> v_current_expected[2]
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_ASSET_ACTION';
  end if;

  if v_media_action = 'replace' then
    v_media_new := public._solo_ganadores_require_pending_asset_for_update(
      p_media_new_asset_id,
      v_new_expected[1],
      v_new_expected[2]
    );
    v_media_url := v_media_new.public_url;
  elsif v_media_action = 'manual' then
    v_media_url := public._solo_ganadores_require_url(v_data.media_url);
    if v_media_current.id is not null and v_media_url = v_current.media_url then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_ACTION';
    end if;
  else
    v_media_url := v_current.media_url;
  end if;

  if v_media_action in ('replace', 'manual') and v_media_current.id is not null then
    perform public._solo_ganadores_release_asset(v_media_current.id, v_now);
  end if;

  if v_media_action = 'replace' then
    perform public._solo_ganadores_confirm_asset(
      p_media_new_asset_id,
      'media',
      p_id,
      'media_url',
      v_now
    );
  end if;

  begin
    update public.solo_ganadores_media
    set
      event_id = v_final_event_id,
      title = v_title,
      media_type = v_media_type,
      media_url = v_media_url,
      description = v_description,
      related_winner_id = v_data.related_winner_id,
      published = v_data.published,
      featured = v_data.featured,
      updated_at = v_now
    where id = p_id;
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'UPDATE_FAILED';
  end;

  return p_id;
end;
$$;

create or replace function public.delete_solo_ganadores_event(
  p_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current public.solo_ganadores_events%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_asset_ids uuid[];
  v_asset_id uuid;
  v_row_count integer;
begin
  if p_id is null or p_expected_updated_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  select *
    into v_current
  from public.solo_ganadores_events
  where id = p_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'RESOURCE_NOT_FOUND';
  end if;

  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_RESOURCE';
  end if;

  if exists (
    select 1
    from public.solo_ganadores_posts
    where event_id = p_id
  ) or exists (
    select 1
    from public.solo_ganadores_media
    where event_id = p_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'EVENT_HAS_CHILDREN';
  end if;

  if exists (
    select 1
    from public.solo_ganadores_assets
    where resource_type = 'event'
      and resource_id = p_id
      and status = 'pending'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'OWNERSHIP_INCONSISTENT';
  end if;

  if exists (
    select 1
    from public.solo_ganadores_assets
    where resource_type = 'event'
      and resource_id = p_id
      and status = 'confirmed'
      and resource_field not in ('main_image_url', 'promo_video_url')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'OWNERSHIP_INCONSISTENT';
  end if;

  if exists (
    select 1
    from public.solo_ganadores_assets
    where resource_type = 'event'
      and resource_id = p_id
      and status = 'confirmed'
    group by resource_field
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'OWNERSHIP_INCONSISTENT';
  end if;

  select pg_catalog.array_agg(asset.id order by asset.id)
    into v_asset_ids
  from public.solo_ganadores_assets as asset
  where asset.resource_type = 'event'
    and asset.resource_id = p_id
    and asset.status = 'confirmed';

  perform public._solo_ganadores_lock_assets(v_asset_ids);

  if exists (
    select 1
    from public.solo_ganadores_assets as asset
    where asset.resource_type = 'event'
      and asset.resource_id = p_id
      and asset.status = 'confirmed'
      and (
        asset.resource_field is null
        or asset.resource_field not in ('main_image_url', 'promo_video_url')
        or asset.resource_type is null
        or asset.resource_id is null
        or (
          asset.resource_field = 'main_image_url'
          and (
            asset.purpose <> 'event_main_image'
            or asset.media_kind <> 'image'
            or asset.public_url is distinct from v_current.main_image_url
          )
        )
        or (
          asset.resource_field = 'promo_video_url'
          and (
            asset.purpose <> 'event_promo_video'
            or asset.media_kind <> 'video'
            or asset.public_url is distinct from v_current.promo_video_url
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'OWNERSHIP_INCONSISTENT';
  end if;

  begin
    if v_asset_ids is not null then
      for v_asset_id in
        select asset_id
        from pg_catalog.unnest(v_asset_ids) as locked_assets(asset_id)
        order by asset_id
      loop
        perform public._solo_ganadores_release_asset(v_asset_id, v_now);
      end loop;
    end if;

    delete from public.solo_ganadores_events
    where id = p_id;

    get diagnostics v_row_count = row_count;
    if v_row_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'DELETE_FAILED';
    end if;
  exception
    when foreign_key_violation then
      raise exception using
        errcode = 'P0001',
        message = 'EVENT_HAS_CHILDREN';
  end;

  return p_id;
end;
$$;

revoke all on function public.create_solo_ganadores_post(jsonb, uuid, uuid)
from public;
revoke all on function public.create_solo_ganadores_post(jsonb, uuid, uuid)
from anon;
revoke all on function public.create_solo_ganadores_post(jsonb, uuid, uuid)
from authenticated;
grant execute on function public.create_solo_ganadores_post(jsonb, uuid, uuid)
to service_role;

revoke all on function public.create_solo_ganadores_media(jsonb, uuid)
from public;
revoke all on function public.create_solo_ganadores_media(jsonb, uuid)
from anon;
revoke all on function public.create_solo_ganadores_media(jsonb, uuid)
from authenticated;
grant execute on function public.create_solo_ganadores_media(jsonb, uuid)
to service_role;

revoke all on function public.update_solo_ganadores_post(
  uuid,
  jsonb,
  timestamptz,
  text,
  uuid,
  uuid,
  text,
  uuid,
  uuid
)
from public;
revoke all on function public.update_solo_ganadores_post(
  uuid,
  jsonb,
  timestamptz,
  text,
  uuid,
  uuid,
  text,
  uuid,
  uuid
)
from anon;
revoke all on function public.update_solo_ganadores_post(
  uuid,
  jsonb,
  timestamptz,
  text,
  uuid,
  uuid,
  text,
  uuid,
  uuid
)
from authenticated;
grant execute on function public.update_solo_ganadores_post(
  uuid,
  jsonb,
  timestamptz,
  text,
  uuid,
  uuid,
  text,
  uuid,
  uuid
)
to service_role;

revoke all on function public.update_solo_ganadores_media(
  uuid,
  jsonb,
  timestamptz,
  text,
  uuid,
  uuid
)
from public;
revoke all on function public.update_solo_ganadores_media(
  uuid,
  jsonb,
  timestamptz,
  text,
  uuid,
  uuid
)
from anon;
revoke all on function public.update_solo_ganadores_media(
  uuid,
  jsonb,
  timestamptz,
  text,
  uuid,
  uuid
)
from authenticated;
grant execute on function public.update_solo_ganadores_media(
  uuid,
  jsonb,
  timestamptz,
  text,
  uuid,
  uuid
)
to service_role;

revoke all on function public.delete_solo_ganadores_event(uuid, timestamptz)
from public;
revoke all on function public.delete_solo_ganadores_event(uuid, timestamptz)
from anon;
revoke all on function public.delete_solo_ganadores_event(uuid, timestamptz)
from authenticated;
grant execute on function public.delete_solo_ganadores_event(uuid, timestamptz)
to service_role;

commit;

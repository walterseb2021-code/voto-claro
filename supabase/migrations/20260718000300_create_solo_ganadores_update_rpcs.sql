-- FASE 3.56
-- Actualizacion atomica de recursos y assets de Solo para Ganadores.
-- Esta migracion no modifica columnas, registros, RLS ni policies existentes.

begin;

create function public._solo_ganadores_jsonb_has_exact_keys(
  p_data jsonb,
  p_keys text[]
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count integer;
begin
  if p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object' then
    return false;
  end if;

  select count(*)
    into v_count
  from pg_catalog.jsonb_object_keys(p_data) as keys(key);

  if v_count <> pg_catalog.cardinality(p_keys) then
    return false;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_data) as keys(key)
    where not (keys.key = any(p_keys))
  ) then
    return false;
  end if;

  return true;
end;
$$;

create function public._solo_ganadores_clean_optional_text(
  p_value text,
  p_max_length integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clean text;
begin
  if p_value is null then
    return null;
  end if;

  v_clean := pg_catalog.btrim(p_value);

  if v_clean = '' then
    return null;
  end if;

  if pg_catalog.char_length(v_clean) > p_max_length then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  return v_clean;
end;
$$;

create function public._solo_ganadores_jsonb_string(
  p_data jsonb,
  p_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return pg_catalog.jsonb_typeof(p_data -> p_key) = 'string';
end;
$$;

create function public._solo_ganadores_jsonb_optional_string(
  p_data jsonb,
  p_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_type text;
begin
  v_type := pg_catalog.jsonb_typeof(p_data -> p_key);
  return v_type = 'string' or v_type = 'null';
end;
$$;

create function public._solo_ganadores_jsonb_boolean(
  p_data jsonb,
  p_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return pg_catalog.jsonb_typeof(p_data -> p_key) = 'boolean';
end;
$$;

create function public._solo_ganadores_jsonb_optional_date(
  p_data jsonb,
  p_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_type text;
  v_value text;
  v_date date;
begin
  v_type := pg_catalog.jsonb_typeof(p_data -> p_key);

  if v_type = 'null' then
    return true;
  end if;

  if v_type <> 'string' then
    return false;
  end if;

  v_value := p_data ->> p_key;
  if v_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return false;
  end if;

  begin
    v_date := pg_catalog.to_date(v_value, 'YYYY-MM-DD');
  exception
    when others then
      return false;
  end;

  return pg_catalog.to_char(
    v_date,
    'YYYY-MM-DD'
  ) = v_value;
end;
$$;

create function public._solo_ganadores_jsonb_optional_uuid(
  p_data jsonb,
  p_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_type text;
  v_value text;
begin
  v_type := pg_catalog.jsonb_typeof(p_data -> p_key);

  if v_type = 'null' then
    return true;
  end if;

  if v_type <> 'string' then
    return false;
  end if;

  v_value := p_data ->> p_key;
  return v_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
end;
$$;

create function public._solo_ganadores_require_text(
  p_value text,
  p_max_length integer
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clean text;
begin
  v_clean := public._solo_ganadores_clean_optional_text(p_value, p_max_length);

  if v_clean is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  return v_clean;
end;
$$;

create function public._solo_ganadores_clean_optional_url(
  p_value text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clean text;
begin
  v_clean := public._solo_ganadores_clean_optional_text(p_value, 2048);

  if v_clean is null then
    return null;
  end if;

  if v_clean !~* '^https?://\S+$' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  return v_clean;
end;
$$;

create function public._solo_ganadores_require_url(
  p_value text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_clean text;
begin
  v_clean := public._solo_ganadores_clean_optional_url(p_value);

  if v_clean is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  return v_clean;
end;
$$;

create function public._solo_ganadores_validate_action(
  p_action text,
  p_current_asset_id uuid,
  p_new_asset_id uuid,
  p_allow_clear boolean
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_action text;
begin
  v_action := p_action;

  if v_action is null or v_action not in ('keep', 'replace', 'manual', 'clear') then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_ASSET_ACTION';
  end if;

  if v_action = 'clear' and not p_allow_clear then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_ASSET_ACTION';
  end if;

  if v_action = 'replace' then
    if p_new_asset_id is null then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_ACTION';
    end if;

    if p_current_asset_id is not null and p_current_asset_id = p_new_asset_id then
      raise exception using
        errcode = 'P0001',
        message = 'ASSET_DUPLICATE';
    end if;
  elsif p_new_asset_id is not null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_ASSET_ACTION';
  end if;

  return v_action;
end;
$$;

create function public._solo_ganadores_lock_assets(
  p_asset_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_asset_ids is null or pg_catalog.cardinality(p_asset_ids) = 0 then
    return;
  end if;

  perform asset.id
  from public.solo_ganadores_assets as asset
  join (
    select distinct ids.id
    from pg_catalog.unnest(p_asset_ids) as ids(id)
    where ids.id is not null
  ) as locked_ids on locked_ids.id = asset.id
  order by asset.id
  for update of asset;
end;
$$;

create function public._solo_ganadores_require_current_asset(
  p_found_asset_id uuid,
  p_expected_asset_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_field text,
  p_expected_purpose text,
  p_expected_kind text,
  p_current_url text
)
returns public.solo_ganadores_assets
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_asset public.solo_ganadores_assets%rowtype;
begin
  if p_found_asset_id is null then
    if p_expected_asset_id is not null then
      raise exception using
        errcode = 'P0001',
        message = 'STALE_ASSET_STATE';
    end if;

    return v_asset;
  end if;

  if p_expected_asset_id is null or p_expected_asset_id <> p_found_asset_id then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_ASSET_STATE';
  end if;

  select *
    into v_asset
  from public.solo_ganadores_assets
  where id = p_found_asset_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_NOT_FOUND';
  end if;

  if v_asset.status <> 'confirmed' then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_INVALID_STATUS';
  end if;

  if (
    v_asset.resource_type <> p_resource_type
    or v_asset.resource_id <> p_resource_id
    or v_asset.resource_field <> p_resource_field
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_ALREADY_OWNED';
  end if;

  if v_asset.purpose <> p_expected_purpose then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_PURPOSE_MISMATCH';
  end if;

  if v_asset.media_kind <> p_expected_kind then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_KIND_MISMATCH';
  end if;

  if v_asset.deleting_at is not null or v_asset.deleted_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_INVALID_STATUS';
  end if;

  if v_asset.public_url is distinct from p_current_url then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_URL_MISMATCH';
  end if;

  return v_asset;
end;
$$;

create function public._solo_ganadores_require_pending_asset_for_update(
  p_asset_id uuid,
  p_expected_purpose text,
  p_expected_kind text
)
returns public.solo_ganadores_assets
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_asset public.solo_ganadores_assets%rowtype;
begin
  select *
    into v_asset
  from public.solo_ganadores_assets
  where id = p_asset_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_NOT_FOUND';
  end if;

  if v_asset.status <> 'pending' then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_INVALID_STATUS';
  end if;

  if (
    v_asset.resource_type is not null
    or v_asset.resource_id is not null
    or v_asset.resource_field is not null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_ALREADY_OWNED';
  end if;

  if v_asset.deleting_at is not null or v_asset.deleted_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_INVALID_STATUS';
  end if;

  if v_asset.expires_at is null or v_asset.expires_at <= pg_catalog.now() then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_EXPIRED';
  end if;

  if v_asset.bucket <> 'solo-ganadores' then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_INVALID_STATUS';
  end if;

  if v_asset.purpose <> p_expected_purpose then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_PURPOSE_MISMATCH';
  end if;

  if v_asset.media_kind <> p_expected_kind then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_KIND_MISMATCH';
  end if;

  if (
    v_asset.object_path is null
    or pg_catalog.btrim(v_asset.object_path) = ''
    or v_asset.object_path ~ '[[:space:]]'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_INVALID_STATUS';
  end if;

  if (
    v_asset.public_url is null
    or pg_catalog.btrim(v_asset.public_url) = ''
    or v_asset.public_url !~* '^https?://\S+$'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_INVALID_STATUS';
  end if;

  if (
    v_asset.size_bytes is not null
    and v_asset.size_bytes <= 0
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_INVALID_STATUS';
  end if;

  if (
    (p_expected_kind = 'image' and v_asset.mime_type not in ('image/jpeg', 'image/png', 'image/webp'))
    or (p_expected_kind = 'video' and v_asset.mime_type <> 'video/mp4')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_KIND_MISMATCH';
  end if;

  return v_asset;
end;
$$;

create function public._solo_ganadores_release_asset(
  p_asset_id uuid,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row_count integer;
begin
  if p_asset_id is null then
    return;
  end if;

  update public.solo_ganadores_assets
  set
    status = 'deleting',
    expires_at = null,
    deleting_at = p_now,
    deleted_at = null,
    last_error = null
  where id = p_asset_id
    and status = 'confirmed'
    and deleting_at is null
    and deleted_at is null;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_RELEASE_FAILED';
  end if;
end;
$$;

create function public._solo_ganadores_confirm_asset(
  p_asset_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_resource_field text,
  p_now timestamptz
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_row_count integer;
begin
  update public.solo_ganadores_assets
  set
    status = 'confirmed',
    resource_type = p_resource_type,
    resource_id = p_resource_id,
    resource_field = p_resource_field,
    confirmed_at = p_now,
    expires_at = null,
    deleting_at = null,
    deleted_at = null,
    last_error = null
  where id = p_asset_id
    and status = 'pending'
    and resource_type is null
    and resource_id is null
    and resource_field is null
    and deleting_at is null
    and deleted_at is null;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_CONFIRM_FAILED';
  end if;
end;
$$;

create function public._solo_ganadores_media_expected_asset(
  p_media_type text
)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_media_type = 'video' then
    return array['media_video', 'video'];
  end if;

  if p_media_type in ('foto', 'ambiente', 'entrega', 'reconocimiento') then
    return array['media_image', 'image'];
  end if;

  if p_media_type = 'entrevista' then
    return null;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'INVALID_PAYLOAD';
end;
$$;

create function public.update_solo_ganadores_event(
  p_id uuid,
  p_data jsonb,
  p_expected_updated_at timestamptz,
  p_main_image_action text,
  p_main_image_current_asset_id uuid,
  p_main_image_new_asset_id uuid,
  p_promo_video_action text,
  p_promo_video_current_asset_id uuid,
  p_promo_video_new_asset_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current public.solo_ganadores_events%rowtype;
  v_data public.solo_ganadores_events%rowtype;
  v_main_current_id uuid;
  v_promo_current_id uuid;
  v_main_current public.solo_ganadores_assets%rowtype;
  v_promo_current public.solo_ganadores_assets%rowtype;
  v_main_new public.solo_ganadores_assets%rowtype;
  v_promo_new public.solo_ganadores_assets%rowtype;
  v_main_action text;
  v_promo_action text;
  v_main_url text;
  v_promo_url text;
  v_title text;
  v_semester text;
  v_location_name text;
  v_address text;
  v_city text;
  v_description text;
  v_recognitions text;
  v_now timestamptz := pg_catalog.now();
begin
  if p_expected_updated_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if not public._solo_ganadores_jsonb_has_exact_keys(
    p_data,
    array[
      'title',
      'semester',
      'event_date',
      'location_name',
      'address',
      'city',
      'description',
      'recognitions',
      'main_image_url',
      'promo_video_url',
      'status',
      'published',
      'featured'
    ]
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if (
    not public._solo_ganadores_jsonb_string(p_data, 'title')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'semester')
    or not public._solo_ganadores_jsonb_optional_date(p_data, 'event_date')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'location_name')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'address')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'city')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'description')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'recognitions')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'main_image_url')
    or not public._solo_ganadores_jsonb_optional_string(p_data, 'promo_video_url')
    or not public._solo_ganadores_jsonb_string(p_data, 'status')
    or not public._solo_ganadores_jsonb_boolean(p_data, 'published')
    or not public._solo_ganadores_jsonb_boolean(p_data, 'featured')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  begin
    v_data := pg_catalog.jsonb_populate_record(
      null::public.solo_ganadores_events,
      p_data
    );
  exception
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_PAYLOAD';
  end;

  if v_data.status is null or v_data.status not in ('anunciado', 'activo', 'finalizado') then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if v_data.published is null or v_data.featured is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  v_title := public._solo_ganadores_require_text(v_data.title, 200);
  v_semester := public._solo_ganadores_clean_optional_text(v_data.semester, 50);
  v_location_name := public._solo_ganadores_clean_optional_text(v_data.location_name, 200);
  v_address := public._solo_ganadores_clean_optional_text(v_data.address, 300);
  v_city := public._solo_ganadores_clean_optional_text(v_data.city, 120);
  v_description := public._solo_ganadores_clean_optional_text(v_data.description, 10000);
  v_recognitions := public._solo_ganadores_clean_optional_text(v_data.recognitions, 10000);

  v_main_action := public._solo_ganadores_validate_action(
    p_main_image_action,
    p_main_image_current_asset_id,
    p_main_image_new_asset_id,
    true
  );
  v_promo_action := public._solo_ganadores_validate_action(
    p_promo_video_action,
    p_promo_video_current_asset_id,
    p_promo_video_new_asset_id,
    true
  );

  if (
    p_main_image_new_asset_id is not null
    and p_promo_video_new_asset_id is not null
    and p_main_image_new_asset_id = p_promo_video_new_asset_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_DUPLICATE';
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

  select id
    into v_main_current_id
  from public.solo_ganadores_assets
  where resource_type = 'event'
    and resource_id = p_id
    and resource_field = 'main_image_url'
    and status = 'confirmed';

  select id
    into v_promo_current_id
  from public.solo_ganadores_assets
  where resource_type = 'event'
    and resource_id = p_id
    and resource_field = 'promo_video_url'
    and status = 'confirmed';

  perform public._solo_ganadores_lock_assets(
    pg_catalog.array_remove(
      array[
        v_main_current_id,
        v_promo_current_id,
        p_main_image_new_asset_id,
        p_promo_video_new_asset_id
      ],
      null
    )
  );

  v_main_current := public._solo_ganadores_require_current_asset(
    v_main_current_id,
    p_main_image_current_asset_id,
    'event',
    p_id,
    'main_image_url',
    'event_main_image',
    'image',
    v_current.main_image_url
  );
  v_promo_current := public._solo_ganadores_require_current_asset(
    v_promo_current_id,
    p_promo_video_current_asset_id,
    'event',
    p_id,
    'promo_video_url',
    'event_promo_video',
    'video',
    v_current.promo_video_url
  );

  if v_main_action = 'replace' then
    v_main_new := public._solo_ganadores_require_pending_asset_for_update(
      p_main_image_new_asset_id,
      'event_main_image',
      'image'
    );
    v_main_url := v_main_new.public_url;
  elsif v_main_action = 'manual' then
    v_main_url := public._solo_ganadores_require_url(v_data.main_image_url);
    if v_main_current.id is not null and v_main_url = v_current.main_image_url then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_ACTION';
    end if;
  elsif v_main_action = 'clear' then
    v_main_url := null;
  else
    v_main_url := v_current.main_image_url;
  end if;

  if v_promo_action = 'replace' then
    v_promo_new := public._solo_ganadores_require_pending_asset_for_update(
      p_promo_video_new_asset_id,
      'event_promo_video',
      'video'
    );
    v_promo_url := v_promo_new.public_url;
  elsif v_promo_action = 'manual' then
    v_promo_url := public._solo_ganadores_require_url(v_data.promo_video_url);
    if v_promo_current.id is not null and v_promo_url = v_current.promo_video_url then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_ACTION';
    end if;
  elsif v_promo_action = 'clear' then
    v_promo_url := null;
  else
    v_promo_url := v_current.promo_video_url;
  end if;

  if v_main_action in ('replace', 'manual', 'clear') and v_main_current.id is not null then
    perform public._solo_ganadores_release_asset(v_main_current.id, v_now);
  end if;

  if v_promo_action in ('replace', 'manual', 'clear') and v_promo_current.id is not null then
    perform public._solo_ganadores_release_asset(v_promo_current.id, v_now);
  end if;

  if v_main_action = 'replace' then
    perform public._solo_ganadores_confirm_asset(
      p_main_image_new_asset_id,
      'event',
      p_id,
      'main_image_url',
      v_now
    );
  end if;

  if v_promo_action = 'replace' then
    perform public._solo_ganadores_confirm_asset(
      p_promo_video_new_asset_id,
      'event',
      p_id,
      'promo_video_url',
      v_now
    );
  end if;

  begin
    update public.solo_ganadores_events
    set
      title = v_title,
      semester = v_semester,
      event_date = v_data.event_date,
      location_name = v_location_name,
      address = v_address,
      city = v_city,
      description = v_description,
      recognitions = v_recognitions,
      main_image_url = v_main_url,
      promo_video_url = v_promo_url,
      status = v_data.status,
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

create function public.update_solo_ganadores_post(
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
  v_now timestamptz := pg_catalog.now();
begin
  if p_expected_updated_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if not public._solo_ganadores_jsonb_has_exact_keys(
    p_data,
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

create function public.update_solo_ganadores_media(
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
  v_now timestamptz := pg_catalog.now();
begin
  if p_expected_updated_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if not public._solo_ganadores_jsonb_has_exact_keys(
    p_data,
    array[
      'title',
      'media_type',
      'media_url',
      'description',
      'related_winner_id',
      'published',
      'featured'
    ]
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

revoke all on function public._solo_ganadores_jsonb_has_exact_keys(jsonb, text[])
from public;
revoke all on function public._solo_ganadores_jsonb_has_exact_keys(jsonb, text[])
from anon;
revoke all on function public._solo_ganadores_jsonb_has_exact_keys(jsonb, text[])
from authenticated;
revoke all on function public._solo_ganadores_jsonb_has_exact_keys(jsonb, text[])
from service_role;

revoke all on function public._solo_ganadores_jsonb_string(jsonb, text)
from public;
revoke all on function public._solo_ganadores_jsonb_string(jsonb, text)
from anon;
revoke all on function public._solo_ganadores_jsonb_string(jsonb, text)
from authenticated;
revoke all on function public._solo_ganadores_jsonb_string(jsonb, text)
from service_role;

revoke all on function public._solo_ganadores_jsonb_optional_string(jsonb, text)
from public;
revoke all on function public._solo_ganadores_jsonb_optional_string(jsonb, text)
from anon;
revoke all on function public._solo_ganadores_jsonb_optional_string(jsonb, text)
from authenticated;
revoke all on function public._solo_ganadores_jsonb_optional_string(jsonb, text)
from service_role;

revoke all on function public._solo_ganadores_jsonb_boolean(jsonb, text)
from public;
revoke all on function public._solo_ganadores_jsonb_boolean(jsonb, text)
from anon;
revoke all on function public._solo_ganadores_jsonb_boolean(jsonb, text)
from authenticated;
revoke all on function public._solo_ganadores_jsonb_boolean(jsonb, text)
from service_role;

revoke all on function public._solo_ganadores_jsonb_optional_date(jsonb, text)
from public;
revoke all on function public._solo_ganadores_jsonb_optional_date(jsonb, text)
from anon;
revoke all on function public._solo_ganadores_jsonb_optional_date(jsonb, text)
from authenticated;
revoke all on function public._solo_ganadores_jsonb_optional_date(jsonb, text)
from service_role;

revoke all on function public._solo_ganadores_jsonb_optional_uuid(jsonb, text)
from public;
revoke all on function public._solo_ganadores_jsonb_optional_uuid(jsonb, text)
from anon;
revoke all on function public._solo_ganadores_jsonb_optional_uuid(jsonb, text)
from authenticated;
revoke all on function public._solo_ganadores_jsonb_optional_uuid(jsonb, text)
from service_role;

revoke all on function public._solo_ganadores_clean_optional_text(text, integer)
from public;
revoke all on function public._solo_ganadores_clean_optional_text(text, integer)
from anon;
revoke all on function public._solo_ganadores_clean_optional_text(text, integer)
from authenticated;
revoke all on function public._solo_ganadores_clean_optional_text(text, integer)
from service_role;

revoke all on function public._solo_ganadores_require_text(text, integer)
from public;
revoke all on function public._solo_ganadores_require_text(text, integer)
from anon;
revoke all on function public._solo_ganadores_require_text(text, integer)
from authenticated;
revoke all on function public._solo_ganadores_require_text(text, integer)
from service_role;

revoke all on function public._solo_ganadores_clean_optional_url(text)
from public;
revoke all on function public._solo_ganadores_clean_optional_url(text)
from anon;
revoke all on function public._solo_ganadores_clean_optional_url(text)
from authenticated;
revoke all on function public._solo_ganadores_clean_optional_url(text)
from service_role;

revoke all on function public._solo_ganadores_require_url(text)
from public;
revoke all on function public._solo_ganadores_require_url(text)
from anon;
revoke all on function public._solo_ganadores_require_url(text)
from authenticated;
revoke all on function public._solo_ganadores_require_url(text)
from service_role;

revoke all on function public._solo_ganadores_validate_action(text, uuid, uuid, boolean)
from public;
revoke all on function public._solo_ganadores_validate_action(text, uuid, uuid, boolean)
from anon;
revoke all on function public._solo_ganadores_validate_action(text, uuid, uuid, boolean)
from authenticated;
revoke all on function public._solo_ganadores_validate_action(text, uuid, uuid, boolean)
from service_role;

revoke all on function public._solo_ganadores_lock_assets(uuid[])
from public;
revoke all on function public._solo_ganadores_lock_assets(uuid[])
from anon;
revoke all on function public._solo_ganadores_lock_assets(uuid[])
from authenticated;
revoke all on function public._solo_ganadores_lock_assets(uuid[])
from service_role;

revoke all on function public._solo_ganadores_require_current_asset(uuid, uuid, text, uuid, text, text, text, text)
from public;
revoke all on function public._solo_ganadores_require_current_asset(uuid, uuid, text, uuid, text, text, text, text)
from anon;
revoke all on function public._solo_ganadores_require_current_asset(uuid, uuid, text, uuid, text, text, text, text)
from authenticated;
revoke all on function public._solo_ganadores_require_current_asset(uuid, uuid, text, uuid, text, text, text, text)
from service_role;

revoke all on function public._solo_ganadores_require_pending_asset_for_update(uuid, text, text)
from public;
revoke all on function public._solo_ganadores_require_pending_asset_for_update(uuid, text, text)
from anon;
revoke all on function public._solo_ganadores_require_pending_asset_for_update(uuid, text, text)
from authenticated;
revoke all on function public._solo_ganadores_require_pending_asset_for_update(uuid, text, text)
from service_role;

revoke all on function public._solo_ganadores_release_asset(uuid, timestamptz)
from public;
revoke all on function public._solo_ganadores_release_asset(uuid, timestamptz)
from anon;
revoke all on function public._solo_ganadores_release_asset(uuid, timestamptz)
from authenticated;
revoke all on function public._solo_ganadores_release_asset(uuid, timestamptz)
from service_role;

revoke all on function public._solo_ganadores_confirm_asset(uuid, text, uuid, text, timestamptz)
from public;
revoke all on function public._solo_ganadores_confirm_asset(uuid, text, uuid, text, timestamptz)
from anon;
revoke all on function public._solo_ganadores_confirm_asset(uuid, text, uuid, text, timestamptz)
from authenticated;
revoke all on function public._solo_ganadores_confirm_asset(uuid, text, uuid, text, timestamptz)
from service_role;

revoke all on function public._solo_ganadores_media_expected_asset(text)
from public;
revoke all on function public._solo_ganadores_media_expected_asset(text)
from anon;
revoke all on function public._solo_ganadores_media_expected_asset(text)
from authenticated;
revoke all on function public._solo_ganadores_media_expected_asset(text)
from service_role;

revoke all on function public.update_solo_ganadores_event(
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
revoke all on function public.update_solo_ganadores_event(
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
revoke all on function public.update_solo_ganadores_event(
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
grant execute on function public.update_solo_ganadores_event(
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

comment on function public._solo_ganadores_jsonb_has_exact_keys(jsonb, text[]) is
  'Helper interno para validar contratos JSON exactos de Solo para Ganadores; no expuesto publicamente.';
comment on function public._solo_ganadores_lock_assets(uuid[]) is
  'Helper interno para bloquear assets en orden determinista durante actualizaciones atomicas.';
comment on function public._solo_ganadores_require_current_asset(uuid, uuid, text, uuid, text, text, text, text) is
  'Helper interno para validar el asset confirmado actual esperado antes de reemplazarlo o liberarlo.';
comment on function public._solo_ganadores_require_pending_asset_for_update(uuid, text, text) is
  'Helper interno para validar assets pending antes de confirmarlos en PATCH.';
comment on function public.update_solo_ganadores_event(uuid, jsonb, timestamptz, text, uuid, uuid, text, uuid, uuid) is
  'RPC server-side para actualizar eventos y coordinar assets de forma atomica; ejecutar solo con service_role.';
comment on function public.update_solo_ganadores_post(uuid, jsonb, timestamptz, text, uuid, uuid, text, uuid, uuid) is
  'RPC server-side para actualizar ganadores y coordinar assets de forma atomica; ejecutar solo con service_role.';
comment on function public.update_solo_ganadores_media(uuid, jsonb, timestamptz, text, uuid, uuid) is
  'RPC server-side para actualizar galeria y coordinar assets de forma atomica; ejecutar solo con service_role.';

commit;

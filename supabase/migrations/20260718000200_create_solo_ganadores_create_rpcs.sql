-- FASE 3.53
-- Creación atómica de recursos y confirmación de assets de Solo para Ganadores.
-- Esta migración no modifica columnas ni registros existentes.

begin;

create function public._solo_ganadores_require_pending_asset(
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
  where id = p_asset_id
  for update;

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

  return v_asset;
end;
$$;

revoke all on function public._solo_ganadores_require_pending_asset(uuid, text, text)
from public;

revoke all on function public._solo_ganadores_require_pending_asset(uuid, text, text)
from anon;

revoke all on function public._solo_ganadores_require_pending_asset(uuid, text, text)
from authenticated;

revoke all on function public._solo_ganadores_require_pending_asset(uuid, text, text)
from service_role;

create function public.create_solo_ganadores_event(
  p_data jsonb,
  p_main_image_asset_id uuid default null,
  p_promo_video_asset_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_data public.solo_ganadores_events%rowtype;
  v_main_image public.solo_ganadores_assets%rowtype;
  v_promo_video public.solo_ganadores_assets%rowtype;
  v_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_row_count integer;
begin
  if p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if (
    p_main_image_asset_id is not null
    and p_promo_video_asset_id is not null
    and p_main_image_asset_id = p_promo_video_asset_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_DUPLICATE';
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

  if v_data.title is null or pg_catalog.btrim(v_data.title) = '' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if (
    v_data.status is null
    or v_data.status not in ('anunciado', 'activo', 'finalizado')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if p_main_image_asset_id is not null then
    v_main_image := public._solo_ganadores_require_pending_asset(
      p_main_image_asset_id,
      'event_main_image',
      'image'
    );
  end if;

  if p_promo_video_asset_id is not null then
    v_promo_video := public._solo_ganadores_require_pending_asset(
      p_promo_video_asset_id,
      'event_promo_video',
      'video'
    );
  end if;

  begin
    insert into public.solo_ganadores_events (
      title,
      semester,
      event_date,
      location_name,
      address,
      city,
      description,
      recognitions,
      main_image_url,
      promo_video_url,
      status,
      published,
      featured,
      updated_at
    )
    values (
      v_data.title,
      v_data.semester,
      v_data.event_date,
      v_data.location_name,
      v_data.address,
      v_data.city,
      v_data.description,
      v_data.recognitions,
      case
        when p_main_image_asset_id is null then v_data.main_image_url
        else v_main_image.public_url
      end,
      case
        when p_promo_video_asset_id is null then v_data.promo_video_url
        else v_promo_video.public_url
      end,
      v_data.status,
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

  if p_main_image_asset_id is not null then
    update public.solo_ganadores_assets
    set
      status = 'confirmed',
      resource_type = 'event',
      resource_id = v_id,
      resource_field = 'main_image_url',
      confirmed_at = v_now,
      expires_at = null,
      last_error = null
    where id = p_main_image_asset_id
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

  if p_promo_video_asset_id is not null then
    update public.solo_ganadores_assets
    set
      status = 'confirmed',
      resource_type = 'event',
      resource_id = v_id,
      resource_field = 'promo_video_url',
      confirmed_at = v_now,
      expires_at = null,
      last_error = null
    where id = p_promo_video_asset_id
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

create function public.create_solo_ganadores_post(
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
  v_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_row_count integer;
begin
  if p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object' then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
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

create function public.create_solo_ganadores_media(
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
  v_id uuid;
  v_now timestamptz := pg_catalog.now();
  v_row_count integer;
begin
  if p_data is null or pg_catalog.jsonb_typeof(p_data) <> 'object' then
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

revoke all on function public.create_solo_ganadores_event(jsonb, uuid, uuid)
from public;

revoke all on function public.create_solo_ganadores_event(jsonb, uuid, uuid)
from anon;

revoke all on function public.create_solo_ganadores_event(jsonb, uuid, uuid)
from authenticated;

grant execute on function public.create_solo_ganadores_event(jsonb, uuid, uuid)
to service_role;

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

comment on function public._solo_ganadores_require_pending_asset(uuid, text, text) is
  'Helper interno server-side para bloquear y validar assets pending; no expuesto publicamente.';

comment on function public.create_solo_ganadores_event(jsonb, uuid, uuid) is
  'RPC server-side para crear evento y confirmar assets en una transaccion atomica; no expuesta publicamente.';

comment on function public.create_solo_ganadores_post(jsonb, uuid, uuid) is
  'RPC server-side para crear ganador y confirmar assets en una transaccion atomica; no expuesta publicamente.';

comment on function public.create_solo_ganadores_media(jsonb, uuid) is
  'RPC server-side para crear galeria y confirmar asset en una transaccion atomica; no expuesta publicamente.';

commit;

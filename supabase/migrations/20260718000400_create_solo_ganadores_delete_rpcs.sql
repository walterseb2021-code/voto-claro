-- FASE 3.62
-- Eliminacion atomica de recursos y liberacion logica de assets de Solo para Ganadores.
-- Esta migracion no modifica tablas, registros, RLS ni policies existentes.

begin;

create function public.delete_solo_ganadores_event(
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

  return p_id;
end;
$$;

create function public.delete_solo_ganadores_post(
  p_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current public.solo_ganadores_posts%rowtype;
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

  if exists (
    select 1
    from public.solo_ganadores_assets
    where resource_type = 'post'
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
    where resource_type = 'post'
      and resource_id = p_id
      and status = 'confirmed'
      and resource_field not in ('photo_url', 'video_url')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'OWNERSHIP_INCONSISTENT';
  end if;

  if exists (
    select 1
    from public.solo_ganadores_assets
    where resource_type = 'post'
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
  where asset.resource_type = 'post'
    and asset.resource_id = p_id
    and asset.status = 'confirmed';

  perform public._solo_ganadores_lock_assets(v_asset_ids);

  if exists (
    select 1
    from public.solo_ganadores_assets as asset
    where asset.resource_type = 'post'
      and asset.resource_id = p_id
      and asset.status = 'confirmed'
      and (
        asset.resource_field is null
        or asset.resource_field not in ('photo_url', 'video_url')
        or asset.resource_type is null
        or asset.resource_id is null
        or (
          asset.resource_field = 'photo_url'
          and (
            asset.purpose <> 'post_photo'
            or asset.media_kind <> 'image'
            or asset.public_url is distinct from v_current.photo_url
          )
        )
        or (
          asset.resource_field = 'video_url'
          and (
            asset.purpose <> 'post_video'
            or asset.media_kind <> 'video'
            or asset.public_url is distinct from v_current.video_url
          )
        )
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'OWNERSHIP_INCONSISTENT';
  end if;

  if v_asset_ids is not null then
    for v_asset_id in
      select asset_id
      from pg_catalog.unnest(v_asset_ids) as locked_assets(asset_id)
      order by asset_id
    loop
      perform public._solo_ganadores_release_asset(v_asset_id, v_now);
    end loop;
  end if;

  delete from public.solo_ganadores_posts
  where id = p_id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'DELETE_FAILED';
  end if;

  return p_id;
end;
$$;

create function public.delete_solo_ganadores_media(
  p_id uuid,
  p_expected_updated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_current public.solo_ganadores_media%rowtype;
  v_now timestamptz := pg_catalog.now();
  v_asset_ids uuid[];
  v_asset_id uuid;
  v_expected_purpose text;
  v_expected_kind text;
  v_row_count integer;
begin
  if p_id is null or p_expected_updated_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
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

  if v_current.media_type = 'video' then
    v_expected_purpose := 'media_video';
    v_expected_kind := 'video';
  elsif v_current.media_type in ('foto', 'ambiente', 'entrega', 'reconocimiento') then
    v_expected_purpose := 'media_image';
    v_expected_kind := 'image';
  else
    v_expected_purpose := null;
    v_expected_kind := null;
  end if;

  if exists (
    select 1
    from public.solo_ganadores_assets
    where resource_type = 'media'
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
    where resource_type = 'media'
      and resource_id = p_id
      and status = 'confirmed'
      and resource_field <> 'media_url'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'OWNERSHIP_INCONSISTENT';
  end if;

  if exists (
    select 1
    from public.solo_ganadores_assets
    where resource_type = 'media'
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
  where asset.resource_type = 'media'
    and asset.resource_id = p_id
    and asset.status = 'confirmed';

  perform public._solo_ganadores_lock_assets(v_asset_ids);

  if exists (
    select 1
    from public.solo_ganadores_assets as asset
    where asset.resource_type = 'media'
      and asset.resource_id = p_id
      and asset.status = 'confirmed'
      and (
        asset.resource_field is null
        or asset.resource_field <> 'media_url'
        or asset.resource_type is null
        or asset.resource_id is null
        or v_expected_purpose is null
        or v_expected_kind is null
        or asset.purpose <> v_expected_purpose
        or asset.media_kind <> v_expected_kind
        or asset.public_url is distinct from v_current.media_url
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'OWNERSHIP_INCONSISTENT';
  end if;

  if v_asset_ids is not null then
    for v_asset_id in
      select asset_id
      from pg_catalog.unnest(v_asset_ids) as locked_assets(asset_id)
      order by asset_id
    loop
      perform public._solo_ganadores_release_asset(v_asset_id, v_now);
    end loop;
  end if;

  delete from public.solo_ganadores_media
  where id = p_id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'DELETE_FAILED';
  end if;

  return p_id;
end;
$$;

revoke all on function public.delete_solo_ganadores_event(uuid, timestamptz)
from public;
revoke all on function public.delete_solo_ganadores_event(uuid, timestamptz)
from anon;
revoke all on function public.delete_solo_ganadores_event(uuid, timestamptz)
from authenticated;
grant execute on function public.delete_solo_ganadores_event(uuid, timestamptz)
to service_role;

revoke all on function public.delete_solo_ganadores_post(uuid, timestamptz)
from public;
revoke all on function public.delete_solo_ganadores_post(uuid, timestamptz)
from anon;
revoke all on function public.delete_solo_ganadores_post(uuid, timestamptz)
from authenticated;
grant execute on function public.delete_solo_ganadores_post(uuid, timestamptz)
to service_role;

revoke all on function public.delete_solo_ganadores_media(uuid, timestamptz)
from public;
revoke all on function public.delete_solo_ganadores_media(uuid, timestamptz)
from anon;
revoke all on function public.delete_solo_ganadores_media(uuid, timestamptz)
from authenticated;
grant execute on function public.delete_solo_ganadores_media(uuid, timestamptz)
to service_role;

comment on function public.delete_solo_ganadores_event(uuid, timestamptz) is
  'RPC server-side para eliminar eventos de forma atomica con control de concurrencia, transicion confirmed a deleting y sin borrado fisico de Storage.';
comment on function public.delete_solo_ganadores_post(uuid, timestamptz) is
  'RPC server-side para eliminar ganadores de forma atomica con control de concurrencia, transicion confirmed a deleting y sin borrado fisico de Storage.';
comment on function public.delete_solo_ganadores_media(uuid, timestamptz) is
  'RPC server-side para eliminar galeria de forma atomica con control de concurrencia, transicion confirmed a deleting y sin borrado fisico de Storage.';

commit;

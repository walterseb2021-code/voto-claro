-- FASE 3.65-B2
-- Backfill de tres assets legacy ya utilizados por Solo para Ganadores.
-- No modifica URLs de recursos, no borra objetos y no ejecuta cleanup.

begin;

alter table public.solo_ganadores_assets
  drop constraint solo_ganadores_assets_purpose_mapping_check;

alter table public.solo_ganadores_assets
  add constraint solo_ganadores_assets_purpose_mapping_check
  check (
    (
      purpose = 'event_main_image'
      and media_kind = 'image'
      and (resource_type is null or resource_type = 'event')
      and (resource_field is null or resource_field = 'main_image_url')
      and (
        (
          mime_type = 'image/jpeg'
          and object_path ~ '^eventos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
        )
        or (
          mime_type = 'image/png'
          and object_path ~ '^eventos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$'
        )
        or (
          mime_type = 'image/webp'
          and object_path ~ '^eventos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
        )
      )
    )
    or (
      purpose = 'event_promo_video'
      and media_kind = 'video'
      and (resource_type is null or resource_type = 'event')
      and (resource_field is null or resource_field = 'promo_video_url')
      and object_path ~ '^eventos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'
      and mime_type = 'video/mp4'
    )
    or (
      purpose = 'post_photo'
      and media_kind = 'image'
      and (resource_type is null or resource_type = 'post')
      and (resource_field is null or resource_field = 'photo_url')
      and (
        (
          mime_type = 'image/jpeg'
          and object_path ~ '^ganadores/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
        )
        or (
          mime_type = 'image/png'
          and object_path ~ '^ganadores/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$'
        )
        or (
          mime_type = 'image/webp'
          and object_path ~ '^ganadores/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
        )
      )
    )
    or (
      purpose = 'post_video'
      and media_kind = 'video'
      and (resource_type is null or resource_type = 'post')
      and (resource_field is null or resource_field = 'video_url')
      and object_path ~ '^ganadores/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'
      and mime_type = 'video/mp4'
    )
    or (
      purpose = 'media_image'
      and media_kind = 'image'
      and (resource_type is null or resource_type = 'media')
      and (resource_field is null or resource_field = 'media_url')
      and (
        (
          mime_type = 'image/jpeg'
          and object_path ~ '^galeria/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'
        )
        or (
          mime_type = 'image/png'
          and object_path ~ '^galeria/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$'
        )
        or (
          mime_type = 'image/webp'
          and object_path ~ '^galeria/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
        )
      )
    )
    or (
      purpose = 'media_video'
      and media_kind = 'video'
      and (resource_type is null or resource_type = 'media')
      and (resource_field is null or resource_field = 'media_url')
      and object_path ~ '^galeria/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'
      and mime_type = 'video/mp4'
    )
    or (
      purpose is not distinct from 'event_main_image'
      and media_kind is not distinct from 'image'
      and mime_type is not distinct from 'image/jpeg'
      and status is not null
      and status in ('confirmed', 'deleting', 'deleted', 'failed')
      and resource_type is not distinct from 'event'
      and resource_id is not distinct from '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid
      and resource_field is not distinct from 'main_image_url'
      and object_path is not distinct from 'eventos/1777247882007-1.jpg'
      and public_url is not distinct from 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777247882007-1.jpg'
    )
    or (
      purpose is not distinct from 'post_photo'
      and media_kind is not distinct from 'image'
      and mime_type is not distinct from 'image/jpeg'
      and status is not null
      and status in ('confirmed', 'deleting', 'deleted', 'failed')
      and resource_type is not distinct from 'post'
      and resource_id is not distinct from '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid
      and resource_field is not distinct from 'photo_url'
      and object_path is not distinct from 'ganadores/1777250755974-camones-2-300x200.jpg'
      and public_url is not distinct from 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777250755974-camones-2-300x200.jpg'
    )
    or (
      purpose is not distinct from 'media_image'
      and media_kind is not distinct from 'image'
      and mime_type is not distinct from 'image/jpeg'
      and status is not null
      and status in ('confirmed', 'deleting', 'deleted', 'failed')
      and resource_type is not distinct from 'media'
      and resource_id is not distinct from '75439f96-ac27-4497-8c24-b7af747378f1'::uuid
      and resource_field is not distinct from 'media_url'
      and object_path is not distinct from 'galeria/1777232612501-camones-2-300x200.jpg'
      and public_url is not distinct from 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/1777232612501-camones-2-300x200.jpg'
    )
  );

do $$
declare
  v_now timestamptz := pg_catalog.now();
  v_case record;
  v_resource_found boolean;
  v_resource_url text;
  v_storage_size bigint;
  v_storage_mime text;
  v_existing public.solo_ganadores_assets%rowtype;
  v_resource_footprints integer;
  v_storage_footprints integer;
  v_asset_id_footprints integer;
  v_asset_path_footprints integer;
  v_ownership_footprints integer;
begin
  select count(*)
  into v_resource_footprints
  from (
    select 1
    from public.solo_ganadores_events e
    where e.id = '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid
    union all
    select 1
    from public.solo_ganadores_posts p
    where p.id = '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid
    union all
    select 1
    from public.solo_ganadores_media m
    where m.id = '75439f96-ac27-4497-8c24-b7af747378f1'::uuid
  ) as footprints;

  select count(*)
  into v_storage_footprints
  from storage.objects o
  where (o.bucket_id, o.name) in (
    values
      ('solo-ganadores', 'eventos/1777247882007-1.jpg'),
      ('solo-ganadores', 'ganadores/1777250755974-camones-2-300x200.jpg'),
      ('solo-ganadores', 'galeria/1777232612501-camones-2-300x200.jpg')
  );

  select count(*)
  into v_asset_id_footprints
  from public.solo_ganadores_assets a
  where a.id in (
    '7c4f2a9e-8b6d-4a30-9c6f-2e1d5a0b3c41'::uuid,
    '9f2d6a1b-3c84-4e92-8f51-7a6c0d2b5e13'::uuid,
    '2e8c7f41-6d95-4b3a-a2f7-0c9e1d8b6a52'::uuid
  );

  select count(*)
  into v_asset_path_footprints
  from public.solo_ganadores_assets a
  where (a.bucket, a.object_path) in (
    values
      ('solo-ganadores', 'eventos/1777247882007-1.jpg'),
      ('solo-ganadores', 'ganadores/1777250755974-camones-2-300x200.jpg'),
      ('solo-ganadores', 'galeria/1777232612501-camones-2-300x200.jpg')
  );

  select count(*)
  into v_ownership_footprints
  from public.solo_ganadores_assets a
  where (a.resource_type, a.resource_id, a.resource_field) in (
    values
      ('event', '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid, 'main_image_url'),
      ('post', '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid, 'photo_url'),
      ('media', '75439f96-ac27-4497-8c24-b7af747378f1'::uuid, 'media_url')
  );

  if v_resource_footprints = 0
    and v_storage_footprints = 0
    and v_asset_id_footprints = 0
    and v_asset_path_footprints = 0
    and v_ownership_footprints = 0
  then
    return;
  end if;

  for v_case in
    select *
    from (
      values
        (
          '7c4f2a9e-8b6d-4a30-9c6f-2e1d5a0b3c41'::uuid,
          'event',
          '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid,
          'main_image_url',
          'event_main_image',
          'image',
          'solo-ganadores',
          'eventos/1777247882007-1.jpg',
          'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777247882007-1.jpg',
          'image/jpeg',
          512994::bigint,
          '2026-04-26 23:58:05.049189+00'::timestamptz
        ),
        (
          '9f2d6a1b-3c84-4e92-8f51-7a6c0d2b5e13'::uuid,
          'post',
          '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid,
          'photo_url',
          'post_photo',
          'image',
          'solo-ganadores',
          'ganadores/1777250755974-camones-2-300x200.jpg',
          'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777250755974-camones-2-300x200.jpg',
          'image/jpeg',
          12897::bigint,
          '2026-04-27 00:45:56.773657+00'::timestamptz
        ),
        (
          '2e8c7f41-6d95-4b3a-a2f7-0c9e1d8b6a52'::uuid,
          'media',
          '75439f96-ac27-4497-8c24-b7af747378f1'::uuid,
          'media_url',
          'media_image',
          'image',
          'solo-ganadores',
          'galeria/1777232612501-camones-2-300x200.jpg',
          'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/1777232612501-camones-2-300x200.jpg',
          'image/jpeg',
          12897::bigint,
          '2026-04-26 19:43:34.323837+00'::timestamptz
        )
    ) as c(
      asset_id,
      resource_type,
      resource_id,
      resource_field,
      purpose,
      media_kind,
      bucket,
      object_path,
      public_url,
      mime_type,
      size_bytes,
      created_at
    )
  loop
    v_resource_found := false;
    v_resource_url := null;

    if v_case.resource_type = 'event' then
      select true, e.main_image_url
      into v_resource_found, v_resource_url
      from public.solo_ganadores_events e
      where e.id = v_case.resource_id
      for share;
    elsif v_case.resource_type = 'post' then
      select true, p.photo_url
      into v_resource_found, v_resource_url
      from public.solo_ganadores_posts p
      where p.id = v_case.resource_id
      for share;
    elsif v_case.resource_type = 'media' then
      select true, m.media_url
      into v_resource_found, v_resource_url
      from public.solo_ganadores_media m
      where m.id = v_case.resource_id
      for share;
    else
      raise exception using errcode = 'P0001', message = 'LEGACY_INVALID_RESOURCE_TYPE';
    end if;

    if not coalesce(v_resource_found, false) then
      raise exception using errcode = 'P0001', message = 'LEGACY_RESOURCE_NOT_FOUND';
    end if;

    if v_resource_url is null then
      raise exception using errcode = 'P0001', message = 'LEGACY_RESOURCE_URL_NULL';
    end if;

    if v_resource_url is distinct from v_case.public_url then
      raise exception using errcode = 'P0001', message = 'LEGACY_RESOURCE_URL_MISMATCH';
    end if;

    select
      case
        when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
          then (o.metadata->>'size')::bigint
        else null
      end,
      nullif(
        lower(
          coalesce(
            o.metadata->>'mimetype',
            o.metadata->>'mimeType',
            o.metadata->>'contentType',
            o.metadata->>'content_type'
          )
        ),
        ''
      )
    into v_storage_size, v_storage_mime
    from storage.objects o
    where o.bucket_id = v_case.bucket
      and o.name = v_case.object_path
    for share;

    if not found then
      raise exception using errcode = 'P0001', message = 'LEGACY_OBJECT_NOT_FOUND';
    end if;

    if v_storage_size is distinct from v_case.size_bytes then
      raise exception using errcode = 'P0001', message = 'LEGACY_SIZE_MISMATCH';
    end if;

    if v_storage_mime is not null and v_storage_mime is distinct from v_case.mime_type then
      raise exception using errcode = 'P0001', message = 'LEGACY_MIME_MISMATCH';
    end if;

    select *
    into v_existing
    from public.solo_ganadores_assets a
    where a.id = v_case.asset_id;

    if found and (
      v_existing.id is not distinct from v_case.asset_id
      and v_existing.bucket is not distinct from v_case.bucket
      and v_existing.object_path is not distinct from v_case.object_path
      and v_existing.public_url is not distinct from v_case.public_url
      and v_existing.media_kind is not distinct from v_case.media_kind
      and v_existing.purpose is not distinct from v_case.purpose
      and v_existing.status is not distinct from 'confirmed'
      and v_existing.resource_type is not distinct from v_case.resource_type
      and v_existing.resource_id is not distinct from v_case.resource_id
      and v_existing.resource_field is not distinct from v_case.resource_field
      and v_existing.mime_type is not distinct from v_case.mime_type
      and v_existing.size_bytes is not distinct from v_case.size_bytes
      and v_existing.created_at is not distinct from v_case.created_at
      and v_existing.confirmed_at is not null
      and v_existing.expires_at is null
      and v_existing.deleting_at is null
      and v_existing.deleted_at is null
      and v_existing.last_error is null
      and v_existing.cleanup_token is null
      and v_existing.cleanup_claimed_at is null
      and v_existing.cleanup_attempts is not distinct from 0
      and v_existing.last_attempt_at is null
      and v_existing.next_retry_at is null
    ) is not true then
      raise exception using errcode = 'P0001', message = 'LEGACY_ASSET_ID_CONFLICT';
    end if;

    select *
    into v_existing
    from public.solo_ganadores_assets a
    where a.bucket = v_case.bucket
      and a.object_path = v_case.object_path;

    if found and v_existing.id is distinct from v_case.asset_id then
      raise exception using errcode = 'P0001', message = 'LEGACY_OBJECT_ASSET_CONFLICT';
    end if;

    if found and (
      v_existing.id is not distinct from v_case.asset_id
      and v_existing.bucket is not distinct from v_case.bucket
      and v_existing.object_path is not distinct from v_case.object_path
      and v_existing.public_url is not distinct from v_case.public_url
      and v_existing.media_kind is not distinct from v_case.media_kind
      and v_existing.purpose is not distinct from v_case.purpose
      and v_existing.status is not distinct from 'confirmed'
      and v_existing.resource_type is not distinct from v_case.resource_type
      and v_existing.resource_id is not distinct from v_case.resource_id
      and v_existing.resource_field is not distinct from v_case.resource_field
      and v_existing.mime_type is not distinct from v_case.mime_type
      and v_existing.size_bytes is not distinct from v_case.size_bytes
      and v_existing.created_at is not distinct from v_case.created_at
      and v_existing.confirmed_at is not null
      and v_existing.expires_at is null
      and v_existing.deleting_at is null
      and v_existing.deleted_at is null
      and v_existing.last_error is null
      and v_existing.cleanup_token is null
      and v_existing.cleanup_claimed_at is null
      and v_existing.cleanup_attempts is not distinct from 0
      and v_existing.last_attempt_at is null
      and v_existing.next_retry_at is null
    ) is not true then
      raise exception using errcode = 'P0001', message = 'LEGACY_OBJECT_ASSET_CONFLICT';
    end if;

    select *
    into v_existing
    from public.solo_ganadores_assets a
    where a.status = 'confirmed'
      and a.resource_type = v_case.resource_type
      and a.resource_id = v_case.resource_id
      and a.resource_field = v_case.resource_field;

    if found and v_existing.id is distinct from v_case.asset_id then
      raise exception using errcode = 'P0001', message = 'LEGACY_OWNERSHIP_CONFLICT';
    end if;

    if found and (
      v_existing.id is not distinct from v_case.asset_id
      and v_existing.bucket is not distinct from v_case.bucket
      and v_existing.object_path is not distinct from v_case.object_path
      and v_existing.public_url is not distinct from v_case.public_url
      and v_existing.media_kind is not distinct from v_case.media_kind
      and v_existing.purpose is not distinct from v_case.purpose
      and v_existing.status is not distinct from 'confirmed'
      and v_existing.resource_type is not distinct from v_case.resource_type
      and v_existing.resource_id is not distinct from v_case.resource_id
      and v_existing.resource_field is not distinct from v_case.resource_field
      and v_existing.mime_type is not distinct from v_case.mime_type
      and v_existing.size_bytes is not distinct from v_case.size_bytes
      and v_existing.created_at is not distinct from v_case.created_at
      and v_existing.confirmed_at is not null
      and v_existing.expires_at is null
      and v_existing.deleting_at is null
      and v_existing.deleted_at is null
      and v_existing.last_error is null
      and v_existing.cleanup_token is null
      and v_existing.cleanup_claimed_at is null
      and v_existing.cleanup_attempts is not distinct from 0
      and v_existing.last_attempt_at is null
      and v_existing.next_retry_at is null
    ) is not true then
      raise exception using errcode = 'P0001', message = 'LEGACY_OWNERSHIP_CONFLICT';
    end if;
  end loop;

  for v_case in
    select *
    from (
      values
        (
          '7c4f2a9e-8b6d-4a30-9c6f-2e1d5a0b3c41'::uuid,
          'event',
          '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid,
          'main_image_url',
          'event_main_image',
          'image',
          'solo-ganadores',
          'eventos/1777247882007-1.jpg',
          'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777247882007-1.jpg',
          'image/jpeg',
          512994::bigint,
          '2026-04-26 23:58:05.049189+00'::timestamptz
        ),
        (
          '9f2d6a1b-3c84-4e92-8f51-7a6c0d2b5e13'::uuid,
          'post',
          '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid,
          'photo_url',
          'post_photo',
          'image',
          'solo-ganadores',
          'ganadores/1777250755974-camones-2-300x200.jpg',
          'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777250755974-camones-2-300x200.jpg',
          'image/jpeg',
          12897::bigint,
          '2026-04-27 00:45:56.773657+00'::timestamptz
        ),
        (
          '2e8c7f41-6d95-4b3a-a2f7-0c9e1d8b6a52'::uuid,
          'media',
          '75439f96-ac27-4497-8c24-b7af747378f1'::uuid,
          'media_url',
          'media_image',
          'image',
          'solo-ganadores',
          'galeria/1777232612501-camones-2-300x200.jpg',
          'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/1777232612501-camones-2-300x200.jpg',
          'image/jpeg',
          12897::bigint,
          '2026-04-26 19:43:34.323837+00'::timestamptz
        )
    ) as c(
      asset_id,
      resource_type,
      resource_id,
      resource_field,
      purpose,
      media_kind,
      bucket,
      object_path,
      public_url,
      mime_type,
      size_bytes,
      created_at
    )
  loop
    if not exists (
      select 1
      from public.solo_ganadores_assets a
      where a.id = v_case.asset_id
    ) then
      insert into public.solo_ganadores_assets (
        id,
        bucket,
        object_path,
        public_url,
        media_kind,
        purpose,
        status,
        resource_type,
        resource_id,
        resource_field,
        mime_type,
        size_bytes,
        created_at,
        confirmed_at,
        expires_at,
        deleting_at,
        deleted_at,
        last_error,
        cleanup_token,
        cleanup_claimed_at,
        cleanup_attempts,
        last_attempt_at,
        next_retry_at
      )
      values (
        v_case.asset_id,
        v_case.bucket,
        v_case.object_path,
        v_case.public_url,
        v_case.media_kind,
        v_case.purpose,
        'confirmed',
        v_case.resource_type,
        v_case.resource_id,
        v_case.resource_field,
        v_case.mime_type,
        v_case.size_bytes,
        v_case.created_at,
        v_now,
        null,
        null,
        null,
        null,
        null,
        null,
        0,
        null,
        null
      );
    end if;
  end loop;
end $$;

do $$
declare
  v_case record;
  v_asset public.solo_ganadores_assets%rowtype;
  v_count integer;
  v_resource_footprints integer;
  v_storage_footprints integer;
  v_asset_id_footprints integer;
  v_asset_path_footprints integer;
  v_ownership_footprints integer;
begin
  select count(*)
  into v_resource_footprints
  from (
    select 1
    from public.solo_ganadores_events e
    where e.id = '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid
    union all
    select 1
    from public.solo_ganadores_posts p
    where p.id = '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid
    union all
    select 1
    from public.solo_ganadores_media m
    where m.id = '75439f96-ac27-4497-8c24-b7af747378f1'::uuid
  ) as footprints;

  select count(*)
  into v_storage_footprints
  from storage.objects o
  where (o.bucket_id, o.name) in (
    values
      ('solo-ganadores', 'eventos/1777247882007-1.jpg'),
      ('solo-ganadores', 'ganadores/1777250755974-camones-2-300x200.jpg'),
      ('solo-ganadores', 'galeria/1777232612501-camones-2-300x200.jpg')
  );

  select count(*)
  into v_asset_id_footprints
  from public.solo_ganadores_assets a
  where a.id in (
    '7c4f2a9e-8b6d-4a30-9c6f-2e1d5a0b3c41'::uuid,
    '9f2d6a1b-3c84-4e92-8f51-7a6c0d2b5e13'::uuid,
    '2e8c7f41-6d95-4b3a-a2f7-0c9e1d8b6a52'::uuid
  );

  select count(*)
  into v_asset_path_footprints
  from public.solo_ganadores_assets a
  where (a.bucket, a.object_path) in (
    values
      ('solo-ganadores', 'eventos/1777247882007-1.jpg'),
      ('solo-ganadores', 'ganadores/1777250755974-camones-2-300x200.jpg'),
      ('solo-ganadores', 'galeria/1777232612501-camones-2-300x200.jpg')
  );

  select count(*)
  into v_ownership_footprints
  from public.solo_ganadores_assets a
  where (a.resource_type, a.resource_id, a.resource_field) in (
    values
      ('event', '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid, 'main_image_url'),
      ('post', '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid, 'photo_url'),
      ('media', '75439f96-ac27-4497-8c24-b7af747378f1'::uuid, 'media_url')
  );

  if v_resource_footprints = 0
    and v_storage_footprints = 0
    and v_asset_id_footprints = 0
    and v_asset_path_footprints = 0
    and v_ownership_footprints = 0
  then
    return;
  end if;

  for v_case in
    select *
    from (
      values
        (
          '7c4f2a9e-8b6d-4a30-9c6f-2e1d5a0b3c41'::uuid,
          'event',
          '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid,
          'main_image_url',
          'event_main_image',
          'image',
          'solo-ganadores',
          'eventos/1777247882007-1.jpg',
          'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777247882007-1.jpg',
          'image/jpeg',
          512994::bigint,
          '2026-04-26 23:58:05.049189+00'::timestamptz
        ),
        (
          '9f2d6a1b-3c84-4e92-8f51-7a6c0d2b5e13'::uuid,
          'post',
          '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid,
          'photo_url',
          'post_photo',
          'image',
          'solo-ganadores',
          'ganadores/1777250755974-camones-2-300x200.jpg',
          'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777250755974-camones-2-300x200.jpg',
          'image/jpeg',
          12897::bigint,
          '2026-04-27 00:45:56.773657+00'::timestamptz
        ),
        (
          '2e8c7f41-6d95-4b3a-a2f7-0c9e1d8b6a52'::uuid,
          'media',
          '75439f96-ac27-4497-8c24-b7af747378f1'::uuid,
          'media_url',
          'media_image',
          'image',
          'solo-ganadores',
          'galeria/1777232612501-camones-2-300x200.jpg',
          'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/1777232612501-camones-2-300x200.jpg',
          'image/jpeg',
          12897::bigint,
          '2026-04-26 19:43:34.323837+00'::timestamptz
        )
    ) as c(
      asset_id,
      resource_type,
      resource_id,
      resource_field,
      purpose,
      media_kind,
      bucket,
      object_path,
      public_url,
      mime_type,
      size_bytes,
      created_at
    )
  loop
    select *
    into v_asset
    from public.solo_ganadores_assets a
    where a.id = v_case.asset_id;

    if not found then
      raise exception using errcode = 'P0001', message = 'LEGACY_FINAL_ASSET_MISSING';
    end if;

    if (
      v_asset.id is not distinct from v_case.asset_id
      and v_asset.bucket is not distinct from v_case.bucket
      and v_asset.object_path is not distinct from v_case.object_path
      and v_asset.public_url is not distinct from v_case.public_url
      and v_asset.media_kind is not distinct from v_case.media_kind
      and v_asset.purpose is not distinct from v_case.purpose
      and v_asset.status is not distinct from 'confirmed'
      and v_asset.resource_type is not distinct from v_case.resource_type
      and v_asset.resource_id is not distinct from v_case.resource_id
      and v_asset.resource_field is not distinct from v_case.resource_field
      and v_asset.mime_type is not distinct from v_case.mime_type
      and v_asset.size_bytes is not distinct from v_case.size_bytes
      and v_asset.created_at is not distinct from v_case.created_at
      and v_asset.confirmed_at is not null
      and v_asset.expires_at is null
      and v_asset.deleting_at is null
      and v_asset.deleted_at is null
      and v_asset.last_error is null
      and v_asset.cleanup_token is null
      and v_asset.cleanup_claimed_at is null
      and v_asset.cleanup_attempts is not distinct from 0
      and v_asset.last_attempt_at is null
      and v_asset.next_retry_at is null
    ) is not true then
      raise exception using errcode = 'P0001', message = 'LEGACY_FINAL_ASSET_MISMATCH';
    end if;

    select count(*)
    into v_count
    from public.solo_ganadores_assets a
    where a.bucket = v_case.bucket
      and a.object_path = v_case.object_path;

    if v_count is distinct from 1 then
      raise exception using errcode = 'P0001', message = 'LEGACY_FINAL_OBJECT_DUPLICATE';
    end if;

    select count(*)
    into v_count
    from public.solo_ganadores_assets a
    where a.status = 'confirmed'
      and a.resource_type = v_case.resource_type
      and a.resource_id = v_case.resource_id
      and a.resource_field = v_case.resource_field;

    if v_count is distinct from 1 then
      raise exception using errcode = 'P0001', message = 'LEGACY_FINAL_OWNERSHIP_DUPLICATE';
    end if;
  end loop;
end $$;

commit;

/*
Consulta posterior de verificacion:

Esta consulta esta destinada a verificar Production despues del backfill.
En una base vacia producira ASSET_MISSING porque el backfill se omite deliberadamente.

with expected as (
  select *
  from (
    values
      (
        '7c4f2a9e-8b6d-4a30-9c6f-2e1d5a0b3c41'::uuid,
        'event',
        '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid,
        'main_image_url',
        'event_main_image',
        'image',
        'solo-ganadores',
        'eventos/1777247882007-1.jpg',
        'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777247882007-1.jpg',
        'image/jpeg',
        512994::bigint,
        '2026-04-26 23:58:05.049189+00'::timestamptz
      ),
      (
        '9f2d6a1b-3c84-4e92-8f51-7a6c0d2b5e13'::uuid,
        'post',
        '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid,
        'photo_url',
        'post_photo',
        'image',
        'solo-ganadores',
        'ganadores/1777250755974-camones-2-300x200.jpg',
        'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777250755974-camones-2-300x200.jpg',
        'image/jpeg',
        12897::bigint,
        '2026-04-27 00:45:56.773657+00'::timestamptz
      ),
      (
        '2e8c7f41-6d95-4b3a-a2f7-0c9e1d8b6a52'::uuid,
        'media',
        '75439f96-ac27-4497-8c24-b7af747378f1'::uuid,
        'media_url',
        'media_image',
        'image',
        'solo-ganadores',
        'galeria/1777232612501-camones-2-300x200.jpg',
        'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/1777232612501-camones-2-300x200.jpg',
        'image/jpeg',
        12897::bigint,
        '2026-04-26 19:43:34.323837+00'::timestamptz
      )
  ) as e(
    asset_id,
    resource_type,
    resource_id,
    resource_field,
    purpose,
    media_kind,
    bucket,
    object_path,
    public_url,
    mime_type,
    size_bytes,
    created_at
  )
),
refs as (
  select 'event'::text as resource_type, e.id as resource_id, 'main_image_url'::text as resource_field, e.main_image_url as public_url
  from public.solo_ganadores_events e
  union all
  select 'event', e.id, 'promo_video_url', e.promo_video_url
  from public.solo_ganadores_events e
  union all
  select 'post', p.id, 'photo_url', p.photo_url
  from public.solo_ganadores_posts p
  union all
  select 'post', p.id, 'video_url', p.video_url
  from public.solo_ganadores_posts p
  union all
  select 'post', p.id, 'interview_url', p.interview_url
  from public.solo_ganadores_posts p
  union all
  select 'media', m.id, 'media_url', m.media_url
  from public.solo_ganadores_media m
),
storage_rows as (
  select
    e.asset_id,
    o.bucket_id,
    o.name,
    case
      when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
        then (o.metadata->>'size')::bigint
      else null
    end as storage_size,
    nullif(
      lower(
        coalesce(
          o.metadata->>'mimetype',
          o.metadata->>'mimeType',
          o.metadata->>'contentType',
          o.metadata->>'content_type'
        )
      ),
      ''
    ) as storage_mime
  from expected e
  left join storage.objects o
    on o.bucket_id = e.bucket
   and o.name = e.object_path
),
joined as (
  select
    e.asset_id,
    a.id as actual_asset_id,
    a.status,
    a.purpose,
    a.media_kind,
    a.bucket,
    a.object_path,
    a.public_url,
    a.mime_type,
    a.size_bytes,
    a.created_at,
    a.confirmed_at,
    a.expires_at,
    a.deleting_at,
    a.deleted_at,
    a.resource_type,
    a.resource_id,
    a.resource_field,
    a.last_error,
    a.cleanup_token,
    a.cleanup_claimed_at,
    a.cleanup_attempts,
    a.last_attempt_at,
    a.next_retry_at,
    sr.name is not null as storage_object_exists,
    sr.storage_size,
    sr.storage_mime,
    sr.storage_size = e.size_bytes as size_coincide,
    (
      sr.storage_mime is null
      or sr.storage_mime = e.mime_type
    ) as mime_coincide,
    (
      select count(*)
      from refs r
      where r.public_url = e.public_url
    ) as referencias_totales,
    (
      a.status = 'confirmed'
      and a.resource_type = e.resource_type
      and a.resource_id = e.resource_id
      and a.resource_field = e.resource_field
    ) as ownership_coincide,
    (
      select count(*)
      from public.solo_ganadores_assets ao
      where ao.bucket = e.bucket
        and ao.object_path = e.object_path
    ) as duplicados_object_path,
    (
      select count(*)
      from public.solo_ganadores_assets aw
      where aw.status = 'confirmed'
        and aw.resource_type = e.resource_type
        and aw.resource_id = e.resource_id
        and aw.resource_field = e.resource_field
    ) as duplicados_ownership,
    e.status_expected,
    e.purpose as expected_purpose,
    e.media_kind as expected_media_kind,
    e.bucket as expected_bucket,
    e.object_path as expected_object_path,
    e.public_url as expected_public_url,
    e.mime_type as expected_mime_type,
    e.size_bytes as expected_size_bytes,
    e.created_at as expected_created_at,
    e.resource_type as expected_resource_type,
    e.resource_id as expected_resource_id,
    e.resource_field as expected_resource_field
  from (
    select
      expected.*,
      'confirmed'::text as status_expected
    from expected
  ) e
  left join public.solo_ganadores_assets a
    on a.id = e.asset_id
  left join storage_rows sr
    on sr.asset_id = e.asset_id
)
select
  left(asset_id::text, 8) as asset_ref,
  asset_id,
  status,
  purpose,
  media_kind,
  bucket,
  object_path,
  public_url,
  mime_type,
  size_bytes,
  created_at,
  confirmed_at,
  expires_at,
  deleting_at,
  deleted_at,
  resource_type,
  resource_id,
  resource_field,
  last_error,
  cleanup_token,
  cleanup_claimed_at,
  cleanup_attempts,
  last_attempt_at,
  next_retry_at,
  storage_object_exists,
  storage_size,
  storage_mime,
  size_coincide,
  mime_coincide,
  referencias_totales,
  ownership_coincide,
  duplicados_object_path,
  duplicados_ownership,
  case
    when actual_asset_id is null then 'ASSET_MISSING'
    when status is distinct from status_expected then 'STATUS_MISMATCH'
    when purpose is distinct from expected_purpose then 'PURPOSE_MISMATCH'
    when media_kind is distinct from expected_media_kind then 'MEDIA_KIND_MISMATCH'
    when bucket is distinct from expected_bucket then 'BUCKET_MISMATCH'
    when object_path is distinct from expected_object_path then 'OBJECT_PATH_MISMATCH'
    when public_url is distinct from expected_public_url then 'PUBLIC_URL_MISMATCH'
    when mime_type is distinct from expected_mime_type then 'MIME_TYPE_MISMATCH'
    when size_bytes is distinct from expected_size_bytes then 'SIZE_BYTES_MISMATCH'
    when created_at is distinct from expected_created_at then 'CREATED_AT_MISMATCH'
    when confirmed_at is null then 'CONFIRMED_AT_MISSING'
    when expires_at is not null then 'EXPIRES_AT_NOT_NULL'
    when deleting_at is not null then 'DELETING_AT_NOT_NULL'
    when deleted_at is not null then 'DELETED_AT_NOT_NULL'
    when resource_type is distinct from expected_resource_type then 'RESOURCE_TYPE_MISMATCH'
    when resource_id is distinct from expected_resource_id then 'RESOURCE_ID_MISMATCH'
    when resource_field is distinct from expected_resource_field then 'RESOURCE_FIELD_MISMATCH'
    when last_error is not null then 'LAST_ERROR_NOT_NULL'
    when cleanup_token is not null then 'CLEANUP_TOKEN_NOT_NULL'
    when cleanup_claimed_at is not null then 'CLEANUP_CLAIMED_AT_NOT_NULL'
    when cleanup_attempts is distinct from 0 then 'CLEANUP_ATTEMPTS_MISMATCH'
    when last_attempt_at is not null then 'LAST_ATTEMPT_AT_NOT_NULL'
    when next_retry_at is not null then 'NEXT_RETRY_AT_NOT_NULL'
    when storage_object_exists is not true then 'STORAGE_OBJECT_MISSING'
    when size_coincide is not true then 'STORAGE_SIZE_MISMATCH'
    when mime_coincide is not true then 'STORAGE_MIME_MISMATCH'
    when referencias_totales is distinct from 1 then 'REFERENCE_COUNT_MISMATCH'
    when ownership_coincide is not true then 'OWNERSHIP_MISMATCH'
    when duplicados_object_path is distinct from 1 then 'OBJECT_PATH_DUPLICATE'
    when duplicados_ownership is distinct from 1 then 'OWNERSHIP_DUPLICATE'
    else 'OK'
  end as resultado_final
from joined
order by resource_type, resource_field;
*/

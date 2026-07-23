-- FASE 3.65-D5
-- Preparacion local de nueve objetos huerfanos inversos para cleanup fisico.
-- Esta migracion no ejecuta la preparacion, no borra Storage y no crea allowlists persistentes.

begin;

do $$
declare
  v_column record;
begin
  select
    columns.data_type,
    columns.is_nullable,
    columns.column_default,
    columns.is_generated,
    columns.is_identity
  into v_column
  from information_schema.columns as columns
  where columns.table_schema = 'public'
    and columns.table_name = 'solo_ganadores_assets'
    and columns.column_name = 'cleanup_origin';

  if not found then
    alter table public.solo_ganadores_assets
      add column cleanup_origin text null;
  elsif (
    v_column.data_type is distinct from 'text'
    or v_column.is_nullable is distinct from 'YES'
    or v_column.column_default is not null
    or v_column.is_generated is distinct from 'NEVER'
    or v_column.is_identity is distinct from 'NO'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INCOMPATIBLE_CLEANUP_ORIGIN';
  end if;
end;
$$;

do $$
declare
  v_constraint_oid oid;
  v_aux_constraint_oid oid;
  v_new_constraint_oid oid;
  v_actual text;
  v_expected text;
  v_contype "char";
  v_convalidated boolean;
begin
  select
    constraint_record.oid,
    constraint_record.contype,
    constraint_record.convalidated
  into
    v_constraint_oid,
    v_contype,
    v_convalidated
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as relation_record
    on relation_record.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as namespace_record
    on namespace_record.oid = relation_record.relnamespace
  where namespace_record.nspname = 'public'
    and relation_record.relname = 'solo_ganadores_assets'
    and constraint_record.conname = 'solo_ganadores_assets_cleanup_origin_check';

  if not found or v_contype <> 'c' or v_convalidated is not true then
    raise exception using
      errcode = 'P0001',
      message = 'INCOMPATIBLE_CLEANUP_ORIGIN_CHECK';
  end if;

  alter table public.solo_ganadores_assets
    add constraint solo_ganadores_assets_cleanup_origin_expected_check
    check (
      cleanup_origin is null
      or (
        cleanup_origin = 'expired_pending'
        and status in ('deleting', 'deleted', 'failed')
        and resource_type is null
        and resource_id is null
        and resource_field is null
      )
    )
    not valid;

  select constraint_record.oid
  into v_aux_constraint_oid
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as relation_record
    on relation_record.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as namespace_record
    on namespace_record.oid = relation_record.relnamespace
  where namespace_record.nspname = 'public'
    and relation_record.relname = 'solo_ganadores_assets'
    and constraint_record.conname = 'solo_ganadores_assets_cleanup_origin_expected_check';

  v_actual := pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_constraintdef(v_constraint_oid),
    '\s+',
    ' ',
    'g'
  ));
  v_expected := pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_constraintdef(v_aux_constraint_oid),
    '\s+',
    ' ',
    'g'
  ));
  v_expected := pg_catalog.regexp_replace(v_expected, ' not valid$', '');

  alter table public.solo_ganadores_assets
    drop constraint solo_ganadores_assets_cleanup_origin_expected_check;

  if v_actual is distinct from v_expected then
    raise exception using
      errcode = 'P0001',
      message = 'INCOMPATIBLE_CLEANUP_ORIGIN_CHECK';
  end if;

  alter table public.solo_ganadores_assets
    drop constraint solo_ganadores_assets_cleanup_origin_check;

  alter table public.solo_ganadores_assets
    add constraint solo_ganadores_assets_cleanup_origin_check
    check (
      cleanup_origin is null
      or (
        cleanup_origin = 'expired_pending'
        and status in ('deleting', 'deleted', 'failed')
        and resource_type is null
        and resource_id is null
        and resource_field is null
      )
      or (
        cleanup_origin = 'orphan_storage'
        and status in ('deleting', 'deleted', 'failed')
        and resource_type is null
        and resource_id is null
        and resource_field is null
        and confirmed_at is null
        and expires_at is null
      )
    );

  select
    constraint_record.oid,
    constraint_record.contype,
    constraint_record.convalidated
  into
    v_new_constraint_oid,
    v_contype,
    v_convalidated
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as relation_record
    on relation_record.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as namespace_record
    on namespace_record.oid = relation_record.relnamespace
  where namespace_record.nspname = 'public'
    and relation_record.relname = 'solo_ganadores_assets'
    and constraint_record.conname = 'solo_ganadores_assets_cleanup_origin_check';

  if not found or v_contype <> 'c' or v_convalidated is not true then
    raise exception using
      errcode = 'P0001',
      message = 'INCOMPATIBLE_CLEANUP_ORIGIN_CHECK';
  end if;
end;
$$;

do $$
declare
  v_constraint_oid oid;
  v_aux_constraint_oid oid;
  v_new_constraint_oid oid;
  v_actual text;
  v_expected text;
  v_contype "char";
  v_convalidated boolean;
begin
  select
    constraint_record.oid,
    constraint_record.contype,
    constraint_record.convalidated
  into
    v_constraint_oid,
    v_contype,
    v_convalidated
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as relation_record
    on relation_record.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as namespace_record
    on namespace_record.oid = relation_record.relnamespace
  where namespace_record.nspname = 'public'
    and relation_record.relname = 'solo_ganadores_assets'
    and constraint_record.conname = 'solo_ganadores_assets_purpose_mapping_check';

  if not found or v_contype <> 'c' or v_convalidated is not true then
    raise exception using
      errcode = 'P0001',
      message = 'INCOMPATIBLE_PURPOSE_MAPPING_CHECK';
  end if;

  alter table public.solo_ganadores_assets
    add constraint solo_ganadores_assets_purpose_mapping_expected_check
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
    )
    not valid;

  select constraint_record.oid
  into v_aux_constraint_oid
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as relation_record
    on relation_record.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as namespace_record
    on namespace_record.oid = relation_record.relnamespace
  where namespace_record.nspname = 'public'
    and relation_record.relname = 'solo_ganadores_assets'
    and constraint_record.conname = 'solo_ganadores_assets_purpose_mapping_expected_check';

  v_actual := pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_constraintdef(v_constraint_oid),
    '\s+',
    ' ',
    'g'
  ));
  v_expected := pg_catalog.lower(pg_catalog.regexp_replace(
    pg_catalog.pg_get_constraintdef(v_aux_constraint_oid),
    '\s+',
    ' ',
    'g'
  ));
  v_expected := pg_catalog.regexp_replace(v_expected, ' not valid$', '');

  alter table public.solo_ganadores_assets
    drop constraint solo_ganadores_assets_purpose_mapping_expected_check;

  if v_actual is distinct from v_expected then
    raise exception using
      errcode = 'P0001',
      message = 'INCOMPATIBLE_PURPOSE_MAPPING_CHECK';
  end if;

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
        and cleanup_origin is null
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
        and cleanup_origin is null
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
        and cleanup_origin is null
        and resource_type is not distinct from 'media'
        and resource_id is not distinct from '75439f96-ac27-4497-8c24-b7af747378f1'::uuid
        and resource_field is not distinct from 'media_url'
        and object_path is not distinct from 'galeria/1777232612501-camones-2-300x200.jpg'
        and public_url is not distinct from 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/1777232612501-camones-2-300x200.jpg'
      )
      or (
        cleanup_origin is not distinct from 'orphan_storage'
        and status is not null
        and status in ('deleting', 'deleted', 'failed')
        and resource_type is null
        and resource_id is null
        and resource_field is null
        and confirmed_at is null
        and expires_at is null
        and purpose is not distinct from 'event_main_image'
        and media_kind is not distinct from 'image'
        and mime_type is not distinct from 'image/jpeg'
        and size_bytes is not distinct from 512994::bigint
        and created_at is not distinct from '2026-04-26 19:08:30.406102+00'::timestamptz
        and object_path is not distinct from 'eventos/1777230507968-1.jpg'
        and public_url is not distinct from 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777230507968-1.jpg'
      )
      or (
        cleanup_origin is not distinct from 'orphan_storage'
        and status is not null
        and status in ('deleting', 'deleted', 'failed')
        and resource_type is null
        and resource_id is null
        and resource_field is null
        and confirmed_at is null
        and expires_at is null
        and purpose is not distinct from 'event_main_image'
        and media_kind is not distinct from 'image'
        and mime_type is not distinct from 'image/jpeg'
        and size_bytes is not distinct from 512994::bigint
        and created_at is not distinct from '2026-04-26 21:44:56.987563+00'::timestamptz
        and object_path is not distinct from 'eventos/1777239894050-1.jpg'
        and public_url is not distinct from 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777239894050-1.jpg'
      )
      or (
        cleanup_origin is not distinct from 'orphan_storage'
        and status is not null
        and status in ('deleting', 'deleted', 'failed')
        and resource_type is null
        and resource_id is null
        and resource_field is null
        and confirmed_at is null
        and expires_at is null
        and purpose is not distinct from 'post_photo'
        and media_kind is not distinct from 'image'
        and mime_type is not distinct from 'image/jpeg'
        and size_bytes is not distinct from 13174::bigint
        and created_at is not distinct from '2026-04-26 21:46:02.932489+00'::timestamptz
        and object_path is not distinct from 'ganadores/1777239961367-images.jpg'
        and public_url is not distinct from 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777239961367-images.jpg'
      )
    );

  select
    constraint_record.oid,
    constraint_record.contype,
    constraint_record.convalidated
  into
    v_new_constraint_oid,
    v_contype,
    v_convalidated
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as relation_record
    on relation_record.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as namespace_record
    on namespace_record.oid = relation_record.relnamespace
  where namespace_record.nspname = 'public'
    and relation_record.relname = 'solo_ganadores_assets'
    and constraint_record.conname = 'solo_ganadores_assets_purpose_mapping_check';

  if not found or v_contype <> 'c' or v_convalidated is not true then
    raise exception using
      errcode = 'P0001',
      message = 'INCOMPATIBLE_PURPOSE_MAPPING_CHECK';
  end if;
end;
$$;

do $$
declare
  v_constraint_oid oid;
  v_aux_constraint_oid oid;
  v_actual text;
  v_expected text;
  v_contype "char";
  v_convalidated boolean;
begin
  select
    constraint_record.oid,
    constraint_record.contype,
    constraint_record.convalidated
  into
    v_constraint_oid,
    v_contype,
    v_convalidated
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as relation_record
    on relation_record.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as namespace_record
    on namespace_record.oid = relation_record.relnamespace
  where namespace_record.nspname = 'public'
    and relation_record.relname = 'solo_ganadores_assets'
    and constraint_record.conname = 'solo_ganadores_assets_orphan_storage_identity_check';

  if found then
    if v_contype <> 'c' or v_convalidated is not true then
      raise exception using
        errcode = 'P0001',
        message = 'INCOMPATIBLE_ORPHAN_STORAGE_IDENTITY_CHECK';
    end if;

    alter table public.solo_ganadores_assets
      add constraint solo_ganadores_assets_orphan_storage_identity_expected_check
      check (
        cleanup_origin is distinct from 'orphan_storage'
        or (
          status in ('deleting', 'deleted', 'failed')
          and resource_type is null
          and resource_id is null
          and resource_field is null
          and confirmed_at is null
          and expires_at is null
          and (
            (
              id = 'b5b0a1e1-0001-4653-8000-000000000001'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'eventos/1777230507968-1.jpg'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777230507968-1.jpg'
              and purpose = 'event_main_image'
              and media_kind = 'image'
              and mime_type = 'image/jpeg'
              and size_bytes = 512994::bigint
              and created_at = '2026-04-26 19:08:30.406102+00'::timestamptz
            )
            or (
              id = 'b5b0a1e1-0002-4653-8000-000000000002'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'eventos/1777239894050-1.jpg'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777239894050-1.jpg'
              and purpose = 'event_main_image'
              and media_kind = 'image'
              and mime_type = 'image/jpeg'
              and size_bytes = 512994::bigint
              and created_at = '2026-04-26 21:44:56.987563+00'::timestamptz
            )
            or (
              id = 'b5b0a1e1-0003-4653-8000-000000000003'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'ganadores/1777239961367-images.jpg'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777239961367-images.jpg'
              and purpose = 'post_photo'
              and media_kind = 'image'
              and mime_type = 'image/jpeg'
              and size_bytes = 13174::bigint
              and created_at = '2026-04-26 21:46:02.932489+00'::timestamptz
            )
            or (
              id = '030b82e0-c2a1-4907-914f-026d74a65f86'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg'
              and purpose = 'event_main_image'
              and media_kind = 'image'
              and mime_type = 'image/jpeg'
              and size_bytes = 112623::bigint
              and created_at = '2026-07-17 22:07:42.009513+00'::timestamptz
            )
            or (
              id = 'eed877cd-4c99-46ea-9ae0-c17d9c06f387'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png'
              and purpose = 'post_photo'
              and media_kind = 'image'
              and mime_type = 'image/png'
              and size_bytes = 585587::bigint
              and created_at = '2026-07-17 22:14:16.450955+00'::timestamptz
            )
            or (
              id = 'dca21711-3629-42b3-ba82-9571d9506f3a'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png'
              and purpose = 'media_image'
              and media_kind = 'image'
              and mime_type = 'image/png'
              and size_bytes = 12552::bigint
              and created_at = '2026-07-17 22:16:38.173796+00'::timestamptz
            )
            or (
              id = 'af2b1e2e-2e20-4d71-947a-5500f59e78db'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4'
              and purpose = 'event_promo_video'
              and media_kind = 'video'
              and mime_type = 'video/mp4'
              and size_bytes = 2779345::bigint
              and created_at = '2026-07-18 04:36:48.081828+00'::timestamptz
            )
            or (
              id = '2ae854b9-0020-4b94-84b7-051c02ea2a08'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4'
              and purpose = 'post_video'
              and media_kind = 'video'
              and mime_type = 'video/mp4'
              and size_bytes = 2779345::bigint
              and created_at = '2026-07-18 04:45:52.366892+00'::timestamptz
            )
            or (
              id = '9cb353f8-d5b6-45c0-8d17-ddec6973d2d4'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4'
              and purpose = 'media_video'
              and media_kind = 'video'
              and mime_type = 'video/mp4'
              and size_bytes = 2779345::bigint
              and created_at = '2026-07-18 04:47:55.031218+00'::timestamptz
            )
          )
        )
      )
      not valid;

    select constraint_record.oid
    into v_aux_constraint_oid
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_class as relation_record
      on relation_record.oid = constraint_record.conrelid
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = relation_record.relnamespace
    where namespace_record.nspname = 'public'
      and relation_record.relname = 'solo_ganadores_assets'
      and constraint_record.conname = 'solo_ganadores_assets_orphan_storage_identity_expected_check';

    v_actual := pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_constraintdef(v_constraint_oid),
      '\s+',
      ' ',
      'g'
    ));
    v_expected := pg_catalog.lower(pg_catalog.regexp_replace(
      pg_catalog.pg_get_constraintdef(v_aux_constraint_oid),
      '\s+',
      ' ',
      'g'
    ));
    v_expected := pg_catalog.regexp_replace(v_expected, ' not valid$', '');

    alter table public.solo_ganadores_assets
      drop constraint solo_ganadores_assets_orphan_storage_identity_expected_check;

    if v_actual is distinct from v_expected then
      raise exception using
        errcode = 'P0001',
        message = 'INCOMPATIBLE_ORPHAN_STORAGE_IDENTITY_CHECK';
    end if;
  else
    alter table public.solo_ganadores_assets
      add constraint solo_ganadores_assets_orphan_storage_identity_check
      check (
        cleanup_origin is distinct from 'orphan_storage'
        or (
          status in ('deleting', 'deleted', 'failed')
          and resource_type is null
          and resource_id is null
          and resource_field is null
          and confirmed_at is null
          and expires_at is null
          and (
            (
              id = 'b5b0a1e1-0001-4653-8000-000000000001'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'eventos/1777230507968-1.jpg'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777230507968-1.jpg'
              and purpose = 'event_main_image'
              and media_kind = 'image'
              and mime_type = 'image/jpeg'
              and size_bytes = 512994::bigint
              and created_at = '2026-04-26 19:08:30.406102+00'::timestamptz
            )
            or (
              id = 'b5b0a1e1-0002-4653-8000-000000000002'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'eventos/1777239894050-1.jpg'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777239894050-1.jpg'
              and purpose = 'event_main_image'
              and media_kind = 'image'
              and mime_type = 'image/jpeg'
              and size_bytes = 512994::bigint
              and created_at = '2026-04-26 21:44:56.987563+00'::timestamptz
            )
            or (
              id = 'b5b0a1e1-0003-4653-8000-000000000003'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'ganadores/1777239961367-images.jpg'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777239961367-images.jpg'
              and purpose = 'post_photo'
              and media_kind = 'image'
              and mime_type = 'image/jpeg'
              and size_bytes = 13174::bigint
              and created_at = '2026-04-26 21:46:02.932489+00'::timestamptz
            )
            or (
              id = '030b82e0-c2a1-4907-914f-026d74a65f86'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg'
              and purpose = 'event_main_image'
              and media_kind = 'image'
              and mime_type = 'image/jpeg'
              and size_bytes = 112623::bigint
              and created_at = '2026-07-17 22:07:42.009513+00'::timestamptz
            )
            or (
              id = 'eed877cd-4c99-46ea-9ae0-c17d9c06f387'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png'
              and purpose = 'post_photo'
              and media_kind = 'image'
              and mime_type = 'image/png'
              and size_bytes = 585587::bigint
              and created_at = '2026-07-17 22:14:16.450955+00'::timestamptz
            )
            or (
              id = 'dca21711-3629-42b3-ba82-9571d9506f3a'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png'
              and purpose = 'media_image'
              and media_kind = 'image'
              and mime_type = 'image/png'
              and size_bytes = 12552::bigint
              and created_at = '2026-07-17 22:16:38.173796+00'::timestamptz
            )
            or (
              id = 'af2b1e2e-2e20-4d71-947a-5500f59e78db'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4'
              and purpose = 'event_promo_video'
              and media_kind = 'video'
              and mime_type = 'video/mp4'
              and size_bytes = 2779345::bigint
              and created_at = '2026-07-18 04:36:48.081828+00'::timestamptz
            )
            or (
              id = '2ae854b9-0020-4b94-84b7-051c02ea2a08'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4'
              and purpose = 'post_video'
              and media_kind = 'video'
              and mime_type = 'video/mp4'
              and size_bytes = 2779345::bigint
              and created_at = '2026-07-18 04:45:52.366892+00'::timestamptz
            )
            or (
              id = '9cb353f8-d5b6-45c0-8d17-ddec6973d2d4'::uuid
              and bucket = 'solo-ganadores'
              and object_path = 'galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4'
              and public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4'
              and purpose = 'media_video'
              and media_kind = 'video'
              and mime_type = 'video/mp4'
              and size_bytes = 2779345::bigint
              and created_at = '2026-07-18 04:47:55.031218+00'::timestamptz
            )
          )
        )
      );
  end if;
end;
$$;

create function public.prepare_solo_ganadores_orphan_storage_assets_for_cleanup(
  p_asset_ids uuid[]
)
returns table (
  asset_id uuid,
  status text,
  cleanup_origin text,
  object_path text,
  purpose text,
  media_kind text,
  created_at timestamptz,
  deleting_at timestamptz,
  cleanup_token uuid,
  cleanup_claimed_at timestamptz,
  cleanup_attempts integer,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  last_error text,
  preparation_state text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_asset public.solo_ganadores_assets%rowtype;
  v_asset_found boolean;
  v_case record;
  v_distinct_count integer;
  v_insert_ids uuid[] := array[]::uuid[];
  v_now timestamptz := pg_catalog.now();
  v_requested_count integer;
  v_storage record;
  v_storage_count integer;
  v_storage_mime text;
  v_storage_size bigint;
  v_storage_size_text text;
begin
  if p_asset_ids is null then
    raise exception using errcode = 'P0001', message = 'INVALID_PAYLOAD';
  end if;

  v_requested_count := coalesce(pg_catalog.cardinality(p_asset_ids), 0);

  if v_requested_count <> 9 then
    raise exception using errcode = 'P0001', message = 'INVALID_PAYLOAD';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_asset_ids) as requested(asset_id)
    where requested.asset_id is null
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_PAYLOAD';
  end if;

  select pg_catalog.count(distinct requested.asset_id)
  into v_distinct_count
  from pg_catalog.unnest(p_asset_ids) as requested(asset_id);

  if v_distinct_count <> 9 then
    raise exception using errcode = 'P0001', message = 'ASSET_DUPLICATE';
  end if;

  if (
    select pg_catalog.count(*)
    from (
      values
        ('b5b0a1e1-0001-4653-8000-000000000001'::uuid),
        ('b5b0a1e1-0002-4653-8000-000000000002'::uuid),
        ('b5b0a1e1-0003-4653-8000-000000000003'::uuid),
        ('030b82e0-c2a1-4907-914f-026d74a65f86'::uuid),
        ('eed877cd-4c99-46ea-9ae0-c17d9c06f387'::uuid),
        ('dca21711-3629-42b3-ba82-9571d9506f3a'::uuid),
        ('af2b1e2e-2e20-4d71-947a-5500f59e78db'::uuid),
        ('2ae854b9-0020-4b94-84b7-051c02ea2a08'::uuid),
        ('9cb353f8-d5b6-45c0-8d17-ddec6973d2d4'::uuid)
    ) as expected(asset_id)
    join pg_catalog.unnest(p_asset_ids) as requested(asset_id)
      on requested.asset_id = expected.asset_id
  ) <> 9 then
    raise exception using errcode = 'P0001', message = 'ORPHAN_NOT_ALLOWED';
  end if;

  for v_case in
    select *
    from (
      values
        ('b5b0a1e1-0001-4653-8000-000000000001'::uuid, '30442747-4884-4113-bb9d-63c62e095a58'::uuid, 'solo-ganadores', 'eventos/1777230507968-1.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777230507968-1.jpg', 'event_main_image', 'image', 'image/jpeg', 512994::bigint, '2026-04-26 19:08:30.406102+00'::timestamptz),
        ('b5b0a1e1-0002-4653-8000-000000000002'::uuid, '8224b691-7469-40ed-9666-f7a2422ba30b'::uuid, 'solo-ganadores', 'eventos/1777239894050-1.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777239894050-1.jpg', 'event_main_image', 'image', 'image/jpeg', 512994::bigint, '2026-04-26 21:44:56.987563+00'::timestamptz),
        ('b5b0a1e1-0003-4653-8000-000000000003'::uuid, '327ab125-c12f-454e-b2b8-2b67454120b9'::uuid, 'solo-ganadores', 'ganadores/1777239961367-images.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777239961367-images.jpg', 'post_photo', 'image', 'image/jpeg', 13174::bigint, '2026-04-26 21:46:02.932489+00'::timestamptz),
        ('030b82e0-c2a1-4907-914f-026d74a65f86'::uuid, '5d9d55e8-308e-4675-8444-a08d8d938b18'::uuid, 'solo-ganadores', 'eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg', 'event_main_image', 'image', 'image/jpeg', 112623::bigint, '2026-07-17 22:07:42.009513+00'::timestamptz),
        ('eed877cd-4c99-46ea-9ae0-c17d9c06f387'::uuid, '31051575-b681-4406-81c1-a849b96e99f3'::uuid, 'solo-ganadores', 'ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png', 'post_photo', 'image', 'image/png', 585587::bigint, '2026-07-17 22:14:16.450955+00'::timestamptz),
        ('dca21711-3629-42b3-ba82-9571d9506f3a'::uuid, '59c52f60-73db-4827-9d50-c90e09a524b1'::uuid, 'solo-ganadores', 'galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png', 'media_image', 'image', 'image/png', 12552::bigint, '2026-07-17 22:16:38.173796+00'::timestamptz),
        ('af2b1e2e-2e20-4d71-947a-5500f59e78db'::uuid, '16d3a471-c346-4539-b5a3-37b9eaee54c9'::uuid, 'solo-ganadores', 'eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4', 'event_promo_video', 'video', 'video/mp4', 2779345::bigint, '2026-07-18 04:36:48.081828+00'::timestamptz),
        ('2ae854b9-0020-4b94-84b7-051c02ea2a08'::uuid, 'dcb19486-f79a-44ca-88cd-f0fb17f67cf1'::uuid, 'solo-ganadores', 'ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4', 'post_video', 'video', 'video/mp4', 2779345::bigint, '2026-07-18 04:45:52.366892+00'::timestamptz),
        ('9cb353f8-d5b6-45c0-8d17-ddec6973d2d4'::uuid, 'e339ad80-56f1-45c0-b9ea-0dc5d91823a5'::uuid, 'solo-ganadores', 'galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4', 'media_video', 'video', 'video/mp4', 2779345::bigint, '2026-07-18 04:47:55.031218+00'::timestamptz)
    ) as c(asset_id, storage_object_id, bucket, object_path, public_url, purpose, media_kind, mime_type, size_bytes, storage_created_at)
    order by c.asset_id
  loop
    select *
    into v_asset
    from public.solo_ganadores_assets as asset
    where asset.id = v_case.asset_id
    for update;

    v_asset_found := found;

    select pg_catalog.count(*)
    into v_storage_count
    from storage.objects as storage_object
    where storage_object.bucket_id = v_case.bucket
      and storage_object.name = v_case.object_path;

    if v_asset_found and v_asset.status = 'deleted' then
      if v_storage_count <> 0 then
        raise exception using errcode = 'P0001', message = 'ORPHAN_STORAGE_REAPPEARED';
      end if;
    else
      if v_storage_count = 0 then
        raise exception using errcode = 'P0001', message = 'ORPHAN_STORAGE_MISSING';
      end if;

      if v_storage_count > 1 then
        raise exception using errcode = 'P0001', message = 'ORPHAN_STORAGE_DUPLICATE';
      end if;

      select
        storage_object.id,
        storage_object.created_at,
        nullif(pg_catalog.btrim(storage_object.metadata ->> 'size'), '') as size_text,
        nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(
          storage_object.metadata ->> 'mimetype',
          storage_object.metadata ->> 'mimeType',
          storage_object.metadata ->> 'contentType',
          storage_object.metadata ->> 'content_type'
        ))), '') as mime_type
      into v_storage
      from storage.objects as storage_object
      where storage_object.bucket_id = v_case.bucket
        and storage_object.name = v_case.object_path
      for share;

      if v_storage.id is distinct from v_case.storage_object_id then
        raise exception using errcode = 'P0001', message = 'ORPHAN_STORAGE_ID_MISMATCH';
      end if;

      if v_storage.created_at is distinct from v_case.storage_created_at then
        raise exception using errcode = 'P0001', message = 'ORPHAN_STORAGE_CREATED_AT_MISMATCH';
      end if;

      v_storage_size_text := v_storage.size_text;

      if v_storage_size_text is null
        or v_storage_size_text !~ '^[0-9]+$'
        or pg_catalog.length(v_storage_size_text) > 18 then
        raise exception using errcode = 'P0001', message = 'ORPHAN_STORAGE_SIZE_INVALID';
      end if;

      v_storage_size := v_storage_size_text::bigint;

      if v_storage_size is distinct from v_case.size_bytes then
        raise exception using errcode = 'P0001', message = 'ORPHAN_SIZE_MISMATCH';
      end if;

      v_storage_mime := v_storage.mime_type;

      if v_storage_mime is not null and v_storage_mime is distinct from v_case.mime_type then
        raise exception using errcode = 'P0001', message = 'ORPHAN_MIME_MISMATCH';
      end if;

      if public.solo_ganadores_asset_has_active_reference(v_case.public_url) then
        raise exception using errcode = 'P0001', message = 'ORPHAN_REFERENCED';
      end if;
    end if;

    if v_asset_found then
      if v_asset.id is distinct from v_case.asset_id
        or v_asset.bucket is distinct from v_case.bucket
        or v_asset.object_path is distinct from v_case.object_path
        or v_asset.public_url is distinct from v_case.public_url
        or v_asset.purpose is distinct from v_case.purpose
        or v_asset.media_kind is distinct from v_case.media_kind
        or v_asset.mime_type is distinct from v_case.mime_type
        or v_asset.size_bytes is distinct from v_case.size_bytes
        or v_asset.created_at is distinct from v_case.storage_created_at
        or v_asset.cleanup_origin is distinct from 'orphan_storage'
        or v_asset.resource_type is not null
        or v_asset.resource_id is not null
        or v_asset.resource_field is not null
        or v_asset.confirmed_at is not null
        or v_asset.expires_at is not null
        or v_asset.deleting_at is null
        or coalesce(v_asset.cleanup_attempts, -1) < 0
        or ((v_asset.cleanup_token is null) is distinct from (v_asset.cleanup_claimed_at is null)) then
        raise exception using errcode = 'P0001', message = 'ORPHAN_ASSET_CONFLICT';
      end if;

      if v_asset.status = 'deleting' then
        if v_asset.deleted_at is not null then
          raise exception using errcode = 'P0001', message = 'ORPHAN_ASSET_CONFLICT';
        end if;
      elsif v_asset.status = 'deleted' then
        if v_asset.deleted_at is null
          or v_asset.cleanup_token is not null
          or v_asset.cleanup_claimed_at is not null then
          raise exception using errcode = 'P0001', message = 'ORPHAN_ASSET_CONFLICT';
        end if;
      else
        raise exception using errcode = 'P0001', message = 'ORPHAN_ASSET_CONFLICT';
      end if;
    else
      if exists (
        select 1
        from public.solo_ganadores_assets as existing_asset
        where existing_asset.bucket = v_case.bucket
          and existing_asset.object_path = v_case.object_path
      ) then
        raise exception using errcode = 'P0001', message = 'ORPHAN_ASSET_CONFLICT';
      end if;

      v_insert_ids := pg_catalog.array_append(v_insert_ids, v_case.asset_id);
    end if;
  end loop;

  for v_case in
    select *
    from (
      values
        ('b5b0a1e1-0001-4653-8000-000000000001'::uuid, 'solo-ganadores', 'eventos/1777230507968-1.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777230507968-1.jpg', 'event_main_image', 'image', 'image/jpeg', 512994::bigint, '2026-04-26 19:08:30.406102+00'::timestamptz),
        ('b5b0a1e1-0002-4653-8000-000000000002'::uuid, 'solo-ganadores', 'eventos/1777239894050-1.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777239894050-1.jpg', 'event_main_image', 'image', 'image/jpeg', 512994::bigint, '2026-04-26 21:44:56.987563+00'::timestamptz),
        ('b5b0a1e1-0003-4653-8000-000000000003'::uuid, 'solo-ganadores', 'ganadores/1777239961367-images.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777239961367-images.jpg', 'post_photo', 'image', 'image/jpeg', 13174::bigint, '2026-04-26 21:46:02.932489+00'::timestamptz),
        ('030b82e0-c2a1-4907-914f-026d74a65f86'::uuid, 'solo-ganadores', 'eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg', 'event_main_image', 'image', 'image/jpeg', 112623::bigint, '2026-07-17 22:07:42.009513+00'::timestamptz),
        ('eed877cd-4c99-46ea-9ae0-c17d9c06f387'::uuid, 'solo-ganadores', 'ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png', 'post_photo', 'image', 'image/png', 585587::bigint, '2026-07-17 22:14:16.450955+00'::timestamptz),
        ('dca21711-3629-42b3-ba82-9571d9506f3a'::uuid, 'solo-ganadores', 'galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png', 'media_image', 'image', 'image/png', 12552::bigint, '2026-07-17 22:16:38.173796+00'::timestamptz),
        ('af2b1e2e-2e20-4d71-947a-5500f59e78db'::uuid, 'solo-ganadores', 'eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4', 'event_promo_video', 'video', 'video/mp4', 2779345::bigint, '2026-07-18 04:36:48.081828+00'::timestamptz),
        ('2ae854b9-0020-4b94-84b7-051c02ea2a08'::uuid, 'solo-ganadores', 'ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4', 'post_video', 'video', 'video/mp4', 2779345::bigint, '2026-07-18 04:45:52.366892+00'::timestamptz),
        ('9cb353f8-d5b6-45c0-8d17-ddec6973d2d4'::uuid, 'solo-ganadores', 'galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4', 'media_video', 'video', 'video/mp4', 2779345::bigint, '2026-07-18 04:47:55.031218+00'::timestamptz)
    ) as c(asset_id, bucket, object_path, public_url, purpose, media_kind, mime_type, size_bytes, storage_created_at)
    where c.asset_id = any(v_insert_ids)
    order by c.asset_id
  loop
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
      next_retry_at,
      cleanup_origin
    )
    values (
      v_case.asset_id,
      v_case.bucket,
      v_case.object_path,
      v_case.public_url,
      v_case.media_kind,
      v_case.purpose,
      'deleting',
      null,
      null,
      null,
      v_case.mime_type,
      v_case.size_bytes,
      v_case.storage_created_at,
      null,
      null,
      v_now,
      null,
      null,
      null,
      null,
      0,
      null,
      null,
      'orphan_storage'
    );
  end loop;

  return query
  select
    asset.id,
    asset.status,
    asset.cleanup_origin,
    asset.object_path,
    asset.purpose,
    asset.media_kind,
    asset.created_at,
    asset.deleting_at,
    asset.cleanup_token,
    asset.cleanup_claimed_at,
    asset.cleanup_attempts,
    asset.last_attempt_at,
    asset.next_retry_at,
    asset.last_error,
    case
      when asset.status = 'deleted' then 'ALREADY_DELETED'::text
      when asset.cleanup_token is not null
        and asset.cleanup_claimed_at >= pg_catalog.now() - interval '900 seconds'
        then 'ALREADY_CLAIMED'::text
      when asset.cleanup_token is not null
        and asset.cleanup_claimed_at < pg_catalog.now() - interval '900 seconds'
        then 'CLAIM_EXPIRED_REQUIRES_CLEANUP_FLOW'::text
      else 'READY_FOR_CLEANUP'::text
    end as preparation_state
  from public.solo_ganadores_assets as asset
  join pg_catalog.unnest(p_asset_ids) as requested(asset_id)
    on requested.asset_id = asset.id
  where asset.cleanup_origin = 'orphan_storage'
  order by asset.object_path;
end;
$$;

create function public.validate_solo_ganadores_orphan_storage_asset_before_remove(
  p_asset_id uuid,
  p_cleanup_token uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_asset public.solo_ganadores_assets%rowtype;
  v_case record;
  v_storage record;
  v_storage_count integer;
  v_storage_mime text;
  v_storage_size bigint;
  v_storage_size_text text;
begin
  if p_asset_id is null or p_cleanup_token is null then
    return 'CLAIM_NOT_FOUND';
  end if;

  select *
  into v_case
  from (
    values
      ('b5b0a1e1-0001-4653-8000-000000000001'::uuid, '30442747-4884-4113-bb9d-63c62e095a58'::uuid, 'solo-ganadores', 'eventos/1777230507968-1.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777230507968-1.jpg', 'event_main_image', 'image', 'image/jpeg', 512994::bigint, '2026-04-26 19:08:30.406102+00'::timestamptz),
      ('b5b0a1e1-0002-4653-8000-000000000002'::uuid, '8224b691-7469-40ed-9666-f7a2422ba30b'::uuid, 'solo-ganadores', 'eventos/1777239894050-1.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777239894050-1.jpg', 'event_main_image', 'image', 'image/jpeg', 512994::bigint, '2026-04-26 21:44:56.987563+00'::timestamptz),
      ('b5b0a1e1-0003-4653-8000-000000000003'::uuid, '327ab125-c12f-454e-b2b8-2b67454120b9'::uuid, 'solo-ganadores', 'ganadores/1777239961367-images.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777239961367-images.jpg', 'post_photo', 'image', 'image/jpeg', 13174::bigint, '2026-04-26 21:46:02.932489+00'::timestamptz),
      ('030b82e0-c2a1-4907-914f-026d74a65f86'::uuid, '5d9d55e8-308e-4675-8444-a08d8d938b18'::uuid, 'solo-ganadores', 'eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg', 'event_main_image', 'image', 'image/jpeg', 112623::bigint, '2026-07-17 22:07:42.009513+00'::timestamptz),
      ('eed877cd-4c99-46ea-9ae0-c17d9c06f387'::uuid, '31051575-b681-4406-81c1-a849b96e99f3'::uuid, 'solo-ganadores', 'ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png', 'post_photo', 'image', 'image/png', 585587::bigint, '2026-07-17 22:14:16.450955+00'::timestamptz),
      ('dca21711-3629-42b3-ba82-9571d9506f3a'::uuid, '59c52f60-73db-4827-9d50-c90e09a524b1'::uuid, 'solo-ganadores', 'galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png', 'media_image', 'image', 'image/png', 12552::bigint, '2026-07-17 22:16:38.173796+00'::timestamptz),
      ('af2b1e2e-2e20-4d71-947a-5500f59e78db'::uuid, '16d3a471-c346-4539-b5a3-37b9eaee54c9'::uuid, 'solo-ganadores', 'eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4', 'event_promo_video', 'video', 'video/mp4', 2779345::bigint, '2026-07-18 04:36:48.081828+00'::timestamptz),
      ('2ae854b9-0020-4b94-84b7-051c02ea2a08'::uuid, 'dcb19486-f79a-44ca-88cd-f0fb17f67cf1'::uuid, 'solo-ganadores', 'ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4', 'post_video', 'video', 'video/mp4', 2779345::bigint, '2026-07-18 04:45:52.366892+00'::timestamptz),
      ('9cb353f8-d5b6-45c0-8d17-ddec6973d2d4'::uuid, 'e339ad80-56f1-45c0-b9ea-0dc5d91823a5'::uuid, 'solo-ganadores', 'galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4', 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4', 'media_video', 'video', 'video/mp4', 2779345::bigint, '2026-07-18 04:47:55.031218+00'::timestamptz)
  ) as c(asset_id, storage_object_id, bucket, object_path, public_url, purpose, media_kind, mime_type, size_bytes, storage_created_at)
  where c.asset_id = p_asset_id;

  if not found then
    return 'ORPHAN_NOT_ALLOWED';
  end if;

  select *
  into v_asset
  from public.solo_ganadores_assets as asset
  where asset.id = p_asset_id
    and asset.cleanup_token = p_cleanup_token
  for update;

  if not found then
    return 'CLAIM_NOT_FOUND';
  end if;

  if v_asset.status <> 'deleting'
    or v_asset.cleanup_origin is distinct from 'orphan_storage'
    or v_asset.cleanup_claimed_at is null
    or v_asset.cleanup_claimed_at < pg_catalog.now() - interval '900 seconds'
    or coalesce(v_asset.cleanup_attempts, 0) < 1 then
    return 'CLAIM_NOT_FOUND';
  end if;

  if v_asset.bucket is distinct from v_case.bucket
    or v_asset.object_path is distinct from v_case.object_path
    or v_asset.public_url is distinct from v_case.public_url
    or v_asset.purpose is distinct from v_case.purpose
    or v_asset.media_kind is distinct from v_case.media_kind
    or v_asset.mime_type is distinct from v_case.mime_type
    or v_asset.size_bytes is distinct from v_case.size_bytes
    or v_asset.created_at is distinct from v_case.storage_created_at
    or v_asset.resource_type is not null
    or v_asset.resource_id is not null
    or v_asset.resource_field is not null
    or v_asset.confirmed_at is not null
    or v_asset.expires_at is not null
    or v_asset.deleting_at is null
    or v_asset.deleted_at is not null then
    return 'ORPHAN_ASSET_CONFLICT';
  end if;

  select pg_catalog.count(*)
  into v_storage_count
  from storage.objects as storage_object
  where storage_object.bucket_id = v_case.bucket
    and storage_object.name = v_case.object_path;

  if v_storage_count = 0 then
    return 'ORPHAN_STORAGE_MISSING';
  end if;

  if v_storage_count > 1 then
    return 'ORPHAN_STORAGE_DUPLICATE';
  end if;

  select
    storage_object.id,
    storage_object.created_at,
    nullif(pg_catalog.btrim(storage_object.metadata ->> 'size'), '') as size_text,
    nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(
      storage_object.metadata ->> 'mimetype',
      storage_object.metadata ->> 'mimeType',
      storage_object.metadata ->> 'contentType',
      storage_object.metadata ->> 'content_type'
    ))), '') as mime_type
  into v_storage
  from storage.objects as storage_object
  where storage_object.bucket_id = v_case.bucket
    and storage_object.name = v_case.object_path
  for share;

  if v_storage.id is distinct from v_case.storage_object_id then
    return 'ORPHAN_STORAGE_ID_MISMATCH';
  end if;

  if v_storage.created_at is distinct from v_case.storage_created_at then
    return 'ORPHAN_STORAGE_CREATED_AT_MISMATCH';
  end if;

  v_storage_size_text := v_storage.size_text;

  if v_storage_size_text is null
    or v_storage_size_text !~ '^[0-9]+$'
    or pg_catalog.length(v_storage_size_text) > 18 then
    return 'ORPHAN_STORAGE_SIZE_INVALID';
  end if;

  v_storage_size := v_storage_size_text::bigint;

  if v_storage_size is distinct from v_case.size_bytes then
    return 'ORPHAN_SIZE_MISMATCH';
  end if;

  v_storage_mime := v_storage.mime_type;

  if v_storage_mime is not null and v_storage_mime is distinct from v_case.mime_type then
    return 'ORPHAN_MIME_MISMATCH';
  end if;

  if public.solo_ganadores_asset_has_active_reference(v_case.public_url) then
    return 'ORPHAN_REFERENCED';
  end if;

  return 'OK';
end;
$$;

revoke all on function public.prepare_solo_ganadores_orphan_storage_assets_for_cleanup(uuid[])
from public;
revoke all on function public.prepare_solo_ganadores_orphan_storage_assets_for_cleanup(uuid[])
from anon;
revoke all on function public.prepare_solo_ganadores_orphan_storage_assets_for_cleanup(uuid[])
from authenticated;
grant execute on function public.prepare_solo_ganadores_orphan_storage_assets_for_cleanup(uuid[])
to service_role;

revoke all on function public.validate_solo_ganadores_orphan_storage_asset_before_remove(uuid, uuid)
from public;
revoke all on function public.validate_solo_ganadores_orphan_storage_asset_before_remove(uuid, uuid)
from anon;
revoke all on function public.validate_solo_ganadores_orphan_storage_asset_before_remove(uuid, uuid)
from authenticated;
grant execute on function public.validate_solo_ganadores_orphan_storage_asset_before_remove(uuid, uuid)
to service_role;

comment on function public.prepare_solo_ganadores_orphan_storage_assets_for_cleanup(uuid[]) is
  'RPC server-side para preparar exactamente nueve assets orphan_storage auditados sin ejecutar cleanup ni borrar Storage.';

comment on function public.validate_solo_ganadores_orphan_storage_asset_before_remove(uuid, uuid) is
  'RPC server-side para validar identidad, claim vigente y referencias antes de borrar un objeto orphan_storage desde el endpoint cron.';

comment on constraint solo_ganadores_assets_orphan_storage_identity_check
on public.solo_ganadores_assets is
  'Limita cleanup_origin orphan_storage a nueve identidades auditadas de objetos huerfanos inversos.';

commit;

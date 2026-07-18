-- FASE 3.48
-- Registro central de archivos propios del módulo Solo para Ganadores.
-- Esta migración no modifica las tablas públicas existentes del módulo.

begin;

create extension if not exists pgcrypto with schema extensions;

create table public.solo_ganadores_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'solo-ganadores',
  object_path text not null,
  public_url text not null,
  media_kind text not null,
  purpose text not null,
  status text not null default 'pending',
  resource_type text null,
  resource_id uuid null,
  resource_field text null,
  mime_type text not null,
  size_bytes bigint null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz null,
  expires_at timestamptz null,
  deleting_at timestamptz null,
  deleted_at timestamptz null,
  last_error text null,
  constraint solo_ganadores_assets_bucket_check
    check (bucket = 'solo-ganadores'),
  constraint solo_ganadores_assets_media_kind_check
    check (media_kind in ('image', 'video')),
  constraint solo_ganadores_assets_purpose_check
    check (
      purpose in (
        'event_main_image',
        'event_promo_video',
        'post_photo',
        'post_video',
        'media_image',
        'media_video'
      )
    ),
  constraint solo_ganadores_assets_status_check
    check (status in ('pending', 'confirmed', 'deleting', 'deleted', 'failed')),
  constraint solo_ganadores_assets_resource_type_check
    check (resource_type is null or resource_type in ('event', 'post', 'media')),
  constraint solo_ganadores_assets_resource_field_check
    check (
      resource_field is null
      or resource_field in (
        'main_image_url',
        'promo_video_url',
        'photo_url',
        'video_url',
        'media_url'
      )
    ),
  constraint solo_ganadores_assets_mime_type_check
    check (
      mime_type in (
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4'
      )
    ),
  constraint solo_ganadores_assets_size_bytes_check
    check (
      size_bytes is null
      or (
        size_bytes > 0
        and (
          (media_kind = 'image' and size_bytes <= 5 * 1024 * 1024)
          or (media_kind = 'video' and size_bytes <= 45 * 1024 * 1024)
        )
      )
    ),
  constraint solo_ganadores_assets_last_error_check
    check (last_error is null or char_length(last_error) <= 500),
  constraint solo_ganadores_assets_owner_completeness_check
    check (
      (
        resource_type is null
        and resource_id is null
        and resource_field is null
      )
      or (
        resource_type is not null
        and resource_id is not null
        and resource_field is not null
      )
    ),
  constraint solo_ganadores_assets_status_owner_check
    check (
      (
        status = 'pending'
        and resource_type is null
        and resource_id is null
        and resource_field is null
        and expires_at is not null
        and confirmed_at is null
        and deleting_at is null
        and deleted_at is null
      )
      or (
        status = 'confirmed'
        and resource_type is not null
        and resource_id is not null
        and resource_field is not null
        and confirmed_at is not null
        and deleting_at is null
        and deleted_at is null
      )
      or (
        status = 'deleting'
        and deleting_at is not null
        and deleted_at is null
      )
      or (
        status = 'deleted'
        and deleting_at is not null
        and deleted_at is not null
      )
      or (
        status = 'failed'
        and deleted_at is null
      )
    ),
  constraint solo_ganadores_assets_purpose_mapping_check
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
    ),
  constraint solo_ganadores_assets_public_url_check
    check (
      public_url like 'https://%'
      and public_url !~ '\s'
      and char_length(public_url) <= 2048
    ),
  constraint solo_ganadores_assets_bucket_object_path_key
    unique (bucket, object_path)
);

create index solo_ganadores_assets_status_expires_idx
  on public.solo_ganadores_assets (status, expires_at);

create index solo_ganadores_assets_resource_idx
  on public.solo_ganadores_assets (resource_type, resource_id);

create unique index solo_ganadores_assets_confirmed_field_key
  on public.solo_ganadores_assets (
    resource_type,
    resource_id,
    resource_field
  )
  where status = 'confirmed';

create index solo_ganadores_assets_public_url_idx
  on public.solo_ganadores_assets (public_url);

alter table public.solo_ganadores_assets enable row level security;

comment on table public.solo_ganadores_assets is
  'Registro central de archivos propios del bucket solo-ganadores usados por el módulo Solo para Ganadores.';

comment on column public.solo_ganadores_assets.id is
  'Identificador server-side del asset usado para confirmar cargas pendientes.';

comment on column public.solo_ganadores_assets.object_path is
  'Ruta del objeto dentro del bucket solo-ganadores.';

comment on column public.solo_ganadores_assets.public_url is
  'URL pública persistida para compatibilidad con los campos URL existentes.';

comment on column public.solo_ganadores_assets.purpose is
  'Propósito cerrado de carga que define recurso, campo, carpeta y tipo de media.';

comment on column public.solo_ganadores_assets.status is
  'Estado operativo del asset: pending, confirmed, deleting, deleted o failed.';

comment on column public.solo_ganadores_assets.resource_type is
  'Tipo de recurso propietario confirmado: event, post o media.';

comment on column public.solo_ganadores_assets.resource_id is
  'Identificador del recurso propietario confirmado.';

comment on column public.solo_ganadores_assets.resource_field is
  'Campo URL del recurso propietario confirmado.';

comment on column public.solo_ganadores_assets.size_bytes is
  'Tamaño del archivo en bytes cuando está disponible; puede ser null para legacy.';

comment on column public.solo_ganadores_assets.expires_at is
  'Fecha límite para considerar una carga pendiente como candidata a limpieza.';

comment on column public.solo_ganadores_assets.last_error is
  'Código o categoría segura del último error operativo, sin secretos ni payloads.';

commit;

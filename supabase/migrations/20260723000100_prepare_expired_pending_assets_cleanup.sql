-- FASE 3.65-C3A
-- Preparacion controlada de assets pending vencidos para cleanup fisico externo.
-- Esta migracion no ejecuta cleanup, no borra Storage y no modifica las RPC de cleanup existentes.

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
  v_actual text;
  v_expected text;
  v_convalidated boolean;
  v_contype "char";
begin
  select
    constraint_record.oid,
    constraint_record.convalidated,
    constraint_record.contype
  into
    v_constraint_oid,
    v_convalidated,
    v_contype
  from pg_catalog.pg_constraint as constraint_record
  join pg_catalog.pg_class as relation_record
    on relation_record.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace as namespace_record
    on namespace_record.oid = relation_record.relnamespace
  where namespace_record.nspname = 'public'
    and relation_record.relname = 'solo_ganadores_assets'
    and constraint_record.conname = 'solo_ganadores_assets_cleanup_origin_check';

  if not found then
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
      );
  else
    if v_contype <> 'c' or v_convalidated is not true then
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
  end if;
end;
$$;

create or replace function public.solo_ganadores_asset_has_active_reference(
  p_public_url text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_public_url text;
begin
  if p_public_url is null or pg_catalog.btrim(p_public_url) = '' then
    return false;
  end if;

  v_public_url := pg_catalog.split_part(pg_catalog.btrim(p_public_url), '?', 1);

  return exists (
    select 1
    from public.solo_ganadores_events as event_record
    where (
      pg_catalog.btrim(coalesce(event_record.main_image_url, '')) <> ''
      and pg_catalog.split_part(pg_catalog.btrim(coalesce(event_record.main_image_url, '')), '?', 1) = v_public_url
    )
    or (
      pg_catalog.btrim(coalesce(event_record.promo_video_url, '')) <> ''
      and pg_catalog.split_part(pg_catalog.btrim(coalesce(event_record.promo_video_url, '')), '?', 1) = v_public_url
    )
  )
  or exists (
    select 1
    from public.solo_ganadores_posts as post_record
    where (
      pg_catalog.btrim(coalesce(post_record.photo_url, '')) <> ''
      and pg_catalog.split_part(pg_catalog.btrim(coalesce(post_record.photo_url, '')), '?', 1) = v_public_url
    )
    or (
      pg_catalog.btrim(coalesce(post_record.video_url, '')) <> ''
      and pg_catalog.split_part(pg_catalog.btrim(coalesce(post_record.video_url, '')), '?', 1) = v_public_url
    )
    or (
      pg_catalog.btrim(coalesce(post_record.interview_url, '')) <> ''
      and pg_catalog.split_part(pg_catalog.btrim(coalesce(post_record.interview_url, '')), '?', 1) = v_public_url
    )
  )
  or exists (
    select 1
    from public.solo_ganadores_media as media_record
    where pg_catalog.btrim(coalesce(media_record.media_url, '')) <> ''
      and pg_catalog.split_part(pg_catalog.btrim(coalesce(media_record.media_url, '')), '?', 1) = v_public_url
  );
end;
$$;

revoke all on function public.solo_ganadores_asset_has_active_reference(text)
from public;
revoke all on function public.solo_ganadores_asset_has_active_reference(text)
from anon;
revoke all on function public.solo_ganadores_asset_has_active_reference(text)
from authenticated;
grant execute on function public.solo_ganadores_asset_has_active_reference(text)
to service_role;

comment on function public.solo_ganadores_asset_has_active_reference(text) is
  'Helper server-side para detectar referencias activas por public_url normalizada antes de preparar cleanup.';

create or replace function public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(
  p_asset_ids uuid[]
)
returns table (
  asset_id uuid,
  status text,
  cleanup_origin text,
  object_path text,
  purpose text,
  media_kind text,
  expires_at timestamptz,
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
  v_asset_id uuid;
  v_asset_count integer;
  v_distinct_count integer;
  v_expected_object_path text;
  v_normalized_public_url text;
  v_now timestamptz := pg_catalog.now();
  v_pending_ids uuid[] := array[]::uuid[];
  v_pending_count integer := 0;
  v_return_count integer;
  v_row_count integer;
  v_storage_found boolean;
  v_storage_mime text;
  v_storage_row_count integer;
  v_storage_size bigint;
  v_storage_size_text text;
  v_storage_record record;
begin
  v_asset_count := coalesce(pg_catalog.cardinality(p_asset_ids), 0);

  if v_asset_count < 1 or v_asset_count > 10 then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_asset_ids) as requested(asset_id)
    where requested.asset_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  select pg_catalog.count(distinct requested.asset_id)
  into v_distinct_count
  from pg_catalog.unnest(p_asset_ids) as requested(asset_id);

  if v_distinct_count <> v_asset_count then
    raise exception using
      errcode = 'P0001',
      message = 'ASSET_DUPLICATE';
  end if;

  for v_asset_id in
    select requested.asset_id
    from pg_catalog.unnest(p_asset_ids) as requested(asset_id)
    order by requested.asset_id
  loop
    select *
    into v_asset
    from public.solo_ganadores_assets
    where id = v_asset_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'ASSET_NOT_FOUND';
    end if;

    if v_asset.bucket <> 'solo-ganadores' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_STATE';
    end if;

    if v_asset.purpose = 'event_main_image' and v_asset.media_kind = 'image' then
      if v_asset.object_path !~ ('^eventos/' || v_asset.id::text || '\.(jpg|png|webp)$') then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_PURPOSE_MAPPING';
      end if;
    elsif v_asset.purpose = 'event_promo_video' and v_asset.media_kind = 'video' then
      if v_asset.object_path <> ('eventos/' || v_asset.id::text || '.mp4') then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_PURPOSE_MAPPING';
      end if;
    elsif v_asset.purpose = 'post_photo' and v_asset.media_kind = 'image' then
      if v_asset.object_path !~ ('^ganadores/' || v_asset.id::text || '\.(jpg|png|webp)$') then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_PURPOSE_MAPPING';
      end if;
    elsif v_asset.purpose = 'post_video' and v_asset.media_kind = 'video' then
      if v_asset.object_path <> ('ganadores/' || v_asset.id::text || '.mp4') then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_PURPOSE_MAPPING';
      end if;
    elsif v_asset.purpose = 'media_image' and v_asset.media_kind = 'image' then
      if v_asset.object_path !~ ('^galeria/' || v_asset.id::text || '\.(jpg|png|webp)$') then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_PURPOSE_MAPPING';
      end if;
    elsif v_asset.purpose = 'media_video' and v_asset.media_kind = 'video' then
      if v_asset.object_path <> ('galeria/' || v_asset.id::text || '.mp4') then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_PURPOSE_MAPPING';
      end if;
    else
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_PURPOSE_MAPPING';
    end if;

    if v_asset.public_url is null or pg_catalog.btrim(v_asset.public_url) = '' then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_STATE';
    end if;

    v_expected_object_path := '/storage/v1/object/public/solo-ganadores/' || v_asset.object_path;
    v_normalized_public_url := pg_catalog.split_part(pg_catalog.btrim(v_asset.public_url), '?', 1);

    if pg_catalog.right(v_normalized_public_url, pg_catalog.length(v_expected_object_path)) <> v_expected_object_path then
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_STATE';
    end if;

    if v_asset.status = 'pending' then
      if (
        v_asset.expires_at is null
        or v_asset.expires_at > v_now
        or v_asset.cleanup_origin is not null
        or v_asset.resource_type is not null
        or v_asset.resource_id is not null
        or v_asset.resource_field is not null
        or v_asset.deleting_at is not null
        or v_asset.deleted_at is not null
        or v_asset.cleanup_token is not null
        or v_asset.cleanup_claimed_at is not null
        or v_asset.cleanup_attempts is distinct from 0
        or v_asset.last_attempt_at is not null
        or v_asset.next_retry_at is not null
        or v_asset.last_error is not null
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_ASSET_STATE';
      end if;

      if public.solo_ganadores_asset_has_active_reference(v_asset.public_url) then
        raise exception using
          errcode = 'P0001',
          message = 'ASSET_REFERENCED';
      end if;

      v_storage_found := false;
      v_storage_row_count := 0;
      v_storage_size_text := null;
      v_storage_mime := null;

      for v_storage_record in
        select
          storage_object.metadata
        from storage.objects as storage_object
        where storage_object.bucket_id = v_asset.bucket
          and storage_object.name = v_asset.object_path
        for share
      loop
        v_storage_row_count := v_storage_row_count + 1;
        v_storage_found := true;
        v_storage_size_text := nullif(pg_catalog.btrim(v_storage_record.metadata ->> 'size'), '');
        v_storage_mime := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(
          v_storage_record.metadata ->> 'mimetype',
          v_storage_record.metadata ->> 'mimeType',
          v_storage_record.metadata ->> 'contentType',
          v_storage_record.metadata ->> 'content_type'
        ))), '');
      end loop;

      if v_storage_row_count > 1 then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_STORAGE_STATE';
      end if;

      if v_storage_found then
        if (
          v_storage_size_text is null
          or v_storage_size_text !~ '^[0-9]+$'
          or pg_catalog.length(v_storage_size_text) > 18
          or v_asset.size_bytes is null
        ) then
          raise exception using
            errcode = 'P0001',
            message = 'INVALID_STORAGE_METADATA';
        end if;

        v_storage_size := v_storage_size_text::bigint;

        if v_storage_size <> v_asset.size_bytes then
          raise exception using
            errcode = 'P0001',
            message = 'STORAGE_SIZE_MISMATCH';
        end if;

        if v_storage_mime is not null and v_storage_mime <> pg_catalog.lower(pg_catalog.btrim(v_asset.mime_type)) then
          raise exception using
            errcode = 'P0001',
            message = 'STORAGE_MIME_MISMATCH';
        end if;
      end if;

      v_pending_ids := pg_catalog.array_append(v_pending_ids, v_asset.id);
      v_pending_count := v_pending_count + 1;
    elsif v_asset.status = 'deleting' then
      if (
        v_asset.cleanup_origin is distinct from 'expired_pending'
        or v_asset.resource_type is not null
        or v_asset.resource_id is not null
        or v_asset.resource_field is not null
        or v_asset.expires_at is not null
        or v_asset.deleting_at is null
        or v_asset.deleted_at is not null
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_ASSET_STATE';
      end if;

      if (
        (v_asset.cleanup_token is null and v_asset.cleanup_claimed_at is not null)
        or (v_asset.cleanup_token is not null and v_asset.cleanup_claimed_at is null)
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'INVALID_CLAIM_STATE';
      end if;
    else
      raise exception using
        errcode = 'P0001',
        message = 'INVALID_ASSET_STATE';
    end if;
  end loop;

  if v_pending_count > 0 then
    update public.solo_ganadores_assets as asset
    set
      status = 'deleting',
      cleanup_origin = 'expired_pending',
      deleting_at = asset.expires_at,
      expires_at = null
    where asset.id = any (v_pending_ids)
      and asset.status = 'pending'
      and asset.bucket = 'solo-ganadores'
      and asset.expires_at is not null
      and asset.expires_at <= v_now
      and asset.cleanup_origin is null
      and asset.resource_type is null
      and asset.resource_id is null
      and asset.resource_field is null
      and asset.deleting_at is null
      and asset.deleted_at is null
      and asset.cleanup_token is null
      and asset.cleanup_claimed_at is null
      and asset.cleanup_attempts = 0
      and asset.last_attempt_at is null
      and asset.next_retry_at is null
      and asset.last_error is null;

    get diagnostics v_row_count = row_count;

    if v_row_count <> v_pending_count then
      raise exception using
        errcode = 'P0001',
        message = 'PREPARE_FAILED';
    end if;
  end if;

  select pg_catalog.count(*)
  into v_return_count
  from public.solo_ganadores_assets as asset
  join pg_catalog.unnest(p_asset_ids) as requested(asset_id)
    on requested.asset_id = asset.id
  where asset.status = 'deleting'
    and asset.cleanup_origin = 'expired_pending'
    and asset.resource_type is null
    and asset.resource_id is null
    and asset.resource_field is null
    and asset.expires_at is null
    and asset.deleting_at is not null
    and asset.deleted_at is null
    and (
      (
        asset.cleanup_token is null
        and asset.cleanup_claimed_at is null
      )
      or (
        asset.cleanup_token is not null
        and asset.cleanup_claimed_at is not null
      )
    );

  if v_return_count <> v_asset_count then
    raise exception using
      errcode = 'P0001',
      message = 'PREPARE_RETURN_MISMATCH';
  end if;

  return query
  select
    asset.id as asset_id,
    asset.status,
    asset.cleanup_origin,
    asset.object_path,
    asset.purpose,
    asset.media_kind,
    asset.expires_at,
    asset.deleting_at,
    asset.cleanup_token,
    asset.cleanup_claimed_at,
    asset.cleanup_attempts,
    asset.last_attempt_at,
    asset.next_retry_at,
    asset.last_error,
    case
      when asset.cleanup_token is null and asset.cleanup_claimed_at is null then 'READY_FOR_CLEANUP'::text
      when asset.cleanup_token is not null and asset.cleanup_claimed_at is not null then 'ALREADY_CLAIMED'::text
      else null::text
    end as preparation_state
  from public.solo_ganadores_assets as asset
  join pg_catalog.unnest(p_asset_ids) as requested(asset_id)
    on requested.asset_id = asset.id
  where asset.status = 'deleting'
    and asset.cleanup_origin = 'expired_pending'
    and asset.resource_type is null
    and asset.resource_id is null
    and asset.resource_field is null
    and asset.expires_at is null
    and asset.deleting_at is not null
    and asset.deleted_at is null
    and (
      (
        asset.cleanup_token is null
        and asset.cleanup_claimed_at is null
      )
      or (
        asset.cleanup_token is not null
        and asset.cleanup_claimed_at is not null
      )
    )
  order by asset.id;
end;
$$;

revoke all on function public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[])
from public;
revoke all on function public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[])
from anon;
revoke all on function public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[])
from authenticated;
grant execute on function public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[])
to service_role;

comment on function public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[]) is
  'RPC server-side para preparar assets pending vencidos auditados antes del cleanup fisico externo.';

comment on column public.solo_ganadores_assets.cleanup_origin is
  'Origen controlado de assets enviados a cleanup desde flujos no confirmados; inicialmente expired_pending.';

commit;

-- Verificacion manual posterior a ejecutar esta migracion:
--
-- 1. Columna cleanup_origin:
-- select
--   columns.data_type,
--   columns.is_nullable,
--   columns.column_default,
--   columns.is_generated,
--   columns.is_identity
-- from information_schema.columns as columns
-- where columns.table_schema = 'public'
--   and columns.table_name = 'solo_ganadores_assets'
--   and columns.column_name = 'cleanup_origin';
--
-- 2. Constraint cleanup_origin:
-- select
--   constraint_record.conname,
--   constraint_record.contype,
--   constraint_record.convalidated,
--   pg_catalog.pg_get_constraintdef(constraint_record.oid) as definition
-- from pg_catalog.pg_constraint as constraint_record
-- join pg_catalog.pg_class as relation_record
--   on relation_record.oid = constraint_record.conrelid
-- join pg_catalog.pg_namespace as namespace_record
--   on namespace_record.oid = relation_record.relnamespace
-- where namespace_record.nspname = 'public'
--   and relation_record.relname = 'solo_ganadores_assets'
--   and constraint_record.conname = 'solo_ganadores_assets_cleanup_origin_check';
--
-- 3. Security type de funciones nuevas:
-- select
--   routines.routine_schema,
--   routines.routine_name,
--   routines.security_type
-- from information_schema.routines as routines
-- where routines.routine_schema = 'public'
--   and routines.routine_name in (
--     'solo_ganadores_asset_has_active_reference',
--     'prepare_solo_ganadores_expired_pending_assets_for_cleanup'
--   );
--
-- 4. Permisos esperados:
-- public = false
-- anon = false
-- authenticated = false
-- service_role = true
-- select
--   'solo_ganadores_asset_has_active_reference(text)' as function_name,
--   has_function_privilege('public', 'public.solo_ganadores_asset_has_active_reference(text)', 'execute') as public,
--   has_function_privilege('anon', 'public.solo_ganadores_asset_has_active_reference(text)', 'execute') as anon,
--   has_function_privilege('authenticated', 'public.solo_ganadores_asset_has_active_reference(text)', 'execute') as authenticated,
--   has_function_privilege('service_role', 'public.solo_ganadores_asset_has_active_reference(text)', 'execute') as service_role
-- union all
-- select
--   'prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[])' as function_name,
--   has_function_privilege('public', 'public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[])', 'execute') as public,
--   has_function_privilege('anon', 'public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[])', 'execute') as anon,
--   has_function_privilege('authenticated', 'public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[])', 'execute') as authenticated,
--   has_function_privilege('service_role', 'public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[])', 'execute') as service_role;
--
-- 5. Firma claim actual sin cambios:
-- select
--   pg_catalog.pg_get_function_identity_arguments(procedure_record.oid) as arguments
-- from pg_catalog.pg_proc as procedure_record
-- join pg_catalog.pg_namespace as namespace_record
--   on namespace_record.oid = procedure_record.pronamespace
-- where namespace_record.nspname = 'public'
--   and procedure_record.proname = 'claim_solo_ganadores_assets_for_cleanup';
--
-- 6. Verificar que los siete assets siguen pending antes de preparar:
-- select
--   asset.id,
--   asset.status,
--   asset.cleanup_origin,
--   asset.resource_type,
--   asset.resource_id,
--   asset.resource_field,
--   asset.bucket,
--   asset.object_path,
--   asset.public_url,
--   asset.purpose,
--   asset.media_kind,
--   asset.size_bytes,
--   asset.mime_type,
--   asset.expires_at,
--   asset.deleting_at,
--   asset.cleanup_token,
--   asset.cleanup_claimed_at,
--   asset.cleanup_attempts,
--   asset.last_attempt_at,
--   asset.next_retry_at,
--   asset.last_error
-- from public.solo_ganadores_assets as asset
-- where asset.id = any (array[
--   '80f62e6a-6929-4fb1-bf8c-75d1d157949b'::uuid,
--   'f1648c6c-7d33-4ef6-8b84-abbe7e292f93'::uuid,
--   '7ac93379-e2c9-4f52-aa4f-58814539544b'::uuid,
--   '931693e2-dc08-462f-9f29-c60f3b24d57e'::uuid,
--   '05989b68-b4bd-4e6e-bfdb-ce285a1666fe'::uuid,
--   '6d2d46aa-be1a-426b-9614-dbbd36ae88f1'::uuid,
--   '68313c0f-7884-4a61-ad92-f51a232a5531'::uuid
-- ]::uuid[])
-- order by asset.id;
--
-- 7. Preparar manualmente los siete assets auditados:
-- select *
-- from public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(array[
--   '80f62e6a-6929-4fb1-bf8c-75d1d157949b'::uuid,
--   'f1648c6c-7d33-4ef6-8b84-abbe7e292f93'::uuid,
--   '7ac93379-e2c9-4f52-aa4f-58814539544b'::uuid,
--   '931693e2-dc08-462f-9f29-c60f3b24d57e'::uuid,
--   '05989b68-b4bd-4e6e-bfdb-ce285a1666fe'::uuid,
--   '6d2d46aa-be1a-426b-9614-dbbd36ae88f1'::uuid,
--   '68313c0f-7884-4a61-ad92-f51a232a5531'::uuid
-- ]::uuid[]);
--
-- 8. Verificar exactamente siete filas preparadas despues de la llamada manual:
-- with prepared as (
--   select *
--   from public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(array[
--     '80f62e6a-6929-4fb1-bf8c-75d1d157949b'::uuid,
--     'f1648c6c-7d33-4ef6-8b84-abbe7e292f93'::uuid,
--     '7ac93379-e2c9-4f52-aa4f-58814539544b'::uuid,
--     '931693e2-dc08-462f-9f29-c60f3b24d57e'::uuid,
--     '05989b68-b4bd-4e6e-bfdb-ce285a1666fe'::uuid,
--     '6d2d46aa-be1a-426b-9614-dbbd36ae88f1'::uuid,
--     '68313c0f-7884-4a61-ad92-f51a232a5531'::uuid
--   ]::uuid[])
-- )
-- select
--   pg_catalog.count(*) = 7 as exactly_seven_rows,
--   pg_catalog.bool_and(status = 'deleting') as all_deleting,
--   pg_catalog.bool_and(cleanup_origin = 'expired_pending') as all_expired_pending,
--   pg_catalog.bool_and(expires_at is null) as all_expires_at_null,
--   pg_catalog.bool_and(deleting_at is not null) as all_deleting_at_present,
--   pg_catalog.bool_and(preparation_state in ('READY_FOR_CLEANUP', 'ALREADY_CLAIMED')) as all_states_valid
-- from prepared
-- join public.solo_ganadores_assets as asset
--   on asset.id = prepared.asset_id
-- where asset.resource_type is null
--   and asset.resource_id is null
--   and asset.resource_field is null;

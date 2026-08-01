--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: _solo_ganadores_clean_optional_text(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_clean_optional_text(p_value text, p_max_length integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: _solo_ganadores_clean_optional_url(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_clean_optional_url(p_value text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: _solo_ganadores_confirm_asset(uuid, text, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_confirm_asset(p_asset_id uuid, p_resource_type text, p_resource_id uuid, p_resource_field text, p_now timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: _solo_ganadores_jsonb_boolean(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_jsonb_boolean(p_data jsonb, p_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  return pg_catalog.jsonb_typeof(p_data -> p_key) = 'boolean';
end;
$$;


--
-- Name: _solo_ganadores_jsonb_has_exact_keys(jsonb, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_jsonb_has_exact_keys(p_data jsonb, p_keys text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: _solo_ganadores_jsonb_optional_date(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_jsonb_optional_date(p_data jsonb, p_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: _solo_ganadores_jsonb_optional_string(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_jsonb_optional_string(p_data jsonb, p_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_type text;
begin
  v_type := pg_catalog.jsonb_typeof(p_data -> p_key);
  return v_type = 'string' or v_type = 'null';
end;
$$;


--
-- Name: _solo_ganadores_jsonb_optional_uuid(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_jsonb_optional_uuid(p_data jsonb, p_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: _solo_ganadores_jsonb_string(jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_jsonb_string(p_data jsonb, p_key text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  return pg_catalog.jsonb_typeof(p_data -> p_key) = 'string';
end;
$$;


--
-- Name: _solo_ganadores_lock_assets(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_lock_assets(p_asset_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: _solo_ganadores_media_expected_asset(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_media_expected_asset(p_media_type text) RETURNS text[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: _solo_ganadores_release_asset(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_release_asset(p_asset_id uuid, p_now timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: solo_ganadores_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solo_ganadores_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bucket text DEFAULT 'solo-ganadores'::text NOT NULL,
    object_path text NOT NULL,
    public_url text NOT NULL,
    media_kind text NOT NULL,
    purpose text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    resource_type text,
    resource_id uuid,
    resource_field text,
    mime_type text NOT NULL,
    size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    confirmed_at timestamp with time zone,
    expires_at timestamp with time zone,
    deleting_at timestamp with time zone,
    deleted_at timestamp with time zone,
    last_error text,
    cleanup_token uuid,
    cleanup_claimed_at timestamp with time zone,
    cleanup_attempts integer DEFAULT 0 NOT NULL,
    last_attempt_at timestamp with time zone,
    next_retry_at timestamp with time zone,
    cleanup_origin text,
    CONSTRAINT solo_ganadores_assets_bucket_check CHECK ((bucket = 'solo-ganadores'::text)),
    CONSTRAINT solo_ganadores_assets_cleanup_attempts_check CHECK ((cleanup_attempts >= 0)),
    CONSTRAINT solo_ganadores_assets_cleanup_claim_pair_check CHECK ((((cleanup_token IS NULL) AND (cleanup_claimed_at IS NULL)) OR ((cleanup_token IS NOT NULL) AND (cleanup_claimed_at IS NOT NULL)))),
    CONSTRAINT solo_ganadores_assets_cleanup_claim_status_check CHECK (((cleanup_token IS NULL) OR ((status = 'deleting'::text) AND (deleted_at IS NULL) AND (deleting_at IS NOT NULL)))),
    CONSTRAINT solo_ganadores_assets_cleanup_origin_check CHECK (((cleanup_origin IS NULL) OR ((cleanup_origin = 'expired_pending'::text) AND (status = ANY (ARRAY['deleting'::text, 'deleted'::text, 'failed'::text])) AND (resource_type IS NULL) AND (resource_id IS NULL) AND (resource_field IS NULL)) OR ((cleanup_origin = 'orphan_storage'::text) AND (status = ANY (ARRAY['deleting'::text, 'deleted'::text, 'failed'::text])) AND (resource_type IS NULL) AND (resource_id IS NULL) AND (resource_field IS NULL) AND (confirmed_at IS NULL) AND (expires_at IS NULL)))),
    CONSTRAINT solo_ganadores_assets_last_error_check CHECK (((last_error IS NULL) OR (char_length(last_error) <= 500))),
    CONSTRAINT solo_ganadores_assets_media_kind_check CHECK ((media_kind = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT solo_ganadores_assets_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'video/mp4'::text]))),
    CONSTRAINT solo_ganadores_assets_orphan_storage_identity_check CHECK (((cleanup_origin IS DISTINCT FROM 'orphan_storage'::text) OR ((status = ANY (ARRAY['deleting'::text, 'deleted'::text, 'failed'::text])) AND (resource_type IS NULL) AND (resource_id IS NULL) AND (resource_field IS NULL) AND (confirmed_at IS NULL) AND (expires_at IS NULL) AND (((id = 'b5b0a1e1-0001-4653-8000-000000000001'::uuid) AND (bucket = 'solo-ganadores'::text) AND (object_path = 'eventos/1777230507968-1.jpg'::text) AND (public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777230507968-1.jpg'::text) AND (purpose = 'event_main_image'::text) AND (media_kind = 'image'::text) AND (mime_type = 'image/jpeg'::text) AND (size_bytes = (512994)::bigint) AND (created_at = '2026-04-26 19:08:30.406102+00'::timestamp with time zone)) OR ((id = 'b5b0a1e1-0002-4653-8000-000000000002'::uuid) AND (bucket = 'solo-ganadores'::text) AND (object_path = 'eventos/1777239894050-1.jpg'::text) AND (public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777239894050-1.jpg'::text) AND (purpose = 'event_main_image'::text) AND (media_kind = 'image'::text) AND (mime_type = 'image/jpeg'::text) AND (size_bytes = (512994)::bigint) AND (created_at = '2026-04-26 21:44:56.987563+00'::timestamp with time zone)) OR ((id = 'b5b0a1e1-0003-4653-8000-000000000003'::uuid) AND (bucket = 'solo-ganadores'::text) AND (object_path = 'ganadores/1777239961367-images.jpg'::text) AND (public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777239961367-images.jpg'::text) AND (purpose = 'post_photo'::text) AND (media_kind = 'image'::text) AND (mime_type = 'image/jpeg'::text) AND (size_bytes = (13174)::bigint) AND (created_at = '2026-04-26 21:46:02.932489+00'::timestamp with time zone)) OR ((id = '030b82e0-c2a1-4907-914f-026d74a65f86'::uuid) AND (bucket = 'solo-ganadores'::text) AND (object_path = 'eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg'::text) AND (public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/030b82e0-c2a1-4907-914f-026d74a65f86.jpg'::text) AND (purpose = 'event_main_image'::text) AND (media_kind = 'image'::text) AND (mime_type = 'image/jpeg'::text) AND (size_bytes = (112623)::bigint) AND (created_at = '2026-07-17 22:07:42.009513+00'::timestamp with time zone)) OR ((id = 'eed877cd-4c99-46ea-9ae0-c17d9c06f387'::uuid) AND (bucket = 'solo-ganadores'::text) AND (object_path = 'ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png'::text) AND (public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/eed877cd-4c99-46ea-9ae0-c17d9c06f387.png'::text) AND (purpose = 'post_photo'::text) AND (media_kind = 'image'::text) AND (mime_type = 'image/png'::text) AND (size_bytes = (585587)::bigint) AND (created_at = '2026-07-17 22:14:16.450955+00'::timestamp with time zone)) OR ((id = 'dca21711-3629-42b3-ba82-9571d9506f3a'::uuid) AND (bucket = 'solo-ganadores'::text) AND (object_path = 'galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png'::text) AND (public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/dca21711-3629-42b3-ba82-9571d9506f3a.png'::text) AND (purpose = 'media_image'::text) AND (media_kind = 'image'::text) AND (mime_type = 'image/png'::text) AND (size_bytes = (12552)::bigint) AND (created_at = '2026-07-17 22:16:38.173796+00'::timestamp with time zone)) OR ((id = 'af2b1e2e-2e20-4d71-947a-5500f59e78db'::uuid) AND (bucket = 'solo-ganadores'::text) AND (object_path = 'eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4'::text) AND (public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/af2b1e2e-2e20-4d71-947a-5500f59e78db.mp4'::text) AND (purpose = 'event_promo_video'::text) AND (media_kind = 'video'::text) AND (mime_type = 'video/mp4'::text) AND (size_bytes = (2779345)::bigint) AND (created_at = '2026-07-18 04:36:48.081828+00'::timestamp with time zone)) OR ((id = '2ae854b9-0020-4b94-84b7-051c02ea2a08'::uuid) AND (bucket = 'solo-ganadores'::text) AND (object_path = 'ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4'::text) AND (public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/2ae854b9-0020-4b94-84b7-051c02ea2a08.mp4'::text) AND (purpose = 'post_video'::text) AND (media_kind = 'video'::text) AND (mime_type = 'video/mp4'::text) AND (size_bytes = (2779345)::bigint) AND (created_at = '2026-07-18 04:45:52.366892+00'::timestamp with time zone)) OR ((id = '9cb353f8-d5b6-45c0-8d17-ddec6973d2d4'::uuid) AND (bucket = 'solo-ganadores'::text) AND (object_path = 'galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4'::text) AND (public_url = 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/9cb353f8-d5b6-45c0-8d17-ddec6973d2d4.mp4'::text) AND (purpose = 'media_video'::text) AND (media_kind = 'video'::text) AND (mime_type = 'video/mp4'::text) AND (size_bytes = (2779345)::bigint) AND (created_at = '2026-07-18 04:47:55.031218+00'::timestamp with time zone)))))),
    CONSTRAINT solo_ganadores_assets_owner_completeness_check CHECK ((((resource_type IS NULL) AND (resource_id IS NULL) AND (resource_field IS NULL)) OR ((resource_type IS NOT NULL) AND (resource_id IS NOT NULL) AND (resource_field IS NOT NULL)))),
    CONSTRAINT solo_ganadores_assets_public_url_check CHECK (((public_url ~~ 'https://%'::text) AND (public_url !~ '\s'::text) AND (char_length(public_url) <= 2048))),
    CONSTRAINT solo_ganadores_assets_purpose_check CHECK ((purpose = ANY (ARRAY['event_main_image'::text, 'event_promo_video'::text, 'post_photo'::text, 'post_video'::text, 'media_image'::text, 'media_video'::text]))),
    CONSTRAINT solo_ganadores_assets_purpose_mapping_check CHECK ((((purpose = 'event_main_image'::text) AND (media_kind = 'image'::text) AND ((resource_type IS NULL) OR (resource_type = 'event'::text)) AND ((resource_field IS NULL) OR (resource_field = 'main_image_url'::text)) AND (((mime_type = 'image/jpeg'::text) AND (object_path ~ '^eventos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'::text)) OR ((mime_type = 'image/png'::text) AND (object_path ~ '^eventos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$'::text)) OR ((mime_type = 'image/webp'::text) AND (object_path ~ '^eventos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'::text)))) OR ((purpose = 'event_promo_video'::text) AND (media_kind = 'video'::text) AND ((resource_type IS NULL) OR (resource_type = 'event'::text)) AND ((resource_field IS NULL) OR (resource_field = 'promo_video_url'::text)) AND (object_path ~ '^eventos/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'::text) AND (mime_type = 'video/mp4'::text)) OR ((purpose = 'post_photo'::text) AND (media_kind = 'image'::text) AND ((resource_type IS NULL) OR (resource_type = 'post'::text)) AND ((resource_field IS NULL) OR (resource_field = 'photo_url'::text)) AND (((mime_type = 'image/jpeg'::text) AND (object_path ~ '^ganadores/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'::text)) OR ((mime_type = 'image/png'::text) AND (object_path ~ '^ganadores/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$'::text)) OR ((mime_type = 'image/webp'::text) AND (object_path ~ '^ganadores/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'::text)))) OR ((purpose = 'post_video'::text) AND (media_kind = 'video'::text) AND ((resource_type IS NULL) OR (resource_type = 'post'::text)) AND ((resource_field IS NULL) OR (resource_field = 'video_url'::text)) AND (object_path ~ '^ganadores/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'::text) AND (mime_type = 'video/mp4'::text)) OR ((purpose = 'media_image'::text) AND (media_kind = 'image'::text) AND ((resource_type IS NULL) OR (resource_type = 'media'::text)) AND ((resource_field IS NULL) OR (resource_field = 'media_url'::text)) AND (((mime_type = 'image/jpeg'::text) AND (object_path ~ '^galeria/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$'::text)) OR ((mime_type = 'image/png'::text) AND (object_path ~ '^galeria/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$'::text)) OR ((mime_type = 'image/webp'::text) AND (object_path ~ '^galeria/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'::text)))) OR ((purpose = 'media_video'::text) AND (media_kind = 'video'::text) AND ((resource_type IS NULL) OR (resource_type = 'media'::text)) AND ((resource_field IS NULL) OR (resource_field = 'media_url'::text)) AND (object_path ~ '^galeria/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$'::text) AND (mime_type = 'video/mp4'::text)) OR ((NOT (purpose IS DISTINCT FROM 'event_main_image'::text)) AND (NOT (media_kind IS DISTINCT FROM 'image'::text)) AND (NOT (mime_type IS DISTINCT FROM 'image/jpeg'::text)) AND (status IS NOT NULL) AND (status = ANY (ARRAY['confirmed'::text, 'deleting'::text, 'deleted'::text, 'failed'::text])) AND (cleanup_origin IS NULL) AND (NOT (resource_type IS DISTINCT FROM 'event'::text)) AND (NOT (resource_id IS DISTINCT FROM '34ee17ef-f619-412a-9b2f-6cbbf9d19e84'::uuid)) AND (NOT (resource_field IS DISTINCT FROM 'main_image_url'::text)) AND (NOT (object_path IS DISTINCT FROM 'eventos/1777247882007-1.jpg'::text)) AND (NOT (public_url IS DISTINCT FROM 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777247882007-1.jpg'::text))) OR ((NOT (purpose IS DISTINCT FROM 'post_photo'::text)) AND (NOT (media_kind IS DISTINCT FROM 'image'::text)) AND (NOT (mime_type IS DISTINCT FROM 'image/jpeg'::text)) AND (status IS NOT NULL) AND (status = ANY (ARRAY['confirmed'::text, 'deleting'::text, 'deleted'::text, 'failed'::text])) AND (cleanup_origin IS NULL) AND (NOT (resource_type IS DISTINCT FROM 'post'::text)) AND (NOT (resource_id IS DISTINCT FROM '3515459c-d423-4675-9ce8-26d67e0f3ae1'::uuid)) AND (NOT (resource_field IS DISTINCT FROM 'photo_url'::text)) AND (NOT (object_path IS DISTINCT FROM 'ganadores/1777250755974-camones-2-300x200.jpg'::text)) AND (NOT (public_url IS DISTINCT FROM 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777250755974-camones-2-300x200.jpg'::text))) OR ((NOT (purpose IS DISTINCT FROM 'media_image'::text)) AND (NOT (media_kind IS DISTINCT FROM 'image'::text)) AND (NOT (mime_type IS DISTINCT FROM 'image/jpeg'::text)) AND (status IS NOT NULL) AND (status = ANY (ARRAY['confirmed'::text, 'deleting'::text, 'deleted'::text, 'failed'::text])) AND (cleanup_origin IS NULL) AND (NOT (resource_type IS DISTINCT FROM 'media'::text)) AND (NOT (resource_id IS DISTINCT FROM '75439f96-ac27-4497-8c24-b7af747378f1'::uuid)) AND (NOT (resource_field IS DISTINCT FROM 'media_url'::text)) AND (NOT (object_path IS DISTINCT FROM 'galeria/1777232612501-camones-2-300x200.jpg'::text)) AND (NOT (public_url IS DISTINCT FROM 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/galeria/1777232612501-camones-2-300x200.jpg'::text))) OR ((NOT (cleanup_origin IS DISTINCT FROM 'orphan_storage'::text)) AND (status IS NOT NULL) AND (status = ANY (ARRAY['deleting'::text, 'deleted'::text, 'failed'::text])) AND (resource_type IS NULL) AND (resource_id IS NULL) AND (resource_field IS NULL) AND (confirmed_at IS NULL) AND (expires_at IS NULL) AND (NOT (purpose IS DISTINCT FROM 'event_main_image'::text)) AND (NOT (media_kind IS DISTINCT FROM 'image'::text)) AND (NOT (mime_type IS DISTINCT FROM 'image/jpeg'::text)) AND (NOT (size_bytes IS DISTINCT FROM (512994)::bigint)) AND (NOT (created_at IS DISTINCT FROM '2026-04-26 19:08:30.406102+00'::timestamp with time zone)) AND (NOT (object_path IS DISTINCT FROM 'eventos/1777230507968-1.jpg'::text)) AND (NOT (public_url IS DISTINCT FROM 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777230507968-1.jpg'::text))) OR ((NOT (cleanup_origin IS DISTINCT FROM 'orphan_storage'::text)) AND (status IS NOT NULL) AND (status = ANY (ARRAY['deleting'::text, 'deleted'::text, 'failed'::text])) AND (resource_type IS NULL) AND (resource_id IS NULL) AND (resource_field IS NULL) AND (confirmed_at IS NULL) AND (expires_at IS NULL) AND (NOT (purpose IS DISTINCT FROM 'event_main_image'::text)) AND (NOT (media_kind IS DISTINCT FROM 'image'::text)) AND (NOT (mime_type IS DISTINCT FROM 'image/jpeg'::text)) AND (NOT (size_bytes IS DISTINCT FROM (512994)::bigint)) AND (NOT (created_at IS DISTINCT FROM '2026-04-26 21:44:56.987563+00'::timestamp with time zone)) AND (NOT (object_path IS DISTINCT FROM 'eventos/1777239894050-1.jpg'::text)) AND (NOT (public_url IS DISTINCT FROM 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/eventos/1777239894050-1.jpg'::text))) OR ((NOT (cleanup_origin IS DISTINCT FROM 'orphan_storage'::text)) AND (status IS NOT NULL) AND (status = ANY (ARRAY['deleting'::text, 'deleted'::text, 'failed'::text])) AND (resource_type IS NULL) AND (resource_id IS NULL) AND (resource_field IS NULL) AND (confirmed_at IS NULL) AND (expires_at IS NULL) AND (NOT (purpose IS DISTINCT FROM 'post_photo'::text)) AND (NOT (media_kind IS DISTINCT FROM 'image'::text)) AND (NOT (mime_type IS DISTINCT FROM 'image/jpeg'::text)) AND (NOT (size_bytes IS DISTINCT FROM (13174)::bigint)) AND (NOT (created_at IS DISTINCT FROM '2026-04-26 21:46:02.932489+00'::timestamp with time zone)) AND (NOT (object_path IS DISTINCT FROM 'ganadores/1777239961367-images.jpg'::text)) AND (NOT (public_url IS DISTINCT FROM 'https://rqirkysmcdgoqnkonlrp.supabase.co/storage/v1/object/public/solo-ganadores/ganadores/1777239961367-images.jpg'::text))))),
    CONSTRAINT solo_ganadores_assets_resource_field_check CHECK (((resource_field IS NULL) OR (resource_field = ANY (ARRAY['main_image_url'::text, 'promo_video_url'::text, 'photo_url'::text, 'video_url'::text, 'media_url'::text])))),
    CONSTRAINT solo_ganadores_assets_resource_type_check CHECK (((resource_type IS NULL) OR (resource_type = ANY (ARRAY['event'::text, 'post'::text, 'media'::text])))),
    CONSTRAINT solo_ganadores_assets_size_bytes_check CHECK (((size_bytes IS NULL) OR ((size_bytes > 0) AND (((media_kind = 'image'::text) AND (size_bytes <= ((5 * 1024) * 1024))) OR ((media_kind = 'video'::text) AND (size_bytes <= ((45 * 1024) * 1024))))))),
    CONSTRAINT solo_ganadores_assets_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'deleting'::text, 'deleted'::text, 'failed'::text]))),
    CONSTRAINT solo_ganadores_assets_status_owner_check CHECK ((((status = 'pending'::text) AND (resource_type IS NULL) AND (resource_id IS NULL) AND (resource_field IS NULL) AND (expires_at IS NOT NULL) AND (confirmed_at IS NULL) AND (deleting_at IS NULL) AND (deleted_at IS NULL)) OR ((status = 'confirmed'::text) AND (resource_type IS NOT NULL) AND (resource_id IS NOT NULL) AND (resource_field IS NOT NULL) AND (confirmed_at IS NOT NULL) AND (deleting_at IS NULL) AND (deleted_at IS NULL)) OR ((status = 'deleting'::text) AND (deleting_at IS NOT NULL) AND (deleted_at IS NULL)) OR ((status = 'deleted'::text) AND (deleting_at IS NOT NULL) AND (deleted_at IS NOT NULL)) OR ((status = 'failed'::text) AND (deleted_at IS NULL))))
);


--
-- Name: _solo_ganadores_require_current_asset(uuid, uuid, text, uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_require_current_asset(p_found_asset_id uuid, p_expected_asset_id uuid, p_resource_type text, p_resource_id uuid, p_resource_field text, p_expected_purpose text, p_expected_kind text, p_current_url text) RETURNS public.solo_ganadores_assets
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: _solo_ganadores_require_pending_asset(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_require_pending_asset(p_asset_id uuid, p_expected_purpose text, p_expected_kind text) RETURNS public.solo_ganadores_assets
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: _solo_ganadores_require_pending_asset_for_update(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_require_pending_asset_for_update(p_asset_id uuid, p_expected_purpose text, p_expected_kind text) RETURNS public.solo_ganadores_assets
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: _solo_ganadores_require_text(text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_require_text(p_value text, p_max_length integer) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: _solo_ganadores_require_url(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_require_url(p_value text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: _solo_ganadores_validate_action(text, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._solo_ganadores_validate_action(p_action text, p_current_asset_id uuid, p_new_asset_id uuid, p_allow_clear boolean) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: activate_current_month_round(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_current_month_round() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    this_month TEXT;
    target_round TEXT;
BEGIN
    this_month := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    
    -- Buscar la ronda global que corresponde al número de mes
    -- (Esto es un ejemplo, ajusta según tu lógica de negocio)
    
    -- Por ahora, simplemente mantenemos la lógica de activación
    -- pero aseguramos que no toque vote_parties
    
    RAISE NOTICE 'Activación de ronda ejecutada correctamente';
END;
$$;


--
-- Name: activate_next_weekly_topic(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_next_weekly_topic() RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  next_topic record;
begin
  -- Solo activa uno nuevo si no existe ya un tema active
  if exists (
    select 1
    from public.weekly_topics
    where status = 'active'
  ) then
    return;
  end if;

  -- Busca el siguiente tema en cola
  select *
  into next_topic
  from public.weekly_topics_queue
  where status = 'queued'
  order by starts_at asc, created_at asc
  limit 1;

  if not found then
    return;
  end if;

  -- Lo inserta como tema semanal activo
  insert into public.weekly_topics (
    topic,
    question,
    status,
    starts_at,
    ends_at
  )
  values (
    next_topic.topic,
    next_topic.question,
    'active',
    next_topic.starts_at,
    next_topic.ends_at
  );

  -- Marca el tema de la cola como usado
  update public.weekly_topics_queue
  set status = 'activated'
  where id = next_topic.id;
end;
$$;


--
-- Name: activate_vote_round_draft(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.activate_vote_round_draft(p_round_id uuid) RETURNS TABLE(id uuid, name text, group_code text, identity_mode text, ends_at timestamp with time zone, is_active boolean, lifecycle_state text, created_at timestamp with time zone, activated_at timestamp with time zone, closed_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  v_round public.vote_rounds%rowtype;
  v_group_code text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  select r.*
    into v_round
  from public.vote_rounds r
  where r.id = p_round_id;

  if not found then
    raise exception 'vote_round_not_found';
  end if;

  v_group_code := v_round.group_code;

  if v_group_code is null or v_group_code !~ '^GRUPO[A-Z]$' then
    raise exception 'vote_round_group_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voto-claro:vote-round:' || v_group_code, 0)
  );

  select r.*
    into v_round
  from public.vote_rounds r
  where r.id = p_round_id
  for update;

  if not found then
    raise exception 'vote_round_not_found';
  end if;

  if v_round.group_code is distinct from v_group_code then
    raise exception 'vote_round_group_invalid';
  end if;

  perform 1
  from public.vote_rounds r
  where r.group_code = v_group_code
    and r.is_active = true
  for update;

  if v_round.lifecycle_state <> 'draft' then
    raise exception 'vote_round_not_draft';
  end if;

  if v_round.is_active <> false then
    raise exception 'vote_round_state_invalid';
  end if;

  if v_round.identity_mode not in ('legacy_device', 'secure_session') then
    raise exception 'vote_round_identity_mode_invalid';
  end if;

  if v_round.identity_mode = 'legacy_device' and v_round.ends_at is not null then
    raise exception 'vote_round_ends_at_invalid';
  end if;

  if v_round.identity_mode = 'secure_session' then
    if v_round.ends_at is null or v_round.ends_at <= v_now or v_round.ends_at <= v_round.created_at then
      raise exception 'vote_round_ends_at_invalid';
    end if;
  end if;

  if exists (
    select 1
    from public.vote_round_sessions s
    where s.round_id = p_round_id
    limit 1
  ) then
    raise exception 'vote_round_has_sessions';
  end if;

  if exists (
    select 1
    from public.vote_casts c
    where c.round_id = p_round_id
    limit 1
  ) then
    raise exception 'vote_round_has_casts';
  end if;

  if exists (
    select 1
    from public.vote_intention_answers a
    where a.round_id = p_round_id
    limit 1
  ) then
    raise exception 'vote_round_has_answers';
  end if;

  if not exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_round_id
      and p.group_code = v_group_code
      and p.enabled = true
    limit 1
  ) then
    raise exception 'vote_round_party_catalog_unavailable';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_round_id
      and p.group_code is distinct from v_group_code
    limit 1
  ) then
    raise exception 'vote_round_party_catalog_invalid';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_round_id
      and (p.slug is null or pg_catalog.btrim(p.slug) = '')
    limit 1
  ) then
    raise exception 'vote_round_party_catalog_invalid';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_round_id
    group by p.round_id, p.group_code, p.slug
    having count(*) > 1
  ) then
    raise exception 'vote_round_party_catalog_invalid';
  end if;

  with deactivated as (
    update public.vote_rounds r
       set is_active = false,
           lifecycle_state = case
             when r.lifecycle_state = 'active' then 'closed'
             else r.lifecycle_state
           end,
           closed_at = case
             when r.lifecycle_state = 'active' then v_now
             else r.closed_at
           end
     where r.group_code = v_group_code
       and r.is_active = true
       and r.id <> p_round_id
     returning r.id
  )
  update public.vote_round_sessions s
     set revoked_at = v_now
    from deactivated d
   where s.round_id = d.id
     and s.revoked_at is null;

  update public.vote_rounds r
     set is_active = true,
         lifecycle_state = 'active',
         activated_at = v_now,
         closed_at = null
   where r.id = p_round_id;

  return query
  select
    r.id,
    r.name::text,
    r.group_code::text,
    r.identity_mode::text,
    r.ends_at,
    r.is_active,
    r.lifecycle_state::text,
    r.created_at,
    r.activated_at,
    r.closed_at
  from public.vote_rounds r
  where r.id = p_round_id;
end;
$_$;


--
-- Name: advance_weekly_topics_cycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.advance_weekly_topics_cycle() RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  topic_row record;
begin
  -- 1. Temas activos cuya semana terminó pasan a voting
  update public.weekly_topics
  set status = 'voting'
  where status = 'active'
    and ends_at < now();

  -- 2. Temas en voting cuya votación ya terminó publican ganador y pasan a archived
  for topic_row in
    select id
    from public.weekly_topics
    where status = 'voting'
      and ends_at < now() - interval '7 days'
  loop
    perform public.publish_weekly_winner_for_topic(topic_row.id);
  end loop;

  -- 3. Si ya no existe tema active, activa el siguiente desde la cola
  perform public.activate_next_weekly_topic();
end;
$$;


--
-- Name: block_forum_bad_words(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_forum_bad_words() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if public.vc_has_banned_words(new.message) then
    raise exception 'FORUM_BAD_WORDS_BLOCKED';
  end if;

  return new;
end;
$$;


--
-- Name: can_user_comment(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_user_comment(p_user_id uuid) RETURNS TABLE(can_comment boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    (COUNT(*) < 5) AS can_comment
  FROM archived_topic_forum_comments
  WHERE access_participant_id = p_user_id
    AND created_at > NOW() - INTERVAL '1 hour';
END;
$$;


--
-- Name: can_user_comment_user_comments(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_user_comment_user_comments(p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    comment_count int;
BEGIN
    SELECT COUNT(*)
    INTO comment_count
    FROM user_comments
    WHERE access_participant_id = p_user_id
      AND created_at > NOW() - INTERVAL '1 hour';

    RETURN comment_count = 0;
END;
$$;


--
-- Name: can_user_win_quarterly_award(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_user_win_quarterly_award(p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    award_count int;
BEGIN
    SELECT COUNT(*)
    INTO award_count
    FROM comment_awards
    WHERE access_participant_id = p_user_id
      AND award_year = EXTRACT(YEAR FROM NOW())
      AND award_quarter = EXTRACT(QUARTER FROM NOW());

    RETURN award_count = 0;
END;
$$;


--
-- Name: check_candidate_panel_pin_rate_limit(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_candidate_panel_pin_rate_limit(p_candidate_id text, p_ip_fingerprint text) RETURNS TABLE(allowed boolean, blocked_until timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_now timestamptz := pg_catalog.now();
  v_row public.candidate_panel_pin_attempts%rowtype;
begin
  if pg_catalog.length(pg_catalog.btrim(p_candidate_id)) = 0
     or pg_catalog.length(pg_catalog.btrim(p_ip_fingerprint)) = 0 then
    allowed := false;
    blocked_until := null;
    return next;
    return;
  end if;

  insert into public.candidate_panel_pin_attempts (
    candidate_id,
    ip_fingerprint,
    window_started_at,
    failed_count,
    updated_at
  )
  values (
    p_candidate_id,
    p_ip_fingerprint,
    v_now,
    0,
    v_now
  )
  on conflict (candidate_id, ip_fingerprint) do nothing;

  select *
    into v_row
    from public.candidate_panel_pin_attempts
   where candidate_id = p_candidate_id
     and ip_fingerprint = p_ip_fingerprint
   for update;

  if v_row.blocked_until is not null and v_row.blocked_until > v_now then
    allowed := false;
    blocked_until := v_row.blocked_until;
    return next;
    return;
  end if;

  if v_row.window_started_at <= v_now - interval '10 minutes' then
    update public.candidate_panel_pin_attempts
       set window_started_at = v_now,
           failed_count = 0,
           blocked_until = null,
           updated_at = v_now
     where id = v_row.id;
  end if;

  allowed := true;
  blocked_until := null;
  return next;
end;
$$;


--
-- Name: claim_solo_ganadores_assets_for_cleanup(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_solo_ganadores_assets_for_cleanup(p_limit integer, p_grace_seconds integer, p_claim_ttl_seconds integer) RETURNS TABLE(asset_id uuid, cleanup_token uuid, bucket text, object_path text, public_url text, resource_type text, resource_id uuid, resource_field text, purpose text, media_kind text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_now timestamptz := pg_catalog.now();
begin
  if (
    p_limit is null
    or p_limit < 1
    or p_limit > 10
    or p_grace_seconds is null
    or p_grace_seconds < 0
    or p_grace_seconds > 604800
    or p_claim_ttl_seconds is null
    or p_claim_ttl_seconds < 60
    or p_claim_ttl_seconds > 3600
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  return query
  with candidates as (
    select asset.id
    from public.solo_ganadores_assets as asset
    where asset.status = 'deleting'
      and asset.deleted_at is null
      and asset.deleting_at is not null
      and asset.deleting_at <= v_now - pg_catalog.make_interval(secs => p_grace_seconds)
      and (
        asset.next_retry_at is null
        or asset.next_retry_at <= v_now
      )
      and (
        asset.cleanup_token is null
        or asset.cleanup_claimed_at <= v_now - pg_catalog.make_interval(secs => p_claim_ttl_seconds)
      )
    order by asset.deleting_at, asset.id
    for update skip locked
    limit p_limit
  ),
  tokens as (
    select
      candidates.id,
      extensions.gen_random_uuid() as token
    from candidates
  ),
  claimed as (
    update public.solo_ganadores_assets as asset
    set
      cleanup_token = tokens.token,
      cleanup_claimed_at = v_now,
      cleanup_attempts = asset.cleanup_attempts + 1,
      last_attempt_at = v_now,
      next_retry_at = null
    from tokens
    where asset.id = tokens.id
      and asset.status = 'deleting'
      and asset.deleted_at is null
      and asset.deleting_at is not null
    returning
      asset.id as asset_id,
      asset.cleanup_token,
      asset.bucket,
      asset.object_path,
      asset.public_url,
      asset.resource_type,
      asset.resource_id,
      asset.resource_field,
      asset.purpose,
      asset.media_kind
  )
  select
    claimed.asset_id,
    claimed.cleanup_token,
    claimed.bucket,
    claimed.object_path,
    claimed.public_url,
    claimed.resource_type,
    claimed.resource_id,
    claimed.resource_field,
    claimed.purpose,
    claimed.media_kind
  from claimed
  order by claimed.asset_id;
end;
$$;


--
-- Name: cleanup_candidate_panel_auth_state(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_candidate_panel_auth_state() RETURNS TABLE(deleted_sessions integer, deleted_attempts integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_sessions integer := 0;
  v_attempts integer := 0;
begin
  delete from public.candidate_panel_sessions
   where expires_at < pg_catalog.now() - interval '1 day'
      or (
        revoked_at is not null
        and revoked_at < pg_catalog.now() - interval '1 day'
      );
  get diagnostics v_sessions = row_count;

  delete from public.candidate_panel_pin_attempts
   where updated_at < pg_catalog.now() - interval '1 day'
     and (blocked_until is null or blocked_until < pg_catalog.now());
  get diagnostics v_attempts = row_count;

  deleted_sessions := v_sessions;
  deleted_attempts := v_attempts;
  return next;
end;
$$;


--
-- Name: close_active_vote_round(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_active_vote_round(p_round_id uuid) RETURNS TABLE(id uuid, name text, group_code text, identity_mode text, ends_at timestamp with time zone, is_active boolean, lifecycle_state text, created_at timestamp with time zone, activated_at timestamp with time zone, closed_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  v_round public.vote_rounds%rowtype;
  v_group_code text;
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  select r.*
    into v_round
  from public.vote_rounds r
  where r.id = p_round_id;

  if not found then
    raise exception 'vote_round_not_found';
  end if;

  v_group_code := v_round.group_code;

  if v_group_code is null or v_group_code !~ '^GRUPO[A-Z]$' then
    raise exception 'vote_round_group_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voto-claro:vote-round:' || v_group_code, 0)
  );

  select r.*
    into v_round
  from public.vote_rounds r
  where r.id = p_round_id
  for update;

  if not found then
    raise exception 'vote_round_not_found';
  end if;

  if v_round.group_code is distinct from v_group_code then
    raise exception 'vote_round_group_invalid';
  end if;

  if v_round.is_active is distinct from true then
    raise exception 'vote_round_not_active';
  end if;

  if v_round.lifecycle_state = 'active' then
    update public.vote_rounds r
       set is_active = false,
           lifecycle_state = 'closed',
           closed_at = v_now
     where r.id = p_round_id;
  elsif v_round.lifecycle_state = 'legacy' then
    update public.vote_rounds r
       set is_active = false
     where r.id = p_round_id;
  else
    raise exception 'vote_round_state_invalid';
  end if;

  update public.vote_round_sessions s
     set revoked_at = v_now
   where s.round_id = p_round_id
     and s.revoked_at is null;

  return query
  select
    r.id,
    r.name::text,
    r.group_code::text,
    r.identity_mode::text,
    r.ends_at,
    r.is_active,
    r.lifecycle_state::text,
    r.created_at,
    r.activated_at,
    r.closed_at
  from public.vote_rounds r
  where r.id = p_round_id;
end;
$_$;


--
-- Name: close_project_cycle(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_project_cycle() RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
  current_cycle_id UUID;
  max_supports INTEGER;
  project_record RECORD;
  final_score NUMERIC;
BEGIN
  -- Obtener ciclo activo
  SELECT id INTO current_cycle_id FROM project_cycles WHERE is_active = true LIMIT 1;
  
  IF current_cycle_id IS NULL THEN
    RAISE NOTICE 'No hay ciclo activo para cerrar';
    RETURN;
  END IF;
  
  -- Calcular máximo de apoyos entre proyectos activos del ciclo
  SELECT COALESCE(MAX(beneficiary_count), 1) INTO max_supports 
  FROM projects 
  WHERE cycle_id = current_cycle_id AND status = 'active';
  
  -- Calcular puntajes finales para cada proyecto activo
  FOR project_record IN 
    SELECT 
      p.id,
      p.beneficiary_count,
      e.viability_score,
      e.impact_score,
      e.originality_score,
      e.participation_score
    FROM projects p
    LEFT JOIN project_evaluations e ON p.id = e.project_id
    WHERE p.cycle_id = current_cycle_id AND p.status = 'active'
  LOOP
    -- Puntaje por apoyos (30%)
    DECLARE
      support_score NUMERIC := (project_record.beneficiary_count::NUMERIC / max_supports) * 30;
      tech_score NUMERIC := 0;
    BEGIN
      -- Si tiene evaluación técnica, calcular promedio (70%)
      IF project_record.viability_score IS NOT NULL THEN
        tech_score := (
          project_record.viability_score + 
          project_record.impact_score + 
          project_record.originality_score + 
          project_record.participation_score
        ) / 4.0 * 0.7;
      END IF;
      
      final_score := support_score + tech_score;
      
      -- Guardar puntaje en tabla temporal o directamente en proyectos
      UPDATE projects SET 
        final_score = final_score,
        score_updated_at = NOW()
      WHERE id = project_record.id;
    END;
  END LOOP;
  
  -- Cerrar ciclo actual
  UPDATE project_cycles SET is_active = false WHERE id = current_cycle_id;
  
  -- Crear nuevo ciclo (3 meses después)
  INSERT INTO project_cycles (name, starts_at, ends_at, is_active, min_supports)
  VALUES (
    'Ciclo ' || TO_CHAR(NOW() + INTERVAL '3 months', 'YYYY-MM'),
    NOW() + INTERVAL '3 months',
    NOW() + INTERVAL '6 months',
    true,
    200
  );
  
  RAISE NOTICE 'Ciclo cerrado correctamente. Nuevo ciclo creado.';
END;
$$;


--
-- Name: complete_solo_ganadores_asset_cleanup(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_solo_ganadores_asset_cleanup(p_asset_id uuid, p_cleanup_token uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_now timestamptz := pg_catalog.now();
  v_row_count integer;
begin
  if p_asset_id is null or p_cleanup_token is null then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  update public.solo_ganadores_assets
  set
    status = 'deleted',
    deleted_at = v_now,
    last_error = null,
    cleanup_token = null,
    cleanup_claimed_at = null,
    next_retry_at = null,
    expires_at = null
  where id = p_asset_id
    and status = 'deleting'
    and deleted_at is null
    and cleanup_token = p_cleanup_token
    and cleanup_claimed_at is not null;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'CLAIM_NOT_FOUND';
  end if;

  return p_asset_id;
end;
$$;


--
-- Name: create_candidate_live_entry(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_candidate_live_entry(p_candidate_id text, p_candidate_name text, p_platform text, p_url text) RETURNS TABLE(id uuid, candidate_id text, candidate_name text, platform text, url text, status text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_now timestamptz := pg_catalog.now();
begin
  update public.votoclaro_live_entries as live
     set status = 'ENDED'
   where live.candidate_id = p_candidate_id
     and live.status = 'LIVE';

  return query
  with inserted_live as (
    insert into public.votoclaro_live_entries as new_live (
      candidate_id,
      candidate_name,
      platform,
      url,
      status,
      created_at
    )
    values (
      p_candidate_id,
      p_candidate_name,
      p_platform,
      p_url,
      'LIVE',
      v_now
    )
    returning
      new_live.id,
      new_live.candidate_id,
      new_live.candidate_name,
      new_live.platform,
      new_live.url,
      new_live.status,
      new_live.created_at
  )
  select
    inserted_live.id,
    inserted_live.candidate_id,
    inserted_live.candidate_name,
    inserted_live.platform::text,
    inserted_live.url,
    inserted_live.status::text,
    inserted_live.created_at
  from inserted_live;
end;
$$;


--
-- Name: create_candidate_panel_session_if_active(text, bigint, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_candidate_panel_session_if_active(p_candidate_id text, p_expected_revision bigint, p_token_hash text, p_expires_at timestamp with time zone) RETURNS TABLE(id uuid, expires_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_token_hash text := pg_catalog.btrim(p_token_hash);
  v_current_revision bigint;
  v_current_status text;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) = 0
     or pg_catalog.length(v_candidate_id) > 160
     or p_expected_revision is null
     or p_expected_revision < 0
     or v_token_hash is null
     or pg_catalog.length(v_token_hash) <> 64
     or v_token_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at <= pg_catalog.now() then
    raise exception using
      errcode = '22023',
      message = 'INVALID_CANDIDATE_PANEL_SESSION_CREATE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('candidate-access-code:' || v_candidate_id, 0)
  );

  select pins.credential_revision,
         pins.credential_status
    into v_current_revision,
         v_current_status
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = v_candidate_id
   for update;

  if not found
     or v_current_status <> 'ACTIVE'
     or v_current_revision <> p_expected_revision then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_PANEL_SESSION_CREDENTIAL_CONFLICT';
  end if;

  return query
  with inserted_session as (
    insert into public.candidate_panel_sessions as sessions (
      candidate_id,
      token_hash,
      expires_at
    )
    values (
      v_candidate_id,
      v_token_hash,
      p_expires_at
    )
    returning
      sessions.id,
      sessions.expires_at
  )
  select
    inserted_session.id,
    inserted_session.expires_at
  from inserted_session;
end;
$_$;


--
-- Name: create_monthly_vote_round(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_monthly_vote_round() RETURNS void
    LANGUAGE plpgsql
    AS $_$
DECLARE
    next_round_number INTEGER;
    new_round_name TEXT;
    new_round_id UUID;
BEGIN
    -- Obtener el número de la última ronda
    SELECT COALESCE(MAX(CAST(SUBSTRING(name FROM 'Ronda ([0-9]+)') AS INTEGER)), 0) + 1
    INTO next_round_number
    FROM vote_rounds
    WHERE name ~ '^Ronda [0-9]+$';

    -- Nombre de la nueva ronda
    new_round_name := 'Ronda ' || next_round_number;

    -- Desactivar todas las rondas actuales
    UPDATE vote_rounds SET is_active = false;

    -- Insertar la nueva ronda global
    INSERT INTO vote_rounds (id, name, group_code, is_active, created_at)
    VALUES (
        gen_random_uuid(),
        new_round_name,
        'GLOBAL',  -- identificador para rondas globales
        true,
        NOW()
    );

    RAISE NOTICE 'Nueva ronda global creada: %', new_round_name;
END;
$_$;


--
-- Name: create_solo_ganadores_event(jsonb, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_solo_ganadores_event(p_data jsonb, p_main_image_asset_id uuid DEFAULT NULL::uuid, p_promo_video_asset_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: create_solo_ganadores_media(jsonb, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_solo_ganadores_media(p_data jsonb, p_media_asset_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: create_solo_ganadores_post(jsonb, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_solo_ganadores_post(p_data jsonb, p_photo_asset_id uuid DEFAULT NULL::uuid, p_video_asset_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: create_vote_round_draft(text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_vote_round_draft(p_name text, p_group_code text, p_identity_mode text, p_ends_at timestamp with time zone) RETURNS TABLE(id uuid, name text, group_code text, identity_mode text, ends_at timestamp with time zone, is_active boolean, lifecycle_state text, created_at timestamp with time zone, activated_at timestamp with time zone, closed_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  v_name text := pg_catalog.btrim(p_name);
  v_group_code text := pg_catalog.btrim(p_group_code);
  v_identity_mode text := pg_catalog.btrim(p_identity_mode);
  v_now timestamptz := pg_catalog.statement_timestamp();
begin
  if v_name is null or v_name = '' or pg_catalog.char_length(v_name) > 160 then
    raise exception 'vote_round_name_invalid';
  end if;

  if v_group_code is null or v_group_code !~ '^GRUPO[A-Z]$' then
    raise exception 'vote_round_group_invalid';
  end if;

  if v_identity_mode is null or v_identity_mode not in ('legacy_device', 'secure_session') then
    raise exception 'vote_round_identity_mode_invalid';
  end if;

  if v_identity_mode = 'legacy_device' and p_ends_at is not null then
    raise exception 'vote_round_ends_at_invalid';
  end if;

  if v_identity_mode = 'secure_session' then
    if p_ends_at is null or p_ends_at <= v_now then
      raise exception 'vote_round_ends_at_invalid';
    end if;
  end if;

  return query
  with inserted as (
    insert into public.vote_rounds (
      name,
      group_code,
      identity_mode,
      ends_at,
      is_active,
      lifecycle_state,
      activated_at,
      closed_at
    )
    values (
      v_name,
      v_group_code,
      v_identity_mode,
      p_ends_at,
      false,
      'draft',
      null,
      null
    )
    returning *
  )
  select
    i.id,
    i.name::text,
    i.group_code::text,
    i.identity_mode::text,
    i.ends_at,
    i.is_active,
    i.lifecycle_state::text,
    i.created_at,
    i.activated_at,
    i.closed_at
  from inserted i;
end;
$_$;


--
-- Name: create_vote_round_draft_with_parties(text, text, text, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_vote_round_draft_with_parties(p_name text, p_group_code text, p_identity_mode text, p_ends_at timestamp with time zone, p_source_round_id uuid) RETURNS TABLE(id uuid, name text, group_code text, identity_mode text, ends_at timestamp with time zone, is_active boolean, lifecycle_state text, created_at timestamp with time zone, activated_at timestamp with time zone, closed_at timestamp with time zone, parties_copied integer, enabled_parties_copied integer, source_round_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  v_group_code text := pg_catalog.btrim(p_group_code);
  v_source public.vote_rounds%rowtype;
  v_new_id uuid;
  v_new_name text;
  v_new_group_code text;
  v_new_identity_mode text;
  v_new_ends_at timestamptz;
  v_new_is_active boolean;
  v_new_lifecycle_state text;
  v_new_created_at timestamptz;
  v_new_activated_at timestamptz;
  v_new_closed_at timestamptz;
  v_source_total integer;
  v_source_enabled integer;
  v_source_distinct_slugs integer;
  v_inserted integer;
  v_copied_total integer;
  v_copied_enabled integer;
  v_copied_distinct_slugs integer;
begin
  if v_group_code is null or v_group_code !~ '^GRUPO[A-Z]$' then
    raise exception 'vote_round_group_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voto-claro:vote-round:' || v_group_code, 0)
  );

  select r.*
    into v_source
  from public.vote_rounds r
  where r.id = p_source_round_id
  for update;

  if not found then
    raise exception 'vote_round_source_not_found';
  end if;

  if v_source.group_code is distinct from v_group_code then
    raise exception 'vote_round_source_group_mismatch';
  end if;

  if v_source.lifecycle_state not in ('legacy', 'active', 'closed') then
    raise exception 'vote_round_source_state_invalid';
  end if;

  perform 1
  from public.vote_parties p
  where p.round_id = p_source_round_id
  for share;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where p.enabled is true)::integer,
    pg_catalog.count(distinct p.slug)::integer
    into v_source_total, v_source_enabled, v_source_distinct_slugs
  from public.vote_parties p
  where p.round_id = p_source_round_id;

  if v_source_total <= 0 or v_source_enabled <= 0 then
    raise exception 'vote_round_party_catalog_unavailable';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_source_round_id
      and (p.slug is null or pg_catalog.btrim(p.slug) = '')
  ) then
    raise exception 'vote_round_party_slug_invalid';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_source_round_id
      and p.group_code is distinct from v_group_code
  ) then
    raise exception 'vote_round_party_group_mismatch';
  end if;

  if exists (
    select 1
    from public.vote_parties p
    where p.round_id = p_source_round_id
    group by p.slug
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'vote_round_party_slug_duplicate';
  end if;

  if v_source_distinct_slugs <> v_source_total then
    raise exception 'vote_round_party_slug_duplicate';
  end if;

  select
    created.id,
    created.name,
    created.group_code,
    created.identity_mode,
    created.ends_at,
    created.is_active,
    created.lifecycle_state,
    created.created_at,
    created.activated_at,
    created.closed_at
    into
      v_new_id,
      v_new_name,
      v_new_group_code,
      v_new_identity_mode,
      v_new_ends_at,
      v_new_is_active,
      v_new_lifecycle_state,
      v_new_created_at,
      v_new_activated_at,
      v_new_closed_at
  from public.create_vote_round_draft(
    p_name,
    v_group_code,
    p_identity_mode,
    p_ends_at
  ) created;

  if v_new_id is null then
    raise exception 'vote_round_create_failed';
  end if;

  if v_new_group_code is distinct from v_group_code then
    raise exception 'vote_round_create_failed';
  end if;

  if v_new_lifecycle_state <> 'draft' or v_new_is_active <> false then
    raise exception 'vote_round_create_failed';
  end if;

  insert into public.vote_parties (
    slug,
    name,
    enabled,
    position,
    group_code,
    round_id
  )
  select
    p.slug,
    p.name,
    p.enabled,
    p.position,
    v_group_code,
    v_new_id
  from public.vote_parties p
  where p.round_id = p_source_round_id
  order by p.position nulls last, p.slug;

  get diagnostics v_inserted = row_count;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where p.enabled is true)::integer,
    pg_catalog.count(distinct p.slug)::integer
    into v_copied_total, v_copied_enabled, v_copied_distinct_slugs
  from public.vote_parties p
  where p.round_id = v_new_id
    and p.group_code = v_group_code;

  if
    v_inserted <> v_source_total
    or v_copied_total <> v_source_total
    or v_copied_enabled <> v_source_enabled
    or v_copied_enabled <= 0
    or v_copied_distinct_slugs <> v_source_distinct_slugs
  then
    raise exception 'vote_round_party_copy_failed';
  end if;

  return query
  select
    v_new_id,
    v_new_name,
    v_new_group_code,
    v_new_identity_mode,
    v_new_ends_at,
    v_new_is_active,
    v_new_lifecycle_state,
    v_new_created_at,
    v_new_activated_at,
    v_new_closed_at,
    v_copied_total,
    v_copied_enabled,
    p_source_round_id;
end;
$_$;


--
-- Name: delete_solo_ganadores_event(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_solo_ganadores_event(p_id uuid, p_expected_updated_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: delete_solo_ganadores_media(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_solo_ganadores_media(p_id uuid, p_expected_updated_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: delete_solo_ganadores_post(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_solo_ganadores_post(p_id uuid, p_expected_updated_at timestamp with time zone) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: disable_candidate_panel_access(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disable_candidate_panel_access(p_candidate_id text, p_expected_revision bigint, p_reason text) RETURNS TABLE(candidate_id text, credential_status text, credential_revision bigint, credential_status_updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_reason text := pg_catalog.btrim(p_reason);
  v_now timestamptz := pg_catalog.now();
  v_current_revision bigint;
  v_next_revision bigint;
  v_status_updated_at timestamptz;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) = 0
     or pg_catalog.length(v_candidate_id) > 160
     or p_expected_revision is null
     or p_expected_revision < 0
     or v_reason is null
     or pg_catalog.length(v_reason) = 0
     or pg_catalog.length(v_reason) > 120 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_CANDIDATE_ACCESS_DISABLE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('candidate-access-code:' || v_candidate_id, 0)
  );

  select pins.credential_revision
    into v_current_revision
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = v_candidate_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_ACCESS_DISABLE_NOT_FOUND';
  end if;

  if v_current_revision <> p_expected_revision then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_ACCESS_CODE_REVISION_CONFLICT';
  end if;

  update public.votoclaro_candidate_pins as pins
     set access_code_verifier = null,
         access_code_rotated_at = null,
         credential_status = 'DISABLED',
         credential_status_updated_at = v_now,
         credential_status_reason = v_reason,
         credential_revision = pins.credential_revision + 1
   where pins.candidate_id = v_candidate_id
   returning
     pins.credential_revision,
     pins.credential_status_updated_at
    into
     v_next_revision,
     v_status_updated_at;

  delete from public.candidate_panel_sessions as sessions
   where sessions.candidate_id = v_candidate_id;

  delete from public.candidate_panel_pin_attempts as attempts
   where attempts.candidate_id = v_candidate_id;

  return query
  select
    v_candidate_id,
    'DISABLED'::text,
    v_next_revision,
    v_status_updated_at;
end;
$$;


--
-- Name: fail_solo_ganadores_asset_cleanup(uuid, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fail_solo_ganadores_asset_cleanup(p_asset_id uuid, p_cleanup_token uuid, p_error_code text, p_retryable boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_now timestamptz := pg_catalog.now();
  v_row_count integer;
begin
  if (
    p_asset_id is null
    or p_cleanup_token is null
    or p_error_code is null
    or p_retryable is null
    or p_error_code not in (
      'STORAGE_ERROR',
      'STORAGE_NOT_FOUND_CHECK_FAILED',
      'REFERENCE_CONFLICT',
      'INVALID_BUCKET',
      'INVALID_PATH',
      'UNKNOWN_ERROR'
    )
    or (
      p_retryable = true
      and p_error_code not in (
        'STORAGE_ERROR',
        'STORAGE_NOT_FOUND_CHECK_FAILED',
        'UNKNOWN_ERROR'
      )
    )
    or (
      p_retryable = false
      and p_error_code not in (
        'REFERENCE_CONFLICT',
        'INVALID_BUCKET',
        'INVALID_PATH'
      )
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INVALID_PAYLOAD';
  end if;

  if p_retryable then
    update public.solo_ganadores_assets
    set
      status = 'deleting',
      last_error = p_error_code,
      cleanup_token = null,
      cleanup_claimed_at = null,
      next_retry_at =
        case
          when cleanup_attempts <= 1 then v_now + interval '5 minutes'
          when cleanup_attempts = 2 then v_now + interval '30 minutes'
          when cleanup_attempts = 3 then v_now + interval '2 hours'
          else v_now + interval '24 hours'
        end
    where id = p_asset_id
      and status = 'deleting'
      and deleted_at is null
      and cleanup_token = p_cleanup_token
      and cleanup_claimed_at is not null;
  else
    update public.solo_ganadores_assets
    set
      status = 'failed',
      last_error = p_error_code,
      cleanup_token = null,
      cleanup_claimed_at = null,
      next_retry_at = null,
      deleted_at = null
    where id = p_asset_id
      and status = 'deleting'
      and deleted_at is null
      and cleanup_token = p_cleanup_token
      and cleanup_claimed_at is not null;
  end if;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'CLAIM_NOT_FOUND';
  end if;

  return p_asset_id;
end;
$$;


--
-- Name: fix_mojibake_es(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fix_mojibake_es(input text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  s text := COALESCE(input, '');
  out text;
BEGIN
  -- Si no parece mojibake, solo normaliza espacios
  IF s !~ '[ÃÂ�├┬]' THEN
    RETURN btrim(regexp_replace(s, '\s+', ' ', 'g'));
  END IF;

  -- Reparar mojibake: bytes latin1 -> decode utf8
  out := convert_from(convert_to(s, 'LATIN1'), 'UTF8');

  -- Limpiar símbolos basura y espacios
  out := regexp_replace(out, '[┬┐]+', '', 'g');
  out := btrim(regexp_replace(out, '\s+', ' ', 'g'));
  RETURN out;

EXCEPTION WHEN OTHERS THEN
  -- Si falla, no rompemos: limpieza básica
  RETURN btrim(regexp_replace(regexp_replace(s, '[┬┐]+', '', 'g'), '\s+', ' ', 'g'));
END;
$$;


--
-- Name: fragmentos_de_partido_de_coincidencia(integer, text, public.vector); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fragmentos_de_partido_de_coincidencia(p_match_count integer, p_party_id text, p_query_embedding public.vector) RETURNS TABLE(id bigint, doc_id text, doc_title text, source_path text, page_start integer, page_end integer, chunk_index integer, chunk_text text, similarity double precision)
    LANGUAGE sql STABLE
    AS $$
  select
    c.id,
    c.doc_id,
    c.doc_title,
    c.source_path,
    c.page_start,
    c.page_end,
    c.chunk_index,
    c.chunk_text,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.party_doc_chunks c
  where c.party_id = p_party_id
    and c.embedding is not null
  order by (c.embedding <=> p_query_embedding)
  limit p_match_count;
$$;


--
-- Name: generar_codigo_acceso(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generar_codigo_acceso() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
  codigo TEXT;
  existe BOOLEAN;
  caracteres TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  sufijo TEXT;
  i INTEGER;
BEGIN
  LOOP
    sufijo := '';

    FOR i IN 1..6 LOOP
      sufijo := sufijo || substr(
        caracteres,
        floor(random() * length(caracteres) + 1)::int,
        1
      );
    END LOOP;

    codigo := 'EMP-' || TO_CHAR(NOW(), 'YYYY') || '-' || sufijo;

    SELECT EXISTS(
      SELECT 1
      FROM public.project_participants
      WHERE codigo_acceso = codigo
    )
    INTO existe;

    EXIT WHEN NOT existe;
  END LOOP;

  RETURN codigo;
END;
$$;


--
-- Name: generar_codigo_profesional(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generar_codigo_profesional() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  nuevo_codigo text;
  existe boolean;
begin
  loop
    nuevo_codigo :=
      'PRO-' ||
      extract(year from now())::text ||
      '-' ||
      upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

    select exists (
      select 1
      from public.espacio_profesionales
      where codigo_profesional = nuevo_codigo
    )
    into existe;

    exit when not existe;
  end loop;

  return nuevo_codigo;
end;
$$;


--
-- Name: get_active_questions(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_active_questions() RETURNS TABLE(id uuid, question_1 text, question_2 text, question_3 text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT q.id, q.question_1, q.question_2, q.question_3
    FROM vote_intention_questions q
    WHERE q.is_active = true
      AND (q.valid_from IS NULL OR q.valid_from <= CURRENT_DATE)
      AND (q.valid_to IS NULL OR q.valid_to >= CURRENT_DATE)
    ORDER BY q.created_at DESC
    LIMIT 1;
END;
$$;


--
-- Name: get_reto_ganadores(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_reto_ganadores(filtro text DEFAULT 'TODOS'::text) RETURNS TABLE(alias text, created_at timestamp with time zone, segmento integer, premio text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    fecha_inicio TIMESTAMP WITH TIME ZONE;
BEGIN
    fecha_inicio := CASE filtro
        WHEN 'HOY' THEN DATE_TRUNC('day', NOW())
        WHEN 'AYER' THEN DATE_TRUNC('day', NOW() - INTERVAL '1 day')
        WHEN 'SEMANA' THEN NOW() - INTERVAL '7 days'
        WHEN 'MES' THEN NOW() - INTERVAL '30 days'
        ELSE '1970-01-01'::TIMESTAMP -- TODOS
    END;

    RETURN QUERY
    SELECT 
        g.alias,
        g.created_at,
        g.segmento,
        g.premio
    FROM reto_ganadores g
    WHERE g.created_at >= fecha_inicio
    ORDER BY g.created_at DESC
    LIMIT 50;
END;
$$;


--
-- Name: has_user_answered_intention(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_user_answered_intention(p_device_id text, p_round_id uuid, p_party_id uuid) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    answer_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO answer_count
    FROM vote_intention_answers
    WHERE device_id = p_device_id
      AND round_id = p_round_id
      AND party_id = p_party_id;
    
    RETURN answer_count > 0;
END;
$$;


--
-- Name: limit_forum_comments_per_day(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limit_forum_comments_per_day() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  daily_count integer;
begin
  select count(*)
  into daily_count
  from archived_topic_forum_comments
  where access_participant_id = new.access_participant_id
    and created_at >= date_trunc('day', now());

  if daily_count >= 20 then
    raise exception 'FORUM_DAILY_LIMIT_REACHED';
  end if;

  return new;
end;
$$;


--
-- Name: limit_user_comments_per_topic(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limit_user_comments_per_topic() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  comment_count integer;
begin

  select count(*)
  into comment_count
  from user_comments
  where access_participant_id = new.access_participant_id
  and weekly_topic_id = new.weekly_topic_id;

  if comment_count >= 3 then
     raise exception 'MAX_3_COMMENTS_PER_TOPIC';
  end if;

  return new;

end;
$$;


--
-- Name: limit_weekly_videos_per_topic(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limit_weekly_videos_per_topic() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  video_count integer;
begin

  select count(*)
  into video_count
  from weekly_video_entries
  where weekly_topic_id = new.weekly_topic_id;

  if video_count >= 10 then
     raise exception 'MAX_10_VIDEOS_PER_TOPIC';
  end if;

  return new;

end;
$$;


--
-- Name: match_party_chunks(text, public.vector, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.match_party_chunks(p_party_id text, p_query_embedding public.vector, p_match_count integer DEFAULT 8) RETURNS TABLE(id bigint, doc_id text, doc_title text, source_path text, page_start integer, page_end integer, chunk_text text, similarity double precision)
    LANGUAGE sql STABLE
    AS $$
  select
    c.id,
    c.doc_id,
    c.doc_title,
    c.source_path,
    c.page_start,
    c.page_end,
    c.chunk_text,
    1 - (c.embedding <=> p_query_embedding) as similarity
  from public.party_doc_chunks c
  where c.party_id = p_party_id
    and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit p_match_count;
$$;


--
-- Name: prepare_solo_ganadores_expired_pending_assets_for_cleanup(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(p_asset_ids uuid[]) RETURNS TABLE(asset_id uuid, status text, cleanup_origin text, object_path text, purpose text, media_kind text, expires_at timestamp with time zone, deleting_at timestamp with time zone, cleanup_token uuid, cleanup_claimed_at timestamp with time zone, cleanup_attempts integer, last_attempt_at timestamp with time zone, next_retry_at timestamp with time zone, last_error text, preparation_state text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: prepare_solo_ganadores_orphan_storage_assets_for_cleanup(uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prepare_solo_ganadores_orphan_storage_assets_for_cleanup(p_asset_ids uuid[]) RETURNS TABLE(asset_id uuid, status text, cleanup_origin text, object_path text, purpose text, media_kind text, created_at timestamp with time zone, deleting_at timestamp with time zone, cleanup_token uuid, cleanup_claimed_at timestamp with time zone, cleanup_attempts integer, last_attempt_at timestamp with time zone, next_retry_at timestamp with time zone, last_error text, preparation_state text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: prevent_forum_comment_flood(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_forum_comment_flood() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  last_comment_at timestamptz;
begin
  select max(created_at)
  into last_comment_at
  from archived_topic_forum_comments
  where access_participant_id = new.access_participant_id;

  if last_comment_at is not null
     and last_comment_at > now() - interval '20 seconds' then
    raise exception 'FORUM_FLOOD_BLOCKED';
  end if;

  return new;
end;
$$;


--
-- Name: publish_weekly_winner_for_topic(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_weekly_winner_for_topic(p_topic_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
declare
  winner_video_id uuid;
  winner_vote_count integer := 0;
begin
  select
    v.id,
    count(w.id)::integer as total_votes
  into
    winner_video_id,
    winner_vote_count
  from public.weekly_video_entries v
  left join public.weekly_video_votes w
    on w.weekly_video_entry_id = v.id
  where v.weekly_topic_id = p_topic_id
    and v.status = 'reviewed'
  group by v.id, v.created_at
  order by total_votes desc, v.created_at asc
  limit 1;

  update public.weekly_topics
  set
    winner_video_entry_id = winner_video_id,
    winner_votes = coalesce(winner_vote_count, 0),
    winner_published_at = now(),
    status = 'archived'
  where id = p_topic_id
    and status = 'voting';
end;
$$;


--
-- Name: record_candidate_panel_pin_failure(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_candidate_panel_pin_failure(p_candidate_id text, p_ip_fingerprint text) RETURNS TABLE(allowed boolean, blocked_until timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_now timestamptz := pg_catalog.now();
  v_blocked_until timestamptz;
begin
  if pg_catalog.length(pg_catalog.btrim(p_candidate_id)) = 0
     or pg_catalog.length(pg_catalog.btrim(p_ip_fingerprint)) = 0 then
    allowed := false;
    blocked_until := null;
    return next;
    return;
  end if;

  insert into public.candidate_panel_pin_attempts (
    candidate_id,
    ip_fingerprint,
    window_started_at,
    failed_count,
    blocked_until,
    last_failed_at,
    updated_at
  )
  values (
    p_candidate_id,
    p_ip_fingerprint,
    v_now,
    1,
    null,
    v_now,
    v_now
  )
  on conflict (candidate_id, ip_fingerprint) do update
     set window_started_at =
           case
             when public.candidate_panel_pin_attempts.window_started_at <= v_now - interval '10 minutes'
             then v_now
             else public.candidate_panel_pin_attempts.window_started_at
           end,
         failed_count =
           case
             when public.candidate_panel_pin_attempts.window_started_at <= v_now - interval '10 minutes'
             then 1
             else public.candidate_panel_pin_attempts.failed_count + 1
           end,
         blocked_until =
           case
             when (
               case
                 when public.candidate_panel_pin_attempts.window_started_at <= v_now - interval '10 minutes'
                 then 1
                 else public.candidate_panel_pin_attempts.failed_count + 1
               end
             ) >= 5
             then v_now + interval '15 minutes'
             else public.candidate_panel_pin_attempts.blocked_until
           end,
         last_failed_at = v_now,
         updated_at = v_now
  returning public.candidate_panel_pin_attempts.blocked_until
  into v_blocked_until;

  allowed := not (v_blocked_until is not null and v_blocked_until > v_now);
  blocked_until := v_blocked_until;
  return next;
end;
$$;


--
-- Name: reset_candidate_panel_pin_rate_limit(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_candidate_panel_pin_rate_limit(p_candidate_id text, p_ip_fingerprint text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if pg_catalog.length(pg_catalog.btrim(p_candidate_id)) = 0
     or pg_catalog.length(pg_catalog.btrim(p_ip_fingerprint)) = 0 then
    return;
  end if;

  delete from public.candidate_panel_pin_attempts
   where candidate_id = p_candidate_id
     and ip_fingerprint = p_ip_fingerprint;
end;
$$;


--
-- Name: reto_questions_clean_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reto_questions_clean_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.question IS NOT NULL THEN
    NEW.question := public.fix_mojibake_es(NEW.question);
  END IF;

  IF NEW.note IS NOT NULL THEN
    NEW.note := public.fix_mojibake_es(NEW.note);
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: rotate_candidate_access_code(text, bigint, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rotate_candidate_access_code(p_candidate_id text, p_expected_revision bigint, p_access_code_verifier text) RETURNS TABLE(candidate_id text, credential_revision bigint, access_code_rotated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_now timestamptz := pg_catalog.now();
  v_current_revision bigint;
  v_current_status text;
  v_next_revision bigint;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) = 0
     or pg_catalog.length(v_candidate_id) > 160
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_access_code_verifier is null
     or pg_catalog.length(pg_catalog.btrim(p_access_code_verifier)) = 0
     or pg_catalog.length(pg_catalog.btrim(p_access_code_verifier)) > 300 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_CANDIDATE_ACCESS_CODE_ROTATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('candidate-access-code:' || v_candidate_id, 0)
  );

  select pins.credential_revision,
         pins.credential_status
    into v_current_revision,
         v_current_status
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = v_candidate_id
   for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'CANDIDATE_ACCESS_CODE_REVISION_CONFLICT';
    end if;

    insert into public.votoclaro_candidate_pins as pins (
      candidate_id,
      access_code_verifier,
      access_code_rotated_at,
      credential_revision,
      credential_status,
      credential_status_updated_at,
      credential_status_reason
    )
    values (
      v_candidate_id,
      pg_catalog.btrim(p_access_code_verifier),
      v_now,
      1,
      'ACTIVE',
      v_now,
      null
    )
    returning
      pins.credential_revision,
      pins.access_code_rotated_at
    into
      v_next_revision,
      access_code_rotated_at;
  else
    if v_current_status <> 'ACTIVE' then
      raise exception using
        errcode = 'P0001',
        message = 'CANDIDATE_ACCESS_CODE_STATUS_CONFLICT';
    end if;

    if v_current_revision <> p_expected_revision then
      raise exception using
        errcode = 'P0001',
        message = 'CANDIDATE_ACCESS_CODE_REVISION_CONFLICT';
    end if;

    update public.votoclaro_candidate_pins as pins
       set access_code_verifier = pg_catalog.btrim(p_access_code_verifier),
           access_code_rotated_at = v_now,
           credential_revision = pins.credential_revision + 1
     where pins.candidate_id = v_candidate_id
     returning
       pins.credential_revision,
       pins.access_code_rotated_at
    into
       v_next_revision,
       access_code_rotated_at;
  end if;

  delete from public.candidate_panel_sessions as sessions
   where sessions.candidate_id = v_candidate_id;

  delete from public.candidate_panel_pin_attempts as attempts
   where attempts.candidate_id = v_candidate_id;

  candidate_id := v_candidate_id;
  credential_revision := v_next_revision;
  return next;
end;
$$;


--
-- Name: solo_ganadores_asset_has_active_reference(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.solo_ganadores_asset_has_active_reference(p_public_url text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: update_project_beneficiary_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_project_beneficiary_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE projects SET beneficiary_count = beneficiary_count + 1 WHERE id = NEW.project_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE projects SET beneficiary_count = beneficiary_count - 1 WHERE id = OLD.project_id;
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: update_solo_ganadores_event(uuid, jsonb, timestamp with time zone, text, uuid, uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_solo_ganadores_event(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_main_image_action text, p_main_image_current_asset_id uuid, p_main_image_new_asset_id uuid, p_promo_video_action text, p_promo_video_current_asset_id uuid, p_promo_video_new_asset_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: update_solo_ganadores_media(uuid, jsonb, timestamp with time zone, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_solo_ganadores_media(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_media_action text, p_media_current_asset_id uuid, p_media_new_asset_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: update_solo_ganadores_post(uuid, jsonb, timestamp with time zone, text, uuid, uuid, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_solo_ganadores_post(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_photo_action text, p_photo_current_asset_id uuid, p_photo_new_asset_id uuid, p_video_action text, p_video_current_asset_id uuid, p_video_new_asset_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: validate_forum_alias(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_forum_alias() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
declare
  normalized_alias text;
begin
  if new.forum_alias is null then
    return new;
  end if;

  normalized_alias := lower(new.forum_alias);

  if length(new.forum_alias) < 3 or length(new.forum_alias) > 20 then
    raise exception 'FORUM_ALIAS_INVALID_LENGTH';
  end if;

  if new.forum_alias !~ '^[a-zA-Z0-9_]+$' then
    raise exception 'FORUM_ALIAS_INVALID_CHARACTERS';
  end if;

  if normalized_alias ~ '(porqueria|basura|asco|mierda|carajo|puta|puto|culo|verga|cabron|cabrona|joder|maldito|maldita|idiota|imbecil|pendejo|pendeja|cojudo|cojuda)' then
    raise exception 'FORUM_ALIAS_BAD_WORD';
  end if;

  return new;
end;
$_$;


--
-- Name: validate_solo_ganadores_orphan_storage_asset_before_remove(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_solo_ganadores_orphan_storage_asset_before_remove(p_asset_id uuid, p_cleanup_token uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
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
$_$;


--
-- Name: vc_comments_filter_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vc_comments_filter_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if public.vc_has_banned_words(new.message) then
    new.status := 'blocked';
  end if;

  return new;
end;
$$;


--
-- Name: vc_comments_force_status_trigger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vc_comments_force_status_trigger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.status = 'blocked' then
    return new;
  end if;

  if new.status <> 'published' then
    new.status := 'published';
  end if;

  return new;
end;
$$;


--
-- Name: vc_comments_moderate_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vc_comments_moderate_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
declare
  msg text := coalesce(new.message,'');
  norm text := public.vc_norm_text(msg);
  registered boolean := false;
  has_link boolean := false;
  too_short boolean := false;
  too_fast boolean := false;
  duplicate_recent boolean := false;
  recent_count int := 0;
begin
  if public.vc_has_banned(msg) then
    new.status := 'blocked';
    return new;
  end if;

  has_link := (msg ~* '(https?://|www\.)');
  too_short := (char_length(btrim(msg)) < 5);

  if new.device_id is not null then
    select count(*) into recent_count
    from public.user_comments
    where device_id = new.device_id
      and created_at > now() - interval '1 minute';

    too_fast := (recent_count >= 3);

    duplicate_recent := exists (
      select 1
      from public.user_comments
      where device_id = new.device_id
        and created_at > now() - interval '2 minutes'
        and public.vc_norm_text(message) = norm
      limit 1
    );

    registered := exists (
      select 1
      from public.comment_access_participants
      where device_id = new.device_id
      limit 1
    );
  end if;

  if registered
     and not has_link
     and not too_short
     and not too_fast
     and not duplicate_recent
  then
    new.status := 'published';
  else
    new.status := 'blocked';
  end if;

  return new;
end;
$$;


--
-- Name: vc_has_banned(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vc_has_banned(input text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
declare
  t text := public.vc_norm_text(input);
begin
  -- Lista simple (puedes ampliar después)
  return
    t ~* '(^|\s)(porqueria|basura|asco|mierda|carajo|puta|puto|culo|verga|cabron|cabrona|joder|maldito|maldita|idiota|imbecil|pendejo|pendeja|cojudo|cojuda)(\s|$)';
end;
$_$;


--
-- Name: vc_has_banned_words(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vc_has_banned_words(input text) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  t text;
  w text;
  banned text[] := array[
    'porqueria','porquerias','basura','basuras','basofia','basofias','asco',
    'mierda','mierdas','carajo','carajos','puta','putas','puto','putos',
    'culo','culos','verga','vergas','cabron','cabrones','cabrona','cabronas',
    'joder','maldito','malditos','maldita','malditas','idiota','idiotas',
    'imbecil','imbeciles','pendejo','pendejos','pendeja','pendejas',
    'cojudo','cojudos','cojuda','cojudas','estupido','estupidos','estupida',
    'estupidas','tonto','tontos','tonta','tontas','tarado','tarados',
    'tarada','taradas','bruto','brutos','bruta','brutas','cretino',
    'cretinos','cretina','cretinas','patetico','pateticos','patetica',
    'pateticas','ridiculo','ridiculos','ridicula','ridiculas','inutil',
    'inutiles','fracasado','fracasados','fracasada','fracasadas','payaso',
    'payasos','payasa','payasas','bufon','bufones','bufona','bufonas',
    'bobo','bobos','boba','bobas','baboso','babosos','babosa','babosas',
    'babosoide','babosoides','zopenco','zopencos','zopenca','zopencas',
    'zoquete','zoquetes','memo','mema','memos','memas','torpe','torpes',
    'necio','necios','necia','necias','gil','giles','pelotudo','pelotudos',
    'pelotuda','pelotudas','boludo','boludos','boluda','boludas','mamon',
    'mamones','mamona','mamonas','capullo','capullos','capulla','capullas',
    'capulloide','capulloides','huevon','huevones','huevona','huevonas',
    'huevonazo','huevonazos','idiotez','idioteces','imbecilidad',
    'imbecilidades','estupidez','estupideces','pendejada','pendejadas',
    'cojudeces','cojuda','cojudez','tonteria','tonterias','taradez',
    'brutalidad','brutadas','bobada','bobadas','babosada','babosadas',
    'payasada','payasadas','patan','patanes','patana','patanas',
    'desgraciado','desgraciados','desgraciada','desgraciadas','malparido',
    'malparidos','malparida','malparidas','pelmazo','pelmazos','pelmaza',
    'pelmazas','gilipollas','gilipollas','gilipuertas','soplapollas',
    'comemierda','comemierda','mierdoso','mierdosos','mierdosa','mierdosas',
    'asqueroso','asquerosos','asquerosa','asquerosas','repugnante',
    'repugnantes','vomitivo','vomitivos','vomitiva','vomitivas',
    'apestoso','apestosos','apestosa','apestosas','mugroso','mugrosos',
    'mugrosa','mugrosas','rastrero','rastreros','rastrera','rastreras',
    'infeliz','infelices','lamebotas','chupamedias','chupamedias',
    'tragasables','pelele','peleles','pelela','pelelas'
  ];
begin
  t := public.vc_normalize_text(input);

  foreach w in array regexp_split_to_array(t, '\s+')
  loop
    if w <> '' and w = any(banned) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;


--
-- Name: vc_list_columns(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vc_list_columns(p_table text) RETURNS TABLE(column_name text, data_type text, is_nullable text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  select
    c.column_name,
    c.data_type,
    c.is_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table
  order by c.ordinal_position;
$$;


--
-- Name: vc_norm_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vc_norm_text(input text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  select
    regexp_replace(
      translate(
        lower(unaccent(coalesce(input,''))),
        '013457$@!',
        'oieastssa'
      ),
      '[^a-z0-9\s]+',
      ' ',
      'g'
    );
$_$;


--
-- Name: vc_normalize_text(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vc_normalize_text(input text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select
    regexp_replace(
      translate(
        lower(unaccent(coalesce(input,''))),
        '013457',
        'oieast'
      ),
      '[^a-z0-9\s]',
      ' ',
      'g'
    );
$$;


--
-- Name: vote_tally_apply(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.vote_tally_apply() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.vote_tally (round_id, party_id, group_code, total_votes, updated_at)
    VALUES (NEW.round_id, NEW.party_id, NEW.group_code, 1, now())
    ON CONFLICT (round_id, party_id, group_code)
    DO UPDATE SET total_votes = public.vote_tally.total_votes + 1,
                  updated_at = now();
    RETURN NEW;
  END IF;

  IF (TG_OP = 'DELETE') THEN
    UPDATE public.vote_tally
       SET total_votes = greatest(0, total_votes - 1),
           updated_at = now()
     WHERE round_id = OLD.round_id
       AND party_id = OLD.party_id
       AND group_code = OLD.group_code;

    RETURN OLD;
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    -- Si cambia ronda/partido/grupo, restamos del viejo y sumamos al nuevo
    IF (OLD.round_id <> NEW.round_id)
       OR (OLD.party_id <> NEW.party_id)
       OR (OLD.group_code <> NEW.group_code) THEN

      UPDATE public.vote_tally
         SET total_votes = greatest(0, total_votes - 1),
             updated_at = now()
       WHERE round_id = OLD.round_id
         AND party_id = OLD.party_id
         AND group_code = OLD.group_code;

      INSERT INTO public.vote_tally (round_id, party_id, group_code, total_votes, updated_at)
      VALUES (NEW.round_id, NEW.party_id, NEW.group_code, 1, now())
      ON CONFLICT (round_id, party_id, group_code)
      DO UPDATE SET total_votes = public.vote_tally.total_votes + 1,
                    updated_at = now();
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: votoclaro_set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.votoclaro_set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: archived_topic_forum_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.archived_topic_forum_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    weekly_topic_id uuid NOT NULL,
    access_participant_id uuid NOT NULL,
    device_id text,
    group_code text DEFAULT 'GENERAL'::text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'published'::text NOT NULL
);


--
-- Name: candidate_panel_pin_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidate_panel_pin_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id text NOT NULL,
    ip_fingerprint text NOT NULL,
    window_started_at timestamp with time zone DEFAULT now() NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    blocked_until timestamp with time zone,
    last_failed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT candidate_panel_pin_attempts_failed_count_check CHECK ((failed_count >= 0))
);


--
-- Name: candidate_panel_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.candidate_panel_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id text NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    last_seen_at timestamp with time zone
);


--
-- Name: comment_access_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_access_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    device_id text NOT NULL,
    group_code text,
    email text,
    celular text NOT NULL,
    forum_alias text NOT NULL
);


--
-- Name: comment_awards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_awards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_comment_id uuid NOT NULL,
    device_id text,
    group_code text DEFAULT 'GENERAL'::text NOT NULL,
    award_year integer NOT NULL,
    award_quarter integer NOT NULL,
    award_title text,
    award_note text,
    contact_status text DEFAULT 'pending'::text NOT NULL,
    logistics_note text,
    includes_companion boolean DEFAULT true NOT NULL,
    published boolean DEFAULT false NOT NULL,
    published_at timestamp with time zone,
    CONSTRAINT comment_awards_award_quarter_check CHECK (((award_quarter >= 1) AND (award_quarter <= 4)))
);


--
-- Name: espacio_afiliados; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacio_afiliados (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid,
    dni text NOT NULL,
    verified_at timestamp without time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    nombres_completos text,
    email text,
    celular text,
    direccion text,
    fecha_afiliacion date,
    partido text DEFAULT 'Alianza para el Progreso'::text
);


--
-- Name: espacio_capacitaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacio_capacitaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    professional_id uuid NOT NULL,
    participant_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    category text NOT NULL,
    resource_type text NOT NULL,
    resource_url text NOT NULL,
    is_free boolean DEFAULT true NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    admin_note text,
    reviewed_at timestamp with time zone,
    rejected_reason text,
    updated_by_admin boolean DEFAULT false NOT NULL
);


--
-- Name: espacio_contactos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacio_contactos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    investor_id uuid,
    contacted_at timestamp without time zone DEFAULT now(),
    email_sent boolean DEFAULT false
);


--
-- Name: espacio_inversionistas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacio_inversionistas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid,
    company text,
    investment_range_min integer,
    investment_range_max integer,
    categories text[],
    departments text[],
    notify_email boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    investor_type text,
    support_types text[] DEFAULT '{}'::text[],
    project_stages text[] DEFAULT '{}'::text[],
    participation_style text,
    investment_horizon text,
    risk_level text,
    public_message text,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: espacio_mensajes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacio_mensajes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    proyecto_id uuid,
    leido boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    sender_type text NOT NULL,
    content text NOT NULL,
    sender_afiliado_id uuid,
    sender_participant_id uuid,
    thread_key text,
    destinatario_participant_id uuid,
    destinatario_afiliado_id uuid,
    CONSTRAINT check_sender_type CHECK ((sender_type = ANY (ARRAY['emprendedor'::text, 'inversionista'::text])))
);


--
-- Name: espacio_mensajes_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacio_mensajes_backup (
    id uuid,
    proyecto_id uuid,
    emisor_id uuid,
    receptor_id uuid,
    mensaje text,
    leido boolean,
    created_at timestamp without time zone
);


--
-- Name: espacio_profesional_mensajes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacio_profesional_mensajes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    professional_id uuid NOT NULL,
    sender_participant_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    receiver_participant_id uuid,
    thread_key text
);


--
-- Name: espacio_profesionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacio_profesionales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    participant_id uuid NOT NULL,
    codigo_profesional text NOT NULL,
    public_name text NOT NULL,
    professional_type text NOT NULL,
    specialties text[] DEFAULT '{}'::text[] NOT NULL,
    services text[] DEFAULT '{}'::text[] NOT NULL,
    department text,
    province text,
    district text,
    attention_mode text DEFAULT 'Virtual y presencial'::text NOT NULL,
    experience_summary text,
    public_message text,
    document_url text,
    data_truth_confirmed boolean DEFAULT false NOT NULL,
    terms_accepted boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    service_mode text,
    service_mode_note text,
    educational_activities text[] DEFAULT '{}'::text[],
    training_categories text[] DEFAULT '{}'::text[]
);


--
-- Name: espacio_proyectos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacio_proyectos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid,
    title text NOT NULL,
    category text NOT NULL,
    department text NOT NULL,
    province text,
    district text NOT NULL,
    summary text NOT NULL,
    investment_min integer,
    investment_max integer,
    pdf_url text,
    status text DEFAULT 'active'::text,
    views integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: party_chat_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_chat_cache (
    id bigint NOT NULL,
    party_id text NOT NULL,
    question_norm text NOT NULL,
    answer_json jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: party_chat_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.party_chat_cache_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: party_chat_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.party_chat_cache_id_seq OWNED BY public.party_chat_cache.id;


--
-- Name: party_doc_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.party_doc_chunks (
    id bigint NOT NULL,
    party_id text NOT NULL,
    doc_id text NOT NULL,
    doc_title text NOT NULL,
    source_path text NOT NULL,
    page_start integer NOT NULL,
    page_end integer NOT NULL,
    chunk_index integer NOT NULL,
    chunk_text text NOT NULL,
    embedding public.vector(768),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: party_doc_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.party_doc_chunks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: party_doc_chunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.party_doc_chunks_id_seq OWNED BY public.party_doc_chunks.id;


--
-- Name: project_committee; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_committee (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    participant_id uuid,
    role text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: project_cycles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_cycles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    starts_at timestamp without time zone NOT NULL,
    ends_at timestamp without time zone NOT NULL,
    is_active boolean DEFAULT true,
    min_supports integer DEFAULT 200,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: project_evaluations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_evaluations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    judge_name text NOT NULL,
    viability_score integer,
    impact_score integer,
    originality_score integer,
    participation_score integer,
    comments text,
    evaluated_at timestamp without time zone DEFAULT now(),
    citizen_support_score numeric(5,2),
    quality_score numeric(5,2),
    final_score numeric(5,2),
    CONSTRAINT project_evaluations_citizen_support_score_check CHECK (((citizen_support_score IS NULL) OR ((citizen_support_score >= (0)::numeric) AND (citizen_support_score <= (40)::numeric)))),
    CONSTRAINT project_evaluations_final_score_check CHECK (((final_score IS NULL) OR ((final_score >= (0)::numeric) AND (final_score <= (100)::numeric)))),
    CONSTRAINT project_evaluations_impact_score_check CHECK (((impact_score >= 0) AND (impact_score <= 100))),
    CONSTRAINT project_evaluations_originality_score_check CHECK (((originality_score >= 0) AND (originality_score <= 100))),
    CONSTRAINT project_evaluations_participation_score_check CHECK (((participation_score >= 0) AND (participation_score <= 100))),
    CONSTRAINT project_evaluations_quality_score_check CHECK (((quality_score IS NULL) OR ((quality_score >= (0)::numeric) AND (quality_score <= (60)::numeric)))),
    CONSTRAINT project_evaluations_viability_score_check CHECK (((viability_score >= 0) AND (viability_score <= 100)))
);


--
-- Name: project_forum_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_forum_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    participant_id uuid,
    parent_id uuid,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: project_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    dni text NOT NULL,
    email text NOT NULL,
    phone text NOT NULL,
    address text,
    district text,
    alias text,
    verified boolean DEFAULT false,
    disqualified boolean DEFAULT false,
    disqualification_reason text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    device_id text,
    codigo_acceso text,
    dni_foto_url text,
    rostro_foto_url text,
    verificado_manual boolean DEFAULT false
);


--
-- Name: project_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    reporter_id uuid,
    reported_participant_id uuid,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text,
    resolution text,
    created_at timestamp without time zone DEFAULT now(),
    resolved_at timestamp without time zone
);


--
-- Name: project_supports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_supports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid,
    participant_id uuid,
    cycle_id uuid,
    approved_by uuid,
    joined_at timestamp without time zone DEFAULT now()
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cycle_id uuid,
    leader_id uuid,
    name text NOT NULL,
    category text NOT NULL,
    objective text NOT NULL,
    description text NOT NULL,
    district text NOT NULL,
    pdf_url text,
    beneficiary_count integer DEFAULT 0,
    status text DEFAULT 'pending'::text,
    rejection_reason text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    department text,
    final_score numeric,
    score_updated_at timestamp without time zone,
    requested_budget numeric(12,2),
    budget_category text,
    minimum_supports_required integer DEFAULT 100,
    eligible_for_final_review boolean DEFAULT false,
    CONSTRAINT projects_budget_category_check CHECK ((budget_category = ANY (ARRAY['hasta_10000'::text, 'hasta_20000'::text, 'hasta_30000'::text]))),
    CONSTRAINT projects_minimum_supports_required_check CHECK ((minimum_supports_required >= 0)),
    CONSTRAINT projects_requested_budget_check CHECK (((requested_budget IS NULL) OR ((requested_budget > (0)::numeric) AND (requested_budget <= (30000)::numeric))))
);


--
-- Name: reto_ganadores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reto_ganadores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    alias text NOT NULL,
    dni text NOT NULL,
    celular text NOT NULL,
    email text NOT NULL,
    nivel integer NOT NULL,
    segmento integer NOT NULL,
    premio text DEFAULT 'Premio ruleta'::text,
    device_id text,
    group_code text
);


--
-- Name: reto_premio_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reto_premio_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_code text NOT NULL,
    dni text,
    celular text NOT NULL,
    email text NOT NULL,
    device_id text NOT NULL,
    locked_until timestamp with time zone,
    prize_locked_until timestamp with time zone
);


--
-- Name: reto_premio_winners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reto_premio_winners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_code text NOT NULL,
    dni text NOT NULL,
    celular text NOT NULL,
    email text NOT NULL,
    device_id text,
    prize_segment integer NOT NULL,
    prize_note text,
    year_month text NOT NULL,
    status text DEFAULT 'pendiente'::text NOT NULL,
    CONSTRAINT reto_premio_winners_status_check CHECK ((status = ANY (ARRAY['pendiente'::text, 'contactado'::text, 'entregado'::text, 'anulado'::text])))
);


--
-- Name: reto_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reto_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    level integer NOT NULL,
    lang text DEFAULT 'es'::text NOT NULL,
    party_id text,
    question text NOT NULL,
    answer boolean NOT NULL,
    note text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT reto_questions_level_check CHECK ((level = ANY (ARRAY[1, 2])))
);


--
-- Name: reto_questions_backup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reto_questions_backup (
    id uuid,
    level integer,
    lang text,
    party_id text,
    question text,
    answer boolean,
    note text,
    is_active boolean,
    created_at timestamp with time zone
);


--
-- Name: reto_questions_backup_20260315; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reto_questions_backup_20260315 (
    id uuid,
    level integer,
    lang text,
    party_id text,
    question text,
    answer boolean,
    note text,
    is_active boolean,
    created_at timestamp with time zone
);


--
-- Name: solo_ganadores_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solo_ganadores_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    semester text,
    event_date date,
    location_name text,
    address text,
    city text,
    description text,
    recognitions text,
    main_image_url text,
    promo_video_url text,
    status text DEFAULT 'anunciado'::text NOT NULL,
    published boolean DEFAULT false NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: solo_ganadores_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solo_ganadores_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    media_type text DEFAULT 'foto'::text NOT NULL,
    media_url text NOT NULL,
    description text,
    related_winner_id uuid,
    published boolean DEFAULT false NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id uuid
);


--
-- Name: solo_ganadores_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solo_ganadores_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_module text DEFAULT 'manual'::text NOT NULL,
    source_winner_id text,
    winner_name text,
    winner_alias text,
    title text NOT NULL,
    prize_name text,
    description text,
    photo_url text,
    video_url text,
    interview_url text,
    event_date date,
    published boolean DEFAULT false NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    event_id uuid
);


--
-- Name: user_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_code text NOT NULL,
    device_id text,
    message text NOT NULL,
    page text,
    status text DEFAULT 'new'::text NOT NULL,
    access_participant_id uuid,
    weekly_topic_id uuid NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT user_comments_status_check CHECK ((status = ANY (ARRAY['published'::text, 'archived'::text, 'blocked'::text])))
);


--
-- Name: vote_casts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_casts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    party_id uuid NOT NULL,
    device_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_code text NOT NULL,
    cast_key text,
    key_version smallint,
    CONSTRAINT vote_casts_cast_key_hex_chk CHECK (((cast_key IS NULL) OR (cast_key ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT vote_casts_session_identity_mode_chk CHECK ((((device_id IS NOT NULL) AND (cast_key IS NULL) AND (key_version IS NULL)) OR ((device_id IS NULL) AND (cast_key IS NOT NULL) AND (key_version IS NOT NULL) AND (key_version > 0))))
);


--
-- Name: vote_intention_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_intention_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    device_id text,
    round_id uuid NOT NULL,
    party_id uuid,
    party_slug text,
    questions_id uuid,
    answer_1 text,
    answer_2 text,
    answer_3 text,
    ip_address text,
    user_agent text,
    answer_key text,
    key_version smallint,
    CONSTRAINT answers_not_all_empty CHECK (((answer_1 IS NOT NULL) OR (answer_2 IS NOT NULL) OR (answer_3 IS NOT NULL))),
    CONSTRAINT vote_intention_answers_answer_key_hex_chk CHECK (((answer_key IS NULL) OR (answer_key ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT vote_intention_answers_session_identity_mode_chk CHECK ((((device_id IS NOT NULL) AND (party_id IS NOT NULL) AND (party_slug IS NOT NULL) AND (answer_key IS NULL) AND (key_version IS NULL)) OR ((device_id IS NULL) AND (party_id IS NULL) AND (party_slug IS NULL) AND (answer_key IS NOT NULL) AND (key_version IS NOT NULL) AND (key_version > 0))))
);


--
-- Name: vote_intention_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_intention_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true,
    question_1 text NOT NULL,
    question_2 text NOT NULL,
    question_3 text NOT NULL,
    created_by uuid,
    description text,
    valid_from date DEFAULT CURRENT_DATE,
    valid_to date,
    CONSTRAINT valid_dates_check CHECK (((valid_from <= valid_to) OR (valid_to IS NULL)))
);


--
-- Name: vote_parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_parties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    round_id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 999 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_code text NOT NULL,
    total_votes integer DEFAULT 0
);


--
-- Name: vote_round_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_round_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_hash text NOT NULL,
    round_id uuid NOT NULL,
    group_code text NOT NULL,
    key_version smallint DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT vote_round_sessions_expires_after_created_chk CHECK ((expires_at > created_at)),
    CONSTRAINT vote_round_sessions_group_code_not_blank_chk CHECK ((length(btrim(group_code)) > 0)),
    CONSTRAINT vote_round_sessions_key_version_positive_chk CHECK ((key_version > 0)),
    CONSTRAINT vote_round_sessions_revoked_after_created_chk CHECK (((revoked_at IS NULL) OR (revoked_at >= created_at))),
    CONSTRAINT vote_round_sessions_token_hash_hex_chk CHECK ((token_hash ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: vote_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_rounds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    group_code text NOT NULL,
    identity_mode text DEFAULT 'legacy_device'::text NOT NULL,
    ends_at timestamp with time zone,
    lifecycle_state text DEFAULT 'legacy'::text NOT NULL,
    activated_at timestamp with time zone,
    closed_at timestamp with time zone,
    CONSTRAINT vote_rounds_ends_at_after_created_chk CHECK (((ends_at IS NULL) OR (ends_at > created_at))),
    CONSTRAINT vote_rounds_identity_mode_chk CHECK ((identity_mode = ANY (ARRAY['legacy_device'::text, 'secure_session'::text]))),
    CONSTRAINT vote_rounds_lifecycle_managed_state_chk CHECK (((lifecycle_state = 'legacy'::text) OR ((lifecycle_state = 'draft'::text) AND (is_active = false) AND (activated_at IS NULL) AND (closed_at IS NULL)) OR ((lifecycle_state = 'active'::text) AND (is_active = true) AND (activated_at IS NOT NULL) AND (activated_at >= created_at) AND (closed_at IS NULL)) OR ((lifecycle_state = 'closed'::text) AND (is_active = false) AND (activated_at IS NOT NULL) AND (activated_at >= created_at) AND (closed_at IS NOT NULL) AND (closed_at >= activated_at)))),
    CONSTRAINT vote_rounds_lifecycle_state_chk CHECK ((lifecycle_state = ANY (ARRAY['legacy'::text, 'draft'::text, 'active'::text, 'closed'::text]))),
    CONSTRAINT vote_rounds_secure_session_ends_at_chk CHECK (((identity_mode = 'legacy_device'::text) OR (ends_at IS NOT NULL)))
);


--
-- Name: vote_tally; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vote_tally (
    round_id uuid NOT NULL,
    party_id uuid NOT NULL,
    total_votes bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    group_code text NOT NULL
);


--
-- Name: votoclaro_candidate_pins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.votoclaro_candidate_pins (
    candidate_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    access_code_verifier text,
    access_code_rotated_at timestamp with time zone,
    credential_revision bigint DEFAULT 0 NOT NULL,
    credential_status text DEFAULT 'ACTIVE'::text NOT NULL,
    credential_status_updated_at timestamp with time zone DEFAULT now() NOT NULL,
    credential_status_reason text,
    CONSTRAINT votoclaro_candidate_pins_access_code_verifier_length_check CHECK (((access_code_verifier IS NULL) OR (length(access_code_verifier) <= 300))),
    CONSTRAINT votoclaro_candidate_pins_credential_revision_check CHECK ((credential_revision >= 0)),
    CONSTRAINT votoclaro_candidate_pins_credential_status_check CHECK ((credential_status = ANY (ARRAY['ACTIVE'::text, 'DISABLED'::text, 'REVOKED'::text]))),
    CONSTRAINT votoclaro_candidate_pins_credential_status_reason_length_check CHECK (((credential_status_reason IS NULL) OR (length(credential_status_reason) <= 120)))
);


--
-- Name: votoclaro_live_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.votoclaro_live_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    candidate_id text NOT NULL,
    candidate_name text NOT NULL,
    platform text NOT NULL,
    url text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT votoclaro_live_entries_platform_check CHECK ((platform = ANY (ARRAY['YOUTUBE'::text, 'FACEBOOK'::text, 'TIKTOK'::text, 'OTRA'::text]))),
    CONSTRAINT votoclaro_live_entries_status_check CHECK ((status = ANY (ARRAY['LIVE'::text, 'ENDED'::text])))
);

ALTER TABLE ONLY public.votoclaro_live_entries REPLICA IDENTITY FULL;


--
-- Name: votoclaro_public_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.votoclaro_public_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    route text DEFAULT '/pitch'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: weekly_founder_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_founder_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    weekly_topic_id uuid NOT NULL,
    weekly_video_entry_id uuid NOT NULL,
    device_id text,
    group_code text DEFAULT 'GENERAL'::text NOT NULL,
    question_text text NOT NULL,
    question_status text DEFAULT 'pending'::text NOT NULL,
    founder_answer_text text,
    founder_answer_video_url text,
    founder_answered_at timestamp with time zone,
    published boolean DEFAULT false NOT NULL
);


--
-- Name: weekly_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    topic text NOT NULL,
    question text NOT NULL,
    status text DEFAULT 'active'::text,
    starts_at timestamp with time zone DEFAULT now(),
    ends_at timestamp with time zone,
    winner_video_entry_id uuid,
    winner_votes integer,
    winner_published_at timestamp with time zone
);


--
-- Name: weekly_topics_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_topics_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    topic text NOT NULL,
    question text NOT NULL,
    starts_at timestamp with time zone NOT NULL,
    ends_at timestamp with time zone NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL
);


--
-- Name: weekly_video_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_video_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    weekly_topic_id uuid NOT NULL,
    device_id text,
    group_code text DEFAULT 'GENERAL'::text NOT NULL,
    platform text NOT NULL,
    video_url text NOT NULL,
    title text,
    status text DEFAULT 'new'::text NOT NULL,
    participant_device_id text,
    access_participant_id uuid
);


--
-- Name: weekly_video_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekly_video_votes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    weekly_topic_id uuid NOT NULL,
    weekly_video_entry_id uuid NOT NULL,
    device_id text NOT NULL,
    group_code text DEFAULT 'GENERAL'::text NOT NULL,
    access_participant_id uuid
);


--
-- Name: party_chat_cache id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_chat_cache ALTER COLUMN id SET DEFAULT nextval('public.party_chat_cache_id_seq'::regclass);


--
-- Name: party_doc_chunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_doc_chunks ALTER COLUMN id SET DEFAULT nextval('public.party_doc_chunks_id_seq'::regclass);


--
-- Name: archived_topic_forum_comments archived_topic_forum_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_topic_forum_comments
    ADD CONSTRAINT archived_topic_forum_comments_pkey PRIMARY KEY (id);


--
-- Name: candidate_panel_pin_attempts candidate_panel_pin_attempts_candidate_ip_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_panel_pin_attempts
    ADD CONSTRAINT candidate_panel_pin_attempts_candidate_ip_unique UNIQUE (candidate_id, ip_fingerprint);


--
-- Name: candidate_panel_pin_attempts candidate_panel_pin_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_panel_pin_attempts
    ADD CONSTRAINT candidate_panel_pin_attempts_pkey PRIMARY KEY (id);


--
-- Name: candidate_panel_sessions candidate_panel_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_panel_sessions
    ADD CONSTRAINT candidate_panel_sessions_pkey PRIMARY KEY (id);


--
-- Name: candidate_panel_sessions candidate_panel_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_panel_sessions
    ADD CONSTRAINT candidate_panel_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: comment_access_participants comment_access_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_access_participants
    ADD CONSTRAINT comment_access_participants_pkey PRIMARY KEY (id);


--
-- Name: comment_awards comment_awards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_awards
    ADD CONSTRAINT comment_awards_pkey PRIMARY KEY (id);


--
-- Name: espacio_afiliados espacio_afiliados_dni_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_afiliados
    ADD CONSTRAINT espacio_afiliados_dni_key UNIQUE (dni);


--
-- Name: espacio_afiliados espacio_afiliados_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_afiliados
    ADD CONSTRAINT espacio_afiliados_pkey PRIMARY KEY (id);


--
-- Name: espacio_capacitaciones espacio_capacitaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_capacitaciones
    ADD CONSTRAINT espacio_capacitaciones_pkey PRIMARY KEY (id);


--
-- Name: espacio_contactos espacio_contactos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_contactos
    ADD CONSTRAINT espacio_contactos_pkey PRIMARY KEY (id);


--
-- Name: espacio_inversionistas espacio_inversionistas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_inversionistas
    ADD CONSTRAINT espacio_inversionistas_pkey PRIMARY KEY (id);


--
-- Name: espacio_mensajes espacio_mensajes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_mensajes
    ADD CONSTRAINT espacio_mensajes_pkey PRIMARY KEY (id);


--
-- Name: espacio_profesional_mensajes espacio_profesional_mensajes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_profesional_mensajes
    ADD CONSTRAINT espacio_profesional_mensajes_pkey PRIMARY KEY (id);


--
-- Name: espacio_profesionales espacio_profesionales_codigo_profesional_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_profesionales
    ADD CONSTRAINT espacio_profesionales_codigo_profesional_key UNIQUE (codigo_profesional);


--
-- Name: espacio_profesionales espacio_profesionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_profesionales
    ADD CONSTRAINT espacio_profesionales_pkey PRIMARY KEY (id);


--
-- Name: espacio_proyectos espacio_proyectos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_proyectos
    ADD CONSTRAINT espacio_proyectos_pkey PRIMARY KEY (id);


--
-- Name: party_chat_cache party_chat_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_chat_cache
    ADD CONSTRAINT party_chat_cache_pkey PRIMARY KEY (id);


--
-- Name: party_doc_chunks party_doc_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.party_doc_chunks
    ADD CONSTRAINT party_doc_chunks_pkey PRIMARY KEY (id);


--
-- Name: project_committee project_committee_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_committee
    ADD CONSTRAINT project_committee_pkey PRIMARY KEY (id);


--
-- Name: project_committee project_committee_project_id_participant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_committee
    ADD CONSTRAINT project_committee_project_id_participant_id_key UNIQUE (project_id, participant_id);


--
-- Name: project_cycles project_cycles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_cycles
    ADD CONSTRAINT project_cycles_pkey PRIMARY KEY (id);


--
-- Name: project_evaluations project_evaluations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_evaluations
    ADD CONSTRAINT project_evaluations_pkey PRIMARY KEY (id);


--
-- Name: project_forum_posts project_forum_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_forum_posts
    ADD CONSTRAINT project_forum_posts_pkey PRIMARY KEY (id);


--
-- Name: project_participants project_participants_codigo_acceso_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_participants
    ADD CONSTRAINT project_participants_codigo_acceso_key UNIQUE (codigo_acceso);


--
-- Name: project_participants project_participants_dni_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_participants
    ADD CONSTRAINT project_participants_dni_key UNIQUE (dni);


--
-- Name: project_participants project_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_participants
    ADD CONSTRAINT project_participants_pkey PRIMARY KEY (id);


--
-- Name: project_reports project_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_reports
    ADD CONSTRAINT project_reports_pkey PRIMARY KEY (id);


--
-- Name: project_supports project_supports_participant_id_cycle_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_supports
    ADD CONSTRAINT project_supports_participant_id_cycle_id_key UNIQUE (participant_id, cycle_id);


--
-- Name: project_supports project_supports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_supports
    ADD CONSTRAINT project_supports_pkey PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: reto_ganadores reto_ganadores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reto_ganadores
    ADD CONSTRAINT reto_ganadores_pkey PRIMARY KEY (id);


--
-- Name: reto_premio_participants reto_premio_participants_device_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reto_premio_participants
    ADD CONSTRAINT reto_premio_participants_device_id_key UNIQUE (device_id);


--
-- Name: reto_premio_participants reto_premio_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reto_premio_participants
    ADD CONSTRAINT reto_premio_participants_pkey PRIMARY KEY (id);


--
-- Name: reto_premio_winners reto_premio_winners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reto_premio_winners
    ADD CONSTRAINT reto_premio_winners_pkey PRIMARY KEY (id);


--
-- Name: reto_questions reto_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reto_questions
    ADD CONSTRAINT reto_questions_pkey PRIMARY KEY (id);


--
-- Name: solo_ganadores_assets solo_ganadores_assets_bucket_object_path_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solo_ganadores_assets
    ADD CONSTRAINT solo_ganadores_assets_bucket_object_path_key UNIQUE (bucket, object_path);


--
-- Name: solo_ganadores_assets solo_ganadores_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solo_ganadores_assets
    ADD CONSTRAINT solo_ganadores_assets_pkey PRIMARY KEY (id);


--
-- Name: solo_ganadores_events solo_ganadores_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solo_ganadores_events
    ADD CONSTRAINT solo_ganadores_events_pkey PRIMARY KEY (id);


--
-- Name: solo_ganadores_media solo_ganadores_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solo_ganadores_media
    ADD CONSTRAINT solo_ganadores_media_pkey PRIMARY KEY (id);


--
-- Name: solo_ganadores_posts solo_ganadores_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solo_ganadores_posts
    ADD CONSTRAINT solo_ganadores_posts_pkey PRIMARY KEY (id);


--
-- Name: comment_access_participants unique_celular; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_access_participants
    ADD CONSTRAINT unique_celular UNIQUE (celular);


--
-- Name: comment_access_participants unique_device_id; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_access_participants
    ADD CONSTRAINT unique_device_id UNIQUE (device_id);


--
-- Name: espacio_inversionistas unique_participant_inversor; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_inversionistas
    ADD CONSTRAINT unique_participant_inversor UNIQUE (participant_id);


--
-- Name: espacio_profesionales unique_participant_professional; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_profesionales
    ADD CONSTRAINT unique_participant_professional UNIQUE (participant_id);


--
-- Name: vote_intention_answers unique_response_per_round; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_intention_answers
    ADD CONSTRAINT unique_response_per_round UNIQUE (device_id, round_id);


--
-- Name: user_comments user_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_comments
    ADD CONSTRAINT user_comments_pkey PRIMARY KEY (id);


--
-- Name: vote_casts vote_casts_device_round_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_casts
    ADD CONSTRAINT vote_casts_device_round_uniq UNIQUE (device_id, round_id);


--
-- Name: vote_casts vote_casts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_casts
    ADD CONSTRAINT vote_casts_pkey PRIMARY KEY (id);


--
-- Name: vote_intention_answers vote_intention_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_intention_answers
    ADD CONSTRAINT vote_intention_answers_pkey PRIMARY KEY (id);


--
-- Name: vote_intention_questions vote_intention_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_intention_questions
    ADD CONSTRAINT vote_intention_questions_pkey PRIMARY KEY (id);


--
-- Name: vote_parties vote_parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_parties
    ADD CONSTRAINT vote_parties_pkey PRIMARY KEY (id);


--
-- Name: vote_parties vote_parties_round_slug_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_parties
    ADD CONSTRAINT vote_parties_round_slug_uniq UNIQUE (round_id, slug);


--
-- Name: vote_round_sessions vote_round_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_round_sessions
    ADD CONSTRAINT vote_round_sessions_pkey PRIMARY KEY (id);


--
-- Name: vote_round_sessions vote_round_sessions_token_hash_uniq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_round_sessions
    ADD CONSTRAINT vote_round_sessions_token_hash_uniq UNIQUE (token_hash);


--
-- Name: vote_rounds vote_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_rounds
    ADD CONSTRAINT vote_rounds_pkey PRIMARY KEY (id);


--
-- Name: vote_tally vote_tally_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_tally
    ADD CONSTRAINT vote_tally_pkey PRIMARY KEY (round_id, party_id, group_code);


--
-- Name: votoclaro_candidate_pins votoclaro_candidate_pins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votoclaro_candidate_pins
    ADD CONSTRAINT votoclaro_candidate_pins_pkey PRIMARY KEY (candidate_id);


--
-- Name: votoclaro_live_entries votoclaro_live_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votoclaro_live_entries
    ADD CONSTRAINT votoclaro_live_entries_pkey PRIMARY KEY (id);


--
-- Name: votoclaro_public_links votoclaro_public_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votoclaro_public_links
    ADD CONSTRAINT votoclaro_public_links_pkey PRIMARY KEY (id);


--
-- Name: votoclaro_public_links votoclaro_public_links_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.votoclaro_public_links
    ADD CONSTRAINT votoclaro_public_links_token_key UNIQUE (token);


--
-- Name: weekly_founder_questions weekly_founder_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_founder_questions
    ADD CONSTRAINT weekly_founder_questions_pkey PRIMARY KEY (id);


--
-- Name: weekly_founder_questions weekly_founder_questions_unique_winner_question; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_founder_questions
    ADD CONSTRAINT weekly_founder_questions_unique_winner_question UNIQUE (weekly_topic_id, weekly_video_entry_id);


--
-- Name: weekly_topics weekly_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_topics
    ADD CONSTRAINT weekly_topics_pkey PRIMARY KEY (id);


--
-- Name: weekly_topics_queue weekly_topics_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_topics_queue
    ADD CONSTRAINT weekly_topics_queue_pkey PRIMARY KEY (id);


--
-- Name: weekly_video_entries weekly_video_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_video_entries
    ADD CONSTRAINT weekly_video_entries_pkey PRIMARY KEY (id);


--
-- Name: weekly_video_votes weekly_video_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_video_votes
    ADD CONSTRAINT weekly_video_votes_pkey PRIMARY KEY (id);


--
-- Name: archived_topic_forum_comments_participant_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX archived_topic_forum_comments_participant_idx ON public.archived_topic_forum_comments USING btree (access_participant_id, created_at DESC);


--
-- Name: archived_topic_forum_comments_topic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX archived_topic_forum_comments_topic_idx ON public.archived_topic_forum_comments USING btree (weekly_topic_id, created_at DESC);


--
-- Name: candidate_panel_pin_attempts_blocked_until_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidate_panel_pin_attempts_blocked_until_idx ON public.candidate_panel_pin_attempts USING btree (blocked_until) WHERE (blocked_until IS NOT NULL);


--
-- Name: candidate_panel_sessions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidate_panel_sessions_active_idx ON public.candidate_panel_sessions USING btree (candidate_id, expires_at) WHERE (revoked_at IS NULL);


--
-- Name: candidate_panel_sessions_candidate_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidate_panel_sessions_candidate_id_idx ON public.candidate_panel_sessions USING btree (candidate_id);


--
-- Name: candidate_panel_sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX candidate_panel_sessions_expires_at_idx ON public.candidate_panel_sessions USING btree (expires_at);


--
-- Name: comment_access_participants_device_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX comment_access_participants_device_id_key ON public.comment_access_participants USING btree (device_id);


--
-- Name: comment_access_participants_forum_alias_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX comment_access_participants_forum_alias_unique ON public.comment_access_participants USING btree (forum_alias) WHERE (forum_alias IS NOT NULL);


--
-- Name: idx_answers_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_answers_created_at ON public.vote_intention_answers USING btree (created_at);


--
-- Name: idx_answers_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_answers_device_id ON public.vote_intention_answers USING btree (device_id);


--
-- Name: idx_answers_party_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_answers_party_id ON public.vote_intention_answers USING btree (party_id);


--
-- Name: idx_answers_round_analysis; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_answers_round_analysis ON public.vote_intention_answers USING btree (round_id, created_at);


--
-- Name: idx_answers_round_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_answers_round_id ON public.vote_intention_answers USING btree (round_id);


--
-- Name: idx_comment_awards_contact_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_awards_contact_status ON public.comment_awards USING btree (contact_status);


--
-- Name: idx_comment_awards_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_awards_device_id ON public.comment_awards USING btree (device_id);


--
-- Name: idx_comment_awards_group_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_awards_group_code ON public.comment_awards USING btree (group_code);


--
-- Name: idx_comment_awards_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_awards_published ON public.comment_awards USING btree (published);


--
-- Name: idx_committee_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_committee_project ON public.project_committee USING btree (project_id);


--
-- Name: idx_espacio_capacitaciones_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_capacitaciones_category ON public.espacio_capacitaciones USING btree (category);


--
-- Name: idx_espacio_capacitaciones_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_capacitaciones_created_at ON public.espacio_capacitaciones USING btree (created_at DESC);


--
-- Name: idx_espacio_capacitaciones_participant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_capacitaciones_participant_id ON public.espacio_capacitaciones USING btree (participant_id);


--
-- Name: idx_espacio_capacitaciones_professional_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_capacitaciones_professional_id ON public.espacio_capacitaciones USING btree (professional_id);


--
-- Name: idx_espacio_capacitaciones_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_capacitaciones_status ON public.espacio_capacitaciones USING btree (status);


--
-- Name: idx_espacio_capacitaciones_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_capacitaciones_updated_at ON public.espacio_capacitaciones USING btree (updated_at DESC);


--
-- Name: idx_espacio_inversionistas_categories; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_inversionistas_categories ON public.espacio_inversionistas USING gin (categories);


--
-- Name: idx_espacio_inversionistas_departments; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_inversionistas_departments ON public.espacio_inversionistas USING gin (departments);


--
-- Name: idx_espacio_mensajes_destinatario_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_mensajes_destinatario_participant ON public.espacio_mensajes USING btree (destinatario_participant_id);


--
-- Name: idx_espacio_mensajes_proyecto_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_mensajes_proyecto_thread ON public.espacio_mensajes USING btree (proyecto_id, thread_key);


--
-- Name: idx_espacio_mensajes_sender_afiliado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_mensajes_sender_afiliado ON public.espacio_mensajes USING btree (sender_afiliado_id);


--
-- Name: idx_espacio_mensajes_sender_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_mensajes_sender_participant ON public.espacio_mensajes USING btree (sender_participant_id);


--
-- Name: idx_espacio_mensajes_thread_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_mensajes_thread_key ON public.espacio_mensajes USING btree (thread_key);


--
-- Name: idx_espacio_profesional_mensajes_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_profesional_mensajes_created_at ON public.espacio_profesional_mensajes USING btree (created_at DESC);


--
-- Name: idx_espacio_profesional_mensajes_professional_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_profesional_mensajes_professional_id ON public.espacio_profesional_mensajes USING btree (professional_id);


--
-- Name: idx_espacio_profesional_mensajes_professional_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_profesional_mensajes_professional_thread ON public.espacio_profesional_mensajes USING btree (professional_id, thread_key);


--
-- Name: idx_espacio_profesional_mensajes_receiver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_profesional_mensajes_receiver ON public.espacio_profesional_mensajes USING btree (receiver_participant_id);


--
-- Name: idx_espacio_profesional_mensajes_sender_participant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_profesional_mensajes_sender_participant_id ON public.espacio_profesional_mensajes USING btree (sender_participant_id);


--
-- Name: idx_espacio_profesional_mensajes_thread_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_profesional_mensajes_thread_key ON public.espacio_profesional_mensajes USING btree (thread_key);


--
-- Name: idx_espacio_proyectos_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_proyectos_category ON public.espacio_proyectos USING btree (category);


--
-- Name: idx_espacio_proyectos_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_espacio_proyectos_department ON public.espacio_proyectos USING btree (department);


--
-- Name: idx_forum_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_forum_project ON public.project_forum_posts USING btree (project_id);


--
-- Name: idx_ganadores_alias; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ganadores_alias ON public.reto_ganadores USING btree (alias);


--
-- Name: idx_ganadores_celular; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ganadores_celular ON public.reto_ganadores USING btree (celular);


--
-- Name: idx_ganadores_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ganadores_created_at ON public.reto_ganadores USING btree (created_at);


--
-- Name: idx_mensajes_proyecto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mensajes_proyecto ON public.espacio_mensajes USING btree (proyecto_id);


--
-- Name: idx_project_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_cycle ON public.projects USING btree (cycle_id);


--
-- Name: idx_project_leader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_leader ON public.projects USING btree (leader_id);


--
-- Name: idx_project_participants_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_participants_device_id ON public.project_participants USING btree (device_id);


--
-- Name: idx_project_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_project_status ON public.projects USING btree (status);


--
-- Name: idx_projects_cycle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_cycle ON public.projects USING btree (cycle_id);


--
-- Name: idx_projects_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_department ON public.projects USING btree (department);


--
-- Name: idx_projects_leader; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_leader ON public.projects USING btree (leader_id);


--
-- Name: idx_projects_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_status ON public.projects USING btree (status);


--
-- Name: idx_questions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_questions_active ON public.vote_intention_questions USING btree (is_active, valid_from, valid_to);


--
-- Name: idx_reto_premio_group_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reto_premio_group_created ON public.reto_premio_participants USING btree (group_code, created_at DESC);


--
-- Name: idx_reto_premio_winners_group_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reto_premio_winners_group_created ON public.reto_premio_winners USING btree (group_code, created_at DESC);


--
-- Name: idx_reto_questions_level_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reto_questions_level_active ON public.reto_questions USING btree (level, is_active);


--
-- Name: idx_reto_questions_party; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reto_questions_party ON public.reto_questions USING btree (party_id);


--
-- Name: idx_supports_participant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supports_participant ON public.project_supports USING btree (participant_id);


--
-- Name: idx_supports_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_supports_project ON public.project_supports USING btree (project_id);


--
-- Name: idx_unique_celular; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_celular ON public.comment_access_participants USING btree (celular) WHERE (celular IS NOT NULL);


--
-- Name: idx_unique_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unique_email ON public.comment_access_participants USING btree (email) WHERE (email IS NOT NULL);


--
-- Name: idx_user_comments_group_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_comments_group_created ON public.user_comments USING btree (group_code, created_at DESC);


--
-- Name: idx_user_comments_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_comments_metadata ON public.user_comments USING gin (metadata);


--
-- Name: idx_user_comments_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_comments_status_created ON public.user_comments USING btree (status, created_at DESC);


--
-- Name: idx_vote_casts_group_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_casts_group_code ON public.vote_casts USING btree (group_code);


--
-- Name: idx_vote_parties_group_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_parties_group_code ON public.vote_parties USING btree (group_code);


--
-- Name: idx_vote_rounds_group_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_rounds_group_code ON public.vote_rounds USING btree (group_code);


--
-- Name: idx_vote_tally_group_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vote_tally_group_code ON public.vote_tally USING btree (group_code);


--
-- Name: idx_votoclaro_live_candidate_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_votoclaro_live_candidate_time ON public.votoclaro_live_entries USING btree (candidate_id, created_at DESC);


--
-- Name: idx_votoclaro_live_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_votoclaro_live_status ON public.votoclaro_live_entries USING btree (status);


--
-- Name: idx_weekly_founder_questions_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_founder_questions_device_id ON public.weekly_founder_questions USING btree (device_id);


--
-- Name: idx_weekly_founder_questions_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_founder_questions_published ON public.weekly_founder_questions USING btree (published);


--
-- Name: idx_weekly_founder_questions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_founder_questions_status ON public.weekly_founder_questions USING btree (question_status);


--
-- Name: idx_weekly_founder_questions_topic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_founder_questions_topic_id ON public.weekly_founder_questions USING btree (weekly_topic_id);


--
-- Name: idx_weekly_founder_questions_video_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekly_founder_questions_video_entry_id ON public.weekly_founder_questions USING btree (weekly_video_entry_id);


--
-- Name: party_chat_cache_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX party_chat_cache_unique ON public.party_chat_cache USING btree (party_id, question_norm);


--
-- Name: party_doc_chunks_embedding_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX party_doc_chunks_embedding_idx ON public.party_doc_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: party_doc_chunks_main_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX party_doc_chunks_main_idx ON public.party_doc_chunks USING btree (party_id, doc_id, chunk_index);


--
-- Name: solo_ganadores_assets_cleanup_candidates_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solo_ganadores_assets_cleanup_candidates_idx ON public.solo_ganadores_assets USING btree (next_retry_at, deleting_at, id) WHERE ((status = 'deleting'::text) AND (deleted_at IS NULL));


--
-- Name: solo_ganadores_assets_cleanup_claims_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solo_ganadores_assets_cleanup_claims_idx ON public.solo_ganadores_assets USING btree (cleanup_claimed_at) WHERE ((status = 'deleting'::text) AND (cleanup_token IS NOT NULL));


--
-- Name: solo_ganadores_assets_cleanup_token_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX solo_ganadores_assets_cleanup_token_key ON public.solo_ganadores_assets USING btree (cleanup_token) WHERE (cleanup_token IS NOT NULL);


--
-- Name: solo_ganadores_assets_confirmed_field_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX solo_ganadores_assets_confirmed_field_key ON public.solo_ganadores_assets USING btree (resource_type, resource_id, resource_field) WHERE (status = 'confirmed'::text);


--
-- Name: solo_ganadores_assets_public_url_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solo_ganadores_assets_public_url_idx ON public.solo_ganadores_assets USING btree (public_url);


--
-- Name: solo_ganadores_assets_resource_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solo_ganadores_assets_resource_idx ON public.solo_ganadores_assets USING btree (resource_type, resource_id);


--
-- Name: solo_ganadores_assets_status_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solo_ganadores_assets_status_expires_idx ON public.solo_ganadores_assets USING btree (status, expires_at);


--
-- Name: solo_ganadores_media_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solo_ganadores_media_event_id_idx ON public.solo_ganadores_media USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: solo_ganadores_media_related_winner_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solo_ganadores_media_related_winner_id_idx ON public.solo_ganadores_media USING btree (related_winner_id) WHERE (related_winner_id IS NOT NULL);


--
-- Name: solo_ganadores_posts_event_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solo_ganadores_posts_event_id_idx ON public.solo_ganadores_posts USING btree (event_id) WHERE (event_id IS NOT NULL);


--
-- Name: uq_comment_awards_comment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_comment_awards_comment_id ON public.comment_awards USING btree (user_comment_id);


--
-- Name: uq_comment_awards_year_quarter_published; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_comment_awards_year_quarter_published ON public.comment_awards USING btree (award_year, award_quarter) WHERE (published = true);


--
-- Name: uq_reto_premio_celular; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reto_premio_celular ON public.reto_premio_participants USING btree (celular);


--
-- Name: uq_reto_premio_winners_celular_month; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_reto_premio_winners_celular_month ON public.reto_premio_winners USING btree (celular, year_month);


--
-- Name: vote_casts_party_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_casts_party_idx ON public.vote_casts USING btree (party_id);


--
-- Name: vote_casts_round_group_cast_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vote_casts_round_group_cast_key_uniq ON public.vote_casts USING btree (round_id, group_code, cast_key) WHERE (cast_key IS NOT NULL);


--
-- Name: vote_casts_round_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_casts_round_idx ON public.vote_casts USING btree (round_id);


--
-- Name: vote_casts_round_party_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_casts_round_party_idx ON public.vote_casts USING btree (round_id, party_id);


--
-- Name: vote_intention_answers_round_answer_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vote_intention_answers_round_answer_key_uniq ON public.vote_intention_answers USING btree (round_id, answer_key) WHERE (answer_key IS NOT NULL);


--
-- Name: vote_parties_enabled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_parties_enabled_idx ON public.vote_parties USING btree (round_id, enabled, "position");


--
-- Name: vote_parties_round_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_parties_round_idx ON public.vote_parties USING btree (round_id);


--
-- Name: vote_round_sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_round_sessions_expires_at_idx ON public.vote_round_sessions USING btree (expires_at);


--
-- Name: vote_round_sessions_group_code_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_round_sessions_group_code_idx ON public.vote_round_sessions USING btree (group_code);


--
-- Name: vote_round_sessions_revoked_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_round_sessions_revoked_at_idx ON public.vote_round_sessions USING btree (revoked_at) WHERE (revoked_at IS NOT NULL);


--
-- Name: vote_round_sessions_round_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_round_sessions_round_id_idx ON public.vote_round_sessions USING btree (round_id);


--
-- Name: vote_rounds_one_active_per_group_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vote_rounds_one_active_per_group_uniq ON public.vote_rounds USING btree (group_code) WHERE (is_active = true);


--
-- Name: vote_tally_round_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vote_tally_round_idx ON public.vote_tally USING btree (round_id);


--
-- Name: weekly_video_entries_one_per_access_participant_per_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX weekly_video_entries_one_per_access_participant_per_topic ON public.weekly_video_entries USING btree (weekly_topic_id, access_participant_id) WHERE (access_participant_id IS NOT NULL);


--
-- Name: weekly_video_entries_one_per_participant_per_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX weekly_video_entries_one_per_participant_per_topic ON public.weekly_video_entries USING btree (weekly_topic_id, participant_device_id) WHERE (participant_device_id IS NOT NULL);


--
-- Name: weekly_video_votes_one_per_access_participant_per_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX weekly_video_votes_one_per_access_participant_per_topic ON public.weekly_video_votes USING btree (weekly_topic_id, access_participant_id) WHERE (access_participant_id IS NOT NULL);


--
-- Name: archived_topic_forum_comments trg_block_forum_bad_words; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_forum_bad_words BEFORE INSERT ON public.archived_topic_forum_comments FOR EACH ROW EXECUTE FUNCTION public.block_forum_bad_words();


--
-- Name: archived_topic_forum_comments trg_limit_forum_comments_per_day; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_limit_forum_comments_per_day BEFORE INSERT ON public.archived_topic_forum_comments FOR EACH ROW EXECUTE FUNCTION public.limit_forum_comments_per_day();


--
-- Name: user_comments trg_limit_user_comments_per_topic; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_limit_user_comments_per_topic BEFORE INSERT ON public.user_comments FOR EACH ROW EXECUTE FUNCTION public.limit_user_comments_per_topic();


--
-- Name: weekly_video_entries trg_limit_weekly_videos_per_topic; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_limit_weekly_videos_per_topic BEFORE INSERT ON public.weekly_video_entries FOR EACH ROW EXECUTE FUNCTION public.limit_weekly_videos_per_topic();


--
-- Name: archived_topic_forum_comments trg_prevent_forum_comment_flood; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_forum_comment_flood BEFORE INSERT ON public.archived_topic_forum_comments FOR EACH ROW EXECUTE FUNCTION public.prevent_forum_comment_flood();


--
-- Name: project_supports trg_project_supports_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_project_supports_count AFTER INSERT OR DELETE ON public.project_supports FOR EACH ROW EXECUTE FUNCTION public.update_project_beneficiary_count();


--
-- Name: reto_questions trg_reto_questions_clean; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_reto_questions_clean BEFORE INSERT OR UPDATE ON public.reto_questions FOR EACH ROW EXECUTE FUNCTION public.reto_questions_clean_trigger();


--
-- Name: comment_access_participants trg_validate_forum_alias; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_forum_alias BEFORE INSERT OR UPDATE ON public.comment_access_participants FOR EACH ROW EXECUTE FUNCTION public.validate_forum_alias();


--
-- Name: user_comments trg_vc_comments_filter; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vc_comments_filter BEFORE INSERT ON public.user_comments FOR EACH ROW EXECUTE FUNCTION public.vc_comments_filter_trigger();


--
-- Name: user_comments trg_vc_comments_force_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vc_comments_force_status BEFORE INSERT ON public.user_comments FOR EACH ROW EXECUTE FUNCTION public.vc_comments_force_status_trigger();


--
-- Name: user_comments trg_vc_comments_moderate_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vc_comments_moderate_insert BEFORE INSERT ON public.user_comments FOR EACH ROW EXECUTE FUNCTION public.vc_comments_moderate_insert();


--
-- Name: vote_casts trg_vote_casts_tally; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_vote_casts_tally AFTER INSERT OR DELETE OR UPDATE OF round_id, party_id, group_code ON public.vote_casts FOR EACH ROW EXECUTE FUNCTION public.vote_tally_apply();


--
-- Name: votoclaro_live_entries trg_votoclaro_live_entries_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_votoclaro_live_entries_updated_at BEFORE UPDATE ON public.votoclaro_live_entries FOR EACH ROW EXECUTE FUNCTION public.votoclaro_set_updated_at();


--
-- Name: votoclaro_candidate_pins trg_votoclaro_pins_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_votoclaro_pins_updated_at BEFORE UPDATE ON public.votoclaro_candidate_pins FOR EACH ROW EXECUTE FUNCTION public.votoclaro_set_updated_at();


--
-- Name: vote_intention_answers update_vote_intention_answers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_vote_intention_answers_updated_at BEFORE UPDATE ON public.vote_intention_answers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: vote_intention_questions update_vote_intention_questions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_vote_intention_questions_updated_at BEFORE UPDATE ON public.vote_intention_questions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: archived_topic_forum_comments archived_topic_forum_comments_participant_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_topic_forum_comments
    ADD CONSTRAINT archived_topic_forum_comments_participant_fk FOREIGN KEY (access_participant_id) REFERENCES public.comment_access_participants(id) ON DELETE CASCADE;


--
-- Name: archived_topic_forum_comments archived_topic_forum_comments_topic_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.archived_topic_forum_comments
    ADD CONSTRAINT archived_topic_forum_comments_topic_fk FOREIGN KEY (weekly_topic_id) REFERENCES public.weekly_topics(id) ON DELETE CASCADE;


--
-- Name: candidate_panel_sessions candidate_panel_sessions_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.candidate_panel_sessions
    ADD CONSTRAINT candidate_panel_sessions_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.votoclaro_candidate_pins(candidate_id) ON DELETE CASCADE;


--
-- Name: comment_awards comment_awards_user_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_awards
    ADD CONSTRAINT comment_awards_user_comment_id_fkey FOREIGN KEY (user_comment_id) REFERENCES public.user_comments(id) ON DELETE CASCADE;


--
-- Name: espacio_afiliados espacio_afiliados_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_afiliados
    ADD CONSTRAINT espacio_afiliados_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.project_participants(id);


--
-- Name: espacio_capacitaciones espacio_capacitaciones_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_capacitaciones
    ADD CONSTRAINT espacio_capacitaciones_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.project_participants(id) ON DELETE CASCADE;


--
-- Name: espacio_capacitaciones espacio_capacitaciones_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_capacitaciones
    ADD CONSTRAINT espacio_capacitaciones_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.espacio_profesionales(id) ON DELETE CASCADE;


--
-- Name: espacio_contactos espacio_contactos_investor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_contactos
    ADD CONSTRAINT espacio_contactos_investor_id_fkey FOREIGN KEY (investor_id) REFERENCES public.espacio_inversionistas(id);


--
-- Name: espacio_contactos espacio_contactos_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_contactos
    ADD CONSTRAINT espacio_contactos_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.espacio_proyectos(id);


--
-- Name: espacio_inversionistas espacio_inversionistas_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_inversionistas
    ADD CONSTRAINT espacio_inversionistas_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.project_participants(id);


--
-- Name: espacio_mensajes espacio_mensajes_proyecto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_mensajes
    ADD CONSTRAINT espacio_mensajes_proyecto_id_fkey FOREIGN KEY (proyecto_id) REFERENCES public.espacio_proyectos(id) ON DELETE CASCADE;


--
-- Name: espacio_profesional_mensajes espacio_profesional_mensajes_professional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_profesional_mensajes
    ADD CONSTRAINT espacio_profesional_mensajes_professional_id_fkey FOREIGN KEY (professional_id) REFERENCES public.espacio_profesionales(id) ON DELETE CASCADE;


--
-- Name: espacio_profesional_mensajes espacio_profesional_mensajes_receiver_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_profesional_mensajes
    ADD CONSTRAINT espacio_profesional_mensajes_receiver_participant_id_fkey FOREIGN KEY (receiver_participant_id) REFERENCES public.project_participants(id) ON DELETE CASCADE;


--
-- Name: espacio_profesional_mensajes espacio_profesional_mensajes_sender_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_profesional_mensajes
    ADD CONSTRAINT espacio_profesional_mensajes_sender_participant_id_fkey FOREIGN KEY (sender_participant_id) REFERENCES public.project_participants(id) ON DELETE CASCADE;


--
-- Name: espacio_profesionales espacio_profesionales_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_profesionales
    ADD CONSTRAINT espacio_profesionales_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.project_participants(id) ON DELETE CASCADE;


--
-- Name: espacio_proyectos espacio_proyectos_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_proyectos
    ADD CONSTRAINT espacio_proyectos_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.espacio_afiliados(id);


--
-- Name: espacio_mensajes fk_espacio_mensajes_sender_afiliado; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_mensajes
    ADD CONSTRAINT fk_espacio_mensajes_sender_afiliado FOREIGN KEY (sender_afiliado_id) REFERENCES public.espacio_afiliados(id) ON DELETE SET NULL;


--
-- Name: espacio_mensajes fk_espacio_mensajes_sender_participant; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacio_mensajes
    ADD CONSTRAINT fk_espacio_mensajes_sender_participant FOREIGN KEY (sender_participant_id) REFERENCES public.project_participants(id) ON DELETE SET NULL;


--
-- Name: project_committee project_committee_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_committee
    ADD CONSTRAINT project_committee_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.project_participants(id);


--
-- Name: project_committee project_committee_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_committee
    ADD CONSTRAINT project_committee_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_evaluations project_evaluations_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_evaluations
    ADD CONSTRAINT project_evaluations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_forum_posts project_forum_posts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_forum_posts
    ADD CONSTRAINT project_forum_posts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.project_forum_posts(id);


--
-- Name: project_forum_posts project_forum_posts_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_forum_posts
    ADD CONSTRAINT project_forum_posts_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.project_participants(id);


--
-- Name: project_forum_posts project_forum_posts_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_forum_posts
    ADD CONSTRAINT project_forum_posts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_reports project_reports_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_reports
    ADD CONSTRAINT project_reports_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: project_reports project_reports_reported_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_reports
    ADD CONSTRAINT project_reports_reported_participant_id_fkey FOREIGN KEY (reported_participant_id) REFERENCES public.project_participants(id);


--
-- Name: project_reports project_reports_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_reports
    ADD CONSTRAINT project_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.project_participants(id);


--
-- Name: project_supports project_supports_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_supports
    ADD CONSTRAINT project_supports_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.project_participants(id);


--
-- Name: project_supports project_supports_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_supports
    ADD CONSTRAINT project_supports_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.project_cycles(id);


--
-- Name: project_supports project_supports_participant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_supports
    ADD CONSTRAINT project_supports_participant_id_fkey FOREIGN KEY (participant_id) REFERENCES public.project_participants(id);


--
-- Name: project_supports project_supports_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_supports
    ADD CONSTRAINT project_supports_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: projects projects_cycle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_cycle_id_fkey FOREIGN KEY (cycle_id) REFERENCES public.project_cycles(id);


--
-- Name: projects projects_leader_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_leader_id_fkey FOREIGN KEY (leader_id) REFERENCES public.project_participants(id);


--
-- Name: solo_ganadores_media solo_ganadores_media_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solo_ganadores_media
    ADD CONSTRAINT solo_ganadores_media_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.solo_ganadores_events(id) ON DELETE RESTRICT;


--
-- Name: solo_ganadores_media solo_ganadores_media_related_winner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solo_ganadores_media
    ADD CONSTRAINT solo_ganadores_media_related_winner_id_fkey FOREIGN KEY (related_winner_id) REFERENCES public.solo_ganadores_posts(id) ON DELETE SET NULL;


--
-- Name: solo_ganadores_posts solo_ganadores_posts_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solo_ganadores_posts
    ADD CONSTRAINT solo_ganadores_posts_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.solo_ganadores_events(id) ON DELETE RESTRICT;


--
-- Name: vote_casts vote_casts_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_casts
    ADD CONSTRAINT vote_casts_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.vote_parties(id) ON DELETE CASCADE;


--
-- Name: vote_casts vote_casts_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_casts
    ADD CONSTRAINT vote_casts_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.vote_rounds(id) ON DELETE CASCADE;


--
-- Name: vote_intention_answers vote_intention_answers_questions_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_intention_answers
    ADD CONSTRAINT vote_intention_answers_questions_id_fkey FOREIGN KEY (questions_id) REFERENCES public.vote_intention_questions(id) ON DELETE SET NULL;


--
-- Name: vote_intention_questions vote_intention_questions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_intention_questions
    ADD CONSTRAINT vote_intention_questions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: vote_parties vote_parties_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_parties
    ADD CONSTRAINT vote_parties_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.vote_rounds(id) ON DELETE CASCADE;


--
-- Name: vote_round_sessions vote_round_sessions_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_round_sessions
    ADD CONSTRAINT vote_round_sessions_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.vote_rounds(id);


--
-- Name: vote_tally vote_tally_party_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_tally
    ADD CONSTRAINT vote_tally_party_id_fkey FOREIGN KEY (party_id) REFERENCES public.vote_parties(id) ON DELETE CASCADE;


--
-- Name: vote_tally vote_tally_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vote_tally
    ADD CONSTRAINT vote_tally_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.vote_rounds(id) ON DELETE CASCADE;


--
-- Name: weekly_founder_questions weekly_founder_questions_weekly_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_founder_questions
    ADD CONSTRAINT weekly_founder_questions_weekly_topic_id_fkey FOREIGN KEY (weekly_topic_id) REFERENCES public.weekly_topics(id) ON DELETE CASCADE;


--
-- Name: weekly_founder_questions weekly_founder_questions_weekly_video_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_founder_questions
    ADD CONSTRAINT weekly_founder_questions_weekly_video_entry_id_fkey FOREIGN KEY (weekly_video_entry_id) REFERENCES public.weekly_video_entries(id) ON DELETE CASCADE;


--
-- Name: weekly_topics weekly_topics_winner_video_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_topics
    ADD CONSTRAINT weekly_topics_winner_video_entry_id_fkey FOREIGN KEY (winner_video_entry_id) REFERENCES public.weekly_video_entries(id) ON DELETE SET NULL;


--
-- Name: weekly_video_entries weekly_video_entries_weekly_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_video_entries
    ADD CONSTRAINT weekly_video_entries_weekly_topic_id_fkey FOREIGN KEY (weekly_topic_id) REFERENCES public.weekly_topics(id) ON DELETE CASCADE;


--
-- Name: weekly_video_votes weekly_video_votes_weekly_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_video_votes
    ADD CONSTRAINT weekly_video_votes_weekly_topic_id_fkey FOREIGN KEY (weekly_topic_id) REFERENCES public.weekly_topics(id) ON DELETE CASCADE;


--
-- Name: weekly_video_votes weekly_video_votes_weekly_video_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekly_video_votes
    ADD CONSTRAINT weekly_video_votes_weekly_video_entry_id_fkey FOREIGN KEY (weekly_video_entry_id) REFERENCES public.weekly_video_entries(id) ON DELETE CASCADE;


--
-- Name: solo_ganadores_events Authenticated admin can manage solo ganadores events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated admin can manage solo ganadores events" ON public.solo_ganadores_events TO authenticated USING (true) WITH CHECK (true);


--
-- Name: solo_ganadores_media Authenticated admin can manage solo ganadores media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated admin can manage solo ganadores media" ON public.solo_ganadores_media TO authenticated USING (true) WITH CHECK (true);


--
-- Name: solo_ganadores_posts Authenticated admin can manage solo ganadores posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated admin can manage solo ganadores posts" ON public.solo_ganadores_posts TO authenticated USING (true) WITH CHECK (true);


--
-- Name: espacio_proyectos Propietarios pueden actualizar sus proyectos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Propietarios pueden actualizar sus proyectos" ON public.espacio_proyectos FOR UPDATE USING (true);


--
-- Name: solo_ganadores_events Public can read published solo ganadores events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read published solo ganadores events" ON public.solo_ganadores_events FOR SELECT USING ((published = true));


--
-- Name: solo_ganadores_media Public can read published solo ganadores media; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read published solo ganadores media" ON public.solo_ganadores_media FOR SELECT USING ((published = true));


--
-- Name: solo_ganadores_posts Public can read published solo ganadores posts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public can read published solo ganadores posts" ON public.solo_ganadores_posts FOR SELECT USING ((published = true));


--
-- Name: espacio_proyectos Todos pueden ver proyectos activos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Todos pueden ver proyectos activos" ON public.espacio_proyectos FOR SELECT USING ((status = 'active'::text));


--
-- Name: espacio_proyectos Usuarios pueden insertar proyectos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Usuarios pueden insertar proyectos" ON public.espacio_proyectos FOR INSERT WITH CHECK (true);


--
-- Name: candidate_panel_pin_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.candidate_panel_pin_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: candidate_panel_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.candidate_panel_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: espacio_capacitaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.espacio_capacitaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: espacio_profesional_mensajes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.espacio_profesional_mensajes ENABLE ROW LEVEL SECURITY;

--
-- Name: espacio_profesionales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.espacio_profesionales ENABLE ROW LEVEL SECURITY;

--
-- Name: votoclaro_live_entries live_entries_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY live_entries_public_select ON public.votoclaro_live_entries FOR SELECT TO authenticated, anon USING (true);


--
-- Name: user_comments public can insert comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public can insert comments" ON public.user_comments FOR INSERT WITH CHECK (true);


--
-- Name: votoclaro_public_links public can read active pitch tokens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public can read active pitch tokens" ON public.votoclaro_public_links FOR SELECT TO anon USING (((is_active = true) AND (route = '/pitch'::text) AND ((expires_at IS NULL) OR (expires_at > now()))));


--
-- Name: user_comments public can read published; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "public can read published" ON public.user_comments FOR SELECT USING ((status = 'published'::text));


--
-- Name: solo_ganadores_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solo_ganadores_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: solo_ganadores_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solo_ganadores_events ENABLE ROW LEVEL SECURITY;

--
-- Name: solo_ganadores_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solo_ganadores_media ENABLE ROW LEVEL SECURITY;

--
-- Name: solo_ganadores_posts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solo_ganadores_posts ENABLE ROW LEVEL SECURITY;

--
-- Name: user_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: vote_casts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vote_casts ENABLE ROW LEVEL SECURITY;

--
-- Name: vote_intention_answers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vote_intention_answers ENABLE ROW LEVEL SECURITY;

--
-- Name: vote_intention_questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vote_intention_questions ENABLE ROW LEVEL SECURITY;

--
-- Name: vote_parties; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vote_parties ENABLE ROW LEVEL SECURITY;

--
-- Name: vote_round_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vote_round_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: vote_rounds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vote_rounds ENABLE ROW LEVEL SECURITY;

--
-- Name: vote_tally; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vote_tally ENABLE ROW LEVEL SECURITY;

--
-- Name: votoclaro_candidate_pins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.votoclaro_candidate_pins ENABLE ROW LEVEL SECURITY;

--
-- Name: votoclaro_live_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.votoclaro_live_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: votoclaro_public_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.votoclaro_public_links ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION _solo_ganadores_clean_optional_text(p_value text, p_max_length integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_clean_optional_text(p_value text, p_max_length integer) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_clean_optional_url(p_value text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_clean_optional_url(p_value text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_confirm_asset(p_asset_id uuid, p_resource_type text, p_resource_id uuid, p_resource_field text, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_confirm_asset(p_asset_id uuid, p_resource_type text, p_resource_id uuid, p_resource_field text, p_now timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_jsonb_boolean(p_data jsonb, p_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_jsonb_boolean(p_data jsonb, p_key text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_jsonb_has_exact_keys(p_data jsonb, p_keys text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_jsonb_has_exact_keys(p_data jsonb, p_keys text[]) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_jsonb_optional_date(p_data jsonb, p_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_jsonb_optional_date(p_data jsonb, p_key text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_jsonb_optional_string(p_data jsonb, p_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_jsonb_optional_string(p_data jsonb, p_key text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_jsonb_optional_uuid(p_data jsonb, p_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_jsonb_optional_uuid(p_data jsonb, p_key text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_jsonb_string(p_data jsonb, p_key text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_jsonb_string(p_data jsonb, p_key text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_lock_assets(p_asset_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_lock_assets(p_asset_ids uuid[]) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_media_expected_asset(p_media_type text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_media_expected_asset(p_media_type text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_release_asset(p_asset_id uuid, p_now timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_release_asset(p_asset_id uuid, p_now timestamp with time zone) FROM PUBLIC;


--
-- Name: TABLE solo_ganadores_assets; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solo_ganadores_assets TO anon;
GRANT ALL ON TABLE public.solo_ganadores_assets TO authenticated;
GRANT ALL ON TABLE public.solo_ganadores_assets TO service_role;


--
-- Name: FUNCTION _solo_ganadores_require_current_asset(p_found_asset_id uuid, p_expected_asset_id uuid, p_resource_type text, p_resource_id uuid, p_resource_field text, p_expected_purpose text, p_expected_kind text, p_current_url text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_require_current_asset(p_found_asset_id uuid, p_expected_asset_id uuid, p_resource_type text, p_resource_id uuid, p_resource_field text, p_expected_purpose text, p_expected_kind text, p_current_url text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_require_pending_asset(p_asset_id uuid, p_expected_purpose text, p_expected_kind text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_require_pending_asset(p_asset_id uuid, p_expected_purpose text, p_expected_kind text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_require_pending_asset_for_update(p_asset_id uuid, p_expected_purpose text, p_expected_kind text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_require_pending_asset_for_update(p_asset_id uuid, p_expected_purpose text, p_expected_kind text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_require_text(p_value text, p_max_length integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_require_text(p_value text, p_max_length integer) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_require_url(p_value text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_require_url(p_value text) FROM PUBLIC;


--
-- Name: FUNCTION _solo_ganadores_validate_action(p_action text, p_current_asset_id uuid, p_new_asset_id uuid, p_allow_clear boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public._solo_ganadores_validate_action(p_action text, p_current_asset_id uuid, p_new_asset_id uuid, p_allow_clear boolean) FROM PUBLIC;


--
-- Name: FUNCTION activate_current_month_round(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.activate_current_month_round() FROM PUBLIC;


--
-- Name: FUNCTION activate_next_weekly_topic(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.activate_next_weekly_topic() TO anon;
GRANT ALL ON FUNCTION public.activate_next_weekly_topic() TO authenticated;
GRANT ALL ON FUNCTION public.activate_next_weekly_topic() TO service_role;


--
-- Name: FUNCTION activate_vote_round_draft(p_round_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.activate_vote_round_draft(p_round_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activate_vote_round_draft(p_round_id uuid) TO service_role;


--
-- Name: FUNCTION advance_weekly_topics_cycle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.advance_weekly_topics_cycle() TO anon;
GRANT ALL ON FUNCTION public.advance_weekly_topics_cycle() TO authenticated;
GRANT ALL ON FUNCTION public.advance_weekly_topics_cycle() TO service_role;


--
-- Name: FUNCTION block_forum_bad_words(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.block_forum_bad_words() TO anon;
GRANT ALL ON FUNCTION public.block_forum_bad_words() TO authenticated;
GRANT ALL ON FUNCTION public.block_forum_bad_words() TO service_role;


--
-- Name: FUNCTION can_user_comment(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_user_comment(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_user_comment(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_user_comment(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION can_user_comment_user_comments(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_user_comment_user_comments(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_user_comment_user_comments(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_user_comment_user_comments(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION can_user_win_quarterly_award(p_user_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.can_user_win_quarterly_award(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.can_user_win_quarterly_award(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.can_user_win_quarterly_award(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION check_candidate_panel_pin_rate_limit(p_candidate_id text, p_ip_fingerprint text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_candidate_panel_pin_rate_limit(p_candidate_id text, p_ip_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_candidate_panel_pin_rate_limit(p_candidate_id text, p_ip_fingerprint text) TO service_role;


--
-- Name: FUNCTION claim_solo_ganadores_assets_for_cleanup(p_limit integer, p_grace_seconds integer, p_claim_ttl_seconds integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.claim_solo_ganadores_assets_for_cleanup(p_limit integer, p_grace_seconds integer, p_claim_ttl_seconds integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_solo_ganadores_assets_for_cleanup(p_limit integer, p_grace_seconds integer, p_claim_ttl_seconds integer) TO service_role;


--
-- Name: FUNCTION cleanup_candidate_panel_auth_state(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_candidate_panel_auth_state() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_candidate_panel_auth_state() TO service_role;


--
-- Name: FUNCTION close_active_vote_round(p_round_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.close_active_vote_round(p_round_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.close_active_vote_round(p_round_id uuid) TO service_role;


--
-- Name: FUNCTION close_project_cycle(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.close_project_cycle() TO anon;
GRANT ALL ON FUNCTION public.close_project_cycle() TO authenticated;
GRANT ALL ON FUNCTION public.close_project_cycle() TO service_role;


--
-- Name: FUNCTION complete_solo_ganadores_asset_cleanup(p_asset_id uuid, p_cleanup_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.complete_solo_ganadores_asset_cleanup(p_asset_id uuid, p_cleanup_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complete_solo_ganadores_asset_cleanup(p_asset_id uuid, p_cleanup_token uuid) TO service_role;


--
-- Name: FUNCTION create_candidate_live_entry(p_candidate_id text, p_candidate_name text, p_platform text, p_url text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_candidate_live_entry(p_candidate_id text, p_candidate_name text, p_platform text, p_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_candidate_live_entry(p_candidate_id text, p_candidate_name text, p_platform text, p_url text) TO service_role;


--
-- Name: FUNCTION create_candidate_panel_session_if_active(p_candidate_id text, p_expected_revision bigint, p_token_hash text, p_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_candidate_panel_session_if_active(p_candidate_id text, p_expected_revision bigint, p_token_hash text, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_candidate_panel_session_if_active(p_candidate_id text, p_expected_revision bigint, p_token_hash text, p_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION create_monthly_vote_round(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_monthly_vote_round() FROM PUBLIC;


--
-- Name: FUNCTION create_solo_ganadores_event(p_data jsonb, p_main_image_asset_id uuid, p_promo_video_asset_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_solo_ganadores_event(p_data jsonb, p_main_image_asset_id uuid, p_promo_video_asset_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_solo_ganadores_event(p_data jsonb, p_main_image_asset_id uuid, p_promo_video_asset_id uuid) TO service_role;


--
-- Name: FUNCTION create_solo_ganadores_media(p_data jsonb, p_media_asset_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_solo_ganadores_media(p_data jsonb, p_media_asset_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_solo_ganadores_media(p_data jsonb, p_media_asset_id uuid) TO service_role;


--
-- Name: FUNCTION create_solo_ganadores_post(p_data jsonb, p_photo_asset_id uuid, p_video_asset_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_solo_ganadores_post(p_data jsonb, p_photo_asset_id uuid, p_video_asset_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_solo_ganadores_post(p_data jsonb, p_photo_asset_id uuid, p_video_asset_id uuid) TO service_role;


--
-- Name: FUNCTION create_vote_round_draft(p_name text, p_group_code text, p_identity_mode text, p_ends_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_vote_round_draft(p_name text, p_group_code text, p_identity_mode text, p_ends_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_vote_round_draft(p_name text, p_group_code text, p_identity_mode text, p_ends_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION create_vote_round_draft_with_parties(p_name text, p_group_code text, p_identity_mode text, p_ends_at timestamp with time zone, p_source_round_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_vote_round_draft_with_parties(p_name text, p_group_code text, p_identity_mode text, p_ends_at timestamp with time zone, p_source_round_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_vote_round_draft_with_parties(p_name text, p_group_code text, p_identity_mode text, p_ends_at timestamp with time zone, p_source_round_id uuid) TO service_role;


--
-- Name: FUNCTION delete_solo_ganadores_event(p_id uuid, p_expected_updated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_solo_ganadores_event(p_id uuid, p_expected_updated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_solo_ganadores_event(p_id uuid, p_expected_updated_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION delete_solo_ganadores_media(p_id uuid, p_expected_updated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_solo_ganadores_media(p_id uuid, p_expected_updated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_solo_ganadores_media(p_id uuid, p_expected_updated_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION delete_solo_ganadores_post(p_id uuid, p_expected_updated_at timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.delete_solo_ganadores_post(p_id uuid, p_expected_updated_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_solo_ganadores_post(p_id uuid, p_expected_updated_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION disable_candidate_panel_access(p_candidate_id text, p_expected_revision bigint, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.disable_candidate_panel_access(p_candidate_id text, p_expected_revision bigint, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.disable_candidate_panel_access(p_candidate_id text, p_expected_revision bigint, p_reason text) TO service_role;


--
-- Name: FUNCTION fail_solo_ganadores_asset_cleanup(p_asset_id uuid, p_cleanup_token uuid, p_error_code text, p_retryable boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fail_solo_ganadores_asset_cleanup(p_asset_id uuid, p_cleanup_token uuid, p_error_code text, p_retryable boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fail_solo_ganadores_asset_cleanup(p_asset_id uuid, p_cleanup_token uuid, p_error_code text, p_retryable boolean) TO service_role;


--
-- Name: FUNCTION fix_mojibake_es(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fix_mojibake_es(input text) TO anon;
GRANT ALL ON FUNCTION public.fix_mojibake_es(input text) TO authenticated;
GRANT ALL ON FUNCTION public.fix_mojibake_es(input text) TO service_role;


--
-- Name: FUNCTION fragmentos_de_partido_de_coincidencia(p_match_count integer, p_party_id text, p_query_embedding public.vector); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fragmentos_de_partido_de_coincidencia(p_match_count integer, p_party_id text, p_query_embedding public.vector) TO anon;
GRANT ALL ON FUNCTION public.fragmentos_de_partido_de_coincidencia(p_match_count integer, p_party_id text, p_query_embedding public.vector) TO authenticated;
GRANT ALL ON FUNCTION public.fragmentos_de_partido_de_coincidencia(p_match_count integer, p_party_id text, p_query_embedding public.vector) TO service_role;


--
-- Name: FUNCTION generar_codigo_acceso(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generar_codigo_acceso() TO anon;
GRANT ALL ON FUNCTION public.generar_codigo_acceso() TO authenticated;
GRANT ALL ON FUNCTION public.generar_codigo_acceso() TO service_role;


--
-- Name: FUNCTION generar_codigo_profesional(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generar_codigo_profesional() TO anon;
GRANT ALL ON FUNCTION public.generar_codigo_profesional() TO authenticated;
GRANT ALL ON FUNCTION public.generar_codigo_profesional() TO service_role;


--
-- Name: FUNCTION get_active_questions(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_active_questions() FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_active_questions() TO service_role;


--
-- Name: FUNCTION get_reto_ganadores(filtro text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_reto_ganadores(filtro text) TO anon;
GRANT ALL ON FUNCTION public.get_reto_ganadores(filtro text) TO authenticated;
GRANT ALL ON FUNCTION public.get_reto_ganadores(filtro text) TO service_role;


--
-- Name: FUNCTION has_user_answered_intention(p_device_id text, p_round_id uuid, p_party_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_user_answered_intention(p_device_id text, p_round_id uuid, p_party_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION limit_forum_comments_per_day(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.limit_forum_comments_per_day() TO anon;
GRANT ALL ON FUNCTION public.limit_forum_comments_per_day() TO authenticated;
GRANT ALL ON FUNCTION public.limit_forum_comments_per_day() TO service_role;


--
-- Name: FUNCTION limit_user_comments_per_topic(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.limit_user_comments_per_topic() TO anon;
GRANT ALL ON FUNCTION public.limit_user_comments_per_topic() TO authenticated;
GRANT ALL ON FUNCTION public.limit_user_comments_per_topic() TO service_role;


--
-- Name: FUNCTION limit_weekly_videos_per_topic(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.limit_weekly_videos_per_topic() TO anon;
GRANT ALL ON FUNCTION public.limit_weekly_videos_per_topic() TO authenticated;
GRANT ALL ON FUNCTION public.limit_weekly_videos_per_topic() TO service_role;


--
-- Name: FUNCTION match_party_chunks(p_party_id text, p_query_embedding public.vector, p_match_count integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.match_party_chunks(p_party_id text, p_query_embedding public.vector, p_match_count integer) TO anon;
GRANT ALL ON FUNCTION public.match_party_chunks(p_party_id text, p_query_embedding public.vector, p_match_count integer) TO authenticated;
GRANT ALL ON FUNCTION public.match_party_chunks(p_party_id text, p_query_embedding public.vector, p_match_count integer) TO service_role;


--
-- Name: FUNCTION prepare_solo_ganadores_expired_pending_assets_for_cleanup(p_asset_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(p_asset_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.prepare_solo_ganadores_expired_pending_assets_for_cleanup(p_asset_ids uuid[]) TO service_role;


--
-- Name: FUNCTION prepare_solo_ganadores_orphan_storage_assets_for_cleanup(p_asset_ids uuid[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.prepare_solo_ganadores_orphan_storage_assets_for_cleanup(p_asset_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.prepare_solo_ganadores_orphan_storage_assets_for_cleanup(p_asset_ids uuid[]) TO service_role;


--
-- Name: FUNCTION prevent_forum_comment_flood(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_forum_comment_flood() TO anon;
GRANT ALL ON FUNCTION public.prevent_forum_comment_flood() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_forum_comment_flood() TO service_role;


--
-- Name: FUNCTION publish_weekly_winner_for_topic(p_topic_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.publish_weekly_winner_for_topic(p_topic_id uuid) TO anon;
GRANT ALL ON FUNCTION public.publish_weekly_winner_for_topic(p_topic_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.publish_weekly_winner_for_topic(p_topic_id uuid) TO service_role;


--
-- Name: FUNCTION record_candidate_panel_pin_failure(p_candidate_id text, p_ip_fingerprint text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.record_candidate_panel_pin_failure(p_candidate_id text, p_ip_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_candidate_panel_pin_failure(p_candidate_id text, p_ip_fingerprint text) TO service_role;


--
-- Name: FUNCTION reset_candidate_panel_pin_rate_limit(p_candidate_id text, p_ip_fingerprint text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reset_candidate_panel_pin_rate_limit(p_candidate_id text, p_ip_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reset_candidate_panel_pin_rate_limit(p_candidate_id text, p_ip_fingerprint text) TO service_role;


--
-- Name: FUNCTION reto_questions_clean_trigger(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reto_questions_clean_trigger() TO anon;
GRANT ALL ON FUNCTION public.reto_questions_clean_trigger() TO authenticated;
GRANT ALL ON FUNCTION public.reto_questions_clean_trigger() TO service_role;


--
-- Name: FUNCTION rotate_candidate_access_code(p_candidate_id text, p_expected_revision bigint, p_access_code_verifier text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rotate_candidate_access_code(p_candidate_id text, p_expected_revision bigint, p_access_code_verifier text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rotate_candidate_access_code(p_candidate_id text, p_expected_revision bigint, p_access_code_verifier text) TO service_role;


--
-- Name: FUNCTION solo_ganadores_asset_has_active_reference(p_public_url text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.solo_ganadores_asset_has_active_reference(p_public_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.solo_ganadores_asset_has_active_reference(p_public_url text) TO service_role;


--
-- Name: FUNCTION update_project_beneficiary_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_project_beneficiary_count() TO anon;
GRANT ALL ON FUNCTION public.update_project_beneficiary_count() TO authenticated;
GRANT ALL ON FUNCTION public.update_project_beneficiary_count() TO service_role;


--
-- Name: FUNCTION update_solo_ganadores_event(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_main_image_action text, p_main_image_current_asset_id uuid, p_main_image_new_asset_id uuid, p_promo_video_action text, p_promo_video_current_asset_id uuid, p_promo_video_new_asset_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_solo_ganadores_event(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_main_image_action text, p_main_image_current_asset_id uuid, p_main_image_new_asset_id uuid, p_promo_video_action text, p_promo_video_current_asset_id uuid, p_promo_video_new_asset_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_solo_ganadores_event(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_main_image_action text, p_main_image_current_asset_id uuid, p_main_image_new_asset_id uuid, p_promo_video_action text, p_promo_video_current_asset_id uuid, p_promo_video_new_asset_id uuid) TO service_role;


--
-- Name: FUNCTION update_solo_ganadores_media(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_media_action text, p_media_current_asset_id uuid, p_media_new_asset_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_solo_ganadores_media(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_media_action text, p_media_current_asset_id uuid, p_media_new_asset_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_solo_ganadores_media(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_media_action text, p_media_current_asset_id uuid, p_media_new_asset_id uuid) TO service_role;


--
-- Name: FUNCTION update_solo_ganadores_post(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_photo_action text, p_photo_current_asset_id uuid, p_photo_new_asset_id uuid, p_video_action text, p_video_current_asset_id uuid, p_video_new_asset_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_solo_ganadores_post(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_photo_action text, p_photo_current_asset_id uuid, p_photo_new_asset_id uuid, p_video_action text, p_video_current_asset_id uuid, p_video_new_asset_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_solo_ganadores_post(p_id uuid, p_data jsonb, p_expected_updated_at timestamp with time zone, p_photo_action text, p_photo_current_asset_id uuid, p_photo_new_asset_id uuid, p_video_action text, p_video_current_asset_id uuid, p_video_new_asset_id uuid) TO service_role;


--
-- Name: FUNCTION update_updated_at_column(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC;


--
-- Name: FUNCTION validate_forum_alias(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.validate_forum_alias() TO anon;
GRANT ALL ON FUNCTION public.validate_forum_alias() TO authenticated;
GRANT ALL ON FUNCTION public.validate_forum_alias() TO service_role;


--
-- Name: FUNCTION validate_solo_ganadores_orphan_storage_asset_before_remove(p_asset_id uuid, p_cleanup_token uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validate_solo_ganadores_orphan_storage_asset_before_remove(p_asset_id uuid, p_cleanup_token uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.validate_solo_ganadores_orphan_storage_asset_before_remove(p_asset_id uuid, p_cleanup_token uuid) TO service_role;


--
-- Name: FUNCTION vc_comments_filter_trigger(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vc_comments_filter_trigger() TO anon;
GRANT ALL ON FUNCTION public.vc_comments_filter_trigger() TO authenticated;
GRANT ALL ON FUNCTION public.vc_comments_filter_trigger() TO service_role;


--
-- Name: FUNCTION vc_comments_force_status_trigger(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vc_comments_force_status_trigger() TO anon;
GRANT ALL ON FUNCTION public.vc_comments_force_status_trigger() TO authenticated;
GRANT ALL ON FUNCTION public.vc_comments_force_status_trigger() TO service_role;


--
-- Name: FUNCTION vc_comments_moderate_insert(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vc_comments_moderate_insert() TO anon;
GRANT ALL ON FUNCTION public.vc_comments_moderate_insert() TO authenticated;
GRANT ALL ON FUNCTION public.vc_comments_moderate_insert() TO service_role;


--
-- Name: FUNCTION vc_has_banned(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vc_has_banned(input text) TO anon;
GRANT ALL ON FUNCTION public.vc_has_banned(input text) TO authenticated;
GRANT ALL ON FUNCTION public.vc_has_banned(input text) TO service_role;


--
-- Name: FUNCTION vc_has_banned_words(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vc_has_banned_words(input text) TO anon;
GRANT ALL ON FUNCTION public.vc_has_banned_words(input text) TO authenticated;
GRANT ALL ON FUNCTION public.vc_has_banned_words(input text) TO service_role;


--
-- Name: FUNCTION vc_list_columns(p_table text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vc_list_columns(p_table text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.vc_list_columns(p_table text) TO anon;
GRANT ALL ON FUNCTION public.vc_list_columns(p_table text) TO authenticated;
GRANT ALL ON FUNCTION public.vc_list_columns(p_table text) TO service_role;


--
-- Name: FUNCTION vc_norm_text(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vc_norm_text(input text) TO anon;
GRANT ALL ON FUNCTION public.vc_norm_text(input text) TO authenticated;
GRANT ALL ON FUNCTION public.vc_norm_text(input text) TO service_role;


--
-- Name: FUNCTION vc_normalize_text(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.vc_normalize_text(input text) TO anon;
GRANT ALL ON FUNCTION public.vc_normalize_text(input text) TO authenticated;
GRANT ALL ON FUNCTION public.vc_normalize_text(input text) TO service_role;


--
-- Name: FUNCTION vote_tally_apply(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.vote_tally_apply() FROM PUBLIC;


--
-- Name: FUNCTION votoclaro_set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.votoclaro_set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.votoclaro_set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.votoclaro_set_updated_at() TO service_role;


--
-- Name: TABLE archived_topic_forum_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.archived_topic_forum_comments TO anon;
GRANT ALL ON TABLE public.archived_topic_forum_comments TO authenticated;
GRANT ALL ON TABLE public.archived_topic_forum_comments TO service_role;


--
-- Name: TABLE candidate_panel_pin_attempts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.candidate_panel_pin_attempts TO service_role;


--
-- Name: TABLE candidate_panel_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.candidate_panel_sessions TO service_role;


--
-- Name: TABLE comment_access_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comment_access_participants TO anon;
GRANT ALL ON TABLE public.comment_access_participants TO authenticated;
GRANT ALL ON TABLE public.comment_access_participants TO service_role;


--
-- Name: TABLE comment_awards; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.comment_awards TO anon;
GRANT ALL ON TABLE public.comment_awards TO authenticated;
GRANT ALL ON TABLE public.comment_awards TO service_role;


--
-- Name: TABLE espacio_afiliados; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.espacio_afiliados TO anon;
GRANT ALL ON TABLE public.espacio_afiliados TO authenticated;
GRANT ALL ON TABLE public.espacio_afiliados TO service_role;


--
-- Name: TABLE espacio_capacitaciones; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.espacio_capacitaciones TO anon;
GRANT ALL ON TABLE public.espacio_capacitaciones TO authenticated;
GRANT ALL ON TABLE public.espacio_capacitaciones TO service_role;


--
-- Name: TABLE espacio_contactos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.espacio_contactos TO anon;
GRANT ALL ON TABLE public.espacio_contactos TO authenticated;
GRANT ALL ON TABLE public.espacio_contactos TO service_role;


--
-- Name: TABLE espacio_inversionistas; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.espacio_inversionistas TO anon;
GRANT ALL ON TABLE public.espacio_inversionistas TO authenticated;
GRANT ALL ON TABLE public.espacio_inversionistas TO service_role;


--
-- Name: TABLE espacio_mensajes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.espacio_mensajes TO anon;
GRANT ALL ON TABLE public.espacio_mensajes TO authenticated;
GRANT ALL ON TABLE public.espacio_mensajes TO service_role;


--
-- Name: TABLE espacio_mensajes_backup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.espacio_mensajes_backup TO anon;
GRANT ALL ON TABLE public.espacio_mensajes_backup TO authenticated;
GRANT ALL ON TABLE public.espacio_mensajes_backup TO service_role;


--
-- Name: TABLE espacio_profesional_mensajes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.espacio_profesional_mensajes TO anon;
GRANT ALL ON TABLE public.espacio_profesional_mensajes TO authenticated;
GRANT ALL ON TABLE public.espacio_profesional_mensajes TO service_role;


--
-- Name: TABLE espacio_profesionales; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.espacio_profesionales TO anon;
GRANT ALL ON TABLE public.espacio_profesionales TO authenticated;
GRANT ALL ON TABLE public.espacio_profesionales TO service_role;


--
-- Name: TABLE espacio_proyectos; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.espacio_proyectos TO anon;
GRANT ALL ON TABLE public.espacio_proyectos TO authenticated;
GRANT ALL ON TABLE public.espacio_proyectos TO service_role;


--
-- Name: TABLE party_chat_cache; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.party_chat_cache TO anon;
GRANT ALL ON TABLE public.party_chat_cache TO authenticated;
GRANT ALL ON TABLE public.party_chat_cache TO service_role;


--
-- Name: SEQUENCE party_chat_cache_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.party_chat_cache_id_seq TO anon;
GRANT ALL ON SEQUENCE public.party_chat_cache_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.party_chat_cache_id_seq TO service_role;


--
-- Name: TABLE party_doc_chunks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.party_doc_chunks TO anon;
GRANT ALL ON TABLE public.party_doc_chunks TO authenticated;
GRANT ALL ON TABLE public.party_doc_chunks TO service_role;


--
-- Name: SEQUENCE party_doc_chunks_id_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.party_doc_chunks_id_seq TO anon;
GRANT ALL ON SEQUENCE public.party_doc_chunks_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.party_doc_chunks_id_seq TO service_role;


--
-- Name: TABLE project_committee; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_committee TO anon;
GRANT ALL ON TABLE public.project_committee TO authenticated;
GRANT ALL ON TABLE public.project_committee TO service_role;


--
-- Name: TABLE project_cycles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_cycles TO anon;
GRANT ALL ON TABLE public.project_cycles TO authenticated;
GRANT ALL ON TABLE public.project_cycles TO service_role;


--
-- Name: TABLE project_evaluations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_evaluations TO anon;
GRANT ALL ON TABLE public.project_evaluations TO authenticated;
GRANT ALL ON TABLE public.project_evaluations TO service_role;


--
-- Name: TABLE project_forum_posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_forum_posts TO anon;
GRANT ALL ON TABLE public.project_forum_posts TO authenticated;
GRANT ALL ON TABLE public.project_forum_posts TO service_role;


--
-- Name: TABLE project_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_participants TO anon;
GRANT ALL ON TABLE public.project_participants TO authenticated;
GRANT ALL ON TABLE public.project_participants TO service_role;


--
-- Name: TABLE project_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_reports TO anon;
GRANT ALL ON TABLE public.project_reports TO authenticated;
GRANT ALL ON TABLE public.project_reports TO service_role;


--
-- Name: TABLE project_supports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.project_supports TO anon;
GRANT ALL ON TABLE public.project_supports TO authenticated;
GRANT ALL ON TABLE public.project_supports TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: TABLE reto_ganadores; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reto_ganadores TO anon;
GRANT ALL ON TABLE public.reto_ganadores TO authenticated;
GRANT ALL ON TABLE public.reto_ganadores TO service_role;


--
-- Name: TABLE reto_premio_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reto_premio_participants TO anon;
GRANT ALL ON TABLE public.reto_premio_participants TO authenticated;
GRANT ALL ON TABLE public.reto_premio_participants TO service_role;


--
-- Name: TABLE reto_premio_winners; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reto_premio_winners TO anon;
GRANT ALL ON TABLE public.reto_premio_winners TO authenticated;
GRANT ALL ON TABLE public.reto_premio_winners TO service_role;


--
-- Name: TABLE reto_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reto_questions TO anon;
GRANT ALL ON TABLE public.reto_questions TO authenticated;
GRANT ALL ON TABLE public.reto_questions TO service_role;


--
-- Name: TABLE reto_questions_backup; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reto_questions_backup TO anon;
GRANT ALL ON TABLE public.reto_questions_backup TO authenticated;
GRANT ALL ON TABLE public.reto_questions_backup TO service_role;


--
-- Name: TABLE reto_questions_backup_20260315; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.reto_questions_backup_20260315 TO anon;
GRANT ALL ON TABLE public.reto_questions_backup_20260315 TO authenticated;
GRANT ALL ON TABLE public.reto_questions_backup_20260315 TO service_role;


--
-- Name: TABLE solo_ganadores_events; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solo_ganadores_events TO anon;
GRANT ALL ON TABLE public.solo_ganadores_events TO authenticated;
GRANT ALL ON TABLE public.solo_ganadores_events TO service_role;


--
-- Name: TABLE solo_ganadores_media; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solo_ganadores_media TO anon;
GRANT ALL ON TABLE public.solo_ganadores_media TO authenticated;
GRANT ALL ON TABLE public.solo_ganadores_media TO service_role;


--
-- Name: TABLE solo_ganadores_posts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.solo_ganadores_posts TO anon;
GRANT ALL ON TABLE public.solo_ganadores_posts TO authenticated;
GRANT ALL ON TABLE public.solo_ganadores_posts TO service_role;


--
-- Name: TABLE user_comments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_comments TO anon;
GRANT ALL ON TABLE public.user_comments TO authenticated;
GRANT ALL ON TABLE public.user_comments TO service_role;


--
-- Name: TABLE vote_casts; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT ON TABLE public.vote_casts TO service_role;


--
-- Name: TABLE vote_intention_answers; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE public.vote_intention_answers TO service_role;


--
-- Name: TABLE vote_intention_questions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.vote_intention_questions TO service_role;


--
-- Name: TABLE vote_parties; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.vote_parties TO service_role;


--
-- Name: TABLE vote_round_sessions; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.vote_round_sessions TO service_role;


--
-- Name: TABLE vote_rounds; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.vote_rounds TO service_role;


--
-- Name: TABLE vote_tally; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE public.vote_tally TO service_role;


--
-- Name: TABLE votoclaro_candidate_pins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.votoclaro_candidate_pins TO service_role;


--
-- Name: TABLE votoclaro_live_entries; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,MAINTAIN ON TABLE public.votoclaro_live_entries TO anon;
GRANT SELECT,MAINTAIN ON TABLE public.votoclaro_live_entries TO authenticated;
GRANT ALL ON TABLE public.votoclaro_live_entries TO service_role;


--
-- Name: TABLE votoclaro_public_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.votoclaro_public_links TO anon;
GRANT ALL ON TABLE public.votoclaro_public_links TO authenticated;
GRANT ALL ON TABLE public.votoclaro_public_links TO service_role;


--
-- Name: TABLE weekly_founder_questions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.weekly_founder_questions TO anon;
GRANT ALL ON TABLE public.weekly_founder_questions TO authenticated;
GRANT ALL ON TABLE public.weekly_founder_questions TO service_role;


--
-- Name: TABLE weekly_topics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.weekly_topics TO anon;
GRANT ALL ON TABLE public.weekly_topics TO authenticated;
GRANT ALL ON TABLE public.weekly_topics TO service_role;


--
-- Name: TABLE weekly_topics_queue; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.weekly_topics_queue TO anon;
GRANT ALL ON TABLE public.weekly_topics_queue TO authenticated;
GRANT ALL ON TABLE public.weekly_topics_queue TO service_role;


--
-- Name: TABLE weekly_video_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.weekly_video_entries TO anon;
GRANT ALL ON TABLE public.weekly_video_entries TO authenticated;
GRANT ALL ON TABLE public.weekly_video_entries TO service_role;


--
-- Name: TABLE weekly_video_votes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.weekly_video_votes TO anon;
GRANT ALL ON TABLE public.weekly_video_votes TO authenticated;
GRANT ALL ON TABLE public.weekly_video_votes TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--



-- FASE 3.63-A
-- Claim y coordinacion PostgreSQL del cleanup fisico externo de assets de Solo para Ganadores.
-- Esta migracion no borra objetos, no elimina filas de assets y no modifica Storage.

begin;

alter table public.solo_ganadores_assets
  add column cleanup_token uuid null,
  add column cleanup_claimed_at timestamptz null,
  add column cleanup_attempts integer not null default 0,
  add column last_attempt_at timestamptz null,
  add column next_retry_at timestamptz null;

alter table public.solo_ganadores_assets
  add constraint solo_ganadores_assets_cleanup_attempts_check
    check (cleanup_attempts >= 0),
  add constraint solo_ganadores_assets_cleanup_claim_pair_check
    check (
      (
        cleanup_token is null
        and cleanup_claimed_at is null
      )
      or (
        cleanup_token is not null
        and cleanup_claimed_at is not null
      )
    ),
  add constraint solo_ganadores_assets_cleanup_claim_status_check
    check (
      cleanup_token is null
      or (
        status = 'deleting'
        and deleted_at is null
        and deleting_at is not null
      )
    );

create unique index solo_ganadores_assets_cleanup_token_key
  on public.solo_ganadores_assets (cleanup_token)
  where cleanup_token is not null;

create index solo_ganadores_assets_cleanup_candidates_idx
  on public.solo_ganadores_assets (
    next_retry_at,
    deleting_at,
    id
  )
  where status = 'deleting'
    and deleted_at is null;

create index solo_ganadores_assets_cleanup_claims_idx
  on public.solo_ganadores_assets (cleanup_claimed_at)
  where status = 'deleting'
    and cleanup_token is not null;

create function public.claim_solo_ganadores_assets_for_cleanup(
  p_limit integer,
  p_grace_seconds integer,
  p_claim_ttl_seconds integer
)
returns table (
  asset_id uuid,
  cleanup_token uuid,
  bucket text,
  object_path text,
  public_url text,
  resource_type text,
  resource_id uuid,
  resource_field text,
  purpose text,
  media_kind text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

create function public.complete_solo_ganadores_asset_cleanup(
  p_asset_id uuid,
  p_cleanup_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

create function public.fail_solo_ganadores_asset_cleanup(
  p_asset_id uuid,
  p_cleanup_token uuid,
  p_error_code text,
  p_retryable boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

revoke all on function public.claim_solo_ganadores_assets_for_cleanup(integer, integer, integer)
from public;
revoke all on function public.claim_solo_ganadores_assets_for_cleanup(integer, integer, integer)
from anon;
revoke all on function public.claim_solo_ganadores_assets_for_cleanup(integer, integer, integer)
from authenticated;
grant execute on function public.claim_solo_ganadores_assets_for_cleanup(integer, integer, integer)
to service_role;

revoke all on function public.complete_solo_ganadores_asset_cleanup(uuid, uuid)
from public;
revoke all on function public.complete_solo_ganadores_asset_cleanup(uuid, uuid)
from anon;
revoke all on function public.complete_solo_ganadores_asset_cleanup(uuid, uuid)
from authenticated;
grant execute on function public.complete_solo_ganadores_asset_cleanup(uuid, uuid)
to service_role;

revoke all on function public.fail_solo_ganadores_asset_cleanup(uuid, uuid, text, boolean)
from public;
revoke all on function public.fail_solo_ganadores_asset_cleanup(uuid, uuid, text, boolean)
from anon;
revoke all on function public.fail_solo_ganadores_asset_cleanup(uuid, uuid, text, boolean)
from authenticated;
grant execute on function public.fail_solo_ganadores_asset_cleanup(uuid, uuid, text, boolean)
to service_role;

comment on function public.claim_solo_ganadores_assets_for_cleanup(integer, integer, integer) is
  'RPC server-side para reclamar concurrentemente assets deleting antes del cleanup fisico externo.';
comment on function public.complete_solo_ganadores_asset_cleanup(uuid, uuid) is
  'RPC server-side para marcar como deleted un asset cuyo objeto ya fue eliminado por el worker externo.';
comment on function public.fail_solo_ganadores_asset_cleanup(uuid, uuid, text, boolean) is
  'RPC server-side para registrar fallos saneados del cleanup externo y coordinar reintentos seguros.';

commit;

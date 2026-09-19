-- ============================================================================
-- BSEC SOLO GANADORES
-- TABLE ACL / POLICY HARDENING
--
-- Targets:
--   public.solo_ganadores_assets
--   public.solo_ganadores_events
--   public.solo_ganadores_media
--   public.solo_ganadores_posts
--
-- Final ACL:
--
-- assets:
--   service_role = SELECT + INSERT + DELETE
--   anon/authenticated = NONE
--
-- events/media/posts:
--   service_role = SELECT only
--   anon/authenticated = NONE
--
-- Existing direct public/authenticated policies on
-- events/media/posts are removed.
--
-- Storage is intentionally NOT modified in this migration.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
  v_owner text;
  v_count bigint;
begin

  -- --------------------------------------------------------------------------
  -- Ownership / RLS / row counts
  -- --------------------------------------------------------------------------

  select pg_catalog.pg_get_userbyid(relowner)
    into v_owner
  from pg_catalog.pg_class
  where oid = 'public.solo_ganadores_assets'::pg_catalog.regclass;

  if v_owner is distinct from 'postgres' then
    raise exception 'BSEC_SOLO_GANADORES_ABORT: assets owner changed';
  end if;

  select count(*)::bigint
    into v_count
  from public.solo_ganadores_assets;

  if v_count <> 30 then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: assets rows expected 30, found %',
      v_count;
  end if;


  select pg_catalog.pg_get_userbyid(relowner)
    into v_owner
  from pg_catalog.pg_class
  where oid = 'public.solo_ganadores_events'::pg_catalog.regclass;

  if v_owner is distinct from 'postgres' then
    raise exception 'BSEC_SOLO_GANADORES_ABORT: events owner changed';
  end if;

  select count(*)::bigint
    into v_count
  from public.solo_ganadores_events;

  if v_count <> 3 then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: events rows expected 3, found %',
      v_count;
  end if;


  select count(*)::bigint
    into v_count
  from public.solo_ganadores_media;

  if v_count <> 3 then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: media rows expected 3, found %',
      v_count;
  end if;


  select count(*)::bigint
    into v_count
  from public.solo_ganadores_posts;

  if v_count <> 2 then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: posts rows expected 2, found %',
      v_count;
  end if;


  -- All four must already have RLS enabled / FORCE RLS disabled.

  if exists (
    select 1
    from pg_catalog.pg_class
    where oid in (
      'public.solo_ganadores_assets'::pg_catalog.regclass,
      'public.solo_ganadores_events'::pg_catalog.regclass,
      'public.solo_ganadores_media'::pg_catalog.regclass,
      'public.solo_ganadores_posts'::pg_catalog.regclass
    )
    and (
      not relrowsecurity
      or relforcerowsecurity
    )
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: unexpected RLS state';
  end if;


  -- --------------------------------------------------------------------------
  -- Expected policies before hardening
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'solo_ganadores_events'
      and policyname = 'Authenticated admin can manage solo ganadores events'
      and cmd = 'ALL'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: events admin policy changed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'solo_ganadores_events'
      and policyname = 'Public can read published solo ganadores events'
      and cmd = 'SELECT'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: events public policy changed';
  end if;


  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'solo_ganadores_media'
      and policyname = 'Authenticated admin can manage solo ganadores media'
      and cmd = 'ALL'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: media admin policy changed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'solo_ganadores_media'
      and policyname = 'Public can read published solo ganadores media'
      and cmd = 'SELECT'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: media public policy changed';
  end if;


  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'solo_ganadores_posts'
      and policyname = 'Authenticated admin can manage solo ganadores posts'
      and cmd = 'ALL'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: posts admin policy changed';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'solo_ganadores_posts'
      and policyname = 'Public can read published solo ganadores posts'
      and cmd = 'SELECT'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: posts public policy changed';
  end if;


  -- assets must still have no policies.

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'solo_ganadores_assets'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: unexpected assets policy';
  end if;


  -- --------------------------------------------------------------------------
  -- ACL baseline remains broad before this migration.
  -- --------------------------------------------------------------------------

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'DELETE'
     ) then
    raise exception
      'BSEC_SOLO_GANADORES_ABORT: assets service ACL changed';
  end if;

end
$$;


-- ============================================================================
-- 1. REMOVE DIRECT PUBLIC/AUTHENTICATED POLICIES
-- ============================================================================

drop policy
  "Authenticated admin can manage solo ganadores events"
on public.solo_ganadores_events;

drop policy
  "Public can read published solo ganadores events"
on public.solo_ganadores_events;


drop policy
  "Authenticated admin can manage solo ganadores media"
on public.solo_ganadores_media;

drop policy
  "Public can read published solo ganadores media"
on public.solo_ganadores_media;


drop policy
  "Authenticated admin can manage solo ganadores posts"
on public.solo_ganadores_posts;

drop policy
  "Public can read published solo ganadores posts"
on public.solo_ganadores_posts;


-- ============================================================================
-- 2. ASSETS ACL
-- service_role keeps only currently required direct operations:
-- SELECT + INSERT + DELETE
-- ============================================================================

revoke all privileges
on table public.solo_ganadores_assets
from public;

revoke all privileges
on table public.solo_ganadores_assets
from anon;

revoke all privileges
on table public.solo_ganadores_assets
from authenticated;

revoke all privileges
on table public.solo_ganadores_assets
from service_role;

grant select, insert, delete
on table public.solo_ganadores_assets
to service_role;


-- ============================================================================
-- 3. EVENTS ACL
-- ============================================================================

revoke all privileges
on table public.solo_ganadores_events
from public;

revoke all privileges
on table public.solo_ganadores_events
from anon;

revoke all privileges
on table public.solo_ganadores_events
from authenticated;

revoke all privileges
on table public.solo_ganadores_events
from service_role;

grant select
on table public.solo_ganadores_events
to service_role;


-- ============================================================================
-- 4. MEDIA ACL
-- ============================================================================

revoke all privileges
on table public.solo_ganadores_media
from public;

revoke all privileges
on table public.solo_ganadores_media
from anon;

revoke all privileges
on table public.solo_ganadores_media
from authenticated;

revoke all privileges
on table public.solo_ganadores_media
from service_role;

grant select
on table public.solo_ganadores_media
to service_role;


-- ============================================================================
-- 5. POSTS ACL
-- ============================================================================

revoke all privileges
on table public.solo_ganadores_posts
from public;

revoke all privileges
on table public.solo_ganadores_posts
from anon;

revoke all privileges
on table public.solo_ganadores_posts
from authenticated;

revoke all privileges
on table public.solo_ganadores_posts
from service_role;

grant select
on table public.solo_ganadores_posts
to service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
  v_count bigint;
begin

  -- --------------------------------------------------------------------------
  -- Policies must now be gone.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'solo_ganadores_assets',
        'solo_ganadores_events',
        'solo_ganadores_media',
        'solo_ganadores_posts'
      )
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_POSTFAIL: policy remains';
  end if;


  -- --------------------------------------------------------------------------
  -- assets: service_role SELECT + INSERT + DELETE only.
  -- --------------------------------------------------------------------------

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'DELETE'
     ) then
    raise exception
      'BSEC_SOLO_GANADORES_POSTFAIL: assets required ACL missing';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'TRUNCATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'REFERENCES'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'TRIGGER'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_assets',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_SOLO_GANADORES_POSTFAIL: assets excessive service privilege';
  end if;


  -- --------------------------------------------------------------------------
  -- events/media/posts: service_role SELECT only.
  -- --------------------------------------------------------------------------

  if not pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_events',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_media',
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_posts',
       'SELECT'
     ) then
    raise exception
      'BSEC_SOLO_GANADORES_POSTFAIL: SELECT missing';
  end if;


  if pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_events',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_events',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_events',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_events',
       'MAINTAIN'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_media',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_media',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_media',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_media',
       'MAINTAIN'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_posts',
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_posts',
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_posts',
       'DELETE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       'public.solo_ganadores_posts',
       'MAINTAIN'
     ) then
    raise exception
      'BSEC_SOLO_GANADORES_POSTFAIL: excessive content table service privilege';
  end if;


  -- --------------------------------------------------------------------------
  -- anon/authenticated = no direct access on all four.
  -- --------------------------------------------------------------------------

  if exists (
    select 1
    from (
      values
        ('solo_ganadores_assets'),
        ('solo_ganadores_events'),
        ('solo_ganadores_media'),
        ('solo_ganadores_posts')
    ) as t(table_name)
    where
      pg_catalog.has_table_privilege(
        'anon',
        'public.' || t.table_name,
        'SELECT'
      )
      or pg_catalog.has_table_privilege(
        'anon',
        'public.' || t.table_name,
        'INSERT'
      )
      or pg_catalog.has_table_privilege(
        'anon',
        'public.' || t.table_name,
        'UPDATE'
      )
      or pg_catalog.has_table_privilege(
        'anon',
        'public.' || t.table_name,
        'DELETE'
      )
      or pg_catalog.has_table_privilege(
        'authenticated',
        'public.' || t.table_name,
        'SELECT'
      )
      or pg_catalog.has_table_privilege(
        'authenticated',
        'public.' || t.table_name,
        'INSERT'
      )
      or pg_catalog.has_table_privilege(
        'authenticated',
        'public.' || t.table_name,
        'UPDATE'
      )
      or pg_catalog.has_table_privilege(
        'authenticated',
        'public.' || t.table_name,
        'DELETE'
      )
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_POSTFAIL: anon/authenticated direct ACL remains';
  end if;


  -- --------------------------------------------------------------------------
  -- Row preservation.
  -- --------------------------------------------------------------------------

  select count(*)::bigint into v_count
  from public.solo_ganadores_assets;

  if v_count <> 30 then
    raise exception 'BSEC_SOLO_GANADORES_POSTFAIL: assets rows changed';
  end if;


  select count(*)::bigint into v_count
  from public.solo_ganadores_events;

  if v_count <> 3 then
    raise exception 'BSEC_SOLO_GANADORES_POSTFAIL: events rows changed';
  end if;


  select count(*)::bigint into v_count
  from public.solo_ganadores_media;

  if v_count <> 3 then
    raise exception 'BSEC_SOLO_GANADORES_POSTFAIL: media rows changed';
  end if;


  select count(*)::bigint into v_count
  from public.solo_ganadores_posts;

  if v_count <> 2 then
    raise exception 'BSEC_SOLO_GANADORES_POSTFAIL: posts rows changed';
  end if;

end
$$;
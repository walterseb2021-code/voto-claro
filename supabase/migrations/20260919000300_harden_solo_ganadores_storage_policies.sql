-- ============================================================================
-- BSEC SOLO GANADORES STORAGE
-- POLICY HARDENING
--
-- Scope:
--   storage.objects policies for bucket "solo-ganadores"
--
-- Important:
--   - DO NOT alter storage.objects ACL.
--   - DO NOT alter storage.objects RLS.
--   - DO NOT alter the bucket.
--   - DO NOT delete or update storage objects.
--   - DO NOT touch policies for other buckets.
--
-- Final state:
--   - No direct anon/authenticated RLS policy for solo-ganadores.
--   - Server operations continue through service_role.
--   - Signed/resumable upload flow remains independent.
--   - Bucket remains public.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $$
declare
  v_bucket_public boolean;
  v_object_count bigint;
  v_named_count integer;
begin

  -- --------------------------------------------------------------------------
  -- Bucket must exist and remain public.
  -- --------------------------------------------------------------------------

  select b.public
    into v_bucket_public
  from storage.buckets as b
  where b.id = 'solo-ganadores';

  if v_bucket_public is distinct from true then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_ABORT: bucket missing or not public';
  end if;


  -- --------------------------------------------------------------------------
  -- Exact object baseline.
  -- --------------------------------------------------------------------------

  select count(*)::bigint
    into v_object_count
  from storage.objects
  where bucket_id = 'solo-ganadores';

  if v_object_count <> 14 then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_ABORT: expected 14 objects, found %',
      v_object_count;
  end if;


  -- --------------------------------------------------------------------------
  -- storage.objects must have RLS enabled and FORCE RLS disabled.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n
      on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relrowsecurity = true
      and c.relforcerowsecurity = false
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_ABORT: unexpected storage.objects RLS state';
  end if;


  -- --------------------------------------------------------------------------
  -- All four expected policies must exist.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can delete solo ganadores files'
      and cmd = 'DELETE'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_ABORT: delete policy changed';
  end if;


  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can update solo ganadores files'
      and cmd = 'UPDATE'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_ABORT: update policy changed';
  end if;


  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated can upload solo ganadores files'
      and cmd = 'INSERT'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_ABORT: insert policy changed';
  end if;


  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can read solo ganadores files'
      and cmd = 'SELECT'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_ABORT: public read policy changed';
  end if;


  -- --------------------------------------------------------------------------
  -- There must be exactly four policies explicitly scoped to this bucket.
  -- --------------------------------------------------------------------------

  select count(*)::integer
    into v_named_count
  from pg_catalog.pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and (
      coalesce(qual, '') ilike '%solo-ganadores%'
      or
      coalesce(with_check, '') ilike '%solo-ganadores%'
    );

  if v_named_count <> 4 then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_ABORT: expected 4 bucket policies, found %',
      v_named_count;
  end if;


  -- --------------------------------------------------------------------------
  -- Unrelated project_pdfs policy must exist and remain untouched.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_pdfs_legacy_public_insert_scoped'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_ABORT: unrelated project_pdfs policy missing';
  end if;

end
$$;


-- ============================================================================
-- REMOVE ONLY SOLO-GANADORES POLICIES
-- ============================================================================

drop policy
  "Authenticated can delete solo ganadores files"
on storage.objects;


drop policy
  "Authenticated can update solo ganadores files"
on storage.objects;


drop policy
  "Authenticated can upload solo ganadores files"
on storage.objects;


drop policy
  "Public can read solo ganadores files"
on storage.objects;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $$
declare
  v_object_count bigint;
  v_bucket_public boolean;
  v_remaining integer;
begin

  -- --------------------------------------------------------------------------
  -- No policy may remain explicitly scoped to solo-ganadores.
  -- --------------------------------------------------------------------------

  select count(*)::integer
    into v_remaining
  from pg_catalog.pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and (
      coalesce(qual, '') ilike '%solo-ganadores%'
      or
      coalesce(with_check, '') ilike '%solo-ganadores%'
    );

  if v_remaining <> 0 then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_POSTFAIL: bucket policy remains';
  end if;


  -- --------------------------------------------------------------------------
  -- Bucket unchanged.
  -- --------------------------------------------------------------------------

  select b.public
    into v_bucket_public
  from storage.buckets as b
  where b.id = 'solo-ganadores';

  if v_bucket_public is distinct from true then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_POSTFAIL: bucket changed';
  end if;


  -- --------------------------------------------------------------------------
  -- Objects unchanged.
  -- --------------------------------------------------------------------------

  select count(*)::bigint
    into v_object_count
  from storage.objects
  where bucket_id = 'solo-ganadores';

  if v_object_count <> 14 then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_POSTFAIL: objects changed';
  end if;


  -- --------------------------------------------------------------------------
  -- storage.objects RLS must remain unchanged.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from pg_catalog.pg_class as c
    join pg_catalog.pg_namespace as n
      on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relrowsecurity = true
      and c.relforcerowsecurity = false
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_POSTFAIL: RLS changed';
  end if;


  -- --------------------------------------------------------------------------
  -- Unrelated policy must still exist.
  -- --------------------------------------------------------------------------

  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'project_pdfs_legacy_public_insert_scoped'
  ) then
    raise exception
      'BSEC_SOLO_GANADORES_STORAGE_POSTFAIL: unrelated policy changed';
  end if;

end
$$;
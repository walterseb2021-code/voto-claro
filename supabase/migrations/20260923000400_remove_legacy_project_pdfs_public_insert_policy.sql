do $bsec$
declare
  v_policy_count integer;
  v_with_check text;
  v_project_before bigint;
  v_solo_before bigint;
  v_project_after bigint;
  v_solo_after bigint;
  v_rls boolean;
  v_force boolean;
begin
  if not exists (
    select 1 from storage.buckets
    where id='project_pdfs' and name='project_pdfs' and public=true
  ) then
    raise exception 'BSEC_STORAGE_LEGACY_ABORT: project_pdfs bucket drift';
  end if;

  if not exists (
    select 1 from storage.buckets
    where id='solo-ganadores' and name='solo-ganadores' and public=true
  ) then
    raise exception 'BSEC_STORAGE_LEGACY_ABORT: solo-ganadores bucket drift';
  end if;

  select c.relrowsecurity, c.relforcerowsecurity
    into v_rls, v_force
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='storage' and c.relname='objects'
    and c.relkind in ('r','p');

  if v_rls is distinct from true or v_force is distinct from false then
    raise exception 'BSEC_STORAGE_LEGACY_ABORT: storage.objects RLS drift';
  end if;

  select count(*)::integer, max(p.with_check)
    into v_policy_count, v_with_check
  from pg_catalog.pg_policies p
  where p.schemaname='storage'
    and p.tablename='objects'
    and p.policyname='project_pdfs_legacy_public_insert_scoped'
    and p.cmd='INSERT'
    and p.roles=array['public'::name]
    and p.permissive='PERMISSIVE'
    and p.qual is null;

  if v_policy_count <> 1
     or v_with_check is null
     or v_with_check not like '%project_pdfs%'
     or v_with_check not like '%espacio-emprendedor%'
     or v_with_check not like '%storage.extension%'
     or v_with_check not like '%pdf%' then
    raise exception 'BSEC_STORAGE_LEGACY_ABORT: legacy policy drift';
  end if;

  select count(*)::bigint into v_project_before
  from storage.objects where bucket_id='project_pdfs';

  select count(*)::bigint into v_solo_before
  from storage.objects where bucket_id='solo-ganadores';

  execute 'drop policy "project_pdfs_legacy_public_insert_scoped" on storage.objects';

  if exists (
    select 1 from pg_catalog.pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname='project_pdfs_legacy_public_insert_scoped'
  ) then
    raise exception 'BSEC_STORAGE_LEGACY_VERIFY: policy remains';
  end if;

  if (select count(*) from pg_catalog.pg_policies where schemaname='storage') <> 0 then
    raise exception 'BSEC_STORAGE_LEGACY_VERIFY: unexpected storage policies remain';
  end if;

  select count(*)::bigint into v_project_after
  from storage.objects where bucket_id='project_pdfs';

  select count(*)::bigint into v_solo_after
  from storage.objects where bucket_id='solo-ganadores';

  if v_project_after <> v_project_before or v_solo_after <> v_solo_before then
    raise exception 'BSEC_STORAGE_LEGACY_VERIFY: object counts changed';
  end if;
end
$bsec$;

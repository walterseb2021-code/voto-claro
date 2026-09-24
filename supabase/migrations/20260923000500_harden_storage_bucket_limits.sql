begin;

do $guard$
declare
    v_rls boolean;
    v_force_rls boolean;
begin
    -- Los dos buckets deben existir, continuar publicos y
    -- permanecer aun sin limites a nivel bucket.
    if not exists (
        select 1
        from storage.buckets
        where id = 'project_pdfs'
          and name = 'project_pdfs'
          and public = true
          and file_size_limit is null
          and allowed_mime_types is null
    ) then
        raise exception
            'BSEC_STORAGE_LIMITS_ABORT: project_pdfs drift';
    end if;

    if not exists (
        select 1
        from storage.buckets
        where id = 'solo-ganadores'
          and name = 'solo-ganadores'
          and public = true
          and file_size_limit is null
          and allowed_mime_types is null
    ) then
        raise exception
            'BSEC_STORAGE_LIMITS_ABORT: solo-ganadores drift';
    end if;

    -- El bloque anterior dejo Storage sin policies propias
    -- de la aplicacion.
    if exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'storage'
    ) then
        raise exception
            'BSEC_STORAGE_LIMITS_ABORT: unexpected storage policy';
    end if;

    select
        c.relrowsecurity,
        c.relforcerowsecurity
    into
        v_rls,
        v_force_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relkind in ('r','p');

    if v_rls is distinct from true
       or v_force_rls is distinct from false then
        raise exception
            'BSEC_STORAGE_LIMITS_ABORT: storage.objects RLS drift';
    end if;

    -- project_pdfs:
    -- admitir los PDF normales existentes y el unico
    -- placeholder legacy de 0 bytes sin modificarlo.
    if exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'project_pdfs'
          and not (
              (
                  lower(storage.extension(o.name)) = 'pdf'
                  and lower(
                      coalesce(
                          nullif(o.metadata ->> 'mimetype', ''),
                          nullif(o.metadata ->> 'contentType', ''),
                          ''
                      )
                  ) = 'application/pdf'
                  and coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
                  and (o.metadata ->> 'size')::bigint > 0
                  and (o.metadata ->> 'size')::bigint <= 10485760
              )
              or
              (
                  lower(storage.extension(o.name)) =
                      'emptyfolderplaceholder'
                  and coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
                  and (o.metadata ->> 'size')::bigint = 0
              )
          )
    ) then
        raise exception
            'BSEC_STORAGE_LIMITS_ABORT: incompatible project_pdfs object';
    end if;

    -- solo-ganadores:
    -- todos los objetos actuales deben caber dentro de la
    -- union de tipos permitidos y del maximo global de video.
    if exists (
        select 1
        from storage.objects o
        where o.bucket_id = 'solo-ganadores'
          and (
              lower(
                  coalesce(
                      nullif(o.metadata ->> 'mimetype', ''),
                      nullif(o.metadata ->> 'contentType', ''),
                      ''
                  )
              ) not in (
                  'image/jpeg',
                  'image/png',
                  'image/webp',
                  'video/mp4'
              )
              or coalesce(o.metadata ->> 'size', '') !~ '^[0-9]+$'
              or (o.metadata ->> 'size')::bigint <= 0
              or (o.metadata ->> 'size')::bigint > 47185920
          )
    ) then
        raise exception
            'BSEC_STORAGE_LIMITS_ABORT: incompatible solo-ganadores object';
    end if;
end
$guard$;


update storage.buckets
set
    file_size_limit = 10485760,
    allowed_mime_types = array[
        'application/pdf'
    ]::text[]
where id = 'project_pdfs';


update storage.buckets
set
    file_size_limit = 47185920,
    allowed_mime_types = array[
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4'
    ]::text[]
where id = 'solo-ganadores';


do $verify$
declare
    v_rls boolean;
    v_force_rls boolean;
begin
    if not exists (
        select 1
        from storage.buckets
        where id = 'project_pdfs'
          and name = 'project_pdfs'
          and public = true
          and file_size_limit = 10485760
          and allowed_mime_types =
              array['application/pdf']::text[]
    ) then
        raise exception
            'BSEC_STORAGE_LIMITS_VERIFY: project_pdfs not hardened';
    end if;

    if not exists (
        select 1
        from storage.buckets
        where id = 'solo-ganadores'
          and name = 'solo-ganadores'
          and public = true
          and file_size_limit = 47185920
          and allowed_mime_types =
              array[
                  'image/jpeg',
                  'image/png',
                  'image/webp',
                  'video/mp4'
              ]::text[]
    ) then
        raise exception
            'BSEC_STORAGE_LIMITS_VERIFY: solo-ganadores not hardened';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'storage'
    ) then
        raise exception
            'BSEC_STORAGE_LIMITS_VERIFY: storage policy appeared';
    end if;

    select
        c.relrowsecurity,
        c.relforcerowsecurity
    into
        v_rls,
        v_force_rls
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'storage'
      and c.relname = 'objects'
      and c.relkind in ('r','p');

    if v_rls is distinct from true
       or v_force_rls is distinct from false then
        raise exception
            'BSEC_STORAGE_LIMITS_VERIFY: storage.objects RLS changed';
    end if;
end
$verify$;

commit;
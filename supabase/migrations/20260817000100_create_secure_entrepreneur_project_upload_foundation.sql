begin;

-- ============================================================
-- Secure foundation for Espacio Emprendedor project uploads.
--
-- This migration deliberately does NOT:
-- - enable RLS on legacy espacio_afiliados
-- - enable RLS on legacy espacio_proyectos
-- - revoke legacy client access
-- - remove the temporary Storage INSERT policy
-- - create the claim/finalize RPCs
--
-- Those changes will be introduced only after the application
-- has migrated to the new server-side flow.
-- ============================================================

do $$
declare
  v_count integer;
begin
  if to_regclass('public.project_participants') is null then
    raise exception 'Missing public.project_participants';
  end if;

  if to_regclass('public.espacio_afiliados') is null then
    raise exception 'Missing public.espacio_afiliados';
  end if;

  if to_regclass('public.espacio_proyectos') is null then
    raise exception 'Missing public.espacio_proyectos';
  end if;

  if to_regclass(
    'public.espacio_project_upload_grants'
  ) is not null then
    raise exception
      'public.espacio_project_upload_grants already exists';
  end if;

  if to_regclass(
    'public.espacio_afiliados_participant_id_uniq'
  ) is not null then
    raise exception
      'public.espacio_afiliados_participant_id_uniq already exists';
  end if;

  select count(*)
  into v_count
  from (
    select participant_id
    from public.espacio_afiliados
    where participant_id is not null
    group by participant_id
    having count(*) > 1
  ) d;

  if v_count <> 0 then
    raise exception
      'Duplicate non-null participant_id values exist in espacio_afiliados';
  end if;

  select count(*)
  into v_count
  from public.espacio_afiliados a
  join public.project_participants p
    on p.id = a.participant_id
  where a.participant_id is not null
    and a.dni is distinct from p.dni;

  if v_count <> 0 then
    raise exception
      'DNI/participant mismatches exist in espacio_afiliados';
  end if;
end
$$;


create unique index
  espacio_afiliados_participant_id_uniq
on public.espacio_afiliados(participant_id)
where participant_id is not null;


-- Dynamic SQL is intentional here. It avoids premature relation
-- resolution when the migration is pasted into Supabase SQL Editor
-- as a single batch.

do $$
begin

  execute $sql$
    create table public.espacio_project_upload_grants (

      id uuid primary key
        default gen_random_uuid(),

      participant_id uuid not null
        references public.project_participants(id),

      affiliate_id uuid not null
        references public.espacio_afiliados(id),

      object_path text not null unique,

      expected_size bigint not null
        check (
          expected_size > 0
          and expected_size <= 10485760
        ),

      expected_mime text not null
        check (
          expected_mime = 'application/pdf'
        ),

      created_at timestamptz not null
        default now(),

      expires_at timestamptz not null,

      finalized_at timestamptz null,

      cancelled_at timestamptz null,

      project_id uuid null
        references public.espacio_proyectos(id),

      constraint espacio_project_upload_grants_path_check
        check (
          length(object_path) between 60 and 500
          and object_path like
            'espacio-emprendedor-secure/%'
        ),

      constraint espacio_project_upload_grants_expiry_check
        check (
          expires_at > created_at
        ),

      constraint espacio_project_upload_grants_terminal_check
        check (
          not (
            finalized_at is not null
            and cancelled_at is not null
          )
        ),

      constraint espacio_project_upload_grants_finalized_project_check
        check (
          (
            finalized_at is null
            and project_id is null
          )
          or
          (
            finalized_at is not null
            and project_id is not null
          )
        )
    )
  $sql$;


  execute $sql$
    create index
      espacio_project_upload_grants_participant_created_idx
    on public.espacio_project_upload_grants(
      participant_id,
      created_at desc
    )
  $sql$;


  execute $sql$
    create index
      espacio_project_upload_grants_expiry_idx
    on public.espacio_project_upload_grants(expires_at)
    where finalized_at is null
      and cancelled_at is null
  $sql$;


  execute $sql$
    alter table public.espacio_project_upload_grants
      enable row level security
  $sql$;


  execute $sql$
    revoke all privileges
    on table public.espacio_project_upload_grants
    from public, anon, authenticated, service_role
  $sql$;


  execute $sql$
    grant select, insert, update
    on table public.espacio_project_upload_grants
    to service_role
  $sql$;

end
$$;


-- ============================================================
-- Postconditions
-- ============================================================

do $$
declare
  v_index_predicate text;
begin

  if to_regclass(
    'public.espacio_afiliados_participant_id_uniq'
  ) is null then
    raise exception
      'Missing espacio_afiliados_participant_id_uniq after migration';
  end if;

  if to_regclass(
    'public.espacio_project_upload_grants'
  ) is null then
    raise exception
      'Missing espacio_project_upload_grants after migration';
  end if;

  select pg_get_expr(
    i.indpred,
    i.indrelid
  )
  into v_index_predicate
  from pg_index i
  join pg_class idx
    on idx.oid = i.indexrelid
  join pg_namespace n
    on n.oid = idx.relnamespace
  where n.nspname = 'public'
    and idx.relname =
      'espacio_afiliados_participant_id_uniq';

  if v_index_predicate is null
     or v_index_predicate not ilike
       '%participant_id IS NOT NULL%'
  then
    raise exception
      'Unexpected partial unique index predicate';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname =
        'espacio_project_upload_grants'
      and c.relkind = 'r'
  ) then
    raise exception
      'RLS is not enabled on espacio_project_upload_grants';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename =
        'espacio_project_upload_grants'
  ) <> 0 then
    raise exception
      'Unexpected policies on espacio_project_upload_grants';
  end if;

  if has_table_privilege(
    'anon',
    'public.espacio_project_upload_grants',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception
      'anon retains privileges on espacio_project_upload_grants';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.espacio_project_upload_grants',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception
      'authenticated retains privileges on espacio_project_upload_grants';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.espacio_project_upload_grants',
    'SELECT'
  ) then
    raise exception
      'service_role missing SELECT';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.espacio_project_upload_grants',
    'INSERT'
  ) then
    raise exception
      'service_role missing INSERT';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.espacio_project_upload_grants',
    'UPDATE'
  ) then
    raise exception
      'service_role missing UPDATE';
  end if;

  if has_table_privilege(
    'service_role',
    'public.espacio_project_upload_grants',
    'DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception
      'service_role retains excessive privileges';
  end if;
end
$$;

commit;
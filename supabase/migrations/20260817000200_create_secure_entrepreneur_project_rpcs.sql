begin;

-- ============================================================
-- Secure RPCs for Espacio Emprendedor
--
-- Foundation expected:
--   espacio_project_upload_grants
--   espacio_afiliados_participant_id_uniq
--
-- This migration deliberately does NOT yet:
-- - enable RLS on espacio_afiliados
-- - enable RLS on espacio_proyectos
-- - revoke legacy client table privileges
-- - remove the legacy Storage INSERT policy
--
-- Those controls will be applied only after browser callers
-- have migrated to the server-side APIs.
-- ============================================================


-- ============================================================
-- 0. PREFLIGHT
-- ============================================================

do $$
declare
  v_count integer;
begin

  if to_regclass(
    'public.project_participants'
  ) is null then
    raise exception
      'Missing public.project_participants';
  end if;

  if to_regclass(
    'public.espacio_afiliados'
  ) is null then
    raise exception
      'Missing public.espacio_afiliados';
  end if;

  if to_regclass(
    'public.espacio_proyectos'
  ) is null then
    raise exception
      'Missing public.espacio_proyectos';
  end if;

  if to_regclass(
    'public.espacio_project_upload_grants'
  ) is null then
    raise exception
      'Missing public.espacio_project_upload_grants';
  end if;

  if to_regclass(
    'public.espacio_afiliados_participant_id_uniq'
  ) is null then
    raise exception
      'Missing public.espacio_afiliados_participant_id_uniq';
  end if;

  if to_regprocedure(
    'public.claim_espacio_afiliacion_secure(uuid)'
  ) is not null then
    raise exception
      'claim_espacio_afiliacion_secure(uuid) already exists';
  end if;

  if to_regprocedure(
    'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)'
  ) is not null then
    raise exception
      'finalize_espacio_project_secure(...) already exists';
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
      'Duplicate participant affiliations exist';
  end if;


  select count(*)
  into v_count
  from public.espacio_afiliados a
  join public.project_participants p
    on p.id = a.participant_id
  where a.participant_id is not null
    and btrim(a.dni) is distinct from btrim(p.dni);

  if v_count <> 0 then
    raise exception
      'DNI/participant mismatches exist';
  end if;

end
$$;


-- ============================================================
-- 1. SECURE AFFILIATE CLAIM
-- ============================================================

create function public.claim_espacio_afiliacion_secure(
  p_participant_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_dni text;

  v_existing_id uuid;
  v_existing_dni text;
  v_existing_active boolean;

  v_affiliate_id uuid;
  v_claimed_id uuid;
begin

  if p_participant_id is null then
    raise exception
      'participant_id is required'
      using errcode = '22023';
  end if;


  -- Identity comes from the secure participant session.
  -- The browser does not supply DNI or affiliate_id.

  select btrim(p.dni)
  into v_dni
  from public.project_participants p
  where p.id = p_participant_id
  for update;


  if not found then
    raise exception
      'participant not found'
      using errcode = 'P0002';
  end if;


  if v_dni is null
     or v_dni !~ '^[0-9]{8}$'
  then
    raise exception
      'participant DNI is invalid'
      using errcode = '22023';
  end if;


  -- Already claimed: idempotent result.

  select
    a.id,
    btrim(a.dni),
    coalesce(a.is_active, false)
  into
    v_existing_id,
    v_existing_dni,
    v_existing_active
  from public.espacio_afiliados a
  where a.participant_id = p_participant_id
  order by a.created_at nulls last, a.id
  limit 1
  for update;


  if found then

    if not v_existing_active then
      raise exception
        'affiliate is inactive'
        using errcode = 'P0001';
    end if;


    if v_existing_dni is distinct from v_dni then
      raise exception
        'affiliate DNI does not match participant DNI'
        using errcode = 'P0001';
    end if;


    return v_existing_id;

  end if;


  -- Find only an active, unclaimed affiliate record whose
  -- stored DNI exactly matches the participant's stored DNI.

  select a.id
  into v_affiliate_id
  from public.espacio_afiliados a
  where a.participant_id is null
    and coalesce(a.is_active, false) is true
    and btrim(a.dni) = v_dni
  order by a.created_at nulls last, a.id
  limit 1
  for update;


  if not found then
    return null;
  end if;


  update public.espacio_afiliados
  set
    participant_id = p_participant_id,
    verified_at = clock_timestamp()
  where id = v_affiliate_id
    and participant_id is null
    and coalesce(is_active, false) is true
    and btrim(dni) = v_dni
  returning id
  into v_claimed_id;


  if v_claimed_id is null then
    raise exception
      'affiliate claim conflict'
      using errcode = '40001';
  end if;


  return v_claimed_id;

end;
$function$;


alter function public.claim_espacio_afiliacion_secure(uuid)
owner to postgres;


revoke all
on function public.claim_espacio_afiliacion_secure(uuid)
from public, anon, authenticated, service_role;


grant execute
on function public.claim_espacio_afiliacion_secure(uuid)
to service_role;


-- ============================================================
-- 2. SECURE PROJECT FINALIZATION
-- ============================================================

create function public.finalize_espacio_project_secure(
  p_grant_id uuid,
  p_participant_id uuid,
  p_title text,
  p_category text,
  p_department text,
  p_province text,
  p_district text,
  p_summary text,
  p_investment_min integer,
  p_investment_max integer,
  p_pdf_url text,
  p_data_truth_confirmed boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_grant record;

  v_affiliate_id uuid;
  v_project_id uuid;

  v_title text;
  v_category text;
  v_department text;
  v_province text;
  v_district text;
  v_summary text;
  v_pdf_url text;

  v_expected_prefix text;
  v_expected_url_suffix text;

  v_updated_rows integer;
begin

  if p_grant_id is null then
    raise exception
      'grant_id is required'
      using errcode = '22023';
  end if;

  if p_participant_id is null then
    raise exception
      'participant_id is required'
      using errcode = '22023';
  end if;

  if p_data_truth_confirmed is distinct from true then
    raise exception
      'truth declaration is required'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- Normalize input
  -- ==========================================================

  v_title :=
    btrim(coalesce(p_title, ''));

  v_category :=
    btrim(coalesce(p_category, ''));

  v_department :=
    btrim(coalesce(p_department, ''));

  v_province :=
    nullif(
      btrim(coalesce(p_province, '')),
      ''
    );

  v_district :=
    btrim(coalesce(p_district, ''));

  v_summary :=
    btrim(coalesce(p_summary, ''));

  v_pdf_url :=
    btrim(coalesce(p_pdf_url, ''));


  -- ==========================================================
  -- Validate project fields
  -- ==========================================================

  if length(v_title) < 5
     or length(v_title) > 300
  then
    raise exception
      'invalid project title'
      using errcode = '22023';
  end if;


  if v_category not in (
    'Tecnología',
    'Ventas / Comercio',
    'Inmobiliaria',
    'Construcción',
    'Turismo',
    'Ecología / Medio Ambiente',
    'Agroindustria',
    'Servicios',
    'Otros'
  ) then
    raise exception
      'invalid project category'
      using errcode = '22023';
  end if;


  if v_department not in (
    'Amazonas',
    'Áncash',
    'Apurímac',
    'Arequipa',
    'Ayacucho',
    'Cajamarca',
    'Callao',
    'Cusco',
    'Huancavelica',
    'Huánuco',
    'Ica',
    'Junín',
    'La Libertad',
    'Lambayeque',
    'Lima',
    'Loreto',
    'Madre de Dios',
    'Moquegua',
    'Pasco',
    'Piura',
    'Puno',
    'San Martín',
    'Tacna',
    'Tumbes',
    'Ucayali'
  ) then
    raise exception
      'invalid project department'
      using errcode = '22023';
  end if;


  if v_province is not null
     and length(v_province) > 120
  then
    raise exception
      'invalid project province'
      using errcode = '22023';
  end if;


  if length(v_district) < 1
     or length(v_district) > 120
  then
    raise exception
      'invalid project district'
      using errcode = '22023';
  end if;


  if length(v_summary) < 40
     or length(v_summary) > 5000
  then
    raise exception
      'invalid project summary'
      using errcode = '22023';
  end if;


  if p_investment_min is not null
     and p_investment_min <= 0
  then
    raise exception
      'invalid minimum investment'
      using errcode = '22023';
  end if;


  if p_investment_max is not null
     and p_investment_max <= 0
  then
    raise exception
      'invalid maximum investment'
      using errcode = '22023';
  end if;


  if p_investment_min is not null
     and p_investment_max is not null
     and p_investment_max < p_investment_min
  then
    raise exception
      'maximum investment cannot be lower than minimum'
      using errcode = '22023';
  end if;


  if length(v_pdf_url) < 20
     or length(v_pdf_url) > 2000
     or v_pdf_url not like 'https://%'
  then
    raise exception
      'invalid PDF URL'
      using errcode = '22023';
  end if;


  -- ==========================================================
  -- Lock and validate upload grant
  -- ==========================================================

  select
    g.id,
    g.participant_id,
    g.affiliate_id,
    g.object_path,
    g.expected_size,
    g.expected_mime,
    g.created_at,
    g.expires_at,
    g.finalized_at,
    g.cancelled_at,
    g.project_id
  into v_grant
  from public.espacio_project_upload_grants g
  where g.id = p_grant_id
  for update;


  if not found then
    raise exception
      'upload grant not found'
      using errcode = 'P0002';
  end if;


  if v_grant.participant_id
     is distinct from p_participant_id
  then
    raise exception
      'upload grant participant mismatch'
      using errcode = 'P0001';
  end if;


  if v_grant.finalized_at is not null
     or v_grant.project_id is not null
  then
    raise exception
      'upload grant already finalized'
      using errcode = 'P0001';
  end if;


  if v_grant.cancelled_at is not null then
    raise exception
      'upload grant cancelled'
      using errcode = 'P0001';
  end if;


  if v_grant.expires_at <= clock_timestamp() then
    raise exception
      'upload grant expired'
      using errcode = 'P0001';
  end if;


  if v_grant.expected_mime
     is distinct from 'application/pdf'
  then
    raise exception
      'unexpected upload MIME'
      using errcode = 'P0001';
  end if;


  if v_grant.expected_size <= 0
     or v_grant.expected_size > 10485760
  then
    raise exception
      'unexpected upload size'
      using errcode = 'P0001';
  end if;


  -- The grant must belong to the secure directory of the
  -- participant resolved by the server-side session.

  v_expected_prefix :=
    'espacio-emprendedor-secure/'
    || p_participant_id::text
    || '/';


  if v_grant.object_path
     not like v_expected_prefix || '%.pdf'
  then
    raise exception
      'unexpected upload object path'
      using errcode = 'P0001';
  end if;


  -- The URL must point exactly to the authorized object.
  -- Storage metadata and the %PDF signature are independently
  -- verified by the server API before invoking this RPC.

  v_expected_url_suffix :=
    '/storage/v1/object/public/project_pdfs/'
    || v_grant.object_path;


  if right(
       v_pdf_url,
       length(v_expected_url_suffix)
     ) is distinct from v_expected_url_suffix
  then
    raise exception
      'PDF URL does not match upload grant'
      using errcode = 'P0001';
  end if;


  -- ==========================================================
  -- Validate the active affiliate relationship
  -- ==========================================================

  select a.id
  into v_affiliate_id
  from public.espacio_afiliados a
  join public.project_participants p
    on p.id = a.participant_id
  where a.id = v_grant.affiliate_id
    and a.participant_id = p_participant_id
    and p.id = p_participant_id
    and coalesce(a.is_active, false) is true
    and btrim(a.dni) = btrim(p.dni)
  for update of a;


  if not found then
    raise exception
      'active affiliate not found for participant'
      using errcode = 'P0001';
  end if;


  -- ==========================================================
  -- Create project
  --
  -- owner_id and status are server-controlled values.
  -- ==========================================================

  insert into public.espacio_proyectos (
    owner_id,
    title,
    category,
    department,
    province,
    district,
    summary,
    investment_min,
    investment_max,
    pdf_url,
    status
  )
  values (
    v_affiliate_id,
    v_title,
    v_category,
    v_department,
    v_province,
    v_district,
    v_summary,
    p_investment_min,
    p_investment_max,
    v_pdf_url,
    'active'
  )
  returning id
  into v_project_id;


  if v_project_id is null then
    raise exception
      'project insert failed'
      using errcode = 'P0001';
  end if;


  -- ==========================================================
  -- Atomically consume upload grant
  -- ==========================================================

  update public.espacio_project_upload_grants
  set
    finalized_at = clock_timestamp(),
    project_id = v_project_id
  where id = p_grant_id
    and participant_id = p_participant_id
    and finalized_at is null
    and cancelled_at is null
    and project_id is null;


  get diagnostics
    v_updated_rows = row_count;


  if v_updated_rows <> 1 then
    raise exception
      'upload grant finalize conflict'
      using errcode = '40001';
  end if;


  return v_project_id;

end;
$function$;


alter function public.finalize_espacio_project_secure(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  text,
  boolean
)
owner to postgres;


revoke all
on function public.finalize_espacio_project_secure(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  text,
  boolean
)
from public, anon, authenticated, service_role;


grant execute
on function public.finalize_espacio_project_secure(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  text,
  boolean
)
to service_role;


-- ============================================================
-- 3. POSTCONDITIONS
-- ============================================================

do $$
declare
  v_owner text;
begin

  if to_regprocedure(
    'public.claim_espacio_afiliacion_secure(uuid)'
  ) is null then
    raise exception
      'claim RPC missing after creation';
  end if;


  if to_regprocedure(
    'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)'
  ) is null then
    raise exception
      'finalize RPC missing after creation';
  end if;


  -- ----------------------------------------------------------
  -- claim RPC security
  -- ----------------------------------------------------------

  if has_function_privilege(
    'public',
    'public.claim_espacio_afiliacion_secure(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'PUBLIC can execute claim RPC';
  end if;


  if has_function_privilege(
    'anon',
    'public.claim_espacio_afiliacion_secure(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'anon can execute claim RPC';
  end if;


  if has_function_privilege(
    'authenticated',
    'public.claim_espacio_afiliacion_secure(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'authenticated can execute claim RPC';
  end if;


  if not has_function_privilege(
    'service_role',
    'public.claim_espacio_afiliacion_secure(uuid)',
    'EXECUTE'
  ) then
    raise exception
      'service_role cannot execute claim RPC';
  end if;


  if not (
    select p.prosecdef
    from pg_proc p
    where p.oid =
      'public.claim_espacio_afiliacion_secure(uuid)'::regprocedure
  ) then
    raise exception
      'claim RPC is not SECURITY DEFINER';
  end if;


  if not (
    select p.proconfig @>
      array['search_path=pg_catalog']::text[]
    from pg_proc p
    where p.oid =
      'public.claim_espacio_afiliacion_secure(uuid)'::regprocedure
  ) then
    raise exception
      'claim RPC search_path is not fixed';
  end if;


  select r.rolname
  into v_owner
  from pg_proc p
  join pg_roles r
    on r.oid = p.proowner
  where p.oid =
    'public.claim_espacio_afiliacion_secure(uuid)'::regprocedure;


  if v_owner is distinct from 'postgres' then
    raise exception
      'Unexpected claim RPC owner: %',
      v_owner;
  end if;


  -- ----------------------------------------------------------
  -- finalize RPC security
  -- ----------------------------------------------------------

  if has_function_privilege(
    'public',
    'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)',
    'EXECUTE'
  ) then
    raise exception
      'PUBLIC can execute finalize RPC';
  end if;


  if has_function_privilege(
    'anon',
    'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)',
    'EXECUTE'
  ) then
    raise exception
      'anon can execute finalize RPC';
  end if;


  if has_function_privilege(
    'authenticated',
    'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)',
    'EXECUTE'
  ) then
    raise exception
      'authenticated can execute finalize RPC';
  end if;


  if not has_function_privilege(
    'service_role',
    'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)',
    'EXECUTE'
  ) then
    raise exception
      'service_role cannot execute finalize RPC';
  end if;


  if not (
    select p.prosecdef
    from pg_proc p
    where p.oid =
      'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)'::regprocedure
  ) then
    raise exception
      'finalize RPC is not SECURITY DEFINER';
  end if;


  if not (
    select p.proconfig @>
      array['search_path=pg_catalog']::text[]
    from pg_proc p
    where p.oid =
      'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)'::regprocedure
  ) then
    raise exception
      'finalize RPC search_path is not fixed';
  end if;


  select r.rolname
  into v_owner
  from pg_proc p
  join pg_roles r
    on r.oid = p.proowner
  where p.oid =
    'public.finalize_espacio_project_secure(uuid,uuid,text,text,text,text,text,text,integer,integer,text,boolean)'::regprocedure;


  if v_owner is distinct from 'postgres' then
    raise exception
      'Unexpected finalize RPC owner: %',
      v_owner;
  end if;


  -- ----------------------------------------------------------
  -- Existing data integrity must remain unchanged.
  -- ----------------------------------------------------------

  if exists (
    select 1
    from (
      select participant_id
      from public.espacio_afiliados
      where participant_id is not null
      group by participant_id
      having count(*) > 1
    ) d
  ) then
    raise exception
      'Duplicate participant affiliations after migration';
  end if;


  if exists (
    select 1
    from public.espacio_afiliados a
    join public.project_participants p
      on p.id = a.participant_id
    where a.participant_id is not null
      and btrim(a.dni) is distinct from btrim(p.dni)
  ) then
    raise exception
      'DNI mismatch after migration';
  end if;

end
$$;


commit;
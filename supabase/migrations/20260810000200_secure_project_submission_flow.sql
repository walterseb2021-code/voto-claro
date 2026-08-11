-- B-SEC-14AN
-- Fundacion server-side para alta segura de proyectos ciudadanos.
--
-- IMPORTANTE:
-- 1. NO revoca aun los accesos heredados de projects/project_cycles.
-- 2. NO cambia aun el bucket project_pdfs de publico a privado.
-- 3. NO borra proyectos ni PDFs existentes.
-- 4. Crea trazabilidad para uploads firmados y una restriccion de
--    un solo proyecto pending/active por lider y ciclo.

begin;

create unique index if not exists projects_one_open_per_leader_cycle_uniq
  on public.projects(cycle_id, leader_id)
  where cycle_id is not null
    and leader_id is not null
    and status in ('pending', 'active');

create table public.project_submission_upload_grants (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null
    references public.project_participants(id)
    on delete cascade,
  cycle_id uuid not null
    references public.project_cycles(id),
  object_path text not null unique,
  expected_size bigint not null
    check (expected_size > 0 and expected_size <= 10485760),
  expected_mime text not null
    check (expected_mime = 'application/pdf'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finalized_at timestamptz null,
  cancelled_at timestamptz null,
  project_id uuid null
    references public.projects(id),
  constraint project_submission_upload_grants_expiry_check
    check (expires_at > created_at),
  constraint project_submission_upload_grants_terminal_state_check
    check (not (finalized_at is not null and cancelled_at is not null)),
  constraint project_submission_upload_grants_finalized_project_check
    check (
      (finalized_at is null and project_id is null)
      or
      (finalized_at is not null and project_id is not null)
    )
);

create index project_submission_upload_grants_participant_created_idx
  on public.project_submission_upload_grants(participant_id, created_at desc);

create index project_submission_upload_grants_expiry_idx
  on public.project_submission_upload_grants(expires_at)
  where finalized_at is null
    and cancelled_at is null;

alter table public.project_submission_upload_grants
  enable row level security;

revoke all privileges
  on table public.project_submission_upload_grants
  from public, anon, authenticated, service_role;

grant select, insert, update
  on table public.project_submission_upload_grants
  to service_role;

create or replace function public.finalize_project_submission_secure(
  p_grant_id uuid,
  p_participant_id uuid,
  p_name text,
  p_category text,
  p_objective text,
  p_description text,
  p_district text,
  p_department text,
  p_requested_budget numeric,
  p_budget_category text,
  p_pdf_url text,
  p_data_truth_confirmed boolean
)
returns table (
  project_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_grant public.project_submission_upload_grants%rowtype;
  v_cycle public.project_cycles%rowtype;
  v_project_id uuid;
  v_now timestamp without time zone := clock_timestamp()::timestamp without time zone;
begin
  if p_data_truth_confirmed is distinct from true
     or p_name is null or length(p_name) < 3 or length(p_name) > 160
     or p_category not in (
       'Ambiente',
       'Educación',
       'Seguridad',
       'Salud',
       'Cultura',
       'Deporte',
       'Infraestructura',
       'Otros'
     )
     or p_objective is null or length(p_objective) < 10 or length(p_objective) > 2000
     or p_description is null or length(p_description) < 20 or length(p_description) > 8000
     or p_district is null or length(p_district) < 2 or length(p_district) > 120
     or p_department is null or length(p_department) < 2 or length(p_department) > 80
     or p_requested_budget is null
     or p_requested_budget <= 0
     or p_requested_budget > 30000
     or p_budget_category not in ('hasta_10000','hasta_20000','hasta_30000')
     or p_pdf_url is null
     or length(p_pdf_url) < 10
     or length(p_pdf_url) > 2000 then
    raise exception using errcode = 'P0001', message = 'submission_invalid';
  end if;

  if (p_requested_budget <= 10000 and p_budget_category <> 'hasta_10000')
     or (p_requested_budget > 10000 and p_requested_budget <= 20000 and p_budget_category <> 'hasta_20000')
     or (p_requested_budget > 20000 and p_requested_budget <= 30000 and p_budget_category <> 'hasta_30000') then
    raise exception using errcode = 'P0001', message = 'submission_invalid';
  end if;

  select *
  into v_grant
  from public.project_submission_upload_grants
  where id = p_grant_id
    and participant_id = p_participant_id
  for update;

  if not found
     or v_grant.finalized_at is not null
     or v_grant.cancelled_at is not null
     or v_grant.expires_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'upload_grant_invalid';
  end if;

  select *
  into v_cycle
  from public.project_cycles
  where id = v_grant.cycle_id
    and is_active = true
    and starts_at <= v_now
    and ends_at > v_now
  for share;

  if not found then
    raise exception using errcode = 'P0001', message = 'submission_closed';
  end if;

  if v_cycle.min_supports is null
     or v_cycle.min_supports < 1 then
    raise exception using errcode = 'P0001', message = 'submission_invalid';
  end if;

  if exists (
    select 1
    from public.projects
    where cycle_id = v_cycle.id
      and leader_id = p_participant_id
      and status in ('pending', 'active')
  ) then
    raise exception using errcode = 'P0001', message = 'participant_has_open_project';
  end if;

  begin
    insert into public.projects (
      cycle_id,
      leader_id,
      name,
      category,
      objective,
      description,
      district,
      department,
      requested_budget,
      budget_category,
      minimum_supports_required,
      eligible_for_final_review,
      pdf_url,
      status
    )
    values (
      v_cycle.id,
      p_participant_id,
      p_name,
      p_category,
      p_objective,
      p_description,
      p_district,
      p_department,
      p_requested_budget,
      p_budget_category,
      v_cycle.min_supports,
      false,
      p_pdf_url,
      'pending'
    )
    returning id into v_project_id;
  exception
    when unique_violation then
      raise exception using errcode = 'P0001', message = 'participant_has_open_project';
  end;

  update public.project_submission_upload_grants
  set
    finalized_at = clock_timestamp(),
    project_id = v_project_id
  where id = v_grant.id;

  return query
  select v_project_id;
end;
$function$;

revoke all
  on function public.finalize_project_submission_secure(
    uuid, uuid, text, text, text, text, text, text,
    numeric, text, text, boolean
  )
  from public, anon, authenticated, service_role;

grant execute
  on function public.finalize_project_submission_secure(
    uuid, uuid, text, text, text, text, text, text,
    numeric, text, text, boolean
  )
  to service_role;

commit;
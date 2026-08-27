-- B2C-E5F1
-- Fundacion privada del motor de preguntas con premio.
-- No activa premios y no modifica public.reto_questions.
-- Crea solo estructuras nuevas, RLS restrictivo y privilegios minimos.

begin;

-- ============================================================
-- PREFLIGHT
-- ============================================================

do $preflight$
begin
  if pg_catalog.to_regclass('public.reto_game_sessions') is null then
    raise exception 'B2C_E5F1_ABORT: public.reto_game_sessions no existe';
  end if;

  if pg_catalog.to_regclass('public.reto_knowledge_facts') is not null then
    raise exception 'B2C_E5F1_ABORT: public.reto_knowledge_facts ya existe';
  end if;

  if pg_catalog.to_regclass('public.reto_question_templates') is not null then
    raise exception 'B2C_E5F1_ABORT: public.reto_question_templates ya existe';
  end if;

  if pg_catalog.to_regclass('public.reto_prize_question_instances') is not null then
    raise exception 'B2C_E5F1_ABORT: public.reto_prize_question_instances ya existe';
  end if;
end
$preflight$;

-- ============================================================
-- CHANGE 1: BANCO MAESTRO PRIVADO DE HECHOS
-- ============================================================

create table public.reto_knowledge_facts (
  id uuid primary key default gen_random_uuid(),
  fact_key text not null unique,
  fact_type text not null,
  lang text not null default 'es',
  topic text not null,
  fact_data jsonb not null,
  eligible_sources text[] not null,
  difficulty smallint not null default 1,
  source_reference text,
  valid_from timestamptz,
  valid_until timestamptz,
  review_status text not null default 'draft',
  reviewed_at timestamptz,
  is_active boolean not null default false,
  version integer not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint reto_knowledge_facts_key_check
    check (
      pg_catalog.btrim(fact_key) ~ '^[a-z][a-z0-9._:-]{2,119}$'
    ),

  constraint reto_knowledge_facts_type_check
    check (
      fact_type in ('boolean','integer','decimal','text','date','membership')
    ),

  constraint reto_knowledge_facts_lang_check
    check (
      pg_catalog.btrim(lang) <> ''
      and pg_catalog.length(lang) <= 20
    ),

  constraint reto_knowledge_facts_topic_check
    check (
      pg_catalog.btrim(topic) <> ''
      and pg_catalog.length(topic) <= 240
    ),

  constraint reto_knowledge_facts_data_check
    check (
      pg_catalog.jsonb_typeof(fact_data) = 'object'
    ),

  constraint reto_knowledge_facts_sources_check
    check (
      pg_catalog.cardinality(eligible_sources) between 1 and 3
      and eligible_sources <@ array[
        'principal_level1',
        'principal_level2',
        'camino'
      ]::text[]
    ),

  constraint reto_knowledge_facts_difficulty_check
    check (difficulty between 1 and 5),

  constraint reto_knowledge_facts_validity_check
    check (
      valid_from is null
      or valid_until is null
      or valid_until > valid_from
    ),

  constraint reto_knowledge_facts_review_status_check
    check (
      review_status in ('draft','approved','retired')
    ),

  constraint reto_knowledge_facts_version_check
    check (version > 0),

  constraint reto_knowledge_facts_approval_check
    check (
      review_status <> 'approved'
      or (
        reviewed_at is not null
        and pg_catalog.btrim(coalesce(source_reference, '')) <> ''
      )
    ),

  constraint reto_knowledge_facts_active_check
    check (
      not is_active
      or review_status = 'approved'
    )
);

alter table public.reto_knowledge_facts owner to postgres;
alter table public.reto_knowledge_facts enable row level security;

create index reto_knowledge_facts_active_source_idx
  on public.reto_knowledge_facts(is_active, review_status);

create index reto_knowledge_facts_type_idx
  on public.reto_knowledge_facts(fact_type);

-- ============================================================
-- CHANGE 2: CATALOGO DE PLANTILLAS/OPERADORES APROBADOS
-- El codigo ejecutable permanece en TypeScript.
-- Esta tabla solo autoriza metadatos y configuracion declarativa.
-- ============================================================

create table public.reto_question_templates (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  fact_type text not null,
  operator_code text not null,
  allowed_sources text[] not null,
  config jsonb not null default '{}'::jsonb,
  difficulty smallint not null default 1,
  renderer_version integer not null default 1,
  review_status text not null default 'draft',
  reviewed_at timestamptz,
  is_active boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint reto_question_templates_code_check
    check (
      pg_catalog.btrim(code) ~ '^[a-z][a-z0-9_]{2,63}$'
    ),

  constraint reto_question_templates_type_check
    check (
      fact_type in ('boolean','integer','decimal','text','date','membership')
    ),

  constraint reto_question_templates_operator_check
    check (
      pg_catalog.btrim(operator_code) ~ '^[A-Z][A-Z0-9_]{2,63}$'
    ),

  constraint reto_question_templates_sources_check
    check (
      pg_catalog.cardinality(allowed_sources) between 1 and 3
      and allowed_sources <@ array[
        'principal_level1',
        'principal_level2',
        'camino'
      ]::text[]
    ),

  constraint reto_question_templates_config_check
    check (
      pg_catalog.jsonb_typeof(config) = 'object'
    ),

  constraint reto_question_templates_difficulty_check
    check (difficulty between 1 and 5),

  constraint reto_question_templates_renderer_version_check
    check (renderer_version > 0),

  constraint reto_question_templates_review_status_check
    check (
      review_status in ('draft','approved','retired')
    ),

  constraint reto_question_templates_approval_check
    check (
      review_status <> 'approved'
      or reviewed_at is not null
    ),

  constraint reto_question_templates_active_check
    check (
      not is_active
      or review_status = 'approved'
    )
);

alter table public.reto_question_templates owner to postgres;
alter table public.reto_question_templates enable row level security;

create index reto_question_templates_active_type_idx
  on public.reto_question_templates(is_active, fact_type);

-- ============================================================
-- CHANGE 3: INSTANCIAS PRIVADAS CONGELADAS POR SESION
-- ============================================================

create table public.reto_prize_question_instances (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  fact_id uuid not null,
  template_id uuid not null,
  source text not null,
  fact_version integer not null,
  operator_code text not null,
  parameters jsonb not null default '{}'::jsonb,
  fact_snapshot jsonb not null,
  question_text text not null,
  correct_answer boolean not null,
  issued_state_version integer not null,
  answered_state_version integer,
  issued_at timestamptz not null default pg_catalog.now(),
  expires_at timestamptz not null,
  answered_at timestamptz,
  submitted_answer boolean,
  was_correct boolean,
  answer_outcome text,

  constraint reto_prize_question_instances_session_fk
    foreign key (session_id)
    references public.reto_game_sessions(id)
    on delete restrict,

  constraint reto_prize_question_instances_fact_fk
    foreign key (fact_id)
    references public.reto_knowledge_facts(id)
    on delete restrict,

  constraint reto_prize_question_instances_template_fk
    foreign key (template_id)
    references public.reto_question_templates(id)
    on delete restrict,

  constraint reto_prize_question_instances_source_check
    check (
      source in ('principal_level1','principal_level2','camino')
    ),

  constraint reto_prize_question_instances_fact_version_check
    check (fact_version > 0),

  constraint reto_prize_question_instances_operator_check
    check (
      pg_catalog.btrim(operator_code) ~ '^[A-Z][A-Z0-9_]{2,63}$'
    ),

  constraint reto_prize_question_instances_parameters_check
    check (
      pg_catalog.jsonb_typeof(parameters) = 'object'
    ),

  constraint reto_prize_question_instances_snapshot_check
    check (
      pg_catalog.jsonb_typeof(fact_snapshot) = 'object'
    ),

  constraint reto_prize_question_instances_question_check
    check (
      pg_catalog.btrim(question_text) <> ''
      and pg_catalog.length(question_text) <= 5000
    ),

  constraint reto_prize_question_instances_issued_version_check
    check (issued_state_version > 0),

  constraint reto_prize_question_instances_answered_version_check
    check (
      answered_state_version is null
      or answered_state_version = issued_state_version + 1
    ),

  constraint reto_prize_question_instances_expiry_check
    check (expires_at > issued_at),

  constraint reto_prize_question_instances_answer_time_check
    check (
      answered_at is null
      or answered_at >= issued_at
    ),

  constraint reto_prize_question_instances_outcome_check
    check (
      answer_outcome is null
      or answer_outcome in ('correct','wrong','skipped','timed_out')
    ),

  constraint reto_prize_question_instances_answer_state_check
    check (
      (
        answered_at is null
        and answered_state_version is null
        and was_correct is null
        and answer_outcome is null
      )
      or
      (
        answered_at is not null
        and answered_state_version is not null
        and was_correct is not null
        and answer_outcome is not null
      )
    ),

  constraint reto_prize_question_instances_correctness_check
    check (
      answer_outcome is null
      or (answer_outcome = 'correct' and was_correct = true)
      or (answer_outcome <> 'correct' and was_correct = false)
    )
);

alter table public.reto_prize_question_instances owner to postgres;
alter table public.reto_prize_question_instances enable row level security;

-- Una sesion no puede tener dos preguntas pendientes a la vez.
create unique index reto_prize_question_instances_open_session_uniq
  on public.reto_prize_question_instances(session_id)
  where answered_at is null;

-- Un mismo hecho no se reutiliza dentro de una misma partida.
create unique index reto_prize_question_instances_session_fact_uniq
  on public.reto_prize_question_instances(session_id, fact_id);

create index reto_prize_question_instances_session_idx
  on public.reto_prize_question_instances(session_id, issued_at desc);

create index reto_prize_question_instances_fact_idx
  on public.reto_prize_question_instances(fact_id);

-- ============================================================
-- PRIVILEGIOS MINIMOS
-- No se crean policies.
-- service_role puede leer; no puede mutar directamente.
-- Las mutaciones futuras seran solo mediante RPC SECURITY DEFINER.
-- ============================================================

revoke all privileges on table public.reto_knowledge_facts
from PUBLIC, anon, authenticated, service_role;

revoke all privileges on table public.reto_question_templates
from PUBLIC, anon, authenticated, service_role;

revoke all privileges on table public.reto_prize_question_instances
from PUBLIC, anon, authenticated, service_role;

grant select on table public.reto_knowledge_facts
to service_role;

grant select on table public.reto_question_templates
to service_role;

grant select on table public.reto_prize_question_instances
to service_role;

-- ============================================================
-- POSTFLIGHT
-- ============================================================

do $postflight$
declare
  v_policy_count integer;
  v_bad_owner_count integer;
begin
  if pg_catalog.to_regclass('public.reto_knowledge_facts') is null
     or pg_catalog.to_regclass('public.reto_question_templates') is null
     or pg_catalog.to_regclass('public.reto_prize_question_instances') is null then
    raise exception 'B2C_E5F1_POSTFLIGHT: faltan tablas nuevas';
  end if;

  if pg_catalog.to_regclass('public.reto_prize_question_instances_open_session_uniq') is null
     or pg_catalog.to_regclass('public.reto_prize_question_instances_session_fact_uniq') is null then
    raise exception 'B2C_E5F1_POSTFLIGHT: faltan indices unicos';
  end if;

  select pg_catalog.count(*)
  into v_bad_owner_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_roles r on r.oid = c.relowner
  where n.nspname = 'public'
    and c.relname in (
      'reto_knowledge_facts',
      'reto_question_templates',
      'reto_prize_question_instances'
    )
    and r.rolname <> 'postgres';

  if v_bad_owner_count <> 0 then
    raise exception 'B2C_E5F1_POSTFLIGHT: owner inesperado';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'reto_knowledge_facts',
        'reto_question_templates',
        'reto_prize_question_instances'
      )
      and c.relrowsecurity is not true
  ) then
    raise exception 'B2C_E5F1_POSTFLIGHT: RLS no habilitado';
  end if;

  select pg_catalog.count(*)
  into v_policy_count
  from pg_catalog.pg_policies p
  where p.schemaname = 'public'
    and p.tablename in (
      'reto_knowledge_facts',
      'reto_question_templates',
      'reto_prize_question_instances'
    );

  if v_policy_count <> 0 then
    raise exception 'B2C_E5F1_POSTFLIGHT: policies inesperadas';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.reto_knowledge_facts', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.reto_question_templates', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.reto_prize_question_instances', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_knowledge_facts', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_question_templates', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_prize_question_instances', 'SELECT') then
    raise exception 'B2C_E5F1_POSTFLIGHT: lectura publica inesperada';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.reto_knowledge_facts', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.reto_question_templates', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.reto_prize_question_instances', 'SELECT') then
    raise exception 'B2C_E5F1_POSTFLIGHT: falta SELECT de service_role';
  end if;

  if pg_catalog.has_table_privilege('service_role', 'public.reto_knowledge_facts', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_knowledge_facts', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_knowledge_facts', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_question_templates', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_question_templates', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_question_templates', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_prize_question_instances', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_prize_question_instances', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_prize_question_instances', 'DELETE') then
    raise exception 'B2C_E5F1_POSTFLIGHT: mutacion directa de service_role inesperada';
  end if;

  if exists (select 1 from public.reto_knowledge_facts limit 1)
     or exists (select 1 from public.reto_question_templates limit 1)
     or exists (select 1 from public.reto_prize_question_instances limit 1) then
    raise exception 'B2C_E5F1_POSTFLIGHT: las tablas fundacionales deben nacer vacias';
  end if;
end
$postflight$;

commit;

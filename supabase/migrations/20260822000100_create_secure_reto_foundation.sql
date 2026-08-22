-- B-SEC-14HAJ-B1
-- Secure foundation for Reto Ciudadano prize-capable game flows.
-- Expand/contract phase only.

begin;

do $$
begin
  if pg_catalog.to_regclass('public.project_participants') is null then
    raise exception 'BSEC14HAJB1_ABORT: public.project_participants not found';
  end if;

  if pg_catalog.to_regclass('public.reto_premio_participants') is null then
    raise exception 'BSEC14HAJB1_ABORT: public.reto_premio_participants not found';
  end if;

  if pg_catalog.to_regclass('public.reto_premio_winners') is null then
    raise exception 'BSEC14HAJB1_ABORT: public.reto_premio_winners not found';
  end if;

  if pg_catalog.to_regclass('public.reto_game_sessions') is not null then
    raise exception 'BSEC14HAJB1_ABORT: public.reto_game_sessions already exists';
  end if;

  if pg_catalog.to_regclass('public.reto_camino_qualifiers') is not null then
    raise exception 'BSEC14HAJB1_ABORT: public.reto_camino_qualifiers already exists';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reto_premio_participants'
      and column_name = 'participant_id'
  ) then
    raise exception 'BSEC14HAJB1_ABORT: reto_premio_participants.participant_id already exists';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reto_premio_winners'
      and column_name = 'participant_id'
  ) then
    raise exception 'BSEC14HAJB1_ABORT: reto_premio_winners.participant_id already exists';
  end if;

  if exists (
    select rp.id
    from public.reto_premio_participants rp
    left join public.project_participants pp
      on (
        nullif(btrim(rp.dni), '') is not null
        and btrim(pp.dni) = btrim(rp.dni)
      )
      or (
        nullif(btrim(rp.email), '') is not null
        and lower(btrim(pp.email)) = lower(btrim(rp.email))
      )
      or (
        nullif(btrim(rp.celular), '') is not null
        and btrim(pp.phone) = btrim(rp.celular)
      )
    group by rp.id
    having count(pp.id) <> 1
  ) then
    raise exception 'BSEC14HAJB1_ABORT: premio participant mapping is not deterministic';
  end if;

  if exists (
    select rw.id
    from public.reto_premio_winners rw
    left join public.project_participants pp
      on (
        nullif(btrim(rw.dni), '') is not null
        and btrim(pp.dni) = btrim(rw.dni)
      )
      or (
        nullif(btrim(rw.email), '') is not null
        and lower(btrim(pp.email)) = lower(btrim(rw.email))
      )
      or (
        nullif(btrim(rw.celular), '') is not null
        and btrim(pp.phone) = btrim(rw.celular)
      )
    group by rw.id
    having count(pp.id) <> 1
  ) then
    raise exception 'BSEC14HAJB1_ABORT: winner mapping is not deterministic';
  end if;

  if exists (
    select 1
    from public.reto_premio_participants
    where group_code is null
       or btrim(group_code) !~ '^GRUPO[A-Z]$'
  ) then
    raise exception 'BSEC14HAJB1_ABORT: invalid group_code in reto_premio_participants';
  end if;

  if exists (
    select 1
    from public.reto_premio_winners
    where group_code is null
       or btrim(group_code) !~ '^GRUPO[A-Z]$'
  ) then
    raise exception 'BSEC14HAJB1_ABORT: invalid group_code in reto_premio_winners';
  end if;
end
$$;

alter table public.reto_premio_participants
  add column participant_id uuid;

update public.reto_premio_participants rp
set participant_id = pp.id
from public.project_participants pp
where (
    nullif(btrim(rp.dni), '') is not null
    and btrim(pp.dni) = btrim(rp.dni)
  )
  or (
    nullif(btrim(rp.email), '') is not null
    and lower(btrim(pp.email)) = lower(btrim(rp.email))
  )
  or (
    nullif(btrim(rp.celular), '') is not null
    and btrim(pp.phone) = btrim(rp.celular)
  );

do $$
begin
  if exists (
    select 1
    from public.reto_premio_participants
    where participant_id is null
  ) then
    raise exception 'BSEC14HAJB1_ABORT: premio participant backfill left unmapped rows';
  end if;
end
$$;

alter table public.reto_premio_participants
  add constraint reto_premio_participants_participant_fk
  foreign key (participant_id)
  references public.project_participants(id)
  on update restrict
  on delete restrict;

create unique index reto_premio_participants_participant_id_uniq
  on public.reto_premio_participants(participant_id)
  where participant_id is not null;

alter table public.reto_premio_winners
  add column participant_id uuid;

update public.reto_premio_winners rw
set participant_id = pp.id
from public.project_participants pp
where (
    nullif(btrim(rw.dni), '') is not null
    and btrim(pp.dni) = btrim(rw.dni)
  )
  or (
    nullif(btrim(rw.email), '') is not null
    and lower(btrim(pp.email)) = lower(btrim(rw.email))
  )
  or (
    nullif(btrim(rw.celular), '') is not null
    and btrim(pp.phone) = btrim(rw.celular)
  );

do $$
begin
  if exists (
    select 1
    from public.reto_premio_winners
    where participant_id is null
  ) then
    raise exception 'BSEC14HAJB1_ABORT: winner backfill left unmapped rows';
  end if;
end
$$;

alter table public.reto_premio_winners
  add constraint reto_premio_winners_participant_fk
  foreign key (participant_id)
  references public.project_participants(id)
  on update restrict
  on delete restrict;

create unique index reto_premio_winners_participant_month_uniq
  on public.reto_premio_winners(participant_id, year_month)
  where participant_id is not null;

create table public.reto_game_sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null,
  group_code text not null,
  game_code text not null,
  game_mode text not null default 'con_premio',
  status text not null default 'active',
  state_version integer not null default 1,
  state jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,

  constraint reto_game_sessions_participant_fk
    foreign key (participant_id)
    references public.project_participants(id)
    on update restrict
    on delete restrict,

  constraint reto_game_sessions_group_chk
    check (group_code ~ '^GRUPO[A-Z]$'),

  constraint reto_game_sessions_game_chk
    check (game_code in ('principal', 'camino')),

  constraint reto_game_sessions_mode_chk
    check (game_mode in ('sin_premio', 'con_premio')),

  constraint reto_game_sessions_status_chk
    check (status in ('active','completed','failed','expired','revoked')),

  constraint reto_game_sessions_state_version_chk
    check (state_version > 0),

  constraint reto_game_sessions_state_object_chk
    check (jsonb_typeof(state) = 'object'),

  constraint reto_game_sessions_expiry_chk
    check (expires_at > started_at),

  constraint reto_game_sessions_finished_chk
    check (finished_at is null or finished_at >= started_at),

  constraint reto_game_sessions_identity_uniq
    unique (id, participant_id, group_code)
);

create unique index reto_game_sessions_one_active_per_game_uniq
  on public.reto_game_sessions(participant_id, game_code)
  where status = 'active';

create index reto_game_sessions_group_status_idx
  on public.reto_game_sessions(group_code, status);

create index reto_game_sessions_expires_idx
  on public.reto_game_sessions(expires_at);

alter table public.reto_game_sessions enable row level security;

revoke all on table public.reto_game_sessions
  from public, anon, authenticated, service_role;

grant select, insert, update
  on table public.reto_game_sessions
  to service_role;

create table public.reto_camino_qualifiers (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null,
  game_session_id uuid not null,
  group_code text not null,
  award_year integer not null,
  award_quarter smallint not null,
  qualified_at timestamptz not null default now(),
  status text not null default 'eligible',
  selected_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reto_camino_qualifiers_participant_fk
    foreign key (participant_id)
    references public.project_participants(id)
    on update restrict
    on delete restrict,

  constraint reto_camino_qualifiers_session_identity_fk
    foreign key (game_session_id, participant_id, group_code)
    references public.reto_game_sessions(id, participant_id, group_code)
    on update restrict
    on delete restrict,

  constraint reto_camino_qualifiers_group_chk
    check (group_code ~ '^GRUPO[A-Z]$'),

  constraint reto_camino_qualifiers_year_chk
    check (award_year between 2020 and 2200),

  constraint reto_camino_qualifiers_quarter_chk
    check (award_quarter between 1 and 4),

  constraint reto_camino_qualifiers_status_chk
    check (status in ('eligible','selected','not_selected','cancelled')),

  constraint reto_camino_qualifiers_selected_time_chk
    check (selected_at is null or selected_at >= qualified_at),

  constraint reto_camino_qualifiers_session_uniq
    unique (game_session_id),

  constraint reto_camino_qualifiers_participant_period_uniq
    unique (participant_id, award_year, award_quarter)
);

create index reto_camino_qualifiers_period_idx
  on public.reto_camino_qualifiers(award_year, award_quarter, status);

create index reto_camino_qualifiers_group_period_idx
  on public.reto_camino_qualifiers(group_code, award_year, award_quarter);

alter table public.reto_camino_qualifiers enable row level security;

revoke all on table public.reto_camino_qualifiers
  from public, anon, authenticated, service_role;

grant select, insert, update
  on table public.reto_camino_qualifiers
  to service_role;

do $$
declare
  v_premio_total bigint;
  v_premio_mapped bigint;
  v_winner_total bigint;
  v_winner_mapped bigint;
  v_rls_count bigint;
begin
  select count(*), count(*) filter (where participant_id is not null)
  into v_premio_total, v_premio_mapped
  from public.reto_premio_participants;

  if v_premio_total <> v_premio_mapped then
    raise exception 'BSEC14HAJB1_ABORT: premio participant mapping postcheck failed';
  end if;

  select count(*), count(*) filter (where participant_id is not null)
  into v_winner_total, v_winner_mapped
  from public.reto_premio_winners;

  if v_winner_total <> v_winner_mapped then
    raise exception 'BSEC14HAJB1_ABORT: winner mapping postcheck failed';
  end if;

  select count(*)
  into v_rls_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('reto_game_sessions','reto_camino_qualifiers')
    and c.relrowsecurity = true;

  if v_rls_count <> 2 then
    raise exception 'BSEC14HAJB1_ABORT: new table RLS postcheck failed';
  end if;

  if
    has_table_privilege('anon','public.reto_game_sessions','SELECT')
    or has_table_privilege('anon','public.reto_game_sessions','INSERT')
    or has_table_privilege('anon','public.reto_game_sessions','UPDATE')
    or has_table_privilege('anon','public.reto_game_sessions','DELETE')
    or has_table_privilege('authenticated','public.reto_game_sessions','SELECT')
    or has_table_privilege('authenticated','public.reto_game_sessions','INSERT')
    or has_table_privilege('authenticated','public.reto_game_sessions','UPDATE')
    or has_table_privilege('authenticated','public.reto_game_sessions','DELETE')
    or has_table_privilege('anon','public.reto_camino_qualifiers','SELECT')
    or has_table_privilege('anon','public.reto_camino_qualifiers','INSERT')
    or has_table_privilege('anon','public.reto_camino_qualifiers','UPDATE')
    or has_table_privilege('anon','public.reto_camino_qualifiers','DELETE')
    or has_table_privilege('authenticated','public.reto_camino_qualifiers','SELECT')
    or has_table_privilege('authenticated','public.reto_camino_qualifiers','INSERT')
    or has_table_privilege('authenticated','public.reto_camino_qualifiers','UPDATE')
    or has_table_privilege('authenticated','public.reto_camino_qualifiers','DELETE')
  then
    raise exception 'BSEC14HAJB1_ABORT: client privilege postcheck failed';
  end if;

  if not (
    has_table_privilege('service_role','public.reto_game_sessions','SELECT')
    and has_table_privilege('service_role','public.reto_game_sessions','INSERT')
    and has_table_privilege('service_role','public.reto_game_sessions','UPDATE')
    and has_table_privilege('service_role','public.reto_camino_qualifiers','SELECT')
    and has_table_privilege('service_role','public.reto_camino_qualifiers','INSERT')
    and has_table_privilege('service_role','public.reto_camino_qualifiers','UPDATE')
  ) then
    raise exception 'BSEC14HAJB1_ABORT: service_role privilege postcheck failed';
  end if;
end
$$;

commit;

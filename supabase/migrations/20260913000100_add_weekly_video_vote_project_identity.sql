-- B-SEC COMMENTS / WEEKLY VIDEO VOTE IDENTITY
-- Añade identidad estable de participante a los votos semanales.
-- Conserva los campos legacy para compatibilidad historica.
-- No realiza backfill de votos existentes.

do $$
begin
  if pg_catalog.to_regclass(
       'public.weekly_video_votes'
     ) is null then
    raise exception
      'BSEC_VIDEO_VOTES_MISSING_TABLE: weekly_video_votes';
  end if;

  if pg_catalog.to_regclass(
       'public.project_participants'
     ) is null then
    raise exception
      'BSEC_VIDEO_VOTES_MISSING_TABLE: project_participants';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_video_votes'
      and column_name = 'project_participant_id'
  ) then
    raise exception
      'BSEC_VIDEO_VOTES_IDENTITY_ALREADY_EXISTS';
  end if;
end
$$;

alter table public.weekly_video_votes
  add column project_participant_id uuid;

alter table public.weekly_video_votes
  add constraint weekly_video_votes_project_participant_fk
  foreign key (project_participant_id)
  references public.project_participants(id)
  on update restrict
  on delete restrict;

create unique index
  weekly_video_votes_one_per_project_participant_per_topic
on public.weekly_video_votes (
  weekly_topic_id,
  project_participant_id
)
where project_participant_id is not null;

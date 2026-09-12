-- B-SEC COMMENTS / WEEKLY VIDEO IDENTITY
-- Añade identidad estable de participante a los videos semanales.
-- Conserva los campos legacy para compatibilidad.
-- No realiza backfill de datos historicos.

do $$
begin
  if pg_catalog.to_regclass(
       'public.weekly_video_entries'
     ) is null then
    raise exception
      'BSEC_WEEKLY_VIDEO_MISSING_TABLE: weekly_video_entries';
  end if;

  if pg_catalog.to_regclass(
       'public.project_participants'
     ) is null then
    raise exception
      'BSEC_WEEKLY_VIDEO_MISSING_TABLE: project_participants';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'weekly_video_entries'
      and column_name = 'project_participant_id'
  ) then
    raise exception
      'BSEC_WEEKLY_VIDEO_IDENTITY_ALREADY_EXISTS';
  end if;
end
$$;

alter table public.weekly_video_entries
  add column project_participant_id uuid;

alter table public.weekly_video_entries
  add constraint weekly_video_entries_project_participant_fk
  foreign key (project_participant_id)
  references public.project_participants(id)
  on update restrict
  on delete restrict;

create unique index
  weekly_video_entries_one_per_project_participant_per_topic
on public.weekly_video_entries (
  weekly_topic_id,
  project_participant_id
)
where project_participant_id is not null;

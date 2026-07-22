-- FASE 3.64-A
-- Relaciones base por evento para el modulo Solo para Ganadores.
-- Esta migracion no ejecuta backfill ni modifica assets, cleanup o Storage.

begin;

alter table public.solo_ganadores_posts
  add column event_id uuid null;

alter table public.solo_ganadores_posts
  add constraint solo_ganadores_posts_event_id_fkey
  foreign key (event_id)
  references public.solo_ganadores_events (id)
  on delete restrict;

create index solo_ganadores_posts_event_id_idx
  on public.solo_ganadores_posts (event_id)
  where event_id is not null;

alter table public.solo_ganadores_media
  add column event_id uuid null;

alter table public.solo_ganadores_media
  add constraint solo_ganadores_media_event_id_fkey
  foreign key (event_id)
  references public.solo_ganadores_events (id)
  on delete restrict;

create index solo_ganadores_media_event_id_idx
  on public.solo_ganadores_media (event_id)
  where event_id is not null;

do $$
declare
  v_constraint_oid oid;
begin
  select constraint_record.oid
  into v_constraint_oid
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conname = 'solo_ganadores_media_related_winner_id_fkey'
    and constraint_record.conrelid = 'public.solo_ganadores_media'::pg_catalog.regclass;

  if v_constraint_oid is null then
    alter table public.solo_ganadores_media
      add constraint solo_ganadores_media_related_winner_id_fkey
      foreign key (related_winner_id)
      references public.solo_ganadores_posts (id)
      on delete set null
      not valid;
  elsif not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_attribute as local_attribute
      on local_attribute.attrelid = constraint_record.conrelid
      and local_attribute.attnum = constraint_record.conkey[1]
    join pg_catalog.pg_attribute as referenced_attribute
      on referenced_attribute.attrelid = constraint_record.confrelid
      and referenced_attribute.attnum = constraint_record.confkey[1]
    where constraint_record.oid = v_constraint_oid
      and constraint_record.contype = 'f'
      and constraint_record.conrelid = 'public.solo_ganadores_media'::pg_catalog.regclass
      and constraint_record.confrelid = 'public.solo_ganadores_posts'::pg_catalog.regclass
      and pg_catalog.array_length(constraint_record.conkey, 1) = 1
      and pg_catalog.array_length(constraint_record.confkey, 1) = 1
      and local_attribute.attname = 'related_winner_id'
      and referenced_attribute.attname = 'id'
      and constraint_record.confdeltype = 'n'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'INCOMPATIBLE_RELATED_WINNER_FKEY';
  end if;
end;
$$;

alter table public.solo_ganadores_media
  validate constraint solo_ganadores_media_related_winner_id_fkey;

create index solo_ganadores_media_related_winner_id_idx
  on public.solo_ganadores_media (related_winner_id)
  where related_winner_id is not null;

comment on column public.solo_ganadores_posts.event_id is
  'Relaciona cada ganador con el evento de premiacion correspondiente.';

comment on column public.solo_ganadores_media.event_id is
  'Relaciona cada elemento de galeria con el evento de premiacion correspondiente.';

commit;

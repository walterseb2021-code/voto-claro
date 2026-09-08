-- B-SEC COMMENTS / WEEKLY VOTING
-- Cierra acceso directo de clientes y restringe RPC mutadoras del ciclo.
-- No borra ni modifica datos funcionales.

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'comment_awards',
    'user_comments',
    'weekly_founder_questions',
    'weekly_topics',
    'weekly_topics_queue',
    'weekly_video_entries',
    'weekly_video_votes'
  ]
  loop
    if pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_table)
    ) is null then
      raise exception 'BSEC_COMMENTS_MISSING_TABLE: %', v_table;
    end if;
  end loop;

  if pg_catalog.to_regprocedure(
       'public.activate_next_weekly_topic()'
     ) is null then
    raise exception
      'BSEC_COMMENTS_MISSING_FUNCTION: activate_next_weekly_topic()';
  end if;

  if pg_catalog.to_regprocedure(
       'public.advance_weekly_topics_cycle()'
     ) is null then
    raise exception
      'BSEC_COMMENTS_MISSING_FUNCTION: advance_weekly_topics_cycle()';
  end if;

  if pg_catalog.to_regprocedure(
       'public.publish_weekly_winner_for_topic(uuid)'
     ) is null then
    raise exception
      'BSEC_COMMENTS_MISSING_FUNCTION: publish_weekly_winner_for_topic(uuid)';
  end if;
end
$$;

-- Defensa adicional mediante RLS.
alter table public.comment_awards
  enable row level security;

alter table public.user_comments
  enable row level security;

alter table public.weekly_founder_questions
  enable row level security;

alter table public.weekly_topics
  enable row level security;

alter table public.weekly_topics_queue
  enable row level security;

alter table public.weekly_video_entries
  enable row level security;

alter table public.weekly_video_votes
  enable row level security;

-- El navegador no debe acceder directamente a estas tablas.
revoke all privileges
on table public.comment_awards
from public, anon, authenticated;

revoke all privileges
on table public.user_comments
from public, anon, authenticated;

revoke all privileges
on table public.weekly_founder_questions
from public, anon, authenticated;

revoke all privileges
on table public.weekly_topics
from public, anon, authenticated;

revoke all privileges
on table public.weekly_topics_queue
from public, anon, authenticated;

revoke all privileges
on table public.weekly_video_entries
from public, anon, authenticated;

revoke all privileges
on table public.weekly_video_votes
from public, anon, authenticated;

-- Mantener el runtime server-side actualmente auditado.
grant select, insert, update, delete
on table public.comment_awards
to service_role;

grant select, insert, update, delete
on table public.user_comments
to service_role;

grant select, insert, update, delete
on table public.weekly_founder_questions
to service_role;

grant select, insert, update, delete
on table public.weekly_topics
to service_role;

grant select, insert, update, delete
on table public.weekly_topics_queue
to service_role;

grant select, insert, update, delete
on table public.weekly_video_entries
to service_role;

grant select, insert, update, delete
on table public.weekly_video_votes
to service_role;

-- Las mutaciones del ciclo solamente se ejecutan server-side.
revoke all privileges
on function public.activate_next_weekly_topic()
from public, anon, authenticated;

revoke all privileges
on function public.advance_weekly_topics_cycle()
from public, anon, authenticated;

revoke all privileges
on function public.publish_weekly_winner_for_topic(uuid)
from public, anon, authenticated;

grant execute
on function public.activate_next_weekly_topic()
to service_role;

grant execute
on function public.advance_weekly_topics_cycle()
to service_role;

grant execute
on function public.publish_weekly_winner_for_topic(uuid)
to service_role;
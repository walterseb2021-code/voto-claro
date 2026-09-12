-- B-SEC COMMENTS / ARCHIVED FORUM
-- Cierra el acceso directo de clientes a archived_topic_forum_comments.
-- No borra ni modifica datos funcionales.
-- No modifica los privilegios actuales de service_role.

do $$
begin
  if pg_catalog.to_regclass(
       'public.archived_topic_forum_comments'
     ) is null then
    raise exception
      'BSEC_COMMENTS_MISSING_TABLE: archived_topic_forum_comments';
  end if;
end
$$;

alter table public.archived_topic_forum_comments
  enable row level security;

revoke all privileges
on table public.archived_topic_forum_comments
from public, anon, authenticated;

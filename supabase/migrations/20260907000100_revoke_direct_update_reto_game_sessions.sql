-- B2C POST-E4C: remove direct UPDATE privilege from reto_game_sessions.
-- Runtime mutations must go through SECURITY DEFINER atomic RPCs.

begin;

revoke update on table public.reto_game_sessions
from service_role;

do $postflight$
begin
  if pg_catalog.has_table_privilege('service_role', 'public.reto_game_sessions', 'UPDATE') then
    raise exception 'POST_E4C_ABORT: service_role still has UPDATE on reto_game_sessions';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.reto_game_sessions', 'SELECT') then
    raise exception 'POST_E4C_ABORT: service_role lost SELECT on reto_game_sessions';
  end if;

  if pg_catalog.has_table_privilege('service_role', 'public.reto_game_sessions', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_game_sessions', 'DELETE') then
    raise exception 'POST_E4C_ABORT: unexpected direct DML privilege remains';
  end if;
end
$postflight$;

commit;

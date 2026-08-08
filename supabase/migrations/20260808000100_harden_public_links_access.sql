-- B-SEC-14F
-- Cierra el acceso directo de anon/authenticated a los enlaces de /pitch.
-- Los endpoints server-side continúan usando service_role.
-- Esta migración NO se ejecuta desde este script; solo se versiona localmente.

begin;

alter table public.votoclaro_public_links enable row level security;

drop policy if exists "public can read active pitch tokens"
  on public.votoclaro_public_links;

revoke all privileges
  on table public.votoclaro_public_links
  from public;

revoke all privileges
  on table public.votoclaro_public_links
  from anon;

revoke all privileges
  on table public.votoclaro_public_links
  from authenticated;

revoke all privileges
  on table public.votoclaro_public_links
  from service_role;

grant select, update
  on table public.votoclaro_public_links
  to service_role;

commit;
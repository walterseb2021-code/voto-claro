-- B-SEC-14L
-- Blindaje de public.comment_access_participants.
-- El acceso funcional existente se realiza desde endpoints server-side con service_role.
-- Esta migración se VERSIONA localmente; este script NO la ejecuta en Supabase.

begin;

alter table public.comment_access_participants
  enable row level security;

revoke all privileges
  on table public.comment_access_participants
  from public;

revoke all privileges
  on table public.comment_access_participants
  from anon;

revoke all privileges
  on table public.comment_access_participants
  from authenticated;

revoke all privileges
  on table public.comment_access_participants
  from service_role;

grant select, insert, update
  on table public.comment_access_participants
  to service_role;

commit;
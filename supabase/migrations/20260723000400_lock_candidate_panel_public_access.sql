-- Candidate panel public-access lockdown.
-- Execute only after the candidate panel session foundation is deployed and validated.
-- This migration keeps public read access for live transmissions and removes public PIN access/writes.

alter table public.votoclaro_candidate_pins enable row level security;

drop policy if exists candidate_pins_select_all on public.votoclaro_candidate_pins;
drop policy if exists candidate_pins_insert_all on public.votoclaro_candidate_pins;
drop policy if exists candidate_pins_update_all on public.votoclaro_candidate_pins;
drop policy if exists candidate_pins_delete_all on public.votoclaro_candidate_pins;
drop policy if exists votoclaro_candidate_pins_select_all on public.votoclaro_candidate_pins;
drop policy if exists votoclaro_candidate_pins_insert_all on public.votoclaro_candidate_pins;
drop policy if exists votoclaro_candidate_pins_update_all on public.votoclaro_candidate_pins;
drop policy if exists votoclaro_candidate_pins_delete_all on public.votoclaro_candidate_pins;

revoke select, insert, update, delete, truncate, references, trigger
  on table public.votoclaro_candidate_pins
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.votoclaro_candidate_pins
  to service_role;

alter table public.votoclaro_live_entries enable row level security;

drop policy if exists live_entries_write_all on public.votoclaro_live_entries;
drop policy if exists live_entries_insert_all on public.votoclaro_live_entries;
drop policy if exists live_entries_update_all on public.votoclaro_live_entries;
drop policy if exists live_entries_delete_all on public.votoclaro_live_entries;
drop policy if exists live_entries_select_all on public.votoclaro_live_entries;
drop policy if exists votoclaro_live_entries_write_all on public.votoclaro_live_entries;
drop policy if exists votoclaro_live_entries_insert_all on public.votoclaro_live_entries;
drop policy if exists votoclaro_live_entries_update_all on public.votoclaro_live_entries;
drop policy if exists votoclaro_live_entries_delete_all on public.votoclaro_live_entries;
drop policy if exists votoclaro_live_entries_select_all on public.votoclaro_live_entries;
drop policy if exists live_entries_public_select on public.votoclaro_live_entries;

create policy live_entries_public_select
  on public.votoclaro_live_entries
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate, references, trigger
  on table public.votoclaro_live_entries
  from public, anon, authenticated;

revoke select
  on table public.votoclaro_live_entries
  from public;

grant select
  on table public.votoclaro_live_entries
  to anon, authenticated;

grant select, insert, update, delete
  on table public.votoclaro_live_entries
  to service_role;

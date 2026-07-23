-- Fix PL/pgSQL ambiguity in public.create_candidate_live_entry.
-- RETURNS TABLE output names (id, candidate_id, status, etc.) are PL/pgSQL
-- variables, so every table column reference below is explicitly aliased.

create or replace function public.create_candidate_live_entry(
  p_candidate_id text,
  p_candidate_name text,
  p_platform text,
  p_url text
)
returns table(
  id uuid,
  candidate_id text,
  candidate_name text,
  platform text,
  url text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := pg_catalog.now();
begin
  update public.votoclaro_live_entries as live
     set status = 'ENDED'
   where live.candidate_id = p_candidate_id
     and live.status = 'LIVE';

  return query
  with inserted_live as (
    insert into public.votoclaro_live_entries as new_live (
      candidate_id,
      candidate_name,
      platform,
      url,
      status,
      created_at
    )
    values (
      p_candidate_id,
      p_candidate_name,
      p_platform,
      p_url,
      'LIVE',
      v_now
    )
    returning
      new_live.id,
      new_live.candidate_id,
      new_live.candidate_name,
      new_live.platform,
      new_live.url,
      new_live.status,
      new_live.created_at
  )
  select
    inserted_live.id,
    inserted_live.candidate_id,
    inserted_live.candidate_name,
    inserted_live.platform::text,
    inserted_live.url,
    inserted_live.status::text,
    inserted_live.created_at
  from inserted_live;
end;
$$;

revoke all on function public.create_candidate_live_entry(text, text, text, text) from public;
revoke all on function public.create_candidate_live_entry(text, text, text, text) from anon;
revoke all on function public.create_candidate_live_entry(text, text, text, text) from authenticated;
grant execute on function public.create_candidate_live_entry(text, text, text, text) to service_role;

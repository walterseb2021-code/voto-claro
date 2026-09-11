-- B-SEC ADMIN COMMENTS / WEEKLY TOPICS ENGINE
-- Harden weekly-topic lifecycle, concurrency and administrative mutations.
-- Forward-compatible migration: direct service_role DML is NOT revoked yet.

begin;

do $preflight$
declare
  v_active_count integer;
begin
  -- Required tables must exist.
  if pg_catalog.to_regclass('public.weekly_topics') is null then
    raise exception 'BSEC_WEEKLY_ABORT: weekly_topics missing';
  end if;

  if pg_catalog.to_regclass('public.weekly_topics_queue') is null then
    raise exception 'BSEC_WEEKLY_ABORT: weekly_topics_queue missing';
  end if;

  if pg_catalog.to_regclass('public.weekly_video_entries') is null then
    raise exception 'BSEC_WEEKLY_ABORT: weekly_video_entries missing';
  end if;

  if pg_catalog.to_regclass('public.weekly_video_votes') is null then
    raise exception 'BSEC_WEEKLY_ABORT: weekly_video_votes missing';
  end if;

  -- Existing weekly engine must still exist with the audited signatures.
  if pg_catalog.to_regprocedure(
       'public.activate_next_weekly_topic()'
     ) is null then
    raise exception 'BSEC_WEEKLY_ABORT: activate_next_weekly_topic() missing';
  end if;

  if pg_catalog.to_regprocedure(
       'public.advance_weekly_topics_cycle()'
     ) is null then
    raise exception 'BSEC_WEEKLY_ABORT: advance_weekly_topics_cycle() missing';
  end if;

  if pg_catalog.to_regprocedure(
       'public.publish_weekly_winner_for_topic(uuid)'
     ) is null then
    raise exception 'BSEC_WEEKLY_ABORT: publish_weekly_winner_for_topic(uuid) missing';
  end if;

  -- New security foundation must not already exist.
  if pg_catalog.to_regclass('public.comments_admin_audit') is not null then
    raise exception 'BSEC_WEEKLY_ABORT: comments_admin_audit already exists';
  end if;

  if pg_catalog.to_regprocedure(
       'public.enforce_comments_admin_audit_append_only()'
     ) is not null then
    raise exception 'BSEC_WEEKLY_ABORT: audit append-only function already exists';
  end if;

  if pg_catalog.to_regprocedure(
       'public.enforce_weekly_video_vote_eligibility()'
     ) is not null then
    raise exception 'BSEC_WEEKLY_ABORT: vote eligibility function already exists';
  end if;

  if pg_catalog.to_regprocedure(
       'public.admin_create_weekly_topic(text,text,text,uuid)'
     ) is not null then
    raise exception 'BSEC_WEEKLY_ABORT: admin_create_weekly_topic already exists';
  end if;

  if pg_catalog.to_regprocedure(
       'public.admin_update_active_weekly_topic(uuid,text,text,text,uuid)'
     ) is not null then
    raise exception 'BSEC_WEEKLY_ABORT: admin_update_active_weekly_topic already exists';
  end if;

  if pg_catalog.to_regprocedure(
       'public.admin_run_weekly_topics_cycle(text,uuid)'
     ) is not null then
    raise exception 'BSEC_WEEKLY_ABORT: admin_run_weekly_topics_cycle already exists';
  end if;

  -- Names introduced by this migration must still be free.
  if exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = pg_catalog.to_regclass('public.weekly_topics')
       and conname = 'weekly_topics_status_check'
  ) then
    raise exception 'BSEC_WEEKLY_ABORT: weekly_topics_status_check already exists';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = pg_catalog.to_regclass('public.weekly_topics_queue')
       and conname = 'weekly_topics_queue_status_check'
  ) then
    raise exception 'BSEC_WEEKLY_ABORT: weekly_topics_queue_status_check already exists';
  end if;

  if pg_catalog.to_regclass('public.weekly_topics_one_active_uniq') is not null then
    raise exception 'BSEC_WEEKLY_ABORT: weekly_topics_one_active_uniq already exists';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_trigger
     where tgrelid = pg_catalog.to_regclass('public.weekly_video_votes')
       and tgname = 'trg_weekly_video_vote_eligibility'
       and not tgisinternal
  ) then
    raise exception 'BSEC_WEEKLY_ABORT: trg_weekly_video_vote_eligibility already exists';
  end if;
  -- The structural invariant can only be installed on coherent data.
  select pg_catalog.count(*)::integer
    into v_active_count
    from public.weekly_topics
   where status = 'active';

  if v_active_count > 1 then
    raise exception
      'BSEC_WEEKLY_ABORT: more than one active weekly topic exists';
  end if;

  if exists (
    select 1
      from public.weekly_topics
     where status is null
        or status not in ('active', 'voting', 'archived')
  ) then
    raise exception
      'BSEC_WEEKLY_ABORT: unexpected weekly_topics status';
  end if;

  if exists (
    select 1
      from public.weekly_topics_queue
     where status is null
        or status not in ('queued', 'activated')
  ) then
    raise exception
      'BSEC_WEEKLY_ABORT: unexpected weekly_topics_queue status';
  end if;
end
$preflight$;
-- ---------------------------------------------------------------------------
-- Private append-only administrative audit for Comments.
-- ---------------------------------------------------------------------------

create table public.comments_admin_audit (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  created_at timestamptz not null default pg_catalog.now(),
  request_id uuid not null,
  actor_email text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_snapshot jsonb,
  after_snapshot jsonb,

  constraint comments_admin_audit_actor_check
    check (
      pg_catalog.length(pg_catalog.btrim(actor_email)) between 3 and 320
      and actor_email = pg_catalog.lower(pg_catalog.btrim(actor_email))
    ),

  constraint comments_admin_audit_action_check
    check (
      pg_catalog.btrim(action) ~ '^[a-z][a-z0-9_.:-]{2,79}$'
    ),

  constraint comments_admin_audit_entity_type_check
    check (
      pg_catalog.btrim(entity_type) ~ '^[a-z][a-z0-9_.:-]{2,79}$'
    ),

  constraint comments_admin_audit_snapshot_check
    check (
      (
        before_snapshot is null
        or pg_catalog.jsonb_typeof(before_snapshot) = 'object'
      )
      and (
        after_snapshot is null
        or pg_catalog.jsonb_typeof(after_snapshot) = 'object'
      )
      and (
        before_snapshot is not null
        or after_snapshot is not null
      )
    )
);

alter table public.comments_admin_audit
  owner to postgres;

alter table public.comments_admin_audit
  enable row level security;

create index comments_admin_audit_entity_idx
  on public.comments_admin_audit(
    entity_type,
    entity_id,
    created_at desc
  );

create index comments_admin_audit_request_idx
  on public.comments_admin_audit(request_id);

create index comments_admin_audit_created_idx
  on public.comments_admin_audit(created_at desc);

create function public.enforce_comments_admin_audit_append_only()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception using
    errcode = '42501',
    message = 'COMMENTS_ADMIN_AUDIT_APPEND_ONLY';
end;
$function$;

alter function public.enforce_comments_admin_audit_append_only()
  owner to postgres;

create trigger trg_comments_admin_audit_append_only
before update or delete
on public.comments_admin_audit
for each row
execute function public.enforce_comments_admin_audit_append_only();

revoke all privileges
on table public.comments_admin_audit
from PUBLIC, anon, authenticated, service_role;

revoke all privileges
on function public.enforce_comments_admin_audit_append_only()
from PUBLIC, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Structural invariants for the weekly-topic lifecycle.
-- ---------------------------------------------------------------------------

alter table public.weekly_topics
  alter column status set not null;

alter table public.weekly_topics
  add constraint weekly_topics_status_check
  check (status in ('active', 'voting', 'archived'));

alter table public.weekly_topics_queue
  add constraint weekly_topics_queue_status_check
  check (status in ('queued', 'activated'));

create unique index weekly_topics_one_active_uniq
  on public.weekly_topics(status)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- Atomic vote eligibility barrier and winner publication.
-- ---------------------------------------------------------------------------

create function public.enforce_weekly_video_vote_eligibility()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  perform 1
    from public.weekly_topics as topic
   where topic.id = new.weekly_topic_id
     and topic.status = 'voting'
   for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'WEEKLY_VOTE_TOPIC_NOT_VOTING';
  end if;

  perform 1
    from public.weekly_video_entries as video
   where video.id = new.weekly_video_entry_id
     and video.weekly_topic_id = new.weekly_topic_id
     and video.status = 'reviewed'
   for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'WEEKLY_VOTE_VIDEO_NOT_ELIGIBLE';
  end if;

  return new;
end;
$function$;

alter function public.enforce_weekly_video_vote_eligibility()
  owner to postgres;

create trigger trg_weekly_video_vote_eligibility
before insert
on public.weekly_video_votes
for each row
execute function public.enforce_weekly_video_vote_eligibility();

revoke all privileges
on function public.enforce_weekly_video_vote_eligibility()
from PUBLIC, anon, authenticated, service_role;

create or replace function public.publish_weekly_winner_for_topic(
  p_topic_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  winner_video_id uuid;
  winner_vote_count integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'voto-claro:comments:weekly-topics',
      0
    )
  );

  perform 1
    from public.weekly_topics as topic
   where topic.id = p_topic_id
     and topic.status = 'voting'
   for update;

  if not found then
    return;
  end if;

  select
    video.id,
    pg_catalog.count(vote.id)::integer
  into winner_video_id, winner_vote_count
  from public.weekly_video_entries as video
  left join public.weekly_video_votes as vote
    on vote.weekly_video_entry_id = video.id
  where video.weekly_topic_id = p_topic_id
    and video.status = 'reviewed'
  group by video.id, video.created_at
  order by pg_catalog.count(vote.id) desc, video.created_at asc
  limit 1;

  update public.weekly_topics
     set winner_video_entry_id = winner_video_id,
         winner_votes = coalesce(winner_vote_count, 0),
         winner_published_at = pg_catalog.now(),
         status = 'archived'
   where id = p_topic_id
     and status = 'voting';
end;
$function$;

alter function public.publish_weekly_winner_for_topic(uuid)
  owner to postgres;

revoke all privileges
on function public.publish_weekly_winner_for_topic(uuid)
from PUBLIC, anon, authenticated;

grant execute
on function public.publish_weekly_winner_for_topic(uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- Hardened weekly-topic lifecycle engine.
-- ---------------------------------------------------------------------------

create or replace function public.activate_next_weekly_topic()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  next_topic record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'voto-claro:comments:weekly-topics',
      0
    )
  );

  if exists (
    select 1
      from public.weekly_topics
     where status = 'active'
  ) then
    return;
  end if;

  select queue_row.*
    into next_topic
    from public.weekly_topics_queue as queue_row
   where queue_row.status = 'queued'
   order by queue_row.starts_at asc, queue_row.created_at asc
   limit 1
   for update;

  if not found then
    return;
  end if;

  insert into public.weekly_topics (
    topic,
    question,
    status,
    starts_at,
    ends_at
  )
  values (
    next_topic.topic,
    next_topic.question,
    'active',
    next_topic.starts_at,
    next_topic.ends_at
  );

  update public.weekly_topics_queue
     set status = 'activated'
   where id = next_topic.id
     and status = 'queued';

  if not found then
    raise exception using
      errcode = '40001',
      message = 'WEEKLY_QUEUE_ACTIVATION_CONFLICT';
  end if;
end;
$function$;

alter function public.activate_next_weekly_topic()
  owner to postgres;

revoke all privileges
on function public.activate_next_weekly_topic()
from PUBLIC, anon, authenticated;

grant execute
on function public.activate_next_weekly_topic()
to service_role;

create or replace function public.advance_weekly_topics_cycle()
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  topic_row record;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'voto-claro:comments:weekly-topics',
      0
    )
  );

  update public.weekly_topics
     set status = 'voting'
   where status = 'active'
     and ends_at < pg_catalog.now();

  for topic_row in
    select topic.id
      from public.weekly_topics as topic
     where topic.status = 'voting'
       and topic.ends_at < pg_catalog.now() - interval '7 days'
     order by topic.ends_at asc, topic.created_at asc
  loop
    perform public.publish_weekly_winner_for_topic(topic_row.id);
  end loop;

  perform public.activate_next_weekly_topic();
end;
$function$;

alter function public.advance_weekly_topics_cycle()
  owner to postgres;

revoke all privileges
on function public.advance_weekly_topics_cycle()
from PUBLIC, anon, authenticated;

grant execute
on function public.advance_weekly_topics_cycle()
to service_role;

-- ---------------------------------------------------------------------------
-- Administrative RPC: create a new active weekly topic.
-- ---------------------------------------------------------------------------

create function public.admin_create_weekly_topic(
  p_topic text,
  p_question text,
  p_actor_email text,
  p_request_id uuid
)
returns table (
  id uuid,
  topic text,
  question text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  winner_video_entry_id uuid,
  winner_votes integer,
  winner_published_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_topic text := pg_catalog.btrim(p_topic);
  v_question text := pg_catalog.btrim(p_question);
  v_actor_email text := pg_catalog.lower(pg_catalog.btrim(p_actor_email));
  v_now timestamptz := pg_catalog.now();
  v_topic_id uuid;
  v_after jsonb;
begin
  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_ACTOR';
  end if;

  if v_topic is null
     or pg_catalog.length(v_topic) < 1
     or pg_catalog.length(v_topic) > 200 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_TOPIC';
  end if;

  if v_question is null
     or pg_catalog.length(v_question) < 1
     or pg_catalog.length(v_question) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_QUESTION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'voto-claro:comments:weekly-topics',
      0
    )
  );

  if exists (
    select 1
      from public.weekly_topics as existing_topic
     where existing_topic.status = 'active'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_WEEKLY_ACTIVE_EXISTS';
  end if;

  insert into public.weekly_topics (
    topic,
    question,
    status,
    starts_at,
    ends_at
  )
  values (
    v_topic,
    v_question,
    'active',
    v_now,
    v_now + interval '7 days'
  )
  returning weekly_topics.id
       into v_topic_id;

  select pg_catalog.jsonb_build_object(
           'id', wt.id,
           'topic', wt.topic,
           'question', wt.question,
           'status', wt.status,
           'starts_at', wt.starts_at,
           'ends_at', wt.ends_at,
           'winner_video_entry_id', wt.winner_video_entry_id,
           'winner_votes', wt.winner_votes,
           'winner_published_at', wt.winner_published_at
         )
    into v_after
    from public.weekly_topics as wt
   where wt.id = v_topic_id;

  insert into public.comments_admin_audit (
    request_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_snapshot,
    after_snapshot
  )
  values (
    p_request_id,
    v_actor_email,
    'weekly_topic.create',
    'weekly_topic',
    v_topic_id,
    null,
    v_after
  );

  return query
  select
    wt.id,
    wt.topic,
    wt.question,
    wt.status,
    wt.starts_at,
    wt.ends_at,
    wt.winner_video_entry_id,
    wt.winner_votes,
    wt.winner_published_at
  from public.weekly_topics as wt
  where wt.id = v_topic_id;
end;
$function$;

alter function public.admin_create_weekly_topic(text, text, text, uuid)
  owner to postgres;

revoke all privileges
on function public.admin_create_weekly_topic(text, text, text, uuid)
from PUBLIC, anon, authenticated;

grant execute
on function public.admin_create_weekly_topic(text, text, text, uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- Administrative RPC: update an active weekly topic.
-- ---------------------------------------------------------------------------

create function public.admin_update_active_weekly_topic(
  p_topic_id uuid,
  p_topic text,
  p_question text,
  p_actor_email text,
  p_request_id uuid
)
returns table (
  id uuid,
  topic text,
  question text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  winner_video_entry_id uuid,
  winner_votes integer,
  winner_published_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_topic text := pg_catalog.btrim(p_topic);
  v_question text := pg_catalog.btrim(p_question);
  v_actor_email text := pg_catalog.lower(pg_catalog.btrim(p_actor_email));
  v_current_status text;
  v_before jsonb;
  v_after jsonb;
begin
  if p_topic_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_TOPIC_ID';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_ACTOR';
  end if;

  if v_topic is null
     or pg_catalog.length(v_topic) < 1
     or pg_catalog.length(v_topic) > 200 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_TOPIC';
  end if;

  if v_question is null
     or pg_catalog.length(v_question) < 1
     or pg_catalog.length(v_question) > 1000 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_QUESTION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'voto-claro:comments:weekly-topics',
      0
    )
  );

  select
    wt.status,
    pg_catalog.jsonb_build_object(
      'id', wt.id,
      'topic', wt.topic,
      'question', wt.question,
      'status', wt.status,
      'starts_at', wt.starts_at,
      'ends_at', wt.ends_at,
      'winner_video_entry_id', wt.winner_video_entry_id,
      'winner_votes', wt.winner_votes,
      'winner_published_at', wt.winner_published_at
    )
  into
    v_current_status,
    v_before
  from public.weekly_topics as wt
  where wt.id = p_topic_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_WEEKLY_TOPIC_NOT_FOUND';
  end if;

  if v_current_status <> 'active' then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_WEEKLY_TOPIC_NOT_ACTIVE';
  end if;

  update public.weekly_topics as wt
     set topic = v_topic,
         question = v_question
   where wt.id = p_topic_id
     and wt.status = 'active'
  returning pg_catalog.jsonb_build_object(
              'id', wt.id,
              'topic', wt.topic,
              'question', wt.question,
              'status', wt.status,
              'starts_at', wt.starts_at,
              'ends_at', wt.ends_at,
              'winner_video_entry_id', wt.winner_video_entry_id,
              'winner_votes', wt.winner_votes,
              'winner_published_at', wt.winner_published_at
            )
       into v_after;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'ADMIN_WEEKLY_UPDATE_CONFLICT';
  end if;

  insert into public.comments_admin_audit (
    request_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_snapshot,
    after_snapshot
  )
  values (
    p_request_id,
    v_actor_email,
    'weekly_topic.update',
    'weekly_topic',
    p_topic_id,
    v_before,
    v_after
  );

  return query
  select
    wt.id,
    wt.topic,
    wt.question,
    wt.status,
    wt.starts_at,
    wt.ends_at,
    wt.winner_video_entry_id,
    wt.winner_votes,
    wt.winner_published_at
  from public.weekly_topics as wt
  where wt.id = p_topic_id;
end;
$function$;

alter function public.admin_update_active_weekly_topic(uuid, text, text, text, uuid)
  owner to postgres;

revoke all privileges
on function public.admin_update_active_weekly_topic(uuid, text, text, text, uuid)
from PUBLIC, anon, authenticated;

grant execute
on function public.admin_update_active_weekly_topic(uuid, text, text, text, uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- Administrative RPC: run the canonical weekly-topic lifecycle manually.
-- ---------------------------------------------------------------------------

create function public.admin_run_weekly_topics_cycle(
  p_actor_email text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor_email text := pg_catalog.lower(pg_catalog.btrim(p_actor_email));
  v_before jsonb;
  v_after jsonb;
begin
  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_WEEKLY_INVALID_ACTOR';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'voto-claro:comments:weekly-topics',
      0
    )
  );

  select pg_catalog.jsonb_build_object(
    'active_count',
      (select pg_catalog.count(*)
         from public.weekly_topics
        where status = 'active'),
    'voting_count',
      (select pg_catalog.count(*)
         from public.weekly_topics
        where status = 'voting'),
    'archived_count',
      (select pg_catalog.count(*)
         from public.weekly_topics
        where status = 'archived'),
    'queued_count',
      (select pg_catalog.count(*)
         from public.weekly_topics_queue
        where status = 'queued'),
    'activated_queue_count',
      (select pg_catalog.count(*)
         from public.weekly_topics_queue
        where status = 'activated')
  )
  into v_before;

  perform public.advance_weekly_topics_cycle();

  select pg_catalog.jsonb_build_object(
    'active_count',
      (select pg_catalog.count(*)
         from public.weekly_topics
        where status = 'active'),
    'voting_count',
      (select pg_catalog.count(*)
         from public.weekly_topics
        where status = 'voting'),
    'archived_count',
      (select pg_catalog.count(*)
         from public.weekly_topics
        where status = 'archived'),
    'queued_count',
      (select pg_catalog.count(*)
         from public.weekly_topics_queue
        where status = 'queued'),
    'activated_queue_count',
      (select pg_catalog.count(*)
         from public.weekly_topics_queue
        where status = 'activated')
  )
  into v_after;

  insert into public.comments_admin_audit (
    request_id,
    actor_email,
    action,
    entity_type,
    entity_id,
    before_snapshot,
    after_snapshot
  )
  values (
    p_request_id,
    v_actor_email,
    'weekly_cycle.run',
    'weekly_cycle',
    null,
    v_before,
    v_after
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'before', v_before,
    'after', v_after
  );
end;
$function$;

alter function public.admin_run_weekly_topics_cycle(text, uuid)
  owner to postgres;

revoke all privileges
on function public.admin_run_weekly_topics_cycle(text, uuid)
from PUBLIC, anon, authenticated;

grant execute
on function public.admin_run_weekly_topics_cycle(text, uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- Postflight: verify the hardened weekly-topic foundation before commit.
-- ---------------------------------------------------------------------------

do $postflight$
declare
  v_count integer;
  v_signature text;
begin
  if pg_catalog.to_regclass('public.comments_admin_audit') is null then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: comments_admin_audit missing';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_class as c
     where c.oid = pg_catalog.to_regclass('public.comments_admin_audit')
       and c.relrowsecurity
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: audit RLS disabled';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_policy
   where polrelid = pg_catalog.to_regclass('public.comments_admin_audit');

  if v_count <> 0 then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: audit policies unexpected';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = pg_catalog.to_regclass('public.weekly_topics')
       and conname = 'weekly_topics_status_check'
       and contype = 'c'
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: weekly_topics status check missing';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = pg_catalog.to_regclass('public.weekly_topics_queue')
       and conname = 'weekly_topics_queue_status_check'
       and contype = 'c'
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: queue status check missing';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_attribute
     where attrelid = pg_catalog.to_regclass('public.weekly_topics')
       and attname = 'status'
       and attnotnull
       and not attisdropped
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: weekly_topics status nullable';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_index as ix
     where ix.indexrelid =
           pg_catalog.to_regclass('public.weekly_topics_one_active_uniq')
       and ix.indisunique
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: active unique index missing';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_trigger
     where tgrelid = pg_catalog.to_regclass('public.weekly_video_votes')
       and tgname = 'trg_weekly_video_vote_eligibility'
       and not tgisinternal
       and tgenabled <> 'D'
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: vote eligibility trigger missing';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_trigger
     where tgrelid = pg_catalog.to_regclass('public.comments_admin_audit')
       and tgname = 'trg_comments_admin_audit_append_only'
       and not tgisinternal
       and tgenabled <> 'D'
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: audit append-only trigger missing';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_proc as p
   where p.oid = any (
     array[
       pg_catalog.to_regprocedure('public.enforce_weekly_video_vote_eligibility()'),
       pg_catalog.to_regprocedure('public.publish_weekly_winner_for_topic(uuid)'),
       pg_catalog.to_regprocedure('public.activate_next_weekly_topic()'),
       pg_catalog.to_regprocedure('public.advance_weekly_topics_cycle()'),
       pg_catalog.to_regprocedure('public.admin_create_weekly_topic(text,text,text,uuid)'),
       pg_catalog.to_regprocedure('public.admin_update_active_weekly_topic(uuid,text,text,text,uuid)'),
       pg_catalog.to_regprocedure('public.admin_run_weekly_topics_cycle(text,uuid)')
     ]
   )
     and p.prosecdef
     and 'search_path=pg_catalog' = any (
       coalesce(p.proconfig, array[]::text[])
     )
     and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres';

  if v_count <> 7 then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: hardened function configuration mismatch';
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_proc as p
     where p.oid =
           pg_catalog.to_regprocedure('public.enforce_comments_admin_audit_append_only()')
       and not p.prosecdef
       and 'search_path=pg_catalog' = any (
         coalesce(p.proconfig, array[]::text[])
       )
       and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: audit trigger function configuration mismatch';
  end if;

  foreach v_signature in array array[
    'public.publish_weekly_winner_for_topic(uuid)',
    'public.activate_next_weekly_topic()',
    'public.advance_weekly_topics_cycle()',
    'public.admin_create_weekly_topic(text,text,text,uuid)',
    'public.admin_update_active_weekly_topic(uuid,text,text,text,uuid)',
    'public.admin_run_weekly_topics_cycle(text,uuid)'
  ]
  loop
    if pg_catalog.has_function_privilege(
         'anon', v_signature, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'authenticated', v_signature, 'EXECUTE'
       ) then
      raise exception
        'BSEC_WEEKLY_POSTFLIGHT: client execute privilege on %',
        v_signature;
    end if;

    if not pg_catalog.has_function_privilege(
      'service_role', v_signature, 'EXECUTE'
    ) then
      raise exception
        'BSEC_WEEKLY_POSTFLIGHT: service_role execute missing on %',
        v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.enforce_comments_admin_audit_append_only()',
    'public.enforce_weekly_video_vote_eligibility()'
  ]
  loop
    if pg_catalog.has_function_privilege(
         'anon', v_signature, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'authenticated', v_signature, 'EXECUTE'
       )
       or pg_catalog.has_function_privilege(
         'service_role', v_signature, 'EXECUTE'
       ) then
      raise exception
        'BSEC_WEEKLY_POSTFLIGHT: trigger function execute privilege on %',
        v_signature;
    end if;
  end loop;

  if pg_catalog.has_table_privilege(
       'anon', 'public.comments_admin_audit', 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'anon', 'public.comments_admin_audit', 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', 'public.comments_admin_audit', 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'authenticated', 'public.comments_admin_audit', 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role', 'public.comments_admin_audit', 'SELECT'
     )
     or pg_catalog.has_table_privilege(
       'service_role', 'public.comments_admin_audit', 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role', 'public.comments_admin_audit', 'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role', 'public.comments_admin_audit', 'DELETE'
     ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: audit table privilege leak';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role', 'public.weekly_topics', 'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.weekly_topics', 'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.weekly_topics', 'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.weekly_topics', 'DELETE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.weekly_topics_queue', 'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.weekly_topics_queue', 'INSERT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.weekly_topics_queue', 'UPDATE'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', 'public.weekly_topics_queue', 'DELETE'
     ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: compatibility DML changed unexpectedly';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.weekly_topics
   where status = 'active';

  if v_count > 1 then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: multiple active topics';
  end if;

  if exists (
    select 1
      from public.weekly_topics
     where status is null
        or status not in ('active', 'voting', 'archived')
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: invalid weekly_topics status';
  end if;

  if exists (
    select 1
      from public.weekly_topics_queue
     where status is null
        or status not in ('queued', 'activated')
  ) then
    raise exception 'BSEC_WEEKLY_POSTFLIGHT: invalid queue status';
  end if;
end
$postflight$;

commit;

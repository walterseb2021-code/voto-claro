begin;

-- ============================================================================
-- B-SEC ADMIN COMMENTS
-- Harden privileged administrative mutations behind SECURITY DEFINER RPCs.
--
-- PHASE 1 ONLY:
--   - Creates hardened RPCs.
--   - Adds append-only administrative audit entries.
--   - DOES NOT change service_role table privileges yet.
--   - Endpoint migration and ACL reduction happen in later controlled phases.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $preflight$
declare
  v_table text;
  v_function text;
begin
  foreach v_table in array array[
    'weekly_founder_questions',
    'comment_awards',
    'user_comments',
    'weekly_video_entries',
    'comments_admin_audit'
  ]
  loop
    if pg_catalog.to_regclass(
      pg_catalog.format('public.%I', v_table)
    ) is null then
      raise exception using
        errcode = '42P01',
        message = 'BSEC_ADMIN_COMMENTS_TABLE_MISSING:' || v_table;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n
      on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'comments_admin_audit'
      and c.relrowsecurity
      and pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
  ) then
    raise exception
      'BSEC_ADMIN_COMMENTS_AUDIT_TABLE_INVALID';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy p
    where p.polrelid =
      pg_catalog.to_regclass('public.comments_admin_audit')
  ) <> 0 then
    raise exception
      'BSEC_ADMIN_COMMENTS_AUDIT_POLICIES_UNEXPECTED';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid =
      pg_catalog.to_regclass('public.comments_admin_audit')
      and t.tgname =
        'trg_comments_admin_audit_append_only'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  ) then
    raise exception
      'BSEC_ADMIN_COMMENTS_AUDIT_TRIGGER_MISSING';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid =
      pg_catalog.to_regclass('public.comment_awards')
      and t.tgname =
        'trg_vc_comment_award_identity'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  ) then
    raise exception
      'BSEC_ADMIN_COMMENTS_AWARD_IDENTITY_TRIGGER_MISSING';
  end if;

  foreach v_function in array array[
    'public.admin_answer_founder_question(uuid,text,text,boolean,text,uuid)',
    'public.admin_set_founder_question_publish(uuid,boolean,text,uuid)',
    'public.admin_create_comment_award(uuid,integer,integer,text,text,text,text,boolean,boolean,text,uuid)',
    'public.admin_update_comment_award(uuid,text,text,text,text,boolean,boolean,text,uuid)',
    'public.admin_set_comment_content_status(text,uuid,text,text,uuid)'
  ]
  loop
    if pg_catalog.to_regprocedure(v_function) is not null then
      raise exception
        'BSEC_ADMIN_COMMENTS_FUNCTION_ALREADY_EXISTS:%',
        v_function;
    end if;
  end loop;
end
$preflight$;


-- ============================================================================
-- 1. ANSWER FOUNDER QUESTION
-- ============================================================================

create function public.admin_answer_founder_question(
  p_question_id uuid,
  p_founder_answer_text text,
  p_founder_answer_video_url text,
  p_published boolean,
  p_actor_email text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor_email text :=
    pg_catalog.lower(
      pg_catalog.btrim(p_actor_email)
    );

  v_answer_text text :=
    pg_catalog.btrim(
      coalesce(
        p_founder_answer_text,
        ''
      )
    );

  v_video_url text :=
    pg_catalog.btrim(
      coalesce(
        p_founder_answer_video_url,
        ''
      )
    );

  v_before jsonb;
  v_after jsonb;
begin
  if p_question_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_QUESTION_ID';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_ACTOR';
  end if;

  if pg_catalog.length(v_answer_text) > 4000 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_FOUNDER_ANSWER_TOO_LONG';
  end if;

  if pg_catalog.length(v_video_url) > 2048 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_FOUNDER_VIDEO_URL_TOO_LONG';
  end if;

  if v_answer_text = ''
     and v_video_url = '' then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_FOUNDER_ANSWER_REQUIRED';
  end if;

  if v_video_url <> ''
     and v_video_url !~* '^https?://[^[:space:]]+$' then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_FOUNDER_VIDEO_URL';
  end if;

  select pg_catalog.to_jsonb(q)
  into v_before
  from public.weekly_founder_questions q
  where q.id = p_question_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ADMIN_COMMENTS_FOUNDER_QUESTION_NOT_FOUND';
  end if;

  update public.weekly_founder_questions q
  set
    founder_answer_text =
      nullif(v_answer_text, ''),
    founder_answer_video_url =
      nullif(v_video_url, ''),
    founder_answered_at =
      pg_catalog.now(),
    question_status =
      'answered',
    published =
      p_published
  where q.id = p_question_id
  returning pg_catalog.to_jsonb(q)
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
    'founder_question.answer',
    'founder_question',
    p_question_id,
    v_before,
    v_after
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'question', v_after
  );
end;
$function$;

alter function public.admin_answer_founder_question(
  uuid,
  text,
  text,
  boolean,
  text,
  uuid
)
owner to postgres;

revoke all privileges
on function public.admin_answer_founder_question(
  uuid,
  text,
  text,
  boolean,
  text,
  uuid
)
from PUBLIC, anon, authenticated;

grant execute
on function public.admin_answer_founder_question(
  uuid,
  text,
  text,
  boolean,
  text,
  uuid
)
to service_role;


-- ============================================================================
-- 2. PUBLISH / UNPUBLISH FOUNDER QUESTION
-- ============================================================================

create function public.admin_set_founder_question_publish(
  p_question_id uuid,
  p_published boolean,
  p_actor_email text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor_email text :=
    pg_catalog.lower(
      pg_catalog.btrim(p_actor_email)
    );

  v_before jsonb;
  v_after jsonb;
begin
  if p_question_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_QUESTION_ID';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_ACTOR';
  end if;

  select pg_catalog.to_jsonb(q)
  into v_before
  from public.weekly_founder_questions q
  where q.id = p_question_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ADMIN_COMMENTS_FOUNDER_QUESTION_NOT_FOUND';
  end if;

  if p_published is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_PUBLISHED';
  end if;

  if p_published
     and (
       coalesce(
         v_before ->> 'question_status',
         ''
       ) <> 'answered'
       or (
         pg_catalog.btrim(
           coalesce(
             v_before ->> 'founder_answer_text',
             ''
           )
         ) = ''
         and
         pg_catalog.btrim(
           coalesce(
             v_before ->> 'founder_answer_video_url',
             ''
           )
         ) = ''
       )
     ) then
    raise exception using
      errcode = '23514',
      message = 'ADMIN_COMMENTS_CANNOT_PUBLISH_UNANSWERED_QUESTION';
  end if;

  update public.weekly_founder_questions q
  set published = p_published
  where q.id = p_question_id
  returning pg_catalog.to_jsonb(q)
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
    'founder_question.publish',
    'founder_question',
    p_question_id,
    v_before,
    v_after
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'question', v_after
  );
end;
$function$;

alter function public.admin_set_founder_question_publish(
  uuid,
  boolean,
  text,
  uuid
)
owner to postgres;

revoke all privileges
on function public.admin_set_founder_question_publish(
  uuid,
  boolean,
  text,
  uuid
)
from PUBLIC, anon, authenticated;

grant execute
on function public.admin_set_founder_question_publish(
  uuid,
  boolean,
  text,
  uuid
)
to service_role;


-- ============================================================================
-- 3. CREATE COMMENT AWARD
-- Identity remains authoritative from user_comments through
-- trg_vc_comment_award_identity.
-- ============================================================================

create function public.admin_create_comment_award(
  p_user_comment_id uuid,
  p_award_year integer,
  p_award_quarter integer,
  p_award_title text,
  p_award_note text,
  p_contact_status text,
  p_logistics_note text,
  p_includes_companion boolean,
  p_published boolean,
  p_actor_email text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor_email text :=
    pg_catalog.lower(
      pg_catalog.btrim(p_actor_email)
    );

  v_award_title text :=
    pg_catalog.btrim(
      coalesce(
        p_award_title,
        ''
      )
    );

  v_award_note text :=
    pg_catalog.btrim(
      coalesce(
        p_award_note,
        ''
      )
    );

  v_contact_status text :=
    pg_catalog.btrim(
      coalesce(
        p_contact_status,
        ''
      )
    );

  v_logistics_note text :=
    pg_catalog.btrim(
      coalesce(
        p_logistics_note,
        ''
      )
    );

  v_comment_group text;
  v_award_id uuid;
  v_after jsonb;
begin
  if p_user_comment_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_USER_COMMENT_ID';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_ACTOR';
  end if;

  if p_award_quarter not in (1, 2, 3, 4) then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_AWARD_QUARTER';
  end if;

  if v_contact_status not in (
    'pending',
    'contacted',
    'confirmed',
    'completed'
  ) then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_CONTACT_STATUS';
  end if;

  select c.group_code
  into v_comment_group
  from public.user_comments c
  where c.id = p_user_comment_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ADMIN_COMMENTS_COMMENT_NOT_FOUND';
  end if;

  if v_comment_group is null
     or pg_catalog.btrim(v_comment_group) = '' then
    raise exception using
      errcode = '23514',
      message = 'ADMIN_COMMENTS_COMMENT_IDENTITY_INVALID';
  end if;

  insert into public.comment_awards (
    user_comment_id,
    award_year,
    award_quarter,
    award_title,
    award_note,
    contact_status,
    logistics_note,
    includes_companion,
    published,
    published_at
  )
  values (
    p_user_comment_id,
    p_award_year,
    p_award_quarter,
    nullif(v_award_title, ''),
    nullif(v_award_note, ''),
    v_contact_status,
    nullif(v_logistics_note, ''),
    p_includes_companion,
    p_published,
    case
      when p_published then pg_catalog.now()
      else null
    end
  )
  returning
    id,
    pg_catalog.to_jsonb(comment_awards)
  into
    v_award_id,
    v_after;

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
    'comment_award.create',
    'comment_award',
    v_award_id,
    null,
    v_after
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'award', v_after
  );
end;
$function$;

alter function public.admin_create_comment_award(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text,
  uuid
)
owner to postgres;

revoke all privileges
on function public.admin_create_comment_award(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text,
  uuid
)
from PUBLIC, anon, authenticated;

grant execute
on function public.admin_create_comment_award(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text,
  uuid
)
to service_role;


-- ============================================================================
-- 4. UPDATE COMMENT AWARD
-- ============================================================================

create function public.admin_update_comment_award(
  p_award_id uuid,
  p_award_title text,
  p_award_note text,
  p_contact_status text,
  p_logistics_note text,
  p_includes_companion boolean,
  p_published boolean,
  p_actor_email text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_actor_email text :=
    pg_catalog.lower(
      pg_catalog.btrim(p_actor_email)
    );

  v_award_title text :=
    pg_catalog.btrim(
      coalesce(
        p_award_title,
        ''
      )
    );

  v_award_note text :=
    pg_catalog.btrim(
      coalesce(
        p_award_note,
        ''
      )
    );

  v_contact_status text :=
    pg_catalog.btrim(
      coalesce(
        p_contact_status,
        ''
      )
    );

  v_logistics_note text :=
    pg_catalog.btrim(
      coalesce(
        p_logistics_note,
        ''
      )
    );

  v_before jsonb;
  v_after jsonb;
begin
  if p_award_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_AWARD_ID';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_ACTOR';
  end if;

  if v_contact_status not in (
    'pending',
    'contacted',
    'confirmed',
    'completed'
  ) then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_CONTACT_STATUS';
  end if;

  select pg_catalog.to_jsonb(a)
  into v_before
  from public.comment_awards a
  where a.id = p_award_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ADMIN_COMMENTS_AWARD_NOT_FOUND';
  end if;

  update public.comment_awards a
  set
    award_title =
      nullif(v_award_title, ''),
    award_note =
      nullif(v_award_note, ''),
    contact_status =
      v_contact_status,
    logistics_note =
      nullif(v_logistics_note, ''),
    includes_companion =
      p_includes_companion,
    published =
      p_published,
    published_at =
      case
        when p_published then pg_catalog.now()
        else null
      end
  where a.id = p_award_id
  returning pg_catalog.to_jsonb(a)
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
    'comment_award.update',
    'comment_award',
    p_award_id,
    v_before,
    v_after
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'award', v_after
  );
end;
$function$;

alter function public.admin_update_comment_award(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text,
  uuid
)
owner to postgres;

revoke all privileges
on function public.admin_update_comment_award(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text,
  uuid
)
from PUBLIC, anon, authenticated;

grant execute
on function public.admin_update_comment_award(
  uuid,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  text,
  uuid
)
to service_role;


-- ============================================================================
-- 5. MODERATE COMMENT OR WEEKLY VIDEO STATUS
-- ============================================================================

create function public.admin_set_comment_content_status(
  p_target text,
  p_entity_id uuid,
  p_status text,
  p_actor_email text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_target text :=
    pg_catalog.lower(
      pg_catalog.btrim(
        coalesce(
          p_target,
          ''
        )
      )
    );

  v_status text :=
    pg_catalog.lower(
      pg_catalog.btrim(
        coalesce(
          p_status,
          ''
        )
      )
    );

  v_actor_email text :=
    pg_catalog.lower(
      pg_catalog.btrim(p_actor_email)
    );

  v_before jsonb;
  v_after jsonb;
  v_action text;
  v_entity_type text;
begin
  if p_entity_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_ENTITY_ID';
  end if;

  if p_request_id is null then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_REQUEST_ID';
  end if;

  if v_actor_email is null
     or pg_catalog.length(v_actor_email) < 3
     or pg_catalog.length(v_actor_email) > 320 then
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_ACTOR';
  end if;

  if v_target = 'comment' then

    if v_status not in (
      'published',
      'archived',
      'blocked'
    ) then
      raise exception using
        errcode = '22023',
        message = 'ADMIN_COMMENTS_COMMENT_STATUS_NOT_ALLOWED';
    end if;

    select pg_catalog.to_jsonb(c)
    into v_before
    from public.user_comments c
    where c.id = p_entity_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'ADMIN_COMMENTS_COMMENT_NOT_FOUND';
    end if;

    update public.user_comments c
    set status = v_status
    where c.id = p_entity_id
    returning pg_catalog.to_jsonb(c)
    into v_after;

    v_action :=
      'comment.status.update';

    v_entity_type :=
      'user_comment';

  elsif v_target = 'video' then

    if v_status not in (
      'reviewed',
      'archived',
      'blocked'
    ) then
      raise exception using
        errcode = '22023',
        message = 'ADMIN_COMMENTS_VIDEO_STATUS_NOT_ALLOWED';
    end if;

    select pg_catalog.to_jsonb(v)
    into v_before
    from public.weekly_video_entries v
    where v.id = p_entity_id
    for update;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'ADMIN_COMMENTS_VIDEO_NOT_FOUND';
    end if;

    update public.weekly_video_entries v
    set status = v_status
    where v.id = p_entity_id
    returning pg_catalog.to_jsonb(v)
    into v_after;

    v_action :=
      'weekly_video.status.update';

    v_entity_type :=
      'weekly_video_entry';

  else
    raise exception using
      errcode = '22023',
      message = 'ADMIN_COMMENTS_INVALID_TARGET';
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
    v_action,
    v_entity_type,
    p_entity_id,
    v_before,
    v_after
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'target', v_target,
    'entity', v_after
  );
end;
$function$;

alter function public.admin_set_comment_content_status(
  text,
  uuid,
  text,
  text,
  uuid
)
owner to postgres;

revoke all privileges
on function public.admin_set_comment_content_status(
  text,
  uuid,
  text,
  text,
  uuid
)
from PUBLIC, anon, authenticated;

grant execute
on function public.admin_set_comment_content_status(
  text,
  uuid,
  text,
  text,
  uuid
)
to service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $postflight$
declare
  v_signature text;
  v_oid oid;
begin
  foreach v_signature in array array[
    'public.admin_answer_founder_question(uuid,text,text,boolean,text,uuid)',
    'public.admin_set_founder_question_publish(uuid,boolean,text,uuid)',
    'public.admin_create_comment_award(uuid,integer,integer,text,text,text,text,boolean,boolean,text,uuid)',
    'public.admin_update_comment_award(uuid,text,text,text,text,boolean,boolean,text,uuid)',
    'public.admin_set_comment_content_status(text,uuid,text,text,uuid)'
  ]
  loop
    v_oid :=
      pg_catalog.to_regprocedure(v_signature);

    if v_oid is null then
      raise exception
        'BSEC_ADMIN_COMMENTS_FUNCTION_MISSING:%',
        v_signature;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_proc p
      where p.oid = v_oid
        and p.prosecdef
        and pg_catalog.pg_get_userbyid(
          p.proowner
        ) = 'postgres'
        and p.proconfig @>
          array['search_path=pg_catalog']
    ) then
      raise exception
        'BSEC_ADMIN_COMMENTS_FUNCTION_HARDENING_INVALID:%',
        v_signature;
    end if;

    if not pg_catalog.has_function_privilege(
      'service_role',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_ADMIN_COMMENTS_SERVICE_EXECUTE_MISSING:%',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'anon',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_ADMIN_COMMENTS_ANON_EXECUTE_PRESENT:%',
        v_signature;
    end if;

    if pg_catalog.has_function_privilege(
      'authenticated',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_ADMIN_COMMENTS_AUTH_EXECUTE_PRESENT:%',
        v_signature;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_proc p
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          p.proacl,
          pg_catalog.acldefault(
            'f'::"char",
            p.proowner
          )
        )
      ) as acl
      where p.oid = v_oid
        and acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) then
      raise exception
        'BSEC_ADMIN_COMMENTS_PUBLIC_EXECUTE_PRESENT:%',
        v_signature;
    end if;
  end loop;

  -- Phase 1 deliberately leaves direct table privileges untouched.
  -- This protects compatibility until the API endpoint has migrated
  -- and production RPC tests have passed.

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.weekly_founder_questions',
    'UPDATE'
  ) then
    raise exception
      'BSEC_ADMIN_COMMENTS_PHASE1_FOUNDER_UPDATE_CHANGED';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.comment_awards',
    'INSERT'
  )
  or not pg_catalog.has_table_privilege(
    'service_role',
    'public.comment_awards',
    'UPDATE'
  ) then
    raise exception
      'BSEC_ADMIN_COMMENTS_PHASE1_AWARD_PRIVILEGES_CHANGED';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.user_comments',
    'UPDATE'
  ) then
    raise exception
      'BSEC_ADMIN_COMMENTS_PHASE1_COMMENT_UPDATE_CHANGED';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.weekly_video_entries',
    'UPDATE'
  ) then
    raise exception
      'BSEC_ADMIN_COMMENTS_PHASE1_VIDEO_UPDATE_CHANGED';
  end if;
end
$postflight$;

commit;
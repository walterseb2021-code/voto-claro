begin;

-- ============================================================================
-- B-SEC ADMIN COMMENTS
-- Reduce service_role table privileges to the proven runtime minimum.
--
-- Required after endpoint migration:
--   weekly_founder_questions : SELECT + INSERT
--   comment_awards            : SELECT
--   user_comments             : SELECT + INSERT
--   weekly_video_entries      : SELECT + INSERT
--
-- Administrative UPDATE/INSERT operations on comment_awards and administrative
-- status/answer mutations are performed through hardened SECURITY DEFINER RPCs.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $preflight$
declare
  v_table text;
  v_relation text;
  v_signature text;
  v_oid oid;
begin
  foreach v_table in array array[
    'weekly_founder_questions',
    'comment_awards',
    'user_comments',
    'weekly_video_entries'
  ]
  loop
    v_relation :=
      pg_catalog.format('public.%I', v_table);

    if pg_catalog.to_regclass(v_relation) is null then
      raise exception
        'BSEC_ADMIN_ACL_TABLE_MISSING:%',
        v_table;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n
        on n.oid = c.relnamespace
      where c.oid =
        pg_catalog.to_regclass(v_relation)
        and n.nspname = 'public'
        and c.relrowsecurity
        and pg_catalog.pg_get_userbyid(
          c.relowner
        ) = 'postgres'
    ) then
      raise exception
        'BSEC_ADMIN_ACL_TABLE_SECURITY_INVALID:%',
        v_table;
    end if;

    if (
      select pg_catalog.count(*)
      from pg_catalog.pg_policy p
      where p.polrelid =
        pg_catalog.to_regclass(v_relation)
    ) <> 0 then
      raise exception
        'BSEC_ADMIN_ACL_POLICIES_UNEXPECTED:%',
        v_table;
    end if;

    -- All four tables must still be readable by the server.
    if not pg_catalog.has_table_privilege(
      'service_role',
      v_relation,
      'SELECT'
    ) then
      raise exception
        'BSEC_ADMIN_ACL_SELECT_MISSING_BEFORE:%',
        v_table;
    end if;

    -- Phase-1 state must still contain the broad privileges we are reducing.
    if not pg_catalog.has_table_privilege(
      'service_role',
      v_relation,
      'UPDATE'
    )
    or not pg_catalog.has_table_privilege(
      'service_role',
      v_relation,
      'DELETE'
    )
    or not pg_catalog.has_table_privilege(
      'service_role',
      v_relation,
      'TRUNCATE'
    )
    or not pg_catalog.has_table_privilege(
      'service_role',
      v_relation,
      'REFERENCES'
    )
    or not pg_catalog.has_table_privilege(
      'service_role',
      v_relation,
      'TRIGGER'
    ) then
      raise exception
        'BSEC_ADMIN_ACL_EXPECTED_BROAD_PRIVILEGES_MISSING:%',
        v_table;
    end if;

    -- Browser roles must remain unable to access these tables directly.
    if pg_catalog.has_table_privilege(
      'anon',
      v_relation,
      'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'anon',
      v_relation,
      'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'anon',
      v_relation,
      'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'anon',
      v_relation,
      'DELETE'
    )
    or pg_catalog.has_table_privilege(
      'authenticated',
      v_relation,
      'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'authenticated',
      v_relation,
      'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'authenticated',
      v_relation,
      'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'authenticated',
      v_relation,
      'DELETE'
    ) then
      raise exception
        'BSEC_ADMIN_ACL_BROWSER_PRIVILEGE_PRESENT:%',
        v_table;
    end if;
  end loop;

  -- Runtime INSERT is still required by the three participant flows.
  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.weekly_founder_questions',
    'INSERT'
  ) then
    raise exception
      'BSEC_ADMIN_ACL_FOUNDER_INSERT_MISSING_BEFORE';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.user_comments',
    'INSERT'
  ) then
    raise exception
      'BSEC_ADMIN_ACL_COMMENT_INSERT_MISSING_BEFORE';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.weekly_video_entries',
    'INSERT'
  ) then
    raise exception
      'BSEC_ADMIN_ACL_VIDEO_INSERT_MISSING_BEFORE';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.comment_awards',
    'INSERT'
  ) then
    raise exception
      'BSEC_ADMIN_ACL_AWARD_INSERT_MISSING_BEFORE';
  end if;

  -- Hardened RPC dependency check.
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
        'BSEC_ADMIN_ACL_RPC_MISSING:%',
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
        'BSEC_ADMIN_ACL_RPC_HARDENING_INVALID:%',
        v_signature;
    end if;

    if not pg_catalog.has_function_privilege(
      'service_role',
      v_oid,
      'EXECUTE'
    ) then
      raise exception
        'BSEC_ADMIN_ACL_RPC_EXECUTE_MISSING:%',
        v_signature;
    end if;
  end loop;
end
$preflight$;


-- ============================================================================
-- MINIMUM REQUIRED GRANTS
-- Explicitly preserve only the privileges proven necessary by runtime consumers.
-- ============================================================================

grant select, insert
on table public.weekly_founder_questions
to service_role;

grant select
on table public.comment_awards
to service_role;

grant select, insert
on table public.user_comments
to service_role;

grant select, insert
on table public.weekly_video_entries
to service_role;


-- ============================================================================
-- REMOVE EXCESS PRIVILEGES
-- ============================================================================

revoke update, delete, truncate, references, trigger
on table public.weekly_founder_questions
from service_role;

revoke insert, update, delete, truncate, references, trigger
on table public.comment_awards
from service_role;

revoke update, delete, truncate, references, trigger
on table public.user_comments
from service_role;

revoke update, delete, truncate, references, trigger
on table public.weekly_video_entries
from service_role;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $postflight$
declare
  v_table text;
  v_relation text;
  v_privilege text;
begin
  -- SELECT must remain on all four.
  foreach v_table in array array[
    'weekly_founder_questions',
    'comment_awards',
    'user_comments',
    'weekly_video_entries'
  ]
  loop
    v_relation :=
      pg_catalog.format('public.%I', v_table);

    if not pg_catalog.has_table_privilege(
      'service_role',
      v_relation,
      'SELECT'
    ) then
      raise exception
        'BSEC_ADMIN_ACL_SELECT_MISSING_AFTER:%',
        v_table;
    end if;

    -- Browser roles remain fully blocked from direct DML/read.
    foreach v_privilege in array array[
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE'
    ]
    loop
      if pg_catalog.has_table_privilege(
        'anon',
        v_relation,
        v_privilege
      ) then
        raise exception
          'BSEC_ADMIN_ACL_ANON_PRIVILEGE_PRESENT:%:%',
          v_table,
          v_privilege;
      end if;

      if pg_catalog.has_table_privilege(
        'authenticated',
        v_relation,
        v_privilege
      ) then
        raise exception
          'BSEC_ADMIN_ACL_AUTH_PRIVILEGE_PRESENT:%:%',
          v_table,
          v_privilege;
      end if;
    end loop;

    -- None of the four may retain privileged mutation/admin capabilities.
    foreach v_privilege in array array[
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER'
    ]
    loop
      if pg_catalog.has_table_privilege(
        'service_role',
        v_relation,
        v_privilege
      ) then
        raise exception
          'BSEC_ADMIN_ACL_EXCESS_PRIVILEGE_PRESENT:%:%',
          v_table,
          v_privilege;
      end if;
    end loop;
  end loop;

  -- Three participant submission tables retain INSERT.
  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.weekly_founder_questions',
    'INSERT'
  ) then
    raise exception
      'BSEC_ADMIN_ACL_FOUNDER_INSERT_MISSING_AFTER';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.user_comments',
    'INSERT'
  ) then
    raise exception
      'BSEC_ADMIN_ACL_COMMENT_INSERT_MISSING_AFTER';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.weekly_video_entries',
    'INSERT'
  ) then
    raise exception
      'BSEC_ADMIN_ACL_VIDEO_INSERT_MISSING_AFTER';
  end if;

  -- Awards are now SELECT-only for service_role.
  if pg_catalog.has_table_privilege(
    'service_role',
    'public.comment_awards',
    'INSERT'
  ) then
    raise exception
      'BSEC_ADMIN_ACL_AWARD_INSERT_PRESENT_AFTER';
  end if;
end
$postflight$;

commit;
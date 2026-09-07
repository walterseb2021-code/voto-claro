-- POST E4C - Pitch token rotation - Phase 1.
-- Private audit storage for administrative /pitch token mutations.
-- Does not create, rotate, activate or deactivate any token.

begin;

do $preflight$
declare
  v_links oid;
  v_rls boolean;
  v_owner text;
  v_policy_count integer;
begin
  v_links :=
    pg_catalog.to_regclass(
      'public.votoclaro_public_links'
    );

  if v_links is null then
    raise exception
      'POST_E4C_ABORT: votoclaro_public_links missing';
  end if;

  if pg_catalog.to_regclass(
       'public.pitch_access_token_admin_audit'
     ) is not null then
    raise exception
      'POST_E4C_ABORT: pitch_access_token_admin_audit already exists';
  end if;

  if pg_catalog.to_regclass(
       'public.pitch_access_token_admin_audit_link_created_idx'
     ) is not null then
    raise exception
      'POST_E4C_ABORT: audit index already exists';
  end if;

  if pg_catalog.to_regprocedure(
       'public.create_pitch_access_token_admin(text,text,timestamptz,text,text,uuid)'
     ) is not null then
    raise exception
      'POST_E4C_ABORT: create token RPC already exists';
  end if;

  if pg_catalog.to_regprocedure(
       'public.set_pitch_access_token_state_admin(uuid,boolean,timestamptz,text,text,uuid)'
     ) is not null then
    raise exception
      'POST_E4C_ABORT: state token RPC already exists';
  end if;

  select
    c.relrowsecurity,
    pg_catalog.pg_get_userbyid(c.relowner)
  into
    v_rls,
    v_owner
  from pg_catalog.pg_class c
  where c.oid = v_links;

  if v_rls is not true then
    raise exception
      'POST_E4C_ABORT: public links RLS not enabled';
  end if;

  if v_owner is distinct from 'postgres' then
    raise exception
      'POST_E4C_ABORT: unexpected public links owner %',
      coalesce(v_owner, '<null>');
  end if;

  select pg_catalog.count(*)::integer
  into v_policy_count
  from pg_catalog.pg_policy p
  where p.polrelid = v_links;

  if v_policy_count <> 0 then
    raise exception
      'POST_E4C_ABORT: unexpected public links policies %',
      v_policy_count;
  end if;

  if
    pg_catalog.has_table_privilege(
      'anon', v_links, 'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'anon', v_links, 'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'anon', v_links, 'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'anon', v_links, 'DELETE'
    )
  then
    raise exception
      'POST_E4C_ABORT: anon has public links privilege';
  end if;

  if
    pg_catalog.has_table_privilege(
      'authenticated', v_links, 'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', v_links, 'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', v_links, 'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', v_links, 'DELETE'
    )
  then
    raise exception
      'POST_E4C_ABORT: authenticated has public links privilege';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role', v_links, 'SELECT'
     ) then
    raise exception
      'POST_E4C_ABORT: service_role SELECT missing';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role', v_links, 'UPDATE'
     ) then
    raise exception
      'POST_E4C_ABORT: service_role UPDATE unexpectedly missing';
  end if;

  if pg_catalog.has_table_privilege(
       'service_role', v_links, 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role', v_links, 'DELETE'
     ) then
    raise exception
      'POST_E4C_ABORT: unexpected service_role INSERT/DELETE';
  end if;
end
$preflight$;


do $install$
begin
  execute $ddl$
    create table public.pitch_access_token_admin_audit (
      id uuid primary key
        default pg_catalog.gen_random_uuid(),

      request_id uuid not null unique,

      action text not null
        check (
          action in ('create', 'state')
        ),

      link_id uuid not null,

      group_code text not null
        check (
          group_code in (
            'GRUPOA',
            'GRUPOB',
            'GRUPOC',
            'GRUPOD',
            'GRUPOE'
          )
        ),

      actor_email text not null
        check (
          pg_catalog.char_length(actor_email)
            between 3 and 320
        )
        check (
          actor_email =
            pg_catalog.lower(
              pg_catalog.btrim(actor_email)
            )
        ),

      old_state jsonb null
        check (
          old_state is null
          or pg_catalog.jsonb_typeof(old_state) = 'object'
        ),

      new_state jsonb not null
        check (
          pg_catalog.jsonb_typeof(new_state) = 'object'
        ),

      created_at timestamptz not null
        default pg_catalog.clock_timestamp()
    )
  $ddl$;

  execute $ddl$
    create index
      pitch_access_token_admin_audit_link_created_idx
    on public.pitch_access_token_admin_audit(
      link_id,
      created_at desc
    )
  $ddl$;

  execute $ddl$
    alter table public.pitch_access_token_admin_audit
      owner to postgres
  $ddl$;

  execute $ddl$
    alter table public.pitch_access_token_admin_audit
      enable row level security
  $ddl$;

  execute $ddl$
    revoke all privileges
      on table public.pitch_access_token_admin_audit
      from public
  $ddl$;

  execute $ddl$
    revoke all privileges
      on table public.pitch_access_token_admin_audit
      from anon
  $ddl$;

  execute $ddl$
    revoke all privileges
      on table public.pitch_access_token_admin_audit
      from authenticated
  $ddl$;

  execute $ddl$
    revoke all privileges
      on table public.pitch_access_token_admin_audit
      from service_role
  $ddl$;
end
$install$;


do $postflight$
declare
  v_audit oid;
  v_links oid;
  v_index oid;
  v_rls boolean;
  v_owner text;
  v_policy_count integer;
begin
  v_audit :=
    pg_catalog.to_regclass(
      'public.pitch_access_token_admin_audit'
    );

  v_links :=
    pg_catalog.to_regclass(
      'public.votoclaro_public_links'
    );

  v_index :=
    pg_catalog.to_regclass(
      'public.pitch_access_token_admin_audit_link_created_idx'
    );

  if v_audit is null then
    raise exception
      'POST_E4C_POSTFAIL: audit table missing';
  end if;

  if v_index is null then
    raise exception
      'POST_E4C_POSTFAIL: audit index missing';
  end if;

  select
    c.relrowsecurity,
    pg_catalog.pg_get_userbyid(c.relowner)
  into
    v_rls,
    v_owner
  from pg_catalog.pg_class c
  where c.oid = v_audit;

  if v_rls is not true then
    raise exception
      'POST_E4C_POSTFAIL: audit RLS not enabled';
  end if;

  if v_owner is distinct from 'postgres' then
    raise exception
      'POST_E4C_POSTFAIL: unexpected audit owner %',
      coalesce(v_owner, '<null>');
  end if;

  select pg_catalog.count(*)::integer
  into v_policy_count
  from pg_catalog.pg_policy p
  where p.polrelid = v_audit;

  if v_policy_count <> 0 then
    raise exception
      'POST_E4C_POSTFAIL: unexpected audit policies %',
      v_policy_count;
  end if;

  if
    pg_catalog.has_table_privilege(
      'anon', v_audit, 'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'anon', v_audit, 'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'anon', v_audit, 'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'anon', v_audit, 'DELETE'
    )
  then
    raise exception
      'POST_E4C_POSTFAIL: anon audit privilege';
  end if;

  if
    pg_catalog.has_table_privilege(
      'authenticated', v_audit, 'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', v_audit, 'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', v_audit, 'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'authenticated', v_audit, 'DELETE'
    )
  then
    raise exception
      'POST_E4C_POSTFAIL: authenticated audit privilege';
  end if;

  if
    pg_catalog.has_table_privilege(
      'service_role', v_audit, 'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'service_role', v_audit, 'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'service_role', v_audit, 'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'service_role', v_audit, 'DELETE'
    )
  then
    raise exception
      'POST_E4C_POSTFAIL: service_role audit privilege';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role', v_links, 'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role', v_links, 'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role', v_links, 'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role', v_links, 'DELETE'
     ) then
    raise exception
      'POST_E4C_POSTFAIL: public links ACL changed unexpectedly';
  end if;

  if pg_catalog.to_regprocedure(
       'public.create_pitch_access_token_admin(text,text,timestamptz,text,text,uuid)'
     ) is not null
     or pg_catalog.to_regprocedure(
       'public.set_pitch_access_token_state_admin(uuid,boolean,timestamptz,text,text,uuid)'
     ) is not null then
    raise exception
      'POST_E4C_POSTFAIL: token RPC appeared unexpectedly';
  end if;
end
$postflight$;

commit;
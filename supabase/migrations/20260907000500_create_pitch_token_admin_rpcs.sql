-- POST E4C - Pitch token rotation - Phase 2.
-- Narrow SECURITY DEFINER RPCs for /pitch token creation and state changes.
-- Does not grant direct INSERT to service_role.
-- Direct service_role UPDATE is intentionally preserved until the legacy API
-- has been migrated and verified in production.

begin;

do $preflight$
declare
  v_links oid;
  v_audit oid;
  v_policy_count integer;
begin
  v_links :=
    pg_catalog.to_regclass(
      'public.votoclaro_public_links'
    );

  v_audit :=
    pg_catalog.to_regclass(
      'public.pitch_access_token_admin_audit'
    );

  if v_links is null then
    raise exception
      'POST_E4C_RPC_ABORT: public links missing';
  end if;

  if v_audit is null then
    raise exception
      'POST_E4C_RPC_ABORT: audit table missing';
  end if;

  if pg_catalog.to_regprocedure(
       'public.create_pitch_access_token_admin(text,text,timestamptz,text,text,uuid)'
     ) is not null then
    raise exception
      'POST_E4C_RPC_ABORT: create RPC already exists';
  end if;

  if pg_catalog.to_regprocedure(
       'public.set_pitch_access_token_state_admin(uuid,boolean,timestamptz,text,text,uuid)'
     ) is not null then
    raise exception
      'POST_E4C_RPC_ABORT: state RPC already exists';
  end if;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_links
  ) then
    raise exception
      'POST_E4C_RPC_ABORT: public links RLS disabled';
  end if;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_audit
  ) then
    raise exception
      'POST_E4C_RPC_ABORT: audit RLS disabled';
  end if;

  if (
    select pg_catalog.pg_get_userbyid(c.relowner)
    from pg_catalog.pg_class c
    where c.oid = v_links
  ) is distinct from 'postgres' then
    raise exception
      'POST_E4C_RPC_ABORT: unexpected links owner';
  end if;

  if (
    select pg_catalog.pg_get_userbyid(c.relowner)
    from pg_catalog.pg_class c
    where c.oid = v_audit
  ) is distinct from 'postgres' then
    raise exception
      'POST_E4C_RPC_ABORT: unexpected audit owner';
  end if;

  select pg_catalog.count(*)::integer
  into v_policy_count
  from pg_catalog.pg_policy p
  where p.polrelid in (v_links, v_audit);

  if v_policy_count <> 0 then
    raise exception
      'POST_E4C_RPC_ABORT: unexpected policies %',
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
    or pg_catalog.has_table_privilege(
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
      'POST_E4C_RPC_ABORT: client privilege on public links';
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
      'POST_E4C_RPC_ABORT: unexpected service_role links ACL';
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
    or pg_catalog.has_table_privilege(
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
    or pg_catalog.has_table_privilege(
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
      'POST_E4C_RPC_ABORT: audit table privilege detected';
  end if;

  if exists (
    select 1
    from public.votoclaro_public_links l
    where l.route = '/pitch'
      and pg_catalog.split_part(l.token, '-', 1)
          not in (
            'GRUPOA',
            'GRUPOB',
            'GRUPOC',
            'GRUPOD',
            'GRUPOE'
          )
  ) then
    raise exception
      'POST_E4C_RPC_ABORT: unexpected pitch group exists';
  end if;
end
$preflight$;


do $install$
begin
  execute $ddl$
    create function public.create_pitch_access_token_admin(
      p_group_code text,
      p_token text,
      p_expires_at timestamptz,
      p_note text,
      p_actor_email text,
      p_request_id uuid
    )
    returns table(
      result_link_id uuid,
      result_group_code text,
      result_is_active boolean,
      result_expires_at timestamptz,
      result_created_at timestamptz
    )
    language plpgsql
    security definer
    set search_path = pg_catalog
    as $body$
    declare
      v_group text;
      v_token text;
      v_note text;
      v_actor text;
      v_link_id uuid;
      v_created_at timestamptz;
      v_active_count integer;
    begin
      if p_group_code is null then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      v_group :=
        pg_catalog.upper(
          pg_catalog.btrim(p_group_code)
        );

      if v_group not in (
        'GRUPOA',
        'GRUPOB',
        'GRUPOC',
        'GRUPOD',
        'GRUPOE'
      )
      or p_group_code <> v_group then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      if p_token is null then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      v_token := pg_catalog.btrim(p_token);

      if v_token <> p_token
         or v_token !~
           ('^' || v_group || '-[A-Za-z0-9_-]{43}$')
      then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      if p_actor_email is null then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      v_actor :=
        pg_catalog.lower(
          pg_catalog.btrim(p_actor_email)
        );

      if v_actor <> p_actor_email
         or pg_catalog.char_length(v_actor)
              not between 3 and 320
         or pg_catalog.strpos(v_actor, '@') <= 1
      then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      if p_request_id is null then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      if p_note is null then
        v_note := null;
      else
        v_note :=
          nullif(
            pg_catalog.btrim(p_note),
            ''
          );

        if v_note is not null
           and pg_catalog.char_length(v_note) > 500
        then
          raise exception using
            errcode = 'P0001',
            message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
        end if;
      end if;

      if p_expires_at is not null
         and p_expires_at <= pg_catalog.clock_timestamp()
      then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      lock table public.votoclaro_public_links
        in share row exclusive mode;

      select pg_catalog.count(*)::integer
      into v_active_count
      from public.votoclaro_public_links l
      where l.route = '/pitch'
        and l.is_active is true
        and pg_catalog.split_part(
              l.token,
              '-',
              1
            ) = v_group;

      if v_active_count >= 2 then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_ACTIVE_LIMIT';
      end if;

      v_link_id := pg_catalog.gen_random_uuid();
      v_created_at := pg_catalog.clock_timestamp();

      insert into public.votoclaro_public_links(
        id,
        token,
        route,
        is_active,
        expires_at,
        note,
        created_at
      )
      values (
        v_link_id,
        v_token,
        '/pitch',
        true,
        p_expires_at,
        v_note,
        v_created_at
      );

      insert into public.pitch_access_token_admin_audit(
        request_id,
        action,
        link_id,
        group_code,
        actor_email,
        old_state,
        new_state
      )
      values (
        p_request_id,
        'create',
        v_link_id,
        v_group,
        v_actor,
        null,
        pg_catalog.jsonb_build_object(
          'route', '/pitch',
          'is_active', true,
          'expires_at', p_expires_at,
          'note', v_note
        )
      );

      return query
      select
        v_link_id,
        v_group,
        true,
        p_expires_at,
        v_created_at;

    exception
      when unique_violation then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_CREATE_CONFLICT';
    end
    $body$
  $ddl$;


  execute $ddl$
    create function public.set_pitch_access_token_state_admin(
      p_link_id uuid,
      p_is_active boolean,
      p_expires_at timestamptz,
      p_note text,
      p_actor_email text,
      p_request_id uuid
    )
    returns table(
      result_link_id uuid,
      result_group_code text,
      result_is_active boolean,
      result_expires_at timestamptz
    )
    language plpgsql
    security definer
    set search_path = pg_catalog
    as $body$
    declare
      v_token text;
      v_group text;
      v_old_active boolean;
      v_old_expires_at timestamptz;
      v_old_note text;
      v_note text;
      v_actor text;
      v_active_count integer;
    begin
      if p_link_id is null
         or p_is_active is null
         or p_actor_email is null
         or p_request_id is null
      then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      v_actor :=
        pg_catalog.lower(
          pg_catalog.btrim(p_actor_email)
        );

      if v_actor <> p_actor_email
         or pg_catalog.char_length(v_actor)
              not between 3 and 320
         or pg_catalog.strpos(v_actor, '@') <= 1
      then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
      end if;

      if p_note is null then
        v_note := null;
      else
        v_note :=
          nullif(
            pg_catalog.btrim(p_note),
            ''
          );

        if v_note is not null
           and pg_catalog.char_length(v_note) > 500
        then
          raise exception using
            errcode = 'P0001',
            message = 'PITCH_TOKEN_ADMIN_INVALID_INPUT';
        end if;
      end if;

      if p_is_active is true
         and p_expires_at is not null
         and p_expires_at <= pg_catalog.clock_timestamp()
      then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_STATE_INVALID';
      end if;

            lock table public.votoclaro_public_links
        in share row exclusive mode;

      select
        l.token,
        l.is_active,
        l.expires_at,
        l.note
      into
        v_token,
        v_old_active,
        v_old_expires_at,
        v_old_note
      from public.votoclaro_public_links l
      where l.id = p_link_id
        and l.route = '/pitch'
      for update;

      if not found then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_NOT_FOUND';
      end if;

      v_group :=
        pg_catalog.split_part(
          v_token,
          '-',
          1
        );

      if v_group not in (
        'GRUPOA',
        'GRUPOB',
        'GRUPOC',
        'GRUPOD',
        'GRUPOE'
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_STATE_INVALID';
      end if;
            if p_is_active is true then
        select pg_catalog.count(*)::integer
        into v_active_count
        from public.votoclaro_public_links l
        where l.route = '/pitch'
          and l.id <> p_link_id
          and l.is_active is true
          and pg_catalog.split_part(
                l.token,
                '-',
                1
              ) = v_group;

        if v_active_count >= 2 then
          raise exception using
            errcode = 'P0001',
            message = 'PITCH_TOKEN_ADMIN_ACTIVE_LIMIT';
        end if;
      end if;

      update public.votoclaro_public_links
      set
        is_active = p_is_active,
        expires_at = p_expires_at,
        note = v_note
      where id = p_link_id;

      insert into public.pitch_access_token_admin_audit(
        request_id,
        action,
        link_id,
        group_code,
        actor_email,
        old_state,
        new_state
      )
      values (
        p_request_id,
        'state',
        p_link_id,
        v_group,
        v_actor,
        pg_catalog.jsonb_build_object(
          'is_active', v_old_active,
          'expires_at', v_old_expires_at,
          'note', v_old_note
        ),
        pg_catalog.jsonb_build_object(
          'is_active', p_is_active,
          'expires_at', p_expires_at,
          'note', v_note
        )
      );

      return query
      select
        p_link_id,
        v_group,
        p_is_active,
        p_expires_at;

    exception
      when unique_violation then
        raise exception using
          errcode = 'P0001',
          message = 'PITCH_TOKEN_ADMIN_REQUEST_CONFLICT';
    end
    $body$
  $ddl$;


  execute $ddl$
    alter function public.create_pitch_access_token_admin(
      text,
      text,
      timestamptz,
      text,
      text,
      uuid
    ) owner to postgres
  $ddl$;

  execute $ddl$
    alter function public.set_pitch_access_token_state_admin(
      uuid,
      boolean,
      timestamptz,
      text,
      text,
      uuid
    ) owner to postgres
  $ddl$;


  execute $ddl$
    revoke all
      on function public.create_pitch_access_token_admin(
        text,
        text,
        timestamptz,
        text,
        text,
        uuid
      )
      from public, anon, authenticated, service_role
  $ddl$;

  execute $ddl$
    grant execute
      on function public.create_pitch_access_token_admin(
        text,
        text,
        timestamptz,
        text,
        text,
        uuid
      )
      to service_role
  $ddl$;


  execute $ddl$
    revoke all
      on function public.set_pitch_access_token_state_admin(
        uuid,
        boolean,
        timestamptz,
        text,
        text,
        uuid
      )
      from public, anon, authenticated, service_role
  $ddl$;

  execute $ddl$
    grant execute
      on function public.set_pitch_access_token_state_admin(
        uuid,
        boolean,
        timestamptz,
        text,
        text,
        uuid
      )
      to service_role
  $ddl$;
end
$install$;


do $postflight$
declare
  v_create oid;
  v_state oid;
  v_links oid;
  v_audit oid;
  v_bad_public_execute integer;
begin
  v_create :=
    pg_catalog.to_regprocedure(
      'public.create_pitch_access_token_admin(text,text,timestamptz,text,text,uuid)'
    );

  v_state :=
    pg_catalog.to_regprocedure(
      'public.set_pitch_access_token_state_admin(uuid,boolean,timestamptz,text,text,uuid)'
    );

  v_links :=
    pg_catalog.to_regclass(
      'public.votoclaro_public_links'
    );

  v_audit :=
    pg_catalog.to_regclass(
      'public.pitch_access_token_admin_audit'
    );

  if v_create is null or v_state is null then
    raise exception
      'POST_E4C_RPC_POSTFAIL: RPC missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid in (v_create, v_state)
      and (
        p.prosecdef is not true
        or pg_catalog.pg_get_userbyid(p.proowner)
             is distinct from 'postgres'
        or not (
          coalesce(p.proconfig, array[]::text[])
          @> array['search_path=pg_catalog']::text[]
        )
      )
  ) then
    raise exception
      'POST_E4C_RPC_POSTFAIL: RPC metadata invalid';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       v_create,
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       v_state,
       'EXECUTE'
     ) then
    raise exception
      'POST_E4C_RPC_POSTFAIL: service execute missing';
  end if;

  if
    pg_catalog.has_function_privilege(
      'anon',
      v_create,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      v_state,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      v_create,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      v_state,
      'EXECUTE'
    )
  then
    raise exception
      'POST_E4C_RPC_POSTFAIL: client execute detected';
  end if;

  select pg_catalog.count(*)::integer
  into v_bad_public_execute
  from pg_catalog.pg_proc p
  cross join lateral pg_catalog.aclexplode(
    coalesce(
      p.proacl,
      pg_catalog.acldefault(
        'f',
        p.proowner
      )
    )
  ) a
  where p.oid in (v_create, v_state)
    and a.grantee = 0
    and a.privilege_type = 'EXECUTE';

  if v_bad_public_execute <> 0 then
    raise exception
      'POST_E4C_RPC_POSTFAIL: PUBLIC execute detected';
  end if;

  if not pg_catalog.has_table_privilege(
       'service_role',
       v_links,
       'SELECT'
     )
     or not pg_catalog.has_table_privilege(
       'service_role',
       v_links,
       'UPDATE'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       v_links,
       'INSERT'
     )
     or pg_catalog.has_table_privilege(
       'service_role',
       v_links,
       'DELETE'
     ) then
    raise exception
      'POST_E4C_RPC_POSTFAIL: links ACL changed';
  end if;

  if
    pg_catalog.has_table_privilege(
      'service_role',
      v_audit,
      'SELECT'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      v_audit,
      'INSERT'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      v_audit,
      'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      v_audit,
      'DELETE'
    )
  then
    raise exception
      'POST_E4C_RPC_POSTFAIL: audit ACL changed';
  end if;

  if (
    select pg_catalog.count(*)::integer
    from public.pitch_access_token_admin_audit
  ) <> 0 then
    raise exception
      'POST_E4C_RPC_POSTFAIL: audit rows appeared unexpectedly';
  end if;
end
$postflight$;

commit;
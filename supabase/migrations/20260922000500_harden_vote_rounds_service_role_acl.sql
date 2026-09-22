begin;

do $guard$
declare
    v_table_oid oid;
    v_row_count bigint;
    v_policy_count integer;
    v_publication_count integer;
    v_fn oid;
begin
    v_table_oid :=
        pg_catalog.to_regclass('public.vote_rounds');

    if v_table_oid is null then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: tabla no existe';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        where c.oid = v_table_oid
          and pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: owner/RLS inesperado';
    end if;

    select count(*)
    into v_policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'vote_rounds';

    if v_policy_count <> 0 then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: policies inesperadas';
    end if;

    select count(*)
    into v_publication_count
    from pg_catalog.pg_publication_tables
    where schemaname = 'public'
      and tablename = 'vote_rounds';

    if v_publication_count <> 0 then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: publication inesperada';
    end if;

    select count(*)
    into v_row_count
    from public.vote_rounds;

    if v_row_count <> 5 then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: row_count cambio desde diagnostico';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'SELECT'
    )
    or not pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'INSERT'
    )
    or not pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'UPDATE'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: ACL inicial inesperado';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'DELETE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'TRUNCATE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'REFERENCES'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'TRIGGER'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: privilegio excesivo inesperado';
    end if;

    if pg_catalog.has_table_privilege(
        'anon',
        'public.vote_rounds',
        'SELECT,INSERT,UPDATE,DELETE'
    )
    or pg_catalog.has_table_privilege(
        'authenticated',
        'public.vote_rounds',
        'SELECT,INSERT,UPDATE,DELETE'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: cliente conserva CRUD';
    end if;

    -- create_vote_round_draft
    v_fn := pg_catalog.to_regprocedure(
        'public.create_vote_round_draft(text,text,text,timestamp with time zone)'
    );

    if v_fn is null or not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and coalesce(p.proconfig, array[]::text[])
              @> array['search_path=pg_catalog']::text[]
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: create_vote_round_draft insegura';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role', v_fn, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'anon', v_fn, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'authenticated', v_fn, 'EXECUTE'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: ACL create_vote_round_draft inesperado';
    end if;

    -- create_vote_round_draft_with_parties
    v_fn := pg_catalog.to_regprocedure(
        'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)'
    );

    if v_fn is null or not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and coalesce(p.proconfig, array[]::text[])
              @> array['search_path=pg_catalog']::text[]
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: create_with_parties insegura';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role', v_fn, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'anon', v_fn, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'authenticated', v_fn, 'EXECUTE'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: ACL create_with_parties inesperado';
    end if;

    -- activate_vote_round_draft
    v_fn := pg_catalog.to_regprocedure(
        'public.activate_vote_round_draft(uuid)'
    );

    if v_fn is null or not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and coalesce(p.proconfig, array[]::text[])
              @> array['search_path=pg_catalog']::text[]
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: activate_vote_round_draft insegura';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role', v_fn, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'anon', v_fn, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'authenticated', v_fn, 'EXECUTE'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: ACL activate inesperado';
    end if;

    -- close_active_vote_round
    v_fn := pg_catalog.to_regprocedure(
        'public.close_active_vote_round(uuid)'
    );

    if v_fn is null or not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and coalesce(p.proconfig, array[]::text[])
              @> array['search_path=pg_catalog']::text[]
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: close_active_vote_round insegura';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role', v_fn, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'anon', v_fn, 'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'authenticated', v_fn, 'EXECUTE'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_ABORT: ACL close inesperado';
    end if;
end
$guard$;

revoke insert, update
on table public.vote_rounds
from service_role;

do $verify$
declare
    v_row_count bigint;
begin
    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'SELECT'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_VERIFY: service_role perdio SELECT';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'INSERT'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'UPDATE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'DELETE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'TRUNCATE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'REFERENCES'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'TRIGGER'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.vote_rounds',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_VERIFY: privilegio excesivo';
    end if;

    if pg_catalog.has_table_privilege(
        'anon',
        'public.vote_rounds',
        'SELECT,INSERT,UPDATE,DELETE'
    )
    or pg_catalog.has_table_privilege(
        'authenticated',
        'public.vote_rounds',
        'SELECT,INSERT,UPDATE,DELETE'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_VERIFY: cliente conserva CRUD';
    end if;

    select count(*)
    into v_row_count
    from public.vote_rounds;

    if v_row_count <> 5 then
        raise exception
            'BSEC_VOTE_ROUNDS_VERIFY: row_count cambio';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        'public.create_vote_round_draft(text,text,text,timestamp with time zone)',
        'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
        'service_role',
        'public.create_vote_round_draft_with_parties(text,text,text,timestamp with time zone,uuid)',
        'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
        'service_role',
        'public.activate_vote_round_draft(uuid)',
        'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
        'service_role',
        'public.close_active_vote_round(uuid)',
        'EXECUTE'
    ) then
        raise exception
            'BSEC_VOTE_ROUNDS_VERIFY: RPC EXECUTE se rompio';
    end if;
end
$verify$;

commit;
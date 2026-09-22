begin;

do $guard$
declare
    v_table_oid oid;
    v_policy_count integer;
    v_publication_count integer;
    v_row_count bigint;
    v_fn oid;
begin
    v_table_oid :=
        pg_catalog.to_regclass(
            'public.reto_camino_qualifiers'
        );

    if v_table_oid is null then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: tabla no existe';
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
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: owner/RLS inesperado';
    end if;

    select count(*)
    into v_policy_count
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'reto_camino_qualifiers';

    if v_policy_count <> 0 then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: policies inesperadas';
    end if;

    select count(*)
    into v_publication_count
    from pg_catalog.pg_publication_tables
    where schemaname = 'public'
      and tablename = 'reto_camino_qualifiers';

    if v_publication_count <> 0 then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: publication inesperada';
    end if;

    select count(*)
    into v_row_count
    from public.reto_camino_qualifiers;

    if v_row_count <> 0 then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: row_count cambio desde diagnostico';
    end if;

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'SELECT'
    )
    or not pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'INSERT'
    )
    or not pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'UPDATE'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: ACL inicial inesperado';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'DELETE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'TRUNCATE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'REFERENCES'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'TRIGGER'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: privilegio excesivo inesperado';
    end if;

    if pg_catalog.has_table_privilege(
        'anon',
        'public.reto_camino_qualifiers',
        'SELECT,INSERT,UPDATE,DELETE'
    )
    or pg_catalog.has_table_privilege(
        'authenticated',
        'public.reto_camino_qualifiers',
        'SELECT,INSERT,UPDATE,DELETE'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: cliente conserva CRUD';
    end if;

    -- Finalizador principal.
    v_fn := pg_catalog.to_regprocedure(
        'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
    );

    if v_fn is null then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: falta finalizador principal';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and coalesce(p.proconfig, array[]::text[])
              @> array['search_path=pg_catalog']::text[]
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: atributos finalizador inesperados';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        v_fn,
        'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'anon',
        v_fn,
        'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'authenticated',
        v_fn,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: ACL finalizador inesperado';
    end if;

    -- Recovery v1.
    v_fn := pg_catalog.to_regprocedure(
        'public.recover_reto_prize_answer_replay(uuid,uuid,text,text,integer,uuid,boolean)'
    );

    if v_fn is null then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: falta recovery v1';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and coalesce(p.proconfig, array[]::text[])
              @> array['search_path=pg_catalog']::text[]
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: atributos recovery v1 inesperados';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        v_fn,
        'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'anon',
        v_fn,
        'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'authenticated',
        v_fn,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: ACL recovery v1 inesperado';
    end if;

    -- Recovery v2.
    v_fn := pg_catalog.to_regprocedure(
        'public.recover_reto_prize_answer_replay_v2(uuid,uuid,text,text,integer,uuid,boolean)'
    );

    if v_fn is null then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: falta recovery v2';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_proc p
        where p.oid = v_fn
          and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
          and p.prosecdef = true
          and coalesce(p.proconfig, array[]::text[])
              @> array['search_path=pg_catalog']::text[]
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: atributos recovery v2 inesperados';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        v_fn,
        'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'anon',
        v_fn,
        'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'authenticated',
        v_fn,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_ABORT: ACL recovery v2 inesperado';
    end if;
end
$guard$;

revoke insert, update
on table public.reto_camino_qualifiers
from service_role;

do $verify$
declare
    v_table_oid oid;
    v_row_count bigint;
begin
    v_table_oid :=
        pg_catalog.to_regclass(
            'public.reto_camino_qualifiers'
        );

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'SELECT'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_VERIFY: service_role perdio SELECT';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'INSERT'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'UPDATE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'DELETE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'TRUNCATE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'REFERENCES'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'TRIGGER'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.reto_camino_qualifiers',
        'MAINTAIN'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_VERIFY: privilegio excesivo';
    end if;

    if pg_catalog.has_table_privilege(
        'anon',
        'public.reto_camino_qualifiers',
        'SELECT,INSERT,UPDATE,DELETE'
    )
    or pg_catalog.has_table_privilege(
        'authenticated',
        'public.reto_camino_qualifiers',
        'SELECT,INSERT,UPDATE,DELETE'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_VERIFY: cliente conserva CRUD';
    end if;

    if not exists (
        select 1
        from pg_catalog.pg_class c
        where c.oid = v_table_oid
          and c.relrowsecurity = true
          and c.relforcerowsecurity = false
          and pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_VERIFY: owner/RLS cambio';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_policies
        where schemaname = 'public'
          and tablename = 'reto_camino_qualifiers'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_VERIFY: aparecio policy';
    end if;

    if exists (
        select 1
        from pg_catalog.pg_publication_tables
        where schemaname = 'public'
          and tablename = 'reto_camino_qualifiers'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_VERIFY: aparecio publication';
    end if;

    select count(*)
    into v_row_count
    from public.reto_camino_qualifiers;

    if v_row_count <> 0 then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_VERIFY: row_count cambio';
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
        'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
        'service_role',
        'public.recover_reto_prize_answer_replay(uuid,uuid,text,text,integer,uuid,boolean)',
        'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
        'service_role',
        'public.recover_reto_prize_answer_replay_v2(uuid,uuid,text,text,integer,uuid,boolean)',
        'EXECUTE'
    ) then
        raise exception
            'BSEC_RETO_CAMINO_QUALIFIERS_VERIFY: RPC EXECUTE se rompio';
    end if;
end
$verify$;

commit;
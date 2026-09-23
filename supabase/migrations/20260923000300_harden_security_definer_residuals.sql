begin;

do $guard$
declare
    r record;
    v_oid oid;
    v_owner text;
    v_security_definer boolean;
    v_config text[];
    v_anon boolean;
    v_authenticated boolean;
    v_service_role boolean;
    v_public_execute boolean;
begin
    for r in
        select *
        from (
            values
                (
                    'public.create_project_forum_post_secure(uuid,uuid,text)'::text,
                    'search_path=pg_catalog, public'::text,
                    false,
                    false,
                    true
                ),
                (
                    'public.finalize_project_submission_secure(uuid,uuid,text,text,text,text,text,text,numeric,text,text,boolean)'::text,
                    'search_path=pg_catalog, public'::text,
                    false,
                    false,
                    true
                ),
                (
                    'public.register_project_participant_secure(text,text,text,text,text,text,text,text,boolean,text,text,text,timestamp with time zone)'::text,
                    'search_path=pg_catalog, public'::text,
                    false,
                    false,
                    true
                ),
                (
                    'public.support_project_secure(uuid,uuid)'::text,
                    'search_path=pg_catalog, public'::text,
                    false,
                    false,
                    true
                ),
                (
                    'public.vc_list_columns(text)'::text,
                    null::text,
                    true,
                    true,
                    true
                )
        ) as x(
            signature,
            expected_config,
            expected_anon,
            expected_authenticated,
            expected_service_role
        )
    loop
        v_oid := pg_catalog.to_regprocedure(r.signature);

        if v_oid is null then
            raise exception
                'BSEC_SECDEF_ABORT: function missing: %',
                r.signature;
        end if;

        select
            pg_catalog.pg_get_userbyid(p.proowner),
            p.prosecdef,
            p.proconfig,
            pg_catalog.has_function_privilege(
                'anon',
                p.oid,
                'EXECUTE'
            ),
            pg_catalog.has_function_privilege(
                'authenticated',
                p.oid,
                'EXECUTE'
            ),
            pg_catalog.has_function_privilege(
                'service_role',
                p.oid,
                'EXECUTE'
            ),
            exists (
                select 1
                from pg_catalog.aclexplode(
                    coalesce(
                        p.proacl,
                        pg_catalog.acldefault(
                            'f',
                            p.proowner
                        )
                    )
                ) a
                where a.grantee = 0
                  and a.privilege_type = 'EXECUTE'
            )
        into
            v_owner,
            v_security_definer,
            v_config,
            v_anon,
            v_authenticated,
            v_service_role,
            v_public_execute
        from pg_catalog.pg_proc p
        where p.oid = v_oid;

        if v_owner <> 'postgres' then
            raise exception
                'BSEC_SECDEF_ABORT: owner drift on %: %',
                r.signature,
                v_owner;
        end if;

        if v_security_definer is distinct from true then
            raise exception
                'BSEC_SECDEF_ABORT: SECURITY DEFINER drift on %',
                r.signature;
        end if;

        if r.expected_config is null then
            if v_config is not null then
                raise exception
                    'BSEC_SECDEF_ABORT: unexpected config on %: %',
                    r.signature,
                    v_config;
            end if;
        else
            if v_config is distinct from
               array[r.expected_config]::text[] then
                raise exception
                    'BSEC_SECDEF_ABORT: unexpected search_path on %: %',
                    r.signature,
                    v_config;
            end if;
        end if;

        if v_anon is distinct from r.expected_anon then
            raise exception
                'BSEC_SECDEF_ABORT: anon EXECUTE drift on %',
                r.signature;
        end if;

        if v_authenticated is distinct from
           r.expected_authenticated then
            raise exception
                'BSEC_SECDEF_ABORT: authenticated EXECUTE drift on %',
                r.signature;
        end if;

        if v_service_role is distinct from
           r.expected_service_role then
            raise exception
                'BSEC_SECDEF_ABORT: service_role EXECUTE drift on %',
                r.signature;
        end if;

        if v_public_execute then
            raise exception
                'BSEC_SECDEF_ABORT: PUBLIC EXECUTE detected on %',
                r.signature;
        end if;
    end loop;
end
$guard$;


alter function
    public.create_project_forum_post_secure(uuid, uuid, text)
set search_path to pg_catalog;


alter function
    public.finalize_project_submission_secure(
        uuid,
        uuid,
        text,
        text,
        text,
        text,
        text,
        text,
        numeric,
        text,
        text,
        boolean
    )
set search_path to pg_catalog;


alter function
    public.register_project_participant_secure(
        text,
        text,
        text,
        text,
        text,
        text,
        text,
        text,
        boolean,
        text,
        text,
        text,
        timestamp with time zone
    )
set search_path to pg_catalog;


alter function
    public.support_project_secure(uuid, uuid)
set search_path to pg_catalog;


alter function
    public.vc_list_columns(text)
set search_path to pg_catalog;


revoke all
on function public.vc_list_columns(text)
from PUBLIC;

revoke all
on function public.vc_list_columns(text)
from anon;

revoke all
on function public.vc_list_columns(text)
from authenticated;

grant execute
on function public.vc_list_columns(text)
to service_role;


do $verify$
declare
    r record;
    v_oid oid;
    v_owner text;
    v_security_definer boolean;
    v_config text[];
    v_anon boolean;
    v_authenticated boolean;
    v_service_role boolean;
    v_public_execute boolean;
begin
    for r in
        select *
        from (
            values
                ('public.create_project_forum_post_secure(uuid,uuid,text)'::text),
                ('public.finalize_project_submission_secure(uuid,uuid,text,text,text,text,text,text,numeric,text,text,boolean)'::text),
                ('public.register_project_participant_secure(text,text,text,text,text,text,text,text,boolean,text,text,text,timestamp with time zone)'::text),
                ('public.support_project_secure(uuid,uuid)'::text),
                ('public.vc_list_columns(text)'::text)
        ) as x(signature)
    loop
        v_oid := pg_catalog.to_regprocedure(r.signature);

        if v_oid is null then
            raise exception
                'BSEC_SECDEF_VERIFY: function missing: %',
                r.signature;
        end if;

        select
            pg_catalog.pg_get_userbyid(p.proowner),
            p.prosecdef,
            p.proconfig,
            pg_catalog.has_function_privilege(
                'anon',
                p.oid,
                'EXECUTE'
            ),
            pg_catalog.has_function_privilege(
                'authenticated',
                p.oid,
                'EXECUTE'
            ),
            pg_catalog.has_function_privilege(
                'service_role',
                p.oid,
                'EXECUTE'
            ),
            exists (
                select 1
                from pg_catalog.aclexplode(
                    coalesce(
                        p.proacl,
                        pg_catalog.acldefault(
                            'f',
                            p.proowner
                        )
                    )
                ) a
                where a.grantee = 0
                  and a.privilege_type = 'EXECUTE'
            )
        into
            v_owner,
            v_security_definer,
            v_config,
            v_anon,
            v_authenticated,
            v_service_role,
            v_public_execute
        from pg_catalog.pg_proc p
        where p.oid = v_oid;

        if v_owner <> 'postgres' then
            raise exception
                'BSEC_SECDEF_VERIFY: owner changed on %',
                r.signature;
        end if;

        if v_security_definer is distinct from true then
            raise exception
                'BSEC_SECDEF_VERIFY: SECURITY DEFINER changed on %',
                r.signature;
        end if;

        if v_config is distinct from
           array['search_path=pg_catalog']::text[] then
            raise exception
                'BSEC_SECDEF_VERIFY: search_path not hardened on %: %',
                r.signature,
                v_config;
        end if;

        if v_anon then
            raise exception
                'BSEC_SECDEF_VERIFY: anon EXECUTE remains on %',
                r.signature;
        end if;

        if v_authenticated then
            raise exception
                'BSEC_SECDEF_VERIFY: authenticated EXECUTE remains on %',
                r.signature;
        end if;

        if not v_service_role then
            raise exception
                'BSEC_SECDEF_VERIFY: service_role EXECUTE missing on %',
                r.signature;
        end if;

        if v_public_execute then
            raise exception
                'BSEC_SECDEF_VERIFY: PUBLIC EXECUTE present on %',
                r.signature;
        end if;
    end loop;

    -- Helper interno utilizado por register_project_participant_secure().
    -- Debe permanecer fuera del acceso directo de runtime.
    v_oid := pg_catalog.to_regprocedure(
        'public.generar_codigo_acceso()'
    );

    if v_oid is null then
        raise exception
            'BSEC_SECDEF_VERIFY: generar_codigo_acceso() missing';
    end if;

    select p.proconfig
    into v_config
    from pg_catalog.pg_proc p
    where p.oid = v_oid
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef = false;

    if not found then
        raise exception
            'BSEC_SECDEF_VERIFY: generar_codigo_acceso architecture drift';
    end if;

    if v_config is distinct from
       array['search_path=pg_catalog']::text[] then
        raise exception
            'BSEC_SECDEF_VERIFY: generar_codigo_acceso search_path drift';
    end if;

    if pg_catalog.has_function_privilege(
        'anon',
        v_oid,
        'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'authenticated',
        v_oid,
        'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
        'service_role',
        v_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_SECDEF_VERIFY: generar_codigo_acceso direct runtime EXECUTE detected';
    end if;
end
$verify$;

commit;
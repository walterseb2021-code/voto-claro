-- ============================================================================
-- 20260922000200_harden_generar_codigo_profesional_search_path.sql
--
-- BSEC - generar_codigo_profesional()
--
-- Objetivo:
-- - conservar SECURITY INVOKER
-- - conservar owner postgres
-- - conservar VOLATILE
-- - conservar EXECUTE exclusivamente para service_role + postgres
-- - fijar search_path a pg_catalog, public
-- - no modificar cuerpo funcional
-- - no modificar datos
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

do $guard$
declare
    v_oid oid;
    v_owner text;
    v_security_definer boolean;
    v_volatility "char";
    v_config text[];
    v_language text;
    v_result text;
    v_identity_arguments text;
    v_source text;
begin

    v_oid :=
        pg_catalog.to_regprocedure(
            'public.generar_codigo_profesional()'
        );

    if v_oid is null then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: funcion ausente';
    end if;


    select
        pg_catalog.pg_get_userbyid(p.proowner),
        p.prosecdef,
        p.provolatile,
        p.proconfig,
        l.lanname,
        pg_catalog.pg_get_function_result(p.oid),
        pg_catalog.pg_get_function_identity_arguments(p.oid),
        p.prosrc
    into
        v_owner,
        v_security_definer,
        v_volatility,
        v_config,
        v_language,
        v_result,
        v_identity_arguments,
        v_source
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l
      on l.oid = p.prolang
    where p.oid = v_oid;


    if v_owner <> 'postgres' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: owner inesperado';
    end if;


    if v_security_definer is distinct from false then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: SECURITY DEFINER inesperado';
    end if;


    if v_volatility <> 'v' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: volatilidad inesperada';
    end if;


    if v_config is not null then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: proconfig inicial inesperado';
    end if;


    if v_language <> 'plpgsql' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: lenguaje inesperado';
    end if;


    if v_result <> 'text' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: tipo de retorno inesperado';
    end if;


    if coalesce(v_identity_arguments, '') <> '' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: argumentos inesperados';
    end if;


    if
        v_source not like '%public.espacio_profesionales%'
        or
        v_source not like '%codigo_profesional%'
        or
        v_source not like '%random()%'
        or
        v_source not like '%clock_timestamp()%'
    then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: cuerpo funcional inesperado';
    end if;


    -- EXECUTE debe estar reservado al servidor.

    if not pg_catalog.has_function_privilege(
        'service_role',
        v_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: service_role sin EXECUTE';
    end if;


    if pg_catalog.has_function_privilege(
        'anon',
        v_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: anon tiene EXECUTE';
    end if;


    if pg_catalog.has_function_privilege(
        'authenticated',
        v_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: authenticated tiene EXECUTE';
    end if;


    if not pg_catalog.has_function_privilege(
        'postgres',
        v_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: postgres sin EXECUTE';
    end if;


    if exists (
        select 1
        from pg_catalog.pg_proc p
        cross join lateral
            pg_catalog.aclexplode(
                coalesce(
                    p.proacl,
                    pg_catalog.acldefault('f', p.proowner)
                )
            ) a
        where p.oid = v_oid
          and a.grantee = 0
          and a.privilege_type = 'EXECUTE'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: PUBLIC tiene EXECUTE';
    end if;


    -- La funcion es SECURITY INVOKER, por lo que service_role
    -- debe conservar SELECT sobre la tabla consultada.

    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.espacio_profesionales',
        'SELECT'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_ABORT: falta SELECT de tabla';
    end if;

end
$guard$;


-- ============================================================================
-- HARDEN SEARCH PATH
-- ============================================================================

alter function public.generar_codigo_profesional()
    set search_path to pg_catalog, public;


-- ============================================================================
-- POSTFLIGHT
-- ============================================================================

do $verify$
declare
    v_oid oid;
    v_owner text;
    v_security_definer boolean;
    v_volatility "char";
    v_config text[];
    v_language text;
    v_result text;
    v_identity_arguments text;
    v_source text;
begin

    v_oid :=
        pg_catalog.to_regprocedure(
            'public.generar_codigo_profesional()'
        );

    if v_oid is null then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: funcion ausente';
    end if;


    select
        pg_catalog.pg_get_userbyid(p.proowner),
        p.prosecdef,
        p.provolatile,
        p.proconfig,
        l.lanname,
        pg_catalog.pg_get_function_result(p.oid),
        pg_catalog.pg_get_function_identity_arguments(p.oid),
        p.prosrc
    into
        v_owner,
        v_security_definer,
        v_volatility,
        v_config,
        v_language,
        v_result,
        v_identity_arguments,
        v_source
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l
      on l.oid = p.prolang
    where p.oid = v_oid;


    if v_owner <> 'postgres' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: owner cambio';
    end if;


    if v_security_definer is distinct from false then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: SECURITY INVOKER cambio';
    end if;


    if v_volatility <> 'v' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: volatilidad cambio';
    end if;


    if v_language <> 'plpgsql' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: lenguaje cambio';
    end if;


    if v_result <> 'text' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: retorno cambio';
    end if;


    if coalesce(v_identity_arguments, '') <> '' then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: argumentos cambiaron';
    end if;


    if v_config is distinct from
        array['search_path=pg_catalog, public']::text[]
    then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: search_path incorrecto: %',
            v_config;
    end if;


    if
        v_source not like '%public.espacio_profesionales%'
        or
        v_source not like '%codigo_profesional%'
        or
        v_source not like '%random()%'
        or
        v_source not like '%clock_timestamp()%'
    then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: cuerpo funcional cambio';
    end if;


    if not pg_catalog.has_function_privilege(
        'service_role',
        v_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: service_role perdio EXECUTE';
    end if;


    if
        pg_catalog.has_function_privilege(
            'anon',
            v_oid,
            'EXECUTE'
        )
        or
        pg_catalog.has_function_privilege(
            'authenticated',
            v_oid,
            'EXECUTE'
        )
    then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: browser role obtuvo EXECUTE';
    end if;


    if not pg_catalog.has_function_privilege(
        'postgres',
        v_oid,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: postgres perdio EXECUTE';
    end if;


    if exists (
        select 1
        from pg_catalog.pg_proc p
        cross join lateral
            pg_catalog.aclexplode(
                coalesce(
                    p.proacl,
                    pg_catalog.acldefault('f', p.proowner)
                )
            ) a
        where p.oid = v_oid
          and a.grantee = 0
          and a.privilege_type = 'EXECUTE'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: PUBLIC obtuvo EXECUTE';
    end if;


    if not pg_catalog.has_table_privilege(
        'service_role',
        'public.espacio_profesionales',
        'SELECT'
    ) then
        raise exception
            'BSEC_GENERAR_CODIGO_PROFESIONAL_VERIFY: SELECT tabla cambio';
    end if;

end
$verify$;
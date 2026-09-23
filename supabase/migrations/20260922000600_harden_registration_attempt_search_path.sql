begin;

do $guard$
declare
    v_fn oid;
    v_config text[];
    v_row_count bigint;
begin
    v_fn := pg_catalog.to_regprocedure(
        'public.consume_project_participant_registration_attempt(text)'
    );

    if v_fn is null then
        raise exception
            'BSEC_REG_ATTEMPT_ABORT: function missing';
    end if;

    select p.proconfig
    into v_config
    from pg_catalog.pg_proc p
    where p.oid = v_fn
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef = true;

    if not found then
        raise exception
            'BSEC_REG_ATTEMPT_ABORT: owner/security_definer drift';
    end if;

    if v_config is distinct from
       array['search_path=pg_catalog, public']::text[] then
        raise exception
            'BSEC_REG_ATTEMPT_ABORT: unexpected initial search_path: %',
            v_config;
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        v_fn,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_REG_ATTEMPT_ABORT: service_role lacks EXECUTE';
    end if;

    if pg_catalog.has_function_privilege(
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
            'BSEC_REG_ATTEMPT_ABORT: client EXECUTE privilege detected';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.project_participant_registration_attempts',
        'SELECT'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.project_participant_registration_attempts',
        'INSERT'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.project_participant_registration_attempts',
        'UPDATE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.project_participant_registration_attempts',
        'DELETE'
    ) then
        raise exception
            'BSEC_REG_ATTEMPT_ABORT: direct service_role table privilege detected';
    end if;

    select count(*)
    into v_row_count
    from public.project_participant_registration_attempts;

    if v_row_count <> 1 then
        raise exception
            'BSEC_REG_ATTEMPT_ABORT: row_count changed from diagnostic: %',
            v_row_count;
    end if;
end
$guard$;


alter function
    public.consume_project_participant_registration_attempt(text)
set search_path to pg_catalog;


do $verify$
declare
    v_fn oid;
    v_config text[];
    v_row_count bigint;
begin
    v_fn := pg_catalog.to_regprocedure(
        'public.consume_project_participant_registration_attempt(text)'
    );

    if v_fn is null then
        raise exception
            'BSEC_REG_ATTEMPT_VERIFY: function missing';
    end if;

    select p.proconfig
    into v_config
    from pg_catalog.pg_proc p
    where p.oid = v_fn
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef = true;

    if not found then
        raise exception
            'BSEC_REG_ATTEMPT_VERIFY: owner/security_definer changed';
    end if;

    if v_config is distinct from
       array['search_path=pg_catalog']::text[] then
        raise exception
            'BSEC_REG_ATTEMPT_VERIFY: search_path not hardened: %',
            v_config;
    end if;

    if not pg_catalog.has_function_privilege(
        'service_role',
        v_fn,
        'EXECUTE'
    ) then
        raise exception
            'BSEC_REG_ATTEMPT_VERIFY: service_role EXECUTE lost';
    end if;

    if pg_catalog.has_function_privilege(
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
            'BSEC_REG_ATTEMPT_VERIFY: client EXECUTE privilege appeared';
    end if;

    if pg_catalog.has_table_privilege(
        'service_role',
        'public.project_participant_registration_attempts',
        'SELECT'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.project_participant_registration_attempts',
        'INSERT'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.project_participant_registration_attempts',
        'UPDATE'
    )
    or pg_catalog.has_table_privilege(
        'service_role',
        'public.project_participant_registration_attempts',
        'DELETE'
    ) then
        raise exception
            'BSEC_REG_ATTEMPT_VERIFY: direct table privilege appeared';
    end if;

    select count(*)
    into v_row_count
    from public.project_participant_registration_attempts;

    if v_row_count <> 1 then
        raise exception
            'BSEC_REG_ATTEMPT_VERIFY: row_count changed';
    end if;
end
$verify$;

commit;
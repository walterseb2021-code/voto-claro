begin;

do $$
declare
  v_table_oid oid;
  v_pin_count integer;
  v_count integer;
  v_unexpected_ids integer;
  v_pin_type text;
  v_rotate_function_oid oid;
  v_disable_function_oid oid;
  v_pin_attnum smallint;
  v_dependency_count integer;
  v_role_oid oid;
  v_privilege_count integer;
begin
  select table_record.oid
    into v_table_oid
    from pg_catalog.pg_class as table_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = table_record.relnamespace
   where namespace_record.nspname = 'public'
     and table_record.relname = 'votoclaro_candidate_pins'
     and table_record.relkind in ('r', 'p');

  if v_table_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_TABLE_MISSING';
  end if;

  select pg_catalog.count(*)::integer
    into v_pin_count
    from pg_catalog.pg_attribute as attribute_record
   where attribute_record.attrelid = v_table_oid
     and attribute_record.attname = 'pin'
     and not attribute_record.attisdropped;

  if v_pin_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_PIN_COLUMN_COUNT_INVALID';
  end if;

  select pg_catalog.format_type(attribute_record.atttypid, attribute_record.atttypmod)
    into v_pin_type
    from pg_catalog.pg_attribute as attribute_record
   where attribute_record.attrelid = v_table_oid
     and attribute_record.attname = 'pin'
     and not attribute_record.attisdropped;

  if v_pin_type <> 'text' then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_PIN_COLUMN_TYPE_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins;

  if v_count <> 6 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_CREDENTIAL_COUNT_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_unexpected_ids
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id not in (
     'armando-joaquin-massc-fernandez',
     'cesar-acuña-peralta',
     'zulema-rebecca-azucena-barrenechea-reyes',
     'elizabeth-alfaro-espinoza',
     'luis-bernardo-guerrero-figueroa',
     'virgilio-acuña-peralta'
   );

  if v_unexpected_ids <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_UNEXPECTED_CREDENTIAL_ID';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id in (
     'armando-joaquin-massc-fernandez',
     'cesar-acuña-peralta',
     'zulema-rebecca-azucena-barrenechea-reyes',
     'elizabeth-alfaro-espinoza',
     'luis-bernardo-guerrero-figueroa',
     'virgilio-acuña-peralta'
   );

  if v_count <> 6 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_EXPECTED_CREDENTIAL_IDS_INVALID';
  end if;

  with expected(candidate_id) as (
    values
      ('armando-joaquin-massc-fernandez'),
      ('cesar-acuña-peralta'),
      ('zulema-rebecca-azucena-barrenechea-reyes'),
      ('elizabeth-alfaro-espinoza'),
      ('luis-bernardo-guerrero-figueroa'),
      ('virgilio-acuña-peralta')
  ),
  actual as (
    select pins.candidate_id,
           pg_catalog.count(*)::integer as row_count
      from public.votoclaro_candidate_pins as pins
     group by pins.candidate_id
  )
  select pg_catalog.count(*)::integer
    into v_count
    from expected
    left join actual
      on actual.candidate_id = expected.candidate_id
   where coalesce(actual.row_count, 0) <> 1;

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_CANDIDATE_CARDINALITY_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.pin is not null;

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_PIN_VALUES_REMAIN';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id in (
     'armando-joaquin-massc-fernandez',
     'cesar-acuña-peralta',
     'zulema-rebecca-azucena-barrenechea-reyes'
   )
     and pins.credential_status = 'ACTIVE'
     and pins.access_code_verifier is not null
     and pg_catalog.btrim(pins.access_code_verifier) <> ''
     and pins.credential_revision = 1;

  if v_count <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_ACTIVE_ROWS_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.credential_status = 'ACTIVE'
     and pins.candidate_id not in (
       'armando-joaquin-massc-fernandez',
       'cesar-acuña-peralta',
       'zulema-rebecca-azucena-barrenechea-reyes'
     );

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_UNEXPECTED_ACTIVE_ROW';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id in (
     'elizabeth-alfaro-espinoza',
     'luis-bernardo-guerrero-figueroa',
     'virgilio-acuña-peralta'
   )
     and pins.credential_status = 'DISABLED'
     and pins.access_code_verifier is null
     and pins.credential_revision = 1;

  if v_count <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_DISABLED_ROWS_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.credential_status = 'DISABLED'
     and pins.candidate_id not in (
       'elizabeth-alfaro-espinoza',
       'luis-bernardo-guerrero-figueroa',
       'virgilio-acuña-peralta'
     );

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_UNEXPECTED_DISABLED_ROW';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.credential_status not in ('ACTIVE', 'DISABLED', 'REVOKED');

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_UNEXPECTED_STATUS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id in (
     'armando-joaquin-masse-fernandez',
     'zulema-rebeca-azucena-barrenechea-reyes'
   );

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_DUPLICATE_CREDENTIAL_REMAINS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_roles as role_record
   where role_record.rolname in ('anon', 'authenticated', 'service_role');

  if v_count <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_REQUIRED_ROLE_MISSING';
  end if;

  select pg_catalog.count(*)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = v_table_oid
     and privilege_record.grantee = 0;

  if v_privilege_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_PUBLIC_TABLE_PRIVILEGE_PRESENT';
  end if;

  select role_record.oid
    into v_role_oid
    from pg_catalog.pg_roles as role_record
   where role_record.rolname = 'anon';

  select pg_catalog.count(*)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = v_table_oid
     and privilege_record.grantee = v_role_oid
     and privilege_record.privilege_type <> 'MAINTAIN';

  if v_privilege_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_ANON_UNEXPECTED_TABLE_PRIVILEGE';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'TRIGGER') then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_ANON_UNEXPECTED_EFFECTIVE_PRIVILEGE';
  end if;

  perform pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'MAINTAIN');

  select role_record.oid
    into v_role_oid
    from pg_catalog.pg_roles as role_record
   where role_record.rolname = 'authenticated';

  select pg_catalog.count(*)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = v_table_oid
     and privilege_record.grantee = v_role_oid
     and privilege_record.privilege_type <> 'MAINTAIN';

  if v_privilege_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_AUTHENTICATED_UNEXPECTED_TABLE_PRIVILEGE';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'REFERENCES')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'TRIGGER') then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_AUTHENTICATED_UNEXPECTED_EFFECTIVE_PRIVILEGE';
  end if;

  perform pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'MAINTAIN');

  select role_record.oid
    into v_role_oid
    from pg_catalog.pg_roles as role_record
   where role_record.rolname = 'service_role';

  select pg_catalog.count(distinct privilege_record.privilege_type)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = v_table_oid
     and privilege_record.grantee = v_role_oid
     and privilege_record.privilege_type in (
       'SELECT',
       'INSERT',
       'UPDATE',
       'DELETE',
       'TRUNCATE',
       'REFERENCES',
       'TRIGGER',
       'MAINTAIN'
     );

  if v_privilege_count <> 8 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_SERVICE_ROLE_DIRECT_PRIVILEGES_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = v_table_oid
     and privilege_record.grantee = v_role_oid
     and privilege_record.privilege_type not in (
       'SELECT',
       'INSERT',
       'UPDATE',
       'DELETE',
       'TRUNCATE',
       'REFERENCES',
       'TRIGGER',
       'MAINTAIN'
     );

  if v_privilege_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_SERVICE_ROLE_DIRECT_PRIVILEGES_INVALID';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'TRUNCATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'REFERENCES')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'TRIGGER')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'MAINTAIN') then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_SERVICE_ROLE_EFFECTIVE_PRIVILEGE_INVALID';
  end if;

  select pg_catalog.to_regprocedure('public.rotate_candidate_access_code(text,bigint,text)')::oid
    into v_rotate_function_oid;

  if v_rotate_function_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_ROTATE_RPC_MISSING';
  end if;

  select pg_catalog.to_regprocedure('public.disable_candidate_panel_access(text,bigint,text)')::oid
    into v_disable_function_oid;

  if v_disable_function_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_DISABLE_RPC_MISSING';
  end if;

  if pg_catalog.to_regprocedure('public.create_candidate_panel_session_if_active(text,bigint,text,timestamp with time zone)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_SESSION_RPC_MISSING';
  end if;

  if pg_catalog.to_regprocedure('public.check_candidate_panel_pin_rate_limit(text,text)') is null
     or pg_catalog.to_regprocedure('public.record_candidate_panel_pin_failure(text,text)') is null
     or pg_catalog.to_regprocedure('public.reset_candidate_panel_pin_rate_limit(text,text)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_RATE_LIMIT_RPC_MISSING';
  end if;

  if pg_catalog.to_regclass('public.candidate_panel_sessions') is null
     or pg_catalog.to_regclass('public.candidate_panel_pin_attempts') is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_AUTH_TABLE_MISSING';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
   where namespace_record.nspname not in ('pg_catalog', 'information_schema')
     and function_record.prokind in ('f', 'p')
     and pg_catalog.lower(pg_catalog.pg_get_functiondef(function_record.oid))
         like '%votoclaro_candidate_pins%'
     and pg_catalog.lower(pg_catalog.pg_get_functiondef(function_record.oid))
         ~ '(^|[^[:alnum:]_])pin([^[:alnum:]_]|$)'
     and function_record.oid in (v_rotate_function_oid, v_disable_function_oid);

  if v_count <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_UNEXPECTED_FUNCTION_BODY_DEPENDENCY';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
   where namespace_record.nspname = 'public'
     and function_record.prokind in ('f', 'p')
     and function_record.proname in (
       'rotate_candidate_access_code',
       'disable_candidate_panel_access'
     )
     and function_record.oid not in (v_rotate_function_oid, v_disable_function_oid);

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_UNEXPECTED_FUNCTION_BODY_DEPENDENCY';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
   where namespace_record.nspname not in ('pg_catalog', 'information_schema')
     and function_record.prokind in ('f', 'p')
     and pg_catalog.lower(pg_catalog.pg_get_functiondef(function_record.oid))
         like '%votoclaro_candidate_pins%'
     and pg_catalog.lower(pg_catalog.pg_get_functiondef(function_record.oid))
         ~ '(^|[^[:alnum:]_])pin([^[:alnum:]_]|$)'
     and function_record.oid not in (v_rotate_function_oid, v_disable_function_oid);

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_UNEXPECTED_FUNCTION_BODY_DEPENDENCY';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_views as view_record
   where view_record.schemaname not in ('pg_catalog', 'information_schema')
     and pg_catalog.lower(view_record.definition) like '%votoclaro_candidate_pins%'
     and pg_catalog.lower(view_record.definition)
         ~ '(^|[^[:alnum:]_])pin([^[:alnum:]_]|$)';

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_VIEW_BODY_DEPENDENCY_REMAINS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_matviews as view_record
   where view_record.schemaname not in ('pg_catalog', 'information_schema')
     and pg_catalog.lower(view_record.definition) like '%votoclaro_candidate_pins%'
     and pg_catalog.lower(view_record.definition)
         ~ '(^|[^[:alnum:]_])pin([^[:alnum:]_]|$)';

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_MATVIEW_BODY_DEPENDENCY_REMAINS';
  end if;

  select attribute_record.attnum
    into v_pin_attnum
    from pg_catalog.pg_attribute as attribute_record
   where attribute_record.attrelid = v_table_oid
     and attribute_record.attname = 'pin'
     and not attribute_record.attisdropped;

  if v_pin_attnum is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_PIN_COLUMN_MISSING_BEFORE_DROP';
  end if;

  select pg_catalog.count(*)::integer
    into v_dependency_count
    from pg_catalog.pg_depend as dependency_record
   where dependency_record.refclassid = 'pg_catalog.pg_class'::regclass
     and dependency_record.refobjid = v_table_oid
     and dependency_record.refobjsubid = v_pin_attnum
     and (
       dependency_record.classid <> 'pg_catalog.pg_proc'::regclass
       or dependency_record.objid not in (v_rotate_function_oid, v_disable_function_oid)
     );

  if v_dependency_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_UNEXPECTED_PIN_DEPENDENCIES';
  end if;
end
$$;

create or replace function public.disable_candidate_panel_access(
  p_candidate_id text,
  p_expected_revision bigint,
  p_reason text
)
returns table(
  candidate_id text,
  credential_status text,
  credential_revision bigint,
  credential_status_updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_reason text := pg_catalog.btrim(p_reason);
  v_now timestamptz := pg_catalog.now();
  v_current_revision bigint;
  v_next_revision bigint;
  v_status_updated_at timestamptz;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) = 0
     or pg_catalog.length(v_candidate_id) > 160
     or p_expected_revision is null
     or p_expected_revision < 0
     or v_reason is null
     or pg_catalog.length(v_reason) = 0
     or pg_catalog.length(v_reason) > 120 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_CANDIDATE_ACCESS_DISABLE';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('candidate-access-code:' || v_candidate_id, 0)
  );

  select pins.credential_revision
    into v_current_revision
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = v_candidate_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_ACCESS_DISABLE_NOT_FOUND';
  end if;

  if v_current_revision <> p_expected_revision then
    raise exception using
      errcode = 'P0001',
      message = 'CANDIDATE_ACCESS_CODE_REVISION_CONFLICT';
  end if;

  update public.votoclaro_candidate_pins as pins
     set access_code_verifier = null,
         access_code_rotated_at = null,
         credential_status = 'DISABLED',
         credential_status_updated_at = v_now,
         credential_status_reason = v_reason,
         credential_revision = pins.credential_revision + 1
   where pins.candidate_id = v_candidate_id
   returning
     pins.credential_revision,
     pins.credential_status_updated_at
    into
     v_next_revision,
     v_status_updated_at;

  delete from public.candidate_panel_sessions as sessions
   where sessions.candidate_id = v_candidate_id;

  delete from public.candidate_panel_pin_attempts as attempts
   where attempts.candidate_id = v_candidate_id;

  return query
  select
    v_candidate_id,
    'DISABLED'::text,
    v_next_revision,
    v_status_updated_at;
end;
$$;

revoke all on function public.disable_candidate_panel_access(text, bigint, text) from public;
revoke all on function public.disable_candidate_panel_access(text, bigint, text) from anon;
revoke all on function public.disable_candidate_panel_access(text, bigint, text) from authenticated;
grant execute on function public.disable_candidate_panel_access(text, bigint, text) to service_role;

create or replace function public.rotate_candidate_access_code(
  p_candidate_id text,
  p_expected_revision bigint,
  p_access_code_verifier text
)
returns table(
  candidate_id text,
  credential_revision bigint,
  access_code_rotated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_id text := pg_catalog.btrim(p_candidate_id);
  v_now timestamptz := pg_catalog.now();
  v_current_revision bigint;
  v_current_status text;
  v_next_revision bigint;
begin
  if v_candidate_id is null
     or pg_catalog.length(v_candidate_id) = 0
     or pg_catalog.length(v_candidate_id) > 160
     or p_expected_revision is null
     or p_expected_revision < 0
     or p_access_code_verifier is null
     or pg_catalog.length(pg_catalog.btrim(p_access_code_verifier)) = 0
     or pg_catalog.length(pg_catalog.btrim(p_access_code_verifier)) > 300 then
    raise exception using
      errcode = '22023',
      message = 'INVALID_CANDIDATE_ACCESS_CODE_ROTATION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('candidate-access-code:' || v_candidate_id, 0)
  );

  select pins.credential_revision,
         pins.credential_status
    into v_current_revision,
         v_current_status
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = v_candidate_id
   for update;

  if not found then
    if p_expected_revision <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'CANDIDATE_ACCESS_CODE_REVISION_CONFLICT';
    end if;

    insert into public.votoclaro_candidate_pins as pins (
      candidate_id,
      access_code_verifier,
      access_code_rotated_at,
      credential_revision,
      credential_status,
      credential_status_updated_at,
      credential_status_reason
    )
    values (
      v_candidate_id,
      pg_catalog.btrim(p_access_code_verifier),
      v_now,
      1,
      'ACTIVE',
      v_now,
      null
    )
    returning
      pins.credential_revision,
      pins.access_code_rotated_at
    into
      v_next_revision,
      access_code_rotated_at;
  else
    if v_current_status <> 'ACTIVE' then
      raise exception using
        errcode = 'P0001',
        message = 'CANDIDATE_ACCESS_CODE_STATUS_CONFLICT';
    end if;

    if v_current_revision <> p_expected_revision then
      raise exception using
        errcode = 'P0001',
        message = 'CANDIDATE_ACCESS_CODE_REVISION_CONFLICT';
    end if;

    update public.votoclaro_candidate_pins as pins
       set access_code_verifier = pg_catalog.btrim(p_access_code_verifier),
           access_code_rotated_at = v_now,
           credential_revision = pins.credential_revision + 1
     where pins.candidate_id = v_candidate_id
     returning
       pins.credential_revision,
       pins.access_code_rotated_at
    into
       v_next_revision,
       access_code_rotated_at;
  end if;

  delete from public.candidate_panel_sessions as sessions
   where sessions.candidate_id = v_candidate_id;

  delete from public.candidate_panel_pin_attempts as attempts
   where attempts.candidate_id = v_candidate_id;

  candidate_id := v_candidate_id;
  credential_revision := v_next_revision;
  return next;
end;
$$;

revoke all on function public.rotate_candidate_access_code(text, bigint, text) from public;
revoke all on function public.rotate_candidate_access_code(text, bigint, text) from anon;
revoke all on function public.rotate_candidate_access_code(text, bigint, text) from authenticated;
grant execute on function public.rotate_candidate_access_code(text, bigint, text) to service_role;

revoke maintain on table public.votoclaro_candidate_pins from public;
revoke maintain on table public.votoclaro_candidate_pins from anon;
revoke maintain on table public.votoclaro_candidate_pins from authenticated;

do $$
declare
  v_count integer;
begin
  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_proc as function_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = function_record.pronamespace
   where namespace_record.nspname not in ('pg_catalog', 'information_schema')
     and function_record.prokind in ('f', 'p')
     and pg_catalog.lower(pg_catalog.pg_get_functiondef(function_record.oid))
         like '%votoclaro_candidate_pins%'
     and pg_catalog.lower(pg_catalog.pg_get_functiondef(function_record.oid))
         ~ '(^|[^[:alnum:]_])pin([^[:alnum:]_]|$)';

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_FUNCTION_BODY_DEPENDENCY_REMAINS';
  end if;
end
$$;

do $$
declare
  v_pin_attnum smallint;
  v_dependency_count integer;
begin
  select attribute_record.attnum
    into v_pin_attnum
    from pg_catalog.pg_attribute as attribute_record
   where attribute_record.attrelid = 'public.votoclaro_candidate_pins'::regclass
     and attribute_record.attname = 'pin'
     and not attribute_record.attisdropped;

  if v_pin_attnum is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_PIN_COLUMN_MISSING_BEFORE_DROP';
  end if;

  select pg_catalog.count(*)::integer
    into v_dependency_count
    from pg_catalog.pg_depend as dependency_record
   where dependency_record.refclassid = 'pg_catalog.pg_class'::regclass
     and dependency_record.refobjid = 'public.votoclaro_candidate_pins'::regclass
     and dependency_record.refobjsubid = v_pin_attnum;

  if v_dependency_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_PRE_PIN_DEPENDENCIES_REMAIN';
  end if;
end
$$;

alter table public.votoclaro_candidate_pins
drop column pin restrict;

do $$
declare
  v_count integer;
  v_unexpected_ids integer;
  v_function_oid oid;
  v_role_oid oid;
  v_privilege_count integer;
begin
  if pg_catalog.to_regclass('public.votoclaro_candidate_pins') is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_TABLE_MISSING';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from pg_catalog.pg_attribute as attribute_record
   where attribute_record.attrelid = 'public.votoclaro_candidate_pins'::regclass
     and attribute_record.attname = 'pin'
     and not attribute_record.attisdropped;

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_PIN_COLUMN_REMAINS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins;

  if v_count <> 6 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_CREDENTIAL_COUNT_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_unexpected_ids
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id not in (
     'armando-joaquin-massc-fernandez',
     'cesar-acuña-peralta',
     'zulema-rebecca-azucena-barrenechea-reyes',
     'elizabeth-alfaro-espinoza',
     'luis-bernardo-guerrero-figueroa',
     'virgilio-acuña-peralta'
   );

  if v_unexpected_ids <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_UNEXPECTED_CREDENTIAL_ID';
  end if;

  with expected(candidate_id) as (
    values
      ('armando-joaquin-massc-fernandez'),
      ('cesar-acuña-peralta'),
      ('zulema-rebecca-azucena-barrenechea-reyes'),
      ('elizabeth-alfaro-espinoza'),
      ('luis-bernardo-guerrero-figueroa'),
      ('virgilio-acuña-peralta')
  ),
  actual as (
    select pins.candidate_id,
           pg_catalog.count(*)::integer as row_count
      from public.votoclaro_candidate_pins as pins
     group by pins.candidate_id
  )
  select pg_catalog.count(*)::integer
    into v_count
    from expected
    left join actual
      on actual.candidate_id = expected.candidate_id
   where coalesce(actual.row_count, 0) <> 1;

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_CANDIDATE_CARDINALITY_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id in (
     'armando-joaquin-massc-fernandez',
     'cesar-acuña-peralta',
     'zulema-rebecca-azucena-barrenechea-reyes'
   )
     and pins.credential_status = 'ACTIVE'
     and pins.access_code_verifier is not null
     and pg_catalog.btrim(pins.access_code_verifier) <> ''
     and pins.credential_revision = 1;

  if v_count <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_ACTIVE_ROWS_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id in (
     'elizabeth-alfaro-espinoza',
     'luis-bernardo-guerrero-figueroa',
     'virgilio-acuña-peralta'
   )
     and pins.credential_status = 'DISABLED'
     and pins.access_code_verifier is null
     and pins.credential_revision = 1;

  if v_count <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_DISABLED_ROWS_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id in (
     'armando-joaquin-masse-fernandez',
     'zulema-rebeca-azucena-barrenechea-reyes'
   );

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_DUPLICATE_CREDENTIAL_REMAINS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
      from pg_catalog.pg_class as table_record
      join pg_catalog.pg_namespace as namespace_record
        on namespace_record.oid = table_record.relnamespace
     where namespace_record.nspname = 'public'
       and table_record.relname = 'votoclaro_candidate_pins'
       and table_record.relrowsecurity;

  if v_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_RLS_DISABLED';
  end if;

  select pg_catalog.count(*)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = 'public.votoclaro_candidate_pins'::regclass
     and privilege_record.grantee = 0;

  if v_privilege_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_PUBLIC_TABLE_PRIVILEGE_PRESENT';
  end if;

  select role_record.oid
    into v_role_oid
    from pg_catalog.pg_roles as role_record
   where role_record.rolname = 'anon';

  if v_role_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_ANON_ROLE_MISSING';
  end if;

  select pg_catalog.count(*)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = 'public.votoclaro_candidate_pins'::regclass
     and privilege_record.grantee = v_role_oid;

  if v_privilege_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_ANON_TABLE_PRIVILEGE';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'TRIGGER')
     or pg_catalog.has_table_privilege('anon', 'public.votoclaro_candidate_pins', 'MAINTAIN') then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_ANON_EFFECTIVE_PRIVILEGE';
  end if;

  select role_record.oid
    into v_role_oid
    from pg_catalog.pg_roles as role_record
   where role_record.rolname = 'authenticated';

  if v_role_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_AUTHENTICATED_ROLE_MISSING';
  end if;

  select pg_catalog.count(*)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = 'public.votoclaro_candidate_pins'::regclass
     and privilege_record.grantee = v_role_oid;

  if v_privilege_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_AUTHENTICATED_TABLE_PRIVILEGE';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'REFERENCES')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'TRIGGER')
     or pg_catalog.has_table_privilege('authenticated', 'public.votoclaro_candidate_pins', 'MAINTAIN') then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_AUTHENTICATED_EFFECTIVE_PRIVILEGE';
  end if;

  select role_record.oid
    into v_role_oid
    from pg_catalog.pg_roles as role_record
   where role_record.rolname = 'service_role';

  if v_role_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_SERVICE_ROLE_MISSING';
  end if;

  select pg_catalog.count(distinct privilege_record.privilege_type)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = 'public.votoclaro_candidate_pins'::regclass
     and privilege_record.grantee = v_role_oid
     and privilege_record.privilege_type in (
       'SELECT',
       'INSERT',
       'UPDATE',
       'DELETE',
       'TRUNCATE',
       'REFERENCES',
       'TRIGGER',
       'MAINTAIN'
     );

  if v_privilege_count <> 8 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_SERVICE_ROLE_DIRECT_PRIVILEGES_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_privilege_count
    from pg_catalog.pg_class as table_record
    cross join pg_catalog.aclexplode(
      coalesce(
        table_record.relacl,
        pg_catalog.acldefault('r', table_record.relowner)
      )
    ) as privilege_record
   where table_record.oid = 'public.votoclaro_candidate_pins'::regclass
     and privilege_record.grantee = v_role_oid
     and privilege_record.privilege_type not in (
       'SELECT',
       'INSERT',
       'UPDATE',
       'DELETE',
       'TRUNCATE',
       'REFERENCES',
       'TRIGGER',
       'MAINTAIN'
     );

  if v_privilege_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_SERVICE_ROLE_DIRECT_PRIVILEGES_INVALID';
  end if;

  if not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'INSERT')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'UPDATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'DELETE')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'TRUNCATE')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'REFERENCES')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'TRIGGER')
     or not pg_catalog.has_table_privilege('service_role', 'public.votoclaro_candidate_pins', 'MAINTAIN') then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_SERVICE_ROLE_EFFECTIVE_PRIVILEGE_INVALID';
  end if;

  foreach v_function_oid in array array[
    pg_catalog.to_regprocedure('public.disable_candidate_panel_access(text,bigint,text)')::oid,
    pg_catalog.to_regprocedure('public.rotate_candidate_access_code(text,bigint,text)')::oid,
    pg_catalog.to_regprocedure(
      'public.create_candidate_panel_session_if_active(text,bigint,text,timestamp with time zone)'
    )::oid
  ]
  loop
    if v_function_oid is null then
      raise exception using
        errcode = 'P0001',
        message = 'LEGACY_PIN_REMOVAL_POST_REDEFINED_RPC_MISSING';
    end if;

    select pg_catalog.count(*)::integer
      into v_count
        from pg_catalog.pg_proc as function_record
       where function_record.oid = v_function_oid
         and function_record.prosecdef
         and 'search_path=pg_catalog' = any(function_record.proconfig);

    if v_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'LEGACY_PIN_REMOVAL_POST_REDEFINED_RPC_SECURITY_INVALID';
    end if;

    select pg_catalog.count(*)::integer
      into v_privilege_count
        from pg_catalog.pg_proc as function_record
        cross join pg_catalog.aclexplode(
          coalesce(
            function_record.proacl,
            pg_catalog.acldefault('f', function_record.proowner)
          )
        ) as privilege_record
       where function_record.oid = v_function_oid
         and privilege_record.grantee = 0
         and privilege_record.privilege_type = 'EXECUTE';

    if v_privilege_count <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'LEGACY_PIN_REMOVAL_POST_PUBLIC_RPC_EXECUTE';
    end if;

    select role_record.oid
      into v_role_oid
      from pg_catalog.pg_roles as role_record
     where role_record.rolname = 'anon';

    select pg_catalog.count(*)::integer
      into v_privilege_count
        from pg_catalog.pg_proc as function_record
        cross join pg_catalog.aclexplode(
          coalesce(
            function_record.proacl,
            pg_catalog.acldefault('f', function_record.proowner)
          )
        ) as privilege_record
       where function_record.oid = v_function_oid
         and privilege_record.grantee = v_role_oid
         and privilege_record.privilege_type = 'EXECUTE';

    if v_privilege_count <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'LEGACY_PIN_REMOVAL_POST_ANON_RPC_EXECUTE';
    end if;

    select role_record.oid
      into v_role_oid
      from pg_catalog.pg_roles as role_record
     where role_record.rolname = 'authenticated';

    select pg_catalog.count(*)::integer
      into v_privilege_count
        from pg_catalog.pg_proc as function_record
        cross join pg_catalog.aclexplode(
          coalesce(
            function_record.proacl,
            pg_catalog.acldefault('f', function_record.proowner)
          )
        ) as privilege_record
       where function_record.oid = v_function_oid
         and privilege_record.grantee = v_role_oid
         and privilege_record.privilege_type = 'EXECUTE';

    if v_privilege_count <> 0 then
      raise exception using
        errcode = 'P0001',
        message = 'LEGACY_PIN_REMOVAL_POST_AUTHENTICATED_RPC_EXECUTE';
    end if;

    select role_record.oid
      into v_role_oid
      from pg_catalog.pg_roles as role_record
     where role_record.rolname = 'service_role';

    select pg_catalog.count(*)::integer
      into v_privilege_count
        from pg_catalog.pg_proc as function_record
        cross join pg_catalog.aclexplode(
          coalesce(
            function_record.proacl,
            pg_catalog.acldefault('f', function_record.proowner)
          )
        ) as privilege_record
       where function_record.oid = v_function_oid
         and privilege_record.grantee = v_role_oid
         and privilege_record.privilege_type = 'EXECUTE';

    if v_privilege_count <> 1 then
      raise exception using
        errcode = 'P0001',
        message = 'LEGACY_PIN_REMOVAL_POST_SERVICE_ROLE_RPC_EXECUTE_MISSING';
    end if;
  end loop;

  select pg_catalog.to_regprocedure(
    'public.create_candidate_panel_session_if_active(text,bigint,text,timestamp with time zone)'
  )::oid
    into v_function_oid;

  if v_function_oid is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_SESSION_RPC_MISSING';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
      from pg_catalog.pg_proc as function_record
     where function_record.oid = v_function_oid
       and function_record.prosecdef
       and 'search_path=pg_catalog' = any(function_record.proconfig);

  if v_count <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_SESSION_RPC_SECURITY_INVALID';
  end if;

  if pg_catalog.to_regclass('public.candidate_panel_sessions') is null
     or pg_catalog.to_regclass('public.candidate_panel_pin_attempts') is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_AUTH_TABLE_MISSING';
  end if;

  if pg_catalog.to_regprocedure('public.check_candidate_panel_pin_rate_limit(text,text)') is null
     or pg_catalog.to_regprocedure('public.record_candidate_panel_pin_failure(text,text)') is null
     or pg_catalog.to_regprocedure('public.reset_candidate_panel_pin_rate_limit(text,text)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'LEGACY_PIN_REMOVAL_POST_RATE_LIMIT_RPC_MISSING';
  end if;
end
$$;

commit;

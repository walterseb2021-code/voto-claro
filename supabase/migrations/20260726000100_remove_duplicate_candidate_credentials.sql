-- Remove duplicate candidate credential rows that still contain legacy PINs.
-- One-time cleanup: deletes exactly two test live entries first, then two duplicate credentials.

begin;

do $$
declare
  v_count integer;
  v_deleted integer;
begin
  -- Safe rows must exist and must already be migrated to access-code credentials.
  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where (
          pins.candidate_id = 'armando-joaquin-massc-fernandez'
          and pins.credential_status = 'ACTIVE'
          and pins.pin is null
          and pins.access_code_verifier is not null
          and pg_catalog.btrim(pins.access_code_verifier) <> ''
          and pins.credential_revision = 1
        )
      or (
          pins.candidate_id = 'zulema-rebecca-azucena-barrenechea-reyes'
          and pins.credential_status = 'ACTIVE'
          and pins.pin is null
          and pins.access_code_verifier is not null
          and pg_catalog.btrim(pins.access_code_verifier) <> ''
          and pins.credential_revision = 1
        );

  if v_count <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_SAFE_ROWS_INVALID';
  end if;

  -- Protected credential rows must exist. This guard also detects accidental prior deletion.
  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.candidate_id in (
     'cesar-acuña-peralta',
     'elizabeth-alfaro-espinoza',
     'luis-bernardo-guerrero-figueroa',
     'virgilio-acuña-peralta'
   );

  if v_count <> 4 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_PROTECTED_ROWS_MISSING';
  end if;

  -- Duplicate legacy PIN rows must exist exactly as expected.
  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where (
          pins.candidate_id = 'armando-joaquin-masse-fernandez'
          and pins.credential_status = 'ACTIVE'
          and pins.pin is not null
          and pins.access_code_verifier is null
          and pins.credential_revision = 0
        )
      or (
          pins.candidate_id = 'zulema-rebeca-azucena-barrenechea-reyes'
          and pins.credential_status = 'ACTIVE'
          and pins.pin is not null
          and pins.access_code_verifier is null
          and pins.credential_revision = 0
        );

  if v_count <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_DUPLICATE_ROWS_INVALID';
  end if;

  -- Duplicate credential rows must not have authorization state.
  select pg_catalog.count(*)::integer
    into v_count
    from public.candidate_panel_sessions as sessions
   where sessions.candidate_id in (
     'armando-joaquin-masse-fernandez',
     'zulema-rebeca-azucena-barrenechea-reyes'
   );

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_UNEXPECTED_SESSIONS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.candidate_panel_pin_attempts as attempts
   where attempts.candidate_id in (
     'armando-joaquin-masse-fernandez',
     'zulema-rebeca-azucena-barrenechea-reyes'
   );

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_UNEXPECTED_ATTEMPTS';
  end if;

  -- Test live entries must be the only live references for the duplicate IDs.
  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_live_entries as live
   where live.candidate_id in (
     'armando-joaquin-masse-fernandez',
     'zulema-rebeca-azucena-barrenechea-reyes'
   );

  if v_count <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_UNEXPECTED_DUPLICATE_LIVES';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_live_entries as live
   where (
          live.id = 'a71fd28a-7304-408f-abba-e72fa634dffc'::uuid
          and live.candidate_id = 'armando-joaquin-masse-fernandez'
        )
      or (
          live.id = 'e7b3f130-24d2-4d8d-972d-a555a8f3511d'::uuid
          and live.candidate_id = 'zulema-rebeca-azucena-barrenechea-reyes'
        );

  if v_count <> 2 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_TEST_LIVES_INVALID';
  end if;

  delete from public.votoclaro_live_entries as live
   where live.id = 'a71fd28a-7304-408f-abba-e72fa634dffc'::uuid
     and live.candidate_id = 'armando-joaquin-masse-fernandez';

  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_ARMANDO_LIVE_DELETE_FAILED';
  end if;

  delete from public.votoclaro_live_entries as live
   where live.id = 'e7b3f130-24d2-4d8d-972d-a555a8f3511d'::uuid
     and live.candidate_id = 'zulema-rebeca-azucena-barrenechea-reyes';

  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_ZULEMA_LIVE_DELETE_FAILED';
  end if;

  delete from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = 'armando-joaquin-masse-fernandez';

  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_ARMANDO_CREDENTIAL_DELETE_FAILED';
  end if;

  delete from public.votoclaro_candidate_pins as pins
   where pins.candidate_id = 'zulema-rebeca-azucena-barrenechea-reyes';

  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_ZULEMA_CREDENTIAL_DELETE_FAILED';
  end if;

  -- Post-delete invariants: exactly the six intended credential rows remain.
  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins;

  if v_count <> 6 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_CREDENTIAL_COUNT_INVALID';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.pin is not null;

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_PIN_REMAINS';
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
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_DUPLICATE_CREDENTIAL_REMAINS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_live_entries as live
   where live.id in (
     'a71fd28a-7304-408f-abba-e72fa634dffc'::uuid,
     'e7b3f130-24d2-4d8d-972d-a555a8f3511d'::uuid
   );

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_TEST_LIVE_REMAINS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.candidate_panel_sessions as sessions
   where sessions.candidate_id in (
     'armando-joaquin-masse-fernandez',
     'zulema-rebeca-azucena-barrenechea-reyes'
   );

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_SESSION_REMAINS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.candidate_panel_pin_attempts as attempts
   where attempts.candidate_id in (
     'armando-joaquin-masse-fernandez',
     'zulema-rebeca-azucena-barrenechea-reyes'
   );

  if v_count <> 0 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_ATTEMPT_REMAINS';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.credential_status = 'ACTIVE'
     and pins.pin is null
     and pins.access_code_verifier is not null
     and pg_catalog.btrim(pins.access_code_verifier) <> ''
     and pins.candidate_id in (
       'armando-joaquin-massc-fernandez',
       'cesar-acuña-peralta',
       'zulema-rebecca-azucena-barrenechea-reyes'
     );

  if v_count <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_ACTIVE_ROWS_INVALID';
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
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_UNEXPECTED_ACTIVE_ROW';
  end if;

  select pg_catalog.count(*)::integer
    into v_count
    from public.votoclaro_candidate_pins as pins
   where pins.credential_status = 'DISABLED'
     and pins.pin is null
     and pins.access_code_verifier is null
     and pins.candidate_id in (
       'elizabeth-alfaro-espinoza',
       'luis-bernardo-guerrero-figueroa',
       'virgilio-acuña-peralta'
     );

  if v_count <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_DISABLED_ROWS_INVALID';
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
      message = 'DUPLICATE_CREDENTIAL_CLEANUP_POST_UNEXPECTED_DISABLED_ROW';
  end if;
end
$$;

commit;

-- ============================================================================
-- B2C-E5F10B2
-- FIX CAMINO PRIZE ATOMIC FUNCTIONS
-- ============================================================================
-- Permanent repair for two defects proven by B2C-E5F10B1 V4 simulation:
-- 1) pg_catalog.least/greatest are invalid calls in PL/pgSQL expressions.
-- 2) ON CONFLICT (participant_id, award_year, award_quarter) is ambiguous
--    inside finalize_reto_camino_win_atomic because award_year/award_quarter
--    are also OUT parameter names.
--
-- This migration changes only those two defects, preserves signatures,
-- SECURITY DEFINER/search_path, owner and least-privilege EXECUTE ACLs.
-- RETO_PRIZES_ENABLED must remain false while this migration is applied.
-- ============================================================================

begin;

-- ============================================================================
-- PREFLIGHT
-- ============================================================================
do $preflight$
declare
  v_commit regprocedure;
  v_finalizer regprocedure;
  v_commit_owner text;
  v_finalizer_owner text;
  v_commit_secdef boolean;
  v_finalizer_secdef boolean;
  v_commit_config text[];
  v_finalizer_config text[];
  v_commit_def text;
  v_finalizer_def text;
  v_least_count integer;
  v_greatest_count integer;
  v_conflict_count integer;
begin
  v_commit := pg_catalog.to_regprocedure(
    'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)'
  );
  v_finalizer := pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  );

  if v_commit is null or v_finalizer is null then
    raise exception 'B2C_E5F10B2_ABORT: required RPC missing';
  end if;

  if pg_catalog.to_regprocedure(
       'public.recover_reto_prize_answer_replay(uuid,uuid,text,text,integer,uuid,boolean)'
     ) is not null then
    raise exception 'B2C_E5F10B2_ABORT: replay recovery RPC already exists';
  end if;

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.proconfig,
    pg_catalog.pg_get_functiondef(p.oid)
  into
    v_commit_owner,
    v_commit_secdef,
    v_commit_config,
    v_commit_def
  from pg_catalog.pg_proc p
  where p.oid = v_commit;

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.proconfig,
    pg_catalog.pg_get_functiondef(p.oid)
  into
    v_finalizer_owner,
    v_finalizer_secdef,
    v_finalizer_config,
    v_finalizer_def
  from pg_catalog.pg_proc p
  where p.oid = v_finalizer;

  if v_commit_owner <> 'postgres'
     or v_finalizer_owner <> 'postgres'
     or not v_commit_secdef
     or not v_finalizer_secdef
     or coalesce(pg_catalog.array_to_string(v_commit_config, ','), '') <> 'search_path=pg_catalog'
     or coalesce(pg_catalog.array_to_string(v_finalizer_config, ','), '') <> 'search_path=pg_catalog' then
    raise exception 'B2C_E5F10B2_ABORT: security attributes changed';
  end if;

  if pg_catalog.has_function_privilege('anon', v_commit, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_commit, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_commit, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_finalizer, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_finalizer, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_finalizer, 'EXECUTE') then
    raise exception 'B2C_E5F10B2_ABORT: function ACL changed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where p.oid in (v_commit::oid, v_finalizer::oid)
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'B2C_E5F10B2_ABORT: PUBLIC EXECUTE unexpectedly present';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.reto_camino_qualifiers'::pg_catalog.regclass
      and c.conname = 'reto_camino_qualifiers_participant_period_uniq'
      and c.contype = 'u'
      and c.convalidated
      and pg_catalog.pg_get_constraintdef(c.oid)
          = 'UNIQUE (participant_id, award_year, award_quarter)'
  ) then
    raise exception 'B2C_E5F10B2_ABORT: expected Camino qualifier unique constraint missing or changed';
  end if;

  v_least_count :=
    (pg_catalog.length(v_commit_def)
      - pg_catalog.length(pg_catalog.replace(v_commit_def, 'pg_catalog.least(', '')))
    / pg_catalog.length('pg_catalog.least(');

  v_greatest_count :=
    (pg_catalog.length(v_commit_def)
      - pg_catalog.length(pg_catalog.replace(v_commit_def, 'pg_catalog.greatest(', '')))
    / pg_catalog.length('pg_catalog.greatest(');

  v_conflict_count :=
    (pg_catalog.length(pg_catalog.lower(v_finalizer_def))
      - pg_catalog.length(
          pg_catalog.replace(
            pg_catalog.lower(v_finalizer_def),
            'on conflict (participant_id, award_year, award_quarter)',
            ''
          )
        ))
    / pg_catalog.length('on conflict (participant_id, award_year, award_quarter)');

  if v_least_count <> 1 or v_greatest_count <> 2 then
    raise exception
      'B2C_E5F10B2_ABORT: unexpected LEAST/GREATEST defect count %, %',
      v_least_count, v_greatest_count;
  end if;

  if v_conflict_count <> 1 then
    raise exception
      'B2C_E5F10B2_ABORT: unexpected ambiguous ON CONFLICT count %',
      v_conflict_count;
  end if;

  if pg_catalog.strpos(
       pg_catalog.lower(v_finalizer_def),
       'on conflict on constraint reto_camino_qualifiers_participant_period_uniq'
     ) <> 0 then
    raise exception 'B2C_E5F10B2_ABORT: finalizer already repaired unexpectedly';
  end if;
end
$preflight$;

-- ============================================================================
-- CHANGE 1: repair commit_reto_prize_answer_atomic
-- ============================================================================
do $change_commit$
declare
  v_proc regprocedure;
  v_definition text;
  v_fixed text;
begin
  v_proc := pg_catalog.to_regprocedure(
    'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)'
  );

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_definition
  from pg_catalog.pg_proc p
  where p.oid = v_proc;

  v_fixed := pg_catalog.replace(
    pg_catalog.replace(v_definition, 'pg_catalog.least(', 'least('),
    'pg_catalog.greatest(', 'greatest('
  );

  if v_fixed = v_definition
     or pg_catalog.strpos(v_fixed, 'pg_catalog.least(') <> 0
     or pg_catalog.strpos(v_fixed, 'pg_catalog.greatest(') <> 0
     or pg_catalog.strpos(v_fixed, 'least(v_position + v_roll, 30)') = 0
     or pg_catalog.strpos(v_fixed, 'greatest(v_position - v_roll, 0)') = 0
     or pg_catalog.strpos(v_fixed, 'greatest(0, v_turns_left - 1)') = 0 then
    raise exception 'B2C_E5F10B2_ABORT: commit RPC repair text invalid';
  end if;

  execute v_fixed;
end
$change_commit$;

-- ============================================================================
-- CHANGE 2: repair finalize_reto_camino_win_atomic
-- ============================================================================
do $change_finalizer$
declare
  v_proc regprocedure;
  v_definition text;
  v_fixed text;
begin
  v_proc := pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  );

  select pg_catalog.pg_get_functiondef(p.oid)
  into v_definition
  from pg_catalog.pg_proc p
  where p.oid = v_proc;

  v_fixed := pg_catalog.regexp_replace(
    v_definition,
    'on[[:space:]]+conflict[[:space:]]*\([[:space:]]*participant_id[[:space:]]*,[[:space:]]*award_year[[:space:]]*,[[:space:]]*award_quarter[[:space:]]*\)',
    'on conflict on constraint reto_camino_qualifiers_participant_period_uniq',
    'i'
  );

  if v_fixed = v_definition
     or pg_catalog.strpos(
          pg_catalog.lower(v_fixed),
          'on conflict (participant_id, award_year, award_quarter)'
        ) <> 0
     or pg_catalog.strpos(
          pg_catalog.lower(v_fixed),
          'on conflict on constraint reto_camino_qualifiers_participant_period_uniq'
        ) = 0 then
    raise exception 'B2C_E5F10B2_ABORT: finalizer repair text invalid';
  end if;

  execute v_fixed;
end
$change_finalizer$;

-- ============================================================================
-- Reassert owner and least-privilege EXECUTE ACLs
-- ============================================================================
alter function public.commit_reto_prize_answer_atomic(
  uuid, uuid, text, integer, uuid, boolean
) owner to postgres;

revoke all on function public.commit_reto_prize_answer_atomic(
  uuid, uuid, text, integer, uuid, boolean
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.commit_reto_prize_answer_atomic(
  uuid, uuid, text, integer, uuid, boolean
) to service_role;

alter function public.finalize_reto_camino_win_atomic(
  uuid, uuid, text, integer, jsonb
) owner to postgres;

revoke all on function public.finalize_reto_camino_win_atomic(
  uuid, uuid, text, integer, jsonb
) from PUBLIC, anon, authenticated, service_role;

grant execute on function public.finalize_reto_camino_win_atomic(
  uuid, uuid, text, integer, jsonb
) to service_role;

-- ============================================================================
-- POSTFLIGHT
-- ============================================================================
do $postflight$
declare
  v_commit regprocedure;
  v_finalizer regprocedure;
  v_commit_owner text;
  v_finalizer_owner text;
  v_commit_secdef boolean;
  v_finalizer_secdef boolean;
  v_commit_config text[];
  v_finalizer_config text[];
  v_commit_def text;
  v_finalizer_def text;
begin
  v_commit := pg_catalog.to_regprocedure(
    'public.commit_reto_prize_answer_atomic(uuid,uuid,text,integer,uuid,boolean)'
  );
  v_finalizer := pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  );

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.proconfig,
    pg_catalog.pg_get_functiondef(p.oid)
  into
    v_commit_owner,
    v_commit_secdef,
    v_commit_config,
    v_commit_def
  from pg_catalog.pg_proc p
  where p.oid = v_commit;

  select
    pg_catalog.pg_get_userbyid(p.proowner),
    p.prosecdef,
    p.proconfig,
    pg_catalog.pg_get_functiondef(p.oid)
  into
    v_finalizer_owner,
    v_finalizer_secdef,
    v_finalizer_config,
    v_finalizer_def
  from pg_catalog.pg_proc p
  where p.oid = v_finalizer;

  if v_commit_owner <> 'postgres'
     or v_finalizer_owner <> 'postgres'
     or not v_commit_secdef
     or not v_finalizer_secdef
     or coalesce(pg_catalog.array_to_string(v_commit_config, ','), '') <> 'search_path=pg_catalog'
     or coalesce(pg_catalog.array_to_string(v_finalizer_config, ','), '') <> 'search_path=pg_catalog' then
    raise exception 'B2C_E5F10B2_POSTFLIGHT: security attributes invalid';
  end if;

  if pg_catalog.strpos(v_commit_def, 'pg_catalog.least(') <> 0
     or pg_catalog.strpos(v_commit_def, 'pg_catalog.greatest(') <> 0
     or pg_catalog.strpos(v_commit_def, 'least(v_position + v_roll, 30)') = 0
     or pg_catalog.strpos(v_commit_def, 'greatest(v_position - v_roll, 0)') = 0
     or pg_catalog.strpos(v_commit_def, 'greatest(0, v_turns_left - 1)') = 0 then
    raise exception 'B2C_E5F10B2_POSTFLIGHT: commit RPC repair missing';
  end if;

  if pg_catalog.strpos(
       pg_catalog.lower(v_finalizer_def),
       'on conflict (participant_id, award_year, award_quarter)'
     ) <> 0
     or pg_catalog.strpos(
          pg_catalog.lower(v_finalizer_def),
          'on conflict on constraint reto_camino_qualifiers_participant_period_uniq'
        ) = 0 then
    raise exception 'B2C_E5F10B2_POSTFLIGHT: finalizer repair missing';
  end if;

  if pg_catalog.has_function_privilege('anon', v_commit, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_commit, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_commit, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_finalizer, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_finalizer, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_finalizer, 'EXECUTE') then
    raise exception 'B2C_E5F10B2_POSTFLIGHT: function ACL invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    where p.oid in (v_commit::oid, v_finalizer::oid)
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception 'B2C_E5F10B2_POSTFLIGHT: PUBLIC EXECUTE present';
  end if;

  if pg_catalog.to_regprocedure(
       'public.recover_reto_prize_answer_replay(uuid,uuid,text,text,integer,uuid,boolean)'
     ) is not null then
    raise exception 'B2C_E5F10B2_POSTFLIGHT: replay recovery RPC appeared unexpectedly';
  end if;

  raise notice 'B2C_E5F10B2_POSTFLIGHT=PASS';
end
$postflight$;

commit;

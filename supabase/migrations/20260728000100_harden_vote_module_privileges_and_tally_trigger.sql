begin;

-- B-SEC-6: Harden vote module privileges and make the vote tally trigger
-- respond to group_code changes. This migration is intentionally defensive:
-- it checks the expected objects before changing privileges or the trigger.

do $$
declare
  v_table text;
  v_function text;
  v_policy_count integer;
  v_relrowsecurity boolean;
  v_relforcerowsecurity boolean;
  v_trigger_count integer;
  v_column_acl_details text;
  v_tables text[] := array[
    'public.vote_casts',
    'public.vote_intention_answers',
    'public.vote_intention_questions',
    'public.vote_parties',
    'public.vote_rounds',
    'public.vote_tally'
  ];
  v_functions text[] := array[
    'public.activate_current_month_round()',
    'public.create_monthly_vote_round()',
    'public.get_active_questions()',
    'public.has_user_answered_intention(text,uuid,uuid)',
    'public.vote_tally_apply()',
    'public.update_updated_at_column()'
  ];
begin
  foreach v_table in array v_tables loop
    if pg_catalog.to_regclass(v_table) is null then
      raise exception 'Required vote table is missing: %', v_table;
    end if;

    select c.relrowsecurity, c.relforcerowsecurity
      into v_relrowsecurity, v_relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = pg_catalog.to_regclass(v_table);

    if not coalesce(v_relrowsecurity, false) then
      raise exception 'Expected RLS to be enabled on %', v_table;
    end if;

    if coalesce(v_relforcerowsecurity, false) then
      raise exception 'Expected FORCE RLS to remain disabled on %', v_table;
    end if;

    select count(*)
      into v_policy_count
    from pg_catalog.pg_policy p
    where p.polrelid = pg_catalog.to_regclass(v_table);

    if v_policy_count <> 0 then
      raise exception 'Expected zero RLS policies on %, found %', v_table, v_policy_count;
    end if;
  end loop;

  foreach v_function in array v_functions loop
    if pg_catalog.to_regprocedure(v_function) is null then
      raise exception 'Required vote function is missing: %', v_function;
    end if;
  end loop;

  select pg_catalog.string_agg(
    n.nspname || '.' || c.relname || '.' || a.attname || ':' ||
    case when acl.grantee = 0 then 'public' else grantee_role.rolname end,
    ', ' order by n.nspname, c.relname, a.attnum, acl.grantee
  )
    into v_column_acl_details
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c
    on c.oid = a.attrelid
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(a.attacl) acl
  left join pg_catalog.pg_roles grantee_role
    on grantee_role.oid = acl.grantee
  where a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
    and n.nspname = 'public'
    and c.relname in (
      'vote_casts',
      'vote_intention_answers',
      'vote_intention_questions',
      'vote_parties',
      'vote_rounds',
      'vote_tally'
    )
    and (
      acl.grantee = 0
      or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
    );

  if v_column_acl_details is not null then
    raise exception 'Unexpected explicit column ACLs found before privilege hardening: %', v_column_acl_details;
  end if;

  select count(*)
    into v_trigger_count
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.vote_casts'::pg_catalog.regclass
    and t.tgname = 'trg_vote_casts_tally'
    and not t.tgisinternal;

  if v_trigger_count <> 1 then
    raise exception 'Expected exactly one non-internal trg_vote_casts_tally trigger, found %', v_trigger_count;
  end if;
end $$;

-- Remove direct table access for public browser roles.
revoke all privileges on table public.vote_rounds from public, anon, authenticated;
revoke all privileges on table public.vote_parties from public, anon, authenticated;
revoke all privileges on table public.vote_tally from public, anon, authenticated;
revoke all privileges on table public.vote_casts from public, anon, authenticated;
revoke all privileges on table public.vote_intention_answers from public, anon, authenticated;
revoke all privileges on table public.vote_intention_questions from public, anon, authenticated;

-- Normalize service_role table privileges to the runtime surface demonstrated by
-- the server endpoints and the vote tally trigger.
revoke all privileges on table public.vote_rounds from service_role;
revoke all privileges on table public.vote_parties from service_role;
revoke all privileges on table public.vote_tally from service_role;
revoke all privileges on table public.vote_casts from service_role;
revoke all privileges on table public.vote_intention_answers from service_role;
revoke all privileges on table public.vote_intention_questions from service_role;

grant select, insert, update on table public.vote_rounds to service_role;
grant select on table public.vote_parties to service_role;
grant select, insert, update on table public.vote_tally to service_role;
grant select, insert on table public.vote_casts to service_role;
grant select, insert, delete on table public.vote_intention_answers to service_role;
grant select on table public.vote_intention_questions to service_role;

-- Remove public execution of vote functions. Trigger functions do not require
-- direct EXECUTE for service_role when invoked by already-created triggers.
revoke execute on function public.activate_current_month_round() from public, anon, authenticated, service_role;
revoke execute on function public.create_monthly_vote_round() from public, anon, authenticated, service_role;
revoke execute on function public.get_active_questions() from public, anon, authenticated, service_role;
revoke execute on function public.has_user_answered_intention(text, uuid, uuid) from public, anon, authenticated, service_role;
revoke execute on function public.vote_tally_apply() from public, anon, authenticated, service_role;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated, service_role;

grant execute on function public.get_active_questions() to service_role;

-- Recreate only the vote tally trigger so updates to group_code also reconcile
-- public.vote_tally. The function body is intentionally unchanged.
drop trigger trg_vote_casts_tally on public.vote_casts;

create trigger trg_vote_casts_tally
after insert or delete or update of round_id, party_id, group_code
on public.vote_casts
for each row
execute function public.vote_tally_apply();

do $$
declare
  v_table text;
  v_role text;
  v_privilege text;
  v_function text;
  v_has_privilege boolean;
  v_should_have_privilege boolean;
  v_trigger_def text;
  v_trigger_type integer;
  v_trigger_function oid;
  v_trigger_enabled text;
  v_trigger_internal boolean;
  v_column_acl_details text;
  v_tables text[] := array[
    'public.vote_casts',
    'public.vote_intention_answers',
    'public.vote_intention_questions',
    'public.vote_parties',
    'public.vote_rounds',
    'public.vote_tally'
  ];
  v_public_roles text[] := array['public', 'anon', 'authenticated'];
  v_table_privileges text[] := array[
    'SELECT',
    'INSERT',
    'UPDATE',
    'DELETE',
    'TRUNCATE',
    'REFERENCES',
    'TRIGGER',
    'MAINTAIN'
  ];
  v_functions text[] := array[
    'public.activate_current_month_round()',
    'public.create_monthly_vote_round()',
    'public.get_active_questions()',
    'public.has_user_answered_intention(text,uuid,uuid)',
    'public.vote_tally_apply()',
    'public.update_updated_at_column()'
  ];
begin
  foreach v_table in array v_tables loop
    foreach v_role in array v_public_roles loop
      foreach v_privilege in array v_table_privileges loop
        if pg_catalog.has_table_privilege(v_role, v_table, v_privilege) then
          raise exception 'Unexpected % table privilege remains for role % on %', v_privilege, v_role, v_table;
        end if;
      end loop;
    end loop;

    foreach v_privilege in array v_table_privileges loop
      v_should_have_privilege :=
        case v_table
          when 'public.vote_rounds' then v_privilege in ('SELECT', 'INSERT', 'UPDATE')
          when 'public.vote_parties' then v_privilege in ('SELECT')
          when 'public.vote_tally' then v_privilege in ('SELECT', 'INSERT', 'UPDATE')
          when 'public.vote_casts' then v_privilege in ('SELECT', 'INSERT')
          when 'public.vote_intention_answers' then v_privilege in ('SELECT', 'INSERT', 'DELETE')
          when 'public.vote_intention_questions' then v_privilege in ('SELECT')
          else false
        end;

      v_has_privilege := pg_catalog.has_table_privilege('service_role', v_table, v_privilege);

      if v_should_have_privilege and not v_has_privilege then
        raise exception 'service_role lacks required % privilege on %', v_privilege, v_table;
      end if;

      if not v_should_have_privilege and v_has_privilege then
        raise exception 'service_role retains unauthorized % privilege on %', v_privilege, v_table;
      end if;
    end loop;
  end loop;

  foreach v_function in array v_functions loop
    foreach v_role in array v_public_roles loop
      if pg_catalog.has_function_privilege(v_role, v_function, 'EXECUTE') then
        raise exception 'Unexpected EXECUTE privilege remains for role % on function %', v_role, v_function;
      end if;
    end loop;

    v_should_have_privilege := v_function = 'public.get_active_questions()';
    v_has_privilege := pg_catalog.has_function_privilege('service_role', v_function, 'EXECUTE');

    if v_should_have_privilege and not v_has_privilege then
      raise exception 'service_role lacks required EXECUTE privilege on function %', v_function;
    end if;

    if not v_should_have_privilege and v_has_privilege then
      raise exception 'service_role retains unauthorized EXECUTE privilege on function %', v_function;
    end if;
  end loop;

  select pg_catalog.string_agg(
    n.nspname || '.' || c.relname || '.' || a.attname || ':' ||
    case when acl.grantee = 0 then 'public' else grantee_role.rolname end,
    ', ' order by n.nspname, c.relname, a.attnum, acl.grantee
  )
    into v_column_acl_details
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c
    on c.oid = a.attrelid
  join pg_catalog.pg_namespace n
    on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(a.attacl) acl
  left join pg_catalog.pg_roles grantee_role
    on grantee_role.oid = acl.grantee
  where a.attnum > 0
    and not a.attisdropped
    and a.attacl is not null
    and n.nspname = 'public'
    and c.relname in (
      'vote_casts',
      'vote_intention_answers',
      'vote_intention_questions',
      'vote_parties',
      'vote_rounds',
      'vote_tally'
    )
    and (
      acl.grantee = 0
      or grantee_role.rolname in ('anon', 'authenticated', 'service_role')
    );

  if v_column_acl_details is not null then
    raise exception 'Unexpected explicit column ACLs found after privilege hardening: %', v_column_acl_details;
  end if;

  select
    pg_catalog.lower(pg_catalog.pg_get_triggerdef(t.oid, true)),
    t.tgtype::integer,
    t.tgfoid,
    t.tgenabled::text,
    t.tgisinternal
  into v_trigger_def, v_trigger_type, v_trigger_function, v_trigger_enabled, v_trigger_internal
  from pg_catalog.pg_trigger t
  where t.tgrelid = 'public.vote_casts'::pg_catalog.regclass
    and t.tgname = 'trg_vote_casts_tally';

  if v_trigger_def is null then
    raise exception 'trg_vote_casts_tally was not recreated';
  end if;

  if v_trigger_enabled <> 'O' then
    raise exception 'trg_vote_casts_tally is not enabled normally';
  end if;

  if v_trigger_internal then
    raise exception 'trg_vote_casts_tally unexpectedly became an internal trigger';
  end if;

  if (v_trigger_type & 1) = 0 then
    raise exception 'trg_vote_casts_tally is not FOR EACH ROW';
  end if;

  if (v_trigger_type & 2) <> 0 then
    raise exception 'trg_vote_casts_tally unexpectedly became BEFORE trigger';
  end if;

  if (v_trigger_type & 64) <> 0 then
    raise exception 'trg_vote_casts_tally unexpectedly became INSTEAD OF trigger';
  end if;

  if (v_trigger_type & 4) = 0 then
    raise exception 'trg_vote_casts_tally no longer handles INSERT';
  end if;

  if (v_trigger_type & 8) = 0 then
    raise exception 'trg_vote_casts_tally no longer handles DELETE';
  end if;

  if (v_trigger_type & 16) = 0 then
    raise exception 'trg_vote_casts_tally no longer handles UPDATE';
  end if;

  if v_trigger_function <> pg_catalog.to_regprocedure('public.vote_tally_apply()') then
    raise exception 'trg_vote_casts_tally no longer points to public.vote_tally_apply()';
  end if;

  if pg_catalog.strpos(v_trigger_def, 'round_id') = 0 then
    raise exception 'trg_vote_casts_tally trigger definition does not include round_id';
  end if;

  if pg_catalog.strpos(v_trigger_def, 'party_id') = 0 then
    raise exception 'trg_vote_casts_tally trigger definition does not include party_id';
  end if;

  if pg_catalog.strpos(v_trigger_def, 'group_code') = 0 then
    raise exception 'trg_vote_casts_tally trigger definition does not include group_code';
  end if;

  if pg_catalog.strpos(v_trigger_def, 'vote_tally_apply') = 0 then
    raise exception 'trg_vote_casts_tally trigger definition does not include vote_tally_apply';
  end if;
end $$;

-- ALTER DEFAULT PRIVILEGES is intentionally left unchanged. Default privilege
-- hardening affects the wider public schema and remains pending for a global
-- audit outside this focused vote-module migration.

commit;

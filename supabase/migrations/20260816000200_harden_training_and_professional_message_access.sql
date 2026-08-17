begin;

do $$
declare
  v_policy_count integer;
begin
  if to_regclass('public.espacio_capacitaciones') is null then
    raise exception 'Missing public.espacio_capacitaciones';
  end if;

  if to_regclass('public.espacio_profesional_mensajes') is null then
    raise exception 'Missing public.espacio_profesional_mensajes';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'espacio_capacitaciones'
      and c.relkind = 'r'
  ) then
    raise exception 'RLS is not enabled on espacio_capacitaciones';
  end if;

  if not (
    select c.relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'espacio_profesional_mensajes'
      and c.relkind = 'r'
  ) then
    raise exception 'RLS is not enabled on espacio_profesional_mensajes';
  end if;

  select count(*)
    into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'espacio_capacitaciones',
      'espacio_profesional_mensajes'
    );

  if v_policy_count <> 0 then
    raise exception
      'Unexpected policies found on target tables: %',
      v_policy_count;
  end if;
end
$$;

revoke all privileges
on table public.espacio_capacitaciones
from public, anon, authenticated, service_role;

grant select, insert, update
on table public.espacio_capacitaciones
to service_role;

revoke all privileges
on table public.espacio_profesional_mensajes
from public, anon, authenticated, service_role;

grant select, insert
on table public.espacio_profesional_mensajes
to service_role;

do $$
begin
  if has_table_privilege(
    'anon',
    'public.espacio_capacitaciones',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception 'anon retains privileges on espacio_capacitaciones';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.espacio_capacitaciones',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception 'authenticated retains privileges on espacio_capacitaciones';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.espacio_capacitaciones',
    'SELECT'
  ) then
    raise exception 'service_role missing SELECT on espacio_capacitaciones';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.espacio_capacitaciones',
    'INSERT'
  ) then
    raise exception 'service_role missing INSERT on espacio_capacitaciones';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.espacio_capacitaciones',
    'UPDATE'
  ) then
    raise exception 'service_role missing UPDATE on espacio_capacitaciones';
  end if;

  if has_table_privilege(
    'service_role',
    'public.espacio_capacitaciones',
    'DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception 'service_role retains excessive privileges on espacio_capacitaciones';
  end if;

  if has_table_privilege(
    'anon',
    'public.espacio_profesional_mensajes',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception 'anon retains privileges on espacio_profesional_mensajes';
  end if;

  if has_table_privilege(
    'authenticated',
    'public.espacio_profesional_mensajes',
    'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception 'authenticated retains privileges on espacio_profesional_mensajes';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.espacio_profesional_mensajes',
    'SELECT'
  ) then
    raise exception 'service_role missing SELECT on espacio_profesional_mensajes';
  end if;

  if not has_table_privilege(
    'service_role',
    'public.espacio_profesional_mensajes',
    'INSERT'
  ) then
    raise exception 'service_role missing INSERT on espacio_profesional_mensajes';
  end if;

  if has_table_privilege(
    'service_role',
    'public.espacio_profesional_mensajes',
    'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception 'service_role retains excessive privileges on espacio_profesional_mensajes';
  end if;
end
$$;

commit;
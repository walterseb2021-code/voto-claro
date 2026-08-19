-- 20260819000100_harden_espacio_mensajes_access.sql
-- B-SEC-14HZP
-- Blindaje permanente de public.espacio_mensajes.
--
-- Preflight confirmado:
-- - 60 filas totales
-- - 15 legacy-no-thread
-- - 45 modernas
-- - RLS deshabilitado
-- - sin policies
-- - anon/authenticated/service_role con privilegios amplios
-- - tabla incluida en supabase_realtime
-- - service_role con BYPASSRLS
--
-- Arquitectura desplegada antes de esta migracion:
-- - 0 referencias client-side a espacio_mensajes
-- - todas las lecturas/escrituras pasan por APIs server-side
-- - service_role solo necesita SELECT + INSERT
--
-- Esta migracion NO modifica filas existentes.

begin;

do $guard$
declare
  v_total bigint;
  v_legacy bigint;
  v_modern bigint;
  v_pub_count integer;
begin
  if to_regclass('public.espacio_mensajes') is null then
    raise exception 'BSEC14HZP_ABORT: public.espacio_mensajes no existe';
  end if;

  if not exists (
    select 1
    from pg_roles
    where rolname = 'service_role'
      and rolbypassrls = true
  ) then
    raise exception 'BSEC14HZP_ABORT: service_role no existe o no tiene BYPASSRLS';
  end if;

  select count(*) into v_total
  from public.espacio_mensajes;

  select count(*) into v_legacy
  from public.espacio_mensajes
  where thread_key = 'legacy-no-thread';

  select count(*) into v_modern
  from public.espacio_mensajes
  where thread_key is not null
    and thread_key <> 'legacy-no-thread';

  if v_total <> 60 or v_legacy <> 15 or v_modern <> 45 then
    raise exception
      'BSEC14HZP_ABORT: conteos cambiaron (total %, legacy %, modern %)',
      v_total, v_legacy, v_modern;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'espacio_mensajes'
  ) then
    raise exception 'BSEC14HZP_ABORT: aparecieron policies inesperadas';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'espacio_mensajes'
      and c.relrowsecurity = true
  ) then
    raise exception 'BSEC14HZP_ABORT: RLS ya esta activo; estado cambio';
  end if;

  if not has_table_privilege(
       'anon',
       'public.espacio_mensajes',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
     or not has_table_privilege(
       'authenticated',
       'public.espacio_mensajes',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
     or not has_table_privilege(
       'service_role',
       'public.espacio_mensajes',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  then
    raise exception 'BSEC14HZP_ABORT: ACL inicial ya no coincide con preflight';
  end if;

  select count(*) into v_pub_count
  from pg_publication p
  join pg_publication_rel pr on pr.prpubid = p.oid
  join pg_class c on c.oid = pr.prrelid
  join pg_namespace n on n.oid = c.relnamespace
  where p.pubname = 'supabase_realtime'
    and n.nspname = 'public'
    and c.relname = 'espacio_mensajes';

  if v_pub_count <> 1 then
    raise exception
      'BSEC14HZP_ABORT: membresia exacta en supabase_realtime no es 1 (actual %)',
      v_pub_count;
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'espacio_mensajes'
      and not t.tgisinternal
  ) then
    raise exception 'BSEC14HZP_ABORT: aparecieron triggers de usuario inesperados';
  end if;
end
$guard$;

alter table public.espacio_mensajes
  enable row level security;

revoke all privileges
  on table public.espacio_mensajes
  from PUBLIC, anon, authenticated, service_role;

grant select, insert
  on table public.espacio_mensajes
  to service_role;

alter publication supabase_realtime
  drop table public.espacio_mensajes;

do $verify$
declare
  v_total bigint;
  v_legacy bigint;
  v_modern bigint;
begin
  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'espacio_mensajes'
      and c.relrowsecurity = true
  ) then
    raise exception 'BSEC14HZP_VERIFY: RLS no quedo activo';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'espacio_mensajes'
  ) then
    raise exception 'BSEC14HZP_VERIFY: no se esperaban policies';
  end if;

  if has_table_privilege(
       'anon',
       'public.espacio_mensajes',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
     or has_table_privilege(
       'authenticated',
       'public.espacio_mensajes',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  then
    raise exception 'BSEC14HZP_VERIFY: cliente conserva privilegios directos';
  end if;

  if exists (
    select 1
    from aclexplode(
      coalesce(
        (
          select c.relacl
          from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relname = 'espacio_mensajes'
        ),
        acldefault('r', 0)
      )
    ) a
    where a.grantee = 0
  ) then
    raise exception 'BSEC14HZP_VERIFY: PUBLIC conserva ACL directa';
  end if;

  if not has_table_privilege(
       'service_role',
       'public.espacio_mensajes',
       'SELECT'
     )
     or not has_table_privilege(
       'service_role',
       'public.espacio_mensajes',
       'INSERT'
     )
     or has_table_privilege(
       'service_role',
       'public.espacio_mensajes',
       'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  then
    raise exception 'BSEC14HZP_VERIFY: service_role no quedo exactamente en SELECT+INSERT';
  end if;

  if exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'espacio_mensajes'
  ) then
    raise exception 'BSEC14HZP_VERIFY: tabla sigue en supabase_realtime';
  end if;

  select count(*) into v_total
  from public.espacio_mensajes;

  select count(*) into v_legacy
  from public.espacio_mensajes
  where thread_key = 'legacy-no-thread';

  select count(*) into v_modern
  from public.espacio_mensajes
  where thread_key is not null
    and thread_key <> 'legacy-no-thread';

  if v_total <> 60 or v_legacy <> 15 or v_modern <> 45 then
    raise exception
      'BSEC14HZP_VERIFY: filas cambiaron (total %, legacy %, modern %)',
      v_total, v_legacy, v_modern;
  end if;
end
$verify$;

commit;
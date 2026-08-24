-- 20260824000100_harden_reto_prize_access.sql
-- B-SEC-14HAJB2B3-D3-B1
--
-- Migracion atomica en UNA sola sentencia DO.
-- Motivo: evitar depender de tablas temporales o de que el SQL Editor
-- conserve una transaccion explicita entre sentencias.
--
-- No borra filas, no elimina tablas y no elimina funciones.
-- Si cualquier preflight o postflight falla, la sentencia DO completa falla
-- y PostgreSQL revierte atomicamente todo lo ejecutado dentro de ella.

do $migration$
declare
  v_rg_before bigint;
  v_rpp_before bigint;
  v_rpw_before bigint;
  v_rcq_before bigint;
  v_owner text;
  v_prosecdef boolean;
  v_proconfig text[];
begin
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  perform pg_catalog.set_config('statement_timeout', '30s', true);

  -- --------------------------------------------------------------------------
  -- PREFLIGHT
  -- --------------------------------------------------------------------------
  if pg_catalog.to_regclass('public.reto_ganadores') is null then
    raise exception 'BSEC_D3B1_MISSING_TABLE: public.reto_ganadores';
  end if;

  if pg_catalog.to_regclass('public.reto_premio_participants') is null then
    raise exception 'BSEC_D3B1_MISSING_TABLE: public.reto_premio_participants';
  end if;

  if pg_catalog.to_regclass('public.reto_premio_winners') is null then
    raise exception 'BSEC_D3B1_MISSING_TABLE: public.reto_premio_winners';
  end if;

  if pg_catalog.to_regclass('public.reto_camino_qualifiers') is null then
    raise exception 'BSEC_D3B1_MISSING_TABLE: public.reto_camino_qualifiers';
  end if;

  if pg_catalog.to_regprocedure('public.get_reto_ganadores(text)') is null then
    raise exception 'BSEC_D3B1_MISSING_FUNCTION: public.get_reto_ganadores(text)';
  end if;

  if pg_catalog.to_regprocedure(
    'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)'
  ) is null then
    raise exception 'BSEC_D3B1_MISSING_FUNCTION: finalize_reto_principal_spin_atomic';
  end if;

  if pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  ) is null then
    raise exception 'BSEC_D3B1_MISSING_FUNCTION: finalize_reto_camino_win_atomic';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
      and rolbypassrls
  ) then
    raise exception 'BSEC_D3B1_SERVICE_ROLE_MUST_BYPASS_RLS';
  end if;

  -- Los finalizadores deben seguir siendo propiedad de postgres,
  -- SECURITY DEFINER y con search_path fijado.
  select pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    into v_owner, v_prosecdef, v_proconfig
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure(
    'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)'
  );

  if v_owner <> 'postgres'
     or not v_prosecdef
     or not (coalesce(v_proconfig, array[]::text[]) @> array['search_path=pg_catalog']::text[]) then
    raise exception 'BSEC_D3B1_PRINCIPAL_FINALIZER_PREFLIGHT_INVALID';
  end if;

  select pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    into v_owner, v_prosecdef, v_proconfig
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  );

  if v_owner <> 'postgres'
     or not v_prosecdef
     or not (coalesce(v_proconfig, array[]::text[]) @> array['search_path=pg_catalog']::text[]) then
    raise exception 'BSEC_D3B1_CAMINO_FINALIZER_PREFLIGHT_INVALID';
  end if;

  select count(*) into v_rg_before from public.reto_ganadores;
  select count(*) into v_rpp_before from public.reto_premio_participants;
  select count(*) into v_rpw_before from public.reto_premio_winners;
  select count(*) into v_rcq_before from public.reto_camino_qualifiers;

  -- --------------------------------------------------------------------------
  -- CHANGE
  -- --------------------------------------------------------------------------

  -- Legacy: conservar objeto y datos, pero sin acceso de runtime.
  execute 'alter table public.reto_ganadores enable row level security';
  execute 'revoke all privileges on table public.reto_ganadores from PUBLIC, anon, authenticated, service_role';
  execute 'revoke all privileges on function public.get_reto_ganadores(text) from PUBLIC, anon, authenticated, service_role';

  -- Legacy: conservar filas existentes, pero sin acceso de runtime.
  execute 'alter table public.reto_premio_participants enable row level security';
  execute 'revoke all privileges on table public.reto_premio_participants from PUBLIC, anon, authenticated, service_role';

  -- Tabla activa:
  -- - SELECT: API publica segura y admin, mediante service_role.
  -- - UPDATE: admin de ganadores, mediante service_role.
  -- - INSERT: solo dentro del finalizador SECURITY DEFINER propiedad postgres.
  execute 'alter table public.reto_premio_winners enable row level security';
  execute 'revoke all privileges on table public.reto_premio_winners from PUBLIC, anon, authenticated, service_role';
  execute 'grant select, update on table public.reto_premio_winners to service_role';

  -- --------------------------------------------------------------------------
  -- POSTFLIGHT
  -- --------------------------------------------------------------------------

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reto_ganadores'
  ) then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_ganadores RLS disabled';
  end if;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reto_premio_participants'
  ) then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_premio_participants RLS disabled';
  end if;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reto_premio_winners'
  ) then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_premio_winners RLS disabled';
  end if;

  -- Legacy tables: runtime sin CRUD.
  if pg_catalog.has_table_privilege('anon', 'public.reto_ganadores', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.reto_ganadores', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.reto_ganadores', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.reto_ganadores', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_ganadores', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_ganadores', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_ganadores', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_ganadores', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_ganadores', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_ganadores', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_ganadores', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_ganadores', 'DELETE') then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_ganadores runtime privilege remains';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.reto_premio_participants', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.reto_premio_participants', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.reto_premio_participants', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.reto_premio_participants', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_premio_participants', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_premio_participants', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_premio_participants', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_premio_participants', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_premio_participants', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_premio_participants', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_premio_participants', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_premio_participants', 'DELETE') then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_premio_participants runtime privilege remains';
  end if;

  -- Winners activa: anon/authenticated sin acceso directo.
  if pg_catalog.has_table_privilege('anon', 'public.reto_premio_winners', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.reto_premio_winners', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.reto_premio_winners', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.reto_premio_winners', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_premio_winners', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_premio_winners', 'INSERT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_premio_winners', 'UPDATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_premio_winners', 'DELETE') then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_premio_winners public privilege remains';
  end if;

  -- service_role: exactamente SELECT + UPDATE en la tabla activa.
  if not pg_catalog.has_table_privilege('service_role', 'public.reto_premio_winners', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.reto_premio_winners', 'UPDATE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_premio_winners', 'INSERT')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_premio_winners', 'DELETE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_premio_winners', 'TRUNCATE')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_premio_winners', 'REFERENCES')
     or pg_catalog.has_table_privilege('service_role', 'public.reto_premio_winners', 'TRIGGER') then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_premio_winners service_role privilege mismatch';
  end if;

  -- RPC legacy: no ejecutable por roles runtime.
  -- Si PUBLIC conservara EXECUTE, estas comprobaciones tambien devolverian true.
  if pg_catalog.has_function_privilege(
       'anon', 'public.get_reto_ganadores(text)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated', 'public.get_reto_ganadores(text)', 'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'service_role', 'public.get_reto_ganadores(text)', 'EXECUTE'
     ) then
    raise exception 'BSEC_D3B1_POSTFAIL: legacy RPC executable by runtime';
  end if;

  -- Finalizadores seguros: anon/authenticated no; service_role si.
  if pg_catalog.has_function_privilege(
       'anon',
       'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)',
       'EXECUTE'
     ) then
    raise exception 'BSEC_D3B1_POSTFAIL: principal finalizer ACL mismatch';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)',
       'EXECUTE'
     ) then
    raise exception 'BSEC_D3B1_POSTFAIL: camino finalizer ACL mismatch';
  end if;

  -- Verificar otra vez atributos criticos de los finalizadores.
  select pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    into v_owner, v_prosecdef, v_proconfig
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure(
    'public.finalize_reto_principal_spin_atomic(uuid,uuid,text,integer,smallint)'
  );

  if v_owner <> 'postgres'
     or not v_prosecdef
     or not (coalesce(v_proconfig, array[]::text[]) @> array['search_path=pg_catalog']::text[]) then
    raise exception 'BSEC_D3B1_POSTFAIL: principal finalizer attributes changed';
  end if;

  select pg_catalog.pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    into v_owner, v_prosecdef, v_proconfig
  from pg_catalog.pg_proc p
  where p.oid = pg_catalog.to_regprocedure(
    'public.finalize_reto_camino_win_atomic(uuid,uuid,text,integer,jsonb)'
  );

  if v_owner <> 'postgres'
     or not v_prosecdef
     or not (coalesce(v_proconfig, array[]::text[]) @> array['search_path=pg_catalog']::text[]) then
    raise exception 'BSEC_D3B1_POSTFAIL: camino finalizer attributes changed';
  end if;

  -- Camino ya endurecido no debe sufrir regresion.
  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'reto_camino_qualifiers'
  ) then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_camino_qualifiers RLS regression';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.reto_camino_qualifiers', 'SELECT')
     or pg_catalog.has_table_privilege('authenticated', 'public.reto_camino_qualifiers', 'SELECT')
     or not pg_catalog.has_table_privilege('service_role', 'public.reto_camino_qualifiers', 'SELECT') then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_camino_qualifiers ACL regression';
  end if;

  -- Ninguna fila debe cambiar durante esta migracion.
  if v_rg_before <> (select count(*) from public.reto_ganadores) then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_ganadores row count changed';
  end if;

  if v_rpp_before <> (select count(*) from public.reto_premio_participants) then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_premio_participants row count changed';
  end if;

  if v_rpw_before <> (select count(*) from public.reto_premio_winners) then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_premio_winners row count changed';
  end if;

  if v_rcq_before <> (select count(*) from public.reto_camino_qualifiers) then
    raise exception 'BSEC_D3B1_POSTFAIL: reto_camino_qualifiers row count changed';
  end if;
end
$migration$;

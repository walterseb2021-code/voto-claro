-- VOTO CLARO
-- B-SEC-14CY
-- Blindaje de public.project_evaluations.
--
-- Basado en:
-- - B-SEC-14CW: referencias actuales del repositorio.
-- - B-SEC-14CX: preflight live de RLS, ACL, columnas, secuencias y compatibilidad.
--
-- OBJETIVO:
-- 1. Activar RLS sin policies publicas.
-- 2. Revocar acceso directo de PUBLIC, anon y authenticated.
-- 3. Reducir service_role al minimo requerido: SELECT, INSERT.
-- 4. Preservar compatibilidad con el panel admin y close_project_cycle().
--
-- NO BORRA NI MODIFICA FILAS DE NEGOCIO.
-- NO modifica la definicion de close_project_cycle().
-- NO crea policies.
-- NO toca secuencias porque project_evaluations no depende de ninguna.

BEGIN;

DO $guard$
DECLARE
  v_table_oid oid;
  v_owner text;
  v_rls boolean;
  v_force_rls boolean;
  v_policy_count integer;
  v_close_oid oid;
  v_id_default text;
BEGIN
  v_table_oid := pg_catalog.to_regclass('public.project_evaluations');

  IF v_table_oid IS NULL THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: public.project_evaluations no existe';
  END IF;

  SELECT
    pg_catalog.pg_get_userbyid(c.relowner),
    c.relrowsecurity,
    c.relforcerowsecurity
  INTO
    v_owner,
    v_rls,
    v_force_rls
  FROM pg_catalog.pg_class c
  WHERE c.oid = v_table_oid
    AND c.relkind IN ('r','p');

  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: owner inesperado: %', v_owner;
  END IF;

  IF v_rls IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: RLS cambio desde B-SEC-14CX';
  END IF;

  IF v_force_rls IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: FORCE RLS cambio desde B-SEC-14CX';
  END IF;

  SELECT count(*)
  INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'project_evaluations';

  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: aparecieron policies desde B-SEC-14CX';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role'
      AND rolbypassrls = true
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: service_role no tiene BYPASSRLS';
  END IF;

  -- Preflight minimo: actualmente los tres roles deben poder SELECT/INSERT.
  -- Si esto cambio, se exige nuevo diagnostico antes de alterar ACL.
  IF NOT pg_catalog.has_table_privilege(
       'anon', 'public.project_evaluations', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'anon', 'public.project_evaluations', 'INSERT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.project_evaluations', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'authenticated', 'public.project_evaluations', 'INSERT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'service_role', 'public.project_evaluations', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'service_role', 'public.project_evaluations', 'INSERT'
     )
  THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: ACL base cambio desde B-SEC-14CX';
  END IF;

  -- El INSERT actual usa id por defecto gen_random_uuid(), sin identity/secuencia.
  SELECT pg_catalog.pg_get_expr(d.adbin, d.adrelid)
  INTO v_id_default
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attrelid = v_table_oid
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attidentity = ''
    AND a.attgenerated = '';

  IF v_id_default IS DISTINCT FROM 'gen_random_uuid()' THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: default de id cambio: %', v_id_default;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = v_table_oid
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND (a.attidentity <> '' OR a.attgenerated <> '')
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: aparecio columna identity/generated';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend dep
    JOIN pg_catalog.pg_class seq
      ON seq.oid = dep.objid
     AND seq.relkind = 'S'
    WHERE dep.refobjid = v_table_oid
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: aparecio dependencia de secuencia';
  END IF;

  v_close_oid := pg_catalog.to_regprocedure('public.close_project_cycle()');

  IF v_close_oid IS NULL THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: falta close_project_cycle()';
  END IF;

  IF (
    SELECT p.prosecdef
    FROM pg_catalog.pg_proc p
    WHERE p.oid = v_close_oid
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: close_project_cycle cambio SECURITY DEFINER/INVOKER';
  END IF;

  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(v_close_oid))
     <> '004ea3fc1d2f1dd89dac7d24d06c516d'
  THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: close_project_cycle cambio desde diagnostico';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.close_project_cycle()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CY_ABORT: service_role perdio EXECUTE sobre close_project_cycle';
  END IF;
END
$guard$;

ALTER TABLE public.project_evaluations ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
  ON TABLE public.project_evaluations
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT
  ON TABLE public.project_evaluations
  TO service_role;

DO $verify$
DECLARE
  v_table_oid oid;
  v_close_oid oid;
  v_public_acl_count integer;
  v_policy_count integer;
BEGIN
  v_table_oid := pg_catalog.to_regclass('public.project_evaluations');

  IF v_table_oid IS NULL THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: tabla desaparecio';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    WHERE c.oid = v_table_oid
      AND c.relrowsecurity = true
      AND c.relforcerowsecurity = false
      AND pg_catalog.pg_get_userbyid(c.relowner) = 'postgres'
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: estado RLS/owner inesperado';
  END IF;

  SELECT count(*)
  INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'project_evaluations';

  IF v_policy_count <> 0 THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: aparecieron policies inesperadas';
  END IF;

  -- PUBLIC es pseudo-role; se verifica por grantee=0 en ACL.
  SELECT count(*)
  INTO v_public_acl_count
  FROM pg_catalog.pg_class c
  CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) acl
  WHERE c.oid = v_table_oid
    AND acl.grantee = 0;

  IF v_public_acl_count <> 0 THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: PUBLIC conserva privilegios directos';
  END IF;

  IF pg_catalog.has_table_privilege(
       'anon', 'public.project_evaluations',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.project_evaluations',
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: cliente conserva privilegio directo';
  END IF;

  IF NOT pg_catalog.has_table_privilege(
       'service_role', 'public.project_evaluations', 'SELECT'
     )
     OR NOT pg_catalog.has_table_privilege(
       'service_role', 'public.project_evaluations', 'INSERT'
     )
  THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: service_role perdio SELECT/INSERT';
  END IF;

  IF pg_catalog.has_table_privilege(
       'service_role', 'public.project_evaluations',
       'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'
     )
  THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: service_role conserva privilegios excesivos';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'service_role'
      AND rolbypassrls = true
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: service_role perdio BYPASSRLS';
  END IF;

  v_close_oid := pg_catalog.to_regprocedure('public.close_project_cycle()');

  IF v_close_oid IS NULL THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: close_project_cycle desaparecio';
  END IF;

  IF pg_catalog.md5(pg_catalog.pg_get_functiondef(v_close_oid))
     <> '004ea3fc1d2f1dd89dac7d24d06c516d'
  THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: close_project_cycle fue modificado';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.close_project_cycle()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: EXECUTE de close_project_cycle se rompio';
  END IF;

  -- La migracion no debe modificar filas de negocio.
  IF (SELECT count(*) FROM public.project_evaluations) <> 1 THEN
    RAISE EXCEPTION 'B_SEC_14CY_VERIFY: row_count cambio desde B-SEC-14CX';
  END IF;
END
$verify$;

COMMIT;

-- VOTO CLARO
-- B-SEC-14CK
-- Contencion de policies publicas globales de Supabase Storage.
--
-- OBJETIVO:
-- 1. Eliminar policies PUBLIC globales con expresiones true sobre storage.objects.
-- 2. Preservar temporalmente los dos uploads legacy de Espacio Emprendedor.
-- 3. Limitar ese INSERT legacy a:
--      - bucket project_pdfs
--      - extension PDF
--      - prefijos profesionales/ y espacio-emprendedor/
-- 4. No modificar buckets, objetos, archivos ni policies scoped de solo-ganadores.
--
-- Esta migracion NO hace privado project_pdfs.
-- La migracion definitiva de los dos uploads legacy se hara en una fase posterior.

BEGIN;

DO $guard$
DECLARE
  v_objects_oid oid;
  v_rls boolean;
  v_count integer;
BEGIN
  v_objects_oid := pg_catalog.to_regclass('storage.objects');

  IF v_objects_oid IS NULL THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: storage.objects no existe';
  END IF;

  SELECT c.relrowsecurity
    INTO v_rls
  FROM pg_catalog.pg_class c
  WHERE c.oid = v_objects_oid;

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: storage.objects no tiene RLS activo';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets b
    WHERE b.id = 'project_pdfs'
      AND b.name = 'project_pdfs'
      AND b.public = true
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: bucket project_pdfs no coincide con preflight';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets b
    WHERE b.id = 'solo-ganadores'
      AND b.name = 'solo-ganadores'
      AND b.public = true
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: bucket solo-ganadores no coincide con preflight';
  END IF;

  SELECT count(*)
    INTO v_count
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'storage'
    AND p.tablename = 'objects'
    AND p.policyname = 'allow_insert'
    AND p.cmd = 'INSERT'
    AND p.roles = ARRAY['public'::name]
    AND p.qual IS NULL
    AND pg_catalog.btrim(p.with_check) IN ('true', '(true)');

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: allow_insert no coincide con preflight';
  END IF;

  SELECT count(*)
    INTO v_count
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'storage'
    AND p.tablename = 'objects'
    AND p.policyname = 'allow_select'
    AND p.cmd = 'SELECT'
    AND p.roles = ARRAY['public'::name]
    AND pg_catalog.btrim(p.qual) IN ('true', '(true)')
    AND p.with_check IS NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: allow_select no coincide con preflight';
  END IF;

  SELECT count(*)
    INTO v_count
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'storage'
    AND p.tablename = 'objects'
    AND p.policyname = 'allow_update'
    AND p.cmd = 'UPDATE'
    AND p.roles = ARRAY['public'::name]
    AND pg_catalog.btrim(p.qual) IN ('true', '(true)')
    AND pg_catalog.btrim(p.with_check) IN ('true', '(true)');

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: allow_update no coincide con preflight';
  END IF;

  SELECT count(*)
    INTO v_count
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'storage'
    AND p.tablename = 'objects'
    AND p.policyname = 'authenticated_insert fjbp5z_0'
    AND p.cmd = 'SELECT'
    AND p.roles = ARRAY['public'::name]
    AND pg_catalog.btrim(p.qual) IN ('true', '(true)')
    AND p.with_check IS NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: authenticated_insert fjbp5z_0 no coincide con preflight';
  END IF;

  SELECT count(*)
    INTO v_count
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'storage'
    AND p.tablename = 'objects'
    AND p.policyname = 'public_read fjbp5z_0'
    AND p.cmd = 'SELECT'
    AND p.roles = ARRAY['public'::name]
    AND pg_catalog.btrim(p.qual) IN ('true', '(true)')
    AND p.with_check IS NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: public_read fjbp5z_0 no coincide con preflight';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname = 'project_pdfs_legacy_public_insert_scoped'
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: policy nueva ya existe';
  END IF;

  -- Las policies scoped de solo-ganadores deben continuar presentes.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname = 'Public can read solo ganadores files'
      AND p.cmd = 'SELECT'
      AND p.qual LIKE '%solo-ganadores%'
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: falta policy SELECT scoped de solo-ganadores';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname = 'Authenticated can upload solo ganadores files'
      AND p.cmd = 'INSERT'
      AND p.with_check LIKE '%solo-ganadores%'
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_ABORT: falta policy INSERT scoped de solo-ganadores';
  END IF;
END
$guard$;

DROP POLICY "allow_insert" ON storage.objects;
DROP POLICY "allow_select" ON storage.objects;
DROP POLICY "allow_update" ON storage.objects;
DROP POLICY "authenticated_insert fjbp5z_0" ON storage.objects;
DROP POLICY "public_read fjbp5z_0" ON storage.objects;

CREATE POLICY "project_pdfs_legacy_public_insert_scoped"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'project_pdfs'
  AND pg_catalog.lower(storage.extension(name)) = 'pdf'
  AND (
    (storage.foldername(name))[1] = 'profesionales'
    OR (storage.foldername(name))[1] = 'espacio-emprendedor'
  )
);

DO $verify$
DECLARE
  v_count integer;
  v_with_check text;
BEGIN
  -- Ninguna de las cinco policies globales legacy puede sobrevivir.
  SELECT count(*)
    INTO v_count
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'storage'
    AND p.tablename = 'objects'
    AND p.policyname IN (
      'allow_insert',
      'allow_select',
      'allow_update',
      'authenticated_insert fjbp5z_0',
      'public_read fjbp5z_0'
    );

  IF v_count <> 0 THEN
    RAISE EXCEPTION 'B_SEC_14CK_VERIFY: sobrevivio una policy global legacy';
  END IF;

  SELECT count(*), max(p.with_check)
    INTO v_count, v_with_check
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'storage'
    AND p.tablename = 'objects'
    AND p.policyname = 'project_pdfs_legacy_public_insert_scoped'
    AND p.cmd = 'INSERT'
    AND p.roles = ARRAY['public'::name]
    AND p.qual IS NULL;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'B_SEC_14CK_VERIFY: policy scoped nueva ausente o invalida';
  END IF;

  IF v_with_check NOT LIKE '%project_pdfs%'
     OR v_with_check NOT LIKE '%profesionales%'
     OR v_with_check NOT LIKE '%espacio-emprendedor%'
     OR v_with_check NOT LIKE '%extension%'
     OR v_with_check LIKE '% = true%'
  THEN
    RAISE EXCEPTION 'B_SEC_14CK_VERIFY: expresion de policy scoped no coincide';
  END IF;

  -- No debe quedar ninguna policy PUBLIC de INSERT/SELECT/UPDATE/DELETE
  -- cuya expresion efectiva sea simplemente true.
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.roles = ARRAY['public'::name]
      AND (
        (p.cmd = 'SELECT' AND pg_catalog.btrim(coalesce(p.qual, '')) IN ('true', '(true)'))
        OR
        (p.cmd = 'INSERT' AND pg_catalog.btrim(coalesce(p.with_check, '')) IN ('true', '(true)'))
        OR
        (
          p.cmd = 'UPDATE'
          AND pg_catalog.btrim(coalesce(p.qual, '')) IN ('true', '(true)')
          AND pg_catalog.btrim(coalesce(p.with_check, '')) IN ('true', '(true)')
        )
        OR
        (p.cmd = 'DELETE' AND pg_catalog.btrim(coalesce(p.qual, '')) IN ('true', '(true)'))
      )
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_VERIFY: aun existe policy PUBLIC global true';
  END IF;

  -- Las policies de solo-ganadores no deben desaparecer.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname = 'Public can read solo ganadores files'
      AND p.cmd = 'SELECT'
      AND p.qual LIKE '%solo-ganadores%'
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_VERIFY: se rompio SELECT publico scoped de solo-ganadores';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies p
    WHERE p.schemaname = 'storage'
      AND p.tablename = 'objects'
      AND p.policyname = 'Authenticated can upload solo ganadores files'
      AND p.cmd = 'INSERT'
      AND p.with_check LIKE '%solo-ganadores%'
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_VERIFY: se rompio INSERT scoped de solo-ganadores';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets b
    WHERE b.id = 'project_pdfs'
      AND b.public = true
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_VERIFY: project_pdfs cambio inesperadamente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets b
    WHERE b.id = 'solo-ganadores'
      AND b.public = true
  ) THEN
    RAISE EXCEPTION 'B_SEC_14CK_VERIFY: solo-ganadores cambio inesperadamente';
  END IF;
END
$verify$;

COMMIT;

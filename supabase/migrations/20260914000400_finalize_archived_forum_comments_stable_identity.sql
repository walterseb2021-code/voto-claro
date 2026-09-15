-- ============================================================================
-- B-SEC FORUM COMMENTS
-- Fase 2 final: identidad estable obligatoria para nuevas inserciones.
--
-- Objetivos:
--   1. Conservar intactos los 8 comentarios historicos.
--   2. Hacer fail-closed el trigger de identidad estable.
--   3. Retirar los tres triggers legacy.
--   4. Retirar EXECUTE browser de las funciones legacy.
--   5. Mantener las funciones fisicamente por compatibilidad historica.
--   6. Mantener comment_access_participants para lectura historica/admin.
--
-- NO BACKFILL.
-- NO DELETE DE DATOS.
-- ============================================================================


-- ============================================================================
-- PREFLIGHT
-- ============================================================================

DO $$
DECLARE
    v_count integer;
    v_nullable text;
    v_rls boolean;
BEGIN
    -- ------------------------------------------------------------------------
    -- Datos historicos exactos.
    -- ------------------------------------------------------------------------

    SELECT COUNT(*)
    INTO v_count
    FROM public.archived_topic_forum_comments;

    IF v_count <> 8 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: total comments=% esperado=8',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.archived_topic_forum_comments
    WHERE project_participant_id IS NOT NULL;

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: stable rows=% esperado=0',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.archived_topic_forum_comments
    WHERE project_participant_id IS NULL
      AND access_participant_id IS NOT NULL;

    IF v_count <> 8 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: historical legacy rows=% esperado=8',
            v_count;
    END IF;


    -- ------------------------------------------------------------------------
    -- Columnas Fase 1.
    -- ------------------------------------------------------------------------

    SELECT is_nullable
    INTO v_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archived_topic_forum_comments'
      AND column_name = 'project_participant_id';

    IF v_nullable IS DISTINCT FROM 'YES' THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: project_participant_id nullable=%',
            v_nullable;
    END IF;

    SELECT is_nullable
    INTO v_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archived_topic_forum_comments'
      AND column_name = 'access_participant_id';

    IF v_nullable IS DISTINCT FROM 'YES' THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: access_participant_id nullable=%',
            v_nullable;
    END IF;


    -- ------------------------------------------------------------------------
    -- FK estable debe existir.
    -- ------------------------------------------------------------------------

    SELECT COUNT(*)
    INTO v_count
    FROM pg_constraint
    WHERE conrelid =
          'public.archived_topic_forum_comments'::regclass
      AND conname =
          'archived_topic_forum_comments_project_participant_id_fkey'
      AND contype = 'f';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: FK estable ausente.';
    END IF;


    -- ------------------------------------------------------------------------
    -- Estado exacto de triggers de Fase 1.
    -- ------------------------------------------------------------------------

    SELECT COUNT(*)
    INTO v_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.archived_topic_forum_comments'::regclass
      AND NOT tgisinternal;

    IF v_count <> 4 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: custom triggers=% esperado=4',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.archived_topic_forum_comments'::regclass
      AND NOT tgisinternal
      AND tgname =
          'trg_zz_vc_forum_secure_insert';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: secure phase1 trigger ausente.';
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.archived_topic_forum_comments'::regclass
      AND NOT tgisinternal
      AND tgname IN (
          'trg_block_forum_bad_words',
          'trg_limit_forum_comments_per_day',
          'trg_prevent_forum_comment_flood'
      );

    IF v_count <> 3 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: legacy triggers=% esperado=3',
            v_count;
    END IF;


    -- ------------------------------------------------------------------------
    -- Funciones que vamos a endurecer deben existir.
    -- ------------------------------------------------------------------------

    IF to_regprocedure(
        'public.vc_secure_archived_forum_comment_insert()'
    ) IS NULL THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: secure trigger function ausente.';
    END IF;

    IF to_regprocedure(
        'public.can_user_comment(uuid)'
    ) IS NULL THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: can_user_comment ausente.';
    END IF;

    IF to_regprocedure(
        'public.block_forum_bad_words()'
    ) IS NULL THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: block_forum_bad_words ausente.';
    END IF;

    IF to_regprocedure(
        'public.limit_forum_comments_per_day()'
    ) IS NULL THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: limit_forum_comments_per_day ausente.';
    END IF;

    IF to_regprocedure(
        'public.prevent_forum_comment_flood()'
    ) IS NULL THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: prevent_forum_comment_flood ausente.';
    END IF;


    -- ------------------------------------------------------------------------
    -- Sin policies y RLS habilitado.
    -- ------------------------------------------------------------------------

    SELECT COUNT(*)
    INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename =
          'archived_topic_forum_comments';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: policies=% esperado=0',
            v_count;
    END IF;

    SELECT relrowsecurity
    INTO v_rls
    FROM pg_class
    WHERE oid =
          'public.archived_topic_forum_comments'::regclass;

    IF v_rls IS DISTINCT FROM true THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: RLS no esta habilitado.';
    END IF;


    -- ------------------------------------------------------------------------
    -- Browser sigue sin acceso directo a la tabla.
    -- ------------------------------------------------------------------------

    IF
        has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'SELECT'
        )
        OR has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'INSERT'
        )
        OR has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'UPDATE'
        )
        OR has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'DELETE'
        )
        OR has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'SELECT'
        )
        OR has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'INSERT'
        )
        OR has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'UPDATE'
        )
        OR has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'DELETE'
        )
    THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: browser table privileges inesperados.';
    END IF;

    IF NOT has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'INSERT'
    ) THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2: service_role sin INSERT.';
    END IF;
END
$$;


-- ============================================================================
-- 1. RETIRAR TRIGGERS LEGACY
-- ============================================================================

DROP TRIGGER trg_block_forum_bad_words
ON public.archived_topic_forum_comments;

DROP TRIGGER trg_limit_forum_comments_per_day
ON public.archived_topic_forum_comments;

DROP TRIGGER trg_prevent_forum_comment_flood
ON public.archived_topic_forum_comments;


-- ============================================================================
-- 2. TRIGGER SEGURO FINAL - FAIL CLOSED
--
-- project_participant_id permanece nullable fisicamente porque existen
-- 8 filas historicas que no pueden ser backfilleadas con seguridad.
--
-- Para toda NUEVA insercion, la identidad estable es obligatoria.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.vc_secure_archived_forum_comment_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_trusted_device_id text;
    v_last_comment_at timestamptz;
    v_hourly_count integer;
    v_daily_count integer;
BEGIN
    -- ------------------------------------------------------------------------
    -- FAIL CLOSED:
    -- ningun nuevo comentario puede entrar por identidad legacy.
    -- ------------------------------------------------------------------------

    IF NEW.project_participant_id IS NULL THEN
        RAISE EXCEPTION 'FORUM_STABLE_IDENTITY_REQUIRED';
    END IF;


    -- ------------------------------------------------------------------------
    -- Identidad estable real y serializacion por participante.
    -- ------------------------------------------------------------------------

    SELECT NULLIF(BTRIM(p.device_id), '')
    INTO v_trusted_device_id
    FROM public.project_participants p
    WHERE p.id = NEW.project_participant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORUM_PARTICIPANT_NOT_FOUND';
    END IF;


    -- ------------------------------------------------------------------------
    -- Campos de identidad derivados del servidor/DB.
    -- ------------------------------------------------------------------------

    NEW.access_participant_id := NULL;
    NEW.device_id := v_trusted_device_id;

    NEW.group_code :=
        COALESCE(
            NULLIF(BTRIM(NEW.group_code), ''),
            'GENERAL'
        );


    -- ------------------------------------------------------------------------
    -- Normalizacion del mensaje.
    -- ------------------------------------------------------------------------

    NEW.message :=
        BTRIM(
            REGEXP_REPLACE(
                COALESCE(NEW.message, ''),
                '[[:space:]]+',
                ' ',
                'g'
            )
        );


    -- ------------------------------------------------------------------------
    -- Validacion de mensaje.
    -- ------------------------------------------------------------------------

    IF
        CHAR_LENGTH(NEW.message) < 1
        OR CHAR_LENGTH(NEW.message) > 500
    THEN
        RAISE EXCEPTION 'FORUM_MESSAGE_INVALID';
    END IF;

    IF NEW.message ~* '(https?://|www\.)' THEN
        RAISE EXCEPTION 'FORUM_LINKS_NOT_ALLOWED';
    END IF;

    IF public.vc_has_banned_words(NEW.message) THEN
        RAISE EXCEPTION 'FORUM_BAD_WORDS_BLOCKED';
    END IF;


    -- ------------------------------------------------------------------------
    -- Solo tema archivado.
    -- ------------------------------------------------------------------------

    PERFORM 1
    FROM public.weekly_topics wt
    WHERE wt.id = NEW.weekly_topic_id
      AND wt.status = 'archived'
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORUM_TOPIC_NOT_ARCHIVED';
    END IF;


    -- ------------------------------------------------------------------------
    -- Flood: 20 segundos por identidad estable.
    -- ------------------------------------------------------------------------

    SELECT MAX(f.created_at)
    INTO v_last_comment_at
    FROM public.archived_topic_forum_comments f
    WHERE f.project_participant_id =
          NEW.project_participant_id;

    IF
        v_last_comment_at IS NOT NULL
        AND v_last_comment_at >
            NOW() - INTERVAL '20 seconds'
    THEN
        RAISE EXCEPTION 'FORUM_FLOOD_BLOCKED';
    END IF;


    -- ------------------------------------------------------------------------
    -- Maximo 5 por hora por identidad estable.
    -- ------------------------------------------------------------------------

    SELECT COUNT(*)
    INTO v_hourly_count
    FROM public.archived_topic_forum_comments f
    WHERE f.project_participant_id =
          NEW.project_participant_id
      AND f.created_at >
          NOW() - INTERVAL '1 hour';

    IF v_hourly_count >= 5 THEN
        RAISE EXCEPTION 'FORUM_HOURLY_LIMIT_REACHED';
    END IF;


    -- ------------------------------------------------------------------------
    -- Maximo 20 por dia por identidad estable.
    -- ------------------------------------------------------------------------

    SELECT COUNT(*)
    INTO v_daily_count
    FROM public.archived_topic_forum_comments f
    WHERE f.project_participant_id =
          NEW.project_participant_id
      AND f.created_at >=
          DATE_TRUNC('day', NOW());

    IF v_daily_count >= 20 THEN
        RAISE EXCEPTION 'FORUM_DAILY_LIMIT_REACHED';
    END IF;


    -- ------------------------------------------------------------------------
    -- Estado controlado por DB.
    -- ------------------------------------------------------------------------

    NEW.status := 'published';

    RETURN NEW;
END
$$;

ALTER FUNCTION public.vc_secure_archived_forum_comment_insert()
    OWNER TO postgres;

REVOKE ALL
ON FUNCTION public.vc_secure_archived_forum_comment_insert()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.vc_secure_archived_forum_comment_insert()
FROM anon;

REVOKE ALL
ON FUNCTION public.vc_secure_archived_forum_comment_insert()
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.vc_secure_archived_forum_comment_insert()
TO service_role;


-- ============================================================================
-- 3. RENOMBRAR TRIGGER SEGURO COMO TRIGGER FINAL
-- ============================================================================

ALTER TRIGGER trg_zz_vc_forum_secure_insert
ON public.archived_topic_forum_comments
RENAME TO trg_vc_forum_secure_insert;


-- ============================================================================
-- 4. CERRAR FUNCIONES LEGACY AL NAVEGADOR
--
-- Se conservan fisicamente. No se eliminan en esta migracion.
-- service_role mantiene EXECUTE para evitar cambios colaterales.
-- ============================================================================

REVOKE ALL
ON FUNCTION public.can_user_comment(uuid)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.can_user_comment(uuid)
FROM anon;

REVOKE ALL
ON FUNCTION public.can_user_comment(uuid)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.can_user_comment(uuid)
TO service_role;


REVOKE ALL
ON FUNCTION public.block_forum_bad_words()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.block_forum_bad_words()
FROM anon;

REVOKE ALL
ON FUNCTION public.block_forum_bad_words()
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.block_forum_bad_words()
TO service_role;


REVOKE ALL
ON FUNCTION public.limit_forum_comments_per_day()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.limit_forum_comments_per_day()
FROM anon;

REVOKE ALL
ON FUNCTION public.limit_forum_comments_per_day()
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.limit_forum_comments_per_day()
TO service_role;


REVOKE ALL
ON FUNCTION public.prevent_forum_comment_flood()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.prevent_forum_comment_flood()
FROM anon;

REVOKE ALL
ON FUNCTION public.prevent_forum_comment_flood()
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.prevent_forum_comment_flood()
TO service_role;


-- ============================================================================
-- POSTFLIGHT FINAL
-- ============================================================================

DO $$
DECLARE
    v_count integer;
    v_nullable text;
    v_rls boolean;
BEGIN
    -- ------------------------------------------------------------------------
    -- Historicos intactos.
    -- ------------------------------------------------------------------------

    SELECT COUNT(*)
    INTO v_count
    FROM public.archived_topic_forum_comments;

    IF v_count <> 8 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: total=% esperado=8',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.archived_topic_forum_comments
    WHERE project_participant_id IS NOT NULL;

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: stable rows=% esperado=0',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.archived_topic_forum_comments
    WHERE project_participant_id IS NULL
      AND access_participant_id IS NOT NULL;

    IF v_count <> 8 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: historical rows=% esperado=8',
            v_count;
    END IF;


    -- ------------------------------------------------------------------------
    -- Columnas historicamente compatibles.
    -- ------------------------------------------------------------------------

    SELECT is_nullable
    INTO v_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archived_topic_forum_comments'
      AND column_name = 'project_participant_id';

    IF v_nullable IS DISTINCT FROM 'YES' THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: stable id nullable=%',
            v_nullable;
    END IF;

    SELECT is_nullable
    INTO v_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archived_topic_forum_comments'
      AND column_name = 'access_participant_id';

    IF v_nullable IS DISTINCT FROM 'YES' THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: legacy id nullable=%',
            v_nullable;
    END IF;


    -- ------------------------------------------------------------------------
    -- Solo un trigger custom: el seguro final.
    -- ------------------------------------------------------------------------

    SELECT COUNT(*)
    INTO v_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.archived_topic_forum_comments'::regclass
      AND NOT tgisinternal;

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: custom triggers=% esperado=1',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.archived_topic_forum_comments'::regclass
      AND NOT tgisinternal
      AND tgname =
          'trg_vc_forum_secure_insert';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: final secure trigger ausente.';
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.archived_topic_forum_comments'::regclass
      AND NOT tgisinternal
      AND tgname IN (
          'trg_zz_vc_forum_secure_insert',
          'trg_block_forum_bad_words',
          'trg_limit_forum_comments_per_day',
          'trg_prevent_forum_comment_flood'
      );

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: triggers legacy residuales=%',
            v_count;
    END IF;


    -- ------------------------------------------------------------------------
    -- Sin policies; RLS sigue activo.
    -- ------------------------------------------------------------------------

    SELECT COUNT(*)
    INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename =
          'archived_topic_forum_comments';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: policies=% esperado=0',
            v_count;
    END IF;

    SELECT relrowsecurity
    INTO v_rls
    FROM pg_class
    WHERE oid =
          'public.archived_topic_forum_comments'::regclass;

    IF v_rls IS DISTINCT FROM true THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: RLS deshabilitado.';
    END IF;


    -- ------------------------------------------------------------------------
    -- Browser continua sin DML directo.
    -- ------------------------------------------------------------------------

    IF
        has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'SELECT'
        )
        OR has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'INSERT'
        )
        OR has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'UPDATE'
        )
        OR has_table_privilege(
            'anon',
            'public.archived_topic_forum_comments',
            'DELETE'
        )
        OR has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'SELECT'
        )
        OR has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'INSERT'
        )
        OR has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'UPDATE'
        )
        OR has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'DELETE'
        )
    THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: browser table privileges inesperados.';
    END IF;

    IF NOT has_table_privilege(
        'service_role',
        'public.archived_topic_forum_comments',
        'INSERT'
    ) THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: service_role perdio INSERT.';
    END IF;


    -- ------------------------------------------------------------------------
    -- Funcion segura cerrada al browser.
    -- ------------------------------------------------------------------------

    IF has_function_privilege(
        'anon',
        'public.vc_secure_archived_forum_comment_insert()',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: anon ejecuta secure trigger function.';
    END IF;

    IF has_function_privilege(
        'authenticated',
        'public.vc_secure_archived_forum_comment_insert()',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: authenticated ejecuta secure trigger function.';
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'public.vc_secure_archived_forum_comment_insert()',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: service_role sin secure function.';
    END IF;


    -- ------------------------------------------------------------------------
    -- Funciones legacy cerradas a anon/authenticated.
    -- ------------------------------------------------------------------------

    IF
        has_function_privilege(
            'anon',
            'public.can_user_comment(uuid)',
            'EXECUTE'
        )
        OR has_function_privilege(
            'authenticated',
            'public.can_user_comment(uuid)',
            'EXECUTE'
        )
        OR has_function_privilege(
            'anon',
            'public.block_forum_bad_words()',
            'EXECUTE'
        )
        OR has_function_privilege(
            'authenticated',
            'public.block_forum_bad_words()',
            'EXECUTE'
        )
        OR has_function_privilege(
            'anon',
            'public.limit_forum_comments_per_day()',
            'EXECUTE'
        )
        OR has_function_privilege(
            'authenticated',
            'public.limit_forum_comments_per_day()',
            'EXECUTE'
        )
        OR has_function_privilege(
            'anon',
            'public.prevent_forum_comment_flood()',
            'EXECUTE'
        )
        OR has_function_privilege(
            'authenticated',
            'public.prevent_forum_comment_flood()',
            'EXECUTE'
        )
    THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: legacy EXECUTE browser residual.';
    END IF;


    -- ------------------------------------------------------------------------
    -- service_role se conserva para minimizar impacto colateral.
    -- ------------------------------------------------------------------------

    IF NOT (
        has_function_privilege(
            'service_role',
            'public.can_user_comment(uuid)',
            'EXECUTE'
        )
        AND has_function_privilege(
            'service_role',
            'public.block_forum_bad_words()',
            'EXECUTE'
        )
        AND has_function_privilege(
            'service_role',
            'public.limit_forum_comments_per_day()',
            'EXECUTE'
        )
        AND has_function_privilege(
            'service_role',
            'public.prevent_forum_comment_flood()',
            'EXECUTE'
        )
    ) THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE2 POST: service_role legacy EXECUTE inesperado.';
    END IF;
END
$$;
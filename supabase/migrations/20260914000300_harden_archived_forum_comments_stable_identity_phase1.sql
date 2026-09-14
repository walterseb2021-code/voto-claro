-- ============================================================================
-- B-SEC FORUM COMMENTS
-- Fase 1: identidad estable compatible con datos y codigo legacy.
--
-- Objetivos:
--   1. Agregar project_participant_id sin backfill historico.
--   2. Permitir futuros comentarios estables sin access_participant_id.
--   3. Mantener intactos los 8 comentarios historicos.
--   4. Mantener temporalmente los 3 triggers legacy.
--   5. Proteger nuevas inserciones estables con bloqueo por participante.
--
-- IMPORTANTE:
--   - NO elimina comment_access_participants.
--   - NO modifica filas historicas.
--   - NO retira todavia funciones/triggers legacy.
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
    -- Estado de datos esperado.
    SELECT COUNT(*)
    INTO v_count
    FROM public.archived_topic_forum_comments;

    IF v_count <> 8 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1: forum comments=% esperado=8',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.comment_access_participants;

    IF v_count <> 13 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1: access participants=% esperado=13',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.project_participants;

    IF v_count <> 22 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1: project participants=% esperado=22',
            v_count;
    END IF;

    -- La columna estable todavia no debe existir.
    SELECT COUNT(*)
    INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archived_topic_forum_comments'
      AND column_name = 'project_participant_id';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1: project_participant_id ya existe.';
    END IF;

    -- access_participant_id debe seguir NOT NULL antes de la migracion.
    SELECT is_nullable
    INTO v_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archived_topic_forum_comments'
      AND column_name = 'access_participant_id';

    IF v_nullable IS DISTINCT FROM 'NO' THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1: access_participant_id nullable inesperado=%',
            v_nullable;
    END IF;

    -- Exactamente los tres triggers legacy conocidos.
    SELECT COUNT(*)
    INTO v_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.archived_topic_forum_comments'::regclass
      AND NOT tgisinternal;

    IF v_count <> 3 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1: custom triggers=% esperado=3',
            v_count;
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
            'ABORT FORUM PHASE1: triggers legacy esperados no coinciden.';
    END IF;

    -- Sin policies.
    SELECT COUNT(*)
    INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'archived_topic_forum_comments';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1: policies inesperadas=%',
            v_count;
    END IF;

    -- RLS debe permanecer habilitado.
    SELECT relrowsecurity
    INTO v_rls
    FROM pg_class
    WHERE oid =
        'public.archived_topic_forum_comments'::regclass;

    IF v_rls IS DISTINCT FROM true THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1: RLS no esta habilitado.';
    END IF;

    -- El navegador no debe tener DML directo.
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
            'ABORT FORUM PHASE1: privilegios browser inesperados.';
    END IF;
END
$$;

-- ============================================================================
-- 1. IDENTIDAD ESTABLE
-- ============================================================================

ALTER TABLE public.archived_topic_forum_comments
    ADD COLUMN project_participant_id uuid NULL;

ALTER TABLE public.archived_topic_forum_comments
    ALTER COLUMN access_participant_id DROP NOT NULL;

ALTER TABLE public.archived_topic_forum_comments
    ADD CONSTRAINT archived_topic_forum_comments_project_participant_id_fkey
    FOREIGN KEY (project_participant_id)
    REFERENCES public.project_participants(id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT;

CREATE INDEX idx_archived_forum_project_participant_created
    ON public.archived_topic_forum_comments
       (project_participant_id, created_at DESC)
    WHERE project_participant_id IS NOT NULL;

-- ============================================================================
-- 2. TRIGGER SEGURO PARA NUEVAS INSERCIONES ESTABLES
--
-- Fase 1 es deliberadamente compatible:
-- si project_participant_id es NULL, deja actuar el flujo legacy.
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
    -- --------------------------------------------------------
    -- Compatibilidad Fase 1:
    -- los inserts legacy siguen usando access_participant_id.
    -- --------------------------------------------------------
    IF NEW.project_participant_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- --------------------------------------------------------
    -- Participante estable obligatorio y bloqueo por identidad.
    -- Serializa inserciones concurrentes del mismo participante.
    -- --------------------------------------------------------
    SELECT NULLIF(BTRIM(p.device_id), '')
    INTO v_trusted_device_id
    FROM public.project_participants p
    WHERE p.id = NEW.project_participant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORUM_PARTICIPANT_NOT_FOUND';
    END IF;

    -- --------------------------------------------------------
    -- La identidad legacy nunca decide la identidad estable.
    -- --------------------------------------------------------
    NEW.access_participant_id := NULL;
    NEW.device_id := v_trusted_device_id;

    NEW.group_code :=
        COALESCE(
            NULLIF(BTRIM(NEW.group_code), ''),
            'GENERAL'
        );

    NEW.message :=
        BTRIM(
            REGEXP_REPLACE(
                COALESCE(NEW.message, ''),
                '[[:space:]]+',
                ' ',
                'g'
            )
        );

    -- --------------------------------------------------------
    -- Validacion de mensaje.
    -- --------------------------------------------------------
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

    -- --------------------------------------------------------
    -- Solo temas archivados pueden recibir comentarios de foro.
    -- --------------------------------------------------------
    PERFORM 1
    FROM public.weekly_topics wt
    WHERE wt.id = NEW.weekly_topic_id
      AND wt.status = 'archived'
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FORUM_TOPIC_NOT_ARCHIVED';
    END IF;

    -- --------------------------------------------------------
    -- Flood: 20 segundos.
    -- El row lock del participante hace atomica esta comprobacion
    -- respecto de otros inserts estables del mismo participante.
    -- --------------------------------------------------------
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

    -- --------------------------------------------------------
    -- Maximo 5 comentarios por hora.
    -- --------------------------------------------------------
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

    -- --------------------------------------------------------
    -- Maximo 20 comentarios por dia.
    -- --------------------------------------------------------
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

CREATE TRIGGER trg_zz_vc_forum_secure_insert
BEFORE INSERT
ON public.archived_topic_forum_comments
FOR EACH ROW
EXECUTE FUNCTION public.vc_secure_archived_forum_comment_insert();

-- ============================================================================
-- POSTFLIGHT ESTRUCTURAL
-- ============================================================================

DO $$
DECLARE
    v_count integer;
    v_nullable text;
BEGIN
    -- Los datos historicos deben permanecer exactamente iguales.
    SELECT COUNT(*)
    INTO v_count
    FROM public.archived_topic_forum_comments;

    IF v_count <> 8 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1 POST: comments=% esperado=8',
            v_count;
    END IF;

    SELECT COUNT(*)
    INTO v_count
    FROM public.archived_topic_forum_comments
    WHERE project_participant_id IS NOT NULL;

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1 POST: se modificaron identidades historicas.';
    END IF;

    -- Nueva columna.
    SELECT COUNT(*)
    INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archived_topic_forum_comments'
      AND column_name = 'project_participant_id';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1 POST: project_participant_id ausente.';
    END IF;

    -- access_participant_id ahora debe ser nullable.
    SELECT is_nullable
    INTO v_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'archived_topic_forum_comments'
      AND column_name = 'access_participant_id';

    IF v_nullable IS DISTINCT FROM 'YES' THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1 POST: access_participant_id no quedo nullable.';
    END IF;

    -- FK estable.
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
            'ABORT FORUM PHASE1 POST: FK estable ausente.';
    END IF;

    -- Trigger seguro nuevo.
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
            'ABORT FORUM PHASE1 POST: trigger seguro ausente.';
    END IF;

    -- Tres legacy + uno seguro.
    SELECT COUNT(*)
    INTO v_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.archived_topic_forum_comments'::regclass
      AND NOT tgisinternal;

    IF v_count <> 4 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1 POST: custom triggers=% esperado=4',
            v_count;
    END IF;

    -- Sin policies.
    SELECT COUNT(*)
    INTO v_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename =
          'archived_topic_forum_comments';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1 POST: policies inesperadas.';
    END IF;

    -- Browser sigue sin DML directo.
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
            'authenticated',
            'public.archived_topic_forum_comments',
            'SELECT'
        )
        OR has_table_privilege(
            'authenticated',
            'public.archived_topic_forum_comments',
            'INSERT'
        )
    THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1 POST: privilegios browser inesperados.';
    END IF;

    -- Trigger function no expuesta al navegador.
    IF
        has_function_privilege(
            'anon',
            'public.vc_secure_archived_forum_comment_insert()',
            'EXECUTE'
        )
        OR has_function_privilege(
            'authenticated',
            'public.vc_secure_archived_forum_comment_insert()',
            'EXECUTE'
        )
    THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1 POST: trigger function expuesta.';
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'public.vc_secure_archived_forum_comment_insert()',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION
            'ABORT FORUM PHASE1 POST: service_role sin EXECUTE.';
    END IF;
END
$$;
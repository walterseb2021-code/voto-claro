-- ============================================================================
-- B-SEC COMMENT AWARDS
-- Stable identity and server-authoritative award identity
-- ============================================================================

DO $$
DECLARE
    v_awards bigint;
    v_triggers integer;
    v_policies integer;
    v_unique_indexes integer;
    v_comment_fks integer;
BEGIN
    IF to_regclass('public.comment_awards') IS NULL THEN
        RAISE EXCEPTION 'COMMENT_AWARDS_TABLE_MISSING';
    END IF;

    IF to_regclass('public.user_comments') IS NULL THEN
        RAISE EXCEPTION 'USER_COMMENTS_TABLE_MISSING';
    END IF;

    IF to_regclass('public.project_participants') IS NULL THEN
        RAISE EXCEPTION 'PROJECT_PARTICIPANTS_TABLE_MISSING';
    END IF;

    SELECT COUNT(*)
    INTO v_awards
    FROM public.comment_awards;

    IF v_awards <> 0 THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_PREFLIGHT_ROWS_CHANGED:%',
            v_awards;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'comment_awards'
          AND column_name = 'project_participant_id'
    ) THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_PROJECT_PARTICIPANT_ALREADY_EXISTS';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_comments'
          AND column_name = 'project_participant_id'
    ) THEN
        RAISE EXCEPTION
            'USER_COMMENTS_STABLE_IDENTITY_MISSING';
    END IF;

    SELECT COUNT(*)
    INTO v_triggers
    FROM pg_trigger
    WHERE tgrelid = 'public.comment_awards'::regclass
      AND NOT tgisinternal;

    IF v_triggers <> 0 THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_UNEXPECTED_TRIGGERS:%',
            v_triggers;
    END IF;

    SELECT COUNT(*)
    INTO v_policies
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comment_awards';

    IF v_policies <> 0 THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_UNEXPECTED_POLICIES:%',
            v_policies;
    END IF;

    IF NOT (
        SELECT relrowsecurity
        FROM pg_class
        WHERE oid = 'public.comment_awards'::regclass
    ) THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_RLS_DISABLED';
    END IF;

    IF
        has_table_privilege(
            'anon',
            'public.comment_awards',
            'SELECT'
        )
        OR
        has_table_privilege(
            'anon',
            'public.comment_awards',
            'INSERT'
        )
        OR
        has_table_privilege(
            'anon',
            'public.comment_awards',
            'UPDATE'
        )
        OR
        has_table_privilege(
            'anon',
            'public.comment_awards',
            'DELETE'
        )
        OR
        has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'SELECT'
        )
        OR
        has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'INSERT'
        )
        OR
        has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'UPDATE'
        )
        OR
        has_table_privilege(
            'authenticated',
            'public.comment_awards',
            'DELETE'
        )
    THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_BROWSER_DML_UNEXPECTED';
    END IF;

    IF NOT has_table_privilege(
        'service_role',
        'public.comment_awards',
        'INSERT'
    ) THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_SERVICE_INSERT_MISSING';
    END IF;

    IF NOT has_table_privilege(
        'service_role',
        'public.comment_awards',
        'UPDATE'
    ) THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_SERVICE_UPDATE_MISSING';
    END IF;

    IF NOT has_table_privilege(
        'service_role',
        'public.user_comments',
        'SELECT'
    ) THEN
        RAISE EXCEPTION
            'USER_COMMENTS_SERVICE_SELECT_MISSING';
    END IF;

    SELECT COUNT(*)
    INTO v_unique_indexes
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'comment_awards'
      AND indexdef ILIKE 'CREATE UNIQUE INDEX%'
      AND indexdef ILIKE '%user_comment_id%';

    IF v_unique_indexes <> 1 THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_UNIQUE_COMMENT_INDEX_COUNT:%',
            v_unique_indexes;
    END IF;

    SELECT COUNT(*)
    INTO v_comment_fks
    FROM pg_constraint c
    WHERE c.conrelid =
          'public.comment_awards'::regclass
      AND c.contype = 'f'
      AND pg_get_constraintdef(c.oid)
          ILIKE '%user_comment_id%';

    IF v_comment_fks <> 1 THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_COMMENT_FK_COUNT:%',
            v_comment_fks;
    END IF;
END
$$;

ALTER TABLE public.comment_awards
ADD COLUMN project_participant_id uuid NULL;

ALTER TABLE public.comment_awards
ADD CONSTRAINT comment_awards_project_participant_id_fkey
FOREIGN KEY (project_participant_id)
REFERENCES public.project_participants(id)
ON UPDATE RESTRICT
ON DELETE RESTRICT;

CREATE INDEX idx_comment_awards_project_participant_id
ON public.comment_awards(project_participant_id)
WHERE project_participant_id IS NOT NULL;

CREATE OR REPLACE FUNCTION
public.vc_enforce_comment_award_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_device_id text;
    v_group_code text;
    v_project_participant_id uuid;
BEGIN
    SELECT
        c.device_id,
        c.group_code,
        c.project_participant_id
    INTO
        v_device_id,
        v_group_code,
        v_project_participant_id
    FROM public.user_comments AS c
    WHERE c.id = NEW.user_comment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'COMMENT_AWARD_COMMENT_NOT_FOUND'
            USING ERRCODE = '23503';
    END IF;

    IF
        v_group_code IS NULL
        OR btrim(v_group_code) = ''
    THEN
        RAISE EXCEPTION
            'COMMENT_AWARD_GROUP_INVALID';
    END IF;

    -- user_comment_id is the only authoritative identity source.
    NEW.device_id :=
        v_device_id;

    NEW.group_code :=
        v_group_code;

    NEW.project_participant_id :=
        v_project_participant_id;

    RETURN NEW;
END
$$;

REVOKE ALL
ON FUNCTION public.vc_enforce_comment_award_identity()
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.vc_enforce_comment_award_identity()
FROM anon;

REVOKE ALL
ON FUNCTION public.vc_enforce_comment_award_identity()
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.vc_enforce_comment_award_identity()
TO service_role;

CREATE TRIGGER trg_vc_comment_award_identity
BEFORE INSERT OR UPDATE
ON public.comment_awards
FOR EACH ROW
EXECUTE FUNCTION
public.vc_enforce_comment_award_identity();

DO $$
DECLARE
    v_awards bigint;
    v_column_count integer;
    v_fk_count integer;
    v_trigger_count integer;
    v_secure_trigger_count integer;
    v_policy_count integer;
BEGIN
    SELECT COUNT(*)
    INTO v_awards
    FROM public.comment_awards;

    IF v_awards <> 0 THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_POSTFLIGHT_ROWS_CHANGED:%',
            v_awards;
    END IF;

    SELECT COUNT(*)
    INTO v_column_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'comment_awards'
      AND column_name = 'project_participant_id'
      AND is_nullable = 'YES';

    IF v_column_count <> 1 THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_STABLE_COLUMN_INVALID';
    END IF;

    SELECT COUNT(*)
    INTO v_fk_count
    FROM pg_constraint c
    WHERE c.conrelid =
          'public.comment_awards'::regclass
      AND c.contype = 'f'
      AND c.conname =
          'comment_awards_project_participant_id_fkey'
      AND pg_get_constraintdef(c.oid)
          ILIKE '%ON UPDATE RESTRICT%'
      AND pg_get_constraintdef(c.oid)
          ILIKE '%ON DELETE RESTRICT%';

    IF v_fk_count <> 1 THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_STABLE_FK_INVALID';
    END IF;

    SELECT COUNT(*)
    INTO v_trigger_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.comment_awards'::regclass
      AND NOT tgisinternal;

    SELECT COUNT(*)
    INTO v_secure_trigger_count
    FROM pg_trigger
    WHERE tgrelid =
          'public.comment_awards'::regclass
      AND NOT tgisinternal
      AND tgname =
          'trg_vc_comment_award_identity';

    IF
        v_trigger_count <> 1
        OR v_secure_trigger_count <> 1
    THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_TRIGGER_INVALID:%:%',
            v_trigger_count,
            v_secure_trigger_count;
    END IF;

    SELECT COUNT(*)
    INTO v_policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'comment_awards';

    IF v_policy_count <> 0 THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_POLICY_DRIFT:%',
            v_policy_count;
    END IF;

    IF
        has_function_privilege(
            'anon',
            'public.vc_enforce_comment_award_identity()',
            'EXECUTE'
        )
        OR
        has_function_privilege(
            'authenticated',
            'public.vc_enforce_comment_award_identity()',
            'EXECUTE'
        )
    THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_TRIGGER_FUNCTION_BROWSER_EXECUTE';
    END IF;

    IF NOT has_function_privilege(
        'service_role',
        'public.vc_enforce_comment_award_identity()',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION
            'COMMENT_AWARDS_TRIGGER_FUNCTION_SERVICE_EXECUTE_MISSING';
    END IF;
END
$$;
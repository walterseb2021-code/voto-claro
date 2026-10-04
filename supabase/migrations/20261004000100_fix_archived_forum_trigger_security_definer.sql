-- Records the fix already applied manually in production.
-- Repository history only: do not run against production again.
-- Function body, triggers and table privileges remain unchanged.
BEGIN;

ALTER FUNCTION public.vc_secure_archived_forum_comment_insert()
  OWNER TO postgres;

ALTER FUNCTION public.vc_secure_archived_forum_comment_insert()
  SECURITY DEFINER;

ALTER FUNCTION public.vc_secure_archived_forum_comment_insert()
  SET search_path TO pg_catalog, public;

REVOKE ALL
ON FUNCTION public.vc_secure_archived_forum_comment_insert()
FROM PUBLIC;

-- Remove any other direct grants on this function only.
DO $migration$
DECLARE
  target_role text;
BEGIN
  FOR target_role IN
    SELECT DISTINCT r.rolname
    FROM pg_catalog.pg_proc p
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) a
    JOIN pg_catalog.pg_roles r ON r.oid = a.grantee
    WHERE p.oid =
      'public.vc_secure_archived_forum_comment_insert()'::regprocedure
      AND r.rolname NOT IN ('postgres', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE ALL ON FUNCTION public.vc_secure_archived_forum_comment_insert() FROM %I',
      target_role
    );
  END LOOP;
END
$migration$;

REVOKE GRANT OPTION FOR EXECUTE
ON FUNCTION public.vc_secure_archived_forum_comment_insert()
FROM service_role;

GRANT EXECUTE
ON FUNCTION public.vc_secure_archived_forum_comment_insert()
TO postgres, service_role;

COMMIT;

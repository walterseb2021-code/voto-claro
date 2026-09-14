-- ============================================================
-- B-SEC MAIN COMMENTS
-- PHASE 2 - FINALIZE STABLE IDENTITY
--
-- Precondicion:
-- El endpoint seguro con project_participant_id ya fue
-- desplegado y validado en produccion.
--
-- Objetivos:
-- - retirar triggers legacy
-- - retirar policies publicas obsoletas
-- - eliminar compatibilidad de INSERT sin identidad estable
-- - mantener funciones auxiliares de moderacion requeridas
-- - conservar funciones legacy inactivas para rollback
-- ============================================================

-- ------------------------------------------------------------
-- 1. PREFLIGHT ESTRICTO
-- ------------------------------------------------------------

do $$
declare
    v_count integer;
begin
    select count(*)
    into v_count
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_comments'
      and column_name = 'project_participant_id';

    if v_count <> 1 then
        raise exception
            'BSEC_MAIN_COMMENTS_PHASE2_MISSING_PROJECT_ID';
    end if;

    select count(*)
    into v_count
    from pg_trigger
    where tgrelid = 'public.user_comments'::regclass
      and not tgisinternal
      and tgname in (
          'trg_limit_user_comments_per_topic',
          'trg_vc_comments_filter',
          'trg_vc_comments_force_status',
          'trg_vc_comments_moderate_insert'
      );

    if v_count <> 4 then
        raise exception
            'BSEC_MAIN_COMMENTS_PHASE2_LEGACY_TRIGGERS_%',
            v_count;
    end if;

    select count(*)
    into v_count
    from pg_trigger
    where tgrelid = 'public.user_comments'::regclass
      and not tgisinternal
      and tgname = 'trg_zz_vc_user_comments_secure_insert';

    if v_count <> 1 then
        raise exception
            'BSEC_MAIN_COMMENTS_PHASE2_SECURE_TRIGGER_%',
            v_count;
    end if;

    select count(*)
    into v_count
    from public.user_comments
    where project_participant_id is not null;

    if v_count <> 0 then
        raise exception
            'BSEC_MAIN_COMMENTS_PHASE2_UNEXPECTED_STABLE_ROWS_%',
            v_count;
    end if;

    select count(*)
    into v_count
    from public.user_comments;

    if v_count <> 72 then
        raise exception
            'BSEC_MAIN_COMMENTS_PHASE2_COMMENT_TOTAL_%',
            v_count;
    end if;
end
$$;

-- ------------------------------------------------------------
-- 2. RETIRAR LOS CUATRO TRIGGERS LEGACY
-- ------------------------------------------------------------

drop trigger if exists
trg_limit_user_comments_per_topic
on public.user_comments;

drop trigger if exists
trg_vc_comments_filter
on public.user_comments;

drop trigger if exists
trg_vc_comments_force_status
on public.user_comments;

drop trigger if exists
trg_vc_comments_moderate_insert
on public.user_comments;

-- ------------------------------------------------------------
-- 3. REEMPLAZAR FUNCION SEGURA
--
-- Ya NO existe compatibilidad con project_participant_id NULL.
-- Todo comentario nuevo debe tener identidad estable.
-- ------------------------------------------------------------

create or replace function public.vc_secure_user_comments_insert()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
    v_trusted_device text;
    v_comment_count integer := 0;
    v_recent_count integer := 0;
    v_norm text := '';
    v_duplicate_recent boolean := false;
    v_has_link boolean := false;
    v_too_short boolean := false;
    v_has_banned boolean := false;
begin

    -- --------------------------------------------------------
    -- IDENTIDAD ESTABLE OBLIGATORIA
    -- --------------------------------------------------------

    if new.project_participant_id is null then
        raise exception 'COMMENT_PARTICIPANT_REQUIRED';
    end if;

    -- --------------------------------------------------------
    -- MENSAJE
    -- --------------------------------------------------------

    new.message :=
        btrim(
            coalesce(
                new.message,
                ''
            )
        );

    if char_length(new.message) < 3
       or char_length(new.message) > 500 then
        raise exception 'COMMENT_INVALID_MESSAGE';
    end if;

    -- --------------------------------------------------------
    -- PARTICIPANTE
    --
    -- El bloqueo de fila serializa los INSERT concurrentes
    -- realizados por el mismo participante.
    -- --------------------------------------------------------

    select nullif(btrim(pp.device_id), '')
    into v_trusted_device
    from public.project_participants pp
    where pp.id = new.project_participant_id
    for update;

    if not found then
        raise exception 'COMMENT_PARTICIPANT_NOT_FOUND';
    end if;

    -- device_id es solo compatibilidad historica.
    -- Nunca se acepta como identidad procedente del cliente.
    new.device_id := v_trusted_device;

    -- Identidad legacy prohibida en nuevas filas.
    new.access_participant_id := null;

    -- Ruta canonica del modulo.
    new.page := '/comentarios';

    new.group_code :=
        left(
            coalesce(
                nullif(btrim(new.group_code), ''),
                'GENERAL'
            ),
            40
        );

    new.metadata :=
        coalesce(
            new.metadata,
            '{}'::jsonb
        );

    -- --------------------------------------------------------
    -- TOPIC ACTIVE
    -- --------------------------------------------------------

    perform 1
    from public.weekly_topics wt
    where wt.id = new.weekly_topic_id
      and wt.status = 'active'
    for share;

    if not found then
        raise exception 'COMMENT_TOPIC_NOT_ACTIVE';
    end if;

    -- --------------------------------------------------------
    -- MAXIMO ATOMICO DE 3
    -- --------------------------------------------------------

    select count(*)
    into v_comment_count
    from public.user_comments c
    where c.project_participant_id =
            new.project_participant_id
      and c.weekly_topic_id =
            new.weekly_topic_id;

    if v_comment_count >= 3 then
        raise exception 'MAX_3_COMMENTS_PER_TOPIC';
    end if;

    -- --------------------------------------------------------
    -- MODERACION
    -- --------------------------------------------------------

    v_has_link :=
        new.message ~* '(https?://|www\.)';

    v_too_short :=
        char_length(btrim(new.message)) < 5;

    v_has_banned :=
        public.vc_has_banned_words(new.message)
        or
        public.vc_has_banned(new.message);

    select count(*)
    into v_recent_count
    from public.user_comments c
    where c.project_participant_id =
            new.project_participant_id
      and c.created_at >
            now() - interval '1 minute';

    v_norm :=
        public.vc_norm_text(new.message);

    select exists (
        select 1
        from public.user_comments c
        where c.project_participant_id =
                new.project_participant_id
          and c.created_at >
                now() - interval '2 minutes'
          and public.vc_norm_text(c.message) =
                v_norm
        limit 1
    )
    into v_duplicate_recent;

    if v_has_banned
       or v_has_link
       or v_too_short
       or v_recent_count >= 3
       or v_duplicate_recent then

        new.status := 'blocked';

    else

        new.status := 'published';

    end if;

    return new;
end;
$function$;

-- ------------------------------------------------------------
-- 4. NOMBRE DEFINITIVO DEL TRIGGER
-- ------------------------------------------------------------

alter trigger trg_zz_vc_user_comments_secure_insert
on public.user_comments
rename to trg_vc_user_comments_secure_insert;

-- ------------------------------------------------------------
-- 5. DEFAULT FAIL-CLOSED
-- ------------------------------------------------------------

alter table public.user_comments
alter column status
set default 'blocked'::text;

-- ------------------------------------------------------------
-- 6. RETIRAR POLICIES PUBLICAS OBSOLETAS
--
-- El acceso publico a comentarios se realiza exclusivamente
-- mediante endpoints server-side.
-- ------------------------------------------------------------

drop policy if exists
"public can insert comments"
on public.user_comments;

drop policy if exists
"public can read published"
on public.user_comments;

-- ------------------------------------------------------------
-- 7. CERRAR FUNCIONES LEGACY
--
-- Se conservan fisicamente para facilitar rollback, pero
-- dejan de estar ejecutables por PUBLIC, anon y authenticated.
-- ------------------------------------------------------------

revoke all privileges
on function public.can_user_comment_user_comments(uuid)
from public, anon, authenticated;

revoke all privileges
on function public.limit_user_comments_per_topic()
from public, anon, authenticated;

revoke all privileges
on function public.vc_comments_filter_trigger()
from public, anon, authenticated;

revoke all privileges
on function public.vc_comments_force_status_trigger()
from public, anon, authenticated;

revoke all privileges
on function public.vc_comments_moderate_insert()
from public, anon, authenticated;

-- ------------------------------------------------------------
-- 8. FUNCION SEGURA:
-- solo service_role necesita EXECUTE.
-- ------------------------------------------------------------

revoke all privileges
on function public.vc_secure_user_comments_insert()
from public, anon, authenticated;

grant execute
on function public.vc_secure_user_comments_insert()
to service_role;

-- ------------------------------------------------------------
-- 9. MANTENER TABLA SIN ACCESO DIRECTO DE CLIENTE
-- ------------------------------------------------------------

alter table public.user_comments
enable row level security;

revoke all privileges
on table public.user_comments
from public, anon, authenticated;

grant select, insert, update, delete
on table public.user_comments
to service_role;
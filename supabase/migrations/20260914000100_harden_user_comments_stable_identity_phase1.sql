-- ============================================================
-- B-SEC MAIN COMMENTS
-- PHASE 1 - STABLE IDENTITY / BACKWARD COMPATIBLE
--
-- Objetivo:
-- - agregar identidad estable a user_comments
-- - proteger nuevos comentarios con project_participant_id
-- - mantener temporalmente compatible el endpoint legacy
-- - no modificar ni hacer backfill de comentarios historicos
-- ============================================================

-- ------------------------------------------------------------
-- 1. PREFLIGHT
-- ------------------------------------------------------------

do $$
declare
    v_column_exists integer;
    v_trigger_exists integer;
begin
    if pg_catalog.to_regclass('public.user_comments') is null then
        raise exception
            'BSEC_MAIN_COMMENTS_MISSING_TABLE: user_comments';
    end if;

    if pg_catalog.to_regclass('public.project_participants') is null then
        raise exception
            'BSEC_MAIN_COMMENTS_MISSING_TABLE: project_participants';
    end if;

    if pg_catalog.to_regclass('public.weekly_topics') is null then
        raise exception
            'BSEC_MAIN_COMMENTS_MISSING_TABLE: weekly_topics';
    end if;

    select count(*)
    into v_column_exists
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_comments'
      and column_name = 'project_participant_id';

    if v_column_exists <> 0 then
        raise exception
            'BSEC_MAIN_COMMENTS_PROJECT_PARTICIPANT_ALREADY_EXISTS';
    end if;

    select count(*)
    into v_trigger_exists
    from pg_trigger
    where tgrelid = 'public.user_comments'::regclass
      and not tgisinternal
      and tgname = 'trg_zz_vc_user_comments_secure_insert';

    if v_trigger_exists <> 0 then
        raise exception
            'BSEC_MAIN_COMMENTS_SECURE_TRIGGER_ALREADY_EXISTS';
    end if;
end
$$;

-- ------------------------------------------------------------
-- 2. IDENTIDAD ESTABLE
--
-- Nullable para conservar los comentarios historicos.
-- No se realiza backfill.
-- ------------------------------------------------------------

alter table public.user_comments
    add column project_participant_id uuid null;

alter table public.user_comments
    add constraint user_comments_project_participant_id_fkey
    foreign key (project_participant_id)
    references public.project_participants(id)
    on update restrict
    on delete restrict;

create index idx_user_comments_topic_project_participant_created
    on public.user_comments (
        weekly_topic_id,
        project_participant_id,
        created_at desc
    )
    where project_participant_id is not null;

-- ------------------------------------------------------------
-- 3. INTEGRIDAD DEL TEMA SEMANAL
--
-- No se agrega FK sobre weekly_topic_id en esta fase porque
-- existen comentarios historicos que referencian topics que
-- ya no existen.
--
-- Los registros historicos deben conservarse intactos.
--
-- Para todo INSERT futuro, el trigger seguro exige que
-- weekly_topic_id exista y que su status sea ACTIVE.
-- ------------------------------------------------------------
-- 4. TRIGGER SEGURO TRANSITORIO
--
-- El nombre comienza con trg_zz para ejecutarse despues
-- de los triggers BEFORE INSERT legacy actualmente existentes.
--
-- Mientras project_participant_id sea NULL:
--   - mantiene compatibilidad con produccion actual
--   - pero valida topic activo y longitud del mensaje
--
-- Cuando project_participant_id NO sea NULL:
--   - identidad canonica = project_participant_id
--   - device_id se obtiene del servidor/base
--   - access_participant_id queda NULL
--   - maximo de 3 protegido de carreras
--   - moderacion final centralizada
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
    -- VALIDACIONES COMUNES:
    -- aplican tanto al flujo legacy temporal como al seguro.
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

    -- El topic debe existir y estar ACTIVE al momento real
    -- del INSERT. El lock evita cambio concurrente de estado.
    perform 1
    from public.weekly_topics wt
    where wt.id = new.weekly_topic_id
      and wt.status = 'active'
    for share;

    if not found then
        raise exception 'COMMENT_TOPIC_NOT_ACTIVE';
    end if;

    -- --------------------------------------------------------
    -- COMPATIBILIDAD TEMPORAL
    --
    -- El endpoint actualmente desplegado todavia no envia
    -- project_participant_id. Durante Fase 1 se permite.
    --
    -- La Fase 2 eliminara esta salida legacy.
    -- --------------------------------------------------------

    if new.project_participant_id is null then
        return new;
    end if;

    -- --------------------------------------------------------
    -- IDENTIDAD ESTABLE
    --
    -- Bloquear la fila del participante serializa todos los
    -- INSERT concurrentes del mismo participante.
    -- --------------------------------------------------------

    select nullif(btrim(pp.device_id), '')
    into v_trusted_device
    from public.project_participants pp
    where pp.id = new.project_participant_id
    for update;

    if not found then
        raise exception 'COMMENT_PARTICIPANT_NOT_FOUND';
    end if;

    -- device_id se conserva solo como compatibilidad legacy.
    -- Nunca se confia en el valor enviado por el navegador.
    new.device_id := v_trusted_device;

    -- La identidad legacy deja de utilizarse.
    new.access_participant_id := null;

    -- La pagina no se confia al navegador.
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
    -- MAXIMO ATOMICO DE 3
    --
    -- La fila de project_participants permanece bloqueada
    -- hasta finalizar la transaccion.
    --
    -- Una segunda transaccion del mismo participante esperara
    -- y luego vera los INSERT confirmados por la primera.
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

    -- --------------------------------------------------------
    -- DECISION FINAL
    --
    -- Como este trigger se ejecuta al final de la cadena
    -- BEFORE INSERT, su status es la decision definitiva
    -- para el nuevo flujo estable.
    -- --------------------------------------------------------

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

create trigger trg_zz_vc_user_comments_secure_insert
before insert
on public.user_comments
for each row
execute function public.vc_secure_user_comments_insert();

-- ------------------------------------------------------------
-- 5. PRIVILEGIOS DE LA NUEVA FUNCION
--
-- El navegador no necesita EXECUTE.
-- El runtime server-side utiliza service_role.
-- ------------------------------------------------------------

revoke all privileges
on function public.vc_secure_user_comments_insert()
from public, anon, authenticated;

grant execute
on function public.vc_secure_user_comments_insert()
to service_role;

-- ------------------------------------------------------------
-- 6. DEFENSA DE TABLA
--
-- Mantener el modelo server-side ya establecido.
-- ------------------------------------------------------------

alter table public.user_comments
    enable row level security;

revoke all privileges
on table public.user_comments
from public, anon, authenticated;

grant select, insert, update, delete
on table public.user_comments
to service_role;

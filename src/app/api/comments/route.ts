import { type NextRequest } from "next/server";
import { getCookieValue } from "@/lib/http/cookies";
import {
  cleanParticipantText,
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GROUP_CODE = "GENERAL";
const MAX_BODY_BYTES = 2048;
const MAX_MESSAGE_LENGTH = 500;

type ResolvedSession = Awaited<
  ReturnType<typeof resolveParticipantSession>
>;

type SessionSuccess = Extract<
  ResolvedSession,
  { ok: true }
>;

type SupabaseAdmin = SessionSuccess["supabase"];

function normalizeGroupCode(value: unknown) {
  return cleanParticipantText(value, 40) || DEFAULT_GROUP_CODE;
}

function normalizeMessage(value: unknown) {
  if (typeof value !== "string") return null;

  const message = value
    .trim()
    .replace(/\s+/g, " ");

  if (
    message.length < 3 ||
    message.length > MAX_MESSAGE_LENGTH
  ) {
    return null;
  }

  return message;
}

function hasLinks(text: string) {
  return /https?:\/\/|www\./i.test(text);
}

function hasOnlyMessageField(
  body: Record<string, unknown>
) {
  const keys = Object.keys(body);

  return (
    keys.length === 1 &&
    keys[0] === "message"
  );
}

async function getActiveTopicId(
  supabase: SupabaseAdmin
) {
  const { data, error } = await supabase
    .from("weekly_topics")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[comments] active topic lookup failed"
    );
    throw new Error("active topic lookup failed");
  }

  return data?.id ? String(data.id) : null;
}

export async function POST(req: NextRequest) {
  try {
    // --------------------------------------------------------
    // ORIGIN ESTRICTO
    // --------------------------------------------------------

    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantError(
        403,
        "origin_invalid"
      );
    }

    // --------------------------------------------------------
    // ACEPTACION LEGAL
    // --------------------------------------------------------

    const cookieHeader = req.headers.get("cookie");

    const legalAccepted =
      getCookieValue(
        cookieHeader,
        "vc_legal_accepted"
      ) ?? "";

    if (legalAccepted !== "true") {
      return participantError(
        401,
        "legal_acceptance_required"
      );
    }

    // --------------------------------------------------------
    // BODY LIMITADO
    // --------------------------------------------------------

    const body = await readBoundedJsonObject(
      req,
      MAX_BODY_BYTES
    );

    if (!body || !hasOnlyMessageField(body)) {
      return participantError(
        400,
        "request_invalid"
      );
    }

    const message = normalizeMessage(
      body.message
    );

    if (!message) {
      return participantError(
        400,
        "comment_invalid"
      );
    }

    if (hasLinks(message)) {
      return participantJson(400, {
        ok: false,
        error: "links_not_allowed",
        code: "LINKS_NOT_ALLOWED",
      });
    }

    // --------------------------------------------------------
    // SESION SEGURA
    //
    // project_participant_id nunca viene del navegador.
    // --------------------------------------------------------

    const session =
      await resolveParticipantSession(req);

    if (!session.ok) {
      return participantError(
        session.reason === "unavailable"
          ? 503
          : 401,
        session.reason === "unavailable"
          ? "session_unavailable"
          : "unauthenticated"
      );
    }

    const supabase = session.supabase;

    const participantId =
      session.participant.id;

    // --------------------------------------------------------
    // TOPIC ACTIVE RESUELTO SERVER-SIDE
    //
    // weekly_topic_id nunca viene del navegador.
    // --------------------------------------------------------

    const weeklyTopicId =
      await getActiveTopicId(supabase);

    if (!weeklyTopicId) {
      return participantError(
        404,
        "active_topic_not_found"
      );
    }

    // --------------------------------------------------------
    // GROUP CODE
    //
    // No es autoridad de identidad.
    // Se conserva desde la cookie del modulo.
    // --------------------------------------------------------

    const cookieGroup =
      getCookieValue(
        cookieHeader,
        "vc_group"
      ) ?? DEFAULT_GROUP_CODE;

    const groupCode =
      normalizeGroupCode(cookieGroup);

    // --------------------------------------------------------
    // METADATA SERVER-SIDE
    //
    // No se aceptan alias, participant_id, topic_id,
    // route ni timestamps enviados por el navegador.
    // --------------------------------------------------------

    const metadata = {
      source_module: "comentarios-ciudadanos",
      source_section: "comentario-semanal",
      source_action: "publicar-comentario",
      page_title: "Comentarios Ciudadanos",
      route: "/comentarios",
      topic_id: weeklyTopicId,
      submitted_from: "comentarios-page",
    };

    // --------------------------------------------------------
    // INSERT
    //
    // No se envia device_id.
    // No se envia access_participant_id.
    //
    // El trigger Fase 1:
    // - deriva device_id desde project_participants
    // - fuerza access_participant_id = NULL
    // - valida topic active
    // - serializa maximo de 3
    // - toma decision final de moderacion
    // --------------------------------------------------------

    const { data, error } = await supabase
      .from("user_comments")
      .insert({
        group_code: groupCode,
        project_participant_id:
          participantId,
        weekly_topic_id:
          weeklyTopicId,
        page: "/comentarios",
        message,
        status: "blocked",
        metadata,
      })
      .select(
        "id,created_at,group_code,status"
      )
      .single();

    if (error) {
      const dbMessage = String(
        (
          error as {
            message?: string;
          }
        ).message ?? ""
      );

      if (
        dbMessage.includes(
          "MAX_3_COMMENTS_PER_TOPIC"
        )
      ) {
        return participantJson(409, {
          ok: false,
          error: "max_3_comments_per_topic",
          code: "MAX_3_COMMENTS_PER_TOPIC",
        });
      }

      if (
        dbMessage.includes(
          "COMMENT_TOPIC_NOT_ACTIVE"
        )
      ) {
        return participantJson(409, {
          ok: false,
          error: "active_topic_not_available",
          code: "ACTIVE_TOPIC_NOT_AVAILABLE",
        });
      }

      if (
        dbMessage.includes(
          "COMMENT_PARTICIPANT_NOT_FOUND"
        )
      ) {
        return participantError(
          401,
          "unauthenticated"
        );
      }

      if (
        dbMessage.includes(
          "COMMENT_INVALID_MESSAGE"
        )
      ) {
        return participantError(
          400,
          "comment_invalid"
        );
      }

      console.error(
        "[comments] secure insert failed"
      );

      return participantError(
        500,
        "comment_submit_failed"
      );
    }

    if (!data?.id) {
      console.error(
        "[comments] secure insert returned no row"
      );

      return participantError(
        500,
        "comment_submit_failed"
      );
    }

    // --------------------------------------------------------
    // MODERACION
    //
    // La fila BLOCKED se conserva para control administrativo,
    // pero no se presenta al usuario como publicada.
    // --------------------------------------------------------

    if (data.status === "blocked") {
      return participantJson(422, {
        ok: false,
        error: "comment_blocked",
        code: "COMMENT_BLOCKED",
      });
    }

    return participantJson(200, {
      ok: true,
      comment: {
        id: data.id,
        created_at: data.created_at,
        group_code: data.group_code,
        status: data.status,
      },
    });
  } catch (error) {
    console.error(
      "[comments] unexpected error",
      error
    );

    return participantError(
      500,
      "comment_service_unavailable"
    );
  }
}
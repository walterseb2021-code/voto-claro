import { type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AccessRow = {
  id: string;
  forum_alias: string | null;
};

type StableParticipantRow = {
  id: string;
  alias: string | null;
  full_name: string | null;
};

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    process.env.SUPABASE_URL;

  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing Supabase admin configuration"
    );
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeGroupCode(value: unknown) {
  return (
    cleanParticipantText(value, 40) ||
    DEFAULT_GROUP_CODE
  );
}

function isValidTopicId(value: string) {
  return UUID_RE.test(value);
}

function cleanMessage(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function hasLinks(text: string) {
  return /https?:\/\/|www\./i.test(text);
}

function toSafeForumAlias(input: unknown) {
  const base = cleanParticipantText(input, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return base.length >= 3
    ? base.slice(0, 20)
    : "Ciudadano";
}

function toSafeTopic(row: any) {
  if (!row?.id) {
    return null;
  }

  return {
    id: row.id,
    title: row.topic ?? "",
    question: row.question ?? "",
    status: row.status ?? "archived",
  };
}

function toSafeComment(
  row: any,
  forumAlias: string | null
) {
  return {
    id: row.id,
    created_at: row.created_at,
    message: row.message ?? "",
    forum_alias:
      forumAlias || "Ciudadano",
  };
}

function hasOnlyKeys(
  body: Record<string, unknown>,
  allowed: string[]
) {
  const allowedSet = new Set(allowed);

  return Object.keys(body).every((key) =>
    allowedSet.has(key)
  );
}

async function getArchivedTopic(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  topicId: string
) {
  const { data, error } = await supabase
    .from("weekly_topics")
    .select("id,topic,question,status")
    .eq("id", topicId)
    .eq("status", "archived")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[comments/forum-comments] topic lookup failed",
      error
    );

    throw new Error("topic lookup failed");
  }

  return data;
}

async function listComments(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  topicId: string
) {
  const { data: rows, error } = await supabase
    .from("archived_topic_forum_comments")
    .select(
      "id,created_at,access_participant_id,project_participant_id,message"
    )
    .eq("weekly_topic_id", topicId)
    .eq("status", "published")
    .order("created_at", {
      ascending: true,
    })
    .limit(200);

  if (error) {
    console.error(
      "[comments/forum-comments] comments lookup failed",
      error
    );

    throw new Error("comments lookup failed");
  }

  const comments = rows ?? [];

  const accessIds = [
    ...new Set(
      comments
        .map((row: any) =>
          String(
            row.access_participant_id ?? ""
          )
        )
        .filter(Boolean)
    ),
  ];

  const participantIds = [
    ...new Set(
      comments
        .map((row: any) =>
          String(
            row.project_participant_id ?? ""
          )
        )
        .filter(Boolean)
    ),
  ];

  const accessAliasMap: Record<
    string,
    string | null
  > = {};

  const stableAliasMap: Record<
    string,
    string | null
  > = {};

  if (accessIds.length > 0) {
    const {
      data: accessParticipants,
      error: accessError,
    } = await supabase
      .from("comment_access_participants")
      .select("id,forum_alias")
      .in("id", accessIds);

    if (accessError) {
      console.error(
        "[comments/forum-comments] legacy alias lookup failed",
        accessError
      );

      throw new Error(
        "legacy alias lookup failed"
      );
    }

    for (
      const row of
        (accessParticipants ?? []) as AccessRow[]
    ) {
      accessAliasMap[row.id] =
        row.forum_alias ?? null;
    }
  }

  if (participantIds.length > 0) {
    const {
      data: stableParticipants,
      error: stableError,
    } = await supabase
      .from("project_participants")
      .select("id,alias,full_name")
      .in("id", participantIds);

    if (stableError) {
      console.error(
        "[comments/forum-comments] stable alias lookup failed",
        stableError
      );

      throw new Error(
        "stable alias lookup failed"
      );
    }

    for (
      const row of
        (stableParticipants ??
          []) as StableParticipantRow[]
    ) {
      stableAliasMap[row.id] =
        toSafeForumAlias(
          row.alias || row.full_name
        );
    }
  }

  return comments.map((row: any) => {
    const stableId = String(
      row.project_participant_id ?? ""
    );

    const accessId = String(
      row.access_participant_id ?? ""
    );

    const alias =
      (stableId
        ? stableAliasMap[stableId]
        : null) ??
      (accessId
        ? accessAliasMap[accessId]
        : null) ??
      "Ciudadano";

    return toSafeComment(row, alias);
  });
}

function mapInsertError(error: any) {
  const message = String(
    error?.message ?? ""
  ).toUpperCase();

  if (
    message.includes(
      "FORUM_LINKS_NOT_ALLOWED"
    )
  ) {
    return participantJson(400, {
      ok: false,
      error:
        "No se permiten enlaces en los comentarios del foro.",
      code: "LINKS_NOT_ALLOWED",
    });
  }

  if (
    message.includes(
      "FORUM_BAD_WORDS_BLOCKED"
    )
  ) {
    return participantJson(400, {
      ok: false,
      error:
        "Tu comentario contiene palabras no permitidas.",
      code: "FORUM_BAD_WORDS_BLOCKED",
    });
  }

  if (
    message.includes(
      "FORUM_FLOOD_BLOCKED"
    )
  ) {
    return participantJson(429, {
      ok: false,
      error:
        "Espera unos segundos antes de volver a comentar.",
      code: "FORUM_FLOOD_BLOCKED",
    });
  }

  if (
    message.includes(
      "FORUM_HOURLY_LIMIT_REACHED"
    )
  ) {
    return participantJson(429, {
      ok: false,
      error:
        "No puedes comentar aun, espera un momento antes de publicar de nuevo.",
      code: "FORUM_RATE_LIMIT",
    });
  }

  if (
    message.includes(
      "FORUM_DAILY_LIMIT_REACHED"
    )
  ) {
    return participantJson(429, {
      ok: false,
      error:
        "Ya alcanzaste el maximo diario de comentarios en el foro.",
      code: "FORUM_DAILY_LIMIT_REACHED",
    });
  }

  if (
    message.includes(
      "FORUM_TOPIC_NOT_ARCHIVED"
    )
  ) {
    return participantJson(409, {
      ok: false,
      error: "Foro no disponible",
      code: "FORUM_NOT_AVAILABLE",
    });
  }

  if (
    message.includes(
      "FORUM_PARTICIPANT_NOT_FOUND"
    )
  ) {
    return participantError(
      401,
      "unauthenticated"
    );
  }

  if (
    message.includes(
      "FORUM_MESSAGE_INVALID"
    )
  ) {
    return participantError(
      400,
      "request_invalid"
    );
  }

  return null;
}

export async function POST(
  req: NextRequest
) {
  try {
    if (
      !isAllowedParticipantMutationOrigin(req)
    ) {
      return participantError(
        403,
        "origin_invalid"
      );
    }

    const cookieHeader =
      req.headers.get("cookie");

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

    const body =
      await readBoundedJsonObject(
        req,
        MAX_BODY_BYTES
      );

    if (!body) {
      return participantError(
        400,
        "request_invalid"
      );
    }

    const action =
      cleanParticipantText(
        body.action,
        40
      );

    const topicId =
      cleanParticipantText(
        body.topic_id,
        120
      );

    if (
      action !== "list" &&
      action !== "submit"
    ) {
      return participantError(
        400,
        "request_invalid"
      );
    }

    if (!isValidTopicId(topicId)) {
      return participantError(
        400,
        "request_invalid"
      );
    }

    if (action === "list") {
      if (
        !hasOnlyKeys(body, [
          "action",
          "topic_id",
        ])
      ) {
        return participantError(
          400,
          "request_invalid"
        );
      }

      const supabase =
        getSupabaseAdmin();

      const topic =
        await getArchivedTopic(
          supabase,
          topicId
        );

      if (!topic?.id) {
        return participantJson(404, {
          ok: false,
          error: "Foro no disponible",
        });
      }

      const comments =
        await listComments(
          supabase,
          topicId
        );

      return participantJson(200, {
        ok: true,
        topic: toSafeTopic(topic),
        comments,
      });
    }

    if (
      !hasOnlyKeys(body, [
        "action",
        "topic_id",
        "message",
      ])
    ) {
      return participantError(
        400,
        "request_invalid"
      );
    }

    const message =
      cleanMessage(body.message);

    if (
      !message ||
      message.length >
        MAX_MESSAGE_LENGTH
    ) {
      return participantError(
        400,
        "request_invalid"
      );
    }

    if (hasLinks(message)) {
      return participantJson(400, {
        ok: false,
        error:
          "No se permiten enlaces en los comentarios del foro.",
        code: "LINKS_NOT_ALLOWED",
      });
    }

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

    const supabase =
      session.supabase;

    const topic =
      await getArchivedTopic(
        supabase,
        topicId
      );

    if (!topic?.id) {
      return participantJson(404, {
        ok: false,
        error: "Foro no disponible",
      });
    }

    const cookieGroup =
      getCookieValue(
        cookieHeader,
        "vc_group"
      ) ?? DEFAULT_GROUP_CODE;

    const groupCode =
      normalizeGroupCode(cookieGroup);

    const {
      data,
      error,
    } = await supabase
      .from(
        "archived_topic_forum_comments"
      )
      .insert({
        weekly_topic_id: topicId,
        project_participant_id:
          session.participant.id,
        group_code: groupCode,
        message,
        status: "published",
      })
      .select(
        "id,created_at,message,project_participant_id"
      )
      .single();

    if (error) {
      console.error(
        "[comments/forum-comments] stable insert failed",
        error
      );

      const mapped =
        mapInsertError(error);

      if (mapped) {
        return mapped;
      }

      return participantError(
        500,
        "comment_submit_failed"
      );
    }

    const forumAlias =
      toSafeForumAlias(
        session.participant.alias ||
          session.participant
            .display_name
      );

    return participantJson(200, {
      ok: true,
      comment:
        toSafeComment(
          data,
          forumAlias
        ),
    });
  } catch (error) {
    console.error(
      "[comments/forum-comments] unexpected error",
      error
    );

    return participantError(
      503,
      "unavailable"
    );
  }
}

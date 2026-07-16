import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";

const DEFAULT_GROUP_CODE = "GENERAL";
const MAX_MESSAGE_LENGTH = 500;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ParticipantRow = {
  id: string;
  alias: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
};

type AccessRow = {
  id: string;
  forum_alias: string | null;
  group_code: string | null;
};

function json(status: number, body: any) {
  return NextResponse.json(body, { status });
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase admin configuration");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getRequestOrigin(req: Request) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;

  return new URL(req.url).origin;
}

function isLocalOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function isAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  if (process.env.NODE_ENV !== "production" && isLocalOrigin(origin)) {
    return true;
  }

  try {
    return new URL(origin).origin === getRequestOrigin(req);
  } catch {
    return false;
  }
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function normalizeGroupCode(value: unknown) {
  const group = cleanText(value, 40);
  return group || DEFAULT_GROUP_CODE;
}

function isValidTopicId(value: string) {
  return UUID_RE.test(value);
}

function isValidDeviceId(value: string) {
  return value.length > 0 && value.length <= 120;
}

function isValidEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string) {
  return !value || /^[0-9+()\-\s]{6,30}$/.test(value);
}

function hasLinks(text: string) {
  return /https?:\/\/|www\./i.test(text);
}

function cleanMessage(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function toSafeForumAlias(input: unknown) {
  const base = cleanText(input, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (base.length >= 3) return base.slice(0, 20);

  return `Usuario_${crypto.randomUUID().slice(0, 8)}`;
}

function toSafeTopic(row: any) {
  if (!row?.id) return null;

  return {
    id: row.id,
    title: row.topic ?? "",
    question: row.question ?? "",
    status: row.status ?? "archived",
  };
}

function toSafeComment(row: any, forumAlias: string | null) {
  return {
    id: row.id,
    created_at: row.created_at,
    message: row.message ?? "",
    forum_alias: forumAlias,
  };
}

async function getArchivedTopic(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  topicId: string
) {
  const { data, error } = await supabase
    .from("weekly_topics")
    .select("id, topic, question, status")
    .eq("id", topicId)
    .eq("status", "archived")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[comments/forum-comments] topic lookup failed", error);
    throw new Error("topic lookup failed");
  }

  return data;
}

async function findAccessBy(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  column: "device_id" | "email" | "celular",
  value: string
) {
  if (!value) return null;

  const { data, error } = await supabase
    .from("comment_access_participants")
    .select("id, forum_alias, group_code")
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[comments/forum-comments] access lookup failed", { column, error });
    throw new Error("access lookup failed");
  }

  return data as AccessRow | null;
}

async function ensureAccess(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  deviceId: string,
  fallbackGroupCode: string
) {
  const existingByDevice = await findAccessBy(supabase, "device_id", deviceId);
  if (existingByDevice?.id) {
    return {
      id: existingByDevice.id,
      forum_alias: existingByDevice.forum_alias || toSafeForumAlias(null),
      group_code: existingByDevice.group_code || fallbackGroupCode,
    };
  }

  const { data: participant, error: participantError } = await supabase
    .from("project_participants")
    .select("id, alias, full_name, email, phone")
    .eq("device_id", deviceId)
    .limit(1)
    .maybeSingle();

  if (participantError) {
    console.error("[comments/forum-comments] participant lookup failed", participantError);
    throw new Error("participant lookup failed");
  }

  if (!participant?.id) return null;

  const row = participant as ParticipantRow;
  const email = cleanText(row.email, 160);
  const phone = cleanText(row.phone, 30);
  const forumAlias = toSafeForumAlias(row.alias || row.full_name);

  if (!isValidEmail(email) || !isValidPhone(phone)) return null;

  const existingByEmail = await findAccessBy(supabase, "email", email);
  if (existingByEmail?.id) {
    const groupCode = existingByEmail.group_code || fallbackGroupCode;
    const { error } = await supabase
      .from("comment_access_participants")
      .update({ device_id: deviceId, forum_alias: forumAlias, group_code: groupCode })
      .eq("id", existingByEmail.id);

    if (error) {
      console.error("[comments/forum-comments] access update by email failed", error);
      throw new Error("access update failed");
    }

    return { id: existingByEmail.id, forum_alias: forumAlias, group_code: groupCode };
  }

  const existingByPhone = await findAccessBy(supabase, "celular", phone);
  if (existingByPhone?.id) {
    const groupCode = existingByPhone.group_code || fallbackGroupCode;
    const { error } = await supabase
      .from("comment_access_participants")
      .update({ device_id: deviceId, forum_alias: forumAlias, group_code: groupCode })
      .eq("id", existingByPhone.id);

    if (error) {
      console.error("[comments/forum-comments] access update by phone failed", error);
      throw new Error("access update failed");
    }

    return { id: existingByPhone.id, forum_alias: forumAlias, group_code: groupCode };
  }

  const payload: Record<string, unknown> = {
    device_id: deviceId,
    group_code: fallbackGroupCode,
    forum_alias: forumAlias,
  };

  if (email) payload.email = email;
  if (phone) payload.celular = phone;

  const { data: inserted, error } = await supabase
    .from("comment_access_participants")
    .insert(payload)
    .select("id, forum_alias, group_code")
    .single();

  if (error) {
    console.error("[comments/forum-comments] access insert failed", error);
    throw new Error("access insert failed");
  }

  return inserted as AccessRow;
}

async function listComments(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  topicId: string
) {
  const { data: rows, error } = await supabase
    .from("archived_topic_forum_comments")
    .select("id, created_at, access_participant_id, message")
    .eq("weekly_topic_id", topicId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) {
    console.error("[comments/forum-comments] comments lookup failed", error);
    throw new Error("comments lookup failed");
  }

  const comments = rows ?? [];
  const participantIds = [
    ...new Set(
      comments.map((row: any) => String(row.access_participant_id ?? "")).filter(Boolean)
    ),
  ];

  let aliasMap: Record<string, string | null> = {};

  if (participantIds.length > 0) {
    const { data: participants, error: participantsError } = await supabase
      .from("comment_access_participants")
      .select("id, forum_alias")
      .in("id", participantIds);

    if (participantsError) {
      console.error("[comments/forum-comments] alias lookup failed", participantsError);
      throw new Error("alias lookup failed");
    }

    aliasMap = Object.fromEntries(
      (participants ?? []).map((row: any) => [row.id, row.forum_alias ?? null])
    );
  }

  return comments.map((row: any) =>
    toSafeComment(row, aliasMap[String(row.access_participant_id ?? "")] ?? null)
  );
}

export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const legalAccepted = getCookieValue(cookieHeader, "vc_legal_accepted") ?? "";
    const cookieGroup = getCookieValue(cookieHeader, "vc_group") ?? DEFAULT_GROUP_CODE;
    const fallbackGroupCode = normalizeGroupCode(cookieGroup);

    if (legalAccepted !== "true") {
      return json(401, { ok: false, error: "No autorizado" });
    }

    if (!isAllowedOrigin(req)) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const body = await req.json().catch(() => null);
    const action = cleanText(body?.action, 40);
    const topicId = cleanText(body?.topic_id, 120);

    if (!isValidTopicId(topicId)) {
      return json(400, { ok: false, error: "Tema inválido" });
    }

    const supabase = getSupabaseAdmin();
    const topic = await getArchivedTopic(supabase, topicId);

    if (!topic?.id) {
      return json(404, { ok: false, error: "Foro no disponible" });
    }

    if (action === "list") {
      const comments = await listComments(supabase, topicId);

      return json(200, {
        ok: true,
        topic: toSafeTopic(topic),
        comments,
      });
    }

    if (action === "submit") {
      const deviceId = cleanText(body?.device_id, 120);
      const message = cleanMessage(body?.message);

      if (!isValidDeviceId(deviceId)) {
        return json(400, { ok: false, error: "Solicitud invalida" });
      }

      if (!message || message.length > MAX_MESSAGE_LENGTH) {
        return json(400, { ok: false, error: "Solicitud invalida" });
      }

      if (hasLinks(message)) {
        return json(400, {
          ok: false,
          error: "No se pudo publicar",
          code: "LINKS_NOT_ALLOWED",
        });
      }

      const access = await ensureAccess(supabase, deviceId, fallbackGroupCode);

      if (!access?.id) {
        return json(403, { ok: false, error: "No autorizado" });
      }

      const canCommentResult: any = await supabase
        .rpc("can_user_comment", { p_user_id: access.id })
        .maybeSingle();

      if (canCommentResult.error) {
        console.error("[comments/forum-comments] can_user_comment failed", canCommentResult.error);
        return json(500, { ok: false, error: "No disponible" });
      }

      if (!canCommentResult.data?.can_comment) {
        return json(429, {
          ok: false,
          error: "No puedes comentar aun, espera un momento antes de publicar de nuevo.",
          code: "FORUM_RATE_LIMIT",
        });
      }

      const { data, error } = await supabase
        .from("archived_topic_forum_comments")
        .insert({
          weekly_topic_id: topicId,
          access_participant_id: access.id,
          device_id: deviceId,
          group_code: access.group_code || fallbackGroupCode,
          message,
          status: "published",
        })
        .select("id, created_at, message")
        .single();

      if (error) {
        console.error("[comments/forum-comments] insert failed", error);
        const msg = (error.message || "").toLowerCase();

        if (msg.includes("forum_flood_blocked")) {
          return json(429, {
            ok: false,
            error: "Espera unos segundos antes de volver a comentar.",
            code: "FORUM_FLOOD_BLOCKED",
          });
        }

        if (msg.includes("forum_bad_words_blocked")) {
          return json(400, {
            ok: false,
            error: "Tu comentario contiene palabras no permitidas.",
            code: "FORUM_BAD_WORDS_BLOCKED",
          });
        }

        if (msg.includes("forum_daily_limit_reached")) {
          return json(429, {
            ok: false,
            error: "Ya alcanzaste el maximo diario de comentarios en el foro.",
            code: "FORUM_DAILY_LIMIT_REACHED",
          });
        }

        return json(500, { ok: false, error: "No se pudo publicar" });
      }

      return json(200, {
        ok: true,
        comment: toSafeComment(data, access.forum_alias ?? null),
      });
    }

    return json(400, { ok: false, error: "Solicitud invalida" });
  } catch (e) {
    console.error("[comments/forum-comments] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

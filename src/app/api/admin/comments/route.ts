import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { createClient } from "@supabase/supabase-js";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16384;

type JsonObject = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value: unknown): value is string { return typeof value === "string" && UUID_RE.test(value.trim()); }
function hasExactKeys(value: JsonObject, expected: readonly string[]) { const actual = Object.keys(value).sort(); const wanted = [...expected].sort(); return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]); }

function isAllowedMutationOrigin(req: NextRequest) {
  const rawOrigin = req.headers.get("origin");
  if (!rawOrigin) return false;

  let origin: URL;

  try {
    origin = new URL(rawOrigin);
  } catch {
    return false;
  }

  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    return false;
  }

  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    return false;
  }

  return origin.origin === req.nextUrl.origin;
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function readJsonObject(req: NextRequest) {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();

  if (!contentType.includes("application/json")) {
    return {
      ok: false as const,
      status: 415,
      error: "UNSUPPORTED_MEDIA_TYPE",
    };
  }

  const rawLength = req.headers.get("content-length");

  if (rawLength) {
    const length = Number(rawLength);

    if (!Number.isFinite(length) || length < 0) {
      return {
        ok: false as const,
        status: 400,
        error: "INVALID_JSON",
      };
    }

    if (length > MAX_BODY_BYTES) {
      return {
        ok: false as const,
        status: 413,
        error: "PAYLOAD_TOO_LARGE",
      };
    }
  }

  const raw = await req.text();

  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return {
      ok: false as const,
      status: 413,
      error: "PAYLOAD_TOO_LARGE",
    };
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!isRecord(parsed)) {
      return {
        ok: false as const,
        status: 400,
        error: "INVALID_JSON",
      };
    }

    return {
      ok: true as const,
      value: parsed,
    };
  } catch {
    return {
      ok: false as const,
      status: 400,
      error: "INVALID_JSON",
    };
  }
}

function json(data: any, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

function withAuthCookies(
  response: NextResponse,
  cookiesToSet: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }>
) {
  for (const cookie of cookiesToSet) {
    response.cookies.set(
      cookie.name,
      cookie.value,
      cookie.options as Parameters<typeof response.cookies.set>[2]
    );
  }

  return response;
}
function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL");
  if (!service) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, service, { auth: { persistSession: false } });
}

// GET: lista comentarios + videos + temas + preguntas fundador + premios trimestrales
export async function GET(req: NextRequest) {
  let respond = (data: any, status = 200) => json(data, status);
  try {
    const gate = await requireAdmin(req);
    respond = (data: any, status = 200) => withAuthCookies(json(data, status), gate.cookiesToSet);
    if (!gate.ok) return respond({ error: gate.error, reason: gate.error }, gate.status);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

if (
  status !== null &&
  !["published", "archived", "blocked"].includes(status)
) {
  return respond({ error: "INVALID_STATUS" }, 400);
}

const rawLimit = searchParams.get("limit");
let limit = 200;

if (rawLimit !== null) {
  if (!/^\d+$/.test(rawLimit)) {
    return respond({ error: "INVALID_LIMIT" }, 400);
  }

  const parsedLimit = Number(rawLimit);

  if (
    !Number.isInteger(parsedLimit) ||
    parsedLimit < 1 ||
    parsedLimit > 500
  ) {
    return respond({ error: "INVALID_LIMIT" }, 400);
  }

  limit = parsedLimit;
}

    const supabase = supabaseAdmin();

    let q = supabase
      .from("user_comments")
      .select("id,created_at,group_code,device_id,page,message,status")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return respond({ error: "SUPABASE_ERROR", detail: error.message }, 500);

    const { data: topicRow, error: topicError } = await supabase
      .from("weekly_topics")
      .select(
        "id,topic,question,status,starts_at,ends_at,winner_video_entry_id,winner_votes,winner_published_at"
      )
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (topicError) {
      return respond({ error: "SUPABASE_ERROR", detail: topicError.message }, 500);
    }

    const { data: archivedTopics, error: archivedTopicsError } = await supabase
      .from("weekly_topics")
      .select(
        "id,topic,question,status,starts_at,ends_at,winner_video_entry_id,winner_votes,winner_published_at"
      )
      .eq("status", "archived")
      .order("winner_published_at", { ascending: false })
      .limit(10);

    if (archivedTopicsError) {
      return respond({ error: "SUPABASE_ERROR", detail: archivedTopicsError.message }, 500);
    }

    const { data: videoRows, error: videoError } = await supabase
      .from("weekly_video_entries")
      .select("id,created_at,weekly_topic_id,device_id,group_code,platform,video_url,title,status")
      .order("created_at", { ascending: false })
      .limit(100);

    if (videoError) {
      return respond({ error: "SUPABASE_ERROR", detail: videoError.message }, 500);
    }

    const { data: founderQuestions, error: founderQuestionsError } = await supabase
      .from("weekly_founder_questions")
      .select(
        "id,created_at,weekly_topic_id,weekly_video_entry_id,device_id,group_code,question_text,question_status,founder_answer_text,founder_answer_video_url,founder_answered_at,published"
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (founderQuestionsError) {
      return respond({ error: "SUPABASE_ERROR", detail: founderQuestionsError.message }, 500);
    }

    const { data: commentAwards, error: commentAwardsError } = await supabase
      .from("comment_awards")
      .select(
        "id,created_at,user_comment_id,device_id,group_code,award_year,award_quarter,award_title,award_note,contact_status,logistics_note,includes_companion,published,published_at"
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (commentAwardsError) {
      return respond({ error: "SUPABASE_ERROR", detail: commentAwardsError.message }, 500);
    }

    return respond({
      ok: true,
      items: data ?? [],
      weeklyTopic: topicRow ?? null,
      archivedTopics: archivedTopics ?? [],
      videoItems: videoRows ?? [],
      founderQuestions: founderQuestions ?? [],
      commentAwards: commentAwards ?? [],
    });
  } catch (e: any) {
    return respond({ error: "SERVER_ERROR", detail: e?.message ?? String(e) }, 500);
  }
}

// POST: cambia status / ejecuta acciones admin / responde fundador / crea premio trimestral
export async function POST(req: NextRequest) {
  let respond = (data: any, status = 200) => json(data, status);
  try {
    if (!isAllowedMutationOrigin(req)) {
      return json({ error: "ORIGIN_FORBIDDEN" }, 403);
    }

    const gate = await requireAdmin(req);
    respond = (data: any, status = 200) => withAuthCookies(json(data, status), gate.cookiesToSet);
    if (!gate.ok) return respond({ error: gate.error, reason: gate.error }, gate.status);

    const parsedBody = await readJsonObject(req);
    if (!parsedBody.ok) {
      return respond({ error: parsedBody.error }, parsedBody.status);
    }

    const body = parsedBody.value;
    if (body.action !== undefined && typeof body.action !== "string") return respond({ error: "INVALID_ACTION" }, 400);
    const action = typeof body.action === "string" ? body.action.trim() : "";
    const supabase = supabaseAdmin();
    if (action === "upsert_weekly_topic") {
      if (!hasExactKeys(body, ["action", "topic", "question"])) return respond({ error: "INVALID_PAYLOAD" }, 400);
      if (typeof body.topic !== "string") return respond({ error: "INVALID_TOPIC" }, 400);
      if (typeof body.question !== "string") return respond({ error: "INVALID_QUESTION" }, 400);
      const topic = body.topic.trim();
      const question = body.question.trim();
      if (!topic || topic.length > 200) return respond({ error: "INVALID_TOPIC" }, 400);
      if (!question || question.length > 1000) return respond({ error: "INVALID_QUESTION" }, 400);

      const requestId = randomUUID();

      const { data, error } = await supabase
        .rpc("admin_create_weekly_topic", {
          p_topic: topic,
          p_question: question,
          p_actor_email: gate.email,
          p_request_id: requestId,
        })
        .single();

      if (error) {
        return respond({ error: "SUPABASE_ERROR", detail: error.message }, 500);
      }

      return respond({ ok: true, weeklyTopic: data });
    }

    if (action === "run_weekly_rotation") {
      if (!hasExactKeys(body, ["action"])) return respond({ error: "INVALID_PAYLOAD" }, 400);

      const requestId = randomUUID();

      const { data, error } = await supabase.rpc("admin_run_weekly_topics_cycle", {
        p_actor_email: gate.email,
        p_request_id: requestId,
      });

      if (error) {
        return respond({ error: "SUPABASE_ERROR", detail: error.message }, 500);
      }

      return respond({
        ok: true,
        message: "Rotaci\u00f3n semanal ejecutada.",
        result: data,
      });
    }

    if (action === "answer_founder_question") {
      if (!hasExactKeys(body, ["action", "id", "founder_answer_text", "founder_answer_video_url", "published"])) return respond({ error: "INVALID_PAYLOAD" }, 400);
      if (!isUuid(body.id)) return respond({ error: "INVALID_ID" }, 400);
      if (typeof body.founder_answer_text !== "string") return respond({ error: "INVALID_FOUNDER_ANSWER_TEXT" }, 400);
      if (typeof body.founder_answer_video_url !== "string") return respond({ error: "INVALID_FOUNDER_ANSWER_VIDEO_URL" }, 400);
      if (typeof body.published !== "boolean") return respond({ error: "INVALID_PUBLISHED" }, 400);
      const id = body.id.trim();
      const founderAnswerText = body.founder_answer_text.trim();
      const founderAnswerVideoUrl = body.founder_answer_video_url.trim();
      const published = body.published;
      if (founderAnswerText.length > 4000) return respond({ error: "FOUNDER_ANSWER_TEXT_TOO_LONG" }, 400);
      if (founderAnswerVideoUrl.length > 2048) return respond({ error: "FOUNDER_ANSWER_VIDEO_URL_TOO_LONG" }, 400);
      if (founderAnswerVideoUrl) { try { const u = new URL(founderAnswerVideoUrl); if (u.protocol !== "http:" && u.protocol !== "https:") return respond({ error: "INVALID_FOUNDER_ANSWER_VIDEO_URL" }, 400); } catch { return respond({ error: "INVALID_FOUNDER_ANSWER_VIDEO_URL" }, 400); } }
      if (!founderAnswerText && !founderAnswerVideoUrl) {
        return respond({ error: "MISSING_FOUNDER_ANSWER" }, 400);
      }

      const payload: Record<string, any> = {
        founder_answer_text: founderAnswerText || null,
        founder_answer_video_url: founderAnswerVideoUrl || null,
        founder_answered_at: new Date().toISOString(),
        question_status: "answered",
        published,
      };

      const { error } = await supabase
        .from("weekly_founder_questions")
        .update(payload)
        .eq("id", id);

      if (error) return respond({ error: "SUPABASE_ERROR", detail: error.message }, 500);

      return respond({ ok: true });
    }

    if (action === "set_founder_question_publish") {
      if (!hasExactKeys(body, ["action", "id", "published"])) return respond({ error: "INVALID_PAYLOAD" }, 400);
      if (!isUuid(body.id)) return respond({ error: "INVALID_ID" }, 400);
      if (typeof body.published !== "boolean") return respond({ error: "INVALID_PUBLISHED" }, 400);
      const id = body.id.trim();
      const published = body.published;

      const { error } = await supabase
        .from("weekly_founder_questions")
        .update({ published })
        .eq("id", id);

      if (error) return respond({ error: "SUPABASE_ERROR", detail: error.message }, 500);

      return respond({ ok: true });
    }

    if (action === "create_comment_award") {
      if (!hasExactKeys(body, ["action", "user_comment_id", "device_id", "group_code", "award_year", "award_quarter", "award_title", "award_note", "contact_status", "logistics_note", "includes_companion", "published"])) return respond({ error: "INVALID_PAYLOAD" }, 400);
      if (!isUuid(body.user_comment_id)) return respond({ error: "INVALID_USER_COMMENT_ID" }, 400);
      if (body.device_id !== null && typeof body.device_id !== "string") return respond({ error: "INVALID_DEVICE_ID" }, 400);
      if (typeof body.group_code !== "string") return respond({ error: "INVALID_GROUP_CODE" }, 400);
      if (typeof body.award_year !== "number" || !Number.isInteger(body.award_year)) return respond({ error: "INVALID_AWARD_YEAR" }, 400);
      if (typeof body.award_quarter !== "number" || !Number.isInteger(body.award_quarter) || ![1, 2, 3, 4].includes(body.award_quarter)) return respond({ error: "INVALID_AWARD_QUARTER" }, 400);
      if (typeof body.award_title !== "string" || typeof body.award_note !== "string" || typeof body.contact_status !== "string" || typeof body.logistics_note !== "string") return respond({ error: "INVALID_AWARD_TEXT_FIELDS" }, 400);
      if (typeof body.includes_companion !== "boolean") return respond({ error: "INVALID_INCLUDES_COMPANION" }, 400);
      if (typeof body.published !== "boolean") return respond({ error: "INVALID_PUBLISHED" }, 400);
      const userCommentId = body.user_comment_id.trim();
      const deviceId = body.device_id === null ? null : body.device_id.trim();
      const groupCode = body.group_code.trim();
      const awardYear = body.award_year;
      const awardQuarter = body.award_quarter;
      const awardTitle = body.award_title.trim();
      const awardNote = body.award_note.trim();
      const contactStatus = body.contact_status.trim();
      const logisticsNote = body.logistics_note.trim();
      const includesCompanion = body.includes_companion;
      const published = body.published;
      if (!groupCode) return respond({ error: "INVALID_GROUP_CODE" }, 400);
      if (!["pending", "contacted", "confirmed", "completed"].includes(contactStatus)) return respond({ error: "INVALID_CONTACT_STATUS" }, 400);

      const payload = {
        user_comment_id: userCommentId,
        device_id: deviceId,
        group_code: groupCode,
        award_year: awardYear,
        award_quarter: awardQuarter,
        award_title: awardTitle || null,
        award_note: awardNote || null,
        contact_status: contactStatus,
        logistics_note: logisticsNote || null,
        includes_companion: includesCompanion,
        published,
        published_at: published ? new Date().toISOString() : null,
      };

      const { error } = await supabase.from("comment_awards").insert(payload);

      if (error) return respond({ error: "SUPABASE_ERROR", detail: error.message }, 500);

      return respond({ ok: true });
    }

    if (action === "update_comment_award") {
      if (!hasExactKeys(body, ["action", "id", "award_title", "award_note", "contact_status", "logistics_note", "includes_companion", "published"])) return respond({ error: "INVALID_PAYLOAD" }, 400);
      if (!isUuid(body.id)) return respond({ error: "INVALID_ID" }, 400);
      if (typeof body.award_title !== "string" || typeof body.award_note !== "string" || typeof body.contact_status !== "string" || typeof body.logistics_note !== "string") return respond({ error: "INVALID_AWARD_TEXT_FIELDS" }, 400);
      if (typeof body.includes_companion !== "boolean") return respond({ error: "INVALID_INCLUDES_COMPANION" }, 400);
      if (typeof body.published !== "boolean") return respond({ error: "INVALID_PUBLISHED" }, 400);
      const id = body.id.trim();
      const awardTitle = body.award_title.trim();
      const awardNote = body.award_note.trim();
      const contactStatus = body.contact_status.trim();
      const logisticsNote = body.logistics_note.trim();
      const includesCompanion = body.includes_companion;
      const published = body.published;
      if (!["pending", "contacted", "confirmed", "completed"].includes(contactStatus)) return respond({ error: "INVALID_CONTACT_STATUS" }, 400);

      const payload: Record<string, any> = {
        award_title: awardTitle || null,
        award_note: awardNote || null,
        includes_companion: includesCompanion,
        published,
      };

      if (contactStatus) payload.contact_status = contactStatus;
      payload.logistics_note = logisticsNote || null;
      payload.published_at = published ? new Date().toISOString() : null;

      const { error } = await supabase
        .from("comment_awards")
        .update(payload)
        .eq("id", id);

      if (error) return respond({ error: "SUPABASE_ERROR", detail: error.message }, 500);

      return respond({ ok: true });
    }

    const isVideoTarget = body.target === "video";
    if (isVideoTarget) {
      if (!hasExactKeys(body, ["id", "status", "target"])) return respond({ error: "INVALID_PAYLOAD" }, 400);
    } else {
      if (!hasExactKeys(body, ["id", "status"])) return respond({ error: "INVALID_PAYLOAD" }, 400);
    }
    if (!isUuid(body.id)) return respond({ error: "INVALID_ID" }, 400);
    if (typeof body.status !== "string") return respond({ error: "INVALID_STATUS" }, 400);
    const id = body.id.trim();
    const status = body.status.trim();
    const allowed = isVideoTarget ? new Set(["reviewed", "archived", "blocked"]) : new Set(["published", "archived", "blocked"]);
    if (!allowed.has(status)) return respond({ error: "STATUS_NOT_ALLOWED" }, 400);
    const tableName = isVideoTarget ? "weekly_video_entries" : "user_comments";

    const { error } = await supabase
      .from(tableName)
      .update({ status })
      .eq("id", id);

    if (error) return respond({ error: "SUPABASE_ERROR", detail: error.message }, 500);

    return respond({ ok: true });
  } catch (e: any) {
    return respond({ error: "SERVER_ERROR", detail: e?.message ?? String(e) }, 500);
  }
}

// PATCH: actualizar tema semanal activo desde admin
export async function PATCH(req: NextRequest) {
  let respond = (data: any, status = 200) => json(data, status);
  try {
    if (!isAllowedMutationOrigin(req)) {
      return json({ error: "ORIGIN_FORBIDDEN" }, 403);
    }

    const gate = await requireAdmin(req);
    respond = (data: any, status = 200) => withAuthCookies(json(data, status), gate.cookiesToSet);
    if (!gate.ok) return respond({ error: gate.error, reason: gate.error }, gate.status);

    const parsedBody = await readJsonObject(req);
    if (!parsedBody.ok) {
      return respond({ error: parsedBody.error }, parsedBody.status);
    }

    const body = parsedBody.value;
    if (!hasExactKeys(body, ["id", "topic", "question"])) return respond({ error: "INVALID_PAYLOAD" }, 400);
    if (!isUuid(body.id)) return respond({ error: "INVALID_ID" }, 400);
    if (typeof body.topic !== "string") return respond({ error: "INVALID_TOPIC" }, 400);
    if (typeof body.question !== "string") return respond({ error: "INVALID_QUESTION" }, 400);
    const id = body.id.trim();
    const topic = body.topic.trim();
    const question = body.question.trim();
    if (!topic || topic.length > 200) return respond({ error: "INVALID_TOPIC" }, 400);
    if (!question || question.length > 1000) return respond({ error: "INVALID_QUESTION" }, 400);

    const supabase = supabaseAdmin();
    const requestId = randomUUID();

    const { error } = await supabase.rpc("admin_update_active_weekly_topic", {
      p_topic_id: id,
      p_topic: topic,
      p_question: question,
      p_actor_email: gate.email,
      p_request_id: requestId,
    });

    if (error) return respond({ error: "SUPABASE_ERROR", detail: error.message }, 500);

    return respond({ ok: true });
  } catch (e: any) {
    return respond({ error: "SERVER_ERROR", detail: e?.message ?? String(e) }, 500);
  }
}

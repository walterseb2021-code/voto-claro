import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getCookieValue } from "@/lib/http/cookies";

export const runtime = "nodejs";

const DEFAULT_GROUP_CODE = "GENERAL";

type ParticipantRow = {
  id: string;
  alias: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
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

function isValidDeviceId(value: string) {
  return value.length > 0 && value.length <= 120;
}

function isValidId(value: string) {
  return value.length > 0 && value.length <= 120;
}

function isValidEmail(value: string) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone(value: string) {
  return !value || /^[0-9+()\-\s]{6,30}$/.test(value);
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

function toSafeVote(row: any) {
  if (!row?.id) return null;

  return {
    id: row.id,
    weekly_topic_id: row.weekly_topic_id,
    weekly_video_entry_id: row.weekly_video_entry_id,
    created_at: row.created_at,
  };
}

async function findAccessBy(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  column: "device_id" | "email" | "celular",
  value: string
) {
  if (!value) return null;

  const { data, error } = await supabase
    .from("comment_access_participants")
    .select("id")
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[comments/video-votes] access lookup failed", { column, error });
    throw new Error("access lookup failed");
  }

  return data;
}

async function ensureAccess(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  deviceId: string,
  groupCode: string
) {
  const existingByDevice = await findAccessBy(supabase, "device_id", deviceId);
  if (existingByDevice?.id) return existingByDevice.id as string;

  const { data: participant, error: participantError } = await supabase
    .from("project_participants")
    .select("id, alias, full_name, email, phone")
    .eq("device_id", deviceId)
    .limit(1)
    .maybeSingle();

  if (participantError) {
    console.error("[comments/video-votes] participant lookup failed", participantError);
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
    const { error } = await supabase
      .from("comment_access_participants")
      .update({ device_id: deviceId, forum_alias: forumAlias, group_code: groupCode })
      .eq("id", existingByEmail.id);

    if (error) {
      console.error("[comments/video-votes] access update by email failed", error);
      throw new Error("access update failed");
    }

    return existingByEmail.id as string;
  }

  const existingByPhone = await findAccessBy(supabase, "celular", phone);
  if (existingByPhone?.id) {
    const { error } = await supabase
      .from("comment_access_participants")
      .update({ device_id: deviceId, forum_alias: forumAlias, group_code: groupCode })
      .eq("id", existingByPhone.id);

    if (error) {
      console.error("[comments/video-votes] access update by phone failed", error);
      throw new Error("access update failed");
    }

    return existingByPhone.id as string;
  }

  const payload: Record<string, unknown> = {
    device_id: deviceId,
    group_code: groupCode,
    forum_alias: forumAlias,
  };

  if (email) payload.email = email;
  if (phone) payload.celular = phone;

  const { data: inserted, error } = await supabase
    .from("comment_access_participants")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error("[comments/video-votes] access insert failed", error);
    throw new Error("access insert failed");
  }

  return inserted.id as string;
}

async function getVotingTopicId(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from("weekly_topics")
    .select("id")
    .eq("status", "voting")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[comments/video-votes] voting topic lookup failed", error);
    throw new Error("topic lookup failed");
  }

  return data?.id ? String(data.id) : null;
}

async function findExistingVote(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  weeklyTopicId: string,
  accessParticipantId: string
) {
  const { data, error } = await supabase
    .from("weekly_video_votes")
    .select("id, weekly_topic_id, weekly_video_entry_id, created_at")
    .eq("weekly_topic_id", weeklyTopicId)
    .eq("access_participant_id", accessParticipantId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[comments/video-votes] existing vote lookup failed", error);
    throw new Error("vote lookup failed");
  }

  return data;
}

async function findReviewedVideo(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  videoId: string
) {
  const { data, error } = await supabase
    .from("weekly_video_entries")
    .select("id, weekly_topic_id, status")
    .eq("id", videoId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[comments/video-votes] video lookup failed", error);
    throw new Error("video lookup failed");
  }

  return data;
}

export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie");
    const legalAccepted = getCookieValue(cookieHeader, "vc_legal_accepted") ?? "";
    const cookieGroup = getCookieValue(cookieHeader, "vc_group") ?? DEFAULT_GROUP_CODE;
    const groupCode = normalizeGroupCode(cookieGroup);

    if (legalAccepted !== "true") {
      return json(401, { ok: false, error: "No autorizado" });
    }

    if (!isAllowedOrigin(req)) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const body = await req.json().catch(() => null);
    const action = cleanText(body?.action, 40);
    const deviceId = cleanText(body?.device_id, 120);

    if (!isValidDeviceId(deviceId)) {
      return json(400, { ok: false, error: "Solicitud invalida" });
    }

    const supabase = getSupabaseAdmin();
    const accessParticipantId = await ensureAccess(supabase, deviceId, groupCode);

    if (!accessParticipantId) {
      return json(403, { ok: false, error: "No autorizado" });
    }

    const weeklyTopicId = await getVotingTopicId(supabase);

    if (!weeklyTopicId) {
      return json(404, { ok: false, error: "No hay tema en votacion" });
    }

    if (action === "mine") {
      const existingVote = await findExistingVote(supabase, weeklyTopicId, accessParticipantId);

      return json(200, {
        ok: true,
        hasVote: Boolean(existingVote?.id),
        vote: toSafeVote(existingVote),
      });
    }

    if (action === "submit") {
      const videoId = cleanText(body?.weekly_video_entry_id, 120);

      if (!isValidId(videoId)) {
        return json(400, { ok: false, error: "Solicitud invalida" });
      }

      const existingVote = await findExistingVote(supabase, weeklyTopicId, accessParticipantId);

      if (existingVote?.id) {
        return json(409, {
          ok: false,
          error: "Ya registraste tu voto en este tema semanal.",
          code: "VOTE_ALREADY_SUBMITTED",
        });
      }

      const video = await findReviewedVideo(supabase, videoId);

      if (!video?.id || String(video.weekly_topic_id) !== weeklyTopicId || video.status !== "reviewed") {
        return json(400, { ok: false, error: "Solicitud invalida" });
      }

      const { data, error } = await supabase
        .from("weekly_video_votes")
        .insert({
          weekly_topic_id: weeklyTopicId,
          weekly_video_entry_id: videoId,
          device_id: deviceId,
          access_participant_id: accessParticipantId,
          group_code: groupCode,
        })
        .select("id, weekly_topic_id, weekly_video_entry_id, created_at")
        .single();

      if (error) {
        console.error("[comments/video-votes] insert failed", error);
        return json(500, { ok: false, error: "No se pudo registrar el voto" });
      }

      return json(200, {
        ok: true,
        vote: toSafeVote(data),
      });
    }

    return json(400, { ok: false, error: "Solicitud invalida" });
  } catch (e) {
    console.error("[comments/video-votes] unexpected error", e);
    return json(500, { ok: false, error: "No disponible" });
  }
}

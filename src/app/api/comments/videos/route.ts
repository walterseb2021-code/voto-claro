import { type NextRequest } from "next/server";
import { getCookieValue } from "@/lib/http/cookies";
import {
  cleanParticipantText,
  isAllowedParticipantMutationOrigin,
  isValidLegacyDeviceId,
  normalizeLegacyDeviceId,
  participantError,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GROUP_CODE = "GENERAL";
const MAX_BODY_BYTES = 2048;
const ALLOWED_PLATFORMS = new Set([
  "YOUTUBE",
  "TIKTOK",
  "FACEBOOK",
  "OTRA",
]);

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

function isValidVideoUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function toSafeVideo(row: any) {
  if (!row?.id) return null;

  return {
    id: row.id,
    status: row.status,
    platform: row.platform,
    video_url: row.video_url,
    title: row.title ?? null,
    created_at: row.created_at,
  };
}

async function getTrustedLegacyDeviceId(
  supabase: SupabaseAdmin,
  participantId: string
) {
  const { data, error } = await supabase
    .from("project_participants")
    .select("device_id")
    .eq("id", participantId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[comments/videos] participant device lookup failed"
    );
    throw new Error("participant device lookup failed");
  }

  const deviceId = normalizeLegacyDeviceId(data?.device_id);

  if (!deviceId || !isValidLegacyDeviceId(deviceId)) {
    return null;
  }

  return deviceId;
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
      "[comments/videos] active topic lookup failed"
    );
    throw new Error("topic lookup failed");
  }

  return data?.id ? String(data.id) : null;
}

async function findExistingVideoBy(
  supabase: SupabaseAdmin,
  weeklyTopicId: string,
  column:
    | "project_participant_id"
    | "participant_device_id"
    | "device_id",
  value: string
) {
  const { data, error } = await supabase
    .from("weekly_video_entries")
    .select(
      "id,status,platform,video_url,title,created_at"
    )
    .eq("weekly_topic_id", weeklyTopicId)
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[comments/videos] existing video lookup failed",
      { column }
    );
    throw new Error("video lookup failed");
  }

  return data;
}

async function findExistingVideo(
  supabase: SupabaseAdmin,
  weeklyTopicId: string,
  participantId: string,
  legacyDeviceId: string | null
) {
  const stable = await findExistingVideoBy(
    supabase,
    weeklyTopicId,
    "project_participant_id",
    participantId
  );

  if (stable?.id || !legacyDeviceId) {
    return stable;
  }

  const legacyParticipantDevice = await findExistingVideoBy(
    supabase,
    weeklyTopicId,
    "participant_device_id",
    legacyDeviceId
  );

  if (legacyParticipantDevice?.id) {
    return legacyParticipantDevice;
  }

  return findExistingVideoBy(
    supabase,
    weeklyTopicId,
    "device_id",
    legacyDeviceId
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantError(403, "origin_invalid");
    }

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

    const body = await readBoundedJsonObject(
      req,
      MAX_BODY_BYTES
    );

    if (!body) {
      return participantError(400, "request_invalid");
    }

    const action = cleanParticipantText(
      body.action,
      40
    );

    if (action !== "mine" && action !== "submit") {
      return participantError(400, "request_invalid");
    }

    const session = await resolveParticipantSession(req);

    if (!session.ok) {
      return participantError(
        session.reason === "unavailable" ? 503 : 401,
        session.reason === "unavailable"
          ? "session_unavailable"
          : "unauthenticated"
      );
    }

    const supabase = session.supabase;
    const participantId = session.participant.id;

    const legacyDeviceId =
      await getTrustedLegacyDeviceId(
        supabase,
        participantId
      );

    const weeklyTopicId =
      await getActiveTopicId(supabase);

    if (!weeklyTopicId) {
      return participantError(404, "active_topic_not_found");
    }

    const existingVideo = await findExistingVideo(
      supabase,
      weeklyTopicId,
      participantId,
      legacyDeviceId
    );

    if (action === "mine") {
      return participantJson(200, {
        ok: true,
        hasVideo: Boolean(existingVideo?.id),
        video: toSafeVideo(existingVideo),
      });
    }

    if (existingVideo?.id) {
      return participantJson(409, {
        ok: false,
        error: "video_already_submitted",
        code: "VIDEO_ALREADY_SUBMITTED",
      });
    }

    if (!legacyDeviceId) {
      return participantError(
        409,
        "participant_device_required"
      );
    }

    const platform = cleanParticipantText(
      body.platform,
      30
    ).toUpperCase();

    const videoUrl = cleanParticipantText(
      body.video_url,
      500
    );

    const title = cleanParticipantText(
      body.title,
      120
    );

    if (
      !ALLOWED_PLATFORMS.has(platform) ||
      !isValidVideoUrl(videoUrl)
    ) {
      return participantError(400, "request_invalid");
    }

    const cookieGroup =
      getCookieValue(cookieHeader, "vc_group") ??
      DEFAULT_GROUP_CODE;

    const groupCode =
      normalizeGroupCode(cookieGroup);

    const { data, error } = await supabase
      .from("weekly_video_entries")
      .insert({
        weekly_topic_id: weeklyTopicId,
        project_participant_id: participantId,
        device_id: legacyDeviceId,
        participant_device_id: legacyDeviceId,
        group_code: groupCode,
        platform,
        video_url: videoUrl,
        title: title || null,
        status: "new",
      })
      .select(
        "id,status,platform,video_url,title,created_at"
      )
      .single();

    if (error) {
      if (
        (error as { code?: string }).code === "23505"
      ) {
        return participantJson(409, {
          ok: false,
          error: "video_already_submitted",
          code: "VIDEO_ALREADY_SUBMITTED",
        });
      }

      if (
        String(
          (error as { message?: string }).message ?? ""
        ).includes("MAX_10_VIDEOS_PER_TOPIC")
      ) {
        return participantJson(409, {
          ok: false,
          error: "topic_video_limit_reached",
          code: "TOPIC_VIDEO_LIMIT_REACHED",
        });
      }

      console.error(
        "[comments/videos] insert failed",
        error
      );

      return participantError(
        500,
        "video_submit_failed"
      );
    }

    return participantJson(200, {
      ok: true,
      video: toSafeVideo(data),
    });
  } catch (error) {
    console.error(
      "[comments/videos] unexpected error",
      error
    );

    return participantError(503, "unavailable");
  }
}

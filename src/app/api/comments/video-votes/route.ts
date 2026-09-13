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

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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
      "[comments/video-votes] participant device lookup failed"
    );
    throw new Error("participant device lookup failed");
  }

  const deviceId = normalizeLegacyDeviceId(data?.device_id);

  if (!deviceId || !isValidLegacyDeviceId(deviceId)) {
    return null;
  }

  return deviceId;
}

async function getVotingTopicId(
  supabase: SupabaseAdmin
) {
  const { data, error } = await supabase
    .from("weekly_topics")
    .select("id")
    .eq("status", "voting")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[comments/video-votes] voting topic lookup failed"
    );
    throw new Error("topic lookup failed");
  }

  return data?.id ? String(data.id) : null;
}

async function findExistingVote(
  supabase: SupabaseAdmin,
  weeklyTopicId: string,
  participantId: string
) {
  const { data, error } = await supabase
    .from("weekly_video_votes")
    .select(
      "id,weekly_topic_id,weekly_video_entry_id,created_at"
    )
    .eq("weekly_topic_id", weeklyTopicId)
    .eq("project_participant_id", participantId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[comments/video-votes] existing vote lookup failed"
    );
    throw new Error("vote lookup failed");
  }

  return data;
}

async function findReviewedVideo(
  supabase: SupabaseAdmin,
  videoId: string
) {
  const { data, error } = await supabase
    .from("weekly_video_entries")
    .select("id,weekly_topic_id,status")
    .eq("id", videoId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[comments/video-votes] video lookup failed"
    );
    throw new Error("video lookup failed");
  }

  return data;
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

    const weeklyTopicId =
      await getVotingTopicId(supabase);

    if (!weeklyTopicId) {
      return participantError(
        404,
        "voting_topic_not_found"
      );
    }

    const existingVote = await findExistingVote(
      supabase,
      weeklyTopicId,
      participantId
    );

    if (action === "mine") {
      return participantJson(200, {
        ok: true,
        hasVote: Boolean(existingVote?.id),
        vote: toSafeVote(existingVote),
      });
    }

    if (existingVote?.id) {
      return participantJson(409, {
        ok: false,
        error: "vote_already_submitted",
        code: "VOTE_ALREADY_SUBMITTED",
      });
    }

    const videoId = cleanParticipantText(
      body.weekly_video_entry_id,
      120
    );

    if (!isValidUuid(videoId)) {
      return participantError(400, "request_invalid");
    }

    const video = await findReviewedVideo(
      supabase,
      videoId
    );

    if (
      !video?.id ||
      String(video.weekly_topic_id) !== weeklyTopicId ||
      video.status !== "reviewed"
    ) {
      return participantError(
        400,
        "video_not_eligible"
      );
    }

    const legacyDeviceId =
      await getTrustedLegacyDeviceId(
        supabase,
        participantId
      );

    if (!legacyDeviceId) {
      return participantError(
        409,
        "participant_device_required"
      );
    }

    const cookieGroup =
      getCookieValue(cookieHeader, "vc_group") ??
      DEFAULT_GROUP_CODE;

    const groupCode =
      normalizeGroupCode(cookieGroup);

    const { data, error } = await supabase
      .from("weekly_video_votes")
      .insert({
        weekly_topic_id: weeklyTopicId,
        weekly_video_entry_id: videoId,
        project_participant_id: participantId,
        device_id: legacyDeviceId,
        access_participant_id: null,
        group_code: groupCode,
      })
      .select(
        "id,weekly_topic_id,weekly_video_entry_id,created_at"
      )
      .single();

    if (error) {
      if (
        (error as { code?: string }).code === "23505"
      ) {
        return participantJson(409, {
          ok: false,
          error: "vote_already_submitted",
          code: "VOTE_ALREADY_SUBMITTED",
        });
      }

      const message = String(
        (error as { message?: string }).message ?? ""
      );

      if (
        message.includes(
          "WEEKLY_VOTE_TOPIC_NOT_VOTING"
        )
      ) {
        return participantError(
          409,
          "voting_topic_not_available"
        );
      }

      if (
        message.includes(
          "WEEKLY_VOTE_VIDEO_NOT_ELIGIBLE"
        )
      ) {
        return participantError(
          409,
          "video_not_eligible"
        );
      }

      console.error(
        "[comments/video-votes] insert failed",
        error
      );

      return participantError(
        500,
        "vote_submit_failed"
      );
    }

    return participantJson(200, {
      ok: true,
      vote: toSafeVote(data),
    });
  } catch (error) {
    console.error(
      "[comments/video-votes] unexpected error",
      error
    );

    return participantError(
      500,
      "video_vote_unavailable"
    );
  }
}

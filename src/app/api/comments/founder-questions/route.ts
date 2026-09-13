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

type WinnerVideoRow = {
  id: string;
  weekly_topic_id: string;
  project_participant_id: string | null;
  access_participant_id: string | null;
  device_id: string | null;
  participant_device_id: string | null;
  group_code: string | null;
};

type WinnerContext = {
  topicId: string;
  videoId: string;
  winnerParticipantId: string | null;
  groupCode: string;
};

function normalizeGroupCode(value: unknown) {
  return cleanParticipantText(value, 40) || DEFAULT_GROUP_CODE;
}

function hasLinks(text: string) {
  return /https?:\/\/|www\./i.test(text);
}

function toSafeQuestion(row: any) {
  if (!row?.id) return null;

  return {
    id: row.id,
    weekly_topic_id: row.weekly_topic_id,
    weekly_video_entry_id: row.weekly_video_entry_id,
    question_text: row.question_text,
    published: Boolean(row.published),
    created_at: row.created_at,
    founder_answer_text:
      row.founder_answer_text ?? null,
    founder_answer_video_url:
      row.founder_answer_video_url ?? null,
  };
}

async function collectParticipantIds(
  supabase: SupabaseAdmin,
  column: "device_id" | "email" | "phone",
  value: string,
  candidates: Set<string>
) {
  if (!value) return;

  const { data, error } = await supabase
    .from("project_participants")
    .select("id")
    .eq(column, value)
    .limit(2);

  if (error) {
    console.error(
      "[comments/founder-questions] participant identity lookup failed",
      { column }
    );
    throw new Error("participant identity lookup failed");
  }

  for (const row of data ?? []) {
    if (row?.id) {
      candidates.add(String(row.id));
    }
  }
}

async function collectLegacyDeviceCandidate(
  supabase: SupabaseAdmin,
  value: unknown,
  candidates: Set<string>
) {
  const deviceId =
    normalizeLegacyDeviceId(value);

  if (
    !deviceId ||
    !isValidLegacyDeviceId(deviceId)
  ) {
    return;
  }

  await collectParticipantIds(
    supabase,
    "device_id",
    deviceId,
    candidates
  );
}

async function resolveHistoricalWinnerParticipantId(
  supabase: SupabaseAdmin,
  video: WinnerVideoRow
) {
  const candidates = new Set<string>();

  await collectLegacyDeviceCandidate(
    supabase,
    video.participant_device_id,
    candidates
  );

  await collectLegacyDeviceCandidate(
    supabase,
    video.device_id,
    candidates
  );

  const accessParticipantId =
    cleanParticipantText(
      video.access_participant_id,
      80
    );

  if (accessParticipantId) {
    const { data: accessData, error: accessError } =
      await supabase
        .from("comment_access_participants")
        .select("device_id,email,celular")
        .eq("id", accessParticipantId)
        .limit(1)
        .maybeSingle();

    if (accessError) {
      console.error(
        "[comments/founder-questions] historical access lookup failed"
      );
      throw new Error("historical access lookup failed");
    }

    if (accessData) {
      await collectLegacyDeviceCandidate(
        supabase,
        accessData.device_id,
        candidates
      );

      const email = cleanParticipantText(
        accessData.email,
        160
      );

      if (email) {
        await collectParticipantIds(
          supabase,
          "email",
          email,
          candidates
        );
      }

      const phone = cleanParticipantText(
        accessData.celular,
        30
      );

      if (phone) {
        await collectParticipantIds(
          supabase,
          "phone",
          phone,
          candidates
        );
      }
    }
  }

  if (candidates.size !== 1) {
    return null;
  }

  return [...candidates][0];
}

async function resolveWinnerParticipantId(
  supabase: SupabaseAdmin,
  video: WinnerVideoRow
) {
  const stableParticipantId =
    cleanParticipantText(
      video.project_participant_id,
      80
    );

  if (stableParticipantId) {
    return stableParticipantId;
  }

  return resolveHistoricalWinnerParticipantId(
    supabase,
    video
  );
}

async function getWinnerContext(
  supabase: SupabaseAdmin
): Promise<WinnerContext | null> {
  const { data: topicData, error: topicError } =
    await supabase
      .from("weekly_topics")
      .select("id,winner_video_entry_id")
      .eq("status", "archived")
      .not("winner_video_entry_id", "is", null)
      .order("winner_published_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("ends_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1)
      .maybeSingle();

  if (topicError) {
    console.error(
      "[comments/founder-questions] winner topic lookup failed"
    );
    throw new Error("winner topic lookup failed");
  }

  if (!topicData?.winner_video_entry_id) {
    return null;
  }

  const { data: videoData, error: videoError } =
    await supabase
      .from("weekly_video_entries")
      .select(
        "id,weekly_topic_id,project_participant_id,access_participant_id,device_id,participant_device_id,group_code"
      )
      .eq(
        "id",
        topicData.winner_video_entry_id
      )
      .limit(1)
      .maybeSingle();

  if (videoError) {
    console.error(
      "[comments/founder-questions] winner video lookup failed"
    );
    throw new Error("winner video lookup failed");
  }

  if (!videoData?.id) {
    return null;
  }

  const video = videoData as WinnerVideoRow;

  const winnerParticipantId =
    await resolveWinnerParticipantId(
      supabase,
      video
    );

  return {
    topicId: String(topicData.id),
    videoId: String(video.id),
    winnerParticipantId,
    groupCode:
      normalizeGroupCode(video.group_code),
  };
}

async function findExistingQuestion(
  supabase: SupabaseAdmin,
  winner: WinnerContext
) {
  const { data, error } = await supabase
    .from("weekly_founder_questions")
    .select(
      "id,created_at,weekly_topic_id,weekly_video_entry_id,question_text,published,founder_answer_text,founder_answer_video_url"
    )
    .eq("weekly_topic_id", winner.topicId)
    .eq("weekly_video_entry_id", winner.videoId)
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[comments/founder-questions] existing question lookup failed"
    );
    throw new Error("question lookup failed");
  }

  return data;
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
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

    const body = await readBoundedJsonObject(
      req,
      MAX_BODY_BYTES
    );

    if (!body) {
      return participantError(
        400,
        "request_invalid"
      );
    }

    const action = cleanParticipantText(
      body.action,
      40
    );

    if (
      action !== "mine" &&
      action !== "submit"
    ) {
      return participantError(
        400,
        "request_invalid"
      );
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

    const supabase = session.supabase;
    const participantId =
      session.participant.id;

    const winner =
      await getWinnerContext(supabase);

    if (!winner) {
      if (action === "mine") {
        return participantJson(200, {
          ok: true,
          canAsk: false,
          hasQuestion: false,
          reason: "NO_WINNER",
          question: null,
        });
      }

      return participantError(
        409,
        "winner_unavailable"
      );
    }

    if (!winner.winnerParticipantId) {
      if (action === "mine") {
        return participantJson(200, {
          ok: true,
          canAsk: false,
          hasQuestion: false,
          reason:
            "WINNER_IDENTITY_UNRESOLVED",
          question: null,
        });
      }

      return participantError(
        409,
        "winner_identity_unresolved"
      );
    }

    if (
      winner.winnerParticipantId !==
      participantId
    ) {
      if (action === "mine") {
        return participantJson(200, {
          ok: true,
          canAsk: false,
          hasQuestion: false,
          reason: "NOT_WINNER",
          question: null,
        });
      }

      return participantError(
        403,
        "not_winner"
      );
    }

    const existingQuestion =
      await findExistingQuestion(
        supabase,
        winner
      );

    if (action === "mine") {
      return participantJson(200, {
        ok: true,
        canAsk:
          !existingQuestion?.id,
        hasQuestion:
          Boolean(existingQuestion?.id),
        question:
          toSafeQuestion(existingQuestion),
      });
    }

    const questionText =
      cleanParticipantText(
        body.question_text,
        500
      );

    if (
      !questionText ||
      hasLinks(questionText)
    ) {
      return participantError(
        400,
        "request_invalid"
      );
    }

    if (existingQuestion?.id) {
      return participantJson(409, {
        ok: false,
        error:
          "question_already_submitted",
        code:
          "QUESTION_ALREADY_SUBMITTED",
      });
    }

    const { data, error } =
      await supabase
        .from("weekly_founder_questions")
        .insert({
          weekly_topic_id:
            winner.topicId,
          weekly_video_entry_id:
            winner.videoId,
          group_code:
            winner.groupCode,
          question_text:
            questionText,
          published: false,
        })
        .select(
          "id,created_at,weekly_topic_id,weekly_video_entry_id,question_text,published,founder_answer_text,founder_answer_video_url"
        )
        .single();

    if (error) {
      if (
        (error as { code?: string }).code ===
        "23505"
      ) {
        return participantJson(409, {
          ok: false,
          error:
            "question_already_submitted",
          code:
            "QUESTION_ALREADY_SUBMITTED",
        });
      }

      console.error(
        "[comments/founder-questions] insert failed",
        error
      );

      return participantError(
        500,
        "question_submit_failed"
      );
    }

    return participantJson(200, {
      ok: true,
      question:
        toSafeQuestion(data),
    });
  } catch (error) {
    console.error(
      "[comments/founder-questions] unexpected error",
      error
    );

    return participantError(
      503,
      "unavailable"
    );
  }
}

import "server-only";

import { getParticipantSupabaseAdmin } from "@/lib/participantApi";

type RetoPrizeAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;
type JsonObject = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^GRUPO[A-Z]$/;

export type RetoPrizeAnswerOutcome =
  | "correct"
  | "wrong"
  | "skipped"
  | "timed_out";

export type RetoPrizeAnswerSessionStatus =
  | "active"
  | "failed"
  | "completed";

export type RetoPrizeAnswerFailure =
  | "conflict"
  | "expired"
  | "invalid_state"
  | "unavailable";

export type CommitRetoPrizeAnswerArgs = {
  sessionId: string;
  participantId: string;
  groupCode: string;
  expectedStateVersion: number;
  questionInstanceId: string;
  answer: boolean | null;
};

export type CommittedRetoPrizeAnswer = {
  sessionId: string;
  instanceId: string;
  stateVersion: number;
  sessionStatus: RetoPrizeAnswerSessionStatus;
  answerOutcome: RetoPrizeAnswerOutcome;
  wasCorrect: boolean;
  qualifierId: string | null;
  alreadyQualified: boolean;
  awardYear: number | null;
  awardQuarter: number | null;
  sessionState: JsonObject;
  finishedAt: string | null;
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown) {
  return UUID_RE.test(String(value ?? "").trim());
}

function firstRpcRow(value: unknown): JsonObject | null {
  if (Array.isArray(value)) {
    return value.length > 0 && isObject(value[0]) ? value[0] : null;
  }

  return isObject(value) ? value : null;
}

function safeIsoDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function safeStatus(value: unknown): RetoPrizeAnswerSessionStatus | null {
  return value === "active" || value === "failed" || value === "completed"
    ? value
    : null;
}

function safeOutcome(value: unknown): RetoPrizeAnswerOutcome | null {
  return value === "correct" ||
    value === "wrong" ||
    value === "skipped" ||
    value === "timed_out"
    ? value
    : null;
}

function nullableUuid(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  return isUuid(text) ? text : undefined;
}

function nullableInteger(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;

  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? numberValue : undefined;
}

function mapAnswerError(error: unknown): RetoPrizeAnswerFailure {
  const message = isObject(error)
    ? String(error.message ?? error.details ?? "")
    : String(error ?? "");

  if (message.includes("RETO_ANSWER_SESSION_EXPIRED")) {
    return "expired";
  }

  if (
    message.includes("RETO_ANSWER_STATE_CONFLICT") ||
    message.includes("RETO_ANSWER_SESSION_NOT_ACTIVE") ||
    message.includes("RETO_ANSWER_ALREADY_COMMITTED")
  ) {
    return "conflict";
  }

  if (
    message.includes("RETO_ANSWER_INVALID_INPUT") ||
    message.includes("RETO_ANSWER_STATE_INVALID") ||
    message.includes("RETO_ANSWER_QUESTION_NOT_FOUND") ||
    message.includes("RETO_ANSWER_GAME_INVALID") ||
    message.includes("RETO_ANSWER_RESULT_STATE_INVALID")
  ) {
    return "invalid_state";
  }

  return "unavailable";
}

export async function commitRetoPrizeAnswerAtomic(
  supabase: RetoPrizeAdminClient,
  args: CommitRetoPrizeAnswerArgs
): Promise<
  | { ok: true; result: CommittedRetoPrizeAnswer }
  | { ok: false; reason: RetoPrizeAnswerFailure }
> {
  const groupCode = String(args.groupCode ?? "").trim();

  if (
    !isUuid(args.sessionId) ||
    !isUuid(args.participantId) ||
    !GROUP_RE.test(groupCode) ||
    !Number.isInteger(args.expectedStateVersion) ||
    args.expectedStateVersion <= 0 ||
    !isUuid(args.questionInstanceId) ||
    !(args.answer === null || typeof args.answer === "boolean")
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const { data, error } = await supabase.rpc(
    "commit_reto_prize_answer_atomic",
    {
      p_session_id: args.sessionId,
      p_participant_id: args.participantId,
      p_group_code: groupCode,
      p_expected_state_version: args.expectedStateVersion,
      p_question_instance_id: args.questionInstanceId,
      p_answer: args.answer,
    }
  );

  if (error) {
    console.error("[reto-prize-answer-engine] atomic answer failed");
    return { ok: false, reason: mapAnswerError(error) };
  }

  const row = firstRpcRow(data);
  if (!row) {
    return { ok: false, reason: "invalid_state" };
  }

  const sessionId = String(row.session_id ?? "").trim();
  const instanceId = String(row.instance_id ?? "").trim();
  const stateVersion = Number(row.state_version);
  const sessionStatus = safeStatus(row.session_status);
  const answerOutcome = safeOutcome(row.answer_outcome);
  const wasCorrect =
    typeof row.was_correct === "boolean" ? row.was_correct : null;
  const qualifierId = nullableUuid(row.qualifier_id);
  const alreadyQualified =
    typeof row.already_qualified === "boolean"
      ? row.already_qualified
      : null;
  const awardYear = nullableInteger(row.award_year);
  const awardQuarter = nullableInteger(row.award_quarter);
  const sessionState = isObject(row.session_state)
    ? row.session_state
    : null;
  const finishedAt =
    row.finished_at === null || row.finished_at === undefined
      ? null
      : safeIsoDateTime(row.finished_at);

  if (
    !isUuid(sessionId) ||
    sessionId !== args.sessionId ||
    !isUuid(instanceId) ||
    instanceId !== args.questionInstanceId ||
    stateVersion !== args.expectedStateVersion + 1 ||
    !sessionStatus ||
    !answerOutcome ||
    wasCorrect === null ||
    alreadyQualified === null ||
    qualifierId === undefined ||
    awardYear === undefined ||
    awardQuarter === undefined ||
    !sessionState ||
    (row.finished_at !== null &&
      row.finished_at !== undefined &&
      !finishedAt)
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  if ((answerOutcome === "correct") !== wasCorrect) {
    return { ok: false, reason: "invalid_state" };
  }

  if (sessionStatus === "active") {
    if (finishedAt !== null) {
      return { ok: false, reason: "invalid_state" };
    }
  } else if (!finishedAt) {
    return { ok: false, reason: "invalid_state" };
  }

  if (sessionStatus === "completed") {
    if (
      qualifierId === null ||
      awardYear === null ||
      awardQuarter === null ||
      awardQuarter < 1 ||
      awardQuarter > 4
    ) {
      return { ok: false, reason: "invalid_state" };
    }
  } else if (
    qualifierId !== null ||
    awardYear !== null ||
    awardQuarter !== null ||
    alreadyQualified
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  return {
    ok: true,
    result: {
      sessionId,
      instanceId,
      stateVersion,
      sessionStatus,
      answerOutcome,
      wasCorrect,
      qualifierId,
      alreadyQualified,
      awardYear,
      awardQuarter,
      sessionState,
      finishedAt,
    },
  };
}

import "server-only";

import { getParticipantSupabaseAdmin } from "@/lib/participantApi";

type RetoPrizeAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;
type JsonObject = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^GRUPO[A-Z]$/;

export type RetoPrizeSpinFailure =
  | "conflict"
  | "expired"
  | "invalid_state"
  | "unavailable";

export type FinalizeRetoPrizeSpinArgs = {
  sessionId: string;
  participantId: string;
  groupCode: string;
  expectedStateVersion: number;
  segment: number;
};

export type FinalizedRetoPrizeSpin = {
  sessionId: string;
  stateVersion: number;
  segment: number;
  isPrize: boolean;
  awarded: boolean;
  awardReason:
    | "not_prize"
    | "recent_prize_lock"
    | "month_unique_lock"
    | "unique_conflict"
    | "awarded";
  winnerId: string | null;
  prizeLockedUntil: string | null;
  sessionStatus: "completed";
  sessionState: JsonObject;
  finishedAt: string;
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

function nullableUuid(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  return isUuid(text) ? text : undefined;
}

function nullableIsoDateTime(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;

  return safeIsoDateTime(value) ?? undefined;
}

function safeAwardReason(
  value: unknown
): FinalizedRetoPrizeSpin["awardReason"] | null {
  return value === "not_prize" ||
    value === "recent_prize_lock" ||
    value === "month_unique_lock" ||
    value === "unique_conflict" ||
    value === "awarded"
    ? value
    : null;
}

function mapSpinError(error: unknown): RetoPrizeSpinFailure {
  const message = isObject(error)
    ? String(error.message ?? error.details ?? "")
    : String(error ?? "");

  if (message.includes("RETO_FINALIZE_SESSION_EXPIRED")) {
    return "expired";
  }

  if (
    message.includes("RETO_FINALIZE_STATE_CONFLICT") ||
    message.includes("RETO_FINALIZE_SESSION_NOT_ACTIVE")
  ) {
    return "conflict";
  }

  if (
    message.includes("RETO_FINALIZE_INVALID_INPUT") ||
    message.includes("RETO_FINALIZE_STATE_INVALID") ||
    message.includes("RETO_FINALIZE_PARTICIPANT_DATA_INVALID") ||
    message.includes("RETO_FINALIZE_RESULT_STATE_INVALID")
  ) {
    return "invalid_state";
  }

  return "unavailable";
}

export async function finalizeRetoPrizeSpinAtomic(
  supabase: RetoPrizeAdminClient,
  args: FinalizeRetoPrizeSpinArgs
): Promise<
  | { ok: true; result: FinalizedRetoPrizeSpin }
  | { ok: false; reason: RetoPrizeSpinFailure }
> {
  const groupCode = String(args.groupCode ?? "").trim();

  if (
    !isUuid(args.sessionId) ||
    !isUuid(args.participantId) ||
    !GROUP_RE.test(groupCode) ||
    !Number.isInteger(args.expectedStateVersion) ||
    args.expectedStateVersion <= 0 ||
    !Number.isInteger(args.segment) ||
    args.segment < 1 ||
    args.segment > 8
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const { data, error } = await supabase.rpc(
    "finalize_reto_principal_spin_atomic",
    {
      p_session_id: args.sessionId,
      p_participant_id: args.participantId,
      p_group_code: groupCode,
      p_expected_state_version: args.expectedStateVersion,
      p_segment: args.segment,
    }
  );

  if (error) {
    console.error("[reto-prize-spin-engine] atomic spin failed");
    return { ok: false, reason: mapSpinError(error) };
  }

  const row = firstRpcRow(data);
  if (!row) {
    return { ok: false, reason: "invalid_state" };
  }

  const sessionId = String(row.session_id ?? "").trim();
  const stateVersion = Number(row.state_version);
  const segment = Number(row.segment);
  const isPrize =
    typeof row.is_prize === "boolean" ? row.is_prize : null;
  const awarded =
    typeof row.awarded === "boolean" ? row.awarded : null;
  const awardReason = safeAwardReason(row.award_reason);
  const winnerId = nullableUuid(row.winner_id);
  const prizeLockedUntil = nullableIsoDateTime(row.prize_locked_until);
  const sessionStatus =
    row.session_status === "completed" ? "completed" : null;
  const sessionState = isObject(row.session_state)
    ? row.session_state
    : null;
  const finishedAt = safeIsoDateTime(row.finished_at);

  if (
    !isUuid(sessionId) ||
    sessionId !== args.sessionId ||
    stateVersion !== args.expectedStateVersion + 1 ||
    segment !== args.segment ||
    isPrize === null ||
    awarded === null ||
    !awardReason ||
    winnerId === undefined ||
    prizeLockedUntil === undefined ||
    !sessionStatus ||
    !sessionState ||
    !finishedAt
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  if (isPrize !== (segment === 2 || segment === 6)) {
    return { ok: false, reason: "invalid_state" };
  }

  if (!isPrize) {
    if (
      awarded ||
      awardReason !== "not_prize" ||
      winnerId !== null ||
      prizeLockedUntil !== null
    ) {
      return { ok: false, reason: "invalid_state" };
    }
  } else if (awarded) {
    if (
      awardReason !== "awarded" ||
      winnerId === null ||
      prizeLockedUntil === null
    ) {
      return { ok: false, reason: "invalid_state" };
    }
  } else {
    if (
      awardReason === "not_prize" ||
      awardReason === "awarded" ||
      winnerId !== null
    ) {
      return { ok: false, reason: "invalid_state" };
    }

    if (
      awardReason === "recent_prize_lock" &&
      prizeLockedUntil === null
    ) {
      return { ok: false, reason: "invalid_state" };
    }

    if (
      (awardReason === "month_unique_lock" ||
        awardReason === "unique_conflict") &&
      prizeLockedUntil !== null
    ) {
      return { ok: false, reason: "invalid_state" };
    }
  }

  return {
    ok: true,
    result: {
      sessionId,
      stateVersion,
      segment,
      isPrize,
      awarded,
      awardReason,
      winnerId,
      prizeLockedUntil,
      sessionStatus,
      sessionState,
      finishedAt,
    },
  };
}

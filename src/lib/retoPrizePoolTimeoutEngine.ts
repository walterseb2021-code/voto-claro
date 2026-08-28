import "server-only";

import { getParticipantSupabaseAdmin } from "@/lib/participantApi";

type RetoPrizeAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;
type JsonObject = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^GRUPO[A-Z]$/;

export type RetoPrincipalPoolTimeoutStatus = "active" | "failed";

export type RetoPrincipalPoolTimeoutFailure =
  | "conflict"
  | "expired"
  | "not_expired"
  | "invalid_state"
  | "unavailable";

export type FinalizeRetoPrincipalPoolTimeoutArgs = {
  sessionId: string;
  participantId: string;
  groupCode: string;
  expectedStateVersion: number;
};

export type FinalizedRetoPrincipalPoolTimeout = {
  sessionId: string;
  stateVersion: number;
  sessionStatus: RetoPrincipalPoolTimeoutStatus;
  levelFinished: true;
  passed: boolean;
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

function safeStatus(value: unknown): RetoPrincipalPoolTimeoutStatus | null {
  return value === "active" || value === "failed" ? value : null;
}

function safeIsoDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function mapPoolTimeoutError(
  error: unknown
): RetoPrincipalPoolTimeoutFailure {
  const message = isObject(error)
    ? String(error.message ?? error.details ?? "")
    : String(error ?? "");

  if (message.includes("RETO_POOL_TIMEOUT_SESSION_EXPIRED")) {
    return "expired";
  }

  if (message.includes("RETO_POOL_TIMEOUT_NOT_EXPIRED")) {
    return "not_expired";
  }

  if (
    message.includes("RETO_POOL_TIMEOUT_STATE_CONFLICT") ||
    message.includes("RETO_POOL_TIMEOUT_SESSION_NOT_ACTIVE") ||
    message.includes("RETO_POOL_TIMEOUT_OPEN_QUESTION")
  ) {
    return "conflict";
  }

  if (
    message.includes("RETO_POOL_TIMEOUT_INVALID_INPUT") ||
    message.includes("RETO_POOL_TIMEOUT_STATE_INVALID") ||
    message.includes("RETO_POOL_TIMEOUT_RESULT_STATE_INVALID")
  ) {
    return "invalid_state";
  }

  return "unavailable";
}

export async function finalizeRetoPrincipalPoolTimeoutAtomic(
  supabase: RetoPrizeAdminClient,
  args: FinalizeRetoPrincipalPoolTimeoutArgs
): Promise<
  | { ok: true; result: FinalizedRetoPrincipalPoolTimeout }
  | { ok: false; reason: RetoPrincipalPoolTimeoutFailure }
> {
  const groupCode = String(args.groupCode ?? "").trim();

  if (
    !isUuid(args.sessionId) ||
    !isUuid(args.participantId) ||
    !GROUP_RE.test(groupCode) ||
    !Number.isInteger(args.expectedStateVersion) ||
    args.expectedStateVersion <= 0
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const { data, error } = await supabase.rpc(
    "finalize_reto_principal_pool_timeout_atomic",
    {
      p_session_id: args.sessionId,
      p_participant_id: args.participantId,
      p_group_code: groupCode,
      p_expected_state_version: args.expectedStateVersion,
    }
  );

  if (error) {
    console.error("[reto-prize-pool-timeout-engine] atomic finalization failed");
    return { ok: false, reason: mapPoolTimeoutError(error) };
  }

  const row = firstRpcRow(data);
  if (!row) {
    return { ok: false, reason: "invalid_state" };
  }

  const sessionId = String(row.session_id ?? "").trim();
  const stateVersion = Number(row.state_version);
  const sessionStatus = safeStatus(row.session_status);
  const levelFinished =
    typeof row.level_finished === "boolean" ? row.level_finished : null;
  const passed = typeof row.passed === "boolean" ? row.passed : null;
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
    stateVersion !== args.expectedStateVersion + 1 ||
    !sessionStatus ||
    levelFinished !== true ||
    passed === null ||
    !sessionState ||
    (row.finished_at !== null &&
      row.finished_at !== undefined &&
      !finishedAt)
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  if (passed) {
    if (sessionStatus !== "active" || finishedAt !== null) {
      return { ok: false, reason: "invalid_state" };
    }
  } else if (sessionStatus !== "failed" || !finishedAt) {
    return { ok: false, reason: "invalid_state" };
  }

  return {
    ok: true,
    result: {
      sessionId,
      stateVersion,
      sessionStatus,
      levelFinished: true,
      passed,
      sessionState,
      finishedAt,
    },
  };
}

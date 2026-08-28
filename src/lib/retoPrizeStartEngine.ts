import "server-only";

import { getParticipantSupabaseAdmin } from "@/lib/participantApi";
import type { RetoGameCode } from "@/lib/retoGameRules";
import {
  parseCaminoPrizeState,
  parsePrincipalPrizeState,
  type CaminoPrizeState,
  type PrincipalPrizeState,
  type RetoSessionRow,
} from "@/lib/retoSecureGame";

type RetoPrizeAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;
type JsonObject = Record<string, unknown>;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^GRUPO[A-Z]$/;

export type RetoPrizeStartFailure =
  | "group_mismatch"
  | "conflict"
  | "invalid_state"
  | "unavailable";

export type StartRetoPrizeSessionArgs = {
  participantId: string;
  groupCode: string;
  gameCode: RetoGameCode;
  initialState: PrincipalPrizeState | CaminoPrizeState;
};

export type StartedRetoPrizeSession =
  | {
      outcome: "created" | "resumed";
      session: RetoSessionRow;
    }
  | {
      outcome: "locked";
      lockedUntil: string;
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

function nullableIsoDateTime(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return safeIsoDateTime(value) ?? undefined;
}

function allSessionSnapshotFieldsNull(row: JsonObject) {
  return (
    row.session_status === null &&
    row.state_version === null &&
    row.session_state === null &&
    row.started_at === null &&
    row.updated_at === null &&
    row.expires_at === null &&
    row.finished_at === null
  );
}

function mapStartError(error: unknown): RetoPrizeStartFailure {
  const message = isObject(error)
    ? String(error.message ?? error.details ?? "")
    : String(error ?? "");

  if (message.includes("RETO_START_STATE_CONFLICT")) {
    return "conflict";
  }

  if (
    message.includes("RETO_START_INVALID_INPUT") ||
    message.includes("RETO_START_PARTICIPANT_NOT_FOUND") ||
    message.includes("RETO_START_RESULT_STATE_INVALID")
  ) {
    return "invalid_state";
  }

  return "unavailable";
}

export async function startRetoPrizeSessionAuthoritative(
  supabase: RetoPrizeAdminClient,
  args: StartRetoPrizeSessionArgs
): Promise<
  | { ok: true; result: StartedRetoPrizeSession }
  | { ok: false; reason: RetoPrizeStartFailure }
> {
  const participantId = String(args.participantId ?? "").trim();
  const groupCode = String(args.groupCode ?? "").trim();

  if (
    !isUuid(participantId) ||
    !GROUP_RE.test(groupCode) ||
    (args.gameCode !== "principal" && args.gameCode !== "camino")
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const validInitialState =
    args.gameCode === "principal"
      ? parsePrincipalPrizeState(args.initialState)
      : parseCaminoPrizeState(args.initialState);

  if (!validInitialState) {
    return { ok: false, reason: "invalid_state" };
  }

  const { data, error } = await supabase.rpc(
    "start_reto_prize_session_atomic",
    {
      p_participant_id: participantId,
      p_group_code: groupCode,
      p_game_code: args.gameCode,
      p_initial_state: validInitialState,
    }
  );

  if (error) {
    console.error("[reto-prize-start-engine] atomic start failed");
    return { ok: false, reason: mapStartError(error) };
  }

  const row = firstRpcRow(data);
  if (!row) {
    return { ok: false, reason: "invalid_state" };
  }

  const outcome = String(row.outcome ?? "");
  const sessionId =
    row.session_id === null || row.session_id === undefined
      ? null
      : String(row.session_id).trim();
  const lockedUntil = nullableIsoDateTime(row.locked_until);

  if (lockedUntil === undefined) {
    return { ok: false, reason: "invalid_state" };
  }

  if (outcome === "group_mismatch") {
    if (
      sessionId === null ||
      !isUuid(sessionId) ||
      lockedUntil !== null ||
      !allSessionSnapshotFieldsNull(row)
    ) {
      return { ok: false, reason: "invalid_state" };
    }

    return { ok: false, reason: "group_mismatch" };
  }

  if (outcome === "locked") {
    if (
      args.gameCode !== "principal" ||
      sessionId !== null ||
      lockedUntil === null ||
      !allSessionSnapshotFieldsNull(row)
    ) {
      return { ok: false, reason: "invalid_state" };
    }

    return {
      ok: true,
      result: {
        outcome: "locked",
        lockedUntil,
      },
    };
  }

  if (outcome !== "created" && outcome !== "resumed") {
    return { ok: false, reason: "invalid_state" };
  }

  if (sessionId === null || !isUuid(sessionId) || lockedUntil !== null) {
    return { ok: false, reason: "invalid_state" };
  }

  const sessionStatus =
    row.session_status === "active" ? "active" : null;
  const stateVersion = Number(row.state_version);
  const sessionState = isObject(row.session_state)
    ? row.session_state
    : null;
  const startedAt = safeIsoDateTime(row.started_at);
  const updatedAt = safeIsoDateTime(row.updated_at);
  const expiresAt = safeIsoDateTime(row.expires_at);
  const finishedAt = nullableIsoDateTime(row.finished_at);

  if (
    !sessionStatus ||
    !Number.isInteger(stateVersion) ||
    stateVersion < 1 ||
    !sessionState ||
    !startedAt ||
    !updatedAt ||
    !expiresAt ||
    finishedAt === undefined ||
    finishedAt !== null
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const parsedState =
    args.gameCode === "principal"
      ? parsePrincipalPrizeState(sessionState)
      : parseCaminoPrizeState(sessionState);

  if (!parsedState) {
    return { ok: false, reason: "invalid_state" };
  }

  if (outcome === "created" && stateVersion !== 1) {
    return { ok: false, reason: "invalid_state" };
  }

  const session: RetoSessionRow = {
    id: sessionId,
    participant_id: participantId,
    group_code: groupCode,
    game_code: args.gameCode,
    game_mode: "con_premio",
    status: sessionStatus,
    state_version: stateVersion,
    state: sessionState,
    started_at: startedAt,
    updated_at: updatedAt,
    expires_at: expiresAt,
    finished_at: finishedAt,
  };

  return {
    ok: true,
    result: {
      outcome,
      session,
    },
  };
}

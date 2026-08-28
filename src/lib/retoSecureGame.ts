import "server-only";

import { randomInt } from "node:crypto";
import { type NextRequest } from "next/server";

import {
  getParticipantSupabaseAdmin,
  type SafeParticipant,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import { resolvePitchAccess } from "@/lib/pitchAccessAuth";
import {
  RETO_CAMINO_RULES,
  RETO_LEVEL2_PARTY_ID,
  RETO_PRINCIPAL_RULES,
  type RetoGameCode,
} from "@/lib/retoGameRules";

type RetoAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;

const GROUP_RE = /^GRUPO[A-Z]$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

export type SecureRetoContextResult =
  | {
      ok: true;
      participant: SafeParticipant;
      group: string;
      supabase: RetoAdminClient;
    }
  | {
      ok: false;
      reason: "unauthenticated" | "pitch_invalid" | "unavailable";
    };

export type RetoSessionStatus =
  | "active"
  | "completed"
  | "failed"
  | "expired"
  | "revoked";

export type RetoSessionRow = {
  id: string;
  participant_id: string;
  group_code: string;
  game_code: RetoGameCode;
  game_mode: "con_premio";
  status: RetoSessionStatus;
  state_version: number;
  state: JsonObject;
  started_at: string;
  updated_at: string;
  expires_at: string;
  finished_at: string | null;
};

export type PrincipalPrizeState = {
  schema_version: 1;
  phase: "level1" | "level2" | "roulette" | "completed" | "failed";
  level: 1 | 2 | 3;
  question_index: number;
  current_question_id: string | null;
  question_deadline: string | null;
  pool_deadline: string | null;
  answered_question_ids: string[];
  good: number;
  bad: number;
  skipped: number;
  party_id: string | null;
  level1_passed: boolean;
  level2_passed: boolean;
  roulette_used: boolean;
  roulette_result: number | null;
};

export type CaminoPrizeState = {
  schema_version: 1;
  position: number;
  turns_left: number;
  current_question_id: string | null;
  question_deadline: string | null;
  answered_question_ids: string[];
  pending_roll: number | null;
  won: boolean;
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown) {
  return UUID_RE.test(String(value ?? "").trim());
}

function isQuestionId(value: unknown) {
  const id = String(value ?? "").trim();
  return (
    id.length > 0 &&
    id.length <= 200 &&
    !/[\u0000-\u001f\u007f]/.test(id)
  );
}

function isIsoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  return Number.isFinite(new Date(value).getTime());
}

function isNullableIsoDate(value: unknown) {
  return value === null || isIsoDate(value);
}

function isIntegerBetween(value: unknown, min: number, max: number) {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function isQuestionIdArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length <= 1000 &&
    value.every((item) => isQuestionId(item))
  );
}

export async function resolveSecureRetoContext(
  req: NextRequest
): Promise<SecureRetoContextResult> {
  const participantAuth = await resolveParticipantSession(req);

  if (!participantAuth.ok) {
    return {
      ok: false,
      reason:
        participantAuth.reason === "unavailable"
          ? "unavailable"
          : "unauthenticated",
    };
  }

  const pitch = await resolvePitchAccess(req, participantAuth.supabase);

  if (!pitch.ok) {
    return {
      ok: false,
      reason: pitch.reason === "unavailable" ? "unavailable" : "pitch_invalid",
    };
  }

  return {
    ok: true,
    participant: participantAuth.participant,
    group: pitch.group,
    supabase: participantAuth.supabase,
  };
}

export function buildInitialPrincipalPrizeState(): PrincipalPrizeState {
  return {
    schema_version: 1,
    phase: "level1",
    level: 1,
    question_index: 0,
    current_question_id: null,
    question_deadline: null,
    pool_deadline: null,
    answered_question_ids: [],
    good: 0,
    bad: 0,
    skipped: 0,
    party_id: null,
    level1_passed: false,
    level2_passed: false,
    roulette_used: false,
    roulette_result: null,
  };
}

export function buildInitialCaminoPrizeState(): CaminoPrizeState {
  return {
    schema_version: 1,
    position: 0,
    turns_left: RETO_CAMINO_RULES.initialTurns,
    current_question_id: null,
    question_deadline: null,
    answered_question_ids: [],
    pending_roll: null,
    won: false,
  };
}

export function parsePrincipalPrizeState(
  value: unknown
): PrincipalPrizeState | null {
  if (!isObject(value)) return null;

  const validPhase =
    value.phase === "level1" ||
    value.phase === "level2" ||
    value.phase === "roulette" ||
    value.phase === "completed" ||
    value.phase === "failed";

  const validLevel =
    value.level === 1 || value.level === 2 || value.level === 3;

  const currentQuestionId =
    value.current_question_id === null &&
    value.question_deadline === null
      ? null
      : isQuestionId(value.current_question_id) && isIsoDate(value.question_deadline)
      ? String(value.current_question_id)
      : undefined;

  const validPartyId =
    value.party_id === null || value.party_id === RETO_LEVEL2_PARTY_ID;

  if (
    value.schema_version !== 1 ||
    !validPhase ||
    !validLevel ||
    !isIntegerBetween(value.question_index, 0, 25) ||
    currentQuestionId === undefined ||
    !isNullableIsoDate(value.pool_deadline) ||
    !isQuestionIdArray(value.answered_question_ids) ||
    !isIntegerBetween(value.good, 0, 25) ||
    !isIntegerBetween(value.bad, 0, 25) ||
    !isIntegerBetween(value.skipped, 0, 25) ||
    !validPartyId ||
    typeof value.level1_passed !== "boolean" ||
    typeof value.level2_passed !== "boolean" ||
    typeof value.roulette_used !== "boolean" ||
    !(
      value.roulette_result === null ||
      isIntegerBetween(
        value.roulette_result,
        1,
        RETO_PRINCIPAL_RULES.level3.segments
      )
    )
  ) {
    return null;
  }

  return value as PrincipalPrizeState;
}

export function parseCaminoPrizeState(value: unknown): CaminoPrizeState | null {
  if (!isObject(value)) return null;

  const currentQuestionId =
    value.current_question_id === null &&
    value.question_deadline === null
      ? null
      : isQuestionId(value.current_question_id) && isIsoDate(value.question_deadline)
      ? String(value.current_question_id)
      : undefined;

  if (
    value.schema_version !== 1 ||
    !isIntegerBetween(value.position, 0, RETO_CAMINO_RULES.totalSquares) ||
    !isIntegerBetween(value.turns_left, 0, RETO_CAMINO_RULES.initialTurns) ||
    currentQuestionId === undefined ||
    !isQuestionIdArray(value.answered_question_ids) ||
    !(
      value.pending_roll === null ||
      isIntegerBetween(value.pending_roll, 1, 6)
    ) ||
    typeof value.won !== "boolean"
  ) {
    return null;
  }

  return value as CaminoPrizeState;
}

function parseSessionRow(value: unknown): RetoSessionRow | null {
  if (!isObject(value)) return null;

  const validGameCode =
    value.game_code === "principal" || value.game_code === "camino";

  const validStatus =
    value.status === "active" ||
    value.status === "completed" ||
    value.status === "failed" ||
    value.status === "expired" ||
    value.status === "revoked";

  if (
    !isUuid(value.id) ||
    !isUuid(value.participant_id) ||
    typeof value.group_code !== "string" ||
    !GROUP_RE.test(value.group_code) ||
    !validGameCode ||
    value.game_mode !== "con_premio" ||
    !validStatus ||
    !isIntegerBetween(value.state_version, 1, Number.MAX_SAFE_INTEGER) ||
    !isObject(value.state) ||
    !isIsoDate(value.started_at) ||
    !isIsoDate(value.updated_at) ||
    !isIsoDate(value.expires_at) ||
    !isNullableIsoDate(value.finished_at)
  ) {
    return null;
  }

  return value as RetoSessionRow;
}

const SESSION_SELECT =
  "id,participant_id,group_code,game_code,game_mode,status,state_version,state,started_at,updated_at,expires_at,finished_at";

export async function loadAnyActiveRetoSession(
  supabase: RetoAdminClient,
  participantId: string,
  gameCode: RetoGameCode
): Promise<
  | { ok: true; session: RetoSessionRow | null }
  | { ok: false; reason: "unavailable" | "invalid_state" }
> {
  if (!isUuid(participantId)) {
    return { ok: false, reason: "invalid_state" };
  }

  const { data, error } = await supabase
    .from("reto_game_sessions")
    .select(SESSION_SELECT)
    .eq("participant_id", participantId)
    .eq("game_code", gameCode)
    .eq("game_mode", "con_premio")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[reto-secure-game] active session lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  if (!data) {
    return { ok: true, session: null };
  }

  const session = parseSessionRow(data);
  if (!session) {
    console.error("[reto-secure-game] malformed active session row");
    return { ok: false, reason: "invalid_state" };
  }

  return { ok: true, session };
}

export async function loadActiveRetoSession(
  supabase: RetoAdminClient,
  participantId: string,
  group: string,
  gameCode: RetoGameCode
): Promise<
  | { ok: true; session: RetoSessionRow | null }
  | { ok: false; reason: "unavailable" | "invalid_state" }
> {
  if (!GROUP_RE.test(group)) {
    return { ok: false, reason: "invalid_state" };
  }

  const active = await loadAnyActiveRetoSession(
    supabase,
    participantId,
    gameCode
  );

  if (!active.ok || !active.session) {
    return active;
  }

  if (active.session.group_code !== group) {
    console.error("[reto-secure-game] active session group mismatch");
    return { ok: false, reason: "invalid_state" };
  }

  return active;
}

export function isRetoSessionExpired(session: RetoSessionRow, now = Date.now()) {
  const expiresAt = new Date(session.expires_at).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function secureRandomDieRoll() {
  return randomInt(1, 7);
}

export function secureRandomRouletteSegment() {
  return randomInt(1, RETO_PRINCIPAL_RULES.level3.segments + 1);
}

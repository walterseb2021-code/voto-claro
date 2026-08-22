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
  RETO_ACTIVE_SESSION_TTL_SEC,
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

export type InternalRetoQuestion = {
  id: string;
  question: string;
  answer: boolean;
  note: string | null;
};

export type PublicRetoQuestion = {
  id: string;
  question: string;
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

function safeQuestionText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 && text.length <= 5000 ? text : null;
}

function safeNote(value: unknown) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length <= 5000 ? text || null : null;
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

export async function loadRetoSessionById(
  supabase: RetoAdminClient,
  participantId: string,
  group: string,
  gameCode: RetoGameCode,
  sessionId: string
): Promise<
  | { ok: true; session: RetoSessionRow | null }
  | { ok: false; reason: "unavailable" | "invalid_state" }
> {
  if (
    !isUuid(participantId) ||
    !isUuid(sessionId) ||
    !GROUP_RE.test(group)
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const { data, error } = await supabase
    .from("reto_game_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .eq("participant_id", participantId)
    .eq("group_code", group)
    .eq("game_code", gameCode)
    .eq("game_mode", "con_premio")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[reto-secure-game] session by id lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  if (!data) {
    return { ok: true, session: null };
  }

  const session = parseSessionRow(data);
  return session
    ? { ok: true, session }
    : { ok: false, reason: "invalid_state" };
}

export function isRetoSessionExpired(session: RetoSessionRow, now = Date.now()) {
  const expiresAt = new Date(session.expires_at).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export async function expireRetoSession(
  supabase: RetoAdminClient,
  session: RetoSessionRow
): Promise<
  | { ok: true; session: RetoSessionRow }
  | { ok: false; reason: "conflict" | "unavailable" | "invalid_state" }
> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("reto_game_sessions")
    .update({
      status: "expired",
      state_version: session.state_version + 1,
      updated_at: now,
      finished_at: now,
    })
    .eq("id", session.id)
    .eq("participant_id", session.participant_id)
    .eq("group_code", session.group_code)
    .eq("status", "active")
    .eq("state_version", session.state_version)
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error) {
    console.error("[reto-secure-game] session expiration failed");
    return { ok: false, reason: "unavailable" };
  }

  if (!data) {
    return { ok: false, reason: "conflict" };
  }

  const parsed = parseSessionRow(data);
  return parsed
    ? { ok: true, session: parsed }
    : { ok: false, reason: "invalid_state" };
}

export async function createRetoPrizeSession(
  supabase: RetoAdminClient,
  participantId: string,
  group: string,
  gameCode: RetoGameCode,
  state: PrincipalPrizeState | CaminoPrizeState
): Promise<
  | { ok: true; session: RetoSessionRow }
  | { ok: false; reason: "conflict" | "unavailable" | "invalid_state" }
> {
  if (!isUuid(participantId) || !GROUP_RE.test(group)) {
    return { ok: false, reason: "invalid_state" };
  }

  const validState =
    gameCode === "principal"
      ? parsePrincipalPrizeState(state)
      : parseCaminoPrizeState(state);

  if (!validState) {
    return { ok: false, reason: "invalid_state" };
  }

  const now = Date.now();
  const expiresAt = new Date(
    now + RETO_ACTIVE_SESSION_TTL_SEC * 1000
  ).toISOString();

  const { data, error } = await supabase
    .from("reto_game_sessions")
    .insert({
      participant_id: participantId,
      group_code: group,
      game_code: gameCode,
      game_mode: "con_premio",
      status: "active",
      state_version: 1,
      state,
      expires_at: expiresAt,
    })
    .select(SESSION_SELECT)
    .single();

  if (error) {
    if (String(error.code ?? "") === "23505") {
      return { ok: false, reason: "conflict" };
    }

    console.error("[reto-secure-game] session creation failed");
    return { ok: false, reason: "unavailable" };
  }

  const parsed = parseSessionRow(data);
  return parsed
    ? { ok: true, session: parsed }
    : { ok: false, reason: "invalid_state" };
}

export async function updateRetoSessionState(
  supabase: RetoAdminClient,
  session: RetoSessionRow,
  nextState: PrincipalPrizeState | CaminoPrizeState,
  options?: {
    status?: "active" | "completed" | "failed" | "revoked";
    finish?: boolean;
  }
): Promise<
  | { ok: true; session: RetoSessionRow }
  | { ok: false; reason: "conflict" | "unavailable" | "invalid_state" }
> {
  const validState =
    session.game_code === "principal"
      ? parsePrincipalPrizeState(nextState)
      : parseCaminoPrizeState(nextState);

  if (!validState) {
    return { ok: false, reason: "invalid_state" };
  }

  const status = options?.status ?? "active";
  const now = new Date().toISOString();

  const payload: Record<string, unknown> = {
    state: nextState,
    state_version: session.state_version + 1,
    status,
    updated_at: now,
  };

  if (options?.finish || status !== "active") {
    payload.finished_at = now;
  }

  const { data, error } = await supabase
    .from("reto_game_sessions")
    .update(payload)
    .eq("id", session.id)
    .eq("participant_id", session.participant_id)
    .eq("group_code", session.group_code)
    .eq("status", "active")
    .eq("state_version", session.state_version)
    .select(SESSION_SELECT)
    .maybeSingle();

  if (error) {
    console.error("[reto-secure-game] session state update failed");
    return { ok: false, reason: "unavailable" };
  }

  if (!data) {
    return { ok: false, reason: "conflict" };
  }

  const parsed = parseSessionRow(data);
  return parsed
    ? { ok: true, session: parsed }
    : { ok: false, reason: "invalid_state" };
}

export async function getPrincipalPrizeStartLock(
  supabase: RetoAdminClient,
  participantId: string,
  now = Date.now()
): Promise<
  | { ok: true; locked: false; lockedUntil: null }
  | { ok: true; locked: true; lockedUntil: string }
  | { ok: false; reason: "unavailable" | "invalid_state" }
> {
  if (!isUuid(participantId) || !Number.isFinite(now)) {
    return { ok: false, reason: "invalid_state" };
  }

  const lockMs = RETO_PRINCIPAL_RULES.prizeAttempt.lockSec * 1000;
  const cutoff = new Date(now - lockMs).toISOString();

  const { data, error } = await supabase
    .from("reto_game_sessions")
    .select("started_at,status")
    .eq("participant_id", participantId)
    .eq("game_code", "principal")
    .eq("game_mode", "con_premio")
    .neq("status", "revoked")
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[reto-secure-game] principal lock lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  if (!data) {
    return { ok: true, locked: false, lockedUntil: null };
  }

  const startedAt = new Date(String(data.started_at ?? "")).getTime();
  if (!Number.isFinite(startedAt)) {
    return { ok: false, reason: "invalid_state" };
  }

  const lockedUntilMs = startedAt + lockMs;
  if (lockedUntilMs <= now) {
    return { ok: true, locked: false, lockedUntil: null };
  }

  return {
    ok: true,
    locked: true,
    lockedUntil: new Date(lockedUntilMs).toISOString(),
  };
}

export function secureRandomDieRoll() {
  return randomInt(1, 7);
}

export function secureRandomRouletteSegment() {
  return randomInt(1, RETO_PRINCIPAL_RULES.level3.segments + 1);
}

export function isWinningRouletteSegment(segment: number) {
  return RETO_PRINCIPAL_RULES.level3.winningSegments.includes(
    segment as 2 | 6
  );
}

type RetoAtomicFinalizeFailure =
  | "conflict"
  | "expired"
  | "unavailable"
  | "invalid_state";

function firstRpcRow(value: unknown): JsonObject | null {
  if (Array.isArray(value)) {
    return value.length > 0 && isObject(value[0]) ? value[0] : null;
  }

  return isObject(value) ? value : null;
}

function mapAtomicFinalizeError(error: unknown): RetoAtomicFinalizeFailure {
  const message = isObject(error)
    ? String(error.message ?? error.details ?? "")
    : String(error ?? "");

  if (message.includes("EXPIRED")) return "expired";

  if (
    message.includes("STATE_CONFLICT") ||
    message.includes("SESSION_NOT_ACTIVE") ||
    message.includes("STATE_INVALID") ||
    message.includes("NEXT_STATE_INVALID") ||
    message.includes("TURNS_INVALID")
  ) {
    return "conflict";
  }

  return "unavailable";
}

export async function finalizePrincipalSpinAtomic(
  supabase: RetoAdminClient,
  session: RetoSessionRow
): Promise<
  | {
      ok: true;
      session: RetoSessionRow;
      segment: number;
      isPrize: boolean;
      awarded: boolean;
      prizeLockedUntil: string | null;
    }
  | { ok: false; reason: RetoAtomicFinalizeFailure }
> {
  if (
    session.game_code !== "principal" ||
    session.game_mode !== "con_premio" ||
    session.status !== "active"
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const state = parsePrincipalPrizeState(session.state);
  if (
    !state ||
    state.phase !== "roulette" ||
    !state.level1_passed ||
    !state.level2_passed ||
    state.roulette_used
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const segment = secureRandomRouletteSegment();

  const { data, error } = await supabase.rpc(
    "finalize_reto_principal_spin_atomic",
    {
      p_session_id: session.id,
      p_participant_id: session.participant_id,
      p_group_code: session.group_code,
      p_expected_state_version: session.state_version,
      p_segment: segment,
    }
  );

  if (error) {
    console.error("[reto-secure-game] principal atomic finalization failed");
    return { ok: false, reason: mapAtomicFinalizeError(error) };
  }

  const row = firstRpcRow(data);
  const returnedSegment = Number(row?.segment);
  const returnedVersion = Number(row?.state_version);
  const isPrize = row?.is_prize;
  const awarded = row?.awarded;
  const prizeLockedUntil =
    row?.prize_locked_until === null || row?.prize_locked_until === undefined
      ? null
      : String(row.prize_locked_until);

  if (
    !row ||
    returnedSegment !== segment ||
    returnedVersion !== session.state_version + 1 ||
    typeof isPrize !== "boolean" ||
    typeof awarded !== "boolean" ||
    (prizeLockedUntil !== null && !isIsoDate(prizeLockedUntil))
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const loaded = await loadRetoSessionById(
    supabase,
    session.participant_id,
    session.group_code,
    "principal",
    session.id
  );

  if (!loaded.ok) return loaded;
  if (!loaded.session || loaded.session.status !== "completed") {
    return { ok: false, reason: "invalid_state" };
  }

  const completedState = parsePrincipalPrizeState(loaded.session.state);
  if (
    !completedState ||
    completedState.phase !== "completed" ||
    !completedState.roulette_used ||
    completedState.roulette_result !== segment
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  return {
    ok: true,
    session: loaded.session,
    segment,
    isPrize,
    awarded,
    prizeLockedUntil,
  };
}

export async function finalizeCaminoWinAtomic(
  supabase: RetoAdminClient,
  session: RetoSessionRow,
  nextState: CaminoPrizeState
): Promise<
  | {
      ok: true;
      session: RetoSessionRow;
      qualifierId: string;
      alreadyQualified: boolean;
      awardYear: number;
      awardQuarter: number;
    }
  | { ok: false; reason: RetoAtomicFinalizeFailure }
> {
  if (
    session.game_code !== "camino" ||
    session.game_mode !== "con_premio" ||
    session.status !== "active"
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const validNextState = parseCaminoPrizeState(nextState);
  if (
    !validNextState ||
    !validNextState.won ||
    validNextState.position !== RETO_CAMINO_RULES.totalSquares ||
    validNextState.current_question_id !== null ||
    validNextState.question_deadline !== null ||
    validNextState.pending_roll !== null
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const { data, error } = await supabase.rpc(
    "finalize_reto_camino_win_atomic",
    {
      p_session_id: session.id,
      p_participant_id: session.participant_id,
      p_group_code: session.group_code,
      p_expected_state_version: session.state_version,
      p_next_state: nextState,
    }
  );

  if (error) {
    console.error("[reto-secure-game] camino atomic finalization failed");
    return { ok: false, reason: mapAtomicFinalizeError(error) };
  }

  const row = firstRpcRow(data);
  const returnedVersion = Number(row?.state_version);
  const qualifierId = String(row?.qualifier_id ?? "").trim();
  const alreadyQualified = row?.already_qualified;
  const awardYear = Number(row?.award_year);
  const awardQuarter = Number(row?.award_quarter);

  if (
    !row ||
    returnedVersion !== session.state_version + 1 ||
    !isUuid(qualifierId) ||
    typeof alreadyQualified !== "boolean" ||
    !isIntegerBetween(awardYear, 2020, 2200) ||
    !isIntegerBetween(awardQuarter, 1, 4)
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const loaded = await loadRetoSessionById(
    supabase,
    session.participant_id,
    session.group_code,
    "camino",
    session.id
  );

  if (!loaded.ok) return loaded;
  if (!loaded.session || loaded.session.status !== "completed") {
    return { ok: false, reason: "invalid_state" };
  }

  const completedState = parseCaminoPrizeState(loaded.session.state);
  if (
    !completedState ||
    !completedState.won ||
    completedState.position !== RETO_CAMINO_RULES.totalSquares
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  return {
    ok: true,
    session: loaded.session,
    qualifierId,
    alreadyQualified,
    awardYear,
    awardQuarter,
  };
}

export async function selectSecureRetoQuestion(
  supabase: RetoAdminClient,
  source: "principal_level1" | "principal_level2" | "camino",
  excludeIds: string[]
): Promise<
  | { ok: true; question: InternalRetoQuestion | null }
  | { ok: false; reason: "unavailable" | "invalid_state" }
> {
  const uniqueExcludeIds = Array.from(
    new Set(
      excludeIds
        .map((id) => String(id ?? "").trim())
        .filter((id) => isQuestionId(id))
    )
  ).slice(0, 500);

  let level = 1;
  let partyId: string | null = null;

  if (source === "principal_level2" || source === "camino") {
    level = 2;
    partyId = RETO_LEVEL2_PARTY_ID;
  }

  let query = supabase
    .from("reto_questions")
    .select("id,question,answer,note")
    .eq("level", level)
    .eq("lang", "es")
    .eq("is_active", true)
    .limit(500);

  if (partyId) {
    query = query.eq("party_id", partyId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[reto-secure-game] question lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  const candidates = (data ?? []).flatMap((row: any) => {
    const id = String(row?.id ?? "").trim();
    const question = safeQuestionText(row?.question);

    if (!isQuestionId(id) || !question || typeof row?.answer !== "boolean") {
      return [];
    }

    return [
      {
        id,
        question,
        answer: row.answer,
        note: safeNote(row?.note),
      } satisfies InternalRetoQuestion,
    ];
  });

  if (candidates.length === 0) {
    return { ok: true, question: null };
  }

  const unseen = candidates.filter(
    (candidate) => !uniqueExcludeIds.includes(candidate.id)
  );

  if (unseen.length === 0) {
    return { ok: true, question: null };
  }

  const picked = unseen[randomInt(0, unseen.length)];

  return { ok: true, question: picked };
}

export function toPublicRetoQuestion(
  question: InternalRetoQuestion
): PublicRetoQuestion {
  return {
    id: question.id,
    question: question.question,
  };
}

export async function loadSecureRetoQuestionById(
  supabase: RetoAdminClient,
  source: "principal_level1" | "principal_level2" | "camino",
  questionId: string
): Promise<
  | { ok: true; question: InternalRetoQuestion | null }
  | { ok: false; reason: "unavailable" | "invalid_state" }
> {
  if (!isQuestionId(questionId)) {
    return { ok: false, reason: "invalid_state" };
  }

  const { data, error } = await supabase
    .from("reto_questions")
    .select("id,question,answer,note,level,party_id,lang,is_active")
    .eq("id", questionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[reto-secure-game] question verification lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  if (!data || data.is_active !== true || data.lang !== "es") {
    return { ok: true, question: null };
  }

  const level = Number(data.level);
  const partyId =
    data.party_id === null ? null : String(data.party_id ?? "").trim();

  const validSource =
    source === "principal_level1"
      ? level === 1
      : level === 2 && partyId === RETO_LEVEL2_PARTY_ID;

  const id = String(data.id ?? "").trim();
  const question = safeQuestionText(data.question);

  if (
    !validSource ||
    !isQuestionId(id) ||
    !question ||
    typeof data.answer !== "boolean"
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  return {
    ok: true,
    question: {
      id,
      question,
      answer: data.answer,
      note: safeNote(data.note),
    },
  };
}

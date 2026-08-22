"use client";

export type RetoSecureGameCode = "principal" | "camino";
export type RetoSecureSessionStatus =
  | "active"
  | "completed"
  | "failed"
  | "expired"
  | "revoked";

export type RetoSecureSession = {
  id: string;
  game_code: RetoSecureGameCode;
  status: RetoSecureSessionStatus;
  state_version: number;
  started_at: string;
  expires_at: string;
  finished_at: string | null;
};

export type RetoSecureQuestion = {
  id: string;
  q: string;
};

export type RetoPrincipalProgress = {
  game_code?: "principal";
  phase: "level1" | "level2" | "roulette" | "failed" | "completed";
  level: 1 | 2 | 3;
  question_index: number;
  good: number;
  bad: number;
  skipped: number;
  level1_passed: boolean;
  level2_passed: boolean;
  party_id: string | null;
  pool_deadline: string | null;
};

export type RetoCaminoProgress = {
  game_code?: "camino";
  position: number;
  turns_left: number;
  won: boolean;
};

export type RetoSecureStartResponse = {
  ok: true;
  resumed: boolean;
  session: RetoSecureSession;
  progress: RetoPrincipalProgress | RetoCaminoProgress;
};

export type RetoPrincipalQuestionResponse = {
  ok: true;
  session: RetoSecureSession;
  progress: RetoPrincipalProgress;
  resumed_question?: boolean;
  question?: RetoSecureQuestion;
  question_deadline?: string | null;
  level_finished?: boolean;
  passed?: boolean;
};

export type RetoCaminoQuestionResponse = {
  ok: true;
  session: RetoSecureSession;
  progress: RetoCaminoProgress;
  resumed_question: boolean;
  roll: number;
  question: RetoSecureQuestion;
  question_deadline: string | null;
};

export type RetoSecureQuestionResponse =
  | RetoPrincipalQuestionResponse
  | RetoCaminoQuestionResponse;

export type RetoPrincipalAnswerResponse = {
  ok: true;
  correct: boolean;
  timed_out: boolean;
  skipped: boolean;
  level_finished: boolean;
  passed: boolean | null;
  session: RetoSecureSession;
  progress: RetoPrincipalProgress;
};

export type RetoCaminoAnswerResponse = {
  ok: true;
  correct: boolean;
  timed_out: boolean;
  skipped: boolean;
  roll: number;
  position: number;
  turns_left: number;
  won: boolean;
  game_over: boolean;
  session: RetoSecureSession;
};

export type RetoSecureAnswerResponse =
  | RetoPrincipalAnswerResponse
  | RetoCaminoAnswerResponse;

export type RetoSecureSpinResponse = {
  ok: true;
  session: RetoSecureSession;
  spin: {
    segment: number;
    is_prize: boolean;
    awarded: boolean;
    prize_locked_until: string | null;
  };
};

type RetoSecureErrorPayload = {
  ok?: false;
  code?: unknown;
  error?: unknown;
  locked_until?: unknown;
};

export class RetoSecureClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly lockedUntil: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    lockedUntil: string | null = null
  ) {
    super(message);
    this.name = "RetoSecureClientError";
    this.status = status;
    this.code = code;
    this.lockedUntil = lockedUntil;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isGameCode(value: unknown): value is RetoSecureGameCode {
  return value === "principal" || value === "camino";
}

function isSessionStatus(value: unknown): value is RetoSecureSessionStatus {
  return (
    value === "active" ||
    value === "completed" ||
    value === "failed" ||
    value === "expired" ||
    value === "revoked"
  );
}

function isPrincipalPhase(
  value: unknown
): value is RetoPrincipalProgress["phase"] {
  return (
    value === "level1" ||
    value === "level2" ||
    value === "roulette" ||
    value === "failed" ||
    value === "completed"
  );
}

function isLevel(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  );
}

function parseSession(value: unknown): RetoSecureSession | null {
  if (!isRecord(value)) return null;

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const gameCode = value.game_code;
  const status = value.status;
  const version = value.state_version;
  const startedAt = value.started_at;
  const expiresAt = value.expires_at;
  const finishedAt = value.finished_at;

  if (
    !id ||
    !isGameCode(gameCode) ||
    !isSessionStatus(status) ||
    typeof version !== "number" ||
    !Number.isInteger(version) ||
    version <= 0 ||
    typeof startedAt !== "string" ||
    !startedAt ||
    typeof expiresAt !== "string" ||
    !expiresAt ||
    !(finishedAt === null || typeof finishedAt === "string")
  ) {
    return null;
  }

  return {
    id,
    game_code: gameCode,
    status,
    state_version: version,
    started_at: startedAt,
    expires_at: expiresAt,
    finished_at: finishedAt,
  };
}

function parsePrincipalProgress(value: unknown): RetoPrincipalProgress | null {
  if (!isRecord(value)) return null;

  if (
    value.game_code !== undefined &&
    value.game_code !== "principal"
  ) {
    return null;
  }

  if (
    !isPrincipalPhase(value.phase) ||
    !isLevel(value.level) ||
    !isNonNegativeInteger(value.question_index) ||
    !isNonNegativeInteger(value.good) ||
    !isNonNegativeInteger(value.bad) ||
    !isNonNegativeInteger(value.skipped) ||
    typeof value.level1_passed !== "boolean" ||
    typeof value.level2_passed !== "boolean" ||
    !(value.party_id === null || typeof value.party_id === "string") ||
    !(
      value.pool_deadline === null ||
      typeof value.pool_deadline === "string"
    )
  ) {
    return null;
  }

  return {
    game_code: "principal",
    phase: value.phase,
    level: value.level,
    question_index: value.question_index,
    good: value.good,
    bad: value.bad,
    skipped: value.skipped,
    level1_passed: value.level1_passed,
    level2_passed: value.level2_passed,
    party_id: value.party_id,
    pool_deadline: value.pool_deadline,
  };
}

function parseCaminoProgress(value: unknown): RetoCaminoProgress | null {
  if (!isRecord(value)) return null;

  if (value.game_code !== undefined && value.game_code !== "camino") {
    return null;
  }

  if (
    !isNonNegativeInteger(value.position) ||
    !isNonNegativeInteger(value.turns_left) ||
    typeof value.won !== "boolean"
  ) {
    return null;
  }

  return {
    game_code: "camino",
    position: value.position,
    turns_left: value.turns_left,
    won: value.won,
  };
}

function getErrorText(payload: RetoSecureErrorPayload | null) {
  return typeof payload?.error === "string" && payload.error.trim()
    ? payload.error.trim()
    : "No se pudo completar la operaciÃ³n segura de Reto Ciudadano.";
}

function getErrorCode(payload: RetoSecureErrorPayload | null) {
  return typeof payload?.code === "string" && payload.code.trim()
    ? payload.code.trim()
    : "RETO_CLIENT_REQUEST_FAILED";
}

function getLockedUntil(payload: RetoSecureErrorPayload | null) {
  return typeof payload?.locked_until === "string" && payload.locked_until.trim()
    ? payload.locked_until.trim()
    : null;
}

async function postSecure(
  path: "/start" | "/question" | "/answer" | "/spin",
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/reto-ciudadano/secure${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  });

  const raw = (await response.json().catch(() => null)) as unknown;
  const payload = isRecord(raw) ? raw : null;

  if (!response.ok || payload?.ok !== true) {
    const errorPayload = payload as RetoSecureErrorPayload | null;
    throw new RetoSecureClientError(
      response.status,
      getErrorCode(errorPayload),
      getErrorText(errorPayload),
      getLockedUntil(errorPayload)
    );
  }

  return payload;
}

function requireSession(
  payload: Record<string, unknown>,
  expectedGame: RetoSecureGameCode
) {
  const session = parseSession(payload.session);

  if (!session || session.game_code !== expectedGame) {
    throw new RetoSecureClientError(
      502,
      "RETO_CLIENT_RESPONSE_INVALID",
      "El servidor devolviÃ³ un estado de juego invÃ¡lido."
    );
  }

  return session;
}

export async function startSecureReto(
  gameCode: RetoSecureGameCode
): Promise<RetoSecureStartResponse> {
  const payload = await postSecure("/start", { game_code: gameCode });
  const session = requireSession(payload, gameCode);

  if (typeof payload.resumed !== "boolean") {
    throw new RetoSecureClientError(
      502,
      "RETO_CLIENT_RESPONSE_INVALID",
      "El servidor devolviÃ³ una respuesta de inicio invÃ¡lida."
    );
  }

  const progress =
    gameCode === "principal"
      ? parsePrincipalProgress(payload.progress)
      : parseCaminoProgress(payload.progress);

  if (!progress) {
    throw new RetoSecureClientError(
      502,
      "RETO_CLIENT_RESPONSE_INVALID",
      "El servidor devolviÃ³ un progreso de juego invÃ¡lido."
    );
  }

  return {
    ok: true,
    resumed: payload.resumed,
    session,
    progress,
  };
}

export async function requestSecureRetoQuestion(
  session: RetoSecureSession
): Promise<RetoSecureQuestionResponse> {
  const payload = await postSecure("/question", {
    game_code: session.game_code,
    session_id: session.id,
    state_version: session.state_version,
  });

  const nextSession = requireSession(payload, session.game_code);

  return {
    ...(payload as unknown as RetoSecureQuestionResponse),
    ok: true,
    session: nextSession,
  };
}

export async function answerSecureRetoQuestion(
  session: RetoSecureSession,
  questionId: string,
  answer: boolean | null
): Promise<RetoSecureAnswerResponse> {
  const payload = await postSecure("/answer", {
    game_code: session.game_code,
    session_id: session.id,
    state_version: session.state_version,
    question_id: questionId,
    answer,
  });

  const nextSession = requireSession(payload, session.game_code);

  return {
    ...(payload as unknown as RetoSecureAnswerResponse),
    ok: true,
    session: nextSession,
  };
}

export async function spinSecurePrincipal(
  session: RetoSecureSession
): Promise<RetoSecureSpinResponse> {
  if (session.game_code !== "principal") {
    throw new RetoSecureClientError(
      400,
      "RETO_CLIENT_GAME_INVALID",
      "La ruleta segura solo corresponde al reto principal."
    );
  }

  const payload = await postSecure("/spin", {
    session_id: session.id,
    state_version: session.state_version,
  });

  const nextSession = requireSession(payload, "principal");
  const spin = isRecord(payload.spin) ? payload.spin : null;

  if (
    !spin ||
    typeof spin.segment !== "number" ||
    !Number.isInteger(spin.segment) ||
    spin.segment < 1 ||
    spin.segment > 8 ||
    typeof spin.is_prize !== "boolean" ||
    typeof spin.awarded !== "boolean" ||
    !(
      spin.prize_locked_until === null ||
      typeof spin.prize_locked_until === "string"
    )
  ) {
    throw new RetoSecureClientError(
      502,
      "RETO_CLIENT_RESPONSE_INVALID",
      "El servidor devolviÃ³ un resultado de ruleta invÃ¡lido."
    );
  }

  return {
    ok: true,
    session: nextSession,
    spin: {
      segment: spin.segment,
      is_prize: spin.is_prize,
      awarded: spin.awarded,
      prize_locked_until: spin.prize_locked_until,
    },
  };
}
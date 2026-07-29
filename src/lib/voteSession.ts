import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { type NextRequest, type NextResponse } from "next/server";

export const VOTE_SESSION_COOKIE_NAME = "vc_vote_session";
export const VOTE_SESSION_TOKEN_BYTES = 32;

const VOTE_SESSION_COOKIE_PATH = "/api/vote";
const VOTE_SESSION_TOKEN_LENGTH = 43;
const VOTE_SESSION_SECRET_MIN_BYTES = 32;
const VOTE_SESSION_MAX_KEY_VERSION = 32767;
const VOTE_SESSION_GROUP_CODE_MAX_LENGTH = 32;
const VOTE_SESSION_CAST_KEY_DOMAIN = "voto-claro:vote-session:cast-key";
const VOTE_SESSION_ANSWER_KEY_DOMAIN = "voto-claro:vote-session:answer-key";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DECIMAL_RE = /^[0-9]+$/;

export type VoteSessionConfigurationErrorCode =
  | "INVALID_HMAC_SECRET"
  | "INVALID_KEY_VERSION";

export class VoteSessionConfigurationError extends Error {
  readonly code: VoteSessionConfigurationErrorCode;

  constructor(code: VoteSessionConfigurationErrorCode) {
    super("Vote session configuration is invalid.");
    this.name = "VoteSessionConfigurationError";
    this.code = code;
  }
}

export type VoteSessionKeyInput = {
  token: string;
  roundId: string;
  groupCode: string;
  keyVersion: number;
};

type VoteSessionConfig = {
  hmacSecret: string;
  keyVersion: number;
};

function getVoteSessionConfig(): VoteSessionConfig {
  return {
    hmacSecret: getVoteSessionHmacSecret(),
    keyVersion: getVoteSessionKeyVersion(),
  };
}

function getVoteSessionHmacSecret() {
  const secret = process.env.VOTE_SESSION_HMAC_SECRET;

  if (
    typeof secret !== "string" ||
    secret.length === 0 ||
    Buffer.byteLength(secret, "utf8") < VOTE_SESSION_SECRET_MIN_BYTES
  ) {
    throw new VoteSessionConfigurationError("INVALID_HMAC_SECRET");
  }

  return secret;
}

export function getVoteSessionKeyVersion() {
  const raw = process.env.VOTE_SESSION_KEY_VERSION;

  if (typeof raw !== "string" || !DECIMAL_RE.test(raw)) {
    throw new VoteSessionConfigurationError("INVALID_KEY_VERSION");
  }

  const keyVersion = Number(raw);
  if (
    !Number.isSafeInteger(keyVersion) ||
    keyVersion < 1 ||
    keyVersion > VOTE_SESSION_MAX_KEY_VERSION
  ) {
    throw new VoteSessionConfigurationError("INVALID_KEY_VERSION");
  }

  return keyVersion;
}

export function assertVoteSessionConfiguration() {
  const { keyVersion } = getVoteSessionConfig();
  return { keyVersion };
}

export function createVoteSessionToken() {
  const token = randomBytes(VOTE_SESSION_TOKEN_BYTES).toString("base64url");

  if (!isValidVoteSessionToken(token)) {
    throw new Error("Vote session token generation failed.");
  }

  return token;
}

export function isValidVoteSessionToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export function hashVoteSessionToken(token: string) {
  if (!isValidVoteSessionToken(token)) {
    throw new Error("Invalid vote session token.");
  }

  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  if (!isValidSha256Hex(tokenHash)) {
    throw new Error("Vote session token hash generation failed.");
  }

  return tokenHash;
}

export function isValidSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_HEX_RE.test(value);
}

function isValidKeyVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= VOTE_SESSION_MAX_KEY_VERSION
  );
}

function normalizeRoundId(roundId: string) {
  const value = String(roundId ?? "").trim();
  if (value !== roundId || !UUID_RE.test(value)) {
    throw new Error("Invalid vote session key input.");
  }
  return value;
}

function normalizeGroupCode(groupCode: string) {
  const value = String(groupCode ?? "").trim();

  if (
    value.length === 0 ||
    value.length > VOTE_SESSION_GROUP_CODE_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error("Invalid vote session key input.");
  }

  return value;
}

function normalizeVoteSessionKeyInput(input: VoteSessionKeyInput) {
  if (!isValidVoteSessionToken(input.token)) {
    throw new Error("Invalid vote session key input.");
  }

  if (!isValidKeyVersion(input.keyVersion)) {
    throw new Error("Invalid vote session key input.");
  }

  return {
    token: input.token,
    roundId: normalizeRoundId(input.roundId),
    groupCode: normalizeGroupCode(input.groupCode),
    keyVersion: input.keyVersion,
  };
}

function deriveVoteSessionKey(domain: string, input: VoteSessionKeyInput) {
  const normalized = normalizeVoteSessionKeyInput(input);
  const { hmacSecret } = getVoteSessionConfig();
  const payload = JSON.stringify([
    domain,
    normalized.keyVersion,
    normalized.roundId,
    normalized.groupCode,
    normalized.token,
  ]);

  const key = createHmac("sha256", hmacSecret).update(payload, "utf8").digest("hex");
  if (!isValidSha256Hex(key)) {
    throw new Error("Vote session key derivation failed.");
  }

  return key;
}

export function deriveVoteCastKey(input: VoteSessionKeyInput) {
  return deriveVoteSessionKey(VOTE_SESSION_CAST_KEY_DOMAIN, input);
}

export function deriveVoteAnswerKey(input: VoteSessionKeyInput) {
  return deriveVoteSessionKey(VOTE_SESSION_ANSWER_KEY_DOMAIN, input);
}

export function timingSafeEqualHex(left: unknown, right: unknown) {
  if (!isValidSha256Hex(left) || !isValidSha256Hex(right)) return false;

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  if (leftBuffer.length !== rightBuffer.length) return false;

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function readVoteSessionToken(request: Request | NextRequest) {
  let token: string | undefined;

  if ("cookies" in request) {
    token = request.cookies.get(VOTE_SESSION_COOKIE_NAME)?.value;
  } else {
    const cookieHeader = request.headers.get("cookie");
    token = readCookieHeaderValue(cookieHeader, VOTE_SESSION_COOKIE_NAME);
  }

  return isValidVoteSessionToken(token) ? token : null;
}

export function setVoteSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
) {
  if (!isValidVoteSessionToken(token)) {
    throw new Error("Invalid vote session token.");
  }

  if (!isValidFutureDate(expiresAt)) {
    throw new Error("Invalid vote session cookie expiration.");
  }

  response.cookies.set(VOTE_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: VOTE_SESSION_COOKIE_PATH,
    expires: expiresAt,
  });

  return response;
}

export function clearVoteSessionCookie(response: NextResponse) {
  response.cookies.set(VOTE_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: VOTE_SESSION_COOKIE_PATH,
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}

function isValidFutureDate(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() > Date.now();
}

function readCookieHeaderValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined;

  const found = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  if (!found) return undefined;

  try {
    return decodeURIComponent(found.slice(name.length + 1));
  } catch {
    return undefined;
  }
}

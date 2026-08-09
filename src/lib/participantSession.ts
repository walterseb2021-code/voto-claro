import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { type NextRequest, type NextResponse } from "next/server";

const PARTICIPANT_SESSION_COOKIE_BASE = "vc_participant_session";
const PARTICIPANT_SESSION_COOKIE_HOST = "__Host-vc_participant_session";

const PARTICIPANT_SESSION_TOKEN_BYTES = 32;
const PARTICIPANT_SESSION_TOKEN_LENGTH = 43;
const PARTICIPANT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export function getParticipantSessionCookieName() {
  return process.env.NODE_ENV === "production"
    ? PARTICIPANT_SESSION_COOKIE_HOST
    : PARTICIPANT_SESSION_COOKIE_BASE;
}

export function createParticipantSessionToken() {
  const token = randomBytes(PARTICIPANT_SESSION_TOKEN_BYTES).toString("base64url");

  if (!isValidParticipantSessionToken(token)) {
    throw new Error("Participant session token generation failed.");
  }

  return token;
}

export function isValidParticipantSessionToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === PARTICIPANT_SESSION_TOKEN_LENGTH &&
    TOKEN_RE.test(value)
  );
}

export function hashParticipantSessionToken(token: string) {
  if (!isValidParticipantSessionToken(token)) {
    throw new Error("Invalid participant session token.");
  }

  const hash = createHash("sha256").update(token, "utf8").digest("hex");

  if (!SHA256_HEX_RE.test(hash)) {
    throw new Error("Participant session token hash generation failed.");
  }

  return hash;
}

export function buildParticipantSessionExpiry(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error("Invalid participant session start time.");
  }

  return new Date(now.getTime() + PARTICIPANT_SESSION_MAX_AGE_SECONDS * 1000);
}

export function readParticipantSessionToken(request: Request | NextRequest) {
  const cookieName = getParticipantSessionCookieName();
  let token: string | undefined;

  if ("cookies" in request) {
    token = request.cookies.get(cookieName)?.value;
  } else {
    token = readCookieHeaderValue(request.headers.get("cookie"), cookieName);
  }

  return isValidParticipantSessionToken(token) ? token : null;
}

export function setParticipantSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
) {
  if (!isValidParticipantSessionToken(token)) {
    throw new Error("Invalid participant session token.");
  }

  if (
    !(expiresAt instanceof Date) ||
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() <= Date.now()
  ) {
    throw new Error("Invalid participant session cookie expiration.");
  }

  response.cookies.set(getParticipantSessionCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    maxAge: PARTICIPANT_SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export function clearParticipantSessionCookie(response: NextResponse) {
  response.cookies.set(getParticipantSessionCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}

function readCookieHeaderValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return undefined;

  const found = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  if (!found) return undefined;

  try {
    const value = decodeURIComponent(found.slice(name.length + 1));
    return value || undefined;
  } catch {
    return undefined;
  }
}
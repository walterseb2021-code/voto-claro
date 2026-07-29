import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  VOTE_SESSION_COOKIE_NAME,
  VoteSessionConfigurationError,
  assertVoteSessionConfiguration,
  clearVoteSessionCookie,
  createVoteSessionToken,
  hashVoteSessionToken,
  readVoteSessionToken,
  setVoteSessionCookie,
} from "@/lib/voteSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GROUP_RE = /^GRUPO[A-Z]$/;
const MAX_BODY_BYTES = 256;
const MAX_SESSION_INSERT_ATTEMPTS = 3;
const MIN_KEY_VERSION = 1;
const MAX_KEY_VERSION = 32767;
const CONTENT_LENGTH_RE = /^(0|[1-9][0-9]*)$/;

type IdentityMode = "legacy_device" | "secure_session";

type PitchValidationResult =
  | { ok: true; valid: boolean }
  | { ok: false };

type RoundRow = {
  id: string;
  group_code: string;
  identity_mode: string;
  ends_at: string | null;
  created_at: string;
  is_active: boolean;
};

type VoteRoundSessionRow = {
  id: string;
  round_id: string;
  group_code: string;
  key_version: number | string | null;
  expires_at: string;
  revoked_at: string | null;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
  Vary: "Cookie, Origin",
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, {
    status,
    headers: noStoreHeaders,
  });
}

function error(status: number, code: string) {
  return json(status, { ok: false, error: code });
}

function logOperationFailed() {
  console.error("[vote-session] operation failed");
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Vote session dependency unavailable.");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function tokenToGroup(token: string) {
  const match = token.match(/^(GRUPO[A-Z])-/);
  return match ? match[1] : null;
}

function isAllowedVoteMutationOrigin(req: NextRequest) {
  const originHeader = req.headers.get("origin");
  if (!originHeader) return false;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  if (origin.protocol !== "http:" && origin.protocol !== "https:") return false;
  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    return false;
  }

  const expectedOrigin = req.nextUrl?.origin ?? new URL(req.url).origin;
  return origin.origin === expectedOrigin;
}

function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  const found = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  if (!found) return null;

  try {
    const value = found.slice(name.length + 1);
    return value ? decodeURIComponent(value) : null;
  } catch {
    return null;
  }
}

function isJsonContentType(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  return contentType.toLowerCase().split(";")[0].trim() === "application/json";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasValidContentLength(req: NextRequest) {
  const rawLength = req.headers.get("content-length");
  if (rawLength === null) return true;
  if (!CONTENT_LENGTH_RE.test(rawLength)) return false;

  const length = Number(rawLength);
  return Number.isSafeInteger(length) && length <= MAX_BODY_BYTES;
}

async function readBoundedBody(req: NextRequest) {
  if (!hasValidContentLength(req)) return null;
  if (!req.body) return new Uint8Array();

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

async function validateBody(req: NextRequest) {
  const bodyBytes = await readBoundedBody(req);
  if (bodyBytes === null) return false;
  if (bodyBytes.byteLength === 0) return true;

  let rawBody: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true }).decode(bodyBytes);
  } catch {
    return false;
  }

  if (!rawBody) return true;

  if (!isJsonContentType(req)) return false;

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return false;
  }

  return isPlainObject(body) && Object.keys(body).length === 0;
}

async function validatePitchToken(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  token: string,
  group: string
): Promise<PitchValidationResult> {
  const tokenGroup = tokenToGroup(token);
  if (!tokenGroup || tokenGroup !== group) return { ok: true, valid: false };

  const { data, error: pitchError } = await supabase
    .from("votoclaro_public_links")
    .select("expires_at")
    .eq("token", token)
    .eq("route", "/pitch")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (pitchError) {
    logOperationFailed();
    return { ok: false };
  }

  if (!data) return { ok: true, valid: false };

  if (data.expires_at) {
    const expiresAt = parseDate(data.expires_at);
    if (!expiresAt || expiresAt.getTime() <= Date.now()) {
      return { ok: true, valid: false };
    }
  }

  return { ok: true, valid: true };
}

function resolveGate(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");
  const legalAccepted = readCookieValue(cookieHeader, "vc_legal_accepted") ?? "";
  const group = (readCookieValue(cookieHeader, "vc_group") ?? "").trim();
  const pitchToken = (readCookieValue(cookieHeader, "vc_pitch_token") ?? "").trim();

  if (legalAccepted !== "true" || !group || !GROUP_RE.test(group) || !pitchToken) {
    return null;
  }

  return { group, pitchToken };
}

async function resolveActiveRound(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  group: string
) {
  const { data, error: roundError } = await supabase
    .from("vote_rounds")
    .select("id,group_code,identity_mode,ends_at,created_at,is_active")
    .eq("is_active", true)
    .eq("group_code", group)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<RoundRow>();

  if (roundError) {
    logOperationFailed();
    return { ok: false as const, status: 503 };
  }

  if (!data?.id) {
    return { ok: false as const, status: 404 };
  }

  return { ok: true as const, round: data };
}

function parseIdentityMode(value: unknown): IdentityMode | null {
  return value === "legacy_device" || value === "secure_session" ? value : null;
}

function parseDate(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date)) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isValidKeyVersion(value: unknown) {
  const keyVersion = Number(value);
  return (
    Number.isSafeInteger(keyVersion) &&
    keyVersion >= MIN_KEY_VERSION &&
    keyVersion <= MAX_KEY_VERSION
  );
}

function datesMatch(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

function validateSecureRound(round: RoundRow) {
  const endsAt = parseDate(round.ends_at);
  const createdAt = parseDate(round.created_at);

  if (!endsAt || !createdAt) return null;
  if (endsAt.getTime() <= Date.now()) return null;
  if (endsAt.getTime() <= createdAt.getTime()) return null;

  return { endsAt };
}

async function findExistingSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  token: string
) {
  const tokenHash = hashVoteSessionToken(token);
  const { data, error: sessionError } = await supabase
    .from("vote_round_sessions")
    .select("id,round_id,group_code,key_version,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .limit(1)
    .maybeSingle<VoteRoundSessionRow>();

  if (sessionError) {
    logOperationFailed();
    return { ok: false as const };
  }

  return { ok: true as const, session: data ?? null };
}

function canReuseSession(session: VoteRoundSessionRow, round: RoundRow, endsAt: Date) {
  const sessionExpiresAt = parseDate(session.expires_at);

  return (
    session.round_id === round.id &&
    session.group_code === round.group_code &&
    session.revoked_at === null &&
    Boolean(sessionExpiresAt) &&
    sessionExpiresAt!.getTime() > Date.now() &&
    datesMatch(sessionExpiresAt!, endsAt) &&
    isValidKeyVersion(session.key_version)
  );
}

function isSameRoundSession(session: VoteRoundSessionRow, round: RoundRow) {
  return session.round_id === round.id && session.group_code === round.group_code;
}

async function revokeOutOfScopeSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  session: VoteRoundSessionRow
) {
  if (session.revoked_at !== null) return true;

  const { error: revokeError } = await supabase
    .from("vote_round_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", session.id)
    .is("revoked_at", null);

  if (revokeError) {
    logOperationFailed();
    return false;
  }

  return true;
}

async function createSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  round: RoundRow,
  group: string,
  endsAt: Date,
  keyVersion: number
) {
  for (let attempt = 0; attempt < MAX_SESSION_INSERT_ATTEMPTS; attempt += 1) {
    const token = createVoteSessionToken();
    const tokenHash = hashVoteSessionToken(token);
    const { error: insertError } = await supabase.from("vote_round_sessions").insert({
      token_hash: tokenHash,
      round_id: round.id,
      group_code: group,
      key_version: keyVersion,
      expires_at: endsAt.toISOString(),
    });

    if (!insertError) return { ok: true as const, token };

    if ((insertError as { code?: string }).code !== "23505") {
      logOperationFailed();
      return { ok: false as const };
    }
  }

  logOperationFailed();
  return { ok: false as const };
}

function success(mode: IdentityMode) {
  return json(200, { ok: true, mode });
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedVoteMutationOrigin(req)) {
      return error(403, "origin_invalid");
    }

    if (!(await validateBody(req))) {
      return error(400, "request_invalid");
    }

    const gate = resolveGate(req);
    if (!gate) {
      return error(401, "gate_invalid");
    }

    const supabase = getSupabaseAdmin();
    const pitchResult = await validatePitchToken(supabase, gate.pitchToken, gate.group);
    if (!pitchResult.ok) {
      return error(503, "dependency_unavailable");
    }

    if (!pitchResult.valid) {
      return error(401, "gate_invalid");
    }

    const roundResult = await resolveActiveRound(supabase, gate.group);
    if (!roundResult.ok) {
      return error(roundResult.status, "round_unavailable");
    }

    const round = roundResult.round;
    const mode = parseIdentityMode(round.identity_mode);
    if (!mode || round.group_code !== gate.group || round.is_active !== true) {
      return error(503, "configuration_unavailable");
    }

    if (mode === "legacy_device") {
      const response = success("legacy_device");
      return clearVoteSessionCookie(response);
    }

    const secureRound = validateSecureRound(round);
    if (!secureRound) {
      return error(409, "session_unavailable");
    }

    let config: { keyVersion: number };
    try {
      config = assertVoteSessionConfiguration();
    } catch (configError) {
      if (configError instanceof VoteSessionConfigurationError) {
        return error(503, "configuration_unavailable");
      }
      throw configError;
    }

    const rawCookie = readCookieValue(
      req.headers.get("cookie"),
      VOTE_SESSION_COOKIE_NAME
    );
    const cookieToken = readVoteSessionToken(req);

    if (rawCookie && cookieToken) {
      const existing = await findExistingSession(supabase, cookieToken);
      if (!existing.ok) {
        return error(503, "session_unavailable");
      }

      if (existing.session) {
        if (canReuseSession(existing.session, round, secureRound.endsAt)) {
          return success("secure_session");
        }

        if (isSameRoundSession(existing.session, round)) {
          return error(409, "session_unavailable");
        }

        const revoked = await revokeOutOfScopeSession(supabase, existing.session);
        if (!revoked) {
          return error(503, "session_unavailable");
        }
      }
    }

    const created = await createSession(
      supabase,
      round,
      gate.group,
      secureRound.endsAt,
      config.keyVersion
    );
    if (!created.ok) {
      return error(503, "session_unavailable");
    }

    const response = success("secure_session");
    return setVoteSessionCookie(response, created.token, secureRound.endsAt);
  } catch {
    logOperationFailed();
    return error(503, "session_unavailable");
  }
}

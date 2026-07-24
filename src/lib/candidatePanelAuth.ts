import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "crypto";
import { type NextRequest, type NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promisify } from "util";
import { resolveCandidatePanelIdentity } from "@/lib/candidatePanelCatalog";

const CANDIDATE_PANEL_COOKIE_BASE = "vc_candidate_panel_session";
const CANDIDATE_PANEL_COOKIE_HOST = "__Host-vc_candidate_panel_session";
export const CANDIDATE_PANEL_SESSION_SECONDS = 60 * 60;
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const RATE_LIMIT_SECRET_MIN_LENGTH = 32;
const DEV_RATE_LIMIT_SECRET =
  "development-only-candidate-panel-rate-limit-secret";
const ACCESS_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ACCESS_CODE_LENGTH = 8;
const ACCESS_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
const ACCESS_CODE_VERIFIER_PREFIX = "vcac";
const ACCESS_CODE_VERIFIER_VERSION = "v1";
const ACCESS_CODE_VERIFIER_ALGORITHM = "scrypt";
const ACCESS_CODE_SCRYPT_N = 32768;
const ACCESS_CODE_SCRYPT_R = 8;
const ACCESS_CODE_SCRYPT_P = 1;
const ACCESS_CODE_SCRYPT_KEYLEN = 32;
const ACCESS_CODE_SCRYPT_SALT_BYTES = 16;
const ACCESS_CODE_SCRYPT_MAXMEM = 64 * 1024 * 1024;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const DECIMAL_RE = /^[0-9]+$/;
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions
) => Promise<Buffer>;

type CandidatePanelSessionRow = {
  id: string;
  candidate_id: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
};

type CandidatePanelSession =
  | {
      ok: true;
      sessionId: string;
      candidateId: string;
      storageCandidateId: string;
      candidateName: string;
      expiresAt: string;
    }
  | { ok: false };

type RateLimitResult =
  | { ok: true; allowed: boolean; blockedUntil: string | null }
  | { ok: false };

type IpFingerprintResult = { ok: true; value: string } | { ok: false };

type CandidateAccessCodeVerifier = {
  n: number;
  r: number;
  p: number;
  keylen: number;
  salt: Buffer;
  hash: Buffer;
};

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) throw new Error("Missing Supabase URL configuration");
  return url;
}

export function getCandidatePanelAdminClient(): SupabaseClient {
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!serviceKey) throw new Error("Missing Supabase service role configuration");

  return createClient(getSupabaseUrl(), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getCandidatePanelCookieName() {
  return process.env.NODE_ENV === "production"
    ? CANDIDATE_PANEL_COOKIE_HOST
    : CANDIDATE_PANEL_COOKIE_BASE;
}

function getRateLimitSecret() {
  const configured = process.env.CANDIDATE_PANEL_RATE_LIMIT_SECRET;
  if (configured && configured.length >= RATE_LIMIT_SECRET_MIN_LENGTH) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_RATE_LIMIT_SECRET;
  }

  return null;
}

export function resolveCandidate(candidateId: unknown) {
  return resolveCandidatePanelIdentity(candidateId);
}

export function isValidPinFormat(pin: unknown) {
  return /^\d{4}$/.test(String(pin ?? "").trim());
}

export function normalizeCandidateAccessCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function isValidCandidateAccessCode(value: unknown) {
  return ACCESS_CODE_RE.test(normalizeCandidateAccessCode(value));
}

export function generateCandidateAccessCode() {
  let code = "";
  for (let i = 0; i < ACCESS_CODE_LENGTH; i += 1) {
    code += ACCESS_CODE_ALPHABET.charAt(randomInt(ACCESS_CODE_ALPHABET.length));
  }
  return code;
}

function decodeBase64Url(value: string) {
  if (!value || value.length > 128 || !BASE64URL_RE.test(value)) return null;
  try {
    return Buffer.from(value, "base64url");
  } catch {
    return null;
  }
}

export function parseCandidateAccessCodeVerifier(
  verifier: unknown
): CandidateAccessCodeVerifier | null {
  const value = String(verifier ?? "").trim();
  if (!value || value.length > 300 || /[\u0000-\u001f]/.test(value)) return null;

  const parts = value.split("$");
  if (parts.length !== 9) return null;

  const [prefix, version, algorithm, nRaw, rRaw, pRaw, keylenRaw, saltRaw, hashRaw] =
    parts;
  if (
    prefix !== ACCESS_CODE_VERIFIER_PREFIX ||
    version !== ACCESS_CODE_VERIFIER_VERSION ||
    algorithm !== ACCESS_CODE_VERIFIER_ALGORITHM
  ) {
    return null;
  }

  if (
    !DECIMAL_RE.test(nRaw) ||
    !DECIMAL_RE.test(rRaw) ||
    !DECIMAL_RE.test(pRaw) ||
    !DECIMAL_RE.test(keylenRaw)
  ) {
    return null;
  }

  if (
    nRaw !== String(ACCESS_CODE_SCRYPT_N) ||
    rRaw !== String(ACCESS_CODE_SCRYPT_R) ||
    pRaw !== String(ACCESS_CODE_SCRYPT_P) ||
    keylenRaw !== String(ACCESS_CODE_SCRYPT_KEYLEN)
  ) {
    return null;
  }

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  const keylen = Number(keylenRaw);
  if (
    n !== ACCESS_CODE_SCRYPT_N ||
    r !== ACCESS_CODE_SCRYPT_R ||
    p !== ACCESS_CODE_SCRYPT_P ||
    keylen !== ACCESS_CODE_SCRYPT_KEYLEN
  ) {
    return null;
  }

  const salt = decodeBase64Url(saltRaw);
  const hash = decodeBase64Url(hashRaw);
  if (!salt || salt.length !== ACCESS_CODE_SCRYPT_SALT_BYTES) return null;
  if (!hash || hash.length !== keylen) return null;

  return { n, r, p, keylen, salt, hash };
}

export async function hashCandidateAccessCode(accessCode: unknown) {
  const normalized = normalizeCandidateAccessCode(accessCode);
  if (!isValidCandidateAccessCode(normalized)) {
    throw new Error("Invalid candidate access code format");
  }

  const salt = randomBytes(ACCESS_CODE_SCRYPT_SALT_BYTES);
  const hash = await scryptAsync(normalized, salt, ACCESS_CODE_SCRYPT_KEYLEN, {
    N: ACCESS_CODE_SCRYPT_N,
    r: ACCESS_CODE_SCRYPT_R,
    p: ACCESS_CODE_SCRYPT_P,
    maxmem: ACCESS_CODE_SCRYPT_MAXMEM,
  });

  return [
    ACCESS_CODE_VERIFIER_PREFIX,
    ACCESS_CODE_VERIFIER_VERSION,
    ACCESS_CODE_VERIFIER_ALGORITHM,
    String(ACCESS_CODE_SCRYPT_N),
    String(ACCESS_CODE_SCRYPT_R),
    String(ACCESS_CODE_SCRYPT_P),
    String(ACCESS_CODE_SCRYPT_KEYLEN),
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export async function verifyCandidateAccessCode(
  accessCode: unknown,
  verifier: unknown
) {
  const normalized = normalizeCandidateAccessCode(accessCode);
  if (!isValidCandidateAccessCode(normalized)) {
    return { ok: true, valid: false } as const;
  }

  const parsed = parseCandidateAccessCodeVerifier(verifier);
  if (!parsed) {
    return { ok: false, reason: "malformed-verifier" } as const;
  }

  const hash = await scryptAsync(normalized, parsed.salt, parsed.keylen, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
    maxmem: ACCESS_CODE_SCRYPT_MAXMEM,
  });

  if (hash.length !== parsed.hash.length) {
    return { ok: true, valid: false } as const;
  }

  return { ok: true, valid: timingSafeEqual(hash, parsed.hash) } as const;
}

export function generateCandidatePanelToken() {
  return randomBytes(32).toString("base64url");
}

export function hashCandidatePanelToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isValidCandidatePanelToken(token: unknown) {
  return TOKEN_RE.test(String(token ?? ""));
}

export function safeComparePin(inputPin: string, storedPin: string) {
  const left = Buffer.from(inputPin, "utf8");
  const right = Buffer.from(storedPin, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function getIpFingerprint(req: NextRequest): IpFingerprintResult {
  const secret = getRateLimitSecret();
  if (!secret) return { ok: false };

  let rawIp = "local-development";

  if (process.env.NODE_ENV === "production") {
    const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
    const candidateIp = forwardedFor.split(",")[0]?.trim() ?? "";
    rawIp =
      candidateIp && candidateIp.length <= 128 && !/[\u0000-\u001f]/.test(candidateIp)
        ? candidateIp
        : "unknown-production-origin";
  }

  const value = createHmac("sha256", secret)
    .update(`candidate-panel-ip:${rawIp}`, "utf8")
    .digest("hex");

  return { ok: true, value };
}

export function applyCandidatePanelCookie(response: NextResponse, token: string) {
  response.cookies.set(getCandidatePanelCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CANDIDATE_PANEL_SESSION_SECONDS,
  });
  return response;
}

export function clearCandidatePanelCookie(response: NextResponse) {
  response.cookies.set(getCandidatePanelCookieName(), "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function createCandidatePanelSession(storageCandidateId: string) {
  const token = generateCandidatePanelToken();
  const tokenHash = hashCandidatePanelToken(token);
  const expiresAt = new Date(
    Date.now() + CANDIDATE_PANEL_SESSION_SECONDS * 1000
  ).toISOString();

  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase
    .from("candidate_panel_sessions")
    .insert({
      candidate_id: storageCandidateId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("[candidate-panel] session create failed", error?.message);
    return null;
  }

  return { token, expiresAt };
}

export async function validateCandidatePanelSession(
  req: NextRequest
): Promise<CandidatePanelSession> {
  const token = req.cookies.get(getCandidatePanelCookieName())?.value;
  if (!token) return { ok: false };
  if (!isValidCandidatePanelToken(token)) return { ok: false };

  const tokenHash = hashCandidatePanelToken(token);
  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase
    .from("candidate_panel_sessions")
    .select("id,candidate_id,expires_at,revoked_at,last_seen_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<CandidatePanelSessionRow>();

  if (error || !data) {
    if (error) console.error("[candidate-panel] session lookup failed", error.message);
    return { ok: false };
  }

  if (data.revoked_at) return { ok: false };
  const expiresAtMs = new Date(data.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return { ok: false };

  const identity = resolveCandidatePanelIdentity(data.candidate_id);
  if (!identity) return { ok: false };

  const shouldTouch =
    !data.last_seen_at ||
    new Date(data.last_seen_at).getTime() <= Date.now() - 5 * 60 * 1000;

  if (shouldTouch) {
    const { error: touchError } = await supabase
      .from("candidate_panel_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", data.id);

    if (touchError) {
      console.error("[candidate-panel] session touch failed", touchError.message);
    }
  }

  return {
    ok: true,
    sessionId: data.id,
    candidateId: identity.canonicalId,
    storageCandidateId: identity.storageCandidateId,
    candidateName: identity.displayName,
    expiresAt: data.expires_at,
  };
}

export async function revokeCandidatePanelSession(req: NextRequest) {
  const token = req.cookies.get(getCandidatePanelCookieName())?.value;
  if (!token) return;
  if (!isValidCandidatePanelToken(token)) return;

  const tokenHash = hashCandidatePanelToken(token);
  const supabase = getCandidatePanelAdminClient();
  const { error } = await supabase
    .from("candidate_panel_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("token_hash", tokenHash)
    .is("revoked_at", null);

  if (error) {
    console.error("[candidate-panel] session revoke failed", error.message);
  }
}

export async function revokeCandidatePanelSessionsForCandidate(candidateId: string) {
  const identity = resolveCandidatePanelIdentity(candidateId);
  if (!identity) return { ok: false };

  const supabase = getCandidatePanelAdminClient();
  const { error } = await supabase
    .from("candidate_panel_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("candidate_id", identity.storageCandidateId)
    .is("revoked_at", null);

  if (error) {
    console.error("[candidate-panel] candidate session revoke failed", error.message);
    return { ok: false };
  }

  return { ok: true };
}

export async function checkCandidatePanelRateLimit(
  candidateId: string,
  ipFingerprint: string
): Promise<RateLimitResult> {
  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase.rpc("check_candidate_panel_pin_rate_limit", {
    p_candidate_id: candidateId,
    p_ip_fingerprint: ipFingerprint,
  });

  if (error) {
    console.error("[candidate-panel] rate limit check failed", error.message);
    return { ok: false };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    allowed: Boolean(row?.allowed),
    blockedUntil: typeof row?.blocked_until === "string" ? row.blocked_until : null,
  };
}

export async function recordCandidatePanelPinFailure(
  candidateId: string,
  ipFingerprint: string
): Promise<RateLimitResult> {
  const supabase = getCandidatePanelAdminClient();
  const { data, error } = await supabase.rpc("record_candidate_panel_pin_failure", {
    p_candidate_id: candidateId,
    p_ip_fingerprint: ipFingerprint,
  });

  if (error) {
    console.error("[candidate-panel] rate limit failure record failed", error.message);
    return { ok: false };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    allowed: Boolean(row?.allowed),
    blockedUntil: typeof row?.blocked_until === "string" ? row.blocked_until : null,
  };
}

export async function resetCandidatePanelRateLimit(
  candidateId: string,
  ipFingerprint: string
) {
  const supabase = getCandidatePanelAdminClient();
  const { error } = await supabase.rpc("reset_candidate_panel_pin_rate_limit", {
    p_candidate_id: candidateId,
    p_ip_fingerprint: ipFingerprint,
  });

  if (error) {
    console.error("[candidate-panel] rate limit reset failed", error.message);
  }
}

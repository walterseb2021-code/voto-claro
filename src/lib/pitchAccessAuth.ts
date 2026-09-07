import "server-only";

import { createHmac } from "node:crypto";

import { getParticipantSupabaseAdmin } from "@/lib/participantApi";

export const VC_PITCH_COOKIE = "vc_pitch_token";
export const VC_GROUP_COOKIE = "vc_group";
export const MAX_PITCH_TOKEN_LENGTH = 2048;

const PITCH_RATE_LIMIT_SECRET_MIN_LENGTH = 32;
const DEV_PITCH_RATE_LIMIT_SECRET =
  "development-only-pitch-gate-rate-limit-secret";

type PitchAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;

export type PitchRateLimitResult =
  | {
      ok: true;
      allowed: boolean;
    }
  | {
      ok: false;
    };

export type PitchAccessResult =
  | {
      ok: true;
      token: string;
      group: string;
    }
  | {
      ok: false;
      reason: "invalid" | "unavailable";
    };

function getPitchRateLimitSecret() {
  const configured =
    process.env.PARTICIPANT_RATE_LIMIT_SECRET ||
    process.env.CANDIDATE_PANEL_RATE_LIMIT_SECRET;

  if (
    configured &&
    configured.length >= PITCH_RATE_LIMIT_SECRET_MIN_LENGTH
  ) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_PITCH_RATE_LIMIT_SECRET;
  }

  return null;
}

export function getPitchIpFingerprint(req: Request) {
  const secret = getPitchRateLimitSecret();

  if (!secret) {
    return { ok: false as const };
  }

  let rawIp = "local-development";

  if (process.env.NODE_ENV === "production") {
    const forwardedFor = req.headers.get("x-forwarded-for") ?? "";
    const candidateIp = forwardedFor.split(",")[0]?.trim() ?? "";

    rawIp =
      candidateIp &&
      candidateIp.length <= 128 &&
      !/[\u0000-\u001f]/.test(candidateIp)
        ? candidateIp
        : "unknown-production-origin";
  }

  const value = createHmac("sha256", secret)
    .update(`pitch-gate-ip:${rawIp}`, "utf8")
    .digest("hex");

  return {
    ok: true as const,
    value,
  };
}

function parsePitchRateLimitResult(data: unknown): PitchRateLimitResult {
  const row = Array.isArray(data) ? data[0] : data;

  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return { ok: false };
  }

  const allowed = (row as { allowed?: unknown }).allowed;

  if (typeof allowed !== "boolean") {
    return { ok: false };
  }

  return {
    ok: true,
    allowed,
  };
}

export async function checkPitchAccessRateLimit(
  supabase: PitchAdminClient,
  ipFingerprint: string
): Promise<PitchRateLimitResult> {
  try {
    const { data, error } = await supabase.rpc(
      "check_pitch_access_rate_limit",
      {
        p_ip_fingerprint: ipFingerprint,
      }
    );

    if (error) {
      console.error("[pitch-gate] rate limit check failed");
      return { ok: false };
    }

    return parsePitchRateLimitResult(data);
  } catch {
    console.error("[pitch-gate] rate limit check failed");
    return { ok: false };
  }
}

export async function recordPitchAccessFailure(
  supabase: PitchAdminClient,
  ipFingerprint: string
): Promise<PitchRateLimitResult> {
  try {
    const { data, error } = await supabase.rpc(
      "record_pitch_access_failure",
      {
        p_ip_fingerprint: ipFingerprint,
      }
    );

    if (error) {
      console.error("[pitch-gate] rate limit failure record failed");
      return { ok: false };
    }

    return parsePitchRateLimitResult(data);
  } catch {
    console.error("[pitch-gate] rate limit failure record failed");
    return { ok: false };
  }
}

export function tokenToPitchGroup(token: string) {
  const match = token.match(/^(GRUPO[A-Z])-/);
  return match ? match[1] : null;
}

function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValueParts] = part.trim().split("=");
    if (rawName !== name) continue;

    const rawValue = rawValueParts.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function hasValidExpiration(value: unknown) {
  if (value === null || value === undefined) {
    return true;
  }

  const raw = String(value).trim();
  if (!raw) {
    return false;
  }

  const expiresAt = new Date(raw).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export async function validatePitchToken(
  rawToken: string,
  expectedGroup?: string | null,
  supabase?: PitchAdminClient
): Promise<PitchAccessResult> {
  const token = rawToken.trim();

  if (!token || token.length > MAX_PITCH_TOKEN_LENGTH) {
    return { ok: false, reason: "invalid" };
  }

  const group = tokenToPitchGroup(token);
  if (!group) {
    return { ok: false, reason: "invalid" };
  }

  if (expectedGroup !== undefined && expectedGroup !== null) {
    const normalizedExpectedGroup = expectedGroup.trim();
    if (
      !/^GRUPO[A-Z]$/.test(normalizedExpectedGroup) ||
      normalizedExpectedGroup !== group
    ) {
      return { ok: false, reason: "invalid" };
    }
  }

  try {
    const client = supabase ?? getParticipantSupabaseAdmin();

    const { data, error } = await client
      .from("votoclaro_public_links")
      .select("expires_at")
      .eq("token", token)
      .eq("route", "/pitch")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[pitch-access-auth] access validation failed");
      return { ok: false, reason: "unavailable" };
    }

    if (!data || !hasValidExpiration(data.expires_at)) {
      return { ok: false, reason: "invalid" };
    }

    return {
      ok: true,
      token,
      group,
    };
  } catch {
    console.error("[pitch-access-auth] access validation failed");
    return { ok: false, reason: "unavailable" };
  }
}

export async function resolvePitchAccess(
  req: Request,
  supabase?: PitchAdminClient
): Promise<PitchAccessResult> {
  const cookieHeader = req.headers.get("cookie");
  const token = readCookieValue(cookieHeader, VC_PITCH_COOKIE) ?? "";
  const group = readCookieValue(cookieHeader, VC_GROUP_COOKIE);

  if (!group) {
    return { ok: false, reason: "invalid" };
  }

  return validatePitchToken(token, group, supabase);
}

import "server-only";

import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const PARTICIPANT_RATE_LIMIT_SECRET_MIN_LENGTH = 32;
const DEV_PARTICIPANT_RATE_LIMIT_SECRET =
  "development-only-participant-login-rate-limit-secret";

export const participantNoStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
  Vary: "Cookie, Origin",
};

export type SafeParticipant = {
  id: string;
  alias: string | null;
  display_name: string | null;
};

export type ParticipantRateLimitResult =
  | {
      ok: true;
      allowed: boolean;
      blockedUntil: string | null;
    }
  | { ok: false };

export function participantJson(
  status: number,
  body: Record<string, unknown>
) {
  return NextResponse.json(body, {
    status,
    headers: participantNoStoreHeaders,
  });
}

export function participantError(status: number, code: string) {
  return participantJson(status, {
    ok: false,
    error: code,
  });
}

export function getParticipantSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Participant session dependency unavailable.");
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getParticipantRateLimitSecret() {
  const configured =
    process.env.PARTICIPANT_RATE_LIMIT_SECRET ||
    process.env.CANDIDATE_PANEL_RATE_LIMIT_SECRET;

  if (
    configured &&
    configured.length >= PARTICIPANT_RATE_LIMIT_SECRET_MIN_LENGTH
  ) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_PARTICIPANT_RATE_LIMIT_SECRET;
  }

  return null;
}

export function getParticipantIpFingerprint(req: NextRequest) {
  const secret = getParticipantRateLimitSecret();
  if (!secret) return { ok: false as const };

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
    .update(`participant-login-ip:${rawIp}`, "utf8")
    .digest("hex");

  return { ok: true as const, value };
}

export async function checkParticipantLoginRateLimit(
  supabase: ReturnType<typeof getParticipantSupabaseAdmin>,
  ipFingerprint: string
): Promise<ParticipantRateLimitResult> {
  const { data, error } = await supabase.rpc(
    "check_project_participant_login_rate_limit",
    {
      p_ip_fingerprint: ipFingerprint,
    }
  );

  if (error) {
    console.error("[participant-login] rate limit check failed");
    return { ok: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    ok: true,
    allowed: Boolean(row?.allowed),
    blockedUntil:
      typeof row?.blocked_until === "string" ? row.blocked_until : null,
  };
}

export async function recordParticipantLoginFailure(
  supabase: ReturnType<typeof getParticipantSupabaseAdmin>,
  ipFingerprint: string
): Promise<ParticipantRateLimitResult> {
  const { data, error } = await supabase.rpc(
    "record_project_participant_login_failure",
    {
      p_ip_fingerprint: ipFingerprint,
    }
  );

  if (error) {
    console.error("[participant-login] rate limit failure record failed");
    return { ok: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    ok: true,
    allowed: Boolean(row?.allowed),
    blockedUntil:
      typeof row?.blocked_until === "string" ? row.blocked_until : null,
  };
}


export function isAllowedParticipantMutationOrigin(req: NextRequest) {
  const originHeader = req.headers.get("origin");
  if (!originHeader) return false;

  let origin: URL;
  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    return false;
  }

  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    return false;
  }

  if (
    process.env.NODE_ENV !== "production" &&
    (origin.hostname === "localhost" ||
      origin.hostname === "127.0.0.1" ||
      origin.hostname === "::1")
  ) {
    return true;
  }

  return origin.origin === req.nextUrl.origin;
}

export async function readBoundedJsonObject(
  req: NextRequest,
  maxBodyBytes: number
): Promise<Record<string, unknown> | null> {
  const contentType = (req.headers.get("content-type") ?? "")
    .toLowerCase()
    .split(";")[0]
    .trim();

  if (contentType !== "application/json") return null;

  const rawLength = req.headers.get("content-length");
  if (rawLength !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(rawLength)) return null;

    const parsedLength = Number(rawLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength > maxBodyBytes) {
      return null;
    }
  }

  if (!req.body) return {};

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBodyBytes) {
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

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(body);
  } catch {
    return null;
  }

  if (!decoded) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return null;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

export function cleanParticipantText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export function normalizeParticipantAccessCode(value: unknown) {
  return cleanParticipantText(value, 80).toUpperCase();
}

export function isValidParticipantAccessCode(value: string) {
  return (
    value.length >= 4 &&
    value.length <= 80 &&
    /^[A-Z0-9_-]+$/.test(value)
  );
}

export function normalizeLegacyDeviceId(value: unknown) {
  return cleanParticipantText(value, 120);
}

export function isValidLegacyDeviceId(value: string) {
  return (
    value.length === 0 ||
    (value.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value))
  );
}

export function toSafeParticipant(
  row: { id?: unknown; alias?: unknown; full_name?: unknown } | null
): SafeParticipant | null {
  const id = cleanParticipantText(row?.id, 80);
  if (!id) return null;

  const alias = cleanParticipantText(row?.alias, 80) || null;
  const fullName = cleanParticipantText(row?.full_name, 120) || null;

  return {
    id,
    alias,
    display_name: alias || fullName,
  };
}
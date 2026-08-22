import "server-only";

import { getParticipantSupabaseAdmin } from "@/lib/participantApi";

export const VC_PITCH_COOKIE = "vc_pitch_token";
export const VC_GROUP_COOKIE = "vc_group";
export const MAX_PITCH_TOKEN_LENGTH = 2048;

type PitchAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;

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

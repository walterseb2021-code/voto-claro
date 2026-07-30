import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  VoteSessionConfigurationError,
  deriveVoteCastKey,
  hashVoteSessionToken,
  readVoteSessionToken,
} from "@/lib/voteSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^GRUPO[A-Z]$/;
const MIN_KEY_VERSION = 1;
const MAX_KEY_VERSION = 32767;

type IdentityMode = "legacy_device" | "secure_session";

type PitchValidationResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "dependency" };

type GateResult =
  | { ok: true; group: string; pitchToken: string }
  | { ok: false };

type RoundRow = {
  id: string;
  group_code: string | null;
  identity_mode: string | null;
  ends_at: string | null;
  created_at: string | null;
  is_active: boolean | null;
};

type VoteRoundSessionRow = {
  round_id: string | null;
  group_code: string | null;
  key_version: number | string | null;
  expires_at: string | null;
  revoked_at: string | null;
};

type SecureSessionResult =
  | { ok: true; token: string; keyVersion: number }
  | { ok: false; status: number; body: Record<string, unknown> };

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

function logOperationFailed() {
  console.error("[vote-status] operation failed");
}

function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;

  const prefix = `${name}=`;
  const parts = cookieHeader.split(";");

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part.startsWith(prefix)) continue;

    const rawValue = part.slice(prefix.length);
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function tokenToGroup(token: string) {
  const m = token.match(/^(GRUPO[A-Z])-/);
  return m ? m[1] : null;
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SERVICE_KEY) en variables de entorno."
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function datesMatch(left: Date, right: Date) {
  return left.getTime() === right.getTime();
}

function parseIdentityMode(mode: string | null): IdentityMode | null {
  if (mode === "legacy_device" || mode === "secure_session") return mode;
  return null;
}

function isValidKeyVersion(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_KEY_VERSION &&
    value <= MAX_KEY_VERSION
  );
}

function normalizeKeyVersion(value: number | string | null) {
  if (typeof value === "number") return isValidKeyVersion(value) ? value : null;
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) return null;

  const numeric = Number(value);
  return isValidKeyVersion(numeric) ? numeric : null;
}

function validateGate(req: NextRequest): GateResult {
  const cookieHeader = req.headers.get("cookie");
  const legalAccepted = readCookieValue(cookieHeader, "vc_legal_accepted") ?? "";
  const group = (readCookieValue(cookieHeader, "vc_group") ?? "").trim();
  const pitchToken = (readCookieValue(cookieHeader, "vc_pitch_token") ?? "").trim();

  if (legalAccepted !== "true" || !group || !GROUP_RE.test(group) || !pitchToken) {
    return { ok: false };
  }

  return { ok: true, group, pitchToken };
}

async function validatePitchToken(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  token: string,
  group: string
): Promise<PitchValidationResult> {
  const tokenGroup = tokenToGroup(token);
  if (!tokenGroup || tokenGroup !== group) {
    return { ok: false, reason: "invalid" };
  }

  const { data, error } = await supabase
    .from("votoclaro_public_links")
    .select("expires_at")
    .eq("token", token)
    .eq("route", "/pitch")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle<{ expires_at: string | null }>();

  if (error) {
    logOperationFailed();
    return { ok: false, reason: "dependency" };
  }

  if (!data) return { ok: false, reason: "invalid" };

  const expiresAt = parseDate(data.expires_at);
  if (data.expires_at && (!expiresAt || Date.now() > expiresAt.getTime())) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true };
}

async function resolveActiveRound(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  group: string
) {
  return supabase
    .from("vote_rounds")
    .select("id,group_code,identity_mode,ends_at,created_at,is_active")
    .eq("is_active", true)
    .eq("group_code", group)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<RoundRow>();
}

function validateSecureRound(round: RoundRow) {
  const createdAt = parseDate(round.created_at);
  const endsAt = parseDate(round.ends_at);

  if (!createdAt || !endsAt) return null;
  if (endsAt.getTime() <= createdAt.getTime()) return null;
  if (endsAt.getTime() <= Date.now()) return null;

  return endsAt;
}

async function resolveSecureSession(
  req: NextRequest,
  supabase: ReturnType<typeof getSupabaseAdmin>,
  round: RoundRow,
  group: string
): Promise<SecureSessionResult> {
  const roundEndsAt = validateSecureRound(round);
  if (!roundEndsAt) {
    return {
      ok: false,
      status: 409,
      body: { error: "session_unavailable" },
    };
  }

  const token = readVoteSessionToken(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      body: { error: "session_required" },
    };
  }

  let tokenHash: string;
  try {
    tokenHash = hashVoteSessionToken(token);
  } catch {
    logOperationFailed();
    return {
      ok: false,
      status: 503,
      body: { error: "No disponible" },
    };
  }

  const { data: session, error } = await supabase
    .from("vote_round_sessions")
    .select("round_id,group_code,key_version,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .limit(1)
    .maybeSingle<VoteRoundSessionRow>();

  if (error) {
    logOperationFailed();
    return {
      ok: false,
      status: 503,
      body: { error: "No disponible" },
    };
  }

  if (!session) {
    return {
      ok: false,
      status: 401,
      body: { error: "session_required" },
    };
  }

  if (session.round_id !== round.id || session.group_code !== group) {
    return {
      ok: false,
      status: 409,
      body: { error: "session_unavailable" },
    };
  }

  const expiresAt = parseDate(session.expires_at);
  if (
    session.revoked_at !== null ||
    !expiresAt ||
    expiresAt.getTime() <= Date.now() ||
    !datesMatch(expiresAt, roundEndsAt)
  ) {
    return {
      ok: false,
      status: 409,
      body: { error: "session_unavailable" },
    };
  }

  const keyVersion = normalizeKeyVersion(session.key_version);
  if (!keyVersion) {
    return {
      ok: false,
      status: 503,
      body: { error: "No disponible" },
    };
  }

  return { ok: true, token, keyVersion };
}

function deriveCastKeyOrError(
  token: string,
  roundId: string,
  group: string,
  keyVersion: number
) {
  try {
    return {
      ok: true as const,
      castKey: deriveVoteCastKey({
        token,
        roundId,
        groupCode: group,
        keyVersion,
      }),
    };
  } catch (error) {
    if (error instanceof VoteSessionConfigurationError) {
      return { ok: false as const };
    }

    logOperationFailed();
    return { ok: false as const };
  }
}

function validateLegacyStatusQuery(searchParams: URLSearchParams) {
  const entries = Array.from(searchParams.entries());
  const deviceIds = searchParams.getAll("device_id");

  if (entries.length !== 1 || deviceIds.length !== 1) return null;

  const [key, rawDeviceId] = entries[0] ?? [];
  if (key !== "device_id" || typeof rawDeviceId !== "string") return null;

  const deviceId = rawDeviceId.trim();
  if (deviceId !== rawDeviceId || !UUID_RE.test(deviceId)) return null;

  return deviceId;
}

export async function GET(req: NextRequest) {
  try {
    const gate = validateGate(req);
    if (!gate.ok) {
      return json(401, { error: "No autorizado" });
    }

    const supabase = getSupabaseAdmin();

    const pitch = await validatePitchToken(supabase, gate.pitchToken, gate.group);
    if (!pitch.ok) {
      return json(pitch.reason === "dependency" ? 503 : 401, {
        error: pitch.reason === "dependency" ? "No disponible" : "No autorizado",
      });
    }

    const { data: round, error: roundErr } = await resolveActiveRound(
      supabase,
      gate.group
    );

    if (roundErr) {
      logOperationFailed();
      return json(503, { error: "No disponible" });
    }

    if (!round?.id || round.group_code !== gate.group || round.is_active !== true) {
      return json(404, { error: "No disponible" });
    }

    const identityMode = parseIdentityMode(round.identity_mode);
    if (!identityMode) {
      return json(503, { error: "No disponible" });
    }

    if (identityMode === "legacy_device") {
      const deviceId = validateLegacyStatusQuery(req.nextUrl.searchParams);
      if (!deviceId) {
        return json(400, { error: "Solicitud invalida" });
      }

      const { data: cast, error: castErr } = await supabase
        .from("vote_casts")
        .select("party_id")
        .eq("round_id", round.id)
        .eq("group_code", gate.group)
        .eq("device_id", deviceId)
        .limit(1)
        .maybeSingle<{ party_id: string | null }>();

      if (castErr) {
        logOperationFailed();
        return json(503, { error: "No disponible" });
      }

      if (!cast?.party_id) {
        return json(200, { voted: false });
      }

      return json(200, {
        voted: true,
        party_id: cast.party_id,
      });
    }

    if (Array.from(req.nextUrl.searchParams.entries()).length !== 0) {
      return json(400, { error: "Solicitud invalida" });
    }

    const session = await resolveSecureSession(req, supabase, round, gate.group);
    if (!session.ok) {
      return json(session.status, session.body);
    }

    const castKey = deriveCastKeyOrError(
      session.token,
      round.id,
      gate.group,
      session.keyVersion
    );
    if (!castKey.ok) {
      return json(503, { error: "No disponible" });
    }

    const { data: cast, error: castErr } = await supabase
      .from("vote_casts")
      .select("party_id")
      .eq("round_id", round.id)
      .eq("group_code", gate.group)
      .eq("cast_key", castKey.castKey)
      .limit(1)
      .maybeSingle<{ party_id: string | null }>();

    if (castErr) {
      logOperationFailed();
      return json(503, { error: "No disponible" });
    }

    if (!cast?.party_id) {
      return json(200, { voted: false });
    }

    const { data: party, error: partyErr } = await supabase
      .from("vote_parties")
      .select("slug")
      .eq("id", cast.party_id)
      .eq("round_id", round.id)
      .eq("group_code", gate.group)
      .limit(1)
      .maybeSingle<{ slug: string | null }>();

    if (partyErr || !party?.slug) {
      if (partyErr) logOperationFailed();
      return json(503, { error: "No disponible" });
    }

    return json(200, {
      voted: true,
      party_slug: party.slug,
    });
  } catch {
    logOperationFailed();
    return json(503, { error: "No disponible" });
  }
}

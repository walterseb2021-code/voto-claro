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
const PARTY_SLUG_RE = /^[a-z0-9-]{2,80}$/;
const GROUP_RE = /^GRUPO[A-Z]$/;
const MAX_BODY_BYTES = 1024;
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

type PartyRow = {
  id: string;
  slug: string | null;
  enabled: boolean | null;
};

type SecureSessionResult =
  | { ok: true; token: string; keyVersion: number }
  | { ok: false; status: number; body: Record<string, unknown> };

type BodyReadResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number };

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
  console.error("[vote-cast] operation failed");
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

function isJsonRequest(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  return contentType.split(";")[0].trim().toLowerCase() === "application/json";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
  );
}

function isAllowedVoteMutationOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;

  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return false;
  }

  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    return false;
  }

  if (
    parsedOrigin.username ||
    parsedOrigin.password ||
    parsedOrigin.pathname !== "/" ||
    parsedOrigin.search ||
    parsedOrigin.hash
  ) {
    return false;
  }

  const expectedOrigin = req.nextUrl?.origin ?? new URL(req.url).origin;
  return parsedOrigin.origin === expectedOrigin;
}

function validateContentLength(req: NextRequest) {
  const rawLength = req.headers.get("content-length");
  if (!rawLength) return true;
  if (!/^(0|[1-9][0-9]*)$/.test(rawLength)) return false;

  const length = Number(rawLength);
  return Number.isSafeInteger(length) && length <= MAX_BODY_BYTES;
}

async function readBoundedText(req: NextRequest) {
  if (!validateContentLength(req)) return null;
  if (!req.body) return null;

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }

      chunks.push(value);
    }
  } catch {
    return null;
  }

  if (received === 0) return null;

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

async function readJsonBody(req: NextRequest): Promise<BodyReadResult> {
  if (!isJsonRequest(req)) return { ok: false, status: 400 };

  const text = await readBoundedText(req);
  if (!text) return { ok: false, status: 400 };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status: 400 };
  }

  if (!isPlainObject(parsed) || Object.keys(parsed).length === 0) {
    return { ok: false, status: 400 };
  }

  return { ok: true, body: parsed };
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

function validateLegacyPayload(payload: Record<string, unknown>) {
  if (!hasExactKeys(payload, ["device_id", "party_slug"])) return null;
  if (typeof payload.device_id !== "string" || typeof payload.party_slug !== "string") {
    return null;
  }

  const deviceId = payload.device_id.trim();
  const partySlug = payload.party_slug.trim();

  if (
    deviceId !== payload.device_id ||
    !UUID_RE.test(deviceId) ||
    !PARTY_SLUG_RE.test(partySlug)
  ) {
    return null;
  }

  return { deviceId, partySlug };
}

function validateSecurePayload(payload: Record<string, unknown>) {
  if (!hasExactKeys(payload, ["party_slug"])) return null;
  if (typeof payload.party_slug !== "string") return null;

  const partySlug = payload.party_slug.trim();
  if (!PARTY_SLUG_RE.test(partySlug)) return null;

  return { partySlug };
}

async function resolveParty(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  round: RoundRow,
  group: string,
  partySlug: string
) {
  return supabase
    .from("vote_parties")
    .select("id,slug,enabled")
    .eq("round_id", round.id)
    .eq("slug", partySlug)
    .eq("group_code", group)
    .limit(1)
    .maybeSingle<PartyRow>();
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedVoteMutationOrigin(req)) {
      return json(403, { error: "No autorizado" });
    }

    const body = await readJsonBody(req);
    if (!body.ok) {
      return json(body.status, { error: "Solicitud invalida" });
    }

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
      const payload = validateLegacyPayload(body.body);
      if (!payload) {
        return json(400, { error: "Solicitud invalida" });
      }

      const { data: party, error: partyErr } = await resolveParty(
        supabase,
        round,
        gate.group,
        payload.partySlug
      );

      if (partyErr) {
        logOperationFailed();
        return json(503, { error: "No disponible" });
      }

      if (!party?.id || party.enabled !== true) {
        return json(404, { error: "No disponible" });
      }

      const { error: castErr } = await supabase.from("vote_casts").insert({
        round_id: round.id,
        party_id: party.id,
        device_id: payload.deviceId,
        group_code: gate.group,
      });

      if (castErr) {
        const code = (castErr as { code?: string }).code;
        if (code === "23505") {
          return json(409, { error: "No se pudo registrar" });
        }

        logOperationFailed();
        return json(503, { error: "No se pudo registrar" });
      }

      return json(200, { ok: true });
    }

    const payload = validateSecurePayload(body.body);
    if (!payload) {
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

    const { data: party, error: partyErr } = await resolveParty(
      supabase,
      round,
      gate.group,
      payload.partySlug
    );

    if (partyErr) {
      logOperationFailed();
      return json(503, { error: "No disponible" });
    }

    if (!party?.id || party.enabled !== true) {
      return json(404, { error: "No disponible" });
    }

    const { error: castErr } = await supabase.from("vote_casts").insert({
      round_id: round.id,
      party_id: party.id,
      device_id: null,
      cast_key: castKey.castKey,
      key_version: session.keyVersion,
      group_code: gate.group,
    });

    if (castErr) {
      const code = (castErr as { code?: string }).code;
      if (code === "23505") {
        return json(409, { error: "No se pudo registrar" });
      }

      logOperationFailed();
      return json(503, { error: "No se pudo registrar" });
    }

    return json(200, { ok: true });
  } catch {
    logOperationFailed();
    return json(503, { error: "No se pudo registrar" });
  }
}

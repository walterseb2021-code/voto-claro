// src/app/api/vote/admin/rounds/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/adminAuth";
import {
  VoteSessionConfigurationError,
  assertVoteSessionConfiguration,
} from "@/lib/voteSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GROUP_RE = /^GRUPO[A-Z]$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RFC3339_WITH_ZONE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const CONTENT_LENGTH_RE = /^(0|[1-9][0-9]*)$/;
const MAX_BODY_BYTES = 1024;
const ROUND_SELECT =
  "id,name,is_active,created_at,group_code,identity_mode,ends_at,lifecycle_state,activated_at,closed_at";

type IdentityMode = "legacy_device" | "secure_session";
type LifecycleState = "legacy" | "draft" | "active" | "closed";

type RoundRow = {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  group_code: string;
  identity_mode: IdentityMode;
  ends_at: string | null;
  lifecycle_state: LifecycleState;
  activated_at: string | null;
  closed_at: string | null;
};

type RoundWithCatalog = RoundRow & {
  parties_total: number;
  enabled_parties_count: number;
  catalog_ready: boolean;
};

type SourceRound = {
  id: string;
  name: string;
  group_code: string;
  lifecycle_state: Exclude<LifecycleState, "draft">;
  is_active: boolean;
  parties_total: number;
  enabled_parties_count: number;
};

type PartyCatalogRow = {
  round_id: string | null;
  group_code: string | null;
  slug: string | null;
  enabled: boolean | null;
};

type CatalogStats = {
  partiesTotal: number;
  enabledPartiesCount: number;
  slugs: Set<string>;
  hasBlankSlug: boolean;
  hasDuplicateSlug: boolean;
  hasGroupMismatch: boolean;
};

type CreateRoundWithPartiesRow = RoundRow & {
  parties_copied: number;
  enabled_parties_copied: number;
  source_round_id: string;
};

type BodyReadResult =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false };

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

function applyAdminCookies(
  response: NextResponse,
  cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }>
) {
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options);
  }

  return response;
}

function adminError(status: 401 | 403) {
  return json(status, {
    error: status === 401 ? "admin_session_expired" : "request_invalid",
  });
}

function requestInvalid() {
  return json(400, { error: "request_invalid" });
}

function logOperationFailed(context: string) {
  console.error(`[vote-admin-rounds] ${context}`);
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Admin vote round dependency unavailable.");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isValidGroupCode(value: unknown): value is string {
  return typeof value === "string" && GROUP_RE.test(value);
}

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isIdentityMode(value: unknown): value is IdentityMode {
  return value === "legacy_device" || value === "secure_session";
}

function isLifecycleState(value: unknown): value is LifecycleState {
  return (
    value === "legacy" ||
    value === "draft" ||
    value === "active" ||
    value === "closed"
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRoundRow(value: unknown): value is RoundRow {
  if (!isPlainObject(value)) return false;

  return (
    isValidUuid(value.id) &&
    typeof value.name === "string" &&
    isValidGroupCode(value.group_code) &&
    isIdentityMode(value.identity_mode) &&
    isLifecycleState(value.lifecycle_state) &&
    typeof value.is_active === "boolean" &&
    typeof value.created_at === "string" &&
    isNullableString(value.ends_at) &&
    isNullableString(value.activated_at) &&
    isNullableString(value.closed_at)
  );
}

function isCreateRoundWithPartiesRow(value: unknown): value is CreateRoundWithPartiesRow {
  if (!isPlainObject(value) || !isRoundRow(value)) return false;
  const record = value as Record<string, unknown>;

  return (
    isPositiveInteger(record.parties_copied) &&
    isPositiveInteger(record.enabled_parties_copied) &&
    isValidUuid(record.source_round_id)
  );
}

function emptyCatalogStats(): CatalogStats {
  return {
    partiesTotal: 0,
    enabledPartiesCount: 0,
    slugs: new Set<string>(),
    hasBlankSlug: false,
    hasDuplicateSlug: false,
    hasGroupMismatch: false,
  };
}

function buildCatalogStats(rounds: RoundRow[], parties: PartyCatalogRow[]) {
  const groupByRoundId = new Map(rounds.map((round) => [round.id, round.group_code]));
  const statsByRoundId = new Map<string, CatalogStats>();

  for (const round of rounds) {
    statsByRoundId.set(round.id, emptyCatalogStats());
  }

  for (const party of parties) {
    if (!party.round_id || !statsByRoundId.has(party.round_id)) continue;

    const stats = statsByRoundId.get(party.round_id);
    if (!stats) continue;

    stats.partiesTotal += 1;
    if (party.enabled === true) stats.enabledPartiesCount += 1;

    if (party.group_code !== groupByRoundId.get(party.round_id)) {
      stats.hasGroupMismatch = true;
    }

    const slug = typeof party.slug === "string" ? party.slug.trim() : "";
    if (!slug) {
      stats.hasBlankSlug = true;
    } else if (stats.slugs.has(slug)) {
      stats.hasDuplicateSlug = true;
    } else {
      stats.slugs.add(slug);
    }
  }

  return statsByRoundId;
}

function attachCatalog(rounds: RoundRow[], parties: PartyCatalogRow[]) {
  const statsByRoundId = buildCatalogStats(rounds, parties);

  const roundsWithCatalog: RoundWithCatalog[] = rounds.map((round) => {
    const stats = statsByRoundId.get(round.id) ?? emptyCatalogStats();
    const catalogReady =
      stats.enabledPartiesCount > 0 &&
      !stats.hasBlankSlug &&
      !stats.hasDuplicateSlug &&
      !stats.hasGroupMismatch;

    return {
      ...round,
      parties_total: stats.partiesTotal,
      enabled_parties_count: stats.enabledPartiesCount,
      catalog_ready: catalogReady,
    };
  });

  const sourceRounds: SourceRound[] = roundsWithCatalog
    .filter(
      (
        round
      ): round is RoundWithCatalog & { lifecycle_state: Exclude<LifecycleState, "draft"> } =>
        round.catalog_ready &&
        round.enabled_parties_count > 0 &&
        round.lifecycle_state !== "draft"
    )
    .map((round) => ({
      id: round.id,
      name: round.name,
      group_code: round.group_code,
      lifecycle_state: round.lifecycle_state,
      is_active: round.is_active,
      parties_total: round.parties_total,
      enabled_parties_count: round.enabled_parties_count,
    }));

  return { roundsWithCatalog, sourceRounds };
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

function validateContentLength(req: NextRequest) {
  const rawLength = req.headers.get("content-length");
  if (rawLength === null) return true;
  if (!CONTENT_LENGTH_RE.test(rawLength)) return false;

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
  } finally {
    reader.releaseLock();
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
  if (!isJsonRequest(req)) return { ok: false };

  const text = await readBoundedText(req);
  if (!text) return { ok: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false };
  }

  if (!isPlainObject(parsed) || Object.keys(parsed).length === 0) {
    return { ok: false };
  }

  return { ok: true, body: parsed };
}

function isAllowedAdminMutationOrigin(req: NextRequest) {
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

  return parsedOrigin.origin === req.nextUrl.origin;
}

function parseFutureRfc3339(value: string) {
  if (!RFC3339_WITH_ZONE_RE.test(value)) return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  if (date.getTime() <= Date.now()) return null;

  return date.toISOString();
}

function parseCreatePayload(body: Record<string, unknown>) {
  if (
    !hasExactKeys(body, [
      "name",
      "group_code",
      "identity_mode",
      "ends_at",
      "source_round_id",
    ])
  ) {
    return null;
  }

  if (
    typeof body.name !== "string" ||
    typeof body.group_code !== "string" ||
    !isIdentityMode(body.identity_mode) ||
    !isValidUuid(body.source_round_id)
  ) {
    return null;
  }

  const name = body.name.trim();
  const groupCode = body.group_code.trim();
  const identityMode = body.identity_mode;

  if (!name || name.length > 160 || !GROUP_RE.test(groupCode)) {
    return null;
  }

  if (identityMode === "legacy_device") {
    if (body.ends_at !== null) return null;
    return { name, groupCode, identityMode, endsAt: null, sourceRoundId: body.source_round_id.trim() };
  }

  if (typeof body.ends_at !== "string") return null;
  const endsAt = parseFutureRfc3339(body.ends_at);
  if (!endsAt) return null;

  return { name, groupCode, identityMode, endsAt, sourceRoundId: body.source_round_id.trim() };
}

function parseRoundIdPayload(body: Record<string, unknown>) {
  if (!hasExactKeys(body, ["round_id"])) return null;
  if (!isValidUuid(body.round_id)) return null;

  return { roundId: body.round_id.trim() };
}

function secureSessionAvailable() {
  try {
    assertVoteSessionConfiguration();
    return true;
  } catch (error) {
    if (error instanceof VoteSessionConfigurationError) {
      return false;
    }

    throw error;
  }
}

function extractRpcCode(error: unknown) {
  if (!isPlainObject(error)) return "";

  const values = [
    error.code,
    error.message,
    error.details,
    error.hint,
  ].filter((value): value is string => typeof value === "string");

  return values.join(" ");
}

function mapActivateError(error: unknown) {
  const text = extractRpcCode(error);

  if (text.includes("vote_round_not_found")) return json(404, { error: "round_not_found" });

  if (
    text.includes("vote_round_not_draft") ||
    text.includes("vote_round_has_sessions") ||
    text.includes("vote_round_has_casts") ||
    text.includes("vote_round_has_answers") ||
    text.includes("vote_round_ends_at_invalid") ||
    text.includes("vote_round_state_invalid")
  ) {
    return json(409, { error: "round_not_draft" });
  }

  logOperationFailed("activate rpc failed");
  return json(500, { error: "temporary_error" });
}

function mapCloseError(error: unknown) {
  const text = extractRpcCode(error);

  if (text.includes("vote_round_not_found")) return json(404, { error: "round_not_found" });
  if (text.includes("vote_round_not_active")) return json(409, { error: "round_not_active" });
  if (text.includes("vote_round_state_invalid")) return json(409, { error: "round_not_active" });

  logOperationFailed("close rpc failed");
  return json(500, { error: "temporary_error" });
}

function parseSingleRpcRound(data: unknown) {
  if (!Array.isArray(data) || data.length !== 1 || !isRoundRow(data[0])) {
    return null;
  }

  return data[0];
}

function parseSingleCreateRpcRound(data: unknown) {
  if (
    !Array.isArray(data) ||
    data.length !== 1 ||
    !isCreateRoundWithPartiesRow(data[0])
  ) {
    return null;
  }

  return data[0];
}

function rpcRoundInvalid(context: string) {
  logOperationFailed(context);
  return json(500, { error: "temporary_error" });
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return applyAdminCookies(adminError(gate.status), gate.cookiesToSet);

  const groupCode = req.nextUrl.searchParams.get("group_code");
  if (!isValidGroupCode(groupCode)) {
    return applyAdminCookies(requestInvalid(), gate.cookiesToSet);
  }

  try {
    const available = secureSessionAvailable();
    const supabaseAdmin = getAdminSupabase();
    const { data, error } = await supabaseAdmin
      .from("vote_rounds")
      .select(ROUND_SELECT)
      .eq("group_code", groupCode)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logOperationFailed("get rounds failed");
      return applyAdminCookies(json(500, { error: "temporary_error" }), gate.cookiesToSet);
    }

    const rounds = data ?? [];
    if (!rounds.every(isRoundRow)) {
      return applyAdminCookies(
        rpcRoundInvalid("get rounds returned invalid rows"),
        gate.cookiesToSet
      );
    }

    let parties: PartyCatalogRow[] = [];
    const roundIds = rounds.map((round) => round.id);
    if (roundIds.length > 0) {
      const { data: partyData, error: partyError } = await supabaseAdmin
        .from("vote_parties")
        .select("round_id,group_code,slug,enabled")
        .in("round_id", roundIds)
        .limit(10000);

      if (partyError) {
        logOperationFailed("get party catalog metrics failed");
        return applyAdminCookies(json(500, { error: "temporary_error" }), gate.cookiesToSet);
      }

      parties = (partyData ?? []) as PartyCatalogRow[];
    }

    const { roundsWithCatalog, sourceRounds } = attachCatalog(rounds, parties);

    return applyAdminCookies(
      json(200, {
        rounds: roundsWithCatalog,
        source_rounds: sourceRounds,
        secure_session_available: available,
      }),
      gate.cookiesToSet
    );
  } catch {
    logOperationFailed("get unexpected failure");
    return applyAdminCookies(json(500, { error: "temporary_error" }), gate.cookiesToSet);
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return applyAdminCookies(adminError(gate.status), gate.cookiesToSet);
  if (!isAllowedAdminMutationOrigin(req)) {
    return applyAdminCookies(json(403, { error: "request_invalid" }), gate.cookiesToSet);
  }

  const body = await readJsonBody(req);
  if (!body.ok) return applyAdminCookies(requestInvalid(), gate.cookiesToSet);

  const payload = parseCreatePayload(body.body);
  if (!payload) return applyAdminCookies(requestInvalid(), gate.cookiesToSet);

  try {
    const supabaseAdmin = getAdminSupabase();
    const { data, error } = await supabaseAdmin.rpc("create_vote_round_draft_with_parties", {
      p_name: payload.name,
      p_group_code: payload.groupCode,
      p_identity_mode: payload.identityMode,
      p_ends_at: payload.endsAt,
      p_source_round_id: payload.sourceRoundId,
    });

    if (error) {
      logOperationFailed("create draft rpc failed");
      return applyAdminCookies(json(500, { error: "temporary_error" }), gate.cookiesToSet);
    }

    const round = parseSingleCreateRpcRound(data);
    if (
      !round ||
      round.group_code !== payload.groupCode ||
      round.identity_mode !== payload.identityMode ||
      round.lifecycle_state !== "draft" ||
      round.is_active !== false ||
      round.source_round_id !== payload.sourceRoundId ||
      !isPositiveInteger(round.parties_copied) ||
      !isPositiveInteger(round.enabled_parties_copied)
    ) {
      return applyAdminCookies(
        rpcRoundInvalid("create draft rpc returned invalid row"),
        gate.cookiesToSet
      );
    }

    return applyAdminCookies(json(201, { round }), gate.cookiesToSet);
  } catch {
    logOperationFailed("create unexpected failure");
    return applyAdminCookies(json(500, { error: "temporary_error" }), gate.cookiesToSet);
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return applyAdminCookies(adminError(gate.status), gate.cookiesToSet);
  if (!isAllowedAdminMutationOrigin(req)) {
    return applyAdminCookies(json(403, { error: "request_invalid" }), gate.cookiesToSet);
  }

  const body = await readJsonBody(req);
  if (!body.ok) return applyAdminCookies(requestInvalid(), gate.cookiesToSet);

  const payload = parseRoundIdPayload(body.body);
  if (!payload) return applyAdminCookies(requestInvalid(), gate.cookiesToSet);

  try {
    const supabaseAdmin = getAdminSupabase();
    const { data: target, error: targetError } = await supabaseAdmin
      .from("vote_rounds")
      .select("id,identity_mode,lifecycle_state,ends_at,group_code,is_active")
      .eq("id", payload.roundId)
      .limit(1)
      .maybeSingle<Pick<
        RoundRow,
        "id" | "identity_mode" | "lifecycle_state" | "ends_at" | "group_code" | "is_active"
      >>();

    if (targetError) {
      logOperationFailed("activate target lookup failed");
      return applyAdminCookies(json(500, { error: "temporary_error" }), gate.cookiesToSet);
    }

    if (!target?.id) {
      return applyAdminCookies(json(404, { error: "round_not_found" }), gate.cookiesToSet);
    }

    if (target.lifecycle_state !== "draft") {
      return applyAdminCookies(json(409, { error: "round_not_draft" }), gate.cookiesToSet);
    }

    if (target.identity_mode === "secure_session") {
      try {
        assertVoteSessionConfiguration();
      } catch (error) {
        if (error instanceof VoteSessionConfigurationError) {
          return applyAdminCookies(
            json(503, { error: "configuration_unavailable" }),
            gate.cookiesToSet
          );
        }

        throw error;
      }
    }

    const { data, error } = await supabaseAdmin.rpc("activate_vote_round_draft", {
      p_round_id: payload.roundId,
    });

    if (error) return applyAdminCookies(mapActivateError(error), gate.cookiesToSet);

    const round = parseSingleRpcRound(data);
    if (!round) {
      return applyAdminCookies(
        rpcRoundInvalid("activate rpc returned invalid row"),
        gate.cookiesToSet
      );
    }

    return applyAdminCookies(json(200, { round }), gate.cookiesToSet);
  } catch {
    logOperationFailed("activate unexpected failure");
    return applyAdminCookies(json(500, { error: "temporary_error" }), gate.cookiesToSet);
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return applyAdminCookies(adminError(gate.status), gate.cookiesToSet);
  if (!isAllowedAdminMutationOrigin(req)) {
    return applyAdminCookies(json(403, { error: "request_invalid" }), gate.cookiesToSet);
  }

  const body = await readJsonBody(req);
  if (!body.ok) return applyAdminCookies(requestInvalid(), gate.cookiesToSet);

  const payload = parseRoundIdPayload(body.body);
  if (!payload) return applyAdminCookies(requestInvalid(), gate.cookiesToSet);

  try {
    const supabaseAdmin = getAdminSupabase();
    const { data, error } = await supabaseAdmin.rpc("close_active_vote_round", {
      p_round_id: payload.roundId,
    });

    if (error) return applyAdminCookies(mapCloseError(error), gate.cookiesToSet);

    const round = parseSingleRpcRound(data);
    if (!round) {
      return applyAdminCookies(
        rpcRoundInvalid("close rpc returned invalid row"),
        gate.cookiesToSet
      );
    }

    return applyAdminCookies(json(200, { round }), gate.cookiesToSet);
  } catch {
    logOperationFailed("close unexpected failure");
    return applyAdminCookies(json(500, { error: "temporary_error" }), gate.cookiesToSet);
  }
}

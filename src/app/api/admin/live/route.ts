import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getCandidatePanelOptions } from "@/lib/candidatePanelCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
  Vary: "Cookie, Origin",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonObject = Record<string, unknown>;

function jsonResponse(status: number, body: JsonObject) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function withAuthCookies(
  response: NextResponse,
  cookiesToSet: Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }>
) {
  for (const cookie of cookiesToSet) {
    response.cookies.set(
      cookie.name,
      cookie.value,
      cookie.options as Parameters<typeof response.cookies.set>[2]
    );
  }
  return response;
}

function isAllowedMutationOrigin(req: NextRequest) {
  const rawOrigin = req.headers.get("origin");
  if (!rawOrigin) return false;

  let origin: URL;
  try {
    origin = new URL(rawOrigin);
  } catch {
    return false;
  }

  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
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

  return origin.origin === req.nextUrl.origin;
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: JsonObject, keys: readonly string[]) {
  const actualKeys = Object.keys(value);
  if (actualKeys.length !== keys.length) return false;
  const allowed = new Set(keys);
  return actualKeys.every((key) => allowed.has(key));
}

function isUuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

async function readJsonObject(req: NextRequest) {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return {
      ok: false as const,
      status: 415,
      error: "UNSUPPORTED_MEDIA_TYPE",
    };
  }

  const rawLength = req.headers.get("content-length");
  if (rawLength) {
    const length = Number(rawLength);
    if (!Number.isFinite(length) || length < 0) {
      return { ok: false as const, status: 400, error: "INVALID_JSON" };
    }
    if (length > MAX_BODY_BYTES) {
      return {
        ok: false as const,
        status: 413,
        error: "PAYLOAD_TOO_LARGE",
      };
    }
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return {
      ok: false as const,
      status: 413,
      error: "PAYLOAD_TOO_LARGE",
    };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { ok: false as const, status: 400, error: "INVALID_JSON" };
    }
    return { ok: true as const, value: parsed };
  } catch {
    return { ok: false as const, status: 400, error: "INVALID_JSON" };
  }
}

function getAdminSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Admin live dependency unavailable.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isKnownStorageCandidateId(candidateId: string) {
  return getCandidatePanelOptions().some(
    (candidate) => candidate.storageCandidateId === candidateId
  );
}

function mapRpcError(error: { message?: string | null } | null | undefined) {
  const message = String(error?.message ?? "");

  if (message.includes("ADMIN_LIVE_NOT_FOUND")) {
    return { status: 404, error: "NOT_FOUND" };
  }

  if (message.includes("ADMIN_LIVE_INVALID_")) {
    return { status: 400, error: "INVALID_INPUT" };
  }

  return { status: 500, error: "RPC_ERROR" };
}

export async function DELETE(req: NextRequest) {
  try {
    if (!isAllowedMutationOrigin(req)) {
      return jsonResponse(403, { ok: false, error: "ORIGIN_FORBIDDEN" });
    }

    const gate = await requireAdmin(req);
    if (!gate.ok) {
      return withAuthCookies(
        jsonResponse(gate.status, { ok: false, error: gate.error }),
        gate.cookiesToSet
      );
    }

    const parsed = await readJsonObject(req);
    if (!parsed.ok) {
      return withAuthCookies(
        jsonResponse(parsed.status, { ok: false, error: parsed.error }),
        gate.cookiesToSet
      );
    }

    const body = parsed.value;
    const action = typeof body.action === "string" ? body.action : "";
    const requestId = randomUUID();
    const supabase = getAdminSupabase();

    if (action === "delete_one") {
      if (!hasExactKeys(body, ["action", "liveId"]) || !isUuid(body.liveId)) {
        return withAuthCookies(
          jsonResponse(400, { ok: false, error: "INVALID_INPUT" }),
          gate.cookiesToSet
        );
      }

      const liveId = String(body.liveId).trim();
      const { data, error } = await supabase.rpc("delete_live_entry_admin", {
        p_live_id: liveId,
        p_actor_email: gate.email,
        p_request_id: requestId,
      });

      if (error) {
        const mapped = mapRpcError(error);
        return withAuthCookies(
          jsonResponse(mapped.status, { ok: false, error: mapped.error }),
          gate.cookiesToSet
        );
      }

      if (
        !Array.isArray(data) ||
        data.length !== 1 ||
        !isRecord(data[0]) ||
        !isUuid(data[0].deleted_id) ||
        typeof data[0].candidate_id !== "string" ||
        !data[0].candidate_id.trim()
      ) {
        return withAuthCookies(
          jsonResponse(500, { ok: false, error: "RPC_RESULT_INVALID" }),
          gate.cookiesToSet
        );
      }

      return withAuthCookies(
        jsonResponse(200, {
          ok: true,
          action,
          deletedId: String(data[0].deleted_id),
          candidateId: data[0].candidate_id.trim(),
          requestId,
        }),
        gate.cookiesToSet
      );
    }

    if (action === "delete_all") {
      if (
        !hasExactKeys(body, ["action", "candidateId"]) ||
        typeof body.candidateId !== "string"
      ) {
        return withAuthCookies(
          jsonResponse(400, { ok: false, error: "INVALID_INPUT" }),
          gate.cookiesToSet
        );
      }

      const candidateId = body.candidateId.trim();
      if (
        !candidateId ||
        candidateId.length > 160 ||
        !isKnownStorageCandidateId(candidateId)
      ) {
        return withAuthCookies(
          jsonResponse(400, { ok: false, error: "INVALID_INPUT" }),
          gate.cookiesToSet
        );
      }

      const { data, error } = await supabase.rpc(
        "delete_candidate_live_history_admin",
        {
          p_candidate_id: candidateId,
          p_actor_email: gate.email,
          p_request_id: requestId,
        }
      );

      if (error) {
        const mapped = mapRpcError(error);
        return withAuthCookies(
          jsonResponse(mapped.status, { ok: false, error: mapped.error }),
          gate.cookiesToSet
        );
      }

      if (
        !Array.isArray(data) ||
        data.length !== 1 ||
        !isRecord(data[0]) ||
        data[0].candidate_id !== candidateId
      ) {
        return withAuthCookies(
          jsonResponse(500, { ok: false, error: "RPC_RESULT_INVALID" }),
          gate.cookiesToSet
        );
      }

      const deletedCount = Number(data[0].deleted_count);
      if (!Number.isSafeInteger(deletedCount) || deletedCount < 0) {
        return withAuthCookies(
          jsonResponse(500, { ok: false, error: "RPC_RESULT_INVALID" }),
          gate.cookiesToSet
        );
      }

      return withAuthCookies(
        jsonResponse(200, {
          ok: true,
          action,
          candidateId,
          deletedCount,
          requestId,
        }),
        gate.cookiesToSet
      );
    }

    return withAuthCookies(
      jsonResponse(400, { ok: false, error: "INVALID_INPUT" }),
      gate.cookiesToSet
    );
  } catch {
    return jsonResponse(500, { ok: false, error: "INTERNAL_ERROR" });
  }
}

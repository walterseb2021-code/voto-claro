import { type NextRequest } from "next/server";
import {
  createRetoAdminRequestId,
  getRetoAdminSupabase,
  hasExactKeys,
  isAllowedRetoAdminMutationOrigin,
  isRecord,
  isUuid,
  mapRetoAdminRpcError,
  normalizeOptionalText,
  positiveVersion,
  readRetoAdminJsonObject,
  requireRetoAdmin,
  retoAdminJson,
  withRetoAdminAuthCookies,
} from "@/lib/retoAdminApi";

export const runtime = "nodejs";

const APPROVE_KEYS = [
  "id",
  "expected_version",
  "source_reference",
  "activate",
] as const;

function parseFactRpcResult(data: unknown) {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    return null;
  }

  const row = data[0];
  const id =
    typeof row.result_fact_id === "string"
      ? row.result_fact_id.trim()
      : "";
  const version = positiveVersion(row.result_version);
  const reviewStatus =
    typeof row.result_review_status === "string"
      ? row.result_review_status
      : "";
  const isActive = row.result_is_active;

  if (
    !isUuid(id) ||
    !version ||
    !["draft", "approved", "retired"].includes(reviewStatus) ||
    typeof isActive !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    version,
    review_status: reviewStatus,
    is_active: isActive,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedRetoAdminMutationOrigin(req)) {
      return retoAdminJson(403, { ok: false, error: "ORIGIN_FORBIDDEN" });
    }

    const gate = await requireRetoAdmin(req);
    if (!gate.ok) {
      return withRetoAdminAuthCookies(
        retoAdminJson(gate.status, { ok: false, error: gate.error }),
        gate
      );
    }

    const parsed = await readRetoAdminJsonObject(req);
    if (!parsed.ok) {
      return withRetoAdminAuthCookies(
        retoAdminJson(parsed.status, { ok: false, error: parsed.error }),
        gate
      );
    }

    const body = parsed.value;
    if (!hasExactKeys(body, APPROVE_KEYS)) {
      return withRetoAdminAuthCookies(
        retoAdminJson(400, { ok: false, error: "INVALID_INPUT" }),
        gate
      );
    }

    const factId =
      typeof body.id === "string" ? body.id.trim() : "";
    const expectedVersion = positiveVersion(body.expected_version);
    const sourceReference = normalizeOptionalText(body.source_reference);
    const activate = body.activate;

    if (
      !isUuid(factId) ||
      !expectedVersion ||
      !sourceReference ||
      typeof activate !== "boolean"
    ) {
      return withRetoAdminAuthCookies(
        retoAdminJson(400, { ok: false, error: "INVALID_INPUT" }),
        gate
      );
    }

    const requestId = createRetoAdminRequestId();
    const supabase = getRetoAdminSupabase();

    const { data, error } = await supabase.rpc(
      "approve_reto_knowledge_fact_admin",
      {
        p_fact_id: factId,
        p_expected_version: expectedVersion,
        p_source_reference: sourceReference,
        p_activate: activate,
        p_actor_email: gate.email,
        p_request_id: requestId,
      }
    );

    if (error) {
      const mapped = mapRetoAdminRpcError(error);
      return withRetoAdminAuthCookies(
        retoAdminJson(mapped.status, { ok: false, error: mapped.error }),
        gate
      );
    }

    const fact = parseFactRpcResult(data);
    if (!fact) {
      return withRetoAdminAuthCookies(
        retoAdminJson(500, { ok: false, error: "RPC_RESULT_INVALID" }),
        gate
      );
    }

    return withRetoAdminAuthCookies(
      retoAdminJson(200, {
        ok: true,
        fact,
        request_id: requestId,
      }),
      gate
    );
  } catch {
    return retoAdminJson(500, { ok: false, error: "INTERNAL_ERROR" });
  }
}

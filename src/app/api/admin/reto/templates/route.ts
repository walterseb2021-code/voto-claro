import { type NextRequest } from "next/server";
import {
  createRetoAdminRequestId,
  getRetoAdminSupabase,
  hasExactKeys,
  isAllowedRetoAdminMutationOrigin,
  isRecord,
  isUuid,
  mapRetoAdminRpcError,
  parseDifficulty,
  parseFactType,
  parseRetoAdminListQuery,
  parseSources,
  parseTemplateCode,
  positiveVersion,
  readRetoAdminJsonObject,
  requireRetoAdmin,
  retoAdminJson,
  validateRendererVersion,
  validateTemplateConfig,
  validateTemplateOperator,
  withRetoAdminAuthCookies,
} from "@/lib/retoAdminApi";

export const runtime = "nodejs";

const CREATE_KEYS = [
  "code",
  "fact_type",
  "operator_code",
  "allowed_sources",
  "config",
  "difficulty",
  "renderer_version",
] as const;

const UPDATE_KEYS = [
  "id",
  "expected_version",
  "fact_type",
  "operator_code",
  "allowed_sources",
  "config",
  "difficulty",
  "renderer_version",
] as const;

function parseTemplateRpcResult(data: unknown) {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    return null;
  }

  const row = data[0];
  const id =
    typeof row.result_template_id === "string"
      ? row.result_template_id.trim()
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

function invalidInput() {
  return retoAdminJson(400, { ok: false, error: "INVALID_INPUT" });
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireRetoAdmin(req);
    if (!gate.ok) {
      return withRetoAdminAuthCookies(
        retoAdminJson(gate.status, { ok: false, error: gate.error }),
        gate
      );
    }

    const parsed = parseRetoAdminListQuery(req);
    if (!parsed.ok) {
      return withRetoAdminAuthCookies(
        retoAdminJson(400, { ok: false, error: parsed.error }),
        gate
      );
    }

    const { status, factType, source, active, limit, offset } = parsed.value;
    const supabase = getRetoAdminSupabase();

    let query = supabase
      .from("reto_question_templates")
      .select(
        "id,code,fact_type,operator_code,allowed_sources,config,difficulty,renderer_version,review_status,reviewed_at,is_active,version,created_at,updated_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq("review_status", status);
    if (factType) query = query.eq("fact_type", factType);
    if (source) query = query.contains("allowed_sources", [source]);
    if (active !== null) query = query.eq("is_active", active);

    const { data, error, count } = await query;

    if (error) {
      return withRetoAdminAuthCookies(
        retoAdminJson(500, { ok: false, error: "READ_ERROR" }),
        gate
      );
    }

    return withRetoAdminAuthCookies(
      retoAdminJson(200, {
        ok: true,
        templates: data ?? [],
        pagination: {
          limit,
          offset,
          total: typeof count === "number" ? count : 0,
        },
      }),
      gate
    );
  } catch {
    return retoAdminJson(500, { ok: false, error: "INTERNAL_ERROR" });
  }
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
    if (!hasExactKeys(body, CREATE_KEYS)) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const code = parseTemplateCode(body.code);
    const factType = parseFactType(body.fact_type);
    const allowedSources = parseSources(body.allowed_sources);
    const difficulty = parseDifficulty(body.difficulty);
    const rendererVersion = validateRendererVersion(body.renderer_version);

    if (
      !code ||
      !factType ||
      !allowedSources ||
      !difficulty ||
      !rendererVersion
    ) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const operatorCode = validateTemplateOperator(
      factType,
      body.operator_code
    );
    const config = validateTemplateConfig(factType, body.config);

    if (!operatorCode || !config) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const requestId = createRetoAdminRequestId();
    const supabase = getRetoAdminSupabase();

    const { data, error } = await supabase.rpc(
      "create_reto_question_template_admin",
      {
        p_code: code,
        p_fact_type: factType,
        p_operator_code: operatorCode,
        p_allowed_sources: allowedSources,
        p_config: config,
        p_difficulty: difficulty,
        p_renderer_version: rendererVersion,
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

    const template = parseTemplateRpcResult(data);
    if (!template) {
      return withRetoAdminAuthCookies(
        retoAdminJson(500, { ok: false, error: "RPC_RESULT_INVALID" }),
        gate
      );
    }

    return withRetoAdminAuthCookies(
      retoAdminJson(201, {
        ok: true,
        template,
        request_id: requestId,
      }),
      gate
    );
  } catch {
    return retoAdminJson(500, { ok: false, error: "INTERNAL_ERROR" });
  }
}

export async function PATCH(req: NextRequest) {
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
    if (!hasExactKeys(body, UPDATE_KEYS)) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const templateId =
      typeof body.id === "string" ? body.id.trim() : "";
    const expectedVersion = positiveVersion(body.expected_version);
    const factType = parseFactType(body.fact_type);
    const allowedSources = parseSources(body.allowed_sources);
    const difficulty = parseDifficulty(body.difficulty);
    const rendererVersion = validateRendererVersion(body.renderer_version);

    if (
      !isUuid(templateId) ||
      !expectedVersion ||
      !factType ||
      !allowedSources ||
      !difficulty ||
      !rendererVersion
    ) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const operatorCode = validateTemplateOperator(
      factType,
      body.operator_code
    );
    const config = validateTemplateConfig(factType, body.config);

    if (!operatorCode || !config) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const requestId = createRetoAdminRequestId();
    const supabase = getRetoAdminSupabase();

    const { data, error } = await supabase.rpc(
      "update_reto_question_template_admin",
      {
        p_template_id: templateId,
        p_expected_version: expectedVersion,
        p_fact_type: factType,
        p_operator_code: operatorCode,
        p_allowed_sources: allowedSources,
        p_config: config,
        p_difficulty: difficulty,
        p_renderer_version: rendererVersion,
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

    const template = parseTemplateRpcResult(data);
    if (!template) {
      return withRetoAdminAuthCookies(
        retoAdminJson(500, { ok: false, error: "RPC_RESULT_INVALID" }),
        gate
      );
    }

    return withRetoAdminAuthCookies(
      retoAdminJson(200, {
        ok: true,
        template,
        request_id: requestId,
      }),
      gate
    );
  } catch {
    return retoAdminJson(500, { ok: false, error: "INTERNAL_ERROR" });
  }
}

import { type NextRequest } from "next/server";
import {
  createRetoAdminRequestId,
  getRetoAdminSupabase,
  hasExactKeys,
  isAllowedRetoAdminMutationOrigin,
  isUuid,
  isValidTimestampWindow,
  mapRetoAdminRpcError,
  normalizeOptionalText,
  parseDifficulty,
  parseFactKey,
  parseFactType,
  parseLang,
  parseNullableTimestamp,
  parseSources,
  parseTopic,
  positiveVersion,
  readRetoAdminJsonObject,
  requireRetoAdmin,
  retoAdminJson,
  validateAllowedOperators,
  validateFactData,
  withRetoAdminAuthCookies,
  isRecord,
} from "@/lib/retoAdminApi";

export const runtime = "nodejs";

const CREATE_KEYS = [
  "fact_key",
  "fact_type",
  "lang",
  "topic",
  "fact_data",
  "eligible_sources",
  "difficulty",
  "source_reference",
  "valid_from",
  "valid_until",
  "allowed_operators",
] as const;

const UPDATE_KEYS = [
  "id",
  "expected_version",
  "fact_type",
  "lang",
  "topic",
  "fact_data",
  "eligible_sources",
  "difficulty",
  "source_reference",
  "valid_from",
  "valid_until",
  "allowed_operators",
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

function invalidInput() {
  return retoAdminJson(400, { ok: false, error: "INVALID_INPUT" });
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

    const factKey = parseFactKey(body.fact_key);
    const factType = parseFactType(body.fact_type);
    const lang = parseLang(body.lang);
    const topic = parseTopic(body.topic);
    const eligibleSources = parseSources(body.eligible_sources);
    const difficulty = parseDifficulty(body.difficulty);
    const sourceReference = normalizeOptionalText(body.source_reference);
    const validFrom = parseNullableTimestamp(body.valid_from);
    const validUntil = parseNullableTimestamp(body.valid_until);

    if (
      !factKey ||
      !factType ||
      !lang ||
      !topic ||
      !eligibleSources ||
      !difficulty ||
      sourceReference === undefined ||
      validFrom === undefined ||
      validUntil === undefined
    ) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const factData = validateFactData(factType, body.fact_data);
    const allowedOperators = validateAllowedOperators(
      factType,
      body.allowed_operators
    );

    if (
      !factData ||
      !allowedOperators ||
      !isValidTimestampWindow(validFrom, validUntil)
    ) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const requestId = createRetoAdminRequestId();
    const supabase = getRetoAdminSupabase();

    const { data, error } = await supabase.rpc(
      "create_reto_knowledge_fact_admin",
      {
        p_fact_key: factKey,
        p_fact_type: factType,
        p_lang: lang,
        p_topic: topic,
        p_fact_data: factData,
        p_eligible_sources: eligibleSources,
        p_difficulty: difficulty,
        p_source_reference: sourceReference,
        p_valid_from: validFrom,
        p_valid_until: validUntil,
        p_allowed_operators: allowedOperators,
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
      retoAdminJson(201, {
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

    const factId =
      typeof body.id === "string" ? body.id.trim() : "";
    const expectedVersion = positiveVersion(body.expected_version);
    const factType = parseFactType(body.fact_type);
    const lang = parseLang(body.lang);
    const topic = parseTopic(body.topic);
    const eligibleSources = parseSources(body.eligible_sources);
    const difficulty = parseDifficulty(body.difficulty);
    const sourceReference = normalizeOptionalText(body.source_reference);
    const validFrom = parseNullableTimestamp(body.valid_from);
    const validUntil = parseNullableTimestamp(body.valid_until);

    if (
      !isUuid(factId) ||
      !expectedVersion ||
      !factType ||
      !lang ||
      !topic ||
      !eligibleSources ||
      !difficulty ||
      sourceReference === undefined ||
      validFrom === undefined ||
      validUntil === undefined
    ) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const factData = validateFactData(factType, body.fact_data);
    const allowedOperators = validateAllowedOperators(
      factType,
      body.allowed_operators
    );

    if (
      !factData ||
      !allowedOperators ||
      !isValidTimestampWindow(validFrom, validUntil)
    ) {
      return withRetoAdminAuthCookies(invalidInput(), gate);
    }

    const requestId = createRetoAdminRequestId();
    const supabase = getRetoAdminSupabase();

    const { data, error } = await supabase.rpc(
      "update_reto_knowledge_fact_admin",
      {
        p_fact_id: factId,
        p_expected_version: expectedVersion,
        p_fact_type: factType,
        p_lang: lang,
        p_topic: topic,
        p_fact_data: factData,
        p_eligible_sources: eligibleSources,
        p_difficulty: difficulty,
        p_source_reference: sourceReference,
        p_valid_from: validFrom,
        p_valid_until: validUntil,
        p_allowed_operators: allowedOperators,
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

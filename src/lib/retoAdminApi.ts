import "server-only";

import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { requireAdmin, type AdminAuthResult } from "@/lib/adminAuth";

export const RETO_ADMIN_MAX_BODY_BYTES = 512 * 1024;
export const RETO_ADMIN_MAX_JSON_OBJECT_BYTES = 262_144;

export const RETO_FACT_TYPES = [
  "boolean",
  "integer",
  "decimal",
  "text",
  "date",
  "membership",
] as const;

export type RetoFactType = (typeof RETO_FACT_TYPES)[number];

export const RETO_SOURCES = [
  "principal_level1",
  "principal_level2",
  "camino",
] as const;

export type RetoSource = (typeof RETO_SOURCES)[number];

export const RETO_OPERATOR_BY_FACT_TYPE: Record<RetoFactType, string> = {
  boolean: "BOOL_EXPLICIT_VARIANT",
  integer: "INT_EQUALS_VARIANT",
  decimal: "DECIMAL_EQUALS_VARIANT",
  text: "TEXT_EQUALS_VARIANT",
  date: "DATE_EQUALS_VARIANT",
  membership: "MEMBERSHIP_DIRECT",
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0, private",
  Pragma: "no-cache",
  Vary: "Cookie, Origin",
};

const FACT_KEY_RE = /^[a-z][a-z0-9._:-]{2,119}$/;
const TEMPLATE_CODE_RE = /^[a-z][a-z0-9_]{2,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_VALUE_RE =
  /^-?(?:0|[1-9]\d{0,17})(?:\.\d{0,7}[1-9])?$/;
const DECIMAL_STEP_RE =
  /^(?:0\.\d{0,7}[1-9]|[1-9]\d{0,4}(?:\.\d{0,7}[1-9])?|100000)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_WITH_ZONE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export type RetoAdminJsonReadResult =
  | { ok: true; value: Record<string, unknown> }
  | {
      ok: false;
      status: 400 | 413 | 415;
      error: "INVALID_JSON" | "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE";
    };

export type RetoAdminRpcErrorResult = {
  status: 400 | 404 | 409 | 500;
  error:
    | "INVALID_INPUT"
    | "NOT_FOUND"
    | "VERSION_CONFLICT"
    | "STATE_INVALID"
    | "CREATE_CONFLICT"
    | "RUNTIME_CONTRACT_INVALID"
    | "RPC_ERROR";
};

export function retoAdminJson(
  status: number,
  body: Record<string, unknown>
) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function withRetoAdminAuthCookies(
  response: NextResponse,
  gate: AdminAuthResult
) {
  for (const cookie of gate.cookiesToSet) {
    response.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return response;
}

export function requireRetoAdmin(req: NextRequest) {
  return requireAdmin(req);
}

export function getRetoAdminSupabase() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Reto admin dependency unavailable.");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function isAllowedRetoAdminMutationOrigin(req: NextRequest) {
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

export async function readRetoAdminJsonObject(
  req: NextRequest,
  maxBytes = RETO_ADMIN_MAX_BODY_BYTES
): Promise<RetoAdminJsonReadResult> {
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return {
      ok: false,
      status: 415,
      error: "UNSUPPORTED_MEDIA_TYPE",
    };
  }

  const rawLength = req.headers.get("content-length");
  if (rawLength) {
    const length = Number(rawLength);
    if (!Number.isFinite(length) || length < 0) {
      return { ok: false, status: 400, error: "INVALID_JSON" };
    }
    if (length > maxBytes) {
      return {
        ok: false,
        status: 413,
        error: "PAYLOAD_TOO_LARGE",
      };
    }
  }

  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: "PAYLOAD_TOO_LARGE",
    };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return { ok: false, status: 400, error: "INVALID_JSON" };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, status: 400, error: "INVALID_JSON" };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function hasExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[] = allowedKeys
) {
  const allowed = new Set(allowedKeys);
  const keys = Object.keys(value);

  if (keys.some((key) => !allowed.has(key))) return false;
  return requiredKeys.every((key) =>
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

export function isUuid(value: unknown) {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function positiveVersion(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
    ? value
    : null;
}

export type RetoAdminListQuery = {
  status: "draft" | "approved" | "retired" | null;
  factType: RetoFactType | null;
  source: RetoSource | null;
  active: boolean | null;
  limit: number;
  offset: number;
};

export function parseRetoAdminListQuery(
  req: NextRequest
):
  | { ok: true; value: RetoAdminListQuery }
  | { ok: false; error: "INVALID_QUERY" } {
  const params = req.nextUrl.searchParams;
  const allowedKeys = ["status", "type", "source", "active", "limit", "offset"];

  for (const key of Array.from(params.keys())) {
    if (!allowedKeys.includes(key)) {
      return { ok: false, error: "INVALID_QUERY" };
    }
  }

  for (const key of allowedKeys) {
    if (params.getAll(key).length > 1) {
      return { ok: false, error: "INVALID_QUERY" };
    }
  }

  const rawStatus = params.get("status");
  const status =
    rawStatus === null
      ? null
      : ["draft", "approved", "retired"].includes(rawStatus)
        ? (rawStatus as "draft" | "approved" | "retired")
        : undefined;

  const rawType = params.get("type");
  const factType = rawType === null ? null : parseFactType(rawType);

  const rawSource = params.get("source");
  const source =
    rawSource === null
      ? null
      : (RETO_SOURCES as readonly string[]).includes(rawSource)
        ? (rawSource as RetoSource)
        : undefined;

  const rawActive = params.get("active");
  const active =
    rawActive === null
      ? null
      : rawActive === "true"
        ? true
        : rawActive === "false"
          ? false
          : undefined;

  const rawLimit = params.get("limit");
  const limit =
    rawLimit === null
      ? 50
      : /^[1-9][0-9]{0,2}$/.test(rawLimit)
        ? Number(rawLimit)
        : NaN;

  const rawOffset = params.get("offset");
  const offset =
    rawOffset === null
      ? 0
      : /^(0|[1-9][0-9]{0,4})$/.test(rawOffset)
        ? Number(rawOffset)
        : NaN;

  if (
    status === undefined ||
    factType === null && rawType !== null ||
    source === undefined ||
    active === undefined ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 5000
  ) {
    return { ok: false, error: "INVALID_QUERY" };
  }

  return {
    ok: true,
    value: {
      status,
      factType,
      source,
      active,
      limit,
      offset,
    },
  };
}
export function createRetoAdminRequestId() {
  return randomUUID();
}

export function normalizeRequiredText(
  value: unknown,
  maxLength: number
): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

export function normalizeOptionalText(
  value: unknown,
  maxLength = RETO_ADMIN_MAX_JSON_OBJECT_BYTES
): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return undefined;
  return normalized;
}

export function parseFactType(value: unknown): RetoFactType | null {
  return typeof value === "string" &&
    (RETO_FACT_TYPES as readonly string[]).includes(value)
    ? (value as RetoFactType)
    : null;
}

export function parseSources(value: unknown): RetoSource[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    return null;
  }

  const sources = value.map((item) =>
    typeof item === "string" ? item.trim() : ""
  );

  if (
    sources.some(
      (source) => !(RETO_SOURCES as readonly string[]).includes(source)
    ) ||
    new Set(sources).size !== sources.length
  ) {
    return null;
  }

  return sources as RetoSource[];
}

export function parseDifficulty(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
    ? value
    : null;
}

export function parseFactKey(value: unknown) {
  if (typeof value !== "string") return null;
  const factKey = value.trim();
  return FACT_KEY_RE.test(factKey) ? factKey : null;
}

export function parseTemplateCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim();
  return TEMPLATE_CODE_RE.test(code) ? code : null;
}

export function parseLang(value: unknown) {
  return normalizeRequiredText(value, 20);
}

export function parseTopic(value: unknown) {
  return normalizeRequiredText(value, 240);
}

export function parseNullableTimestamp(
  value: unknown
): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();
  if (!ISO_TIMESTAMP_WITH_ZONE_RE.test(normalized)) return undefined;

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? normalized : undefined;
}

export function isValidTimestampWindow(
  validFrom: string | null,
  validUntil: string | null
) {
  if (!validFrom || !validUntil) return true;
  return Date.parse(validUntil) > Date.parse(validFrom);
}

function textComparisonKey(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("es");
}

function isJsonObjectWithinDatabaseLimit(value: unknown) {
  if (!isRecord(value)) return false;
  return (
    Buffer.byteLength(JSON.stringify(value), "utf8") <=
    RETO_ADMIN_MAX_JSON_OBJECT_BYTES
  );
}

function parseOptionalUnit(value: unknown) {
  if (value === undefined) return { ok: true as const, value: undefined };
  const unit = normalizeRequiredText(value, 80);
  return unit
    ? { ok: true as const, value: unit }
    : { ok: false as const, value: undefined };
}

export function validateFactData(
  factType: RetoFactType,
  value: unknown
): Record<string, unknown> | null {
  if (!isJsonObjectWithinDatabaseLimit(value)) return null;
  const data = value as Record<string, unknown>;

  if (factType === "boolean") {
    if (
      !hasExactKeys(data, ["statement_true", "statement_false"]) ||
      typeof data.statement_true !== "string" ||
      typeof data.statement_false !== "string"
    ) {
      return null;
    }

    const statementTrue = data.statement_true.trim();
    const statementFalse = data.statement_false.trim();

    if (
      !statementTrue ||
      !statementFalse ||
      statementTrue.length > 4500 ||
      statementFalse.length > 4500 ||
      textComparisonKey(statementTrue) === textComparisonKey(statementFalse)
    ) {
      return null;
    }

    return {
      statement_true: statementTrue,
      statement_false: statementFalse,
    };
  }

  if (factType === "integer") {
    if (
      !hasExactKeys(
        data,
        ["subject", "value", "unit"],
        ["subject", "value"]
      )
    ) {
      return null;
    }

    const subject = normalizeRequiredText(data.subject, 3500);
    const integerValue =
      typeof data.value === "number" && Number.isSafeInteger(data.value)
        ? data.value
        : null;
    const unit = parseOptionalUnit(data.unit);

    if (!subject || integerValue === null || !unit.ok) return null;

    return {
      subject,
      value: integerValue,
      ...(unit.value === undefined ? {} : { unit: unit.value }),
    };
  }

  if (factType === "decimal") {
    if (
      !hasExactKeys(
        data,
        ["subject", "value", "unit"],
        ["subject", "value"]
      )
    ) {
      return null;
    }

    const subject = normalizeRequiredText(data.subject, 3500);
    const decimalValue =
      typeof data.value === "string" &&
      DECIMAL_VALUE_RE.test(data.value) &&
      data.value !== "-0"
        ? data.value
        : null;
    const unit = parseOptionalUnit(data.unit);

    if (!subject || !decimalValue || !unit.ok) return null;

    return {
      subject,
      value: decimalValue,
      ...(unit.value === undefined ? {} : { unit: unit.value }),
    };
  }

  if (factType === "text") {
    if (
      !hasExactKeys(data, ["subject", "value", "false_alternatives"]) ||
      !Array.isArray(data.false_alternatives)
    ) {
      return null;
    }

    const subject = normalizeRequiredText(data.subject, 3000);
    const actual = normalizeRequiredText(data.value, 1000);
    if (!subject || !actual) return null;

    if (
      data.false_alternatives.length < 1 ||
      data.false_alternatives.length > 100
    ) {
      return null;
    }

    const actualKey = textComparisonKey(actual);
    const seen = new Set<string>();
    const alternatives: string[] = [];

    for (const item of data.false_alternatives) {
      const alternative = normalizeRequiredText(item, 1000);
      if (!alternative) return null;

      const key = textComparisonKey(alternative);
      if (!key || key === actualKey || seen.has(key)) return null;

      seen.add(key);
      alternatives.push(alternative);
    }

    return {
      subject,
      value: actual,
      false_alternatives: alternatives,
    };
  }

  if (factType === "date") {
    if (!hasExactKeys(data, ["subject", "value"])) return null;

    const subject = normalizeRequiredText(data.subject, 3500);
    if (
      !subject ||
      typeof data.value !== "string" ||
      !ISO_DATE_RE.test(data.value)
    ) {
      return null;
    }

    const parsed = new Date(`${data.value}T00:00:00Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== data.value
    ) {
      return null;
    }

    return { subject, value: data.value };
  }

  if (!hasExactKeys(data, ["member", "collection", "is_member"])) {
    return null;
  }

  const member = normalizeRequiredText(data.member, 1800);
  const collection = normalizeRequiredText(data.collection, 1800);

  if (!member || !collection || typeof data.is_member !== "boolean") {
    return null;
  }

  return {
    member,
    collection,
    is_member: data.is_member,
  };
}

export function validateAllowedOperators(
  factType: RetoFactType,
  value: unknown
) {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const expected = RETO_OPERATOR_BY_FACT_TYPE[factType];
  return value[0] === expected ? [expected] : null;
}

export function validateTemplateOperator(
  factType: RetoFactType,
  value: unknown
) {
  return typeof value === "string" &&
    value.trim() === RETO_OPERATOR_BY_FACT_TYPE[factType]
    ? RETO_OPERATOR_BY_FACT_TYPE[factType]
    : null;
}

export function validateTemplateConfig(
  factType: RetoFactType,
  value: unknown
): Record<string, unknown> | null {
  if (!isJsonObjectWithinDatabaseLimit(value)) return null;
  const config = value as Record<string, unknown>;

  if (factType === "integer") {
    if (!hasExactKeys(config, ["false_delta_min", "false_delta_max"])) {
      return null;
    }

    const min = config.false_delta_min;
    const max = config.false_delta_max;

    if (
      typeof min !== "number" ||
      typeof max !== "number" ||
      !Number.isInteger(min) ||
      !Number.isInteger(max) ||
      min < 1 ||
      min > 100000 ||
      max < min ||
      max > 100000
    ) {
      return null;
    }

    return {
      false_delta_min: min,
      false_delta_max: max,
    };
  }

  if (factType === "decimal") {
    if (!hasExactKeys(config, ["step", "false_steps_max"])) return null;

    if (
      typeof config.step !== "string" ||
      !DECIMAL_STEP_RE.test(config.step) ||
      typeof config.false_steps_max !== "number" ||
      !Number.isInteger(config.false_steps_max) ||
      config.false_steps_max < 1 ||
      config.false_steps_max > 1000
    ) {
      return null;
    }

    return {
      step: config.step,
      false_steps_max: config.false_steps_max,
    };
  }

  return Object.keys(config).length === 0 ? {} : null;
}

export function validateRendererVersion(value: unknown) {
  return value === 1 ? 1 : null;
}

export function mapRetoAdminRpcError(
  error: { message?: string | null } | null | undefined
): RetoAdminRpcErrorResult {
  const message = String(error?.message ?? "");

  if (
    message.includes("RETO_FACT_ADMIN_CREATE_CONFLICT") ||
    message.includes("RETO_TEMPLATE_ADMIN_CREATE_CONFLICT")
  ) {
    return { status: 409, error: "CREATE_CONFLICT" };
  }

  if (
    message.includes("RETO_FACT_ADMIN_VERSION_CONFLICT") ||
    message.includes("RETO_TEMPLATE_ADMIN_VERSION_CONFLICT")
  ) {
    return { status: 409, error: "VERSION_CONFLICT" };
  }

  if (
    message.includes("RETO_FACT_ADMIN_STATE_INVALID") ||
    message.includes("RETO_TEMPLATE_ADMIN_STATE_INVALID")
  ) {
    return { status: 409, error: "STATE_INVALID" };
  }

  if (message.includes("RETO_TEMPLATE_ADMIN_RUNTIME_CONTRACT_INVALID")) {
    return { status: 409, error: "RUNTIME_CONTRACT_INVALID" };
  }

  if (
    message.includes("RETO_FACT_ADMIN_NOT_FOUND") ||
    message.includes("RETO_TEMPLATE_ADMIN_NOT_FOUND")
  ) {
    return { status: 404, error: "NOT_FOUND" };
  }

  if (
    message.includes("RETO_FACT_ADMIN_INVALID_INPUT") ||
    message.includes("RETO_TEMPLATE_ADMIN_INVALID_INPUT")
  ) {
    return { status: 400, error: "INVALID_INPUT" };
  }

  return { status: 500, error: "RPC_ERROR" };
}

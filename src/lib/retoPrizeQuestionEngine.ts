import "server-only";

import { randomInt } from "node:crypto";

import { getParticipantSupabaseAdmin } from "@/lib/participantApi";

type RetoPrizeAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;
type JsonObject = Record<string, unknown>;

export type RetoPrizeQuestionSource =
  | "principal_level1"
  | "principal_level2"
  | "camino";

type RetoPrizeFactType =
  | "boolean"
  | "integer"
  | "decimal"
  | "text"
  | "date"
  | "membership";

type KnowledgeFactRow = {
  id: string;
  fact_type: RetoPrizeFactType;
  fact_data: JsonObject;
  allowed_operators: string[];
  valid_from: string | null;
  valid_until: string | null;
};

type QuestionTemplateRow = {
  id: string;
  fact_type: RetoPrizeFactType;
  operator_code: string;
  config: JsonObject;
  renderer_version: number;
};

export type GeneratedRetoPrizeQuestion = {
  factId: string;
  templateId: string;
  source: RetoPrizeQuestionSource;
  parameters: JsonObject;
  questionText: string;
  correctAnswer: boolean;
};

export type PublicRetoPrizeQuestion = {
  id: string;
  question: string;
};

export type StoredRetoPrizeQuestion = {
  id: string;
  question: string;
  expiresAt: string;
  issuedStateVersion: number;
};

export type IssueRetoPrizeQuestionArgs = {
  sessionId: string;
  participantId: string;
  groupCode: string;
  expectedStateVersion: number;
  source: RetoPrizeQuestionSource;
  questionDeadline: string;
  poolDeadline: string | null;
  pendingRoll: number | null;
};

export type RetoPrizeQuestionFailure =
  | "conflict"
  | "expired"
  | "invalid_state"
  | "pool_exhausted"
  | "unavailable";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE = /^GRUPO[A-Z]$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SUPPORTED_OPERATORS = new Set([
  "BOOL_DIRECT",
  "BOOL_NEGATED",
  "INT_EQUALS_VARIANT",
  "DECIMAL_EQUALS_VARIANT",
  "TEXT_EQUALS_VARIANT",
  "DATE_EQUALS_VARIANT",
  "MEMBERSHIP_DIRECT",
]);

const ALLOWED_OPERATORS_BY_FACT_TYPE: Record<
  RetoPrizeFactType,
  ReadonlySet<string>
> = {
  boolean: new Set(["BOOL_DIRECT", "BOOL_NEGATED"]),
  integer: new Set(["INT_EQUALS_VARIANT"]),
  decimal: new Set(["DECIMAL_EQUALS_VARIANT"]),
  text: new Set(["TEXT_EQUALS_VARIANT"]),
  date: new Set(["DATE_EQUALS_VARIANT"]),
  membership: new Set(["MEMBERSHIP_DIRECT"]),
};

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown) {
  return UUID_RE.test(String(value ?? "").trim());
}

function safeText(value: unknown, max = 5000) {
  const text = String(value ?? "").trim();
  return text.length > 0 && text.length <= max ? text : null;
}

function safeIsoDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function safeFactType(value: unknown): RetoPrizeFactType | null {
  return value === "boolean" ||
    value === "integer" ||
    value === "decimal" ||
    value === "text" ||
    value === "date" ||
    value === "membership"
    ? value
    : null;
}

function safeSource(value: unknown): RetoPrizeQuestionSource | null {
  return value === "principal_level1" ||
    value === "principal_level2" ||
    value === "camino"
    ? value
    : null;
}

function firstRpcRow(value: unknown): JsonObject | null {
  if (Array.isArray(value)) {
    return value.length > 0 && isObject(value[0]) ? value[0] : null;
  }
  return isObject(value) ? value : null;
}

function safeAllowedOperators(
  value: unknown,
  factType: RetoPrizeFactType
): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    return null;
  }

  const operators = value.map((item) => String(item ?? "").trim());
  const allowed = ALLOWED_OPERATORS_BY_FACT_TYPE[factType];

  if (
    operators.some(
      (operator) =>
        !SUPPORTED_OPERATORS.has(operator) || !allowed.has(operator)
    ) ||
    new Set(operators).size !== operators.length
  ) {
    return null;
  }

  return operators;
}

function parseFactRow(value: unknown): KnowledgeFactRow | null {
  if (!isObject(value)) return null;

  const id = String(value.id ?? "").trim();
  const factType = safeFactType(value.fact_type);
  const factData = value.fact_data;
  const allowedOperators = factType
    ? safeAllowedOperators(value.allowed_operators, factType)
    : null;
  const validFrom =
    value.valid_from === null || value.valid_from === undefined
      ? null
      : safeIsoDateTime(value.valid_from);
  const validUntil =
    value.valid_until === null || value.valid_until === undefined
      ? null
      : safeIsoDateTime(value.valid_until);

  if (
    !isUuid(id) ||
    !factType ||
    !isObject(factData) ||
    !allowedOperators
  ) {
    return null;
  }
  if (
    value.valid_from !== null &&
    value.valid_from !== undefined &&
    !validFrom
  ) {
    return null;
  }
  if (
    value.valid_until !== null &&
    value.valid_until !== undefined &&
    !validUntil
  ) {
    return null;
  }

  return {
    id,
    fact_type: factType,
    fact_data: factData,
    allowed_operators: allowedOperators,
    valid_from: validFrom,
    valid_until: validUntil,
  };
}

function parseTemplateRow(value: unknown): QuestionTemplateRow | null {
  if (!isObject(value)) return null;

  const id = String(value.id ?? "").trim();
  const factType = safeFactType(value.fact_type);
  const operatorCode = String(value.operator_code ?? "").trim();
  const rendererVersion = Number(value.renderer_version);
  const config = value.config;

  if (
    !isUuid(id) ||
    !factType ||
    !SUPPORTED_OPERATORS.has(operatorCode) ||
    !Number.isInteger(rendererVersion) ||
    rendererVersion !== 1 ||
    !isObject(config)
  ) {
    return null;
  }

  return {
    id,
    fact_type: factType,
    operator_code: operatorCode,
    config,
    renderer_version: rendererVersion,
  };
}

function activeAt(fact: KnowledgeFactRow, nowMs: number) {
  if (fact.valid_from) {
    const from = new Date(fact.valid_from).getTime();
    if (!Number.isFinite(from) || from > nowMs) return false;
  }

  if (fact.valid_until) {
    const until = new Date(fact.valid_until).getTime();
    if (!Number.isFinite(until) || until <= nowMs) return false;
  }

  return true;
}

function formatUnit(value: unknown) {
  const unit = safeText(value, 80);
  return unit ? ` ${unit}` : "";
}

function randomFalseInteger(actual: number, config: JsonObject) {
  const minDeltaRaw = Number(config.false_delta_min ?? 1);
  const maxDeltaRaw = Number(config.false_delta_max ?? 9);
  const minDelta =
    Number.isInteger(minDeltaRaw) && minDeltaRaw >= 1
      ? Math.min(minDeltaRaw, 100000)
      : 1;
  const maxDelta =
    Number.isInteger(maxDeltaRaw) && maxDeltaRaw >= minDelta
      ? Math.min(maxDeltaRaw, 100000)
      : Math.max(minDelta, 9);

  const delta = randomInt(minDelta, maxDelta + 1);
  return randomInt(0, 2) === 0 ? actual - delta : actual + delta;
}

const DECIMAL_VALUE_RE =
  /^-?(?:0|[1-9]\d{0,17})(?:\.\d{0,7}[1-9])?$/;
const DECIMAL_STEP_RE =
  /^(?:0\.\d{0,7}[1-9]|[1-9]\d{0,4}(?:\.\d{0,7}[1-9])?|100000)$/;

type CanonicalDecimal = {
  text: string;
  coefficient: bigint;
  scale: number;
};

function parseCanonicalDecimal(
  value: unknown,
  pattern: RegExp
): CanonicalDecimal | null {
  if (typeof value !== "string" || !pattern.test(value) || value === "-0") {
    return null;
  }

  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const magnitude = BigInt(`${whole}${fraction}`);
  const zero = BigInt(0);

  return {
    text: value,
    coefficient: negative && magnitude !== zero ? -magnitude : magnitude,
    scale: fraction.length,
  };
}

function scaledDecimalCoefficient(
  value: CanonicalDecimal,
  targetScale: number
) {
  return (
    value.coefficient *
    BigInt(10) ** BigInt(targetScale - value.scale)
  );
}

function formatScaledDecimal(
  coefficient: bigint,
  scale: number
): string | null {
  const zero = BigInt(0);
  const negative = coefficient < zero;
  const magnitude = negative ? -coefficient : coefficient;
  const digits = magnitude.toString().padStart(scale + 1, "0");

  let text: string;
  if (scale === 0) {
    text = digits;
  } else {
    const splitAt = digits.length - scale;
    const whole = digits.slice(0, splitAt);
    const fraction = digits.slice(splitAt).replace(/0+$/, "");
    text = fraction ? `${whole}.${fraction}` : whole;
  }

  if (negative && text !== "0") {
    text = `-${text}`;
  }

  return DECIMAL_VALUE_RE.test(text) && text !== "-0" ? text : null;
}

function randomFalseDecimal(
  actual: CanonicalDecimal,
  config: JsonObject
): string | null {
  const step = parseCanonicalDecimal(config.step, DECIMAL_STEP_RE);
  const maxSteps = config.false_steps_max;

  if (
    !step ||
    typeof maxSteps !== "number" ||
    !Number.isInteger(maxSteps) ||
    maxSteps < 1 ||
    maxSteps > 1000
  ) {
    return null;
  }

  const scale = Math.max(actual.scale, step.scale);
  const actualScaled = scaledDecimalCoefficient(actual, scale);
  const stepScaled = scaledDecimalCoefficient(step, scale);
  const delta = stepScaled * BigInt(randomInt(1, maxSteps + 1));
  const direction = randomInt(0, 2) === 0 ? -BigInt(1) : BigInt(1);

  const first = formatScaledDecimal(
    actualScaled + direction * delta,
    scale
  );
  if (first && first !== actual.text) {
    return first;
  }

  const fallback = formatScaledDecimal(
    actualScaled - direction * delta,
    scale
  );
  return fallback && fallback !== actual.text ? fallback : null;
}

function shiftedIsoDate(actual: string) {
  const time = Date.parse(`${actual}T00:00:00.000Z`);
  if (!Number.isFinite(time)) return null;

  const days = randomInt(1, 31);
  const direction = randomInt(0, 2) === 0 ? -1 : 1;
  const shifted = new Date(time + direction * days * 86400000);

  return shifted.toISOString().slice(0, 10);
}

function renderBoolean(
  fact: KnowledgeFactRow,
  template: QuestionTemplateRow,
  source: RetoPrizeQuestionSource
): GeneratedRetoPrizeQuestion | null {
  const statement = safeText(fact.fact_data.statement, 4500);
  const value = fact.fact_data.value;

  if (!statement || typeof value !== "boolean") return null;

  if (template.operator_code === "BOOL_DIRECT") {
    return {
      factId: fact.id,
      templateId: template.id,
      source,
      parameters: { renderer_version: 1, mode: "direct" },
      questionText: statement,
      correctAnswer: value,
    };
  }

  if (template.operator_code === "BOOL_NEGATED") {
    const questionText = safeText(`No es cierto que: ${statement}`, 5000);
    if (!questionText) return null;

    return {
      factId: fact.id,
      templateId: template.id,
      source,
      parameters: { renderer_version: 1, mode: "negated" },
      questionText,
      correctAnswer: !value,
    };
  }

  return null;
}

function renderInteger(
  fact: KnowledgeFactRow,
  template: QuestionTemplateRow,
  source: RetoPrizeQuestionSource
): GeneratedRetoPrizeQuestion | null {
  if (template.operator_code !== "INT_EQUALS_VARIANT") return null;

  const subject = safeText(fact.fact_data.subject, 3500);
  const actual = Number(fact.fact_data.value);
  const unit = formatUnit(fact.fact_data.unit);

  if (!subject || !Number.isSafeInteger(actual)) return null;

  const truthTarget = randomInt(0, 2) === 1;
  const candidate = truthTarget
    ? actual
    : randomFalseInteger(actual, template.config);

  const questionText = safeText(
    `¿Es correcto que ${subject} es ${candidate}${unit}?`,
    5000
  );
  if (!questionText) return null;

  return {
    factId: fact.id,
    templateId: template.id,
    source,
    parameters: {
      renderer_version: 1,
      truth_target: truthTarget,
      candidate,
    },
    questionText,
    correctAnswer: candidate === actual,
  };
}

function renderDecimal(
  fact: KnowledgeFactRow,
  template: QuestionTemplateRow,
  source: RetoPrizeQuestionSource
): GeneratedRetoPrizeQuestion | null {
  if (template.operator_code !== "DECIMAL_EQUALS_VARIANT") return null;

  const subject = safeText(fact.fact_data.subject, 3500);
  const actual = parseCanonicalDecimal(
    fact.fact_data.value,
    DECIMAL_VALUE_RE
  );
  const unit = formatUnit(fact.fact_data.unit);

  if (!subject || !actual) return null;

  const truthTarget = randomInt(0, 2) === 1;
  const candidate = truthTarget
    ? actual.text
    : randomFalseDecimal(actual, template.config);

  if (!candidate) return null;

  const questionText = safeText(
    `¿Es correcto que ${subject} es ${candidate}${unit}?`,
    5000
  );
  if (!questionText) return null;

  return {
    factId: fact.id,
    templateId: template.id,
    source,
    parameters: {
      renderer_version: 1,
      truth_target: truthTarget,
      candidate,
    },
    questionText,
    correctAnswer: candidate === actual.text,
  };
}

function renderText(
  fact: KnowledgeFactRow,
  template: QuestionTemplateRow,
  source: RetoPrizeQuestionSource
): GeneratedRetoPrizeQuestion | null {
  if (template.operator_code !== "TEXT_EQUALS_VARIANT") return null;

  const subject = safeText(fact.fact_data.subject, 3000);
  const actual = safeText(fact.fact_data.value, 1000);
  const alternatives = Array.isArray(fact.fact_data.alternatives)
    ? fact.fact_data.alternatives
        .map((item) => safeText(item, 1000))
        .filter((item): item is string => Boolean(item && item !== actual))
        .slice(0, 100)
    : [];

  if (!subject || !actual) return null;

  const canRenderFalse = alternatives.length > 0;
  const truthTarget = !canRenderFalse || randomInt(0, 2) === 1;
  const candidate = truthTarget
    ? actual
    : alternatives[randomInt(0, alternatives.length)];

  const questionText = safeText(
    `¿Es correcto afirmar que ${subject} es "${candidate}"?`,
    5000
  );
  if (!questionText) return null;

  return {
    factId: fact.id,
    templateId: template.id,
    source,
    parameters: {
      renderer_version: 1,
      truth_target: truthTarget,
      candidate,
    },
    questionText,
    correctAnswer: candidate === actual,
  };
}

function renderDate(
  fact: KnowledgeFactRow,
  template: QuestionTemplateRow,
  source: RetoPrizeQuestionSource
): GeneratedRetoPrizeQuestion | null {
  if (template.operator_code !== "DATE_EQUALS_VARIANT") return null;

  const subject = safeText(fact.fact_data.subject, 3500);
  const actual = safeText(fact.fact_data.value, 10);

  if (!subject || !actual || !DATE_RE.test(actual)) return null;

  const actualTime = Date.parse(`${actual}T00:00:00.000Z`);
  if (!Number.isFinite(actualTime)) return null;

  const truthTarget = randomInt(0, 2) === 1;
  const candidate = truthTarget ? actual : shiftedIsoDate(actual);
  if (!candidate) return null;

  const questionText = safeText(
    `¿Es correcto que ${subject} corresponde a la fecha ${candidate}?`,
    5000
  );
  if (!questionText) return null;

  return {
    factId: fact.id,
    templateId: template.id,
    source,
    parameters: {
      renderer_version: 1,
      truth_target: truthTarget,
      candidate,
    },
    questionText,
    correctAnswer: candidate === actual,
  };
}

function renderMembership(
  fact: KnowledgeFactRow,
  template: QuestionTemplateRow,
  source: RetoPrizeQuestionSource
): GeneratedRetoPrizeQuestion | null {
  if (template.operator_code !== "MEMBERSHIP_DIRECT") return null;

  const member = safeText(fact.fact_data.member, 1800);
  const collection = safeText(fact.fact_data.collection, 1800);
  const isMember = fact.fact_data.is_member;

  if (!member || !collection || typeof isMember !== "boolean") return null;

  const questionText = safeText(
    `¿${member} pertenece a ${collection}?`,
    5000
  );
  if (!questionText) return null;

  return {
    factId: fact.id,
    templateId: template.id,
    source,
    parameters: { renderer_version: 1, mode: "membership_direct" },
    questionText,
    correctAnswer: isMember,
  };
}

export function renderRetoPrizeQuestionV1(
  fact: KnowledgeFactRow,
  template: QuestionTemplateRow,
  source: RetoPrizeQuestionSource
): GeneratedRetoPrizeQuestion | null {
  if (fact.fact_type !== template.fact_type) return null;
  if (!fact.allowed_operators.includes(template.operator_code)) return null;

  switch (fact.fact_type) {
    case "boolean":
      return renderBoolean(fact, template, source);
    case "integer":
      return renderInteger(fact, template, source);
    case "decimal":
      return renderDecimal(fact, template, source);
    case "text":
      return renderText(fact, template, source);
    case "date":
      return renderDate(fact, template, source);
    case "membership":
      return renderMembership(fact, template, source);
    default:
      return null;
  }
}

async function loadUsedFactIds(
  supabase: RetoPrizeAdminClient,
  sessionId: string
): Promise<
  | { ok: true; ids: Set<string> }
  | { ok: false; reason: "unavailable" }
> {
  const { data, error } = await supabase
    .from("reto_prize_question_instances")
    .select("fact_id")
    .eq("session_id", sessionId)
    .limit(100);

  if (error) {
    console.error("[reto-prize-question-engine] used fact lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const id = String((row as JsonObject)?.fact_id ?? "").trim();
    if (isUuid(id)) ids.add(id);
  }

  return { ok: true, ids };
}

const FACT_SCAN_PAGE_SIZE = 500;
const FACT_SCAN_MAX_ROWS = 5000;
const TEMPLATE_SCAN_PAGE_SIZE = 200;
const TEMPLATE_SCAN_MAX_ROWS = 1000;

async function countEligibleFacts(
  supabase: RetoPrizeAdminClient,
  source: RetoPrizeQuestionSource,
  nowIso: string
): Promise<
  | { ok: true; count: number }
  | { ok: false; reason: "unavailable" }
> {
  const countResult = await supabase
    .from("reto_knowledge_facts")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true)
    .eq("review_status", "approved")
    .eq("lang", "es")
    .contains("eligible_sources", [source])
    .or(`valid_from.is.null,valid_from.lte.${nowIso}`)
    .or(`valid_until.is.null,valid_until.gt.${nowIso}`);

  if (countResult.error) {
    console.error("[reto-prize-question-engine] fact count failed");
    return { ok: false, reason: "unavailable" };
  }

  const count = Number(countResult.count ?? 0);
  if (!Number.isInteger(count) || count < 0) {
    console.error("[reto-prize-question-engine] invalid fact count");
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, count };
}

async function loadEligibleFactRange(
  supabase: RetoPrizeAdminClient,
  source: RetoPrizeQuestionSource,
  nowIso: string,
  from: number,
  to: number
): Promise<
  | { ok: true; rows: JsonObject[] }
  | { ok: false; reason: "unavailable" }
> {
  const { data, error } = await supabase
    .from("reto_knowledge_facts")
    .select("id,fact_type,fact_data,allowed_operators,valid_from,valid_until")
    .eq("is_active", true)
    .eq("review_status", "approved")
    .eq("lang", "es")
    .contains("eligible_sources", [source])
    .or(`valid_from.is.null,valid_from.lte.${nowIso}`)
    .or(`valid_until.is.null,valid_until.gt.${nowIso}`)
    .order("id", { ascending: true })
    .range(from, to);

  if (error) {
    console.error("[reto-prize-question-engine] fact range lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  return {
    ok: true,
    rows: (data ?? []) as JsonObject[],
  };
}
type CompatibleTemplateScan = {
  templates: QuestionTemplateRow[];
  complete: boolean;
};

function compatibleTemplateCacheKey(
  source: RetoPrizeQuestionSource,
  fact: KnowledgeFactRow
) {
  return [
    source,
    fact.fact_type,
    [...fact.allowed_operators].sort().join(","),
  ].join("|");
}

async function loadRandomizedCompatibleTemplates(
  supabase: RetoPrizeAdminClient,
  source: RetoPrizeQuestionSource,
  fact: KnowledgeFactRow
): Promise<
  | { ok: true; scan: CompatibleTemplateScan }
  | { ok: false; reason: "unavailable" }
> {
  const templates: QuestionTemplateRow[] = [];
  const seenTemplateIds = new Set<string>();
  let complete = false;

  for (
    let from = 0;
    from < TEMPLATE_SCAN_MAX_ROWS;
    from += TEMPLATE_SCAN_PAGE_SIZE
  ) {
    const to = Math.min(
      from + TEMPLATE_SCAN_PAGE_SIZE - 1,
      TEMPLATE_SCAN_MAX_ROWS - 1
    );

    const { data, error } = await supabase
      .from("reto_question_templates")
      .select("id,fact_type,operator_code,config,renderer_version")
      .eq("is_active", true)
      .eq("review_status", "approved")
      .eq("fact_type", fact.fact_type)
      .in("operator_code", fact.allowed_operators)
      .eq("renderer_version", 1)
      .contains("allowed_sources", [source])
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      console.error("[reto-prize-question-engine] template lookup failed");
      return { ok: false, reason: "unavailable" };
    }

    const rows = (data ?? []) as JsonObject[];

    for (const row of rows) {
      const template = parseTemplateRow(row);
      if (
        !template ||
        template.fact_type !== fact.fact_type ||
        !fact.allowed_operators.includes(template.operator_code)
      ) {
        continue;
      }

      if (seenTemplateIds.has(template.id)) {
        console.error("[reto-prize-question-engine] duplicate template during scan");
        return { ok: false, reason: "unavailable" };
      }

      seenTemplateIds.add(template.id);
      templates.push(template);
    }

    const expectedRows = to - from + 1;
    if (rows.length < expectedRows) {
      complete = true;
      break;
    }
  }

  for (let index = templates.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index + 1);
    const current = templates[index];
    templates[index] = templates[swapIndex];
    templates[swapIndex] = current;
  }

  return {
    ok: true,
    scan: {
      templates,
      complete,
    },
  };
}
export async function generateRetoPrizeQuestion(
  supabase: RetoPrizeAdminClient,
  sessionId: string,
  source: RetoPrizeQuestionSource
): Promise<
  | { ok: true; question: GeneratedRetoPrizeQuestion | null }
  | { ok: false; reason: "unavailable" | "invalid_state" }
> {
  if (!isUuid(sessionId) || !safeSource(source)) {
    return { ok: false, reason: "invalid_state" };
  }

  const used = await loadUsedFactIds(supabase, sessionId);
  if (!used.ok) return used;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const counted = await countEligibleFacts(supabase, source, nowIso);
  if (!counted.ok) return counted;
  if (counted.count === 0) {
    return { ok: true, question: null };
  }

  const startOffset = randomInt(0, counted.count);
  const ranges: Array<[number, number]> =
    startOffset === 0
      ? [[0, counted.count - 1]]
      : [
          [startOffset, counted.count - 1],
          [0, startOffset - 1],
        ];

  const seenFactIds = new Set<string>();
  const templateCache = new Map<string, CompatibleTemplateScan>();
  let rowsScanned = 0;
  let incompleteTemplateScan = false;

  for (const [rangeStart, rangeEnd] of ranges) {
    for (
      let from = rangeStart;
      from <= rangeEnd;
      from += FACT_SCAN_PAGE_SIZE
    ) {
      const remainingBudget = FACT_SCAN_MAX_ROWS - rowsScanned;
      if (remainingBudget <= 0) {
        console.error("[reto-prize-question-engine] fact scan safety limit reached");
        return { ok: false, reason: "unavailable" };
      }

      const to = Math.min(
        from + FACT_SCAN_PAGE_SIZE - 1,
        rangeEnd,
        from + remainingBudget - 1
      );

      const loaded = await loadEligibleFactRange(
        supabase,
        source,
        nowIso,
        from,
        to
      );
      if (!loaded.ok) return loaded;

      const expectedRows = to - from + 1;
      if (loaded.rows.length !== expectedRows) {
        console.error("[reto-prize-question-engine] fact pool changed during scan");
        return { ok: false, reason: "unavailable" };
      }

      rowsScanned += loaded.rows.length;

      for (const row of loaded.rows) {
        const rawId = String(row.id ?? "").trim();
        if (!isUuid(rawId) || seenFactIds.has(rawId)) {
          console.error("[reto-prize-question-engine] invalid fact scan identity");
          return { ok: false, reason: "unavailable" };
        }
        seenFactIds.add(rawId);

        const fact = parseFactRow(row);
        if (!fact || used.ids.has(fact.id) || !activeAt(fact, nowMs)) {
          continue;
        }

        const cacheKey = compatibleTemplateCacheKey(source, fact);
        let templateScan = templateCache.get(cacheKey);

        if (!templateScan) {
          const loadedTemplates = await loadRandomizedCompatibleTemplates(
            supabase,
            source,
            fact
          );
          if (!loadedTemplates.ok) return loadedTemplates;
          templateScan = loadedTemplates.scan;
          templateCache.set(cacheKey, templateScan);
        }

        for (const template of templateScan.templates) {
          const generated = renderRetoPrizeQuestionV1(
            fact,
            template,
            source
          );
          if (generated) {
            return { ok: true, question: generated };
          }
        }

        if (!templateScan.complete) {
          incompleteTemplateScan = true;
        }
      }

      if (to < rangeEnd && rowsScanned >= FACT_SCAN_MAX_ROWS) {
        console.error("[reto-prize-question-engine] fact scan safety limit reached");
        return { ok: false, reason: "unavailable" };
      }
    }
  }

  if (
    rowsScanned !== counted.count ||
    seenFactIds.size !== counted.count
  ) {
    console.error("[reto-prize-question-engine] incomplete fact pool scan");
    return { ok: false, reason: "unavailable" };
  }

  if (incompleteTemplateScan) {
    console.error("[reto-prize-question-engine] incomplete template scan");
    return { ok: false, reason: "unavailable" };
  }

  return { ok: true, question: null };
}
function mapIssueError(error: unknown): RetoPrizeQuestionFailure {
  const message = isObject(error)
    ? String(error.message ?? error.details ?? "")
    : String(error ?? "");

  if (message.includes("SESSION_EXPIRED")) return "expired";

  if (
    message.includes("STATE_CONFLICT") ||
    message.includes("SESSION_NOT_ACTIVE") ||
    message.includes("STATE_INVALID") ||
    message.includes("SOURCE_MISMATCH") ||
    message.includes("ROLL_INVALID") ||
    message.includes("DEADLINE_INVALID") ||
    message.includes("POOL_DEADLINE_INVALID") ||
    message.includes("OPEN_INSTANCE_CONFLICT") ||
    message.includes("FACT_ALREADY_USED")
  ) {
    return "conflict";
  }

  if (
    message.includes("FACT_NOT_FOUND") ||
    message.includes("FACT_NOT_ELIGIBLE") ||
    message.includes("TEMPLATE_NOT_FOUND") ||
    message.includes("TEMPLATE_NOT_ELIGIBLE")
  ) {
    return "invalid_state";
  }

  return "unavailable";
}

export async function loadStoredRetoPrizeQuestion(
  supabase: RetoPrizeAdminClient,
  args: {
    sessionId: string;
    instanceId: string;
    source: RetoPrizeQuestionSource;
    expectedStateVersion: number;
  }
): Promise<
  | { ok: true; question: StoredRetoPrizeQuestion | null }
  | { ok: false; reason: "unavailable" | "invalid_state" }
> {
  if (
    !isUuid(args.sessionId) ||
    !isUuid(args.instanceId) ||
    !safeSource(args.source) ||
    !Number.isInteger(args.expectedStateVersion) ||
    args.expectedStateVersion <= 0
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const { data, error } = await supabase
    .from("reto_prize_question_instances")
    .select(
      "id,session_id,source,question_text,expires_at,answered_at,issued_state_version"
    )
    .eq("id", args.instanceId)
    .eq("session_id", args.sessionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[reto-prize-question-engine] stored instance lookup failed");
    return { ok: false, reason: "unavailable" };
  }

  if (!data) return { ok: true, question: null };

  const row = data as JsonObject;
  const id = String(row.id ?? "").trim();
  const sessionId = String(row.session_id ?? "").trim();
  const source = safeSource(row.source);
  const question = safeText(row.question_text, 5000);
  const expiresAt = safeIsoDateTime(row.expires_at);
  const issuedStateVersion = Number(row.issued_state_version);

  if (
    !isUuid(id) ||
    id !== args.instanceId ||
    !isUuid(sessionId) ||
    sessionId !== args.sessionId ||
    source !== args.source ||
    !question ||
    !expiresAt ||
    row.answered_at !== null ||
    !Number.isInteger(issuedStateVersion) ||
    issuedStateVersion !== args.expectedStateVersion
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  return {
    ok: true,
    question: {
      id,
      question,
      expiresAt,
      issuedStateVersion,
    },
  };
}

export function toPublicRetoPrizeQuestion(
  question: StoredRetoPrizeQuestion
): PublicRetoPrizeQuestion {
  return {
    id: question.id,
    question: question.question,
  };
}

export async function generateAndIssueRetoPrizeQuestion(
  supabase: RetoPrizeAdminClient,
  args: IssueRetoPrizeQuestionArgs
): Promise<
  | {
      ok: true;
      question: StoredRetoPrizeQuestion;
      stateVersion: number;
      poolDeadline: string | null;
      pendingRoll: number | null;
    }
  | { ok: false; reason: RetoPrizeQuestionFailure }
> {
  const source = safeSource(args.source);
  const questionDeadline = safeIsoDateTime(args.questionDeadline);
  const poolDeadline =
    args.poolDeadline === null ? null : safeIsoDateTime(args.poolDeadline);

  if (
    !isUuid(args.sessionId) ||
    !isUuid(args.participantId) ||
    !GROUP_RE.test(String(args.groupCode ?? "").trim()) ||
    !Number.isInteger(args.expectedStateVersion) ||
    args.expectedStateVersion <= 0 ||
    !source ||
    !questionDeadline ||
    (args.poolDeadline !== null && !poolDeadline) ||
    !(
      args.pendingRoll === null ||
      (Number.isInteger(args.pendingRoll) &&
        args.pendingRoll >= 1 &&
        args.pendingRoll <= 6)
    )
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  const generated = await generateRetoPrizeQuestion(
    supabase,
    args.sessionId,
    source
  );

  if (!generated.ok) return generated;
  if (!generated.question) {
    return { ok: false, reason: "pool_exhausted" };
  }

  const { data, error } = await supabase.rpc(
    "issue_reto_prize_question_atomic",
    {
      p_session_id: args.sessionId,
      p_participant_id: args.participantId,
      p_group_code: String(args.groupCode).trim(),
      p_expected_state_version: args.expectedStateVersion,
      p_source: source,
      p_fact_id: generated.question.factId,
      p_template_id: generated.question.templateId,
      p_parameters: generated.question.parameters,
      p_question_text: generated.question.questionText,
      p_correct_answer: generated.question.correctAnswer,
      p_question_deadline: questionDeadline,
      p_pool_deadline: poolDeadline,
      p_pending_roll: args.pendingRoll,
    }
  );

  if (error) {
    console.error("[reto-prize-question-engine] atomic issue failed");
    return { ok: false, reason: mapIssueError(error) };
  }

  const row = firstRpcRow(data);
  const instanceId = String(row?.instance_id ?? "").trim();
  const stateVersion = Number(row?.state_version);
  const returnedQuestionDeadline = safeIsoDateTime(row?.question_deadline);
  const returnedPoolDeadline =
    row?.pool_deadline === null || row?.pool_deadline === undefined
      ? null
      : safeIsoDateTime(row.pool_deadline);
  const returnedPendingRoll =
    row?.pending_roll === null || row?.pending_roll === undefined
      ? null
      : Number(row.pending_roll);

  if (
    !row ||
    !isUuid(instanceId) ||
    stateVersion !== args.expectedStateVersion + 1 ||
    !returnedQuestionDeadline ||
    returnedQuestionDeadline !== questionDeadline ||
    !(
      returnedPendingRoll === null ||
      (Number.isInteger(returnedPendingRoll) &&
        returnedPendingRoll >= 1 &&
        returnedPendingRoll <= 6)
    )
  ) {
    return { ok: false, reason: "invalid_state" };
  }

  if (source === "camino" && returnedPendingRoll !== args.pendingRoll) {
    return { ok: false, reason: "invalid_state" };
  }

  if (source !== "camino" && returnedPendingRoll !== null) {
    return { ok: false, reason: "invalid_state" };
  }

  if (args.poolDeadline !== null && returnedPoolDeadline !== poolDeadline) {
    return { ok: false, reason: "invalid_state" };
  }

  if (source === "camino") {
    if (returnedPoolDeadline !== null) {
      return { ok: false, reason: "invalid_state" };
    }
  } else if (!returnedPoolDeadline) {
    return { ok: false, reason: "invalid_state" };
  }

  const question: StoredRetoPrizeQuestion = {
    id: instanceId,
    question: generated.question.questionText,
    expiresAt: returnedQuestionDeadline,
    issuedStateVersion: stateVersion,
  };

  return {
    ok: true,
    question,
    stateVersion,
    poolDeadline: returnedPoolDeadline,
    pendingRoll: returnedPendingRoll,
  };
}

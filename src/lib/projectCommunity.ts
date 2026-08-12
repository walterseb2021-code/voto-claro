import "server-only";

type PublicLeader = {
  alias: string | null;
};

export type PublicProject = {
  id: string;
  name: string;
  category: string;
  objective: string;
  description: string;
  district: string;
  department: string;
  pdf_url: string | null;
  beneficiary_count: number;
  created_at: string | null;
  status: string;
  requested_budget: number | null;
  budget_category: string | null;
  minimum_supports_required: number | null;
  eligible_for_final_review: boolean | null;
  leader: PublicLeader;
};

export type PublicProjectForumPost = {
  id: string;
  content: string;
  created_at: string | null;
  participant: PublicLeader;
};

export function cleanProjectCommunityText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

export function isProjectCommunityUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value ?? "").trim()
  );
}

function safeDateString(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? raw : null;
}

function safeFiniteNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeNonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function safePositiveIntegerOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

function relationRow(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    !candidate ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    return null;
  }

  return candidate as Record<string, unknown>;
}

export function toPublicProject(row: Record<string, unknown>): PublicProject | null {
  const id = cleanProjectCommunityText(row.id, 80);
  const name = cleanProjectCommunityText(row.name, 160);
  const category = cleanProjectCommunityText(row.category, 120);
  const objective = cleanProjectCommunityText(row.objective, 2000);
  const description = cleanProjectCommunityText(row.description, 8000);
  const district = cleanProjectCommunityText(row.district, 120);
  const department = cleanProjectCommunityText(row.department, 120);
  const status = cleanProjectCommunityText(row.status, 40);

  if (!id || !name || !category || !district || !department || !status) {
    return null;
  }

  const leaderRow = relationRow(row.leader);
  const leaderAlias =
    cleanProjectCommunityText(leaderRow?.alias, 80) || null;

  const pdfUrl = cleanProjectCommunityText(row.pdf_url, 2000) || null;
  const budgetCategory =
    cleanProjectCommunityText(row.budget_category, 80) || null;

  return {
    id,
    name,
    category,
    objective,
    description,
    district,
    department,
    pdf_url: pdfUrl,
    beneficiary_count: safeNonNegativeInteger(row.beneficiary_count),
    created_at: safeDateString(row.created_at),
    status,
    requested_budget: safeFiniteNumber(row.requested_budget),
    budget_category: budgetCategory,
    minimum_supports_required: safePositiveIntegerOrNull(
      row.minimum_supports_required
    ),
    eligible_for_final_review:
      typeof row.eligible_for_final_review === "boolean"
        ? row.eligible_for_final_review
        : null,
    leader: {
      alias: leaderAlias,
    },
  };
}

export function toPublicForumPost(
  row: Record<string, unknown>
): PublicProjectForumPost | null {
  const id = cleanProjectCommunityText(row.id, 80);
  const content = String(row.content ?? "").trim().slice(0, 800);

  if (!id || !content) return null;

  const participantRow = relationRow(row.participant);
  const alias =
    cleanProjectCommunityText(participantRow?.alias, 80) || null;

  return {
    id,
    content,
    created_at: safeDateString(row.created_at),
    participant: {
      alias,
    },
  };
}

const PROJECT_FORUM_FORBIDDEN_WORDS = [
  "mierda",
  "carajo",
  "puta",
  "puto",
  "imbecil",
  "idiota",
  "cojudo",
  "cojuda",
  "pendejo",
  "pendeja",
  "verga",
  "cabron",
  "cabrona",
] as const;

export function validateProjectForumContent(value: unknown) {
  const content = String(value ?? "").trim();

  if (content.length < 5 || content.length > 800) {
    return { ok: false as const, reason: "forum_post_invalid" as const };
  }

  if (/https?:\/\/|www\./i.test(content)) {
    return { ok: false as const, reason: "forum_links_not_allowed" as const };
  }

  const normalized = content.toLowerCase();

  if (
    PROJECT_FORUM_FORBIDDEN_WORDS.some((word) => normalized.includes(word))
  ) {
    return {
      ok: false as const,
      reason: "forum_content_not_allowed" as const,
    };
  }

  return {
    ok: true as const,
    content,
  };
}

export function projectCommunityRpcMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return "";
}
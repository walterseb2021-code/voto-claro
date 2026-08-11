import "server-only";

import { randomUUID } from "node:crypto";
import {
  getParticipantSupabaseAdmin,
} from "@/lib/participantApi";

export const PROJECT_PDF_BUCKET = "project_pdfs";
export const PROJECT_MAX_PDF_BYTES = 10 * 1024 * 1024;
export const PROJECT_MAX_BUDGET = 30000;
export const PROJECT_UPLOAD_GRANT_MAX_PER_HOUR = 10;
export const PROJECT_UPLOAD_GRANT_TTL_MS = 2 * 60 * 60 * 1000;

export const PROJECT_CATEGORIES = [
  "Ambiente",
  "Educación",
  "Seguridad",
  "Salud",
  "Cultura",
  "Deporte",
  "Infraestructura",
  "Otros",
] as const;

export const PROJECT_DEPARTMENTS = [
  "Amazonas",
  "Áncash",
  "Apurímac",
  "Arequipa",
  "Ayacucho",
  "Cajamarca",
  "Callao",
  "Cusco",
  "Huancavelica",
  "Huánuco",
  "Ica",
  "Junín",
  "La Libertad",
  "Lambayeque",
  "Lima",
  "Loreto",
  "Madre de Dios",
  "Moquegua",
  "Pasco",
  "Piura",
  "Puno",
  "San Martín",
  "Tacna",
  "Tumbes",
  "Ucayali",
] as const;

export type ProjectCycleState = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  min_supports: number;
  submission_open: boolean;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function parseDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

export async function getConfiguredProjectCycle(
  supabase: ReturnType<typeof getParticipantSupabaseAdmin>
): Promise<
  | { ok: true; cycle: ProjectCycleState | null }
  | { ok: false }
> {
  const { data, error } = await supabase
    .from("project_cycles")
    .select("id,name,starts_at,ends_at,min_supports,is_active")
    .eq("is_active", true)
    .order("starts_at", { ascending: false })
    .limit(2);

  if (error) {
    console.error("[project-submission] cycle lookup failed");
    return { ok: false };
  }

  if (!data || data.length === 0) {
    return { ok: true, cycle: null };
  }

  if (data.length !== 1) {
    console.error("[project-submission] multiple active cycles detected");
    return { ok: false };
  }

  const row = data[0];
  const id = cleanText(row.id, 80);
  const name = cleanText(row.name, 160);
  const startsAt = parseDate(row.starts_at);
  const endsAt = parseDate(row.ends_at);
  const minSupports = Number(row.min_supports);

  if (
    !id ||
    !name ||
    !startsAt ||
    !endsAt ||
    endsAt.getTime() <= startsAt.getTime() ||
    !Number.isInteger(minSupports) ||
    minSupports < 1 ||
    minSupports > 1000000
  ) {
    console.error("[project-submission] invalid active cycle configuration");
    return { ok: false };
  }

  const now = Date.now();

  return {
    ok: true,
    cycle: {
      id,
      name,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      min_supports: minSupports,
      submission_open:
        now >= startsAt.getTime() && now < endsAt.getTime(),
    },
  };
}

export async function findOpenLeaderProject(
  supabase: ReturnType<typeof getParticipantSupabaseAdmin>,
  cycleId: string,
  participantId: string
) {
  const { data, error } = await supabase
    .from("projects")
    .select("id,status")
    .eq("cycle_id", cycleId)
    .eq("leader_id", participantId)
    .in("status", ["pending", "active"])
    .limit(2);

  if (error) {
    console.error("[project-submission] existing project lookup failed");
    return { ok: false as const };
  }

  if ((data?.length ?? 0) > 1) {
    console.error("[project-submission] duplicate open leader projects detected");
    return { ok: false as const };
  }

  const row = data?.[0];

  return {
    ok: true as const,
    project: row
      ? {
          id: cleanText(row.id, 80),
          status: cleanText(row.status, 40),
        }
      : null,
  };
}

export function validateProjectPdfMetadata(
  nameValue: unknown,
  typeValue: unknown,
  sizeValue: unknown
) {
  const originalName = String(nameValue ?? "").trim();
  const mimeType = String(typeValue ?? "").trim().toLowerCase();
  const fileSize = Number(sizeValue);

  const hasSafePdfExtension =
    originalName.length >= 5 &&
    originalName.length <= 255 &&
    originalName.toLowerCase().endsWith(".pdf") &&
    !/[\u0000-\u001f\u007f]/.test(originalName);

  if (
    !hasSafePdfExtension ||
    mimeType !== "application/pdf" ||
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > PROJECT_MAX_PDF_BYTES
  ) {
    return null;
  }

  return {
    size: fileSize,
    mimeType,
  };
}

export function createProjectPdfPath(participantId: string, cycleId: string) {
  return `${participantId}/${cycleId}/${randomUUID()}.pdf`;
}

export async function verifyStoredPdfSignature(
  supabase: ReturnType<typeof getParticipantSupabaseAdmin>,
  objectPath: string
) {
  const publicUrl = supabase.storage
    .from(PROJECT_PDF_BUCKET)
    .getPublicUrl(objectPath).data.publicUrl;

  if (!publicUrl) {
    console.error("[project-submission] PDF public verification URL unavailable");
    return { ok: false as const, reason: "unavailable" as const };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  let response: Response;

  try {
    response = await fetch(publicUrl, {
      method: "GET",
      headers: {
        Range: "bytes=0-7",
      },
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || controller.signal.aborted)
    ) {
      console.error("[project-submission] PDF verification timed out");
    } else {
      console.error("[project-submission] PDF verification fetch failed");
    }

    return { ok: false as const, reason: "unavailable" as const };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok || !response.body) {
    console.error("[project-submission] PDF verification response invalid");
    return { ok: false as const, reason: "unavailable" as const };
  }

  const reader = response.body.getReader();
  const prefix: number[] = [];

  try {
    while (prefix.length < 5) {
      const chunk = await reader.read();
      if (chunk.done) break;

      for (const byte of chunk.value) {
        prefix.push(byte);
        if (prefix.length >= 5) break;
      }
    }
  } catch {
    console.error("[project-submission] PDF verification stream failed");
    return { ok: false as const, reason: "unavailable" as const };
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Best-effort cancellation only.
    }
  }

  const hasPdfHeader =
    prefix.length >= 5 &&
    prefix[0] === 0x25 &&
    prefix[1] === 0x50 &&
    prefix[2] === 0x44 &&
    prefix[3] === 0x46 &&
    prefix[4] === 0x2d;

  return {
    ok: true as const,
    valid: hasPdfHeader,
  };
}

export async function cancelProjectUploadGrant(
  supabase: ReturnType<typeof getParticipantSupabaseAdmin>,
  grantId: string,
  objectPath: string
) {
  const cancelledAt = new Date().toISOString();

  const { error: cancelError } = await supabase
    .from("project_submission_upload_grants")
    .update({ cancelled_at: cancelledAt })
    .eq("id", grantId)
    .is("finalized_at", null);

  if (cancelError) {
    console.error("[project-submission] upload grant cancellation failed");
  }

  const { error: removeError } = await supabase.storage
    .from(PROJECT_PDF_BUCKET)
    .remove([objectPath]);

  if (removeError) {
    console.error("[project-submission] cancelled PDF removal failed");
  }

  return {
    cancelOk: !cancelError,
    removeOk: !removeError,
  };
}

export function validateProjectSubmissionFields(body: Record<string, unknown>) {
  const name = cleanText(body.name, 160);
  const category = cleanText(body.category, 80);
  const objective = cleanText(body.objective, 2000);
  const description = cleanText(body.description, 8000);
  const district = cleanText(body.district, 120);
  const department = cleanText(body.department, 80);
  const requestedBudget = Number(body.requested_budget);
  const dataTruthConfirmed = body.data_truth_confirmed === true;

  if (
    name.length < 3 ||
    !(PROJECT_CATEGORIES as readonly string[]).includes(category) ||
    objective.length < 10 ||
    description.length < 20 ||
    district.length < 2 ||
    !(PROJECT_DEPARTMENTS as readonly string[]).includes(department) ||
    !Number.isFinite(requestedBudget) ||
    requestedBudget <= 0 ||
    requestedBudget > PROJECT_MAX_BUDGET ||
    Math.abs(Math.round(requestedBudget * 100) - requestedBudget * 100) > 0.0001 ||
    !dataTruthConfirmed
  ) {
    return null;
  }

  const budgetCategory =
    requestedBudget <= 10000
      ? "hasta_10000"
      : requestedBudget <= 20000
        ? "hasta_20000"
        : "hasta_30000";

  return {
    name,
    category,
    objective,
    description,
    district,
    department,
    requestedBudget,
    budgetCategory,
    dataTruthConfirmed,
  };
}
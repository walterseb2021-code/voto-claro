import "server-only";

import { randomUUID } from "node:crypto";
import { getParticipantSupabaseAdmin } from "@/lib/participantApi";
import { verifyStoredPdfSignature } from "@/lib/projectSubmission";

export const ENTREPRENEUR_PROJECT_PDF_BUCKET = "project_pdfs";
export const ENTREPRENEUR_PROJECT_MAX_PDF_BYTES = 10 * 1024 * 1024;
export const ENTREPRENEUR_UPLOAD_GRANT_MAX_PER_HOUR = 10;
export const ENTREPRENEUR_UPLOAD_GRANT_TTL_MS = 2 * 60 * 60 * 1000;

export const ENTREPRENEUR_PROJECT_CATEGORIES = [
  "Tecnología",
  "Ventas / Comercio",
  "Inmobiliaria",
  "Construcción",
  "Turismo",
  "Ecología / Medio Ambiente",
  "Agroindustria",
  "Servicios",
  "Otros",
] as const;

export const ENTREPRENEUR_PROJECT_DEPARTMENTS = [
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PDF_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;

type ParticipantAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;

type OptionalPositiveIntegerResult =
  | { ok: true; value: number | null }
  | { ok: false };

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);
}

function parseOptionalPositiveInteger(
  value: unknown
): OptionalPositiveIntegerResult {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: null };
  }

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 2147483647
  ) {
    return { ok: false };
  }

  return { ok: true, value };
}

export function isEntrepreneurUuid(value: unknown) {
  return UUID_RE.test(String(value ?? "").trim());
}

export type EntrepreneurAffiliateStatus =
  | "missing"
  | "verified"
  | "inactive"
  | "identity_mismatch";

function normalizeEntrepreneurDni(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export async function resolveEntrepreneurAffiliate(
  supabase: ParticipantAdminClient,
  participantId: string
) {
  const cleanParticipantId = String(participantId ?? "").trim();

  if (!UUID_RE.test(cleanParticipantId)) {
    return { ok: false as const, reason: "unavailable" as const };
  }

  const { data: participant, error: participantError } = await supabase
    .from("project_participants")
    .select("id,dni")
    .eq("id", cleanParticipantId)
    .limit(1)
    .maybeSingle();

  if (participantError || !participant?.id) {
    console.error("[entrepreneur-project] participant identity lookup failed");
    return { ok: false as const, reason: "unavailable" as const };
  }

  const participantDni = normalizeEntrepreneurDni(participant.dni);

  if (!/^\d{8}$/.test(participantDni)) {
    console.error("[entrepreneur-project] participant DNI is invalid");
    return {
      ok: true as const,
      status: "identity_mismatch" as const,
      affiliate: null,
    };
  }

  const { data: affiliates, error: affiliateError } = await supabase
    .from("espacio_afiliados")
    .select("id,dni,is_active,verified_at,created_at")
    .eq("participant_id", cleanParticipantId)
    .order("created_at", { ascending: true })
    .limit(2);

  if (affiliateError) {
    console.error("[entrepreneur-project] affiliate identity lookup failed");
    return { ok: false as const, reason: "unavailable" as const };
  }

  if ((affiliates?.length ?? 0) > 1) {
    console.error("[entrepreneur-project] duplicate participant affiliations");
    return { ok: false as const, reason: "unavailable" as const };
  }

  const affiliate = affiliates?.[0] ?? null;

  if (!affiliate) {
    return {
      ok: true as const,
      status: "missing" as const,
      affiliate: null,
    };
  }

  if (affiliate.is_active !== true) {
    return {
      ok: true as const,
      status: "inactive" as const,
      affiliate: null,
    };
  }

  const affiliateDni = normalizeEntrepreneurDni(affiliate.dni);

  if (!/^\d{8}$/.test(affiliateDni) || affiliateDni !== participantDni) {
    console.error("[entrepreneur-project] participant/affiliate DNI mismatch");
    return {
      ok: true as const,
      status: "identity_mismatch" as const,
      affiliate: null,
    };
  }

  return {
    ok: true as const,
    status: "verified" as const,
    affiliate: {
      id: String(affiliate.id),
      is_active: true as const,
      verified_at:
        typeof affiliate.verified_at === "string"
          ? affiliate.verified_at
          : null,
    },
  };
}

export function validateEntrepreneurPdfMetadata(
  fileNameValue: unknown,
  fileTypeValue: unknown,
  fileSizeValue: unknown
) {
  const fileName = String(fileNameValue ?? "").trim();
  const fileType = String(fileTypeValue ?? "").trim().toLowerCase();
  const fileSize = Number(fileSizeValue);

  if (
    !fileName ||
    fileName.length > 255 ||
    !fileName.toLowerCase().endsWith(".pdf") ||
    /[\u0000-\u001f\u007f]/.test(fileName) ||
    fileType !== "application/pdf" ||
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > ENTREPRENEUR_PROJECT_MAX_PDF_BYTES
  ) {
    return null;
  }

  return {
    size: fileSize,
    mimeType: "application/pdf" as const,
  };
}

export function createEntrepreneurPdfPath(participantId: string) {
  const cleanParticipantId = String(participantId ?? "").trim();

  if (!UUID_RE.test(cleanParticipantId)) {
    throw new Error("Invalid participant id.");
  }

  return `espacio-emprendedor-secure/${cleanParticipantId}/${randomUUID()}.pdf`;
}

export function parseOwnedEntrepreneurPdfPath(
  value: unknown,
  participantId: string
) {
  const objectPath = String(value ?? "").trim();
  const cleanParticipantId = String(participantId ?? "").trim();

  if (!UUID_RE.test(cleanParticipantId)) {
    return null;
  }

  const prefix = `espacio-emprendedor-secure/${cleanParticipantId}/`;

  if (!objectPath.startsWith(prefix)) {
    return null;
  }

  const fileName = objectPath.slice(prefix.length);

  if (!PDF_NAME_RE.test(fileName)) {
    return null;
  }

  return {
    objectPath,
    folder: prefix.slice(0, -1),
    fileName,
  };
}

export function validateEntrepreneurProjectFields(
  body: Record<string, unknown>
) {
  const title = cleanText(body.title, 300);
  const category = cleanText(body.category, 120);
  const department = cleanText(body.department, 120);
  const province = cleanText(body.province, 120) || null;
  const district = cleanText(body.district, 120);
  const summary = cleanText(body.summary, 5000);
  const investmentMin = parseOptionalPositiveInteger(body.investment_min);
  const investmentMax = parseOptionalPositiveInteger(body.investment_max);
  const dataTruthConfirmed = body.data_truth_confirmed === true;

  if (
    title.length < 5 ||
    !(ENTREPRENEUR_PROJECT_CATEGORIES as readonly string[]).includes(
      category
    ) ||
    !(ENTREPRENEUR_PROJECT_DEPARTMENTS as readonly string[]).includes(
      department
    ) ||
    district.length < 1 ||
    summary.length < 40 ||
    !investmentMin.ok ||
    !investmentMax.ok ||
    (investmentMin.value !== null &&
      investmentMax.value !== null &&
      investmentMax.value < investmentMin.value) ||
    !dataTruthConfirmed
  ) {
    return null;
  }

  return {
    title,
    category,
    department,
    province,
    district,
    summary,
    investmentMin: investmentMin.value,
    investmentMax: investmentMax.value,
    dataTruthConfirmed,
  };
}

export async function verifyEntrepreneurPdfObject(
  supabase: ParticipantAdminClient,
  objectPath: string,
  participantId: string,
  expectedSize: number
) {
  const parsed = parseOwnedEntrepreneurPdfPath(objectPath, participantId);

  if (!parsed) {
    return { ok: false as const, reason: "invalid" as const };
  }

  if (
    !Number.isSafeInteger(expectedSize) ||
    expectedSize <= 0 ||
    expectedSize > ENTREPRENEUR_PROJECT_MAX_PDF_BYTES
  ) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const { data, error } = await supabase.storage
    .from(ENTREPRENEUR_PROJECT_PDF_BUCKET)
    .list(parsed.folder, {
      limit: 10,
      offset: 0,
      search: parsed.fileName,
    });

  if (error) {
    console.error("[entrepreneur-project] storage metadata lookup failed");
    return { ok: false as const, reason: "unavailable" as const };
  }

  const exact = (data ?? []).find(
    (item) => item.id !== null && item.name === parsed.fileName
  );

  if (!exact) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const metadata =
    exact.metadata && typeof exact.metadata === "object"
      ? (exact.metadata as Record<string, unknown>)
      : null;

  const uploadedSize = Number(metadata?.size);
  const uploadedMime = String(
    metadata?.mimetype ?? metadata?.contentType ?? ""
  )
    .trim()
    .toLowerCase();

  if (
    !Number.isSafeInteger(uploadedSize) ||
    uploadedSize !== expectedSize ||
    uploadedSize <= 0 ||
    uploadedSize > ENTREPRENEUR_PROJECT_MAX_PDF_BYTES ||
    uploadedMime !== "application/pdf"
  ) {
    return { ok: false as const, reason: "invalid" as const };
  }

  const signature = await verifyStoredPdfSignature(supabase, objectPath);

  if (!signature.ok) {
    return { ok: false as const, reason: "unavailable" as const };
  }

  if (!signature.valid) {
    return { ok: false as const, reason: "invalid" as const };
  }

  return { ok: true as const };
}

export function getEntrepreneurPdfPublicUrl(
  supabase: ParticipantAdminClient,
  objectPath: string
) {
  const publicUrl = supabase.storage
    .from(ENTREPRENEUR_PROJECT_PDF_BUCKET)
    .getPublicUrl(objectPath).data.publicUrl;

  if (typeof publicUrl !== "string" || !publicUrl) {
    return null;
  }

  try {
    const parsed = new URL(publicUrl);
    const expectedSuffix =
      `/storage/v1/object/public/${ENTREPRENEUR_PROJECT_PDF_BUCKET}/` +
      objectPath;

    if (
      parsed.protocol !== "https:" ||
      !parsed.pathname.endsWith(expectedSuffix)
    ) {
      return null;
    }

    return publicUrl;
  } catch {
    return null;
  }
}

export async function cancelEntrepreneurUploadGrant(
  supabase: ParticipantAdminClient,
  grantId: string,
  objectPath: string
) {
  const cancelledAt = new Date().toISOString();

  const { error: cancelError } = await supabase
    .from("espacio_project_upload_grants")
    .update({ cancelled_at: cancelledAt })
    .eq("id", grantId)
    .is("finalized_at", null)
    .is("project_id", null);

  if (cancelError) {
    console.error("[entrepreneur-project] upload grant cancellation failed");
  }

  const { error: removeError } = await supabase.storage
    .from(ENTREPRENEUR_PROJECT_PDF_BUCKET)
    .remove([objectPath]);

  if (removeError) {
    console.error("[entrepreneur-project] cancelled PDF removal failed");
  }

  return {
    cancelOk: !cancelError,
    removeOk: !removeError,
  };
}
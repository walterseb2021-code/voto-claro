import "server-only";

import { randomUUID } from "node:crypto";
import { getParticipantSupabaseAdmin } from "@/lib/participantApi";
import { verifyStoredPdfSignature } from "@/lib/projectSubmission";

export const PROFESSIONAL_PDF_BUCKET = "project_pdfs";
export const PROFESSIONAL_MAX_PDF_BYTES = 10 * 1024 * 1024;

const PROFESSIONAL_PDF_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i;

type ParticipantAdminClient = ReturnType<typeof getParticipantSupabaseAdmin>;

export function validateProfessionalPdfMetadata(
  fileNameValue: unknown,
  fileTypeValue: unknown,
  fileSizeValue: unknown
) {
  const fileName = String(fileNameValue ?? "").trim();
  const fileType = String(fileTypeValue ?? "").trim().toLowerCase();
  const fileSize = Number(fileSizeValue);

  if (
    !fileName ||
    fileName.length > 220 ||
    !fileName.toLowerCase().endsWith(".pdf") ||
    fileType !== "application/pdf" ||
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > PROFESSIONAL_MAX_PDF_BYTES
  ) {
    return null;
  }

  return { fileName, fileType, fileSize };
}

export function createProfessionalPdfPath(participantId: string) {
  const id = String(participantId ?? "").trim();

  if (!id) {
    throw new Error("Invalid participant id.");
  }

  return `profesionales/${id}/${randomUUID()}.pdf`;
}

export function parseOwnedProfessionalPdfPath(
  value: unknown,
  participantId: string
) {
  const objectPath = String(value ?? "").trim();
  const prefix = `profesionales/${participantId}/`;

  if (!objectPath.startsWith(prefix)) {
    return null;
  }

  const fileName = objectPath.slice(prefix.length);

  if (!PROFESSIONAL_PDF_NAME_RE.test(fileName)) {
    return null;
  }

  return {
    objectPath,
    folder: prefix.slice(0, -1),
    fileName,
  };
}

export async function removeProfessionalPdfObject(
  supabase: ParticipantAdminClient,
  objectPath: string
) {
  const { error } = await supabase.storage
    .from(PROFESSIONAL_PDF_BUCKET)
    .remove([objectPath]);

  if (error) {
    console.error("[professional-pdf] cleanup failed");
    return false;
  }

  return true;
}

export async function verifyProfessionalPdfObject(
  supabase: ParticipantAdminClient,
  objectPath: string,
  participantId: string
) {
  const parsed = parseOwnedProfessionalPdfPath(objectPath, participantId);

  if (!parsed) {
    return { ok: false as const, reason: "path_invalid" as const };
  }

  const { data, error } = await supabase.storage
    .from(PROFESSIONAL_PDF_BUCKET)
    .list(parsed.folder, {
      limit: 10,
      offset: 0,
      search: parsed.fileName,
    });

  if (error) {
    console.error("[professional-pdf] object lookup failed");
    return { ok: false as const, reason: "lookup_failed" as const };
  }

  const exact = (data ?? []).find(
    (item) => item.id !== null && item.name === parsed.fileName
  );

  if (!exact) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const metadata =
    exact.metadata && typeof exact.metadata === "object"
      ? (exact.metadata as Record<string, unknown>)
      : null;

  const size = Number(metadata?.size);
  const mimeType = String(metadata?.mimetype ?? metadata?.contentType ?? "")
    .trim()
    .toLowerCase();

  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > PROFESSIONAL_MAX_PDF_BYTES
  ) {
    return { ok: false as const, reason: "size_invalid" as const };
  }

  if (mimeType !== "application/pdf") {
    return { ok: false as const, reason: "mime_invalid" as const };
  }

  const signatureCheck = await verifyStoredPdfSignature(supabase, objectPath);

  if (!signatureCheck.ok) {
    return { ok: false as const, reason: "signature_unavailable" as const };
  }

  if (!signatureCheck.valid) {
    return { ok: false as const, reason: "signature_invalid" as const };
  }

  return { ok: true as const };
}

export function getProfessionalPdfPublicUrl(
  supabase: ParticipantAdminClient,
  objectPath: string
) {
  const publicUrl = supabase.storage
    .from(PROFESSIONAL_PDF_BUCKET)
    .getPublicUrl(objectPath).data.publicUrl;

  return typeof publicUrl === "string" && publicUrl.startsWith("http")
    ? publicUrl
    : null;
}

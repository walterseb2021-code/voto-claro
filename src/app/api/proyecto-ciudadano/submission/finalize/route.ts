import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  cancelProjectUploadGrant,
  PROJECT_MAX_PDF_BYTES,
  PROJECT_PDF_BUCKET,
  validateProjectSubmissionFields,
  verifyStoredPdfSignature,
} from "@/lib/projectSubmission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16384;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getStorageFolderAndName(path: string) {
  const parts = path.split("/");
  if (parts.length !== 3) return null;

  const [participantId, cycleId, fileName] = parts;
  if (
    !UUID_RE.test(participantId) ||
    !UUID_RE.test(cycleId) ||
    !/^[0-9a-f-]{36}\.pdf$/i.test(fileName)
  ) {
    return null;
  }

  return {
    folder: `${participantId}/${cycleId}`,
    fileName,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantError(403, "origin_invalid");
    }

    const auth = await resolveParticipantSession(req);
    if (!auth.ok) {
      return participantError(
        auth.reason === "unauthenticated" ? 401 : 503,
        auth.reason === "unauthenticated"
          ? "participant_session_required"
          : "submission_unavailable"
      );
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);
    if (!body) {
      return participantError(400, "request_invalid");
    }

    const uploadGrantId = String(body.upload_grant_id ?? "").trim();
    if (!UUID_RE.test(uploadGrantId)) {
      return participantError(400, "request_invalid");
    }

    const fields = validateProjectSubmissionFields(body);
    if (!fields) {
      return participantError(400, "request_invalid");
    }

    const { data: grant, error: grantError } = await auth.supabase
      .from("project_submission_upload_grants")
      .select(
        "id,participant_id,cycle_id,object_path,expected_size,expected_mime,expires_at,finalized_at,cancelled_at"
      )
      .eq("id", uploadGrantId)
      .eq("participant_id", auth.participant.id)
      .limit(1)
      .maybeSingle();

    if (grantError) {
      console.error("[project-submission-finalize] grant lookup failed");
      return participantError(503, "submission_unavailable");
    }

    const grantExpiry = new Date(String(grant?.expires_at ?? ""));
    const grantValid =
      Boolean(grant?.id) &&
      grant?.finalized_at === null &&
      grant?.cancelled_at === null &&
      Number.isFinite(grantExpiry.getTime()) &&
      grantExpiry.getTime() > Date.now() &&
      Number.isSafeInteger(Number(grant?.expected_size)) &&
      Number(grant?.expected_size) > 0 &&
      Number(grant?.expected_size) <= PROJECT_MAX_PDF_BYTES &&
      grant?.expected_mime === "application/pdf";

    if (!grantValid) {
      return participantError(409, "upload_grant_invalid");
    }

    const objectPath = String(grant!.object_path ?? "");
    const pathParts = getStorageFolderAndName(objectPath);

    if (
      !pathParts ||
      !objectPath.startsWith(
        `${auth.participant.id}/${grant!.cycle_id}/`
      )
    ) {
      console.error("[project-submission-finalize] unsafe grant object path");
      return participantError(503, "submission_unavailable");
    }

    const { data: objects, error: storageError } = await auth.supabase.storage
      .from(PROJECT_PDF_BUCKET)
      .list(pathParts.folder, {
        limit: 10,
        offset: 0,
        search: pathParts.fileName,
      });

    if (storageError) {
      console.error("[project-submission-finalize] storage metadata lookup failed");
      return participantError(503, "submission_unavailable");
    }

    const uploaded = (objects ?? []).find(
      (item) => item.id !== null && item.name === pathParts.fileName
    );

    const uploadedSize = Number(uploaded?.metadata?.size);
    const uploadedMime = String(
      uploaded?.metadata?.mimetype ?? ""
    ).toLowerCase();

    if (
      !uploaded ||
      !Number.isSafeInteger(uploadedSize) ||
      uploadedSize !== Number(grant!.expected_size) ||
      uploadedMime !== "application/pdf" ||
      uploadedSize > PROJECT_MAX_PDF_BYTES
    ) {
      await cancelProjectUploadGrant(
        auth.supabase,
        uploadGrantId,
        objectPath
      );
      return participantError(409, "uploaded_pdf_invalid");
    }

    const signatureCheck = await verifyStoredPdfSignature(
      auth.supabase,
      objectPath
    );

    if (!signatureCheck.ok) {
      return participantError(503, "submission_unavailable");
    }

    if (!signatureCheck.valid) {
      await cancelProjectUploadGrant(
        auth.supabase,
        uploadGrantId,
        objectPath
      );
      return participantError(409, "uploaded_pdf_invalid");
    }

    const publicUrl = auth.supabase.storage
      .from(PROJECT_PDF_BUCKET)
      .getPublicUrl(objectPath).data.publicUrl;

    if (!publicUrl) {
      return participantError(503, "submission_unavailable");
    }

    const { data: rpcData, error: rpcError } = await auth.supabase.rpc(
      "finalize_project_submission_secure",
      {
        p_grant_id: uploadGrantId,
        p_participant_id: auth.participant.id,
        p_name: fields.name,
        p_category: fields.category,
        p_objective: fields.objective,
        p_description: fields.description,
        p_district: fields.district,
        p_department: fields.department,
        p_requested_budget: fields.requestedBudget,
        p_budget_category: fields.budgetCategory,
        p_pdf_url: publicUrl,
        p_data_truth_confirmed: fields.dataTruthConfirmed,
      }
    );

    if (rpcError) {
      const message = String(rpcError.message ?? "");

      if (
        rpcError.code === "P0001" &&
        message.includes("submission_closed")
      ) {
        return participantError(409, "submission_closed");
      }

      if (
        rpcError.code === "P0001" &&
        message.includes("participant_has_open_project")
      ) {
        return participantError(409, "participant_has_open_project");
      }

      if (
        rpcError.code === "P0001" &&
        (message.includes("upload_grant_invalid") ||
          message.includes("submission_invalid"))
      ) {
        return participantError(409, "submission_invalid");
      }

      console.error("[project-submission-finalize] finalize RPC failed");
      return participantError(503, "submission_unavailable");
    }

    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (!row?.project_id) {
      return participantError(503, "submission_unavailable");
    }

    return participantJson(201, {
      ok: true,
      project_id: row.project_id,
    });
  } catch {
    console.error("[project-submission-finalize] unexpected failure");
    return participantError(503, "submission_unavailable");
  }
}
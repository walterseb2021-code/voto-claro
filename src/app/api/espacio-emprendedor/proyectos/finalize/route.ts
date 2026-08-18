import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  cancelEntrepreneurUploadGrant,
  ENTREPRENEUR_PROJECT_MAX_PDF_BYTES,
  getEntrepreneurPdfPublicUrl,
  isEntrepreneurUuid,
  parseOwnedEntrepreneurPdfPath,
  validateEntrepreneurProjectFields,
  verifyEntrepreneurPdfObject,
} from "@/lib/entrepreneurProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16 * 1024;

function mapFinalizeRpcError(code: string, message: string) {
  if (code === "22023") {
    return participantError(400, "request_invalid");
  }

  if (code === "P0002") {
    return participantError(409, "upload_grant_invalid");
  }

  if (code === "40001") {
    return participantError(409, "finalize_conflict");
  }

  if (
    code === "P0001" &&
    message.includes("active affiliate not found")
  ) {
    return participantError(403, "affiliate_required");
  }

  if (
    code === "P0001" &&
    (message.includes("upload grant") ||
      message.includes("unexpected upload") ||
      message.includes("PDF URL"))
  ) {
    return participantError(409, "upload_grant_invalid");
  }

  return participantError(503, "finalize_unavailable");
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
          : "finalize_unavailable"
      );
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);

    if (!body) {
      return participantError(400, "request_invalid");
    }

    const uploadGrantId = String(
      body.upload_grant_id ?? ""
    ).trim();

    if (!isEntrepreneurUuid(uploadGrantId)) {
      return participantError(400, "request_invalid");
    }

    const fields = validateEntrepreneurProjectFields(body);

    if (!fields) {
      return participantError(400, "request_invalid");
    }

    const { data: grant, error: grantError } = await auth.supabase
      .from("espacio_project_upload_grants")
      .select(
        "id,participant_id,affiliate_id,object_path,expected_size,expected_mime,expires_at,finalized_at,cancelled_at,project_id"
      )
      .eq("id", uploadGrantId)
      .eq("participant_id", auth.participant.id)
      .limit(1)
      .maybeSingle();

    if (grantError) {
      console.error("[entrepreneur-project-finalize] grant lookup failed");
      return participantError(503, "finalize_unavailable");
    }

    const expiry = new Date(String(grant?.expires_at ?? ""));
    const expectedSize = Number(grant?.expected_size);

    const grantValid =
      Boolean(grant?.id) &&
      grant?.finalized_at === null &&
      grant?.cancelled_at === null &&
      grant?.project_id === null &&
      Number.isFinite(expiry.getTime()) &&
      expiry.getTime() > Date.now() &&
      Number.isSafeInteger(expectedSize) &&
      expectedSize > 0 &&
      expectedSize <= ENTREPRENEUR_PROJECT_MAX_PDF_BYTES &&
      grant?.expected_mime === "application/pdf";

    if (!grantValid) {
      return participantError(409, "upload_grant_invalid");
    }

    const objectPath = String(grant!.object_path ?? "");
    const parsedPath = parseOwnedEntrepreneurPdfPath(
      objectPath,
      auth.participant.id
    );

    if (!parsedPath) {
      console.error(
        "[entrepreneur-project-finalize] unsafe grant object path"
      );
      return participantError(503, "finalize_unavailable");
    }

    const { data: affiliate, error: affiliateError } = await auth.supabase
      .from("espacio_afiliados")
      .select("id,is_active")
      .eq("id", grant!.affiliate_id)
      .eq("participant_id", auth.participant.id)
      .limit(1)
      .maybeSingle();

    if (affiliateError) {
      console.error(
        "[entrepreneur-project-finalize] affiliate lookup failed"
      );
      return participantError(503, "finalize_unavailable");
    }

    if (!affiliate || affiliate.is_active !== true) {
      return participantError(403, "affiliate_required");
    }

    const verified = await verifyEntrepreneurPdfObject(
      auth.supabase,
      objectPath,
      auth.participant.id,
      expectedSize
    );

    if (!verified.ok) {
      if (verified.reason === "invalid") {
        await cancelEntrepreneurUploadGrant(
          auth.supabase,
          uploadGrantId,
          objectPath
        );

        return participantError(409, "uploaded_pdf_invalid");
      }

      return participantError(503, "finalize_unavailable");
    }

    const publicUrl = getEntrepreneurPdfPublicUrl(
      auth.supabase,
      objectPath
    );

    if (!publicUrl) {
      console.error(
        "[entrepreneur-project-finalize] public URL unavailable"
      );
      return participantError(503, "finalize_unavailable");
    }

    const { data: rpcData, error: rpcError } = await auth.supabase.rpc(
      "finalize_espacio_project_secure",
      {
        p_grant_id: uploadGrantId,
        p_participant_id: auth.participant.id,
        p_title: fields.title,
        p_category: fields.category,
        p_department: fields.department,
        p_province: fields.province,
        p_district: fields.district,
        p_summary: fields.summary,
        p_investment_min: fields.investmentMin,
        p_investment_max: fields.investmentMax,
        p_pdf_url: publicUrl,
        p_data_truth_confirmed: fields.dataTruthConfirmed,
      }
    );

    if (rpcError) {
      console.error(
        "[entrepreneur-project-finalize] secure RPC failed"
      );
      return mapFinalizeRpcError(
        String(rpcError.code ?? ""),
        String(rpcError.message ?? "")
      );
    }

    const projectId =
      typeof rpcData === "string"
        ? rpcData.trim()
        : "";

    if (!isEntrepreneurUuid(projectId)) {
      console.error(
        "[entrepreneur-project-finalize] invalid RPC result"
      );
      return participantError(503, "finalize_unavailable");
    }

    return participantJson(201, {
      ok: true,
      project_id: projectId,
    });
  } catch {
    console.error("[entrepreneur-project-finalize] unexpected failure");
    return participantError(503, "finalize_unavailable");
  }
}
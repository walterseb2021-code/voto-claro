import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  createEntrepreneurPdfPath,
  ENTREPRENEUR_PROJECT_MAX_PDF_BYTES,
  ENTREPRENEUR_PROJECT_PDF_BUCKET,
  ENTREPRENEUR_UPLOAD_GRANT_MAX_PER_HOUR,
  ENTREPRENEUR_UPLOAD_GRANT_TTL_MS,
  validateEntrepreneurPdfMetadata,
} from "@/lib/entrepreneurProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

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
          : "upload_unavailable"
      );
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);

    if (!body) {
      return participantError(400, "request_invalid");
    }

    const file = validateEntrepreneurPdfMetadata(
      body.file_name,
      body.file_type,
      body.file_size
    );

    if (!file) {
      return participantError(400, "pdf_invalid");
    }

    const { data: affiliates, error: affiliateError } = await auth.supabase
      .from("espacio_afiliados")
      .select("id,is_active")
      .eq("participant_id", auth.participant.id)
      .order("created_at", { ascending: true })
      .limit(2);

    if (affiliateError) {
      console.error("[entrepreneur-project-upload] affiliate lookup failed");
      return participantError(503, "upload_unavailable");
    }

    if ((affiliates?.length ?? 0) > 1) {
      console.error(
        "[entrepreneur-project-upload] duplicate participant affiliations"
      );
      return participantError(503, "upload_unavailable");
    }

    const affiliate = affiliates?.[0] ?? null;

    if (!affiliate) {
      return participantError(403, "affiliate_required");
    }

    if (affiliate.is_active !== true) {
      return participantError(403, "affiliate_inactive");
    }

    const oneHourAgo = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();

    const { count, error: rateError } = await auth.supabase
      .from("espacio_project_upload_grants")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", auth.participant.id)
      .gte("created_at", oneHourAgo);

    if (rateError) {
      console.error("[entrepreneur-project-upload] grant rate lookup failed");
      return participantError(503, "upload_unavailable");
    }

    if ((count ?? 0) >= ENTREPRENEUR_UPLOAD_GRANT_MAX_PER_HOUR) {
      return participantError(429, "upload_rate_limited");
    }

    const objectPath = createEntrepreneurPdfPath(auth.participant.id);
    const expiresAt = new Date(
      Date.now() + ENTREPRENEUR_UPLOAD_GRANT_TTL_MS
    ).toISOString();

    const { data: grant, error: grantError } = await auth.supabase
      .from("espacio_project_upload_grants")
      .insert({
        participant_id: auth.participant.id,
        affiliate_id: affiliate.id,
        object_path: objectPath,
        expected_size: file.size,
        expected_mime: file.mimeType,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (grantError || !grant?.id) {
      console.error("[entrepreneur-project-upload] grant insert failed");
      return participantError(503, "upload_unavailable");
    }

    const { data: signedData, error: signedError } =
      await auth.supabase.storage
        .from(ENTREPRENEUR_PROJECT_PDF_BUCKET)
        .createSignedUploadUrl(objectPath, {
          upsert: false,
        });

    const signedToken =
      typeof signedData?.token === "string"
        ? signedData.token.trim()
        : "";

    const signedPath =
      typeof signedData?.path === "string"
        ? signedData.path.trim()
        : "";

    if (
      signedError ||
      !signedToken ||
      signedPath !== objectPath
    ) {
      console.error(
        "[entrepreneur-project-upload] signed upload creation failed"
      );

      await auth.supabase
        .from("espacio_project_upload_grants")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", grant.id)
        .is("finalized_at", null)
        .is("project_id", null);

      return participantError(503, "upload_unavailable");
    }

    return participantJson(200, {
      ok: true,
      upload_grant_id: grant.id,
      path: objectPath,
      token: signedToken,
      expires_at: expiresAt,
      max_pdf_size_bytes: ENTREPRENEUR_PROJECT_MAX_PDF_BYTES,
    });
  } catch {
    console.error("[entrepreneur-project-upload] unexpected failure");
    return participantError(503, "upload_unavailable");
  }
}
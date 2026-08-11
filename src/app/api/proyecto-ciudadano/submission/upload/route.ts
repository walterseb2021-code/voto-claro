import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  createProjectPdfPath,
  findOpenLeaderProject,
  getConfiguredProjectCycle,
  PROJECT_PDF_BUCKET,
  PROJECT_UPLOAD_GRANT_MAX_PER_HOUR,
  PROJECT_UPLOAD_GRANT_TTL_MS,
  validateProjectPdfMetadata,
} from "@/lib/projectSubmission";

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

    const file = validateProjectPdfMetadata(
      body.file_name,
      body.file_type,
      body.file_size
    );

    if (!file) {
      return participantError(400, "pdf_invalid");
    }

    const cycleResult = await getConfiguredProjectCycle(auth.supabase);
    if (!cycleResult.ok) {
      return participantError(503, "upload_unavailable");
    }

    const cycle = cycleResult.cycle;
    if (!cycle || !cycle.submission_open) {
      return participantError(409, "submission_closed");
    }

    const existingResult = await findOpenLeaderProject(
      auth.supabase,
      cycle.id,
      auth.participant.id
    );

    if (!existingResult.ok) {
      return participantError(503, "upload_unavailable");
    }

    if (existingResult.project) {
      return participantError(409, "participant_has_open_project");
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: rateError } = await auth.supabase
      .from("project_submission_upload_grants")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", auth.participant.id)
      .gte("created_at", oneHourAgo);

    if (rateError) {
      console.error("[project-submission-upload] grant rate lookup failed");
      return participantError(503, "upload_unavailable");
    }

    if ((count ?? 0) >= PROJECT_UPLOAD_GRANT_MAX_PER_HOUR) {
      return participantError(429, "upload_rate_limited");
    }

    const objectPath = createProjectPdfPath(
      auth.participant.id,
      cycle.id
    );
    const expiresAt = new Date(
      Date.now() + PROJECT_UPLOAD_GRANT_TTL_MS
    ).toISOString();

    const { data: grant, error: grantError } = await auth.supabase
      .from("project_submission_upload_grants")
      .insert({
        participant_id: auth.participant.id,
        cycle_id: cycle.id,
        object_path: objectPath,
        expected_size: file.size,
        expected_mime: file.mimeType,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (grantError || !grant?.id) {
      console.error("[project-submission-upload] grant insert failed");
      return participantError(503, "upload_unavailable");
    }

    const { data: signedData, error: signedError } = await auth.supabase.storage
      .from(PROJECT_PDF_BUCKET)
      .createSignedUploadUrl(objectPath, {
        upsert: false,
      });

    if (signedError || !signedData?.token) {
      console.error("[project-submission-upload] signed upload creation failed");
      await auth.supabase
        .from("project_submission_upload_grants")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", grant.id)
        .is("finalized_at", null);

      return participantError(503, "upload_unavailable");
    }

    return participantJson(200, {
      ok: true,
      upload_grant_id: grant.id,
      path: objectPath,
      token: signedData.token,
      expires_at: expiresAt,
    });
  } catch {
    console.error("[project-submission-upload] unexpected failure");
    return participantError(503, "upload_unavailable");
  }
}
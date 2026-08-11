import { type NextRequest } from "next/server";
import {
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  findOpenLeaderProject,
  getConfiguredProjectCycle,
  PROJECT_MAX_BUDGET,
  PROJECT_MAX_PDF_BYTES,
} from "@/lib/projectSubmission";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await resolveParticipantSession(req);
    if (!auth.ok) {
      return participantError(
        auth.reason === "unauthenticated" ? 401 : 503,
        auth.reason === "unauthenticated"
          ? "participant_session_required"
          : "submission_unavailable"
      );
    }

    const cycleResult = await getConfiguredProjectCycle(auth.supabase);
    if (!cycleResult.ok) {
      return participantError(503, "submission_unavailable");
    }

    let existingProject: { id: string; status: string } | null = null;

    if (cycleResult.cycle) {
      const existingResult = await findOpenLeaderProject(
        auth.supabase,
        cycleResult.cycle.id,
        auth.participant.id
      );

      if (!existingResult.ok) {
        return participantError(503, "submission_unavailable");
      }

      existingProject = existingResult.project;
    }

    return participantJson(200, {
      ok: true,
      authenticated: true,
      participant: auth.participant,
      cycle: cycleResult.cycle,
      submission_open:
        Boolean(cycleResult.cycle?.submission_open) && !existingProject,
      existing_project: existingProject,
      max_project_budget: PROJECT_MAX_BUDGET,
      max_pdf_size_bytes: PROJECT_MAX_PDF_BYTES,
    });
  } catch {
    console.error("[project-submission-status] unexpected failure");
    return participantError(503, "submission_unavailable");
  }
}
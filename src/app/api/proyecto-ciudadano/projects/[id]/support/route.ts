import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  isProjectCommunityUuid,
  projectCommunityRpcMessage,
} from "@/lib/projectCommunity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function mapSupportFailure(message: string) {
  if (message.includes("support_already_exists")) {
    return participantError(409, "support_already_exists");
  }

  if (message.includes("participant_has_cycle_support")) {
    return participantError(409, "participant_has_cycle_support");
  }

  if (message.includes("support_closed")) {
    return participantError(409, "support_closed");
  }

  if (message.includes("participant_not_available")) {
    return participantError(403, "participant_not_available");
  }

  if (message.includes("project_not_available")) {
    return participantError(404, "project_not_available");
  }

  if (
    message.includes("support_invalid") ||
    message.includes("project_configuration_invalid")
  ) {
    return participantError(400, "support_invalid");
  }

  return participantError(503, "support_unavailable");
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    if (!isAllowedParticipantMutationOrigin(req)) {
      return participantError(403, "origin_invalid");
    }

    const { id } = await context.params;
    const projectId = String(id ?? "").trim();

    if (!isProjectCommunityUuid(projectId)) {
      return participantError(400, "project_id_invalid");
    }

    const auth = await resolveParticipantSession(req);

    if (!auth.ok) {
      return auth.reason === "unauthenticated"
        ? participantError(401, "participant_session_required")
        : participantError(503, "support_unavailable");
    }

    const { data, error } = await auth.supabase.rpc(
      "support_project_secure",
      {
        p_project_id: projectId,
        p_participant_id: auth.participant.id,
      }
    );

    if (error) {
      console.error("[project-community-support] secure RPC failed");
      return mapSupportFailure(projectCommunityRpcMessage(error));
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row?.result_project_id) {
      console.error("[project-community-support] secure RPC returned no row");
      return participantError(503, "support_unavailable");
    }

    return participantJson(201, {
      ok: true,
      project_id: row.result_project_id,
      beneficiary_count: Number(row.result_beneficiary_count ?? 0),
      minimum_supports_required: Number(
        row.result_minimum_supports_required ?? 0
      ),
      eligible_for_final_review: Boolean(
        row.result_eligible_for_final_review
      ),
    });
  } catch {
    console.error("[project-community-support] unexpected failure");
    return participantError(503, "support_unavailable");
  }
}
import { type NextRequest } from "next/server";
import {
  isAllowedParticipantMutationOrigin,
  participantError,
  participantJson,
  readBoundedJsonObject,
} from "@/lib/participantApi";
import { resolveParticipantSession } from "@/lib/participantSessionAuth";
import {
  isProjectCommunityUuid,
  projectCommunityRpcMessage,
  validateProjectForumContent,
} from "@/lib/projectCommunity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 2048;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function mapForumFailure(message: string) {
  if (message.includes("forum_links_not_allowed")) {
    return participantError(400, "forum_links_not_allowed");
  }

  if (message.includes("forum_content_not_allowed")) {
    return participantError(400, "forum_content_not_allowed");
  }

  if (message.includes("forum_post_invalid")) {
    return participantError(400, "forum_post_invalid");
  }

  if (message.includes("forum_flood_blocked")) {
    return participantError(429, "forum_flood_blocked");
  }

  if (message.includes("forum_daily_limit_reached")) {
    return participantError(429, "forum_daily_limit_reached");
  }

  if (message.includes("participant_not_available")) {
    return participantError(403, "participant_not_available");
  }

  if (message.includes("project_not_available")) {
    return participantError(404, "project_not_available");
  }

  return participantError(503, "forum_unavailable");
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
        : participantError(503, "forum_unavailable");
    }

    const body = await readBoundedJsonObject(req, MAX_BODY_BYTES);

    if (!body) {
      return participantError(400, "forum_post_invalid");
    }

    const validated = validateProjectForumContent(body.content);

    if (!validated.ok) {
      return participantError(400, validated.reason);
    }

    const { data, error } = await auth.supabase.rpc(
      "create_project_forum_post_secure",
      {
        p_project_id: projectId,
        p_participant_id: auth.participant.id,
        p_content: validated.content,
      }
    );

    if (error) {
      console.error("[project-community-forum] secure RPC failed");
      return mapForumFailure(projectCommunityRpcMessage(error));
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row?.result_post_id) {
      console.error("[project-community-forum] secure RPC returned no row");
      return participantError(503, "forum_unavailable");
    }

    return participantJson(201, {
      ok: true,
      post: {
        id: row.result_post_id,
        content: String(row.result_content ?? validated.content),
        created_at:
          typeof row.result_created_at === "string"
            ? row.result_created_at
            : null,
        participant: {
          alias: auth.participant.alias,
        },
      },
    });
  } catch {
    console.error("[project-community-forum] unexpected failure");
    return participantError(503, "forum_unavailable");
  }
}